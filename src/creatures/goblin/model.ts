import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';

// Snaggletooth, the goblin chief of the hill warren. Small, about 1.1 m, and
// all knots: a big head on a scrawny neck, long ears sticking out sideways (the
// left one torn), a heavy brow over little yellow eyes, a long hooked nose, a
// wide mouth with an underbite and one great yellow fang growing up out of it
// past his lip: the snaggletooth. A pot belly, skinny arms that hang to his
// knees, big knuckly hands, short bowed legs on long flat feet. Olive-green
// skin, mottled and warty. He wears a mantle of shaggy fur over his shoulders,
// a belt and a loincloth, and a crown of teeth. +Z forward, metres.

const arm = (s: 'L' | 'R', x: number) => [
  { name: `sh${s}`, parent: 'chest', at: [x * 0.125, 0.8, -0.01] as V3 },
  { name: `el${s}`, parent: `sh${s}`, at: [x * 0.19, 0.6, -0.03] as V3 },
  { name: `wr${s}`, parent: `el${s}`, at: [x * 0.215, 0.41, 0.0] as V3 },
  { name: `hd${s}`, parent: `wr${s}`, at: [x * 0.22, 0.33, 0.01] as V3 },
];
const leg = (s: 'L' | 'R', x: number) => [
  { name: `hip${s}`, parent: 'pelvis', at: [x * 0.07, 0.47, 0.0] as V3 },
  { name: `kn${s}`, parent: `hip${s}`, at: [x * 0.095, 0.26, 0.04] as V3 },
  { name: `an${s}`, parent: `kn${s}`, at: [x * 0.09, 0.06, -0.015] as V3 },
  { name: `to${s}`, parent: `an${s}`, at: [x * 0.09, 0.02, 0.1] as V3 },
];

export const GOBLIN_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 0.5, 0] },
  { name: 'spine', parent: 'pelvis', at: [0, 0.6, 0.01] },
  { name: 'chest', parent: 'spine', at: [0, 0.74, 0.0] },
  { name: 'neck', parent: 'chest', at: [0, 0.84, 0.03] },
  { name: 'head', parent: 'neck', at: [0, 0.91, 0.06] },
  { name: 'jaw', parent: 'head', at: [0, 0.925, 0.08] },
  { name: 'earL', parent: 'head', at: [0.085, 1.0, 0.03] },
  { name: 'earR', parent: 'head', at: [-0.085, 1.0, 0.03] },
  ...arm('L', 1),
  ...arm('R', -1),
  ...leg('L', 1),
  ...leg('R', -1),
]);
const B = (n: string): V3 => GOBLIN_RIG.bones[GOBLIN_RIG.bone(n)].at;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function armParts(s: 'L' | 'R'): Part[] {
  const x = s === 'L' ? 1 : -1;
  const sh = B(`sh${s}`), el = B(`el${s}`), wr = B(`wr${s}`), hd = B(`hd${s}`);
  const P: Part[] = [
    { shape: { k: 'ball', c: sh, r: 0.042 }, bone: `sh${s}`, tag: 'skin', blend: 0.03 },
    { shape: { k: 'cone', a: sh, b: el, ra: 0.03, rb: 0.022 }, bone: `sh${s}`, tag: 'skin', blend: 0.015 },
    // Knobbly elbows.
    { shape: { k: 'ball', c: add(el, [0, 0, -0.008]), r: 0.025 }, bone: `el${s}`, tag: 'skin', blend: 0.012 },
    { shape: { k: 'cone', a: el, b: wr, ra: 0.024, rb: 0.017 }, bone: `el${s}`, tag: 'skin', blend: 0.012 },
    // A leather bracer on the forearm.
    { shape: { k: 'cone', a: add(el, [x * 0.008, -0.06, 0.004]), b: add(wr, [x * 0.002, 0.02, 0]), ra: 0.027, rb: 0.023 }, bone: `el${s}`, tag: 'leather', blend: 0.004 },
    // Big knuckly hands.
    { shape: { k: 'ell', c: add(wr, [x * 0.004, -0.035, 0.008]), r: [0.017, 0.035, 0.03] }, bone: `wr${s}`, tag: 'skin', blend: 0.012 },
  ];
  for (let i = 0; i < 4; i++) {
    const zf = wr[2] - 0.012 + i * 0.012;
    const base: V3 = [wr[0] + x * 0.006, wr[1] - 0.065, zf];
    const tip: V3 = [hd[0] + x * 0.002, hd[1] - 0.035 - (i === 1 || i === 2 ? 0.008 : 0), zf + 0.022];
    P.push({ shape: { k: 'ball', c: base, r: 0.009 }, bone: `hd${s}`, tag: 'skin', blend: 0.005 });
    P.push({ shape: { k: 'cone', a: base, b: tip, ra: 0.0075, rb: 0.004 }, bone: `hd${s}`, tag: 'skin', blend: 0.004 });
    P.push({ shape: { k: 'cone', a: tip, b: add(tip, [0, -0.012, 0.006]), ra: 0.0038, rb: 0.001 }, bone: `hd${s}`, tag: 'claw', blend: 0.002 });
  }
  // Thumb.
  P.push({ shape: { k: 'cone', a: [wr[0] - x * 0.008, wr[1] - 0.03, wr[2] + 0.025], b: [wr[0] - x * 0.012, wr[1] - 0.075, wr[2] + 0.045], ra: 0.009, rb: 0.005 }, bone: `wr${s}`, tag: 'skin', blend: 0.005 });
  return P;
}

function legParts(s: 'L' | 'R'): Part[] {
  const x = s === 'L' ? 1 : -1;
  const hip = B(`hip${s}`), kn = B(`kn${s}`), an = B(`an${s}`), to = B(`to${s}`);
  return [
    { shape: { k: 'cone', a: hip, b: kn, ra: 0.052, rb: 0.036 }, bone: `hip${s}`, tag: 'skin', blend: 0.02 },
    { shape: { k: 'ball', c: add(kn, [0, 0, 0.01]), r: 0.033 }, bone: `kn${s}`, tag: 'skin', blend: 0.012 },
    { shape: { k: 'cone', a: kn, b: an, ra: 0.032, rb: 0.022 }, bone: `kn${s}`, tag: 'skin', blend: 0.012 },
    // Calf.
    { shape: { k: 'ell', c: add(kn, [0, -0.07, -0.018]), r: [0.026, 0.05, 0.026] }, bone: `kn${s}`, tag: 'skin', blend: 0.015 },
    // Shin wraps.
    { shape: { k: 'cone', a: add(kn, [0, -0.05, 0.004]), b: add(an, [0, 0.03, 0]), ra: 0.034, rb: 0.027 }, bone: `kn${s}`, tag: 'cloth', blend: 0.003 },
    // Long flat feet with three toes.
    { shape: { k: 'ell', c: [an[0], 0.03, an[2] + 0.04], r: [0.036, 0.024, 0.075] }, bone: `an${s}`, tag: 'skin', blend: 0.02 },
    { shape: { k: 'ball', c: [an[0] + x * 0.004, 0.045, an[2] - 0.025], r: 0.022 }, bone: `an${s}`, tag: 'skin', blend: 0.015 },
    ...[-1, 0, 1].map((k): Part => ({ shape: { k: 'cone', a: [to[0] + k * 0.02, 0.022, to[2] - 0.01], b: [to[0] + k * 0.026, 0.012, to[2] + 0.035], ra: 0.012, rb: 0.007 }, bone: `to${s}`, tag: 'skin', blend: 0.006 })),
    ...[-1, 0, 1].map((k): Part => ({ shape: { k: 'cone', a: [to[0] + k * 0.026, 0.012, to[2] + 0.035], b: [to[0] + k * 0.028, 0.004, to[2] + 0.05], ra: 0.005, rb: 0.001 }, bone: `to${s}`, tag: 'claw', blend: 0.002 })),
  ];
}

export function goblinParts(): Part[] {
  const P: Part[] = [];
  // Pot belly and a narrow, hunched chest.
  P.push({ shape: { k: 'ell', c: [0, 0.6, 0.035], r: [0.11, 0.12, 0.105] }, bone: 'spine', tag: 'skin', blend: 0.04 });
  P.push({ shape: { k: 'ell', c: [0, 0.75, -0.005], r: [0.115, 0.085, 0.08] }, bone: 'chest', tag: 'skin', blend: 0.05 });
  P.push({ shape: { k: 'ell', c: [0, 0.78, -0.05], r: [0.1, 0.07, 0.06] }, bone: 'chest', tag: 'skin', blend: 0.04 });
  P.push({ shape: { k: 'ell', c: [0, 0.5, -0.01], r: [0.1, 0.07, 0.085] }, bone: 'pelvis', tag: 'skin', blend: 0.04 });
  // Belt and loincloth, front and back.
  P.push({ shape: { k: 'ell', c: [0, 0.52, 0.015], r: [0.118, 0.022, 0.112] }, bone: 'pelvis', tag: 'leather', blend: 0.006 });
  P.push({ shape: { k: 'box', c: [0, 0.4, 0.075], h: [0.06, 0.1, 0.008], r: 0.006, rot: [0.08, 0, 0] }, bone: 'pelvis', tag: 'cloth', blend: 0.01 });
  P.push({ shape: { k: 'box', c: [0, 0.39, -0.08], h: [0.075, 0.11, 0.008], r: 0.006, rot: [-0.1, 0, 0] }, bone: 'pelvis', tag: 'cloth', blend: 0.01 });
  // Buckle: a knuckle-bone.
  P.push({ shape: { k: 'ell', c: [0, 0.52, 0.128], r: [0.02, 0.016, 0.01] }, bone: 'pelvis', tag: 'bone', blend: 0.004 });
  // A mantle of shaggy fur over the shoulders.
  P.push({ shape: { k: 'ell', c: [0, 0.81, -0.025], r: [0.165, 0.045, 0.1] }, bone: 'chest', tag: 'mantle', blend: 0.03 });
  P.push({ shape: { k: 'ell', c: [0, 0.76, -0.07], r: [0.13, 0.08, 0.05] }, bone: 'chest', tag: 'mantle', blend: 0.03 });
  // Scrawny neck, thrust forward.
  P.push({ shape: { k: 'cone', a: [0, 0.8, 0.0], b: [0, 0.92, 0.055], ra: 0.042, rb: 0.036 }, bone: 'neck', tag: 'skin', blend: 0.03 });
  // The head: a big round cranium, a heavy brow.
  P.push({ shape: { k: 'ell', c: [0, 1.0, 0.035], r: [0.095, 0.09, 0.1] }, bone: 'head', tag: 'skin', blend: 0.03 });
  P.push({ shape: { k: 'ell', c: [0, 1.0, 0.115], r: [0.08, 0.02, 0.03], rot: [-0.15, 0, 0] }, bone: 'head', tag: 'brow', blend: 0.025 });
  // Cheeks and a wide muzzle.
  for (const x of [1, -1]) {
    P.push({ shape: { k: 'ell', c: [x * 0.055, 0.945, 0.1], r: [0.042, 0.035, 0.04] }, bone: 'head', tag: 'skin', blend: 0.025 });
    // Deep-set eyes under the brow.
    P.push({ shape: { k: 'ell', c: [x * 0.038, 0.98, 0.135], r: [0.022, 0.016, 0.022] }, bone: 'head', tag: 'socket', blend: 0.008, carve: true });
  }
  P.push({ shape: { k: 'ell', c: [0, 0.932, 0.12], r: [0.055, 0.032, 0.05] }, bone: 'head', tag: 'skin', blend: 0.02 });
  // The long hooked nose, with a wart.
  P.push({ shape: { k: 'cone', a: [0, 0.995, 0.14], b: [0, 0.96, 0.215], ra: 0.016, rb: 0.011 }, bone: 'head', tag: 'skin', blend: 0.008 });
  P.push({ shape: { k: 'cone', a: [0, 0.96, 0.215], b: [0, 0.938, 0.207], ra: 0.011, rb: 0.007 }, bone: 'head', tag: 'skin', blend: 0.006 });
  P.push({ shape: { k: 'ell', c: [0, 0.948, 0.175], r: [0.022, 0.014, 0.016] }, bone: 'head', tag: 'skin', blend: 0.01 });
  P.push({ shape: { k: 'ball', c: [0.012, 0.975, 0.175], r: 0.006 }, bone: 'head', tag: 'wart', blend: 0.003 });
  // The mouth: a wide slit, upper teeth.
  P.push({ shape: { k: 'box', c: [0, 0.917, 0.16], h: [0.058, 0.008, 0.035], r: 0.005, rot: [0.1, 0, 0] }, bone: 'head', tag: 'mouth', blend: 0.006, carve: true });
  // A thin upper lip, pulled back at the corners.
  P.push({ shape: { k: 'ell', c: [0, 0.928, 0.163], r: [0.05, 0.007, 0.012] }, bone: 'head', tag: 'lip', blend: 0.006 });
  for (let i = 0; i < 6; i++) {
    const x = -0.032 + i * 0.013, curve = Math.abs(x) * 0.9;
    P.push({ shape: { k: 'cone', a: [x, 0.925, 0.158 - curve], b: [x, 0.913, 0.159 - curve], ra: 0.0045, rb: 0.0015 }, bone: 'head', tag: 'tooth', blend: 0.002 });
  }
  // The jaw: an underbite, lower teeth up over the lip, and the snaggletooth.
  P.push({ shape: { k: 'ell', c: [0, 0.895, 0.105], r: [0.06, 0.025, 0.06] }, bone: 'jaw', tag: 'skin', blend: 0.025 });
  // The underbite: the lower jaw juts past the upper.
  P.push({ shape: { k: 'ell', c: [0, 0.895, 0.16], r: [0.05, 0.02, 0.026] }, bone: 'jaw', tag: 'skin', blend: 0.015 });
  P.push({ shape: { k: 'ell', c: [0, 0.902, 0.182], r: [0.042, 0.006, 0.008] }, bone: 'jaw', tag: 'lip', blend: 0.005 });
  for (let i = 0; i < 5; i++) {
    const x = -0.032 + i * 0.016, curve = Math.abs(x) * 0.7;
    if (i === 3) continue;
    P.push({ shape: { k: 'cone', a: [x, 0.902, 0.183 - curve], b: [x * 1.05, 0.922, 0.186 - curve], ra: 0.0055, rb: 0.0015 }, bone: 'jaw', tag: 'tooth', blend: 0.002 });
  }
  // The snaggletooth: up out of the jaw, past the lip, curling out by the nose.
  P.push({ shape: { k: 'cone', a: [0.016, 0.9, 0.18], b: [0.026, 0.95, 0.19], ra: 0.011, rb: 0.007 }, bone: 'jaw', tag: 'fang', blend: 0.003 });
  P.push({ shape: { k: 'cone', a: [0.026, 0.95, 0.19], b: [0.04, 0.985, 0.182], ra: 0.007, rb: 0.0015 }, bone: 'jaw', tag: 'fang', blend: 0.002 });
  // Long ears, out sideways and a little up; the left one torn.
  for (const s of ['L', 'R'] as const) {
    const x = s === 'L' ? 1 : -1;
    const e = B(`ear${s}`);
    const tip: V3 = [x * 0.27, 1.06, -0.03];
    const flat = { at: e, scale: [1, 1, 0.35] as V3 };
    P.push({ shape: { k: 'cone', a: e, b: tip, ra: 0.042, rb: 0.004 }, bone: `ear${s}`, tag: 'ear', blend: 0.015, xf: flat });
    P.push({ shape: { k: 'cone', a: add(e, [x * 0.02, 0.004, 0.02]), b: add(tip, [-x * 0.03, -0.008, 0.012]), ra: 0.026, rb: 0.002 }, bone: `ear${s}`, tag: 'earIn', blend: 0.008, carve: true, xf: flat });
    if (s === 'L') P.push({ shape: { k: 'box', c: [0.2, 1.06, -0.012], h: [0.01, 0.012, 0.03], r: 0.003, rot: [0, 0, 0.3] }, bone: 'earL', tag: 'ear', blend: 0.003, carve: true });
  }
  // Warts on the scalp and shoulders.
  for (const w of [[0.05, 1.07, 0.07], [-0.06, 1.05, -0.02], [0.1, 0.8, 0.04], [-0.03, 1.08, 0.0]] as V3[]) P.push({ shape: { k: 'ball', c: w, r: 0.008 }, bone: w[1] > 0.95 ? 'head' : 'chest', tag: 'wart', blend: 0.004 });
  P.push(...armParts('L'), ...armParts('R'), ...legParts('L'), ...legParts('R'));
  return P;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.02) return d;
  // Wrinkled, knobbly skin.
  return d + (fbm3(x * 40, y * 40, z * 40, 2) - 0.5) * 0.003;
}

const C = {
  skin: new THREE.Color(0x6a7a36),
  skinDark: new THREE.Color(0x3e4a22),
  belly: new THREE.Color(0x9a9a58),
  ear: new THREE.Color(0x8a6a4a),
  spot: new THREE.Color(0x4a5a2a),
  wart: new THREE.Color(0x5a5a2a),
  socket: new THREE.Color(0x140c06),
  mouth: new THREE.Color(0x3a1410),
  lip: new THREE.Color(0x5a4a2a),
  tooth: new THREE.Color(0xd8c890),
  fang: new THREE.Color(0xe8d898),
  claw: new THREE.Color(0x2a2218),
  leather: new THREE.Color(0x4a3220),
  cloth: new THREE.Color(0x6a3a26),
  clothDirt: new THREE.Color(0x4a3a2a),
  mantle: new THREE.Color(0x6a5a44),
  bone: new THREE.Color(0xd8ccaa),
};

const paint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const g = fbm3(p.x * 9, p.y * 9, p.z * 9);
  // Olive skin, darker on top and behind, a pale yellowish belly; mottled.
  const top = smooth(-0.2, 0.8, n.y) * 0.3 + smooth(0.2, -0.6, n.z) * 0.25;
  out.color.copy(C.skin).lerp(C.skinDark, top + smooth(0.55, 0.75, g) * 0.35);
  out.color.lerp(C.belly, smooth(0.3, 0.9, n.z) * smooth(0.72, 0.55, p.y) * smooth(0.45, 0.55, p.y) * 0.7);
  out.color.lerp(C.spot, smooth(0.62, 0.7, noise3(p.x * 50, p.y * 50, p.z * 50)) * 0.5);
  out.color.lerp(C.ear, t('ear') * smooth(0.15, 0.27, Math.abs(p.x)) * 0.4 + t('earIn') * 0.5);
  out.color.lerp(C.wart, t('wart'));
  out.color.lerp(C.socket, t('socket'));
  out.color.lerp(C.mouth, t('mouth'));
  out.color.lerp(C.lip, t('lip') * 0.7);
  out.color.lerp(C.tooth, t('tooth'));
  out.color.lerp(C.fang, t('fang'));
  out.color.lerp(C.claw, t('claw'));
  out.color.lerp(C.bone, t('bone'));
  out.color.lerp(C.leather.clone().multiplyScalar(0.8 + 0.4 * g), t('leather'));
  out.color.lerp(C.cloth.clone().lerp(C.clothDirt, smooth(0.4, 0.7, g)), t('cloth'));
  out.color.lerp(C.mantle, t('mantle'));
  out.color.multiplyScalar(0.9 + 0.18 * noise3(p.x * 70, p.y * 70, p.z * 70));
  // Shaggy fur on the mantle; a few bristles on the scalp.
  out.fur = t('mantle') * 0.06 + t('skin') * smooth(1.04, 1.09, p.y) * 0.022;
  out.flow.set(0, -1, -0.3);
  out.mask = t('fang') + t('tooth') + t('claw');
};

export interface GoblinGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  fur: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  cleaver: THREE.BufferGeometry;
  horn: THREE.BufferGeometry;
  hornHand: THREE.BufferGeometry;
  vial: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: GoblinGeometry | null = null;
export function provideGoblinGeometry(g: GoblinGeometry) {
  cached = g;
}

function colored(parts: [THREE.BufferGeometry, number][], jitter = 0.15) {
  const geos = parts.map(([p, c]) => {
    p.deleteAttribute('uv');
    const g = p.index ? p.toNonIndexed() : p;
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      cc.set(c).multiplyScalar(1 - jitter + jitter * 2 * noise3(pos.getX(i) * 60, pos.getY(i) * 60, pos.getZ(i) * 60));
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos)!;
}

/** A crown of teeth and knuckle-bones on a band of leather. */
function crownGeo() {
  const parts: [THREE.BufferGeometry, number][] = [];
  const band = new THREE.CylinderGeometry(0.088, 0.092, 0.024, 20, 1, true);
  band.translate(0, 1.055, 0.035);
  parts.push([band, 0x3a2618]);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const tall = i % 3 === 0 ? 0.038 : i % 2 ? 0.022 : 0.03;
    const t = new THREE.ConeGeometry(0.011, tall, 6);
    t.translate(0, tall / 2, 0);
    t.rotateZ(((i * 37) % 7 - 3) * 0.06);
    t.rotateX(Math.cos(a) * 0.35);
    t.rotateZ(-Math.sin(a) * 0.35);
    t.translate(Math.sin(a) * 0.09, 1.062, 0.035 + Math.cos(a) * 0.09);
    parts.push([t, i % 3 === 0 ? 0xd8c890 : 0xb8a070]);
  }
  return colored(parts);
}

/** A cleaver: a broad slab of iron, a notched edge, a short wrapped haft. */
function cleaverGeo(hand: V3) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.0, 0.28);
  s.lineTo(0.1, 0.3);
  s.lineTo(0.115, 0.2);
  s.lineTo(0.105, 0.17);
  s.lineTo(0.118, 0.12);
  s.lineTo(0.1, 0.02);
  s.lineTo(0, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1 });
  blade.translate(-0.01, 0.08, -0.004);
  const haft = new THREE.CylinderGeometry(0.013, 0.015, 0.2, 7);
  haft.translate(0, 0.02, 0);
  const g = colored([[blade, 0x7a6a5c], [haft, 0x4a3420]], 0.3);
  // Held blade-forward, edge down, in the right fist.
  g.rotateY(-Math.PI / 2);
  g.rotateX(1.35);
  g.translate(hand[0], hand[1] - 0.035, hand[2] + 0.005);
  return g;
}

/** A horn of boar tusk, bound with copper wire. */
function hornShape() {
  const parts: [THREE.BufferGeometry, number][] = [];
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= 6; i++) {
    const a = i * 0.22;
    const p = new THREE.Vector3(0, Math.sin(a) * 0.07, (1 - Math.cos(a)) * 0.04 + i * 0.03);
    const len = prev.distanceTo(p);
    const c = new THREE.CylinderGeometry(0.008 + i * 0.006, 0.006 + (i - 1) * 0.006, len, 9, 1, i === 6);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize()));
    c.translate((prev.x + p.x) / 2, (prev.y + p.y) / 2, (prev.z + p.z) / 2);
    parts.push([c, 0xd8c890]);
    if (i === 2 || i === 4) {
      const w = new THREE.TorusGeometry(0.012 + i * 0.006, 0.003, 4, 12);
      w.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().sub(prev).normalize()));
      w.translate(p.x, p.y, p.z);
      parts.push([w, 0xb8682a]);
    }
    prev = p;
  }
  return colored(parts, 0.1);
}

function vialGeo(hand: V3) {
  const v = new THREE.CylinderGeometry(0.012, 0.015, 0.05, 8);
  v.translate(hand[0], hand[1] - 0.03, hand[2] + 0.03);
  return colored([[v, 0x9a5aff]], 0);
}

export function goblinGeometry(): GoblinGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(GOBLIN_RIG, { parts: goblinParts(), cell: 0.0065, displace, paint, skinR: 0.02, aoR: 0.04, aoStrength: 1.3 });
  const fur = growTufts(g.geometry, {
    budget: 1800, minLen: 0.02, lift: 0.25, droop: 0.7, widthK: 0.4, minW: 0.006, maxW: 0.012, overlap: 2,
    root: 0.8, tip: 1.2, vary: 0.25, seed: 9,
  });
  const head = GOBLIN_RIG.bone('head');
  const eyes: THREE.BufferGeometry[] = [];
  for (const x of [1, -1]) {
    const e = new THREE.SphereGeometry(0.011, 10, 8);
    e.scale(1, 0.75, 0.8);
    e.translate(x * 0.038, 0.98, 0.128);
    eyes.push(strip(rigidPart(e, head, 0xffffff)));
  }
  // The horn hangs at his belt; a second copy rides in his left hand when he blows it.
  const belt = hornShape();
  belt.rotateX(Math.PI / 2 + 0.3);
  belt.rotateZ(-0.3);
  belt.translate(0.115, 0.5, -0.02);
  const inHand = hornShape();
  const hdL = B('hdL');
  inHand.translate(0, -0.02, -0.1);
  inHand.rotateX(-0.2);
  inHand.translate(hdL[0] - 0.01, hdL[1] - 0.01, hdL[2] + 0.03);
  cached = {
    body: g.geometry,
    far: g.far!,
    fur,
    crown: tinted(crownGeo(), head),
    cleaver: tinted(cleaverGeo(B('hdR')), GOBLIN_RIG.bone('hdR')),
    horn: tinted(belt, GOBLIN_RIG.bone('pelvis')),
    hornHand: tinted(inHand, GOBLIN_RIG.bone('hdL')),
    vial: tinted(vialGeo(hdL), GOBLIN_RIG.bone('hdL')),
    eyes: mergeGeometries(eyes)!,
    ms: performance.now() - t0,
  };
  return cached;
}

function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** A rigid part that keeps its own vertex colours (rigidPart paints it one colour). */
function tinted(geo: THREE.BufferGeometry, bone: number) {
  const g = strip(rigidPart(geo, bone, 0xffffff));
  g.setAttribute('color', geo.getAttribute('color').clone());
  return g;
}
