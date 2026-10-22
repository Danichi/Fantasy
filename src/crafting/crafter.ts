import { ITEMS, type ItemDef } from '../items/itemDefs';
import type { ItemInstance } from '../items/equipment';
import { DISC } from '../paths/data';
import { treeOf } from '../paths/paths';
import { SkillRuntime } from '../paths/skills';
import type { Player } from '../player/player';
import { events } from '../core/events';
import { isWeaponKind } from '../items/weapons/kinds';
import { computeQuality, COMMON, RUNES } from './quality';
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
      if (!n || n.type === 'active') continue;
      v += SkillRuntime.effect(calling, n, s.pick).x?.[key] ?? 0;
    }
    return v;
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
  private take(ing: string, n: number) {
    const eq = this.player.equip;
    let left = n, qsum = 0;
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
      bonus: this.x(r.calling, 'potency') * 2 + (masterwork ? 0.5 : 0),
    });
  }

  /** Make it: materials out of the pack, the thing (at its quality) in. */
  craft(r: Recipe, notches: number, station = 0): CraftResult | string {
    const s = this.status(r);
    if (s === 'unknown') return 'You don’t know how to make that yet.';
    if (s === 'level') return `Needs ${DISC[r.calling!]?.name} level ${r.level}.`;
    if (s === 'missing') return `Missing ${this.missing(r).map((i) => GROUPS[i.id]?.name ?? ITEMS[i.id]?.name ?? i.id).join(', ')}.`;
    let qsum = 0, qn = 0;
    for (const i of r.inputs) {
      qsum += this.take(i.id, i.n);
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
    const p = this.player;
    const inst = p.equip.add(r.out, n, q === COMMON ? undefined : q);
    p.prog.addXp(3 + r.level * 2);
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
    return { inst, n, q };
  }

  // ---- salvage -------------------------------------------------------------------------------------
  /** What salvaging this would give back (about half the materials). */
  salvageYield(it: ItemInstance) {
    const r = MADE_BY[it.def.id];
    if (!r || !r.quality || !isGear(it.def)) return null;
    return r.inputs.filter((i) => !GROUPS[i.id]).map((i, k) => ({ id: i.id, n: Math.max(k === 0 ? 1 : 0, Math.floor(i.n / 2)) })).filter((i) => i.n > 0);
  }
  canSalvage(it: ItemInstance) {
    return !this.player.equip.slotOf(it.uid) && !!this.salvageYield(it);
  }
  salvage(uid: number) {
    const eq = this.player.equip, it = eq.get(uid);
    if (!it || !this.canSalvage(it)) return null;
    const back = this.salvageYield(it)!;
    if (it.qty > 1) it.qty--;
    else eq.items = eq.items.filter((x) => x !== it);
    for (const b of back) eq.add(b.id, b.n);
    events.emit('equipmentChanged', {});
    return back;
  }

  // ---- runes ---------------------------------------------------------------------------------------
  /** Can this rune go on this item? */
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
    const slot = eq.slotOf(uid);
    if (slot) eq.unequip(slot);
    if (it.qty > 1) it.qty--;
    else eq.items = eq.items.filter((x) => x !== it);
    const made = eq.add(it.def.id, 1, it.q, rid);
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
