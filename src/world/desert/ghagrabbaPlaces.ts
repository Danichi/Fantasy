import { SUNSPIRE, SUNSPIRE_HALF, SUNSPIRE_GATE_Z, SCAV_CAMPS, WEST_GATE, SUNKEN_GATE, sunspireY } from './desertLayout';
import { cellWorld, cellTop, isStreet, streetCells, cityDoors, doorFront, worldCell, GRID_NX, GRID_NZ } from './cityGrid';
import { heightAt } from '../terrainHeight';

// Where Ghagrabba's stories happen: squares and doors from the street map,
// and the landmarks out in the dunes the quests send you to. Pure data, so
// the quest definitions can point their markers here without loading a thing.

export type XZ = [number, number];
const cw = (i: number, j: number): XZ => cellWorld(i, j);

/** The Court of the Sun (the obelisk forecourt before the palace). */
export const COURT_CENTER = cw(199, 110);
/** The Great Well: on the court's north side, clear of the throne dais. */
export const GREAT_WELL = cw(205, 100);
/** The Sun Disc shrine where the priests hold the dawn and dusk rites. */
export const SUN_SHRINE = cw(194, 116);
/** The bazaar square (the city's most open square away from the court), and the artisans' square. */
export const BAZAAR = cw(215, 64);
export const ARTISANS = cw(86, 71);
/** The long east-west avenue south of the bazaar, and the main street gate to gate. */
export const AVENUE_J = 90;
export const MAIN_STREET_J = 127;
/** Outside the east gate, on the caravan road. */
export const EAST_GATE: XZ = [SUNSPIRE.x + SUNSPIRE_HALF.x + 26, SUNSPIRE_GATE_Z];
/** Just outside the west gate, on the sand. */
export const WEST_GATE_OUT: XZ = [WEST_GATE.x0 - 22, WEST_GATE.z];

export const camp = (k: number): XZ => [SCAV_CAMPS[k][0], SCAV_CAMPS[k][1]];
export const RUST_MARKET = camp(0), GLASSWIND = camp(1), BONE_WELLS = camp(2), SALTREACH = camp(3), HULKS = camp(4), WAYSTOP = camp(5);
export const DUNEWATCH = camp(6), MIRAGE_WELL = camp(9), GNASHERS_DEN = camp(12), TARP_ROW = camp(13), OLD_OASIS = camp(15), KETTLE_ROCK = camp(17);

/** The Vizier's dig shaft at the Bone Wells. */
export const DIG_SHAFT: XZ = [BONE_WELLS[0] + 9, BONE_WELLS[1] - 7];
/** Where the Prince is held at Saltreach. */
export const SETHI_CAPTIVE: XZ = [SALTREACH[0] + 8, SALTREACH[1] - 6];
/** The Glass Spire: a tower of lightning glass on the pans between the city and Sawtooth's basin. */
export const GLASS_SPIRE: XZ = [-5300, 1250];
/** The Sunken Gate. */
export const SUNKEN: XZ = [SUNKEN_GATE.x, SUNKEN_GATE.z];
/** Where the missing Sun Guard patrol fell, south of the Caravan Way. */
export const PATROL_REMAINS: XZ = [-4380, 820];
/** Khepri the falcon's perch: a wrecked skiff's mast north-east of the city. */
export const FALCON_PERCH: XZ = [-4950, 300];
/** Star-stones Princess Nefret wants read (the court obelisk is the first). */
export const STAR_STONES: XZ[] = [cw(212, 108), [-6900, 900], [-4500, 1150]];
/** Old Amaunet's stelae, half-buried across the Expanse (the Scribe's lost pages). */
export const STELAE: XZ[] = [[-7600, 1100], [-6600, 400], [-4200, 900], [-5600, 1600]];
/** The west wall's watch braziers, outside the gate. */
export const WATCH_BRAZIERS: XZ[] = [-11, -4, 4, 11].map((dz) => [WEST_GATE.x0 - 6, WEST_GATE.z + dz] as XZ);

/** The ground underfoot: the city's paving inside the walls (as the street props sit), the terrain outside. */
export function cityGround(x: number, z: number) {
  const [i, j] = worldCell(x, z);
  const t = cellTop(i, j);
  return t >= 0 && t <= 1.5 ? sunspireY() + Math.max(0, t) : heightAt(x, z);
}

/** A shop door's street cell (by keeper id), for scripted scenes at the door. */
export function shopDoor(keeper: string) {
  const d = cityDoors().find((x) => x.keeper === keeper);
  return d ? { at: doorFront(d, -1.5) as XZ, door: d } : null;
}

/** The Thirsty Scarab (the first tavern): where Ubaid keeps his dice table. */
export function tavernDoor(n = 0) {
  const d = cityDoors().filter((x) => x.kind === 'tavern')[n];
  return d ? { at: doorFront(d, -2.2) as XZ, door: d } : null;
}

/** Three homes near the artisans' square with fever in them (Meritites' rounds). */
export function sickHouses(): XZ[] {
  const homes = cityDoors().filter((d) => d.kind === 'home');
  const [ax, az] = ARTISANS;
  return homes
    .map((d) => ({ d, k: Math.hypot(d.x - ax, d.z - az) }))
    .filter((h) => h.k > 14)
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((h) => doorFront(h.d, -0.9) as XZ);
}

// ---- walking the streets ------------------------------------------------------------------------------

/** A* over the street cells (8-way, no corner cutting): a path of world points, or null. */
export function streetPath(from: XZ, to: XZ): XZ[] | null {
  const snap = (p: XZ) => {
    const [i, j] = worldCell(p[0], p[1]);
    if (isStreet(i, j)) return [i, j];
    for (let r = 1; r < 8; r++) for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (isStreet(i + a, j + b)) return [i + a, j + b];
    return null;
  };
  const s = snap(from), g = snap(to);
  if (!s || !g) return null;
  const N = GRID_NX * GRID_NZ;
  const G = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const idx = (i: number, j: number) => j * GRID_NX + i;
  const h = (i: number, j: number) => Math.hypot(i - g[0], j - g[1]);
  // A small binary heap of [f, index].
  const heap: [number, number][] = [];
  const push = (f: number, n: number) => {
    heap.push([f, n]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const start = idx(s[0], s[1]), goal = idx(g[0], g[1]);
  G[start] = 0;
  push(h(s[0], s[1]), start);
  while (heap.length) {
    const [, n] = pop();
    if (n === goal) break;
    if (closed[n]) continue;
    closed[n] = 1;
    const i = n % GRID_NX, j = (n - i) / GRID_NX;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      if (!a && !b) continue;
      const ni = i + a, nj = j + b;
      if (!isStreet(ni, nj)) continue;
      if (a && b && (!isStreet(i + a, j) || !isStreet(i, j + b))) continue;
      // Keep off the walls: cells hard against a building cost a little more.
      const edge = isStreet(ni + 1, nj) && isStreet(ni - 1, nj) && isStreet(ni, nj + 1) && isStreet(ni, nj - 1) ? 0 : 0.6;
      const m = idx(ni, nj), c = G[n] + (a && b ? 1.414 : 1) + edge;
      if (c < G[m]) {
        G[m] = c;
        came[m] = n;
        push(c + h(ni, nj), m);
      }
    }
  }
  if (came[goal] < 0 && goal !== start) return null;
  const cells: number[] = [];
  for (let n = goal; n >= 0; n = came[n]) {
    cells.push(n);
    if (n === start) break;
  }
  cells.reverse();
  // Thin the path: keep a point every few cells and at every turn.
  const out: XZ[] = [];
  let lastDir = '';
  cells.forEach((n, k) => {
    const i = n % GRID_NX, j = (n - i) / GRID_NX;
    const nx = cells[k + 1];
    const dir = nx === undefined ? 'end' : `${(nx % GRID_NX) - i},${Math.floor(nx / GRID_NX) - j}`;
    if (k === 0 || dir !== lastDir || k % 4 === 0 || nx === undefined) out.push(cw(i, j));
    lastDir = dir;
  });
  return out;
}

/** Total length of a path in metres. */
export function pathLength(p: XZ[]) {
  let L = 0;
  for (let k = 1; k < p.length; k++) L += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
  return L;
}

/** The point and heading `s` metres along a path (clamped to its ends). */
export function along(p: XZ[], s: number): { x: number; z: number; yaw: number } {
  let rest = Math.max(0, s);
  for (let k = 1; k < p.length; k++) {
    const dx = p[k][0] - p[k - 1][0], dz = p[k][1] - p[k - 1][1];
    const L = Math.hypot(dx, dz);
    if (rest <= L || k === p.length - 1) {
      const t = L > 0 ? Math.min(1, rest / L) : 0;
      return { x: p[k - 1][0] + dx * t, z: p[k - 1][1] + dz * t, yaw: Math.atan2(dx, dz) };
    }
    rest -= L;
  }
  return { x: p[0][0], z: p[0][1], yaw: 0 };
}

/** A street cell far from a point (for someone running away). */
export function farStreet(from: XZ, min: number, max: number, seed: number): XZ {
  const cells = streetCells();
  let r = seed;
  for (let k = 0; k < 200; k++) {
    r = (r * 16807) % 2147483647;
    const c = cells[r % cells.length];
    const p = cw(c.i, c.j);
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (d > min && d < max && c.open > 12) return p;
  }
  return from;
}
