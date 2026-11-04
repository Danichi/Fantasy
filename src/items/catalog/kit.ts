import type * as THREE from 'three';
import type { ItemDef, ItemStats, Rarity } from '../itemDefs';
import type { Recipe, StationKind, CallingId, Step } from '../../crafting/recipes';
import type { PotionArt } from '../../ui/art/potions';
import type { PartSpec } from '../../ui/art/parts';
import type { TrinketSpec } from '../../ui/art/trinkets';
import type { PaperSpec } from '../../ui/art/paper';
import type { FoodSpec } from '../../ui/art/food';
import { fxText } from './gearFx';

// The catalog's registries. Every catalog module adds its items here with
// add(): the definition, where it comes from (sources.ts reads the tags), its
// painted icon if it has one, and its recipe if it can be made.

/** Every catalog item, by id (itemDefs.ts merges them into ITEMS). */
export const CAT: Record<string, ItemDef> = {};
/** Painted icons (ui/art/registry.ts asks here before drawing a model). */
export type CatArt =
  | { k: 'potion'; s: PotionArt }
  | { k: 'part'; s: PartSpec }
  | { k: 'trinket'; s: TrinketSpec }
  | { k: 'paper'; s: PaperSpec }
  | { k: 'food'; s: FoodSpec };
export const ART: Record<string, CatArt> = {};
/** Recipes for catalog items (crafting/recipes.ts appends them). */
export const CAT_RECIPES: Recipe[] = [];
/**
 * Where each item is found. Tags:
 *  shop:<kind>:<tier>   sold by that kind of shop in that tier's regions
 *  fshop:<faction>      sold by the faction's quartermasters and its home shops
 *  drop:<family>:<tier> carried by that family of foe (tier 0: any level)
 *  chest:<tier>         in dungeon and site chests
 *  quest:<faction>      a reward for that faction's quests
 *  boss:<id> lair:<id> beast:<id> site:<kind> done:<quest> master:<discipline> stone:<n> kill:<enemy kind>
 *  craft                made at a station (CAT_RECIPES)
 */
export const SOURCES: Record<string, string[]> = {};

export function add(def: ItemDef, src: string[], art?: CatArt): ItemDef {
  if (CAT[def.id]) throw new Error(`catalog: duplicate id ${def.id}`);
  // Gear effects read in plain words at the end of the description.
  if (def.fx && Object.keys(def.fx).length) {
    const t = fxText(def.fx);
    if (t && !def.desc.includes(t)) def.desc = `${def.desc} ${t}`;
  }
  CAT[def.id] = def;
  SOURCES[def.id] = [...(SOURCES[def.id] ?? []), ...src];
  if (art) ART[def.id] = art;
  return def;
}

/** Tag an item (one made elsewhere, or a catalog one) with another source. */
export function source(id: string, ...src: string[]) {
  SOURCES[id] = [...(SOURCES[id] ?? []), ...src];
}

export function recipe(out: string, station: StationKind, calling: CallingId | undefined, level: number, inputs: [string, number][], learn: Recipe['learn'], o: { n?: number; quality?: boolean; step?: Step; node?: string } = {}) {
  const r: Recipe = { id: out, out, station, calling, level, inputs: inputs.map(([id, n]) => ({ id, n })), learn, quality: o.quality ?? true, step: o.step ?? 'none', ...(o.n ? { n: o.n } : {}), ...(o.node ? { node: o.node } : {}) };
  CAT_RECIPES.push(r);
  source(out, 'craft');
  return r;
}

export const camel = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('');
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Round a stat for display and balance. */
export const rd = (v: number, step = 1) => Math.round(v / step) * step;

export function def(id: string, name: string, kind: ItemDef['kind'], rarity: Rarity, desc: string, stats: ItemStats, o: Partial<ItemDef> = {}): ItemDef {
  return { id, name, kind, rarity, desc, stats, ...o };
}

export type Build = () => THREE.Object3D;
