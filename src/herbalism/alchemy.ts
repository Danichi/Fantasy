import { REAGENTS, type Prop } from '../items/reagents';
import { levelCost } from '../paths/paths';
import { RECIPES, TIER_LEVEL, type BaseId, type RecipeDef } from './recipes';

// The rules of the pot: what a set of reagents adds up to, which recipe it
// makes, and how good the result is. Pure functions (the UI previews with the
// same code the brewing uses).

export type Stir = 'perfect' | 'good' | 'poor' | 'skip';

/** Each reagent adds every one of its properties once. */
export function mixProps(ings: string[]) {
  const m: Partial<Record<Prop, number>> = {};
  for (const id of ings) for (const p of REAGENTS[id]?.props ?? []) m[p] = (m[p] ?? 0) + 1;
  return m;
}

export function satisfies(r: RecipeDef, ings: string[], base: BaseId) {
  if (r.base !== base || ings.length < 2 || ings.length > 4) return false;
  const m = mixProps(ings);
  for (const [p, n] of Object.entries(r.needs) as [Prop, number][]) if ((m[p] ?? 0) < n) return false;
  if (r.key && !r.key.some((k) => ings.includes(k))) return false;
  return true;
}

/** How specific a recipe is: the more it asks for, the more it wins a tie. */
function weight(r: RecipeDef) {
  return Object.values(r.needs).reduce((a, b) => a + (b ?? 0), 0) + (r.key ? 3 : 0);
}

/** Properties in the pot that the recipe doesn't use (binders and potency never count). */
export function impurities(r: RecipeDef, ings: string[]) {
  const m = mixProps(ings);
  return (Object.keys(m) as Prop[]).filter((p) => !(p in r.needs) && p !== 'binder' && p !== 'potency');
}

/** Every recipe this pot satisfies, most specific (then purest) first. */
export function candidates(ings: string[], base: BaseId): RecipeDef[] {
  return RECIPES.filter((r) => satisfies(r, ings, base)).sort((a, b) => weight(b) - weight(a) || impurities(a, ings).length - impurities(b, ings).length);
}

export interface MixResult {
  /** the recipe that comes out (null: sludge) */
  recipe: RecipeDef | null;
  /** it wasn't known: brewing it discovers it */
  discovered: boolean;
  /** a better recipe matched but needs a tree node (name) to brew */
  lockedBy: { recipe: RecipeDef; node: string } | null;
}

/**
 * What the pot makes for someone who knows `known`: the most specific known
 * recipe, unless a more specific discoverable one also matches (that one is
 * discovered). Tree recipes can't be discovered, only hinted at.
 */
export function resolveMix(ings: string[], base: BaseId, known: (id: string) => boolean): MixResult {
  let lockedBy: MixResult['lockedBy'] = null;
  for (const r of candidates(ings, base)) {
    if (known(r.id)) return { recipe: r, discovered: false, lockedBy };
    if (r.src.discover) return { recipe: r, discovered: true, lockedBy };
    if (!lockedBy && r.src.node) lockedBy = { recipe: r, node: r.src.node };
  }
  return { recipe: null, discovered: false, lockedBy };
}

/** Highest reagent tier this Herbalism level can work (Rare Roots adds one). */
export function tierCap(level: number, bonus = 0) {
  let t = 0;
  for (let i = 1; i <= 5; i++) if (level >= TIER_LEVEL[i]) t = i;
  return Math.min(5, t + bonus);
}

export interface QualityIn {
  stir: Stir;
  station: boolean;
  level: number;
  recipe: RecipeDef;
  ings: string[];
  perks: (k: string) => number;
}

/** The quality a brew comes out at (1 Crude .. 5 Masterwork), with the reasons. */
export function quality(o: QualityIn): { q: number; why: string[] } {
  const why: string[] = [];
  const P = o.perks;
  let stir = o.stir;
  if (stir === 'poor' && P('minQuality') >= 2) stir = 'good';
  let s = stir === 'perfect' ? 2 : stir === 'good' ? 1 : 0;
  why.push(stir === 'perfect' ? 'Perfect pour +2' : stir === 'good' ? 'Good pour +1' : stir === 'skip' ? 'Stirred without care +0' : 'Poor pour +0');
  if (o.station) {
    s += 1;
    why.push('Alchemy table +1');
  }
  if (o.level >= 10) (s += 1), why.push('Herbalism 10 +1');
  if (o.level >= 20) (s += 1), why.push('Herbalism 20 +1');
  const pot = mixProps(o.ings).potency ?? 0;
  const potMax = P('potent') > 0 ? 2 : 1;
  if (pot > 0) {
    const k = Math.min(potMax, pot);
    s += k;
    why.push(`Potency +${k}`);
  }
  const tiers = o.ings.map((id) => REAGENTS[id]?.tier ?? 1);
  const avg = tiers.reduce((a, b) => a + b, 0) / Math.max(1, tiers.length);
  if (avg >= o.recipe.tier + 1) (s += 1), why.push('Fine reagents +1');
  const imp = impurities(o.recipe, o.ings);
  if (imp.length >= 2) (s -= 1), why.push(`Impurities (${imp.join(', ')}) -1`);
  if (o.recipe.cat === 'elixir' && o.station && P('elixirQ') > 0) (s += 1), why.push('Steady Heat +1');
  if (P('masterQ') > 0) (s += 1), why.push('Master Brewer +1');
  let q = Math.max(1, Math.min(5, s));
  const min = P('minQuality');
  if (min > q) q = min;
  if (!o.station && q > 3) {
    q = 3;
    why.push('Field kit: Fine at best');
  }
  return { q, why };
}

/** Extra binders (beyond what the recipe needs) stretch the batch: one more flask each, two at most. */
export function binderFlasks(r: RecipeDef, ings: string[]) {
  const extra = Math.max(0, (mixProps(ings).binder ?? 0) - (r.needs.binder ?? 0));
  return Math.min(2, extra);
}

/** Practice needed to go from Herbalism level L to L+1 (half what investing XP costs). */
export const practiceNeed = (L: number) => Math.round(levelCost(L) * 0.5);
