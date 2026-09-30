import { mulberry32 } from '../core/math';

// ---------------------------------------------------------------------------
// Labyrinth generator. A seeded perfect maze (recursive backtracker) is cut
// into two regions by a locked gate on the only route to the stairs; loops
// and rooms are then added *within* each region, so the gate can never be
// bypassed. Cells are 0..w-1 by 0..h-1, row 0 is north.
// Walls: hWall[j*w+i] is the north edge of cell (i,j) (j = 0..h),
//        vWall[j*(w+1)+i] is the west edge of cell (i,j) (i = 0..w).
// ---------------------------------------------------------------------------

export type Cell = [number, number];

export interface Spawn {
  cell: Cell;
  kind: 'green' | 'blue' | 'cave' | 'magma' | 'armour' | 'orc';
}

export interface FloorLayout {
  w: number;
  h: number;
  hWall: Uint8Array;
  vWall: Uint8Array;
  entrance: Cell;
  exit: Cell; // stairs down (floor 1) or boss arena centre (floor 2)
  gate: { cell: Cell; dir: 'n' | 's' | 'e' | 'w' } | null;
  key: Cell | null;
  chests: { cell: Cell; loot: string }[];
  spikes: Cell[];
  darts: { plate: Cell; from: Cell }[];
  spawns: Spawn[];
  rooms: { x: number; y: number; w: number; h: number }[];
  torches: { cell: Cell; dir: 'n' | 's' | 'e' | 'w' }[];
  /** region id per cell: 0 before the gate, 1 after */
  region: Uint8Array;
}

const DIRS: ['n' | 's' | 'e' | 'w', number, number][] = [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]];

export class Grid {
  constructor(public w: number, public h: number, public hWall: Uint8Array, public vWall: Uint8Array) {}
  static walled(w: number, h: number) {
    return new Grid(w, h, new Uint8Array(w * (h + 1)).fill(1), new Uint8Array((w + 1) * h).fill(1));
  }
  in(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h;
  }
  /** Is there a wall on side `d` of cell (i,j)? */
  wall(i: number, j: number, d: 'n' | 's' | 'e' | 'w') {
    if (d === 'n') return this.hWall[j * this.w + i] === 1;
    if (d === 's') return this.hWall[(j + 1) * this.w + i] === 1;
    if (d === 'w') return this.vWall[j * (this.w + 1) + i] === 1;
    return this.vWall[j * (this.w + 1) + i + 1] === 1;
  }
  set(i: number, j: number, d: 'n' | 's' | 'e' | 'w', v: 0 | 1) {
    if (d === 'n') this.hWall[j * this.w + i] = v;
    else if (d === 's') this.hWall[(j + 1) * this.w + i] = v;
    else if (d === 'w') this.vWall[j * (this.w + 1) + i] = v;
    else this.vWall[j * (this.w + 1) + i + 1] = v;
  }
  neighbours(i: number, j: number, blocked?: (i: number, j: number, d: 'n' | 's' | 'e' | 'w') => boolean) {
    const out: [number, number, 'n' | 's' | 'e' | 'w'][] = [];
    for (const [d, dx, dy] of DIRS) {
      const ni = i + dx, nj = j + dy;
      if (!this.in(ni, nj) || this.wall(i, j, d)) continue;
      if (blocked?.(i, j, d)) continue;
      out.push([ni, nj, d]);
    }
    return out;
  }
  /** BFS distances from a cell (-1 = unreachable). */
  bfs(start: Cell, blocked?: (i: number, j: number, d: 'n' | 's' | 'e' | 'w') => boolean) {
    const dist = new Int32Array(this.w * this.h).fill(-1);
    const prev = new Int32Array(this.w * this.h).fill(-1);
    const q: number[] = [start[1] * this.w + start[0]];
    dist[q[0]] = 0;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], i = c % this.w, j = (c / this.w) | 0;
      for (const [ni, nj] of this.neighbours(i, j, blocked)) {
        const n = nj * this.w + ni;
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    return { dist, prev };
  }
  openSides(i: number, j: number) {
    return DIRS.filter(([d, dx, dy]) => this.in(i + dx, j + dy) && !this.wall(i, j, d)).length;
  }
}

const opposite = { n: 's', s: 'n', e: 'w', w: 'e' } as const;

export function generateFloor(seed: number, floor: 1 | 2): FloorLayout {
  const rnd = mulberry32(seed * 7919 + floor * 104729);
  const w = floor === 1 ? 15 : 13, h = floor === 1 ? 15 : 13;
  const g = Grid.walled(w, h);
  const entrance: Cell = [Math.floor(w / 2), h - 1];

  // 1. Perfect maze from the entrance.
  const seen = new Uint8Array(w * h);
  const stack: Cell[] = [entrance];
  seen[entrance[1] * w + entrance[0]] = 1;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const opts = DIRS.filter(([, dx, dy]) => g.in(i + dx, j + dy) && !seen[(j + dy) * w + i + dx]);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    // Favour going straight a little: longer corridors feel more like a labyrinth.
    const [d, dx, dy] = opts[Math.floor(rnd() * opts.length)];
    g.set(i, j, d, 0);
    seen[(j + dy) * w + i + dx] = 1;
    stack.push([i + dx, j + dy]);
  }

  // 2. Exit = farthest cell. Floor 2 reserves a boss arena around it.
  let { dist, prev } = g.bfs(entrance);
  let far = 0;
  for (let c = 0; c < w * h; c++) if (dist[c] > dist[far]) far = c;
  let exit: Cell = [far % w, (far / w) | 0];
  const rooms: FloorLayout['rooms'] = [];
  if (floor === 2) {
    // A 4x4 arena on the far side (north), opened up.
    const ax = Math.max(0, Math.min(w - 4, exit[0] - 1)), ay = Math.max(0, Math.min(h - 5, exit[1] - 1));
    for (let j = ay; j < ay + 4; j++) for (let i = ax; i < ax + 4; i++) {
      if (i < ax + 3) g.set(i, j, 'e', 0);
      if (j < ay + 3) g.set(i, j, 's', 0);
    }
    rooms.push({ x: ax, y: ay, w: 4, h: 4 });
    exit = [ax + 2, ay + 2];
    ({ dist, prev } = g.bfs(entrance));
  }

  // 3. Gate on the unique path, ~55% of the way (floor 1 only).
  const path: number[] = [];
  for (let c = exit[1] * w + exit[0]; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  let gate: FloorLayout['gate'] = null;
  const region = new Uint8Array(w * h);
  if (floor === 1 && path.length > 6) {
    const k = Math.floor(path.length * 0.55);
    const a = path[k], b = path[k + 1];
    const ai = a % w, aj = (a / w) | 0, bi = b % w, bj = (b / w) | 0;
    const d = bi > ai ? 'e' : bi < ai ? 'w' : bj > aj ? 's' : 'n';
    gate = { cell: [ai, aj], dir: d };
    const blocked = (i: number, j: number, dd: string) =>
      (i === ai && j === aj && dd === d) || (i === bi && j === bj && dd === opposite[d as 'n']);
    const before = g.bfs(entrance, blocked).dist;
    for (let c = 0; c < w * h; c++) region[c] = before[c] >= 0 ? 0 : 1;
  }
  const same = (i1: number, j1: number, i2: number, j2: number) => region[j1 * w + i1] === region[j2 * w + i2];

  // 4. Loops: knock through some walls between cells of the same region.
  const loopChance = floor === 1 ? 0.18 : 0.22;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      for (const [d, dx, dy] of DIRS.slice(1, 3)) {
        const ni = i + dx, nj = j + dy;
        if (!g.in(ni, nj) || !g.wall(i, j, d) || !same(i, j, ni, nj)) continue;
        if (rnd() < loopChance) g.set(i, j, d, 0);
      }
    }
  }

  // 5. Small rooms (2x2 / 3x2), each entirely inside one region.
  const nRooms = floor === 1 ? 5 : 4;
  for (let tries = 0; rooms.length < nRooms + (floor === 2 ? 1 : 0) && tries < 60; tries++) {
    const rw = 2 + Math.floor(rnd() * 2), rh = 2;
    const rx = Math.floor(rnd() * (w - rw)), ry = Math.floor(rnd() * (h - rh - 1));
    if (rooms.some((r) => rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y)) continue;
    let ok = true;
    for (let j = ry; j < ry + rh && ok; j++) for (let i = rx; i < rx + rw; i++) if (!same(i, j, rx, ry) || (i === entrance[0] && j === entrance[1])) ok = false;
    if (!ok) continue;
    for (let j = ry; j < ry + rh; j++) for (let i = rx; i < rx + rw; i++) {
      if (i < rx + rw - 1) g.set(i, j, 'e', 0);
      if (j < ry + rh - 1) g.set(i, j, 's', 0);
    }
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }
  // 5b. Open the layout into broader avenues. The old recursive maze remains
  // deterministic, but several safe same-region walls are removed to create
  // readable rooms and intersections instead of constant 90-degree turns.
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const degree = g.openSides(i, j);
      if (degree >= 3) continue;
      for (const [d, dx, dy] of DIRS.slice(2, 4)) {
        const ni = i + dx, nj = j + dy;
        if (!g.in(ni, nj) || !g.wall(i, j, d) || !same(i, j, ni, nj)) continue;
        if (rnd() < 0.34) g.set(i, j, d, 0);
      }
    }
  }

  // Keep the gate shut in the wall data (it's a door in an open edge, handled by the kit).

  // 6. Dead ends: key (farthest in region 0), chests.
  const blockedGate = gate
    ? (i: number, j: number, d: string) => {
        const [gi, gj] = gate!.cell;
        const dx = gate!.dir === 'e' ? 1 : gate!.dir === 'w' ? -1 : 0, dy = gate!.dir === 's' ? 1 : gate!.dir === 'n' ? -1 : 0;
        return (i === gi && j === gj && d === gate!.dir) || (i === gi + dx && j === gj + dy && d === opposite[gate!.dir]);
      }
    : undefined;
  const d0 = g.bfs(entrance, blockedGate).dist;
  const inRoom = (i: number, j: number) => rooms.some((r) => i >= r.x && i < r.x + r.w && j >= r.y && j < r.y + r.h);
  const deadEnds: Cell[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (g.openSides(i, j) === 1 && !(i === entrance[0] && j === entrance[1]) && !(i === exit[0] && j === exit[1]) && !inRoom(i, j)) deadEnds.push([i, j]);
  }
  let key: Cell | null = null;
  if (gate) {
    let best = -1;
    for (const c of deadEnds) {
      const dd = d0[c[1] * w + c[0]];
      if (region[c[1] * w + c[0]] === 0 && dd > best) {
        best = dd;
        key = c;
      }
    }
  }
  const taken = new Set<string>([`${entrance}`, `${exit}`, `${key}`]);
  if (gate) taken.add(`${gate.cell}`);
  const lootPool = floor === 1 ? ['gold', 'healthPotion', 'manaPotion', 'gold', 'ringVigor', 'healthPotion'] : ['gold', 'knightSword', 'kiteShield', 'ringSage', 'luckyCharm', 'healthPotion'];
  const chests: FloorLayout['chests'] = [];
  if (key) chests.push({ cell: key, loot: 'cryptKey' });
  const shuffled = deadEnds.filter((c) => !taken.has(`${c}`)).sort(() => rnd() - 0.5);
  for (const c of shuffled.slice(0, floor === 1 ? 4 : 4)) {
    chests.push({ cell: c, loot: lootPool[Math.floor(rnd() * lootPool.length)] });
    taken.add(`${c}`);
  }

  // 7. Traps in corridors (two open sides, straight).
  const straight = (i: number, j: number) =>
    (!g.wall(i, j, 'n') && !g.wall(i, j, 's') && g.wall(i, j, 'e') && g.wall(i, j, 'w')) ||
    (!g.wall(i, j, 'e') && !g.wall(i, j, 'w') && g.wall(i, j, 'n') && g.wall(i, j, 's'));
  const corridors: Cell[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const de = d0[j * w + i];
    if (straight(i, j) && !taken.has(`${[i, j]}`) && !(de >= 0 && de < 3)) corridors.push([i, j]);
  }
  corridors.sort(() => rnd() - 0.5);
  const spikes: Cell[] = corridors.slice(0, floor === 1 ? 5 : 7);
  spikes.forEach((c) => taken.add(`${c}`));
  // Darts: a plate cell with a wall two cells away along a straight run.
  const darts: FloorLayout['darts'] = [];
  for (const c of corridors.slice(8)) {
    if (darts.length >= (floor === 1 ? 2 : 3)) break;
    const [i, j] = c;
    const ns = !g.wall(i, j, 'n') && !g.wall(i, j, 's');
    const [dx, dy] = ns ? [0, -1] : [1, 0];
    let k = 1;
    while (g.in(i + dx * k, j + dy * k) && !g.wall(i + dx * (k - 1), j + dy * (k - 1), ns ? 'n' : 'e') && k < 4) k++;
    if (k >= 3) {
      darts.push({ plate: c, from: [i + dx * (k - 1), j + dy * (k - 1)] });
      taken.add(`${c}`);
    }
  }

  // 8. Enemies: rooms get groups, corridors get singles; none near the entrance.
  const spawns: Spawn[] = [];
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const mobs: Spawn['kind'][] = floor === 1 ? ['green', 'green', 'cave', 'armour'] : ['cave', 'blue', 'armour', 'armour', 'magma'];
  for (const r of rooms) {
    if (floor === 2 && r === rooms[0]) {
      spawns.push({ cell: exit, kind: 'orc' });
      continue;
    }
    for (let k = 0; k < 2; k++) spawns.push({ cell: [r.x + (k % r.w), r.y + ((k + 1) % r.h)], kind: pick(mobs) });
  }
  const open: Cell[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const de = d0[j * w + i];
    if ((de < 0 || de > 4) && !taken.has(`${[i, j]}`) && !inRoom(i, j)) open.push([i, j]);
  }
  open.sort(() => rnd() - 0.5);
  for (const c of open.slice(0, floor === 1 ? 7 : 9)) spawns.push({ cell: c, kind: pick(mobs) });

  // 9. Torches on walls, roughly every few cells.
  const torches: FloorLayout['torches'] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (rnd() > 0.3) continue;
    const walls = DIRS.filter(([d]) => g.wall(i, j, d)).map(([d]) => d);
    if (walls.length) torches.push({ cell: [i, j], dir: walls[Math.floor(rnd() * walls.length)] });
  }
  torches.push({ cell: entrance, dir: 'e' }, { cell: entrance, dir: 'w' });

  return { w, h, hWall: g.hWall, vWall: g.vWall, entrance, exit, gate, key, chests, spikes, darts, spawns, rooms, torches, region };
}
