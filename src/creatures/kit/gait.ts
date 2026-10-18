import * as THREE from 'three';
import { aim, solveTwoBone, twoBone, type TwoBone } from './ik';

// Legs that walk: each foot stays planted on the ground while the body moves
// over it, then lifts, swings forward in an arc and lands where the body will
// be. Phase offsets between legs give the gait (walk, trot, gallop), and the
// stride grows with speed. Works for four legs or eight.

export interface LegSpec {
  /** Hip/shoulder, knee/elbow, ankle/wrist, toe (end) bone names. */
  bones: [string, string, string, string];
  /** Rest bend direction of the knee/elbow (creature space). */
  bend: [number, number, number];
  /** Phase offsets per gait (0..1). */
  walk: number;
  trot?: number;
  run?: number;
}

export interface GaitOpts {
  /** Stride length at walking speed (m). */
  stride: number;
  /** Foot lift height (m). */
  lift: number;
  /** Fraction of the cycle a foot is on the ground, at walk / run. */
  dutyWalk?: number;
  dutyRun?: number;
  /** Speeds where the trot and the run take over. */
  trotAt?: number;
  runAt?: number;
  /** Toe flick (radians) during swing. */
  flick?: number;
}

interface Foot {
  spec: LegSpec;
  ik: TwoBone;
  ankle: THREE.Bone;
  toe: THREE.Bone;
  /** Rest offset toe->ankle and toe position (creature space). */
  restCannon: THREE.Vector3;
  home: THREE.Vector3;
  planted: THREE.Vector3;
  from: THREE.Vector3;
  pos: THREE.Vector3;
  swinging: boolean;
  lastP: number;
  /** 0..1 how high it is in its swing (for dust and sound). */
  air: number;
  /** Just landed this frame. */
  landed: boolean;
}

const _w = new THREE.Vector3();
const _to = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ankle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _restUp = new THREE.Vector3(0, 0, 1);

export class Gait {
  readonly feet: Foot[] = [];
  phase = 0;
  /** Blend weights of the three gaits. */
  private mix = { walk: 1, trot: 0, run: 0 };
  speed = 0;
  /** Set false to let the legs hang (falling, dying). */
  grounded = true;

  constructor(
    bones: Record<string, THREE.Bone>,
    legs: LegSpec[],
    readonly o: GaitOpts,
  ) {
    for (const s of legs) {
      const [h, k, a, t] = s.bones.map((n) => bones[n]);
      const ik = twoBone(h, k, a, new THREE.Vector3(...s.bend));
      // Toe home position in creature space: sum of rest offsets from the root chain.
      const home = new THREE.Vector3();
      for (let b: THREE.Object3D | null = t; b && b instanceof THREE.Bone; b = b.parent) home.add(b.position);
      this.feet.push({
        spec: s, ik, ankle: a, toe: t,
        restCannon: t.position.clone().negate(),
        home, planted: new THREE.Vector3(), from: new THREE.Vector3(), pos: new THREE.Vector3(),
        swinging: false, lastP: 0, air: 0, landed: false,
      });
    }
  }

  /** Put every foot straight under its home (spawn, teleport). */
  reset(root: THREE.Object3D, groundAt: (x: number, z: number) => number) {
    root.updateMatrixWorld(true);
    for (const f of this.feet) {
      _w.copy(f.home).applyMatrix4(root.matrixWorld);
      _w.y = groundAt(_w.x, _w.z);
      f.planted.copy(_w);
      f.pos.copy(_w);
      f.swinging = false;
    }
  }

  private offset(f: Foot) {
    const s = f.spec;
    return s.walk * this.mix.walk + (s.trot ?? s.walk) * this.mix.trot + (s.run ?? s.trot ?? s.walk) * this.mix.run;
  }

  /**
   * Advance and pose the legs.
   * @param root   creature root (world transform already set for this frame)
   * @param vel    world velocity (m/s)
   */
  update(dt: number, root: THREE.Object3D, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    const o = this.o;
    const speed = Math.hypot(vel.x, vel.z);
    this.speed = speed;
    const trotAt = o.trotAt ?? 2.2, runAt = o.runAt ?? 4.5;
    const tw = THREE.MathUtils.smoothstep(speed, trotAt * 0.8, trotAt * 1.15);
    const rw = THREE.MathUtils.smoothstep(speed, runAt * 0.85, runAt * 1.15);
    const k = 1 - Math.exp(-dt * 6);
    this.mix.walk += (1 - tw - this.mix.walk) * k;
    this.mix.trot += (tw - rw - this.mix.trot) * k;
    this.mix.run += (rw - this.mix.run) * k;
    const duty = THREE.MathUtils.lerp(o.dutyWalk ?? 0.62, o.dutyRun ?? 0.38, Math.min(1, tw * 0.5 + rw));
    const stride = o.stride * (1 + Math.min(1.6, speed / 2.5) * 0.9);
    root.updateMatrixWorld(true);

    // Standing still: keep stepping only while some foot is out of place.
    let worst = 0;
    for (const f of this.feet) {
      _w.copy(f.home).applyMatrix4(root.matrixWorld);
      worst = Math.max(worst, Math.hypot(_w.x - f.planted.x, _w.z - f.planted.z));
    }
    const freq = speed > 0.08 ? speed / stride : worst > o.stride * 0.12 || this.feet.some((f) => f.swinging) ? 1.6 : 0;
    this.phase = (this.phase + freq * dt) % 1;
    const cycle = freq > 0 ? 1 / freq : 1;

    root.getWorldQuaternion(_q);
    for (const f of this.feet) {
      f.landed = false;
      const p = (this.phase + this.offset(f)) % 1;
      const swing = this.grounded && freq > 0 && p >= duty;
      _w.copy(f.home).applyMatrix4(root.matrixWorld);
      if (swing) {
        if (!f.swinging) {
          f.swinging = true;
          f.from.copy(f.planted);
        }
        const s = (p - duty) / (1 - duty);
        // Aim for where the hip will be halfway through the next stance.
        const lead = (1 - s) * (1 - duty) * cycle + duty * cycle * 0.5;
        _to.copy(_w).addScaledVector(vel, lead);
        _to.y = groundAt(_to.x, _to.z);
        const e = s * s * (3 - 2 * s);
        f.pos.lerpVectors(f.from, _to, e);
        const arc = Math.sin(Math.PI * s);
        f.pos.y += arc * o.lift * (0.7 + Math.min(1, speed / 3) * 0.6);
        f.air = arc;
        f.planted.copy(_to);
      } else {
        if (f.swinging) {
          f.swinging = false;
          f.landed = true;
        }
        if (!this.grounded) {
          f.planted.copy(_w);
          f.planted.y -= 0.05;
        }
        f.pos.copy(f.planted);
        f.air = 0;
      }
      f.lastP = p;

      // Pose: ankle sits above the toe along the rest cannon, curled back while in the air.
      _ankle.copy(f.restCannon).applyQuaternion(_q);
      if (f.air > 0) {
        _up.set(1, 0, 0).applyQuaternion(_q);
        _ankle.applyAxisAngle(_up, -(o.flick ?? 0.5) * f.air);
      }
      _ankle.add(f.pos);
      _bend.copy(f.ik.restBend).applyQuaternion(_q);
      solveTwoBone(f.ik, _ankle, _bend);
      f.ankle.getWorldPosition(_ankle);
      _dir.subVectors(f.pos, _ankle);
      _up.set(0, 0, 1).applyQuaternion(_q);
      aim(f.ankle, f.toe.position.clone().normalize(), _restUp, _dir, _up);
    }
  }

  /** Average ground height under the feet, and the body pitch/roll they imply. */
  footing() {
    let y = 0;
    for (const f of this.feet) y += f.planted.y;
    return y / this.feet.length;
  }
}
