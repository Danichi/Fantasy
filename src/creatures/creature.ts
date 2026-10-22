import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { damp } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { heightAt } from '../world/terrainHeight';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// The body every hand-built creature shares: a kinematic capsule that walks
// on the terrain and around the static world, a health pool scaled by its
// level, hits and death. Subclasses supply the brain (think) and the look.

/** How a creature's level scales it: health, damage and the XP it is worth. */
export function levelScale(level: number) {
  const l = Math.max(1, level) - 1;
  return { hp: 1 + l * 0.14, dmg: 1 + l * 0.09, xp: 1 + l * 0.16 };
}

export interface CreatureBase {
  /** display name over the health bar */
  name: string;
  hp: number;
  damage: number;
  radius: number;
  halfHeight: number;
}

export abstract class Creature implements Target {
  id = newTargetId();
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius: number;
  halfHeight: number;
  readonly label: string;
  readonly level: number;
  readonly damage: number;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  /** facing (radians, 0 = +Z) */
  yaw = Math.random() * Math.PI * 2;
  /** world velocity (m/s) */
  readonly vel = new THREE.Vector3();
  readonly home: THREE.Vector3;
  /** seconds since death */
  protected deadT = 0;
  /** how long the body lies before it is removed */
  protected corpseTime = 6;
  /** the movement it wants this step (set by think) */
  protected wish = new THREE.Vector3();
  /** how quickly it reaches the wished speed */
  protected accel = 10;
  /** last step was blocked by the world (ran into a wall or tree) */
  protected bumped = false;
  /** flies: no gravity, wish.y steers up and down (it still drops when dead) */
  protected flying = false;
  /** lowest it will fly above the ground (m) */
  protected minAltitude = 0.4;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private disposed = false;

  constructor(
    readonly kind: string,
    base: CreatureBase,
    level: number,
    at: THREE.Vector3,
    protected readonly scene: THREE.Scene,
    protected readonly fx: FX,
  ) {
    const s = levelScale(level);
    this.level = level;
    this.label = base.name;
    this.hp = this.maxHp = Math.round(base.hp * s.hp);
    this.damage = base.damage * s.dmg;
    this.radius = base.radius;
    this.halfHeight = base.halfHeight;
    this.home = at.clone();
    this.position.copy(at);
    const R = physics.R;
    const cy = this.halfHeight + this.radius;
    this.rb = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + cy, at.z));
    this.col = physics.world.createCollider(R.ColliderDesc.capsule(this.halfHeight, this.radius).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    this.kcc.enableSnapToGround(0.4);
    targets.add(this);
  }

  /** Fliers don't stick to the ground. */
  protected setGroundSnap(on: boolean) {
    if (on) this.kcc.enableSnapToGround(0.4);
    else this.kcc.disableSnapToGround();
  }

  /** Decide what to do this step: set this.wish (and yaw), react to the player. */
  protected abstract think(dt: number, player: Player): void;
  /** Pose and place the look for this step. */
  protected abstract animate(dt: number, player: Player): void;
  /** Called when health runs out (before the death event). */
  protected onDeath(): void {}
  /** Called on every hit that doesn't kill. */
  protected onHurt(_h: HitInfo): void {}
  /** Remove the look from the scene. */
  protected abstract disposeLook(): void;

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    this.vel.addScaledVector(h.dir, Math.min(4, 1.2 + h.poise * 0.02));
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    this.onHurt(h);
  }

  protected die() {
    if (!this.alive) return;
    this.alive = false;
    this.stunned = false;
    this.lockable = false;
    this.onDeath();
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind, level: this.level });
    this.fx.drops.burst(this.center, new THREE.Color(0xffd58a), 14, 0.75, 4);
  }

  /** Ground height under a point (terrain). */
  groundAt = (x: number, z: number) => heightAt(x, z);

  update(dt: number, player: Player) {
    if (this.disposed) return;
    if (!this.alive) {
      this.deadT += dt;
      this.wish.set(0, 0, 0);
    } else {
      this.think(dt, player);
    }
    // Move: ease toward the wished velocity, fall, slide around the world.
    this.vel.x = damp(this.vel.x, this.wish.x, this.accel, dt);
    this.vel.z = damp(this.vel.z, this.wish.z, this.accel, dt);
    const flies = this.flying && this.alive;
    if (flies) this.vel.y = damp(this.vel.y, this.wish.y, this.accel, dt);
    else this.vel.y -= 20 * dt;
    const want = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.col, want, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const flat = Math.hypot(want.x, want.z);
    this.bumped = flat > 0.02 && Math.hypot(m.x, m.z) < flat * 0.35;
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - (this.halfHeight + this.radius), next.z);
    if (this.kcc.computedGrounded() && !flies) this.vel.y = Math.min(0, this.vel.y);
    // Never sink below the terrain (the controller can miss thin seams); fliers keep their height.
    const gy = this.groundAt(this.position.x, this.position.z);
    if (flies && this.position.y < gy + this.minAltitude) this.vel.y = Math.max(this.vel.y, (gy + this.minAltitude - this.position.y) * 6);
    if (this.position.y < gy - 0.3) {
      this.position.y = gy;
      this.rb.setNextKinematicTranslation({ x: next.x, y: gy + this.halfHeight + this.radius, z: next.z });
      this.col.setTranslation({ x: next.x, y: gy + this.halfHeight + this.radius, z: next.z });
      this.vel.y = 0;
    }
    this.center.set(this.position.x, this.position.y + this.halfHeight + this.radius, this.position.z);
    this.animate(dt, player);
    if (!this.alive && this.deadT > this.corpseTime) this.dispose();
  }

  /** Gone from the world (corpse removed, or despawned by the population). */
  get dead() {
    return this.disposed;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.alive = false;
    targets.delete(this);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    this.disposeLook();
  }
}
