import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Character } from './character';
import { RigLayer, blendPose, overlayPose, type ProcPose } from './rigLayer';
import { ThirdPersonCamera } from './camera';
import { Input } from '../core/input';
import { physics, groups, G_PLAYER, STATIC_ONLY } from '../physics/physics';
import { clamp, damp, stepAngle, wrapAngle, segmentSegmentDistance, smoothstep } from '../core/math';
import { events } from '../core/events';
import { Equipment } from '../items/equipment';
import { ACTIONS, GUARD_R, SHIELD_BLOCK_L, SHIELD_CARRY_L, OFFHAND_GUARD_L, type ActionDef } from '../combat/actions';
import { targets, hurtSegment, type Target, type IncomingAttack, type DefenceResult } from '../combat/targets';
import { surfaceAt } from '../world/terrain';

const CAPSULE_HALF = 0.55;
const CAPSULE_R = 0.32;
const CENTER_Y = CAPSULE_HALF + CAPSULE_R;
const GRAVITY = 22;
const BUFFER_TIME = 0.35;

type Buffered = 'attack' | 'offhand' | 'dodge' | 'parry' | 'cast';

interface ActiveAction {
  def: ActionDef;
  t: number;
  speed: number;
  hitSet: Set<number>;
  rollDir?: THREE.Vector3;
  charge: number;
  fired: boolean;
  usingClip: boolean;
}

export class Player {
  readonly char = new Character();
  rig!: RigLayer;
  equip!: Equipment;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  kcc!: RAPIER.KinematicCharacterController;

  pos = new THREE.Vector3(0, 0, 10); // feet
  private prevPos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = Math.PI; // facing: forward = (sin yaw, 0, cos yaw)
  grounded = true;

  maxHp = 120; hp = 120;
  maxStamina = 100; stamina = 100;
  maxMana = 80; mana = 80;
  private staminaDelay = 0;
  private hot = { rate: 0, left: 0 };
  private burn = { dps: 0, left: 0 };

  act: ActiveAction | null = null;
  private buffer: { a: Buffered; t: number } | null = null;
  blocking = false;
  sprinting = false;
  lock: Target | null = null;
  dead = false;
  private deadT = 0;
  invulnerable = false; // debug

  // animation state
  private loco: Record<string, THREE.AnimationAction> = {};
  private clipAction: THREE.AnimationAction | null = null;
  private guardW = 1;
  private blockW = 0;
  private poseFrom: ProcPose | null = null;
  private poseFade = 1;
  private lastPose: ProcPose = {};
  private moveIntent = new THREE.Vector3();
  private push = new THREE.Vector3();
  private bladePrev: Record<'main' | 'off', [THREE.Vector3, THREE.Vector3] | null> = { main: null, off: null };
  private stepPhase = 0;

  /** camera look direction, used to aim spells with no target */
  aimDir = new THREE.Vector3(0, 0, -1);

  onHitStop?: (sec: number) => void;
  onShake?: (amt: number) => void;
  onSpell?: (spell: string, from: THREE.Vector3, dir: THREE.Vector3, target: Target | null) => void;

  async init(scene: THREE.Scene, spawn: THREE.Vector3) {
    await this.char.load();
    scene.add(this.char.root);
    for (const k of ['idle', 'walk', 'run', 'sprint', 'strafe_l', 'strafe_r', 'walk_back']) {
      const clip = this.char.clips.get(k);
      if (!clip) continue;
      const a = this.char.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      this.loco[k] = a;
    }
    // Pose the rig in idle before measuring hand frames and limb sockets.
    this.char.animate(0.3);
    this.char.root.updateMatrixWorld(true);
    this.rig = new RigLayer(this.char);
    this.rig.setup();
    this.equip = new Equipment(this.char, this.rig);
    for (const b of ['Head', 'Spine2', 'RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm', 'RightHand', 'LeftHand', 'RightUpLeg', 'LeftUpLeg', 'RightLeg', 'LeftLeg', 'RightFoot', 'LeftFoot']) {
      this.equip.limb(b);
    }
    this.styleBody();

    const R = physics.R;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + CENTER_Y + 0.1, spawn.z),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_R).setCollisionGroups(groups(G_PLAYER, 0xffff)),
      this.body,
    );
    this.kcc = physics.createCharacterController(0.02);
    this.pos.copy(spawn);
    this.prevPos.copy(spawn);
  }

  /** Placeholder rig: dress the mannequin in a dark gambeson so armour reads well on it. */
  private styleBody() {
    if (this.char.manifest.model !== 'Xbot.glb') return;
    for (const m of this.char.meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        if (mat.name.includes('Joints')) {
          mat.color.set(0x2b211a);
          mat.roughness = 0.8;
          mat.metalness = 0;
        } else {
          mat.color.set(0x4e4436);
          mat.roughness = 0.88;
          mat.metalness = 0;
        }
      }
    }
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z);
  }

  inIframes() {
    const a = this.act;
    if (this.invulnerable) return true;
    return !!(a && a.def.iframes && a.t >= a.def.iframes[0] && a.t <= a.def.iframes[1]);
  }

  // ------------------------------------------------------------------------
  update(dt: number, input: Input, cam: ThirdPersonCamera) {
    this.prevPos.copy(this.pos);
    this.updateStats(dt);

    if (this.dead) {
      this.deadT += dt;
      this.animate(dt, 0);
      return;
    }

    if (!input.uiMode) this.readInput(input, cam);
    this.updateAction(dt, input);
    this.updateLock(cam);
    const speed = this.move(dt);
    this.animate(dt, speed);
    this.detectHits();
  }

  private readInput(input: Input, cam: ThirdPersonCamera) {
    const f = cam.forward(), r = cam.right();
    this.moveIntent.set(0, 0, 0);
    if (input.held('forward')) this.moveIntent.add(f);
    if (input.held('back')) this.moveIntent.sub(f);
    if (input.held('right')) this.moveIntent.add(r);
    if (input.held('left')) this.moveIntent.sub(r);
    if (this.moveIntent.lengthSq() > 0) this.moveIntent.normalize();

    const now = performance.now() / 1000;
    const buf = (a: Buffered) => (this.buffer = { a, t: now });
    if (input.wasPressed('attack')) buf('attack');
    if (input.wasPressed('offhand') && this.equip.dualWield) buf('offhand');
    if (input.wasPressed('parry')) buf('parry');
    if (input.wasPressed('dodge')) buf('dodge');
    if (input.wasPressed('cast')) buf('cast');
    this.blocking = input.held('offhand') && this.equip.hasShield && (!this.act || this.act.def.id === 'parryShield');
    if (input.wasPressed('jump') && this.grounded && !this.act) {
      this.vel.y = 6.4;
      this.grounded = false;
    }
    if (input.wasPressed('lockOn')) this.toggleLock(cam);
    this.sprinting = input.held('sprint') && this.moveIntent.lengthSq() > 0 && !this.blocking && this.stamina > 0 && !this.act;
  }

  // ---- actions --------------------------------------------------------------
  private startAction(id: string, t0 = 0): boolean {
    const def = ACTIONS[id];
    if (!def) return false;
    if (def.stamina > 0 && this.stamina <= 0) {
      events.emit('notEnough', { stat: 'stamina' });
      return false;
    }
    this.stamina = Math.max(0, this.stamina - def.stamina);
    if (def.stamina > 0) this.staminaDelay = 0.65;
    const w = def.hit?.hand === 'off' ? this.equip.offItem : this.equip.mainWeapon;
    const speed = def.weaponSpeed ? w?.def.stats.speed ?? 1 : 1;
    const usingClip = !!def.clip && this.char.has(def.clip);
    // Cross-fade from whatever pose we were in.
    this.poseFrom = this.lastPose;
    this.poseFade = 0;
    this.act = { def, t: t0, speed, hitSet: new Set(), charge: 0, fired: false, usingClip };
    this.bladePrev.main = this.bladePrev.off = null;

    if (def.roll) {
      const dir = def.roll.back ? this.forward.negate() : this.moveIntent.lengthSq() > 0 ? this.moveIntent.clone() : this.forward;
      this.act.rollDir = dir;
      if (!def.roll.back) this.yaw = Math.atan2(dir.x, dir.z);
    }
    if (usingClip) {
      const a = this.char.mixer.clipAction(this.char.clips.get(def.clip!)!);
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = speed;
      a.time = t0;
      a.fadeIn(0.1).play();
      this.clipAction?.fadeOut(0.1);
      this.clipAction = a;
    }
    if (def.hit) events.emit('swing', { heavy: id === 'heavy' });
    return true;
  }

  private endAction() {
    this.poseFrom = this.lastPose;
    this.poseFade = 0;
    this.act = null;
    this.clipAction?.fadeOut(0.2);
    this.clipAction = null;
  }

  /** Start whatever the buffered input asks for, if the current state allows it. */
  private consumeBuffer() {
    const b = this.buffer;
    if (!b) return;
    if (performance.now() / 1000 - b.t > BUFFER_TIME) {
      this.buffer = null;
      return;
    }
    const a = this.act;
    const eq = this.equip;
    const mainCombo = (d: ActionDef) => d.id.startsWith('slash') || d.id === 'heavy';
    const offCombo = (d: ActionDef) => d.id.startsWith('offslash');
    let next: string | null = null;
    if (!a) {
      if (b.a === 'attack' && eq.mainWeapon) next = 'slash1';
      else if (b.a === 'offhand' && eq.dualWield) next = 'offslash1';
      else if (b.a === 'dodge') next = this.moveIntent.lengthSq() > 0 ? 'roll' : 'backstep';
      else if (b.a === 'parry') next = eq.hasShield ? 'parryShield' : eq.dualWield ? 'parryDual' : null;
      else if (b.a === 'cast') next = this.spellAction();
      if (b.a === 'attack' && !eq.mainWeapon) next = null;
    } else {
      const d = a.def;
      const comboOpen = d.combo && a.t >= d.combo.from;
      if (b.a === 'attack' && eq.mainWeapon && comboOpen) next = mainCombo(d) && d.combo ? d.combo.next : 'slash1';
      else if (b.a === 'offhand' && eq.dualWield && comboOpen) next = offCombo(d) && d.combo ? d.combo.next : 'offslash1';
      else if (b.a === 'dodge' && a.t >= d.cancel) next = this.moveIntent.lengthSq() > 0 ? 'roll' : 'backstep';
      else if (b.a === 'parry' && a.t >= d.cancel) next = eq.hasShield ? 'parryShield' : eq.dualWield ? 'parryDual' : null;
      else return; // keep buffering
    }
    this.buffer = null;
    if (next) this.startAction(next);
  }

  private spellAction(): string | null {
    const sp = this.equip.get(this.equip.activeSpell);
    if (!sp) return null;
    const cost = sp.def.stats.manaCost ?? 0;
    if (this.mana < cost) {
      events.emit('notEnough', { stat: 'mana' });
      return null;
    }
    this.mana -= cost;
    events.emit('spellCast', { spell: sp.def.id });
    return sp.def.id === 'fireball' ? 'castFireball' : 'castHeal';
  }

  private updateAction(dt: number, input: Input) {
    this.consumeBuffer();
    const a = this.act;
    if (!a) return;
    const d = a.def;

    // Light attack held long enough turns into a charged heavy.
    if (d.id === 'slash1' && d.hit && a.t < d.hit.from && input.held('attack') && input.heldFor('attack') > 0.28) {
      this.startAction('heavy', 0.3);
      return;
    }
    // Charging: hold at the charge point while the button stays down.
    if (d.chargeAt !== undefined && a.t >= d.chargeAt * d.dur && input.held('attack') && a.charge < 0.9) {
      a.charge += dt;
      if (this.clipAction) this.clipAction.paused = true;
      return;
    }
    if (this.clipAction) this.clipAction.paused = false;

    a.t += dt * a.speed;
    if (d.event && !a.fired && a.t >= d.event.at) {
      a.fired = true;
      this.fireEvent(d.event.name);
    }
    if (a.t >= d.dur) {
      this.endAction();
      this.consumeBuffer();
    }
  }

  private fireEvent(name: 'fireball' | 'heal') {
    if (name === 'fireball') {
      const main = this.equip.model('main');
      const from = new THREE.Vector3();
      if (main) main.localToWorld(from.set(0, main.userData.bladeTip ?? 0.5, 0));
      else from.copy(this.center).addScaledVector(this.forward, 0.6).setY(this.pos.y + 1.4);
      const target = this.aimTarget(24);
      let dir = this.aimDir.clone();
      if (target) dir = target.center.clone().sub(from).normalize();
      this.onSpell?.('fireball', from, dir, target);
    } else {
      const sp = this.equip.get(this.equip.activeSpell);
      const heal = sp?.def.stats.heal ?? 50;
      this.hot = { rate: heal / 3, left: 3 };
      this.onSpell?.('healingLight', this.center, this.forward, null);
    }
  }

  /**
   * Target for aiming: the lock-on target, or else the best enemy in a cone in
   * front of the player (soft lock / aim assist).
   */
  aimTarget(range: number): Target | null {
    if (this.lock?.alive) return this.lock;
    const f = this.forward;
    let best: Target | null = null;
    let bestScore = Infinity;
    for (const t of targets) {
      if (!t.alive || !t.lockable || t.kind === 'dummy' && range > 8) continue;
      const to = t.center.clone().sub(this.pos).setY(0);
      const d = to.length();
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(clamp(to.normalize().dot(f), -1, 1));
      if (ang > 0.62) continue;
      const score = ang * 4 + d * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  // ---- lock-on --------------------------------------------------------------
  private toggleLock(cam: ThirdPersonCamera) {
    if (this.lock) {
      this.lock = null;
      return;
    }
    const camF = new THREE.Vector3();
    cam.camera.getWorldDirection(camF);
    let best: Target | null = null;
    let bestScore = Infinity;
    for (const t of targets) {
      if (!t.alive || !t.lockable) continue;
      const to = t.center.clone().sub(cam.camera.position);
      const dist = t.center.distanceTo(this.center);
      if (dist > 24) continue;
      const ang = to.normalize().angleTo(camF);
      if (ang > 0.9) continue;
      const score = ang * 3 + dist * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    this.lock = best;
  }

  private updateLock(cam: ThirdPersonCamera) {
    if (this.lock && (!this.lock.alive || this.lock.center.distanceTo(this.center) > 30)) this.lock = null;
    cam.lockTarget = this.lock ? this.lock.center : null;
  }

  // ---- movement ---------------------------------------------------------------
  private move(dt: number) {
    const a = this.act;
    const intent = this.moveIntent;
    let targetSpeed = 0;
    if (!a) {
      if (intent.lengthSq() > 0) {
        targetSpeed = this.blocking ? 1.9 : this.sprinting ? 6.4 : this.lock ? 3.4 : 4.4;
      }
    }
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - 13 * dt);
      this.staminaDelay = 0.5;
    }

    // Horizontal velocity.
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    if (a && (a.def.roll || a.def.move)) {
      // Root-motion style displacement along a curve.
      const def = a.def;
      let dist = 0, t0 = 0, t1 = 1, dir = this.forward;
      if (def.roll) {
        dist = def.roll.dist;
        t0 = 0.02;
        t1 = def.dur * (def.roll.back ? 0.55 : 0.64);
        dir = a.rollDir!;
      } else if (def.move) {
        dist = def.move.dist;
        t0 = def.move.from;
        t1 = def.move.to;
        // Don't lunge into an enemy we're already touching.
        if (this.lock && this.lock.center.distanceTo(this.center) < 1.4) dist *= 0.2;
      }
      // Real clips carry their own travel distance (extracted by the importer).
      const clipDist = a.usingClip ? this.char.clipInfo.get(def.clip!)?.rootMotion : undefined;
      if (clipDist !== undefined && Math.abs(clipDist) > 0.05) dist = Math.abs(clipDist);
      const ease = (t: number) => smoothstep(t0, t1, t);
      const v = ((ease(a.t + dt * a.speed) - ease(a.t)) * dist) / dt;
      hv.copy(dir).multiplyScalar(v);
    } else if (a) {
      hv.multiplyScalar(Math.exp(-14 * dt));
    } else {
      const want = intent.clone().multiplyScalar(targetSpeed);
      const rate = targetSpeed > hv.length() ? 9 : 12;
      hv.x = damp(hv.x, want.x, rate, dt);
      hv.z = damp(hv.z, want.z, rate, dt);
    }

    // Facing.
    const toLock = this.lock ? Math.atan2(this.lock.position.x - this.pos.x, this.lock.position.z - this.pos.z) : null;
    if (a) {
      if (a.t < a.def.track) {
        const soft = a.def.hit || a.def.event ? this.aimTarget(a.def.event ? 20 : 4) : null;
        const toSoft = soft ? Math.atan2(soft.position.x - this.pos.x, soft.position.z - this.pos.z) : null;
        const want = toLock ?? toSoft ?? (intent.lengthSq() > 0 ? Math.atan2(intent.x, intent.z) : this.yaw);
        this.yaw = stepAngle(this.yaw, want, 11 * dt);
      }
    } else if (toLock !== null && !this.sprinting) {
      this.yaw = stepAngle(this.yaw, toLock, 12 * dt);
    } else if (intent.lengthSq() > 0) {
      const want = Math.atan2(intent.x, intent.z);
      // Turn quickly but not instantly; sharp reversals feel weighty.
      this.yaw = stepAngle(this.yaw, want, (this.sprinting ? 9 : 12) * dt);
    }
    this.yaw = wrapAngle(this.yaw);

    // Vertical.
    this.vel.y -= GRAVITY * dt;
    if (this.grounded && this.vel.y < 0) this.vel.y = -1.5;
    this.vel.x = hv.x;
    this.vel.z = hv.z;

    // Soft push-apart from enemies.
    this.push.set(0, 0, 0);
    for (const t of targets) {
      if (!t.alive) continue;
      const dx = this.pos.x - t.position.x, dz = this.pos.z - t.position.z;
      const d = Math.hypot(dx, dz);
      const min = CAPSULE_R + t.radius * 0.85;
      if (d < min && d > 1e-4 && Math.abs(t.center.y - this.center.y) < 1.4) {
        this.push.x += (dx / d) * (min - d) * 0.6;
        this.push.z += (dz / d) * (min - d) * 0.6;
      }
    }

    const desired = { x: this.vel.x * dt + this.push.x, y: this.vel.y * dt, z: this.vel.z * dt + this.push.z };
    this.kcc.computeColliderMovement(this.collider, desired, physics.R.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.body.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.body.setNextKinematicTranslation(next);
    this.collider.setTranslation(next); // keep queries in sync before the world steps
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && !wasGrounded && this.vel.y < -8) this.onShake?.(0.15);
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    this.pos.set(next.x, next.y - CENTER_Y - 0.02, next.z);

    // Fell out of the world: put us back.
    if (this.pos.y < -30) this.teleport(new THREE.Vector3(0, 2, 10));

    return Math.hypot(m.x, m.z) / dt;
  }

  teleport(p: THREE.Vector3) {
    const c = { x: p.x, y: p.y + CENTER_Y + 0.05, z: p.z };
    this.body.setTranslation(c, true);
    this.collider.setTranslation(c);
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
  }

  // ---- animation --------------------------------------------------------------
  private animate(dt: number, speed: number) {
    const a = this.act;
    const clipDriven = !!(a && a.usingClip);
    // Locomotion blend by speed. Real action clips are full-body, so locomotion
    // steps aside entirely while one plays (the mixer would otherwise average them).
    const locoW = clipDriven ? 0 : 1;
    const s = a ? 0 : speed;
    const wIdle = 1 - smoothstep(0.1, 1.8, s);
    const wRun = smoothstep(2.4, 4.2, s);
    const wWalk = Math.max(0, 1 - wIdle - wRun);
    const setW = (k: string, w: number) => this.loco[k]?.setEffectiveWeight(w * locoW);
    const sprintBlend = this.loco.sprint ? smoothstep(4.6, 6.2, s) : 0;
    // Locked on with strafe clips: blend forward / back / left / right by the
    // direction of travel relative to facing.
    let fw = 1, bk = 0, lf = 0, rt = 0;
    if (this.lock && this.loco.strafe_l && this.loco.strafe_r && s > 0.2) {
      const c = Math.cos(-this.yaw), sn = Math.sin(-this.yaw);
      const lx = this.vel.x * c + this.vel.z * sn, lz = -this.vel.x * sn + this.vel.z * c;
      const len = Math.hypot(lx, lz) || 1;
      fw = Math.max(0, lz) / len;
      bk = this.loco.walk_back ? Math.max(0, -lz) / len : 0;
      lf = Math.max(0, lx) / len;
      rt = Math.max(0, -lx) / len;
      const sum = fw + bk + lf + rt || 1;
      fw /= sum; bk /= sum; lf /= sum; rt /= sum;
    }
    const moving = 1 - wIdle;
    setW('idle', wIdle);
    setW('walk', wWalk * fw);
    setW('run', wRun * (1 - sprintBlend) * fw);
    setW('sprint', wRun * sprintBlend * fw);
    setW('strafe_l', moving * lf);
    setW('strafe_r', moving * rt);
    setW('walk_back', moving * bk);
    if (this.loco.walk) this.loco.walk.timeScale = clamp(s / 1.6, 0.6, 1.6);
    if (this.loco.run) this.loco.run.timeScale = clamp(s / 4.3, 0.8, this.loco.sprint ? 1.2 : 1.5);
    this.char.animate(dt);

    // Footsteps from the locomotion phase.
    if (this.grounded && s > 0.5 && !a) {
      this.stepPhase += dt * (s > 3 ? s / 1.5 : s / 0.8);
      if (this.stepPhase > 1) {
        this.stepPhase -= 1;
        events.emit('footstep', { at: this.pos.clone(), surface: surfaceAt(this.pos.x, this.pos.z) });
      }
    }

    // ---- procedural pose -------------------------------------------------
    const eq = this.equip;
    const running = s > 3.2;
    this.guardW = damp(this.guardW, this.sprinting ? 0 : running ? 0.35 : 1, 8, dt);
    this.blockW = damp(this.blockW, this.blocking ? 1 : 0, 16, dt);

    const base: ProcPose = {};
    if (eq.mainWeapon) base.right = { ...GUARD_R, w: this.guardW };
    if (eq.hasShield) {
      const sh = this.blockW > 0.01 ? blendHandSimple(SHIELD_CARRY_L, SHIELD_BLOCK_L, this.blockW) : SHIELD_CARRY_L;
      base.left = { ...sh, w: Math.max(this.guardW, this.blockW) };
      base.hipsDrop = 0.05 * this.blockW;
      base.spinePitch = 0.08 * this.blockW;
    } else if (eq.dualWield) {
      base.left = { ...OFFHAND_GUARD_L, w: this.guardW };
    }

    let pose: ProcPose = base;
    if (a && !a.usingClip && a.def.proc) {
      pose = overlayPose(base, a.def.proc(clamp(a.t / a.def.dur, 0, 1)));
      if (a.def.hit) pose = this.aimLow(pose, a);
    } else if (a && !a.usingClip && a.def.roll && !a.def.roll.back) {
      pose = { ...base, legTuck: smoothstep(0.02, 0.2, a.t) * (1 - smoothstep(0.5, 0.7, a.t)), spinePitch: 0.8 * smoothstep(0.02, 0.15, a.t) * (1 - smoothstep(0.5, 0.72, a.t)) };
    } else if (clipDriven) {
      pose = {}; // real animation drives everything
    }
    if (!this.grounded && !a) pose = { ...pose, legTuck: 0.35 };
    if (this.dead) pose = {};

    if (this.poseFrom && this.poseFade < 1) {
      this.poseFade = Math.min(1, this.poseFade + dt / 0.12);
      pose = blendPose(this.poseFrom, pose, smoothstep(0, 1, this.poseFade));
    }
    this.lastPose = pose;

    // Root transform and procedural roll for rigs without a roll clip.
    const root = this.char.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    const vis = this.char.visual;
    vis.rotation.set(0, 0, 0);
    vis.position.set(0, 0, 0);
    if (a && a.def.roll && !a.usingClip && !a.def.roll.back) {
      const k = smoothstep(0.06, 0.6, a.t);
      const ang = k * Math.PI * 2;
      const pivot = 0.55;
      vis.rotation.x = ang;
      vis.position.set(0, pivot - Math.cos(ang) * pivot, -Math.sin(ang) * pivot);
      vis.position.y -= Math.sin(k * Math.PI) * 0.35;
    }
    if (this.dead && !this.char.has('death')) {
      const k = smoothstep(0, 0.9, this.deadT);
      vis.rotation.x = -k * Math.PI * 0.48;
      vis.position.y = -k * 0.05;
      vis.position.z = -k * 0.2;
    }
    this.rig.apply(pose);
  }

  /**
   * Bend a procedural swing down toward low targets (slimes sit well below
   * chest height): lower the grip, tip the blade down, lean and bend the knees
   * around the strike window.
   */
  private aimLow(pose: ProcPose, a: ActiveAction): ProcPose {
    const h = a.def.hit!;
    const tgt = this.aimTarget(4.5);
    if (!tgt) return pose;
    const top = tgt.center.y + (tgt.halfHeight ?? 0) + tgt.radius * 0.4 - this.pos.y;
    const drop = clamp(1.2 - top, 0, 0.75);
    if (drop <= 0.01) return pose;
    const k = smoothstep(h.from - 0.22, h.from, a.t) * (1 - smoothstep(h.to + 0.05, h.to + 0.3, a.t));
    const d = drop * k;
    const side = h.hand === 'off' ? 'left' : 'right';
    const hp = pose[side];
    const out: ProcPose = { ...pose, spinePitch: (pose.spinePitch ?? 0) + d * 0.9, hipsDrop: (pose.hipsDrop ?? 0) + d * 0.3 };
    if (hp) {
      const dir: [number, number, number] = [hp.dir[0], hp.dir[1] - d * 1.3, hp.dir[2]];
      out[side] = { ...hp, grip: [hp.grip[0], hp.grip[1] - d * 0.55, hp.grip[2] + d * 0.15], dir };
    }
    return out;
  }

  // ---- melee hit detection -----------------------------------------------------
  private bladeSegment(slot: 'main' | 'off'): [THREE.Vector3, THREE.Vector3] | null {
    const m = this.equip.model(slot);
    if (!m || m.userData.bladeTip === undefined) return null;
    m.updateWorldMatrix(true, false);
    return [m.localToWorld(new THREE.Vector3(0, m.userData.bladeBase, 0)), m.localToWorld(new THREE.Vector3(0, m.userData.bladeTip + 0.03, 0))];
  }

  private detectHits() {
    const a = this.act;
    if (!a || !a.def.hit) return;
    const h = a.def.hit;
    const seg = this.bladeSegment(h.hand);
    const prev = this.bladePrev[h.hand];
    this.bladePrev[h.hand] = seg;
    if (!seg || a.t < h.from || a.t > h.to) return;
    const from = prev ?? seg;
    const weapon = h.hand === 'off' ? this.equip.offItem : this.equip.mainWeapon;
    const base = weapon?.def.stats.damage ?? 10;
    const b = new THREE.Vector3(), t = new THREE.Vector3();
    for (const tg of targets) {
      if (!tg.alive || a.hitSet.has(tg.id)) continue;
      if (tg.center.distanceTo(this.center) > 3.4) continue;
      // Sweep: test interpolated blade positions between last step and this one.
      for (let i = 0; i <= 4; i++) {
        const u = i / 4;
        b.lerpVectors(from[0], seg[0], u);
        t.lerpVectors(from[1], seg[1], u);
        const [ha, hb] = hurtSegment(tg);
        if (segmentSegmentDistance(b, t, ha, hb) < tg.radius + 0.05) {
          a.hitSet.add(tg.id);
          const crit = tg.stunned;
          const charge = 1 + a.charge * 0.6;
          const dmg = Math.round(base * h.dmg * charge * (crit ? 2.6 : 1) * (0.92 + Math.random() * 0.16));
          const dir = tg.position.clone().sub(this.pos).setY(0).normalize();
          const at = tg.center.clone().addScaledVector(dir, -tg.radius * 0.8);
          tg.takeHit({ damage: dmg, poise: h.poise * charge, dir, at, crit, source: 'melee' });
          events.emit('enemyHit', { at, amount: dmg, crit, enemyId: tg.id });
          this.onHitStop?.(crit ? 0.14 : a.def.id === 'heavy' ? 0.11 : 0.065);
          this.onShake?.(crit ? 0.4 : a.def.id === 'heavy' ? 0.3 : 0.16);
          break;
        }
      }
    }
  }

  // ---- defence ----------------------------------------------------------------
  receiveAttack(att: IncomingAttack): DefenceResult {
    if (this.dead) return 'dodged';
    if (this.inIframes()) return 'dodged';
    const toAtt = att.from.clone().sub(this.pos).setY(0).normalize();
    const facing = toAtt.dot(this.forward);
    const a = this.act;
    if (a?.def.parry && a.t >= a.def.parry[0] && a.t <= a.def.parry[1] && att.parryable && facing > 0.1) {
      att.onParried?.();
      events.emit('parrySuccess', { at: this.center.addScaledVector(toAtt, 0.6) });
      this.onHitStop?.(0.16);
      this.onShake?.(0.25);
      return 'parried';
    }
    if (this.blocking && this.equip.hasShield && facing > 0.3 && this.blockW > 0.5) {
      const st = this.equip.offItem!.def.stats;
      const cost = att.damage * (1 - (st.stability ?? 0.4)) * 1.7 + 6;
      this.stamina -= cost;
      this.staminaDelay = 0.8;
      const through = att.damage * (1 - (st.block ?? 80) / 100);
      const at = this.center.addScaledVector(toAtt, 0.5);
      if (this.stamina < 0) {
        this.stamina = 0;
        this.blocking = false;
        this.startAction('guardBreak');
        this.applyDamage(through + att.damage * 0.25);
        events.emit('blockImpact', { at, guardBroken: true });
        this.onShake?.(0.35);
        return 'guardBroken';
      }
      this.applyDamage(through);
      events.emit('blockImpact', { at, guardBroken: false });
      this.onShake?.(0.12);
      return 'blocked';
    }
    const armor = this.equip.armorValue;
    const dmg = att.damage * (100 / (100 + armor * 5));
    this.applyDamage(dmg);
    if (att.burn) this.burn = { dps: att.burn, left: 3 };
    const heavyArmor = a?.def.id === 'heavy' && a.t > 0.8 && a.t < 1.15; // hyper-armour mid-swing
    if (!this.dead && !heavyArmor && att.poise > this.equip.poise * 0.8) {
      if (this.act?.usingClip) this.endAction();
      this.startAction('stagger');
      this.vel.addScaledVector(toAtt, -3.5);
    }
    this.onShake?.(0.3);
    return 'hit';
  }

  private applyDamage(d: number) {
    if (d <= 0 || this.invulnerable) return;
    this.hp = Math.max(0, this.hp - d);
    events.emit('playerDamaged', { amount: d, blocked: false });
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.deadT = 0;
      this.act = null;
      this.lock = null;
      if (this.char.has('death')) {
        const d = this.char.mixer.clipAction(this.char.clips.get('death')!);
        d.reset().setLoop(THREE.LoopOnce, 1);
        d.clampWhenFinished = true;
        d.fadeIn(0.15).play();
        this.clipAction = d;
        for (const l of Object.values(this.loco)) l.setEffectiveWeight(0);
      }
      events.emit('playerDied', {});
    }
  }

  respawn(at: THREE.Vector3) {
    this.dead = false;
    this.clipAction?.stop();
    this.clipAction = null;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.burn.left = 0;
    this.hot.left = 0;
    this.act = null;
    this.teleport(at);
    events.emit('playerRespawned', {});
  }

  private updateStats(dt: number) {
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (!this.sprinting) this.stamina = Math.min(this.maxStamina, this.stamina + (this.blocking ? 16 : 46) * dt);
    this.mana = Math.min(this.maxMana, this.mana + 2.2 * dt);
    if (this.hot.left > 0 && !this.dead) {
      this.hot.left -= dt;
      this.hp = Math.min(this.maxHp, this.hp + this.hot.rate * dt);
    }
    if (this.burn.left > 0 && !this.dead) {
      this.burn.left -= dt;
      this.applyDamage(this.burn.dps * dt);
    }
  }

  /** Drink/use a consumable instantly. */
  useConsumable(uid: number) {
    const it = this.equip.get(uid);
    if (!it || it.def.kind !== 'consumable' || this.dead) return;
    const st = it.def.stats;
    if (st.heal) this.hot = { rate: st.heal / 1.2, left: 1.2 };
    if (st.restoreMana) this.mana = Math.min(this.maxMana, this.mana + st.restoreMana);
    this.equip.consume(uid);
    this.onSpell?.(st.heal ? 'potionHeal' : 'potionMana', this.center, this.forward, null);
  }

  /** Debug: show action `id` frozen at time t. */
  debugPose(id: string, t: number) {
    if (!this.act || this.act.def.id !== id) this.startAction(id);
    if (!this.act) return;
    this.act.t = t;
    this.poseFade = 1;
    this.animate(0, 0);
  }

  /** Interpolated position for rendering between fixed steps. */
  renderPosition(alpha: number, out = new THREE.Vector3()) {
    return out.lerpVectors(this.prevPos, this.pos, alpha);
  }
}

function blendHandSimple(a: typeof SHIELD_CARRY_L, b: typeof SHIELD_BLOCK_L, t: number) {
  const l = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  return { grip: l(a.grip, b.grip), dir: l(a.dir, b.dir), normal: l(a.normal, b.normal), w: 1, pole: a.pole && b.pole ? l(a.pole, b.pole) : a.pole };
}
