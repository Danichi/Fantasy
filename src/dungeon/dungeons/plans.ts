import type { FloorPlan, LinkDef, PuzzleKind, ZoneDef } from '../kit/types';

// ---------------------------------------------------------------------------
// The authored floor plans of this update's dungeons (docs/design/dungeons.md
// §5). Two shapes, each in the grammar's terms:
//
//   a gated floor (stairs down):         a boss floor:
//   +-----+---------------+------+      +---+-------------+------+
//   |  C  |  antechamber  |stairs|      | C |  boss arena | tomb |
//   |     +---+-------+---+------+      |   +---+-------+-+------+
//   |     |al |  gate |al |      |      |   |al | ante  | return |
//   +-----+---+-------+---+  B   |      +---+---+-------+--+-----+
//   |  A  |      hub      |      |      | A |    hub       |  B  |
//   |     +---------------+      |      |   +--------------+     |
//   |     |     entry     |      |      |   |    entry     |     |
//   +-----+---------------+------+      +---+--------------+-----+
//
// The hub, the gate, the antechamber and the boss are authored; the wings
// (A holds the key, B the mechanism, C is hidden) are generated from the seed.
// Plain data: the grammar test reads these without building anything.
// ---------------------------------------------------------------------------

interface Names {
  hub: [string, string];
  entry: [string, string];
  ante: [string, string];
  /** the gate passage (gated floors) */
  gate?: [string, string];
  alcove?: [string, string];
  stairs?: [string, string];
  boss?: [string, string];
  reward?: [string, string];
  ret?: [string, string];
}

/** Mirror a plan east-west (the same grammar, a different-feeling floor). */
function mirror(p: FloorPlan): FloorPlan {
  const flip = { e: 'w', w: 'e', n: 'n', s: 's' } as const;
  return {
    ...p,
    zones: p.zones.map((z) => ({ ...z, rect: { ...z.rect, x: p.w - z.rect.x - z.rect.w } })),
    links: p.links.map((l) => (l.at ? { ...l, at: [p.w - 1 - l.at[0], l.at[1], flip[l.at[2]]] as LinkDef['at'] } : l)),
    entrance: [p.w - 1 - p.entrance[0], p.entrance[1]],
  };
}

/**
 * A floor with stairs down behind a two-part gate: a portcullis that wants the
 * key from wing A, then a sealed door that wants wing B's mechanism.
 */
function gatedFloor(o: {
  floor: number; name: string; key: string; mech: { id: string; kind: PuzzleKind }; pool: string[]; tier: number;
  n: Names; t: { hub: string; entry: string; ante: string; gate: string; alcove: string; stairs: string }; mirrored?: boolean;
}): FloorPlan {
  const z = (id: string, x: number, y: number, w: number, h: number, role: ZoneDef['role'], template?: string, name?: string, extra: Partial<ZoneDef> = {}): ZoneDef =>
    ({ id, rect: { x, y, w, h }, role, template, name, ...extra });
  const p: FloorPlan = {
    floor: o.floor, name: o.name, w: 14, h: 12,
    zones: [
      z('C', 0, 0, 4, 4, 'wing', undefined, undefined, { wing: 'C', attach: ['A', 'al1'], entryKind: 'secret' }),
      z('ante', 4, 0, 6, 3, 'ante', o.t.ante, o.n.ante[0]),
      z('stairs', 10, 0, 4, 3, 'stairs', o.t.stairs, o.n.stairs?.[0]),
      z('al1', 4, 3, 2, 2, 'alcove', o.t.alcove, o.n.alcove?.[0]),
      z('gate', 6, 3, 2, 2, 'passage', o.t.gate, o.n.gate?.[0]),
      z('al2', 8, 3, 2, 2, 'alcove', o.t.alcove, o.n.alcove?.[1]),
      z('B', 10, 3, 4, 9, 'wing', undefined, undefined, { wing: 'B', attach: ['hub'] }),
      z('A', 0, 4, 4, 8, 'wing', undefined, undefined, { wing: 'A', attach: ['hub'] }),
      z('hub', 4, 5, 6, 5, 'hub', o.t.hub, o.n.hub[0]),
      z('entry', 4, 10, 6, 2, 'entry', o.t.entry, o.n.entry[0]),
    ],
    links: [
      { a: 'entry', b: 'hub', kind: 'open' },
      { a: 'hub', b: 'al1', kind: 'open' },
      { a: 'hub', b: 'al2', kind: 'open' },
      { a: 'hub', b: 'gate', kind: 'locked', id: `f${o.floor}-portcullis`, key: o.key },
      { a: 'gate', b: 'ante', kind: 'sealed', id: `f${o.floor}-seal`, mech: [o.mech.id] },
      { a: 'ante', b: 'stairs', kind: 'open' },
    ],
    entrance: [6, 11],
    exitWall: 's',
    key: o.key,
    mechanism: o.mech,
    stairsDown: 'stairs',
    pool: o.pool,
    lootTier: o.tier,
  };
  return o.mirrored ? mirror(p) : p;
}

/**
 * A boss floor: the hub opens (through a gate) on an antechamber with a rest
 * shrine and the boss's arena; beyond the boss, the reward room and a one-way
 * stair back down to the hub.
 */
function bossFloor(o: {
  floor: number; name: string; gate: LinkDef; key?: string; mech?: { id: string; kind: PuzzleKind }; pool: string[]; tier: number;
  n: Names; t: { hub: string; entry: string; ante: string; alcove: string; boss: string; reward: string; ret: string }; mirrored?: boolean;
  /** the alcove sits in the gate's path (the gate is two doors: hub -> alcove -> antechamber) */
  alcoveGate?: LinkDef;
}): FloorPlan {
  const z = (id: string, x: number, y: number, w: number, h: number, role: ZoneDef['role'], template?: string, name?: string, extra: Partial<ZoneDef> = {}): ZoneDef =>
    ({ id, rect: { x, y, w, h }, role, template, name, ...extra });
  const p: FloorPlan = {
    floor: o.floor, name: o.name, w: 15, h: 13,
    zones: [
      z('C', 0, 0, 3, 7, 'wing', undefined, undefined, { wing: 'C', attach: o.alcoveGate ? ['A'] : ['A', 'al'], entryKind: 'secret' }),
      z('boss', 3, 0, 9, 5, 'boss', o.t.boss, o.n.boss?.[0]),
      z('reward', 12, 0, 3, 5, 'reward', o.t.reward, o.n.reward?.[0]),
      z('al', 3, 5, 2, 2, 'alcove', o.t.alcove, o.n.alcove?.[0]),
      z('ante', 5, 5, 5, 2, 'ante', o.t.ante, o.n.ante[0]),
      z('ret', 10, 5, 5, 2, 'return', o.t.ret, o.n.ret?.[0]),
      z('A', 0, 7, 4, 6, 'wing', undefined, undefined, { wing: 'A', attach: ['hub'] }),
      z('hub', 4, 7, 7, 4, 'hub', o.t.hub, o.n.hub[0]),
      z('B', 11, 7, 4, 6, 'wing', undefined, undefined, { wing: 'B', attach: ['hub'] }),
      z('entry', 4, 11, 7, 2, 'entry', o.t.entry, o.n.entry[0]),
    ],
    links: [
      { a: 'entry', b: 'hub', kind: 'open' },
      ...(o.alcoveGate ? [o.gate, o.alcoveGate] : [{ a: 'hub', b: 'al', kind: 'open' } as LinkDef, o.gate]),
      { a: 'ante', b: 'boss', kind: 'arena', id: `f${o.floor}-arena` },
      { a: 'boss', b: 'reward', kind: 'reward', id: `f${o.floor}-reward` },
      { a: 'reward', b: 'ret', kind: 'open' },
      { a: 'ret', b: 'hub', kind: 'shortcut', id: `f${o.floor}-return`, from: 'ret' },
    ],
    entrance: [7, 12],
    exitWall: 's',
    key: o.key,
    mechanism: o.mech,
    boss: 'boss',
    pool: o.pool,
    lootTier: o.tier,
  };
  return o.mirrored ? mirror(p) : p;
}

// ---- The Crypt of Elder Glen ---------------------------------------------------------------

const CRYPT_POOL = ['hall', 'ossuary', 'flooded', 'chapel', 'library', 'armoury', 'cistern'];

export const CRYPT_PLANS: FloorPlan[] = [
  gatedFloor({
    floor: 1, name: 'B1F · UPPER CRYPT', key: 'cryptKey', mech: { id: 'crypt-dial', kind: 'dial' }, pool: CRYPT_POOL, tier: 0,
    n: { hub: ['the Hall of the Old Kings', ''], entry: ['the crypt stair', ''], ante: ['the Sunwheel shrine', ''], gate: ['the portcullis', ''], alcove: ['the west niche', 'the east niche'], stairs: ['the stair down', ''] },
    t: { hub: 'kingsHall', entry: 'entry', ante: 'shrine', gate: 'gatehouse', alcove: 'niche', stairs: 'stairs' },
  }),
  bossFloor({
    floor: 2, name: 'B2F · LOWER CRYPT', pool: CRYPT_POOL, tier: 1, mech: { id: 'crypt-bells', kind: 'bells' },
    gate: { a: 'hub', b: 'ante', kind: 'sealed', id: 'f2-chapel-door', mech: ['crypt-bells'] },
    n: { hub: ['the drowned crypt', ''], entry: ['the foot of the stair', ''], ante: ['the vestry', ''], alcove: ['the bone niche', ''], boss: ['the Chapel of the Old Kings', ''], reward: ["the old kings' tomb", ''], ret: ["the kings' stair", ''] },
    t: { hub: 'floodedHub', entry: 'entry', ante: 'shrine', alcove: 'niche', boss: 'chapelArena', reward: 'tomb', ret: 'kingsStair' },
  }),
];

// ---- Hollow Ridge Caves --------------------------------------------------------------------

const CAVE_POOL = ['grotto', 'den', 'chasm', 'grotto', 'den'];

export const CAVE_PLANS: FloorPlan[] = [
  bossFloor({
    floor: 1, name: 'HOLLOW RIDGE CAVES', pool: CAVE_POOL, tier: 1, key: 'smugglersKey', mech: { id: 'caves-weights', kind: 'weights' }, mirrored: true,
    gate: { a: 'hub', b: 'al', kind: 'sealed', id: 'hr-winch-door', mech: ['caves-weights'] },
    alcoveGate: { a: 'al', b: 'ante', kind: 'locked', id: 'hr-gate', key: 'smugglersKey' },
    n: { hub: ['the waterfall cavern', ''], entry: ['the cave mouth', ''], ante: ["the smugglers' fire", ''], alcove: ['the gatehouse', ''], boss: ["Vess's landing", ''], reward: ["Vess's strongroom", ''], ret: ['the rope ladder', ''] },
    t: { hub: 'waterfall', entry: 'caveMouth', ante: 'camp', alcove: 'caveGate', boss: 'landing', reward: 'strongroom', ret: 'ropeway' },
  }),
];

// ---- The Drowned Shrine --------------------------------------------------------------------

const SHRINE_POOL = ['tidepool', 'carvings', 'flooded', 'cistern', 'tidepool', 'hall'];

export const SHRINE_PLANS: FloorPlan[] = [
  gatedFloor({
    floor: 1, name: 'B1F · THE FLOODED NAVE', key: 'tideKey', mech: { id: 'shrine-mirrors', kind: 'mirrors' }, pool: SHRINE_POOL, tier: 1, mirrored: true,
    n: { hub: ['the flooded nave', ''], entry: ['the sea stair', ''], ante: ['the dry chapel', ''], gate: ['the tide gate', ''], alcove: ['the north font', 'the south font'], stairs: ['the stair into the deep', ''] },
    t: { hub: 'nave', entry: 'seaStair', ante: 'shrine', gate: 'gatehouse', alcove: 'font', stairs: 'stairs' },
  }),
  bossFloor({
    floor: 2, name: "B2F · THE WARDEN'S BASIN", pool: SHRINE_POOL, tier: 2, mech: { id: 'shrine-lever', kind: 'lever' },
    gate: { a: 'hub', b: 'ante', kind: 'sealed', id: 'ds-basin-door', mech: ['shrine-lever'] },
    n: { hub: ['the sluice hall', ''], entry: ['the foot of the stair', ''], ante: ['the last dry step', ''], alcove: ['the font', ''], boss: ["the Warden's basin", ''], reward: ['the wheel-cutters\' reliquary', ''], ret: ['the sluice stair', ''] },
    t: { hub: 'sluice', entry: 'seaStair', ante: 'shrine', alcove: 'font', boss: 'basinArena', reward: 'tomb', ret: 'kingsStair' },
  }),
];

// ---- the kit's test dungeon (every room type, for screenshots and the grammar test) -------

export const TEST_PLANS: FloorPlan[] = [
  gatedFloor({
    floor: 1, name: 'KIT TEST · GATED', key: 'cryptKey', mech: { id: 'test-dial', kind: 'dial' }, pool: [...CRYPT_POOL], tier: 0,
    n: { hub: ['the test hub', ''], entry: ['the test entry', ''], ante: ['the test shrine', ''] },
    t: { hub: 'kingsHall', entry: 'entry', ante: 'shrine', gate: 'gatehouse', alcove: 'niche', stairs: 'stairs' },
  }),
  bossFloor({
    floor: 2, name: 'KIT TEST · BOSS', pool: [...CRYPT_POOL], tier: 1, mech: { id: 'test-weights', kind: 'weights' },
    gate: { a: 'hub', b: 'ante', kind: 'sealed', id: 'test-door', mech: ['test-weights'] },
    n: { hub: ['the test hub', ''], entry: ['the test entry', ''], ante: ['the test shrine', ''] },
    t: { hub: 'floodedHub', entry: 'entry', ante: 'shrine', alcove: 'niche', boss: 'chapelArena', reward: 'tomb', ret: 'kingsStair' },
  }),
];
