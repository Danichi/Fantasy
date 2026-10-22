import * as THREE from 'three';
import { R, type SkillDef, type SkillRuntime } from '../skills';

// Cross Style: a sword in each hand, kept in rhythm. Tempo (classes/combat.ts)
// builds by alternating left and right strikes and makes you faster;
// techniques spend it. Every technique needs both blades.

const pl = (rt: SkillRuntime) => rt['player'];
const n = (v: number) => `${Math.round(v)}`;
const cone = (rt: SkillRuntime, cos: number) => ({ dir: pl(rt).forward, cos });

/** an X of two slashes */
function xSlash(rt: SkillRuntime, at: THREE.Vector3, yaw: number, size: number) {
  rt.vfx.slash(at, yaw, size, 'steel', 0.6, 0.7);
  rt.vfx.slash(at, yaw, size, 'steel', 0.6, -0.7);
}

export const CROSS_SKILLS: Record<string, SkillDef> = {
  // ---- core ---------------------------------------------------------------------------
  'cross:Cross Cut': {
    action: 'sk_crossCut', cd: 5, stamina: 14, needDual: true,
    text: (r) => `Cut with both blades at once, an X in front of you for ${n(120 * R(r))}% weapon damage, plus 25% for each point of Tempo it spends (all of it). It staggers.`,
    on: (rt, p) => {
      const P = pl(rt);
      const tempo = rt.cc.tempo;
      rt.cc.tempo = 0;
      rt.area(P.pos, 2.8, rt.weapon() * (1.2 + 0.25 * tempo) * R(p.rank), { poise: 80 + 15 * tempo, cone: cone(rt, 0.3), source: 'melee' });
      xSlash(rt, P.center.addScaledVector(P.forward, 0.9), P.yaw, 1.6 + tempo * 0.08);
      if (tempo >= 6) P.onShake?.(0.3);
    },
  },

  // ---- Twin Fang -------------------------------------------------------------------------
  'cross:Blade Dance': {
    action: 'sk_bladeDance', cd: 14, stamina: 24, tempo: 4, needDual: true,
    text: (r) => `Spend 4 Tempo on an eight-cut flurry, each cut hitting everything in front of you for ${n(40 * R(r))}% weapon damage.`,
    on: (rt, p) => {
      const P = pl(rt);
      rt.area(P.pos, 2.6, rt.weapon() * 0.4 * R(p.rank), { poise: 18, cone: cone(rt, 0.1), source: 'melee' });
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.5), P.yaw + (p.n % 2 ? 0.4 : -0.4), 1.8, 'steel', 0.6, (p.n % 2 ? 0.6 : -0.6));
    },
  },
  'cross:Viper Lunge': {
    action: 'sk_riposte', cd: 8, stamina: 14, needDual: true,
    text: (r) => `Lunge in with a double thrust: the first blade for ${n(170 * R(r))}% weapon damage, the second for ${n(90 * R(r))}% more.`,
    on: (rt, p) => {
      const P = pl(rt);
      const t = P.aimTarget(4);
      rt.later(0.12, () => {
        if (!t?.alive) return;
        rt.hit(t, rt.weapon() * 0.9 * R(p.rank), { poise: 40, source: 'melee' });
        rt.vfx.slash(t.center, P.yaw, 1.2, 'steel', 0.3);
      });
    },
  },
  'cross:Twin Fangs': {
    action: 'sk_crossCut', cd: 12, stamina: 18, tempo: 3, needDual: true, needTarget: 3.5,
    text: (r) => `Spend 3 Tempo to drive both blades into one enemy for ${n(220 * R(r))}% weapon damage, doubled if it's bleeding.`,
    on: (rt, p) => {
      const t = p.target?.alive ? p.target : pl(rt).aimTarget(3.5);
      if (!t) return;
      const bleeding = (rt.statusOf(t)?.bleed?.left ?? 0) > 0;
      rt.hit(t, rt.weapon() * 2.2 * R(p.rank) * (bleeding ? 2 : 1), { poise: 120, source: 'melee' });
      xSlash(rt, t.center, pl(rt).yaw, 1.3);
      pl(rt).onHitStop?.(0.1);
    },
  },

  // ---- Feint -----------------------------------------------------------------------------
  'cross:Feint': {
    action: 'sk_counter', cd: 8, stamina: 8, needDual: true,
    text: (_r, rt) => `Start a swing and pull it. ${rt?.has('shadowFeint') ? 'Every enemy in front of you' : 'The enemy in front of you'} flinches and is left open for 2.5 seconds: your next hit on it is a critical.${rt?.has('falseOpening') ? ' Gives 2 Tempo.' : ''}`,
    on: (rt) => {
      const P = pl(rt);
      const reach = rt.has('shadowFeint') ? 4.5 : 3;
      const foes = rt.vfx.near(P.pos, reach).filter((t) => t.position.clone().sub(P.pos).setY(0).normalize().dot(P.forward) > 0.3);
      const hit = rt.has('shadowFeint') ? foes : foes.slice(0, 1);
      for (const t of hit) rt.cc.open(t);
      if (hit.length && rt.has('falseOpening')) rt.cc.addTempo(2);
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.6), P.yaw, 1.2, 'steel', 0.3, 0.5);
    },
  },
  'cross:Flourish': {
    action: 'sk_crescent', cd: 16, stamina: 16, needDual: true,
    text: () => 'A showy spin of both blades. Everything within 5 m flinches and is left open: your next hit on each is a critical.',
    on: (rt, p) => {
      if (p.n > 0) return;
      const P = pl(rt);
      for (const t of rt.vfx.near(P.pos, 5)) {
        rt.hit(t, 1, { poise: 110, noVerdict: true });
        rt.cc.open(t);
      }
      rt.vfx.spinSlash(P.pos, 3, 'steel');
    },
  },
  'cross:Mirror Image': {
    cd: 30, stamina: 20, needDual: true,
    text: (r) => `Leave a copy of yourself behind for 6 seconds. Every second it cuts the nearest enemy within 4 m for ${n(50 * R(r))}% weapon damage.`,
    now: (rt, p) => {
      const P = pl(rt);
      const at = P.pos.clone();
      rt.vfx.pillar(at, 'steel', 0.5, 2.2);
      for (let i = 1; i <= 6; i++) {
        rt.later(i, () => {
          const t = rt.nearestEnemy(at.clone().setY(at.y + 1), 4);
          rt.vfx.fx.add.spawn({ pos: at.clone().setY(at.y + 1), spread: 0.6, count: 12, life: [0.3, 0.6], size: [0.12, 0.01], color: 0xffffff, color2: 0x8a9ab8, upBias: 1, jitter: 0.4 });
          if (!t) return;
          rt.hit(t, rt.weapon() * 0.5 * R(p.rank), { poise: 25, source: 'melee' });
          xSlash(rt, t.center, Math.atan2(t.position.x - at.x, t.position.z - at.z), 1.1);
        });
      }
    },
  },

  // ---- Dancer ------------------------------------------------------------------------------
  'cross:Whirling Step': {
    action: 'sk_dash', cd: 6, stamina: 14, needDual: true,
    text: (r) => `A dodge that spins both blades as you pass, cutting everything within 2.2 m four times for ${n(40 * R(r))}% weapon damage each. You can't be hurt while you spin.`,
    on: (rt, p) => {
      const P = pl(rt);
      rt.area(P.pos, 2.2, rt.weapon() * 0.4 * R(p.rank), { poise: 20, source: 'melee' });
      rt.vfx.slash(P.pos.clone().setY(P.pos.y + 0.9), P.yaw + p.n * 1.6, 1.8, 'steel', 1);
    },
  },
  'cross:Lunge': {
    action: 'sk_galeStep', cd: 9, stamina: 14, needDual: true,
    text: (r) => `Close the distance in an instant and strike with both blades for ${n(150 * R(r))}% weapon damage.`,
    on: (rt, _p, ev) => {
      if (ev !== 'galeStep') return;
      rt.vfx.ring(pl(rt).pos, 'steel', 3);
    },
  },
  'cross:Tempest Waltz': {
    action: 'sk_cyclone', cd: 22, stamina: 18, tempo: 2, needDual: true,
    text: (r, rt) => `Spend all your Tempo (at least 2) to spin through a crowd for 2 seconds, cutting everything within 2.4 m eight times for ${n(30 * R(r))}% weapon damage, plus 6% per Tempo spent.${rt?.has('lastStep') ? ' Ends with a finishing cross-cut.' : ''}`,
    on: (rt, p) => {
      const P = pl(rt), q = p as typeof p & { spent?: number };
      if (p.n === 0) {
        q.spent = 2 + rt.cc.tempo;
        rt.cc.tempo = 0;
      }
      const k = (0.3 + 0.06 * (q.spent ?? 2)) * R(p.rank);
      rt.area(P.pos, 2.4, rt.weapon() * k, { poise: 18, source: 'melee' });
      rt.vfx.slash(P.pos.clone().setY(P.pos.y + 1), P.yaw + p.n * 2.1, 2.2, 'steel', 1);
      if (p.n === 7 && rt.has('lastStep')) {
        rt.area(P.pos, 2.8, rt.weapon() * 1.2 * R(p.rank), { poise: 120, source: 'melee' });
        xSlash(rt, P.center.addScaledVector(P.forward, 0.8), P.yaw, 1.8);
      }
    },
  },
};
