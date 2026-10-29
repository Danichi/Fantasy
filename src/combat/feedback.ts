import * as THREE from 'three';
import { events } from '../core/events';
import { sfx } from '../audio/sfx';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Armour, AttackKind } from './core';

// What the player sees and hears of the combat rework (phase 5): every tell,
// impact, parry, dodge, break and finisher gets a flash and a sound. The
// combat core and the player emit the events; this only presents them.

const TELL_COLOR: Record<AttackKind, [number, number]> = {
  normal: [0xffffff, 0xbfd8ff],
  heavy: [0xffd27a, 0xb07010],
  unblockable: [0xff3a2a, 0x700800],
  grab: [0xfff060, 0xa08000],
};

/** Particles thrown off by a blow, by what it hit. */
const SPRAY: Record<Armour, { color: number; color2: number; size: number; gravity: number; sparks?: boolean }> = {
  flesh: { color: 0xa01810, color2: 0x300404, size: 0.05, gravity: 9 },
  hide: { color: 0x8a1a10, color2: 0x2a0604, size: 0.05, gravity: 9 },
  leather: { color: 0x9a2014, color2: 0x2a0604, size: 0.05, gravity: 9 },
  bone: { color: 0xeee6cf, color2: 0x8a826e, size: 0.05, gravity: 11 },
  plate: { color: 0xffe0a0, color2: 0xff7a20, size: 0.035, gravity: 6, sparks: true },
  chitin: { color: 0x7aa04a, color2: 0x223010, size: 0.05, gravity: 9 },
  shell: { color: 0xffd0a0, color2: 0xa04020, size: 0.04, gravity: 8, sparks: true },
  slime: { color: 0x8ad050, color2: 0x2a5010, size: 0.09, gravity: 7 },
  stone: { color: 0xd8c8a8, color2: 0x6a5a48, size: 0.07, gravity: 10, sparks: true },
  spirit: { color: 0xb0d8ff, color2: 0x304070, size: 0.06, gravity: -1 },
  wood: { color: 0xb08850, color2: 0x4a3018, size: 0.06, gravity: 10 },
};

/** How heavy a weapon family sounds (0 dagger .. 1 greatsword). */
const WEIGHT: Record<string, number> = { dagger: 0.05, sword: 0.35, spear: 0.4, staff: 0.4, axe: 0.6, mace: 0.7, greatsword: 0.95 };

export function combatFeedback(fx: FX, player: Player, banner: (text: string) => void) {
  const near = (at: THREE.Vector3) => Math.max(0, 1 - at.distanceTo(player.center) / 40);

  // ---- enemy tells ----
  events.on('telegraph', ({ target, kind, sec }) => {
    const v = near(target.center);
    if (v <= 0) return;
    const [c1, c2] = TELL_COLOR[kind];
    const fwd = typeof target.yaw === 'number' ? new THREE.Vector3(Math.sin(target.yaw), 0, Math.cos(target.yaw)) : new THREE.Vector3();
    const at = target.center.clone().addScaledVector(fwd, target.radius + 0.25);
    at.y += (target.halfHeight ?? 0.3) + 0.15;
    const big = kind === 'unblockable' || kind === 'grab';
    fx.add.spawn({ pos: at, spread: big ? 1.2 : 0.4, count: big ? 26 : 10, life: [0.18, Math.min(0.5, sec * 0.6 + 0.15)], size: [big ? 0.55 : 0.32, 0.04], color: c1, color2: c2, drag: 4 });
    if (big) fx.add.spawn({ pos: at, spread: 2.4, count: 18, life: [0.25, 0.5], size: [0.12, 0.02], color: c1, color2: c2, drag: 2 });
    sfx.sting(kind, (kind === 'normal' ? 0.12 : 0.32) * v);
  });

  // ---- the player's blows ----
  events.on('swing', ({ heavy }) => {
    const kind = player.equip?.mainWeapon?.def.kind ?? '';
    sfx.whoosh(Math.min(1, (WEIGHT[kind] ?? 0.3) + (heavy ? 0.25 : 0)), heavy ? 0.28 : 0.2);
  });
  events.on('strike', ({ at, armour, heavy, crit, broke, typeMult, reason }) => {
    const sp = SPRAY[armour];
    const n = (heavy ? 14 : 8) + (crit ? 8 : 0);
    fx.add.spawn({ pos: at, spread: heavy ? 3 : 2.2, count: n, life: [0.2, 0.55], size: [sp.size * (heavy ? 1.4 : 1), sp.size * 0.2], color: sp.color, color2: sp.color2, gravity: sp.gravity, upBias: 0.3 });
    if (sp.sparks) fx.sparks(at);
    sfx.impact(armour, heavy || crit, 0.42);
    // Resisted blows dull; a weak spot or the right weapon rings out.
    if (typeMult < 0.75) fx.add.spawn({ pos: at, spread: 0.6, count: 5, life: [0.15, 0.3], size: [0.2, 0.05], color: 0x9a9a9a, color2: 0x404040 });
    if (crit && reason !== 'finisher') fx.add.spawn({ pos: at, spread: 1.4, count: 14, life: [0.12, 0.3], size: [0.4, 0.05], color: 0xffe8a0, color2: 0xff9020, drag: 5 });
    if (broke) {
      // Posture breaking: a golden ring flies out and the enemy sags.
      fx.add.spawn({ pos: at, spread: 6, count: 40, life: [0.3, 0.7], size: [0.18, 0.02], color: 0xffd060, color2: 0xa05010, drag: 3 });
    }
  });
  events.on('postureBreak', ({ target }) => {
    sfx.breakCrash(0.55 * Math.max(0.3, near(target.center)));
    if (player.lock === target || target.center.distanceTo(player.center) < 6) banner('POSTURE BROKEN');
  });
  events.on('finisher', ({ at }) => {
    fx.add.spawn({ pos: at, spread: 7, count: 60, life: [0.3, 0.9], size: [0.22, 0.02], color: 0xfff0c0, color2: 0xff5010, drag: 2.5, upBias: 0.5 });
    fx.add.spawn({ pos: at, spread: 2, count: 16, life: [0.1, 0.2], size: [1.2, 0.4], color: 0xffffff, color2: 0xffc060 });
    sfx.impact('plate', true, 0.7);
    sfx.breakCrash(0.4);
    banner('FINISHER');
  });

  // ---- the defence ladder ----
  events.on('parrySuccess', ({ at, perfect }) => {
    fx.add.spawn({ pos: at, spread: perfect ? 4 : 2.2, count: perfect ? 34 : 14, life: [0.12, perfect ? 0.45 : 0.28], size: [perfect ? 0.4 : 0.25, 0.03], color: 0xffffff, color2: perfect ? 0xffc040 : 0x9ab0d0, drag: 4 });
    fx.sparks(at);
    sfx.clang(perfect ? 'perfect' : 'deflect', 0.55);
  });
  events.on('blockImpact', ({ at, guardBroken }) => {
    sfx.clang(guardBroken ? 'break' : 'block', 0.45);
    if (!guardBroken) fx.sparks(at);
  });
  events.on('perfectDodge', ({ at }) => {
    fx.alpha.spawn({ pos: at, spread: 1.2, count: 12, life: [0.3, 0.6], size: [0.6, 1.4], color: 0x9ac8ff, alpha: 0.35, drag: 3 });
    sfx.slip(0.4);
    banner('PERFECT DODGE');
  });
  events.on('unblockable', ({ kind }) => banner(kind === 'grab' ? 'GRABBED' : 'UNBLOCKABLE'));
  events.on('chargeTier', ({ tier, perfect }) => {
    const at = player.center.clone().addScaledVector(player.forward, 0.4);
    at.y += 0.5;
    const c = perfect ? 0xffffff : tier >= 3 ? 0xffb030 : tier === 2 ? 0xffd070 : 0xfff0c0;
    fx.add.spawn({ pos: at, spread: perfect ? 2.5 : 1, count: perfect ? 24 : 8 + tier * 3, life: [0.15, 0.4], size: [perfect ? 0.35 : 0.2, 0.03], color: c, color2: 0xa06010, drag: 4 });
    sfx.chargeTick(tier, perfect);
  });
}
