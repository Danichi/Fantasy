import { test, expect, boot, SLOW } from './fixtures';

test('native player climbs the practice wall, glides, grapples with E and cleans up practice anchors', async ({ page }, info) => {
  test.setTimeout(600_000 * SLOW);
  const errors = await boot(page, '?test&sandbox&save');
  await page.evaluate(() => {
    const g = (window as any).__game,
      p = g.player;
    g.sandbox.openControls(false);
    g.pause(true);
    g.sleep(true);
    g.sandbox.settings.enemyAI = false;
    g.sandbox.settings.unlimited = false;
    g.sandbox.settings.immortal = true;
    g.sandbox.settings.scenario = 'dummy';
    g.sandbox.resetFight();
    g.input.releaseAll();
    g.input.uiMode = false;
    p.act = null;
    p.lock = null;
    p.blocking = false;
    p.clearCombatInput();
    p.fieldGlide = () => false;
    p.fieldAirJumps = () => 0;
    p.teleport(g.realm.interior.at(-22, 10, 0.06));
    p.yaw = g.cam.yaw = Math.PI;
    g.stepSim(25);
  });
  const climb = await page.evaluate(() => {
    const g = (window as any).__game,
      p = g.player,
      i = g.input,
      base = g.realm.interior.at(0, 0).y;
    p.stamina = p.maxStamina;
    g.cam.lockTarget = g.sandbox.actors[0].center;
    i.press('KeyE');
    i.press('KeyW');
    g.stepSim();
    i.release('KeyE');
    const started = p.adventure.mode;
    g.stepSim(80);
    i.press('KeyR');
    g.stepSim();
    i.release('KeyR');
    const combatSuppressed = !p.act && p.adventure.mode === 'climb';
    const main = p.equip.equipped.main,
      bow = p.equip.items.find((item: any) => item.def.kind === 'bow');
    p.equip.equip(bow.uid, 'main');
    i.press('Mouse2');
    g.stepSim(3);
    i.release('Mouse2');
    const bowSuppressed = !p.aiming && !g.arms.ranged.aiming;
    p.equip.equip(main, 'main');
    const midway = p.pos.y - base;
    // Freeze here for a rendered inspection of the real climbing pose.
    p.present(1, 0);
    g.r.camera.position.copy(p.pos).add(new g.THREE.Vector3(3, 2, 6));
    g.r.camera.lookAt(p.pos.clone().add(new g.THREE.Vector3(0, 1.2, 0)));
    g.r.camera.updateMatrixWorld();
    g.techniqueLibrary.update(0.2);
    g.traversalView.update(0.2, true);
    g.r.render(0.016);
    return { started, midway, base, stamina: p.maxStamina, combatSuppressed, bowSuppressed, cameraUnlocked: !g.cam.lockTarget, combatGuideHidden: g.techniqueLibrary.guide.hidden };
  });
  console.log('native climb start', climb);
  expect(climb.started).toBe('climb');
  expect(climb.midway).toBeGreaterThan(1.5);
  expect(climb.combatSuppressed).toBe(true);
  expect(climb.bowSuppressed).toBe(true);
  expect(climb.cameraUnlocked).toBe(true);
  expect(climb.combatGuideHidden).toBe(true);
  await page.screenshot({ path: info.outputPath('climbing.png') });
  const top = await page.evaluate(() => {
    const g = (window as any).__game,
      p = g.player;
    let n = 0;
    while ((p.adventure.busy || p.pos.y < g.realm.interior.at(0, 0).y + 7.9) && n++ < 450) g.stepSim();
    g.input.releaseAll();
    return { y: p.pos.y - g.realm.interior.at(0, 0).y, mode: p.adventure.mode, stamina: p.stamina, n };
  });
  console.log('native climb top', top);
  expect(top.y).toBeGreaterThan(7.9);
  expect(top.mode).toBe('none');
  expect(top.stamina).toBeLessThan(climb.stamina - 30);

  const glide = await page.evaluate(() => {
    const g = (window as any).__game,
      p = g.player,
      i = g.input,
      it = g.realm.interior;
    p.teleport(it.at(-5, 10, 22));
    p.act = null;
    p.clearCombatInput();
    p.grounded = false;
    p.vel.set(0, -2, 0);
    p.stamina = p.maxStamina;
    const start = p.pos.clone(),
      stamina = p.stamina;
    p.yaw = g.cam.yaw = Math.PI;
    i.press('KeyC');
    g.stepSim(120);
    p.present(1, 0);
    g.r.camera.position.copy(p.pos).add(new g.THREE.Vector3(4, 2, 7));
    g.r.camera.lookAt(p.pos.clone().add(new g.THREE.Vector3(0, 1.2, 0)));
    g.r.camera.updateMatrixWorld();
    g.techniqueLibrary.update(0.2);
    g.traversalView.update(0.2, true);
    g.r.render(0.016);
    return {
      mode: p.adventure.mode,
      dy: p.pos.y - start.y,
      distance: Math.hypot(p.pos.x - start.x, p.pos.z - start.z),
      vy: p.vel.y,
      spent: stamina - p.stamina,
      wing: g.traversalView.wing.visible,
      panel: g.traversalView.panel.textContent,
    };
  });
  console.log('native glide', glide);
  expect(glide.mode).toBe('glide');
  expect(glide.dy).toBeGreaterThan(-7);
  expect(glide.distance).toBeGreaterThan(8);
  expect(glide.vy).toBeGreaterThanOrEqual(-2.61);
  expect(glide.spent).toBeGreaterThan(8);
  expect(glide.wing).toBe(true);
  expect(glide.panel).toContain('Hold C');
  await page.screenshot({ path: info.outputPath('gliding.png') });
  const folds = await page.evaluate(() => {
    const g = (window as any).__game,
      p = g.player,
      i = g.input;
    i.releaseAll();
    g.stepSim(3);
    const released = p.adventure.mode;
    i.press('KeyC');
    g.stepSim(2);
    const reopen = p.adventure.mode;
    i.press('Mouse0');
    g.stepSim();
    const attacking = { mode: p.adventure.mode, attack: !!p.act };
    i.releaseAll();
    p.act = null;
    p.clearCombatInput();
    p.teleport(g.realm.interior.at(-5, 10, 22));
    p.grounded = false;
    p.vel.y = -2;
    p.fieldGlide = () => true;
    p.stamina = 0;
    p.staminaDelay = 10;
    i.press('KeyC');
    g.stepSim(60);
    const magic = { mode: p.adventure.mode, stamina: p.stamina, vy: p.vel.y };
    i.releaseAll();
    p.fieldGlide = () => false;
    return { released, reopen, attacking, magic };
  });
  console.log('folds', folds);
  expect(folds.released).toBe('none');
  expect(folds.reopen).toBe('glide');
  expect(folds.attacking.mode).toBe('none');
  expect(folds.attacking.attack).toBe(true);
  expect(folds.magic.mode).toBe('glide');
  expect(folds.magic.vy).toBeGreaterThanOrEqual(-1.81);
  expect(folds.magic.stamina).toBe(0);

  const rope = await page.evaluate(async () => {
    const g = (window as any).__game,
      p = g.player,
      i = g.input;
    const S = await import('/src/player/traversalSurfaces.ts' as string);
    const anchor = S.grappleAnchors.get('practice:upper')!;
    p.teleport(g.realm.interior.at(-22, 16, 0.06));
    p.act = null;
    p.clearCombatInput();
    p.stamina = p.maxStamina;
    p.yaw = g.cam.yaw = Math.PI;
    g.stepSim(25);
    g.r.camera.position.copy(p.pos).add(new g.THREE.Vector3(0, 2.3, 5));
    g.r.camera.lookAt(anchor.point);
    g.r.camera.updateMatrixWorld();
    let teleports = 0;
    const original = p.onTeleport;
    p.onTeleport = () => {
      teleports++;
    };
    i.press('KeyE');
    g.stepSim();
    i.releaseAll();
    const started = p.adventure.mode;
    let steps = 0;
    while (p.adventure.busy && steps++ < 180) g.stepSim();
    p.onTeleport = original;
    return { started, mode: p.adventure.mode, error: p.pos.distanceTo(anchor.landing), teleports, notice: p.adventure.notice };
  });
  console.log('native rope', rope);
  expect(rope.started).toBe('rope');
  expect(rope.error).toBeLessThan(0.2);
  expect(rope.teleports).toBe(0);
  expect(rope.mode).toBe('none');
  const cleanup = await page.evaluate(async () => {
    const g = (window as any).__game,
      S = await import('/src/player/traversalSurfaces.ts' as string);
    const before = { tags: S.traversalSurfaceCount(), anchors: S.grappleAnchors.size, bodies: g.physics.world.bodies.len() };
    for (let n = 0; n < 3; n++) g.sandbox.props.reset();
    const after = { tags: S.traversalSurfaceCount(), anchors: S.grappleAnchors.size, bodies: g.physics.world.bodies.len() };
    g.sandbox.props.reset(false);
    return { before, after, practiceLeft: [...S.grappleAnchors.keys()].filter((id) => id.startsWith('practice:')).length };
  });
  expect(cleanup.after).toEqual(cleanup.before);
  expect(cleanup.practiceLeft).toBe(0);
  expect(errors).toEqual([]);
});
