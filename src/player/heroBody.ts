import * as THREE from 'three';
import type { Look } from '../npc/charBuilder';

// The hero's own body, made here in code rather than taken from the
// character kit every townsperson is built from. It is skinned to the same
// skeleton (so every animation, the creator's proportions, the origin parts
// and the armour that hangs on bones keep working), but every surface is
// new: a sculpted head with its own face and hair, hands with real fingers,
// and an adventurer's outfit (a tunic in your signature colour under a
// leather jerkin, a belt and pouch, a scarf, bracers, trousers and tall
// boots). Everything is authored in the skeleton's bind space (T-pose,
// metres, +Y up, the hero facing +Z, +X to their left) and turned into mesh
// space at the end.

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** bone weights: [bone index, weight] */
type BoneW = [number, number][];

/** One material's worth of skinned triangles. */
class Part {
  pos: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  vert(p: V3, w: BoneW) {
    const ws = w.filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, [, x]) => s + x, 0) || 1;
    this.pos.push(p.x, p.y, p.z);
    for (let k = 0; k < 4; k++) {
      this.si.push(ws[k]?.[0] ?? 0);
      this.sw.push(ws[k] ? ws[k][1] / tot : 0);
    }
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
}

interface Ring {
  c: V3;
  /** across (rx) and forward (rz) directions of the cross-section */
  u: V3;
  v: V3;
  rx: number;
  rz: number;
  /** superellipse exponent: 2 is an ellipse, higher is boxier */
  n?: number;
  /** extra forward fullness (chest, calves) */
  front?: number;
  /** extra fullness behind */
  back?: number;
  w: BoneW | ((p: V3) => BoneW);
}

/**
 * A tube through rings (each ring a superellipse). `arc` leaves a gap (an open
 * jerkin front): only angles in [a0, a1] are built. Caps close the ends.
 */
function sweep(part: Part, rings: Ring[], seg = 18, o: { capStart?: boolean; capEnd?: boolean; arc?: [number, number] } = {}) {
  const open = !!o.arc;
  const [a0, a1] = o.arc ?? [0, Math.PI * 2];
  const cols = open ? seg + 1 : seg;
  const grid: number[][] = [];
  for (const r of rings) {
    const row: number[] = [];
    const n = r.n ?? 2;
    for (let j = 0; j < cols; j++) {
      const t = a0 + ((a1 - a0) * j) / seg;
      const c = Math.cos(t), s = Math.sin(t);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      const fz = ez > 0 ? r.rz + (r.front ?? 0) * ez * ez : r.rz + (r.back ?? 0) * ez * ez;
      const p = r.c.clone().addScaledVector(r.u, ex * r.rx).addScaledVector(r.v, ez * fz);
      row.push(part.vert(p, typeof r.w === 'function' ? r.w(p) : r.w));
    }
    grid.push(row);
  }
  // Winding: outward whatever the frame's handedness.
  const r0 = rings[0], r1 = rings[Math.min(1, rings.length - 1)];
  const axis = r1.c.clone().sub(r0.c);
  const flip = new THREE.Vector3().crossVectors(r0.u, r0.v).dot(axis) < 0;
  for (let i = 0; i + 1 < grid.length; i++) {
    for (let j = 0; j < (open ? seg : cols); j++) {
      const j1 = open ? j + 1 : (j + 1) % cols;
      const a = grid[i][j], b = grid[i][j1], c = grid[i + 1][j], d = grid[i + 1][j1];
      if (flip) {
        part.tri(a, c, b);
        part.tri(b, c, d);
      } else {
        part.tri(a, b, c);
        part.tri(b, d, c);
      }
    }
  }
  const cap = (ring: Ring, row: number[], start: boolean) => {
    const w = typeof ring.w === 'function' ? ring.w(ring.c) : ring.w;
    const ci = part.vert(ring.c, w);
    for (let j = 0; j < row.length - (open ? 1 : 0); j++) {
      const a = row[j], b = row[(j + 1) % row.length];
      if (start !== flip) part.tri(ci, b, a);
      else part.tri(ci, a, b);
    }
  };
  if (o.capStart) cap(rings[0], grid[0], true);
  if (o.capEnd) cap(rings[rings.length - 1], grid[grid.length - 1], false);
}

/** Add a plain geometry (in bind space) to a part, every vertex with the same weights (or by position). */
function addGeo(part: Part, g: THREE.BufferGeometry, w: BoneW | ((p: V3) => BoneW)) {
  const src = g.index ? g : g.toNonIndexed();
  const pos = src.attributes.position as THREE.BufferAttribute;
  const base = part.pos.length / 3;
  const p = V();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    part.vert(p, typeof w === 'function' ? w(p) : w);
  }
  if (src.index) for (let i = 0; i < src.index.count; i++) part.idx.push(base + src.index.getX(i));
  else for (let i = 0; i < pos.count; i++) part.idx.push(base + i);
}

/** A frame for a limb pointing along `axis` (u across, v roughly forward/up). */
function frame(axis: V3) {
  const a = axis.clone().normalize();
  const ref = Math.abs(a.y) > 0.7 ? V(0, 0, 1) : V(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ref, a).normalize();
  const v = new THREE.Vector3().crossVectors(a, u).normalize();
  return { a, u, v };
}

/**
 * A limb along joints: `radius(t, k)` gives [across, forward] radii at
 * fraction t of segment k; each joint blends the two bones either side of it.
 */
function limb(part: Part, joints: V3[], bones: number[], radius: (t: number, k: number) => [number, number], o: { steps?: number[]; blend?: number; seg?: number; capStart?: boolean; capEnd?: boolean; startW?: BoneW; n?: number; extend?: [number, number] } = {}) {
  const rings: Ring[] = [];
  const blend = o.blend ?? 0.05;
  const nseg = joints.length - 1;
  for (let k = 0; k < nseg; k++) {
    const A = joints[k], B = joints[k + 1];
    const { u, v } = frame(B.clone().sub(A));
    const steps = o.steps?.[k] ?? 5;
    const len = A.distanceTo(B);
    for (let s = 0; s <= steps; s++) {
      if (k > 0 && s === 0) continue;
      let t = s / steps;
      // Optionally start before the first joint / run past the last.
      const ext0 = k === 0 && s === 0 ? -(o.extend?.[0] ?? 0) / len : 0;
      const ext1 = k === nseg - 1 && s === steps ? (o.extend?.[1] ?? 0) / len : 0;
      t += ext0 + ext1;
      const c = A.clone().lerp(B, t);
      const [rx, rz] = radius(Math.max(0, Math.min(1, t)), k);
      // Weights: this segment's bone, blended toward the neighbour near each joint.
      const dA = t * len, dB = (1 - t) * len;
      const w: BoneW = [[bones[k], 1]];
      if (k > 0 && dA < blend) {
        const x = 0.5 * (1 - dA / blend);
        w[0][1] = 1 - x;
        w.push([bones[k - 1], x]);
      } else if (k === 0 && o.startW && dA < blend) {
        const x = 0.5 * (1 - Math.max(0, dA) / blend);
        w[0][1] = 1 - x;
        for (const [b, ww] of o.startW) w.push([b, x * ww]);
      }
      if (dB < blend && bones[k + 1] !== undefined) {
        const x = 0.5 * (1 - dB / blend);
        w[0][1] *= 1 - x;
        w.push([bones[k + 1], x]);
      }
      rings.push({ c, u, v, rx, rz, n: o.n, w });
    }
  }
  sweep(part, rings, o.seg ?? 14, { capStart: o.capStart, capEnd: o.capEnd });
}

// ---- materials ---------------------------------------------------------------------------------

const BASE_SKIN = new THREE.Color(0xd99870);

/** A soft woven / grained texture so flat colours read as cloth and leather. */
let grainTex: THREE.CanvasTexture | null = null;
function grain() {
  if (grainTex) return grainTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 64);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const weave = ((x + y) % 4 < 2 ? 1 : 0.94) * ((x % 3 === 0) ? 0.97 : 1);
    const v = Math.round(255 * weave * (0.9 + rnd() * 0.1));
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTex = new THREE.CanvasTexture(c);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.colorSpace = THREE.SRGBColorSpace;
  return grainTex;
}

function material(color: THREE.ColorRepresentation, o: { rough?: number; metal?: number; grain?: boolean; name: string; side?: THREE.Side }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide });
  if (o.grain) m.roughnessMap = grain();
  m.name = o.name;
  m.userData.styleRim = 0.5; // (characters take a brighter rim, like the cast)
  return m;
}

// ---- the body ------------------------------------------------------------------------------------

/**
 * Replace the kit meshes on a built hero with the hero's own body.
 * `model` is the built character's model; its skinned meshes share one skeleton.
 */
export function dressHero(model: THREE.Object3D, look: Look) {
  const kit: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) kit.push(o as THREE.SkinnedMesh);
  });
  const anchor = kit.find((m) => m.skeleton.bones.length > 40) ?? kit[0];
  if (!anchor) return;
  const skeleton = anchor.skeleton;
  const bi = new Map(skeleton.bones.map((b, i) => [b.name, i]));
  const B = (n: string) => bi.get(n) ?? 0;
  const bindPos = skeleton.boneInverses.map((m) => V().setFromMatrixPosition(m.clone().invert()));
  const J = (n: string) => bindPos[B(n)].clone();

  const female = look.body === 'female';
  const parts = {
    skin: new Part(), tunic: new Part(), leather: new Part(), dark: new Part(), trousers: new Part(), boots: new Part(),
    metal: new Part(), scarf: new Part(), hair: new Part(), eye: new Part(), white: new Part(), mouth: new Part(),
  };

  // ---- torso ----
  const pelvis = J('pelvis'), s1 = J('spine_01'), s2 = J('spine_02'), s3 = J('spine_03'), neck = J('neck_01'), head = J('Head');
  const ua = { l: J('upperarm_l'), r: J('upperarm_r') };
  const shoulderY = ua.l.y;
  /** spine weights by height, with the shoulders handing over to the collarbones and arms */
  const spineW = (p: V3): BoneW => {
    const ys: [number, number][] = [[pelvis.y, B('pelvis')], [s1.y, B('spine_01')], [s2.y, B('spine_02')], [s3.y, B('spine_03')], [neck.y, B('neck_01')]];
    let w: BoneW = [[ys[ys.length - 1][1], 1]];
    if (p.y <= ys[0][0]) w = [[ys[0][1], 1]];
    else for (let k = 0; k + 1 < ys.length; k++) {
      if (p.y <= ys[k + 1][0]) {
        const t = (p.y - ys[k][0]) / (ys[k + 1][0] - ys[k][0]);
        w = [[ys[k][1], 1 - t], [ys[k + 1][1], t]];
        break;
      }
    }
    const side = p.x > 0 ? 'l' : 'r';
    const sh = smooth(0.09, 0.17, Math.abs(p.x)) * smooth(shoulderY - 0.14, shoulderY - 0.02, p.y);
    if (sh > 0) {
      w = w.map(([b, x]) => [b, x * (1 - sh)] as [number, number]);
      w.push([B('clavicle_' + side), sh * 0.55], [B('upperarm_' + side), sh * 0.45]);
    }
    return w;
  };
  // Width (rx), depth (rz) and centre z of the body at a height.
  const T: [number, number, number, number, number?][] = female
    ? [[pelvis.y - 0.1, 0.165, 0.115, -0.03], [pelvis.y, 0.17, 0.115, -0.03], [s1.y, 0.142, 0.1, -0.015], [s2.y, 0.135, 0.098, -0.005], [s3.y - 0.02, 0.15, 0.1, 0.0, 0.035], [s3.y + 0.07, 0.158, 0.1, -0.005, 0.03], [shoulderY - 0.02, 0.15, 0.09, -0.025], [neck.y - 0.03, 0.09, 0.07, -0.03]]
    : [[pelvis.y - 0.1, 0.16, 0.115, -0.03], [pelvis.y, 0.165, 0.115, -0.03], [s1.y, 0.155, 0.108, -0.012], [s2.y, 0.162, 0.115, 0.0], [s3.y - 0.02, 0.18, 0.125, 0.005, 0.01], [s3.y + 0.07, 0.19, 0.12, -0.005, 0.005], [shoulderY - 0.02, 0.175, 0.1, -0.03], [neck.y - 0.03, 0.095, 0.075, -0.035]];
  const torso = (lift: number, from: number, to: number) => {
    const rings: Ring[] = [];
    for (const [y, rx, rz, z, front] of T) {
      if (y < from - 1e-3 || y > to + 1e-3) continue;
      rings.push({ c: V(0, y, z), u: V(1, 0, 0), v: V(0, 0, 1), rx: rx + lift, rz: rz + lift, n: 2.4, front: front ?? 0, w: spineW });
    }
    return rings;
  };
  // The tunic is the body's surface from hip to neck.
  sweep(parts.tunic, torso(0, -9, 9), 22, { capEnd: true });
  // Hips/seat in trouser cloth, closing the bottom.
  sweep(parts.trousers, [
    { c: V(0, pelvis.y - 0.1, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.162, rz: 0.113, n: 2.4, w: [[B('pelvis'), 1]] },
    { c: V(0, pelvis.y - 0.16, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.12, rz: 0.09, n: 2.4, w: [[B('pelvis'), 1]] },
  ], 22, { capEnd: true });
  // Leather jerkin over it, open in a V at the front.
  const jRings = torso(0.012, pelvis.y - 0.001, shoulderY - 0.02);
  sweep(parts.leather, jRings, 24, { arc: [Math.PI / 2 + 0.38, Math.PI / 2 + Math.PI * 2 - 0.38] });
  // Jerkin skirt: four tabs over the hips (front and back follow the pelvis, the sides the thighs).
  const tabs: [number, number, string][] = [[Math.PI / 2, 0.9, 'pelvis'], [-Math.PI / 2, 0.9, 'pelvis'], [0, 0.75, 'thigh_l'], [Math.PI, 0.75, 'thigh_r']];
  for (const [ang, span, bone] of tabs) {
    const top = pelvis.y + 0.03, bot = pelvis.y - (female ? 0.2 : 0.18);
    const rings: Ring[] = [];
    for (let k = 0; k <= 3; k++) {
      const y = top + (bot - top) * (k / 3);
      const flare = 0.016 + k * 0.012;
      rings.push({ c: V(0, y, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.17 + flare, rz: 0.118 + flare, n: 2.4, w: (p) => {
        const d = k / 3;
        const thigh = p.x > 0 ? 'thigh_l' : 'thigh_r';
        return bone === 'pelvis' ? [[B('pelvis'), 1 - d * 0.35], [B(thigh), d * 0.35]] : [[B('pelvis'), 1 - d * 0.75], [B(bone), d * 0.75]];
      } });
    }
    sweep(parts.leather, rings, 6, { arc: [ang - span / 2, ang + span / 2] });
  }
  // Belt, buckle and a pouch on the right hip.
  const beltY = pelvis.y + 0.035;
  sweep(parts.dark, [
    { c: V(0, beltY - 0.028, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.192, rz: 0.139, n: 2.4, w: [[B('pelvis'), 1]] },
    { c: V(0, beltY + 0.028, -0.03), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.192, rz: 0.139, n: 2.4, w: [[B('pelvis'), 1]] },
  ], 24);
  addGeo(parts.metal, new THREE.BoxGeometry(0.062, 0.05, 0.014).translate(0, beltY, -0.03 + 0.139 + 0.006), [[B('pelvis'), 1]]);
  addGeo(parts.dark, new THREE.BoxGeometry(0.03, 0.03, 0.016).translate(0, beltY, -0.03 + 0.139 + 0.012), [[B('pelvis'), 1]]);
  addGeo(parts.leather, new THREE.BoxGeometry(0.075, 0.085, 0.05).translate(-0.17, beltY - 0.07, 0.04), [[B('pelvis'), 0.7], [B('thigh_r'), 0.3]]);
  addGeo(parts.metal, new THREE.SphereGeometry(0.009, 8, 6).translate(-0.17, beltY - 0.04, 0.067), [[B('pelvis'), 0.7], [B('thigh_r'), 0.3]]);
  // A crossing strap, chest to hip (for a sword on the back).
  for (let k = 0; k < 1; k++) {
    const a = V(0.15, shoulderY - 0.03, 0), b = V(-0.15, beltY + 0.02, 0);
    const rings: Ring[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const p = a.clone().lerp(b, t);
      // Lie on the jerkin: find the body's half-depth at this height.
      const row = T.reduce((best, r) => (Math.abs(r[0] - p.y) < Math.abs(best[0] - p.y) ? r : best));
      const z = row[3] + (row[2] + 0.02) * Math.sqrt(Math.max(0, 1 - (p.x / (row[1] + 0.03)) ** 2));
      rings.push({ c: V(p.x, p.y, z), u: V(-0.7, -0.7, 0).normalize(), v: V(0, 0, 1), rx: 0.022, rz: 0.004, n: 4, w: spineW });
    }
    sweep(parts.dark, rings, 8);
  }
  // Scarf: a thick soft roll at the base of the neck, one tail down the front.
  sweep(parts.scarf, [0, 1, 2, 3].map((k): Ring => ({
    c: V(0, neck.y - 0.055 + k * 0.022, -0.03 + 0.004 * k), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.098 - k * 0.006 + (k === 1 || k === 2 ? 0.012 : 0), rz: 0.086 - k * 0.005 + (k === 1 || k === 2 ? 0.012 : 0), n: 2.2,
    w: [[B('spine_03'), 0.6 - k * 0.12], [B('neck_01'), 0.4 + k * 0.12]],
  })), 20);
  sweep(parts.scarf, [0, 1, 2, 3].map((k): Ring => ({
    c: V(0.04 - k * 0.004, neck.y - 0.07 - k * 0.07, T[T.length - 2][3] + T[T.length - 2][2] + 0.03 - k * 0.006), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.03 - k * 0.002, rz: 0.008, n: 3,
    w: [[B('spine_03'), 1]],
  })), 8, { capEnd: true });

  // ---- neck and head ----
  const headC = head.clone().add(V(0, 0.085, 0.015));
  limb(parts.skin, [V(0, neck.y - 0.05, -0.035), V(0, head.y + 0.02, -0.02)], [B('neck_01'), B('Head')], () => [female ? 0.042 : 0.05, female ? 0.042 : 0.048], { steps: [4], blend: 0.05 });
  const H: BoneW = [[B('Head'), 1]];
  const hx = female ? 0.08 : 0.085, hy = female ? 0.105 : 0.11, hz = female ? 0.092 : 0.096;
  {
    const g = new THREE.SphereGeometry(1, 36, 28);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Jaw narrows below the cheekbones; the chin comes forward; the back of the skull is rounder.
      const low = smooth(0.1, -0.9, y);
      x *= 1 - low * (female ? 0.32 : 0.24);
      if (z > 0) z *= 1 + low * 0.06 - smooth(0.2, 0.95, y) * 0.08;
      else z *= 1.06 - low * 0.1;
      // Cheekbones and brow.
      x *= 1 + Math.exp(-((y - 0.05) ** 2) / 0.02) * 0.05 * Math.max(0, z);
      if (z > 0.6 && y > 0.12 && y < 0.38) z += 0.03 * (1 - Math.abs(x)); // brow ridge
      // Eye sockets: a slight hollow either side of the nose.
      const eyeY = 0.08;
      for (const s of [-1, 1]) {
        const d = (x - s * 0.36) ** 2 / 0.025 + (y - eyeY) ** 2 / 0.02;
        if (z > 0.5) z -= Math.exp(-d) * 0.06;
      }
      p.setXYZ(i, x * hx, y * hy, z * hz);
    }
    g.translate(headC.x, headC.y, headC.z);
    addGeo(parts.skin, g, H);
  }
  // Nose, ears.
  const faceZ = headC.z + hz;
  addGeo(parts.skin, new THREE.SphereGeometry(1, 10, 8).scale(female ? 0.011 : 0.013, female ? 0.022 : 0.026, female ? 0.017 : 0.02).rotateX(-0.3).translate(headC.x, headC.y - 0.012, faceZ - 0.006), H);
  for (const s of [-1, 1]) {
    addGeo(parts.skin, new THREE.SphereGeometry(1, 10, 8).scale(0.012, female ? 0.026 : 0.03, 0.02).rotateY(s * 0.35).translate(headC.x + s * hx * 0.93, headC.y + 0.0, headC.z - 0.01), H);
  }
  // Eyes (whites and irises: the irises are named "Eye" so an origin's eye colour reaches them), brows, mouth.
  const eyeY = headC.y + 0.08 * hy;
  for (const s of [-1, 1]) {
    const ex = headC.x + s * 0.36 * hx, ez = headC.z + hz * 0.84;
    addGeo(parts.white, new THREE.SphereGeometry(0.0125, 12, 10).scale(1.25, 0.82, 0.6).translate(ex, eyeY, ez), H);
    addGeo(parts.eye, new THREE.SphereGeometry(0.0072, 10, 8).scale(1, 1, 0.45).translate(ex, eyeY, ez + 0.0072), H);
    const brow = new THREE.BoxGeometry(0.03, female ? 0.0045 : 0.007, 0.007).rotateZ(s * (female ? -0.12 : -0.05)).translate(ex + s * 0.002, eyeY + 0.021, headC.z + hz * 1.0 + 0.002);
    addGeo(parts.hair, brow, H);
  }
  addGeo(parts.mouth, new THREE.BoxGeometry(0.03, 0.0035, 0.006).translate(headC.x, headC.y - 0.052, headC.z + hz * 0.905 + 0.001), H);

  // ---- hair ----
  const hairCap = (inflate: number, keep: (x: number, y: number, z: number) => boolean) => {
    const g = new THREE.SphereGeometry(1, 30, 22);
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!;
    const out: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const cx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      if (keep(cx, cy, cz)) out.push(a, b, c);
    }
    g.setIndex(out);
    g.scale(hx * (1 + inflate), hy * (1 + inflate * 0.8), hz * (1 + inflate));
    g.translate(headC.x, headC.y + 0.004, headC.z - 0.004);
    return g;
  };
  // Where hair grows on a scalp: above the brow at the front, above the ears at the sides, to the nape behind.
  const scalp = (x: number, y: number, z: number) => y > (z > 0.35 ? 0.36 + (1 - z) * 0.1 : z > -0.3 ? 0.05 + Math.max(0, z) * 0.6 : -0.45);
  const style = look.hair;
  if (style) {
    const short = style === 'buzzed' || style === 'buzzedfemale';
    addGeo(parts.hair, hairCap(short ? 0.03 : 0.07, scalp), H);
    if (!short) {
      // Volume on top and a fringe swept to one side.
      addGeo(parts.hair, new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(hx * 0.95, hy * 0.36, hz * 0.9).rotateX(-0.25).translate(headC.x, headC.y + hy * 0.62, headC.z - 0.01), H);
      addGeo(parts.hair, new THREE.SphereGeometry(1, 12, 8).scale(hx * 0.62, hy * 0.16, hz * 0.3).rotateZ(-0.35).translate(headC.x + hx * 0.22, headC.y + hy * 0.5, headC.z + hz * 0.78), H);
    }
    if (style === 'long') {
      // A fall of hair down the back to the shoulder blades (it follows the neck and back as it goes).
      const rings: Ring[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const y = headC.y + 0.02 - t * (female ? 0.36 : 0.3);
        const w: BoneW = t < 0.35 ? [[B('Head'), 1]] : t < 0.7 ? [[B('Head'), 0.5], [B('neck_01'), 0.5]] : [[B('neck_01'), 0.4], [B('spine_03'), 0.6]];
        rings.push({ c: V(headC.x, y, headC.z - hz * (0.45 + t * 0.35) - t * 0.02), u: V(1, 0, 0), v: V(0, 0, 1), rx: hx * (1.08 - t * 0.12), rz: 0.04 - t * 0.02, n: 2.2, w });
      }
      sweep(parts.hair, rings, 16, { capEnd: true, arc: [-Math.PI - 0.15, 0.15] });
      // Locks framing the face.
      for (const s of [-1, 1]) limb(parts.hair, [V(headC.x + s * hx * 0.92, headC.y + 0.03, headC.z + hz * 0.25), V(headC.x + s * hx * 0.95, headC.y - 0.12, headC.z + hz * 0.15)], [B('Head'), B('Head')], (t) => [0.02 * (1 - t * 0.5), 0.014], { steps: [4], capEnd: true, capStart: true });
    } else if (style === 'buns') {
      addGeo(parts.hair, new THREE.SphereGeometry(0.045, 14, 10).translate(headC.x, headC.y + hy * 0.55, headC.z - hz * 0.88), H);
      addGeo(parts.hair, new THREE.TorusGeometry(0.03, 0.008, 6, 14).rotateX(0.4).translate(headC.x, headC.y + hy * 0.6, headC.z - hz * 0.72), H);
    } else if (style === 'simpleparted') {
      // A tie at the nape: a short tail.
      limb(parts.hair, [V(headC.x, headC.y - 0.02, headC.z - hz * 0.98), V(headC.x, headC.y - 0.11, headC.z - hz * 1.08)], [B('Head'), B('neck_01')], (t) => [0.02 * (1 - t * 0.4), 0.017 * (1 - t * 0.4)], { steps: [4], capEnd: true, blend: 0.06 });
    }
  }
  if (look.beard) {
    // A short full beard: jaw and chin, with a moustache.
    const g = new THREE.SphereGeometry(1, 26, 18);
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!;
    const out: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      if (cy < -0.1 && cz > -0.25) out.push(a, b, c);
    }
    g.setIndex(out);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const low = smooth(0.1, -0.9, y);
      p.setXYZ(i, p.getX(i) * hx * 1.06 * (1 - low * 0.22), y * hy * 1.08, p.getZ(i) * hz * 1.08 + (y < -0.6 ? 0.012 : 0));
    }
    g.translate(headC.x, headC.y, headC.z);
    addGeo(parts.hair, g, H);
    addGeo(parts.hair, new THREE.CapsuleGeometry(0.008, 0.035, 4, 8).rotateZ(Math.PI / 2).translate(headC.x, headC.y - 0.035, faceZ - 0.012), H);
  }

  // ---- arms and hands ----
  for (const s of ['l', 'r'] as const) {
    const sg = s === 'l' ? 1 : -1;
    const sh = J('upperarm_' + s), el = J('lowerarm_' + s), wr = J('hand_' + s);
    const start = sh.clone().add(V(-sg * 0.06, 0, 0));
    const armB = [B('upperarm_' + s), B('lowerarm_' + s), B('hand_' + s)];
    const k = female ? 0.88 : 1;
    // Skin of the arm (under the sleeve it is hidden, but it keeps the elbow closed).
    limb(parts.skin, [start, el, wr], armB, (t, seg) => seg === 0 ? [0.052 * k * (1 - t * 0.2), 0.054 * k * (1 - t * 0.18)] : [0.044 * k * (1 - t * 0.3) + 0.004, 0.04 * k * (1 - t * 0.28)], { steps: [6, 6], blend: 0.05, startW: [[B('clavicle_' + s), 1]] });
    // Sleeve: shoulder to just past the elbow, a little loose, cuffed.
    const elbowOut = el.clone().add(V(sg * 0.05, 0, 0));
    limb(parts.tunic, [start.clone().add(V(-sg * 0.005, 0, 0)), el, elbowOut], armB, (t, seg) => seg === 0 ? [(0.064 - t * 0.008) * k, (0.066 - t * 0.008) * k] : [0.058 * k, 0.056 * k], { steps: [6, 2], blend: 0.05, startW: [[B('clavicle_' + s), 1]] });
    // Leather bracer on the forearm.
    const bA = el.clone().lerp(wr, 0.25), bB = el.clone().lerp(wr, 0.92);
    limb(parts.leather, [bA, bB], [B('lowerarm_' + s), B('lowerarm_' + s)], (t) => [(0.052 - t * 0.012) * k, (0.048 - t * 0.01) * k], { steps: [4], n: 2.6 });
    // Hand: palm and back, then each finger along its own bones, and the thumb.
    const mid = J('middle_01_' + s);
    limb(parts.skin, [wr.clone().add(V(-sg * 0.01, 0, 0)), mid], [B('hand_' + s), B('hand_' + s)], (t) => [(0.042 + t * 0.006) * k, 0.018 * k + t * 0.004], { steps: [3], capStart: true, n: 3 });
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const pts = ['01', '02', '03', '04_leaf'].map((n) => J(`${f}_${n}_${s}`));
      const bs = ['01', '02', '03'].map((n) => B(`${f}_${n}_${s}`));
      const r = (f === 'pinky' ? 0.0075 : f === 'middle' ? 0.0095 : 0.009) * k;
      limb(parts.skin, [pts[0].clone().lerp(wr, 0.12), ...pts.slice(1)], [...bs, bs[2]], (t, seg) => [r * (1 - seg * 0.1 - t * 0.04), r * 0.92 * (1 - seg * 0.1)], { steps: [2, 2, 2], blend: 0.012, capEnd: true, seg: 8 });
    }
    const th = ['01', '02', '03', '04_leaf'].map((n) => J(`thumb_${n}_${s}`));
    const tb = ['01', '02', '03'].map((n) => B(`thumb_${n}_${s}`));
    limb(parts.skin, th, [...tb, tb[2]], (t, seg) => [0.0115 * k * (1 - seg * 0.12), 0.01 * k * (1 - seg * 0.12)], { steps: [2, 2, 2], blend: 0.012, capEnd: true, seg: 8 });
    // A fingerless glove's cuff at the wrist.
    limb(parts.dark, [wr.clone().add(V(-sg * 0.025, 0, 0)), wr.clone().add(V(sg * 0.02, 0, 0))], [B('hand_' + s), B('hand_' + s)], () => [0.047 * k, 0.026 * k], { steps: [1], n: 3 });
  }

  // ---- legs and feet ----
  for (const s of ['l', 'r'] as const) {
    const sg = s === 'l' ? 1 : -1;
    const hip = J('thigh_' + s), knee = J('calf_' + s), ankle = J('foot_' + s), ball = J('ball_' + s), toe = J('ball_leaf_' + s);
    const top = hip.clone().add(V(-sg * 0.01, 0.03, 0));
    const legB = [B('thigh_' + s), B('calf_' + s), B('foot_' + s)];
    const k = female ? 0.95 : 1;
    // Trousers, hip to ankle.
    limb(parts.trousers, [top, knee, ankle.clone().add(V(0, 0.04, 0.02))], legB, (t, seg) => seg === 0
      ? [(0.088 - t * 0.03 + (female ? 0.006 : 0)) * k, (0.09 - t * 0.032) * k]
      : [(0.058 - Math.abs(t - 0.25) * 0.03) * k, (0.06 - Math.abs(t - 0.2) * 0.03) * k], { steps: [7, 7], blend: 0.07, startW: [[B('pelvis'), 1]] });
    // Tall boots: from below the knee, with a folded cuff, down to the foot.
    const bTop = knee.clone().lerp(ankle, 0.12), bLow = ankle.clone().add(V(0, 0.02, 0.012));
    limb(parts.boots, [bTop.clone().add(V(0, 0.02, 0)), bLow], [B('calf_' + s), B('calf_' + s)], (t) => [0.066 - t * 0.02, 0.07 - t * 0.022], { steps: [6], n: 2.2 });
    limb(parts.leather, [bTop.clone().add(V(0, 0.035, 0)), bTop.clone().add(V(0, -0.025, 0))], [B('calf_' + s), B('calf_' + s)], () => [0.074, 0.078], { steps: [1], n: 2.2 });
    // The foot: heel to toe on the ground, a little higher at the instep.
    const heel = V(ankle.x, 0.0, ankle.z - 0.075);
    const rings: Ring[] = [];
    const prof: [number, number, number, number, number][] = [
      // [z, y centre, half-width, half-height, bone]
      [heel.z, 0.045, 0.036, 0.042, B('foot_' + s)],
      [ankle.z, 0.06, 0.044, 0.058, B('foot_' + s)],
      [ankle.z + 0.07, 0.048, 0.048, 0.046, B('foot_' + s)],
      [ball.z, 0.036, 0.05, 0.034, B('ball_' + s)],
      [toe.z + 0.02, 0.026, 0.04, 0.024, B('ball_' + s)],
    ];
    for (const [z, y, w, h, b] of prof) {
      const blendW: BoneW = z > ball.z - 0.03 && z < ball.z + 0.01 ? [[B('foot_' + s), 0.5], [B('ball_' + s), 0.5]] : z <= ankle.z + 0.01 ? [[B('foot_' + s), 0.8], [B('calf_' + s), z === ankle.z ? 0.2 : 0]] : [[b, 1]];
      rings.push({ c: V(ankle.x, y, z), u: V(1, 0, 0), v: V(0, 1, 0), rx: w, rz: h, n: 2.6, w: blendW });
    }
    sweep(parts.boots, rings, 16, { capStart: true, capEnd: true });
    // A sole.
    sweep(parts.dark, [
      { c: V(ankle.x, 0.006, heel.z - 0.004), u: V(1, 0, 0), v: V(0, 1, 0), rx: 0.04, rz: 0.008, n: 4, w: [[B('foot_' + s), 1]] },
      { c: V(ankle.x, 0.006, ball.z - 0.02), u: V(1, 0, 0), v: V(0, 1, 0), rx: 0.052, rz: 0.008, n: 4, w: [[B('foot_' + s), 0.5], [B('ball_' + s), 0.5]] },
      { c: V(ankle.x, 0.006, toe.z + 0.024), u: V(1, 0, 0), v: V(0, 1, 0), rx: 0.042, rz: 0.008, n: 4, w: [[B('ball_' + s), 1]] },
    ], 12, { capStart: true, capEnd: true });
  }

  // ---- materials and meshes ----
  const skinCol = BASE_SKIN.clone().multiply(new THREE.Color(look.skin ?? 0xffffff));
  const cloth = new THREE.Color(look.cloth ?? 0x4f8fd0);
  const linen = new THREE.Color(look.linen ?? 0xefe6d2);
  const hairCol = new THREE.Color(look.hairColor ?? 0x4a3322);
  const mats: Record<keyof typeof parts, THREE.MeshStandardMaterial> = {
    skin: material(skinCol, { rough: 0.62, name: 'HeroSkin' }),
    tunic: material(cloth, { rough: 0.9, grain: true, name: 'HeroTunic' }),
    leather: material(0x5b3a22, { rough: 0.7, grain: true, name: 'HeroLeather', side: THREE.DoubleSide }),
    dark: material(0x2e2016, { rough: 0.75, name: 'HeroStrap' }),
    trousers: material(0x3a3631, { rough: 0.92, grain: true, name: 'HeroTrousers' }),
    boots: material(0x4a2d1a, { rough: 0.6, name: 'HeroBoots' }),
    metal: material(0xc9a45c, { rough: 0.35, metal: 0.85, name: 'HeroBrass' }),
    scarf: material(linen.clone().multiplyScalar(0.92), { rough: 0.95, grain: true, name: 'HeroScarf' }),
    hair: material(hairCol, { rough: 0.55, name: 'HeroHair', side: THREE.DoubleSide }),
    eye: material(0x3a5a7a, { rough: 0.2, name: 'HeroEye' }),
    white: material(0xf4efe6, { rough: 0.3, name: 'HeroSclera' }),
    mouth: material(skinCol.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x8a3a32), 0.4), { rough: 0.7, name: 'HeroLips' }),
  };
  const toMesh = anchor.bindMatrixInverse;
  const parent = anchor.parent!;
  // Out with the kit's surfaces (the skeleton stays: it is shared).
  // (Not disposed: the kit's geometry is shared with the townsfolk.)
  for (const m of kit) m.removeFromParent();
  for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
    const p = parts[key];
    if (!p.idx.length) continue;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(p.pos);
    const v = V();
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(toMesh);
      pos[i] = v.x;
      pos[i + 1] = v.y;
      pos[i + 2] = v.z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4));
    g.setIndex(p.idx);
    g.computeVertexNormals();
    // UVs for the grain: a simple box projection, enough for a fine weave.
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) {
      uv[i * 2] = (p.pos[i * 3] + p.pos[i * 3 + 2]) * 9;
      uv[i * 2 + 1] = p.pos[i * 3 + 1] * 9;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.SkinnedMesh(g, mats[key]);
    // (The irises are the hero's "Eye": origins tint them.)
    mesh.name = key === 'eye' ? 'Hero_Eye' : key === 'white' ? 'Hero_Sclera' : key === 'hair' ? 'Hero_Hair' : 'Hero_' + key;
    mesh.position.copy(anchor.position);
    mesh.quaternion.copy(anchor.quaternion);
    mesh.scale.copy(anchor.scale);
    mesh.bind(skeleton, anchor.bindMatrix);
    mesh.castShadow = key !== 'eye' && key !== 'white' && key !== 'mouth';
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  }
}
