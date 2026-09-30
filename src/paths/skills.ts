import * as THREE from 'three';
import '../combat/skillActions';
import { events } from '../core/events';
import { baseMods, type CombatMods } from '../combat/mods';
import { targets, type Target } from '../combat/targets';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Spells } from '../magic/spells';
import type { Style } from '../magic/circles';
import { DISC, DISCIPLINES } from './data';
import { treeOf, type TreeNode } from './paths';
import { PASSIVES, genericEffect, type NodeEffect, type NumMod } from './effects';
import { SkillFx, PALETTE } from './skillFx';

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
  text: (r: number, rt: SkillRuntime) => string;
  on?: (rt: SkillRuntime, p: Pending, ev: string) => void;
  /** instant skills */
  now?: (rt: SkillRuntime, p: Pending) => boolean | void;
}

const R = (r: number) => 1 + 0.15 * (r - 1);
const pct = (v: number) => `${Math.round(v)}`;

type Status = { t: Target; burn?: { dps: number; left: number; stacks: number; acc: number }; bleed?: { dps: number; left: number; acc: number }; brand?: number };
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

  constructor(scene: THREE.Scene, private player: Player, fx: FX, private spells: Spells) {
    this.vfx = new SkillFx(scene, fx);
    player.onSkillEvent = (n) => this.onEvent(n);
    player.defend = (att, facing) => this.defend(att.from, att.damage, facing, att.onParried, att.parryable);
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
  spell(base: number, school: 'fire' | 'wind' | 'holy') {
    const x = school === 'fire' ? this.x('fireDmg') + (this.buff('sun') ? 0.3 : 0) : school === 'wind' ? this.x('windDmg') : this.x('holyDmg');
    return base * this.paths.spellPower * this.player.mods.spell * (1 + x);
  }
  private targetMult(t: Target, fire = false) {
    const s = this.status.get(t.id);
    let k = 1;
    if (s?.brand && s.brand > 0) k *= this.has('verdict') ? 1.4 : 1.25;
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

  hit(t: Target, amount: number, o: { poise?: number; dir?: THREE.Vector3; fire?: boolean; crit?: boolean; source?: 'melee' | 'spell'; stun?: boolean } = {}) {
    if (!t.alive) return 0;
    const dir = o.dir ?? t.position.clone().sub(this.player.pos).setY(0).normalize();
    if (dir.lengthSq() < 1e-4) dir.copy(this.player.forward);
    const dmg = Math.max(1, Math.round(amount * this.targetMult(t, o.fire) * (o.crit ? 2 : 1) * (0.92 + Math.random() * 0.16)));
    if (o.stun) t.stunned = true;
    t.takeHit({ damage: dmg, poise: (o.poise ?? 20) * this.player.mods.poise, dir, at: t.center.clone(), crit: !!o.crit, source: o.source ?? 'spell' });
    events.emit('enemyHit', { at: t.center.clone(), amount: dmg, crit: !!o.crit, enemyId: t.id });
    return dmg;
  }

  /** Hit everything in a circle (optionally a forward cone). */
  area(center: THREE.Vector3, radius: number, amount: number, o: { poise?: number; cone?: { dir: THREE.Vector3; cos: number }; pull?: boolean; fire?: boolean; crit?: boolean; source?: 'melee' | 'spell'; stun?: boolean; skip?: Set<number> } = {}) {
    const hitList: Target[] = [];
    for (const t of this.vfx.near(center, radius * this.player.mods.area)) {
      if (o.skip?.has(t.id)) continue;
      const to = t.position.clone().sub(center).setY(0);
      if (o.cone && to.lengthSq() > 0.04 && to.clone().normalize().dot(o.cone.dir) < o.cone.cos) continue;
      const dir = o.pull ? to.clone().negate().normalize() : to.lengthSq() > 1e-4 ? to.normalize() : this.player.forward;
      this.hit(t, amount, { ...o, dir });
      o.skip?.add(t.id);
      hitList.push(t);
    }
    return hitList;
  }

  /** Damage over time without knocking the enemy about (the killing tick still counts as a hit). */
  private tick(t: Target, dmg: number) {
    if (!t.alive || dmg <= 0) return;
    const d = Math.max(1, Math.round(dmg));
    if (t.hp - d > 0) t.hp -= d;
    else t.takeHit({ damage: d, poise: 0, dir: new THREE.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'melee' });
    events.emit('enemyHit', { at: t.center.clone(), amount: d, crit: false, enemyId: t.id });
  }

  private st(t: Target) {
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
    b.dps = this.spell(dps, 'fire') * (1 + this.x('burnDmg'));
    b.left = time;
    s.burn = b;
  }
  bleed(t: Target, dps: number) {
    const s = this.st(t);
    s.bleed = { dps, left: 4 * this.player.mods.duration, acc: 0 };
  }
  brand(t: Target, sec = 8) {
    this.st(t).brand = sec * this.player.mods.duration;
    this.vfx.groundCircle(t.position, 'light', t.radius * 3 + 0.6, 1.2);
  }
  burning(t: Target) {
    return (this.status.get(t.id)?.burn?.left ?? 0) > 0;
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
    const v = P.node(s.d.id, s.n.id);
    if (!v) return `You haven't learned ${s.n.name}`;
    if (s.d.fam === 'combat' && P.active !== s.d.id) return `${s.d.name} is not your active class`;
    if (p.dead) return 'You are dead';
    if (this.cooldown(s.key) > 0) return `${s.n.name} is recharging`;
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
  manaCost(def: SkillDef) {
    return Math.round((def.mana ?? 0) * Math.max(0, this.player.mods.manaCost));
  }

  use(ref: string): string | null {
    const why = this.blocked(ref);
    if (why) return why;
    const s = SkillRuntime.parse(ref)!, def = s.def!, p = this.player;
    const rank = this.paths.node(s.d.id, s.n.id)!.r;
    const { target, point } = this.aim(def.range ?? def.needTarget ?? 14);
    const pend: Pending = { key: s.key, rank, target, point, n: 0 };
    if (def.action) {
      const tech = s.d.id === 'gale' ? 1 + this.x('techDmg') : 1;
      if (!p.startSkill(def.action, R(rank) * tech, def.action !== 'sk_dash')) return 'busy';
      this.pending = pend;
    } else if (def.now && def.now(this, pend) === false) return 'Nothing happens';
    // Pay.
    if (def.stamina) p.spendStamina(def.stamina * p.mods.staminaCost);
    p.mana -= this.manaCost(def);
    if (def.flow) this.flow -= def.flow;
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
  private defend(from: THREE.Vector3, damage: number, facing: number, onParried?: () => void, parryable = true): 'parried' | null {
    const p = this.player;
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

  private absorbDamage(d: number) {
    if (this.buff('invuln')) return 0;
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
    if (this.has('phoenixDown') && now - c.phoenix > 300) {
      c.phoenix = now;
      p.hp = p.maxHp * 0.3;
      this.vfx.burst(p.center, 'fire', 1.5, 6);
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
    if (this.buff('firebrand')) {
      this.tick(t, amount * 0.25 * (1 + this.x('fireDmg')));
      this.burn(t, 1);
      this.vfx.burst(t.center, 'fire', 0.3, 3);
    }
    if (this.buff('blessed')) {
      this.tick(t, amount * 0.2 * (1 + this.x('holyDmg')));
      this.vfx.burst(t.center, 'light', 0.3, 3);
      if (this.x('halo')) this.player.heal(this.x('halo'));
    }
  }

  private onParry(at: THREE.Vector3) {
    const p = this.player, P = this.paths;
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
      this.area(at, 3, this.spell(40, 'fire'), { poise: 80, fire: true });
    }
    if (burning && this.has('wildfire')) for (const t of this.vfx.near(at, 4)) this.burn(t, s!.burn!.stacks);
  }

  private onFireballImpact(at: THREE.Vector3) {
    if (!this.paths.learned('pyromancer')) return;
    for (const t of this.vfx.near(at, 2.2)) this.burn(t, 1);
    if (this.has('scorch')) this.fireZone(at, 1.8, 4);
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
        if (Math.random() < dt * 6) this.vfx.fx.add.spawn({ pos: s.t.center.clone().setY(s.t.center.y + (s.t.halfHeight ?? 0.5) + 0.4), spread: 0.4, count: 1, life: [0.4, 0.7], size: [0.14, 0.01], color: 0xfff6d0, color2: 0xffc050, jitter: 0.2 });
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

  /** HUD: what the active class's resource looks like right now. */
  resource(): { name: string; value: number; max: number; kind: 'pips' | 'bar'; color: string } | null {
    const a = this.paths.active;
    if (a === 'gale') return { name: 'FLOW', value: this.flow, max: this.flowMax, kind: 'pips', color: '#6fd6c6' };
    if (a === 'boundary') return { name: 'RESOLVE', value: this.resolve, max: 100, kind: 'bar', color: '#c9a55a' };
    return null;
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

  // ---- Pyromancer ------------------------------------------------------------------------------
  'pyromancer:Fireball': {
    action: 'sk_cast', cd: 1.2, mana: 18,
    text: (r, rt) => `Hurl a fireball for ${Math.round(42 * R(r) * (1 + (rt?.x('fireballDmg') ?? 0)))} fire damage that bursts and sets enemies burning.${rt?.has('volley') ? ' Splits into three.' : ''}${rt?.has('meteorForm') ? ' Larger and slower, +60% damage.' : ''}`,
    on: (rt, p) => {
      const from = rt.hand();
      const dir = rt.aimDir(p, from);
      let dmg = rt.spell(42, 'fire') * R(p.rank) * (1 + rt.x('fireballDmg'));
      const splash = 2.6 * (1 + rt.x('fireballArea'));
      if (rt.has('volley')) {
        for (const a of [-0.2, 0, 0.2]) rt['spells'].castFireball(from, dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a), a === 0 ? p.target : null, dmg * 0.55, 0.7, splash * 0.7);
        return;
      }
      if (rt.has('meteorForm')) dmg *= 1.6;
      rt['spells'].castFireball(from, dir, p.target, dmg, rt.has('meteorForm') ? 1.7 : 1, splash * (rt.has('meteorForm') ? 1.3 : 1));
    },
  },
  'pyromancer:Flame Wave': {
    action: 'sk_cast', cd: 5, mana: 22,
    text: (r) => `Send a wave of fire rolling 9 m along the ground, burning everything it passes for ${Math.round(28 * R(r))} damage.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const start = pl.pos.clone(), dir = rt.aimDir(p, pl.center).setY(0).normalize();
      const skip = new Set<number>();
      for (let i = 1; i <= 8; i++) {
        rt.later(i * 0.05, () => {
          const at = start.clone().addScaledVector(dir, i * 1.1);
          rt.area(at, 1.5, rt.spell(28, 'fire') * R(p.rank), { poise: 50, fire: true, skip }).forEach((t) => rt.burn(t, 1));
          rt.vfx.burst(at.clone().setY(at.y + 0.3), 'fire', 0.5, 3);
          rt.vfx.fx.dust(at, 0.4);
        });
      }
    },
  },
  'pyromancer:Meteor': {
    action: 'sk_castBig', cd: 14, mana: 40, range: 20,
    text: (r, rt) => `Call a meteor down on your target: ${Math.round(90 * R(r))} fire damage across 3.5 m, and everything hit burns.${rt?.has('starfall') ? ' Three fall.' : ''}`,
    on: (rt, p) => {
      const n = rt.has('starfall') ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const at = (p.target?.alive ? p.target.position.clone() : p.point.clone()).add(i ? new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5) : new THREE.Vector3());
        rt.vfx.groundCircle(at, 'fire', 7, 1.2 + i * 0.35);
        rt.later(i * 0.35, () =>
          rt.vfx.meteor(at, 'fire', 1.4, 0.95, () => {
            rt.area(at, 3.5, rt.spell(90, 'fire') * R(p.rank), { poise: 180, fire: true }).forEach((t) => rt.burn(t, 2));
            rt.vfx.burst(at.clone().setY(at.y + 0.5), 'fire', 3, 10);
            rt.vfx.ring(at, 'fire', 12);
            rt['player'].onShake?.(0.6);
            rt.vfx.fx.dust(at, 4);
          }),
        );
      }
    },
  },
  'pyromancer:Ignite': {
    action: 'sk_cast', cd: 3, mana: 14, needTarget: 16,
    text: (r) => `Set your target ablaze: ${Math.round(3 * R(r))} burn stacks at once.`,
    on: (rt, p) => {
      const t = p.target;
      if (!t?.alive) return;
      rt.burn(t, Math.round(3 * R(p.rank)));
      rt.vfx.burst(t.center, 'fire', 1, 4);
      rt.vfx.ring(t.position, 'fire', 3);
    },
  },
  'pyromancer:Pyre': {
    action: 'sk_cast', cd: 10, mana: 26, range: 16,
    text: (r) => `Raise a pyre where you aim: 2.8 m of burning ground for 5 seconds, ${Math.round(8 * R(r))} damage twice a second and burning everything inside.`,
    on: (rt, p) => {
      const at = p.target?.alive ? p.target.position.clone() : p.point.clone();
      rt.vfx.zone({
        pos: at, radius: 2.8, life: 5 * rt['player'].mods.duration, style: 'fire', every: 0.5, motes: 50,
        onTick: (z) => rt.area(z.pos, z.radius, rt.spell(8, 'fire') * R(p.rank), { poise: 0, fire: true }).forEach((t) => rt.burn(t, 1)),
      });
      rt.vfx.burst(at, 'fire', 1.5, 6);
    },
  },
  'pyromancer:Cinderstorm': {
    action: 'sk_castBig', cd: 18, mana: 45,
    text: (r, rt) => `Wrap yourself in a storm of embers for ${(6 * (1 + (rt?.x('ashfall') ?? 0))).toFixed(0)} seconds, burning everything within 5 m for ${Math.round(10 * R(r))} damage twice a second.`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.vfx.zone({
        pos: pl.pos.clone(), follow: () => pl.pos, radius: 5, life: 6 * (1 + rt.x('ashfall')) * pl.mods.duration, style: 'fire', every: 0.5, motes: 60,
        onTick: (z) => rt.area(z.pos, z.radius, rt.spell(10, 'fire') * R(p.rank), { poise: 10, fire: true }).forEach((t) => rt.burn(t, 1)),
      });
      rt.vfx.ring(pl.pos, 'fire', 12);
    },
  },
  'pyromancer:Firebrand': {
    action: 'sk_castSelf', cd: 22, mana: 20,
    text: (r) => `Your weapon catches fire for ${(20 * R(r)).toFixed(0)} seconds: every hit deals 25% extra fire damage and adds a burn stack. Works with any combat class.`,
    on: (rt, p) => {
      rt.addBuff('firebrand', 20 * R(p.rank));
      rt.vfx.burst(rt.hand(), 'fire', 1, 3);
    },
  },
  'pyromancer:Immolation': {
    action: 'sk_castSelf', cd: 20, mana: 24,
    text: (r) => `Burst into flame for ${(10 * R(r)).toFixed(0)} seconds, scorching everything within 2.6 m twice a second.`,
    on: (rt, p) => {
      rt.addBuff('immolation', 10 * R(p.rank), 0);
      rt.vfx.ring(rt['player'].pos, 'fire', 6);
    },
  },
  'pyromancer:Flame Step': {
    action: 'sk_dash', cd: 6, mana: 16,
    text: (r) => `Dodge in a burst of fire, leaving burning ground behind you that deals ${Math.round(5 * R(r))} damage twice a second.`,
    on: (rt, p) => {
      const pl = rt['player'];
      if (p.n === 0 && rt.has('cauterize')) pl.heal(pl.maxHp * 0.08);
      rt.fireZone(pl.pos, 1.3, 3);
      rt.vfx.burst(pl.center, 'fire', 0.6, 3);
    },
  },
  'pyromancer:Heart of the Sun': {
    action: 'sk_castBig', cd: 60, mana: 0,
    text: (r) => `For ${(12 * R(r)).toFixed(0)} seconds your spells cost no mana and fire hits 30% harder.`,
    on: (rt, p) => {
      rt.addBuff('sun', 12 * R(p.rank));
      rt.vfx.pillar(rt['player'].pos, 'fire', 1.5, 12);
      rt.vfx.bubble(() => rt['player'].pos.clone().setY(rt['player'].pos.y + 1.8), 'fire', 0.35, () => rt.buff('sun'));
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


  // ---- Lightbinder -------------------------------------------------------------------------------
  'lightbinder:Healing Light': {
    action: 'sk_castSelf', cd: 2, mana: 28,
    text: (r, rt) => `A prayer of warm light that restores ${Math.round(55 * R(r) * (rt?.has('lasting') ? 1.2 : 1))} health over ${rt?.has('lasting') ? 4.5 : 3} seconds.${rt?.has('dawnbreak') ? ' Burns nearby enemies with holy light.' : ''}`,
    on: (rt, p) => {
      const pl = rt['player'];
      const lasting = rt.has('lasting');
      pl.healOverTime(55 * R(p.rank) * (lasting ? 1.2 : 1), lasting ? 4.5 : 3);
      pl.onSpell?.('healingLight', pl.center, pl.forward, null);
      if (rt.has('dawnbreak')) {
        rt.area(pl.pos, 3, rt.spell(20, 'holy'), { poise: 40 });
        rt.vfx.ring(pl.pos, 'light', 7);
      }
    },
  },
  'lightbinder:Renew': {
    action: 'sk_castSelf', cd: 8, mana: 20,
    text: (r, rt) => `Restore ${Math.round(60 * R(r))} health over 12 seconds.${rt?.has('surge') ? ' 40% of it arrives at once.' : ''}${rt?.has('mending') ? ' Puts out burns.' : ''}`,
    on: (rt, p) => {
      const pl = rt['player'];
      const total = 60 * R(p.rank) * (rt.has('lasting') ? 1.2 : 1);
      if (rt.has('surge')) {
        pl.heal(total * 0.4);
        pl.healOverTime(total * 0.6, 12);
      } else pl.healOverTime(total, 12);
      if (rt.has('mending')) pl.cleanse();
      rt.vfx.groundCircle(pl.pos, 'light', 2.6, 1.5);
      rt.vfx.burst(pl.center, 'light', 0.4, 2);
    },
  },
  'lightbinder:Sanctuary': {
    action: 'sk_castSelf', cd: 18, mana: 34,
    text: (r, rt) => `Hallow the ground around you for ${(6 + (rt?.x('devotion') ?? 0)).toFixed(0)} seconds: inside it you heal ${Math.round(6 * R(r))} health a second and enemies burn for 5.`,
    on: (rt, p) => {
      const pl = rt['player'];
      const at = pl.pos.clone();
      rt.vfx.zone({
        pos: at, radius: 4, life: (6 + rt.x('devotion')) * pl.mods.duration, style: 'light', every: 0.5, motes: 25,
        onTick: (z) => {
          if (pl.pos.distanceTo(z.pos) < z.radius) pl.heal(6 * R(p.rank) * 0.5);
          for (const t of rt.vfx.near(z.pos, z.radius)) rt.hit(t, rt.spell(2.5, 'holy'), { poise: 0 });
        },
      });
    },
  },
  'lightbinder:Smite': {
    action: 'sk_cast', cd: 5, mana: 22, range: 16,
    text: (r, rt) => `A column of light strikes where you aim for ${Math.round(45 * R(r))} holy damage.${rt?.has('smiteBrand') ? ' Brands whatever it hits.' : ''}${rt?.has('lightfall') ? ' Strikes twice.' : ''}`,
    on: (rt, p) => {
      const at = p.target?.alive ? p.target.position.clone() : p.point.clone();
      const strike = () => {
        const r = 1.8 * (1 + rt.x('smiteArea'));
        rt.vfx.pillar(at, 'light', r * 0.6);
        rt.area(at, r, rt.spell(45, 'holy') * R(p.rank), { poise: 90 }).forEach((t) => rt.has('smiteBrand') && rt.brand(t));
      };
      strike();
      if (rt.has('lightfall')) rt.later(0.5, strike);
    },
  },
  'lightbinder:Radiant Spear': {
    action: 'sk_cast', cd: 4, mana: 24,
    text: (r, rt) => `Throw a spear of light for ${Math.round(40 * R(r))} holy damage.${rt?.has('spearPierce') ? ' It passes through every enemy.' : ''}${rt?.has('condemn') ? ' +50% against branded enemies.' : ''}`,
    on: (rt, p) => {
      const from = rt.hand();
      rt.vfx.projectile({
        from, dir: rt.aimDir(p, from), speed: 30, range: 22, style: 'light', shape: 'spear', size: 1.2, pierce: rt.has('spearPierce'), radius: 0.35,
        onHit: (t, _a, d) => {
          const branded = rt.has('condemn') && (rt['status'].get(t.id)?.brand ?? 0) > 0;
          rt.hit(t, rt.spell(40, 'holy') * R(p.rank) * (branded ? 1.5 : 1), { poise: 70, dir: d });
        },
      });
    },
  },
  'lightbinder:Holy Brand': {
    action: 'sk_cast', cd: 6, mana: 14, needTarget: 18,
    text: (r, rt) => `Brand your target for ${(8 * R(r)).toFixed(0)} seconds: it takes ${rt?.has('verdict') ? 40 : 25}% more damage from everything.`,
    on: (rt, p) => p.target?.alive && rt.brand(p.target, 8 * R(p.rank)),
  },
  'lightbinder:Blessed Weapon': {
    action: 'sk_castSelf', cd: 24, mana: 20,
    text: (r, rt) => `Bless your weapon for ${(20 * R(r) + (rt?.x('hallowed') ?? 0)).toFixed(0)} seconds: every hit deals 20% extra holy damage.`,
    on: (rt, p) => {
      rt.addBuff('blessed', 20 * R(p.rank) + rt.x('hallowed'));
      rt.vfx.burst(rt.hand(), 'light', 1, 3);
    },
  },
  'lightbinder:Consecrate': {
    action: 'sk_castSelf', cd: 14, mana: 26,
    text: (r, rt) => `Consecrate the ground around you (${(3.5 * (1 + (rt?.x('consArea') ?? 0))).toFixed(1)} m) for 6 seconds: enemies inside take ${Math.round(8 * R(r))} holy damage a second.`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.vfx.zone({
        pos: pl.pos.clone(), radius: 3.5 * (1 + rt.x('consArea')), life: 6 * pl.mods.duration, style: 'light', every: 0.5, motes: 30,
        onTick: (z) => {
          for (const t of rt.vfx.near(z.pos, z.radius)) rt.hit(t, rt.spell(4, 'holy') * R(p.rank), { poise: 0 });
          const inside = pl.pos.distanceTo(z.pos) < z.radius;
          if (inside && rt.has('faithBulwark')) rt.addBuff('faithZone', 0.6);
          if (inside && rt.x('sacredGround')) pl.heal(rt.x('sacredGround') * 0.5);
        },
      });
    },
  },
  'lightbinder:Divine Barrier': {
    action: 'sk_castSelf', cd: 22, mana: 30,
    text: (r, rt) => `A barrier of light absorbs the next ${Math.round((60 + 20 * r) * (1 + (rt?.x('barrierAbsorb') ?? 0)))} damage for 12 seconds.`,
    on: (rt, p) => {
      rt.shield((60 + 20 * p.rank) * (1 + rt.x('barrierAbsorb')), 12, 'barrier', 'light');
      if (rt.has('cathedralStep')) rt['player'].stamina = Math.min(rt['player'].maxStamina, rt['player'].stamina + 30);
    },
  },
  'lightbinder:Final Judgment': {
    action: 'sk_castBig', cd: 50, mana: 50,
    text: (r) => `Judgment falls on every enemy within 14 m: a pillar of light for ${Math.round(70 * R(r))} holy damage each, and all of them are branded.`,
    on: (rt, p) => {
      const pl = rt['player'];
      rt.vfx.near(pl.pos, 14).forEach((t, i) =>
        rt.later(i * 0.12, () => {
          if (!t.alive) return;
          rt.vfx.pillar(t.position, 'light', 1.1);
          rt.hit(t, rt.spell(70, 'holy') * R(p.rank), { poise: 120 });
          rt.brand(t);
        }),
      );
    },
  },
  'lightbinder:Cathedral': {
    action: 'sk_castBig', cd: 60, mana: 45,
    text: (r) => `Raise a cathedral of light around you for ${(10 * R(r)).toFixed(0)} seconds: take 40% less damage and heal 3 health a second.`,
    on: (rt, p) => {
      rt.addBuff('cathedral', 10 * R(p.rank), 0);
      rt.vfx.bubble(() => rt['player'].pos, 'light', 4, () => rt.buff('cathedral'));
      rt.vfx.pillar(rt['player'].pos, 'light', 2, 14);
    },
  },
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
