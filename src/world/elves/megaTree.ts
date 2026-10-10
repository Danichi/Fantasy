import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { megaTrees, WALK_TREES, WALK_DECK, WALK_BRIDGES, SITES } from './elvenForestData';

// The giants of the Ancient Forest (docs/design/verdant-elves.md §10): trees
// as tall as towers with buttressed trunks, root flares and crowns like
// green clouds. One procedural model in three levels of detail (a full mesh
// near, a lighter one in the middle distance, and a painted impostor card
// beyond 600 m), all instanced, so seventy giants cost a handful of draw
// calls. The Sentinel Walk's platforms, spiral stair and rope bridges are
// built here too, and the fallen giants the elves let you cut heartwood from.

const R0 = 0.042; // trunk radius as a fraction of height
const BARK_DARK = new THREE.Color(0x3a2c22), BARK_LIGHT = new THREE.Color(0x8a6a4c), MOSS = new THREE.Color(0x4a6a2a);
const LEAF = [new THREE.Color(0x2c6a3a), new THREE.Color(0x357a44), new THREE.Color(0x2a7266), new THREE.Color(0x4a8a3a)];
const LEAF_TOP = new THREE.Color(0xa8c860), LEAF_UNDER = new THREE.Color(0x1a4436);

/** Trunk radius at height y on a giant of height H (a wide flare into the roots). */
export function trunkRadius(y: number, H: number) {
  const R = R0 * H;
  return R * (1 + 1.45 * Math.exp(-Math.max(0, y) / (0.05 * H))) * (1 - 0.45 * Math.min(1, Math.max(0, y) / H));
}

function paint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const clean = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') out.deleteAttribute(k);
  return out;
};

/** A limb from a to b, tapering r0 to r1. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

export interface TreeParts { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry }

/**
 * One giant of height H, seeded. `detail` 0 is the near model, 1 the middle
 * distance. Opts tune the World Tree and Silverbough's home trees.
 */
export function buildGiant(seed: number, H: number, detail: 0 | 1, opts: { blobs?: number; crownScale?: number; roots?: number; lean?: number; girth?: number; rootReach?: number; rootHeight?: number } = {}): TreeParts {
  const rnd = mulberry32(seed);
  const gr = opts.girth ?? 1, rr = opts.rootReach ?? 1;
  const seg = detail === 0 ? 18 : 8, rings = detail === 0 ? 18 : 7;
  const bark: THREE.BufferGeometry[] = [];
  const lean = (opts.lean ?? 0.03) * H, leanA = rnd() * Math.PI * 2;
  const axis = (y: number) => new THREE.Vector3(Math.cos(leanA) * Math.sin((y / H) * Math.PI * 0.5) * lean, y, Math.sin(leanA) * Math.sin((y / H) * Math.PI * 0.5) * lean);
  // Trunk: a fluted, flaring column.
  {
    const g = new THREE.CylinderGeometry(1, 1, 1, seg, rings, true);
    const p = g.attributes.position as THREE.BufferAttribute;
    const flutes = 5 + Math.floor(rnd() * 4), ph = rnd() * 6;
    for (let i = 0; i < p.count; i++) {
      const u = p.getY(i) + 0.5;
      const y = -2 + u * (0.9 * H + 2);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const r = gr * trunkRadius(y, H) * (1 + 0.09 * Math.sin(a * flutes + ph) * (1 - u * 0.6));
      const c = axis(y);
      p.setXYZ(i, c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
    }
    g.computeVertexNormals();
    bark.push(g);
  }
  // Buttress roots: fins that leave the trunk a little way up and dive into the ground.
  const nRoots = opts.roots ?? 7;
  for (let k = 0; k < nRoots; k++) {
    const a = (k / nRoots) * Math.PI * 2 + rnd() * 0.4;
    const y0 = H * (0.06 + rnd() * 0.07) * (opts.rootHeight ?? 1);
    const r0 = gr * trunkRadius(y0, H) * 0.8;
    const start = new THREE.Vector3(Math.cos(a) * r0, y0, Math.sin(a) * r0);
    const reach = gr * trunkRadius(0, H) + H * (0.08 + rnd() * 0.07) * rr;
    const mid = new THREE.Vector3(Math.cos(a) * reach * 0.62, y0 * 0.32, Math.sin(a) * reach * 0.62);
    const end = new THREE.Vector3(Math.cos(a) * reach, -1.2, Math.sin(a) * reach);
    const w = R0 * H * gr * (0.42 + rnd() * 0.2);
    bark.push(limb(start, mid, w, w * 0.7, detail === 0 ? 7 : 5), limb(mid, end, w * 0.7, w * 0.25, detail === 0 ? 7 : 5));
  }
  // Limbs and the crown's cloud-like masses.
  const blobs: THREE.BufferGeometry[] = [];
  const cs = opts.crownScale ?? 1;
  const blob = (c: THREE.Vector3, r: number) => {
    const g = new THREE.IcosahedronGeometry(1, detail === 0 ? 2 : 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    const ph = rnd() * 10;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.12 * Math.sin(x * 3.1 + ph) * Math.sin(z * 2.7 + ph) + 0.06 * Math.sin(y * 5 + ph);
      p.setXYZ(i, c.x + x * r * k, c.y + y * r * 0.72 * k, c.z + z * r * k);
    }
    g.computeVertexNormals();
    // Spherised normals: the canopy shades like a cloud, not like leaves.
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i) - c.x, (p.getY(i) - c.y) / 0.72, p.getZ(i) - c.z).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    const base = LEAF[Math.floor(rnd() * LEAF.length)];
    paint(g, (pp, nn, out) => {
      out.copy(base);
      if (nn.y > 0) out.lerp(LEAF_TOP, nn.y * nn.y * 0.45);
      else out.lerp(LEAF_UNDER, -nn.y * 0.5);
      out.multiplyScalar(0.9 + 0.2 * Math.sin(pp.x * 0.3 + pp.z * 0.2));
    });
    blobs.push(g);
  };
  const nLimbs = 5 + Math.floor(rnd() * 3);
  for (let k = 0; k < nLimbs; k++) {
    const a = (k / nLimbs) * Math.PI * 2 + rnd() * 0.5;
    const y0 = H * (0.5 + rnd() * 0.3);
    const c0 = axis(y0);
    const len = H * (0.18 + rnd() * 0.1) * cs;
    const up = 0.55 + rnd() * 0.5;
    const end = c0.clone().add(new THREE.Vector3(Math.cos(a) * len, len * up, Math.sin(a) * len));
    bark.push(limb(c0, end, R0 * H * gr * 0.42, R0 * H * gr * 0.12, detail === 0 ? 8 : 5));
    blob(end.clone().add(new THREE.Vector3(0, H * 0.03, 0)), H * (0.12 + rnd() * 0.05) * cs);
    if (rnd() < 0.7) blob(end.clone().lerp(c0, 0.45).add(new THREE.Vector3(0, H * 0.06, 0)), H * (0.09 + rnd() * 0.04) * cs);
  }
  const top = axis(H * 0.9);
  for (let k = 0; k < (opts.blobs ?? 4); k++) {
    const a = rnd() * Math.PI * 2, d = H * 0.08 * rnd() * cs;
    blob(top.clone().add(new THREE.Vector3(Math.cos(a) * d, H * (0.02 + rnd() * 0.08), Math.sin(a) * d)), H * (0.13 + rnd() * 0.05) * cs);
  }
  for (const g of bark) {
    paint(g, (p, n, out) => {
      out.copy(BARK_DARK).lerp(BARK_LIGHT, 0.35 + 0.35 * Math.sin(Math.atan2(p.z, p.x) * 9 + p.y * 0.05) * 0.5 + 0.25 * Math.min(1, p.y / H));
      // Moss on the upward faces of the roots and the lower trunk.
      out.lerp(MOSS, Math.max(0, n.y) * 0.6 * (1 - Math.min(1, p.y / (0.25 * H))));
    });
  }
  return { trunk: mergeGeometries(bark.map(clean), false)!, crown: mergeGeometries(blobs.map(clean), false)! };
}

export const barkMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
export const leafMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

/**
 * Bake a painted impostor card of a tree: render it side-on (lit by a sun
 * and sky like the world's) into a texture with alpha.
 */
export function bakeImpostor(renderer: THREE.WebGLRenderer, parts: TreeParts, mats: [THREE.Material, THREE.Material], H: number, w = 256, h = 512) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x4a5a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(0.6, 1, 0.8);
  scene.add(sun);
  const t = new THREE.Mesh(parts.trunk, mats[0]), c = new THREE.Mesh(parts.crown, mats[1]);
  scene.add(t, c);
  const box = new THREE.Box3().setFromObject(c).union(new THREE.Box3().setFromObject(t));
  const halfW = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
  const top = box.max.y;
  const span = Math.max(halfW * 2 * (h / w), top);
  const cam = new THREE.OrthographicCamera(-span * (w / h) / 2, span * (w / h) / 2, span, 0, 0.1, H * 6);
  cam.position.set(0, 0, H * 3);
  cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearAlpha(), prevColor = renderer.getClearColor(new THREE.Color());
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x2f5a3a, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevClear);
  return { texture: rt.texture, width: span * (w / h), height: span };
}

/** A camera-facing card material for impostors, standing upright on its base. */
export function impostorMaterial(map: THREE.Texture, opts: { fog?: boolean } = {}) {
  const m = new THREE.MeshBasicMaterial({ map, transparent: false, alphaTest: 0.45, fog: opts.fog ?? true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 cWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
      vec4 mvCenter = viewMatrix * cWorld;
      vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
      vec4 mvPosition = mvCenter + vec4(position.x * sx, 0.0, 0.0, 0.0) + vec4(upV * position.y * sy, 0.0);
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}

// ---- the forest of giants ---------------------------------------------------------------------

const VARIANTS = 3;
const H_REF = 70;
const LOD0_R = 230, LOD1_R = 620;

interface Giant { x: number; y: number; z: number; H: number; v: number; rot: number }

export class MegaForest {
  readonly group = new THREE.Group();
  readonly giants: Giant[] = [];
  private meshes: { trunk: THREE.InstancedMesh; crown: THREE.InstancedMesh }[][] = []; // [variant][lod]
  private impostor: THREE.InstancedMesh;
  private t = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  /** the Sentinel Walk (stair, platforms and bridges) */
  readonly walk = new THREE.Group();
  /** where the stair starts (tests, the map) and the deck's height */
  readonly walkStart: THREE.Vector3;
  readonly deckY: number;
  /** a point in the middle of each bridge deck */
  readonly bridgeMids: THREE.Vector3[] = [];
  /** counts drawn by level of detail at the last refresh (perf probes) */
  stats = { near: 0, mid: 0, far: 0 };

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, plank: THREE.Material, rope: THREE.Material) {
    scene.add(this.group);
    const trees = megaTrees();
    for (const [x, z, H, seed] of trees) this.giants.push({ x, z, H, y: heightAt(x, z) - 0.6, v: seed % VARIANTS, rot: (seed % 628) / 100 });
    const bark = barkMaterial(), leaf = leafMaterial();
    let baked: ReturnType<typeof bakeImpostor> | null = null;
    for (let v = 0; v < VARIANTS; v++) {
      const per = this.giants.filter((g) => g.v === v).length || 1;
      const lods: { trunk: THREE.InstancedMesh; crown: THREE.InstancedMesh }[] = [];
      for (const detail of [0, 1] as const) {
        const parts = buildGiant(9100 + v * 31, H_REF, detail);
        if (v === 0 && detail === 0) baked = bakeImpostor(renderer, parts, [bark, leaf], H_REF);
        const trunk = new THREE.InstancedMesh(parts.trunk, bark, per), crown = new THREE.InstancedMesh(parts.crown, leaf, per);
        for (const im of [trunk, crown]) {
          im.count = 0;
          im.frustumCulled = false;
          im.castShadow = detail === 0;
          im.receiveShadow = true;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.group.add(im);
        }
        lods.push({ trunk, crown });
      }
      this.meshes.push(lods);
    }
    const card = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.impostor = new THREE.InstancedMesh(card, impostorMaterial(baked!.texture), this.giants.length);
    this.impostor.count = 0;
    this.impostor.frustumCulled = false;
    this.impostorSize = [baked!.width / H_REF, baked!.height / H_REF];
    this.group.add(this.impostor);
    // Trunks are solid (the roots you climb over in your head).
    for (const g of this.giants) physics.addCylinder(new THREE.Vector3(g.x, g.y + g.H * 0.3, g.z), g.H * 0.3, trunkRadius(g.H * 0.06, g.H) * 0.92);

    // ---- the Sentinel Walk ----
    const w0 = WALK_TREES[0];
    this.deckY = heightAt(w0[0], w0[1]) - 0.6 + WALK_DECK;
    this.walkStart = this.buildWalk(plank, rope);
    scene.add(this.walk);
  }
  private impostorSize: [number, number] = [1, 1];

  private buildWalk(plank: THREE.Material, rope: THREE.Material) {
    const w = buildWalkway(this.walk, {
      trees: WALK_TREES.map(([x, z, H]) => ({ x, z, H })), deckY: this.deckY, bridges: WALK_BRIDGES, stair: 0, startToward: SITES.worldTree, plank, rope,
    });
    this.bridgeMids.push(...w.bridgeMids);
    return w.start;
  }

  /** Assign level of detail by distance to the camera (a few times a second). */
  update(dt: number, camera: THREE.Vector3) {
    this.t += dt;
    const far = Math.hypot(camera.x - SITES.worldTree[0], camera.z - SITES.worldTree[1]) > 4200 && Math.hypot(camera.x - -2600, camera.z - -3400) > 4200;
    this.group.visible = !far;
    this.walk.visible = Math.hypot(camera.x - WALK_TREES[0][0], camera.z - WALK_TREES[0][1]) < 700;
    if (far || this.t < 0.25) return;
    this.t = 0;
    const counts = this.meshes.map((l) => l.map(() => 0));
    let nImp = 0;
    this.stats = { near: 0, mid: 0, far: 0 };
    for (const g of this.giants) {
      const d = Math.hypot(camera.x - g.x, camera.z - g.z);
      const k = g.H / H_REF;
      if (d < LOD1_R) {
        const lod = d < LOD0_R ? 0 : 1;
        this.q.setFromAxisAngle(this.up, g.rot);
        this.m.compose(this.p.set(g.x, g.y, g.z), this.q, this.s.set(k, k, k));
        const L = this.meshes[g.v][lod];
        const i = counts[g.v][lod]++;
        L.trunk.setMatrixAt(i, this.m);
        L.crown.setMatrixAt(i, this.m);
        if (lod === 0) this.stats.near++;
        else this.stats.mid++;
      } else {
        this.m.compose(this.p.set(g.x, g.y, g.z), this.q.identity(), this.s.set(this.impostorSize[0] * g.H, this.impostorSize[1] * g.H, 1));
        this.impostor.setMatrixAt(nImp++, this.m);
        this.stats.far++;
      }
    }
    this.meshes.forEach((lods, v) => lods.forEach((L, lod) => {
      L.trunk.count = L.crown.count = counts[v][lod];
      L.trunk.instanceMatrix.needsUpdate = L.crown.instanceMatrix.needsUpdate = true;
    }));
    this.impostor.count = nImp;
    this.impostor.instanceMatrix.needsUpdate = true;
  }
  private up = new THREE.Vector3(0, 1, 0);

  setVisible(v: boolean) {
    this.group.visible = v;
    this.walk.visible = v;
  }
}

export interface WalkTree { x: number; z: number; H: number; girth?: number }
/**
 * Platforms round tree trunks at one deck height, rope bridges between them
 * and a spiral stair up the first: meshes into `group`, colliders into the
 * physics world. The Sentinel Walk and the Sanctum's canopy both use it.
 */
export function buildWalkway(group: THREE.Group, o: { trees: WalkTree[]; deckY: number; bridges: [number, number][]; stair: number; startToward: [number, number]; plank: THREE.Material; rope: THREE.Material }) {
  const bridgeMids: THREE.Vector3[] = [];
  const TR = (y: number, t: WalkTree) => (t.girth ?? 1) * trunkRadius(y, t.H);
  const parts: THREE.BufferGeometry[] = [], ropes: THREE.BufferGeometry[] = [];
  const Y = o.deckY;
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, list = parts) => {
    g.rotateY(ry);
    g.translate(x, y, z);
    list.push(clean(g));
  };
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number, ry: number) =>
    physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(hx, hy, hz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)));
  const outer: number[] = [];
  // Platforms: a ring of planks around each walk tree, railed with rope.
  for (const t of o.trees) {
    const { x, z } = t;
    const gy = heightAt(x, z) - 0.6;
    const inner = TR(Y - gy, t);
    const R = inner + 4.2;
    outer.push(R);
    const ring = new THREE.CylinderGeometry(R, R, 0.35, 28, 1, false);
    put(ring, x, Y - 0.18, z);
    // Brackets under the deck, and a rope rail on posts.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const bx = x + Math.cos(a) * (inner + R) / 2, bz = z + Math.sin(a) * (inner + R) / 2;
      const strut = new THREE.CylinderGeometry(0.12, 0.12, (R - inner) * 1.3, 5);
      strut.rotateZ(Math.PI / 2 - 0.6);
      put(strut, bx, Y - 1.5, bz, -a);
      put(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), x + Math.cos(a) * (R - 0.2), Y + 0.55, z + Math.sin(a) * (R - 0.2), 0);
    }
    const rail = new THREE.TorusGeometry(R - 0.2, 0.04, 4, 40);
    rail.rotateX(Math.PI / 2);
    put(rail, x, Y + 1.05, z, 0, ropes);
    physics.addCylinder(new THREE.Vector3(x, Y - 0.2, z), 0.2, R);
  }
  // Rope bridges between the platforms (decks, rails and their colliders).
  for (const [a, b] of o.bridges) {
    const A = [o.trees[a].x, o.trees[a].z], B = [o.trees[b].x, o.trees[b].z];
    const dx = B[0] - A[0], dz = B[1] - A[1], d = Math.hypot(dx, dz);
    const ux = dx / d, uz = dz / d;
    const s0 = outer[a] - 0.6, s1 = d - outer[b] + 0.6;
    const len = s1 - s0, mx = A[0] + ux * (s0 + len / 2), mz = A[1] + uz * (s0 + len / 2);
    const yaw = Math.atan2(ux, uz);
    const deck = new THREE.BoxGeometry(2.2, 0.16, len);
    put(deck, mx, Y - 0.08, mz, yaw);
    for (let k = 0; k < Math.floor(len / 0.7); k++) {
      const t = s0 + 0.35 + k * 0.7;
      put(new THREE.BoxGeometry(2.5, 0.08, 0.32), A[0] + ux * t, Y + 0.02, A[1] + uz * t, yaw);
    }
    for (const side of [-1, 1]) {
      const ox = uz * side * 1.15, oz = -ux * side * 1.15;
      const r = new THREE.CylinderGeometry(0.035, 0.035, len, 4);
      r.rotateX(Math.PI / 2);
      put(r, mx + ox, Y + 1.0, mz + oz, yaw, ropes);
      box(mx + ox * 1.05, Y + 0.6, mz + oz * 1.05, 0.08, 0.6, len / 2, yaw);
      for (let k = 0; k <= Math.floor(len / 2.5); k++) {
        const t = s0 + k * 2.5;
        put(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 3), A[0] + ux * t + ox, Y + 0.5, A[1] + uz * t + oz, 0, ropes);
      }
    }
    box(mx, Y - 0.1, mz, 1.15, 0.12, len / 2, yaw);
    bridgeMids.push(new THREE.Vector3(mx, Y, mz));
  }
  // The spiral stair up the first walk tree: plank steps on brackets, 0.32 m a step.
  const st = o.trees[o.stair], sx = st.x, sz = st.z;
  const gy = heightAt(sx, sz) - 0.6;
  let angle = Math.atan2(o.startToward[1] - sz, o.startToward[0] - sx); // starts facing where you come from
  const steps = Math.ceil((Y - gy - 0.2) / 0.32);
  let start = new THREE.Vector3();
  for (let k = 0; k < steps; k++) {
    const y = gy + 0.32 * (k + 1);
    const rIn = TR(y - gy, st) + 0.3;
    const rMid = Math.max(rIn + 0.9, k < 8 ? TR(0, st) * 0.6 + 2.2 : 0);
    const x = sx + Math.cos(angle) * rMid, z = sz + Math.sin(angle) * rMid;
    if (k === 0) start = new THREE.Vector3(x + Math.cos(angle) * 2.5, heightAt(x + Math.cos(angle) * 2.5, z + Math.sin(angle) * 2.5), z + Math.sin(angle) * 2.5);
    const yaw = -angle;
    put(new THREE.BoxGeometry(2.0, 0.14, 0.95), x, y - 0.07, z, yaw);
    put(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 3), x + Math.cos(angle) * 1.0, y + 0.5, z + Math.sin(angle) * 1.0, 0, ropes);
    box(x, y - 0.12, z, 1.0, 0.12, 0.5, yaw);
    // An outer rail so you don't step off the edge.
    box(x + Math.cos(angle) * 1.1, y + 0.55, z + Math.sin(angle) * 1.1, 0.06, 0.55, 0.5, yaw);
    angle += 0.9 / rMid;
  }
  const merged = new THREE.Mesh(mergeGeometries(parts, false)!, o.plank);
  merged.castShadow = merged.receiveShadow = true;
  const r = new THREE.Mesh(mergeGeometries(ropes, false)!, o.rope);
  group.add(merged, r);
  return { start, bridgeMids };
}
