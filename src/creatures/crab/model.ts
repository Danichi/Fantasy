import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';

// Brine-Maw: a shore crab grown huge and old. A broad, heavy carapace ridged
// and toothed along its front edge, crusted with barnacles and streaked with
// weed; eyes on short stalks; eight jointed walking legs; and two mismatched
// claws: a massive knobbled crusher on the right, carried like a shield, and
// a long cutter on the left. Brick red above, orange at the joints, a pale
// belly, black-tipped claws. +Z forward, feet on y = 0, metres. At scale 1 it
// is a metre wide; Brine-Maw is drawn at about 2.4.

const LEG_ANG = [1.1, 1.47, 1.84, 2.2];
const LEG_LEN: [number, number, number][] = [
  [0.34, 0.3, 0.16],
  [0.38, 0.33, 0.17],
  [0.38, 0.33, 0.17],
  [0.32, 0.28, 0.15],
];

export interface CrabLeg {
  name: string;
  side: number;
  index: number;
  H: V3;
  K: V3;
  A: V3;
  T: V3;
}

function legPoints(side: number, i: number): CrabLeg {
  const a = LEG_ANG[i], [l1, l2, l3] = LEG_LEN[i];
  const dx = side * Math.sin(a), dz = Math.cos(a);
  // Sprawled: the merus runs out and a little up, the rest bends down to a point.
  const H: V3 = [side * 0.44 * Math.sin(a), 0.3, 0.3 * Math.cos(a)];
  const K: V3 = [H[0] + dx * l1 * 0.95, 0.3 + l1 * 0.3, H[2] + dz * l1 * 0.95];
  const A: V3 = [K[0] + dx * l2 * 0.72, K[1] - l2 * 0.66, K[2] + dz * l2 * 0.72];
  const T: V3 = [A[0] + dx * l3 * 0.45, 0, A[2] + dz * l3 * 0.45];
  return { name: `${side > 0 ? 'L' : 'R'}${i}`, side, index: i, H, K, A, T };
}
export const CRAB_LEGS: CrabLeg[] = [1, -1].flatMap((s) => [0, 1, 2, 3].map((i) => legPoints(s, i)));

/** The claws: shoulder, elbow, wrist, the hand, and the moving finger's hinge. Right (-x) is the crusher. */
/** Folded in front of the face: merus out and forward, carpus turning in, the hand lying across the front. */
const clawBones = (side: 'L' | 'R', s: number): BoneSpec[] => [
  { name: `claw${side}a`, parent: 'body', at: [s * 0.28, 0.3, 0.27] },
  { name: `claw${side}b`, parent: `claw${side}a`, at: [s * 0.5, 0.34, 0.42] },
  { name: `claw${side}c`, parent: `claw${side}b`, at: [s * 0.44, 0.37, 0.6] },
  { name: `claw${side}d`, parent: `claw${side}c`, at: [s * 0.13, 0.4, s < 0 ? 0.71 : 0.65] },
];

export const CRAB_RIG = new RigSpec([
  { name: 'body', at: [0, 0.32, 0] },
  { name: 'eyeL', parent: 'body', at: [0.085, 0.43, 0.34] },
  { name: 'eyeR', parent: 'body', at: [-0.085, 0.43, 0.34] },
  { name: 'mouth', parent: 'body', at: [0, 0.3, 0.37] },
  ...clawBones('L', 1),
  ...clawBones('R', -1),
  ...CRAB_LEGS.flatMap((l): BoneSpec[] => [
    { name: `${l.name}a`, parent: 'body', at: l.H },
    { name: `${l.name}b`, parent: `${l.name}a`, at: l.K },
    { name: `${l.name}c`, parent: `${l.name}b`, at: l.A },
    { name: `${l.name}d`, parent: `${l.name}c`, at: l.T },
  ]),
]);
const B = (n: string): V3 => CRAB_RIG.bones[CRAB_RIG.bone(n)].at;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296;
}

/** The point on the carapace dome above (x, z). */
function domeY(x: number, z: number) {
  const u = (x / 0.52) ** 2 + ((z + 0.02) / 0.38) ** 2;
  return 0.36 + 0.14 * Math.sqrt(Math.max(0, 1 - u));
}

function bodyParts(): Part[] {
  const P: Part[] = [];
  // The carapace: a broad shallow dome, a raised brow at the front, a flat belly plate.
  P.push({ shape: { k: 'ell', c: [0, 0.36, -0.02], r: [0.52, 0.14, 0.38] }, bone: 'body', tag: 'shell', blend: 0 });
  P.push({ shape: { k: 'ell', c: [0, 0.38, 0.22], r: [0.38, 0.09, 0.14] }, bone: 'body', tag: 'shell', blend: 0.06 });
  P.push({ shape: { k: 'ell', c: [0, 0.27, 0.0], r: [0.4, 0.07, 0.29] }, bone: 'body', tag: 'belly', blend: 0.05 });
  // Grooves across the shell (the regions of a crab's back).
  P.push({ shape: { k: 'cone', a: [-0.26, 0.5, 0.05], b: [0.26, 0.5, 0.05], ra: 0.013, rb: 0.013 }, bone: 'body', tag: 'groove', blend: 0.02, carve: true });
  P.push({ shape: { k: 'cone', a: [0, 0.505, 0.05], b: [0, 0.49, -0.26], ra: 0.011, rb: 0.011 }, bone: 'body', tag: 'groove', blend: 0.02, carve: true });
  // Teeth along the front edge, bigger toward the sides.
  for (const s of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const a = 0.25 + i * 0.22;
      const x = s * 0.52 * Math.sin(a), z = -0.02 + 0.38 * Math.cos(a);
      const len = 1.1 + i * 0.015;
      const out: V3 = [x * len, 0.37, z * len + 0.01];
      P.push({ shape: { k: 'cone', a: [x * 0.92, 0.38, z * 0.92], b: out, ra: 0.042, rb: 0.004 }, bone: 'body', tag: 'tooth', blend: 0.02 });
    }
  }
  // Barnacles: little volcanoes crusting the back.
  const r = rng(77);
  // Clustered toward the back and one side, as barnacles grow.
  for (let i = 0; i < 38; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.88;
    const x = Math.cos(a) * 0.44 * d + 0.08, z = Math.sin(a) * 0.3 * d - 0.08;
    const y = domeY(x, z);
    const h = 0.01 + r() * 0.018, w = 0.014 + r() * 0.02;
    P.push({ shape: { k: 'cone', a: [x, y - 0.012, z], b: [x, y + h, z], ra: w, rb: w * 0.6 }, bone: 'body', tag: 'barnacle', blend: 0.01 });
    P.push({ shape: { k: 'ball', c: [x, y + h + 0.003, z], r: w * 0.42 }, bone: 'body', tag: 'barnacleIn', blend: 0.003, carve: true });
  }
  // Eye stalks and the mouthparts between them.
  for (const s of [1, -1]) {
    const e = B(s > 0 ? 'eyeL' : 'eyeR');
    P.push({ shape: { k: 'cone', a: [s * 0.075, 0.4, 0.32], b: [e[0] + s * 0.015, e[1] + 0.05, e[2] + 0.04], ra: 0.024, rb: 0.018 }, bone: s > 0 ? 'eyeL' : 'eyeR', tag: 'stalk', blend: 0.02 });
  }
  P.push({ shape: { k: 'box', c: [0, 0.3, 0.365], h: [0.08, 0.04, 0.02], r: 0.012, rot: [0.3, 0, 0] }, bone: 'mouth', tag: 'mouth', blend: 0.015 });
  P.push({ shape: { k: 'box', c: [0, 0.27, 0.37], h: [0.05, 0.028, 0.015], r: 0.01, rot: [0.4, 0, 0] }, bone: 'mouth', tag: 'mouth', blend: 0.01 });
  return P;
}

function legParts(l: CrabLeg): Part[] {
  const [l1] = LEG_LEN[l.index];
  const r0 = 0.05 + l1 * 0.025;
  return [
    { shape: { k: 'cone', a: [l.H[0] * 0.85, l.H[1], l.H[2] * 0.85], b: l.H, ra: r0 * 1.05, rb: r0 }, bone: `${l.name}a`, tag: 'leg', blend: 0.03 },
    // Merus: the flat, broad upper segment, rising to the knee.
    { shape: { k: 'cone', a: l.H, b: l.K, ra: r0, rb: r0 * 0.8 }, bone: `${l.name}a`, tag: 'leg', blend: 0.02 },
    { shape: { k: 'ball', c: l.K, r: r0 * 0.78 }, bone: `${l.name}b`, tag: 'joint', blend: 0.015 },
    // Carpus and propodus down to the ankle.
    { shape: { k: 'cone', a: l.K, b: l.A, ra: r0 * 0.75, rb: r0 * 0.55 }, bone: `${l.name}b`, tag: 'leg', blend: 0.015 },
    { shape: { k: 'ball', c: l.A, r: r0 * 0.5 }, bone: `${l.name}c`, tag: 'joint', blend: 0.01 },
    // The dactyl: a sharp dark point to the ground.
    { shape: { k: 'cone', a: l.A, b: [l.T[0], 0.012, l.T[2]], ra: r0 * 0.48, rb: 0.006 }, bone: `${l.name}c`, tag: 'tip', blend: 0.01 },
  ];
}

function clawParts(side: 'L' | 'R'): Part[] {
  const s = side === 'L' ? 1 : -1;
  const crusher = s < 0;
  const k = crusher ? 1.3 : 0.9;
  const a = B(`claw${side}a`), b = B(`claw${side}b`), c = B(`claw${side}c`), d = B(`claw${side}d`);
  const P: Part[] = [];
  // Arm: merus out and forward, carpus turning in.
  P.push({ shape: { k: 'cone', a, b, ra: 0.055 * k, rb: 0.05 * k }, bone: `claw${side}a`, tag: 'arm', blend: 0.03 });
  P.push({ shape: { k: 'ball', c: b, r: 0.055 * k }, bone: `claw${side}b`, tag: 'joint', blend: 0.02 });
  P.push({ shape: { k: 'cone', a: b, b: c, ra: 0.055 * k, rb: 0.065 * k }, bone: `claw${side}b`, tag: 'arm', blend: 0.02 });
  // The hand (propodus): a swollen palm lying across the front, toward the middle.
  const palm: V3 = [(c[0] + d[0]) / 2 + s * 0.02, (c[1] + d[1]) / 2, (c[2] + d[2]) / 2];
  const len = Math.abs(c[0] - d[0]) / 2 + 0.05;
  P.push({ shape: { k: 'ell', c: palm, r: [len, 0.09 * k, 0.08 * k], rot: [0, s * 0.25, 0] }, bone: `claw${side}c`, tag: 'claw', blend: 0.03 });
  // The fixed finger below, the moving finger (dactyl) hinged above, both pointing in.
  const reach = crusher ? 0.2 : 0.22;
  const tipLo: V3 = [d[0] - s * reach, d[1] - 0.04 * k, d[2] + 0.04];
  const tipHi: V3 = [d[0] - s * reach, d[1] + 0.005, d[2] + 0.045];
  P.push({ shape: { k: 'cone', a: [d[0] + s * 0.02, d[1] - 0.035 * k, d[2]], b: tipLo, ra: 0.045 * k, rb: 0.008 }, bone: `claw${side}c`, tag: 'finger', blend: 0.02 });
  P.push({ shape: { k: 'cone', a: [d[0] + s * 0.02, d[1] + 0.03 * k, d[2]], b: tipHi, ra: 0.04 * k, rb: 0.007 }, bone: `claw${side}d`, tag: 'finger', blend: 0.015 });
  if (crusher) {
    // Knobbled crushing teeth and a lumpy palm.
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.2;
      P.push({ shape: { k: 'ball', c: [d[0] + (tipLo[0] - d[0]) * t, d[1] - 0.01, d[2] + (tipLo[2] - d[2]) * t], r: 0.02 }, bone: `claw${side}c`, tag: 'knob', blend: 0.01 });
    }
    P.push({ shape: { k: 'ell', c: [palm[0], palm[1] + 0.07, palm[2] - 0.02], r: [len * 0.7, 0.04, 0.06] }, bone: `claw${side}c`, tag: 'claw', blend: 0.04 });
    P.push({ shape: { k: 'ell', c: [palm[0] - s * 0.04, palm[1] + 0.02, palm[2] + 0.07], r: [len * 0.6, 0.05, 0.035] }, bone: `claw${side}c`, tag: 'claw', blend: 0.03 });
  }
  return P;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.04) return d;
  // A pitted, slightly lumpy shell.
  return d + (fbm3(x * 14, y * 14, z * 14, 2) - 0.5) * 0.01 - Math.max(0, noise3(x * 40, y * 40, z * 40) - 0.72) * 0.012;
}

const C = {
  red: new THREE.Color(0x8c2a18),
  dark: new THREE.Color(0x4a140c),
  orange: new THREE.Color(0xc4582a),
  belly: new THREE.Color(0xe2d2b0),
  barnacle: new THREE.Color(0xa8a090),
  barnacleIn: new THREE.Color(0x2a2420),
  weed: new THREE.Color(0x3e5a28),
  black: new THREE.Color(0x1a120e),
  joint: new THREE.Color(0xd88a5a),
  eye: new THREE.Color(0x101010),
};
const _c = new THREE.Color();

const crabPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  // Above: brick red mottled darker; below: a pale belly; orange edges and joints.
  const top = smooth(-0.1, 0.5, n.y);
  const mottle = smooth(0.35, 0.7, fbm3(p.x * 9, p.y * 9, p.z * 9));
  out.color.copy(C.red).lerp(C.dark, mottle * 0.6);
  out.color.lerp(C.orange, (1 - top) * 0.5);
  out.color.lerp(C.belly, t('belly') * smooth(0.2, -0.5, n.y));
  out.color.lerp(C.dark, t('mouth') * 0.5);
  // Weed in the grooves and low places on the back.
  const weed = top * smooth(0.55, 0.8, fbm3(p.x * 6 + 4, p.y * 6, p.z * 6)) * t('shell');
  out.color.lerp(C.weed, weed * 0.75 + t('groove') * 0.6);
  // Legs: red above, paler underneath, orange joints, dark points.
  if (t('leg') + t('joint') + t('tip') > 0.2) {
    _c.copy(C.red).lerp(C.orange, smooth(0.3, -0.4, n.y) * 0.7).lerp(C.joint, t('joint') * 0.7);
    out.color.lerp(_c, Math.min(1, t('leg') + t('joint') + t('tip')));
  }
  out.color.lerp(C.black, t('tip') * smooth(0.12, 0.03, p.y));
  // Claws: dark red, the fingers going black at the points; pale knobs.
  if (t('claw') + t('arm') + t('finger') > 0.2) {
    _c.copy(C.red).lerp(C.dark, 0.35).lerp(C.orange, smooth(0.2, -0.6, n.y) * 0.5);
    out.color.lerp(_c, Math.min(1, t('claw') + t('arm')));
    out.color.lerp(C.black, t('finger') * 0.85);
  }
  out.color.lerp(C.barnacle, t('knob') * 0.8);
  out.color.lerp(C.barnacle, t('barnacle') * 0.9);
  out.color.lerp(C.barnacleIn, t('barnacleIn') * 0.8);
  out.color.lerp(C.orange, t('tooth') * 0.6);
  out.color.lerp(C.eye, t('stalk') * smooth(0.48, 0.52, p.y));
  out.color.multiplyScalar(0.9 + 0.2 * noise3(p.x * 30, p.y * 30, p.z * 30));
  out.fur = 0;
  out.flow.set(0, 0, -1);
  // Wet and glossy, the barnacles and weed dull.
  out.mask = 1 - Math.min(1, t('barnacle') * 0.8 + weed * 0.6);
};

export interface CrabGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: CrabGeometry | null = null;
export function provideCrabGeometry(g: CrabGeometry) {
  cached = g;
}

export function crabGeometry(): CrabGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const body = buildGroup(CRAB_RIG, { parts: [...bodyParts(), ...clawParts('L'), ...clawParts('R')], cell: 0.012, displace, paint: crabPaint, skinR: 0.03, aoR: 0.06, aoStrength: 1.2 });
  const legs = CRAB_LEGS.map((l) => buildGroup(CRAB_RIG, { parts: legParts(l), cell: 0.011, paint: crabPaint, skinR: 0.02, aoR: 0.03, aoStrength: 0.6 }));
  const eyes: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = B(s > 0 ? 'eyeL' : 'eyeR');
    const g = new THREE.SphereGeometry(0.026, 12, 10);
    g.scale(1, 1.3, 1);
    g.translate(e[0] + s * 0.016, e[1] + 0.07, e[2] + 0.045);
    eyes.push(strip(rigidPart(g, CRAB_RIG.bone(s > 0 ? 'eyeL' : 'eyeR'), 0xffffff)));
  }
  cached = {
    body: mergeGeometries([body.geometry, ...legs.map((l) => l.geometry)])!,
    far: mergeGeometries([body.far!, ...legs.map((l) => l.far!)])!,
    eyes: mergeGeometries(eyes)!,
    ms: performance.now() - t0,
  };
  return cached;
}

function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
