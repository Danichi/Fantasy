import { test, expect } from './fixtures';
test('forest brook ends, bends and pools draw water everywhere the swimmer can enter it', async ({ page }) => {
  await page.route('**/forest-water.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/forest-water.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const THREE = await import('/node_modules/three/build/three.module.js' as string),
      P = await import('/src/physics/physics.ts' as string),
      L = await import('/src/world/elves/layout.ts' as string),
      F = await import('/src/world/elves/forestGeometry.ts' as string),
      Water = await import('/src/world/waterLevel.ts' as string);
    await P.physics.init();
    const scene = new THREE.Scene(),
      palette = new F.ForestPalette(),
      mats: any = {};
    for (const k of ['stone', 'bridgeStone', 'plaster', 'timber', 'slate', 'tile', 'thatch', 'planks', 'glass', 'bark', 'window', 'windowLit', 'door']) mats[k] = palette.wood;
    const regions = ['thornwick', 'spring', 'starlake', 'glade'].map((id) =>
      F.buildForestSite(
        L.FOREST_SITES.find((s: any) => s.id === id),
        palette,
        mats,
        scene
      )
    );
    scene.updateMatrixWorld(true);
    const surfaces: any[] = [];
    scene.traverse((o: any) => {
      if (o.isMesh && o.material === palette.water) surfaces.push(o);
    });
    const ray = new THREE.Raycaster(),
      missing: any[] = [];
    let checked = 0;
    const sample = (x: number, z: number) => {
      const level = Water.waterSurfaceAt(x, z);
      if (level === null || Water.waterDepth(x, z) < 0.15) return;
      checked++;
      ray.set(new THREE.Vector3(x, level + 0.2, z), new THREE.Vector3(0, -1, 0));
      ray.near = 0;
      ray.far = 0.5;
      if (!ray.intersectObjects(surfaces, false).length) missing.push([x, z, level]);
    };
    for (let i = 1; i < L.FOREST_CREEK.length; i++) {
      const a = L.FOREST_CREEK[i - 1],
        b = L.FOREST_CREEK[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      for (let d = -8; d < len + 8; d += 2)
        for (const offset of [-7, -3, 0, 3, 7]) sample(a[0] + (dx / len) * d - (dz / len) * offset, a[1] + (dz / len) * d + (dx / len) * offset);
    }
    for (const pool of L.FOREST_POOLS)
      for (const r of [0, pool.r * 0.5, pool.r, pool.r + 3, pool.r + 7])
        for (let i = 0; i < 24; i++) {
          const a = (i * Math.PI) / 12;
          sample(pool.at[0] + Math.cos(a) * r, pool.at[1] + Math.sin(a) * r);
        }
    for (const r of regions) r.dispose();
    return { checked, missing, bodies: P.physics.world.bodies.len() };
  });
  console.log('forest water coverage', result);
  expect(result.checked).toBeGreaterThan(600);
  expect(result.missing).toEqual([]);
  expect(result.bodies).toBe(0);
});
