import { test, expect, type Page } from '@playwright/test';

// The Gravewood: the graveyard trap in the dead wood south-west of Elder Glen.

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  await page.evaluate(async () => {
    const g = (window as any).__game;
    const { heightAt } = await import('/src/world/terrain.ts');
    await g.gravewood.ready;
    (window as any).__at = (x: number, z: number) => new g.THREE.Vector3(-340 + x, heightAt(-340 + x, 330 + z) + 0.3, 330 + z);
    (window as any).__kill = (t: any) => t.takeHit({ damage: 1e5, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'melee' });
  });
  return errors;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('stepping through the gate seals the graveyard: gate shut, walls solid, maps fogged', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, gw = g.gravewood, at = (window as any).__at;
    const before = { state: gw.state, gateOpen: g.physics.castRay(at(0, -22).setY(at(0, -22).y + 1.2), new T.Vector3(0, 0, 1), 12) === null };
    g.player.teleport(at(0, -8));
    for (let i = 0; i < 30 && gw.state === 'dormant'; i++) await new Promise((r) => setTimeout(r, 100));
    // The smoke thickens over a few seconds of game time (slower on a slow machine).
    for (let i = 0; i < 200 && gw.curse < 0.95; i++) await new Promise((r) => setTimeout(r, 100));
    const ray = (x: number, z: number, dir: number[]) => g.physics.castRay(at(x, z).setY(at(x, z).y + 1.2), new T.Vector3(...dir), 40);
    return {
      before,
      state: gw.state,
      gateBlocked: ray(0, -8, [0, 0, -1]) !== null,
      walls: [ray(0, 0, [1, 0, 0]), ray(0, 0, [-1, 0, 0]), ray(0, 0, [0, 0, 1])].every((d) => d !== null && d < 25),
      curse: gw.curse,
      mapFog: g.worldMap.obscured,
    };
  });
  expect(res.before.state).toBe('dormant');
  expect(res.before.gateOpen).toBe(true);
  expect(res.state).toBe('sealed');
  expect(res.gateBlocked).toBe(true);
  expect(res.walls).toBe(true);
  expect(res.curse).toBeGreaterThan(0.5);
  expect(res.mapFog).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('three waves rise from the graves, the abomination climbs out, and victory clears the Gravewood', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.player.hp = g.player.maxHp = 1e6;
    g.player.teleport((window as any).__at(0, -8));
  });
  await sleep(2000);
  await page.evaluate(() => { (window as any).__game.gravewood.t = 19.9; });
  const seen = { waves: new Set<number>(), kinds: new Set<string>(), rose: false, bossEmerged: false, bossRoared: false };
  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    const s = await page.evaluate(() => {
      const gw = (window as any).__game.gravewood;
      const out = { wave: gw.wave, kinds: gw.mobs.map((m: any) => m.kind), rising: gw.mobs.some((m: any) => m.state === 'rising' && m.group.position.y < m.position.y - 0.2), boss: gw.boss?.state ?? null };
      for (const m of gw.mobs) if (m.risen && m.alive) (window as any).__kill(m);
      return out;
    });
    seen.waves.add(s.wave);
    s.kinds.forEach((k: string) => seen.kinds.add(k));
    if (s.rising) seen.rose = true;
    if (s.boss === 'emerging') seen.bossEmerged = true;
    if (s.boss === 'roar' || s.boss === 'chase' || s.boss === 'attack') seen.bossRoared = true;
    if (seen.bossRoared) break;
  }
  expect([...seen.waves].sort()).toEqual([0, 1, 2]);
  expect([...seen.kinds].sort()).toEqual(['skeleton', 'zombie']);
  expect(seen.rose).toBe(true);
  expect(seen.bossEmerged).toBe(true);
  expect(seen.bossRoared).toBe(true);
  // Slay the boss: the beam, the fog lifts, the gate opens, the stone rises, and it stays cleared.
  await page.evaluate(() => {
    const gw = (window as any).__game.gravewood;
    for (const m of gw.mobs) if (m.alive) (window as any).__kill(m);
    (window as any).__kill(gw.boss);
  });
  await sleep(1500);
  const mid = await page.evaluate(() => ({ state: (window as any).__game.gravewood.state, beam: !!(window as any).__game.gravewood.beam }));
  expect(mid.state).toBe('victory');
  expect(mid.beam).toBe(true);
  await page.waitForFunction(() => (window as any).__game.gravewood.state === 'cleared', null, { timeout: 60_000 });
  const end = await page.evaluate(() => {
    const g = (window as any).__game, gw = g.gravewood, T = g.THREE, at = (window as any).__at;
    return {
      curse: gw.curse, flag: g.worldFlags.gravewoodCleared, rise: gw.pedestalRise, mobs: gw.mobs.length,
      body: !!gw.corpse && !gw.corpse.alive && !!g.worldFlags.gravewoodBody, flowers: gw.flowers?.n ?? 0,
      gateOpen: g.physics.castRay(at(0, -22).setY(at(0, -22).y + 1.2), new T.Vector3(0, 0, 1), 12) === null,
    };
  });
  expect(end.curse).toBe(0);
  expect(end.flag).toBe(true);
  expect(end.rise).toBe(1);
  expect(end.body).toBe(true); // the abomination's body stays where it fell
  expect(end.flowers).toBeGreaterThan(500); // and the graveyard blooms
  expect(end.mobs).toBe(0);
  expect(end.gateOpen).toBe(true);
  // Walking back in no longer springs the trap.
  await page.evaluate(() => (window as any).__game.player.teleport((window as any).__at(0, -8)));
  await sleep(2500);
  expect(await page.evaluate(() => (window as any).__game.gravewood.state)).toBe('cleared');
  expect(errors).toEqual([]);
});

test('dying inside wakes you at the gate with the graveyard reset', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await boot(page);
  await page.evaluate(() => (window as any).__game.player.teleport((window as any).__at(0, -8)));
  await sleep(2000);
  await page.evaluate(() => { (window as any).__game.gravewood.t = 19.9; });
  await page.waitForFunction(() => (window as any).__game.gravewood.mobs.length > 0, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.player.hp = 1;
    g.player.receiveAttack({ damage: 999, from: g.player.pos.clone().add(new g.THREE.Vector3(0, 0, 1)), parryable: false, poise: 200 });
  });
  await page.waitForFunction(() => !(window as any).__game.player.dead, null, { timeout: 30_000 });
  await sleep(500);
  const res = await page.evaluate(() => {
    const g = (window as any).__game, gw = g.gravewood, p = g.player.pos;
    return { state: gw.state, mobs: gw.mobs.length, boss: !!gw.boss, curse: gw.curse, outside: p.z < 330 - 16, nearGate: Math.hypot(p.x + 340, p.z - (330 - 23)) < 4 };
  });
  expect(res.state).toBe('dormant');
  expect(res.mobs).toBe(0);
  expect(res.boss).toBe(false);
  expect(res.outside).toBe(true);
  expect(res.nearGate).toBe(true);
  // Re-entering starts it again from the top.
  await page.evaluate(() => (window as any).__game.player.teleport((window as any).__at(0, -8)));
  await sleep(2000);
  expect(await page.evaluate(() => (window as any).__game.gravewood.state)).toBe('sealed');
  expect(errors).toEqual([]);
});
