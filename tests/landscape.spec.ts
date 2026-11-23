import { test, expect } from './fixtures';

test('authored landscape: regional relief, preserved foundations, graded trails and shared water', async ({ page }) => {
  await page.route('**/landscape-audit.html', (r) => r.fulfill({ body: '<!doctype html><html><body>Landscape audit</body></html>', contentType: 'text/html' }));
  await page.goto('/landscape-audit.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const L = await import('/src/world/landscape/layout.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      S = await import('/src/world/landscape/surfaces.ts' as string),
      water = await import('/src/world/waterLevel.ts' as string),
      I = await import('/src/world/islands/layout.ts' as string);
    const relief = L.LANDFORMS.map((f: any) => {
      let delta = 0;
      for (let x = -0.7; x <= 0.7; x += 0.2)
        for (let z = -0.7; z <= 0.7; z += 0.2) {
          const px = f.line[0][0] + x * f.width,
            pz = f.line[0][1] + z * f.width;
          delta = Math.max(delta, Math.abs(T.worldHeightFn(px, pz) - T.baseWorldHeightFn(px, pz)));
        }
      return { id: f.id, region: f.region, delta };
    });
    const protectedPoints = [
      [0, 0],
      [0, -318],
      [-180, -262],
      [-340, 330],
      [2760, 150],
      [2940, 150],
      [-3440, -1060],
      [4335, -4462],
      [4362, -4752],
      [2412, -5440],
      [-5830, 700],
    ];
    const anchors = protectedPoints.map(([x, z]) => ({ x, z, error: Math.abs(T.worldHeightFn(x, z) - T.baseWorldHeightFn(x, z)) }));
    const grades = L.TRAILS.map((t: any) => {
      const points = L.trailProfile(t, T.baseWorldHeightFn);
      let grade = 0,
        actual = 0,
        at: any = null;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          g = Math.abs(a[2] - b[2]) / Math.hypot(a[0] - b[0], a[1] - b[1]);
        grade = Math.max(grade, g);
        const n = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 2);
        for (let j = 0; j < n; j++) {
          const x = a[0] + ((b[0] - a[0]) * j) / n,
            z = a[1] + ((b[1] - a[1]) * j) / n,
            nx = a[0] + ((b[0] - a[0]) * (j + 1)) / n,
            nz = a[1] + ((b[1] - a[1]) * (j + 1)) / n;
          const g = Math.abs(S.walkHeightAt(x, z) - S.walkHeightAt(nx, nz)) / Math.hypot(nx - x, nz - z);
          if (g > actual) {
            actual = g;
            at = [x, z];
          }
        }
      }
      return { id: t.id, grade, actual, at };
    });
    const wet = L.WATERCOURSES.flatMap((w: any) =>
      w.knots.map((p: any) => ({ id: w.id, base: T.baseWorldHeightFn(p[0], p[1]), level: p[2], surface: water.waterSurfaceAt(p[0], p[1]), depth: p[2] - T.heightAt(p[0], p[1]) }))
    );
    const bridges = L.CROSSINGS.map((c: any) => ({ id: c.id, bed: T.heightAt(...c.at), walk: S.walkHeightAt(...c.at), surface: water.waterSurfaceAt(...c.at), level: c.level }));
    const seaAnchors = I.ISLANDS.flatMap((i: any) => [i.sea, ...(i.dive ? [i.dive] : [])])
      .filter((p: any) => T.baseWorldHeightFn(...p) < W.SEA_LEVEL && W.macroElevAt(...p) < W.SEA_LEVEL + 1.4)
      .map((p: any) => T.worldHeightFn(...p) - T.baseWorldHeightFn(...p));
    const islandAnchors = I.ISLANDS.map((i: any) => ({ id: i.id, delta: Math.abs(T.worldHeightFn(...i.landing) - T.baseWorldHeightFn(...i.landing)) }));
    const start = performance.now();
    for (let i = 0; i < 10000; i++) T.worldHeightFn(500 + (i % 128) * 2, -450 + Math.floor(i / 128) * 2);
    const ms = performance.now() - start;
    const R = await import('/src/world/roadData.ts' as string);
    const roadCrossings = L.CROSSINGS.filter((c: any) => c.id !== 'northspring-bridge').map((c: any) => {
      let maxGrade = 0,
        worst: any = null;
      for (const road of R.ROAD_POLYS)
        for (let i = 1; i < road.length; i++) {
          const a = road[i - 1],
            b = road[i],
            len = Math.hypot(a[0] - b[0], a[1] - b[1]),
            n = Math.ceil(len / 1.5);
          for (let j = 0; j < n; j++) {
            const x = a[0] + ((b[0] - a[0]) * j) / n,
              z = a[1] + ((b[1] - a[1]) * j) / n;
            if (Math.hypot(x - c.at[0], z - c.at[1]) > c.half + 50) continue;
            const nx = a[0] + ((b[0] - a[0]) * (j + 1)) / n,
              nz = a[1] + ((b[1] - a[1]) * (j + 1)) / n;
            const grade = Math.abs(S.walkHeightAt(x, z) - S.walkHeightAt(nx, nz)) / Math.hypot(x - nx, z - nz);
            if (grade > maxGrade) {
              maxGrade = grade;
              worst = [x, z];
            }
          }
        }
      return { id: c.id, maxGrade, worst };
    });
    let foundationError = 0;
    for (let x = 2696; x <= 2968; x += 20)
      for (let z = 18; z <= 340; z += 20) foundationError = Math.max(foundationError, Math.abs(T.worldHeightFn(x, z) - T.baseWorldHeightFn(x, z)));
    for (let x = -3660; x <= -3220; x += 20)
      for (let z = -1240; z <= -880; z += 20)
        if (Math.hypot((x + 3440) / 250, (z + 1060) / 215) < 1) foundationError = Math.max(foundationError, Math.abs(T.worldHeightFn(x, z) - T.baseWorldHeightFn(x, z)));
    const D = await import('/src/world/desert/desertLayout.ts' as string);
    const roadside = [
      ...Object.keys(R.CROWN_SITES).map((key: string) => ({ id: key, at: R.crownSitePoint(key) })),
      ...D.SCRAP_TOWNS.map((t: any) => ({ id: t.name, at: [t.x, t.z] })),
    ].map((s: any) => ({ id: s.id, error: Math.abs(T.worldHeightFn(...s.at) - T.baseWorldHeightFn(...s.at)), depth: water.waterDepth(...s.at) }));
    const exits = L.BANK_EXITS.map((e: any) => {
      let grade = 0;
      for (let i = 0; i < 60; i++) {
        const at = (t: number) => [e.at[0] + (e.end[0] - e.at[0]) * t, e.at[1] + (e.end[1] - e.at[1]) * t];
        const a = at(i / 60),
          b = at((i + 1) / 60);
        grade = Math.max(grade, Math.abs(T.heightAt(...a) - T.heightAt(...b)) / Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
      return { id: e.id, grade, dry: water.waterSurfaceAt(...e.end) === null };
    });
    return { relief, anchors, grades, wet, bridges, islandAnchors, roadCrossings, foundationError, roadside, exits, seaAnchors, ms };
  });
  await test.info().attach('landscape-audit', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log('landscape audit', {
    features: result.relief.length,
    foundationError: result.foundationError,
    maxTrailGrade: Math.max(...result.grades.map((t: any) => t.actual)),
    samplingMs: result.ms,
  });
  expect(result.seaAnchors.length).toBeGreaterThan(40);
  expect(Math.max(...result.seaAnchors)).toBeLessThan(0.001);
  expect(result.roadside.every((s: any) => s.error < 1e-5 && s.depth < 0.1)).toBe(true);
  expect(result.foundationError).toBeLessThan(1e-5);
  expect(result.anchors.every((a: any) => a.error < 1e-5)).toBe(true);
  expect(result.islandAnchors.every((a: any) => a.delta < 1e-5)).toBe(true);
  expect(new Set(result.relief.filter((f: any) => f.delta > 5).map((f: any) => f.region)).size).toBeGreaterThanOrEqual(14);
  expect(result.grades.every((t: any) => t.grade <= 0.481)).toBe(true);
  expect(result.grades.every((t: any) => t.actual < Math.tan((48 * Math.PI) / 180))).toBe(true);
  expect(result.wet.every((w: any) => w.surface !== null && Math.abs(w.surface - w.level) < 0.4 && w.depth > 0.5)).toBe(true);
  expect(result.exits.every((e: any) => e.grade < 0.6 && e.dry)).toBe(true);
  expect(result.roadCrossings.every((b: any) => b.maxGrade < 1.11)).toBe(true);
  expect(result.bridges.every((b: any) => b.bed < b.surface && Math.abs(b.walk - b.level) < 0.01)).toBe(true);
});
