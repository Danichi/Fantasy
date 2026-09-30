import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import type { WorldMats } from './buildings';
import type { Door, InteriorKind } from './doors';
import type { Interactable } from '../dungeon/instance';

// Building interiors, built when you step through a door (world/doors.ts) and
// thrown away when you leave. One room sized to the house outside: plank
// floor, plastered walls with a timber frame, beams overhead, windows that
// glow with the hour outside, a hearth, and furniture by the kind of place.
// Rooms are laid out far from the world (like the dungeon) with a flat floor.
//
// Lights are borrowed from the spell pool rather than added: a new light in the
// scene makes three.js recompile every lit material, a multi-second hitch.

/** Lends pooled point lights (magic/spells.ts). */
export interface LightLender {
  borrowLight(owner: object): THREE.PointLight | null;
  returnLight(l: THREE.PointLight): void;
}

interface LightWant { pos: THREE.Vector3; color: number; intensity: number; distance: number; decay: number; fire: boolean }

// Materials outlive a visit so the next room doesn't compile them again.
let shared: { cloth: THREE.MeshStandardMaterial[]; window: THREE.MeshBasicMaterial; coals: THREE.MeshStandardMaterial; forge: THREE.MeshStandardMaterial } | null = null;
const sharedMats = () =>
  (shared ??= {
    cloth: [0x8a2f2a, 0x2f5f9a, 0x3f6f34, 0x7a3f8a, 0xb8862e].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    window: new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }),
    coals: new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff7a2a, emissiveIntensity: 1.8 }),
    forge: new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff6a10, emissiveIntensity: 2.6 }),
  });

export const INTERIOR_ORIGIN = new THREE.Vector3(-40000, 0, 0);
const H = 3.4; // wall height

export interface Seat {
  pos: THREE.Vector3;
  yaw: number;
  /** true where there's a bench or chair to sit on */
  seated: boolean;
}

export class Interior {
  readonly group = new THREE.Group();
  readonly interactables: Interactable[] = [];
  /** where you arrive, just inside the door, facing into the room */
  readonly spawn: THREE.Vector3;
  readonly spawnYaw = Math.PI;
  /** where the keeper stands (behind a counter, by the hearth...) */
  keeperSpot: Seat | null = null;
  /** places for patrons and residents */
  readonly seats: Seat[] = [];
  private colliders: RAPIER.Collider[] = [];
  private fire: { light: THREE.PointLight | null; mat: THREE.MeshStandardMaterial } | null = null;
  private wants: LightWant[] = [];
  private borrowed: THREE.PointLight[] = [];
  private windowMat: THREE.MeshBasicMaterial;
  private t = 0;
  readonly W: number;
  readonly D: number;
  private rnd: () => number;
  private cloth: THREE.MeshStandardMaterial[];

  constructor(readonly door: Door, readonly kind: InteriorKind, private scene: THREE.Scene, private m: WorldMats, onLeave: () => void, private lender?: LightLender) {
    this.rnd = mulberry32(door.spec.seed * 7 + 11);
    const big = kind === 'guild' || kind === 'hall' || kind === 'tavern';
    this.W = Math.max(big ? 9 : 6, door.spec.w - 0.6);
    this.D = Math.max(big ? 8 : 5.5, door.spec.d - 0.6);
    this.group.position.copy(INTERIOR_ORIGIN);
    scene.add(this.group);
    const sm = sharedMats();
    this.cloth = sm.cloth;
    this.windowMat = sm.window;
    this.shell();
    this.spawn = this.at(0, this.D / 2 - 1.1);
    this.furnish();
    this.lightUp();
    // The way out.
    const exit = this.at(0, this.D / 2 - 0.5);
    this.interactables.push({
      pos: exit, radius: 1.6,
      label: () => `Leave ${door.name ?? 'the house'}`,
      enabled: () => true,
      action: onLeave,
    });
  }

  /** Local room coordinates (x across, z from back to front door) to world. */
  at(x: number, z: number, y = 0) {
    return new THREE.Vector3(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.y + y, INTERIOR_ORIGIN.z + z);
  }

  /** The floor is flat: any point inside reads floor height (for heightAt). */
  groundAt = (x: number, z: number) => {
    const lx = x - INTERIOR_ORIGIN.x, lz = z - INTERIOR_ORIGIN.z;
    return Math.abs(lx) < this.W / 2 + 6 && Math.abs(lz) < this.D / 2 + 6 ? INTERIOR_ORIGIN.y : null;
  };

  // ---- building blocks ------------------------------------------------------------
  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, collide = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.colliders.push(physics.addBox(this.at(x, z, y), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))));
    return mesh;
  }
  private cyl(mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, collide = false, seg = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.colliders.push(physics.addCylinder(this.at(x, z, y), h / 2, r));
    return mesh;
  }

  private shell() {
    const { W, D, m } = this;
    // Floor, walls (thick, collide), ceiling planks and beams.
    this.box(m.planks, W, 0.2, D, 0, -0.1, 0, 0, true);
    const wallT = 0.3;
    this.box(m.plaster, W + wallT * 2, H, wallT, 0, H / 2, -D / 2 - wallT / 2, 0, true);
    this.box(m.plaster, wallT, H, D, -W / 2 - wallT / 2, H / 2, 0, 0, true);
    this.box(m.plaster, wallT, H, D, W / 2 + wallT / 2, H / 2, 0, 0, true);
    // Front wall with the door gap in the middle.
    const side = (W - 1.4) / 2;
    this.box(m.plaster, side + wallT, H, wallT, -W / 2 + side / 2 - wallT / 2, H / 2, D / 2 + wallT / 2, 0, true);
    this.box(m.plaster, side + wallT, H, wallT, W / 2 - side / 2 + wallT / 2, H / 2, D / 2 + wallT / 2, 0, true);
    this.box(m.plaster, 1.4, H - 2.3, wallT, 0, 2.3 + (H - 2.3) / 2, D / 2 + wallT / 2);
    // The door itself (closed behind you) and its frame.
    this.box(m.planks, 1.3, 2.3, 0.08, 0, 1.15, D / 2 + 0.2, 0, true);
    this.box(m.timber, 1.7, 0.18, 0.34, 0, 2.38, D / 2 + 0.05);
    this.box(m.planks, W + 0.6, 0.12, D + 0.6, 0, H + 0.06, 0);
    // Beams across, posts in the walls.
    const beams = Math.max(2, Math.round(D / 2.2));
    for (let i = 0; i < beams; i++) this.box(m.timber, W, 0.22, 0.24, 0, H - 0.15, -D / 2 + (D * (i + 0.5)) / beams);
    for (const sx of [-1, 1]) for (let i = 0; i <= 2; i++) this.box(m.timber, 0.2, H, 0.22, sx * (W / 2 - 0.02), H / 2, -D / 2 + (D * i) / 2);
    this.box(m.timber, W, 0.18, 0.2, 0, 0.09, -D / 2 + 0.08); // skirting
    // Windows on the side walls: warm light from outside.
    for (const sx of [-1, 1]) {
      for (const f of [-0.25, 0.2]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), this.windowMat);
        win.position.set(sx * (W / 2 - 0.01), 1.75, D * f);
        win.rotation.y = -sx * Math.PI / 2;
        this.group.add(win);
        this.box(m.timber, 0.12, 1.2, 1.1, sx * (W / 2 - 0.03), 1.75, D * f);
        this.box(m.timber, 0.12, 0.1, 1.0, sx * (W / 2 - 0.05), 1.75, D * f);
      }
    }
    // A soft fill so corners aren't black.
    this.wants.push({ pos: this.at(0, 0, H - 0.6), color: 0xffe2b8, intensity: 2.5, distance: Math.max(W, D) * 1.6, decay: 1.6, fire: false });
  }

  /** Borrow what the pool can spare: the fire first, then the fill. */
  private lightUp() {
    if (!this.lender) return;
    this.wants.sort((a, b) => Number(b.fire) - Number(a.fire));
    for (const w of this.wants) {
      const l = this.lender.borrowLight(this);
      if (!l) break;
      l.position.copy(w.pos);
      l.color.set(w.color);
      l.intensity = w.intensity;
      l.distance = w.distance;
      l.decay = w.decay;
      this.borrowed.push(l);
      if (w.fire && this.fire) this.fire.light = l;
    }
  }

  private hearth(x: number, z: number, ry: number, forge = false) {
    const { m } = this;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
    const add = (mesh: THREE.Mesh) => ((mesh.castShadow = mesh.receiveShadow = true), g.add(mesh), mesh);
    const stone = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m.stone));
      b.position.set(px, py, pz);
    };
    stone(2.0, 1.1, 0.9, 0, 0.55, 0);
    stone(0.4, 1.5, 0.9, -0.8, 1.85, 0);
    stone(0.4, 1.5, 0.9, 0.8, 1.85, 0);
    stone(2.2, 0.35, 1.0, 0, 2.6, 0.05);
    stone(1.2, 0.8, 0.7, 0, 3.0, -0.1);
    const coals = forge ? sharedMats().forge : sharedMats().coals;
    const fireMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.5), coals);
    fireMesh.position.set(0, 1.2, 0.05);
    g.add(fireMesh);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), m.timber);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i - 1) * 0.5;
      log.position.set(0, 1.26, 0.05);
      g.add(log);
    }
    const lp = new THREE.Vector3(0, 1.7, 0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    this.wants.push({ pos: this.at(x + lp.x, z + lp.z, lp.y), color: 0xff9a4a, intensity: forge ? 12 : 8, distance: 11, decay: 1.4, fire: true });
    this.fire = { light: null, mat: coals };
    this.colliders.push(physics.addBox(this.at(x, z, 1.5), new THREE.Vector3(1.1, 1.5, 0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))));
  }

  private table(x: number, z: number, w: number, d: number, ry = 0) {
    const { m } = this;
    this.box(m.planks, w, 0.08, d, x, 0.78, z, ry, false);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ox = lx * (w / 2 - 0.1), oz = lz * (d / 2 - 0.1);
      this.box(m.timber, 0.08, 0.74, 0.08, x + ox * c + oz * s, 0.37, z - ox * s + oz * c);
    }
    this.colliders.push(physics.addBox(this.at(x, z, 0.4), new THREE.Vector3(w / 2, 0.4, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))));
    // A few things on top.
    for (let i = 0; i < 2 + Math.floor(this.rnd() * 3); i++) {
      const px = x + (this.rnd() - 0.5) * (w - 0.3), pz = z + (this.rnd() - 0.5) * (d - 0.3);
      if (this.rnd() < 0.5) this.cyl(this.cloth[Math.floor(this.rnd() * 5)], 0.06, 0.16, px, 0.9, pz, false, 8);
      else this.cyl(this.m.stone, 0.1, 0.04, px, 0.84, pz, false, 10);
    }
  }

  private bench(x: number, z: number, len: number, ry: number) {
    const { m } = this;
    this.box(m.planks, len, 0.07, 0.34, x, 0.46, z, ry);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const lx of [-1, 1]) {
      const ox = lx * (len / 2 - 0.15);
      this.box(m.timber, 0.07, 0.43, 0.3, x + ox * c, 0.215, z - ox * s, ry);
    }
  }

  private bed(x: number, z: number, ry: number) {
    const { m } = this;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
    const part = (mat: THREE.Material, w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(px, py, pz);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    };
    part(m.timber, 1.1, 0.35, 2.1, 0, 0.18, 0);
    part(m.timber, 1.2, 0.9, 0.1, 0, 0.45, -1.05);
    part(new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 1 }), 1.0, 0.16, 1.95, 0, 0.43, 0.02);
    part(this.cloth[Math.floor(this.rnd() * 5)], 1.04, 0.1, 1.3, 0, 0.53, 0.35);
    part(new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 1 }), 0.7, 0.12, 0.35, 0, 0.56, -0.75);
    this.colliders.push(physics.addBox(this.at(x, z, 0.3), new THREE.Vector3(0.6, 0.3, 1.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))));
  }

  private shelf(x: number, z: number, ry: number, w: number, goods: 'jars' | 'bread' | 'cloth' | 'books' | 'weapons') {
    const { m } = this;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
    const part = (mat: THREE.Material, bw: number, h: number, d: number, px: number, py: number, pz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, h, d), mat);
      b.position.set(px, py, pz);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      return b;
    };
    part(m.timber, w, 2.2, 0.06, 0, 1.1, -0.2);
    for (const sx of [-1, 1]) part(m.timber, 0.08, 2.2, 0.45, sx * (w / 2), 1.1, 0);
    const colours = goods === 'bread' ? [0xc8904a, 0xb07838, 0xd8a868] : goods === 'cloth' ? [0x8a2f2a, 0x2f5f9a, 0x3f6f34, 0xc9b27a] : goods === 'books' ? [0x6a2a1e, 0x2a3f6a, 0x3a5a2a, 0x7a5a2a] : [0x3a7a5a, 0x7a3a2a, 0x3a4a8a, 0xb8a040, 0x6a3a7a];
    for (const y of [0.35, 0.95, 1.55, 2.1]) {
      part(m.planks, w - 0.1, 0.05, 0.42, 0, y - 0.03, 0);
      if (goods === 'weapons') continue;
      let px = -w / 2 + 0.2;
      while (px < w / 2 - 0.2) {
        const col = new THREE.MeshStandardMaterial({ color: colours[Math.floor(this.rnd() * colours.length)], roughness: goods === 'jars' ? 0.35 : 0.9 });
        if (goods === 'jars') {
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.2 + this.rnd() * 0.1, 10), col);
          jar.position.set(px, y + 0.12, (this.rnd() - 0.5) * 0.15);
          g.add(jar);
          px += 0.2 + this.rnd() * 0.1;
        } else if (goods === 'books') {
          const hgt = 0.22 + this.rnd() * 0.08;
          part(col, 0.06, hgt, 0.28, px, y + hgt / 2, 0);
          px += 0.07;
        } else {
          const s = goods === 'bread' ? 0.18 : 0.26;
          part(col, s, s * 0.6, 0.3, px, y + s * 0.3, 0);
          px += s + 0.06;
        }
      }
    }
    if (goods === 'weapons') {
      for (let i = 0; i < Math.floor(w / 0.35); i++) {
        const blade = part(new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.8, roughness: 0.3 }), 0.06, 1.1, 0.02, -w / 2 + 0.25 + i * 0.35, 1.2, 0.05);
        blade.rotation.z = 0.05;
        part(m.timber, 0.25, 0.05, 0.05, -w / 2 + 0.25 + i * 0.35, 0.65, 0.05);
      }
    }
    this.colliders.push(physics.addBox(this.at(x, z, 1.1), new THREE.Vector3(w / 2, 1.1, 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))));
  }

  private counter(x: number, z: number, len: number, ry: number) {
    const { m } = this;
    this.box(m.planks, len, 1.0, 0.6, x, 0.5, z, ry, true);
    this.box(m.timber, len + 0.1, 0.08, 0.72, x, 1.04, z, ry);
  }

  private barrel(x: number, z: number) {
    this.cyl(this.m.timber, 0.36, 0.9, x, 0.45, z, true, 14);
    this.cyl(new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.6, roughness: 0.5 }), 0.37, 0.06, x, 0.2, z, false, 14);
    this.cyl(new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.6, roughness: 0.5 }), 0.37, 0.06, x, 0.7, z, false, 14);
  }

  private crate(x: number, z: number, s = 0.7) {
    this.box(this.m.planks, s, s, s, x, s / 2, z, this.rnd() * 0.6, true);
  }

  private rug(x: number, z: number, w: number, d: number) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.cloth[Math.floor(this.rnd() * 5)]);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.012, z);
    r.receiveShadow = true;
    this.group.add(r);
  }

  private seat(x: number, z: number, yaw: number, seated = true) {
    this.seats.push({ pos: this.at(x, z), yaw, seated });
  }

  // ---- layouts --------------------------------------------------------------------
  private furnish() {
    const { W, D, kind } = this;
    const back = -D / 2, left = -W / 2, right = W / 2;
    if (kind === 'home') {
      this.hearth(0, back + 0.45, 0);
      this.rug(0, 0.2, Math.min(3, W - 2), Math.min(2.2, D - 2));
      this.table(left + 1.5, 0.1, 1.4, 0.9);
      this.bench(left + 1.5, 0.85, 1.2, Math.PI);
      this.bench(left + 1.5, -0.65, 1.2, 0);
      this.seat(left + 1.5, 0.85, Math.PI);
      this.bed(right - 0.8, back + 1.2, 0);
      this.shelf(left + 0.3, back + 1.2, Math.PI / 2, 1.4, this.rnd() < 0.5 ? 'jars' : 'books');
      this.crate(right - 0.6, D / 2 - 1.5);
      this.barrel(right - 0.6, D / 2 - 2.5);
      this.keeperSpot = { pos: this.at(0.8, back + 1.8), yaw: Math.PI * 0.9, seated: false };
    } else if (kind === 'tavern') {
      this.hearth(right - 0.45, back + D * 0.35, -Math.PI / 2);
      // Bar along the back, barrels behind.
      const barLen = Math.min(W * 0.55, 6);
      this.counter(left + barLen / 2 + 0.6, back + 1.6, barLen, 0);
      for (let i = 0; i < Math.floor(barLen / 0.85); i++) this.barrel(left + 0.9 + i * 0.85, back + 0.5);
      this.shelf(left + barLen / 2 + 0.6, back + 0.2, 0, Math.min(barLen, 3), 'jars');
      this.keeperSpot = { pos: this.at(left + barLen / 2 + 0.6, back + 1.0), yaw: 0, seated: false };
      // Tables and benches filling the front of the room.
      const cols = W > 10 ? 3 : 2;
      for (let c = 0; c < cols; c++) {
        for (const rz of [0.15, 0.45]) {
          const x = left + (W * (c + 0.5)) / cols, z = back + D * (0.5 + rz * 0.75);
          if (z > D / 2 - 1.6 && Math.abs(x) < 1.6) continue; // keep the doorway clear
          this.table(x, z, 1.6, 0.9);
          this.bench(x, z + 0.75, 1.4, Math.PI);
          this.bench(x, z - 0.75, 1.4, 0);
          this.seat(x - 0.35, z + 0.75, Math.PI);
          this.seat(x + 0.35, z - 0.75, 0);
        }
      }
      this.rug(right - 2.2, back + D * 0.35, 2, 1.6);
    } else if (kind === 'shop') {
      this.counter(0, back + D * 0.45, Math.min(W - 2, 5), 0);
      this.keeperSpot = { pos: this.at(0, back + D * 0.45 - 0.9), yaw: 0, seated: false };
      const goods = (['jars', 'bread', 'cloth', 'books'] as const)[this.door.spec.seed % 4];
      this.shelf(0, back + 0.25, 0, Math.min(W - 1, 4), goods);
      this.shelf(left + 0.3, back + D * 0.7, Math.PI / 2, 1.6, goods);
      this.shelf(right - 0.3, back + D * 0.7, -Math.PI / 2, 1.6, 'jars');
      this.crate(left + 0.7, D / 2 - 1.2);
      this.crate(left + 1.3, D / 2 - 1.0, 0.5);
      this.barrel(right - 0.7, D / 2 - 1.2);
      this.rug(0, D * 0.15, 2.4, 1.6);
    } else if (kind === 'smithy') {
      this.hearth(0, back + 0.45, 0, true);
      this.cyl(this.m.stone, 0.35, 0.6, 0, 0.3, back + 2.6, true, 10);
      this.box(new THREE.MeshStandardMaterial({ color: 0x33363c, metalness: 0.8, roughness: 0.4 }), 0.8, 0.28, 0.32, 0, 0.74, back + 2.6);
      this.shelf(left + 0.3, 0, Math.PI / 2, Math.min(D - 2, 3), 'weapons');
      this.barrel(right - 0.7, back + 1.2);
      this.barrel(right - 0.7, back + 2.1);
      this.crate(right - 0.8, D / 2 - 1.4);
      this.keeperSpot = { pos: this.at(0.9, back + 2.6), yaw: -Math.PI / 2, seated: false };
    } else if (kind === 'guild') {
      this.hearth(left + 0.45, back + D * 0.4, Math.PI / 2);
      // The quest board on the back wall.
      this.box(this.m.planks, 2.6, 1.6, 0.1, 0, 1.8, back + 0.08);
      const paper = new THREE.MeshStandardMaterial({ color: 0xefe4c4, roughness: 1 });
      for (let i = 0; i < 9; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44), paper);
        p.position.set(-1.0 + (i % 3) * 1.0 + (this.rnd() - 0.5) * 0.2, 1.4 + Math.floor(i / 3) * 0.45, back + 0.14);
        p.rotation.z = (this.rnd() - 0.5) * 0.15;
        this.group.add(p);
      }
      this.counter(right - 2.2, back + 1.6, 2.6, 0);
      this.keeperSpot = { pos: this.at(right - 2.2, back + 1.0), yaw: 0, seated: false };
      for (const z of [back + D * 0.55, back + D * 0.78]) {
        this.table(-0.4, z, Math.min(W - 4, 4.5), 1.0);
        this.bench(-0.4, z + 0.8, Math.min(W - 4, 4.2), Math.PI);
        this.bench(-0.4, z - 0.8, Math.min(W - 4, 4.2), 0);
        this.seat(-1.2, z + 0.8, Math.PI);
        this.seat(0.6, z - 0.8, 0);
      }
      for (const sx of [-1, 1]) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), this.cloth[0]);
        banner.position.set(sx * 2.4, 2.0, back + 0.1);
        this.group.add(banner);
      }
    } else {
      // A hall or warehouse: stacked goods, a clerk's desk.
      for (let i = 0; i < 10; i++) {
        const x = left + 1 + this.rnd() * (W - 2), z = back + 1 + this.rnd() * (D * 0.6);
        if (this.rnd() < 0.5) this.crate(x, z, 0.6 + this.rnd() * 0.5);
        else this.barrel(x, z);
      }
      this.table(right - 1.6, D / 2 - 2.2, 1.6, 0.8);
      this.keeperSpot = { pos: this.at(right - 1.6, D / 2 - 3.0), yaw: 0, seated: false };
    }
  }

  /** Lights by the hour outside: bright windows by day, a glow at dusk, dark at night. */
  setDaylight(day: number) {
    this.windowMat.color.setRGB(0.08, 0.1, 0.18).lerp(new THREE.Color(1.0, 0.94, 0.8), day);
  }

  update(dt: number) {
    this.t += dt;
    if (this.fire) {
      const f = 0.85 + Math.sin(this.t * 9.1) * 0.08 + Math.sin(this.t * 23.7) * 0.05 + Math.sin(this.t * 3.3) * 0.05;
      if (this.fire.light) this.fire.light.intensity = (this.kind === 'smithy' ? 12 : 8) * f;
      this.fire.mat.emissiveIntensity = (this.kind === 'smithy' ? 2.6 : 1.8) * f;
    }
  }

  dispose() {
    for (const l of this.borrowed) {
      l.distance = 8;
      l.decay = 2;
      this.lender?.returnLight(l);
    }
    this.borrowed = [];
    for (const c of this.colliders) physics.removeStatic(c);
    this.colliders = [];
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
}
