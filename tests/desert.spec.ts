import { test, expect, type Page } from '@playwright/test';

// The Golden Expanse: Ghagrabba streams in with a walkable gate, its court and
// the scavenger camps are peopled, the sand sharks hunt and can be killed,
// and the region's quests and shops are wired up.

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 300_000 });
  return errors;
}

test('Ghagrabba loads on its pad, the east gate is open and the court is peopled', async ({ page }) => {
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

test('Ghagrabba: two gates, enterable houses and the palace with its royal family, guards outside', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const L = await import('/src/world/desert/desertLayout.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    g.player.teleport(new T.Vector3(-5345, heightAt(-5345, 679) + 1, 679));
    for (let i = 0; i < 240 && !g.desert.creatureCounts.doors; i++) await sleep(500);
    const W = L.WEST_GATE;
    const west = g.physics.castRay(new T.Vector3(W.x0 - 8, heightAt(W.x0 - 8, W.z) + 1.4, W.z), new T.Vector3(1, 0, 0), W.x1 - W.x0 + 12);
    const doors = g.doors.filter((d: any) => d.style === 'desert' || d.kind === 'palace').length;
    const guards = ['gateguard-1', 'gateguard-2', 'gateguard-3', 'gateguard-4'].map((id) => g.npcs.find(id)?.pos).filter(Boolean);
    const outside = guards.filter((p: any) => Math.abs(p.x - L.SUNSPIRE.x) > 400).length;
    const it = g.realm.overworldInteractables.find((i: any) => i.label().includes('Palace of the Sun'));
    g.player.teleport(it.pos.clone());
    it.action();
    for (let i = 0; i < 60 && g.realm.mode !== 'interior'; i++) await sleep(250);
    await sleep(6000);
    const royals = g.inside.built.length;
    const kind = g.realm.interior?.kind;
    g.realm.interior?.interactables[0].action();
    return { west, doors, guards: guards.length, outside, kind, royals, people: g.npcs.npcs.filter((n: any) => n.rec.settlement === 'sunspire').length };
  });
  expect(res.west).toBeNull();
  expect(res.doors).toBeGreaterThan(80);
  expect(res.guards).toBe(4);
  expect(res.outside).toBe(4);
  expect(res.kind).toBe('palace');
  expect(res.royals).toBeGreaterThan(8);
  expect(res.people).toBeGreaterThan(180);
  expect(errors).toEqual([]);
});

test('the Warden rises from the sand when you walk over it, and a sandstorm hides the map', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    g.player.hp = g.player.maxHp = 20000;
    g.player.teleport(new T.Vector3(-6010, heightAt(-6010, 1850) + 1, 1850));
    await sleep(3000);
    const before = g.desert.creatureCounts.warden;
    g.player.teleport(new T.Vector3(-6040, heightAt(-6040, 1850) + 1, 1850));
    for (let i = 0; i < 60 && g.desert.warden?.state !== 'walk' && g.desert.warden?.state !== 'idle' && g.desert.warden?.state !== 'throw' && g.desert.warden?.state !== 'slam'; i++) await sleep(250);
    const w = g.desert.warden;
    const risen = { state: w?.state, lockable: w?.lockable, visible: w?.root.visible };
    w?.takeHit({ damage: 1e6, poise: 0, dir: new T.Vector3(0, 0, 1), at: w.center.clone(), crit: false, source: 'melee' });
    await sleep(500);
    const flag = !!g.worldFlags.wardenDead;
    g.player.teleport(new T.Vector3(-5000, heightAt(-5000, 900) + 1, 900));
    g.desert.startStorm(40);
    for (let i = 0; i < 160 && g.desert.storm < 0.5; i++) await sleep(250);
    return { before, risen, flag, storm: g.desert.storm, obscured: g.worldMap.obscured };
  });
  expect(res.before).toBe('asleep');
  expect(res.risen.lockable).toBe(true);
  expect(res.risen.visible).toBe(true);
  expect(res.flag).toBe(true);
  expect(res.storm).toBeGreaterThan(0.3);
  expect(res.obscured).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});
