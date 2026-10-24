import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';

// A giant rat: the Rat Queen of the Sinkhole (at 2.4x) and her brood (at
// about 0.7x). Low and long, the back arched highest over the hips, a wedge
// of a head with round thin ears, red eyes, yellow chisel teeth, a long
// scaly tail. The queen is bloated with young, mangy in patches, and wears a
// crown of bone shards grown into her skull. +Z forward, metres at 1x.

const legBones = (side: 'L' | 'R', x: number): BoneSpec[] => [
  { name: `f${side}s`, parent: 'chest', at: [x * 0.085, 0.27, 0.2] },
  { name: `f${side}e`, parent: `f${side}s`, at: [x * 0.095, 0.15, 0.15] },
  { name: `f${side}w`, parent: `f${side}e`, at: [x * 0.085, 0.045, 0.2] },
  { name: `f${side}t`, parent: `f${side}w`, at: [x * 0.085, 0.0, 0.245] },
  { name: `h${side}h`, parent: 'pelvis', at: [x * 0.1, 0.3, -0.3] },
  { name: `h${side}k`, parent: `h${side}h`, at: [x * 0.125, 0.17, -0.2] },
  { name: `h${side}a`, parent: `h${side}k`, at: [x * 0.105, 0.05, -0.38] },
  { name: `h${side}t`, parent: `h${side}a`, at: [x * 0.105, 0.0, -0.24] },
];
const tailBones: BoneSpec[] = [
  { name: 'tail1', parent: 'pelvis', at: [0, 0.27, -0.5] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.2, -0.66] },
  { name: 'tail3', parent: 'tail2', at: [0, 0.12, -0.84] },
  { name: 'tail4', parent: 'tail3', at: [0, 0.07, -1.04] },
  { name: 'tail5', parent: 'tail4', at: [0, 0.05, -1.24] },
  { name: 'tail6', parent: 'tail5', at: [0, 0.05, -1.44] },
];

export const RAT_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 0.34, -0.28] },
  { name: 'spine', parent: 'pelvis', at: [0, 0.37, -0.06] },
  { name: 'belly', parent: 'spine', at: [0, 0.17, -0.1] },
  { name: 'chest', parent: 'spine', at: [0, 0.3, 0.16] },
  { name: 'neck', parent: 'chest', at: [0, 0.29, 0.3] },
  { name: 'head', parent: 'neck', at: [0, 0.28, 0.38] },
  { name: 'snout', parent: 'head', at: [0, 0.23, 0.53] },
  { name: 'jaw', parent: 'head', at: [0, 0.2, 0.46] },
  { name: 'earL', parent: 'head', at: [0.055, 0.36, 0.38] },
  { name: 'earR', parent: 'head', at: [-0.055, 0.36, 0.38] },
  ...tailBones,
  ...legBones('L', 1),
  ...legBones('R', -1),
]);
const B = (n: string) => RAT_RIG.bones[RAT_RIG.bone(n)].at;

/** The body outline [z, top, bottom, half width]: low at the shoulders, a hump over the hips, a pot belly. */
const TORSO: [number, number, number, number][] = [
  [-0.52, 0.3, 0.2, 0.05],
  [-0.46, 0.38, 0.14, 0.12],
  [-0.36, 0.43, 0.1, 0.17],
  [-0.22, 0.45, 0.08, 0.2],
  [-0.06, 0.43, 0.08, 0.205],
  [0.08, 0.39, 0.11, 0.18],
  [0.2, 0.35, 0.15, 0.14],
  [0.3, 0.33, 0.18, 0.1],
];
const HEAD: [number, number, number, number][] = [
  [0.3, 0.35, 0.2, 0.1],
  [0.38, 0.36, 0.19, 0.095],
  [0.46, 0.33, 0.19, 0.075],
  [0.53, 0.29, 0.19, 0.055],
  [0.59, 0.26, 0.19, 0.04],
  [0.63, 0.245, 0.195, 0.03],
];

function legParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const f = (n: string) => B(`f${side}${n}`), h = (n: string) => B(`h${side}${n}`);
  const P: Part[] = [
    // Front: a short arm with a hand-like paw.
    { shape: { k: 'cone', a: f('s'), b: f('e'), ra: 0.05, rb: 0.035 }, bone: `f${side}s`, blend: 0.04, tag: 'body' },
    { shape: { k: 'cone', a: f('e'), b: f('w'), ra: 0.03, rb: 0.018 }, bone: `f${side}e`, blend: 0.02, tag: 'leg' },
    { shape: { k: 'ell', c: [f('w')[0], 0.015, f('w')[2] + 0.03], r: [0.022, 0.012, 0.035] }, bone: `f${side}w`, blend: 0.012, tag: 'paw' },
    // Hind: a big haunch, a long bare foot.
    { shape: { k: 'ell', c: [s * 0.11, 0.26, -0.3], r: [0.07, 0.12, 0.13], rot: [-0.2, 0, 0] }, bone: `h${side}h`, blend: 0.06, tag: 'body' },
    { shape: { k: 'cone', a: h('h'), b: h('k'), ra: 0.06, rb: 0.04 }, bone: `h${side}h`, blend: 0.04, tag: 'body' },
    { shape: { k: 'cone', a: h('k'), b: h('a'), ra: 0.035, rb: 0.018 }, bone: `h${side}k`, blend: 0.02, tag: 'leg' },
    { shape: { k: 'cone', a: h('a'), b: [h('t')[0], 0.012, h('t')[2] + 0.03], ra: 0.016, rb: 0.014 }, bone: `h${side}a`, blend: 0.01, tag: 'paw' },
  ];
  // Toes with claws.
  for (const [base, bone, n] of [[f('t'), `f${side}t`, 4], [[h('t')[0], 0.0, h('t')[2] + 0.03] as V3, `h${side}t`, 5]] as [V3, string, number][]) {
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 0.011;
      P.push({ shape: { k: 'cone', a: [base[0] + dx, 0.012, base[2] - 0.01], b: [base[0] + dx * 1.4, 0.005, base[2] + 0.03], ra: 0.006, rb: 0.003 }, bone, blend: 0.004, tag: 'paw' });
      P.push({ shape: { k: 'cone', a: [base[0] + dx * 1.4, 0.005, base[2] + 0.03], b: [base[0] + dx * 1.5, 0.0, base[2] + 0.042], ra: 0.003, rb: 0.0008 }, bone, blend: 0.002, tag: 'claw' });
    }
  }
  return P;
}

export function ratParts(): Part[] {
  const P: Part[] = [
    { shape: { k: 'loft', slices: TORSO, egg: 0.2 }, bone: 'spine', ramp: [['pelvis', -0.3], ['spine', -0.05], ['chest', 0.15], ['neck', 0.3]], tag: 'body', blend: 0 },
    // A swollen belly, heavy with young.
    { shape: { k: 'ell', c: [0, 0.15, -0.12], r: [0.18, 0.1, 0.26] }, bone: 'belly', tag: 'belly', blend: 0.08 },
    { shape: { k: 'loft', slices: HEAD, egg: 0.25 }, bone: 'head', tag: 'face', blend: 0.06 },
    // Cheeks, the nose pad, the mouth.
    { shape: { k: 'ell', c: [0.05, 0.25, 0.44], r: [0.04, 0.045, 0.06] }, bone: 'head', tag: 'face', blend: 0.04 },
    { shape: { k: 'ell', c: [-0.05, 0.25, 0.44], r: [0.04, 0.045, 0.06] }, bone: 'head', tag: 'face', blend: 0.04 },
    { shape: { k: 'ell', c: [0, 0.235, 0.64], r: [0.03, 0.022, 0.018] }, bone: 'snout', tag: 'nose', blend: 0.01 },
    { shape: { k: 'ell', c: [0, 0.195, 0.53], r: [0.035, 0.02, 0.07] }, bone: 'jaw', tag: 'face', blend: 0.03 },
    { shape: { k: 'box', c: [0, 0.205, 0.585], h: [0.02, 0.004, 0.04], r: 0.003 }, bone: 'jaw', tag: 'mouth', blend: 0.004, carve: true },
    // Eye sockets.
    { shape: { k: 'ball', c: [0.048, 0.31, 0.47], r: 0.017 }, bone: 'head', tag: 'lid', blend: 0.01, carve: true },
    { shape: { k: 'ball', c: [-0.048, 0.31, 0.47], r: 0.017 }, bone: 'head', tag: 'lid', blend: 0.01, carve: true },
  ];
  // Round thin ears, cupped forward.
  for (const s of [1, -1]) {
    const at: V3 = [s * 0.055, 0.36, 0.38];
    const xf = { at, rot: [-0.3, -s * 0.5, -s * 0.5] as V3, scale: [1, 1, 0.3] as V3 };
    P.push({ shape: { k: 'ball', c: [at[0], at[1] + 0.04, at[2]], r: 0.045 }, bone: s > 0 ? 'earL' : 'earR', blend: 0.02, tag: 'ear', xf });
    P.push({ shape: { k: 'ball', c: [at[0], at[1] + 0.045, at[2] + 0.02], r: 0.035 }, bone: s > 0 ? 'earL' : 'earR', blend: 0.01, tag: 'earIn', carve: true, xf });
  }
  // The long scaly tail.
  const tb = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];
  const tr = [0.045, 0.034, 0.026, 0.019, 0.013, 0.008, 0.004];
  for (let i = 0; i < 5; i++) P.push({ shape: { k: 'cone', a: B(tb[i]), b: B(tb[i + 1]), ra: tr[i], rb: tr[i + 1] }, bone: tb[i], tag: 'tail', blend: i === 0 ? 0.04 : 0.01 });
  P.push(...legParts('L'), ...legParts('R'));
  return P;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.03) return d;
  // Rings round the tail; lumpy, mangy hide elsewhere.
  if (z < -0.5) return d + Math.sin(z * 260) * 0.0012;
  return d + (fbm3(x * 14, y * 14, z * 14, 2) - 0.5) * 0.008;
}

const C = {
  fur: new THREE.Color(0x4a4036),
  furDark: new THREE.Color(0x2a241e),
  belly: new THREE.Color(0x8a7a66),
  skin: new THREE.Color(0xb88a7a),
  mange: new THREE.Color(0x7a5a52),
  tail: new THREE.Color(0xa88070),
  nose: new THREE.Color(0xc88a82),
  claw: new THREE.Color(0x2a2018),
  ear: new THREE.Color(0xa87a6e),
};

const paint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const g = fbm3(p.x * 8, p.y * 8, p.z * 8);
  // Greasy grey-brown, darker along the back, pale underneath.
  out.color.copy(C.fur).lerp(C.furDark, smooth(0.2, 0.9, n.y) * 0.5 + smooth(0.5, 0.75, g) * 0.3);
  out.color.lerp(C.belly, smooth(-0.2, -0.8, n.y) * 0.7 + t('belly') * smooth(0, -0.6, n.y) * 0.3);
  // Mange: bald patches.
  const bald = smooth(0.7, 0.76, noise3(p.x * 16 + 3, p.y * 16, p.z * 16)) * (1 - t('tail'));
  out.color.lerp(C.mange, bald * 0.9);
  out.color.lerp(C.tail, t('tail'));
  out.color.lerp(C.skin, t('paw') + t('earIn') * 0.6);
  out.color.lerp(C.ear, t('ear') * 0.7);
  out.color.lerp(C.nose, t('nose'));
  out.color.lerp(C.claw, t('claw'));
  out.color.lerp(new THREE.Color(0x1a0a08), t('mouth'));
  out.color.multiplyScalar(0.9 + 0.18 * noise3(p.x * 40, p.y * 40, p.z * 40));
  // Fur: coarse and spiky, bare on the tail, paws, ears, nose and the bald patches.
  let fur = 0.03 + noise3(p.x * 25, p.y * 25, p.z * 25) * 0.015;
  fur *= 1 - Math.min(1, t('tail') + t('paw') + t('ear') + t('earIn') + t('nose') + t('claw') + t('mouth'));
  fur *= 1 - bald;
  fur = fur * (1 - t('face')) + t('face') * 0.012;
  out.fur = Math.max(0, fur);
  out.flow.set(0, -0.3, -1);
  if (n.y < -0.3) out.flow.set(0, -1, -0.3);
  out.mask = t('tail') * 0.6 + t('nose') + t('claw');
};

export interface RatGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  coat: THREE.BufferGeometry;
  teeth: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: RatGeometry | null = null;
export function provideRatGeometry(g: RatGeometry) {
  cached = g;
}

function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
/** Rigid on one bone, keeping its own vertex colours. */
function tinted(geo: THREE.BufferGeometry, bone: number) {
  return strip(rigidPart(geo, bone, 0xffffff));
}

export function ratGeometry(): RatGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(RAT_RIG, { parts: ratParts(), cell: 0.0065, displace, paint, skinR: 0.025, aoR: 0.05, aoStrength: 1.2 });
  const coat = growTufts(g.geometry, {
    budget: 7000, minLen: 0.012, lift: 0.18, droop: 0.25, widthK: 0.22, minW: 0.003, maxW: 0.008, overlap: 2.8,
    root: 0.5, tip: 1.1, vary: 0.2, grizzle: 0.2, grizzleTint: 0x7a6a58, seed: 31,
  });
  const head = RAT_RIG.bone('head'), jaw = RAT_RIG.bone('jaw'), snout = RAT_RIG.bone('snout');
  // Chisel teeth: two long yellow uppers, two lowers.
  const teeth: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    teeth.push(rigidPart(tuskGeometry([[s * 0.006, 0.215, 0.61], [s * 0.006, 0.19, 0.625], [s * 0.006, 0.17, 0.62]], 0.006, 0.004, 6, 6, [0xb88a2a, 0xe8c050]), snout, 0xffffff));
    teeth.push(rigidPart(tuskGeometry([[s * 0.006, 0.19, 0.57], [s * 0.006, 0.205, 0.595], [s * 0.006, 0.21, 0.6]], 0.005, 0.003, 6, 6, [0xa87a20, 0xd8b048]), jaw, 0xffffff));
  }
  // The crown of bone shards grown into her skull (the brood hide it at a distance).
  const crownParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + (i / 8) * 2.4;
    const tall = 0.05 + (i % 3 === 1 ? 0.04 : 0.015) + Math.sin(i * 1.7) * 0.01;
    crownParts.push(tuskGeometry([[Math.sin(a) * 0.07, 0.34, 0.37 + Math.cos(a) * 0.04], [Math.sin(a) * 0.085, 0.34 + tall * 0.6, 0.36 + Math.cos(a) * 0.035], [Math.sin(a) * 0.095, 0.34 + tall, 0.355]], 0.009, 0.002, 6, 6, [0x8a7a5a, 0xe8dcc0]));
  }
  const eyes: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.01, 12, 8);
    e.translate(s * 0.048, 0.31, 0.468);
    eyes.push(strip(rigidPart(e, head, 0xffffff)));
  }
  cached = {
    body: g.geometry,
    far: g.far!,
    coat,
    teeth: mergeGeometries(teeth.map(strip).map((t) => (t.getAttribute('color') ? t : t)))!,
    crown: tinted(mergeGeometries(crownParts)!, head),
    eyes: mergeGeometries(eyes)!,
    ms: performance.now() - t0,
  };
  return cached;
}
void noise3;
