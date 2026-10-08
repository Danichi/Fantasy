import { regionAt } from '../worldMap';
import { roadPoint, ROAD_SPECS } from '../roadData';

// The Verdant Elves as plain data (docs/design/verdant-elves.md): where the
// villages, groves and ruins of the great northern forest stand, which of its
// four layers a point lies in, the level pads the terrain carves for
// Thornwick, Silverbough, the Sanctum, the Temple's court and Moonlight
// Glade, and where the mega-trees grow. No three.js and no rendering: the
// terrain's tile worker reads the pads, the vegetation reads the layers.

export type P2 = [number, number];

/** The Greenwood Road runs Elder Glen to the Sanctum; the elves' marker stone now stands past Thornwick. */
export const GATE_S = 2590; // metres along the Greenwood Road (200 m north of Thornwick)

export const SITES = {
  /** the woodcutters' village astride the road at the forest's edge */
  thornwick: [-1560, -2050] as P2,
  /** its millpond (a dip in the ground west of the palisade) */
  millpond: [-1612, -2002] as P2,
  /** the Hollow Grove the loggers and the elves quarrel over */
  hollowGrove: [-1220, -2060] as P2,
  /** the old charcoal pits, where bandits burn the elves' marked trees */
  pits: [-1330, -2140] as P2,
  /** the loggers' camp east of the village */
  logging: [-1410, -1990] as P2,
  /** Silverbough, the hidden village on its wooded rise (found only with a guide) */
  silverbough: [-1830, -2620] as P2,
  /** Silverbough's spring, where the spiders spin */
  spring: [-1772, -2572] as P2,
  /** the World Tree, heart of the Elven Sanctum */
  worldTree: [-2880, -3040] as P2,
  /** the moon-pool at the lake's edge below the Sanctum */
  moonPool: [-2850, -2928] as P2,
  /** the oldest grove's rotting heart, where the Blighted Elder stands */
  elderGrove: [-2470, -3330] as P2,
  /** the Temple of Starfall's door, cut into the hillside of the oldest grove */
  temple: [-2450, -3530] as P2,
  /** the Hermit of the Hollow's cave */
  hermit: [-3250, -3420] as P2,
  /** the lost hunter's camp, deep in the Lost Woods */
  lostHunter: [-2240, -2840] as P2,
  /** the spirit fox's hidden glade */
  foxGlade: [-2010, -2700] as P2,
  /** the spider brood-mother's hollow */
  spiderHollow: [-2140, -3120] as P2,
  /** Moonlight Glade: the standing stones on the lakeshore far to the east */
  glade: [3340, -2900] as P2,
};

/** Where the marker stone stands on the Greenwood Road. */
export const GATE_AT: P2 = roadPoint('forest', GATE_S);

// ---- level pads -------------------------------------------------------------------------

interface Pad { x: number; z: number; r: number; h: number; blend: number }
export const PADS: Pad[] = [
  { x: SITES.thornwick[0], z: SITES.thornwick[1], r: 72, h: 4.3, blend: 26 },
  { x: SITES.silverbough[0], z: SITES.silverbough[1], r: 40, h: 8.6, blend: 22 },
  { x: SITES.worldTree[0], z: SITES.worldTree[1], r: 112, h: 3.6, blend: 40 },
  { x: SITES.temple[0], z: SITES.temple[1] + 34, r: 30, h: 6.2, blend: 20 },
  { x: SITES.glade[0], z: SITES.glade[1], r: 38, h: 2.6, blend: 22 },
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The forest's level pads: [height, weight] where one applies (the terrain worker calls this). */
export function elvenPadHeight(x: number, z: number): [number, number] | null {
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r + p.blend) continue;
    return [p.h, smooth(p.r + p.blend, p.r, d)];
  }
  return null;
}

// ---- the four layers ------------------------------------------------------------------------

export type Layer = 'outer' | 'inner' | 'ancient' | 'deep';
export const LAYER_NAMES: Record<Layer, string> = { outer: 'The Outer Forest', inner: 'The Inner Forest', ancient: 'The Ancient Forest', deep: 'The Deep Elven Lands' };

/** Which layer of the elven woods a point lies in (null outside the region). */
export function forestLayer(x: number, z: number): Layer | null {
  if (regionAt(x, z) !== 'verdantElves') return null;
  const wt = Math.hypot(x - SITES.worldTree[0], z - SITES.worldTree[1]);
  if (wt < 650 || (x < -3350 && z < -2700)) return 'deep';
  if (z > -2200) return 'outer';
  if (z > -3000) return 'inner';
  return 'ancient';
}

// ---- mega-trees -------------------------------------------------------------------------------
// Trees as tall as towers in the Ancient Forest and around the Sanctum, laid
// out once (deterministic) so the vegetation, the colliders and the walkways
// all agree where they stand. [x, z, height, seed]

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Oldest Way: the elven path from the Sanctum to the Temple's grove (a trail in roadData.ts). */
export const OLDEST_WAY: P2[] = ROAD_SPECS.find((r) => r.id === 'oldestWay')!.pts;

function segDist(px: number, pz: number, a: P2, b: P2) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t);
}
export function polyDist(px: number, pz: number, line: P2[]) {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDist(px, pz, line[i], line[i + 1]));
  return d;
}

/** The Sentinel Walk: walkway trees (fixed so the bridges between them are authored). */
export const WALK_TREES: [number, number, number, number][] = [
  [-2660, -3170, 74, 11], [-2602, -3112, 68, 12], [-2700, -3080, 70, 13], [-2590, -3200, 66, 14],
];
/** Walkway platform height on each walk tree, and the bridges between them (indices). */
export const WALK_DECK = 16;
export const WALK_BRIDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 3]];

let mega: [number, number, number, number][] | null = null;
/** Every mega-tree (laid out on first use: it needs the world map's regions loaded). */
export function megaTrees() {
  return (mega ??= layoutMegaTrees());
}
function layoutMegaTrees(): [number, number, number, number][] {
  const r = rng(40404);
  const out: [number, number, number, number][] = [...WALK_TREES];
  const keepOff: [number, number, number][] = [
    [SITES.worldTree[0], SITES.worldTree[1], 190], [SITES.elderGrove[0], SITES.elderGrove[1], 70], [SITES.temple[0], SITES.temple[1] + 30, 60],
    [SITES.hermit[0], SITES.hermit[1], 45], [SITES.spiderHollow[0], SITES.spiderHollow[1], 30],
  ];
  for (let k = 0; k < 900 && out.length < 72; k++) {
    // Mostly the Ancient Forest; a ring around the Sanctum.
    let x: number, z: number;
    if (k % 4 === 0) {
      const a = r() * Math.PI * 2, d = 230 + r() * 330;
      x = SITES.worldTree[0] + Math.cos(a) * d;
      z = SITES.worldTree[1] + Math.sin(a) * d;
    } else {
      x = -3700 + r() * 2100;
      z = -3060 - r() * 640;
    }
    const h = 55 + r() * 30, seed = Math.floor(r() * 1e6);
    if (keepOff.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    if (polyDist(x, z, OLDEST_WAY) < 26) continue;
    if (out.some((t) => Math.hypot(t[0] - x, t[1] - z) < 58)) continue;
    if (regionAt(x, z) !== 'verdantElves') continue;
    out.push([x, z, h, seed]);
  }
  return out;
}

/** Is (x, z) under a mega-tree's roots (the ordinary forest keeps clear)? */
function nearMega(x: number, z: number) {
  for (const t of megaTrees()) if (Math.abs(t[0] - x) < 16 && Math.abs(t[1] - z) < 16 && Math.hypot(t[0] - x, t[1] - z) < 15) return true;
  return false;
}

/**
 * Tree density in the elven woods: [probability, kind, size], or null to keep
 * the default. The woods thicken and grow taller layer by layer, with sunny
 * glades left open, and the villages and mega-trees keep their ground.
 */
export function elvenTreeDensity(x: number, z: number, grove: number): [number, 'tree' | 'pine' | 'mix', number] | null {
  const layer = forestLayer(x, z);
  if (!layer) return null;
  for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) < p.r * (p === PADS[2] ? 0.92 : 0.8)) return [0, 'tree', 1];
  if ((layer === 'ancient' || layer === 'deep') && nearMega(x, z)) return [0, 'tree', 1];
  // Sunlit glades where the canopy opens (a slow noise), denser woods between.
  const open = smooth(0.34, 0.27, grove);
  if (layer === 'outer') return [(0.3 + grove * 0.35) * (1 - open * 0.8), 'mix', 1.15 + grove * 0.2];
  if (layer === 'inner') return [(0.5 + grove * 0.3) * (1 - open * 0.75), 'tree', 1.35 + grove * 0.3];
  if (layer === 'ancient') return [(0.42 + grove * 0.3) * (1 - open * 0.7), 'tree', 1.7 + grove * 0.4];
  return [(0.32 + grove * 0.25) * (1 - open * 0.8), 'tree', 1.55 + grove * 0.3];
}
