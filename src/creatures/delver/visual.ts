import * as THREE from 'three';
import { DELVER_RIG, delverGeometry } from './model';
import { skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';
import { Gait } from '../kit/gait';

// The Delver on screen: one skeleton for the sculpted body, a heavy rolling
// gait on its four feet, and its moves: the feelers always working; a rake
// with one spade arm; rearing up on its hind legs and slamming both arms down;
// diving nose-first into the ground (the AI sinks it) and bursting out again;
// reeling; and dead on its side.

export type DelverPose = 'idle' | 'rake' | 'rear' | 'slam' | 'dive' | 'burst' | 'hurt' | 'dead';

let mats: { skin: THREE.MeshPhysicalMaterial; bristle: ReturnType<typeof tuftMaterial>; horn: THREE.MeshStandardMaterial } | null = null;
function getMats() {
  if (mats) return mats;
  const skin = skinMaterial({ relief: 1.6, strand: 30, drift: 0.15, rough: 0.82, wetRough: 0.4, sheen: 0.15, sheenColor: 0xd8c0b0 });
  const bristle = tuftMaterial({ sheen: 0.2, sheenColor: 0x9a8a78, rough: 0.9 });
  const horn = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  mats = { skin, bristle, horn };
  return mats;
}
export function tickDelverFur(dt: number) {
  if (mats) mats.bristle.time.value += dt;
}

const RESET = DELVER_RIG.bones.map((b) => b.name);

export class DelverVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private bristle: THREE.SkinnedMesh;
  private crystalMat = new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: new THREE.Color(1.6, 0.8, 0.25), emissiveIntensity: 1, roughness: 0.25, metalness: 0.1 });
  readonly light = new THREE.PointLight(0xffa050, 4, 10, 1.5);
  pose: DelverPose = 'idle';
  poseT = 0;
  /** which arm rakes next */
  side = 1;
  private t = Math.random() * 10;
  private a: Record<string, number> = {};
  private deadT = 0;

  constructor(opts: { scale?: number } = {}) {
    const g = delverGeometry();
    const M = getMats();
    const rig = DELVER_RIG.make();
    this.bones = rig.bones;
    this.skeleton = rig.skeleton;
    this.root.add(rig.root);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.castShadow = shadow;
      this.root.add(m);
      return m;
    };
    this.body = mk(g.body, M.skin);
    this.body.receiveShadow = true;
    this.far = mk(g.far, M.skin);
    this.far.visible = false;
    this.bristle = mk(g.bristle, M.bristle.mat, false);
    mk(g.claws, M.horn);
    mk(g.teeth, M.horn);
    mk(g.crystals, this.crystalMat, false);
    this.light.position.set(0, 0.4, 0);
    this.bones.spine.add(this.light);
    const sc = opts.scale ?? 1;
    this.root.scale.setScalar(sc);
    this.gait = new Gait(this.bones, [
      { bones: ['fLs', 'fLe', 'fLw', 'fLt'], bend: [0.6, 0, -0.8], walk: 0.25, trot: 0, run: 0.5 },
      { bones: ['fRs', 'fRe', 'fRw', 'fRt'], bend: [-0.6, 0, -0.8], walk: 0.75, trot: 0.5, run: 0.6 },
      { bones: ['hLh', 'hLk', 'hLa', 'hLt'], bend: [0, 0, 1], walk: 0.0, trot: 0.5, run: 0.0 },
      { bones: ['hRh', 'hRk', 'hRa', 'hRt'], bend: [0, 0, 1], walk: 0.5, trot: 0.0, run: 0.1 },
    ], { stride: 0.9 * sc, lift: 0.22 * sc, dutyWalk: 0.65, dutyRun: 0.4, trotAt: 1.6 * sc, runAt: 3.5 * sc, flick: 0.2 });
  }

  setPose(p: DelverPose) {
    if (p === this.pose) return;
    if (p === 'rake') this.side = -this.side;
    this.pose = p;
    this.poseT = 0;
  }
  restart() {
    this.side = -this.side;
    this.poseT = 0;
  }

  /** The Dark in it: the crystals burn violet (0..1). */
  dark(k: number) {
    this.crystalMat.emissive.setRGB(1.6 - 0.6 * k, 0.8 - 0.5 * k, 0.25 + 2.0 * k);
    this.crystalMat.color.setHex(0xffb060).lerp(new THREE.Color(0xb070ff), k);
    this.light.color.setHex(0xffa050).lerp(new THREE.Color(0xa050ff), k);
  }

  lod(camDist: number) {
    const s = this.root.scale.x;
    this.body.visible = camDist < 45 * s;
    this.far.visible = !this.body.visible;
    this.bristle.visible = camDist < 18 * s;
  }

  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const ss = THREE.MathUtils.smoothstep;
    const speed = Math.hypot(vel.x, vel.z);
    const sc = this.root.scale.x;
    for (const n of RESET) b[n].quaternion.identity();
    b.pelvis.position.set(0, 1.1, -1.0);
    if (this.pose === 'dead') return this.deadPose(dt);
    this.deadT = 0;
    this.root.rotation.z = 0;
    const g = this.gait, ft = g.feet;
    const front = (ft[0].planted.y + ft[1].planted.y) / 2, hind = (ft[2].planted.y + ft[3].planted.y) / 2;
    const groundMid = (front + hind) / 2 - this.root.position.y;
    const pitch = Math.atan2(front - hind, 2.2 * sc);
    const phase = g.phase * Math.PI * 2;
    const run = ss(speed, 1.6 * sc, 3.6 * sc);
    const A: Record<string, number> = { pitch: 0, rise: 0, roll: Math.sin(phase) * 0.05 * (0.4 + run), chest: 0, head: 0.05, headY: 0, jaw: 0.04, tail: 0, armL: 0, armR: 0, elL: 0, elR: 0, spread: 0 };
    let grounded = true;
    switch (this.pose) {
      case 'rake': {
        // One arm up and out, then a sweeping rake across the front.
        const up = ss(pt, 0, 0.35), sweep = ss(pt, 0.4, 0.62), back = ss(pt, 0.8, 1.2);
        const arm = this.side > 0 ? 'armL' : 'armR', el = this.side > 0 ? 'elL' : 'elR';
        A[arm] = (-1.2 * up + 1.9 * sweep) * (1 - back);
        A[el] = (-0.6 * up + 0.5 * sweep) * (1 - back);
        A.spread = this.side * (0.5 * up - 1.1 * sweep) * (1 - back);
        A.headY = -this.side * 0.3 * sweep * (1 - back);
        A.roll = -this.side * 0.12 * up * (1 - back);
        A.jaw = 0.3 * up * (1 - back);
        break;
      }
      case 'rear': {
        // Up on the hind legs, both spade arms high, the feelers flared.
        const up = ss(pt, 0, 0.7);
        A.pitch = -0.75 * up; A.rise = 0.35 * up;
        A.armL = A.armR = -1.7 * up; A.elL = A.elR = -0.5 * up;
        A.head = -0.4 * up; A.jaw = 0.5 * up * (0.8 + Math.sin(t * 22) * 0.2); A.tail = -0.3 * up;
        grounded = false;
        break;
      }
      case 'slam': {
        // ...and down: the whole front comes crashing onto the ground.
        const down = ss(pt, 0, 0.22), rec = ss(pt, 0.7, 1.3);
        A.pitch = (-0.75 + 0.95 * down) * (1 - rec); A.rise = (0.35 - 0.5 * down) * (1 - rec);
        A.armL = A.armR = (-1.7 + 2.3 * down) * (1 - rec); A.elL = A.elR = (-0.5 + 0.6 * down) * (1 - rec);
        A.head = (-0.4 + 0.7 * down) * (1 - rec); A.jaw = 0.4 * (1 - rec);
        grounded = pt > 0.25;
        break;
      }
      case 'dive': {
        // Nose down, digging furiously with both arms.
        const d = ss(pt, 0, 0.4);
        A.pitch = 0.45 * d; A.head = 0.5 * d;
        A.armL = Math.sin(t * 16) * 0.8 * d - 0.3 * d; A.armR = -Math.sin(t * 16) * 0.8 * d - 0.3 * d;
        A.spread = 0.4 * d; A.tail = 0.4 * d;
        grounded = false;
        break;
      }
      case 'burst': {
        // Out of the ground nose-first, arms flung wide.
        const out = 1 - ss(pt, 0.5, 1.3);
        A.pitch = -0.6 * out; A.rise = 0.2 * out; A.armL = A.armR = -1.2 * out; A.spread = 0.8 * out;
        A.head = -0.5 * out; A.jaw = 0.6 * out;
        grounded = pt > 0.9;
        break;
      }
      case 'hurt': {
        const k = Math.exp(-pt * 5);
        A.pitch = -0.15 * k; A.head = -0.4 * k; A.headY = this.side * 0.4 * k; A.jaw = 0.4 * k; A.roll = this.side * 0.08 * k;
        break;
      }
      default:
        // Snuffling about, the head swinging low.
        A.head = 0.12 + Math.sin(t * 0.7) * 0.1;
        A.headY = Math.sin(t * 0.45) * 0.3 * (speed > 0.2 ? 0.3 : 1);
        A.chest = Math.sin(t * 1.6) * 0.02;
    }
    const kk = 1 - Math.exp(-dt * (this.pose === 'rake' || this.pose === 'slam' ? 18 : 7));
    const a = this.a;
    for (const key of Object.keys(A)) a[key] = (a[key] ?? A[key]) + (A[key] - (a[key] ?? A[key])) * kk;
    // A heavy roll from side to side as it walks; the hump rises and falls.
    b.pelvis.position.y += groundMid / sc + a.rise + (speed > 0.1 ? Math.abs(Math.sin(phase)) * 0.04 * (1 + run) : Math.sin(t * 1.4) * 0.01);
    b.pelvis.rotation.set(-pitch + a.pitch, 0, a.roll);
    b.spine.rotation.set(Math.sin(phase + 1) * 0.04 * run, a.spread * 0.15, 0);
    b.chest.rotation.set(a.chest + a.pitch * 0.2, a.spread * 0.2, 0);
    b.neck.rotation.set(a.head * 0.5 - a.pitch * 0.3, a.headY * 0.5, 0);
    b.head.rotation.set(a.head * 0.5, a.headY * 0.5, 0);
    b.jaw.rotation.x = a.jaw;
    // The feelers never stop: the star twitches and flexes.
    b.nose.rotation.set(Math.sin(t * 9) * 0.06, Math.sin(t * 7) * 0.06, Math.sin(t * 5) * 0.1);
    b.nose.scale.setScalar(1 + Math.sin(t * 11) * 0.04);
    b.tail1.rotation.set(a.tail + Math.sin(t * 1.1) * 0.05, Math.sin(phase) * 0.15 * (speed > 0.1 ? 1 : 0.2), 0);
    this.root.updateMatrixWorld(true);
    g.grounded = grounded;
    g.update(dt, this.root, vel, groundAt);
    // Arm overrides layered on the gait (a rake, the rear, the slam).
    if (Math.abs(a.armL) + Math.abs(a.armR) + Math.abs(a.elL) + Math.abs(a.elR) > 0.02) {
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      for (const [side, arm, el] of [['L', a.armL, a.elL], ['R', a.armR, a.elR]] as [string, number, number][]) {
        b[`f${side}s`].quaternion.multiply(q.setFromEuler(e.set(arm, 0, (side === 'L' ? 1 : -1) * Math.abs(a.spread) * 0.3)));
        b[`f${side}e`].quaternion.multiply(q.setFromEuler(e.set(el, 0, 0)));
      }
      this.root.updateMatrixWorld(true);
    }
    this.crystalMat.emissiveIntensity = 0.85 + Math.sin(t * 2.2) * 0.15;
  }

  private deadPose(dt: number) {
    this.deadT += dt;
    const b = this.bones;
    const k = THREE.MathUtils.smoothstep(this.deadT, 0, 1.0);
    this.root.rotation.z = Math.PI * 0.42 * k;
    b.pelvis.position.y = 1.1 - 0.25 * k;
    b.head.rotation.set(0.2 * k, 0, 0.2 * k);
    b.jaw.rotation.set(0.4 * k, 0, 0);
    for (const s of ['L', 'R']) {
      b[`f${s}s`].rotation.set(-0.4 * k, 0, (s === 'L' ? -0.5 : 0.3) * k);
      b[`f${s}e`].rotation.set(-0.6 * k, 0, 0);
      b[`h${s}h`].rotation.set(0.5 * k, 0, 0);
      b[`h${s}k`].rotation.set(-0.6 * k, 0, 0);
    }
    this.crystalMat.emissiveIntensity = Math.max(0.05, 1 - k * 0.95);
    this.light.intensity = 4 * (1 - k);
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
