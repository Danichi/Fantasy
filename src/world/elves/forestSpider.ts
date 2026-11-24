import * as THREE from 'three';
import { physics, groups, G_ENEMY } from '../../physics/physics';
import { newTargetId, targets, type Target, type HitInfo } from '../../combat/targets';
import { combat } from '../../combat/core';
import { events } from '../../core/events';
import { heightAt } from '../terrainHeight';
import type { Player } from '../../player/player';
import type { Telegraphs, Telegraph } from '../../enemies/wilds/telegraph';
/** A real eight-legged target with a committed, marked pounce and a punishable recovery. */
export class ForestSpider implements Target {
  id = newTargetId();
  kind = 'elfSpider';
  label = 'Blightweaver Spider';
  level = 22;
  alive = true;
  lockable = true;
  stunned = false;
  hp = 780;
  maxHp = 780;
  radius = 0.8;
  halfHeight = 0.65;
  position: THREE.Vector3;
  center = new THREE.Vector3();
  yaw = 0;
  root = new THREE.Group();
  private legs: THREE.Group[] = [];
  private timer = 1.2;
  private state: 'chase' | 'tell' | 'leap' | 'recover' = 'chase';
  private landing = new THREE.Vector3();
  private from = new THREE.Vector3();
  private mark: Telegraph | null = null;
  private rb;
  private disposed = false;
  constructor(
    at: THREE.Vector3,
    private scene: THREE.Scene,
    private tele: Telegraphs
  ) {
    this.position = at.clone();
    const shell = new THREE.MeshStandardMaterial({ color: 0x34413b, roughness: 0.75 }),
      eye = new THREE.MeshStandardMaterial({ color: 0xe0c2e9, emissive: 0x993cb9, emissiveIntensity: 1.2 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 7), shell);
    body.scale.set(0.85, 0.65, 1.25);
    body.position.y = 0.6;
    this.root.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), shell);
    head.position.set(0, 0.52, 0.8);
    this.root.add(head);
    for (const x of [-0.19, 0.19]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), eye);
      e.position.set(x, 0.64, 1.12);
      this.root.add(e);
    }
    for (let i = 0; i < 8; i++) {
      const leg = new THREE.Group(),
        side = i < 4 ? -1 : 1,
        z = ((i % 4) - 1.5) * 0.35;
      leg.position.set(side * 0.35, 0.58, z);
      for (const [x, y, angle] of [
        [side * 0.5, -0.02, side * -0.9],
        [side * 1.08, -0.26, side * 0.6],
      ]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.035, 0.9, 5), shell);
        m.position.set(x, y, 0);
        m.rotation.z = angle;
        leg.add(m);
      }
      this.legs.push(leg);
      this.root.add(leg);
    }
    this.scene.add(this.root);
    this.rb = physics.world.createRigidBody(physics.R.RigidBodyDesc.kinematicPositionBased());
    physics.world.createCollider(physics.R.ColliderDesc.capsule(0.28, 0.55).setCollisionGroups(groups(G_ENEMY, 0xffff)), this.rb);
    targets.add(this);
    this.pose();
  }
  private pose() {
    this.position.y = heightAt(this.position.x, this.position.z) + (this.state === 'leap' ? Math.sin(Math.PI * (1 - this.timer / 0.55)) * 2.7 : 0);
    this.center.copy(this.position).y += 0.6;
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    this.rb.setNextKinematicTranslation(this.center);
  }
  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    if (this.hp <= 0) {
      this.alive = this.lockable = false;
      this.tele.cancel(this.mark);
      targets.delete(this);
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind, level: this.level });
      this.root.rotation.z = Math.PI;
      this.rb.setEnabled(false);
    } else if (h.poise > 55) {
      this.state = 'recover';
      this.timer = 0.9;
      this.tele.cancel(this.mark);
      this.stunned = true;
    }
  }
  update(dt: number, p: Player) {
    if (!this.alive) return;
    this.timer -= dt;
    const dx = p.pos.x - this.position.x,
      dz = p.pos.z - this.position.z,
      d = Math.hypot(dx, dz);
    if (p.dead || p.pos.distanceTo(this.position) > 65) return;
    if (this.state === 'chase') {
      this.yaw = Math.atan2(dx, dz);
      if (d > 4) {
        const step = Math.min(3.4 * dt, d - 4);
        this.position.x += (dx / d) * step;
        this.position.z += (dz / d) * step;
      }
      if (d < 13 && this.timer <= 0) {
        this.state = 'tell';
        this.timer = 1.05;
        this.landing.copy(p.pos);
        this.from.copy(this.position);
        this.mark = this.tele.circle(p.pos.x, p.pos.z, 2.5, 1.05, 0xc181df, 0.5);
        combat.windup(this, 1.05, 'unblockable', 0, { name: 'Webweaver Pounce' });
      }
    } else if (this.state === 'tell' && this.timer <= 0) {
      this.state = 'leap';
      this.timer = 0.55;
    } else if (this.state === 'leap') {
      this.position.lerpVectors(this.from, this.landing, Math.max(0, Math.min(1, 1 - this.timer / 0.55)));
      if (this.timer <= 0) {
        if (Math.hypot(p.pos.x - this.landing.x, p.pos.z - this.landing.z) < 2.5 && Math.abs(p.pos.y - heightAt(p.pos.x, p.pos.z)) < 3)
          p.receiveAttack({ damage: 34, from: this.position.clone(), parryable: false, poise: 75 });
        this.state = 'recover';
        this.timer = 1.8;
      }
    } else if (this.state === 'recover' && this.timer <= 0) {
      this.stunned = false;
      this.state = 'chase';
      this.timer = 1.2;
    }
    this.legs.forEach((l, i) => (l.rotation.y = Math.sin(this.timer * 12 + i) * 0.14));
    this.pose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    targets.delete(this);
    this.tele.cancel(this.mark);
    physics.world.removeRigidBody(this.rb);
    this.root.removeFromParent();
    const mats = new Set<THREE.Material>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
      }
    });
    for (const m of mats) m.dispose();
  }
}
