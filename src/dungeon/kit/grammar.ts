import { mulberry32 } from '../../core/math';
import { Grid } from '../generator';
import {
  DV, OPP, type Cell, type Dir, type DoorKind, type FloorGraph, type FloorPlan, type KChest, type KDoor, type KRoom, type KTrap,
  type Rect, type SecretKind, type TrapKind, type WingId,
} from './types';

// ---------------------------------------------------------------------------
// The dungeon grammar (docs/design/dungeons.md §3): an authored floor plan
// (entry, hub, gate, antechamber, boss) with generated wings, laid out on a
// grid of 4 m cells that the rooms tile completely.
//
//   entry -> hub -+-> wing A -> (key) ------------+
//                 +-> wing B -> (lever / puzzle) -+-> gate -> antechamber -> boss -> reward
//                 +-> wing C (hidden, secrets)        ^                               |
//                                                     +------ shortcut to the hub <---+
//
// Wings are split from their zone with a seeded BSP into 3 to 6 rooms (some of
// them one-cell corridors), joined as a chain with the odd loop. Wing A's
// deepest room holds the key, wing B's the mechanism, wing C hides behind a
// secret. A wing whose far end touches the hub gets a one-way door back.
// validateFloor() checks a graph keeps every promise above.
// ---------------------------------------------------------------------------

/** Room templates the grammar knows: smallest footprint (cells) and whether it's a passage. */
export const TEMPLATE_INFO: Record<string, { min: [number, number]; name: string; corridor?: boolean; maxArea?: number }> = {
  corridor: { min: [1, 2], name: 'a passage', corridor: true },
  hall: { min: [2, 2], name: 'a hall' },
  ossuary: { min: [2, 2], name: 'the ossuary' },
  flooded: { min: [2, 2], name: 'the flooded hall' },
  chapel: { min: [2, 3], name: 'the collapsed chapel' },
  vault: { min: [2, 2], name: 'the vault' },
  library: { min: [2, 2], name: 'the scriptorium' },
  armoury: { min: [2, 2], name: 'the armoury' },
  cistern: { min: [2, 3], name: 'the cistern' },
  puzzle: { min: [2, 2], name: 'the puzzle chamber' },
  // caves
  tunnel: { min: [1, 2], name: 'a tunnel', corridor: true },
  grotto: { min: [2, 2], name: 'a grotto' },
  den: { min: [2, 2], name: "the smugglers' den" },
  chasm: { min: [2, 3], name: 'the rope bridge' },
  stash: { min: [2, 2], name: 'the stash' },
  // the drowned shrine
  causeway: { min: [1, 2], name: 'a drowned passage', corridor: true },
  tidepool: { min: [2, 2], name: 'the tide pool' },
  reliquary: { min: [2, 2], name: 'the reliquary' },
  carvings: { min: [2, 2], name: 'the hall of carvings' },
};

const CORRIDOR_OF: Record<string, string> = { crypt: 'corridor', cave: 'tunnel', drowned: 'causeway' };
const VAULT_OF: Record<string, string> = { crypt: 'vault', cave: 'stash', drowned: 'reliquary' };

/** Every cell pair across the shared wall of two rects: [cell in a, edge dir toward b]. */
export function sharedEdges(a: Rect, b: Rect): [number, number, Dir][] {
  const out: [number, number, Dir][] = [];
  // b east of a
  if (a.x + a.w === b.x) for (let j = Math.max(a.y, b.y); j < Math.min(a.y + a.h, b.y + b.h); j++) out.push([a.x + a.w - 1, j, 'e']);
  if (b.x + b.w === a.x) for (let j = Math.max(a.y, b.y); j < Math.min(a.y + a.h, b.y + b.h); j++) out.push([a.x, j, 'w']);
  if (a.y + a.h === b.y) for (let i = Math.max(a.x, b.x); i < Math.min(a.x + a.w, b.x + b.w); i++) out.push([i, a.y + a.h - 1, 's']);
  if (b.y + b.h === a.y) for (let i = Math.max(a.x, b.x); i < Math.min(a.x + a.w, b.x + b.w); i++) out.push([i, a.y, 'n']);
  return out;
}

const fits = (r: Rect, t: string) => {
  const info = TEMPLATE_INFO[t];
  if (!info) return false;
  const lo = Math.min(r.w, r.h), hi = Math.max(r.w, r.h);
  if (info.corridor) return lo === 1 && hi >= info.min[1];
  return lo >= info.min[0] && hi >= info.min[1];
};

/** Split a wing's zone into 3 to 6 rooms (fewer for a small zone), some of them one-cell corridors. */
export function splitWing(zone: Rect, rnd: () => number, allowCorridors = true): Rect[] {
  const area = zone.w * zone.h;
  const lo = area < 14 ? 2 : 3, hi = area < 14 ? 4 : 6;
  for (let attempt = 0; attempt < 40; attempt++) {
    const out: Rect[] = [];
    const go = (q: Rect) => {
      const a = q.w * q.h;
      const thin = Math.min(q.w, q.h) === 1;
      if (thin || a <= 4 || (a <= 9 && rnd() < 0.5)) return void out.push(q);
      const horiz = q.w === q.h ? rnd() < 0.5 : q.w > q.h; // cut across the longer side
      const L = horiz ? q.w : q.h, T = horiz ? q.h : q.w;
      const cuts: number[] = [];
      for (let c = 1; c < L; c++) {
        const p1 = c, p2 = L - c;
        const ok = (n: number) => n >= 2 || (allowCorridors && n === 1 && T >= 3 && rnd() < 0.45);
        if (ok(p1) && ok(p2)) cuts.push(c);
      }
      if (!cuts.length) return void out.push(q);
      const c = cuts[Math.floor(rnd() * cuts.length)];
      if (horiz) {
        go({ x: q.x, y: q.y, w: c, h: q.h });
        go({ x: q.x + c, y: q.y, w: q.w - c, h: q.h });
      } else {
        go({ x: q.x, y: q.y, w: q.w, h: c });
        go({ x: q.x, y: q.y + c, w: q.w, h: q.h - c });
      }
    };
    go(zone);
    if (out.length >= lo && out.length <= hi) return out;
  }
  // A plain fallback: equal slices along the long side.
  const n = Math.max(lo, Math.min(hi, Math.floor(Math.max(zone.w, zone.h) / 2)));
  const out: Rect[] = [];
  const horiz = zone.w >= zone.h, L = horiz ? zone.w : zone.h;
  let s = 0;
  for (let k = 0; k < n; k++) {
    const e = Math.round(((k + 1) * L) / n);
    out.push(horiz ? { x: zone.x + s, y: zone.y, w: e - s, h: zone.h } : { x: zone.x, y: zone.y + s, w: zone.w, h: e - s });
    s = e;
  }
  return out;
}

/** The middle of a list (authored doors sit in the middle of their wall). */
const middle = <T,>(a: T[]) => a[Math.floor((a.length - 1) / 2)];

export interface GrammarOpts {
  /** the dungeon's theme (picks corridor templates) */
  theme: 'crypt' | 'cave' | 'drowned';
  /** traps this dungeon uses */
  traps: TrapKind[];
}

/** Build one floor from its plan and a seed. */
export function buildFloor(plan: FloorPlan, seed: number, opts: GrammarOpts): FloorGraph {
  const rnd = mulberry32((seed * 7919 + plan.floor * 104729) >>> 0);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const { w, h } = plan;
  const rooms: KRoom[] = [];
  const roomAt = new Int16Array(w * h).fill(-1);
  const zoneRooms = new Map<string, KRoom[]>();
  const corridorT = CORRIDOR_OF[opts.theme];

  // 1. Rooms: fixed zones as they are, wings split by BSP.
  for (const z of plan.zones) {
    const rects = z.role === 'wing' ? splitWing(z.rect, rnd) : [z.rect];
    const list: KRoom[] = [];
    for (const r of rects) {
      const room: KRoom = {
        id: rooms.length, zone: z.id, rect: r, role: z.role, template: z.template ?? 'hall',
        name: z.name ?? '', wing: z.wing, depth: 0, tags: new Set(),
      };
      rooms.push(room);
      list.push(room);
      for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) {
        if (i < 0 || j < 0 || i >= w || j >= h) throw new Error(`zone ${z.id} leaves the floor`);
        if (roomAt[j * w + i] >= 0) throw new Error(`zones overlap at ${i},${j}`);
        roomAt[j * w + i] = room.id;
      }
    }
    zoneRooms.set(z.id, list);
  }
  if (roomAt.some((v) => v < 0)) throw new Error(`floor ${plan.floor}: zones leave gaps`);

  // 2. Doors.
  const doors: KDoor[] = [];
  const used = new Set<string>();
  const edgeKey = (i: number, j: number, d: Dir) => {
    const [dx, dy] = DV[d];
    return d === 'n' || d === 'w' ? `${i},${j},${d}` : `${i + dx},${j + dy},${OPP[d]}`;
  };
  const addDoor = (a: KRoom, b: KRoom, kind: DoorKind, at: [number, number, Dir] | null, extra: Partial<KDoor> = {}) => {
    let e = at;
    if (!e) {
      const opts2 = sharedEdges(a.rect, b.rect).filter(([i, j, d]) => !used.has(edgeKey(i, j, d)));
      if (!opts2.length) return null;
      e = kind === 'open' && a.role === 'wing' && b.role === 'wing' ? pick(opts2) : (a.role !== 'wing' && b.role !== 'wing' ? middle(opts2) : pick(opts2));
    }
    used.add(edgeKey(e[0], e[1], e[2]));
    const door: KDoor = { ...extra, id: extra.id ?? `d${plan.floor}-${doors.length}`, a: a.id, b: b.id, cell: [e[0], e[1]], dir: e[2], kind };
    doors.push(door);
    return door;
  };
  const adjacent = (a: KRoom, b: KRoom) => sharedEdges(a.rect, b.rect).length > 0;
  const zoneRoom = (id: string) => {
    const l = zoneRooms.get(id);
    if (!l?.length) throw new Error(`no zone ${id}`);
    return l[0];
  };
  // Authored links between fixed zones.
  for (const L of plan.links) {
    const a = zoneRoom(L.a), b = zoneRoom(L.b);
    if (!adjacent(a, b)) throw new Error(`link ${L.a}-${L.b}: zones don't touch`);
    addDoor(a, b, L.kind, L.at ?? null, { id: L.id, key: L.key, mech: L.mech, from: L.from ? zoneRoom(L.from).id : undefined });
  }
  // Wings: the entrance, a chain through the rooms, the odd loop, a shortcut home.
  const wings = plan.zones.filter((z) => z.role === 'wing');
  for (const z of wings) {
    const list = zoneRooms.get(z.id)!;
    const attach = (z.attach ?? []).flatMap((id) => zoneRooms.get(id) ?? []);
    const entries: [KRoom, KRoom][] = [];
    for (const r of list) for (const t of attach) if (adjacent(r, t)) entries.push([r, t]);
    if (!entries.length) throw new Error(`wing ${z.id} touches none of its attach zones`);
    // Prefer an entrance near the attach zone's middle (a wing reads as a branch off the hub).
    const [first, into] = pick(entries);
    const secret: SecretKind | undefined = z.entryKind === 'secret' ? pick<SecretKind>(['cracked', 'false', 'lever']) : undefined;
    addDoor(into, first, secret ? 'secret' : 'open', null, { secret, id: secret ? `s${plan.floor}-${z.id}` : undefined });
    // Depth-first chain from the entrance room.
    const seen = new Set<number>([first.id]);
    first.depth = 0;
    const stack = [first];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const next = list.filter((r) => !seen.has(r.id) && adjacent(cur, r));
      if (!next.length) {
        stack.pop();
        continue;
      }
      const n = pick(next);
      addDoor(cur, n, 'open', null);
      n.depth = cur.depth + 1;
      seen.add(n.id);
      stack.push(n);
    }
    // One loop now and then (two rooms that touch but aren't joined).
    if (rnd() < 0.4) {
      const pairs: [KRoom, KRoom][] = [];
      for (const a of list) for (const b of list) {
        if (a.id >= b.id || !adjacent(a, b)) continue;
        if (doors.some((d) => (d.a === a.id && d.b === b.id) || (d.a === b.id && d.b === a.id))) continue;
        pairs.push([a, b]);
      }
      if (pairs.length) {
        const [a, b] = pick(pairs);
        addDoor(a, b, 'open', null);
      }
    }
    // The shortcut: the deepest room that also touches the hub or the entry hall.
    if (z.entryKind !== 'secret') {
      const home = plan.zones.filter((q) => q.role === 'hub' || q.role === 'entry').flatMap((q) => zoneRooms.get(q.id) ?? []);
      const cands = list.filter((r) => r !== first && r.depth >= 2 && home.some((t) => adjacent(r, t)));
      cands.sort((a, b) => b.depth - a.depth);
      const r = cands[0];
      if (r) {
        const t = home.find((q) => adjacent(r, q))!;
        const d = addDoor(r, t, 'shortcut', null, { id: `sc${plan.floor}-${z.id}`, from: r.id });
        if (d) r.tags.add('shortcut');
      }
    }
  }

  // 3. Walls: everything closed, then each room opened inside and each door cut through.
  const g = Grid.walled(w, h);
  for (const r of rooms) {
    for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) {
      if (i < r.rect.x + r.rect.w - 1) g.set(i, j, 'e', 0);
      if (j < r.rect.y + r.rect.h - 1) g.set(i, j, 's', 0);
    }
  }
  for (const d of doors) g.set(d.cell[0], d.cell[1], d.dir, 0);

  // 4. What's where: the key, the mechanism and its clue, the treasure.
  const wingRooms = (id: WingId) => rooms.filter((r) => r.wing === id);
  const deepest = (l: KRoom[]) => [...l].sort((a, b) => b.depth - a.depth || b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
  const centre = (r: KRoom): Cell => [r.rect.x + Math.floor(r.rect.w / 2), r.rect.y + Math.floor(r.rect.h / 2)];
  let keyCell: Cell | null = null;
  let mechRoom: number | null = null, clueRoom: number | null = null;
  const A = wingRooms('A'), B = wingRooms('B'), C = wingRooms('C');
  if (plan.key && A.length) {
    const r = deepest(A);
    r.tags.add('key');
    keyCell = centre(r);
  }
  if (plan.mechanism && B.length) {
    const r = deepest(B);
    r.tags.add('mech');
    mechRoom = r.id;
    // The clue is elsewhere on this side of the gate: a big room in wing A or B.
    const cl = [...A, ...B].filter((q) => !q.tags.has('key') && !q.tags.has('mech') && Math.min(q.rect.w, q.rect.h) >= 2);
    if (cl.length) {
      const c = pick(cl);
      c.tags.add('clue');
      clueRoom = c.id;
    }
  }
  if (C.length) deepest(C).tags.add('treasure');
  const degree = (r: KRoom) => doors.filter((d) => d.a === r.id || d.b === r.id).length;
  for (const r of rooms) if (r.role === 'wing' && degree(r) === 1) r.tags.add('deadEnd');

  // 5. Templates for the wing rooms, from the dungeon's pool.
  for (const r of rooms) {
    if (r.role !== 'wing') continue;
    if (Math.min(r.rect.w, r.rect.h) === 1) r.template = corridorT;
    else if (r.tags.has('key') || r.tags.has('treasure')) r.template = VAULT_OF[opts.theme];
    else if (r.tags.has('mech')) r.template = 'puzzle';
    else if (r.tags.has('clue') && plan.mechanism) r.template = plan.mechanism.kind === 'bells' ? (fits(r.rect, 'chapel') ? 'chapel' : 'library') : pickClue(opts.theme);
    else {
      const sibs = rooms.filter((q) => q.zone === r.zone && q !== r).map((q) => q.template);
      const pool = plan.pool.filter((t) => fits(r.rect, t) && !TEMPLATE_INFO[t].corridor);
      const fresh = pool.filter((t) => !sibs.includes(t));
      r.template = (fresh.length ? pick(fresh) : pool.length ? pick(pool) : 'hall');
    }
    if (!fits(r.rect, r.template) && !TEMPLATE_INFO[r.template]?.corridor) {
      const pool = plan.pool.filter((t) => fits(r.rect, t));
      r.template = pool.length ? pool[0] : 'hall';
    }
    if (!r.name) r.name = TEMPLATE_INFO[r.template]?.name ?? 'a room';
  }

  // 6. Traps: in passages and plain wing rooms, never where the key or puzzle is.
  const doorCells = new Set<string>();
  for (const d of doors) {
    const [dx, dy] = DV[d.dir];
    doorCells.add(`${d.cell}`);
    doorCells.add(`${d.cell[0] + dx},${d.cell[1] + dy}`);
  }
  const traps: KTrap[] = [];
  const trapCells = new Set<string>();
  const trapRooms = rooms.filter((r) => r.role === 'wing' && !r.tags.has('key') && !r.tags.has('mech') && !r.tags.has('treasure'));
  for (const wing of ['A', 'B', 'C'] as WingId[]) {
    const list = trapRooms.filter((r) => r.wing === wing);
    const n = Math.min(list.length, wing === 'C' ? 1 : 2);
    const order = [...list].sort(() => rnd() - 0.5);
    for (const r of order.slice(0, n)) {
      const corridor = Math.min(r.rect.w, r.rect.h) === 1;
      const long = Math.max(r.rect.w, r.rect.h);
      const kinds = opts.traps.filter((k) => (k === 'boulder' ? corridor && long >= 3 : k === 'blade' ? corridor : k === 'collapse' || k === 'portcullis' ? !corridor : true));
      if (!kinds.length) continue;
      const kind = pick(kinds);
      const cells: Cell[] = [];
      for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) {
        if (kind !== 'blade' && kind !== 'boulder' && doorCells.has(`${i},${j}`)) continue;
        cells.push([i, j]);
      }
      if (!cells.length) continue;
      const along: Dir = r.rect.w >= r.rect.h ? 'e' : 's';
      const c = kind === 'boulder' ? (along === 'e' ? [r.rect.x + r.rect.w - 1, r.rect.y] as Cell : [r.rect.x, r.rect.y + r.rect.h - 1] as Cell) : kind === 'blade' ? [r.rect.x + Math.floor(r.rect.w / 2), r.rect.y + Math.floor(r.rect.h / 2)] as Cell : pick(cells);
      if (trapCells.has(`${c}`)) continue;
      trapCells.add(`${c}`);
      const t: KTrap = { id: `t${plan.floor}-${traps.length}`, kind, room: r.id, cell: c, dir: along };
      if (kind === 'darts') {
        // The darts fly along the room's long axis from whichever end wall is further away.
        const horiz = r.rect.w >= r.rect.h;
        const lo: Cell = horiz ? [r.rect.x, c[1]] : [c[0], r.rect.y];
        const hi: Cell = horiz ? [r.rect.x + r.rect.w - 1, c[1]] : [c[0], r.rect.y + r.rect.h - 1];
        const dist = (q: Cell) => Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]);
        t.from = dist(lo) >= dist(hi) ? lo : hi;
        if (dist(t.from) < 2) t.kind = 'gas'; // too short a run for darts to mean anything
      }
      traps.push(t);
    }
  }

  // 7. Chests: dead ends, the treasure room, a loose tile somewhere, and the key.
  const chests: KChest[] = [];
  const chestCell = (r: KRoom): Cell => {
    // Against the wall away from the room's first door.
    const d = doors.find((q) => q.a === r.id || q.b === r.id);
    if (!d) return centre(r);
    const dc: Cell = d.a === r.id ? d.cell : [d.cell[0] + DV[d.dir][0], d.cell[1] + DV[d.dir][1]];
    const far: Cell = [r.rect.x + (dc[0] - r.rect.x < r.rect.w / 2 ? r.rect.w - 1 : 0), r.rect.y + (dc[1] - r.rect.y < r.rect.h / 2 ? r.rect.h - 1 : 0)];
    return trapCells.has(`${far}`) ? centre(r) : far;
  };
  const tier = Math.max(0, Math.min(3, plan.lootTier)) as KChest['tier'];
  for (const r of rooms) {
    if (r.tags.has('treasure')) chests.push({ id: `c${plan.floor}-${r.id}`, room: r.id, cell: chestCell(r), tier: Math.min(3, tier + 1) as KChest['tier'] });
    else if (r.tags.has('deadEnd') && !r.tags.has('key') && !r.tags.has('mech') && rnd() < 0.8) chests.push({ id: `c${plan.floor}-${r.id}`, room: r.id, cell: chestCell(r), tier });
  }
  // A loose tile in wing C or a plain wing room hides a small cache.
  const tileRooms = rooms.filter((r) => r.role === 'wing' && Math.min(r.rect.w, r.rect.h) >= 2 && !r.tags.has('key') && !r.tags.has('mech') && !chests.some((c) => c.room === r.id));
  if (tileRooms.length) {
    const r = C.find((q) => tileRooms.includes(q)) ?? pick(tileRooms);
    const c = centre(r);
    if (!trapCells.has(`${c}`)) chests.push({ id: `c${plan.floor}-tile`, room: r.id, cell: c, tier, hidden: true });
  }

  // 8. Where you leave this floor: the stairs down, or the boss arena.
  const exitZone = plan.stairsDown ?? plan.boss;
  const exit: Cell = exitZone ? centre(zoneRoom(exitZone)) : plan.entrance;
  return { plan, seed, w, h, rooms, doors, roomAt, hWall: g.hWall, vWall: g.vWall, entrance: plan.entrance, exit, keyCell, traps, chests, mechRoom, clueRoom };
}

function pickClue(theme: GrammarOpts['theme']) {
  return theme === 'cave' ? 'grotto' : theme === 'drowned' ? 'carvings' : 'library';
}

/**
 * Rooms reachable from the entrance through the doors `pass` lets through.
 * `pass(d, from)` is asked for each door as you'd walk through it from room `from`.
 */
export function reachableRooms(fg: FloorGraph, pass: (d: KDoor, from: number) => boolean) {
  const start = fg.roomAt[fg.entrance[1] * fg.w + fg.entrance[0]];
  const seen = new Set<number>([start]);
  const q = [start];
  while (q.length) {
    const r = q.shift()!;
    for (const d of fg.doors) {
      const other = d.a === r ? d.b : d.b === r ? d.a : -1;
      if (other < 0 || seen.has(other) || !pass(d, r)) continue;
      seen.add(other);
      q.push(other);
    }
  }
  return seen;
}

/** Everything wrong with a floor (an empty list is a good floor). */
export function validateFloor(fg: FloorGraph): string[] {
  const out: string[] = [];
  const plain = (d: KDoor) => d.kind === 'open' || d.kind === 'arena';
  /** a shortcut is barred from the home side until it's opened from the far side */
  const oneWay = (d: KDoor, from: number) => d.kind === 'shortcut' && d.from === from;
  const all = reachableRooms(fg, () => true);
  if (all.size !== fg.rooms.length) out.push(`only ${all.size} of ${fg.rooms.length} rooms reachable`);
  // Every cell is reachable through open walls (the rooms tile the floor).
  const grid = new Grid(fg.w, fg.h, fg.hWall, fg.vWall);
  const dist = grid.bfs(fg.entrance).dist;
  if (Array.from(dist).some((d) => d < 0)) out.push('some cells are walled off');
  // Before any gate: the key and the mechanism can be reached (no secrets, no shortcuts needed).
  const before = reachableRooms(fg, plain);
  const keyRoom = fg.rooms.find((r) => r.tags.has('key'));
  if (fg.plan.key && !keyRoom) out.push('no key room');
  if (keyRoom && !before.has(keyRoom.id)) out.push('the key is behind a gate');
  if (fg.mechRoom !== null && !before.has(fg.mechRoom)) out.push('the mechanism is behind a gate');
  if (fg.clueRoom !== null && !before.has(fg.clueRoom)) out.push('the clue is behind a gate');
  const exitRoom = fg.roomAt[fg.exit[1] * fg.w + fg.exit[0]];
  const gates = fg.doors.filter((d) => d.kind === 'locked' || d.kind === 'sealed');
  // ...not even through a secret or by sneaking through a shortcut the wrong way.
  const sneaky = reachableRooms(fg, (d, from) => plain(d) || d.kind === 'secret' || oneWay(d, from));
  if (gates.length && sneaky.has(exitRoom)) out.push('the way on can be reached without passing the gate');
  // With the key: the locked door opens, and with the mechanism too, the way on.
  const withAll = reachableRooms(fg, (d, from) => plain(d) || d.kind === 'locked' || d.kind === 'sealed' || oneWay(d, from));
  if (!withAll.has(exitRoom)) out.push('the way on is unreachable with the key and the mechanism');
  for (const d of gates) if (d.kind === 'locked' && d.key !== fg.plan.key) out.push(`door ${d.id} wants a key this floor doesn't hide`);
  for (const d of gates) if (d.kind === 'sealed' && (d.mech ?? []).some((m) => m !== fg.plan.mechanism?.id && !m.startsWith('boss'))) out.push(`door ${d.id} wants a mechanism this floor doesn't have`);
  // Shortcuts open back to the hub (or the entry hall), from a room you can reach the long way.
  const home = new Set(fg.rooms.filter((r) => r.role === 'hub' || r.role === 'entry').map((r) => r.id));
  const longWay = reachableRooms(fg, (d) => d.kind !== 'shortcut' && d.kind !== 'secret');
  for (const d of fg.doors.filter((q) => q.kind === 'shortcut')) {
    const other = d.from === d.a ? d.b : d.a;
    if (!home.has(other)) out.push(`shortcut ${d.id} doesn't lead home`);
    if (d.from === undefined || !longWay.has(d.from)) out.push(`shortcut ${d.id} can't be reached the long way`);
  }
  if (fg.plan.boss) {
    const reward = fg.rooms.find((r) => r.role === 'reward' || r.role === 'return');
    const sc = fg.doors.find((d) => d.kind === 'shortcut' && d.from !== undefined && fg.rooms[d.from].role !== 'wing');
    if (!reward || !sc) out.push('no shortcut from beyond the boss back to the hub');
  }
  // Each wing is 3 to 6 rooms (2 to 4 for a small zone).
  for (const z of fg.plan.zones.filter((q) => q.role === 'wing')) {
    const n = fg.rooms.filter((r) => r.zone === z.id).length;
    const small = z.rect.w * z.rect.h < 14;
    if (n < (small ? 2 : 3) || n > (small ? 4 : 6)) out.push(`wing ${z.id} has ${n} rooms`);
  }
  return out;
}

/** The old crypt's layout shape (tests and the hand-drawn map read these). */
export function layoutOf(fg: FloorGraph) {
  const locked = fg.doors.find((d) => d.kind === 'locked') ?? fg.doors.find((d) => d.kind === 'sealed') ?? null;
  return {
    w: fg.w,
    h: fg.h,
    hWall: fg.hWall,
    vWall: fg.vWall,
    entrance: fg.entrance,
    exit: fg.exit,
    gate: locked ? { cell: locked.cell, dir: locked.dir } : null,
    key: fg.keyCell,
  };
}
