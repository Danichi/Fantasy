import * as THREE from 'three';
import { registerDoor } from './doors';
import { StaticBatch } from './cityKit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHouse, worldUV, type HouseSpec, type WorldMats } from './buildings';
import { heightAt, streetDist, roadDist, TOWN_R, PLAZA_CENTER } from './terrain';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { WIND } from './grass';
import type { FX } from '../fx/particles';

// Elderglen village dressing (docs/ART-DIRECTION.md §6): cottages clustered
// along the paths, and every house gets a yard, fences, gardens and clutter
// so nothing stands on bare ground. Props are built from simple shapes in the
// painted materials and merged by material, so the whole village is a
// handful of draw calls.

export interface PlacedHouse {
  x: number;
  z: number;
  rot: number;
  half: THREE.Vector3;
  chimney: THREE.Vector3 | null; // local space
}

export interface Village {
  /** lantern glass (brightens at dusk) */
  lanternMat: THREE.MeshStandardMaterial;
  /** every house in town (authored and generated), for homes and NPC routes */
  houses: PlacedHouse[];
  /** Open spots for town trees (yards, greens). */
  treeSpots: THREE.Vector3[];
  /** Spots for flowers and bushes along walls and fences. */
  flowerSpots: THREE.Vector3[];
  update(dt: number): void;
}

type Part = 'timber' | 'planks' | 'stone' | 'bark' | 'soil' | 'leafy' | 'cloth' | 'metal' | 'glass';

class Kit {
  parts: Record<Part, THREE.BufferGeometry[]> = { timber: [], planks: [], stone: [], bark: [], soil: [], leafy: [], cloth: [], metal: [], glass: [] };
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /** Add a box in a local frame (origin, yaw) at local offset. */
  box(part: Part, o: THREE.Vector3, yaw: number, lx: number, ly: number, lz: number, w: number, h: number, d: number, color?: THREE.Color, rx = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.place(part, g, o, yaw, lx, ly, lz, color, rx, rz, 1.2);
  }

  cyl(part: Part, o: THREE.Vector3, yaw: number, lx: number, ly: number, lz: number, r: number, h: number, color?: THREE.Color, rx = 0, rz = 0, seg = 8) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    this.place(part, g, o, yaw, lx, ly, lz, color, rx, rz, 1);
  }

  place(part: Part, g: THREE.BufferGeometry, o: THREE.Vector3, yaw: number, lx: number, ly: number, lz: number, color?: THREE.Color, rx = 0, rz = 0, uv = 1) {
    this.e.set(rx, 0, rz);
    g.applyMatrix4(this.m.makeRotationFromEuler(this.e));
    g.translate(lx, ly, lz);
    g.applyMatrix4(this.m.compose(o, this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
    const ng = g.index ? g.toNonIndexed() : g;
    worldUV(ng, uv);
    const c = color ?? new THREE.Color(1, 1, 1);
    const col = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts[part].push(ng);
  }

  build(scene: THREE.Scene, mats: Record<Part, THREE.Material>) {
    for (const key of Object.keys(this.parts) as Part[]) {
      const list = this.parts[key];
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats[key]);
      mesh.castShadow = key !== 'glass' && key !== 'soil';
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

const hex = (h: number) => new THREE.Color(h);
const CLOTH = [0xe8dcc0, 0x7c9cc4, 0xc46a4e, 0xd9b95c, 0x8fae7a, 0xf1ece0].map(hex);

export function buildVillage(scene: THREE.Scene, m: WorldMats, fx: FX, houses: PlacedHouse[], keepClear: THREE.Vector2[]): Village {
  const rnd = mulberry32(5150);
  const kit = new Kit();
  const up = new THREE.Vector3(0, 1, 0);

  // ---- occupancy: houses, yards and props claim circles --------------------------
  const claims: { x: number; z: number; r: number }[] = houses.map((h) => ({ x: h.x, z: h.z, r: Math.hypot(h.half.x, h.half.z) + 1 }));
  const free = (x: number, z: number, r: number, pathPad = 2.5) => {
    if (Math.hypot(x, z) > TOWN_R - 8) return false;
    if (streetDist(x, z) < r + pathPad) return false;
    if (roadDist(x, z) < r + 3) return false;
    if (Math.hypot(x - PLAZA_CENTER.x, z - PLAZA_CENTER.y) < 20 + r) return false;
    for (const k of keepClear) if (Math.hypot(x - k.x, z - k.y) < r + 5) return false;
    for (const c of claims) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return false;
    return true;
  };

  // ---- extra cottages fronting the paths ----------------------------------------
  const extra: PlacedHouse[] = [];
  const cottages = new StaticBatch(); // merged per material, like the town's houses
  for (let tries = 0; tries < 900 && extra.length < 26; tries++) {
    const a = rnd() * Math.PI * 2;
    const rad = 26 + rnd() * 66;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
    const sd = streetDist(x, z);
    if (sd < 6.5 || sd > 13) continue;
    const floors: 1 | 2 = rnd() < 0.65 ? 1 : 2;
    const w = 5 + rnd() * 2.5, d = 4.5 + rnd() * 1.8;
    const r = Math.hypot(w, d) / 2 + 1.2;
    if (!free(x, z, r, 0)) continue;
    // Face the nearest path (down the distance gradient).
    const e = 0.5;
    const gx = streetDist(x + e, z) - streetDist(x - e, z);
    const gz = streetDist(x, z + e) - streetDist(x, z - e);
    const rot = Math.atan2(-gx, -gz) + (rnd() - 0.5) * 0.25;
    const roofPick = rnd();
    const spec: HouseSpec = { w, d, floors, roof: roofPick < 0.5 ? 'tile' : roofPick < 0.75 ? 'thatch' : 'slate', seed: 500 + extra.length };
    const { group, half, chimney, door } = buildHouse(spec, m);
    let gy = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gy = Math.min(gy, heightAt(x + sx * half.x, z + sz * half.z));
    group.position.set(x, gy, z);
    group.rotation.y = rot;
    cottages.addObject(group);
    registerDoor(group, door, spec);
    physics.addBox(new THREE.Vector3(x, gy + half.y, z), half, new THREE.Quaternion().setFromAxisAngle(up, rot));
    const ph = { x, z, rot, half, chimney };
    extra.push(ph);
    claims.push({ x, z, r });
  }
  cottages.build(scene, 60);
  const all = [...houses, ...extra];

  // ---- dressing per house -------------------------------------------------------
  const treeSpots: THREE.Vector3[] = [];
  const flowerSpots: THREE.Vector3[] = [];
  const smoke: THREE.Vector3[] = [];
  const at = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);

  const fence = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / 1.7));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.y = heightAt(p.x, p.z);
      kit.box('timber', p, yaw, 0, 0.5, 0, 0.13, 1.05, 0.13);
    }
    const mid = a.clone().lerp(b, 0.5);
    mid.y = (heightAt(a.x, a.z) + heightAt(b.x, b.z)) / 2;
    for (const y of [0.42, 0.82]) kit.box('timber', mid, yaw, 0, y, 0, 0.06, 0.09, len);
    physics.addBox(new THREE.Vector3(mid.x, mid.y + 0.55, mid.z), new THREE.Vector3(0.08, 0.55, len / 2), new THREE.Quaternion().setFromAxisAngle(up, yaw));
    // Flowers and weeds collect along fences.
    for (let i = 0; i < Math.floor(len / 3); i++) {
      if (rnd() < 0.6) {
        const p = a.clone().lerp(b, rnd());
        flowerSpots.push(at(p.x, p.z));
      }
    }
  };

  const barrel = (o: THREE.Vector3, yaw: number, lx: number, lz: number) => {
    const y0 = heightAt(o.x, o.z);
    const c = new THREE.Vector3(o.x, y0, o.z);
    kit.cyl('planks', c, yaw, lx, 0.45, lz, 0.34, 0.9, undefined, 0, 0, 10);
    kit.cyl('metal', c, yaw, lx, 0.2, lz, 0.355, 0.07, hex(0x4a4a50), 0, 0, 10);
    kit.cyl('metal', c, yaw, lx, 0.72, lz, 0.355, 0.07, hex(0x4a4a50), 0, 0, 10);
  };
  const crate = (o: THREE.Vector3, yaw: number, lx: number, lz: number, s = 0.7, ly = 0) => {
    const c = new THREE.Vector3(o.x, heightAt(o.x, o.z), o.z);
    const r = rnd() * 0.6;
    kit.box('planks', c, yaw + r, lx, ly + s / 2, lz, s, s, s);
    kit.box('timber', c, yaw + r, lx, ly + s / 2, lz, s + 0.04, 0.08, s + 0.04);
  };
  const bench = (o: THREE.Vector3, yaw: number) => {
    kit.box('planks', o, yaw, 0, 0.45, 0, 1.6, 0.08, 0.42);
    kit.box('planks', o, yaw, 0, 0.75, -0.2, 1.6, 0.35, 0.06);
    for (const sx of [-0.65, 0.65]) kit.box('timber', o, yaw, sx, 0.22, 0, 0.1, 0.45, 0.36);
  };
  const lantern = (o: THREE.Vector3) => {
    kit.cyl('timber', o, 0, 0, 1.3, 0, 0.07, 2.6);
    kit.box('timber', o, 0, 0.25, 2.55, 0, 0.55, 0.07, 0.07);
    kit.box('glass', o, 0, 0.45, 2.3, 0, 0.18, 0.28, 0.18);
    kit.box('metal', o, 0, 0.45, 2.47, 0, 0.24, 0.05, 0.24, hex(0x3b3b40));
  };
  const woodpile = (o: THREE.Vector3, yaw: number) => {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
      kit.cyl('bark', o, yaw, -0.9 + i * 0.36 + row * 0.18, 0.17 + row * 0.3, 0, 0.16, 1.1, undefined, Math.PI / 2, 0, 7);
    }
    kit.box('timber', o, yaw, 0, 1.25, -0.2, 2.2, 0.08, 1.2, undefined, 0.35);
    for (const sx of [-1.05, 1.05]) kit.box('timber', o, yaw, sx, 0.62, -0.55, 0.1, 1.25, 0.1);
  };
  const garden = (o: THREE.Vector3, yaw: number, w: number, d: number) => {
    kit.box('soil', o, yaw, 0, 0.06, 0, w, 0.14, d, hex(0x5a4330));
    const rows = Math.max(2, Math.floor(d / 0.7));
    const crop = [0x5f8f3a, 0x7aa843, 0x8fb54e, 0x6b9a3e][Math.floor(rnd() * 4)];
    for (let r = 0; r < rows; r++) {
      const lz = -d / 2 + (r + 0.5) * (d / rows);
      for (let lx = -w / 2 + 0.35; lx < w / 2 - 0.2; lx += 0.45) {
        const s = 0.22 + rnd() * 0.14;
        const g = new THREE.IcosahedronGeometry(s, 0);
        g.scale(1, 0.8, 1);
        kit.place('leafy', g, o, yaw, lx + (rnd() - 0.5) * 0.1, 0.12 + s * 0.6, lz, hex(crop).multiplyScalar(0.85 + rnd() * 0.3));
      }
    }
  };
  const washing = (o: THREE.Vector3, yaw: number, len: number) => {
    for (const sx of [-len / 2, len / 2]) kit.cyl('timber', o, yaw, sx, 1.05, 0, 0.05, 2.1);
    kit.box('timber', o, yaw, 0, 2.0, 0, len, 0.025, 0.025);
    let x = -len / 2 + 0.5;
    while (x < len / 2 - 0.6) {
      const w = 0.5 + rnd() * 0.5;
      const h = 0.6 + rnd() * 0.5;
      const g = new THREE.PlaneGeometry(w, h, 2, 3);
      g.translate(0, -h / 2, 0);
      kit.place('cloth', g, o, yaw, x + w / 2, 2.0, 0, CLOTH[Math.floor(rnd() * CLOTH.length)]);
      x += w + 0.15;
    }
  };

  for (const h of all) {
    const f = new THREE.Vector3(Math.sin(h.rot), 0, Math.cos(h.rot));
    const r = new THREE.Vector3(Math.cos(h.rot), 0, -Math.sin(h.rot));
    const c = new THREE.Vector3(h.x, 0, h.z);
    const hx = h.half.x, hz = h.half.z;
    const pt = (lx: number, lz: number) => c.clone().addScaledVector(r, lx).addScaledVector(f, lz).setY(0);
    const ground = (p: THREE.Vector3) => p.setY(heightAt(p.x, p.z));

    // Flowers along the front and sides of the house.
    for (const [lx, lz] of [[-hx + 0.3, hz + 0.45], [hx - 0.3, hz + 0.45], [-hx - 0.45, 0], [hx + 0.45, -hz * 0.5]]) {
      if (rnd() < 0.8) flowerSpots.push(ground(pt(lx, lz)));
    }
    // Front clutter: a bench on one side of the door, barrels or crates on the other.
    const side = rnd() < 0.5 ? -1 : 1;
    const benchP = ground(pt(side * (hx - 1.1), hz + 0.75));
    if (free(benchP.x, benchP.z, 0.6, 0.6)) bench(benchP, h.rot);
    const clutterP = pt(-side * (hx - 0.6), hz + 0.8);
    if (free(clutterP.x, clutterP.z, 0.8, 0.6)) {
      if (rnd() < 0.5) {
        barrel(clutterP, h.rot, 0, 0);
        barrel(clutterP, h.rot, 0.72, 0.1);
        if (rnd() < 0.5) crate(clutterP, h.rot, 0.3, -0.62, 0.6);
      } else {
        crate(clutterP, h.rot, 0, 0);
        crate(clutterP, h.rot, 0.05, 0.02, 0.55, 0.7);
        barrel(clutterP, h.rot, 0.78, 0.15);
      }
      physics.addBox(new THREE.Vector3(clutterP.x, heightAt(clutterP.x, clutterP.z) + 0.45, clutterP.z), new THREE.Vector3(0.75, 0.45, 0.6), new THREE.Quaternion().setFromAxisAngle(up, h.rot));
    }
    // A lantern post at the front corner for about half the houses.
    if (rnd() < 0.55) {
      const lp = ground(pt(side * (hx + 0.9), hz + 1.4));
      if (free(lp.x, lp.z, 0.3, 0.4)) lantern(lp);
    }

    // Back yard: fenced, with a garden, washing line or woodpile.
    const depth = 4.5 + rnd() * 2.5;
    const yw = hx * 2 + 1.5;
    const yc = pt(0, -hz - depth / 2 - 0.3);
    const yr = Math.hypot(yw, depth) / 2;
    if (free(yc.x, yc.z, yr * 0.85, 1)) {
      claims.push({ x: yc.x, z: yc.z, r: yr });
      const A = pt(-yw / 2, -hz - 0.3), B = pt(-yw / 2, -hz - 0.3 - depth);
      const C = pt(yw / 2, -hz - 0.3 - depth), D = pt(yw / 2, -hz - 0.3);
      // Three sides, with a gate gap in the back.
      fence(A, B);
      fence(C, D);
      const gap = 1.3;
      const gm = B.clone().lerp(C, 0.3 + rnd() * 0.4);
      const dir = C.clone().sub(B).normalize();
      fence(B, gm.clone().addScaledVector(dir, -gap / 2));
      fence(gm.clone().addScaledVector(dir, gap / 2), C);
      const pick = rnd();
      const yaw = h.rot;
      const inner = ground(yc.clone());
      if (pick < 0.45) garden(inner, yaw, yw - 1.6, depth - 1.6);
      else if (pick < 0.75) {
        garden(ground(pt(-yw / 4, -hz - 0.3 - depth / 2)), yaw, yw / 2 - 1, depth - 1.6);
        washing(ground(pt(yw / 4, -hz - 0.3 - depth / 2)), yaw + Math.PI / 2, depth - 1.4);
      } else {
        woodpile(ground(pt(0, -hz - 0.3 - depth + 1.2)), yaw);
        garden(ground(pt(0, -hz - 0.3 - depth / 2 + 0.6)), yaw, yw - 1.8, depth / 2 - 0.4);
      }
      // A yard tree just outside the fence for some houses.
      const tp = pt((rnd() < 0.5 ? -1 : 1) * (yw / 2 + 2.5), -hz - depth * 0.6);
      if (rnd() < 0.6 && free(tp.x, tp.z, 2.2, 3)) {
        treeSpots.push(ground(tp));
        claims.push({ x: tp.x, z: tp.z, r: 2.2 });
      }
    } else {
      // No room for a yard: a woodpile against the side wall instead.
      const wp = pt(side * (hx + 0.9), -hz * 0.3);
      if (free(wp.x, wp.z, 1.2, 0.8)) woodpile(ground(wp), h.rot + Math.PI / 2);
    }
    if (h.chimney) {
      const cw = h.chimney.clone().applyAxisAngle(up, h.rot).add(new THREE.Vector3(h.x, heightAt(h.x, h.z), h.z));
      smoke.push(cw);
    }
  }

  // ---- greens: trees in open grass between clusters ------------------------------
  for (let tries = 0; tries < 1400 && treeSpots.length < 70; tries++) {
    const a = rnd() * Math.PI * 2;
    const rad = 24 + rnd() * 78;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
    if (!free(x, z, 2.4, 3)) continue;
    // Loose groves: accept more where a low-frequency pattern is high.
    const grove = Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.043 - 0.4);
    if (rnd() > 0.35 + grove * 0.45) continue;
    treeSpots.push(at(x, z));
    claims.push({ x, z, r: 2.4 });
    for (let k = 0; k < 3; k++) {
      const fx2 = x + (rnd() - 0.5) * 5, fz2 = z + (rnd() - 0.5) * 5;
      if (free(fx2, fz2, 0.4, 1)) flowerSpots.push(at(fx2, fz2));
    }
  }

  // ---- materials and meshes -----------------------------------------------------
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffb050, emissiveIntensity: 1.1, roughness: 0.4 });
  const vc = (base: THREE.Material) => {
    const mm = (base as THREE.MeshStandardMaterial).clone();
    mm.vertexColors = true;
    mm.userData.styleSoftness = 0;
    return mm;
  };
  const leafy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  // Laundry sways in the shared wind.
  cloth.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
        float hang = clamp(-position.y * 1.2, 0.0, 1.0);
        transformed.z += sin(uTime * 2.3 + position.x * 3.0) * 0.08 * hang + 0.06 * hang;`,
      );
  };
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
  const soil = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  kit.build(scene, {
    timber: vc(m.timber), planks: vc(m.planks), stone: vc(m.stone), bark: vc(m.bark),
    soil, leafy, cloth, metal,
    glass: lanternMat,
  });

  // ---- chimney smoke ------------------------------------------------------------
  let t = 0;
  return {
    houses: all,
    lanternMat,
    treeSpots,
    flowerSpots,
    update(dt: number) {
      t += dt;
      if (t < 0.35) return;
      t = 0;
      for (const s of smoke) {
        if (Math.random() < 0.55) fx.alpha.spawn({ pos: s, vel: new THREE.Vector3(0.35, 0.9, 0.15), spread: 0.25, count: 1, life: [3.5, 5.5], size: [0.5, 2.2], color: 0xe8e4de, alpha: 0.22 });
      }
    },
  };
}
