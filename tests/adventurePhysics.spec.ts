import { test, expect } from './fixtures';
test('traversal uses real capsule collision for climbing, ledge shimmy, hoisting and obstructed ropes', async ({ page }) => {
  await page.route('**/adventure-physics.html', (r) => r.fulfill({ body: '<!doctype html><html><body></body></html>', contentType: 'text/html' }));
  await page.goto('/adventure-physics.html');
  const r = await page.evaluate(async () => {
    const P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/player/adventureTraversal.ts' as string),
      S = await import('/src/player/traversalSurfaces.ts' as string),
      PL = await import('/src/player/player.ts' as string),
      I = await import('/src/core/input.ts' as string),
      C = await import('/src/player/camera.ts' as string),
      THREE = await import('/node_modules/three/build/three.module.js' as string);
    await P.physics.init();
    const ph = P.physics,
      R = ph.R,
      V = THREE.Vector3,
      input = new I.Input(document.body),
      cam = new C.ThirdPersonCamera(new THREE.PerspectiveCamera(), input);
    cam.yaw = Math.PI;
    const p = Object.create(PL.Player.prototype);
    Object.assign(p, {
      pos: new V(0, 0.05, 0.7),
      vel: new V(),
      stamina: 100,
      staminaDelay: 0,
      grounded: true,
      act: null,
      yaw: Math.PI,
      dead: false,
      mounted: false,
      vehicle: null,
      swimming: false,
      flying: false,
      mantle: null,
      equip: { items: [{ def: { id: 'grapplingHook' } }] },
    });
    p.body = ph.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.94, 0.7));
    p.collider = ph.world.createCollider(R.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(P.groups(P.G_PLAYER, 0xffff)), p.body);
    p.kcc = ph.createCharacterController();
    p.adventure = new T.AdventureTraversal(p);
    const floor = ph.addBox(new V(0, -0.5, 0), new V(30, 0.5, 30)),
      wall = ph.addBox(new V(0, 4, -1), new V(6, 4, 1));
    ph.step(1 / 60);
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        p.adventure.step(1 / 60, input, cam);
        ph.step(1 / 60);
        input.endStep();
      }
    };
    const place = (x: number, y: number, z: number) => {
      input.releaseAll();
      p.adventure.cancel();
      p.adventure['cooldown'] = 0;
      p.pos.set(x, y, z);
      p.body.setTranslation({ x, y: y + 0.89, z }, true);
      p.collider.setTranslation({ x, y: y + 0.89, z });
      p.vel.set(0, 0, 0);
      p.stamina = 100;
      p.grounded = true;
      ph.step(1 / 60);
    };
    input.press('KeyE');
    tick(1);
    const untagged = p.adventure.mode;
    input.releaseAll();
    S.markClimbable(wall);
    place(0, 0.05, 1.0);
    input.press('KeyE');
    input.press('KeyW');
    tick(1);
    input.release('KeyE');
    tick(340);
    const climb = { pos: p.pos.toArray(), mode: p.adventure.mode, stamina: p.stamina };
    place(0, 6.35, 0.7);
    input.press('KeyE');
    tick(1);
    input.releaseAll();
    tick(30);
    const hangStart = p.pos.clone(),
      hanging = p.adventure.mode;
    input.press('KeyD');
    tick(60);
    input.releaseAll();
    const shimmy = { dx: p.pos.x - hangStart.x, dz: p.pos.z - hangStart.z, mode: p.adventure.mode };
    input.press('KeyC');
    tick(45);
    input.releaseAll();
    const hoist = { mode: p.adventure.mode, y: p.pos.y, z: p.pos.z };
    place(0, 3, 0.7);
    input.press('KeyE');
    tick(1);
    input.releaseAll();
    p.stamina = 0.01;
    tick(2);
    const exhausted = { mode: p.adventure.mode, vy: p.vel.y };
    place(0, 6.35, 0.7);
    input.press('KeyE');
    tick(1);
    input.releaseAll();
    tick(20);
    const ceiling = ph.addBox(new V(0, 9.65, -0.5), new V(2, 0.1, 1));
    ph.step(1 / 60);
    input.press('KeyC');
    tick(1);
    input.releaseAll();
    tick(40);
    const lowCeiling = { mode: p.adventure.mode, y: p.pos.y };
    ph.removeStatic(ceiling);
    place(0, 0.05, 12);
    const landing = new V(0, 8.055, -0.5),
      hook = new V(0, 9.8, 0.3);
    const started = p.adventure.grappleTo(landing, hook);
    tick(160);
    const rope = { started, mode: p.adventure.mode, error: p.pos.distanceTo(landing) };
    place(0, 0.05, 12);
    const blocker = ph.addBox(new V(0, 8, 6), new V(4, 8, 0.5));
    ph.step(1 / 60);
    const blockedStart = p.adventure.grappleTo(landing, hook);
    tick(160);
    const blocked = { started: blockedStart, z: p.pos.z, notice: p.adventure.notice, mode: p.adventure.mode };
    ph.removeStatic(blocker);
    place(0, 0.05, 12);
    const dynamicStarted = p.adventure.grappleTo(landing, hook);
    tick(1);
    const lateBlocker = ph.addBox(new V(0, 8, 6), new V(4, 8, 0.5));
    ph.step(1 / 60);
    tick(160);
    const dynamicBlock = { started: dynamicStarted, z: p.pos.z, mode: p.adventure.mode };
    ph.removeStatic(lateBlocker);
    place(0, 0.05, 12);
    S.addGrappleAnchor({ id: 'test', point: hook, landing, owner: wall.handle });
    const tagged = S.traversalSurfaceCount();
    ph.removeStatic(wall);
    const cleanup = { tagged, left: S.traversalSurfaceCount(), anchors: S.grappleAnchors.size };
    ph.removeStatic(floor);
    ph.world.removeRigidBody(p.body);
    return { untagged, climb, hanging, shimmy, hoist, exhausted, lowCeiling, rope, blocked, dynamicBlock, cleanup };
  });
  console.log('adventure physics', r);
  expect(r.untagged).toBe('none');
  expect(r.climb.pos[1]).toBeGreaterThan(7.9);
  expect(r.climb.stamina).toBeLessThan(60);
  expect(r.hanging).toBe('hang');
  expect(r.shimmy.mode).toBe('hang');
  expect(Math.abs(r.shimmy.dx)).toBeGreaterThan(0.5);
  expect(Math.abs(r.shimmy.dz)).toBeLessThan(0.1);
  expect(r.hoist.y).toBeGreaterThan(8);
  expect(r.hoist.z).toBeLessThan(0);
  expect(r.exhausted.mode).toBe('none');
  expect(r.exhausted.vy).toBeLessThan(0);
  expect(r.lowCeiling.mode).toBe('hang');
  expect(r.lowCeiling.y).toBeLessThan(7);
  expect(r.rope.started).toBe(true);
  expect(r.rope.error).toBeLessThan(0.15);
  expect(r.blocked.z).toBeGreaterThan(6);
  expect(r.blocked.mode).toBe('none');
  expect(r.blocked.started).toBe(false);
  expect(r.dynamicBlock.started).toBe(true);
  expect(r.dynamicBlock.z).toBeGreaterThan(6);
  expect(r.dynamicBlock.mode).toBe('none');
  expect(r.cleanup.left).toBe(0);
  expect(r.cleanup.anchors).toBe(0);
});
