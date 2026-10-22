import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGroup, rigidPart, type PaintFn } from '../kit/body';
import type { Part, Shape, V3 } from '../kit/sdf';
import { fbm3, noise3, smooth } from '../kit/noise';
import { growTufts } from '../kit/tufts';
import { tuskGeometry } from '../boar/model';
import { WOLF_RIG, wolfParts, type WolfGeometry } from './model';

// Old Greyjaw: a dire wolf of the north woods, and old. Built on the grey
// wolf's frame but heavier everywhere: a hump of muscle over the shoulders
// under a great shaggy mane, a broad skull and heavy jowls, thick forelegs.
// The years show: a silvered muzzle, a coat grizzled almost white along the
// flanks, scars raked across the muzzle and down over the left eye (milky
// and blind), and the right ear torn in a notch. Drawn at about 1.65x a
// grey wolf.

/** Deeper chest, a hump over the shoulders, a heavier waist. [z, top, bottom, half width] */
const TORSO: [number, number, number, number][] = [
  [-0.67, 0.8, 0.66, 0.04],
  [-0.61, 0.845, 0.6, 0.095],
  [-0.49, 0.875, 0.565, 0.14],
  [-0.31, 0.87, 0.58, 0.138],
  [-0.12, 0.89, 0.53, 0.152],
  [0.05, 0.925, 0.45, 0.17],
  [0.2, 0.955, 0.415, 0.178],
  [0.33, 0.945, 0.44, 0.162],
  [0.43, 0.9, 0.54, 0.118],
];

const grow = (s: Shape, k: number): Shape => {
  if (s.k === 'cone') return { ...s, ra: s.ra * k, rb: s.rb * k };
  if (s.k === 'ball') return { ...s, r: s.r * k };
  if (s.k === 'ell') return { ...s, r: [s.r[0] * k, s.r[1] * k, s.r[2] * k] };
  return s;
};

const SCARS: [V3, V3][] = [
  [[0.03, 0.885, 0.735], [0.072, 0.84, 0.79]],
  [[0.022, 0.873, 0.77], [0.062, 0.828, 0.82]],
  [[0.018, 0.86, 0.805], [0.05, 0.818, 0.85]],
  [[0.032, 0.965, 0.655], [0.072, 0.86, 0.74]],
];
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
/** Distance from p to the nearest scar line (m). */
function scarDist(p: THREE.Vector3) {
  let best = 1;
  for (const [a, b] of SCARS) {
    _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _ap.set(p.x - a[0], p.y - a[1], p.z - a[2]);
    const t = THREE.MathUtils.clamp(_ap.dot(_ab) / _ab.lengthSq(), 0, 1);
    best = Math.min(best, _ap.addScaledVector(_ab, -t).length());
  }
  return best;
}

function greyjawParts(): Part[] {
  const base = wolfParts();
  const out: Part[] = [];
  for (const p of base) {
    const t = p.tag ?? '';
    if (p.shape.k === 'loft' && t === 'body') {
      out.push({ ...p, shape: { k: 'loft', slices: TORSO, egg: 0.32 } });
      continue;
    }
    if (p.carve) {
      out.push(p);
      continue;
    }
    // Thicker legs and neck, a broader skull and jowls.
    const k = t === 'leg' ? 1.16 : t === 'paw' ? 1.14 : t === 'neck' ? 1.18 : t === 'head' ? 1.1 : t === 'cheek' ? 1.25 : t === 'body' ? 1.08 : 1;
    out.push(k === 1 ? p : { ...p, shape: grow(p.shape, k) });
  }
  // Shoulder hump: the muscle a dire wolf carries its head with.
  out.push({ shape: { k: 'ell', c: [0, 0.93, 0.27], r: [0.13, 0.07, 0.17] }, bone: 'chest', tag: 'body', blend: 0.1 });
  // Heavy brow ridge and a deeper lower jaw.
  out.push({ shape: { k: 'ell', c: [0, 0.94, 0.675], r: [0.06, 0.018, 0.03] }, bone: 'head', tag: 'head', blend: 0.03 });
  out.push({ shape: { k: 'ell', c: [0, 0.765, 0.765], r: [0.042, 0.028, 0.09] }, bone: 'jaw', tag: 'lip', blend: 0.02 });
  // Scars: three rakes across the left of the muzzle, one down through the left eye.
  for (const [a, b] of SCARS) out.push({ shape: { k: 'cone', a, b, ra: 0.0055, rb: 0.0035 }, bone: 'head', tag: 'scar', blend: 0.004, carve: true });
  // The torn right ear: a bite out of its edge.
  const ear: V3 = [-0.052, 0.93, 0.6];
  out.push({ shape: { k: 'ball', c: [ear[0] - 0.026, ear[1] + 0.075, ear[2]], r: 0.024 }, bone: 'earR', tag: 'ear', blend: 0.004, carve: true, xf: { at: ear, rot: [-0.15, 0.35, 0.22], scale: [1, 1, 0.42] } });
  return out;
}

function displace(x: number, y: number, z: number, d: number) {
  if (d > 0.04) return d;
  return d + (fbm3(x * 9, y * 9, z * 9, 2) - 0.5) * 0.011;
}

const C = {
  saddle: new THREE.Color(0x221e1a),
  side: new THREE.Color(0x76695a),
  silver: new THREE.Color(0xb9b0a0),
  cream: new THREE.Color(0xd4c9b4),
  legs: new THREE.Color(0x8a7862),
  paw: new THREE.Color(0x4a4038),
  muzzle: new THREE.Color(0xa89e8e),
  nose: new THREE.Color(0x121010),
  lip: new THREE.Color(0x221d1b),
  scar: new THREE.Color(0x8a5c55),
  earIn: new THREE.Color(0xb8aa96),
  tailTip: new THREE.Color(0x1a1817),
};
const _c = new THREE.Color();

const greyjawPaint: PaintFn = (p, n, tag, out) => {
  const t = tag;
  const legs = t('leg') + t('paw');
  const under = smooth(0.1, -0.5, n.y) * smooth(0.13, 0.03, Math.abs(p.x) - 0.02);
  const back = smooth(-0.15, 0.55, n.y) * smooth(-0.66, -0.45, p.z) * smooth(0.52, 0.3, p.z);
  const broken = back * smooth(0.25, 0.55, fbm3(p.x * 8, p.y * 8, p.z * 8) * 0.6 + back * 0.6);
  // Grizzled flanks: grey shot through with near-white, a charcoal saddle.
  const griz = smooth(0.35, 0.75, fbm3(p.x * 22 + 3, p.y * 22, p.z * 22));
  out.color.copy(C.side).lerp(C.silver, griz * 0.45).lerp(C.saddle, broken * 0.9);
  out.color.lerp(C.cream, Math.min(1, under * 0.9));
  out.color.lerp(_c.copy(C.legs).lerp(C.cream, smooth(0.3, 0.05, p.y) * 0.25), Math.min(1, legs));
  out.color.lerp(C.paw, t('paw') * 0.7);
  // Face: a silvered old muzzle, a dark bridge, pale round the eyes.
  const face = t('head') + t('muzzle') + t('cheek');
  if (face > 0.2) {
    const mask = smooth(0.06, 0.02, Math.abs(Math.abs(p.x) - 0.045)) * smooth(0.82, 0.9, p.y) * smooth(0.66, 0.74, p.z);
    _c.copy(C.side).lerp(C.saddle, smooth(0.0, 0.03, -Math.abs(p.x) + 0.035) * smooth(0.64, 0.74, p.z) * 0.7);
    _c.lerp(C.muzzle, smooth(0.7, 0.8, p.z) * 0.85);
    _c.lerp(C.cream, Math.min(1, mask * 0.85 + smooth(0.83, 0.78, p.y) * 0.9));
    out.color.lerp(_c, Math.min(1, face));
  }
  out.color.lerp(C.nose, t('nose'));
  out.color.lerp(C.lip, t('lip') * smooth(0.79, 0.765, p.y));
  // Scars, bare and pink-brown; dark rims round the eyes.
  const scar = p.z > 0.6 ? smooth(0.011, 0.005, scarDist(p)) : 0;
  out.color.lerp(C.scar, scar);
  const eyeD = Math.hypot(Math.abs(p.x) - 0.049, p.y - 0.903, p.z - 0.72);
  const rim = smooth(0.036, 0.024, eyeD);
  out.color.lerp(C.lip, rim * 0.92);
  out.color.lerp(C.silver, t('ear') * 0.3);
  out.color.lerp(C.earIn, t('earIn'));
  if (t('tail') > 0.2) {
    _c.copy(C.side).lerp(C.silver, griz * 0.5).lerp(C.saddle, smooth(0.2, 0.8, n.y) * 0.6).lerp(C.tailTip, smooth(0.5, 0.42, p.y));
    out.color.lerp(_c, t('tail'));
  }
  out.color.multiplyScalar(0.9 + 0.18 * noise3(p.x * 30, p.y * 30, p.z * 30));

  // Fur: a great mane over the neck, shoulders and chest; a shaggy coat; long breeches.
  const mane = t('neck') + smooth(0.18, 0.4, p.z) * smooth(0.6, 0.8, p.y) * t('body') + smooth(0.3, 0.45, p.z) * smooth(0.6, 0.45, p.y) * t('body') * 0.6;
  let fur = 0.055 + noise3(p.x * 16, p.y * 16, p.z * 16) * 0.02;
  fur += Math.min(1, mane) * 0.05;
  fur += under * 0.035;
  fur += t('body') * smooth(-0.38, -0.56, p.z) * smooth(0.78, 0.55, p.y) * 0.045;
  fur = fur * (1 - Math.min(1, legs)) + Math.min(1, legs) * (0.016 * smooth(0.1, 0.32, p.y) + 0.016);
  fur = fur * (1 - Math.min(1, face)) + Math.min(1, face) * (0.013 + 0.028 * t('cheek') * smooth(0.0, -0.6, n.z - 0.2));
  fur = fur * (1 - t('muzzle')) + t('muzzle') * 0.016 * smooth(0.9, 0.82, p.z);
  fur *= 1 - Math.min(1, t('nose') + t('lip') * 0.7 + t('earIn') + t('paw') * 0.6 + scar * 1.4 + smooth(0.03, 0.019, eyeD));
  fur = fur * (1 - t('ear')) + t('ear') * 0.014;
  fur = fur * (1 - t('tail')) + t('tail') * (0.12 + 0.03 * smooth(0.7, 0.45, p.y));
  out.fur = Math.max(0, fur);

  out.flow.set(0, -0.25, -1);
  if (mane > 0.3) out.flow.set(n.x * 0.7, -0.55, -0.55);
  if (legs > 0.3) out.flow.set(0, -1, -0.1);
  if (face > 0.3) out.flow.set(0, 0.1, -1);
  if (t('tail') > 0.3) out.flow.set(0, -0.6, -1);
  out.mask = t('nose') * 0.9 + t('lip') * 0.4 + scar * 0.3;
};

export interface GreyjawGeometry extends WolfGeometry {
  /** the milky left eye */
  blind: THREE.BufferGeometry;
}

let cached: GreyjawGeometry | null = null;
export function provideGreyjawGeometry(g: GreyjawGeometry) {
  cached = g;
}

export function greyjawGeometry(): GreyjawGeometry {
  if (cached) return cached;
  const t0 = performance.now();
  const g = buildGroup(WOLF_RIG, { parts: greyjawParts(), cell: 0.0105, displace, paint: greyjawPaint, skinR: 0.045, aoR: 0.09, aoStrength: 1.1 });
  const coat = growTufts(g.geometry, {
    budget: 17000, minLen: 0.011, lift: 0.18, droop: 0.22, widthK: 0.26, minW: 0.0045, maxW: 0.016, overlap: 3.4,
    root: 0.55, tip: 1.12, vary: 0.16, grizzle: 0.32, grizzleTint: 0xd6ccb8, seed: 53,
    liftAt: (p, _n, f) => (f > 0.08 && p.z > 0.15 ? 0.28 : 0.18),
  });
  const brush = growTufts(g.geometry, {
    budget: 1600, minLen: 0.09, lift: 0.42, droop: 0.18, widthK: 0.32, minW: 0.013, maxW: 0.034, overlap: 6,
    root: 0.6, tip: 1.12, vary: 0.14, grizzle: 0.3, grizzleTint: 0xd6ccb8, seed: 59,
    where: (p) => p.z < -0.6 && p.y < 0.8,
  });
  const head = WOLF_RIG.bone('head'), jaw = WOLF_RIG.bone('jaw');
  const teeth: THREE.BufferGeometry[] = [];
  const ivory: [number, number] = [0xc8b894, 0xe8dfc8];
  for (const s of [1, -1]) {
    // Long yellowed canines (the left upper broken short).
    const up = s > 0 ? 0.788 : 0.772;
    teeth.push(rigidPart(tuskGeometry([[s * 0.023, 0.802, 0.852], [s * 0.023, 0.786, 0.856], [s * 0.021, up, 0.853]], 0.0068, 0.0016, 6, 6, ivory), head, 0xffffff));
    teeth.push(rigidPart(tuskGeometry([[s * 0.02, 0.77, 0.832], [s * 0.02, 0.786, 0.836], [s * 0.018, 0.797, 0.833]], 0.006, 0.0014, 6, 6, ivory), jaw, 0xffffff));
  }
  const eye = (s: number) => {
    const e = new THREE.SphereGeometry(0.0135, 14, 10);
    e.scale(1, 0.62, 1);
    e.rotateZ(s * 0.25);
    e.translate(s * 0.049, 0.903, 0.724);
    return strip(rigidPart(e, head, 0xffffff));
  };
  const pu = new THREE.SphereGeometry(0.0055, 10, 8);
  pu.scale(1, 1, 0.5);
  pu.translate(-0.053, 0.903, 0.733);
  cached = {
    body: g.geometry,
    far: g.far!,
    coat: mergeGeometries([coat, brush])!,
    teeth: mergeGeometries(teeth.map(strip))!,
    eyes: eye(-1),
    pupils: strip(rigidPart(pu, head, 0x080605)),
    blind: eye(1),
    ms: performance.now() - t0,
  };
  return cached;
}

function strip(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
