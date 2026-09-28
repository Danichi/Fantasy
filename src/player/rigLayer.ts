import * as THREE from 'three';
import { Character } from './character';
import { twoBoneIK, setWorldQuat, rotateWorld, basisQuat, worldQuat, worldPos } from './ik';

// ---------------------------------------------------------------------------
// Everything that sits on top of the animation mixer each frame:
//  * hand "grip frames" computed from finger geometry, so weapons attach the
//    same way on any Mixamo rig regardless of its bone axis conventions
//  * finger curl around held items
//  * procedural poses (IK arms + spine) used whenever a real clip is missing
// Grip frame: +Y = along the grip toward the thumb/index side,
//             +Z = palm normal, origin in the centre of the fist.
// ---------------------------------------------------------------------------

export type V3 = [number, number, number];

export interface HandPose {
  grip: V3; // character space, metres from the feet (+Z forward, +X left)
  dir: V3; // item +Y (blade direction / shield up)
  normal: V3; // item +Z (blade flat / shield face)
  w: number;
  pole?: V3; // elbow hint
}

export interface ProcPose {
  spineYaw?: number;
  spinePitch?: number;
  spineRoll?: number;
  hipsDrop?: number;
  headPitch?: number;
  /** 0..1 fold the legs (rolls, jumps) */
  legTuck?: number;
  right?: HandPose;
  left?: HandPose;
}

type Side = 'Right' | 'Left';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

interface HandRig {
  side: Side;
  hand: THREE.Bone;
  fore: THREE.Bone;
  arm: THREE.Bone;
  /** grip frame relative to the hand bone (rotation) */
  frameLocal: THREE.Quaternion;
  /** fist centre relative to the hand bone origin, in grip-frame axes, metres */
  gripOffset: THREE.Vector3;
  socket: THREE.Group; // items attach here
  fingers: THREE.Bone[][];
  thumb: THREE.Bone[];
  curl: number; // 0 open .. 1 closed around a grip
}

export class RigLayer {
  hands!: Record<Side, HandRig>;
  spine: THREE.Bone[] = [];
  head?: THREE.Bone;
  hips?: THREE.Bone;

  constructor(private char: Character) {}

  /** Call once after the model is loaded and posed in its idle clip. */
  setup() {
    const c = this.char;
    this.spine = ['Spine', 'Spine1', 'Spine2'].map((n) => c.bone(n)!).filter(Boolean);
    this.head = c.bone('Head');
    this.hips = c.bone('Hips');
    c.root.updateMatrixWorld(true);
    this.hands = { Right: this.buildHand('Right'), Left: this.buildHand('Left') };
  }

  private buildHand(side: Side): HandRig {
    const c = this.char;
    const hand = c.bone(side + 'Hand')!;
    const fore = c.bone(side + 'ForeArm')!;
    const arm = c.bone(side + 'Arm')!;
    const p = (n: string) => c.bone(side + n)!.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const knuckles = p('HandMiddle1');
    const F = knuckles.clone().sub(wrist).normalize(); // fingers
    const A = p('HandIndex1').sub(p('HandPinky1')); // across knuckles toward thumb side
    A.addScaledVector(F, -A.dot(F)).normalize();
    // A real grip runs diagonally across the palm (heel of the hand to the
    // index knuckle), so the blade leans toward the fingers.
    const GRIP_TILT = 0.52;
    A.multiplyScalar(Math.cos(GRIP_TILT)).addScaledVector(F, Math.sin(GRIP_TILT)).normalize();
    // Palm normal: which way the palm faces. Differs in sign per side.
    const P = side === 'Right' ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A);
    P.normalize();
    // Grip frame in world: Y = A, Z = P  (X = Y x Z)
    const frameWorld = basisQuat(A, P);
    const handWorldQ = hand.getWorldQuaternion(new THREE.Quaternion());
    const frameLocal = handWorldQ.clone().invert().multiply(frameWorld);

    // Fist centre: a little along the fingers and into the palm.
    const handLen = wrist.distanceTo(knuckles);
    const fistWorld = wrist.clone().addScaledVector(F, handLen * 0.95).addScaledVector(P, handLen * 0.32);
    const gripOffset = fistWorld.clone().sub(wrist).applyQuaternion(frameWorld.clone().invert());

    // Socket carries the grip frame so items can be modelled in grip space.
    const socket = c.socket(side + 'Hand', side === 'Right' ? 'main' : 'off');
    socket.quaternion.copy(frameLocal);
    const ws = hand.getWorldScale(new THREE.Vector3());
    const localPos = fistWorld.clone().sub(wrist).applyQuaternion(handWorldQ.clone().invert());
    socket.position.set(localPos.x / ws.x, localPos.y / ws.y, localPos.z / ws.z);

    const fingers = ['Index', 'Middle', 'Ring', 'Pinky'].map((f) =>
      [1, 2, 3].map((i) => c.bone(`${side}Hand${f}${i}`)!).filter(Boolean),
    );
    const thumb = [1, 2, 3].map((i) => c.bone(`${side}HandThumb${i}`)!).filter(Boolean);
    return { side, hand, fore, arm, frameLocal, gripOffset, socket, fingers, thumb, curl: 0 };
  }

  setCurl(side: Side, v: number) {
    this.hands[side].curl = v;
  }

  /** Current grip frame in world space. */
  gripWorldQuat(side: Side, out = new THREE.Quaternion()) {
    const h = this.hands[side];
    return worldQuat(h.hand, out).multiply(h.frameLocal);
  }

  private curlFingers(h: HandRig) {
    if (h.curl <= 0.001) return;
    // Axis across the knuckles; rotating fingers about it closes the fist.
    const gq = this.gripWorldQuat(h.side, _q2);
    const across = _v.set(0, 1, 0).applyQuaternion(gq); // grip axis = across knuckles
    const sign = h.side === 'Right' ? 1 : -1;
    const angles = [1.25, 1.45, 0.9];
    for (const finger of h.fingers) {
      finger.forEach((b, i) => {
        _q.setFromAxisAngle(across, angles[i] * h.curl * sign);
        rotateWorld(b, _q);
      });
    }
    if (h.thumb[0]) {
      const palm = _v2.set(0, 0, 1).applyQuaternion(gq);
      _q.setFromAxisAngle(palm, 0.5 * h.curl * sign);
      rotateWorld(h.thumb[0], _q);
      h.thumb.slice(1).forEach((b) => {
        _q.setFromAxisAngle(across, 0.5 * h.curl * sign);
        rotateWorld(b, _q);
      });
    }
  }

  /** Apply a procedural pose (weights inside) plus finger curl. Call after mixer.update. */
  apply(pose: ProcPose | null) {
    const root = this.char.visual;
    // Refresh from the top: the character root may have just moved, and the
    // helpers below read world matrices directly.
    this.char.root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());

    if (pose) {
      // Spine: distribute yaw/pitch/roll over the three spine bones.
      const n = this.spine.length || 1;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ);
      const left = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
      if (pose.spineYaw || pose.spinePitch || pose.spineRoll) {
        // One combined rotation per spine bone (each edit refreshes the subtree).
        const q = new THREE.Quaternion()
          .setFromAxisAngle(up, (pose.spineYaw ?? 0) / n)
          .multiply(_q.setFromAxisAngle(left, (pose.spinePitch ?? 0) / n))
          .multiply(_q2.setFromAxisAngle(fwd, (pose.spineRoll ?? 0) / n));
        for (const b of this.spine) rotateWorld(b, q);
      }
      if (pose.headPitch && this.head) rotateWorld(this.head, _q.setFromAxisAngle(left, pose.headPitch));
      if (pose.legTuck) this.tuckLegs(pose.legTuck, left);
      else if (pose.hipsDrop) this.dropHips(pose.hipsDrop, fwd);
      if (pose.right) this.solveHand(this.hands.Right, pose.right, root, rootQ);
      if (pose.left) this.solveHand(this.hands.Left, pose.left, root, rootQ);
    }
    this.curlFingers(this.hands.Right);
    this.curlFingers(this.hands.Left);
  }

  /** Lower the hips and re-plant the feet with leg IK so the knees bend. */
  private dropHips(drop: number, fwd: THREE.Vector3) {
    const hips = this.hips;
    if (!hips) return;
    const c = this.char;
    const legs = (['Right', 'Left'] as const).map((s) => ({
      up: c.bone(s + 'UpLeg')!, leg: c.bone(s + 'Leg')!, foot: c.bone(s + 'Foot')!,
    }));
    const feet = legs.map((l) => ({ p: worldPos(l.foot), q: worldQuat(l.foot) }));
    const scale = c.root.getWorldScale(_v).y;
    const wp = worldPos(hips);
    wp.y -= drop * scale;
    hips.position.copy(hips.parent!.worldToLocal(wp));
    hips.updateMatrixWorld(true);
    legs.forEach((l, i) => {
      const knee = worldPos(l.leg).addScaledVector(fwd, 0.6 * scale);
      twoBoneIK(l.up, l.leg, l.foot, feet[i].p, knee, 1);
      setWorldQuat(l.foot, feet[i].q);
    });
  }

  private tuckLegs(k: number, left: THREE.Vector3) {
    const c = this.char;
    for (const s of ['Right', 'Left']) {
      const up = c.bone(s + 'UpLeg'), leg = c.bone(s + 'Leg');
      if (up) rotateWorld(up, _q.setFromAxisAngle(left, -1.5 * k));
      if (leg) rotateWorld(leg, _q.setFromAxisAngle(left, 2.1 * k));
    }
  }

  private solveHand(h: HandRig, hp: HandPose, root: THREE.Object3D, rootQ: THREE.Quaternion) {
    if (hp.w <= 0.001) return;
    // Desired grip frame in world.
    const dir = new THREE.Vector3(...hp.dir).applyQuaternion(rootQ);
    const nrm = new THREE.Vector3(...hp.normal).applyQuaternion(rootQ);
    const frameWorld = basisQuat(dir, nrm);
    const grip = root.localToWorld(new THREE.Vector3(...hp.grip));
    // Wrist target = grip minus the fist offset expressed in the new frame.
    const wrist = grip.clone().sub(h.gripOffset.clone().applyQuaternion(frameWorld));
    const side = h.side === 'Right' ? -1 : 1;
    const pole = root.localToWorld(
      hp.pole ? new THREE.Vector3(...hp.pole) : new THREE.Vector3(side * 0.55, 0.7, -0.35),
    );
    twoBoneIK(h.arm, h.fore, h.hand, wrist, pole, hp.w);
    // Hand orientation: world = frameWorld * inverse(frameLocal).
    const handQ = frameWorld.clone().multiply(h.frameLocal.clone().invert());
    setWorldQuat(h.hand, handQ, hp.w);
  }
}

/** Keyframe track helpers for authoring procedural poses. */
export function sampleV3(keys: [number, V3][], t: number): V3 {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      // Catmull-Rom using neighbouring keys for smooth arcs.
      const p0 = keys[Math.max(0, i - 1)][1], p3 = keys[Math.min(keys.length - 1, i + 2)][1];
      const u2 = u * u, u3 = u2 * u;
      const out: V3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        out[k] = 0.5 * (2 * a[k] + (-p0[k] + b[k]) * u + (2 * p0[k] - 5 * a[k] + 4 * b[k] - p3[k]) * u2 + (-p0[k] + 3 * a[k] - 3 * b[k] + p3[k]) * u3);
      }
      return out;
    }
  }
  return keys[keys.length - 1][1];
}

export function sampleF(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return a + (b - a) * s;
    }
  }
  return keys[keys.length - 1][1];
}


function lerpV(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function blendHand(a: HandPose | undefined, b: HandPose | undefined, t: number): HandPose | undefined {
  if (!a && !b) return undefined;
  if (!a) return { ...b!, w: b!.w * t };
  if (!b) return { ...a, w: a.w * (1 - t) };
  return {
    grip: lerpV(a.grip, b.grip, t),
    dir: lerpV(a.dir, b.dir, t),
    normal: lerpV(a.normal, b.normal, t),
    w: a.w + (b.w - a.w) * t,
    pole: b.pole && a.pole ? lerpV(a.pole, b.pole, t) : b.pole ?? a.pole,
  };
}

/** Linear blend between two poses (t=0 -> a, t=1 -> b). */
export function blendPose(a: ProcPose, b: ProcPose, t: number): ProcPose {
  const f = (x?: number, y?: number) => (x ?? 0) + ((y ?? 0) - (x ?? 0)) * t;
  return {
    spineYaw: f(a.spineYaw, b.spineYaw),
    spinePitch: f(a.spinePitch, b.spinePitch),
    spineRoll: f(a.spineRoll, b.spineRoll),
    hipsDrop: f(a.hipsDrop, b.hipsDrop),
    headPitch: f(a.headPitch, b.headPitch),
    legTuck: f(a.legTuck, b.legTuck),
    right: blendHand(a.right, b.right, t),
    left: blendHand(a.left, b.left, t),
  };
}

/** Action pose fields override the base; missing hands fall back to the base. */
export function overlayPose(base: ProcPose, top: ProcPose): ProcPose {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(top).filter(([, v]) => v !== undefined)),
    right: top.right ?? base.right,
    left: top.left ?? base.left,
  };
}
