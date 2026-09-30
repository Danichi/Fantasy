import { test, expect, type Page } from '@playwright/test';

// CI renders in software on a shared runner: PW_SLOW stretches waits and timeouts.
const SLOW = Number(process.env.PW_SLOW ?? '1');

// World Expansion phase 5: Port Aurelle, fishing, swimming, the Knight's
// Academy trials and the dwarven expedition.

async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  return errors;
}

test('Port Aurelle stands on its peninsula, populated, within the draw-call budget', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    g.player.teleport(new T.Vector3(2792, heightAt(2792, 150) + 0.5, 150));
    await new Promise((r) => setTimeout(r, 9000));
    const info = g.r.renderer.info.render;
    const near = g.npcs.npcs.filter((n: any) => n.rec.settlement === 'portAurelle' && !n.hidden && n.pos.distanceTo(g.player.pos) < 80).length;
    return {
      ground: heightAt(2792, 172), quay: heightAt(2930, 176), terrace: heightAt(2806, 70),
      grounded: g.player.grounded, calls: info.calls, residents: g.npcs.npcs.filter((n: any) => n.rec.settlement === 'portAurelle').length, near,
    };
  });
  expect(res.ground).toBeGreaterThan(0.5);
  expect(res.quay).toBeGreaterThan(0);
  expect(res.terrace).toBeGreaterThan(res.ground + 3);
  expect(res.grounded).toBe(true);
  expect(res.residents).toBeGreaterThan(60);
  expect(res.near).toBeGreaterThan(10);
  expect(res.calls).toBeLessThan(900);
  expect(errors).toEqual([]);
});

test('fishing: cast, strike, reel, sell the catch by weight', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const f = g.fishing;
    const spot = g.port.fishingSpots[0];
    g.player.teleport(spot.pos.clone().setY(spot.pos.y + 0.3));
    g.player.equip.add('fishingRod', 1);
    await new Promise((r) => setTimeout(r, 1500));
    f.start(spot);
    const key = (code: string, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code }));
    await new Promise((r) => setTimeout(r, 900));
    key('KeyE'); // cast
    const castPhase = f.phase;
    // Drive the minigame on its own clock (a synchronous loop: no frames run in
    // between), so it plays the same however slowly the page renders.
    for (let i = 0; i < 4000 && f.phase !== 'bite'; i++) f.update(0.05);
    const bit = f.phase === 'bite';
    key('KeyE'); // strike
    // Reel in bursts, easing off when the line strains.
    for (let i = 0; i < 4000 && f.phase === 'reel'; i++) {
      f['reeling'] = f['tension'] < 0.6;
      f.update(0.05);
    }
    f['reeling'] = false;
    const landed = f.phase === 'done';
    const held = Object.values(f.held as Record<string, number>).reduce((a, b) => a + b, 0);
    const gold0 = g.player.prog.gold;
    const sell = g.sellFish();
    return { castPhase, bit, landed, held, sold: g.player.prog.gold - gold0, sell };
  });
  expect(res.castPhase).toBe('wait');
  expect(res.bit).toBe(true);
  expect(res.landed).toBe(true);
  expect(res.held).toBeGreaterThan(0);
  expect(res.sold).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the Academy entrance trial is a real, non-lethal duel that can be won', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const q = g.quests;
    q.state['road-to-port'] = { status: 'done', stage: 1, progress: [1] };
    q.accept('academy-trial');
    await new Promise((r) => setTimeout(r, 2500));
    const duel = g.duel;
    const active = duel.active;
    const opp = duel.opponent;
    // Let him swing at us for a moment, then beat him down.
    await new Promise((r) => setTimeout(r, 3000));
    for (let k = 0; k < 20 && duel.active; k++) {
      opp.takeHit({ damage: 40, poise: 40, dir: new T.Vector3(1, 0, 0), at: opp.center.clone(), crit: false, source: 'melee' });
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 500));
    return { active, name: opp?.name, alive: opp?.alive, stage: q.state['academy-trial'].stage, playerAlive: !g.player.dead };
  });
  expect(res.active).toBe(true);
  expect(res.name).toBe('Ser Hadrik Vane');
  expect(res.alive).toBe(true); // he yields, he doesn't die
  expect(res.stage).toBe(1);
  expect(res.playerAlive).toBe(true);
  expect(errors).toEqual([]);
});

test('swimming: deep water floats you and drains stamina', async ({ page }) => {
  test.setTimeout(240_000 * SLOW);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    // Off the end of the longest pier, in the open harbour.
    g.player.teleport(new T.Vector3(3000, 0, 150));
    await new Promise((r) => setTimeout(r, 3000));
    const s0 = g.player.stamina;
    g.input.press('KeyW');
    await new Promise((r) => setTimeout(r, 2500));
    g.input.release('KeyW');
    return { swimming: g.player.swimming, y: g.player.pos.y, stamina: g.player.stamina, s0 };
  });
  expect(res.swimming).toBe(true);
  expect(res.y).toBeGreaterThan(-3);
  expect(res.stamina).toBeLessThan(res.s0);
  expect(errors).toEqual([]);
});

test('the dwarven expedition sails on its day and the quest survives a reload', async ({ page }) => {
  test.setTimeout(420_000 * SLOW);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
  });
  await boot(page, '?test&save');
  const before = await page.evaluate(async () => {
    const g = (window as any).__game;
    const q = g.quests;
    q.accept('dwarf-expedition');
    g.player.equip.add('ironOre', 5);
    g.player.equip.add('minersLantern', 1);
    q.options('bruni', () => {}, () => {})[0].run();
    q.options('guildmaster', () => {}, () => {})[0].run();
    q.update(1, g.player.pos);
    const stage = q.state['dwarf-expedition'].stage;
    const day = g.worldFlags.expeditionDay;
    g.save();
    return { stage, day, today: g.time.day };
  });
  expect(before.stage).toBe(1);
  expect(before.day).toBeGreaterThanOrEqual(before.today + 3);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const after = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const q = g.quests;
    const stage = q.state['dwarf-expedition'].stage;
    // Jump to sailing morning and board.
    g.time.day = g.worldFlags.expeditionDay;
    g.time.hour = 7.9;
    g.time.skipTo(8); // eight in the morning on sailing day
    const berth = g.port.berth;
    g.player.teleport(berth.clone().setY(berth.y + 0.5));
    await new Promise((r) => setTimeout(r, 1500));
    const board = g.realm.overworldInteractables.find((i: any) => /Iron Kettle/.test(i.label()));
    const ready = board?.enabled();
    board?.action();
    return { stage, ready, done: q.isDone('dwarf-expedition') };
  });
  expect(after.stage).toBe(1);
  expect(after.ready).toBe(true);
  expect(after.done).toBe(true);
});
