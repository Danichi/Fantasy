import * as THREE from 'three';
import { HERO } from '../npc/cast';
import RAPIER from '@dimforge/rapier3d-compat';
import { Character } from './character';
import { RigLayer, blendPose, overlayPose, type ProcPose } from './rigLayer';
import { Animator } from './animator';
import { ThirdPersonCamera } from './camera';
import { Input } from '../core/input';
import { physics, groups, G_PLAYER, STATIC_ONLY } from '../physics/physics';
import { clamp, damp, wrapAngle, segmentSegmentDistance, smoothstep } from '../core/math';
import { events } from '../core/events';
import { Equipment } from '../items/equipment';
import { ACTIONS, GUARD_R, SHIELD_BLOCK_L, SHIELD_CARRY_L, OFFHAND_GUARD_L, resolveAction, type ActionDef } from '../combat/actions';
import { targets, hurtSegment, type Target, type IncomingAttack, type DefenceResult } from '../combat/targets';
import { surfaceAt, heightAt as heightAtGround } from '../world/terrain';
import { waterDepthAt } from '../world/water';
import { waterSurfaceAt } from '../world/waterLevel';
import { Progression } from '../progression/progression';
import { COMBAT_STYLES, type CombatStyleId } from '../progression/styles';
import { Paths } from '../paths/paths';

const CAPSULE_HALF = 0.55;
const CAPSULE_R = 0.32;
const CENTER_Y = CAPSULE_HALF + CAPSULE_R;
const GRAVITY = 22;
const JUMP_V = 5.8;
const BUFFER_TIME = 0.35;
export const SIM_STEP = 1 / 60;

type Buffered = 'attack' | 'offhand' | 'dodge' | 'parry' | 'cast' | 'originAbility';

interface ActiveAction {
  def: ActionDef; // resolved (clip timing applied when the clip is loaded)
  t: number;
  speed: number;
  hitSet: Set<number>;
  rollDir?: THREE.Vector3;
  charge: number;
  charging: boolean;
  fired: boolean;
  usingClip: boolean;
  landed: boolean;
}

/**
 * The player. `update()` runs on the fixed 60Hz simulation step and owns
 * gameplay (movement, timers, damage). `present()` runs once per rendered
 * frame: it interpolates between steps and poses the character, so motion
 * stays smooth at any frame rate.
 */
/** How far the rider's root sits above the ground (horse back height minus leg length). */
const RIDE_HEIGHT = 0.5;
const MOUNT_TIME = 0.5;

export class Player {
  readonly char = new Character();
  rig!: RigLayer;
  anim!: Animator;
  equip!: Equipment;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  kcc!: RAPIER.KinematicCharacterController;

  pos = new THREE.Vector3(0, 0, 10); // feet
  private prevPos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = Math.PI; // facing: forward = (sin yaw, 0, cos yaw)
  private prevYaw = Math.PI;
  private yawVel = 0;
  grounded = true;
  private airTime = 0;
  private landT = 1; // seconds since landing (drives the landing half of the jump clip)
  private fallSpeed = 0;

  hp = 120;
  stamina = 100;
  mana = 80;
  /** Live primary-school combat resources. */
  momentum = 0;
  focus = 100;
  crossOpening = 0;
  boundaryActive = false;
  boundaryRadius = 0;
  private boundaryBreak = 0;
  private combatClock = 0;
  private lastGaleHit = -999;
  private boundaryCounterReady = false;
  private boundaryRing: THREE.Mesh | null = null;
  private boundaryOuterRing: THREE.Mesh | null = null;
  readonly prog = new Progression();
  /** disciplines, attributes and the active combat class */
  readonly paths = new Paths(this.prog);
  get maxHp() {
    return 120 + this.paths.bonusHp + (this.equip?.bonus('maxHp') ?? 0);
  }
  get maxStamina() {
    return 100 + this.paths.bonusStamina + (this.equip?.bonus('maxStamina') ?? 0);
  }
  get maxMana() {
    return 80 + this.paths.bonusMana + (this.equip?.bonus('maxMana') ?? 0);
  }
  private staminaDelay = 0;
  private hot = { rate: 0, left: 0 };
  private burn = { dps: 0, left: 0 };
  mounted = false;
  private mountVisual = new THREE.Group();
  private originCooldown = 0;

  act: ActiveAction | null = null;
  private buffer: { a: Buffered; t: number } | null = null;
  blocking = false;
  sprinting = false;
  lock: Target | null = null;
  dead = false;
  private deadT = 0;
  invulnerable = false; // debug

  // presentation state
  private armsFromClips = false;
  private guardW = 1;
  private blockW = 0;
  private blockHitT = 9;
  private poseFrom: ProcPose | null = null;
  private poseFade = 1;
  private lastPose: ProcPose = {};
  /** camera-relative movement wish this step (boats steer from it) */
  readonly moveIntent = new THREE.Vector3();
  private push = new THREE.Vector3();
  private bladePrev: Record<'main' | 'off', [THREE.Vector3, THREE.Vector3] | null> = { main: null, off: null };
  private lastPresentT = -1;
  private lastPhase = 0;
  private idleClock = 0;

  /** camera look direction */
  aimDir = new THREE.Vector3(0, 0, -1);

  onHitStop?: (sec: number) => void;
  onShake?: (amt: number) => void;
  onSpell?: (spell: string, from: THREE.Vector3, dir: THREE.Vector3, target: Target | null) => void;
  onPlungeLand?: (at: THREE.Vector3) => void;

  async init(scene: THREE.Scene, spawn: THREE.Vector3) {
    // The stylised hero (docs/ART-DIRECTION.md §7); ?paladin keeps the old Mixamo model.
    const paladin = new URLSearchParams(location.search).has('paladin');
    await this.char.load(undefined, undefined, paladin ? undefined : HERO);
    scene.add(this.char.root);
    const ringMat = new THREE.MeshBasicMaterial({ color: COMBAT_STYLES.boundary.color, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const outerMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.boundaryRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.0, 96), ringMat);
    this.boundaryOuterRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.018, 96), outerMat);
    for (const ring of [this.boundaryRing, this.boundaryOuterRing]) {
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
    }
    this.anim = new Animator(this.char);
    // Real clips hold the sword and shield themselves; the placeholder's
    // idle/walk/run don't, so the rig poses its arms procedurally.
    this.armsFromClips = this.char.has('attack_light_1') || this.char.has('block_idle');
    // Pose in idle before measuring hand frames and limb sockets.
    this.anim.update(0.3, { local: { x: 0, z: 0 }, grounded: true });
    this.char.root.updateMatrixWorld(true);
    this.rig = new RigLayer(this.char);
    this.rig.setup();
    this.equip = new Equipment(this.char, this.rig);
    this.buildMountVisual();
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

  /** Stock mannequins: dress them in a dark gambeson so armour reads well. */
  private styleBody() {
    if (this.char.manifest.model !== 'Xbot.glb' && !this.char.manifest.placeholderStyle) return;
    for (const m of this.char.meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        const joint = /joint/i.test(mat.name);
        mat.map = null;
        mat.color.set(joint ? 0x2b211a : 0x4e4436);
        mat.roughness = joint ? 0.8 : 0.88;
        mat.metalness = 0;
        mat.needsUpdate = true;
      }
    }
  }

  private buildMountVisual() {
    const coat = new THREE.MeshStandardMaterial({ color: 0x6f4b35, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x35261f, roughness: 1 });
    const horse = this.mountVisual;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 5, 8), coat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.72;
    horse.add(body);
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.68, 4, 7), coat);
    neck.position.set(0.55, 1.18, 0);
    neck.rotation.z = -0.38;
    horse.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.4, 0.34), coat);
    head.position.set(0.91, 1.42, 0);
    horse.add(head);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.62, 7), dark);
      leg.position.set(sx * 0.3, 0.34, sz * 0.18);
      horse.add(leg);
    }
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.06), dark);
    mane.position.set(0.26, 1.28, 0);
    horse.add(mane);
    horse.position.set(0, -0.6, 0.05);
    horse.visible = false;
    horse.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));
    this.char.root.add(horse);
  }

  toggleMount() {
    if (this.dead || this.act) return;
    this.mounted = !this.mounted;
    this.stamina = Math.min(this.maxStamina, this.stamina + 15);
  }

  /** a boat carrying the player (world/boats.ts) */
  vehicle: { pos: THREE.Vector3; yaw: number; speed: number } | null = null;
  /** in deep water (river pools, the canal, the sea) */
  swimming = false;
  private drownT = 0;
  /** hp never drops below this (sparring duels) */
  damageFloor = 0;
  private groundBelow() {
    return heightAtGround(this.pos.x, this.pos.z);
  }

  /** Riding (world/horses.ts): speeds come from the horse's breed; null dismounts. */
  mountStats: { canter: number; gallop: number; accel: number } | null = null;
  /** the horse has breath left to gallop */
  mountCanGallop = true;
  setMount(stats: { canter: number; gallop: number; accel: number } | null) {
    if (stats && !this.mountStats) this.mountT = 0;
    this.mountStats = stats;
    this.mounted = !!stats;
    this.act = null;
  }
  /** mounting: 0 -> 1 over MOUNT_TIME (hop up from the horse's left side, swing the leg over) */
  private mountT = 1;
  /** dismounting: the saddle's offset from where the player landed, easing to zero */
  private dismountFrom: THREE.Vector3 | null = null;
  private dismountT = 1;
  /** Play the step-down from the saddle after the player has been placed on the ground. */
  animateDismount(saddle: THREE.Vector3) {
    this.dismountFrom = saddle.clone().sub(this.pos);
    this.dismountT = 0;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z);
  }

  get activeCombatStyle(): CombatStyleId | null {
    return this.prog.activeStyle;
  }

  get galeSpeedMultiplier() {
    if (this.activeCombatStyle !== 'gale') return 1;
    return 1 + (this.momentum / 100) * 0.18;
  }

  get galeDamageMultiplier() {
    if (this.activeCombatStyle !== 'gale') return 1;
    return 1 + (this.momentum / 100) * 0.22;
  }

  get crossDamageMultiplier() {
    if (this.activeCombatStyle !== 'cross' || this.crossOpening <= 0) return 1;
    return this.prog.hasSkill('cross', 'cross-master') ? 1.8 : 1.5;
  }

  get crossPoiseMultiplier() {
    return this.activeCombatStyle === 'cross' && this.crossOpening > 0 ? 1.55 : 1;
  }

  private hasStyleSkill(style: CombatStyleId, id: string) {
    return this.prog.hasSkill(style, id);
  }

  private addMomentum(base: number) {
    if (this.activeCombatStyle !== 'gale') return;
    const tight = this.combatClock - this.lastGaleHit;
    const timing = tight <= 0.42 ? 1.8 : tight <= 0.75 ? 1.35 : 1;
    const skill = this.hasStyleSkill('gale', 'gale-step') ? 1.15 : 1;
    this.momentum = clamp(this.momentum + base * timing * skill, 0, 100);
    this.lastGaleHit = this.combatClock;
    this.prog.addMastery('gale', 1);
  }

  private breakMomentum(amount = 30) {
    if (this.activeCombatStyle !== 'gale') return;
    this.momentum = Math.max(0, this.momentum - amount);
  }

  private breakBoundary() {
    this.boundaryActive = false;
    this.boundaryBreak = 0.45;
    this.boundaryCounterReady = false;
  }

  private updateCombatResources(dt: number) {
    this.combatClock += dt;
    if (this.boundaryBreak > 0) this.boundaryBreak = Math.max(0, this.boundaryBreak - dt);

    if (this.activeCombatStyle === 'gale') {
      if (this.combatClock - this.lastGaleHit > 0.7) this.momentum = Math.max(0, this.momentum - 18 * dt);
    } else {
      this.momentum = 0;
    }

    this.crossOpening = Math.max(0, this.crossOpening - dt);

    if (this.boundaryActive) {
      const anchor = this.hasStyleSkill('boundary', 'boundary-anchor');
      const wall = this.hasStyleSkill('boundary', 'boundary-wall');
      const domain = this.hasStyleSkill('boundary', 'boundary-domain');
      const base = 2.8 + (anchor ? 0.45 : 0) + (domain ? 0.85 : 0);
      const maxBonus = 0.032 + (wall ? 0.012 : 0);
      const efficiency = anchor ? 0.78 : domain ? 0.68 : 1;
      const desired = Math.min(base + this.focus * maxBonus, base + 3.2 + (wall ? 1.2 : 0));
      this.boundaryRadius += (desired - this.boundaryRadius) * Math.min(1, dt * 10);
      this.focus = Math.max(0, this.focus - (7 + this.boundaryRadius * 1.7) * efficiency * dt);
      if (this.focus <= 0.1) this.breakBoundary();
    } else {
      this.boundaryRadius = 0;
      this.focus = Math.min(100, this.focus + 24 * dt);
    }
  }

  private isBoundaryHeld(input: Input) {
    return this.activeCombatStyle === 'boundary' && input.held('parry') && this.grounded && !this.act && !this.sprinting && this.moveIntent.lengthSq() < 0.001 && this.boundaryBreak <= 0;
  }

  inIframes() {
    const a = this.act;
    if (this.invulnerable) return true;
    return !!(a && a.def.iframes && a.t >= a.def.iframes[0] && a.t <= a.def.iframes[1]);
  }

  // ==========================================================================
  // Simulation (fixed step)
  // ==========================================================================
  update(dt: number, input: Input, cam: ThirdPersonCamera) {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.updateStats(dt);
    this.updateCombatResources(dt);
    this.blockHitT += dt;

    if (this.dead) {
      this.deadT += dt;
      return;
    }
    if (!input.uiMode) this.readInput(input, cam);
    else this.moveIntent.set(0, 0, 0);
    // In a boat: the boat moves you (world/boats.ts); no walking or fighting.
    if (this.vehicle) {
      const v = this.vehicle;
      this.pos.copy(v.pos);
      this.yaw = v.yaw;
      this.vel.set(Math.sin(v.yaw) * v.speed, 0, Math.cos(v.yaw) * v.speed);
      const c = { x: v.pos.x, y: v.pos.y + CENTER_Y + 0.05, z: v.pos.z };
      this.body.setTranslation(c, true);
      this.collider.setTranslation(c);
      this.grounded = true;
      this.swimming = false;
      this.act = null;
      this.sprinting = input.held('sprint') && this.moveIntent.lengthSq() > 0;
      return;
    }
    if (this.prog.combat.origin === 'dragon' && !this.grounded && input.held('jump')) {
      // Early draconic flight is deliberately weak; it becomes more useful as Heroic Legacy grows.
      this.vel.y = Math.max(this.vel.y, -1.25 - this.prog.combat.heroic.level * 0.06);
    }
    this.updateAction(dt, input);
    this.updateLock(cam);
    this.move(dt);
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
    this.boundaryActive = this.isBoundaryHeld(input);
    if (this.boundaryActive) this.buffer = null;
    if (input.wasPressed('attack')) buf('attack');
    if (input.wasPressed('offhand') && this.equip.dualWield) buf('offhand');
    if (input.wasPressed('parry') && !this.boundaryActive) buf('parry');
    if (input.wasPressed('dodge')) buf('dodge');
    if (input.wasPressed('cast')) buf('cast');
    if (input.wasPressed('originAbility')) buf('originAbility');
    this.blocking = !this.boundaryActive && input.held('offhand') && this.equip.hasShield && (!this.act || this.act.def.id === 'parryShield');
    if (input.wasPressed('jump') && this.grounded && !this.act) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.airTime = 0;
    }
    if (input.wasPressed('lockOn')) this.toggleLock(cam);
    this.sprinting = !this.boundaryActive && input.held('sprint') && this.moveIntent.lengthSq() > 0 && !this.blocking && (this.mounted || this.stamina > 0) && !this.act && this.grounded;
    if (this.boundaryActive && this.moveIntent.lengthSq() > 0) this.breakBoundary();
  }

  // ---- actions --------------------------------------------------------------
  private startAction(id: string, t0?: number): boolean {
    const raw = ACTIONS[id];
    if (!raw) return false;
    const usingClip = !!raw.clip && this.char.has(raw.clip);
    const def = resolveAction(raw, usingClip);
    if (def.stamina > 0 && this.stamina <= 0) {
      events.emit('notEnough', { stat: 'stamina' });
      return false;
    }
    this.stamina = Math.max(0, this.stamina - def.stamina);
    if (def.stamina > 0) this.staminaDelay = 0.65;
    const w = def.hit?.hand === 'off' ? this.equip.offItem : this.equip.mainWeapon;
    const styleSpeed = this.activeCombatStyle === 'gale' && !!def.hit ? this.galeSpeedMultiplier : 1;
    const speed = (def.weaponSpeed ? w?.def.stats.speed ?? 1 : 1) * (usingClip ? def.clipTiming?.speed ?? 1 : 1) * styleSpeed;
    this.poseFrom = this.lastPose;
    this.poseFade = 0;
    this.act = { def, t: t0 ?? def.startAt ?? 0, speed, hitSet: new Set(), charge: 0, charging: false, fired: false, usingClip, landed: false };
    this.bladePrev.main = this.bladePrev.off = null;
    this.lastPresentT = -1;

    if (def.roll) {
      const dir = def.roll.back ? this.forward.negate() : this.moveIntent.lengthSq() > 0 ? this.moveIntent.clone() : this.forward;
      this.act.rollDir = dir;
    }
    if (def.roll) this.prog.combat.addCombatEvent('dodge', 1);
    if (def.hit) events.emit('swing', { heavy: id === 'heavy' });
    return true;
  }

  private endAction() {
    if (this.activeCombatStyle === 'gale' && this.act?.def.hit && this.act.hitSet.size === 0) this.breakMomentum(24);
    this.poseFrom = this.lastPose;
    this.poseFade = 0;
    this.act = null;
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
      if (b.a === 'originAbility') {
        this.buffer = null;
        this.useOriginAbility();
        return;
      }
      if (b.a === 'attack' && eq.mainWeapon) next = !this.grounded ? 'airAttack' : this.sprinting ? 'sprintAttack' : 'slash1';
      else if (b.a === 'offhand' && eq.dualWield) next = 'offslash1';
      else if (b.a === 'dodge') next = this.grounded ? (this.moveIntent.lengthSq() > 0 ? 'roll' : 'backstep') : null;
      else if (b.a === 'parry') next = eq.hasShield ? 'parryShield' : eq.dualWield ? 'parryDual' : null;
      else if (b.a === 'cast') next = this.spellAction();
      if (next === null && b.a === 'dodge' && !this.grounded) return; // keep it for landing
    } else {
      const d = a.def;
      const comboOpen = d.combo && a.t >= d.combo.from;
      if (b.a === 'attack' && eq.mainWeapon && comboOpen) next = mainCombo(d) && d.combo ? d.combo.next : 'slash1';
      else if (b.a === 'offhand' && eq.dualWield && comboOpen) next = offCombo(d) && d.combo ? d.combo.next : 'offslash1';
      else if (b.a === 'dodge' && a.t >= d.cancel && this.grounded) next = this.moveIntent.lengthSq() > 0 ? 'roll' : 'backstep';
      else if (b.a === 'parry' && a.t >= d.cancel) next = eq.hasShield ? 'parryShield' : eq.dualWield ? 'parryDual' : null;
      else return; // keep buffering
    }
    this.buffer = null;
    if (next) this.startAction(next);
  }

  private boundaryPulse() {
    const radius = Math.min(this.boundaryRadius + 0.45, 6.5);
    for (const target of targets) {
      if (!target.alive || target.position.distanceTo(this.pos) > radius + target.radius) continue;
      const dir = target.position.clone().sub(this.pos).setY(0).normalize();
      target.takeHit({ damage: Math.max(1, (this.equip.mainWeapon?.def.stats.damage ?? 10) * 0.28), poise: 34, dir, at: target.center.clone(), crit: false, source: 'melee' });
    }
    this.onShake?.(0.12);
  }

  private spellAction(): string | null {
    const sp = this.equip.get(this.equip.activeSpell);
    if (!sp) return null;
    const offensive = sp.def.id === 'fireball';
    // Offensive spells need a lock-on target.
    if (offensive && !this.lock?.alive) {
      events.emit('needTarget', {});
      return null;
    }
    const cost = Math.max(0, Math.round(sp.def.stats.manaCost ?? 0));
    if (this.mana < cost) {
      events.emit('notEnough', { stat: 'mana' });
      return null;
    }
    this.mana -= cost;
    events.emit('spellCast', { spell: sp.def.id });
    return offensive ? 'castFireball' : 'castHeal';
  }

  private updateAction(dt: number, input: Input) {
    this.consumeBuffer();
    const a = this.act;
    if (!a) return;
    const d = a.def;

    // A light attack held long enough turns into a charged heavy.
    if (d.id === 'slash1' && d.hit && a.t < d.hit.from && input.held('attack') && input.heldFor('attack') > 0.28) {
      const heavy = resolveAction(ACTIONS.heavy, !!ACTIONS.heavy.clip && this.char.has(ACTIONS.heavy.clip));
      this.startAction('heavy', heavy.chargeAt !== undefined ? heavy.chargeAt * heavy.dur * 0.6 : 0.3);
      return;
    }
    // Charging: hold at the charge point while the button stays down.
    a.charging = false;
    if (d.chargeAt !== undefined && a.t >= d.chargeAt * d.dur && input.held('attack') && a.charge < 0.9) {
      a.charge += dt;
      a.charging = true;
      return;
    }
    // Air attack: hold the falling pose until we actually land.
    if (d.air && !this.grounded && d.hit && a.t >= d.hit.from + 0.1) {
      a.t = d.hit.from + 0.1;
      return;
    }

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
      const target = this.lock?.alive ? this.lock : null;
      const dir = target ? target.center.clone().sub(from).normalize() : this.forward;
      this.onSpell?.('fireball', from, dir, target);
    } else {
      const sp = this.equip.get(this.equip.activeSpell);
      const heal = sp?.def.stats.heal ?? 50;
      this.hot = { rate: (heal * this.paths.healPower) / 3, left: 3 };
      this.onSpell?.('healingLight', this.center, this.forward, null);
    }
  }

  /**
   * Melee aim assist: the lock-on target, or else the best enemy in a cone in
   * front of the player.
   */
  aimTarget(range: number): Target | null {
    if (this.lock?.alive) return this.lock;
    const f = this.forward;
    let best: Target | null = null;
    let bestScore = Infinity;
    for (const t of targets) {
      if (!t.alive || !t.lockable || (t.kind === 'dummy' && range > 8)) continue;
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
  /** Turn toward `want` with a critically damped spring (smooth in and out). */
  private turnToward(want: number, dt: number, stiffness = 170, maxRate = 14) {
    const diff = wrapAngle(want - this.yaw);
    const c = 2 * Math.sqrt(stiffness);
    this.yawVel += (stiffness * diff - c * this.yawVel) * dt;
    this.yawVel = clamp(this.yawVel, -maxRate, maxRate);
    this.yaw = wrapAngle(this.yaw + this.yawVel * dt);
  }

  /** Forward distance an action has travelled by time t (root motion). */
  private travelAt(a: ActiveAction, t: number): number {
    const def = a.def;
    const info = a.usingClip ? this.char.clipInfo.get(def.clip!) : undefined;
    if (info?.rootCurve && info.rootCurve.length > 1) {
      const f = clamp(t, 0, (info.rootCurve.length - 1) / 30) * 30;
      const i = Math.floor(f), u = f - i;
      const c = info.rootCurve;
      return c[i] + ((c[Math.min(i + 1, c.length - 1)] ?? c[i]) - c[i]) * u;
    }
    if (def.roll) {
      // Rolls: fast start, long glide out (ease-out cubic).
      const t1 = def.dur * (def.roll.back ? 0.6 : 0.7);
      const u = clamp((t - 0.02) / (t1 - 0.02), 0, 1);
      return (1 - Math.pow(1 - u, 3)) * def.roll.dist;
    }
    if (def.move) return smoothstep(def.move.from, def.move.to, t) * def.move.dist;
    return 0;
  }

  private move(dt: number) {
    const a = this.act;
    const intent = this.moveIntent;
    let targetSpeed = 0;
    if (!a && intent.lengthSq() > 0) {
      const ms = this.mountStats ?? { canter: 11.5, gallop: 15, accel: 8 };
      targetSpeed = this.mounted ? (this.sprinting && this.mountCanGallop ? ms.gallop : this.lock ? 6.2 : ms.canter) : (this.blocking ? 1.6 : this.sprinting ? 6.2 : this.lock ? 3.2 : 4.2);
      if (!this.grounded) targetSpeed = Math.max(targetSpeed, 3.5);
      // Wading slows you down; deep water means swimming.
      const wade = waterDepthAt(this.pos.x, this.pos.z);
      if (wade > 0.25) targetSpeed *= 0.5;
      if (this.swimming) targetSpeed = this.sprinting ? 3.6 : 2.3;
    }
    // Swimming: float with the chest at the waterline, tire, and drown if spent.
    const surface = waterSurfaceAt(this.pos.x, this.pos.z);
    const depth = surface === null ? 0 : surface - this.groundBelow();
    this.swimming = !this.dead && depth > 1.35;
    if (this.swimming) {
      this.stamina = Math.max(0, this.stamina - (this.sprinting ? 7 : 2.2) * dt);
      this.staminaDelay = 0.6;
      if (this.stamina <= 0) {
        this.drownT += dt;
        if (this.drownT > 1) {
          this.drownT = 0;
          this.applyDamage(this.maxHp * 0.08);
        }
      }
    } else this.drownT = 0;
    if (this.sprinting && !this.mounted && !this.swimming) {
      this.stamina = Math.max(0, this.stamina - 13 * dt);
      this.staminaDelay = 0.5;
    }

    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    if (a && (a.def.roll || a.def.move || a.usingClip)) {
      // Root motion: follow the action's travel curve along its direction.
      const dir = a.rollDir ?? this.forward;
      let d = this.travelAt(a, a.t + (a.charging ? 0 : dt * a.speed)) - this.travelAt(a, a.t);
      // Don't lunge through an enemy we're already touching.
      if (!a.def.roll && this.lock && this.lock.center.distanceTo(this.center) < 1.4) d *= 0.2;
      const v = d / dt;
      // Blend in so the transition from running isn't a hard stop.
      const keep = a.t < 0.12 ? Math.exp(-18 * dt) : 0;
      hv.multiplyScalar(keep).addScaledVector(dir, v * (1 - keep));
    } else if (a) {
      hv.multiplyScalar(Math.exp(-12 * dt));
    } else {
      const want = intent.clone().multiplyScalar(targetSpeed);
      const accel = this.grounded ? (targetSpeed > hv.length() ? 8 : 11) : 2.5;
      hv.x = damp(hv.x, want.x, accel, dt);
      hv.z = damp(hv.z, want.z, accel, dt);
    }

    // Facing.
    const toLock = this.lock ? Math.atan2(this.lock.position.x - this.pos.x, this.lock.position.z - this.pos.z) : null;
    if (a) {
      if (a.def.roll && !a.def.roll.back) {
        this.turnToward(Math.atan2(a.rollDir!.x, a.rollDir!.z), dt, 500, 22);
      } else if (a.t < a.def.track) {
        const soft = a.def.hit ? this.aimTarget(4) : null;
        const toSoft = soft ? Math.atan2(soft.position.x - this.pos.x, soft.position.z - this.pos.z) : null;
        const want = toLock ?? toSoft ?? (intent.lengthSq() > 0 ? Math.atan2(intent.x, intent.z) : this.yaw);
        this.turnToward(want, dt, 220);
      } else this.yawVel *= Math.exp(-20 * dt);
    } else if (toLock !== null && !this.sprinting) {
      this.turnToward(toLock, dt, 200);
    } else if (intent.lengthSq() > 0) {
      this.turnToward(Math.atan2(intent.x, intent.z), dt, this.sprinting ? 110 : 160);
    } else this.yawVel *= Math.exp(-16 * dt);

    // Vertical.
    if (this.swimming && surface !== null) {
      // Buoyancy: ease toward treading water at the surface.
      this.vel.y = (surface - 1.25 - this.pos.y) * 5;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.grounded && this.vel.y < 0) this.vel.y = -1.5;
    }
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
    // Walls redirect velocity (slide) instead of it piling up against them.
    if (dt > 0 && !(a && (a.def.roll || a.usingClip || a.def.move))) {
      this.vel.x = (m.x - this.push.x) / dt;
      this.vel.z = (m.z - this.push.z) / dt;
    }
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded() && this.vel.y <= 0.1;
    if (!this.grounded) {
      this.airTime += dt;
      this.fallSpeed = Math.max(this.fallSpeed, -this.vel.y);
    }
    if (this.grounded && !wasGrounded) this.onLand();
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    this.pos.set(next.x, next.y - CENTER_Y - 0.02, next.z);

    if (this.pos.y < -30) this.teleport(new THREE.Vector3(0, 2, 10));
  }

  private onLand() {
    const a = this.act;
    if (this.fallSpeed > 8) this.onShake?.(Math.min(0.35, this.fallSpeed * 0.02));
    if (this.airTime > 0.15) this.landT = 0;
    if (a?.def.air && !a.landed) {
      a.landed = true;
      if (a.def.hit) a.t = Math.max(a.t, a.def.hit.from + 0.1);
      this.onPlungeLand?.(this.pos.clone());
      this.onShake?.(0.3 + Math.min(0.3, this.fallSpeed * 0.02));
      // Shockwave: everything close takes a hit.
      const base = this.equip.mainWeapon?.def.stats.damage ?? 10;
      for (const t of targets) {
        if (!t.alive || a.hitSet.has(t.id)) continue;
        const d = t.position.distanceTo(this.pos);
        if (d > 2.6 + t.radius) continue;
        a.hitSet.add(t.id);
        const dir = t.position.clone().sub(this.pos).setY(0).normalize();
        const dmg = Math.round(base * 1.2 * (1 - (d / (2.6 + t.radius)) * 0.5));
        t.takeHit({ damage: dmg, poise: 60, dir, at: t.center.clone(), crit: false, source: 'melee' });
        events.emit('enemyHit', { at: t.center.clone(), amount: dmg, crit: false, enemyId: t.id });
      }
    }
    this.airTime = 0;
    this.fallSpeed = 0;
    this.consumeBuffer(); // a dodge pressed in the air fires on landing
  }

  teleport(p: THREE.Vector3) {
    const c = { x: p.x, y: p.y + CENTER_Y + 0.05, z: p.z };
    this.body.setTranslation(c, true);
    this.collider.setTranslation(c);
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
    this.onTeleport?.(p);
  }
  /** Called after a teleport so streamed ground and trees can load around the new spot. */
  onTeleport?: (p: THREE.Vector3) => void;

  // ==========================================================================
  // Presentation (once per rendered frame)
  // ==========================================================================
  present(alpha: number, dt: number) {
    const root = this.char.root;
    root.position.lerpVectors(this.prevPos, this.pos, alpha);
    // In the saddle: the rider sits on the horse's back.
    root.position.y += this.vehicle ? -0.32 : this.mounted && this.mountStats ? RIDE_HEIGHT : this.mounted ? -0.72 : 0;
    // Getting on: start beside the horse's left flank and hop up into the saddle.
    let rideW = 1;
    if (this.mounted && this.mountStats && this.mountT < 1) {
      this.mountT = Math.min(1, this.mountT + dt / MOUNT_TIME);
      const e = smoothstep(0, 1, this.mountT);
      const left = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      root.position.addScaledVector(left, 0.85 * (1 - e));
      root.position.y += -RIDE_HEIGHT * (1 - e) + Math.sin(Math.PI * e) * 0.35;
      rideW = smoothstep(0.25, 0.85, this.mountT);
    }
    // Getting off: slide down from the saddle to where the player now stands.
    if (this.dismountFrom && this.dismountT < 1) {
      this.dismountT = Math.min(1, this.dismountT + dt / MOUNT_TIME);
      const e = smoothstep(0, 1, this.dismountT);
      root.position.addScaledVector(this.dismountFrom, 1 - e);
      root.position.y += Math.sin(Math.PI * e) * 0.2;
      rideW = 1 - smoothstep(0.1, 0.7, this.dismountT);
      if (this.dismountT >= 1) this.dismountFrom = null;
    }
    this.mountVisual.visible = this.mounted && !this.mountStats;
    root.rotation.y = this.prevYaw + wrapAngle(this.yaw - this.prevYaw) * alpha;
    const yawR = root.rotation.y;
    this.idleClock += dt;

    // Action time at this exact frame.
    const a = this.act;
    const at = a ? Math.min(a.def.dur, a.t + (a.charging ? 0 : alpha * SIM_STEP * a.speed)) : 0;

    // Local velocity for directional locomotion.
    const c = Math.cos(-yawR), s = Math.sin(-yawR);
    const local = { x: this.vel.x * c + this.vel.z * s, z: -this.vel.x * s + this.vel.z * c };
    if (a || this.mounted || this.vehicle) local.x = local.z = 0;

    // ---- clip layers ------------------------------------------------------
    const anim = this.anim;
    const rolling = a?.def.roll && !a.def.roll.back;
    if (this.dead && anim.has('death')) anim.setFull('death', this.deadT, 0.15);
    else if (a?.usingClip) anim.setFull(a.def.clip!, at, a.t < 0.05 ? 0.1 : 0.12, 0.2);
    else if (rolling && anim.has('jump_air')) anim.setFull('jump_air', 0.42, 0.06, 0.18); // tucked ball for the roll
    else if (!a && (!this.grounded || this.landT < 0.34) && anim.has('jump_air')) {
      // Jump clip time follows the physical arc: rise, apex, fall, land.
      const vy = this.vel.y;
      const t = !this.grounded ? (vy > 0 ? 0.27 + (1 - vy / JUMP_V) * 0.2 : 0.47 + Math.min(1, -vy / JUMP_V) * 0.15) : 0.62 + this.landT;
      anim.setFull('jump_air', t, 0.08, 0.22);
    } else anim.setFull(null, 0);

    this.blockW = damp(this.blockW, this.blocking ? 1 : 0, 16, dt);
    if (this.armsFromClips) {
      anim.setUpper('block_idle', this.blocking, this.idleClock, 0.1);
      anim.setUpper('block_hit', this.blockHitT < 0.45, this.blockHitT, 0.06);
    }
    this.landT += dt;
    anim.update(dt, { local, grounded: this.grounded || !!a });

    // Footsteps: once per half locomotion cycle.
    const ph = anim.locoPhase;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && !a && speed > 0.6 && Math.floor(ph * 2) !== Math.floor(this.lastPhase * 2)) {
      events.emit('footstep', { at: this.pos.clone(), surface: surfaceAt(this.pos.x, this.pos.z) });
    }
    this.lastPhase = ph;

    // ---- procedural layer ---------------------------------------------------
    const eq = this.equip;
    const base: ProcPose = {};
    if (!this.armsFromClips) {
      // Placeholder rig: hold the weapons up in a guard with IK.
      this.guardW = damp(this.guardW, this.mounted || this.sprinting ? 0 : speed > 3.2 ? 0.35 : 1, 8, dt);
      if (eq.mainWeapon) base.right = { ...GUARD_R, w: this.guardW };
      if (eq.hasShield) {
        const sh = this.blockW > 0.01 ? blendHandSimple(SHIELD_CARRY_L, SHIELD_BLOCK_L, this.blockW) : SHIELD_CARRY_L;
        base.left = { ...sh, w: Math.max(this.guardW, this.blockW) };
        base.hipsDrop = 0.05 * this.blockW;
        base.spinePitch = 0.08 * this.blockW;
      } else if (eq.dualWield) base.left = { ...OFFHAND_GUARD_L, w: this.guardW };
    } else if (eq.dualWield && !a) {
      base.left = { ...OFFHAND_GUARD_L, w: 0.6 };
    }
    // Lean into turns and accelerate with the torso.
    if (!a && this.grounded) {
      base.spineRoll = clamp(-this.yawVel * speed * 0.012, -0.22, 0.22);
      base.spinePitch = (base.spinePitch ?? 0) + (this.sprinting ? 0.12 : 0);
    }

    let pose: ProcPose = base;
    if (a && !a.usingClip && a.def.proc) {
      pose = overlayPose(base, a.def.proc(clamp(at / a.def.dur, 0, 1)));
      if (a.def.hit) pose = this.aimLow(pose, a, at, true);
    } else if (a && a.usingClip && a.def.hit) {
      pose = this.aimLow({}, a, at, false);
    } else if (rolling && !anim.has('jump_air')) {
      pose = { ...base, legTuck: smoothstep(0.02, 0.2, at) * (1 - smoothstep(0.5, 0.7, at)), spinePitch: 0.8 * smoothstep(0.02, 0.15, at) * (1 - smoothstep(0.5, 0.72, at)) };
    } else if (a?.usingClip) pose = {};
    if (!this.grounded && !a && !anim.has('jump_air')) pose = { ...pose, legTuck: 0.35 };
    if (this.dead) pose = {};

    if (this.poseFrom && this.poseFade < 1) {
      this.poseFade = Math.min(1, this.poseFade + dt / 0.18);
      pose = blendPose(this.poseFrom, pose, smoothstep(0, 1, this.poseFade));
    }
    this.lastPose = pose;

    // Procedural roll: rotate the tucked body around its middle.
    const vis = this.char.visual;
    vis.rotation.set(0, 0, 0);
    vis.position.set(0, 0, 0);
    if (rolling) {
      const k = smoothstep(0.04, 0.58, at);
      const ang = k * Math.PI * 2;
      const pivot = 0.5;
      vis.rotation.x = ang;
      vis.position.set(0, pivot - Math.cos(ang) * pivot, -Math.sin(ang) * pivot);
      vis.position.y -= Math.sin(k * Math.PI) * 0.3;
    }
    if (this.dead && !anim.has('death')) {
      const k = smoothstep(0, 0.9, this.deadT);
      vis.rotation.x = -k * Math.PI * 0.48;
      vis.position.y = -k * 0.05;
      vis.position.z = -k * 0.2;
    }
    this.rig.apply(pose);
    if ((this.mounted && this.mountStats) || this.vehicle || this.dismountFrom) this.ridePose(this.vehicle ? 1 : rideW);

    if (this.boundaryRing && this.boundaryOuterRing) {
      const visible = this.boundaryActive && this.activeCombatStyle === 'boundary' && !this.dead;
      this.boundaryRing.visible = visible;
      this.boundaryOuterRing.visible = visible;
      if (visible) {
        for (const ring of [this.boundaryRing, this.boundaryOuterRing]) {
          ring.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
          ring.scale.setScalar(Math.max(0.1, this.boundaryRadius));
        }
        (this.boundaryRing.material as THREE.MeshBasicMaterial).opacity = 0.45 + this.focus / 220;
      }
    }

    // Blade hit detection against the pose we just drew.
    if (a && at !== this.lastPresentT) this.detectHits(a, at);
    this.lastPresentT = at;
  }

  /** Sit astride: thighs forward and apart, knees bent, feet in the stirrups. */
  private ridePose(w = 1) {
    if (w <= 0.001) return;
    const up = this.char.root.quaternion;
    // Rotating about +x lifts a hanging leg toward +z (forward) for a +z-facing rider.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(up);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(up);
    const turn = (bone: THREE.Object3D | undefined, axis: THREE.Vector3, ang: number) => {
      if (!bone || !bone.parent) return;
      const wq = bone.getWorldQuaternion(new THREE.Quaternion());
      const target = new THREE.Quaternion().setFromAxisAngle(axis, ang).multiply(wq);
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      bone.quaternion.copy(pq.multiply(target));
      bone.updateMatrixWorld(true);
    };
    for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
      const thigh = this.char.bone(side + 'UpLeg');
      const shin = this.char.bone(side + 'Leg');
      // Left is +x for a +z-facing rider: spread each thigh out over the barrel.
      turn(thigh, fwd, s * 0.55 * w);
      turn(thigh, right, -0.7 * w);
      turn(shin, right, 1.05 * w);
      // The right leg swings high over the horse's back while mounting.
      if (s < 0 && w < 1) turn(thigh, fwd, -Math.sin(Math.PI * w) * 0.9);
    }
    // Square the shoulders to the horse: the combat idle stance turns the torso
    // sideways, which reads as riding side-saddle.
    const ls = this.char.bone('LeftArm'), rs = this.char.bone('RightArm');
    const spine = this.char.bone('Spine1') ?? this.char.bone('Spine');
    if (ls && rs && spine) {
      const a = ls.getWorldPosition(new THREE.Vector3()), b = rs.getWorldPosition(new THREE.Vector3());
      const across = b.sub(a).setY(0);
      if (across.lengthSq() > 1e-6) {
        // Facing +z, the left shoulder sits at +x, so left->right points along -x.
        const want = new THREE.Vector3(-1, 0, 0).applyQuaternion(up);
        const ang = Math.atan2(across.x * want.z - across.z * want.x, across.x * want.x + across.z * want.z);
        turn(spine, new THREE.Vector3(0, 1, 0), -ang * w);
      }
    }
  }

  /**
   * Bend a swing down toward low targets (slimes sit well below chest height).
   * On procedural poses the grip itself drops; on real clips the spine leans
   * and the knees bend around the strike window.
   */
  private aimLow(pose: ProcPose, a: ActiveAction, at: number, moveHands: boolean): ProcPose {
    const h = a.def.hit!;
    const tgt = this.aimTarget(4.5);
    if (!tgt) return pose;
    const top = tgt.center.y + (tgt.halfHeight ?? 0) + tgt.radius * 0.4 - this.pos.y;
    const drop = clamp(1.2 - top, 0, 0.75);
    if (drop <= 0.01) return pose;
    const k = smoothstep(h.from - 0.25, h.from, at) * (1 - smoothstep(h.to + 0.05, h.to + 0.35, at));
    const d = drop * k;
    const out: ProcPose = { ...pose, spinePitch: (pose.spinePitch ?? 0) + d * (moveHands ? 0.9 : 1.1), hipsDrop: (pose.hipsDrop ?? 0) + d * 0.3 };
    const side = h.hand === 'off' ? 'left' : 'right';
    const hp = pose[side];
    if (moveHands && hp) {
      out[side] = { ...hp, grip: [hp.grip[0], hp.grip[1] - d * 0.55, hp.grip[2] + d * 0.15], dir: [hp.dir[0], hp.dir[1] - d * 1.3, hp.dir[2]] };
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

  private detectHits(a: ActiveAction, at: number) {
    if (!a.def.hit) return;
    const h = a.def.hit;
    const seg = this.bladeSegment(h.hand);
    const prev = this.bladePrev[h.hand];
    this.bladePrev[h.hand] = seg;
    if (!seg || at < h.from || at > h.to) return;
    const from = prev ?? seg;
    const weapon = h.hand === 'off' ? this.equip.offItem : this.equip.mainWeapon;
    const base = weapon?.def.stats.damage ?? 10;
    const b = new THREE.Vector3(), t = new THREE.Vector3();
    for (const tg of targets) {
      if (!tg.alive || a.hitSet.has(tg.id)) continue;
      if (tg.center.distanceTo(this.center) > 3.6) continue;
      // Sweep between the blade's previous and current positions.
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        b.lerpVectors(from[0], seg[0], u);
        t.lerpVectors(from[1], seg[1], u);
        const [ha, hb] = hurtSegment(tg);
        if (segmentSegmentDistance(b, t, ha, hb) < tg.radius + 0.06) {
          a.hitSet.add(tg.id);
          const crit = tg.stunned;
          const charge = 1 + a.charge * 0.6;
          const bonus = (1 + this.equip.bonus('damagePct')) * this.paths.meleePower(weapon?.def.stats.speed ?? 1);
          const styleBonus = this.galeDamageMultiplier * this.crossDamageMultiplier;
          const dmg = Math.round(base * h.dmg * charge * bonus * styleBonus * (crit ? 2.6 : 1) * (0.92 + Math.random() * 0.16));
          const dir = tg.position.clone().sub(this.pos).setY(0).normalize();
          const at2 = tg.center.clone().addScaledVector(dir, -tg.radius * 0.8);
          const poise = h.poise * charge * this.paths.poisePower * this.crossPoiseMultiplier * (this.boundaryCounterReady ? 1.35 : 1);
          tg.takeHit({ damage: dmg, poise, dir, at: at2, crit, source: 'melee' });
          events.emit('enemyHit', { at: at2, amount: dmg, crit, enemyId: tg.id });
          if (this.activeCombatStyle === 'gale') this.addMomentum(13 + Math.min(8, h.dmg * 4));
          if (this.activeCombatStyle === 'cross' && this.crossOpening > 0) {
            this.prog.addMastery('cross', 1);
            this.prog.combat.addCombatEvent('openingConvert', 2);
            this.crossOpening = 0;
          }
          if (this.boundaryCounterReady) this.boundaryCounterReady = false;
          if (a.def.id === 'galeFinish' && this.activeCombatStyle === 'gale') this.momentum = 0;
          // Long-term discipline tracks (levels, mastery, specializations) grow from real hits.
          if (this.activeCombatStyle) this.prog.combat.addCombatEvent('attackHit', 2);
          const heavy = a.def.id === 'heavy' || a.def.id === 'airAttack';
          this.onHitStop?.(crit ? 0.16 : heavy ? 0.12 : 0.07);
          this.onShake?.(crit ? 0.4 : heavy ? 0.3 : 0.16);
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
    const attackPoint = att.at ?? att.from;
    if (this.boundaryActive && this.activeCombatStyle === 'boundary' && att.parryable && this.center.distanceTo(attackPoint) <= this.boundaryRadius) {
      att.onParried?.();
      this.prog.addMastery('boundary', 1);
      this.prog.combat.addCombatEvent('boundaryIntercept', 2);
      this.boundaryCounterReady = this.hasStyleSkill('boundary', 'boundary-counter');
      if (this.hasStyleSkill('boundary', 'boundary-pulse')) this.boundaryPulse();
      events.emit('parrySuccess', { at: attackPoint.clone() });
      return 'parried';
    }
    if (a?.def.parry && a.t >= a.def.parry[0] && a.t <= a.def.parry[1] && att.parryable && facing > 0.1) {
      att.onParried?.();
      const perfect = a.t <= a.def.parry[0] + 0.08;
      if (this.activeCombatStyle) this.prog.combat.addCombatEvent(perfect ? 'perfectParry' : 'parry', 2);
      if (this.activeCombatStyle === 'cross') {
        const duration = this.hasStyleSkill('cross', 'cross-master') ? 2.2 : this.hasStyleSkill('cross', 'cross-parry') ? 1.65 : 1.05;
        this.crossOpening = duration;
        this.prog.addMastery('cross', 1);
      }
      events.emit('parrySuccess', { at: this.center.addScaledVector(toAtt, 0.6) });
      events.emit('disciplineChanged', { discipline: this.prog.combat.primary, momentum: this.momentum, focus: this.focus, openings: this.crossOpening > 0 ? 1 : 0 });
      this.onHitStop?.(0.18);
      this.onShake?.(0.25);
      return 'parried';
    }
    if (this.blocking && this.equip.hasShield && facing > 0.3 && this.blockW > 0.5) {
      const st = this.equip.offItem!.def.stats;
      const cost = att.damage * (1 - (st.stability ?? 0.4)) * 1.7 + 6;
      this.stamina -= cost;
      this.staminaDelay = 0.8;
      this.blockHitT = 0;
      const through = att.damage * (1 - Math.min(96, st.block ?? 80) / 100);
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
    this.breakMomentum(38);
    if (this.boundaryActive) this.breakBoundary();
    this.applyDamage(dmg);
    if (att.burn) {
      const burnScale = this.prog.combat.origin === 'dragon' ? 0.35 : 1;
      this.burn = { dps: att.burn * burnScale, left: 3 };
    }
    // Hyper-armour through the middle of heavy swings.
    const heavyArmor = (a?.def.id === 'heavy' || a?.def.id === 'airAttack') && a.def.hit && a.t > a.def.hit.from - 0.2 && a.t < a.def.hit.to;
    if (!this.dead && !heavyArmor && att.poise > this.equip.poise * 0.8) {
      this.startAction('stagger');
      this.vel.addScaledVector(toAtt, -3.5);
    }
    this.onShake?.(0.3);
    return 'hit';
  }

  private applyDamage(d: number) {
    if (d <= 0 || this.invulnerable) return;
    this.hp = Math.max(this.damageFloor, this.hp - d);
    events.emit('playerDamaged', { amount: d, blocked: false });
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.deadT = 0;
      this.act = null;
      this.lock = null;
      events.emit('playerDied', {});
    }
  }

  takeDamage(amount: number) {
    this.applyDamage(amount);
  }

  respawn(at: THREE.Vector3) {
    this.dead = false;
    this.anim.stopAll();
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.burn.left = 0;
    this.hot.left = 0;
    this.act = null;
    this.momentum = 0;
    this.focus = 100;
    this.crossOpening = 0;
    this.boundaryActive = false;
    this.boundaryRadius = 0;
    this.teleport(at);
    events.emit('playerRespawned', {});
  }

  private updateStats(dt: number) {
    this.originCooldown = Math.max(0, this.originCooldown - dt);
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (!this.sprinting) this.stamina = Math.min(this.maxStamina, this.stamina + (this.blocking ? 16 : 46) * (1 + this.equip.bonus('staminaRegen') + this.paths.staminaRegen) * dt);
    this.mana = Math.min(this.maxMana, this.mana + 2.2 * (1 + this.equip.bonus('manaRegen') + this.paths.manaRegen) * dt);
    if (this.prog.combat.origin === 'demon' && !this.dead) this.hp = Math.min(this.maxHp, this.hp + 0.8 * dt);
    this.hp = Math.min(this.hp, this.maxHp);
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
    if (st.heal) this.hot = { rate: (st.heal * this.paths.healPower) / 1.2, left: 1.2 };
    if (st.restoreMana) this.mana = Math.min(this.maxMana, this.mana + st.restoreMana);
    if (st.restoreStamina) this.stamina = Math.min(this.maxStamina, this.stamina + st.restoreStamina);
    this.equip.consume(uid);
    this.onSpell?.(st.heal ? 'potionHeal' : 'potionMana', this.center, this.forward, null);
  }

  /** Use either a spell item uid or a learned combat move reference. */
  useMove(ref: number | string) {
    if (typeof ref === 'string') {
      const [prefix, style, nodeId] = ref.split(':');
      if (prefix !== 'skill' || !style || !nodeId || this.dead) return;
      const active = this.prog.activeStyle;
      if (!active || active !== style) return;
      const node = this.prog.skillMove(active, nodeId);
      if (!node || !node.actionId) return;
      this.startAction(node.actionId);
      return;
    }
    const it = this.equip.get(ref);
    if (!it || it.def.kind !== 'spell' || this.dead) return;
    this.equip.activeSpell = ref;
    this.buffer = { a: 'cast', t: performance.now() / 1000 };
  }


  /** Would a projectile at (x, z) enter the active Boundary field? */
  canIntercept(x: number, z: number) {
    return this.boundaryActive && this.activeCombatStyle === 'boundary' && !this.dead && Math.hypot(x - this.pos.x, z - this.pos.z) <= this.boundaryRadius;
  }

  private useOriginAbility() {
    if (this.originCooldown > 0 || this.dead) return;
    const origin = this.prog.combat.origin;
    if (origin === 'dragon') {
      const f = this.forward;
      const center = this.center;
      for (const t of targets) {
        if (!t.alive) continue;
        const to = t.center.clone().sub(center).setY(0);
        const d = to.length();
        if (d > 6.5 || d < 0.01) continue;
        if (to.normalize().dot(f) < 0.62) continue;
        const dmg = Math.round(26 + this.prog.combat.heroic.level * 2.5);
        t.takeHit({ damage: dmg, poise: 35, dir: f.clone(), at: t.center.clone(), crit: false, source: 'melee' });
        events.emit('enemyHit', { at: t.center.clone(), amount: dmg, crit: false, enemyId: t.id });
      }
      this.originCooldown = 4.5;
      events.emit('originAbility', { origin, ability: 'Dragon Breath' });
    } else if (origin === 'demon') {
      this.hot = { rate: Math.max(10, this.maxHp * 0.08), left: 2.5 };
      this.stamina = Math.min(this.maxStamina, this.stamina + 30);
      this.originCooldown = 5.5;
      events.emit('originAbility', { origin, ability: 'Blood Awakening' });
    } else {
      this.mana = Math.min(this.maxMana, this.mana + 22);
      this.stamina = Math.min(this.maxStamina, this.stamina + 22);
      this.originCooldown = 6;
      events.emit('originAbility', { origin, ability: 'Heroic Adaptation' });
    }
  }

  /** Debug: show action `id` frozen at time t. */
  debugPose(id: string, t: number) {
    if (!this.act || this.act.def.id !== id) this.startAction(id);
    if (!this.act) return;
    this.act.t = t;
    this.poseFade = 1;
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    for (let i = 0; i < 12; i++) this.present(1, 1 / 30); // let fades settle
  }
}

function blendHandSimple(a: typeof SHIELD_CARRY_L, b: typeof SHIELD_BLOCK_L, t: number) {
  const l = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  return { grip: l(a.grip, b.grip), dir: l(a.dir, b.dir), normal: l(a.normal, b.normal), w: 1, pole: a.pole && b.pole ? l(a.pole, b.pole) : a.pole };
}
