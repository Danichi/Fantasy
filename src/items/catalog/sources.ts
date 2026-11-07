import { ITEMS, itemValue, type ItemDef } from '../itemDefs';
import { isWeaponKind } from '../weapons/kinds';
import { events } from '../../core/events';
import { SOURCES, source } from './kit';
import { FACTIONS } from './factions';
import { bestiaryHook } from '../../progression/bestiary';
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
  /**
   * Lay kill loot on the ground where the foe fell, glowing its rarity, to be
   * walked over (ReagentDrops.spawn). False when it can't (no model): then it
   * goes straight into the bag. keep: it is never lost if left lying.
   */
  drop?: (id: string, n: number, at: import('three').Vector3, keep?: boolean) => boolean;
}

/** The shop kinds a keeper's name, title and greeting suggest. */
// Matched on the keeper's name and title first, whole words only: the old
// match ran over their greeting too, so "rough travel" made a carpenter a
// trader and "during" made anyone a jeweller.
const KINDS: [string, RegExp][] = [
  ['smith', /smith\b|\bforge|\barms\b|armou?rer|weapon|fröst|ragna|brightforge|anvil|quartermaster/i],
  ['tailor', /tailor|\bthread\b|clothier|silk|leatherworker|\bvela\b|weaver|seamstress|tanner/i],
  ['alchemist', /alchem|apothecar|herbalist|\bquill\b|\bilyra\b|\bwenna\b|hedge-?witch/i],
  ['inn', /\binn(keeper)?\b|tavern|baker|\bcook\b|kitchen|provisioner|\bmara\b|hester|galley/i],
  ['arcane', /arcan|\bmagus\b|\bmage\b|magic|scroll|library|collegium|\bsera\b|archmage|\borren\b|scribe/i],
  ['jeweller', /jewel|\bgem|glassblow|goldsmith|\bbruni\b/i],
  ['bowyer', /bowyer|fletch|carpenter|shieldwright|\bbram\b|hunter|timber/i],
  ['temple', /temple|\bdawn\b|chapel|pilgrim|priest|sister|brother/i],
  ['trader', /trader|merchant|market|bazaar|wander|caravan|scrap|\bfence\b|hawker|peddler|outfitter/i],
];
const RAR_RANK: Record<string, number> = { common: 0, fine: 1, rare: 2, epic: 3, legendary: 4 };
const named = (d: ItemDef, rx: RegExp) => rx.test(d.id) || rx.test(d.name);
/**
 * Does this item belong on this trade's counter? A tailor sells cloth and
 * leather and what is sewn from them, not steel; a smith sells steel.
 */
export function fitsTrade(kind: string, d: ItemDef): boolean {
  const weight = d.look?.weight;
  const mat = d.kind === 'material';
  switch (kind) {
    case 'smith':
      return (isWeaponKind(d.kind) && d.kind !== 'bow' && d.kind !== 'staff') || d.kind === 'shield'
        || (d.kind === 'armor' && (weight === 'mail' || weight === 'plate'))
        || (d.kind === 'ammo' && d.ammo === 'bolt') || d.kind === 'tool'
        || (mat && named(d, /ingot|\bore\b|Ore$|coal|rivet/i)) || named(d, /repairKit|whetstone/i);
    case 'tailor':
      return (d.kind === 'armor' && (weight === 'robe' || weight === 'leather' || d.slot === 'cloak'))
        || (d.kind === 'accessory' && d.slot === 'belt')
        || (mat && named(d, /hide|leather|cloth|wool|linen|silk|felt|fleece|cotton|byssus|thread|flax|weave|fur/i))
        || named(d, /repairKit|Patterns/i);
    case 'alchemist':
      return d.kind === 'consumable'
        || (mat && named(d, /herb|root|leaf|petal|moss|cap\b|bloom|salt|vial|resin|venom|ichor|sap\b|spore|flower|thistle|wort|weed/i))
        || named(d, /bookAlchemy/i);
    case 'inn':
      return (d.kind === 'consumable' && named(d, /meal|stew|bread|ale\b|mead|wine|cheese|pie\b|soup|roast|ration|honey|tea\b|fish|berr|apple|loaf|cake|potion|draught/i))
        || named(d, /seed|bookCooking/i);
    case 'arcane':
      return d.kind === 'spell' || d.kind === 'staff' || (d.kind === 'armor' && weight === 'robe')
        || (d.kind === 'consumable' && named(d, /mana|scroll|rune|ward|recall/i))
        || (mat && named(d, /dust|essence|crystal|ink|parchment|rune|arcane|shard|mote/i)) || /^book/.test(d.id);
    case 'jeweller':
      return (d.kind === 'accessory' && d.slot !== 'belt')
        || (mat && named(d, /gem|ruby|sapphire|emerald|diamond|pearl|amber|opal|garnet|topaz|jade|sunstone|silver|gold|quartz|amethyst/i));
    case 'bowyer':
      return d.kind === 'bow' || d.kind === 'crossbow' || d.kind === 'staff' || d.kind === 'spear' || d.kind === 'ammo' || d.kind === 'shield'
        || d.tool === 'hatchet' || (mat && named(d, /wood|timber|plank|feather|sinew|string|resin/i));
    case 'temple':
      return (d.kind === 'consumable' && named(d, /holy|blessed|dawn|prayer|candle|incense|relic|water|ward/i))
        || (d.kind === 'accessory' && named(d, /holy|dawn|sun|prayer|relic|saint|icon/i));
    case 'trader':
      return d.kind === 'consumable' || d.kind === 'tool' || d.kind === 'ammo' || (d.kind === 'accessory' && d.slot === 'belt') || (mat && (d.tier ?? 1) <= 2);
  }
  return true;
}

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
export function withTier(prefix: string, tier: number, from = 0): string[] {
  const out: string[] = [];
  for (let t = from; t <= tier; t++) out.push(...withTag(`${prefix}:${t}`));
  return out;
}

const ARMED = new Set(['bandit', 'orc', 'goblin', 'undead', 'gloam', 'desert', 'scrap']);
const CASTER = new Set(['undead', 'gloam']);

// The dungeon bosses' old first-kill hoards join their pools, so they come one
// at a time like everything else a boss carries (a farmed boss, not a piñata).
source('warlordTusk', 'kill:grukk');
source('orcOdachi', 'kill:grukk');
source('vessBandolier', 'kill:captainVess');
source('tidewardenHeart', 'kill:tideWarden');

/** Everything a named foe can drop of its own: its uniques, boss, lair and sea-beast pieces. */
export function poolOf(kind: string): string[] {
  return [...new Set([...withTag(`kill:${kind}`), ...withTag(`boss:${kind}`), ...withTag(`lair:${kind}`), ...withTag(`beast:${kind}`)])];
}
/** What a foe of this kind may drop, by kind of drop (the bestiary's pages). */
export function dropTable(kind: string, tier: number) {
  const fam = familyOf(kind);
  const t = Math.max(1, Math.min(8, tier));
  return {
    parts: withTier(`drop:${fam}`, t).filter((id) => ITEMS[id].kind === 'material'),
    gear: [
      ...withTier(`drop:${fam}`, t, Math.max(1, t - 1)).filter((id) => ITEMS[id].kind !== 'material'),
      ...(ARMED.has(fam) ? withTier('drop:armed', t, Math.max(1, t - 1)) : []),
      ...(CASTER.has(fam) ? withTier('drop:caster', t, Math.max(1, t - 1)) : []),
    ],
    supplies: withTier('drop:any', t, 1),
    trophies: withTag(`trophy:${fam}`),
    uniques: poolOf(kind),
  };
}
/** How likely each rarity is to come out of a boss's pool; luck (the bestiary) leans it toward the rare end. */
const POOL_W: Record<string, number> = { common: 10, fine: 8, rare: 5, epic: 3, legendary: 1.5 };

export class CatalogSources {
  /** numbers for tests */
  readonly stats = { drops: 0, rewards: 0 };
  /** pool pieces dropped on the ground and not picked up yet */
  private lying = new Set<string>();

  constructor(private d: SourceDeps) {
    // (Bosses, lairs and sea beasts drop from their pools on the kill itself: one piece
    // each time, in onKill. They used to hand over the whole pool on the first kill.)
    events.on('enemyDied', (e) => this.onKill(e.kind, e.level, e.at));
    events.on('deed', ({ id }) => {
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

  /**
   * One piece from a named foe's pool, picked at random among those you don't
   * have yet; rarer pieces weigh more the better you know the foe (`lore`, the
   * bestiary's luck). When you hold the lot, it says so: farm something else.
   */
  poolDrop(kind: string, lore = 0, at?: import('three').Vector3): string | null {
    const all = poolOf(kind);
    // (A piece already lying on the floor counts as taken: it's coming to you either way.)
    for (const id of this.lying) if (this.d.owns(id)) this.lying.delete(id);
    const left = all.filter((id) => !this.given(id) && !this.lying.has(id));
    const who = bestiaryHook.name?.(kind) ?? kind;
    if (!left.length) {
      if (all.length) this.d.toast(`${who}: you already hold everything it carries.`);
      return null;
    }
    const luck = lore + (this.d.gear.fx.luck ?? 0);
    const w = left.map((id) => {
      const r = ITEMS[id].rarity;
      return (POOL_W[r] ?? 5) * (1 + luck * (RAR_RANK[r] ?? 0));
    });
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    let pick = left[left.length - 1];
    for (let i = 0; i < left.length; i++) {
      x -= w[i];
      if (x <= 0) {
        pick = left[i];
        break;
      }
    }
    // It falls where the foe did, glowing, and is never lost if left lying. (Not
    // flagged as given: owning it is what counts, so a piece you sell can drop again.)
    if (at && this.d.drop?.(pick, 1, at, true)) this.lying.add(pick);
    else this.d.give(pick, 1);
    this.d.toast(`${who} dropped: ${ITEMS[pick].name}${left.length > 1 ? ` (${all.length - left.length + 1} of ${all.length})` : all.length > 1 ? ' (the last of its hoard)' : ''}`);
    this.stats.rewards++;
    this.stats.drops++;
    events.emit('poolDrop', { kind, item: pick, left: left.length - 1, total: all.length });
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
    const dist = this.d.playerPos().distanceTo(at);
    // The bestiary's hunting lore: the more of a kind you've killed, the better its drops.
    const lore = bestiaryHook.luck?.(kind) ?? 0;
    // A named foe's own pool: one piece a kill (sea beasts can die a long way off the bow).
    const where = at as import('three').Vector3;
    if (dist <= 250 && poolOf(kind).length) this.poolDrop(kind, lore, dist <= 40 ? where : undefined);
    if (dist > 40) return;
    const fam = familyOf(kind);
    const tier = level ? Math.max(1, Math.min(8, tierOfLevel(level))) : Math.max(1, tierOfRegion(this.d.region()));
    const luck = 1 + (this.d.gear.fx.luck ?? 0) + lore;
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
    // On the ground where it fell, glowing its rarity; straight into the bag if it can't lie there.
    const bagged: string[] = [];
    for (const id of drops) {
      if (!this.d.drop?.(id, 1, where)) {
        this.d.give(id, 1);
        bagged.push(id);
      }
      this.stats.drops++;
    }
    if (bagged.length) this.d.toast(`Loot: ${bagged.map((id) => ITEMS[id].name).join(', ')}`);
  }

  // ---- shops -------------------------------------------------------------------------------------
  /** The catalog's stock for a shop: its kinds at the region's tier, and any faction it serves. */
  stockFor(who: string, title: string, intro: string, stock: Stock): Stock {
    const reg = this.d.region();
    const t = Math.max(1, Math.min(6, tierOfRegion(reg) || 1));
    // Ordinary counters don't carry treasure: fine goods at most near the start,
    // rare from the middle of the map, epic only in the far regions.
    const cap = t <= 2 ? 1 : t <= 4 ? 2 : 3;
    let kinds = KINDS.filter(([, rx]) => rx.test(`${who} ${title}`)).map(([k]) => k);
    // (Someone with no trade in their name or title: then their greeting may say it.)
    if (!kinds.length) kinds = KINDS.filter(([, rx]) => rx.test(intro)).map(([k]) => k).slice(0, 1);
    const text = `${who} ${title}`;
    const day = this.d.day();
    const seed = hash(who) + day;
    const have = new Set(stock.map(([id]) => id));
    const out: Stock = [];
    const put = (id: string, capAt = cap) => {
      if (have.has(id) || !ITEMS[id]) return;
      const d = ITEMS[id];
      if ((RAR_RANK[d.rarity] ?? 0) > capAt) return;
      // Only what one of their trades makes.
      if (kinds.length && !kinds.some((k) => fitsTrade(k, d))) return;
      have.add(id);
      out.push([id, priceOf(ITEMS[id])]);
    };
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
      // A quartermaster serves their whole faction (one grade better than a plain
      // counter); anyone else only stocks the faction's pieces of their own trade.
      const pool = withTag(`fshop:${key}`).filter((id) => ITEMS[id] && (qm || kinds.some((k) => fitsTrade(k, ITEMS[id]))));
      for (const id of rotate(pool, seed + key.length, qm ? 10 : 4)) put(id, qm ? cap + 1 : cap);
    }
    const all = [...stock, ...out];
    const off = this.d.gear.fx.shopDiscount ?? 0;
    return off > 0 ? all.map(([id, p]) => [id, Math.max(1, Math.round(p * (1 - Math.min(0.4, off))))]) : all;
  }
}

/** Is this a weapon or armour (shops sort them first)? */
export const isGear = (d: ItemDef) => d.kind === 'sword' || isWeaponKind(d.kind) || d.kind === 'armor' || d.kind === 'shield';
