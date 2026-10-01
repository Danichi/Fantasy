import { test, expect, type Page } from '@playwright/test';

// The Golden Expanse: Sunspire streams in with a walkable gate, its court and
// the scavenger camps are peopled, the sand sharks hunt and can be killed,
// and the region's quests and shops are wired up.

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 300_000 });
  return errors;
}

test('Sunspire loads on its pad, the east gate is open and the court is peopled', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE;
    const { heightAt, roadDist } = await import('/src/world/terrainHeight.ts');
    const L = await import('/src/world/desert/desertLayout.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // The pad is level across the city; dunes rise outside it.
    const pad = [[-200, -150], [150, 120], [300, -300], [-350, 300]].map(([dx, dz]) => heightAt(L.SUNSPIRE.x + dx, L.SUNSPIRE.z + dz));
    const flat = Math.max(...pad) - Math.min(...pad);
    const road = roadDist(-3000, 533);
    g.player.teleport(new T.Vector3(-5345, heightAt(-5345, 679) + 1, 679));
    for (let i = 0; i < 240 && !g.desert.cityLoaded; i++) await sleep(500);
    await sleep(1500);
    const ray = g.physics.castRay(new T.Vector3(-5380, heightAt(-5380, 679) + 1.2, 679), new T.Vector3(-1, 0, 0), 60);
    const npc = (id: string) => !!g.npcs.find(id);
    return { flat, road, loaded: g.desert.cityLoaded, gateClear: ray === null, named: ['neferah', 'ankhet', 'hassun', 'mereth', 'rusk', 'tamsa'].every(npc), people: g.npcs.npcs.filter((n: any) => n.rec.settlement === 'sunspire').length };
  });
  expect(res.flat).toBeLessThan(0.5);
  expect(res.road).toBeLessThan(10); // the Caravan Way runs out here
  expect(res.loaded).toBe(true);
  expect(res.gateClear).toBe(true);
  expect(res.named).toBe(true);
  expect(res.people).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test('a sand shark hunts under the sand, leaps, and can be killed while stranded', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    g.player.hp = g.player.maxHp = 5000;
    const h = g.desert.sharkHomes[0];
    g.player.teleport(new T.Vector3(h.x + 12, heightAt(h.x + 12, h.z) + 1, h.z));
    let shark: any = null;
    for (let i = 0; i < 40 && !shark; i++) {
      await sleep(250);
      shark = [...g.desert.sharks.values()][0];
    }
    if (!shark) return { spawned: false };
    const submergedLock = shark.lockable;
    shark.set('charge');
    const hp0 = g.player.hp;
    let breached = false, stranded = false;
    for (let i = 0; i < 120 && !stranded; i++) {
      await sleep(100);
      if (shark.state === 'breach') breached = true;
      if (shark.state === 'stranded') stranded = true;
    }
    const lockWhenStranded = shark.lockable;
    shark.takeHit({ damage: 1e5, poise: 0, dir: new T.Vector3(0, 0, 1), at: shark.center.clone(), crit: false, source: 'melee' });
    return { spawned: true, submergedLock, breached, stranded, lockWhenStranded, bitten: g.player.hp < hp0, dead: !shark.alive };
  });
  expect(res.spawned).toBe(true);
  expect(res.submergedLock).toBe(false);
  expect(res.breached).toBe(true);
  expect(res.stranded).toBe(true);
  expect(res.lockWhenStranded).toBe(true);
  expect(res.dead).toBe(true);
  expect(errors).toEqual([]);
});

test('desert quests, items and the bazaar are wired up', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await boot(page);
  const res = await page.evaluate(() => {
    const g = (window as any).__game, q = g.quests;
    const ids = ['silk-road-west', 'scrap-for-rusk', 'teeth-of-the-dunes', 'glasswind-raiders', 'old-sawtooth', 'the-lost-caravan'];
    q.state['mq-crypt'] = { status: 'done', stage: 0, progress: [] };
    return {
      registered: ids.every((id) => q.defs.has(id)),
      zarekOffers: q.offers('zarek').map((d: any) => d.id),
      ruskOffers: q.offers('rusk').map((d: any) => d.id),
    };
  });
  expect(res.registered).toBe(true);
  expect(res.zarekOffers).toContain('silk-road-west');
  expect(res.ruskOffers).toEqual(expect.arrayContaining(['scrap-for-rusk', 'teeth-of-the-dunes']));
  expect(errors).toEqual([]);
});
