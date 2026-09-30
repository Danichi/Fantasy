// Skin the static orc models onto a copy of the player's Mixamo skeleton, so
// they play every clip in /assets/character/ exactly like the hero does.
//   node tools/prep-models.mjs orcWarrior && node tools/prep-models.mjs orcWarchief
//   node tools/rig-orcs.mjs [name]
//
// For each orc:
//  1. Joint positions were measured by hand from orthographic front/side
//     renders (the orc scaled to 1.8 m tall, bounding box centred, feet at 0).
//  2. The model is rescaled so its hips sit at the hero's hips height and
//     recentred on them, so the clips' hips translation fits it.
//  3. The hero skeleton is posed into the orc: chain bones keep the hero's bone
//     axes and are rotated/lengthened onto the measured joints, so a clip that
//     sets a bone's rotation moves the orc's limb the way it moves the hero's.
//  4. Skin weights come from geodesic distance through a voxelised body (so a
//     hand hanging beside a thigh doesn't pick up the leg), blended across
//     each joint. The weapon in the right hand is bound rigidly to that hand.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const SRC = 'assets-src/prepped';
const OUT = 'public/assets/npc';
const HERO = 'public/assets/character/character.glb';

// Measured joints (see header). HandTip is where the fingers point.
const JOBS = {
  // The Gravewood's boss: a hunched, long-armed patchwork brute (no weapon).
  gwAbomination: {
    out: 'public/assets/gravewood',
    grip: [9, 9, 9],
    joints: {
      Hips: [0.0, 0.78, -0.13], Spine: [0.0, 0.9, -0.13], Spine1: [0.0, 1.05, -0.13], Spine2: [0.0, 1.22, -0.11],
      Neck: [0.0, 1.36, -0.02], Head: [0.0, 1.42, 0.15], HeadTop_End: [0.0, 1.7, 0.38],
      LeftShoulder: [0.12, 1.38, -0.08], LeftArm: [0.46, 1.45, -0.05], LeftForeArm: [0.67, 1.03, -0.28], LeftHand: [0.75, 0.72, -0.15], LeftHandTip: [0.73, 0.4, -0.03],
      RightShoulder: [-0.12, 1.38, -0.08], RightArm: [-0.46, 1.45, -0.03], RightForeArm: [-0.66, 1.03, -0.14], RightHand: [-0.72, 0.75, 0.0], RightHandTip: [-0.67, 0.42, 0.13],
      LeftUpLeg: [0.2, 0.76, -0.12], LeftLeg: [0.25, 0.47, 0.0], LeftFoot: [0.22, 0.18, -0.26], LeftToeBase: [0.3, 0.05, -0.05], LeftToe_End: [0.32, 0.03, 0.06],
      RightUpLeg: [-0.2, 0.76, -0.14], RightLeg: [-0.28, 0.5, -0.12], RightFoot: [-0.26, 0.19, -0.36], RightToeBase: [-0.31, 0.05, -0.15], RightToe_End: [-0.33, 0.03, -0.06],
    },
  },
  // Already rigged to its own Mixamo skeleton: carried onto the hero's.
  gwZombie: { rebind: true, out: 'public/assets/gravewood' },
  orcWarrior: {
    grip: [-0.51, 0.86, 0.0],
    joints: {
      Hips: [0.01, 0.92, -0.41], Spine: [0.01, 1.02, -0.4], Spine1: [0.01, 1.13, -0.37], Spine2: [0.01, 1.24, -0.32],
      Neck: [0.01, 1.38, -0.22], Head: [0.01, 1.48, -0.07], HeadTop_End: [0.01, 1.78, 0.02],
      LeftShoulder: [0.1, 1.34, -0.28], LeftArm: [0.37, 1.3, -0.3], LeftForeArm: [0.52, 1.03, -0.55], LeftHand: [0.53, 0.7, -0.46], LeftHandTip: [0.5, 0.55, -0.43],
      RightShoulder: [-0.08, 1.34, -0.28], RightArm: [-0.35, 1.3, -0.3], RightForeArm: [-0.48, 1.07, -0.32], RightHand: [-0.51, 0.9, -0.06], RightHandTip: [-0.51, 0.83, 0.04],
      LeftUpLeg: [0.16, 0.88, -0.42], LeftLeg: [0.2, 0.52, -0.42], LeftFoot: [0.22, 0.17, -0.7], LeftToeBase: [0.26, 0.05, -0.54], LeftToe_End: [0.28, 0.03, -0.45],
      RightUpLeg: [-0.14, 0.88, -0.4], RightLeg: [-0.2, 0.53, -0.28], RightFoot: [-0.2, 0.17, -0.38], RightToeBase: [-0.24, 0.05, -0.12], RightToe_End: [-0.25, 0.03, -0.03],
    },
  },
  orcWarchief: {
    grip: [-0.43, 0.74, -0.07],
    // The axe is fused to the fist: its haft (through the fist) and its head.
    weapon: {
      capsules: [[[-0.24, 0.84, -0.1], [-0.62, 0.55, 0.18], 0.07]],
      boxes: [[[-0.97, 0.18, -0.15], [-0.52, 0.72, 0.5]]],
    },
    joints: {
      Hips: [0.115, 0.68, 0.0], Spine: [0.115, 0.8, 0.0], Spine1: [0.115, 0.95, 0.0], Spine2: [0.115, 1.12, -0.02],
      Neck: [0.115, 1.36, -0.02], Head: [0.115, 1.45, 0.02], HeadTop_End: [0.115, 1.78, 0.06],
      LeftShoulder: [0.21, 1.34, -0.03], LeftArm: [0.58, 1.33, -0.02], LeftForeArm: [0.69, 1.07, 0.0], LeftHand: [0.72, 0.82, 0.08], LeftHandTip: [0.71, 0.66, 0.17],
      RightShoulder: [0.02, 1.34, -0.03], RightArm: [-0.34, 1.33, -0.08], RightForeArm: [-0.44, 1.07, -0.12], RightHand: [-0.44, 0.82, -0.09], RightHandTip: [-0.42, 0.66, -0.06],
      LeftUpLeg: [0.27, 0.64, 0.02], LeftLeg: [0.37, 0.36, 0.09], LeftFoot: [0.41, 0.15, 0.03], LeftToeBase: [0.44, 0.05, 0.2], LeftToe_End: [0.45, 0.03, 0.3],
      RightUpLeg: [-0.04, 0.64, -0.02], RightLeg: [-0.13, 0.36, -0.08], RightFoot: [-0.16, 0.15, -0.17], RightToeBase: [-0.18, 0.05, 0.0], RightToe_End: [-0.19, 0.03, 0.09],
    },
  },
};

// Bones that carry skin, each with the joint its segment runs to.
const SEGMENTS = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandTip',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandTip',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: 'LeftToe_End',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: 'RightToe_End',
};
// Bones whose several children are placed directly instead of by rotating the bone.
const BRANCH = new Set(['Hips', 'Spine2']);

const VOXEL = 0.02; // metres
const SIGMA = 0.03; // blend width across joints (metres of extra geodesic distance)
const SMOOTH = 8; // weight smoothing passes over the mesh
const short = (n) => n.replace(/^mixamorig\d*[:_]?/, '');
const V = (a) => new THREE.Vector3(...a);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---- hero skeleton as three.js objects -----------------------------------------------------
async function heroSkeleton() {
  const doc = await io.read(HERO);
  const root = doc.getRoot();
  const skin = root.listSkins().find((s) => s.listJoints().length > 20);
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const hipsNode = skin.listJoints().find((j) => short(j.getName()) === 'Hips');
  const objs = new Map(); // gltf node -> Object3D
  const make = (n) => {
    const o = new THREE.Object3D();
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    objs.set(n, o);
    for (const c of n.listChildren()) if (skin.listJoints().includes(c)) o.add(make(c));
    return o;
  };
  const hips = make(hipsNode);
  const rootObj = new THREE.Object3D(); // RootNode (identity in the hero file)
  rootObj.name = parentOf.get(hipsNode)?.getName() ?? 'RootNode';
  rootObj.add(hips);
  rootObj.updateMatrixWorld(true);
  const joints = skin.listJoints().map((j) => objs.get(j));
  const byShort = new Map(joints.map((o) => [short(o.name), o]));
  return { rootObj, joints, byShort };
}

// ---- pose the hero skeleton onto measured joints -------------------------------------------
function fitSkeleton(sk, T, extraBranch = []) {
  const { byShort } = sk;
  const branch = new Set([...BRANCH, ...extraBranch]);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const setWorldPos = (o, p) => {
    o.parent.updateMatrixWorld(true);
    o.position.copy(o.parent.worldToLocal(p.clone()));
    o.updateMatrixWorld(true);
  };
  // Rotate bone b (about its own origin) so its child c lands along the target direction,
  // after lengthening c's offset to the measured bone length.
  const aim = (b, c, target) => {
    const from = T[short(b.name)];
    const len = from.distanceTo(target);
    c.position.setLength(len * (c.position.length() / wp(c).distanceTo(wp(b)) || 1));
    b.updateMatrixWorld(true);
    const cur = wp(c).sub(wp(b)).normalize();
    const want = target.clone().sub(from).normalize();
    const dq = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const bw = b.getWorldQuaternion(new THREE.Quaternion());
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pw.invert().multiply(dq.multiply(bw)));
    b.updateMatrixWorld(true);
  };
  const hips = byShort.get('Hips');
  setWorldPos(hips, T.Hips);
  const visit = (b) => {
    const name = short(b.name);
    const kids = b.children.filter((c) => T[short(c.name)]);
    if (branch.has(name)) for (const c of kids) setWorldPos(c, T[short(c.name)]);
    else if (kids.length === 1) aim(b, kids[0], T[short(kids[0].name)]);
    else if (name.endsWith('Hand') && T[name + 'Tip']) {
      const mid = b.children.find((c) => /HandMiddle1$/.test(c.name));
      if (mid) aim(b, mid, T[name + 'Tip'].clone().sub(T[name]).setLength(wp(mid).distanceTo(wp(b))).add(T[name]));
    }
    for (const c of b.children) visit(c);
  };
  visit(hips);
  sk.rootObj.updateMatrixWorld(true);
  // Report how far each measured joint ended up from its target.
  let worst = 0;
  for (const [n, t] of Object.entries(T)) {
    const o = byShort.get(n);
    if (o) worst = Math.max(worst, wp(o).distanceTo(t));
  }
  return worst;
}

// ---- voxel geodesics ------------------------------------------------------------------------
const MAX_GEO = 0.45; // metres: no bone further than this can win a vertex

class MinHeap {
  constructor(cap) { this.k = new Float32Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) {
      const k = new Float32Array(this.n * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.n * 2); v.set(this.v); this.v = v;
    }
    const k = this.k, v = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0];
    const n = --this.n, lk = k[n], lv = v[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const m = l + 1 < n && k[l + 1] < k[l] ? l + 1 : l;
      if (k[m] >= lk) break;
      k[i] = k[m]; v[i] = v[m]; i = m;
    }
    k[i] = lk; v[i] = lv;
    return top;
  }
  get size() { return this.n; }
}

function voxelise(tris, lo, hi) {
  const nx = Math.ceil((hi.x - lo.x) / VOXEL) + 3, ny = Math.ceil((hi.y - lo.y) / VOXEL) + 3, nz = Math.ceil((hi.z - lo.z) / VOXEL) + 3;
  const org = lo.clone().subScalar(VOXEL);
  const idx = (x, y, z) => x + nx * (y + ny * z);
  const cell = (p) => [Math.floor((p.x - org.x) / VOXEL), Math.floor((p.y - org.y) / VOXEL), Math.floor((p.z - org.z) / VOXEL)];
  const surf = new Uint8Array(nx * ny * nz);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 9) {
    a.fromArray(tris, t); b.fromArray(tris, t + 3); c.fromArray(tris, t + 6);
    const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (VOXEL * 0.4)));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n;
      p.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
      const [x, y, z] = cell(p);
      surf[idx(x, y, z)] = 1;
    }
  }
  // Flood the outside from the grid border; everything not reached is body.
  const out = new Uint8Array(nx * ny * nz);
  const stack = [0];
  out[0] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
      const k = idx(X, Y, Z);
      if (out[k] || surf[k]) continue;
      out[k] = 1;
      stack.push(k);
    }
  }
  const solid = new Uint8Array(nx * ny * nz);
  let count = 0;
  for (let i = 0; i < solid.length; i++) if (!out[i]) (solid[i] = 1), count++;
  return { nx, ny, nz, org, idx, cell, solid, count };
}

function geodesic(G, a, b) {
  const { nx, ny, nz, idx, cell, solid, org } = G;
  const dist = new Float32Array(nx * ny * nz).fill(Infinity);
  const heap = new MinHeap(1 << 16);
  const center = (x, y, z) => new THREE.Vector3(org.x + (x + 0.5) * VOXEL, org.y + (y + 0.5) * VOXEL, org.z + (z + 0.5) * VOXEL);
  const seg = new THREE.Line3(a, b);
  const steps = Math.max(1, Math.ceil(a.distanceTo(b) / (VOXEL * 0.5)));
  const q = new THREE.Vector3();
  for (let s = 0; s <= steps; s++) {
    seg.at(s / steps, q);
    const [x, y, z] = cell(q);
    // Seed the nearest body voxels around each sample (the bone may graze the surface).
    let found = false;
    for (let r = 0; r <= 6 && !found; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const X = x + dx, Y = y + dy, Z = z + dz;
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const k = idx(X, Y, Z);
        if (!solid[k]) continue;
        found = true;
        const d = center(X, Y, Z).distanceTo(seg.closestPointToPoint(center(X, Y, Z), true, new THREE.Vector3()));
        if (d < dist[k]) { dist[k] = d; heap.push(d, k); }
      }
    }
  }
  // 26-neighbourhood as flat index offsets (the grid has a one-voxel empty border, so no bounds checks).
  const off = [], wt = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy && !dz) continue;
    off.push(dx + nx * (dy + ny * dz));
    wt.push(Math.hypot(dx, dy, dz) * VOXEL);
  }
  const last = nx * ny * nz;
  while (heap.size) {
    const d0 = heap.k[0];
    const i = heap.pop();
    if (d0 > dist[i]) continue; // stale entry
    if (d0 > MAX_GEO) break;
    for (let n = 0; n < 26; n++) {
      const k = i + off[n];
      if (k < 0 || k >= last || !solid[k]) continue;
      const nd = d0 + wt[n];
      if (nd < dist[k]) { dist[k] = nd; heap.push(nd, k); }
    }
  }
  return dist;
}

// ---- connected pieces (to find the weapon) ----------------------------------------------------
function components(prims) {
  // Union-find over all vertices, joined by triangles and by coincident positions.
  let total = 0;
  const base = prims.map((p) => { const b = total; total += p.pos.length / 3; return b; });
  const parent = new Int32Array(total).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const seen = new Map();
  prims.forEach((p, pi) => {
    for (let t = 0; t < p.index.length; t += 3) { join(base[pi] + p.index[t], base[pi] + p.index[t + 1]); join(base[pi] + p.index[t], base[pi] + p.index[t + 2]); }
    for (let v = 0; v < p.pos.length / 3; v++) {
      const key = `${Math.round(p.pos[v * 3] * 1000)},${Math.round(p.pos[v * 3 + 1] * 1000)},${Math.round(p.pos[v * 3 + 2] * 1000)}`;
      const s = seen.get(key);
      if (s === undefined) seen.set(key, base[pi] + v); else join(s, base[pi] + v);
    }
  });
  const comp = new Int32Array(total);
  for (let i = 0; i < total; i++) comp[i] = find(i);
  return { base, comp };
}

// ---- main ------------------------------------------------------------------------------------
async function rig(name, job) {
  const src = path.join(SRC, `${name}.glb`);
  const doc = await io.read(src);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const b = getBounds(scene);
  const k = 1.8 / (b.max[1] - b.min[1]);
  const cx = (b.max[0] + b.min[0]) / 2, cz = (b.max[2] + b.min[2]) / 2;

  const sk = await heroSkeleton();
  const heroHips = sk.byShort.get('Hips').getWorldPosition(new THREE.Vector3());
  const H = V(job.joints.Hips);
  const s = heroHips.y / H.y;
  // measured frame -> rig frame: hips at the hero's hips
  const toRig = (v) => new THREE.Vector3((v.x - H.x) * s + heroHips.x, v.y * s, (v.z - H.z) * s + heroHips.z);
  const T = Object.fromEntries(Object.entries(job.joints).map(([n, v]) => [n, toRig(V(v))]));
  const grip = toRig(V(job.grip));

  const worst = fitSkeleton(sk, T);

  // Bake every primitive into the rig frame.
  const prims = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const N = new THREE.Matrix3().getNormalMatrix(M);
    for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL');
      const pos = new Float32Array(pa.getCount() * 3), nor = na ? new Float32Array(na.getCount() * 3) : null;
      const v = new THREE.Vector3();
      for (let i = 0; i < pa.getCount(); i++) {
        v.fromArray(pa.getElement(i, [])).applyMatrix4(M);
        v.set((v.x - cx) * k, (v.y - b.min[1]) * k, (v.z - cz) * k);
        toRig(v).toArray(pos, i * 3);
        if (nor) v.fromArray(na.getElement(i, [])).applyMatrix3(N).normalize().toArray(nor, i * 3);
      }
      const ia = prim.getIndices();
      const index = ia ? Array.from(ia.getArray()) : Array.from({ length: pa.getCount() }, (_, i) => i);
      prims.push({ node, prim, pos, nor, index });
    }
  }

  // The weapon: large pieces around the right hand's grip.
  const { base, comp } = components(prims);
  const info = new Map();
  prims.forEach((p, pi) => {
    for (let v = 0; v < p.pos.length / 3; v++) {
      const c = comp[base[pi] + v];
      let e = info.get(c);
      if (!e) info.set(c, (e = { n: 0, box: new THREE.Box3() }));
      e.n++;
      e.box.expandByPoint(new THREE.Vector3().fromArray(p.pos, v * 3));
    }
  });
  const pieces = new Set();
  for (const [c, e] of info) {
    const diag = e.box.getSize(new THREE.Vector3()).length();
    const near = e.box.clone().expandByScalar(0.06).containsPoint(grip);
    if (near && diag > 0.45 && !e.box.containsPoint(T.RightArm) && !e.box.containsPoint(T.Hips)) pieces.add(c);
  }
  // Weapons fused to the body mesh are marked by region instead (measured frame).
  const capsules = (job.weapon?.capsules ?? []).map(([a, b, r]) => [new THREE.Line3(toRig(V(a)), toRig(V(b))), r * s]);
  const boxes = (job.weapon?.boxes ?? []).map(([lo, hi]) => new THREE.Box3(toRig(V(lo)), toRig(V(hi))));
  const q = new THREE.Vector3(), cp = new THREE.Vector3();
  const isWeapon = prims.map((p, pi) => {
    const flags = new Uint8Array(p.pos.length / 3);
    for (let v = 0; v < flags.length; v++) {
      q.fromArray(p.pos, v * 3);
      flags[v] = pieces.has(comp[base[pi] + v]) || boxes.some((bx) => bx.containsPoint(q)) || capsules.some(([seg, r]) => seg.closestPointToPoint(q, true, cp).distanceTo(q) < r) ? 1 : 0;
    }
    return flags;
  });
  const weaponVerts = isWeapon.reduce((t, f) => t + f.reduce((a, b) => a + b, 0), 0);

  // Voxelise the body (not the weapon) and measure geodesics to each bone segment.
  const tris = [];
  const box = new THREE.Box3();
  prims.forEach((p, pi) => {
    for (let t = 0; t < p.index.length; t += 3) {
      if (isWeapon[pi][p.index[t]] && isWeapon[pi][p.index[t + 1]] && isWeapon[pi][p.index[t + 2]]) continue;
      for (let j = 0; j < 3; j++) {
        const o = p.index[t + j] * 3;
        tris.push(p.pos[o], p.pos[o + 1], p.pos[o + 2]);
        box.expandByPoint(new THREE.Vector3(p.pos[o], p.pos[o + 1], p.pos[o + 2]));
      }
    }
  });
  const G = voxelise(tris, box.min, box.max);
  const boneNames = Object.keys(SEGMENTS);
  const dists = boneNames.map((bn) => geodesic(G, T[bn], T[SEGMENTS[bn]]));

  // Joint indices in the skin, by short name.
  const jointIndex = new Map(sk.joints.map((o, i) => [short(o.name), i]));

  // ---- skin weights -------------------------------------------------------------------------
  const offsetsNear = new Float32Array(boneNames.length);
  let droppedTotal = 0;
  prims.forEach((p, pi) => {
    const n = p.pos.length / 3;
    const B = boneNames.length;
    const D = new Float32Array(n * B); // dense weights, one row per vertex
    const handBi = boneNames.indexOf('RightHand');
    for (let v = 0; v < n; v++) {
      if (isWeapon[pi][v]) {
        D[v * B + handBi] = 1;
        continue;
      }
      const [x, y, z] = G.cell(new THREE.Vector3().fromArray(p.pos, v * 3));
      const cellIdx = G.idx(Math.min(G.nx - 1, Math.max(0, x)), Math.min(G.ny - 1, Math.max(0, y)), Math.min(G.nz - 1, Math.max(0, z)));
      let dmin = Infinity;
      for (let bi = 0; bi < boneNames.length; bi++) dmin = Math.min(dmin, (offsetsNear[bi] = dists[bi][cellIdx]));
      if (!isFinite(dmin)) {
        // Not inside the body grid (shouldn't happen): fall back to Euclidean distance to segments.
        const q = new THREE.Vector3().fromArray(p.pos, v * 3);
        for (let bi = 0; bi < boneNames.length; bi++) {
          const seg = new THREE.Line3(T[boneNames[bi]], T[SEGMENTS[boneNames[bi]]]);
          offsetsNear[bi] = seg.closestPointToPoint(q, true, new THREE.Vector3()).distanceTo(q);
          dmin = Math.min(dmin, offsetsNear[bi]);
        }
      }
      let sum = 0;
      for (let bi = 0; bi < B; bi++) sum += D[v * B + bi] = Math.exp(-(((offsetsNear[bi] - dmin) / SIGMA) ** 2));
      for (let bi = 0; bi < B; bi++) D[v * B + bi] /= sum;
    }
    // Smooth weights over the surface (edges plus coincident vertices across UV
    // seams), so thin cards of fur and cloth bend instead of tearing where
    // their ends fall to different bones. The weapon stays rigid.
    const nbrs = Array.from({ length: n }, () => new Set());
    for (let t = 0; t < p.index.length; t += 3) for (let j = 0; j < 3; j++) {
      const a = p.index[t + j], b = p.index[t + ((j + 1) % 3)];
      nbrs[a].add(b); nbrs[b].add(a);
    }
    const at = new Map();
    for (let v = 0; v < n; v++) {
      const key = `${Math.round(p.pos[v * 3] * 2000)},${Math.round(p.pos[v * 3 + 1] * 2000)},${Math.round(p.pos[v * 3 + 2] * 2000)}`;
      const o = at.get(key);
      if (o === undefined) at.set(key, v); else { nbrs[o].add(v); nbrs[v].add(o); }
    }
    const tmp = new Float32Array(n * B);
    for (let it = 0; it < SMOOTH; it++) {
      for (let v = 0; v < n; v++) {
        const row = v * B;
        if (isWeapon[pi][v] || !nbrs[v].size) { for (let bi = 0; bi < B; bi++) tmp[row + bi] = D[row + bi]; continue; }
        const k = 0.5 / nbrs[v].size;
        for (let bi = 0; bi < B; bi++) tmp[row + bi] = D[row + bi] * 0.5;
        for (const u of nbrs[v]) for (let bi = 0; bi < B; bi++) tmp[row + bi] += D[u * B + bi] * k;
      }
      D.set(tmp);
    }
    const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      const cand = [];
      for (let bi = 0; bi < B; bi++) if (D[v * B + bi] > 0.01) cand.push([D[v * B + bi], bi]);
      cand.sort((a, b) => b[0] - a[0]);
      const top = cand.slice(0, 4);
      const sum = top.reduce((t, c) => t + c[0], 0);
      top.forEach(([w, bi], s) => {
        J[v * 4 + s] = jointIndex.get(boneNames[bi]);
        W[v * 4 + s] = w / sum;
      });
    }
    // Drop triangles that tie a forearm or hand to anything but its own arm
    // (a fist resting on the belt is often fused to it); they would stretch
    // into sheets as soon as the arm swings.
    // The upper arm may only join the chest and shoulders, not the hips or legs.
    const limb = new Map();
    for (const side of ['Left', 'Right']) {
      for (const b of ['ForeArm', 'Hand']) limb.set(jointIndex.get(side + b), side);
      limb.set(jointIndex.get(side + 'Arm'), side + 'Upper');
      limb.set(jointIndex.get(side + 'Shoulder'), 'chest');
    }
    for (const b of ['Spine1', 'Spine2', 'Neck', 'Head']) limb.set(jointIndex.get(b), 'chest');
    const dom = (v) => J[v * 4 + W.subarray(v * 4, v * 4 + 4).indexOf(Math.max(...W.subarray(v * 4, v * 4 + 4)))];
    const kept = [];
    let dropped = 0;
    for (let t = 0; t < p.index.length; t += 3) {
      const g = [0, 1, 2].map((j) => limb.get(dom(p.index[t + j])) ?? 'lower');
      const side = g.find((x) => x === 'Left' || x === 'Right');
      const upper = g.find((x) => x.endsWith('Upper'));
      const bad = (side && g.some((x) => x !== side && x !== side + 'Upper')) || (upper && g.includes('lower'));
      if (bad) dropped++;
      else kept.push(p.index[t], p.index[t + 1], p.index[t + 2]);
    }
    if (dropped) {
      p.index = kept;
      droppedTotal += dropped;
    }
    p.J = J;
    p.W = W;
  });
  const out = await writeRigged(doc, sk, name, prims, job.out ?? OUT);
  console.log(`${name.padEnd(12)} scale ${s.toFixed(3)}, joints within ${(worst * 100).toFixed(1)} cm, ${G.count} body voxels, weapon ${weaponVerts} verts, ${droppedTotal} bridging tris dropped, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

/**
 * Write the hero skeleton (in its fitted pose) into `doc` and skin every baked
 * primitive to it: prims carry pos/nor in the rig frame, J/W per vertex and
 * their (possibly trimmed) index list.
 */
async function writeRigged(doc, sk, name, prims, outDir) {
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const buffer = root.listBuffers()[0];
  // Skeleton nodes mirroring the hero's (names, fitted pose).
  const rootNode = doc.createNode(sk.rootObj.name);
  const nodeOf = new Map();
  const build = (o, parent) => {
    const n = doc.createNode(o.name).setTranslation(o.position.toArray()).setRotation(o.quaternion.toArray()).setScale(o.scale.toArray());
    parent.addChild(n);
    nodeOf.set(o, n);
    for (const c of o.children) build(c, n);
  };
  for (const c of sk.rootObj.children) build(c, rootNode);
  const ibm = new Float32Array(sk.joints.length * 16);
  sk.joints.forEach((o, i) => new THREE.Matrix4().copy(o.matrixWorld).invert().toArray(ibm, i * 16));
  const skin = doc.createSkin(`${name}Skin`)
    .setSkeleton(nodeOf.get(sk.byShort.get('Hips')))
    .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
  for (const o of sk.joints) skin.addJoint(nodeOf.get(o));

  // Detach mesh nodes from their old hierarchy; each becomes a skinned node under RootNode.
  for (const s of root.listScenes()) for (const c of s.listChildren()) s.removeChild(c);
  scene.addChild(rootNode);
  const meshNodes = new Set();
  for (const p of prims) {
    const n = p.pos.length / 3;
    const arr = n > 65535 ? new Uint32Array(p.index) : new Uint16Array(p.index);
    p.prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buffer));
    p.prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.pos).setBuffer(buffer));
    if (p.nor) p.prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.nor).setBuffer(buffer));
    p.prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(p.J).setBuffer(buffer));
    p.prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(p.W).setBuffer(buffer));
    meshNodes.add(p.node);
  }
  for (const n of meshNodes) {
    for (const par of root.listNodes()) if (par.listChildren().includes(n)) par.removeChild(n);
    n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]).setSkin(skin);
    rootNode.addChild(n);
  }
  // Old skins (a model that came rigged) and their joints go with the old hierarchy.
  for (const s of root.listSkins()) if (s !== skin) s.dispose();
  for (const a of root.listAnimations()) a.dispose();
  await doc.transform(prune({ keepLeaves: true }));
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.glb`);
  await io.write(out, doc);
  fs.copyFileSync(path.join(SRC, `${name}.license.txt`), path.join(outDir, `${name}.license.txt`));
  return out;
}

/**
 * A model already rigged to a Mixamo skeleton of its own (other units, axes
 * and bone rolls): pose the hero skeleton onto its joints and carry its own
 * skin weights across by bone name, so the hero's clips drive it cleanly.
 */
async function rebind(name, job) {
  const doc = await io.read(path.join(SRC, `${name}.glb`));
  const root = doc.getRoot();
  const srcSkin = root.listSkins()[0];
  const srcJoints = srcSkin.listJoints();
  const ibmAcc = srcSkin.getInverseBindMatrices();
  const jointWorld = srcJoints.map((j) => new THREE.Matrix4().fromArray(j.getWorldMatrix()));
  const skinMats = srcJoints.map((j, i) => jointWorld[i].clone().multiply(new THREE.Matrix4().fromArray(ibmAcc.getElement(i, []))));

  // The rest pose as the viewer shows it: skin every vertex with the file's own pose.
  const prims = [];
  const box = new THREE.Box3();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !node.getSkin()) continue;
    const M = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL');
      const ja = prim.getAttribute('JOINTS_0'), wa = prim.getAttribute('WEIGHTS_0');
      const n = pa.getCount();
      const pos = new Float32Array(n * 3), nor = na ? new Float32Array(n * 3) : null;
      const srcJ = new Uint16Array(n * 4), srcW = new Float32Array(n * 4);
      const v = new THREE.Vector3(), acc = new THREE.Vector3(), nacc = new THREE.Vector3(), t = new THREE.Vector3();
      const m = new THREE.Matrix4(), m3 = new THREE.Matrix3();
      for (let i = 0; i < n; i++) {
        const js = ja.getElement(i, []), ws = wa.getElement(i, []);
        acc.set(0, 0, 0);
        nacc.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          if (!ws[k]) continue;
          m.copy(M).multiply(skinMats[js[k]]); // three.js applies the mesh node after skinning
          acc.addScaledVector(t.fromArray(pa.getElement(i, [])).applyMatrix4(m), ws[k]);
          if (na) nacc.addScaledVector(t.fromArray(na.getElement(i, [])).applyMatrix3(m3.getNormalMatrix(m)), ws[k]);
          srcJ[i * 4 + k] = js[k];
          srcW[i * 4 + k] = ws[k];
        }
        acc.toArray(pos, i * 3);
        if (nor) nacc.normalize().toArray(nor, i * 3);
        box.expandByPoint(acc);
      }
      const ia = prim.getIndices();
      prims.push({ node, prim, pos, nor, srcJ, srcW, index: ia ? Array.from(ia.getArray()) : Array.from({ length: n }, (_, i) => i) });
    }
  }
  // Measured frame (as rig() uses): 1.8 m tall, centred, feet at 0.
  const k = 1.8 / (box.max.y - box.min.y);
  const cx = (box.max.x + box.min.x) / 2, cz = (box.max.z + box.min.z) / 2;
  const measure = (p) => new THREE.Vector3((p.x - cx) * k, (p.y - box.min.y) * k, (p.z - cz) * k);
  const joints = {};
  // Seen through three.js's skinning, each joint acts from (mesh node) x (joint world).
  const meshNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
  const MM = new THREE.Matrix4().fromArray(meshNode.getWorldMatrix());
  srcJoints.forEach((j, i) => (joints[short(j.getName())] = measure(new THREE.Vector3().setFromMatrixPosition(MM.clone().multiply(jointWorld[i])))));
  for (const side of ['Left', 'Right']) if (joints[side + 'HandMiddle1']) joints[side + 'HandTip'] = joints[side + 'HandMiddle1'];

  const sk = await heroSkeleton();
  const heroHips = sk.byShort.get('Hips').getWorldPosition(new THREE.Vector3());
  const H = joints.Hips;
  // Scale by leg length, not hips height: the model's rest pose may be a crouch.
  const legOf = (get) => ['Left', 'Right'].reduce((t, side) => t + get(side + 'UpLeg').distanceTo(get(side + 'Leg')) + get(side + 'Leg').distanceTo(get(side + 'Foot')), 0);
  const heroPos = (n) => sk.byShort.get(n).getWorldPosition(new THREE.Vector3());
  const s = legOf(heroPos) / legOf((n) => joints[n]);
  const toRig = (v) => new THREE.Vector3((v.x - H.x) * s + heroHips.x, v.y * s, (v.z - H.z) * s + heroHips.z);
  const T = Object.fromEntries(Object.entries(joints).map(([n, v]) => [n, toRig(v)]));
  // Hands branch here: every finger root is placed on the model's own finger.
  const worst = fitSkeleton(sk, T, ['LeftHand', 'RightHand']);

  // Carry the weights across by bone name (bones the hero lacks fall to their nearest named ancestor).
  const jointIndex = new Map(sk.joints.map((o, i) => [short(o.name), i]));
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const mapJoint = srcJoints.map((j) => {
    for (let n = j; n; n = parentOf.get(n)) if (jointIndex.has(short(n.getName()))) return jointIndex.get(short(n.getName()));
    return jointIndex.get('Hips');
  });
  const v = new THREE.Vector3();
  for (const p of prims) {
    for (let i = 0; i < p.pos.length / 3; i++) toRig(measure(v.fromArray(p.pos, i * 3))).toArray(p.pos, i * 3);
    p.J = p.srcJ.map((j, i) => (p.srcW[i] ? mapJoint[j] : 0));
    p.W = p.srcW;
  }
  const out = await writeRigged(doc, sk, name, prims, job.out ?? OUT);
  console.log(`${name.padEnd(12)} rebound: scale ${(s * k).toFixed(4)}, joints within ${(worst * 100).toFixed(1)} cm, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

for (const [name, job] of Object.entries(JOBS)) {
  if (process.argv[2] && process.argv[2] !== name) continue;
  await (job.rebind ? rebind(name, job) : rig(name, job));
}
