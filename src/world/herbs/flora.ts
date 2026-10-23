import { heightAt, riverX, roadDist, streetDist, TOWN_R, PORT_AURELLE, WORLD_SIZE, QUARRY_PIT } from '../terrainHeight';
import { reliefAt, regionAt, sandWeight, RELIEF, SEA_LEVEL } from '../worldMap';
import { fbm, smoothstep } from '../../core/math';
import { crownSitePoint, roadPoint } from '../roadData';

// What grows where (herbalism content): every gatherable plant's habits —
// regrowth, yield, night-only flowers, rarity, thorns — and the habitat
// model that decides, from the world map, which plants a spot can grow.
// Habitats come from relief, height, the river, sand, the coast and the
// same forest density the tree scatter uses (stylizedNature), so a plant
// table here reads like a field guide: oakmoss under trees, kelp on the
// beach, frostbloom above the snowline, moonpetal in the elven glades.

export interface HerbDef {
  item: string;
  /** game hours to regrow after picking */
  regrow: number;
  /** yield range */
  n: [number, number];
  /** only shows (and can be gathered) between dusk and dawn */
  night?: boolean;
  /** emissive strength of its world mesh (night flowers, glowing moss) */
  glow?: number;
  /** the glow brightens with darkness (glowmoss shows by day but shines at night) */
  nightGlow?: boolean;
  /** rare: base chance (0..1) that a scattered node of it is really there; Herbalism's rareChance adds to it */
  rare?: number;
  /** health lost gathering it bare-handed (Thornproof Gloves prevent it) */
  thorny?: number;
  /** a rarer plant sometimes found while gathering this one: [item, base chance] */
  find?: [string, number];
  /** nodes per patch */
  cluster?: [number, number];
  /** lifted off the ground (a comb up a hollow tree) */
  lift?: number;
  /** scale of the world model over its icon model */
  scale?: number;
}

export const FORAGE: Record<string, HerbDef> = {
  // ---- the original finds ----
  sungrass: { item: 'sungrass', regrow: 6, n: [1, 2], cluster: [1, 3] },
  moongrass: { item: 'moongrass', regrow: 10, n: [1, 1], cluster: [1, 3], find: ['glowmoss', 0.06] },
  wildmint: { item: 'wildmint', regrow: 6, n: [1, 2], cluster: [1, 3], find: ['chamomile', 0.08] },
  ironleaf: { item: 'ironleaf', regrow: 10, n: [1, 1], cluster: [1, 2], find: ['stoneroot', 0.06] },
  redcap: { item: 'redcap', regrow: 12, n: [1, 3], cluster: [1, 3], find: ['bloodcap', 0.05] },
  brambleBerries: { item: 'brambleBerries', regrow: 18, n: [2, 4], cluster: [1, 2], thorny: 2 },
  silverthistle: { item: 'silverthistle', regrow: 14, n: [1, 1], cluster: [1, 2], thorny: 2, find: ['eaglefern', 0.04] },
  duskbloom: { item: 'duskbloom', regrow: 24, n: [1, 1], night: true, glow: 0.35, cluster: [1, 1], find: ['moonpetal', 0.03] },
  riverReed: { item: 'riverReed', regrow: 8, n: [2, 3], cluster: [2, 4], find: ['marshmallow', 0.1] },
  honeycomb: { item: 'honeycomb', regrow: 30, n: [1, 1], cluster: [1, 1], lift: 1.4 },
  wildGarlic: { item: 'wildGarlic', regrow: 10, n: [1, 3], cluster: [1, 3] },
  emberroot: { item: 'emberroot', regrow: 16, n: [1, 1], cluster: [1, 2], find: ['dragonbloom', 0.012] },
  // ---- tier 1 ----
  marigold: { item: 'marigold', regrow: 8, n: [1, 3], cluster: [2, 4] },
  yarrow: { item: 'yarrow', regrow: 8, n: [1, 2], cluster: [1, 3] },
  chamomile: { item: 'chamomile', regrow: 8, n: [2, 3], cluster: [2, 4] },
  nettle: { item: 'nettle', regrow: 6, n: [2, 3], cluster: [2, 4], thorny: 3 },
  oakmoss: { item: 'oakmoss', regrow: 14, n: [1, 2], cluster: [1, 3], find: ['bloodcap', 0.04] },
  marshmallow: { item: 'marshmallow', regrow: 12, n: [1, 2], cluster: [1, 3] },
  sailorsKelp: { item: 'sailorsKelp', regrow: 6, n: [2, 3], cluster: [2, 4], find: ['saltwort', 0.12] },
  // ---- tier 2 ----
  foxglove: { item: 'foxglove', regrow: 16, n: [1, 2], cluster: [1, 2], thorny: 4 },
  bloodcap: { item: 'bloodcap', regrow: 20, n: [1, 2], cluster: [1, 3] },
  ghostcap: { item: 'ghostcap', regrow: 18, n: [1, 2], night: true, glow: 0.55, cluster: [2, 4] },
  bogbean: { item: 'bogbean', regrow: 14, n: [1, 2], cluster: [1, 3], find: ['blackLotus', 0.008] },
  glowmoss: { item: 'glowmoss', regrow: 14, n: [1, 2], glow: 0.7, nightGlow: true, cluster: [2, 3] },
  stoneroot: { item: 'stoneroot', regrow: 18, n: [1, 1], cluster: [1, 2] },
  saltwort: { item: 'saltwort', regrow: 12, n: [1, 2], cluster: [1, 3] },
  sandSage: { item: 'sandSage', regrow: 14, n: [1, 2], cluster: [1, 3], find: ['desertRose', 0.06] },
  // ---- tier 3 ----
  wolfsbane: { item: 'wolfsbane', regrow: 24, n: [1, 1], cluster: [1, 2], thorny: 6, rare: 0.7 },
  frostbloom: { item: 'frostbloom', regrow: 28, n: [1, 1], glow: 0.25, cluster: [1, 3], rare: 0.75, find: ['starmoss', 0.015] },
  eaglefern: { item: 'eaglefern', regrow: 24, n: [1, 2], cluster: [1, 2], rare: 0.75, scale: 2 },
  desertRose: { item: 'desertRose', regrow: 30, n: [1, 1], cluster: [1, 1], rare: 0.6 },
  // ---- tier 4 ----
  ghostCactus: { item: 'ghostCactus', regrow: 36, n: [1, 1], night: true, glow: 0.6, cluster: [1, 2], rare: 0.45, thorny: 5 },
  moonpetal: { item: 'moonpetal', regrow: 48, n: [1, 1], night: true, glow: 0.8, cluster: [1, 2], rare: 0.35 },
  // ---- tier 5 ----
  dragonbloom: { item: 'dragonbloom', regrow: 96, n: [1, 1], glow: 0.6, cluster: [1, 1], rare: 0.22 },
  blackLotus: { item: 'blackLotus', regrow: 120, n: [1, 1], glow: 0.3, cluster: [1, 1], rare: 0.12, thorny: 10 },
  starmoss: { item: 'starmoss', regrow: 96, n: [1, 1], night: true, glow: 1.0, cluster: [1, 1], rare: 0.25 },
};
export type HerbId = keyof typeof FORAGE;

/** Is it dark enough for the night flowers? */
export const isNightHour = (h: number) => h >= 20 || h < 5;
/** 0 by day .. 1 in the dead of night (dusk and dawn ramp over an hour and a half). */
export const nightFactor = (h: number) => (h >= 12 ? smoothstep(18.5, 20.5, h) : 1 - smoothstep(4.5, 6, h));

// ---- habitats ------------------------------------------------------------------------------

export type Habitat = 'verge' | 'meadow' | 'roadside' | 'woodEdge' | 'forest' | 'deepForest' | 'glade' | 'river' | 'lakeshore'
  | 'marsh' | 'coast' | 'hills' | 'mountain' | 'snow' | 'desert' | 'volcanic';

type Table = [HerbId, number][];
/** What grows in each habitat, by weight. */
const TABLES: Record<Habitat, Table> = {
  // Elder Glen's fields and the farm belt: the herbalist's kitchen garden.
  verge: [['sungrass', 12], ['wildmint', 9], ['marigold', 14], ['chamomile', 10], ['yarrow', 5], ['brambleBerries', 6], ['wildGarlic', 4], ['silverthistle', 2], ['duskbloom', 3], ['moongrass', 2], ['ironleaf', 3]],
  meadow: [['sungrass', 12], ['wildmint', 9], ['marigold', 8], ['chamomile', 10], ['yarrow', 4], ['brambleBerries', 5], ['wildGarlic', 4], ['silverthistle', 3], ['duskbloom', 3], ['ironleaf', 2]],
  roadside: [['yarrow', 12], ['sungrass', 6], ['marigold', 4], ['chamomile', 4], ['wildmint', 3], ['nettle', 2], ['brambleBerries', 2]],
  woodEdge: [['nettle', 10], ['brambleBerries', 8], ['foxglove', 4], ['wildGarlic', 5], ['wolfsbane', 2], ['redcap', 3], ['honeycomb', 2], ['ironleaf', 2], ['yarrow', 2]],
  forest: [['oakmoss', 12], ['redcap', 8], ['foxglove', 7], ['honeycomb', 4], ['wildGarlic', 4], ['ironleaf', 3], ['duskbloom', 3], ['ghostcap', 7], ['bloodcap', 2], ['wolfsbane', 1]],
  deepForest: [['oakmoss', 10], ['bloodcap', 9], ['ghostcap', 8], ['foxglove', 5], ['redcap', 5], ['honeycomb', 3], ['wolfsbane', 2]],
  // Clearings of the elven woods, where moonpetal opens.
  glade: [['chamomile', 6], ['sungrass', 4], ['moongrass', 5], ['duskbloom', 4], ['moonpetal', 3], ['glowmoss', 2], ['eaglefern', 1]],
  river: [['riverReed', 10], ['moongrass', 9], ['marshmallow', 9], ['glowmoss', 7]],
  lakeshore: [['marshmallow', 8], ['riverReed', 8], ['glowmoss', 5], ['moongrass', 5], ['bogbean', 3]],
  marsh: [['bogbean', 10], ['riverReed', 7], ['marshmallow', 6], ['glowmoss', 6], ['moongrass', 4], ['blackLotus', 1]],
  coast: [['sailorsKelp', 10], ['saltwort', 9], ['yarrow', 1]],
  hills: [['stoneroot', 8], ['emberroot', 6], ['silverthistle', 6], ['ironleaf', 5], ['wolfsbane', 3], ['eaglefern', 2], ['sungrass', 3]],
  mountain: [['stoneroot', 7], ['eaglefern', 7], ['wolfsbane', 4], ['silverthistle', 4], ['emberroot', 4], ['frostbloom', 3], ['dragonbloom', 1]],
  snow: [['frostbloom', 10], ['eaglefern', 3], ['starmoss', 2], ['dragonbloom', 1]],
  desert: [['sandSage', 10], ['desertRose', 4], ['ghostCactus', 4], ['emberroot', 1]],
  volcanic: [['emberroot', 8], ['stoneroot', 4], ['dragonbloom', 2]],
};

/** Tree density as the tree scatter computes it (stylizedNature.density), 0..~0.8. */
export function forestDensity(x: number, z: number, h = heightAt(x, z)) {
  const H = WORLD_SIZE / 2;
  if (Math.abs(x) < H - 20 && Math.abs(z) < H - 20) {
    // Elder Glen's authored groves.
    const grove = fbm(x * 0.011 + 8, z * 0.011 - 4, 4);
    const riverBank = smoothstep(26, 13, Math.abs(x - riverX(z)));
    const westForest = smoothstep(-70, -190, x);
    const northPines = smoothstep(-120, -265, z);
    const fieldGap = smoothstep(0.62, 0.78, grove);
    return Math.max(westForest * (0.32 + grove * 0.8), fieldGap * 0.42, riverBank * 0.16, northPines * 0.28) * 0.75;
  }
  const grove = fbm(x * 0.009 + 3.1, z * 0.009 - 7.3, 3);
  switch (reliefAt(x, z)) {
    case RELIEF.forest: return 0.5 + grove * 0.3;
    case RELIEF.open: return smoothstep(0.5, 0.74, grove) * 0.52 + 0.02;
    case RELIEF.marsh: return 0.12 + grove * 0.15;
    case RELIEF.shore: return smoothstep(0.55, 0.8, grove) * 0.3 + 0.01;
    case RELIEF.mountain: return h < 320 ? 0.16 + grove * 0.2 : h < 420 ? 0.05 : 0;
    default: return 0;
  }
}

/** Places nothing grows: towns, streets, the port, the capital, Ghagrabba, the road villages. */
const KEEP_OUT: [number, number, number][] = [
  [PORT_AURELLE.x, PORT_AURELLE.y, 180],
  [-3446, -1060, 330], // the Royal Capital
  [640, 70, 45], [668, 184, 30], [1385, 92, 55], [1072, 46, 30], // Millbrook, the chapel, the Wayfarer's Rest, the Lantern Camp
];
/** The Crown Road's villages and camps (metres along the road, so they follow the road data). */
const CROWN_KEEP_OUT: [number, number, number][] = ([['outpost', 34], ['thornfield', 95], ['kingsmile', 70], ['cottage', 22], ['gateMarket', 60], ['orcCamp', 45]] as const).map(([k, r]) => {
  const [x, z] = crownSitePoint(k);
  return [x, z, r];
});
// Wenna Thistledown's herb camp (herbFolk.ts) by the Crown Road.
CROWN_KEEP_OUT.push([...roadPoint('capital', 420, -20), 14]);

export function keptOut(x: number, z: number) {
  if (Math.hypot(x, z) < TOWN_R + 10) return true;
  for (const [cx, cz, r] of KEEP_OUT) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
  for (const [cx, cz, r] of CROWN_KEEP_OUT) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
  if (Math.abs(x + 5830) < 460 && Math.abs(z - 700) < 420) return true; // Ghagrabba's walls
  return false;
}

/** The habitat at a point, or null where nothing grows (water, roads, towns). */
export function habitatAt(x: number, z: number): Habitat | null {
  const h = heightAt(x, z);
  if (h < SEA_LEVEL + 0.8) return null;
  if (keptOut(x, z)) return null;
  const rd = roadDist(x, z);
  if (rd < 4 || streetDist(x, z) < 5) return null;
  const dr = Math.abs(x - riverX(z));
  if (Math.abs(z) < 440) {
    if (dr < 5.5) return null; // in the river
    if (dr < 16) return 'river';
  }
  const rel = reliefAt(x, z);
  if (rel === RELIEF.deep || rel === RELIEF.shelf) return null;
  if (rel === RELIEF.lava || rel === RELIEF.volcanic) return 'volcanic';
  if (rel === RELIEF.sand || rel === RELIEF.mesa || sandWeight(x, z) > 0.55) return 'desert';
  if (rel === RELIEF.beach) return 'coast';
  if (rel === RELIEF.marsh) return 'marsh';
  if (rel === RELIEF.shore) return 'lakeshore';
  if (rel === RELIEF.snow || h > 230) return 'snow';
  if (rel === RELIEF.mountain || h > 60) return h > 160 && rel !== RELIEF.forest ? 'snow' : 'mountain';
  const d = forestDensity(x, z, h);
  const region = regionAt(x, z);
  if (d > 0.5) return 'deepForest';
  if (d > 0.3) return region === 'verdantElves' && d < 0.42 ? 'glade' : 'forest';
  if (d > 0.14) return 'woodEdge';
  if (h > 16) return 'hills';
  if (rd < 12) return 'roadside';
  if (region === 'verdantElves') return 'glade';
  if (Math.hypot(x, z - 188) < 280 || (Math.abs(x) < 700 && Math.abs(z) < 700)) return 'verge';
  return 'meadow';
}

/** Choose a plant for a habitat from a roll in 0..1. */
export function pickFrom(hab: Habitat, r: number): HerbId {
  const t = TABLES[hab];
  let sum = 0;
  for (const [, w] of t) sum += w;
  let acc = r * sum;
  for (const [id, w] of t) if ((acc -= w) <= 0) return id;
  return t[t.length - 1][0];
}

// ---- hand-placed rare spots ------------------------------------------------------------------

export interface RareSpot {
  herb: HerbId;
  x: number;
  z: number;
  /** plants in the spot (scattered a few metres apart) */
  n: number;
  /** a name for the place (the forager's hints) */
  place: string;
}

const riverAt = (z: number, off: number) => riverX(z) + off;

/** A few known spots per region where the rare things reliably grow (always present, slow to regrow). */
export const RARE_SPOTS: RareSpot[] = [
  // Elder Glen and the Cresha heartland
  { herb: 'bloodcap', x: -252, z: 38, n: 3, place: 'the old oak hollow in the west woods' },
  { herb: 'ghostcap', x: -238, z: 292, n: 4, place: 'the edge of the Gravewood' },
  { herb: 'stoneroot', x: QUARRY_PIT.x + 34, z: QUARRY_PIT.z + 18, n: 2, place: 'the rim of the old quarry' },
  { herb: 'stoneroot', x: QUARRY_PIT.x - 30, z: QUARRY_PIT.z - 26, n: 2, place: 'the rim of the old quarry' },
  { herb: 'wolfsbane', x: 34, z: -352, n: 2, place: 'the crypt hill' },
  { herb: 'moonpetal', x: riverAt(-392, -20), z: -392, n: 2, place: 'the north bend of the river' },
  { herb: 'glowmoss', x: riverAt(-380, 19), z: -380, n: 3, place: 'the north bend of the river' },
  { herb: 'glowmoss', x: 318, z: -14, n: 3, place: 'the mouth of the old mine' },
  { herb: 'blackLotus', x: -1226, z: 410, n: 1, place: 'the reed marsh south of the Caravan Way' },
  { herb: 'bogbean', x: -1200, z: 380, n: 3, place: 'the reed marsh south of the Caravan Way' },
  { herb: 'eaglefern', x: 1964, z: -196, n: 2, place: 'the top of Hollow Ridge' },
  { herb: 'sailorsKelp', x: 1534, z: 228, n: 3, place: 'the beach below the King\'s Road' },
  { herb: 'saltwort', x: 1546, z: 214, n: 2, place: 'the beach below the King\'s Road' },
  { herb: 'foxglove', x: -880, z: -1880, n: 3, place: 'the Greenwood' },
  // The Verdant Woods
  { herb: 'moonpetal', x: 3256, z: -2856, n: 6, place: 'the Moonlight Glade' },
  { herb: 'glowmoss', x: 3236, z: -2832, n: 3, place: 'the Moonlight Glade' },
  { herb: 'moonpetal', x: -2700, z: -2900, n: 3, place: 'the glades outside the Elven Sanctum' },
  { herb: 'ghostcap', x: -2760, z: -2990, n: 3, place: 'the woods by the Elven Sanctum' },
  { herb: 'blackLotus', x: -2726, z: -3256, n: 1, place: 'the elven fens' },
  // The Golden Expanse
  { herb: 'desertRose', x: -4000, z: 560, n: 3, place: 'the dunes along the Caravan Way' },
  { herb: 'sandSage', x: -3600, z: 760, n: 3, place: 'the dunes along the Caravan Way' },
  { herb: 'ghostCactus', x: -4800, z: 780, n: 3, place: 'the dunes before Ghagrabba' },
  { herb: 'ghostCactus', x: -5300, z: 1150, n: 2, place: 'the dunes south of Ghagrabba' },
  { herb: 'desertRose', x: -6100, z: 200, n: 2, place: 'the dunes west of Ghagrabba' },
  // The mountains
  { herb: 'frostbloom', x: 2420, z: -5560, n: 4, place: 'the slopes below Frostpeak Citadel' },
  { herb: 'starmoss', x: 2400, z: -5700, n: 2, place: 'the heights by Frostpeak Citadel' },
  { herb: 'starmoss', x: -866, z: -5056, n: 2, place: 'the snowfields of the Deep Mountains' },
  { herb: 'frostbloom', x: -926, z: -4756, n: 3, place: 'the snowfields of the Deep Mountains' },
  { herb: 'dragonbloom', x: -326, z: -6016, n: 1, place: 'the highest crags of the Deep Mountains' },
  { herb: 'frostbloom', x: 740, z: 4603, n: 3, place: 'the Frosted Peaks above Frosthold' },
  { herb: 'starmoss', x: -2006, z: 3284, n: 2, place: 'the high Frosted Peaks' },
  // The south and the wild west
  { herb: 'blackLotus', x: 2614, z: 1244, n: 1, place: 'the Southern Marches fen' },
  { herb: 'bogbean', x: 2640, z: 1220, n: 3, place: 'the Southern Marches fen' },
  { herb: 'bloodcap', x: -8006, z: 2384, n: 3, place: 'the Deep Wilderness' },
  { herb: 'wolfsbane', x: -7406, z: 3704, n: 3, place: 'the Deep Wilderness' },
  { herb: 'blackLotus', x: -5186, z: 5804, n: 1, place: 'the drowned woods of the Deep Wilderness' },
  { herb: 'wolfsbane', x: -5366, z: -3376, n: 3, place: 'the Wildlands forest' },
  { herb: 'eaglefern', x: -6086, z: -2716, n: 2, place: 'the Wildlands crags' },
  { herb: 'blackLotus', x: -3206, z: 6344, n: 1, place: 'the marshes of Valoria' },
  { herb: 'bogbean', x: 6214, z: 2504, n: 3, place: 'the Emerald Isles' },
  // The Demon Continent
  { herb: 'dragonbloom', x: 11988, z: 518, n: 3, place: 'the volcanic slopes of the Demon Continent' },
  { herb: 'dragonbloom', x: 11794, z: -1876, n: 2, place: 'the lava fields of the Demon Continent' },
];

/** Find dry, growable ground near a hand-placed spot (the map's cells are coarse). */
export function settleSpot(x: number, z: number): [number, number] | null {
  for (let ring = 0; ring < 6; ring++) {
    const r = ring * 9;
    const steps = ring === 0 ? 1 : 8;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2 + ring;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (heightAt(px, pz) < SEA_LEVEL + 0.8) continue;
      if (Math.abs(pz) < 440 && Math.abs(px - riverX(pz)) < 5.5) continue;
      if (roadDist(px, pz) < 4 || keptOut(px, pz)) continue;
      return [px, pz];
    }
  }
  return null;
}
