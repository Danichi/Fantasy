import type { Target } from '../combat/targets';

// Who has lost track of the player (docs/design/origins.md §6): everyone while
// the elf's Moonveil hides them, and enemies the beastfolk's Savage Howl sent
// running. Enemy AIs ask `ignoresPlayer(this)` where they decide they're aware.

export const fearful = new Map<Target, number>();
export const stealth = {
  veiled: false,
  /** seconds of gear-given cover (items/catalog: a kill with the Gloam set, a smoke bomb) */
  gearVeil: 0,
  /** Hush (items/catalog): foes farther than this don't notice you (0: off) */
  hush: 0,
  /** where the player is (for hush) */
  at: { x: 0, y: 0, z: 0, copy(v: { x: number; y: number; z: number }) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } },
};

/** Should this enemy ignore the player right now? */
export function ignoresPlayer(t: unknown) {
  if (stealth.hush > 0) {
    const p = (t as Target).position;
    if (p && Math.hypot(p.x - stealth.at.x, p.z - stealth.at.z) > stealth.hush) return true;
  }
  return stealth.veiled || (fearful.get(t as Target) ?? 0) > 0;
}
