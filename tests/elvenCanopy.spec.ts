import { test, expect } from './fixtures';
test('the World Tree spiral supports a capsule from the roots to the canopy and releases every collider', async ({ page }) => {
  await page.route('**/canopy-audit.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/canopy-audit.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const F = await import('/src/world/elves/forestGeometry.ts' as string),
      L = await import('/src/world/elves/layout.ts' as string),
      P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      THREE = await import('/node_modules/three/build/three.module.js' as string);
    const p = P.physics;
    await p.init();
    const scene = new THREE.Scene(),
      palette = new F.ForestPalette(),
      mats: any = {};
    for (const k of ['stone', 'bridgeStone', 'plaster', 'timber', 'slate', 'tile', 'thatch', 'planks', 'glass', 'bark', 'window', 'windowLit', 'door']) mats[k] = palette.wood;
    const start = p.world.bodies.len(),
      s = L.FOREST_SITES.find((s: any) => s.id === 'sanctum'),
      g = F.buildForestSite(s, palette, mats, scene);
    const [x, z] = s.at,
      y = T.heightAt(x, z),
      R = p.R,
      V = THREE.Vector3,
      body = p.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 0.95, z + 25)),
      col = p.world.createCollider(R.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(P.groups(P.G_PLAYER, 0xffff)), body),
      kcc = p.createCharacterController();
    p.step(1 / 60);
    let worst = 0,
      cuts = 0;
    for (let i = 1; i <= 1500; i++) {
      const a = Math.PI / 2 + (i / 1500) * Math.PI * 4,
        target = new V(x + Math.cos(a) * 25, y + (i / 1500) * 28 + 0.95, z + Math.sin(a) * 25),
        cur = body.translation();
      const delta = target.clone().sub(new V(cur.x, cur.y, cur.z));
      kcc.computeColliderMovement(col, { x: delta.x, y: delta.y, z: delta.z }, R.QueryFilterFlags.EXCLUDE_SENSORS, P.STATIC_ONLY);
      const m = kcc.computedMovement();
      body.setNextKinematicTranslation({ x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z });
      p.step(1 / 60);
      const next = body.translation(),
        error = Math.hypot(next.x - target.x, next.z - target.z);
      worst = Math.max(worst, error);
      if (error > 0.2) cuts++;
    }
    const top = body.translation(),
      archive = F.canopyArchiveAt(0);
    const ray = p.castRay(archive.clone().add(new V(0, 4, 0)), new V(0, -1, 0), 8);
    const refuge = L.forestRefugeAt(L.FOREST_NODES.sanctum),
      spawn = { x: refuge[0], y: T.heightAt(...refuge) + 0.95, z: refuge[1] };
    let refugeOverlaps = 0;
    p.world.intersectionsWithShape(
      spawn,
      { x: 0, y: 0, z: 0, w: 1 },
      new R.Capsule(0.55, 0.32),
      () => {
        refugeOverlaps++;
        return true;
      },
      R.QueryFilterFlags.ONLY_FIXED,
      P.STATIC_ONLY
    );
    p.world.removeRigidBody(body);
    g.dispose();
    const town = F.buildForestSite(
        L.FOREST_SITES.find((s: any) => s.id === 'thornwick'),
        palette,
        mats,
        scene
      ),
      bridge = L.FOREST_BRIDGE;
    const bridgePoint = (t: number) =>
      new V(bridge.a[0] + (bridge.b[0] - bridge.a[0]) * t, L.forestBridgeHeight(t, T.forestBaseHeight) + 0.95, bridge.a[1] + (bridge.b[1] - bridge.a[1]) * t);
    const entry = bridgePoint(0),
      walker = p.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(entry.x, entry.y, entry.z)),
      capsule = p.world.createCollider(R.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(P.groups(P.G_PLAYER, 0xffff)), walker),
      controller = p.createCharacterController();
    p.step(1 / 60);
    let bridgeError = 0;
    for (let i = 1; i <= 500; i++) {
      const target = bridgePoint(i / 500),
        cur = walker.translation();
      controller.computeColliderMovement(capsule, { x: target.x - cur.x, y: target.y - cur.y, z: target.z - cur.z }, R.QueryFilterFlags.EXCLUDE_SENSORS, P.STATIC_ONLY);
      const move = controller.computedMovement();
      walker.setNextKinematicTranslation({ x: cur.x + move.x, y: cur.y + move.y, z: cur.z + move.z });
      p.step(1 / 60);
      const next = walker.translation();
      bridgeError = Math.max(bridgeError, Math.hypot(next.x - target.x, next.z - target.z));
    }
    const entryGap = Math.abs(entry.y - 0.95 - T.heightAt(...bridge.a)),
      exitGap = Math.abs(bridgePoint(1).y - 0.95 - T.heightAt(...bridge.b));
    p.world.removeRigidBody(walker);
    town.dispose();
    const end = p.world.bodies.len();
    return {
      refugeOverlaps,
      bridgeError,
      entryGap,
      exitGap,
      start,
      end,
      worst,
      cuts,
      height: top.y - y,
      archiveSurface: ray === null ? null : archive.y + 4 - ray - y,
      ground: T.heightAt(x + 32, z) - y,
    };
  });
  console.log('canopy', result);
  expect(result.height).toBeCloseTo(28.95, 1);
  expect(result.worst).toBeLessThan(0.3);
  expect(result.cuts).toBeLessThan(10);
  expect(result.archiveSurface).toBeCloseTo(28, 1);
  expect(result.ground).toBeCloseTo(0, 1);
  expect(result.refugeOverlaps).toBe(0);
  expect(result.bridgeError).toBeLessThan(0.3);
  expect(result.entryGap).toBeLessThan(0.15);
  expect(result.exitGap).toBeLessThan(0.15);
  expect(result.end).toBe(result.start);
});
