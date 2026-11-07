import * as THREE from 'three';
import { R, type SkillDef, type SkillRuntime, type Pending, type HitOpts } from '../skills';
import { DISC } from '../data';
import type { Style } from '../../magic/circles';
import type { DmgType } from '../../combat/core';
import type { Target } from '../../combat/targets';
import type { NumMod } from '../effects';
import { physics } from '../../physics/physics';
import { ROSTER_SPECS } from '../roster';

// The skill forge: one place that builds a working, flashy skill from a short
// spec, so every tree (the later classes, the hidden ones, Oathbreaker's) gets
// real techniques instead of "not in the game yet". A spec names an archetype
// (bolt, nova, meteor, chain lightning...), a school colour, base damage,
// cooldown and cost; the forge picks the animation, aims, deals the damage
// through the skill runtime (so crits, posture, mods and passives all apply)
// and draws it with the skill effects (paths/skillFx.ts).
//   combat classes: damage is a share of your weapon (d 20 = 100% weapon), costs stamina
//   magic and callings: damage is spell damage (d = base), costs mana

export type Kind =
  | 'bolt' | 'lance' | 'volley' | 'chain' | 'drain'
  | 'nova' | 'cone' | 'smite' | 'meteor' | 'zone'
  | 'dash' | 'blink' | 'strike' | 'whirl'
  | 'buff' | 'ward' | 'heal' | 'spirit'
  // the classes update (paths/roster): a snare that waits, a leap that lands hard, a hook that drags
  | 'trap' | 'leap' | 'grab';
export type Rider = 'burn' | 'bleed' | 'stun' | 'pull' | 'brand' | 'leech' | 'mark' | 'root' | 'chill' | 'curse' | 'venom';
type Mods = Partial<Record<NumMod, number>>;

export interface Spec {
  k: Kind;
  s: Style;
  /** damage (spell base, or % of weapon / 5 for combat); ward/heal: strength */
  d?: number;
  cd: number;
  /** mana or stamina */
  c?: number;
  /** radius (areas) or distance (blinks) */
  r?: number;
  /** projectiles in a volley, hops in a chain */
  n?: number;
  /** seconds (zones, buffs, wards, spirits, heals) */
  t?: number;
  fx?: Rider;
  /** buffs: what they change while running */
  m?: Mods;
  /** a capstone ultimate: bigger cast, bigger show */
  big?: boolean;
  say: string;
  /** class resource it gives when used (paths/roster) */
  gain?: number;
  /** class resource it spends ('all': everything there is): more damage the more it spends */
  spend?: number | 'all';
}

/**
 * The class roster's engine plugs in here (paths/roster/engine.ts), so forged
 * techniques can feed and spend a class's resource and lay its mark.
 */
export const FORGE_HOOKS: {
  gain?: (disc: string, n: number) => void;
  /** spend; returns the damage multiplier it buys */
  spend?: (disc: string, n: number | 'all') => number;
  mark?: (disc: string, t: Target, n: number) => void;
  /** the resource's name, for text */
  res?: (disc: string) => string | undefined;
  markName?: (disc: string) => string | undefined;
} = {};

/** Buff key -> the mods it adds while running (read by SkillRuntime.applyMods). */
export const FORGED_BUFFS: Record<string, Mods> = {};

const DTYPE: Record<Style, DmgType> = {
  fire: 'fire', frost: 'frost', light: 'holy', steel: 'slash', blood: 'slash', gale: 'slash',
  wind: 'blunt', shadow: 'arcane', void: 'arcane', nature: 'pierce', earth: 'blunt', water: 'blunt', storm: 'arcane',
};
const SCHOOL: Record<Style, string> = {
  fire: 'fire', frost: 'frost', light: 'holy', steel: 'steel', blood: 'blood', gale: 'wind',
  wind: 'wind', shadow: 'shadow', void: 'void', nature: 'nature', earth: 'earth', water: 'water', storm: 'lightning',
};
const RIDER: Record<Rider, string> = {
  burn: ' Sets them burning.', bleed: ' Opens bleeding wounds.', stun: ' Stuns what it hits.',
  pull: ' Drags enemies into the middle.', brand: ' Brands them with light.', leech: ' Heals you for a quarter of the damage.',
  mark: ' Marks them.', root: ' Roots them where they stand.', chill: ' Chills them to the bone.', curse: ' Curses them.', venom: ' Poisons them.',
};
const MOD_TEXT: Partial<Record<NumMod, string>> = {
  melee: 'damage', spell: 'spell damage', attackSpeed: 'attack speed', moveSpeed: 'movement speed', castSpeed: 'cast speed',
  poise: 'poise damage', crit: 'crit chance', heal: 'healing', parryWindow: 'parry window', staminaRegen: 'stamina regen', manaRegen: 'mana regen',
};

const pl = (rt: SkillRuntime) => rt['player'];
const melee = (disc: string) => DISC[disc]?.fam === 'combat';
const UP = new THREE.Vector3(0, 1, 0);

function modsText(m: Mods = {}) {
  const out: string[] = [];
  for (const [k, v] of Object.entries(m) as [NumMod, number][]) {
    if (k === 'dmgTaken') out.push(`${v < 0 ? 'take' : 'but take'} ${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'less' : 'more'} damage`);
    else if (MOD_TEXT[k]) out.push(`${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${MOD_TEXT[k]}`);
  }
  return out.join(', ');
}

/** Damage of a hit at a rank. */
function power(rt: SkillRuntime, disc: string, sp: Spec, rank: number) {
  const base = sp.d ?? 20;
  if (melee(disc)) return rt.weapon() * (base / 20) * R(rank);
  return base * rt.paths.spellPower * pl(rt).mods.spell * R(rank);
}
function dmgText(disc: string, sp: Spec, r: number, k = 1) {
  const base = (sp.d ?? 20) * k;
  return melee(disc) ? `${Math.round((base / 20) * 100 * R(r))}% weapon damage` : `${Math.round(base * R(r))} ${SCHOOL[sp.s]} damage`;
}
function opts(disc: string, sp: Spec, extra: Partial<HitOpts> = {}): HitOpts {
  const m = melee(disc);
  return {
    disc,
    poise: (sp.big ? 160 : 70) * (sp.fx === 'stun' ? 1.5 : 1),
    source: m ? 'melee' : 'spell',
    type: m && (sp.k === 'strike' || sp.k === 'whirl' || sp.k === 'dash' || sp.k === 'cone') ? undefined : DTYPE[sp.s],
    stun: sp.fx === 'stun' || sp.fx === 'root',
    fire: sp.s === 'fire',
    school: sp.s,
    ...extra,
  };
}
/** What lingers after a hit lands. */
function rider(rt: SkillRuntime, sp: Spec, t: Target, dealt: number, disc = '') {
  if (!t.alive && sp.fx !== 'leech') return;
  if (sp.fx === 'mark') FORGE_HOOKS.mark?.(disc, t, 1);
  else if (sp.fx === 'chill') rt.kits.chill(t, rt.st(t), 2);
  else if (sp.fx === 'curse') rt.st(t).curse = 6 * pl(rt).mods.duration;
  else if (sp.fx === 'venom') {
    rt.bleed(t, Math.max(2, dealt * 0.15));
    rt.vfx.burst(t.center, 'nature', 0.4, 2);
  } else if (sp.fx === 'burn') rt.burn(t, 2);
  else if (sp.fx === 'bleed') rt.bleed(t, Math.max(2, dealt * 0.12));
  else if (sp.fx === 'brand') rt.brand(t);
  else if (sp.fx === 'leech') pl(rt).heal(dealt * 0.25);
}
function hitOne(rt: SkillRuntime, disc: string, sp: Spec, t: Target, amount: number, dir?: THREE.Vector3) {
  const dealt = rt.hit(t, amount, opts(disc, sp, dir ? { dir } : {}));
  rider(rt, sp, t, dealt, disc);
  return dealt;
}
function hitArea(rt: SkillRuntime, disc: string, sp: Spec, at: THREE.Vector3, r: number, amount: number, extra: Parameters<SkillRuntime['area']>[3] = {}) {
  const list = rt.area(at, r, amount, { ...opts(disc, sp), pull: sp.fx === 'pull', ...extra });
  for (const t of list) rider(rt, sp, t, amount, disc);
  return list;
}
/** Where a targeted spell lands: the locked foe, or the ground ahead. */
function landing(p: Pending) {
  return p.target?.alive ? p.target.position.clone() : p.point.clone();
}

/** The animation for an archetype (and which kinds fire on every event, not just the first). */
function actionFor(disc: string, sp: Spec): string | undefined {
  const m = melee(disc);
  switch (sp.k) {
    case 'blink': return undefined;
    case 'trap': return m ? 'sk_bash' : 'sk_castSelf';
    case 'leap': return 'sk_quake';
    case 'grab': return m ? 'sk_bash' : 'sk_cast';
    case 'strike': return 'sk_quake';
    case 'whirl': return 'sk_crescent';
    case 'dash': return m ? 'sk_bullRush' : 'sk_dash';
    case 'cone': return m ? 'sk_bash' : 'sk_cast';
    case 'buff': case 'ward': case 'heal': case 'spirit': return m ? 'sk_warcry' : sp.big ? 'sk_castBig' : 'sk_castSelf';
    case 'nova': return m ? 'sk_quake' : sp.big ? 'sk_castBig' : 'sk_cast';
    case 'smite': case 'meteor': case 'chain': return m ? 'sk_quake' : sp.big ? 'sk_castBig' : 'sk_cast';
    default: return sp.big ? 'sk_castBig' : 'sk_cast';
  }
}

type Run = { skip?: Set<number> };

/** Do the thing. Called on the action's events (or at once for blinks). */
function fire(rt: SkillRuntime, disc: string, key: string, sp: Spec, p: Pending & Run) {
  const P = pl(rt), V = rt.vfx, s = sp.s;
  const amt = power(rt, disc, sp, p.rank) * (p.k ?? 1);
  const big = sp.big ? 1.5 : 1;
  switch (sp.k) {
    case 'bolt':
    case 'drain':
    case 'lance': {
      const from = melee(disc) ? rt.hand() : rt.castFrom();
      V.gather(from, s, 0.8 * big);
      const lance = sp.k === 'lance';
      V.projectile({
        from, dir: rt.aimDir(p, from), speed: lance ? 38 : 26, range: 32, style: s, shape: lance ? 'spear' : 'orb',
        size: (lance ? 1.3 : 0.75) * big, radius: lance ? 0.5 : 0.65, pierce: lance,
        onHit: (t, at, d) => {
          hitOne(rt, disc, sp.k === 'drain' ? { ...sp, fx: 'leech' } : sp, t, amt, d);
          if (sp.r) hitArea(rt, disc, sp, at, sp.r, amt * 0.5, { skip: new Set([t.id]) });
          if (sp.k === 'drain') V.beam(() => t.center, () => P.center, s, (() => { const end = performance.now() + 450; return () => performance.now() < end; })(), 0.06);
        },
      });
      return;
    }
    case 'volley': {
      const from = melee(disc) ? rt.hand() : rt.castFrom();
      const n = sp.n ?? 5;
      const aim = rt.aimDir(p, from);
      const blade = s === 'steel' || s === 'gale' || s === 'wind' || s === 'blood';
      V.gather(from, s, 1);
      for (let i = 0; i < n; i++) {
        const dir = aim.clone().applyAxisAngle(UP, (i / Math.max(1, n - 1) - 0.5) * 0.9);
        rt.later(i * 0.05, () => V.projectile({
          from: from.clone(), dir, speed: 24, range: 22, style: s, shape: blade ? 'blade' : 'orb', size: 0.5 * big, radius: 0.55,
          onHit: (t, _a, d) => hitOne(rt, disc, sp, t, amt, d),
        }));
      }
      return;
    }
    case 'chain': {
      const from = rt.castFrom();
      let cur: Target | null = p.target?.alive ? p.target : rt.nearestEnemy(P.center, 18);
      if (!cur) {
        V.lightning(from, from.clone().addScaledVector(P.forward, 9), s, 1.4 * big);
        return;
      }
      const hit = new Set<number>();
      let src = from, k = 1;
      for (let i = 0; i < (sp.n ?? 4) && cur; i++) {
        const t: Target = cur;
        hit.add(t.id);
        const a = src.clone(), b = t.center.clone(), dmg = amt * k;
        rt.later(i * 0.09, () => {
          V.lightning(a, b, s, 1.4 * big);
          if (t.alive) hitOne(rt, disc, sp, t, dmg, b.clone().sub(a).setY(0).normalize());
        });
        src = b;
        k *= 0.85;
        cur = rt.nearestEnemy(b, 8, hit);
      }
      return;
    }
    case 'nova': {
      const r = sp.r ?? 4.5;
      hitArea(rt, disc, sp, P.pos, r, amt);
      V.nova(P.pos, s, r);
      P.onShake?.(sp.big ? 0.6 : 0.3);
      return;
    }
    case 'cone': {
      const r = sp.r ?? 6;
      hitArea(rt, disc, sp, P.pos, r, amt, { cone: { dir: P.forward, cos: 0.45 } });
      for (let i = 0; i < 36; i++) {
        const dir = P.forward.applyAxisAngle(UP, (Math.random() - 0.5) * 1.6);
        V.fx.add.spawn({ pos: P.center.addScaledVector(P.forward, 0.8), vel: dir.multiplyScalar(r * 2.6).add(new THREE.Vector3(0, (Math.random() - 0.3) * 2, 0)), spread: 1, count: 1, life: [0.25, 0.45], size: [0.3, 0.02], color: 0xffffff, color2: V.color(s), drag: 2 });
      }
      V.slash(P.center.addScaledVector(P.forward, 1.0), P.yaw, r * 0.6, s, 0.7);
      V.flash(P.center.addScaledVector(P.forward, 1.2), s, 1.2);
      return;
    }
    case 'smite': {
      const at = landing(p), r = sp.r ?? 3;
      V.groundCircle(at, s, r * 2.2, 0.8);
      rt.later(0.32, () => {
        V.pillar(at, s, Math.max(0.6, r * 0.45), 10);
        V.impact(at.clone().setY(at.y + 0.4), s, 1.1 * big);
        hitArea(rt, disc, sp, at, r, amt);
        P.onShake?.(0.3);
      });
      return;
    }
    case 'meteor': {
      const at = landing(p), r = sp.r ?? 4;
      V.groundCircle(at, s, r * 2.4, 1.3);
      V.meteor(at, s, 1.1 * big, 0.9, () => {
        hitArea(rt, disc, sp, at, r, amt);
        V.nova(at, s, r);
        P.onShake?.(0.6);
      });
      return;
    }
    case 'zone': {
      const at = landing(p), r = sp.r ?? 3.5, life = (sp.t ?? 5) * P.mods.duration;
      V.impact(at.clone().setY(at.y + 0.3), s, 0.9 * big);
      V.spiral(at, s, 2.6, r * 0.7, 24);
      V.zone({
        pos: at, radius: r, life, style: s, every: 0.5, motes: 40,
        onTick: (z) => hitArea(rt, disc, sp, z.pos, z.radius, amt * 0.22, { poise: 15 }),
      });
      return;
    }
    case 'dash': {
      // Fires on every event of the dash: cut everything you pass through, once each.
      p.skip ??= new Set();
      const hits = hitArea(rt, disc, sp, P.pos, 2 * big, amt, { skip: p.skip });
      V.fx.add.spawn({ pos: P.center, spread: 2, count: 14, life: [0.25, 0.5], size: [0.35, 0.02], color: 0xffffff, color2: V.color(s), drag: 3, jitter: 0.5 });
      V.flash(P.center, s, 0.7);
      if (hits.length) V.slash(P.center, P.yaw, 1.8, s, 1, 0.2);
      if (p.n === 0) V.ring(P.pos, s, 4);
      return;
    }
    case 'blink': {
      const dist = sp.r ?? 8, dir = P.forward, from = P.center;
      const wall = physics.castRay(from, dir, dist + 0.6);
      const go = wall === null ? dist : Math.max(0, wall - 0.7);
      if (go < 0.5) return false;
      V.impact(P.center, s, 0.8);
      const to = P.pos.clone().addScaledVector(dir, go);
      to.y += 0.3;
      P.teleport(to);
      V.nova(P.pos, s, 3);
      if (sp.d) hitArea(rt, disc, sp, P.pos, 3, amt);
      return;
    }
    case 'strike': {
      const at = P.pos.clone().addScaledVector(P.forward, 1.6), r = sp.r ?? 2.6;
      hitArea(rt, disc, sp, at, r, amt);
      V.slash(P.center.addScaledVector(P.forward, 0.9), P.yaw, r * 1.1, s, 1.2, 1.2);
      V.impact(at.clone().setY(at.y + 0.3), s, 1.1 * big);
      V.ring(at, s, r * 3);
      P.onShake?.(0.35);
      return;
    }
    case 'whirl': {
      const r = sp.r ?? 3.2;
      hitArea(rt, disc, sp, P.pos, r, amt * 0.6);
      V.spinSlash(P.pos, r, s);
      V.ring(P.pos, s, r * 2.4);
      V.flash(P.center, s, 1);
      return;
    }
    case 'buff': {
      const life = (sp.t ?? 10) * R(p.rank) * P.mods.duration;
      rt.addBuff(key, life);
      V.aura(() => P.pos, s, 1.1, life);
      V.spiral(P.pos, s, 2.8, 1.0, 30);
      V.nova(P.pos, s, sp.big ? 6 : 3);
      return;
    }
    case 'ward': {
      const life = (sp.t ?? 8) * P.mods.duration;
      rt.shield((sp.d ?? 40) * R(p.rank) * (melee(disc) ? 1 : rt.paths.spellPower), life, 'barrier', s);
      V.spiral(P.pos, s, 2.6, 1.2, 26);
      V.flash(P.center, s, 1.5);
      V.ring(P.pos, s, 4);
      return;
    }
    case 'heal': {
      const life = sp.t ?? 4, pulses = 5;
      const each = (P.maxHp * ((sp.d ?? 30) / 100) * R(p.rank)) / pulses;
      V.pillar(P.pos, s, 0.9, 6);
      V.aura(() => P.pos, s, 1.2, life);
      for (let i = 0; i < pulses; i++) rt.later((i * life) / pulses, () => {
        P.heal(each);
        V.fx.add.spawn({ pos: P.center, spread: 1.2, count: 14, life: [0.5, 1], size: [0.14, 0.01], color: 0xffffff, color2: V.color(s), upBias: 1.4, jitter: 0.6 });
      });
      return;
    }
    case 'trap': {
      // Set at your feet (or the target spot): the first foe to step in springs it.
      const at = melee(disc) ? P.pos.clone().addScaledVector(P.forward, 1.5) : landing(p), r = sp.r ?? 3, life = (sp.t ?? 20) * P.mods.duration;
      V.groundCircle(at, s, 1.2, 0.6);
      V.zone({
        pos: at, radius: 1.2, life, style: s, every: 0.2, motes: 6,
        onTick: (z) => {
          if (!V.near(z.pos, 1.6).length) return;
          z.done = true;
          hitArea(rt, disc, sp, z.pos, r, amt);
          V.nova(z.pos, s, r);
          V.impact(z.pos.clone().setY(z.pos.y + 0.4), s, 1.1 * big);
          P.onShake?.(0.25);
        },
      });
      return;
    }
    case 'leap': {
      // Up, across and down on the spot (as far as 12 m), landing hard.
      const want = landing(p), from = P.pos.clone();
      const off = want.clone().sub(from).setY(0);
      if (off.length() > 12) off.setLength(12);
      const wall = off.lengthSq() > 0.01 ? physics.castRay(P.center, off.clone().normalize(), off.length() + 0.6) : null;
      if (wall !== null) off.setLength(Math.max(0, wall - 0.7));
      const at = from.clone().add(off);
      V.groundCircle(at, s, (sp.r ?? 3.5) * 2, 0.5);
      V.spiral(from, s, 2.4, 0.8, 18);
      rt.later(0.22, () => {
        P.teleport(at.clone().setY(at.y + 0.2));
        const r = sp.r ?? 3.5;
        hitArea(rt, disc, sp, P.pos, r, amt);
        V.nova(P.pos, s, r);
        V.pillar(P.pos, s, 0.8, 5);
        P.onShake?.(0.45);
      });
      return;
    }
    case 'grab': {
      // A hook, a chain or a hand: drag the foe to you and hit it.
      const t = p.target?.alive ? p.target : rt.nearestEnemy(P.center, sp.r ?? 10);
      if (!t) return;
      const toMe = P.pos.clone().sub(t.position).setY(0).normalize();
      V.beam(() => P.center, () => t.center, s, (() => { const end = performance.now() + 300; return () => performance.now() < end; })(), 0.07);
      hitOne(rt, disc, sp, t, amt, toMe);
      rt.hit(t, 1, { poise: 260, dir: toMe, noVerdict: true, kit: true });
      V.burst(t.center, s, 0.7, 3);
      return;
    }
    case 'spirit': {
      // A spectral familiar circles you and strikes the nearest foe every second.
      const life = (sp.t ?? 15) * P.mods.duration;
      rt.addBuff(key, life);
      const t0 = performance.now();
      const at = () => {
        const a = (performance.now() - t0) / 600;
        return P.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 1.9 + Math.sin(a * 2) * 0.2, Math.sin(a) * 1.4));
      };
      V.orb(at, s, sp.big ? 1.3 : 0.9, () => rt.buff(key));
      V.spiral(P.pos, s, 2.6, 1, 26);
      V.zone({
        pos: P.pos.clone(), follow: () => P.pos, radius: 10, life, style: s, every: 1, motes: 0, circle: false,
        onTick: () => {
          const t = rt.nearestEnemy(P.center, 11);
          if (!t) return;
          const from = at();
          V.lightning(from, t.center, s, sp.big ? 1.4 : 0.9);
          hitOne(rt, disc, sp, t, amt * 0.45, t.center.clone().sub(from).setY(0).normalize());
        },
      });
      return;
    }
  }
}

function text(disc: string, sp: Spec): SkillDef['text'] {
  return (r) => {
    const d = dmgText(disc, sp, r);
    const fx = sp.fx ? RIDER[sp.fx] : '';
    const t = (x?: number) => `${Math.round((x ?? 10) * (sp.k === 'buff' ? R(r) : 1))} s`;
    let what = '';
    switch (sp.k) {
      case 'bolt': what = `Deals ${d}${sp.r ? `, splashing ${sp.r} m around` : ''}.`; break;
      case 'drain': what = `Deals ${d} and drinks a quarter of it back as health.`; break;
      case 'lance': what = `Pierces everything in a line for ${d}.`; break;
      case 'volley': what = `Looses ${sp.n ?? 5} in a fan, each for ${d}.`; break;
      case 'chain': what = `Leaps between up to ${sp.n ?? 4} enemies for ${d}, a little less each hop.`; break;
      case 'nova': what = `Bursts out ${sp.r ?? 4.5} m around you for ${d}.`; break;
      case 'cone': what = `Blasts a ${sp.r ?? 6} m cone in front of you for ${d}.`; break;
      case 'smite': what = `Strikes the target spot (${sp.r ?? 3} m) for ${d}.`; break;
      case 'meteor': what = `Calls it down on your target: ${d} across ${sp.r ?? 4} m.`; break;
      case 'zone': what = `Leaves a ${sp.r ?? 3.5} m field for ${t(sp.t)} that deals ${dmgText(disc, sp, r, 0.22)} twice a second.`; break;
      case 'dash': what = `Surge forward, hitting everything you pass for ${d}.`; break;
      case 'blink': what = `Vanish and reappear ${sp.r ?? 8} m ahead${sp.d ? `, bursting for ${d} where you land` : ''}.`; break;
      case 'strike': what = `A crushing blow in front of you for ${d}.`; break;
      case 'whirl': what = `Two spinning cuts around you, each for ${dmgText(disc, sp, r, 0.6)}.`; break;
      case 'buff': what = `For ${t(sp.t)}: ${modsText(sp.m)}.`; break;
      case 'ward': what = `A barrier soaks up ${Math.round((sp.d ?? 40) * R(r))} damage for ${t(sp.t ?? 8)}.`; break;
      case 'heal': what = `Restores ${Math.round((sp.d ?? 30) * R(r))}% of your health over ${t(sp.t ?? 4)}.`; break;
      case 'spirit': what = `For ${t(sp.t ?? 15)} it strikes the nearest enemy every second for ${dmgText(disc, sp, r, 0.45)}.`; break;
      case 'trap': what = `Set a trap that waits ${t(sp.t ?? 20)}; the first enemy to step on it springs it for ${d} across ${sp.r ?? 3} m.`; break;
      case 'leap': what = `Leap up to 12 m onto the target spot and land for ${d} across ${sp.r ?? 3.5} m.`; break;
      case 'grab': what = `Drag an enemy up to ${sp.r ?? 10} m away to you, hitting it for ${d}.`; break;
    }
    const res = FORGE_HOOKS.res?.(disc);
    const eco = res ? `${sp.gain ? ` Gives ${sp.gain} ${res}.` : ''}${sp.spend ? (sp.spend === 'all' ? ` Spends all your ${res}: up to twice the damage at full.` : ` Spends ${sp.spend} ${res} for half again the damage, if you have it.`) : ''}` : '';
    const fxText = sp.fx === 'mark' && FORGE_HOOKS.markName?.(disc) ? ` Lays ${FORGE_HOOKS.markName(disc)} on them.` : fx;
    return `${sp.say} ${what}${fxText}${eco}`;
  };
}

/** Turn a discipline's specs into SkillDefs keyed 'disc:Name'. */
export function forge(disc: string, specs: Record<string, Spec>): Record<string, SkillDef> {
  const out: Record<string, SkillDef> = {};
  const m = melee(disc);
  for (const [name, sp] of Object.entries(specs)) {
    const key = `${disc}:${name}`;
    if (sp.k === 'buff' && sp.m) FORGED_BUFFS[key] = sp.m;
    const action = actionFor(disc, sp);
    const cost = sp.c ?? (sp.big ? 40 : 18);
    const every = sp.k === 'dash' || sp.k === 'whirl';
    const def: SkillDef = {
      cd: sp.cd,
      ...(m ? { stamina: cost } : { mana: cost }),
      freeAim: true,
      range: sp.k === 'chain' ? 18 : 22,
      text: text(disc, sp),
    };
    // The class economy: spend before the first blow lands, gain when it's used.
    const economy = (p: Pending) => {
      if (p.n > 0 || (p as Pending & { paid?: boolean }).paid) return;
      (p as Pending & { paid?: boolean }).paid = true;
      if (sp.spend) p.k *= FORGE_HOOKS.spend?.(disc, sp.spend) ?? 1;
      if (sp.gain) FORGE_HOOKS.gain?.(disc, sp.gain);
    };
    if (action) {
      def.action = action;
      def.on = (rt, p, ev) => {
        if (!every && p.n > 0) return;
        void ev;
        economy(p);
        fire(rt, disc, key, sp, p);
      };
    } else {
      def.now = (rt, p) => {
        if (!pl(rt).canAct) return false;
        economy(p);
        return fire(rt, disc, key, sp, p);
      };
    }
    out[key] = def;
  }
  return out;
}

// ======================================================================================
// The specs
// ======================================================================================
type S = Spec;
const k = (kind: Kind, s: Style, cd: number, say: string, o: Partial<S> = {}): S => ({ k: kind, s, cd, say, ...o });

const SPECS: Record<string, Record<string, S>> = {
  // ---- combat classes -------------------------------------------------------------------
  dawnblade: {
    'Dawn Strike': k('strike', 'light', 5, 'Bring your blade down wrapped in morning light.', { d: 32, c: 18, fx: 'brand' }),
    'Solar Arc': k('whirl', 'light', 8, 'Spin, trailing two arcs of sunfire.', { d: 30, c: 22, r: 3.4 }),
    Sunburst: k('nova', 'light', 14, 'Slam your sword down and the light breaks out of it.', { d: 34, c: 28, r: 5, fx: 'stun' }),
    'Wrath of Morning': k('meteor', 'light', 45, 'Call the morning star down on your foe.', { d: 80, c: 40, r: 5.5, big: true, fx: 'brand' }),
    'Sanctified Ground': k('zone', 'light', 16, 'Hallow the ground at your feet; the unholy burn in it.', { d: 30, c: 20, r: 3.6, t: 8 }),
    'Aegis of Dawn': k('ward', 'light', 20, 'A shell of dawnlight closes around you.', { d: 45, c: 20, t: 10 }),
    'Rising Light': k('heal', 'light', 30, 'Kneel, and the light lifts you back up.', { d: 30, c: 22, t: 4 }),
    Daybreak: k('buff', 'light', 60, 'The sun stands still over you.', { c: 35, t: 12, m: { dmgTaken: -0.3, melee: 0.25 }, big: true }),
    Sunstep: k('dash', 'light', 7, 'A streak of gold across the field.', { d: 18, c: 18 }),
    'Judgment Leap': k('smite', 'light', 10, 'Leap, and land as a pillar of light.', { d: 34, c: 24, r: 3 }),
    'Radiant Charge': k('dash', 'light', 12, 'Charge shield-first, blazing.', { d: 28, c: 26, fx: 'stun' }),
    'Hour of the Sun': k('buff', 'light', 60, 'For a little while you are the noon.', { c: 35, t: 15, m: { attackSpeed: 0.3, moveSpeed: 0.2, melee: 0.2 }, big: true }),
  },
  warbreaker: {
    Skullsplitter: k('strike', 'blood', 6, 'An overhead blow meant to end the argument.', { d: 40, c: 22, fx: 'bleed' }),
    Earthbreaker: k('nova', 'blood', 10, 'Drive the blade into the ground and split it.', { d: 30, c: 28, r: 4.5, fx: 'stun' }),
    'Ruinous Blow': k('strike', 'blood', 16, 'Everything you have, in one swing.', { d: 72, c: 35, r: 3, fx: 'stun' }),
    'The Last Swing': k('whirl', 'blood', 45, 'A storm of steel that clears the field.', { d: 70, c: 40, r: 5.5, big: true, fx: 'bleed' }),
    'Blood Howl': k('buff', 'blood', 20, 'Howl until your blood answers.', { c: 15, t: 10, m: { melee: 0.2, poise: 0.2 } }),
    Frenzy: k('buff', 'blood', 24, 'Stop thinking. Swing.', { c: 15, t: 8, m: { attackSpeed: 0.3, dmgTaken: 0.1 } }),
    Rampage: k('dash', 'blood', 12, 'Run straight through them.', { d: 26, c: 25, fx: 'bleed' }),
    'Avatar of War': k('buff', 'blood', 70, 'Become the thing the orcs sing about.', { c: 40, t: 15, m: { melee: 0.35, dmgTaken: -0.25, poise: 0.4 }, big: true }),
    'Shrug Off': k('heal', 'blood', 25, 'Spit, roll your shoulders, keep going.', { d: 25, c: 15, t: 3 }),
    'Iron Roar': k('nova', 'blood', 14, 'A roar that knocks the wind out of them.', { d: 12, c: 18, r: 6, fx: 'stun' }),
    'Last Stand': k('ward', 'blood', 40, 'Plant your feet. Not one more step.', { d: 70, c: 20, t: 8 }),
    'Mountain That Walks': k('buff', 'blood', 60, 'Nothing moves you.', { c: 35, t: 12, m: { dmgTaken: -0.45, moveSpeed: -0.1, poise: 0.3 }, big: true }),
  },
  oathbreaker: {
    'Black Shield': k('ward', 'shadow', 16, 'Your shield turns black and drinks the blows.', { d: 45, c: 18, t: 8 }),
    'Penance Strike': k('strike', 'shadow', 7, 'Strike as if you could take it back.', { d: 40, c: 22, fx: 'leech' }),
    'Forsworn Wall': k('buff', 'shadow', 30, 'Stand like the oath you broke.', { c: 20, t: 8, m: { dmgTaken: -0.4, moveSpeed: -0.2 } }),
    'Self Flagellation': k('buff', 'blood', 20, 'Pain, turned outward.', { c: 10, t: 10, m: { melee: 0.3, dmgTaken: 0.15 } }),
    Reckoning: k('nova', 'shadow', 16, 'Every sin you carry, released at once.', { d: 40, c: 28, r: 4.5 }),
    'Last Confession': k('smite', 'shadow', 30, 'Say it aloud, and let it fall on them.', { d: 60, c: 30, r: 3.5, fx: 'leech' }),
    Sentinel: k('buff', 'steel', 20, 'The old watch, kept again.', { c: 15, t: 12, m: { crit: 0.1, parryWindow: 0.3 } }),
    Ambush: k('dash', 'shadow', 10, 'Out of the dark, through them.', { d: 34, c: 20, fx: 'bleed' }),
    'Hold the Road': k('nova', 'steel', 18, 'None shall pass.', { d: 24, c: 26, r: 5, fx: 'stun' }),
    // the capstones (the classes update: they had none)
    'The Knight Who Fell': k('buff', 'shadow', 60, 'Wear the fall like armour.', { c: 35, t: 15, m: { melee: 0.35, dmgTaken: -0.35, poise: 0.4 }, big: true }),
    Absolution: k('heal', 'light', 75, 'Forgiven, for a moment.', { d: 70, c: 35, t: 4, big: true }),
    'None Shall Pass': k('nova', 'steel', 50, 'Plant your feet on the road and let nothing through.', { d: 80, c: 40, r: 7, big: true, fx: 'stun' }),
  },

  // ---- magic classes ---------------------------------------------------------------------
  cryomancer: {
    'Frost Shard': k('bolt', 'frost', 2, 'A shard of blue ice.', { d: 18, c: 10 }),
    'Ice Lance': k('lance', 'frost', 6, 'A spear of ice that goes through everything.', { d: 30, c: 18 }),
    'Glacial Spike': k('smite', 'frost', 12, 'A spike of glacier erupts under them.', { d: 48, c: 28, r: 2.6, fx: 'stun' }),
    'Comet of Ice': k('meteor', 'frost', 45, 'A comet of ancient ice.', { d: 95, c: 45, r: 5.5, big: true, fx: 'stun' }),
    'Frost Nova': k('nova', 'frost', 10, 'The air around you freezes solid.', { d: 22, c: 20, r: 5, fx: 'stun' }),
    Blizzard: k('zone', 'frost', 18, 'A howling storm of ice on one spot.', { d: 42, c: 30, r: 5, t: 6 }),
    'Frozen Ground': k('zone', 'frost', 16, 'Rime spreads across the ground and bites.', { d: 26, c: 22, r: 4, t: 8 }),
    'Endless Winter': k('zone', 'frost', 60, 'Winter, here, now, for everyone.', { d: 85, c: 50, r: 8, t: 10, big: true }),
    'Ice Barrier': k('ward', 'frost', 18, 'A shell of clear ice.', { d: 45, c: 20, t: 10 }),
    'Frost Step': k('blink', 'frost', 6, 'Shatter and reform ahead.', { d: 18, c: 12, r: 8, fx: 'stun' }),
    Cryostasis: k('heal', 'frost', 40, 'Freeze yourself still while the wounds close.', { d: 40, c: 20, t: 3 }),
    Avalanche: k('cone', 'frost', 40, 'The mountain comes down in front of you.', { d: 75, c: 45, r: 9, big: true, fx: 'stun' }),
  },
  shadowcaller: {
    'Hex Bolt': k('bolt', 'shadow', 2.5, 'A bolt of cursed dark.', { d: 20, c: 10 }),
    Wither: k('zone', 'shadow', 12, 'The ground rots under them.', { d: 32, c: 20, r: 3, t: 6 }),
    Doom: k('smite', 'shadow', 18, 'Name them, and the dark falls on them.', { d: 62, c: 30, r: 2.2, fx: 'stun' }),
    'Night Eternal': k('zone', 'shadow', 60, 'Night falls on one place and never lifts.', { d: 90, c: 50, r: 7, t: 8, big: true, fx: 'pull' }),
    'Soul Drain': k('drain', 'shadow', 5, 'Pull the life out of them.', { d: 26, c: 14 }),
    Reap: k('cone', 'shadow', 9, 'A scythe of shadow sweeps the field.', { d: 34, c: 22, r: 5, fx: 'leech' }),
    'Soul Storm': k('volley', 'shadow', 14, 'Loose the souls you carry.', { d: 14, c: 30, n: 7, fx: 'leech' }),
    'The Reaper Walks': k('spirit', 'shadow', 60, 'Something tall and patient walks beside you.', { d: 34, c: 40, t: 20, big: true, fx: 'leech' }),
    'Shadow Step': k('blink', 'shadow', 6, 'Step into your own shadow and out of another.', { d: 14, c: 12, r: 9 }),
    'Umbral Ward': k('ward', 'shadow', 20, 'A cloak of dark that turns blows.', { d: 45, c: 20, t: 10 }),
    'Shade Form': k('buff', 'shadow', 30, 'Become half shadow.', { c: 25, t: 8, m: { dmgTaken: -0.35, moveSpeed: 0.25 } }),
    Eclipse: k('nova', 'shadow', 50, 'Blot out the sun.', { d: 85, c: 45, r: 8, big: true, fx: 'stun' }),
  },
  voidwalker: {
    'Void Bolt': k('bolt', 'void', 2.5, 'A sphere of nothing.', { d: 22, c: 11 }),
    Rift: k('zone', 'void', 12, 'Tear a hole in the world; it drags at everything.', { d: 32, c: 22, r: 3, t: 5, fx: 'pull' }),
    Singularity: k('smite', 'void', 18, 'A point of infinite weight.', { d: 56, c: 32, r: 4, fx: 'pull' }),
    'Collapse of Stars': k('meteor', 'void', 60, 'A dead star, falling.', { d: 105, c: 50, r: 6, big: true, fx: 'pull' }),
    Crush: k('smite', 'void', 8, 'Gravity, all at once, on one spot.', { d: 34, c: 18, r: 2.5, fx: 'stun' }),
    'Gravity Lance': k('lance', 'void', 8, 'A line of crushing weight.', { d: 32, c: 20 }),
    'Black Hole': k('zone', 'void', 30, 'Nothing escapes it.', { d: 52, c: 38, r: 6, t: 5, fx: 'pull' }),
    'The Great Attractor': k('nova', 'void', 60, 'Everything falls toward you, and breaks.', { d: 95, c: 50, r: 10, big: true, fx: 'pull' }),
    'Phase Shift': k('blink', 'void', 5, 'Step through the space between.', { c: 10, r: 10 }),
    'Void Shell': k('ward', 'void', 20, 'Wrap yourself in nothing.', { d: 50, c: 22, t: 8 }),
    Riftwalk: k('dash', 'void', 10, 'Walk the rift, tearing them as you go.', { d: 30, c: 20 }),
    'Step Beyond': k('buff', 'void', 70, 'Stand half outside the world.', { c: 40, t: 10, m: { dmgTaken: -0.5, moveSpeed: 0.35, spell: 0.25 }, big: true }),
  },

  // ---- callings -----------------------------------------------------------------------------
  beastbinding: {
    'Slime Burst': k('nova', 'nature', 8, 'Uncork a slime essence; it bursts everywhere.', { d: 18, c: 14, r: 4, fx: 'stun' }),
    'Wolf Spirit': k('spirit', 'nature', 25, 'A wolf of green light runs at your side.', { d: 22, c: 20, t: 15 }),
    'Bat Swarm': k('volley', 'shadow', 12, 'A jar of bats, opened at them.', { d: 10, c: 22, n: 8, fx: 'leech' }),
    Chimera: k('spirit', 'nature', 60, 'Every essence at once, in one terrible shape.', { d: 42, c: 40, t: 25, big: true }),
    'Spirit Hawk': k('spirit', 'wind', 20, 'A hawk of wind circles above you.', { d: 18, c: 18, t: 20 }),
    'Bear Spirit': k('ward', 'nature', 22, 'The bear stands over you.', { d: 50, c: 20, t: 12 }),
    'Stag Spirit': k('dash', 'nature', 10, 'Ride the charge of a spirit stag.', { d: 30, c: 20, fx: 'stun' }),
    'King of Beasts': k('buff', 'nature', 60, 'Every beast you have bound lends you its strength.', { c: 40, t: 15, m: { melee: 0.25, spell: 0.25, moveSpeed: 0.2 }, big: true }),
    'Thorn Lash': k('cone', 'nature', 5, 'A whip of thorns.', { d: 22, c: 12, r: 5, fx: 'bleed' }),
    Entangle: k('zone', 'nature', 14, 'Roots burst from the ground and hold them.', { d: 18, c: 18, r: 3.5, t: 4, fx: 'stun' }),
    'Wild Growth': k('heal', 'nature', 30, 'Moss and flowers close your wounds.', { d: 35, c: 22, t: 6 }),
    'Heart of the Forest': k('zone', 'nature', 60, 'The old forest rises around your foes.', { d: 65, c: 45, r: 7, t: 10, big: true, fx: 'leech' }),
  },

  // ---- hidden classes ---------------------------------------------------------------------
  stormdancer: {
    'Squall Step': k('dash', 'gale', 6, 'Become a gust and pass through them.', { d: 22, c: 16 }),
    Thunderclap: k('nova', 'gale', 10, 'Clap the air and it answers with thunder.', { d: 30, c: 22, r: 4.5, fx: 'stun' }),
    'Storm Waltz': k('whirl', 'gale', 12, 'Dance inside the storm.', { d: 40, c: 26, r: 4 }),
    'Heart of the Tempest': k('nova', 'gale', 50, 'Become the eye of a hurricane.', { d: 90, c: 40, r: 9, big: true, fx: 'stun' }),
    'Arc Slash': k('cone', 'gale', 5, 'A slash that leaves lightning behind.', { d: 28, c: 15, r: 5 }),
    'Chain Lightning': k('chain', 'gale', 8, 'Lightning jumps from blade to blade.', { d: 30, c: 20, n: 5 }),
    Skyfall: k('smite', 'gale', 14, 'The sky strikes where you point.', { d: 50, c: 28, r: 3.2, fx: 'stun' }),
    'Wrath of the Sky': k('chain', 'gale', 45, 'The whole storm, all at once.', { d: 70, c: 40, n: 9, big: true }),
    Cloudstep: k('blink', 'gale', 5, 'Step onto the wind and off again.', { c: 12, r: 9 }),
    'Storm Shroud': k('ward', 'gale', 20, 'Wrap yourself in a cloak of storm.', { d: 45, c: 18, t: 8 }),
    'Gale Mantle': k('buff', 'gale', 26, 'The wind carries you.', { c: 18, t: 10, m: { moveSpeed: 0.3, attackSpeed: 0.2 } }),
    'Lord of Storms': k('spirit', 'gale', 60, 'A storm cloud follows you, striking at your foes.', { d: 40, c: 40, t: 20, big: true }),
  },
  moonblade: {
    'Moon Draw': k('strike', 'frost', 5, 'Draw, and a crescent of silver follows the blade.', { d: 36, c: 18 }),
    'Crescent Wave': k('volley', 'frost', 8, 'Three silver crescents fly from the cut.', { d: 22, c: 20, n: 3 }),
    'Lunar Cleave': k('strike', 'frost', 14, 'A cut the shape of the full moon.', { d: 68, c: 30, r: 3.4, fx: 'stun' }),
    Moonfall: k('meteor', 'frost', 45, 'Cut the moon from the sky.', { d: 95, c: 40, r: 6, big: true }),
    'Eclipse Cut': k('dash', 'shadow', 7, 'A cut in the dark.', { d: 28, c: 18, fx: 'bleed' }),
    'New Moon': k('buff', 'shadow', 22, 'Go dark, like the moon.', { c: 15, t: 10, m: { crit: 0.15, melee: 0.15 } }),
    'Blood Moon': k('whirl', 'blood', 14, 'A red moon rises with your blade.', { d: 40, c: 26, r: 4, fx: 'bleed' }),
    'Total Eclipse': k('nova', 'shadow', 50, 'Darkness at noon, and the blade in it.', { d: 85, c: 40, r: 8, big: true, fx: 'stun' }),
    'Tidal Slash': k('cone', 'frost', 6, 'A wave of silver water.', { d: 30, c: 16, r: 6 }),
    Riptide: k('zone', 'frost', 14, 'The tide pulls them under.', { d: 30, c: 22, r: 4, t: 5, fx: 'pull' }),
    'Moon Mirror': k('ward', 'frost', 20, 'A mirror of moonlight turns blows aside.', { d: 50, c: 18, t: 8 }),
    'Night of a Thousand Moons': k('volley', 'frost', 50, 'A sky full of silver crescents.', { d: 30, c: 40, n: 12, big: true }),
  },
  swordsaint: {
    'Mirror Cut': k('strike', 'steel', 5, 'A cut that answers theirs.', { d: 34, c: 16 }),
    'Turning Blade': k('whirl', 'steel', 9, 'Turn every blade around you.', { d: 32, c: 20, r: 3.4, fx: 'stun' }),
    'Heaven Splitter': k('strike', 'light', 16, 'A cut that parts the clouds.', { d: 80, c: 30, r: 3.6 }),
    'Sword of Heaven': k('smite', 'light', 45, 'A sword of light falls from heaven.', { d: 100, c: 40, r: 5, big: true, fx: 'stun' }),
    Iai: k('dash', 'steel', 6, 'Draw and cut in one motion, behind them before they see it.', { d: 34, c: 16 }),
    'Hundred Cuts': k('volley', 'steel', 12, 'A hundred cuts, too fast to see.', { d: 12, c: 24, n: 9 }),
    'Void Cut': k('lance', 'void', 14, 'A cut through the space itself.', { d: 56, c: 26 }),
    'The Last Lesson': k('nova', 'steel', 50, 'Everything forty years of practice taught.', { d: 95, c: 40, r: 7, big: true }),
    Meditation: k('heal', 'light', 25, 'Breathe. The wounds close.', { d: 30, c: 12, t: 4 }),
    'Serene Ward': k('ward', 'steel', 18, 'Calm, made solid.', { d: 50, c: 16, t: 8 }),
    Enlightenment: k('buff', 'light', 30, 'See every blow before it comes.', { c: 20, t: 10, m: { parryWindow: 0.6, crit: 0.12, attackSpeed: 0.15 } }),
    'Perfect Stillness': k('buff', 'light', 70, 'Nothing touches you.', { c: 40, t: 8, m: { dmgTaken: -0.6, melee: 0.3 }, big: true }),
  },
  reaver: {
    Rend: k('strike', 'blood', 5, 'Tear them open.', { d: 32, c: 16, fx: 'bleed' }),
    Carve: k('whirl', 'blood', 8, 'Carve a circle of red.', { d: 34, c: 20, r: 3.4, fx: 'bleed' }),
    Massacre: k('volley', 'blood', 14, 'Throw blades until nothing moves.', { d: 18, c: 26, n: 7, fx: 'bleed' }),
    'Red Harvest': k('whirl', 'blood', 45, 'Reap the whole field.', { d: 80, c: 40, r: 6, big: true, fx: 'leech' }),
    Bloodletting: k('cone', 'blood', 7, 'Open every vein in reach.', { d: 26, c: 16, r: 4.5, fx: 'leech' }),
    Gorge: k('drain', 'blood', 8, 'Feed.', { d: 30, c: 18 }),
    'Blood Tide': k('nova', 'blood', 16, 'A tide of blood, out and back.', { d: 40, c: 28, r: 5, fx: 'leech' }),
    'Crimson Feast': k('buff', 'blood', 60, 'Every wound you open feeds you.', { c: 35, t: 15, m: { melee: 0.3, attackSpeed: 0.2, heal: 0.5 }, big: true }),
    'Dread Charge': k('dash', 'blood', 8, 'They see you coming and wish they hadn\'t.', { d: 28, c: 18, fx: 'stun' }),
    'Howl of Ruin': k('nova', 'shadow', 14, 'A howl that stops their hearts a moment.', { d: 16, c: 18, r: 6, fx: 'stun' }),
    Executioner: k('strike', 'blood', 16, 'The finishing blow.', { d: 85, c: 30, r: 2.4 }),
    'Death Dance': k('dash', 'blood', 45, 'Dance through all of them, twice.', { d: 70, c: 40, big: true, fx: 'bleed' }),
  },
  nightblade: {
    'Shadow Strike': k('dash', 'shadow', 5, 'Strike from the dark and are gone.', { d: 30, c: 15 }),
    'Smoke Bomb': k('zone', 'shadow', 14, 'Smoke, and blades in it.', { d: 24, c: 18, r: 4, t: 5, fx: 'stun' }),
    Assassinate: k('strike', 'shadow', 14, 'One cut, in the right place.', { d: 90, c: 28, r: 2 }),
    'Thousand Shadows': k('volley', 'shadow', 45, 'Every shadow in the room throws a knife.', { d: 28, c: 40, n: 12, big: true }),
    'Venom Blade': k('buff', 'nature', 18, 'Coat both blades.', { c: 12, t: 15, m: { melee: 0.2, crit: 0.05 } }),
    'Poison Fan': k('volley', 'nature', 8, 'A fan of poisoned knives.', { d: 14, c: 16, n: 5, fx: 'bleed' }),
    'Death Bloom': k('nova', 'nature', 16, 'Poison bursts from every wound around you.', { d: 36, c: 26, r: 5, fx: 'bleed' }),
    'Kiss of the Widow': k('smite', 'nature', 45, 'A single drop. That is all it takes.', { d: 100, c: 40, r: 4, big: true, fx: 'leech' }),
    'Shadow Clone': k('spirit', 'shadow', 22, 'A copy of you fights alongside.', { d: 22, c: 18, t: 12 }),
    Vanish: k('blink', 'shadow', 8, 'Gone.', { c: 12, r: 9 }),
    'Puppet Strings': k('zone', 'shadow', 18, 'Threads of shadow pull them in.', { d: 22, c: 22, r: 5, t: 4, fx: 'pull' }),
    Masquerade: k('buff', 'shadow', 60, 'Wear a hundred faces.', { c: 35, t: 12, m: { dmgTaken: -0.4, crit: 0.2, moveSpeed: 0.2 }, big: true }),
  },
  bladedancer: {
    Twirl: k('whirl', 'steel', 5, 'A spinning step.', { d: 26, c: 14, r: 3 }),
    'Blade Waltz': k('dash', 'steel', 8, 'Waltz through them.', { d: 28, c: 18 }),
    'Grand Finale': k('nova', 'steel', 14, 'End the dance with a flourish.', { d: 48, c: 28, r: 5, fx: 'stun' }),
    'Dance of a Thousand Blades': k('whirl', 'steel', 45, 'The dance they will talk about.', { d: 85, c: 40, r: 6.5, big: true }),
    'Ribbon Cut': k('cone', 'steel', 5, 'Steel that flows like ribbon.', { d: 26, c: 14, r: 5.5 }),
    'Silk Storm': k('volley', 'steel', 9, 'Ribbons of steel everywhere.', { d: 16, c: 20, n: 6 }),
    'Steel Ribbon': k('lance', 'steel', 12, 'One long ribbon of steel through the line.', { d: 44, c: 24 }),
    'Storm of Ribbons': k('zone', 'steel', 45, 'A storm of blades that keeps dancing.', { d: 70, c: 40, r: 6, t: 8, big: true }),
    'Flash Step': k('blink', 'light', 5, 'Here. Now there.', { d: 14, c: 12, r: 8 }),
    Spotlight: k('buff', 'light', 22, 'All eyes on you.', { c: 14, t: 10, m: { crit: 0.15, attackSpeed: 0.15 } }),
    'Curtain Call': k('smite', 'light', 14, 'Take your bow on their heads.', { d: 50, c: 26, r: 3.4, fx: 'stun' }),
    'Opening Night': k('buff', 'light', 60, 'The show of your life.', { c: 35, t: 15, m: { melee: 0.3, attackSpeed: 0.25, moveSpeed: 0.2 }, big: true }),
  },
  stillmind: {
    'Still Pulse': k('nova', 'frost', 6, 'A ripple of stillness.', { d: 22, c: 14, r: 4 }),
    'Mind Ward': k('ward', 'frost', 18, 'A thought that stops swords.', { d: 50, c: 16, t: 10 }),
    Stillfield: k('zone', 'frost', 18, 'Everything in the field slows to nothing.', { d: 24, c: 22, r: 4.5, t: 6, fx: 'stun' }),
    'Absolute Stillness': k('nova', 'frost', 50, 'The world holds its breath.', { d: 80, c: 40, r: 9, big: true, fx: 'stun' }),
    'Echo Strike': k('strike', 'steel', 5, 'Strike, and the strike strikes again.', { d: 34, c: 16 }),
    Resound: k('nova', 'steel', 10, 'The ring rings out.', { d: 30, c: 20, r: 5 }),
    'Sonic Ring': k('cone', 'steel', 12, 'A wave of pure sound.', { d: 44, c: 24, r: 7, fx: 'stun' }),
    'Thunder of Silence': k('nova', 'steel', 50, 'Silence so loud it breaks bones.', { d: 90, c: 40, r: 8, big: true }),
    'Focus Beam': k('lance', 'frost', 6, 'A beam of pure attention.', { d: 34, c: 16 }),
    Insight: k('buff', 'frost', 22, 'See it all.', { c: 14, t: 12, m: { crit: 0.15, parryWindow: 0.4 } }),
    'Mind Blade': k('volley', 'frost', 10, 'Blades of thought.', { d: 18, c: 20, n: 5 }),
    'Mind over Matter': k('buff', 'frost', 60, 'Pain is only an idea.', { c: 35, t: 12, m: { dmgTaken: -0.5, poise: 0.3 }, big: true }),
  },
  ironwall: {
    'Iron Ring': k('nova', 'steel', 7, 'The ring hardens into iron and slams outward.', { d: 26, c: 16, r: 4 }),
    Bastion: k('ward', 'steel', 18, 'You become a wall.', { d: 70, c: 20, t: 8 }),
    Fortress: k('buff', 'steel', 30, 'Nothing gets in.', { c: 20, t: 12, m: { dmgTaken: -0.4, poise: 0.3 } }),
    'The Wall Stands': k('buff', 'steel', 70, 'The wall stands. It always stands.', { c: 40, t: 10, m: { dmgTaken: -0.7 }, big: true }),
    'Spike Burst': k('nova', 'blood', 8, 'Spikes burst from your armour.', { d: 26, c: 16, r: 3.5, fx: 'bleed' }),
    Retribution: k('strike', 'blood', 10, 'Give it back, harder.', { d: 46, c: 22 }),
    'Iron Maiden': k('zone', 'blood', 18, 'A cage of spikes closes on them.', { d: 34, c: 24, r: 3.5, t: 5, fx: 'bleed' }),
    'Field of Spikes': k('zone', 'blood', 45, 'Iron spikes everywhere.', { d: 70, c: 40, r: 7, t: 8, big: true, fx: 'bleed' }),
    'Wall Slam': k('strike', 'steel', 6, 'Slam into them like a falling wall.', { d: 36, c: 18, fx: 'stun' }),
    'Siege Ram': k('dash', 'steel', 10, 'Through the gate, and through them.', { d: 34, c: 22, fx: 'stun' }),
    'Avalanche of Iron': k('nova', 'steel', 16, 'Iron falls on everything around you.', { d: 52, c: 30, r: 5.5 }),
    Landslide: k('cone', 'steel', 45, 'The whole wall comes down on them.', { d: 95, c: 40, r: 9, big: true, fx: 'stun' }),
  },
  shieldwarden: {
    'Guardian Ward': k('ward', 'light', 16, 'A ward for the one who needs it.', { d: 50, c: 16, t: 10 }),
    'Bulwark Line': k('cone', 'light', 9, 'A line of light shoves them back.', { d: 24, c: 18, r: 6, fx: 'stun' }),
    'Aegis Dome': k('buff', 'light', 30, 'A dome of light over you.', { c: 22, t: 10, m: { dmgTaken: -0.45 } }),
    'Unbreakable Aegis': k('ward', 'light', 60, 'It will not break.', { d: 200, c: 35, t: 12, big: true }),
    'Vow of Iron': k('buff', 'steel', 22, 'Swear it.', { c: 14, t: 12, m: { melee: 0.15, dmgTaken: -0.15 } }),
    Oathstrike: k('strike', 'light', 6, 'Strike in the name of your word.', { d: 36, c: 18, fx: 'brand' }),
    'Sacred Oath': k('nova', 'light', 16, 'The oath burns outward.', { d: 40, c: 26, r: 5 }),
    'The Final Oath': k('smite', 'light', 45, 'The last promise, kept.', { d: 100, c: 40, r: 5, big: true, fx: 'stun' }),
    Rally: k('heal', 'light', 24, 'Stand up. We are not done.', { d: 30, c: 16, t: 4 }),
    'Shield Throw': k('bolt', 'steel', 6, 'Throw your shield; it comes back.', { d: 34, c: 16, r: 2 }),
    'Hold the Line': k('buff', 'steel', 30, 'Not one step back.', { c: 20, t: 10, m: { poise: 0.5, dmgTaken: -0.3 } }),
    'For the Fallen': k('nova', 'light', 50, 'For everyone who stood here before you.', { d: 85, c: 40, r: 8, big: true, fx: 'stun' }),
  },
  lifewarden: {
    'Bloom of Life': k('heal', 'nature', 18, 'Flowers bloom where you stand.', { d: 30, c: 16, t: 4 }),
    Lifespring: k('zone', 'nature', 20, 'A spring of life; enemies in it wither.', { d: 26, c: 22, r: 4, t: 8, fx: 'leech' }),
    Revival: k('heal', 'light', 45, 'Come back from the edge.', { d: 60, c: 30, t: 3 }),
    'Garden of Life': k('zone', 'nature', 60, 'A garden grows; it heals you and strangles them.', { d: 60, c: 45, r: 7, t: 10, big: true, fx: 'leech' }),
    'Mercy Ward': k('ward', 'light', 18, 'Mercy, as a shield.', { d: 55, c: 18, t: 10 }),
    Lifebond: k('drain', 'nature', 6, 'Bind their life to yours.', { d: 26, c: 14 }),
    Sanctuary: k('buff', 'light', 30, 'Nothing can hurt you here.', { c: 22, t: 8, m: { dmgTaken: -0.5, heal: 0.3 } }),
    'Wings of Mercy': k('buff', 'light', 60, 'Wings of light fold over you.', { c: 35, t: 12, m: { dmgTaken: -0.4, heal: 0.6, moveSpeed: 0.2 }, big: true }),
    'Life Lance': k('lance', 'nature', 6, 'A spear of living light.', { d: 32, c: 16 }),
    'Verdant Nova': k('nova', 'nature', 12, 'Life bursts out of you, too much of it.', { d: 34, c: 24, r: 5, fx: 'leech' }),
    Lifestorm: k('volley', 'nature', 14, 'Seeds of light, everywhere.', { d: 16, c: 26, n: 7, fx: 'leech' }),
    'Dawn of Life': k('nova', 'light', 50, 'A new dawn, for you alone.', { d: 85, c: 40, r: 8, big: true, fx: 'leech' }),
  },
  inquisitor: {
    Accuse: k('bolt', 'light', 3, 'Point, and name them guilty.', { d: 24, c: 12, fx: 'brand' }),
    Condemn: k('smite', 'light', 10, 'The sentence falls.', { d: 44, c: 24, r: 2.6, fx: 'brand' }),
    Execution: k('smite', 'light', 18, 'No appeal.', { d: 80, c: 32, r: 2, fx: 'stun' }),
    'Last Judgment': k('meteor', 'light', 50, 'The last judgment, falling.', { d: 110, c: 50, r: 6, big: true, fx: 'brand' }),
    'Purging Fire': k('cone', 'fire', 6, 'Burn out the heresy.', { d: 28, c: 16, r: 6, fx: 'burn' }),
    'Holy Pyre': k('zone', 'fire', 14, 'A pyre, lit beneath them.', { d: 36, c: 24, r: 3.5, t: 6, fx: 'burn' }),
    'Auto-da-fe': k('nova', 'fire', 18, 'An act of faith, in fire.', { d: 50, c: 30, r: 5.5, fx: 'burn' }),
    Crusade: k('buff', 'fire', 60, 'March on, burning.', { c: 40, t: 15, m: { spell: 0.35, melee: 0.2, moveSpeed: 0.15 }, big: true }),
    'Holy Chains': k('chain', 'light', 8, 'Chains of light bind them together.', { d: 26, c: 18, n: 4, fx: 'stun' }),
    Interrogate: k('drain', 'light', 6, 'Draw the truth out, and the life with it.', { d: 26, c: 14 }),
    'Prison of Light': k('zone', 'light', 22, 'A cell of light; none leave it.', { d: 26, c: 26, r: 4, t: 5, fx: 'stun' }),
    'Eternal Prison': k('zone', 'light', 60, 'A prison that never opens.', { d: 75, c: 45, r: 7, t: 8, big: true, fx: 'pull' }),
  },
  lightweaver: {
    'Light Thread': k('chain', 'light', 4, 'A thread of light stitches them together.', { d: 20, c: 12, n: 3 }),
    Prism: k('volley', 'light', 9, 'Split the light into a fan of colours.', { d: 18, c: 20, n: 6 }),
    'Weave of Stars': k('zone', 'light', 18, 'A tapestry of stars falls over them.', { d: 40, c: 28, r: 5, t: 6 }),
    'The Great Tapestry': k('meteor', 'light', 50, 'Weave a star and drop it.', { d: 105, c: 50, r: 6, big: true }),
    'Light Shield': k('ward', 'light', 16, 'A shield woven of light.', { d: 50, c: 18, t: 10 }),
    Lattice: k('nova', 'light', 10, 'A lattice of light snaps out from you.', { d: 30, c: 20, r: 4.5, fx: 'stun' }),
    'Cathedral of Light': k('buff', 'light', 30, 'A cathedral rises around you.', { c: 26, t: 10, m: { dmgTaken: -0.4, spell: 0.2 } }),
    'Cloak of Dawn': k('buff', 'light', 60, 'Wear the dawn.', { c: 40, t: 15, m: { dmgTaken: -0.35, spell: 0.35, castSpeed: 0.25 }, big: true }),
    'Light Needle': k('lance', 'light', 4, 'A needle of light through the line.', { d: 26, c: 12 }),
    'Needle Storm': k('volley', 'light', 10, 'A storm of needles.', { d: 12, c: 22, n: 9 }),
    'Seam Ripper': k('smite', 'light', 16, 'Unpick them at the seams.', { d: 58, c: 30, r: 3 }),
    Unravelling: k('chain', 'light', 50, 'Pull one thread and they all come apart.', { d: 75, c: 45, n: 10, big: true }),
  },
  sunbreaker: {
    'Solar Flare': k('bolt', 'fire', 2.5, 'A flare torn off the sun.', { d: 24, c: 12, r: 1.8, fx: 'burn' }),
    Sunspot: k('zone', 'fire', 14, 'A spot of the sun, on the ground.', { d: 38, c: 24, r: 4, t: 6, fx: 'burn' }),
    Supernova: k('nova', 'fire', 20, 'Explode like a dying star.', { d: 62, c: 34, r: 7, fx: 'burn' }),
    Sunbreak: k('meteor', 'fire', 55, 'Break the sun, and let it fall.', { d: 120, c: 55, r: 7, big: true, fx: 'burn' }),
    'Plasma Lance': k('lance', 'fire', 6, 'A lance of fire past fire.', { d: 36, c: 18, fx: 'burn' }),
    'Plasma Chain': k('chain', 'fire', 9, 'Plasma arcs from foe to foe.', { d: 30, c: 22, n: 5, fx: 'burn' }),
    Fusion: k('smite', 'fire', 16, 'Two flames become one, much bigger.', { d: 64, c: 32, r: 3.5, fx: 'burn' }),
    'Birth of a Star': k('nova', 'fire', 55, 'A star is born at your feet.', { d: 110, c: 55, r: 10, big: true, fx: 'burn' }),
    'Black Sun': k('bolt', 'void', 6, 'A sun that gives no light.', { d: 34, c: 18, r: 2.5, fx: 'pull' }),
    'Solar Wind': k('cone', 'fire', 8, 'A wind off the sun.', { d: 30, c: 18, r: 7, fx: 'burn' }),
    'Corona Shield': k('ward', 'fire', 20, 'The sun\'s crown, around you.', { d: 55, c: 22, t: 10 }),
    'Sun Swallower': k('zone', 'void', 60, 'Swallow the sun; it burns inside the dark.', { d: 90, c: 50, r: 7, t: 8, big: true, fx: 'pull' }),
  },
  ashwalker: {
    'Ash Step': k('dash', 'fire', 6, 'Walk through them as embers.', { d: 24, c: 14, fx: 'burn' }),
    'Scorched Path': k('zone', 'fire', 12, 'The path behind you burns.', { d: 30, c: 20, r: 3.5, t: 7, fx: 'burn' }),
    Ashstorm: k('zone', 'fire', 18, 'A storm of hot ash.', { d: 44, c: 28, r: 5.5, t: 6, fx: 'burn' }),
    'Year of Ash': k('nova', 'fire', 55, 'Nothing grows here for a year.', { d: 105, c: 50, r: 9, big: true, fx: 'burn' }),
    'Smoke Cloud': k('zone', 'shadow', 14, 'Choking smoke.', { d: 22, c: 18, r: 4, t: 6, fx: 'stun' }),
    'Ember Rain': k('volley', 'fire', 10, 'Embers fall like rain.', { d: 14, c: 22, n: 8, fx: 'burn' }),
    Pyroclasm: k('meteor', 'fire', 18, 'A gout of rock and fire from below.', { d: 58, c: 32, r: 4, fx: 'burn' }),
    Eruption: k('meteor', 'fire', 55, 'The mountain answers you.', { d: 115, c: 55, r: 7, big: true, fx: 'burn' }),
    'Funeral Flame': k('bolt', 'fire', 3, 'A flame for the dead.', { d: 24, c: 12, fx: 'burn' }),
    Cremate: k('smite', 'fire', 12, 'Burn them to nothing.', { d: 52, c: 26, r: 2.8, fx: 'burn' }),
    'Pyre of Kings': k('nova', 'fire', 18, 'A pyre fit for a king, lit around you.', { d: 56, c: 30, r: 6, fx: 'burn' }),
    'The Great Burning': k('zone', 'fire', 60, 'Everything burns.', { d: 100, c: 55, r: 9, t: 8, big: true, fx: 'burn' }),
  },
  phoenix: {
    'Phoenix Feather': k('bolt', 'fire', 2.5, 'A feather of living flame.', { d: 22, c: 11, fx: 'burn' }),
    'Rising Flame': k('heal', 'fire', 25, 'Rise from your own ashes.', { d: 35, c: 20, t: 4 }),
    'Resurrection Fire': k('ward', 'fire', 40, 'A fire that will not let you die.', { d: 90, c: 30, t: 10 }),
    'Rise Again': k('heal', 'fire', 90, 'Every ending is kindling.', { d: 100, c: 50, t: 3, big: true }),
    'Flame Wings': k('dash', 'fire', 6, 'Spread wings of fire and glide through them.', { d: 26, c: 16, fx: 'burn' }),
    'Wing Sweep': k('cone', 'fire', 8, 'A sweep of burning wings.', { d: 32, c: 18, r: 6, fx: 'burn' }),
    'Firebird Dive': k('meteor', 'fire', 16, 'Dive like a burning bird.', { d: 60, c: 30, r: 4, fx: 'burn' }),
    Firebird: k('spirit', 'fire', 60, 'A firebird circles you, diving at your foes.', { d: 44, c: 45, t: 20, big: true, fx: 'burn' }),
    'Phoenix Cry': k('nova', 'fire', 10, 'A cry that sets the air alight.', { d: 30, c: 20, r: 5, fx: 'burn' }),
    'Song of Embers': k('buff', 'fire', 24, 'Sing, and the embers dance.', { c: 16, t: 12, m: { spell: 0.25, castSpeed: 0.2 } }),
    'Blazing Aria': k('chain', 'fire', 12, 'The song leaps from foe to foe.', { d: 34, c: 24, n: 6, fx: 'burn' }),
    'Song of the Phoenix': k('nova', 'fire', 55, 'The last note, and everything burns.', { d: 110, c: 50, r: 9, big: true, fx: 'burn' }),
  },
};

export const FORGED_SKILLS: Record<string, SkillDef> = Object.assign({}, ...Object.entries({ ...SPECS, ...ROSTER_SPECS }).map(([d, s]) => forge(d, s)));
