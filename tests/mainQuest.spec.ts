import { test, expect, type Page } from '@playwright/test';

// The main story's opening (the chapters themselves: tests/story.spec.ts):
// a test game starts after the fall with "A Stranger in Elder Glen", and the
// tracked objective gets a beacon and an on-screen marker.

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 300_000 });
  return errors;
}

test('a test game starts after the fall, with A Stranger in Elder Glen tracked and a waypoint to follow', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = await boot(page);
  const start = await page.evaluate(() => {
    const g = (window as any).__game;
    return { tracked: g.quests.tracked, tracker: g.hud.sideQuestHtml as string, fall: g.quests.isDone('mq-fall') };
  });
  expect(start.tracked).toBe('mq-stranger');
  expect(start.fall).toBe(true);
  expect(start.tracker).toContain('MAIN QUEST');

  const res = await page.evaluate(async () => {
    const g = (window as any).__game, q = g.quests, T = g.THREE;
    const { heightAt } = await import('/src/world/terrain.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Two of the Glen's troubles done: the waypoint points at Maud.
    q.signal('glen-trust');
    q.signal('glen-trust');
    q.update(1, g.player.pos);
    // Stand 40 m south of wherever Maud is just now (she keeps her own hours), looking south.
    const m = q.markers().find((k: { quest: string }) => k.quest === 'mq-stranger') ?? { x: 10, z: -10 };
    g.player.teleport(new T.Vector3(m.x, heightAt(m.x, m.z + 40) + 0.3, m.z + 40));
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      q.update(1, g.player.pos);
    }
    // Turn the camera fully away from her (check where it really looks, then flip if needed).
    g.cam.yaw = 0;
    await sleep(400);
    const fwd = g.r.camera.getWorldDirection(new T.Vector3());
    if (fwd.x * (m.x - g.player.pos.x) + fwd.z * (m.z - g.player.pos.z) > 0) g.cam.yaw = Math.PI;
    await sleep(600);
    const wp = document.querySelector('.waypoint') as HTMLElement;
    const arrow = { shown: wp.style.display !== 'none', off: wp.classList.contains('off') };
    const beacon = g.r.scene.getObjectByName('questBeacon')?.visible;
    return { arrow, beacon, stage: q.state['mq-stranger'].stage };
  });
  expect(res.arrow).toEqual({ shown: true, off: true });
  expect(res.beacon).toBe(true);
  expect(res.stage).toBe(1);
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
