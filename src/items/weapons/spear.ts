import type { ProcPose, V3 } from '../../player/rigLayer';
import { act, curve, F, hand, n3, trackPose, type FamilyDef, type Track } from './kit';

// Spears and polearms: two hands on a long shaft, 3.2 m of reach, and thrusts
// instead of cuts. The front hand stays where it is and the shaft slides
// through it, so a jab reads as a jab. All procedural: no clip in the project
// is a spear thrust (Mixamo's packs would replace these; see merge notes).

const H_GRIP: V3 = [-0.17, 1.0, 0.02];
const H_DIR: V3 = n3([0.1, 0.28, 1]);
const SIDE: V3 = [1, 0, -0.1];

export const SPEAR_HOLD = { right: { grip: H_GRIP, dir: H_DIR, normal: SIDE, w: 1 }, off: 0.48, slide: [0.02, 1.12, 0.42] as V3 };

const JAB: Track = {
  grip: [[0, H_GRIP], [0.22, [-0.2, 1.06, -0.14]], [0.38, [-0.12, 1.14, 0.5]], [0.55, [-0.12, 1.14, 0.47]], [0.8, [-0.16, 1.04, 0.12]], [1, H_GRIP]],
  dir: [[0, H_DIR], [0.22, n3([0.06, 0.2, 1])], [0.38, n3([0.02, 0.1, 1])], [0.6, n3([0.02, 0.12, 1])], [1, H_DIR]],
  normal: [[0, SIDE], [1, SIDE]],
};
const HIGH: Track = {
  grip: [[0, H_GRIP], [0.25, [-0.22, 0.94, -0.12]], [0.42, [-0.1, 1.3, 0.5]], [0.6, [-0.1, 1.27, 0.47]], [0.85, [-0.16, 1.05, 0.1]], [1, H_GRIP]],
  dir: [[0, H_DIR], [0.25, n3([0.05, 0.35, 1])], [0.42, n3([0, 0.28, 1])], [1, H_DIR]],
  normal: [[0, SIDE], [1, SIDE]],
};
const SWEEP: Track = {
  grip: [[0, H_GRIP], [0.3, [-0.3, 1.1, -0.05]], [0.5, [-0.1, 1.12, 0.3]], [0.64, [0.12, 1.08, 0.25]], [0.85, [-0.1, 1.02, 0.08]], [1, H_GRIP]],
  dir: [[0, H_DIR], [0.3, n3([-0.95, 0.15, 0.3])], [0.5, n3([-0.25, 0.08, 1])], [0.64, n3([0.75, 0.05, 0.65])], [0.85, n3([0.3, 0.2, 1])], [1, H_DIR]],
  normal: [[0, SIDE], [0.3, [0, 1, 0]], [0.64, [0, 1, 0]], [1, SIDE]],
};
const LUNGE: Track = {
  grip: [[0, H_GRIP], [0.35, [-0.24, 1.1, -0.22]], [0.5, [-0.24, 1.1, -0.24]], [0.62, [-0.08, 1.16, 0.62]], [0.75, [-0.08, 1.16, 0.6]], [0.9, [-0.15, 1.04, 0.15]], [1, H_GRIP]],
  dir: [[0, H_DIR], [0.35, n3([0.05, 0.15, 1])], [0.62, n3([0, 0.06, 1])], [1, H_DIR]],
  normal: [[0, SIDE], [1, SIDE]],
};
const PLUNGE: Track = {
  grip: [[0, [-0.15, 1.4, 0.1]], [0.5, [-0.12, 1.6, 0.0]], [0.6, [-0.1, 1.3, 0.45]], [1, [-0.1, 0.95, 0.5]]],
  dir: [[0, n3([0, 0.6, 0.8])], [0.55, n3([0, 0.3, 1])], [0.65, n3([0, -0.8, 0.6])], [1, n3([0, -0.9, 0.4])]],
  normal: [[0, SIDE], [1, SIDE]],
};

/** Two-handed parry: the shaft (or blade) across the body, catching the blow. */
export function crossGuard(w: number, low = 0): ProcPose {
  return {
    right: { grip: [-0.24, 1.3 - low, 0.36], dir: n3([1, 0.28, 0.12]), normal: n3([0, -0.1, 1]), w },
    spinePitch: 0.08 * w,
  };
}
export const parryCurve = (t: number) => curve([[0, 0], [0.18, 1], [0.6, 1], [1, 0]], t);

export const SPEAR: FamilyDef = {
  id: 'spear', name: 'Spear and polearm', hands: 2, reach: 3.2,
  feel: 'Two hands, long reach: jab, jab, then a sweeping arc. Hold for a lunging thrust.',
  hold: SPEAR_HOLD,
  guard: { block: 55, stability: 0.4 },
  moves: {
    slash1: act('slash1', {
      dur: 0.7, stamina: 12, proc: trackPose(JAB, [[0, 0], [0.22, -0.3], [0.38, 0.25], [0.7, 0.05], [1, 0]], [[0, 0], [0.38, 0.18], [1, 0]], [[0, 0], [0.38, 0.08], [1, 0]]),
      hit: { from: 0.2, to: 0.33, dmg: 0.95, poise: 16, hand: 'main' }, combo: { next: 'slash2', from: 0.3 }, cancel: 0.42,
      move: { dist: 0.45, from: 0.12, to: 0.3 }, track: 0.2, weaponSpeed: true, flair: [F('lean', 0.12, 0.45, 0.12)],
    }),
    slash2: act('slash2', {
      dur: 0.8, stamina: 13, proc: trackPose(HIGH, [[0, 0], [0.25, -0.35], [0.42, 0.3], [1, 0]], [[0, 0], [0.25, 0.1], [0.42, 0.05], [1, 0]], [[0, 0], [0.25, 0.1], [0.5, 0.04], [1, 0]]),
      hit: { from: 0.28, to: 0.41, dmg: 1.05, poise: 18, hand: 'main' }, combo: { next: 'slash3', from: 0.38 }, cancel: 0.5,
      move: { dist: 0.5, from: 0.15, to: 0.36 }, track: 0.24, weaponSpeed: true,
    }),
    slash3: act('slash3', {
      dur: 1.05, stamina: 17, proc: trackPose(SWEEP, [[0, 0], [0.3, -0.65], [0.5, 0], [0.64, 0.6], [0.85, 0.15], [1, 0]], [[0, 0], [0.5, 0.12], [1, 0]], [[0, 0], [0.5, 0.1], [1, 0]]),
      hit: { from: 0.42, to: 0.68, dmg: 1.25, poise: 34, hand: 'main' }, combo: { next: 'slash1', from: 0.75 }, cancel: 0.78,
      move: { dist: 0.5, from: 0.3, to: 0.6 }, track: 0.36, weaponSpeed: true, flair: [F('bank', 0.35, 0.8, 0.1)],
    }),
    heavy: act('heavy', {
      dur: 1.45, stamina: 26, proc: trackPose(LUNGE, [[0, 0], [0.4, -0.45], [0.62, 0.35], [1, 0]], [[0, 0], [0.4, -0.1], [0.62, 0.32], [1, 0]], [[0, 0], [0.4, 0.14], [0.62, 0.18], [1, 0]]),
      hit: { from: 0.86, to: 1.04, dmg: 2.2, poise: 60, hand: 'main' }, cancel: 1.12, chargeAt: 0.42,
      boost: { dist: 1.6, from: 0.8, to: 1.02 }, track: 0.8, weaponSpeed: true, flair: [F('lean', 0.75, 1.15, 0.28)],
    }),
    sprintAttack: act('sprintAttack', {
      dur: 1.1, stamina: 20, proc: trackPose(LUNGE, [[0, 0], [0.4, -0.3], [0.62, 0.3], [1, 0]], [[0, 0], [0.62, 0.3], [1, 0]], [[0, 0], [0.62, 0.15], [1, 0]]),
      hit: { from: 0.55, to: 0.78, dmg: 1.6, poise: 45, hand: 'main' }, cancel: 0.85,
      move: { dist: 2.8, from: 0.05, to: 0.7 }, track: 0.3, weaponSpeed: true, flair: [F('lean', 0.3, 0.9, 0.3)],
    }),
    airAttack: act('airAttack', {
      dur: 1.4, stamina: 16, air: true, startAt: 0.6, proc: (t) => ({ right: hand(PLUNGE, t), spinePitch: curve([[0, 0], [0.6, 0.35], [1, 0.2]], t) }),
      hit: { from: 0.8, to: 1.05, dmg: 1.7, poise: 55, hand: 'main' }, cancel: 1.2, track: 1.0, weaponSpeed: true,
    }),
    parryWeapon: act('parryWeapon', { dur: 0.7, stamina: 12, proc: (t) => crossGuard(parryCurve(t)), parry: [0.06, 0.28], cancel: 0.46, track: 0.1 }),
  },
  schools: {
    gale: { flow: 1, tipFlow: 1, note: 'Hits with the tip give a second point of Flow.' },
    boundary: { zone: 3.5, arc: 0.3, intercept: 'push', note: 'Your zone reaches 40% farther, and enemies who step into it are driven back out.' },
    cross: { opening: 'feint', mult: 1.3, note: 'After a parry or a dodge, a feinted thrust strikes 30% harder.' },
  },
};
