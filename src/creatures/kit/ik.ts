import * as THREE from 'three';

// Bone posing helpers. All creature bones have identity rest rotations, so a
// bone's rest directions are plain creature-space vectors.

const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

function basis(dir: THREE.Vector3, up: THREE.Vector3, out: THREE.Matrix4) {
  _z.copy(dir).normalize();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).cross(_z);
  _x.normalize();
  _y.crossVectors(_z, _x);
  return out.makeBasis(_x, _y, _z);
}

/**
 * Turn `bone` so its rest direction `restDir` (creature space) points along
 * `worldDir`, keeping `restUp` as close to `worldUp` as it can.
 * The bone's parent must have an up-to-date world matrix.
 */
export function aim(bone: THREE.Object3D, restDir: THREE.Vector3, restUp: THREE.Vector3, worldDir: THREE.Vector3, worldUp: THREE.Vector3) {
  basis(restDir, restUp, _m0);
  basis(worldDir, worldUp, _m1);
  _q.setFromRotationMatrix(_m1.multiply(_m0.transpose()));
  bone.parent!.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}

const _pa = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pp = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _t = new THREE.Vector3();

export interface TwoBone {
  a: THREE.Bone;
  b: THREE.Bone;
  /** Rest directions a->b and b->c, and the rest bend direction (creature space). */
  restAB: THREE.Vector3;
  restBC: THREE.Vector3;
  restBend: THREE.Vector3;
  l1: number;
  l2: number;
}

export function twoBone(a: THREE.Bone, b: THREE.Bone, c: THREE.Bone, restBend: THREE.Vector3): TwoBone {
  const restAB = b.position.clone();
  const restBC = c.position.clone();
  return { a, b, restAB: restAB.clone().normalize(), restBC: restBC.clone().normalize(), restBend: restBend.clone().normalize(), l1: restAB.length(), l2: restBC.length() };
}

/** Solve so the end of b lands on `target` (world), bending toward `bend` (world direction). Returns how far short it fell. */
export function solveTwoBone(k: TwoBone, target: THREE.Vector3, bend: THREE.Vector3) {
  k.a.getWorldPosition(_pa);
  _d.subVectors(target, _pa);
  const want = _d.length();
  const dist = THREE.MathUtils.clamp(want, Math.abs(k.l1 - k.l2) + 1e-3, (k.l1 + k.l2) * 0.9995);
  _d.normalize();
  const cosA = THREE.MathUtils.clamp((k.l1 * k.l1 + dist * dist - k.l2 * k.l2) / (2 * k.l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _pp.copy(bend).addScaledVector(_d, -bend.dot(_d));
  if (_pp.lengthSq() < 1e-8) _pp.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _pp.normalize();
  _pb.copy(_pa).addScaledVector(_d, cosA * k.l1).addScaledVector(_pp, sinA * k.l1);
  _t.subVectors(_pb, _pa);
  aim(k.a, k.restAB, k.restBend, _t, _pp);
  _t.copy(_pa).addScaledVector(_d, dist).sub(_pb);
  aim(k.b, k.restBC, k.restBend, _t, _pp);
  return want - dist;
}

/** Set a bone's local rotation from Euler angles (radians) about creature axes at rest. */
export function rot(bone: THREE.Object3D, x: number, y = 0, z = 0) {
  bone.rotation.set(x, y, z);
}
