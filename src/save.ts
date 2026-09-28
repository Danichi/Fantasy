import type { Player } from './player/player';
import type { Slot } from './items/itemDefs';
import { ITEMS } from './items/itemDefs';
import type { MapData } from './ui/dungeonMap';
import type { DungeonProgress } from './dungeon/instance';

// Browser save (localStorage). Hand-drawn maps have to survive a reload, so
// the whole game state lives here: progression, inventory, loadout, dungeon
// progress and every map you've drawn.

const KEY = 'fantasy-rpg-save-v4';
const LEGACY_KEYS = ['fantasy-rpg-save-v3', 'fantasy-rpg-save-v2', 'fantasy-rpg-save-v1'];

export interface SaveData {
  v: 4;
  seed: number;
  prog: { level: number; xp: number; gold: number; sp: number; primaryStyle: string | null; secondaryStyle: string | null; activeStyle: string | null; styleIntroductions: string[]; learnedSkills: Record<string, string[]>; styleMastery: Record<string, number> };
  items: { id: string; qty: number }[];
  equipped: Partial<Record<Slot, number>>; // slot -> index into items
  quick: (number | null)[];
  moves: (number | string | null)[];
  activeSpell: number | null;
  maps: Record<string, MapData>;
  dungeon: DungeonProgress;
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
    const d = JSON.parse(raw) as SaveData & { v: number; prog: any };
    if (d.v === 4) return d as SaveData;
    const oldProg = d.prog ?? {};
    return {
      ...d,
      v: 4,
      prog: {
        level: oldProg.level ?? 1,
        xp: oldProg.xp ?? 0,
        gold: oldProg.gold ?? 0,
        sp: oldProg.sp ?? 0,
        primaryStyle: null,
        secondaryStyle: null,
        activeStyle: null,
        styleIntroductions: [],
        learnedSkills: { gale: [], boundary: [], cross: [] },
        styleMastery: { gale: 0, boundary: 0, cross: 0 },
      },
      moves: (d.moves ?? []).map((m: unknown) => typeof m === 'number' ? m : null),
    } as SaveData;
  } catch {
    return null;
  }
}

export function writeSave(player: Player, seed: number, maps: Record<string, MapData>, dungeon: DungeonProgress) {
  const eq = player.equip;
  const idx = (uid: number | null | undefined) => (uid == null ? null : eq.items.findIndex((i) => i.uid === uid));
  const equipped: SaveData['equipped'] = {};
  for (const [slot, uid] of Object.entries(eq.equipped)) {
    const k = idx(uid);
    if (k !== null && k >= 0) equipped[slot as Slot] = k;
  }
  const clean = (list: (number | string | null)[]) => list.map((u) => {
    if (typeof u === 'string') return u;
    const k = idx(u);
    return k === null || k < 0 ? null : k;
  });
  const data: SaveData = {
    v: 4,
    seed,
    prog: { level: player.prog.level, xp: player.prog.xp, gold: player.prog.gold, sp: player.prog.skillPoints, primaryStyle: player.prog.primaryStyle, secondaryStyle: player.prog.secondaryStyle, activeStyle: player.prog.activeStyle, styleIntroductions: [...player.prog.styleIntroductions], learnedSkills: structuredClone(player.prog.learnedSkills), styleMastery: structuredClone(player.prog.styleMastery) },
    items: eq.items.map((i) => ({ id: i.def.id, qty: i.qty })),
    equipped,
    quick: clean(eq.quick),
    moves: clean(eq.moves),
    activeSpell: idx(eq.activeSpell),
    maps,
    dungeon,
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
