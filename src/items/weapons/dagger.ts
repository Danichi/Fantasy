import type { V3 } from '../../player/rigLayer';
import { ACTIONS } from '../../combat/actions';
import { act, curve, F, n3, trackPose, type FamilyDef, type Track } from './kit';

// Daggers: the fastest blades, with almost no reach. The sword's light cuts
// played half again as fast and cut short, closing with a quick stab; daggers
// pair in the off hand, and strike twice as hard from behind.

const G: V3 = [-0.18, 1.02, 0.28];
const STAB: Track = {
  grip: [[0, G], [0.28, [-0.22, 1.12, -0.04]], [0.45, [-0.08, 1.2, 0.56]], [0.62, [-0.08, 1.18, 0.52]], [1, G]],
  dir: [[0, n3([0.1, 0.8, 0.6])], [0.28, n3([0.1, 0.3, 1])], [0.45, n3([0, 0.1, 1])], [1, n3([0.1, 0.8, 0.6])]],
  normal: [[0, [1, 0, -0.1]], [1, [1, 0, -0.1]]],
};
const off = (id: 'offslash1' | 'offslash2') => {
  const s = ACTIONS[id];
  return act(id, { ...s, dur: s.dur * 0.75, hit: { ...s.hit!, from: s.hit!.from * 0.75, to: s.hit!.to * 0.75, dmg: 0.75 }, combo: s.combo && { ...s.combo, from: s.combo.from * 0.75 }, cancel: s.cancel * 0.75 });
};

export const DAGGER: FamilyDef = {
  id: 'dagger', name: 'Dagger', hands: 1, reach: 1.0,
  feel: 'The fastest blades. Tiny reach, but they pair, and a strike from behind does double.',
  backstab: 2,
  moves: {
    slash1: act('slash1', {
      dur: 1.5, stamina: 9, clip: 'attack_light_1',
      hit: { from: 0.5, to: 0.72, dmg: 0.8, poise: 10, hand: 'main' }, combo: { next: 'slash2', from: 0.66 }, cancel: 0.72,
      track: 0.45, weaponSpeed: true, clipTiming: { speed: 1.5 },
    }),
    slash2: act('slash2', {
      dur: 1.0, stamina: 9, clip: 'attack_light_2',
      hit: { from: 0.34, to: 0.54, dmg: 0.85, poise: 10, hand: 'main' }, combo: { next: 'slash3', from: 0.5 }, cancel: 0.56, track: 0.3, weaponSpeed: true, clipTiming: { speed: 1.5 },
    }),
    slash3: act('slash3', {
      dur: 0.62, stamina: 10, proc: trackPose(STAB, [[0, 0], [0.28, -0.4], [0.45, 0.3], [1, 0]], [[0, 0], [0.45, 0.2], [1, 0]], [[0, 0], [0.45, 0.1], [1, 0]]),
      hit: { from: 0.24, to: 0.36, dmg: 1.05, poise: 14, hand: 'main' }, combo: { next: 'slash1', from: 0.4 }, cancel: 0.42,
      move: { dist: 0.7, from: 0.1, to: 0.3 }, track: 0.2, weaponSpeed: true, flair: [F('lean', 0.1, 0.45, 0.22), F('crouch', 0.1, 0.45, 0.08)],
    }),
    heavy: act('heavy', {
      dur: 1.71, stamina: 18, clip: 'attack_heavy',
      hit: { from: 0.55, to: 0.95, dmg: 1.8, poise: 30, hand: 'main' }, chargeAt: 0.26, cancel: 1.1, track: 0.5, weaponSpeed: true, clipTiming: { speed: 1.35 },
    }),
    sprintAttack: act('sprintAttack', {
      dur: 0.62, stamina: 12, proc: (t) => ({ ...trackPose(STAB, [[0, 0], [0.45, 0.3], [1, 0]], [[0, 0], [0.45, 0.3], [1, 0]])(t), hipsDrop: curve([[0, 0], [0.45, 0.15], [1, 0]], t) }),
      hit: { from: 0.22, to: 0.38, dmg: 1.3, poise: 20, hand: 'main' }, cancel: 0.45, move: { dist: 2.2, from: 0.0, to: 0.36 }, track: 0.2, weaponSpeed: true,
      flair: [F('lean', 0.0, 0.5, 0.35)],
    }),
    offslash1: off('offslash1'),
    offslash2: off('offslash2'),
  },
  schools: {
    gale: { flow: 1.4, note: 'Every hit is worth 1.4 Flow.' },
    boundary: { zone: 3, inner: 1.2, arc: 0.3, intercept: 'counter', note: 'A tight zone, 1.2 to 3 m: anyone who steps into it is stabbed first.' },
    cross: { opening: 'backstab', mult: 2, note: 'After a parry or a dodge your next strike counts as a backstab: double damage, and a critical.' },
  },
};
