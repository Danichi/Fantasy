import * as THREE from 'three';
import { registerDoor, type Door } from './doors';
import { buildHouse, worldUV, type WorldMats } from './buildings';
import { heightAt } from './terrainHeight';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { GRASS_MASKS } from './groundWindow';
import type { FX } from '../fx/particles';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../npc/npcManager';
import type { Look } from '../npc/charBuilder';
import { CREEK, CREEK_BRIDGE } from './roadData';
import { sunwheelTexture } from './glenLandmarks';
import { StaticBatch } from './cityKit';

/** Ancient waystones along the road (the Sunwheel on each); attune by touch. */
export const WAYSTONES: { id: string; name: string; pos: THREE.Vector3 }[] = [
  { id: 'glen', name: 'Elder Glen (East Gate)', pos: new THREE.Vector3(128, 0, -10) },
  { id: 'millbrook', name: 'Millbrook', pos: new THREE.Vector3(600, 0, 104) },
  { id: 'rest', name: "The Wayfarer's Rest", pos: new THREE.Vector3(1404, 0, 70) },
  { id: 'gull', name: 'Gull Ridge', pos: new THREE.Vector3(2226, 0, 96) },
  { id: 'aurelle', name: 'Port Aurelle (Causeway)', pos: new THREE.Vector3(2548, 0, 168) },
];

// The King's Road between Elder Glen and Port Aurelle (World Expansion
// phase 4, prompt §18): the hamlet of Millbrook with its roadside chapel,
// the Wayfarer's Rest waystation (inn, stables, paddock, travelling
// merchant), the Lantern Camp where an adventuring party rests, the bandit
// hideout on Hollow Ridge, and the Gull Ridge overlook with the first view of
// the sea and Port Aurelle's towers.

export const MILLBROOK = new THREE.Vector3(640, 0, 70);
export const CHAPEL = new THREE.Vector3(668, 0, 184);
export const WAYFARERS_REST = new THREE.Vector3(1385, 0, 92);
export const LANTERN_CAMP = new THREE.Vector3(1072, 0, 46);
export const HOLLOW_RIDGE = new THREE.Vector3(1952, 0, -182);
export const GULL_RIDGE = new THREE.Vector3(2234, 0, 108);
/** Where the lost pilgrim waits (the woods north of the road). */
export const PILGRIM_SPOT = new THREE.Vector3(1240, 0, -150);
/** The cracked milestone with the Sunwheel on its back. */
export const BROKEN_MILESTONE = new THREE.Vector3(1752, 0, 140);

const v = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

function sign(text: string, sub = '') {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2e4c2'; g.fillRect(0, 0, 384, 96);
  g.strokeStyle = '#7a5530'; g.lineWidth = 8; g.strokeRect(4, 4, 376, 88);
  g.fillStyle = '#3a2a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 32px Cinzel, serif'; g.fillText(text, 192, sub ? 38 : 48);
  if (sub) { g.font = '600 18px Cinzel, serif'; g.fillText(sub, 192, 70); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
}

interface Fire { pos: THREE.Vector3; light: THREE.PointLight | null; night?: boolean }

export interface KingsRoad {
  settlements: { settlement: Settlement; records: NpcRecord[] }[];
  /** paddock for the Wayfarer's Rest horses (fauna range) */
  paddock: { center: THREE.Vector3; radius: number; half: THREE.Vector2; yaw: number };
  /** hitching spot where bought horses are brought round */
  stableYard: THREE.Vector3;
  /** the inn's bed: rest here */
  innDoor: THREE.Vector3;
  clearings: [number, number, number][];
  update(dt: number, night: number): void;
}

export function buildKingsRoad(scene: THREE.Scene, m: WorldMats, fx: FX): KingsRoad {
  const clearings: [number, number, number][] = [];
  const fires: Fire[] = [];
  const lanternMats: THREE.MeshStandardMaterial[] = [];
  const rnd = mulberry32(1380);

  const house = (x: number, z: number, rot: number, spec: Parameters<typeof buildHouse>[0], info: Partial<Door> = {}) => {
    const { group, half, door } = buildHouse(spec, m);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + sx * half.x, z + sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    scene.add(group);
    registerDoor(group, door, spec, info);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)));
    clearings.push([x, z, Math.max(half.x, half.z) + 6]);
    return { gy, half };
  };
  const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, uv = 1.5, collide = false) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(worldUV(g, uv), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
    return mesh;
  };
  const campfire = (x: number, z: number, night = false) => {
    const y = heightAt(x, z);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), m.stone);
      s.position.set(x + Math.cos(a) * 0.75, y + 0.1, z + Math.sin(a) * 0.75);
      s.castShadow = true;
      scene.add(s);
    }
    for (let k = 0; k < 4; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), m.bark);
      log.rotation.set(Math.PI / 2 - 0.35, (k / 4) * Math.PI * 2, 0);
      log.position.set(x, y + 0.22, z);
      scene.add(log);
    }
    const light = new THREE.PointLight(0xff9a4a, 0, 14, 1.6);
    light.position.set(x, y + 1.2, z);
    scene.add(light);
    fires.push({ pos: new THREE.Vector3(x, y + 0.35, z), light, night });
    GRASS_MASKS.push({ x, z, r: 2.2, amount: 0.9 });
  };
  const tent = (x: number, z: number, yaw: number, color: number) => {
    const y = heightAt(x, z);
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
    const g = new THREE.ConeGeometry(1.9, 2.3, 4, 1, true);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, 1.4);
    const t = new THREE.Mesh(g, cloth);
    t.position.set(x, y + 1.1, z);
    t.rotation.y = yaw;
    t.castShadow = t.receiveShadow = true;
    scene.add(t);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a120c }));
    flap.position.set(x + Math.sin(yaw) * 1.36, y + 0.7, z + Math.cos(yaw) * 1.36);
    flap.rotation.y = yaw;
    scene.add(flap);
    physics.addBox(new THREE.Vector3(x, y + 0.8, z), new THREE.Vector3(1.3, 0.8, 1.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
  };
  const lanternPost = (x: number, z: number) => {
    const y = heightAt(x, z);
    box(m.timber, 0.12, 2.4, 0.12, x, y + 1.2, z, 0);
    box(m.timber, 0.6, 0.08, 0.08, x + 0.25, y + 2.35, z, 0);
    const lm = new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xffa040, emissiveIntensity: 0.4 });
    lanternMats.push(lm);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), lm);
    l.position.set(x + 0.5, y + 2.15, z);
    scene.add(l);
  };
  // Fences are hundreds of posts and rails: merged, not a mesh each.
  const fences = new StaticBatch();
  const fencePiece = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
    const g = worldUV(new THREE.BoxGeometry(w, h, d), 1.5);
    fences.add(g, m.timber, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
    g.dispose();
  };
  const fenceRun = (pts: [number, number][]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.4));
      const yaw = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        fencePiece(0.12, 1.1, 0.12, x, heightAt(x, z) + 0.5, z);
      }
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * (k + 0.5)) / n, z = az + ((bz - az) * (k + 0.5)) / n;
        const y = heightAt(x, z);
        for (const yy of [0.45, 0.9]) fencePiece(0.06, 0.09, len / n, x, y + yy, z, yaw);
        physics.addBox(new THREE.Vector3(x, y + 0.6, z), new THREE.Vector3(0.08, 0.6, len / n / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
      }
    }
  };
  const signBoard = (text: string, sub: string, x: number, z: number, yaw: number, w = 3.2) => {
    const y = heightAt(x, z);
    for (const s of [-1, 1]) box(m.timber, 0.14, 2.8, 0.14, x + Math.cos(yaw) * s * (w / 2 - 0.1), y + 1.4, z - Math.sin(yaw) * s * (w / 2 - 0.1), yaw);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), sign(text, sub));
    b.position.set(x, y + 2.4, z);
    b.rotation.y = yaw;
    scene.add(b);
  };

  // ---- Millbrook hamlet and the Chapel of the Dawn ---------------------------------------
  house(596, 62, 0.15, { w: 8, d: 6.5, floors: 1, roof: 'thatch', seed: 601 });
  house(622, 48, -0.1, { w: 7, d: 6, floors: 2, roof: 'tile', seed: 602 });
  house(676, 58, 0.25, { w: 8, d: 7, floors: 1, roof: 'thatch', seed: 603 });
  house(708, 72, -0.2, { w: 9, d: 7, floors: 2, roof: 'slate', seed: 604 });
  house(560, 128, Math.PI - 0.1, { w: 7, d: 6, floors: 1, roof: 'tile', seed: 605 });
  fenceRun([[580, 30], [640, 22], [700, 36]]);
  fenceRun([[540, 140], [520, 180], [580, 200], [610, 150]]);
  signBoard('MILLBROOK', 'Welcome, traveller', 590, 96, Math.PI + 0.1);
  {
    // The chapel: a stone nave, a tiled roof, a bell tower and a dawn-sun window.
    const x = CHAPEL.x, z = CHAPEL.z, y = heightAt(x, z) - 0.2, yaw = Math.PI - 0.35;
    CHAPEL.y = y;
    const nave = new THREE.Group();
    const add = (mat: THREE.Material, g: THREE.BufferGeometry, px: number, py: number, pz: number, rx = 0) => {
      const mm = new THREE.Mesh(worldUV(g, 1.2), mat);
      mm.position.set(px, py, pz);
      mm.rotation.x = rx;
      mm.castShadow = mm.receiveShadow = true;
      nave.add(mm);
    };
    add(m.stone, new THREE.BoxGeometry(8, 1, 15), 0, 0.5, 0);
    add(m.plaster, new THREE.BoxGeometry(7, 5, 14), 0, 3.5, 0);
    for (const sd of [-1, 1]) {
      // Each slab slopes down and out from the ridge (3 m above the eaves).
      const r = new THREE.BoxGeometry(4.9, 0.3, 15.6);
      r.rotateZ(-sd * 0.7);
      r.translate(sd * 1.85, 7.45, 0);
      add(m.tile ?? m.slate, r, 0, 0, 0);
    }
    const gable = new THREE.Shape();
    gable.moveTo(-3.5, 0); gable.lineTo(3.5, 0); gable.lineTo(0, 3); gable.closePath();
    for (const sz of [-7, 6.95]) add(m.plaster, new THREE.ExtrudeGeometry(gable, { depth: 0.05, bevelEnabled: false }), 0, 6, sz);
    // Bell tower at the front.
    add(m.stone, new THREE.BoxGeometry(3, 11, 3), 0, 5.5, 8);
    add(m.slate, new THREE.ConeGeometry(2.4, 3.4, 4).rotateY(Math.PI / 4), 0, 12.7, 8);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.8, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }));
    bell.position.set(0, 9.6, 8);
    nave.add(bell);
    // Door and a round dawn window.
    add(m.planks, new THREE.BoxGeometry(1.6, 2.6, 0.2), 0, 1.8, 9.55);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb040, emissiveIntensity: 0.6 }));
    lanternMats.push(sun.material as THREE.MeshStandardMaterial);
    sun.position.set(0, 7.2, 9.52);
    nave.add(sun);
    nave.position.set(x, y, z);
    nave.rotation.y = yaw;
    scene.add(nave);
    physics.addBox(new THREE.Vector3(x, y + 4, z), new THREE.Vector3(3.8, 4, 7.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
    physics.addBox(new THREE.Vector3(x + Math.sin(yaw) * 8, y + 5, z + Math.cos(yaw) * 8), new THREE.Vector3(1.5, 5.5, 1.5));
    clearings.push([x, z, 16]);
    // A little graveyard.
    for (let k = 0; k < 8; k++) {
      const gx = x + 9 + (k % 4) * 2.2, gz = z - 3 + Math.floor(k / 4) * 3;
      box(m.stone, 0.7, 0.9 + rnd() * 0.3, 0.18, gx, heightAt(gx, gz) + 0.4, gz, yaw + (rnd() - 0.5) * 0.2, 1.2);
    }
  }

  // ---- The Wayfarer's Rest ----------------------------------------------------------------
  const W = WAYFARERS_REST;
  W.y = heightAt(W.x, W.z);
  const inn = house(W.x, W.z - 6, 0.04, { w: 16, d: 11, floors: 2, roof: 'tile', seed: 1380 }, { kind: 'tavern', name: 'The Wayfarer’s Rest' });
  signBoard("THE WAYFARER'S REST", 'Beds · Stables · Hot Stew', W.x - 12, W.z + 12, 0.04, 4.4);
  // Stable: an open-fronted shed with stalls.
  {
    const sx = W.x - 26, sz = W.z - 2, sy = heightAt(sx, sz);
    box(m.planks, 12, 3.6, 0.2, sx, sy + 1.8, sz - 3, 0, 1.5, true);
    for (const e of [-6, 6]) box(m.planks, 0.2, 3.6, 6, sx + e, sy + 1.8, sz, 0, 1.5, true);
    for (let k = -1; k <= 1; k++) box(m.timber, 0.12, 1.3, 5, sx + k * 3 + 1.5, sy + 0.65, sz, 0);
    const roof = new THREE.BoxGeometry(13, 0.25, 7.4);
    roof.rotateX(-0.22);
    const rm = new THREE.Mesh(worldUV(roof, 1.5), m.thatch);
    rm.position.set(sx, sy + 4.1, sz);
    rm.castShadow = true;
    scene.add(rm);
    for (let k = 0; k < 4; k++) {
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0xd9b25e, roughness: 1 }));
      hb.rotation.z = Math.PI / 2;
      hb.position.set(sx - 4 + k * 2.6, sy + 0.62, sz - 1.8);
      scene.add(hb);
    }
    clearings.push([sx, sz, 10]);
  }
  // Paddock behind the stable.
  const paddock = { center: v(W.x - 40, W.z - 22), radius: 14, half: new THREE.Vector2(14, 10), yaw: 0 };
  fenceRun([[W.x - 54, W.z - 12], [W.x - 54, W.z - 32], [W.x - 26, W.z - 32], [W.x - 26, W.z - 16]]);
  fences.build(scene, 120);
  clearings.push([paddock.center.x, paddock.center.z, 18]);
  // Courtyard: well, wagons, hitching rail, a merchant's cart and lanterns.
  {
    const wx = W.x + 14, wz = W.z + 4, wy = heightAt(wx, wz);
    const ring = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 14, 1, true), 1), m.stone);
    ring.position.set(wx, wy + 0.45, wz);
    scene.add(ring);
    for (const s of [-1, 1]) box(m.timber, 0.14, 2.2, 0.14, wx + s * 1, wy + 1.1, wz);
    box(m.planks, 2.6, 0.1, 1.4, wx, wy + 2.35, wz, 0);
    physics.addCylinder(new THREE.Vector3(wx, wy + 0.5, wz), 0.5, 1.2);
    box(m.timber, 5, 0.12, 0.12, W.x - 4, heightAt(W.x - 4, W.z + 6) + 1.05, W.z + 6);
    for (const px of [-6.3, -1.7]) box(m.timber, 0.14, 1.1, 0.14, W.x + px, heightAt(W.x + px, W.z + 6) + 0.55, W.z + 6);
    // Zarek's cart: a covered wagon with bright awnings.
    const cx = W.x + 22, cz = W.z - 6, cy = heightAt(cx, cz);
    box(m.planks, 3.4, 0.4, 1.8, cx, cy + 0.9, cz, 0.3);
    for (const [ox, oz] of [[-1.2, -0.95], [1.2, -0.95], [-1.2, 0.95], [1.2, 0.95]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14), m.planks);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(cx + Math.cos(0.3) * ox + Math.sin(0.3) * oz, cy + 0.55, cz - Math.sin(0.3) * ox + Math.cos(0.3) * oz);
      wheel.rotation.y = 0.3;
      scene.add(wheel);
    }
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.3, 14, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a3f8a, roughness: 0.95, side: THREE.DoubleSide }));
    hood.rotation.order = 'YXZ';
    hood.rotation.set(Math.PI / 2, 0.3, 0);
    hood.position.set(cx, cy + 1.1, cz);
    scene.add(hood);
    physics.addBox(new THREE.Vector3(cx, cy + 1, cz), new THREE.Vector3(1.7, 1, 1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, 0)));
    for (const [lx, lz] of [[-10, 10], [8, 10], [18, -12], [-18, 8]]) lanternPost(W.x + lx, W.z + lz);
    campfire(W.x + 4, W.z + 16, false);
    for (let k = 0; k < 3; k++) box(m.bark, 2, 0.35, 0.4, W.x + 4 + Math.cos(k * 2.1) * 2.4, heightAt(W.x + 4, W.z + 16) + 0.2, W.z + 16 + Math.sin(k * 2.1) * 2.4, k * 2.1 + Math.PI / 2);
    GRASS_MASKS.push({ x: W.x, z: W.z + 2, hx: 28, hz: 16, amount: 0.7 });
  }
  clearings.push([W.x, W.z + 4, 30]);
  const stableYard = v(W.x - 20, W.z + 6);
  const innDoor = v(W.x, W.z - 6 + inn.half.z + 1.4);

  // ---- The Lantern Camp ----------------------------------------------------------------------
  {
    const c = LANTERN_CAMP;
    c.y = heightAt(c.x, c.z);
    campfire(c.x, c.z);
    tent(c.x - 6, c.z - 4, 0.9, 0x3d6a8a);
    tent(c.x + 5, c.z - 6, -0.6, 0x8a5a3a);
    tent(c.x + 1, c.z + 7, Math.PI, 0x5a7a3a);
    for (const [lx, lz] of [[-8, 4], [8, 3], [0, -10]]) lanternPost(c.x + lx, c.z + lz);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0xe0a830, roughness: 0.9, side: THREE.DoubleSide }));
    banner.position.set(c.x + 3, c.y + 3, c.z + 1);
    scene.add(banner);
    box(m.timber, 0.1, 4.2, 0.1, c.x + 2.4, c.y + 2.1, c.z + 1);
    clearings.push([c.x, c.z, 16]);
    GRASS_MASKS.push({ x: c.x, z: c.z, r: 9, amount: 0.55 });
  }

  // ---- Hollow Ridge: the bandit hideout ---------------------------------------------------
  {
    const h = HOLLOW_RIDGE;
    h.y = heightAt(h.x, h.z);
    // A sharpened-stake palisade with a gap to the south.
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.28) continue; // gate (south, +z)
      const x = h.x + Math.cos(a) * 19, z = h.z + Math.sin(a) * 15;
      const y = heightAt(x, z);
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.2, 3 + rnd() * 0.8, 6), m.bark);
      stake.position.set(x, y + 1.4, z);
      stake.rotation.z = (rnd() - 0.5) * 0.2;
      stake.castShadow = true;
      scene.add(stake);
      physics.addCylinder(new THREE.Vector3(x, y + 1.4, z), 1.5, 0.45);
    }
    campfire(h.x, h.z + 2, false);
    tent(h.x - 8, h.z - 2, 0.6, 0x5a3a2a);
    tent(h.x + 8, h.z + 1, -0.8, 0x4a4a3a);
    tent(h.x - 3, h.z + 8, 3.0, 0x6a2a2a);
    // The cave in the ridge behind the camp.
    const cx = h.x + 2, cz = h.z - 13, cy = heightAt(cx, cz);
    // A jagged outcrop of dark ridge rock around the cave mouth.
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f675c, roughness: 1, flatShading: true });
    const crag = (r: number) => {
      const g = new THREE.IcosahedronGeometry(r, 0);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rnd() * 0.45), p.getY(i) * (0.9 + rnd() * 0.7), p.getZ(i) * (0.8 + rnd() * 0.4));
      g.computeVertexNormals();
      return g;
    };
    for (let k = 0; k < 16; k++) {
      const a = -1.5 + (k / 15) * 3;
      const ring = k % 3 === 0 ? 9 : 6.5;
      const r = new THREE.Mesh(crag(2.2 + rnd() * 2.2), rockMat);
      r.position.set(cx + Math.sin(a) * ring, cy + 1.2 + rnd() * 2.5 + (Math.abs(a) < 0.5 ? 3.2 : 0), cz - 3 - Math.cos(a) * ring * 0.45);
      r.rotation.set(rnd(), rnd() * 6, rnd() * 0.4);
      r.castShadow = r.receiveShadow = true;
      scene.add(r);
    }
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    mouth.position.set(cx, cy + 0.02, cz + 0.4);
    scene.add(mouth);
    physics.addBox(new THREE.Vector3(cx, cy + 2.5, cz - 3), new THREE.Vector3(7, 2.5, 2.5));
    // Loot: a strongbox by the cave mouth.
    box(m.planks, 1.1, 0.7, 0.7, cx + 2.4, cy + 0.35, cz + 1.2, 0.2, 1, true);
    signBoard('KEEP OUT', 'by order of Varn', h.x, h.z + 17, Math.PI, 2.4);
    clearings.push([h.x, h.z, 24]);
    GRASS_MASKS.push({ x: h.x, z: h.z, r: 16, amount: 0.5 });
  }

  // ---- Gull Ridge overlook ----------------------------------------------------------------------
  {
    const g = GULL_RIDGE;
    g.y = heightAt(g.x, g.z);
    // A ruined watchtower and a bench facing the sea.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const hgt = 3 + Math.abs(Math.sin(k * 1.7)) * 5 * (k < 9 ? 1 : 0.35);
      box(m.stone, 1.3, hgt, 0.7, g.x - 6 + Math.cos(a) * 2.6, g.y + hgt / 2 - 0.3, g.z - 4 + Math.sin(a) * 2.6, -a + Math.PI / 2, 1.2);
    }
    physics.addCylinder(new THREE.Vector3(g.x - 6, g.y + 3, g.z - 4), 3, 3.2);
    box(m.planks, 2.4, 0.12, 0.6, g.x + 2, g.y + 0.5, g.z, Math.PI / 2 - 0.2);
    for (const s of [-1, 1]) box(m.timber, 0.12, 0.5, 0.5, g.x + 2 + Math.sin(-0.2) * s, g.y + 0.25, g.z + s * 1.0);
    signBoard('GULL RIDGE', 'Port Aurelle · the Grand Ocean', g.x - 1, g.z + 6, Math.PI / 2 + 0.3, 3.4);
    clearings.push([g.x, g.z, 14]);
  }

  // ---- The broken milestone ----------------------------------------------------------------
  {
    const b = BROKEN_MILESTONE;
    b.y = heightAt(b.x, b.z);
    box(m.bridgeStone ?? m.stone, 0.55, 0.6, 0.32, b.x, b.y + 0.25, b.z, 0.4, 1);
    const top = box(m.bridgeStone ?? m.stone, 0.55, 0.5, 0.32, b.x + 0.7, b.y + 0.12, b.z + 0.3, 1.1, 1);
    top.rotation.z = Math.PI / 2 - 0.2;
  }

  // ---- Millbrook Brook and its wooden bridge ------------------------------------------------
  const creekWater: THREE.MeshStandardMaterial = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3f9ab8'; g.fillRect(0, 0, 64, 256);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(220, 245, 255, ${0.15 + rnd() * 0.25})`;
      g.fillRect(rnd() * 64, rnd() * 256, 2 + rnd() * 6, 10 + rnd() * 30);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.1 });
  })();
  {
    // A ribbon of water down the carved channel, following the bed.
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let along = 0, n = 0;
    for (let i = 0; i < CREEK.length - 1; i++) {
      const [ax, az] = CREEK[i], [bx, bz] = CREEK[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let t = 0; t < len; t += 3) {
        const x = ax + dx * t, z = az + dz * t;
        const y = heightAt(x, z) + 1.15;
        for (const side of [-1, 1]) {
          pos.push(x - dz * 4.4 * side, y, z + dx * 4.4 * side);
          uv.push(side < 0 ? 0 : 1, along / 12);
        }
        if (n > 0) {
          const a = (n - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // wound to face up
        }
        n++;
        along += 3;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const water = new THREE.Mesh(g, creekWater);
    water.receiveShadow = true;
    scene.add(water);
    for (const [x, z] of CREEK) clearings.push([x, z, 12]);
  }
  {
    const [bx, bz] = CREEK_BRIDGE;
    // The deck sits at the road's height on the banks either side of the channel.
    const deckY = (heightAt(bx - 9, bz) + heightAt(bx + 9, bz)) / 2 + 0.2;
    for (let x = -7; x <= 7; x += 0.7) box(m.planks, 0.62, 0.12, 6.2, bx + x, deckY, bz, 0, 1);
    for (const s of [-1, 1]) {
      box(m.timber, 15, 0.3, 0.3, bx, deckY - 0.25, bz + s * 2.8);
      box(m.timber, 15, 0.12, 0.12, bx, deckY + 1.0, bz + s * 3.05);
      for (let x = -7; x <= 7; x += 3.5) {
        box(m.timber, 0.2, 1.2, 0.2, bx + x, deckY + 0.5, bz + s * 3.05);
        box(m.timber, 0.28, 3.4, 0.28, bx + x, deckY - 1.9, bz + s * 2.6);
      }
    }
    physics.addBox(new THREE.Vector3(bx, deckY - 0.1, bz), new THREE.Vector3(7.5, 0.2, 3.2));
    for (const s of [-1, 1]) physics.addBox(new THREE.Vector3(bx, deckY + 0.6, bz + s * 3.1), new THREE.Vector3(7.5, 0.6, 0.1));
  }

  // ---- The waystones -------------------------------------------------------------------------
  const runeMats: THREE.MeshStandardMaterial[] = [];
  for (const w of WAYSTONES) {
    const y = heightAt(w.pos.x, w.pos.z);
    w.pos.y = y;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x7f8a96, roughness: 0.9, flatShading: true }));
    stone.position.set(w.pos.x, y + 1.2, w.pos.z);
    stone.castShadow = true;
    scene.add(stone);
    const rune = new THREE.MeshStandardMaterial({ map: sunwheelTexture('rgba(70,80,100,1)', false), emissiveMap: sunwheelTexture(), emissive: 0x9fd8ff, emissiveIntensity: 0.4, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    runeMats.push(rune);
    for (const a of [0, Math.PI]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), rune);
      p.position.set(w.pos.x + Math.sin(a) * 0.64, y + 1.5, w.pos.z + Math.cos(a) * 0.64);
      p.rotation.y = a;
      scene.add(p);
    }
    physics.addCylinder(new THREE.Vector3(w.pos.x, y + 1.2, w.pos.z), 1.3, 0.7);
    clearings.push([w.pos.x, w.pos.z, 5]);
  }

  // ---- Residents --------------------------------------------------------------------------
  const settlements: KingsRoad['settlements'] = [];
  const mk = (id: string, center: THREE.Vector3, radius: number, people: { id: string; name: string; title: string; look: Look; post: THREE.Vector3; yaw?: number; activity: ScheduleEntry['activity']; hours: [number, number]; lines: NpcRecord['lines']; evening?: THREE.Vector3 }[]) => {
    const places = new Map<string, Place>();
    const records: NpcRecord[] = [];
    places.set('home', { id: 'home', spots: [center.clone()], indoors: true });
    for (const p of people) {
      places.set('post:' + p.id, { id: 'post:' + p.id, spots: [p.post], yaw: p.yaw });
      if (p.evening) places.set('eve:' + p.id, { id: 'eve:' + p.id, spots: [p.evening] });
      const [a, b] = p.hours;
      const schedule: ScheduleEntry[] = b > 24
        ? [{ from: 0, activity: p.activity, place: 'post:' + p.id }, { from: b - 24, activity: 'sleep', place: 'home' }, { from: a, activity: p.activity, place: 'post:' + p.id }]
        : [{ from: 0, activity: 'sleep', place: 'home' }, { from: a, activity: p.activity, place: 'post:' + p.id }, { from: b, activity: p.evening ? 'sit' : 'sleep', place: p.evening ? 'eve:' + p.id : 'home' }, { from: Math.min(23.8, b + 3), activity: 'sleep', place: 'home' }];
      records.push({ id: p.id, name: p.name, title: p.title, job: p.id, settlement: id, look: p.look, schedule, lines: p.lines, named: true });
    }
    settlements.push({ settlement: { id, center, radius, places, nodes: [], edges: [] }, records });
  };
  const fire = (c: THREE.Vector3, dx: number, dz: number) => v(c.x + dx, c.z + dz);
  mk('wayfarersRest', W.clone(), 90, [
    { id: 'hester', name: 'Hester Brightwater', title: "Innkeeper of the Wayfarer's Rest", post: v(W.x + 2, W.z + 2), yaw: 0, activity: 'idle', hours: [6, 26], lines: { any: ['Half-way to the sea and the stew\'s still hot.', 'Beds upstairs. Stables round the side. Trouble outside, please.'] },
      look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x8a3f22, skin: 0xfff0e6, linen: 0xf0e0a8, height: 1.68 } },
    { id: 'dunmore', name: 'Col Dunmore', title: 'Stablemaster · Horses for Sale', post: v(W.x - 20, W.z + 3), yaw: Math.PI, activity: 'work', hours: [6, 20], evening: fire(W, 4, 19), lines: { any: ['Every horse here was raised on Cresha grass. Best on the road.', 'A good horse turns ten minutes of walking into three.'] },
      look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x7a5a3a, height: 1.82 } },
    { id: 'zarek', name: 'Zarek the Wanderer', title: 'Travelling Merchant', post: v(W.x + 20, W.z - 3), yaw: 0.3, activity: 'talk', hours: [8, 21], evening: fire(W, 6, 14), lines: { any: ['Silks from the Golden Expanse, spices from Valoria, trinkets from everywhere.', 'I have sold to kings and to goats. The goats haggled harder.'] },
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0x7a4e32, linen: 0xd9cfe8, cloth: 0x7a3f8a, height: 1.76 } },
    { id: 'tove', name: 'Sergeant Tove', title: 'Road Warden', post: v(W.x - 6, W.z + 15), yaw: Math.PI, activity: 'patrol', hours: [7, 23], lines: { any: ['The King pays three of us to watch forty miles of road.', 'Bandits on Hollow Ridge again. Mind the trail north past the old mile-post.'] },
      look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x3a5f9e, pauldron: true, height: 1.74 } },
    { id: 'garth', name: 'Old Garth', title: 'Shepherd of Millbrook', post: v(MILLBROOK.x - 24, MILLBROOK.z - 30), activity: 'idle', hours: [6, 19], lines: { any: ['Something big has been at the flock. Bigger than any wolf I\'ve seen.'] },
      look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x6a7f3a, hood: true, height: 1.72 } },
    { id: 'aldous', name: 'Brother Aldous', title: 'Keeper of the Chapel of the Dawn', post: v(CHAPEL.x - 2, CHAPEL.z - 12), activity: 'idle', hours: [6, 21], lines: { any: ['The Dawn watches over travellers. So do I, when my knees allow.'] },
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: false, hairColor: 0xe6e2da, skin: 0xfff0e6, linen: 0xe8d8b8, height: 1.7 } },
  ]);
  const L = LANTERN_CAMP;
  mk('lanternCamp', L.clone(), 60, [
    { id: 'dagna', name: 'Dagna Holt', title: 'C-Rank Captain · The Iron Lanterns', post: fire(L, -2, 2), activity: 'sit', hours: [0, 24], lines: { any: ['The Iron Lanterns: three blades, one lamp, no retreat.', 'We\'re resting before the Hollow Ridge job. You interested?'] },
      look: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0xe0a830, pauldron: true, height: 1.78 } },
    { id: 'pell', name: 'Pell Harrow', title: 'D-Rank Mage · The Iron Lanterns', post: fire(L, 2, 2), activity: 'sit', hours: [0, 24], lines: { any: ['Fire keeps the wolves off. Mostly. Some of them like it warm.'] },
      look: { body: 'male', outfit: 'peasant', hair: 'long', hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x2f5f9a, height: 1.74 } },
    { id: 'sif', name: 'Sif Arden', title: 'C-Rank Archer · The Iron Lanterns', post: fire(L, 0, -2.5), activity: 'idle', hours: [0, 24], lines: { any: ['I can hit a crow at eighty paces. Pell can hit one at eight.'] },
      look: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0xb0562a, skin: 0xfff0e6, cloth: 0x3d7a45, hood: true, height: 1.7 } },
  ]);

  let t = 0;
  return {
    settlements,
    paddock,
    stableYard,
    innDoor,
    clearings,
    update(dt: number, night: number) {
      t += dt;
      for (const f of fires) {
        if (Math.random() < dt * 22) fx.add.spawn({ pos: f.pos, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.4, count: 1, life: [0.4, 0.8], size: [0.45, 0.06], color: 0xffc060, color2: 0xff3a00, jitter: 0.3 });
        if (f.light) f.light.intensity = (0.8 + night * 5) * (0.85 + Math.sin(t * 13 + f.pos.x) * 0.1 + Math.sin(t * 7.3) * 0.05);
      }
      for (const lm of lanternMats) lm.emissiveIntensity = 0.3 + night * 2.4;
      creekWater.map!.offset.y -= dt * 0.35;
      for (const r of runeMats) r.emissiveIntensity = 0.35 + Math.sin(t * 1.4) * 0.15 + night * 1.2;
    },
  };
}
