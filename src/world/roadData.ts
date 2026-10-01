// The road network as data (World Expansion phase 4, prompt §18 and §42).
// Pure data so the height worker can import it: each road is a polyline in
// world metres with a type. Terrain flattens under every road, the terrain
// shader paints them (dirt, with cobbles near towns), trees and grass keep
// off them, and the map draws them.
//
//   kings  the King's Road: wide, packed dirt, cobbled through towns
//   lane   farm lanes and branch roads
//   trail  footpaths and spur trails (narrow, rough)

export type RoadKind = 'kings' | 'lane' | 'trail';
export type P2 = [number, number];

export interface RoadSpec {
  id: string;
  name: string;
  kind: RoadKind;
  pts: P2[];
  /** where the road is closed for now (a later phase opens it) */
  gate?: { at: P2; reason: string };
}

const TOWN_R = 110;
const BRIDGE: P2 = [157.7, 22]; // over the Elder Glen river (x follows riverX at z = 22)

export const ROAD_SPECS: RoadSpec[] = [
  {
    id: 'south', name: 'The Meadow Lane', kind: 'lane',
    pts: [[0, TOWN_R - 6], [0, 130], [-14, 210], [-8, 320], [12, 500], [48, 760], [120, 1100], [210, 1500], [280, 1900], [300, 2300]],
    gate: { at: [48, 760], reason: 'The ford at Willowbrook is flooded. The Southern Marches will have to wait.' },
  },
  {
    id: 'crypt', name: 'The Crypt Road', kind: 'lane',
    pts: [[0, -TOWN_R + 6], [6, -150], [-8, -225], [0, -300]],
  },
  {
    id: 'kings', name: 'The King\'s Road', kind: 'kings',
    pts: [[TOWN_R - 6, 0], [120, 4], BRIDGE, [230, 22], [300, 56], [360, 70], [520, 88], [760, 110], [1050, 124], [1380, 118], [1700, 130], [1960, 150], [2230, 152], [2690, 150]],
  },
  {
    id: 'west', name: 'The Logging Road', kind: 'lane',
    pts: [[-TOWN_R + 6, 0], [-145, 8], [-230, 80], [-320, 118]],
  },
  {
    // Continues the logging road west and north-west toward the Royal Capital.
    id: 'capital', name: 'The Crown Road', kind: 'kings',
    pts: [[-320, 118], [-480, 104], [-700, 60], [-960, -10], [-1250, -120], [-1600, -300], [-2000, -520], [-2450, -720], [-2900, -900], [-3300, -1000]],
    gate: { at: [-960, -10], reason: 'By order of the Crown, the capital road is closed to unregistered travellers. Earn your Academy registration in Port Aurelle first.' },
  },
  {
    // The northern forest road toward the elven woods.
    id: 'forest', name: 'The Greenwood Road', kind: 'lane',
    pts: [[0, -300], [-20, -380], [-70, -520], [-160, -700], [-300, -900], [-520, -1150], [-900, -1500], [-1500, -2000], [-2100, -2500], [-2800, -3000]],
    gate: { at: [-160, -700], reason: 'An elven marker stone stands across the road: none pass into the Verdant Woods without a guide.' },
  },
  {
    // Off the logging road, south through the fields into the dead wood.
    id: 'gravewood', name: 'The Gravewood Trail', kind: 'trail',
    pts: [[-230, 80], [-252, 142], [-292, 206], [-324, 262], [-338, 296], [-340, 306]],
  },
  {
    // Spur trails off the King's Road.
    id: 'camp', name: 'The Lantern Camp Trail', kind: 'trail',
    pts: [[1050, 124], [1060, 90], [1070, 52]],
  },
  {
    id: 'hollow', name: 'The Hollow Ridge Trail', kind: 'trail',
    pts: [[1880, 142], [1890, 60], [1905, -40], [1930, -120], [1950, -170]],
  },
  {
    id: 'overlook', name: 'Gull Ridge Path', kind: 'trail',
    pts: [[2210, 152], [2222, 132], [2232, 112]],
  },
  {
    // North off the King's Road to the Old King's Road Mine.
    id: 'mine', name: 'The Old Mine Track', kind: 'trail',
    pts: [[336, 64], [334, 34], [331, 4], [330, -21]],
  },
  {
    id: 'chapel', name: 'Chapel Lane', kind: 'lane',
    pts: [[640, 99], [650, 140], [668, 176]],
  },
];

export const ROAD_POLYS: P2[][] = ROAD_SPECS.map((r) => r.pts);

/** Half-widths (metres) of the travelled surface by kind. */
export const ROAD_HALF: Record<RoadKind, number> = { kings: 3.2, lane: 2.2, trail: 1.2 };

/** Cobbled stretches: near towns and bridges (x, z, radius). */
export const COBBLE_ZONES: [number, number, number][] = [
  [140, 12, 60], // Elder Glen's east gate and the stone bridge
  [1380, 130, 70], // the Wayfarer's Rest
  [2690, 150, 150], // Port Aurelle's West Gate
];

/** Millbrook Brook: a creek from the northern hills, under the King's Road's wooden bridge, into Millbrook Mere. */
export const CREEK: P2[] = [[1650, -430], [1630, -300], [1595, -160], [1572, -40], [1560, 60], [1556, 124], [1536, 150], [1512, 168]];
export const CREEK_BRIDGE: P2 = [1556, 124];
