import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';

// The Delver of the Abandoned Mine: a blind burrowing beast the size of a cart.
// Low and broad, a hump over the shoulders where the digging muscles are,
// two huge spade arms turned out to the sides with three hooked claws each,
// short hind legs, a stub of a tail. No eyes. A fleshy star of feelers round
// the tip of its snout, a wide underslung mouth of peg teeth. Its hide is
// bare, pale and wrinkled, and its back is armoured with plates of stone
// that have grown into the skin, with ore-crystals among them that glow.
// +Z forward, metres at 1x (about 4.4 m long, 1.8 m at the hump).

const legBones = (side: 'L' | 'R', x: number): BoneSpec[] => [
  { name: `f${side}s`, parent: 'chest', at: [x * 0.6, 1.15, 0.85] },
  { name: `f${side}e`, parent: `f${side}s`, at: [x * 1.0, 0.8, 0.8] },
  { name: `f${side}w`, parent: `f${side}e`, at: [x * 1.1, 0.32, 1.05] },
  { name: `f${side}t`, parent: `f${side}w`, at: [x * 1.12, 0.04, 1.3] },
  { name: `h${side}h`, parent: 'pelvis', at: [x * 0.48, 0.95, -1.15] },
  { name: `h${side}k`, parent: `h${side}h`, at: [x * 0.62, 0.55, -0.95] },
  { name: `h${side}a`, parent: `h${side}k`, at: [x * 0.6, 0.18, -1.25] },
  { name: `h${side}t`, parent: `h${side}a`, at: [x * 0.6, 0.0, -1.0] },
];

export const DELVER_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 1.1, -1.0] },
  { name: 'spine', parent: 'pelvis', at: [0, 1.25, -0.25] },
  { name: 'chest', parent: 'spine', at: [0, 1.25, 0.5] },
  { name: 'neck', parent: 'chest', at: [0, 1.05, 1.15] },
  { name: 'head', parent: 'neck', at: [0, 0.95, 1.45] },
  { name: 'jaw', parent: 'head', at: [0, 0.78, 1.55] },
  { name: 'nose', parent: 'head', at: [0, 0.88, 2.02] },
  { name: 'tail1', parent: 'pelvis', at: [0, 0.95, -1.65] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.7, -2.1] },
  ...legBones('L', 1),
  ...legBones('R', -1),
]);
const B = (n: string) => DELVER_RIG.bones[DELVER_RIG.bone(n)].at;

/** [z, top, bottom, half width]: a hump over the shoulders, sloping to the hips. */
const TORSO: [number, number, number, number][] = [
  [-1.75, 1.05, 0.75, 0.2],
  [-1.45, 1.35, 0.55, 0.52],
  [-0.95, 1.55, 0.45, 0.72],
  [-0.35, 1.7, 0.42, 0.82],
  [0.25, 1.82, 0.45, 0.9],
  [0.75, 1.75, 0.55, 0.88],
  [1.1, 1.45, 0.62, 0.62],
];
const HEAD: [number, number, number, number][] = [
  [1.05, 1.32, 0.62, 0.52],
  [1.35, 1.2, 0.62, 0.42],
  [1.65, 1.06, 0.68, 0.3],
  [1.88, 0.98, 0.74, 0.19],
  [2.0, 0.95, 0.79, 0.13],
];
const lerpT = (z: number) => {
  for (let i = 0; i < TORSO.length - 1; i++) {
    const a = TORSO[i], b = TORSO[i + 1];
    if (z <= b[0]) {
      const k = (z - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  const l = TORSO[TORSO.length - 1];
  return [l[1], l[2], l[3]];
};

function legParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const f = (n: string) => B(`f${side}${n}`), h = (n: string) => B(`h${side}${n}`);
  const P: Part[] = [
    // The digging arm: a mountain of shoulder, a thick forearm, a broad spade hand.
    { shape: { k: 'ell', c: [s * 0.62, 1.2, 0.8], r: [0.38, 0.42, 0.42] }, bone: `f${side}s`, blend: 0.18, tag: 'body' },
    { shape: { k: 'cone', a: f('s'), b: f('e'), ra: 0.3, rb: 0.24 }, bone: `f${side}s`, blend: 0.12, tag: 'body' },
    { shape: { k: 'cone', a: f('e'), b: f('w'), ra: 0.22, rb: 0.15 }, bone: `f${side}e`, blend: 0.08, tag: 'body' },
    { shape: { k: 'ell', c: [f('w')[0] + s * 0.02, 0.16, f('w')[2] + 0.14], r: [0.2, 0.1, 0.24], rot: [0.3, 0, s * 0.25] }, bone: `f${side}w`, blend: 0.06, tag: 'palm' },
    // The haunch and a short, thick hind leg.
    { shape: { k: 'ell', c: [s * 0.5, 0.95, -1.05], r: [0.28, 0.38, 0.4] }, bone: `h${side}h`, blend: 0.15, tag: 'body' },
    { shape: { k: 'cone', a: h('h'), b: h('k'), ra: 0.22, rb: 0.16 }, bone: `h${side}h`, blend: 0.08, tag: 'body' },
    { shape: { k: 'cone', a: h('k'), b: h('a'), ra: 0.15, rb: 0.1 }, bone: `h${side}k`, blend: 0.05, tag: 'body' },
    { shape: { k: 'ell', c: [h('a')[0], 0.07, -1.12], r: [0.13, 0.07, 0.2] }, bone: `h${side}a`, blend: 0.04, tag: 'palm' },
  ];
  return P;
}

export function delverParts(): Part[] {
  const P: Part[] = [
    { shape: { k: 'loft', slices: TORSO, egg: 0.25 }, bone: 'spine', ramp: [['pelvis', -1.0], ['spine', -0.25], ['chest', 0.5], ['neck', 1.05]], tag: 'body', blend: 0 },
    { shape: { k: 'loft', slices: HEAD, egg: 0.2 }, bone: 'head', tag: 'face', blend: 0.18 },
    // Folds of skin at the neck; the wide mouth under the snout.
    { shape: { k: 'ell', c: [0, 0.82, 1.15], r: [0.55, 0.22, 0.25] }, bone: 'neck', tag: 'fold', blend: 0.12 },
    { shape: { k: 'ell', c: [0, 0.74, 1.6], r: [0.24, 0.08, 0.3] }, bone: 'jaw', tag: 'face', blend: 0.08 },
    { shape: { k: 'box', c: [0, 0.79, 1.68], h: [0.18, 0.012, 0.24], r: 0.01 }, bone: 'jaw', tag: 'mouth', blend: 0.01, carve: true },
    // The nose disc the feelers grow from.
    { shape: { k: 'ell', c: [0, 0.88, 2.03], r: [0.13, 0.12, 0.06] }, bone: 'nose', tag: 'nose', blend: 0.04 },
    // The stub of a tail.
    { shape: { k: 'cone', a: B('tail1'), b: B('tail2'), ra: 0.16, rb: 0.05 }, bone: 'tail1', tag: 'body', blend: 0.1 },
  ];
  // The star of feelers: two rings of fleshy fingers round the nostrils.
  for (let i = 0; i < 18; i++) {
    const inner = i >= 12;
    const n = inner ? 6 : 12, j = inner ? i - 12 : i;
    const a = (j / n) * Math.PI * 2 + (inner ? 0.25 : 0);
    const r0 = inner ? 0.05 : 0.1, len = inner ? 0.12 : 0.2;
    const c: V3 = [Math.cos(a) * r0, 0.88 + Math.sin(a) * r0, 2.05];
    const e: V3 = [Math.cos(a) * (r0 + len * 0.8), 0.88 + Math.sin(a) * (r0 + len * 0.8), 2.05 + len * 0.6];
    P.push({ shape: { k: 'cone', a: c, b: e, ra: inner ? 0.022 : 0.03, rb: 0.012 }, bone: 'nose', tag: 'feeler', blend: 0.015 });
  }
  // Nostril pits.
  for (const x of [1, -1]) P.push({ shape: { k: 'ball', c: [x * 0.035, 0.88, 2.08], r: 0.025 }, bone: 'nose', tag: 'mouth', blend: 0.01, carve: true });
  // Wrinkles: ridges across the neck and the shoulders' hide.
  for (let i = 0; i < 5; i++) P.push({ shape: { k: 'ell', c: [0, 1.0 - i * 0.03, 1.0 + i * 0.09], r: [0.5 - i * 0.03, 0.035, 0.03] }, bone: 'neck', tag: 'fold', blend: 0.03 });
  // Stone plates grown into the back, overlapping like slates, from the neck to the rump.
  let k = 0;
  for (let z = -1.35; z <= 0.95; z += 0.3) {
    const [top, bot, hw] = lerpT(z);
    const mid = (top + bot) / 2 + 0.05, hh = (top - bot) / 2;
    for (const a of [-1.05, -0.55, 0, 0.55, 1.05]) {
      if (Math.abs(a) > 1 && (z < -1.2 || z > 0.8)) continue;
      const jit = Math.sin(k * 7.3) * 0.04;
      const c: V3 = [Math.sin(a) * hw * 0.95, mid + Math.cos(a) * hh * 0.98 + 0.02, z + jit];
      const w = 0.2 + Math.abs(Math.sin(k * 3.1)) * 0.06;
      P.push({ shape: { k: 'box', c, h: [w, 0.05, 0.19], r: 0.03, rot: [-0.22, 0, -a] }, bone: z < -0.6 ? 'pelvis' : z < 0.2 ? 'spine' : 'chest', tag: 'plate', blend: 0.025 });
      k++;
    }
  }
  P.push(...legParts('L'), ...legParts('R'));
  return P;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.08) return d;
  // Deep wrinkles in the hide, cracks and pits in the stone.
  const w = Math.abs(Math.sin(z * 18 + fbm3(x * 3, y * 3, z * 3) * 6)) * 0.008;
  return d + w + (fbm3(x * 9, y * 9, z * 9, 2) - 0.5) * 0.02;
}

const C = {
  hide: new THREE.Color(0x9a8478),
  hideDark: new THREE.Color(0x5a4a40),
  belly: new THREE.Color(0xb09888),
  dirt: new THREE.Color(0x5a4a3a),
  plate: new THREE.Color(0x6a6660),
  plateDark: new THREE.Color(0x3a3a38),
  lichen: new THREE.Color(0x7a7a4a),
  feeler: new THREE.Color(0xd87a72),
  palm: new THREE.Color(0x4a3a30),
  mouth: new THREE.Color(0x2a0a08),
};

const paint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const g = fbm3(p.x * 3, p.y * 3, p.z * 3);
  // Pale, bare, wrinkled hide, grimed with earth low down and on the arms.
  out.color.copy(C.hide).lerp(C.hideDark, smooth(0.45, 0.8, g) * 0.5 + t('fold') * 0.3);
  out.color.lerp(C.belly, smooth(-0.2, -0.8, n.y) * 0.5);
  out.color.lerp(C.dirt, smooth(0.6, 0.15, p.y) * 0.6 + smooth(0.55, 0.75, noise3(p.x * 4, p.y * 4, p.z * 4)) * 0.4);
  if (t('plate') > 0.15) {
    const pl = C.plate.clone().lerp(C.plateDark, smooth(0.4, 0.8, fbm3(p.x * 12, p.y * 12, p.z * 12)) * 0.7);
    pl.lerp(C.lichen, smooth(0.6, 0.8, noise3(p.x * 6 + 4, p.y * 6, p.z * 6)) * smooth(0.3, 0.9, n.y) * 0.6);
    out.color.lerp(pl, Math.min(1, t('plate') * 1.3));
  }
  out.color.lerp(C.feeler, t('feeler') + t('nose') * 0.8);
  out.color.lerp(C.palm, t('palm') * 0.7);
  out.color.lerp(C.mouth, t('mouth'));
  out.color.multiplyScalar(0.88 + 0.2 * noise3(p.x * 20, p.y * 20, p.z * 20));
  // Coarse bristles here and there on the hide; none on stone, feelers or palms.
  const bare = Math.min(1, t('plate') * 1.5 + t('feeler') + t('nose') + t('palm') + t('mouth'));
  out.fur = (1 - bare) * 0.05 * smooth(0.45, 0.65, noise3(p.x * 5 + 2, p.y * 5, p.z * 5));
  out.flow.set(0, -0.4, -1);
  out.mask = t('plate') * 0.2 + t('feeler') * 0.8 + t('nose');
};

export interface DelverGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  bristle: THREE.BufferGeometry;
  claws: THREE.BufferGeometry;
  teeth: THREE.BufferGeometry;
  crystals: THREE.BufferGeometry;
  ms: number;
}

let cached: DelverGeometry | null = null;
export function provideDelverGeometry(g: DelverGeometry) {
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

export function delverGeometry(): DelverGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(DELVER_RIG, { parts: delverParts(), cell: 0.02, displace, paint, skinR: 0.06, aoR: 0.15, aoStrength: 1.3 });
  const bristle = growTufts(g.geometry, {
    budget: 2500, minLen: 0.03, lift: 0.4, droop: 0.2, widthK: 0.05, minW: 0.006, maxW: 0.012, overlap: 2,
    root: 0.6, tip: 0.9, vary: 0.4, seed: 53,
  });
  // Three great hooked claws on each spade hand, small ones on the feet.
  const claws: THREE.BufferGeometry[] = [];
  for (const side of ['L', 'R'] as const) {
    const s = side === 'L' ? 1 : -1;
    const w = B(`f${side}w`), fb = DELVER_RIG.bone(`f${side}w`);
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 0.12;
      const base: V3 = [w[0] + s * 0.05 + dx, 0.18, w[2] + 0.3];
      claws.push(rigidPart(tuskGeometry([base, [base[0] + dx * 0.3, 0.2, base[2] + 0.28], [base[0] + dx * 0.5, 0.1, base[2] + 0.5], [base[0] + dx * 0.55, -0.04, base[2] + 0.58]], 0.065, 0.006, 14, 8, [0x2a2420, 0x8a8070]), fb, 0xffffff));
    }
    const a = B(`h${side}a`), hb = DELVER_RIG.bone(`h${side}a`);
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 0.06;
      const base: V3 = [a[0] + dx, 0.06, -0.95];
      claws.push(rigidPart(tuskGeometry([base, [base[0] + dx * 0.2, 0.05, base[2] + 0.08], [base[0] + dx * 0.3, -0.01, base[2] + 0.13]], 0.025, 0.004, 8, 6, [0x2a2420, 0x6a6050]), hb, 0xffffff));
    }
  }
  // Peg teeth along the mouth.
  const teeth: THREE.BufferGeometry[] = [];
  const jaw = DELVER_RIG.bone('jaw'), head = DELVER_RIG.bone('head');
  for (let i = 0; i < 14; i++) {
    const x = -0.16 + (i / 13) * 0.32, z = 1.86 - Math.abs(x) * 1.1;
    teeth.push(rigidPart(tuskGeometry([[x, 0.8, z], [x, 0.77, z + 0.01], [x, 0.75, z + 0.012]], 0.016, 0.006, 4, 6, [0x8a7a50, 0xd8c8a0]), head, 0xffffff));
    teeth.push(rigidPart(tuskGeometry([[x * 0.92, 0.78, z - 0.04], [x * 0.92, 0.805, z - 0.03], [x * 0.92, 0.82, z - 0.028]], 0.014, 0.005, 4, 6, [0x8a7a50, 0xd8c8a0]), jaw, 0xffffff));
  }
  // Ore crystals grown up between the plates (they glow; the Dark turns them violet).
  const crystals: THREE.BufferGeometry[] = [];
  let k = 0;
  for (const [z, a, bone] of [[-1.1, 0.3, 'pelvis'], [-0.7, -0.75, 'pelvis'], [-0.4, 0.8, 'spine'], [-0.1, -0.25, 'spine'], [0.15, 0.6, 'spine'], [0.45, -0.7, 'chest'], [0.6, 0.15, 'chest'], [-0.55, 0.0, 'spine']] as [number, number, string][]) {
    const [top, bot, hw] = lerpT(z);
    const mid = (top + bot) / 2 + 0.05, hh = (top - bot) / 2;
    const n = 2 + (k % 3);
    for (let j = 0; j < n; j++) {
      const len = 0.18 + ((k * 7 + j * 3) % 5) * 0.05;
      const c = new THREE.ConeGeometry(0.07, len * 1.3, 5);
      c.translate(0, len / 2, 0);
      c.rotateZ(-a + (j - 1) * 0.35).rotateX(-0.2 + j * 0.15);
      c.translate(Math.sin(a) * hw * 0.95 + (j - 1) * 0.05, mid + Math.cos(a) * hh + 0.03, z + j * 0.04);
      crystals.push(strip(rigidPart(c, DELVER_RIG.bone(bone), 0xffffff)));
    }
    k++;
  }
  cached = {
    body: g.geometry,
    far: g.far!,
    bristle,
    claws: mergeGeometries(claws.map(strip))!,
    teeth: mergeGeometries(teeth.map(strip))!,
    crystals: mergeGeometries(crystals)!,
    ms: performance.now() - t0,
  };
  return cached;
}
void tinted;
