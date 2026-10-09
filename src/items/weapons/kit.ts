import { sampleF, sampleV3, type HandPose, type ProcPose, type V3 } from '../../player/rigLayer';
import { ACTIONS, type ActionDef, type Flair } from '../../combat/actions';
import type { FamilyId } from './kinds';

// The shared kit every weapon family file builds from: what a family is
// (reach, hands, its moveset and how it plays with the three schools), and
// helpers for authoring its procedural poses and actions.
//
// A family's moveset replaces the sword's actions under the SAME ids
// (slash1..3, heavy, sprintAttack, airAttack, offslash1..2), so combos,
// charge-to-heavy, hyper-armour on heavies and every skill passive that
// reads those ids keep working; only the clip, the timing, the reach and
// the procedural layer change. Families add 'parryWeapon' (two-handed
// parries) and the ranged families 'shoot' and 'reload'.

export type MoveId = 'slash1' | 'slash2' | 'slash3' | 'heavy' | 'sprintAttack' | 'airAttack' | 'offslash1' | 'offslash2' | 'parryWeapon' | 'shoot' | 'reload';

/** How the school of the active combat class works with a family (plan §3). */
export interface SchoolAdapters {
  /** Gale Style (momentum): Flow per hit, and the family's twist on it */
  gale: { flow: number; note: string; tipFlow?: number; chainBleed?: number; stagger?: number; drawPerFlow?: number; reloadFlow?: number; castPerFlow?: number };
  /** Boundary Style (focus zone): radius, the frontal arc (cos), and what happens to an enemy that enters */
  boundary: { zone: number; inner?: number; arc: number; intercept: 'block' | 'push' | 'pull' | 'stun' | 'counter' | 'shot' | 'trap' | 'ward'; note: string };
  /** Cross Style (openings): after a parry or a dodge, the next blow (or shot) is an opening */
  cross: { opening: 'riposte' | 'feint' | 'guardBreak' | 'hook' | 'smash' | 'backstab' | 'counterShot' | 'counterBolt' | 'instantSpell'; mult: number; note: string };
}

export interface Hold {
  /** the right hand's guard (character space: +Z forward, +X left) */
  right: HandPose;
  /** the left hand's place along the grip (+Y metres from the right fist); omitted = one hand */
  off?: number;
  /** the left hand slides along the shaft to the point nearest this (spears) */
  slide?: V3;
}

export interface FamilyDef {
  id: FamilyId;
  name: string;
  /** plain words for the Crafting/inventory pages */
  feel: string;
  hands: 1 | 2;
  /** striking reach in metres from the body (for the record and the tests) */
  reach: number;
  moves: Partial<Record<MoveId, ActionDef>>;
  hold?: Hold;
  /** two-handed melee: block with the weapon itself (decision 1) */
  guard?: { block: number; stability: number };
  /** hyper-armour through the whole of these actions */
  hyperArmour?: string[];
  /** damage multiplier striking an enemy from behind */
  backstab?: number;
  schools: SchoolAdapters;
}

// ---- pose authoring --------------------------------------------------------------------
export const n3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
type Key<T> = [number, T];
export interface Track {
  grip: Key<V3>[];
  dir: Key<V3>[];
  normal: Key<V3>[];
  pole?: V3;
}
export function hand(track: Track, t: number, w = 1): HandPose {
  return { grip: sampleV3(track.grip, t), dir: n3(sampleV3(track.dir, t)), normal: n3(sampleV3(track.normal, t)), w, pole: track.pole };
}
export const curve = (keys: Key<number>[], t: number) => sampleF(keys, t);

/** A procedural action pose from a right-hand track and spine curves. */
export function trackPose(track: Track, yaw: Key<number>[], pitch: Key<number>[], drop: Key<number>[] = [[0, 0], [1, 0]]) {
  return (t: number): ProcPose => ({
    right: hand(track, t),
    spineYaw: curve(yaw, t),
    spinePitch: curve(pitch, t),
    hipsDrop: curve(drop, t),
  });
}

/** Where the second hand goes on a two-handed grip: `off` metres along the weapon from the right fist. */
export function secondHand(right: HandPose, off: number, slide?: V3): HandPose {
  const d = right.dir;
  let k = off;
  if (slide) {
    // The front hand stays put and the shaft slides through it (spear thrusts).
    const rel: V3 = [slide[0] - right.grip[0], slide[1] - right.grip[1], slide[2] - right.grip[2]];
    k = Math.max(0.22, Math.min(0.95, rel[0] * d[0] + rel[1] * d[1] + rel[2] * d[2]));
  }
  return {
    grip: [right.grip[0] + d[0] * k, right.grip[1] + d[1] * k, right.grip[2] + d[2] * k],
    dir: d,
    normal: [-right.normal[0], -right.normal[1], -right.normal[2]],
    w: right.w,
  };
}

export const F = (kind: Flair['kind'], from: number, to: number, amt: number): Flair => ({ kind, from, to, amt });

/** A family action under a base id; the sword's procedural pose stands in if the clip isn't loaded. */
export function act(id: MoveId, def: Omit<ActionDef, 'id'>): ActionDef {
  const fallback = ACTIONS[id === 'parryWeapon' ? 'parryDual' : id]?.proc;
  return { proc: fallback, ...def, id };
}

/** Same timing, a clip played `speed` times faster (clipTiming carries the speed). */
export const speedOf = (speed: number) => ({ clipTiming: { speed } });
