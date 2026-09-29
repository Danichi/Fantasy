import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { compressedGltf } from '../core/gltf';
import { heightAt, hasTile, riverX, roadDist, TOWN_R, WORLD_SIZE, CRYPT, TILE, PORT_AURELLE, LOCAL_R0 } from './terrainHeight';
import { reliefAt, regionAt, RELIEF, SEA_LEVEL } from './worldMap';
import { fbm, mulberry32, smoothstep } from '../core/math';
import { physics } from '../physics/physics';

// Trees and understory for the whole world (docs/ART-DIRECTION.md §5).
//
// Each 256 m tile gets a deterministic scatter (seeded by its tile index)
// driven by the map's relief: dense forests, groves on the plains, pines on
// mountain flanks, marsh thickets. Elder Glen keeps its authored groves.
//   near  (< NEAR_R)   the real Quaternius models, instanced per prototype
//   far   (tile ring)  camera-facing impostors baked at startup from those
//                      same models, one static InstancedMesh per tile
//   trees near the player get cylinder colliders
// Beyond the streamed tiles, forests read through the terrain's forest-floor
// colour on the far mesh.

type Kind = 'tree' | 'pine' | 'fern' | 'flower' | 'mushroom';

interface AssetSpec {
  file: string;
  kind: Kind;
  targetHeight: number;
}

interface PrototypeMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  local: THREE.Matrix4;
  castShadow: boolean;
}

interface Prototype {
  spec: AssetSpec;
  meshes: PrototypeMesh[];
  height: number;
  /** impostor atlas cell, trees and pines only */
  atlas: number;
  /** trunk radius at scale 1 in model units (for colliders) */
  trunk: number;
  /** impostor quad height as a multiple of the tree's height */
  span: number;
  /** impostor quad width / height */
  aspect: number;
}

const ASSETS: AssetSpec[] = [
  { file: 'CommonTree_1.glb', kind: 'tree', targetHeight: 13 },
  { file: 'CommonTree_2.glb', kind: 'tree', targetHeight: 16 },
  { file: 'CommonTree_3.glb', kind: 'tree', targetHeight: 12 },
  { file: 'CommonTree_4.glb', kind: 'tree', targetHeight: 18 },
  { file: 'CommonTree_5.glb', kind: 'tree', targetHeight: 14 },
  { file: 'Pine_1.glb', kind: 'pine', targetHeight: 17 },
  { file: 'Pine_2.glb', kind: 'pine', targetHeight: 21 },
  { file: 'Pine_4.glb', kind: 'pine', targetHeight: 18 },
  { file: 'Pine_5.glb', kind: 'pine', targetHeight: 15 },
  { file: 'Fern_1.glb', kind: 'fern', targetHeight: 0.9 },
  { file: 'Flower_3_Group.glb', kind: 'flower', targetHeight: 0.8 },
  { file: 'Mushroom_Common.glb', kind: 'mushroom', targetHeight: 0.55 },
];

const NEAR_R = 95; // full meshes inside this radius
const FADE = 14; // impostor/mesh cross-fade band (m)
const UNDER_R = 70; // understory radius
const COLLIDE_R = 34; // tree colliders around the player
const RING = 4; // tiles kept around the camera tile (matches the terrain)
const NEAR_CAP = 900; // per-prototype capacity for near meshes
const CW = 256, CH = 384; // impostor atlas cell (px)

/** Per-tile scatter: 6 floats per instance [x, y, z, rot, scale, proto]. */
interface VegTile {
  i: number;
  j: number;
  trees: Float32Array;
  under: Float32Array;
  impostor: THREE.InstancedMesh | null;
}

function meshLocalMatrices(root: THREE.Object3D): PrototypeMesh[] {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const out: PrototypeMesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name.toLowerCase();
    const foliage = /leaf|foliage|flower|grass|fern|needle|canopy/.test(name);
    out.push({ geometry: mesh.geometry, material: mesh.material, local: inv.clone().multiply(mesh.matrixWorld), castShadow: !foliage });
  });
  return out;
}

function modelBox(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

/** Tile-seeded RNG (deterministic for a tile, stable across reloads). */
const tileRng = (i: number, j: number, salt: number) => mulberry32(((i * 73856093) ^ (j * 19349663) ^ (salt * 83492791)) >>> 0);
const vegKey = (i: number, j: number) => (i + 2048) * 4096 + (j + 2048);

export class StylizedNature {
  private readonly loader = compressedGltf;
  private prototypes: Prototype[] = [];
  private tiles = new Map<number, VegTile>();
  private near: { mesh: THREE.InstancedMesh; proto: number; local: THREE.Matrix4 }[] = [];
  private atlas: THREE.WebGLRenderTarget | null = null;
  private readonly atlasCols = 4;
  private readonly atlasRows = 3;
  private impostorGeo: THREE.BufferGeometry | null = null;
  private impostorMat: THREE.ShaderMaterial | null = null;
  private impostorUniforms = {
    uCam: { value: new THREE.Vector3() },
    uNear: { value: NEAR_R },
    uFade: { value: FADE },
    tAtlas: { value: null as THREE.Texture | null },
    uGrid: { value: new THREE.Vector2(4, 3) },
  };
  private colliders = new Map<string, RAPIER.Collider>();
  private townTrees = new Float32Array(0);
  private townUnder = new Float32Array(0);
  private loadedAny = false;
  private visible = true;
  private refreshT = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private trees: number[] = [];
  private pines: number[] = [];
  private smalls: Record<'fern' | 'flower' | 'mushroom', number[]> = { fern: [], flower: [], mushroom: [] };

  readonly ready: Promise<void>;

  /** `town`: extra tree and flower spots chosen by the village layout. */
  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly town?: { treeSpots: THREE.Vector3[]; flowerSpots: THREE.Vector3[] },
  ) {
    this.ready = this.load();
  }

  get loaded() {
    return this.loadedAny;
  }

  get tileCount() {
    return this.tiles.size;
  }

  private async load() {
    const loaded: { spec: AssetSpec; root: THREE.Object3D }[] = [];
    await Promise.all(
      ASSETS.map(async (spec) => {
        try {
          const gltf = await this.loader.loadAsync('/assets/vendor/stylized/' + spec.file);
          loaded.push({ spec, root: gltf.scene });
        } catch (error) {
          console.warn('[visual-assets] missing', spec.file, error);
        }
      }),
    );
    loaded.sort((a, b) => ASSETS.indexOf(a.spec) - ASSETS.indexOf(b.spec));
    if (!loaded.some(({ spec }) => spec.kind === 'tree')) {
      this.visible = false;
      return;
    }
    let cell = 0;
    for (const item of loaded) {
      const meshes = meshLocalMatrices(item.root);
      if (!meshes.length) continue;
      const size = modelBox(item.root).getSize(new THREE.Vector3());
      const isTree = item.spec.kind === 'tree' || item.spec.kind === 'pine';
      const idx = this.prototypes.length;
      this.prototypes.push({
        spec: item.spec,
        meshes,
        height: Math.max(0.01, size.y),
        atlas: isTree ? cell++ : -1,
        trunk: Math.max(size.x, size.z) * 0.035,
        span: 1.04,
        aspect: CW / CH,
      });
      if (item.spec.kind === 'tree') this.trees.push(idx);
      else if (item.spec.kind === 'pine') this.pines.push(idx);
      else this.smalls[item.spec.kind].push(idx);
    }
    this.bakeImpostors();
    this.buildNearMeshes();
    this.placeTown();
    this.loadedAny = true;
  }

  // ---- impostors ------------------------------------------------------------------

  /** Render each tree prototype once into an atlas cell (side view, lit like midday). */
  private bakeImpostors() {
    this.atlas = new THREE.WebGLRenderTarget(CW * this.atlasCols, CH * this.atlasRows, { samples: 4 });
    this.atlas.texture.colorSpace = THREE.SRGBColorSpace;
    this.atlas.texture.generateMipmaps = true;
    this.atlas.texture.minFilter = THREE.LinearMipmapLinearFilter;
    const bakeScene = new THREE.Scene();
    bakeScene.add(new THREE.HemisphereLight(0xb8d4ff, 0x5a6a3a, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(-3, 5, 4);
    bakeScene.add(sun);
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.atlas);
    r.setClearColor(0x000000, 0);
    r.clear();
    for (const proto of this.prototypes) {
      if (proto.atlas < 0) continue;
      const group = new THREE.Group();
      for (const part of proto.meshes) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.applyMatrix4(part.local);
        group.add(mesh);
      }
      const box = modelBox(group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const aspect = CW / CH;
      // Frame the tree: base on the cell's bottom edge, a little headroom.
      const halfH = Math.max(size.y * 0.52, (Math.max(size.x, size.z) * 0.55) / aspect);
      const cam = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.1, 400);
      cam.position.set(center.x, box.min.y + halfH, center.z + 150);
      cam.lookAt(center.x, box.min.y + halfH, center.z);
      bakeScene.add(group);
      const col = proto.atlas % this.atlasCols, row = Math.floor(proto.atlas / this.atlasCols);
      const vx = col * CW, vy = (this.atlasRows - 1 - row) * CH;
      r.setViewport(vx, vy, CW, CH);
      r.setScissor(vx, vy, CW, CH);
      r.setScissorTest(true);
      r.render(bakeScene, cam);
      bakeScene.remove(group);
      proto.span = (2 * halfH) / size.y;
      proto.aspect = aspect;
    }
    r.setScissorTest(false);
    r.setRenderTarget(prevTarget);
    r.setViewport(0, 0, r.domElement.width / r.getPixelRatio(), r.domElement.height / r.getPixelRatio());
    r.setClearColor(prevClear, prevAlpha);
    this.impostorUniforms.tAtlas.value = this.atlas.texture;
    this.impostorUniforms.uGrid.value.set(this.atlasCols, this.atlasRows);

    // Camera-facing (cylindrical) billboard, base at the instance origin.
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    this.impostorGeo = g;
    this.impostorMat = new THREE.ShaderMaterial({
      uniforms: this.impostorUniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aImp; // width, height, atlas cell, brightness
        uniform vec3 uCam; uniform float uNear, uFade;
        varying vec2 vUv; varying float vCell; varying float vFade; varying float vBright;
        void main() {
          vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 toCam = uCam - base; toCam.y = 0.0;
          float d = length(toCam);
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
          vec3 wp = base + right * position.x * aImp.x + vec3(0.0, position.y * aImp.y, 0.0);
          vUv = uv; vCell = aImp.z; vBright = aImp.w;
          vFade = smoothstep(uNear - uFade, uNear, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAtlas; uniform vec2 uGrid;
        varying vec2 vUv; varying float vCell; varying float vFade; varying float vBright;
        // Interleaved gradient noise (0..1) for the dithered fade.
        float bayer(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main() {
          float col = mod(vCell, uGrid.x), row = floor(vCell / uGrid.x);
          vec2 uv = vec2((col + vUv.x) / uGrid.x, (uGrid.y - row - 1.0 + vUv.y) / uGrid.y);
          vec4 c = texture2D(tAtlas, uv);
          // Dithered cross-fade with the real meshes near the camera.
          if (c.a < 0.5 || vFade < bayer(gl_FragCoord.xy)) discard;
          gl_FragColor = vec4(c.rgb * vBright, 1.0);
        }`,
    });
  }

  // ---- near meshes ---------------------------------------------------------------

  private buildNearMeshes() {
    for (const [pi, proto] of this.prototypes.entries()) {
      const isTree = proto.atlas >= 0;
      for (const part of proto.meshes) {
        const mat = Array.isArray(part.material) ? part.material.map((m) => m.clone()) : (part.material as THREE.Material).clone();
        const mesh = new THREE.InstancedMesh(part.geometry, mat, isTree ? NEAR_CAP : 700);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(mesh);
        this.near.push({ mesh, proto: pi, local: part.local });
      }
    }
  }

  // ---- placement -----------------------------------------------------------------

  /** Keep clear of towns, roads, the river and the crypt apron. */
  private clearSpot(x: number, z: number) {
    const r = Math.hypot(x, z);
    if (r < TOWN_R + 8) return false;
    if (roadDist(x, z) < 6.5) return false;
    if (r < LOCAL_R0 + 200 && Math.abs(x - riverX(z)) < 11 && Math.abs(z) < 440) return false;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.y - 12) < 28) return false;
    if (Math.hypot(x - PORT_AURELLE.x, z - PORT_AURELLE.y) < 210) return false;
    return true;
  }

  /** Tree probability, type and size multiplier at a point. */
  private density(x: number, z: number): [number, 'tree' | 'pine' | 'mix', number] {
    const H = WORLD_SIZE / 2;
    const h = heightAt(x, z);
    if (h < SEA_LEVEL + 0.8) return [0, 'tree', 1];
    if (Math.abs(x) < H - 20 && Math.abs(z) < H - 20) {
      // Elder Glen's authored groves (the original 1 km layout).
      const grove = fbm(x * 0.011 + 8, z * 0.011 - 4, 4);
      const riverBank = smoothstep(26, 13, Math.abs(x - riverX(z)));
      const westForest = smoothstep(-70, -190, x);
      const northPines = smoothstep(-120, -265, z);
      const fieldGap = smoothstep(0.62, 0.78, grove);
      const d = Math.max(westForest * (0.32 + grove * 0.8), fieldGap * 0.42, riverBank * 0.16, northPines * 0.28) * 0.75;
      return [d, northPines > 0.48 || h > 28 ? 'pine' : 'mix', 1];
    }
    const rel = reliefAt(x, z);
    const region = regionAt(x, z);
    const grove = fbm(x * 0.009 + 3.1, z * 0.009 - 7.3, 3);
    const alpine = region === 'whiteMountains' || region === 'deepMountains' || region === 'frostedPeaks';
    // Ancient forests grow taller the further north into the elven woods.
    const giant = region === 'verdantElves' ? 1.2 + smoothstep(-2200, -3600, z) * 0.9 : region === 'deepWilderness' ? 1.35 : 1;
    switch (rel) {
      case RELIEF.forest: return [0.5 + grove * 0.3, alpine || z < -4200 ? 'pine' : 'mix', giant];
      case RELIEF.open: return [smoothstep(0.58, 0.8, grove) * 0.4 + 0.012, alpine ? 'pine' : 'tree', giant];
      case RELIEF.marsh: return [0.12 + grove * 0.15, 'tree', giant];
      case RELIEF.mountain: return [h < 320 ? 0.16 + grove * 0.2 : h < 420 ? 0.05 : 0, 'pine', 1];
      case RELIEF.mesa: return [0.004, 'tree', 0.8];
      case RELIEF.volcanic: return [0.01, 'pine', 0.9];
      default: return [0, 'tree', 1];
    }
  }

  private generateTile(i: number, j: number): VegTile {
    const rnd = tileRng(i, j, 1);
    const x0 = i * TILE, z0 = j * TILE;
    const step = 9;
    const trees: number[] = [];
    for (let z = z0; z < z0 + TILE; z += step) {
      for (let x = x0; x < x0 + TILE; x += step) {
        // Always draw the same numbers per candidate so tiles stay deterministic.
        const px = x + rnd() * step, pz = z + rnd() * step;
        const roll = rnd(), pick = rnd(), scaleR = rnd(), rot = rnd() * Math.PI * 2;
        if (!this.clearSpot(px, pz)) continue;
        const [d, type, giant] = this.density(px, pz);
        if (roll > d) continue;
        const list = type === 'pine' ? this.pines : type === 'tree' ? this.trees : pick < 0.72 ? this.trees : this.pines;
        if (!list.length) continue;
        const proto = list[Math.floor(pick * 997) % list.length];
        trees.push(px, heightAt(px, pz) - 0.08, pz, rot, (0.82 + scaleR * 0.36) * giant, proto);
      }
    }
    // Understory: ferns and mushrooms in woods, flower clumps in meadows.
    const under: number[] = [];
    const ur = tileRng(i, j, 2);
    const ustep = 7;
    for (let z = z0; z < z0 + TILE; z += ustep) {
      for (let x = x0; x < x0 + TILE; x += ustep) {
        const px = x + ur() * ustep, pz = z + ur() * ustep;
        const roll = ur(), pick = ur(), sc = ur(), rot = ur() * Math.PI * 2;
        if (!this.clearSpot(px, pz)) continue;
        const [d] = this.density(px, pz);
        const wood = d > 0.25;
        const meadow = d < 0.2 && heightAt(px, pz) > SEA_LEVEL + 1 && fbm(px * 0.025, pz * 0.025, 3) > 0.55;
        if (!(wood && roll < 0.35) && !(meadow && roll < 0.18)) continue;
        const list = wood ? (pick < 0.7 ? this.smalls.fern : this.smalls.mushroom) : this.smalls.flower;
        if (!list.length) continue;
        under.push(px, heightAt(px, pz) - 0.02, pz, rot, 0.72 + sc * 0.65, list[Math.floor(pick * 991) % list.length]);
      }
    }
    return { i, j, trees: new Float32Array(trees), under: new Float32Array(under), impostor: null };
  }

  /** Yard and green trees (a little smaller than wild ones) and flowers by walls and fences. */
  private placeTown() {
    if (!this.town) return;
    const rnd = mulberry32(3301);
    const t: number[] = [];
    for (const p of this.town.treeSpots) {
      if (!this.trees.length) break;
      t.push(p.x, p.y - 0.05, p.z, rnd() * Math.PI * 2, 0.55 + rnd() * 0.25, this.trees[Math.floor(rnd() * this.trees.length)]);
    }
    const u: number[] = [];
    const small = [...this.smalls.flower, ...this.smalls.flower, ...this.smalls.fern];
    for (const p of this.town.flowerSpots) {
      if (!small.length) break;
      u.push(p.x, p.y - 0.02, p.z, rnd() * Math.PI * 2, 0.7 + rnd() * 0.5, small[Math.floor(rnd() * small.length)]);
    }
    this.townTrees = new Float32Array(t);
    this.townUnder = new Float32Array(u);
  }

  private buildImpostor(trees: Float32Array, seed: [number, number]) {
    if (!this.impostorGeo || !this.impostorMat) return null;
    const n = trees.length / 6;
    if (!n) return null;
    const geo = this.impostorGeo.clone();
    const imp = new Float32Array(n * 4);
    const rnd = tileRng(seed[0], seed[1], 3);
    const mesh = new THREE.InstancedMesh(geo, this.impostorMat, n);
    for (let k = 0; k < n; k++) {
      const o = k * 6;
      const proto = this.prototypes[trees[o + 5]];
      const h = proto.spec.targetHeight * trees[o + 4];
      this.m.makeTranslation(trees[o], trees[o + 1], trees[o + 2]);
      mesh.setMatrixAt(k, this.m);
      imp[k * 4] = h * proto.span * proto.aspect;
      imp[k * 4 + 1] = h * proto.span;
      imp[k * 4 + 2] = proto.atlas;
      imp[k * 4 + 3] = 0.9 + rnd() * 0.2;
    }
    geo.setAttribute('aImp', new THREE.InstancedBufferAttribute(imp, 4));
    mesh.frustumCulled = false;
    mesh.visible = this.visible;
    this.scene.add(mesh);
    return mesh;
  }

  private disposeTile(t: VegTile) {
    if (!t.impostor) return;
    this.scene.remove(t.impostor);
    t.impostor.geometry.dispose();
    t.impostor.dispose();
    t.impostor = null;
  }

  // ---- per-frame ---------------------------------------------------------------------

  update(dt: number, camera: THREE.Vector3, player?: THREE.Vector3) {
    if (!this.loadedAny) return;
    this.impostorUniforms.uCam.value.copy(camera);
    // Stream tiles (at most two new tiles per frame, nearest first).
    const ci = Math.floor(camera.x / TILE), cj = Math.floor(camera.z / TILE);
    const want: [number, number, number][] = [];
    const L = WORLD_SIZE / 2 + TILE;
    for (let dj = -RING; dj <= RING; dj++) for (let di = -RING; di <= RING; di++) {
      const i = ci + di, j = cj + dj;
      if (this.tiles.has(vegKey(i, j))) continue;
      const local = Math.abs((i + 0.5) * TILE) < L && Math.abs((j + 0.5) * TILE) < L;
      if (!local && !hasTile(i, j) && di * di + dj * dj > 2) continue; // wait for terrain heights
      want.push([di * di + dj * dj, i, j]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of want.slice(0, 2)) {
      const t = this.generateTile(i, j);
      t.impostor = this.buildImpostor(t.trees, [i, j]);
      this.tiles.set(vegKey(i, j), t);
    }
    for (const [key, t] of this.tiles) {
      if (Math.abs(t.i - ci) > RING + 1 || Math.abs(t.j - cj) > RING + 1) {
        this.disposeTile(t);
        this.tiles.delete(key);
      }
    }
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.25;
    this.rebuildNear(camera);
    if (player) this.updateColliders(player);
  }

  /** Warm up around a point now (boot, teleports, tests). */
  warm(camera: THREE.Vector3, player: THREE.Vector3) {
    for (let k = 0; k < 60; k++) this.update(0, camera, player);
    this.refreshT = 0;
    this.update(0, camera, player);
  }

  /** Real meshes for everything inside the near radius. */
  private rebuildNear(camera: THREE.Vector3) {
    const counts = new Map<THREE.InstancedMesh, number>();
    const add = (arr: Float32Array, radius: number) => {
      for (let o = 0; o < arr.length; o += 6) {
        const dx = arr[o] - camera.x, dz = arr[o + 2] - camera.z;
        if (dx * dx + dz * dz > radius * radius) continue;
        const pi = arr[o + 5];
        const proto = this.prototypes[pi];
        const scale = (proto.spec.targetHeight / proto.height) * arr[o + 4];
        this.q.setFromAxisAngle(this.up, arr[o + 3]);
        this.s.setScalar(scale);
        this.p.set(arr[o], arr[o + 1], arr[o + 2]);
        this.m.compose(this.p, this.q, this.s);
        for (const n of this.near) {
          if (n.proto !== pi) continue;
          const c = counts.get(n.mesh) ?? 0;
          if (c >= n.mesh.instanceMatrix.count) continue;
          n.mesh.setMatrixAt(c, this.m.clone().multiply(n.local));
          counts.set(n.mesh, c + 1);
        }
      }
    };
    const ci = Math.floor(camera.x / TILE), cj = Math.floor(camera.z / TILE);
    for (const t of this.tiles.values()) {
      if (Math.abs(t.i - ci) > 1 || Math.abs(t.j - cj) > 1) continue;
      add(t.trees, NEAR_R);
      add(t.under, UNDER_R);
    }
    add(this.townTrees, NEAR_R);
    add(this.townUnder, UNDER_R);
    for (const n of this.near) {
      n.mesh.count = counts.get(n.mesh) ?? 0;
      n.mesh.instanceMatrix.needsUpdate = true;
      n.mesh.visible = this.visible;
    }
  }

  /** Trunk colliders for trees near the player (added and removed as they walk). */
  private updateColliders(player: THREE.Vector3) {
    const keep = new Set<string>();
    const pi = Math.floor(player.x / TILE), pj = Math.floor(player.z / TILE);
    const visit = (arr: Float32Array, tag: string) => {
      for (let o = 0; o < arr.length; o += 6) {
        const proto = this.prototypes[arr[o + 5]];
        if (proto.atlas < 0) continue;
        const dx = arr[o] - player.x, dz = arr[o + 2] - player.z;
        if (dx * dx + dz * dz > COLLIDE_R * COLLIDE_R) continue;
        const id = tag + ':' + o;
        keep.add(id);
        if (this.colliders.has(id)) continue;
        const r = proto.trunk * arr[o + 4] * (proto.spec.targetHeight / proto.height);
        this.colliders.set(id, physics.addCylinder(new THREE.Vector3(arr[o], arr[o + 1] + 2, arr[o + 2]), 2, Math.max(0.22, Math.min(0.7, r))));
      }
    };
    for (const t of this.tiles.values()) if (Math.abs(t.i - pi) <= 1 && Math.abs(t.j - pj) <= 1) visit(t.trees, `${t.i},${t.j}`);
    visit(this.townTrees, 'town');
    for (const [id, c] of this.colliders) {
      if (keep.has(id)) continue;
      physics.removeStatic(c);
      this.colliders.delete(id);
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const n of this.near) n.mesh.visible = visible;
    for (const t of this.tiles.values()) if (t.impostor) t.impostor.visible = visible;
  }

  dispose() {
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear();
    for (const c of this.colliders.values()) physics.removeStatic(c);
    this.colliders.clear();
    for (const n of this.near) {
      this.scene.remove(n.mesh);
      n.mesh.dispose();
    }
    this.atlas?.dispose();
    this.impostorGeo?.dispose();
    this.impostorMat?.dispose();
  }
}
