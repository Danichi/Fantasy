import { DUNE_N, DUNE_SPAN, DUNE_RANGE, DUNE_B64 } from '../data/duneTile';
import { macroHeight, macroReady } from '../worldMap';

// The Golden Expanse's layout as pure data (the terrain worker imports it):
// Sunspire, the walled capital of the Sunborn on the map's star; the
// scavenger camps pushed out into the dunes around it; the caravan road in
// from the Crown Road; and the dune field itself (the Sand Dunes model's
// shape, tiled across the sand and blended so its edges never show).

/** Sunspire's centre (the map's city star) and its walled footprint, in metres. */
export const SUNSPIRE = { x: -5830, z: 700 };
/** Model units to metres (the Egyptian City model is ~13,600 units across). */
export const SUNSPIRE_SCALE = 0.06;
/** The east gate's passage (from the street map): where the caravan road arrives. */
export const SUNSPIRE_GATE_Z = SUNSPIRE.z - 21.3;
/** Half-extents of the levelled pad under the city (covers the outer walls). */
export const SUNSPIRE_HALF = { x: 430, z: 390 };
/** Ground level of the city pad: the macro terrain at its centre, raised a little above the sand. */
let cityY: number | null = null;
export function sunspireY() {
  if (cityY !== null) return cityY;
  const y = Math.max(4, macroHeight(SUNSPIRE.x, SUNSPIRE.z)) + 2;
  if (macroReady()) cityY = y;
  return y;
}

/** Scavenger camps outside the walls: [x, z, radius]. Each gets a small levelled hollow. */
export const SCAV_CAMPS: [number, number, number][] = [
  [SUNSPIRE.x + 560, SUNSPIRE.z - 250, 30], // the Rust Market, by the caravan road
  [SUNSPIRE.x + 520, SUNSPIRE.z + 330, 26], // Glasswind
  [SUNSPIRE.x - 120, SUNSPIRE.z + 560, 28], // the Bone Wells
  [SUNSPIRE.x - 600, SUNSPIRE.z + 120, 24], // Saltreach
  [SUNSPIRE.x + 40, SUNSPIRE.z - 560, 26], // the Hulks (a ring of wrecked sand-skiffs)
  [SUNSPIRE.x + 1500, SUNSPIRE.z - 70, 22], // the Waystop: last water before the city
];

/** The caravan road from the Crown Road (before its gate) to Sunspire's east gate. */
export const CARAVAN_ROAD: [number, number][] = [
  [-700, 60], [-1050, 150], [-1500, 260], [-2000, 380], [-2600, 480], [-3200, 560], [-3800, 620], [-4400, 660], [-4900, 690], [-5250, 684], [-5390, 679],
];

// ---- dunes ----------------------------------------------------------------------------------------------

let tile: Float32Array | null = null;
function duneTile() {
  if (tile) return tile;
  const bin = atob(DUNE_B64);
  tile = new Float32Array(DUNE_N * DUNE_N);
  for (let i = 0; i < tile.length; i++) tile[i] = bin.charCodeAt(i) / 255;
  return tile;
}

/** Bilinear lookup in the dune tile at tile coordinates (0..1 wraps). */
function lookup(u: number, v: number) {
  const t = duneTile();
  const fx = (u - Math.floor(u)) * (DUNE_N - 1), fz = (v - Math.floor(v)) * (DUNE_N - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const a = fx - ix, b = fz - iz;
  const i1 = Math.min(DUNE_N - 1, ix + 1), j1 = Math.min(DUNE_N - 1, iz + 1);
  return (t[iz * DUNE_N + ix] * (1 - a) + t[iz * DUNE_N + i1] * a) * (1 - b) + (t[j1 * DUNE_N + ix] * (1 - a) + t[j1 * DUNE_N + i1] * a) * b;
}

/** The dune tile scaled up, sampled twice half a tile apart and blended so neither copy's edges show. 0..1. */
export function duneShape(x: number, z: number, span = DUNE_SPAN * 3) {
  const u = x / span, v = z / span;
  const w = (t: number) => {
    const s = Math.sin(Math.PI * (t - Math.floor(t)));
    return s * s;
  };
  const wa = w(u) * w(v) + 1e-4, wb = w(u + 0.5) * w(v + 0.5) + 1e-4;
  return (lookup(u, v) * wa + lookup(u + 0.5, v + 0.5) * wb) / (wa + wb);
}

/** Metres of dune relief per unit of the tile (the model's 9.6 m range, tripled with the tile). */
export const DUNE_HEIGHT = DUNE_RANGE * 2.4;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much of the city pad applies here (1 inside, easing to 0 over 60 m outside). */
export function sunspirePad(x: number, z: number) {
  const dx = Math.abs(x - SUNSPIRE.x) - SUNSPIRE_HALF.x, dz = Math.abs(z - SUNSPIRE.z) - SUNSPIRE_HALF.z;
  const d = Math.max(dx, dz);
  return smooth(60, 0, d);
}

/**
 * Desert shaping on top of the macro terrain: the dune tile where the map
 * paints sand (weight from the caller), the city pad, and hollows for camps.
 */
export function shapeDesert(x: number, z: number, h: number, sand: number) {
  if (sand > 0.02) h += (duneShape(x, z) - 0.35) * DUNE_HEIGHT * sand;
  for (const [cx, cz, r] of SCAV_CAMPS) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < r + 30) {
      const t = smooth(r + 30, r * 0.6, d);
      const floor = campFloor(cx, cz);
      h = h * (1 - t) + floor * t;
    }
  }
  const pad = sunspirePad(x, z);
  if (pad > 0) h = h * (1 - pad) + (sunspireY() - 0.15) * pad;
  return h;
}

/** Camp floors: the macro terrain at each camp's centre (cached once the map has loaded). */
const campFloors = new Map<string, number>();
export function campFloor(cx: number, cz: number) {
  const k = cx + ',' + cz;
  const got = campFloors.get(k);
  if (got !== undefined) return got;
  const y = Math.max(2, macroHeight(cx, cz));
  if (macroReady()) campFloors.set(k, y);
  return y;
}
