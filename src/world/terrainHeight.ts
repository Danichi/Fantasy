import * as THREE from 'three';
import { fbm, smoothstep, clamp } from '../core/math';
import { macroHeight, macroElevAt, reliefAt, RELIEF, SEA_LEVEL } from './worldMap';

// ---------------------------------------------------------------------------
// Terrain heights for the whole world (pure: no rendering, no physics, so the
// tile worker can run it too).
//
//   Elder Glen      the authored 1 km around the origin: town, roads, the
//                   crypt hills, the river. Blended into the macro world
//                   between LOCAL_R0 and LOCAL_R1.
//   The continent   macro heights from the painted world map (worldMap.ts).
//
// heightAt() reads the local 2 m grid near the origin and 256 m height tiles
// (2 m samples) elsewhere; tiles are filled by the tile worker ahead of the
// player, or generated on the spot if something asks early.
// ---------------------------------------------------------------------------
export const WORLD_SIZE = 1024;
export const TERRAIN_SIZE = WORLD_SIZE; // alias used by the grass and splat maps
export const PLAZA_CENTER = new THREE.Vector2(0, -4);
export const PLAZA_R = 12;
export const TOWN_R = 110;
export const PALISADE_R = TOWN_R;
export const GATES = {
  south: new THREE.Vector2(0, TOWN_R),
  north: new THREE.Vector2(0, -TOWN_R),
  east: new THREE.Vector2(TOWN_R, 0),
  west: new THREE.Vector2(-TOWN_R, 0),
};
export const RIVER_LEVEL = -0.6;
export const CRYPT = new THREE.Vector2(0, -318); // entrance in the hillside
export const BRIDGE = new THREE.Vector2(0, 6); // x filled in from the river below
/** Port Aurelle (formerly Tremison): the great port city on the eastern coast. */
export const PORT_AURELLE = new THREE.Vector2(2760, 150);
export const PORT_HARBOR = new THREE.Vector2(2940, 150);
/** Authored Elder Glen terrain blends into the macro world between these radii. */
export const LOCAL_R0 = 780, LOCAL_R1 = 1400;

export function riverX(z: number) {
  return 158 + Math.sin(z / 95) * 24 + Math.sin(z / 37 + 1.3) * 7;
}
BRIDGE.x = riverX(BRIDGE.y);

type P = [number, number];
const ROADS: P[][] = [
  // south gate to the meadows and beyond
  [[0, TOWN_R - 6], [0, 130], [-14, 210], [-8, 320], [12, 500]],
  // north gate up the valley to the crypt
  [[0, -TOWN_R + 6], [6, -150], [-8, -225], [0, -300]],
  // east gate over the bridge: the King's Road to Port Aurelle (phase 4 replaces this with the road network)
  [[TOWN_R - 6, 0], [120, 4], [BRIDGE.x, BRIDGE.y], [230, 22], [300, 56], [360, 70], [520, 88], [760, 110], [1050, 124], [1380, 118], [1700, 130], [1960, 150], [2230, 152], [2690, 150]],
  // west gate into the forest logging road
  [[-TOWN_R + 6, 0], [-145, 8], [-230, 80], [-320, 118]],
];
/** Road polylines in world metres (maps draw these). */
export const ROAD_LINES: readonly (readonly [number, number])[][] = ROADS;
const STREETS: P[][] = [
  [[0, -4], [0, TOWN_R - 6]],
  [[0, -4], [0, -TOWN_R + 6]],
  [[0, -4], [TOWN_R - 6, 0]],
  [[0, -4], [-TOWN_R + 6, 0]],
  [[-55, -40], [55, -40]],
  [[-60, -5], [60, -5]],
  [[-55, 28], [55, 28]],
  [[-28, -60], [-28, 55]],
  [[28, -60], [28, 55]],
  [[-55, 55], [55, 55]],
];

function segDist(px: number, pz: number, a: P, b: P) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t);
}
// Segment bounding boxes (padded 40 m) so far-away segments are skipped cheaply.
const bboxCache = new Map<P[][], [number, number, number, number, P, P][]>();
function polyDist(px: number, pz: number, lines: P[][]) {
  let segs = bboxCache.get(lines);
  if (!segs) {
    segs = [];
    for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
      const a = l[i], b = l[i + 1];
      segs.push([Math.min(a[0], b[0]) - 40, Math.max(a[0], b[0]) + 40, Math.min(a[1], b[1]) - 40, Math.max(a[1], b[1]) + 40, a, b]);
    }
    bboxCache.set(lines, segs);
  }
  let d = 1e9;
  for (const [x0, x1, z0, z1, a, b] of segs) {
    if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
    d = Math.min(d, segDist(px, pz, a, b));
  }
  return d;
}
export function roadDist(x: number, z: number) {
  return polyDist(x, z, ROADS);
}
export function streetDist(x: number, z: number) {
  return polyDist(x, z, STREETS);
}

/** The procedural height function (slow). Use heightAt() at runtime. */
/** Rolling countryside plus the town rise, with roads smoothed into it. */
function lowlandAt(x: number, z: number) {
  const r = Math.hypot(x, z);
  let h = (fbm(x / 110 + 3.1, z / 110 - 7.7, 4) - 0.5) * 12 + (fbm(x / 32, z / 32, 3) - 0.5) * 2.2;
  const town = smoothstep(TOWN_R + 35, TOWN_R - 5, r);
  h = h * (1 - town * 0.88) + town * 0.4;
  // Roads flatten the small bumps (before the hills, so roads climb them).
  const road = smoothstep(9, 2.5, roadDist(x, z));
  return h * (1 - road * 0.55);
}
function hillsAt(x: number, z: number) {
  const north = smoothstep(-170, -330, z);
  return north * (18 + 22 * fbm(x / 70, z / 70, 3));
}
// The crypt sits on a shelf at the natural hillside height.
let terraceH: number | null = null;

/** Authored Elder Glen heights (slow). Use heightAt() at runtime. */
function localHeight(x: number, z: number) {
  let h = lowlandAt(x, z) + hillsAt(x, z);
  // Shelf in front of the crypt entrance, and a steep face behind it.
  const tx = CRYPT.x, tz = CRYPT.y + 20;
  terraceH ??= lowlandAt(tx, tz) + hillsAt(tx, tz);
  const shelf = smoothstep(28, 13, Math.hypot(x - tx, z - tz));
  h = h * (1 - shelf) + (terraceH + (fbm(x / 20, z / 20, 2) - 0.5) * 0.8) * shelf;
  const cd = Math.hypot(x - CRYPT.x, (z - CRYPT.y) * 0.8);
  // Rises behind the facade (which sits at CRYPT.y + 3), level in front of it.
  h += smoothstep(CRYPT.y + 0.5, CRYPT.y - 5, z) * smoothstep(26, 7, cd) * 9;
  // River: banks above the water, channel carved below it.
  const dr = Math.abs(x - riverX(z));
  // The river rises from springs in the northern and southern foothills.
  const riverFade = 1 - smoothstep(360, 420, Math.abs(z));
  const nearRiver = smoothstep(40, 14, dr) * riverFade;
  h = Math.max(h, RIVER_LEVEL + 1.2) * nearRiver + h * (1 - nearRiver);
  const channel = smoothstep(13, 5, dr) * riverFade;
  // About a metre deep: wadeable, slowly.
  h = h * (1 - channel) + (RIVER_LEVEL - 1.1 + (dr / 5) * 0.45) * channel;
  return h;
}

/** World height: Elder Glen's authored terrain melting into the continent. */
export function worldHeightFn(x: number, z: number) {
  const r = Math.hypot(x, z);
  let h: number;
  if (r <= LOCAL_R0) h = localHeight(x, z);
  else if (r >= LOCAL_R1) h = macroHeight(x, z);
  else {
    const t = smoothstep(LOCAL_R0, LOCAL_R1, r);
    h = localHeight(x, z) * (1 - t) + macroHeight(x, z) * t;
  }
  // Land (per the map) never sinks below the sea; the river keeps its channel.
  if (h < SEA_LEVEL + 0.6 && macroElevAt(x, z) > SEA_LEVEL + 0.3 && Math.abs(x - riverX(z)) > 16) {
    h = SEA_LEVEL + 0.6 - (SEA_LEVEL + 0.6 - h) * 0.12;
  }
  // Roads keep a gentle grade outside town too.
  if (r > LOCAL_R0 * 0.8) {
    const rd = roadDist(x, z);
    if (rd < 14) {
      const w = smoothstep(14, 4, rd);
      const smooth = macroSmooth(x, z, r);
      h = h * (1 - w * 0.7) + smooth * w * 0.7;
    }
  }
  return h;
}
/** A low-pass version of the terrain under roads (average of a wide cross). */
function macroSmooth(x: number, z: number, r: number) {
  const f = (xx: number, zz: number) => (r < LOCAL_R1 ? localHeight(xx, zz) * (1 - smoothstep(LOCAL_R0, LOCAL_R1, r)) + macroHeight(xx, zz) * smoothstep(LOCAL_R0, LOCAL_R1, r) : macroHeight(xx, zz));
  return (f(x, z) * 2 + f(x + 12, z) + f(x - 12, z) + f(x, z + 12) + f(x, z - 12)) / 6;
}

// ---- height grid ------------------------------------------------------------
const HSTEP = 2; // metres between height samples (bilinear in between)
const GRID = WORLD_SIZE / HSTEP + 1;
let heights: Float32Array | null = null;

/** Build the 1 m height grid (about half a second). Call once at startup. */
export function initTerrainData() {
  heights = new Float32Array(GRID * GRID);
  const H = WORLD_SIZE / 2;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) heights[j * GRID + i] = worldHeightFn(i * HSTEP - H, j * HSTEP - H);
  }
}

/**
 * Somewhere other than the overworld (a dungeon instance) can claim ground
 * height for its own region; it returns null outside that region.
 */
let groundOverride: ((x: number, z: number) => number | null) | null = null;
export function setGroundOverride(fn: typeof groundOverride) {
  groundOverride = fn;
}

export function heightAt(x: number, z: number) {
  if (groundOverride) {
    const g = groundOverride(x, z);
    if (g !== null) return g;
  }
  const H = WORLD_SIZE / 2;
  if (heights && Math.abs(x) < H - 1 && Math.abs(z) < H - 1) {
    const fx = (x + H) / HSTEP, fz = (z + H) / HSTEP;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const a = heights[j * GRID + i], b = heights[j * GRID + i + 1];
    const c = heights[(j + 1) * GRID + i], d = heights[(j + 1) * GRID + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  return tileHeightAt(x, z);
}

// ---- height tiles (the rest of the world) -------------------------------------
/** Height tiles: 256 m square, 2 m samples (129 x 129), filled ahead of the player. */
export const TILE = 256, TILE_SEG = 128, TILE_STEP = TILE / TILE_SEG, TILE_N = TILE_SEG + 1;
const tiles = new Map<number, Float32Array>();
const MAX_TILES = 700; // ~46 MB worst case; far below that in practice
export const tileKey = (i: number, j: number) => (i + 2048) * 4096 + (j + 2048);

/** Compute one tile's heights (the tile worker runs this too). */
export function computeTile(i: number, j: number) {
  const out = new Float32Array(TILE_N * TILE_N);
  const x0 = i * TILE, z0 = j * TILE;
  for (let b = 0; b < TILE_N; b++) for (let a = 0; a < TILE_N; a++) out[b * TILE_N + a] = worldHeightFn(x0 + a * TILE_STEP, z0 + b * TILE_STEP);
  return out;
}
export function hasTile(i: number, j: number) {
  return tiles.has(tileKey(i, j));
}
export function putTile(i: number, j: number, data: Float32Array) {
  if (tiles.size >= MAX_TILES) {
    // Drop the oldest entries (Map keeps insertion order).
    let n = 64;
    for (const k of tiles.keys()) {
      tiles.delete(k);
      if (--n <= 0) break;
    }
  }
  tiles.set(tileKey(i, j), data);
}
export function tileData(i: number, j: number) {
  const k = tileKey(i, j);
  let t = tiles.get(k);
  if (!t) {
    t = computeTile(i, j); // on-the-spot fallback; the worker normally got here first
    putTile(i, j, t);
  }
  return t;
}
function tileHeightAt(x: number, z: number) {
  const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
  const t = tileData(i, j);
  const fx = (x - i * TILE) / TILE_STEP, fz = (z - j * TILE) / TILE_STEP;
  const a0 = Math.min(TILE_SEG - 1, Math.floor(fx)), b0 = Math.min(TILE_SEG - 1, Math.floor(fz));
  const u = fx - a0, v = fz - b0;
  const p = b0 * TILE_N + a0;
  return (t[p] * (1 - u) + t[p + 1] * u) * (1 - v) + (t[p + TILE_N] * (1 - u) + t[p + TILE_N + 1] * u) * v;
}

/** Elder Glen's heights as a half-float texture (1 m texels), for the river. */
let heightTex: THREE.DataTexture | null = null;
export function heightTexture() {
  if (heightTex) return heightTex; // shared by grass, flowers and water
  const N = WORLD_SIZE;
  const data = new Uint16Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) data[j * N + i] = THREE.DataUtils.toHalfFloat(heightAt(i - N / 2, j - N / 2));
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  heightTex = t;
  return t;
}

export function normalAt(x: number, z: number, out = new THREE.Vector3()) {
  const e = 1;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

/** Surface weights [stone, dirt, grass], summing to 1 (rock comes from slope in the shader). */
export function splatAt(x: number, z: number): [number, number, number] {
  if (Math.abs(x) > WORLD_SIZE / 2 || Math.abs(z) > WORLD_SIZE / 2) {
    // Outside Elder Glen: stone on rock and snow, dirt on sand and mesa, grass elsewhere.
    const rel = reliefAt(x, z);
    if (rel === RELIEF.mountain || rel === RELIEF.snow || rel === RELIEF.volcanic || rel === RELIEF.lava) return [1, 0, 0];
    if (rel === RELIEF.sand || rel === RELIEF.mesa || rel === RELIEF.beach || rel === RELIEF.deep || rel === RELIEF.shelf) return [0, 1, 0];
    return [0, 0.1, 0.9];
  }
  const dx = x - PLAZA_CENTER.x, dz = z - PLAZA_CENTER.y;
  const r = Math.sqrt(dx * dx + dz * dz);
  const n = fbm(x * 0.11, z * 0.11, 3);
  const inTown = Math.hypot(x, z) < TOWN_R - 2;
  let stone = smoothstep(PLAZA_R + 0.6, PLAZA_R - 0.6, r + (n - 0.5) * 2.2);
  // Stone apron in front of the crypt.
  stone = Math.max(stone, smoothstep(9, 6, Math.hypot(x - CRYPT.x, z - (CRYPT.y + 10)) + (n - 0.5) * 2));
  const fieldEdge = 15.5 + (fbm(x * 0.05 + 9, z * 0.05, 3) - 0.5) * 5;
  let dirt = Math.max(
    smoothstep(fieldEdge + 3, fieldEdge - 3, r),
    smoothstep(3.6, 1.8, roadDist(x, z) + (n - 0.5) * 2.5),
    // Village lanes: worn dirt with ragged grassy edges.
    inTown ? smoothstep(2.6, 1.1, streetDist(x, z) + (n - 0.5) * 1.8) : 0,
  );
  // River banks: mud and gravel.
  const dr = Math.abs(x - riverX(z));
  dirt = Math.max(dirt, smoothstep(17, 11, dr + (n - 0.5) * 4) * (1 - smoothstep(360, 420, Math.abs(z))));
  // Worn patches scattered in the grass.
  dirt = Math.max(dirt, smoothstep(0.68, 0.76, fbm(x * 0.045 - 3, z * 0.045 + 5, 3)) * 0.8);
  dirt = clamp(dirt * (1 - stone), 0, 1);
  const grass = clamp(1 - stone - dirt, 0, 1);
  return [stone, dirt, grass];
}

export type Surface = 'stone' | 'dirt' | 'grass';
export function surfaceAt(x: number, z: number): Surface {
  const [s, d, g] = splatAt(x, z);
  return s >= d && s >= g ? 'stone' : d >= g ? 'dirt' : 'grass';
}

