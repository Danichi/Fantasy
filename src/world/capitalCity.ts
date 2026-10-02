// The Royal Capital's layout as data (World Expansion phase 8), shared by the
// terrain (the walled pad and its three terraces), the road texture (paved
// streets and squares), the builder and the residents' walking graph.
// Pure data: the height worker imports it.
//
// The city rises in three rings on Crown Hill: the Lower City inside the
// walls (the Plaza of Crowns, the Crown Market, the Temple of the Dawn, the
// Grand Guild, the Silver Lance Commandery, the envoys' quarter, homes), the
// Crown Ring terrace (the Royal Library, the Arcane Collegium, the Chancery,
// the noble houses) and the palace terrace at the top. The Crown Road comes in
// through the East Gate and climbs the Royal Avenue straight to the palace.

export type P2 = [number, number];

/** The walls: an ellipse around CAP_CENTER. */
export const CAP_CENTER: P2 = [-3440, -1060];
export const CAP_RX = 250, CAP_RZ = 215;
/** Crown Hill: the terraces are rings around the palace. */
export const PALACE: P2 = [-3455, -1100];
/** Radii of the Crown Ring terrace and the palace terrace (from PALACE). */
export const RING_R = 125, PALACE_R = 58;
/** Ground heights: the Lower City (at the walls), the Crown Ring, the palace terrace. */
export const LOWER_Y = 7, RING_Y = 15, TOP_Y = 25;

export const EAST_GATE: P2 = [-3190, -1060];
export const SOUTH_GATE: P2 = [-3440, -845];
export const WEST_GATE: P2 = [-3690, -1060];
export const PLAZA: P2 = [-3290, -1070];
export const MARKET: P2 = [-3330, -962];
export const TEMPLE: P2 = [-3440, -912];
export const GUILD: P2 = [-3625, -1036];
export const COMMANDERY: P2 = [-3262, -1170];
export const ENVOYS: P2 = [-3555, -962];
/** The Kingsbridge over the river west of the city, and the riverside quay. */
export const KINGSBRIDGE: P2 = [-4000, -1066];
export const QUAY: P2 = [-3930, -1010];

/** A point on Crown Hill: `r` metres from the palace at angle `a` (radians from east, toward south). */
export const polar = (r: number, a: number): P2 => [PALACE[0] + Math.cos(a) * r, PALACE[1] + Math.sin(a) * r];
// The Crown Ring's great houses stand on its inner half; its street runs round the outer.
export const LIBRARY = polar(82, -0.75);
export const CHANCERY = polar(82, 0.78);
export const NOBLES = polar(82, 2.3);
export const COLLEGIUM = polar(82, -2.55);
export const QUEENS_GARDEN = polar(84, -1.62);
export const RING_STREET_R = 108;

/** Unit direction from the palace out along the Royal Avenue (to the Plaza of Crowns). */
const AV = (() => {
  const dx = PLAZA[0] - PALACE[0], dz = PLAZA[1] - PALACE[1], l = Math.hypot(dx, dz);
  return [dx / l, dz / l] as P2;
})();
const along = (r: number, dir: P2 = AV): P2 => [PALACE[0] + dir[0] * r, PALACE[1] + dir[1] * r];
/** The palace forecourt, where the Royal Avenue ends. */
export const FORECOURT: P2 = along(22);
/** The Royal Avenue's direction (unit), out from the palace. */
export const AVENUE_DIR = AV;

/**
 * Where the terrace banks become ramps: rays out from the palace. The Royal
 * Avenue climbs both banks; the temple way (south) and the west street only
 * the Crown Ring's.
 */
const SOUTH_DIR: P2 = (() => { const dx = TEMPLE[0] - PALACE[0], dz = TEMPLE[1] - PALACE[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
const WEST_DIR: P2 = [-0.985, 0.17];
export const RAMPS: { dir: P2; upper: boolean }[] = [
  { dir: AV, upper: true },
  { dir: SOUTH_DIR, upper: false },
  { dir: WEST_DIR, upper: false },
];

/** Streets (paved): avenues, the ring roads, lanes. The first entries also feed the walking graph. */
export const CAP_STREETS: P2[][] = [
  // The Royal Avenue: East Gate, the Plaza of Crowns, both ramps, the palace forecourt.
  [EAST_GATE, [-3240, -1065], PLAZA, along(125), along(58), FORECOURT],
  // The temple way: South Gate, Temple Square, up to the Crown Ring.
  [SOUTH_GATE, TEMPLE, along(150, SOUTH_DIR), along(100, SOUTH_DIR)],
  // The west street: West Gate past the envoys' quarter up to the Crown Ring.
  [WEST_GATE, [-3630, -1066], along(150, WEST_DIR), along(100, WEST_DIR)],
  // The market street, and on to the temple.
  [PLAZA, [-3306, -1012], MARKET, [-3392, -926], TEMPLE],
  // North from the plaza: the Grand Guild and the Commandery.
  [PLAZA, [-3272, -1118], COMMANDERY],
  // The Lower Ring Road, round the foot of the Crown Ring bank.
  ring(160, -Math.PI, Math.PI, 28),
  // The Crown Ring's own street.
  ring(RING_STREET_R, -Math.PI, Math.PI, 24),
  // Lanes through the Lower City.
  [[-3630, -1066], [-3615, -985], [-3590, -920], [-3520, -880], TEMPLE],
  [MARKET, [-3262, -980], [-3236, -1040]],
  [COMMANDERY, [-3330, -1235], [-3420, -1252], [-3520, -1250], [-3610, -1196], [-3650, -1110]],
];
// (Roads outside the walls, the Kingsbridge Road, Quay Lane and the Queen's
// Road, are in roadData.ts with the rest of the network.)

function ring(r: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push([PALACE[0] + Math.cos(a) * r, PALACE[1] + Math.sin(a) * r]);
  }
  return out;
}

/** Squares paved edge to edge: x, z, radius. */
export const CAP_SQUARES: [number, number, number][] = [
  [PLAZA[0], PLAZA[1], 30],
  [MARKET[0], MARKET[1], 26],
  [TEMPLE[0], TEMPLE[1] - 22, 20],
  [FORECOURT[0], FORECOURT[1], 18],
  [EAST_GATE[0] - 14, EAST_GATE[1], 14],
  [WEST_GATE[0] + 12, WEST_GATE[1], 12],
  [SOUTH_GATE[0], SOUTH_GATE[1] - 12, 12],
];

/** Where no ordinary houses go (landmarks, squares, yards): x, z, radius. */
export const CAP_RESERVED: [number, number, number][] = [
  [PALACE[0], PALACE[1], PALACE_R + 6],
  [PLAZA[0], PLAZA[1], 34],
  [MARKET[0], MARKET[1], 34],
  [TEMPLE[0], TEMPLE[1], 34],
  [GUILD[0], GUILD[1], 22],
  [COMMANDERY[0], COMMANDERY[1], 36],
  [ENVOYS[0], ENVOYS[1], 30],
  [LIBRARY[0], LIBRARY[1], 19],
  [COLLEGIUM[0], COLLEGIUM[1], 19],
  [CHANCERY[0], CHANCERY[1], 18],
  [NOBLES[0], NOBLES[1], 19],
  [QUEENS_GARDEN[0], QUEENS_GARDEN[1], 19],
  [EAST_GATE[0], EAST_GATE[1], 22],
  [WEST_GATE[0], WEST_GATE[1], 18],
  [SOUTH_GATE[0], SOUTH_GATE[1], 18],
  [-3222, -1008, 21], // the Crown Stables, its paddock and the royal coach
  [-3236, -1082, 9], // the Gilded Stag inn
];

/** 0 outside the walls, 1 well inside; distance outside the ellipse in metres when negative-ish. */
export function wallNorm(x: number, z: number) {
  return Math.hypot((x - CAP_CENTER[0]) / CAP_RX, (z - CAP_CENTER[1]) / CAP_RZ);
}

export function insideWalls(x: number, z: number, margin = 0) {
  return wallNorm(x, z) < 1 - margin / Math.min(CAP_RX, CAP_RZ);
}

const sm = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ease = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return 0.6 * t + 0.4 * t * t * (3 - 2 * t);
};

/** Ground height of the city itself at a point (no blending with the land). */
export function capitalGround(x: number, z: number) {
  const dx = x - PALACE[0], dz = z - PALACE[1];
  const r = Math.hypot(dx, dz);
  // The Lower City rises gently toward the hill.
  let h = LOWER_Y + 3 * sm(260, RING_R + 10, r);
  const bank1 = (RING_Y - (LOWER_Y + 3)) * sm(RING_R + 3, RING_R - 3, r);
  const bank2 = (TOP_Y - RING_Y) * sm(PALACE_R + 3, PALACE_R - 3, r);
  let terrace = bank1 + bank2;
  // Ramps: within a few metres of a ramp's ray the banks spread into long slopes.
  for (const { dir, upper } of RAMPS) {
    const t = dx * dir[0] + dz * dir[1];
    if (t < 0) continue;
    const lat = Math.abs(dx * dir[1] - dz * dir[0]);
    const w = sm(9.5, 6.5, lat);
    if (w <= 0) continue;
    // (Mostly linear, eased at the ends: an even climb, never steeper than ~17%.)
    const ramp1 = (RING_Y - (LOWER_Y + 3)) * ease(RING_R + 40, RING_R - 4, t);
    const ramp2 = upper ? (TOP_Y - RING_Y) * ease(PALACE_R + 44, PALACE_R - 26, t) : bank2;
    terrace = terrace + (ramp1 + ramp2 - terrace) * w;
  }
  h += terrace;
  return h;
}

/** Target ground height inside the capital (null outside), with its weight 0..1. */
export function capitalHeight(x: number, z: number): [number, number] | null {
  if (x > -3100 || x < -3760 || z < -1320 || z > -790) return null;
  const n = wallNorm(x, z);
  // Distance outside the wall (approx., metres) and a 34 m apron that blends to the land.
  const out = (n - 1) * Math.min(CAP_RX, CAP_RZ);
  if (out > 34) return null;
  const w = sm(34, 6, out);
  return [capitalGround(x, z), w];
}
