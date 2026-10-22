// Every recipe in the game (docs/design/arms-and-crafting.md §5): what it
// makes, at which station, for which Calling and level, from what, and how
// you come to know it. Tiers 1 to 3 (iron, steel, silversteel; oak, ash, yew;
// leather, hardened leather, drake leather; wool, linen, silk).

export type StationKind = 'forge' | 'workbench' | 'alchemy' | 'kitchen' | 'runestone' | 'loom';
export type CallingId = 'smithing' | 'herbalism' | 'cooking' | 'runecraft' | 'tailoring';
/** The short timing step: three hammer beats, a stir, or taking it off the heat. */
export type Step = 'hammer' | 'stir' | 'heat' | 'none';

export interface Ingredient {
  /** an item id, or a group ('fish') */
  id: string;
  n: number;
}

export interface Recipe {
  id: string;
  out: string;
  /** how many it makes (arrows come in tens) */
  n?: number;
  station: StationKind;
  /** the Calling it trains and needs (none: anyone can tan a hide or spin wool) */
  calling?: CallingId;
  level: number;
  inputs: Ingredient[];
  /**
   * How you learn it: 'basic' (known once you have the Calling and its level),
   * 'node' (the Calling's tree node of the same name, or `node`), a book's
   * item id ('book:bookSmithing'), or 'discover' (try the right materials together).
   */
  learn: 'basic' | 'node' | 'discover' | `book:${string}`;
  node?: string;
  /** made things carry a quality (gear, potions, meals); refined materials don't */
  quality: boolean;
  step: Step;
}

/** Ingredient groups: any one of these will do. */
export const GROUPS: Record<string, { name: string; ids: string[] }> = {
  fish: { name: 'Any fish', ids: ['glenPerch', 'silverTrout', 'mudcat', 'goldenCarp', 'mackerel', 'seaBream', 'rainbowWrasse', 'moonfish', 'stormjaw', 'bluefin', 'marlin', 'lanternjaw', 'ghostRay'] },
};

export const STATION_NAMES: Record<StationKind, string> = {
  forge: 'Forge and anvil',
  workbench: 'Workbench',
  alchemy: 'Alchemy table',
  kitchen: 'Cooking fire',
  runestone: 'Runestone',
  loom: 'Loom and tanning rack',
};

const r = (id: string, station: StationKind, calling: CallingId | undefined, level: number, inputs: [string, number][], learn: Recipe['learn'], o: Partial<Recipe> = {}): Recipe => ({
  id, out: id, station, calling, level, inputs: inputs.map(([i, n]) => ({ id: i, n })), learn,
  quality: o.quality ?? true, step: o.step ?? 'none', ...o,
});
const forge = (id: string, level: number, inputs: [string, number][], learn: Recipe['learn'] = 'basic', o: Partial<Recipe> = {}) => r(id, 'forge', 'smithing', level, inputs, learn, { step: 'hammer', ...o });
const bench = (id: string, level: number, inputs: [string, number][], learn: Recipe['learn'] = 'basic', o: Partial<Recipe> = {}) => r(id, 'workbench', 'smithing', level, inputs, learn, { step: 'hammer', ...o });
const brew = (id: string, level: number, inputs: [string, number][], learn: Recipe['learn'] = 'node', o: Partial<Recipe> = {}) => r(id, 'alchemy', 'herbalism', level, inputs, learn, { step: 'stir', ...o });
const cook = (id: string, level: number, inputs: [string, number][], learn: Recipe['learn'] = 'node', o: Partial<Recipe> = {}) => r(id, 'kitchen', 'cooking', level, inputs, learn, { step: 'heat', ...o });
const rune = (id: string, level: number, inputs: [string, number][], learn: Recipe['learn'] = 'node') => r(id, 'runestone', 'runecraft', level, inputs, learn, { quality: false, step: 'none' });
const sew = (id: string, level: number, inputs: [string, number][], learn: Recipe['learn'] = 'basic') => r(id, 'loom', 'tailoring', level, inputs, learn, { step: 'none' });
const refine = (id: string, station: StationKind, calling: CallingId | undefined, level: number, inputs: [string, number][], n = 1) => r(id, station, calling, level, inputs, 'basic', { quality: false, n });

export const RECIPES: Recipe[] = [
  // ---- the forge: smelting ----
  refine('ironIngot', 'forge', 'smithing', 1, [['ironOre', 2]]),
  refine('copperIngot', 'forge', 'smithing', 1, [['copperOre', 2]]),
  refine('steelIngot', 'forge', 'smithing', 5, [['ironIngot', 2], ['coal', 1]]),
  { ...refine('silversteelIngot', 'forge', 'smithing', 10, [['steelIngot', 2], ['silverOre', 1], ['coal', 1]]), learn: 'book:bookSmithing' },
  // ---- the forge: iron (tier 1) ----
  forge('shortsword', 1, [['ironIngot', 2], ['leather', 1]]),
  forge('ironDagger', 1, [['ironIngot', 1], ['leather', 1]]),
  forge('ironSpear', 2, [['ironIngot', 1], ['planks', 2]]),
  forge('handAxe', 2, [['ironIngot', 2], ['planks', 1]]),
  forge('longsword', 3, [['ironIngot', 3], ['leather', 1]]),
  forge('flangedMace', 3, [['ironIngot', 3], ['planks', 1]]),
  forge('ironGreatsword', 4, [['ironIngot', 4], ['leather', 1]]),
  forge('ironHelm', 2, [['ironIngot', 2], ['leather', 1]]),
  forge('gauntlets', 3, [['ironIngot', 2], ['leather', 1]]),
  forge('sabatons', 3, [['ironIngot', 2], ['leather', 1]]),
  forge('greaves', 4, [['ironIngot', 3], ['leather', 1]]),
  // ---- the forge: steel (tier 2), from the Weapons and Armour branches ----
  forge('rondelDagger', 5, [['steelIngot', 1], ['leather', 1]], 'node', { node: 'Forge Blade' }),
  forge('knightSword', 6, [['steelIngot', 3], ['leather', 1]], 'node', { node: 'Forge Blade' }),
  forge('steelPartisan', 6, [['steelIngot', 2], ['ashWood', 2]], 'node', { node: 'Forge Blade' }),
  forge('beardedAxe', 6, [['steelIngot', 2], ['ashWood', 1]], 'node', { node: 'Forge Blade' }),
  forge('morningStar', 7, [['steelIngot', 3], ['ashWood', 1]], 'node', { node: 'Forge Blade' }),
  forge('steelZweihander', 8, [['steelIngot', 4], ['leather', 1]], 'node', { node: 'Forge Blade' }),
  forge('steelGreataxe', 8, [['steelIngot', 3], ['ashWood', 2]], 'node', { node: 'Forge Blade' }),
  forge('warhammer', 8, [['steelIngot', 4], ['ashWood', 2]], 'node', { node: 'Forge Blade' }),
  forge('pauldrons', 6, [['steelIngot', 2], ['leather', 1]], 'node', { node: 'Forge Plate' }),
  forge('breastplate', 8, [['steelIngot', 4], ['leather', 2]], 'node', { node: 'Forge Plate' }),
  // ---- the forge: silversteel (tier 3), from the Smith's Daybook ----
  forge('silversteelStiletto', 10, [['silversteelIngot', 1], ['drakeLeather', 1]], 'book:bookSmithing'),
  forge('silversteelGlaive', 11, [['silversteelIngot', 2], ['yewWood', 2]], 'book:bookSmithing'),
  forge('silversteelBattleaxe', 12, [['silversteelIngot', 3], ['yewWood', 1]], 'book:bookSmithing'),
  forge('silversteelFlamberge', 13, [['silversteelIngot', 4], ['drakeLeather', 1]], 'book:bookSmithing'),
  forge('silversteelMaul', 13, [['silversteelIngot', 4], ['yewWood', 2]], 'book:bookSmithing'),
  // ---- the workbench: bows, crossbows, staves, shields, ammunition ----
  bench('oakQuarterstaff', 1, [['planks', 2]]),
  bench('huntingBow', 1, [['planks', 2], ['flax', 1]]),
  bench('roundShield', 2, [['planks', 3], ['ironIngot', 1]]),
  bench('lightCrossbow', 3, [['planks', 2], ['ironIngot', 1], ['flax', 1]]),
  bench('ashLongbow', 5, [['ashWood', 3], ['linen', 1]]),
  bench('ashStaff', 5, [['ashWood', 2], ['copperIngot', 1]]),
  bench('kiteShield', 6, [['planks', 2], ['steelIngot', 2], ['leather', 1]], 'node', { node: 'Forge Plate' }),
  bench('steelArbalest', 8, [['ashWood', 2], ['steelIngot', 2], ['linen', 1]], 'node', { node: 'Forge Blade' }),
  bench('yewWarbow', 10, [['yewWood', 3], ['linen', 1], ['leather', 1]], 'book:bookSmithing'),
  bench('yewStaff', 10, [['yewWood', 2], ['silverOre', 1]], 'book:bookSmithing'),
  bench('arrowIron', 1, [['planks', 1], ['ironIngot', 1]], 'basic', { n: 10, quality: false, step: 'none' }),
  bench('boltIron', 3, [['planks', 1], ['ironIngot', 1]], 'basic', { n: 8, quality: false, step: 'none' }),
  bench('arrowBroadhead', 5, [['planks', 1], ['steelIngot', 1]], 'basic', { n: 10, quality: false, step: 'none' }),
  bench('arrowFire', 4, [['arrowIron', 10], ['emberroot', 1]], 'discover', { n: 10, quality: false, step: 'none' }),
  bench('arrowFrost', 4, [['arrowIron', 10], ['silverthistle', 1]], 'discover', { n: 10, quality: false, step: 'none' }),
  // ---- the alchemy table (Herbalism) ----
  brew('healthPotion', 1, [['sungrass', 2], ['riverReed', 1]], 'basic'),
  brew('manaPotion', 1, [['moongrass', 2], ['riverReed', 1]], 'basic'),
  brew('herbalTonic', 1, [['sungrass', 2], ['wildmint', 1]], 'basic'),
  brew('manaTonic', 1, [['moongrass', 2]], 'basic'),
  brew('hearthrootDraught', 3, [['sungrass', 2], ['ironleaf', 1], ['honeycomb', 1]]),
  brew('nightshadeOil', 3, [['redcap', 2], ['duskbloom', 1]]),
  brew('ironbarkTonic', 3, [['ironleaf', 3], ['riverReed', 1]]),
  brew('emberBomb', 4, [['emberroot', 2], ['coal', 1]], 'discover'),
  brew('renewalTea', 6, [['wildmint', 2], ['brambleBerries', 2], ['sungrass', 1]]),
  brew('swiftrootElixir', 6, [['wildGarlic', 2], ['silverthistle', 1], ['wildmint', 1]]),
  brew('greaterHealthPotion', 8, [['sungrass', 3], ['honeycomb', 1], ['ironleaf', 1]], 'book:bookAlchemy'),
  brew('greaterManaPotion', 8, [['moongrass', 3], ['silverthistle', 1]], 'book:bookAlchemy'),
  brew('lifebloomTonic', 12, [['duskbloom', 1], ['sungrass', 3], ['honeycomb', 1]]),
  brew('stormleafElixir', 12, [['silverthistle', 2], ['emberroot', 1], ['duskbloom', 1]]),
  // ---- the cooking fire (Cooking) ----
  cook('grilledFish', 1, [['fish', 1]], 'basic'),
  cook('sailorsRation', 2, [['fish', 1], ['wheat', 1]], 'basic'),
  cook('trailRation', 2, [['wheat', 1], ['apple', 1], ['milk', 1]]),
  cook('heartyStew', 3, [['rawMeat', 1], ['carrot', 1], ['cabbage', 1]]),
  cook('warmStew', 5, [['rawMeat', 1], ['carrot', 1], ['emberroot', 1]], 'book:bookCooking'),
  cook('battleBread', 6, [['wheat', 2], ['wildGarlic', 1]]),
  cook('huntersFeast', 6, [['rawMeat', 2], ['pumpkin', 1], ['brambleBerries', 1]]),
  cook('ironRation', 12, [['rawMeat', 2], ['wheat', 1], ['honeycomb', 1]]),
  // ---- the runestone (Runecraft) ----
  rune('runeEmber', 1, [['copperIngot', 1], ['emberroot', 1]], 'basic'),
  rune('runeRime', 1, [['copperIngot', 1], ['silverthistle', 1]], 'basic'),
  rune('runeAnvil', 3, [['copperIngot', 1], ['ironIngot', 1]]),
  rune('runeWarding', 3, [['copperIngot', 1], ['leather', 1], ['ironleaf', 1]]),
  rune('runeSwift', 6, [['copperIngot', 2], ['wildmint', 1], ['silverOre', 1]]),
  rune('runeReturning', 10, [['copperIngot', 2], ['yewWood', 1]], 'book:bookRunes'),
  // ---- the loom and tanning rack: anyone can tan and weave ----
  refine('leather', 'loom', undefined, 0, [['rawHide', 1]]),
  refine('woolCloth', 'loom', undefined, 0, [['wool', 2]]),
  refine('linen', 'loom', undefined, 0, [['flax', 2]]),
  refine('hardenedLeather', 'loom', 'tailoring', 3, [['leather', 2], ['honeycomb', 1]]),
  refine('drakeLeather', 'loom', 'tailoring', 8, [['drakeHide', 1]]),
  // ---- the loom (Tailoring) ----
  sew('leatherBracers', 1, [['leather', 2]]),
  sew('leatherBoots', 1, [['leather', 2]]),
  sew('leatherJerkin', 1, [['leather', 3], ['woolCloth', 1]]),
  sew('foragersSatchel', 3, [['leather', 2], ['woolCloth', 1]]),
  sew('travellersCloak', 3, [['woolCloth', 3]]),
  sew('linenGambeson', 5, [['linen', 4]]),
  sew('brigandine', 8, [['hardenedLeather', 3], ['steelIngot', 2]]),
  sew('silkMantle', 10, [['silk', 3], ['linen', 1]]),
  sew('drakeleatherJerkin', 12, [['drakeLeather', 3], ['linen', 1]]),
];

export const RECIPE: Record<string, Recipe> = Object.fromEntries(RECIPES.map((x) => [x.id, x]));

/** Recipes taught by reading a book. */
export const BOOK_RECIPES = (book: string) => RECIPES.filter((x) => x.learn === `book:${book}`);

/** Which recipe made this item (for salvage). */
export const MADE_BY: Record<string, Recipe> = Object.fromEntries(RECIPES.map((x) => [x.out, x]));

/** The rune item that carries each rune (quality.ts's RUNES ids). */
export const RUNE_ITEMS: Record<string, string> = {
  runeEmber: 'fire', runeRime: 'frost', runeAnvil: 'poise', runeSwift: 'swift', runeWarding: 'warding', runeReturning: 'returning',
};
