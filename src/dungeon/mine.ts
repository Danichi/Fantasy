import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import { physics } from '../physics/physics';
import { Slime } from '../enemies/slime';
import { LivingArmour } from '../enemies/livingArmour';
import { emptyMap, type MapData } from '../ui/dungeonMap';
import { pbr } from '../world/props';

export const MINE_ORIGIN = new THREE.Vector3(5000, 0, 0);
export const MINE_CELL = 4;
export const MINE_MAP_W = 48;
export const MINE_MAP_H = 42;

export interface MineProgress {
  gateOpen: boolean;
  guardianDead: boolean;
}

export interface MineHooks {
  toast: (msg: string) => void;
  giveGold: (at: THREE.Vector3, amount: number) => void;
  giveItem: (id: string) => string;
  leave: () => void;
  bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => void;
  save: () => void;
}

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface Openings {
  north?: boolean;
  south?: boolean;
  east?: boolean;
  west?: boolean;
}

let shared: ReturnType<typeof makeMaterials> | null = null;

function makeMaterials() {
  const L = new THREE.TextureLoader();
  const stone = pbr(L, 'rock_face_03', { color: 0x756f66 }, 4, 0.55);
  const stoneDark = pbr(L, 'rock_face_03', { color: 0x47433e }, 4, 0.7);
  const wood = pbr(L, 'weathered_peeling_timber', { color: 0x5a4634 }, 4);
  const planks = pbr(L, 'wood_planks_grey', { color: 0x75604d }, 4);
  const metal = new THREE.MeshStandardMaterial({ color: 0x35383a, metalness: 0.8, roughness: 0.42 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9b7130, metalness: 0.7, roughness: 0.35 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x26282b, metalness: 0.8, roughness: 0.5 });
  const crystal = new THREE.MeshStandardMaterial({
    color: 0x4a5662,
    emissive: 0x1a2b38,
    emissiveIntensity: 0.55,
    roughness: 0.45,
    metalness: 0.55,
  });
  const rune = new THREE.MeshStandardMaterial({
    color: 0x5a3e69,
    emissive: 0x351f46,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  });
  const wetStone = new THREE.MeshStandardMaterial({
    color: 0x2e3035,
    metalness: 0.08,
    roughness: 0.24,
  });
  const ember = new THREE.MeshStandardMaterial({
    color: 0xffa052,
    emissive: 0xb83f0b,
    emissiveIntensity: 1.8,
    roughness: 0.32,
  });
  return { stone, stoneDark, wood, planks, metal, brass, rail, crystal, rune, wetStone, ember };
}

function meshBox(group: THREE.Group, pos: THREE.Vector3, size: THREE.Vector3, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  m.position.copy(pos);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

export class MineInstance {
  readonly group = new THREE.Group();
  readonly interactables: Array<{
    pos: THREE.Vector3;
    radius: number;
    label: () => string;
    enabled: () => boolean;
    action: () => void;
  }> = [];
  readonly map: MapData = emptyMap(MINE_MAP_W, MINE_MAP_H);

  readonly groundAt = (x: number, z: number): number | null => {
    if (
      x < MINE_ORIGIN.x - 31 ||
      x > MINE_ORIGIN.x + 31 ||
      z < MINE_ORIGIN.z - 151 ||
      z > MINE_ORIGIN.z + 12
    ) return null;
    return MINE_ORIGIN.y;
  };

  private colliders: any[] = [];
  private enemies: Array<Slime | LivingArmour> = [];
  private boss: LivingArmour | null = null;
  private gateBars: THREE.Group | null = null;
  private gateCollider: any = null;
  private gateT = 0;
  private time = 0;
  private disposed = false;
  private decorLights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  private glowMaterials: THREE.MeshStandardMaterial[] = [];
  private decorativeRoots: THREE.Object3D[] = [];

  readonly ready: Promise<void>;

  constructor(
    private scene: THREE.Scene,
    private fx: FX,
    private progress: MineProgress,
    private hooks: MineHooks,
  ) {
    const m = shared ??= makeMaterials();
    scene.add(this.group);

    this.buildShell(m);
    this.buildEntrance(m);
    this.buildForemanCamp(m);
    this.buildTunnelSupports(m);
    this.buildRails(m);
    this.buildMachinery(m);
    this.buildGate(m);
    this.buildAncientRuins(m);
    this.buildDeepMine(m);
    this.buildBossArena(m);
    this.buildMineCart(m);
    this.buildAtmosphere(m);
    this.buildDecor(m);
    this.spawnEnemies();
    this.buildExit(m);

    this.ready = this.loadDecorModels();
  }

  get spawnPoint() {
    return MINE_ORIGIN.clone().add(new THREE.Vector3(0, 0.25, 7.5));
  }

  get entranceYaw() {
    return Math.PI;
  }

  cellAt(p: THREE.Vector3): [number, number] {
    return [
      Math.floor((p.x - MINE_ORIGIN.x) / MINE_CELL + MINE_MAP_W / 2),
      Math.floor((p.z - MINE_ORIGIN.z) / MINE_CELL + MINE_MAP_H / 2),
    ];
  }

  private box(pos: THREE.Vector3, half: THREE.Vector3) {
    const c = physics.addBox(pos, half);
    this.colliders.push(c);
    return c;
  }

  private wall(
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
  ) {
    const p = new THREE.Vector3(x, MINE_ORIGIN.y + h / 2, z);
    meshBox(this.group, p, new THREE.Vector3(w, h, d), mat);
    this.box(p, new THREE.Vector3(w / 2, h / 2, d / 2));
  }

  private room(
    r: Rect,
    m: ReturnType<typeof makeMaterials>,
    openings: Openings = {},
  ) {
    const floor = meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x + r.x, -0.175, MINE_ORIGIN.z + r.z),
      new THREE.Vector3(r.w, 0.35, r.d),
      m.stone,
    );
    this.box(floor.position.clone(), new THREE.Vector3(r.w / 2, 0.175, r.d / 2));

    const h = 5.8;
    const t = 0.65;
    const lx = MINE_ORIGIN.x + r.x - r.w / 2;
    const rx = MINE_ORIGIN.x + r.x + r.w / 2;
    const nz = MINE_ORIGIN.z + r.z - r.d / 2;
    const sz = MINE_ORIGIN.z + r.z + r.d / 2;
    const opening = 4.6;
    const sideW = (r.w - opening) / 2;
    const sideD = (r.d - opening) / 2;
    const cx = MINE_ORIGIN.x + r.x;
    const cz = MINE_ORIGIN.z + r.z;

    const horizontalWall = (z: number, open: boolean) => {
      if (!open) {
        this.wall(cx, z, r.w, h, t, m.stoneDark);
        return;
      }
      this.wall(lx + t / 2 + sideW / 2, z, sideW, h, t, m.stoneDark);
      this.wall(rx - t / 2 - sideW / 2, z, sideW, h, t, m.stoneDark);
    };

    const verticalWall = (x: number, open: boolean) => {
      if (!open) {
        this.wall(x, cz, t, h, r.d, m.stoneDark);
        return;
      }
      this.wall(x, nz + t / 2 + sideD / 2, t, h, sideD, m.stoneDark);
      this.wall(x, sz - t / 2 - sideD / 2, t, h, sideD, m.stoneDark);
    };

    verticalWall(lx, openings.west ?? false);
    verticalWall(rx, openings.east ?? false);
    horizontalWall(nz, openings.north ?? false);
    horizontalWall(sz, openings.south ?? false);

    meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x + r.x, MINE_ORIGIN.y + 6.15, MINE_ORIGIN.z + r.z),
      new THREE.Vector3(r.w + 1.2, 0.38, r.d + 1.2),
      m.stoneDark,
    );
  }

  private corridor(
    x: number,
    z: number,
    w: number,
    d: number,
    m: ReturnType<typeof makeMaterials>,
  ) {
    const floor = meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x + x, -0.175, MINE_ORIGIN.z + z),
      new THREE.Vector3(w, 0.35, d),
      m.stone,
    );
    this.box(floor.position.clone(), new THREE.Vector3(w / 2, 0.175, d / 2));
  }

  private buildShell(m: ReturnType<typeof makeMaterials>) {
    // The mine follows the concept image's progression:
    // entrance -> foreman's camp -> winding tunnels -> machinery -> ruins -> blue deep mine -> boss.
    this.room({ x: 0, z: 0, w: 14, d: 14 }, m, { south: true });
    this.corridor(0, -9, 7, 10, m);

    this.room({ x: -4, z: -22, w: 20, d: 18 }, m, { north: true, south: true });
    this.corridor(-3.5, -35, 4.5, 8, m);

    this.room({ x: 0, z: -47, w: 12, d: 20 }, m, { north: true, south: true, east: true });
    this.corridor(5, -59, 8, 6, m);

    this.room({ x: 8, z: -72, w: 28, d: 22 }, m, { north: true, south: true, west: true });
    this.corridor(-9, -72, 6, 6, m);
    this.corridor(10, -49, 9, 6, m);

    this.room({ x: 0, z: -103, w: 30, d: 24 }, m, { north: true, south: true });
    this.corridor(4, -87, 8, 8, m);

    this.room({ x: 0, z: -140, w: 24, d: 20 }, m, { north: true });

    // Side chambers echo the concept art's offset cutaway silhouette.
    this.room({ x: -18, z: -72, w: 12, d: 14 }, m, { east: true });
    this.room({ x: 20, z: -49, w: 11, d: 13 }, m, { west: true });

    // Rock ceiling slabs visually unify the separate chambers.
    for (const [x, z, w, d] of [
      [0, -20, 26, 23],
      [0, -48, 20, 25],
      [8, -72, 34, 27],
      [0, -103, 36, 29],
      [0, -140, 29, 25],
    ] as const) {
      meshBox(
        this.group,
        new THREE.Vector3(MINE_ORIGIN.x + x, MINE_ORIGIN.y + 6.15, MINE_ORIGIN.z + z),
        new THREE.Vector3(w, 0.42, d),
        m.stoneDark,
      );
    }
  }

  private addRockRim(
    center: THREE.Vector3,
    width: number,
    depth: number,
    count: number,
    mat: THREE.Material,
    seedOffset = 0,
  ) {
    for (let i = 0; i < count; i++) {
      const a = ((i + seedOffset) / count) * Math.PI * 2;
      const edge = i % 2 === 0 ? 1 : 0.78;
      const x = center.x + Math.cos(a) * width * 0.5 * edge;
      const z = center.z + Math.sin(a) * depth * 0.5 * edge;
      const s = 0.55 + ((i * 37) % 7) * 0.075;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), mat);
      rock.scale.y = 0.65 + (i % 3) * 0.16;
      rock.position.set(x, 0.45 + (i % 4) * 0.08, z);
      rock.rotation.set((i * 0.37) % 1.0, a + 0.6, (i * 0.23) % 0.8);
      rock.castShadow = rock.receiveShadow = true;
      this.group.add(rock);
    }
  }

  private addLanternLight(pos: THREE.Vector3, color = 0xff9b4a, intensity = 2.2, distance = 13) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({
      color: 0xffb66c,
      emissive: color,
      emissiveIntensity: 2.4,
      roughness: 0.25,
    }));
    bulb.position.copy(pos).setY(pos.y + 2.75);
    bulb.castShadow = false;
    this.group.add(bulb);

    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.copy(bulb.position);
    light.castShadow = false;
    this.group.add(light);
    this.decorLights.push({ light, base: intensity, phase: this.decorLights.length * 0.83 });
  }

  private addCrystalCluster(center: THREE.Vector3, radius: number, count: number, scale = 1) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (i % 2) * 0.22;
      const d = radius * (0.35 + (i % 3) * 0.24);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.65 + (i % 3) * 0.16, 1), shared!.crystal);
      crystal.scale.set(0.8 * scale, (1.8 + (i % 3) * 0.55) * scale, 0.8 * scale);
      crystal.position.set(
        center.x + Math.cos(a) * d,
        0.42 + (i % 4) * 0.18,
        center.z + Math.sin(a) * d,
      );
      crystal.rotation.set(0.15 + i * 0.05, a, -0.1 + i * 0.03);
      crystal.castShadow = crystal.receiveShadow = true;
      this.group.add(crystal);
    }
  }

  private buildAtmosphere(m: ReturnType<typeof makeMaterials>) {
    // Warm amber pools guide the player through the worked mine; cold blue ore
    // takes over deeper in, reproducing the concept's warm-to-cool descent.
    const lights: Array<[number, number, number, number]> = [
      [-0.0, 3.0, 1.5, 2.7],
      [-9.0, 3.0, -22, 2.4],
      [7.0, 3.0, -47, 1.9],
      [10.0, 3.0, -72, 2.6],
      [-3.0, 3.3, -102, 1.8],
      [3.0, 3.6, -139, 1.3],
    ];
    for (const [x, y, z, intensity] of lights) {
      this.addLanternLight(new THREE.Vector3(MINE_ORIGIN.x + x, y, MINE_ORIGIN.z + z), 0xff8c46, intensity, 14);
    }

    const cold = new THREE.PointLight(0x4b9ed9, 3.1, 23, 2);
    cold.position.set(MINE_ORIGIN.x, 3.8, MINE_ORIGIN.z - 112);
    this.group.add(cold);

    const cold2 = new THREE.PointLight(0x5a8ee8, 2.0, 18, 2);
    cold2.position.set(MINE_ORIGIN.x + 11, 2.9, MINE_ORIGIN.z - 124);
    this.group.add(cold2);

    this.glowMaterials.push(shared!.crystal, shared!.rune);
    this.addCrystalCluster(new THREE.Vector3(MINE_ORIGIN.x - 10, 0, MINE_ORIGIN.z - 103), 3.2, 7, 1.0);
    this.addCrystalCluster(new THREE.Vector3(MINE_ORIGIN.x + 11, 0, MINE_ORIGIN.z - 109), 3.0, 6, 0.9);
    this.addCrystalCluster(new THREE.Vector3(MINE_ORIGIN.x - 11, 0, MINE_ORIGIN.z - 119), 2.5, 5, 0.82);

    // Low hanging embers in the worked sections.
    for (const z of [-24, -47, -72]) {
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m.ember);
      ember.position.set(MINE_ORIGIN.x + 1.5, 3.2, MINE_ORIGIN.z + z);
      this.group.add(ember);
    }
  }

  private buildDecor(m: ReturnType<typeof makeMaterials>) {
    this.addRockRim(new THREE.Vector3(MINE_ORIGIN.x - 7, 0, MINE_ORIGIN.z - 22), 18, 15, 18, m.wetStone, 2);
    this.addRockRim(new THREE.Vector3(MINE_ORIGIN.x + 8, 0, MINE_ORIGIN.z - 72), 28, 22, 28, m.wetStone, 3);
    this.addRockRim(new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 103), 29, 23, 30, m.wetStone, 4);
    this.addRockRim(new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 140), 24, 19, 24, m.wetStone, 6);

    // Small puddles break up the repeated stone floor.
    for (const [x, z, s] of [
      [-4, -18, 1.4], [6, -52, 1.1], [15, -75, 1.8], [-13, -106, 1.5], [7, -134, 1.2],
    ] as const) {
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(s, 24),
        new THREE.MeshStandardMaterial({ color: 0x1a2430, metalness: 0.25, roughness: 0.08, transparent: true, opacity: 0.78 }),
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(MINE_ORIGIN.x + x, 0.032, MINE_ORIGIN.z + z);
      puddle.receiveShadow = true;
      this.group.add(puddle);
    }

    // Timber braces get diagonal struts in the biggest chambers, closer to
    // a hand-built mine than a grid of upright posts.
    for (const [x, z, span] of [
      [-4, -22, 5.5], [8, -72, 9], [0, -103, 10], [0, -140, 8],
    ] as const) {
      for (const side of [-1, 1]) {
        const beam = meshBox(
          this.group,
          new THREE.Vector3(MINE_ORIGIN.x + x + side * span * 0.36, 2.5, MINE_ORIGIN.z + z + 0.7),
          new THREE.Vector3(0.28, 4.8, 0.28),
          m.wood,
        );
        beam.rotation.z = side * 0.34;
      }
    }
  }

  private async loadDecorModels() {
    const loader = new GLTFLoader();
    const load = async (id: string) => {
      try {
        const g = await loader.loadAsync('/assets/models/' + id + '.glb');
        g.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        return g.scene;
      } catch {
        return null;
      }
    };

    const [rocks, crates, barrels, lantern] = await Promise.all([
      load('rock_moss_set_01'),
      load('wooden_crate_01'),
      load('wooden_barrels_01'),
      load('wooden_lantern_01'),
    ]);

    const addModel = (src: THREE.Object3D | null, pos: THREE.Vector3, scale = 1, rotY = 0) => {
      if (!src) return;
      const o = src.clone();
      o.position.copy(pos);
      o.rotation.y = rotY;
      o.scale.setScalar(scale);
      o.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.group.add(o);
      this.decorativeRoots.push(o);
    };

    addModel(crates, new THREE.Vector3(MINE_ORIGIN.x - 11, 0, MINE_ORIGIN.z - 17), 0.9, 0.15);
    addModel(crates, new THREE.Vector3(MINE_ORIGIN.x - 8.7, 0, MINE_ORIGIN.z - 18.2), 0.72, -0.35);
    addModel(barrels, new THREE.Vector3(MINE_ORIGIN.x + 5.8, 0, MINE_ORIGIN.z - 19), 0.9, 0.25);
    addModel(barrels, new THREE.Vector3(MINE_ORIGIN.x + 6.7, 0, MINE_ORIGIN.z - 20.2), 0.65, 1.1);

    for (const [x, z, s, r] of [
      [-12, -71, 1.3, 0.2], [-15, -76, 1.0, 0.9], [15, -70, 1.1, 1.5],
      [-14, -103, 1.25, 0.3], [14, -106, 1.35, 1.8], [-13, -118, 1.1, 0.8],
    ] as const) {
      addModel(rocks, new THREE.Vector3(MINE_ORIGIN.x + x, 0, MINE_ORIGIN.z + z), s, r);
    }

    for (const [x, z] of [[-10, -22], [7, -73], [-6, -103], [7, -139]] as const) {
      addModel(lantern, new THREE.Vector3(MINE_ORIGIN.x + x, 2.6, MINE_ORIGIN.z + z), 0.8, 0);
    }
  }

  private buildEntrance(m: ReturnType<typeof makeMaterials>) {
    for (const z of [4, 0, -4, -8, -12]) {
      for (const sx of [-1, 1]) {
        meshBox(
          this.group,
          new THREE.Vector3(MINE_ORIGIN.x + sx * 5.3, 2.35, MINE_ORIGIN.z + z),
          new THREE.Vector3(0.38, 4.7, 0.38),
          m.wood,
        );
      }
      meshBox(
        this.group,
        new THREE.Vector3(MINE_ORIGIN.x, 4.58, MINE_ORIGIN.z + z),
        new THREE.Vector3(10.8, 0.38, 0.38),
        m.wood,
      );
    }

    // Entrance arch and warning lanterns.
    for (const sx of [-1, 1]) {
      meshBox(
        this.group,
        new THREE.Vector3(MINE_ORIGIN.x + sx * 6.5, 3.0, MINE_ORIGIN.z + 1),
        new THREE.Vector3(0.65, 6, 0.65),
        m.stoneDark,
      );
    }
    meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x, 5.7, MINE_ORIGIN.z + 1),
      new THREE.Vector3(13.6, 0.65, 0.75),
      m.stoneDark,
    );
    this.addLantern(new THREE.Vector3(MINE_ORIGIN.x - 5.4, 3.0, MINE_ORIGIN.z - 2), m.brass);
    this.addLantern(new THREE.Vector3(MINE_ORIGIN.x + 5.4, 3.0, MINE_ORIGIN.z - 2), m.brass);
  }

  private buildForemanCamp(m: ReturnType<typeof makeMaterials>) {
    const base = new THREE.Vector3(MINE_ORIGIN.x - 4, 0, MINE_ORIGIN.z - 22);

    // Work table, crates and a rough bunk.
    meshBox(this.group, base.clone().add(new THREE.Vector3(-3, 1.0, -2)), new THREE.Vector3(4.2, 0.25, 1.5), m.planks);
    for (const x of [-4.5, -1.5]) {
      meshBox(this.group, base.clone().add(new THREE.Vector3(x, 0.55, -2)), new THREE.Vector3(0.22, 1.1, 0.22), m.wood);
    }

    for (const p of [
      [-5.5, 0.7, 3.0],
      [-3.9, 0.65, 4.0],
      [1.2, 0.65, 3.4],
      [2.5, 0.95, 1.7],
    ] as const) {
      const s = p[1] > 0.8 ? 1.8 : 1.3;
      meshBox(
        this.group,
        base.clone().add(new THREE.Vector3(p[0], p[1], p[2])),
        new THREE.Vector3(s, s, s),
        m.planks,
      );
    }

    meshBox(
      this.group,
      base.clone().add(new THREE.Vector3(-1.8, 0.35, 2.5)),
      new THREE.Vector3(3.6, 0.5, 1.35),
      m.wood,
    );
    this.addLantern(base.clone().add(new THREE.Vector3(0, 2.8, -3.5)), m.brass);
    this.addLantern(base.clone().add(new THREE.Vector3(5.2, 3.0, 1.5)), m.brass);
  }

  private buildTunnelSupports(m: ReturnType<typeof makeMaterials>) {
    for (const [z, x] of [
      [-14, 0],
      [-29, 0],
      [-39, 2],
      [-54, 0],
      [-62, 0],
      [-83, 8],
      [-95, 0],
      [-112, 0],
      [-127, 0],
    ] as const) {
      const half = x === 8 ? 12.5 : 5.2;
      for (const sx of [-1, 1]) {
        meshBox(
          this.group,
          new THREE.Vector3(MINE_ORIGIN.x + x + sx * half, 2.65, MINE_ORIGIN.z + z),
          new THREE.Vector3(0.38, 5.3, 0.38),
          m.wood,
        );
      }
      meshBox(
        this.group,
        new THREE.Vector3(MINE_ORIGIN.x + x, 5.15, MINE_ORIGIN.z + z),
        new THREE.Vector3(half * 2, 0.38, 0.38),
        m.wood,
      );
    }

    // Broken support and fallen beam in the side gallery.
    const fallen = meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x - 18, 1.15, MINE_ORIGIN.z - 72),
      new THREE.Vector3(8.5, 0.35, 0.55),
      m.wood,
    );
    fallen.rotation.y = 0.45;
  }

  private buildRails(m: ReturnType<typeof makeMaterials>) {
    for (const [x, z0, z1] of [
      [0, -8, -42],
      [0, -40, -78],
      [0, -80, -126],
    ] as const) {
      for (const dx of [-0.72, 0.72]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, Math.abs(z1 - z0), 6), m.rail);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(MINE_ORIGIN.x + x + dx, 0.12, MINE_ORIGIN.z + (z0 + z1) / 2);
        this.group.add(rail);
      }
      for (let z = z0; z >= z1; z -= 2.2) {
        meshBox(
          this.group,
          new THREE.Vector3(MINE_ORIGIN.x + x, 0.02, MINE_ORIGIN.z + z),
          new THREE.Vector3(2.1, 0.16, 0.34),
          m.wood,
        );
      }
    }
  }

  private buildMachinery(m: ReturnType<typeof makeMaterials>) {
    const center = new THREE.Vector3(MINE_ORIGIN.x + 8, 0, MINE_ORIGIN.z - 72);

    // Large haul wheel / winch assembly.
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.22, 10, 34), m.brass);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.copy(center).add(new THREE.Vector3(6.0, 3.0, -2.0));
    this.group.add(wheel);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 12), m.metal);
    axle.rotation.z = Math.PI / 2;
    axle.position.copy(center).add(new THREE.Vector3(6.0, 3.0, -2.0));
    this.group.add(axle);

    for (const z of [-5, 0, 5]) {
      meshBox(
        this.group,
        center.clone().add(new THREE.Vector3(-7, 1.2, z)),
        new THREE.Vector3(4.5, 0.3, 1.4),
        m.planks,
      );
      meshBox(
        this.group,
        center.clone().add(new THREE.Vector3(-7, 0.7, z)),
        new THREE.Vector3(0.3, 1.2, 0.3),
        m.wood,
      );
    }

    const lever = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.9), m.brass);
    base.position.y = 0.17;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), m.metal);
    arm.position.y = 1.05;
    arm.rotation.z = this.progress.gateOpen ? 0.5 : -0.5;
    lever.add(base, arm);
    lever.position.set(MINE_ORIGIN.x + 4.6, 0, MINE_ORIGIN.z - 67.5);
    this.group.add(lever);

    this.interactables.push({
      pos: lever.position.clone(),
      radius: 2.3,
      label: () => this.progress.gateOpen ? 'The winch is engaged' : 'Pull the mine winch',
      enabled: () => !this.progress.gateOpen,
      action: () => this.openGate(lever),
    });

    this.addLantern(new THREE.Vector3(MINE_ORIGIN.x + 1.5, 3.2, MINE_ORIGIN.z - 65), m.brass);
    this.addLantern(new THREE.Vector3(MINE_ORIGIN.x + 15, 3.0, MINE_ORIGIN.z - 77), m.brass);
  }

  private buildGate(m: ReturnType<typeof makeMaterials>) {
    const g = new THREE.Group();
    for (let i = -5; i <= 5; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.17, 5.4, 0.2), m.metal);
      bar.position.set(i * 0.42, 2.7, 0);
      g.add(bar);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.22, 0.34), m.metal);
    top.position.y = 5.25;
    g.add(top);

    g.position.set(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 82);
    this.group.add(g);
    this.gateBars = g;
    this.gateT = this.progress.gateOpen ? 1 : 0;
    if (!this.progress.gateOpen) {
      this.gateCollider = this.box(
        new THREE.Vector3(MINE_ORIGIN.x, 2.6, MINE_ORIGIN.z - 82),
        new THREE.Vector3(2.5, 2.6, 0.3),
      );
    } else {
      g.position.y = 5.9;
    }
  }

  private buildAncientRuins(m: ReturnType<typeof makeMaterials>) {
    const c = new THREE.Vector3(MINE_ORIGIN.x - 18, 0, MINE_ORIGIN.z - 72);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        meshBox(
          this.group,
          c.clone().add(new THREE.Vector3(sx * 4.1, 2.2, sz * 4.3)),
          new THREE.Vector3(0.75, 4.4, 0.75),
          m.stoneDark,
        );
      }
    }

    // Broken arch.
    meshBox(
      this.group,
      c.clone().add(new THREE.Vector3(-4.0, 4.6, 0)),
      new THREE.Vector3(0.7, 1.0, 7.2),
      m.stoneDark,
    );
    meshBox(
      this.group,
      c.clone().add(new THREE.Vector3(4.0, 4.6, 0)),
      new THREE.Vector3(0.7, 1.0, 7.2),
      m.stoneDark,
    );
    const lintel = meshBox(
      this.group,
      c.clone().add(new THREE.Vector3(0, 5.15, 0)),
      new THREE.Vector3(8.0, 0.8, 0.9),
      m.stoneDark,
    );
    lintel.rotation.z = -0.08;

    const altar = meshBox(
      this.group,
      c.clone().add(new THREE.Vector3(0, 0.45, 0)),
      new THREE.Vector3(4.0, 0.9, 4.0),
      m.stoneDark,
    );
    this.box(altar.position.clone(), new THREE.Vector3(2, 0.45, 2));

    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const rune = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.18, 8), m.rune);
      rune.position.copy(c).add(new THREE.Vector3(Math.cos(a) * 3, 0.85, Math.sin(a) * 3));
      this.group.add(rune);
    }

    this.addLantern(c.clone().add(new THREE.Vector3(0, 3.0, -5.4)), m.brass);
  }

  private buildDeepMine(m: ReturnType<typeof makeMaterials>) {
    const c = new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 103);

    // A lower-looking cavern is communicated through stone shelves, huge ribs and luminous ore.
    for (const [x, z, s] of [
      [-12, -8, 1.8],
      [12, -8, 2.4],
      [-13, 4, 2.0],
      [13, 5, 2.1],
      [-8, 9, 1.5],
      [8, 8, 1.6],
    ] as const) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 1.25, 5.6, 7), m.stoneDark);
      pillar.position.copy(c).add(new THREE.Vector3(x, 2.8, z));
      pillar.rotation.y = (x + z) * 0.03;
      this.group.add(pillar);
    }

    for (const [x, z, y, scale] of [
      [-10, -5, 1.1, 1.0],
      [11, -3, 1.2, 1.2],
      [-12, 7, 1.0, 0.9],
      [12, 7, 1.2, 1.1],
      [-4, 10, 0.9, 0.8],
      [4, 9, 1.1, 0.9],
    ] as const) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), m.crystal);
      crystal.scale.set(scale, 2.5 * scale, scale);
      crystal.position.copy(c).add(new THREE.Vector3(x, y, z));
      crystal.rotation.set(0.2, (x + z) * 0.05, -0.15);
      this.group.add(crystal);
    }

    // Ore shelf in the center visually separates the deep mine from the boss arena.
    const shelf = meshBox(
      this.group,
      c.clone().add(new THREE.Vector3(0, 0.55, 7.5)),
      new THREE.Vector3(12.5, 1.1, 2.4),
      m.stoneDark,
    );
    this.box(shelf.position.clone(), new THREE.Vector3(6.25, 0.55, 1.2));
  }

  private buildBossArena(m: ReturnType<typeof makeMaterials>) {
    const c = new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 140);

    const altar = meshBox(
      this.group,
      c.clone().add(new THREE.Vector3(0, 0.45, -1)),
      new THREE.Vector3(6.5, 0.9, 6.5),
      m.stoneDark,
    );
    this.box(altar.position.clone(), new THREE.Vector3(3.25, 0.45, 3.25));

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8.2, 0.45, 8, 34),
      m.stoneDark,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(c).add(new THREE.Vector3(0, 0.25, -1));
    this.group.add(ring);

    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3]) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), m.crystal);
      crystal.scale.set(1, 2.7, 1);
      crystal.position.copy(c).add(new THREE.Vector3(Math.cos(a) * 9.5, 1.2, Math.sin(a) * 8.0));
      crystal.rotation.y = a;
      this.group.add(crystal);
    }

    this.addLantern(c.clone().add(new THREE.Vector3(-9, 3.5, 0)), m.brass);
    this.addLantern(c.clone().add(new THREE.Vector3(9, 3.5, 0)), m.brass);
  }

  private buildMineCart(m: ReturnType<typeof makeMaterials>) {
    const g = new THREE.Group();
    meshBox(g, new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(2.2, 0.5, 1.35), m.metal);
    meshBox(g, new THREE.Vector3(0, 1.15, 0), new THREE.Vector3(2.35, 0.18, 1.48), m.wood);

    for (const x of [-0.82, 0.82]) {
      for (const z of [-0.46, 0.46]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.13, 10), m.metal);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.45, z);
        g.add(wheel);
      }
    }

    g.position.set(MINE_ORIGIN.x - 2.0, 0, MINE_ORIGIN.z - 12.5);
    this.group.add(g);
  }

  private addLantern(pos: THREE.Vector3, mat: THREE.Material) {
    const post = meshBox(this.group, pos.clone().setY(1.6), new THREE.Vector3(0.14, 3.2, 0.14), mat);
    post.castShadow = true;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8b75c, emissive: 0xa85b17, emissiveIntensity: 1.1 }),
    );
    light.position.copy(pos).setY(3.2);
    this.group.add(light);
  }

  private spawnEnemies() {
    const pts = [
      new THREE.Vector3(MINE_ORIGIN.x - 2.5, 0, MINE_ORIGIN.z - 26),
      new THREE.Vector3(MINE_ORIGIN.x + 3.0, 0, MINE_ORIGIN.z - 43),
      new THREE.Vector3(MINE_ORIGIN.x + 16, 0, MINE_ORIGIN.z - 74),
      new THREE.Vector3(MINE_ORIGIN.x - 11, 0, MINE_ORIGIN.z - 101),
    ];

    this.enemies.push(new Slime('cave', pts[0], this.scene, this.fx));
    this.enemies.push(new Slime('green', pts[1], this.scene, this.fx));
    this.enemies.push(new LivingArmour(pts[2], this.scene, this.fx));
    this.enemies.push(new LivingArmour(pts[3], this.scene, this.fx));

    if (!this.progress.guardianDead) {
      this.boss = new LivingArmour(
        new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 140),
        this.scene,
        this.fx,
      );
      this.enemies.push(this.boss);
    }
  }

  private buildExit(m: ReturnType<typeof makeMaterials>) {
    meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x + 5.8, 1.4, MINE_ORIGIN.z + 5.5),
      new THREE.Vector3(0.32, 1.3, 0.32),
      m.brass,
    );

    this.interactables.push({
      pos: new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z + 7.5),
      radius: 2.4,
      label: () => 'Leave the mine',
      enabled: () => true,
      action: () => this.hooks.leave(),
    });

    this.interactables.push({
      pos: new THREE.Vector3(MINE_ORIGIN.x - 18, 0, MINE_ORIGIN.z - 72),
      radius: 2.6,
      label: () => 'Inspect the ancient altar',
      enabled: () => true,
      action: () => this.hooks.toast('The old kings carved this shrine into the mine rock. The ore below is still warm.'),
    });
  }

  private openGate(lever: THREE.Group) {
    if (this.progress.gateOpen) return;
    this.progress.gateOpen = true;
    const arm = lever.children[1];
    if (arm) arm.rotation.z = 0.5;
    this.gateT = 0;
    this.hooks.toast('The winch groans. The blast gate rises.');
    this.hooks.save();
  }

  update(dt: number, player: Player) {
    if (this.disposed) return;
    this.time += dt;

    for (const item of this.decorLights) {
      const flicker = 1 + Math.sin(this.time * 8 + item.phase) * 0.045 + Math.sin(this.time * 17 + item.phase * 1.7) * 0.025;
      item.light.intensity = item.base * flicker;
    }
    for (const mat of this.glowMaterials) {
      mat.emissiveIntensity = 0.42 + Math.sin(this.time * 1.8) * 0.05;
    }

    if (this.progress.gateOpen && this.gateBars && this.gateT < 1) {
      this.gateT = Math.min(1, this.gateT + dt * 0.8);
      this.gateBars.position.y = 5.9 * this.gateT;
      if (this.gateT >= 1 && this.gateCollider) {
        physics.world.removeCollider(this.gateCollider, false);
        this.colliders = this.colliders.filter((c) => c !== this.gateCollider);
        this.gateCollider = null;
      }
      if (Math.random() < dt * 8) {
        this.fx.dust(this.gateBars.position.clone().setY(0.4), 0.5);
      }
    }

    const slimes = this.enemies.filter((e): e is Slime => e instanceof Slime);
    for (const e of this.enemies) {
      if (e instanceof Slime) e.update(dt, player, slimes);
      else e.update(dt, player);
    }

    if (this.boss) {
      if (this.boss.alive) {
        this.hooks.bossBar(this.boss, 'The Deep Warden');
      } else if (!this.progress.guardianDead) {
        this.progress.guardianDead = true;
        this.hooks.bossBar(null);
        this.hooks.giveGold(this.boss.center.clone(), 350);
        const reward = this.hooks.giveItem('knightSword');
        this.hooks.toast('The Deep Warden falls. Its hoard yields a ' + reward + '.');
        this.hooks.save();
      }
    }

    for (const e of [...this.enemies]) {
      if (!e.alive && e !== this.boss) e.dispose();
    }

    this.enemies = this.enemies.filter((e) => e.alive || e === this.boss);
    if (this.boss && !this.boss.alive && this.boss.dead) {
      this.boss.dispose();
      this.boss = null;
    }

    if (Math.random() < dt * 5) {
      const p = player.pos.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          1.2 + Math.random() * 2,
          (Math.random() - 0.5) * 8,
        ),
      );
      this.fx.alpha.spawn({
        pos: p,
        spread: 0.05,
        count: 1,
        life: [2, 4],
        size: [0.03, 0.03],
        color: 0xb9aa8f,
        alpha: 0.38,
      });
    }
  }

  present(_alpha: number, _dt: number, _player: Player) {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hooks.bossBar(null);

    for (const e of this.enemies) e.dispose();
    this.enemies = [];

    for (const c of this.colliders) {
      physics.world.removeCollider(c, false);
    }
    this.colliders = [];

    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
