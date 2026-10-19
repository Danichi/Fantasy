import { reliefAt, RELIEF } from '../worldMap';
import { heightAt, roadDist, GRAVEWOOD, CRYPT, PORT_AURELLE } from '../terrainHeight';
import { crownSitePoint, CROWN_SITES } from '../roadData';
import { fbm, smoothstep, clamp } from '../../core/math';

// The wilds' danger gradient. Elder Glen is safe; walk west along the Crown
// Road toward the Royal Capital (or east along the King's Road toward Port
// Aurelle) and the country gets steadily nastier: bigger packs, tougher
// beasts, elite variants, and new kinds of monster that never come near the
// Glen. Leaving the road makes it worse again. Everything in the wilds
// (roaming packs, their stats and loot, the bosses' summoned packs) reads one
// curve, dangerAt(x, z), so the gradient is the same everywhere.

/** Where the two roads lead (world metres). */
export const CAPITAL_AT = { x: -3300, z: -1000 };
export const PORT_AT = { x: 2760, z: 150 };
const CAP_LEN = Math.hypot(CAPITAL_AT.x, CAPITAL_AT.z);
const PORT_LEN = Math.hypot(PORT_AT.x, PORT_AT.z);
const CU = { x: CAPITAL_AT.x / CAP_LEN, z: CAPITAL_AT.z / CAP_LEN };
const PU = { x: PORT_AT.x / PORT_LEN, z: PORT_AT.z / PORT_LEN };

/** Danger by fraction of the way from the Glen to the city: [progress, danger] keys, linear between. */
const CURVE: [number, number][] = [[0, 0], [0.12, 0.04], [0.3, 0.24], [0.5, 0.5], [0.7, 0.74], [0.85, 0.92], [1, 1]];
const curve = (p: number) => {
  if (p <= 0) return 0;
  for (let i = 1; i < CURVE.length; i++) {
    const [p1, d1] = CURVE[i];
    if (p <= p1) {
      const [p0, d0] = CURVE[i - 1];
      return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
    }
  }
  return 1;
};
/** The coast road is a little gentler than the road into the heart of the kingdom. */
const PORT_SCALE = 0.86;

/** How far along each road's corridor a point lies (0 at the Glen, 1 at the city). */
export function corridorProgress(x: number, z: number) {
  return {
    crown: clamp((x * CU.x + z * CU.z) / CAP_LEN, 0, 1.1),
    kings: clamp((x * PU.x + z * PU.z) / PORT_LEN, 0, 1.1),
  };
}

/**
 * How dangerous the wilds are here, 0 (the Glen's doorstep) to 1 (the
 * marches under the capital's walls). Off the road adds up to +0.12.
 */
export function dangerAt(x: number, z: number) {
  const { crown, kings } = corridorProgress(x, z);
  let d = Math.max(curve(crown), curve(kings) * PORT_SCALE);
  d += 0.12 * smoothstep(60, 420, roadDist(x, z));
  d *= smoothstep(160, 520, Math.hypot(x, z));
  return clamp(d, 0, 1);
}

/** Danger bands: what the wilds are called as you go deeper, and what they warn you of. */
export const DANGER_BANDS = [
  { min: 0, name: 'The Glen’s Edge', note: '' },
  { min: 0.2, name: 'The Borderland', note: 'The country beyond the Glen grows wilder. Packs run larger out here.' },
  { min: 0.4, name: 'The Wildlands', note: 'You are deep in the wildlands. Beasts here have killed better-armed travellers than you.' },
  { min: 0.6, name: 'The Dark Marches', note: 'The Dark Marches: orcs hunt here, and some of the beasts are something worse than beasts.' },
  { min: 0.8, name: 'The Crown’s Shadow', note: 'Even this close to the capital, nothing in these woods fears a sword. Champions of their kind prowl here.' },
] as const;

/** Band index 0..4 for a danger value. */
export function dangerTier(d: number) {
  let t = 0;
  for (let i = 0; i < DANGER_BANDS.length; i++) if (d >= DANGER_BANDS[i].min) t = i;
  return t;
}

/**
 * Woodland 0..1: the same grove noise the stylized nature scatter uses for
 * its copses on the open plains (StylizedNature.density), so "woods" here are
 * where the trees actually stand. The painted map's forest relief counts too.
 */
export function woodAt(x: number, z: number) {
  if (reliefAt(x, z) === RELIEF.forest) return 1;
  const grove = fbm(x * 0.009 + 3.1, z * 0.009 - 7.3, 3);
  return smoothstep(0.5, 0.72, grove);
}

export type Terrain = 'fields' | 'forest' | 'hills' | 'marsh';

/** What kind of country a point is: decides which monsters roam it. */
export function terrainAt(x: number, z: number): Terrain {
  const rel = reliefAt(x, z);
  if (rel === RELIEF.marsh || rel === RELIEF.shore) return 'marsh';
  if (rel === RELIEF.mountain || rel === RELIEF.mesa || rel === RELIEF.volcanic) return 'hills';
  if (woodAt(x, z) > 0.55) return 'forest';
  const h = heightAt(x, z);
  const slope = Math.abs(heightAt(x + 4, z) - heightAt(x - 4, z)) + Math.abs(heightAt(x, z + 4) - heightAt(x, z - 4));
  if (h > 17 || slope > 2.6) return 'hills';
  return 'fields';
}

/** Is it night for the wilds (when the nastier things come out)? 0 day .. 1 deep night. */
export function nightness(hour: number) {
  if (hour >= 21 || hour < 4.5) return 1;
  if (hour >= 19 && hour < 21) return (hour - 19) / 2;
  if (hour >= 4.5 && hour < 6) return 1 - (hour - 4.5) / 1.5;
  return 0;
}

/**
 * Places nothing roams: towns, inns, camps that hold their own enemies, the
 * Gravewood (it has its own dead), and the bosses' lairs (added by the lairs
 * module). [x, z, radius]
 */
export const NO_ROAM: [number, number, number][] = [
  [0, 0, 420], // Elder Glen
  [CRYPT.x, CRYPT.y, 70],
  [GRAVEWOOD.x, GRAVEWOOD.y, 190],
  [-3440, -1060, 560], // the Royal Capital and its fields
  [PORT_AURELLE.x, PORT_AURELLE.y, 400],
  [640, 70, 160], // Millbrook
  [668, 184, 60], // the Chapel of the Dawn
  [1385, 92, 150], // the Wayfarer's Rest
  [1072, 46, 80], // the Lantern Camp
  [1952, -182, 110], // Hollow Ridge (bandits)
  [2234, 108, 80], // Gull Ridge
  [330, -21, 60], // the Old King's Road Mine
  ...(Object.keys(CROWN_SITES) as (keyof typeof CROWN_SITES)[]).map((k): [number, number, number] => {
    const [x, z] = crownSitePoint(k);
    const r = { outpost: 100, shrine: 40, thornfield: 170, wreck: 30, watchtower: 100, wolfDen: 90, kingsmile: 140, cottage: 40, orcCamp: 120, barrow: 110, gateMarket: 170 }[k];
    return [x, z, r];
  }),
];

/** Somewhere nothing roams? */
export function noRoamAt(x: number, z: number, margin = 0) {
  for (const [cx, cz, r] of NO_ROAM) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + margin) ** 2) return true;
  return false;
}

/** Inside the land the wilds cover: either road's corridor, out to ~900 m either side of it. */
export function inWilds(x: number, z: number) {
  const { crown, kings } = corridorProgress(x, z);
  if (crown < 0.06 && kings < 0.06) return false;
  if (x < -1900 && z > 250) return false; // the Golden Expanse's caravan country
  return roadDist(x, z) < 900;
}
