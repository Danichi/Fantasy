import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Night raids on Elder Glen: the horn, the village barring its doors, the
// watch turning out, waves and a leader, and what's left in the morning.
// Stepped tick by tick (frame waits can skip whole fights).

async function night(page: Page, at: [number, number] | null) {
  await page.evaluate(async (at) => {
    const g = (window as any).__game, T = g.THREE;
    (await import('/src/creatures/geometryStore.ts')).prepareCreatureNow('wolf');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    g.time.skipTo(22);
    g.raids.warnSeconds = 1;
    g.player.hp = g.player.maxHp = 5000;
    if (at) g.player.teleport(new T.Vector3(at[0], heightAt(at[0], at[1]) + 0.5, at[1]));
    g.stepSim(5);
  }, at);
}

test('a raid: the horn, the village indoors, the watch turns out, waves and a leader, beaten back for gold', async ({ game }) => {
  const { page, errors } = game;
  await night(page, [-62, -150]); // by the sheep pens
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.raids;
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    let ended: any = null;
    const off = g.events.on('raidEnded', (e: any) => (ended = e));
    const gold0 = g.player.prog.gold;
    R.start('wolves', 'sheep');
    g.stepSim(2);
    const warned = { state: R.state, indoors: g.npcs.raidOn, watch: R.watch.length, mark: g.questUI?.urgent?.label ?? null, stock: R.stock.length };
    let leaderName = '', maxWave = 0, sawWaves = false;
    for (let i = 0; i < 6000 && R.state !== 'idle'; i++) {
      g.stepSim(1);
      if (R.state === 'waves') sawWaves = true;
      maxWave = Math.max(maxWave, R.wave);
      for (const r of R.raiders) if (r.isLeader) leaderName = r.label;
      // You fight: every so often the nearest raider falls.
      if (i % 40 === 0) {
        const r = R.raiders.find((x: any) => x.alive);
        r?.takeHit({ damage: 1e5, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: r.center.clone(), crit: false, source: 'melee' });
      }
    }
    off();
    g.hud.toast = t0;
    return { warned, sawWaves, maxWave, leaderName, ended, gold: g.player.prog.gold - gold0, defended: R.save.defended, after: { indoors: g.npcs.raidOn, mark: g.questUI?.urgent ?? null }, toasts };
  });
  expect(res.warned.state).toBe('warning');
  expect(res.warned.indoors).toBe('elderGlen');
  expect(res.warned.watch).toBe(5);
  expect(res.warned.mark).toContain('sheep');
  expect(res.warned.stock).toBeGreaterThan(3);
  expect(res.toasts[0]).toMatch(/horn from the north gate/i);
  expect(res.sawWaves).toBe(true);
  expect(res.maxWave).toBe(3);
  expect(res.leaderName).toBe('Pack Leader');
  expect(res.ended?.won).toBe(true);
  expect(res.gold).toBeGreaterThan(30);
  expect(res.defended).toBe(1);
  expect(res.after.indoors).toBeNull();
  expect(res.after.mark).toBeNull();
  expect(errors).toEqual([]);
});

test('the watch fights the raiders on its own', async ({ game }) => {
  const { page, errors } = game;
  await night(page, [-62, -60]); // within earshot, but standing back
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.raids;
    g.player.invulnerable = true;
    R.start('wolves', 'sheep');
    const hp0 = new Map<any, number>();
    let struck = 0, engaged = false;
    for (let i = 0; i < 2400; i++) {
      g.stepSim(1);
      for (const r of R.raiders) {
        if (!hp0.has(r)) hp0.set(r, r.maxHp);
      }
      if (R.watch.some((w: any) => w.state === 'fight' || w.state === 'swing')) engaged = true;
      struck = [...hp0.entries()].filter(([r, h]) => r.hp < h).length;
      if (struck >= 2) break;
    }
    R.clear();
    g.player.invulnerable = false;
    return { engaged, struck };
  });
  expect(res.engaged).toBe(true);
  expect(res.struck).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('away from home: the watch holds, a few animals are lost, and the village talks about it', async ({ game }) => {
  const { page, errors } = game;
  await night(page, [600, 300]); // far off
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.raids;
    const sheep0 = g.fauna.animals.filter((a: any) => a.species === 'sheep').length;
    R.start('wolves', 'sheep');
    for (let i = 0; i < 200 && R.state !== 'idle'; i++) g.stepSim(1);
    const sheep1 = g.fauna.animals.filter((a: any) => a.species === 'sheep').length;
    const { rumours, greetingFor } = await import('/src/npc/townTalk.ts');
    const ctx = { hour: 9, rain: false, done: () => true, active: () => false, learned: () => true, activeClass: '', level: 3, met: true,
      raid: { ago: 0, won: R.save.lastWon, lost: R.save.lastLost, gloam: false, defended: 0 } };
    return { state: R.state, won: R.save.lastWon, lost: R.save.lastLost, sheep0, sheep1, news: rumours(ctx, true)[0], brannoc: greetingFor('brannoc', '', ctx, 1) };
  });
  expect(res.state).toBe('idle');
  expect(res.won).toBe(false);
  expect(res.lost).toBeGreaterThan(0);
  expect(res.sheep1).toBe(res.sheep0 - res.lost);
  expect(res.news).toMatch(/wolves got at the pens/i);
  expect(res.brannoc).toMatch(/lost animals/i);
  expect(errors).toEqual([]);
});

test('the Gloaming: a rift tears open past the pens and gloam wolves come through, led by a Gloam Alpha', async ({ game }) => {
  const { page, errors } = game;
  await night(page, [-62, -150]);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.raids;
    R.start('gloam', 'sheep');
    const kinds = new Set<string>();
    let rift = false, alpha = '';
    for (let i = 0; i < 6000 && R.state !== 'idle'; i++) {
      g.stepSim(1);
      if (R.rift && R.rift.group.parent) rift = true;
      for (const r of R.raiders) {
        kinds.add(r.kind);
        if (r.isLeader) alpha = r.label;
      }
      if (i % 40 === 0) {
        const r = R.raiders.find((x: any) => x.alive);
        r?.takeHit({ damage: 1e5, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: r.center.clone(), crit: false, source: 'melee' });
      }
    }
    return { rift, kinds: [...kinds], alpha, won: R.save.lastWon };
  });
  expect(res.rift).toBe(true);
  expect(res.kinds).toEqual(['gloamWolf']);
  expect(res.alpha).toBe('Gloam Alpha');
  expect(res.won).toBe(true);
  expect(errors).toEqual([]);
});

test('a smaller raid at the Wayfarer\'s Rest: the stablefolk turn out, two waves, the Rest pays', async ({ game }) => {
  const { page, errors } = game;
  await night(page, [1345, 60]); // by the paddock
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.raids;
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    let ended: any = null;
    const off = g.events.on('raidEnded', (e: any) => (ended = e));
    const gold0 = g.player.prog.gold;
    R.start('gloam', 'rest'); // road stops only ever see wolves
    g.stepSim(2);
    const warned = { kind: R.kind, indoors: g.npcs.raidOn, watch: R.watch.map((w: any) => w.name), stock: R.stock.length };
    let maxWave = 0;
    for (let i = 0; i < 6000 && R.state !== 'idle'; i++) {
      g.stepSim(1);
      maxWave = Math.max(maxWave, R.wave);
      if (i % 40 === 0) {
        const r = R.raiders.find((x: any) => x.alive);
        r?.takeHit({ damage: 1e5, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: r.center.clone(), crit: false, source: 'melee' });
      }
    }
    off();
    g.hud.toast = t0;
    return { warned, maxWave, ended, gold: g.player.prog.gold - gold0, save: { ...R.save }, toasts };
  });
  expect(res.warned.kind).toBe('wolves');
  expect(res.warned.indoors).toBe('wayfarersRest');
  expect(res.warned.watch).toEqual(['Sergeant Tove', 'Col Dunmore', 'Stablehand Pell']);
  expect(res.warned.stock).toBeGreaterThan(1);
  expect(res.toasts[0]).toMatch(/Wayfarer's Rest/);
  expect(res.maxWave).toBe(2);
  expect(res.ended?.won).toBe(true);
  expect(res.gold).toBeGreaterThan(20);
  expect(res.save.roadDefended).toBe(1);
  expect(res.save.defended ?? 0).toBe(0);
  expect(res.save.lastSite).toBe('rest');
  expect(res.toasts.some((t) => /Hester/.test(t))).toBe(true);
  expect(errors).toEqual([]);
});

test('Millbrook has a flock, and a raid there goes for it', async ({ game }) => {
  const { page, errors } = game;
  await night(page, [575, 150]);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.raids;
    R.start('wolves', 'millbrook');
    g.stepSim(2);
    const out = { watch: R.watch.length, stock: R.stock.length, indoors: g.npcs.raidOn, mark: g.questUI?.urgent?.label ?? null };
    R.clear();
    return out;
  });
  expect(res.watch).toBe(3);
  expect(res.stock).toBeGreaterThanOrEqual(4);
  expect(res.indoors).toBeNull();
  expect(res.mark).toContain('Garth');
  expect(errors).toEqual([]);
});
