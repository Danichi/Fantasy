import { test, expect, boot, SLOW } from './fixtures';
test('expanded combat: explicit weapon branches, every learned technique, modifier routing, library and saved shortcuts', async ({ page }, info) => {
  test.setTimeout(600_000 * SLOW);
  const errors = await boot(page, '?test&sandbox&save');
  await page.evaluate(async () => {
    const g = (window as any).__game;
    g.sandbox.openControls(false);
    g.pause(true);
    g.sleep(true);
    g.sandbox.settings.enemyAI = false;
    g.sandbox.settings.unlimited = false;
    g.sandbox.settings.immortal = true;
    g.sandbox.settings.scenario = 'dummy';
    g.sandbox.resetFight();
    const B = await import('/src/sandbox/hero.ts' as string);
    B.sandboxBuild(g.player, 'gale', 'pyromancer');
    g.skillRt.reset();
    g.techniques.invalidate();
    g.player.act = null;
    g.player.lock = null;
    g.player.blocking = false;
    g.input.releaseAll();
    g.input.uiMode = false;
    const target = g.sandbox.actors[0];
    g.player.teleport(target.position.clone().add(new g.THREE.Vector3(0, 0.1, 5)));
    g.player.yaw = g.cam.yaw = Math.PI;
    g.stepSim(20);
  });
  const weapon = await page.evaluate(async () => {
    const g = (window as any).__game,
      p = g.player,
      i = g.input;
    const reset = () => {
      i.releaseAll();
      p.act = null;
      p.stamina = p.maxStamina;
      p.blocking = false;
      p.lock = null;
      p.sprinting = false;
      p.clearCombatInput();
      g.stepSim(2);
    };
    reset();
    i.press('KeyW');
    i.press('Mouse0');
    g.stepSim();
    const movingLight = p.act?.def.id;
    reset();
    i.press('Mouse0');
    g.stepSim(25);
    const heldLight = p.act?.def.id;
    i.releaseAll();
    reset();
    i.press('KeyR');
    g.stepSim();
    const heavy = p.act?.def.id;
    for (let n = 0; n < 90 && !p.act?.charging; n++) g.stepSim();
    const charging = !!p.act?.charging;
    g.stepSim(60);
    const tier = p.act?.tier;
    i.releaseAll();
    g.stepSim(3);
    const released = p.act?.released;
    reset();
    i.press('Mouse0');
    g.stepSim();
    i.release('Mouse0');
    const a = p.act;
    a.t = a.def.combo.from - 0.08;
    i.press('KeyR');
    g.stepSim();
    const before = p.act.def.id;
    g.stepSim(8);
    const branch = p.act.def.id;
    i.releaseAll();
    const B = await import('/src/sandbox/hero.ts' as string);
    B.sandboxBuild(p, 'boundary', 'pyromancer', true);
    g.skillRt.reset();
    reset();
    i.press('Mouse2');
    i.press('KeyW');
    i.press('KeyR');
    g.stepSim();
    const shieldDrive = p.act?.def.id;
    B.sandboxBuild(p, 'gale', 'pyromancer', true);
    g.skillRt.reset();
    reset();
    p.riposteT = 0.5;
    void p.combatGuide;
    const previewCounter = p.riposteT;
    p.riposteT = 0;
    reset();
    p.vel.y = 4;
    p.grounded = false;
    i.press('KeyR');
    g.stepSim();
    const plunge = p.act?.def.id;
    i.releaseAll();
    reset();
    p.vel.y = 4;
    p.grounded = false;
    i.press('Mouse0');
    g.stepSim();
    const airLight = p.act?.def.id;
    i.releaseAll();
    p.act = null;
    return { heldLight, heavy, charging, tier, released, before, branch, plunge, airLight, movingLight, shieldDrive, previewCounter };
  });
  console.log('weapon grammar', weapon);
  expect(weapon.heldLight).toBe('slash1');
  expect(weapon.movingLight).not.toBe('dashStrike');
  expect(weapon.heavy).toBe('heavy');
  expect(weapon.charging).toBe(true);
  expect(weapon.tier).toBe(3);
  expect(weapon.released).toBe(true);
  expect(weapon.before).toBe('slash1');
  expect(weapon.branch).toBe('link1');
  expect(weapon.plunge).toBe('airAttack');
  expect(weapon.airLight).toBe('airSlash1');
  expect(weapon.shieldDrive).toBe('shieldPush');
  expect(weapon.previewCounter).toBe(0.5);
  const techniques = await page.evaluate(async () => {
    const g = (window as any).__game,
      p = g.player,
      m = g.techniques;
    g.input.releaseAll();
    p.act = null;
    p.clearCombatInput();
    p.vel.set(0, 0, 0);
    g.stepSim(100);
    g.skillRt.reset();
    p.stamina = p.maxStamina;
    p.mana = p.maxMana;
    const entries = m.entries,
      extra = entries.find((e: any) => e.discipline === 'pyromancer' && !p.equip.moves.includes(e.ref) && !e.def.needTarget && e.def.freeAim && !e.def.needHeat);
    const chosen = extra ?? entries.find((e: any) => e.discipline === 'pyromancer' && !p.equip.moves.includes(e.ref) && !m.blocked(e));
    if (!chosen) throw Error('No unslotted learned technique available');
    m.selectSchool(chosen.discipline);
    m.assign('light', chosen.ref);
    g.input.press('KeyT');
    g.input.press('Mouse0');
    g.stepSim();
    const routed = { id: p.act?.def.id, mana: p.mana, cooldown: m.cooldown(chosen), weapon: p.act?.def.id === 'slash1', name: chosen.name, ref: chosen.ref };
    g.input.releaseAll();
    const second = m.request(chosen.ref);
    const sameMana = p.mana;
    p.act = null;
    p.clearCombatInput();
    g.skillRt.reset();
    p.mana = 0;
    const poor = m.request(chosen.ref);
    const poorAction = p.act?.def.id ?? null;
    p.mana = p.maxMana;
    const bound = m.bindKey('Digit9', chosen.ref),
      reserved = m.bindKey('KeyW', chosen.ref);
    g.input.press('Digit9');
    g.stepSim();
    const direct = p.act?.def.id;
    g.input.releaseAll();
    const profile = structuredClone(p.equip.techniques.bindings),
      gestures = [];
    for (const [slot, code] of [
      ['light', 'Mouse0'],
      ['heavy', 'KeyR'],
      ['dodge', 'Space'],
      ['guard', 'Mouse2'],
    ]) {
      p.act = null;
      p.clearCombatInput();
      g.skillRt.reset();
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
      m.reset();
      m.assign(slot, chosen.ref);
      g.input.press('KeyT');
      g.input.press(code);
      g.stepSim();
      gestures.push({ slot, id: p.act?.def.id, blocking: p.blocking });
      g.input.releaseAll();
    }
    p.equip.techniques.bindings = profile;
    p.act = null;
    p.clearCombatInput();
    g.skillRt.reset();
    p.mana = p.maxMana;
    m.reset();
    g.input.press('Mouse0');
    g.stepSim();
    g.input.releaseAll();
    p.act.t = p.act.def.cancel - 0.08;
    const queued = m.request(chosen.ref),
      queuedBefore = p.act.def.id;
    g.stepSim(12);
    const queuedAfter = p.act?.def.id;
    g.input.releaseAll();
    const B = await import('/src/sandbox/hero.ts' as string);
    m.selectSchool('gale');
    B.sandboxBuild(p, 'boundary', 'pyromancer', true);
    m.invalidate();
    const followsClass = m.discipline === 'boundary';
    B.sandboxBuild(p, 'gale', 'pyromancer', true);
    g.skillRt.reset();
    m.invalidate();
    m.selectSchool(chosen.discipline);
    const { buildSave, applySave } = await import('/src/save.ts' as string);
    const data = buildSave(p, 123, {}, { floors: {}, keys: [], opened: [], floor: 1 } as any, g.guild?.state ?? ({} as any));
    const stored = JSON.stringify(data.techniques);
    applySave(p, data);
    m.invalidate();
    const restored = JSON.stringify(p.equip.techniques) === stored;
    const old = { ...data };
    delete old.techniques;
    applySave(p, old);
    const legacy = p.equip.techniques.discipline === '' && Object.keys(p.equip.techniques.shortcuts).length === 0;
    applySave(p, data);
    m.invalidate();
    p.act = null;
    p.clearCombatInput();
    g.skillRt.reset();
    p.stamina = p.maxStamina;
    p.mana = p.maxMana;
    g.input.uiMode = false;
    g.stepSim(30);
    g.pause(true);
    g.sleep(true);
    g.techniqueLibrary.update(1);
    return {
      count: entries.length,
      unslotted: !data.moves.includes(chosen.ref),
      routed,
      second,
      sameMana,
      poor,
      poorAction,
      bound,
      reserved,
      direct,
      restored,
      legacy,
      gestures,
      followsClass,
      queued,
      queuedBefore,
      queuedAfter,
    };
  });
  console.log('technique routes', techniques);
  expect(techniques.count).toBeGreaterThan(12);
  expect(techniques.unslotted).toBe(true);
  expect(techniques.routed.weapon).toBe(false);
  expect(techniques.routed.id).toMatch(/^sk_/);
  expect(techniques.routed.cooldown).toBeGreaterThan(0);
  expect(techniques.second).toBe(false);
  expect(techniques.sameMana).toBe(techniques.routed.mana);
  expect(techniques.poor).toBe(false);
  expect(techniques.poorAction).toBeNull();
  expect(techniques.bound).toBe(true);
  expect(techniques.reserved).toBe(false);
  expect(techniques.direct).toMatch(/^sk_/);
  for (const gesture of techniques.gestures) {
    expect(gesture.id).toMatch(/^sk_/);
    expect(gesture.blocking).toBe(false);
  }
  expect(techniques.followsClass).toBe(true);
  expect(techniques.queued).toBe(true);
  expect(techniques.queuedBefore).toBe('slash1');
  expect(techniques.queuedAfter).toMatch(/^sk_/);
  expect(techniques.restored).toBe(true);
  expect(techniques.legacy).toBe(true);
  await page.evaluate(() => (window as any).__game.pause(false));
  await page.keyboard.press('u');
  await expect(page.getByRole('dialog', { name: 'Everything you have learned' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.techniqueLibrary.timeScale)).toBe(0.15);
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.locator('.tl-count')).toHaveText('2 / 2');
  await expect(page.locator('.tl-wheel button[aria-pressed=true]')).toHaveCount(1);
  await page.getByRole('button', { name: '← Previous', exact: true }).click();
  await expect(page.locator('.tl-wheel button[aria-pressed=true]')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search learned techniques' }).fill('no-such-move');
  await expect(page.locator('.tl-empty')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await expect(page.locator('.tl-wheel [data-ref]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Bind a direct key…' }).click();
  await page.keyboard.press('0');
  await expect(page.locator('.tl-binding')).toContainText('Bound 0');
  await page.screenshot({ path: info.outputPath('technique-library.png') });
  await page.getByRole('button', { name: 'Use · Enter', exact: true }).click();
  await expect(page.locator('.technique-library')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.player.act?.def.id)).toMatch(/^sk_/);
  await page.keyboard.press('u');
  await expect(page.locator('.technique-library')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.technique-library')).toBeHidden();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.input.press('KeyT');
    g.stepSim();
    g.techniqueLibrary.update(1);
  });
  await expect(page.locator('.cig-techniques')).toBeVisible();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.input.releaseAll();
    g.stepSim();
    g.techniqueLibrary.update(1);
    g.events.emit('telegraph', { target: g.sandbox.actors[0], kind: 'heavy' });
    g.hud.update(0);
  });
  await expect(page.locator('.combat-tell')).toHaveCount(0);
  await expect(page.locator('.combat-input-guide')).toBeVisible();
  await page.screenshot({ path: info.outputPath('combat-input-guide.png') });
  expect(errors).toEqual([]);
});
