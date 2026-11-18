// The White Mountains' lower holds as plain data (docs/design/mountains.md):
// where Kettle Cove's winch-lift runs, the level pads Copperbrook, Stonegate
// and Frostpeak stand on, and the Dwarf Road that joins them. Plain numbers
// only: the terrain (and its worker) reads the pads and the lift's incline.
//
//   Kettle Cove (sea level, the bay's south shore; an island-style harbour,
//     sea/islandPortsData.ts) --the Great Winch, a 38-degree incline--
//   Copperbrook (300 m, a shelf above the bay) --the Dwarf Road north up the valley--
//   Stonegate (470 m, a fort where the valley narrows beside the Chasm) --
//   the High Shelf (550 to 640 m, west for a kilometre and a half) --
//   Frostpeak Citadel (410 m, a valley head under the peak)

export type P2 = [number, number];

export interface Pad {
  id: string;
  name: string;
  x: number;
  z: number;
  /** level ground out to here... */
  r: number;
  /** ...blending back into the mountain by here */
  blend: number;
  h: number;
}

export const COPPERBROOK: Pad = { id: 'copperbrook', name: 'Copperbrook', x: 4335, z: -4462, r: 52, blend: 26, h: 300 };
export const STONEGATE: Pad = { id: 'stonegate', name: 'Stonegate', x: 4362, z: -4752, r: 24, blend: 30, h: 470 };
export const FROSTPEAK: Pad = { id: 'frostpeak', name: 'Frostpeak Citadel', x: 2412, z: -5440, r: 58, blend: 30, h: 410 };
/** The forecourt of Kettlehold, the lower hold's gate in the cliff north-west of Copperbrook. */
export const KETTLEHOLD: Pad = { id: 'kettlehold', name: 'Kettlehold Gate', x: 4205, z: -4475, r: 16, blend: 14, h: 300 };
export const PADS: Pad[] = [COPPERBROOK, STONEGATE, FROSTPEAK, KETTLEHOLD];

/** The Great Winch: a straight incline from the cove's west end up to Copperbrook's edge. */
export const LIFT = { bottom: [4322, -4038] as P2, bottomH: 3.2, top: [4312, -4408] as P2, topH: 299, half: 3.6 };

/**
 * The Dwarf Road: Copperbrook to Frostpeak, as [x, z, height] knots. The ground
 * is graded to this profile under the road (cut and filled), with switchbacks
 * up the valley's rock step below Stonegate and down into Frostpeak's valley.
 */
export const DWARF_ROAD_K: [number, number, number][] = [
  [4352, -4512, 300], [4300, -4580, 336], [4420, -4640, 382], [4312, -4700, 430], [4362, -4728, 466], [4362, -4778, 472],
  [4372, -4860, 520], [4366, -4960, 550], [4250, -5000, 573], [4050, -4985, 612], [3800, -4962, 615], [3400, -4960, 628],
  [3000, -4972, 630], [2700, -4990, 578], [2560, -5080, 570], [2470, -5200, 512], [2520, -5300, 470], [2430, -5370, 425], [2420, -5395, 410],
];
export const DWARF_ROAD: P2[] = DWARF_ROAD_K.map(([x, z]) => [x, z]);
const ROAD_HALF_W = 3.6, ROAD_BLEND = 9;

/** The cairns along the road: dwarf lanterns on stone, lit against the dark and the blizzard. */
export const CAIRNS: { at: P2; hut?: boolean }[] = [
  { at: [4362, -4640] },
  { at: [4376, -4900], hut: true },
  { at: [4150, -4995] },
  { at: [3900, -4972] },
  { at: [3600, -4952], hut: true },
  { at: [3200, -4958] },
  { at: [2850, -4980], hut: true },
  { at: [2600, -5040] },
  { at: [2475, -5290] },
];

/** The Chasm beside Stonegate: a shaft into the mountain (its floor is far below). */
export const CHASM: P2 = [4172, -4752];

/** The Cold Vein's mouth: the old claim mine in the bank east of Copperbrook (its face looks west, at the village). */
export const COLD_VEIN: { at: P2; yaw: number } = { at: [4420, -4486], yaw: -Math.PI / 2 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to the segment a-b, and how far along it (0..1). */
function segDist(x: number, z: number, a: P2, b: P2): [number, number] {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return [Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)), t];
}

/**
 * The mountains' own ground: the settlement pads, and the winch incline cut
 * straight up the cliff. Applied after the roads have been smoothed.
 */
export function mountainShape(x: number, z: number, h: number): number {
  if (x < 2250 || x > 4500 || z > -3950 || z < -5560) return h;
  // The Great Winch's incline: a straight ramp (cut where the cliff stands proud, filled where it dips).
  {
    const [d, t] = segDist(x, z, LIFT.bottom, LIFT.top);
    if (d < LIFT.half + 10 && t > 0 && t < 1) {
      const line = LIFT.bottomH + (LIFT.topH - LIFT.bottomH) * t;
      const w = smooth(LIFT.half + 10, LIFT.half, d) * smooth(0, 0.03, t) * smooth(1, 0.97, t);
      h = h * (1 - w) + line * w;
    }
  }
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r + p.blend) continue;
    const w = smooth(p.r + p.blend, p.r, d);
    h = h * (1 - w) + p.h * w;
  }
  // The Dwarf Road's graded bed.
  {
    let best = Infinity, bh = 0;
    for (let i = 0; i + 1 < DWARF_ROAD_K.length; i++) {
      const a = DWARF_ROAD_K[i], b = DWARF_ROAD_K[i + 1];
      if (x < Math.min(a[0], b[0]) - 20 || x > Math.max(a[0], b[0]) + 20 || z < Math.min(a[1], b[1]) - 20 || z > Math.max(a[1], b[1]) + 20) continue;
      const [d, t] = segDist(x, z, [a[0], a[1]], [b[0], b[1]]);
      if (d < best) {
        best = d;
        bh = a[2] + (b[2] - a[2]) * t;
      }
    }
    if (best < ROAD_HALF_W + ROAD_BLEND) {
      const w = smooth(ROAD_HALF_W + ROAD_BLEND, ROAD_HALF_W, best);
      h = h * (1 - w) + bh * w;
    }
  }
  return h;
}
