import * as THREE from 'three';
import { events } from '../core/events';
import { targets, newTargetId, type Target, type HitInfo } from '../combat/targets';
/** An intentionally plain test capsule. It participates in the real damage/posture pipeline. */
export class SandboxTarget implements Target {
  id = newTargetId();
  kind = 'dummy';
  label = 'Sandbox target';
  alive = true;
  lockable = true;
  stunned = false;
  radius = 0.46;
  halfHeight = 0.65;
  maxHp: number;
  hp: number;
  postureMax = 180;
  poiseMax = 80;
  yaw = 0;
  center: THREE.Vector3;
  position: THREE.Vector3;
  readonly group = new THREE.Group();
  private broken = 0;
  private clock = 0;
  private home: THREE.Vector3;
  constructor(
    private scene: THREE.Scene,
    at: THREE.Vector3,
    hp: number,
    private immortal: () => boolean,
    private moving = false,
  ) {
    this.home = at.clone();
    if (moving) this.label = 'Moving range target';
    this.position = at.clone();
    this.center = at.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.hp = this.maxHp = hp;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.46, 1, 5, 12),
      new THREE.MeshStandardMaterial({ color: 0xe4b56a, roughness: 0.9 }),
    );
    body.position.y = 1.1;
    body.castShadow = true;
    this.group.add(body);
    this.group.position.copy(at);
    scene.add(this.group);
    targets.add(this);
  }
  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp = Math.max(this.immortal() ? 1 : 0, this.hp - h.damage);
    events.emit('enemyHit', { at: h.at.clone(), amount: Math.round(h.damage), crit: h.crit, enemyId: this.id });
    if (this.hp === 0) {
      this.alive = false;
      targets.delete(this);
      this.group.visible = false;
    }
  }
  onBreak(sec: number) {
    this.broken = sec;
    this.stunned = true;
  }
  update(dt: number) {
    this.clock += dt;
    if (this.moving) {
      this.position.x = this.home.x + Math.sin(this.clock * 0.8) * 3;
      this.group.position.copy(this.position);
      this.center.copy(this.position).y += 1.1;
    }
    this.broken = Math.max(0, this.broken - dt);
    this.stunned = this.broken > 0;
    this.group.rotation.z = this.stunned ? 0.1 : 0;
  }
  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.alive = false;
  }
}
