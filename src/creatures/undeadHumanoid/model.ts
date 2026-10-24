import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';

// The dead who walk for a reason: one man-sized skeleton rig, two bodies.
//
//   'drowned'   the captain of the Drowned Watchtower: a skeleton in the rags
//               of a naval coat, weed and barnacles grown on him, a rusted
//               morion helm, cold green light in the sockets, a cutlass.
//   'revenant'  the bandit lord under the Hanging Tree: grey dried flesh on
//               the bones, a long leather coat, a broad hat, the noose still
//               round his neck, a lantern in one hand and a sabre in the other.
//   'wraith'    what steps out of the Wrong Stone Circle at the full moon: a
//               skull in a deep hood, a long robe in tatters to the ground (it
//               floats), long bare arms with hooked claws, and the Sunwheel
//               worn backwards on its breast.
//
// +Z forward, metres, about 1.85 m tall.

const arm = (s: 'L' | 'R', x: number) => [
  { name: `sh${s}`, parent: 'chest', at: [x * 0.19, 1.5, -0.01] as V3 },
  { name: `el${s}`, parent: `sh${s}`, at: [x * 0.26, 1.22, -0.03] as V3 },
  { name: `wr${s}`, parent: `el${s}`, at: [x * 0.29, 0.97, 0.02] as V3 },
  { name: `hd${s}`, parent: `wr${s}`, at: [x * 0.3, 0.88, 0.03] as V3 },
];
const leg = (s: 'L' | 'R', x: number) => [
  { name: `hip${s}`, parent: 'pelvis', at: [x * 0.1, 0.96, 0] as V3 },
  { name: `kn${s}`, parent: `hip${s}`, at: [x * 0.11, 0.53, 0.03] as V3 },
  { name: `an${s}`, parent: `kn${s}`, at: [x * 0.11, 0.09, -0.02] as V3 },
  { name: `to${s}`, parent: `an${s}`, at: [x * 0.11, 0.02, 0.12] as V3 },
];

export const UNDEAD_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 1.0, 0] },
  { name: 'spine', parent: 'pelvis', at: [0, 1.18, -0.01] },
  { name: 'chest', parent: 'spine', at: [0, 1.38, 0.0] },
  { name: 'neck', parent: 'chest', at: [0, 1.58, 0.01] },
  { name: 'head', parent: 'neck', at: [0, 1.68, 0.03] },
  { name: 'jaw', parent: 'head', at: [0, 1.66, 0.06] },
  { name: 'coat', parent: 'pelvis', at: [0, 0.9, -0.05] },
  ...arm('L', 1),
  ...arm('R', -1),
  ...leg('L', 1),
  ...leg('R', -1),
]);
const B = (n: string): V3 => UNDEAD_RIG.bones[UNDEAD_RIG.bone(n)].at;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export type UndeadVariant = 'drowned' | 'revenant' | 'wraith';

/** Bones under it all: a skull, a ribcage, arm and leg bones. */
function skeleton(flesh: boolean): Part[] {
  const P: Part[] = [];
  const bone = flesh ? 'flesh' : 'bone';
  // Skull and jaw.
  P.push({ shape: { k: 'ell', c: [0, 1.76, 0.03], r: [0.085, 0.1, 0.105] }, bone: 'head', tag: bone, blend: 0.02 });
  P.push({ shape: { k: 'ell', c: [0, 1.7, 0.1], r: [0.062, 0.05, 0.05] }, bone: 'head', tag: bone, blend: 0.03 });
  for (const x of [1, -1]) {
    P.push({ shape: { k: 'ell', c: [x * 0.035, 1.748, 0.118], r: [0.03, 0.028, 0.05] }, bone: 'head', tag: 'socket', blend: 0.006, carve: true });
    P.push({ shape: { k: 'ell', c: [x * 0.062, 1.69, 0.085], r: [0.02, 0.026, 0.035] }, bone: 'head', tag: 'hollow', blend: 0.012, carve: !flesh });
  }
  P.push({ shape: { k: 'ell', c: [0, 1.7, 0.135], r: [0.012, 0.018, 0.02] }, bone: 'head', tag: 'socket', blend: 0.005, carve: true });
  P.push({ shape: { k: 'ell', c: [0, 1.625, 0.085], r: [0.055, 0.026, 0.055] }, bone: 'jaw', tag: bone, blend: 0.02 });
  for (let i = 0; i < 8; i++) {
    const x = -0.028 + i * 0.008, curve = Math.abs(x) * 0.7;
    P.push({ shape: { k: 'box', c: [x, 1.665, 0.128 - curve], h: [0.0035, 0.009, 0.004], r: 0.0015 }, bone: 'head', tag: 'tooth', blend: 0.0015 });
    P.push({ shape: { k: 'box', c: [x, 1.647, 0.124 - curve], h: [0.0035, 0.008, 0.004], r: 0.0015 }, bone: 'jaw', tag: 'tooth', blend: 0.0015 });
  }
  // Neck: vertebrae.
  for (let i = 0; i < 4; i++) P.push({ shape: { k: 'ell', c: [0, 1.56 + i * 0.03, 0.0], r: [0.024, 0.012, 0.022] }, bone: 'neck', tag: bone, blend: 0.006 });
  // Ribcage, sternum, spine, pelvis.
  P.push({ shape: { k: 'cone', a: [0, 1.0, -0.06], b: [0, 1.55, -0.04], ra: 0.025, rb: 0.022 }, bone: 'spine', tag: bone, blend: 0.01 });
  for (let i = 0; i < 6; i++) {
    const y = 1.48 - i * 0.055;
    for (const x of [1, -1]) P.push({ shape: { k: 'ell', c: [x * 0.07, y, 0.03], r: [0.075 - i * 0.004, 0.009, 0.05], rot: [0, x * 0.35, x * 0.2] }, bone: 'chest', tag: bone, blend: 0.008 });
  }
  P.push({ shape: { k: 'cone', a: [0, 1.5, 0.07], b: [0, 1.3, 0.08], ra: 0.013, rb: 0.01 }, bone: 'chest', tag: bone, blend: 0.006 });
  P.push({ shape: { k: 'ell', c: [0, 1.0, -0.01], r: [0.13, 0.07, 0.07] }, bone: 'pelvis', tag: bone, blend: 0.02 });
  P.push({ shape: { k: 'ell', c: [0, 1.0, 0.02], r: [0.07, 0.04, 0.05] }, bone: 'pelvis', tag: bone, blend: 0.01, carve: !flesh });
  // Collar bones and shoulder blades.
  for (const x of [1, -1]) P.push({ shape: { k: 'cone', a: [x * 0.03, 1.52, 0.05], b: [x * 0.18, 1.52, 0.0], ra: 0.012, rb: 0.014 }, bone: 'chest', tag: bone, blend: 0.006 });
  // Limbs: long bones with knobbly joints; flesh-wrapped they're thicker.
  const th = flesh ? 1.35 : 1;
  for (const s of ['L', 'R'] as const) {
    const sh = B(`sh${s}`), el = B(`el${s}`), wr = B(`wr${s}`), hd = B(`hd${s}`);
    P.push({ shape: { k: 'ball', c: sh, r: 0.034 * th }, bone: `sh${s}`, tag: bone, blend: 0.01 });
    P.push({ shape: { k: 'cone', a: sh, b: el, ra: 0.02 * th, rb: 0.017 * th }, bone: `sh${s}`, tag: bone, blend: 0.008 });
    P.push({ shape: { k: 'ball', c: el, r: 0.024 * th }, bone: `el${s}`, tag: bone, blend: 0.006 });
    P.push({ shape: { k: 'cone', a: el, b: wr, ra: 0.017 * th, rb: 0.014 * th }, bone: `el${s}`, tag: bone, blend: 0.006 });
    P.push({ shape: { k: 'ell', c: add(wr, [0, -0.035, 0.01]), r: [0.015 * th, 0.035, 0.03] }, bone: `wr${s}`, tag: bone, blend: 0.008 });
    for (let i = 0; i < 4; i++) {
      const z = wr[2] - 0.015 + i * 0.012;
      P.push({ shape: { k: 'cone', a: [wr[0], wr[1] - 0.065, z], b: [hd[0], hd[1] - 0.04, z + 0.015], ra: 0.006, rb: 0.004 }, bone: `hd${s}`, tag: bone, blend: 0.003 });
    }
    const hip = B(`hip${s}`), kn = B(`kn${s}`), an = B(`an${s}`), to = B(`to${s}`);
    P.push({ shape: { k: 'cone', a: hip, b: kn, ra: 0.026 * th, rb: 0.022 * th }, bone: `hip${s}`, tag: bone, blend: 0.01 });
    P.push({ shape: { k: 'ball', c: add(kn, [0, 0, 0.012]), r: 0.03 * th }, bone: `kn${s}`, tag: bone, blend: 0.008 });
    P.push({ shape: { k: 'cone', a: kn, b: an, ra: 0.022 * th, rb: 0.016 * th }, bone: `kn${s}`, tag: bone, blend: 0.008 });
    P.push({ shape: { k: 'ell', c: [to[0], 0.03, (an[2] + to[2]) / 2 + 0.02], r: [0.032, 0.022, 0.09] }, bone: `an${s}`, tag: 'boot', blend: 0.01 });
  }
  return P;
}

function drownedParts(): Part[] {
  const P = skeleton(false);
  // The rags of a naval coat: shoulders, a torn front, long tails behind.
  P.push({ shape: { k: 'ell', c: [0, 1.46, -0.02], r: [0.22, 0.09, 0.12] }, bone: 'chest', tag: 'coat', blend: 0.03 });
  for (const x of [1, -1]) P.push({ shape: { k: 'cone', a: [x * 0.1, 1.48, 0.03], b: [x * 0.13, 1.05, 0.06], ra: 0.05, rb: 0.07 }, bone: 'chest', tag: 'coat', blend: 0.02 });
  P.push({ shape: { k: 'cone', a: [0, 1.45, -0.09], b: [0, 0.45, -0.16], ra: 0.17, rb: 0.24 }, bone: 'coat', tag: 'coat', blend: 0.03, xf: { at: [0, 0.95, -0.12], scale: [1, 1, 0.3] } });
  for (let i = 0; i < 7; i++) P.push({ shape: { k: 'box', c: [-0.2 + i * 0.065, 0.5, -0.17], h: [0.022, 0.12 + (i % 3) * 0.05, 0.05], r: 0.005, rot: [0, 0, 0.3] }, bone: 'coat', tag: 'coat', blend: 0.01, carve: true });
  // Sleeves in tatters to the elbow; a sash; boots.
  for (const s of ['L', 'R'] as const) P.push({ shape: { k: 'cone', a: B(`sh${s}`), b: add(B(`el${s}`), [0, 0.03, 0]), ra: 0.05, rb: 0.055 }, bone: `sh${s}`, tag: 'coat', blend: 0.015 });
  P.push({ shape: { k: 'ell', c: [0, 1.04, 0.0], r: [0.15, 0.04, 0.1] }, bone: 'pelvis', tag: 'sash', blend: 0.01 });
  for (const s of ['L', 'R'] as const) P.push({ shape: { k: 'cone', a: add(B(`an${s}`), [0, 0.32, 0]), b: [B(`an${s}`)[0], 0.04, B(`an${s}`)[2] + 0.02], ra: 0.05, rb: 0.045 }, bone: `kn${s}`, tag: 'boot', blend: 0.01 });
  return P;
}

function revenantParts(): Part[] {
  const P: Part[] = [{ shape: { k: 'ell', c: [0, 1.75, 0.035], r: [0.09, 0.105, 0.105] }, bone: 'head', tag: 'flesh', blend: 0.015 }];
  P.push(...skeleton(true));
  // Shrunken flesh over the chest and belly.
  P.push({ shape: { k: 'ell', c: [0, 1.36, 0.0], r: [0.15, 0.17, 0.09] }, bone: 'chest', tag: 'flesh', blend: 0.04 });
  P.push({ shape: { k: 'ell', c: [0, 1.15, -0.01], r: [0.11, 0.12, 0.075] }, bone: 'spine', tag: 'flesh', blend: 0.04 });
  // A long leather coat, open at the front, to the shins.
  P.push({ shape: { k: 'ell', c: [0, 1.42, -0.02], r: [0.23, 0.12, 0.13] }, bone: 'chest', tag: 'coat', blend: 0.04 });
  for (const x of [1, -1]) P.push({ shape: { k: 'cone', a: [x * 0.12, 1.45, 0.02], b: [x * 0.17, 0.35, 0.02], ra: 0.07, rb: 0.14 }, bone: 'coat', tag: 'coat', blend: 0.03, xf: { at: [x * 0.15, 0.9, 0.02], scale: [1, 1, 0.55] } });
  P.push({ shape: { k: 'cone', a: [0, 1.4, -0.1], b: [0, 0.35, -0.14], ra: 0.17, rb: 0.26 }, bone: 'coat', tag: 'coat', blend: 0.03, xf: { at: [0, 0.9, -0.12], scale: [1, 1, 0.35] } });
  P.push({ shape: { k: 'ell', c: [0, 1.04, 0.01], r: [0.16, 0.035, 0.11] }, bone: 'pelvis', tag: 'belt', blend: 0.008 });
  for (const s of ['L', 'R'] as const) {
    P.push({ shape: { k: 'cone', a: B(`sh${s}`), b: B(`wr${s}`), ra: 0.06, rb: 0.05 }, bone: `sh${s}`, tag: 'coat', blend: 0.015 });
    P.push({ shape: { k: 'cone', a: add(B(`an${s}`), [0, 0.36, 0]), b: [B(`an${s}`)[0], 0.04, B(`an${s}`)[2] + 0.02], ra: 0.055, rb: 0.05 }, bone: `kn${s}`, tag: 'boot', blend: 0.01 });
  }
  // A ragged collar standing up round the noose.
  P.push({ shape: { k: 'cone', a: [0, 1.52, -0.02], b: [0, 1.64, -0.04], ra: 0.11, rb: 0.12 }, bone: 'chest', tag: 'coat', blend: 0.02 });
  P.push({ shape: { k: 'cone', a: [0, 1.52, -0.02], b: [0, 1.66, -0.04], ra: 0.085, rb: 0.095 }, bone: 'chest', tag: 'coat', blend: 0.01, carve: true });
  return P;
}

function wraithParts(): Part[] {
  const P: Part[] = [];
  // A deep hood over the skull, open at the face.
  P.push({ shape: { k: 'ell', c: [0, 1.79, -0.01], r: [0.15, 0.17, 0.16] }, bone: 'head', tag: 'robe', blend: 0.02 });
  P.push({ shape: { k: 'cone', a: [0, 1.88, -0.06], b: [0, 1.95, -0.2], ra: 0.08, rb: 0.02 }, bone: 'head', tag: 'robe', blend: 0.04 });
  P.push({ shape: { k: 'ell', c: [0, 1.74, 0.13], r: [0.11, 0.14, 0.13] }, bone: 'head', tag: 'robe', blend: 0.015, carve: true });
  // The robe: shoulders, then a long bell to the ground, hem in tatters.
  P.push({ shape: { k: 'ell', c: [0, 1.46, -0.02], r: [0.23, 0.11, 0.13] }, bone: 'chest', tag: 'robe', blend: 0.04 });
  P.push({ shape: { k: 'cone', a: [0, 1.45, -0.02], b: [0, 0.95, -0.02], ra: 0.17, rb: 0.2 }, bone: 'spine', tag: 'robe', blend: 0.04 });
  P.push({ shape: { k: 'cone', a: [0, 1.0, -0.02], b: [0, 0.02, -0.04], ra: 0.2, rb: 0.36 }, bone: 'coat', tag: 'robe', blend: 0.04 });
  P.push({ shape: { k: 'cone', a: [0, 0.9, -0.02], b: [0, -0.05, -0.04], ra: 0.17, rb: 0.32 }, bone: 'coat', tag: 'robe', blend: 0.01, carve: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 0.34;
    P.push({ shape: { k: 'box', c: [Math.sin(a) * r, 0.08 + (i % 3) * 0.06, -0.04 + Math.cos(a) * r], h: [0.04, 0.12 + (i % 4) * 0.05, 0.06], r: 0.01, rot: [0, a, 0.2 * ((i % 2) * 2 - 1)] }, bone: 'coat', tag: 'robe', blend: 0.01, carve: true });
  }
  // Wide sleeves to the elbow; the forearms bare bone; long hooked claws.
  for (const s of ['L', 'R'] as const) {
    const sh = B(`sh${s}`), el = B(`el${s}`), hd = B(`hd${s}`);
    P.push({ shape: { k: 'cone', a: sh, b: add(el, [0, -0.04, 0]), ra: 0.055, rb: 0.09 }, bone: `sh${s}`, tag: 'robe', blend: 0.02 });
    P.push({ shape: { k: 'cone', a: add(sh, [0, -0.05, 0]), b: add(el, [0, -0.06, 0]), ra: 0.035, rb: 0.075 }, bone: `sh${s}`, tag: 'robe', blend: 0.01, carve: true });
    for (let i = 0; i < 4; i++) {
      const z = hd[2] - 0.02 + i * 0.014;
      P.push({ shape: { k: 'cone', a: [hd[0], hd[1] - 0.04, z], b: [hd[0] * 1.02, hd[1] - 0.16, z + 0.05], ra: 0.006, rb: 0.002 }, bone: `hd${s}`, tag: 'claw', blend: 0.003 });
    }
  }
  P.push(...skeleton(false));
  return P;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.03) return d;
  return d + (fbm3(x * 30, y * 30, z * 30, 2) - 0.5) * 0.004;
}

const C = {
  bone: new THREE.Color(0xc8bea0),
  boneDark: new THREE.Color(0x6a6450),
  slime: new THREE.Color(0x3a5a3a),
  flesh: new THREE.Color(0x7a7a62),
  fleshDark: new THREE.Color(0x4a4a3a),
  navy: new THREE.Color(0x1e2a3e),
  navyFade: new THREE.Color(0x3a4a52),
  sash: new THREE.Color(0x6a1e1a),
  leather: new THREE.Color(0x34221a),
  leatherFade: new THREE.Color(0x4a3a2e),
  boot: new THREE.Color(0x221a14),
  socket: new THREE.Color(0x050505),
  robe: new THREE.Color(0x1a1c22),
  robeFade: new THREE.Color(0x3a4048),
  claw: new THREE.Color(0x2a2620),
  tooth: new THREE.Color(0xb8aa88),
};

function makePaint(v: UndeadVariant): PaintFn {
  return (p, n, tag, out) => {
    const t = tag;
    const g = fbm3(p.x * 9, p.y * 9, p.z * 9);
    if (v === 'drowned') {
      // Old bone, green-slimed in the hollows and low down; a sodden navy coat.
      out.color.copy(C.bone).lerp(C.boneDark, smooth(0.5, 0.8, g) * 0.5).lerp(C.slime, smooth(0.55, 0.75, noise3(p.x * 12, p.y * 12, p.z * 12)) * 0.6 + smooth(1.0, 0.3, p.y) * 0.3);
      if (t('coat') > 0.2) out.color.lerp(C.navy.clone().lerp(C.navyFade, smooth(0.45, 0.75, g) * 0.6).lerp(C.slime, smooth(0.6, 0.8, g) * 0.4), Math.min(1, t('coat')));
      out.color.lerp(C.sash, t('sash') * 0.85);
      // Weed hangs from the coat and the ribs.
      out.fur = (t('coat') * 0.07 + t('bone') * 0.04 * smooth(1.55, 1.2, p.y)) * smooth(0.5, 0.72, noise3(p.x * 7 + 5, p.y * 7, p.z * 7) + 0.2);
    } else if (v === 'wraith') {
      // Grey bone, and a robe of grave-black, greyer where it's worn and hangs.
      out.color.copy(C.bone).lerp(C.boneDark, 0.45 + smooth(0.5, 0.8, g) * 0.3);
      if (t('robe') > 0.2) out.color.lerp(C.robe.clone().lerp(C.robeFade, smooth(0.45, 0.8, g) * 0.6 + smooth(0.6, 0.0, p.y) * 0.3), Math.min(1, t('robe')));
      out.color.lerp(C.claw, t('claw'));
      // Rags and threads hanging off the robe.
      out.fur = t('robe') * smooth(1.2, 0.2, p.y) * 0.1 * smooth(0.45, 0.65, noise3(p.x * 6 + 9, p.y * 6, p.z * 6) + 0.15);
    } else {
      // Grey, dried flesh; a long coat of old leather, darker with age.
      out.color.copy(C.flesh).lerp(C.fleshDark, smooth(0.45, 0.8, g) * 0.6);
      out.color.lerp(C.bone, t('bone') * 0.6);
      if (t('coat') > 0.2) out.color.lerp(C.leather.clone().lerp(C.leatherFade, smooth(0.5, 0.8, g) * 0.5), Math.min(1, t('coat')));
      out.color.lerp(C.boot, t('belt'));
      // Lank hair from the back of the scalp.
      out.fur = t('flesh') * smooth(1.76, 1.82, p.y) * smooth(0.06, -0.02, p.z) * 0.18;
    }
    out.color.lerp(C.boot, t('boot'));
    out.color.lerp(C.socket, t('socket') + t('hollow') * 0.5);
    out.color.lerp(C.tooth, t('tooth'));
    out.color.multiplyScalar(0.88 + 0.2 * noise3(p.x * 40, p.y * 40, p.z * 40));
    out.flow.set(0, -1, 0);
    out.mask = t('bone') * (v === 'drowned' ? 0.5 : 0.2) + t('tooth');
  };
}

export interface UndeadGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  hair: THREE.BufferGeometry;
  gear: THREE.BufferGeometry;
  weapon: THREE.BufferGeometry;
  lamp: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

const cache: Partial<Record<UndeadVariant, UndeadGeometry>> = {};
export function provideUndeadGeometry(v: UndeadVariant, g: UndeadGeometry) {
  cache[v] = g;
}

function colored(parts: [THREE.BufferGeometry, number][], jitter = 0.15) {
  return mergeGeometries(parts.map(([p, c]) => {
    p.deleteAttribute('uv');
    const g = p.index ? p.toNonIndexed() : p;
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      cc.set(c).multiplyScalar(1 - jitter + jitter * 2 * noise3(pos.getX(i) * 50, pos.getY(i) * 50, pos.getZ(i) * 50));
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }))!;
}
function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
/** Rigid on one bone, keeping its own vertex colours. */
function tinted(geo: THREE.BufferGeometry, bone: number) {
  return strip(rigidPart(geo, bone, 0xffffff));
}

/** A curved cutlass or sabre in the right hand, blade forward. */
function bladeGeo(hand: V3, len: number, color: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.045, len * 0.5, 0.02, len);
  s.lineTo(-0.012, len * 0.92);
  s.quadraticCurveTo(0.015, len * 0.5, -0.016, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1 });
  blade.translate(0, 0.06, -0.0025);
  const guard = new THREE.TorusGeometry(0.05, 0.007, 4, 10, Math.PI);
  guard.rotateZ(Math.PI / 2).translate(0.02, 0.03, 0);
  const grip = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6);
  grip.translate(0, -0.03, 0);
  const g = colored([[blade, color], [guard, 0x8a6a3a], [grip, 0x2a1a12]], 0.25);
  g.rotateX(Math.PI / 2 - 0.25);
  g.translate(hand[0], hand[1] - 0.03, hand[2] + 0.01);
  return g;
}

export function undeadGeometry(v: UndeadVariant): UndeadGeometry {
  const hit = cache[v];
  if (hit) return hit;
  const t0 = performance.now();
  const g = buildGroup(UNDEAD_RIG, { parts: v === 'drowned' ? drownedParts() : v === 'wraith' ? wraithParts() : revenantParts(), cell: 0.0085, displace, paint: makePaint(v), skinR: 0.025, aoR: 0.05, aoStrength: 1.3 });
  const hair = growTufts(g.geometry, v !== 'revenant'
    ? { budget: 1400, minLen: 0.03, lift: 0.05, droop: 0.95, widthK: 0.2, minW: 0.008, maxW: 0.02, overlap: 1.6, root: 0.9, tip: 0.6, vary: 0.3, seed: 41 }
    : { shape: 'hair', budget: 1200, minLen: 0.05, lift: 0.04, droop: 0.9, widthK: 0.03, minW: 0.003, maxW: 0.005, overlap: 3, root: 1.4, tip: 1.8, vary: 0.1, seed: 43 });
  const head = UNDEAD_RIG.bone('head'), chest = UNDEAD_RIG.bone('chest'), neck = UNDEAD_RIG.bone('neck');
  let gear: THREE.BufferGeometry;
  if (v === 'drowned') {
    // A rusted morion: a crested bowl with a curled brim; barnacles on it and the shoulders.
    const bowl = new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    bowl.scale(0.95, 1.05, 1.15).translate(0, 1.79, 0.02);
    const brim = new THREE.TorusGeometry(0.13, 0.018, 6, 20);
    brim.rotateX(Math.PI / 2).scale(0.9, 1, 1.35).translate(0, 1.79, 0.02);
    const crest = new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16, 1, false, 0, Math.PI);
    crest.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.84, 0.02);
    const parts: [THREE.BufferGeometry, number][] = [[bowl, 0x6a4a32], [brim, 0x5a3a28], [crest, 0x6a4a32]];
    for (let i = 0; i < 16; i++) {
      const a = (i * 2.39) % (Math.PI * 2);
      const b = new THREE.ConeGeometry(0.012, 0.02, 6);
      const onHelm = i < 6;
      if (onHelm) b.translate(Math.cos(a) * 0.1, 1.8 + Math.sin(i) * 0.02, 0.02 + Math.sin(a) * 0.1);
      else b.translate((i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.02), 1.5 - (i % 4) * 0.02, -0.02 + (i % 5) * 0.02);
      parts.push([b, 0xd8d0c0]);
    }
    gear = tinted(colored(parts.slice(0, 3)), head);
    gear = mergeGeometries([gear, tinted(colored(parts.slice(3, 9)), head), tinted(colored(parts.slice(9)), chest)])!;
  } else if (v === 'wraith') {
    // The Sunwheel on its breast, worn backwards: the spokes bent the wrong way.
    const parts: [THREE.BufferGeometry, number][] = [];
    const ring = new THREE.TorusGeometry(0.055, 0.008, 6, 20);
    parts.push([ring, 0x8a7a5a]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = new THREE.BoxGeometry(0.008, 0.05, 0.006);
      spoke.translate(0, 0.025, 0).rotateZ(-0.5).rotateZ(a);
      parts.push([spoke, 0x8a7a5a]);
    }
    const chain = new THREE.TorusGeometry(0.12, 0.004, 4, 24, Math.PI);
    chain.rotateZ(Math.PI).translate(0, 0.12, -0.02);
    parts.push([chain, 0x6a5a40]);
    const amulet = colored(parts);
    amulet.translate(0, 1.36, 0.16);
    gear = tinted(amulet, chest);
  } else {
    // A broad hat, and the noose.
    const crown = new THREE.CylinderGeometry(0.085, 0.095, 0.1, 14);
    crown.translate(0, 1.86, 0.02);
    const brim = new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20);
    brim.translate(0, 1.815, 0.02);
    const noose = new THREE.TorusGeometry(0.07, 0.012, 6, 16);
    noose.rotateX(Math.PI / 2).translate(0, 1.58, 0.0);
    const knot = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6);
    knot.translate(0.06, 1.6, -0.04);
    const rope = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 5);
    rope.rotateZ(0.3).translate(0.1, 1.38, -0.06);
    gear = mergeGeometries([tinted(colored([[crown, 0x2a2018], [brim, 0x2a2018]]), head), tinted(colored([[noose, 0x8a7a52], [knot, 0x8a7a52]]), neck), tinted(colored([[rope, 0x8a7a52]]), chest)])!;
  }
  // The wraith carries nothing: its claws are sculpted.
  const weapon = v === 'wraith' ? strip(rigidPart(new THREE.BoxGeometry(0.001, 0.001, 0.001), UNDEAD_RIG.bone('hdR'), 0x000000)) : tinted(bladeGeo(B('hdR'), v === 'drowned' ? 0.7 : 0.8, v === 'drowned' ? 0x7a6a5a : 0xa8acb0), UNDEAD_RIG.bone('hdR'));
  // The revenant's lantern (an iron cage with a light); the captain carries none.
  // An iron cage: six bars between a base and a cap (the glowing panes are in the visual).
  const bars: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bars.push(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4).translate(Math.cos(a) * 0.066, 0, Math.sin(a) * 0.066));
  }
  bars.push(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 6).translate(0, -0.085, 0));
  const lampFrame = mergeGeometries(bars.map((b) => b.toNonIndexed()))!;
  const lampTop = new THREE.ConeGeometry(0.07, 0.06, 6);
  lampTop.translate(0, 0.11, 0);
  const ring = new THREE.TorusGeometry(0.025, 0.006, 4, 10);
  ring.translate(0, 0.16, 0);
  const hdL = B('hdL');
  const lamp = colored([[lampFrame, 0x2a2622], [lampTop, 0x2a2622], [ring, 0x2a2622]]);
  lamp.translate(hdL[0], hdL[1] - 0.18, hdL[2] + 0.02);
  const eyes: THREE.BufferGeometry[] = [];
  for (const x of [1, -1]) {
    const e = new THREE.SphereGeometry(0.011, 8, 6);
    e.translate(x * 0.035, 1.746, 0.112);
    eyes.push(strip(rigidPart(e, head, 0xffffff)));
  }
  cache[v] = {
    body: g.geometry,
    far: g.far!,
    hair,
    gear,
    weapon,
    lamp: tinted(lamp, UNDEAD_RIG.bone('hdL')),
    eyes: mergeGeometries(eyes)!,
    ms: performance.now() - t0,
  };
  return cache[v]!;
}
void smooth;
