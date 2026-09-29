import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { dampAngle, segmentPointDistance } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { buildCharacter, type Look, type BuiltCharacter } from '../npc/charBuilder';
import { buildSword } from '../items/weaponModels';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// Road bandits (World Expansion phase 4): humans built from the character
// kit, animated with the Universal Animation Library. Swordsmen close in and
// cut; crossbowmen keep their distance and loose bolts that a block stops and
// a Boundary field deflects. The Hollow Ridge chief is a tougher crossbowman.

export type BanditRole = 'sword' | 'crossbow' | 'chief';

const CLIPS = ['sword_idle', 'sword_attack', 'hit', 'death', 'jog', 'walk', 'bow_aim', 'bow_shoot', 'idle'];
const GRAV = 20;

const LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xe0b894, cloth: 0x5a3a2a, hood: true, height: 1.8 },
  { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: false, hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x4a4a3a, height: 1.76 },
  { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0x6a4428, skin: 0xfff0e6, cloth: 0x6a2a2a, hood: true, height: 1.7 },
  { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a3f22, skin: 0xfff0e6, cloth: 0x3a3a44, pauldron: true, height: 1.84 },
];

function crossbowModel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.8, roughness: 0.4 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.62), wood);
  stock.position.z = 0.18;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 5, 16, Math.PI), steel);
  bow.rotation.set(Math.PI / 2, 0, 0);
  bow.position.z = 0.45;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.56), new THREE.MeshBasicMaterial({ color: 0xd8d0c0 }));
  string.rotation.z = Math.PI / 2;
  string.position.z = 0.36;
  g.add(stock, bow, string);
  return g;
}

/** Crossbow bolts in flight (shared by every crossbowman). */
export class Bolts {
  private list: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; damage: number }[] = [];
  private geo = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5).rotateX(Math.PI / 2);
  private mat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.7 });
  constructor(private scene: THREE.Scene, private fx: FX) {}

  fire(from: THREE.Vector3, to: THREE.Vector3, speed: number, damage: number) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(from);
    const d = to.clone().sub(from);
    const t = d.length() / speed;
    // Aim slightly high to cancel the drop.
    const vel = d.divideScalar(t).add(new THREE.Vector3(0, 0.5 * 4 * t, 0));
    mesh.lookAt(from.clone().add(vel));
    this.scene.add(mesh);
    this.list.push({ mesh, vel, life: 3, damage });
  }

  update(dt: number, player: Player) {
    for (const b of this.list) {
      b.life -= dt;
      b.vel.y -= 4 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.lookAt(b.mesh.position.clone().add(b.vel));
      const p = b.mesh.position;
      if (player.canIntercept(p.x, p.z)) {
        // The Boundary field catches the bolt in the air.
        events.emit('boundaryIntercept', { at: p.clone(), perfect: false });
        this.fx.add.spawn({ pos: p.clone(), spread: 0.3, count: 14, life: [0.2, 0.4], size: [0.06, 0.01], color: 0xcfe8ff, color2: 0x7fb6ff, upBias: 0.4 });
        b.life = 0;
        continue;
      }
      const a = player.pos.clone().setY(player.pos.y + 0.3), c = player.pos.clone().setY(player.pos.y + 1.6);
      if (!player.dead && segmentPointDistance(a, c, p) < 0.45) {
        player.receiveAttack({ damage: b.damage, from: p.clone().sub(b.vel.clone().normalize().multiplyScalar(4)), at: p.clone(), parryable: false, poise: 12 });
        b.life = 0;
      }
    }
    for (const b of this.list) if (b.life <= 0) this.scene.remove(b.mesh);
    this.list = this.list.filter((b) => b.life > 0);
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.mesh);
    this.list = [];
  }
}

type State = 'idle' | 'patrol' | 'chase' | 'aim' | 'windup' | 'attack' | 'hurt' | 'dying';

export class Bandit implements Target {
  id = newTargetId();
  kind: string;
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius = 0.42;
  halfHeight = 0.55;
  position = new THREE.Vector3();
  stunned = false;
  lockable = true;
  hp: number;
  maxHp: number;
  name: string;
  private group = new THREE.Group();
  private built: BuiltCharacter | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  private yaw = Math.random() * 6.28;
  private state: State = 'idle';
  private st = 0;
  private cooldown = 1 + Math.random();
  private vel = new THREE.Vector3();
  private grounded = false;
  private hitDone = false;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private patrolTarget: THREE.Vector3;
  /** sparring: never drops below 1 hp */
  nonLethal = false;
  /** melee damage per landed swing, and a cooldown multiplier (sparring ladder tuning) */
  hitDamage = 16;
  pace = 1;
  /** set when the bandit notices the player (for ambush groups) */
  alerted = false;

  constructor(readonly role: BanditRole, at: THREE.Vector3, private scene: THREE.Scene, private bolts: Bolts, readonly home = at.clone(), look?: Look) {
    this.kind = role === 'chief' ? 'banditChief' : 'bandit';
    this.name = role === 'chief' ? 'Varn the Hollow' : role === 'crossbow' ? 'Bandit Crossbowman' : 'Bandit Cutthroat';
    this.maxHp = this.hp = role === 'chief' ? 420 : role === 'crossbow' ? 80 : 110;
    this.position.copy(at);
    this.patrolTarget = at.clone();
    scene.add(this.group);
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 0.9, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.36).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    targets.add(this);
    this.sync();
    const lk = look ?? LOOKS[(this.id * 7) % LOOKS.length];
    void buildCharacter(role === 'chief' ? { ...lk, pauldron: true, cloth: 0x2a1a1a, height: 1.9 } : lk, CLIPS).then((b) => {
      if (!this.alive && this.dead) return;
      this.built = b;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      for (const a of acts) this.actions[a.getClip().name] = a;
      // A weapon in the right hand.
      const hand = b.bones.get('hand_r') ?? b.bones.get('Hand_R') ?? b.bones.get('RightHand');
      if (hand) {
        const w = role === 'sword' ? buildSword({ bladeLen: 0.72, bladeWidth: 0.03, thickness: 0.005, fullerLen: 0.4, gripLen: 0.13, guardSpan: 0.1, guardStyle: 'straight', pommel: 'wheel' }) : crossbowModel();
        const s = 1 / b.root.scale.x;
        w.scale.setScalar(s);
        if (role === 'sword') w.rotation.set(0, 0, -Math.PI / 2);
        else w.rotation.set(0, Math.PI / 2, 0);
        hand.add(w);
      }
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      this.group.add(b.root);
      this.play(role === 'sword' ? 'sword_idle' : 'idle');
    });
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

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    // Sparring partners yield instead of dying.
    if (this.nonLethal) this.hp = Math.max(1, this.hp);
    this.alerted = true;
    events.emit('enemyHit', { at: this.center.clone(), amount: h.damage, crit: h.crit, enemyId: this.id });
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dying';
      this.st = 0;
      this.play('death', true);
      targets.delete(this);
      physics.world.removeCollider(this.col, false);
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
      return;
    }
    // Chiefs shrug off light hits; everyone else flinches.
    if (this.role !== 'chief' || h.poise > 30) {
      this.state = 'hurt';
      this.st = 0;
      this.vel.set(h.dir.x * 3, 1.5, h.dir.z * 3);
      this.play('hit', true);
    }
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.cooldown -= dt;
    this.built?.mixer.update(dt);
    if (this.state === 'dying') {
      if (this.st > 4 && !this.dead) {
        this.dead = true;
        this.dispose();
      }
      return;
    }
    const to = player.pos.clone().sub(this.position);
    const dist = Math.hypot(to.x, to.z);
    const aware = !player.dead && (dist < (this.alerted ? 34 : 18));
    if (aware) this.alerted = true;
    const wantYaw = Math.atan2(to.x, to.z);
    const ranged = this.role !== 'sword';
    let speed = 0;
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        if (aware) {
          this.state = ranged ? 'aim' : 'chase';
          this.st = 0;
          break;
        }
        const pt = this.patrolTarget.clone().sub(this.position).setY(0);
        if (pt.length() < 1 || this.st > 12) {
          const a = Math.random() * 6.28, r = Math.random() * 7;
          this.patrolTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.st = 0;
          this.state = Math.random() < 0.5 ? 'idle' : 'patrol';
        }
        if (this.state === 'patrol') {
          this.yaw = dampAngle(this.yaw, Math.atan2(pt.x, pt.z), 5, dt);
          speed = 1.3;
          this.play('walk');
        } else this.play(ranged ? 'idle' : 'sword_idle');
        break;
      }
      case 'chase':
        this.yaw = dampAngle(this.yaw, wantYaw, 9, dt);
        if (!aware) (this.state = 'patrol'), (this.st = 0);
        else if (dist < 2.2 && this.cooldown <= 0) {
          this.state = 'windup';
          this.st = 0;
          this.play('sword_attack', true, 1.15);
        } else if (dist > 1.8) {
          speed = 4.1;
          this.play('jog');
        } else this.play('sword_idle');
        break;
      case 'aim':
        this.yaw = dampAngle(this.yaw, wantYaw, 7, dt);
        if (!aware) (this.state = 'patrol'), (this.st = 0);
        else if (dist < 6) {
          // Back off to shooting range.
          speed = -2.6;
          this.play('walk');
        } else if (dist > 22) {
          speed = 3.6;
          this.play('jog');
        } else {
          this.play('bow_aim');
          if (this.cooldown <= 0 && this.st > 0.9) {
            this.state = 'attack';
            this.st = 0;
            this.hitDone = false;
            this.play('bow_shoot', true);
          }
        }
        break;
      case 'windup':
        this.yaw = dampAngle(this.yaw, wantYaw, 10, dt);
        if (this.st > 0.35) {
          this.state = 'attack';
          this.st = 0;
          this.hitDone = false;
          const d = to.setY(0).normalize();
          this.vel.set(d.x * 3.2, 0, d.z * 3.2);
        }
        break;
      case 'attack':
        if (ranged) {
          if (!this.hitDone && this.st > 0.15) {
            this.hitDone = true;
            const from = this.center.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 0.6, 0.35, Math.cos(this.yaw) * 0.6));
            const lead = player.pos.clone().add(player.vel.clone().setY(0).multiplyScalar(dist / 32 * 0.6)).setY(player.pos.y + 1.1);
            this.bolts.fire(from, lead, 32, this.role === 'chief' ? 26 : 16);
            if (this.role === 'chief') setTimeout(() => this.alive && this.bolts.fire(from, player.pos.clone().setY(player.pos.y + 1.1), 32, 20), 280);
          }
          if (this.st > 0.7) {
            this.cooldown = this.role === 'chief' ? 1.4 : 2.2 + Math.random();
            this.state = 'aim';
            this.st = 0;
          }
        } else {
          if (!this.hitDone && this.st > 0.12) this.checkHit(player);
          if (this.st > 0.55) {
            this.cooldown = (1.1 + Math.random() * 0.8) * this.pace;
            this.state = 'chase';
            this.st = 0;
          }
        }
        break;
      case 'hurt':
        if (this.st > 0.5) {
          this.state = ranged ? 'aim' : 'chase';
          this.st = 0;
        }
        break;
    }
    if (speed !== 0) {
      this.vel.x = Math.sin(this.yaw) * speed;
      this.vel.z = Math.cos(this.yaw) * speed;
    } else if (this.state !== 'attack' && this.state !== 'hurt') {
      this.vel.x *= Math.exp(-10 * dt);
      this.vel.z *= Math.exp(-10 * dt);
    } else {
      this.vel.x *= Math.exp(-4 * dt);
      this.vel.z *= Math.exp(-4 * dt);
    }
    if (!this.grounded) this.vel.y -= GRAV * dt;
    else this.vel.y = Math.min(this.vel.y, 0) - 2 * dt;
    this.kcc.computeColliderMovement(this.col, { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - 0.86, next.z);
    this.grounded = this.kcc.computedGrounded();
    this.sync();
  }

  private checkHit(player: Player) {
    const a = player.pos.clone().setY(player.pos.y + 0.35);
    const b = player.pos.clone().setY(player.pos.y + 1.5);
    if (segmentPointDistance(a, b, this.center) > 1.45) return;
    this.hitDone = true;
    const dir = this.position.clone().sub(player.pos).setY(0).normalize();
    player.receiveAttack({
      damage: this.hitDamage,
      from: this.position.clone(),
      parryable: true,
      poise: 26,
      onParried: () => {
        this.stunned = true;
        this.state = 'hurt';
        this.st = -0.6; // a longer opening after a parry
        this.play('hit', true);
        this.vel.set(-dir.x * 3, 2, -dir.z * 3);
        setTimeout(() => (this.stunned = false), 1200);
      },
    });
  }

  private sync() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y + 1.0, this.position.z);
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
    if (this.alive) physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    this.alive = false;
    this.dead = true;
  }
}

