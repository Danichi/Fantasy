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
  // Read by the crafting rules (crafting/crafter.ts) for the Calling they belong to.
  calling: [
    { text: '+10% gathering yield', craft: true, x: { yield: 0.1 } },
    { text: '+8% quality of what you make', craft: true, x: { potency: 0.08 } },
    { text: '-10% gathering time', craft: true, x: { gather: 0.1 } },
    { text: '+8% chance to make two', craft: true, x: { twice: 0.08 } },
    { text: '+6% quality of what you make', craft: true, x: { potency: 0.06 } },
    { text: '+5% rare find chance', craft: true, x: { rare: 0.05 } },
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
  const x = { ...a.x };
  for (const [k, v] of Object.entries(b.x ?? {})) x[k] = (x[k] ?? 0) + v;
  return { text: `${a.text} and ${b.text}`, m, x, craft: a.craft || b.craft };
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

  // Herbalism (a calling): the brewing system (src/herbalism/herbalism.ts) reads
  // these `x` keys itself; recipe nodes teach the recipes named in their text.
  // No `m` entries, so nothing here touches the combat modifiers directly.
  // Tonics
  'herbalism:Clean Cuts': { text: 'Healing tonics heal 20% more and keep healing: another third of their strength over 8 seconds', x: { tonicHeal: 0.2, tonicHot: 1 } },
  'herbalism:Steady Hands': { text: 'The pour window when stirring is half again as wide, and nothing you brew comes out worse than Common', x: { stirWindow: 0.5, minQuality: 2 } },
  'herbalism:Hearthroot Draught': { text: 'Learn the warming and cooling brews: Hearthroot Draught (heals, restores stamina, keeps healing), Fireward Draught and Frostward Draught', x: {} },
  'herbalism:Double Batch': { text: 'Every brew at an alchemy table makes one more flask, and healing tonics two more', x: { batch: 1 } },
  'herbalism:Potent': { text: 'Potency reagents (honeycomb, bogbean, saltwort, desert rose...) count twice: up to two quality steps from them instead of one', x: { potent: 1 } },
  'herbalism:Renewal Tea': { text: "Learn Renewal Tea (a big heal over 20 seconds) and Troll's Blood (health regenerates every second)", x: {} },
  'herbalism:Quick Sip': { text: 'The healing-tonic cooldown is halved, and tonics leave no lingering toxicity', x: { quickSip: 1 } },
  'herbalism:Slow Brew': { text: 'Healing tonics heal 60% more, but all of it over 10 seconds', x: { slowBrew: 1 } },
  'herbalism:Bitter Gold': { text: '+25 toxicity tolerance: you can carry more elixirs at once before you overdose', x: { tox: 25 } },
  'herbalism:Lifebloom Tonic': { text: 'Learn Lifebloom Tonic, and every healing tonic you drink also puts out burns and draws venom', x: { tonicCleanse: 1 } },
  'herbalism:Apothecary': { text: 'Healing tonics have no cooldown and also restore 15% of your mana and stamina, but elixirs and draughts last 30% shorter', x: { apothecary: 1, buffTime: -0.3 } },
  'herbalism:Distiller': { text: 'Bases (spring water, grain spirit, pressed oil) are never used up at an alchemy table', x: { distiller: 1 } },
  'herbalism:Panacea': { text: 'Learn Panacea: half your health, mana and stamina back, every affliction and all lingering toxicity cleared, and 30 seconds immune to burns, venom and frost', x: {} },
  'herbalism:Rare Roots': { text: 'Each herb you gather has a 20% chance to come up double and a 6% chance to turn up a rarer reagent, and you can brew with reagents one tier above your level', x: { doubleFind: 0.2, rareFind: 0.06, tierBonus: 1 } },
  'herbalism:Elixir of Life': { text: 'Learn the Elixir of Life (from Starmoss): it heals you completely, and for 10 minutes death is refused once and you rise again', x: {} },
  // Venoms
  'herbalism:Careful Gloves': { text: 'Blade oils hold 50% more hits', x: { oilCharges: 0.5 } },
  'herbalism:Toxin Lore': { text: 'Venom you apply deals 25% more damage, and you learn Antivenom', x: { venomDmg: 0.25 } },
  'herbalism:Nightshade Oil': { text: "Learn the killing oils: Nightshade Oil (stacking venom), Hallowed Oil (bane of the undead) and Huntsman's Oil (bane of beasts)", x: {} },
  'herbalism:Lasting Coat': { text: 'A second oil slot: two different oils can coat your blade at once', x: { oilSlots: 1 } },
  'herbalism:Numbroot': { text: 'Poisoned foes hit you 15% softer', x: { numbroot: 0.15 } },
  'herbalism:Wither Oil': { text: 'Learn Wither Oil (venom that weakens the foe\'s blows) and Bloodcap Draught (your blows heal you)', x: {} },
  'herbalism:Paralytic': { text: 'At 5 venom stacks a foe seizes up: staggered and open to a critical hit (once every 6 seconds per foe)', x: { paralytic: 1 } },
  'herbalism:Corrosive': { text: 'Poisoned foes take 15% more damage from your blade', x: { corrosive: 0.15 } },
  'herbalism:Virulence': { text: 'Venom stacks up to 8 times instead of 5', x: { venomStacks: 3 } },
  'herbalism:Plague Flask': { text: 'Learn the war flasks: Plague Flask (a lingering venom cloud), Frost Flask and Smoke Bomb', x: {} },
  'herbalism:Venomblood': { text: 'Venom runs in you: venomous creatures deal half damage to you and are poisoned when they strike you, but healing tonics heal 30% less', x: { venomblood: 1, tonicHeal: -0.3 } },
  'herbalism:Contagion': { text: 'Thrown flasks bounce once before they burst, and when a poisoned foe dies its venom leaps to the nearest enemy', x: { bounce: 1, contagion: 1 } },
  'herbalism:Black Lotus': { text: 'Learn Black Lotus Venom: three stacks of the deadliest venom with every hit', x: {} },
  'herbalism:Deathcap': { text: 'Thrown flasks burst 35% wider and scatter two bomblets that burst again for 40% of the damage', x: { bombArea: 0.35, cluster: 1 } },
  "herbalism:Widow's Kiss": { text: "Learn Widow's Kiss (from Black Lotus): heavy venom, and foes below a fifth of their health die at the next touch", x: {} },
  // Elixirs
  "herbalism:Brewer's Eye": { text: 'You see every property of every plant, and the bench names what a mix will make before you brew it', x: { eye: 1 } },
  'herbalism:Steady Heat': { text: 'Elixirs brewed at an alchemy table come out a quality step higher', x: { elixirQ: 1 } },
  'herbalism:Ironbark Tonic': { text: 'Learn Ironbark Tonic (much less damage taken) and Stoneskin Draught (no stagger)', x: {} },
  'herbalism:Tempered': { text: '+30 toxicity tolerance, and lingering toxicity drains twice as fast', x: { tox: 30, toxDrain: 1 } },
  'herbalism:Longer Brews': { text: 'Elixirs and draughts last 35% longer', x: { buffTime: 0.35 } },
  'herbalism:Swiftroot Elixir': { text: 'Learn Swiftroot Elixir (faster in everything) and Featherfall Tincture', x: {} },
  'herbalism:Berserker Brew': { text: 'Learn Berserker Brew: a third more damage and faster swings, at the price of your guard', x: {} },
  'herbalism:Sage Brew': { text: 'Learn Sage Brew: stronger, cheaper spells and faster mana', x: {} },
  'herbalism:Mixologist': { text: 'Every experiment reveals a hidden property of each reagent in the pot, and a failed mix gives half its reagents back', x: { mixologist: 1 } },
  'herbalism:Stormleaf Elixir': { text: 'Learn Stormleaf Elixir: every third blow calls lightning', x: {} },
  'herbalism:Master Brewer': { text: 'Everything you brew comes out a quality step higher and elixirs brew in double batches, but you can no longer brew in the field', x: { masterQ: 1, elixirBatch: 1, noField: 1 } },
  'herbalism:Twin Elixir': { text: 'Elixirs and draughts cost 35% less toxicity', x: { twin: 0.35 } },
  'herbalism:Moonpetal': { text: 'Learn Moonpetal Essence (from Moonpetal): all your mana back, then faster mana and stronger spells', x: {} },
  'herbalism:Dragonbloom': { text: 'Learn Dragonbloom Elixir (from Dragonbloom): harder blows that set foes alight, and fire can\'t burn you', x: {} },
  "herbalism:Philosopher's Draught": { text: "Learn the Philosopher's Draught (better at everything, no toxicity), and you can no longer overdose: toxicity past your limit does you no harm", x: { noOverdose: 1 } },
};
