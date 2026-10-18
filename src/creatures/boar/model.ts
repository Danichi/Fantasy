import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';

// The Wild Boar of the Elder Glen woods: deep, narrow body with a high
// shoulder hump, a wedge of a head carried low, a bristling crest down the
// spine, thin legs on small cloven hooves, and tusks that curl up out of the
// lower jaw. +Z is forward, the hooves stand on y = 0, units are metres.

const L = 1; // left side is +X
const legBones = (side: 'L' | 'R', x: number): BoneSpec[] => [
  { name: `f${side}s`, parent: 'chest', at: [x * 0.12, 0.6, 0.27] },
  { name: `f${side}e`, parent: `f${side}s`, at: [x * 0.125, 0.4, 0.21] },
  { name: `f${side}w`, parent: `f${side}e`, at: [x * 0.115, 0.15, 0.24] },
  { name: `f${side}t`, parent: `f${side}w`, at: [x * 0.115, 0.0, 0.28] },
  { name: `h${side}h`, parent: 'pelvis', at: [x * 0.105, 0.62, -0.42] },
  { name: `h${side}k`, parent: `h${side}h`, at: [x * 0.12, 0.42, -0.3] },
  { name: `h${side}a`, parent: `h${side}k`, at: [x * 0.105, 0.19, -0.5] },
  { name: `h${side}t`, parent: `h${side}a`, at: [x * 0.105, 0.0, -0.45] },
];

export const BOAR_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 0.66, -0.36] },
  { name: 'spine', parent: 'pelvis', at: [0, 0.7, -0.06] },
  { name: 'belly', parent: 'spine', at: [0, 0.48, -0.06] },
  { name: 'chest', parent: 'spine', at: [0, 0.74, 0.22] },
  { name: 'neck', parent: 'chest', at: [0, 0.72, 0.4] },
  { name: 'head', parent: 'neck', at: [0, 0.7, 0.52] },
  { name: 'snout', parent: 'head', at: [0, 0.56, 0.8] },
  { name: 'jaw', parent: 'head', at: [0, 0.56, 0.6] },
  { name: 'earL', parent: 'head', at: [0.07, 0.9, 0.47] },
  { name: 'earR', parent: 'head', at: [-0.07, 0.9, 0.47] },
  { name: 'tail1', parent: 'pelvis', at: [0, 0.7, -0.67] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.6, -0.71] },
  { name: 'tail3', parent: 'tail2', at: [0, 0.47, -0.73] },
  ...legBones('L', L),
  ...legBones('R', -L),
]);

const B = (bone: string) => BOAR_RIG.bones[BOAR_RIG.bone(bone)].at;
const mid = (a: V3, b: V3, t = 0.5): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The body outline: [z, top, bottom, half width]. High at the withers, falling to a small rump. */
const TORSO: [number, number, number, number][] = [
  [-0.72, 0.67, 0.6, 0.03],
  [-0.67, 0.735, 0.52, 0.085],
  [-0.57, 0.785, 0.465, 0.122],
  [-0.42, 0.83, 0.44, 0.142],
  [-0.22, 0.875, 0.41, 0.155],
  [0.0, 0.92, 0.385, 0.163],
  [0.17, 0.958, 0.37, 0.168],
  [0.31, 0.952, 0.385, 0.164],
  [0.43, 0.905, 0.425, 0.148],
  [0.5, 0.87, 0.47, 0.12],
];

/** The head outline, brow to snout: a long wedge with a straight profile. */
const HEAD: [number, number, number, number][] = [
  [0.36, 0.9, 0.45, 0.148],
  [0.47, 0.922, 0.435, 0.138],
  [0.57, 0.865, 0.43, 0.122],
  [0.67, 0.79, 0.44, 0.097],
  [0.77, 0.71, 0.455, 0.075],
  [0.86, 0.645, 0.468, 0.062],
  [0.91, 0.618, 0.474, 0.058],
];
const SNOUT: [number, number, number, number][] = [
  [0.8, 0.68, 0.462, 0.068],
  [0.88, 0.635, 0.47, 0.06],
  [0.95, 0.605, 0.477, 0.055],
  [0.995, 0.592, 0.481, 0.052],
];

function legParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const f = (n: string) => B(`f${side}${n}`), h = (n: string) => B(`h${side}${n}`);
  const P: Part[] = [];
  // Front: shoulder blade and upper arm hidden in the chest, a strong forearm, slim cannon, small hoof.
  P.push({ shape: { k: 'ell', c: [s * 0.12, 0.7, 0.25], r: [0.05, 0.16, 0.11], rot: [0.32, 0, -s * 0.08] }, bone: 'chest', blend: 0.1, tag: 'body' });
  P.push({ shape: { k: 'cone', a: f('s'), b: f('e'), ra: 0.085, rb: 0.065 }, bone: `f${side}s`, blend: 0.07, tag: 'body' });
  P.push({ shape: { k: 'cone', a: f('e'), b: f('w'), ra: 0.066, rb: 0.038 }, bone: `f${side}e`, blend: 0.035, tag: 'leg' });
  P.push({ shape: { k: 'ball', c: mid(f('e'), f('w'), 0.12), r: 0.062 }, bone: `f${side}e`, blend: 0.04, tag: 'leg' });
  P.push({ shape: { k: 'ball', c: f('w'), r: 0.036 }, bone: `f${side}w`, blend: 0.02, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: f('w'), b: [s * 0.115, 0.05, 0.268], ra: 0.031, rb: 0.03 }, bone: `f${side}w`, blend: 0.02, tag: 'leg' });
  // Cloven hoof: two toes, and dewclaws behind.
  for (const dx of [-0.016, 0.016])
    P.push({ shape: { k: 'ell', c: [s * 0.115 + dx, 0.028, 0.282], r: [0.017, 0.032, 0.03], rot: [0.55, 0, 0] }, bone: `f${side}t`, blend: 0.008, tag: 'hoof' });
  for (const dx of [-0.022, 0.022])
    P.push({ shape: { k: 'ell', c: [s * 0.115 + dx, 0.07, 0.24], r: [0.011, 0.016, 0.011], rot: [0.4, 0, 0] }, bone: `f${side}w`, blend: 0.006, tag: 'hoof' });
  // Hind: heavy ham bulging out of the rump, gaskin down to a sharp hock, sloped cannon.
  P.push({ shape: { k: 'ell', c: [s * 0.095, 0.52, -0.44], r: [0.068, 0.15, 0.14], rot: [-0.2, 0, 0] }, bone: `h${side}h`, blend: 0.08, tag: 'body' });
  P.push({ shape: { k: 'cone', a: h('h'), b: h('k'), ra: 0.095, rb: 0.07 }, bone: `h${side}h`, blend: 0.07, tag: 'body' });
  P.push({ shape: { k: 'cone', a: h('k'), b: h('a'), ra: 0.066, rb: 0.033 }, bone: `h${side}k`, blend: 0.035, tag: 'leg' });
  // Achilles: the tendon line down the back of the gaskin to the hock point.
  P.push({ shape: { k: 'cone', a: [s * 0.105, 0.4, -0.42], b: [s * 0.105, 0.2, -0.525], ra: 0.03, rb: 0.018 }, bone: `h${side}k`, blend: 0.03, tag: 'leg' });
  P.push({ shape: { k: 'ball', c: h('a'), r: 0.033 }, bone: `h${side}a`, blend: 0.015, tag: 'leg' });
  P.push({ shape: { k: 'cone', a: h('a'), b: [s * 0.105, 0.05, -0.463], ra: 0.03, rb: 0.029 }, bone: `h${side}a`, blend: 0.02, tag: 'leg' });
  for (const dx of [-0.015, 0.015])
    P.push({ shape: { k: 'ell', c: [s * 0.105 + dx, 0.028, -0.448], r: [0.016, 0.03, 0.028], rot: [0.55, 0, 0] }, bone: `h${side}t`, blend: 0.008, tag: 'hoof' });
  for (const dx of [-0.02, 0.02])
    P.push({ shape: { k: 'ell', c: [s * 0.105 + dx, 0.068, -0.49], r: [0.01, 0.015, 0.01], rot: [0.4, 0, 0] }, bone: `h${side}a`, blend: 0.006, tag: 'hoof' });
  return P;
}

function earParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const bone = 'ear' + side;
  const at: V3 = [s * 0.07, 0.885, 0.475];
  // A pointed leaf, cupped forward, tilted out and back.
  const xf = { at, rot: [-0.35, -s * 0.55, -s * 0.42] as V3, scale: [1, 1, 0.42] as V3 };
  return [
    { shape: { k: 'cone', a: at, b: [at[0], at[1] + 0.11, at[2]], ra: 0.056, rb: 0.012 }, bone, blend: 0.035, tag: 'ear', soft: 0.5, xf },
    { shape: { k: 'ell', c: [at[0], at[1] + 0.05, at[2] + 0.034], r: [0.034, 0.05, 0.022] }, bone, blend: 0.012, carve: true, tag: 'earIn', xf },
  ];
}

export function boarParts(): Part[] {
  const P: Part[] = [
    // Torso: one outline, carried by pelvis, spine and chest in turn so it can flex.
    { shape: { k: 'loft', slices: TORSO, egg: 0.38 }, bone: 'spine', ramp: [['pelvis', -0.45], ['spine', -0.08], ['chest', 0.25], ['neck', 0.48]], tag: 'body', blend: 0 },
    // Belly slung between the legs (breathes).
    { shape: { k: 'ell', c: [0, 0.47, -0.04], r: [0.135, 0.09, 0.3] }, bone: 'belly', tag: 'belly', blend: 0.1 },
    // Head and snout.
    { shape: { k: 'loft', slices: HEAD, egg: 0.32 }, bone: 'head', tag: 'face', blend: 0.1 },
    { shape: { k: 'loft', slices: SNOUT, egg: 0.25 }, bone: 'snout', tag: 'snout', blend: 0.04 },
    // Jowls: heavy cheeks hanging under the eyes.
    { shape: { k: 'ell', c: [0.075, 0.54, 0.56], r: [0.06, 0.09, 0.12], rot: [0.25, 0.2, 0.1] }, bone: 'head', tag: 'cheek', blend: 0.07 },
    { shape: { k: 'ell', c: [-0.075, 0.54, 0.56], r: [0.06, 0.09, 0.12], rot: [0.25, -0.2, -0.1] }, bone: 'head', tag: 'cheek', blend: 0.07 },
    // Brow ridges over the small eyes, and a bony bridge down the nose.
    { shape: { k: 'ell', c: [0.06, 0.745, 0.655], r: [0.035, 0.018, 0.05], rot: [0.5, 0.35, 0.25] }, bone: 'head', tag: 'face', blend: 0.03 },
    { shape: { k: 'ell', c: [-0.06, 0.745, 0.655], r: [0.035, 0.018, 0.05], rot: [0.5, -0.35, -0.25] }, bone: 'head', tag: 'face', blend: 0.03 },
    // The flat disc at the end of the snout, with a rim.
    { shape: { k: 'ell', c: [0, 0.536, 0.997], r: [0.054, 0.048, 0.02], rot: [0.1, 0, 0] }, bone: 'snout', tag: 'disc', blend: 0.01 },
    // Lips flaring where the tusks come through.
    { shape: { k: 'ell', c: [0.05, 0.49, 0.86], r: [0.03, 0.03, 0.07] }, bone: 'snout', tag: 'lip', blend: 0.03 },
    { shape: { k: 'ell', c: [-0.05, 0.49, 0.86], r: [0.03, 0.03, 0.07] }, bone: 'snout', tag: 'lip', blend: 0.03 },
    // Lower jaw and chin.
    { shape: { k: 'ell', c: [0, 0.465, 0.73], r: [0.06, 0.04, 0.16], rot: [-0.08, 0, 0] }, bone: 'jaw', tag: 'chin', blend: 0.04 },
    // Nostrils.
    { shape: { k: 'ell', c: [0.02, 0.536, 1.016], r: [0.009, 0.012, 0.01] }, bone: 'snout', tag: 'nostril', blend: 0.005, carve: true },
    { shape: { k: 'ell', c: [-0.02, 0.536, 1.016], r: [0.009, 0.012, 0.01] }, bone: 'snout', tag: 'nostril', blend: 0.005, carve: true },
    // Mouth line.
    { shape: { k: 'cone', a: [0.058, 0.495, 0.66], b: [0.044, 0.492, 0.93], ra: 0.006, rb: 0.004 }, bone: 'jaw', tag: 'lip', blend: 0.006, carve: true },
    { shape: { k: 'cone', a: [-0.058, 0.495, 0.66], b: [-0.044, 0.492, 0.93], ra: 0.006, rb: 0.004 }, bone: 'jaw', tag: 'lip', blend: 0.006, carve: true },
    // Eye sockets.
    { shape: { k: 'ball', c: [0.074, 0.705, 0.66], r: 0.017 }, bone: 'head', tag: 'lid', blend: 0.012, carve: true },
    { shape: { k: 'ball', c: [-0.074, 0.705, 0.66], r: 0.017 }, bone: 'head', tag: 'lid', blend: 0.012, carve: true },
    // Tail: thin and hanging.
    { shape: { k: 'cone', a: B('tail1'), b: B('tail2'), ra: 0.024, rb: 0.016 }, bone: 'tail1', tag: 'tail', blend: 0.04 },
    { shape: { k: 'cone', a: B('tail2'), b: B('tail3'), ra: 0.016, rb: 0.01 }, bone: 'tail2', tag: 'tail', blend: 0.01 },
    ...earParts('L'),
    ...earParts('R'),
    ...legParts('L'),
    ...legParts('R'),
  ];
  return P;
}

/** Muscle lumps and skin folds on top of the clay. */
function boarDisplace(x: number, y: number, z: number, d: number) {
  if (d > 0.05) return d;
  let o = (fbm3(x * 9, y * 9, z * 9, 2) - 0.5) * 0.012;
  // Wrinkles ringing the snout.
  if (z > 0.78 && z < 0.97 && y < 0.6) o += Math.sin(z * 230) * 0.0016 * smooth(0.78, 0.84, z) * smooth(0.97, 0.92, z);
  return d + o;
}

// Colours: warm dark brown body, near-black crest and legs, grizzled face.
const C = {
  body: new THREE.Color(0x5a4130),
  grizzle: new THREE.Color(0x8a6f55),
  crest: new THREE.Color(0x241912),
  leg: new THREE.Color(0x2a1f18),
  face: new THREE.Color(0x6b5546),
  cheek: new THREE.Color(0x8a7563),
  snout: new THREE.Color(0x54443a),
  disc: new THREE.Color(0x4e3e3a),
  hoof: new THREE.Color(0x1d1714),
  ear: new THREE.Color(0x3a2a20),
  earIn: new THREE.Color(0x7a5048),
  belly: new THREE.Color(0x3d2c22),
};
const _c = new THREE.Color();

export const boarPaint: PaintFn = (p, n, tag, out) => {
  const t = (k: string) => tag(k);
  // Start from the body coat with broad grizzled patches.
  const griz = smooth(0.45, 0.75, fbm3(p.x * 6, p.y * 6, p.z * 6));
  out.color.copy(C.body).lerp(C.grizzle, griz * 0.35);
  // The crest: a band along the top of the spine from the nape to mid-back.
  const crestBand = smooth(0.3, 0.75, n.y) * smooth(0.075, 0.0, Math.abs(p.x)) * smooth(-0.3, 0.0, p.z) * smooth(0.62, 0.45, p.z);
  const legs = t('leg') + t('hoof');
  out.color.lerp(C.leg, Math.min(1, legs + smooth(0.42, 0.22, p.y) * 0.8));
  out.color.lerp(C.belly, t('belly') * 0.6);
  out.color.lerp(C.crest, crestBand * 0.85);
  // Face: lighter grizzled mask across cheeks and jaw.
  const face = t('face') + t('cheek') + t('chin');
  out.color.lerp(_c.copy(C.face).lerp(C.cheek, t('cheek') * smooth(0.4, 0.7, fbm3(p.x * 14, p.y * 14, p.z * 14))), Math.min(1, face));
  out.color.lerp(C.snout, t('snout') + t('lip'));
  out.color.lerp(C.disc, t('disc') + t('nostril'));
  out.color.lerp(C.hoof, t('hoof'));
  out.color.lerp(C.ear, t('ear'));
  out.color.lerp(C.earIn, t('earIn'));
  out.color.lerp(C.crest, t('tail') * 0.7);

  // Fur length: long bristling crest, shaggy coat and belly, a beard on the cheeks,
  // short on the face and upper legs, bare snout, disc and hooves.
  const lower = smooth(0.24, 0.12, p.y); // lower legs
  let fur = 0.046 + noise3(p.x * 20, p.y * 20, p.z * 20) * 0.018;
  fur += t('belly') * 0.012 * smooth(0.2, -0.6, n.y);
  fur = fur * (1 - legs) + legs * (0.03 * (1 - lower) + 0.008 * lower);
  fur = fur * (1 - t('face')) + t('face') * (0.022 + 0.01 * smooth(0.75, 0.55, p.z));
  fur = fur * (1 - t('cheek')) + t('cheek') * (0.03 + 0.04 * smooth(0.3, -0.5, n.y));
  fur *= 1 - Math.min(1, t('snout') * smooth(0.82, 0.88, p.z) + t('disc') + t('nostril') + t('lip') + t('hoof') + t('earIn'));
  fur = fur * (1 - t('ear')) + t('ear') * (0.016 + 0.02 * smooth(0.97, 1.0, p.y));
  fur = Math.max(fur, crestBand * 0.14 * (0.75 + 0.25 * noise3(p.z * 30, 0, 0)));
  fur = fur * (1 - t('tail')) + t('tail') * (p.y < 0.52 ? 0.08 : 0.014);
  fur *= 1 - t('chin') * 0.35;
  out.fur = Math.max(0, fur);

  // Fur lies back and down; the crest stands up; legs point down; the face combs back from
  // the snout; the cheek beard and the belly hang down.
  out.flow.set(0, -0.45, -1);
  if (crestBand > 0.1) out.flow.lerp(new THREE.Vector3(0, 1.4, -0.6), crestBand);
  if (legs > 0.3) out.flow.set(0, -1, -0.15);
  if (face > 0.3) out.flow.set(0, 0.2, -1);
  if (t('cheek') > 0.4) out.flow.set(0, -1, -0.7);
  if (t('belly') > 0.4 && n.y < 0) out.flow.set(0, -1, -0.4);
  if (t('tail') > 0.3) out.flow.set(0, -1, 0);
  out.mask = t('disc') * 0.9 + t('nostril') + t('hoof') * 0.5;
  out.ao = 1;
};

/** A tapering, curving horn/tusk along a spline. */
export function tuskGeometry(points: V3[], r0: number, r1: number, seg = 18, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const c = new THREE.Vector3(), v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (radial + 1));
    const t = ring / seg;
    curve.getPointAt(t, c);
    v.fromBufferAttribute(pos, i);
    nn.fromBufferAttribute(nor, i);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    v.copy(c).addScaledVector(nn, r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Rounded tip.
  const tip = new THREE.SphereGeometry(r1, 8, 6);
  const end = curve.getPointAt(1);
  tip.translate(end.x, end.y, end.z);
  g.computeVertexNormals();
  tip.deleteAttribute('uv');
  g.deleteAttribute('uv');
  // Stained near the gum, clean ivory toward the point.
  const base = new THREE.Color(0x6e5a3e), ivory = new THREE.Color(0xd8c9a6), cc = new THREE.Color();
  const tint = (geo: THREE.BufferGeometry, at: (i: number) => number) => {
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cc.copy(base).lerp(ivory, Math.min(1, at(i) * 2.2));
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  tint(g, (i) => Math.floor(i / (radial + 1)) / seg);
  tint(tip, () => 1);
  return mergeGeometries([g, tip])!;
}

export interface BoarGeometry {
  coat: THREE.BufferGeometry;
  crest: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  mid: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  ivory: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: BoarGeometry | null = null;
/** Hand over geometry built elsewhere (the build worker). */
export function provideBoarGeometry(g: BoarGeometry) {
  cached = g;
}
export function boarGeometry(): BoarGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(BOAR_RIG, { parts: boarParts(), cell: 0.0125, displace: boarDisplace, paint: boarPaint, skinR: 0.045, aoR: 0.09, aoStrength: 1.1 });
  const jaw = BOAR_RIG.bone('jaw'), snout = BOAR_RIG.bone('snout'), head = BOAR_RIG.bone('head');
  const ivoryParts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    // Lower tusk: out of the jaw, curling up, out and back.
    ivoryParts.push(rigidPart(tuskGeometry([[s * 0.048, 0.488, 0.875], [s * 0.074, 0.528, 0.9], [s * 0.1, 0.572, 0.888], [s * 0.118, 0.606, 0.85]], 0.018, 0.003), jaw, 0xeee2c4));
    // Upper whetter: a short curl that the lower tusk hones against.
    ivoryParts.push(rigidPart(tuskGeometry([[s * 0.05, 0.505, 0.845], [s * 0.068, 0.53, 0.858], [s * 0.078, 0.552, 0.842]], 0.009, 0.0025, 10, 8), snout, 0xe6d9b8));
  }
  const eyeParts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.0145, 16, 12);
    e.scale(1, 0.82, 1);
    e.translate(s * 0.07, 0.705, 0.662);
    eyeParts.push(rigidPart(e, head, 0x1a0f0a));
  }
  const coat = growTufts(g.geometry, {
    budget: 11000, minLen: 0.016, lift: 0.14, droop: 0.2, widthK: 0.26, minW: 0.005, maxW: 0.013, overlap: 3.2,
    root: 0.55, tip: 1.2, vary: 0.14, grizzle: 0.3, grizzleTint: 0xa89070, seed: 11,
    where: (_p, f) => f < 0.075,
  });
  const crest = growTufts(g.geometry, {
    budget: 2500, minLen: 0.05, lift: 0.6, droop: 0.12, widthK: 0.12, minW: 0.008, maxW: 0.015, overlap: 9,
    root: 0.5, tip: 0.9, vary: 0.12, grizzle: 0.15, grizzleTint: 0x7a6450, seed: 23,
    where: (_p, f) => f >= 0.075,
  });
  cached = {
    coat,
    crest,
    body: g.geometry,
    mid: g.mid!,
    far: g.far!,
    ivory: mergeRigid(ivoryParts),
    eyes: mergeRigid(eyeParts),
    ms: performance.now() - t0,
  };
  return cached;
}

function mergeRigid(gs: THREE.BufferGeometry[]) {
  const attrs = ['position', 'normal', 'skinIndex', 'skinWeight', 'color'];
  const out = new THREE.BufferGeometry();
  for (const a of attrs) {
    const parts = gs.map((g) => g.getAttribute(a));
    const size = parts[0].itemSize;
    const total = parts.reduce((n, p) => n + p.count, 0);
    const arr = a === 'skinIndex' ? new Uint16Array(total * size) : new Float32Array(total * size);
    let o = 0;
    for (const p of parts) {
      arr.set(p.array as ArrayLike<number>, o);
      o += p.count * size;
    }
    out.setAttribute(a, a === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, size) : new THREE.BufferAttribute(arr, size));
  }
  return out;
}
