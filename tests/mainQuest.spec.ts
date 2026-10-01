import { test, expect, type Page } from '@playwright/test';

// The main story's opening act: a new game starts "A Stranger in Elder Glen",
// each chapter hands on to the next (crypt, Gravewood, the road to Port
// Aurelle), and the tracked objective gets a beacon and an on-screen marker.

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 300_000 });
  return errors;
}

test('the main quest chain runs from the village to the road east, with a waypoint to follow', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = await boot(page);
  const start = await page.evaluate(() => {
    const g = (window as any).__game;
    return { tracked: g.quests.tracked, tracker: g.hud.sideQuestHtml as string };
  });
  expect(start.tracked).toBe('mq-stranger');
  expect(start.tracker).toContain('MAIN QUEST');

  const res = await page.evaluate(async () => {
    const g = (window as any).__game, q = g.quests, T = g.THREE;
    const { heightAt } = await import('/src/world/terrain.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tp = async (x: number, z: number) => {
      g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.3, z));
      for (let i = 0; i < 20; i++) {
        await sleep(100);
        q.update(1, g.player.pos);
      }
    };
    const talk = (npc: string) => q.options(npc, () => {}, () => {}).find((o: any) => !o.label.startsWith('❗'))?.run();
    // The waypoint: facing away from Maud, the arrow sits at the screen edge.
    await tp(0, 30);
    g.cam.yaw = 0; // looking south, Maud is north
    await sleep(600);
    const wp = document.querySelector('.waypoint') as HTMLElement;
    const arrow = { shown: wp.style.display !== 'none', off: wp.classList.contains('off') };
    const beacon = g.r.scene.getObjectByName('questBeacon')?.visible;
    talk('maud');
    for (const [x, z] of [[0, 6], [27, 17], [22, -6]]) await tp(x, z);
    talk('maud');
    const afterStranger = { done: q.isDone('mq-stranger'), tracked: q.tracked };
    await tp(0, -306);
    g.realm.progress.bossDead = true;
    for (let i = 0; i < 30 && !q.isActive('mq-crypt', 2); i++) await sleep(100);
    talk('maud');
    const afterCrypt = { done: q.isDone('mq-crypt'), tracked: q.tracked };
    talk('magus');
    q.signal('stones-read');
    await tp(-340, 306);
    q.signal('gravewood-cleared');
    talk('magus');
    return {
      arrow, beacon, afterStranger, afterCrypt,
      gravewood: q.isDone('mq-gravewood'),
      dawnbreaker: g.player.equip.items.some((i: any) => i.def.id === 'dawnbreaker'),
      tracked: q.tracked,
    };
  });
  expect(res.arrow).toEqual({ shown: true, off: true });
  expect(res.beacon).toBe(true);
  expect(res.afterStranger).toEqual({ done: true, tracked: 'mq-crypt' });
  expect(res.afterCrypt).toEqual({ done: true, tracked: 'mq-gravewood' });
  expect(res.gravewood).toBe(true);
  expect(res.dawnbreaker).toBe(true);
  expect(res.tracked).toBe('road-to-port');
  expect(errors).toEqual([]);
});

test('merchant window: buy, sell, and Fröst\'s better steel unlocks with the story', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, p = g.player;
    const names = () => [...document.querySelectorAll('.shop2 .sc-name')].map((e) => e.textContent);
    g.town.shop();
    const before = names();
    const locked = document.querySelectorAll('.shop2 .sc-locked').length;
    p.prog.addGold(1000 - p.prog.gold);
    (document.querySelector('.shop2 [data-act=buy][data-id=bastardSword]') as HTMLElement).click();
    const bought = { gold: p.prog.gold, has: p.equip.items.some((i: any) => i.def.id === 'bastardSword') };
    (document.querySelector('.shop2 [data-tab=sell]') as HTMLElement).click();
    const sellBtn = [...document.querySelectorAll('.shop2 .sc')].find((c) => c.querySelector('.sc-name')?.textContent === 'Bastard Sword')?.querySelector('[data-act=sell]') as HTMLElement;
    sellBtn.click();
    const sold = { gold: p.prog.gold, has: p.equip.items.some((i: any) => i.def.id === 'bastardSword') };
    g.town.shopUI.close();
    g.quests.state['mq-crypt'] = { status: 'done', stage: 0, progress: [] };
    g.town.shop();
    const after = names();
    g.town.shopUI.close();
    return { before, locked, bought, sold, after };
  });
  expect(res.before).not.toContain("Warden's Claymore");
  expect(res.locked).toBeGreaterThan(0);
  expect(res.bought).toEqual({ gold: 850, has: true });
  expect(res.sold.has).toBe(false);
  expect(res.sold.gold).toBeGreaterThan(850);
  expect(res.after).toContain("Warden's Claymore");
  expect(errors).toEqual([]);
});
