import * as THREE from 'three';
import { SPIDER_LEGS, SPIDER_RIG, spiderGeometry } from './model';
import { eyeMaterial, hardMaterial, skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';
import { Gait, type LegSpec } from '../kit/gait';

// A living spider: eight legs stepping in two alternating sets of four, the
// body riding level over them, feelers tapping, the abdomen breathing. It
// rears up with its front legs raised and fangs spread before it strikes,
// lunges to bite, tips its abdomen over its back to fling web, and curls its
// legs in when it dies.

export type SpiderPose = 'idle' | 'move' | 'threat' | 'crouch' | 'bite' | 'spit' | 'hurt' | 'dead';

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const g = spiderGeometry();
  const skin = skinMaterial({ relief: 2.6, strand: 160, drift: 0.12, rough: 0.7, wetRough: 0.32, sheen: 0.4, sheenColor: 0xa08868 });
  skin.clearcoat = 0.35;
  skin.clearcoatRoughness = 0.4;
  const hair = tuftMaterial({ sheen: 0.5, sheenColor: 0xb8a080, rough: 0.8 });
  const fang = hardMaterial(0xffffff, { vertexColors: true, rough: 0.25, clearcoat: 0.8 });
  const eye = eyeMaterial(0x0a0404);
  eye.emissive = new THREE.Color(0x1a0303);
  eye.emissiveIntensity = 0.5;
  return { g, skin, hair, fang, eye };
}
export function spiderShared() {
  return (shared ??= makeShared());
}
export function tickSpiderFur(dt: number) {
  if (shared) shared.hair.time.value += dt;
}

const LEG_NAMES = SPIDER_LEGS.map((l) => l.name);

export class SpiderVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private hair: THREE.SkinnedMesh;
  private setae: THREE.SkinnedMesh;
  private eyes: THREE.SkinnedMesh;
  pose: SpiderPose = 'idle';
  poseT = 0;
  lookAt: THREE.Vector3 | null = null;
  private t = Math.random() * 100;
  private pitch = 0;
  private roll = 0;
  private lift = 0;
  private lunge = 0;
  private tail = 0;
  private spread = 0;
  private deadT = 0;
  private tap = [0, 0];
  private readonly sc: number;
  private readonly over: THREE.Vector3[];

  constructor(opts: { scale?: number } = {}) {
    const S = spiderShared();
    const rig = SPIDER_RIG.make();
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
    this.body.castShadow = this.body.receiveShadow = true;
    this.far = mk(S.g.far, S.skin);
    this.far.castShadow = true;
    this.far.visible = false;
    this.hair = mk(S.g.hair, S.hair.mat);
    this.hair.castShadow = true;
    this.setae = mk(S.g.setae, S.hair.mat);
    mk(S.g.fangs, S.fang).castShadow = true;
    this.eyes = mk(S.g.eyes, S.eye);
    this.sc = opts.scale ?? 1;
    this.root.scale.setScalar(this.sc);
    // Two alternating sets of four: L0 R1 L2 R3, then R0 L1 R2 L3.
    const legs: LegSpec[] = SPIDER_LEGS.map((l) => {
      const setA = (l.side > 0) === (l.index % 2 === 0);
      const wave = l.index * 0.06; // a ripple from front to back within each set
      return {
        bones: [`${l.name}a`, `${l.name}b`, `${l.name}c`, `${l.name}d`],
        bend: [l.side * 0.35, 1, 0.05],
        walk: (setA ? 0 : 0.5) + wave,
        trot: (setA ? 0 : 0.5) + wave * 0.5,
        run: setA ? 0 : 0.5,
      };
    });
    this.gait = new Gait(this.bones, legs, { stride: 0.46 * this.sc, lift: 0.13 * this.sc, dutyWalk: 0.55, dutyRun: 0.42, trotAt: 2 * this.sc, runAt: 4.5 * this.sc, flick: 0.25 });
    this.gait.overrideRate = 9;
    this.over = SPIDER_LEGS.map(() => new THREE.Vector3());
  }

  setPose(p: SpiderPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  lod(camDist: number, furOn = true) {
    this.body.visible = camDist < 60;
    this.far.visible = !this.body.visible;
    this.hair.visible = furOn && camDist < 32;
    this.setae.visible = furOn && camDist < 45;
    this.eyes.visible = camDist < 40;
  }

  /** A point in the spider's own space, to world. */
  private local(x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(x, y, z).applyMatrix4(this.root.matrixWorld);
  }

  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    for (const n of ['body', 'abdomen', 'spin', 'chelL', 'chelR', 'fangL', 'fangR', 'palpL0', 'palpL1', 'palpL2', 'palpR0', 'palpR1', 'palpR2']) b[n].quaternion.identity();
    b.body.position.set(0, 0.48, 0.14);
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    const dead = this.pose === 'dead';

    // Targets by pose.
    let lift = 0, lunge = 0, tail = 0, spread = 0, pitch = 0;
    if (this.pose === 'threat') {
      lift = 1;
      spread = 1;
      pitch = -0.3;
    } else if (this.pose === 'crouch') {
      // Sinking low, gathering for the leap.
      lift = -0.75;
      spread = 0.6;
      pitch = 0.08;
    } else if (this.pose === 'bite') {
      const a = THREE.MathUtils.smoothstep(pt, 0, 0.14), r = THREE.MathUtils.smoothstep(pt, 0.3, 0.6);
      lunge = a * (1 - r);
      spread = 1 - a * 0.8;
      pitch = 0.18 * a * (1 - r);
    } else if (this.pose === 'spit') {
      tail = THREE.MathUtils.smoothstep(pt, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(pt, 0.8, 1.2));
      pitch = 0.12 * tail;
    } else if (this.pose === 'hurt') {
      const e = Math.exp(-pt * 7);
      pitch = -0.2 * e;
      spread = 0.6 * e;
    }
    this.lift += (lift - this.lift) * k(8);
    this.lunge += (lunge - this.lunge) * k(this.pose === 'bite' ? 30 : 10);
    this.tail += (tail - this.tail) * k(9);
    this.spread += (spread - this.spread) * k(14);

    // Body over the feet: height and tilt from where the feet stand.
    const ft = this.gait.feet;
    let front = 0, back = 0, left = 0, right = 0;
    for (const f of ft) {
      const l = SPIDER_LEGS[ft.indexOf(f)];
      if (l.index < 2) front += f.planted.y / 4;
      else back += f.planted.y / 4;
      if (l.side > 0) left += f.planted.y / 4;
      else right += f.planted.y / 4;
    }
    const groundMid = (front + back) / 2 - this.root.position.y;
    const terrainPitch = Math.atan2(front - back, 0.6 * this.sc);
    const terrainRoll = Math.atan2(left - right, 1.2 * this.sc);
    this.pitch += (-terrainPitch + pitch - this.pitch) * k(8);
    this.roll += (terrainRoll - this.roll) * k(8);
    const speed = Math.hypot(vel.x, vel.z);
    const bob = speed > 0.1 ? Math.abs(Math.sin(this.gait.phase * Math.PI * 4)) * 0.012 : Math.sin(t * 1.7) * 0.004;
    if (!dead) {
      b.body.position.y += groundMid / this.sc + bob + this.lift * 0.16 - this.lunge * 0.06;
      b.body.position.z += this.lunge * 0.32;
      b.body.rotation.set(this.pitch, 0, this.roll);
      // Abdomen: breathes, sways with the gait, tips over the back to spin.
      b.abdomen.rotation.set(Math.sin(t * 1.3) * 0.03 + this.tail * 1.15 + this.lift * 0.3, Math.sin(this.gait.phase * Math.PI * 2) * 0.05 * Math.min(1, speed), 0);
      b.abdomen.scale.setScalar(1 + Math.sin(t * 1.3) * 0.012);
      b.spin.rotation.set(this.tail * 0.4, 0, 0);
      // Fangs and chelicerae: spread in threat, strike in the bite.
      const strike = this.pose === 'bite' ? Math.sin(Math.min(1, pt / 0.3) * Math.PI) : 0;
      for (const [n, s] of [['L', 1], ['R', -1]] as const) {
        b['chel' + n].rotation.set(-0.35 * this.spread + strike * 0.5, 0, s * 0.25 * this.spread);
        b['fang' + n].rotation.set(-0.9 * this.spread + strike * 0.7, 0, -s * 0.2 * this.spread);
        // Feelers: always tasting the air, raised in threat.
        if (Math.random() < dt * 1.2) this.tap[n === 'L' ? 0 : 1] = 1;
        const tp = (this.tap[n === 'L' ? 0 : 1] = Math.max(0, this.tap[n === 'L' ? 0 : 1] - dt * 4));
        b['palp' + n + '0'].rotation.set(-0.5 * this.lift + Math.sin(t * 3.1 + s) * 0.08, s * 0.1 * Math.sin(t * 2.3), 0);
        b['palp' + n + '1'].rotation.set(-0.4 * this.lift + Math.sin(tp * Math.PI) * 0.45, 0, 0);
        b['palp' + n + '2'].rotation.set(-0.3 * this.lift - Math.sin(tp * Math.PI) * 0.3, 0, 0);
      }
    } else {
      this.deadPose(dt);
    }
    this.root.updateMatrixWorld(true);

    // Legs: raised in threat, curled in death, walking otherwise.
    const ov = this.gait.override;
    for (let i = 0; i < SPIDER_LEGS.length; i++) {
      const l = SPIDER_LEGS[i];
      let want: THREE.Vector3 | null = null;
      if (dead) want = this.local(l.side * 0.12, 0.2, 0.14 + (1.5 - l.index) * 0.07, this.over[i]);
      else if (this.lift > 0.05 && l.index === 0) want = this.local(l.side * 0.36, 1.05 + Math.sin(t * 5 + l.side) * 0.05, 0.78, this.over[i]);
      else if (this.lift > 0.05 && l.index === 1) want = this.local(l.side * 0.72, 0.62, 0.62, this.over[i]);
      ov[i] = want;
    }
    this.gait.grounded = !dead;
    this.gait.update(dt, this.root, dead ? new THREE.Vector3() : vel, groundAt);
    void LEG_NAMES;
  }

  private deadPose(dt: number) {
    this.deadT += dt;
    const b = this.bones;
    const k = THREE.MathUtils.smoothstep(this.deadT, 0, 0.6);
    b.body.position.y = 0.48 - 0.3 * k;
    b.body.rotation.set(0.1 * k, 0, 0);
    b.abdomen.rotation.set(-0.15 * k, 0, 0);
    for (const n of ['L', 'R']) {
      b['chel' + n].rotation.set(0.2 * k, 0, 0);
      b['palp' + n + '0'].rotation.set(0.6 * k, 0, 0);
      b['palp' + n + '1'].rotation.set(0.8 * k, 0, 0);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
