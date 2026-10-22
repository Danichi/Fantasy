import * as THREE from 'three';
import { compile, partDist, Sculpt, type Displace, type Part, type V3 } from './sdf';
import { meshSculpt } from './mesher';

// From a list of sculpted parts and a bone list to a skinned, painted mesh:
//   - skin weights come from how close each vertex is to each part's surface,
//     so joints bend softly where the clay was blended,
//   - crevices (armpits, under the belly, behind the ears) get baked ambient
//     occlusion straight from the field,
//   - a paint function sets colour, fur length and the direction the fur lies.

export interface BoneSpec {
  name: string;
  parent?: string;
  /** Rest position in creature space (+Z forward, +Y up, metres). */
  at: V3;
}

export interface PaintOut {
  color: THREE.Color;
  /** Fur length in metres (0 = bare). */
  fur: number;
  /** Direction the fur lies, roughly along the surface (creature space). */
  flow: THREE.Vector3;
  /** Multiplier on baked occlusion (1 = full). */
  ao: number;
  /** Free channel for the material (wetness, gloss, pattern mask). */
  mask: number;
}

export type PaintFn = (p: THREE.Vector3, n: THREE.Vector3, tag: (name: string) => number, out: PaintOut) => void;

export interface GroupSpec {
  parts: Part[];
  /** Grid cell size (m): smaller = finer detail, slower to build. */
  cell: number;
  displace?: Displace;
  paint: PaintFn;
  relax?: number;
  /** Skinning softness (m): how far a bone's influence spreads past its parts. */
  skinR?: number;
  /** How far (m) crevices look for occlusion. */
  aoR?: number;
  aoStrength?: number;
}

export interface BuiltGroup {
  geometry: THREE.BufferGeometry;
  /** A medium version (fur shells ride on this one). */
  mid?: THREE.BufferGeometry;
  /** A lighter version for distance. */
  far?: THREE.BufferGeometry;
}

export class RigSpec {
  readonly index = new Map<string, number>();
  constructor(readonly bones: BoneSpec[]) {
    bones.forEach((b, i) => this.index.set(b.name, i));
  }
  bone(n: string) {
    const i = this.index.get(n);
    if (i === undefined) throw new Error('no bone ' + n);
    return i;
  }

  /** A fresh skeleton in rest pose. Bones have identity rest rotations. */
  make() {
    const bones = this.bones.map((b) => {
      const o = new THREE.Bone();
      o.name = b.name;
      return o;
    });
    const root = new THREE.Group();
    this.bones.forEach((b, i) => {
      const o = bones[i];
      if (b.parent) {
        const p = this.bones[this.bone(b.parent)];
        o.position.set(b.at[0] - p.at[0], b.at[1] - p.at[1], b.at[2] - p.at[2]);
        bones[this.bone(b.parent)].add(o);
      } else {
        o.position.set(...b.at);
        root.add(o);
      }
    });
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    const byName: Record<string, THREE.Bone> = {};
    for (const b of bones) byName[b.name] = b;
    return { root, bones: byName, list: bones, skeleton };
  }
}

const TAGS: string[] = [];
const tagIndex = (t: string) => {
  let i = TAGS.indexOf(t);
  if (i < 0) i = TAGS.push(t) - 1;
  return i;
};

export function buildGroup(rig: RigSpec, g: GroupSpec, withFar = true): BuiltGroup {
  const compiled = compile(g.parts, (n) => rig.bone(n), tagIndex);
  const S = new Sculpt(compiled, g.displace);
  const build = (cell: number, relax: number) => {
    const m = meshSculpt(S, cell, relax);
    const nv = m.positions.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));

    const skinIndex = new Uint16Array(nv * 4);
    const skinWeight = new Float32Array(nv * 4);
    const color = new Float32Array(nv * 3);
    const fur = new Float32Array(nv);
    const flow = new Float32Array(nv * 3);
    const mask = new Float32Array(nv);
    const skinR = g.skinR ?? 0.05;
    const aoR = g.aoR ?? 0.1;
    const aoK = g.aoStrength ?? 1;
    const nb = rig.bones.length;
    const bw = new Float32Array(nb);
    const tw = new Float32Array(TAGS.length + 8);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const out: PaintOut = { color: new THREE.Color(), fur: 0, flow: new THREE.Vector3(), ao: 1, mask: 0 };
    const dists = new Float32Array(compiled.length);
    for (let v = 0; v < nv; v++) {
      p.fromArray(m.positions, v * 3);
      n.fromArray(m.normals, v * 3);
      // Distances to each part.
      let dmin = 1e9;
      for (let i = 0; i < compiled.length; i++) {
        const P = compiled[i];
        dists[i] = P.carve ? 1e9 : partDist(P, p.x, p.y, p.z);
        if (dists[i] < dmin) dmin = dists[i];
      }
      bw.fill(0);
      tw.fill(0);
      for (let i = 0; i < compiled.length; i++) {
        const P = compiled[i];
        if (P.carve) continue;
        const rel = dists[i] - dmin;
        const w = Math.exp(-rel / (skinR * P.soft));
        if (P.ramp) {
          // Shared along the length between neighbouring anchor bones.
          const R = P.ramp, n = R.length / 2;
          if (p.z <= R[1]) bw[R[0]] = Math.max(bw[R[0]], w);
          else if (p.z >= R[(n - 1) * 2 + 1]) bw[R[(n - 1) * 2]] = Math.max(bw[R[(n - 1) * 2]], w);
          else
            for (let r = 0; r < n - 1; r++) {
              const z0 = R[r * 2 + 1], z1 = R[r * 2 + 3];
              if (p.z < z0 || p.z > z1) continue;
              let u = (p.z - z0) / (z1 - z0);
              u = u * u * (3 - 2 * u);
              bw[R[r * 2]] = Math.max(bw[R[r * 2]], w * (1 - u));
              bw[R[r * 2 + 2]] = Math.max(bw[R[r * 2 + 2]], w * u);
            }
        } else if (w > bw[P.bone]) bw[P.bone] = w;
        const t = Math.exp(-rel / 0.012);
        if (t > tw[P.tag]) tw[P.tag] = t;
      }
      // Top four bones.
      const top: [number, number][] = [];
      for (let b = 0; b < nb; b++) if (bw[b] > 0.02) top.push([b, bw[b]]);
      top.sort((a, b) => b[1] - a[1]);
      top.length = Math.min(4, top.length);
      let sum = 0;
      for (const t of top) sum += t[1];
      for (let s = 0; s < 4; s++) {
        skinIndex[v * 4 + s] = top[s]?.[0] ?? 0;
        skinWeight[v * 4 + s] = top[s] ? top[s][1] / sum : 0;
      }
      let tsum = 0;
      for (let t = 0; t < TAGS.length; t++) tsum += tw[t];
      const tag = (name: string) => {
        const i = TAGS.indexOf(name);
        return i < 0 || tsum <= 0 ? 0 : tw[i] / tsum;
      };
      // Occlusion from the field: how much the surface closes in along the normal.
      let occ = 0;
      for (let s = 1; s <= 5; s++) {
        const h = (aoR * s) / 5;
        const d = S.at(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h);
        occ += (h - Math.max(0, d)) / h / s;
      }
      const ao = Math.max(0, 1 - occ * 0.9 * aoK);
      out.color.setRGB(0.5, 0.5, 0.5);
      out.fur = 0;
      out.flow.set(0, 0, -1);
      out.ao = 1;
      out.mask = 0;
      g.paint(p, n, tag, out);
      const a = 1 - (1 - ao) * out.ao;
      // Occlusion darkens and slightly warms (bounce light), never to black.
      const k = 0.35 + 0.65 * a;
      color[v * 3] = out.color.r * k;
      color[v * 3 + 1] = out.color.g * (k * 0.97 + 0.03 * a);
      color[v * 3 + 2] = out.color.b * (k * 0.94 + 0.06 * a);
      fur[v] = out.fur;
      // Flow: keep it on the surface.
      const f = out.flow.addScaledVector(n, -out.flow.dot(n));
      if (f.lengthSq() < 1e-8) f.set(0, -1, 0).addScaledVector(n, -n.y);
      f.normalize();
      flow[v * 3] = f.x;
      flow[v * 3 + 1] = f.y;
      flow[v * 3 + 2] = f.z;
      mask[v] = out.mask;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('fur', new THREE.BufferAttribute(fur, 1));
    geo.setAttribute('flow', new THREE.BufferAttribute(flow, 3));
    geo.setAttribute('mask', new THREE.BufferAttribute(mask, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  };
  const geometry = build(g.cell, g.relax ?? 2);
  const mid = withFar ? build(g.cell * 1.6, 2) : undefined;
  const far = withFar ? build(g.cell * 2.8, 1) : undefined;
  return { geometry, mid, far };
}

/** Rigid little parts (tusks, claws, eyes) on one bone each: plain three geometry, skinned 100% to that bone. */
export function rigidPart(geo: THREE.BufferGeometry, bone: number, color: THREE.ColorRepresentation) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.getAttribute('position').count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bone;
    sw[i * 4] = 1;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
