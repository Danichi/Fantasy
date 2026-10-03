import { test, expect, boot, SLOW } from './fixtures';
import type { Page } from '@playwright/test';

// World Expansion phase 1: the streamed continent, exploration and saves.

test('Elder Glen keeps its authored ground and the world is deterministic', async ({ game }) => {
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const T = await import('/src/world/terrainHeight.ts' as string);
    // Town centre, plaza edge, crypt shelf and river bank: authored heights.
    const town = [[0, 0], [8, -4], [0, -298], [140, 0]].map(([x, z]) => T.heightAt(x, z));
    // A far tile computed twice gives identical data.
    const a = T.computeTile(12, -9), b = T.computeTile(12, -9);
    let same = a.length === b.length;
    for (let k = 0; k < a.length && same; k++) same = a[k] === b[k];
    // Port Aurelle is about a 10 minute walk (4.2 m/s) along the King's Road.
    const road = T.ROAD_LINES.find((l: number[][]) => l[l.length - 1][0] > 2000)!;
    let len = 0;
    for (let k = 1; k < road.length; k++) len += Math.hypot(road[k][0] - road[k - 1][0], road[k][1] - road[k - 1][1]);
    return { town, same, walkMin: len / 4.2 / 60 };
  });
  expect(res.town[0]).toBeGreaterThan(-0.5);
  expect(res.town[0]).toBeLessThan(2);
  expect(res.same).toBe(true);
  expect(res.walkMin).toBeGreaterThan(8.5);
  expect(res.walkMin).toBeLessThan(12);
  expect(errors).toEqual([]);
});

// A memory test: it needs a game with no history, so it boots its own.
test('terrain and trees stream in and out without leaking', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const { characterGeometryCount } = await import('/src/npc/charMerge.ts' as string);
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // (Townsfolk bodies are cached once per part combination the first time
    // you meet one: a bounded cache that fills as you see more people, not a
    // streaming leak, so it's counted apart.)
    const snap = () => ({
      geo: g.r.renderer.info.memory.geometries - characterGeometryCount(),
      bodies: g.physics.world.bodies.len(),
      tiles: g.terrain.tileCount,
      veg: g.stylizedNature.tileCount,
    });
    await settle(1500);
    for (let k = 0; k < 20 && g.terrain.tileCount < 81; k++) await settle(250);
    // Travel 3 km east and north, then come home. The first trip uploads what is
    // built once and kept (Port Aurelle, the pooled townsfolk), so the baseline is
    // taken after it; a leak is whatever the second, identical trip adds.
    const trip = [[1500, 150], [3000, 150], [2200, -1400], [600, -2600], [0, 10]];
    const along: ReturnType<typeof snap>[] = [];
    const travel = async () => {
      for (const [x, z] of trip) {
        g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
        await settle(2500);
        along.push(snap());
      }
      await settle(3000);
    };
    await travel();
    const base = snap();
    await travel();
    const end = snap();
    // Standing on streamed ground far from town.
    g.player.teleport(new T.Vector3(1800, heightAt(1800, 150) + 1, 150));
    await settle(2500);
    const groundedFar = g.player.grounded;
    const dy = Math.abs(g.player.pos.y - heightAt(g.player.pos.x, g.player.pos.z));
    return { base, along, end, groundedFar, dy };
  });
  // Tiles stay bounded while travelling (a 9 x 9 block plus the unload margin).
  for (const s of res.along) {
    expect(s.tiles).toBeLessThanOrEqual(121);
    expect(s.veg).toBeLessThanOrEqual(121);
  }
  // Back home, counts return close to where they started.
  expect(res.end.tiles).toBeLessThanOrEqual(res.base.tiles + 12);
  expect(res.end.geo).toBeLessThan(res.base.geo * 1.12 + 40);
  expect(res.end.bodies).toBeLessThan(res.base.bodies + 80);
  expect(res.groundedFar).toBe(true);
  expect(res.dy).toBeLessThan(0.6);
  expect(errors).toEqual([]);
});

test('exploring reveals the world map and names regions', async ({ game }) => {
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const titles: string[] = [];
    const found: string[] = [];
    const offR = g.events?.on?.('regionEntered', (e: any) => titles.push(e.id));
    const before = g.discovery.cells.reduce((a: number, b: number) => a + b.toString(2).split('1').length - 1, 0);
    for (const [x, z] of [[1400, 150], [2760, 150]]) {
      g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
      await settle(1200);
    }
    const after = g.discovery.cells.reduce((a: number, b: number) => a + b.toString(2).split('1').length - 1, 0);
    offR?.();
    for (const [id, k] of g.discovery.places) if (k !== 'known') found.push(id);
    g.worldMap.toggle(true);
    await settle(400);
    const shown = !document.querySelector('.wmap')!.classList.contains('hidden');
    g.worldMap.toggle(false);
    return { before, after, regions: [...g.discovery.regions], found, shown };
  });
  expect(res.after).toBeGreaterThan(res.before);
  expect(res.regions).toContain('cresha');
  expect(res.regions).toContain('portAurelle');
  expect(res.found).toContain('portAurelle');
  expect(res.shown).toBe(true);
  expect(errors).toEqual([]);
});

test('a v5 save migrates to v6 and exploration persists across a reload', async ({ page }) => {
  // Seed a minimal pre-expansion (v5) save before the game script runs, once.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('fantasy-rpg-save-v5', JSON.stringify({
      v: 5, seed: 7,
      prog: { level: 3, xp: 10, gold: 42, sp: 1, combat: null, primaryStyle: null, secondaryStyle: null, activeStyle: null, styleIntroductions: [], learnedSkills: { gale: [], boundary: [], cross: [] }, styleMastery: { gale: 0, boundary: 0, cross: 0 } },
      items: [], equipped: {}, quick: [], moves: [], activeSpell: null, maps: {}, dungeon: { gateOpen: false, chests: [], bossDead: false, keyTaken: false },
      guild: { rank: 'D', rep: 0, completed: 0, nextQuestId: 1, active: [], available: [], explored: [] },
    }));
  });
  await boot(page, '?test&save');
  const migrated = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const gold = g.player.prog.gold;
    g.player.teleport(new T.Vector3(2760, heightAt(2760, 150) + 0.5, 150));
    await new Promise((r) => setTimeout(r, 1500));
    g.save();
    const raw = JSON.parse(localStorage.getItem('fantasy-rpg-save-v6') ?? '{}');
    return { gold, v: raw.v, hasWorld: !!raw.world?.discovery, port: raw.world?.discovery?.places?.portAurelle };
  });
  expect(migrated.gold).toBe(42);
  expect(migrated.v).toBe(6);
  expect(migrated.hasWorld).toBe(true);
  expect(migrated.port).toBe('visited');
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const reloaded = await page.evaluate(() => (window as any).__game.discovery.places.get('portAurelle'));
  expect(reloaded).toBe('visited');
});

test('the clock moves the sun, night lights the town, and weather changes the sky', async ({ page }) => {
  const errors = await boot(page, '?test&hour=12');
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Count drawn frames, not milliseconds: a software-rendered frame can take seconds.
    const frames = async (n: number) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
    const noon = { y: g.time.state.sunDir.y, sun: g.r.sun.intensity, night: g.time.state.night };
    g.time.skipTo(23);
    await settle(400);
    await frames(4);
    const night = { y: g.time.state.sunDir.y, sun: g.r.sun.intensity, night: g.time.state.night, glass: g.world.mats.glass.emissiveIntensity };
    g.time.skipTo(10);
    g.weather.forced = 'storm';
    await settle(8000);
    const storm = { cloud: g.weather.p.cloud, rain: g.weather.p.rain, wet: g.weather.p.wet };
    return { noon, night, storm, label: g.time.label };
  });
  expect(res.noon.y).toBeGreaterThan(0.5);
  expect(res.noon.night).toBe(0);
  expect(res.night.y).toBeLessThan(0);
  expect(res.night.night).toBeGreaterThan(0.9);
  expect(res.night.sun).toBeLessThan(res.noon.sun);
  expect(res.night.glass).toBeGreaterThan(1.5);
  expect(res.storm.cloud).toBeGreaterThan(0.6);
  expect(res.storm.rain).toBeGreaterThan(0.4);
  expect(res.label).toMatch(/^Day \d+, \d\d:\d\d$/);
  expect(errors).toEqual([]);
});

test('townsfolk follow their schedules, appear near the player and can be talked to', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page, '?test&hour=12.4');
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    g.player.teleport(new T.Vector3(0, heightAt(0, 4) + 0.3, 4));
    await settle(12000); // actors build in the background
    const nearPlaza = g.npcs.npcs.filter((n: any) => n.pos.distanceTo(new T.Vector3(0, n.pos.y, -4)) < 20).length;
    const active = g.npcs.activeCount;
    // Walk up to one and talk.
    const someone = g.npcs.npcs.find((n: any) => n.actor);
    let spoke = '';
    if (someone) {
      g.player.teleport(someone.pos.clone().add(new T.Vector3(1.2, 0.3, 0)));
      await settle(600);
      const near = g.npcs.nearest(g.player.pos);
      spoke = near ? g.npcs.lineFor(near) : '';
    }
    // Far away, actors are released back to the pool (level 3).
    g.player.teleport(new T.Vector3(1800, heightAt(1800, 150) + 0.4, 150));
    await settle(2500);
    const activeFar = g.npcs.activeCount;
    // At night most people are home in bed (hidden); coming back to town finds them there.
    g.time.skipTo(2);
    g.player.teleport(new T.Vector3(0, heightAt(0, 4) + 0.3, 4));
    await settle(1500);
    // (Elder Glen's own residents: other towns are only simulated while you are there.)
    const glen = g.npcs.npcs.filter((n: any) => n.rec.settlement === 'elderGlen');
    const hiddenAtNight = glen.filter((n: any) => n.hidden).length / glen.length;
    return { nearPlaza, active, spoke, activeFar, hiddenAtNight, total: g.npcs.npcs.length };
  });
  expect(res.total).toBeGreaterThan(50);
  expect(res.nearPlaza).toBeGreaterThan(5);
  expect(res.active).toBeGreaterThan(3);
  expect(res.spoke.length).toBeGreaterThan(5);
  expect(res.activeFar).toBe(0);
  expect(res.hiddenAtNight).toBeGreaterThan(0.6);
  expect(errors).toEqual([]);
});
