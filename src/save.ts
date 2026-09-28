import type { Player } from './player/player';
import type { Slot } from './items/itemDefs';
import { ITEMS } from './items/itemDefs';
import type { MapData } from './ui/dungeonMap';
import type { DungeonProgress } from './dungeon/instance';

// Browser save (localStorage). Hand-drawn maps have to survive a reload, so
// the whole game state lives here: progression, inventory, loadout, dungeon
// progress and every map you've drawn.

const KEY = 'fantasy-rpg-save-v2';

export interface SaveData {
  v: 2;
  seed: number;
  prog: { level: number; xp: number; gold: number; sp: number; combat: ReturnType<Player['prog']['combat']['toJSON']> };
  items: { id: string; qty: number }[];
  equipped: Partial<Record<Slot, number>>; // slot -> index into items
  quick: (number | null)[];
  moves: (number | null)[];
  activeSpell: number | null;
  maps: Record<string, MapData>;
  dungeon: DungeonProgress;
}

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return (d.v === 2 ? d : null);
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
    v: 1,
    seed,
    prog: { level: player.prog.level, xp: player.prog.xp, gold: player.prog.gold, sp: player.prog.skillPoints, combat: player.prog.combat.toJSON() },
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
  p.combat.fromJSON(d.prog.combat);
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
