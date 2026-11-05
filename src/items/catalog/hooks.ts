import type { Target } from '../../combat/targets';
import type { Locks } from './locks';

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
  /** the lock system (items/catalog/locks.ts), once the game has made it */
  locks: Locks | null;
  /** dungeon secrets shimmer for you (a Deep-Eye Lantern, a Scroll of Detect Secrets) */
  secretSense: boolean;
  /** ship's guns reload this much faster (0.2 = 20%) */
  cannonReload: number;
  /** Sunwheel travel goes somewhere else (the Wrong-Turning Ring) */
  wheelRedirect: (<T>(chosen: T, all: T[]) => T) | null;
  /** a recipe's quality score bonus from gear in the pack (Fröst's hammer) */
  craftBonus: (calling: string | undefined) => number;
  /** salvage gives this much more (the Scavenger Rig) */
  salvage: number;
  /** chance a shot doesn't use up its arrow or bolt (bandoliers, a bag of holding) */
  ammoSave: number;
} = { shotMult: null, gather: null, fishLuck: 0, mods: {}, locks: null, secretSense: false, cannonReload: 0, wheelRedirect: null, craftBonus: () => 0, salvage: 0, ammoSave: 0 };
