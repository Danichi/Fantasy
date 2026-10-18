import * as THREE from 'three';
import { BOAR_RIG, boarGeometry } from './model';
import { eyeMaterial, hardMaterial, shellMaterials, skinMaterial } from '../kit/materials';
import { Gait } from '../kit/gait';
import { tuftMaterial } from '../kit/tufts';

// A living boar on screen: the sculpted body, shell fur up close, tusks and
// eyes, all on one skeleton, plus the procedural animation: planted hooves,
// a bobbing heavy front, a head that roots, looks and hooks, twitching ears,
// a swishing tail and breathing flanks.

export type BoarPose = 'idle' | 'move' | 'root' | 'alert' | 'charge' | 'gore' | 'hurt' | 'dead';

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared(layers: number, soft: boolean) {
  const g = boarGeometry();
  const skin = skinMaterial({ relief: 0.9, strand: 120, drift: 0.14, rough: 0.88, wetRough: 0.28, sheen: 0.35, sheenColor: 0xb59a80 });
  const shells = shellMaterials({ layers, density: 260, thick: 0.4, comb: 1.1, droop: 0.3, rootDark: 0.5, tipLight: 0.6, scale: 1, clump: 0.55, clumpSize: 4, soft });
  const tuft = tuftMaterial({ sheen: 0.45, sheenColor: 0xc0a688 });
  const ivory = hardMaterial(0xffffff, { vertexColors: true, rough: 0.5, clearcoat: 0.25 });
  const eye = eyeMaterial();
  return { g, skin, shells, tuft, ivory, eye };
}
export function boarShared(layers = 0, soft = true) {
  return (shared ??= makeShared(layers, soft));
}
/** Advance the fur sway clock (once per frame, for every boar). */
export function tickBoarFur(dt: number) {
  if (shared) {
    shared.shells.time.value += dt;
    shared.tuft.time.value += dt;
  }
}

export class BoarVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private shells: THREE.SkinnedMesh[] = [];
  private extras: THREE.SkinnedMesh[] = [];
  private coat: THREE.SkinnedMesh;
  private crest: THREE.SkinnedMesh;
  pose: BoarPose = 'idle';
  /** Seconds into the current pose. */
  poseT = 0;
  /** World point the head turns toward (optional). */
  lookAt: THREE.Vector3 | null = null;
  private t = Math.random() * 100;
  private earTwitch = [0, 0];
  private headYaw = 0;
  private headPitch = 0;
  private deadT = 0;
  private side = Math.random() < 0.5 ? 1 : -1;

  constructor(opts: { scale?: number; furLayers?: number } = {}) {
    const S = boarShared(opts.furLayers);
    const rig = BOAR_RIG.make();
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
    this.body = mk(S.g.body, S.skin);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.far = mk(S.g.far, S.skin);
    this.far.castShadow = true;
    this.far.visible = false;
    for (const m of S.shells.mats) {
      const s = mk(S.g.mid, m);
      s.receiveShadow = true;
      this.shells.push(s);
    }
    this.coat = mk(S.g.coat, S.tuft.mat);
    this.coat.castShadow = false; // the body's shadow is enough; the crest still casts
    this.crest = mk(S.g.crest, S.tuft.mat);
    this.crest.castShadow = true;
    this.extras.push(mk(S.g.ivory, S.ivory), mk(S.g.eyes, S.eye));
    this.extras[0].castShadow = true;
    const sc = opts.scale ?? 1;
    this.root.scale.setScalar(sc);
    this.gait = new Gait(this.bones, [
      { bones: ['fLs', 'fLe', 'fLw', 'fLt'], bend: [0, 0, -1], walk: 0.25, trot: 0, run: 0.5 },
      { bones: ['fRs', 'fRe', 'fRw', 'fRt'], bend: [0, 0, -1], walk: 0.75, trot: 0.5, run: 0.6 },
      { bones: ['hLh', 'hLk', 'hLa', 'hLt'], bend: [0, 0, 1], walk: 0.0, trot: 0.5, run: 0.0 },
      { bones: ['hRh', 'hRk', 'hRa', 'hRt'], bend: [0, 0, 1], walk: 0.5, trot: 0.0, run: 0.1 },
    ], { stride: 0.42 * sc, lift: 0.065 * sc, dutyWalk: 0.64, dutyRun: 0.36, trotAt: 1.9 * sc, runAt: 4.2 * sc, flick: 0.5 });
  }

  setPose(p: BoarPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  /** Fur and detail by distance to the camera. */
  lod(camDist: number, furOn = true) {
    const near = camDist < 26;
    const shellN = !furOn || camDist > 24 ? 0 : camDist > 14 ? Math.ceil(this.shells.length / 2) : this.shells.length;
    this.shells.forEach((s, i) => (s.visible = i < shellN && (shellN === this.shells.length || i % 2 === 1)));
    this.body.visible = camDist < 55;
    this.coat.visible = camDist < 34;
    this.crest.visible = camDist < 70;
    this.far.visible = !this.body.visible;
    this.extras[1].visible = near;
  }

  /** Call after setting root position/rotation for this frame. vel is world m/s. */
  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones;
    const t = this.t;
    const speed = Math.hypot(vel.x, vel.z);
    const sc = this.root.scale.x;

    // Reset the posed bones we drive by rotation each frame.
    for (const n of ['pelvis', 'spine', 'chest', 'neck', 'head', 'snout', 'jaw', 'earL', 'earR', 'tail1', 'tail2', 'tail3']) b[n].quaternion.identity();
    b.pelvis.position.set(0, 0.66, -0.34);

    if (this.pose === 'dead') {
      this.deadPose(dt);
      return;
    }
    this.deadT = 0;
    this.root.rotation.z = 0;

    // Body over the feet: height from the ground under them, pitch from front vs hind.
    const g = this.gait;
    const ft = g.feet;
    const front = (ft[0].planted.y + ft[1].planted.y) / 2, hind = (ft[2].planted.y + ft[3].planted.y) / 2;
    const groundMid = (front + hind) / 2 - this.root.position.y;
    const pitch = Math.atan2(front - hind, 0.75 * sc);
    const phase = g.phase * Math.PI * 2;
    const run = THREE.MathUtils.smoothstep(speed, 2.5, 5);
    const bob = speed > 0.08 ? Math.abs(Math.sin(phase * (run > 0.5 ? 1 : 2))) * (0.012 + run * 0.035) : 0;
    const breathe = Math.sin(t * (this.pose === 'charge' || speed > 3 ? 5.5 : 1.9));
    b.pelvis.position.y += groundMid / sc + bob - 0.01 * run;
    b.pelvis.rotation.x = -pitch + (run > 0 ? Math.sin(phase) * 0.06 * run : 0);
    b.spine.rotation.x = run > 0 ? Math.sin(phase + 1.2) * 0.05 * run : 0;
    b.chest.rotation.x = run > 0 ? -Math.sin(phase + 0.6) * 0.07 * run : breathe * 0.008;
    // Waddle: the heavy front rolls a little with each step.
    b.chest.rotation.z = speed > 0.08 ? Math.sin(phase) * 0.035 * (1 - run) : 0;
    b.belly.scale.set(1 + breathe * 0.025, 1 + breathe * 0.02, 1);

    // Head: by pose, then turned toward what it is looking at.
    let hp = 0, hy = 0, jaw = 0, ears = 0, snout = 0;
    const pt = this.poseT;
    switch (this.pose) {
      case 'root': {
        // Nose to the ground, shoving and snuffling.
        hp = 0.55 + Math.sin(t * 3.1) * 0.08 + Math.max(0, Math.sin(t * 7.3)) * 0.06;
        hy = Math.sin(t * 0.9) * 0.25;
        snout = Math.sin(t * 17) * 0.05;
        jaw = Math.max(0, Math.sin(t * 5.7)) * 0.06;
        break;
      }
      case 'alert':
        hp = -0.12;
        ears = 1;
        snout = Math.sin(t * 13) * 0.04 * (Math.sin(t * 1.3) > 0 ? 1 : 0); // sniffing
        break;
      case 'charge':
        hp = 0.32 + Math.sin(phase * 2) * 0.05;
        ears = -1;
        break;
      case 'gore': {
        // Wind up low, then hook the tusks up and across.
        const wind = THREE.MathUtils.smoothstep(pt, 0, 0.28), hook = THREE.MathUtils.smoothstep(pt, 0.28, 0.42), back = THREE.MathUtils.smoothstep(pt, 0.55, 0.95);
        hp = (0.45 * wind - 0.95 * hook) * (1 - back);
        hy = this.side * (0.25 * wind - 0.55 * hook) * (1 - back);
        jaw = hook * 0.25 * (1 - back);
        ears = -1;
        b.chest.rotation.x += (-0.12 * hook + 0.08 * wind) * (1 - back);
        break;
      }
      case 'hurt': {
        const k = Math.exp(-pt * 6);
        hp = -0.35 * k;
        hy = this.side * 0.3 * k;
        b.spine.rotation.z = this.side * 0.12 * k;
        ears = -1;
        jaw = 0.2 * k;
        break;
      }
      default: {
        // Idle and walking: a slow look around, an occasional sniff.
        hp = 0.08 + Math.sin(t * 0.37) * 0.06 + (speed > 0.1 ? 0.06 : 0);
        hy = Math.sin(t * 0.23) * 0.22 * (speed > 0.1 ? 0.3 : 1);
        snout = Math.sin(t * 15) * 0.03 * Math.max(0, Math.sin(t * 0.7));
      }
    }
    if (this.lookAt && this.pose !== 'gore' && this.pose !== 'root') {
      const local = this.root.worldToLocal(this.lookAt.clone());
      const yaw = Math.atan2(local.x, local.z - 0.6);
      hy = THREE.MathUtils.clamp(yaw, -0.7, 0.7);
      hp += THREE.MathUtils.clamp(-Math.atan2(local.y - 0.6, Math.hypot(local.x, local.z)) * 0.5, -0.3, 0.3);
    }
    const k = 1 - Math.exp(-dt * (this.pose === 'gore' || this.pose === 'hurt' ? 30 : 7));
    this.headPitch += (hp - this.headPitch) * k;
    this.headYaw += (hy - this.headYaw) * k;
    b.neck.rotation.set(this.headPitch * 0.45, this.headYaw * 0.4, 0);
    b.head.rotation.set(this.headPitch * 0.55, this.headYaw * 0.6, -this.headYaw * 0.15);
    b.snout.rotation.set(snout, 0, 0);
    b.jaw.rotation.set(jaw, 0, 0);

    // Ears: pricked forward when alert, pinned back when angry, flicking otherwise.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      if (Math.random() < dt * 0.35) this.earTwitch[i] = 1;
      this.earTwitch[i] = Math.max(0, this.earTwitch[i] - dt * 6);
      const tw = Math.sin(this.earTwitch[i] * Math.PI * 3) * 0.35 * this.earTwitch[i];
      const e = b[i === 0 ? 'earL' : 'earR'];
      e.rotation.set(ears < 0 ? 0.7 : ears > 0 ? -0.25 : tw * 0.6, s * (ears < 0 ? 0.3 : -0.1 + tw), s * (ears < 0 ? -0.35 : 0.05 + tw * 0.5));
    }
    // Tail: hangs, swishes, lifts stiff when charging.
    const swish = Math.sin(t * (speed > 0.1 ? 6 : 2.2)) * (this.pose === 'charge' ? 0.15 : 0.35);
    const lift = this.pose === 'charge' || this.pose === 'alert' ? -0.9 : 0;
    b.tail1.rotation.set(lift + Math.sin(phase) * 0.1, swish * 0.5, 0);
    b.tail2.rotation.set(lift * 0.4, swish * 0.7, 0);
    b.tail3.rotation.set(0, swish, 0);

    this.root.updateMatrixWorld(true);
    g.grounded = true;
    g.update(dt, this.root, vel, groundAt);
  }

  /** Over on its side, legs gone slack. */
  private deadPose(dt: number) {
    this.deadT += dt;
    const b = this.bones;
    const k = THREE.MathUtils.smoothstep(this.deadT, 0, 0.7);
    // Rolled onto its side about the hooves' line: lift the body so its flank, not its spine, rests on the ground.
    const full = this.side * (Math.PI / 2 - 0.16);
    this.root.rotation.z = full * k;
    b.pelvis.position.y = 0.66 - 0.04 * k;
    b.pelvis.position.x = k * (0.19 - 0.62 * Math.cos(full)) / Math.sin(full);
    b.neck.rotation.set(-0.2 * k, 0, 0);
    b.head.rotation.set(-0.15 * k, 0, this.side * 0.2 * k);
    b.jaw.rotation.set(0.2 * k, 0, 0);
    b.earL.rotation.set(0.6 * k, 0, 0);
    b.earR.rotation.set(0.6 * k, 0, 0);
    for (const leg of ['fL', 'fR', 'hL', 'hR']) {
      const front = leg[0] === 'f';
      const kick = this.deadT < 1.2 ? Math.sin(this.deadT * 16) * 0.25 * (1 - this.deadT / 1.2) : 0;
      const names = front ? ['s', 'e', 'w'] : ['h', 'k', 'a'];
      b[leg + names[0]].rotation.set((front ? 0.5 : -0.4) * k + kick, 0, 0);
      b[leg + names[1]].rotation.set((front ? -0.6 : 0.7) * k, 0, 0);
      b[leg + names[2]].rotation.set((front ? 0.5 : -0.4) * k, 0, 0);
    }
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
