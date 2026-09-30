import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, riverX, RIVER_LEVEL, ROAD_LINES, roadDist, TOWN_R } from './terrainHeight';
import { mulberry32 } from '../core/math';

// Elder Glen's cultivated flora (World Expansion phase 3): corn, pumpkin
// patches, sunflower and lavender fields, apple and pear orchards, hedgerows
// along the King's Road, reeds on the river banks and lily pads in the slow
// water. Every kind is one instanced mesh with a shared wind sway, so the
// whole valley costs about a dozen draw calls.

export interface CropsResult {
  /** (x, z, radius) spots trees must avoid */
  clearings: [number, number, number][];
  /** orchards (for the herbalist/farm quests and apple picking) */
  orchards: { center: THREE.Vector3; trees: THREE.Vector3[]; fruit: 'apple' | 'pear' }[];
  setWind(w: number): void;
  update(dt: number): void;
}

const wind = { uTime: { value: 0 }, uWind: { value: 1 } };

/** Sway the tops of instanced plants (height-weighted, phase by world position). */
function swaying(mat: THREE.MeshStandardMaterial, amount: number, height: number) {
  // Amount and height are uniforms, so every swaying crop shares one shader
  // program (baked constants made them all share the first crop's values).
  const own = { uSwayAmount: { value: amount }, uSwayHeight: { value: height } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime;
    sh.uniforms.uWind = wind.uWind;
    Object.assign(sh.uniforms, own);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uSwayAmount, uSwayHeight;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wpos = modelMatrix * mvPosition;
        float bend = clamp(transformed.y / uSwayHeight, 0.0, 1.5);
        bend *= bend;
        float ph = dot(wpos.xz, vec2(0.13, 0.09));
        float gust = sin(uTime * 0.7 + wpos.x * 0.03) * 0.5 + 0.5;
        wpos.xz += vec2(0.8, 0.45) * bend * uSwayAmount * uWind * (sin(uTime * 1.9 + ph) * 0.6 + 0.5 + gust * 0.6);
        mvPosition = viewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;`,
      )
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wpos;');
  };
  return mat;
}

class Kind {
  mats: THREE.Matrix4[] = [];
  cols: THREE.Color[] = [];
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly shadow = true) {}
  add(x: number, y: number, z: number, yaw: number, s: number, col?: THREE.Color, sy = s, tilt = 0) {
    this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.6)), new THREE.Vector3(s, sy, s)));
    this.cols.push(col ?? new THREE.Color(1, 1, 1));
  }
  /**
   * One instanced mesh per 48 m cell rather than one for the whole farm belt,
   * so the camera and the shadow pass can skip the fields that are out of view
   * (a single mesh drew every stalk twice a frame wherever you stood).
   */
  build(scene: THREE.Scene) {
    if (!this.mats.length) return;
    const CELL = 48;
    const cells = new Map<string, number[]>();
    const p = new THREE.Vector3();
    this.mats.forEach((t, i) => {
      p.setFromMatrixPosition(t);
      const k = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(i);
    });
    for (const list of cells.values()) {
      const m = new THREE.InstancedMesh(this.geo, this.mat, list.length);
      list.forEach((i, j) => {
        m.setMatrixAt(j, this.mats[i]);
        m.setColorAt(j, this.cols[i]);
      });
      m.castShadow = this.shadow;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
    }
  }
}

const ni = (g: THREE.BufferGeometry) => {
  const o = g.index ? g.toNonIndexed() : g;
  if (o.attributes.uv) o.deleteAttribute('uv');
  return o;
};

/** Vertex colours so one instanced mesh can hold stem green + flower colour. */
function tint(g: THREE.BufferGeometry, c: number) {
  const n = g.attributes.position.count;
  const col = new THREE.Color(c);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function cornGeo() {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tint(ni(new THREE.CylinderGeometry(0.025, 0.04, 2.1, 5).translate(0, 1.05, 0)), 0x6f9a3a));
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.PlaneGeometry(0.12, 0.9, 1, 3);
    const p = leaf.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, (p.getY(i) + 0.45) ** 2 * 0.35);
    leaf.translate(0, 0.45, 0).rotateX(-0.9).rotateY((k / 6) * Math.PI * 2 + k).translate(0, 0.4 + k * 0.24, 0);
    parts.push(tint(ni(leaf), k % 2 ? 0x7fae45 : 0x6a9a38));
  }
  parts.push(tint(ni(new THREE.CylinderGeometry(0.05, 0.035, 0.28, 6).rotateZ(0.35).translate(0.08, 1.35, 0)), 0xe9cf6a));
  parts.push(tint(ni(new THREE.ConeGeometry(0.06, 0.3, 4).translate(0, 2.2, 0)), 0xcaa860));
  return mergeGeometries(parts)!;
}

function pumpkinGeo() {
  const g = new THREE.SphereGeometry(0.42, 12, 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const rib = 1 - 0.07 * Math.abs(Math.sin(a * 4));
    p.setXYZ(i, x * rib, y * 0.72, z * rib);
  }
  g.computeVertexNormals();
  const body = tint(ni(g).translate(0, 0.3, 0), 0xe0802a);
  const stem = tint(ni(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 5).rotateZ(0.3).translate(0.02, 0.64, 0)), 0x5d6b2a);
  const leaf = tint(ni(new THREE.CircleGeometry(0.3, 6).rotateX(-Math.PI / 2 + 0.3).translate(0.45, 0.08, 0.2)), 0x4f8a34);
  const leaf2 = tint(ni(new THREE.CircleGeometry(0.26, 6).rotateX(-Math.PI / 2 - 0.2).translate(-0.4, 0.06, -0.3)), 0x5c9a3a);
  return mergeGeometries([body, stem, leaf, leaf2])!;
}

function sunflowerGeo() {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tint(ni(new THREE.CylinderGeometry(0.02, 0.035, 1.8, 5).translate(0, 0.9, 0)), 0x5f8f34));
  for (let k = 0; k < 4; k++) parts.push(tint(ni(new THREE.CircleGeometry(0.16, 5).scale(1, 1.6, 1).rotateX(-1.1).rotateY(k * 1.7).translate(0, 0.5 + k * 0.28, 0)), 0x5f9a38));
  // The head faces south-east, towards the sun.
  const head = new THREE.Group();
  const disc = tint(ni(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12).rotateX(Math.PI / 2)), 0x5a3a1a);
  const petals: THREE.BufferGeometry[] = [disc];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    petals.push(tint(ni(new THREE.PlaneGeometry(0.09, 0.2).translate(0, 0.24, 0).rotateZ(a).translate(0, 0, 0.01)), 0xf4c21e));
  }
  void head;
  const hg = mergeGeometries(petals)!;
  hg.rotateX(-0.35).rotateY(0.7).translate(0, 1.82, 0.05);
  parts.push(hg);
  return mergeGeometries(parts)!;
}

function lavenderGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const bush = new THREE.IcosahedronGeometry(0.42, 1).scale(1.1, 0.55, 1.1).translate(0, 0.22, 0);
  parts.push(tint(ni(bush), 0x7a9a7a));
  const rnd = mulberry32(7);
  for (let k = 0; k < 22; k++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.38;
    const spike = new THREE.CylinderGeometry(0.02, 0.04, 0.26, 4).translate(0, 0.62 + rnd() * 0.1, 0).rotateX((rnd() - 0.5) * 0.4).translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(tint(ni(spike), rnd() > 0.5 ? 0x8a6cc8 : 0x9d7fd8));
  }
  return mergeGeometries(parts)!;
}

function orchardTreeGeo(fruit: number) {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tint(ni(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 7).translate(0, 0.9, 0)), 0x6b4a32));
  for (const [x, z, a] of [[0.4, 0, 0.6], [-0.35, 0.2, -0.7], [0, -0.35, 0.5]] as const)
    parts.push(tint(ni(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 5).translate(0, 0.55, 0).rotateZ(a).translate(x * 0.3, 1.6, z * 0.3)), 0x6b4a32));
  const rnd = mulberry32(fruit);
  const lobes: [number, number, number, number][] = [[0, 2.7, 0, 1.35], [0.8, 2.4, 0.3, 0.95], [-0.75, 2.45, -0.2, 1], [0.1, 2.35, -0.8, 0.9], [-0.1, 2.5, 0.8, 0.9]];
  for (const [x, y, z, r] of lobes) parts.push(tint(ni(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z)), rnd() > 0.5 ? 0x4c8636 : 0x437a30));
  for (let k = 0; k < 26; k++) {
    const [x, y, z, r] = lobes[k % lobes.length];
    const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.6, rnd() - 0.5).normalize().multiplyScalar(r * 0.98);
    parts.push(tint(ni(new THREE.IcosahedronGeometry(0.09, 0).translate(x + d.x, y + d.y, z + d.z)), fruit));
  }
  return mergeGeometries(parts)!;
}

function hedgeGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = mulberry32(3);
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(0.75 + rnd() * 0.2, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (rnd() - 0.5) * 0.18), p.getY(i) * (1 + (rnd() - 0.5) * 0.18), p.getZ(i) * (1 + (rnd() - 0.5) * 0.18));
    g.translate((k - 1.5) * 0.85, 0.75 + rnd() * 0.15, (rnd() - 0.5) * 0.3);
    parts.push(tint(ni(g), [0x3f7a34, 0x4a8a3a, 0x3a7030, 0x467f36][k]));
  }
  // A few blossoms (hawthorn white and dog-rose pink).
  for (let k = 0; k < 10; k++) parts.push(tint(ni(new THREE.IcosahedronGeometry(0.07, 0).translate((rnd() - 0.5) * 3, 0.9 + rnd() * 0.7, (rnd() > 0.5 ? 1 : -1) * 0.65)), rnd() > 0.5 ? 0xf6f2ea : 0xf2a7c0));
  return mergeGeometries(parts)!;
}

function reedGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = mulberry32(11);
  for (let k = 0; k < 9; k++) {
    const h = 1.1 + rnd() * 0.8;
    const blade = new THREE.ConeGeometry(0.025, h, 3).translate(0, h / 2, 0).rotateX((rnd() - 0.5) * 0.3).rotateZ((rnd() - 0.5) * 0.3);
    blade.translate((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5);
    parts.push(tint(ni(blade), rnd() > 0.4 ? 0x6f9a48 : 0x86a85a));
    if (k % 3 === 0) parts.push(tint(ni(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 5).translate(0, h * 0.95, 0).rotateX((rnd() - 0.5) * 0.3)), 0x6a4528));
  }
  return mergeGeometries(parts)!;
}

function lilyGeo() {
  const pad = new THREE.CircleGeometry(0.42, 10, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2);
  const parts = [tint(ni(pad), 0x4f8f3e)];
  return mergeGeometries(parts)!;
}

function lilyFlowerGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) parts.push(tint(ni(new THREE.ConeGeometry(0.05, 0.16, 3).rotateX(0.9).translate(0, 0.05, 0.07).rotateY((k / 8) * Math.PI * 2)), k % 2 ? 0xf7c6da : 0xfbe2ec));
  parts.push(tint(ni(new THREE.IcosahedronGeometry(0.04, 0).translate(0, 0.08, 0)), 0xf2d24a));
  return mergeGeometries(parts)!;
}

export function buildCrops(scene: THREE.Scene): CropsResult {
  const std = (sway: number, h: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, ...extra }), sway, h);
  const corn = new Kind(cornGeo(), std(0.22, 2.2, { side: THREE.DoubleSide }));
  const pumpkin = new Kind(pumpkinGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  const sunflower = new Kind(sunflowerGeo(), std(0.12, 1.9, { side: THREE.DoubleSide }));
  const lavender = new Kind(lavenderGeo(), std(0.06, 0.75));
  const apple = new Kind(orchardTreeGeo(0xd23a2a), std(0.03, 3.5));
  const pear = new Kind(orchardTreeGeo(0xd8c64a), std(0.03, 3.5));
  const hedge = new Kind(hedgeGeo(), std(0.03, 1.6));
  const reed = new Kind(reedGeo(), std(0.18, 1.6), false);
  const lily = new Kind(lilyGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), false);
  const lilyFlower = new Kind(lilyFlowerGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), false);
  const soil = new Kind(new THREE.BoxGeometry(1, 0.12, 1), new THREE.MeshStandardMaterial({ color: 0x6f4d33, roughness: 1 }), false);
  const clearings: [number, number, number][] = [];
  const rnd = mulberry32(20260929);
  const jitter = () => (rnd() - 0.5);

  /** A field of rows (w along x, d along z), `fill` places one plant. */
  const field = (cx: number, cz: number, w: number, d: number, rowGap: number, step: number, fill: (x: number, y: number, z: number) => void, bed = true) => {
    for (let z = cz - d / 2; z <= cz + d / 2; z += rowGap) {
      // Earthed-up soil ridges in 4 m pieces so they follow the ground.
      if (bed) for (let x = cx - w / 2 + 2; x < cx + w / 2; x += 4) {
        const y = heightAt(x, z);
        soil.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.03, z), new THREE.Quaternion(), new THREE.Vector3(4.1, 1, rowGap * 0.55)));
        soil.cols.push(new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.2));
      }
      for (let x = cx - w / 2; x <= cx + w / 2; x += step) {
        const px = x + jitter() * step * 0.3, pz = z + jitter() * 0.15;
        fill(px, heightAt(px, pz), pz);
      }
    }
    clearings.push([cx, cz, Math.hypot(w, d) / 2 + 2]);
  };

  // Corn: tall rows east of the southern road.
  field(48, 287, 70, 26, 1.4, 0.75, (x, y, z) => corn.add(x, y, z, rnd() * 6, 0.9 + rnd() * 0.25, new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.15)));
  // Pumpkin patch.
  field(-40, 268, 36, 20, 2.2, 1.6, (x, y, z) => {
    if (rnd() < 0.2) return;
    const s = 0.7 + rnd() * 0.7;
    pumpkin.add(x, y, z, rnd() * 6, s, new THREE.Color(1, 0.92 + rnd() * 0.12, 0.85 + rnd() * 0.2).multiplyScalar(0.85 + rnd() * 0.25));
  });
  // Sunflowers west of the grain district.
  field(-172, 160, 42, 28, 1.3, 0.8, (x, y, z) => sunflower.add(x, y, z, jitter() * 0.3, 0.85 + rnd() * 0.35), false);
  // Lavender rows.
  field(-150, 205, 40, 26, 1.8, 1.0, (x, y, z) => lavender.add(x, y, z, rnd() * 6, 0.9 + rnd() * 0.3), false);

  // Orchards: an apple orchard north-east, a pear orchard by the granary.
  const orchards: CropsResult['orchards'] = [];
  const orchard = (cx: number, cz: number, nx: number, nz: number, gap: number, kind: 'apple' | 'pear') => {
    const trees: THREE.Vector3[] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = cx + (i - (nx - 1) / 2) * gap + jitter() * 1.2, z = cz + (j - (nz - 1) / 2) * gap + jitter() * 1.2;
      const y = heightAt(x, z);
      (kind === 'apple' ? apple : pear).add(x, y - 0.05, z, rnd() * 6, 0.85 + rnd() * 0.35);
      trees.push(new THREE.Vector3(x, y, z));
    }
    clearings.push([cx, cz, (Math.max(nx, nz) * gap) / 2 + 4]);
    orchards.push({ center: new THREE.Vector3(cx, heightAt(cx, cz), cz), trees, fruit: kind });
  };
  orchard(100, -96, 6, 4, 8.5, 'apple');
  orchard(-95, 96, 4, 3, 8, 'pear');

  // Hedgerows: both sides of the country roads outside the palisade, with gaps.
  for (const line of ROAD_LINES) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const yaw = Math.atan2(dx, dz) + Math.PI / 2;
      for (let s = 0; s < len; s += 3.2) {
        const x = ax + dx * s, z = az + dz * s;
        const r = Math.hypot(x, z);
        if (r < TOWN_R + 18 || r > 1250) continue;
        if (Math.abs(x - riverX(z)) < 26) continue;
        // Gaps: hedges come and go in long runs.
        const n = Math.sin(x * 0.021 + z * 0.017) + Math.sin(x * 0.047 - z * 0.031) * 0.6;
        if (n < -0.2) continue;
        for (const side of [-1, 1]) {
          const hx = x - dz * 7.8 * side, hz = z + dx * 7.8 * side;
          if (roadDist(hx, hz) < 6.8) continue; // junctions and bends
          if (rnd() < 0.12) continue;
          hedge.add(hx, heightAt(hx, hz) - 0.15, hz, yaw + jitter() * 0.1, 0.95 + rnd() * 0.25, undefined, 0.8 + rnd() * 0.4);
        }
      }
    }
  }

  // River banks: reeds along the water's edge, lily pads in the shallows.
  for (let z = -430; z < 430; z += 1.6) {
    const rx = riverX(z);
    for (const side of [-1, 1]) {
      for (let d = 3; d < 12; d += 1.1) {
        const x = rx + side * d + jitter() * 0.8, zz = z + jitter() * 1.2;
        const h = heightAt(x, zz);
        const clump = Math.sin(zz * 0.09 + side * 2) + Math.sin(zz * 0.23) * 0.5;
        if (h > RIVER_LEVEL - 0.25 && h < RIVER_LEVEL + 0.55 && clump > -0.3 && rnd() < 0.55) reed.add(x, h - 0.1, zz, rnd() * 6, 0.8 + rnd() * 0.5);
        else if (h < RIVER_LEVEL - 0.45 && d > 4 && clump > 0.55 && rnd() < 0.35) {
          const s = 0.7 + rnd() * 0.6;
          lily.add(x, RIVER_LEVEL + 0.03, zz, rnd() * 6, s, undefined, 1);
          if (rnd() < 0.2) lilyFlower.add(x + 0.1, RIVER_LEVEL + 0.04, zz, rnd() * 6, 1);
        }
      }
    }
  }

  for (const k of [corn, pumpkin, sunflower, lavender, apple, pear, hedge, reed, lily, lilyFlower, soil]) k.build(scene);

  return {
    clearings,
    orchards,
    setWind(w: number) {
      wind.uWind.value = 0.4 + w * 1.4;
    },
    update(dt: number) {
      wind.uTime.value += dt;
    },
  };
}
