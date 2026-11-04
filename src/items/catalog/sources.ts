import { ITEMS, itemValue, type ItemDef } from '../itemDefs';
import { isWeaponKind } from '../weapons/kinds';
import { events } from '../../core/events';
import { SOURCES } from './kit';
import { FACTIONS } from './factions';
import { tierOfLevel, tierOfRegion } from './tiers';
import { familyOf } from './gearFx';
import type { GearRuntime } from './gearRuntime';

// Where the catalog's items come from, made real (the item plan's sources):
// shops of each kind sell their region's tier and their faction's gear; foes
// carry their family's parts and gear; bosses, lairs, sea beasts, quests, wild
// sites, the twelve stones and the masters give their uniques, once each.

type Stock = [string, number][];

export interface SourceDeps {
  give: (id: string, n: number) => void;
  toast: (m: string) => void;
  region: () => string;
  day: () => number;
  playerLevel: () => number;
  playerPos: () => { distanceTo(v: unknown): number };
  /** saved flags (world flags) */
  flags: Record<string, boolean | number | string>;
  gear: GearRuntime;
  /** does the player own this item already */
  owns: (id: string) => boolean;
}

/** The shop kinds a keeper's name, title and greeting suggest. */
const KINDS: [string, RegExp][] = [
  ['smith', /smith|forge|arms|armou?r|blade|weapon|steel|fröst|ragna|brightforge|anvil|quartermaster/i],
  ['tailor', /tailor|thread|cloth|silk|leather|vela|weaver|seamstress|cloak|tanner/i],
  ['alchemist', /alchem|apothecar|draught|herbal|potion|medicine|remed|quill|ilyra|wenna|hedge/i],
  ['inn', /\binn\b|tavern|baker|cook|kitchen|food|\bale\b|provision|mara\b|hester|stag|galley|bread|ration/i],
  ['arcane', /arcan|mage|magic|scroll|library|collegium|sera|archmage|orren|scribe/i],
  ['jeweller', /jewel|gem|glass|gold(smith)?\b|bruni|ring/i],
  ['bowyer', /bow|fletch|carpenter|bram|hunter|timber/i],
  ['temple', /temple|dawn|chapel|pilgrim|priest|sister|brother/i],
  ['trader', /trader|merchant|market|bazaar|wander|caravan|scrap|fence|hawker|goods|wares|rope|travel/i],
];

const RAR_PRICE: Record<string, number> = { common: 10, fine: 32, rare: 85, epic: 220, legendary: 600 };

/** What a catalog item costs to buy. */
export function priceOf(def: ItemDef) {
  const tier = def.tier ?? (def.lvl ? tierOfLevel(def.lvl) : 1);
  let p: number;
  if (def.kind === 'material') p = Math.round(4 * Math.pow(1.9, tier - 1) * (def.rarity === 'rare' || def.rarity === 'epic' ? 2.5 : 1));
  else if (def.kind === 'consumable' || def.kind === 'ammo') p = Math.round(RAR_PRICE[def.rarity] * (0.5 + (def.lvl ?? 1) / 20) + ((def.stats.heal ?? 0) + (def.stats.restoreMana ?? 0) + (def.stats.restoreStamina ?? 0)) / 4);
  else p = Math.round(itemValue(def) * (1.2 + tier * 0.25) + (def.kind === 'armor' || def.kind === 'accessory' ? RAR_PRICE[def.rarity] * 0.6 : 0));
  // Never less than a merchant would pay for it.
  return Math.max(2, p, Math.ceil(itemValue(def) * 0.6));
}

/** A day-seeded shuffle, so a shop's catalog stock turns over from day to day. */
function rotate<T>(list: T[], seed: number, n: number): T[] {
  const a = list.slice();
  let s = (seed * 2654435761) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Items with a tag, cached. */
const tagged = new Map<string, string[]>();
export function withTag(tag: string): string[] {
  let l = tagged.get(tag);
  if (!l) {
    l = Object.entries(SOURCES).filter(([id, s]) => ITEMS[id] && s.includes(tag)).map(([id]) => id);
    tagged.set(tag, l);
  }
  return l;
}
/** Items with a tag of this shape: drop:beast:3 matches drop:beast:0..3 when `upTo`. */
function withTier(prefix: string, tier: number, from = 0): string[] {
  const out: string[] = [];
  for (let t = from; t <= tier; t++) out.push(...withTag(`${prefix}:${t}`));
  return out;
}

const ARMED = new Set(['bandit', 'orc', 'goblin', 'undead', 'gloam', 'desert', 'scrap']);
const CASTER = new Set(['undead', 'gloam']);

export class CatalogSources {
  /** numbers for tests */
  readonly stats = { drops: 0, rewards: 0 };

  constructor(private d: SourceDeps) {
    events.on('enemyDied', (e) => this.onKill(e.kind, e.level, e.at));
    events.on('bossSlain', ({ id }) => this.reward(`boss:${id}`, 'all'));
    events.on('deed', ({ id }) => {
      if (id.startsWith('wilds:')) this.reward(`lair:${id.slice(6)}`, 'all');
      if (id.startsWith('beast:')) this.reward(`beast:${id.slice(6)}`, 'all');
      for (const [k, f] of Object.entries(FACTIONS)) if (f.deed?.test(id)) this.factionPiece(k);
    });
    events.on('questChanged', ({ id, status }) => {
      if (status !== 'done') return;
      this.reward(`done:${id}`, 'all');
      for (const [k, f] of Object.entries(FACTIONS)) if (f.quest?.test(id)) this.factionPiece(k);
    });
    events.on('siteDone', ({ kind }) => this.onSite(kind));
  }

  private given(id: string) {
    return !!this.d.flags['cat:' + id] || (!ITEMS[id]?.stack && this.d.owns(id));
  }
  private grant(id: string, n = 1, why = '') {
    if (!ITEMS[id]) return;
    if (!ITEMS[id].stack) this.d.flags['cat:' + id] = 1;
    this.d.give(id, n);
    this.stats.rewards++;
    this.d.toast(`${why ? why + ': ' : ''}${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`);
  }

  /** Give what a source holds: every unique not yet given ('all'), or one of them. */
  reward(tag: string, how: 'all' | 'one') {
    const list = withTag(tag).filter((id) => !this.given(id));
    if (!list.length) return [];
    const pick = how === 'all' ? list : [list[Math.floor(Math.random() * list.length)]];
    for (const id of pick) this.grant(id, 1, 'Found');
    return pick;
  }

  /** A faction's thanks: a piece of its gear you don't have yet (sets first, then its books, then weapons). */
  factionPiece(faction: string) {
    const all = withTag(`quest:${faction}`).filter((id) => !this.given(id));
    if (!all.length) return null;
    const rank = (id: string) => (ITEMS[id].set ? 0 : id.startsWith('book') ? 1 : 2);
    const best = Math.min(...all.map(rank));
    const pool = all.filter((id) => rank(id) === best);
    const id = pool[Math.floor(Math.random() * pool.length)];
    this.grant(id, 1, `A gift from ${FACTIONS[faction].name}`);
    return id;
  }

  /** The twelve stones: the n-th stone read gives the n-th token; wild sites give their finds. */
  private onSite(kind: string) {
    if (kind === 'stone') {
      const n = Number(this.d.flags['cat:stones'] ?? 0) + 1;
      this.d.flags['cat:stones'] = n;
      for (const id of withTag(`stone:${n}`)) if (!this.given(id)) this.grant(id, 1, 'At the foot of the stone');
    }
    const list = withTag(`site:${kind}`);
    const uniques = list.filter((id) => !ITEMS[id].stack && !this.given(id));
    if (uniques.length) this.grant(uniques[Math.floor(Math.random() * uniques.length)], 1, 'Found');
    const mats = list.filter((id) => ITEMS[id].stack);
    for (const id of rotate(mats, Date.now() & 0xffff, 2)) this.grant(id, 1 + Math.floor(Math.random() * 3), 'Found');
    // Caches and vaults hold a chest's worth of the region's tier.
    if (/^(cache|vault|caravan|hideout|drownedTower|mine|tower)$/.test(kind)) {
      const t = tierOfRegion(this.d.region());
      const pool = withTag(`chest:${t}`);
      if (pool.length) this.grant(pool[Math.floor(Math.random() * pool.length)], 1, 'In the cache');
    }
  }

  /** A foe fell: its family's parts, sometimes its gear, rarely a trophy. Some kinds give a unique. */
  private onKill(kind: string, level: number | undefined, at: unknown) {
    if (this.d.playerPos().distanceTo(at) > 40) return;
    for (const id of withTag(`kill:${kind}`)) if (!this.given(id)) this.grant(id, 1, 'Taken from the fallen');
    const fam = familyOf(kind);
    const tier = level ? Math.max(1, Math.min(8, tierOfLevel(level))) : Math.max(1, tierOfRegion(this.d.region()));
    const luck = 1 + (this.d.gear.fx.luck ?? 0);
    const roll = (p: number) => Math.random() < p;
    const one = (pool: string[]) => (pool.length ? pool[Math.floor(Math.random() * pool.length)] : null);
    const drops: string[] = [];
    // Parts of the creature: most kills.
    const parts = withTier(`drop:${fam}`, tier).filter((id) => ITEMS[id].kind === 'material');
    if (roll(0.32)) { const id = one(parts); if (id) drops.push(id); }
    // Gear the foe carried.
    const gearPool = [
      ...withTier(`drop:${fam}`, tier, Math.max(1, tier - 1)).filter((id) => ITEMS[id].kind !== 'material'),
      ...(ARMED.has(fam) ? withTier('drop:armed', tier, Math.max(1, tier - 1)) : []),
      ...(CASTER.has(fam) ? withTier('drop:caster', tier, Math.max(1, tier - 1)) : []),
    ];
    if (roll(0.05 * luck)) { const id = one(gearPool); if (id) drops.push(id); }
    // Draughts and the like.
    if (roll(0.06 * luck)) { const id = one(withTier('drop:any', tier, 1)); if (id) drops.push(id); }
    // A trophy of the hunt (Prospecting's finds help).
    if (roll(0.015 * luck)) { const id = one(withTag(`trophy:${fam}`)); if (id) drops.push(id); }
    for (const id of drops) {
      this.d.give(id, 1);
      this.stats.drops++;
    }
    if (drops.length) this.d.toast(`Loot: ${drops.map((id) => ITEMS[id].name).join(', ')}`);
  }

  // ---- shops -------------------------------------------------------------------------------------
  /** The catalog's stock for a shop: its kinds at the region's tier, and any faction it serves. */
  stockFor(who: string, title: string, intro: string, stock: Stock): Stock {
    const text = `${who} ${title} ${intro}`;
    const reg = this.d.region();
    const t = Math.max(1, Math.min(6, tierOfRegion(reg) || 1));
    const day = this.d.day();
    const seed = hash(who) + day;
    const have = new Set(stock.map(([id]) => id));
    const out: Stock = [];
    const put = (id: string) => {
      if (have.has(id) || !ITEMS[id]) return;
      have.add(id);
      out.push([id, priceOf(ITEMS[id])]);
    };
    const kinds = KINDS.filter(([, rx]) => rx.test(text)).map(([k]) => k);
    for (const k of kinds) {
      const now = withTag(`shop:${k}:${t}`), prev = t > 1 ? withTag(`shop:${k}:${t - 1}`) : [];
      const n = k === 'smith' || k === 'tailor' ? 12 : 7;
      for (const id of rotate(now, seed + k.length, n)) put(id);
      for (const id of rotate(prev, seed + 3, 3)) put(id);
      if (k === 'inn') for (const id of withTag(`inn:${reg}`)) put(id);
    }
    // Quartermasters: everything their faction makes, a rotating selection.
    for (const [key, f] of Object.entries(FACTIONS)) {
      const qm = f.shop?.test(text);
      const home = f.home.includes(reg) && kinds.some((k) => k === 'smith' || k === 'tailor' || k === 'trader');
      if (!qm && !home) continue;
      const pool = withTag(`fshop:${key}`);
      for (const id of rotate(pool, seed + key.length, qm ? 10 : 4)) put(id);
    }
    const all = [...stock, ...out];
    const off = this.d.gear.fx.shopDiscount ?? 0;
    return off > 0 ? all.map(([id, p]) => [id, Math.max(1, Math.round(p * (1 - Math.min(0.4, off))))]) : all;
  }
}

/** Is this a weapon or armour (shops sort them first)? */
export const isGear = (d: ItemDef) => d.kind === 'sword' || isWeaponKind(d.kind) || d.kind === 'armor' || d.kind === 'shield';
