import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../physics/physics';
import { pbr } from '../world/props';
import { mats, paintedWood } from '../items/materials';
import { generateFloor, Grid, type Cell, type FloorLayout } from './generator';
import { Slime, type SlimeKind } from '../enemies/slime';
import { LivingArmour } from '../enemies/livingArmour';
import { OrcWarlord } from '../enemies/orc';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { segmentPointDistance } from '../core/math';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// ---------------------------------------------------------------------------
// One floor of the crypt, built from a generated layout far outside the
// overworld (so the overworld is beyond the camera's far plane). Everything a
// floor creates is tracked and removed again by dispose().
// ---------------------------------------------------------------------------

export const DUNGEON_ORIGIN = new THREE.Vector3(3000, 0, 0);
export const CELL = 4;
const WALL_H = 4.4;
const WALL_T = 0.8;

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: () => string;
  enabled: () => boolean;
  action: () => void;
}

export interface DungeonProgress {
  gateOpen: boolean;
  bossDead: boolean;
  chests: string[]; // "floor:i,j" of opened chests
}

export interface DungeonHooks {
  toast: (msg: string) => void;
  giveItem: (id: string) => string; // returns the item's name
  giveGold: (at: THREE.Vector3, amount: number) => void;
  hasItem: (id: string) => boolean;
  descend: () => void;
  ascend: () => void;
  leave: () => void;
  bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => void;
  save: () => void;
}

type Dir = 'n' | 's' | 'e' | 'w';
const DV: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

let matCache: ReturnType<typeof buildMats> | null = null;
function buildMats() {
  const L = new THREE.TextureLoader();
  const wall = pbr(L, 'castle_brick_07', { color: 0xb5c0bd }, 4, 0.72);
  const floor = pbr(L, 'cobblestone_floor_08', { color: 0xa0aaa7 }, 4, 0.32);
  const ceil = pbr(L, 'rock_face_03', { color: 0x687b82 }, 4, 0.72);
  const pillar = pbr(L, 'rock_face_03', { color: 0xbac6c2 }, 4, 0.72);
  for (const m of [wall, pillar]) for (const t of [m.map, m.normalMap, m.roughnessMap]) t?.repeat.set(1.6, 1.6);
  for (const t of [floor.map, floor.normalMap, floor.roughnessMap]) t?.repeat.set(1.5, 1.5);
  const flame = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(3.5, 1.9, 0.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const wood = new THREE.MeshStandardMaterial({ map: paintedWood(51, () => {}, 5), roughness: 0.85, color: 0x9a7a5a });
  return { wall, floor, ceil, pillar, flame, wood, iron: mats().iron, dark: new THREE.MeshBasicMaterial({ color: 0x000000 }) };
}

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 36, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,200,120,0.8)');
  gr.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Chest {
  key: string;
  cell: Cell;
  lid: THREE.Group;
  open: boolean;
  t: number;
  loot: string;
  pos: THREE.Vector3;
}
interface Spike { cell: Cell; spikes: THREE.Object3D; t: number; hit: boolean; armed: boolean; plate: THREE.Mesh }
interface Dart { plate: Cell; from: THREE.Vector3; to: THREE.Vector3; t: number; mesh: THREE.Mesh | null; pos: THREE.Vector3; vel: THREE.Vector3; hit: boolean }

export class DungeonInstance {
  readonly layout: FloorLayout;
  readonly grid: Grid;
  readonly interactables: Interactable[] = [];
  readonly group = new THREE.Group();
  private colliders: RAPIER.Collider[] = [];
  private torches: { pos: THREE.Vector3; sprite: THREE.Sprite; phase: number }[] = [];
  private torchLights: THREE.PointLight[] = [];
  private lantern: THREE.PointLight;
  private chests: Chest[] = [];
  private spikes: Spike[] = [];
  private darts: Dart[] = [];
  private gate: { bars: THREE.Group; collider: RAPIER.Collider | null; t: number; opening: boolean } | null = null;
  private portal: THREE.Group | null = null;
  slimes: Slime[] = [];
  armours: LivingArmour[] = [];
  private boss: OrcWarlord | null = null;
  /** resolves when async content (the boss model) has loaded */
  ready: Promise<void> = Promise.resolve();
  private time = 0;
  private m = matCache ??= buildMats();

  constructor(
    readonly seed: number,
    readonly floor: 1 | 2,
    private scene: THREE.Scene,
    private fx: FX,
    private progress: DungeonProgress,
    private hooks: DungeonHooks,
  ) {
    this.layout = generateFloor(seed, floor);
    this.grid = new Grid(this.layout.w, this.layout.h, this.layout.hWall, this.layout.vWall);
    scene.add(this.group);
    this.buildShell();
    this.buildTorches();
    this.buildDoors();
    this.buildChests();
    this.buildTraps();
    this.spawnEnemies();
    if (floor === 2) this.buildStatue();
    // Light pool: a lantern on the player plus the three nearest torches.
    this.lantern = new THREE.PointLight(0xfff0c8, 5.2, 13, 1.5);
    this.group.add(this.lantern);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffcf9a, 0, 15, 1.55);
      this.group.add(l);
      this.torchLights.push(l);
    }
  }

  // ---- coordinates -----------------------------------------------------------
  cellCenter(i: number, j: number, y = 0) {
    const L = this.layout;
    return new THREE.Vector3(DUNGEON_ORIGIN.x + (i + 0.5) * CELL - (L.w * CELL) / 2, DUNGEON_ORIGIN.y + y, DUNGEON_ORIGIN.z + (j + 0.5) * CELL - (L.h * CELL) / 2);
  }
  cellAt(p: THREE.Vector3): Cell {
    const L = this.layout;
    return [Math.floor((p.x - DUNGEON_ORIGIN.x + (L.w * CELL) / 2) / CELL), Math.floor((p.z - DUNGEON_ORIGIN.z + (L.h * CELL) / 2) / CELL)];
  }
  /** Ground height inside this floor (null outside it). */
  groundAt = (x: number, z: number): number | null => {
    const L = this.layout;
    const hx = (L.w * CELL) / 2 + 6, hz = (L.h * CELL) / 2 + 6;
    if (Math.abs(x - DUNGEON_ORIGIN.x) > hx || Math.abs(z - DUNGEON_ORIGIN.z) > hz) return null;
    return DUNGEON_ORIGIN.y;
  };
  get spawnPoint() {
    const [i, j] = this.layout.entrance;
    return this.cellCenter(i, j).add(new THREE.Vector3(0, 0, 0.6));
  }
  /** Yaw that faces out of the entrance cell into the open passage. */
  get entranceYaw() {
    const [i, j] = this.layout.entrance;
    const d = (['n', 'e', 'w', 's'] as Dir[]).find((dd) => !this.grid.wall(i, j, dd)) ?? 'n';
    const [dx, dz] = DV[d];
    return Math.atan2(dx, dz);
  }
  /** Position at the top of this floor's stairs down (where you arrive when climbing back up). */
  get stairsPoint() {
    const [i, j] = this.layout.exit;
    return this.cellCenter(i, j).add(new THREE.Vector3(0, 0, 3));
  }

  private box(pos: THREE.Vector3, half: THREE.Vector3, rot?: THREE.Quaternion) {
    const c = physics.addBox(pos, half, rot);
    this.colliders.push(c);
    return c;
  }

  // ---- shell: floor tiles, walls, pillars, ceiling ------------------------------
  private buildShell() {
    const L = this.layout, g = this.grid, m = this.m;
    const stairCell = this.floor === 1 ? L.exit : null;
    // Floor tiles (skip the stairwell).
    const tiles: THREE.Matrix4[] = [];
    for (let j = 0; j < L.h; j++) for (let i = 0; i < L.w; i++) {
      if (stairCell && i === stairCell[0] && j === stairCell[1]) continue;
      const c = this.cellCenter(i, j);
      tiles.push(new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(c));
    }
    const floorMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CELL, CELL), m.floor, tiles.length);
    tiles.forEach((t, k) => floorMesh.setMatrixAt(k, t));
    floorMesh.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L.w * CELL + 8, L.h * CELL + 8), m.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.copy(DUNGEON_ORIGIN).setY(DUNGEON_ORIGIN.y + WALL_H);
    for (const t of [(m.ceil as THREE.MeshStandardMaterial).map!]) t.repeat.set(L.w, L.h);
    this.group.add(floorMesh, ceil);
    // Floor collision: one slab minus the stairwell (as strips around it).
    const half = new THREE.Vector3((L.w * CELL) / 2 + 4, 0.5, (L.h * CELL) / 2 + 4);
    if (!stairCell) this.box(DUNGEON_ORIGIN.clone().setY(-0.5), half);
    else {
      const sc = this.cellCenter(stairCell[0], stairCell[1]);
      const minX = DUNGEON_ORIGIN.x - half.x, maxX = DUNGEON_ORIGIN.x + half.x, minZ = DUNGEON_ORIGIN.z - half.z, maxZ = DUNGEON_ORIGIN.z + half.z;
      const hx = CELL / 2, hz = CELL / 2;
      const strip = (x0: number, x1: number, z0: number, z1: number) => {
        if (x1 - x0 > 0.01 && z1 - z0 > 0.01) this.box(new THREE.Vector3((x0 + x1) / 2, -0.5, (z0 + z1) / 2), new THREE.Vector3((x1 - x0) / 2, 0.5, (z1 - z0) / 2));
      };
      strip(minX, maxX, minZ, sc.z - hz);
      strip(minX, maxX, sc.z + hz, maxZ);
      strip(minX, sc.x - hx, sc.z - hz, sc.z + hz);
      strip(sc.x + hx, maxX, sc.z - hz, sc.z + hz);
      this.buildStairs(sc);
    }

    // Walls: horizontal (north edges) and vertical (west edges).
    const wallMats: THREE.Matrix4[] = [];
    const q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    const addWall = (x: number, z: number, vertical: boolean) => {
      wallMats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, DUNGEON_ORIGIN.y + WALL_H / 2, z), vertical ? q90 : new THREE.Quaternion(), one));
    };
    const x0 = DUNGEON_ORIGIN.x - (L.w * CELL) / 2, z0 = DUNGEON_ORIGIN.z - (L.h * CELL) / 2;
    for (let j = 0; j <= L.h; j++) for (let i = 0; i < L.w; i++) if (L.hWall[j * L.w + i]) addWall(x0 + (i + 0.5) * CELL, z0 + j * CELL, false);
    for (let j = 0; j < L.h; j++) for (let i = 0; i <= L.w; i++) if (L.vWall[j * (L.w + 1) + i]) addWall(x0 + i * CELL, z0 + (j + 0.5) * CELL, true);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL + WALL_T * 0.2, WALL_H, WALL_T), m.wall, wallMats.length);
    wallMats.forEach((t, k) => walls.setMatrixAt(k, t));
    walls.castShadow = walls.receiveShadow = true;
    this.group.add(walls);
    // Wall collision: merge runs of consecutive wall edges into long boxes.
    for (let j = 0; j <= L.h; j++) {
      let run = -1;
      for (let i = 0; i <= L.w; i++) {
        const on = i < L.w && L.hWall[j * L.w + i] === 1;
        if (on && run < 0) run = i;
        if (!on && run >= 0) {
          const len = (i - run) * CELL;
          this.box(new THREE.Vector3(x0 + run * CELL + len / 2, DUNGEON_ORIGIN.y + WALL_H / 2, z0 + j * CELL), new THREE.Vector3(len / 2 + WALL_T / 2, WALL_H / 2, WALL_T / 2));
          run = -1;
        }
      }
    }
    for (let i = 0; i <= L.w; i++) {
      let run = -1;
      for (let j = 0; j <= L.h; j++) {
        const on = j < L.h && L.vWall[j * (L.w + 1) + i] === 1;
        if (on && run < 0) run = j;
        if (!on && run >= 0) {
          const len = (j - run) * CELL;
          this.box(new THREE.Vector3(x0 + i * CELL, DUNGEON_ORIGIN.y + WALL_H / 2, z0 + run * CELL + len / 2), new THREE.Vector3(WALL_T / 2, WALL_H / 2, len / 2 + WALL_T / 2));
          run = -1;
        }
      }
    }
    // Pillars wherever walls meet or end.
    const pil: THREE.Matrix4[] = [];
    for (let j = 0; j <= L.h; j++) for (let i = 0; i <= L.w; i++) {
      const n = (j > 0 && L.vWall[(j - 1) * (L.w + 1) + i]) ? 1 : 0;
      const s = (j < L.h && L.vWall[j * (L.w + 1) + i]) ? 1 : 0;
      const w = (i > 0 && L.hWall[j * L.w + i - 1]) ? 1 : 0;
      const e = (i < L.w && L.hWall[j * L.w + i]) ? 1 : 0;
      const k = n + s + e + w;
      const straight = k === 2 && ((n && s) || (e && w));
      if (k === 0 || straight) continue;
      pil.push(new THREE.Matrix4().setPosition(x0 + i * CELL, DUNGEON_ORIGIN.y + WALL_H / 2, z0 + j * CELL));
    }
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, WALL_H, 1.15), m.pillar, pil.length);
    pil.forEach((t, k) => pillars.setMatrixAt(k, t));
    pillars.castShadow = true;
    this.group.add(pillars);
    void g;
  }

  private buildStairs(c: THREE.Vector3) {
    // Steps descending northward into the dark.
    const steps = 7, rise = 0.32, run = CELL / steps;
    for (let k = 0; k < steps; k++) {
      const y = -rise * (k + 1);
      const s = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.2, rise, run), this.m.pillar);
      s.position.set(c.x, DUNGEON_ORIGIN.y + y + rise / 2, c.z + CELL / 2 - run * (k + 0.5));
      s.receiveShadow = true;
      this.group.add(s);
      this.box(s.position.clone(), new THREE.Vector3((CELL - 0.2) / 2, rise / 2, run / 2));
    }
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), this.m.dark);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(c.x, DUNGEON_ORIGIN.y - rise * steps - 0.05, c.z);
    this.group.add(pit);
    // Stop the player walking off the bottom.
    this.box(new THREE.Vector3(c.x, DUNGEON_ORIGIN.y - 1, c.z - CELL / 2 - 0.2), new THREE.Vector3(CELL / 2, 3, 0.3));
    this.interactables.push({
      pos: c.clone().add(new THREE.Vector3(0, -1, 0)),
      radius: 2.6,
      label: () => 'Descend to the lower crypt',
      enabled: () => true,
      action: () => this.hooks.descend(),
    });
  }

  // ---- torches ------------------------------------------------------------------
  private buildTorches() {
    for (const t of this.layout.torches) {
      const [i, j] = t.cell;
      if (!this.grid.wall(i, j, t.dir)) continue;
      const [dx, dz] = DV[t.dir];
      const c = this.cellCenter(i, j);
      const p = c.clone().add(new THREE.Vector3(dx * (CELL / 2 - WALL_T / 2 - 0.12), 2.35, dz * (CELL / 2 - WALL_T / 2 - 0.12)));
      const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.55, 6), this.m.iron);
      bracket.position.copy(p).add(new THREE.Vector3(0, -0.2, 0));
      bracket.rotation.set(dz * 0.5, 0, -dx * 0.5);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.12, 8, 1, true), this.m.iron);
      cup.position.copy(p);
      const sprite = new THREE.Sprite(this.m.flame);
      sprite.scale.set(0.45, 0.7, 1);
      sprite.position.copy(p).add(new THREE.Vector3(0, 0.25, 0));
      this.group.add(bracket, cup, sprite);
      this.torches.push({ pos: sprite.position.clone(), sprite, phase: Math.random() * 10 });
    }
  }

  // ---- doors: exit, gate, portal -----------------------------------------------------
  private buildDoors() {
    const L = this.layout;
    // The way out: a bright archway in the entrance cell's south wall.
    const e = this.cellCenter(L.entrance[0], L.entrance[1]);
    const arch = new THREE.Group();
    const light = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), new THREE.MeshBasicMaterial({ color: this.floor === 1 ? new THREE.Color(1.25, 1.2, 1.05) : new THREE.Color(0.5, 0.45, 0.35) }));
    light.position.set(0, 1.6, -WALL_T / 2 - 0.02);
    light.rotation.y = Math.PI;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 1.0), this.m.pillar);
      post.position.set(sx * 1.45, 1.8, -0.4);
      arch.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.0), this.m.pillar);
    lintel.position.set(0, 3.5, -0.4);
    arch.add(light, lintel);
    arch.position.set(e.x, DUNGEON_ORIGIN.y, e.z + CELL / 2);
    this.group.add(arch);
    this.interactables.push({
      pos: e.clone().add(new THREE.Vector3(0, 0, CELL / 2 - 0.8)),
      radius: 2.2,
      label: () => (this.floor === 1 ? 'Leave the crypt' : 'Climb the stairs up'),
      enabled: () => true,
      action: () => (this.floor === 1 ? this.hooks.leave() : this.hooks.ascend()),
    });

    // Locked gate (portcullis).
    if (L.gate) {
      const [gi, gj] = L.gate.cell;
      const [dx, dz] = DV[L.gate.dir];
      const c = this.cellCenter(gi, gj).add(new THREE.Vector3(dx * CELL / 2, 0, dz * CELL / 2));
      const bars = new THREE.Group();
      const across = dx !== 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      for (let k = -4; k <= 4; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, WALL_H - 0.2, 6), this.m.iron);
        b.position.copy(across).multiplyScalar(k * 0.44).setY(WALL_H / 2 - 0.1);
        bars.add(b);
      }
      for (const y of [0.9, 2.3, 3.6]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(across.x ? CELL : 0.08, 0.1, across.z ? CELL : 0.08), this.m.iron);
        r.position.y = y;
        bars.add(r);
      }
      bars.position.copy(c).setY(DUNGEON_ORIGIN.y);
      this.group.add(bars);
      const open = this.progress.gateOpen;
      const collider = open ? null : this.box(c.clone().setY(DUNGEON_ORIGIN.y + WALL_H / 2), across.x ? new THREE.Vector3(CELL / 2, WALL_H / 2, 0.25) : new THREE.Vector3(0.25, WALL_H / 2, CELL / 2));
      if (open) bars.position.y += WALL_H - 0.4;
      this.gate = { bars, collider, t: open ? 1 : 0, opening: false };
      this.interactables.push({
        pos: c,
        radius: 2.4,
        label: () => (this.hooks.hasItem('cryptKey') ? 'Unlock the gate' : 'Locked gate (needs a key)'),
        enabled: () => !this.progress.gateOpen,
        action: () => {
          if (!this.hooks.hasItem('cryptKey')) return this.hooks.toast('The gate is locked. Somewhere in these halls is a key.');
          this.progress.gateOpen = true;
          this.gate!.opening = true;
          if (this.gate!.collider) {
            physics.world.removeCollider(this.gate!.collider, false);
            this.colliders = this.colliders.filter((x) => x !== this.gate!.collider);
            this.gate!.collider = null;
          }
          this.hooks.toast('The portcullis grinds upward.');
          this.hooks.save();
        },
      });
    }
  }

  private buildPortal() {
    const c = this.cellCenter(this.layout.exit[0], this.layout.exit[1]);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 2.6, 3.4) }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.9, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    g.add(ring, disc);
    g.position.copy(c).setY(DUNGEON_ORIGIN.y + 1.5);
    this.group.add(g);
    this.portal = g;
    this.interactables.push({
      pos: c,
      radius: 2.4,
      label: () => 'Step through the portal (return to the surface)',
      enabled: () => true,
      action: () => this.hooks.leave(),
    });
  }

  // ---- chests ----------------------------------------------------------------------
  private buildChests() {
    for (const ch of this.layout.chests) {
      const key = `${this.floor}:${ch.cell}`;
      const [i, j] = ch.cell;
      // Push the chest against the closed wall opposite the opening.
      const openDir = (['n', 's', 'e', 'w'] as Dir[]).find((d) => !this.grid.wall(i, j, d)) ?? 's';
      const [ox, oz] = DV[openDir];
      const c = this.cellCenter(i, j).add(new THREE.Vector3(-ox * 0.9, 0, -oz * 0.9));
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), this.m.wood);
      base.position.y = 0.28;
      const lid = new THREE.Group();
      lid.position.set(0, 0.55, -0.35);
      const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI), this.m.wood);
      lidMesh.rotation.z = Math.PI / 2;
      lidMesh.position.z = 0.35;
      lid.add(lidMesh);
      for (const x of [-0.42, 0, 0.42]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.57, 0.72), this.m.iron);
        band.position.set(x, 0.28, 0);
        g.add(band);
      }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.05), mats().brass);
      lock.position.set(0, 0.5, 0.37);
      g.add(base, lid, lock);
      g.traverse((o) => (o.castShadow = true));
      g.position.copy(c);
      g.rotation.y = Math.atan2(ox, oz);
      this.group.add(g);
      this.box(c.clone().setY(0.4), new THREE.Vector3(0.55, 0.4, 0.55));
      const opened = this.progress.chests.includes(key);
      if (opened) lid.rotation.x = -1.9;
      const chest: Chest = { key, cell: ch.cell, lid, open: opened, t: opened ? 1 : 0, loot: ch.loot, pos: c };
      this.chests.push(chest);
      this.interactables.push({
        pos: c,
        radius: 1.9,
        label: () => 'Open chest',
        enabled: () => !chest.open,
        action: () => this.openChest(chest),
      });
    }
  }

  private openChest(ch: Chest) {
    ch.open = true;
    this.progress.chests.push(ch.key);
    const at = ch.pos.clone().setY(0.9);
    this.fx.add.spawn({ pos: at, spread: 2, count: 30, life: [0.4, 0.9], size: [0.08, 0.01], color: 0xfff0b0, color2: 0xffb030, upBias: 1.4, drag: 2 });
    if (ch.loot === 'gold') {
      this.hooks.giveGold(at, 40 + Math.floor(Math.random() * 60));
      this.hooks.toast('The chest is full of old coins.');
    } else {
      const name = this.hooks.giveItem(ch.loot);
      this.hooks.giveGold(at, 10 + Math.floor(Math.random() * 20));
      this.hooks.toast(`Found: ${name}`);
    }
    this.hooks.save();
  }

  // ---- traps ---------------------------------------------------------------------------
  private buildTraps() {
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.55 });
    const spikeGeo = new THREE.ConeGeometry(0.07, 0.8, 6);
    for (const cell of this.layout.spikes) {
      const c = this.cellCenter(cell[0], cell[1]);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 3.2), plateMat.clone());
      plate.position.copy(c).setY(0.03);
      const spikes = new THREE.Group();
      for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
        const s = new THREE.Mesh(spikeGeo, this.m.iron);
        s.position.set(-1.28 + a * 0.64, 0.4, -1.28 + b * 0.64);
        spikes.add(s);
      }
      spikes.position.copy(c).setY(-0.85);
      this.group.add(plate, spikes);
      this.spikes.push({ cell, spikes, t: 0, hit: false, armed: false, plate });
    }
    for (const d of this.layout.darts) {
      const plate = this.cellCenter(d.plate[0], d.plate[1]);
      const from = this.cellCenter(d.from[0], d.from[1]);
      const dir = from.clone().sub(plate).normalize();
      const slotPos = from.clone().addScaledVector(dir, CELL / 2 - WALL_T / 2 - 0.02).setY(1.2);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.08), this.m.dark);
      slot.position.copy(slotPos);
      slot.lookAt(plate.clone().setY(1.2));
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 1.2), plateMat);
      p.position.copy(plate).setY(0.025);
      this.group.add(slot, p);
      this.darts.push({ plate: d.plate, from: slotPos, to: plate.clone().setY(1.2), t: 9, mesh: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), hit: false });
    }
  }

  /** A carved statue of two orcs at blows, in a corner of Grukk's hall. */
  private buildStatue() {
    const room = this.layout.rooms[0];
    if (!room) return;
    const c = this.cellCenter(room.x, room.y).add(new THREE.Vector3(-0.3, 0, -0.3));
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.4), this.m.pillar);
    plinth.position.copy(c).setY(0.3);
    plinth.castShadow = plinth.receiveShadow = true;
    this.group.add(plinth);
    this.box(plinth.position.clone().setY(1.2), new THREE.Vector3(1.2, 1.2, 1.2));
    new GLTFLoader().loadAsync('/assets/npc/urukStatue.glb').then((g) => {
      if (this.disposed) return;
      const statue = g.scene;
      statue.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(statue);
      const k = 2.3 / (box.max.y - box.min.y);
      statue.scale.setScalar(k);
      statue.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(statue);
      const ctr = b2.getCenter(new THREE.Vector3());
      statue.position.set(c.x - ctr.x, 0.6 - b2.min.y, c.z - ctr.z);
      // Carved from the same stone as the crypt.
      statue.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = this.m.pillar;
        m.castShadow = m.receiveShadow = true;
      });
      this.group.add(statue);
    });
  }

  // ---- enemies --------------------------------------------------------------------------
  private spawnEnemies() {
    for (const s of this.layout.spawns) {
      const c = this.cellCenter(s.cell[0], s.cell[1], 0.3);
      c.x += (Math.random() - 0.5) * 1.2;
      c.z += (Math.random() - 0.5) * 1.2;
      if (s.kind === 'armour') this.armours.push(new LivingArmour(c.setY(0), this.scene, this.fx));
      else if (s.kind === 'orc') {
        if (this.progress.bossDead) {
          this.buildPortal();
          continue;
        }
        // Stands at the far end of his hall, facing the way you'll come in.
        const at = this.cellCenter(s.cell[0], s.cell[1]);
        const toEntrance = this.spawnPoint.sub(at);
        this.ready = OrcWarlord.create(at, Math.atan2(toEntrance.x, toEntrance.z), this.scene, this.fx).then((o) => {
          if (this.disposed) return o.dispose();
          o.onDeath = (dead) => {
            this.progress.bossDead = true;
            this.hooks.giveGold(dead.center, 300);
            const a = this.hooks.giveItem('warlordTusk');
            const b = this.hooks.giveItem('orcOdachi');
            this.hooks.toast(`Grukk falls. Found: ${a} and ${b}`);
            setTimeout(() => this.hooks.bossBar(null), 2500);
            this.buildPortal();
            this.hooks.save();
          };
          this.boss = o;
        });
      } else this.slimes.push(new Slime(s.kind as SlimeKind, c, this.scene, this.fx));
    }
  }

  // ---- per frame --------------------------------------------------------------------------
  update(dt: number, player: Player) {
    this.time += dt;
    const pp = player.pos;
    // Enemies.
    for (const s of this.slimes) s.update(dt, player, this.slimes);
    for (const a of this.armours) a.update(dt, player);
    for (const s of this.slimes.filter((s) => s.dead)) s.dispose();
    this.slimes = this.slimes.filter((s) => !s.dead);
    for (const a of this.armours.filter((a) => a.dead)) a.dispose();
    this.armours = this.armours.filter((a) => !a.dead);
    // Boss: fights once woken; the bar shows while he's awake.
    if (this.boss) {
      this.boss.update(dt, player);
      if (this.boss.alive && this.boss.awake) this.hooks.bossBar(this.boss, this.boss.name);
      if (this.boss.dead) {
        this.boss.dispose();
        this.boss = null;
      }
    }

    // Lights: lantern on the player, flicker on the nearest torches.
    this.lantern.position.set(pp.x, pp.y + 2.1, pp.z);
    const near = this.torches.map((t) => [t.pos.distanceToSquared(pp), t] as const).sort((a, b) => a[0] - b[0]);
    this.torchLights.forEach((l, k) => {
      const t = near[k]?.[1];
      if (!t) return (l.intensity = 0);
      l.position.copy(t.pos).add(new THREE.Vector3(0, 0.2, 0));
      l.intensity = 11 * (0.85 + Math.sin(this.time * 11 + t.phase) * 0.08 + Math.sin(this.time * 23 + t.phase * 2) * 0.07);
    });
    for (const t of this.torches) {
      const f = 1 + Math.sin(this.time * 13 + t.phase) * 0.12;
      t.sprite.scale.set(0.45 * f, 0.72 / f, 1);
      if (t.pos.distanceToSquared(pp) < 200 && Math.random() < dt * 6) {
        this.fx.add.spawn({ pos: t.pos, vel: new THREE.Vector3(0, 1.1, 0), spread: 0.2, count: 1, life: [0.4, 0.8], size: [0.04, 0.01], color: 0xffc070, color2: 0xff3000 });
      }
    }
    // Dust motes drifting in the lantern light.
    if (Math.random() < dt * 5) this.fx.alpha.spawn({ pos: pp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 1 + Math.random() * 2, (Math.random() - 0.5) * 8)), spread: 0.05, count: 1, life: [2.5, 4], size: [0.03, 0.03], color: 0xd8c8a8, alpha: 0.5, drag: 0.5 });

    // Chest lids.
    for (const c of this.chests) if (c.open && c.t < 1) {
      c.t = Math.min(1, c.t + dt * 2.2);
      c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.t, 3));
    }
    // Gate.
    if (this.gate?.opening && this.gate.t < 1) {
      this.gate.t = Math.min(1, this.gate.t + dt * 0.45);
      this.gate.bars.position.y = DUNGEON_ORIGIN.y + (WALL_H - 0.4) * this.gate.t;
      if (Math.random() < dt * 8) this.fx.dust(this.gate.bars.position.clone().setY(0.2), 0.5);
    }
    // Portal spin.
    if (this.portal) {
      this.portal.rotation.y += dt * 0.6;
      if (Math.random() < dt * 20) this.fx.add.spawn({ pos: this.portal.position, spread: 1.2, count: 1, life: [0.6, 1.1], size: [0.08, 0.01], color: 0xbfe8ff, color2: 0x3a7cff, drag: 2 });
    }

    // Traps.
    const [pi, pj] = this.cellAt(pp);
    for (const s of this.spikes) {
      const on = pi === s.cell[0] && pj === s.cell[1] && player.grounded;
      if (on && !s.armed && s.t <= 0) {
        s.armed = true;
        s.t = 0;
        s.hit = false;
        (s.plate.material as THREE.MeshStandardMaterial).emissive.setRGB(0.4, 0.1, 0.02);
      }
      if (s.armed) {
        s.t += dt;
        // 0.35s warning click, spikes up for 0.8s, then retract.
        const up = s.t > 0.35 && s.t < 1.15;
        s.spikes.position.y = up ? Math.min(0, s.spikes.position.y + dt * 14) : Math.max(-0.85, s.spikes.position.y - dt * 3);
        if (up && on && !s.hit && s.spikes.position.y > -0.3) {
          s.hit = true;
          player.receiveAttack({ damage: 24, from: player.pos.clone().add(new THREE.Vector3(0, 0, 0.01)), parryable: false, poise: 45 });
          this.fx.sparks(pp.clone().setY(0.4));
        }
        if (s.t > 2.2) {
          s.armed = false;
          s.t = 0.4; // short reset delay (stored as a countdown below)
          (s.plate.material as THREE.MeshStandardMaterial).emissive.setRGB(0, 0, 0);
        }
      } else if (s.t > 0) s.t -= dt;
    }
    for (const d of this.darts) {
      d.t += dt;
      const on = pi === d.plate[0] && pj === d.plate[1];
      if (on && d.t > 1.6 && !d.mesh) {
        d.t = 0;
        d.hit = false;
        d.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5).rotateX(Math.PI / 2), this.m.iron);
        d.pos.copy(d.from);
        d.vel.copy(d.to).sub(d.from).normalize().multiplyScalar(24);
        d.mesh.position.copy(d.pos);
        d.mesh.lookAt(d.to);
        this.group.add(d.mesh);
      }
      if (d.mesh) {
        const prev = d.pos.clone();
        d.pos.addScaledVector(d.vel, dt);
        d.mesh.position.copy(d.pos);
        const a = player.pos.clone().setY(player.pos.y + 0.4), b = player.pos.clone().setY(player.pos.y + 1.6);
        const close = Math.min(segmentPointDistance(a, b, d.pos), segmentPointDistance(a, b, prev.lerp(d.pos, 0.5)));
        if (!d.hit && player.combat.canIntercept(d.pos.x, d.pos.z, player.pos.x, player.pos.z, true)) {
          const res = player.receiveAttack({ damage: 16, from: d.pos.clone(), parryable: true, poise: 20 });
          if (res === 'parried') { d.hit = true; this.fx.sparks(d.pos.clone()); this.group.remove(d.mesh!); d.mesh = null; continue; }
        }
        if (!d.hit && close < 0.38) {
          d.hit = true;
          player.receiveAttack({ damage: 16, from: d.pos.clone(), parryable: true, poise: 20 });
          this.group.remove(d.mesh);
          d.mesh = null;
        } else if (d.t > 1.4) {
          this.group.remove(d.mesh);
          d.mesh = null;
        }
      }
    }
  }

  /** Per rendered frame: pose the boss (a full animated character). */
  present(alpha: number, dt: number, player: Player) {
    this.boss?.present(alpha, dt, player);
  }

  get bossTarget() {
    return this.boss;
  }

  /** Current cell (for the map) and whether a point is inside this floor. */
  playerCell(p: THREE.Vector3) {
    return this.cellAt(p);
  }

  private disposed = false;
  dispose() {
    this.disposed = true;
    this.boss?.dispose();
    this.boss = null;
    for (const c of this.colliders) physics.world.removeCollider(c, false);
    this.colliders = [];
    for (const s of this.slimes) s.dispose();
    for (const a of this.armours) a.dispose();
    this.slimes = [];
    this.armours = [];
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m as unknown as THREE.Sprite).isSprite) m.geometry.dispose();
    });
    this.hooks.bossBar(null);
  }
}
