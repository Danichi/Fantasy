// The White Mountains on the map (docs/design/mountains.md): where the dwarf
// road climbs from Kettle Cove to Frostpeak Citadel, the level pads its
// villages, forts and huts stand on, the lantern cairns along it, the
// avalanche slopes above it and the glacier trail to the dragons' eyrie.
// Plain numbers only: the terrain (and its tile worker) reads the pads and
// the road through mountainShape().

/** A level pad: centre, flat radius, level, and the width of the blend into the slope. */
export interface MountainPad { id: string; x: number; z: number; r: number; h: number; blend: number }

/** [x, z, height or null]: null heights are graded evenly between the anchors around them. */
type RoadNode = [number, number, number | null];

/**
 * The dwarf road: up from Kettle Cove's quay along the shore, through
 * Copperbrook and past Bruni's claim, over Stonegate Pass and west under the
 * peaks to the Great Stair of Frostpeak.
 */
const ROAD_NODES: RoadNode[] = [
  [5212, -4846, 3.6], // Kettle Cove, the landward edge of the quay
  [5170, -4806, null],
  [5110, -4722, null],
  [5030, -4610, null],
  [4920, -4515, null],
  [4790, -4440, null],
  [4640, -4375, null],
  [4520, -4345, 200], // Copperbrook's square
  [4420, -4400, null],
  [4345, -4462, 262], // the claim's fork
  [4250, -4540, null],
  [4330, -4620, null],
  [4236, -4752, 400], // Stonegate Pass, under the fort
  [4190, -4870, null],
  [4100, -4990, null],
  [3930, -5090, 575],
  [3640, -5150, 600],
  [3340, -5200, 618],
  [3060, -5290, 620],
  [2820, -5410, 598],
  [2660, -5510, null],
  [2590, -5566, 560], // the foot of the Great Stair
];

/** The glacier trail: out of Frostpeak's high gate and up the ice to the eyrie. */
const TRAIL_NODES: RoadNode[] = [
  [2560, -5675, 565],
  [2660, -5690, null],
  [2600, -5760, null],
  [2700, -5790, null],
  [2742, -5868, null],
  [2786, -5856, 795],
];

function grade(nodes: RoadNode[]): [number, number, number][] {
  const out = nodes.map((n) => [n[0], n[1], n[2] ?? NaN] as [number, number, number]);
  const along = [0];
  for (let i = 1; i < out.length; i++) along.push(along[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  let a = 0;
  for (let i = 1; i < out.length; i++) {
    if (Number.isNaN(out[i][2])) continue;
    for (let k = a + 1; k < i; k++) out[k][2] = out[a][2] + ((along[k] - along[a]) / (along[i] - along[a])) * (out[i][2] - out[a][2]);
    a = i;
  }
  return out;
}

/** The graded road and trail polylines: [x, z, h] in world metres. */
export const MOUNTAIN_ROAD = grade(ROAD_NODES);
export const GLACIER_TRAIL = grade(TRAIL_NODES);

export const PADS: MountainPad[] = [
  { id: 'copperbrook', x: 4505, z: -4330, r: 44, h: 200, blend: 26 },
  { id: 'claim', x: 4300, z: -4486, r: 20, h: 262, blend: 18 },
  { id: 'stonegate', x: 4258, z: -4742, r: 22, h: 400, blend: 20 },
  { id: 'frostpeak', x: 2505, z: -5612, r: 78, h: 560, blend: 30 },
  { id: 'eyrie', x: 2792, z: -5850, r: 34, h: 795, blend: 22 },
  // (h 0: the pad takes the road's level where it sits)
  { id: 'yetiCave', x: 3420, z: -5232, r: 10, h: 0, blend: 10 },
];

/** Where the places are (the region file has Frostpeak Citadel and the Deep Hold). */
export const MTN_PLACES = {
  kettleCove: [5250, -4835] as [number, number],
  copperbrook: [4505, -4330] as [number, number],
  claim: [4300, -4486] as [number, number],
  shaftMouth: [4286, -4500] as [number, number],
  stonegate: [4258, -4742] as [number, number],
  frostpeak: [2505, -5612] as [number, number],
  greatLift: [2462, -5650] as [number, number],
  eyrie: [2792, -5850] as [number, number],
};

/** The lantern cairns along the road and over the pass (relit by the Lost Lantern Cairns). */
export const CAIRNS: [number, number][] = [
  [4980, -4560], [4700, -4400], [4382, -4425], [4248, -4610],
  [4140, -4935], [3790, -5120], [3490, -5180], [3200, -5245], [2940, -5350], [2730, -5460],
];
/** Cairn huts: stone shelters on the high road (a fire inside, out of the wind). */
export const SHELTERS: [number, number][] = [[4120, -4960], [3500, -5170], [2900, -5370]];
/** Avalanche slopes: a marked stretch of road with the snow loaded above it (uphill direction). */
export const AVALANCHE_SLOPES: { id: string; x: number; z: number; up: number; len: number }[] = [
  { id: 'gullet', x: 3790, z: -5124, up: -2.2, len: 60 },
  { id: 'widowsSlope', x: 3060, z: -5290, up: -2.6, len: 60 },
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to a graded polyline, and the road's height at the closest point. */
export function roadNear(x: number, z: number, line: [number, number, number][] = MOUNTAIN_ROAD): [number, number] {
  let best = 1e9, h = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az, ah] = line[i], [bx, bz, bh] = line[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) {
      best = d;
      h = ah + (bh - ah) * t;
    }
  }
  return [best, h];
}

/** Inside the region the road and pads shape the ground (cuttings, embankments, level yards). */
export const MTN_BOUNDS = { x0: 2200, x1: 5300, z0: -6100, z1: -4250 };

/** The mountains' reshaping of the terrain height `h` at (x, z). */
export function mountainShape(x: number, z: number, h: number) {
  if (x < MTN_BOUNDS.x0 || x > MTN_BOUNDS.x1 || z < MTN_BOUNDS.z0 || z > MTN_BOUNDS.z1) return h;
  // The road: a level bed 4 m either side, cut into or built up from the slope.
  for (const line of [MOUNTAIN_ROAD, GLACIER_TRAIL]) {
    const [d, rh] = roadNear(x, z, line);
    if (d < 24) {
      const w = smooth(24, 5, d);
      h = h * (1 - w) + rh * w;
    }
  }
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r + p.blend) continue;
    const level = p.h || roadNear(p.x, p.z)[1];
    const w = smooth(p.r + p.blend, p.r, d);
    h = h * (1 - w) + level * w;
  }
  return h;
}
