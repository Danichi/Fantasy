import type { Player } from './player/player';
import type { Slot } from './items/itemDefs';
import { ITEMS } from './items/itemDefs';
import type { MapData } from './ui/dungeonMap';
import type { DungeonProgress } from './dungeon/instance';

// Browser save (localStorage). Hand-drawn maps have to survive a reload, so
// the whole game state lives here: progression, inventory, loadout, dungeon
// progress and every map you've drawn.

const KEY = 'fantasy-rpg-save-v3';
const LEGACY_KEYS = ['fantasy-rpg-save-v2', 'fantasy-rpg-save-v1'];

export interface SaveData {
  v: 3;
  seed: number;
  prog: { level: number; xp: number; gold: number; sp: number; learnedStyles: string[]; activeStyle: string | null; learnedSkills: Record<string, string[]> };
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
    if (d.v === 3) return d as SaveData;
    const oldSkills = d.prog?.learnedSkills ?? {};
    const learnedStyles = (d.prog?.learnedStyles ?? []).filter((id: string) => id === 'swordsman' || id === 'bulwark');
    const activeStyle = learnedStyles.includes(d.prog?.activeStyle) ? d.prog.activeStyle : (learnedStyles[0] ?? null);
    return {
      ...d,
      v: 3,
      prog: {
        level: d.prog?.level ?? 1,
        xp: d.prog?.xp ?? 0,
        gold: d.prog?.gold ?? 0,
        sp: d.prog?.sp ?? 0,
        learnedStyles,
        activeStyle,
        learnedSkills: {
          swordsman: [...(oldSkills.swordsman ?? [])],
          bulwark: [...(oldSkills.bulwark ?? [])],
        },
      },
      moves: (d.moves ?? []).map((m: unknown) => typeof m === 'number' || typeof m === 'string' ? m : null),
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
  const clean = (list: (number | null)[]) => list.map((u) => {
    const k = idx(u);
    return k === null || k < 0 ? null : k;
  });
  const data: SaveData = {
    v: 3,
    seed,
    prog: { level: player.prog.level, xp: player.prog.xp, gold: player.prog.gold, sp: player.prog.skillPoints, learnedStyles: [...player.prog.learnedStyles], activeStyle: player.prog.activeStyle, learnedSkills: structuredClone(player.prog.learnedSkills) },
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
  p.learnedStyles = (d.prog.learnedStyles ?? []).filter((id): id is 'swordsman' | 'bulwark' => id === 'swordsman' || id === 'bulwark');
  p.activeStyle = p.learnedStyles.includes(d.prog.activeStyle as 'swordsman' | 'bulwark') ? (d.prog.activeStyle as 'swordsman' | 'bulwark') : (p.learnedStyles[0] ?? null);
  p.learnedSkills = { swordsman: [], bulwark: [], ...(d.prog.learnedSkills ?? {}) };
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
  eq.moves = d.moves.map(uid);
  const sp = uid(d.activeSpell);
  if (sp != null) eq.equip(sp);
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.stamina = player.maxStamina;
}
