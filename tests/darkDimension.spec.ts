import { test, expect, boot, SLOW } from './fixtures';

test('tether progression is permanent, bounded, pauseable and resumable without refills', async ({ page }) => {
  await page.route('**/dark-audit.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/dark-audit.html');
  const r = await page.evaluate(async () => {
    const { Tether } = await import('/src/world/dark/tether.ts' as string);
    const flags: any = { 'way:glen': true },
      t = new Tether(flags);
    t.begin('glen', 128, -10);
    const base = t.capacity;
    t.tick(30, false);
    const spent = t.run.left;
    t.tick(90, true);
    const sheltered = t.run.left;
    t.discover('wheel', 'glen');
    const capacity = t.capacity,
      extended = t.run.left;
    const duplicate = t.discover('wheel', 'glen'),
      unchanged = t.run.left;
    t.discover('memory', 'first-impact');
    t.damage(20);
    const hurt = t.run.left;
    t.tick(-100, false);
    t.damage(NaN);
    t.sync();
    const copy = new Tether(JSON.parse(JSON.stringify(flags)));
    copy.restore();
    const restored = structuredClone(copy.run);
    copy.tick(9999, false);
    const exhausted = copy.run.left;
    copy.end();
    copy.restore();
    const ended = copy.run;
    const corrupt = new Tether({ darkRun: '{bad' });
    corrupt.restore();
    const huge = new Tether(Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`dark:wheel:${i}`, true])));
    const hit = new Tether({}),
      periodic = new Tether({});
    hit.begin('glen', 0, 0);
    periodic.begin('glen', 0, 0);
    hit.damage(20);
    for (let i = 0; i < 120; i++) periodic.damage(20 / 120);
    return {
      base,
      spent,
      sheltered,
      capacity,
      extended,
      duplicate,
      unchanged,
      hurt,
      restored,
      exhausted,
      ended,
      corrupt: corrupt.run,
      cap: huge.capacity,
      hit: hit.run.left,
      periodic: periodic.run.left,
    };
  });
  expect(r.base).toBe(98);
  expect(r.spent).toBe(68);
  expect(r.sheltered).toBe(68);
  expect(r.capacity).toBe(133);
  expect(r.extended).toBe(103);
  expect(r.duplicate).toBe(false);
  expect(r.unchanged).toBe(103);
  expect(r.hurt).toBe(116);
  expect(r.restored).toEqual({ entry: 'glen', x: 128, z: -10, left: 116 });
  expect(r.exhausted).toBe(0);
  expect(r.ended).toBeNull();
  expect(r.corrupt).toBeNull();
  expect(r.cap).toBe(900);
  expect(r.periodic).toBeCloseTo(r.hit, 8);
});

test('a real capsule passes beneath the severed ridge with independent collision and complete traversal cleanup', async ({ page }) => {
  await page.route('**/dark-geometry.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/dark-geometry.html');
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js' as string),
      P = await import('/src/physics/physics.ts' as string),
      W = await import('/src/world/dark/world.ts' as string),
      F = await import('/src/world/dark/tether.ts' as string),
      C = await import('/src/player/traversalSurfaces.ts' as string);
    const p = P.physics;
    await p.init();
    const R = p.R,
      scene = new T.Scene(),
      world = new W.DarkWorld(
        scene,
        {} as any,
        new F.Tether({}),
        () => {},
        () => {}
      );
    world.start([]);
    const start = world.at(-1250, -695, 0.1);
    world.warm(start);
    const livingWall = p.addBox(new T.Vector3(-1250, 0, -672), new T.Vector3(5, 30, 8));
    const rb = p.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + 0.9, start.z));
    const col = p.world.createCollider(R.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(P.groups(P.G_PLAYER, 0xffff)), rb),
      kcc = p.createCharacterController();
    p.step(1 / 60);
    const under = world.at(-1250, -672, 2),
      ceiling = p.castRay(under, new T.Vector3(0, 1, 0), 50);
    const tagsBefore = C.traversalSurfaceCount();
    let grounded = false;
    for (let i = 0; i < 480; i++) {
      const cur = rb.translation();
      kcc.computeColliderMovement(col, { x: 0, y: grounded ? -0.05 : -0.1, z: 0.1 }, R.QueryFilterFlags.EXCLUDE_SENSORS, P.STATIC_ONLY);
      const move = kcc.computedMovement();
      rb.setNextKinematicTranslation({ x: cur.x + move.x, y: cur.y + move.y, z: cur.z + move.z });
      p.step(1 / 60);
      grounded = kcc.computedGrounded();
    }
    const end = rb.translation(),
      travelled = end.z - start.z;
    const floorError = Math.abs(end.y - 0.9 - world.ground(end.x, end.z));
    p.world.removeRigidBody(rb);
    p.world.removeCharacterController(kcc);
    p.removeStatic(livingWall);
    world.dispose();
    return { ceiling, travelled, floorError, tagsBefore, tagsAfter: C.traversalSurfaceCount(), sceneChildren: scene.children.length, chunks: world.chunks.size };
  });
  expect(result.ceiling).toBeGreaterThan(15);
  expect(result.ceiling).toBeLessThan(40);
  expect(result.travelled).toBeGreaterThan(42);
  expect(result.floorError).toBeLessThan(0.5);
  expect(result.tagsBefore).toBeGreaterThan(50);
  expect(result.tagsAfter).toBe(0);
  expect(result.chunks).toBe(0);
  expect(result.sceneChildren).toBe(0);
});

test('Sunwheel crossings use independent terrain, health and tether, save a run, and safely recover on exhaustion and death', async ({ page }, info) => {
  test.setTimeout(800_000 * SLOW);
  const errors = await boot(page, '?test&save');
  const first = await page.evaluate(async () => {
    const g = (window as any).__game,
      H = await import('/src/world/terrainHeight.ts' as string),
      W = await import('/src/world/waterLevel.ts' as string),
      L = await import('/src/world/dark/land.ts' as string),
      P = await import('/src/player/traversalSurfaces.ts' as string);
    g.pause(true);
    g.sleep(true);
    g.dialogue.close();
    g.input.releaseAll();
    g.input.uiMode = false;
    g.story.reset();
    g.story.director.fast = true;
    const j = g.darkJourney,
      p = g.player,
      n = g.story.wheel.nodes().find((n: any) => n.id === 'glen');
    p.invulnerable = true;
    const origin = n.pos.clone().add(new g.THREE.Vector3(3.2, 0.4, 0));
    origin.y = H.heightAt(origin.x, origin.z) + 0.4;
    p.teleport(origin);
    const beforeSurfaces = P.traversalSurfaceCount();
    g.story.wheel.touch(n);
    const options = g.dialogue.options.map((o: any) => o.label);
    const option = g.dialogue.options.find((o: any) => o.label.includes('enter the Dark'));
    option?.run();
    const entered = j.active,
      hidden = !g.terrain.group.visible && !g.stylizedNature.group?.visible;
    const world = j.world;
    if (!world) return { entered, options };
    const initial = j.tether.run.left,
      capacity = j.tether.capacity;
    g.stepSim(60);
    const atWheel = j.tether.run.left;
    const go = (x: number, z: number) => {
      g.dialogue.close();
      g.input.uiMode = false;
      g.input.releaseAll();
      p.act = null;
      p.clearCombatInput();
      const at = world.at(x, z, 0.5);
      world.warm(at);
      p.teleport(at);
    };
    (window as any).DG = { g, j, H, W, L, P, go, origin, beforeSurfaces };
    go(112, -45);
    const start = p.pos.clone(),
      hp = p.hp;
    g.cam.yaw = 0;
    g.input.down.add('KeyW');
    g.stepSim(90);
    g.input.releaseAll();
    const walked = p.pos.distanceTo(start),
      spent = atWheel - j.tether.run.left;
    const ground = world.ground(p.pos.x, p.pos.z),
      support = Math.abs(p.pos.y - ground),
      swimming = p.swimming,
      water = W.waterSurfaceAt(p.pos.x, p.pos.z);
    const rayOrigin = p.pos.clone().add(new g.THREE.Vector3(0, 20, 0)),
      ray = g.physics.castRay(rayOrigin, new g.THREE.Vector3(0, -1, 0), 45);
    const left = j.tether.run.left;
    p.invulnerable = false;
    p.applyDamage(10);
    p.invulnerable = true;
    const damaged = { hp: hp - p.hp, tether: left - j.tether.run.left };
    const beforePause = j.tether.run.left;
    g.input.uiMode = true;
    g.stepSim(30);
    g.input.uiMode = false;
    const pauseLoss = beforePause - j.tether.run.left;
    j.view.toggleMap(true);
    j.frame();
    const chart = j.view.open;
    j.view.toggleMap(false);
    // A physical crossing, with real destination overlap checks. It crosses
    // the palisade's logical line without removing any living colliders.
    const farWheel = g.story.wheel.nodes().find((n: any) => n.id === 'dawn-glen');
    go(farWheel.pos.x + 3.2, farWheel.pos.z);
    g.stepSim(1);
    const obstruction = g.physics.addBox(farWheel.pos.clone().add(new g.THREE.Vector3(0, 5, 0)), new g.THREE.Vector3(16, 5, 16));
    const refusedObstructed = !j.emerge(farWheel.id) && j.active;
    g.physics.removeStatic(obstruction);
    const crossed = j.emerge(farWheel.id),
      emerged = [p.pos.x, p.pos.y, p.pos.z],
      aliveWorld = g.terrain.group.visible;
    const leftDark = !j.active,
      cleaned = world.chunks.size === 0 && world.foes.size === 0;
    // Re-enter, move past the old 230m mirror boundary and collect a memory.
    p.teleport(farWheel.pos.clone().add(new g.THREE.Vector3(3.2, 0.4, 0)));
    const reentry = j.enter(farWheel.id);
    const current = j.world,
      s = L.SCARS.find((s: any) => s.id === 'first-impact');
    const at = current.at(s.x + s.r * 0.84, s.z, 0.4);
    current.warm(at);
    p.teleport(at);
    g.input.uiMode = false;
    g.stepSim(1);
    const sentinels = [...current.foes.values()] as any[];
    await Promise.all(sentinels.map((f) => f.ready));
    g.stepSim(150);
    const sentinelReady = sentinels.some((f) => f.risen && f.alive);
    const firstSentinel = [...current.foes.entries()][0] as any;
    if (firstSentinel)
      firstSentinel[1].takeHit({ damage: 99999, poise: 100, dir: new g.THREE.Vector3(1, 0, 0), at: firstSentinel[1].center.clone(), crit: false, source: 'melee' });
    g.stepSim(1);
    const sentinelSlain = firstSentinel ? !!g.worldFlags['dark:slain:' + firstSentinel[0]] : false;
    const memory = current.actions.find((a: any) => a.label().includes('Ancient memory') && a.pos.distanceTo(at) < 5);
    const capBefore = j.tether.capacity;
    memory.action();
    const memoryGain = j.tether.capacity - capBefore;
    g.dialogue.close();
    memory.action();
    g.dialogue.close();
    const duplicateGain = j.tether.capacity - capBefore;
    current.warm(current.at(700, 20, 0.4));
    p.teleport(current.at(700, 20, 0.4));
    g.input.uiMode = false;
    g.stepSim(1);
    const unbounded = Math.abs(p.pos.x - L.DARK_X - 700) < 2;
    // Preserve height when saving on a boulder above the heightfield.
    const top = p.pos.clone().add(new g.THREE.Vector3(0, 80, 0));
    const drop = g.physics.castRay(top, new g.THREE.Vector3(0, -1, 0), 160);
    if (drop !== null) p.teleport(top.add(new g.THREE.Vector3(0, -drop + 0.35, 0)));
    // Make the saved health meaningfully lower than maximum, after kill rewards.
    p.invulnerable = false;
    p.applyDamage(10);
    p.invulnerable = true;
    j.tether.run.left = 47.25;
    j.sync();
    g.save();
    j.frame();
    g.player.present(1, 0.016);
    g.cam.snapTo(p.pos);
    g.cam.update(0.016, p.pos, false);
    g.r.followShadow(p.pos);
    g.r.render(0.016);
    return {
      entered,
      options,
      hidden,
      initial,
      capacity,
      atWheel,
      walked,
      spent,
      support,
      swimming,
      water,
      ray,
      damaged,
      pauseLoss,
      chart,
      refusedObstructed,
      crossed,
      emerged,
      aliveWorld,
      leftDark,
      cleaned,
      reentry,
      memoryGain,
      duplicateGain,
      sentinelReady,
      sentinelSlain,
      unbounded,
      savedLeft: j.tether.run.left,
      savedY: p.pos.y,
      savedHp: p.hp,
      missingHp: p.maxHp - p.hp,
    };
  });
  expect(first.entered).toBe(true);
  expect(first.options?.some((s: string) => s.includes('enter the Dark'))).toBe(true);
  expect(first.initial).toBe(first.capacity);
  expect(first.atWheel).toBe(first.initial);
  expect(first.walked).toBeGreaterThan(2);
  expect(first.spent).toBeGreaterThan(1);
  expect(first.support).toBeLessThan(1.4);
  expect(first.swimming).toBe(false);
  expect(first.water).toBeNull();
  expect(first.ray).not.toBeNull();
  expect(first.damaged!.hp).toBeGreaterThan(0);
  expect(first.damaged!.tether).toBeGreaterThan(2);
  expect(first.pauseLoss).toBe(0);
  expect(first.chart).toBe(true);
  expect(first.refusedObstructed).toBe(true);
  expect(first.crossed).toBe(true);
  expect(first.emerged![0]).toBeLessThan(-110);
  expect(first.aliveWorld).toBe(true);
  expect(first.leftDark).toBe(true);
  expect(first.cleaned).toBe(true);
  expect(first.reentry).toBe(true);
  expect(first.memoryGain).toBe(18);
  expect(first.duplicateGain).toBe(18);
  expect(first.sentinelReady).toBe(true);
  expect(first.sentinelSlain).toBe(true);
  expect(first.unbounded).toBe(true);
  expect(first.missingHp).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('dark-landscape.png') });
  await page.evaluate(async () => {
    const g = (window as any).__game,
      j = g.darkJourney,
      L = await import('/src/world/dark/land.ts' as string);
    (window as any).darkShot = { pos: g.player.pos.clone(), camera: g.r.camera.position.clone(), rotation: g.r.camera.quaternion.clone() };
    const s = L.SCARS[0],
      at = j.world.at(s.x + s.r * 1.15, s.z, 0.5);
    j.world.warm(at);
    g.player.teleport(at);
    g.player.present(1, 0);
    g.r.camera.position.copy(at).add(new g.THREE.Vector3(35, 42, 48));
    g.r.camera.lookAt(j.world.at(s.x, s.z, 4));
    g.r.followShadow(at);
    j.frame();
    g.r.render(0.016);
  });
  await page.screenshot({ path: info.outputPath('dark-first-wound.png') });
  await page.evaluate(() => {
    const j = (window as any).__game.darkJourney;
    j.view.toggleMap(true);
    j.frame();
  });
  await page.screenshot({ path: info.outputPath('dark-chart.png') });
  await page.evaluate(() => {
    const g = (window as any).__game,
      s = (window as any).darkShot;
    g.darkJourney.view.toggleMap(false);
    g.darkJourney.world.warm(s.pos);
    g.player.teleport(s.pos);
    g.player.present(1, 0);
    g.r.camera.position.copy(s.camera);
    g.r.camera.quaternion.copy(s.rotation);
    g.darkJourney.sync();
    g.save();
  });
  // Freeze as soon as reload finishes booting. Software rendering can otherwise
  // run several legitimate seconds before Playwright gets its next turn.
  await page.addInitScript(() => {
    let current: any;
    Object.defineProperty(window, '__game', {
      configurable: true,
      get: () => current,
      set: (value) => {
        current = value;
        value.pause(true);
        value.sleep(true);
      },
    });
  });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 240_000 * SLOW });
  const recovery = await page.evaluate(async () => {
    const g = (window as any).__game,
      j = g.darkJourney,
      L = await import('/src/world/dark/land.ts' as string);
    g.pause(true);
    g.sleep(true);
    g.input.releaseAll();
    g.dialogue.close();
    g.input.uiMode = false;
    const resumed = j.active,
      left = j.tether.run?.left,
      resumeX = g.player.pos.x - L.DARK_X,
      resumeY = g.player.pos.y,
      memory = !!g.worldFlags['dark:memory:first-impact'];
    if (!j.active) return { resumed, left, resumeX, resumeY, memory };
    g.player.invulnerable = true;
    const hp = g.player.hp,
      w = j.world;
    j.tether.run.left = 0.01;
    j.update(0.02);
    const exhausted = !j.active && g.realm.mode === 'overworld',
      exhaustedHp = g.player.hp,
      x = g.player.pos.x;
    const cleanup = w.chunks.size === 0 && w.foes.size === 0;
    const n = g.story.wheel.nodes().find((n: any) => n.id === 'dawn-glen');
    const enteredAgain = j.enter(n.id);
    g.player.invulnerable = false;
    g.player.applyDamage(99999);
    const dead = g.player.dead,
      recovered = j.recoverDeath(),
      deathReturned = !g.player.dead && !j.active && g.realm.mode === 'overworld';
    const stale = j.enter('aurelle');
    const livingAt = g.player.pos.clone();
    const exitAudit = g.story.wheel
      .nodes()
      .filter((n: any) => n.id === 'dawn-forest' || n.id === 'dawn-east' || n.id.startsWith('dawn-isle-'))
      .map((n: any) => ({ id: n.id, clear: !!j.safeLiving(n) }));
    const noPrematureTravel = g.player.pos.distanceTo(livingAt) < 0.01;
    g.player.teleport(livingAt);
    g.archipelagos.update(0, true);
    g.elves.warm();
    return { resumed, left, resumeX, resumeY, memory, exhausted, hp, exhaustedHp, x, cleanup, enteredAgain, dead, recovered, deathReturned, stale, exitAudit, noPrematureTravel };
  });
  expect(recovery.resumed).toBe(true);
  expect(recovery.left).toBeGreaterThan(40);
  expect(recovery.left).toBeLessThanOrEqual(47.25);
  expect(recovery.resumeX).toBeCloseTo(700, 0);
  expect(recovery.resumeY).toBeCloseTo(first.savedY!, 0);
  expect(recovery.memory).toBe(true);
  expect(recovery.exhausted).toBe(true);
  expect(recovery.exhaustedHp).toBe(recovery.hp);
  expect(recovery.hp).toBeCloseTo(first.savedHp!, 1);
  expect(recovery.x).toBeLessThan(0);
  expect(recovery.cleanup).toBe(true);
  expect(recovery.enteredAgain).toBe(true);
  expect(recovery.dead).toBe(true);
  expect(recovery.recovered).toBe(true);
  expect(recovery.deathReturned).toBe(true);
  expect(recovery.stale).toBe(false);
  expect(recovery.exitAudit).toHaveLength(6);
  expect(recovery.exitAudit?.filter((r: any) => !r.clear)).toEqual([]);
  expect(recovery.noPrematureTravel).toBe(true);
  expect(errors).toEqual([]);
});
