// Authored landforms and water share this pure index with the terrain worker.
// Ground stays a heightfield; bridge decks and natural arches are separate solids.
import { ROAD_POLYS, CROWN_SITES, crownSitePoint, roadPoint } from '../roadData';
import { ISLANDS, islandAt } from '../islands/layout';
import { PADS, DWARF_ROAD, LIFT, COLD_VEIN, CHASM } from '../mountains/mountainLayout';
import { SCAV_CAMPS, SCRAP_TOWNS, SUNKEN_GATE, SUNSPIRE, SUNSPIRE_HALF } from '../desert/desertLayout';
import { ISLAND_PORTS, padCentre } from '../sea/islandPortsData';
import { macroElevAt, SEA_LEVEL, GW, WORLD_X0, WORLD_Z0, CELL } from '../worldMap';

export type Point = readonly [number, number];
export type Knot = readonly [number, number, number];
export type Height = (x: number, z: number) => number;
export const TERRAIN_REVISION = 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export function segment(x: number, z: number, a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1));
  return { d: Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz), t };
}
function lineDistance(x: number, z: number, points: readonly (readonly number[])[]) {
  let d = Infinity;
  for (let i = 1; i < points.length; i++) d = Math.min(d, segment(x, z, points[i - 1], points[i]).d);
  return d;
}
export interface Landform {
  id: string;
  region: string;
  line: Point[];
  width: number;
  rise: number;
  kind: 'ridge' | 'mesa' | 'basin' | 'gully';
}
const form = (id: string, region: string, kind: Landform['kind'], rise: number, width: number, ...line: Point[]): Landform => ({ id, region, kind, rise, width, line });
export const LANDFORMS: Landform[] = [
  form('glen-west-ridge', 'Elder Glen', 'ridge', 66, 190, [-740, 200], [-510, -80], [-490, -470]),
  form('north-watershed', 'Elder Glen', 'ridge', 88, 170, [-110, -600], [180, -660], [390, -520]),
  form('glen-east-knoll', 'Elder Glen', 'ridge', 42, 135, [345, -240], [460, -390]),
  form('meadow-terrace', 'Meadow Lane', 'mesa', 26, 180, [-180, 560], [220, 610], [450, 500]),
  form('gravewood-rim', 'Gravewood', 'ridge', 32, 95, [-510, 245], [-540, 410], [-370, 490]),
  form('gravewood-basin', 'Gravewood', 'basin', -12, 125, [-390, 345], [-290, 430]),
  form('kings-ridge', "King's Road", 'ridge', 72, 180, [660, -260], [970, -330], [1240, -200]),
  form('lantern-valley', "King's Road", 'gully', -12, 110, [900, -300], [850, -70], [820, 180]),
  form('millbrook-hills', "King's Road", 'ridge', 48, 160, [1450, -200], [1730, -260], [1890, -130]),
  form('coastal-bluffs', 'Port Aurelle', 'mesa', 83, 180, [2280, -170], [2500, -320], [2770, -280]),
  form('port-south-terraces', 'Port Aurelle', 'mesa', 36, 160, [2380, 430], [2580, 540], [2770, 490]),
  form('crown-spurs', 'Crown Road', 'ridge', 105, 220, [-1160, -370], [-1560, -600], [-1870, -830]),
  form('crown-ravine', 'Crown Road', 'gully', -30, 160, [-2410, -1070], [-2490, -790], [-2380, -400]),
  form('crown-west-ridge', 'Crown Road', 'ridge', 94, 190, [-2780, -1300], [-2870, -1080], [-2850, -790]),
  form('capital-north-bluffs', 'Royal Capital', 'mesa', 76, 190, [-3220, -1460], [-3550, -1510], [-3800, -1360]),
  form('capital-south-shelves', 'Royal Capital', 'mesa', 43, 190, [-3200, -650], [-3560, -560], [-3890, -740]),
  form('kettle-east-spine', 'White Mountains', 'ridge', 175, 240, [4480, -4590], [4490, -4950], [4250, -5360]),
  form('hanging-basin', 'White Mountains', 'basin', -95, 200, [3930, -4610], [3730, -4690]),
  form('frostpeak-spur', 'White Mountains', 'ridge', 115, 190, [2700, -5530], [3010, -5440]),
  form('desert-east-mesas', 'Golden Expanse', 'mesa', 94, 260, [-3260, 1120], [-3550, 1270], [-3900, 1170]),
  form('desert-dry-river', 'Golden Expanse', 'gully', -30, 110, [-3950, 1530], [-4500, 1840], [-4980, 1600]),
  form('saltpan-basin', 'Golden Expanse', 'basin', -20, 310, [-6600, 1050], [-6910, 1180]),
  form('western-mesas', 'Golden Expanse', 'mesa', 108, 250, [-7270, 1150], [-7650, 1260], [-7950, 920]),
  form('ghagrabba-red-rim', 'Golden Expanse', 'ridge', 72, 210, [-5540, 30], [-5900, -60], [-6300, 100]),
  form('ashen-basalt-spur', 'Ashen Port', 'mesa', 72, 160, [10020, 30], [10250, -90]),
  form('ashen-ash-gully', 'Ashen Port', 'gully', -14, 80, [9970, 340], [10110, 200]),
];
for (const isle of ISLANDS) {
  // Pick a real atlas land cell away from the landing and quest pads. Small
  // keys need a compact outcrop rather than a ridge across their whole shore.
  const candidates = isle.cells.map((c) => [WORLD_X0 + ((c % GW) + 0.5) * CELL, WORLD_Z0 + (Math.floor(c / GW) + 0.5) * CELL] as Point);
  const clearance = (p: Point) =>
    Math.min(
      Math.hypot(p[0] - isle.landing[0], p[1] - isle.landing[1]) - 26,
      ...isle.sites.map((s) => Math.hypot(p[0] - s.at[0], p[1] - s.at[1]) - 20),
      ...isle.paths.map((path) => lineDistance(p[0], p[1], path) - 8)
    );
  candidates.sort((a, b) => clearance(b) - clearance(a));
  const [cx, cz] = candidates[0] ?? isle.at;
  const size = Math.max(22, Math.min(210, isle.extent * 0.38, Math.max(28, clearance([cx, cz]) * 1.5)));
  const region = isle.region;
  const kind = region === 'sunkenIsles' || region === 'azureIsles' ? 'mesa' : 'ridge';
  const rise = Math.min(region === 'emeraldIsles' ? 96 : region === 'shatteredIsles' ? 82 : 45, size * 0.42);
  LANDFORMS.push(form('island-' + isle.id, isle.region, kind, rise, size, [cx - size * 0.35, cz], [cx + size * 0.35, cz - size * 0.4]));
  if (isle.extent > 180)
    LANDFORMS.push(form('island-gully-' + isle.id, isle.region, 'gully', -Math.min(18, size * 0.1), size * 0.32, [cx, cz + size], [cx + size * 0.5, cz + size * 0.3]));
}

export interface Watercourse {
  id: string;
  name: string;
  knots: Knot[];
  width: number;
  depth: number;
  bank: number;
  current: number;
}
export const WATERCOURSES: Watercourse[] = [
  {
    id: 'northspring',
    name: 'Northspring Beck',
    knots: [
      [245, -670, 34],
      [260, -520, 25],
      [245, -370, 14],
      [220, -240, 5],
      [175, -110, -0.6],
      [143, -110, -0.6],
    ],
    width: 5,
    depth: 1.8,
    bank: 12,
    current: 0.35,
  },
  {
    id: 'lantern',
    name: 'Lantern Beck',
    knots: [
      [900, -310, 20],
      [875, -170, 12],
      [850, -45, 4],
      [820, 110, 1],
      [940, 350, 1],
    ],
    width: 7,
    depth: 2.4,
    bank: 14,
    current: 0.3,
  },
  {
    id: 'crown',
    name: 'Crownwater',
    knots: [
      [-2500, -1160, 12],
      [-2530, -940, 9],
      [-2530, -760, 5],
      [-2600, -750, 4.9],
      [-2620, -680, 4.6],
      [-2550, -500, 4.3],
      [-2280, -260, 4],
    ],
    width: 9,
    depth: 2.8,
    bank: 18,
    current: 0.4,
  },
  {
    id: 'hanging',
    name: 'Hanging Basin Run',
    knots: [
      [3800, -4300, 646],
      [3840, -4430, 588],
      [3870, -4490, 542],
      [3930, -4510, 449],
      [3930, -4600, 449],
    ],
    width: 5,
    depth: 2,
    bank: 15,
    current: 0.28,
  },
  {
    id: 'oasis',
    name: 'Glasswind Spring',
    knots: [
      [-5320, 1180, 20],
      [-5210, 1250, 20],
      [-5100, 1270, 20],
    ],
    width: 8,
    depth: 2.2,
    bank: 18,
    current: 0.12,
  },
]; // Two shallow forest runs leave the Emerald uplands as real cascades. Their
// mouths join the sea; narrow banks stay away from the established island paths.
WATERCOURSES.push(
  {
    id: 'emerald-heartfall',
    name: 'Heartwood Falls',
    knots: [
      [6394, 3662, 102],
      [6400, 3670, 100],
      [6454, 3707, SEA_LEVEL],
    ],
    width: 2.5,
    depth: 0.8,
    bank: 6,
    current: 0.25,
  },
  {
    id: 'emerald-fernfall',
    name: 'Fernfall Run',
    knots: [
      [6154, 1607, 142.5],
      [6094, 1562, 106.2],
      [6064, 1512, SEA_LEVEL],
    ],
    width: 2.5,
    depth: 0.8,
    bank: 6,
    current: 0.25,
  }
);

export interface Pond {
  id: string;
  name: string;
  at: Point;
  radius: number;
  level: number;
  depth: number;
}
export const PONDS: Pond[] = [
  { id: 'lantern-pool', name: 'Lantern Mere', at: [940, 350], radius: 42, level: 1, depth: 3.4 },
  { id: 'crown-pool', name: 'Crownwater Basin', at: [-2280, -260], radius: 58, level: 4, depth: 4 },
  { id: 'hanging-pool', name: 'Hanging Tarn', at: [3930, -4600], radius: 46, level: 449, depth: 3.5 },
  { id: 'glasswind-pool', name: 'Glasswind Oasis', at: [-5100, 1270], radius: 38, level: 20, depth: 3 },
];
export interface Crossing {
  id: string;
  name: string;
  at: Point;
  axis: 'x' | 'z';
  angle?: number;
  half: number;
  width: number;
  level: number;
}
export function crossingCoordinates(c: Crossing, x: number, z: number) {
  const angle = c.angle ?? (c.axis === 'x' ? 0 : Math.PI / 2),
    dx = x - c.at[0],
    dz = z - c.at[1];
  return { along: dx * Math.cos(angle) + dz * Math.sin(angle), across: -dx * Math.sin(angle) + dz * Math.cos(angle) };
}
export const CROSSINGS: Crossing[] = [
  { id: 'lantern-bridge', name: 'Lantern Bridge', at: [820, 112.9], axis: 'x', angle: Math.atan2(14, 290), half: 27, width: 7, level: 2.1 },
  { id: 'crown-bridge', name: 'Crownwater Bridge', at: [-2530, -752], axis: 'x', angle: Math.atan2(180, 450), half: 32, width: 7, level: 8.1 },
  { id: 'northspring-bridge', name: 'Northspring Footbridge', at: [246, -378], axis: 'x', half: 21, width: 3.8, level: 15.9 },
];
export interface BankExit {
  id: string;
  at: Point;
  end: Point;
  level: number;
}
export const BANK_EXITS: BankExit[] = [
  ...PONDS.flatMap((p) =>
    [-1, 1].map((side) => ({
      id: p.id + '-bank-' + side,
      at: [p.at[0] + p.radius * 0.8 * side, p.at[1]] as Point,
      end: [p.at[0] + (p.radius + 110) * side, p.at[1]] as Point,
      level: p.level,
    }))
  ),
  ...WATERCOURSES.filter((w) => !w.id.startsWith('emerald-')).map((w) => {
    const a = w.knots[0],
      b = w.knots[1],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      nx = -(b[1] - a[1]) / length,
      nz = (b[0] - a[0]) / length,
      x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2;
    return {
      id: w.id + '-bank',
      at: [x + nx * w.width * 0.8, z + nz * w.width * 0.8] as Point,
      end: [x + nx * (w.width + 180), z + nz * (w.width + 180)] as Point,
      level: (a[2] + b[2]) / 2,
    };
  }),
];
export interface Trail {
  id: string;
  name: string;
  points: Point[];
  hint: string;
}
export const TRAILS: Trail[] = [
  {
    id: 'glen-ridge',
    name: 'West Ridge Trail',
    points: [
      [-320, 118],
      [-560, 60],
      [-640, -130],
      [-520, -360],
      [-300, -350],
    ],
    hint: 'Follow the cairns above the western wood. The lower path returns to the standing stones.',
  },
  {
    id: 'northspring',
    name: 'Northspring Walk',
    points: [
      [300, 56],
      [390, -120],
      [340, -330],
      [278, -378],
      [214, -378],
      [170, -440],
      [0, -370],
    ],
    hint: 'Cross Northspring above the gorge; the switchback returns to the crypt approach.',
  },
  {
    id: 'kings-high',
    name: 'Lantern Ridgeway',
    points: [
      [520, 88],
      [650, -120],
      [650, -400],
      [900, -450],
      [1150, -300],
      [1160, -60],
      [1380, 118],
    ],
    hint: 'The ridge passes above Lantern Beck. Return to the road east of the farms.',
  },
  {
    id: 'kings-low',
    name: 'Lantern Bank Walk',
    points: [
      [760, 110],
      [710, 300],
      [820, 430],
      [1020, 440],
      [1120, 260],
      [1050, 124],
    ],
    hint: 'The low trail follows the mere. Shallow banks lead out on either side.',
  },
  {
    id: 'gravewood-high',
    name: 'Gravewood Rim',
    points: [
      [-230, 80],
      [-440, 170],
      [-520, 330],
      [-470, 480],
      [-270, 490],
      [-240, 350],
      [-340, 306],
    ],
    hint: 'Stay on the rim for the long approach. The stone steps descend toward the graveyard gate.',
  },
  {
    id: 'crown-high',
    name: 'Watchman’s Spur',
    points: [
      [-960, -10],
      [-1140, -210],
      [-1460, -410],
      [-1750, -510],
      [-2000, -520],
    ],
    hint: 'Cairns lead across the spurs. The Crown Road remains the easier route below.',
  },
  {
    id: 'port-cliff',
    name: 'Aurelle Headland Walk',
    points: [
      [2230, 152],
      [2280, -50],
      [2450, -190],
      [2660, -260],
      [2830, -150],
      [2640, -25],
      [2640, 150],
      [2690, 150],
    ],
    hint: 'Climb the headland for a view of the harbour; the eastern switchback returns to the city approach.',
  },
  {
    id: 'capital-bluff',
    name: 'Crown Bluff Walk',
    points: [
      [-2900, -900],
      [-3020, -1230],
      [-3230, -1400],
      [-3470, -1410],
      [-3700, -1260],
      [-3750, -1060],
    ],
    hint: 'The bluff trail follows the northern terraces; Kingsbridge remains on the valley road.',
  },
  {
    id: 'desert-wash',
    name: 'Redstone Wash',
    points: [
      [-3500, 950],
      [-3680, 1020],
      [-3900, 1170],
      [-4200, 1330],
      [-4200, 1500],
    ],
    hint: 'Use the stone shelves above the wash. The low channel offers shelter from the dunes.',
  },
  {
    id: 'ashen-pass',
    name: 'Basalt Pass',
    points: [
      [9860, 180],
      [9970, 100],
      [10100, 60],
      [10200, -40],
    ],
    hint: 'The basalt steps lead to the inland overlook. Return to Ashen Port by the same marked pass.',
  },
];

// Existing roadside locations keep their foundations and receive a walking
// approach where the new ridges would otherwise isolate a quest entrance.
for (const [key, name] of [
  ['watchtower', 'Watchtower Path'],
  ['wolfDen', 'Wolf Hollow Track'],
  ['kingsmile', 'Kingsmile Spur'],
  ['cottage', 'Crownwater Cottage Walk'],
  ['orcCamp', "Raiders' Spur"],
  ['barrow', 'Barrow Approach'],
] as const) {
  const site = CROWN_SITES[key],
    start = roadPoint('capital', site.s - (key === 'cottage' ? 60 : 0)),
    end = crownSitePoint(key);
  TRAILS.push({
    id: 'crown-' + key,
    name,
    points: [start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], end],
    hint: 'The cairns connect this old roadside place to the Crown Road. Follow the same marked approach back to the valley.',
  });
}
TRAILS.push({
  id: 'tinroof-shelf',
  name: 'Tinroof Shelf Path',
  points: [
    [-3900, 1170],
    [-3800, 1210],
    [-3700, 1250],
  ],
  hint: 'The shelf path descends from Redstone Wash to Tinroof. Keep to the graded cut through the mesa.',
});

// Bounded spatial buckets avoid scanning every island/road for each 2 m sample.
type Indexed = { bounds: [number, number, number, number] };
class Grid<T> {
  private cells = new Map<string, T[]>();
  add(value: T, x0: number, z0: number, x1: number, z1: number) {
    for (let z = Math.floor(z0 / 256); z <= Math.floor(z1 / 256); z++)
      for (let x = Math.floor(x0 / 256); x <= Math.floor(x1 / 256); x++) {
        const key = x + ',' + z,
          list = this.cells.get(key) ?? [];
        list.push(value);
        this.cells.set(key, list);
      }
  }
  at(x: number, z: number): readonly T[] {
    return this.cells.get(Math.floor(x / 256) + ',' + Math.floor(z / 256)) ?? [];
  }
}
function bounds(points: readonly (readonly number[])[], pad: number): Indexed['bounds'] {
  return [
    Math.min(...points.map((p) => p[0])) - pad,
    Math.min(...points.map((p) => p[1])) - pad,
    Math.max(...points.map((p) => p[0])) + pad,
    Math.max(...points.map((p) => p[1])) + pad,
  ];
}
const forms = new Grid<Landform>(),
  roads = new Grid<readonly Point[]>(),
  waters = new Grid<Watercourse>(),
  ponds = new Grid<Pond>(),
  trails = new Grid<Trail>(),
  exits = new Grid<BankExit>();
for (const f of LANDFORMS) forms.add(f, ...bounds(f.line, f.width));
for (const line of [...ROAD_POLYS, DWARF_ROAD, [LIFT.bottom, LIFT.top]]) roads.add(line, ...bounds(line, 35));
for (const w of WATERCOURSES) waters.add(w, ...bounds(w.knots, w.width + w.bank + 145));
for (const p of PONDS) ponds.add(p, ...bounds([p.at], p.radius * 1.25 + 165));
for (const t of TRAILS) trails.add(t, ...bounds(t.points, 13));
for (const e of BANK_EXITS) exits.add(e, ...bounds([e.at], 300));
const anchors: [number, number, number][] = [
  [0, 0, 145],
  [0, -318, 46],
  [-180, -262, 40],
  [-480, -980, 55],
  [-1100, -1460, 65],
  [-340, 330, 35],
  [76, 98, 40],
  [98, -74, 45],
  [-80, 90, 40],
  [668, 176, 40],
  [330, -21, 40],
  [1070, 52, 50],
  [1950, -170, 50],
  [-300, -350, 40],
  [7, -300, 25],
  [COLD_VEIN.at[0], COLD_VEIN.at[1], 35],
  [CHASM[0], CHASM[1], 45],
  ...PADS.map((p) => [p.x, p.z, p.r] as [number, number, number]),
  ...SCAV_CAMPS,
  ...SCRAP_TOWNS.map((t) => [t.x, t.z, t.r] as [number, number, number]),
  ...Object.keys(CROWN_SITES).map((key) => {
    const p = crownSitePoint(key as keyof typeof CROWN_SITES);
    return [p[0], p[1], 18] as [number, number, number];
  }),
  [SUNKEN_GATE.x, SUNKEN_GATE.z, SUNKEN_GATE.r + 10],
  ...ISLAND_PORTS.map((p) => [...padCentre(p), 45] as [number, number, number]),
];
const protectedSites = new Grid<[number, number, number]>();
for (const a of anchors) protectedSites.add(a, ...bounds([[a[0], a[1]]], a[2] + 30));
/** 0 on existing foundations/road centres, smooth apron out to the new terrain. */
export function landscapeWeight(x: number, z: number) {
  let w = 1;
  if (x > 2660 && x < 3000 && z > -45 && z < 375) w *= smooth(0, 30, Math.max(2660 - x, x - 3000, -45 - z, z - 375) + 30); // entire inner city reserved below
  if (x >= 2690 && x <= 2975 && z >= 0 && z <= 350) return 0;
  const capital = Math.hypot((x + 3440) / 290, (z + 1060) / 255);
  w *= smooth(1, 1.22, capital);
  const desert = Math.max(Math.abs(x - SUNSPIRE.x) - SUNSPIRE_HALF.x, Math.abs(z - SUNSPIRE.z) - SUNSPIRE_HALF.z);
  w *= smooth(5, 65, desert);
  // The native causeway, canal mouth and lighthouse retain their geometry.
  if (x > 2540 && x < 2720) w *= smooth(8, 30, Math.abs(z - 150));
  if (Math.hypot(x - 2960, z + 18) < 45) return 0;
  // Existing river, mill and Elder bridge retain their original channel.
  if (Math.abs(z) < 455) w *= smooth(20, 42, Math.abs(x - (158 + Math.sin(z / 95) * 24 + Math.sin(z / 37 + 1.3) * 7)));
  for (const a of protectedSites.at(x, z)) w = Math.min(w, smooth(a[2], a[2] + 30, Math.hypot(x - a[0], z - a[1])));
  for (const l of roads.at(x, z)) w = Math.min(w, smooth(7, 32, lineDistance(x, z, l)));
  if (x > 2800) {
    const isle = islandAt(x, z);
    if (isle) {
      for (const s of isle.sites) {
        const r = isle.extent < 180 ? 12 : 24;
        w = Math.min(w, smooth(r, r + 21, Math.hypot(x - s.at[0], z - s.at[1])));
      }
      for (const p of isle.paths) w = Math.min(w, smooth(10, 28, lineDistance(x, z, p)));
      w = Math.min(w, smooth(26, 52, Math.hypot(x - isle.landing[0], z - isle.landing[1])));
    }
  }
  return w;
}
function landHeight(x: number, z: number, h: number) {
  // Existing sea lanes, tidal approaches and dive sites keep their bathymetry.
  if (h < SEA_LEVEL && macroElevAt(x, z) < SEA_LEVEL + 1.4) return h;
  const land = smooth(SEA_LEVEL + 0.8, SEA_LEVEL + 4, Math.max(macroElevAt(x, z), h));
  if (land === 0) return h;
  let delta = 0;
  for (const f of forms.at(x, z)) {
    const d = lineDistance(x, z, f.line) / f.width;
    if (d >= 1) continue;
    const profile = f.kind === 'mesa' ? 1 - smooth(0.36, 1, d) : f.kind === 'gully' ? Math.pow(1 - smooth(0, 1, d), 1.7) : Math.pow(1 - d * d, 2);
    delta += f.rise * profile;
  }
  return delta === 0 ? h : h + delta * land * landscapeWeight(x, z);
}
export interface WaterSample {
  level: number;
  distance: number;
  half: number;
  depth: number;
  bank: number;
  flowX: number;
  flowZ: number;
  id: string;
}
export function landscapeWaterAt(x: number, z: number, includeBanks = false, onlyOwner?: string, excludeOwner?: string): WaterSample | null {
  let best: WaterSample | null = null,
    score = Infinity;
  for (const w of waters.at(x, z)) {
    if ((onlyOwner && w.id !== onlyOwner) || w.id === excludeOwner) continue;
    for (let i = 1; i < w.knots.length; i++) {
      const a = w.knots[i - 1],
        b = w.knots[i],
        s = segment(x, z, a, b),
        outside = s.d - w.width;
      if (outside > w.bank + (includeBanks ? 140 : 0) || outside >= score) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      score = outside;
      best = {
        level: a[2] + (b[2] - a[2]) * s.t,
        distance: s.d,
        half: w.width,
        depth: w.depth,
        bank: w.bank,
        flowX: ((b[0] - a[0]) / len) * w.current,
        flowZ: ((b[1] - a[1]) / len) * w.current,
        id: w.id,
      };
    }
  }
  for (const p of ponds.at(x, z)) {
    if ((onlyOwner && p.id !== onlyOwner) || p.id === excludeOwner) continue;
    const angle = Math.atan2(z - p.at[1], x - p.at[0]);
    const warp = 1 + 0.1 * Math.sin(angle * 3 + p.at[0] * 0.013) + 0.065 * Math.sin(angle * 5 + p.at[1] * 0.019);
    const d = Math.hypot(x - p.at[0], z - p.at[1]) / warp,
      outside = d - p.radius;
    if (outside > 20 + (includeBanks ? 140 : 0) || outside >= score) continue;
    score = outside;
    best = { level: p.level, distance: d, half: p.radius, depth: p.depth, bank: 20, flowX: 0, flowZ: 0, id: p.id };
  }
  return best;
}
/** A closed bank meets the waterline before blending back to the landscape. */
function waterBankHeight(x: number, z: number, h: number, original: number) {
  const w = landscapeWaterAt(x, z, true);
  if (!w) return h;
  // Preserve dry buildings even when their grounds meet a new bank.
  if (h > w.level + 0.15) for (const a of protectedSites.at(x, z)) if (Math.hypot(x - a[0], z - a[1]) < a[2]) return h;
  const rim = w.half + w.bank,
    crest = Math.max(h, w.level + 1.1);
  if (w.distance <= rim) {
    const bed = w.level - w.depth;
    const t = smooth(w.half * 0.45, rim, w.distance);
    const shaped = bed + (crest - bed) * t;
    return w.id.startsWith('emerald-') && original < SEA_LEVEL ? Math.min(h, shaped) : shaped;
  }
  if (w.id.startsWith('emerald-') && original < SEA_LEVEL) return h;
  const apron = Math.min(140, Math.max(30, (crest - h) * 2.5));
  return h + (crest - h) * (1 - smooth(rim, rim + apron, w.distance));
}
interface ExitProfile {
  end: Point;
  height: number;
}
const exitProfiles = new Map<BankExit, ExitProfile>();
/** Resolve onto nearby dry ground, rather than raising a long strip over a valley. */
export function bankExitProfile(e: BankExit, base: Height): ExitProfile {
  const cached = exitProfiles.get(e);
  if (cached) return cached;
  const angle = Math.atan2(e.end[1] - e.at[1], e.end[0] - e.at[0]);
  const ground = (x: number, z: number) => {
    const h = base(x, z);
    return waterBankHeight(x, z, landHeight(x, z, h), h);
  };
  for (let run = 32; run <= 240; run += 4)
    for (const turn of [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const dx = Math.cos(angle + turn),
        dz = Math.sin(angle + turn),
        x = e.at[0] + dx * run,
        z = e.at[1] + dz * run,
        h = ground(x, z),
        w = landscapeWaterAt(x, z);
      if (h < e.level + 0.25 || (w && h < w.level + 0.25) || Math.abs(h - e.level - 0.45) / (run - 24) > 0.4) continue;
      if (Math.abs(ground(x + dx * 6, z + dz * 6) - h) > 3) continue;
      e.end = [x, z];
      const profile = { end: e.end, height: h };
      exitProfiles.set(e, profile);
      return profile;
    }
  // The authored courses are shallow at their heads. A short shelf stays
  // local if no broader valley-side approach fits the movement grade.
  const end: Point = [e.at[0] + Math.cos(angle) * 32, e.at[1] + Math.sin(angle) * 32];
  const profile = { end, height: Math.max(e.level + 0.3, ground(...end)) };
  e.end = end;
  exitProfiles.set(e, profile);
  return profile;
}

const profiles = new Map<Trail, Knot[]>();
export function trailProfile(t: Trail, base: Height): Knot[] {
  let result = profiles.get(t);
  if (result) return result;
  result = [];
  for (let i = 1; i < t.points.length; i++) {
    const a = t.points[i - 1],
      b = t.points[i],
      n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12);
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const x = a[0] + ((b[0] - a[0]) * j) / n,
        z = a[1] + ((b[1] - a[1]) * j) / n;
      result.push([x, z, landHeight(x, z, base(x, z))]);
    }
  }
  // The endpoints are native paths. Cut high spots and fill hollows to keep a
  // walking grade of at most 0.48 (26 degrees), without class abilities.
  const start = result[0][2],
    end = result[result.length - 1][2];
  const fixed = new Map<number, number>([
    [0, start],
    [result.length - 1, end],
  ]);
  for (let i = 0; i < result.length; i++)
    for (const c of CROSSINGS) {
      const { along, across } = crossingCoordinates(c, result[i][0], result[i][1]);
      if (Math.abs(along) < c.half + 2 && Math.abs(across) < c.width / 2) fixed.set(i, c.level - 0.2);
    }
  for (let pass = 0; pass < 4; pass++) {
    for (const [i, y] of fixed) result[i] = [result[i][0], result[i][1], y];
    for (let i = 1; i < result.length; i++) {
      const p = result[i],
        a = result[i - 1],
        dh = 0.48 * Math.hypot(p[0] - a[0], p[1] - a[1]);
      result[i] = [p[0], p[1], Math.max(a[2] - dh, Math.min(a[2] + dh, p[2]))];
    }
    for (const [i, y] of fixed) result[i] = [result[i][0], result[i][1], y];
    for (let i = result.length - 2; i >= 0; i--) {
      const p = result[i],
        a = result[i + 1],
        dh = 0.48 * Math.hypot(p[0] - a[0], p[1] - a[1]);
      result[i] = [p[0], p[1], Math.max(a[2] - dh, Math.min(a[2] + dh, p[2]))];
    }
    for (const [i, y] of fixed) result[i] = [result[i][0], result[i][1], y];
  }
  profiles.set(t, result);
  return result;
}
export function landscapeTrailDistance(x: number, z: number) {
  let d = Infinity;
  for (const t of trails.at(x, z)) d = Math.min(d, lineDistance(x, z, t.points));
  for (const e of exits.at(x, z)) d = Math.min(d, segment(x, z, e.at, e.end).d);
  return d;
}
export function shapeLandscape(x: number, z: number, base: Height) {
  const original = base(x, z);
  if (x >= 2696 && x <= 2968 && z >= 18 && z <= 340) return original;
  let h = landHeight(x, z, original);
  for (const t of trails.at(x, z)) {
    const p = trailProfile(t, base);
    let nearest = Infinity,
      target = h;
    for (let i = 1; i < p.length; i++) {
      const s = segment(x, z, p[i - 1], p[i]);
      if (s.d < nearest) {
        nearest = s.d;
        target = p[i - 1][2] + (p[i][2] - p[i - 1][2]) * s.t;
      }
    }
    h += (target - h) * (1 - smooth(3.8, 12, nearest));
  }
  h = waterBankHeight(x, z, h, original);
  // Narrow, gently graded shoals are deliberate swimming exits. The rest of
  // a gorge can remain steep without trapping an ordinary adventurer in it.
  for (const e of exits.at(x, z)) {
    const profile = bankExitProfile(e, base);
    const s = segment(x, z, e.at, profile.end);
    if (s.d > 10) continue;
    const end = profile.height;
    const length = Math.hypot(e.end[0] - e.at[0], e.end[1] - e.at[1]),
      run = length * s.t;
    const target = run <= 24 ? e.level - 0.55 + run / 24 : e.level + 0.45 + ((end - e.level - 0.45) * (run - 24)) / (length - 24);
    h += (target - h) * (1 - smooth(3.5, 10, s.d));
  }
  // Crossings grade their approaches to a continuous deck. Keep the channel
  // below it: the heightfield must never become an invisible dam.
  for (const c of CROSSINGS) {
    const { along, across } = crossingCoordinates(c, x, z);
    const approach = c.id === 'northspring-bridge' ? 14 : 80;
    if (Math.abs(along) < c.half || Math.abs(along) > c.half + approach || Math.abs(across) > c.width * 0.5 + 10) continue;
    const t = (Math.abs(along) - c.half) / approach;
    const target = (c.level - 0.2) * (1 - t) + (c.id === 'northspring-bridge' ? h : base(x, z)) * t;
    h += (target - h) * (1 - smooth(c.width * 0.5 + 2, c.width * 0.5 + 10, Math.abs(across)));
  }
  return h;
}
/** Navigation/grounded actors use decks; seabed and boat charts use heightAt. */
export function crossingHeightAt(x: number, z: number, ground?: Height): number | null {
  for (const c of CROSSINGS) {
    const { along, across } = crossingCoordinates(c, x, z);
    if (Math.abs(across) > c.width * 0.5) continue;
    if (Math.abs(along) <= c.half) return c.level;
    if (ground && Math.abs(along) <= c.half + 6) {
      const angle = c.angle ?? (c.axis === 'x' ? 0 : Math.PI / 2),
        side = Math.sign(along);
      const end = ground(c.at[0] + Math.cos(angle) * side * (c.half + 6), c.at[1] + Math.sin(angle) * side * (c.half + 6)) + 0.05;
      return c.level + ((end - c.level) * (Math.abs(along) - c.half)) / 6;
    }
  }
  return null;
}
