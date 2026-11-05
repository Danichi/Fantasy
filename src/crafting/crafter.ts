import { GEAR } from '../items/catalog/hooks';
import { ITEMS, type ItemDef } from '../items/itemDefs';
import type { ItemInstance } from '../items/equipment';
import { DISC } from '../paths/data';
import { treeOf } from '../paths/paths';
import { SkillRuntime } from '../paths/skills';
import type { Player } from '../player/player';
import { events } from '../core/events';
import { isWeaponKind } from '../items/weapons/kinds';
import { computeQuality, COMMON, RUNES, runeOf, runeBase, MAX_QUALITY } from './quality';
import { RECIPES, GROUPS, MADE_BY, BOOK_RECIPES, RUNE_ITEMS, type Recipe, type StationKind, type CallingId } from './recipes';

// The crafting rules (docs/design/arms-and-crafting.md §5 and §6): which
// recipes you know, what you're missing, the craft itself (materials in,
// quality out), salvage, runes and discovery. The craft page (ui/craftUI.ts)
// and the gathering nodes call into this; nothing here touches the DOM.

const isWeapon = (d: ItemDef) => isWeaponKind(d.kind);
const isGear = (d: ItemDef) => isWeapon(d) || d.kind === 'shield' || d.kind === 'armor' || d.kind === 'accessory';

export type Status = 'ok' | 'unknown' | 'level' | 'missing';

export interface CraftResult {
  inst: ItemInstance;
  n: number;
  q?: number;
}

/** What tempering a piece would take, or why it can't be done. */
export interface TemperPlan {
  ok: boolean;
  why?: string;
  /** the quality it would reach */
  to?: number;
  cost?: { id: string; n: number }[];
  /** the chance it cracks (materials lost, the piece unchanged) */
  crack?: number;
}

/** What kind of thing a recipe makes, for quests that ask for one ("forge a weapon", "cook a meal"). */
function gearOf(r: Recipe) {
  const d = ITEMS[r.out];
  if (!d) return 'other';
  if (r.station === 'kitchen') return 'meal';
  if (isWeapon(d)) return 'weapon';
  if (d.kind === 'armor' || d.kind === 'shield') return 'armor';
  if (d.kind === 'accessory') return 'jewel';
  return 'other';
}

const HEAVY_KINDS = new Set(['greatsword', 'axe', 'mace', 'hammer', 'warhammer', 'greataxe']);
const CLOTH = new Set(['woolCloth', 'linen', 'silk']);
const CALLINGS = ['smithing', 'cooking', 'tailoring', 'runecraft', 'herbalism', 'jewelcrafting', 'prospecting'];

export class Crafter {
  /** recipes learned from books and by discovery (the rest follow from the Callings and their trees) */
  readonly learned = new Set<string>();
  /** the timing step turned off: always "good" timing, one quality notch lower */
  quick = false;
  onLearn?: (r: Recipe[], how: 'book' | 'discovery') => void;

  constructor(private player: Player, private rnd: () => number = Math.random) {}

  // ---- the Callings ------------------------------------------------------------------------------
  /** Names of the nodes learned in a Calling's tree. */
  private nodeNames(calling: string) {
    const d = DISC[calling], t = d && treeOf(d), out = new Set<string>();
    if (!t) return out;
    for (const nid of Object.keys(this.player.paths.nodes[calling] ?? {})) {
      const n = t.map[nid];
      if (n) out.add(n.name);
    }
    return out;
  }

  /** A Calling's crafting bonus ('yield', 'potency', 'gather', 'twice', 'rare'), summed over its learned nodes. */
  x(calling: string | undefined, key: string) {
    if (!calling) return 0;
    const d = DISC[calling], t = d && treeOf(d);
    if (!t) return 0;
    let v = 0;
    for (const [nid, s] of Object.entries(this.player.paths.nodes[calling] ?? {})) {
      const n = t.map[nid];
      if (!n) continue;
      // A Calling's techniques (its '*' nodes) grow a quarter with each rank.
      const k = n.type === 'active' ? 1 + 0.25 * ((s.r ?? 1) - 1) : 1;
      v += (SkillRuntime.effect(calling, n, s.pick).x?.[key] ?? 0) * k;
    }
    return v + (this.extra?.(calling, key) ?? 0);
  }
  /** a Calling bonus from outside its tree (mastery perks: paths/mastery.ts) */
  extra?: (calling: string, key: string) => number;
  /** A bonus summed over every Calling (gathering yield, practice in all of them). */
  total(key: string) {
    return CALLINGS.reduce((v, c) => v + (this.player.paths.learned(c) ? this.x(c, key) : 0), 0);
  }
  /** Has this Calling's node been learned? */
  hasNode(calling: string, name: string) {
    return this.nodeNames(calling).has(name);
  }

  /** The quality keys a recipe answers to (callingPassives.ts). */
  cats(r: Recipe): string[] {
    const d = ITEMS[r.out];
    if (!d) return [];
    const out = ['qAll'];
    if (r.calling === 'jewelcrafting') {
      if (d.kind === 'accessory') out.push('qJewel');
    } else if (r.station === 'kitchen') out.push('qMeal');
    else if (r.station === 'loom') {
      if (/satchel|belt|bag|pack/i.test(d.id)) out.push('qPack');
      else if (r.inputs.some((i) => CLOTH.has(i.id)) && !r.inputs.some((i) => /leather/i.test(i.id))) out.push('qCloth');
      else out.push('qLeather');
    } else if (isWeapon(d)) out.push(...(r.station === 'workbench' ? ['qRanged'] : ['qWeapon', HEAVY_KINDS.has(d.kind) ? 'qHeavy' : 'qLight']));
    else if (d.kind === 'shield') out.push('qArmor', 'qShield', 'qHeavyArmor');
    else if (d.kind === 'armor') out.push('qArmor', ['head', 'hands', 'feet'].includes(d.slot ?? '') ? 'qLightArmor' : 'qHeavyArmor');
    return out;
  }

  level(r: Recipe) {
    return r.calling ? this.player.paths.level(r.calling) : 99;
  }

  knows(r: Recipe) {
    if (r.calling && !this.player.paths.learned(r.calling)) return false;
    if (r.learn === 'basic') return true;
    if (r.learn === 'node') return !!r.calling && this.nodeNames(r.calling).has(r.node ?? ITEMS[r.out]?.name ?? '');
    return this.learned.has(r.id);
  }

  /** Recipes at a station: known ones first, then the ones you could learn (shown as hints). */
  at(station: StationKind) {
    return RECIPES.filter((r) => r.station === station);
  }

  // ---- materials -----------------------------------------------------------------------------------
  private matches(ing: string, it: ItemInstance) {
    const g = GROUPS[ing];
    if (g ? !g.ids.includes(it.def.id) : it.def.id !== ing) return false;
    // Worn gear never goes into the pot.
    return !(isGear(it.def) && this.player.equip.slotOf(it.uid));
  }
  count(ing: string) {
    return this.player.equip.items.reduce((n, it) => n + (this.matches(ing, it) ? it.qty : 0), 0);
  }
  missing(r: Recipe) {
    return r.inputs.filter((i) => this.count(i.id) < i.n);
  }

  status(r: Recipe): Status {
    if (!this.knows(r)) return 'unknown';
    if (this.level(r) < r.level) return 'level';
    if (this.missing(r).length) return 'missing';
    return 'ok';
  }

  /** Take an ingredient out of the pack; returns the quality of what was used. */
  private take(ing: string, n: number, save = 0) {
    const eq = this.player.equip;
    // A sure hand wastes nothing: each unit may be spared (still counted for quality).
    let spared = 0;
    if (save > 0) for (let i = 0; i < n; i++) if (this.rnd() < save) spared++;
    let left = n - spared, qsum = spared * COMMON;
    // Use the plainest first, so fine materials are kept for when they matter.
    const stacks = eq.items.filter((it) => this.matches(ing, it)).sort((a, b) => (a.q ?? COMMON) - (b.q ?? COMMON));
    for (const it of stacks) {
      const k = Math.min(left, it.qty);
      qsum += k * (it.q ?? COMMON);
      it.qty -= k;
      left -= k;
      if (it.qty <= 0) {
        const slot = eq.slotOf(it.uid);
        if (slot) eq.unequip(slot);
        eq.items = eq.items.filter((x) => x !== it);
        eq.quick = eq.quick.map((u) => (u === it.uid ? null : u));
      }
      if (left <= 0) break;
    }
    return qsum;
  }

  /** The quality this craft would come out at, with this many good beats. */
  preview(r: Recipe, notches: number, station = 0) {
    if (!r.quality) return undefined;
    const d = ITEMS[r.out];
    const masterwork = d && isGear(d) ? (isWeapon(d) ? this.nodeNames('smithing').has('Masterwork') : this.nodeNames('smithing').has('Masterwork Plate')) : false;
    return computeQuality({
      level: this.level(r),
      mats: 1,
      station,
      notches: this.quick ? 2 : notches,
      bonus: this.x(r.calling, 'potency') * 2 + (masterwork ? 0.5 : 0) + this.cats(r).reduce((v, k) => v + this.x(r.calling, k), 0) + GEAR.craftBonus(r.calling),
    });
  }

  /** Make it: materials out of the pack, the thing (at its quality) in. */
  craft(r: Recipe, notches: number, station = 0): CraftResult | string {
    const s = this.status(r);
    if (s === 'unknown') return 'You don’t know how to make that yet.';
    if (s === 'level') return `Needs ${DISC[r.calling!]?.name} level ${r.level}.`;
    if (s === 'missing') return `Missing ${this.missing(r).map((i) => GROUPS[i.id]?.name ?? ITEMS[i.id]?.name ?? i.id).join(', ')}.`;
    let qsum = 0, qn = 0;
    const save = Math.min(0.6, this.x(r.calling, 'save'));
    for (const i of r.inputs) {
      qsum += this.take(i.id, i.n, save);
      qn += i.n;
    }
    let q = this.preview(r, notches, station);
    if (q !== undefined) {
      // Fine materials lift the result (quality.ts weighs them).
      const mats = qn ? qsum / qn : COMMON;
      if (mats > COMMON) q = Math.min(5, q + Math.floor((mats - COMMON) * 0.55 + 0.001));
    }
    let n = r.n ?? 1;
    if (this.rnd() < this.x(r.calling, 'twice')) n *= 2;
    // Refining: an extra ingot from a good smelt, an extra hide or bolt from the loom, a double bundle of arrows.
    else if (!r.quality) {
      const extra = r.station === 'forge' ? this.x('smithing', 'smelt') : r.station === 'loom' ? this.x('tailoring', 'tan') : ITEMS[r.out]?.kind === 'ammo' ? this.total('arrows') : 0;
      if (extra > 0 && this.rnd() < extra) n += r.n ?? 1;
    }
    const p = this.player;
    const inst = p.equip.add(r.out, n, q === COMMON ? undefined : q);
    p.prog.addXp(3 + r.level * 2);
    this.onCrafted?.(r, q, n);
    events.emit('crafted', { recipe: r.id, item: r.out, calling: r.calling ?? '', station: r.station, q: q ?? COMMON, n, level: r.level, gear: gearOf(r) });
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
    return { inst, n, q };
  }

  /** Something was made (practice: crafting/practice.ts). */
  onCrafted?: (r: Recipe, q: number | undefined, n: number) => void;

  // ---- tempering ------------------------------------------------------------------------------------
  /**
   * Raise a piece you own a quality step, for a little of what it was made from:
   * metal at a forge (Smithing's Temper), leather and cloth at a loom (Tailoring's
   * Double Stitch). Past Fine there's a chance the piece cracks: the materials are
   * lost, the piece is unchanged.
   */
  temperPlan(it: ItemInstance, station: StationKind): TemperPlan {
    const r = MADE_BY[it.def.id];
    if (!r || !r.quality || !isGear(it.def)) return { ok: false, why: 'Nobody could temper that: it wasn’t made at a forge or a loom.' };
    const loom = r.station === 'loom';
    if (loom !== (station === 'loom')) return { ok: false, why: loom ? 'Leather and cloth are tempered at a loom.' : 'Metal is tempered at a forge.' };
    const calling = loom ? 'tailoring' : 'smithing';
    if (!this.player.paths.learned(calling)) return { ok: false, why: `Tempering needs ${DISC[calling].name}.` };
    if (loom ? this.x('tailoring', 'loomTemper') <= 0 : !this.hasNode('smithing', 'Temper')) return { ok: false, why: loom ? 'Learn Double Stitch (Tailoring) to temper what you sew.' : 'Learn Temper (Smithing) to temper gear.' };
    if (it.rune && this.x('smithing', 'runeTemper') <= 0) return { ok: false, why: 'A runed piece can’t be tempered without Runed Temper (Smithing).' };
    const q = it.q ?? COMMON;
    const cap = Math.min(MAX_QUALITY, 3 + Math.round(this.x(calling, 'temperCap')) + GEAR.craftBonus(calling));
    if (q >= cap) return { ok: false, why: q >= MAX_QUALITY ? 'It can’t be made any finer.' : `As fine as your tempering can make it (${['Crude', 'Common', 'Fine', 'Superior', 'Masterwork', 'Legendary'][cap]}).` };
    const mult = Math.max(0.25, 1 - this.x(calling, 'temperCheap'));
    const main = r.inputs.find((i) => !GROUPS[i.id]) ?? r.inputs[0];
    const cost = [{ id: main.id, n: Math.max(1, Math.round((1 + Math.max(0, q - COMMON)) * mult)) }];
    if (!loom) cost.push({ id: 'coal', n: 1 });
    const crack = q <= COMMON ? 0 : Math.max(0, 0.12 * (q - COMMON) - this.x(calling, 'temperSafe'));
    return { ok: true, to: q + 1, cost, crack };
  }

  temper(uid: number, station: StationKind): { inst?: ItemInstance; cracked?: boolean; why?: string } {
    const eq = this.player.equip, it = eq.get(uid);
    if (!it) return { why: 'You aren’t carrying that.' };
    const plan = this.temperPlan(it, station);
    if (!plan.ok) return { why: plan.why };
    const short = plan.cost!.find((c) => this.count(c.id) < c.n);
    if (short) return { why: `Needs ${short.n} × ${ITEMS[short.id]?.name ?? short.id}.` };
    for (const c of plan.cost!) this.take(c.id, c.n);
    const r = MADE_BY[it.def.id]!;
    this.onCrafted?.(r, plan.to, 0);
    if (this.rnd() < plan.crack!) {
      events.emit('equipmentChanged', {});
      return { cracked: true };
    }
    // A runed piece keeps its rune, a little stronger for the heat (Runed Temper).
    let rune = it.rune;
    const ro = runeOf(rune);
    if (ro) rune = `${runeBase(rune)}*${(ro.k * 1.1).toFixed(2)}`;
    const slot = eq.slotOf(uid);
    if (slot) eq.unequip(slot);
    if (it.qty > 1) it.qty--;
    else eq.items = eq.items.filter((x) => x !== it);
    const made = eq.add(it.def.id.replace(/\|.*/, ''), 1, plan.to, rune);
    if (slot) eq.equip(made.uid, slot);
    events.emit('crafted', { recipe: 'temper:' + r.id, item: r.out, calling: r.station === 'loom' ? 'tailoring' : 'smithing', station, q: plan.to!, n: 1, level: r.level, temper: true, gear: gearOf(r) });
    events.emit('equipmentChanged', {});
    return { inst: made };
  }

  // ---- techniques: sharpen and patch -----------------------------------------------------------------
  /** Smithing's Sharpen and Patch Armour, as timed buffs (arms.ts applies them). */
  technique(kind: 'sharpen' | 'patch'): { id: string; label: string; sec: number; m: Record<string, number> } | null {
    if (!this.hasNode('smithing', kind === 'sharpen' ? 'Sharpen' : 'Patch Armour')) return null;
    const sec = 600 * (1 + this.x('smithing', 'sharpTime'));
    if (kind === 'sharpen') return { id: 'sharpened', label: 'Sharpened', sec, m: { melee: this.x('smithing', 'sharpen') } };
    return { id: 'patched', label: 'Patched armour', sec, m: { dmgTaken: -this.x('smithing', 'patch') } };
  }

  // ---- salvage -------------------------------------------------------------------------------------
  /** What salvaging this would give back (about half the materials). */
  salvageYield(it: ItemInstance) {
    const r = MADE_BY[it.def.id];
    if (!r || !r.quality || !isGear(it.def)) return null;
    const more = Math.min(1, this.x(r.calling, 'salvage'));
    return r.inputs.filter((i) => !GROUPS[i.id]).map((i, k) => ({ id: i.id, n: Math.max(k === 0 ? 1 : 0, Math.floor(i.n / 2 + (i.n / 2) * more)) })).filter((i) => i.n > 0);
  }
  canSalvage(it: ItemInstance) {
    return !this.player.equip.slotOf(it.uid) && !!this.salvageYield(it);
  }
  salvage(uid: number) {
    const eq = this.player.equip, it = eq.get(uid);
    if (!it || !this.canSalvage(it)) return null;
    const back = this.salvageYield(it)!.map((b) => ({ ...b }));
    // The Scavenger Rig: more comes back out of everything you break down.
    if (GEAR.salvage > 0) for (const b of back) b.n += Math.floor(b.n * GEAR.salvage) + (Math.random() < (b.n * GEAR.salvage) % 1 ? 1 : 0);
    if (it.qty > 1) it.qty--;
    else eq.items = eq.items.filter((x) => x !== it);
    for (const b of back) eq.add(b.id, b.n);
    events.emit('equipmentChanged', {});
    return back;
  }

  // ---- runes ---------------------------------------------------------------------------------------
  /** Can this rune go on this item? */
  /** How strongly you'd cut this rune now (Runecraft's Edges and Wards). */
  runePower(runeItem: string) {
    const rune = RUNES[RUNE_ITEMS[runeItem]];
    if (!rune) return 1;
    return Math.max(0.5, 1 + this.x('runecraft', rune.on === 'armor' ? 'runeWard' : 'runeEdge'));
  }
  fits(runeItem: string, it: ItemInstance) {
    const rune = RUNES[RUNE_ITEMS[runeItem]];
    if (!rune) return false;
    if (rune.on === 'armor') return it.def.kind === 'armor';
    if (rune.id === 'returning') return it.def.kind === 'bow' || it.def.kind === 'crossbow';
    return isWeapon(it.def);
  }
  /** Cut a rune into a weapon or armour (it replaces any rune already there). */
  inscribe(uid: number, runeItem: string) {
    const eq = this.player.equip, it = eq.get(uid), rid = RUNE_ITEMS[runeItem];
    if (!it || !rid || !this.fits(runeItem, it) || this.count(runeItem) < 1) return null;
    this.take(runeItem, 1);
    // The old rune comes back out whole (Runed Temper, Speaker of Stone).
    const old = runeBase(it.rune);
    if (old && this.x('runecraft', 'runeKeep') > 0) {
      const back = Object.entries(RUNE_ITEMS).find(([, v]) => v === old)?.[0];
      if (back) eq.add(back, 1);
    }
    const k = this.runePower(runeItem);
    const cut = k > 1.001 || k < 0.999 ? `${rid}*${k.toFixed(2)}` : rid;
    const slot = eq.slotOf(uid);
    if (slot) eq.unequip(slot);
    if (it.qty > 1) it.qty--;
    else eq.items = eq.items.filter((x) => x !== it);
    const made = eq.add(it.def.id, 1, it.q, cut);
    if (slot) eq.equip(made.uid, slot);
    events.emit('equipmentChanged', {});
    return made;
  }

  // ---- learning ------------------------------------------------------------------------------------
  /** Read a recipe book: learn what it teaches. */
  readBook(bookId: string) {
    const got = BOOK_RECIPES(bookId).filter((r) => !this.learned.has(r.id));
    for (const r of got) this.learned.add(r.id);
    if (got.length) this.onLearn?.(got, 'book');
    return got;
  }

  /** Try materials together at a station: the right set teaches a recipe. */
  discover(station: StationKind, ids: string[]) {
    const want = [...new Set(ids)].sort().join('|');
    const r = RECIPES.find((x) => x.learn === 'discover' && x.station === station && [...new Set(x.inputs.map((i) => i.id))].sort().join('|') === want);
    if (!r) return { ok: false as const, why: 'Nothing comes of it.' };
    if (this.learned.has(r.id)) return { ok: false as const, why: `You already know ${ITEMS[r.out].name}.` };
    if (r.calling && !this.player.paths.learned(r.calling)) return { ok: false as const, why: `Something almost happens. ${DISC[r.calling].name} would tell you what.` };
    if (this.level(r) < r.level) return { ok: false as const, why: `Something almost happens. You need ${DISC[r.calling!].name} ${r.level} to see it.` };
    this.learned.add(r.id);
    this.onLearn?.([r], 'discovery');
    return { ok: true as const, recipe: r };
  }

  /** The Calling a station trains, for its label. */
  static callingOf(station: StationKind): CallingId | undefined {
    return ({ forge: 'smithing', workbench: 'smithing', alchemy: 'herbalism', kitchen: 'cooking', runestone: 'runecraft', loom: 'tailoring' } as const)[station];
  }

  toJSON() {
    return { recipes: [...this.learned], quick: this.quick };
  }
  fromJSON(d?: { recipes?: string[]; quick?: boolean }) {
    this.learned.clear();
    for (const id of d?.recipes ?? []) this.learned.add(id);
    this.quick = !!d?.quick;
  }
}
