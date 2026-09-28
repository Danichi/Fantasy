import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { fbm, smoothstep, clamp } from '../core/math';
import { physics } from '../physics/physics';
import { FLOWER_GLSL } from './flowerNoise';

// ---------------------------------------------------------------------------
// The overworld: about 1 km square, +z = south.
//   town      walled by a palisade (TOWN_R) with gates south, north and east;
//             the training plaza sits in the middle
//   roads     south to the meadows, north to the crypt in the hills, east over
//             the river bridge
//   river     winds north-south east of town
//   forest    covers the west; meadows lie south and east
//   hills     rise to the north; mountains close the world in on every side
// Heights are generated once into a 1 m grid; heightAt() samples it.
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
  // east gate over the bridge
  [[TOWN_R - 6, 0], [120, 4], [BRIDGE.x, BRIDGE.y], [230, 22], [330, 60], [500, 70]],
  // west gate into the forest logging road
  [[-TOWN_R + 6, 0], [-145, 8], [-230, 80], [-320, 118]],
];
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

/** The procedural height function (slow). Use heightAt() at runtime. */
function heightFn(x: number, z: number) {
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
  // Mountains close the world in.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const m = smoothstep(330, 512, edge + (fbm(x / 90, z / 90, 3) - 0.5) * 60);
  h += Math.pow(m, 1.6) * 95 * (0.6 + 0.8 * fbm(x / 70, z / 70, 4));
  return h;
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
    for (let i = 0; i < GRID; i++) heights[j * GRID + i] = heightFn(i * HSTEP - H, j * HSTEP - H);
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
  if (!heights) return heightFn(x, z);
  const H = WORLD_SIZE / 2;
  const fx = clamp(x + H, 0, WORLD_SIZE - 1e-3) / HSTEP, fz = clamp(z + H, 0, WORLD_SIZE - 1e-3) / HSTEP;
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const a = heights[j * GRID + i], b = heights[j * GRID + i + 1];
  const c = heights[(j + 1) * GRID + i], d = heights[(j + 1) * GRID + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Heights as a half-float texture (1 m texels) for GPU-placed foliage. */
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
  const dx = x - PLAZA_CENTER.x, dz = z - PLAZA_CENTER.y;
  const r = Math.sqrt(dx * dx + dz * dz);
  const n = fbm(x * 0.11, z * 0.11, 3);
  const inTown = Math.hypot(x, z) < TOWN_R - 2;
  let stone = smoothstep(PLAZA_R + 0.6, PLAZA_R - 0.6, r + (n - 0.5) * 2.2);
  if (inTown) stone = Math.max(stone, smoothstep(2.8, 1.6, streetDist(x, z) + (n - 0.5) * 1.4));
  // Stone apron in front of the crypt.
  stone = Math.max(stone, smoothstep(9, 6, Math.hypot(x - CRYPT.x, z - (CRYPT.y + 10)) + (n - 0.5) * 2));
  const fieldEdge = 22 + (fbm(x * 0.05 + 9, z * 0.05, 3) - 0.5) * 12;
  let dirt = Math.max(
    smoothstep(fieldEdge + 3, fieldEdge - 3, r),
    smoothstep(3.6, 1.8, roadDist(x, z) + (n - 0.5) * 2.5),
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

// ---- rendering ----------------------------------------------------------------
function loadTex(loader: THREE.TextureLoader, url: string, srgb: boolean, aniso: number) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSplatTexture() {
  const N = 1024;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * WORLD_SIZE;
      const z = ((j + 0.5) / N - 0.5) * WORLD_SIZE;
      const [s, d, g] = splatAt(x, z);
      const k = (j * N + i) * 4;
      data[k] = s * 255;
      data[k + 1] = d * 255;
      data[k + 2] = g * 255;
      data[k + 3] = fbm(x * 0.02 + 40, z * 0.02 - 11, 3) * 255; // macro variation
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function terrainMaterial(renderer: THREE.WebGLRenderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const L = new THREE.TextureLoader();
  const base = '/assets/textures/';
  const set = (id: string) => ({
    diff: loadTex(L, `${base}${id}_diff_1k.jpg`, true, aniso),
    nor: loadTex(L, `${base}${id}_nor_gl_1k.jpg`, false, aniso),
    arm: loadTex(L, `${base}${id}_arm_1k.jpg`, false, aniso),
  });
  const stone = set('cobblestone_floor_08');
  const dirt = set('brown_mud_leaves_01');
  const grass = set('aerial_grass_rock');
  const rock = set('rock_face_03');

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uniforms = {
    tSplat: { value: buildSplatTexture() },
    uSize: { value: WORLD_SIZE },
    dS: { value: stone.diff }, nS: { value: stone.nor }, aS: { value: stone.arm },
    dD: { value: dirt.diff }, nD: { value: dirt.nor }, aD: { value: dirt.arm },
    dG: { value: grass.diff }, nG: { value: grass.nor }, aG: { value: grass.arm },
    dR: { value: rock.diff }, nR: { value: rock.nor },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWN;
        uniform sampler2D tSplat, dS, nS, aS, dD, nD, aD, dG, nG, aG, dR, nR;
        uniform float uSize;
        vec3 tW;
        float tFar, tRock;
        vec2 uvS, uvD, uvG, uvR;
        ${FLOWER_GLSL}
        vec3 heightBlend(vec3 w, vec3 h) {
          vec3 x = w + h * 0.55;
          float m = max(max(x.r, x.g), x.b) - 0.28;
          vec3 b = max(x - m, 0.0);
          return b / max(b.r + b.g + b.b, 1e-4);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 sp = texture2D(tSplat, vWPos.xz / uSize + 0.5);
        uvS = vWPos.xz / 2.6; uvD = vWPos.xz / 3.4; uvG = vWPos.xz / 4.2;
        float far = smoothstep(18.0, 80.0, length(vWPos - cameraPosition));
        tFar = far;
        // Only layers that are present get sampled; big regions take one path.
        vec3 cS = vec3(0.0), cD = vec3(0.0), cG = vec3(0.0);
        vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vWPos.xz;
        float mv = smoothstep(0.3, 0.7, sp.a);
        if (sp.r > 0.004) cS = texture2D(dS, uvS).rgb * 0.62;
        if (sp.g > 0.004) cD = texture2D(dD, far > 0.5 ? uv2 / 3.4 * 0.1 : uvD).rgb * vec3(0.95, 0.9, 0.85);
        if (sp.b > 0.004) cG = texture2D(dG, far > 0.5 ? uv2 / 4.2 * 0.09 : uvG).rgb * vec3(0.6, 0.92, 0.46);
        vec3 hts = vec3(dot(cS, vec3(0.5)), dot(cD, vec3(0.4)), dot(cG, vec3(0.5)));
        tW = heightBlend(sp.rgb, hts);
        vec3 col = cS * tW.r + cD * tW.g + cG * tW.b;
        col *= mix(vec3(0.9, 0.93, 0.86), vec3(1.07, 1.03, 0.98), mix(sp.a, mv, 0.5));
        // Wildflowers beyond the 3D sprigs: dots in the middle distance,
        // a soft colour wash far away.
        float fDens = flowerDensity(vWPos.xz) * tW.b;
        if (fDens > 0.02) {
          float dist = length(vWPos - cameraPosition);
          float k = flowerKind(vWPos.xz);
          vec3 fc = k < 0.5 ? vec3(0.95, 0.93, 0.86) : k < 1.5 ? vec3(0.95, 0.76, 0.14) : k < 2.5 ? vec3(0.32, 0.46, 0.92) : vec3(0.86, 0.13, 0.08);
          vec2 cellP = vWPos.xz * 3.0;
          float pick = fh(floor(cellP));
          float dotShape = smoothstep(0.24, 0.1, length(fract(cellP) - 0.5));
          float mid = smoothstep(12.0, 18.0, dist) * (1.0 - smoothstep(45.0, 70.0, dist));
          float flatGround = smoothstep(0.9, 0.97, normalize(vWN).y);
          col = mix(col, fc, step(pick, fDens * 0.22) * dotShape * 0.8 * mid * flatGround);
          col = mix(col, mix(col, fc, 0.5), fDens * 0.12 * smoothstep(45.0, 70.0, dist));
        }
        // Steep ground turns to rock (triplanar-lite: project on the dominant side).
        vec3 wn = normalize(vWN);
        tRock = smoothstep(0.28, 0.45, 1.0 - wn.y);
        if (tRock > 0.01) {
          // Triplanar on steep faces: blend the X- and Z-facing projections.
          float bx = abs(wn.x) / (abs(wn.x) + abs(wn.z) + 1e-4);
          uvR = bx > 0.5 ? vWPos.zy / 7.0 : vWPos.xy / 7.0;
          float rs = mix(7.0, 30.0, far); // much larger scale far away hides tiling
          vec3 cR = mix(texture2D(dR, vWPos.xy / rs).rgb, texture2D(dR, vWPos.zy / rs).rgb, bx);
          cR = mix(vec3(dot(cR, vec3(0.33))), cR, 0.35) * vec3(0.86, 0.88, 0.9); // weathered grey stone
          col = mix(col, cR, tRock);
        }
        diffuseColor.rgb *= col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        if (far < 0.99) {
          vec3 arm = vec3(0.0);
          if (tW.r > 0.01) arm += texture2D(aS, uvS).rgb * tW.r;
          if (tW.g > 0.01) arm += texture2D(aD, uvD).rgb * tW.g;
          if (tW.b > 0.01) arm += texture2D(aG, uvG).rgb * tW.b;
          arm = mix(arm, vec3(1.0, 0.9, 0.0), far);
          roughnessFactor *= mix(0.75, 1.0, arm.g);
          diffuseColor.rgb *= mix(1.0, arm.r, 0.8 * (1.0 - tRock));
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `if (tFar < 0.95) {
          vec3 nm = vec3(0.0);
          if (tW.r > 0.01) nm += (texture2D(nS, uvS).xyz * 2.0 - 1.0) * tW.r;
          if (tW.g > 0.01) nm += (texture2D(nD, uvD).xyz * 2.0 - 1.0) * tW.g;
          if (tW.b > 0.01) nm += (texture2D(nG, uvG).xyz * 2.0 - 1.0) * tW.b;
          if (tRock > 0.01) nm = mix(nm, texture2D(nR, uvR).xyz * 2.0 - 1.0, tRock);
          nm.xy *= 1.1 * (1.0 - tFar);
          nm.z = max(nm.z, 0.2);
          vec3 Nv = normal;
          vec3 Tv = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
          Tv = normalize(Tv - Nv * dot(Nv, Tv));
          vec3 Bv = normalize(cross(Nv, Tv));
          normal = normalize(Tv * nm.x - Bv * nm.y + Nv * nm.z);
        }`,
      );
  };
  return { mat, splat: uniforms.tSplat.value };
}

const CHUNK = 128;
const LODS = [64, 32, 12]; // segments per chunk: 2 m, 4 m, ~10 m
const LOD_DIST = [190, 420];

/** Chunk grid geometry with a skirt around the edge to hide LOD cracks. */
function chunkGeometry(cx: number, cz: number, seg: number) {
  const n = seg + 1;
  const step = CHUNK / seg;
  const count = n * n + 4 * n;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  let k = 0;
  const put = (x: number, z: number, drop: number) => {
    normalAt(x, z, v);
    pos[k * 3] = x; pos[k * 3 + 1] = heightAt(x, z) - drop; pos[k * 3 + 2] = z;
    nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
    k++;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) put(cx + i * step, cz + j * step, 0);
  const idx: number[] = [];
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Skirts: a strip hanging 4 m down from each edge.
  const edges: number[][] = [
    Array.from({ length: n }, (_, i) => i),
    Array.from({ length: n }, (_, i) => (n - 1) * n + i),
    Array.from({ length: n }, (_, j) => j * n),
    Array.from({ length: n }, (_, j) => j * n + n - 1),
  ];
  for (const e of edges) {
    const base = k;
    for (const vi of e) put(pos[vi * 3], pos[vi * 3 + 2], 4);
    for (let i = 0; i < n - 1; i++) {
      const a = e[i], b = e[i + 1], c = base + i, d = base + i + 1;
      idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

interface Chunk {
  mesh: THREE.Mesh;
  geos: (THREE.BufferGeometry | null)[];
  cx: number;
  cz: number;
  lod: number;
  collider: RAPIER.Collider | null;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly splat: THREE.DataTexture;
  private chunks: Chunk[] = [];
  private mat: THREE.Material;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const { mat, splat } = terrainMaterial(renderer);
    this.mat = mat;
    this.splat = splat;
    const H = WORLD_SIZE / 2;
    for (let z = -H; z < H; z += CHUNK) {
      for (let x = -H; x < H; x += CHUNK) {
        const geos: (THREE.BufferGeometry | null)[] = [null, null, chunkGeometry(x, z, LODS[2])];
        const mesh = new THREE.Mesh(geos[2]!, mat);
        mesh.receiveShadow = true;
        mesh.name = 'terrain';
        this.group.add(mesh);
        this.chunks.push({ mesh, geos, cx: x, cz: z, lod: 2, collider: null });
      }
    }
    this.group.name = 'terrain';
    scene.add(this.group);
  }

  /** Swap chunk detail by distance and stream collision around the player. */
  update(camera: THREE.Vector3, player: THREE.Vector3) {
    for (const c of this.chunks) {
      const mx = c.cx + CHUNK / 2, mz = c.cz + CHUNK / 2;
      const dCam = Math.max(0, Math.hypot(camera.x - mx, camera.z - mz) - CHUNK * 0.7);
      const lod = dCam < LOD_DIST[0] ? 0 : dCam < LOD_DIST[1] ? 1 : 2;
      if (lod !== c.lod) {
        c.geos[lod] ??= chunkGeometry(c.cx, c.cz, LODS[lod]);
        c.mesh.geometry = c.geos[lod]!;
        c.lod = lod;
      }
      // Collision for the player's chunk and its neighbours.
      const near = Math.abs(player.x - mx) < CHUNK * 1.2 && Math.abs(player.z - mz) < CHUNK * 1.2;
      if (near && !c.collider) c.collider = this.buildCollider(c);
      else if (!near && c.collider && (Math.abs(player.x - mx) > CHUNK * 1.8 || Math.abs(player.z - mz) > CHUNK * 1.8)) {
        physics.world.removeCollider(c.collider, false);
        c.collider = null;
      }
    }
  }

  /** Build every chunk's collision now (tests and spawning use this). */
  warm(player: THREE.Vector3) {
    this.update(player, player);
  }

  private buildCollider(c: Chunk) {
    const seg = 64, n = seg + 1, step = CHUNK / seg;
    const verts = new Float32Array(n * n * 3);
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = c.cx + i * step, z = c.cz + j * step;
        verts[k++] = x; verts[k++] = heightAt(x, z); verts[k++] = z;
      }
    }
    const idx = new Uint32Array(seg * seg * 6);
    k = 0;
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
        idx[k++] = a; idx[k++] = cc; idx[k++] = b;
        idx[k++] = b; idx[k++] = cc; idx[k++] = d;
      }
    }
    return physics.addTrimesh(verts, idx);
  }

  dispose() {
    this.mat.dispose();
  }
}
