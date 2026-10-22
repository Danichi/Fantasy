import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, RigSpec, type BoneSpec, type PaintFn } from '../kit/body';
import type { Part, V3 } from '../kit/sdf';
import { fbm3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';

// The Cave Bat: a dog-faced bat as long as a forearm with wings wider than a
// man's arms: a furred, tawny-collared body, tall cupped ears, a wrinkled
// nose-leaf over a mouth of needle fangs, and leathery wings stretched
// between long finger bones. Modelled in flight pose: wings spread along X,
// head toward +Z, metres, centred on the body.

const fingerBones = (side: 'L' | 'R', s: number): BoneSpec[] => [
  { name: `sh${side}`, parent: 'body', at: [s * 0.055, 0.02, 0.05] },
  { name: `el${side}`, parent: `sh${side}`, at: [s * 0.25, 0.03, -0.02] },
  { name: `wr${side}`, parent: `el${side}`, at: [s * 0.47, 0.03, 0.05] },
  // index (leading edge), middle (to the tip), ring, little
  { name: `d2${side}`, parent: `wr${side}`, at: [s * 0.6, 0.03, 0.11] },
  { name: `d2${side}t`, parent: `d2${side}`, at: [s * 0.72, 0.02, 0.1] },
  { name: `d3${side}`, parent: `wr${side}`, at: [s * 0.64, 0.03, 0.03] },
  { name: `d3${side}t`, parent: `d3${side}`, at: [s * 0.76, 0.02, -0.07] },
  { name: `d4${side}`, parent: `wr${side}`, at: [s * 0.59, 0.03, -0.09] },
  { name: `d4${side}t`, parent: `d4${side}`, at: [s * 0.62, 0.02, -0.23] },
  { name: `d5${side}`, parent: `wr${side}`, at: [s * 0.51, 0.03, -0.13] },
  { name: `d5${side}t`, parent: `d5${side}`, at: [s * 0.48, 0.02, -0.28] },
  { name: `leg${side}`, parent: 'body', at: [s * 0.04, -0.02, -0.1] },
  { name: `foot${side}`, parent: `leg${side}`, at: [s * 0.1, -0.03, -0.21] },
  { name: `ear${side}`, parent: 'head', at: [s * 0.032, 0.055, 0.15] },
];

export const BAT_RIG = new RigSpec([
  { name: 'body', at: [0, 0, 0] },
  { name: 'head', parent: 'body', at: [0, 0.02, 0.12] },
  { name: 'jaw', parent: 'head', at: [0, -0.005, 0.16] },
  { name: 'tail', parent: 'body', at: [0, -0.01, -0.12] },
  { name: 'tailT', parent: 'tail', at: [0, -0.02, -0.25] },
  ...fingerBones('L', 1),
  ...fingerBones('R', -1),
]);
const B = (n: string): V3 => BAT_RIG.bones[BAT_RIG.bone(n)].at;

function bodyParts(): Part[] {
  const P: Part[] = [
    { shape: { k: 'ell', c: [0, 0, -0.01], r: [0.062, 0.058, 0.115] }, bone: 'body', tag: 'body', blend: 0 },
    { shape: { k: 'ell', c: [0, 0.008, 0.07], r: [0.066, 0.06, 0.07] }, bone: 'body', tag: 'chest', blend: 0.04 },
    // Head: a fox-like muzzle.
    { shape: { k: 'ell', c: [0, 0.028, 0.15], r: [0.052, 0.05, 0.052] }, bone: 'head', tag: 'head', blend: 0.03 },
    { shape: { k: 'cone', a: [0, 0.018, 0.168], b: [0, 0.01, 0.205], ra: 0.026, rb: 0.015 }, bone: 'head', tag: 'muzzle', blend: 0.02 },
    // Nose-leaf: a small wrinkled spearhead of skin over the nostrils.
    { shape: { k: 'ell', c: [0, 0.026, 0.212], r: [0.01, 0.017, 0.005], rot: [-0.35, 0, 0] }, bone: 'head', tag: 'nose', blend: 0.005 },
    { shape: { k: 'ell', c: [0, -0.008, 0.19], r: [0.02, 0.011, 0.026] }, bone: 'jaw', tag: 'chin', blend: 0.012 },
    // Eyes sockets.
    { shape: { k: 'ball', c: [0.027, 0.043, 0.182], r: 0.008 }, bone: 'head', tag: 'lid', blend: 0.005, carve: true },
    { shape: { k: 'ball', c: [-0.027, 0.043, 0.182], r: 0.008 }, bone: 'head', tag: 'lid', blend: 0.005, carve: true },
    // Tail stump.
    { shape: { k: 'cone', a: B('tail'), b: B('tailT'), ra: 0.012, rb: 0.005 }, bone: 'tail', tag: 'skin', blend: 0.02 },
  ];
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    // Ears: tall, cupped forward, tilted out.
    const at: V3 = [s * 0.032, 0.05, 0.145];
    const xf = { at, rot: [-0.25, -s * 0.35, -s * 0.38] as V3, scale: [1, 1, 0.4] as V3 };
    P.push({ shape: { k: 'cone', a: at, b: [at[0], at[1] + 0.09, at[2]], ra: 0.026, rb: 0.006 }, bone: `ear${side}`, tag: 'ear', blend: 0.012, soft: 0.5, xf });
    P.push({ shape: { k: 'ell', c: [at[0], at[1] + 0.04, at[2] + 0.014], r: [0.016, 0.035, 0.01] }, bone: `ear${side}`, tag: 'earIn', blend: 0.006, carve: true, xf });
    // Shoulder and upper arm muscle.
    P.push({ shape: { k: 'cone', a: B(`sh${side}`), b: [s * 0.15, 0.025, 0.02], ra: 0.03, rb: 0.016 }, bone: `sh${side}`, tag: 'body', blend: 0.03 });
    // Hind legs and feet with hooked claws.
    P.push({ shape: { k: 'cone', a: B(`leg${side}`), b: B(`foot${side}`), ra: 0.016, rb: 0.009 }, bone: `leg${side}`, tag: 'skin', blend: 0.02 });
    P.push({ shape: { k: 'ell', c: [s * 0.105, -0.032, -0.225], r: [0.014, 0.008, 0.02] }, bone: `foot${side}`, tag: 'skin', blend: 0.008 });
  }
  return P;
}

const COL = {
  body: new THREE.Color(0x2a1f1b),
  collar: new THREE.Color(0x7c4f2e),
  face: new THREE.Color(0x1c1412),
  skin: new THREE.Color(0x2a1e1a),
  ear: new THREE.Color(0x2e211c),
  earIn: new THREE.Color(0x6a4038),
  nose: new THREE.Color(0x4a2e2a),
};

const batPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  out.color.copy(COL.body).lerp(COL.collar, Math.min(1, t('chest') * smooth(-0.02, 0.06, p.z) + t('head') * smooth(0.14, 0.12, p.z)) * 0.85);
  // Muzzle furred like the head, bare and dark only at the very nose.
  out.color.lerp(COL.face, Math.min(1, (t('muzzle') + t('chin')) * smooth(0.185, 0.205, p.z)));
  out.color.lerp(COL.nose, t('nose'));
  out.color.lerp(COL.skin, t('skin'));
  out.color.lerp(COL.ear, t('ear'));
  out.color.lerp(COL.earIn, t('earIn'));
  out.color.multiplyScalar(0.9 + 0.2 * fbm3(p.x * 40, p.y * 40, p.z * 40));
  out.fur = 0.016 * (t('body') + t('chest') + t('head')) + 0.008 * t('muzzle') * smooth(0.2, 0.18, p.z);
  out.fur += t('chest') * 0.006;
  out.flow.set(0, -0.2, -1);
  if (t('head') > 0.4) out.flow.set(0, 0.3, -1);
  out.mask = t('nose') * 0.8 + t('muzzle') * 0.4 * smooth(0.19, 0.205, p.z);
  void n;
};

// ---- wings ------------------------------------------------------------------------------------

type Pt = { p: THREE.Vector3; bones: [number, number][] };

/** A polyline through bone points, resampled to `n` segments, each point carrying its bone weights. */
function rib(path: { at: V3; bone: string }[], n: number): Pt[] {
  const len: number[] = [0];
  for (let i = 1; i < path.length; i++) len.push(len[i - 1] + new THREE.Vector3(...path[i].at).distanceTo(new THREE.Vector3(...path[i - 1].at)));
  const L = len[len.length - 1];
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * L;
    let i = 1;
    while (i < path.length - 1 && len[i] < d) i++;
    const u = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
    const a = new THREE.Vector3(...path[i - 1].at), b = new THREE.Vector3(...path[i].at);
    out.push({
      p: a.lerp(b, u),
      bones: [[BAT_RIG.bone(path[i - 1].bone), 1 - u], [BAT_RIG.bone(path[i].bone), u]],
    });
  }
  return out;
}

/** A membrane strip between two ribs, `m` rows across, sagging a little between them. */
function strip(A: Pt[], Bp: Pt[], m: number, sag: number, uv0: number) {
  const P: number[] = [], SI: number[] = [], SW: number[] = [], UV: number[] = [], idx: number[] = [];
  const n = A.length - 1;
  for (let j = 0; j <= m; j++) {
    const v = j / m;
    for (let i = 0; i <= n; i++) {
      const a = A[i], b = Bp[i];
      const p = a.p.clone().lerp(b.p, v);
      p.y -= Math.sin(Math.PI * v) * sag * Math.sin(Math.PI * (i / n)) * a.p.distanceTo(b.p);
      P.push(p.x, p.y, p.z);
      // Bone weights: blend both ribs' bones, keep the strongest four.
      const w = new Map<number, number>();
      for (const [bi, bw] of a.bones) w.set(bi, (w.get(bi) ?? 0) + bw * (1 - v));
      for (const [bi, bw] of b.bones) w.set(bi, (w.get(bi) ?? 0) + bw * v);
      const top = [...w.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((s, x) => s + x[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        SI.push(top[k]?.[0] ?? 0);
        SW.push(top[k] ? top[k][1] / sum : 0);
      }
      UV.push(i / n, uv0 + v);
    }
  }
  const row = n + 1;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  return g;
}

function wing(side: 'L' | 'R') {
  const s = side === 'L' ? 1 : -1;
  const at = (b: string) => ({ at: B(b), bone: b });
  const N = 10;
  const finger = (d: string) => rib([at(`wr${side}`), at(`d${d}${side}`), at(`d${d}${side}t`)], N);
  const r2 = finger('2'), r3 = finger('3'), r4 = finger('4'), r5 = finger('5');
  // The big inner panel: arm and little finger on one side, body, leg and trailing edge on the other.
  const trail: V3 = [s * 0.3, 0.0, -0.3];
  const armEdge = rib([at(`sh${side}`), at(`el${side}`), at(`wr${side}`), at(`d5${side}`), at(`d5${side}t`)], 16);
  const bodyEdge = rib([{ at: [s * 0.05, 0.01, 0.06], bone: 'body' }, { at: [s * 0.055, -0.01, -0.08], bone: 'body' }, at(`foot${side}`), { at: trail, bone: `foot${side}` }, at(`d5${side}t`)], 16);
  // The tail membrane: leg to tail.
  const leg = rib([at(`leg${side}`), at(`foot${side}`)], 6);
  const tail = rib([at('tail'), at('tailT')], 6);
  const parts = [strip(r2, r3, 5, 0.05, 0), strip(r3, r4, 6, 0.06, 1), strip(r4, r5, 5, 0.06, 2), strip(armEdge, bodyEdge, 10, 0.05, 3), strip(leg, tail, 4, 0.04, 4)];
  return parts;
}

/** Finger and arm bones: thin tubes along the bone chains. */
function boneTubes(side: 'L' | 'R') {
  const out: THREE.BufferGeometry[] = [];
  const chain = (names: string[], r0: number, r1: number) => {
    for (let i = 0; i < names.length - 1; i++) {
      const a = new THREE.Vector3(...B(names[i])), b = new THREE.Vector3(...B(names[i + 1]));
      const len = a.distanceTo(b);
      const ra = r0 + (r1 - r0) * (i / (names.length - 1)), rb = r0 + (r1 - r0) * ((i + 1) / (names.length - 1));
      const g = new THREE.CylinderGeometry(rb, ra, len, 6, 1, false);
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      g.translate(a.x, a.y, a.z);
      const k = new THREE.SphereGeometry(ra * 1.25, 6, 4);
      k.translate(a.x, a.y, a.z);
      for (const piece of [g, k]) out.push(rigidPart(piece, BAT_RIG.bone(names[i]), 0x2b1f1b));
    }
  };
  chain([`sh${side}`, `el${side}`, `wr${side}`], 0.011, 0.008);
  for (const d of ['2', '3', '4', '5']) chain([`wr${side}`, `d${d}${side}`, `d${d}${side}t`], 0.006, 0.0025);
  // Thumb claw.
  const w = B(`wr${side}`);
  const s = side === 'L' ? 1 : -1;
  out.push(rigidPart(tuskGeometry([[w[0], w[1], w[2]], [w[0] + s * 0.01, w[1] + 0.012, w[2] + 0.025], [w[0] + s * 0.004, w[1] + 0.005, w[2] + 0.04]], 0.006, 0.0015, 8, 6, [0x2a1d18, 0x0d0907]), BAT_RIG.bone(`wr${side}`), 0x1a1210));
  return out;
}

export interface BatGeometry {
  body: THREE.BufferGeometry;
  fur: THREE.BufferGeometry;
  wings: THREE.BufferGeometry;
  bones: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  fangs: THREE.BufferGeometry;
  ms: number;
}

let cached: BatGeometry | null = null;
export function provideBatGeometry(g: BatGeometry) {
  cached = g;
}

export function batGeometry(): BatGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const body = buildGroup(BAT_RIG, { parts: bodyParts(), cell: 0.0045, paint: batPaint, skinR: 0.02, aoR: 0.03, aoStrength: 0.9 }, false);
  const fur = growTufts(body.geometry, {
    shape: 'hair', budget: 2600, minLen: 0.006, lift: 0.3, droop: 0.15, widthK: 0.25, minW: 0.0025, maxW: 0.005, overlap: 2.4,
    root: 0.65, tip: 1.35, vary: 0.15, grizzle: 0.2, grizzleTint: 0xb08a5a, seed: 3,
  });
  const wingParts = [...wing('L'), ...wing('R')];
  const wings = mergeGeometries(wingParts)!;
  wings.computeVertexNormals();
  const tubes = mergeGeometries([...boneTubes('L'), ...boneTubes('R')].map(strip3))!;
  const eyes: THREE.BufferGeometry[] = [];
  const fangs: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.0085, 10, 8);
    e.translate(s * 0.027, 0.043, 0.184);
    eyes.push(strip3(rigidPart(e, BAT_RIG.bone('head'), 0x0a0605)));
    fangs.push(strip3(rigidPart(tuskGeometry([[s * 0.009, 0.004, 0.198], [s * 0.009, -0.007, 0.201], [s * 0.007, -0.014, 0.198]], 0.0035, 0.0008, 6, 6, [0xd8ceb6, 0xf2ecdc]), BAT_RIG.bone('head'), 0xeeeeee)));
  }
  cached = { body: body.geometry, fur, wings, bones: tubes, eyes: mergeGeometries(eyes)!, fangs: mergeGeometries(fangs)!, ms: performance.now() - t0 };
  return cached;
}

function strip3(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** Leathery wing skin: dark, softly translucent toward the light, veined. */
export function membraneMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2e1d1a, roughness: 0.72, side: THREE.DoubleSide, emissive: new THREE.Color(0x2a0c06), emissiveIntensity: 0.45 });
  m.userData.styleRim = 0.35;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        // Veins running out along each panel, and a darker trailing edge.
        float vein = smoothstep(0.035, 0.0, abs(fract(vMapUv.y * 3.0 + vMapUv.x * 0.3) - 0.5) - 0.44);
        float edge = smoothstep(0.85, 1.0, fract(vMapUv.y));
        diffuseColor.rgb *= 1.0 - vein * 0.35 - edge * 0.15;
        diffuseColor.rgb *= 0.9 + 0.2 * fract(sin(dot(floor(vMapUv * 60.0), vec2(12.9898, 78.233))) * 43758.5453);
      }`);
  };
  m.customProgramCacheKey = () => 'bat-membrane';
  // uv is needed in the fragment shader: a 1x1 map turns it on without changing colour.
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  m.map = tex;
  return m;
}
