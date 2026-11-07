import * as THREE from 'three';
import { R, type SkillDef, type SkillRuntime } from '../skills';

// Warbreaker: Cross Style's heavy road. Ilse teaches it once your Cross Style
// is at level 5. Still a weapon in each hand and still the beat (left, right,
// left), but the beat feeds Rage (0-100, classes/combat.ts) instead of
// Tempo: every strike in rhythm adds Rage, every blow you take adds more, and
// Rage makes you hit harder. The techniques are big and physical: an overhead
// with both weapons, a fissure torn through the ground, a charge, a roar, and
// one blow that spends everything.
//
// Every technique needs a weapon in each hand. Rage is spent by `rage` (a
// fixed cost) or, for the biggest blows, all of it.

const pl = (rt: SkillRuntime) => rt['player'];
const n = (v: number) => `${Math.round(v)}`;
const UP = new THREE.Vector3(0, 1, 0);

/** Rage spent by the last big blow (all of it, or what was there). */
function spendAll(rt: SkillRuntime, min = 0) {
  const r = Math.max(min, rt.cc.rage);
  rt.cc.rage = 0;
  return r;
}

/** The ground split open in a line: dust, rock and a red seam. */
function fissure(rt: SkillRuntime, from: THREE.Vector3, dir: THREE.Vector3, len: number) {
  const fx = rt.vfx.fx;
  for (let i = 1; i <= Math.ceil(len); i++) {
    const p = from.clone().addScaledVector(dir, i);
    rt.later(i * 0.035, () => {
      fx.add.spawn({ pos: p.clone().setY(p.y + 0.15), spread: 0.7, count: 14, life: [0.4, 0.9], size: [0.24, 0.05], color: 0x6a5a48, color2: 0x2a2018, upBias: 1.6, gravity: 6 });
      fx.add.spawn({ pos: p.clone().setY(p.y + 0.1), spread: 0.25, count: 5, life: [0.3, 0.6], size: [0.18, 0.03], color: 0xff5a2a, color2: 0x4a0a00, upBias: 0.6 });
    });
  }
}

/** A crater: a shockwave ring and a burst of earth. */
function crater(rt: SkillRuntime, at: THREE.Vector3, r: number) {
  rt.vfx.ring(at, 'blood', r * 2);
  rt.vfx.fx.add.spawn({ pos: at.clone().setY(at.y + 0.2), spread: r, count: Math.round(30 + r * 12), life: [0.4, 1], size: [0.28, 0.06], color: 0x6a5a48, color2: 0x2a2018, upBias: 1.2, drag: 2, gravity: 5 });
  rt.vfx.impact(at.clone().setY(at.y + 0.3), 'blood', r * 0.5);
}

/** Orc Blood and Hammerfall ride the two big overheads. */
function afterBigBlow(rt: SkillRuntime, at: THREE.Vector3, dmg: number) {
  const P = pl(rt);
  if (rt.has('orcBlood')) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.04);
  if (rt.has('hammerfall')) {
    rt.area(at, 3, dmg * 0.4, { poise: 60, source: 'melee', noVerdict: true });
    crater(rt, at, 3);
  }
}

export const WAR_SKILLS: Record<string, SkillDef> = {
  // ---- core ---------------------------------------------------------------------------
  'warbreaker:War Cleave': {
    action: 'sk_crossCut', cd: 4, stamina: 16, needDual: true,
    text: (r) => `Sweep both weapons through everything in front of you for ${n(140 * R(r))}% weapon damage (${n(190 * R(r))}% with 50 Rage or more). Each enemy it hits gives 8 Rage.`,
    on: (rt, p) => {
      const P = pl(rt);
      const k = rt.cc.rage >= 50 ? 1.9 : 1.4;
      const hit = rt.area(P.pos, 3, rt.weapon() * k * R(p.rank), { poise: 90, cone: { dir: P.forward, cos: 0.1 }, source: 'melee' });
      rt.cc.addRage(8 * hit.length);
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.8), P.yaw, 2.2, 'blood', 0.9, 0.2);
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.8), P.yaw, 2.0, 'steel', 0.9, -0.2);
    },
  },

  // ---- Ruin: huge blows ----------------------------------------------------------------
  'warbreaker:Skullsplitter': {
    action: 'sk_quake', cd: 7, stamina: 20, needDual: true, needTarget: 3.5,
    text: (r) => `Leap and bring both weapons down on one enemy: ${n(180 * R(r))}% weapon damage, plus 2% for each point of Rage it spends (up to 30). It breaks their guard and opens bleeding wounds.`,
    on: (rt, p, ev) => {
      if (ev !== 'quake') return;
      const P = pl(rt);
      const t = p.target?.alive ? p.target : P.aimTarget(3.5);
      const spent = Math.min(30, rt.cc.rage);
      rt.cc.rage -= spent;
      const at = t ? t.position.clone() : P.pos.clone().addScaledVector(P.forward, 1.6);
      if (t) {
        const dmg = rt.weapon() * (1.8 + 0.02 * spent) * R(p.rank);
        rt.hit(t, dmg, { poise: 220, source: 'melee' });
        rt.bleed(t, rt.weapon() * 0.25);
        afterBigBlow(rt, at, dmg);
      }
      rt.vfx.slash(at.clone().setY(at.y + 1.2), P.yaw, 1.6, 'blood', 0.4, 1.5);
      crater(rt, at, 1.6);
      P.onShake?.(0.35);
      P.onHitStop?.(0.12);
    },
  },
  'warbreaker:Earthbreaker': {
    action: 'sk_quake', cd: 12, stamina: 26, needDual: true,
    text: (r, rt) => `Drive both weapons into the ground and split it open in a line 9 m long. Everything along it takes ${n(110 * R(r))}% weapon damage and is knocked off its feet.${rt?.has('faultLine') ? ' The crack bursts again a moment later for 60%.' : ''}${rt?.has('aftershock') ? ' Everything within 4 m of you is thrown down too.' : ''}`,
    on: (rt, p, ev) => {
      if (ev !== 'quake') return;
      const P = pl(rt);
      const dir = P.forward.clone().setY(0).normalize();
      const from = P.pos.clone();
      const line = (k: number) => {
        for (let i = 1; i <= 9; i += 1.5) {
          const c = from.clone().addScaledVector(dir, i);
          rt.area(c, 1.6, rt.weapon() * k * R(p.rank) / 3, { poise: 140, stun: k >= 1, source: 'melee' });
        }
      };
      line(1.1);
      fissure(rt, from, dir, 9);
      P.onShake?.(0.4);
      if (rt.has('faultLine')) rt.later(0.8, () => { line(0.6); fissure(rt, from, dir, 9); });
      if (rt.has('aftershock')) {
        rt.area(P.pos, 4, rt.weapon() * 0.5, { poise: 160, stun: true, source: 'melee' });
        crater(rt, P.pos.clone(), 4);
      }
    },
  },
  'warbreaker:Ruinous Blow': {
    action: 'sk_quake', cd: 16, stamina: 30, needDual: true,
    text: (r) => `Spend all your Rage (at least 40) on one blow with everything behind it: ${n(150 * R(r))}% weapon damage, plus 3% per point of Rage, to everything within 3.5 m. Nothing keeps its footing.`,
    on: (rt, p, ev) => {
      if (ev !== 'quake') return;
      const P = pl(rt);
      const spent = spendAll(rt);
      const at = P.pos.clone().addScaledVector(P.forward, 1.2);
      const dmg = rt.weapon() * (1.5 + 0.03 * spent) * R(p.rank);
      rt.area(at, 3.5, dmg, { poise: 300, stun: true, source: 'melee' });
      afterBigBlow(rt, at, dmg);
      crater(rt, at, 3.5);
      rt.vfx.pillar(at, 'blood', 1.2, 4);
      P.onShake?.(0.6);
      P.onHitStop?.(0.16);
    },
  },
  'warbreaker:The Last Swing': {
    action: 'sk_quake', cd: 60, stamina: 30, needDual: true,
    text: (r) => `Spend all your Rage and leap, and bring both weapons down hard enough to crater the ground: ${n(400 * R(r))}% weapon damage to everything within 6 m, doubled at full Rage.`,
    on: (rt, p, ev) => {
      if (ev !== 'quake') return;
      const P = pl(rt);
      const full = rt.cc.rage >= rt.cc.rageMax - 0.5;
      spendAll(rt);
      const at = P.pos.clone().addScaledVector(P.forward, 1);
      rt.area(at, 6, rt.weapon() * 4 * (full ? 2 : 1) * R(p.rank), { poise: 500, stun: true, source: 'melee' });
      crater(rt, at, 6);
      for (let i = 0; i < 8; i++) fissure(rt, at, new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, (i / 8) * Math.PI * 2), 7);
      rt.vfx.pillar(at, 'blood', 2.4, 7);
      P.onShake?.(0.9);
      P.onHitStop?.(0.22);
    },
  },

  // ---- Fury: Rage and the beat ------------------------------------------------------------
  'warbreaker:Blood Howl': {
    action: 'sk_warcry', cd: 20, stamina: 12, needDual: true,
    text: (_r, rt) => `Howl: gain 30 Rage, and for 10 seconds deal 25% more damage and 20% more poise damage.${rt?.has('snarl') ? ' Enemies within 6 m flinch.' : ''}`,
    on: (rt, _p, ev) => {
      if (ev !== 'warcry') return;
      const P = pl(rt);
      rt.cc.addRage(30);
      rt.addBuff('howl', 10 * P.mods.duration);
      rt.vfx.ring(P.pos, 'blood', 6);
      rt.vfx.burst(P.center, 'blood', 0.8, 3);
      if (rt.has('snarl')) for (const t of rt.vfx.near(P.pos, 6)) rt.hit(t, 1, { poise: 130, noVerdict: true });
    },
  },
  'warbreaker:Frenzy': {
    cd: 24, stamina: 12, needDual: true,
    text: (_r, rt) => `For 8 seconds attack 30% faster${rt?.has('coldRage') ? '' : ', but take 10% more damage'}.${rt?.has('berserk') ? ' Every hit heals you for 3% of your health.' : ''}`,
    now: (rt) => {
      const P = pl(rt);
      rt.addBuff('frenzy', 8 * P.mods.duration);
      rt.vfx.aura(() => P.center, 'blood', 0.9, 8);
    },
  },
  'warbreaker:Rampage': {
    action: 'sk_bullRush', cd: 12, stamina: 22, needDual: true,
    text: (r, rt) => `Charge through everything in your way, both weapons swinging: each enemy you pass takes ${n((rt?.has('unstoppable') ? 63 : 45) * R(r))}% weapon damage several times and gives 3 Rage a hit.`,
    on: (rt, p, ev) => {
      if (ev !== 'rush') return;
      const P = pl(rt);
      const k = (rt.has('unstoppable') ? 0.63 : 0.45) * R(p.rank);
      const hit = rt.area(P.pos, 2, rt.weapon() * k, { poise: 45, source: 'melee' });
      rt.cc.addRage(3 * hit.length);
      if (p.n % 2 === 0) rt.vfx.slash(P.center, P.yaw + (p.n % 4 ? 0.5 : -0.5), 1.6, 'blood', 0.7, p.n % 4 ? 0.8 : -0.8);
    },
  },
  'warbreaker:Avatar of War': {
    cd: 90, stamina: 20, needDual: true,
    text: () => 'For 15 seconds your Rage stays full and never drains, you deal 20% more damage and attack 20% faster, and every fourth strike in rhythm sends out a shockwave.',
    now: (rt) => {
      const P = pl(rt);
      rt.addBuff('avatar', 15 * P.mods.duration);
      rt.cc.rage = rt.cc.rageMax;
      rt.vfx.pillar(P.pos, 'blood', 1.4, 6);
      rt.vfx.aura(() => P.center, 'blood', 1.2, 15);
      P.onShake?.(0.3);
    },
  },

  // ---- Ironhide: take it and keep coming ------------------------------------------------
  'warbreaker:Shrug Off': {
    cd: 25, stamina: 10, needDual: true,
    text: (r) => `Spend 30 Rage to spit, roll your shoulders and keep going: heal ${n(20 * R(r))}% of your health over 3 seconds.`,
    now: (rt, p) => {
      if (rt.cc.rage < 30) return false;
      rt.cc.rage -= 30;
      const P = pl(rt);
      for (let i = 1; i <= 6; i++) rt.later(i * 0.5, () => { if (!P.dead) P.hp = Math.min(P.maxHp, P.hp + (P.maxHp * 0.2 * R(p.rank)) / 6); });
      rt.vfx.spiral(P.pos, 'blood', 2.2, 0.8, 20);
    },
  },
  'warbreaker:Iron Roar': {
    action: 'sk_warcry', cd: 14, stamina: 14, needDual: true,
    text: (_r, rt) => `Roar: everything within ${rt?.has('taunting') ? 10 : 6} m is stunned and gives you 10 Rage (up to 50).${rt?.has('defiant') ? ' For 6 seconds after, you take 25% less damage.' : ''}`,
    on: (rt, _p, ev) => {
      if (ev !== 'warcry') return;
      const P = pl(rt);
      const r = rt.has('taunting') ? 10 : 6;
      const foes = rt.vfx.near(P.pos, r);
      for (const t of foes) rt.hit(t, 1, { poise: 250, stun: true, noVerdict: true });
      rt.cc.addRage(Math.min(50, foes.length * 10));
      if (rt.has('defiant')) rt.addBuff('defiant', 6);
      rt.vfx.ring(P.pos, 'blood', r * 2);
      P.onShake?.(0.25);
    },
  },
  'warbreaker:Last Stand': {
    cd: 40, stamina: 10, needDual: true,
    text: () => 'Plant your feet. For 8 seconds you take half damage, and every blow you take fills your Rage twice as fast.',
    now: (rt) => {
      const P = pl(rt);
      rt.addBuff('lastStand', 8 * P.mods.duration);
      rt.vfx.groundCircle(P.pos, 'blood', 2.4, 8);
    },
  },
  'warbreaker:Mountain That Walks': {
    cd: 60, stamina: 20, needDual: true,
    text: () => 'For 12 seconds you take half damage, and every blow you take answers back: a shockwave around you for 60% weapon damage.',
    now: (rt) => {
      const P = pl(rt);
      rt.addBuff('mountain', 12 * P.mods.duration);
      rt.vfx.aura(() => P.center, 'steel', 1.3, 12);
      crater(rt, P.pos.clone(), 2.5);
    },
  },
};
