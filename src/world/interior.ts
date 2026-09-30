import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { worldUV, type WorldMats } from './buildings';
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
let shared: {
  cloth: THREE.MeshStandardMaterial[]; window: THREE.MeshBasicMaterial; coals: THREE.MeshStandardMaterial; forge: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial; flame: THREE.MeshBasicMaterial; flameCore: THREE.MeshBasicMaterial; water: THREE.MeshStandardMaterial; ledger: THREE.MeshStandardMaterial; redHand: THREE.MeshBasicMaterial;
} | null = null;
const sharedMats = () =>
  (shared ??= {
    cloth: [0x8a2f2a, 0x2f5f9a, 0x3f6f34, 0x7a3f8a, 0xb8862e].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    window: new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }),
    coals: new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff7a2a, emissiveIntensity: 1.8 }),
    forge: new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff6a10, emissiveIntensity: 2.6 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2e2f34, metalness: 0.7, roughness: 0.5 }),
    // Flames glow additively: an orange tongue around a pale core.
    flame: new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x10262a, roughness: 0.25, metalness: 0.1, envMapIntensity: 0.35, emissive: 0x040a0a }),
    ledger: new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 }),
    redHand: new THREE.MeshBasicMaterial({ color: 0x9a1a14 }),
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
  /** named places in bigger layouts (the undercity: 'nix', 'cistern', 'ledger', 'boat') */
  readonly spots: Record<string, Seat> = {};
  private colliders: RAPIER.Collider[] = [];
  private fire: { light: THREE.PointLight | null; mat: THREE.MeshStandardMaterial } | null = null;
  private wants: LightWant[] = [];
  private flames: THREE.Mesh[] = [];
  /** metres per texture repeat on boxes (the undercity's stonework is finer) */
  private uvScale = 1.5;
  private borrowed: THREE.PointLight[] = [];
  private windowMat: THREE.MeshBasicMaterial;
  private t = 0;
  readonly W: number;
  readonly D: number;
  private rnd: () => number;
  private cloth: THREE.MeshStandardMaterial[];

  constructor(readonly door: Door, readonly kind: InteriorKind, private scene: THREE.Scene, private m: WorldMats, onLeave: () => void, private lender?: LightLender, private onInspect?: (label: string, text: string) => void) {
    this.rnd = mulberry32(door.spec.seed * 7 + 11);
    const big = kind === 'guild' || kind === 'hall' || kind === 'tavern';
    this.W = kind === 'undercity' ? 22 : Math.max(big ? 9 : 6, door.spec.w - 0.6);
    this.D = kind === 'undercity' ? 44 : Math.max(big ? 8 : 5.5, door.spec.d - 0.6);
    this.group.position.copy(INTERIOR_ORIGIN);
    scene.add(this.group);
    const sm = sharedMats();
    this.cloth = sm.cloth;
    this.windowMat = sm.window;
    if (kind === 'undercity') {
      this.undercity();
      this.spawn = this.at(0, this.D / 2 - 5.2);
    } else {
      this.shell();
      this.spawn = this.at(0, this.D / 2 - 1.1);
      this.furnish();
    }
    this.lightUp();
    // The way out.
    const exit = kind === 'undercity' ? this.at(0, this.D / 2 - 4.2) : this.at(0, this.D / 2 - 0.5);
    this.interactables.push({
      pos: exit, radius: 1.6,
      label: () => (kind === 'undercity' ? 'Climb back up to the alley' : `Leave ${door.name ?? 'the house'}`),
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
    // World-scale UVs: plank and stone textures keep one size on every surface.
    const mesh = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d), this.uvScale), mat);
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

  private inspectProp(x: number, z: number, label: string, text: string) {
    const pos = this.at(x, z, 0.4);
    this.interactables.push({
      pos,
      radius: 1.4,
      label: () => label,
      enabled: () => true,
      action: () => this.onInspect?.(label, text),
    });
    // Inspection text is routed through the dialogue callback; no UI state is stored on the Vector3.
  }

  private smallProp(mat: THREE.Material, x: number, y: number, z: number, s = 0.18) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.85, s * 1.4, 8), mat);
    g.position.set(x, y, z);
    g.castShadow = g.receiveShadow = true;
    this.group.add(g);
    return g;
  }

  private sack(x: number, z: number, scale = 0.55) {
    const sackMat = new THREE.MeshStandardMaterial({ color: 0xb6a27e, roughness: 1 });
    const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * scale, 0.45 * scale, 5, 8), sackMat);
    g.position.set(x, 0.45 * scale, z);
    g.scale.y = 1.15;
    g.castShadow = g.receiveShadow = true;
    this.group.add(g);
  }

  private bottleRack(x: number, z: number, w: number) {
    this.shelf(x, z, 0, w, 'jars');
    for (let i = 0; i < 5; i++) this.smallProp(this.cloth[i], x - w / 2 + 0.25 + i * (w - 0.5) / 4, 0.52, z + 0.12, 0.12);
  }

  private specialistShopDetails(back: number, left: number, right: number, D: number) {
    const keeper = this.door.keeper;
    if (keeper === 'baker') {
      this.hearth(right - 0.8, back + 0.9, -Math.PI / 2);
      this.shelf(left + 1.4, back + 0.25, 0, Math.min(3.8, this.W - 2.2), 'bread');
      for (const x of [-0.8, -0.1, 0.6]) this.sack(x, D / 2 - 1.1, 0.7);
      this.inspectProp(0, back + 1.2, 'Inspect the bakery oven', 'A soot-dark oven holds the last heat of the morning bake. Flour dust coats the wooden peel beside it.');
    } else if (keeper === 'apothecary') {
      this.bottleRack(left + 1.0, back + 1.0, 2.1);
      this.bottleRack(right - 1.0, back + 0.9, 1.8);
      for (const [x, mat] of [[-0.7, this.cloth[0]], [0, this.cloth[2]], [0.7, this.cloth[4]]] as const) this.smallProp(mat, x, 0.18, 0.3, 0.12);
      this.inspectProp(0, back + 1.0, 'Inspect the apothecary table', 'Dried herbs, crushed roots and colored tinctures cover the workbench. A little brass mortar is still warm.');
    } else if (keeper === 'tailor') {
      for (const x of [-1.0, 0, 1.0]) this.box(this.cloth[Math.round((x + 1) * 2) % this.cloth.length], 0.55, 0.25, 0.55, x, 0.55, 0.4, 0.15);
      this.shelf(right - 1.0, back + 1.0, Math.PI / 2, 1.7, 'cloth');
      this.inspectProp(0, 0.7, 'Inspect the cutting table', 'Pins, chalk and folded cloth cover a broad cutting table. A half-finished travel cloak hangs from a peg.');
    } else if (keeper === 'carpenter') {
      this.table(left + 1.8, back + 1.0, 2.3, 0.9, 0.08);
      for (const z of [back + 0.9, back + 1.45, back + 2.0]) this.box(this.m.timber, 0.18, 0.18, 2.6, right - 1.0, 0.25, z, 0.05);
      this.inspectProp(0, back + 1.0, 'Inspect the carpenter’s bench', 'Fresh curls of wood cover the bench beside a square, a plane and a half-carved shield rim.');
    } else if (keeper === 'arcanist') {
      this.table(0, back + 1.5, 2.8, 1.0);
      const arcane = new THREE.MeshStandardMaterial({ color: 0x5369a8, emissive: 0x202a76, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.2 });
      for (const [x, z] of [[-0.75, back + 1.5], [0, back + 1.5], [0.75, back + 1.5]]) this.smallProp(arcane, x, 0.92, z, 0.13);
      this.shelf(right - 0.8, 0.2, -Math.PI / 2, 1.8, 'books');
      this.inspectProp(0, back + 1.5, 'Inspect the arcane table', 'A ring of chalk surrounds three faintly glowing crystals. The ink in the open grimoire has not dried yet.');
    }
  }

  /** An iron-bracketed wall torch: an emissive flame (no light of its own). */
  private sconce(x: number, y: number, z: number, ry: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.group.add(g);
    const iron = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), sharedMats().iron);
    iron.position.z = 0.15;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.14, 8), sharedMats().iron);
    cup.position.set(0, 0.05, 0.32);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 7), sharedMats().flame);
    flame.position.set(0, 0.22, 0.32);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 6), sharedMats().flameCore);
    core.position.set(0, 0.18, 0.32);
    g.add(iron, cup, flame, core);
    this.flames.push(flame, core);
  }

  // ---- the undercity: tunnels, the Quiet Hands' den, the old cistern -------------------
  //
  // Laid out from the stairs at the front (+z) to the cistern at the back:
  //   z 18..22  stairs up to the trapdoor
  //   z  6..18  a vaulted tunnel, walkway on the left, the sewer channel on the right
  //   z -10..6  the den: Sallow's table, Nix's stall, a gaming table, bedrolls, and the
  //             canal landing on the right with a moored skiff
  //   z -22..-10 the old cistern behind an iron gate: a sunken pool, pillars, rats
  private undercity() {
    const { W, D, m } = this;
    const sm = sharedMats();
    const HT = 3.6; // vault height
    this.uvScale = 0.9;
    // Walls reach below the floor so the water's edges never show a gap.
    const wall = (x: number, z: number, w: number, d: number, h = HT) => this.box(m.stone, w, h + 1, d, x, (h - 1) / 2, z, 0, true);
    const water = (x: number, z: number, w: number, d: number) => {
      const wtr = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sm.water);
      wtr.rotation.x = -Math.PI / 2;
      wtr.position.set(x, -0.35, z);
      this.group.add(wtr);
      this.box(m.stone, w, 0.2, d, x, -0.7, z, 0, true); // channel bed (shallow: you can climb out)
      // Stone sides down to the bed.
      for (const s of [-1, 1]) {
        this.box(m.stone, w + 0.2, 0.9, 0.1, x, -0.45, z + s * (d / 2 + 0.05));
        this.box(m.stone, 0.1, 0.9, d + 0.2, x + s * (w / 2 + 0.05), -0.45, z);
      }
    };
    // Floor: stone throughout (the channel and pools read as cut into it).
    this.box(m.stone, 4.4, 0.2, 16, -0.1, -0.1, 12, 0, true); // stairs + tunnel walkway
    // The den floor stops at the quay; the canal and the cistern pool are open water.
    this.box(m.stone, 13.3, 0.2, 16, -4.35, -0.1, -2, 0, true);
    this.box(m.stone, 2.6, 0.2, 14, 3.6, -0.1, -3, 0, true);
    this.box(m.stone, W, 0.2, 3.3, 0, -0.1, -11.65, 0, true);
    this.box(m.stone, W, 0.2, 2.3, 0, -0.1, -20.85, 0, true);
    for (const sx of [-1, 1]) this.box(m.stone, 6.85, 0.2, 6.4, sx * 7.575, -0.1, -16.5, 0, true);
    // Planks laid over the channel where it runs out of the tunnel into the canal.
    this.box(m.planks, 2.6, 0.12, 2.2, 3.55, -0.04, 5, 0, true);
    this.box(m.stone, W + 1, 0.3, D + 1, 0, HT + 0.15, 0); // ceiling

    // Stairs up to the trapdoor.
    for (let i = 0; i < 8; i++) this.box(m.stone, 2.6, 0.22 + i * 0.42, 0.5, 0, (0.22 + i * 0.42) / 2, D / 2 - 3.6 + i * 0.5, 0, true);
    this.box(m.planks, 1.6, 0.1, 1.2, 0, HT - 0.1, D / 2 - 0.6); // the trapdoor from below
    wall(-1.6, 20, 0.4, 4);
    wall(1.6, 20, 0.4, 4);
    wall(0, D / 2 + 0.2, 3.6, 0.4);

    // The tunnel: walkway left, channel right, ribbed vault.
    wall(-2.4, 12, 0.4, 12);
    wall(4.6, 12, 0.4, 12);
    this.box(m.stone, 0.35, 0.5, 12, 2.2, 0.25, 12, 0, true); // curb along the channel
    water(3.4, 12, 2.1, 12);
    for (let z = 7; z <= 17; z += 2.5) {
      this.box(m.stone, 7.2, 0.35, 0.4, 1.1, HT - 0.18, z);
      for (const sx of [-2.1, 4.3]) this.box(m.stone, 0.3, HT, 0.45, sx, HT / 2, z);
    }
    this.sconce(-2.15, 1.9, 15, Math.PI / 2);
    this.sconce(-2.15, 1.9, 9, Math.PI / 2);
    // A red hand painted where the tunnel opens: the Quiet Hands' mark.
    const hand = new THREE.Mesh(new THREE.CircleGeometry(0.35, 5), sm.redHand);
    hand.position.set(-2.18, 2.0, 12);
    hand.rotation.y = Math.PI / 2;
    this.group.add(hand);

    // The den's walls, with the tunnel mouth (x -2..4.6) at z 6 and the cistern gate at x -6.9.
    wall(-6.2, 6, 7.6, 0.4);
    wall(7.8, 6, 6.4, 0.4);
    wall(-W / 2 - 0.2, -8, 0.4, 28);
    wall(W / 2 + 0.2, -8, 0.4, 28);
    wall(-9.3, -10, 2.6, 0.4);
    wall(2.2, -10, 16.4, 0.4);
    wall(0, -D / 2 - 0.2, W, 0.4);
    // Pillars holding up the den.
    for (const [px, pz] of [[-4, -1], [2.5, -1], [-4, -6.5], [2.5, -6.5]]) this.box(m.stone, 0.7, HT, 0.7, px, HT / 2, pz, 0, true);

    // The canal landing (right): water, a jetty, a moored skiff, stacked cargo.
    water(7.5, -2, 5, 16);
    water(3.4, 5, 2.1, 2); // the channel joining it
    this.box(m.stone, 0.35, 0.5, 14, 4.95, 0.25, -3, 0, true); // quay edge
    for (let z = -8; z <= 3; z += 1.1) this.box(m.planks, 1.6, 0.1, 1.0, 5.6, 0.02, z);
    this.skiff(8, -3);
    this.spots.boat = { pos: this.at(5.8, -3), yaw: -Math.PI / 2, seated: false };
    for (const [cx, cz] of [[9.5, 4.5], [9.5, 3.7], [8.7, 4.6], [10, -9], [9.2, -9.2]]) this.crate(cx, cz, 0.8);
    this.barrel(8.2, -9.2);

    // Mother Sallow's table at the back, her ledgers and the strongbox.
    this.table(-5.5, -8.4, 2.2, 1.0);
    this.box(sm.ledger, 0.5, 0.06, 0.35, -5.2, 0.85, -8.4, 0.2);
    this.box(sm.iron, 0.8, 0.5, 0.5, -7.8, 0.25, -9.3, 0, true);
    this.shelf(-9.4, -6, Math.PI / 2, 2.4, 'jars');
    this.keeperSpot = { pos: this.at(-5.5, -9.3), yaw: 0, seated: false };

    // Nix's stall: a counter heaped with goods that fell off a wagon.
    this.counter(-7.5, -1.5, 2.6, Math.PI / 2);
    this.shelf(-10.6, -1.5, Math.PI / 2, 2.6, 'cloth');
    for (let i = 0; i < 5; i++) this.cyl(this.cloth[i], 0.07, 0.18, -7.5 + (this.rnd() - 0.5) * 0.3, 1.17, -2.6 + i * 0.5, false, 8);
    this.spots.nix = { pos: this.at(-8.6, -1.5), yaw: Math.PI / 2, seated: false };

    // The gaming table: dice and cards by the brazier.
    this.table(-0.8, -3.8, 2.0, 1.1);
    this.bench(-0.8, -2.9, 1.8, Math.PI);
    this.bench(-0.8, -4.7, 1.8, 0);
    this.seat(-1.3, -2.9, Math.PI);
    this.seat(-0.3, -2.9, Math.PI);
    this.seat(-1.3, -4.7, 0);
    this.seat(-0.3, -4.7, 0);
    // Bedrolls along the left wall, a brazier in the middle of the den.
    for (let i = 0; i < 3; i++) this.rug(-9.8, 2.5 - i * 1.4, 0.9, 1.1);
    this.brazier(1, 1.8);
    this.sconce(-10.8, 1.9, -8, Math.PI / 2);
    this.sconce(10.8, 1.9, -5, -Math.PI / 2);

    // The old cistern: an iron gate, a sunken pool ringed by pillars, rubbish at the edges.
    for (let i = 0; i < 5; i++) this.box(sm.iron, 0.06, 2.4, 0.06, -7.5 + i * 0.3, 1.2, -10);
    this.box(sm.iron, 1.8, 0.08, 0.08, -6.9, 2.35, -10);
    water(0, -16.5, 8, 6);
    for (const [cx, cz, cw, cd] of [[0, -13.3, 8.4, 0.35], [0, -19.7, 8.4, 0.35], [-4.15, -16.5, 0.35, 6.8], [4.15, -16.5, 0.35, 6.8]] as const) {
      this.box(m.stone, cw, 0.45, cd, cx, 0.22, cz, 0, true);
    }
    for (const [px, pz] of [[-6.5, -13], [6.5, -13], [-6.5, -20], [6.5, -20]]) this.box(m.stone, 0.8, HT, 0.8, px, HT / 2, pz, 0, true);
    for (const [cx, cz] of [[9, -12], [-9, -21], [9.4, -20.6]]) this.crate(cx, cz, 0.6);
    this.sconce(-10.8, 1.9, -15, Math.PI / 2);
    this.sconce(10.8, 1.9, -18, -Math.PI / 2);
    this.spots.cistern = { pos: this.at(0, -11.8), yaw: Math.PI, seated: false };
    // Where a courier's satchel went into the water.
    this.spots.ledger = { pos: this.at(8.8, -21), yaw: 0, seated: false };
    this.box(sm.ledger, 0.4, 0.25, 0.3, 8.8, 0.12, -21.2, 0.4);

    this.wants.push({ pos: this.at(0, 0, HT - 0.8), color: 0xffcf9a, intensity: 2.2, distance: 26, decay: 1.4, fire: false });
  }

  /** A little flat-bottomed boat, tied up. */
  private skiff(x: number, z: number) {
    const { m } = this;
    const g = new THREE.Group();
    g.position.set(x, -0.3, z);
    this.group.add(g);
    const plank = (w: number, h: number, d: number, px: number, py: number, pz: number, rz = 0) => {
      const b = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d), 1.5), m.planks);
      b.position.set(px, py, pz);
      b.rotation.z = rz;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    };
    plank(1.3, 0.08, 4.2, 0, 0.05, 0);
    for (const s of [-1, 1]) plank(0.08, 0.5, 4.2, s * 0.7, 0.28, 0, s * 0.25);
    plank(1.5, 0.5, 0.08, 0, 0.28, 2.1);
    plank(1.5, 0.5, 0.08, 0, 0.28, -2.1);
    plank(1.3, 0.06, 0.35, 0, 0.35, 0.6);
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), m.timber);
    oar.rotation.set(0, 0, Math.PI / 2 - 0.2);
    oar.position.set(0.3, 0.5, -0.4);
    g.add(oar);
  }

  /** An iron fire basket on legs: the den's warm heart. */
  private brazier(x: number, z: number) {
    const sm = sharedMats();
    this.cyl(sm.iron, 0.42, 0.35, x, 0.95, z, false, 10);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.box(sm.iron, 0.05, 0.9, 0.05, x + Math.cos(a) * 0.3, 0.45, z + Math.sin(a) * 0.3);
    }
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.12, 10), sm.coals);
    coals.position.set(x, 1.12, z);
    this.group.add(coals);
    for (let i = 0; i < 4; i++) {
      const core = i === 3;
      const f = new THREE.Mesh(new THREE.ConeGeometry(core ? 0.12 : 0.11, core ? 0.28 : 0.42, 7), core ? sm.flameCore : sm.flame);
      f.position.set(x + (core ? 0 : (i - 1) * 0.13), core ? 1.3 : 1.36, z + (core ? 0 : (i % 2) * 0.1 - 0.05));
      this.group.add(f);
      this.flames.push(f);
    }
    this.colliders.push(physics.addCylinder(this.at(x, z, 0.6), 0.6, 0.45));
    this.wants.push({ pos: this.at(x, z, 2.0), color: 0xff9a4a, intensity: 10, distance: 16, decay: 1.3, fire: true });
    this.fire = { light: null, mat: sm.coals };
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
      this.smallProp(this.m.stone, left + 2.4, 0.9, 0.2, 0.11);
      this.inspectProp(left + 1.5, 0.1, 'Inspect the family table', 'A scratched table holds a loaf board, a chipped cup and the kind of little repairs people make when they plan to stay.');
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
      for (const z of [back + D * 0.55, back + D * 0.78]) {
        this.smallProp(this.cloth[1], left + 1.2, 0.9, z, 0.12);
        this.smallProp(this.cloth[4], right - 1.2, 0.9, z + 0.1, 0.12);
      }
      this.inspectProp(left + 1.1, back + 1.0, 'Inspect the tavern bar', 'The shelves smell of ale and herbs. Chalk marks on the counter track tabs owed by regulars.');
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
      this.smallProp(this.m.stone, 0, 1.05, back + D * 0.45, 0.09);
      this.rug(0, D * 0.15, 2.4, 1.6);
      this.specialistShopDetails(back, left, right, D);
    } else if (kind === 'smithy') {
      this.hearth(0, back + 0.45, 0, true);
      this.cyl(this.m.stone, 0.35, 0.6, 0, 0.3, back + 2.6, true, 10);
      this.box(new THREE.MeshStandardMaterial({ color: 0x33363c, metalness: 0.8, roughness: 0.4 }), 0.8, 0.28, 0.32, 0, 0.74, back + 2.6);
      this.shelf(left + 0.3, 0, Math.PI / 2, Math.min(D - 2, 3), 'weapons');
      this.barrel(right - 0.7, back + 1.2);
      this.barrel(right - 0.7, back + 2.1);
      this.crate(right - 0.8, D / 2 - 1.4);
      for (const x of [-0.8, 0, 0.8]) this.box(this.m.timber, 0.12, 0.75, 0.12, x, 0.9, 0.2);
      this.inspectProp(left + 1.0, 0.3, 'Inspect the forge', 'An anvil, quench barrel and unfinished blades make it clear this forge is a workplace, not a showroom.');
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
      this.table(0, back + D * 0.34, 3.2, 0.9);
      this.inspectProp(0, back + D * 0.34, 'Inspect the guild map table', 'Pins mark roads, ruins and old contracts across the Glen. Someone has circled the northern hills in fresh charcoal.');
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
    // Torch flames lick and sway.
    this.flames.forEach((f, i) => {
      const k = 1 + Math.sin(this.t * 11 + i * 1.7) * 0.12 + Math.sin(this.t * 23 + i) * 0.06;
      f.scale.set(1, k, 1);
      f.rotation.z = Math.sin(this.t * 3.1 + i) * 0.08;
    });
    if (this.fire) {
      const f = 0.85 + Math.sin(this.t * 9.1) * 0.08 + Math.sin(this.t * 23.7) * 0.05 + Math.sin(this.t * 3.3) * 0.05;
      if (this.fire.light) this.fire.light.intensity = (this.kind === 'smithy' ? 12 : this.kind === 'undercity' ? 10 : 8) * f;
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
