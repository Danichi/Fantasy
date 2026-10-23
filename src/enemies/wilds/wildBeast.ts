import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { compressedGltf } from '../../core/gltf';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../../physics/physics';
import { damp, dampAngle, clamp, wrapAngle } from '../../core/math';
import { events } from '../../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { heightAt } from '../../world/terrainHeight';
import { wildsSfx } from './wildsSfx';
import type { Telegraphs, Telegraph } from './telegraph';
import type { Missiles } from './projectiles';
import type { WildSpec, EliteAffix, MoveId } from './wildSpecs';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// A creature of the wilds: any of the animated creature or farm-animal models
// (wolf, boar, aurochs, stag, fox, goblin, orc, hound) driven by a spec and
// scaled by the danger where it spawned. Unlike the Glen's beasts every one
// has its own stats, can carry elite affixes (a prefix on its name, a size, a
// colour, glowing eyes, extra moves), hunts with its pack (one sees you, they
// all come, and they spread out round you), and telegraphs its big moves on
// the ground: a pounce marks where it will land, a charge marks its lane.

/** Shared by every wild creature: ground warnings, thrown things, pack calls. */
export interface WildCtx {
  tele: Telegraphs;
  missiles: Missiles;
  /** an alpha howled: the roaming system may send more of its kind */
  onHowl?: (b: WildBeast) => void;
}

export interface WildOpts {
  /** danger where it spawned (0..1) */
  danger: number;
  elites?: EliteAffix[];
  /** pack mates (shared array) */
  pack?: WildBeast[];
  /** how far it will follow you from home before giving up */
  leash?: number;
  /** a summoned creature comes straight for you */
  alerted?: boolean;
}

type State = 'idle' | 'chase' | 'windup' | 'attack' | 'leap' | 'charge' | 'recover' | 'hurt' | 'howl' | 'blink' | 'dying' | 'dormant' | 'roar';

const CACHE = new Map<string, Promise<GLTF>>();
export function loadWildModel(file: string) {
  let p = CACHE.get(file);
  if (!p) CACHE.set(file, (p = compressedGltf.loadAsync(file)));
  return p;
}

const findClip = (clips: THREE.AnimationClip[], patterns: (RegExp | string | undefined)[], not?: RegExp) => {
  for (const p of patterns) {
    if (!p) continue;
    const c = typeof p === 'string' ? clips.find((k) => k.name === p) : clips.find((k) => p.test(k.name) && !(not && not.test(k.name)));
    if (c) return c;
  }
  return undefined;
};

const DEATH_TIME = 4;
const _v = new THREE.Vector3();

export class WildBeast implements Target {
  id = newTargetId();
  kind: string;
  name: string;
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
  /** where it lives; the roaming system moves it as the pack wanders */
  home: THREE.Vector3;
  readonly danger: number;
  readonly elites: EliteAffix[];
  readonly moves: Set<MoveId>;
  pack: WildBeast[] | null;
  alerted = false;
  /** howl / frenzy buff seconds left */
  enraged = 0;
  /** hit damage, scaled */
  damage: number;
  speed: number;
  scale: number;

  protected state: State = 'idle';
  protected st = 0;
  protected cooldown = 0.6 + Math.random();
  protected move: MoveId | null = null;
  protected hitDone = false;
  protected deadT = 0;
  protected mixer: THREE.AnimationMixer | null = null;
  protected actions = new Map<string, THREE.AnimationAction>();
  protected active: THREE.AnimationAction | null = null;
  protected vel = new THREE.Vector3();
  protected yaw = Math.random() * Math.PI * 2;
  protected rb: RAPIER.RigidBody;
  protected col: RAPIER.Collider;
  protected kcc: RAPIER.KinematicCharacterController;
  protected model: THREE.Object3D | null = null;
  protected gltf: GLTF | null = null;
  protected mats: THREE.MeshStandardMaterial[] = [];
  protected glowMats: THREE.MeshStandardMaterial[] = [];
  protected flash = 0;
  /** windup glow 0..1 (the "it's about to" tell) */
  protected tell = 0;
  protected poiseAcc = 0;
  protected walkSpeed = 1.2;
  protected runSpeed = 3.5;
  protected wander: THREE.Vector3 | null = null;
  protected wanderT = 2 + Math.random() * 5;
  protected leash: number;
  protected flankAngle = (Math.random() - 0.5) * 2.4;
  protected howlT = 0;
  protected mark: Telegraph | null = null;
  protected leapFrom = new THREE.Vector3();
  protected leapTo = new THREE.Vector3();
  protected leapTime = 0.6;
  protected chargeDir = new THREE.Vector3();
  protected chargeLen = 0;
  protected chargeGone = 0;
  protected stuckT = 0;
  protected auraT = 0;
  protected frenzied = false;
  protected glowColor: THREE.Color;
  protected disposed = false;
  /** glow on the eyes / antlers even at rest (bosses) */
  protected glowBase = 0;
  /** the body stays where it fell (bosses): the lair disposes it */
  protected keepCorpse = false;

  constructor(readonly spec: WildSpec, at: THREE.Vector3, protected scene: THREE.Scene, protected fx: FX, protected ctx: WildCtx, opts: WildOpts) {
    this.danger = opts.danger;
    this.elites = opts.elites ?? [];
    this.pack = opts.pack ?? null;
    this.leash = opts.leash ?? 46;
    this.alerted = !!opts.alerted;
    const d = this.danger;
    let hp = spec.hp * (1 + d * 1.4), dmg = spec.damage * (1 + d * 0.9), speed = spec.speed * (1 + d * 0.12), scale = 1;
    const moves = new Set<MoveId>(spec.moves);
    for (const e of this.elites) {
      hp *= e.hp;
      dmg *= e.damage;
      speed *= e.speed ?? 1;
      scale *= e.scale;
      for (const m of e.moves ?? []) moves.add(m);
    }
    // Big-footed things don't get the dainty moves.
    if (spec.biped) moves.delete('kick');
    this.moves = moves;
    this.hp = this.maxHp = Math.round(hp);
    this.damage = Math.round(dmg);
    this.speed = speed;
    this.scale = scale;
    this.kind = spec.id + (this.elites.length ? 'Elite' : '');
    this.name = [...this.elites.map((e) => e.prefix), spec.name].join(' ');
    this.glowColor = new THREE.Color(this.elites[0]?.glow ?? 0xff6a2a);
    this.radius = spec.radius * scale;
    this.halfHeight = Math.max(0.3, spec.height * scale * 0.32);
    this.home = at.clone();
    this.position.copy(at);

    const R = physics.R;
    const cy = this.halfHeight + this.radius;
    this.rb = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + cy, at.z));
    this.col = physics.world.createCollider(R.ColliderDesc.capsule(this.halfHeight, this.radius).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    this.group.position.copy(at);
    scene.add(this.group);
    targets.add(this);
    this.center.set(at.x, at.y + spec.height * scale * 0.55, at.z);
    void this.load();
  }

  // ---- model --------------------------------------------------------------------------------

  protected async load() {
    try {
      const gltf = await loadWildModel(this.spec.file);
      if (this.disposed) return;
      this.gltf = gltf;
      const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const h = Math.max(0.01, box.max.y - box.min.y);
      model.scale.multiplyScalar((this.spec.height * this.scale) / h);
      model.updateMatrixWorld(true);
      const after = new THREE.Box3().setFromObject(model);
      const c = after.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      model.position.set(-c.x, -after.min.y, -c.z);
      holder.add(model);
      this.model = holder;
      const tint = this.elites.find((e) => e.tint)?.tint;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        // Own materials: each creature flashes, glows and is tinted on its own.
        const src = mesh.material as THREE.MeshStandardMaterial;
        const mat = src.clone();
        const named = this.spec.colors?.[src.name];
        if (named !== undefined) mat.color.set(named);
        if (this.spec.tint !== undefined) mat.color.multiply(new THREE.Color(this.spec.tint).multiplyScalar(1.6));
        if (tint !== undefined) mat.color.lerp(new THREE.Color(tint), 0.5);
        mat.roughness = Math.min(0.95, Math.max(0.35, mat.roughness ?? 0.7));
        mat.emissive = new THREE.Color(0, 0, 0);
        mesh.material = mat;
        this.mats.push(mat);
        if (this.spec.glowMats?.includes(src.name)) this.glowMats.push(mat);
      });
      this.decorate(model);
      this.group.add(holder);
      const clips = gltf.animations;
      if (clips.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const k = this.spec.clips ?? {};
        const flinch = /hit|react|recieve|receive/i;
        const idle = findClip(clips, [k.idle, /^idle$/i, /idle/i], flinch) ?? clips[0];
        const walk = findClip(clips, [k.walk, /^walk$/i, /walk/i], flinch) ?? idle;
        const run = findClip(clips, [k.run, /^gallop$/i, /^run$/i, /gallop/i, /run/i], /jump/i) ?? walk;
        const attack = findClip(clips, [k.attack, /^attack$/i, /attack_headbutt/i, /attack/i, /headbutt/i, /punch/i, /weapon/i], flinch) ?? idle;
        const gore = findClip(clips, [k.gore, /headbutt/i, /attack/i], flinch) ?? attack;
        const kick = findClip(clips, [k.kick, /kick/i], flinch) ?? attack;
        const leap = findClip(clips, [k.leap, /gallop_jump/i, /^jump$/i, /jump_start/i, /jump/i]) ?? run;
        const howl = findClip(clips, [k.howl, /^idle_2$/i, /idle_2/i, /^yes$/i, /idle/i], flinch) ?? idle;
        const hurt = findClip(clips, [k.hurt, /hitreact_left/i, /hitreact/i, /hit/i, /recieve|receive/i]);
        const death = findClip(clips, [k.death, /^death$/i, /death/i]);
        const add = (n: string, c: THREE.AnimationClip | undefined, loop: boolean) => {
          if (!c) return;
          const a = this.mixer!.clipAction(c);
          a.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
          a.clampWhenFinished = !loop;
          this.actions.set(n, a);
        };
        add('idle', idle, true);
        add('walk', walk, true);
        add('run', run, true);
        add('attack', attack, false);
        add('gore', gore, false);
        add('kick', kick, false);
        add('leap', leap, false);
        add('howl', howl, true);
        add('hurt', hurt, false);
        add('death', death, false);
        const H = this.spec.height * this.scale;
        this.walkSpeed = H * (this.spec.biped ? 0.9 : 1.1);
        this.runSpeed = H * (this.spec.biped ? 2.4 : 3.4);
        this.play(this.state === 'dying' ? 'death' : 'idle', 0);
      }
    } catch (e) {
      console.warn('[wilds] creature failed to load', this.spec.file, e);
    }
  }

  /** Extra bits on the model (bosses override: glowing antlers, a mane of spirit-fire). */
  protected decorate(_model: THREE.Object3D) {}

  protected play(name: string, fade = 0.15, speed = 1) {
    const next = this.actions.get(name) ?? (name === 'gore' || name === 'kick' ? this.actions.get('attack') : undefined);
    if (!next) return;
    next.timeScale = speed;
    if (next === this.active) return;
    if (this.active) this.active.fadeOut(fade);
    next.reset().fadeIn(fade).play();
    this.active = next;
  }

  protected clipLen(name: string, fallback = 0.9) {
    return this.actions.get(name)?.getClip().duration ?? fallback;
  }

  // ---- damage ------------------------------------------------------------------------------

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying' || this.state === 'dormant') return;
    this.hp -= h.damage;
    this.flash = 1;
    this.alert();
    if (this.hp <= 0) {
      this.die();
      return;
    }
    // Frenzy: the elite's last stand.
    if (!this.frenzied && this.elites.some((e) => e.frenzy) && this.hp < this.maxHp / 3) {
      this.frenzied = true;
      this.enraged = 30;
      wildsSfx.yelp(0, (this.spec.pitch ?? 1) * 0.8, 0.5);
      this.fx.add.spawn({ pos: this.center.clone(), spread: 2.5, count: 26, life: [0.4, 0.9], size: [0.14, 0.02], color: 0xff4020, color2: 0x600000, upBias: 0.8 });
    }
    this.poiseAcc += h.poise * (this.state === 'charge' || this.state === 'leap' ? 0.3 : 1);
    const heavy = h.crit || this.stunned || this.poiseAcc > this.spec.poise * this.scale;
    if (heavy && this.state !== 'leap') {
      this.poiseAcc = 0;
      this.flinch(h.dir);
    } else this.vel.addScaledVector(h.dir, 1.2 / this.scale);
  }

  protected flinch(dir: THREE.Vector3) {
    this.ctx.tele.cancel(this.mark);
    this.mark = null;
    this.stunned = true;
    this.move = null;
    this.setState('hurt');
    this.play('hurt', 0.05);
    this.vel.addScaledVector(dir, 3 / this.scale);
    if (Math.random() < 0.5) wildsSfx.yelp(0, this.spec.pitch ?? 1);
  }

  protected die() {
    if (!this.alive) return;
    this.alive = false;
    this.stunned = false;
    this.lockable = false;
    this.ctx.tele.cancel(this.mark);
    this.setState('dying');
    this.play('death', 0.06);
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.fx.drops.burst(this.center, new THREE.Color(this.elites.length ? this.glowColor : 0xffd58a), this.elites.length ? 26 : 14, 0.75, 4);
  }

  /** It (or a pack mate) has seen you. */
  alert() {
    if (this.alerted) return;
    this.alerted = true;
    for (const m of this.pack ?? []) if (m !== this && m.alive && !m.alerted && m.position.distanceTo(this.position) < 60) m.alert();
  }

  protected setState(s: State) {
    this.state = s;
    this.st = 0;
    this.hitDone = false;
  }

  get dead() {
    return !this.alive && this.state === 'dying' && this.deadT > DEATH_TIME && !this.keepCorpse;
  }
  /** fighting (not wandering): the roaming system keeps it while this is true */
  get engaged() {
    return this.alive && this.alerted;
  }
  get busy() {
    return this.state === 'windup' || this.state === 'attack' || this.state === 'leap' || this.state === 'charge';
  }

  // ---- brain -------------------------------------------------------------------------------

  /** Pick the next move for this distance (bosses override with their phases). */
  protected chooseMove(dist: number, player: Player): MoveId | null {
    const m = this.moves;
    const behind = this.playerBehind(player);
    const opts: [MoveId, number][] = [];
    const reach = this.reachNow();
    if (dist < reach) {
      if (m.has('kick') && behind) opts.push(['kick', 4]);
      if (m.has('bite')) opts.push(['bite', 3]);
      if (m.has('gore')) opts.push(['gore', 3]);
      if (m.has('smash')) opts.push(['smash', 1.5]);
    }
    if (m.has('pounce') && dist > 3.5 && dist < 9.5) opts.push(['pounce', 1.6]);
    if (m.has('charge') && dist > 6 && dist < 18) opts.push(['charge', 1.8]);
    if ((m.has('sling') || m.has('quills')) && dist > 6 && dist < 24) opts.push([m.has('sling') ? 'sling' : 'quills', 2]);
    if (m.has('blink') && dist > 5 && dist < 20) opts.push(['blink', 0.8]);
    if (m.has('howl') && this.howlT <= 0) opts.push(['howl', dist > 5 ? 3 : 0.6]);
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
    for (const [k, w] of opts) if ((r -= w) <= 0) return k;
    return opts[0][0];
  }

  protected reachNow() {
    return this.spec.reach * Math.sqrt(this.scale);
  }

  protected playerBehind(player: Player) {
    const to = _v.copy(player.pos).sub(this.position).setY(0).normalize();
    return to.dot(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))) < -0.35;
  }

  protected faceToward(p: THREE.Vector3, rate: number, dt: number) {
    this.yaw = dampAngle(this.yaw, Math.atan2(p.x - this.position.x, p.z - this.position.z), rate, dt);
  }

  protected windupTime(m: MoveId) {
    const fast = this.enraged > 0 ? 0.8 : 1;
    const base: Partial<Record<MoveId, number>> = { bite: 0.32, gore: 0.42, kick: 0.3, pounce: 0.62, charge: 0.95, howl: 0.2, sling: 0.7, quills: 0.75, smash: 0.85, blink: 0.35 };
    return (base[m] ?? 0.8) * fast;
  }

  /** Begin a move: the windup, and its warning on the ground. */
  protected startMove(m: MoveId, player: Player) {
    this.move = m;
    this.setState('windup');
    const p = this.position;
    const fwd = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
    const w = this.windupTime(m);
    const red = this.elites.length ? this.glowColor.getHex() : 0xff5a2a;
    if (m === 'pounce') {
      // Where you are now (a step ahead if you're running): that's where it lands.
      const lead = player.pos.clone().addScaledVector(new THREE.Vector3(player.vel.x, 0, player.vel.z), 0.25);
      const to = lead.sub(p).setY(0);
      const d = clamp(to.length(), 1, 10);
      this.leapFrom.copy(p);
      this.leapTo.copy(p).addScaledVector(to.normalize(), d);
      this.leapTo.y = heightAt(this.leapTo.x, this.leapTo.z);
      this.mark = this.ctx.tele.circle(this.leapTo.x, this.leapTo.z, 1.5 + this.radius, w + 0.55, red);
    } else if (m === 'charge') {
      this.yaw = fwd;
      this.chargeDir.set(Math.sin(fwd), 0, Math.cos(fwd));
      this.chargeLen = clamp(Math.hypot(player.pos.x - p.x, player.pos.z - p.z) + 5, 8, 20);
      this.mark = this.ctx.tele.line(p.x, p.z, fwd, this.chargeLen, this.radius * 2 + 1.4, w, red);
      wildsSfx.charge(Math.hypot(player.pos.x - p.x, player.pos.z - p.z));
    } else if (m === 'smash') {
      const r = this.reachNow() * 0.9;
      const c = p.clone().add(new THREE.Vector3(Math.sin(fwd), 0, Math.cos(fwd)).multiplyScalar(r));
      this.mark = this.ctx.tele.circle(c.x, c.z, 1.8 * this.scale, w, red);
    } else if (m === 'howl') {
      this.howlT = 24;
      this.setState('howl');
      this.play('howl', 0.2);
      wildsSfx.howl(Math.hypot(player.pos.x - p.x, player.pos.z - p.z), (this.spec.pitch ?? 1) / Math.sqrt(this.scale));
    }
  }

  protected land(player: Player) {
    const p = this.position;
    const r = 1.5 + this.radius;
    this.fx.dust(p.clone(), 0.6 * this.scale);
    if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r + 0.3 && Math.abs(player.pos.y - p.y) < 1.6) {
      this.strike(player, this.damage * 1.3, false, 90);
    }
  }

  /** Land a blow on the player. */
  protected strike(player: Player, damage: number, parryable: boolean, poise: number, knock = 0) {
    const burn = this.elites.find((e) => e.burn)?.burn;
    const dmg = Math.round(damage * (this.enraged > 0 ? 1.2 : 1));
    const res = player.receiveAttack({
      damage: dmg, from: this.position.clone(), parryable, poise, burn,
      onParried: () => {
        this.stunned = true;
        this.move = null;
        this.setState('hurt');
        this.play('hurt', 0.05);
        this.vel.copy(player.pos).sub(this.position).setY(0).normalize().multiplyScalar(-5 / this.scale);
      },
    });
    if (res === 'hit' && knock > 0) player.vel.addScaledVector(player.pos.clone().sub(this.position).setY(0).normalize(), knock);
    return res;
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.cooldown -= dt;
    this.howlT -= dt;
    this.enraged = Math.max(0, this.enraged - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mixer?.update(dt);

    if (this.state === 'dying') {
      this.deadT += dt;
      this.paint(dt);
      if (this.deadT > DEATH_TIME && !this.keepCorpse) this.dispose();
      return;
    }

    const toP = player.pos.clone().sub(this.position);
    const dist = Math.hypot(toP.x, toP.z);
    const homeD = Math.hypot(this.home.x - this.position.x, this.home.z - this.position.z);
    const sense = this.spec.aggro + this.danger * 5 + (this.alerted ? 14 : 0);
    if (!this.alerted && !player.dead && dist < this.spec.aggro + this.danger * 5) this.alert();
    // Lost interest: too far from home, or the player is gone.
    if (this.alerted && (player.dead || (homeD > this.leash && dist > 12) || dist > sense + 30)) {
      this.alerted = false;
      if (this.busy) {
        this.ctx.tele.cancel(this.mark);
        this.setState('idle');
      }
    }

    let speed = 0;
    const mul = this.enraged > 0 ? 1.25 : 1;
    switch (this.state) {
      case 'hurt':
        if (this.st > 0.55) {
          this.stunned = false;
          this.setState('chase');
        }
        break;
      case 'recover':
        if (this.st > (this.move === 'charge' ? 1.1 : 0.45)) {
          this.stunned = false;
          this.move = null;
          this.setState('chase');
        }
        break;
      case 'howl':
        if (Math.random() < dt * 20) this.fx.add.spawn({ pos: this.center.clone().setY(this.center.y + 0.4 * this.scale), vel: new THREE.Vector3(0, 2.4, 0), spread: 1.2, count: 1, life: [0.5, 1.1], size: [0.16, 0.02], color: this.glowColor, color2: 0x202020, upBias: 1 });
        if (this.st > 1.6) {
          // The pack answers: everyone near hits harder and moves faster for a while.
          for (const m of this.pack ?? [this]) if (m.alive && m.position.distanceTo(this.position) < 40) (m.enraged = Math.max(m.enraged, 12)), m.alert();
          this.ctx.onHowl?.(this);
          this.move = null;
          this.cooldown = 0.6;
          this.setState('chase');
        }
        break;
      case 'windup':
        this.updateWindup(dt, player, dist);
        break;
      case 'attack': {
        const name = this.move === 'gore' ? 'gore' : this.move === 'kick' ? 'kick' : 'attack';
        const len = Math.min(this.clipLen(name), 1.3);
        if (!this.hitDone && this.st > len * 0.32) {
          this.hitDone = true;
          this.meleeHit(player);
        }
        if (this.st > len) {
          this.cooldown = this.spec.cooldown * (this.enraged > 0 ? 0.7 : 1) * (0.8 + Math.random() * 0.5);
          this.move = null;
          this.setState('chase');
        }
        break;
      }
      case 'leap': {
        const k = clamp(this.st / this.leapTime, 0, 1);
        const p = this.leapFrom.clone().lerp(this.leapTo, k);
        p.y = heightAt(p.x, p.z) + Math.sin(k * Math.PI) * (1.2 + this.scale * 0.5);
        this.place(p);
        if (k >= 1) {
          this.place(this.leapTo.clone());
          this.land(player);
          this.cooldown = this.spec.cooldown;
          this.setState('recover');
        }
        this.paint(dt);
        return;
      }
      case 'charge': {
        const sp = (9 + this.danger * 3) * mul;
        speed = sp;
        this.chargeGone += sp * dt;
        if (!this.hitDone && dist < this.radius + 1.1 && Math.abs(toP.y) < 1.8) {
          this.hitDone = true;
          this.strike(player, this.damage * 1.5, false, 140, 9);
        }
        if (Math.random() < dt * 14) this.fx.dust(this.position.clone(), 0.35 * this.scale);
        if (this.chargeGone >= this.chargeLen || this.stuckT > 0.18) {
          // Slammed into something: dazed for a moment (a free hit).
          if (this.stuckT > 0.18) {
            this.stunned = true;
            this.fx.dust(this.position.clone(), 1.2 * this.scale);
            events.emit('bossSlam', { at: this.position.clone() });
          }
          this.cooldown = this.spec.cooldown;
          this.setState('recover');
        }
        break;
      }
      case 'blink':
        // Gone into shadow; out again behind you.
        if (this.st > 0.4) {
          const back = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
          const p = player.pos.clone().addScaledVector(back, 2.6);
          p.y = heightAt(p.x, p.z);
          this.place(p);
          this.group.visible = true;
          this.smoke(p);
          this.yaw = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
          this.move = 'bite';
          this.setState('windup');
        }
        break;
      default: {
        // idle / chase
        if (this.alerted && !player.dead) {
          this.wander = null;
          this.faceToward(player.pos, 8, dt);
          if (this.cooldown <= 0) {
            const m = this.chooseMove(dist, player);
            if (m && (m !== 'bite' && m !== 'gore' && m !== 'kick' && m !== 'smash' ? true : dist < this.reachNow())) {
              this.startMove(m, player);
              break;
            }
          }
          this.state = 'chase';
          // Close in; while the next attack recharges, circle round the player
          // at the pack's spread (so a pack surrounds you instead of queueing).
          const reach = this.reachNow();
          if (this.cooldown > 0.2 && dist < reach * 3) {
            const a = Math.atan2(this.position.x - player.pos.x, this.position.z - player.pos.z) + this.flankAngle * dt * 1.5;
            const ring = player.pos.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(reach * 1.8));
            this.faceToward(ring, 6, dt);
            speed = this.walkSpeed * 1.3;
          } else speed = dist > reach * 0.85 ? this.speed * mul : 0;
        } else this.idle(dt, homeD);
      }
    }
    if (this.state === 'chase' || this.state === 'idle' || this.state === 'charge') this.walk(dt, speed);
    else this.walk(dt, 0);
    this.paint(dt);
  }

  protected updateWindup(dt: number, player: Player, dist: number) {
    const m = this.move!;
    const w = this.windupTime(m);
    this.tell = Math.min(1, this.st / w);
    if (m !== 'charge') this.faceToward(m === 'pounce' ? this.leapTo : player.pos, m === 'smash' ? 3 : 10, dt);
    if (m === 'charge' && Math.random() < dt * 12) this.fx.dust(this.position.clone().addScaledVector(this.chargeDir, -0.6 * this.scale), 0.25 * this.scale);
    if (m === 'blink' && this.st < dt * 1.5) {
      this.smoke(this.position);
      this.group.visible = false;
      this.setState('blink');
      return;
    }
    if (this.st < w) return;
    this.tell = 0;
    switch (m) {
      case 'pounce':
        this.leapFrom.copy(this.position);
        this.leapTime = 0.45 + this.leapFrom.distanceTo(this.leapTo) * 0.025;
        this.play('leap', 0.06, 1.1);
        this.setState('leap');
        break;
      case 'charge':
        this.chargeGone = 0;
        this.stuckT = 0;
        this.play('run', 0.1, 1.4);
        this.setState('charge');
        break;
      case 'sling':
      case 'quills': {
        const from = this.center.clone().setY(this.center.y + 0.3 * this.scale);
        const lead = player.center.clone().addScaledVector(new THREE.Vector3(player.vel.x, 0, player.vel.z), dist / 22);
        if (m === 'sling') this.ctx.missiles.lob('stone', from, lead, Math.max(0.6, dist / 20), Math.round(this.damage * 0.9));
        else for (let k = -1; k <= 1; k++) {
          const dir = lead.clone().sub(from).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.16);
          this.ctx.missiles.shoot('thorn', from, dir, 24, Math.round(this.damage * 0.7));
        }
        this.play('attack', 0.08);
        this.cooldown = this.spec.cooldown * 1.3;
        this.setState('recover');
        break;
      }
      case 'smash': {
        this.play('attack', 0.08, 1.2);
        const r = this.reachNow() * 0.9;
        const c = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(r));
        events.emit('bossSlam', { at: c.clone() });
        this.fx.dust(c, 1.1 * this.scale);
        if (Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < 1.8 * this.scale + 0.3) this.strike(player, this.damage * 1.4, false, 110, 6);
        this.cooldown = this.spec.cooldown;
        this.setState('recover');
        break;
      }
      default:
        this.play(m === 'gore' ? 'gore' : m === 'kick' ? 'kick' : 'attack', 0.07, m === 'kick' ? 1.2 : 1);
        this.setState('attack');
    }
    void dist;
  }

  protected meleeHit(player: Player) {
    const m = this.move ?? 'bite';
    const to = player.pos.clone().sub(this.position).setY(0);
    const d = to.length();
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const facing = d > 0.01 ? to.normalize().dot(fwd) : 1;
    const reach = this.reachNow() + 0.45;
    if (d > reach || Math.abs(player.pos.y - this.position.y) > 2) return;
    if (m === 'kick' ? facing > 0.2 : facing < 0.25) return;
    if (m === 'kick') this.strike(player, this.damage * 1.25, false, 110, 7);
    else if (m === 'gore') this.strike(player, this.damage * 1.15, true, 80, 4);
    else this.strike(player, this.damage, true, this.damage * 1.8);
  }

  protected idle(dt: number, homeD: number) {
    this.state = 'idle';
    if (homeD > 8) {
      this.wander = null;
      this.faceToward(this.home, 4, dt);
      this.walk(dt, this.walkSpeed * 1.3);
      return;
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0 && !this.wander) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
      this.wander = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    if (this.wander) {
      const to = this.wander.clone().sub(this.position).setY(0);
      if (to.length() < 0.7) {
        this.wander = null;
        this.wanderT = 3 + Math.random() * 6;
      } else {
        this.faceToward(this.wander, 3, dt);
        this.walk(dt, this.walkSpeed);
      }
    }
  }

  private walkedThisStep = false;
  protected walk(dt: number, speed: number) {
    if (this.walkedThisStep) return;
    this.walkedThisStep = true;
    const fwd = this.state === 'charge' ? this.chargeDir : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const rate = this.state === 'charge' ? 20 : 10;
    this.vel.x = damp(this.vel.x, fwd.x * speed, rate, dt);
    this.vel.z = damp(this.vel.z, fwd.z * speed, rate, dt);
    this.vel.y -= 20 * dt;
    const want = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.col, want, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    // Charging into a tree or a wall: it stops dead.
    const asked = Math.hypot(want.x, want.z), got = Math.hypot(m.x, m.z);
    this.stuckT = this.state === 'charge' && asked > 0.02 && got < asked * 0.35 ? this.stuckT + dt : 0;
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    // Never sink through the terrain if the collider tiles aren't in yet.
    const ground = heightAt(next.x, next.z);
    const cy = this.halfHeight + this.radius;
    if (next.y - cy < ground - 0.5) next.y = ground + cy;
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - cy, next.z);
    if (this.kcc.computedGrounded()) this.vel.y = Math.min(0, this.vel.y);
    // Legs match the ground speed.
    if (this.mixer && (this.state === 'chase' || this.state === 'idle')) {
      const g = Math.hypot(this.vel.x, this.vel.z);
      if (g > this.walkSpeed * 1.5) this.play('run', 0.18, clamp(g / this.runSpeed, 0.6, 1.6));
      else if (g > 0.25) this.play('walk', 0.2, clamp(g / this.walkSpeed, 0.5, 1.6));
      else this.play('idle', 0.3);
    }
  }

  /** Put the body somewhere directly (leaps, blinks, resets). */
  protected place(p: THREE.Vector3) {
    const cy = this.halfHeight + this.radius;
    const c = { x: p.x, y: p.y + cy, z: p.z };
    this.rb.setNextKinematicTranslation(c);
    this.col.setTranslation(c);
    this.position.copy(p);
    this.vel.set(0, 0, 0);
  }

  protected smoke(at: THREE.Vector3) {
    this.fx.add.spawn({ pos: at.clone().setY(at.y + 0.6), spread: 1.6, count: 26, life: [0.4, 0.9], size: [0.5, 0.1], color: 0x3a2a5a, color2: 0x08060c, upBias: 0.6, alpha: 0.8 });
    wildsSfx.chime(0, 0.15);
  }

  /** Pose, glow and flash, once per step. */
  protected paint(dt: number) {
    this.walkedThisStep = false;
    this.group.position.copy(this.position);
    if (this.state === 'dying' && !this.keepCorpse) this.group.position.y -= clamp((this.deadT - 2) * 0.5, 0, 1) * this.spec.height * this.scale;
    this.center.set(this.position.x, this.position.y + this.spec.height * this.scale * 0.55, this.position.z);
    if (this.model) {
      this.model.rotation.y = dampAngle(this.model.rotation.y, this.yaw + this.spec.facing, this.state === 'charge' ? 20 : 12, dt);
      // The windup crouch: a squash before it springs.
      const crouch = this.state === 'windup' && (this.move === 'pounce' || this.move === 'charge') ? this.tell * 0.12 : 0;
      this.model.scale.set(1 + crouch * 0.5, 1 - crouch, 1 + crouch * 0.3);
    }
    const elite = this.elites.length > 0;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    const k = this.state === 'windup' ? this.tell : 0;
    for (const m of this.mats) {
      if (this.flash > 0) m.emissive.setRGB(0.6 * this.flash, 0.15 * this.flash, 0.08 * this.flash);
      else if (k > 0 || elite || this.enraged > 0) {
        const e = (elite ? 0.05 + pulse * 0.04 : 0) + k * 0.35 + (this.enraged > 0 ? 0.08 : 0);
        m.emissive.copy(this.glowColor).multiplyScalar(e);
      } else m.emissive.setRGB(0, 0, 0);
    }
    if (elite || this.enraged > 0 || this.glowMats.length) {
      const eye = Math.max(this.alive ? this.glowBase : 0, elite || this.enraged > 0 ? 2.2 + k * 3 : k * 3);
      for (const m of this.glowMats) {
        m.emissive.copy(this.glowColor).multiplyScalar(eye);
        m.emissiveIntensity = 1;
      }
    }
    // Elites trail motes of their colour.
    if (elite && this.alive) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.22;
        this.fx.add.spawn({ pos: this.center.clone(), vel: new THREE.Vector3(0, 0.8, 0), spread: 0.5 * this.scale, count: 1, life: [0.6, 1.2], size: [0.12, 0.01], color: this.glowColor, color2: 0x000000, jitter: 0.4 * this.scale, upBias: 0.5 });
      }
    }
  }

  /** Back to full health at home, calm (bosses: the player fled or died). */
  resetTo(at: THREE.Vector3) {
    if (!this.alive) return;
    this.hp = this.maxHp;
    this.alerted = false;
    this.stunned = false;
    this.enraged = 0;
    this.frenzied = false;
    this.move = null;
    this.poiseAcc = 0;
    this.ctx.tele.cancel(this.mark);
    this.home.copy(at);
    this.place(at.clone().setY(heightAt(at.x, at.z)));
    this.group.visible = true;
    this.setState('idle');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.alive = false;
    targets.delete(this);
    this.ctx.tele.cancel(this.mark);
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    this.mixer?.stopAllAction();
    for (const m of this.mats) m.dispose();
  }

  /** Facing angle (bosses' attacks aim off it). */
  get facing() {
    return this.yaw;
  }
}

/** Wrap an angle into [-PI, PI] (re-exported for the bosses). */
export const wrap = wrapAngle;
