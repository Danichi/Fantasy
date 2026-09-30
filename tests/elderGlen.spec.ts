import { test, expect, type Page } from '@playwright/test';

// CI renders in software on a shared runner: PW_SLOW stretches waits and timeouts.
const SLOW = Number(process.env.PW_SLOW ?? '1');

// World Expansion phase 3: Elder Glen's farm life, quests and livestock.

async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  return errors;
}

test('the player plot tills, plants, waters, grows on the clock and harvests', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const count = (id: string) => g.player.equip.items.filter((i: any) => i.def.id === id).reduce((n: number, i: any) => n + i.qty, 0);
    const bed = () => g.realm.overworldInteractables.find((i: any) => /Till the soil|Plant|Water the|growing|Harvest/.test(i.label()) && i.pos.distanceTo(g.THREE ? i.pos : i.pos) >= 0 && i.pos.x > 12 && i.pos.x < 28 && i.pos.z > 115 && i.pos.z < 127);
    const b = bed();
    const labels: string[] = [b.label()];
    b.action(); // till
    labels.push(b.label()); // needs seeds
    g.player.equip.add('wheatSeed', 2);
    labels.push(b.label());
    b.action(); // plant
    const seedsLeft = count('wheatSeed');
    labels.push(b.label());
    b.action(); // water
    labels.push(b.label());
    const enabledWhileGrowing = b.enabled();
    g.time.skipTo((g.time.hour + 13) % 24); // 13 game hours later
    g.farmLife.update(0.1);
    labels.push(b.label());
    const before = count('wheat');
    b.action(); // harvest
    return { labels, seedsLeft, enabledWhileGrowing, gained: count('wheat') - before, after: b.label(), save: g.farmLife.toJSON().beds[0] };
  });
  expect(res.labels[0]).toBe('Till the soil');
  expect(res.labels[1]).toContain('Need seeds');
  expect(res.labels[2]).toBe('Plant Wheat Seed');
  expect(res.seedsLeft).toBe(1);
  expect(res.labels[3]).toContain('Water');
  expect(res.labels[4]).toContain('growing');
  expect(res.enabledWhileGrowing).toBe(false);
  expect(res.labels[5]).toContain('Harvest');
  expect(res.gained).toBeGreaterThanOrEqual(3);
  expect(res.after).toMatch(/Plant|Need seeds/);
  expect(errors).toEqual([]);
});

test('side quests run from offer to reward: herbs, crows and the scarecrow, granary rats', async ({ page }) => {
  test.setTimeout(180_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const q = g.quests;
    const out: Record<string, unknown> = {};
    // The apothecary offers "The Herbalist's List"; collecting advances it; the talk turn-in takes the herbs.
    let shown = '';
    const show = (t: string) => (shown = t);
    const offer = q.options('apothecary', show, () => {}).find((o: any) => o.label.includes("Herbalist"));
    out.offered = !!offer;
    q.accept('herbalist-list');
    for (const [id, n] of [['sungrass', 3], ['moongrass', 2], ['wildmint', 3], ['ironleaf', 2]]) g.player.equip.add(id, n);
    q.update(1, g.player.pos);
    out.stageAfterCollect = q.state['herbalist-list'].stage;
    out.indicator = q.indicator('apothecary');
    const gold0 = g.player.prog.gold;
    q.options('apothecary', show, () => {})[0].run();
    out.herbDone = q.isDone('herbalist-list');
    out.goldGained = g.player.prog.gold - gold0;
    out.herbsLeft = g.player.equip.items.filter((i: any) => i.def.id === 'sungrass').length;
    // Crows: scaring counts, then the scarecrow interactable appears, then Wren closes it.
    q.accept('crows-in-wheat');
    q.signal('crow-scared', 12);
    out.crowStage = q.state['crows-in-wheat'].stage;
    const scare = g.realm.overworldInteractables.find((i: any) => i.label() === 'Raise the scarecrow');
    out.scarecrowReady = !!scare && scare.enabled();
    scare.action();
    q.options('wren', show, () => {})[0].run();
    out.crowsDone = q.isDone('crows-in-wheat');
    out.seeds = g.player.equip.items.filter((i: any) => i.def.id === 'carrotSeed').reduce((n: number, i: any) => n + i.qty, 0);
    // Granary rats: real enemies that die to hits and count toward the kill objective.
    q.accept('granary-rats');
    const { targets } = await import('/src/combat/targets.ts' as string);
    await new Promise((r) => setTimeout(r, 200));
    let killed = 0;
    for (let round = 0; round < 3 && !q.isActive('granary-rats', 1); round++) {
      for (const t of [...targets] as any[]) {
        if (t.kind !== 'rat' || !t.alive) continue;
        t.takeHit({ damage: 50, poise: 0, dir: new T.Vector3(1, 0, 0), at: t.center.clone(), crit: false, source: 'melee' });
        killed++;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    out.ratsKilled = killed;
    out.ratStage = q.state['granary-rats'].stage;
    out.markers = q.markers().length;
    return out;
  });
  expect(res.offered).toBe(true);
  expect(res.stageAfterCollect).toBe(1);
  expect(res.indicator).toBe('?');
  expect(res.herbDone).toBe(true);
  expect(res.goldGained).toBe(60);
  expect(res.herbsLeft).toBe(0);
  expect(res.crowStage).toBe(1);
  expect(res.scarecrowReady).toBe(true);
  expect(res.crowsDone).toBe(true);
  expect(res.seeds).toBe(4);
  expect(res.ratsKilled).toBeGreaterThanOrEqual(8);
  expect(res.ratStage).toBe(1);
  expect(res.markers).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('quests, the plot and ore nodes persist across a reload', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
  });
  await boot(page, '?test&save');
  await page.evaluate(async () => {
    const g = (window as any).__game;
    g.quests.accept('mill-wheel-jam');
    const bed = g.realm.overworldInteractables.find((i: any) => i.label() === 'Till the soil');
    bed.action();
    g.quests.options('carpenter', () => {}, () => {})[0].run(); // Bram hands over planks: stage 1
    g.save();
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const res = await page.evaluate(() => {
    const g = (window as any).__game;
    const planks = g.player.equip.items.filter((i: any) => i.def.id === 'planks').reduce((n: number, i: any) => n + i.qty, 0);
    const wheel = g.realm.overworldInteractables.find((i: any) => /driftwood/.test(i.label()));
    return { stage: g.quests.state['mill-wheel-jam']?.stage, tilled: g.farmLife.toJSON().beds.filter((b: any) => b.stage === 'tilled').length, planks, wheelReady: !!wheel && wheel.enabled() };
  });
  expect(res.stage).toBe(1);
  expect(res.tilled).toBe(1);
  expect(res.planks).toBe(4);
  expect(res.wheelReady).toBe(true);
});

test('livestock is pooled near the player, and Clover follows the player home', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const tp = async (x: number, z: number, ms = 2500) => {
      g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
      await new Promise((r) => setTimeout(r, ms));
    };
    await tp(-120, 60, 5000);
    const nearActors = g.fauna.activeCount;
    await tp(900, 150, 3000);
    const farActors = g.fauna.activeCount;
    // The heifer: find her, she follows, lead her into the pasture.
    g.quests.accept('missing-heifer');
    await tp(-262, 34, 1500);
    g.quests.update(1, g.player.pos);
    const following = g.quests.state['missing-heifer'].stage === 1;
    const clover = g.fauna.animals.find((a: any) => a.follow);
    for (const [x, z] of [[-248, 38], [-234, 42], [-220, 46], [-206, 50], [-192, 54], [-178, 58], [-164, 60], [-150, 60]]) {
      await tp(x, z, 2000);
    }
    for (let k = 0; k < 100 && g.quests.state['missing-heifer'].stage < 2; k++) await new Promise((r) => setTimeout(r, 300));
    return { nearActors, farActors, following, hasClover: !!clover, stage: g.quests.state['missing-heifer'].stage };
  });
  expect(res.nearActors).toBeGreaterThan(4);
  expect(res.farActors).toBeLessThan(res.nearActors);
  expect(res.following).toBe(true);
  expect(res.hasClover).toBe(true);
  expect(res.stage).toBe(2);
  expect(errors).toEqual([]);
});
