import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../physics/physics';
import { StaticBatch } from '../world/cityKit';
import { worldUV } from '../world/buildings';
import { emptyMap, type MapData } from '../ui/dungeonMap';
import type { Interactable } from '../dungeon/instance';
import type { Player } from '../player/player';

// The building kit for the places under the mountains (docs/design/mountains.md
// §6, §11): near-black stone, glowing blue crystal and orange forge-light.
// A space is laid out on a flat level (its floor height), with walls, pillars,
// bridges and chasms; everything static is merged per material, and every
// collider is remembered so the space can be thrown away whole when you leave.
// (A seam for the dungeon kit, src/dungeon/kit/, after the merge.)

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const std = (color: number, roughness = 0.85, metalness = 0, emissive = 0, ei = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: ei });
  return {
    stone: std(0x3a3a40, 0.92),
    stoneDark: std(0x24242a, 0.95),
    dwarfStone: std(0x6a6a72, 0.8),
    floor: std(0x4a4a50, 0.9),
    timber: std(0x4a3626, 0.9),
    iron: std(0x2e2e34, 0.5, 0.75),
    brass: std(0x9b7130, 0.35, 0.8),
    crystal: std(0x6ab8ff, 0.15, 0.2, 0x2a7aff, 1.6),
    crystalDim: std(0x4a6a8a, 0.3, 0.2, 0x1a4a8a, 0.7),
    fungus: std(0x5ad8b0, 0.6, 0, 0x1a9a7a, 1.1),
    fungusStalk: std(0xb8c8b0, 0.8),
    lava: std(0xff6a1a, 0.6, 0, 0xff4a0a, 2.6),
    ember: std(0xffa040, 0.4, 0, 0xff7010, 1.8),
    water: new THREE.MeshStandardMaterial({ color: 0x0a2a3a, roughness: 0.1, metalness: 0.3, emissive: 0x05202a, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }),
    banner: new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.85, side: THREE.DoubleSide }),
    rune: std(0xffc060, 0.4, 0.3, 0xff9a20, 1.4),
  };
}
export const deepMats = () => (mats ??= makeMats());
export type DeepMats = ReturnType<typeof makeMats>;

export interface SpaceLight {
  hemi: number;
  sky: number;
  ground: number;
  fog: number;
  far: number;
  haze: number;
}

/** A place under the mountains: built when you arrive, thrown away when you leave. */
export interface DeepSpace {
  id: string;
  title: string;
  readonly group: THREE.Group;
  readonly ready: Promise<void>;
  groundAt(x: number, z: number): number | null;
  spawnPoint: THREE.Vector3;
  spawnYaw: number;
  /** where a death or a fall puts you back */
  respawnPoint: THREE.Vector3;
  interactables: Interactable[];
  map: MapData;
  cellAt(p: THREE.Vector3): [number, number];
  light: SpaceLight;
  update(dt: number, player: Player): void;
  setVisible?(v: boolean): void;
  dispose(): void;
}

/** Shared building code for spaces: walls, floors, pillars and lights, all disposable. */
export class SpaceBuilder {
  readonly group = new THREE.Group();
  readonly batch = new StaticBatch();
  readonly m = deepMats();
  private colliders: RAPIER.Collider[] = [];
  readonly lights: { light: THREE.PointLight; base: number; phase: number }[] = [];
  /** floor rectangles [x0, z0, x1, z1, level] (the highest under a point wins) */
  readonly floors: [number, number, number, number, number][] = [];
  /** the hand-drawn map you fill in as you explore (M) */
  readonly map: MapData;

  constructor(readonly origin: THREE.Vector3, private scene: THREE.Scene, readonly mapW = 60, readonly mapH = 60, readonly cell = 4) {
    scene.add(this.group);
    this.map = emptyMap(mapW, mapH);
  }

  /** World point from a local one (origin-relative, y up from the origin level). */
  at(x: number, y: number, z: number) {
    return new THREE.Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }

  mesh(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    const o = new THREE.Mesh(worldUV(g, 2), mat);
    o.position.copy(this.at(x, y, z));
    o.rotation.set(rx, ry, rz, 'YXZ');
    this.batch.addObject(o);
    return o;
  }

  collider(x: number, y: number, z: number, hx: number, hy: number, hz: number, ry = 0) {
    this.colliders.push(physics.addBox(this.at(x, y, z), new THREE.Vector3(hx, hy, hz), ry ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)) : undefined));
  }

  /** A solid block (wall, pillar base, parapet) with its collider. */
  block(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material = this.m.stone, ry = 0) {
    this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry);
    this.collider(x, y + h / 2, z, w / 2, h / 2, d / 2, ry);
  }

  /** A walkable floor slab at `level` (local), recorded for the ground height. */
  floor(x0: number, z0: number, x1: number, z1: number, level = 0, mat: THREE.Material = this.m.floor) {
    const w = x1 - x0, d = z1 - z0;
    this.mesh(new THREE.BoxGeometry(w, 0.6, d), mat, (x0 + x1) / 2, level - 0.3, (z0 + z1) / 2);
    this.collider((x0 + x1) / 2, level - 0.3, (z0 + z1) / 2, w / 2, 0.3, d / 2);
    this.floors.push([x0, z0, x1, z1, level]);
  }

  /** A room: a floor ringed by walls, with gaps for doorways ([side, centre, width]). */
  room(x0: number, z0: number, x1: number, z1: number, h: number, level = 0, gaps: ['n' | 's' | 'e' | 'w', number, number][] = [], mat: THREE.Material = this.m.stone) {
    this.floor(x0, z0, x1, z1, level);
    const t = 1.2;
    const wall = (side: 'n' | 's' | 'e' | 'w', a0: number, a1: number) => {
      const gs = gaps.filter((g) => g[0] === side).sort((p, q) => p[1] - q[1]);
      let a = a0;
      const run = (b: number) => {
        if (b - a < 0.3) return;
        const mid = (a + b) / 2, len = b - a;
        if (side === 'n') this.block(mid, level, z0 - t / 2, len, h, t, mat);
        if (side === 's') this.block(mid, level, z1 + t / 2, len, h, t, mat);
        if (side === 'w') this.block(x0 - t / 2, level, mid, t, h, len, mat);
        if (side === 'e') this.block(x1 + t / 2, level, mid, t, h, len, mat);
      };
      for (const g of gs) {
        run(g[1] - g[2] / 2);
        a = g[1] + g[2] / 2;
      }
      run(a1);
    };
    wall('n', x0 - t, x1 + t);
    wall('s', x0 - t, x1 + t);
    wall('w', z0, z1);
    wall('e', z0, z1);
    // A rough rock ceiling: dark slabs high overhead (no collider: you never reach it).
    this.mesh(new THREE.BoxGeometry(x1 - x0 + 2 * t, 1, z1 - z0 + 2 * t), this.m.stoneDark, (x0 + x1) / 2, level + h + 0.5, (z0 + z1) / 2);
  }

  /** A point light that flickers (lanterns, braziers, crystal glows). */
  light(x: number, y: number, z: number, color: number, intensity: number, distance: number) {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.copy(this.at(x, y, z));
    this.group.add(l);
    this.lights.push({ light: l, base: intensity, phase: Math.random() * 6 });
    return l;
  }

  /** A hanging lantern on a post or bracket (the mesh; add a light where it matters). */
  lantern(x: number, y: number, z: number) {
    this.mesh(new THREE.BoxGeometry(0.14, y, 0.14), this.m.timber, x, y / 2, z);
    this.mesh(new THREE.SphereGeometry(0.2, 8, 6), this.m.ember, x, y + 0.1, z);
  }

  /** A cluster of glowing crystals. */
  crystals(x: number, y: number, z: number, n: number, size = 1, mat: THREE.Material = this.m.crystal) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + x;
      const h = (0.8 + ((k * 37) % 10) / 10) * size;
      this.mesh(new THREE.ConeGeometry(0.22 * size, h * 1.6, 6), mat, x + Math.cos(a) * 0.4 * size, y + h * 0.7, z + Math.sin(a) * 0.4 * size, a, Math.cos(a) * 0.35, Math.sin(a) * 0.35);
    }
  }

  /** Fallen rock and rubble (decor). */
  rubble(x: number, y: number, z: number, n: number, spread = 2) {
    for (let k = 0; k < n; k++) {
      const a = k * 2.4, r = ((k * 13) % 7) / 7 * spread;
      this.mesh(new THREE.DodecahedronGeometry(0.3 + ((k * 7) % 5) * 0.12, 0), this.m.stone, x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r, a, a * 0.5);
    }
  }

  cellAt(p: THREE.Vector3): [number, number] {
    return [Math.floor((p.x - this.origin.x) / this.cell + this.mapW / 2), Math.floor((p.z - this.origin.z) / this.cell + this.mapH / 2)];
  }

  /** Ground height at a world point: the highest floor under it, or null (open chasm: fall). */
  groundAt = (x: number, z: number): number | null => {
    const lx = x - this.origin.x, lz = z - this.origin.z;
    if (Math.abs(lx) > (this.mapW * this.cell) / 2 + 60 || Math.abs(lz) > (this.mapH * this.cell) / 2 + 60) return null;
    let h: number | null = null;
    for (const [x0, z0, x1, z1, lv] of this.floors) if (lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1) h = Math.max(h ?? -1e9, lv);
    // Over a chasm the ground is far below (you fall, and the space puts you back).
    return this.origin.y + (h ?? -80);
  };

  /** Merge the static geometry (call once, after building). */
  finish() {
    this.batch.build(this.group);
  }

  flicker(t: number) {
    for (const l of this.lights) l.light.intensity = l.base * (1 + Math.sin(t * 7 + l.phase) * 0.06 + Math.sin(t * 15.3 + l.phase * 2) * 0.03);
  }

  dispose() {
    for (const c of this.colliders) physics.removeStatic(c);
    this.colliders = [];
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
}
