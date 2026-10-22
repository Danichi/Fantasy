import { R, type SkillDef, type SkillRuntime } from '../skills';

// Lightbinder: you bind light, you don't throw it. Light is placed in the
// world (motes, wells) and tied to things (brands, tethers, chains, halos).
// Radiance builds whenever your light touches something; spells marked
// "empowered" spend 25 of it to work 50% better.

const pl = (rt: SkillRuntime) => rt['player'];
const n = (v: number) => `${Math.round(v)}`;
const EMP = ' Empowered by Radiance.';

export const LIGHT_SKILLS: Record<string, SkillDef> = {
  // ---- core -----------------------------------------------------------------------------
  'lightbinder:Mote of Light': {
    action: 'sk_castSelf', cd: 5, mana: 10,
    text: (_r, rt) =>
      `Set a small floating light beside you for 30 seconds. It lights the dark and heals you ${(1.5 * (1 + (rt?.x('softLight') ?? 0))).toFixed(1)} health a second while you stay within 3.5 m. Casting again moves it.` +
      (rt?.has('lanternCage') ? ' The first enemy to come close is held for 2 seconds.' : ''),
    on: (rt) => {
      const P = pl(rt);
      rt.placeMote(P.pos.clone().addScaledVector(P.forward, 0.8).setY(P.pos.y + 1.9), 30 * P.mods.duration);
    },
  },

  // ---- Mercy ----------------------------------------------------------------------------
  'lightbinder:Healing Light': {
    action: 'sk_pray', cd: 6, kindle: true,
    text: (r, rt) => `Pray for about 3 seconds: five pulses of light, each healing ${n(6 * R(r))} and draining ${n(6 * (1 - (rt?.x('steadyPrayer') ?? 0)))} mana. Stop early (dodge) and you only pay for what you used.${EMP}`,
    on: (rt, p) => {
      const P = pl(rt);
      const cost = 6 * (1 - rt.x('steadyPrayer')) * Math.max(0, P.mods.manaCost);
      if (P.mana < cost) return;
      P.mana -= cost;
      if (p.n === 0) P.onSpell?.('healingLight', P.center, P.forward, null);
      const hurt = P.hp < P.maxHp;
      P.heal(6 * R(p.rank) * p.k);
      if (hurt) rt.gainRadiance(3);
      rt.vfx.fx.add.spawn({ pos: P.center.clone().setY(P.pos.y + 1.2), spread: 1.5, count: 14, life: [0.4, 0.8], size: [0.1, 0.01], color: 0xfff6d0, color2: 0xffc050, upBias: 1.4, jitter: 0.5 });
    },
  },
  'lightbinder:Lightwell': {
    action: 'sk_castSelf', cd: 25, mana: 22, kindle: true,
    text: (r, rt) =>
      `Set a well of light on the ground for 20 seconds. It holds 2 bursts: step into it while hurt to heal ${n(22 * R(r))}.` +
      (rt?.has('spring') ? ' Standing in it also heals 2 a second.' : '') +
      (rt?.x('beaconWell') ? ' Each burst gives 15 Radiance.' : '') +
      EMP,
    on: (rt, p) => {
      const P = pl(rt);
      const at = P.pos.clone().addScaledVector(P.forward, 1.5);
      let charges = 2, wait = 0;
      const heal = 22 * R(p.rank) * p.k;
      rt.vfx.pillar(at, 'light', 0.8, 4);
      rt.vfx.zone({
        pos: at, radius: 1.5, life: 20 * P.mods.duration, style: 'light', every: 0.25, motes: 40,
        onTick: (z) => {
          wait -= 0.25;
          const inside = P.pos.distanceTo(z.pos) < z.radius + 0.3;
          if (!inside) return;
          if (rt.has('spring')) P.heal(0.5);
          if (charges > 0 && wait <= 0 && P.hp < P.maxHp - 8) {
            charges--;
            wait = 1;
            P.heal(heal);
            rt.gainRadiance(6 + rt.x('beaconWell'));
            rt.vfx.pillar(z.pos, 'light', 0.9, 5);
            if (charges === 0 && !rt.has('spring')) z.t = z.life;
          }
        },
      });
    },
  },
  'lightbinder:Second Dawn': {
    cd: 10, mana: 12,
    text: () => 'An instant prayer for a heavy blow: for the next second, any hit worth more than a quarter of your health is halved. Gives 10 Radiance when it saves you.',
    now: (rt) => {
      rt.addBuff('secondDawn', 1);
      const P = pl(rt);
      rt.vfx.bubble(() => P.pos, 'light', 1.2, () => rt.buff('secondDawn'));
      rt.vfx.ring(P.pos, 'light', 4);
    },
  },

  // ---- Judgment -------------------------------------------------------------------------
  'lightbinder:Brand': {
    action: 'sk_cast', cd: 6, mana: 10, needTarget: 18,
    text: (_r, rt) =>
      `Brand your target for ${rt?.has('unblinking') ? 'the rest of its life' : `${8 + (rt?.x('brandTime') ?? 0)} seconds`}. Every hit you land on it lays a Verdict stack (up to ${rt?.has('swiftJustice') ? 3 : 5}) for Sentence to cash in, and gives Radiance.`,
    on: (rt, p) => {
      const t = p.target;
      if (!t?.alive) return;
      rt.brand(t, 8);
      rt.vfx.lightning(rt.hand(), t.center, 'light');
      rt.vfx.burst(t.center, 'light', 0.6, 3);
    },
  },
  'lightbinder:Sentence': {
    action: 'sk_cast', cd: 8, mana: 16, needTarget: 18, kindle: true,
    text: (r, rt) =>
      `A column of light falls on your target and uses up its Verdict: ${n(15 * R(r))} holy damage plus ${n(12 * R(r))} per stack.` +
      (rt?.has('swiftJustice') ? ' Recharges 40% faster.' : ' At 5 stacks it also stuns.') +
      (rt?.has('finalWord') ? ' At 5 stacks it is always a critical hit.' : '') +
      EMP,
    on: (rt, p) => {
      const t = p.target;
      if (rt.has('swiftJustice')) rt.setCooldown(p.key, 8 * 0.6);
      if (!t?.alive) return;
      const s = rt.statusOf(t);
      const stacks = s?.verdict ?? 0;
      if (s) s.verdict = 0;
      const full = stacks >= 5;
      rt.vfx.pillar(t.position, 'light', 0.8 + stacks * 0.12, 10);
      rt.hit(t, rt.spell(15 + 12 * stacks, 'holy') * R(p.rank) * p.k, { poise: 60 + stacks * 30, stun: full, crit: full && rt.has('finalWord'), noVerdict: true });
      if (full) pl(rt).onShake?.(0.35);
    },
  },
  'lightbinder:Radiant Lance': {
    action: 'sk_cast', cd: 10, mana: 18, freeAim: true, kindle: true,
    text: (r) => `Throw a spear of light for ${n(14 * R(r))} holy damage. A branded enemy it hits is pinned: a long stagger and an extra Verdict stack.${EMP}`,
    on: (rt, p) => {
      const from = rt.hand();
      rt.vfx.projectile({
        from, dir: rt.aimDir(p, from), speed: 30, range: 24, style: 'light', shape: 'spear', size: 1.2, radius: 0.4,
        onHit: (t, _a, d) => {
          const pinned = rt.branded(t);
          rt.hit(t, rt.spell(14, 'holy') * R(p.rank) * p.k, { poise: pinned ? 260 : 60, dir: d, stun: pinned });
          if (pinned) {
            rt.addVerdict(t);
            rt.vfx.pillar(t.position, 'light', 0.4, 3);
            rt.vfx.ring(t.position, 'light', 4);
          }
        },
      });
    },
  },

  // ---- Binding --------------------------------------------------------------------------
  'lightbinder:Light Tether': {
    action: 'sk_cast', cd: 12, mana: 14, needTarget: 16, kindle: true,
    text: (_r, rt) => `Tie your target to the spot where it stands for ${((6 + (rt?.x('tetherTime') ?? 0)) * (rt?.has('bindersOath') ? 2 : 1)).toFixed(0)} seconds. If it strays more than 6 m it is yanked back and staggered.${EMP} (Lasts 50% longer.)`,
    on: (rt, p) => {
      const t = p.target;
      if (!t?.alive) return;
      const s = rt.st(t);
      const life = (6 + rt.x('tetherTime')) * (rt.has('bindersOath') ? 2 : 1) * p.k * pl(rt).mods.duration;
      const tether = { at: t.position.clone(), left: life, cd: 0 };
      s.tether = tether;
      const anchor = tether.at.clone().setY(tether.at.y + 0.1);
      rt.vfx.groundCircle(tether.at, 'light', 2, life);
      rt.vfx.beam(() => anchor, () => t.center, 'light', () => s.tether === tether && tether.left > 0 && t.alive);
      rt.vfx.burst(t.center, 'light', 0.5, 3);
    },
  },
  'lightbinder:Halo Ward': {
    action: 'sk_castSelf', cd: 16, mana: 16,
    text: (_r, rt) =>
      `A ring of light circles you for 20 seconds and stops the next ${rt?.has('wideHalo') ? 4 : 2} arrows or thrown things, from any side. Each one stopped gives 10 Radiance.` +
      (rt?.has('mirrorHalo') ? ' Stopped shots fly back at the shooter.' : '') +
      (rt?.has('sanctuaryLine') ? ' Raising it throws back every enemy within 2.5 m.' : ''),
    on: (rt) => {
      const P = pl(rt);
      rt.halo = rt.has('wideHalo') ? 4 : 2;
      rt.addBuff('halo', 20);
      rt.vfx.bubble(() => P.pos, 'light', 1.3, () => rt.buff('halo'));
      rt.vfx.ring(P.pos, 'light', 5);
      if (rt.has('sanctuaryLine')) {
        rt.area(P.pos, 2.5, 1, { poise: 180, noVerdict: true });
        rt.vfx.ring(P.pos, 'light', 8);
      }
    },
  },
  'lightbinder:Chains of Dawn': {
    action: 'sk_cast', cd: 18, mana: 22, needTarget: 16, kindle: true,
    text: (_r, rt) => `Chain your target to up to two enemies near it for ${(8 * (rt?.has('bindersOath') ? 2 : 1)).toFixed(0)} seconds: 30% of the damage any of them takes is dealt to the others too.${EMP} (Lasts 50% longer.)`,
    on: (rt, p) => {
      const t = p.target;
      if (!t?.alive) return;
      const list = [t];
      const skip = new Set([t.id]);
      for (let i = 0; i < 2; i++) {
        const o = rt.nearestEnemy(t.center, 8, skip);
        if (!o) break;
        skip.add(o.id);
        list.push(o);
      }
      if (list.length < 2) return;
      rt.chain = list;
      rt['chainLeft'] = 8 * (rt.has('bindersOath') ? 2 : 1) * p.k * pl(rt).mods.duration;
      for (let i = 0; i < list.length; i++) {
        const a = list[i], b = list[(i + 1) % list.length];
        if (list.length === 2 && i === 1) break;
        rt.vfx.beam(() => a.center, () => b.center, 'light', () => rt.chain.includes(a) && rt.chain.includes(b), 0.035);
      }
      for (const e of list) rt.vfx.burst(e.center, 'light', 0.4, 3);
    },
  },
};

