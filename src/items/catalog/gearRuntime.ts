import * as THREE from 'three';
import type { Player } from '../../player/player';
import type { SkillRuntime } from '../../paths/skills';
import type { ArmsRuntime } from '../../combat/armsRuntime';
import type { ItemDef } from '../itemDefs';
import type { IncomingAttack } from '../../combat/targets';
import { targets, type Target } from '../../combat/targets';
import type { Style } from '../../magic/circles';
import { events } from '../../core/events';
import { baseMods } from '../../combat/mods';
import { afflictions } from '../../combat/afflictions';
import { stealth } from '../../origins/stealth';
import { XP_FOR_KIND } from '../../progression/progression';
import { GEAR } from './hooks';
import { MOD_KEYS, familyOf } from './gearFx';
import { SET } from './sets';
import { TOKENS } from './jewels';

// Gear at work (items/catalog): adds up what you wear (effects, set bonuses,
// the Sunwheel tokens) and what you have drunk or eaten, and makes each
// effect happen where it belongs: combat modifiers, blows dealt and taken,
// kills, parries, travel, gathering, fishing, light. It also does what the
// catalog's one-use items do (scrolls, bombs, wards, kits).

export interface GearDeps {
  scene: THREE.Scene;
  player: Player;
  rt: SkillRuntime;
  arms: ArmsRuntime;
  toast: (m: string) => void;
  region: () => string;
  rain: () => number;
  hour: () => number;
  day: () => number;
  gold: (n: number) => void;
  xp: (n: number) => void;
  give: (id: string, n: number) => void;
  /** standing in the Dark's places (the Gravewood, a scar) */
  inDark?: () => boolean;
  /** near a town or road (spells cost more there for the White Antler) */
  inTown?: () => boolean;
  /** the Sunwheel: carry the player to the last wheel touched (false: none yet) */
  recall?: () => boolean;
  /** back to where you last rested */
  returnHome?: () => boolean;
  /** mark the nearest place not yet found; its name, or null */
  detect?: () => string | null;
  /** flash the ore veins within r m; how many */
  orePing?: (r: number) => number;
}

const COMBAT_KEYS = new Set(Object.keys(baseMods()));
const STAT_MODS: Record<string, string> = { maxHp: 'hp', maxStamina: 'stamina', maxMana: 'mana', staminaRegen: 'staminaRegen', manaRegen: 'manaRegen' };
const STYLE: Record<string, Style> = { fire: 'fire', frost: 'frost', wind: 'wind', light: 'light', steel: 'steel', sea: 'gale', beast: 'blood', shadow: 'shadow' };
const SEA = /Isles$|^ocean$/;

export class GearRuntime {
  /** every effect now in force: worn, set bonuses, buffs */
  fx: Record<string, number> = {};
  /** pieces worn of each set */
  sets: Record<string, number> = {};
  private wornFx: Record<string, number> = {};
  private xSig = '';
  private rage = 0;
  private rageT = 0;
  private calm = 0;
  private critCd = 0;
  private lastFire = 0;
  private bellDay = -1;
  private light: THREE.PointLight | null = null;
  private cursed = new Map<Target, number>();
  private t = 0;
  /** numbers for tests */
  readonly stats = { thorns: 0, wardSaved: 0, gold: 0, veils: 0, uses: 0 };

  constructor(private d: GearDeps) {
    const p = d.player, rt = d.rt;
    events.on('equipmentChanged', () => this.recompute());
    // Damage dealt: banes, backs, charges, crowds, weather, the Dark, a curse.
    const prevMelee = p.meleeBonus;
    p.meleeBonus = (t) => {
      const a = prevMelee?.(t) ?? { mult: 1, crit: false };
      return { mult: a.mult * this.dealt(t, true), crit: a.crit };
    };
    GEAR.shotMult = (t) => this.dealt(t, false);
    GEAR.gather = (k) => (k === 'yield' ? this.fx.oreYield ?? 0 : 0);
    // Damage taken: wards against a kind of foe, the desert, the sea; thorns, rage, a blocked blow's healing.
    const recv = p.receiveAttack.bind(p);
    p.receiveAttack = (att: IncomingAttack) => {
      const f = this.fx, src = this.attacker(att.from);
      let k = 1;
      if (src) {
        k -= f['ward_' + familyOf(src.kind)] ?? 0;
        if (/wolf/i.test(src.kind)) k -= f.ward_wolf ?? 0;
        if (this.calm > 0 && familyOf(src.kind) === 'beast') k -= 0.4;
      }
      if (att.poison) k -= f.ward_venom ?? 0;
      if (att.burn) k -= f.ward_fire ?? 0;
      k = Math.max(0.2, k);
      if (k < 1) this.stats.wardSaved += att.damage * (1 - k);
      const r = recv(k < 1 ? { ...att, damage: att.damage * k, ...(att.poison ? { poison: att.poison * k } : {}) } : att);
      if (r === 'hit' || r === 'blocked' || r === 'guardBroken') {
        this.combatT = 0;
        if (f.thorns && src?.alive) {
          rt.hit(src, f.thorns, { poise: 10, source: 'melee', noVerdict: true });
          this.stats.thorns++;
        }
      }
      if (r === 'hit' && f.rage) {
        this.rage = Math.min(f.rage, this.rage + 0.03);
        this.rageT = 8;
      }
      if (r === 'blocked' && f.blockHeal) p.heal(f.blockHeal);
      return r;
    };
    // The Phoenix Tear and Second Dawn: the first killing blow leaves you standing.
    const cheat = p.cheatDeath;
    p.cheatDeath = () => {
      if (cheat?.()) return true;
      if (!d.arms.buffs.has('phoenix')) return false;
      d.arms.buffs.delete('phoenix');
      p.hp = p.maxHp * 0.5;
      d.toast('The phoenix fire catches you: you stand back up.');
      rt.vfx.burst(p.center.clone(), 'fire', 1.6, 6);
      return true;
    };
    events.on('parrySuccess', () => {
      if (this.fx.parryStamina) p.stamina = Math.min(p.maxStamina, p.stamina + this.fx.parryStamina);
    });
    const surge = () => {
      if (!this.fx.styleSurge) return;
      rt.flow = Math.min(rt.flowMax, rt.flow + 1);
      rt.cc.focus = Math.min(rt.cc.focusMax, rt.cc.focus + 10);
    };
    events.on('perfectParry', surge);
    events.on('perfectDodge', surge);
    events.on('enemyHit', ({ crit }) => {
      this.combatT = 0;
      if (crit && this.fx.critGold && this.critCd <= 0) {
        d.gold(this.fx.critGold);
        this.stats.gold += this.fx.critGold;
        this.critCd = 0.4;
      }
      if (this.fx.hitMana) p.mana = Math.min(p.maxMana, p.mana + this.fx.hitMana);
    });
    events.on('enemyDied', ({ at, kind }) => {
      this.cursed.forEach((_, t) => !t.alive && this.cursed.delete(t));
      if (at.distanceTo(p.pos) > 30) return;
      const f = this.fx;
      if (f.killVeil) {
        stealth.gearVeil = Math.max(stealth.gearVeil, f.killVeil);
        this.stats.veils++;
      }
      if (f.killHeal) p.heal(f.killHeal);
      const [xp, gold] = XP_FOR_KIND[kind] ?? [0, 0];
      if (f.goldFind && gold > 0) d.gold(Math.max(1, Math.round(gold * f.goldFind)));
      if (f.xpGain && xp > 0) d.xp(Math.max(1, Math.round(xp * f.xpGain)));
      if (f.scrapFind && Math.random() < f.scrapFind) d.give('scrapMetal', 1);
      if (f.beastLoot && familyOf(kind) === 'beast' && Math.random() < f.beastLoot * 2) d.give(Math.random() < 0.5 ? 'rawHide' : 'rawMeat', 1);
    });
    events.on('wheelTravel', () => {
      if (this.fx.wheelHeal) {
        p.hp = p.maxHp;
        p.stamina = p.maxStamina;
      }
      if (this.fx.wheelSurge) d.arms.buffs.set('wheelSurge', { id: 'wheelSurge', label: 'Wrong-Turning', left: 60, m: { melee: this.fx.wheelSurge } });
    });
    events.on('masteryGained', ({ id, n }) => {
      const v = this.fx.masteryGain ?? 0;
      if (v > 0) p.paths.mx[id] = (p.paths.mx[id] ?? 0) + n * v;
    });
    events.on('playerDamaged', () => (this.combatT = 0));
    this.recompute();
  }
  private combatT = 99;

  /** What you wear, added up (on every change of gear). */
  recompute() {
    const eq = this.d.player.equip;
    const fx: Record<string, number> = {};
    const add = (src: Record<string, number> | undefined, k = 1) => {
      for (const [key, v] of Object.entries(src ?? {})) fx[key] = (fx[key] ?? 0) + v * k;
    };
    const sets: Record<string, number> = {};
    let breath = 0;
    const owned = new Set(eq.items.map((it) => it.def.id));
    const fullWheel = TOKENS.every((t) => owned.has(t.id));
    for (const slot of Object.keys(eq.equipped) as (keyof typeof eq.equipped)[]) {
      const it = eq.inSlot(slot);
      if (!it) continue;
      const def = it.def;
      const twice = fullWheel && def.id.startsWith('sunwheelToken');
      add(def.fx, twice ? 2 : 1);
      if (twice) for (const [k, v] of Object.entries(def.stats)) if (STAT_MODS[k]) fx['$' + STAT_MODS[k]] = (fx['$' + STAT_MODS[k]] ?? 0) + (v as number);
      if (def.set) sets[def.set] = (sets[def.set] ?? 0) + 1;
      breath += def.stats.waterBreathing ?? 0;
    }
    for (const [id, n] of Object.entries(sets)) {
      const s = SET[id];
      if (!s) continue;
      if (n >= 2) add(s.bonus[2]);
      if (n >= 4) add(s.bonus[4]);
      if (n >= 6) add(s.bonus[6]);
    }
    this.sets = sets;
    this.wornFx = fx;
    this.d.player.breathTime = 25 + breath;
    this.refresh();
  }

  /** Worn effects plus the effects of what you have drunk and eaten. */
  private refresh() {
    const fx: Record<string, number> = { ...this.wornFx };
    for (const b of this.d.arms.buffs.values()) {
      for (const [k, v] of Object.entries(b.m)) if (!COMBAT_KEYS.has(k)) fx[k] = (fx[k] ?? 0) + v;
    }
    this.fx = fx;
    // Skill-runtime keys (fire, wind, holy damage) ride in through its extra hook.
    const sig = ['fireDmg', 'windDmg', 'holyDmg'].map((k) => fx[k] ?? 0).join(',');
    if (sig !== this.xSig) {
      this.xSig = sig;
      this.d.rt.recompute();
    }
  }

  /** The skill runtime's named effects from gear (paths/skills.ts extra). */
  x(): Record<string, number> {
    const f = this.fx;
    return { fireDmg: f.fireDmg ?? 0, windDmg: f.windDmg ?? 0, holyDmg: f.holyDmg ?? 0 };
  }

  /** A blow (or a shot) against `t`: the multiplier gear gives it. */
  private dealt(t: Target, melee: boolean) {
    const f = this.fx, p = this.d.player;
    let m = 1 + (f['bane_' + familyOf(t.kind)] ?? 0) + (/wolf/i.test(t.kind) ? f.bane_wolf ?? 0 : 0);
    if (f.backstab && this.d.arms.behind(t)) m += f.backstab;
    if (melee && f.sprintHit && p.act?.def.id === 'sprintAttack') m += f.sprintHit;
    if (f.crowdDmg && this.foesNear(8) >= 2) m += f.crowdDmg;
    if (f.rainDmg && this.d.rain() > 0.3) m += f.rainDmg;
    const h = this.d.hour();
    if (f.nightDmg && (h >= 20 || h < 5)) m += f.nightDmg;
    if (f.darkDmg && this.d.inDark?.()) m += f.darkDmg;
    if (f.lowHp && p.hp < p.maxHp / 3) m += f.lowHp;
    if (f.seaDmg && SEA.test(this.d.region())) m += f.seaDmg;
    if (this.cursed.has(t)) m += 0.25;
    return m + this.rage;
  }

  private foesNear(r: number) {
    let n = 0;
    const p = this.d.player.pos;
    for (const t of targets) if (t.alive && t.lockable && t.position.distanceTo(p) < r) n++;
    return n;
  }
  private attacker(from: THREE.Vector3): Target | null {
    let best: Target | null = null, bd = 4;
    for (const t of targets) {
      if (!t.alive) continue;
      const dd = t.position.distanceTo(from);
      if (dd < bd) (best = t), (bd = dd);
    }
    return best;
  }
  private nearest(r: number) {
    let best: Target | null = null, bd = r;
    const p = this.d.player.pos;
    for (const t of targets) {
      if (!t.alive || !t.lockable) continue;
      const dd = t.position.distanceTo(p);
      if (dd < bd) (best = t), (bd = dd);
    }
    return best;
  }

  /** Every step, before the arms runtime adds its modifiers. */
  update(dt: number) {
    const d = this.d, p = d.player, f = this.fx;
    this.t += dt;
    this.critCd -= dt;
    this.combatT += dt;
    this.calm = Math.max(0, this.calm - dt);
    stealth.gearVeil = Math.max(0, stealth.gearVeil - dt);
    if ((this.rageT -= dt) <= 0) this.rage = 0;
    for (const [t, v] of this.cursed) v - dt <= 0 || !t.alive ? this.cursed.delete(t) : this.cursed.set(t, v - dt);
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) this.refresh();
    // Combat modifiers: worn effects that name one, and the places and moments that change them.
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.wornFx)) if (MOD_KEYS[k]) m[MOD_KEYS[k]] = (m[MOD_KEYS[k]] ?? 0) + v;
    for (const [k, v] of Object.entries(this.wornFx)) if (k.startsWith('$')) m[k.slice(1)] = (m[k.slice(1)] ?? 0) + v;
    if (f.poiseDmg && !this.wornFx.poiseDmg) m.poise = (m.poise ?? 0) + f.poiseDmg;
    else if (f.poiseDmg && f.poiseDmg !== this.wornFx.poiseDmg) m.poise = (m.poise ?? 0) + f.poiseDmg - this.wornFx.poiseDmg;
    const reg = d.region();
    if (reg === 'goldenExpanse') {
      if (f.sandSpeed) m.moveSpeed = (m.moveSpeed ?? 0) + f.sandSpeed;
      if (f.desertWard) m.dmgTaken = (m.dmgTaken ?? 0) - f.desertWard;
    }
    if (f.seaDmg && SEA.test(reg)) m.dmgTaken = (m.dmgTaken ?? 0) - f.seaDmg / 2;
    if (f.wildsSpell && !d.inTown?.()) m.manaCost = (m.manaCost ?? 0) - f.wildsSpell;
    GEAR.mods = m;
    GEAR.fishLuck = f.fishLuck ?? 0;
    // Fire resistance on top of the origin's own.
    const want = Math.max(0, Math.min(0.9 - (p.fireResist - this.lastFire), f.fireResist ?? 0));
    p.fireResist += want - this.lastFire;
    this.lastFire = want;
    // Out of combat, some gear mends you.
    if (f.oocRegen && this.combatT > 6 && p.hp < p.maxHp && !p.dead) p.hp = Math.min(p.maxHp, p.hp + f.oocRegen * dt);
    // The Bell of the Glen, once a day.
    if (f.allyCall && !p.dead && p.hp < p.maxHp / 3 && this.bellDay !== d.day()) {
      this.bellDay = d.day();
      d.arms.buffs.set('bell', { id: 'bell', label: 'The Bell of the Glen', left: 60, m: { melee: 0.15, dmgTaken: -0.1 } });
      d.toast('Far off, a bell rings over the Glen. You are not alone.');
    }
    // Light: a lantern, a torch, a rune, a token.
    const lit = (f.lightRoom ?? 0) > 0;
    if (lit && !this.light) {
      this.light = new THREE.PointLight(0xffd8a0, 2.2, 14, 1.6);
      d.scene.add(this.light);
    }
    if (this.light) {
      this.light.visible = lit;
      if (lit) this.light.position.copy(p.pos).add(new THREE.Vector3(0, 2.2, 0));
    }
  }

  // ---- one-use items -------------------------------------------------------------------------
  /** Something from the catalog was used (after its stats and buff). */
  consume(def: ItemDef) {
    const d = this.d, p = d.player, rt = d.rt, f = this.fx;
    if (f.potionPower && def.stats.heal) p.heal(def.stats.heal * f.potionPower);
    const u = def.use;
    if (!u) return;
    this.stats.uses++;
    const style = STYLE[u.style ?? 'fire'] ?? 'fire';
    const ahead = () => p.pos.clone().addScaledVector(p.forward, 4);
    const aim = (r: number) => rt.aim(r);
    const opts = (s?: string) => ({ poise: 60, fire: s === 'fire', ...(s === 'frost' ? { type: 'frost' as const } : s === 'light' ? { type: 'holy' as const } : {}) });
    const freezeAll = (list: Target[]) => list.forEach((t) => t.alive && afflictions.freeze(t));
    const stunAll = (list: Target[]) => list.forEach((t) => t.alive && (t.stunned = true));
    const holy = (at: THREE.Vector3, n: number, r: number) => {
      const hit = rt.area(at, r, n, { poise: 80, type: 'holy' });
      for (const t of hit) if (familyOf(t.kind) === 'undead' && t.alive) rt.hit(t, n * 2, { poise: 0, type: 'holy', noVerdict: true });
      rt.vfx.burst(at.clone().setY(at.y + 0.8), 'light', 1.6, r + 2);
      return hit;
    };
    const buff = (id: string, label: string, sec: number, m: Record<string, number>) => d.arms.buffs.set(id, { id, label, left: sec, m });
    switch (u.kind) {
      case 'bomb': {
        const at = ahead();
        rt.vfx.burst(at.clone().setY(at.y + 0.6), style, 1.6, 6);
        const hit = rt.area(at, u.r ?? 3, u.n ?? 40, { ...opts(u.style), poise: 90 });
        if (u.style === 'frost') freezeAll(hit);
        if (u.style === 'steel') hit.forEach((t) => rt.bleed(t, 5));
        break;
      }
      case 'veil':
        stealth.gearVeil = Math.max(stealth.gearVeil, u.sec ?? 4);
        rt.vfx.burst(p.center.clone(), 'shadow', 1.4, 4);
        d.toast('You slip out of sight.');
        break;
      case 'rot': {
        const at = ahead();
        rt.vfx.burst(at.clone().setY(at.y + 0.6), 'blood', 1.2, 5);
        const hit = rt.area(at, u.r ?? 3, 1, { poise: 10 });
        for (let i = 1; i <= (u.sec ?? 6); i++) rt.later(i, () => hit.forEach((t) => rt.tick(t, u.n ?? 6)));
        break;
      }
      case 'stun':
        stunAll(rt.area(p.pos, u.r ?? 5, 1, { poise: 200, stun: true }));
        rt.vfx.ring(p.pos, 'light', u.r ?? 5);
        break;
      case 'stunAhead': {
        const at = ahead();
        stunAll(rt.area(at, u.r ?? 3, u.n ?? 1, { poise: 200, stun: true }));
        rt.vfx.burst(at.clone().setY(at.y + 0.5), 'steel', 1, 4);
        break;
      }
      case 'caltrops':
        rt.area(p.pos, u.r ?? 4, 1, { poise: 5 }).forEach((t) => rt.bleed(t, u.n ?? 4));
        rt.vfx.ring(p.pos, 'steel', u.r ?? 4);
        break;
      case 'blast':
        rt.area(p.pos, u.r ?? 4, u.n ?? 50, { poise: 220 });
        rt.vfx.ring(p.pos, 'wind', u.r ?? 4);
        break;
      case 'holy':
        holy(ahead(), u.n ?? 50, u.r ?? 3);
        break;
      case 'holyArea':
        holy(p.pos.clone(), u.n ?? 60, u.r ?? 8);
        break;
      case 'gloam': {
        const at = ahead();
        stunAll(rt.area(at, u.r ?? 3.5, u.n ?? 90, { poise: 120, type: 'arcane' }));
        rt.vfx.burst(at.clone().setY(at.y + 0.6), 'shadow', 1.8, 6);
        break;
      }
      case 'calm': {
        const want = u.style === 'sea' ? 'sea' : 'beast';
        for (const t of targets) if (t.alive && familyOf(t.kind) === want && t.position.distanceTo(p.pos) < (u.r ?? 10)) t.stunned = true;
        if (want === 'beast') this.calm = 60;
        rt.vfx.ring(p.pos, 'light', u.r ?? 10);
        break;
      }
      case 'bolt': {
        const { target } = aim(24);
        if (!target) return d.toast('The scroll crumbles: nothing to aim at.');
        rt.hit(target, u.n ?? 40, opts(u.style));
        if (u.style === 'frost' && Math.random() < 0.4) afflictions.freeze(target);
        rt.vfx.burst(target.center.clone(), style, 1.2, 4);
        break;
      }
      case 'ball': {
        const { point } = aim(24);
        rt.area(point, u.r ?? 3.5, u.n ?? 60, opts(u.style));
        rt.vfx.burst(point.clone().setY(point.y + 0.8), style, 1.8, 6);
        break;
      }
      case 'wall':
        for (const k of [2, 4, 6]) {
          const at = p.pos.clone().addScaledVector(p.forward, k);
          rt.area(at, 2, u.n ?? 60, opts(u.style));
          rt.vfx.burst(at.clone().setY(at.y + 0.6), style, 1.2, 3);
        }
        break;
      case 'meteor': {
        const { point } = aim(30);
        rt.vfx.meteor(point.clone(), style, u.r ?? 5, 1.1, () => rt.area(point, u.r ?? 5, u.n ?? 200, { ...opts(u.style), poise: 200 }));
        break;
      }
      case 'gust':
        rt.area(p.pos, u.r ?? 6, u.n ?? 25, { poise: 160, cone: { dir: p.forward.clone(), cos: 0.4 }, type: 'arcane' });
        rt.vfx.slash(p.pos.clone().setY(p.pos.y + 1), Math.atan2(p.forward.x, p.forward.z), u.r ?? 6, 'wind');
        break;
      case 'blink': {
        const to = p.pos.clone().addScaledVector(p.forward, u.n ?? 8);
        p.teleport(to);
        rt.vfx.burst(p.center.clone(), 'wind', 1.2, 3);
        break;
      }
      case 'buff':
        if (u.style === 'haste') buff('scrollHaste', 'Haste', u.sec ?? 20, { attackSpeed: 0.2, moveSpeed: 0.2 });
        if (u.style === 'ice') buff('scrollIce', 'Ice Armour', u.sec ?? 30, { dmgTaken: -0.3 });
        if (u.style === 'feather') buff('scrollFeather', 'Feather Step', u.sec ?? 60, { dodgeCost: -0.5 });
        break;
      case 'ward':
        rt.shield(u.n ?? 120, u.sec ?? 10, 'ward', style);
        break;
      case 'heal':
        p.heal(u.n ?? 100);
        rt.vfx.burst(p.center.clone(), 'light', 1.2, 3);
        break;
      case 'mote':
        p.heal(u.n ?? 50);
        buff('light', 'Mote of Light', u.sec ?? 300, { lightRoom: 1 });
        break;
      case 'chains':
        stunAll(rt.area(p.pos, u.r ?? 6, u.n ?? 60, { poise: 120, type: 'holy', stun: true }));
        rt.vfx.ring(p.pos, 'light', u.r ?? 6);
        break;
      case 'phoenix':
        buff('phoenix', def.name, u.sec ?? def.buff?.sec ?? 600, {});
        break;
      case 'freeze': {
        const hit = rt.area(p.pos, u.r ?? 5, u.n ?? 40, { ...opts(u.style), poise: 150, stun: true });
        if (u.style === 'frost') freezeAll(hit);
        else stunAll(hit);
        rt.vfx.ring(p.pos, style, u.r ?? 5);
        break;
      }
      case 'shadowStep': {
        const { target } = aim(16);
        if (!target) return d.toast('There is no one to step behind.');
        const away = target.position.clone().sub(p.pos).setY(0).normalize();
        p.teleport(target.position.clone().addScaledVector(away, target.radius + 1.2));
        stealth.gearVeil = Math.max(stealth.gearVeil, u.sec ?? 3);
        rt.vfx.burst(p.center.clone(), 'shadow', 1.2, 3);
        break;
      }
      case 'curse': {
        const { target } = aim(20);
        if (!target) return d.toast('There is no one to curse.');
        this.cursed.set(target, u.sec ?? 20);
        rt.vfx.ring(target.position, 'shadow', 1.4);
        break;
      }
      case 'siphon': {
        const { target } = aim(16);
        if (!target) return d.toast('There is nothing to drain.');
        p.heal(rt.hit(target, u.n ?? 60, { poise: 30, type: 'arcane' }));
        rt.vfx.beam(() => target.center, () => p.center, 'blood', () => false);
        break;
      }
      case 'summon': {
        const n = u.n ?? 18;
        for (let i = 1; i <= (u.sec ?? 6); i++) {
          rt.later(i, () => {
            const t = this.nearest(10);
            if (!t) return;
            rt.hit(t, n, { poise: 30, source: 'spell', noVerdict: true });
            rt.vfx.burst(t.center.clone(), style, 0.8, 2);
          });
        }
        d.toast(u.style === 'steel' ? 'A grey watchman steps out of the air beside you.' : 'A pale wolf pads out of nowhere and goes for them.');
        break;
      }
      case 'recall':
        if (!d.recall?.()) d.toast('You have not touched a Sunwheel yet: the shard only crumbles.');
        break;
      case 'return':
        if (!d.returnHome?.()) d.toast('The rune has nowhere to take you.');
        break;
      case 'detect': {
        const name = d.detect?.();
        d.toast(name ? `Your eye falls on something: ${name}. It is on your map now.` : 'There is nothing near you that you have not found.');
        break;
      }
      case 'ore': {
        const n = d.orePing?.(u.r ?? 150) ?? 0;
        d.toast(n ? `${n} vein${n > 1 ? 's' : ''} glint within ${u.r ?? 150} m.` : 'No ore close by.');
        break;
      }
      case 'light':
        buff('light', def.name, u.sec ?? 300, { lightRoom: 1 });
        break;
      case 'breath':
        p.waterBreathT = Math.max(p.waterBreathT, u.sec ?? 120);
        p.breath = 1;
        break;
      case 'mend':
        p.heal(p.maxHp * 0.5);
        rt.vfx.burst(p.center.clone(), 'light', 1.2, 3);
        break;
      case 'bind': {
        const { target } = aim(20);
        if (!target) return d.toast('There is nothing to bind.');
        rt.hit(target, 1, { poise: 999, stun: true, noVerdict: true });
        for (let i = 1; i <= (u.sec ?? 5) * 2; i++) rt.later(i / 2, () => target.alive && (target.stunned = true));
        rt.vfx.ring(target.position, 'shadow', 1.6);
        break;
      }
      case 'nova':
        rt.area(p.pos, u.r ?? 5, u.n ?? 120, { ...opts(u.style), poise: 160 });
        rt.vfx.pillar(p.pos.clone(), style, u.r ?? 5, 7);
        break;
      case 'silence':
        stunAll(rt.area(p.pos, u.r ?? 6, 1, { poise: 150, stun: true }));
        stealth.gearVeil = Math.max(stealth.gearVeil, u.sec ?? 3);
        rt.vfx.ring(p.pos, 'shadow', u.r ?? 6);
        break;
    }
    // Lenses and spyglasses are kept.
    if (u.n === 0) p.equip.add(def.id, 1);
  }
}
