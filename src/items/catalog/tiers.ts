import type { Metal, Wood } from '../weapons/models';

// The eight material tiers (the item plan, §1). Each sets an item's level
// range, its look, its materials and the region that sells, makes or drops it.
// Tiers 7 and 8 are never sold: they are made from looted star-metal and
// dusk-iron, from recipes found in books.

export interface Tier {
  n: number;
  /** the metal's name as it goes in front of an item ("Deepsteel Glaive") */
  metal: string;
  metalKey: Metal;
  wood: string;
  woodKey: Wood;
  leather: string;
  cloth: string;
  /** the level range the tier belongs to */
  lvl: [number, number];
  /** the region ids whose shops sell it and whose foes drop it */
  regions: string[];
  /** model colours: metal, trim, leather, cloth, glow */
  col: { metal: number; trim: number; leather: number; cloth: number; robe: number; glow?: number; glowStrength?: number; shine: number };
  /** crafting: the ingot, timber, leather and cloth item ids */
  ingot: string;
  timber: string;
  hide: string;
  fabric: string;
  /** the recipe book that teaches the tier's recipes (tiers 4-8), or 'basic' */
  book: string | null;
  /** the crafting level the tier's recipes start at */
  craft: number;
  /** how many times stronger than iron */
  mult: number;
  /** where it's found, in a line (descriptions and the tests) */
  where: string;
  /** helms by weight: the region's shapes */
  helms: { robe: import('../armorModels').HelmShape; leather: import('../armorModels').HelmShape; mail: import('../armorModels').HelmShape; plate: import('../armorModels').HelmShape };
}

export const TIERS: Tier[] = [
  {
    n: 1, metal: 'Iron', metalKey: 'iron', wood: 'Oak', woodKey: 'oak', leather: 'Leather', cloth: 'Wool', lvl: [1, 5], regions: ['elderGlen', 'cresha', 'southernMarches'],
    col: { metal: 0x8a8682, trim: 0x4a4744, leather: 0x7a4a2a, cloth: 0x9a8a72, robe: 0x8a7a62, shine: 0.35 },
    ingot: 'ironIngot', timber: 'planks', hide: 'leather', fabric: 'woolCloth', book: null, craft: 1, mult: 1,
    where: 'Elder Glen: Fröst sells it, and the quarry goblins carry it', helms: { robe: 'hood', leather: 'cap', mail: 'coif', plate: 'kettle' },
  },
  {
    n: 2, metal: 'Steel', metalKey: 'steel', wood: 'Ash', woodKey: 'ash', leather: 'Hardened Leather', cloth: 'Linen', lvl: [5, 10], regions: ['portAurelle', 'cresha', 'southernMarches', 'wildlands'],
    col: { metal: 0xd0d4da, trim: 0x2a3a5a, leather: 0x5a3a22, cloth: 0x2a5a9a, robe: 0xe0d8c0, shine: 0.75 },
    ingot: 'steelIngot', timber: 'ashWood', hide: 'hardenedLeather', fabric: 'linen', book: null, craft: 5, mult: 1.3,
    where: 'the King\'s Road and Port Aurelle: Ragna and the Academy armoury sell it; road bandits carry it', helms: { robe: 'hood', leather: 'cap', mail: 'coif', plate: 'kettle' },
  },
  {
    n: 3, metal: 'Silversteel', metalKey: 'silversteel', wood: 'Yew', woodKey: 'yew', leather: 'Drake Leather', cloth: 'Silk', lvl: [10, 15], regions: ['royalCapital', 'wildlands', 'verdantElves', 'valoria'],
    col: { metal: 0xdfe6f4, trim: 0xc8a040, leather: 0x4a5a32, cloth: 0xa02a3a, robe: 0xa02a4a, glow: 0x6f8fc8, glowStrength: 0.12, shine: 0.85 },
    ingot: 'silversteelIngot', timber: 'yewWood', hide: 'drakeLeather', fabric: 'silk', book: null, craft: 10, mult: 1.6,
    where: 'the Royal Capital and the Crown Road: the high market sells it; Crown Road knights carry it', helms: { robe: 'hood', leather: 'cap', mail: 'coif', plate: 'crested' },
  },
  {
    n: 4, metal: 'Deepsteel', metalKey: 'deepsteel', wood: 'Ironwood', woodKey: 'ironwood', leather: 'Deephide', cloth: 'Deepwool', lvl: [15, 20], regions: ['whiteMountains', 'deepMountains', 'frostedPeaks'],
    col: { metal: 0x46526a, trim: 0xd0a040, leather: 0x3a3a44, cloth: 0x4a5a6a, robe: 0x3a4a5a, glow: 0x2a4aa8, glowStrength: 0.1, shine: 0.6 },
    ingot: 'deepsteelIngot', timber: 'ironwood', hide: 'deephide', fabric: 'deepwool', book: 'bookDwarvenForge', craft: 15, mult: 1.95,
    where: 'the dwarven holds: Bruni\'s expedition sells it; the Hollow Ridge depths and the old mine drop it', helms: { robe: 'hood', leather: 'cap', mail: 'coif', plate: 'visor' },
  },
  {
    n: 5, metal: 'Sunbrass', metalKey: 'sunbrass', wood: 'Sunpalm', woodKey: 'sunpalm', leather: 'Sandwyrm Leather', cloth: 'Sun-Silk', lvl: [20, 25], regions: ['goldenExpanse'],
    col: { metal: 0xd8a84a, trim: 0x2aa8a0, leather: 0xb08850, cloth: 0xe8d8a8, robe: 0xe8d0a0, glow: 0xa0661a, glowStrength: 0.08, shine: 0.8 },
    ingot: 'sunbrassIngot', timber: 'sunpalm', hide: 'sandwyrmLeather', fabric: 'sunSilk', book: 'bookSunbrass', craft: 20, mult: 2.3,
    where: 'the Golden Expanse: the Sunspire bazaar and the scrap towns sell it; raider camps drop it', helms: { robe: 'turban', leather: 'turban', mail: 'coif', plate: 'crested' },
  },
  {
    n: 6, metal: 'Tideglass', metalKey: 'tideglass', wood: 'Driftwood', woodKey: 'driftwood', leather: 'Sharkskin', cloth: 'Sea-Silk', lvl: [25, 30], regions: ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles', 'ocean'],
    col: { metal: 0x5ac8c0, trim: 0xf0eee0, leather: 0x6a7480, cloth: 0x1a7a8a, robe: 0x2a8a9a, glow: 0x2aa8a0, glowStrength: 0.22, shine: 0.95 },
    ingot: 'tideglassIngot', timber: 'driftwood', hide: 'sharkskin', fabric: 'seaSilk', book: 'bookTideglass', craft: 25, mult: 2.65,
    where: 'the five isles and the open sea: island smiths sell it; wrecks and sea beasts give it up', helms: { robe: 'sou', leather: 'sou', mail: 'coif', plate: 'visor' },
  },
  {
    n: 7, metal: 'Starmetal', metalKey: 'starmetal', wood: 'Starwood', woodKey: 'starwood', leather: 'Starhide', cloth: 'Moonweave', lvl: [30, 35], regions: [],
    col: { metal: 0x34343f, trim: 0xc8d4ff, leather: 0x2a2a38, cloth: 0x1a1a3a, robe: 0x22224a, glow: 0x9ab8ff, glowStrength: 0.35, shine: 0.7 },
    ingot: 'starmetalIngot', timber: 'starwood', hide: 'starhide', fabric: 'moonweave', book: 'bookStarfall', craft: 30, mult: 3.0,
    where: 'made only: star-metal from fallen-star sites, worked from the Starfall Script', helms: { robe: 'hood', leather: 'cap', mail: 'coif', plate: 'great' },
  },
  {
    n: 8, metal: 'Duskiron', metalKey: 'duskiron', wood: 'Gloamwood', woodKey: 'gloamwood', leather: 'Gloamhide', cloth: 'Gloamweave', lvl: [35, 60], regions: [],
    col: { metal: 0x1e1b24, trim: 0x7a3aff, leather: 0x1a141e, cloth: 0x2a1a3a, robe: 0x1e1428, glow: 0x7a3aff, glowStrength: 0.45, shine: 0.25 },
    ingot: 'duskironIngot', timber: 'gloamwood', hide: 'gloamhide', fabric: 'gloamweave', book: 'bookIronBelow', craft: 35, mult: 3.4,
    where: 'made only: dusk-iron from the Dark scars and rifts, worked from the Codex of the Iron Below', helms: { robe: 'hood', leather: 'mask', mail: 'coif', plate: 'mask' },
  },
];

/** The tier a region's shops sell and its foes carry (0: none). */
export function tierOfRegion(region: string | undefined): number {
  if (!region) return 1;
  for (const t of TIERS) if (t.regions.includes(region)) return t.n;
  if (region === 'demonContinent') return 6;
  return 2;
}

/** The tier for a foe's level (drops in the wilds follow the level, not just the map). */
export function tierOfLevel(level: number): number {
  let n = 1;
  for (const t of TIERS) if (level >= t.lvl[0]) n = t.n;
  return n;
}

/** A tier's price multiplier against iron. */
export const tierPrice = (n: number) => Math.round(Math.pow(2.05, n - 1) * 100) / 100;
