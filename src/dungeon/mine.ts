import * as THREE from 'three';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import { physics } from '../physics/physics';
import { Slime } from '../enemies/slime';
import { LivingArmour } from '../enemies/livingArmour';
import { emptyMap, type MapData } from '../ui/dungeonMap';
import { pbr } from '../world/props';

export const MINE_ORIGIN = new THREE.Vector3(5000, 0, 0);
export const MINE_CELL = 4;
export const MINE_MAP_W = 36;
export const MINE_MAP_H = 34;

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

interface Rect { x: number; z: number; w: number; d: number; }

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
  return { stone, stoneDark, wood, planks, metal, brass, rail };
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
  readonly interactables: Array<{ pos: THREE.Vector3; radius: number; label: () => string; enabled: () => boolean; action: () => void }> = [];
  readonly map: MapData = emptyMap(MINE_MAP_W, MINE_MAP_H);
  readonly groundAt = (x: number, z: number): number | null => {
    if (x < MINE_ORIGIN.x - 18 || x > MINE_ORIGIN.x + 18 || z < MINE_ORIGIN.z - 118 || z > MINE_ORIGIN.z + 12) return null;
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

  readonly ready = Promise.resolve();

  constructor(
    private scene: THREE.Scene,
    private fx: FX,
    private progress: MineProgress,
    private hooks: MineHooks,
  ) {
    const m = shared ??= makeMaterials();
    scene.add(this.group);
    this.buildShell(m);
    this.buildEntranceTunnel(m);
    this.buildSupports(m);
    this.buildRails(m);
    this.buildMachinery(m);
    this.buildGate(m);
    this.buildMineCart(m);
    this.spawnEnemies();
    this.buildBossArena(m);
    this.buildExit(m);
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

  private wall(x: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    const p = new THREE.Vector3(x, MINE_ORIGIN.y + h / 2, z);
    meshBox(this.group, p, new THREE.Vector3(w, h, d), mat);
    this.box(p, new THREE.Vector3(w / 2, h / 2, d / 2));
  }

  private room(r: Rect, m: ReturnType<typeof makeMaterials>, openSouth: boolean, openNorth: boolean) {
    const floor = meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x + r.x, -0.175, MINE_ORIGIN.z + r.z),
      new THREE.Vector3(r.w, 0.35, r.d),
      m.stone,
    );
    floor.receiveShadow = true;
    this.box(floor.position.clone(), new THREE.Vector3(r.w / 2, 0.175, r.d / 2));

    const h = 5.6, t = 0.6;
    const lx = MINE_ORIGIN.x + r.x - r.w / 2;
    const rx = MINE_ORIGIN.x + r.x + r.w / 2;
    const nz = MINE_ORIGIN.z + r.z - r.d / 2;
    const sz = MINE_ORIGIN.z + r.z + r.d / 2;
    this.wall(lx, MINE_ORIGIN.z + r.z, t, h, r.d, m.stoneDark);
    this.wall(rx, MINE_ORIGIN.z + r.z, t, h, r.d, m.stoneDark);

    const opening = 4.2;
    const sideW = (r.w - opening) / 2;
    this.wall(lx + t / 2 + sideW / 2, nz, sideW, h, t, m.stoneDark);
    this.wall(rx - t / 2 - sideW / 2, nz, sideW, h, t, m.stoneDark);
    this.wall(lx + t / 2 + sideW / 2, sz, sideW, h, t, m.stoneDark);
    this.wall(rx - t / 2 - sideW / 2, sz, sideW, h, t, m.stoneDark);
    if (!openNorth) this.wall(MINE_ORIGIN.x + r.x, nz, opening, h, t, m.stoneDark);
    if (!openSouth) this.wall(MINE_ORIGIN.x + r.x, sz, opening, h, t, m.stoneDark);

    meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x + r.x, MINE_ORIGIN.y + 6.0, MINE_ORIGIN.z + r.z),
      new THREE.Vector3(r.w + 1.2, 0.35, r.d + 1.2),
      m.stoneDark,
    );
  }

  private buildShell(m: ReturnType<typeof makeMaterials>) {
    this.room({ x: 0, z: 0, w: 9, d: 18 }, m, true, true);
    this.room({ x: 0, z: -24, w: 22, d: 18 }, m, true, true);
    this.room({ x: 0, z: -45, w: 24, d: 20 }, m, false, true);
    this.room({ x: 0, z: -63, w: 18, d: 16 }, m, true, true);
    this.room({ x: 0, z: -81, w: 24, d: 18 }, m, true, true);
    this.room({ x: 0, z: -103, w: 28, d: 24 }, m, true, false);

    for (const [z, w, d] of [[-9, 4.2, 6], [-33, 4.2, 12], [-54, 4.2, 6], [-72, 4.2, 6], [-92, 5, 6]] as const) {
      const floor = meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x, -0.175, MINE_ORIGIN.z + z), new THREE.Vector3(w, 0.35, d), m.stone);
      this.box(floor.position.clone(), new THREE.Vector3(w / 2, 0.175, d / 2));
    }

    meshBox(
      this.group,
      new THREE.Vector3(MINE_ORIGIN.x, MINE_ORIGIN.y + 6.05, MINE_ORIGIN.z - 53),
      new THREE.Vector3(37, 0.4, 130),
      m.stoneDark,
    );
  }

  private buildEntranceTunnel(m: ReturnType<typeof makeMaterials>) {
    for (const z of [7, 2, -3, -8, -13]) {
      for (const sx of [-1, 1]) meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x + sx * 3.5, 2.25, MINE_ORIGIN.z + z), new THREE.Vector3(0.34, 4.6, 0.34), m.wood);
      meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x, 4.45, MINE_ORIGIN.z + z), new THREE.Vector3(7.2, 0.34, 0.34), m.wood);
    }
  }

  private buildSupports(m: ReturnType<typeof makeMaterials>) {
    for (const z of [-19, -27, -35, -44, -52, -61, -70, -80, -90, -101, -112]) {
      for (const sx of [-1, 1]) {
        meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x + sx * 9.7, 2.65, MINE_ORIGIN.z + z), new THREE.Vector3(0.35, 5.3, 0.35), m.wood);
      }
      meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x, 5.15, MINE_ORIGIN.z + z), new THREE.Vector3(20.1, 0.38, 0.38), m.wood);
    }
  }

  private buildRails(m: ReturnType<typeof makeMaterials>) {
    for (const x of [-0.72, 0.72]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 112, 6), m.rail);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(MINE_ORIGIN.x + x, 0.12, MINE_ORIGIN.z - 49);
      this.group.add(rail);
    }
    for (let z = -8; z >= -108; z -= 2.2) meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x, 0.02, MINE_ORIGIN.z + z), new THREE.Vector3(2.1, 0.16, 0.34), m.wood);
  }

  private buildMachinery(m: ReturnType<typeof makeMaterials>) {
    meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x - 6.5, 1.25, MINE_ORIGIN.z - 21), new THREE.Vector3(3.2, 0.25, 1.2), m.planks);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x - 6.5 + sx * 1.25, 0.65, MINE_ORIGIN.z - 21 + sz * 0.45), new THREE.Vector3(0.18, 1.25, 0.18), m.wood);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(2, 0.16, 8, 28), m.brass);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(MINE_ORIGIN.x + 5.5, 2.2, MINE_ORIGIN.z - 43);
    this.group.add(wheel);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 10), m.metal);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(MINE_ORIGIN.x + 5.5, 2.2, MINE_ORIGIN.z - 43);
    this.group.add(axle);

    const lever = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), m.brass);
    base.position.y = 0.15;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), m.metal);
    arm.position.y = 0.95;
    arm.rotation.z = this.progress.gateOpen ? 0.45 : -0.45;
    lever.add(base, arm);
    lever.position.set(MINE_ORIGIN.x - 6.6, 0, MINE_ORIGIN.z - 25.5);
    this.group.add(lever);
    this.interactables.push({
      pos: lever.position.clone(),
      radius: 2.1,
      label: () => this.progress.gateOpen ? 'The winch is engaged' : 'Pull the mine winch',
      enabled: () => !this.progress.gateOpen,
      action: () => this.openGate(lever),
    });
  }

  private buildGate(m: ReturnType<typeof makeMaterials>) {
    const g = new THREE.Group();
    for (let i = -4; i <= 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.1, 0.18), m.metal);
      bar.position.set(i * 0.42, 2.55, 0);
      g.add(bar);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 0.3), m.metal);
    top.position.y = 5;
    g.add(top);
    g.position.set(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 34);
    this.group.add(g);
    this.gateBars = g;
    this.gateT = this.progress.gateOpen ? 1 : 0;
    if (!this.progress.gateOpen) {
      this.gateCollider = this.box(new THREE.Vector3(MINE_ORIGIN.x, 2.5, MINE_ORIGIN.z - 34), new THREE.Vector3(2.2, 2.5, 0.28));
    } else {
      g.position.y = 5.7;
    }
  }

  private buildMineCart(m: ReturnType<typeof makeMaterials>) {
    const g = new THREE.Group();
    meshBox(g, new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(2.1, 0.5, 1.3), shared!.metal);
    meshBox(g, new THREE.Vector3(0, 1.15, 0), new THREE.Vector3(2.3, 0.18, 1.45), shared!.wood);
    for (const x of [-0.78, 0.78]) for (const z of [-0.45, 0.45]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), shared!.metal);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.45, z);
      g.add(wheel);
    }
    g.position.set(MINE_ORIGIN.x - 2.4, 0, MINE_ORIGIN.z - 20);
    this.group.add(g);
  }

  private spawnEnemies() {
    const pts = [
      new THREE.Vector3(MINE_ORIGIN.x - 5, 0, MINE_ORIGIN.z - 23),
      new THREE.Vector3(MINE_ORIGIN.x + 5, 0, MINE_ORIGIN.z - 29),
      new THREE.Vector3(MINE_ORIGIN.x - 6, 0, MINE_ORIGIN.z - 74),
      new THREE.Vector3(MINE_ORIGIN.x + 6, 0, MINE_ORIGIN.z - 84),
    ];
    this.enemies.push(new Slime('cave', pts[0], this.scene, this.fx));
    this.enemies.push(new Slime('green', pts[1], this.scene, this.fx));
    this.enemies.push(new LivingArmour(pts[2], this.scene, this.fx));
    this.enemies.push(new LivingArmour(pts[3], this.scene, this.fx));
    if (!this.progress.guardianDead) {
      this.boss = new LivingArmour(new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 103), this.scene, this.fx);
      this.enemies.push(this.boss);
    }
  }

  private buildBossArena(m: ReturnType<typeof makeMaterials>) {
    const altar = meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x, 0.4, MINE_ORIGIN.z - 100), new THREE.Vector3(5.2, 0.8, 5.2), m.stoneDark);
    this.box(altar.position.clone(), new THREE.Vector3(2.6, 0.4, 2.6));
    const ore = new THREE.MeshStandardMaterial({ color: 0x4a5662, emissive: 0x1a2b38, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.55 });
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), ore);
      crystal.scale.set(1, 2.2, 1);
      crystal.position.set(MINE_ORIGIN.x + Math.cos(a) * 9.2, 1.1, MINE_ORIGIN.z - 100 + Math.sin(a) * 9.2);
      crystal.rotation.y = a;
      this.group.add(crystal);
    }
  }

  private buildExit(m: ReturnType<typeof makeMaterials>) {
    meshBox(this.group, new THREE.Vector3(MINE_ORIGIN.x + 4.8, 1.4, MINE_ORIGIN.z + 5.5), new THREE.Vector3(0.32, 1.3, 0.32), m.brass);
    this.interactables.push({
      pos: new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z + 7.5),
      radius: 2.4,
      label: () => 'Leave the mine',
      enabled: () => true,
      action: () => this.hooks.leave(),
    });
    this.interactables.push({
      pos: new THREE.Vector3(MINE_ORIGIN.x, 0, MINE_ORIGIN.z - 62),
      radius: 2.4,
      label: () => 'Inspect the collapsed shaft',
      enabled: () => true,
      action: () => this.hooks.toast('The old lift is jammed. The lower workings continue beyond it.'),
    });
  }

  private openGate(lever: THREE.Group) {
    if (this.progress.gateOpen) return;
    this.progress.gateOpen = true;
    const arm = lever.children[1];
    if (arm) arm.rotation.z = 0.45;
    this.gateT = 0;
    this.hooks.toast('The winch groans. The blast gate rises.');
    this.hooks.save();
  }


  update(dt: number, player: Player) {
    if (this.disposed) return;
    this.time += dt;

    if (this.progress.gateOpen && this.gateBars && this.gateT < 1) {
      this.gateT = Math.min(1, this.gateT + dt * 0.8);
      this.gateBars.position.y = 5.7 * this.gateT;
      if (this.gateT >= 1 && this.gateCollider) {
        physics.world.removeCollider(this.gateCollider, false);
        this.colliders = this.colliders.filter((c) => c !== this.gateCollider);
        this.gateCollider = null;
      }
      if (Math.random() < dt * 7) this.fx.dust(this.gateBars.position.clone().setY(0.4), 0.45);
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

    // Keep the mine alive with cheap dust rather than many ticking lights.
    if (Math.random() < dt * 5) {
      const p = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 8));
      this.fx.alpha.spawn({ pos: p, spread: 0.05, count: 1, life: [2, 4], size: [0.03, 0.03], color: 0xb9aa8f, alpha: 0.38 });
    }
  }

  present(_alpha: number, _dt: number, _player: Player) {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hooks.bossBar(null);
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    for (const c of this.colliders) physics.world.removeCollider(c, false);
    this.colliders = [];
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
