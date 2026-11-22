import { test, expect } from './fixtures';

test('landscape physics: rotated decks retain walking speed, old elevated saves stay on floors, worker heights agree', async ({ page }) => {
  await page.route('**/landscape-physics.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/landscape-physics.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const L = await import('/src/world/landscape/layout.ts' as string),
      M = await import('/src/world/landscape/landscape.ts' as string),
      P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      THREE = await import('/node_modules/three/build/three.module.js' as string);
    const p = P.physics,
      V = THREE.Vector3;
    await p.init();
    const landscape = new M.Landscape({ scene: new THREE.Scene(), flags: {}, toast: () => {}, save: () => {} });
    const c = L.CROSSINGS[0],
      angle = c.angle ?? 0,
      dx = Math.cos(angle),
      dz = Math.sin(angle);
    landscape.warm(new V(...[c.at[0], c.level, c.at[1]]));
    const R = p.R,
      body = p.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.at[0] - dx * 21, c.level + 0.89, c.at[1] - dz * 21));
    const collider = p.world.createCollider(R.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(P.groups(P.G_PLAYER, 0xffff)), body),
      kcc = p.createCharacterController();
    p.step(1 / 60);
    let speed = 0,
      cuts = 0;
    const from = body.translation();
    for (let i = 0; i < 500; i++) {
      speed += (4.2 - speed) * (1 - Math.exp(-8 / 60));
      const want = speed / 60,
        cur = body.translation(),
        top = cur.y - 0.89 + 1.3;
      const ground = (x: number, z: number) => {
        const hit = p.castRay(new V(x, top, z), new V(0, -1, 0), 3);
        return hit === null ? top : top - hit;
      };
      const rise = ground(cur.x + dx * want, cur.z + dz * want) - ground(cur.x, cur.z) - 0.005;
      kcc.computeColliderMovement(collider, { x: dx * want, y: rise, z: dz * want }, R.QueryFilterFlags.EXCLUDE_SENSORS, P.STATIC_ONLY);
      const m = kcc.computedMovement(),
        next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
      body.setNextKinematicTranslation(next);
      collider.setTranslation(next);
      if (Math.hypot(m.x, m.z) < want * 0.97) {
        speed = Math.hypot(m.x, m.z) * 60;
        cuts++;
      }
      p.step(1 / 60);
    }
    const to = body.translation(),
      distance = Math.hypot(to.x - from.x, to.z - from.z);
    p.addBox(new V(30, 80, 30), new V(3, 0.2, 3));
    p.step(1 / 60);
    const original = new V(30, 80.22, 30),
      migrated = M.migrateTerrainPosition(original);
    const keptFloor = Math.abs(migrated.y - 80.2) < 0.3 && migrated.distanceTo(original) < 0.4;
    const worker = new Worker('/src/world/tileWorker.ts', { type: 'module' });
    worker.postMessage({ type: 'init', cells: W.macroCells() });
    let workerError = 0;
    for (const [i, j] of [
      [-2, -1],
      [-10, -3],
      [15, -18],
      [24, 14],
    ]) {
      const actual: Float32Array = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data.data);
        worker.onerror = reject;
        worker.postMessage({ type: 'tile', i, j });
      });
      const expected = T.computeTile(i, j);
      for (let k = 0; k < expected.length; k++) workerError = Math.max(workerError, Math.abs(expected[k] - actual[k]));
    }
    worker.terminate();
    landscape.reset();
    p.world.free();
    return { distance, cuts, keptFloor, originalUnchanged: original.y === 80.22, workerError };
  });
  console.log('landscape physics', result);
  expect(result.distance).toBeGreaterThan(28);
  expect(result.keptFloor).toBe(true);
  expect(result.originalUnchanged).toBe(true);
  expect(result.workerError).toBe(0);
});
