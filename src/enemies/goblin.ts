import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { clamp, dampAngle, segmentPointDistance } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

const MODEL_URL = '/assets/npc/goblin.glb';
const HEIGHT = 1.65;
const GRAV = 20;

let modelPromise: Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> | null = null;
function loadGoblinModel() {
  return (modelPromise ??= new GLTFLoader().loadAsync(MODEL_URL).then((g) => ({ scene: g.scene, animations: g.animations })).catch((e) => {
    console.warn('Goblin model not found; using fallback:', e);
    return null;
  }));
}

function fallbackGoblin() {
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

export class Goblin implements Target {
  id = newTargetId();
  kind = 'goblin';
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

  private state: 'idle' | 'chase' | 'windup' | 'attack' | 'hurt' | 'dying' = 'idle';
  private st = 0;
  private cooldown = 0;
  private deathT = 0;
  private hitDone = false;
  private vel = new THREE.Vector3();
  private yaw = Math.random() * Math.PI * 2;
  private grounded = true;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private model: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private currentAction = '';

  constructor(at: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(at);
    this.group.add(fallbackGoblin());
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

    void loadGoblinModel().then((source) => {
      if (!source || !this.alive) return;
      const model = SkeletonUtils.clone(source.scene) as THREE.Group;
      model.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(model);
      const h = Math.max(0.01, bb.max.y - bb.min.y);
      const s = HEIGHT / h;
      model.scale.setScalar(s);
      model.updateMatrixWorld(true);
      const bb2 = new THREE.Box3().setFromObject(model);
      model.position.y = -bb2.min.y;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = true;
      });

      this.group.clear();
      this.group.add(model);
      this.model = model;
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of source.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.setAnimation('idle');
    });
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying') return;
    this.hp -= h.damage;
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (h.source === 'spell' || h.poise >= 18) {
      this.stunned = true;
      this.setState('hurt');
      const back = h.dir.clone().setY(0).normalize();
      this.vel.set(back.x * 3.5, 3.4, back.z * 3.5);
      this.fx.sparks(this.center, back);
    }
  }

  private die() {
    this.alive = false;
    this.setState('dying');
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.fx.add.spawn({ pos: this.center, spread: 1.2, count: 14, life: [0.35, 0.9], size: [0.1, 0.02], color: 0x91b65a, color2: 0x3d5228, gravity: 4, upBias: 0.4 });
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 1.0;
  }

  private setState(s: Goblin['state']) {
    this.state = s;
    this.st = 0;
    if (s === 'idle') this.setAnimation('idle');
    else if (s === 'chase') this.setAnimation('walk');
    else if (s === 'dying') this.setAnimation('death');
    else if (s === 'hurt') this.setAnimation('hit');
    else if (s === 'attack' || s === 'windup') this.setAnimation('attack');
  }

  private setAnimation(name: string) {
    if (!this.mixer) return;
    const keys = Object.keys(this.actions);
    const wanted = keys.find((k) => k.toLowerCase().includes(name)) ??
      (name === 'walk' ? keys.find((k) => k.toLowerCase().includes('run')) : undefined) ??
      keys[0];
    if (!wanted || wanted === this.currentAction) return;
    const next = this.actions[wanted];
    const prev = this.actions[this.currentAction];
    if (prev) prev.fadeOut(0.12);
    next.reset().fadeIn(0.12).play();
    this.currentAction = wanted;
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.cooldown -= dt;
    this.mixer?.update(dt);

    if (this.state === 'dying') {
      this.deathT += dt;
      this.group.scale.y = clamp(1 - this.deathT, 0.01, 1);
      this.syncVisual();
      return;
    }

    const to = player.pos.clone().sub(this.position);
    const dist = Math.hypot(to.x, to.z);
    const aware = !player.dead && dist < 15;
    const wantYaw = Math.atan2(to.x, to.z);

    if (this.state === 'idle') {
      if (aware) this.setState('chase');
    } else if (this.state === 'chase') {
      this.yaw = dampAngle(this.yaw, wantYaw, 8, dt);
      if (!aware) this.setState('idle');
      else if (this.grounded && dist < 2.1 && this.cooldown <= 0) this.setState('windup');
      else if (this.grounded) {
        const dir = to.setY(0).normalize();
        const speed = 1.45;
        this.vel.x = dir.x * speed;
        this.vel.z = dir.z * speed;
      }
    } else if (this.state === 'windup') {
      this.vel.x *= Math.exp(-12 * dt);
      this.vel.z *= Math.exp(-12 * dt);
      this.yaw = dampAngle(this.yaw, wantYaw, 12, dt);
      if (this.st > 0.42) {
        this.hitDone = false;
        this.setState('attack');
        const dir = to.setY(0).normalize();
        this.vel.set(dir.x * 4.2, 2.6, dir.z * 4.2);
      }
    } else if (this.state === 'attack') {
      if (!this.hitDone) this.checkHit(player);
      if (this.st > 0.32) {
        this.cooldown = 1.0 + Math.random() * 0.8;
        this.setState('chase');
      }
    } else if (this.state === 'hurt') {
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
      if (this.grounded && this.st > 0.45) {
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
  }

  private checkHit(player: Player) {
    const a = player.pos.clone().setY(player.pos.y + 0.35);
    const b = player.pos.clone().setY(player.pos.y + 1.45);
    if (segmentPointDistance(a, b, this.center) > 1.15) return;
    this.hitDone = true;
    const dir = this.position.clone().sub(player.pos).setY(0).normalize();
    player.receiveAttack({
      damage: 17,
      from: this.position.clone(),
      parryable: true,
      poise: 28,
      onParried: () => {
        this.stunned = true;
        this.setState('hurt');
        this.vel.set(-dir.x * 4, 3.5, -dir.z * 4);
      },
    });
  }

  private syncVisual() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
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
