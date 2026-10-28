import { reactOf } from '../combat/core';
import * as THREE from 'three';
import { ignoresPlayer } from '../origins/stealth';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { clamp } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { Character } from '../player/character';
import { Animator } from '../player/animator';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import { HumanoidBrain, ARCHETYPES, MOVESETS } from '../combat/ai';

// The Orc Warrior model is skinned to the hero's skeleton (tools/rig-orcs.mjs),
// so the crypt's orcs walk, swing, flinch and fall with the hero's mocap.
const MODEL_URL = '/assets/npc/orcWarrior.glb';
const HEIGHT = 1.75;
const GRAV = 20;
const CLIPS = ['idle', 'walk', 'run', 'walk_back', 'run_back', 'strafe_l', 'strafe_r', 'attack_light_1', 'attack_light_2', 'attack_light_3', 'attack_heavy', 'attack_leap', 'skill_spin', 'kick', 'guard_break', 'hit_react', 'death'];
const HURT = 0.55; // seconds of flinch
const PARRY_DAZE = 2.2; // seconds reeling after a parry
const DEATH_CLIP = 2.2; // seconds of the death clip to play before sinking away

function fallbackOrcMob() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x668b42, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x46352a, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x77716a, metalness: 0.75, roughness: 0.35 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xffd36b });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.58, 4, 8), cloth);
  torso.position.y = 0.92;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  head.scale.set(1.1, 0.9, 1);
  head.position.set(0, 1.48, 0.02);
  g.add(head);

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), skin);
    ear.rotation.z = s * -0.9;
    ear.position.set(s * 0.25, 1.56, 0);
    g.add(ear);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 3, 6), cloth);
    leg.position.set(s * 0.11, 0.47, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.4, 3, 6), skin);
    arm.position.set(s * 0.34, 0.98, 0);
    arm.rotation.z = s * -0.35;
    g.add(arm);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eye);
    e.position.set(s * 0.105, 1.51, 0.27);
    g.add(e);
  }
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.55, 0.11), metal);
  blade.position.set(0.47, 0.92, 0.05);
  blade.rotation.z = -0.5;
  g.add(blade);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  return g;
}

export class OrcMob implements Target {
  id = newTargetId();
  kind = 'orc';
  alive = true;
  lockable = true;
  stunned = false;
  hp = 85;
  maxHp = 85;
  radius = 0.34;
  halfHeight = 0.82;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  readonly group = new THREE.Group();

  private state: 'idle' | 'chase' | 'hurt' | 'dying' = 'idle';
  private st = 0;
  private deathT = 0;
  vel = new THREE.Vector3();
  yaw = Math.random() * Math.PI * 2;
  grounded = true;
  /** a brute (combat/ai.ts): heavy chops, leaping slams, a whirl, kicks and grabs */
  readonly brain: HumanoidBrain;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private char: Character | null = null;
  private anim: Animator | null = null;

  constructor(at: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(at);
    this.brain = new HumanoidBrain(this, { ...ARCHETYPES.brute, run: 3.2 }, MOVESETS.orc, {
      damage: () => 17,
      duration: (c) => this.anim?.duration(c) || 1.5,
      onParried: () => {
        this.stunned = true;
        this.daze = PARRY_DAZE;
        this.setState('hurt');
        const d = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.vel.set(-d.x * 4, 3.5, -d.z * 4);
      },
      onBlow: (_m, res) => {
        if (res === 'blocked' || res === 'guardBroken') this.fx.sparks(this.center.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0.2, Math.cos(this.yaw)).multiplyScalar(0.8)));
      },
    });
    const fallback = fallbackOrcMob();
    this.group.add(fallback);
    scene.add(this.group);

    this.rb = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 0.35, at.z),
    );
    this.col = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.48, 0.3).setCollisionGroups(groups(G_ENEMY, 0)),
      this.rb,
    );
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    targets.add(this);
    this.syncVisual();

    const c = new Character();
    c.load('/assets/character/', { model: MODEL_URL, height: HEIGHT, clips: CLIPS }).then(() => {
      if (!this.alive && this.state !== 'dying') return;
      c.root.updateMatrixWorld(true);
      this.anim = new Animator(c);
      this.char = c;
      this.group.remove(fallback);
      this.group.add(c.root);
      this.animate(0);
    }).catch((e) => console.warn('OrcMob model not found; using fallback:', e));
  }

  /** seconds left reeling from a parry (wide open to a riposte) */
  private daze = 0;

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying') return;
    this.hp -= h.damage;
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.brain.onHurt(h);
    // Staggered only when the blow got through its poise (combat/core.ts).
    const react = reactOf(h, 18);
    if (react !== 'none') {
      this.setState('hurt');
      const back = h.dir.clone().setY(0).normalize();
      const k = react === 'knockdown' ? 4.5 : 3.5;
      this.vel.set(back.x * k, 3.4, back.z * k);
      this.fx.sparks(this.center, back);
    }
  }

  /** Posture broken: reel, open to a finisher (combat/core.ts). */
  onBreak(sec: number) {
    this.brain.interrupt();
    this.setState('hurt');
    this.daze = sec;
  }

  private die() {
    this.alive = false;
    this.setState('dying');
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.fx.add.spawn({ pos: this.center, spread: 1.2, count: 14, life: [0.35, 0.9], size: [0.1, 0.02], color: 0x91b65a, color2: 0x3d5228, gravity: 4, upBias: 0.4 });
  }

  get dead() {
    // With the rig: the death clip plays out, then the body sinks away.
    return this.state === 'dying' && this.deathT > (this.char ? DEATH_CLIP + 1.2 : 1.0);
  }

  private setState(s: OrcMob['state']) {
    this.state = s;
    this.st = 0;
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.daze = Math.max(0, this.daze - dt);

    if (this.state === 'dying') {
      this.deathT += dt;
      if (this.char) this.group.position.y = this.position.y - clamp((this.deathT - DEATH_CLIP) * 0.6, 0, 1);
      else this.group.scale.y = clamp(1 - this.deathT, 0.01, 1);
      this.animate(dt);
      return;
    }

    const to = player.pos.clone().sub(this.position);
    const dist = Math.hypot(to.x, to.z);
    const aware = !player.dead && !ignoresPlayer(this) && dist < 15;

    if (this.state === 'idle') {
      this.vel.x *= Math.exp(-10 * dt);
      this.vel.z *= Math.exp(-10 * dt);
      if (aware) this.setState('chase');
    } else if (this.state === 'chase') {
      if (!aware && !this.brain.attacking) {
        this.brain.interrupt();
        this.setState('idle');
      } else if (this.grounded) this.brain.update(dt, player);
    } else if (this.state === 'hurt') {
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
      if (this.grounded && this.st > HURT && this.daze <= 0) {
        this.stunned = false;
        this.setState('chase');
      }
    }

    if (!this.grounded) this.vel.y -= GRAV * dt;
    else this.vel.y = Math.min(this.vel.y, 0) - 2 * dt;

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - 0.48, next.z);
    this.grounded = this.kcc.computedGrounded();
    this.syncVisual();
    this.animate(dt);
  }

  /** Pose the rig: locomotion from the actual velocity, full-body clips for everything else. */
  private animate(dt: number) {
    const anim = this.anim;
    if (!anim) return;
    const s = this.state;
    if (s === 'dying') anim.setFull('death', Math.min(this.deathT, DEATH_CLIP), 0.15);
    else if (this.brain.clip) anim.setFull(this.brain.clip, this.brain.mt, 0.12, 0.25);
    else if (s === 'hurt' && this.daze > 0.6 && !this.stunned) anim.setFull('guard_break', Math.min(0.6, this.st), 0.1, 0.2); // posture broken
    else if (s === 'hurt') anim.setFull('hit_react', this.st * 1.1, 0.08, 0.2);
    else anim.setFull(null, 0);
    const c = Math.cos(-this.yaw), sn = Math.sin(-this.yaw);
    const local = s === 'chase' || s === 'idle' ? { x: this.vel.x * c + this.vel.z * sn, z: -this.vel.x * sn + this.vel.z * c } : { x: 0, z: 0 };
    anim.update(dt, { local, grounded: this.grounded });
  }

  private syncVisual() {
    this.group.position.copy(this.position);
    this.group.position.y += this.brain?.hop ?? 0;
    this.group.rotation.y = this.yaw + (this.brain?.spin ?? 0);
    this.center.set(this.position.x, this.position.y + 0.8, this.position.z);
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
  }
}
