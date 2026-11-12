import * as THREE from 'three';
import type { Look } from './charBuilder';
import { paintedMaterial } from '../render/painted';

// ---------------------------------------------------------------------------
// The sculptor: every person in the world (the hero and the townsfolk alike)
// gets a body made here in code, on the character kit's skeleton. So every
// animation, the creator's proportions, the origin parts and the armour that
// hangs on bones keep working, but the surfaces are ours: smooth swept limbs,
// a sculpted head with a real face (lidded eyes with a light in them, a nose,
// lips, brows, ears), hands with fingers, and outfits built in layers.
//
//   dressHero   the hero, in parts (one mesh per material, painted leather,
//               quilted cloth and steel): a rugged adventurer who already
//               looks armoured: gambeson, leather cuirass, a steel pauldron,
//               splinted vambraces, knee cops, tall strapped boots.
//   dressFolk   a townsperson, bandit or traveller: the same body with a
//               peasant's or ranger's clothes, folded into ONE mesh coloured
//               per vertex (one draw call each).
//
// Everything is authored in the skeleton's bind space (metres, +Y up, facing
// +Z, +X to the body's left) and turned into mesh space at the end.
// ---------------------------------------------------------------------------

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** bone weights: [bone index, weight] */
type BoneW = [number, number][];

/** One surface's worth of skinned triangles (UVs in metres along and around). */
class Part {
  pos: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  vert(p: V3, w: BoneW, u = 0, v = 0) {
    const ws = w.filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, [, x]) => s + x, 0) || 1;
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    for (let k = 0; k < 4; k++) {
      this.si.push(ws[k]?.[0] ?? 0);
      this.sw.push(ws[k] ? ws[k][1] / tot : 0);
    }
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
}

interface Ring {
  c: V3;
  /** across (rx) and forward (rz) directions of the cross-section */
  u: V3;
  v: V3;
  rx: number;
  rz: number;
  /** superellipse exponent: 2 is an ellipse, higher is boxier */
  n?: number;
  /** extra forward fullness (chest, calves) */
  front?: number;
  /** extra fullness behind */
  back?: number;
  w: BoneW | ((p: V3) => BoneW);
}

/**
 * A tube through rings (each ring a superellipse). `arc` leaves a gap (an open
 * jerkin front): only angles in [a0, a1] are built. Caps close the ends. A
 * closed tube has its seam at the back, with its own column of vertices so
 * the texture wraps cleanly (normals are welded across it afterwards).
 */
function sweep(part: Part, rings: Ring[], seg = 18, o: { capStart?: boolean; capEnd?: boolean; arc?: [number, number] } = {}) {
  const [a0, a1] = o.arc ?? [-Math.PI / 2, Math.PI * 1.5];
  const cols = seg + 1;
  const avgR = rings.reduce((s, r) => s + (r.rx + r.rz) / 2, 0) / rings.length;
  const grid: number[][] = [];
  let along = 0;
  rings.forEach((r, i) => {
    if (i > 0) along += r.c.distanceTo(rings[i - 1].c);
    const row: number[] = [];
    const n = r.n ?? 2;
    for (let j = 0; j < cols; j++) {
      const t = a0 + ((a1 - a0) * j) / seg;
      const c = Math.cos(t), s = Math.sin(t);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      const fz = ez > 0 ? r.rz + (r.front ?? 0) * ez * ez : r.rz + (r.back ?? 0) * ez * ez;
      const p = r.c.clone().addScaledVector(r.u, ex * r.rx).addScaledVector(r.v, ez * fz);
      row.push(part.vert(p, typeof r.w === 'function' ? r.w(p) : r.w, (t - a0) * avgR, along));
    }
    grid.push(row);
  });
  // Winding: outward whatever the frame's handedness.
  const r0 = rings[0], r1 = rings[Math.min(1, rings.length - 1)];
  const axis = r1.c.clone().sub(r0.c);
  const flip = new THREE.Vector3().crossVectors(r0.u, r0.v).dot(axis) < 0;
  for (let i = 0; i + 1 < grid.length; i++) {
    for (let j = 0; j < seg; j++) {
      const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j], d = grid[i + 1][j + 1];
      if (flip) {
        part.tri(a, c, b);
        part.tri(b, c, d);
      } else {
        part.tri(a, b, c);
        part.tri(b, d, c);
      }
    }
  }
  const cap = (ring: Ring, row: number[], start: boolean) => {
    const w = typeof ring.w === 'function' ? ring.w(ring.c) : ring.w;
    const ci = part.vert(ring.c, w, 0, start ? 0 : along);
    for (let j = 0; j < seg; j++) {
      const a = row[j], b = row[j + 1];
      if (start !== flip) part.tri(ci, b, a);
      else part.tri(ci, a, b);
    }
  };
  if (o.capStart) cap(rings[0], grid[0], true);
  if (o.capEnd) cap(rings[rings.length - 1], grid[grid.length - 1], false);
}

/** Add a plain geometry (in bind space) to a part, every vertex with the same weights (or by position). */
function addGeo(part: Part, g: THREE.BufferGeometry, w: BoneW | ((p: V3) => BoneW)) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const base = part.pos.length / 3;
  const p = V();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    part.vert(p, typeof w === 'function' ? w(p) : w, p.x + p.z * 0.7, p.y);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) part.idx.push(base + g.index.getX(i));
  else for (let i = 0; i < pos.count; i++) part.idx.push(base + i);
}

/** A frame for a limb pointing along `axis` (u across, v roughly forward/up). */
function frame(axis: V3) {
  const a = axis.clone().normalize();
  const ref = Math.abs(a.y) > 0.7 ? V(0, 0, 1) : V(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ref, a).normalize();
  const v = new THREE.Vector3().crossVectors(a, u).normalize();
  return { a, u, v };
}

interface LimbOpts {
  steps?: number[];
  blend?: number;
  seg?: number;
  capStart?: boolean;
  capEnd?: boolean;
  startW?: BoneW;
  n?: number;
  extend?: [number, number];
}

/**
 * A limb along joints: `radius(t, k)` gives [across, forward] radii at
 * fraction t of segment k; each joint blends the two bones either side of it.
 */
function limb(part: Part, joints: V3[], bones: number[], radius: (t: number, k: number) => [number, number], o: LimbOpts = {}) {
  const rings: Ring[] = [];
  const blend = o.blend ?? 0.05;
  const nseg = joints.length - 1;
  for (let k = 0; k < nseg; k++) {
    const A = joints[k], B = joints[k + 1];
    const { u, v } = frame(B.clone().sub(A));
    const steps = o.steps?.[k] ?? 5;
    const len = A.distanceTo(B);
    for (let s = 0; s <= steps; s++) {
      if (k > 0 && s === 0) continue;
      let t = s / steps;
      // Optionally start before the first joint / run past the last.
      const ext0 = k === 0 && s === 0 ? -(o.extend?.[0] ?? 0) / len : 0;
      const ext1 = k === nseg - 1 && s === steps ? (o.extend?.[1] ?? 0) / len : 0;
      t += ext0 + ext1;
      const c = A.clone().lerp(B, t);
      const [rx, rz] = radius(Math.max(0, Math.min(1, t)), k);
      // Weights: this segment's bone, blended toward the neighbour near each joint.
      const dA = t * len, dB = (1 - t) * len;
      const w: BoneW = [[bones[k], 1]];
      if (k > 0 && dA < blend) {
        const x = 0.5 * (1 - dA / blend);
        w[0][1] = 1 - x;
        w.push([bones[k - 1], x]);
      } else if (k === 0 && o.startW && dA < blend) {
        const x = 0.5 * (1 - Math.max(0, dA) / blend);
        w[0][1] = 1 - x;
        for (const [b, ww] of o.startW) w.push([b, x * ww]);
      }
      if (dB < blend && bones[k + 1] !== undefined) {
        const x = 0.5 * (1 - dB / blend);
        w[0][1] *= 1 - x;
        w.push([bones[k + 1], x]);
      }
      rings.push({ c, u, v, rx, rz, n: o.n, w });
    }
  }
  sweep(part, rings, o.seg ?? 14, { capStart: o.capStart, capEnd: o.capEnd });
}

/** A box lying from A to B (its length along the line), lifted `off` from it. */
function bar(A: V3, B: V3, wide: number, thick: number, off: V3) {
  const len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(len, thick, wide);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), B.clone().sub(A).normalize()));
  const mid = A.clone().lerp(B, 0.5).add(off);
  return g.translate(mid.x, mid.y, mid.z);
}

// ---- the surfaces a body is made of ----------------------------------------------------------

const PART_KEYS = [
  'skin', 'lips', 'white', 'eye', 'pupil', 'glint', 'lash', 'hair', 'stubble', 'scar',
  'cloth', 'linen', 'leather', 'dark', 'trousers', 'boots', 'sole', 'brass', 'steel',
  // the hero's starter armour: hidden when real armour goes on that slot
  'pauldron', 'knees', 'splints',
  // a named character's garb: cloak or tabard, sash or scarf, edging, a hat
  'accent', 'second', 'trim', 'hat',
] as const;
type PartKey = (typeof PART_KEYS)[number];

export type Outfit = 'adventurer' | 'peasant' | 'ranger';

// (A look's `skin` multiplies this, as it multiplied the kit's pale painted skin: white = as painted.)
const BASE_SKIN = new THREE.Color(0xf0c8a6);
/** Muted cloth for people whose look names no colour: picked by who they are, so a crowd varies. */
const FOLK_CLOTH = [0x7a8a5c, 0x9a6a4a, 0x6f7f96, 0xa08a52, 0x8a5a52, 0x5f7a70, 0x8f7a9a, 0xb0935e];

interface Palette {
  steel: THREE.Color;
  accent: THREE.Color;
  second: THREE.Color;
  trim: THREE.Color;
  skin: THREE.Color;
  cloth: THREE.Color;
  linen: THREE.Color;
  hair: THREE.Color;
  trousers: THREE.Color;
  leather: THREE.Color;
  boots: THREE.Color;
}

function paletteOf(look: Look, outfit: Outfit): Palette {
  const skin = BASE_SKIN.clone().multiply(new THREE.Color(look.skin ?? 0xffffff));
  // (Multiplying two skin tones over-saturates the deep ones: ease them back toward their own grey.)
  const sg = skin.r * 0.3 + skin.g * 0.55 + skin.b * 0.15;
  skin.lerp(new THREE.Color(sg * 1.15, sg, sg * 0.9), 0.3 * (1 - Math.min(1, sg * 2.2)));
  skin.multiplyScalar(1 + 0.4 * (1 - Math.min(1, sg * 3)));
  const hair = new THREE.Color(look.hairColor ?? 0x4a3322);
  // (Cropped hair is darker than the same hair worn long: a bright crop reads as a painted scalp.)
  if (look.hair === 'buzzed' || look.hair === 'buzzedfemale') hair.multiplyScalar(0.62);
  let cloth: THREE.Color;
  if (look.cloth !== undefined) cloth = new THREE.Color(look.cloth);
  else if (outfit === 'adventurer') cloth = new THREE.Color(0x4f8fd0);
  else {
    const h = Math.abs(Math.round((look.hairColor ?? 7) * 0.37 + (look.skin ?? 3) * 0.11 + (look.height ?? 1.7) * 977 + (look.body === 'female' ? 5 : 0) + (look.beard ? 3 : 0)));
    cloth = new THREE.Color(FOLK_CLOTH[h % FOLK_CLOTH.length]);
  }
  return {
    skin, cloth, hair,
    linen: new THREE.Color(look.linen ?? 0xe9dfc8),
    trousers: new THREE.Color(outfit === 'adventurer' ? 0x3d3a36 : outfit === 'ranger' ? 0x4a4336 : 0x6a563e),
    leather: new THREE.Color(outfit === 'peasant' ? 0x6a4a30 : 0x5b3a22),
    boots: new THREE.Color(outfit === 'peasant' && !look.garb?.tallBoots ? 0x5a4230 : 0x46291a),
    steel: new THREE.Color(look.garb?.metal ?? 0x8b9199),
    accent: new THREE.Color(look.garb?.accent ?? look.cloth ?? 0x7a2a2a),
    second: new THREE.Color(look.garb?.second ?? look.linen ?? 0xe9dfc8),
    trim: new THREE.Color(look.garb?.trim ?? 0xb89250),
  };
}

/**
 * Sculpt a whole person on `skeleton` (bind space). `fine` is the hero's level
 * of detail; townsfolk are built with fewer segments.
 */
function sculptParts(skeleton: THREE.Skeleton, look: Look, outfit: Outfit, fine: boolean) {
  const bi = new Map(skeleton.bones.map((b, i) => [b.name, i]));
  const B = (n: string) => bi.get(n) ?? 0;
  const bindPos = skeleton.boneInverses.map((m) => V().setFromMatrixPosition(m.clone().invert()));
  const J = (n: string) => bindPos[B(n)].clone();
  const female = look.body === 'female';
  const P = Object.fromEntries(PART_KEYS.map((k) => [k, new Part()])) as Record<PartKey, Part>;
  const SEG = fine ? 28 : 16, LSEG = fine ? 18 : 10;

  // ---- torso ----
  const pelvis = J('pelvis'), s1 = J('spine_01'), s2 = J('spine_02'), s3 = J('spine_03'), neck = J('neck_01'), head = J('Head');
  const ua = { l: J('upperarm_l'), r: J('upperarm_r') };
  const shoulderY = ua.l.y;
  /** spine weights by height, with the shoulders handing over to the collarbones and arms */
  const spineW = (p: V3): BoneW => {
    const ys: [number, number][] = [[pelvis.y, B('pelvis')], [s1.y, B('spine_01')], [s2.y, B('spine_02')], [s3.y, B('spine_03')], [neck.y, B('neck_01')]];
    let w: BoneW = [[ys[ys.length - 1][1], 1]];
    if (p.y <= ys[0][0]) w = [[ys[0][1], 1]];
    else for (let k = 0; k + 1 < ys.length; k++) {
      if (p.y <= ys[k + 1][0]) {
        const t = (p.y - ys[k][0]) / (ys[k + 1][0] - ys[k][0]);
        w = [[ys[k][1], 1 - t], [ys[k + 1][1], t]];
        break;
      }
    }
    const side = p.x > 0 ? 'l' : 'r';
    const sh = smooth(0.09, 0.17, Math.abs(p.x)) * smooth(shoulderY - 0.14, shoulderY - 0.02, p.y);
    if (sh > 0) {
      w = w.map(([b, x]) => [b, x * (1 - sh)] as [number, number]);
      w.push([B('clavicle_' + side), sh * 0.55], [B('upperarm_' + side), sh * 0.45]);
    }
    return w;
  };
  // Width (rx), depth (rz), centre z and extra chest fullness of the body at a height.
  const garb = look.garb ?? {};
  const bulk = garb.build ?? 1;
  const style: Outfit | 'tunic' | 'robe' = garb.cut ?? outfit;
  const T0: [number, number, number, number, number?][] = female
    ? [[pelvis.y - 0.1, 0.165, 0.115, -0.03], [pelvis.y, 0.17, 0.115, -0.03], [s1.y, 0.142, 0.1, -0.015], [s2.y, 0.135, 0.098, -0.005], [s3.y - 0.02, 0.15, 0.1, 0.0, 0.035], [s3.y + 0.07, 0.158, 0.1, -0.005, 0.03], [shoulderY - 0.02, 0.15, 0.09, -0.025], [neck.y - 0.03, 0.09, 0.07, -0.03]]
    : [[pelvis.y - 0.1, 0.16, 0.115, -0.03], [pelvis.y, 0.165, 0.115, -0.03], [s1.y, 0.155, 0.108, -0.012], [s2.y, 0.162, 0.115, 0.0], [s3.y - 0.02, 0.18, 0.125, 0.005, 0.01], [s3.y + 0.07, 0.19, 0.12, -0.005, 0.005], [shoulderY - 0.02, 0.175, 0.1, -0.03], [neck.y - 0.03, 0.095, 0.075, -0.035]];
  const T = T0.map((r) => [r[0], r[1] * bulk, r[2] * bulk, r[3], r[4]] as [number, number, number, number, number?]);
  /** The body's profile between two heights, pushed out by `lift`, with extra rings between the keys so it curves. */
  const torso = (lift: number, from: number, to: number) => {
    const rings: Ring[] = [];
    const at = (y: number) => {
      let k = 0;
      while (k + 2 < T.length && y > T[k + 1][0]) k++;
      const a = T[k], b = T[k + 1];
      const t = smooth(0, 1, clamp01((y - a[0]) / (b[0] - a[0])));
      const mix = (i: number) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t;
      return { rx: mix(1), rz: mix(2), z: mix(3), front: mix(4) };
    };
    const lo = Math.max(from, T[0][0]), hi = Math.min(to, T[T.length - 1][0]);
    const steps = Math.max(2, Math.round((hi - lo) / (fine ? 0.028 : 0.05)));
    for (let i = 0; i <= steps; i++) {
      const y = lo + ((hi - lo) * i) / steps;
      const s = at(y);
      rings.push({ c: V(0, y, s.z), u: V(1, 0, 0), v: V(0, 0, 1), rx: s.rx + lift, rz: s.rz + lift, n: 2.4, front: s.front, w: spineW });
    }
    return rings;
  };
  /** Half-depth of the body's front at a height (to lay straps and aprons on it). */
  const backZ = (y: number, x = 0, lift = 0) => {
    const row = T.reduce((best, r) => (Math.abs(r[0] - y) < Math.abs(best[0] - y) ? r : best));
    return row[3] - (row[2] + lift) * Math.sqrt(Math.max(0, 1 - (x / (row[1] + lift + 0.01)) ** 2));
  };
  const frontZ = (y: number, x = 0, lift = 0) => {
    const row = T.reduce((best, r) => (Math.abs(r[0] - y) < Math.abs(best[0] - y) ? r : best));
    return row[3] + (row[2] + (row[4] ?? 0) + lift) * Math.sqrt(Math.max(0, 1 - (x / (row[1] + lift + 0.01)) ** 2));
  };
  // The garment next to the skin: gambeson, tunic or bodice, hip to neck.
  sweep(P.cloth, torso(0, -9, 9), SEG, { capEnd: true });
  // Hips and seat in trouser cloth, closing the bottom.
  sweep(P.trousers, [
    { c: V(0, pelvis.y - 0.1, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.162, rz: 0.113, n: 2.4, w: [[B('pelvis'), 1]] },
    { c: V(0, pelvis.y - 0.16, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.12, rz: 0.09, n: 2.4, w: [[B('pelvis'), 1]] },
  ], SEG, { capEnd: true });

  const beltY = pelvis.y + 0.035;
  /** A skirt or the hem of a coat: rings flaring down from the waist, swinging with the thighs. */
  const skirt = (part: Part, top: number, bot: number, r0: number, flare: number, arc?: [number, number], seg = SEG, hang?: number) => {
    const rings: Ring[] = [];
    const n = hang !== undefined ? 1 : fine ? 6 : 4;
    for (let k = 0; k <= n; k++) {
      const d = k / n;
      const y = top + (bot - top) * d;
      const f = r0 + flare * d;
      rings.push({ c: V(0, y, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.17 + f, rz: 0.118 + f, n: 2.4, w: (p) => {
        // The sides follow the thighs; front and back hang more from the hips.
        const side = clamp01(Math.abs(p.x) / (0.17 + f));
        const th = (hang ?? d) * (0.4 + 0.42 * side);
        return [[B('pelvis'), 1 - th], [B(p.x > 0 ? 'thigh_l' : 'thigh_r'), th]];
      } });
    }
    sweep(part, rings, seg, arc ? { arc } : {});
  };
  const belt = (part: Part, half: number, r: number) => sweep(part, [
    { c: V(0, beltY - half, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.17 + r, rz: 0.118 + r, n: 2.4, w: [[B('pelvis'), 1]] },
    { c: V(0, beltY + half, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.17 + r, rz: 0.118 + r, n: 2.4, w: [[B('pelvis'), 1]] },
  ], SEG);
  const buckle = (r: number, size = 1) => {
    addGeo(P.brass, new THREE.BoxGeometry(0.062 * size, 0.052 * size, 0.014).translate(0, beltY, -0.03 + 0.118 + r + 0.006), [[B('pelvis'), 1]]);
    addGeo(P.dark, new THREE.BoxGeometry(0.03 * size, 0.03 * size, 0.016).translate(0, beltY, -0.03 + 0.118 + r + 0.011), [[B('pelvis'), 1]]);
  };
  const scarf = (part: Part) => {
    // A thick soft roll at the base of the neck, one tail down the front.
    sweep(part, [0, 1, 2, 3].map((k): Ring => ({
      c: V(0, neck.y - 0.055 + k * 0.022, -0.03 + 0.004 * k), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.098 - k * 0.006 + (k === 1 || k === 2 ? 0.014 : 0), rz: 0.086 - k * 0.005 + (k === 1 || k === 2 ? 0.014 : 0), n: 2.2,
      w: [[B('spine_03'), 0.6 - k * 0.12], [B('neck_01'), 0.4 + k * 0.12]],
    })), fine ? 22 : 12);
    sweep(part, [0, 1, 2, 3].map((k): Ring => ({
      c: V(0.04 - k * 0.004, neck.y - 0.07 - k * 0.07, frontZ(neck.y - 0.07 - k * 0.07, 0.04, 0.03) - k * 0.004), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.03 - k * 0.002, rz: 0.008, n: 3,
      w: [[B('spine_03'), 1]],
    })), 8, { capEnd: true });
  };

  /** A strap from one shoulder to the other hip, lying on the chest. */
  const strap = (part: Part, a: V3, b: V3, lift: number) => {
    const rings: Ring[] = [];
    const dir = b.clone().sub(a).normalize();
    for (let i = 0; i <= 10; i++) {
      const p = a.clone().lerp(b, i / 10);
      rings.push({ c: V(p.x, p.y, frontZ(p.y, p.x, lift)), u: V(-dir.y, dir.x, 0).normalize(), v: V(0, 0, 1), rx: 0.024, rz: 0.005, n: 4, w: spineW });
    }
    sweep(part, rings, 8);
  };
  /** A pauldron of three lames on one shoulder. */
  const pauldron = (part: Part, side: 'l' | 'r', big = 1) => {
    const top = ua[side].clone(), m = side === 'l' ? 1 : -1;
    const lame = (dx: number, dy: number, tilt: number, size: number, w: BoneW) => {
      addGeo(part, new THREE.SphereGeometry(1, fine ? 22 : 12, fine ? 12 : 6, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.118 * size * big, 0.1 * size * big, 0.116 * size * big).rotateZ(tilt * m).translate(top.x + dx * m, top.y + dy, top.z), w);
    };
    lame(-0.02, 0.018, -0.1, 1, [[B('clavicle_' + side), 0.6], [B('upperarm_' + side), 0.4]]);
    lame(0.05, -0.004, -0.6, 0.9, [[B('upperarm_' + side), 0.8], [B('clavicle_' + side), 0.2]]);
    lame(0.105, -0.04, -1.0, 0.8, [[B('upperarm_' + side), 1]]);
  };
  const collar = (part: Part) => sweep(part, [0, 1].map((k): Ring => ({ c: V(0, neck.y - 0.045 + k * 0.03, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.085 - k * 0.012, rz: 0.076 - k * 0.01, n: 2.2, w: [[B('spine_03'), 0.6 - k * 0.2], [B('neck_01'), 0.4 + k * 0.2]] })), 12);
  const ankleY = J('foot_l').y;

  if (style === 'robe') {
    // A robe to the ankles, belted, with an edged hem, under a mantle over the shoulders.
    skirt(P.cloth, pelvis.y + 0.03, ankleY + 0.07, 0.01, 0.1);
    skirt(P.trim, ankleY + 0.1, ankleY + 0.06, 0.112, 0.004, undefined, SEG, 1);
    belt(P.dark, 0.024, 0.018);
    buckle(0.018, 0.9);
    const rings: Ring[] = [];
    for (let i = 0; i <= 4; i++) rings.push({ c: V(0, neck.y - 0.03 - i * 0.036, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: (0.1 + i * 0.037) * bulk, rz: (0.086 + i * 0.021) * bulk, n: 2.3, w: spineW });
    sweep(P.accent, rings, SEG);
    const e = rings[4];
    sweep(P.trim, [{ ...e, rx: e.rx + 0.003, rz: e.rz + 0.003 }, { ...e, c: e.c.clone().add(V(0, -0.016, 0)), rx: e.rx + 0.006, rz: e.rz + 0.005 }], SEG);
    addGeo(P.trim, new THREE.SphereGeometry(0.014, 10, 8).translate(0, neck.y - 0.05, frontZ(neck.y - 0.05, 0, 0.03)), spineW);
    collar(P.linen);
  } else if (style === 'tunic') {
    // A fitted, belted tunic to mid-thigh.
    skirt(P.cloth, pelvis.y + 0.03, pelvis.y - 0.22, 0.008, 0.028);
    belt(P.dark, 0.022, 0.016);
    buckle(0.016, 0.85);
    collar(P.linen);
  } else if (outfit === 'adventurer') {
    // A gambeson collar standing round the neck.
    sweep(P.cloth, [0, 1, 2].map((k): Ring => ({ c: V(0, neck.y - 0.04 + k * 0.03, -0.032 + k * 0.004), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.074 - k * 0.006, rz: 0.07 - k * 0.006, n: 2.2, w: [[B('spine_03'), 0.5 - k * 0.2], [B('neck_01'), 0.5 + k * 0.2]] })), 16);
    // Leather cuirass over it, closed, from the belt to the top of the chest.
    sweep(P.leather, torso(0.013, pelvis.y + 0.01, shoulderY - 0.05), SEG);
    // Its raised edges: a rolled rim at the top and bottom.
    for (const y of [pelvis.y + 0.012, shoulderY - 0.052]) sweep(P.dark, torso(0.018, y - 0.008, y + 0.008), SEG);
    // The gambeson's skirt shows under leather tassets.
    skirt(P.cloth, pelvis.y + 0.03, pelvis.y - 0.2, 0.012, 0.03);
    for (const [ang, span] of [[Math.PI / 2, 0.82], [-Math.PI / 2, 0.82], [0, 0.7], [Math.PI, 0.7]] as [number, number][]) skirt(P.leather, pelvis.y + 0.03, pelvis.y - (female ? 0.17 : 0.155), 0.022, 0.036, [ang - span / 2, ang + span / 2], 6);
    // A broad belt with a heavy buckle, and a pouch on the right hip.
    belt(P.dark, 0.032, 0.03);
    buckle(0.03, 1.15);
    addGeo(P.leather, new THREE.BoxGeometry(0.078, 0.088, 0.052).translate(-0.178, beltY - 0.072, 0.04), [[B('pelvis'), 0.7], [B('thigh_r'), 0.3]]);
    addGeo(P.dark, new THREE.BoxGeometry(0.082, 0.03, 0.056).translate(-0.178, beltY - 0.04, 0.04), [[B('pelvis'), 0.7], [B('thigh_r'), 0.3]]);
    addGeo(P.brass, new THREE.SphereGeometry(0.009, 8, 6).translate(-0.178, beltY - 0.05, 0.07), [[B('pelvis'), 0.7], [B('thigh_r'), 0.3]]);
    // A baldric across the chest (for a sword on the back), with its buckle.
    {
      const a = V(0.15, shoulderY - 0.03, 0), b = V(-0.16, beltY + 0.03, 0);
      const rings: Ring[] = [];
      for (let i = 0; i <= 10; i++) {
        const p = a.clone().lerp(b, i / 10);
        rings.push({ c: V(p.x, p.y, frontZ(p.y, p.x, 0.024)), u: V(-0.7, -0.7, 0).normalize(), v: V(0, 0, 1), rx: 0.024, rz: 0.005, n: 4, w: spineW });
      }
      sweep(P.dark, rings, 8);
      const m = a.clone().lerp(b, 0.42);
      addGeo(P.brass, new THREE.BoxGeometry(0.04, 0.046, 0.012).rotateZ(0.78).translate(m.x, m.y, frontZ(m.y, m.x, 0.034)), spineW);
    }
    scarf(P.linen);
    // A steel pauldron on the left shoulder: three lames, strapped under the arm.
    {
      const top = ua.l.clone();
      const lame = (dx: number, dy: number, tilt: number, size: number, w: BoneW) => {
        const g = new THREE.SphereGeometry(1, fine ? 22 : 12, fine ? 12 : 6, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.118 * size, 0.1 * size, 0.116 * size).rotateZ(tilt).translate(top.x + dx, top.y + dy, top.z);
        addGeo(P.pauldron, g, w);
      };
      lame(-0.02, 0.018, -0.1, 1, [[B('clavicle_l'), 0.6], [B('upperarm_l'), 0.4]]);
      lame(0.05, -0.004, -0.6, 0.9, [[B('upperarm_l'), 0.8], [B('clavicle_l'), 0.2]]);
      lame(0.105, -0.04, -1.0, 0.8, [[B('upperarm_l'), 1]]);
      // Rivets along the top lame, and the strap that holds it across the chest.
      for (const z of [-0.07, 0, 0.07]) addGeo(P.brass, new THREE.SphereGeometry(0.0085, 8, 6).translate(top.x + 0.012, top.y + 0.114 - Math.abs(z) * 0.5, top.z + z), [[B('clavicle_l'), 0.6], [B('upperarm_l'), 0.4]]);
      // A leather guard on the other shoulder: lighter, so the sword arm stays free.
      const rt = ua.r.clone();
      addGeo(P.leather, new THREE.SphereGeometry(1, fine ? 18 : 10, fine ? 10 : 6, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(0.1, 0.086, 0.1).rotateZ(0.25).translate(rt.x + 0.01, rt.y + 0.014, rt.z), [[B('clavicle_r'), 0.55], [B('upperarm_r'), 0.45]]);
    }
  } else if (outfit === 'ranger') {
    // Leather jerkin over the tunic, open in a V at the front, with four tabs over the hips.
    sweep(P.leather, torso(0.012, pelvis.y - 0.001, shoulderY - 0.02), SEG, { arc: [Math.PI / 2 + 0.38, Math.PI / 2 + Math.PI * 2 - 0.38] });
    for (const [ang, span] of [[Math.PI / 2, 0.9], [-Math.PI / 2, 0.9], [0, 0.75], [Math.PI, 0.75]] as [number, number][]) skirt(P.leather, pelvis.y + 0.03, pelvis.y - (female ? 0.2 : 0.18), 0.016, 0.036, [ang - span / 2, ang + span / 2], 6);
    belt(P.dark, 0.028, 0.022);
    buckle(0.022);
    scarf(P.linen);
    if (look.pauldron) {
      const top = ua.l.clone();
      addGeo(P.leather, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.09, 0.058, 0.086).rotateZ(-0.2).translate(top.x, top.y + 0.02, top.z), [[B('clavicle_l'), 0.5], [B('upperarm_l'), 0.5]]);
      addGeo(P.dark, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.08, 0.05, 0.078).rotateZ(-0.8).translate(top.x + 0.055, top.y - 0.012, top.z), [[B('upperarm_l'), 1]]);
    }
  } else {
    // Peasant: a belted tunic to mid-thigh; women a longer skirt and a linen apron.
    const hem = pelvis.y - (female ? 0.44 : 0.24);
    skirt(P.cloth, pelvis.y + 0.03, hem, 0.008, female ? 0.07 : 0.03);
    belt(P.dark, 0.02, 0.014);
    if (female) {
      // The apron: a panel down the front of the skirt and a bib on the bodice.
      skirt(P.linen, pelvis.y + 0.02, hem + 0.05, 0.013, 0.07, [Math.PI / 2 - 0.55, Math.PI / 2 + 0.55], 8);
      const rings: Ring[] = [];
      for (let i = 0; i <= 4; i++) {
        const y = beltY + 0.02 + ((s3.y + 0.04 - beltY - 0.02) * i) / 4;
        rings.push({ c: V(0, y, frontZ(y, 0, 0.012)), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.075 - i * 0.004, rz: 0.004, n: 4, w: spineW });
      }
      sweep(P.linen, rings, 8);
    } else buckle(0.014, 0.8);
    // A linen collar at the neck.
    sweep(P.linen, [0, 1].map((k): Ring => ({ c: V(0, neck.y - 0.045 + k * 0.03, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.085 - k * 0.012, rz: 0.076 - k * 0.01, n: 2.2, w: [[B('spine_03'), 0.6 - k * 0.2], [B('neck_01'), 0.4 + k * 0.2]] })), 12);
  }

  // ---- a named character's own pieces, over whatever they wear ----
  if (garb.armour) {
    // Plate: a cuirass with a gorget, both pauldrons and tassets over the hips.
    sweep(P.steel, torso(0.024, pelvis.y + 0.02, shoulderY - 0.04), SEG);
    sweep(P.steel, [0, 1, 2].map((k): Ring => ({ c: V(0, neck.y - 0.06 + k * 0.03, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.105 - k * 0.014, rz: 0.095 - k * 0.012, n: 2.2, w: [[B('spine_03'), 0.6 - k * 0.2], [B('neck_01'), 0.4 + k * 0.2]] })), 14);
    pauldron(P.steel, 'l');
    pauldron(P.steel, 'r');
    for (const [ang, span] of [[Math.PI / 2 - 0.55, 0.8], [Math.PI / 2 + 0.55, 0.8], [0, 0.7], [Math.PI, 0.7], [-Math.PI / 2, 1.1]] as [number, number][]) skirt(P.steel, pelvis.y + 0.03, pelvis.y - 0.17, 0.03, 0.03, [ang - span / 2, ang + span / 2], 6);
    if (!garb.tabard) (belt(P.dark, 0.026, 0.034), buckle(0.034));
  }
  if (garb.tabard) {
    // A tabard down the front and back, belted.
    for (const mid of [Math.PI / 2, -Math.PI / 2]) {
      sweep(P.accent, torso(0.031, pelvis.y, shoulderY - 0.035), 6, { arc: [mid - 0.5, mid + 0.5] });
      skirt(P.accent, pelvis.y + 0.03, pelvis.y - 0.3, 0.038, 0.03, [mid - 0.46, mid + 0.46], 6);
      skirt(P.trim, pelvis.y - 0.29, pelvis.y - 0.31, 0.07, 0.002, [mid - 0.46, mid + 0.46], 6, 1);
    }
    belt(P.dark, 0.026, 0.042);
    buckle(0.042);
  }
  if (garb.apron) {
    // A work apron: a bib on the chest and a skirt to the knee, tied at the waist.
    const part = garb.apron === 'leather' ? P.leather : P.linen;
    sweep(part, torso(0.02, beltY, s3.y + 0.05), 8, { arc: [Math.PI / 2 - 0.5, Math.PI / 2 + 0.5] });
    skirt(part, pelvis.y + 0.03, pelvis.y - 0.38, 0.022, 0.04, [Math.PI / 2 - 0.8, Math.PI / 2 + 0.8], 8);
    belt(P.dark, 0.018, 0.028);
  }
  if (garb.sash) {
    // A broad sash, its tail hanging at the left hip.
    belt(P.second, 0.042, 0.026);
    sweep(P.second, [0, 1, 2, 3].map((k): Ring => ({ c: V(0.15 * bulk, beltY - 0.03 - k * 0.075, 0.03), u: V(0.8, 0, -0.6), v: V(0.6, 0, 0.8), rx: 0.032 - k * 0.003, rz: 0.007, n: 3, w: [[B('pelvis'), 1 - k * 0.2], [B('thigh_l'), k * 0.2]] })), 8, { capEnd: true });
  }
  if (garb.scarf) {
    // A long scarf: wound once, two tails down the back.
    scarf(P.second);
    for (const sx of [-1, 1]) {
      sweep(P.second, [0, 1, 2, 3, 4, 5].map((k): Ring => {
        const y = neck.y - 0.05 - k * 0.085;
        return { c: V(sx * (0.045 + k * 0.004), y, backZ(y, sx * 0.045, 0.03) - 0.004), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.03 - k * 0.001, rz: 0.007, n: 3, w: spineW };
      }), 8, { capEnd: true });
    }
  }
  if (garb.cloak === 'full') {
    // A cloak from the shoulders to the calf, clasped at the throat.
    const rings: Ring[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      rings.push({ c: V(0, shoulderY + 0.02 - t * (shoulderY - pelvis.y + 0.52), -0.04 - t * 0.035), u: V(1, 0, 0), v: V(0, 0, 1), rx: (0.2 + t * 0.075) * bulk, rz: (0.13 + t * 0.085) * bulk, n: 2.3, w: spineW });
    }
    sweep(P.accent, rings, fine ? 20 : 14, { arc: [-Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3] });
    addGeo(P.trim, new THREE.SphereGeometry(0.016, 10, 8).translate(0, shoulderY + 0.0, frontZ(shoulderY, 0, 0.04)), spineW);
    strap(P.accent, V(0.17 * bulk, shoulderY + 0.01, 0), V(0.0, shoulderY - 0.005, 0), 0.036);
    strap(P.accent, V(-0.17 * bulk, shoulderY + 0.01, 0), V(0.0, shoulderY - 0.005, 0), 0.036);
  } else if (garb.cloak === 'half') {
    // A half-cape over the left shoulder, to the waist.
    const rings: Ring[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      rings.push({ c: V(0.012, shoulderY + 0.03 - t * (shoulderY - pelvis.y), -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: (0.205 + t * 0.04) * bulk, rz: (0.13 + t * 0.04) * bulk, n: 2.3, w: spineW });
    }
    sweep(P.accent, rings, fine ? 16 : 10, { arc: [-Math.PI / 2 - 0.35, Math.PI / 2 - 0.8] });
    strap(P.trim, V(0.16 * bulk, shoulderY, 0), V(-0.15 * bulk, s2.y, 0), 0.03);
  }
  if (garb.satchel) {
    strap(P.dark, V(-0.15, shoulderY - 0.03, 0), V(0.17, beltY, 0), 0.026);
    const sw: BoneW = [[B('pelvis'), 0.7], [B('thigh_l'), 0.3]];
    addGeo(P.leather, new THREE.BoxGeometry(0.06, 0.12, 0.13).translate(0.21 * bulk, beltY - 0.1, 0.0), sw);
    addGeo(P.dark, new THREE.BoxGeometry(0.066, 0.05, 0.136).translate(0.21 * bulk, beltY - 0.06, 0.0), sw);
    addGeo(P.brass, new THREE.SphereGeometry(0.009, 8, 6).translate(0.245 * bulk, beltY - 0.085, 0.0), sw);
  }

  // ---- neck and head ----
  const hs = 1.05; // (storybook proportions: a slightly large head)
  const headC = head.clone().add(V(0, 0.088, 0.015));
  limb(P.skin, [V(0, neck.y - 0.05, -0.035), V(0, head.y + 0.02, -0.02)], [B('neck_01'), B('Head')], () => [female ? 0.042 : 0.05, female ? 0.042 : 0.048], { steps: [4], blend: 0.05, seg: LSEG });
  const H: BoneW = [[B('Head'), 1]];
  const hx = (female ? 0.08 : 0.085) * hs, hy = (female ? 0.105 : 0.11) * hs, hz = (female ? 0.092 : 0.096) * hs;
  const eyeN = 0.07, eyeX = 0.37; // where the eyes sit on the unit head
  {
    const g = new THREE.SphereGeometry(1, fine ? 48 : 26, fine ? 36 : 20);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Jaw narrows below the cheekbones; the chin comes forward; the back of the skull is rounder.
      const low = smooth(0.1, -0.9, y);
      x *= 1 - low * (female ? 0.34 : 0.25);
      if (z > 0) z *= 1 + low * 0.07 - smooth(0.2, 0.95, y) * 0.08;
      else z *= 1.06 - low * 0.1;
      // A chin: a soft forward knob at the bottom of the face.
      if (z > 0) z += Math.exp(-((y + 0.84) ** 2) / 0.02 - (x * x) / 0.06) * (female ? 0.035 : 0.06);
      // Cheekbones, and the flat of the cheeks below them.
      x *= 1 + Math.exp(-((y - 0.02) ** 2) / 0.02) * 0.055 * Math.max(0, z);
      // Brow ridge.
      if (z > 0.5) z += Math.exp(-((y - 0.27) ** 2) / 0.006) * (female ? 0.02 : 0.04) * (1 - Math.abs(x) * 0.6);
      // Eye sockets: a hollow either side of the nose.
      for (const s of [-1, 1]) {
        const d = (x - s * eyeX) ** 2 / 0.03 + (y - eyeN) ** 2 / 0.018;
        if (z > 0.45) z -= Math.exp(-d) * 0.075;
      }
      // The bridge of the nose rises between them and runs down the middle of the face.
      if (z > 0.6) z += Math.exp(-(x * x) / 0.006) * smooth(0.3, 0.05, y) * smooth(-0.3, -0.1, y) * 0.05;
      p.setXYZ(i, x * hx, y * hy, z * hz);
    }
    g.translate(headC.x, headC.y, headC.z);
    addGeo(P.skin, g, H);
  }
  // Nose: a wedge, narrow at the bridge and wider at the tip, with nostril wings.
  const faceZ = headC.z + hz;
  {
    const g = new THREE.SphereGeometry(1, 14, 12);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (0.5 + 0.5 * smooth(0.7, -0.5, y)));
      p.setZ(i, p.getZ(i) * (0.55 + 0.45 * smooth(0.8, -0.4, y)));
    }
    g.scale(female ? 0.0125 : 0.015, female ? 0.026 : 0.03, female ? 0.02 : 0.024).rotateX(-0.32).translate(headC.x, headC.y - 0.012 * hs, faceZ - 0.008);
    addGeo(P.skin, g, H);
    for (const s of [-1, 1]) addGeo(P.skin, new THREE.SphereGeometry(female ? 0.0058 : 0.0068, 8, 6).translate(headC.x + s * 0.0095, headC.y - 0.031 * hs, faceZ - 0.009), H);
  }
  // Ears.
  for (const s of [-1, 1]) {
    addGeo(P.skin, new THREE.SphereGeometry(1, 12, 10).scale(0.011, female ? 0.026 : 0.03, 0.019).rotateY(s * 0.42).rotateZ(s * -0.12).translate(headC.x + s * hx * 0.95, headC.y + 0.002, headC.z - 0.008), H);
  }
  // Eyes: the white, a coloured iris, the pupil and a point of light, under a dark upper lid.
  const eyeY = headC.y + eyeN * hy;
  for (const s of [-1, 1]) {
    const ex = headC.x + s * eyeX * hx, ez = headC.z + hz * 0.835;
    addGeo(P.white, new THREE.SphereGeometry(0.0125 * hs, 14, 10).scale(1.5, 1.0, 0.6).translate(ex, eyeY, ez), H);
    addGeo(P.eye, new THREE.SphereGeometry(0.0088 * hs, 14, 10).scale(1, 1, 0.4).translate(ex - s * 0.0012, eyeY - 0.0005, ez + 0.0052 * hs), H);
    addGeo(P.pupil, new THREE.SphereGeometry(0.0044 * hs, 10, 8).scale(1, 1, 0.4).translate(ex - s * 0.0012, eyeY - 0.0005, ez + 0.0077 * hs), H);
    addGeo(P.glint, new THREE.SphereGeometry(0.0018 * hs, 6, 5).translate(ex - s * 0.0012 + 0.0032, eyeY + 0.003, ez + 0.009 * hs), H);
    // Upper lid and lashes: a dark curve over the eye. Lower lid: a faint one.
    addGeo(P.lash, new THREE.TorusGeometry(0.0188 * hs, female ? 0.0017 : 0.0013, 5, 14, Math.PI).scale(1, 0.56, 1).rotateZ(s * -0.06).translate(ex, eyeY + 0.0008, ez + 0.0064 * hs), H);
    addGeo(P.skin, new THREE.TorusGeometry(0.0188 * hs, 0.0026, 5, 12, Math.PI).scale(1, 0.5, 1).rotateZ(Math.PI).translate(ex, eyeY - 0.0018, ez + 0.0044 * hs), H);
    // Brow: an arched bar, thicker toward the nose.
    const brow = new THREE.CapsuleGeometry(1, 2.6, 4, 8).rotateZ(Math.PI / 2);
    {
      const bp = brow.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i) * s; // + toward the temple
        const k = 1 - smooth(-1, 2.3, x) * 0.55;
        bp.setXYZ(i, bp.getX(i), bp.getY(i) * k - x * x * 0.06, bp.getZ(i) * k);
      }
    }
    brow.scale(0.0078 * hs, female ? 0.0034 : 0.0052, 0.004).rotateZ(s * (female ? -0.16 : -0.07)).translate(ex + s * 0.0015, eyeY + (female ? 0.024 : 0.0215) * hs, headC.z + hz * 0.985);
    addGeo(P.hair, brow, H);
  }
  // Mouth: an upper and a fuller lower lip, with the dark line between them.
  {
    const my = headC.y - 0.054 * hs, mz = headC.z + hz * 0.915;
    addGeo(P.lips, new THREE.SphereGeometry(1, 12, 8).scale(0.0175 * hs, 0.0042, 0.006).translate(headC.x, my + 0.0032, mz), H);
    addGeo(P.lips, new THREE.SphereGeometry(1, 12, 8).scale(0.0145 * hs, 0.0052, 0.0066).translate(headC.x, my - 0.0042, mz - 0.0006), H);
    addGeo(P.pupil, new THREE.BoxGeometry(0.03 * hs, 0.0014, 0.004).translate(headC.x, my - 0.0002, mz + 0.0034), H);
  }

  // ---- hair ----
  const hairCap = (inflate: number, keep: (x: number, y: number, z: number) => boolean) => {
    const g = new THREE.SphereGeometry(1, fine ? 36 : 22, fine ? 26 : 16);
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!;
    const out: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const cx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      if (keep(cx, cy, cz)) out.push(a, b, c);
    }
    g.setIndex(out);
    // (The skull is fuller behind than a plain ball: the cap follows it.)
    for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 1.05);
    g.scale(hx * (1 + inflate), hy * (1 + inflate * 0.8), hz * (1 + inflate));
    g.translate(headC.x, headC.y + 0.004, headC.z - 0.004);
    return g;
  };
  // Where hair grows on a scalp: above the brow at the front, above the ears at the sides, to the nape behind.
  const scalp = (_x: number, y: number, z: number) => y > (z > 0.35 ? 0.4 + (1 - z) * 0.1 : z > -0.3 ? 0.08 + Math.max(0, z) * 0.6 : -0.45);
  const hairStyle = look.hair;
  const hooded = !!look.hood && (outfit === 'ranger' || style === 'robe');
  if (hairStyle && !hooded) {
    const short = hairStyle === 'buzzed' || hairStyle === 'buzzedfemale';
    addGeo(P.hair, hairCap(short ? 0.05 : 0.085, scalp), H);
    if (!short) {
      // Volume on top, a fringe swept to one side, and a few loose locks to break the outline.
      addGeo(P.hair, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(hx * 0.97, hy * 0.38, hz * 0.92).rotateX(-0.25).translate(headC.x, headC.y + hy * 0.62, headC.z - 0.01), H);
      addGeo(P.hair, new THREE.SphereGeometry(1, 12, 8).scale(hx * 0.64, hy * 0.17, hz * 0.3).rotateZ(-0.35).translate(headC.x + hx * 0.22, headC.y + hy * 0.52, headC.z + hz * 0.78), H);
      for (const [lx, ly, lz, r, tilt] of [[-0.55, 0.62, 0.55, 0.3, 0.5], [0.72, 0.5, 0.2, 0.26, -0.7], [-0.78, 0.42, -0.1, 0.27, 0.8], [0.1, 0.86, -0.5, 0.34, 0.2], [0.5, 0.3, -0.75, 0.3, -0.3], [-0.45, 0.25, -0.8, 0.3, 0.3]]) {
        addGeo(P.hair, new THREE.SphereGeometry(1, 10, 7).scale(hx * r, hy * r * 0.62, hz * r).rotateZ(tilt).translate(headC.x + hx * lx, headC.y + hy * ly, headC.z + hz * lz), H);
      }
    }
    if (hairStyle === 'long') {
      // A fall of hair down the back to the shoulder blades (it follows the neck and back as it goes).
      const rings: Ring[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const y = headC.y + 0.02 - t * (female ? 0.36 : 0.3);
        const w: BoneW = t < 0.35 ? [[B('Head'), 1]] : t < 0.7 ? [[B('Head'), 0.5], [B('neck_01'), 0.5]] : [[B('neck_01'), 0.4], [B('spine_03'), 0.6]];
        rings.push({ c: V(headC.x, y, headC.z - hz * (0.45 + t * 0.35) - t * 0.02), u: V(1, 0, 0), v: V(0, 0, 1), rx: hx * (1.08 - t * 0.12), rz: 0.04 - t * 0.02, n: 2.2, w });
      }
      sweep(P.hair, rings, 16, { capEnd: true, arc: [-Math.PI - 0.15, 0.15] });
      // Locks framing the face.
      for (const s of [-1, 1]) limb(P.hair, [V(headC.x + s * hx * 0.92, headC.y + 0.03, headC.z + hz * 0.25), V(headC.x + s * hx * 0.95, headC.y - 0.12, headC.z + hz * 0.15)], [B('Head'), B('Head')], (t) => [0.02 * (1 - t * 0.5), 0.024 * (1 - t * 0.5)], { steps: [4], capEnd: true, seg: 8 });
    } else if (hairStyle === 'buns') {
      addGeo(P.hair, new THREE.SphereGeometry(0.045, 14, 10).translate(headC.x, headC.y + hy * 0.55, headC.z - hz * 0.88), H);
      addGeo(P.hair, new THREE.TorusGeometry(0.03, 0.008, 6, 14).rotateX(0.4).translate(headC.x, headC.y + hy * 0.6, headC.z - hz * 0.72), H);
    } else if (hairStyle === 'simpleparted') {
      // A tie at the nape: a short tail.
      limb(P.hair, [V(headC.x, headC.y - 0.02, headC.z - hz * 0.98), V(headC.x, headC.y - 0.11, headC.z - hz * 1.08)], [B('Head'), B('neck_01')], (t) => [0.02 * (1 - t * 0.4), 0.017 * (1 - t * 0.4)], { steps: [4], capEnd: true, seg: 8 });
    }
  }
  if (hooded) {
    // A hood up over the head, open at the face, gathered at the neck.
    addGeo(P.cloth, hairCap(0.15, (_x, y, z) => !(z > 0.3 && y < 0.55)), H);
    sweep(P.cloth, [0, 1, 2].map((k): Ring => ({ c: V(0, neck.y - 0.05 + k * 0.03, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.12 - k * 0.012, rz: 0.105 - k * 0.01, n: 2.2, w: [[B('spine_03'), 0.6 - k * 0.2], [B('neck_01'), 0.4 + k * 0.2]] })), 14);
  }
  /** A shell over the jaw and chin (a beard, or the shadow of one). */
  const jawShell = (part: Part, grow: number, drop: number) => {
    const g = new THREE.SphereGeometry(1, fine ? 30 : 20, fine ? 22 : 14);
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!;
    const out: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      if (cy < -0.16 && cz > -0.2) out.push(a, b, c);
    }
    g.setIndex(out);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const low = smooth(0.1, -0.9, y);
      const chin = z > 0 ? Math.exp(-((y + 0.84) ** 2) / 0.02 - (x * x) / 0.06) * (female ? 0.035 : 0.06) : 0;
      p.setXYZ(i, x * hx * grow * (1 - low * 0.25), y * hy * grow, (z * (z > 0 ? 1 + low * 0.07 : 1) + chin) * hz * grow + (y < -0.6 ? drop : 0));
    }
    g.translate(headC.x, headC.y, headC.z);
    addGeo(part, g, H);
  };
  if (garb.hat === 'kerchief') {
    // A kerchief tied over the hair, knotted at the nape.
    addGeo(P.linen, hairCap(0.125, (_x, y, z) => y > (z > 0.3 ? 0.44 : -0.2)), H);
    addGeo(P.linen, new THREE.SphereGeometry(0.02, 8, 6).translate(headC.x, headC.y - hy * 0.25, headC.z - hz * 1.12), H);
  } else if (garb.hat === 'straw') {
    // A straw hat, pushed back a little.
    const brim = new THREE.CylinderGeometry(0.2, 0.215, 0.012, fine ? 28 : 18).translate(0, hy * 0.7, -0.01);
    const crown = new THREE.CylinderGeometry(0.082, 0.098, 0.085, fine ? 20 : 14).translate(0, hy * 0.7 + 0.045, -0.01);
    const band = new THREE.CylinderGeometry(0.1, 0.1, 0.02, fine ? 20 : 14).translate(0, hy * 0.7 + 0.014, -0.01);
    for (const [part, g] of [[P.hat, brim], [P.hat, crown], [P.dark, band]] as [Part, THREE.BufferGeometry][]) addGeo(part, g.rotateX(-0.14).translate(headC.x, headC.y, headC.z), H);
  }
  if (garb.longBeard) {
    // A beard down to the chest.
    addGeo(P.hair, new THREE.SphereGeometry(1, 14, 12).scale(0.052, 0.095, 0.036).rotateX(0.12).translate(headC.x, headC.y - hy * 1.3, headC.z + hz * 0.5), [[B('Head'), 0.75], [B('neck_01'), 0.25]]);
  }
  if (look.beard) {
    jawShell(P.hair, 1.07, 0.012);
    addGeo(P.hair, new THREE.CapsuleGeometry(0.008, 0.035, 4, 8).rotateZ(Math.PI / 2).translate(headC.x, headC.y - 0.04 * hs, faceZ - 0.012), H);
  } else if (outfit === 'adventurer' && !female) {
    jawShell(P.stubble, 1.012, 0); // a few days on the road
  }
  if (outfit === 'adventurer') {
    // An old scar on the right cheek.
    addGeo(P.scar, new THREE.SphereGeometry(1, 8, 6).scale(0.0026, 0.017, 0.004).rotateZ(0.5).translate(headC.x - hx * 0.5, headC.y - 0.022 * hs, headC.z + hz * 0.79), H);
  }

  // ---- arms and hands ----
  for (const s of ['l', 'r'] as const) {
    const sg = s === 'l' ? 1 : -1;
    const sh = J('upperarm_' + s), el = J('lowerarm_' + s), wr = J('hand_' + s);
    const start = sh.clone().add(V(-sg * 0.06, 0, 0));
    const armB = [B('upperarm_' + s), B('lowerarm_' + s), B('hand_' + s)];
    const k = (female ? 0.88 : 1) * bulk;
    const startW: BoneW = [[B('clavicle_' + s), 0.6], [B('spine_03'), 0.4]];
    // Skin of the arm (hidden under a sleeve, but it keeps the elbow closed).
    limb(P.skin, [start, el, wr], armB, (t, seg) => seg === 0 ? [0.052 * k * (1 - t * 0.2), 0.054 * k * (1 - t * 0.18)] : [0.044 * k * (1 - t * 0.3) + 0.004, 0.04 * k * (1 - t * 0.28)], { steps: [6, 6], blend: 0.05, startW, seg: LSEG });
    // Sleeve: shoulder to just past the elbow, a little loose (padded on a gambeson), cuffed.
    const pad = outfit === 'adventurer' ? 0.006 : 0;
    const elbowOut = el.clone().lerp(wr, 0.2);
    if (style !== 'robe') limb(style === 'peasant' || style === 'tunic' ? P.linen : P.cloth, [start.clone().add(V(-sg * 0.005, 0, 0)), el, elbowOut], armB, (t, seg) => seg === 0 ? [(0.064 + pad - t * 0.008) * k, (0.066 + pad - t * 0.008) * k] : [(0.058 + pad) * k, (0.056 + pad) * k], { steps: [6, 2], blend: 0.05, startW, seg: LSEG });
    if (style === 'robe') {
      // A long sleeve opening into a wide cuff, edged.
      const cuff = el.clone().lerp(wr, 0.95);
      limb(P.cloth, [start.clone().add(V(-sg * 0.005, 0, 0)), el, cuff], armB, (t, seg) => seg === 0 ? [(0.066 - t * 0.006) * k, (0.068 - t * 0.006) * k] : [(0.06 + t * 0.03) * k, (0.058 + t * 0.034) * k], { steps: [6, 5], blend: 0.05, startW, seg: LSEG });
      limb(P.trim, [el.clone().lerp(wr, 0.9), el.clone().lerp(wr, 0.97)], [B('lowerarm_' + s), B('lowerarm_' + s)], () => [0.093 * k, 0.095 * k], { steps: [1], seg: LSEG });
    }
    const bA = el.clone().lerp(wr, 0.25), bB = el.clone().lerp(wr, 0.92);
    if (garb.armour) {
      // Steel vambraces and elbow cops.
      limb(P.steel, [bA, bB], [B('lowerarm_' + s), B('lowerarm_' + s)], (t) => [(0.057 - t * 0.012) * k, (0.053 - t * 0.01) * k], { steps: [4], n: 2.4, seg: LSEG });
      addGeo(P.steel, new THREE.SphereGeometry(0.058 * k, 12, 8).translate(el.x, el.y, el.z - 0.012), [[B('upperarm_' + s), 0.5], [B('lowerarm_' + s), 0.5]]);
    } else if (outfit !== 'peasant' && look.bracers !== false && style !== 'robe') {
      // Leather vambrace on the forearm.
      limb(P.leather, [bA, bB], [B('lowerarm_' + s), B('lowerarm_' + s)], (t) => [(0.052 - t * 0.012) * k, (0.048 - t * 0.01) * k], { steps: [4], n: 2.6, seg: LSEG });
      for (const t of [0.04, 0.96]) {
        const c = bA.clone().lerp(bB, t);
        limb(P.dark, [c.clone().lerp(bB, -0.03), c.clone().lerp(bB, 0.03)], [B('lowerarm_' + s), B('lowerarm_' + s)], () => [(0.055 - t * 0.012) * k, (0.051 - t * 0.01) * k], { steps: [1], n: 2.6, seg: LSEG });
      }
      if (outfit === 'adventurer') {
        // Steel splints riveted along the back of the forearm.
        const { u, v } = frame(bB.clone().sub(bA));
        for (const a of [-0.55, 0, 0.55]) {
          for (const side of [1, -1]) {
            const off = u.clone().multiplyScalar(Math.sin(a) * 0.05 * k).addScaledVector(v, side * Math.cos(a) * 0.05 * k);
            addGeo(P.splints, bar(bA.clone().lerp(bB, 0.08), bA.clone().lerp(bB, 0.92), 0.016, 0.012, off), [[B('lowerarm_' + s), 1]]);
          }
        }
      }
    }
    // Hand: palm and back, then each finger along its own bones, and the thumb.
    const mid = J('middle_01_' + s);
    limb(outfit === 'adventurer' ? P.dark : P.skin, [wr.clone().add(V(-sg * 0.01, 0, 0)), mid], [B('hand_' + s), B('hand_' + s)], (t) => [(0.042 + t * 0.006) * k, 0.018 * k + t * 0.004], { steps: [3], capStart: true, n: 3, seg: LSEG });
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const pts = ['01', '02', '03', '04_leaf'].map((n) => J(`${f}_${n}_${s}`));
      const bs = ['01', '02', '03'].map((n) => B(`${f}_${n}_${s}`));
      const r = (f === 'pinky' ? 0.0075 : f === 'middle' ? 0.0095 : 0.009) * k;
      limb(P.skin, [pts[0].clone().lerp(wr, 0.12), ...pts.slice(1)], [...bs, bs[2]], (t, seg) => [r * (1 - seg * 0.1 - t * 0.04), r * 0.92 * (1 - seg * 0.1)], { steps: [2, 2, 2], blend: 0.012, capEnd: true, seg: fine ? 8 : 6 });
    }
    const th = ['01', '02', '03', '04_leaf'].map((n) => J(`thumb_${n}_${s}`));
    const tb = ['01', '02', '03'].map((n) => B(`thumb_${n}_${s}`));
    limb(P.skin, th, [...tb, tb[2]], (_t, seg) => [0.0115 * k * (1 - seg * 0.12), 0.01 * k * (1 - seg * 0.12)], { steps: [2, 2, 2], blend: 0.012, capEnd: true, seg: fine ? 8 : 6 });
    if (outfit !== 'peasant' && style !== 'robe') {
      // A glove's cuff at the wrist.
      limb(P.dark, [wr.clone().add(V(-sg * 0.025, 0, 0)), wr.clone().add(V(sg * 0.02, 0, 0))], [B('hand_' + s), B('hand_' + s)], () => [0.047 * k, 0.026 * k], { steps: [1], n: 3, seg: LSEG });
    }
  }

  // ---- legs and feet ----
  for (const s of ['l', 'r'] as const) {
    const sg = s === 'l' ? 1 : -1;
    const hip = J('thigh_' + s), knee = J('calf_' + s), ankle = J('foot_' + s), ball = J('ball_' + s), toe = J('ball_leaf_' + s);
    const top = hip.clone().add(V(-sg * 0.01, 0.03, 0));
    const legB = [B('thigh_' + s), B('calf_' + s), B('foot_' + s)];
    const k = (female ? 0.95 : 1) * Math.sqrt(bulk);
    // Trousers (or stockings under a skirt), hip to ankle.
    limb(style === 'peasant' && female ? P.linen : P.trousers, [top, knee, ankle.clone().add(V(0, 0.04, 0.02))], legB, (t, seg) => seg === 0
      ? [(0.088 - t * 0.03 + (female ? 0.006 : 0)) * k, (0.09 - t * 0.032) * k]
      : [(0.058 - Math.abs(t - 0.25) * 0.03) * k, (0.06 - Math.abs(t - 0.2) * 0.03) * k], { steps: [7, 7], blend: 0.07, startW: [[B('pelvis'), 1]], seg: LSEG });
    const tall = outfit !== 'peasant' || !!garb.tallBoots;
    const bTop = knee.clone().lerp(ankle, tall ? 0.12 : 0.7), bLow = ankle.clone().add(V(0, 0.02, 0.012));
    // Boots: tall with a folded cuff for those who travel, ankle shoes for those who don't.
    limb(P.boots, [bTop.clone().add(V(0, 0.02, 0)), bLow], [B('calf_' + s), B('calf_' + s)], (t) => tall ? [0.066 - t * 0.02, 0.07 - t * 0.022] : [0.052 - t * 0.006, 0.055 - t * 0.006], { steps: [tall ? 6 : 2], n: 2.2, seg: LSEG });
    if (tall) {
      limb(P.leather, [bTop.clone().add(V(0, 0.035, 0)), bTop.clone().add(V(0, -0.025, 0))], [B('calf_' + s), B('calf_' + s)], () => [0.074, 0.078], { steps: [1], n: 2.2, seg: LSEG });
      if (outfit === 'adventurer') {
        // Two straps round the shin, buckled on the outside, and a steel cop over the knee.
        for (const t of [0.35, 0.72]) {
          const c = bTop.clone().lerp(bLow, t);
          limb(P.dark, [c.clone().add(V(0, 0.011, 0)), c.clone().add(V(0, -0.011, 0))], [B('calf_' + s), B('calf_' + s)], () => [0.066 - t * 0.02 + 0.004, 0.07 - t * 0.022 + 0.004], { steps: [1], n: 2.2, seg: LSEG });
          addGeo(P.brass, new THREE.BoxGeometry(0.01, 0.026, 0.024).translate(c.x + sg * (0.07 - t * 0.02), c.y, c.z), [[B('calf_' + s), 1]]);
        }
        const kw: BoneW = [[B('thigh_' + s), 0.45], [B('calf_' + s), 0.55]];
        addGeo(P.knees, new THREE.SphereGeometry(1, fine ? 16 : 10, fine ? 12 : 8).scale(0.066, 0.078, 0.056).translate(knee.x, knee.y + 0.005, knee.z + 0.044), kw);
        addGeo(P.knees, new THREE.SphereGeometry(1, 12, 8).scale(0.05, 0.03, 0.04).translate(knee.x, knee.y - 0.062, knee.z + 0.03), [[B('calf_' + s), 1]]);
        limb(P.dark, [knee.clone().add(V(0, 0.012, -0.004)), knee.clone().add(V(0, -0.012, -0.004))], [B('calf_' + s), B('calf_' + s)], () => [0.064, 0.066], { steps: [1], n: 2.2, seg: LSEG });
      }
    }
    if (garb.armour) {
      // Greaves on the shins and a cop over each knee.
      limb(P.steel, [knee.clone().lerp(ankle, 0.1), ankle.clone().add(V(0, 0.06, 0.012))], [B('calf_' + s), B('calf_' + s)], (t) => [0.072 - t * 0.02, 0.076 - t * 0.022], { steps: [5], n: 2.2, seg: LSEG });
      addGeo(P.steel, new THREE.SphereGeometry(1, 12, 10).scale(0.066, 0.078, 0.056).translate(knee.x, knee.y + 0.005, knee.z + 0.044), [[B('thigh_' + s), 0.45], [B('calf_' + s), 0.55]]);
    }
    // The foot: heel to toe on the ground, a little higher at the instep.
    const heel = V(ankle.x, 0.0, ankle.z - 0.075);
    const rings: Ring[] = [];
    const prof: [number, number, number, number, number][] = [
      // [z, y centre, half-width, half-height, bone]
      [heel.z, 0.045, 0.036, 0.042, B('foot_' + s)],
      [ankle.z, 0.06, 0.044, 0.058, B('foot_' + s)],
      [ankle.z + 0.07, 0.048, 0.048, 0.046, B('foot_' + s)],
      [ball.z, 0.036, 0.05, 0.034, B('ball_' + s)],
      [toe.z + 0.02, 0.026, 0.04, 0.024, B('ball_' + s)],
    ];
    for (const [z, y, w, h, b] of prof) {
      const blendW: BoneW = z > ball.z - 0.03 && z < ball.z + 0.01 ? [[B('foot_' + s), 0.5], [B('ball_' + s), 0.5]] : z <= ankle.z + 0.01 ? [[B('foot_' + s), 0.8], [B('calf_' + s), z === ankle.z ? 0.2 : 0]] : [[b, 1]];
      rings.push({ c: V(ankle.x, y, z), u: V(1, 0, 0), v: V(0, 1, 0), rx: w, rz: h, n: 2.6, w: blendW });
    }
    sweep(P.boots, rings, fine ? 16 : 10, { capStart: true, capEnd: true });
    // A sole.
    sweep(P.sole, [
      { c: V(ankle.x, 0.006, heel.z - 0.004), u: V(1, 0, 0), v: V(0, 1, 0), rx: 0.04, rz: 0.008, n: 4, w: [[B('foot_' + s), 1]] },
      { c: V(ankle.x, 0.006, ball.z - 0.02), u: V(1, 0, 0), v: V(0, 1, 0), rx: 0.052, rz: 0.008, n: 4, w: [[B('foot_' + s), 0.5], [B('ball_' + s), 0.5]] },
      { c: V(ankle.x, 0.006, toe.z + 0.024), u: V(1, 0, 0), v: V(0, 1, 0), rx: 0.042, rz: 0.008, n: 4, w: [[B('ball_' + s), 1]] },
    ], fine ? 12 : 8, { capStart: true, capEnd: true });
  }
  return P;
}

// ---- from parts to meshes ----------------------------------------------------------------------

/**
 * Smooth normals for a set of parts in one go: computed per triangle, then
 * shared between vertices that sit at the same point (the seam of a tube, a
 * cap and its rim), so no part shows a crease where it was stitched.
 */
function smoothNormals(pos: Float32Array, idx: number[] | Uint32Array) {
  const n = new Float32Array(pos.length);
  const a = V(), b = V(), c = V(), e1 = V(), e2 = V();
  for (let t = 0; t < idx.length; t += 3) {
    const i = idx[t] * 3, j = idx[t + 1] * 3, k = idx[t + 2] * 3;
    a.fromArray(pos, i); b.fromArray(pos, j); c.fromArray(pos, k);
    e1.subVectors(b, a); e2.subVectors(c, a).cross(e1).negate(); // area-weighted face normal
    for (const q of [i, j, k]) { n[q] += e2.x; n[q + 1] += e2.y; n[q + 2] += e2.z; }
  }
  // Weld by position.
  const key = (i: number) => `${Math.round(pos[i] * 20000)},${Math.round(pos[i + 1] * 20000)},${Math.round(pos[i + 2] * 20000)}`;
  const sum = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.length; i += 3) {
    const k = key(i);
    const s = sum.get(k);
    if (s) { s[0] += n[i]; s[1] += n[i + 1]; s[2] += n[i + 2]; } else sum.set(k, [n[i], n[i + 1], n[i + 2]]);
  }
  for (let i = 0; i < pos.length; i += 3) {
    const s = sum.get(key(i))!;
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    n[i] = s[0] / l; n[i + 1] = s[1] / l; n[i + 2] = s[2] / l;
  }
  return n;
}

function kitMeshes(model: THREE.Object3D) {
  const kit: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) kit.push(o as THREE.SkinnedMesh);
  });
  const anchor = kit.find((m) => m.skeleton.bones.length > 40) ?? kit[0];
  return { kit, anchor };
}

/** Bind-space positions to the anchor's mesh space. */
function toMeshSpace(src: number[], m: THREE.Matrix4) {
  const pos = new Float32Array(src);
  const v = V();
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
    pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
  }
  return pos;
}

function skinned(g: THREE.BufferGeometry, mat: THREE.Material, anchor: THREE.SkinnedMesh) {
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.position.copy(anchor.position);
  mesh.quaternion.copy(anchor.quaternion);
  mesh.scale.copy(anchor.scale);
  mesh.bind(anchor.skeleton, anchor.bindMatrix);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** A soft woven / grained roughness so flat colours read as cloth. */
let grainTex: THREE.CanvasTexture | null = null;
function grain() {
  if (grainTex) return grainTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 64);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const weave = ((x + y) % 4 < 2 ? 1 : 0.94) * (x % 3 === 0 ? 0.97 : 1);
    const v = Math.round(255 * weave * (0.9 + rnd() * 0.1));
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTex = new THREE.CanvasTexture(c);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.repeat.set(9, 9);
  return grainTex;
}

const SLOT_OF: Partial<Record<PartKey, string>> = { pauldron: 'shoulders', knees: 'legs', splints: 'hands' };

/**
 * The hero: replace the kit meshes on a built character with the hero's own
 * body, one mesh per material. Starter armour pieces carry
 * `userData.starterSlot`, so real armour on that slot can hide them.
 */
export function dressHero(model: THREE.Object3D, look: Look) {
  const { kit, anchor } = kitMeshes(model);
  if (!anchor) return;
  const P = sculptParts(anchor.skeleton, look, 'adventurer', true);
  const pal = paletteOf(look, 'adventurer');
  const plain = (color: THREE.ColorRepresentation, name: string, o: { rough?: number; metal?: number; grain?: boolean; side?: THREE.Side; emissive?: number } = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide });
    if (o.grain) m.roughnessMap = grain();
    if (o.emissive) (m.emissive.set(color), (m.emissiveIntensity = o.emissive));
    m.name = name;
    m.userData.styleRim = 0.5; // (characters take a brighter rim, like the cast)
    return m;
  };
  /** A painted surface (leather, quilting, steel) tiling every `metres`, tinted to come out `color` on the whole. */
  const painted = (set: string, color: THREE.Color, metres: number, name: string, o: { rough?: number; metal?: number; side?: THREE.Side; relief?: number } = {}) => {
    const m = paintedMaterial(set, { roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide }, 4, color);
    if (!m) return plain(color, name, { rough: o.rough, metal: o.metal, side: o.side, grain: true });
    for (const t of [m.map, m.normalMap]) t?.repeat.set(1 / metres, 1 / metres);
    m.normalScale.setScalar(o.relief ?? 1);
    m.name = name;
    m.userData.styleRim = 0.5;
    return m;
  };
  const grey = (c: THREE.Color, k: number) => c.clone().lerp(new THREE.Color(0.32, 0.33, 0.35), k);
  const steel = new THREE.Color(0x8b9199);
  const mats: Record<PartKey, THREE.Material> = {
    skin: plain(pal.skin, 'HeroSkin', { rough: 0.62 }),
    lips: plain(pal.skin.clone().multiplyScalar(0.72).lerp(new THREE.Color(0x9a4038), 0.42), 'HeroLips', { rough: 0.55 }),
    white: plain(0xf2ece2, 'HeroSclera', { rough: 0.3 }),
    eye: plain(0x3a6a8c, 'HeroEye', { rough: 0.2 }),
    pupil: plain(0x14100e, 'HeroPupil', { rough: 0.25 }),
    glint: plain(0xffffff, 'HeroGlint', { rough: 0.1, emissive: 0.9 }),
    lash: plain(pal.hair.clone().multiplyScalar(0.35), 'HeroLash', { rough: 0.6, side: THREE.DoubleSide }),
    hair: plain(pal.hair, 'HeroHair', { rough: 0.55, side: THREE.DoubleSide }),
    stubble: plain(pal.skin.clone().lerp(pal.hair, 0.13), 'HeroStubble', { rough: 0.8, side: THREE.DoubleSide }),
    scar: plain(pal.skin.clone().multiplyScalar(0.86).lerp(new THREE.Color(0xc98a80), 0.5), 'HeroScar', { rough: 0.5 }),
    // The gambeson keeps your colour, weathered: quilted, a little faded.
    cloth: painted('gambeson', grey(pal.cloth, 0.58).multiplyScalar(0.62), 0.3, 'HeroTunic', { rough: 0.95, relief: 1.3, side: THREE.DoubleSide }),
    linen: plain(pal.linen.clone().multiplyScalar(0.8), 'HeroScarf', { rough: 0.95, grain: true }),
    leather: painted('leather', pal.leather, 0.34, 'HeroLeather', { rough: 0.68, side: THREE.DoubleSide }),
    dark: painted('leather', new THREE.Color(0x2c1e15), 0.3, 'HeroStrap', { rough: 0.72 }),
    trousers: plain(pal.trousers, 'HeroTrousers', { rough: 0.92, grain: true }),
    boots: painted('leather', pal.boots, 0.3, 'HeroBoots', { rough: 0.6 }),
    sole: plain(0x231a14, 'HeroSole', { rough: 0.9 }),
    brass: plain(0xb89250, 'HeroBrass', { rough: 0.38, metal: 0.85 }),
    steel: painted('steel', steel, 0.22, 'HeroSteel', { rough: 0.45, metal: 0.5 }),
    pauldron: painted('steel', steel, 0.22, 'HeroPauldron', { rough: 0.45, metal: 0.5, side: THREE.DoubleSide }),
    knees: painted('steel', steel, 0.2, 'HeroKnees', { rough: 0.45, metal: 0.5 }),
    splints: painted('steel', steel, 0.2, 'HeroSplints', { rough: 0.45, metal: 0.5 }),
    accent: plain(pal.accent, 'HeroAccent', { rough: 0.9, grain: true, side: THREE.DoubleSide }),
    second: plain(pal.second, 'HeroSecond', { rough: 0.9, grain: true, side: THREE.DoubleSide }),
    trim: plain(pal.trim, 'HeroTrim', { rough: 0.4, metal: 0.7 }),
    hat: plain(0xd8b868, 'HeroHat', { rough: 0.95, side: THREE.DoubleSide }),
  };
  const parent = anchor.parent!;
  // Out with the kit's surfaces (the skeleton stays: it is shared).
  // (Not disposed: the kit's geometry is shared between characters.)
  for (const m of kit) m.removeFromParent();
  const NAMES: Partial<Record<PartKey, string>> = { eye: 'Hero_Eye', white: 'Hero_Sclera', hair: 'Hero_Hair', cloth: 'Hero_tunic', linen: 'Hero_scarf' };
  const noShadow = new Set<PartKey>(['eye', 'white', 'pupil', 'glint', 'lash', 'lips', 'scar', 'stubble']);
  for (const key of PART_KEYS) {
    const p = P[key];
    if (!p.idx.length) continue;
    const g = new THREE.BufferGeometry();
    const pos = toMeshSpace(p.pos, anchor.bindMatrixInverse);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(smoothNormals(pos, p.idx), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4));
    g.setIndex(p.idx);
    const mesh = skinned(g, mats[key], anchor);
    // (The irises are the hero's "Eye": origins tint them.)
    mesh.name = NAMES[key] ?? 'Hero_' + key;
    mesh.castShadow = !noShadow.has(key);
    if (SLOT_OF[key]) mesh.userData.starterSlot = SLOT_OF[key];
    parent.add(mesh);
  }
}

// Townsfolk share one material: the colours are in the vertices.
let folkMat: THREE.MeshStandardMaterial | null = null;
function folkMaterial() {
  if (!folkMat) {
    folkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
    folkMat.name = 'Folk';
    folkMat.userData.styleRim = 0.5;
  }
  return folkMat;
}

/**
 * A townsperson, bandit, traveller: replace the kit meshes on a built
 * character with a sculpted body in the look's outfit, as ONE mesh coloured
 * per vertex. Returns the mesh.
 */
export function dressFolk(model: THREE.Object3D, look: Look) {
  const { kit, anchor } = kitMeshes(model);
  if (!anchor) return null;
  const outfit: Outfit = look.outfit === 'ranger' ? 'ranger' : 'peasant';
  const P = sculptParts(anchor.skeleton, look, outfit, false);
  const pal = paletteOf(look, outfit);
  const C = (hex: number) => new THREE.Color(hex);
  const colors: Record<PartKey, THREE.Color> = {
    skin: pal.skin,
    lips: pal.skin.clone().multiplyScalar(0.74).lerp(C(0x9a4038), 0.4),
    white: C(0xf2ece2),
    eye: C([0x3a5a7a, 0x5a4a2a, 0x3f6a4a, 0x4a3a2a][Math.abs(Math.round((look.hairColor ?? 0) + (look.height ?? 1.7) * 131)) % 4]),
    pupil: C(0x14100e),
    glint: C(0xffffff),
    lash: pal.skin.clone().multiplyScalar(0.45).lerp(pal.hair, 0.5).multiplyScalar(0.6),
    hair: pal.hair,
    stubble: pal.skin,
    scar: pal.skin,
    cloth: pal.cloth,
    linen: pal.linen,
    leather: pal.leather,
    dark: C(0x2e2016),
    trousers: pal.trousers,
    boots: pal.boots,
    sole: C(0x231a14),
    brass: C(0xb89250),
    steel: pal.steel,
    accent: pal.accent,
    second: pal.second,
    trim: pal.trim,
    hat: C(0xd8b868),
    pauldron: C(0x8b9199),
    knees: C(0x8b9199),
    splints: C(0x8b9199),
  };
  let nv = 0, ni = 0;
  for (const key of PART_KEYS) (nv += P[key].pos.length / 3), (ni += P[key].idx.length);
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  let v0 = 0, i0 = 0;
  for (const key of PART_KEYS) {
    const p = P[key];
    const n = p.pos.length / 3;
    if (!n) continue;
    pos.set(p.pos, v0 * 3);
    si.set(p.si, v0 * 4);
    sw.set(p.sw, v0 * 4);
    const c = colors[key];
    for (let i = 0; i < n; i++) c.toArray(col, (v0 + i) * 3);
    for (let i = 0; i < p.idx.length; i++) idx[i0 + i] = p.idx[i] + v0;
    v0 += n;
    i0 += p.idx.length;
  }
  const mp = toMeshSpace(Array.from(pos), anchor.bindMatrixInverse);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(smoothNormals(mp, idx), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const parent = anchor.parent!;
  for (const m of kit) m.removeFromParent();
  const mesh = skinned(g, folkMaterial(), anchor);
  mesh.name = 'Folk_body';
  parent.add(mesh);
  return mesh;
}
