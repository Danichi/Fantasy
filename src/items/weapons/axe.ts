import { act, F, n3, type FamilyDef } from './kit';
import { crossGuard, parryCurve } from './spear';

// Axes: chops, not cuts. The combo opens with the woodcutter's swing from the
// animation library (the same one the farmhands chop logs with), then a
// rising hook and an overhead chop; every hit opens a bleed (the weapon's
// `bleed` stat). Hand axes go in one hand (and pair in the off hand); the
// bearded greataxes take both, slower and heavier. Swap for the Mixamo
// "Dual Weapon Combat" axe set later.

export const AXE: FamilyDef = {
  id: 'axe', name: 'Axe', hands: 1, reach: 1.7,
  feel: 'Chops that bleed. Each blow of a combo makes the wound worse.',
  hold: { right: { grip: [-0.16, 1.0, 0.24], dir: n3([0.1, 0.9, 0.42]), normal: [1, 0, -0.1], w: 1 }, off: 0.4 },
  guard: { block: 50, stability: 0.35 },
  moves: {
    slash1: act('slash1', {
      dur: 0.97, stamina: 15, clip: 'ual_chop',
      hit: { from: 0.4, to: 0.62, dmg: 1.05, poise: 24, hand: 'main' }, combo: { next: 'slash2', from: 0.6 }, cancel: 0.68,
      move: { dist: 0.4, from: 0.2, to: 0.5 }, track: 0.34, weaponSpeed: true, flair: [F('lean', 0.25, 0.7, 0.18), F('crouch', 0.3, 0.7, 0.06)],
    }),
    slash2: act('slash2', {
      dur: 1.0, stamina: 15, clip: 'attack_light_2',
      hit: { from: 0.34, to: 0.56, dmg: 1.1, poise: 26, hand: 'main' }, combo: { next: 'slash3', from: 0.56 }, cancel: 0.64, track: 0.3, weaponSpeed: true,
    }),
    slash3: act('slash3', {
      dur: 1.54, stamina: 19, clip: 'attack_light_3',
      hit: { from: 0.72, to: 0.96, dmg: 1.45, poise: 40, hand: 'main' }, combo: { next: 'slash1', from: 1.04 }, cancel: 1.08,
      track: 0.6, weaponSpeed: true, flair: [F('crouch', 0.6, 1.2, 0.12)], clipTiming: { speed: 1.12 },
    }),
    heavy: act('heavy', {
      dur: 1.71, stamina: 28, clip: 'attack_heavy',
      hit: { from: 0.55, to: 0.95, dmg: 2.4, poise: 80, hand: 'main' }, chargeAt: 0.26, cancel: 1.25, track: 0.5, weaponSpeed: true,
      flair: [F('lean', 0.5, 1.1, 0.16)], clipTiming: { speed: 0.95 },
    }),
    sprintAttack: act('sprintAttack', {
      dur: 1.29, stamina: 20, clip: 'attack_sprint',
      hit: { from: 0.45, to: 0.75, dmg: 1.55, poise: 48, hand: 'main' }, cancel: 0.95, track: 0.25, weaponSpeed: true,
    }),
    airAttack: act('airAttack', {
      dur: 2.33, stamina: 16, clip: 'attack_plunge', air: true, startAt: 0.95,
      hit: { from: 1.0, to: 1.32, dmg: 1.8, poise: 58, hand: 'main' }, cancel: 1.75, track: 1.1, weaponSpeed: true,
    }),
    parryWeapon: act('parryWeapon', { dur: 0.7, stamina: 12, proc: (t) => crossGuard(parryCurve(t), 0.05), parry: [0.06, 0.27], cancel: 0.46, track: 0.1 }),
  },
  schools: {
    gale: { flow: 1, chainBleed: 0.35, note: 'Each hit in a chain makes the bleed 35% worse.' },
    boundary: { zone: 2.5, arc: 0.3, intercept: 'pull', note: 'A hooking guard: enemies who enter your zone are dragged in, off balance.' },
    cross: { opening: 'hook', mult: 1.35, note: 'After a parry or a dodge, hook and chop: the opening blow hits 35% harder.' },
  },
};
