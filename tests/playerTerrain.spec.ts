import { test, expect, boot } from './fixtures';
test('native player hikes, slides without fall damage and cannot mantle a continuous slope', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await boot(page);
  const r = await page.evaluate(async () => {
    const g = (window as any).__game;
    g.pause(true);
    g.sleep(true);
    const H = await import('/src/world/terrainHeight.ts' as string),
      p = g.player,
      P = g.physics;
    g.realm.mode = 'dungeon';
    const run = (angle: number, intent: number) => {
      const x = 58000,
        z = 50000,
        base = 150,
        grade = Math.tan((angle * Math.PI) / 180);
      H.setGroundOverride((xx: number) => base + (xx - x) * grade);
      const floor = P.addTrimesh(
        new Float32Array([x - 80, base - 80 * grade, z - 20, x + 80, base + 80 * grade, z - 20, x + 80, base + 80 * grade, z + 20, x - 80, base - 80 * grade, z + 20]),
        new Uint32Array([0, 2, 1, 0, 3, 2])
      );
      Object.assign(p, {
        act: null,
        lock: null,
        vehicle: null,
        mounted: false,
        swimming: false,
        flying: false,
        blocking: false,
        aiming: false,
        sprinting: false,
        walking: false,
        fallSpeed: 0,
      });
      p.teleport(new g.THREE.Vector3(x, base + 0.04, z));
      p.moveIntent.set(intent, 0, 0);
      p.yaw = intent < 0 ? -Math.PI / 2 : Math.PI / 2;
      P.step(1 / 60);
      const hp = p.hp;
      let landings = 0,
        maxFall = 0;
      const mantle = p.tryMantle();
      p.mantle = null;
      for (let i = 0; i < 300; i++) {
        p.move(1 / 60);
        P.step(1 / 60);
        if (p.grounded) landings++;
        maxFall = Math.max(maxFall, p.fallSpeed);
      }
      const result = { angle, intent, x: p.pos.x - x, y: p.pos.y - base, landings, maxFall, hpLost: hp - p.hp, mantle, sliding: p.slopeSliding };
      P.removeStatic(floor);
      return result;
    };
    const results = [run(0, 1), run(40, 1), run(60, 1), run(65, 0), run(65, -1)];
    H.setGroundOverride(null);
    return results;
  });
  console.log('native player terrain', r);
  expect(r[0].x).toBeGreaterThan(18);
  expect(r[1].x).toBeGreaterThan(8);
  expect(r[1].x).toBeLessThan(r[0].x);
  for (const v of r.slice(2)) {
    expect(v.x).toBeLessThan(0.6);
    expect(v.landings).toBe(0);
    expect(v.hpLost).toBe(0);
    expect(v.maxFall).toBeLessThan(8);
    expect(v.mantle).toBe(false);
    expect(Math.abs(v.y - v.x * Math.tan((v.angle * Math.PI) / 180))).toBeLessThan(2);
  }
  expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
});
