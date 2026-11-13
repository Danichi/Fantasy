import { test, expect, boot, SLOW } from './fixtures';

test('a browser reload resumes the saved helm after quests and save hooks initialize', async ({ page }) => {
  test.setTimeout(480_000 * SLOW);
  const errors = await boot(page, '?test&save');
  const before = await page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing;
    g.player.prog.addGold(10000);
    g.quests.accept('sea-legs');
    const ship = s.rent('sloop');
    ship.pos.set(3520, 0, 430);
    ship.place();
    ship.place();
    s.board(ship);
    s.takeHelm();
    s.ctl.anchor = true;
    s.ctl.sail = 0;
    ship.anchored = true;
    ship.speed = 0;
    ship.sailSet = 0;
    s.rental.cargo = { spices: 7 };
    s.settings.units = 'knots';
    s.windCd = 45;
    g.save();
    return { x: ship.pos.x, z: ship.pos.z };
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, {
    timeout: 240_000 * SLOW,
  });
  const after = await page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing;
    return {
      mode: s.travelMode,
      cargo: s.rental?.cargo,
      units: s.settings.units,
      wind: s.windCd,
      x: s.current?.pos.x,
      z: s.current?.pos.z,
      vehicle: !!g.player.vehicle,
    };
  });
  expect(after.mode).toBe('helm');
  expect(after.vehicle).toBe(true);
  expect(after.cargo).toEqual({ spices: 7 });
  expect(after.units).toBe('knots');
  expect(after.wind).toBeGreaterThan(25);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});
