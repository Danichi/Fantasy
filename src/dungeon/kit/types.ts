import type * as THREE from 'three';

// ---------------------------------------------------------------------------
// The dungeon kit's shared vocabulary (docs/design/dungeons.md §3).
//
// A dungeon floor is a grid of 4 m cells tiled completely by rooms. Every
// room has a purpose and a look (its template); rooms meet at doors, and a
// door can be plain, locked, sealed by a mechanism, one-way (a shortcut) or
// hidden (a secret). The floor plan is authored (where the hub, the gate, the
// antechamber and the boss arena are) and the wings are generated from a seed.
// ---------------------------------------------------------------------------

export type Dir = 'n' | 's' | 'e' | 'w';
export const DV: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const OPP: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };

export type Cell = [number, number];

/** A rectangle of cells (x, y = top-left cell; y grows south). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a room is for, in the grammar (entry, hub, wings, gate, antechamber, boss, reward). */
export type RoomRole = 'entry' | 'hub' | 'wing' | 'alcove' | 'passage' | 'ante' | 'stairs' | 'boss' | 'reward' | 'return';

export type WingId = 'A' | 'B' | 'C';

/**
 * How a door behaves:
 *   open      an archway, always passable
 *   locked    a portcullis that needs a key item
 *   sealed    a stone door opened by a mechanism (a lever, a puzzle) elsewhere
 *   shortcut  one-way: barred on the far side until you open it from there
 *   secret    a cracked or false wall until found
 *   arena     a boss arena's door: open, but it drops shut while the boss fights
 *   reward    opens when the boss dies
 */
export type DoorKind = 'open' | 'locked' | 'sealed' | 'shortcut' | 'secret' | 'arena' | 'reward';

export type PuzzleKind = 'dial' | 'mirrors' | 'weights' | 'bells' | 'lever';
export type SecretKind = 'cracked' | 'false' | 'lever' | 'tile';
export type TrapKind = 'darts' | 'portcullis' | 'blade' | 'collapse' | 'gas' | 'boulder';

/** One zone of an authored floor plan: a fixed room, or a wing to be generated. */
export interface ZoneDef {
  id: string;
  rect: Rect;
  role: RoomRole;
  /** fixed rooms: the template; wings pick theirs from the dungeon's pool */
  template?: string;
  /** a name for the map and the toasts ("the Hall of the Old Kings") */
  name?: string;
  wing?: WingId;
  /** wings: the zones the wing's entrance may open onto */
  attach?: string[];
  /** wings: how you get in from the attach zone ('secret' for the hidden wing) */
  entryKind?: 'open' | 'secret';
}

/** An authored connection between two fixed zones. */
export interface LinkDef {
  a: string;
  b: string;
  kind: DoorKind;
  /** doors with state have a stable id (saved progress) */
  id?: string;
  /** locked: the key item; sealed: the mechanism ids that open it */
  key?: string;
  mech?: string[];
  /** shortcut: the zone it opens from */
  from?: string;
  /** the cell on `a`'s side and the edge toward `b` (default: the middle of the shared wall) */
  at?: [number, number, Dir];
}

/** An authored floor: the fixed rooms, the wings and how they join. */
export interface FloorPlan {
  floor: number;
  name: string;
  w: number;
  h: number;
  zones: ZoneDef[];
  links: LinkDef[];
  /** where you arrive (the cell), and the wall the way out is in */
  entrance: Cell;
  exitWall: Dir;
  /** the key that opens this floor's locked door, hidden in wing A's deepest room */
  key?: string;
  /** the mechanism wing B holds (its id is what sealed doors list in `mech`) */
  mechanism?: { id: string; kind: PuzzleKind };
  /** stairs down from this floor: the zone they're in */
  stairsDown?: string;
  /** the boss's arena zone and its reward room */
  boss?: string;
  /** templates the generated wings draw from */
  pool: string[];
  /** room tiers for chests (depth into the dungeon) */
  lootTier: number;
}

/** A room of a generated floor. */
export interface KRoom {
  id: number;
  zone: string;
  rect: Rect;
  role: RoomRole;
  template: string;
  name: string;
  wing?: WingId;
  /** steps from the wing's entrance (wings), 0 otherwise */
  depth: number;
  /** what the grammar put here: 'key', 'mech', 'clue', 'treasure', 'deadEnd', 'shortcut' */
  tags: Set<string>;
}

/** A door: the edge on side `dir` of `cell` (which lies in room `a`), into room `b`. */
export interface KDoor {
  id: string;
  a: number;
  b: number;
  cell: Cell;
  dir: Dir;
  kind: DoorKind;
  key?: string;
  mech?: string[];
  /** shortcut: the room it can be opened from */
  from?: number;
  /** secret: how it is hidden */
  secret?: SecretKind;
}

/** A trap or secret placed by the grammar (built and run by traps.ts / secrets.ts). */
export interface KTrap {
  id: string;
  kind: TrapKind;
  room: number;
  cell: Cell;
  /** blades and boulders run along this axis */
  dir?: Dir;
  /** darts: the wall cell the darts fly from */
  from?: Cell;
}

export interface KChest {
  id: string;
  room: number;
  cell: Cell;
  tier: 0 | 1 | 2 | 3;
  /** a fixed item (the key, a named reward) instead of a rolled one */
  item?: string;
  /** hidden under a loose tile (a 'tile' secret) */
  hidden?: boolean;
}

/** A generated floor: rooms, doors, walls and what's in them. */
export interface FloorGraph {
  plan: FloorPlan;
  seed: number;
  w: number;
  h: number;
  rooms: KRoom[];
  doors: KDoor[];
  /** room id per cell */
  roomAt: Int16Array;
  /** wall edges, as generator.ts's Grid: hWall[j*w+i] north edge of (i,j), vWall[j*(w+1)+i] west edge */
  hWall: Uint8Array;
  vWall: Uint8Array;
  entrance: Cell;
  /** the stairs down (a floor with stairs) or the boss arena's centre */
  exit: Cell;
  /** the cell the key lies in */
  keyCell: Cell | null;
  traps: KTrap[];
  chests: KChest[];
  /** the puzzle's room, and the room with its clue */
  mechRoom: number | null;
  clueRoom: number | null;
}

/** Per dungeon, saved: what's been seen, opened, found, solved and beaten. */
export interface KitProgress {
  seed: number;
  /** room ids seen, per floor */
  seen: Record<string, number[]>;
  /** opened doors (shortcuts, secrets, sealed doors, locked doors) by id */
  doors: string[];
  /** solved puzzles and pulled levers (mechanism ids) */
  mech: string[];
  /** found secrets by id */
  secrets: string[];
  chests: string[];
  /** disarmed traps */
  traps: string[];
  boss: boolean;
  /** the shrine you last rested at: floor and room */
  shrine: { floor: number; room: number } | null;
  /** Master Delver's once-per-dungeon lock break has been used */
  masterUsed: boolean;
  /** landmarks visited (first-visit deeds) */
  visited: string[];
}

export function freshProgress(seed: number): KitProgress {
  return { seed, seen: {}, doors: [], mech: [], secrets: [], chests: [], traps: [], boss: false, shrine: null, masterUsed: false, visited: [] };
}

/** Anything you can press E at. */
export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: () => string;
  enabled: () => boolean;
  action: () => void;
}
