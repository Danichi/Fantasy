import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from '../terrainHeight';
import { mulberry32 } from '../../core/math';

// The Dark's ruins (the explorable Dark): everything here is built in world
// coordinates and merged into one mesh per material, so a whole ruin costs a
// handful of draw calls. Every piece sits on the ground under its own feet,
// so a ruin on a slope doesn't float. Solid pieces come back as boxes for the
// caller to turn into colliders (only near the player).

export type RuinMat = 'stone' | 'char' | 'glass' | 'bone' | 'flame';

export interface RuinBox {
  c: THREE.Vector3;
  h: THREE.Vector3;
  q: THREE.Quaternion;
}

export interface Ruin {
  group: THREE.Group;
  boxes: RuinBox[];
  /** where a violet fire burns (one point light goes to the nearest) */
  fires: THREE.Vector3[];
}

/** A dead tree: a bent black trunk and a few bare, clawing branches (height 1). */
export function deadTreeGeo(seed: number) {
  const r = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.018, 0.05, 1, 7, 6);
  trunk.translate(0, 0.5, 0);
  const p = trunk.getAttribute('position');
  const lean = (r() - 0.5) * 0.12,
    lean2 = (r() - 0.5) * 0.12;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.sin(y * 4 + seed) * 0.02 + lean * y * y);
    p.setZ(i, p.getZ(i) + Math.cos(y * 3 + seed) * 0.02 + lean2 * y * y);
  }
  parts.push(trunk);
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const len = 0.22 + r() * 0.25;
    const b = new THREE.CylinderGeometry(0.004, 0.016, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(0.6 + r() * 0.7);
    b.rotateY(r() * Math.PI * 2);
    b.translate(0, 0.45 + r() * 0.45, 0);
    parts.push(b);
    const t = new THREE.CylinderGeometry(0.002, 0.007, len * 0.5, 4);
    t.translate(0, len * 0.25, 0);
    t.rotateZ(-0.3 + r() * 0.3);
    t.rotateY(r() * Math.PI * 2);
    t.translate(0, 0.55 + r() * 0.4, 0);
    parts.push(t);
  }
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
  parts.forEach((x) => x.dispose());
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _s = new THREE.Vector3(1, 1, 1);

/** Builds one ruin: parts placed in the ruin's frame, grounded where they stand. */
export class RuinKit {
  private parts = new Map<RuinMat, THREE.BufferGeometry[]>();
  private cracks: THREE.BufferGeometry[] = [];
  readonly boxes: RuinBox[] = [];
  readonly fires: THREE.Vector3[] = [];
  readonly r: () => number;
  private cy: number;
  private cos: number;
  private sin: number;
  constructor(
    readonly ox: number,
    readonly oz: number,
    readonly yaw: number,
    seed: number,
    /** sit every part on the ground under it (false: on the ruin's own floor) */
    private hug = true
  ) {
    this.r = mulberry32(seed);
    this.cy = heightAt(ox, oz);
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
  }
  /** The world point of a spot in the ruin's frame, with the ground height there. */
  world(x: number, z: number) {
    const wx = this.ox + x * this.cos + z * this.sin,
      wz = this.oz - x * this.sin + z * this.cos;
    return new THREE.Vector3(wx, this.hug ? heightAt(wx, wz) : this.cy, wz);
  }
  private put(mat: RuinMat, g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number, solid: THREE.Vector3 | null) {
    const at = this.world(x, z);
    at.y += y;
    _e.set(rx, ry + this.yaw, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(at, _q, _s);
    g.applyMatrix4(_m);
    const list = this.parts.get(mat) ?? this.parts.set(mat, []).get(mat)!;
    list.push(g.index ? g.toNonIndexed() : g);
    if (solid) this.boxes.push({ c: at.clone(), h: solid, q: _q.clone() });
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, mat: RuinMat = 'stone', solid = true) {
    this.put(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz, solid ? new THREE.Vector3(w / 2, h / 2, d / 2) : null);
  }
  /** Any geometry (centred on its own origin); solid gives the half-size of its box. */
  shape(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, mat: RuinMat = 'stone', solid: THREE.Vector3 | null = null) {
    this.put(mat, g, x, y, z, rx, ry, rz, solid);
  }
  crack(x: number, z: number, len: number, a: number) {
    const g = new THREE.PlaneGeometry(0.28, len).rotateX(-Math.PI / 2).rotateY(a + this.yaw);
    const at = this.world(x, z);
    g.translate(at.x, at.y + 0.09, at.z);
    this.cracks.push(g);
  }
  fire(x: number, z: number) {
    const at = this.world(x, z);
    this.fires.push(at);
    // A ring of stones and a tongue of violet flame (the flame is a glowing cone).
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.box(0.5, 0.35, 0.4, x + Math.cos(a) * 1.1, 0.15, z + Math.sin(a) * 1.1, 0, -a, 0, 'stone', false);
    }
    const flame = new THREE.ConeGeometry(0.55, 2.2, 7);
    this.shape(flame, x, 1.1, z, 0, 0, 0, 'flame');
  }
  finish(mats: Record<RuinMat, THREE.Material>, crackMat: THREE.Material): Ruin {
    const group = new THREE.Group();
    for (const [mat, list] of this.parts) {
      if (!list.length) continue;
      const g = mergeGeometries(list)!;
      list.forEach((x) => x.dispose());
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mats[mat]);
      mesh.castShadow = mat !== 'flame';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (this.cracks.length) {
      const g = mergeGeometries(this.cracks)!;
      this.cracks.forEach((x) => x.dispose());
      group.add(new THREE.Mesh(g, crackMat));
    }
    return { group, boxes: this.boxes, fires: this.fires };
  }
}

export type RuinKind = 'keep' | 'colonnade' | 'arch' | 'giant' | 'shacks' | 'obelisk' | 'wheel' | 'gallows';
export const RUIN_KINDS: RuinKind[] = ['keep', 'colonnade', 'arch', 'giant', 'shacks', 'obelisk', 'wheel', 'gallows'];
/** How far a ruin reaches (for keeping trees and other ruins off it). */
export const RUIN_R: Record<RuinKind, number> = { keep: 20, colonnade: 22, arch: 16, giant: 18, shacks: 16, obelisk: 10, wheel: 14, gallows: 8 };

/** A wild ruin of the Dark. */
export function ruin(k: RuinKit, kind: RuinKind) {
  const r = k.r;
  if (kind === 'keep') {
    // A broken round keep: a ring of wall at ragged heights, one side fallen in.
    const R = 8,
      n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (i >= 12 && i <= 14) continue;
      const h = 6 + r() * 14 * (i < 6 ? 1 : 0.6);
      k.box(3.1, h, 1.6, Math.cos(a) * R, h / 2 - 0.5, Math.sin(a) * R, 0, -a + Math.PI / 2, 0);
    }
    for (let i = 0; i < 16; i++) k.box(1 + r() * 2.4, 0.8 + r() * 1.6, 1 + r() * 2, 4 + r() * 10, 0.4, -12 + r() * 6, r(), r(), 0, 'stone', false);
    k.crack(0, 0, 9, 0.4);
    k.crack(3, 2, 6, 1.6);
  } else if (kind === 'colonnade') {
    for (let row = -1; row <= 1; row += 2)
      for (let i = 0; i < 8; i++) {
        const x = -14 + i * 4,
          z = row * 5;
        if (r() < 0.25) {
          k.box(1.4, 1.4, 7, x + 1, 0.7, z + row * 3.5);
          continue;
        }
        const h = r() < 0.4 ? 9 : 2 + r() * 6;
        k.box(1.4, h, 1.4, x, h / 2 - 0.3, z);
        if (h >= 9 && i < 7 && r() < 0.6) k.box(5.2, 1, 1.6, x + 2, 9.2, z, 0, 0, 0, 'stone', false);
      }
    k.crack(-4, 0, 12, 0.2);
    k.crack(6, -1, 8, -0.5);
  } else if (kind === 'arch') {
    k.box(4, 18, 4, -8, 8.5, 0);
    k.box(4, 13, 4, 8, 6, 0);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      k.box(3, 3.4, 4, Math.cos(a) * 8, 16 + Math.sin(a) * 6, 0, 0, 0, a - Math.PI / 2, 'stone', false);
    }
    for (let i = 0; i < 8; i++) k.box(1 + r() * 2.5, 1 + r() * 1.5, 1 + r() * 2.5, 4 + r() * 8, 0.5, -3 + r() * 6, r(), r(), 0, 'stone', false);
    k.crack(0, 0, 10, 1.57);
  } else if (kind === 'giant') {
    // A fallen giant: a statue as tall as a tower, face-down in the dirt. Its face was cut away.
    k.box(6, 4, 16, 0, 2, 0, 0, 0, 0.12);
    k.box(3, 3, 9, 4.5, 1.5, -10, 0.3, 0, 0.2);
    k.box(3, 3, 10, -4.5, 1.5, -9, -0.2, 0, -0.1);
    k.shape(new THREE.IcosahedronGeometry(3.2, 1), 0.5, 2.6, 11.5, 0, 0, 0, 'stone', new THREE.Vector3(2.6, 2.6, 2.6));
    k.box(2.4, 7, 2.4, -7, 3.5, 6, 0.1, 0, 0.5);
    k.box(0.5, 9, 0.5, -9.5, 6, 6.5, 0.2, 0, 0.9, 'char', false);
    // a halo of a wheel, snapped off its head
    k.shape(new THREE.TorusGeometry(4.2, 0.45, 6, 20, Math.PI * 1.3), 3, 1.2, 15, Math.PI / 2 - 0.2, 0, 0.3, 'stone');
    k.crack(0, 6, 14, 0.1);
  } else if (kind === 'shacks') {
    // A huddle of burned-out shacks round a dead fire.
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4,
        d = 7 + r() * 4;
      shack(k, Math.cos(a) * d, Math.sin(a) * d, a);
    }
    if (r() < 0.5) k.fire(0, 0);
    k.crack(0, 0, 8, r() * 3);
  } else if (kind === 'obelisk') {
    const h = 14 + r() * 10;
    k.box(3.4, 1.4, 3.4, 0, 0.5, 0);
    k.box(2, h, 2, 0, h / 2 + 0.6, 0, (r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16);
    k.box(2, 4, 2, 3.6, 0.9, 1.2, 0.2, 0.4, 1.4, 'stone', false);
    for (let i = 0; i < 4; i++) k.crack(0, 0, 6 + r() * 6, (i * Math.PI) / 2 + r() * 0.4);
  } else if (kind === 'wheel') {
    // A toppled Sunwheel, half sunk in the ground, its spokes snapped.
    const R = 6;
    k.shape(new THREE.TorusGeometry(R, 0.7, 8, 28), 0, R * 0.55, 0, 0.25, 0, 0.05, 'stone', null);
    for (let i = 0; i < 8; i++) {
      if (r() < 0.45) continue;
      const a = (i / 8) * Math.PI * 2;
      k.box(0.5, R * 0.9, 0.5, Math.cos(a) * R * 0.45, R * 0.55 + Math.sin(a) * R * 0.45 * Math.cos(0.25), Math.sin(a) * 0.1, 0.25, 0, a + Math.PI / 2, 'stone', false);
    }
    k.box(3.2, 1.6, 3.2, 0, 0.6, 0, 0, 0.3, 0);
    k.box(R * 2.2, 1, 1.6, 0, 0.3, -1.2, 0, 0, 0, 'stone', true);
    for (let i = 0; i < 6; i++) k.crack(0, 0, 8 + r() * 8, (i / 6) * Math.PI * 2);
  } else {
    // Gallows on a mound: a black beam, chains of nothing.
    k.box(0.5, 6, 0.5, -2, 3, 0, 0, 0, 0, 'char');
    k.box(0.5, 6, 0.5, 2, 3, 0, 0, 0, 0.04, 'char');
    k.box(5.4, 0.5, 0.5, 0, 6, 0, 0, 0, 0, 'char', false);
    for (let i = 0; i < 3; i++) k.box(0.06, 2 + r(), 0.06, -1.5 + i * 1.5, 4.6, 0, 0, 0, 0, 'bone', false);
    k.box(6, 0.6, 3, 0, 0.3, 0, 0, 0, 0, 'char');
  }
}

/** A burned-out shack: four charred posts, a sagging ridge beam, a fallen roof, one stone chimney. */
export function shack(k: RuinKit, x: number, z: number, a: number) {
  const r = k.r;
  const c = Math.cos(a),
    s = Math.sin(a);
  const at = (dx: number, dz: number): [number, number] => [x + dx * c + dz * s, z - dx * s + dz * c];
  for (const [dx, dz] of [
    [-2, -1.6],
    [2, -1.6],
    [-2, 1.6],
    [2, 1.6],
  ]) {
    const [px, pz] = at(dx, dz);
    k.box(0.3, 2.4, 0.3, px, 1.2, pz, (r() - 0.5) * 0.2, a, (r() - 0.5) * 0.2, 'char');
  }
  const [bx, bz] = at(0, 0);
  k.box(4.6, 0.25, 0.25, bx, 2.6, bz, 0, a, 0.12, 'char', false);
  const [rx, rz] = at(0.2, -0.6);
  k.box(4.4, 0.12, 2.2, rx, 0.9, rz, 0.6, a, 0.1, 'char', false);
  const [cx, cz] = at(-1.2, 1.7);
  k.box(1.6, 1.4 + r() * 2, 0.6, cx, 0.9, cz, 0, a, 0.05, 'stone', true);
}

/** A cracked gravestone, leaning. */
export function grave(k: RuinKit, x: number, z: number) {
  const r = k.r;
  k.box(0.7, 1 + r() * 0.6, 0.18, x, 0.4, z, (r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5, 'stone', false);
}

/** The ruined mirror of a living place: what stands where a town stands, in the Dark. */
export type MirrorKind = 'town' | 'harbour' | 'palace' | 'hold' | 'tree' | 'glass';

export function mirror(k: RuinKit, kind: MirrorKind, size: number) {
  const r = k.r;
  if (kind === 'palace') {
    // A palace older than the one above: a ring of colossal columns round a
    // fallen Sunwheel the size of a house, and a statue with no face.
    const R = 44;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const broken = r() < 0.35;
      const h = broken ? 4 + r() * 10 : 26 + r() * 6;
      k.box(3.4, h, 3.4, Math.cos(a) * R, h / 2 - 0.5, Math.sin(a) * R, 0, -a, broken ? (r() - 0.5) * 0.2 : 0);
    }
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      k.box(3.4, 3.4, 12 + r() * 8, Math.cos(a) * (R - 8), 1.7, Math.sin(a) * (R - 8), 0, a, 0.05);
    }
    k.shape(new THREE.TorusGeometry(15, 1.6, 10, 40), 0, 13, -10, 0.35, 0, 0.12, 'stone', null);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (i % 3 === 1) continue;
      k.box(1, 14, 1, Math.cos(a) * 6.5, 13 + Math.sin(a) * 6.5 * 0.94, -10 + Math.sin(a) * 2.3, 0.35, 0, a + Math.PI / 2, 'stone', false);
    }
    // The faceless king on his plinth.
    k.box(9, 3, 9, 0, 1.5, 18);
    k.box(4.5, 11, 3, 0, 8.5, 18);
    k.box(6.5, 2.4, 3.4, 0, 14.6, 18);
    k.box(2.6, 3, 2.6, 0, 17.4, 18.4, 0, 0, 0, 'stone', false);
    k.box(2.4, 2.6, 0.6, 0, 17.4, 19.9, 0, 0, 0, 'glass', false);
    k.shape(new THREE.TorusGeometry(3.4, 0.28, 6, 24), 0, 18.4, 17.2, 0, 0, 0, 'stone');
    for (let i = 0; i < 10; i++) k.crack(0, 0, 18 + r() * 20, (i / 10) * Math.PI * 2);
    k.fire(-14, 10);
    k.fire(14, 10);
    return;
  }
  if (kind === 'tree') {
    // A tree as tall as a tower, turned to stone and long dead.
    const H = 130;
    k.shape(new THREE.CylinderGeometry(6, 16, H, 12, 6), 0, H / 2 - 2, 0, 0, 0, 0.02, 'char', new THREE.Vector3(11, H / 2, 11));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r(),
        y = 50 + i * 8 + r() * 10,
        len = 28 + r() * 26;
      const g = new THREE.CylinderGeometry(0.8, 2.6, len, 6).translate(0, len / 2, 0).rotateZ(1.0 + r() * 0.4);
      k.shape(g, 0, y, 0, 0, a, 0, 'char');
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.8, 3.2, 26, 5).translate(0, 13, 0).rotateZ(1.25);
      k.shape(g, Math.cos(a) * 10, 0, Math.sin(a) * 10, 0, -a, 0, 'char');
    }
    k.fire(24, 0);
    return;
  }
  if (kind === 'hold') {
    // A hold's gate, split down the middle: two pillars as tall as a cliff.
    k.box(9, 40, 9, -12, 19, 0, 0, 0, -0.06);
    k.box(9, 34, 9, 12, 16, 0, 0, 0, 0.09);
    k.box(10, 4, 14, 0, 1.5, 8, 0.2, 0.3, 0, 'stone', true);
    for (let i = 0; i < 10; i++) k.box(2 + r() * 3, 1.5 + r() * 2, 2 + r() * 3, (r() - 0.5) * 30, 0.8, 4 + r() * 14, r(), r(), 0, 'stone', false);
    k.fire(0, -8);
    k.crack(0, 0, 24, 0);
    return;
  }
  if (kind === 'glass') {
    // The desert's mirror: spires of black glass where the sun once fell for a hundred years.
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2,
        d = 6 + r() * size * 0.8,
        h = 6 + r() * 22;
      k.shape(new THREE.ConeGeometry(1.2 + r() * 1.6, h, 5), Math.cos(a) * d, h / 2 - 0.5, Math.sin(a) * d, (r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4, 'glass', new THREE.Vector3(1, h / 2, 1));
    }
    for (let i = 0; i < 8; i++) k.crack(0, 0, 12 + r() * 14, (i / 8) * Math.PI * 2);
    return;
  }
  // A town or a harbour: a broken ring of wall, burned shacks, a fallen statue, a violet fire.
  const R = size;
  const segs = Math.round(R * 0.9);
  for (let i = 0; i < segs; i++) {
    if (r() < 0.45) continue;
    const a = (i / segs) * Math.PI * 2,
      h = 1 + r() * 4;
    k.box(((Math.PI * 2 * R) / segs) * 0.92, h, 1.1, Math.cos(a) * R, h / 2 - 0.3, Math.sin(a) * R, 0, -a + Math.PI / 2, (r() - 0.5) * 0.1);
  }
  const n = Math.round(R / 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5,
      d = R * (0.35 + r() * 0.45);
    shack(k, Math.cos(a) * d, Math.sin(a) * d, a + Math.PI / 2);
  }
  // the fallen statue in the square
  k.box(2.6, 1.6, 7, 3, 0.8, 2, 0, 0.6, 0.15);
  k.shape(new THREE.IcosahedronGeometry(1.3, 1), 6.2, 0.9, 5.4, 0, 0, 0, 'stone');
  k.box(3, 1.2, 3, 0, 0.6, 0);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2,
      d = R * (0.2 + r() * 0.7);
    grave(k, Math.cos(a) * d, Math.sin(a) * d);
  }
  k.fire(-4, -4);
  if (kind === 'harbour') {
    // Black hulls on the dry bed beyond the town.
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2,
        d = R + 10 + r() * 20;
      const len = 14 + r() * 10;
      k.shape(new THREE.CylinderGeometry(2.6, 2.6, len, 8, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), Math.cos(a) * d, 1.2, Math.sin(a) * d, 0.2 + r() * 0.3, a, 0, 'char', new THREE.Vector3(len / 2, 1.6, 2.6));
      k.box(0.4, 9, 0.4, Math.cos(a) * d, 4.5, Math.sin(a) * d, 0.4, a, 0.3, 'char', false);
    }
  }
  for (let i = 0; i < 6; i++) k.crack((r() - 0.5) * R, (r() - 0.5) * R, 6 + r() * 10, r() * 3);
}
