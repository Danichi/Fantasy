import * as THREE from 'three';
import { WOLF_RIG, wolfGeometry } from './model';
import { eyeMaterial, hardMaterial, skinMaterial } from '../kit/materials';
import { Gait } from '../kit/gait';
import { tuftMaterial } from '../kit/tufts';

// A wolf on screen: lean body over long legs that walk, trot and gallop with
// planted paws; a head that lowers to stalk, lifts to howl and snaps to bite;
// ears that prick and pin; a brush tail carried low, raised in a charge,
// tucked when hurt.
//
// Looks: the grey wolf; the pack leader (bigger, darker); and the gloam wolf,
// a wolf come through from the Dark: near-black, its fur tips smouldering
// violet and its eyes lit.

export type WolfPose = 'idle' | 'stalk' | 'alert' | 'snarl' | 'lunge' | 'howl' | 'hurt' | 'dead';
export type WolfLook = 'grey' | 'leader' | 'gloam';

interface Mats {
  skin: THREE.MeshPhysicalMaterial;
  coat: ReturnType<typeof tuftMaterial>;
  eye: THREE.MeshPhysicalMaterial;
}
const mats = new Map<WolfLook, Mats>();
let teeth: THREE.MeshPhysicalMaterial | null = null;
let pupil: THREE.MeshPhysicalMaterial | null = null;
const coats: ReturnType<typeof tuftMaterial>[] = [];

function matsFor(look: WolfLook): Mats {
  let m = mats.get(look);
  if (m) return m;
  const skin = skinMaterial({ relief: 1.0, strand: 130, drift: 0.12, rough: 0.86, wetRough: 0.25, sheen: 0.4, sheenColor: 0xc8bca8 });
  const coat = tuftMaterial({ sheen: 0.5, sheenColor: look === 'gloam' ? 0x8a6ab8 : 0xd0c4ae, tipGlow: look === 'gloam' ? 0x22104a : 0x000000 });
  const eye = eyeMaterial(look === 'gloam' ? 0x0c0612 : 0xc88a1c);
  if (look === 'leader') {
    skin.color.set(0x7c7a80);
    coat.mat.color.set(0x76747a);
  } else if (look === 'gloam') {
    skin.color.set(0x1c1a20);
    skin.emissive.set(0x12061e);
    coat.mat.color.set(0x1e1b24);
    eye.emissive.set(0xb070ff);
    eye.emissiveIntensity = 2.2;
  } else {
    eye.emissive.set(0x2a1600);
    eye.emissiveIntensity = 0.4;
  }
  m = { skin, coat, eye };
  mats.set(look, m);
  coats.push(coat);
  return m;
}
export function tickWolfFur(dt: number) {
  for (const c of coats) c.time.value += dt;
}

const RESET = ['pelvis', 'spine', 'chest', 'neck', 'head', 'jaw', 'earL', 'earR', 'tail1', 'tail2', 'tail3', 'tail4'];

export class WolfVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  readonly look: WolfLook;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private coat: THREE.SkinnedMesh;
  private details: THREE.SkinnedMesh[] = [];
  pose: WolfPose = 'idle';
  poseT = 0;
  lookAt: THREE.Vector3 | null = null;
  private t = Math.random() * 100;
  private headYaw = 0;
  private headPitch = 0;
  private jaw = 0;
  private crouch = 0;
  private tailLift = 0;
  private earTwitch = [0, 0];
  private deadT = 0;
  private side = Math.random() < 0.5 ? 1 : -1;

  constructor(opts: { scale?: number; look?: WolfLook } = {}) {
    const g = wolfGeometry();
    this.look = opts.look ?? 'grey';
    const M = matsFor(this.look);
    teeth ??= hardMaterial(0xffffff, { vertexColors: true, rough: 0.35, clearcoat: 0.5 });
    pupil ??= eyeMaterial(0x050404);
    const rig = WOLF_RIG.make();
    this.bones = rig.bones;
    this.skeleton = rig.skeleton;
    this.root.add(rig.root);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.body = mk(g.body, M.skin);
    this.body.castShadow = this.body.receiveShadow = true;
    this.far = mk(g.far, M.skin);
    this.far.castShadow = true;
    this.far.visible = false;
    this.coat = mk(g.coat, M.coat.mat);
    this.coat.castShadow = true;
    this.details.push(mk(g.teeth, teeth), mk(g.eyes, M.eye), mk(g.pupils, pupil));
    const sc = opts.scale ?? 1;
    this.root.scale.setScalar(sc);
    this.gait = new Gait(this.bones, [
      { bones: ['fLs', 'fLe', 'fLw', 'fLt'], bend: [0, 0, -1], walk: 0.25, trot: 0, run: 0.55 },
      { bones: ['fRs', 'fRe', 'fRw', 'fRt'], bend: [0, 0, -1], walk: 0.75, trot: 0.5, run: 0.65 },
      { bones: ['hLh', 'hLk', 'hLa', 'hLt'], bend: [0, 0, 1], walk: 0.0, trot: 0.5, run: 0.0 },
      { bones: ['hRh', 'hRk', 'hRa', 'hRt'], bend: [0, 0, 1], walk: 0.5, trot: 0.0, run: 0.1 },
    ], { stride: 0.55 * sc, lift: 0.08 * sc, dutyWalk: 0.62, dutyRun: 0.32, trotAt: 1.8 * sc, runAt: 4.8 * sc, flick: 0.8 });
  }

  setPose(p: WolfPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  lod(camDist: number, furOn = true) {
    this.body.visible = camDist < 60;
    this.far.visible = !this.body.visible;
    this.coat.visible = furOn && camDist < 40;
    for (const d of this.details) d.visible = camDist < 28;
  }

  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const speed = Math.hypot(vel.x, vel.z);
    const sc = this.root.scale.x;
    for (const n of RESET) b[n].quaternion.identity();
    b.pelvis.position.set(0, 0.76, -0.42);
    if (this.pose === 'dead') {
      this.deadPose(dt);
      return;
    }
    this.deadT = 0;
    this.root.rotation.z = 0;
    const k = (r: number) => 1 - Math.exp(-dt * r);

    // Body height and pitch from the ground under the paws; a low crouch to stalk.
    const g = this.gait, ft = g.feet;
    const front = (ft[0].planted.y + ft[1].planted.y) / 2, hind = (ft[2].planted.y + ft[3].planted.y) / 2;
    const groundMid = (front + hind) / 2 - this.root.position.y;
    const pitch = Math.atan2(front - hind, 0.8 * sc);
    const phase = g.phase * Math.PI * 2;
    const run = THREE.MathUtils.smoothstep(speed, 3, 6);
    const crouch = this.pose === 'stalk' ? 1 : this.pose === 'snarl' ? 0.55 : this.pose === 'lunge' ? 0.2 : 0;
    this.crouch += (crouch - this.crouch) * k(6);
    const bob = speed > 0.1 ? Math.abs(Math.sin(phase * (run > 0.5 ? 1 : 2))) * (0.01 + run * 0.03) : 0;
    const breathe = Math.sin(t * (speed > 3 || this.pose === 'snarl' ? 7 : 2.2));
    b.pelvis.position.y += groundMid / sc + bob - this.crouch * 0.13;
    b.pelvis.rotation.x = -pitch + (run > 0 ? Math.sin(phase) * 0.09 * run : 0) + this.crouch * 0.05;
    // The gallop: the spine flexes and extends with each bound.
    b.spine.rotation.x = run > 0 ? Math.sin(phase + 1.3) * 0.08 * run : 0;
    b.chest.rotation.x = (run > 0 ? -Math.sin(phase + 0.5) * 0.1 * run : breathe * 0.01) + this.crouch * 0.12;

    // Head and jaw by pose.
    let hp = 0, hy = 0, jaw = 0, ears = 0, tail = 0;
    switch (this.pose) {
      case 'stalk':
        hp = 0.32; ears = 1; tail = -0.25;
        break;
      case 'alert':
        hp = -0.18; ears = 1; tail = 0.25;
        break;
      case 'snarl':
        // Head low, lips back, a rumbling growl.
        hp = 0.3; ears = -1; tail = 0.1;
        jaw = 0.16 + Math.sin(t * 22) * 0.02;
        break;
      case 'lunge': {
        const open = THREE.MathUtils.smoothstep(pt, 0, 0.12), shut = THREE.MathUtils.smoothstep(pt, 0.2, 0.3);
        hp = 0.15 - 0.15 * shut; ears = -1; tail = 0.3;
        jaw = 0.55 * open * (1 - shut);
        break;
      }
      case 'howl': {
        // Muzzle to the sky.
        const up = THREE.MathUtils.smoothstep(pt, 0, 0.5) * (1 - THREE.MathUtils.smoothstep(pt, 2.6, 3.1));
        hp = -1.05 * up; ears = 0; tail = -0.2;
        jaw = (0.28 + Math.sin(pt * 3) * 0.04) * up;
        break;
      }
      case 'hurt': {
        const e = Math.exp(-pt * 6);
        hp = -0.3 * e; hy = this.side * 0.4 * e; ears = -1; tail = -0.8;
        jaw = 0.3 * e;
        b.spine.rotation.z = this.side * 0.15 * e;
        break;
      }
      default:
        hp = 0.05 + Math.sin(t * 0.33) * 0.05 + (speed > 2 ? 0.12 : 0);
        hy = Math.sin(t * 0.21) * 0.25 * (speed > 0.1 ? 0.25 : 1);
        jaw = speed > 3 ? 0.12 + Math.sin(phase * 2) * 0.03 : 0; // panting at a run
        tail = speed > 4 ? 0.35 : 0;
    }
    if (this.lookAt && this.pose !== 'howl' && this.pose !== 'lunge') {
      const local = this.root.worldToLocal(this.lookAt.clone());
      hy = THREE.MathUtils.clamp(Math.atan2(local.x, local.z - 0.6), -0.8, 0.8);
      hp += THREE.MathUtils.clamp(-Math.atan2(local.y - 0.8, Math.hypot(local.x, local.z)) * 0.5, -0.3, 0.3);
    }
    const fast = this.pose === 'lunge' || this.pose === 'hurt' ? 28 : 7;
    this.headPitch += (hp - this.headPitch) * k(fast);
    this.headYaw += (hy - this.headYaw) * k(fast);
    this.jaw += (jaw - this.jaw) * k(this.pose === 'lunge' ? 40 : 12);
    b.neck.rotation.set(this.headPitch * 0.5, this.headYaw * 0.45, 0);
    b.head.rotation.set(this.headPitch * 0.5, this.headYaw * 0.55, -this.headYaw * 0.12);
    b.jaw.rotation.set(this.jaw, 0, 0);

    // Ears.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      if (Math.random() < dt * 0.3) this.earTwitch[i] = 1;
      this.earTwitch[i] = Math.max(0, this.earTwitch[i] - dt * 6);
      const tw = Math.sin(this.earTwitch[i] * Math.PI * 3) * 0.3 * this.earTwitch[i];
      b[i === 0 ? 'earL' : 'earR'].rotation.set(ears < 0 ? 0.85 : ears > 0 ? -0.2 : tw * 0.5, s * (ears < 0 ? 0.35 : -0.05 + tw), s * (ears < 0 ? -0.3 : tw * 0.4));
    }
    // Tail: hangs and sways; up in a chase, tucked when hurt.
    this.tailLift += (tail - this.tailLift) * k(5);
    const sway = Math.sin(t * (speed > 0.1 ? 5 : 1.6)) * (speed > 3 ? 0.12 : 0.25);
    b.tail1.rotation.set(-this.tailLift * 1.1 + Math.sin(phase) * 0.08 * Math.min(1, speed), sway * 0.4, 0);
    b.tail2.rotation.set(-this.tailLift * 0.5, sway * 0.6, 0);
    b.tail3.rotation.set(-this.tailLift * 0.2, sway * 0.8, 0);
    b.tail4.rotation.set(0, sway, 0);

    this.root.updateMatrixWorld(true);
    g.grounded = true;
    g.update(dt, this.root, vel, groundAt);
  }

  private deadPose(dt: number) {
    this.deadT += dt;
    const b = this.bones;
    const k = THREE.MathUtils.smoothstep(this.deadT, 0, 0.6);
    const full = this.side * (Math.PI / 2 - 0.15);
    this.root.rotation.z = full * k;
    b.pelvis.position.y = 0.76 - 0.03 * k;
    b.pelvis.position.x = (k * (0.15 - 0.73 * Math.cos(full))) / Math.sin(full);
    b.neck.rotation.set(-0.3 * k, 0, 0);
    b.head.rotation.set(-0.2 * k, 0, this.side * 0.25 * k);
    b.jaw.rotation.set(0.15 * k, 0, 0);
    b.earL.rotation.set(0.7 * k, 0, 0);
    b.earR.rotation.set(0.7 * k, 0, 0);
    b.tail1.rotation.set(0.3 * k, 0, 0);
    for (const leg of ['fL', 'fR', 'hL', 'hR']) {
      const front = leg[0] === 'f';
      const kick = this.deadT < 1 ? Math.sin(this.deadT * 18) * 0.2 * (1 - this.deadT) : 0;
      const n = front ? ['s', 'e', 'w'] : ['h', 'k', 'a'];
      b[leg + n[0]].rotation.set((front ? 0.6 : -0.5) * k + kick, 0, 0);
      b[leg + n[1]].rotation.set((front ? -0.5 : 0.6) * k, 0, 0);
      b[leg + n[2]].rotation.set((front ? 0.4 : -0.3) * k, 0, 0);
    }
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
