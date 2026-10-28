import { test, expect } from './fixtures';

// The combat rework (src/combat/core.ts, ai.ts; player.ts): damage types,
// poise and stagger immunity, posture breaks and finishers, crits from play,
// the parry and dodge ladder, unblockables, attack turns, string branches,
// the humanoid brain, and the drill yard. Pure rules are checked on stand-in
// targets; the rest on the real player and a real bandit, stepped directly.

/** A stand-in target: records the last blow it took. */
const FAKE = `(over = {}) => {
  const T = window.__game.THREE;
  const t = {
    id: 900000 + Math.floor(Math.random() * 99999), kind: 'bandit', alive: true, lockable: true, stunned: false,
    hp: 110, maxHp: 110, radius: 0.4, halfHeight: 0.5, yaw: 0,
    position: new T.Vector3(0, 0, 0), center: new T.Vector3(0, 1, 0), last: null, breaks: 0,
    takeHit(h) { this.hp -= h.damage; this.last = h; if (this.hp <= 0) this.alive = false; },
    onBreak() { this.breaks++; },
    ...over,
  };
  return t;
}`;

test('damage types: blunt shatters bone, slash glances off it; pierce finds the gaps in plate', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (fakeSrc) => {
    const fake = eval(fakeSrc);
    const g = (window as any).__game, T = g.THREE;
    const { strike } = await import('/src/combat/core.ts');
    const from = new T.Vector3(0, 0, -2);
    const hit = (kind: string, type: string) => strike(fake({ kind, hp: 9999, maxHp: 9999 }), { base: 100, type: type as any, poise: 0, from, source: 'melee', steady: true, noCrit: true }).damage;
    return {
      boneSlash: hit('skeleton', 'slash'), boneBlunt: hit('skeleton', 'blunt'),
      plateSlash: hit('livingArmour', 'slash'), platePierce: hit('livingArmour', 'pierce'),
      slimeBlunt: hit('slime', 'blunt'), slimeFire: hit('slime', 'fire'),
    };
  }, FAKE);
  expect(res.boneBlunt).toBeGreaterThan(res.boneSlash * 2);
  expect(res.platePierce).toBeGreaterThan(res.plateSlash * 1.8);
  expect(res.slimeFire).toBeGreaterThan(res.slimeBlunt * 2);
  expect(game.errors).toEqual([]);
});

test('poise: light blows stagger only once the pool runs dry, then a moment of immunity', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (fakeSrc) => {
    const fake = eval(fakeSrc);
    const g = (window as any).__game, T = g.THREE;
    const { strike, combatOf } = await import('/src/combat/core.ts');
    const t = fake({ hp: 9999, maxHp: 110 });
    const from = new T.Vector3(0, 0, 2); // in front (it faces +Z)
    const reacts = [1, 2, 3, 4].map(() => strike(t, { base: 5, type: 'slash', poise: 22, from, source: 'melee', noCrit: true }).react);
    const st = combatOf(t);
    st.update(1.2); // the immunity wears off
    const after = [1, 2].map(() => strike(t, { base: 5, type: 'slash', poise: 22, from, source: 'melee', noCrit: true }).react);
    return { reacts, after, pool: st.poiseMax, passedPoise: t.last.poise };
  }, FAKE);
  expect(res.pool).toBe(38);
  expect(res.reacts).toEqual(['none', 'stagger', 'none', 'none']);
  expect(res.after).toContain('stagger');
  expect(game.errors).toEqual([]);
});

test('posture: it fills, breaks (open to a finisher), and drains back', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (fakeSrc) => {
    const fake = eval(fakeSrc);
    const { combat, combatOf, finisherOpen } = await import('/src/combat/core.ts');
    const t = fake({ hp: 200, maxHp: 200 });
    const st = combatOf(t);
    const max = st.postureMax;
    combat.addPosture(t, max * 0.6);
    const before = finisherOpen(t);
    const broke = combat.addPosture(t, max * 0.5);
    const open = finisherOpen(t) && !combat.canAct(t);
    for (let i = 0; i < 240; i++) st.update(1 / 60); // four seconds
    const recovered = !st.broken;
    const left = st.posture;
    for (let i = 0; i < 600; i++) st.update(1 / 60); // ten more: it drains away
    return { max, before, broke, open, breaks: t.breaks, recovered, left, drained: st.posture };
  }, FAKE);
  expect(res.max).toBeGreaterThan(50);
  expect(res.before).toBe(false);
  expect(res.broke).toBe(true);
  expect(res.open).toBe(true);
  expect(res.breaks).toBe(1);
  expect(res.recovered).toBe(true);
  expect(res.drained).toBeLessThan(res.left);
  expect(game.errors).toEqual([]);
});

test('crits come from play: a backstab, a counter-hit, a riposte, a broken guard', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (fakeSrc) => {
    const fake = eval(fakeSrc);
    const g = (window as any).__game, T = g.THREE;
    const { strike, combat } = await import('/src/combat/core.ts');
    const base = { base: 20, type: 'slash' as const, poise: 10, source: 'melee' as const, steady: true };
    const front = new T.Vector3(0, 0, 2), back = new T.Vector3(0, 0, -2);
    const plain = strike(fake({ hp: 999, maxHp: 999 }), { ...base, from: front });
    const backstab = strike(fake({ hp: 999, maxHp: 999 }), { ...base, from: back });
    const w = fake({ hp: 999, maxHp: 999 });
    combat.windup(w, 0.5, 'normal');
    const counter = strike(w, { ...base, from: front });
    const riposte = strike(fake({ hp: 999, maxHp: 999, stunned: true }), { ...base, from: front });
    const b = fake({ hp: 999, maxHp: 999 });
    combat.addPosture(b, 99999);
    const broken = strike(b, { ...base, from: front });
    return {
      plain: [plain.crit, plain.damage], backstab: [backstab.reason, backstab.damage],
      counter: [counter.reason, counter.react], riposte: riposte.reason, broken: broken.reason,
    };
  }, FAKE);
  expect(res.plain[0]).toBe(false);
  expect(res.backstab[0]).toBe('backstab');
  expect(res.backstab[1]).toBeGreaterThan((res.plain[1] as number) * 1.5);
  expect(res.counter).toEqual(['counter', 'stagger']);
  expect(res.riposte).toBe('riposte');
  expect(res.broken).toBe('broken');
  expect(game.errors).toEqual([]);
});

test('the defence ladder: perfect parry, late deflect, perfect dodge into a counter, and unblockables', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (fakeSrc) => {
    const fake = eval(fakeSrc);
    const g = (window as any).__game, T = g.THREE, P = g.player;
    const { combatOf } = await import('/src/combat/core.ts');
    const seen: string[] = [];
    for (const k of ['perfectParry', 'perfectDodge', 'unblockable']) g.events.on(k, () => seen.push(k));
    const from = P.pos.clone().addScaledVector(P.forward, 1.5);
    const foe = fake({ position: from.clone(), center: from.clone().setY(from.y + 1), hp: 300, maxHp: 300 });
    const att = (kind?: string) => ({ damage: 10, from: from.clone(), parryable: true, poise: 20, kind, attacker: foe, onParried: () => (foe.stunned = true) });
    const parryAt = (dt: number, kind?: string) => {
      P['startAction']('parryShield');
      P.act.t = P.act.def.parry[0] + dt;
      return P.receiveAttack(att(kind));
    };
    const perfect = parryAt(0.03);
    const posturePerfect = combatOf(foe).posture;
    const late = parryAt(0.2);
    const redParry = parryAt(0.03, 'unblockable');
    P.act = null;
    P['startAction']('roll');
    P.act.t = P.act.def.iframes[0] + 0.04;
    const dodge = P.receiveAttack(att());
    const counterOpen = P.counterT > 0;
    P.act = null;
    P.hp = P.maxHp;
    return { perfect, late, redParry, dodge, counterOpen, stunned: foe.stunned, posturePerfect, seen };
  }, FAKE);
  expect(res.perfect).toBe('parried');
  expect(res.stunned).toBe(true);
  expect(res.posturePerfect).toBeGreaterThan(0);
  expect(res.late).toBe('blocked'); // a deflect: no damage, no opening
  expect(res.redParry).toBe('hit'); // a red tell can't be parried
  expect(res.dodge).toBe('dodged');
  expect(res.counterOpen).toBe(true);
  expect(res.seen).toEqual(expect.arrayContaining(['perfectParry', 'perfectDodge', 'unblockable']));
  expect(game.errors).toEqual([]);
});

test('attack turns: only two swing at once, more while the player turtles', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (fakeSrc) => {
    const fake = eval(fakeSrc);
    const { director } = await import('/src/combat/ai.ts');
    const a = fake(), b = fake(), c = fake();
    const r1 = [director.request(a), director.request(b), director.request(c)];
    director.release(a);
    const r2 = director.request(c);
    const solo = director.request(fake(), true);
    director.release(b);
    director.release(c);
    return { r1, r2, solo };
  }, FAKE);
  expect(res.r1).toEqual([true, true, false]);
  expect(res.r2).toBe(true);
  expect(res.solo).toBe(true);
  expect(game.errors).toEqual([]);
});

test('strings: hold into the next cut for a branch, press late for the delayed cut, shove with G', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player;
    const now = () => performance.now() / 1000;
    const branchFrom = (id: string, held: number, late = false) => {
      P.act = null;
      P['startAction'](id);
      const a = P.act;
      a.t = a.def.combo.from + (late ? 0.3 : 0.02);
      P['buffer'] = { a: 'attack', t: now(), actT: a.t, actId: a.def.id };
      P['attackHeld'] = held > 0;
      P['attackHeldFor'] = held;
      P['consumeBuffer']();
      return P.act?.def.id;
    };
    const tap = branchFrom('slash1', 0);
    const hold1 = branchFrom('slash1', 0.3);
    const hold2 = branchFrom('slash2', 0.3);
    const hold3 = branchFrom('slash3', 0.3);
    const late = branchFrom('slash1', 0, true);
    P.act = null;
    P['buffer'] = { a: 'kick', t: now(), actT: -1, actId: null };
    P['consumeBuffer']();
    const shove = P.act?.def.id;
    const sweep = P.act?.def.sweep;
    P.act = null;
    return { tap, hold1, hold2, hold3, late, shove, sweep: !!sweep };
  });
  expect(res.tap).toBe('slash2');
  expect(res.hold1).toBe('link1');
  expect(res.hold2).toBe('link2');
  expect(res.hold3).toBe('link3');
  expect(res.late).toBe('delay2');
  expect(['barge', 'shieldBash']).toContain(res.shove);
  expect(res.sweep).toBe(true);
  expect(game.errors).toEqual([]);
});

test('a bandit fights with the brain: it holds its distance, shows its tells and swings in turn', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, P = g.player;
    const { Bandit, Bolts } = await import('/src/enemies/bandit.ts');
    const { heightAt } = await import('/src/world/terrain.ts');
    const x = P.pos.x + 5, z = P.pos.z + 5;
    const b = new Bandit('sword', new T.Vector3(x, heightAt(x, z) + 0.3, z), g.r.scene, new Bolts(g.r.scene));
    b.alerted = true;
    const tells: string[] = [];
    const off = (e: any) => e.target === b && tells.push(e.kind);
    g.events.on('telegraph', off);
    let hurt = 0;
    g.events.on('playerDamaged', ({ amount }: { amount: number }) => (hurt += amount));
    P.hp = P.maxHp;
    const hp0 = P.hp;
    let minDist = 99;
    for (let i = 0; i < 60 * 14; i++) {
      g.stepSim(1);
      b.update(1 / 60, P);
      minDist = Math.min(minDist, b.position.distanceTo(P.pos));
      if (P.hp < P.maxHp * 0.3) P.hp = P.maxHp;
    }
    const attacked = tells.length;
    b.dispose();
    P.hp = P.maxHp;
    return { attacked, kinds: [...new Set(tells)], minDist, hurt: hurt > 0 || P.hp < hp0 };
  });
  expect(res.attacked).toBeGreaterThanOrEqual(2);
  expect(res.minDist).toBeLessThan(3);
  expect(res.hurt).toBe(true);
  expect(game.errors).toEqual([]);
});

test('the drill yard: Kaela sets a drill with a sparring partner, and a perfect parry counts', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, yard = g.yard;
    const { DRILLS } = await import('/src/combat/trainingYard.ts');
    const drill = DRILLS.find((d: { id: string }) => d.id === 'parry');
    yard.start(drill);
    const partner = !!yard['partner'];
    g.events.emit('perfectParry', { at: g.player.center });
    const count = yard['count'];
    yard.stop();
    return { partner, count, active: !!yard.active, drills: DRILLS.length };
  });
  expect(res.partner).toBe(true);
  expect(res.count).toBe(1);
  expect(res.active).toBe(false);
  expect(res.drills).toBe(7);
  expect(game.errors).toEqual([]);
});

test('balance: every weapon family kills every armour within reason (light strings, time to kill)', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player;
    const { FAMILIES } = await import('/src/items/weapons/index.ts');
    const { ITEMS } = await import('/src/items/itemDefs.ts');
    const { RESIST, FAMILY_DMG } = await import('/src/combat/core.ts');
    const { resolveAction } = await import('/src/combat/actions.ts');
    const table: Record<string, Record<string, number>> = {};
    const armours = ['flesh', 'leather', 'hide', 'bone', 'plate', 'chitin', 'slime', 'stone'];
    for (const [id, fam] of Object.entries(FAMILIES) as [string, any][]) {
      if (id === 'bow' || id === 'crossbow') continue; // ranged: shots, not strings
      // The plainest weapon of the family.
      const items = Object.values(ITEMS).filter((d: any) => d.kind === id && d.stats?.damage) as any[];
      items.sort((a, b) => a.stats.damage - b.stats.damage);
      const w = items[0];
      if (!w) continue;
      let dmg = 0, time = 0;
      for (const mv of ['slash1', 'slash2', 'slash3']) {
        const raw = fam.moves[mv] ?? null;
        if (!raw?.hit) continue;
        const d = resolveAction(raw, !!raw.clip && P.char.has(raw.clip));
        const speed = (w.stats.speed ?? 1) * (raw.clip && P.char.has(raw.clip) ? d.clipTiming?.speed ?? raw.clipTiming?.speed ?? 1 : 1);
        dmg += w.stats.damage * d.hit.dmg;
        time += (d.combo?.from ?? d.cancel ?? d.dur) / speed;
      }
      table[id] = {};
      for (const a of armours) {
        const k = (RESIST as any)[a][FAMILY_DMG[id]] ?? 1;
        const dps = (dmg * k) / time;
        table[id][a] = Math.round((300 / dps) * 10) / 10;
      }
    }
    return table;
  });
  console.log('time to kill 300 hp with light strings (s):\n' + JSON.stringify(res, null, 1));
  const all = Object.values(res).flatMap((r) => Object.values(r));
  const sorted = [...all].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Every family is viable against every armour (the wrong tool is slower, never hopeless).
  for (const v of all) {
    expect(v).toBeGreaterThan(median * 0.3);
    expect(v).toBeLessThan(median * 3.2);
  }
  expect(game.errors).toEqual([]);
});
