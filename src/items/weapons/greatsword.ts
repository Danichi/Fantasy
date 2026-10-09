import type { V3 } from '../../player/rigLayer';
import { act, F, n3, type FamilyDef } from './kit';
import { crossGuard, parryCurve } from './spear';

// Greatswords: the Mixamo sword set slowed down and swung with both hands
// (the left hand rides the long grip below the right), deeper knees and a
// heavier lean, and a spinning sweep to end the combo. The heavy and the
// sweep carry hyper-armour from the first frame: you can't be staggered out
// of them, only hurt. Swap for the Mixamo "Great Sword Pack" later.

const GRIP: V3 = [-0.12, 1.0, 0.26];
export const GREATSWORD: FamilyDef = {
  id: 'greatsword', name: 'Greatsword', hands: 2, reach: 2.1,
  feel: 'Slow, huge arcs. The heavy and the closing sweep cannot be staggered.',
  hold: { right: { grip: GRIP, dir: n3([0.15, 0.85, 0.5]), normal: [1, 0, -0.15], w: 1 }, off: -0.16 },
  guard: { block: 70, stability: 0.5 },
  hyperArmour: ['heavy', 'slash3'],
  moves: {
    slash1: act('slash1', {
      dur: 1.5, stamina: 20, clip: 'attack_light_1',
      hit: { from: 0.5, to: 0.76, dmg: 1.3, poise: 40, hand: 'main' }, combo: { next: 'slash2', from: 0.76 }, cancel: 0.9,
      track: 0.45, weaponSpeed: true, flair: [F('crouch', 0.3, 0.95, 0.1), F('lean', 0.35, 0.9, 0.16)], clipTiming: { speed: 0.95 },
    }),
    slash2: act('slash2', {
      dur: 1.54, stamina: 22, clip: 'attack_light_3',
      hit: { from: 0.72, to: 0.98, dmg: 1.45, poise: 46, hand: 'main' }, combo: { next: 'slash3', from: 1.0 }, cancel: 1.12,
      track: 0.6, weaponSpeed: true, flair: [F('crouch', 0.6, 1.25, 0.15), F('lean', 0.6, 1.2, 0.2)], clipTiming: { speed: 0.95 },
    }),
    slash3: act('slash3', {
      dur: 2.29, stamina: 26, clip: 'skill_spin',
      hit: { from: 0.5, to: 1.2, dmg: 1.6, poise: 64, hand: 'main' }, combo: { next: 'slash1', from: 1.6 }, cancel: 1.6,
      track: 0.5, weaponSpeed: true, flair: [F('crouch', 0.4, 1.3, 0.12)], clipTiming: { speed: 1.25 },
    }),
    heavy: act('heavy', {
      dur: 1.71, stamina: 32, clip: 'attack_heavy',
      hit: { from: 0.55, to: 0.95, dmg: 2.9, poise: 110, hand: 'main' }, chargeAt: 0.26, cancel: 1.3,
      track: 0.5, weaponSpeed: true, flair: [F('crouch', 0.4, 1.15, 0.18), F('lean', 0.5, 1.1, 0.12)], clipTiming: { speed: 0.82 },
    }),
    sprintAttack: act('sprintAttack', {
      dur: 1.29, stamina: 24, clip: 'attack_sprint',
      hit: { from: 0.45, to: 0.78, dmg: 1.9, poise: 70, hand: 'main' }, cancel: 1.0, track: 0.25, weaponSpeed: true, clipTiming: { speed: 0.9 },
    }),
    airAttack: act('airAttack', {
      dur: 2.33, stamina: 18, clip: 'attack_plunge', air: true, startAt: 0.95,
      hit: { from: 1.0, to: 1.32, dmg: 2.3, poise: 80, hand: 'main' }, cancel: 1.75, track: 1.1, weaponSpeed: true,
    }),
    parryWeapon: act('parryWeapon', { dur: 0.75, stamina: 14, proc: (t) => crossGuard(parryCurve(t)), parry: [0.07, 0.28], cancel: 0.5, track: 0.1 }),
  },
  schools: {
    gale: { flow: 2, note: 'Fewer blows, but each one is worth two Flow.' },
    boundary: { zone: 2.5, arc: -0.05, intercept: 'block', note: 'Your guard catches blows from anywhere in front of you, a full half-circle.' },
    cross: { opening: 'guardBreak', mult: 1.6, note: 'After a parry or a dodge, a guard-breaking counter hits 60% harder and twice as hard against poise.' },
  },
};
