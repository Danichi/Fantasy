import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';

// The Grey Wolf: long-legged and deep-chested with a tucked waist, a thick
// ruff over the neck and chest, a long muzzle, tall pointed ears, amber eyes
// and a bushy tail carried low. Coat: a dark saddle over grey-tan sides,
// cream throat, belly and legs, a pale mask around the eyes, tawny ear backs.
// +Z is forward, paws on y = 0, metres.

const legBones = (side: 'L' | 'R', s: number): BoneSpec[] => [
  { name: `f${side}s`, parent: 'chest', at: [s * 0.085, 0.68, 0.3] },
  { name: `f${side}e`, parent: `f${side}s`, at: [s * 0.09, 0.46, 0.24] },
  { name: `f${side}w`, parent: `f${side}e`, at: [s * 0.075, 0.13, 0.27] },
  { name: `f${side}t`, parent: `f${side}w`, at: [s * 0.075, 0.0, 0.32] },
  { name: `h${side}h`, parent: 'pelvis', at: [s * 0.08, 0.72, -0.46] },
  { name: `h${side}k`, parent: `h${side}h`, at: [s * 0.095, 0.5, -0.34] },
  { name: `h${side}a`, parent: `h${side}k`, at: [s * 0.075, 0.2, -0.58] },
  { name: `h${side}t`, parent: `h${side}a`, at: [s * 0.075, 0.0, -0.51] },
];

export const WOLF_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 0.76, -0.42] },
  { name: 'spine', parent: 'pelvis', at: [0, 0.78, -0.08] },
  { name: 'chest', parent: 'spine', at: [0, 0.78, 0.22] },
  { name: 'neck', parent: 'chest', at: [0, 0.8, 0.4] },
  { name: 'head', parent: 'neck', at: [0, 0.86, 0.6] },
  { name: 'jaw', parent: 'head', at: [0, 0.8, 0.7] },
  { name: 'earL', parent: 'head', at: [0.052, 0.93, 0.6] },
  { name: 'earR', parent: 'head', at: [-0.052, 0.93, 0.6] },
  { name: 'tail1', parent: 'pelvis', at: [0, 0.78, -0.63] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.68, -0.76] },
  { name: 'tail3', parent: 'tail2', at: [0, 0.54, -0.84] },
  { name: 'tail4', parent: 'tail3', at: [0, 0.4, -0.87] },
  ...legBones('L', 1),
  ...legBones('R', -1),
]);
const B = (n: string): V3 => WOLF_RIG.bones[WOLF_RIG.bone(n)].at;
const mid = (a: V3, b: V3, t = 0.5): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Body outline: deep chest, tucked waist, level back. [z, top, bottom, half width] */
const TORSO: [number, number, number, number][] = [
  [-0.67, 0.79, 0.67, 0.035],
  [-0.61, 0.83, 0.61, 0.085],
  [-0.49, 0.86, 0.58, 0.125],
  [-0.31, 0.855, 0.6, 0.12],
  [-0.12, 0.867, 0.555, 0.132],
  [0.05, 0.887, 0.48, 0.148],
  [0.2, 0.905, 0.445, 0.154],
  [0.33, 0.905, 0.465, 0.142],
  [0.43, 0.88, 0.56, 0.105],
];
/** Muzzle outline from the stop to the nose. */
const MUZZLE: [number, number, number, number][] = [
  [0.66, 0.918, 0.768, 0.074],
  [0.73, 0.886, 0.77, 0.062],
  [0.8, 0.86, 0.774, 0.05],
  [0.86, 0.845, 0.779, 0.041],
  [0.9, 0.838, 0.784, 0.034],
];

function legParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const f = (n: string) => B(`f${side}${n}`), h = (n: string) => B(`h${side}${n}`);
  const P: Part[] = [];
  // Front: shoulder blade and upper arm in the chest, a long forearm, slim pastern, compact paw.
  P.push({ shape: { k: 'ell', c: [s * 0.095, 0.73, 0.28], r: [0.04, 0.15, 0.09], rot: [0.35, 0, -s * 0.08] }, bone: 'chest', blend: 0.08, tag: 'body' });
  P.push({ shape: { k: 'cone', a: f('s'), b: f('e'), ra: 0.07, rb: 0.05 }, bone: `f${side}s`, blend: 0.06, tag: 'body' });
  P.push({ shape: { k: 'cone', a: f('e'), b: f('w'), ra: 0.05, rb: 0.03 }, bone: `f${side}e`, blend: 0.03, tag: 'leg' });
  P.push({ shape: { k: 'ball', c: mid(f('e'), f('w'), 0.1), r: 0.052 }, bone: `f${side}e`, blend: 0.035, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: f('w'), b: [s * 0.075, 0.035, 0.305], ra: 0.029, rb: 0.027 }, bone: `f${side}w`, blend: 0.015, tag: 'leg' });
  P.push({ shape: { k: 'ell', c: [s * 0.075, 0.027, 0.328], r: [0.036, 0.027, 0.048] }, bone: `f${side}t`, blend: 0.016, tag: 'paw' });
  // Hind: muscular thigh, long gaskin to a sharp hock, slim cannon, paw.
  P.push({ shape: { k: 'ell', c: [s * 0.085, 0.64, -0.46], r: [0.06, 0.15, 0.13], rot: [-0.25, 0, 0] }, bone: `h${side}h`, blend: 0.08, tag: 'body' });
  P.push({ shape: { k: 'cone', a: h('h'), b: h('k'), ra: 0.075, rb: 0.05 }, bone: `h${side}h`, blend: 0.06, tag: 'body' });
  P.push({ shape: { k: 'cone', a: h('k'), b: h('a'), ra: 0.052, rb: 0.028 }, bone: `h${side}k`, blend: 0.03, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: [s * 0.08, 0.46, -0.44], b: [s * 0.078, 0.22, -0.6], ra: 0.024, rb: 0.016 }, bone: `h${side}k`, blend: 0.025, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: h('a'), b: [s * 0.075, 0.035, -0.525], ra: 0.027, rb: 0.026 }, bone: `h${side}a`, blend: 0.015, tag: 'leg' });
  P.push({ shape: { k: 'ell', c: [s * 0.075, 0.027, -0.502], r: [0.034, 0.026, 0.046] }, bone: `h${side}t`, blend: 0.016, tag: 'paw' });
  return P;
}

function earParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const at: V3 = [s * 0.052, 0.93, 0.6];
  const xf = { at, rot: [-0.15, -s * 0.35, -s * 0.22] as V3, scale: [1, 1, 0.42] as V3 };
  return [
    { shape: { k: 'cone', a: at, b: [at[0], at[1] + 0.11, at[2]], ra: 0.042, rb: 0.007 }, bone: 'ear' + side, tag: 'ear', blend: 0.03, soft: 0.5, xf },
    { shape: { k: 'ell', c: [at[0], at[1] + 0.045, at[2] + 0.03], r: [0.026, 0.05, 0.018] }, bone: 'ear' + side, tag: 'earIn', blend: 0.01, carve: true, xf },
  ];
}

export function wolfParts(): Part[] {
  return [
    { shape: { k: 'loft', slices: TORSO, egg: 0.3 }, bone: 'spine', ramp: [['pelvis', -0.45], ['spine', -0.08], ['chest', 0.25], ['neck', 0.42]], tag: 'body', blend: 0 },
    // Neck: strong and arched, rising to the head.
    { shape: { k: 'cone', a: [0, 0.79, 0.34], b: [0, 0.86, 0.58], ra: 0.115, rb: 0.08 }, bone: 'neck', tag: 'neck', blend: 0.08 },
    // Skull: broad behind the eyes, a stop down to the muzzle.
    { shape: { k: 'ell', c: [0, 0.89, 0.62], r: [0.082, 0.072, 0.095] }, bone: 'head', tag: 'head', blend: 0.05 },
    { shape: { k: 'ell', c: [0.05, 0.85, 0.67], r: [0.045, 0.05, 0.07], rot: [0, 0.3, 0] }, bone: 'head', tag: 'cheek', blend: 0.04 },
    { shape: { k: 'ell', c: [-0.05, 0.85, 0.67], r: [0.045, 0.05, 0.07], rot: [0, -0.3, 0] }, bone: 'head', tag: 'cheek', blend: 0.04 },
    { shape: { k: 'loft', slices: MUZZLE, egg: 0.2 }, bone: 'head', tag: 'muzzle', blend: 0.04 },
    // Brow over the eyes.
    { shape: { k: 'ell', c: [0.038, 0.925, 0.7], r: [0.03, 0.015, 0.035], rot: [0.3, 0.3, 0.2] }, bone: 'head', tag: 'head', blend: 0.02 },
    { shape: { k: 'ell', c: [-0.038, 0.925, 0.7], r: [0.03, 0.015, 0.035], rot: [0.3, -0.3, -0.2] }, bone: 'head', tag: 'head', blend: 0.02 },
    // Nose pad.
    { shape: { k: 'ell', c: [0, 0.836, 0.9], r: [0.025, 0.02, 0.019] }, bone: 'head', tag: 'nose', blend: 0.01 },
    { shape: { k: 'ell', c: [0.011, 0.834, 0.917], r: [0.006, 0.006, 0.006] }, bone: 'head', tag: 'nose', blend: 0.004, carve: true },
    { shape: { k: 'ell', c: [-0.011, 0.834, 0.917], r: [0.006, 0.006, 0.006] }, bone: 'head', tag: 'nose', blend: 0.004, carve: true },
    // Lower jaw.
    { shape: { k: 'ell', c: [0, 0.768, 0.79], r: [0.034, 0.022, 0.1], rot: [-0.05, 0, 0] }, bone: 'jaw', tag: 'lip', blend: 0.015 },
    // Eye sockets.
    { shape: { k: 'ell', c: [0.046, 0.902, 0.71], r: [0.012, 0.008, 0.015], rot: [0.15, 0.45, 0.25] }, bone: 'head', tag: 'lid', blend: 0.008, carve: true },
    { shape: { k: 'ell', c: [-0.046, 0.902, 0.71], r: [0.012, 0.008, 0.015], rot: [0.15, -0.45, -0.25] }, bone: 'head', tag: 'lid', blend: 0.008, carve: true },
    // Tail: thick at the root, brush down to the tip.
    { shape: { k: 'cone', a: B('tail1'), b: B('tail2'), ra: 0.04, rb: 0.03 }, bone: 'tail1', tag: 'tail', blend: 0.05 },
    { shape: { k: 'cone', a: B('tail2'), b: B('tail3'), ra: 0.03, rb: 0.024 }, bone: 'tail2', tag: 'tail', blend: 0.015 },
    { shape: { k: 'cone', a: B('tail3'), b: B('tail4'), ra: 0.024, rb: 0.012 }, bone: 'tail3', tag: 'tail', blend: 0.012 },
    ...earParts('L'),
    ...earParts('R'),
    ...legParts('L'),
    ...legParts('R'),
  ];
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.04) return d;
  return d + (fbm3(x * 10, y * 10, z * 10, 2) - 0.5) * 0.008;
}

const C = {
  saddle: new THREE.Color(0x2e2b29),
  side: new THREE.Color(0x857560),
  tan: new THREE.Color(0x9c7f5a),
  cream: new THREE.Color(0xd9d0bf),
  muzzleTop: new THREE.Color(0x6a5f52),
  nose: new THREE.Color(0x141110),
  lip: new THREE.Color(0x2a2522),
  earIn: new THREE.Color(0xc9b9a2),
  tailTip: new THREE.Color(0x1d1b19),
};
const _c = new THREE.Color();

export const wolfPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const legs = t('leg') + t('paw');
  // Underparts: throat, chest front, belly, inner legs.
  const under = smooth(0.1, -0.5, n.y) * smooth(0.12, 0.03, Math.abs(p.x) - 0.02);
  // Saddle: dark over the back and shoulders, fading down the sides.
  const back = smooth(-0.15, 0.55, n.y) * smooth(-0.64, -0.45, p.z) * smooth(0.5, 0.32, p.z);
  const brokenSaddle = back * smooth(0.25, 0.55, fbm3(p.x * 9, p.y * 9, p.z * 9) * 0.6 + back * 0.6);
  out.color.copy(C.side).lerp(C.saddle, brokenSaddle * 0.92);
  out.color.lerp(C.cream, Math.min(1, under * 0.9 + t('cheek') * smooth(0.86, 0.8, p.y) * 0.8));
  out.color.lerp(_c.copy(C.tan).lerp(C.cream, smooth(0.3, 0.05, p.y) * 0.3 + under * 0.4).multiplyScalar(0.92), Math.min(1, legs));
  // Face: pale mask round the eyes and the sides of the muzzle, darker bridge.
  const face = t('head') + t('muzzle') + t('cheek');
  if (face > 0.2) {
    const mask = smooth(0.06, 0.02, Math.abs(Math.abs(p.x) - 0.045)) * smooth(0.82, 0.88, p.y) * smooth(0.66, 0.74, p.z);
    _c.copy(C.side).lerp(C.muzzleTop, smooth(0.0, 0.03, -Math.abs(p.x) + 0.03) * smooth(0.68, 0.78, p.z));
    _c.lerp(C.cream, Math.min(1, mask * 0.9 + smooth(0.83, 0.79, p.y) * 0.9));
    out.color.lerp(_c, Math.min(1, face));
  }
  out.color.lerp(C.nose, t('nose'));
  out.color.lerp(C.lip, t('lip') * smooth(0.79, 0.77, p.y));
  out.color.lerp(C.cream, t('lip') * smooth(0.775, 0.76, p.y) * 0.7);
  out.color.lerp(C.tan, t('ear') * 0.6);
  out.color.lerp(C.earIn, t('earIn'));
  // Tail: grizzled grey, a dark stripe on top and a black tip.
  if (t('tail') > 0.2) {
    _c.copy(C.side).lerp(C.saddle, smooth(0.2, 0.8, n.y) * 0.6).lerp(C.tailTip, smooth(0.5, 0.42, p.y));
    out.color.lerp(_c, t('tail'));
  }
  out.color.multiplyScalar(0.92 + 0.16 * noise3(p.x * 30, p.y * 30, p.z * 30));

  // Fur: thick ruff on neck and chest, full coat, short face and legs, a brush tail.
  const ruff = t('neck') + smooth(0.25, 0.42, p.z) * smooth(0.55, 0.75, p.y) * t('body');
  let fur = 0.04 + noise3(p.x * 18, p.y * 18, p.z * 18) * 0.014;
  fur += Math.min(1, ruff) * 0.045;
  fur += under * 0.03;
  // Breeches: long fur down the back of the thighs.
  fur += t('body') * smooth(-0.4, -0.55, p.z) * smooth(0.75, 0.55, p.y) * 0.03;
  fur = fur * (1 - Math.min(1, legs)) + Math.min(1, legs) * (0.012 * smooth(0.1, 0.3, p.y) + 0.014);
  fur = fur * (1 - Math.min(1, face)) + Math.min(1, face) * (0.012 + 0.035 * t('cheek') * smooth(0.0, -0.6, n.z - 0.2));
  fur = fur * (1 - t('muzzle')) + t('muzzle') * 0.014 * smooth(0.9, 0.84, p.z);
  fur *= 1 - Math.min(1, t('nose') + t('lip') * 0.7 + t('earIn') + t('paw') * 0.6);
  fur = fur * (1 - t('ear')) + t('ear') * 0.012;
  fur = fur * (1 - t('tail')) + t('tail') * (0.1 + 0.025 * smooth(0.7, 0.45, p.y));
  out.fur = fur;

  // Fur lies back along the body and down the legs; the ruff flares; the face combs back.
  out.flow.set(0, -0.25, -1);
  if (ruff > 0.3) out.flow.set(n.x * 0.6, -0.6, -0.5);
  if (legs > 0.3) out.flow.set(0, -1, -0.1);
  if (face > 0.3) out.flow.set(0, 0.1, -1);
  if (t('tail') > 0.3) out.flow.set(0, -0.6, -1);
  out.mask = t('nose') * 0.9 + t('lip') * 0.4;
};

export interface WolfGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  coat: THREE.BufferGeometry;
  teeth: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  pupils: THREE.BufferGeometry;
  ms: number;
}

let cached: WolfGeometry | null = null;
export function provideWolfGeometry(g: WolfGeometry) {
  cached = g;
}

export function wolfGeometry(): WolfGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(WOLF_RIG, { parts: wolfParts(), cell: 0.0115, displace, paint: wolfPaint, skinR: 0.04, aoR: 0.08, aoStrength: 1.0 });
  const coat = growTufts(g.geometry, {
    budget: 12000, minLen: 0.012, lift: 0.16, droop: 0.18, widthK: 0.24, minW: 0.004, maxW: 0.013, overlap: 3.2,
    root: 0.6, tip: 1.22, vary: 0.13, grizzle: 0.35, grizzleTint: 0xcfc4b0, seed: 31,
    liftAt: (p, _n, f) => (f > 0.065 && p.z > 0.25 ? 0.3 : 0.16),
  });
  // The brush: long, wide locks all round the tail.
  const brush = growTufts(g.geometry, {
    budget: 1400, minLen: 0.08, lift: 0.4, droop: 0.15, widthK: 0.32, minW: 0.012, maxW: 0.03, overlap: 6,
    root: 0.65, tip: 1.15, vary: 0.12, grizzle: 0.3, grizzleTint: 0xcfc4b0, seed: 37,
    where: (p) => p.z < -0.6 && p.y < 0.8,
  });
  const head = WOLF_RIG.bone('head'), jaw = WOLF_RIG.bone('jaw');
  const teeth: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    // Canines, upper and lower, for when it snarls.
    teeth.push(rigidPart(tuskGeometry([[s * 0.021, 0.8, 0.852], [s * 0.021, 0.785, 0.855], [s * 0.019, 0.775, 0.852]], 0.0055, 0.0012, 6, 6, [0xd8ccb2, 0xf3eee2]), head, 0xffffff));
    teeth.push(rigidPart(tuskGeometry([[s * 0.018, 0.772, 0.835], [s * 0.018, 0.785, 0.838], [s * 0.016, 0.794, 0.835]], 0.005, 0.0012, 6, 6, [0xd8ccb2, 0xf3eee2]), jaw, 0xffffff));
  }
  const eyes: THREE.BufferGeometry[] = [], pupils: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.0105, 14, 10);
    e.scale(1, 0.62, 1);
    e.rotateZ(s * 0.25);
    e.translate(s * 0.046, 0.902, 0.717);
    eyes.push(strip(rigidPart(e, head, 0xffffff)));
    const pu = new THREE.SphereGeometry(0.0048, 10, 8);
    pu.scale(1, 1, 0.5);
    pu.translate(s * 0.05, 0.902, 0.725);
    pupils.push(strip(rigidPart(pu, head, 0x080605)));
  }
  cached = {
    body: g.geometry,
    far: g.far!,
    coat: mergeGeometries([coat, brush])!,
    teeth: mergeGeometries(teeth.map(strip))!,
    eyes: mergeGeometries(eyes)!,
    pupils: mergeGeometries(pupils)!,
    ms: performance.now() - t0,
  };
  return cached;
}

function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
