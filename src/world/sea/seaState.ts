import * as THREE from 'three';
import { regionAt, SEA_LEVEL } from '../worldMap';
import { PORT_AURELLE } from '../terrainHeight';

// The state of the sea (docs/design/boating.md §5–6): one set of Gerstner
// waves that the ocean shader draws and the ships float on (so what you see
// is what throws the boat), the wind, storm cells drifting over the water,
// and how dangerous the sea is where you are: calm in Port Aurelle's harbour,
// rougher the further out you go, and wild round the Shattered Isles and on
// the way to the Demon Continent.

/** One wave train: direction, wavelength (m), amplitude (m), steepness 0..1. */
export type Wave = [number, number, number, number, number];

/** Everyday waves: a long swell, its cross-swell, and wind chop. */
export const BASE_WAVES: Wave[] = [
  [1, 0.35, 42, 0.36, 0.55],
  [0.6, -0.8, 23, 0.2, 0.6],
  [-0.4, 1, 14, 0.11, 0.65],
  [0.9, 0.9, 8.5, 0.06, 0.7],
  [-0.85, 0.3, 5.2, 0.035, 0.75],
  [0.2, -1, 3.1, 0.018, 0.8],
];
/** Storm seas: long, high, steep swells from two directions (scaled by storm strength). */
export const STORM_WAVES: Wave[] = [
  [1, 0.15, 92, 3.6, 0.8],
  [0.75, 0.65, 58, 2.3, 0.85],
  [0.3, -1, 34, 1.2, 0.9],
  [-0.6, 0.8, 19, 0.5, 0.9],
];

/** Shared, mutable sea state: the ocean shader and every ship read it. */
export const SEA = {
  /** seconds on the sea's own clock (the shader's uTime) */
  t: 0,
  /** wave height multiplier where the camera is (danger + wind) */
  amp: 1,
  /** storm strength where the camera is, 0..1 */
  storm: 0,
  /** prevailing wind: direction it blows TOWARD, and strength 0..1 */
  windDir: new THREE.Vector2(1, 0.3).normalize(),
  wind: 0.4,
  /** danger tier where the camera is (0..5, continuous) */
  danger: 0,
};

// ---- waves on the CPU (must match the shader in ocean.ts) ---------------------------------

const TAU = Math.PI * 2;
const sampleScratch = { y: 0, nx: 0, ny: 1, nz: 0, dx: 0, dz: 0 };

/**
 * Wave displacement and normal at a world point (x, z) on the sea surface:
 * height above sea level `y`, the surface normal, and the horizontal shove.
 * (Gerstner waves move water sideways too; a hull is sampled where it is.)
 */
export function waveAt(x: number, z: number, t = SEA.t, amp = SEA.amp, storm = SEA.storm, out = sampleScratch) {
  let y = 0, nx = 0, ny = 1, nz = 0, dx = 0, dz = 0;
  const train = (w: Wave, a: number) => {
    const l = Math.hypot(w[0], w[1]);
    const ux = w[0] / l, uz = w[1] / l;
    const k = TAU / w[2];
    const c = Math.sqrt(9.8 / k);
    const f = k * (ux * x + uz * z - c * t);
    const A = w[3] * a;
    const Q = w[4];
    const cs = Math.cos(f), sn = Math.sin(f);
    dx += ux * A * Q * cs;
    dz += uz * A * Q * cs;
    y += A * sn;
    nx -= ux * k * A * cs;
    nz -= uz * k * A * cs;
    ny -= Q * k * A * sn;
  };
  for (const w of BASE_WAVES) train(w, amp);
  if (storm > 0.001) for (const w of STORM_WAVES) train(w, storm);
  const l = Math.hypot(nx, ny, nz);
  out.y = y;
  out.nx = nx / l;
  out.ny = ny / l;
  out.nz = nz / l;
  out.dx = dx;
  out.dz = dz;
  return out;
}

/** The water's surface height at a point (sea level plus the waves). */
export const seaSurfaceAt = (x: number, z: number) => SEA_LEVEL + waveAt(x, z).y;

/** Significant wave height (crest to trough, m) for a wave multiplier and storm strength. */
export function waveHeight(amp = SEA.amp, storm = SEA.storm) {
  let a = 0;
  for (const w of BASE_WAVES) a += w[3] * amp;
  for (const w of STORM_WAVES) a += w[3] * storm;
  return a * 1.3; // (the trains rarely all peak together)
}

// ---- danger --------------------------------------------------------------------------------

/** Each sea region's own danger (0 sheltered .. 5 abyssal). */
const REGION_DANGER: Record<string, number> = {
  portAurelle: 0, cresha: 1, emeraldIsles: 2, azureIsles: 2.6, sunkenIsles: 3.6, shatteredIsles: 4.2, demonContinent: 5, ocean: 2,
};
const SEA_REGIONS = new Set(['ocean', 'portAurelle', 'emeraldIsles', 'azureIsles', 'sunkenIsles', 'shatteredIsles', 'demonContinent']);
export const DANGER_NAMES = ['Sheltered Waters', 'Coastal Waters', 'Open Sea', 'Wild Sea', 'Perilous Sea', 'Abyssal Sea'];
/** Where the harbour mouth is: the sea is gentlest here and grows wilder with distance. */
export const HARBOUR = new THREE.Vector2(PORT_AURELLE.x + 160, PORT_AURELLE.y);

/**
 * How dangerous the sea is at a point (0..5): the further from Port Aurelle's
 * harbour, the rougher, and some regions are wild wherever you meet them.
 */
export function dangerAt(x: number, z: number) {
  const d = Math.hypot(x - HARBOUR.x, z - HARBOUR.y);
  // 0 in the harbour, 1 by 900 m, 2 by 2.4 km, 3 by 4.5 km, 4 by 7 km, 5 beyond 10 km.
  const byDistance = d < 300 ? 0 : d < 900 ? (d - 300) / 600 : d < 2400 ? 1 + (d - 900) / 1500 : d < 4500 ? 2 + (d - 2400) / 2100 : d < 7000 ? 3 + (d - 4500) / 2500 : Math.min(5, 4 + (d - 7000) / 3000);
  const id = regionAt(x, z);
  // Inland water (rivers, lakes): gentle, whatever its distance from the harbour.
  if (!SEA_REGIONS.has(id)) return 0.3;
  const region = REGION_DANGER[id] ?? 1;
  return Math.max(0, Math.min(5, Math.max(byDistance, region * 0.85 + byDistance * 0.15)));
}

/** Everyday wave multiplier for a danger tier (before the wind). */
export const dangerWaves = (danger: number) => 0.55 + danger * 0.5;

// ---- storm cells -----------------------------------------------------------------------------

export interface StormCell { x: number; z: number; r: number; vx: number; vz: number; power: number; life: number }

/** Storm cells over the sea: they form in wild water, drift with the wind, and die out. */
export const STORMS: StormCell[] = [];
let stormClock = 0;

/** Storm strength at a point from the cells (0..1). */
export function cellStormAt(x: number, z: number) {
  let s = 0;
  for (const c of STORMS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) s = Math.max(s, c.power * (1 - Math.pow(d / c.r, 2)) * Math.min(1, c.life / 30));
  }
  return s;
}

/** Wind at a point: direction it blows toward and speed (m/s), with gusts. */
export function windAt(x: number, z: number, t = SEA.t) {
  const storm = Math.max(SEA.storm, cellStormAt(x, z));
  const gust = 0.82 + 0.18 * Math.sin(t * 0.31 + x * 0.004) * Math.sin(t * 0.17 + z * 0.005) + 0.12 * Math.sin(t * 1.3 + x * 0.01);
  const base = 3 + SEA.wind * 9 + dangerAt(x, z) * 0.9;
  const speed = (base + storm * 12) * gust;
  // Storms veer the wind: it swings back and forth every half minute or so.
  const veer = storm * 0.6 * Math.sin(t * 0.21 + z * 0.002);
  const a = Math.atan2(SEA.windDir.y, SEA.windDir.x) + veer;
  return { dir: new THREE.Vector2(Math.cos(a), Math.sin(a)), speed, gust };
}

/**
 * Advance the sea: its clock, the wind's slow swing, the storm cells, and the
 * wave height and storm strength where the camera is (which the shader draws).
 */
export function updateSea(dt: number, camera: THREE.Vector3, weather: { wind: number; storm: number; rain: number }) {
  SEA.t += dt;
  SEA.wind += (weather.wind - SEA.wind) * Math.min(1, dt * 0.2);
  // The prevailing wind wanders slowly (westerlies, mostly).
  const wa = Math.atan2(SEA.windDir.y, SEA.windDir.x) + Math.sin(SEA.t * 0.003) * 0.0004;
  SEA.windDir.set(Math.cos(wa), Math.sin(wa));
  const danger = dangerAt(camera.x, camera.z);
  SEA.danger += (danger - SEA.danger) * Math.min(1, dt * 0.5);
  // Storm cells: in wild water they form every few minutes ahead of the wind.
  stormClock -= dt;
  if (stormClock <= 0) {
    stormClock = 60 + Math.random() * 120;
    if (danger >= 2.5 && STORMS.length < 3 && Math.random() < 0.25 + (danger - 2.5) * 0.25) {
      const a = Math.random() * Math.PI * 2, d = 700 + Math.random() * 900;
      STORMS.push({ x: camera.x + Math.cos(a) * d, z: camera.z + Math.sin(a) * d, r: 280 + Math.random() * 320, vx: SEA.windDir.x * 6, vz: SEA.windDir.y * 6, power: 0.6 + Math.random() * 0.4, life: 240 + Math.random() * 300 });
    }
  }
  for (const c of STORMS) {
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    c.life -= dt;
  }
  for (let i = STORMS.length - 1; i >= 0; i--) if (STORMS[i].life <= 0 || Math.hypot(STORMS[i].x - camera.x, STORMS[i].z - camera.z) > 4000) STORMS.splice(i, 1);
  const storm = Math.max(weather.storm * 0.75 + weather.rain * 0.15, cellStormAt(camera.x, camera.z)) * Math.min(1, 0.35 + danger * 0.2);
  SEA.storm += (storm - SEA.storm) * Math.min(1, dt * 0.15);
  const amp = dangerWaves(SEA.danger) * (0.7 + SEA.wind * 0.8);
  SEA.amp += (amp - SEA.amp) * Math.min(1, dt * 0.3);
}

/** Put a storm right here (quests, tests). */
export function brewStorm(x: number, z: number, r = 500, power = 1) {
  STORMS.push({ x, z, r, vx: SEA.windDir.x * 4, vz: SEA.windDir.y * 4, power, life: 600 });
}
