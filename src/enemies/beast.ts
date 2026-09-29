import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { compressedGltf } from '../core/gltf';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { damp, dampAngle, clamp } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

export type BeastKind = 'green' | 'blue' | 'magma' | 'cave';

interface BeastVariant {
  file: string;
  height: number;
  hp: number;
  damage: number;
  radius: number;
  speed: number;
  aggro: number;
  attackRange: number;
  attackCooldown: number;
}

export const BEAST_VARIANTS: Record<BeastKind, BeastVariant> = {
  green: { file: 'wolf.glb', height: 1.05, hp: 60, damage: 14, radius: 0.34, speed: 3.3, aggro: 15, attackRange: 1.65, attackCooldown: 1.25 },
  blue: { file: 'stag.glb', height: 1.5, hp: 120, damage: 22, radius: 0.42, speed: 2.8, aggro: 17, attackRange: 2.0, attackCooldown: 1.7 },
  magma: { file: 'orc.glb', height: 1.85, hp: 145, damage: 28, radius: 0.43, speed: 2.45, aggro: 16, attackRange: 1.9, attackCooldown: 1.55 },
  cave: { file: 'goblin.glb', height: 1.45, hp: 85, damage: 18, radius: 0.36, speed: 3.0, aggro: 15, attackRange: 1.7, attackCooldown: 1.35 },
};

const LOADER = compressedGltf;
const CACHE = new Map<string, Promise<GLTF>>();

type State = 'idle' | 'chase' | 'attack' | 'hurt' | 'dying';

const findClip = (clips: THREE.AnimationClip[], patterns: RegExp[]) =>
  clips.find((clip) => patterns.some((p) => p.test(clip.name)));

function loadFile(file: string) {
  const cached = CACHE.get(file);
  if (cached) return cached;
  const promise = LOADER.loadAsync('/assets/vendor/creatures/' + file);
  CACHE.set(file, promise);
  return promise;
}

export class Beast implements Target {
  id = newTargetId();
  kind: BeastKind;
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius: number;
  halfHeight: number;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  readonly group = new THREE.Group();

  private state: State = 'idle';
  private t = 0;
  private cooldown = 0;
  private attackDone = false;
  private deadT = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private vel = new THREE.Vector3();
  private yaw = Math.random() * Math.PI * 2;
  private home: THREE.Vector3;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private model: THREE.Object3D | null = null;
  private modelHeight = 1;
  private hitFlash = 0;

  constructor(
    readonly variantKind: BeastKind,
    at: THREE.Vector3,
    private readonly scene: THREE.Scene,
    private readonly fx: FX,
  ) {
    this.kind = variantKind;
    const v = BEAST_VARIANTS[variantKind];
    this.hp = this.maxHp = v.hp;
    this.radius = v.radius;
    this.halfHeight = 0.45;
    this.home = at.clone();
    this.position.copy(at);

    const R = physics.R;
    const centerY = this.halfHeight + this.radius;
    this.rb = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + centerY, at.z),
    );
    this.col = physics.world.createCollider(
      R.ColliderDesc.capsule(this.halfHeight, this.radius).setCollisionGroups(groups(G_ENEMY, 0)),
      this.rb,
    );
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);

    scene.add(this.group);
    targets.add(this);
    void this.loadModel();
  }

  private async loadModel() {
    try {
      const gltf = await loadFile(BEAST_VARIANTS[this.variantKind].file);
      if (!this.alive) return;

      const model = gltf.scene;
      this.model = model;
      model.updateMatrixWorld(true);

      const before = new THREE.Box3().setFromObject(model);
      const currentH = Math.max(0.01, before.max.y - before.min.y);
      const targetH = BEAST_VARIANTS[this.variantKind].height;
      model.scale.multiplyScalar(targetH / currentH);
      model.updateMatrixWorld(true);

      const after = new THREE.Box3().setFromObject(model);
      const centre = after.getCenter(new THREE.Vector3());
      model.position.x -= centre.x;
      model.position.z -= centre.z;
      model.position.y -= after.min.y;
      this.modelHeight = targetH;

      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const mat = material as THREE.MeshStandardMaterial;
          if ('envMapIntensity' in mat) mat.envMapIntensity = Math.max(0.65, Number(mat.envMapIntensity ?? 1));
          mat.roughness = Math.min(0.92, Math.max(0.28, mat.roughness ?? 0.6));
        }
      });

      this.group.add(model);
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const idle = findClip(gltf.animations, [/idle/i, /stand/i, /breath/i]) ?? gltf.animations[0];
        const move = findClip(gltf.animations, [/run/i, /walk/i, /move/i, /locomotion/i]) ?? idle;
        const attack = findClip(gltf.animations, [/attack/i, /bite/i, /slash/i, /hit/i]) ?? move;
        const death = findClip(gltf.animations, [/death/i, /die/i]) ?? null;
        if (idle) this.actions.set('idle', this.makeAction(idle, true));
        if (move) this.actions.set('move', this.makeAction(move, true));
        if (attack) this.actions.set('attack', this.makeAction(attack, false));
        if (death) this.actions.set('death', this.makeAction(death, false));
        this.playAction('idle', 0);
      }
    } catch (error) {
      console.warn('[creature] failed to load', BEAST_VARIANTS[this.variantKind].file, error);
    }
  }

  private makeAction(clip: THREE.AnimationClip, loop: boolean) {
    const a = this.mixer!.clipAction(clip);
    a.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    a.clampWhenFinished = !loop;
    a.enabled = true;
    return a;
  }

  private playAction(name: string, fade = 0.12) {
    const next = this.actions.get(name);
    if (!next || next === this.activeAction) return;
    if (this.activeAction) this.activeAction.fadeOut(fade);
    next.reset().fadeIn(fade).play();
    this.activeAction = next;
  }

  private setState(next: State) {
    this.state = next;
    this.t = 0;
    this.attackDone = false;
  }

  takeHit(hit: HitInfo) {
    if (!this.alive || this.state === 'dying') return;
    this.hp -= hit.damage;
    this.hitFlash = 0.18;
    this.t = 0;
    this.vel.addScaledVector(hit.dir, 2.6);

    if (this.hp <= 0) {
      this.die();
      return;
    }

    if (hit.crit || hit.poise > 25) {
      this.stunned = true;
      this.setState('hurt');
    }
  }

  private die() {
    if (!this.alive) return;
    this.alive = false;
    this.stunned = false;
    this.setState('dying');
    this.playAction('death', 0.06);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.fx.drops.burst(this.center, new THREE.Color(0xffd58a), 14, 0.75, 4);
  }

  private attack(player: Player) {
    const to = player.pos.clone().sub(this.position).setY(0);
    const d = to.length();
    if (d > BEAST_VARIANTS[this.variantKind].attackRange + 0.25) return;
    const dir = d > 0.001 ? to.normalize() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const res = player.receiveAttack({
      damage: BEAST_VARIANTS[this.variantKind].damage,
      from: this.position.clone(),
      parryable: true,
      poise: BEAST_VARIANTS[this.variantKind].damage * 1.8,
      onParried: () => {
        this.stunned = true;
        this.vel.copy(dir).multiplyScalar(-5);
        this.setState('hurt');
      },
    });
    if (res === 'hit' || res === 'blocked' || res === 'guardBroken') {
      this.vel.copy(dir).multiplyScalar(-1.5);
    }
  }

  update(dt: number, player: Player) {
    this.t += dt;
    this.cooldown -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.state === 'dying') {
      this.deadT += dt;
      this.mixer?.update(dt);
      const k = clamp(1 - this.deadT / 0.9, 0, 1);
      this.group.scale.setScalar(Math.max(0.001, k));
      if (this.deadT > 0.9) this.dispose();
      return;
    }

    if (this.mixer) this.mixer.update(dt);

    const v = BEAST_VARIANTS[this.variantKind];
    const toPlayer = player.pos.clone().sub(this.position);
    const distance = Math.hypot(toPlayer.x, toPlayer.z);

    if (this.state === 'hurt') {
      this.playAction('idle');
      if (this.t > 0.55) {
        this.stunned = false;
        this.setState('chase');
      }
    } else if (this.state === 'attack') {
      this.playAction('attack', 0.07);
      if (this.t > 0.33 && !this.attackDone) {
        this.attackDone = true;
        this.attack(player);
      }
      if (this.t > 0.9) {
        this.cooldown = v.attackCooldown;
        this.setState('chase');
      }
    } else {
      if (!player.dead && distance < v.aggro) {
        this.yaw = dampAngle(this.yaw, Math.atan2(toPlayer.x, toPlayer.z), 10, dt);
        if (distance < v.attackRange && this.cooldown <= 0) {
          this.setState('attack');
        } else {
          this.setState(distance < v.aggro ? 'chase' : 'idle');
        }
      } else {
        const fromHome = this.home.clone().sub(this.position).setY(0);
        if (fromHome.length() > 7) {
          this.yaw = dampAngle(this.yaw, Math.atan2(fromHome.x, fromHome.z), 3, dt);
          this.setState('chase');
        } else if (Math.sin(this.t * 0.75) > 0.995) {
          this.yaw = dampAngle(this.yaw, this.yaw + 0.45, 1, dt);
          this.setState('idle');
        } else {
          this.setState('idle');
        }
      }
    }

    const move = new THREE.Vector3();
    if (this.state === 'chase') {
      move.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(v.speed);
      this.playAction('move');
    } else if (this.state === 'idle') {
      this.playAction('idle');
    }

    this.vel.x = damp(this.vel.x, move.x, 10, dt);
    this.vel.z = damp(this.vel.z, move.z, 10, dt);
    this.vel.y -= 20 * dt;

    const desired = {
      x: this.vel.x * dt,
      y: this.vel.y * dt,
      z: this.vel.z * dt,
    };
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);

    this.position.set(next.x, next.y - (this.halfHeight + this.radius), next.z);
    if (this.kcc.computedGrounded()) this.vel.y = Math.min(0, this.vel.y);

    this.center.set(this.position.x, this.position.y + 0.62 * this.modelHeight / Math.max(1, 1.05), this.position.z);

    if (this.model) {
      this.model.rotation.y = dampAngle(this.model.rotation.y, this.yaw + Math.PI, 12, dt);
      this.group.scale.setScalar(this.state === 'hurt' ? 0.97 : 1);
    }
  }

  get dead() {
    return !this.alive && this.state === 'dying' && this.deadT > 0.9;
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    this.mixer?.stopAllAction();
  }
}
