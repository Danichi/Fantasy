import * as THREE from 'three';
import { events } from '../core/events';
import { physics } from '../physics/physics';
import { targets, newTargetId, type Target, type HitInfo } from '../combat/targets';

export type DummyKind = 'straw' | 'moving' | 'shield' | 'iron';

const LOOK: Record<DummyKind, { label: string; color: number; poise: number; posture: number }> = {
  straw: { label: 'Straw dummy', color: 0xd9b36a, poise: 30, posture: 180 },
  moving: { label: 'Moving range target', color: 0xc9a05a, poise: 30, posture: 180 },
  shield: { label: 'Shield bearer', color: 0x9aa4ae, poise: 60, posture: 140 },
  iron: { label: 'Iron dummy', color: 0x5a6068, poise: 220, posture: 400 },
};

const GRAVITY = 22;

/**
 * A training dummy. It takes blows through the real damage and posture
 * pipeline, and it has a body: it can be launched, juggled, knocked into a
 * wall or off the high ground (combat/impacts.ts). Straw dummies are light
 * enough to throw about; the iron one only staggers. The shield bearer guards
 * in front (blows there do a fifth) until its guard is broken or it reels:
 * vault it, or break it.
 */
export class SandboxTarget implements Target {
  id = newTargetId();
  kind = 'dummy';
  label: string;
  alive = true;
  lockable = true;
  stunned = false;
  radius = 0.46;
  halfHeight = 0.65;
  maxHp: number;
  hp: number;
  postureMax: number;
  poiseMax: number;
  yaw = 0;
  center: THREE.Vector3;
  position: THREE.Vector3;
  vel = new THREE.Vector3();
  grounded = true;
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private shield: THREE.Mesh | null = null;
  private broken = 0;
  private clock = 0;
  private home: THREE.Vector3;
  private tilt = 0;
  private spin = 0;
  constructor(
    private scene: THREE.Scene,
    at: THREE.Vector3,
    hp: number,
    private immortal: () => boolean,
    readonly dummy: DummyKind = 'straw',
    faceTo?: THREE.Vector3,
  ) {
    const look = LOOK[dummy];
    this.label = look.label;
    this.poiseMax = look.poise;
    this.postureMax = look.posture;
    this.home = at.clone();
    this.position = at.clone();
    this.center = at.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.hp = this.maxHp = hp;
    // A training dummy: a post in a base, a stuffed body and head, a crossbar for arms.
    const iron = dummy === 'iron';
    const skin = new THREE.MeshStandardMaterial({ color: look.color, roughness: iron ? 0.45 : 0.95, metalness: iron ? 0.65 : 0 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 });
    const rope = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.14, 14), wood);
    base.position.y = 0.07;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.2, 8), wood);
    post.position.y = 0.6;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 5, 12), skin);
    this.body.position.y = 1.15;
    this.body.scale.set(1, 1, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.86;
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), wood);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 1.38;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 18), rope);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.95;
    belt.scale.set(1.12, 0.9, 1);
    for (const m of [base, post, this.body, head, arms]) m.castShadow = true;
    this.group.add(base, post, this.body, head, arms, belt);
    // A face band, so you can see which way it looks.
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), rope);
    band.position.set(0, 1.9, 0.19);
    this.group.add(band);
    if (dummy === 'shield') {
      this.shield = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.7, metalness: 0.2 }));
      this.shield.rotation.x = Math.PI / 2;
      this.shield.position.set(0, 1.15, 0.6);
      this.group.add(this.shield);
    }
    if (faceTo) this.yaw = Math.atan2(faceTo.x - at.x, faceTo.z - at.z);
    this.group.position.copy(at);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
    targets.add(this);
  }

  /** Behind a raised shield (only the shield bearer, while it isn't reeling). */
  get guarding() {
    return this.dummy === 'shield' && !this.stunned && this.alive;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    let dmg = h.damage;
    if (this.guarding) {
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const from = h.at.clone().sub(this.position).setY(0).normalize();
      if (from.dot(f) > 0.2) {
        dmg *= 0.2;
        events.emit('blockImpact', { at: h.at.clone(), guardBroken: false });
      }
    }
    this.hp = Math.max(this.immortal() ? 1 : 0, this.hp - dmg);
    events.emit('enemyHit', { at: h.at.clone(), amount: Math.round(dmg), crit: h.crit, enemyId: this.id });
    if (this.hp === 0) {
      this.alive = false;
      targets.delete(this);
      this.group.visible = false;
    }
  }
  onBreak(sec: number) {
    this.broken = Math.max(this.broken, sec);
    this.stunned = true;
  }
  update(dt: number) {
    this.clock += dt;
    // A body: gravity, the ground under it (the high ground too), friction, the arena's walls.
    const flying = !this.grounded || this.vel.lengthSq() > 0.04;
    if (this.dummy === 'moving' && this.grounded && !this.stunned && !flying) {
      const want = this.home.x + Math.sin(this.clock * 0.8) * 3;
      this.position.x += THREE.MathUtils.clamp(want - this.position.x, -3 * dt, 3 * dt);
    }
    if (flying) {
      this.vel.y -= GRAVITY * dt;
      const next = this.position.clone().addScaledVector(this.vel, dt);
      // Walls stop it (the knock tracker has already called the slam).
      const flat = new THREE.Vector3(this.vel.x, 0, this.vel.z);
      const sp = flat.length();
      if (sp > 0.01) {
        const hit = physics.castRay(this.center, flat.clone().divideScalar(sp), this.radius + sp * dt + 0.02);
        if (hit !== null) {
          next.x = this.position.x;
          next.z = this.position.z;
          this.vel.x *= -0.15;
          this.vel.z *= -0.15;
        }
      }
      const floor = this.floorAt(next);
      if (next.y <= floor && this.vel.y <= 0) {
        next.y = floor;
        this.vel.y = 0;
        this.grounded = true;
      } else this.grounded = false;
      if (this.grounded) {
        const k = Math.exp(-7 * dt);
        this.vel.x *= k;
        this.vel.z *= k;
        if (Math.hypot(this.vel.x, this.vel.z) < 0.15) this.vel.set(0, 0, 0);
      }
      this.position.copy(next);
    } else {
      // Walked off nothing (pushed off the high ground): fall.
      const floor = this.floorAt(this.position);
      if (this.position.y > floor + 0.05) this.grounded = false;
      else this.position.y = floor;
    }
    this.center.copy(this.position).y += 1.1;
    this.broken = Math.max(0, this.broken - dt);
    this.stunned = this.broken > 0;
    // Thrown about it tumbles; reeling, it sags; back on its feet it settles.
    const wantTilt = !this.grounded ? 1.1 : this.stunned ? 0.35 : 0;
    this.tilt += (wantTilt - this.tilt) * (1 - Math.exp(-10 * dt));
    this.spin = !this.grounded ? this.spin + dt * 5 : this.spin * Math.exp(-6 * dt);
    this.group.position.copy(this.position);
    this.group.rotation.set(this.tilt * Math.cos(this.spin), this.yaw, this.tilt * Math.sin(this.spin) * 0.5);
    if (this.shield) this.shield.position.set(this.guarding ? 0 : 0.45, this.guarding ? 1.15 : 0.7, this.guarding ? 0.6 : 0.3);
  }
  private floorAt(at: THREE.Vector3) {
    const top = Math.max(at.y, this.home.y) + 2.5;
    const hit = physics.castRay(new THREE.Vector3(at.x, top, at.z), new THREE.Vector3(0, -1, 0), 12);
    return hit === null ? this.home.y : top - hit;
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
