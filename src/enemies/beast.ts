import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { compressedGltf } from '../core/gltf';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { damp, dampAngle, clamp } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

export type BeastKind = 'green' | 'blue' | 'magma' | 'cave' | 'dire';

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
  // A rare, huge wolf that stalks the road at night.
  dire: { file: 'wolf.glb', height: 1.7, hp: 340, damage: 30, radius: 0.55, speed: 3.9, aggro: 22, attackRange: 2.3, attackCooldown: 1.4 },
};

const LOADER = compressedGltf;
const CACHE = new Map<string, Promise<GLTF>>();

type State = 'idle' | 'chase' | 'attack' | 'hurt' | 'dying';
/** seconds a dead beast lies before it has sunk away */
const DEATH_TIME = 3.8;

/** First clip matching a pattern, in pattern order (so exact names win), skipping any `not` match. */
const findClip = (clips: THREE.AnimationClip[], patterns: RegExp[], not?: RegExp) => {
  for (const p of patterns) {
    const c = clips.find((clip) => p.test(clip.name) && !(not && not.test(clip.name)));
    if (c) return c;
  }
  return undefined;
};

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
  private walkSpeed = 1.2;
  private runSpeed = 3.5;
  /** idle wandering: a spot near home to amble to, and a timer */
  private wander: THREE.Vector3 | null = null;
  private wanderT = 2 + Math.random() * 4;

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

    this.group.position.copy(at);
    scene.add(this.group);
    targets.add(this);
    void this.loadModel();
  }

  private async loadModel() {
    try {
      const gltf = await loadFile(BEAST_VARIANTS[this.variantKind].file);
      if (!this.alive) return;

      // The loaded file is cached and shared, so each beast needs its own copy.
      const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
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
        const clips = gltf.animations;
        const flinch = /hit|react|recieve|receive/i;
        const idle = findClip(clips, [/^idle$/i, /idle/i, /stand/i, /breath/i], flinch) ?? clips[0];
        const walk = findClip(clips, [/^walk$/i, /walk/i], flinch) ?? idle;
        const run = findClip(clips, [/^gallop$/i, /^run$/i, /gallop/i, /run/i], /jump/i) ?? walk;
        const attack = findClip(clips, [/^attack$/i, /attack/i, /bite/i, /punch/i, /weapon/i, /slash/i], flinch) ?? idle;
        const hurt = findClip(clips, [/hitreact_left/i, /hitreact/i, /hit/i, /recieve|receive/i]) ?? null;
        const death = findClip(clips, [/^death$/i, /death/i, /die/i]) ?? null;
        this.actions.set('idle', this.makeAction(idle, true));
        this.actions.set('walk', this.makeAction(walk, true));
        this.actions.set('run', this.makeAction(run, true));
        this.actions.set('attack', this.makeAction(attack, false));
        if (hurt) this.actions.set('hurt', this.makeAction(hurt, false));
        if (death) this.actions.set('death', this.makeAction(death, false));
        // Natural ground speeds of the clips at this size, so feet don't skate.
        this.walkSpeed = this.modelHeight * 1.1;
        this.runSpeed = this.modelHeight * 3.4;
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
    next.timeScale = 1;
    next.reset().fadeIn(fade).play();
    this.activeAction = next;
  }

  private setState(next: State) {
    if (next === this.state) return;
    this.state = next;
    this.t = 0;
    this.attackDone = false;
  }

  takeHit(hit: HitInfo) {
    if (!this.alive || this.state === 'dying') return;
    this.hp -= hit.damage;
    this.hitFlash = 0.18;
    this.vel.addScaledVector(hit.dir, 2.6);

    if (this.hp <= 0) {
      this.die();
      return;
    }

    if (hit.crit || hit.poise > 25) {
      this.stunned = true;
      this.state = 'idle'; // re-enter so the flinch replays on every heavy hit
      this.setState('hurt');
      this.playAction('hurt', 0.05);
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
      this.group.position.y = this.position.y - clamp((this.deadT - 1.8) * 0.5, 0, 1) * this.modelHeight;
      if (this.deadT > DEATH_TIME) this.dispose();
      return;
    }

    if (this.mixer) this.mixer.update(dt);

    const v = BEAST_VARIANTS[this.variantKind];
    const toPlayer = player.pos.clone().sub(this.position);
    const distance = Math.hypot(toPlayer.x, toPlayer.z);

    const attackDur = this.actions.get('attack')?.getClip().duration ?? 0.9;
    let speed = 0; // desired ground speed this step
    if (this.state === 'hurt') {
      if (this.t > 0.55) {
        this.stunned = false;
        this.setState('chase');
      }
    } else if (this.state === 'attack') {
      this.playAction('attack', 0.07);
      // Track the target through the wind-up; the bite lands a third of the way in.
      if (this.t < attackDur * 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(toPlayer.x, toPlayer.z), 8, dt);
      if (this.t > attackDur * 0.35 && !this.attackDone) {
        this.attackDone = true;
        this.attack(player);
      }
      if (this.t > Math.min(attackDur, 1.2)) {
        this.cooldown = v.attackCooldown;
        this.setState('chase');
      }
    } else if (!player.dead && distance < v.aggro) {
      this.wander = null;
      this.yaw = dampAngle(this.yaw, Math.atan2(toPlayer.x, toPlayer.z), 8, dt);
      if (distance < v.attackRange && this.cooldown <= 0) this.setState('attack');
      else {
        this.setState('chase');
        // Close in at a run; circle at a trot while the bite recharges.
        speed = distance > v.attackRange * 1.4 ? v.speed : this.cooldown > 0 ? this.walkSpeed * 0.8 : v.speed * 0.6;
        if (distance < v.attackRange * 0.8) speed = 0;
      }
    } else {
      const fromHome = this.home.clone().sub(this.position).setY(0);
      if (fromHome.length() > 9) {
        // Lost the scent: trot back home.
        this.wander = null;
        this.yaw = dampAngle(this.yaw, Math.atan2(fromHome.x, fromHome.z), 4, dt);
        this.setState('chase');
        speed = this.walkSpeed * 1.4;
      } else {
        this.setState('idle');
        this.wanderT -= dt;
        if (this.wanderT <= 0 && !this.wander) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
          this.wander = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        if (this.wander) {
          const to = this.wander.clone().sub(this.position).setY(0);
          if (to.length() < 0.6) {
            this.wander = null;
            this.wanderT = 3 + Math.random() * 6;
          } else {
            this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 3, dt);
            speed = this.walkSpeed;
          }
        }
      }
    }

    const move = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(speed);
    // Legs match the ground speed: walk or gallop, played at the speed it covers.
    if (this.mixer && (this.state === 'chase' || this.state === 'idle')) {
      const ground = Math.hypot(this.vel.x, this.vel.z);
      if (ground > this.walkSpeed * 1.5) {
        this.playAction('run', 0.18);
        this.activeAction!.timeScale = clamp(ground / this.runSpeed, 0.6, 1.5);
      } else if (ground > 0.25) {
        this.playAction('walk', 0.2);
        this.activeAction!.timeScale = clamp(ground / this.walkSpeed, 0.5, 1.6);
      } else {
        this.playAction('idle', 0.3);
        this.activeAction!.timeScale = 1;
      }
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

    this.group.position.copy(this.position);
    if (this.model) {
      this.model.rotation.y = dampAngle(this.model.rotation.y, this.yaw + Math.PI, 12, dt);
      this.group.scale.setScalar(this.state === 'hurt' ? 0.97 : 1);
    }
  }

  get dead() {
    return !this.alive && this.state === 'dying' && this.deadT > DEATH_TIME;
  }

  private disposed = false;
  /** Safe to call twice (a road encounter and the spawner can both let go of a beast). */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    targets.delete(this);
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    this.mixer?.stopAllAction();
  }
}
