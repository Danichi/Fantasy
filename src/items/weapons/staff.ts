import type { V3 } from '../../player/rigLayer';
import { act, F, n3, trackPose, type FamilyDef, type Track } from './kit';
import { crossGuard, parryCurve } from './spear';

// Staffs: a quarterstaff in both hands, held across the body and swung in wide
// sweeps from either end, and a spell focus: a staff's `focus` stat speeds
// every cast, and Gale Style momentum speeds it further. Procedural sweeps and
// the Mixamo spin; swap for the "Pro Magic Pack" staff set later.

const G: V3 = [-0.22, 0.98, 0.18];
const D: V3 = n3([0.75, 0.55, 0.35]);
const N: V3 = [0, -0.3, 1];

const SWEEP_R: Track = {
  grip: [[0, G], [0.25, [-0.28, 1.08, -0.02]], [0.45, [-0.12, 1.1, 0.32]], [0.62, [0.06, 1.05, 0.3]], [0.85, [-0.18, 1.0, 0.18]], [1, G]],
  dir: [[0, D], [0.25, n3([0.85, 0.35, -0.45])], [0.45, n3([0.2, 0.15, 1])], [0.62, n3([-0.8, 0.12, 0.6])], [0.85, n3([0.3, 0.5, 0.6])], [1, D]],
  normal: [[0, N], [0.25, [0, 1, 0]], [0.62, [0, 1, 0]], [1, N]],
};
const SWEEP_L: Track = {
  grip: [[0, G], [0.25, [-0.1, 1.06, 0.0]], [0.45, [-0.18, 1.1, 0.34]], [0.62, [-0.3, 1.05, 0.22]], [0.85, [-0.2, 1.0, 0.18]], [1, G]],
  dir: [[0, D], [0.25, n3([-0.85, 0.35, -0.4])], [0.45, n3([-0.15, 0.15, 1])], [0.62, n3([0.8, 0.12, 0.6])], [0.85, n3([0.6, 0.5, 0.4])], [1, D]],
  normal: [[0, N], [0.25, [0, 1, 0]], [0.62, [0, 1, 0]], [1, N]],
};
const OVERHEAD: Track = {
  grip: [[0, G], [0.3, [-0.18, 1.55, -0.05]], [0.5, [-0.16, 1.6, -0.08]], [0.62, [-0.12, 1.3, 0.4]], [0.72, [-0.1, 1.0, 0.45]], [0.9, [-0.18, 0.98, 0.25]], [1, G]],
  dir: [[0, D], [0.3, n3([0.1, 0.4, -1])], [0.5, n3([0.1, 0.5, -1])], [0.62, n3([0, 0.5, 1])], [0.72, n3([0, -0.6, 0.8])], [1, D]],
  normal: [[0, N], [0.3, [1, 0, 0]], [0.9, [1, 0, 0]], [1, N]],
};

export const STAFF: FamilyDef = {
  id: 'staff', name: 'Staff', hands: 2, reach: 2.0,
  feel: 'A quarterstaff and a spell focus: wide sweeps from both ends, and faster casting.',
  hold: { right: { grip: G, dir: D, normal: N, w: 1 }, off: 0.55 },
  guard: { block: 60, stability: 0.45 },
  moves: {
    slash1: act('slash1', {
      dur: 0.85, stamina: 13, proc: trackPose(SWEEP_R, [[0, 0], [0.25, 0.55], [0.45, 0], [0.62, -0.55], [1, 0]], [[0, 0], [0.45, 0.1], [1, 0]]),
      hit: { from: 0.32, to: 0.54, dmg: 0.95, poise: 24, hand: 'main' }, combo: { next: 'slash2', from: 0.5 }, cancel: 0.6,
      move: { dist: 0.4, from: 0.2, to: 0.45 }, track: 0.3, weaponSpeed: true, flair: [F('bank', 0.2, 0.7, -0.08)],
    }),
    slash2: act('slash2', {
      dur: 0.85, stamina: 13, proc: trackPose(SWEEP_L, [[0, 0], [0.25, -0.55], [0.45, 0], [0.62, 0.55], [1, 0]], [[0, 0], [0.45, 0.1], [1, 0]]),
      hit: { from: 0.32, to: 0.54, dmg: 1.0, poise: 24, hand: 'main' }, combo: { next: 'slash3', from: 0.5 }, cancel: 0.6,
      move: { dist: 0.4, from: 0.2, to: 0.45 }, track: 0.3, weaponSpeed: true, flair: [F('bank', 0.2, 0.7, 0.08)],
    }),
    slash3: act('slash3', {
      dur: 2.29, stamina: 18, clip: 'skill_spin',
      hit: { from: 0.5, to: 1.2, dmg: 1.3, poise: 40, hand: 'main' }, combo: { next: 'slash1', from: 1.5 }, cancel: 1.5,
      track: 0.5, weaponSpeed: true, flair: [F('hop', 0.45, 1.0, 0.15)], clipTiming: { speed: 1.4 },
    }),
    heavy: act('heavy', {
      dur: 1.3, stamina: 24, proc: trackPose(OVERHEAD, [[0, 0], [0.4, -0.25], [0.65, 0.1], [1, 0]], [[0, 0], [0.4, -0.3], [0.7, 0.45], [1, 0]], [[0, 0], [0.7, 0.18], [1, 0]]),
      hit: { from: 0.78, to: 0.96, dmg: 2.0, poise: 75, hand: 'main' }, chargeAt: 0.45, cancel: 1.05,
      move: { dist: 0.8, from: 0.7, to: 0.95 }, track: 0.75, weaponSpeed: true, flair: [F('hop', 0.55, 0.85, 0.12)],
    }),
    sprintAttack: act('sprintAttack', {
      dur: 0.95, stamina: 18, proc: trackPose(SWEEP_R, [[0, 0], [0.25, 0.6], [0.62, -0.6], [1, 0]], [[0, 0], [0.45, 0.2], [1, 0]]),
      hit: { from: 0.32, to: 0.6, dmg: 1.4, poise: 40, hand: 'main' }, cancel: 0.7, move: { dist: 2.4, from: 0.0, to: 0.6 }, track: 0.25, weaponSpeed: true,
    }),
    airAttack: act('airAttack', {
      dur: 1.3, stamina: 16, air: true, startAt: 0.55, proc: trackPose(OVERHEAD, [[0, 0], [1, 0]], [[0, 0], [0.7, 0.45], [1, 0.3]]),
      hit: { from: 0.8, to: 1.0, dmg: 1.6, poise: 60, hand: 'main' }, cancel: 1.1, track: 1.0, weaponSpeed: true,
    }),
    parryWeapon: act('parryWeapon', { dur: 0.7, stamina: 11, proc: (t) => crossGuard(parryCurve(t)), parry: [0.06, 0.3], cancel: 0.44, track: 0.1 }),
  },
  schools: {
    gale: { flow: 1, castPerFlow: 0.08, note: 'Every point of Flow casts spells 8% faster.' },
    boundary: { zone: 3, arc: 0.3, intercept: 'ward', note: 'Your zone is a ward: enemies who enter it are thrown back and each one feeds your Resolve.' },
    cross: { opening: 'instantSpell', mult: 1.25, note: 'After a parry or a dodge your next spell is cast three times as fast.' },
  },
};
