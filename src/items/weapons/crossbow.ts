import type { ProcPose, V3 } from '../../player/rigLayer';
import { act, curve, F, n3, type FamilyDef } from './kit';

// Crossbows: slow, heavy bolts that pierce armour, then a reload. Aim with
// right mouse and shoot with attack like a bow, but there's no draw: a loaded
// crossbow fires at full strength at once. After a shot, attack (or any shot
// attempt) cranks the string back first. Shooting lives in combat/ranged.ts.

/** Shouldered, sighting down the stock toward `pitch`. */
export function sightPose(pitch: number, w = 1): ProcPose {
  const up = Math.sin(pitch), fw = Math.cos(pitch);
  const grip: V3 = [-0.12, 1.42 + up * 0.15, 0.22];
  return { right: { grip, dir: n3([0.04, up, fw]), normal: n3([1, 0, 0]), w }, spineYaw: -0.1 * w, headPitch: -pitch * 0.4 * w };
}
/** Carried at the hip, pointing ahead and a little down. */
export const CROSSBOW_CARRY = { grip: [-0.18, 1.0, 0.2] as V3, dir: n3([0.1, -0.1, 1]), normal: [1, 0, 0] as V3, w: 1 };

/** Foot in the stirrup, both hands hauling the string back. */
function reloadPose(t: number): ProcPose {
  const k = curve([[0, 0], [0.15, 1], [0.85, 1], [1, 0]], t);
  const pull = curve([[0, 0], [0.3, 0], [0.75, 1], [1, 1]], t);
  const grip: V3 = [-0.1, 0.75 + pull * 0.25, 0.42 - pull * 0.12];
  return {
    right: { grip, dir: n3([0, -1, 0.15]), normal: [1, 0, 0], w: k },
    spinePitch: 0.55 * k, hipsDrop: 0.16 * k,
  };
}

export const CROSSBOW: FamilyDef = {
  id: 'crossbow', name: 'Crossbow', hands: 2, reach: 70,
  feel: 'Slow bolts that pierce armour and guards, then a reload. No draw: loaded means ready.',
  hold: { right: { ...CROSSBOW_CARRY }, off: 0.32 },
  moves: {
    slash1: act('slash1', { dur: 0.55, stamina: 4, proc: (t) => sightPose(0, curve([[0, 0], [0.2, 1], [0.8, 1], [1, 0]], t)), events: [{ at: 0.18, name: 'arms:loose' }], cancel: 0.35, track: 0.18 }),
    reload: act('reload', { dur: 1.5, stamina: 8, proc: reloadPose, events: [{ at: 1.2, name: 'arms:loaded' }], cancel: 0.35, track: 0, flair: [F('crouch', 0.1, 1.4, 0.06)] }),
  },
  schools: {
    gale: { flow: 1, reloadFlow: 1, note: 'Dodging out of a reload once the string is back feeds you a point of Flow.' },
    boundary: { zone: 4, arc: 0.3, intercept: 'trap', note: 'Your zone is a trap: enemies who enter it are pinned in place for a moment.' },
    cross: { opening: 'counterBolt', mult: 1.8, note: 'After a parry or a dodge, a point-blank counter-bolt hits 80% harder.' },
  },
};
