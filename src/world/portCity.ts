// Port Aurelle's layout as data (World Expansion phase 5), shared by the
// terrain (the city pad, terraces, the canal and the causeway), the road
// texture (cobbled streets), the builder and the residents' walking graph.
// Pure data: the height worker imports it.

export type P2 = [number, number];

/** The city footprint: a rounded rectangle on the peninsula. */
export const CITY_BOUNDS = { x0: 2696, x1: 2952, z0: 22, z1: 330 };
export const CITY_CENTER: P2 = [2826, 176];
export const WEST_GATE: P2 = [2700, 150];
export const MARKET: P2 = [2792, 172];
export const QUAY_X = 2946;
export const CANAL = { x0: 2834, x1: 2960, z: 204, half: 3.6 };
export const NORTH_TERRACE_Z = 112;
export const CITADEL: P2 = [2884, 52];
export const LIGHTHOUSE: P2 = [2930, -18];
export const CAUSEWAY = { x0: 2560, x1: 2700, z: 150, half: 7 };

/** Streets (cobbled): the grand avenue, the ramps, the harbour front, the lanes. */
export const CITY_STREETS: P2[][] = [
  [[2560, 150], [2700, 150], [2770, 164], [2792, 172], [2860, 176], [2944, 176]], // causeway, West Gate, avenue to the harbour
  [[2792, 172], [2795, 132], [2800, 104]], // up to the Academy gate
  [[2712, 96], [2800, 100], [2900, 90]], // the upper street (noble district, Academy, citadel)
  [[2900, 90], [2890, 66]], // citadel ramp
  [[2940, 40], [2940, 320]], // harbour front
  [[2792, 172], [2792, 262], [2800, 312]], // south street
  [[2716, 284], [2936, 288]], // lower city lane
  [[2716, 230], [2862, 226]], // guild lane
  [[2712, 112], [2712, 304]], // the inner west street (behind the wall)
  [[2900, 90], [2918, 40], [2930, -12]], // the mole to the lighthouse
];

/** Where no ordinary houses go (landmarks, plazas, yards): x, z, radius. */
export const CITY_RESERVED: [number, number, number][] = [
  [MARKET[0], MARKET[1], 26], // Grand Market
  [2806, 70, 34], [2830, 80, 22], // Knight's Academy
  [CITADEL[0], CITADEL[1], 30],
  [2746, 244, 20], // Adventurer's Guild hall
  [2784, 252, 10], // the Salty Anchor
  [2736, 306, 16], // Dwarven Quarter forge yard
  [2926, 300, 24], // Fisherman's Wharf
  [2912, 130, 16], [2912, 236, 16], // warehouses
  [2740, 70, 16], [2760, 56, 14], // noble gardens
  [2700, 150, 16], // West Gate
];

/** Target ground height inside the city (null outside), with its weight 0..1. */
export function cityHeight(x: number, z: number): [number, number] | null {
  const sm = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // The causeway across the inlet.
  if (x > CAUSEWAY.x0 - 20 && x < CAUSEWAY.x1 + 4 && Math.abs(z - CAUSEWAY.z) < CAUSEWAY.half + 8) {
    const w = sm(CAUSEWAY.half + 8, CAUSEWAY.half, Math.abs(z - CAUSEWAY.z)) * sm(CAUSEWAY.x0 - 20, CAUSEWAY.x0, x);
    if (w > 0) return [1.5, w];
  }
  // The harbour is dredged deep right up to the quay wall.
  if (x > QUAY_X + 2.4 && x < QUAY_X + 70 && z > 36 && z < 326) return [-3.6, sm(QUAY_X + 70, QUAY_X + 45, x) * sm(36, 50, z) * sm(326, 312, z)];
  const b = CITY_BOUNDS;
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  const out = Math.hypot(dx, dz);
  // The lighthouse mole runs out north-east of the city.
  const mole = Math.abs(x - 2922) < 8 && z > -30 && z < 40 ? 1 : 0;
  if (out > 14 && !mole) return null;
  const w = mole ? 1 : sm(14, 0, out);
  let h = 1.6;
  // The north terrace: the Academy, the noble district and the citadel.
  h += 5 * sm(NORTH_TERRACE_Z + 6, NORTH_TERRACE_Z - 6, z);
  h += 7 * sm(34, 14, Math.hypot(x - CITADEL[0], z - CITADEL[1]));
  // Quays step down to the water on the east side.
  if (x > QUAY_X - 2) h = Math.min(h, 1.0);
  // The canal from the harbour into the lower city (stone walls and water are meshes).
  if (x > CANAL.x0 && Math.abs(z - CANAL.z) < CANAL.half) h = -2.6;
  if (mole) h = 1.2;
  return [h, w];
}
