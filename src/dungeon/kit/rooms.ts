import * as THREE from 'three';
import type { StaticBatch } from '../../world/cityKit';
import type { Theme } from './theme';
import type { Cell, Dir, FloorGraph, Interactable, KRoom } from './types';

// ---------------------------------------------------------------------------
// Room templates (docs/design/dungeons.md §3 "Room templates"): how each kind
// of room is dressed. A template is a size (the grammar's TEMPLATE_INFO), a
// look (props in the theme's materials, merged per room), a lighting plan
// (sconces, braziers, candles, cold crystals) and spawn slots. The builder
// (build.ts) hands every dresser the same small toolkit, DressCtx.
// ---------------------------------------------------------------------------

export const CELL = 4;
export const WALL_T = 0.8;

export type MobKind = 'orc' | 'skeleton' | 'zombie' | 'armour' | 'green' | 'cave' | 'blue' | 'rat' | 'bandit' | 'crossbow';

/** A closed stretch of wall inside a room, one cell wide. */
export interface WallFace {
  cell: Cell;
  dir: Dir;
  /** the middle of the wall's face, at floor level */
  pos: THREE.Vector3;
  /** pointing into the room */
  inward: THREE.Vector3;
  /** along the wall */
  along: THREE.Vector3;
}

export type FlameKind = 'sconce' | 'brazier' | 'candle' | 'cold' | 'lantern';

export interface DressCtx {
  fg: FloorGraph;
  theme: Theme;
  rnd: () => number;
  /** the centre of a cell, at height y */
  cell(i: number, j: number, y?: number): THREE.Vector3;
  centre(r: KRoom, y?: number): THREE.Vector3;
  /** the room's size in metres */
  size(r: KRoom): { w: number; d: number };
  /** static props, merged per room */
  batch(r: KRoom): StaticBatch;
  /** moving props (a turning ring, a falling stone) */
  group(r: KRoom): THREE.Group;
  /** add a primitive to the room's batch */
  mesh(r: KRoom, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry?: number, rx?: number, rz?: number): void;
  /** a solid box (collision only) */
  solid(pos: THREE.Vector3, half: THREE.Vector3, ry?: number): void;
  /** a light: a flame sprite, and a share of the pooled point lights */
  flame(r: KRoom, pos: THREE.Vector3, kind: FlameKind, power?: number): void;
  faces(r: KRoom): WallFace[];
  /** cells next to a door (kept clear of props) */
  doorCells: Set<string>;
  /** cells with a trap or chest (kept clear of props) */
  busyCells: Set<string>;
  interact(it: Interactable): void;
  spawn(r: KRoom, kind: MobKind, at?: THREE.Vector3): void;
  /** standing water over the room (wading slows you) at this height */
  water(r: KRoom, level?: number, cells?: Cell[]): void;
  /** a light shaft from a hole in the ceiling */
  shaft(r: KRoom, at: THREE.Vector3, radius: number): void;
  toast(msg: string): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

/** Cells of a room, optionally only those clear of doors, traps and chests. */
export function roomCells(c: DressCtx, r: KRoom, clear = false): Cell[] {
  const out: Cell[] = [];
  for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) {
    if (clear && (c.doorCells.has(`${i},${j}`) || c.busyCells.has(`${i},${j}`))) continue;
    out.push([i, j]);
  }
  return out;
}

// ---- shared dressing ----------------------------------------------------------------------

/** Sconces on every few stretches of wall. */
export function sconces(c: DressCtx, r: KRoom, every = 3, kind: FlameKind = 'sconce') {
  const m = c.theme.m;
  c.faces(r).forEach((f, k) => {
    if (k % every !== 0) return;
    const p = f.pos.clone().addScaledVector(f.inward, 0.12).setY(2.35);
    if (kind === 'lantern') {
      c.mesh(r, box(0.06, 0.6, 0.06), m.trim, p.x, p.y + 0.35, p.z);
      c.mesh(r, box(0.22, 0.28, 0.22), m.brass, p.x, p.y - 0.05, p.z);
    } else {
      const arm = cyl(0.04, 0.03, 0.55, 6);
      c.mesh(r, arm, m.iron, p.x - f.inward.x * 0.05, p.y - 0.2, p.z - f.inward.z * 0.05, 0, f.inward.z * 0.5, -f.inward.x * 0.5);
      c.mesh(r, new THREE.CylinderGeometry(0.1, 0.05, 0.12, 8, 1, true), m.iron, p.x, p.y, p.z);
    }
    c.flame(r, p.clone().setY(p.y + 0.25), kind === 'lantern' ? 'lantern' : kind);
  });
}

/** Pillars where four cells meet inside a big room. */
export function pillars(c: DressCtx, r: KRoom, mat = c.theme.m.pillar, radius = 0.42) {
  if (r.rect.w < 3 || r.rect.h < 3) return;
  const H = c.theme.wallH;
  for (let j = r.rect.y + 1; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x + 1; i < r.rect.x + r.rect.w; i++) {
    if ((i - r.rect.x) % 2 || (j - r.rect.y) % 2) continue;
    const p = c.cell(i, j).add(V(-CELL / 2, 0, -CELL / 2));
    c.mesh(r, cyl(radius, radius * 1.15, H, 10), mat, p.x, H / 2, p.z);
    c.mesh(r, box(radius * 2.6, 0.3, radius * 2.6), mat, p.x, 0.15, p.z);
    c.mesh(r, box(radius * 2.6, 0.3, radius * 2.6), mat, p.x, H - 0.15, p.z);
    c.solid(V(p.x, H / 2, p.z), V(radius, H / 2, radius));
  }
}

/** Fallen stones and broken masonry. */
export function rubble(c: DressCtx, r: KRoom, n: number, mat = c.theme.m.rock) {
  const cells = roomCells(c, r, true);
  for (let k = 0; k < n && cells.length; k++) {
    const [i, j] = cells[Math.floor(c.rnd() * cells.length)];
    const p = c.cell(i, j).add(V((c.rnd() - 0.5) * 2.6, 0, (c.rnd() - 0.5) * 2.6));
    const s = 0.2 + c.rnd() * 0.35;
    const g = new THREE.DodecahedronGeometry(s, 0);
    c.mesh(r, g, mat, p.x, s * 0.5, p.z, c.rnd() * 6, c.rnd(), c.rnd());
  }
}

/** Rocks along the walls (caves): breaks the straight lines of the cells. */
export function rockRim(c: DressCtx, r: KRoom, density = 1) {
  for (const f of c.faces(r)) {
    if (c.rnd() > 0.85 * density) continue;
    for (let k = 0; k < 2; k++) {
      const s = 0.5 + c.rnd() * 0.8;
      const p = f.pos.clone().addScaledVector(f.along, (c.rnd() - 0.5) * 3.2).addScaledVector(f.inward, s * 0.35);
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.scale(1, 0.7 + c.rnd() * 0.9, 0.8);
      c.mesh(r, g, c.theme.m.rock, p.x, s * 0.45, p.z, c.rnd() * 6, c.rnd() * 0.4, c.rnd() * 0.4);
    }
  }
}

/** Stalactites over a room (caves). */
export function stalactites(c: DressCtx, r: KRoom, n: number) {
  const H = c.theme.wallH;
  for (let k = 0; k < n; k++) {
    const [i, j] = roomCells(c, r)[Math.floor(c.rnd() * r.rect.w * r.rect.h)];
    const p = c.cell(i, j).add(V((c.rnd() - 0.5) * 3, 0, (c.rnd() - 0.5) * 3));
    const len = 0.6 + c.rnd() * 1.4;
    const g = new THREE.ConeGeometry(0.12 + c.rnd() * 0.18, len, 6);
    g.rotateX(Math.PI);
    c.mesh(r, g, c.theme.m.rock, p.x, H - len / 2, p.z);
  }
}

/** Glowing mushrooms or sea-glass in a corner. */
export function glowCluster(c: DressCtx, r: KRoom, at: THREE.Vector3, n = 5, power = 0.6) {
  for (let k = 0; k < n; k++) {
    const a = c.rnd() * Math.PI * 2, d = c.rnd() * 0.8;
    const h = 0.15 + c.rnd() * 0.35;
    const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
    c.mesh(r, cyl(0.03, 0.04, h, 5), c.theme.m.bone, x, h / 2, z);
    c.mesh(r, new THREE.SphereGeometry(0.09 + c.rnd() * 0.08, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), c.theme.m.glow, x, h, z);
  }
  c.flame(r, at.clone().setY(0.6), 'cold', power);
}

/** Bone niches in the walls with skulls and candles (the ossuary's look). */
function boneNiches(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  for (const f of c.faces(r)) {
    for (const row of [0.9, 1.9, 2.9]) {
      const p = f.pos.clone().addScaledVector(f.inward, 0.02);
      const rot = Math.atan2(f.inward.x, f.inward.z);
      c.mesh(r, box(3.0, 0.7, 0.12), m.dark, p.x, row, p.z, rot);
      for (let k = -2; k <= 2; k++) {
        if (c.rnd() < 0.3) continue;
        const q = p.clone().addScaledVector(f.along, k * 0.6).addScaledVector(f.inward, 0.12);
        c.mesh(r, new THREE.SphereGeometry(0.13, 8, 6), m.bone, q.x, row - 0.18, q.z);
        if (c.rnd() < 0.5) c.mesh(r, cyl(0.03, 0.03, 0.5, 5), m.bone, q.x, row - 0.3, q.z, rot, 0, Math.PI / 2);
      }
    }
    if (c.rnd() < 0.4) {
      const q = f.pos.clone().addScaledVector(f.inward, 0.35);
      c.mesh(r, cyl(0.05, 0.05, 0.25, 6), m.wax, q.x, 0.13, q.z);
      c.flame(r, q.clone().setY(0.38), 'candle', 0.35);
    }
  }
}

function shelves(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  c.faces(r).forEach((f, k) => {
    if (k % 2 && c.rnd() < 0.5) return;
    const p = f.pos.clone().addScaledVector(f.inward, 0.35);
    const rot = Math.atan2(f.inward.x, f.inward.z);
    c.mesh(r, box(2.6, 2.6, 0.5), m.planks, p.x, 1.3, p.z, rot);
    for (const y of [0.55, 1.2, 1.85]) {
      const q = p.clone().addScaledVector(f.inward, 0.12);
      c.mesh(r, box(2.3, 0.4, 0.3), c.rnd() < 0.5 ? m.cloth : m.wood, q.x, y, q.z, rot);
    }
    c.solid(V(p.x, 1.3, p.z), V(f.inward.x ? 0.3 : 1.3, 1.3, f.inward.z ? 0.3 : 1.3));
  });
  // A lectern in the middle.
  const ctr = c.centre(r);
  c.mesh(r, box(0.5, 1.1, 0.5), m.wood, ctr.x, 0.55, ctr.z);
  c.mesh(r, box(0.7, 0.06, 0.5), m.wood, ctr.x, 1.15, ctr.z, 0, 0.3);
  c.mesh(r, cyl(0.05, 0.05, 0.25, 6), m.wax, ctr.x + 0.4, 1.2, ctr.z);
  c.flame(r, V(ctr.x + 0.4, 1.45, ctr.z), 'candle', 0.6);
}

function armourStands(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  const faces = c.faces(r);
  faces.forEach((f, k) => {
    if (k % 2) return;
    const p = f.pos.clone().addScaledVector(f.inward, 0.45);
    const rot = Math.atan2(f.inward.x, f.inward.z);
    // A weapon rack: two uprights, a bar, spears and swords leaning in it.
    for (const s of [-1, 1]) c.mesh(r, box(0.1, 1.6, 0.1), m.wood, p.x + f.along.x * s * 0.9, 0.8, p.z + f.along.z * s * 0.9);
    c.mesh(r, box(2, 0.08, 0.08), m.wood, p.x, 1.3, p.z, rot);
    for (let q = -3; q <= 3; q++) c.mesh(r, cyl(0.02, 0.02, 1.9, 5), m.iron, p.x + f.along.x * q * 0.25, 0.95, p.z + f.along.z * q * 0.25, rot, 0.12, 0);
  });
  // Old armour on stands; one or two are not empty.
  const cells = roomCells(c, r, true);
  for (let k = 0; k < Math.min(2, cells.length); k++) {
    const [i, j] = cells[Math.floor(c.rnd() * cells.length)];
    c.spawn(r, 'armour', c.cell(i, j));
  }
}

function water(c: DressCtx, r: KRoom) {
  c.water(r, 0.45);
  // Broken pillars standing in it.
  pillars(c, r);
  rubble(c, r, 4, c.theme.m.trim);
}

function chapel(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  const ctr = c.centre(r);
  // The roof has come in: a heap of stone and a beam, daylight through the hole.
  c.shaft(r, ctr.clone(), 1.6);
  rubble(c, r, 10, m.trim);
  c.mesh(r, box(0.4, 0.4, 3.6), m.wood, ctr.x + 0.8, 0.3, ctr.z - 0.6, 0.5, 0, 0.15);
  // Pews, some overturned.
  const s = c.size(r);
  for (let k = 0; k < 3; k++) {
    const z = ctr.z - s.d / 2 + 2 + k * 1.6;
    if (Math.abs(z - ctr.z) < 1.2) continue;
    c.mesh(r, box(2, 0.45, 0.5), m.wood, ctr.x - 1.6, 0.35, z, 0, 0, k === 1 ? 1.4 : 0);
  }
  // The broken bell on its side.
  c.mesh(r, new THREE.CylinderGeometry(0.35, 0.75, 1.0, 14, 1, true), m.brass, ctr.x - 0.9, 0.6, ctr.z + 0.9, 0.3, 0, 1.3);
}

function vault(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  const ctr = c.centre(r);
  // A dais (the key or the hoard stands on it) and banners.
  c.mesh(r, box(2.4, 0.3, 2.4), m.trim, ctr.x, 0.15, ctr.z);
  c.mesh(r, box(1.8, 0.3, 1.8), m.trim, ctr.x, 0.45, ctr.z);
  c.faces(r).forEach((f, k) => {
    if (k % 2) return;
    const p = f.pos.clone().addScaledVector(f.inward, 0.08);
    c.mesh(r, box(1.0, 2.2, 0.04), m.cloth, p.x, 2.4, p.z, Math.atan2(f.inward.x, f.inward.z));
  });
  for (const s of [-1, 1]) c.flame(r, ctr.clone().add(V(s * 1.4, 0.9, 0)), 'candle', 0.5);
}

function den(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  rockRim(c, r, 0.7);
  for (const [i, j] of roomCells(c, r, true)) {
    if (c.rnd() < 0.4) continue;
    const p = c.cell(i, j).add(V((c.rnd() - 0.5) * 2, 0, (c.rnd() - 0.5) * 2));
    if (c.rnd() < 0.5) c.mesh(r, box(0.9, 0.9, 0.9), m.planks, p.x, 0.45, p.z, c.rnd());
    else c.mesh(r, cyl(0.38, 0.42, 1, 10), m.wood, p.x, 0.5, p.z);
    c.solid(V(p.x, 0.45, p.z), V(0.45, 0.45, 0.45));
  }
  // Bedrolls and a lantern on a crate.
  const ctr = c.centre(r);
  c.mesh(r, box(0.8, 0.12, 1.9), m.cloth, ctr.x - 1, 0.06, ctr.z);
  c.flame(r, ctr.clone().add(V(0.6, 0.9, 0.4)), 'lantern', 0.8);
  c.mesh(r, box(0.25, 0.3, 0.25), m.brass, ctr.x + 0.6, 0.6, ctr.z + 0.4);
}

function grotto(c: DressCtx, r: KRoom) {
  rockRim(c, r);
  stalactites(c, r, 3 + Math.floor(c.rnd() * 4));
  const cells = roomCells(c, r, true);
  if (cells.length) {
    const [i, j] = cells[Math.floor(c.rnd() * cells.length)];
    glowCluster(c, r, c.cell(i, j).add(V(1.2, 0, 1.2)));
  }
  // Stalagmites.
  for (let k = 0; k < 3 && cells.length; k++) {
    const [i, j] = cells[Math.floor(c.rnd() * cells.length)];
    const p = c.cell(i, j).add(V((c.rnd() - 0.5) * 2.5, 0, (c.rnd() - 0.5) * 2.5));
    const h = 0.8 + c.rnd() * 1.4;
    c.mesh(r, new THREE.ConeGeometry(0.25 + c.rnd() * 0.2, h, 6), c.theme.m.rock, p.x, h / 2, p.z);
    c.solid(V(p.x, h / 2, p.z), V(0.25, h / 2, 0.25));
  }
}

function carvings(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  c.faces(r).forEach((f, k) => {
    if (k % 2) return;
    const p = f.pos.clone().addScaledVector(f.inward, 0.06);
    const rot = Math.atan2(f.inward.x, f.inward.z);
    // A relief of the wheel: a ring and eight rays.
    const ring = new THREE.TorusGeometry(0.7, 0.07, 6, 24);
    c.mesh(r, ring, m.rune, p.x, 2.2, p.z, rot);
    for (let a = 0; a < 8; a++) {
      const g = box(0.05, 0.55, 0.05);
      g.translate(0, 0.42, 0);
      g.rotateZ((a / 8) * Math.PI * 2);
      g.rotateY(rot);
      g.translate(p.x, 2.2, p.z);
      c.mesh(r, g, m.trim, 0, 0, 0);
    }
  });
  c.water(r, 0.2);
  glowCluster(c, r, c.centre(r).add(V(1, 0, 1)), 4, 0.5);
}

function cistern(c: DressCtx, r: KRoom) {
  // A cistern: a channel of dark water across the room under a narrow bridge.
  const m = c.theme.m;
  const ctr = c.centre(r);
  const s = c.size(r);
  const across = s.w >= s.d; // channel runs across the short side
  const len = across ? s.d : s.w;
  const g = box(across ? 1.6 : len - 0.8, 0.05, across ? len - 0.8 : 1.6);
  c.mesh(r, g, m.water, ctr.x, 0.06, ctr.z);
  // Kerbs either side of the channel, the bridge over it.
  for (const k of [-1, 1]) {
    const off = across ? V(k * 1.0, 0.25, 0) : V(0, 0.25, k * 1.0);
    c.mesh(r, box(across ? 0.3 : len - 0.8, 0.5, across ? len - 0.8 : 0.3), m.trim, ctr.x + off.x, off.y, ctr.z + off.z);
  }
  c.mesh(r, box(across ? 2.6 : 1.4, 0.18, across ? 1.4 : 2.6), m.planks, ctr.x, 0.55, ctr.z);
  c.water(r, 0.3, roomCells(c, r).filter(([i, j]) => {
    const p = c.cell(i, j);
    return across ? Math.abs(p.x - ctr.x) < 2.1 : Math.abs(p.z - ctr.z) < 2.1;
  }));
  pillars(c, r);
}

function chasm(c: DressCtx, r: KRoom) {
  // A rope bridge over a crack in the floor (caves).
  const m = c.theme.m;
  const ctr = c.centre(r);
  const s = c.size(r);
  const across = s.w >= s.d;
  const len = across ? s.d : s.w;
  c.mesh(r, box(across ? 1.4 : len, 0.04, across ? len : 1.4), m.dark, ctr.x, 0.02, ctr.z);
  for (let k = -3; k <= 3; k++) {
    const p = across ? V(ctr.x, 0.32, ctr.z + k * 0.4) : V(ctr.x + k * 0.4, 0.32, ctr.z);
    c.mesh(r, box(across ? 2.4 : 0.3, 0.06, across ? 0.3 : 2.4), m.planks, p.x, p.y, p.z);
  }
  for (const k of [-1, 1]) {
    const o = across ? V(0, 0, 0) : V(0, 0, 0);
    void o;
    const p = across ? V(ctr.x + k * 1.25, 0.9, ctr.z) : V(ctr.x, 0.9, ctr.z + k * 1.25);
    c.mesh(r, cyl(0.025, 0.025, 3.2, 4), m.cloth, p.x, p.y, p.z, 0, across ? Math.PI / 2 : 0, across ? 0 : Math.PI / 2);
  }
  rockRim(c, r, 0.6);
  sconces(c, r, 3, 'lantern');
}

/** A landmark at a junction: a statue on a plinth (the map in your head needs it). */
export function statue(c: DressCtx, r: KRoom, at: THREE.Vector3, scale = 1) {
  const m = c.theme.m;
  c.mesh(r, box(1.6 * scale, 0.7, 1.6 * scale), m.trim, at.x, 0.35, at.z);
  c.mesh(r, cyl(0.32 * scale, 0.4 * scale, 1.5 * scale, 10), m.pillar, at.x, 0.7 + 0.75 * scale, at.z);
  c.mesh(r, new THREE.SphereGeometry(0.28 * scale, 10, 8), m.pillar, at.x, 0.7 + 1.7 * scale, at.z);
  c.mesh(r, box(1.1 * scale, 0.25, 0.25), m.pillar, at.x, 0.7 + 1.25 * scale, at.z);
  c.mesh(r, cyl(0.04, 0.04, 2.2 * scale, 5), m.pillar, at.x + 0.45 * scale, 0.7 + 1.0 * scale, at.z + 0.2);
  c.solid(V(at.x, 1.2, at.z), V(0.8 * scale, 1.2, 0.8 * scale));
}

function kingsHall(c: DressCtx, r: KRoom) {
  // The hub: the statue of a crowned king, banners, a double row of pillars.
  const ctr = c.centre(r);
  pillars(c, r);
  statue(c, r, ctr, 1.35);
  for (const s of [-1, 1]) c.flame(r, ctr.clone().add(V(s * 2.2, 1.1, 0)), 'brazier', 1.2);
  sconces(c, r, 2);
}

function floodedHub(c: DressCtx, r: KRoom) {
  // The drowned crypt: shallow water everywhere and a great chain hanging from the dark.
  c.water(r, 0.4);
  pillars(c, r);
  const ctr = c.centre(r);
  const H = c.theme.wallH;
  for (let k = 0; k < 14; k++) {
    const g = new THREE.TorusGeometry(0.16, 0.045, 5, 10);
    c.mesh(r, g, c.theme.m.iron, ctr.x, H - 0.2 - k * 0.24, ctr.z, k % 2 ? Math.PI / 2 : 0);
  }
  c.mesh(r, box(1.2, 0.5, 1.2), c.theme.m.iron, ctr.x, 0.8, ctr.z, 0.4);
  c.solid(V(ctr.x, 0.6, ctr.z), V(0.6, 0.6, 0.6));
  sconces(c, r, 2);
}

function nave(c: DressCtx, r: KRoom) {
  c.water(r, 0.35);
  pillars(c, r, c.theme.m.pillar, 0.5);
  const ctr = c.centre(r);
  c.shaft(r, ctr.clone(), 1.4);
  statue(c, r, ctr, 1.2);
  glowCluster(c, r, ctr.clone().add(V(-3, 0, 2)), 5, 0.8);
  sconces(c, r, 3, 'cold');
}

function sluice(c: DressCtx, r: KRoom) {
  c.water(r, 0.4);
  const ctr = c.centre(r);
  const m = c.theme.m;
  // Sluice gates along one wall, rusted half open.
  c.faces(r).filter((f) => f.dir === 'n').forEach((f, k) => {
    if (k % 2) return;
    const p = f.pos.clone().addScaledVector(f.inward, 0.3);
    c.mesh(r, box(2.2, 2.4, 0.2), m.iron, p.x, 1.6, p.z, Math.atan2(f.inward.x, f.inward.z));
  });
  statue(c, r, ctr, 1.1);
  pillars(c, r);
  sconces(c, r, 2, 'cold');
}

function waterfall(c: DressCtx, r: KRoom) {
  // The cave hub: a waterfall pours down one wall into a pool (the landmark).
  const m = c.theme.m;
  const H = c.theme.wallH;
  const f = c.faces(r).find((q) => q.dir === 'n') ?? c.faces(r)[0];
  const p = f.pos.clone().addScaledVector(f.inward, 0.5);
  const fall = new THREE.PlaneGeometry(2.4, H);
  c.mesh(r, fall, m.water, p.x, H / 2, p.z, Math.atan2(f.inward.x, f.inward.z));
  const pool = p.clone().addScaledVector(f.inward, 1.6);
  c.mesh(r, new THREE.CircleGeometry(2.4, 20), m.water, pool.x, 0.08, pool.z, 0, -Math.PI / 2);
  c.water(r, 0.3, [[f.cell[0], f.cell[1]]]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const s = 0.4 + c.rnd() * 0.4;
    c.mesh(r, new THREE.DodecahedronGeometry(s, 0), m.rock, pool.x + Math.cos(a) * 2.5, s * 0.4, pool.z + Math.sin(a) * 2.5, c.rnd() * 6);
  }
  rockRim(c, r, 0.6);
  stalactites(c, r, 6);
  glowCluster(c, r, pool.clone().add(V(2.6, 0, 1.6)), 6, 0.9);
  sconces(c, r, 3, 'lantern');
}

function camp(c: DressCtx, r: KRoom) {
  // A smugglers' fire: the rest point before Vess.
  const m = c.theme.m;
  const ctr = c.centre(r);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    c.mesh(r, new THREE.DodecahedronGeometry(0.22, 0), m.rock, ctr.x + Math.cos(a) * 0.6, 0.12, ctr.z + Math.sin(a) * 0.6);
  }
  c.flame(r, ctr.clone().setY(0.45), 'brazier', 1.4);
  c.mesh(r, box(0.8, 0.12, 1.9), m.cloth, ctr.x + 1.8, 0.06, ctr.z);
  rockRim(c, r, 0.5);
}

function shrine(c: DressCtx, r: KRoom) {
  // The Sunwheel shrine: the wheel on the wall and a fire bowl (rest here).
  const m = c.theme.m;
  const ctr = c.centre(r);
  if (c.theme.id === 'cave') return camp(c, r);
  const f = c.faces(r).find((q) => q.dir === 'n') ?? c.faces(r)[0];
  const p = f.pos.clone().addScaledVector(f.inward, 0.08);
  const rot = Math.atan2(f.inward.x, f.inward.z);
  c.mesh(r, new THREE.TorusGeometry(0.9, 0.09, 6, 28), m.rune, p.x, 2.4, p.z, rot);
  for (let a = 0; a < 8; a++) {
    const g = box(0.07, 0.7, 0.07);
    g.translate(0, 0.55, 0);
    g.rotateZ((a / 8) * Math.PI * 2);
    g.rotateY(rot);
    g.translate(p.x, 2.4, p.z);
    c.mesh(r, g, m.rune, 0, 0, 0);
  }
  c.mesh(r, cyl(0.55, 0.3, 0.5, 12), m.iron, ctr.x, 0.55, ctr.z);
  c.mesh(r, cyl(0.12, 0.2, 0.3, 8), m.trim, ctr.x, 0.15, ctr.z);
  c.flame(r, ctr.clone().setY(1.0), 'brazier', 1.3);
  c.solid(V(ctr.x, 0.5, ctr.z), V(0.5, 0.5, 0.5));
}

function niche(c: DressCtx, r: KRoom) {
  statue(c, r, c.centre(r), 0.8);
  c.flame(r, c.centre(r).add(V(1, 0.4, 1)), 'candle', 0.5);
}

function tomb(c: DressCtx, r: KRoom) {
  const m = c.theme.m;
  // Sarcophagi along the long axis.
  const s = c.size(r);
  const ctr = c.centre(r);
  const along = s.d >= s.w;
  for (const k of [-1, 1]) {
    const p = along ? V(ctr.x, 0, ctr.z + k * 3.2) : V(ctr.x + k * 3.2, 0, ctr.z);
    c.mesh(r, box(along ? 1.1 : 2.3, 0.9, along ? 2.3 : 1.1), m.trim, p.x, 0.45, p.z);
    c.mesh(r, box(along ? 1.2 : 2.4, 0.15, along ? 2.4 : 1.2), m.pillar, p.x, 0.97, p.z);
    c.solid(V(p.x, 0.5, p.z), V(along ? 0.6 : 1.2, 0.5, along ? 1.2 : 0.6));
  }
  sconces(c, r, 2, c.theme.id === 'drowned' ? 'cold' : 'sconce');
}

function entry(c: DressCtx, r: KRoom) {
  sconces(c, r, 2, c.theme.id === 'cave' ? 'lantern' : c.theme.id === 'drowned' ? 'cold' : 'sconce');
  if (c.theme.id === 'cave') rockRim(c, r, 0.6);
  rubble(c, r, 3);
}

function arena(c: DressCtx, r: KRoom) {
  // Built for its boss (the boss module adds the set pieces); here, light and frame.
  pillars(c, r, c.theme.m.pillar, 0.55);
  sconces(c, r, 2, c.theme.id === 'cave' ? 'lantern' : c.theme.id === 'drowned' ? 'cold' : 'sconce');
  if (c.theme.id === 'cave') {
    rockRim(c, r, 0.5);
    stalactites(c, r, 8);
  }
}

function plain(c: DressCtx, r: KRoom) {
  if (c.theme.id === 'cave') {
    rockRim(c, r, 0.8);
    if (c.rnd() < 0.5) stalactites(c, r, 2);
  } else rubble(c, r, 1 + Math.floor(c.rnd() * 2));
  sconces(c, r, 3, c.theme.id === 'cave' ? 'lantern' : c.theme.id === 'drowned' ? 'cold' : 'sconce');
}

/** Each template's dresser (unknown templates fall back to a plain room). */
export const DRESS: Record<string, (c: DressCtx, r: KRoom) => void> = {
  corridor: plain, tunnel: plain, causeway: (c, r) => { plain(c, r); c.water(r, 0.2); },
  hall: (c, r) => { plain(c, r); pillars(c, r); },
  ossuary: (c, r) => {
    boneNiches(c, r);
    // The dead in the walls stand up as you pass.
    const cells = roomCells(c, r, true);
    for (let k = 0; k < Math.min(2, cells.length); k++) c.spawn(r, 'skeleton', c.cell(...cells[Math.floor(c.rnd() * cells.length)]));
  },
  flooded: (c, r) => { water(c, r); sconces(c, r, 3, c.theme.id === 'drowned' ? 'cold' : 'sconce'); },
  chapel: (c, r) => { chapel(c, r); sconces(c, r, 3); },
  vault, stash: (c, r) => { den(c, r); }, reliquary: (c, r) => { vault(c, r); c.water(r, 0.15); },
  library: (c, r) => { shelves(c, r); },
  armoury: (c, r) => { armourStands(c, r); sconces(c, r, 3); },
  cistern: (c, r) => { cistern(c, r); sconces(c, r, 3, c.theme.id === 'drowned' ? 'cold' : 'sconce'); },
  chasm,
  puzzle: (c, r) => { sconces(c, r, 2, c.theme.id === 'cave' ? 'lantern' : c.theme.id === 'drowned' ? 'cold' : 'sconce'); },
  grotto, den, carvings,
  tidepool: (c, r) => { c.water(r, 0.45); rockRim(c, r, 0.5); glowCluster(c, r, c.centre(r), 7, 0.9); },
  kingsHall, floodedHub, nave, sluice, waterfall,
  shrine, camp, niche, font: (c, r) => { niche(c, r); c.water(r, 0.15); }, gatehouse: (c, r) => sconces(c, r, 1),
  caveGate: (c, r) => { rockRim(c, r, 0.5); sconces(c, r, 2, 'lantern'); },
  entry, caveMouth: entry, seaStair: (c, r) => { entry(c, r); c.water(r, 0.15); },
  stairs: (c, r) => sconces(c, r, 2, c.theme.id === 'cave' ? 'lantern' : c.theme.id === 'drowned' ? 'cold' : 'sconce'),
  chapelArena: arena, landing: arena, basinArena: arena,
  tomb, strongroom: (c, r) => { den(c, r); }, kingsStair: plain, ropeway: plain,
};
