import * as THREE from 'three';
import { worldNoise } from '../render/noise';
import { paintedTexture } from '../render/painted';
import type RAPIER from '@dimforge/rapier3d-compat';
import { fbm } from '../core/math';
import { physics } from '../physics/physics';
import { FLOWER_GLSL } from './flowerNoise';

// ---------------------------------------------------------------------------
// Terrain rendering for the whole continent (heights live in terrainHeight.ts).
// Elder Glen, the authored start (about 1 km square, +z = south):
//   town      ElderGlen, a fortified farming village that feeds Cresha
//   roads     south into the crop belt, north to the crypt, east over the river
//             and onward along the King's Road to Port Aurelle
//   river     winds north-south east of town
//   forest    covers the west; broad farm country fills the south
//   beyond     the continent from the painted world map (worldMap.ts), with
//             Port Aurelle on the coast 2.5 km east
// ---------------------------------------------------------------------------
export * from './terrainHeight';
import { buildRoadTexture, ROAD_RECT } from './roadNetwork';
import { CITY_BOUNDS } from './portCity';
import { normalAt, splatAt, WORLD_SIZE, TILE, TILE_SEG, TILE_N, tileData, tileKey, hasTile, putTile, worldHeightFn, LOCAL_R1 } from './terrainHeight';
import { macroTexture, paintedMapTexture, macroCells, macroHeight, WORLD_X0, WORLD_Z0, WORLD_W, WORLD_H, GW, GH, SEA_LEVEL } from './worldMap';
// ---- rendering ----------------------------------------------------------------
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

/** Shared wetness uniform for every terrain material (weather). */
const WET = { value: 0 };

let roadTex: THREE.DataTexture | null = null;
const roadTexture = () => (roadTex ??= buildRoadTexture());

function terrainMaterial(renderer: THREE.WebGLRenderer, splat: THREE.DataTexture) {
  // Painted ground (docs/ART-DIRECTION.md §3): each macro relief class has its
  // own painted palette (meadow, forest floor, rock strata, snow, dunes, mesa,
  // marsh, ash, lava, seabed), blended organically between 60 m cells and
  // tinted toward the hues of the painted world map. Elder Glen's authored
  // splat (cobbles, dirt lanes) lies on top near the origin. No normal maps:
  // the stylised lighting does the rest.
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.userData.styleSoftness = 0;
  const uniforms = {
    tSplat: { value: splat },
    uSize: { value: WORLD_SIZE },
    tNoise: { value: worldNoise() },
    tCobble: { value: paintedTexture('cobbles', aniso, 7) },
    tDirt: { value: paintedTexture('dirt', aniso, 8) },
    tMacro: { value: macroTexture() },
    tMap: { value: paintedMapTexture() },
    uWorld: { value: new THREE.Vector4(WORLD_X0, WORLD_Z0, WORLD_W, WORLD_H) },
    uGrid: { value: new THREE.Vector2(GW, GH) },
    uHole: { value: new THREE.Vector3(0, 0, 0) },
    uWet: WET,
    tRoads: { value: roadTexture() },
    uRoadRect: { value: new THREE.Vector4(ROAD_RECT.x0, ROAD_RECT.z0, ROAD_RECT.w, ROAD_RECT.h) },
    uCityRect: { value: new THREE.Vector4(CITY_BOUNDS.x0 - 16, CITY_BOUNDS.z0 - 40, CITY_BOUNDS.x1 + 6, CITY_BOUNDS.z1 + 12) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWN;
        uniform sampler2D tSplat, tNoise, tCobble, tDirt, tMacro, tMap, tRoads;
        uniform vec4 uRoadRect, uCityRect;
        uniform float uSize;
        uniform vec4 uWorld;
        uniform vec2 uGrid;
        uniform vec3 uHole;
        uniform float uWet;
        vec3 terrainGlow = vec3(0.0);
        ${FLOWER_GLSL}
        // Rock strata shared by mountains, cliffs and mesas.
        vec3 strata(vec3 a, vec3 b, float y, vec4 fN, vec4 pN, float dist) {
          float band = sin(y * 0.33 + fN.g * 2.5 + pN.r * 6.0) * 0.5 + 0.5;
          band = mix(band, 0.5, smoothstep(60.0, 260.0, dist));
          return mix(a, b, smoothstep(0.3, 0.7, band)) * mix(0.92, 1.06, fN.b);
        }
        // Painted ground albedo for one macro relief class.
        vec3 reliefColor(int id, vec4 pN, vec4 fN, float dist, vec3 gNear, vec3 gFar) {
          if (id <= 1) return mix(vec3(0.42, 0.4, 0.3), vec3(0.3, 0.36, 0.33), pN.g);                // seabed
          if (id == 2) return mix(vec3(0.72, 0.6, 0.38), vec3(0.8, 0.68, 0.45), fN.r);               // beach
          if (id == 3) return mix(gNear, gFar, smoothstep(10.0, 70.0, dist)) * mix(0.92, 1.06, fN.b); // meadow
          if (id == 4) {                                                                           // forest floor
            vec3 f = mix(vec3(0.07, 0.13, 0.05), vec3(0.12, 0.17, 0.06), pN.r);
            return mix(f, vec3(0.2, 0.16, 0.09), smoothstep(0.6, 0.8, fN.g) * 0.5);
          }
          if (id == 5) return strata(vec3(0.3, 0.29, 0.28), vec3(0.46, 0.44, 0.41), vWPos.y, fN, pN, dist);
          if (id == 6) return mix(vec3(0.8, 0.85, 0.93), vec3(0.93, 0.95, 0.99), fN.r);             // snow
          if (id == 7) {                                                                           // dunes
            float ripple = sin((vWPos.x * 0.8 + vWPos.z * 0.35) * 1.4 + fN.g * 3.0) * 0.5 + 0.5;
            return mix(vec3(0.76, 0.5, 0.22), vec3(0.88, 0.64, 0.32), ripple * 0.5 + pN.r * 0.5);
          }
          if (id == 8) return strata(vec3(0.46, 0.2, 0.1), vec3(0.66, 0.36, 0.18), vWPos.y * 1.4, fN, pN, dist); // mesa
          if (id == 9) return mix(vec3(0.13, 0.17, 0.08), vec3(0.2, 0.2, 0.1), pN.g);               // marsh
          if (id == 10) {                                                                          // lava field
            float crack = smoothstep(0.47, 0.5, fN.r) * (1.0 - smoothstep(0.5, 0.53, fN.r));
            terrainGlow += vec3(1.0, 0.32, 0.05) * crack * 2.5;
            return mix(vec3(0.07, 0.05, 0.05), vec3(0.16, 0.08, 0.06), pN.r);
          }
          return mix(vec3(0.1, 0.09, 0.09), vec3(0.2, 0.17, 0.16), pN.r);                            // ash / volcanic rock
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `if (uHole.z > 0.0 && distance(vWPos.xz, uHole.xy) < uHole.z) discard;
        float dist = length(vWPos - cameraPosition);
        vec4 patchN = texture2D(tNoise, vWPos.xz * 0.004);
        vec4 fineN = texture2D(tNoise, vWPos.xz * 0.05);
        vec3 gNear = mix(vec3(0.12, 0.25, 0.06), vec3(0.18, 0.31, 0.07), patchN.r);
        vec3 gFar = mix(vec3(0.22, 0.4, 0.1), vec3(0.36, 0.43, 0.13), smoothstep(0.55, 0.85, patchN.g));

        // Macro relief: blend the four surrounding 60 m cells, with a noisy
        // offset so the borders wander like painted brush edges.
        vec2 gc = (vWPos.xz - uWorld.xy) / 60.0 - 0.5 + (vec2(patchN.b, fineN.g) - 0.5) * 0.9;
        vec2 i0 = floor(gc);
        vec2 f = smoothstep(0.0, 1.0, fract(gc));
        vec3 biome = vec3(0.0);
        float snowW = 0.0, beachW = 0.0;
        for (int k = 0; k < 4; k++) {
          vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
          vec4 m = texture2D(tMacro, (i0 + o + 0.5) / uGrid);
          int rel = int(m.g * 255.0 + 0.5);
          float w = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
          biome += reliefColor(rel, patchN, fineN, dist, gNear, gFar) * w;
          if (rel == 6) snowW += w;
          if (rel == 2) beachW += w;
        }
        // Hue of the painted map, so each region carries the map's colours.
        vec2 muv = (vWPos.xz - uWorld.xy) / uWorld.zw;
        vec3 mapCol = texture2D(tMap, muv, 5.0).rgb;
        float mapL = max(dot(mapCol, vec3(0.3, 0.55, 0.15)), 0.04);
        float bioL = dot(biome, vec3(0.3, 0.55, 0.15));
        vec3 tinted = mapCol / mapL * bioL;
        // (Not on beaches: the map paints surf white along the coast.)
        biome = mix(biome, tinted, mix(0.25, 0.55, smoothstep(80.0, 900.0, dist)) * (1.0 - beachW));

        // Port Aurelle's levelled ground (and its causeway) is town grass, whatever the map says.
        float inCity = step(uCityRect.x, vWPos.x) * step(vWPos.x, uCityRect.z) * step(uCityRect.y, vWPos.z) * step(vWPos.z, uCityRect.w);
        inCity = max(inCity, step(2540.0, vWPos.x) * step(vWPos.x, 2700.0) * step(abs(vWPos.z - 150.0), 12.0));
        biome = mix(biome, mix(gNear, gFar, smoothstep(10.0, 70.0, dist)), inCity * step(-0.6, vWPos.y));

        // Elder Glen's authored splat near the origin.
        vec2 luv = vWPos.xz / uSize + 0.5;
        float localW = 1.0 - smoothstep(0.46, 0.5, max(abs(luv.x - 0.5), abs(luv.y - 0.5)));
        vec3 col = biome;
        if (localW > 0.001) {
          vec4 sp = texture2D(tSplat, luv);
          vec3 cD = texture2D(tDirt, vWPos.xz / 3.2).rgb;
          vec3 cS = texture2D(tCobble, vWPos.xz / 2.4).rgb;
          vec3 w = sp.rgb + (fineN.r - 0.5) * 0.35 * vec3(1.0, 1.0, 0.0);
          w = max(w, 0.0);
          w = pow(w, vec3(1.6));
          w /= max(w.r + w.g + w.b, 1e-4);
          vec3 local = cS * w.r + cD * w.g + biome * w.b;
          col = mix(biome, local, localW);
        }

        // The road network beyond the authored town splat: packed dirt, cobbles near towns.
        vec2 ruv = (vWPos.xz - uRoadRect.xy) / uRoadRect.zw;
        if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) {
          vec2 rd = texture2D(tRoads, ruv).rg;
          float outside = 1.0 - localW;
          float edge = (fineN.r - 0.5) * 0.45 + (patchN.g - 0.5) * 0.2;
          float wD = smoothstep(0.2, 0.62, rd.r + edge) * outside;
          float wC = smoothstep(0.25, 0.6, rd.g + edge) * outside;
          vec3 dirtC = texture2D(tDirt, vWPos.xz / 3.2).rgb;
          // Two wheel ruts along the middle of the dirt.
          dirtC *= mix(1.0, 0.86, smoothstep(0.8, 0.95, rd.r) * (0.5 + 0.5 * sin(fineN.b * 6.0)));
          col = mix(col, dirtC, wD);
          col = mix(col, texture2D(tCobble, vWPos.xz / 2.4).rgb, wC);
        }

        // Wildflowers on meadows: dots in the middle distance, a wash far away.
        float meadow = smoothstep(0.1, 0.02, abs(bioL - dot(gNear, vec3(0.3, 0.55, 0.15))));
        float fDens = flowerDensity(vWPos.xz) * meadow * (1.0 - snowW);
        if (fDens > 0.02) {
          float kf = flowerKind(vWPos.xz);
          vec3 fc = kf < 0.5 ? vec3(0.95, 0.93, 0.86) : kf < 1.5 ? vec3(0.95, 0.76, 0.14) : kf < 2.5 ? vec3(0.45, 0.5, 0.95) : vec3(0.86, 0.3, 0.2);
          vec2 cellP = vWPos.xz * 3.0;
          float pick = fh(floor(cellP));
          float dotShape = smoothstep(0.24, 0.1, length(fract(cellP) - 0.5));
          float mid = smoothstep(12.0, 18.0, dist) * (1.0 - smoothstep(45.0, 70.0, dist));
          float flatGround = smoothstep(0.9, 0.97, normalize(vWN).y);
          col = mix(col, fc, step(pick, fDens * 0.22) * dotShape * 0.8 * mid * flatGround);
          col = mix(col, mix(col, fc, 0.4), fDens * 0.1 * smoothstep(45.0, 70.0, dist));
        }
        // Steep ground: rock strata (snowy ledges up high), moss on gentle ledges.
        vec3 wn = normalize(vWN);
        float tRock = smoothstep(0.3, 0.46, 1.0 - wn.y);
        if (tRock > 0.01) {
          vec3 cR = strata(vec3(0.34, 0.32, 0.3), vec3(0.5, 0.47, 0.42), vWPos.y, fineN, patchN, dist);
          float moss = smoothstep(0.62, 0.75, wn.y + (fineN.r - 0.5) * 0.3) * (1.0 - snowW);
          cR = mix(cR, gNear * 1.1, moss);
          cR = mix(cR, vec3(0.86, 0.9, 0.96), snowW * smoothstep(0.55, 0.8, wn.y + fineN.g * 0.2));
          col = mix(col, cR, tRock);
        }
        // Below the waterline (only where the map has sea): pale sand shelving to darker seabed.
        vec2 ec = (vWPos.xz - uWorld.xy) / 60.0 - 0.5;
        vec2 e0 = floor(ec), ef = fract(ec);
        float me = mix(mix(texture2D(tMacro, (e0 + 0.5) / uGrid).b, texture2D(tMacro, (e0 + vec2(1.5, 0.5)) / uGrid).b, ef.x),
                       mix(texture2D(tMacro, (e0 + vec2(0.5, 1.5)) / uGrid).b, texture2D(tMacro, (e0 + 1.5) / uGrid).b, ef.x), ef.y);
        float seaHere = smoothstep(${(SEA_LEVEL + 1.4).toFixed(2)}, ${(SEA_LEVEL + 0.4).toFixed(2)}, -80.0 + me * 800.0);
        float under = smoothstep(${(SEA_LEVEL + 0.6).toFixed(2)}, ${(SEA_LEVEL - 0.4).toFixed(2)}, vWPos.y) * seaHere;
        vec3 seabed = mix(vec3(0.86, 0.78, 0.56), vec3(0.36, 0.42, 0.36), smoothstep(${(SEA_LEVEL - 0.5).toFixed(2)}, ${(SEA_LEVEL - 12.0).toFixed(2)}, vWPos.y));
        col = mix(col, seabed * mix(0.94, 1.06, fineN.b), under);
        // Rain darkens the ground (rock and paths most, grass a little).
        col *= 1.0 - uWet * mix(0.14, 0.32, max(tRock, 1.0 - smoothstep(0.1, 0.4, dot(col, vec3(0.3, 0.55, 0.15)) - 0.2)));
        diffuseColor.rgb *= col;`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += terrainGlow;');
  };
  return { mat, uniforms };
}

// ---- streamed tiles ------------------------------------------------------------
const TILE_LODS = [128, 64, 32, 16]; // segments per 256 m tile: 2, 4, 8, 16 m
const LOD_DIST = [180, 420, 760];
/** Tiles kept around the camera tile in each direction (a 9 x 9 block). */
const RING = 4;
const FAR_STEP = 120;

/** Tile grid geometry (from its height tile) with a skirt hiding LOD cracks. */
function tileGeometry(i: number, j: number, seg: number) {
  const data = tileData(i, j);
  const n = seg + 1;
  const stride = TILE_SEG / seg;
  const step = TILE / seg;
  const x0 = i * TILE, z0 = j * TILE;
  const count = n * n + 4 * n;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  let k = 0;
  const put = (a: number, b: number, drop: number) => {
    const x = x0 + a * step, z = z0 + b * step;
    const h = data[b * stride * TILE_N + a * stride];
    normalAt(x, z, v);
    pos[k * 3] = x; pos[k * 3 + 1] = h - drop; pos[k * 3 + 2] = z;
    nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
    k++;
  };
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) put(a, b, 0);
  const idx: number[] = [];
  for (let b = 0; b < seg; b++) for (let a = 0; a < seg; a++) {
    const p = b * n + a, q = p + 1, r = p + n, s = r + 1;
    idx.push(p, r, q, q, r, s);
  }
  const edges = [
    Array.from({ length: n }, (_, a) => [a, 0]),
    Array.from({ length: n }, (_, a) => [a, seg]),
    Array.from({ length: n }, (_, b) => [0, b]),
    Array.from({ length: n }, (_, b) => [seg, b]),
  ];
  for (const e of edges) {
    const base = k;
    for (const [a, b] of e) put(a, b, 6);
    for (let t = 0; t < n - 1; t++) {
      const p = e[t][1] * n + e[t][0], q = e[t + 1][1] * n + e[t + 1][0], r = base + t, s = base + t + 1;
      idx.push(p, q, r, q, s, r, p, r, q, q, r, s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

interface TerrainTile {
  i: number;
  j: number;
  mesh: THREE.Mesh;
  geos: (THREE.BufferGeometry | null)[];
  lod: number;
  collider: RAPIER.Collider | null;
}

/**
 * The ground of the whole world: 256 m tiles streamed around the camera (a
 * 9 x 9 block, detail by distance, collision near the player) over one far
 * mesh covering the continent. Height tiles come from a worker a ring ahead,
 * so meshes build from ready data; at most a couple of meshes build per frame.
 */
export class Terrain {
  readonly group = new THREE.Group();
  readonly splat: THREE.DataTexture;
  private tiles = new Map<number, TerrainTile>();
  private mat: THREE.MeshStandardMaterial;
  private farMat: THREE.MeshStandardMaterial;
  private farUniforms: ReturnType<typeof terrainMaterial>['uniforms'];
  private far: THREE.Mesh;
  private worker: Worker | null = null;
  private inflight = new Set<number>();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.splat = buildSplatTexture();
    this.mat = terrainMaterial(renderer, this.splat).mat;
    const far = terrainMaterial(renderer, this.splat);
    this.farMat = far.mat;
    this.farUniforms = far.uniforms;
    this.far = new THREE.Mesh(farGeometry(), this.farMat);
    this.far.name = 'terrain-far';
    this.far.receiveShadow = false;
    this.far.frustumCulled = false;
    this.group.add(this.far);
    this.group.name = 'terrain';
    scene.add(this.group);
    try {
      this.worker = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      this.worker.postMessage({ type: 'init', cells: macroCells() });
      this.worker.onmessage = (e: MessageEvent) => {
        const { i, j, data } = e.data as { i: number; j: number; data: Float32Array };
        this.inflight.delete(tileKey(i, j));
        if (!hasTile(i, j)) putTile(i, j, data);
      };
    } catch {
      this.worker = null; // tiles are then computed on the main thread
    }
  }

  /** Stream tiles, pick detail by distance and keep collision around the player. */
  update(camera: THREE.Vector3, player: THREE.Vector3, budget = 2) {
    const ci = Math.floor(camera.x / TILE), cj = Math.floor(camera.z / TILE);
    // Ask the worker for heights one ring beyond the meshes, nearest first.
    if (this.worker) {
      const want: [number, number, number][] = [];
      for (let dj = -RING - 1; dj <= RING + 1; dj++) for (let di = -RING - 1; di <= RING + 1; di++) {
        const i = ci + di, j = cj + dj;
        if (!hasTile(i, j) && !this.inflight.has(tileKey(i, j))) want.push([di * di + dj * dj, i, j]);
      }
      want.sort((a, b) => a[0] - b[0]);
      for (const [, i, j] of want) {
        if (this.inflight.size >= 3) break;
        this.inflight.add(tileKey(i, j));
        this.worker.postMessage({ type: 'tile', i, j });
      }
    }
    // Build missing meshes (nearest first) within the per-frame budget.
    const missing: [number, number, number][] = [];
    for (let dj = -RING; dj <= RING; dj++) for (let di = -RING; di <= RING; di++) {
      const i = ci + di, j = cj + dj;
      if (this.tiles.has(tileKey(i, j))) continue;
      const nearPlayer = Math.abs(Math.floor(player.x / TILE) - i) <= 1 && Math.abs(Math.floor(player.z / TILE) - j) <= 1;
      if (!nearPlayer && !hasTile(i, j)) continue; // wait for the worker
      missing.push([di * di + dj * dj - (nearPlayer ? 1000 : 0), i, j]);
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of missing.slice(0, budget)) this.addTile(i, j);
    // Detail, collision and unloading.
    for (const [key, t] of this.tiles) {
      const di = t.i - ci, dj = t.j - cj;
      if (Math.abs(di) > RING + 1 || Math.abs(dj) > RING + 1) {
        this.removeTile(key, t);
        continue;
      }
      const mx = (t.i + 0.5) * TILE, mz = (t.j + 0.5) * TILE;
      const d = Math.max(0, Math.hypot(camera.x - mx, camera.z - mz) - TILE * 0.7);
      const lod = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : d < LOD_DIST[2] ? 2 : 3;
      if (lod !== t.lod) {
        t.geos[lod] ??= tileGeometry(t.i, t.j, TILE_LODS[lod]);
        t.mesh.geometry = t.geos[lod]!;
        t.lod = lod;
      }
      const pi = Math.floor(player.x / TILE), pj = Math.floor(player.z / TILE);
      const near = Math.abs(t.i - pi) <= 1 && Math.abs(t.j - pj) <= 1;
      if (near && !t.collider) t.collider = this.buildCollider(t.i, t.j);
      else if (!near && t.collider && (Math.abs(t.i - pi) > 2 || Math.abs(t.j - pj) > 2)) {
        physics.removeStatic(t.collider);
        t.collider = null;
      }
    }
    // The far mesh gives way to real tiles inside the streamed block.
    (this.farUniforms.uHole.value as THREE.Vector3).set((ci + 0.5) * TILE, (cj + 0.5) * TILE, (RING - 0.25) * TILE);
  }

  /** Build every tile and collider around the player now (spawns, teleports, tests). */
  warm(player: THREE.Vector3) {
    this.update(player, player, 1000);
  }

  get tileCount() {
    return this.tiles.size;
  }

  setWet(w: number) {
    WET.value = w;
  }

  private addTile(i: number, j: number) {
    const geos: (THREE.BufferGeometry | null)[] = [null, null, null, tileGeometry(i, j, TILE_LODS[3])];
    const mesh = new THREE.Mesh(geos[3]!, this.mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.group.add(mesh);
    this.tiles.set(tileKey(i, j), { i, j, mesh, geos, lod: 3, collider: null });
  }

  private removeTile(key: number, t: TerrainTile) {
    this.group.remove(t.mesh);
    for (const g of t.geos) g?.dispose();
    if (t.collider) physics.removeStatic(t.collider);
    this.tiles.delete(key);
  }

  private buildCollider(i: number, j: number) {
    const data = tileData(i, j);
    // Heightfield samples are column-major: column along +X, row along +Z.
    const n = TILE_N;
    const hf = new Float32Array(n * n);
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) hf[a * n + b] = data[b * n + a];
    return physics.addHeightfield(new THREE.Vector3((i + 0.5) * TILE, 0, (j + 0.5) * TILE), TILE_SEG, TILE_SEG, hf, TILE, TILE);
  }

  dispose() {
    for (const [key, t] of this.tiles) this.removeTile(key, t);
    this.far.geometry.dispose();
    this.mat.dispose();
    this.farMat.dispose();
    this.worker?.terminate();
  }
}

/** One mesh for the whole continent (120 m grid), shown beyond the streamed tiles. */
function farGeometry() {
  const nx = Math.ceil(WORLD_W / FAR_STEP) + 1, nz = Math.ceil(WORLD_H / FAR_STEP) + 1;
  const pos = new Float32Array(nx * nz * 3);
  for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
    const x = WORLD_X0 + a * FAR_STEP, z = WORLD_Z0 + b * FAR_STEP;
    const k = (b * nx + a) * 3;
    // Sit slightly low so near tiles always win where both are drawn.
    pos[k] = x; pos[k + 1] = macroOrLocal(x, z) - 1.5; pos[k + 2] = z;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) {
    const p = b * nx + a, q = p + 1, r = p + nx, s = r + 1;
    idx[k++] = p; idx[k++] = r; idx[k++] = q; idx[k++] = q; idx[k++] = r; idx[k++] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
/** Far-mesh heights: the full world function near town, macro heights elsewhere (cheap). */
function macroOrLocal(x: number, z: number) {
  return Math.hypot(x, z) < LOCAL_R1 ? worldHeightFn(x, z) : macroHeight(x, z);
}
