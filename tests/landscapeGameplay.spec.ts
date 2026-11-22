import { test, expect, SLOW } from './fixtures';

test('landscape traversal: native scramble, ceiling rejection, bridge crossing, current, discovery and cleanup', async ({ game }) => {
  test.setTimeout(420_000 * SLOW);
  const result = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      L = await import('/src/world/landscape/layout.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      S = await import('/src/world/landscape/surfaces.ts' as string),
      M = await import('/src/world/landscape/landscape.ts' as string);
    g.pause(true);
    g.sleep(true);
    g.player.invulnerable = true;
    g.input.uiMode = false;
    const p = g.player,
      V = g.THREE.Vector3;
    p.lock = null;
    p.act = null;
    p.blocking = false;
    const floor = g.physics.addBox(new V(30, 99.7, 30), new V(8, 0.3, 8));
    const ledge = g.physics.addBox(new V(30, 100.6, 32), new V(2, 0.6, 1.35));
    const reset = () => {
      g.input.releaseAll();
      g.input.uiMode = false;
      p.act = null;
      p.lock = null;
      p.teleport(new V(30, 100.06, 30));
      g.cam.yaw = 0;
      g.stepSim(12);
    };
    reset();
    g.input.press('KeyW');
    g.input.press('KeyC');
    g.stepSim(1);
    const started = p.mantling;
    g.input.release('KeyC');
    g.stepSim(38);
    g.input.releaseAll();
    g.stepSim(10);
    const scrambled = started && p.pos.z > 31 && p.pos.y > 101.1 && p.grounded;
    const ceiling = g.physics.addBox(new V(30, 102.55, 32), new V(2, 0.15, 1.35));
    g.stepSim(1);
    reset();
    g.input.press('KeyW');
    g.input.press('KeyC');
    g.stepSim(1);
    const rejected = !p.mantling;
    g.input.releaseAll();
    g.stepSim(40);
    g.physics.removeStatic(ceiling);
    g.physics.removeStatic(ledge);
    g.physics.removeStatic(floor);
    const c = L.CROSSINGS[0],
      angle = c.angle ?? 0,
      along = (n: number) =>
        new V(c.at[0] + Math.cos(angle) * n, S.walkHeightAt(c.at[0] + Math.cos(angle) * n, c.at[1] + Math.sin(angle) * n) + 0.1, c.at[1] + Math.sin(angle) * n);
    p.teleport(along(-c.half - 8));
    g.landscape.warm(p.pos);
    g.input.uiMode = false;
    g.cam.yaw = Math.PI / 2 - angle;
    g.stepSim(15);
    g.input.press('KeyW');
    const path: any[] = [];
    let minClearance = Infinity,
      swam = false;
    for (let i = 0; i < 1440; i++) {
      g.stepSim();
      if (i % 120 === 0) path.push({ i, pos: p.pos.toArray(), vel: p.vel.toArray(), grounded: p.grounded, swimming: p.swimming, yaw: p.yaw, cam: g.cam.yaw, act: p.act?.def.id });
      const local = L.crossingCoordinates(c, p.pos.x, p.pos.z);
      if (Math.abs(local.along) < c.half - 1 && Math.abs(local.across) < c.width / 2) {
        minClearance = Math.min(minClearance, p.pos.y - c.level);
        swam ||= p.swimming;
      }
      if (local.along > c.half + 3) break;
    }
    g.input.releaseAll();
    const crossed = L.crossingCoordinates(c, p.pos.x, p.pos.z).along > c.half + 3;
    const w = L.WATERCOURSES.find((w: any) => w.id === 'lantern'),
      a = w.knots[3],
      b = w.knots[4],
      x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2;
    p.teleport(new V(x, 1 - 1.25, z));
    p.swimming = true;
    p.diveDepth = 0;
    p.stamina = p.maxStamina;
    g.stepSim(8);
    const before = p.pos.clone();
    g.stepSim(120);
    const drift = p.pos.clone().sub(before),
      swimming = p.swimming;
    const migrated = M.migrateTerrainPosition(new V(x, 0, z)),
      water = await import('/src/world/waterLevel.ts' as string);
    const migrationDry = water.waterSurfaceAt(migrated.x, migrated.z) === null || S.walkHeightAt(migrated.x, migrated.z) > water.waterSurfaceAt(migrated.x, migrated.z);
    const guide = g.landscape.interactables[0];
    p.teleport(guide.pos.clone().add(new V(0, 0.05, 0)));
    g.landscape.warm(p.pos);
    g.input.uiMode = false;
    g.input.press('KeyE');
    g.stepSim(1);
    g.input.releaseAll();
    const discovered = !!g.worldFlags['terrain:seen:' + L.TRAILS[0].id],
      marker = g.landscape.markers().some((m: any) => m.label === L.TRAILS[0].name);
    // Landscape owns and removes its fixed bodies; unloading must not leave
    // an invisible bridge or accumulate Rapier bodies after returning.
    p.teleport(new V(c.at[0], c.level + 0.1, c.at[1]));
    g.landscape.warm(p.pos);
    const ray = () => g.physics.castRay(new V(c.at[0], c.level + 1, c.at[1]), new V(0, -1, 0), 2);
    g.physics.step(1 / 60);
    const bridgePresent = ray() !== null;
    g.landscape.update(1, p.pos, false);
    g.physics.step(1 / 60);
    const unloaded = ray() === null,
      empty = g.landscape.stats.chunks === 0;
    const initialBodies = g.physics.world.bodies.len();
    for (let i = 0; i < 3; i++) {
      g.landscape.warm(p.pos);
      g.landscape.update(1, p.pos, false);
    }
    const bodyLeak = g.physics.world.bodies.len() - initialBodies;
    const coverageCount = Array.from(g.terrain.coverageData as Uint8Array).filter((n) => n > 0).length;
    const terrainCovered = g.terrain.coverageAt(p.pos.x, p.pos.z),
      coverageMatches = coverageCount === g.terrain.tileCount;
    return {
      path,
      terrainCovered,
      coverageMatches,
      scrambled,
      started,
      rejected,
      crossed,
      minClearance,
      swam,
      swimming,
      drift: drift.length(),
      flow: drift.x * (b[0] - a[0]) + drift.z * (b[1] - a[1]),
      migrationDry,
      discovered,
      marker,
      bridgePresent,
      unloaded,
      empty,
      bodyLeak,
    };
  });
  await test.info().attach('landscape-gameplay', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log('landscape gameplay', JSON.stringify(result));
  expect(result.terrainCovered && result.coverageMatches).toBe(true);
  expect(result.scrambled).toBe(true);
  expect(result.rejected).toBe(true);
  expect(result.crossed).toBe(true);
  expect(result.minClearance).toBeGreaterThan(-0.12);
  expect(result.swam).toBe(false);
  expect(result.swimming).toBe(true);
  expect(result.drift).toBeGreaterThan(0.2);
  expect(result.flow).toBeGreaterThan(0);
  expect(result.migrationDry).toBe(true);
  expect(result.discovered && result.marker).toBe(true);
  expect(result.bridgePresent && result.unloaded && result.empty).toBe(true);
  expect(result.bodyLeak).toBe(0);
  expect(game.errors).toEqual([]);
});

test('regional terrain and water render in the playable world', async ({ game }) => {
  test.setTimeout(360_000 * SLOW);
  await game.page.addStyleTag({ content: '.region-card{display:none!important}' });
  const locations = [
    { id: 'lantern-valley', x: 820, z: 110, dx: 110, dz: 125, up: 85 },
    { id: 'glen-ridge', x: -540, z: -130, dx: 120, dz: 125, up: 85 },
    { id: 'capital-bluffs', x: -3340, z: -1420, dx: 190, dz: 170, up: 110 },
    { id: 'hanging-tarn', x: 3930, z: -4600, dx: 100, dz: 100, up: 85 },
    { id: 'glasswind-oasis', x: -5100, z: 1270, dx: 100, dz: 130, up: 85 },
    { id: 'emerald-heartfall', x: 6400, z: 3670, dx: 60, dz: 75, up: 55 },
  ];
  for (const loc of locations) {
    await game.page.evaluate(async (loc) => {
      const g = (window as any).__game,
        T = await import('/src/world/landscape/surfaces.ts' as string);
      g.pause(true);
      g.sleep(true);
      g.player.invulnerable = true;
      g.input.releaseAll();
      g.input.uiMode = false;
      g.dialogue.close();
      const y = T.walkHeightAt(loc.x, loc.z);
      g.player.teleport(new g.THREE.Vector3(loc.x, y + 0.1, loc.z));
      for (let i = 0; i < 24; i++) g.landscape.update(0.4, g.player.pos, true);
      g.cam.frozen = true;
      g.r.camera.position.set(loc.x + loc.dx, y + loc.up, loc.z + loc.dz);
      g.r.camera.lookAt(loc.x, y + 2, loc.z);
      g.time.skipTo(12);
      g.r.basePixelRatio = 0.85;
      g.r.resize();
      g.pause(false);
      g.sleep(false);
    }, loc);
    await game.page.waitForTimeout(1200);
    await game.page.evaluate(() => {
      const g = (window as any).__game;
      g.pause(true);
      g.sleep(true);
      g.r.render();
    });
    await game.page.screenshot({ path: test.info().outputPath(loc.id + '.png') });
  }
  expect(game.errors).toEqual([]);
});
