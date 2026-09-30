import { test, expect, type Page } from '@playwright/test';

// CI renders in software on a shared runner: PW_SLOW stretches waits and timeouts.
const SLOW = Number(process.env.PW_SLOW ?? '1');

// World Expansion phase 4: the King's Road network, encounters, caravans,
// horses, foraging and the road quests.

async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  return errors;
}

test('the King\'s Road is painted, signed and reaches Port Aurelle; closed roads are barred', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const N = await import('/src/world/roadNetwork.ts' as string);
    const kr = N.road('kings');
    const end = kr.pts[kr.pts.length - 1];
    return {
      startsAtGlen: Math.hypot(kr.pts[0][0], kr.pts[0][1]) < 120,
      reachesPort: Math.hypot(end[0] - 2760, end[1] - 150) < 120,
      painted: [500, 1000, 1500, 2000, 2500].map((s: number) => { const p = N.pointAlong(kr, s); return N.roadCoverage(p.x, p.z); }),
      offRoad: N.roadCoverage(1000, 300),
      gates: g.roads.gates.map((x: any) => x.road).sort(),
    };
  });
  expect(res.startsAtGlen).toBe(true);
  expect(res.reachesPort).toBe(true);
  for (const c of res.painted) expect(c).toBeGreaterThan(0.6);
  expect(res.offRoad).toBe(0);
  expect(res.gates).toEqual(['capital', 'forest', 'south']);
  expect(errors).toEqual([]);
});

test('encounters spawn beside the road and are dropped far behind; caravans appear near the player', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const N = await import('/src/world/roadNetwork.ts' as string);
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const kr = N.road('kings');
    const p = N.pointAlong(kr, 1200);
    g.player.teleport(new T.Vector3(p.x, heightAt(p.x, p.z) + 0.5, p.z));
    await settle(1500);
    g.encounters.force('traveller', 1230);
    g.encounters.force('wolves', 1300);
    await settle(3000);
    const spawned = g.encounters.groupCount;
    const wolves = g.slimes.slimes.filter((b: any) => b.alive && b.kind === 'green' && Math.abs(b.position.x - N.pointAlong(kr, 1300).x) < 60).length;
    // Walk away: far groups are dropped and their beasts disposed.
    const far = N.pointAlong(kr, 2500);
    g.player.teleport(new T.Vector3(far.x, heightAt(far.x, far.z) + 0.5, far.z));
    await settle(2000);
    const after = g.encounters.groupCount;
    // A caravan: go to where one is on the road right now.
    const c = g.caravans.positions().find((x: any) => !x.resting) ?? g.caravans.positions()[0];
    g.player.teleport(new T.Vector3(c.x + 20, heightAt(c.x + 20, c.z) + 0.5, c.z));
    await settle(2500);
    const wagons = g.caravans['wagons'].size;
    // Leave again: the wagon and its riders are released without breaking the frame loop.
    g.player.teleport(new T.Vector3(0, heightAt(0, 4) + 0.5, 4));
    const steps0 = g.steps;
    await settle(2500);
    return { spawned, wolves, after, wagons, resting: c.resting, left: g.caravans['wagons'].size, stepped: g.steps - steps0 };
  });
  expect(res.spawned).toBe(2);
  expect(res.wolves).toBeGreaterThanOrEqual(2);
  expect(res.after).toBe(0);
  if (!res.resting) expect(res.wagons).toBeGreaterThanOrEqual(1);
  expect(res.left).toBe(0);
  expect(res.stepped).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('foraged herbs regrow on the world clock', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    // The roadside Sungrass patch just past the bridge.
    g.player.teleport(new T.Vector3(132, heightAt(132, 18) + 0.5, 18));
    await new Promise((r) => setTimeout(r, 1500));
    const f = g.foraging;
    f.update(0.1, new T.Vector3(132, heightAt(132, 18), 18));
    const label = f.interactable.label();
    const count = () => g.player.equip.items.filter((i: any) => i.def.id === 'sungrass').reduce((n: number, i: any) => n + i.qty, 0);
    const before = count();
    f.interactable.action();
    f.update(0.1, new T.Vector3(132, heightAt(132, 18), 18));
    const pickedLabel = f.interactable.label();
    g.time.skipTo((g.time.hour + 7) % 24);
    f.update(0.1, new T.Vector3(132, heightAt(132, 18), 18));
    return { label, gained: count() - before, pickedLabel, regrown: f.interactable.label() };
  });
  expect(res.label).toBe('Gather Sungrass');
  expect(res.gained).toBeGreaterThanOrEqual(1);
  expect(res.pickedLabel).toBe('');
  expect(res.regrown).toBe('Gather Sungrass');
  expect(errors).toEqual([]);
});

test('a bought horse is ridden at its breed\'s speed and is still owned after a reload', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
  });
  await boot(page, '?test&save');
  const ride = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    g.player.teleport(new T.Vector3(200, heightAt(200, 30) + 0.5, 30));
    g.horses.add('runner', 'Comet', 'palomino', 0x2f5f9a, new T.Vector3(201, 0, 31));
    await new Promise((r) => setTimeout(r, 2500));
    const a = [...g.horses['actors'].values()][0];
    g.horses.mount(a);
    g.input.press('KeyW');
    g.input.press('ShiftLeft');
    await new Promise((r) => setTimeout(r, 1800));
    const speed = Math.hypot(g.player.vel.x, g.player.vel.z);
    const stamina = g.horses.stamina;
    g.input.release('KeyW');
    g.input.release('ShiftLeft');
    g.horses.dismount();
    g.save();
    return { speed, stamina, mounted: g.player.mounted };
  });
  expect(ride.speed).toBeGreaterThan(14);
  expect(ride.stamina).toBeLessThan(125);
  expect(ride.mounted).toBe(false);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const owned = await page.evaluate(() => (window as any).__game.horses.owned.map((h: any) => [h.name, h.breed]));
  expect(owned).toEqual([['Comet', 'runner']]);
});

test('the Hollow Ridge bandits fight back and the quest completes when they fall', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const q = g.quests;
    q.accept('hollow-ridge');
    g.player.teleport(new T.Vector3(1952, heightAt(1952, -170) + 0.5, -170));
    for (let i = 0; i < 30 && !q.isActive('hollow-ridge', 1); i++) await new Promise((r) => setTimeout(r, 300));
    const bandits = g.encounters.bandits.length;
    await new Promise((r) => setTimeout(r, 4000));
    const hpAfterFight = g.player.hp;
    g.player.hp = g.player.maxHp;
    for (const b of [...g.encounters.bandits]) {
      for (let k = 0; k < 10 && b.alive; k++) b.takeHit({ damage: 60, poise: 50, dir: new T.Vector3(1, 0, 0), at: b.center.clone(), crit: false, source: 'melee' });
    }
    await new Promise((r) => setTimeout(r, 800));
    return { bandits, hpAfterFight, max: g.player.maxHp, stage: q.state['hollow-ridge'].stage };
  });
  expect(res.bandits).toBe(7);
  expect(res.hpAfterFight).toBeLessThan(res.max);
  expect(res.stage).toBe(2);
  expect(errors).toEqual([]);
});
