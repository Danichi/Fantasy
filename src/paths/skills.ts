import * as THREE from 'three';
import '../combat/skillActions';
import { events } from '../core/events';
import { baseMods, type CombatMods } from '../combat/mods';
import { targets, type Target, type IncomingAttack, type DefenceResult } from '../combat/targets';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Spells } from '../magic/spells';
import type { Style } from '../magic/circles';
import { DISC, DISCIPLINES } from './data';
import { treeOf, type TreeNode } from './paths';
import { PASSIVES, genericEffect, type NodeEffect, type NumMod } from './effects';
import { SkillFx, PALETTE } from './skillFx';
import { FIRE_SKILLS } from './classes/fire';
import { LIGHT_SKILLS } from './classes/light';

// The skill runtime: turns learned tree nodes into combat. It
//  - sums passive node effects into the player's combat modifiers each step,
//  - runs active skills from the moves bar (costs, cooldowns, actions, effects),
//  - tracks class resources (Flow for Gale Style, Resolve for Boundary Style),
//  - ticks burns, bleeds and brands on enemies, buffs, shields and zones.
// Combat-class nodes only work while that class is active.

export interface Pending {
  key: string;
  rank: number;
  target: Target | null;
  point: THREE.Vector3;
  n: number; // event counter
  /** 1.5 when Radiance empowered this cast */
  k: number;
}

export interface SkillDef {
  action?: string; // omitted: instant
  cd: number;
  stamina?: number;
  mana?: number;
  flow?: number;
  needShield?: boolean;
  /** needs an enemy in range (lock-on or aim assist) */
  needTarget?: number;
  /** aim distance for targeted spells */
  range?: number;
  /** an attack spell that may be cast without a lock-on (the rest need one) */
  freeAim?: boolean;
  /** two uses before cooldown when this flag is learned */
  charges?: string;
  /** Lightbinder: spends 25 Radiance, if you have it, to work 50% better */
  kindle?: boolean;
  /** Pyromancer: Heat this builds when cast */
  heat?: number;
  /** Pyromancer: Heat needed to cast */
  needHeat?: number;
  text: (r: number, rt: SkillRuntime) => string;
  on?: (rt: SkillRuntime, p: Pending, ev: string) => void;
  /** instant skills */
  now?: (rt: SkillRuntime, p: Pending) => boolean | void;
}

/** Rank scaling: each rank past I adds 8%. */
export const R = (r: number) => 1 + 0.08 * (r - 1);
const pct = (v: number) => `${Math.round(v)}`;

export type Status = {
  t: Target;
  burn?: { dps: number; left: number; stacks: number; acc: number };
  bleed?: { dps: number; left: number; acc: number };
  brand?: number;
  /** Lightbinder Judgment stacks on a branded enemy */
  verdict?: number;
  tether?: { at: THREE.Vector3; left: number; cd: number };
};
export interface HitOpts {
  poise?: number;
  dir?: THREE.Vector3;
  fire?: boolean;
  crit?: boolean;
  source?: 'melee' | 'spell';
  stun?: boolean;
  /** doesn't add Verdict (ticks, echoes) */
  noVerdict?: boolean;
  /** already shared through Chains of Dawn */
  chained?: boolean;
}
interface Buff { left: number; v?: number }

export class SkillRuntime {
  readonly vfx: SkillFx;
  flow = 0;
  resolve = 0;
  private flowIdle = 0;
  private resolveIdle = 0;
  private cds = new Map<string, number>();
  private uses = new Map<string, number>();
  buffs = new Map<string, Buff>();
  private status = new Map<number, Status>();
  private pending: Pending | null = null;
  private timers: { t: number; fn: () => void }[] = [];
  private passive: { m: Partial<Record<NumMod, number>>; x: Record<string, number> } = { m: {}, x: {} };
  private lastHitT = 99;
  private hits3 = 0;
  private critNext = 0;
  private fortress = 0;
  private cheat = { last: -1e9, phoenix: -1e9, res: -1e9, crest: -1e9 };
  private secondWindAt = -1e9;
  private time = 0;
  private dodgeSeen: object | null = null;
  private absorbPool = 0;
  private absorbKind: 'ward' | 'barrier' | null = null;
  /** Pyromancer Heat (0-100) */
  heat = 0;
  private heatIdle = 0;
  /** Lightbinder Radiance (0-100) */
  radiance = 0;
  /** world conditions the runtime can't see itself (main.ts fills this in) */
  env: () => { daylight: boolean } = () => ({ daylight: false });
  notify: (msg: string) => void = () => {};
  /** Mote of Light */
  mote: { pos: THREE.Vector3; left: number; caged: boolean; acc: number; light: THREE.PointLight | null } | null = null;
  /** projectiles Halo Ward will still stop */
  halo = 0;
  /** Chains of Dawn */
  chain: Target[] = [];
  private chainLeft = 0;
  private wildAcc = 0;
  /** parried enemies, for the dazed sparkle over their heads */
  private dazed: { t: Target; left: number }[] = [];

  constructor(scene: THREE.Scene, private player: Player, fx: FX, private spells: Spells) {
    this.vfx = new SkillFx(scene, fx);
    player.onSkillEvent = (n) => this.onEvent(n);
    player.defend = (att, facing) => this.defend(att, facing);
    player.onOverheal = (n) => this.onOverheal(n);
    player.absorb = (d) => this.absorbDamage(d);
    player.cheatDeath = () => this.cheatDeath();
    player.meleeBonus = (t) => this.meleeBonus(t);
    events.on('pathsChanged', () => this.recompute());
    events.on('meleeHit', (e) => this.onMeleeHit(e.target, e.amount, e.crit, e.action));
    events.on('parrySuccess', ({ at }) => this.onParry(at));
    events.on('blockImpact', () => this.onBlock());
    events.on('playerDamaged', () => this.onHurt());
    events.on('enemyDied', ({ at, enemyId }) => this.onKill(at, enemyId));
    events.on('spellImpact', ({ at, spell }) => spell === 'fireball' && this.onFireballImpact(at));
    events.on('playerRespawned', () => this.reset());
    this.recompute();
  }

  /** Back to a calm state (respawn, test reset): no Heat, Radiance, buffs, cooldowns or marks. */
  reset() {
    this.heat = this.radiance = this.flow = this.resolve = 0;
    this.halo = 0;
    this.chain = [];
    this.buffs.clear();
    this.cds.clear();
    this.uses.clear();
    this.status.clear();
    this.absorbPool = 0;
    if (this.mote?.light) this.spells.returnLight(this.mote.light);
    this.mote = null;
    this.recompute();
  }

  // ---- lookups -----------------------------------------------------------------------
  get paths() {
    return this.player.paths;
  }
  x(k: string) {
    return this.passive.x[k] ?? 0;
  }
  has(k: string) {
    return (this.passive.x[k] ?? 0) > 0;
  }
  buff(k: string) {
    return (this.buffs.get(k)?.left ?? 0) > 0;
  }
  addBuff(k: string, sec: number, v?: number) {
    this.buffs.set(k, { left: sec * this.player.mods.duration, v });
  }
  get flowMax() {
    return 5 + this.x('flowMax');
  }

  /** Effect of a node, whether written or generic. */
  static effect(discId: string, n: TreeNode, pick?: number): NodeEffect {
    const d = DISC[discId];
    const name = n.type === 'choice' ? n.name.split('|')[pick ?? 0] : n.name;
    return PASSIVES[`${discId}:${name}`] ?? (d.fam === 'calling' ? { ...genericEffect(d.fam, discId + n.id, n.type), craft: true } : genericEffect(d.fam, discId + n.id, n.type));
  }
  static skill(discId: string, name: string): SkillDef | undefined {
    return SKILLS[`${discId}:${name}`];
  }

  /** Sum every learned passive (combat classes only while active). */
  recompute() {
    const P = this.paths;
    const m: Partial<Record<NumMod, number>> = {};
    const x: Record<string, number> = {};
    for (const d of DISCIPLINES) {
      if (!P.learned(d.id) || d.fam === 'calling') continue;
      if (d.fam === 'combat' && P.active !== d.id) continue;
      const t = treeOf(d);
      if (!t) continue;
      for (const [nid, v] of Object.entries(P.nodes[d.id])) {
        const n = t.map[nid];
        if (!n || n.type === 'active') continue;
        if (n.type === 'cap' && SKILLS[`${d.id}:${n.name}`]) continue;
        const e = SkillRuntime.effect(d.id, n, v.pick);
        if (e.craft) continue;
        for (const [k, val] of Object.entries(e.m ?? {})) m[k as NumMod] = (m[k as NumMod] ?? 0) + val;
        for (const [k, val] of Object.entries(e.x ?? {})) x[k] = (x[k] ?? 0) + val;
      }
    }
    this.passive = { m, x };
    if (this.flow > this.flowMax) this.flow = this.flowMax;
  }

  /** Where and at whom a skill aims. */
  aim(range: number): { target: Target | null; point: THREE.Vector3 } {
    const p = this.player;
    const t = p.lock?.alive && p.lock.center.distanceTo(p.center) <= range ? p.lock : p.aimTarget(range);
    const point = t ? t.position.clone() : p.pos.clone().addScaledVector(p.forward, Math.min(range, 8));
    return { target: t, point };
  }

  // ---- damage --------------------------------------------------------------------------
  /** Weapon damage the way the blade computes it (attributes, gear, passives). */
  weapon() {
    const p = this.player, w = p.equip.mainWeapon;
    return (w?.def.stats.damage ?? 10) * (1 + p.equip.bonus('damagePct')) * p.paths.meleePower(w?.def.stats.speed ?? 1) * p.mods.melee;
  }
  /** Spell damage: Heat adds 0.5% fire damage per point; Vow of Mercy turns holy damage off. */
  spell(base: number, school: 'fire' | 'wind' | 'holy') {
    if (school === 'holy' && this.has('vowMercy')) return 0;
    const x = school === 'fire' ? this.x('fireDmg') + this.heat * 0.005 : school === 'wind' ? this.x('windDmg') : this.x('holyDmg');
    return base * this.paths.spellPower * this.player.mods.spell * (1 + x);
  }
  private targetMult(t: Target, fire = false) {
    const s = this.status.get(t.id);
    let k = 1;
    if (s?.brand && s.brand > 0) k *= 1 + this.x('glare');
    if (s?.tether) k *= 1 + this.x('taut');
    if (s?.burn && s.burn.left > 0) {
      k *= 1 + this.x('char');
      if (fire) k *= 1 + this.x('accelerant');
    }
    return k;
  }
  /** Extra multiplier and forced crits for the player's own blade hits. */
  private meleeBonus(t: Target) {
    let crit = false;
    if (this.critNext > 0) {
      this.critNext--;
      crit = true;
    }
    return { mult: this.targetMult(t), crit };
  }

  hit(t: Target, amount: number, o: HitOpts = {}) {
    if (!t.alive || amount <= 0) return 0;
    const dir = o.dir ?? t.position.clone().sub(this.player.pos).setY(0).normalize();
    if (dir.lengthSq() < 1e-4) dir.copy(this.player.forward);
    const dmg = Math.max(1, Math.round(amount * this.targetMult(t, o.fire) * (o.crit ? 2 : 1) * (0.92 + Math.random() * 0.16)));
    if (o.stun) t.stunned = true;
    t.takeHit({ damage: dmg, poise: (o.poise ?? 20) * this.player.mods.poise, dir, at: t.center.clone(), crit: !!o.crit, source: o.source ?? 'spell' });
    events.emit('enemyHit', { at: t.center.clone(), amount: dmg, crit: !!o.crit, enemyId: t.id });
    if (!o.noVerdict) this.addVerdict(t);
    // Chains of Dawn: the others feel 30% of it.
    if (!o.chained && this.chain.includes(t)) {
      for (const c of this.chain) if (c !== t && c.alive) this.hit(c, dmg * 0.3, { poise: 0, chained: true, noVerdict: true, dir: o.dir });
    }
    return dmg;
  }

  /** Hit everything in a circle (optionally a forward cone). */
  area(center: THREE.Vector3, radius: number, amount: number, o: HitOpts & { cone?: { dir: THREE.Vector3; cos: number }; pull?: boolean; skip?: Set<number> } = {}) {
    const hitList: Target[] = [];
    for (const t of this.vfx.near(center, radius * this.player.mods.area)) {
      if (o.skip?.has(t.id)) continue;
      const to = t.position.clone().sub(center).setY(0);
      if (o.cone && to.lengthSq() > 0.04 && to.clone().normalize().dot(o.cone.dir) < o.cone.cos) continue;
      // Walls shelter what's behind them.
      if (!physics.lineOfSight(center.clone().setY(Math.max(center.y, this.player.pos.y + 0.9)), t.center, t.radius * 0.5)) continue;
      const dir = o.pull ? to.clone().negate().normalize() : to.lengthSq() > 1e-4 ? to.normalize() : this.player.forward;
      this.hit(t, amount, { ...o, dir });
      o.skip?.add(t.id);
      hitList.push(t);
    }
    return hitList;
  }

  /** Damage over time without knocking the enemy about (the killing tick still counts as a hit). */
  tick(t: Target, dmg: number) {
    if (!t.alive || dmg <= 0) return;
    const d = Math.max(1, Math.round(dmg));
    if (t.hp - d > 0) t.hp -= d;
    else t.takeHit({ damage: d, poise: 0, dir: new THREE.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'melee' });
    events.emit('enemyHit', { at: t.center.clone(), amount: d, crit: false, enemyId: t.id });
  }

  st(t: Target) {
    let s = this.status.get(t.id);
    if (!s) this.status.set(t.id, (s = { t }));
    return s;
  }
  burn(t: Target, stacks: number, dps = 5) {
    if (!t.alive) return;
    const s = this.st(t);
    const max = 5 + this.x('burnStacks');
    const time = (4 + this.x('burnTime')) * (this.has('everburn') ? 2 : 1) * this.player.mods.duration;
    const b = s.burn ?? { dps: 0, left: 0, stacks: 0, acc: 0 };
    b.stacks = Math.min(max, (b.left > 0 ? b.stacks : 0) + stacks);
    const controlled = this.buff('wildfire') && this.has('controlledBurn') ? 0.4 : 0;
    b.dps = this.spell(dps, 'fire') * (1 + this.x('burnDmg') + controlled);
    b.left = time;
    s.burn = b;
  }
  bleed(t: Target, dps: number) {
    const s = this.st(t);
    s.bleed = { dps, left: 4 * this.player.mods.duration, acc: 0 };
  }
  brand(t: Target, sec = 8) {
    const s = this.st(t);
    s.brand = this.has('unblinking') ? 1e9 : (sec + this.x('brandTime')) * this.player.mods.duration;
    if (this.x('brightEyes')) this.gainRadiance(this.x('brightEyes'));
    this.vfx.groundCircle(t.position, 'light', t.radius * 3 + 0.6, 1.2);
  }
  burning(t: Target) {
    return (this.status.get(t.id)?.burn?.left ?? 0) > 0;
  }
  branded(t: Target) {
    return (this.status.get(t.id)?.brand ?? 0) > 0;
  }
  statusOf(t: Target) {
    return this.status.get(t.id);
  }
  /** Each hit on a branded enemy lays a Verdict stack (up to 5, or 3 with Swift Justice). */
  addVerdict(t: Target, n = 1) {
    const s = this.status.get(t.id);
    if (!s?.brand || s.brand <= 0) return;
    const max = this.has('swiftJustice') ? 3 : 5;
    for (let i = 0; i < n; i++) {
      if ((s.verdict ?? 0) >= max) {
        this.gainRadiance(1);
        continue;
      }
      s.verdict = (s.verdict ?? 0) + 1;
      this.gainRadiance(2 + this.x('witness'));
      this.vfx.fx.add.spawn({ pos: t.center.clone().setY(t.center.y + (t.halfHeight ?? 0.5) + 0.5), spread: 1.2, count: 6 + s.verdict * 3, life: [0.3, 0.6], size: [0.18, 0.02], color: 0xfff6d0, color2: 0xffc050, jitter: 0.15 });
    }
  }

  // ---- class resources -------------------------------------------------------------------
  gainRadiance(n: number) {
    if (!this.paths.learned('lightbinder')) return;
    this.radiance = Math.min(100, this.radiance + n * (1 + this.x('radGain')));
  }
  /** Build Heat; reaching 100 overheats. */
  addHeat(n: number) {
    if (!this.paths.learned('pyromancer') || this.buff('overheat')) return;
    this.heat = Math.max(0, Math.min(100, this.heat + n));
    if (n > 0) this.heatIdle = 0;
    if (this.heat >= 100) this.overheat(true);
  }
  /** Spend Heat (venting, Firebrand, Flame Step). */
  spendHeat(n: number) {
    this.heat = Math.max(0, this.heat - n);
  }
  /** 100 Heat: you explode, and can't cast fire for 3 seconds. */
  overheat(hurt: boolean) {
    const p = this.player;
    this.heat = 0;
    this.buffs.set('overheat', { left: 3 });
    this.area(p.pos, 4, this.spell(25, 'fire'), { poise: 160, fire: true, noVerdict: true }).forEach((t) => this.burn(t, 2));
    this.vfx.burst(p.center, 'fire', 2.5, 8);
    this.vfx.ring(p.pos, 'fire', 10);
    p.onShake?.(0.5);
    if (hurt && !this.has('bloodOfFire')) p.takeDamage(p.maxHp * 0.12);
    if (this.has('redGiant')) {
      const at = p.pos.clone();
      this.vfx.groundCircle(at, 'fire', 8, 1);
      this.vfx.meteor(at, 'fire', 1.1, 0.8, () => {
        this.area(at, 4.5, this.spell(45, 'fire'), { poise: 200, fire: true, noVerdict: true }).forEach((t) => this.burn(t, 2));
        this.vfx.burst(at.clone().setY(at.y + 0.5), 'fire', 2.5, 9);
        this.vfx.ring(at, 'fire', 12);
        p.onShake?.(0.5);
      });
    }
    this.notify('You overheat!');
  }
  /** Afterglow: healing past full becomes a shield. */
  private onOverheal(n: number) {
    const cap = this.x('afterglow') * (this.has('unfading') ? 2 : 1);
    if (cap <= 0) return;
    const fresh = !(this.buff('shield') && this.absorbPool > 0);
    if (!fresh && this.absorbKind === 'ward') return; // an Oath Ward is already holding
    this.absorbPool = Math.min(cap, (fresh ? 0 : this.absorbPool) + n);
    this.absorbKind = 'barrier';
    this.buffs.set('shield', { left: 10 });
    if (fresh) this.vfx.bubble(() => this.player.pos, 'light', 1.1, () => this.buff('shield') && this.absorbPool > 0);
  }
  setCooldown(key: string, sec: number) {
    this.cds.set(key, sec);
  }
  tetherCount() {
    let n = 0;
    for (const s of this.status.values()) if (s.tether && s.tether.left > 0) n++;
    return n;
  }

  // ---- using skills ------------------------------------------------------------------
  /** Bar refs look like "skill:<discipline>:<nodeId>". */
  static parse(ref: string) {
    const [, disc, nid] = ref.split(':');
    const d = DISC[disc], n = d && treeOf(d)?.map[nid];
    return n ? { d, n, key: `${disc}:${n.name}`, def: SKILLS[`${disc}:${n.name}`] } : null;
  }

  cooldown(key: string) {
    return this.cds.get(key) ?? 0;
  }

  /** Why a skill can't be used right now (null when it can). */
  blocked(ref: string): string | null {
    const s = SkillRuntime.parse(ref);
    if (!s?.def) return 'That technique is not in the game yet';
    const P = this.paths, p = this.player, def = s.def;
    if (!this.rankOf(s.d.id, s.n.id)) return `You haven't learned ${s.n.name}`;
    if (s.d.fam === 'combat' && P.active !== s.d.id) return `${s.d.name} is not your active class`;
    if (p.dead) return 'You are dead';
    if (this.cooldown(s.key) > 0) return `${s.n.name} is recharging`;
    if (s.d.id === 'pyromancer' && this.buff('overheat')) return 'You are overheated';
    if (def.needHeat && this.heat < def.needHeat) return `Needs ${def.needHeat} Heat`;
    if (def.needShield && !p.equip.hasShield) return `${s.n.name} needs a shield`;
    if (def.stamina && p.stamina < def.stamina * p.mods.staminaCost * 0.5) return 'Not enough stamina';
    if (def.mana && p.mana < this.manaCost(def)) return 'Not enough mana';
    if (def.flow && this.flow < def.flow) return `Needs ${def.flow} Flow`;
    if (def.needTarget && !this.aim(def.needTarget).target) return 'No target in range';
    // Attack spells go where you lock on (middle mouse or Q), like Fireball.
    if ((def.action === 'sk_cast' || def.action === 'sk_castBig') && !def.freeAim) {
      const lock = p.lock;
      if (!lock?.alive) return 'Lock on to a target to cast this (middle mouse)';
      if (lock.center.distanceTo(p.center) > (def.range ?? def.needTarget ?? 22)) return 'Your target is out of range';
    }
    if (!p.canAct) return 'busy';
    return null;
  }
  /** Rank of a learned skill node (the class's core skill is always rank I). */
  rankOf(disc: string, nid: string) {
    if (nid === 'c') return this.paths.learned(disc) ? 1 : 0;
    return this.paths.node(disc, nid)?.r ?? 0;
  }
  manaCost(def: SkillDef) {
    return Math.round((def.mana ?? 0) * Math.max(0, this.player.mods.manaCost));
  }

  use(ref: string): string | null {
    const why = this.blocked(ref);
    if (why) return why;
    const s = SkillRuntime.parse(ref)!, def = s.def!, p = this.player;
    const rank = this.rankOf(s.d.id, s.n.id);
    const { target, point } = this.aim(def.range ?? def.needTarget ?? 14);
    const pend: Pending = { key: s.key, rank, target, point, n: 0, k: 1 };
    // Radiance empowers the spells that can take it.
    if (def.kindle && this.radiance >= 25) {
      this.radiance -= 25;
      pend.k = 1.5;
      this.vfx.burst(this.player.center, 'light', 0.6, 3);
    }
    if (def.action) {
      const tech = s.d.id === 'gale' ? 1 + this.x('techDmg') : 1;
      if (!p.startSkill(def.action, R(rank) * tech, def.action !== 'sk_dash')) return 'busy';
      this.pending = pend;
    } else if (def.now && def.now(this, pend) === false) return 'Nothing happens';
    // Pay.
    if (def.stamina) p.spendStamina(def.stamina * p.mods.staminaCost);
    p.mana -= this.manaCost(def);
    if (def.flow) this.flow -= def.flow;
    if (def.heat) this.addHeat(def.heat);
    const extra = def.charges && this.has(def.charges) ? 2 : 1;
    const used = (this.uses.get(s.key) ?? 0) + 1;
    if (used >= extra) {
      this.cds.set(s.key, def.cd);
      this.uses.set(s.key, 0);
    } else this.uses.set(s.key, used);
    events.emit('spellCast', { spell: s.key });
    return null;
  }

  private onEvent(name: string) {
    const p = this.pending;
    if (!p || !this.player.act) return;
    const def = SKILLS[p.key];
    // Tempest Crown: every spell calls lightning.
    if (name === 'cast' && this.buff('crown')) {
      const t = this.nearestEnemy(this.player.pos, 14);
      if (t) {
        this.vfx.lightning(this.player.center.setY(this.player.pos.y + 6), t.center, 'wind');
        this.hit(t, this.spell(30, 'wind'), { poise: 60 });
      }
    }
    def?.on?.(this, p, name);
    p.n++;
  }

  nearestEnemy(pos: THREE.Vector3, range: number, skip?: Set<number>) {
    let best: Target | null = null, bd = range;
    for (const t of targets) {
      if (!t.alive || skip?.has(t.id)) continue;
      const d = t.center.distanceTo(pos);
      if (d < bd) (bd = d), (best = t);
    }
    return best;
  }

  /** Blade tip, or a point in front of the chest. */
  hand(): THREE.Vector3 {
    const p = this.player, m = p.equip.model('main');
    if (m && m.userData.bladeTip !== undefined) return m.localToWorld(new THREE.Vector3(0, m.userData.bladeTip, 0));
    return p.center.addScaledVector(p.forward, 0.6).setY(p.pos.y + 1.4);
  }
  castFrom(): THREE.Vector3 {
    const p = this.player, h = p.char.bone('RightHand');
    const v = new THREE.Vector3();
    if (h) h.getWorldPosition(v);
    else v.copy(p.center);
    return v.addScaledVector(p.forward, 0.4);
  }
  aimDir(p: Pending, from: THREE.Vector3) {
    const to = p.target?.alive ? p.target.center.clone() : from.clone().addScaledVector(this.player.forward, 10).setY(from.y);
    return to.sub(from).normalize();
  }

  /** Shield bubbles: Oath Ward and Divine Barrier share one pool (the stronger wins). */
  shield(amount: number, sec: number, kind: 'ward' | 'barrier', style: Style) {
    if (amount < this.absorbPool && this.buff('shield')) return;
    this.absorbPool = amount;
    this.absorbKind = kind;
    this.addBuff('shield', sec);
    this.vfx.bubble(() => this.player.pos, style, 1.15, () => this.buff('shield') && this.absorbPool > 0);
  }

  // ---- defence hooks --------------------------------------------------------------------
  private defend(att: IncomingAttack, facing: number): DefenceResult | null {
    const { from, damage, onParried, parryable } = att;
    const p = this.player;
    // Halo Ward stops arrows and thrown things from any side.
    if (att.projectile && this.halo > 0 && this.buff('halo')) {
      this.halo--;
      this.gainRadiance(10);
      this.vfx.burst(att.at ?? p.center, 'light', 0.6, 3);
      this.vfx.ring(p.pos, 'light', 3);
      if (this.has('purity')) p.cleanse();
      if (this.has('mirrorHalo')) {
        const shooter = this.shooter(from);
        if (shooter) {
          const at = p.center;
          this.vfx.projectile({
            from: at, dir: shooter.center.clone().sub(at).normalize(), speed: 32, range: 45, style: 'light', shape: 'spear', size: 0.9, radius: 0.45,
            onHit: (t, _a, d) => this.hit(t, damage * 1.5, { poise: 60, dir: d, noVerdict: true }),
          });
        }
      }
      if (this.halo <= 0) this.buffs.delete('halo');
      return 'blocked';
    }
    if (this.buff('counter') && facing > -0.2 && parryable) {
      this.buffs.delete('counter');
      onParried?.();
      events.emit('parrySuccess', { at: p.center.clone() });
      this.vfx.ring(p.pos, 'steel', 4);
      this.vfx.slash(p.center, p.yaw, 1.3, 'gale');
      return 'parried';
    }
    if (this.buff('reflect') && facing > 0.2) {
      const t = this.nearestEnemy(from, 3.5);
      if (t) {
        this.hit(t, damage * 0.5, { poise: 40, source: 'melee' });
        this.vfx.burst(t.center, 'steel', 0.6, 4);
      }
    }
    return null;
  }

  /** The enemy most in line with where a shot came from. */
  private shooter(from: THREE.Vector3) {
    const p = this.player, dir = from.clone().sub(p.center).setY(0).normalize();
    let best: Target | null = null, bs = -1;
    for (const t of targets) {
      if (!t.alive) continue;
      const to = t.center.clone().sub(p.center).setY(0);
      const d = to.length();
      if (d > 45 || d < 0.5) continue;
      const s = to.divideScalar(d).dot(dir);
      if (s > 0.85 && s - d * 0.001 > bs) (bs = s - d * 0.001), (best = t);
    }
    return best;
  }

  private absorbDamage(d: number) {
    if (this.buff('invuln')) return 0;
    // Second Dawn: a hit worth over a quarter of your health is halved.
    if (this.buff('secondDawn') && d > this.player.maxHp * 0.25) {
      d *= 0.5;
      this.vfx.burst(this.player.center, 'light', 1, 5);
      this.vfx.ring(this.player.pos, 'light', 5);
      this.gainRadiance(10);
    }
    if (this.absorbPool <= 0 || !this.buff('shield')) return d;
    const took = Math.min(this.absorbPool, d);
    this.absorbPool -= took;
    this.vfx.burst(this.player.center, this.absorbKind === 'barrier' ? 'light' : 'steel', 0.4, 3);
    if (this.absorbPool <= 0) {
      this.buffs.delete('shield');
      if (this.absorbKind === 'ward' && this.x('wardHeal')) this.player.heal(this.x('wardHeal'));
    }
    return d - took;
  }

  private cheatDeath() {
    const p = this.player, now = this.time, c = this.cheat;
    if (this.has('phoenixCrest') && now - c.crest > 300) {
      c.crest = now;
      p.hp = p.maxHp * 0.4;
      this.vfx.burst(p.center, 'fire', 3, 9);
      this.vfx.ring(p.pos, 'fire', 12);
      this.area(p.pos, 4, this.spell(60, 'fire'), { poise: 200, fire: true });
      return true;
    }
    if (this.has('resWard') && now - c.res > 300) {
      c.res = now;
      p.hp = p.maxHp * 0.5;
      this.vfx.pillar(p.pos, 'light', 1.4);
      return true;
    }
    if (this.has('phoenixDown') && now - c.phoenix > 300 && this.paths.learned('pyromancer')) {
      c.phoenix = now;
      p.hp = p.maxHp * 0.3;
      this.vfx.burst(p.center, 'fire', 1.5, 6);
      this.buffs.delete('overheat');
      this.overheat(false);
      return true;
    }
    const cd = this.has('lastToFallFast') ? 60 : this.x('lastToFall');
    if (cd > 0 && now - c.last > cd) {
      c.last = now;
      p.hp = 1;
      this.vfx.ring(p.pos, 'steel', 6);
      return true;
    }
    return false;
  }

  // ---- reactions -------------------------------------------------------------------------
  private onMeleeHit(t: Target, amount: number, crit: boolean, action: string) {
    const P = this.paths;
    this.lastHitT = 0;
    if (P.active === 'gale') {
      this.flow = Math.min(this.flowMax, this.flow + 1 * (1 + this.x('resGain')));
      this.flowIdle = 0;
      if (this.has('eyeStorm') && this.flow >= this.flowMax && ++this.hits3 % 3 === 0) this.windBlade(this.hand(), this.player.forward, this.weapon() * 0.8, 1, false);
      if (action === 'slash3' && this.has('squall')) this.windBlade(this.hand(), this.player.forward, this.weapon() * 0.6, 0.8, false);
      if (action === 'slash3' && this.has('updraft')) this.hit(t, 1, { poise: 150, source: 'melee' });
    }
    if (crit && this.has('critBleed')) this.bleed(t, this.weapon() * 0.12);
    this.addVerdict(t);
    // Firebrand: each blade hit spends 5 Heat as extra fire.
    if (this.buff('firebrand') && this.heat >= 5 && !this.buff('overheat')) {
      this.spendHeat(5);
      const k = this.buffs.get('firebrand')?.v ?? 1;
      this.hit(t, this.spell(8, 'fire') * k, { poise: 10, fire: true, noVerdict: true, source: 'melee' });
      this.burn(t, 1);
      this.vfx.burst(t.center, 'fire', 0.4, 3);
      if (this.x('burningWill')) this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + this.x('burningWill'));
    }
    void amount;
  }

  private onParry(at: THREE.Vector3) {
    const p = this.player, P = this.paths;
    // Whoever you parried reels: stars circle their head while they're open to a riposte.
    const foe = this.nearestEnemy(at, 4);
    if (foe) this.dazed.push({ t: foe, left: 2.1 });
    if (P.active === 'boundary') this.gainResolve(15);
    if (this.buff('lparryWindow')) {
      const hit = new Set<number>();
      let from = p.center;
      for (let i = 0; i < 3; i++) {
        const t = this.nearestEnemy(from, 8, hit);
        if (!t) break;
        hit.add(t.id);
        this.vfx.lightning(from, t.center, 'gale');
        this.hit(t, this.weapon() * 0.8 * (this.buffs.get('lparryWindow')?.v ?? 1), { poise: 60 });
        from = t.center;
      }
    }
    if (this.buff('deflectWindow')) {
      this.gainResolve(25);
      p.stamina = Math.min(p.maxStamina, p.stamina + 20);
      this.area(p.pos, 2.6, this.weapon() * 0.3, { poise: 80, source: 'melee' });
      this.vfx.ring(p.pos, 'steel', 6);
    }
    if (P.active !== 'gale') return;
    const t = this.nearestEnemy(at, 4);
    if (this.x('parryStamina')) p.stamina = Math.min(p.maxStamina, p.stamina + this.x('parryStamina'));
    if (this.has('composure')) this.addBuff('composure', 4);
    if (this.has('pride')) {
      const b = this.buffs.get('pride');
      this.buffs.set('pride', { left: 20, v: Math.min(10, (b && b.left > 0 ? b.v ?? 0 : 0) + 1) });
    }
    if (this.has('guardCrush')) this.critNext = Math.max(this.critNext, 1);
    if (this.has('perfectCalm')) {
      p.heal(p.maxHp * 0.1);
      this.critNext = Math.max(this.critNext, 3);
      this.vfx.ring(p.pos, 'gale', 7);
    }
    if (t && this.has('disarm')) this.hit(t, 1, { poise: 200, stun: true, source: 'melee' });
    if (t && this.has('rebuke')) this.hit(t, this.weapon() * 0.5, { poise: 30, source: 'melee' });
  }

  private gainResolve(n: number) {
    this.resolve = Math.min(100, this.resolve + n * (1 + this.x('resGain')));
    this.resolveIdle = 0;
  }

  private onBlock() {
    if (this.paths.active !== 'boundary') return;
    this.gainResolve(8);
    if (this.has('fortress')) this.fortress = Math.min(5, this.fortress + 1);
    if (this.has('spikedRim')) {
      const t = this.nearestEnemy(this.player.center.addScaledVector(this.player.forward, 1.5), 3);
      if (t) this.hit(t, this.weapon() * 0.3, { poise: 10, source: 'melee' });
    }
  }

  private onHurt() {
    const p = this.player;
    if (this.paths.active === 'boundary') this.gainResolve(5);
    if (this.paths.active === 'gale' && this.has('mirrorGuard')) this.flow = Math.max(0, this.flow - 2);
    if (this.has('retaliate')) this.addBuff('retaliate', 3);
    if (this.has('secondWind') && p.hp < p.maxHp * 0.3 && this.time - this.secondWindAt > 60) {
      this.secondWindAt = this.time;
      p.healOverTime(60, 8);
      this.vfx.groundCircle(p.pos, 'light', 3, 1.5);
    }
  }

  private onKill(at: THREE.Vector3, id: number) {
    const s = this.status.get(id);
    this.status.delete(id);
    const burning = (s?.burn?.left ?? 0) > 0;
    if (this.paths.active === 'gale' && this.has('hurricane') && this.lastHitT < 0.5) {
      this.flow = Math.min(this.flowMax, this.flow + 1);
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 15);
    }
    if (burning && this.has('inferno')) {
      this.vfx.burst(at, 'fire', 1.5, 6);
      this.vfx.ring(at, 'fire', 7);
      this.area(at, 3, this.spell(20, 'fire'), { poise: 80, fire: true, noVerdict: true });
    }
    // Funeral Pyre: the burning dead keep burning.
    if (burning && this.buff('pyre')) {
      this.fireZone(at, 2, 5);
      this.vfx.pillar(at, 'fire', 0.6, 4);
      this.addHeat(10);
    }
    // Judgment Day: the Brand moves on.
    if (s?.brand && s.brand > 0 && this.has('judgmentDay')) {
      const next = this.nearestEnemy(at, 14);
      if (next) {
        const ns = this.st(next);
        ns.brand = s.brand;
        ns.verdict = Math.max(ns.verdict ?? 0, s.verdict ?? 0);
        this.vfx.lightning(at.clone().setY(at.y + 1), next.center, 'light');
        this.vfx.groundCircle(next.position, 'light', next.radius * 3 + 0.6, 1.2);
      }
    }
    this.chain = this.chain.filter((t) => t.alive);
  }

  private onFireballImpact(at: THREE.Vector3) {
    if (!this.paths.learned('pyromancer')) return;
    for (const t of this.vfx.near(at, 2.2)) this.burn(t, 1);
  }

  // ---- shared effects ------------------------------------------------------------------------
  windBlade(from: THREE.Vector3, dir: THREE.Vector3, dmg: number, size: number, pierce: boolean, range = 12, bleed = false) {
    const d = dir.clone().setY(0).normalize();
    this.vfx.projectile({
      from: from.clone().setY(this.player.pos.y + 1.0), dir: d, speed: 22, range, style: 'gale', shape: 'blade', size: 1.7 * size, pierce, radius: 0.8 * size,
      onHit: (t, _at, dd) => {
        this.hit(t, dmg, { poise: 35, dir: dd, source: 'melee' });
        if (bleed) this.bleed(t, dmg * 0.12);
      },
    });
  }

  fireZone(at: THREE.Vector3, radius: number, life: number) {
    this.vfx.zone({
      pos: at.clone(), radius, life, style: 'fire', every: 0.5, motes: 40,
      onTick: (z) => {
        for (const t of this.vfx.near(z.pos, z.radius)) {
          this.tick(t, this.spell(5, 'fire'));
          this.burn(t, 1);
        }
      },
    });
  }

  // ---- per step ------------------------------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    this.lastHitT += dt;
    const p = this.player, P = this.paths;
    for (const [k, v] of this.cds) if (v > 0) this.cds.set(k, Math.max(0, v - dt));
    for (const [k, b] of this.buffs) {
      b.left -= dt;
      if (b.left <= 0) this.buffs.delete(k);
    }
    this.timers = this.timers.filter((t) => {
      t.t -= dt;
      if (t.t <= 0) t.fn();
      return t.t > 0;
    });
    if (this.pending && !p.act) this.pending = null;

    // Resources.
    if (P.active !== 'gale') this.flow = 0;
    else {
      this.flowIdle += dt;
      if (this.flowIdle > 4 && !this.has('flowKeep') && !this.has('noBlock')) {
        this.flow = Math.max(0, this.flow - dt / 1.5);
      }
    }
    if (P.active !== 'boundary') this.resolve = 0;
    else {
      this.resolveIdle += dt;
      if (this.resolveIdle > 6) this.resolve = Math.max(0, this.resolve - dt * 3);
    }
    // Heat cools after 2 seconds without fire (never, with Pure Flame). Above 80 it burns you.
    if (!P.learned('pyromancer')) this.heat = 0;
    else {
      this.heatIdle += dt;
      if (this.heatIdle > 2 && !this.has('pureFlame')) this.heat = Math.max(0, this.heat - 8 * (1 + this.x('heatHaze')) * dt);
      if (this.heat > 80 && !p.dead) {
        if (!this.has('bloodOfFire')) p.hp = Math.max(1, p.hp - 3 * dt);
        if (Math.random() < dt * 20) this.vfx.fx.add.spawn({ pos: p.center, vel: new THREE.Vector3(0, 2, 0), spread: 1, count: 1, life: [0.3, 0.6], size: [0.25, 0.03], color: 0xffd080, color2: 0xff3000, jitter: 0.4 });
      }
      if (this.heat > 50 && this.has('hearthfire')) p.heal(dt);
    }
    // Radiance gathers slowly in daylight.
    if (!P.learned('lightbinder')) this.radiance = 0;
    else if (this.env().daylight) this.gainRadiance(dt);
    if (!this.buff('halo')) this.halo = 0;
    if (this.chain.length) {
      this.chainLeft -= dt;
      this.chain = this.chain.filter((t) => t.alive);
      if (this.chainLeft <= 0 || this.chain.length < 2) this.chain = [];
    }
    this.updateMote(dt);
    // Dazed by a parry: a little ring of gold sparks over the head.
    this.dazed = this.dazed.filter((d) => (d.left -= dt) > 0 && d.t.alive);
    for (const d of this.dazed) {
      const top = d.t.center.y + (d.t.halfHeight ?? 0.6) + 0.35;
      const a = this.time * 7;
      for (let i = 0; i < 2; i++) {
        const ang = a + i * Math.PI;
        this.vfx.fx.add.spawn({ pos: new THREE.Vector3(d.t.center.x + Math.cos(ang) * 0.38, top, d.t.center.z + Math.sin(ang) * 0.38), spread: 0.05, count: 1, life: [0.25, 0.35], size: [0.13, 0.02], color: 0xfff2b0, color2: 0xffb030 });
      }
    }
    // Wildfire: burns leap to anything close.
    if (this.buff('wildfire') && !this.has('controlledBurn')) {
      this.wildAcc += dt;
      const every = this.has('hungryFlame') ? 1 : 2;
      if (this.wildAcc >= every) {
        this.wildAcc -= every;
        const burning = [...this.status.values()].filter((s) => s.t.alive && (s.burn?.left ?? 0) > 0);
        for (const s of burning) {
          for (const t of this.vfx.near(s.t.position, 2 + s.t.radius)) {
            if (t === s.t || this.burning(t)) continue;
            this.burn(t, Math.max(1, Math.floor(s.burn!.stacks / 2)));
            this.vfx.lightning(s.t.center, t.center, 'fire');
          }
        }
      }
    } else this.wildAcc = 0;

    // Statuses.
    for (const [id, s] of this.status) {
      if (!s.t.alive) {
        this.status.delete(id);
        continue;
      }
      if (s.burn && s.burn.left > 0) {
        s.burn.left -= dt;
        s.burn.acc += dt;
        if (s.burn.acc >= 0.5) {
          s.burn.acc -= 0.5;
          this.tick(s.t, s.burn.dps * 0.5 * s.burn.stacks);
          if (this.has('fuel')) p.mana = Math.min(p.maxMana, p.mana + 1);
        }
        if (Math.random() < dt * 14) this.vfx.fx.add.spawn({ pos: s.t.center, spread: 1.2, count: 1, life: [0.3, 0.6], size: [0.25, 0.03], color: 0xffd080, color2: 0xff3000, upBias: 1.5, jitter: s.t.radius * 0.8 });
      }
      if (s.bleed && s.bleed.left > 0) {
        s.bleed.left -= dt;
        s.bleed.acc += dt;
        if (s.bleed.acc >= 0.5) {
          s.bleed.acc -= 0.5;
          this.tick(s.t, s.bleed.dps * 0.5);
          this.vfx.fx.add.spawn({ pos: s.t.center, spread: 2, count: 3, life: [0.3, 0.6], size: [0.06, 0.01], color: 0xc02010, color2: 0x400000, gravity: 9 });
        }
      }
      if (s.brand && s.brand > 0) {
        s.brand -= dt;
        if (s.brand <= 0) s.verdict = 0;
        // The mark burns brighter with each Verdict stack.
        const v = s.verdict ?? 0;
        if (Math.random() < dt * (6 + v * 5)) this.vfx.fx.add.spawn({ pos: s.t.center.clone().setY(s.t.center.y + (s.t.halfHeight ?? 0.5) + 0.4), spread: 0.4 + v * 0.15, count: 1, life: [0.4, 0.7], size: [0.14 + v * 0.05, 0.01], color: 0xfff6d0, color2: 0xffc050, jitter: 0.2 + v * 0.06 });
      }
      // Light Tether: stray too far and you're yanked back.
      if (s.tether) {
        const th = s.tether;
        th.left -= dt;
        th.cd -= dt;
        const off = s.t.position.clone().sub(th.at).setY(0);
        if (off.length() > 6 && th.cd <= 0) {
          th.cd = 0.8;
          this.hit(s.t, 1, { poise: 250, dir: off.normalize().negate(), noVerdict: true });
          this.vfx.burst(s.t.center, 'light', 0.5, 3);
        }
        if (th.left <= 0) s.tether = undefined;
      }
    }

    // Auras that tick.
    if (this.buff('immolation')) {
      const b = this.buffs.get('immolation')!;
      b.v = (b.v ?? 0) + dt;
      if (b.v >= 0.5) {
        b.v -= 0.5;
        for (const t of this.vfx.near(p.pos, 2.6 * p.mods.area)) this.tick(t, this.spell(6, 'fire'));
        if (this.has('rekindle')) p.heal(1);
      }
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        this.vfx.fx.add.spawn({ pos: p.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0.2, Math.sin(a) * 1.4)), vel: new THREE.Vector3(0, 2, 0), spread: 0.4, count: 1, life: [0.3, 0.6], size: [0.3, 0.03], color: 0xffd080, color2: 0xff3000 });
      }
    }
    if (this.buff('firebrand') || this.buff('blessed')) {
      const tip = this.hand(), fire = this.buff('firebrand');
      this.vfx.fx.add.spawn({ pos: tip, spread: 0.6, count: 1, life: [0.2, 0.4], size: [0.12, 0.01], color: fire ? 0xffd080 : 0xfff6d0, color2: fire ? 0xff3000 : 0xffc050, upBias: 1, jitter: 0.15 });
    }
    if (this.buff('haste') || this.buff('windwalk')) this.vfx.fx.add.spawn({ pos: p.pos.clone().setY(p.pos.y + 0.2), spread: 1, count: 1, life: [0.2, 0.4], size: [0.1, 0.01], color: 0xf2ffe0, color2: 0x7ac050, jitter: 0.3 });
    if (this.buff('cathedral')) {
      const b = this.buffs.get('cathedral')!;
      b.v = (b.v ?? 0) + dt;
      if (b.v >= 1) (b.v -= 1), p.heal(3);
    }
    // Gale Step and Bull Rush leave a trail.
    const a = p.act;
    if (a && (a.def.id === 'sk_galeStep' || a.def.id === 'sk_bullRush' || a.def.id === 'sk_cyclone')) {
      const st: Style = a.def.id === 'sk_bullRush' ? 'steel' : 'gale';
      this.vfx.fx.add.spawn({ pos: p.center, vel: p.forward.multiplyScalar(-3), spread: 1.5, count: 4, life: [0.2, 0.45], size: [0.16, 0.01], color: PALETTE[st].hot, color2: PALETTE[st].cool, jitter: 0.5 });
      if (a.def.id === 'sk_bullRush') this.vfx.fx.dust(p.pos, 0.3);
    }
    // Riding the Storm: every dodge shoves.
    if (a?.def.roll && a !== this.dodgeSeen) {
      this.dodgeSeen = a;
      if (this.has('stormDodge')) {
        this.area(p.pos, 2.6, this.spell(8, 'wind'), { poise: 110 });
        this.vfx.ring(p.pos, 'wind', 6);
      }
    }
    if (!a) this.dodgeSeen = null;

    this.vfx.update(dt);
    this.applyMods();
  }

  /** Mote of Light: heals you nearby, lights the dark, and (Lantern Cage) holds the first enemy that comes close. */
  placeMote(at: THREE.Vector3, life: number) {
    if (this.mote?.light) this.spells.returnLight(this.mote.light);
    const light = this.spells.borrowLight(this);
    if (light) {
      light.color.set(0xffe2a8);
      light.intensity = 14;
      light.distance = 14;
      light.position.copy(at);
    }
    const m = { pos: at.clone(), left: life, caged: false, acc: 0, light };
    this.mote = m;
    this.vfx.orb(() => m.pos, 'light', 0.7, () => this.mote === m);
    this.vfx.burst(at, 'light', 0.5, 3);
  }
  private updateMote(dt: number) {
    const m = this.mote, p = this.player;
    if (!m) return;
    m.left -= dt;
    if (m.left <= 0 || !this.paths.learned('lightbinder')) {
      if (m.light) this.spells.returnLight(m.light);
      this.mote = null;
      return;
    }
    if (m.light) m.light.position.copy(m.pos);
    m.acc += dt;
    if (m.acc >= 0.5) {
      m.acc -= 0.5;
      if (p.pos.distanceTo(m.pos) < 3.5 && p.hp < p.maxHp) {
        p.heal(0.75 * (1 + this.x('softLight')));
        this.gainRadiance(0.5);
      }
    }
    if (this.has('lanternCage') && !m.caged) {
      const t = this.vfx.near(m.pos.clone().setY(m.pos.y - 1.5), 1.6)[0];
      if (t) {
        m.caged = true;
        this.hit(t, 1, { poise: 220, stun: true, noVerdict: true });
        this.vfx.ring(t.position, 'light', 4);
        this.vfx.beam(() => m.pos, () => t.center, 'light', () => this.mote === m && t.alive && t.stunned);
      }
    }
  }

  /** Passives plus live conditions and buffs into the player's combat modifiers. */
  private applyMods() {
    const m: CombatMods = baseMods();
    for (const [k, v] of Object.entries(this.passive.m)) (m as unknown as Record<string, number>)[k] += v;
    const p = this.player;
    if (this.has('noBlock')) m.canBlock = false;
    if (this.has('slipstream') && this.flow >= 3) m.moveSpeed += 0.1;
    if (this.has('tailwind') && this.lastHitT < 1.5) m.dodgeCost -= 1;
    if (this.has('unyielding') && this.resolve >= 50) m.dmgTaken -= 0.15;
    if (this.has('emberShield') && this.buff('firebrand')) m.dmgTaken -= 0.15;
    if (this.has('deflectAir') && this.buff('windwall')) m.dmgTaken -= 0.2;
    if (this.buff('faithZone')) m.dmgTaken -= 0.2;
    if (this.has('graceFire') && p.hp < p.maxHp * 0.3) m.heal += 1;
    if (this.buff('halo')) m.dmgTaken -= this.x('steadfast');
    if (this.has('bindersOath') && (this.tetherCount() > 0 || this.chain.length > 0)) m.moveSpeed -= 0.15;
    if (this.buff('composure')) m.melee += 0.2;
    if (this.buff('retaliate')) m.melee += 0.1;
    const pride = this.buffs.get('pride');
    if (pride) m.melee += 0.03 * (pride.v ?? 0);
    if (this.buff('haste')) (m.moveSpeed += 0.3), (m.attackSpeed += 0.15);
    if (this.buff('windwalk')) (m.moveSpeed += 0.4), (m.dodgeCost -= 1);
    if (this.buff('sun')) m.manaCost = 0;
    if (this.buff('oathKept')) m.dmgTaken -= 0.5;
    if (this.buff('challenge')) m.dmgTaken -= 0.25;
    if (this.buff('reflect')) m.dmgTaken -= 0.6;
    if (this.buff('dome')) m.dmgTaken -= 0.3;
    if (this.buff('cathedral')) m.dmgTaken -= 0.4;
    if (this.buff('shieldWall')) {
      m.blockCost = 0;
      if (p.blocking) m.dmgTaken = 0;
    }
    m.dmgTaken = Math.max(0.05, m.dmgTaken);
    m.dodgeCost = Math.max(0, m.dodgeCost);
    m.blockCost = Math.max(0, m.blockCost);
    m.moveSpeed = Math.max(0.3, m.moveSpeed);
    p.mods = m;
  }

  /** Timed callback (meteor strikes, second hits). */
  later(sec: number, fn: () => void) {
    this.timers.push({ t: sec, fn });
  }

  /** HUD: the class resources in play right now (the active combat class's, plus Heat and Radiance once learned). */
  resources(): { name: string; value: number; max: number; kind: 'pips' | 'bar'; color: string; hot?: boolean }[] {
    const a = this.paths.active, out: ReturnType<SkillRuntime['resources']> = [];
    if (a === 'gale') out.push({ name: 'FLOW', value: this.flow, max: this.flowMax, kind: 'pips', color: '#6fd6c6' });
    if (a === 'boundary') out.push({ name: 'RESOLVE', value: this.resolve, max: 100, kind: 'bar', color: '#c9a55a' });
    if (this.paths.learned('pyromancer')) out.push({ name: this.buff('overheat') ? 'OVERHEAT' : 'HEAT', value: this.heat, max: 100, kind: 'bar', color: this.heat > 80 || this.buff('overheat') ? '#ff3b1f' : '#ff8a3a', hot: this.heat > 80 });
    if (this.paths.learned('lightbinder')) out.push({ name: 'RADIANCE', value: this.radiance, max: 100, kind: 'bar', color: '#ffd86a' });
    return out;
  }

  /** Spend Resolve if there's enough; returns whether it was spent. */
  spendResolve(n: number) {
    if (this.resolve < n) return false;
    this.resolve -= n;
    return true;
  }
  takeFortress() {
    const full = this.fortress >= 5;
    if (full) this.fortress = 0;
    return full;
  }
  clearCooldown(key: string) {
    this.cds.delete(key);
  }
}

// ======================================================================================
// The skills
// ======================================================================================
const cone = (rt: SkillRuntime, cos: number) => ({ dir: rt['player'].forward, cos });

export const SKILLS: Record<string, SkillDef> = {
  // ---- Gale Style ------------------------------------------------------------------------
  'gale:Gale Step': {
    action: 'sk_galeStep', cd: 4, stamina: 16,
    text: (r) => `Dash forward on the wind and cut through whatever stands in the way for ${pct(150 * R(r))}% weapon damage. You can't be hurt during the dash. Builds Flow.`,
    on: (rt, _p, ev) => ev === 'galeStep' && (rt.vfx.ring(rt['player'].pos, 'gale', 4), rt.vfx.burst(rt['player'].center, 'gale', 0.5, 4)),
  },
  'gale:Crescent Wind': {
    action: 'sk_crescent', cd: 6, stamina: 22,
    text: (r, rt) => `Spin twice, each turn cutting everything within 3 m for ${pct(100 * R(r))}% weapon damage and knocking small foes back.${rt?.has('vortex') ? ' Leaves a vortex for 2 seconds.' : ''}`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.area(pl.pos, 3, rt.weapon() * R(p.rank) * (rt.paths.active === 'gale' ? 1 + rt.x('techDmg') : 1), { poise: 45, source: 'melee' });
      rt.vfx.spinSlash(pl.pos, 2.6, 'gale');
      rt.vfx.ring(pl.pos, 'gale', 7);
      if (p.n === 1 && rt.has('vortex')) {
        rt.vfx.zone({ pos: pl.pos.clone(), radius: 2.2, life: 2, style: 'gale', every: 0.35, motes: 60, onTick: (z) => rt.area(z.pos, z.radius, rt.weapon() * 0.25, { poise: 10, source: 'melee' }) });
      }
    },
  },
  'gale:Cyclone': {
    action: 'sk_cyclone', cd: 10, stamina: 12, flow: 2,
    text: (r) => `Become a moving whirlwind for about 2 seconds, cutting everything within 2.4 m eight times for ${pct(45 * R(r))}% weapon damage each. Costs 2 Flow.`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.area(pl.pos, 2.4, rt.weapon() * 0.45 * R(p.rank) * (1 + rt.x('techDmg')), { poise: 20, source: 'melee' });
      rt.vfx.slash(pl.pos.clone().setY(pl.pos.y + 1), pl.yaw + p.n * 2.1, 2.2, 'gale', 1);
    },
  },
  'gale:Severing Arc': {
    action: 'sk_severingArc', cd: 1.5, stamina: 8, flow: 1,
    text: (r, rt) => `Swing a blade of wind that flies ${Math.round(12 * (1 + (rt?.x('arcRange') ?? 0)))} m for ${pct(130 * R(r))}% weapon damage.${rt?.has('twinArcs') ? ' Throws two.' : ''}${rt?.has('arcPierce') ? ' Passes through enemies.' : ''} Costs 1 Flow.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const dir = rt.aimDir(p, pl.center);
      const dmg = rt.weapon() * 1.3 * R(p.rank) * (1 + rt.x('techDmg'));
      const range = 12 * (1 + rt.x('arcRange'));
      const n = rt.has('twinArcs') ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), n > 1 ? (i - 0.5) * 0.25 : 0);
        rt.windBlade(pl.center, d, dmg, 1, rt.has('arcPierce'), range, rt.has('arcBleed'));
      }
    },
  },
  'gale:Moonlit Draw': {
    action: 'sk_moonlit', cd: 8, stamina: 20,
    text: (r, rt) => `Draw slowly, then release one enormous cut in front of you for ${pct(260 * R(r) * (rt?.has('heavyDraw') ? 1.4 : 1))}% weapon damage. It always staggers.${rt?.has('oneBreath') ? ' Always a critical hit.' : ''}`,
    on: (rt, p, ev) => {
      const pl = rt['player'];
      if (ev === 'moonlitCharge') {
        if (rt.has('quickdraw') && pl.act) pl.act.speed *= 1.4;
        rt.vfx.groundCircle(pl.pos, 'frost', 2.6, 1.6);
        return;
      }
      const dmg = rt.weapon() * 2.6 * R(p.rank) * (rt.has('heavyDraw') ? 1.4 : 1) * (1 + rt.x('techDmg'));
      rt.area(pl.pos, 3.8, dmg, { poise: 170, cone: cone(rt, 0.35), crit: rt.has('oneBreath'), source: 'melee' });
      rt.vfx.slash(pl.center.addScaledVector(pl.forward, 0.6), pl.yaw, 3.2, 'frost', 0.6, 0.3);
      rt.vfx.slash(pl.center.addScaledVector(pl.forward, 0.6), pl.yaw, 2.6, 'gale', 0.5, -0.2);
      rt.vfx.burst(pl.center.addScaledVector(pl.forward, 2), 'frost', 1, 6);
      pl.onShake?.(0.45);
      pl.onHitStop?.(0.12);
    },
  },
  'gale:Razor Gale': {
    action: 'sk_razorGale', cd: 10, stamina: 26, flow: 1,
    text: (r) => `A three-strike storm of cuts, each hitting everything in front of you for ${pct(90 * R(r))}% weapon damage; the last one throws a blade of wind. Costs 1 Flow.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const dmg = rt.weapon() * 0.9 * R(p.rank) * (1 + rt.x('techDmg'));
      rt.area(pl.pos, 3.2, dmg, { poise: 40, cone: cone(rt, 0.2), source: 'melee' });
      rt.vfx.slash(pl.center.addScaledVector(pl.forward, 0.5), pl.yaw + (p.n - 1) * 0.5, 2.4, 'gale', 0.7, (p.n - 1) * 0.4);
      if (p.n === 2) rt.windBlade(pl.center, pl.forward, dmg, 1.2, true);
    },
  },
  'gale:Counterstance': {
    action: 'sk_counter', cd: 7, stamina: 8,
    text: (r) => `Settle into a stance for ${(2.5 * R(r)).toFixed(1)} seconds: the next blow that reaches you from the front is parried automatically, shield or not.`,
    on: (rt, p) => {
      rt.addBuff('counter', 2.5 * R(p.rank));
      rt.vfx.groundCircle(rt['player'].pos, 'steel', 2.4, 2.5 * R(p.rank));
    },
  },
  'gale:Riposte': {
    action: 'sk_riposte', cd: 3, stamina: 12,
    text: (r) => `A lunging thrust for ${pct(170 * R(r))}% weapon damage. Against a staggered or parried enemy it is a critical hit and returns 2 Flow.`,
    on: (rt) => {
      const pl = rt['player'];
      const t = pl.aimTarget(4);
      if (t?.stunned) rt.flow = Math.min(rt.flowMax, rt.flow + 2);
      rt.vfx.slash(pl.center.addScaledVector(pl.forward, 0.8), pl.yaw, 1.6, 'gale', 0.3);
    },
  },
  'gale:Lightning Parry': {
    action: 'sk_lparry', cd: 6, stamina: 8,
    text: (r) => `A parry charged with storm. If it catches a blow, lightning leaps to up to three enemies for ${pct(80 * R(r))}% weapon damage each.`,
    on: (rt, p) => {
      rt.addBuff('lparryWindow', 0.7, R(p.rank));
      rt.vfx.burst(rt.hand(), 'gale', 0.4, 2);
    },
  },
  'gale:Thousand Cuts': {
    action: 'sk_thousandCuts', cd: 45, stamina: 30, flow: 5, needTarget: 6,
    text: (r) => `Spend all 5 Flow to vanish into eight lightning-fast cuts on your target, each for ${pct(70 * R(r))}% weapon damage. You can't be hurt while cutting.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const t = p.target?.alive ? p.target : pl.aimTarget(6);
      if (!t) return;
      rt.hit(t, rt.weapon() * 0.7 * R(p.rank), { poise: 30, source: 'melee', crit: p.n === 7 });
      rt.vfx.slash(t.center, Math.random() * 6.28, 1.4 + t.radius, p.n % 2 ? 'gale' : 'frost', 0.4, (Math.random() - 0.5) * 1.5);
      pl.onHitStop?.(0.05);
    },
  },

  // ---- Boundary Style ------------------------------------------------------------------------
  'boundary:Shield Wall': {
    action: 'sk_guardUp', cd: 14, stamina: 10, needShield: true,
    text: (r) => `For ${(4 * R(r)).toFixed(1)} seconds blocking costs no stamina and nothing gets through your shield.`,
    on: (rt, p) => {
      rt.addBuff('shieldWall', 4 * R(p.rank));
      rt.vfx.ring(rt['player'].pos, 'steel', 5);
      rt.vfx.groundCircle(rt['player'].pos, 'steel', 2.6, 4 * R(p.rank));
    },
  },
  'boundary:Deflect': {
    action: 'sk_deflect', cd: 5, stamina: 6,
    text: () => 'A long, forgiving parry. If it catches a blow you gain 25 Resolve and 20 stamina, and the shockwave shoves everyone around you back.',
    on: (rt) => rt.addBuff('deflectWindow', 0.7),
  },
  'boundary:Reflecting Wall': {
    action: 'sk_guardUp', cd: 16, stamina: 12, needShield: true,
    text: (r) => `For ${(5 * R(r)).toFixed(1)} seconds take 60% less damage, and half of every blow from the front is thrown back at the attacker.`,
    on: (rt, p) => {
      rt.addBuff('reflect', 5 * R(p.rank));
      rt.vfx.bubble(() => rt['player'].pos, 'steel', 1.2, () => rt.buff('reflect'));
    },
  },
  'boundary:Shield Bash': {
    action: 'sk_bash', cd: 4, stamina: 14,
    text: (r) => `Drive your shield (or shoulder) into everything in front of you for ${pct(90 * R(r))}% weapon damage and a heavy stagger. Spends 30 Resolve, if you have it, to hit twice as hard.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const boost = rt.spendResolve(30) ? 2 : 1;
      const dmg = rt.weapon() * 0.9 * R(p.rank) * (1 + rt.x('bashDmg')) * boost;
      rt.area(pl.pos.clone().addScaledVector(pl.forward, 0.6), 2.2, dmg, { poise: 180 * (1 + rt.x('bashPoise')), cone: cone(rt, 0.3), source: 'melee' });
      rt.vfx.burst(pl.center.addScaledVector(pl.forward, 1), 'steel', boost, 4);
      rt.vfx.ring(pl.pos.clone().addScaledVector(pl.forward, 1), 'steel', 3);
      pl.onShake?.(0.3);
      if (rt.takeFortress()) quake(rt, p.rank, 1.2);
    },
  },
  'boundary:Bull Rush': {
    action: 'sk_bullRush', cd: 8, stamina: 20, charges: 'unstoppable',
    text: (r) => `Charge about 7 m, trampling everything in your path for ${pct(110 * R(r))}% weapon damage and knocking it aside.`,
    on: (rt, p) => {
      const pl = rt['player'];
      if (p.n === 0) {
        (p as Pending & { hit?: Set<number> }).hit = new Set();
        if (rt.has('unstoppable')) rt.addBuff('invuln', 1.2);
        if (rt.has('ram')) rt.clearCooldown('boundary:Shield Bash');
      }
      const skip = (p as Pending & { hit?: Set<number> }).hit!;
      rt.area(pl.pos.clone().addScaledVector(pl.forward, 0.5), 1.5, rt.weapon() * 1.1 * R(p.rank) * (1 + rt.x('rushDmg')), { poise: 150, stun: rt.has('rushStun'), skip, source: 'melee' });
    },
  },
  'boundary:Earthshaker': {
    action: 'sk_quake', cd: 10, stamina: 24,
    text: (r, rt) => `Slam the ground: everything within ${(4 * (1 + (rt?.x('quakeArea') ?? 0))).toFixed(1)} m takes ${pct(150 * R(r) * (1 + (rt?.x('quakeDmg') ?? 0)))}% weapon damage and is thrown off its feet.`,
    on: (rt, p) => quake(rt, p.rank, 1),
  },
  'boundary:Challenge': {
    action: 'sk_warcry', cd: 18, stamina: 10,
    text: (r) => `Roar a challenge. Every enemy within 10 m flinches, you gain 12 Resolve for each, and you take 25% less damage for ${(6 * R(r)).toFixed(0)} seconds.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const foes = rt.vfx.near(pl.pos, 10);
      for (const t of foes) rt.hit(t, 1, { poise: 30 });
      rt.resolve = Math.min(100, rt.resolve + 12 * foes.length);
      rt.addBuff('challenge', 6 * R(p.rank));
      rt.vfx.ring(pl.pos, 'blood', 16);
      rt.vfx.burst(pl.center, 'blood', 0.8, 5);
      pl.onShake?.(0.25);
    },
  },
  'boundary:Oath Ward': {
    action: 'sk_vow', cd: 20, stamina: 15,
    text: (r, rt) => `Swear an oath: a ward absorbs the next ${Math.round((40 + 20 * r) * (1 + (rt?.x('wardAbsorb') ?? 0)))} damage for 10 seconds.`,
    on: (rt, p) => rt.shield((40 + 20 * p.rank) * (1 + rt.x('wardAbsorb')), 10, 'ward', 'steel'),
  },
  'boundary:Rallying Cry': {
    action: 'sk_vow', cd: 25, stamina: 10,
    text: (r, rt) => `Heal ${pct((15 + 5 * r) * (1 + (rt?.x('rallyHeal') ?? 0)))}% of your health, recover 40 stamina and put out any burns.${rt?.has('beacon') ? ' Also restores 30 mana.' : ''}`,
    on: (rt, p) => {
      const pl = rt['player'];
      pl.heal(pl.maxHp * ((15 + 5 * p.rank) / 100) * (1 + rt.x('rallyHeal')));
      pl.stamina = Math.min(pl.maxStamina, pl.stamina + 40);
      if (rt.has('beacon')) pl.mana = Math.min(pl.maxMana, pl.mana + 30);
      pl.cleanse();
      rt.vfx.ring(pl.pos, 'light', 8);
      rt.vfx.burst(pl.center, 'light', 0.8, 4);
    },
  },
  'boundary:The Oath Kept': {
    action: 'sk_vow', cd: 60, stamina: 20,
    text: (r) => `For ${(10 * R(r)).toFixed(0)} seconds take half damage from everything.`,
    on: (rt, p) => {
      rt.addBuff('oathKept', 10 * R(p.rank));
      rt.vfx.bubble(() => rt['player'].pos, 'light', 1.3, () => rt.buff('oathKept'));
      rt.vfx.pillar(rt['player'].pos, 'light', 1.2, 6);
    },
  },

  // ---- Windcaller ---------------------------------------------------------------------------------
  'windcaller:Gust': {
    action: 'sk_cast', cd: 3, mana: 14,
    text: (r, rt) => `A blast of wind throws everything in a ${(6 * (1 + (rt?.x('gustRange') ?? 0))).toFixed(0)} m cone in front of you away, for ${Math.round(15 * R(r))} damage.`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.area(pl.pos, 6 * (1 + rt.x('gustRange')), rt.spell(15, 'wind') * R(p.rank), { poise: 150 * (1 + rt.x('gustPoise')), cone: cone(rt, 0.5) });
      for (let i = 0; i < 30; i++) rt.vfx.fx.add.spawn({ pos: pl.center.addScaledVector(pl.forward, 0.8), vel: pl.forward.multiplyScalar(14).add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 6)), spread: 1, count: 1, life: [0.3, 0.5], size: [0.2, 0.02], color: 0xf2ffe0, color2: 0x7ac050, drag: 2 });
      rt.vfx.slash(pl.center.addScaledVector(pl.forward, 1.2), pl.yaw, 2.4, 'wind', 0.5);
    },
  },
  'windcaller:Updraft': {
    action: 'sk_cast', cd: 6, mana: 18, needTarget: 16,
    text: (r, rt) => `A spiral of wind lifts your target for ${Math.round(26 * R(r))} damage and a huge stagger.${rt?.has('downburst') ? ' Then slams it down for 60% more.' : ''}${rt?.has('lift') ? ' Lifts everything near it.' : ''}`,
    on: (rt, p) => {
      const t = p.target;
      if (!t?.alive) return;
      const dmg = rt.spell(26, 'wind') * R(p.rank);
      const list = rt.has('lift') ? rt.vfx.near(t.position, 3) : [t];
      for (const e of list) rt.hit(e, dmg, { poise: 220, dir: new THREE.Vector3(0, 0, 0.01) });
      for (let i = 0; i < 40; i++) {
        const a = i * 0.5;
        rt.vfx.fx.add.spawn({ pos: t.position.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, i * 0.07, Math.sin(a) * 0.9)), vel: new THREE.Vector3(0, 5, 0), spread: 0.5, count: 1, life: [0.3, 0.6], size: [0.14, 0.01], color: 0xf2ffe0, color2: 0x7ac050 });
      }
      rt.vfx.ring(t.position, 'wind', 4);
      if (rt.has('downburst')) rt.later(0.7, () => list.forEach((e) => e.alive && (rt.hit(e, dmg * 0.6, { poise: 60 }), rt.vfx.ring(e.position, 'wind', 5))));
    },
  },
  'windcaller:Cyclone Bolt': {
    action: 'sk_cast', cd: 8, mana: 24,
    text: (r, rt) => `Loose a small tornado that wanders forward for ${(3 * (1 + (rt?.x('boltTime') ?? 0))).toFixed(1)} seconds, cutting everything it touches for ${Math.round(9 * R(r) * (1 + (rt?.x('boltDmg') ?? 0)))} damage several times a second.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const dir = rt.aimDir(p, pl.center).setY(0).normalize();
      rt.vfx.projectile({
        from: pl.pos.clone().addScaledVector(dir, 1.2), dir, speed: 5, range: 15 * (1 + rt.x('boltTime')), style: 'wind', shape: 'tornado', size: 0.9, rehit: 0.35, radius: 1.3,
        onHit: (t, _at, d) => rt.hit(t, rt.spell(9, 'wind') * R(p.rank) * (1 + rt.x('boltDmg')), { poise: 30, dir: d }),
      });
    },
  },
  'windcaller:Haste': {
    action: 'sk_castSelf', cd: 20, mana: 16,
    text: (r, rt) => `For ${(8 * R(r) * (1 + (rt?.x('hasteTime') ?? 0))).toFixed(0)} seconds move 30% faster and attack 15% faster.`,
    on: (rt, p) => {
      rt.addBuff('haste', 8 * R(p.rank) * (1 + rt.x('hasteTime')));
      rt.vfx.ring(rt['player'].pos, 'wind', 5);
    },
  },
  'windcaller:Blink': {
    cd: 5, mana: 12, charges: 'doubleBlink',
    text: (r, rt) => `Vanish and reappear ${(7 * (rt?.has('longBlink') ? 1.6 : 1)).toFixed(0)} m ahead in an instant, stopping short of walls.${rt?.has('skyDash') ? ' Restores 20 stamina.' : ''}`,
    now: (rt) => {
      const pl = rt['player'];
      if (!pl.canAct) return false;
      const dist = 7 * (rt.has('longBlink') ? 1.6 : 1);
      const dir = pl.forward;
      const from = pl.center;
      const wall = physics.castRay(from, dir, dist + 0.6);
      const go = wall === null ? dist : Math.max(0, wall - 0.7);
      if (go < 0.5) return false;
      rt.vfx.burst(pl.center, 'wind', 0.8, 4);
      const to = pl.pos.clone().addScaledVector(dir, go);
      to.y += 0.3;
      pl.teleport(to);
      rt.vfx.burst(pl.center, 'wind', 0.8, 4);
      rt.vfx.ring(pl.pos, 'wind', 3);
      if (rt.has('skyDash')) pl.stamina = Math.min(pl.maxStamina, pl.stamina + 20);
    },
  },
  'windcaller:Wind Walk': {
    cd: 20, mana: 18,
    text: (r, rt) => `For ${(5 * R(r) + (rt?.x('jetstream') ?? 0)).toFixed(0)} seconds move 40% faster and dodge for free.`,
    now: (rt, p) => {
      rt.addBuff('windwalk', 5 * R(p.rank) + rt.x('jetstream'));
      rt.vfx.ring(rt['player'].pos, 'wind', 5);
      rt.vfx.burst(rt['player'].center, 'wind', 0.6, 3);
    },
  },
  'windcaller:Wind Wall': {
    action: 'sk_cast', cd: 14, mana: 22,
    text: (r) => `Raise a 5 m wall of wind in front of you for ${(6 * R(r)).toFixed(0)} seconds. Anything that tries to cross it is thrown back and cut for ${Math.round(4 * R(r))} damage.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const at = pl.pos.clone().addScaledVector(pl.forward, 2.5);
      const life = 6 * R(p.rank) * pl.mods.duration;
      const side = new THREE.Vector3(pl.forward.z, 0, -pl.forward.x);
      rt.vfx.wall(at, pl.yaw, 5, 3, 'wind', life);
      rt.addBuff('windwall', life);
      const f = pl.forward.clone();
      rt.vfx.zone({
        pos: at, radius: 2.6, life, style: 'wind', every: 0.25, motes: 0, circle: false,
        onTick: (z) => {
          for (const t of rt.vfx.near(z.pos, 2.6)) {
            const rel = t.position.clone().sub(z.pos);
            if (Math.abs(rel.dot(side)) > 2.6 || Math.abs(rel.dot(f)) > 1.2) continue;
            const away = rel.dot(f) >= 0 ? f.clone() : f.clone().negate();
            rt.hit(t, rt.spell(4, 'wind') * R(p.rank), { poise: 90, dir: away });
          }
        },
      });
    },
  },
  'windcaller:Vacuum': {
    action: 'sk_cast', cd: 10, mana: 26, range: 14,
    text: (r, rt) => `Tear the air out of a spot: everything within 5 m is dragged into the middle for ${Math.round(20 * R(r) * (rt?.has('suffocate') ? 1.6 : 1))} damage.${rt?.has('crush') ? ' They are left open to a critical hit.' : ''}`,
    on: (rt, p) => {
      const at = p.target?.alive ? p.target.position.clone() : p.point.clone();
      for (let i = 0; i < 50; i++) {
        const a = Math.random() * 6.28, r = 3 + Math.random() * 2;
        const from = at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3 + Math.random() * 1.5, Math.sin(a) * r));
        rt.vfx.fx.add.spawn({ pos: from, vel: at.clone().setY(at.y + 0.8).sub(from).multiplyScalar(2.5), spread: 0.2, count: 1, life: [0.35, 0.4], size: [0.12, 0.01], color: 0xf2ffe0, color2: 0x7ac050 });
      }
      rt.later(0.3, () => {
        rt.area(at, 5, rt.spell(20, 'wind') * R(p.rank) * (rt.has('suffocate') ? 1.6 : 1), { poise: 160, pull: true, stun: rt.has('crush') });
        rt.vfx.ring(at, 'wind', 10);
      });
    },
  },
  'windcaller:Pressure Dome': {
    action: 'sk_castBig', cd: 20, mana: 30,
    text: (r, rt) => `A dome of pressure surrounds you for ${(6 * R(r) + (rt?.x('domeTime') ?? 0)).toFixed(0)} seconds: you take 30% less damage and enemies inside are shoved out.${rt?.x('domeHeal') ? ' Heals you 3 health a second.' : ''}`,
    on: (rt, p) => {
      const pl = rt['player'];
      const life = (6 * R(p.rank) + rt.x('domeTime')) * pl.mods.duration;
      rt.addBuff('dome', life);
      rt.vfx.bubble(() => pl.pos, 'wind', 3.2, () => rt.buff('dome'));
      rt.vfx.zone({
        pos: pl.pos.clone(), follow: () => pl.pos, radius: 3.2, life, style: 'wind', every: 0.4, motes: 10, circle: false,
        onTick: (z) => {
          rt.area(z.pos, z.radius, rt.spell(5, 'wind'), { poise: 90 });
          if (rt.x('domeHeal')) pl.heal(rt.x('domeHeal') * 0.4);
        },
      });
    },
  },
  'windcaller:Tempest Crown': {
    action: 'sk_castBig', cd: 60, mana: 40,
    text: (r) => `For ${(10 * R(r)).toFixed(0)} seconds every spell you cast also calls lightning down on the nearest enemy.`,
    on: (rt, p) => {
      rt.addBuff('crown', 10 * R(p.rank));
      rt.vfx.ring(rt['player'].pos, 'wind', 10);
    },
  },
  'windcaller:Eye of Heaven': {
    action: 'sk_castBig', cd: 45, mana: 50,
    text: (r) => `Open the sky: a hurricane nova throws everything within 8 m away for ${Math.round(60 * R(r))} damage.`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.area(pl.pos, 8, rt.spell(60, 'wind') * R(p.rank), { poise: 260 });
      rt.vfx.ring(pl.pos, 'wind', 18);
      rt.vfx.spinSlash(pl.pos, 6, 'wind');
      pl.onShake?.(0.5);
    },
  },
  ...FIRE_SKILLS,
  ...LIGHT_SKILLS,
};

function quake(rt: SkillRuntime, rank: number, mult: number) {
  const pl = rt['player'];
  const at = pl.pos.clone().addScaledVector(pl.forward, 1.2);
  const r = 4 * (1 + rt.x('quakeArea'));
  rt.area(at, r, rt.weapon() * 1.5 * R(rank) * (1 + rt.x('quakeDmg')) * mult, { poise: 130, source: 'melee' });
  rt.vfx.ring(at, 'steel', r * 2.6);
  rt.vfx.ring(at, 'steel', r * 1.6);
  rt.vfx.fx.dust(at, 5);
  rt.vfx.burst(at.clone().setY(at.y + 0.3), 'steel', 1, 6);
  pl.onShake?.(0.55);
  pl.onHitStop?.(0.08);
}
