import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { heightAt, riverX, roadDist, TOWN_R, WORLD_SIZE, CRYPT } from './terrain';
import { physics } from '../physics/physics';
import { fbm, mulberry32, smoothstep } from '../core/math';

// ---------------------------------------------------------------------------
// Forests. A few tree variants are generated once with ez-tree (MIT), then
// placed by region: dense woods in the west, oak groves in the meadows,
// aspens and ashes along the river, pines on the northern hills. Trees near
// the camera are full instanced meshes; distant ones are camera-facing
// billboards rendered from each variant at startup.
// ---------------------------------------------------------------------------

interface VariantSpec {
  preset: string;
  seed: number;
  height: number; // target height in metres
  leafScale: number; // multiplier on leaf count (fewer, bigger leaves = cheaper)
  kind: 'broad' | 'pine' | 'bush';
}

const SPECS: VariantSpec[] = [
  { preset: 'Oak Large', seed: 11, height: 16, leafScale: 0.55, kind: 'broad' },
  { preset: 'Oak Medium', seed: 23, height: 12, leafScale: 0.6, kind: 'broad' },
  { preset: 'Ash Medium', seed: 37, height: 14, leafScale: 0.55, kind: 'broad' },
  { preset: 'Aspen Medium', seed: 41, height: 12, leafScale: 1.0, kind: 'broad' },
  { preset: 'Pine Medium', seed: 53, height: 17, leafScale: 0.6, kind: 'pine' },
  { preset: 'Pine Large', seed: 67, height: 21, leafScale: 0.55, kind: 'pine' },
  { preset: 'Bush 1', seed: 71, height: 2.2, leafScale: 0.7, kind: 'bush' },
  { preset: 'Bush 2', seed: 83, height: 1.8, leafScale: 0.7, kind: 'bush' },
];

interface Variant {
  spec: VariantSpec;
  branches: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  trunkR: number;
  cell: number; // impostor atlas cell
  bb: [number, number]; // billboard width and height at scale 1 (m)
}

interface Instance {
  v: number;
  pos: THREE.Vector3;
  rot: number;
  scale: number;
}

const NEAR = 62; // full-detail radius (m)
const MAX_NEAR = 46; // cap on full-detail trees
const CELL_W = 256, CELL_H = 384;

function leafMaterial(src: THREE.MeshPhongMaterial, uniforms: { uTime: THREE.IUniform }) {
  const m = new THREE.MeshStandardMaterial({
    map: src.map, color: src.color, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.8, envMapIntensity: 0.5,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wpos = modelMatrix * mvPosition;
        // Gentle sway, stronger at the leaf tips, phase varies across the canopy.
        float ph = dot(wpos.xyz, vec3(0.21, 0.13, 0.17));
        wpos.xz += uv.y * vec2(0.08, 0.06) * (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 3.1 + ph * 2.3) * 0.4);
        mvPosition = viewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;`,
      )
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wpos;');
  };
  return m;
}

/** Render every variant from the side into one atlas for the billboards. */
function buildImpostors(renderer: THREE.WebGLRenderer, trees: Tree[], env: THREE.Texture | null) {
  const cols = trees.length;
  const W = CELL_W * cols, H = CELL_H;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a5a30, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(0.4, 1, 1);
  scene.add(sun);
  const rt = new THREE.WebGLRenderTarget(CELL_W, CELL_H, { samples: 4 });
  const px = new Uint8Array(CELL_W * CELL_H * 4);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const sizes: [number, number][] = [];
  const tone = renderer.toneMapping;
  const out = renderer.outputColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  trees.forEach((t, i) => {
    scene.add(t);
    t.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(t);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const w = Math.max(size.x, size.z), h = size.y;
    // Keep the cell aspect: fit the taller dimension.
    const halfH = Math.max(h / 2, (w / 2) * (CELL_H / CELL_W));
    const halfW = halfH * (CELL_W / CELL_H);
    sizes.push([halfW * 2, halfH * 2]);
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
    cam.position.set(c.x, box.min.y + halfH, c.z + 60);
    cam.lookAt(c.x, box.min.y + halfH, c.z);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, CELL_W, CELL_H, px);
    const img = ctx.createImageData(CELL_W, CELL_H);
    for (let y = 0; y < CELL_H; y++) img.data.set(px.subarray((CELL_H - 1 - y) * CELL_W * 4, (CELL_H - y) * CELL_W * 4), y * CELL_W * 4);
    ctx.putImageData(img, i * CELL_W, 0);
    scene.remove(t);
  });
  renderer.setRenderTarget(null);
  renderer.toneMapping = tone;
  renderer.outputColorSpace = out;
  rt.dispose();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.LinearSRGBColorSpace; // rendered linear into an 8-bit target
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, sizes, cols };
}

const BB_VERT = /* glsl */ `
  attribute vec3 aBase;
  attribute vec2 aSize;
  attribute float aCell;
  uniform float uCols;
  varying vec2 vUv;
  void main() {
    // Cylindrical billboard: always upright, turned toward the camera.
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    camRight = normalize(vec3(camRight.x, 0.0, camRight.z));
    vec3 wp = aBase + camRight * position.x * aSize.x + vec3(0.0, position.y * aSize.y, 0.0);
    vUv = vec2((aCell + position.x + 0.5) / uCols, position.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const BB_FRAG = /* glsl */ `
  uniform sampler2D tAtlas;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tAtlas, vUv);
    if (c.a < 0.45) discard;
    gl_FragColor = vec4(c.rgb * 1.05, 1.0);
  }`;

export class Foliage {
  private variants: Variant[] = [];
  private instances: Instance[] = [];
  private billboards!: THREE.InstancedMesh;
  private bbCount = 0;
  private uniforms = { uTime: { value: 0 } };
  private timer = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const protos: Tree[] = [];
    for (const [i, spec] of SPECS.entries()) {
      const t = new Tree();
      t.loadPreset(spec.preset);
      t.options.seed = spec.seed;
      t.options.leaves.count = Math.max(1, Math.round(t.options.leaves.count * spec.leafScale));
      t.options.leaves.size *= 1 / Math.sqrt(spec.leafScale);
      t.generate();
      const box = new THREE.Box3().setFromObject(t);
      const k = spec.height / (box.max.y - box.min.y);
      t.scale.setScalar(k);
      protos.push(t);
      const bGeo = t.branchesMesh.geometry.clone().scale(k, k, k);
      const lGeo = t.leavesMesh.geometry.clone().scale(k, k, k);
      const bMat = t.branchesMesh.material as THREE.MeshPhongMaterial;
      const lMat = leafMaterial(t.leavesMesh.material as THREE.MeshPhongMaterial, this.uniforms);
      const branches = new THREE.InstancedMesh(bGeo, bMat, MAX_NEAR);
      const leaves = new THREE.InstancedMesh(lGeo, lMat, MAX_NEAR);
      for (const im of [branches, leaves]) {
        im.count = 0;
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        scene.add(im);
      }
      this.variants.push({ spec, branches, leaves, trunkR: spec.kind === 'bush' ? 0 : spec.height * 0.022, cell: i, bb: [1, 1] });
    }
    // Billboard atlas (render the prototypes at their game scale).
    const { tex, sizes, cols } = buildImpostors(renderer, protos, scene.environment);
    this.variants.forEach((v, i) => (v.bb = sizes[i]));

    this.place();

    // Billboards: one quad per tree (bushes are skipped far away).
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const trees = this.instances.filter((i) => this.variants[i.v].spec.kind !== 'bush');
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1).setUsage(THREE.DynamicDrawUsage));
    const bbMat = new THREE.ShaderMaterial({ vertexShader: BB_VERT, fragmentShader: BB_FRAG, uniforms: { tAtlas: { value: tex }, uCols: { value: cols } }, side: THREE.DoubleSide });
    this.billboards = new THREE.InstancedMesh(geo, bbMat, trees.length);
    this.billboards.frustumCulled = false;
    scene.add(this.billboards);
  }

  /** Seeded placement by region. */
  private place() {
    const rnd = mulberry32(2024);
    const H = WORLD_SIZE / 2 - 30;
    const step = 7;
    const pick = (list: number[]) => list[Math.floor(rnd() * list.length)];
    for (let z = -H; z < H; z += step) {
      for (let x = -H; x < H; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
        const r = Math.hypot(px, pz);
        if (r < TOWN_R + 10) continue;
        if (roadDist(px, pz) < 7) continue;
        const dr = Math.abs(px - riverX(pz));
        if (dr < 15) continue;
        if (Math.hypot(px - CRYPT.x, pz - CRYPT.y - 12) < 34) continue;
        const h = heightAt(px, pz);
        if (h > 55) continue; // bare mountain tops
        const grove = fbm(px * 0.012 + 7, pz * 0.012 - 3, 3);
        const west = smoothstep(-110, -190, px);
        const north = smoothstep(-160, -260, pz);
        const bank = smoothstep(30, 18, dr);
        let density = Math.max(west * (0.35 + grove * 0.8), smoothstep(0.6, 0.72, grove) * 0.55, bank * 0.28, north * 0.3);
        density *= 1 - smoothstep(35, 55, h) * 0.8;
        if (rnd() > density * 0.62) continue;
        let v: number;
        if (north > 0.5 || h > 25) v = pick([4, 5, 4]);
        else if (bank > 0.3) v = pick([2, 3, 3, 6]);
        else if (west > 0.5) v = pick([0, 1, 2, 4, 1, 6, 7]);
        else v = pick([0, 1, 0, 6, 7]);
        this.instances.push({ v, pos: new THREE.Vector3(px, h - 0.15, pz), rot: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.35 });
      }
    }
    // A few ornamental trees inside the town.
    for (const [x, z, v] of [[-30, 25, 1], [34, 30, 0], [-50, -10, 3], [45, -48, 1], [-12, 52, 3]] as const) {
      this.instances.push({ v, pos: new THREE.Vector3(x, heightAt(x, z) - 0.15, z), rot: x * 0.7, scale: 0.9 });
    }
    // Trunk colliders for every tree.
    for (const inst of this.instances) {
      const v = this.variants[inst.v];
      if (!v.trunkR) continue;
      physics.addCylinder(inst.pos.clone().add(new THREE.Vector3(0, 2, 0)), 2, v.trunkR * inst.scale * 1.3);
    }
  }

  setVisible(v: boolean) {
    for (const vv of this.variants) vv.branches.visible = vv.leaves.visible = v;
    this.billboards.visible = v;
  }

  get count() {
    return this.instances.length;
  }

  update(dt: number, camera: THREE.Vector3) {
    this.uniforms.uTime.value += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    // Nearest trees get full detail; everything else is a billboard.
    const d2 = this.instances.map((inst, i) => [inst.pos.distanceToSquared(camera), i] as [number, number]);
    d2.sort((a, b) => a[0] - b[0]);
    for (const v of this.variants) v.branches.count = v.leaves.count = 0;
    const base = this.billboards.geometry.attributes.aBase as THREE.InstancedBufferAttribute;
    const size = this.billboards.geometry.attributes.aSize as THREE.InstancedBufferAttribute;
    const cell = this.billboards.geometry.attributes.aCell as THREE.InstancedBufferAttribute;
    let near = 0;
    this.bbCount = 0;
    for (const [dd, i] of d2) {
      const inst = this.instances[i];
      const v = this.variants[inst.v];
      if (dd < NEAR * NEAR && near < MAX_NEAR && v.branches.count < MAX_NEAR) {
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), inst.rot);
        this.s.setScalar(inst.scale);
        this.m4.compose(inst.pos, this.q, this.s);
        v.branches.setMatrixAt(v.branches.count, this.m4);
        v.leaves.setMatrixAt(v.leaves.count, this.m4);
        v.branches.count++;
        v.leaves.count++;
        near++;
      } else if (v.spec.kind !== 'bush' && dd < 900 * 900) {
        base.setXYZ(this.bbCount, inst.pos.x, inst.pos.y, inst.pos.z);
        size.setXY(this.bbCount, v.bb[0] * inst.scale, v.bb[1] * inst.scale);
        cell.setX(this.bbCount, v.cell);
        this.bbCount++;
      }
    }
    for (const v of this.variants) {
      v.branches.instanceMatrix.needsUpdate = true;
      v.leaves.instanceMatrix.needsUpdate = true;
    }
    base.needsUpdate = size.needsUpdate = cell.needsUpdate = true;
    this.billboards.count = this.bbCount;
  }
}
