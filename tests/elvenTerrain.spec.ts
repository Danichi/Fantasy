import { test, expect } from './fixtures';
test('Verdant terrain: every route is walkable, pools share real water, and guide rules remain deterministic', async ({ page }) => {
  await page.route('**/elves-audit.html', (r) => r.fulfill({ body: '<!doctype html><html><body>Verdant audit</body></html>', contentType: 'text/html' }));
  await page.goto('/elves-audit.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const L = await import('/src/world/elves/layout.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      Water = await import('/src/world/waterLevel.ts' as string),
      S = await import('/src/world/landscape/surfaces.ts' as string);
    const routes = [];
    for (const route of L.FOREST_ROUTES)
      for (let k = 1; k < route.length; k++) {
        const a = L.FOREST_NODES[route[k - 1]],
          b = L.FOREST_NODES[route[k]],
          n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
        let worst = 0,
          wet = 0,
          where: any = null;
        for (let j = 1; j <= n; j++) {
          const x = a[0] + ((b[0] - a[0]) * j) / n,
            z = a[1] + ((b[1] - a[1]) * j) / n,
            px = a[0] + ((b[0] - a[0]) * (j - 1)) / n,
            pz = a[1] + ((b[1] - a[1]) * (j - 1)) / n;
          const grade = Math.abs(S.walkHeightAt(x, z) - S.walkHeightAt(px, pz)) / Math.hypot(x - px, z - pz);
          if (grade > worst) {
            worst = grade;
            where = [x, z];
          }
          if (Water.waterSurfaceAt(x, z) !== null && Water.waterSurfaceAt(x, z)! - S.walkHeightAt(x, z) > 0.35) wet++;
        }
        routes.push({ name: route[k - 1] + '-' + route[k], worst, wet, where });
      }
    const pools = L.FOREST_POOLS.map((p: any) => ({
      id: p.id,
      depth: Water.waterDepth(...p.at),
      surface: Water.waterSurfaceAt(...p.at),
      expected: L.forestNodeHeight(p.node, T.forestBaseHeight) - 1.2,
    }));
    const flags = { 'elf:guideUntil': 72 };
    const guidance = [
      L.forestGuided({}, 2, 23, false, 0),
      L.forestGuided(flags, 2, 23, false, 0),
      L.forestGuided(flags, 3, 0, false, 0),
      L.forestGuided({}, 4, 9, true, 0),
      L.forestGuided({}, 4, 9, false, 15),
      L.forestGuided({ 'elf:token': true }, 999, 9, false, 0),
    ];
    const worker = new Worker('/src/world/tileWorker.ts', { type: 'module' });
    worker.postMessage({ type: 'init', cells: W.macroCells() });
    let workerError = 0;
    for (const [i, j] of [
      [-4, -7],
      [-12, -12],
      [-12, -16],
      [12, -12],
    ]) {
      const data: Float32Array = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data.data);
        worker.onerror = reject;
        worker.postMessage({ type: 'tile', i, j });
      });
      const expected = T.computeTile(i, j);
      for (let k = 0; k < data.length; k++) workerError = Math.max(workerError, Math.abs(data[k] - expected[k]));
    }
    worker.terminate();
    return {
      workerError,
      routes,
      pools,
      guidance,
      anchors: [T.heightAt(-2842, -2931), T.heightAt(3256, -2856)],
      safeOuter: L.lostWoodsDestination(-1100, -1800),
      lost: L.lostWoodsDestination(-2200, -3200),
      onTrail: L.lostWoodsDestination(...L.FOREST_NODES.silverbough),
    };
  });
  console.log(JSON.stringify(result));
  for (const r of result.routes) {
    expect(r.worst, r.name + ' ' + r.where).toBeLessThan(Math.tan((48 * Math.PI) / 180));
    expect(r.wet, r.name).toBe(0);
  }
  for (const p of result.pools) {
    expect(p.depth, p.id).toBeGreaterThan(1.35);
    expect(p.surface, p.id).toBeCloseTo(p.expected, 4);
  }
  expect(result.workerError).toBe(0);
  expect(result.guidance).toEqual([false, true, false, true, true, true]);
  expect(result.safeOuter).toBeNull();
  expect(result.onTrail).toBeNull();
  expect(result.lost).not.toBeNull();
});
