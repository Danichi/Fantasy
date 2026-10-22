import type { Target } from '../combat/targets';

// Who has lost track of the player (docs/design/origins.md §6): everyone while
// the elf's Moonveil hides them, and enemies the beastfolk's Savage Howl sent
// running. Enemy AIs ask `ignoresPlayer(this)` where they decide they're aware.

export const fearful = new Map<Target, number>();
export const stealth = { veiled: false };

/** Should this enemy ignore the player right now? */
export function ignoresPlayer(t: unknown) {
  return stealth.veiled || (fearful.get(t as Target) ?? 0) > 0;
}
