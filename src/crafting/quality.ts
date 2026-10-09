import type { ItemDef, ItemStats } from '../items/itemDefs';

// Quality of crafted things (docs/design/arms-and-crafting.md §4): Crude,
// Common, Fine, Superior, Masterwork, Legendary. It comes from the Calling's
// level, the materials' quality, the station and the craft step's timing.
// A crafted item carries its quality (and any rune) on its inventory entry;
// its definition is a copy of the base item with the stats scaled, so every
// system that reads `item.def.stats` (the blade, armour, potions) sees the
// better numbers without knowing about crafting.

export const QUALITY_NAMES = ['Crude', 'Common', 'Fine', 'Superior', 'Masterwork', 'Legendary'] as const;
export const COMMON = 1;
export const MAX_QUALITY = 5;

/** Stat multiplier for a quality: -10% crude, +10% a notch above common. */
export function qualityMult(q: number) {
  return 1 + 0.1 * (q - COMMON);
}

/** What a quality does to an item's stats, in words. */
export function qualityLine(q: number) {
  const pct = Math.round((qualityMult(q) - 1) * 100);
  return `${QUALITY_NAMES[q]} quality${pct ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`;
}

export interface Score {
  level: number;
  /** average material quality (1 = common) */
  mats: number;
  /** station bonus (a master's forge: +0.5) */
  station: number;
  /** well-timed beats in the craft step (0..3) */
  notches: number;
  /** calling passives that raise quality */
  bonus: number;
}

/**
 * Quality from the craft's inputs. Smithing 5 with common iron at a town
 * forge makes a Common sword with sloppy timing and a Fine one with good
 * timing; Masterwork wants a high level, fine materials and good hands;
 * Legendary everything at once.
 */
export function computeQuality(s: Score) {
  const score = s.level * 0.06 + (s.mats - COMMON) * 0.55 + s.station + s.notches * 0.34 + s.bonus;
  return Math.max(0, Math.min(MAX_QUALITY, COMMON + Math.floor(score)));
}

export interface RuneDef {
  id: string;
  name: string;
  /** stats the rune adds to a weapon (or armour) */
  stats: ItemStats;
  line: string;
  /** which gear takes it */
  on: 'weapon' | 'armor' | 'ammo';
}

/** Runes inscribed at a runestone (Runecraft). */
export const RUNES: Record<string, RuneDef> = {
  fire: { id: 'fire', name: 'Rune of Embers', stats: { burn: 6 }, line: 'Rune of Embers: the edge burns', on: 'weapon' },
  frost: { id: 'frost', name: 'Rune of Rime', stats: { frost: 0.15 }, line: 'Rune of Rime: hits may freeze', on: 'weapon' },
  poise: { id: 'poise', name: 'Rune of the Anvil', stats: { stagger: 1.25, poise: 4 }, line: 'Rune of the Anvil: blows stagger harder', on: 'weapon' },
  swift: { id: 'swift', name: 'Rune of the Swift', stats: { speed: 0.08 }, line: 'Rune of the Swift: +8% attack speed', on: 'weapon' },
  warding: { id: 'warding', name: 'Rune of Warding', stats: { armor: 2, maxHp: 10 }, line: 'Rune of Warding: +2 armour, +10 health', on: 'armor' },
  returning: { id: 'returning', name: 'Rune of Returning', stats: {}, line: 'Rune of Returning: arrows from this bow come back to the quiver', on: 'weapon' },
};

const STAT_SCALED: (keyof ItemStats)[] = ['damage', 'armor', 'block', 'heal', 'restoreMana', 'restoreStamina', 'poise', 'bleed', 'burn'];

const derived = new Map<string, ItemDef>();

/**
 * The item as made: stats scaled by quality, a rune's stats added, and the
 * name prefixed ("Fine Steel Spear"). Cached per (item, quality, rune).
 */
export function qualityDef(base: ItemDef, q?: number, rune?: string): ItemDef {
  if ((q === undefined || q === COMMON) && !rune) return base;
  const key = `${base.id}|${q ?? COMMON}|${rune ?? ''}`;
  const hit = derived.get(key);
  if (hit) return hit;
  const k = qualityMult(q ?? COMMON);
  const stats: ItemStats = { ...base.stats };
  // Materials and ammo keep their numbers (ammo damage scales, the rest is a grade).
  if (base.kind !== 'material') {
    for (const s of STAT_SCALED) {
      const v = stats[s];
      if (typeof v !== 'number') continue;
      stats[s] = s === 'damage' || s === 'heal' || s === 'restoreMana' || s === 'restoreStamina' || s === 'block' ? Math.round(v * k) : Math.round(v * k * 10) / 10;
    }
  }
  const r = rune ? RUNES[rune] : undefined;
  if (r) {
    for (const [s, v] of Object.entries(r.stats) as [keyof ItemStats, number][]) {
      const cur = stats[s] ?? 0;
      stats[s] = s === 'stagger' ? Math.max(cur || 1, 1) * v : s === 'speed' ? (cur || 1) + v : cur + v;
    }
  }
  const prefix = q !== undefined && q !== COMMON ? QUALITY_NAMES[q] + ' ' : '';
  const def: ItemDef = {
    ...base,
    name: prefix + base.name + (r ? ` (${r.name.replace('Rune of ', '')})` : ''),
    rarity: q === undefined ? base.rarity : q >= 5 ? 'epic' : q >= 4 ? 'rare' : q >= 2 && base.rarity === 'common' ? 'fine' : base.rarity,
    stats,
  };
  derived.set(key, def);
  return def;
}
