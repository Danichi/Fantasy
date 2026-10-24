import * as THREE from 'three';
import { RAT_RIG, ratGeometry } from './model';
import { skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';
import { Gait } from '../kit/gait';

// A giant rat on screen: the sculpted body and coat on one skeleton, its gait
// on four planted feet, and its moves: sniffing about, the scuttle, a lunge
// and bite, rearing up on its hind legs to screech (the queen calls her
// brood like that), a whip of the tail, and dead on its back with its feet
// curled.

export type RatPose = 'idle' | 'bite' | 'rear' | 'whip' | 'hurt' | 'dead';

let mats: { skin: THREE.MeshPhysicalMaterial; coat: ReturnType<typeof tuftMaterial>; ivory: THREE.MeshStandardMaterial } | null = null;
function getMats() {
  if (mats) return mats;
  const skin = skinMaterial({ relief: 1.1, strand: 140, drift: 0.2, rough: 0.7, wetRough: 0.35, sheen: 0.3, sheenColor: 0xa89a88 });
  const coat = tuftMaterial({ sheen: 0.5, sheenColor: 0x9a8a78, rough: 0.7 });
  const ivory = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
  mats = { skin, coat, ivory };
  return mats;
}
export function tickRatFur(dt: number) {
  if (mats) mats.coat.time.value += dt;
}

const RESET = ['pelvis', 'spine', 'chest', 'neck', 'head', 'snout', 'jaw', 'earL', 'earR', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];

export class RatVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private coat: THREE.SkinnedMesh;
  private crown: THREE.SkinnedMesh;
  private eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.04, 0.02) });
  pose: RatPose = 'idle';
  poseT = 0;
  lookAt: THREE.Vector3 | null = null;
  private t = Math.random() * 10;
  private hp = 0;
  private hy = 0;
  private deadT = 0;
  private side = Math.random() < 0.5 ? 1 : -1;

  constructor(opts: { scale?: number; queen?: boolean } = {}) {
    const g = ratGeometry();
    const M = getMats();
    const rig = RAT_RIG.make();
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
    this.coat = mk(g.coat, M.coat.mat, false);
    mk(g.teeth, M.ivory);
    this.crown = mk(g.crown, M.ivory);
    this.crown.visible = !!opts.queen;
    mk(g.eyes, this.eyeMat, false);
    const sc = opts.scale ?? 1;
    this.root.scale.setScalar(sc);
    this.gait = new Gait(this.bones, [
      { bones: ['fLs', 'fLe', 'fLw', 'fLt'], bend: [0, 0, -1], walk: 0.25, trot: 0, run: 0.5 },
      { bones: ['fRs', 'fRe', 'fRw', 'fRt'], bend: [0, 0, -1], walk: 0.75, trot: 0.5, run: 0.55 },
      { bones: ['hLh', 'hLk', 'hLa', 'hLt'], bend: [0, 0, 1], walk: 0.0, trot: 0.5, run: 0.0 },
      { bones: ['hRh', 'hRk', 'hRa', 'hRt'], bend: [0, 0, 1], walk: 0.5, trot: 0.0, run: 0.05 },
    ], { stride: 0.2 * sc, lift: 0.05 * sc, dutyWalk: 0.6, dutyRun: 0.35, trotAt: 0.8 * sc, runAt: 2.2 * sc, flick: 0.4 });
  }

  setPose(p: RatPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  /** The Dark in her: the red eyes go violet. */
  dark(k: number) {
    this.eyeMat.color.setRGB(1.5 - 0.4 * k, 0.04 + 0.3 * k, 0.02 + 2.2 * k);
  }

  lod(camDist: number, fur = true) {
    const s = this.root.scale.x;
    this.body.visible = camDist < 40 * s;
    this.far.visible = !this.body.visible;
    this.coat.visible = fur && camDist < 14 * s;
  }

  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const ss = THREE.MathUtils.smoothstep;
    const speed = Math.hypot(vel.x, vel.z);
    const sc = this.root.scale.x;
    for (const n of RESET) b[n].quaternion.identity();
    b.pelvis.position.set(0, 0.34, -0.28);
    if (this.pose === 'dead') return this.deadPose(dt);
    this.deadT = 0;
    this.root.rotation.z = 0;
    const g = this.gait, ft = g.feet;
    const front = (ft[0].planted.y + ft[1].planted.y) / 2, hind = (ft[2].planted.y + ft[3].planted.y) / 2;
    const groundMid = (front + hind) / 2 - this.root.position.y;
    const pitch = Math.atan2(front - hind, 0.45 * sc);
    const phase = g.phase * Math.PI * 2;
    const run = ss(speed, 0.8 * sc, 2.4 * sc);
    // The scuttle: the back humps and flattens with each bound.
    b.pelvis.position.y += groundMid / sc + (speed > 0.05 ? Math.abs(Math.sin(phase)) * 0.02 * (1 + run) : 0);
    b.pelvis.rotation.x = -pitch + Math.sin(phase) * 0.08 * run;
    b.spine.rotation.x = Math.sin(phase + 1) * 0.1 * run;
    b.chest.rotation.x = -Math.sin(phase + 0.5) * 0.1 * run + Math.sin(t * 2.6) * 0.01;
    b.belly.scale.set(1 + Math.sin(t * 2.6) * 0.03, 1 + Math.sin(t * 2.6) * 0.02, 1);
    let hp = 0.05, hy = 0, jaw = 0, snout = 0, ears = 0, tailLift = 0, whip = 0;
    switch (this.pose) {
      case 'bite': {
        // Lunge low and snap.
        const lunge = ss(pt, 0, 0.18), back = ss(pt, 0.3, 0.6);
        hp = (-0.3 * lunge + 0.25 * ss(pt, 0.15, 0.25)) * (1 - back);
        jaw = (lunge - ss(pt, 0.2, 0.28)) * 0.6 * (1 - back);
        b.chest.rotation.x += 0.15 * lunge * (1 - back);
        ears = -1;
        break;
      }
      case 'rear': {
        // Up on the hind legs, forepaws up, screeching.
        const up = ss(pt, 0, 0.35) * (1 - ss(pt, 1.4, 1.8));
        b.pelvis.rotation.x -= 1.05 * up;
        b.pelvis.position.y += 0.05 * up;
        b.chest.rotation.x -= 0.2 * up;
        hp = -0.5 * up;
        jaw = 0.55 * up * (0.8 + Math.sin(t * 30) * 0.2);
        ears = -1;
        tailLift = 0.4 * up;
        break;
      }
      case 'whip': {
        // Turn half away and lash the tail across.
        const w = ss(pt, 0, 0.15) - ss(pt, 0.35, 0.6);
        whip = this.side * (ss(pt, 0, 0.12) * 1.6 - ss(pt, 0.12, 0.3) * 3.2) * (1 - ss(pt, 0.4, 0.7));
        b.spine.rotation.y = this.side * 0.4 * w;
        tailLift = 0.5 * w;
        break;
      }
      case 'hurt': {
        const k = Math.exp(-pt * 6);
        hp = -0.3 * k;
        hy = this.side * 0.4 * k;
        jaw = 0.3 * k;
        break;
      }
      default:
        // Nose always going, head bobbing about.
        hp = 0.12 + Math.sin(t * 0.8) * 0.12 + (speed > 0.1 ? 0.1 : 0);
        hy = Math.sin(t * 0.5) * 0.35 * (speed > 0.1 ? 0.3 : 1);
        snout = Math.sin(t * 22) * 0.06 * Math.max(0, Math.sin(t * 1.1));
    }
    if (this.lookAt && this.pose === 'idle') {
      const local = this.root.worldToLocal(this.lookAt.clone());
      hy = THREE.MathUtils.clamp(Math.atan2(local.x, local.z - 0.4), -0.8, 0.8);
    }
    const k = 1 - Math.exp(-dt * (this.pose === 'bite' || this.pose === 'whip' ? 30 : 8));
    this.hp += (hp - this.hp) * k;
    this.hy += (hy - this.hy) * k;
    b.neck.rotation.set(this.hp * 0.45, this.hy * 0.4, 0);
    b.head.rotation.set(this.hp * 0.55, this.hy * 0.6, 0);
    b.snout.rotation.set(snout, 0, 0);
    b.jaw.rotation.set(jaw, 0, 0);
    for (const [e, s] of [[b.earL, 1], [b.earR, -1]] as [THREE.Bone, number][]) e.rotation.set(ears < 0 ? 0.6 : Math.sin(t * 3 + s) * 0.08, 0, s * (ears < 0 ? -0.4 : 0));
    // The tail trails, lifts and swings, and lashes on the whip.
    const tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];
    tail.forEach((n, i) => b[n].rotation.set(-tailLift * (i < 2 ? 0.5 : 0) + Math.sin(phase + i) * 0.04 * run + (i > 1 ? 0.05 : 0), Math.sin(t * 1.4 - i * 0.6) * 0.12 + whip * (0.15 + i * 0.05) + Math.sin(phase - i * 0.7) * 0.1 * run, 0));
    this.root.updateMatrixWorld(true);
    g.grounded = this.pose !== 'rear';
    g.update(dt, this.root, vel, groundAt);
  }

  private deadPose(dt: number) {
    this.deadT += dt;
    const b = this.bones;
    const k = THREE.MathUtils.smoothstep(this.deadT, 0, 0.6);
    this.root.rotation.z = this.side * Math.PI * 0.85 * k;
    b.pelvis.position.y = 0.34 - 0.1 * k;
    b.head.rotation.set(-0.3 * k, 0, 0);
    b.jaw.rotation.set(0.35 * k, 0, 0);
    for (const leg of ['fL', 'fR', 'hL', 'hR']) {
      const front = leg[0] === 'f';
      const names = front ? ['s', 'e', 'w'] : ['h', 'k', 'a'];
      const twitch = this.deadT < 1.5 ? Math.sin(this.deadT * 20) * 0.2 * (1 - this.deadT / 1.5) : 0;
      b[leg + names[0]].rotation.set((front ? 0.9 : -0.7) * k + twitch, 0, 0);
      b[leg + names[1]].rotation.set((front ? -1.2 : 1.1) * k, 0, 0);
      b[leg + names[2]].rotation.set((front ? 0.8 : -0.9) * k, 0, 0);
    }
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
