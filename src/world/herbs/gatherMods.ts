// Gathering modifiers: the hook the Herbalism discipline uses to make the
// player a better forager. Shared by foraging (plants) and reagent drops
// (beast parts), so one call scales both.
//
//   import { setGatherModifiers } from '../world/foraging';
//   setGatherModifiers({ yieldBonus: 0.5, rareChance: 0.15, showProps: true });
//
// yieldBonus  extra stems per gather: the whole part is always added, the
//             fraction is a chance of one more (0.5 = +1 half the time).
// rareChance  0..1 added to the odds of rare finds: more of the hidden rare
//             plant nodes show themselves in the world, gathers turn up a rare
//             companion plant more often, and beasts drop reagents more often.
// showProps   true (or a per-reagent test) names each plant's properties in
//             the gather prompt ("Gather Foxglove — poison, heal").
// regrowMul   multiplies regrowth time (0.75 = plants come back 25% sooner).
// Fields left out of a call keep their current values.

export interface GatherModifiers {
  yieldBonus: number;
  rareChance: number;
  showProps: boolean | ((id: string) => boolean);
  regrowMul: number;
}

export const gatherMods: GatherModifiers = { yieldBonus: 0, rareChance: 0, showProps: false, regrowMul: 1 };

export function setGatherModifiers(m: Partial<GatherModifiers>) {
  if (m.yieldBonus !== undefined) gatherMods.yieldBonus = Math.max(0, m.yieldBonus);
  if (m.rareChance !== undefined) gatherMods.rareChance = Math.max(0, Math.min(1, m.rareChance));
  if (m.showProps !== undefined) gatherMods.showProps = m.showProps;
  if (m.regrowMul !== undefined) gatherMods.regrowMul = Math.max(0.1, m.regrowMul);
}

/** Does the Herbalism system say this reagent's properties are known? */
export function propsKnownByMods(id: string) {
  const s = gatherMods.showProps;
  return typeof s === 'function' ? s(id) : s;
}

/** Whole extra stems from yieldBonus, rolling the fractional part. */
export function bonusYield(rnd = Math.random) {
  const b = gatherMods.yieldBonus;
  return Math.floor(b) + (rnd() < b - Math.floor(b) ? 1 : 0);
}
