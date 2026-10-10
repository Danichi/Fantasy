import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { StaticBatch } from '../../world/cityKit';
import { Grid } from '../generator';
import { OrcMob } from '../../enemies/orcMob';
import { Slime } from '../../enemies/slime';
import { LivingArmour } from '../../enemies/livingArmour';
import { Undead } from '../../enemies/undead';
import { Rat } from '../../enemies/vermin';
import { Bandit, Bolts } from '../../enemies/bandit';
import { ITEMS } from '../../items/itemDefs';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import { buildFloor, layoutOf } from './grammar';
import { theme as themeOf, type Theme, type ThemeId } from './theme';
import { CELL, DRESS, WALL_T, type DressCtx, type FlameKind, type MobKind, type WallFace } from './rooms';
import { DV, OPP, type Cell, type Dir, type FloorGraph, type FloorPlan, type Interactable, type KDoor, type KitProgress, type KRoom, type TrapKind } from './types';
import type { DelverPerks } from './delving';
import { rollChest, type LootTable } from './loot';
import { TrapSet } from './traps';
import { SecretSet } from './secrets';
import { PuzzleSet } from './puzzles';
import { BossFight, type BossDef } from './boss';
import type { AutoLayer } from '../../ui/dungeonMap';

// ---------------------------------------------------------------------------
// The kit's builder and runtime (docs/design/dungeons.md §3, §7): turns a
// generated floor into walls, floors, doors, props, lights, enemies, traps,
// secrets, puzzles and a boss, far out past the edge of the world (each
// dungeon has its own origin), and runs it while you're inside. Rooms are
// merged per room and stream in and out with distance; lights are a lantern
// on you plus a few pooled point lights handed to the nearest flames.
//
// Everything a floor creates is removed again by dispose().
// ---------------------------------------------------------------------------

/** A dungeon built with the kit (see dungeons/*.ts). */
export interface KitDungeonDef {
  id: string;
  name: string;
  theme: ThemeId;
  /** where in the void its floors are built (each dungeon its own) */
  origin: THREE.Vector3;
  plans: FloorPlan[];
  traps: TrapKind[];
  /** a fixed layout seed (the crypt keeps one so old maps and tests line up) */
  seed?: number;
  /** wandering enemies per floor */
  mobs: (floor: number) => MobKind[];
  loot: LootTable;
  boss?: { floor: number; def: BossDef };
  /** the named gear waiting in the boss's reward room (once) */
  reward?: string;
  /** what the way out says on each floor */
  exitLabel: (floor: number) => string;
  arrive: (floor: number) => string;
}

export interface KitHooks {
  toast: (msg: string) => void;
  giveItem: (id: string) => string;
  giveGold: (at: THREE.Vector3, amount: number) => void;
  hasItem: (id: string) => boolean;
  descend: () => void;
  ascend: () => void;
  leave: () => void;
  bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => void;
  card: (name: string, sub: string) => void;
  banner: (text: string) => void;
  save: () => void;
  rest: () => void;
  mastery: (n: number) => void;
  deed: (id: string, renown: number, label: string) => void;
  /** a stateful door opened (the crypt mirrors its portcullis into the old progress) */
  onDoor?: (id: string) => void;
  onBoss?: (first: boolean) => void;
  perks: () => DelverPerks;
}

/** One enemy of any kind, behind one face. */
export interface Mob {
  kind: MobKind;
  obj: { alive: boolean; position: THREE.Vector3; dispose(): void; hp: number };
  room: number;
  update: (dt: number, player: Player) => void;
  dead: () => boolean;
}

interface Flame { pos: THREE.Vector3; sprite: THREE.Sprite; room: number; power: number; kind: FlameKind; phase: number; color: THREE.Color; base: THREE.Vector2 }

interface DoorRt {
  d: KDoor;
  /** the door's leaf (bars, slab, planks), and the collider it holds */
  leaf: THREE.Object3D | null;
  col: RAPIER.Collider | null;
  open: boolean;
  t: number;
  /** what opening does to the leaf: rise (portcullis), sink (slab), swing (planks) */
  style: 'rise' | 'sink' | 'swing' | 'none';
  /** the door's middle, at floor level */
  pos: THREE.Vector3;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DOOR_W = 2.2;

/** Everything traps, secrets, puzzles and the boss need from the floor they're on. */
export type KitCtx = DressCtx & {
  inst: KitInstance;
  scene: THREE.Scene;
  fx: FX;
  floor: number;
  progress: KitProgress;
  hooks: KitHooks;
  /** a removable collider */
  solidRef(pos: THREE.Vector3, half: THREE.Vector3, rot?: number | THREE.Quaternion): RAPIER.Collider;
  removeSolid(c: RAPIER.Collider): void;
  door(id: string): DoorRt | undefined;
  openDoor(id: string, quiet?: boolean): void;
  solve(mech: string): void;
  spawnNow(kind: MobKind, at: THREE.Vector3, room?: number): Mob;
  edgePos(cell: Cell, dir: Dir): THREE.Vector3;
};

export class KitInstance {
  readonly fg: FloorGraph;
  readonly grid: Grid;
  readonly layout: ReturnType<typeof layoutOf>;
  readonly theme: Theme;
  readonly interactables: Interactable[] = [];
  readonly group = new THREE.Group();
  readonly origin: THREE.Vector3;
  mobs: Mob[] = [];
  /** resolves when async content (the boss's model) has loaded */
  ready: Promise<void> = Promise.resolve();
  readonly traps: TrapSet;
  readonly secrets: SecretSet;
  readonly puzzles: PuzzleSet;
  boss: BossFight | null = null;
  doors: DoorRt[] = [];
  private colliders: RAPIER.Collider[] = [];
  private flames: Flame[] = [];
  private pool: THREE.PointLight[] = [];
  private lantern: THREE.PointLight;
  private batches = new Map<number, StaticBatch>();
  private roomGroups = new Map<number, THREE.Group>();
  private wet = new Set<number>();
  private pits = new Set<number>();
  readonly bolts: Bolts;
  private dormant: { room: number; kind: MobKind; at: THREE.Vector3 }[] = [];
  private chests: { id: string; lid: THREE.Group; root: THREE.Group; open: boolean; t: number; pos: THREE.Vector3; tier: number; item?: string; hidden: boolean; glint: THREE.Sprite }[] = [];
  private keyObj: { mesh: THREE.Object3D; taken: boolean; pos: THREE.Vector3 } | null = null;
  private shafts: THREE.Mesh[] = [];
  private portal: THREE.Group | null = null;
  private time = 0;
  private flare = 0;
  private playerWasDead = false;
  private disposed = false;
  /** the room the player is in (-1 outside) */
  room = -1;
  readonly ctx: KitCtx;
  private x0: number;
  private z0: number;

  constructor(
    readonly def: KitDungeonDef,
    readonly floor: number,
    readonly seed: number,
    readonly scene: THREE.Scene,
    readonly fx: FX,
    readonly progress: KitProgress,
    readonly hooks: KitHooks,
  ) {
    const plan = def.plans[floor - 1];
    this.fg = buildFloor(plan, seed, { theme: def.theme, traps: def.traps });
    this.grid = new Grid(this.fg.w, this.fg.h, this.fg.hWall, this.fg.vWall);
    this.layout = layoutOf(this.fg);
    this.theme = themeOf(def.theme);
    this.origin = def.origin.clone();
    this.x0 = this.origin.x - (this.fg.w * CELL) / 2;
    this.z0 = this.origin.z - (this.fg.h * CELL) / 2;
    this.bolts = new Bolts(scene);
    scene.add(this.group);
    for (const t of this.fg.traps) if (t.kind === 'collapse') this.pits.add(t.cell[1] * this.fg.w + t.cell[0]);
    const rewardRoom = this.fg.rooms.find((r) => r.role === 'reward');
    if (def.reward && rewardRoom) {
      const r = rewardRoom.rect;
      this.fg.chests.push({ id: `reward-${floor}`, room: rewardRoom.id, cell: [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)], tier: 3, item: def.reward });
    }
    this.ctx = this.makeCtx();

    this.buildShell();
    this.buildDoors();
    this.buildExit();
    const rnd = mulberry32(seed * 31 + floor * 977);
    // Dress every room by its template.
    for (const r of this.fg.rooms) (DRESS[r.template] ?? DRESS.hall)({ ...this.ctx, rnd }, r);
    this.buildStairs();
    this.buildChests();
    this.buildKey();
    this.traps = new TrapSet(this.ctx);
    this.secrets = new SecretSet(this.ctx);
    this.puzzles = new PuzzleSet(this.ctx);
    this.buildBreadcrumbs();
    this.buildShrines();
    this.spawnWanderers(rnd);
    if (def.boss && def.boss.floor === floor) {
      const arena = this.fg.rooms.find((r) => r.role === 'boss')!;
      this.boss = new BossFight(this.ctx, def.boss.def, arena);
      this.ready = this.boss.ready;
      if (progress.boss) this.buildPortal();
    }
    // Merge every room's props.
    for (const [id, b] of this.batches) {
      const g = this.roomGroup(id);
      b.build(g, 1e6);
    }
    // Lights: a lantern on you, and four that go to the nearest flames.
    const L = this.theme.lantern;
    this.lantern = new THREE.PointLight(L.color, L.intensity, L.distance, 1.5);
    this.group.add(this.lantern);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(this.theme.warm, 0, 15, 1.55);
      this.group.add(l);
      this.pool.push(l);
    }
  }

  // ---- coordinates ------------------------------------------------------------------------
  cellCenter(i: number, j: number, y = 0) {
    return V(this.x0 + (i + 0.5) * CELL, this.origin.y + y, this.z0 + (j + 0.5) * CELL);
  }
  /** Fractional cell coordinates (the map's frame). */
  cellAtF(p: THREE.Vector3): [number, number] {
    return [(p.x - this.x0) / CELL, (p.z - this.z0) / CELL];
  }
  cellAt(p: THREE.Vector3): Cell {
    const [x, y] = this.cellAtF(p);
    return [Math.floor(x), Math.floor(y)];
  }
  roomAtPos(p: THREE.Vector3) {
    const [i, j] = this.cellAt(p);
    if (i < 0 || j < 0 || i >= this.fg.w || j >= this.fg.h) return -1;
    return this.fg.roomAt[j * this.fg.w + i];
  }
  /** The middle of a cell's edge, at floor level. */
  edgePos(cell: Cell, dir: Dir) {
    const [dx, dz] = DV[dir];
    return this.cellCenter(cell[0], cell[1]).add(V((dx * CELL) / 2, 0, (dz * CELL) / 2));
  }
  /** Ground height inside this floor (null outside it): standing water reads lower, so you wade. */
  groundAt = (x: number, z: number): number | null => {
    const hx = (this.fg.w * CELL) / 2 + 6, hz = (this.fg.h * CELL) / 2 + 6;
    if (Math.abs(x - this.origin.x) > hx || Math.abs(z - this.origin.z) > hz) return null;
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    const k = j * this.fg.w + i;
    if (this.boss?.groundAt) {
      const b = this.boss.groundAt(x, z);
      if (b !== null) return b;
    }
    if (this.wet.has(k)) return this.origin.y - 0.9;
    if (this.pits.has(k) && this.traps?.pitOpen(k)) return this.origin.y - 0.9;
    return this.origin.y;
  };

  get spawnPoint() {
    const [i, j] = this.fg.entrance;
    const [dx, dz] = DV[this.fg.plan.exitWall];
    return this.cellCenter(i, j).add(V(-dx * 0.6, 0, -dz * 0.6));
  }
  /** Facing away from the way out, into the floor. */
  get entranceYaw() {
    const [dx, dz] = DV[OPP[this.fg.plan.exitWall]];
    return Math.atan2(dx, dz);
  }
  /** Beside the stairs down (where you arrive climbing back up). */
  get stairsPoint() {
    const [i, j] = this.fg.exit;
    return this.cellCenter(i, j).add(V(0, 0, CELL * 0.75));
  }
  /** After dying: the shrine you last rested at on this floor, or the entrance. */
  get respawnPoint() {
    const s = this.progress.shrine;
    if (s && s.floor === this.floor) {
      const r = this.fg.rooms[s.room];
      if (r) return this.centreOf(r).add(V(1.2, 0.3, 1.2));
    }
    return this.spawnPoint.setY(this.origin.y + 0.3);
  }
  centreOf(r: KRoom, y = 0) {
    return V(this.x0 + (r.rect.x + r.rect.w / 2) * CELL, this.origin.y + y, this.z0 + (r.rect.y + r.rect.h / 2) * CELL);
  }

  /** The crypt's orcs (tests and old code reach for these by name). */
  get orcs(): OrcMob[] {
    return this.mobs.filter((m) => m.obj instanceof OrcMob).map((m) => m.obj as OrcMob);
  }
  set orcs(list: OrcMob[]) {
    this.mobs = this.mobs.filter((m) => !(m.obj instanceof OrcMob) || list.includes(m.obj as OrcMob));
  }
  get bossTarget() {
    return this.boss?.target ?? null;
  }

  private box(pos: THREE.Vector3, half: THREE.Vector3, ry: number | THREE.Quaternion = 0) {
    const q = typeof ry === 'number' ? (ry ? new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ry) : undefined) : ry;
    const c = physics.addBox(pos, half, q);
    this.colliders.push(c);
    return c;
  }
  private removeSolid(c: RAPIER.Collider) {
    if (!this.colliders.includes(c)) return;
    this.colliders = this.colliders.filter((x) => x !== c);
    physics.removeStatic(c);
  }
  private batch(id: number) {
    let b = this.batches.get(id);
    if (!b) this.batches.set(id, (b = new StaticBatch()));
    return b;
  }
  private roomGroup(id: number) {
    let g = this.roomGroups.get(id);
    if (!g) {
      g = new THREE.Group();
      this.group.add(g);
      this.roomGroups.set(id, g);
    }
    return g;
  }

  /** Closed wall faces of a room (no doors in them). */
  faces(r: KRoom): WallFace[] {
    const out: WallFace[] = [];
    for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) {
      for (const d of ['n', 'e', 's', 'w'] as Dir[]) {
        if (!this.grid.wall(i, j, d)) continue;
        const [dx, dz] = DV[d];
        const pos = this.cellCenter(i, j).add(V(dx * (CELL / 2 - WALL_T / 2), 0, dz * (CELL / 2 - WALL_T / 2)));
        out.push({ cell: [i, j], dir: d, pos, inward: V(-dx, 0, -dz), along: V(Math.abs(dz), 0, Math.abs(dx)) });
      }
    }
    return out;
  }

  private makeCtx(): KitCtx {
    const self = this;
    const doorCells = new Set<string>();
    for (const d of this.fg.doors) {
      const [dx, dy] = DV[d.dir];
      doorCells.add(`${d.cell}`);
      doorCells.add(`${d.cell[0] + dx},${d.cell[1] + dy}`);
    }
    const busyCells = new Set<string>();
    for (const t of this.fg.traps) busyCells.add(`${t.cell}`);
    for (const c of this.fg.chests) busyCells.add(`${c.cell}`);
    if (this.fg.keyCell) busyCells.add(`${this.fg.keyCell}`);
    busyCells.add(`${this.fg.entrance}`);
    if (this.def.plans[this.floor - 1].stairsDown) busyCells.add(`${this.fg.exit}`);
    const ctx: KitCtx = {
      inst: this,
      fg: this.fg,
      theme: themeOf(this.def.theme),
      rnd: mulberry32(this.seed + this.floor * 13),
      scene: this.scene,
      fx: this.fx,
      floor: this.floor,
      progress: this.progress,
      hooks: this.hooks,
      doorCells,
      busyCells,
      cell: (i, j, y = 0) => self.cellCenter(i, j, y),
      centre: (r, y = 0) => self.centreOf(r, y),
      size: (r) => ({ w: r.rect.w * CELL - WALL_T, d: r.rect.h * CELL - WALL_T }),
      batch: (r) => self.batch(r.id),
      group: (r) => self.roomGroup(r.id),
      mesh: (r, geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, rz, 'YXZ');
        self.batch(r.id).addObject(m);
        geo.dispose();
      },
      solid: (pos, half, ry = 0) => void self.box(pos, half, ry),
      solidRef: (pos, half, ry = 0) => self.box(pos, half, ry),
      removeSolid: (c) => self.removeSolid(c),
      flame: (r, pos, kind, power = 1) => self.addFlame(r.id, pos, kind, power),
      faces: (r) => self.faces(r),
      interact: (it) => void self.interactables.push(it),
      spawn: (r, kind, at) => {
        // The dead rise when you come into their room; the rest wait where they stand.
        const p = at?.clone() ?? self.centreOf(r);
        if (kind === 'skeleton' || kind === 'zombie') self.dormant.push({ room: r.id, kind, at: p });
        else self.spawnMob(kind, p, r.id);
      },
      spawnNow: (kind, at, room = -1) => self.spawnMob(kind, at, room),
      water: (r, level = 0.45, cells) => self.addWater(r, level, cells),
      shaft: (r, at, radius) => self.addShaft(r, at, radius),
      toast: (m) => self.hooks.toast(m),
      door: (id) => self.doors.find((d) => d.d.id === id),
      openDoor: (id, quiet) => self.openDoor(id, quiet),
      solve: (mech) => self.solve(mech),
      edgePos: (cell, dir) => self.edgePos(cell, dir),
    };
    return ctx;
  }

  // ---- shell: floors, walls, pillars, ceiling ------------------------------------------------
  private buildShell() {
    const fg = this.fg, m = this.theme.m, H = this.theme.wallH, O = this.origin;
    const stairs = this.def.plans[this.floor - 1].stairsDown ? fg.exit : null;
    const skip = (i: number, j: number) => (stairs && i === stairs[0] && j === stairs[1]) || this.pits.has(j * fg.w + i);
    // Floor tiles.
    const tiles: THREE.Matrix4[] = [];
    for (let j = 0; j < fg.h; j++) for (let i = 0; i < fg.w; i++) if (!skip(i, j)) tiles.push(new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(this.cellCenter(i, j)));
    const floorMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CELL, CELL), m.floor, tiles.length);
    tiles.forEach((t, k) => floorMesh.setMatrixAt(k, t));
    floorMesh.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fg.w * CELL + 8, fg.h * CELL + 8), m.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.copy(O).setY(O.y + H);
    this.group.add(floorMesh, ceil);
    // Floor collision: each row of cells in runs, around the stairwell and the pits.
    for (let j = 0; j < fg.h; j++) {
      let run = -1;
      for (let i = 0; i <= fg.w; i++) {
        const on = i < fg.w && !skip(i, j);
        if (on && run < 0) run = i;
        if (!on && run >= 0) {
          const len = (i - run) * CELL;
          this.box(V(this.x0 + run * CELL + len / 2, O.y - 0.5, this.z0 + (j + 0.5) * CELL), V(len / 2, 0.5, CELL / 2));
          run = -1;
        }
      }
    }
    // An apron around the floor's edge (nothing falls off the world through a gap).
    this.box(V(O.x, O.y - 1.5, O.z), V((fg.w * CELL) / 2 + 6, 0.4, (fg.h * CELL) / 2 + 6));

    // Walls on every closed edge, and stubs either side of every door.
    const wallMats: THREE.Matrix4[] = [];
    const q90 = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2);
    const one = V(1, 1, 1);
    const addWall = (x: number, z: number, vertical: boolean, len = CELL + WALL_T * 0.2) => {
      wallMats.push(new THREE.Matrix4().compose(V(x, O.y + H / 2, z), vertical ? q90 : new THREE.Quaternion(), V(len / (CELL + WALL_T * 0.2), 1, 1).multiply(one)));
    };
    for (let j = 0; j <= fg.h; j++) for (let i = 0; i < fg.w; i++) if (fg.hWall[j * fg.w + i]) addWall(this.x0 + (i + 0.5) * CELL, this.z0 + j * CELL, false);
    for (let j = 0; j < fg.h; j++) for (let i = 0; i <= fg.w; i++) if (fg.vWall[j * (fg.w + 1) + i]) addWall(this.x0 + i * CELL, this.z0 + (j + 0.5) * CELL, true);
    // Door stubs and lintels.
    const stub = (CELL - DOOR_W) / 2;
    const lintels: THREE.Matrix4[] = [];
    for (const d of fg.doors) {
      const p = this.edgePos(d.cell, d.dir);
      const vertical = d.dir === 'e' || d.dir === 'w';
      for (const s of [-1, 1]) {
        const off = (DOOR_W / 2 + stub / 2) * s;
        const x = p.x + (vertical ? 0 : off), z = p.z + (vertical ? off : 0);
        addWall(x, z, vertical, stub + WALL_T * 0.1);
        this.box(V(x, O.y + H / 2, z), vertical ? V(WALL_T / 2, H / 2, stub / 2) : V(stub / 2, H / 2, WALL_T / 2));
      }
      lintels.push(new THREE.Matrix4().compose(V(p.x, O.y + 3.2 + (H - 3.2) / 2, p.z), vertical ? q90 : new THREE.Quaternion(), V(DOOR_W / (CELL + WALL_T * 0.2), (H - 3.2) / H, 1)));
    }
    const wallGeo = new THREE.BoxGeometry(CELL + WALL_T * 0.2, H, WALL_T);
    const walls = new THREE.InstancedMesh(wallGeo, m.wall, wallMats.length + lintels.length);
    [...wallMats, ...lintels].forEach((t, k) => walls.setMatrixAt(k, t));
    walls.castShadow = walls.receiveShadow = true;
    this.group.add(walls);
    // Lintel collision (keeps the camera out of the wall above a door).
    for (const d of fg.doors) {
      const p = this.edgePos(d.cell, d.dir);
      const vertical = d.dir === 'e' || d.dir === 'w';
      this.box(V(p.x, O.y + 3.2 + (H - 3.2) / 2, p.z), vertical ? V(WALL_T / 2, (H - 3.2) / 2, DOOR_W / 2) : V(DOOR_W / 2, (H - 3.2) / 2, WALL_T / 2));
    }
    // Wall collision: runs of consecutive edges merged into long boxes.
    for (let j = 0; j <= fg.h; j++) {
      let run = -1;
      for (let i = 0; i <= fg.w; i++) {
        const on = i < fg.w && fg.hWall[j * fg.w + i] === 1;
        if (on && run < 0) run = i;
        if (!on && run >= 0) {
          const len = (i - run) * CELL;
          this.box(V(this.x0 + run * CELL + len / 2, O.y + H / 2, this.z0 + j * CELL), V(len / 2 + WALL_T / 2, H / 2, WALL_T / 2));
          run = -1;
        }
      }
    }
    for (let i = 0; i <= fg.w; i++) {
      let run = -1;
      for (let j = 0; j <= fg.h; j++) {
        const on = j < fg.h && fg.vWall[j * (fg.w + 1) + i] === 1;
        if (on && run < 0) run = j;
        if (!on && run >= 0) {
          const len = (j - run) * CELL;
          this.box(V(this.x0 + i * CELL, O.y + H / 2, this.z0 + run * CELL + len / 2), V(WALL_T / 2, H / 2, len / 2 + WALL_T / 2));
          run = -1;
        }
      }
    }
    // Pillars where walls meet or end.
    const pil: THREE.Matrix4[] = [];
    for (let j = 0; j <= fg.h; j++) for (let i = 0; i <= fg.w; i++) {
      const n = j > 0 && fg.vWall[(j - 1) * (fg.w + 1) + i] ? 1 : 0;
      const s = j < fg.h && fg.vWall[j * (fg.w + 1) + i] ? 1 : 0;
      const w = i > 0 && fg.hWall[j * fg.w + i - 1] ? 1 : 0;
      const e = i < fg.w && fg.hWall[j * fg.w + i] ? 1 : 0;
      const k = n + s + e + w;
      if (k === 0 || (k === 2 && ((n && s) || (e && w)))) continue;
      pil.push(new THREE.Matrix4().setPosition(this.x0 + i * CELL, O.y + H / 2, this.z0 + j * CELL));
    }
    const pillarsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, H, 1.15), m.pillar, pil.length);
    pil.forEach((t, k) => pillarsMesh.setMatrixAt(k, t));
    this.group.add(pillarsMesh);
  }

  // ---- doors ------------------------------------------------------------------------------
  private buildDoors() {
    const m = this.theme.m, H = this.theme.wallH, O = this.origin;
    for (const d of this.fg.doors) {
      const pos = this.edgePos(d.cell, d.dir);
      const vertical = d.dir === 'e' || d.dir === 'w';
      const across = vertical ? V(0, 0, 1) : V(1, 0, 0);
      const half = vertical ? V(0.25, 1.6, DOOR_W / 2) : V(DOOR_W / 2, 1.6, 0.25);
      const rt: DoorRt = { d, leaf: null, col: null, open: true, t: 1, style: 'none', pos };
      const wasOpen = this.progress.doors.includes(d.id) || (d.kind === 'reward' && this.progress.boss);
      // A frame for every doorway (not a hidden one): two posts and a lintel stone.
      const frame = this.batch(d.a);
      if (d.kind !== 'secret') for (const s of [-1, 1]) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(vertical ? WALL_T + 0.2 : 0.35, 3.3, vertical ? 0.35 : WALL_T + 0.2), m.trim);
        g.position.copy(pos).addScaledVector(across, s * (DOOR_W / 2 + 0.12)).setY(O.y + 1.65);
        frame.addObject(g);
      }
      const lint = new THREE.Mesh(new THREE.BoxGeometry(vertical ? WALL_T + 0.25 : DOOR_W + 0.7, 0.4, vertical ? DOOR_W + 0.7 : WALL_T + 0.25), m.trim);
      lint.position.copy(pos).setY(O.y + 3.25);
      if (d.kind !== 'secret') frame.addObject(lint);
      if (d.kind === 'locked' || d.kind === 'arena') {
        // A portcullis (the arena's waits raised, and drops when the boss wakes).
        const bars = new THREE.Group();
        for (let k = -3; k <= 3; k++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.1, 6), m.iron);
          b.position.copy(across).multiplyScalar(k * 0.33).setY(1.55);
          bars.add(b);
        }
        for (const y of [0.7, 1.8, 2.8]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(across.x ? DOOR_W : 0.08, 0.1, across.z ? DOOR_W : 0.08), m.iron);
          r.position.y = y;
          bars.add(r);
        }
        bars.position.copy(pos);
        this.group.add(bars);
        rt.leaf = bars;
        rt.style = 'rise';
        rt.open = d.kind === 'arena' || wasOpen;
        rt.t = rt.open ? 1 : 0;
        bars.position.y = O.y + (rt.open ? 3.0 : 0);
        if (!rt.open) rt.col = this.box(pos.clone().setY(O.y + 1.6), half);
      } else if (d.kind === 'sealed' || d.kind === 'reward') {
        // A stone slab with the Sunwheel cut into it; it sinks into the floor.
        const slab = new THREE.Group();
        const s = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.35 : DOOR_W + 0.1, 3.1, vertical ? DOOR_W + 0.1 : 0.35), m.trim);
        s.position.y = 1.55;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 20), m.rune);
        ring.position.y = 1.7;
        ring.rotation.y = vertical ? Math.PI / 2 : 0;
        slab.add(s, ring);
        for (const sd of [-1, 1]) {
          const r2 = ring.clone();
          r2.position.addScaledVector(vertical ? V(sd * 0.19, 0, 0) : V(0, 0, sd * 0.19), 1);
          slab.add(r2);
        }
        slab.remove(ring);
        slab.position.copy(pos);
        this.group.add(slab);
        rt.leaf = slab;
        rt.style = 'sink';
        rt.open = wasOpen;
        rt.t = rt.open ? 1 : 0;
        slab.position.y = O.y - (rt.open ? 3.15 : 0);
        if (!rt.open) rt.col = this.box(pos.clone().setY(O.y + 1.6), half);
      } else if (d.kind === 'shortcut') {
        // A barred plank door: the bar is on the far side.
        const leaf = new THREE.Group();
        const p = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.15 : DOOR_W, 3.0, vertical ? DOOR_W : 0.15), m.planks);
        p.position.set(vertical ? 0 : DOOR_W / 2, 1.5, vertical ? DOOR_W / 2 : 0);
        leaf.add(p);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.15 : DOOR_W * 0.9, 0.18, vertical ? DOOR_W * 0.9 : 0.15), m.iron);
        const farSide = this.fg.rooms[d.from!];
        const toFar = this.centreOf(farSide).sub(pos).setY(0);
        const sgn = vertical ? Math.sign(toFar.x) : Math.sign(toFar.z);
        bar.position.copy(p.position).add(vertical ? V(sgn * 0.15, 0, 0) : V(0, 0, sgn * 0.15)).setY(1.4);
        leaf.add(bar);
        leaf.position.copy(pos).addScaledVector(across, -DOOR_W / 2);
        this.group.add(leaf);
        rt.leaf = leaf;
        rt.style = 'swing';
        rt.open = wasOpen;
        rt.t = rt.open ? 1 : 0;
        if (rt.open) leaf.rotation.y = (vertical ? -1 : 1) * Math.PI / 2 * -sgn;
        else rt.col = this.box(pos.clone().setY(O.y + 1.6), half);
        (leaf.userData as { swing: number }).swing = (vertical ? -1 : 1) * (Math.PI / 2) * -sgn;
      } else if (d.kind === 'secret') {
        rt.open = this.progress.secrets.includes(d.id);
        rt.t = rt.open ? 1 : 0;
        // secrets.ts builds the wall that hides it.
      }
      void H;
      this.doors.push(rt);
      this.addDoorInteract(rt);
    }
  }

  private addDoorInteract(rt: DoorRt) {
    const d = rt.d;
    const perks = () => this.hooks.perks();
    const canForce = () => perks().masterDelver && !this.progress.masterUsed;
    if (d.kind === 'locked') {
      const keyName = ITEMS[d.key ?? '']?.name ?? 'key';
      this.interactables.push({
        pos: rt.pos.clone(), radius: 2.4,
        label: () => (this.hooks.hasItem(d.key ?? '') ? 'Unlock the gate' : canForce() ? 'Master Delver: force the lock' : `Locked gate (needs the ${keyName})`),
        enabled: () => !rt.open,
        action: () => {
          if (this.hooks.hasItem(d.key ?? '')) return this.openDoor(d.id);
          if (canForce()) {
            this.progress.masterUsed = true;
            this.hooks.toast('You work the old lock open with a bent pin and patience.');
            return this.openDoor(d.id);
          }
          this.hooks.toast(`The gate is locked. Somewhere on this floor is the ${keyName}.`);
        },
      });
    } else if (d.kind === 'sealed') {
      this.interactables.push({
        pos: rt.pos.clone(), radius: 2.4,
        label: () => (canForce() ? 'Master Delver: work the seal open' : 'A sealed stone door'),
        enabled: () => !rt.open,
        action: () => {
          if (canForce()) {
            this.progress.masterUsed = true;
            this.hooks.toast('You find the slab\'s counterweight and lean on it until it gives.');
            return this.openDoor(d.id);
          }
          this.hooks.toast(this.puzzles?.hint(d) ?? 'The door is sealed by some mechanism elsewhere.');
        },
      });
    } else if (d.kind === 'shortcut') {
      const far = d.from!;
      this.interactables.push({
        pos: rt.pos.clone(), radius: 2.2,
        label: () => (this.room === far ? 'Lift the bar (open a shortcut)' : 'A door, barred from the other side'),
        enabled: () => !rt.open,
        action: () => {
          if (this.room !== far) return this.hooks.toast('It won\'t budge. Barred from the other side.');
          this.openDoor(d.id);
          this.hooks.toast('The bar lifts. A shortcut back.');
        },
      });
    }
  }

  /** Open a door for good (and remember it). */
  openDoor(id: string, quiet = false) {
    const rt = this.doors.find((d) => d.d.id === id);
    if (!rt || rt.open) return;
    rt.open = true;
    if (rt.col) {
      this.removeSolid(rt.col);
      rt.col = null;
    }
    if (rt.d.kind !== 'arena' && !this.progress.doors.includes(id)) this.progress.doors.push(id);
    if (!quiet) {
      if (rt.d.kind === 'locked') this.hooks.toast('The portcullis grinds upward.');
      if (rt.d.kind === 'sealed') this.hooks.toast('Stone grinds on stone. The sealed door sinks into the floor.');
    }
    this.hooks.onDoor?.(id);
    this.hooks.save();
  }

  /** Close a door again (the boss arena's portcullis drops). */
  closeDoor(id: string) {
    const rt = this.doors.find((d) => d.d.id === id);
    if (!rt || !rt.open) return;
    rt.open = false;
    const vertical = rt.d.dir === 'e' || rt.d.dir === 'w';
    rt.col = this.box(rt.pos.clone().setY(this.origin.y + 1.6), vertical ? V(0.25, 1.6, DOOR_W / 2) : V(DOOR_W / 2, 1.6, 0.25));
  }

  /** A mechanism is done: every door sealed by it (and only it) opens. */
  solve(mech: string) {
    if (!this.progress.mech.includes(mech)) this.progress.mech.push(mech);
    for (const rt of this.doors) {
      if (rt.d.kind !== 'sealed' || rt.open) continue;
      if ((rt.d.mech ?? []).every((x) => this.progress.mech.includes(x))) this.openDoor(rt.d.id);
    }
    this.hooks.save();
  }

  // ---- the way out, the stairs ------------------------------------------------------------------
  private buildExit() {
    const fg = this.fg, O = this.origin, m = this.theme.m;
    const [i, j] = fg.entrance;
    const dir = fg.plan.exitWall;
    const p = this.edgePos([i, j], dir);
    const [dx, dz] = DV[dir];
    const vertical = dir === 'e' || dir === 'w';
    const room = fg.roomAt[j * fg.w + i];
    // A bright archway (daylight above on the first floor, the stair's lamplight below).
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), new THREE.MeshBasicMaterial({ color: this.floor === 1 ? new THREE.Color(1.25, 1.2, 1.05) : new THREE.Color(0.5, 0.45, 0.35) }));
    glow.position.copy(p).add(V(-dx * (WALL_T / 2 + 0.02), O.y + 1.5, -dz * (WALL_T / 2 + 0.02)));
    glow.rotation.y = Math.atan2(-dx, -dz);
    this.roomGroup(room).add(glow);
    const b = this.batch(room);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 1.0 : 0.5, 3.6, vertical ? 0.5 : 1.0), m.trim);
      post.position.copy(p).add(V(vertical ? -dx * 0.4 : s * 1.4, O.y + 1.8, vertical ? s * 1.4 : -dz * 0.4));
      b.addObject(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 1.0 : 3.4, 0.55, vertical ? 3.4 : 1.0), m.trim);
    lintel.position.copy(p).add(V(-dx * 0.4, O.y + 3.5, -dz * 0.4));
    b.addObject(lintel);
    this.interactables.push({
      pos: p.clone().add(V(-dx * 0.8, 0, -dz * 0.8)),
      radius: 2.2,
      label: () => this.def.exitLabel(this.floor),
      enabled: () => true,
      action: () => (this.floor === 1 ? this.hooks.leave() : this.hooks.ascend()),
    });
  }

  private buildStairs() {
    if (!this.def.plans[this.floor - 1].stairsDown) return;
    const c = this.cellCenter(this.fg.exit[0], this.fg.exit[1]);
    const O = this.origin, m = this.theme.m;
    const room = this.fg.roomAt[this.fg.exit[1] * this.fg.w + this.fg.exit[0]];
    // Steps descending northward into the dark.
    const steps = 7, rise = 0.32, run = CELL / steps;
    for (let k = 0; k < steps; k++) {
      const y = -rise * (k + 1);
      const s = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.2, rise, run), m.pillar);
      s.position.set(c.x, O.y + y + rise / 2, c.z + CELL / 2 - run * (k + 0.5));
      this.batch(room).addObject(s);
      this.box(s.position.clone(), V((CELL - 0.2) / 2, rise / 2, run / 2));
    }
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), m.dark);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(c.x, O.y - rise * steps - 0.05, c.z);
    this.roomGroup(room).add(pit);
    this.box(V(c.x, O.y - 1, c.z - CELL / 2 - 0.2), V(CELL / 2, 3, 0.3));
    for (const s of [-1, 1]) this.box(V(c.x + s * (CELL / 2 + 0.1), O.y - 1.2, c.z), V(0.15, 1.2, CELL / 2));
    this.interactables.push({
      pos: c.clone().add(V(0, -1, 0)),
      radius: 2.6,
      label: () => `Descend to ${this.def.plans[this.floor]?.name.split('·').pop()?.trim().toLowerCase() ?? 'the floor below'}`,
      enabled: () => true,
      action: () => this.hooks.descend(),
    });
  }

  /** The portal home, beside the boss's arena once it has fallen. */
  buildPortal() {
    if (this.portal) return;
    const arena = this.fg.rooms.find((r) => r.role === 'boss');
    if (!arena) return;
    const c = this.centreOf(arena);
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 2.6, 3.4) }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.9, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    g.add(ring, disc);
    g.position.copy(c).setY(this.origin.y + 1.5);
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

  // ---- chests and the key -----------------------------------------------------------------------
  private buildChests() {
    const m = this.theme.m;
    const tierLook = [
      { wood: m.wood, band: m.iron, lock: m.brass, scale: 1 },
      { wood: m.planks, band: m.iron, lock: m.iron, scale: 1.05 },
      { wood: m.cloth, band: m.brass, lock: m.brass, scale: 1.12 },
      { wood: m.trim, band: m.brass, lock: m.rune, scale: 1.3 },
    ];
    for (const ch of this.fg.chests) {
      const r = this.fg.rooms[ch.room];
      const [i, j] = ch.cell;
      // Face the room's middle.
      const c = this.cellCenter(i, j);
      const ctr = this.centreOf(r);
      const to = ctr.clone().sub(c).setY(0);
      if (to.lengthSq() < 0.01) to.set(0, 0, 1);
      const pos = c.clone().addScaledVector(to.clone().normalize(), -0.6);
      const look = tierLook[ch.tier];
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), look.wood);
      base.position.y = 0.28;
      const lid = new THREE.Group();
      lid.position.set(0, 0.55, -0.35);
      const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI), look.wood);
      lidMesh.rotation.z = Math.PI / 2;
      lidMesh.position.z = 0.35;
      lid.add(lidMesh);
      for (const x of [-0.42, 0, 0.42]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.57, 0.72), look.band);
        band.position.set(x, 0.28, 0);
        g.add(band);
      }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.05), look.lock);
      lock.position.set(0, 0.5, 0.37);
      g.add(base, lid, lock);
      g.scale.setScalar(look.scale);
      g.position.copy(pos);
      g.rotation.y = Math.atan2(to.x, to.z);
      this.roomGroup(ch.room).add(g);
      const opened = this.progress.chests.includes(ch.id);
      if (opened) lid.rotation.x = -1.9;
      const glint = new THREE.Sprite(m.coldFlame);
      glint.scale.setScalar(0.5);
      glint.position.copy(pos).setY(1.0);
      glint.visible = false;
      this.roomGroup(ch.room).add(glint);
      const rec = { id: ch.id, lid, root: g, open: opened, t: opened ? 1 : 0, pos, tier: ch.tier, item: ch.item, hidden: !!ch.hidden && !this.progress.secrets.includes(ch.id), glint };
      if (rec.hidden) g.visible = false;
      this.chests.push(rec);
      this.box(pos.clone().setY(0.4), V(0.55, 0.4, 0.55));
      this.interactables.push({
        pos, radius: 1.9,
        label: () => 'Open chest',
        enabled: () => !rec.open && !rec.hidden,
        action: () => this.openChest(rec),
      });
    }
  }

  /** A hidden chest comes up out of its loose tile (secrets.ts). */
  revealChest(id: string) {
    const c = this.chests.find((q) => q.id === id);
    if (!c || !c.hidden) return;
    c.hidden = false;
    c.root.visible = true;
    c.root.position.y -= 0.6;
    c.t = c.open ? 1 : 0;
    (c.root.userData as { rise: number }).rise = 0.6;
  }

  private openChest(ch: (typeof this.chests)[number]) {
    ch.open = true;
    this.progress.chests.push(ch.id);
    const at = ch.pos.clone().setY(0.9);
    this.fx.add.spawn({ pos: at, spread: 2, count: 30, life: [0.4, 0.9], size: [0.08, 0.01], color: 0xfff0b0, color2: 0xffb030, upBias: 1.4, drag: 2 });
    const got = rollChest(this.def.loot, ch.tier, this.hooks.perks().lootMul, ch.item);
    if (got.gold) this.hooks.giveGold(at, got.gold);
    const names = got.items.map((id) => this.hooks.giveItem(id));
    this.hooks.toast(names.length ? `Found: ${names.join(', ')}` : 'The chest is full of old coins.');
    this.hooks.save();
  }

  private buildKey() {
    const kc = this.fg.keyCell, key = this.fg.plan.key;
    if (!kc || !key) return;
    const room = this.fg.roomAt[kc[1] * this.fg.w + kc[0]];
    const pos = this.cellCenter(kc[0], kc[1]);
    const taken = this.progress.chests.includes(`key-${this.floor}`) || this.hooks.hasItem(key) || this.fg.doors.some((d) => d.kind === 'locked' && this.progress.doors.includes(d.id));
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 14), this.theme.m.brass);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.03), this.theme.m.brass);
    shaft.position.y = -0.24;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), this.theme.m.brass);
    bit.position.set(0.05, -0.36, 0);
    g.add(ring, shaft, bit);
    g.position.copy(pos).setY(this.origin.y + 1.25);
    g.visible = !taken;
    this.roomGroup(room).add(g);
    this.keyObj = { mesh: g, taken, pos };
    const name = ITEMS[key]?.name ?? key;
    this.interactables.push({
      pos, radius: 2.0,
      label: () => `Take the ${name}`,
      enabled: () => !this.keyObj!.taken,
      action: () => {
        this.keyObj!.taken = true;
        g.visible = false;
        this.progress.chests.push(`key-${this.floor}`);
        this.hooks.giveItem(key);
        this.hooks.toast(`Found: ${name}`);
        this.hooks.save();
      },
    });
  }

  /** The antechamber's shrine: rest (heal, save) and wake here if you fall. */
  private buildShrines() {
    for (const r of this.fg.rooms.filter((q) => q.role === 'ante')) {
      this.interactables.push({
        pos: this.centreOf(r), radius: 2.6,
        label: () => (this.def.theme === 'cave' ? "Rest by the smugglers' fire" : 'Rest at the Sunwheel shrine'),
        enabled: () => true,
        action: () => {
          this.progress.shrine = { floor: this.floor, room: r.id };
          this.hooks.rest();
        },
      });
    }
  }

  // ---- lights -----------------------------------------------------------------------------------
  private addFlame(room: number, pos: THREE.Vector3, kind: FlameKind, power: number) {
    const cold = kind === 'cold';
    const sprite = new THREE.Sprite(cold ? this.theme.m.coldFlame : this.theme.m.flame);
    const base = kind === 'brazier' ? new THREE.Vector2(0.8, 1.1) : kind === 'candle' ? new THREE.Vector2(0.18, 0.28) : kind === 'lantern' ? new THREE.Vector2(0.4, 0.4) : new THREE.Vector2(0.45, 0.7);
    sprite.scale.set(base.x, base.y, 1);
    sprite.position.copy(pos);
    this.roomGroup(room).add(sprite);
    if (kind === 'brazier') {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.22, 0.3, 10), this.theme.m.iron);
      bowl.position.copy(pos).setY(pos.y - 0.35);
      this.batch(room).addObject(bowl);
      if (pos.y > 0.9) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, pos.y - 0.5, 6), this.theme.m.iron);
        leg.position.copy(pos).setY((pos.y - 0.5) / 2);
        this.batch(room).addObject(leg);
      }
    }
    this.flames.push({ pos: pos.clone(), sprite, room, power, kind, phase: Math.random() * 10, color: new THREE.Color(cold ? this.theme.cold : this.theme.warm), base });
  }

  private addWater(r: KRoom, level: number, cells?: Cell[]) {
    const list = cells ?? (() => {
      const out: Cell[] = [];
      for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) out.push([i, j]);
      return out;
    })();
    for (const [i, j] of list) {
      const geo = new THREE.PlaneGeometry(CELL, CELL);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, this.theme.m.water);
      m.position.copy(this.cellCenter(i, j, level));
      this.batch(r.id).addObject(m);
      geo.dispose();
      // Knee-deep and more: you wade (the ground reads lower than the floor you stand on).
      if (level >= 0.3) this.wet.add(j * this.fg.w + i);
    }
  }

  private addShaft(r: KRoom, at: THREE.Vector3, radius: number) {
    const H = this.theme.wallH;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.6, 0.5), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 1.4, H, 16, 1, true), mat);
    m.position.copy(at).setY(this.origin.y + H / 2);
    this.roomGroup(r.id).add(m);
    this.shafts.push(m);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.3, 1.1) }));
    disc.rotation.x = Math.PI / 2;
    disc.position.copy(at).setY(this.origin.y + H - 0.02);
    this.roomGroup(r.id).add(disc);
    this.addFlame(r.id, at.clone().setY(this.origin.y + H * 0.6), 'cold', 0.6);
  }

  /**
   * Breadcrumbs: braziers either side of each door on the way from the hub to
   * the gate and the boss, so the way on always reads.
   */
  private buildBreadcrumbs() {
    const hub = this.fg.rooms.find((r) => r.role === 'hub');
    const exitRoom = this.fg.roomAt[this.fg.exit[1] * this.fg.w + this.fg.exit[0]];
    if (!hub) return;
    // Shortest door path hub -> exit through non-wing rooms.
    const prev = new Map<number, KDoor>();
    const seen = new Set([hub.id]);
    const q = [hub.id];
    while (q.length) {
      const r = q.shift()!;
      for (const d of this.fg.doors) {
        const o = d.a === r ? d.b : d.b === r ? d.a : -1;
        if (o < 0 || seen.has(o) || this.fg.rooms[o].role === 'wing' || d.kind === 'shortcut' || d.kind === 'secret') continue;
        seen.add(o);
        prev.set(o, d);
        q.push(o);
      }
    }
    for (let r = exitRoom, d = prev.get(r); d; r = d.a === r ? d.b : d.a, d = prev.get(r)) {
      const p = this.edgePos(d.cell, d.dir);
      const across = d.dir === 'e' || d.dir === 'w' ? V(0, 0, 1) : V(1, 0, 0);
      const [dx, dz] = DV[d.dir];
      const back = V(-dx, 0, -dz).multiplyScalar(0.9);
      for (const s of [-1, 1]) this.addFlame(d.a, p.clone().addScaledVector(across, s * 1.7).add(back).setY(this.origin.y + 1.25), 'brazier', 0.9);
    }
  }

  // ---- enemies ----------------------------------------------------------------------------------
  private spawnWanderers(rnd: () => number) {
    const kinds = this.def.mobs(this.floor);
    if (!kinds.length) return;
    const [ei, ej] = this.fg.entrance;
    for (const r of this.fg.rooms) {
      if (r.role === 'entry' || r.role === 'ante' || r.role === 'reward' || r.role === 'boss' || r.role === 'stairs' || r.role === 'passage') continue;
      const area = r.rect.w * r.rect.h;
      const n = r.role === 'hub' ? 2 : area >= 6 ? 1 + (rnd() < 0.5 ? 1 : 0) : rnd() < 0.5 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const cells: Cell[] = [];
        for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) {
          if (Math.abs(i - ei) + Math.abs(j - ej) < 3 || this.ctx.busyCells.has(`${i},${j}`)) continue;
          cells.push([i, j]);
        }
        if (!cells.length) continue;
        const [i, j] = cells[Math.floor(rnd() * cells.length)];
        const p = this.cellCenter(i, j).add(V((rnd() - 0.5) * 1.6, 0, (rnd() - 0.5) * 1.6));
        this.ctx.spawn(r, kinds[Math.floor(rnd() * kinds.length)], p);
      }
    }
  }

  spawnMob(kind: MobKind, at: THREE.Vector3, room: number): Mob {
    const p = at.clone().setY(this.origin.y + 0.3);
    let mob: Mob;
    if (kind === 'orc') {
      const o = new OrcMob(p.clone().setY(this.origin.y), this.scene, this.fx);
      mob = { kind, obj: o, room, update: (dt, pl) => o.update(dt, pl), dead: () => o.dead };
    } else if (kind === 'skeleton' || kind === 'zombie') {
      const u = new Undead(kind, p.clone().setY(this.origin.y), Math.random() * 6, this.scene, this.fx);
      mob = { kind, obj: u, room, update: (dt, pl) => u.update(dt, pl, this.mobs.filter((q) => q.obj instanceof Undead).map((q) => q.obj as Undead)), dead: () => u.dead };
    } else if (kind === 'armour') {
      const a = new LivingArmour(p, this.scene, this.fx);
      mob = { kind, obj: a, room, update: (dt, pl) => a.update(dt, pl), dead: () => a.dead };
    } else if (kind === 'rat') {
      const r = new Rat(p, this.scene, this.fx);
      mob = { kind, obj: r, room, update: (dt, pl) => r.update(dt, pl), dead: () => r.dead };
    } else if (kind === 'bandit' || kind === 'crossbow') {
      const b = new Bandit(kind === 'bandit' ? 'sword' : 'crossbow', p, this.scene, this.bolts);
      b.name = kind === 'bandit' ? 'Smuggler' : 'Smuggler Crossbowman';
      mob = { kind, obj: b, room, update: (dt, pl) => b.update(dt, pl), dead: () => b.dead };
    } else {
      const s = new Slime(kind, p, this.scene, this.fx);
      mob = { kind, obj: s, room, update: (dt, pl) => s.update(dt, pl, this.mobs.filter((q) => q.obj instanceof Slime).map((q) => q.obj as Slime)), dead: () => s.dead };
    }
    this.mobs.push(mob);
    return mob;
  }

  // ---- per frame ----------------------------------------------------------------------------------
  update(dt: number, player: Player) {
    if (this.disposed) return;
    this.time += dt;
    const pp = player.pos;
    const perks = this.hooks.perks();
    // Which room you're in; a new one is seen (and may wake its dead).
    const r = this.roomAtPos(pp);
    if (r !== this.room) {
      this.room = r;
      if (r >= 0) this.enterRoom(r, perks);
    }
    // Enemies: only those near you think (they don't pile against walls you're behind).
    for (const m of this.mobs) {
      if (m.obj.position.distanceToSquared(pp) < 30 * 30 || !m.obj.alive) m.update(dt, player);
    }
    for (const m of this.mobs.filter((q) => q.dead())) m.obj.dispose();
    this.mobs = this.mobs.filter((q) => !q.dead());
    this.bolts.update(dt, player);
    // Died and came back: the boss returns to its hall at full strength, traps reset.
    if (player.dead) this.playerWasDead = true;
    else if (this.playerWasDead) {
      this.playerWasDead = false;
      this.boss?.reset();
    }
    this.traps.update(dt, player, perks);
    this.secrets.update(dt, player, perks);
    this.puzzles.update(dt, player);
    this.boss?.update(dt, player);
    this.updateDoors(dt);
    this.updateLights(dt, player, perks);
    this.updateProps(dt, player, perks);
    this.stream(pp);
  }

  private enterRoom(id: number, perks: DelverPerks) {
    const room = this.fg.rooms[id];
    const key = String(this.floor);
    const seen = (this.progress.seen[key] ??= []);
    if (!seen.includes(id)) {
      seen.push(id);
      this.hooks.mastery(5);
      if (room.name && (room.role !== 'wing' || room.template !== 'corridor')) {
        const n = room.name.replace(/^(a|the) /, (s) => s);
        if (room.role !== 'wing' || !/^a /.test(n)) this.hooks.toast(n.charAt(0).toUpperCase() + n.slice(1));
      }
      if (perks.torchbearer) this.flare = 1.3;
    }
    // The dead in this room's walls and floors climb out.
    const wake = this.dormant.filter((d) => d.room === id);
    this.dormant = this.dormant.filter((d) => d.room !== id);
    for (const d of wake) this.spawnMob(d.kind, d.at, d.room);
  }

  private updateDoors(dt: number) {
    const O = this.origin;
    for (const rt of this.doors) {
      if (!rt.leaf) continue;
      const want = rt.open ? 1 : 0;
      if (rt.t === want) continue;
      rt.t = want > rt.t ? Math.min(1, rt.t + dt * (rt.style === 'rise' && !rt.open ? 3 : 0.5)) : Math.max(0, rt.t - dt * 3);
      if (rt.style === 'rise') rt.leaf.position.y = O.y + 3.0 * rt.t;
      else if (rt.style === 'sink') rt.leaf.position.y = O.y - 3.15 * rt.t;
      else if (rt.style === 'swing') rt.leaf.rotation.y = (rt.leaf.userData as { swing: number }).swing * rt.t;
      if (Math.random() < dt * 8 && rt.style !== 'swing') this.fx.dust(rt.pos.clone().setY(O.y + 0.2), 0.5);
    }
  }

  private updateLights(dt: number, player: Player, perks: DelverPerks) {
    const pp = player.pos;
    const L = this.theme.lantern;
    this.flare = Math.max(0, this.flare - dt);
    const reach = perks.torchbearer ? 1.5 : 1;
    const night = perks.nightSight ? 1.2 : 1;
    this.lantern.position.set(pp.x, pp.y + 2.1, pp.z);
    this.lantern.distance = L.distance * reach * (1 + this.flare * 0.8);
    this.lantern.intensity = L.intensity * (perks.torchbearer ? 1.4 : 1) * night * (1 + this.flare * 0.6);
    const seen = new Set(this.progress.seen[String(this.floor)] ?? []);
    // Hand the pooled lights to the nearest, strongest flames.
    const near = this.flames
      .map((f) => [f.pos.distanceToSquared(pp) / (0.4 + f.power), f] as const)
      .sort((a, b) => a[0] - b[0]);
    this.pool.forEach((l, k) => {
      const f = near[k]?.[1];
      if (!f) return (l.intensity = 0);
      l.position.copy(f.pos).add(V(0, 0.2, 0));
      l.color.copy(f.color);
      const flick = f.kind === 'cold' ? 1 : 0.85 + Math.sin(this.time * 11 + f.phase) * 0.08 + Math.sin(this.time * 23 + f.phase * 2) * 0.07;
      l.intensity = 11 * f.power * flick * (seen.has(f.room) ? 0.85 : 1);
      l.distance = f.kind === 'brazier' ? 18 : 14;
    });
    for (const f of this.flames) {
      // Explored rooms dim a little: unexplored ones draw the eye.
      const dim = seen.has(f.room) && f.kind !== 'brazier' ? 0.8 : 1;
      const k = f.kind === 'cold' ? 1 + Math.sin(this.time * 1.7 + f.phase) * 0.06 : 1 + Math.sin(this.time * 13 + f.phase) * 0.12;
      f.sprite.scale.set(f.base.x * k * dim, (f.base.y / k) * dim, 1);
      if (f.kind !== 'cold' && f.kind !== 'candle' && f.pos.distanceToSquared(pp) < 200 && Math.random() < dt * 5) {
        this.fx.add.spawn({ pos: f.pos, vel: V(0, 1.1, 0), spread: 0.2, count: 1, life: [0.4, 0.8], size: [0.04, 0.01], color: 0xffc070, color2: 0xff3000 });
      }
    }
    // Dust motes drifting in the lantern light.
    if (Math.random() < dt * 5) this.fx.alpha.spawn({ pos: pp.clone().add(V((Math.random() - 0.5) * 8, 1 + Math.random() * 2, (Math.random() - 0.5) * 8)), spread: 0.05, count: 1, life: [2.5, 4], size: [0.03, 0.03], color: this.def.theme === 'drowned' ? 0xa8d8d0 : 0xd8c8a8, alpha: 0.5, drag: 0.5 });
  }

  private updateProps(dt: number, player: Player, perks: DelverPerks) {
    for (const c of this.chests) {
      const rise = (c.root.userData as { rise?: number }).rise;
      if (rise && rise > 0) {
        const d = Math.min(rise, dt * 0.8);
        c.root.position.y += d;
        (c.root.userData as { rise: number }).rise = rise - d;
      }
      if (c.open && c.t < 1) {
        c.t = Math.min(1, c.t + dt * 2.2);
        c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.t, 3));
      }
      // Keen Nose: unopened chests glint.
      c.glint.visible = perks.keenNose && !c.open && !c.hidden && c.pos.distanceTo(player.pos) < 12;
      if (c.glint.visible) c.glint.material.rotation = this.time;
    }
    if (this.keyObj && !this.keyObj.taken) {
      this.keyObj.mesh.rotation.y += dt * 1.2;
      this.keyObj.mesh.position.y = this.origin.y + 1.25 + Math.sin(this.time * 2) * 0.06;
      if (Math.random() < dt * 4) this.fx.add.spawn({ pos: this.keyObj.mesh.position, spread: 0.3, count: 1, life: [0.4, 0.8], size: [0.04, 0.01], color: 0xfff0b0, color2: 0xffb030, drag: 2 });
    }
    if (this.portal) {
      this.portal.rotation.y += dt * 0.6;
      if (Math.random() < dt * 20) this.fx.add.spawn({ pos: this.portal.position, spread: 1.2, count: 1, life: [0.6, 1.1], size: [0.08, 0.01], color: 0xbfe8ff, color2: 0x3a7cff, drag: 2 });
    }
    for (const s of this.shafts) (s.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(this.time * 0.7) * 0.03;
  }

  /** Rooms far from you are hidden (their props, flames and the dead in them). */
  private stream(pp: THREE.Vector3) {
    for (const [id, g] of this.roomGroups) {
      const r = this.fg.rooms[id];
      const x0 = this.x0 + r.rect.x * CELL, x1 = x0 + r.rect.w * CELL, z0 = this.z0 + r.rect.y * CELL, z1 = z0 + r.rect.h * CELL;
      const dx = Math.max(x0 - pp.x, 0, pp.x - x1), dz = Math.max(z0 - pp.z, 0, pp.z - z1);
      g.visible = dx * dx + dz * dz < 44 * 44;
    }
  }

  /** The automap: rooms seen (and chests, with Treasure Nose), in the map's cells. */
  autoLayer(perks: DelverPerks): AutoLayer {
    const fg = this.fg;
    const seen = new Set(this.progress.seen[String(this.floor)] ?? []);
    const bossRoom = fg.rooms.find((r) => r.role === 'boss');
    if (perks.senseBoss && bossRoom) seen.add(bossRoom.id);
    const hw = new Array(fg.w * (fg.h + 1)).fill(0), vw = new Array((fg.w + 1) * fg.h).fill(0), fill = new Array(fg.w * fg.h).fill(0);
    const icons: Record<string, string> = {};
    const hidden = new Set<string>();
    for (const d of fg.doors) {
      if (d.kind === 'secret' && !this.progress.secrets.includes(d.id)) hidden.add(`${d.cell},${d.dir}`);
    }
    const isHidden = (i: number, j: number, dir: Dir) => {
      const [dx, dy] = DV[dir];
      return hidden.has(`${i},${j},${dir}`) || hidden.has(`${i + dx},${j + dy},${OPP[dir]}`);
    };
    if (perks.automap) {
      for (const id of seen) {
        const r = fg.rooms[id];
        for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) {
          fill[j * fg.w + i] = 1;
          if (this.grid.wall(i, j, 'n') || isHidden(i, j, 'n')) hw[j * fg.w + i] = 1;
          if (this.grid.wall(i, j, 's') || isHidden(i, j, 's')) hw[(j + 1) * fg.w + i] = 1;
          if (this.grid.wall(i, j, 'w') || isHidden(i, j, 'w')) vw[j * (fg.w + 1) + i] = 1;
          if (this.grid.wall(i, j, 'e') || isHidden(i, j, 'e')) vw[j * (fg.w + 1) + i + 1] = 1;
        }
      }
      for (const d of fg.doors) {
        if (!seen.has(d.a) && !seen.has(d.b)) continue;
        if (d.kind === 'locked' || d.kind === 'sealed') icons[`${d.cell}`] = 'gate';
        else if (d.kind === 'shortcut' && !this.progress.doors.includes(d.id)) icons[`${d.cell}`] = 'door';
      }
      if (this.def.plans[this.floor - 1].stairsDown && seen.has(fg.roomAt[fg.exit[1] * fg.w + fg.exit[0]])) icons[`${fg.exit}`] = 'stairs';
      if (bossRoom && seen.has(bossRoom.id)) icons[`${fg.exit}`] = 'enemy';
    } else if (perks.senseBoss && bossRoom) icons[`${fg.exit}`] = 'enemy';
    if (perks.treasureNose) for (const c of this.chests) if (!c.open && !c.hidden) icons[`${this.cellAt(c.pos)}`] = 'chest';
    return { hw, vw, fill, icons };
  }

  /** Per rendered frame: pose the boss and anything else with a skeleton. */
  present(alpha: number, dt: number, player: Player) {
    this.boss?.present(alpha, dt, player);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.boss?.dispose();
    this.traps.dispose();
    this.secrets.dispose();
    this.puzzles.dispose();
    for (const c of this.colliders) physics.removeStatic(c);
    this.colliders = [];
    for (const m of this.mobs) m.obj.dispose();
    this.mobs = [];
    this.bolts.clear();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m as unknown as THREE.Sprite).isSprite) m.geometry.dispose();
    });
    this.hooks.bossBar(null);
  }
}
