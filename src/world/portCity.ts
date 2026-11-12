// Canonical, worker-safe layout for Port Aurelle. Geometry, terrain, navigation,
// quests, festivals and sailing all consume these anchors. +x is out to sea.
export type P2 = [number, number];
export const PORT_REVISION = 2;
export const CITY_BOUNDS = { x0: 2696, x1: 2968, z0: 18, z1: 340 };
export const CITY_CENTER: P2 = [2826, 176];
export const WEST_GATE: P2 = [2700, 150];
export const MARKET: P2 = [2792, 172];
export const QUAY_X = 2946;
export const CANAL = { x0: 2818, x1: 2968, z: 210, half: 4.2 };
export const NORTH_TERRACE_Z = 112;
export const CITADEL: P2 = [2884, 52];
export const LIGHTHOUSE: P2 = [2960, -18];
export const CAUSEWAY = { x0: 2560, x1: 2700, z: 150, half: 7 };
export const AURELLE = {
  guildHall: [2746, 256],
  academyGate: [2800, 96],
  academyRing: [2822, 84],
  academyWall: [2824, 56],
  fishMarket: [2912, 296],
  forge: [2886, 28],
  berth: [2938, 150],
  stable: [2716, 164],
  thievesDoor: [2873.4, 300],
  dormitory: [2785.7, 96],
  saltyAnchor: [2784, 252],
  drownedLantern: [2880, 300],
  bell: [2904, 176],
  customs: [2912, 184],
  warehouse: [2898, 132],
  sailLoft: [2870, 150],
  drydock: [2928, 46],
  forgeOffice: [2864, 34],
  kitchen: [2892, 326],
  lighthouse: LIGHTHOUSE,
  keeperHouse: [2922, 18],
  memorial: [2938, 190],
  room: [2784, 267],
  wreck: [3006, 352],
  oldCustoms: [2842, 224],
  cistern: [2838, 274],
  quietLanding: [2894, 238],
  garden: [2740, 76],
  apprentice: [2912, 52],
  regatta: [2938, 312],
  arrival: [2710, 150],
  marketBoard: [2772, 190],
  tradeBoard: [2928, 174],
  fishAuction: [2924, 296],
  hoist: [2938, 116],
  cadetCourt: [2822, 84],
  signalRoom: [2960, -18],
  lens: [2960, -18],
} satisfies Record<string, P2>;
export const PORT_BERTHS: [number, number, number][] = [
  [2964, 108, Math.PI / 2],
  [2968, 156, Math.PI / 2],
  [2965, 260, Math.PI / 2],
  [2962, 296, Math.PI / 2],
  [2972, 316, Math.PI / 2],
];
/** Four working piers, then spaced offshore moorings for larger saved fleets. */
export function portOwnedBerth(index: number): [number, number, number] {
  if (index < PORT_BERTHS.length - 1) return PORT_BERTHS[index];
  const extra = index - (PORT_BERTHS.length - 1);
  return [
    3035 + Math.floor(extra / 5) * 50,
    70 + (extra % 5) * 50,
    Math.PI / 2,
  ];
}
export const PORT_LANDING: P2 = [2938, 196];
export const PORT_DISTRICTS = [
  {
    id: 'westgate',
    name: 'Westgate & Caravan Court',
    at: [2720, 166] as P2,
    radius: 40,
    description:
      'The King’s Road ends amid coach bells, pack horses and travellers with salt on their cloaks.',
  },
  {
    id: 'exchange',
    name: 'The Grand Exchange',
    at: MARKET,
    radius: 48,
    description:
      'An open-air exchange of island spices, painted cloth and stories brought home by sea.',
  },
  {
    id: 'academy',
    name: 'Academy Heights',
    at: [2808, 76] as P2,
    radius: 46,
    description:
      'Gale, Boundary and Cross. Three schools above one sea. The city’s finest blades train here.',
  },
  {
    id: 'crown',
    name: 'Crown Heights',
    at: CITADEL,
    radius: 42,
    description:
      'Sea-facing gardens shelter the families whose signatures move fleets.',
  },
  {
    id: 'quays',
    name: 'The Great Quays',
    at: [2936, 152] as P2,
    radius: 55,
    description:
      'The harbour bell counts arrivals. Every crate has a mark, and every mark has an owner.',
  },
  {
    id: 'netters',
    name: 'Netters’ Reach',
    at: [2912, 308] as P2,
    radius: 40,
    description:
      'Fishing families share nets, supper and news of the boats that have not come home.',
  },
  {
    id: 'forgewater',
    name: 'Forgewater',
    at: [2886, 30] as P2,
    radius: 40,
    description:
      'Hammers, sawn oak and hot copper: here the city builds the things that carry it abroad.',
  },
  {
    id: 'lantern',
    name: 'Lantern Ward',
    at: [2860, 276] as P2,
    radius: 48,
    description:
      'Rooms above rooms, bridges above old water. At dusk the ward earns its name.',
  },
] as const;
/** The scalloped quay forms an outer commercial basin and an inner fishing basin. */
export function quayAt(z: number) {
  return (
    QUAY_X -
    15 * Math.exp(-(((z - 110) / 50) ** 2)) -
    9 * Math.exp(-(((z - 286) / 36) ** 2)) +
    14 * Math.exp(-(((z - 200) / 27) ** 2))
  );
}
export const CITY_STREETS: P2[][] = [
  [
    [2560, 150],
    [2700, 150],
    [2734, 150],
    [2762, 160],
    MARKET,
    [2840, 176],
    [2904, 176],
    [2940, 176],
  ],
  [MARKET, [2795, 132], [2800, 104]],
  [
    [2714, 96],
    [2754, 100],
    [2800, 104],
    [2850, 96],
    [2900, 90],
  ],
  [
    [2900, 90],
    [2896, 72],
    [2884, 66],
  ],
  [
    [2920, 34],
    [2920, 82],
    [2928, 120],
    [2934, 176],
    [2942, 198],
    [2928, 238],
    [2932, 280],
    [2938, 320],
  ],
  [MARKET, [2782, 206], [2784, 232], [2800, 236], [2800, 270], [2800, 316]],
  [
    [2716, 284],
    [2760, 288],
    [2800, 282],
    [2848, 288],
    [2880, 288],
    [2916, 288],
    [2932, 280],
  ],
  [
    [2716, 230],
    [2746, 226],
    [2790, 232],
    [2848, 232],
    [2860, 238],
    [2894, 238],
    [2928, 238],
  ],
  [
    [2714, 96],
    [2712, 150],
    [2716, 230],
    [2716, 284],
  ],
  [
    [2900, 90],
    [2910, 52],
    [2922, 18],
    [2940, 4],
    [2960, -18],
  ],
  [
    [2840, 176],
    [2840, 194],
    [2840, 226],
    [2848, 232],
  ],
  [
    [2886, 176],
    [2886, 196],
    [2886, 224],
    [2894, 238],
  ],
  [
    [2848, 232],
    [2840, 260],
    [2848, 288],
    [2873, 300],
    [2912, 308],
    [2938, 320],
  ],
  [
    [2800, 316],
    [2848, 320],
    [2892, 326],
    [2938, 320],
  ],
  [
    [2850, 96],
    [2852, 58],
    [2864, 34],
    [2886, 28],
    [2920, 34],
  ],
  [
    [2762, 160],
    [2752, 184],
    [2734, 194],
    [2712, 150],
  ],
  [
    [2790, 232],
    [2808, 250],
    [2820, 260],
    [2840, 260],
  ],
  [
    [2746, 226],
    [2746, 256],
    [2760, 272],
    [2796, 270],
  ],
  [
    [2832, 201],
    [2840, 201],
    [2886, 201],
    [2934, 201],
  ],
];
export const CITY_RESERVED: [number, number, number][] = [
  [2792, 172, 29],
  [2806, 70, 39],
  [2822, 84, 23],
  [2884, 52, 25],
  [2746, 244, 19],
  [2784, 252, 14],
  [2886, 28, 18],
  [2928, 46, 22],
  [2912, 308, 24],
  [2898, 132, 16],
  [2912, 184, 13],
  [2740, 70, 16],
  [2760, 56, 14],
  [2700, 150, 18],
  [2880, 300, 11],
  [2870, 150, 12],
  [2892, 326, 13],
  [2842, 224, 11],
  [2838, 274, 13],
  [2922, 18, 12],
];
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function cityHeight(x: number, z: number): [number, number] | null {
  if (x > CAUSEWAY.x0 - 20 && x < CAUSEWAY.x1 + 4 && Math.abs(z - 150) < 15) {
    const w = smooth(15, 7, Math.abs(z - 150)) * smooth(2540, 2560, x);
    if (w > 0) return [1.5, w];
  }
  // One continuous, walkable breakwater to the lighthouse.
  const moleZ = Math.max(-18, Math.min(18, z)),
    moleX = 2922 + ((18 - moleZ) * 38) / 36;
  const mole = z >= -26 && z <= 26 && Math.abs(x - moleX) < 9;
  const quay = quayAt(z);
  if (!mole && z > 18 && z < 352 && x > quay + 2 && x < 3060)
    return [
      -4.8,
      smooth(3060, 3030, x) * smooth(18, 32, z) * smooth(352, 338, z),
    ];
  const b = CITY_BOUNDS,
    dx = Math.max(b.x0 - x, 0, x - Math.min(b.x1, quay)),
    dz = Math.max(b.z0 - z, 0, z - b.z1),
    out = Math.hypot(dx, dz);
  if (out > 14 && !mole) return null;
  let h = 1.6 + 5 * smooth(124, 104, z);
  // Public routes climb gradually; the terrace edges retain their silhouette.
  const rampX = 2795 + ((132 - z) * 5) / 28;
  const ramp =
    smooth(11, 5, Math.abs(x - rampX)) *
    smooth(151, 141, z) *
    smooth(94, 102, z);
  h += (1.6 + 5 * smooth(145, 102, z) - h) * ramp;
  // Eastern ramp down to the quay and shipyards.
  h += (1.6 - h) * smooth(2894, 2924, x);
  h += 5 * smooth(28, 15, Math.hypot(x - 2884, z - 52));
  if (x > quay - 6) h = Math.min(h, 1.15);
  if (x > CANAL.x0 && Math.abs(z - CANAL.z) < CANAL.half) h = -2.8;
  if (mole) h = 1.4;
  return [h, mole ? 1 : smooth(14, 0, out)];
}
