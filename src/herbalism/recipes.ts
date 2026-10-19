import type { Prop } from '../items/reagents';

// Every brew a herbalist can make (pure data: no game imports, so the item
// table can be generated from it without import cycles).
//
// A recipe is a set of reagent PROPERTIES, not a fixed list of plants: any
// reagents whose properties add up to `needs` (and include one of `key`, for
// the rare brews) make it, in the right base. That is what makes
// experimenting work: combine what you have, and if the properties match a
// recipe you haven't learned yet, you discover it.
//
// `fx` numbers are for a Fine brew; quality scales them (QMULT, QDUR).

export type BrewCat = 'tonic' | 'draught' | 'elixir' | 'oil' | 'bomb';
export type BaseId = 'water' | 'spirit' | 'oil';
export type Shape = 'round' | 'vial' | 'tall' | 'flask' | 'jar' | 'bomb';

/** What a brew does. Instant effects, timed buff effects, oil and bomb effects share one bag. */
export interface BrewFx {
  // instant
  heal?: number; healPct?: number; mana?: number; manaPct?: number; stamina?: number; staPct?: number;
  /** heal over time: total and seconds */
  hot?: number; hotT?: number;
  /** clears burns, venom and chill on you */
  cleanse?: number;
  /** clears lingering (tonic) toxicity */
  toxPurge?: number;
  /** seconds of water breathing */
  breath?: number;
  // timed buffs (fractions: 0.16 = +16%)
  melee?: number; ward?: number; move?: number; atk?: number; crit?: number; dodge?: number;
  /** incoming poise (stagger) reduction */
  poise?: number; poiseDmg?: number; spell?: number; manaRegen?: number; staRegen?: number; manaCost?: number;
  /** health regenerated per second, as a fraction of max health */
  regen?: number; lifesteal?: number;
  resFire?: number; resFrost?: number; resPoison?: number;
  burnImmune?: number;
  /** immune to burns, venom and frost */
  immune?: number;
  /** chance an attack simply misses you */
  evade?: number;
  /** your first blow from hiding crits (recharges) */
  ambush?: number;
  vision?: number; feather?: number;
  /** chance a gathered herb comes up double */
  forage?: number;
  /** lightning on every third blow (damage) */
  storm?: number;
  /** your blows set foes alight (fire damage a second) */
  dragon?: number;
  /** death refused once: rise at this fraction of health */
  revive?: number;
  // blade oils
  charges?: number; oilBurn?: number; oilChill?: number; chillDmg?: number; oilVenom?: number; venomDps?: number;
  oilWither?: number; baneUndead?: number; baneBeast?: number; execute?: number;
  // thrown flasks
  dmg?: number; radius?: number; burn?: number; freeze?: number; cloud?: number; cloudVenom?: number; smoke?: number; holy?: number;
}

/** fx keys that are durations or yes/no flags: quality doesn't multiply them */
export const FIXED_FX = new Set<keyof BrewFx>(['hotT', 'cleanse', 'toxPurge', 'burnImmune', 'immune', 'ambush', 'vision', 'feather', 'oilChill', 'freeze', 'holy', 'radius', 'cloudVenom', 'manaPct', 'healPct', 'staPct']);
/** fx keys that are durations (quality stretches them with QDUR) */
export const TIME_FX = new Set<keyof BrewFx>(['breath', 'cloud', 'smoke', 'charges']);

export interface RecipeSource {
  /** known from the first lesson */
  basic?: boolean;
  /** taught by this Herbalism tree node (name) */
  node?: string;
  /** printed in these recipe books (item ids) */
  books?: string[];
  /** can be found by experimenting */
  discover?: boolean;
}

export interface RecipeDef {
  id: string;
  name: string;
  cat: BrewCat;
  base: BaseId;
  needs: Partial<Record<Prop, number>>;
  /** one of these reagents must be in the pot */
  key?: string[];
  /** 1-5: XP, sale value and the quality bonus for finer reagents */
  tier: 1 | 2 | 3 | 4 | 5;
  /** buff family: only one brew of a family can be active at a time */
  family?: string;
  /** buff length in seconds (Fine) */
  dur?: number;
  /** toxicity while active (elixirs) or on drinking (tonics, lingering) */
  tox: number;
  fx: BrewFx;
  color: number;
  shape: Shape;
  src: RecipeSource;
  blurb: string;
}

export const QUALITY_NAMES = ['', 'Crude', 'Common', 'Fine', 'Superior', 'Masterwork'] as const;
/** strength by quality (index 1-5) */
export const QMULT = [0, 0.6, 0.8, 1, 1.25, 1.55];
/** duration by quality */
export const QDUR = [0, 0.7, 0.85, 1, 1.2, 1.45];
export const QRARITY = ['common', 'common', 'common', 'fine', 'rare', 'epic'] as const;

export const CAT_NAME: Record<BrewCat, string> = { tonic: 'Healing tonics', draught: 'Draughts', elixir: 'Combat elixirs', oil: 'Blade oils', bomb: 'Thrown flasks' };
export const BASE_NAME: Record<BaseId, string> = { water: 'Spring Water', spirit: 'Grain Spirit', oil: 'Pressed Oil' };
/** base -> its item id */
export const BASE_ITEM: Record<BaseId, string> = { water: 'springWater', spirit: 'grainSpirit', oil: 'pressedOil' };

/** Herbalism level at which each reagent tier can be worked (the tree's tier gates). */
export const TIER_LEVEL = [0, 1, 5, 10, 15, 20];

// Books: [id, title, recipes]. Their items live in items/brews.ts.
export const BOOKS: { id: string; name: string; desc: string; recipes: string[]; price: number }[] = [
  { id: 'bookHedgeWitch', name: "A Hedge-Witch's Primer", price: 45, recipes: ['fireOil', 'fireFlask', 'foragersTea', 'nightsight'], desc: 'A grubby little primer stitched with string. Fire for blades and bottles, a tea for foragers, and how to see in the dark.' },
  { id: 'bookSoldier', name: "The Soldier's Herbal", price: 120, recipes: ['might', 'hawkeye', 'stoneskin', 'travellersBrew'], desc: 'Issued to the King\'s sergeants and mostly lost by them. Four brews that win battles.' },
  { id: 'bookMariner', name: "Mariner's Remedies", price: 90, recipes: ['gills', 'antivenom', 'frostOil', 'frostFlask'], desc: 'Salt-stained notes from the ship-surgeons of Port Aurelle: gills, cures for sea-stings, and the cold that keeps fish fresh.' },
  { id: 'bookHuntsman', name: "The Huntsman's Almanac", price: 110, recipes: ['huntsman', 'smokeBomb', 'bloodcap', 'trollsBlood'], desc: 'What the royal huntsmen put on their spears, in their flasks and in their bellies.' },
  { id: 'bookNight', name: 'Of Night-Blooming Things', price: 160, recipes: ['shadow', 'featherfall', 'smokeBomb', 'nightsight'], desc: 'A Collegium treatise on plants that open under the moon, and what they do to those who drink them.' },
  { id: 'bookGrey', name: 'The Grey Compendium', price: 220, recipes: ['hallowed', 'holyWater', 'trollsBlood'], desc: 'The temple\'s own book against the restless dead. The margins are full of prayers.' },
  { id: 'bookDesert', name: 'Balms of the Burning Sands', price: 140, recipes: ['fireward', 'frostward', 'antivenom', 'travellersBrew'], desc: 'Healer Meritites\' copy of the House of Balms\' recipes, for heat, cold and the stings of the dunes.' },
  { id: 'bookCollegium', name: 'The Collegium Pharmacopoeia', price: 300, recipes: ['sageBrew', 'ironbark', 'lifebloom'], desc: 'The court alchemists\' great book, chained to a lectern until someone paid the Collegium enough to unchain one copy.' },
];

const R = (r: RecipeDef) => r;

export const RECIPES: RecipeDef[] = [
  // ---- healing tonics (water) -------------------------------------------------------------
  R({ id: 'healingTonic', name: 'Healing Tonic', cat: 'tonic', base: 'water', needs: { heal: 2 }, tier: 1, tox: 6, fx: { heal: 75 }, color: 0xd8463a, shape: 'round', src: { basic: true }, blurb: 'Two healing herbs steeped in spring water. The first thing every herbalist learns, and the last thing they run out of.' }),
  R({ id: 'hearthroot', name: 'Hearthroot Draught', cat: 'tonic', base: 'water', needs: { heal: 1, stamina: 1, strength: 1 }, tier: 2, tox: 6, fx: { heal: 70, stamina: 60, hot: 60, hotT: 12 }, color: 0xc8642a, shape: 'round', src: { node: 'Hearthroot Draught' }, blurb: 'A root-brown draught that warms you to the fingertips: it heals, restores your wind, and keeps healing.' }),
  R({ id: 'renewalTea', name: 'Renewal Tea', cat: 'tonic', base: 'water', needs: { heal: 1, cure: 1, stamina: 1 }, tier: 2, tox: 4, fx: { hot: 240, hotT: 20 }, color: 0x8fbf5a, shape: 'tall', src: { node: 'Renewal Tea' }, blurb: 'Drunk before the fight, not during it: a slow green tea that knits you back together over twenty seconds.' }),
  R({ id: 'lifebloom', name: 'Lifebloom Tonic', cat: 'tonic', base: 'water', needs: { heal: 2, cure: 1, ward: 1 }, tier: 3, family: 'bloom', dur: 8, tox: 8, fx: { heal: 150, cleanse: 1, ward: 0.2 }, color: 0xf07aa0, shape: 'round', src: { node: 'Lifebloom Tonic', books: ['bookCollegium'] }, blurb: 'A great gulp of health that also puts out fire, draws venom, and hardens your skin for a few heartbeats.' }),
  R({ id: 'panacea', name: 'Panacea', cat: 'tonic', base: 'water', needs: { heal: 2, cure: 2, mana: 1 }, tier: 4, family: 'panacea', dur: 30, tox: 0, fx: { healPct: 0.5, manaPct: 0.5, staPct: 0.5, cleanse: 1, toxPurge: 1, immune: 1 }, color: 0xf2f0e0, shape: 'tall', src: { node: 'Panacea' }, blurb: 'The cure for everything: half your health, mana and stamina back, every affliction and all lingering toxicity gone, and thirty seconds when nothing can poison, burn or freeze you.' }),
  R({ id: 'elixirOfLife', name: 'Elixir of Life', cat: 'tonic', base: 'water', needs: { heal: 2, cure: 1, ward: 1 }, key: ['starmoss'], tier: 5, family: 'life', dur: 600, tox: 0, fx: { healPct: 1, cleanse: 1, revive: 0.6 }, color: 0xfff2a8, shape: 'tall', src: { node: 'Elixir of Life' }, blurb: 'Starmoss gathered on a high peak at night, bound in living water. It heals you completely, and for ten minutes death is refused once: you rise again.' }),
  // ---- draughts (water) -------------------------------------------------------------------
  R({ id: 'manaDraught', name: 'Mana Draught', cat: 'draught', base: 'water', needs: { mana: 2 }, tier: 1, tox: 6, fx: { mana: 80 }, color: 0x3f7fe0, shape: 'round', src: { basic: true }, blurb: 'Blue as a river at dusk. Restores mana.' }),
  R({ id: 'staminaDraught', name: 'Stamina Draught', cat: 'draught', base: 'water', needs: { stamina: 2 }, tier: 1, family: 'vigour', dur: 45, tox: 4, fx: { stamina: 100, staRegen: 0.25 }, color: 0x5fc06a, shape: 'vial', src: { basic: true }, blurb: 'Mint and sweat. Fills your lungs again and keeps them filling faster for a while.' }),
  R({ id: 'purgingDraught', name: 'Purging Draught', cat: 'draught', base: 'water', needs: { cure: 2 }, tier: 1, tox: 0, fx: { cleanse: 1, toxPurge: 1 }, color: 0xe8e2c0, shape: 'vial', src: { basic: true }, blurb: 'Bitter enough to make your eyes water. Clears burns, venom, chill and the toxicity of too many tonics.' }),
  R({ id: 'antivenom', name: 'Antivenom', cat: 'draught', base: 'water', needs: { cure: 1, poison: 1 }, tier: 1, family: 'resPoison', dur: 300, tox: 8, fx: { cleanse: 1, resPoison: 0.5 }, color: 0x9ad04a, shape: 'vial', src: { node: 'Toxin Lore', books: ['bookMariner', 'bookDesert'], discover: true }, blurb: 'A little of the poison and a lot of the cure. Venomous creatures hurt you far less.' }),
  R({ id: 'fireward', name: 'Fireward Draught', cat: 'draught', base: 'water', needs: { frost: 1, ward: 1 }, tier: 2, family: 'resFire', dur: 300, tox: 10, fx: { resFire: 0.5 }, color: 0x6ad0e8, shape: 'tall', src: { node: 'Hearthroot Draught', books: ['bookDesert'], discover: true }, blurb: 'Cold to drink and colder to hold. Fire and the creatures of fire hurt you less; at Superior quality you cannot be set alight at all.' }),
  R({ id: 'frostward', name: 'Frostward Draught', cat: 'draught', base: 'water', needs: { fire: 1, ward: 1 }, tier: 2, family: 'resFrost', dur: 300, tox: 10, fx: { resFrost: 0.5 }, color: 0xe88a3a, shape: 'tall', src: { node: 'Hearthroot Draught', books: ['bookDesert'], discover: true }, blurb: 'Warm as a hearth in the belly. Frost and the creatures of the cold hurt you less.' }),
  R({ id: 'nightsight', name: "Owl's Eye Draught", cat: 'draught', base: 'water', needs: { vision: 2 }, tier: 2, family: 'vision', dur: 480, tox: 8, fx: { vision: 1 }, color: 0xb8e05a, shape: 'vial', src: { books: ['bookHedgeWitch', 'bookNight'], discover: true }, blurb: 'Your pupils swell like an owl\'s. Night and dark places brighten around you.' }),
  R({ id: 'shadow', name: 'Shadow Draught', cat: 'draught', base: 'water', needs: { stealth: 2 }, tier: 2, family: 'shadow', dur: 180, tox: 15, fx: { evade: 0.25, ambush: 1 }, color: 0x4a3a6a, shape: 'tall', src: { books: ['bookNight'], discover: true }, blurb: 'You are hard to look at. Attacks often miss you outright, and your first blow from that blur always lands as a critical (again every 8 seconds).' }),
  R({ id: 'gills', name: 'Draught of Gills', cat: 'draught', base: 'water', needs: { stamina: 1, binder: 2 }, tier: 1, family: 'gills', tox: 5, fx: { breath: 180 }, color: 0x2aa8a0, shape: 'round', src: { books: ['bookMariner'], discover: true }, blurb: 'Kelp and slime. Disgusting, and you can breathe underwater for three minutes.' }),
  R({ id: 'featherfall', name: 'Featherfall Tincture', cat: 'draught', base: 'water', needs: { speed: 1, arcane: 1 }, tier: 3, family: 'feather', dur: 300, tox: 8, fx: { feather: 1 }, color: 0xe8f0ff, shape: 'vial', src: { node: 'Swiftroot Elixir', books: ['bookNight'] }, blurb: 'You weigh what a thought weighs. You fall like a leaf from any height.' }),
  R({ id: 'foragersTea', name: "Forager's Tea", cat: 'draught', base: 'water', needs: { vision: 1, cure: 1 }, tier: 2, family: 'forage', dur: 600, tox: 0, fx: { forage: 0.35 }, color: 0xc8b04a, shape: 'round', src: { books: ['bookHedgeWitch'], discover: true }, blurb: 'A herbalist\'s morning tea. Plants seem to find you: each herb you gather may come up double.' }),
  R({ id: 'travellersBrew', name: "Traveller's Brew", cat: 'draught', base: 'water', needs: { stamina: 1, speed: 1 }, tier: 3, family: 'swift', dur: 600, tox: 5, fx: { move: 0.1, staRegen: 0.3 }, color: 0xe0c070, shape: 'round', src: { books: ['bookSoldier', 'bookDesert'], discover: true }, blurb: 'For long roads: lighter feet and a deeper breath for ten minutes.' }),
  R({ id: 'moonpetal', name: 'Moonpetal Essence', cat: 'draught', base: 'water', needs: { mana: 2, arcane: 1 }, key: ['moonpetal'], tier: 4, family: 'arcane', dur: 240, tox: 15, fx: { manaPct: 1, manaRegen: 0.6, spell: 0.12 }, color: 0xc0c8ff, shape: 'tall', src: { node: 'Moonpetal' }, blurb: 'Moonlight you can drink. All your mana at once, then it flows back faster and your spells cut deeper.' }),
  // ---- combat elixirs (spirit) -----------------------------------------------------------
  R({ id: 'might', name: 'Elixir of Might', cat: 'elixir', base: 'spirit', needs: { strength: 2 }, tier: 1, family: 'might', dur: 180, tox: 20, fx: { melee: 0.16, poiseDmg: 0.1 }, color: 0xc83a2a, shape: 'flask', src: { books: ['bookSoldier'], discover: true }, blurb: 'Nettle and fang in strong spirit. Your blows land harder and break guards sooner.' }),
  R({ id: 'berserker', name: 'Berserker Brew', cat: 'elixir', base: 'spirit', needs: { strength: 2, fire: 1 }, tier: 2, family: 'might', dur: 150, tox: 30, fx: { melee: 0.32, atk: 0.12, ward: -0.2 }, color: 0x8a1a1a, shape: 'flask', src: { node: 'Berserker Brew' }, blurb: 'Red rage in a bottle: far more damage and faster swings, but you stop caring about being hit, and so you are hit harder.' }),
  R({ id: 'ironbark', name: 'Ironbark Tonic', cat: 'elixir', base: 'spirit', needs: { ward: 2, strength: 1 }, tier: 2, family: 'ironbark', dur: 180, tox: 20, fx: { ward: 0.18 }, color: 0x8a6a3a, shape: 'flask', src: { node: 'Ironbark Tonic', books: ['bookCollegium'] }, blurb: 'Your skin goes grey and tough as oak bark. You take much less damage.' }),
  R({ id: 'stoneskin', name: 'Stoneskin Draught', cat: 'elixir', base: 'spirit', needs: { ward: 2 }, tier: 1, family: 'stone', dur: 180, tox: 15, fx: { poise: 0.6, ward: 0.05 }, color: 0x9a9a8a, shape: 'jar', src: { node: 'Ironbark Tonic', books: ['bookSoldier'], discover: true }, blurb: 'You set like mortar. Blows that would stagger you barely move you.' }),
  R({ id: 'swiftroot', name: 'Swiftroot Elixir', cat: 'elixir', base: 'spirit', needs: { speed: 1, stamina: 1 }, tier: 3, family: 'swift', dur: 180, tox: 22, fx: { move: 0.16, atk: 0.12, dodge: 0.2 }, color: 0x5ae0a0, shape: 'flask', src: { node: 'Swiftroot Elixir' }, blurb: 'Everything else slows down. You move, swing and roll faster, and rolling tires you less.' }),
  R({ id: 'hawkeye', name: 'Hawkeye Draught', cat: 'elixir', base: 'spirit', needs: { vision: 1, strength: 1 }, tier: 2, family: 'keen', dur: 180, tox: 18, fx: { crit: 0.12 }, color: 0xe0c040, shape: 'vial', src: { books: ['bookSoldier'], discover: true }, blurb: 'You see the gaps in every guard. Many more of your blows are critical.' }),
  R({ id: 'trollsBlood', name: "Troll's Blood", cat: 'elixir', base: 'spirit', needs: { heal: 2, strength: 1 }, tier: 2, family: 'regen', dur: 120, tox: 25, fx: { regen: 0.012 }, color: 0x4a7a3a, shape: 'jar', src: { node: 'Renewal Tea', books: ['bookGrey', 'bookHuntsman'], discover: true }, blurb: 'Thick, green and faintly warm. Your wounds close as you watch: health regenerates every second.' }),
  R({ id: 'bloodcap', name: 'Bloodcap Draught', cat: 'elixir', base: 'spirit', needs: { lifesteal: 1, heal: 1 }, tier: 2, family: 'vamp', dur: 180, tox: 22, fx: { lifesteal: 0.08 }, color: 0x9a1a3a, shape: 'vial', src: { node: 'Wither Oil', books: ['bookHuntsman'], discover: true }, blurb: 'Tastes of iron. Every blow you land gives some of its damage back to you as health.' }),
  R({ id: 'sageBrew', name: 'Sage Brew', cat: 'elixir', base: 'spirit', needs: { mana: 1, arcane: 1, cure: 1 }, tier: 2, family: 'arcane', dur: 180, tox: 20, fx: { spell: 0.22, manaRegen: 0.4, manaCost: 0.1 }, color: 0x7a5ad0, shape: 'tall', src: { node: 'Sage Brew', books: ['bookCollegium'] }, blurb: 'The Collegium\'s exam-night brew: stronger spells, cheaper spells, and mana that comes back faster.' }),
  R({ id: 'stormleaf', name: 'Stormleaf Elixir', cat: 'elixir', base: 'spirit', needs: { speed: 1, arcane: 1, mana: 1 }, tier: 3, family: 'storm', dur: 150, tox: 28, fx: { storm: 45 }, color: 0x8ad0ff, shape: 'flask', src: { node: 'Stormleaf Elixir' }, blurb: 'Your hair stands on end. Every third blow calls down lightning on your foe, and it leaps to another nearby.' }),
  R({ id: 'dragonbloom', name: 'Dragonbloom Elixir', cat: 'elixir', base: 'spirit', needs: { fire: 2, strength: 1 }, key: ['dragonbloom'], tier: 5, family: 'dragon', dur: 180, tox: 35, fx: { melee: 0.25, dragon: 8, resFire: 0.6, burnImmune: 1 }, color: 0xff6a1a, shape: 'flask', src: { node: 'Dragonbloom' }, blurb: 'You breathe smoke. Your blows hit harder and set foes alight, and fire can no longer burn you.' }),
  R({ id: 'philosopher', name: "Philosopher's Draught", cat: 'elixir', base: 'spirit', needs: { arcane: 2, heal: 1, strength: 1 }, key: ['moonpetal', 'starmoss', 'dragonbloom', 'blackLotus'], tier: 5, family: 'grand', dur: 240, tox: 0, fx: { melee: 0.2, ward: 0.18, move: 0.12, atk: 0.12, crit: 0.1, manaRegen: 0.5, staRegen: 0.5, spell: 0.2 }, color: 0xf0d070, shape: 'tall', src: { node: "Philosopher's Draught" }, blurb: 'The great work. For four minutes you are better at everything: harder, tougher, faster, keener, and it costs you no toxicity at all.' }),
  // ---- blade oils (oil) -------------------------------------------------------------------
  R({ id: 'fireOil', name: 'Emberoil', cat: 'oil', base: 'oil', needs: { fire: 1, binder: 1 }, tier: 2, tox: 0, fx: { charges: 30, oilBurn: 8 }, color: 0xff7a2a, shape: 'jar', src: { books: ['bookHedgeWitch'], discover: true }, blurb: 'Rubbed on a blade, it catches on the first swing. Every hit sets the foe burning.' }),
  R({ id: 'frostOil', name: 'Rimeoil', cat: 'oil', base: 'oil', needs: { frost: 1, binder: 1 }, tier: 2, tox: 0, fx: { charges: 30, oilChill: 4, chillDmg: 6 }, color: 0x8ad8ff, shape: 'jar', src: { books: ['bookMariner'], discover: true }, blurb: 'The blade frosts over. Each hit chills; enough of them freeze a foe solid (three hits at Superior quality).' }),
  R({ id: 'nightshade', name: 'Nightshade Oil', cat: 'oil', base: 'oil', needs: { poison: 2 }, tier: 1, tox: 0, fx: { charges: 30, oilVenom: 1, venomDps: 3 }, color: 0x5a2a7a, shape: 'jar', src: { node: 'Nightshade Oil' }, blurb: 'A purple sheen on the steel. Each hit adds a stack of venom that eats at the foe for six seconds.' }),
  R({ id: 'wither', name: 'Wither Oil', cat: 'oil', base: 'oil', needs: { poison: 1, arcane: 1 }, tier: 2, tox: 0, fx: { charges: 30, oilVenom: 1, venomDps: 2.5, oilWither: 0.25 }, color: 0x6a6a3a, shape: 'jar', src: { node: 'Wither Oil' }, blurb: 'Venom that withers the arm: poisoned foes also hit you a quarter softer.' }),
  R({ id: 'hallowed', name: 'Hallowed Oil', cat: 'oil', base: 'oil', needs: { cure: 1, ward: 1, arcane: 1 }, tier: 2, tox: 0, fx: { charges: 30, baneUndead: 0.5 }, color: 0xfff0b0, shape: 'jar', src: { node: 'Nightshade Oil', books: ['bookGrey'] }, blurb: 'Blessed oil. Your blade burns the restless dead: far more damage to skeletons, zombies and their kin.' }),
  R({ id: 'huntsman', name: "Huntsman's Oil", cat: 'oil', base: 'oil', needs: { strength: 1, poison: 1 }, tier: 1, tox: 0, fx: { charges: 30, baneBeast: 0.45 }, color: 0x8a5a2a, shape: 'jar', src: { node: 'Nightshade Oil', books: ['bookHuntsman'], discover: true }, blurb: 'Smells of musk and blood. Far more damage to wolves, stags, rats and the beasts of sand and sea.' }),
  R({ id: 'blackLotusOil', name: 'Black Lotus Venom', cat: 'oil', base: 'oil', needs: { poison: 2, arcane: 1 }, key: ['blackLotus'], tier: 5, tox: 0, fx: { charges: 30, oilVenom: 3, venomDps: 6 }, color: 0x2a0a3a, shape: 'jar', src: { node: 'Black Lotus' }, blurb: 'The deadliest venom known. Three stacks a hit, each burning twice as hot as nightshade.' }),
  R({ id: 'widowsKiss', name: "Widow's Kiss", cat: 'oil', base: 'oil', needs: { poison: 2, lifesteal: 1 }, key: ['blackLotus'], tier: 5, tox: 0, fx: { charges: 25, oilVenom: 2, venomDps: 5, execute: 0.2 }, color: 0x3a0a1a, shape: 'jar', src: { node: "Widow's Kiss" }, blurb: 'A kiss on the blade. Heavy venom, and any foe below a fifth of its health dies at the next touch (great beasts and bosses only take the venom). Each kill restores some of your health.' }),
  // ---- thrown flasks (spirit) -------------------------------------------------------------
  R({ id: 'fireFlask', name: 'Fire Flask', cat: 'bomb', base: 'spirit', needs: { fire: 1, binder: 1 }, tier: 2, tox: 0, fx: { dmg: 55, radius: 3.2, burn: 8 }, color: 0xff5a1a, shape: 'bomb', src: { books: ['bookHedgeWitch'], discover: true }, blurb: 'Throw it (quick slot). It bursts in a ball of flame and leaves everything nearby burning.' }),
  R({ id: 'frostFlask', name: 'Frost Flask', cat: 'bomb', base: 'spirit', needs: { frost: 1, binder: 1 }, tier: 2, tox: 0, fx: { dmg: 40, radius: 3.2, freeze: 1 }, color: 0x9ae0ff, shape: 'bomb', src: { node: 'Plague Flask', books: ['bookMariner'], discover: true }, blurb: 'Bursts into a cloud of rime that freezes everything caught in it for a moment.' }),
  R({ id: 'plagueFlask', name: 'Plague Flask', cat: 'bomb', base: 'spirit', needs: { poison: 2, binder: 1 }, tier: 2, tox: 0, fx: { dmg: 15, radius: 3.6, cloud: 8, cloudVenom: 1 }, color: 0x7ac03a, shape: 'bomb', src: { node: 'Plague Flask' }, blurb: 'Leaves a lingering green cloud that stacks venom on everything inside it.' }),
  R({ id: 'smokeBomb', name: 'Smoke Bomb', cat: 'bomb', base: 'spirit', needs: { stealth: 1, binder: 1 }, tier: 2, tox: 0, fx: { radius: 4, smoke: 7 }, color: 0x9a9a9a, shape: 'bomb', src: { node: 'Plague Flask', books: ['bookNight', 'bookHuntsman'] }, blurb: 'A choking grey cloud. Foes who blunder into it reel blind (open to a critical hit), and while you stand in it attacks often miss you.' }),
  R({ id: 'holyWater', name: 'Holy Water', cat: 'bomb', base: 'spirit', needs: { cure: 1, ward: 1, binder: 1 }, tier: 2, tox: 0, fx: { dmg: 90, radius: 3.4, holy: 1 }, color: 0xfff8d0, shape: 'bomb', src: { books: ['bookGrey'], discover: true }, blurb: 'Blessed spirit in a thin glass ball. Sears the undead for terrible damage and staggers them; the living barely notice.' }),
];

export const RECIPE: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Item id of a brew at a quality (1 Crude .. 5 Masterwork). */
export const brewId = (recipe: string, q: number) => `brew_${recipe}_${q}`;
/** Parse a brew item id back into recipe and quality. */
export function parseBrewId(id: string): { recipe: RecipeDef; q: number } | null {
  const m = /^brew_(\w+)_([1-5])$/.exec(id);
  const recipe = m ? RECIPE[m[1]] : undefined;
  return recipe ? { recipe, q: Number(m![2]) } : null;
}

/** A recipe's fx at a quality (and a perk-driven duration multiplier for buffs). */
export function fxAt(r: RecipeDef, q: number): BrewFx {
  const out: BrewFx = {};
  for (const [k, v] of Object.entries(r.fx) as [keyof BrewFx, number][]) {
    if (FIXED_FX.has(k)) out[k] = v;
    else if (TIME_FX.has(k)) out[k] = Math.round(v * QDUR[q]);
    else out[k] = v < 0 ? v : v * QMULT[q]; // drawbacks don't grow with quality
  }
  // Fine-grained quality rules.
  if (r.fx.oilChill) out.oilChill = q >= 4 ? r.fx.oilChill - 1 : q <= 1 ? r.fx.oilChill + 1 : r.fx.oilChill;
  if (r.fx.resFire && r.id === 'fireward' && q >= 4) out.burnImmune = 1;
  if (r.fx.radius) out.radius = r.fx.radius * (0.9 + 0.05 * q);
  if (r.fx.revive) out.revive = Math.min(1, r.fx.revive * (0.8 + 0.1 * q));
  // Resistances and evasion soften toward a ceiling rather than scaling past it.
  for (const k of ['resFire', 'resFrost', 'resPoison', 'evade', 'poise'] as const) if (out[k]) out[k] = Math.min(0.9, out[k]!);
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)} s`);
export const fmtTime = secs;

/** Plain-words lines of what a brew does at a quality. */
export function describeFx(r: RecipeDef, q: number, durMul = 1): string[] {
  const f = fxAt(r, q), out: string[] = [];
  const n = (v: number | undefined) => Math.round(v ?? 0);
  if (f.heal) out.push(`Heals ${n(f.heal)} health`);
  if (f.healPct) out.push(f.healPct >= 1 ? 'Heals you completely' : `Heals ${pct(f.healPct)} of your health`);
  if (f.hot) out.push(`Heals ${n(f.hot)} more over ${f.hotT} s`);
  if (f.mana) out.push(`Restores ${n(f.mana)} mana`);
  if (f.manaPct) out.push(f.manaPct >= 1 ? 'Restores all your mana' : `Restores ${pct(f.manaPct)} of your mana`);
  if (f.stamina) out.push(`Restores ${n(f.stamina)} stamina`);
  if (f.staPct) out.push(`Restores ${pct(f.staPct)} of your stamina`);
  if (f.cleanse) out.push('Cures burns, venom and chill');
  if (f.toxPurge) out.push('Clears lingering toxicity');
  if (f.breath) out.push(`Breathe underwater for ${secs(f.breath)}`);
  if (f.melee) out.push(`${f.melee > 0 ? '+' : ''}${pct(f.melee)} melee damage`);
  if (f.poiseDmg) out.push(`+${pct(f.poiseDmg)} stagger dealt`);
  if (f.atk) out.push(`+${pct(f.atk)} attack speed`);
  if (f.ward) out.push(f.ward > 0 ? `${pct(f.ward)} less damage taken` : `${pct(-f.ward)} more damage taken`);
  if (f.poise) out.push(`${pct(f.poise)} less stagger from blows`);
  if (f.move) out.push(`+${pct(f.move)} movement speed`);
  if (f.dodge) out.push(`Rolling costs ${pct(f.dodge)} less stamina`);
  if (f.crit) out.push(`+${pct(f.crit)} critical chance`);
  if (f.spell) out.push(`+${pct(f.spell)} spell damage`);
  if (f.manaCost) out.push(`Spells cost ${pct(f.manaCost)} less mana`);
  if (f.manaRegen) out.push(`+${pct(f.manaRegen)} mana regeneration`);
  if (f.staRegen) out.push(`+${pct(f.staRegen)} stamina regeneration`);
  if (f.regen) out.push(`Regenerate ${(f.regen * 100).toFixed(1)}% of your health every second`);
  if (f.lifesteal) out.push(`Blows heal you for ${pct(f.lifesteal)} of their damage`);
  if (f.resFire) out.push(`${pct(f.resFire)} less damage from fire and fire creatures`);
  if (f.burnImmune) out.push('You cannot be set alight');
  if (f.resFrost) out.push(`${pct(f.resFrost)} less damage from frost creatures`);
  if (f.resPoison) out.push(`${pct(f.resPoison)} less damage from venomous creatures`);
  if (f.immune) out.push('Immune to burns, venom and frost');
  if (f.evade) out.push(`${pct(f.evade)} of attacks miss you`);
  if (f.ambush) out.push('Your first blow (and one every 8 s) is a critical');
  if (f.vision) out.push('Night and dark places brighten');
  if (f.feather) out.push('You fall slowly from any height');
  if (f.forage) out.push(`${pct(f.forage)} chance a gathered herb comes up double`);
  if (f.storm) out.push(`Every third blow calls lightning for ${n(f.storm)} damage`);
  if (f.dragon) out.push(`Your blows burn foes for ${n(f.dragon)} a second`);
  if (f.revive) out.push(`Death is refused once: you rise at ${pct(f.revive)} health`);
  if (f.oilBurn) out.push(`Hits set foes burning (${n(f.oilBurn)} a second for 3 s)`);
  if (f.oilChill) out.push(`Hits chill for ${n(f.chillDmg)}; ${f.oilChill} chills freeze a foe solid`);
  if (f.oilVenom) out.push(`Each hit adds ${f.oilVenom} venom stack${f.oilVenom > 1 ? 's' : ''} (${(f.venomDps ?? 0).toFixed(1)} a second each, 6 s)`);
  if (f.oilWither) out.push(`Poisoned foes hit you ${pct(f.oilWither)} softer`);
  if (f.baneUndead) out.push(`+${pct(f.baneUndead)} damage to the undead`);
  if (f.baneBeast) out.push(`+${pct(f.baneBeast)} damage to beasts`);
  if (f.execute) out.push(`Foes below ${pct(f.execute)} health die at the next touch`);
  if (f.charges) out.push(`Coats your blade for ${n(f.charges)} hits`);
  if (f.dmg) out.push(`Bursts for ${n(f.dmg)} damage${f.holy ? ' (to the undead; a quarter to others)' : ''} in ${f.radius!.toFixed(1)} m`);
  if (f.burn) out.push(`Sets everything caught burning (${n(f.burn)} a second)`);
  if (f.freeze) out.push('Freezes everything caught');
  if (f.cloud) out.push(`Leaves a venom cloud for ${n(f.cloud)} s`);
  if (f.smoke) out.push(`Leaves blinding smoke for ${n(f.smoke)} s`);
  if (r.dur) out.push(`Lasts ${secs(r.dur * QDUR[q] * durMul)}`);
  return out;
}
