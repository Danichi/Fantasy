import { test, expect } from './fixtures';
test('terrain dressing is seeded, protects complete footprints, uses three batches and releases collision on travel', async ({ page }) => {
  await page.route('**/life-audit.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/life-audit.html');
  const r = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const T = await import('/src/world/terrainHeight.ts' as string),
      D = await import('/src/world/landscape/dressing.ts' as string),
      N = await import('/src/world/stylizedNature.ts' as string),
      L = await import('/src/world/landscape/landscape.ts' as string),
      E = await import('/src/world/elves/layout.ts' as string),
      P = await import('/src/physics/physics.ts' as string),
      THREE = await import('/node_modules/three/build/three.module.js' as string),
      G = await import('/src/world/grass.ts' as string);
    await P.physics.init();
    // Use the production nature protection queries without loading render assets.
    const nature = Object.create(N.StylizedNature.prototype);
    Object.assign(nature, {
      clearings: [
        ...new L.Landscape({ scene: new THREE.Scene(), flags: {}, toast: () => {}, save: () => {} }).clearings,
        ...Object.values(E.FOREST_NODES).map((p: any) => [...p, 90]),
      ],
      clearGrid: new Map(),
      clearGridOf: null,
      clearGridLen: -1,
    });
    const allow = (x: number, z: number, r: number) => nature.canPlace(x, z, r),
      scene = new THREE.Scene(),
      dressing = new D.TerrainDressing(scene, allow),
      start = P.physics.world.bodies.len();
    const locations = [
        [-550, -700],
        [4100, -4950],
        [4460, -5250],
        [3200, -4900],
        [-3200, -3500],
        [7800, -4700],
      ],
      counts = [];
    let deterministic = true,
      blocked = 0,
      total = 0,
      tall = 0;
    for (const [x, z] of locations) {
      const i = Math.floor(x / D.DRESSING_CELL),
        j = Math.floor(z / D.DRESSING_CELL),
        a = D.formationsForCell(i, j, allow),
        b = D.formationsForCell(i, j, allow);
      deterministic &&= JSON.stringify(a) === JSON.stringify(b);
      dressing.warm(new THREE.Vector3(x, T.heightAt(x, z), z));
      counts.push({ ...dressing.stats });
      for (const l of dressing.active.values())
        for (const f of l.formations) {
          total++;
          if (!allow(f.x, f.z, f.radius)) blocked++;
          for (const s of f.stones) if (s.height > 8) tall++;
        }
    }
    const formation = [...dressing.active.values()].flatMap((l) => l.formations).find((f) => allow(f.x, f.z, 10))!;
    nature.clearings.push([formation.x + 3, formation.z + 2, 0.2]);
    const enclosedClearing = !allow(formation.x, formation.z, 10);
    nature.clearings.pop();
    dressing.setVisible(false);
    const hidden = dressing.stats.instances === 0 && dressing.stats.colliders === 0;
    dressing.setVisible(true);
    dressing.reset();
    const budgets = [12000, 26000, 38000, 110000, 200000].map((n) => {
      const layers = G.grassLayout(n);
      return {
        roots: (layers[0].count * layers[0].blades) / n,
        triangles: layers.reduce((sum: any, l: any) => sum + l.count * l.blades * (l.rows.length * 2 - 1), 0) / (n * 13.9),
      };
    });
    return {
      counts,
      enclosedClearing,
      hidden,
      deterministic,
      blocked,
      total,
      tall,
      bodies: P.physics.world.bodies.len() - start,
      budgets,
      reserved: [nature.canPlace(0, 0, 10), nature.canPlace(-2842, -2931, 20), nature.canPlace(2760, 150, 20)],
    };
  });
  console.log('living terrain', r);
  expect(r.deterministic).toBe(true);
  expect(r.enclosedClearing).toBe(true);
  expect(r.hidden).toBe(true);
  expect(r.blocked).toBe(0);
  expect(r.total).toBeGreaterThan(30);
  expect(r.tall).toBeGreaterThan(10);
  expect(r.bodies).toBe(0);
  expect(r.reserved).toEqual([false, false, false]);
  for (const c of r.counts) {
    expect(c.cells).toBeLessThan(110);
    expect(c.draws).toBeLessThanOrEqual(3);
    expect(c.instances).toBeGreaterThan(20);
  }
  for (const b of r.budgets) {
    expect(b.roots).toBeGreaterThanOrEqual(1.79);
    expect(b.triangles).toBeLessThan(1.25);
  }
});
