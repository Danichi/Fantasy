import type { Player } from './player/player';
import type { Slot } from './items/itemDefs';
import { ITEMS } from './items/itemDefs';
import type { MapData } from './ui/dungeonMap';
import type { DungeonProgress } from './dungeon/instance';
import type { GuildSaveData } from './guild/adventurerGuild';
import type { DiscoverySave } from './world/discovery';
import { xpToNext } from './progression/progression';
import type { PathsSave } from './paths/paths';

// Browser save (localStorage). Hand-drawn maps have to survive a reload, so
// the whole game state lives here: progression, inventory, loadout, dungeon
// progress and every map you've drawn.

const KEY = 'fantasy-rpg-save-v6';
const LEGACY_KEYS = ['fantasy-rpg-save-v5', 'fantasy-rpg-save-v4', 'fantasy-rpg-save-v3', 'fantasy-rpg-save-v2', 'fantasy-rpg-save-v1'];

/** World state (v6): exploration, flags and time; later phases add horses, ships, factions. */
export interface WorldSave {
  discovery?: DiscoverySave;
  flags: Record<string, boolean | number | string>;
  time?: { hour: number; day: number } | number;
  weather?: { kind?: import('./world/regionDefinitions').WeatherKind; timer?: number };
  /** where the player stood (overworld), so a reload keeps them there */
  pos?: [number, number, number];
  /** side and story quests */
  quests?: import('./quests/questLog').QuestSave;
  /** the player's plot, coop and orchard days */
  farm?: import('./world/farmLife').FarmSave;
  /** mined-out ore nodes and similar landmark state */
  landmarks?: { ore?: number[] };
  /** picked forage nodes (id -> game hour) until they regrow */
  forage?: Record<string, number>;
  /** owned horses and where the active one stands */
  horses?: import('./world/horses').HorseSave;
  /** trophies and unsold catch */
  fishing?: { trophies?: Record<string, number>; held?: Record<string, number> };
}

export interface SaveData {
  v: 6;
  seed: number;
  /** xp is the unspent pool; level is informational (derived from disciplines) */
  prog: {
    level: number; xp: number; gold: number; total?: number;
    /** the origin picked at a new game */
    origin?: string;
    /** saves from before the class skills: only the origin is carried over */
    combat?: { origin?: string } | null;
  };
  /** disciplines and attributes; missing in saves from before XP was a currency */
  paths?: PathsSave;
  items: { id: string; qty: number }[];
  equipped: Partial<Record<Slot, number>>; // slot -> index into items
  quick: (number | null)[];
  moves: (number | string | null)[];
  activeSpell: number | null;
  maps: Record<string, MapData>;
  dungeon: DungeonProgress;
  guild: GuildSaveData;
  world: WorldSave;
}

export function hasSave() {
  try {
    return !!(localStorage.getItem(KEY) || LEGACY_KEYS.some((k) => localStorage.getItem(k)));
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {}
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY) ?? LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (!raw) return null;
    const d = JSON.parse(raw) as any;
    if (d.v === 6) return d as SaveData;
    // Older saves from either line of development: keep what exists, default the rest.
    const defaultGuild: GuildSaveData = { rank: 'D', rep: 0, completed: 0, nextQuestId: 1, active: [], available: [], explored: [] };
    const old = d.prog ?? {};
    return {
      ...d,
      v: 6,
      prog: {
        level: old.level ?? 1,
        xp: old.xp ?? 0,
        gold: old.gold ?? 0,
        combat: old.combat ?? null,
      },
      moves: (d.moves ?? []).map((m: unknown) => (typeof m === 'number' ? m : null)),
      guild: d.guild ?? defaultGuild,
      world: d.world ?? { flags: {} },
    } as SaveData;
  } catch {
    return null;
  }
}

/** The save data for the current game (without writing it). */
export function buildSave(player: Player, seed: number, maps: Record<string, MapData>, dungeon: DungeonProgress, guild: GuildSaveData, world: WorldSave = { flags: {} }): SaveData {
  const eq = player.equip;
  const idx = (uid: number | null | undefined) => (uid == null ? null : eq.items.findIndex((i) => i.uid === uid));
  const equipped: SaveData['equipped'] = {};
  for (const [slot, uid] of Object.entries(eq.equipped)) {
    const k = idx(uid);
    if (k !== null && k >= 0) equipped[slot as Slot] = k;
  }
  const cleanItems = (list: (number | null)[]) => list.map((u) => {
    const k = idx(u);
    return k === null || k < 0 ? null : k;
  });
  const cleanMoves = (list: (number | string | null)[]) => list.map((u) => {
    if (typeof u === 'string') return u;
    const k = idx(u);
    return k === null || k < 0 ? null : k;
  });
  const data: SaveData = {
    v: 6,
    seed,
    prog: {
      level: player.prog.level, xp: player.prog.xp, gold: player.prog.gold, total: player.prog.totalXp, origin: player.prog.origin,
    },
    paths: player.paths.serialize(),
    items: eq.items.map((i) => ({ id: i.def.id, qty: i.qty })),
    equipped,
    quick: cleanItems(eq.quick),
    moves: cleanMoves(eq.moves),
    activeSpell: idx(eq.activeSpell),
    maps,
    dungeon,
    guild,
    world,
  };
  return data;
}

export function writeSave(player: Player, seed: number, maps: Record<string, MapData>, dungeon: DungeonProgress, guild: GuildSaveData, world: WorldSave = { flags: {} }) {
  const data = buildSave(player, seed, maps, dungeon, guild, world);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

/** Rebuild the player's progression and inventory from a save. */
export function applySave(player: Player, d: SaveData) {
  const eq = player.equip;
  const p = player.prog;
  p.gold = d.prog.gold;
  if (d.paths) {
    p.xp = d.prog.xp;
    p.totalXp = d.prog.total ?? d.prog.xp;
    player.paths.load(d.paths);
  } else {
    // Old save: levels were bought automatically. Refund every XP point earned
    // so it can be invested in disciplines instead.
    let refund = d.prog.xp;
    for (let l = 1; l < d.prog.level; l++) refund += xpToNext(l);
    p.xp = refund;
    p.totalXp = refund;
    player.paths.reset();
  }
  const origin = d.prog.origin ?? d.prog.combat?.origin;
  p.origin = origin === 'dragon' || origin === 'demon' ? origin : 'human';
  eq.items = [];
  const uids: number[] = [];
  for (const it of d.items) {
    if (!ITEMS[it.id]) {
      uids.push(-1);
      continue;
    }
    // add() merges stacks; saved stacks are already whole so add them directly.
    const inst = eq.add(it.id, it.qty);
    uids.push(inst.uid);
  }
  const uid = (k: number | null) => (k == null || k < 0 || uids[k] < 0 ? null : uids[k]);
  for (const [slot, k] of Object.entries(d.equipped)) {
    const u = uid(k as number);
    if (u != null) eq.equip(u, slot as Slot);
  }
  eq.quick = d.quick.map(uid);
  const moveRef = (k: number | string | null) => typeof k === 'string' ? k : uid(k);
  eq.moves = d.moves.map(moveRef);
  const sp = uid(d.activeSpell);
  if (sp != null) eq.equip(sp);
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.stamina = player.maxStamina;
}
