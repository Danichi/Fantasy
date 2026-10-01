import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compressedGltf } from '../core/gltf';
import { heightAt, roadDist, GRAVEWOOD, GRAVEWOOD_R, GRAVEYARD, graveyardDist } from './terrainHeight';
import { GRASS_MASKS } from './groundWindow';
import { physics } from '../physics/physics';
import { clamp, mulberry32, smoothstep } from '../core/math';
import { events } from '../core/events';
import { Undead, preloadUndead, type UndeadKind } from '../enemies/undead';
import { OrcWarlord, type BossSpec } from '../enemies/orc';
import { sfx } from '../audio/sfx';
import type { WorldMats } from './buildings';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Renderer } from '../render/renderer';
import { sunwheelTexture } from './glenLandmarks';

// ---------------------------------------------------------------------------
// The Gravewood: a dead, fog-bound wood a long walk south-west of Elder Glen
// (the Gravewood Trail leaves the Logging Road). At its heart a walled
// graveyard. Step through its gate and the gate slams shut: a wall of smoke
// rises, the maps fog over, and after a while the dead claw up out of their
// graves in three waves, the last led by the Stitched Abomination. Die and you
// wake at the gate with everything reset; win and a beam of light breaks the
// curse, the fog lifts, flowers bloom out of the body and across the graves,
// and a Sunwheel pedestal rises out of the pit it climbed from.
// ---------------------------------------------------------------------------

const C = GRAVEWOOD; // x, z (Vector2: .y is world z)
const HX = GRAVEYARD.hx, HZ = GRAVEYARD.hz;
const GATE_W = 3.4;
/** Seconds between the gate slamming and the first wave. */
export const SEAL_WAIT = 20;
const LULL = 5; // seconds between waves
const WAVES: UndeadKind[][] = [
  ['zombie', 'zombie', 'zombie', 'skeleton'],
  ['zombie', 'zombie', 'zombie', 'zombie', 'skeleton', 'skeleton'],
  ['zombie', 'zombie', 'skeleton'],
];
export const ABOMINATION: BossSpec = {
  name: 'The Stitched Abomination', model: '/assets/gravewood/gwAbomination.glb', hp: 500, scale: 1.3,
  kind: 'abomination', bow: false, damage: 0.5, emerge: true, wake: -1,
};
/** Local (x, z) of the boss's pit: where it rises, where the light breaks, where the pedestal stands. */
const BOSS_AT = new THREE.Vector2(0, 1.5);
/** How far below ground the pedestal waits before it rises out of the boss's pit. */
const PEDESTAL_DEPTH = 4;
const FLOWERS_ON_BODY = 70;
const FLOWERS_IN_YARD = 900;

type State = 'dormant' | 'sealed' | 'wave' | 'lull' | 'victory' | 'cleared';

export interface GravewoodHooks {
  toast: (msg: string) => void;
  card: (title: string, subtitle: string) => void;
  bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => void;
  save: () => void;
  flags: Record<string, boolean | number | string>;
}

/** World position of a graveyard-local point, on the ground. */
const world = (x: number, z: number, lift = 0) => new THREE.Vector3(C.x + x, heightAt(C.x + x, C.y + z) + lift, C.y + z);

// ---- geometry helpers ------------------------------------------------------------------------

/** A dead tree: a leaning, kinked trunk and bare, forking branches (one merged geometry). */
function deadTreeGeometry(seed: number) {
  const rnd = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number) => {
    const segs = 3;
    let p = from.clone(), d = dir.clone().normalize(), r = r0;
    for (let s = 0; s < segs; s++) {
      const l = len / segs;
      const r1 = r * 0.72;
      const g = new THREE.CylinderGeometry(r1, r, l, 6, 1, false);
      g.translate(0, l / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      g.translate(p.x, p.y, p.z);
      parts.push(g);
      p = p.clone().addScaledVector(d, l);
      // Kinks: dead wood grows crooked.
      d = d.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.4) * 0.25, (rnd() - 0.5) * 0.5)).normalize();
      r = r1;
      if (depth > 0 && s >= 1 && rnd() < 0.75) {
        const side = new THREE.Vector3(rnd() - 0.5, 0.2 + rnd() * 0.5, rnd() - 0.5).normalize();
        limb(p, d.clone().lerp(side, 0.65), len * (0.45 + rnd() * 0.25), r * 0.8, depth - 1);
      }
    }
  };
  const h = 6.5 + rnd() * 4;
  limb(new THREE.Vector3(0, -0.4, 0), new THREE.Vector3((rnd() - 0.5) * 0.15, 1, (rnd() - 0.5) * 0.15), h, 0.32 + rnd() * 0.08, 0);
  // Main branches from the upper trunk, then their forks.
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.8;
    const y = h * (0.45 + rnd() * 0.45);
    const out = new THREE.Vector3(Math.cos(a), 0.55 + rnd() * 0.7, Math.sin(a));
    limb(new THREE.Vector3(0, y, 0), out, 2.2 + rnd() * 2.6, 0.13 + rnd() * 0.05, 2);
  }
  // Root flare.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd();
    const g = new THREE.ConeGeometry(0.16, 1.4, 5);
    g.rotateZ(Math.PI / 2 - 0.25);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.5, 0.05, -Math.sin(a) * 0.5);
    parts.push(g);
  }
  const clean = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    return ng;
  });
  return mergeGeometries(clean)!;
}

/** A soft, noisy puff for mist billboards. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wrought-iron gate leaf, hinged at x = 0 and reaching along +x (or -x). */
function gateLeafGeometry(width: number, height: number, dir: 1 | -1) {
  const parts: THREE.BufferGeometry[] = [];
  const bars = Math.round(width / 0.14);
  for (let i = 0; i <= bars; i++) {
    const x = (i / bars) * width * dir;
    const top = height - 0.25 + Math.sin((i / bars) * Math.PI) * 0.25; // a gentle arch
    const bar = new THREE.CylinderGeometry(0.017, 0.017, top - 0.08, 6);
    bar.translate(x, (top + 0.08) / 2, 0);
    parts.push(bar);
    const tip = new THREE.ConeGeometry(0.035, 0.14, 4);
    tip.translate(x, top + 0.07, 0);
    parts.push(tip);
  }
  for (const y of [0.3, 1.25, height - 0.45]) {
    const rail = new THREE.BoxGeometry(width, 0.05, 0.05);
    rail.translate((width / 2) * dir, y, 0);
    parts.push(rail);
  }
  // Diagonal brace and the hanging stile.
  const brace = new THREE.BoxGeometry(0.045, Math.hypot(width, 0.95), 0.04);
  brace.rotateZ(dir * Math.atan2(width, 0.95));
  brace.translate((width / 2) * dir, 0.78, 0);
  parts.push(brace);
  const stile = new THREE.BoxGeometry(0.07, height, 0.07);
  stile.translate(0.03 * dir, height / 2, 0);
  parts.push(stile);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    return g;
  }))!;
}

// ---- the Gravewood -------------------------------------------------------------------------------

interface Kit {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  size: THREE.Vector3;
}

export class Gravewood {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  state: State = 'dormant';
  wave = -1;
  /** 0..1: how cursed the air is (the trap's smoke; drives fog, light and the maps) */
  curse = 0;
  private t = 0;
  private spawnQueue: { kind: UndeadKind; at: number }[] = [];
  mobs: Undead[] = [];
  boss: OrcWarlord | null = null;
  private bossPending = false;
  private pendingReset = false;
  private graves: THREE.Vector2[] = []; // local mound centres (rising spots)
  private kit = new Map<string, Kit>();
  private gateLeaves: THREE.Object3D[] = [];
  private gateOpen = 1; // 1 open .. 0 shut
  private gateTarget = 1;
  private gateCollider: RAPIER.Collider | null = null;
  private mist!: THREE.InstancedMesh;
  private mistMat!: THREE.MeshBasicMaterial;
  private wall!: THREE.Mesh;
  private wallMat!: THREE.ShaderMaterial;
  /** the pedestal that rises from the boss's pit when the curse breaks */
  private pedestal: THREE.Group | null = null;
  private pedestalRise = 0; // 0 buried .. 1 risen
  private pedestalCollider: RAPIER.Collider | null = null;
  private pedestalGlow: THREE.Mesh | null = null;
  private beam: THREE.Group | null = null;
  private beamT = 0;
  /** the abomination's body, left where it fell */
  private corpse: OrcWarlord | null = null;
  /** flowers: instance data [x, y, z, delay, scale, yaw] and how long they've been growing */
  private flowers: { stems: THREE.InstancedMesh; heads: THREE.InstancedMesh; data: Float32Array; n: number } | null = null;
  private flowerT = -1;
  private time = 0;

  constructor(private scene: THREE.Scene, private mats: WorldMats, private fx: FX, private hooks: GravewoodHooks) {
    scene.add(this.group);
    // Grass thins under the dead wood and gives way to trodden earth in the graveyard.
    GRASS_MASKS.push({ x: C.x, z: C.y, r: GRAVEWOOD_R, amount: 0.5, tint: 1 });
    GRASS_MASKS.push({ x: C.x, z: C.y, hx: HX + 1, hz: HZ + 1, amount: 0.85, tint: 1 });
    this.buildForest();
    this.buildMist();
    this.ready = this.buildGraveyard();
  }

  get cleared() {
    return !!this.hooks.flags.gravewoodCleared;
  }
  /** The player is shut inside and the dead are (or will be) rising. */
  get trapped() {
    return this.state === 'sealed' || this.state === 'wave' || this.state === 'lull';
  }
  /** Where to wake after dying inside: at the gate, outside. */
  get respawnPoint(): THREE.Vector3 | null {
    if (!this.trapped && !this.pendingReset) return null;
    return world(0, -HZ - 7, 0.4);
  }
  /** Clearings the tree scatter must leave: the whole wood is ours. */
  static get clearing(): [number, number, number] {
    return [C.x, C.y, GRAVEWOOD_R + 6];
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  /**
   * Upload the buried pedestal's textures and compile its shaders now, so it
   * doesn't stall the frame it first rises into view.
   */
  private gpu: { renderer: THREE.WebGLRenderer; camera: THREE.Camera; scene: THREE.Scene } | undefined;
  async warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    this.gpu = { renderer, camera, scene: this.scene };
    await this.ready;
    if (!this.pedestal) return;
    this.pedestal.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap]) if (t) renderer.initTexture(t);
    });
    const was = this.pedestal.visible;
    this.pedestal.visible = true;
    await renderer.compileAsync(this.pedestal, camera, this.scene);
    this.pedestal.visible = was;
  }

  // ---- building ----------------------------------------------------------------------------

  private buildForest() {
    const rnd = mulberry32(90210);
    const bark = (this.mats.bark as THREE.MeshStandardMaterial).clone();
    bark.color = new THREE.Color(0x5a5550);
    bark.roughness = 1;
    const protos = [0, 1, 2, 3].map((k) => deadTreeGeometry(7001 + k * 131));
    const spots: [number, number, number, number, number][] = []; // x, z, yaw, scale, proto
    const taken: THREE.Vector2[] = [];
    for (let i = 0; i < 4000 && spots.length < 430; i++) {
      const a = rnd() * Math.PI * 2, r = 20 + Math.sqrt(rnd()) * (GRAVEWOOD_R - 20);
      const x = C.x + Math.cos(a) * r, z = C.y + Math.sin(a) * r;
      if (graveyardDist(x, z) < 7 || roadDist(x, z) < 5) continue;
      // Thinner toward the edge of the wood.
      if (rnd() > 1 - smoothstep(GRAVEWOOD_R * 0.8, GRAVEWOOD_R, r) * 0.55) continue;
      const p = new THREE.Vector2(x, z);
      if (taken.some((q) => q.distanceToSquared(p) < 13)) continue; // a close, tangled wood
      taken.push(p);
      spots.push([x, z, rnd() * Math.PI * 2, 0.75 + rnd() * 0.55, Math.floor(rnd() * protos.length)]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    protos.forEach((geo, k) => {
      const mine = spots.filter((sp) => sp[4] === k);
      const inst = new THREE.InstancedMesh(geo, bark, Math.max(1, mine.length));
      inst.count = mine.length;
      mine.forEach(([x, z, yaw, sc], i) => {
        // A slight lean, as if the wood were slowly falling.
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.12, yaw, (rnd() - 0.5) * 0.12));
        m.compose(v.set(x, heightAt(x, z), z), q, s.setScalar(sc));
        inst.setMatrixAt(i, m);
        physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + 2, z), 2, 0.3 * sc);
      });
      inst.castShadow = inst.receiveShadow = true;
      this.group.add(inst);
    });
    // Fallen trunks and stumps.
    const logGeo = new THREE.CylinderGeometry(0.28, 0.34, 5, 7);
    logGeo.rotateZ(Math.PI / 2);
    const logs = new THREE.InstancedMesh(logGeo, bark, 22);
    let n = 0;
    for (let i = 0; i < 200 && n < 22; i++) {
      const a = rnd() * Math.PI * 2, r = 22 + rnd() * (GRAVEWOOD_R - 30);
      const x = C.x + Math.cos(a) * r, z = C.y + Math.sin(a) * r;
      if (graveyardDist(x, z) < 6 || roadDist(x, z) < 5) continue;
      const len = 0.6 + rnd() * 0.6;
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, (rnd() - 0.5) * 0.08));
      m.compose(v.set(x, heightAt(x, z) + 0.18, z), q, s.set(len, 1, 1));
      logs.setMatrixAt(n++, m);
    }
    logs.count = n;
    logs.castShadow = logs.receiveShadow = true;
    this.group.add(logs);
  }

  /** Drifting ground mist in the wood, and the wall of smoke that seals the graveyard. */
  private buildMist() {
    const rnd = mulberry32(4242);
    this.mistMat = new THREE.MeshBasicMaterial({ map: puffTexture(), color: 0xb7c0bb, transparent: true, depthWrite: false, opacity: 0.3, fog: false });
    const N = 140;
    this.mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mistMat, N);
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (GRAVEWOOD_R - 5);
      const x = C.x + Math.cos(a) * r, z = C.y + Math.sin(a) * r;
      const sc = 7 + rnd() * 9;
      m.compose(new THREE.Vector3(x, heightAt(x, z) + 0.6 + rnd() * 1.6, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc * 0.45, 1));
      this.mist.setMatrixAt(i, m);
    }
    this.mist.userData.base = Array.from({ length: N }, (_, i) => {
      const e = new THREE.Matrix4();
      this.mist.getMatrixAt(i, e);
      return e;
    });
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 2;
    this.group.add(this.mist);

    // The smoke wall: a tall band just outside the graveyard walls, drawn in
    // scrolling noise. Invisible until the gate slams.
    const pts: THREE.Vector2[] = [];
    const ox = HX + 5, oz = HZ + 5, rr = 6;
    const corner = (cx: number, cz: number, a0: number) => {
      for (let k = 0; k <= 6; k++) {
        const a = a0 + (k / 6) * (Math.PI / 2);
        pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr));
      }
    };
    corner(ox - rr, oz - rr, 0);
    corner(-ox + rr, oz - rr, Math.PI / 2);
    corner(-ox + rr, -oz + rr, Math.PI);
    corner(ox - rr, -oz + rr, Math.PI * 1.5);
    pts.push(pts[0].clone());
    const H = 22;
    const pos: number[] = [], uv: number[] = [], index: number[] = [];
    let along = 0;
    pts.forEach((p, i) => {
      if (i) along += p.distanceTo(pts[i - 1]);
      const y = heightAt(C.x + p.x, C.y + p.y);
      pos.push(C.x + p.x, y - 1, C.y + p.y, C.x + p.x, y + H, C.y + p.y);
      uv.push(along, 0, along, 1);
      if (i) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    this.wallMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0.36, 0.4, 0.38) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime, uAmount; uniform vec3 uColor;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vec2(vUv.x * 0.12, vUv.y * 3.0);
          float c = n(p + vec2(uTime * 0.05, -uTime * 0.11)) * 0.55 + n(p * 2.3 + vec2(-uTime * 0.07, -uTime * 0.2)) * 0.3 + n(p * 5.1 - uTime * 0.3) * 0.15;
          float a = smoothstep(1.0, 0.55, vUv.y) * (0.72 + c * 0.45) * uAmount;
          gl_FragColor = vec4(uColor * (0.8 + c * 0.4), clamp(a, 0.0, 0.97));
        }`,
    });
    this.wall = new THREE.Mesh(g, this.wallMat);
    this.wall.visible = false;
    this.wall.renderOrder = 3;
    this.wall.frustumCulled = false;
    this.group.add(this.wall);
  }

  private async buildGraveyard() {
    const kitG = await compressedGltf.loadAsync('/assets/gravewood/gwKit.glb');
    // Kit pieces: centred on their footprint, bottom at y = 0, in metres (the pack is in centimetres).
    kitG.scene.updateMatrixWorld(true);
    kitG.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Meshopt-quantized attributes can't hold baked transforms: expand them to floats first.
      const geo = mesh.geometry.clone();
      for (const [name, a] of Object.entries(geo.attributes)) {
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
        geo.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
      }
      geo.applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const c = bb.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -bb.min.y, -c.z);
      geo.scale(0.01, 0.01, 0.01);
      geo.computeBoundingBox();
      const key = mesh.name.split('_')[0] === 'fence' ? 'fenceSmall' : mesh.name.startsWith('Fence') ? 'fence' : mesh.name.startsWith('stone_bar') ? 'bar'
        : mesh.name.startsWith('Mogila_tipA') ? 'pedestal' : mesh.name.startsWith('Mogila_tipB') ? 'celtic' : mesh.name.startsWith('LP_tip_c') ? 'headstone'
          : mesh.name.startsWith('Grave_Tip_D') ? 'cross' : mesh.name.startsWith('Graund') ? 'mound' : mesh.name.includes('tip_A') ? 'sarcA' : 'sarcB';
      this.kit.set(key, { geometry: geo, material: mesh.material as THREE.Material, size: geo.boundingBox!.getSize(new THREE.Vector3()) });
    });
    const place: Record<string, THREE.Matrix4[]> = {};
    const put = (key: string, x: number, z: number, yaw: number, scale = 1, lift = 0, collide = true) => {
      const k = this.kit.get(key)!;
      const p = world(x, z, lift - 0.04);
      (place[key] ??= []).push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3().setScalar(scale)));
      if (collide && key !== 'mound') {
        const s = k.size.clone().multiplyScalar(scale * 0.5);
        physics.addBox(p.clone().setY(p.y + s.y), s, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      }
    };

    // ---- walls: iron railings on low stone, a pier every four metres ----
    const panel = this.kit.get('fence')!.size.x; // ~4.06 m
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / panel));
      const yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        put('fence', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw, len / n / panel, 0, false);
      }
    };
    run(-HX, HZ, HX, HZ); // south
    run(-HX, -HZ, -HX, HZ); // west
    run(HX, -HZ, HX, HZ); // east
    run(-HX, -HZ, -GATE_W / 2 - 0.6, -HZ); // north, either side of the gate
    run(GATE_W / 2 + 0.6, -HZ, HX, -HZ);
    // Tall invisible colliders along every wall line (no climbing out), the gate shut separately.
    const wallBox = (x0: number, z0: number, x1: number, z1: number) => {
      const c = world((x0 + x1) / 2, (z0 + z1) / 2);
      physics.addBox(c.setY(c.y + 2.5), new THREE.Vector3(Math.abs(x1 - x0) / 2 + 0.3, 4, Math.abs(z1 - z0) / 2 + 0.3));
    };
    wallBox(-HX, HZ, HX, HZ);
    wallBox(-HX, -HZ, -HX, HZ);
    wallBox(HX, -HZ, HX, HZ);
    wallBox(-HX, -HZ, -GATE_W / 2, -HZ);
    wallBox(GATE_W / 2, -HZ, HX, -HZ);

    // ---- the gateway: stone piers and the rusted iron gate ----
    const stone = this.mats.stone;
    for (const sx of [-1, 1]) {
      const px = sx * (GATE_W / 2 + 0.5);
      const base = world(px, -HZ);
      const pier = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.4, 1.0), stone);
      shaft.position.y = 1.7;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.5, 1.25), stone);
      plinth.position.y = 0.25;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 1.25), stone);
      cap.position.y = 3.55;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), stone);
      ball.position.y = 4.0;
      pier.add(shaft, plinth, cap, ball);
      pier.position.copy(base);
      pier.traverse((o) => ((o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true))));
      this.group.add(pier);
      physics.addBox(base.clone().setY(base.y + 2), new THREE.Vector3(0.55, 2.2, 0.55));
    }
    const rust = new THREE.MeshStandardMaterial({ color: 0x4d2f1e, metalness: 0.55, roughness: 0.82 });
    for (const sx of [-1, 1] as const) {
      const leaf = new THREE.Mesh(gateLeafGeometry(GATE_W / 2 - 0.04, 2.8, sx === -1 ? 1 : -1), rust);
      leaf.castShadow = true;
      const hinge = new THREE.Group();
      hinge.position.copy(world(sx * (GATE_W / 2), -HZ));
      hinge.add(leaf);
      hinge.userData.side = sx;
      this.group.add(hinge);
      this.gateLeaves.push(hinge);
    }
    const gc = world(0, -HZ);
    this.gateCollider = physics.addBox(gc.setY(gc.y + 2.5), new THREE.Vector3(GATE_W / 2, 4, 0.25));
    this.gateCollider.setEnabled(false);
    this.poseGate();

    this.buildRuins();

    // ---- graves: rows either side of the path, the centre left open for the fight ----
    const rnd = mulberry32(666);
    const stones = ['headstone', 'headstone', 'cross', 'pedestal', 'headstone', 'cross'];
    for (let gz = -11; gz <= 11; gz += 4.4) {
      for (let gx = -17; gx <= 17; gx += 3.4) {
        if (Math.abs(gx) < 3.2) continue; // the path
        if (Math.hypot(gx - BOSS_AT.x, gz - BOSS_AT.y) < 8.5) continue; // the open ground
        const jx = gx + (rnd() - 0.5) * 0.5, jz = gz + (rnd() - 0.5) * 0.4;
        const tilt = (rnd() - 0.5) * 0.18;
        const r = rnd();
        if (r < 0.14) {
          put(rnd() < 0.5 ? 'sarcA' : 'sarcB', jx, jz + 1.2, tilt);
          continue;
        }
        put(stones[Math.floor(rnd() * stones.length)], jx, jz, Math.PI + tilt, 0.85 + rnd() * 0.25);
        put('mound', jx, jz + 1.55, tilt, 0.9, 0, false);
        this.graves.push(new THREE.Vector2(jx, jz + 1.6));
      }
    }
    // Great Celtic crosses at the corners, and one over the open ground.
    for (const [x, z] of [[-HX + 2.5, -HZ + 2.5], [HX - 2.5, -HZ + 2.5], [-HX + 2.5, HZ - 2.5], [HX - 2.5, HZ - 2.5]]) put('celtic', x, z, Math.PI + (rnd() - 0.5) * 0.3, 0.9);
    // The abomination's grave: a broken ring of slabs around a sunken pit.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      put('bar', BOSS_AT.x + Math.cos(a) * 3.1, BOSS_AT.y + Math.sin(a) * 3.1, -a + Math.PI / 2 + (rnd() - 0.5) * 0.5, 1.2, 0, false);
    }
    const pit = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshStandardMaterial({ color: 0x1b140e, roughness: 1 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.copy(world(BOSS_AT.x, BOSS_AT.y, 0.03));
    pit.receiveShadow = true;
    this.group.add(pit);
    // Small railed plots around two sarcophagi.
    for (const [x, z] of [[-9, 13.2], [9, 13.2]]) {
      put('fenceSmall', x, z + 1.9, 0, 0.8, 0, false);
      put('sarcA', x, z, 0, 0.95);
    }

    for (const [key, list] of Object.entries(place)) {
      const k = this.kit.get(key)!;
      const inst = new THREE.InstancedMesh(k.geometry, k.material, list.length);
      list.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.castShadow = inst.receiveShadow = true;
      this.group.add(inst);
    }

    this.pedestal = this.buildPedestal();
    this.group.add(this.pedestal);
    this.flowers = this.buildFlowers();
    if (this.cleared) {
      // Already won: the pedestal stands, the flowers bloom, the body lies where it fell.
      this.state = 'cleared';
      this.pedestalRise = 1;
      this.settlePedestal();
      this.flowerT = 1e3;
      void this.restoreCorpse();
    }
    this.posePedestal(0);
  }

  private poseGate() {
    // Open leaves swing inward (into the graveyard, +z).
    const k = this.gateOpen;
    for (const h of this.gateLeaves) h.rotation.y = -h.userData.side * 1.75 * k;
  }

  private posePedestal(shake: number) {
    if (!this.pedestal) return;
    const t = this.pedestalRise;
    this.pedestal.visible = t > 0.001;
    const base = world(BOSS_AT.x, BOSS_AT.y);
    this.pedestal.position.set(base.x + (Math.random() - 0.5) * shake, base.y - PEDESTAL_DEPTH * (1 - t), base.z + (Math.random() - 0.5) * shake);
  }

  /** Once risen: something solid to walk around, and its light stays lit. */
  private settlePedestal() {
    if (this.pedestalCollider) return;
    const base = world(BOSS_AT.x, BOSS_AT.y);
    this.pedestalCollider = physics.addBox(base.clone().setY(base.y + 1.4), new THREE.Vector3(1.3, 1.4, 1.3));
  }

  // ---- ruins ---------------------------------------------------------------------------------

  /**
   * Broken walls and fallen pillars through the dead wood, every stone set on
   * the ground where it stands (so none of it floats on a slope).
   */
  private buildRuins() {
    const rnd = mulberry32(31337);
    const parts: THREE.BufferGeometry[] = [];
    const block = (x: number, z: number, w: number, h: number, d: number, yaw: number, tilt = 0, lift = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, h / 2, 0);
      g.rotateZ(tilt);
      g.rotateY(yaw);
      // Sit on the lowest ground under the block's footprint, sunk a little.
      const r = Math.max(w, d) / 2;
      let y = Infinity;
      for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) y = Math.min(y, heightAt(x + ox, z + oz));
      g.translate(x, y - 0.18 + lift, z);
      parts.push(g.toNonIndexed());
    };
    const wall = (lx: number, lz: number, yaw: number, n: number) => {
      const x0 = C.x + lx, z0 = C.y + lz;
      const dx = Math.cos(yaw), dz = -Math.sin(yaw);
      for (let i = 0; i < n; i++) {
        // A jagged top: tallest near one end, crumbling away toward the other.
        const k = i / Math.max(1, n - 1);
        const h = 0.5 + (1 - Math.abs(k - 0.3) * 1.4) * 2.2 * (0.6 + rnd() * 0.5);
        const x = x0 + dx * i * 1.15, z = z0 + dz * i * 1.15;
        block(x, z, 1.1, Math.max(0.35, h), 0.65, yaw, (rnd() - 0.5) * 0.06);
        if (h > 1.3 && rnd() < 0.5) block(x + (rnd() - 0.5) * 0.3, z + (rnd() - 0.5) * 0.3, 0.9, 0.4, 0.55, yaw + (rnd() - 0.5) * 0.3, 0, Math.max(0.35, h) - 0.05);
        // Fallen stones at its foot.
        if (rnd() < 0.45) block(x + dz * (0.9 + rnd()), z - dx * (0.9 + rnd()), 0.6, 0.35, 0.45, rnd() * Math.PI, (rnd() - 0.5) * 0.4);
      }
      physics.addBox(new THREE.Vector3(x0 + dx * (n - 1) * 0.575, heightAt(x0, z0) + 1, z0 + dz * (n - 1) * 0.575), new THREE.Vector3(n * 0.575, 1.1, 0.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    };
    const pillar = (lx: number, lz: number, standing: boolean) => {
      const x = C.x + lx, z = C.y + lz;
      block(x, z, 1.1, 0.4, 1.1, 0);
      if (standing) {
        const h = 1.4 + rnd() * 1.8;
        const g = new THREE.CylinderGeometry(0.38, 0.42, h, 10);
        g.translate(x, heightAt(x, z) + 0.22 + h / 2, z);
        parts.push(g.toNonIndexed());
        physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + h / 2, z), h / 2, 0.45);
      } else {
        // Toppled: lying in two pieces beside its base.
        const a = rnd() * Math.PI * 2;
        for (const [off, len] of [[1.5, 1.8], [3.4, 1.4]]) {
          const g = new THREE.CylinderGeometry(0.38, 0.38, len, 10);
          g.rotateZ(Math.PI / 2);
          g.rotateY(a);
          const px = x + Math.cos(a) * off, pz = z - Math.sin(a) * off;
          g.translate(px, heightAt(px, pz) + 0.2, pz);
          parts.push(g.toNonIndexed());
        }
      }
    };
    // Along the trail in, and scattered through the wood.
    wall(-18, -46, 0.35, 7);
    pillar(-11, -52, true);
    pillar(-24, -39, false);
    wall(26, -30, -0.9, 5);
    wall(-40, 8, 1.4, 6);
    pillar(-36, 18, true);
    wall(34, 22, 0.2, 4);
    pillar(30, 30, false);
    wall(-8, 42, -0.3, 5);
    pillar(14, -52, true);
    const clean = parts.map((g) => {
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const mat = (this.mats.stone as THREE.MeshStandardMaterial).clone();
    mat.color.multiplyScalar(0.72); // old, damp stone
    const mesh = new THREE.Mesh(mergeGeometries(clean)!, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ---- the pedestal ----------------------------------------------------------------------------

  /** Stepped octagonal plinth, a carved column bearing the Sunwheel, and a glowing capstone. */
  private buildPedestal() {
    const g = new THREE.Group();
    const stone = (this.mats.stone as THREE.MeshStandardMaterial).clone();
    stone.color.multiplyScalar(0.85);
    const add = (geo: THREE.BufferGeometry, y: number, mat: THREE.Material = stone) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(2.1, 2.3, 0.4, 8), 0.2);
    add(new THREE.CylinderGeometry(1.6, 1.8, 0.35, 8), 0.575);
    add(new THREE.CylinderGeometry(1.2, 1.35, 0.3, 8), 0.9);
    add(new THREE.BoxGeometry(0.95, 1.7, 0.95), 1.9);
    add(new THREE.CylinderGeometry(0.95, 0.75, 0.3, 8), 2.9);
    // The Sunwheel carved into all four faces, glowing faintly.
    const glyph = new THREE.MeshBasicMaterial({ map: sunwheelTexture('rgba(255, 226, 150, 1)'), transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.45, 1.1), fog: false });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), glyph);
      const a = (i / 4) * Math.PI * 2;
      p.position.set(Math.sin(a) * 0.49, 1.95, Math.cos(a) * 0.49);
      p.rotation.y = a;
      g.add(p);
    }
    // A cradle of light on the capstone.
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.9, 2.1), fog: false }));
    glow.position.y = 3.35;
    g.add(glow);
    this.pedestalGlow = glow;
    return g;
  }

  // ---- flowers ---------------------------------------------------------------------------------

  /** Stems and blossoms as two instanced meshes; each flower waits its turn, then grows. */
  private buildFlowers() {
    const n = FLOWERS_ON_BODY + FLOWERS_IN_YARD;
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.34, 4);
    stemGeo.translate(0, 0.17, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.075, 0);
    headGeo.scale(1.3, 0.55, 1.3);
    headGeo.translate(0, 0.36, 0);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9 }), n);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x221a10 }), n);
    const palette = [0xf2e8ff, 0xffd6e8, 0xfff1a8, 0xcfe6ff, 0xffb3c1, 0xe8d4ff, 0xffffff];
    const rnd = mulberry32(2024);
    for (let i = 0; i < n; i++) heads.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)]));
    stems.count = heads.count = 0;
    stems.frustumCulled = heads.frustumCulled = false;
    stems.castShadow = false;
    this.group.add(stems, heads);
    return { stems, heads, data: new Float32Array(n * 6), n };
  }

  /**
   * Plant the flowers: first out of the body itself (its bones), then across
   * the whole graveyard, spreading outward from where it lies.
   */
  private plantFlowers(body: THREE.Vector3[], origin: THREE.Vector3) {
    const f = this.flowers;
    if (!f) return;
    const rnd = mulberry32(Math.floor(origin.x * 13 + origin.z * 7) >>> 0);
    let i = 0;
    const put = (x: number, y: number, z: number, delay: number, scale: number) => {
      f.data.set([x, y, z, delay, scale, rnd() * Math.PI * 2], i * 6);
      i++;
    };
    for (let k = 0; k < FLOWERS_ON_BODY && body.length; k++) {
      const b = body[k % body.length];
      put(b.x + (rnd() - 0.5) * 0.45, b.y + 0.05 + rnd() * 0.12, b.z + (rnd() - 0.5) * 0.45, 0.2 + rnd() * 2.2, 0.9 + rnd() * 0.8);
    }
    for (let k = 0; k < FLOWERS_IN_YARD; k++) {
      const x = C.x + (rnd() * 2 - 1) * (HX - 0.8), z = C.y + (rnd() * 2 - 1) * (HZ - 0.8);
      const d = Math.hypot(x - origin.x, z - origin.z);
      // A wave of bloom rolling outward at ~2.5 m/s, with some stragglers.
      put(x, heightAt(x, z) - 0.02, z, 2.5 + d / 2.5 + rnd() * 2.5, 0.7 + rnd() * 0.9);
    }
    f.n = i;
    f.stems.count = f.heads.count = i;
    this.flowerT = 0;
  }

  private growFlowers(dt: number) {
    const f = this.flowers;
    if (!f || this.flowerT < 0) return;
    const done = this.flowerT > 40;
    if (done && f.stems.userData.final) return;
    this.flowerT += dt;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < f.n; i++) {
      const o = i * 6;
      const k = smoothstep(f.data[o + 3], f.data[o + 3] + 1.6, this.flowerT);
      // A little overshoot as each one opens.
      const g = k * (1 + 0.15 * Math.sin(k * Math.PI));
      q.setFromAxisAngle(up, f.data[o + 5]);
      m.compose(p.set(f.data[o], f.data[o + 1], f.data[o + 2]), q, s.setScalar(Math.max(1e-4, g * f.data[o + 4])));
      f.stems.setMatrixAt(i, m);
      f.heads.setMatrixAt(i, m);
    }
    f.stems.instanceMatrix.needsUpdate = f.heads.instanceMatrix.needsUpdate = true;
    if (f.heads.instanceColor) f.heads.instanceColor.needsUpdate = true;
    if (done) f.stems.userData.final = true;
  }

  /** A cleared Gravewood on load: the body where it fell, flowers already grown. */
  private async restoreCorpse() {
    const saved = String(this.hooks.flags.gravewoodBody ?? '');
    const [lx, lz, yaw] = saved ? saved.split(',').map(Number) : [BOSS_AT.x + 3.4, BOSS_AT.y + 1.5, 0.6];
    const at = world(lx, lz);
    const b = await OrcWarlord.create(at, yaw, this.scene, this.fx, { ...ABOMINATION, emerge: false });
    b.lieDead();
    b.present(1, 0.01);
    this.corpse = b;
    this.plantFlowers(b.bonePoints(), at);
    this.flowerT = 1e3;
  }

  // ---- the trap ------------------------------------------------------------------------------

  private seal() {
    this.state = 'sealed';
    this.t = 0;
    this.gateTarget = 0;
    this.gateCollider?.setEnabled(true);
    this.wall.visible = true;
    sfx.gateSlam();
    events.emit('bossSlam', { at: world(0, -HZ) });
    // Everything the waves need loads while the player waits for the dead.
    void preloadUndead([ABOMINATION.model], this.gpu);
    this.hooks.card('The Gravewood', 'The gate slams shut behind you');
    this.hooks.toast('Something stirs beneath the graves…');
  }

  private startWave(i: number) {
    this.wave = i;
    this.state = 'wave';
    this.t = 0;
    // The dead rise one after another, not all at once.
    WAVES[i].forEach((kind, k) => this.spawnQueue.push({ kind, at: 0.4 + k * 2.1 }));
    this.hooks.card(i === 2 ? 'The Final Wave' : `Wave ${i + 1}`, i === 0 ? 'The dead rise' : i === 1 ? 'More claw their way up' : 'The ground itself is moving');
    sfx.rumble(3, 0.9);
    if (i === 2) this.bossPending = true;
  }

  /** A rising spot: a grave mound (not one the player stands on). */
  private riseSpot(player: Player) {
    const pp = new THREE.Vector2(player.pos.x - C.x, player.pos.z - C.y);
    const free = this.graves.filter((g) => g.distanceTo(pp) > 4 && !this.mobs.some((m) => new THREE.Vector2(m.position.x - C.x, m.position.z - C.y).distanceTo(g) < 1.2));
    const list = free.length ? free : this.graves;
    // Prefer graves within reach of the fight rather than the far corners.
    list.sort((a, b) => a.distanceTo(pp) - b.distanceTo(pp) + (Math.random() - 0.5) * 12);
    return list[Math.floor(Math.random() * Math.min(list.length, 6))];
  }

  private spawnBoss(player: Player) {
    this.bossPending = false;
    const at = world(BOSS_AT.x, BOSS_AT.y);
    const yaw = Math.atan2(player.pos.x - at.x, player.pos.z - at.z);
    void OrcWarlord.create(at, yaw, this.scene, this.fx, ABOMINATION).then((b) => {
      if (!this.trapped) return b.dispose(); // the player died while it loaded
      this.boss = b;
      b.onRoar = () => {
        sfx.roar();
        events.emit('bossSlam', { at: player.pos.clone() });
        this.hooks.card('The Stitched Abomination', 'Guardian of the Gravewood');
      };
      b.onDeath = () => this.victory();
      sfx.rumble(3.4, 1);
      this.hooks.toast('The earth splits open…');
      b.wake();
    });
  }

  private victory() {
    this.state = 'victory';
    this.t = 0;
    const at = world(BOSS_AT.x, BOSS_AT.y);
    this.hooks.bossBar(null);
    // Its minions crumble with it.
    for (const m of this.mobs) m.sink();
    this.gateTarget = 1;
    this.gateCollider?.setEnabled(false);
    // A beam of light out of the pit it climbed from, straight into the sky.
    const beam = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.add(outer, core);
    beam.position.copy(at).setY(heightAt(at.x, at.z));
    this.scene.add(beam);
    this.beam = beam;
    this.beamT = 0;
    sfx.beam();
    this.hooks.card('The Curse Is Broken', 'The Gravewood falls silent');
  }

  /** The player died inside: wake at the gate, the dead gone, everything as it was. */
  private reset() {
    this.pendingReset = false;
    for (const m of this.mobs) m.dispose();
    this.mobs = [];
    this.spawnQueue = [];
    this.boss?.dispose();
    this.boss = null;
    this.bossPending = false;
    this.hooks.bossBar(null);
    this.state = 'dormant';
    this.wave = -1;
    this.gateTarget = 1;
    this.gateOpen = 1;
    this.poseGate();
    this.gateCollider?.setEnabled(false);
    this.curse = 0;
    this.hooks.toast('You wake at the graveyard gate. The dead have returned to their graves.');
  }

  // ---- per step ------------------------------------------------------------------------------

  update(dt: number, player: Player) {
    this.time += dt;
    this.t += dt;
    if (!this.pedestal) return; // still loading
    const inside = graveyardDist(player.pos.x, player.pos.z) < -1.2;

    if ((this.trapped || this.state === 'victory') && player.dead) this.pendingReset = this.trapped;
    if (this.pendingReset && !player.dead) this.reset();

    switch (this.state) {
      case 'dormant':
        if (!player.dead && inside && !this.cleared) this.seal();
        break;
      case 'sealed':
        if (this.t >= SEAL_WAIT) this.startWave(0);
        break;
      case 'wave': {
        for (const s of this.spawnQueue.filter((s) => this.t >= s.at)) {
          const g = this.riseSpot(player);
          const at = world(g.x, g.y);
          const yaw = Math.atan2(player.pos.x - at.x, player.pos.z - at.z);
          this.mobs.push(new Undead(s.kind, at, yaw, this.scene, this.fx));
        }
        this.spawnQueue = this.spawnQueue.filter((s) => this.t < s.at);
        if (this.bossPending && this.t > 3.5) this.spawnBoss(player);
        const minionsLeft = this.mobs.length + this.spawnQueue.length;
        if (!minionsLeft && this.wave < 2) {
          this.state = 'lull';
          this.t = 0;
          // A breath between waves: pale light seeps up from the emptied graves and eases your wounds.
          player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
          this.fx.add.spawn({ pos: player.center.clone(), vel: new THREE.Vector3(0, 2, 0), spread: 1.5, count: 30, life: [0.8, 1.6], size: [0.12, 0.02], color: 0xcfe8ff, color2: 0x7fb0ff, upBias: 1.2, drag: 1.2, jitter: 1.2 });
          this.hooks.toast(this.wave === 0 ? 'The ground falls still… a cold light eases your wounds.' : 'A deep rumble rolls through the earth… the light steadies you.');
        }
        break;
      }
      case 'lull':
        if (this.t >= LULL) this.startWave(this.wave + 1);
        break;
      case 'victory': {
        // The body: once the death throes are over it stays, and blooms.
        const b = this.boss;
        if (b && !this.corpse && this.t > 2.6) {
          this.corpse = b;
          this.boss = null;
          b.releaseBody();
          const bones = b.bonePoints();
          this.plantFlowers(bones, b.position.clone());
          const local = b.position.clone().sub(new THREE.Vector3(C.x, 0, C.y));
          this.hooks.flags.gravewoodBody = `${local.x.toFixed(2)},${local.z.toFixed(2)},${b.facing.toFixed(2)}`;
          this.hooks.toast('Flowers push up through the stitched hide…');
        }
        // The pedestal rises out of the pit, inside the light.
        if (this.t > 3.5 && this.pedestalRise < 1) {
          const before = this.pedestalRise;
          this.pedestalRise = Math.min(1, this.pedestalRise + dt / 6);
          if (before === 0) sfx.rumble(6.5, 1);
          if (Math.random() < dt * 3) events.emit('bossSlam', { at: player.pos.clone().add(new THREE.Vector3(0, 0, 6)) });
          if (Math.random() < dt * 18) {
            const p = world(BOSS_AT.x + (Math.random() - 0.5) * 5, BOSS_AT.y + (Math.random() - 0.5) * 5, 0.1);
            this.fx.add.spawn({ pos: p, spread: 2.5, count: 4, life: [0.6, 1.4], size: [0.25, 0.08], color: 0x6a5a48, color2: 0x2a221a, gravity: 3, upBias: 1, alpha: 0.7 });
          }
          // A body lying over the pit is shouldered aside by the stone.
          const c = this.corpse;
          if (c) {
            const pit = world(BOSS_AT.x, BOSS_AT.y);
            const off = c.position.clone().sub(pit).setY(0);
            if (off.length() < 3.4) {
              if (off.lengthSq() < 1e-3) off.set(1, 0, 0);
              c.position.copy(pit).addScaledVector(off.normalize(), Math.min(3.4, off.length() + dt * 1.2));
              c.position.y = heightAt(c.position.x, c.position.z);
              c.present(1, 0);
            }
          }
          this.posePedestal(this.pedestalRise < 1 ? 0.06 : 0);
          if (this.pedestalRise >= 1) this.settlePedestal();
        }
        if (this.t > 11 && this.pedestalRise >= 1 && !this.mobs.length) {
          this.state = 'cleared';
          this.hooks.flags.gravewoodCleared = true;
          this.hooks.save();
        }
        break;
      }
    }

    // The dead.
    for (const m of this.mobs) m.update(dt, player, this.mobs);
    for (const m of this.mobs.filter((m) => m.dead)) m.dispose();
    this.mobs = this.mobs.filter((m) => !m.dead);
    if (this.boss) {
      this.boss.update(dt, player);
      if (this.boss.alive && this.boss.awake && this.boss.lockable) this.hooks.bossBar(this.boss, this.boss.name);
      if (this.boss.dead && this.state !== 'victory') {
        this.boss.dispose();
        this.boss = null;
      }
    }

    // The gate swings shut with a bounce, or creaks open.
    const was = this.gateOpen;
    if (this.gateTarget < this.gateOpen) this.gateOpen = Math.max(0, this.gateOpen - dt * 4.2);
    else if (this.gateTarget > this.gateOpen) this.gateOpen = Math.min(1, this.gateOpen + dt * 0.5);
    if (was !== this.gateOpen) this.poseGate();

    // The curse thickens while shut in, and lifts after the light.
    const want = this.trapped ? 1 : 0;
    const rate = this.state === 'victory' ? 0.25 : want ? 0.35 : 1.5;
    this.curse = clamp(this.curse + Math.sign(want - this.curse) * dt * rate, 0, 1);
    if (Math.abs(this.curse - want) < dt * rate) this.curse = want;
    this.wall.visible = this.curse > 0.01;
  }

  /** Per rendered frame: the boss's pose, the mist and the beam. */
  present(alpha: number, dt: number, player: Player, camera: THREE.Camera) {
    this.boss?.present(alpha, dt, player);
    this.corpse?.present(1, dt, player);
    this.growFlowers(dt);
    if (this.pedestalGlow) this.pedestalGlow.scale.setScalar(0.9 + Math.sin(this.time * 2.2) * 0.1);
    this.wallMat.uniforms.uTime.value = this.time;
    this.wallMat.uniforms.uAmount.value = this.curse;
    // Mist billboards face the camera and drift; thicker as the curse rises, gone once cleared.
    const d = Math.hypot(camera.position.x - C.x, camera.position.z - C.y);
    const near = smoothstep(GRAVEWOOD_R + 90, GRAVEWOOD_R - 20, d);
    this.mistMat.opacity = near * (this.cleared && this.state === 'cleared' ? 0.06 : 0.28 + this.curse * 0.3);
    this.mist.visible = this.mistMat.opacity > 0.005;
    if (this.mist.visible) {
      const base = this.mist.userData.base as THREE.Matrix4[];
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const face = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(camera.position.x - C.x, camera.position.z - C.y), 0));
      for (let i = 0; i < base.length; i++) {
        base[i].decompose(p, q, s);
        p.x += Math.sin(this.time * 0.05 + i) * 3;
        p.z += Math.cos(this.time * 0.04 + i * 1.7) * 3;
        m.compose(p, face, s);
        this.mist.setMatrixAt(i, m);
      }
      this.mist.instanceMatrix.needsUpdate = true;
    }
    // The beam: flares, holds, thins away; motes rise along it.
    if (this.beam) {
      this.beamT += dt;
      const t = this.beamT;
      const k = smoothstep(0, 0.6, t) * (1 - smoothstep(10, 14, t));
      const [outer, core] = this.beam.children as THREE.Mesh[];
      const h = 260;
      outer.scale.set(1.6 + Math.sin(t * 7) * 0.08, h, 1.6 + Math.sin(t * 7) * 0.08);
      core.scale.set(0.55, h, 0.55);
      outer.position.y = core.position.y = h / 2;
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.35 * k;
      (core.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
      if (k > 0.1 && Math.random() < dt * 40) {
        this.fx.add.spawn({ pos: world(BOSS_AT.x, BOSS_AT.y).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 4, (Math.random() - 0.5) * 2)), vel: new THREE.Vector3(0, 9, 0), spread: 1, count: 2, life: [1, 2], size: [0.14, 0.02], color: 0xfff4d0, color2: 0xffc060, drag: 0.2 });
      }
      if (t > 14.5) {
        this.scene.remove(this.beam);
        this.beam = null;
      }
    }
  }

  /** After the sky and weather are applied: the wood's haze, and the curse's smothering fog. */
  atmosphere(r: Renderer, player: THREE.Vector3) {
    const d = Math.hypot(player.x - C.x, player.z - C.y);
    const wood = smoothstep(GRAVEWOOD_R + 70, GRAVEWOOD_R - 30, d) * (this.cleared ? 0.2 : 1);
    const c = this.curse;
    const k = Math.max(wood * 0.65, c);
    if (k <= 0.001) {
      const u = r.post?.finalMat.uniforms;
      if (u) u.uMist.value = 0;
      return;
    }
    const u = r.post?.finalMat.uniforms;
    const grey = new THREE.Color(0.4, 0.44, 0.42).multiplyScalar(0.5 + 0.5 * (1 - c));
    if (u) {
      u.uHaze.value += wood * 0.02 + c * 0.042;
      (u.uHazeColor.value as THREE.Color).lerp(grey, Math.min(1, k));
      (u.uSunColor.value as THREE.Color).lerp(grey, Math.min(1, k * 0.8));
      u.uMist.value = Math.max(c * 0.97, wood * 0.45);
      u.uClouds.value *= 1 - k;
    } else if (r.scene.fog instanceof THREE.Fog) {
      r.scene.fog.color.lerp(grey, k);
      r.scene.fog.far = THREE.MathUtils.lerp(r.scene.fog.far, 30, c) * (1 - wood * 0.6);
    }
    // Light dies under the dead canopy and the smoke.
    r.sun.intensity *= 1 - 0.5 * wood * (1 - c) - 0.75 * c;
    r.hemi.intensity *= 1 - 0.25 * wood * (1 - c) - 0.45 * c;
  }
}
