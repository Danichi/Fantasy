import { test, expect, type Page } from '@playwright/test';

// Disciplines, XP investing and attributes, through the Skills screen (K)
// and the window.__game debug hook.

async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A missing /favicon.ico is reported as a console error with no URL; check
  // failed requests by URL instead so real missing assets still fail the test.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`${r.status()} ${r.url()}`));
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  return errors;
}

test('XP is spent on disciplines and raises the character level', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(() => {
    const g = (window as any).__game, P = g.player.paths, pr = g.player.prog;
    const start = { xp: pr.xp, lv: pr.level, gale: P.level('gale'), active: P.active };
    // Pickups only add to the pool: no automatic levelling.
    pr.addXp(5000);
    const afterPickup = { xp: pr.xp, lv: pr.level };
    const cost = P.nextCost('gale');
    const ok = P.invest('gale');
    const afterInvest = { xp: pr.xp, gale: P.level('gale'), cost };
    // Can't invest in something you haven't learned, or without the XP.
    const locked = P.invest('boundary');
    pr.xp = 0;
    const broke = P.invest('gale');
    return { start, afterPickup, ok, afterInvest, locked, broke, charLevel: P.charLevel };
  });
  expect(res.start).toEqual({ xp: 0, lv: 2, gale: 1, active: 'gale' }); // gale, pyromancer, lightbinder at 1
  expect(res.afterPickup).toEqual({ xp: 5000, lv: 2 });
  expect(res.ok).toBe(true);
  expect(res.afterInvest.gale).toBe(2);
  expect(res.afterInvest.cost).toBe(100);
  expect(res.afterInvest.xp).toBe(4900);
  expect(res.locked).toBe(false);
  expect(res.broke).toBe(false);
  expect(errors).toEqual([]);
});

test('attributes change the player\'s real stats', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(() => {
    const g = (window as any).__game, P = g.player.paths, p = g.player;
    p.prog.addXp(20000);
    while (P.canInvest('gale')) P.invest('gale');
    const free = P.attrFree;
    const hp0 = p.maxHp, st0 = p.maxStamina, mp0 = p.maxMana, melee0 = P.meleePower(1);
    P.raise('vig');
    P.raise('end');
    P.raise('int');
    P.raise('fin');
    const spentAll = [];
    while (P.raise('vig')) spentAll.push(1);
    return {
      free, lvl: P.charLevel,
      dHp: p.maxHp - hp0 - spentAll.length * 10, dSt: p.maxStamina - st0, dMp: p.maxMana - mp0,
      melee: P.meleePower(1) - melee0, freeAfter: P.attrFree, extra: P.raise('vig'),
    };
  });
  expect(res.free).toBeGreaterThan(3);
  expect(res.dHp).toBe(10);
  expect(res.dSt).toBe(4);
  expect(res.dMp).toBe(6);
  expect(res.melee).toBeCloseTo(0.015, 5); // balanced weapon: half of Finesse's 3%
  expect(res.freeAfter).toBe(0);
  expect(res.extra).toBe(false);
  expect(errors).toEqual([]);
});

test('the Skills screen opens with K, invests XP and learns tree nodes', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as any).__game.player.prog.addXp(3000));
  await page.evaluate(() => (window as any).__game.input.press('KeyK'));
  await page.waitForTimeout(200);
  await page.evaluate(() => (window as any).__game.input.release('KeyK'));
  await expect(page.locator('.sk')).toBeVisible();
  // Secrets are hidden; unlearned basics are listed.
  await expect(page.locator('.sk-disc', { hasText: 'Oathbreaker' })).toHaveCount(0);
  await expect(page.locator('.sk-disc', { hasText: 'Boundary Style' })).toHaveCount(1);
  await expect(page.locator('.sk-disc', { hasText: 'Pyromancer' })).toHaveCount(1);
  // Old inventory skills tab is gone.
  expect(await page.locator('.inventory .tab', { hasText: 'SKILLS' }).count()).toBe(0);

  await page.locator('[data-invest="gale"]').click();
  await page.locator('[data-invest="gale"]').click();
  expect(await page.evaluate(() => (window as any).__game.player.paths.level('gale'))).toBe(3);

  // Open the Gale Style tree and learn a tier-1 node through the panel.
  await page.locator('.sk-disc', { hasText: 'Gale Style' }).locator('.nm').click();
  await expect(page.locator('.sk-stage canvas')).toBeVisible();
  const learned = await page.evaluate(() => {
    const g = (window as any).__game, P = g.player.paths;
    return P.points('gale');
  });
  expect(learned).toBe(3);
  await page.screenshot({ path: 'test-results/skills-tree.png' });
  // Select the first minor node via the hook and learn it through the button.
  await page.evaluate(() => {
    const ui = (window as any).__game.skills;
    ui.selected = '0-0-0';
    ui.renderPanel();
  });
  await page.locator('.sk-panel [data-learn]').first().click();
  const after = await page.evaluate(() => {
    const P = (window as any).__game.player.paths;
    return { has: P.has('gale', '0-0-0'), pts: P.points('gale') };
  });
  expect(after).toEqual({ has: true, pts: 2 });
  // Esc backs out of the tree, then closes the screen.
  await page.keyboard.press('Escape');
  await expect(page.locator('.sk-families')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sk')).toBeHidden();
  expect(errors).toEqual([]);
});

test('disciplines and attributes survive a save and reload', async ({ page }) => {
  await boot(page, '?test&save');
  await page.evaluate(() => {
    const g = (window as any).__game, P = g.player.paths;
    g.player.prog.addXp(8000);
    P.invest('gale');
    P.invest('pyromancer');
    P.teach('boundary');
    P.setActive('boundary');
    P.raise('mig');
    P.learn('gale', { id: '0-0-0', type: 'minor', tier: 1, branch: 0, parent: 'c' });
    g.save();
  });
  const before = await page.evaluate(() => {
    const g = (window as any).__game;
    return { s: g.player.paths.serialize(), xp: g.player.prog.xp };
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  const after = await page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.player.paths.serialize();
    localStorage.clear();
    return { s, xp: g.player.prog.xp };
  });
  expect(after.xp).toBe(before.xp);
  expect(after.s.lv).toEqual(before.s.lv);
  expect(after.s.attrs).toEqual(before.s.attrs);
  expect(after.s.active).toBe('boundary');
  expect(after.s.nodes.gale['0-0-0']).toBeTruthy();
});

test('mentors teach, switch the active class and respec', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(() => {
    const g = (window as any).__game, P = g.player.paths;
    const corvin = g.town.npcs.find((n: any) => n.spec.id === 'corvin').spec;
    const labels = () => {
      const out: any[] = [];
      g.town.mentorOptions(corvin, (t: string) => out.push(t));
      return g.town.mentorOptions(corvin, () => {}).map((o: any) => o.label);
    };
    const first = labels();
    g.town.mentorOptions(corvin, () => {}).find((o: any) => o.label.startsWith('Teach me Boundary')).run();
    const second = labels();
    g.town.mentorOptions(corvin, () => {}).find((o: any) => o.label.startsWith('Make Boundary')).run();
    const active = P.active;
    g.player.prog.addXp(1000);
    P.invest('boundary');
    P.invest('boundary');
    const xpBefore = g.player.prog.xp;
    g.town.mentorOptions(corvin, () => {}).find((o: any) => o.label.startsWith('Do it: reset Boundary')).run();
    return { first, second, active, lv: P.level('boundary'), refund: g.player.prog.xp - xpBefore };
  });
  expect(res.first).toContain('Teach me Boundary Style.');
  expect(res.second).toContain('Make Boundary Style my fighting class.');
  expect(res.active).toBe('boundary');
  expect(res.lv).toBe(1);
  expect(res.refund).toBe(Math.round((100 + 283) * 0.75));
  expect(errors).toEqual([]);
});
