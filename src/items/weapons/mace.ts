import { act, F, n3, type FamilyDef } from './kit';
import { crossGuard, parryCurve } from './spear';

// Maces and hammers: slow, and every blow lands like a door slamming. An
// overhead smash, the library's swordsman's backhand, a downward crush, and a
// leaping slam for the heavy. Blows break armour (the target takes more for a
// few seconds) and stagger hard. Swap for a Mixamo hammer set later.

export const MACE: FamilyDef = {
  id: 'mace', name: 'Mace and hammer', hands: 1, reach: 1.6,
  feel: 'Slow, stunning blows that crack armour: what it hits takes more damage for a while.',
  hold: { right: { grip: [-0.16, 0.98, 0.22], dir: n3([0.08, 0.92, 0.38]), normal: [1, 0, -0.1], w: 1 }, off: 0.38 },
  guard: { block: 55, stability: 0.45 },
  moves: {
    slash1: act('slash1', {
      dur: 1.54, stamina: 17, clip: 'attack_light_3',
      hit: { from: 0.72, to: 0.96, dmg: 1.15, poise: 46, hand: 'main' }, combo: { next: 'slash2', from: 1.0 }, cancel: 1.08,
      track: 0.6, weaponSpeed: true, flair: [F('crouch', 0.62, 1.15, 0.12)],
    }),
    slash2: act('slash2', {
      dur: 1.53, stamina: 17, clip: 'ual_sword_attack',
      hit: { from: 0.5, to: 0.8, dmg: 1.2, poise: 50, hand: 'main' }, combo: { next: 'slash3', from: 0.85 }, cancel: 0.95,
      move: { dist: 0.5, from: 0.3, to: 0.7 }, track: 0.45, weaponSpeed: true, clipTiming: { speed: 1.1 },
    }),
    slash3: act('slash3', {
      dur: 1.71, stamina: 22, clip: 'attack_heavy',
      hit: { from: 0.55, to: 0.95, dmg: 1.55, poise: 80, hand: 'main' }, combo: { next: 'slash1', from: 1.2 }, cancel: 1.2,
      track: 0.5, weaponSpeed: true, flair: [F('crouch', 0.5, 1.1, 0.16)], clipTiming: { speed: 1.2 },
    }),
    heavy: act('heavy', {
      dur: 2.33, stamina: 32, clip: 'attack_leap',
      hit: { from: 0.98, to: 1.3, dmg: 2.6, poise: 130, hand: 'main' }, chargeAt: 0.16, cancel: 1.7, track: 0.9, weaponSpeed: true,
      flair: [F('crouch', 0.95, 1.5, 0.2)], clipTiming: { speed: 1.15 },
    }),
    sprintAttack: act('sprintAttack', {
      dur: 1.29, stamina: 22, clip: 'attack_sprint',
      hit: { from: 0.45, to: 0.75, dmg: 1.6, poise: 70, hand: 'main' }, cancel: 0.95, track: 0.25, weaponSpeed: true,
    }),
    airAttack: act('airAttack', {
      dur: 2.33, stamina: 16, clip: 'attack_plunge', air: true, startAt: 0.95,
      hit: { from: 1.0, to: 1.32, dmg: 2.0, poise: 90, hand: 'main' }, cancel: 1.75, track: 1.1, weaponSpeed: true,
    }),
    parryWeapon: act('parryWeapon', { dur: 0.75, stamina: 13, proc: (t) => crossGuard(parryCurve(t), 0.05), parry: [0.07, 0.28], cancel: 0.5, track: 0.1 }),
  },
  schools: {
    gale: { flow: 0.75, stagger: 1.5, note: 'Flow builds slower (three quarters a hit), but your blows stagger 50% harder.' },
    boundary: { zone: 2.5, arc: 0.3, intercept: 'stun', note: 'Enemies who step into your zone are knocked senseless, open to a critical blow.' },
    cross: { opening: 'smash', mult: 1.5, note: 'After a parry or a dodge, the parry-smash hits 50% harder and stuns.' },
  },
};
