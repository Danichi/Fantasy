import * as THREE from 'three';

// Sculpting with signed distance fields: a creature body is a list of simple
// shapes (balls, egg shapes, tapered capsules) melted together like clay with
// a smooth blend, so a leg grows out of the shoulder instead of being stuck on.
// The mesher (mesher.ts) turns the field into a smooth triangle mesh.
//
// Every part names the bone that carries it and a tag used for painting.

export type V3 = [number, number, number];

export type Shape =
  /** A ball. */
  | { k: 'ball'; c: V3; r: number }
  /** An egg/ellipsoid with radii r, optionally turned by Euler angles (radians, XYZ). */
  | { k: 'ell'; c: V3; r: V3; rot?: V3 }
  /** A capsule whose radius tapers from ra (at a) to rb (at b). */
  | { k: 'cone'; a: V3; b: V3; ra: number; rb: number }
  /** A rounded box: half sizes h, corner rounding r, optional rotation. */
  | { k: 'box'; c: V3; h: V3; r: number; rot?: V3 }
  /**
   * A body drawn by its outline: slices along Z, each [z, top y, bottom y, half width],
   * smoothly interpolated. `egg` > 0 narrows the top of each slice (a ridged back).
   */
  | { k: 'loft'; slices: [number, number, number, number][]; egg?: number };

/** Move/turn/squash a shape in its own frame: the shape is authored around `at`. */
export interface Xf {
  at: V3;
  rot?: V3;
  scale?: V3;
}

export interface Part {
  shape: Shape;
  /** Bone name that carries this part. */
  bone: string;
  /** Paint tag (the paint function gets soft weights per tag). */
  tag?: string;
  /** Blend radius into what came before (0 = hard union). */
  blend?: number;
  /** Carve this shape away instead of adding it. */
  carve?: boolean;
  /** Skinning influence radius scale (bigger = softer joint). */
  soft?: number;
  xf?: Xf;
  /** A long part carried by several bones in turn along Z: [bone, z] anchors. */
  ramp?: [string, number][];
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** A compiled part: flat numbers for a fast inner loop. */
export interface Compiled {
  kind: number; // 0 ball, 1 ell, 2 cone, 3 box
  c: Float64Array; // centre or a
  b: Float64Array; // cone end
  r: Float64Array; // radii
  inv: Float64Array | null; // inverse rotation 3x3 (row-major) or null
  blend: number;
  carve: boolean;
  bone: number;
  /** [bone, z]* */
  ramp: Float64Array | null;
  tag: number;
  soft: number;
  /** bounding sphere */
  bc: Float64Array;
  br: number;
  /** loft slices, flattened [z, cy, ry, rx]* */
  loft: Float64Array | null;
  egg: number;
  /** pre-transform: inverse rotation (row-major), pivot, inverse scale, distance scale */
  xr: Float64Array | null;
  xa: Float64Array;
  xs: Float64Array;
  xd: number;
}

export function compile(parts: Part[], boneIndex: (n: string) => number, tagIndex: (t: string) => number): Compiled[] {
  return parts.map((p) => {
    const s = p.shape;
    const out: Compiled = {
      kind: 0, c: new Float64Array(3), b: new Float64Array(3), r: new Float64Array(3), inv: null,
      blend: p.blend ?? 0.04, carve: !!p.carve, bone: boneIndex(p.bone), ramp: p.ramp ? new Float64Array(p.ramp.flatMap(([b, z]) => [boneIndex(b), z])) : null, tag: tagIndex(p.tag ?? 'body'), soft: p.soft ?? 1,
      bc: new Float64Array(3), br: 0, loft: null, egg: 0,
      xr: null, xa: new Float64Array(3), xs: new Float64Array([1, 1, 1]), xd: 1,
    };
    const rot = (r?: V3) => {
      if (!r) return null;
      _q.setFromEuler(_e.set(r[0], r[1], r[2])).invert();
      const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(_q));
      const e = m.elements; // column-major
      return new Float64Array([e[0], e[3], e[6], e[1], e[4], e[7], e[2], e[5], e[8]]);
    };
    if (s.k === 'ball') {
      out.kind = 0; out.c.set(s.c); out.r[0] = s.r;
      out.bc.set(s.c); out.br = s.r;
    } else if (s.k === 'ell') {
      out.kind = 1; out.c.set(s.c); out.r.set(s.r); out.inv = rot(s.rot);
      out.bc.set(s.c); out.br = Math.max(...s.r);
    } else if (s.k === 'cone') {
      out.kind = 2; out.c.set(s.a); out.b.set(s.b); out.r[0] = s.ra; out.r[1] = s.rb;
      out.bc.set([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2]);
      out.br = Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1], s.a[2] - s.b[2]) / 2 + Math.max(s.ra, s.rb);
    } else if (s.k === 'loft') {
      out.kind = 4;
      const sl = [...s.slices].sort((a, b) => a[0] - b[0]);
      out.loft = new Float64Array(sl.flatMap(([z, top, bot, hw]) => [z, (top + bot) / 2, Math.max(1e-3, (top - bot) / 2), Math.max(1e-3, hw)]));
      out.egg = s.egg ?? 0;
      const zs = sl.map((v) => v[0]);
      const ys = sl.flatMap((v) => [v[1], v[2]]);
      const hw = Math.max(...sl.map((v) => v[3]));
      const c: V3 = [0, (Math.max(...ys) + Math.min(...ys)) / 2, (zs[0] + zs[zs.length - 1]) / 2];
      out.bc.set(c);
      out.br = Math.hypot(hw, (Math.max(...ys) - Math.min(...ys)) / 2, (zs[zs.length - 1] - zs[0]) / 2) + 0.01;
    } else {
      out.kind = 3; out.c.set(s.c); out.r.set([s.h[0], s.h[1], s.h[2]]); out.b[0] = s.r; out.inv = rot(s.rot);
      out.bc.set(s.c); out.br = Math.hypot(s.h[0], s.h[1], s.h[2]) + s.r;
    }
    if (p.xf) {
      const x = p.xf;
      out.xa.set(x.at);
      out.xr = rot(x.rot ?? [0, 0, 0]);
      const sc = x.scale ?? [1, 1, 1];
      out.xs.set([1 / sc[0], 1 / sc[1], 1 / sc[2]]);
      out.xd = Math.min(...sc);
      // Bounds: move the sphere centre through the forward transform, grow by the largest scale.
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(x.rot ?? [0, 0, 0])));
      const v = new THREE.Vector3(out.bc[0] - x.at[0], out.bc[1] - x.at[1], out.bc[2] - x.at[2]).multiply(new THREE.Vector3(...sc)).applyQuaternion(q);
      out.bc.set([v.x + x.at[0], v.y + x.at[1], v.z + x.at[2]]);
      out.br *= Math.max(...sc);
    }
    return out;
  });
}

/** Distance from (x, y, z) to one part's surface (negative inside). */
export function partDist(P: Compiled, x: number, y: number, z: number): number {
  if (P.xr) {
    const m = P.xr;
    const ax = x - P.xa[0], ay = y - P.xa[1], az = z - P.xa[2];
    x = (m[0] * ax + m[1] * ay + m[2] * az) * P.xs[0] + P.xa[0];
    y = (m[3] * ax + m[4] * ay + m[5] * az) * P.xs[1] + P.xa[1];
    z = (m[6] * ax + m[7] * ay + m[8] * az) * P.xs[2] + P.xa[2];
    return shapeDist(P, x, y, z) * P.xd;
  }
  return shapeDist(P, x, y, z);
}

function loftDist(P: Compiled, x: number, y: number, z: number) {
  const L = P.loft!;
  const n = L.length / 4;
  const z0 = L[0], z1 = L[(n - 1) * 4];
  const zc = Math.min(z1, Math.max(z0, z));
  let i = 0;
  while (i < n - 2 && L[(i + 1) * 4] < zc) i++;
  const t = (zc - L[i * 4]) / (L[(i + 1) * 4] - L[i * 4] || 1);
  // Catmull-Rom through the slice values (clamped at the ends).
  const v = (k: number) => {
    const a = L[Math.max(0, i - 1) * 4 + k], b = L[i * 4 + k], c = L[(i + 1) * 4 + k], d = L[Math.min(n - 1, i + 2) * 4 + k];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  };
  const cy = v(1), ry = Math.max(1e-3, v(2)), rx0 = Math.max(1e-3, v(3));
  const vy = Math.max(-1, Math.min(1, (y - cy) / ry));
  const rx = rx0 * (1 - P.egg * (vy + 1) * 0.5);
  const dy = y - cy;
  const k0 = Math.sqrt((x / rx) ** 2 + (dy / ry) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (dy / (ry * ry)) ** 2);
  const d2 = k1 < 1e-9 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1;
  const dz = Math.abs(z - zc);
  if (dz <= 0) return d2;
  return d2 > 0 ? Math.sqrt(d2 * d2 + dz * dz) : dz;
}

function shapeDist(P: Compiled, x: number, y: number, z: number): number {
  if (P.kind === 4) return loftDist(P, x, y, z);
  let px = x - P.c[0], py = y - P.c[1], pz = z - P.c[2];
  if (P.inv) {
    const m = P.inv;
    const rx = m[0] * px + m[1] * py + m[2] * pz;
    const ry = m[3] * px + m[4] * py + m[5] * pz;
    const rz = m[6] * px + m[7] * py + m[8] * pz;
    px = rx; py = ry; pz = rz;
  }
  switch (P.kind) {
    case 0:
      return Math.sqrt(px * px + py * py + pz * pz) - P.r[0];
    case 1: {
      // Ellipsoid (a good bound, iq).
      const a = P.r[0], b = P.r[1], c = P.r[2];
      const k0 = Math.sqrt((px / a) ** 2 + (py / b) ** 2 + (pz / c) ** 2);
      const k1 = Math.sqrt((px / (a * a)) ** 2 + (py / (b * b)) ** 2 + (pz / (c * c)) ** 2);
      return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
    }
    case 2: {
      // Round cone (iq): exact.
      const r1 = P.r[0], r2 = P.r[1];
      const bx = P.b[0] - P.c[0], by = P.b[1] - P.c[1], bz = P.b[2] - P.c[2];
      const l2 = bx * bx + by * by + bz * bz;
      const rr = r1 - r2;
      const a2 = l2 - rr * rr;
      const il2 = 1 / l2;
      const yv = px * bx + py * by + pz * bz;
      const zv = yv - l2;
      const qx = px * l2 - bx * yv, qy = py * l2 - by * yv, qz = pz * l2 - bz * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2;
      const z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
    }
    default: {
      const rr = P.b[0];
      const qx = Math.abs(px) - P.r[0] + rr, qy = Math.abs(py) - P.r[1] + rr, qz = Math.abs(pz) - P.r[2] + rr;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - rr;
    }
  }
}

/** Polynomial smooth minimum. */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
/** Smooth subtraction: carve b out of a. */
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

export type Displace = (x: number, y: number, z: number, d: number) => number;

/** A whole sculpt: the blended field of all parts, plus optional surface displacement. */
export class Sculpt {
  readonly parts: Compiled[];
  constructor(parts: Compiled[], readonly displace?: Displace) {
    this.parts = parts;
  }

  /** Field value at a point. */
  at(x: number, y: number, z: number) {
    let d = 1e9;
    for (const P of this.parts) {
      // Skip parts that can't matter here (well outside their bounds and the blend).
      const dx = x - P.bc[0], dy = y - P.bc[1], dz = z - P.bc[2];
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - P.br;
      if (P.carve) {
        if (far > P.blend) continue;
        d = smax(d, -partDist(P, x, y, z), P.blend);
      } else {
        if (far > d + P.blend) continue;
        d = smin(d, partDist(P, x, y, z), P.blend);
      }
    }
    return this.displace ? this.displace(x, y, z, d) : d;
  }

  bounds(pad: number) {
    const b = new THREE.Box3();
    for (const P of this.parts) {
      if (P.carve) continue;
      b.expandByPoint(new THREE.Vector3(P.bc[0] - P.br, P.bc[1] - P.br, P.bc[2] - P.br));
      b.expandByPoint(new THREE.Vector3(P.bc[0] + P.br, P.bc[1] + P.br, P.bc[2] + P.br));
    }
    return b.expandByScalar(pad);
  }
}
