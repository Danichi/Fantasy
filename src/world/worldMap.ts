import * as THREE from 'three';
import REGIONS from './data/regions.json';
import { fbm, smoothstep } from '../core/math';

// Macro world data from the painted world map (tools/build-worldmap.mjs):
// one texel per 60 m cell over the whole 22.7 x 15.2 km map. CPU copies
// answer height/biome queries; GPU textures shade terrain, grass and the
// world-map UI.
//
// World metres <-> map pixels: x = (px - 620) * 14.8, z = (py - 445) * 14.8,
// with north = -Z. Elder Glen sits at the origin.

export const MPP = REGIONS.metresPerPx; // 14.8 m per map pixel
export const CELL = 60;
export const MAP_PX = REGIONS.mapPx as [number, number];
export const ORIGIN_PX = REGIONS.originPx as [number, number];
export const WORLD_W = MAP_PX[0] * MPP;
export const WORLD_H = MAP_PX[1] * MPP;
/** World-space rectangle covered by the map (x0, z0 is the north-west corner). */
export const WORLD_X0 = -ORIGIN_PX[0] * MPP;
export const WORLD_Z0 = -ORIGIN_PX[1] * MPP;
export const GW = Math.ceil(WORLD_W / CELL);
export const GH = Math.ceil(WORLD_H / CELL);
export const SEA_LEVEL = -1.2;
const ELEV_MIN = -80, ELEV_MAX = 720;

export const RELIEF = { deep: 0, shelf: 1, beach: 2, open: 3, forest: 4, mountain: 5, snow: 6, sand: 7, mesa: 8, marsh: 9, lava: 10, volcanic: 11, shore: 12 } as const;

/**
 * Corrections to the painted map's colour classes. It draws sand around every
 * body of water, so lakes far inland came out as white beaches with no grass. Sand stays only within a few cells
 * of the open sea (water connected to the map's edge); other shores become
 * 'shore': flat like a beach, green like a meadow.
 */
function greenInlandShores(c: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const rel = (i: number) => c[i * 4 + 1];
  const water = (i: number) => rel(i) === RELIEF.deep || rel(i) === RELIEF.shelf;
  // Open sea: water reachable from the edge of the map.
  const sea = new Uint8Array(n);
  const queue: number[] = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (water(i) && !sea[i]) { sea[i] = 1; queue.push(i); } }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (water(i) && !sea[i]) { sea[i] = 1; queue.push(i); } }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!sea[j] && water(j)) { sea[j] = 1; queue.push(j); }
    }
  }
  // Distance (in cells) from the sea, out to the reach of a real coast.
  const REACH = 4;
  const dist = new Uint8Array(n).fill(255);
  const front: number[] = [];
  for (let i = 0; i < n; i++) if (sea[i]) { dist[i] = 0; front.push(i); }
  for (let q = 0; q < front.length; q++) {
    const i = front[q], x = i % w, y = (i / w) | 0;
    if (dist[i] >= REACH) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] === 255) { dist[j] = dist[i] + 1; front.push(j); }
    }
  }
  for (let i = 0; i < n; i++) if (rel(i) === RELIEF.beach && dist[i] > REACH) c[i * 4 + 1] = RELIEF.shore;
  // The map's white surf and pale sand also read as snow: lowland "snow"
  // (well below any snowline) is really coast or meadow.
  for (let i = 0; i < n; i++) {
    if (rel(i) !== RELIEF.snow) continue;
    const elev = ELEV_MIN + (c[i * 4 + 2] / 255) * (ELEV_MAX - ELEV_MIN);
    if (elev < 200) c[i * 4 + 1] = dist[i] <= REACH ? RELIEF.beach : RELIEF.shore;
  }
}
export type ReliefId = (typeof RELIEF)[keyof typeof RELIEF];

export const REGION_IDS: string[] = REGIONS.regions.map((r) => r.id);

/** Map pixel -> world metres. */
export const pxToWorld = (px: number, py: number) => new THREE.Vector2((px - ORIGIN_PX[0]) * MPP, (py - ORIGIN_PX[1]) * MPP);
/** World metres -> map pixel. */
export const worldToPx = (x: number, z: number) => new THREE.Vector2(x / MPP + ORIGIN_PX[0], z / MPP + ORIGIN_PX[1]);

let cells: Uint8ClampedArray | null = null; // RGBA per cell
let macroTex: THREE.DataTexture | null = null;
let mapTex: THREE.Texture | null = null;

/** Load the macro data (call once at boot, before terrain). */
export async function loadWorldMap() {
  const read = async (url: string) => {
    // Data, not a picture: decode without colour management or alpha premultiply.
    const blob = await (await fetch(url)).blob();
    const img = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    return { data: g.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
  };
  const [macro, mountain] = await Promise.all([read('/assets/world/macro.png'), read('/assets/world/macro-mountain.png')]);
  // Mountainness rides in alpha on the CPU side (kept out of the PNG's alpha,
  // which the browser would premultiply into the other channels).
  for (let k = 0; k < macro.w * macro.h; k++) macro.data[k * 4 + 3] = mountain.data[k * 4];
  greenInlandShores(macro.data, macro.w, macro.h);
  cells = macro.data;
  const img = { width: macro.w, height: macro.h };
  macroTex = new THREE.DataTexture(new Uint8Array(cells.buffer.slice(0)), img.width, img.height, THREE.RGBAFormat);
  macroTex.magFilter = macroTex.minFilter = THREE.NearestFilter;
  macroTex.flipY = false;
  macroTex.needsUpdate = true;
  mapTex = await new THREE.TextureLoader().loadAsync('/assets/world/map.webp');
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.anisotropy = 4;
}

export const worldMapReady = () => cells !== null;
/** Raw macro cells (for the tile worker, which has no DOM to decode images). */
export function macroCells() {
  return cells!;
}
export function setMacroCells(data: Uint8ClampedArray) {
  cells = data;
}
export function macroTexture() {
  return macroTex!;
}
export function paintedMapTexture() {
  return mapTex!;
}

const cellIndex = (x: number, z: number) => {
  const gx = Math.min(GW - 1, Math.max(0, Math.floor((x - WORLD_X0) / CELL)));
  const gz = Math.min(GH - 1, Math.max(0, Math.floor((z - WORLD_Z0) / CELL)));
  return (gz * GW + gx) * 4;
};

/** Region id at a world position ('ocean' in open sea). */
export function regionAt(x: number, z: number) {
  if (!cells) return 'cresha';
  const r = cells[cellIndex(x, z)];
  return r === 255 ? 'ocean' : REGION_IDS[r];
}

/** Relief class at a world position (nearest cell). */
export function reliefAt(x: number, z: number): ReliefId {
  if (!cells) return RELIEF.open;
  return cells[cellIndex(x, z) + 1] as ReliefId;
}

// Detail character per relief class: [rolling hills m, dune m, ridge weight]
const DETAIL: Record<number, [number, number, number]> = {
  [RELIEF.deep]: [3, 0, 0], [RELIEF.shelf]: [1.5, 0, 0], [RELIEF.beach]: [0.6, 0, 0], [RELIEF.open]: [7, 0, 0],
  [RELIEF.forest]: [9, 0, 0], [RELIEF.mountain]: [16, 0, 1], [RELIEF.snow]: [18, 0, 1], [RELIEF.sand]: [3, 7, 0],
  [RELIEF.mesa]: [8, 2, 0.4], [RELIEF.marsh]: [0.8, 0, 0], [RELIEF.lava]: [5, 0, 0.3], [RELIEF.volcanic]: [12, 0, 0.8],
  [RELIEF.shore]: [0.6, 0, 0], // a lake shore keeps a beach's gentle profile
};

/** Bilinear sample of a channel plus relief-weighted detail parameters. */
function sampleMacro(x: number, z: number) {
  const fx = (x - WORLD_X0) / CELL - 0.5, fz = (z - WORLD_Z0) / CELL - 0.5;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const u = fx - ix, v = fz - iz;
  let elev = 0, mount = 0, hills = 0, dunes = 0, ridge = 0;
  for (let k = 0; k < 4; k++) {
    const cx = Math.min(GW - 1, Math.max(0, ix + (k & 1)));
    const cz = Math.min(GH - 1, Math.max(0, iz + (k >> 1)));
    const w = (k & 1 ? u : 1 - u) * (k >> 1 ? v : 1 - v);
    const i = (cz * GW + cx) * 4;
    elev += (ELEV_MIN + (cells![i + 2] / 255) * (ELEV_MAX - ELEV_MIN)) * w;
    mount += (cells![i + 3] / 255) * w;
    const d = DETAIL[cells![i + 1]] ?? DETAIL[RELIEF.open];
    hills += d[0] * w;
    dunes += d[1] * w;
    ridge += d[2] * w;
  }
  return { elev, mount, hills, dunes, ridge };
}

/** Ridged multifractal for mountain crests. */
function ridged(x: number, z: number) {
  let sum = 0, amp = 0.55, freq = 1, prev = 1;
  for (let o = 0; o < 5; o++) {
    const n = 1 - Math.abs(fbm(x * freq, z * freq, 1) * 2 - 1);
    const r = n * n * prev;
    sum += r * amp;
    prev = r;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}

/** Smoothed macro elevation only (no detail): land >= 0.4 m, sea below. */
export function macroElevAt(x: number, z: number) {
  if (!cells) return 2;
  return sampleMacro(x, z).elev;
}

/** Macro terrain height (metres) away from authored areas. */
export function macroHeight(x: number, z: number) {
  if (!cells) return 2;
  const s = sampleMacro(x, z);
  let h = s.elev;
  // Rolling hills everywhere, scaled by the local relief.
  h += (fbm(x / 240 + 11.3, z / 240 - 4.1, 4) - 0.45) * s.hills;
  // Mountain crests: ridged noise weighted by how mountainous the area is.
  if (s.mount > 0.02) h += ridged(x / 520 + 3.7, z / 520 - 1.9) * 420 * s.mount * s.ridge * smoothstep(0.02, 0.35, s.mount);
  // Dunes: long crests across the prevailing wind, broken by noise.
  if (s.dunes > 0.05) {
    const d = Math.sin((x * 0.8 + z * 0.35) / 38 + fbm(x / 160, z / 160, 3) * 6);
    h += (d * 0.5 + 0.5) ** 2 * s.dunes * 2;
  }
  // The coastline stays where the map draws it.
  if (s.elev < SEA_LEVEL) h = Math.min(h, SEA_LEVEL - 0.6 + (s.elev - SEA_LEVEL) * 0.6);
  return h;
}

/** Region definition from regions.json (outline in map pixels). */
export const REGION_DEFS = REGIONS.regions;
export const PLACE_DEFS = REGIONS.places;
