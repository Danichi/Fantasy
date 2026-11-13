import { SANDBOX_MODE, SANDBOX_SAVE_KEY } from './sandbox/mode';
import type { Player } from './player/player';
import type { Slot } from './items/itemDefs';
import { ITEMS } from './items/itemDefs';
import type { MapData } from './ui/dungeonMap';
import type { DungeonProgress } from './dungeon/instance';
import type { MineProgress } from './dungeon/mine';
import type { GuildSaveData } from './guild/adventurerGuild';
import type { DiscoverySave } from './world/discovery';
import { xpToNext, normalizeOrigin } from './progression/progression';
import { cleanLook, type OriginLook } from './origins/data';
import { cleanLegacy, type LegacySave } from './origins/legacy';
import type { PathsSave } from './paths/paths';

// Browser save (localStorage). Hand-drawn maps have to survive a reload, so
// the whole game state lives here: progression, inventory, loadout, dungeon
// progress and every map you've drawn.

const KEY = SANDBOX_MODE ? SANDBOX_SAVE_KEY : 'fantasy-rpg-save-v6';
const LEGACY_KEYS = SANDBOX_MODE ? [] : ['fantasy-rpg-save-v5', 'fantasy-rpg-save-v4', 'fantasy-rpg-save-v3', 'fantasy-rpg-save-v2', 'fantasy-rpg-save-v1'];

/** World state (v6): exploration, flags and time; later phases add horses, ships, factions. */
export interface WorldSave {
  /** herbalism: known recipes, identified reagent properties, practice, running elixirs and oils */
  herbalism?: import('./herbalism/herbalism').HerbalismSave;
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
  /** night raids: the last one, how many beaten back */
  raids?: import('./raid/raids').RaidSave;
  /** field bosses: found, heard of, last slain */
  bosses?: Record<string, import('./bosses/fieldBosses').BossState>;
  /** sites (world/sites/): what's been seen, looted, read, lit */
  sites?: Record<string, import('./world/sites/types').SiteState>;
  /** cleared creature dens (id -> game day) until they fill again */
  wilds?: { dens?: Record<string, number> };
  /** owned horses and where the active one stands */
  horses?: import('./world/horses').HorseSave;
  /** trophies and unsold catch */
  fishing?: { trophies?: Record<string, number>; held?: Record<string, number> };
  /** ships, crew, rentals, wrecks and Seamanship */
  sailing?: import('./world/sea/sailing').SailingSave;
  /** Arms and Crafting (feat/arms): known recipes, depleted gathering nodes, buffs, crafting settings */
  arms?: import('./crafting/crafting').ArmsSave;
  /** NPC overhaul: how people feel about you, your standing, bounties, who's gone */
  social?: import('./social/reputation').SocialSave;
  requests?: import('./social/requests').RequestSave;
  /** the main story's memory (src/story/state.ts) */
  story?: import('./story/state').StorySave;
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
  items: { id: string; qty: number; q?: number; rune?: string }[];
  equipped: Partial<Record<Slot, number>>; // slot -> index into items
  quick: (number | null)[];
  moves: (number | string | null)[];
  activeSpell: number | null;
  maps: Record<string, MapData>;
  dungeon: DungeonProgress;
  /** Old King's Road Mine progression */
  mine?: MineProgress;
  guild: GuildSaveData;
  world: WorldSave;
  /** the character creator's look (missing before origins: a default look is made) */
  look?: Partial<OriginLook>;
  /** Renown and deeds for the Legendary Hero */
  legacy?: LegacySave;
}

// ---- Save slots: several heroes on one computer ----
// Slot "1" keeps the original key, so a save from before slots is Save 1 as it
// stands. Other slots live under `${KEY}:${id}`. The index names them and says
// which one the next boot loads.

const INDEX = 'fantasy-rpg-slots';
export interface SlotInfo { id: string; name: string; created: number; updated?: number }
interface SlotIndex { active: string; slots: SlotInfo[] }

const keyOf = (id: string) => (id === '1' ? KEY : `${KEY}:${id}`);

function readIndex(): SlotIndex {
  try {
    const d = JSON.parse(localStorage.getItem(INDEX) ?? 'null') as SlotIndex | null;
    if (d && Array.isArray(d.slots) && d.slots.length) {
      if (!d.slots.some((s) => s.id === d.active)) d.active = d.slots[0].id;
      return d;
    }
  } catch {}
  return { active: '1', slots: [{ id: '1', name: 'Save 1', created: Date.now() }] };
}

function writeIndex(ix: SlotIndex) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(ix));
  } catch {}
}

/** The slot this boot loaded. Saves always go here, even after another slot is picked for the next boot. */
const CURRENT = SANDBOX_MODE ? '1' : readIndex().active;

export function currentSlot() {
  return CURRENT;
}

/** Every slot with a short summary of its hero (null for a slot with no game yet). */
export function listSlots() {
  return readIndex().slots.map((s) => {
    let hero: { name: string; origin: string; level: number; day?: number } | null = null;
    try {
      const raw = localStorage.getItem(keyOf(s.id)) ?? (s.id === '1' ? LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) : null);
      if (raw) {
        const d = JSON.parse(raw);
        hero = { name: d.look?.name ?? 'Hero', origin: d.prog?.origin ?? d.prog?.combat?.origin ?? 'human', level: d.prog?.level ?? 1, day: d.world?.time?.day };
      }
    } catch {}
    return { ...s, hero, current: s.id === CURRENT };
  });
}

/** Load this slot on the next boot. */
export function setActiveSlot(id: string) {
  const ix = readIndex();
  if (!ix.slots.some((s) => s.id === id)) return;
  ix.active = id;
  writeIndex(ix);
}

/** A new, empty slot, loaded on the next boot. Returns its id. */
export function createSlot(name: string) {
  const ix = readIndex();
  const id = String(Math.max(0, ...ix.slots.map((s) => +s.id || 0)) + 1);
  ix.slots.push({ id, name: name.trim().slice(0, 32) || `Save ${id}`, created: Date.now() });
  ix.active = id;
  writeIndex(ix);
  return id;
}

export function renameSlot(id: string, name: string) {
  const ix = readIndex();
  const s = ix.slots.find((x) => x.id === id);
  if (!s || !name.trim()) return;
  s.name = name.trim().slice(0, 32);
  writeIndex(ix);
}

/** Erase a slot and its game. The slot in play can't be deleted (it would save itself back). */
export function deleteSlot(id: string) {
  if (id === CURRENT) return;
  const ix = readIndex();
  ix.slots = ix.slots.filter((s) => s.id !== id);
  if (!ix.slots.length) return;
  if (ix.active === id) ix.active = CURRENT;
  writeIndex(ix);
  try {
    localStorage.removeItem(keyOf(id));
    if (id === '1') for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {}
}

export function hasSave() {
  try {
    return !!(localStorage.getItem(keyOf(CURRENT)) || (CURRENT === '1' && LEGACY_KEYS.some((k) => localStorage.getItem(k))));
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(keyOf(CURRENT));
    if (CURRENT === '1') for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {}
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(keyOf(CURRENT)) ?? (CURRENT === '1' ? LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) : null);
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
export function buildSave(player: Player, seed: number, maps: Record<string, MapData>, dungeon: DungeonProgress, guild: GuildSaveData, world: WorldSave = { flags: {} }, mine?: MineProgress): SaveData {
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
    items: eq.items.map((i) => ({ id: i.def.id, qty: i.qty, ...(i.q !== undefined ? { q: i.q } : {}), ...(i.rune ? { rune: i.rune } : {}) })),
    equipped,
    quick: cleanItems(eq.quick),
    moves: cleanMoves(eq.moves),
    activeSpell: idx(eq.activeSpell),
    maps,
    dungeon,
    mine,
    guild,
    world,
    look: player.prog.look ?? undefined,
    legacy: player.prog.legacy,
  };
  return data;
}

export function writeSave(player: Player, seed: number, maps: Record<string, MapData>, dungeon: DungeonProgress, guild: GuildSaveData, world: WorldSave = { flags: {} }, mine?: MineProgress) {
  const data = buildSave(player, seed, maps, dungeon, guild, world, mine);
  try {
    localStorage.setItem(keyOf(CURRENT), JSON.stringify(data));
  } catch {}
  if (SANDBOX_MODE) return;
  // The slot list shows when each hero was last played (a minute is close enough).
  const ix = readIndex();
  const s = ix.slots.find((x) => x.id === CURRENT);
  if (s && (!s.updated || Date.now() - s.updated > 60_000)) {
    s.updated = Date.now();
    writeIndex(ix);
  }
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
  p.origin = normalizeOrigin(origin);
  p.look = cleanLook(d.look, p.origin);
  p.legacy = cleanLegacy(d.legacy);
  eq.items = [];
  const uids: number[] = [];
  for (const it of d.items) {
    if (!ITEMS[it.id]) {
      uids.push(-1);
      continue;
    }
    // add() merges stacks; saved stacks are already whole so add them directly.
    const inst = eq.add(it.id, it.qty, it.q, it.rune);
    uids.push(inst.uid);
  }
  const uid = (k: number | null) => (k == null || k < 0 || uids[k] < 0 ? null : uids[k]);
  for (const [slot, k] of Object.entries(d.equipped)) {
    const u = uid(k as number);
    if (u != null) eq.equip(u, slot as Slot);
  }
  eq.quick = d.quick.map(uid);
  // Saves from before the Pyromancer and Lightbinder redesign: their bar skills pointed at old nodes.
  const pv = d.paths?.v ?? 1;
  const stale = (k: string) => (pv < 2 && /^skill:(pyromancer|lightbinder):/.test(k)) || (pv < 3 && /^skill:(gale|boundary|cross):/.test(k));
  const moveRef = (k: number | string | null) => (typeof k === 'string' ? (stale(k) ? null : k) : uid(k));
  eq.moves = d.moves.map(moveRef);
  const sp = uid(d.activeSpell);
  if (sp != null) eq.equip(sp);
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.stamina = player.maxStamina;
  player.restoreArmour();
}
