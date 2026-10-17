import { R, type SkillDef, type SkillRuntime } from '../skills';

// Boundary Style: hold F while standing still and a small blue ring rises
// around you; whatever reaches into it is turned aside (classes/combat.ts).
// Holding it spends Focus. These techniques shape the ring, punish what it
// stops, and keep you standing.

const pl = (rt: SkillRuntime) => rt['player'];
const n = (v: number) => `${Math.round(v)}`;
/** how far "inside your Boundary" reaches right now (its full size if it's down) */
const reach = (rt: SkillRuntime) => rt.cc.domainR || 2.8 * (1 + rt.x('wideStance'));

export const BOUNDARY_SKILLS: Record<string, SkillDef> = {
  // ---- Stillpoint -------------------------------------------------------------------------
  'boundary:Hold Fast': {
    cd: 20, focus: 10,
    text: () => 'For 4 seconds you can walk (slowly) without dropping your Boundary.',
    now: (rt) => {
      rt.addBuff('holdFast', 4);
      rt.vfx.ring(pl(rt).pos, 'frost', 4);
    },
  },
  'boundary:Ward Stone': {
    cd: 25, focus: 20,
    text: () => 'Set a ring of the same size where you stand. It stays for 6 seconds after you leave, turning aside anything that reaches into it.',
    now: (rt) => {
      const P = pl(rt);
      rt.cc.stone = { pos: P.pos.clone(), r: reach(rt), left: 6 * P.mods.duration };
      rt.vfx.pillar(P.pos, 'frost', 0.35, 2.5);
    },
  },
  'boundary:Sanctum': {
    action: 'sk_vow', cd: 45,
    text: (r) => `For ${(8 * R(r)).toFixed(0)} seconds your Boundary is 30% wider and costs no Focus to hold.`,
    on: (rt, p) => {
      rt.addBuff('sanctum', 8 * R(p.rank));
      rt.vfx.pillar(pl(rt).pos, 'frost', 1.2, 6);
    },
  },

  // ---- Recoil -----------------------------------------------------------------------------
  'boundary:Return Strike': {
    action: 'sk_crescent', cd: 8, stamina: 14, focus: 25,
    text: (r) => `Spend 25 Focus on one sweeping cut through everything inside your Boundary for ${n(110 * R(r))}% weapon damage. Reeling enemies take a critical.`,
    on: (rt, p) => {
      if (p.n > 0) return;
      const P = pl(rt), r = reach(rt);
      for (const t of rt.vfx.near(P.pos, r)) rt.hit(t, rt.weapon() * 1.1 * R(p.rank), { poise: 60, source: 'melee', crit: t.stunned });
      rt.vfx.spinSlash(P.pos, r, 'frost');
      rt.vfx.ring(P.pos, 'frost', r * 2.4);
    },
  },
  'boundary:Repel': {
    action: 'sk_guardUp', cd: 12, focus: 20,
    text: () => 'Spend 20 Focus to throw everything inside your Boundary (and a little beyond) out of it, staggered.',
    on: (rt) => {
      const P = pl(rt), r = reach(rt) + 1;
      rt.area(P.pos, r, 1, { poise: 220, noVerdict: true });
      rt.vfx.ring(P.pos, 'frost', r * 2.6);
      rt.vfx.burst(P.center, 'frost', 0.8, 4);
      P.onShake?.(0.25);
    },
  },
  'boundary:Collapse': {
    action: 'sk_quake', cd: 30, stamina: 20, focus: 40,
    text: (r, rt) => `Spend all your Focus (at least 40) to snap the ring shut: everything within 4.5 m is dragged to you and takes ${n(60 * R(r))}% weapon damage, plus 1.4% for each Focus spent.${rt?.has('closingRing') ? ' They are left dazed.' : ''}`,
    on: (rt, p) => {
      const P = pl(rt);
      const spent = 40 + rt.cc.focus;
      rt.cc.focus = 0;
      rt.area(P.pos, 4.5, rt.weapon() * (0.6 + spent * 0.014) * R(p.rank), { poise: 200, pull: true, stun: rt.has('closingRing'), source: 'melee' });
      rt.vfx.ring(P.pos, 'frost', 11);
      rt.vfx.ring(P.pos, 'frost', 5);
      rt.vfx.burst(P.center, 'frost', 1.4, 6);
      P.onShake?.(0.5);
    },
  },

  // ---- Warden ------------------------------------------------------------------------------
  'boundary:Challenge': {
    action: 'sk_warcry', cd: 20, stamina: 10,
    text: (r) => `Roar a challenge. Every enemy within 10 m flinches, you gain 10 Focus for each (up to 40), and you take 20% less damage for ${(6 * R(r)).toFixed(0)} seconds.`,
    on: (rt, p) => {
      const P = pl(rt);
      const foes = rt.vfx.near(P.pos, 10);
      for (const t of foes) rt.hit(t, 1, { poise: 30, noVerdict: true });
      rt.cc.focus = Math.min(rt.cc.focusMax, rt.cc.focus + Math.min(40, 10 * foes.length));
      rt.addBuff('challenge', 6 * R(p.rank));
      rt.vfx.ring(P.pos, 'frost', 16);
      P.onShake?.(0.2);
    },
  },
  'boundary:Oath Ward': {
    action: 'sk_vow', cd: 25, stamina: 12,
    text: (r, rt) => `Swear an oath: a ward absorbs the next ${n((30 + 10 * r) * (1 + (rt?.x('wardAbsorb') ?? 0)))} damage for 10 seconds.`,
    on: (rt, p) => rt.shield((30 + 10 * p.rank) * (1 + rt.x('wardAbsorb')), 10, 'ward', 'frost'),
  },
  'boundary:Rallying Cry': {
    action: 'sk_vow', cd: 50, stamina: 10,
    text: (r, rt) => `Heal ${n(15 + 3 * r)}% of your health, recover 40 stamina and put out any burns.${rt?.has('undyingVow') ? ' Refills your Focus.' : ''}`,
    on: (rt, p) => {
      const P = pl(rt);
      P.heal(P.maxHp * ((15 + 3 * p.rank) / 100));
      P.stamina = Math.min(P.maxStamina, P.stamina + 40);
      P.cleanse();
      if (rt.has('undyingVow')) rt.cc.focus = rt.cc.focusMax;
      rt.vfx.ring(P.pos, 'frost', 8);
      rt.vfx.burst(P.center, 'frost', 0.8, 4);
    },
  },
};
