import type { CombatMods } from '../combat/mods';
import type { Family } from './data';
import { DUNGEONEERING_PASSIVES } from '../dungeon/kit/delving';
import { FIRE_PASSIVES } from './classes/fire.passives';
import { GALE_PASSIVES, BOUNDARY_PASSIVES, CROSS_PASSIVES } from './classes/sword.passives';
import { LIGHT_PASSIVES } from './classes/light.passives';

// What every passive node does. `m` adds to the player's combat modifiers
// (multipliers are written as fractions: 0.05 = +5%; flat maxima as numbers).
// `x` sets named effects the skill runtime checks (paths/skills.ts).
// Skills (the '*' nodes) live in skills.ts; this file is everything else.
// Nodes without a specific entry fall back to a stat bonus picked from the
// family's minor list, so every node always does exactly what it says.

export type NumMod = Exclude<keyof CombatMods, 'canBlock'>;
export interface NodeEffect {
  text: string;
  m?: Partial<Record<NumMod, number>>;
  x?: Record<string, number>;
  /** crafting-only (callings): no effect in combat yet */
  craft?: boolean;
}

const MINORS: Record<Family, NodeEffect[]> = {
  combat: [
    { text: '+4% class damage', m: { melee: 0.04 } },
    { text: '+5 max stamina', m: { stamina: 5 } },
    { text: '+3% attack speed', m: { attackSpeed: 0.03 } },
    { text: '+6% resource gain', x: { resGain: 0.06 } },
    { text: '+5% poise damage', m: { poise: 0.05 } },
    { text: '+3% crit chance', m: { crit: 0.03 } },
  ],
  magic: [
    { text: '+5% spell damage', m: { spell: 0.05 } },
    { text: '+8 max mana', m: { mana: 8 } },
    { text: '-4% mana cost', m: { manaCost: -0.04 } },
    { text: '+6% cast speed', m: { castSpeed: 0.06 } },
    { text: '+6% effect duration', m: { duration: 0.06 } },
    { text: '+4% area', m: { area: 0.04 } },
  ],
  legacy: [{ text: '+4% damage', m: { melee: 0.04 } }],
  calling: [
    { text: '+10% yield', craft: true },
    { text: '+8% effect strength', craft: true },
    { text: '-10% gathering time', craft: true },
    { text: '+1 recipe slot', craft: true },
    { text: '+6% duration', craft: true },
    { text: '+5% rare find chance', craft: true },
  ],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function scale(e: NodeEffect, k: number): NodeEffect {
  const m: NodeEffect['m'] = {};
  for (const [key, v] of Object.entries(e.m ?? {})) m[key as NumMod] = v * k;
  const x: Record<string, number> = {};
  for (const [key, v] of Object.entries(e.x ?? {})) x[key] = v * k;
  const mm = /^([+-])(\d+)(.*)$/.exec(e.text);
  let text = e.text;
  if (mm) {
    const v = Math.round((mm[1] === '-' ? -1 : 1) * Number(mm[2]) * k);
    text = `${v < 0 ? '-' : '+'}${Math.abs(v)}${mm[3]}`;
  }
  return { text, m, x, craft: e.craft };
}

function merge(a: NodeEffect, b: NodeEffect): NodeEffect {
  const m = { ...a.m };
  for (const [k, v] of Object.entries(b.m ?? {})) m[k as NumMod] = (m[k as NumMod] ?? 0) + v;
  return { text: `${a.text} and ${b.text}`, m, x: { ...a.x, ...b.x }, craft: a.craft || b.craft };
}

/** Generic effect for a node without a written one. */
export function genericEffect(fam: Family, key: string, type: string): NodeEffect {
  const list = MINORS[fam];
  const i = Math.floor(hash(key) * list.length) % list.length;
  if (type === 'minor') return list[i];
  const j = (i + 1 + Math.floor(hash(key + 'b') * (list.length - 1))) % list.length;
  if (type === 'notable' || type === 'choice') return merge(scale(list[i], 2), list[j]);
  if (type === 'keystone') {
    const up = scale(list[i], 5), down = scale(list[j], -2);
    const m = { ...up.m };
    for (const [k, v] of Object.entries(down.m ?? {})) m[k as NumMod] = (m[k as NumMod] ?? 0) + v;
    return { text: `${up.text}, but ${down.text}`, m, x: { ...down.x, ...up.x }, craft: up.craft };
  }
  return merge(scale(list[i], 4), scale(list[j], 2));
}

// ---- written passives --------------------------------------------------------------
// Keyed "discipline:Node Name"; choice nodes use "discipline:Option".
export const PASSIVES: Record<string, NodeEffect> = {
  // Dungeoneering (Dungeons Reborn, feat/dungeons): written in dungeon/kit/delving.ts
  ...DUNGEONEERING_PASSIVES,
  ...GALE_PASSIVES,
  ...BOUNDARY_PASSIVES,
  ...CROSS_PASSIVES,
  ...FIRE_PASSIVES,
  // Windcaller: Gust
  'windcaller:Breeze': { text: '+5% wind damage', x: { windDmg: 0.05 } },
  'windcaller:Pressure': { text: '+10% poise damage', m: { poise: 0.1 } },
  'windcaller:Push Back': { text: 'Gust hits 50% harder against poise', x: { gustPoise: 0.5 } },
  'windcaller:Whistle': { text: '-5% mana cost', m: { manaCost: -0.05 } },
  'windcaller:Downburst': { text: 'Updraft slams its target back down for 60% more damage', x: { downburst: 1 } },
  'windcaller:Lift': { text: 'Updraft lifts every enemy near the target', x: { lift: 1 } },
  'windcaller:Buffet': { text: '+8% spell damage', m: { spell: 0.08 } },
  'windcaller:Eye of Calm': { text: '+30% spell damage, but you take 15% more damage', m: { spell: 0.3, dmgTaken: 0.15 } },
  'windcaller:Shear': { text: 'Cyclone Bolt deals 25% more damage', x: { boltDmg: 0.25 } },
  'windcaller:Gale Force': { text: 'Gust reaches 50% farther', x: { gustRange: 0.5 } },
  'windcaller:Squallborn': { text: 'Cyclone Bolt lasts 50% longer', x: { boltTime: 0.5 } },
  // Windcaller: Current
  'windcaller:Light Step': { text: '+5% movement speed', m: { moveSpeed: 0.05 } },
  'windcaller:Drift': { text: 'Dodging costs 10% less stamina', m: { dodgeCost: -0.1 } },
  'windcaller:Slipstream': { text: 'Haste lasts 50% longer', x: { hasteTime: 0.5 } },
  'windcaller:Tailwind Aura': { text: '+5% attack speed', m: { attackSpeed: 0.05 } },
  'windcaller:Double Blink': { text: 'Blink can be used twice before its cooldown', x: { doubleBlink: 1 } },
  'windcaller:Long Blink': { text: 'Blink carries you 60% farther', x: { longBlink: 1 } },
  'windcaller:Airwalk': { text: 'Dodging costs 15% less stamina', m: { dodgeCost: -0.15 } },
  'windcaller:Featherweight': { text: '+20% movement speed and dodges cost 40% less, but you take 15% more damage', m: { moveSpeed: 0.2, dodgeCost: -0.4, dmgTaken: 0.15 } },
  'windcaller:Momentum': { text: '+6% attack speed', m: { attackSpeed: 0.06 } },
  'windcaller:Jetstream': { text: 'Wind Walk lasts 2 seconds longer', x: { jetstream: 2 } },
  'windcaller:Sky Dash': { text: 'Blink restores 20 stamina', x: { skyDash: 1 } },
  'windcaller:Riding the Storm': { text: 'Every dodge releases a gust that shoves enemies away', x: { stormDodge: 1 } },
  // Windcaller: Sky
  'windcaller:Clear Air': { text: '+8 max mana', m: { mana: 8 } },
  'windcaller:Open Lungs': { text: '+10% mana regen', m: { manaRegen: 0.1 } },
  'windcaller:Deflecting Air': { text: 'Take 20% less damage while Wind Wall stands', x: { deflectAir: 1 } },
  'windcaller:Calm': { text: '+10% mana regen', m: { manaRegen: 0.1 } },
  'windcaller:Suffocate': { text: 'Vacuum deals 60% more damage', x: { suffocate: 1 } },
  'windcaller:Crush': { text: 'Enemies caught in Vacuum are left open to a critical hit', x: { crush: 1 } },
  'windcaller:Thin Air': { text: '-5% mana cost', m: { manaCost: -0.05 } },
  'windcaller:Silent Sky': { text: 'Spells cost 30% less mana, but deal 15% less damage', m: { manaCost: -0.3, spell: -0.15 } },
  'windcaller:Still Point': { text: 'Pressure Dome lasts 2 seconds longer', x: { domeTime: 2 } },
  "windcaller:Heaven's Breath": { text: 'Pressure Dome heals you 3 health a second', x: { domeHeal: 3 } },
  'windcaller:Stormglass': { text: '+10% area', m: { area: 0.1 } },

  ...LIGHT_PASSIVES,
};
