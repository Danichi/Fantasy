import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';

// The White Stag: a great red-deer stag, larger than any in Cresha, white
// from muzzle to tail. A deep chest on long slender legs, a thick neck under
// a shaggy winter mane, a fine long head with large dark eyes, wide ears, a
// pale rump, and on its head a crown of antlers: long sweeping beams, brow,
// bez and trez tines, and a cup of points at each top. +Z forward, hooves on
// y = 0, metres. About 1.35 m at the withers.

const legBones = (side: 'L' | 'R', s: number): BoneSpec[] => [
  { name: `f${side}s`, parent: 'chest', at: [s * 0.12, 1.04, 0.32] },
  { name: `f${side}e`, parent: `f${side}s`, at: [s * 0.125, 0.72, 0.27] },
  { name: `f${side}w`, parent: `f${side}e`, at: [s * 0.11, 0.13, 0.33] },
  { name: `f${side}t`, parent: `f${side}w`, at: [s * 0.11, 0.0, 0.38] },
  { name: `h${side}h`, parent: 'pelvis', at: [s * 0.11, 1.08, -0.68] },
  { name: `h${side}k`, parent: `h${side}h`, at: [s * 0.13, 0.66, -0.52] },
  { name: `h${side}a`, parent: `h${side}k`, at: [s * 0.1, 0.46, -0.86] },
  { name: `h${side}t`, parent: `h${side}a`, at: [s * 0.1, 0.0, -0.8] },
];

export const STAG_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 1.16, -0.66] },
  { name: 'spine', parent: 'pelvis', at: [0, 1.18, -0.22] },
  { name: 'chest', parent: 'spine', at: [0, 1.22, 0.24] },
  { name: 'neck', parent: 'chest', at: [0, 1.3, 0.5] },
  { name: 'neck2', parent: 'neck', at: [0, 1.47, 0.69] },
  { name: 'head', parent: 'neck2', at: [0, 1.67, 0.85] },
  { name: 'jaw', parent: 'head', at: [0, 1.57, 0.98] },
  { name: 'earL', parent: 'head', at: [0.085, 1.765, 0.85] },
  { name: 'earR', parent: 'head', at: [-0.085, 1.765, 0.85] },
  { name: 'tail', parent: 'pelvis', at: [0, 1.15, -0.96] },
  ...legBones('L', 1),
  ...legBones('R', -1),
]);
const B = (n: string): V3 => STAG_RIG.bones[STAG_RIG.bone(n)].at;

/** Body: a deep chest, a level back rising slightly to the withers, a lean belly. [z, top, bottom, half width] */
const TORSO: [number, number, number, number][] = [
  [-0.99, 1.13, 1.02, 0.04],
  [-0.93, 1.19, 0.94, 0.125],
  [-0.79, 1.225, 0.87, 0.168],
  [-0.56, 1.215, 0.84, 0.177],
  [-0.3, 1.22, 0.81, 0.182],
  [-0.04, 1.25, 0.77, 0.192],
  [0.18, 1.3, 0.755, 0.19],
  [0.36, 1.32, 0.785, 0.172],
  [0.5, 1.27, 0.875, 0.128],
  [0.57, 1.22, 0.96, 0.08],
];
/** The head: a long wedge from the poll to the nose, sloping down. [z, top, bottom, half width] */
const HEAD: [number, number, number, number][] = [
  [0.82, 1.785, 1.64, 0.08],
  [0.9, 1.78, 1.615, 0.086],
  [0.97, 1.74, 1.595, 0.071],
  [1.03, 1.69, 1.575, 0.057],
  [1.09, 1.645, 1.56, 0.047],
  [1.13, 1.62, 1.555, 0.04],
];

function legParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const f = (n: string) => B(`f${side}${n}`), h = (n: string) => B(`h${side}${n}`);
  const P: Part[] = [];
  // Front: shoulder blade and upper arm in the chest, a fine straight foreleg, a knobbly knee, a hoof.
  P.push({ shape: { k: 'ell', c: [s * 0.13, 1.08, 0.3], r: [0.055, 0.2, 0.11], rot: [0.3, 0, -s * 0.06] }, bone: 'chest', blend: 0.1, tag: 'body' });
  P.push({ shape: { k: 'cone', a: f('s'), b: f('e'), ra: 0.085, rb: 0.06 }, bone: `f${side}s`, blend: 0.08, tag: 'body' });
  P.push({ shape: { k: 'cone', a: f('e'), b: [s * 0.115, 0.42, 0.3], ra: 0.05, rb: 0.03 }, bone: `f${side}e`, blend: 0.035, tag: 'leg' });
  P.push({ shape: { k: 'ball', c: [s * 0.115, 0.41, 0.305], r: 0.034 }, bone: `f${side}e`, blend: 0.02, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: [s * 0.115, 0.41, 0.305], b: f('w'), ra: 0.026, rb: 0.022 }, bone: `f${side}e`, blend: 0.015, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: f('w'), b: [s * 0.11, 0.045, 0.36], ra: 0.024, rb: 0.03 }, bone: `f${side}w`, blend: 0.012, tag: 'leg' });
  P.push({ shape: { k: 'ell', c: [s * 0.11, 0.035, 0.375], r: [0.032, 0.035, 0.04], rot: [0.3, 0, 0] }, bone: `f${side}t`, blend: 0.01, tag: 'hoof' });
  // Hind: a big haunch, a long gaskin to a high hock, a fine cannon, a hoof.
  P.push({ shape: { k: 'ell', c: [s * 0.12, 0.97, -0.7], r: [0.085, 0.22, 0.17], rot: [-0.2, 0, 0] }, bone: `h${side}h`, blend: 0.1, tag: 'body' });
  P.push({ shape: { k: 'cone', a: h('h'), b: h('k'), ra: 0.1, rb: 0.065 }, bone: `h${side}h`, blend: 0.08, tag: 'body' });
  P.push({ shape: { k: 'cone', a: h('k'), b: h('a'), ra: 0.06, rb: 0.03 }, bone: `h${side}k`, blend: 0.035, tag: 'leg' });
  P.push({ shape: { k: 'ball', c: h('a'), r: 0.032 }, bone: `h${side}a`, blend: 0.02, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: h('a'), b: [s * 0.1, 0.045, -0.81], ra: 0.025, rb: 0.022 }, bone: `h${side}a`, blend: 0.015, tag: 'leg' });
  P.push({ shape: { k: 'ell', c: [s * 0.1, 0.035, -0.795], r: [0.03, 0.035, 0.038], rot: [0.3, 0, 0] }, bone: `h${side}t`, blend: 0.01, tag: 'hoof' });
  return P;
}

function earParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const at: V3 = [s * 0.085, 1.765, 0.85];
  // Wide leaf ears held out to the side.
  const xf = { at, rot: [0.1, 0, -s * 1.05] as V3, scale: [1, 1, 0.35] as V3 };
  return [
    { shape: { k: 'ell', c: [at[0], at[1] + 0.085, at[2]], r: [0.048, 0.1, 0.05] }, bone: 'ear' + side, tag: 'ear', blend: 0.025, soft: 0.5, xf },
    { shape: { k: 'ell', c: [at[0], at[1] + 0.09, at[2] + 0.03], r: [0.034, 0.08, 0.03] }, bone: 'ear' + side, tag: 'earIn', blend: 0.01, carve: true, xf },
  ];
}

export function stagParts(): Part[] {
  return [
    { shape: { k: 'loft', slices: TORSO, egg: 0.25 }, bone: 'spine', ramp: [['pelvis', -0.66], ['spine', -0.22], ['chest', 0.25]], tag: 'body', blend: 0 },
    // A thick neck carried forward and up, a dewlap of mane beneath.
    { shape: { k: 'cone', a: [0, 1.2, 0.42], b: [0, 1.46, 0.68], ra: 0.155, rb: 0.11 }, bone: 'neck', tag: 'neck', blend: 0.1 },
    { shape: { k: 'cone', a: [0, 1.46, 0.68], b: [0, 1.66, 0.83], ra: 0.11, rb: 0.078 }, bone: 'neck2', tag: 'neck', blend: 0.06 },
    { shape: { k: 'loft', slices: HEAD, egg: 0.15 }, bone: 'head', tag: 'head', blend: 0.05 },
    // Cheeks, the preorbital hollows below the eyes.
    { shape: { k: 'ell', c: [0.05, 1.655, 0.93], r: [0.036, 0.05, 0.075], rot: [0, 0.25, 0] }, bone: 'head', tag: 'head', blend: 0.03 },
    { shape: { k: 'ell', c: [-0.05, 1.655, 0.93], r: [0.036, 0.05, 0.075], rot: [0, -0.25, 0] }, bone: 'head', tag: 'head', blend: 0.03 },
    { shape: { k: 'ell', c: [0.064, 1.69, 0.985], r: [0.012, 0.016, 0.02] }, bone: 'head', tag: 'gland', blend: 0.008, carve: true },
    { shape: { k: 'ell', c: [-0.064, 1.69, 0.985], r: [0.012, 0.016, 0.02] }, bone: 'head', tag: 'gland', blend: 0.008, carve: true },
    // Eye sockets.
    { shape: { k: 'ell', c: [0.07, 1.725, 0.94], r: [0.017, 0.014, 0.021], rot: [0, 0.4, 0] }, bone: 'head', tag: 'lid', blend: 0.01, carve: true },
    { shape: { k: 'ell', c: [-0.07, 1.725, 0.94], r: [0.017, 0.014, 0.021], rot: [0, -0.4, 0] }, bone: 'head', tag: 'lid', blend: 0.01, carve: true },
    // The nose: a dark moist pad with nostrils.
    { shape: { k: 'ell', c: [0, 1.587, 1.135], r: [0.036, 0.03, 0.022] }, bone: 'head', tag: 'nose', blend: 0.012 },
    { shape: { k: 'ell', c: [0.017, 1.585, 1.153], r: [0.008, 0.012, 0.008], rot: [0, 0, 0.4] }, bone: 'head', tag: 'nose', blend: 0.004, carve: true },
    { shape: { k: 'ell', c: [-0.017, 1.585, 1.153], r: [0.008, 0.012, 0.008], rot: [0, 0, -0.4] }, bone: 'head', tag: 'nose', blend: 0.004, carve: true },
    // Lower jaw and chin, tucked under.
    { shape: { k: 'ell', c: [0, 1.56, 1.03], r: [0.03, 0.016, 0.065], rot: [0.2, 0, 0] }, bone: 'jaw', tag: 'lip', blend: 0.025 },
    // Pedicles: the bony stumps the antlers grow from.
    { shape: { k: 'cone', a: [0.045, 1.77, 0.85], b: [0.06, 1.815, 0.835], ra: 0.028, rb: 0.025 }, bone: 'head', tag: 'head', blend: 0.015 },
    { shape: { k: 'cone', a: [-0.045, 1.77, 0.85], b: [-0.06, 1.815, 0.835], ra: 0.028, rb: 0.025 }, bone: 'head', tag: 'head', blend: 0.015 },
    // A short tail over a pale rump.
    { shape: { k: 'cone', a: B('tail'), b: [0, 1.02, -1.05], ra: 0.045, rb: 0.03 }, bone: 'tail', tag: 'tail', blend: 0.04 },
    ...earParts('L'),
    ...earParts('R'),
    ...legParts('L'),
    ...legParts('R'),
  ];
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.04) return d;
  return d + (fbm3(x * 11, y * 11, z * 11, 2) - 0.5) * 0.006;
}

const C = {
  white: new THREE.Color(0xf2efe8),
  cream: new THREE.Color(0xe6dfd0),
  silver: new THREE.Color(0xd4d6da),
  muzzle: new THREE.Color(0xc9c4bc),
  nose: new THREE.Color(0x1a1717),
  lip: new THREE.Color(0x3a3532),
  earIn: new THREE.Color(0xc8b4ae),
  hoof: new THREE.Color(0x3b3633),
  gland: new THREE.Color(0x6a625c),
  legs: new THREE.Color(0xe0dcd4),
};

const stagPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  // White all over: a faint silver along the back, creamier underneath.
  const back = smooth(0.0, 0.7, n.y) * smooth(-0.95, -0.7, p.z) * smooth(0.55, 0.3, p.z);
  out.color.copy(C.white).lerp(C.silver, back * 0.6).lerp(C.cream, smooth(0.1, -0.6, n.y) * 0.6);
  // A grey bridge down the face, darkening to the muzzle.
  out.color.lerp(C.silver, t('head') * smooth(0.03, 0.0, Math.abs(p.x)) * smooth(0.95, 1.05, p.z) * 0.7);
  out.color.lerp(C.legs, t('leg'));
  out.color.lerp(C.muzzle, t('head') * smooth(1.06, 1.17, p.z) * 0.8);
  out.color.lerp(C.nose, t('nose'));
  out.color.lerp(C.lip, t('lip') * smooth(1.56, 1.54, p.y) * smooth(1.0, 1.08, p.z) * 0.6);
  out.color.lerp(C.gland, t('gland') * 0.7);
  out.color.lerp(C.earIn, t('earIn'));
  out.color.lerp(C.hoof, t('hoof'));
  // Dark rims round the eyes.
  const eyeD = Math.hypot(Math.abs(p.x) - 0.072, p.y - 1.725, p.z - 0.945);
  out.color.lerp(C.lip, smooth(0.032, 0.02, eyeD) * 0.85);
  out.color.multiplyScalar(0.94 + 0.08 * noise3(p.x * 25, p.y * 25, p.z * 25));

  // Short sleek coat; a shaggy winter mane on the neck and throat; short face and legs.
  const legs = t('leg') + t('hoof');
  const mane = t('neck') * (0.6 + smooth(0.0, -0.8, n.z) * 0.4 + smooth(0.3, -0.6, n.y) * 0.5);
  let fur = 0.022 + noise3(p.x * 14, p.y * 14, p.z * 14) * 0.008;
  fur += Math.min(1, mane) * 0.075;
  fur += t('tail') * 0.03 + smooth(-0.8, -0.95, p.z) * t('body') * 0.012;
  fur = fur * (1 - Math.min(1, legs)) + Math.min(1, legs) * 0.008;
  fur = fur * (1 - t('head')) + t('head') * 0.012 * smooth(1.1, 0.96, p.z);
  fur *= 1 - Math.min(1, t('nose') + t('lip') + t('earIn') + t('hoof') + t('gland') + smooth(0.03, 0.02, eyeD));
  fur = fur * (1 - t('ear')) + t('ear') * 0.012;
  out.fur = fur;

  out.flow.set(0, -0.2, -1);
  if (mane > 0.3) out.flow.set(n.x * 0.4, -1, -0.2);
  if (legs > 0.3) out.flow.set(0, -1, 0);
  if (t('head') > 0.3) out.flow.set(0, 0.2, -1);
  if (t('tail') > 0.3) out.flow.set(0, -1, -0.3);
  out.mask = t('nose') * 0.9 + t('lip') * 0.3;
};

/** One antler: the main beam sweeping up and back, brow, bez and trez tines, a crown of points. */
function antler(s: number): THREE.BufferGeometry[] {
  const ivory: [number, number] = [0x8a7c66, 0xf4f0e6];
  const P = (x: number, y: number, z: number): V3 => [s * x, y, z];
  const out: THREE.BufferGeometry[] = [];
  // The beam sweeps out and back, then the top curves forward into the crown.
  const beam: V3[] = [P(0.06, 1.815, 0.835), P(0.17, 1.9, 0.78), P(0.31, 2.0, 0.68), P(0.44, 2.13, 0.58), P(0.51, 2.28, 0.54), P(0.52, 2.42, 0.58)];
  out.push(tuskGeometry(beam, 0.036, 0.018, 24, 9, ivory));
  // The coronet: a knobbly burr ring at the base.
  const burr = new THREE.TorusGeometry(0.036, 0.011, 6, 12);
  burr.rotateX(Math.PI / 2);
  burr.rotateZ(-s * 0.5);
  burr.translate(s * 0.068, 1.825, 0.83);
  burr.deleteAttribute('uv');
  const bc = new Float32Array(burr.getAttribute('position').count * 3).fill(0.48);
  burr.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  out.push(burr);
  const tine = (pts: V3[], r0: number) => out.push(tuskGeometry(pts, r0, 0.006, 10, 7, ivory));
  // Brow tine: low, curving forward over the face.
  tine([P(0.09, 1.845, 0.82), P(0.14, 1.87, 0.92), P(0.16, 1.93, 1.03)], 0.021);
  // Bez tine just above it.
  tine([P(0.15, 1.885, 0.79), P(0.22, 1.92, 0.88), P(0.26, 1.98, 0.96)], 0.018);
  // Trez, midway up the beam.
  tine([P(0.36, 2.04, 0.65), P(0.43, 2.09, 0.74), P(0.49, 2.16, 0.82)], 0.017);
  // A fourth, rearward.
  tine([P(0.47, 2.18, 0.56), P(0.55, 2.22, 0.48), P(0.61, 2.28, 0.42)], 0.015);
  // The crown: a cup of points at the top.
  const top: V3 = P(0.52, 2.38, 0.57);
  for (const [dx, dz, up] of [[0.09, 0.1, 0.15], [-0.05, 0.12, 0.17], [0.11, -0.07, 0.14], [-0.04, -0.09, 0.16], [0.02, 0.02, 0.19]] as [number, number, number][]) {
    tine([top, [top[0] + s * dx * 0.5, top[1] + up * 0.5, top[2] + dz * 0.5], [top[0] + s * dx, top[1] + up, top[2] + dz]], 0.014);
  }
  return out;
}

export interface StagGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  coat: THREE.BufferGeometry;
  antlers: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: StagGeometry | null = null;
export function provideStagGeometry(g: StagGeometry) {
  cached = g;
}

export function stagGeometry(): StagGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(STAG_RIG, { parts: stagParts(), cell: 0.012, displace, paint: stagPaint, skinR: 0.05, aoR: 0.1, aoStrength: 1.25 });
  const coat = growTufts(g.geometry, {
    budget: 11000, minLen: 0.01, lift: 0.14, droop: 0.2, widthK: 0.3, minW: 0.004, maxW: 0.016, overlap: 2.8,
    root: 0.82, tip: 1.06, vary: 0.06, grizzle: 0.15, grizzleTint: 0xffffff, seed: 71,
    liftAt: (_p, _n, f) => (f > 0.05 ? 0.3 : 0.12),
  });
  const head = STAG_RIG.bone('head');
  const antlers = [...antler(1), ...antler(-1)].map((a) => strip(rigidPart(a, head, 0xffffff)));
  const eyes: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.016, 16, 12);
    e.scale(0.8, 0.75, 1);
    e.rotateY(s * 0.45);
    e.translate(s * 0.067, 1.725, 0.943);
    eyes.push(strip(rigidPart(e, head, 0xffffff)));
  }
  cached = {
    body: g.geometry,
    far: g.far!,
    coat,
    antlers: mergeGeometries(antlers)!,
    eyes: mergeGeometries(eyes)!,
    ms: performance.now() - t0,
  };
  return cached;
}

function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
