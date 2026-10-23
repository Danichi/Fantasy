import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';

// The Hollow Thane: a barrow wight, the dead chieftain of the Old Kings'
// barrow. Tall and gaunt, it floats a hand's breadth off the ground. A robe
// rotted to rags hangs from its hips; a faded red mantle lies over its
// shoulders and falls down its back as a cape; between them its ribs show
// through grey skin like a starved hound's. A skull of a face with the skin
// still on, hollow cheeks, lipless teeth, deep sockets with a cold light in
// them; long white hair; a crown of green-bronze. In its hand an ancient
// bronze leaf-blade. +Z forward, metres, about 2.4 m tall.

const arm = (s: 'L' | 'R', x: number) => [
  { name: `sh${s}`, parent: 'chest', at: [x * 0.24, 1.88, 0] as V3 },
  { name: `el${s}`, parent: `sh${s}`, at: [x * 0.36, 1.5, -0.02] as V3 },
  { name: `wr${s}`, parent: `el${s}`, at: [x * 0.4, 1.14, 0.03] as V3 },
  { name: `hd${s}`, parent: `wr${s}`, at: [x * 0.41, 1.0, 0.04] as V3 },
];

export const WIGHT_RIG = new RigSpec([
  { name: 'pelvis', at: [0, 1.15, 0] },
  { name: 'spine', parent: 'pelvis', at: [0, 1.4, 0] },
  { name: 'chest', parent: 'spine', at: [0, 1.7, 0.02] },
  { name: 'neck', parent: 'chest', at: [0, 1.93, 0.04] },
  { name: 'head', parent: 'neck', at: [0, 2.1, 0.07] },
  { name: 'jaw', parent: 'head', at: [0, 2.075, 0.09] },
  { name: 'robe', parent: 'pelvis', at: [0, 0.75, 0] },
  { name: 'cape', parent: 'chest', at: [0, 1.0, -0.2] },
  ...arm('L', 1),
  ...arm('R', -1),
]);
const B = (n: string): V3 => WIGHT_RIG.bones[WIGHT_RIG.bone(n)].at;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296;
}

function armParts(s: 'L' | 'R'): Part[] {
  const x = s === 'L' ? 1 : -1;
  const sh = B(`sh${s}`), el = B(`el${s}`), wr = B(`wr${s}`), hd = B(`hd${s}`);
  const P: Part[] = [
    { shape: { k: 'ball', c: sh, r: 0.06 }, bone: `sh${s}`, tag: 'skin', blend: 0.04 },
    { shape: { k: 'cone', a: sh, b: el, ra: 0.044, rb: 0.034 }, bone: `sh${s}`, tag: 'skin', blend: 0.02 },
    { shape: { k: 'ball', c: el, r: 0.036 }, bone: `el${s}`, tag: 'skin', blend: 0.015 },
    { shape: { k: 'cone', a: el, b: wr, ra: 0.033, rb: 0.024 }, bone: `el${s}`, tag: 'skin', blend: 0.015 },
    // A long, bony hand.
    { shape: { k: 'ell', c: [wr[0] + x * 0.004, wr[1] - 0.06, wr[2] + 0.008], r: [0.022, 0.055, 0.035] }, bone: `wr${s}`, tag: 'skin', blend: 0.015 },
    // Ragged sleeves to the elbow, hanging open.
    { shape: { k: 'cone', a: [sh[0], sh[1] - 0.02, sh[2]], b: [el[0] + x * 0.012, el[1] - 0.05, el[2]], ra: 0.066, rb: 0.085 }, bone: `sh${s}`, tag: 'robe', blend: 0.02 },
  ];
  // Fingers: long, jointed, clawed.
  for (let i = 0; i < 4; i++) {
    const zf = wr[2] - 0.022 + i * 0.016;
    const base: V3 = [wr[0] + x * 0.006, wr[1] - 0.11, zf];
    const tip: V3 = [hd[0] + x * (0.005 - i * 0.002), hd[1] - 0.05 - (i === 1 || i === 2 ? 0.02 : 0), zf + 0.02];
    P.push({ shape: { k: 'cone', a: base, b: tip, ra: 0.0085, rb: 0.004 }, bone: `hd${s}`, tag: i === 3 ? 'skin' : 'finger', blend: 0.005 });
  }
  P.push({ shape: { k: 'cone', a: [wr[0] - x * 0.012, wr[1] - 0.06, wr[2] + 0.03], b: [wr[0] - x * 0.02, wr[1] - 0.14, wr[2] + 0.05], ra: 0.009, rb: 0.004 }, bone: `wr${s}`, tag: 'finger', blend: 0.005 });
  return P;
}

export function wightParts(): Part[] {
  const P: Part[] = [];
  // The robe: from the hips to just above the ground, wide at the hem.
  P.push({ shape: { k: 'cone', a: [0, 1.25, 0], b: [0, 0.72, 0], ra: 0.17, rb: 0.27 }, bone: 'pelvis', tag: 'robe', blend: 0.03 });
  P.push({ shape: { k: 'cone', a: [0, 0.75, 0], b: [0, 0.06, 0.0], ra: 0.27, rb: 0.42 }, bone: 'robe', tag: 'robe', blend: 0.04 });
  // A ragged hem.
  const r = rng(13);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.3;
    P.push({ shape: { k: 'box', c: [Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42], h: [0.05, 0.1 + r() * 0.12, 0.05], r: 0.01, rot: [0, -a, 0.6] }, bone: 'robe', tag: 'robe', blend: 0.02, carve: true });
  }
  // Starved torso, the ribs showing.
  P.push({ shape: { k: 'ell', c: [0, 1.55, 0.0], r: [0.14, 0.3, 0.085] }, bone: 'spine', tag: 'skin', blend: 0.04 });
  P.push({ shape: { k: 'ell', c: [0, 1.32, 0.03], r: [0.1, 0.1, 0.06] }, bone: 'spine', tag: 'skin', blend: 0.05, carve: true });
  for (let i = 0; i < 6; i++) {
    const y = 1.76 - i * 0.065;
    for (const x of [1, -1]) P.push({ shape: { k: 'ell', c: [x * 0.075, y, 0.06], r: [0.075 - i * 0.003, 0.011, 0.028], rot: [0, x * 0.5, x * 0.28] }, bone: 'chest', tag: 'rib', blend: 0.01 });
  }
  P.push({ shape: { k: 'cone', a: [0, 1.8, 0.075], b: [0, 1.5, 0.08], ra: 0.016, rb: 0.012 }, bone: 'chest', tag: 'rib', blend: 0.01 });
  // A bronze girdle at the waist.
  P.push({ shape: { k: 'ell', c: [0, 1.22, 0], r: [0.19, 0.03, 0.13] }, bone: 'pelvis', tag: 'bronze', blend: 0.01 });
  // The mantle over the shoulders, and the cape falling from it.
  P.push({ shape: { k: 'ell', c: [0, 1.86, -0.05], r: [0.32, 0.055, 0.17], rot: [0.12, 0, 0] }, bone: 'chest', tag: 'mantle', blend: 0.05 });
  P.push({ shape: { k: 'ell', c: [0.2, 1.8, -0.04], r: [0.13, 0.08, 0.15], rot: [0, 0, -0.5] }, bone: 'chest', tag: 'mantle', blend: 0.05 });
  P.push({ shape: { k: 'ell', c: [-0.2, 1.8, -0.04], r: [0.13, 0.08, 0.15], rot: [0, 0, 0.5] }, bone: 'chest', tag: 'mantle', blend: 0.05 });
  P.push({ shape: { k: 'cone', a: [0, 1.85, -0.14], b: [0, 0.45, -0.25], ra: 0.25, rb: 0.33 }, bone: 'cape', tag: 'mantle', blend: 0.05, xf: { at: [0, 1.2, -0.2], scale: [1, 1, 0.28] } });
  // Neck: thin and corded, mostly hidden by the mantle.
  P.push({ shape: { k: 'cone', a: [0, 1.86, 0.02], b: [0, 2.06, 0.06], ra: 0.052, rb: 0.044 }, bone: 'neck', tag: 'skin', blend: 0.03 });
  P.push({ shape: { k: 'cone', a: [0.025, 1.9, 0.05], b: [0.02, 2.03, 0.09], ra: 0.012, rb: 0.01 }, bone: 'neck', tag: 'skin', blend: 0.01 });
  P.push({ shape: { k: 'cone', a: [-0.025, 1.9, 0.05], b: [-0.02, 2.03, 0.09], ra: 0.012, rb: 0.01 }, bone: 'neck', tag: 'skin', blend: 0.01 });
  // The head: a skull with the skin still on it.
  P.push({ shape: { k: 'ell', c: [0, 2.19, 0.05], r: [0.09, 0.105, 0.11] }, bone: 'head', tag: 'skin', blend: 0.02 });
  P.push({ shape: { k: 'ell', c: [0, 2.2, 0.135], r: [0.083, 0.022, 0.028] }, bone: 'head', tag: 'skin', blend: 0.02 });
  P.push({ shape: { k: 'ell', c: [0, 2.11, 0.12], r: [0.058, 0.05, 0.06] }, bone: 'head', tag: 'skin', blend: 0.03 });
  for (const x of [1, -1]) {
    P.push({ shape: { k: 'ell', c: [x * 0.058, 2.14, 0.12], r: [0.03, 0.02, 0.038] }, bone: 'head', tag: 'skin', blend: 0.015 });
    P.push({ shape: { k: 'ell', c: [x * 0.064, 2.085, 0.1], r: [0.022, 0.03, 0.038] }, bone: 'head', tag: 'hollow', blend: 0.015, carve: true });
    P.push({ shape: { k: 'ell', c: [x * 0.035, 2.172, 0.158], r: [0.026, 0.022, 0.04] }, bone: 'head', tag: 'socket', blend: 0.008, carve: true });
  }
  P.push({ shape: { k: 'ell', c: [0, 2.128, 0.17], r: [0.012, 0.018, 0.02] }, bone: 'head', tag: 'socket', blend: 0.006, carve: true });
  // The jaw, shut, and lipless teeth showing.
  P.push({ shape: { k: 'ell', c: [0, 2.045, 0.095], r: [0.063, 0.03, 0.07] }, bone: 'jaw', tag: 'skin', blend: 0.03 });
  for (let i = 0; i < 7; i++) {
    const x = -0.03 + i * 0.01, curve = Math.abs(x) * 0.6;
    P.push({ shape: { k: 'box', c: [x, 2.088, 0.168 - curve], h: [0.0042, 0.011, 0.005], r: 0.002 }, bone: 'head', tag: 'tooth', blend: 0.002 });
    P.push({ shape: { k: 'box', c: [x, 2.066, 0.16 - curve], h: [0.0042, 0.01, 0.005], r: 0.002 }, bone: 'jaw', tag: 'tooth', blend: 0.002 });
  }
  P.push(...armParts('L'), ...armParts('R'));
  return P;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.04) return d;
  // Cloth folds running down the robe and cape; wrinkled skin.
  const folds = Math.sin(Math.atan2(x, z) * 9 + y * 1.5) * 0.008 * smooth(1.3, 0.4, y);
  return d + folds + (fbm3(x * 12, y * 12, z * 12, 2) - 0.5) * 0.008;
}

const C = {
  skin: new THREE.Color(0x7e868a),
  skinDark: new THREE.Color(0x4a5054),
  rib: new THREE.Color(0xa8aca6),
  robe: new THREE.Color(0x2e3428),
  mold: new THREE.Color(0x4e5644),
  mantle: new THREE.Color(0x5a2622),
  mantleFade: new THREE.Color(0x7a5048),
  bronze: new THREE.Color(0x8a6a30),
  verdigris: new THREE.Color(0x3e7a62),
  socket: new THREE.Color(0x060606),
  tooth: new THREE.Color(0xb8ae94),
  nail: new THREE.Color(0x1e1a16),
};

const wightPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const grime = fbm3(p.x * 7, p.y * 7, p.z * 7);
  // Skin: grey, darker in the hollows.
  out.color.copy(C.skin).lerp(C.skinDark, smooth(0.4, 0.75, grime) * 0.6 + t('hollow') * 0.6);
  out.color.lerp(C.rib, t('rib') * 0.35);
  // Robe: rotted dark cloth, mouldy patches, darker at the hem.
  if (t('robe') > 0.2) {
    const c = C.robe.clone().lerp(C.mold, smooth(0.5, 0.75, grime) * 0.7).multiplyScalar(0.8 + 0.3 * smooth(0.1, 0.8, p.y));
    out.color.lerp(c, Math.min(1, t('robe')));
  }
  // The mantle: a king's red, faded and stained.
  if (t('mantle') > 0.2) out.color.lerp(C.mantle.clone().lerp(C.mantleFade, smooth(0.45, 0.8, grime) * 0.6), Math.min(1, t('mantle')));
  // Green-bronze girdle.
  out.color.lerp(C.bronze.clone().lerp(C.verdigris, smooth(0.4, 0.7, grime)), t('bronze'));
  out.color.lerp(C.socket, t('socket'));
  out.color.lerp(C.tooth, t('tooth'));
  out.color.lerp(C.nail, t('finger') * smooth(1.0, 0.94, p.y));
  out.color.multiplyScalar(0.88 + 0.2 * noise3(p.x * 30, p.y * 30, p.z * 30));
  // Long white hair from the back and crown of the skull; rags at the hem and cape edge.
  const scalp = smooth(2.15, 2.25, p.y) * smooth(0.1, 0.0, p.z) * t('skin');
  const hem = (t('robe') + t('mantle')) * smooth(0.3, 0.1, p.y);
  out.fur = scalp * 0.32 + hem * 0.12;
  out.flow.set(0, -1, -0.15);
  out.mask = t('bronze');
};

export interface WightGeometry {
  body: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  hair: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  sword: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  ms: number;
}

let cached: WightGeometry | null = null;
export function provideWightGeometry(g: WightGeometry) {
  cached = g;
}

/** A crown of green bronze: a band with tall points. */
function crownGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const band = new THREE.CylinderGeometry(0.1, 0.097, 0.05, 24, 1, true);
  band.translate(0, 2.25, 0.05);
  parts.push(band);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const tall = i % 2 === 0 ? 0.055 : 0.032;
    const sp = new THREE.ConeGeometry(0.016, tall, 4);
    sp.translate(Math.sin(a) * 0.098, 2.275 + tall / 2, 0.05 + Math.cos(a) * 0.098);
    parts.push(sp);
  }
  const g = mergeGeometries(parts.map((p) => {
    p.deleteAttribute('uv');
    return p.index ? p.toNonIndexed() : p;
  }))!;
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = noise3(pos.getX(i) * 40, pos.getY(i) * 40, pos.getZ(i) * 40);
    c.copy(C.bronze).multiplyScalar(0.8).lerp(C.verdigris, 0.35 + smooth(0.4, 0.7, v) * 0.5);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** An ancient leaf-bladed sword of green bronze. */
function swordGeo(hand: V3) {
  const s = new THREE.Shape();
  // The leaf blade, drawn tip-up from the hilt.
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.05, 0.25, 0.035, 0.55);
  s.quadraticCurveTo(0.02, 0.68, 0, 0.78);
  s.quadraticCurveTo(-0.02, 0.68, -0.035, 0.55);
  s.quadraticCurveTo(-0.05, 0.25, 0, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 });
  blade.translate(0, 0.05, -0.004);
  const grip = new THREE.CylinderGeometry(0.014, 0.014, 0.13, 8);
  grip.translate(0, -0.03, 0);
  const guard = new THREE.BoxGeometry(0.11, 0.02, 0.03);
  guard.translate(0, 0.04, 0);
  const pommel = new THREE.SphereGeometry(0.022, 8, 6);
  pommel.translate(0, -0.1, 0);
  const g = mergeGeometries([blade, grip, guard, pommel].map((p) => {
    p.deleteAttribute('uv');
    return p.index ? p.toNonIndexed() : p;
  }))!;
  // Held point-down and forward in the right hand.
  g.rotateX(2.6);
  g.translate(hand[0], hand[1] - 0.04, hand[2] + 0.02);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = noise3(pos.getX(i) * 30, pos.getY(i) * 30, pos.getZ(i) * 30);
    c.copy(C.bronze).multiplyScalar(1.1).lerp(C.verdigris, smooth(0.5, 0.75, v) * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function wightGeometry(): WightGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(WIGHT_RIG, { parts: wightParts(), cell: 0.011, displace, paint: wightPaint, skinR: 0.035, aoR: 0.08, aoStrength: 1.3 });
  const hair = growTufts(g.geometry, {
    shape: 'hair', budget: 2600, minLen: 0.05, lift: 0.05, droop: 0.85, widthK: 0.03, minW: 0.003, maxW: 0.005, overlap: 3,
    root: 1.6, tip: 2.0, vary: 0.1, seed: 3,
    where: (p) => p.y > 2.08,
  });
  const rags = growTufts(g.geometry, {
    budget: 900, minLen: 0.04, lift: 0.1, droop: 0.95, widthK: 0.35, minW: 0.02, maxW: 0.04, overlap: 1.6,
    root: 0.8, tip: 0.7, vary: 0.2, seed: 5,
    where: (p) => p.y < 0.5,
  });
  const head = WIGHT_RIG.bone('head');
  const eyes: THREE.BufferGeometry[] = [];
  for (const x of [1, -1]) {
    const e = new THREE.SphereGeometry(0.0055, 8, 6);
    e.translate(x * 0.035, 2.172, 0.142);
    eyes.push(strip(rigidPart(e, head, 0xffffff)));
  }
  cached = {
    body: g.geometry,
    far: g.far!,
    hair: mergeGeometries([hair, rags])!,
    crown: tinted(crownGeo(), head),
    sword: tinted(swordGeo(B('hdR')), WIGHT_RIG.bone('hdR')),
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
