import type { Player } from './player/player';
import type { Slot } from './items/itemDefs';
import { ITEMS } from './items/itemDefs';
import type { MapData } from './ui/dungeonMap';
import type { DungeonProgress } from './dungeon/instance';
import type { GuildSaveData } from './guild/adventurerGuild';
import type { DiscoverySave } from './world/discovery';

// Browser save (localStorage). Hand-drawn maps have to survive a reload, so
// the whole game state lives here: progression, inventory, loadout, dungeon
// progress and every map you've drawn.

const KEY = 'fantasy-rpg-save-v6';
const LEGACY_KEYS = ['fantasy-rpg-save-v5', 'fantasy-rpg-save-v4', 'fantasy-rpg-save-v3', 'fantasy-rpg-save-v2', 'fantasy-rpg-save-v1'];

/** World state (v6): exploration, flags and time; later phases add horses, ships, factions. */
export interface WorldSave {
  discovery?: DiscoverySave;
  flags: Record<string, boolean | number | string>;
  time?: number;
  /** where the player stood (overworld), so a reload keeps them there */
  pos?: [number, number, number];
}

export interface SaveData {
  v: 6;
  seed: number;
  prog: {
    level: number; xp: number; gold: number; sp: number;
    /** long-term discipline tracks (levels, mastery, specializations, origin) */
    combat: ReturnType<Player['prog']['combat']['toJSON']> | null;
    /** trained combat schools and their skill trees */
    primaryStyle: string | null; secondaryStyle: string | null; activeStyle: string | null;
    styleIntroductions: string[]; learnedSkills: Record<string, string[]>; styleMastery: Record<string, number>;
  };
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
        sp: old.sp ?? 0,
        combat: old.combat ?? null,
        primaryStyle: old.primaryStyle ?? null,
        secondaryStyle: old.secondaryStyle ?? null,
        activeStyle: old.activeStyle ?? null,
        styleIntroductions: old.styleIntroductions ?? [],
        learnedSkills: old.learnedSkills ?? { gale: [], boundary: [], cross: [] },
        styleMastery: old.styleMastery ?? { gale: 0, boundary: 0, cross: 0 },
      },
      moves: (d.moves ?? []).map((m: unknown) => (typeof m === 'number' ? m : null)),
      guild: d.guild ?? defaultGuild,
      world: d.world ?? { flags: {} },
    } as SaveData;
  } catch {
    return null;
  }
}

export function writeSave(player: Player, seed: number, maps: Record<string, MapData>, dungeon: DungeonProgress, guild: GuildSaveData, world: WorldSave = { flags: {} }) {
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
      level: player.prog.level, xp: player.prog.xp, gold: player.prog.gold, sp: player.prog.skillPoints,
      combat: player.prog.combat.toJSON(),
      primaryStyle: player.prog.primaryStyle, secondaryStyle: player.prog.secondaryStyle, activeStyle: player.prog.activeStyle,
      styleIntroductions: [...player.prog.styleIntroductions], learnedSkills: structuredClone(player.prog.learnedSkills), styleMastery: structuredClone(player.prog.styleMastery),
    },
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
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

/** Rebuild the player's progression and inventory from a save. */
export function applySave(player: Player, d: SaveData) {
  const eq = player.equip;
  const p = player.prog;
  p.level = d.prog.level;
  p.xp = d.prog.xp;
  p.gold = d.prog.gold;
  p.skillPoints = d.prog.sp;
  if (d.prog.combat) p.combat.fromJSON(d.prog.combat);
  p.primaryStyle = (d.prog.primaryStyle === 'gale' || d.prog.primaryStyle === 'boundary' || d.prog.primaryStyle === 'cross') ? d.prog.primaryStyle : null;
  p.secondaryStyle = (d.prog.secondaryStyle === 'gale' || d.prog.secondaryStyle === 'boundary' || d.prog.secondaryStyle === 'cross') ? d.prog.secondaryStyle : null;
  p.activeStyle = (d.prog.activeStyle === 'gale' || d.prog.activeStyle === 'boundary' || d.prog.activeStyle === 'cross') ? d.prog.activeStyle : p.primaryStyle;
  p.styleIntroductions = (d.prog.styleIntroductions ?? []).filter((id): id is 'gale' | 'boundary' | 'cross' => id === 'gale' || id === 'boundary' || id === 'cross');
  p.learnedSkills = { gale: [], boundary: [], cross: [], ...(d.prog.learnedSkills ?? {}) };
  p.styleMastery = { gale: 0, boundary: 0, cross: 0, ...(d.prog.styleMastery ?? {}) };
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
