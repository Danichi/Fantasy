import type { CombatMods } from '../combat/mods';
import type { Family } from './data';

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
  // Gale Style: Tailwind
  'gale:Swift Feet': { text: '+5% movement speed', m: { moveSpeed: 0.05 } },
  'gale:Light Grip': { text: '+4% attack speed', m: { attackSpeed: 0.04 } },
  'gale:Tailwind': { text: 'Dodging within 1.5 seconds of landing a hit costs no stamina', x: { tailwind: 1 } },
  'gale:Slipstream': { text: '+10% movement speed while you have 3 or more Flow', x: { slipstream: 1 } },
  'gale:Squall': { text: 'The third hit of your combo strikes twice, the second time as a blade of wind', x: { squall: 1 } },
  'gale:Updraft': { text: 'The third hit of your combo hits 150% harder against poise and launches small foes', x: { updraft: 1 } },
  'gale:Flow Well': { text: '+1 maximum Flow', x: { flowMax: 1 } },
  'gale:Storm Unbound': { text: '+20% attack speed and Flow never fades, but you cannot block', m: { attackSpeed: 0.2 }, x: { flowKeep: 1, noBlock: 1 } },
  'gale:Wind Shear': { text: 'Gale Style techniques deal 15% more damage', x: { techDmg: 0.15 } },
  'gale:Hurricane Heart': { text: 'Kills restore 1 Flow and 15 stamina', x: { hurricane: 1 } },
  'gale:Lingering Vortex': { text: 'Crescent Wind leaves a vortex that keeps cutting for 2 seconds', x: { vortex: 1 } },
  'gale:Eye of the Storm': { text: 'At full Flow, every third hit also releases a blade of wind', x: { eyeStorm: 1 } },
  // Gale Style: Cutting Wind
  'gale:Keen Edge': { text: '+3% crit chance', m: { crit: 0.03 } },
  'gale:Whetted': { text: '+5% class damage', m: { melee: 0.05 } },
  'gale:Pressure': { text: '+12% poise damage', m: { poise: 0.12 } },
  'gale:Far Reach': { text: 'Severing Arc flies 50% farther', x: { arcRange: 0.5 } },
  'gale:Quickdraw': { text: 'Moonlit Draw is drawn 40% faster', x: { quickdraw: 1 } },
  'gale:Heavy Draw': { text: 'Moonlit Draw deals 40% more damage', x: { heavyDraw: 1 } },
  'gale:Bleeding Wind': { text: 'Severing Arc makes enemies bleed for 4 seconds', x: { arcBleed: 1 } },
  'gale:One Breath': { text: 'Moonlit Draw always crits, but your basic combo deals 30% less damage', m: { lightAttack: -0.3 }, x: { oneBreath: 1 } },
  'gale:Twin Arcs': { text: 'Severing Arc throws two blades', x: { twinArcs: 1 } },
  'gale:Blood on the Snow': { text: 'Critical hits make enemies bleed', x: { critBleed: 1 } },
  'gale:Horizon Cut': { text: 'Severing Arc passes through every enemy in its path', x: { arcPierce: 1 } },
  // Gale Style: Stillwind
  'gale:Read the Blade': { text: '+10% parry window', m: { parryWindow: 0.1 } },
  'gale:Calm Breath': { text: '+10% stamina regen', m: { staminaRegen: 0.1 } },
  'gale:Deflect': { text: 'Successful parries restore 15 stamina', x: { parryStamina: 15 } },
  'gale:Wide Guard': { text: '+15% parry window', m: { parryWindow: 0.15 } },
  'gale:Disarm': { text: 'Parries break the attacker\'s poise and leave them open to a critical hit', x: { disarm: 1 } },
  'gale:Guard Crush': { text: 'After a parry your next hit within 3 seconds is a critical', x: { guardCrush: 1 } },
  'gale:Composure': { text: '+20% damage for 4 seconds after a parry', x: { composure: 1 } },
  'gale:Mirror Guard': { text: 'Your parry window is doubled, but getting hit costs 2 Flow', m: { parryWindow: 1 }, x: { mirrorGuard: 1 } },
  'gale:Rebuke': { text: 'Parries cut the attacker for half your weapon damage', x: { rebuke: 1 } },
  "gale:Duelist's Pride": { text: 'Each parry gives +3% damage for 20 seconds, stacking up to 10 times', x: { pride: 1 } },
  'gale:Quiet Mind': { text: 'Flow no longer fades when you stop hitting', x: { flowKeep: 1 } },
  'gale:Perfect Calm': { text: 'A parry heals 10% of your health and makes your next 3 hits critical', x: { perfectCalm: 1 } },

  // Boundary Style: Aegis
  'boundary:Steady Arm': { text: 'Blocking costs 10% less stamina', m: { blockCost: -0.1 } },
  'boundary:Braced': { text: 'Take 4% less damage', m: { dmgTaken: -0.04 } },
  'boundary:Iron Stance': { text: 'Blocking costs 25% less stamina', m: { blockCost: -0.25 } },
  'boundary:Absorb': { text: 'Gain 50% more Resolve', x: { resGain: 0.5 } },
  'boundary:Unyielding': { text: 'Take 15% less damage while you have 50 or more Resolve', x: { unyielding: 1 } },
  'boundary:Spiked Rim': { text: 'Enemies whose blows you block take 30% of your weapon damage', x: { spikedRim: 1 } },
  'boundary:Hold the Line': { text: 'Take 8% less damage', m: { dmgTaken: -0.08 } },
  'boundary:Unbreakable': { text: 'Blocking costs half the stamina, but dodging costs 50% more', m: { blockCost: -0.5, dodgeCost: 0.5 } },
  'boundary:Bastion': { text: '+20 max health', m: { hp: 20 } },
  'boundary:Immovable': { text: 'Take 10% less damage', m: { dmgTaken: -0.1 } },
  'boundary:Aftershock': { text: 'Earthshaker reaches 40% farther', x: { quakeArea: 0.4 } },
  'boundary:Living Fortress': { text: 'Every blocked blow builds the Fortress; at 5, your next Shield Bash shakes the earth', x: { fortress: 1 } },
  // Boundary Style: Vanguard
  'boundary:Heavy Rim': { text: 'Shield Bash deals 20% more damage', x: { bashDmg: 0.2 } },
  'boundary:Shoulder In': { text: '+5% poise damage', m: { poise: 0.05 } },
  'boundary:Staggering Blow': { text: 'Shield Bash hits 50% harder against poise', x: { bashPoise: 0.5 } },
  'boundary:Bruiser': { text: '+5% class damage', m: { melee: 0.05 } },
  'boundary:Trample': { text: 'Bull Rush deals 50% more damage', x: { rushDmg: 0.5 } },
  'boundary:Pin': { text: 'Enemies hit by Bull Rush are left open to a critical hit', x: { rushStun: 1 } },
  'boundary:Iron Hide': { text: 'Take 6% less damage', m: { dmgTaken: -0.06 } },
  'boundary:Juggernaut': { text: '+25% class damage and poise damage, but 15% slower movement', m: { melee: 0.25, poise: 0.25, moveSpeed: -0.15 } },
  'boundary:Plow Through': { text: '+10% class damage', m: { melee: 0.1 } },
  'boundary:Avalanche': { text: 'Earthshaker deals 40% more damage', x: { quakeDmg: 0.4 } },
  'boundary:Battering Ram': { text: 'Bull Rush resets Shield Bash', x: { ram: 1 } },
  'boundary:Unstoppable Charge': { text: 'You cannot be hurt during Bull Rush, and it can be used twice before its cooldown', x: { unstoppable: 1 } },
  // Boundary Style: Warden
  'boundary:Watchful': { text: '+10 max health', m: { hp: 10 } },
  'boundary:Stout Heart': { text: '+10% healing received', m: { heal: 0.1 } },
  'boundary:Rallying Presence': { text: 'Rallying Cry heals 50% more', x: { rallyHeal: 0.5 } },
  'boundary:Tough': { text: '+15 max health', m: { hp: 15 } },
  'boundary:Martyr': { text: 'Oath Ward absorbs 50% more', x: { wardAbsorb: 0.5 } },
  'boundary:Guardian': { text: 'When Oath Ward breaks it heals you for 20', x: { wardHeal: 20 } },
  'boundary:Last to Fall': { text: 'Once every 3 minutes, a killing blow leaves you at 1 health', x: { lastToFall: 180 } },
  'boundary:Oathbound': { text: '+30 max health and take 10% less damage, but deal 15% less damage', m: { hp: 30, dmgTaken: -0.1, melee: -0.15 } },
  'boundary:Retaliate': { text: 'Getting hit gives +10% damage for 3 seconds', x: { retaliate: 1 } },
  'boundary:Undying Vow': { text: 'Last to Fall recovers in 60 seconds', x: { lastToFallFast: 1 } },
  'boundary:Beacon': { text: 'Rallying Cry also restores 30 mana', x: { beacon: 1 } },

  // Pyromancer: Flame
  'pyromancer:Kindling': { text: '+5% fire damage', x: { fireDmg: 0.05 } },
  'pyromancer:Hot Hands': { text: '+6% cast speed', m: { castSpeed: 0.06 } },
  'pyromancer:Focused Heat': { text: 'Fireball deals 20% more damage', x: { fireballDmg: 0.2 } },
  'pyromancer:Wide Burst': { text: 'Fireball bursts 40% wider', x: { fireballArea: 0.4 } },
  'pyromancer:Cinder Volley': { text: 'Fireball splits into three smaller fireballs', x: { volley: 1 } },
  'pyromancer:Meteor Form': { text: 'Fireball is larger, slower and deals 60% more damage', x: { meteorForm: 1 } },
  'pyromancer:Accelerant': { text: 'Deal 25% more damage to burning enemies', x: { accelerant: 0.25 } },
  'pyromancer:Pure Flame': { text: '+35% fire damage, but 25 less max mana', m: { mana: -25 }, x: { fireDmg: 0.35 } },
  'pyromancer:Searing Speed': { text: '+10% cast speed', m: { castSpeed: 0.1 } },
  'pyromancer:Starfall': { text: 'Meteor falls three times', x: { starfall: 1 } },
  'pyromancer:Scorch Trail': { text: 'Fireball leaves burning ground where it bursts', x: { scorch: 1 } },
  // Pyromancer: Ember
  'pyromancer:Smoulder': { text: 'Burns deal 20% more damage', x: { burnDmg: 0.2 } },
  'pyromancer:Lingering Heat': { text: 'Burns last 2 seconds longer', x: { burnTime: 2 } },
  'pyromancer:Stacking Heat': { text: 'Burns stack up to 8 times instead of 5', x: { burnStacks: 3 } },
  'pyromancer:Char': { text: 'Burning enemies take 8% more damage from everything', x: { char: 0.08 } },
  'pyromancer:Wildfire': { text: 'Burning enemies spread their burn when they die', x: { wildfire: 1 } },
  'pyromancer:Controlled Burn': { text: 'Burns deal 40% more damage', x: { burnDmg: 0.4 } },
  'pyromancer:Fuel': { text: 'Each burn tick you cause restores 1 mana', x: { fuel: 1 } },
  'pyromancer:Scorched Earth': { text: 'Burns deal 50% more damage, but you take 10% more', m: { dmgTaken: 0.1 }, x: { burnDmg: 0.5 } },
  'pyromancer:Smoke Veil': { text: 'Take 5% less damage', m: { dmgTaken: -0.05 } },
  'pyromancer:Ashfall': { text: 'Cinderstorm lasts 50% longer', x: { ashfall: 0.5 } },
  'pyromancer:Everburn': { text: 'Burns last twice as long', x: { everburn: 1 } },
  'pyromancer:Inferno': { text: 'Burning enemies explode when they die', x: { inferno: 1 } },
  // Pyromancer: Hearth
  'pyromancer:Warm Blood': { text: '+10 max health', m: { hp: 10 } },
  'pyromancer:Ash Skin': { text: 'Take 4% less damage', m: { dmgTaken: -0.04 } },
  'pyromancer:Ember Shield': { text: 'Take 15% less damage while Firebrand burns', x: { emberShield: 1 } },
  'pyromancer:Heat Haze': { text: 'Dodging costs 15% less stamina', m: { dodgeCost: -0.15 } },
  'pyromancer:Phoenix Down': { text: 'Once every 5 minutes, a killing blow leaves you at 30% health instead', x: { phoenixDown: 1 } },
  'pyromancer:Ash Cloak': { text: 'Take 12% less damage', m: { dmgTaken: -0.12 } },
  'pyromancer:Burning Will': { text: '+15% stamina regen', m: { staminaRegen: 0.15 } },
  'pyromancer:Blood of Fire': { text: '+25% spell damage, but 20 less max health', m: { spell: 0.25, hp: -20 } },
  'pyromancer:Cauterize': { text: 'Flame Step heals 8% of your health', x: { cauterize: 1 } },
  'pyromancer:Rekindle': { text: 'Immolation heals you 2 health a second', x: { rekindle: 1 } },
  'pyromancer:Hearthfire': { text: '+15% healing received', m: { heal: 0.15 } },
  'pyromancer:Phoenix Crest': { text: 'Once every 5 minutes, a killing blow rebirths you at 40% health in an explosion of fire', x: { phoenixCrest: 1 } },

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

  // Lightbinder: Mercy
  'lightbinder:Gentle Hands': { text: '+8% healing', m: { heal: 0.08 } },
  'lightbinder:Warm Glow': { text: '+10 max health', m: { hp: 10 } },
  'lightbinder:Lasting Light': { text: 'Heals over time are 20% stronger and last 50% longer', x: { lasting: 1 } },
  'lightbinder:Soothing': { text: '+10% healing', m: { heal: 0.1 } },
  'lightbinder:Mending': { text: 'Renew also puts out burns', x: { mending: 1 } },
  'lightbinder:Surge': { text: 'Renew heals 40% of its total at once', x: { surge: 1 } },
  'lightbinder:Grace': { text: '+5% mana regen', m: { manaRegen: 0.05 } },
  "lightbinder:Martyr's Gift": { text: '+40% healing, but 15% less spell damage', m: { heal: 0.4, spell: -0.15 } },
  'lightbinder:Devotion': { text: 'Sanctuary lasts 2 seconds longer', x: { devotion: 2 } },
  'lightbinder:Second Wind': { text: 'Falling below 30% health casts a free Renew (once a minute)', x: { secondWind: 1 } },
  'lightbinder:Dawnbreak': { text: 'Healing Light also burns nearby enemies with holy light', x: { dawnbreak: 1 } },
  'lightbinder:Resurrection Ward': { text: 'Once every 5 minutes, a killing blow is refused and you rise at 50% health', x: { resWard: 1 } },
  // Lightbinder: Judgment
  'lightbinder:Zeal': { text: '+5% holy damage', x: { holyDmg: 0.05 } },
  'lightbinder:Bright Eyes': { text: '+3% crit chance', m: { crit: 0.03 } },
  'lightbinder:Brand': { text: 'Smite also brands its targets', x: { smiteBrand: 1 } },
  'lightbinder:Glare': { text: '+8% spell damage', m: { spell: 0.08 } },
  'lightbinder:Condemn': { text: 'Radiant Spear deals 50% more damage to branded enemies', x: { condemn: 1 } },
  'lightbinder:Purge': { text: 'Radiant Spear passes through every enemy in its path', x: { spearPierce: 1 } },
  'lightbinder:Righteous': { text: '+6% holy damage', x: { holyDmg: 0.06 } },
  'lightbinder:Wrathful': { text: '+30% holy damage, but 20% less healing', m: { heal: -0.2 }, x: { holyDmg: 0.3 } },
  'lightbinder:Blinding': { text: 'Smite strikes 30% wider', x: { smiteArea: 0.3 } },
  'lightbinder:Verdict': { text: 'Branded enemies take 40% more damage instead of 25%', x: { verdict: 1 } },
  'lightbinder:Lightfall': { text: 'Smite strikes twice', x: { lightfall: 1 } },
  // Lightbinder: Sanctum
  'lightbinder:Faithful': { text: '+10 max health', m: { hp: 10 } },
  'lightbinder:Warded': { text: 'Take 4% less damage', m: { dmgTaken: -0.04 } },
  'lightbinder:Aegis': { text: 'Divine Barrier absorbs 40% more', x: { barrierAbsorb: 0.4 } },
  'lightbinder:Hallowed': { text: 'Blessed Weapon lasts 5 seconds longer', x: { hallowed: 5 } },
  'lightbinder:Bulwark of Faith': { text: 'Take 20% less damage while standing in Consecrate', x: { faithBulwark: 1 } },
  'lightbinder:Sacred Ground': { text: 'Consecrate also heals you 3 health a second', x: { sacredGround: 3 } },
  'lightbinder:Purity': { text: '+10% healing', m: { heal: 0.1 } },
  'lightbinder:Vow of Peace': { text: 'Take 20% less damage, but deal 15% less damage', m: { dmgTaken: -0.2, melee: -0.15, spell: -0.15 } },
  'lightbinder:Aura': { text: 'Consecrate reaches 30% farther', x: { consArea: 0.3 } },
  'lightbinder:Cathedral Step': { text: 'Divine Barrier also restores 30 stamina', x: { cathedralStep: 1 } },
  'lightbinder:Halo': { text: 'Blessed Weapon hits heal you 2 health', x: { halo: 2 } },
};
