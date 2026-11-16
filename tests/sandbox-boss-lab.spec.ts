import { test, expect, boot, SLOW } from './fixtures';

test('Sandbox console selects real bosses, runs every roster entry and cleans encounters between trials', async ({ page }, testInfo) => {
  test.setTimeout(900_000 * SLOW);
  page.setDefaultTimeout(30_000 * SLOW);
  const errors = await boot(page, '?test&sandbox&save&quality=low');
  await page.keyboard.press('F6');
  await page.locator('[data-tab="bosses"]').click();
  await expect(page.getByRole('heading', { name: 'The boss roster' })).toBeVisible();
  await page.locator('[data-boss-search]').fill('Rust Knight');
  await expect(page.locator('[data-boss]')).toHaveCount(1);
  await page.locator('[data-boss="rustKnight"]').click();
  await expect(page.locator('.sbx-boss-preview h3')).toHaveText('The Rust Knight');
  await page.locator('[data-boss-search]').fill('');
  await page.screenshot({
    path: testInfo.outputPath('boss-console-desktop.png'),
  });
  await page.setViewportSize({ width: 640, height: 640 });
  await expect(page.locator('[data-boss-deploy]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('boss-console-small.png'),
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('[data-boss-deploy]').click();
  await page.evaluate(async () => {
    const g = (window as any).__game;
    await g.sandbox.bossReady;
    g.pause(true);
  });
  expect(await page.evaluate(() => (window as any).__game.sandbox.bossSession.health().label)).toBe('The Rust Knight');

  const roster = await page.evaluate(async () => {
    const { PRACTICE_BOSSES } = await import('/src/sandbox/bossRoster.ts' as string);
    return PRACTICE_BOSSES.map((b: any) => ({ id: b.id, group: b.group }));
  });
  expect(roster.length).toBeGreaterThan(30);
  await page.evaluate(() => (window as any).__game.sleep(true));
  const results = [];
  const chosen = process.env.BOSS_IDS?.split(',');
  for (const entry of roster.filter((b) => !chosen || chosen.includes(b.id))) {
    console.log('starting boss', entry.id);
    const res = await page.evaluate(async (entry) => {
      const g = (window as any).__game,
        s = g.sandbox;
      const { targets } = await import('/src/combat/targets.ts' as string);
      s.settings.autoReset = false;
      s.settings.immortal = true;
      s.settings.bossHealth = 1;
      s.settings.bossDamage = 1;
      s.selectBoss(entry.id);
      await Promise.race([s.bossReady, new Promise((_, reject) => setTimeout(() => reject(new Error('Boss preparation timed out: ' + entry.id)), 60_000))]);
      const lab = s.bossSession;
      if (!lab) return { id: entry.id, error: s.bossStatus };
      // Async model-backed bosses (Varga/Ulgra) create their target after
      // the session exists. Give those loaders real event-loop turns.
      for (let i = 0; i < 200 && !lab.health(); i++) {
        await new Promise((r) => setTimeout(r, 25));
        g.stepSim();
      }
      const hp = lab.health();
      if (!hp) return { id: entry.id, error: 'no health target' };
      for (const t of lab.targets()) if (t.ready) await t.ready;
      // Start the authentic encounter, then cross its health thresholds.
      g.stepSim(240);
      hp.hp = hp.maxHp * 0.2;
      g.stepSim(entry.group === 'Sea' ? 660 : 420);
      const active = lab.targets();
      const finite = active.every((t: any) => t.position.toArray().every(Number.isFinite) && t.center.toArray().every(Number.isFinite));
      const local = entry.group === 'Sea' || active.every((t: any) => Math.abs(t.position.x - g.realm.interior.at(0, 0).x) < 80 && Math.abs(t.position.z) < 80);
      const count = targets.size;
      const phase = (hp as any).phase ?? (active[0] as any)?.phase ?? null;
      if (entry.id === 'sea:kraken') {
        lab.naval.fire('harpoon', g.player, g.player.aimDir);
        g.stepSim(120);
      }
      s.clearTargets();
      g.stepSim(5);
      const leaked = active.filter((t: any) => targets.has(t)).length;
      const { peekCombat } = await import('/src/combat/core.ts' as string);
      const staleReads = active.filter((t: any) => !!peekCombat(t)?.read).length;
      return { id: entry.id, finite, local, leaked, staleReads, count, phase };
    }, entry);
    console.log('boss trial', res);
    results.push(res);
    expect(res, 'load ' + entry.id).not.toHaveProperty('error');
    expect(res.finite, 'finite ' + entry.id).toBe(true);
    expect(res.local, 'local ' + entry.id).toBe(true);
    expect(res.leaked, 'cleanup ' + entry.id).toBe(0);
    expect(res.staleReads, 'tell cleanup ' + entry.id).toBe(0);
  }
  expect(results.length).toBe(chosen ? chosen.length : roster.length);
  const race = await page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sandbox;
    const { targets } = await import('/src/combat/targets.ts' as string);
    s.selectBoss('edricHollowed');
    const pending = s.bossReady;
    s.settings.scenario = 'dummy';
    s.resetFight();
    await pending;
    await new Promise((r) => setTimeout(r, 80));
    g.stepSim(2);
    return {
      session: !!s.bossSession,
      actors: s.actors.length,
      ghost: [...targets].some((t: any) => t.kind === 'edricHollowed'),
    };
  });
  expect(race).toEqual({ session: false, actors: 1, ghost: false });
  const naval = await page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sandbox;
    s.selectBoss('sea:crab');
    await s.bossReady;
    g.stepSim(360);
    const n = s.bossSession.naval;
    const before = n.beast.hp;
    const parts = n.beast.parts().filter((p: any) => p.alive);
    g.player.lock = parts[0];
    n.fire('swivel', g.player, g.player.aimDir);
    g.stepSim(180);
    const after = n.beast.hp;
    s.clearTargets();
    return {
      before,
      after,
      hits: s.metrics.hits,
      back: g.player.pos.distanceTo(g.realm.interior.spawn) < 2,
    };
  });
  expect(naval.after).toBeLessThan(naval.before);
  expect(naval.back).toBe(true);
  expect(naval.hits).toBeGreaterThan(0);
  const trial = await page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sandbox;
    s.settings.bossHealth = 2;
    s.selectBoss('tideWarden');
    await s.bossReady;
    g.stepSim(180);
    const lab = s.bossSession,
      hp = lab.health();
    hp.hp = hp.maxHp * 0.2;
    g.stepSim(180);
    return {
      hp: hp.maxHp,
      phase: hp.phase,
      targets: lab.targets().length,
      immortal: g.player.invulnerable,
    };
  });
  expect(trial.phase).toBe(2);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sandbox.openControls(false);
    g.stepSim(30);
    g.sandbox.frame();
  });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.cam.pitch = 0.22;
    g.cam.yaw = Math.PI;
    g.cam.lockTarget = null;
    g.sleep(false);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('boss-trial-arena.png') });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sandbox.settings.scenario = 'dummy';
    g.sandbox.resetFight();
    g.stepSim(30);
  });
  expect(await page.evaluate(() => (window as any).__game.sandbox.actors.length)).toBe(1);
  expect(errors).toEqual([]);
});
