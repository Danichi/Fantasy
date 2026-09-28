import * as THREE from 'three';

// World-space bone manipulation helpers applied on top of the animation mixer.
// All functions keep descendants' world matrices up to date.

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _axis = new THREE.Vector3();

const _dp = new THREE.Vector3();
const _ds = new THREE.Vector3();
/**
 * World rotation read straight from matrixWorld. Callers keep world matrices
 * current (every edit below refreshes the bone's subtree), which avoids
 * getWorldQuaternion's walk up the whole ancestor chain on every call.
 */
export function worldQuat(o: THREE.Object3D, out = new THREE.Quaternion()) {
  o.matrixWorld.decompose(_dp, out, _ds);
  return out;
}
export function worldPos(o: THREE.Object3D, out = new THREE.Vector3()) {
  return out.setFromMatrixPosition(o.matrixWorld);
}

/** Pre-multiply a bone's world rotation by `q` (a world-space delta). */
export function rotateWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  worldQuat(bone, _q2);
  _q2.premultiply(q);
  setWorldQuat(bone, _q2);
}

/** Set a bone's world rotation, preserving its parent. */
export function setWorldQuat(bone: THREE.Object3D, q: THREE.Quaternion, weight = 1) {
  const parent = bone.parent!;
  worldQuat(parent, _pq).invert();
  const local = _pq.multiply(q);
  if (weight >= 1) bone.quaternion.copy(local);
  else bone.quaternion.slerp(local, weight);
  bone.updateMatrixWorld(true);
}

function clamp1(x: number) {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/**
 * Analytic two-bone IK (upper arm, forearm, hand). Places the end effector at
 * `target` with the middle joint bending toward `pole`. Weighted by `w`.
 */
export function twoBoneIK(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  w = 1,
) {
  if (w <= 0.001) return;
  const upperStart = upper.quaternion.clone();
  const lowerStart = lower.quaternion.clone();

  worldPos(upper, _a);
  worldPos(lower, _b);
  worldPos(end, _c);
  const lab = _a.distanceTo(_b);
  const lcb = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_a.distanceTo(target), 0.01, (lab + lcb) * 0.999);

  // 1. Set the elbow angle via the law of cosines.
  const ba_bc_0 = Math.acos(clamp1(_v1.subVectors(_a, _b).normalize().dot(_v2.subVectors(_c, _b).normalize())));
  const ba_bc_1 = Math.acos(clamp1((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));
  _axis.crossVectors(_v1.subVectors(_c, _a), _v2.subVectors(_b, _a));
  if (_axis.lengthSq() < 1e-8) _axis.crossVectors(_v1.subVectors(_c, _a), _v2.subVectors(pole, _a));
  _axis.normalize();
  _q.setFromAxisAngle(_axis, ba_bc_1 - ba_bc_0);
  rotateWorld(lower, _q);

  // 2. Swing the whole chain so the hand points at the target.
  worldPos(end, _c);
  _v1.subVectors(_c, _a).normalize();
  _v2.subVectors(target, _a).normalize();
  _q.setFromUnitVectors(_v1, _v2);
  rotateWorld(upper, _q);

  // 3. Twist around the shoulder->target axis so the elbow faces the pole.
  worldPos(lower, _b);
  const n = _v2; // already normalised shoulder->target
  const e = _v1.subVectors(_b, _a);
  e.addScaledVector(n, -e.dot(n));
  const p = new THREE.Vector3().subVectors(pole, _a);
  p.addScaledVector(n, -p.dot(n));
  if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) {
    e.normalize();
    p.normalize();
    let ang = Math.acos(clamp1(e.dot(p)));
    if (_axis.crossVectors(e, p).dot(n) < 0) ang = -ang;
    _q.setFromAxisAngle(n, ang);
    rotateWorld(upper, _q);
  }

  if (w < 1) {
    const ikUpper = upper.quaternion.clone();
    const ikLower = lower.quaternion.clone();
    upper.quaternion.copy(upperStart).slerp(ikUpper, w);
    lower.quaternion.copy(lowerStart).slerp(ikLower, w);
    upper.updateMatrixWorld(true);
  }
}

/** Build a world rotation whose +Y axis points along `dir` and +Z along `normal`. */
export function basisQuat(dir: THREE.Vector3, normal: THREE.Vector3, out = new THREE.Quaternion()) {
  const y = _v1.copy(dir).normalize();
  const z = _v2.copy(normal).addScaledVector(y, -normal.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = _axis.crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return out.setFromRotationMatrix(m);
}
