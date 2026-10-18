import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';

// The Giant Forest Spider: a hunting spider the size of a hound. A domed,
// glossy carapace with pale side bands and eight eyes in two rows; a heavy,
// hairy abdomen marked with pale chevrons; eight long banded legs, kneeling
// high; black fangs under thick chelicerae; feelers that never stop moving.
// +Z is forward, feet on y = 0, metres.

const C: V3 = [0, 0.48, 0.14]; // prosoma centre
/** Leg directions (radians from +Z) front to back, and segment lengths femur / tibia / metatarsus. */
const LEGS: { ang: number; len: [number, number, number] }[] = [
  { ang: 0.55, len: [0.42, 0.4, 0.5] },
  { ang: 1.15, len: [0.37, 0.35, 0.47] },
  { ang: 1.85, len: [0.37, 0.36, 0.48] },
  { ang: 2.45, len: [0.41, 0.4, 0.51] },
];

export interface LegPts {
  name: string;
  side: number;
  index: number;
  H: V3;
  K: V3;
  A: V3;
  T: V3;
  dir: V3;
}

function legPoints(side: number, i: number): LegPts {
  const { ang, len } = LEGS[i];
  const dir: V3 = [side * Math.sin(ang), 0, Math.cos(ang)];
  const at = (r: number, y: number): V3 => [C[0] + dir[0] * r, y, C[2] + dir[2] * r];
  const H = at(0.17, 0.43);
  const fe = (50 * Math.PI) / 180, ti = (52 * Math.PI) / 180;
  const kr = 0.17 + len[0] * Math.cos(fe), ky = 0.43 + len[0] * Math.sin(fe);
  const ar = kr + len[1] * Math.cos(ti), ay = ky - len[1] * Math.sin(ti);
  const d = Math.sqrt(Math.max(0.01, len[2] * len[2] - ay * ay));
  return { name: `${side > 0 ? 'L' : 'R'}${i}`, side, index: i, H, K: at(kr, ky), A: at(ar, ay), T: at(ar + d, 0), dir };
}
export const SPIDER_LEGS: LegPts[] = [1, -1].flatMap((s) => [0, 1, 2, 3].map((i) => legPoints(s, i)));

const palp = (side: 'L' | 'R', s: number): BoneSpec[] => [
  { name: `palp${side}0`, parent: 'body', at: [s * 0.075, 0.42, 0.4] },
  { name: `palp${side}1`, parent: `palp${side}0`, at: [s * 0.12, 0.47, 0.52] },
  { name: `palp${side}2`, parent: `palp${side}1`, at: [s * 0.12, 0.3, 0.62] },
  { name: `palp${side}3`, parent: `palp${side}2`, at: [s * 0.11, 0.16, 0.66] },
];

export const SPIDER_RIG = new RigSpec([
  { name: 'body', at: C },
  { name: 'abdomen', parent: 'body', at: [0, 0.55, -0.14] },
  { name: 'spin', parent: 'abdomen', at: [0, 0.56, -0.92] },
  { name: 'chelL', parent: 'body', at: [0.048, 0.46, 0.41] },
  { name: 'chelR', parent: 'body', at: [-0.048, 0.46, 0.41] },
  { name: 'fangL', parent: 'chelL', at: [0.05, 0.35, 0.47] },
  { name: 'fangR', parent: 'chelR', at: [-0.05, 0.35, 0.47] },
  ...palp('L', 1),
  ...palp('R', -1),
  ...SPIDER_LEGS.flatMap((l): BoneSpec[] => [
    { name: `${l.name}a`, parent: 'body', at: l.H },
    { name: `${l.name}b`, parent: `${l.name}a`, at: l.K },
    { name: `${l.name}c`, parent: `${l.name}b`, at: l.A },
    { name: `${l.name}d`, parent: `${l.name}c`, at: l.T },
  ]),
]);

const B = (n: string) => SPIDER_RIG.bones[SPIDER_RIG.bone(n)].at;

/** Carapace outline (z, top, bottom, half width): eyes at the raised front, a low rim behind. */
const PROSOMA: [number, number, number, number][] = [
  [0.45, 0.555, 0.45, 0.06],
  [0.41, 0.595, 0.4, 0.13],
  [0.31, 0.615, 0.37, 0.19],
  [0.17, 0.6, 0.36, 0.215],
  [0.03, 0.57, 0.375, 0.195],
  [-0.06, 0.53, 0.41, 0.12],
  [-0.1, 0.5, 0.44, 0.05],
];
/** Abdomen outline: a heavy egg carried high. */
const ABDOMEN: [number, number, number, number][] = [
  [-0.14, 0.6, 0.48, 0.06],
  [-0.21, 0.72, 0.4, 0.2],
  [-0.36, 0.83, 0.35, 0.3],
  [-0.56, 0.84, 0.35, 0.31],
  [-0.74, 0.76, 0.4, 0.25],
  [-0.88, 0.65, 0.47, 0.14],
  [-0.95, 0.59, 0.52, 0.05],
];

function bodyParts(): Part[] {
  const P: Part[] = [
    { shape: { k: 'loft', slices: PROSOMA, egg: 0.25 }, bone: 'body', tag: 'carapace', blend: 0 },
    // Sternum underneath.
    { shape: { k: 'ell', c: [0, 0.39, 0.17], r: [0.14, 0.05, 0.19] }, bone: 'body', tag: 'under', blend: 0.04 },
    // Eye mound.
    { shape: { k: 'ell', c: [0, 0.585, 0.39], r: [0.1, 0.05, 0.07] }, bone: 'body', tag: 'eyes', blend: 0.04 },
    // Fovea: the little pit in the middle of the back.
    { shape: { k: 'ell', c: [0, 0.625, 0.12], r: [0.012, 0.012, 0.035] }, bone: 'body', tag: 'fovea', blend: 0.015, carve: true },
    // Waist.
    { shape: { k: 'cone', a: [0, 0.48, -0.06], b: [0, 0.54, -0.18], ra: 0.05, rb: 0.055 }, bone: 'abdomen', tag: 'under', blend: 0.03 },
    { shape: { k: 'loft', slices: ABDOMEN, egg: 0.12 }, bone: 'abdomen', tag: 'abdomen', blend: 0.03 },
    // Spinnerets.
    { shape: { k: 'cone', a: [0.02, 0.56, -0.9], b: [0.03, 0.54, -0.99], ra: 0.025, rb: 0.012 }, bone: 'spin', tag: 'spin', blend: 0.015 },
    { shape: { k: 'cone', a: [-0.02, 0.56, -0.9], b: [-0.03, 0.54, -0.99], ra: 0.025, rb: 0.012 }, bone: 'spin', tag: 'spin', blend: 0.015 },
  ];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    // Chelicerae: thick, hairy, angled down in front of the mouth.
    P.push({ shape: { k: 'cone', a: [s * 0.045, 0.49, 0.4], b: [s * 0.05, 0.37, 0.47], ra: 0.052, rb: 0.038 }, bone: `chel${side}`, tag: 'chel', blend: 0.03 });
    // Feelers.
    P.push({ shape: { k: 'cone', a: B(`palp${side}0`), b: B(`palp${side}1`), ra: 0.024, rb: 0.022 }, bone: `palp${side}0`, tag: 'leg', blend: 0.012 });
    P.push({ shape: { k: 'cone', a: B(`palp${side}1`), b: B(`palp${side}2`), ra: 0.022, rb: 0.02 }, bone: `palp${side}1`, tag: 'leg', blend: 0.01 });
    P.push({ shape: { k: 'cone', a: B(`palp${side}2`), b: B(`palp${side}3`), ra: 0.02, rb: 0.024 }, bone: `palp${side}2`, tag: 'palpTip', blend: 0.01 });
  }
  // Coxae: the stout leg roots under the carapace rim.
  for (const l of SPIDER_LEGS) {
    const inner: V3 = [C[0] + l.dir[0] * 0.08, 0.41, C[2] + l.dir[2] * 0.08];
    P.push({ shape: { k: 'cone', a: inner, b: l.H, ra: 0.045, rb: 0.043 }, bone: 'body', tag: 'under', blend: 0.03 });
  }
  return P;
}

function legParts(l: LegPts): Part[] {
  const n = l.name;
  const T: V3 = [l.T[0], 0.012, l.T[2]];
  return [
    { shape: { k: 'ball', c: l.H, r: 0.058 }, bone: `${n}a`, tag: 'joint', blend: 0 },
    { shape: { k: 'cone', a: l.H, b: l.K, ra: 0.057, rb: 0.048 }, bone: `${n}a`, tag: 'femur', blend: 0.016 },
    { shape: { k: 'ball', c: l.K, r: 0.051 }, bone: `${n}b`, tag: 'joint', blend: 0.016 },
    { shape: { k: 'cone', a: l.K, b: l.A, ra: 0.047, rb: 0.037 }, bone: `${n}b`, tag: 'tibia', blend: 0.016 },
    { shape: { k: 'ball', c: l.A, r: 0.037 }, bone: `${n}c`, tag: 'joint', blend: 0.014 },
    { shape: { k: 'cone', a: l.A, b: T, ra: 0.032, rb: 0.015 }, bone: `${n}c`, tag: 'meta', blend: 0.014 },
  ];
}

// Colours: dark chestnut and umber, pale ochre bands and chevrons.
const COL = {
  carapace: new THREE.Color(0x3b2719),
  band: new THREE.Color(0xa58155),
  abdomen: new THREE.Color(0x2f2119),
  chevron: new THREE.Color(0xb48d5a),
  under: new THREE.Color(0x1c1410),
  leg: new THREE.Color(0x45301f),
  ring: new THREE.Color(0xa88a5e),
  chel: new THREE.Color(0x1d1612),
};
const _c = new THREE.Color();

export const spiderPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const legs = t('femur') + t('tibia') + t('meta') + t('joint') + t('leg') + t('palpTip');
  out.color.copy(COL.carapace);
  out.fur = 0;
  out.mask = 0;
  // Carapace: dark centre stripe, pale side bands, a dark rim.
  if (t('carapace') + t('eyes') > 0.3) {
    const rx = Math.abs(p.x);
    const bandW = smooth(0.05, 0.08, rx) * smooth(0.15, 0.115, rx);
    out.color.copy(COL.carapace).lerp(COL.band, bandW * 0.85 * smooth(0.42, 0.3, p.z));
    // Radiating striations from the fovea.
    const ang = Math.atan2(p.x, p.z - 0.12);
    out.color.multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(ang * 5)));
    out.mask = 0.65 * smooth(0.45, 0.6, p.y);
    out.fur = 0.006 + 0.01 * smooth(0.12, 0.19, rx) + 0.004 * bandW;
    out.flow.set(p.x, 0, p.z - 0.12).normalize();
  }
  // Abdomen: umber with a pale heart mark and chevrons down the back.
  const ab = t('abdomen');
  if (ab > 0.01) {
    const dz = -p.z - 0.2; // 0 at the waist, ~0.75 at the tail
    const rx = Math.abs(p.x);
    const heart = smooth(0.05, 0.025, rx - 0.012 * Math.sin(dz * 18)) * smooth(0.0, 0.08, dz) * smooth(0.36, 0.26, dz);
    const chev = (() => {
      // chevrons: V shapes repeating along the back, shrinking toward the tail
      const k = (dz - 0.3) / 0.11 - rx * 4.5;
      const f = k - Math.floor(k);
      return smooth(0.32, 0.12, Math.abs(f - 0.5)) * smooth(0.26, 0.34, dz) * smooth(0.22 - dz * 0.12, 0.05, rx) * smooth(0.82, 0.62, dz);
    })();
    const top = smooth(-0.1, 0.5, n.y);
    _c.copy(COL.abdomen).lerp(COL.chevron, Math.min(1, heart + chev * 0.9) * top);
    _c.lerp(COL.under, smooth(0.0, -0.6, n.y));
    _c.multiplyScalar(0.85 + 0.3 * fbm3(p.x * 18, p.y * 18, p.z * 18));
    out.color.lerp(_c, ab);
    out.fur = out.fur * (1 - ab) + ab * (0.026 + 0.012 * noise3(p.x * 25, p.y * 25, p.z * 25));
    out.flow.set(0, -0.2, -1);
    out.mask *= 1 - ab;
  }
  // Underside and coxae.
  out.color.lerp(COL.under, t('under') * 0.9);
  out.fur = out.fur * (1 - t('under')) + t('under') * 0.012;
  // Legs: brown, pale rings at each joint, hairy along their length.
  if (legs > 0.01) {
    const ring = Math.min(1, t('joint') * 1.6);
    _c.copy(COL.leg).lerp(COL.ring, ring * 0.8);
    _c.multiplyScalar(0.9 + 0.2 * noise3(p.x * 30, p.y * 30, p.z * 30));
    out.color.lerp(_c, Math.min(1, legs));
    out.fur = out.fur * (1 - Math.min(1, legs)) + Math.min(1, legs) * (0.03 * (1 - t('meta') * 0.5) * (1 - t('palpTip') * 0.3));
    // Fur lies along the leg, toward the foot: outward and down.
    out.flow.set(p.x - C[0], -0.6 * (p.y < 0.6 ? 1 : -0.4), p.z - C[2]);
  }
  // Chelicerae: black, velvety.
  out.color.lerp(COL.chel, t('chel'));
  out.fur = out.fur * (1 - t('chel')) + t('chel') * 0.018;
  if (t('chel') > 0.5) out.flow.set(0, -1, 0.3);
  out.color.lerp(COL.chel, t('spin') * 0.7);
  out.ao = 1;
};

export interface SpiderGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  hair: THREE.BufferGeometry;
  setae: THREE.BufferGeometry;
  fangs: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: SpiderGeometry | null = null;
export function provideSpiderGeometry(g: SpiderGeometry) {
  cached = g;
}

export function spiderGeometry(): SpiderGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const disp = (x: number, y: number, z: number, d: number) => (d > 0.03 ? d : d + (fbm3(x * 14, y * 14, z * 14, 2) - 0.5) * 0.006);
  const body = buildGroup(SPIDER_RIG, { parts: bodyParts(), cell: 0.013, displace: disp, paint: spiderPaint, skinR: 0.03, aoR: 0.07, aoStrength: 1.1 });
  const legs = SPIDER_LEGS.map((l) => buildGroup(SPIDER_RIG, { parts: legParts(l), cell: 0.011, paint: spiderPaint, skinR: 0.025, aoR: 0.03, aoStrength: 0.5 }));
  const all = mergeGeometries([body.geometry, ...legs.map((g) => g.geometry)])!;
  const far = mergeGeometries([body.far!, ...legs.map((g) => g.far!)])!;
  const onAbdomen = (p: THREE.Vector3) => p.z < -0.08 && Math.abs(p.x) < 0.34 && p.y > 0.3;
  // Fine hair everywhere it grows: a velvet pile on the abdomen, a bristly coat on the legs.
  const hairAbdomen = growTufts(all, {
    shape: 'hair', budget: 7000, minLen: 0.012, lift: 0.32, droop: 0.12, widthK: 0.1, minW: 0.002, maxW: 0.0035, overlap: 2.2,
    root: 0.7, tip: 1.35, vary: 0.16, grizzle: 0.22, grizzleTint: 0xb39570, seed: 5,
    where: (p) => onAbdomen(p),
  });
  const onLeg = (p: THREE.Vector3) => Math.hypot(p.x - C[0], p.z - C[2]) > 0.24 && !onAbdomen(p);
  // Legs: shaggy locks of hair down their length.
  const hairLegs = growTufts(all, {
    budget: 4500, minLen: 0.008, lift: 0.34, droop: 0.1, widthK: 0.28, minW: 0.004, maxW: 0.01, overlap: 2.6,
    root: 0.55, tip: 1.4, vary: 0.15, grizzle: 0.2, grizzleTint: 0xb39570, seed: 6,
    where: (p) => onLeg(p),
  });
  // Carapace edges, chelicerae, feelers: short fine hair.
  const hairHead = growTufts(all, {
    shape: 'hair', budget: 2500, minLen: 0.006, lift: 0.3, droop: 0.05, widthK: 0.12, minW: 0.002, maxW: 0.0035, overlap: 2,
    root: 0.65, tip: 1.3, vary: 0.15, seed: 7,
    where: (p) => !onLeg(p) && !onAbdomen(p),
  });
  const hair = mergeGeometries([hairAbdomen, hairLegs, hairHead])!;
  // Long stiff setae standing off the legs: the spiky outline.
  const setae = growTufts(all, {
    shape: 'hair', budget: 1600, minLen: 0.014, lift: 0.75, droop: 0, widthK: 0.07, minW: 0.0025, maxW: 0.004, overlap: 0.25,
    root: 0.5, tip: 0.9, vary: 0.1, seed: 9,
    where: (p) => Math.hypot(p.x - C[0], p.z - C[2]) > 0.25 && p.y > 0.06 && !onAbdomen(p),
  });
  // Scale setae length up: they're bristles, not fur.
  stretchTufts(setae, 2.4);
  const fangs: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const g = tuskGeometry([[s * 0.05, 0.37, 0.47], [s * 0.045, 0.31, 0.5], [s * 0.025, 0.27, 0.49], [s * 0.008, 0.265, 0.455]], 0.017, 0.002, 18, 10, [0x2a120a, 0x0c0504]);
    fangs.push(rigidPart(g, SPIDER_RIG.bone(`fang${side}`), 0x140a06));
  }
  const eyes: THREE.BufferGeometry[] = [];
  const eye = (x: number, y: number, z: number, r: number) => {
    const e = new THREE.SphereGeometry(r, 14, 10);
    e.translate(x, y, z);
    eyes.push(rigidPart(e, SPIDER_RIG.bone('body'), 0x0a0505));
  };
  for (const s of [1, -1]) {
    eye(s * 0.034, 0.557, 0.44, 0.021); // the big front pair
    eye(s * 0.08, 0.546, 0.424, 0.013);
    eye(s * 0.047, 0.607, 0.398, 0.015);
    eye(s * 0.1, 0.587, 0.364, 0.014);
  }
  cached = { body: all, far, hair, setae, fangs: merge(fangs), eyes: merge(eyes), ms: performance.now() - t0 };
  return cached;
}

/** Make tuft locks longer from their roots (setae). */
function stretchTufts(g: THREE.BufferGeometry, k: number) {
  const pos = g.getAttribute('position'), tip = g.getAttribute('tip');
  // Each tuft is vertsPer vertices; its root is the mean of the along=0 vertices.
  const V = (g.userData.vertsPer as number) ?? 27;
  const n = pos.count / V;
  const root = new THREE.Vector3(), v = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    root.set(0, 0, 0);
    let c = 0;
    for (let i = 0; i < V; i++) {
      if (tip.getX(t * V + i) === 0) {
        root.add(v.fromBufferAttribute(pos, t * V + i));
        c++;
      }
    }
    root.divideScalar(c);
    for (let i = 0; i < V; i++) {
      const j = t * V + i;
      v.fromBufferAttribute(pos, j).sub(root).multiplyScalar(1 + (k - 1) * tip.getX(j)).add(root);
      pos.setXYZ(j, v.x, v.y, v.z);
    }
  }
}

function merge(gs: THREE.BufferGeometry[]) {
  return mergeGeometries(gs.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  }))!;
}
