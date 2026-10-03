import * as THREE from 'three';
import { Input } from '../core/input';
import { physics } from '../physics/physics';
import { clamp, damp, dampAngle, wrapAngle, valueNoise } from '../core/math';

// Over-the-shoulder orbit camera on a collision-aware spring arm.
// yaw: camera forward on XZ = (sin yaw, cos yaw). pitch > 0 looks down.

export class ThirdPersonCamera {
  yaw = Math.PI; // start looking north (-Z)
  pitch = 0.22;
  distance = 4.8;
  /** extra arm length and height (at a ship's helm: see the whole ship) */
  extra = 0;
  private armLen = 4.8;
  private shoulder = 0.48;
  private pivot = new THREE.Vector3();
  private trauma = 0;
  private time = 0;
  sensitivity = 0.0022;
  fovBase = 62;
  private fov = 62;
  lockTarget: THREE.Vector3 | null = null;
  /** debug: leave the camera wherever it was put */
  frozen = false;

  constructor(readonly camera: THREE.PerspectiveCamera, private input: Input) {}

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snapTo(focus: THREE.Vector3) {
    this.pivot.copy(focus).add(new THREE.Vector3(0, 1.55, 0));
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  right(out = new THREE.Vector3()) {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  update(dt: number, focus: THREE.Vector3, sprinting: boolean) {
    if (this.frozen) return;
    this.time += dt;
    const inp = this.input;
    if (!inp.uiMode) {
      this.yaw -= inp.mouseDX * this.sensitivity;
      this.pitch = clamp(this.pitch + inp.mouseDY * this.sensitivity, -0.6, 1.2);
      this.distance = clamp(this.distance + inp.wheel * 0.35, 2.6, 7.2);
    }

    // Pivot trails the player slightly for weight, but never far.
    const target = new THREE.Vector3(focus.x, focus.y + 1.55 + this.extra * 0.22, focus.z);
    this.pivot.x = damp(this.pivot.x, target.x, 16, dt);
    this.pivot.z = damp(this.pivot.z, target.z, 16, dt);
    this.pivot.y = damp(this.pivot.y, target.y, 9, dt);

    if (this.lockTarget) {
      // Frame the target: yaw toward it, pitch so it sits a little below centre.
      const d = new THREE.Vector3().subVectors(this.lockTarget, this.pivot);
      const flat = Math.hypot(d.x, d.z);
      const wantYaw = Math.atan2(d.x, d.z);
      this.yaw = dampAngle(this.yaw, wantYaw, 7, dt);
      const wantPitch = clamp(Math.atan2(-d.y, flat) + 0.2, -0.3, 0.8);
      this.pitch = damp(this.pitch, wantPitch, 5, dt);
    }
    this.yaw = wrapAngle(this.yaw);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const right = this.right();
    // Shoulder offset shrinks when a wall is close on the right.
    const side = physics.castRay(this.pivot, right, 0.9);
    const wantShoulder = side !== null ? Math.max(0, side - 0.4) : 0.48;
    this.shoulder = wantShoulder < this.shoulder ? wantShoulder : damp(this.shoulder, wantShoulder, 3, dt);
    const shoulder = this.shoulder;
    const origin = this.pivot.clone().addScaledVector(right, shoulder * 0.5);
    const back = fwd.clone().negate();
    const want = origin.clone().addScaledVector(right, shoulder * 0.5).addScaledVector(back, this.distance + this.extra);

    // Spring arm: a bundle of rays (centre plus a 0.25 m ring) approximates a
    // sphere sweep, so the camera never ends up hugging a wall face.
    const dir = want.clone().sub(this.pivot);
    const full = dir.length();
    dir.normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    let hit: number | null = physics.castRay(this.pivot, dir, full + 0.3);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = this.pivot.clone().addScaledVector(right, a * 0.25).addScaledVector(up, b * 0.25);
      const h = physics.castRay(o, dir, full + 0.3);
      if (h !== null && (hit === null || h < hit)) hit = h;
    }
    const allowed = hit !== null ? Math.max(0.6, hit - 0.3) : full;
    this.armLen = allowed < this.armLen ? allowed : damp(this.armLen, allowed, 4, dt);
    const pos = this.pivot.clone().addScaledVector(dir, Math.min(this.armLen, full));

    // Trauma-based shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const t = this.time * 28;
      pos.x += (valueNoise(t, 1.3) - 0.5) * 0.35 * s;
      pos.y += (valueNoise(t, 7.1) - 0.5) * 0.35 * s;
      pos.z += (valueNoise(t, 13.7) - 0.5) * 0.35 * s;
    }

    this.camera.position.copy(pos);
    const look = origin.clone().addScaledVector(fwd, 10);
    this.camera.lookAt(look);
    if (s > 0) this.camera.rotateZ((valueNoise(this.time * 20, 3.3) - 0.5) * 0.06 * s);

    this.fov = damp(this.fov, this.fovBase + (sprinting ? 5 : 0), 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
