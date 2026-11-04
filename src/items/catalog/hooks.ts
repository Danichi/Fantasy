import type { Target } from '../../combat/targets';

// Small hooks the item catalog's gear effects reach into other systems through
// (items/catalog/gearRuntime.ts sets them). Kept free of imports so any module
// can read them without pulling in the catalog.
export const GEAR: {
  /** a shot's damage multiplier against this target (banes, conditions) */
  shotMult: ((t: Target) => number) | null;
  /** extra gathering bonus for a key ('yield', 'oreYield', 'woodYield') */
  gather: ((key: string) => number) | null;
  /** extra weight on rare fish (lures) */
  fishLuck: number;
  /** combat modifiers from gear (the arms runtime adds them after buffs) */
  mods: Record<string, number>;
} = { shotMult: null, gather: null, fishLuck: 0, mods: {} };
