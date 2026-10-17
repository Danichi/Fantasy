import * as THREE from 'three';
import { R, type SkillDef, type SkillRuntime } from '../skills';
import type { Target } from '../../combat/targets';

// Pyromancer: fire is a risk you manage. Every spell builds Heat; Heat makes
// fire hit harder (+0.5% per point), burns you above 80 and makes you
// overheat at 100. Flame spends it on big hits, Ember spreads burns, Hearth
// dumps it safely through the blade and Vent.

const UP = new THREE.Vector3(0, 1, 0);
const pl = (rt: SkillRuntime) => rt['player'];
const n = (v: number) => `${Math.round(v)}`;
/** A spell's damage at a rank, for descriptions (no live Heat bonus). */
const dmg = (base: number, r: number) => n(base * R(r));

/** Fireball-style bolt whose hits go through the runtime (Char, Accelerant, chains). */
function bolt(rt: SkillRuntime, from: THREE.Vector3, dir: THREE.Vector3, target: Target | null, damage: number, scale: number, splash: number, onImpact?: (at: THREE.Vector3, direct: Target | null) => void) {
  rt['spells'].castFireball(from, dir, target, damage, scale, splash, {
    strike: (t, d, dd) => rt.hit(t, d, { poise: 50 * scale, dir: dd, fire: true }),
    onImpact,
  });
}

export const FIRE_SKILLS: Record<string, SkillDef> = {
  // ---- core -----------------------------------------------------------------------------
  'pyromancer:Kindle': {
    action: 'sk_cast', cd: 0.8, mana: 6, heat: 12, freeAim: true,
    text: (r) => `A quick, cheap firebolt for ${dmg(10, r)} fire damage. Builds 12 Heat. Doesn't need a lock-on.`,
    on: (rt, p) => {
      const from = rt.hand();
      bolt(rt, from, rt.aimDir(p, from), p.target, rt.spell(10, 'fire') * R(p.rank), 0.55, 1.2);
    },
  },

  // ---- Flame ----------------------------------------------------------------------------
  'pyromancer:Fireball': {
    action: 'sk_cast', cd: 3, mana: 16, heat: 18,
    text: (r, rt) =>
      `Hurl a fireball for ${dmg(22 * (1 + (rt?.x('fireballDmg') ?? 0)), r)} fire damage (more the hotter you are) that sets enemies burning. Above 60 Heat it leaves burning ground. Builds 18 Heat.` +
      (rt?.has('flashpoint') ? ' Hitting a burning enemy builds 10 less.' : ''),
    on: (rt, p) => {
      const from = rt.hand();
      const hot = rt.heat > 60;
      const area = 1 + rt.x('fireArea');
      bolt(rt, from, rt.aimDir(p, from), p.target, rt.spell(22, 'fire') * R(p.rank) * (1 + rt.x('fireballDmg')), 1, 2.6 * area, (at, direct) => {
        if (direct && rt.x('flashpoint') && rt.burning(direct)) rt.spendHeat(rt.x('flashpoint'));
        if (hot) rt.fireZone(at, 2 * area, 4);
      });
    },
  },
  'pyromancer:Cinder Volley': {
    action: 'sk_volley', cd: 6, mana: 18,
    text: (r, rt) =>
      `Loose five embers one after another, each for ${dmg(7, r)} fire damage and 6 Heat. Dodging stops the volley early.` +
      (rt?.has('seeking') ? ' Each ember hunts the nearest enemy.' : rt?.has('scatter') ? ' They fan out wide and burst on impact.' : ''),
    on: (rt, p) => {
      if (rt.buff('overheat')) return;
      const from = rt.hand();
      const scatter = rt.has('scatter');
      let dir = rt.aimDir(p, from);
      if (scatter) dir = dir.clone().applyAxisAngle(UP, (p.n - 2) * 0.22);
      else dir = dir.clone().applyAxisAngle(UP, (Math.random() - 0.5) * 0.08);
      const target = rt.has('seeking') ? (p.target?.alive ? p.target : rt.nearestEnemy(pl(rt).center, 22)) : null;
      bolt(rt, from, dir, target, rt.spell(7, 'fire') * R(p.rank), 0.4, scatter ? 1.8 : 0.5);
      rt.addHeat(6);
    },
  },
  'pyromancer:Falling Star': {
    action: 'sk_castBig', cd: 25, mana: 20, needHeat: 50, range: 20,
    text: (r, rt) =>
      `Spend all your Heat (needs 50) to pull a star down on your target: ${dmg(30, r)} fire damage plus about 1 per Heat spent, across 3.5 m, and everything hit burns.` +
      (rt?.has('starfire') ? ' A third of the Heat comes back.' : ''),
    on: (rt, p) => {
      const spent = rt.heat;
      rt.spendHeat(spent);
      const at = p.target?.alive ? p.target.position.clone() : p.point.clone();
      const r = 3.5 * (1 + rt.x('fireArea'));
      const damage = (rt.spell(30, 'fire') + spent * 0.9) * R(p.rank);
      rt.vfx.groundCircle(at, 'fire', r * 2, 1.2);
      rt.vfx.meteor(at, 'fire', 1.2 + spent / 120, 0.95, () => {
        rt.area(at, r, damage, { poise: 200, fire: true }).forEach((t) => rt.burn(t, 2));
        rt.vfx.burst(at.clone().setY(at.y + 0.5), 'fire', 3, 10);
        rt.vfx.ring(at, 'fire', r * 3.4);
        rt.vfx.fx.dust(at, 4);
        pl(rt).onShake?.(0.6);
      });
      if (rt.has('starfire')) rt.later(1, () => rt.addHeat(spent / 3));
    },
  },

  // ---- Ember ----------------------------------------------------------------------------
  'pyromancer:Ignite': {
    action: 'sk_cast', cd: 4, mana: 12, heat: 10, needTarget: 18,
    text: (r) => `Set your target alight: ${dmg(4, r)} fire damage and 2 burn stacks (each burns for about 5 a second). Builds 10 Heat.`,
    on: (rt, p) => {
      const t = p.target;
      if (!t?.alive) return;
      rt.hit(t, rt.spell(4, 'fire') * R(p.rank), { poise: 10, fire: true });
      rt.burn(t, 2, 5 * R(p.rank));
      rt.vfx.burst(t.center, 'fire', 1, 4);
      rt.vfx.ring(t.position, 'fire', 3);
    },
  },
  'pyromancer:Wildfire': {
    action: 'sk_castSelf', cd: 20, mana: 22, heat: 10,
    text: (r, rt) =>
      rt?.has('controlledBurn')
        ? `For ${(8 * R(r)).toFixed(0)} seconds your burns deal 40% more damage. Builds 10 Heat.`
        : `For ${(8 * R(r)).toFixed(0)} seconds burns leap to any enemy within 2 m every ${rt?.has('hungryFlame') ? 'second' : '2 seconds'}. Builds 10 Heat.`,
    on: (rt, p) => {
      rt.addBuff('wildfire', 8 * R(p.rank));
      rt.vfx.ring(pl(rt).pos, 'fire', 9);
      rt.vfx.burst(pl(rt).center, 'fire', 0.8, 4);
    },
  },
  'pyromancer:Funeral Pyre': {
    action: 'sk_castSelf', cd: 30, mana: 24, heat: 10,
    text: (r) => `For ${(15 * R(r)).toFixed(0)} seconds every enemy that dies burning leaves a pyre that burns whatever comes near for 5 seconds, and gives you 10 Heat.`,
    on: (rt, p) => {
      rt.addBuff('pyre', 15 * R(p.rank));
      rt.vfx.pillar(pl(rt).pos, 'fire', 0.9, 5);
    },
  },

  // ---- Hearth ---------------------------------------------------------------------------
  'pyromancer:Firebrand': {
    action: 'sk_castSelf', cd: 20, mana: 14,
    text: (r) => `Your blade catches fire for 20 seconds. Each hit spends 5 Heat for ${dmg(8, r)} extra fire damage and a burn stack. Works with any combat class.`,
    on: (rt, p) => {
      rt.addBuff('firebrand', 20, R(p.rank));
      rt.vfx.burst(rt.hand(), 'fire', 1, 3);
    },
  },
  'pyromancer:Vent': {
    action: 'sk_vent', cd: 8, needHeat: 10,
    text: (r, rt) =>
      `Throw out all your Heat (needs 10) as a ring of fire: ${dmg(10, r)} damage plus about 0.6 per Heat to everything within 3.5 m. Leaves you at 0.` +
      (rt?.has('cauterize') ? ' Heals you for a quarter of the Heat.' : '') +
      (rt?.has('backdraft') ? ' Explodes twice.' : '') +
      (rt?.x('kindred') ? ` Restores ${rt.x('kindred')} stamina.` : ''),
    on: (rt, p) => {
      const P = pl(rt);
      const heat = rt.heat;
      rt.spendHeat(heat);
      const damage = (rt.spell(10, 'fire') + heat * 0.6) * R(p.rank);
      const ring = (k: number) => {
        rt.area(P.pos, 3.5, damage * k, { poise: 120 * k, fire: true }).forEach((t) => rt.burn(t, 1));
        rt.vfx.ring(P.pos, 'fire', 9);
        rt.vfx.spinSlash(P.pos, 3, 'fire');
        P.onShake?.(0.35 * k);
      };
      ring(1);
      if (rt.has('backdraft')) rt.later(0.45, () => ring(0.6));
      if (rt.has('cauterize')) P.heal(heat / 4);
      if (rt.x('kindred')) P.stamina = Math.min(P.maxStamina, P.stamina + rt.x('kindred'));
    },
  },
  'pyromancer:Flame Step': {
    action: 'sk_dash', cd: 4, needHeat: 15,
    text: (r) => `Dodge through fire. Costs 15 Heat instead of stamina and leaves burning ground behind you (${dmg(5, r)} damage twice a second).`,
    on: (rt, p) => {
      const P = pl(rt);
      if (p.n === 0) rt.spendHeat(15);
      rt.fireZone(P.pos, 1.3, 3);
      rt.vfx.burst(P.center, 'fire', 0.6, 3);
    },
  },
};

