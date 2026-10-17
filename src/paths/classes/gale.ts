import { R, type SkillDef, type SkillRuntime } from '../skills';
import { physics } from '../../physics/physics';

// Gale Style: a sword style built on the dodge. Pure swordwork: no thrown wind,
// no lightning. Flow (classes/combat.ts) builds when attacks pass through your
// dodge and from the strikes right after; techniques spend it.

const pl = (rt: SkillRuntime) => rt['player'];
const n = (v: number) => `${Math.round(v)}`;
const cone = (rt: SkillRuntime, cos: number) => ({ dir: pl(rt).forward, cos });

export const GALE_SKILLS: Record<string, SkillDef> = {
  // ---- Tailwind -----------------------------------------------------------------------
  'gale:Gale Step': {
    action: 'sk_galeStep', cd: 6, stamina: 16, flow: 1,
    text: (r) => `Dash forward and cut through whatever stands in the way for ${n(150 * R(r))}% weapon damage. Nothing can touch you during the dash. Costs 1 Flow.`,
    on: (rt, _p, ev) => {
      if (ev !== 'galeStep') return;
      rt.vfx.ring(pl(rt).pos, 'gale', 4);
      rt.vfx.burst(pl(rt).center, 'gale', 0.4, 3);
    },
  },
  'gale:Crescent Sweep': {
    action: 'sk_crescent', cd: 9, stamina: 22,
    text: (r) => `Two spinning cuts, each hitting everything within 3 m for ${n(90 * R(r))}% weapon damage and knocking small foes back.`,
    on: (rt, p) => {
      const P = pl(rt);
      rt.area(P.pos, 3, rt.weapon() * 0.9 * R(p.rank), { poise: 45, source: 'melee' });
      rt.vfx.spinSlash(P.pos, 2.6, 'gale');
    },
  },
  'gale:Cyclone': {
    action: 'sk_cyclone', cd: 18, stamina: 15, flow: 2,
    text: (r, rt) => `Spend all your Flow (at least 2) to whirl forward for 2 seconds, cutting everything within 2.4 m eight times. Each cut deals ${n(30 * R(r) * (1 + (rt?.x('ceaseless') ?? 0)))}% weapon damage, plus 8% for every Flow spent.`,
    on: (rt, p) => {
      const P = pl(rt), q = p as typeof p & { spent?: number };
      if (p.n === 0) {
        q.spent = 2 + rt.flow; // the 2 already paid, and whatever was left
        rt.flow = 0;
      }
      const k = (0.3 + 0.08 * (q.spent ?? 2)) * R(p.rank) * (1 + rt.x('ceaseless'));
      rt.area(P.pos, 2.4, rt.weapon() * k, { poise: 20, source: 'melee' });
      rt.vfx.slash(P.pos.clone().setY(P.pos.y + 1), P.yaw + p.n * 2.1, 2.2, 'gale', 1);
    },
  },

  // ---- Drawn Steel ----------------------------------------------------------------------
  'gale:Moonlit Draw': {
    action: 'sk_moonlit', cd: 10, stamina: 20,
    text: (r, rt) =>
      `Draw slowly, then release one enormous cut in front of you for ${n(220 * R(r) * (rt?.has('heavyDraw') ? 1.4 : 1))}% weapon damage. It always staggers, and if nothing hits you while you draw, it's a critical.` +
      (rt?.has('oneBreath') ? ' Always critical, but spends all your Flow.' : ''),
    on: (rt, p, ev) => {
      const P = pl(rt), q = p as typeof p & { drawAt?: number };
      if (ev === 'moonlitCharge') {
        q.drawAt = rt['time'];
        if (rt.has('quickdraw') && P.act) P.act.speed *= 1.4;
        rt.vfx.groundCircle(P.pos, 'frost', 2.6, 1.6);
        return;
      }
      const clean = rt.cc.lastHurt < (q.drawAt ?? 0);
      const crit = rt.has('oneBreath') || clean;
      if (rt.has('oneBreath')) rt.flow = 0;
      const chain = rt.buffs.get('pressure')?.v ?? 0;
      const dmg = rt.weapon() * 2.2 * R(p.rank) * (rt.has('heavyDraw') ? 1.4 : 1) * (1 + 0.1 * chain);
      const hit = rt.area(P.pos, 3.8, dmg, { poise: 170, cone: cone(rt, 0.35), crit, source: 'melee' });
      if (rt.has('pressure')) rt.buffs.set('pressure', { left: 20, v: crit && hit.length ? Math.min(3, chain + 1) : 0 });
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.6), P.yaw, 3.2, 'frost', 0.6, 0.3);
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.6), P.yaw, 2.6, 'gale', 0.5, -0.2);
      P.onShake?.(0.45);
      P.onHitStop?.(0.12);
    },
  },
  'gale:Flash Cut': {
    cd: 10, stamina: 14, flow: 2, needTarget: 6,
    text: (r) => `Cross up to 6 m in a blink, passing through your target and cutting it for ${n(140 * R(r))}% weapon damage on the way. Costs 2 Flow.`,
    now: (rt, p) => {
      const P = pl(rt), t = p.target;
      if (!t?.alive || !P.canAct) return false;
      const dir = t.position.clone().sub(P.pos).setY(0);
      const d = dir.length();
      if (d > 6.5) return false;
      dir.normalize();
      const want = d + t.radius + 1.1;
      const wall = physics.castRay(P.center, dir, want + 0.5);
      const go = wall === null ? want : Math.max(0, wall - 0.6);
      const from = P.center;
      P.teleport(P.pos.clone().addScaledVector(dir, go).setY(P.pos.y + 0.2));
      P.yaw = Math.atan2(-dir.x, -dir.z); // turn to face back the way you came
      rt.hit(t, rt.weapon() * 1.4 * R(p.rank), { poise: 90, source: 'melee', dir });
      rt.vfx.slash(from.clone().lerp(P.center, 0.5), Math.atan2(dir.x, dir.z), 2.4, 'frost', 0.4, 0.1);
      rt.vfx.fx.add.spawn({ pos: from, vel: dir.clone().multiplyScalar(14), spread: 1, count: 24, life: [0.15, 0.3], size: [0.12, 0.01], color: 0xeef6ff, color2: 0x5a9cff, drag: 4 });
      P.onHitStop?.(0.08);
    },
  },
  'gale:Razor Gale': {
    action: 'sk_razorGale', cd: 12, stamina: 26, flow: 1,
    text: (r) => `A three-strike flurry, each strike hitting everything in front of you for ${n(80 * R(r))}% weapon damage. Costs 1 Flow.`,
    on: (rt, p) => {
      const P = pl(rt);
      rt.area(P.pos, 3.2, rt.weapon() * 0.8 * R(p.rank), { poise: 40, cone: cone(rt, 0.2), source: 'melee' });
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.5), P.yaw + (p.n - 1) * 0.5, 2.4, 'gale', 0.7, (p.n - 1) * 0.4);
    },
  },
  'gale:Thousand Cuts': {
    action: 'sk_thousandCuts', cd: 50, stamina: 30, flow: 5, needTarget: 6,
    text: (r) => `Spend 5 Flow to vanish into eight lightning-quick cuts on your target, each for ${n(45 * R(r))}% weapon damage. Nothing can touch you while you cut.`,
    on: (rt, p) => {
      const P = pl(rt);
      const t = p.target?.alive ? p.target : P.aimTarget(6);
      if (!t) return;
      rt.hit(t, rt.weapon() * 0.45 * R(p.rank), { poise: 30, source: 'melee', crit: p.n === 7 });
      rt.vfx.slash(t.center, Math.random() * 6.28, 1.4 + t.radius, p.n % 2 ? 'gale' : 'frost', 0.4, (Math.random() - 0.5) * 1.5);
      P.onHitStop?.(0.04);
    },
  },

  // ---- Stillwind --------------------------------------------------------------------------
  'gale:Riposte': {
    action: 'sk_riposte', cd: 6, stamina: 12,
    text: (r, rt) => `A lunging thrust for ${n(170 * R(r))}% weapon damage. Against a staggered or parried enemy it's a critical and returns 2 Flow.${rt?.has('calm') ? ' Each point of Calm adds 6%.' : ''}`,
    on: (rt) => {
      const P = pl(rt);
      const t = P.aimTarget(4);
      if (t?.stunned) rt.flow = Math.min(rt.flowMax, rt.flow + 2);
      rt.vfx.slash(P.center.addScaledVector(P.forward, 0.8), P.yaw, 1.6, 'gale', 0.3);
    },
  },
  'gale:Counterstance': {
    action: 'sk_counter', cd: 12, stamina: 8,
    text: (r) => `Settle into a stance for ${(2 * R(r)).toFixed(1)} seconds: the next blow that reaches you from the front is parried automatically.`,
    on: (rt, p) => {
      rt.addBuff('counter', 2 * R(p.rank));
      rt.vfx.groundCircle(pl(rt).pos, 'steel', 2.4, 2 * R(p.rank));
    },
  },
  'gale:Stillwater': {
    action: 'sk_lparry', cd: 16, stamina: 10,
    text: (r) => `A long, quiet parry. If it catches a blow you answer at once with a cut for ${n(160 * R(r))}% weapon damage that is always critical.`,
    on: (rt, p) => {
      rt.addBuff('stillwater', 0.8);
      rt.buffs.set('stillwaterK', { left: 1, v: R(p.rank) });
      rt.vfx.burst(rt.hand(), 'frost', 0.3, 2);
    },
  },
};

