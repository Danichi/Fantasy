import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { dampAngle } from '../core/math';
import { buildCharacter, type Look, type BuiltCharacter } from '../npc/charBuilder';
import { buildSword } from '../items/weaponModels';
import { heightAt } from '../world/terrainHeight';
import type { DefenceResult, IncomingAttack, Target } from '../combat/targets';
import type { Foe } from '../creatures/foes';

// A man or woman of the Elder Glen watch, out in the night to meet a raid:
// runs to the fight, picks the nearest raider, squares up and cuts. Raiders
// bite back; a watchman who takes too much goes down on one knee, wounded,
// and stays out of it until the raid is over. Nobody of the watch dies.

const CLIPS = ['sword_idle', 'sword_attack', 'hit', 'jog', 'walk', 'idle', 'crouch'];
const GRAV = 20;

export const WATCH_LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xe0b894, cloth: 0x3a5f9e, height: 1.8 },
  { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x6a4428, skin: 0xfff0e6, cloth: 0x3a5f9e, height: 1.7 },
  { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: false, hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x3a5f9e, height: 1.78 },
  { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a3f22, skin: 0xfff0e6, cloth: 0x3a5f9e, pauldron: true, height: 1.84 },
];
export const BRANNOC_LOOK: Look = { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0x7a4e32, cloth: 0x3a5f9e, pauldron: true, height: 1.9 };

type State = 'run' | 'guard' | 'fight' | 'windup' | 'swing' | 'hurt' | 'down' | 'home';

export class Watchman implements Foe {
  readonly kind = 'watch' as const;
  readonly pos = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  hp: number;
  readonly maxHp: number;
  /** where to stand when nothing is close (the raid's front) */
  post: THREE.Vector3;
  private group = new THREE.Group();
  private built: BuiltCharacter | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  private yaw = 0;
  private state: State = 'run';
  private st = 0;
  private cd = Math.random();
  private vel = new THREE.Vector3();
  private grounded = false;
  private foe: Target | null = null;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private disposed = false;

  constructor(
    readonly name: string,
    at: THREE.Vector3,
    post: THREE.Vector3,
    private scene: THREE.Scene,
    look: Look,
    /** what to fight: the raid's living raiders */
    private enemies: () => Target[],
    readonly captain = false,
  ) {
    this.maxHp = this.hp = captain ? 260 : 140;
    this.post = post.clone();
    this.pos.copy(at);
    this.yaw = Math.atan2(post.x - at.x, post.z - at.z);
    scene.add(this.group);
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 0.9, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.34).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    this.kcc.enableSnapToGround(0.4);
    this.sync();
    void buildCharacter(look, CLIPS).then((b) => {
      if (this.disposed) return;
      this.built = b;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      for (const a of acts) this.actions[a.getClip().name] = a;
      const hand = b.bones.get('hand_r') ?? b.bones.get('Hand_R') ?? b.bones.get('RightHand');
      if (hand) {
        const w = buildSword({ bladeLen: captain ? 0.85 : 0.74, bladeWidth: 0.034, thickness: 0.005, fullerLen: 0.45, gripLen: 0.14, guardSpan: 0.13, guardStyle: 'straight', pommel: 'wheel' });
        w.scale.setScalar(1 / b.root.scale.x);
        w.rotation.set(0, 0, -Math.PI / 2);
        hand.add(w);
      }
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      this.group.add(b.root);
      this.play('jog');
    });
  }

  get alive() {
    return !this.disposed && this.state !== 'down';
  }
  get down() {
    return this.state === 'down';
  }

  private play(name: string, once = false, speed = 1) {
    if (this.clip === name) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.actions[this.clip];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.setEffectiveTimeScale(speed);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.18, false);
    this.clip = name;
  }

  /** A raider's blow: the watch blocks some, takes the rest. */
  strike(att: IncomingAttack): DefenceResult {
    if (!this.alive) return 'dodged';
    // Squared up to it and not mid-swing: the shield of the watch takes most of it.
    const toAtt = att.from.clone().sub(this.pos).setY(0).normalize();
    const facing = toAtt.x * Math.sin(this.yaw) + toAtt.z * Math.cos(this.yaw);
    const blocked = facing > 0.4 && this.state !== 'swing' && Math.random() < 0.45;
    this.hp -= att.damage * (blocked ? 0.25 : 1);
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'down';
      this.st = 0;
      this.play('crouch', true);
      return 'hit';
    }
    if (!blocked) {
      this.state = 'hurt';
      this.st = 0;
      this.play('hit', true);
      this.vel.set(-toAtt.x * 2.5, 0, -toAtt.z * 2.5);
    }
    return blocked ? 'blocked' : 'hit';
  }

  /** Back on their feet after the raid. */
  recover() {
    this.hp = this.maxHp;
    if (this.state === 'down') {
      this.state = 'guard';
      this.st = 0;
    }
  }

  /** Walk off home (end of the raid): returns true once there and gone. */
  goHome(to: THREE.Vector3) {
    this.post.copy(to);
    if (this.state !== 'down') this.state = 'home';
  }

  private nearestEnemy() {
    let best: Target | null = null, bd = 16;
    for (const e of this.enemies()) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(this.pos);
      if (d < bd) (best = e), (bd = d);
    }
    return best;
  }

  update(dt: number) {
    if (this.disposed) return;
    this.st += dt;
    this.cd -= dt;
    this.built?.mixer.update(dt);
    let speed = 0;
    if (this.state !== 'down' && this.state !== 'hurt' && this.state !== 'swing' && this.state !== 'windup' && this.state !== 'home') {
      if (!this.foe?.alive) this.foe = this.nearestEnemy();
    }
    const foe = this.foe?.alive ? this.foe : null;
    switch (this.state) {
      case 'run':
      case 'guard': {
        if (foe) {
          this.state = 'fight';
          this.st = 0;
          break;
        }
        const d = this.post.clone().sub(this.pos).setY(0);
        if (d.length() > 1.5) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 8, dt);
          speed = d.length() > 6 ? 4.6 : 2;
          this.play(speed > 3 ? 'jog' : 'walk');
        } else {
          this.state = 'guard';
          this.play('sword_idle');
        }
        break;
      }
      case 'fight': {
        if (!foe) {
          this.state = 'guard';
          break;
        }
        const d = foe.position.clone().sub(this.pos).setY(0);
        const dist = d.length();
        this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 10, dt);
        if (dist < 1.9 + foe.radius && this.cd <= 0) {
          this.state = 'windup';
          this.st = 0;
          this.play('sword_attack', true, this.captain ? 1.2 : 1.05);
        } else if (dist > 1.6 + foe.radius) {
          speed = 4.4;
          this.play('jog');
        } else this.play('sword_idle');
        break;
      }
      case 'windup':
        if (foe) {
          const d = foe.position.clone().sub(this.pos);
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 10, dt);
        }
        if (this.st > 0.32) {
          this.state = 'swing';
          this.st = 0;
          if (foe && foe.position.distanceTo(this.pos) < 2.4 + foe.radius) {
            const dir = foe.position.clone().sub(this.pos).setY(0).normalize();
            foe.takeHit({ damage: this.captain ? 22 : 13, poise: this.captain ? 45 : 22, dir, at: foe.center.clone(), crit: false, source: 'melee' });
          }
        }
        break;
      case 'swing':
        if (this.st > 0.45) {
          this.cd = (this.captain ? 0.9 : 1.4) + Math.random() * 0.8;
          this.state = 'fight';
          this.st = 0;
        }
        break;
      case 'hurt':
        if (this.st > 0.5) {
          this.state = 'fight';
          this.st = 0;
        }
        break;
      case 'down':
        this.play('crouch', true);
        break;
      case 'home': {
        const d = this.post.clone().sub(this.pos).setY(0);
        if (d.length() > 1) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 6, dt);
          speed = 1.5;
          this.play('walk');
        } else this.play('idle');
        break;
      }
    }
    if (speed !== 0) {
      this.vel.x = Math.sin(this.yaw) * speed;
      this.vel.z = Math.cos(this.yaw) * speed;
    } else {
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
    }
    if (!this.grounded) this.vel.y -= GRAV * dt;
    else this.vel.y = Math.min(this.vel.y, 0) - 2 * dt;
    this.kcc.computeColliderMovement(this.col, { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    const gy = heightAt(next.x, next.z);
    if (next.y - 0.9 < gy - 0.3) next.y = gy + 0.9;
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.pos.set(next.x, next.y - 0.86, next.z);
    this.grounded = this.kcc.computedGrounded();
    this.sync();
  }

  /** At home after the raid (close enough to vanish indoors). */
  get home() {
    return this.state === 'home' && this.post.distanceTo(this.pos) < 1.5;
  }

  private sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.center.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
  }
}
