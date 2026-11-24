import { test, expect } from './fixtures';
test('real capsules hike walkable slopes, reject steep uphill motion, slide down and preserve flat deck speed', async ({ page }) => {
  await page.route('**/traversal-audit.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/traversal-audit.html');
  const results = await page.evaluate(async () => {
    const P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/player/traversal.ts' as string);
    await P.physics.init();
    const p = P.physics,
      R = p.R;
    const run = (angle: number, intent: number) => {
      const grade = Math.tan((angle * Math.PI) / 180),
        vertices = new Float32Array([-80, -80 * grade, -20, 80, 80 * grade, -20, 80, 80 * grade, 20, -80, -80 * grade, 20]);
      const floor = p.addTrimesh(vertices, new Uint32Array([0, 2, 1, 0, 3, 2])),
        body = p.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.95, 0)),
        col = p.world.createCollider(R.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(P.groups(P.G_PLAYER, 0xffff)), body),
        kcc = p.createCharacterController();
      p.step(1 / 60);
      let grounded = true,
        slide = 0,
        walkableLandings = 0;
      for (let i = 0; i < 360; i++) {
        const cur = body.translation(),
          feet = cur.y - 0.89,
          s = T.traversalSupport(cur.x, cur.z, feet),
          hike = T.uphillSpeed(s, { x: intent, y: 0, z: 0 });
        const desired = { x: (intent * 4.2 * hike) / 60, y: grounded ? 0 : -22 / 3600, z: 0 },
          ahead = T.traversalSupport(cur.x + desired.x, cur.z, feet),
          motion = T.resolveTraversalStep(desired, feet, s, ahead, grounded, 1 / 60, slide);
        slide = motion.slide;
        kcc.computeColliderMovement(col, motion.delta, R.QueryFilterFlags.EXCLUDE_SENSORS, P.STATIC_ONLY);
        const m = kcc.computedMovement();
        body.setNextKinematicTranslation({ x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z });
        p.step(1 / 60);
        const at = body.translation(),
          support = T.traversalSupport(at.x, at.z, at.y - 0.89);
        grounded = kcc.computedGrounded() && (!support || support.ny >= T.WALKABLE_NORMAL);
        if (grounded) walkableLandings++;
      }
      const at = body.translation(),
        result = { angle, intent, x: at.x, y: at.y, slide, walkableLandings };
      p.world.removeRigidBody(body);
      p.removeStatic(floor);
      return result;
    };
    return [run(0, 1), run(25, 1), run(40, 1), run(46, 1), run(60, 1), run(65, 0), run(65, -1)];
  });
  console.log('slope traversal', results);
  expect(results[0].x).toBeGreaterThan(24);
  expect(results[1].x).toBeGreaterThan(23);
  expect(results[2].x).toBeGreaterThan(10);
  expect(results[2].x).toBeLessThan(results[1].x);
  expect(results[3].x).toBeGreaterThan(6);
  expect(results[4].x).toBeLessThan(0.5);
  expect(results[4].walkableLandings).toBe(0);
  expect(results[5].x).toBeLessThan(-2);
  expect(results[6].x).toBeLessThan(-8);
  for (const r of results.slice(4)) expect(Math.abs(r.y - r.x * Math.tan((r.angle * Math.PI) / 180))).toBeLessThan(2);
});
