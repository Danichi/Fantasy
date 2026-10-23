import * as THREE from 'three';
import { events } from '../core/events';
import { targets, type Target, type IncomingAttack, type DefenceResult } from '../combat/targets';
import { afflictions } from '../combat/afflictions';
import type { CombatMods } from '../combat/mods';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import { RECIPE, QDUR, QUALITY_NAMES, fxAt, type BrewFx, type RecipeDef } from './recipes';
import { isBeast, isBoss, isUndead, elementOf } from './kinds';

// What brews DO once made: the timed elixir buffs (one per family), toxicity
// and overdose, healing tonics and their cooldown, blade oils and the venom,
// chill and wither they leave on foes, and the combat hooks that make the
// numbers real (damage, defence, speed, crits, resistances, evasion, lifesteal).
//
// Hooks into the player without editing player.ts: `attach()` wraps the
// instance's receiveAttack (resistances, evasion, stagger), cheatDeath (the
// Elixir of Life) and meleeBonus (banes, ambush, corrosion), and `applyMods()`
// adds the buffs on top of the modifiers the skill runtime rewrites each step
// (so it must run after skillRt.update).

export interface EffectsOwner {
  /** Herbalism tree perk value (summed `x` of learned nodes) */
  perk(k: string): number;
  toast(msg: string): void;
  signal(id: string): void;
  /** the skill runtime's lightning bolt, when there is one */
  lightning?: (a: THREE.Vector3, b: THREE.Vector3) => void;
}

export interface ActiveBrew {
  recipe: string;
  q: number;
  left: number;
  total: number;
  fx: BrewFx;
  tox: number;
}
export interface Oil {
  recipe: string;
  q: number;
  charges: number;
  max: number;
  fx: BrewFx;
}
interface Venom { t: Target; stacks: number; left: number; acc: number; dps: number; seized: number; withered: number }

export interface EffectsSave {
  buffs: { family: string; recipe: string; q: number; left: number; total: number; tox: number }[];
  oils: { recipe: string; q: number; charges: number; max: number }[];
  tox: number;
  tonicCd: number;
}

const TONIC_CD = 8;
const VENOM_TIME = 6;

export class BrewEffects {
  readonly buffs = new Map<string, ActiveBrew>();
  oils: Oil[] = [];
  /** lingering toxicity (tonics); elixirs add theirs while they last */
  toxLinger = 0;
  tonicCd = 0;
  tonicCdMax = TONIC_CD;
  /** set by the flasks while you stand in your own smoke */
  inSmoke = 0;
  private venom = new Map<number, Venom>();
  private chill = new Map<number, number>();
  private stormHits = 0;
  private ambushCd = 0;
  private regenAcc = 0;
  private time = 0;
  private overdoseWarned = false;
  private vision = 0;
  private gameEl: HTMLElement | null = null;

  constructor(private player: Player, private fx: FX, private owner: EffectsOwner) {
    events.on('meleeHit', (e) => this.onMeleeHit(e.target, e.amount));
    events.on('enemyDied', ({ enemyId }) => this.onKill(enemyId));
    events.on('playerDied', () => this.clearAll());
  }

  /** Wrap the player's defence, death and blade-bonus hooks. Construct after the skill runtime. */
  attach() {
    const p = this.player;
    const recv = p.receiveAttack.bind(p);
    p.receiveAttack = (att: IncomingAttack) => this.onIncoming(att, recv);
    const cheat = p.cheatDeath;
    p.cheatDeath = () => (cheat?.() ?? false) || this.revive();
    const bonus = p.meleeBonus;
    p.meleeBonus = (t: Target) => this.meleeBonus(t, bonus ? bonus(t) : { mult: 1, crit: false });
  }

  // ---- toxicity -----------------------------------------------------------------------------
  get toxCap() {
    return 100 + this.owner.perk('tox');
  }
  get toxicity() {
    let s = this.toxLinger;
    for (const b of this.buffs.values()) s += b.tox;
    return s;
  }
  get overdosed() {
    return this.toxicity > this.toxCap && this.owner.perk('noOverdose') <= 0;
  }
  private fx_(k: keyof BrewFx) {
    let s = 0;
    for (const b of this.buffs.values()) s += b.fx[k] ?? 0;
    return s;
  }
  has(k: keyof BrewFx) {
    return this.fx_(k) > 0;
  }
  /** any combat elixir running (for "fight while buffed" objectives) */
  get elixirActive() {
    for (const b of this.buffs.values()) if (RECIPE[b.recipe]?.cat === 'elixir') return true;
    return false;
  }
  get buffTimeMul() {
    return Math.max(0.3, 1 + this.owner.perk('buffTime'));
  }

  // ---- drinking -------------------------------------------------------------------------------
  /** Drink a tonic, draught or elixir. Returns why not, or null when drunk. */
  drink(r: RecipeDef, q: number): string | null {
    const p = this.player, P = (k: string) => this.owner.perk(k);
    if (p.dead) return 'You are dead';
    const f = fxAt(r, q);
    if (r.cat === 'tonic') {
      if (this.tonicCd > 0 && P('apothecary') <= 0) return `Your last tonic is still working (${Math.ceil(this.tonicCd)} s)`;
      const mult = 1 + P('tonicHeal');
      let heal = (f.heal ?? 0) * mult;
      if (f.healPct) heal += p.maxHp * f.healPct;
      if (P('slowBrew') > 0) {
        p.healOverTime(heal * 1.6 + (f.hot ?? 0) * mult, 10);
      } else {
        p.heal(heal);
        if (f.hot) p.healOverTime(f.hot * mult, f.hotT ?? 10);
        else if (P('tonicHot') > 0 && heal > 0) p.healOverTime(heal / 3, 8);
      }
      if (P('tonicCleanse') > 0) this.cleanse();
      if (P('apothecary') > 0) {
        p.mana = Math.min(p.maxMana, p.mana + p.maxMana * 0.15);
        p.stamina = Math.min(p.maxStamina, p.stamina + p.maxStamina * 0.15);
      }
      this.tonicCdMax = P('apothecary') > 0 ? 0 : TONIC_CD * (P('quickSip') > 0 ? 0.5 : 1);
      this.tonicCd = this.tonicCdMax;
      if (P('quickSip') <= 0) this.toxLinger += r.tox;
    } else if (!(r.family && r.dur)) this.toxLinger += r.tox * (1 - Math.min(0.9, P('twin'))); // instant draughts linger
    // Instant parts (every kind).
    if (f.mana) p.mana = Math.min(p.maxMana, p.mana + f.mana);
    if (f.manaPct) p.mana = Math.min(p.maxMana, p.mana + p.maxMana * f.manaPct);
    if (f.stamina) p.stamina = Math.min(p.maxStamina, p.stamina + f.stamina);
    if (f.staPct) p.stamina = Math.min(p.maxStamina, p.stamina + p.maxStamina * f.staPct);
    if (f.cleanse) this.cleanse();
    if (f.toxPurge) this.toxLinger = 0;
    if (f.breath) {
      p.waterBreathT = f.breath;
      p.breath = 1;
      this.addBuff('gills', r, q, f.breath, 0);
    }
    if (r.family && r.dur) {
      const dur = r.dur * QDUR[q] * (r.cat === 'tonic' ? 1 : this.buffTimeMul);
      const tox = r.cat === 'tonic' ? 0 : r.tox * (1 - Math.min(0.9, P('twin')));
      this.addBuff(r.family, r, q, dur, tox);
    }
    this.sparkle(r.color);
    if (r.cat === 'elixir') this.owner.signal('herb-drink-elixir');
    return null;
  }

  private addBuff(family: string, r: RecipeDef, q: number, dur: number, tox: number) {
    const was = this.buffs.get(family);
    if (was && was.recipe !== r.id) this.owner.toast(`${RECIPE[was.recipe]?.name ?? 'The old brew'} gives way to ${r.name}`);
    this.buffs.set(family, { recipe: r.id, q, left: dur, total: dur, fx: fxAt(r, q), tox });
  }

  /** Burns, venom and chill off you. */
  cleanse() {
    this.player.cleanse();
  }

  // ---- oils ------------------------------------------------------------------------------------
  coat(r: RecipeDef, q: number): string | null {
    const p = this.player;
    if (!p.equip.mainWeapon) return 'You need a blade in your main hand to coat';
    const f = fxAt(r, q);
    const max = Math.round((f.charges ?? 30) * (1 + this.owner.perk('oilCharges')));
    const slots = 1 + this.owner.perk('oilSlots');
    const same = this.oils.findIndex((o) => o.recipe === r.id);
    if (same >= 0) this.oils.splice(same, 1);
    else if (this.oils.length >= slots) {
      const old = this.oils.shift()!;
      this.owner.toast(`${RECIPE[old.recipe]?.name} is wiped off for ${r.name}`);
    }
    this.oils.push({ recipe: r.id, q, charges: max, max, fx: f });
    this.sparkle(r.color, true);
    this.owner.toast(`${QUALITY_NAMES[q]} ${r.name} coats your blade (${max} hits)`);
    return null;
  }

  // ---- per step ---------------------------------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    const p = this.player;
    this.tonicCd = Math.max(0, this.tonicCd - dt);
    this.ambushCd = Math.max(0, this.ambushCd - dt);
    this.inSmoke = Math.max(0, this.inSmoke - dt);
    const drain = 1.2 * (this.owner.perk('toxDrain') > 0 ? 2 : 1);
    this.toxLinger = Math.max(0, this.toxLinger - drain * dt);
    for (const [k, b] of this.buffs) {
      b.left -= dt;
      if (b.left <= 0) {
        this.buffs.delete(k);
        if (k !== 'gills') this.owner.toast(`${RECIPE[b.recipe]?.name ?? 'A brew'} has worn off`);
      }
    }
    if (p.dead) return;
    // Regeneration (Troll's Blood).
    const regen = this.fx_('regen');
    if (regen > 0) {
      this.regenAcc += dt;
      if (this.regenAcc >= 0.25) {
        p.heal(p.maxHp * regen * this.regenAcc);
        this.regenAcc = 0;
      }
    }
    // Immunity holds afflictions off.
    if (this.has('immune') || this.has('burnImmune')) p.cleanse();
    // Overdose: a slow poison, weak limbs, short breath.
    if (this.overdosed) {
      if (!this.overdoseWarned) {
        this.overdoseWarned = true;
        this.owner.toast(`Toxicity ${Math.round(this.toxicity)} / ${Math.round(this.toxCap)}: you are overdosing! Let it pass, or drink a Purging Draught.`);
      }
      p.hp = Math.max(1, p.hp - p.maxHp * 0.015 * dt);
      if (Math.random() < dt * 6) this.fx.alpha.spawn({ pos: p.center, spread: 0.8, count: 1, life: [0.5, 1], size: [0.18, 0.4], color: 0x7aa03a, color2: 0x3a4a1a, upBias: 0.5, jitter: 0.5, alpha: 0.5 });
    } else this.overdoseWarned = false;
    // Featherfall: never fall faster than a leaf.
    if (this.has('feather') && !p.grounded && p.vel.y < -3) p.vel.y = -3;
    this.tickVenom(dt);
    this.tickVision(dt);
    // Oils glint on the blade.
    if (this.oils.length && Math.random() < dt * 8) {
      const o = this.oils[Math.floor(Math.random() * this.oils.length)];
      const at = p.center.addScaledVector(p.forward, 0.45).add(new THREE.Vector3(0, 0.1, 0));
      this.fx.add.spawn({ pos: at, spread: 0.3, count: 1, life: [0.25, 0.5], size: [0.06, 0.01], color: RECIPE[o.recipe]?.color ?? 0xffffff, jitter: 0.5, upBias: 0.6 });
    }
  }

  /** Add the running brews to the player's modifiers (after the skill runtime rewrote them). */
  applyMods(m: CombatMods) {
    m.melee += this.fx_('melee');
    m.dmgTaken -= this.fx_('ward');
    m.moveSpeed += this.fx_('move');
    m.attackSpeed += this.fx_('atk');
    m.crit += this.fx_('crit');
    m.dodgeCost -= this.fx_('dodge');
    m.poise += this.fx_('poiseDmg');
    m.spell += this.fx_('spell');
    m.manaRegen += this.fx_('manaRegen');
    m.staminaRegen += this.fx_('staRegen');
    m.manaCost -= this.fx_('manaCost');
    if (this.overdosed) {
      m.melee -= 0.25;
      m.staminaRegen -= 0.5;
    }
    m.dmgTaken = Math.max(0.05, m.dmgTaken);
    m.dodgeCost = Math.max(0, m.dodgeCost);
    m.manaCost = Math.max(0, m.manaCost);
    m.moveSpeed = Math.max(0.3, m.moveSpeed);
  }

  // ---- defence -----------------------------------------------------------------------------------
  /** The foe behind an attack: the nearest living target to where it came from. */
  private attacker(att: IncomingAttack): Target | null {
    let best: Target | null = null, bd = 3.5;
    for (const t of targets) {
      if (!t.alive) continue;
      const d = t.position.distanceTo(att.from);
      if (d < bd) (bd = d), (best = t);
    }
    return best;
  }

  private onIncoming(att: IncomingAttack, recv: (a: IncomingAttack) => DefenceResult): DefenceResult {
    const p = this.player;
    if (p.dead || att.damage <= 0) return recv(att);
    const foe = this.attacker(att);
    // Evasion (Shadow Draught, your own smoke).
    const evade = Math.min(0.75, this.fx_('evade') + (this.inSmoke > 0 ? 0.5 : 0));
    if (evade > 0 && !p.inIframes() && Math.random() < evade) {
      this.fx.alpha.spawn({ pos: p.center, spread: 1.4, count: 10, life: [0.3, 0.6], size: [0.3, 0.6], color: 0x6a5a8a, color2: 0x2a2a3a, jitter: 0.6, alpha: 0.45 });
      return 'dodged';
    }
    let k = 1;
    const el = att.burn ? 'fire' : foe ? elementOf(foe.kind) : null;
    if (el === 'fire') k *= 1 - this.fx_('resFire');
    if (el === 'frost') k *= 1 - this.fx_('resFrost');
    if (el === 'poison') k *= (1 - this.fx_('resPoison')) * (this.owner.perk('venomblood') > 0 ? 0.5 : 1);
    if (this.has('immune') && el) k *= 0.5;
    if (att.burn) att.burn = this.has('burnImmune') || this.has('immune') ? 0 : att.burn * (1 - this.fx_('resFire'));
    const v = foe ? this.venom.get(foe.id) : undefined;
    if (v && v.left > 0) {
      k *= 1 - Math.min(0.6, this.owner.perk('numbroot') + (v.withered > 0 ? v.withered : 0));
    }
    att.damage *= Math.max(0.05, k);
    att.poise *= 1 - Math.min(0.9, this.fx_('poise'));
    const res = recv(att);
    // Venomblood: what bites you is bitten back.
    if (res === 'hit' && foe && this.owner.perk('venomblood') > 0) this.addVenom(foe, 2, 4);
    return res;
  }

  private revive() {
    const b = this.buffs.get('life');
    if (!b || !b.fx.revive) return false;
    const p = this.player;
    this.buffs.delete('life');
    p.hp = Math.max(1, p.maxHp * b.fx.revive);
    this.cleanse();
    this.fx.add.spawn({ pos: p.center, spread: 4, count: 70, life: [0.6, 1.4], size: [0.14, 0.02], color: 0xfff6c8, color2: 0x8aff9a, upBias: 1.6, drag: 1.5, jitter: 0.8 });
    this.owner.toast('The Elixir of Life refuses your death. You rise again.');
    return true;
  }

  // ---- offence ---------------------------------------------------------------------------------
  private meleeBonus(t: Target, r: { mult: number; crit: boolean }) {
    let mult = r.mult, crit = r.crit;
    for (const o of this.oils) {
      if (o.fx.baneUndead && isUndead(t.kind)) mult *= 1 + o.fx.baneUndead;
      if (o.fx.baneBeast && isBeast(t.kind)) mult *= 1 + o.fx.baneBeast;
    }
    if (this.poisoned(t)) mult *= 1 + this.owner.perk('corrosive');
    if (this.has('ambush') && this.ambushCd <= 0) {
      crit = true;
      this.ambushCd = 8;
    }
    return { mult, crit };
  }

  private onMeleeHit(t: Target, amount: number) {
    const p = this.player;
    const ls = this.fx_('lifesteal');
    if (ls > 0) p.heal(amount * ls);
    // Stormleaf: every third blow calls lightning.
    const storm = this.fx_('storm');
    if (storm > 0 && ++this.stormHits % 3 === 0) {
      this.bolt(t, storm);
      const other = this.nearest(t.position, 7, t);
      if (other) this.bolt(other, storm * 0.5, t.center);
    }
    const dragon = this.fx_('dragon');
    if (dragon > 0 && t.alive) afflictions.burn(t, dragon, 3);
    // Oils.
    for (const o of [...this.oils]) {
      const f = o.fx;
      if (f.oilBurn && t.alive) afflictions.burn(t, f.oilBurn, 3);
      if (f.oilChill && t.alive) {
        const n = (this.chill.get(t.id) ?? 0) + 1;
        this.tickDamage(t, f.chillDmg ?? 0);
        this.fx.add.spawn({ pos: t.center, spread: 1.4, count: 8, life: [0.3, 0.6], size: [0.08, 0.01], color: 0xe8f6ff, color2: 0x5fb4ff, jitter: t.radius });
        if (n >= f.oilChill) {
          this.chill.delete(t.id);
          afflictions.freeze(t);
        } else this.chill.set(t.id, n);
      }
      if (f.oilVenom && t.alive) this.addVenom(t, f.oilVenom, f.venomDps ?? 3, f.oilWither ?? 0);
      if (f.baneUndead && isUndead(t.kind)) this.fx.add.spawn({ pos: t.center, spread: 2.5, count: 14, life: [0.3, 0.7], size: [0.1, 0.01], color: 0xfff6d0, color2: 0xffc050, upBias: 1 });
      if (f.execute && t.alive && !isBoss(t) && t.hp / t.maxHp < f.execute) {
        const d = Math.ceil(t.hp + 1);
        t.takeHit({ damage: d, poise: 200, dir: t.position.clone().sub(p.pos).setY(0).normalize(), at: t.center.clone(), crit: true, source: 'melee' });
        events.emit('enemyHit', { at: t.center.clone(), amount: d, crit: true, enemyId: t.id });
        this.fx.add.spawn({ pos: t.center, spread: 3, count: 30, life: [0.4, 0.9], size: [0.12, 0.02], color: 0xc02a5a, color2: 0x200010, jitter: 0.4 });
      }
      o.charges--;
      if (o.charges <= 0) {
        this.oils.splice(this.oils.indexOf(o), 1);
        this.owner.toast(`Your ${RECIPE[o.recipe]?.name ?? 'oil'} has worn off the blade`);
      }
    }
  }

  private onKill(id: number) {
    const v = this.venom.get(id);
    this.venom.delete(id);
    this.chill.delete(id);
    if (!v) return;
    // Widow's Kiss feeds you on the poisoned dead.
    if (this.oils.some((o) => o.fx.execute)) this.player.heal(this.player.maxHp * 0.05);
    // Contagion: the venom leaps on.
    if (this.owner.perk('contagion') > 0 && v.stacks > 0) {
      const next = this.nearest(v.t.position, 8, v.t);
      if (next) {
        this.addVenom(next, v.stacks, v.dps, v.withered);
        this.streak(v.t.center, next.center, 0x7ac03a);
      }
    }
  }

  // ---- venom ------------------------------------------------------------------------------------
  poisoned(t: Target) {
    return (this.venom.get(t.id)?.left ?? 0) > 0;
  }
  addVenom(t: Target, stacks: number, dps: number, wither = 0) {
    if (!t.alive) return;
    const max = 5 + this.owner.perk('venomStacks');
    const v = this.venom.get(t.id) ?? { t, stacks: 0, left: 0, acc: 0, dps: 0, seized: -99, withered: 0 };
    v.stacks = Math.min(max, (v.left > 0 ? v.stacks : 0) + stacks);
    v.dps = Math.max(v.dps * (v.left > 0 ? 1 : 0), dps);
    v.left = VENOM_TIME;
    v.withered = Math.max(v.withered, wither);
    this.venom.set(t.id, v);
    // Paralytic: a full dose seizes the muscles.
    if (this.owner.perk('paralytic') > 0 && v.stacks >= 5 && this.time - v.seized > 6 && !isBoss(t)) {
      v.seized = this.time;
      t.stunned = true;
      t.takeHit({ damage: 1, poise: 260, dir: new THREE.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'spell' });
      this.fx.add.spawn({ pos: t.center, spread: 2, count: 20, life: [0.3, 0.7], size: [0.1, 0.02], color: 0xd0ff8a, color2: 0x3a6a10, jitter: t.radius });
    }
  }
  private tickVenom(dt: number) {
    const boost = 1 + this.owner.perk('venomDmg');
    for (const [id, v] of this.venom) {
      if (!v.t.alive || v.left <= 0) {
        this.venom.delete(id);
        continue;
      }
      v.left -= dt;
      v.acc += dt;
      if (Math.random() < dt * (4 + v.stacks * 2)) this.fx.alpha.spawn({ pos: v.t.center, vel: new THREE.Vector3(0, 0.6, 0), spread: 0.4, count: 1, life: [0.4, 0.8], size: [0.12, 0.05], color: 0x8ad04a, color2: 0x2a4a10, jitter: v.t.radius * 1.4, alpha: 0.7 });
      while (v.acc >= 0.5) {
        v.acc -= 0.5;
        this.tickDamage(v.t, v.dps * v.stacks * 0.5 * boost);
      }
    }
  }

  /** Damage without a flinch (the killing tick still counts as a hit). */
  tickDamage(t: Target, dmg: number) {
    if (!t.alive || dmg <= 0) return;
    const d = Math.max(1, Math.round(dmg));
    if (t.hp - d > 0) t.hp -= d;
    else t.takeHit({ damage: d, poise: 0, dir: new THREE.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'spell' });
    events.emit('enemyHit', { at: t.center.clone(), amount: d, crit: false, enemyId: t.id });
  }

  // ---- helpers ------------------------------------------------------------------------------------
  nearest(at: THREE.Vector3, r: number, not?: Target) {
    let best: Target | null = null, bd = r;
    for (const t of targets) {
      if (!t.alive || t === not || t.kind === 'dummy') continue;
      const d = t.position.distanceTo(at);
      if (d < bd) (bd = d), (best = t);
    }
    return best;
  }

  private bolt(t: Target, dmg: number, from?: THREE.Vector3) {
    const a = from ?? t.center.clone().setY(t.center.y + 7);
    if (this.owner.lightning) this.owner.lightning(a, t.center.clone());
    else this.streak(a, t.center, 0xbfe8ff);
    const d = Math.round(dmg * (0.9 + Math.random() * 0.2));
    t.takeHit({ damage: d, poise: 40, dir: t.position.clone().sub(this.player.pos).setY(0).normalize(), at: t.center.clone(), crit: false, source: 'spell' });
    events.emit('enemyHit', { at: t.center.clone(), amount: d, crit: false, enemyId: t.id });
  }

  /** A line of sparks from a to b. */
  streak(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const at = a.clone().lerp(b, i / n).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
      this.fx.add.spawn({ pos: at, spread: 0.4, count: 1, life: [0.15, 0.35], size: [0.12, 0.02], color: 0xffffff, color2: color });
    }
  }

  private sparkle(color: number, blade = false) {
    const p = this.player;
    const at = blade ? p.center.addScaledVector(p.forward, 0.45) : p.center;
    this.fx.add.spawn({ pos: at, spread: blade ? 1.2 : 2, count: 26, life: [0.4, 0.9], size: [0.09, 0.01], color: 0xffffff, color2: color, upBias: 1.2, jitter: 0.5 });
  }

  /** Owl's Eye: the whole view brightens (eased in and out). */
  private tickVision(dt: number) {
    const want = this.has('vision') ? 1 : 0;
    if (want === this.vision) return;
    this.vision = want > this.vision ? Math.min(1, this.vision + dt / 1.5) : Math.max(0, this.vision - dt / 1.5);
    this.gameEl ??= document.getElementById('game');
    if (!this.gameEl) return;
    const k = this.vision;
    this.gameEl.style.filter = k > 0.001 ? `brightness(${(1 + 0.6 * k).toFixed(3)}) saturate(${(1 - 0.3 * k).toFixed(3)}) hue-rotate(${(-12 * k).toFixed(1)}deg)` : '';
  }

  clearAll() {
    this.buffs.clear();
    this.oils = [];
    this.toxLinger = 0;
    this.tonicCd = 0;
    this.venom.clear();
    this.chill.clear();
  }

  // ---- save -----------------------------------------------------------------------------------------
  toJSON(): EffectsSave {
    return {
      buffs: [...this.buffs].map(([family, b]) => ({ family, recipe: b.recipe, q: b.q, left: Math.round(b.left), total: Math.round(b.total), tox: b.tox })),
      oils: this.oils.map((o) => ({ recipe: o.recipe, q: o.q, charges: o.charges, max: o.max })),
      tox: Math.round(this.toxLinger),
      tonicCd: 0,
    };
  }
  fromJSON(s: EffectsSave | undefined) {
    this.clearAll();
    if (!s) return;
    for (const b of s.buffs ?? []) {
      const r = RECIPE[b.recipe];
      if (r && b.left > 0) this.buffs.set(b.family, { recipe: r.id, q: b.q, left: b.left, total: b.total, fx: fxAt(r, b.q), tox: b.tox });
    }
    for (const o of s.oils ?? []) {
      const r = RECIPE[o.recipe];
      if (r && o.charges > 0) this.oils.push({ recipe: r.id, q: o.q, charges: o.charges, max: o.max, fx: fxAt(r, o.q) });
    }
    this.toxLinger = s.tox ?? 0;
    const gills = this.buffs.get('gills');
    if (gills) this.player.waterBreathT = gills.left;
  }
}
