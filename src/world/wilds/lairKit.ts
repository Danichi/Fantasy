import * as THREE from 'three';
import { compressedGltf } from '../../core/gltf';
import { mulberry32 } from '../../core/math';
import { physics } from '../../physics/physics';
import { heightAt } from '../terrainHeight';
import { GRASS_MASKS } from '../groundWindow';
import { StaticBatch } from '../cityKit';
import { worldUV, type WorldMats } from '../buildings';

// Set-dressing for the bosses' lairs, built from primitives (batched into a
// few meshes per lair) plus the stylized tree and mushroom models from the
// nature pack, instanced: a dense ring of old trees so each lair reads as a
// clearing deep in the wood. Bones, skulls and ribcages, totems and stakes,
// standing stones, mud, pools, cave mouths, antler shrines.

const NATURE = '/assets/vendor/stylized/';
const TREE_FILES: [string, number][] = [['CommonTree_1.glb', 13], ['CommonTree_2.glb', 16], ['CommonTree_3.glb', 12], ['CommonTree_4.glb', 18], ['CommonTree_5.glb', 14]];
const PINE_FILES: [string, number][] = [['Pine_1.glb', 17], ['Pine_2.glb', 21], ['Pine_4.glb', 18], ['Pine_5.glb', 15]];

interface Proto { parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[]; scale: number }
const PROTOS = new Map<string, Promise<Proto>>();

function proto(file: string, height: number) {
  let p = PROTOS.get(file);
  if (!p) {
    p = compressedGltf.loadAsync(NATURE + file).then((g) => {
      const root = g.scene;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const inv = root.matrixWorld.clone().invert();
      const parts: Proto['parts'] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) parts.push({ geo: m.geometry, mat: m.material, local: inv.clone().multiply(m.matrixWorld) });
      });
      return { parts, scale: height / Math.max(0.01, box.max.y - box.min.y) };
    });
    PROTOS.set(file, p);
  }
  return p;
}

/** One lair's dressing: a group to show/hide, and what's in it. */
export class LairKit {
  readonly group = new THREE.Group();
  readonly batch = new StaticBatch();
  readonly rnd: () => number;
  private cols = new Map<number, THREE.MeshStandardMaterial>();
  private trees: { file: string; h: number; x: number; z: number; s: number; yaw: number }[] = [];
  /** glowing bits to pulse (mushrooms, runes, the fire) */
  readonly glows: THREE.MeshStandardMaterial[] = [];
  /** fires and their flames */
  readonly fires: { at: THREE.Vector3; flame: THREE.Mesh }[] = [];

  constructor(readonly x: number, readonly z: number, seed: number, readonly m: WorldMats) {
    this.rnd = mulberry32(seed);
  }

  col(c: number, rough = 0.95) {
    let mm = this.cols.get(c);
    if (!mm) this.cols.set(c, (mm = new THREE.MeshStandardMaterial({ color: c, roughness: rough })));
    return mm;
  }
  y(x: number, z: number) {
    return heightAt(x, z);
  }
  /** Add a primitive at world (x, ground + dy, z). */
  add(g: THREE.BufferGeometry, mat: THREE.Material, x: number, dy: number, z: number, ry = 0, rx = 0, rz = 0) {
    const mesh = new THREE.Mesh(worldUV(g, 1.5), mat);
    mesh.position.set(x, this.y(x, z) + dy, z);
    mesh.rotation.set(rx, ry, rz);
    this.batch.addObject(mesh);
    return mesh;
  }
  /** Local (relative to the lair centre) helpers. */
  at(dx: number, dz: number) {
    return { x: this.x + dx, z: this.z + dz };
  }

  rock(x: number, z: number, s: number, collide = true) {
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1, 0.6 + this.rnd() * 0.5, 1);
    this.add(g, this.m.stone, x, s * 0.25, z, this.rnd() * 3, (this.rnd() - 0.5) * 0.3);
    if (collide && s > 0.6) physics.addCylinder(new THREE.Vector3(x, this.y(x, z) + s * 0.4, z), s * 0.5, s * 0.8);
  }
  mossyRock(x: number, z: number, s: number) {
    this.rock(x, z, s);
    const g = new THREE.SphereGeometry(s * 0.75, 7, 5);
    g.scale(1, 0.32, 1);
    this.add(g, this.col(0x4f6a2a, 1), x + s * 0.1, s * 0.62, z, this.rnd() * 3);
  }
  bone(x: number, z: number, len = 0.7) {
    const yaw = this.rnd() * 6;
    this.add(new THREE.CylinderGeometry(0.04, 0.05, len, 5).rotateZ(Math.PI / 2), this.col(0xe6dcc4, 0.8), x, 0.05, z, yaw);
    for (const s of [-1, 1]) this.add(new THREE.SphereGeometry(0.07, 6, 4), this.col(0xe6dcc4, 0.8), x + Math.cos(yaw) * s * len * 0.5, 0.06, z - Math.sin(yaw) * s * len * 0.5);
  }
  bones(x: number, z: number, n: number, spread: number) {
    for (let k = 0; k < n; k++) this.bone(x + (this.rnd() - 0.5) * spread, z + (this.rnd() - 0.5) * spread, 0.4 + this.rnd() * 0.6);
  }
  skull(x: number, z: number, dy = 0.12, s = 1, yaw = this.rnd() * 6) {
    const bone = this.col(0xe8e0c8, 0.7);
    const g = new THREE.SphereGeometry(0.17 * s, 9, 7);
    g.scale(1, 0.9, 1.15);
    this.add(g, bone, x, dy + 0.1 * s, z, yaw);
    this.add(new THREE.BoxGeometry(0.2 * s, 0.1 * s, 0.14 * s), bone, x + Math.sin(yaw) * 0.12 * s, dy + 0.02, z + Math.cos(yaw) * 0.12 * s, yaw);
    for (const e of [-1, 1]) this.add(new THREE.SphereGeometry(0.045 * s, 6, 4), this.col(0x120c08), x + Math.sin(yaw) * 0.16 * s + Math.cos(yaw) * e * 0.06 * s, dy + 0.13 * s, z + Math.cos(yaw) * 0.16 * s - Math.sin(yaw) * e * 0.06 * s);
  }
  /** A great beast's ribcage arching out of the ground. */
  ribcage(x: number, z: number, yaw: number, s = 1) {
    const bone = this.col(0xe0d6bc, 0.85);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.add(new THREE.CylinderGeometry(0.09 * s, 0.11 * s, 3.4 * s, 6).rotateX(Math.PI / 2), bone, x, 0.25 * s, z, yaw);
    for (let k = 0; k < 7; k++) {
      const t = (k - 3) * 0.42 * s;
      for (const side of [-1, 1]) {
        const rib = new THREE.TorusGeometry(0.9 * s * (1 - Math.abs(k - 3) * 0.08), 0.05 * s, 4, 10, Math.PI * 0.55);
        rib.rotateY(Math.PI / 2);
        rib.rotateZ(side > 0 ? 0 : Math.PI * 0.45);
        this.add(rib, bone, x + fx * t, 0.15, z + fz * t, yaw + (side > 0 ? 0 : Math.PI), 0, 0);
      }
    }
    this.skull(x + fx * 2.1 * s, z + fz * 2.1 * s, 0.05, 2.4 * s, yaw);
  }
  stake(x: number, z: number, h = 2.4, skull = false) {
    this.add(new THREE.CylinderGeometry(0.07, 0.11, h, 6), this.m.bark, x, h / 2 - 0.1, z);
    this.add(new THREE.ConeGeometry(0.08, 0.35, 6), this.m.bark, x, h + 0.05, z);
    if (skull) this.skull(x, z, h - 0.35);
  }
  /** A totem pole: carved bands, a crossbar of horns, skulls stacked up it. */
  totem(x: number, z: number, h = 4.2, paint = 0x7a1a12) {
    const wood = this.col(0x4a3424, 1);
    this.add(new THREE.CylinderGeometry(0.28, 0.36, h, 8), wood, x, h / 2, z);
    for (let k = 0; k < 3; k++) this.add(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 8), this.col(paint, 0.9), x, 0.8 + k * (h / 3.5), z);
    for (let k = 0; k < 3; k++) this.skull(x + Math.cos(k * 2.1) * 0.3, z + Math.sin(k * 2.1) * 0.3, 1.2 + k * 0.9, 1.05);
    this.add(new THREE.BoxGeometry(2.2, 0.18, 0.18), wood, x, h - 0.5, z, this.rnd() * 3);
    for (const s of [-1, 1]) {
      const horn = new THREE.ConeGeometry(0.12, 1.1, 6);
      horn.rotateZ(s * (Math.PI / 2 + 0.4));
      this.add(horn, this.col(0xd8ccb0, 0.6), x + s * 1.3, h - 0.3, z);
    }
    this.skull(x, z, h - 0.05, 1.5);
    physics.addCylinder(new THREE.Vector3(x, this.y(x, z) + h / 2, z), h / 2, 0.36);
  }
  standingStone(x: number, z: number, h: number, yaw: number, mossy = true) {
    this.add(new THREE.BoxGeometry(1.1, h, 0.75), this.m.stone, x, h / 2 - 0.25, z, yaw, (this.rnd() - 0.5) * 0.08, (this.rnd() - 0.5) * 0.1);
    if (mossy) this.add(new THREE.BoxGeometry(1.15, 0.3, 0.8), this.col(0x4f6a2a, 1), x, h - 0.3, z, yaw);
    physics.addBox(new THREE.Vector3(x, this.y(x, z) + h / 2, z), new THREE.Vector3(0.55, h / 2, 0.38), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }
  stump(x: number, z: number, r: number) {
    this.add(new THREE.CylinderGeometry(r * 0.85, r, r * 1.1, 10), this.m.bark, x, r * 0.5, z);
    this.add(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.04, 10), this.col(0x8a6a44), x, r * 1.06, z);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + this.rnd();
      const root = new THREE.ConeGeometry(r * 0.3, r * 1.6, 5);
      root.rotateZ(Math.PI / 2 - 0.3);
      root.rotateY(-a);
      this.add(root, this.m.bark, x + Math.cos(a) * r * 0.9, 0.1, z + Math.sin(a) * r * 0.9);
    }
    physics.addCylinder(new THREE.Vector3(x, this.y(x, z) + r * 0.5, z), r * 0.55, r);
  }
  log(x: number, z: number, yaw: number, len: number, r = 0.35, rootBall = false) {
    this.add(new THREE.CylinderGeometry(r * 0.85, r, len, 8).rotateZ(Math.PI / 2), this.m.bark, x, r * 0.8, z, yaw);
    if (rootBall) {
      const bx = x + Math.cos(yaw) * len * 0.5, bz = z - Math.sin(yaw) * len * 0.5;
      const ball = new THREE.DodecahedronGeometry(r * 2.6, 0);
      ball.scale(0.6, 1, 1);
      this.add(ball, this.col(0x4a3a2a, 1), bx, r * 1.6, bz, yaw);
      for (let k = 0; k < 6; k++) this.add(new THREE.CylinderGeometry(0.03, 0.07, 1.6, 4).rotateZ(this.rnd() * 3).rotateX(this.rnd() * 3), this.m.bark, bx, r * 1.6, bz);
    }
    physics.addBox(new THREE.Vector3(x, this.y(x, z) + r, z), new THREE.Vector3(len / 2, r, r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }
  /** A flat disc draped over the ground (mud, a pool, scorched earth). */
  disc(x: number, z: number, r: number, mat: THREE.Material, lift = 0.05) {
    const g = new THREE.CircleGeometry(r, 32, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const wobble = 1 + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5 + x) * 0.08;
      const px = x + p.getX(i) * wobble, pz = z + p.getZ(i) * wobble;
      p.setXYZ(i, px, heightAt(px, pz) + lift, pz);
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  /** Two boulder piers and a capstone round a black opening: a cave mouth in the hillside. */
  caveMouth(x: number, z: number, yaw: number, s = 1) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fz, sz = -fx;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const r = (1.6 + this.rnd() * 0.6) * s;
        const px = x + sx * side * 2.6 * s - fx * k * 1.2, pz = z + sz * side * 2.6 * s - fz * k * 1.2;
        const g = new THREE.DodecahedronGeometry(r, 1);
        g.scale(0.8, 1.2, 0.9);
        this.add(g, this.m.stone, px, r * 0.8 + k * 0.3, pz, this.rnd() * 3);
        physics.addCylinder(new THREE.Vector3(px, this.y(px, pz) + r, pz), r, r * 0.8);
      }
    }
    // The capstone and the hill behind.
    const cap = new THREE.DodecahedronGeometry(3.2 * s, 1);
    cap.scale(1.3, 0.55, 0.9);
    this.add(cap, this.m.stone, x - fx * 1.2, 4.2 * s, z - fz * 1.2, yaw);
    const hill = new THREE.SphereGeometry(7 * s, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2);
    hill.scale(1.3, 0.75, 1);
    this.add(hill, this.col(0x4a5a34, 1), x - fx * 6.5 * s, -0.4, z - fz * 6.5 * s, yaw);
    physics.addCylinder(new THREE.Vector3(x - fx * 6.5 * s, this.y(x, z) + 2.5, z - fz * 6.5 * s), 3, 6.5 * s);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * s, 3.4 * s), new THREE.MeshBasicMaterial({ color: 0x030303 }));
    dark.position.set(x - fx * 0.9, this.y(x, z) + 1.6 * s, z - fz * 0.9);
    dark.rotation.y = yaw;
    this.group.add(dark);
  }
  /** Antlers: a forked, branching rack (one merged geometry per call). */
  antlers(x: number, dy: number, z: number, yaw: number, s: number, mat: THREE.Material) {
    for (const side of [-1, 1]) {
      const beam = new THREE.CylinderGeometry(0.04 * s, 0.07 * s, 1.4 * s, 5);
      beam.translate(0, 0.7 * s, 0);
      beam.rotateZ(side * 0.6);
      this.add(beam, mat, x, dy, z, yaw);
      for (let k = 0; k < 3; k++) {
        const tine = new THREE.ConeGeometry(0.03 * s, 0.5 * s, 4);
        tine.translate(0, 0.25 * s, 0);
        tine.rotateZ(side * (0.1 + k * 0.25));
        tine.translate(side * (0.25 + k * 0.25) * s, (0.35 + k * 0.3) * s, 0);
        this.add(tine, mat, x, dy, z, yaw);
      }
    }
  }
  /** A hide lean-to on two poles. */
  leanTo(x: number, z: number, yaw: number) {
    const hide = new THREE.MeshStandardMaterial({ color: 0x6a4e34, roughness: 0.95, side: THREE.DoubleSide });
    for (const s of [-1, 1]) this.add(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 5), this.m.bark, x + Math.cos(yaw) * s * 1.4, 1.1, z - Math.sin(yaw) * s * 1.4);
    const sheet = new THREE.PlaneGeometry(3.2, 2.6);
    sheet.rotateX(-0.9);
    this.add(sheet, hide, x - Math.sin(yaw) * 0.9, 1.15, z - Math.cos(yaw) * 0.9, yaw);
    physics.addBox(new THREE.Vector3(x, this.y(x, z) + 1, z), new THREE.Vector3(1.5, 1, 1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }
  /** A ring of stones with logs, and a flame that burns (or doesn't). */
  campfire(x: number, z: number, lit: boolean) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.add(new THREE.IcosahedronGeometry(0.22, 0), this.m.stone, x + Math.cos(a) * 0.75, 0.1, z + Math.sin(a) * 0.75);
    }
    for (let k = 0; k < 4; k++) this.add(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6).rotateX(Math.PI / 2 - 0.35).rotateY((k / 4) * Math.PI * 2), this.m.bark, x, 0.22, z);
    if (!lit) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a1206, emissive: 0xff7a2a, emissiveIntensity: 1.8 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), mat);
    flame.position.set(x, this.y(x, z) + 0.6, z);
    this.group.add(flame);
    this.fires.push({ at: new THREE.Vector3(x, this.y(x, z) + 0.5, z), flame });
    GRASS_MASKS.push({ x, z, r: 2.4, amount: 0.9 });
  }
  /** An iron-banded cage of poles. */
  cage(x: number, z: number) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), this.m.bark, x + Math.cos(a) * 1.1, 1.1, z + Math.sin(a) * 1.1);
    }
    this.add(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 10), this.m.planks, x, 2.25, z);
    physics.addCylinder(new THREE.Vector3(x, this.y(x, z) + 1.1, z), 1.1, 1.15);
  }
  /** Glowing mushrooms in a fairy ring (one emissive material, pulsed). */
  mushroomRing(x: number, z: number, r: number, n: number, color: number) {
    const cap = new THREE.MeshStandardMaterial({ color: 0xe8f0d0, emissive: new THREE.Color(color), emissiveIntensity: 0.8, roughness: 0.6 });
    const stem = this.col(0xe8e0c8, 0.8);
    this.glows.push(cap);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.rnd() * 0.3, rr = r * (0.9 + this.rnd() * 0.2);
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, s = 0.6 + this.rnd() * 0.9;
      this.add(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.35 * s, 6), stem, px, 0.17 * s, pz);
      const c = new THREE.SphereGeometry(0.2 * s, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      c.scale(1, 0.6, 1);
      this.add(c, cap, px, 0.34 * s, pz);
    }
  }
  /** Ferns and long grass tufts where the light gets in. */
  ferns(x: number, z: number, r: number, n: number) {
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.9, side: THREE.DoubleSide });
    for (let k = 0; k < n; k++) {
      const a = this.rnd() * Math.PI * 2, rr = Math.sqrt(this.rnd()) * r;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.PlaneGeometry(0.22, 0.9);
        frond.translate(0, 0.45, 0);
        frond.rotateX(-0.7);
        frond.rotateY((f / 5) * Math.PI * 2);
        this.add(frond, leaf, px, 0, pz, this.rnd());
      }
    }
  }

  /**
   * A ring of old trees round the lair (pines or broadleaves), leaving a gap
   * toward `openYaw` so there's a way in. Placed once their models load.
   */
  treeRing(r0: number, r1: number, n: number, kind: 'tree' | 'pine' | 'mix', openYaw: number, gap = 0.6) {
    const files = kind === 'tree' ? TREE_FILES : kind === 'pine' ? PINE_FILES : [...TREE_FILES, ...PINE_FILES];
    let placed = 0;
    for (let tries = 0; tries < n * 10 && placed < n; tries++) {
      const a = this.rnd() * Math.PI * 2;
      const off = Math.atan2(Math.sin(a - openYaw), Math.cos(a - openYaw));
      if (Math.abs(off) < gap) continue;
      const r = r0 + this.rnd() * (r1 - r0);
      const [file, h] = files[Math.floor(this.rnd() * files.length)];
      const x = this.x + Math.sin(a) * r, z = this.z + Math.cos(a) * r;
      if (this.trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 16)) continue;
      this.trees.push({ file, h, x, z, s: 0.85 + this.rnd() * 0.45, yaw: this.rnd() * Math.PI * 2 });
      physics.addCylinder(new THREE.Vector3(x, this.y(x, z) + 2, z), 2, 0.45);
      placed++;
    }
  }
  /** Pale-barked trees (a birch grove): our own trunks under the pack's canopies. */
  birches(r0: number, r1: number, n: number, openYaw: number) {
    const bark = this.col(0xe8e4d8, 0.8), mark = this.col(0x2a2622, 1);
    const crown = new THREE.MeshStandardMaterial({ color: 0x8aa84a, roughness: 0.9, flatShading: true });
    for (let k = 0; k < n; k++) {
      const a = this.rnd() * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - openYaw), Math.cos(a - openYaw))) < 0.5) continue;
      const r = r0 + this.rnd() * (r1 - r0), x = this.x + Math.sin(a) * r, z = this.z + Math.cos(a) * r;
      const h = 9 + this.rnd() * 5;
      this.add(new THREE.CylinderGeometry(0.16, 0.26, h, 7), bark, x, h / 2, z);
      for (let b = 0; b < 4; b++) this.add(new THREE.CylinderGeometry(0.265, 0.265, 0.08, 7), mark, x, 1 + b * 1.7 + this.rnd(), z);
      for (let c = 0; c < 3; c++) this.add(new THREE.IcosahedronGeometry(1.5 + this.rnd(), 0), crown, x + (this.rnd() - 0.5) * 2, h - 1 + c * 0.9, z + (this.rnd() - 0.5) * 2, this.rnd() * 3);
      physics.addCylinder(new THREE.Vector3(x, this.y(x, z) + 2, z), 2, 0.3);
    }
  }

  /** Bake the primitives and lay the trees in (async: the tree models load). */
  async finish(scene: THREE.Scene) {
    this.batch.build(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(this.group);
    const byFile = new Map<string, typeof this.trees>();
    for (const t of this.trees) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [file, list] of byFile) {
      try {
        const pr = await proto(file, list[0].h);
        for (const part of pr.parts) {
          const inst = new THREE.InstancedMesh(part.geo, part.mat, list.length);
          list.forEach((t, i) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
            mtx.compose(p.set(t.x, heightAt(t.x, t.z) - 0.1, t.z), q, s.setScalar(pr.scale * t.s)).multiply(part.local);
            inst.setMatrixAt(i, mtx);
          });
          inst.castShadow = true;
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          this.group.add(inst);
        }
      } catch (e) {
        console.warn('[wilds] lair tree failed to load', file, e);
      }
    }
  }
}
