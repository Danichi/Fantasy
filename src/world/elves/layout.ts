/** Shared by the terrain worker and region runtime. Never import rendering or heightAt here. */
export type Point = readonly [number, number];
export interface ForestSite {
  id: string;
  name: string;
  at: Point;
  kind: 'town' | 'camp' | 'boss' | 'shrine' | 'resource' | 'vista' | 'temple';
  level: number;
  text: string;
  item?: string;
  night?: boolean;
}
export const FOREST_NODES = {
  marker: [-148, -678],
  approach: [-900, -1500],
  thornwick: [-940, -1730],
  silverbough: [-1730, -2290],
  sanctum: [-2842, -2931],
  spring: [-1500, -2550],
  hunter: [-2060, -2770],
  fox: [-1950, -2170],
  hollow: [-3350, -3290],
  elder: [-2560, -3550],
  temple: [-2980, -3910],
  song: [-2620, -3080],
  eastwatch: [-710, -2940],
  starlake: [1240, -3140],
  glade: [3256, -2856],
} as const satisfies Record<string, Point>;
export type ForestNode = keyof typeof FOREST_NODES;
/** Return points stay outside the World Tree's trunk and its buttress roots. */
export function forestRefugeAt(at: Point): Point {
  return at[0] === FOREST_NODES.sanctum[0] && at[1] === FOREST_NODES.sanctum[1] ? [at[0], at[1] + 42] : [at[0] - 9, at[1]];
}
export const FOREST_ROUTES: ForestNode[][] = [
  ['marker', 'thornwick', 'silverbough', 'sanctum', 'elder', 'temple'],
  ['approach', 'thornwick'],
  ['silverbough', 'spring', 'hunter', 'sanctum'],
  ['silverbough', 'fox'],
  ['sanctum', 'hollow'],
  ['sanctum', 'song'],
  ['silverbough', 'eastwatch', 'starlake', 'glade'],
];
export const FOREST_SITES: ForestSite[] = [
  {
    id: 'thornwick',
    name: 'Thornwick · Woodsman’s Rest',
    at: FOREST_NODES.thornwick,
    kind: 'town',
    level: 12,
    text: 'Sawyers, a working mill and the last familiar hearth before the hidden paths.',
  },
  {
    id: 'silverbough',
    name: 'Silverbough',
    at: FOREST_NODES.silverbough,
    kind: 'town',
    level: 20,
    text: 'Three living trees shelter the village. The wind bridges lead towards the World Tree.',
  },
  { id: 'sanctum', name: 'Elven Sanctum', at: FOREST_NODES.sanctum, kind: 'town', level: 30, text: 'The Council of Leaves keeps the old histories beneath a living crown.' },
  {
    id: 'spring',
    name: 'Webs in the Silver Spring',
    at: FOREST_NODES.spring,
    kind: 'camp',
    level: 22,
    text: 'Blight-fed spiders choke the spring. Their leaps land on the marked circles.',
  },
  {
    id: 'hunter',
    name: 'The Lost Hunter',
    at: FOREST_NODES.hunter,
    kind: 'camp',
    level: 25,
    text: 'An elven hunter is pinned down by corrupted wolves. Break the pack and recover her trail journal.',
  },
  {
    id: 'elder',
    name: 'The Blighted Elder',
    at: FOREST_NODES.elder,
    kind: 'boss',
    level: 35,
    text: 'A guardian turned against its own roots. Roll out of the lanes before the roots rise; attack during its recovery.',
  },
  {
    id: 'temple',
    name: 'Temple of Starfall',
    at: FOREST_NODES.temple,
    kind: 'temple',
    level: 38,
    text: 'Two floors beneath the stars. Align the mirrors, unlock the observatory and face Asterion, the Last Starwarden.',
  },
  {
    id: 'fox',
    name: 'The Fox Who Stole the Moon',
    at: FOREST_NODES.fox,
    kind: 'shrine',
    level: 20,
    text: 'A silver fox waits on the old wall. Follow the three pawprint stones without attacking it.',
  },
  {
    id: 'song',
    name: 'Roots of the First Song',
    at: FOREST_NODES.song,
    kind: 'shrine',
    level: 28,
    text: 'Three root harps answer leaf, rain, then starlight. Listen before you play.',
  },
  {
    id: 'eastwatch',
    name: 'Eastwatch Lantern Refuge',
    at: FOREST_NODES.eastwatch,
    kind: 'vista',
    level: 23,
    text: 'A dry bed, a route lantern and the long eastward trail to Moonlight Glade.',
  },
  {
    id: 'starlake',
    name: 'The Mirrorwater',
    at: FOREST_NODES.starlake,
    kind: 'vista',
    level: 28,
    text: 'The spring-fed lake reflects the same stars that the old temple chart records.',
  },
  {
    id: 'glade',
    name: 'Moonlight Glade',
    at: FOREST_NODES.glade,
    kind: 'shrine',
    level: 32,
    text: 'Sylwen reads the sky here after dusk. Moonblossoms open between 20:00 and 05:00.',
  },
  {
    id: 'hollow',
    name: 'The Hermit of the Hollow',
    at: FOREST_NODES.hollow,
    kind: 'vista',
    level: 30,
    text: 'The Wildwarden teaches the Living Green and the wolf, bear and hawk paths to those who have healed the forest.',
  },
  ...(
    [
      ['elfHeartwood', -1830, -2380, 'Fallen Heartwood', 'elfHeartwood'],
      ['ironbark', -3030, -3170, 'Ironbark Stand', 'elfIronbark'],
      ['amber', -2710, -3420, 'Spirit Amber', 'elfSpiritAmber'],
      ['bloom', 3218, -2880, 'Night Bloom', 'elfMoonblossom'],
    ] as const
  ).map(([id, x, z, name, item]) => ({
    id,
    name,
    at: [x, z] as Point,
    kind: 'resource' as const,
    level: 25,
    text: 'Gather respectfully. This patch replenishes each day.',
    item,
    night: id === 'bloom',
  })),
];
export const nightInForest = (hour: number) => hour >= 20 || hour < 5;
export function inElvenForest(x: number, z: number) {
  return x > -4200 && x < 3800 && z < -1550 && z > -4380;
}
export function forestLayer(x: number, z: number) {
  if (!inElvenForest(x, z)) return null;
  if (z > -2040) return 'Outer Woods';
  if (z > -2700) return 'The Hidden Wood';
  return x > 500 ? 'The Moonlit Reaches' : z < -3350 ? 'The Ancient Forest' : 'The World Tree';
}
export function segmentAt(x: number, z: number, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return { t, d: Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) };
}
export function forestTrailDistance(x: number, z: number) {
  let d = Infinity;
  for (const route of FOREST_ROUTES) for (let i = 1; i < route.length; i++) d = Math.min(d, segmentAt(x, z, FOREST_NODES[route[i - 1]], FOREST_NODES[route[i]]).d);
  return d;
}
export function forestSafe(x: number, z: number) {
  return (['thornwick', 'silverbough', 'sanctum', 'glade', 'eastwatch', 'starlake', 'hollow'] as const).some(
    (id) => Math.hypot(x - FOREST_NODES[id][0], z - FOREST_NODES[id][1]) < 100
  );
}
const smooth = (v: number) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};
function relief(x: number, z: number) {
  return 24 * Math.sin(x / 420 + z / 670) + 18 * Math.cos(z / 310 - x / 750) + 65 * Math.exp(-((x + 3100) ** 2 + (z + 3450) ** 2) / 440000);
}
const forestFloor = (x: number, z: number) => 32 + 10 * Math.sin(x / 290) + 9 * Math.cos(z / 340) + 7 * Math.sin((x + z) / 190);
type Base = (x: number, z: number) => number;
const profiles = new WeakMap<Base, Map<string, number>>();
export function forestNodeHeight(id: ForestNode, base: Base) {
  let p = profiles.get(base);
  if (!p) {
    p = new Map();
    profiles.set(base, p);
  }
  if (!p.has(id)) {
    const [x, z] = FOREST_NODES[id];
    p.set(id, !inElvenForest(x, z) ? base(x, z) : Math.max(forestFloor(x, z), base(x, z) + relief(x, z)));
  }
  return p.get(id)!;
}
/** A contained lake, including a dry, gentle bank around its entire perimeter. */
export const FOREST_POOLS = [
  { id: 'silver-spring', at: [-1476, -2580] as Point, r: 13, node: 'spring' as ForestNode },
  { id: 'mirrorwater', at: [1240, -3215] as Point, r: 48, node: 'starlake' as ForestNode },
  { id: 'moon-pool', at: [3256, -2914] as Point, r: 22, node: 'glade' as ForestNode },
];
export const FOREST_BRIDGE = { a: [-885, -1657] as Point, b: [-930, -1717] as Point, width: 8 };
export function forestCrossingHeightAt(x: number, z: number, base: Base) {
  const s = segmentAt(x, z, FOREST_BRIDGE.a, FOREST_BRIDGE.b);
  return s.t > 0 && s.t < 1 && s.d < FOREST_BRIDGE.width / 2 ? forestBridgeHeight(s.t, base) : null;
}
const bridgeProfiles = new WeakMap<Base, readonly [number, number, number]>();
/** Ground-matched approaches; the crossing itself stays above the brook. */
export function forestBridgeHeight(t: number, base: Base) {
  let h = bridgeProfiles.get(base);
  if (!h) {
    h = [
      forestGround(FOREST_BRIDGE.a[0], FOREST_BRIDGE.a[1], base) + 0.05,
      forestNodeHeight('thornwick', base) + 0.35,
      forestGround(FOREST_BRIDGE.b[0], FOREST_BRIDGE.b[1], base) + 0.05,
    ];
    bridgeProfiles.set(base, h);
  }
  return t < 0.2 ? h[0] + ((h[1] - h[0]) * t) / 0.2 : t > 0.8 ? h[1] + ((h[2] - h[1]) * (t - 0.8)) / 0.2 : h[1];
}
export const FOREST_CREEK: Point[] = [
  [-900, -1640],
  [-915, -1740],
  [-895, -1820],
];
export function forestCreekAt(x: number, z: number, base: Base) {
  let best: { distance: number; level: number } | null = null;
  for (let i = 1; i < FOREST_CREEK.length; i++) {
    const v = segmentAt(x, z, FOREST_CREEK[i - 1], FOREST_CREEK[i]);
    if (v.d < 17 && (!best || v.d < best.distance)) best = { distance: v.d, level: forestNodeHeight('thornwick', base) - 1.1 - (i - 1 + v.t) * 0.5 };
  }
  return best;
}
export function forestWaterAt(x: number, z: number, base: Base) {
  const creek = forestCreekAt(x, z, base);
  if (creek && creek.distance < 13) return { id: 'thornwick-creek', level: creek.level };
  for (const p of FOREST_POOLS) if (Math.hypot(x - p.at[0], z - p.at[1]) < p.r + 12) return { id: p.id, level: forestNodeHeight(p.node, base) - 1.2 };
  return null;
}
/** Cache-friendly spatial index: terrain tiles never scan the entire region's routes. */
const buckets = new Map<string, { a: ForestNode; b: ForestNode }[]>();
for (const path of FOREST_ROUTES)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      u = FOREST_NODES[a],
      v = FOREST_NODES[b];
    for (let x = Math.floor((Math.min(u[0], v[0]) - 30) / 128); x <= Math.floor((Math.max(u[0], v[0]) + 30) / 128); x++)
      for (let z = Math.floor((Math.min(u[1], v[1]) - 30) / 128); z <= Math.floor((Math.max(u[1], v[1]) + 30) / 128); z++) {
        const k = x + ':' + z;
        let list = buckets.get(k);
        if (!list) buckets.set(k, (list = []));
        list.push({ a, b });
      }
  }
function forestGround(x: number, z: number, base: Base) {
  const h = base(x, z);
  if (!inElvenForest(x, z)) return h;
  const edge = smooth(Math.min(x + 4200, 3800 - x, -1550 - z, z + 4380) / 170);
  let y = h + (Math.max(forestFloor(x, z), h + relief(x, z)) - h) * edge;
  for (const { a, b } of buckets.get(Math.floor(x / 128) + ':' + Math.floor(z / 128)) ?? []) {
    const s = segmentAt(x, z, FOREST_NODES[a], FOREST_NODES[b]);
    if (s.d > 24) continue;
    const road = forestNodeHeight(a, base) + (forestNodeHeight(b, base) - forestNodeHeight(a, base)) * s.t;
    y += (road - y) * (1 - smooth((s.d - 5) / 19)) * edge;
  }
  for (const [id, p] of Object.entries(FOREST_NODES)) {
    if (id === 'marker') continue;
    const r = ['thornwick', 'silverbough', 'sanctum'].includes(id) ? 68 : 32,
      d = Math.hypot(x - p[0], z - p[1]);
    if (d < r + 65) y += (forestNodeHeight(id as ForestNode, base) - y) * (1 - smooth((d - r) / 65)) * edge;
  }
  return y;
}
export function shapeElvenForest(x: number, z: number, base: Base) {
  let y = forestGround(x, z, base);
  if (!inElvenForest(x, z)) return y;
  for (const p of FOREST_POOLS) {
    const d = Math.hypot(x - p.at[0], z - p.at[1]);
    if (d < p.r + 26) {
      const level = forestNodeHeight(p.node, base) - 1.2,
        bed = level - 2.4 + 4 * smooth((d - p.r + 6) / 24);
      y += (bed - y) * (1 - smooth((d - p.r - 12) / 14));
    }
  }
  const creek = forestCreekAt(x, z, base);
  if (creek) {
    const bed = creek.level - 2.1 + 3.9 * smooth((creek.distance - 3) / 10);
    y += (bed - y) * (1 - smooth((creek.distance - 13) / 4));
  }
  return y;
}
/** Guide expiry is measured in absolute in-game hours, never wall-clock time. */
export function forestGuided(flags: Record<string, unknown>, day: number, hour: number, elf: boolean, trailLevel: number) {
  return elf || trailLevel >= 15 || !!flags['elf:token'] || Number(flags['elf:guideUntil'] ?? 0) > day * 24 + hour;
}
export function lostWoodsDestination(x: number, z: number): Point | null {
  if (!inElvenForest(x, z) || z > -2100 || forestTrailDistance(x, z) < 95 || forestSafe(x, z)) return null;
  let best: Point = FOREST_NODES.silverbough,
    d = Infinity;
  for (const id of ['silverbough', 'sanctum', 'eastwatch', 'starlake', 'glade'] as const) {
    const p = FOREST_NODES[id],
      v = Math.hypot(x - p[0], z - p[1]);
    if (v < d) {
      d = v;
      best = p;
    }
  }
  return best;
}
