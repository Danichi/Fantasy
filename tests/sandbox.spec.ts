import { test, expect, boot, SLOW } from './fixtures';

test('Sandbox is a maxed combat session with isolated saves, working targets and repeatable resets', async ({ page }) => {
  test.setTimeout(480_000 * SLOW);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sandbox-seeded')) return;
    sessionStorage.setItem('sandbox-seeded', '1');
    sessionStorage.setItem('fresh', '1');
    localStorage.removeItem('fantasy-rpg-sandbox-v1');
    localStorage.removeItem('fantasy-rpg-sandbox-settings-v1');
    localStorage.setItem('fantasy-rpg-save-v6', 'adventure-sentinel');
    localStorage.setItem(
      'fantasy-rpg-slots',
      JSON.stringify({
        active: '3',
        slots: [
          { id: '1', name: 'Original', created: 1 },
          { id: '3', name: 'Adventure', created: 1 },
        ],
      }),
    );
    localStorage.setItem('fantasy-rpg-save-v6:3', 'slot-three-sentinel');
  });
  const errors = await boot(page, '?test&sandbox&save&quality=low');
  const initial = await page.evaluate(async () => {
    const g = (window as any).__game;
    const { DISCIPLINES } = await import('/src/paths/data.ts' as string);
    const { capOf } = await import('/src/paths/paths.ts' as string);
    return {
      mode: g.realm.mode,
      kind: g.realm.interior?.kind,
      sandbox: !!g.sandbox,
      all: DISCIPLINES.filter((d: any) => d.fam === 'combat').every((d: any) => g.player.paths.level(d.id) === capOf(d.id)),
      moves: g.player.equip.moves.filter(Boolean).length,
      targets: g.sandbox.actors.length,
      normal: localStorage.getItem('fantasy-rpg-save-v6:3'),
      index: localStorage.getItem('fantasy-rpg-slots'),
    };
  });
  expect(initial).toMatchObject({ mode: 'interior', kind: 'sandbox', sandbox: true, all: true, targets: 1, normal: 'slot-three-sentinel' });
  expect(initial.moves).toBeGreaterThan(0);
  const swing = await page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sandbox,
      t = s.actors[0];
    g.player.teleport(t.position.clone().add(new g.THREE.Vector3(0, 0.1, 1.6)));
    g.player.yaw = Math.PI;
    g.cam.yaw = Math.PI;
    g.player.lock = t;
    const advance = (n: number) => {
      for (let i = 0; i < n; i++) {
        g.stepSim();
        g.player.present(1, 1 / 60);
      }
    };
    advance(20);
    g.input.press('Mouse0');
    advance(4);
    g.input.release('Mouse0');
    advance(90);
    return { hits: s.metrics.hits, damage: s.metrics.damage };
  });
  expect(swing.hits).toBeGreaterThan(0);
  expect(swing.damage).toBeGreaterThan(0);
  await page.keyboard.press('F6');
  await expect(page.getByRole('dialog', { name: 'Sandbox controls' })).toBeVisible();
  await page.locator('[data-setting="combat"]').selectOption('cross');
  await page.locator('[data-setting="magic"]').selectOption('pyromancer');
  await page.locator('[data-setting="targetHp"]').fill('25000');
  await page.locator('[data-setting="targetHp"]').dispatchEvent('change');
  await page.locator('[data-setting="scenario"]').selectOption('melee');
  await page.getByRole('button', { name: 'Resume · F6 / Esc' }).click();
  const fight = await page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sandbox,
      T = g.THREE;
    const enemy = s.actors[0];
    const hp = enemy.hp;
    enemy.takeHit({ damage: 500, poise: 100, dir: new T.Vector3(0, 0, -1), at: enemy.center.clone(), crit: false, source: 'melee' });
    g.stepSim(120);
    return {
      hp,
      after: enemy.hp,
      active: g.player.paths.active,
      magic: g.player.paths.level('pyromancer'),
      hits: s.metrics.hits,
      targets: s.actors.length,
      finite: g.player.pos.toArray().every(Number.isFinite),
    };
  });
  expect(fight).toMatchObject({ hp: 25000, active: 'cross', magic: 50, targets: 1, finite: true });
  expect(fight.after).toBeLessThan(fight.hp);
  expect(await page.evaluate(() => (window as any).__game.player.equip.dualWield)).toBe(true);
  expect(fight.hits).toBeGreaterThan(0);
  const spell = await page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sandbox,
      t = s.actors[0];
    g.player.teleport(t.position.clone().add(new g.THREE.Vector3(0, 0.1, 5)));
    g.player.lock = t;
    g.player.yaw = Math.PI;
    g.cam.yaw = Math.PI;
    g.stepSim(10);
    const hp = t.hp,
      why = g.skillRt.use('skill:pyromancer:c');
    g.stepSim(180);
    return { why, hp, after: t.hp };
  });
  expect(spell.why).toBeNull();
  expect(spell.after).toBeLessThan(spell.hp);
  const reset = await page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sandbox;
    s.changeBuild('gale', '');
    const old = s.actors[0];
    let leaked = false;
    g.skillRt.later(0.5, () => (leaked = true));
    s.settings.unlimited = false;
    s.settings.immortal = false;
    g.player.invulnerable = false;
    g.player.applyDamage(g.player.maxHp * 3);
    const died = g.player.dead;
    g.stepSim(100);
    const respawned = !g.player.dead;
    for (let i = 0; i < 5; i++) s.resetFight();
    g.save();
    return {
      leaked,
      died,
      respawned,
      oldAlive: old.alive,
      targets: s.actors.length,
      hp: g.player.hp,
      max: g.player.maxHp,
      normal: localStorage.getItem('fantasy-rpg-save-v6:3'),
      original: localStorage.getItem('fantasy-rpg-save-v6'),
      index: localStorage.getItem('fantasy-rpg-slots'),
      sandboxSave: !!localStorage.getItem('fantasy-rpg-sandbox-v1'),
    };
  });
  expect(reset).toMatchObject({
    leaked: false,
    died: true,
    respawned: true,
    oldAlive: false,
    targets: 1,
    normal: 'slot-three-sentinel',
    original: 'adventure-sentinel',
    sandboxSave: true,
  });
  expect(reset.hp).toBe(reset.max);
  expect(reset.index).toBe(initial.index);
  await page.keyboard.press('F6');
  await page.locator('[data-setting="instantCooldowns"]').check();
  await page.locator('[data-gear-search]').fill('Iron Arrows');
  await page.getByRole('button', { name: 'Add selected item to inventory' }).click();
  await page.locator('[data-move="5"]').selectOption('');
  await page.getByRole('button', { name: 'Resume · F6 / Esc' }).click();
  const saved = await page.evaluate(() => {
    const g = (window as any).__game;
    g.save();
    return {
      ammo: g.player.equip.items.filter((i: any) => i.def.id === 'arrowIron').reduce((n: number, i: any) => n + i.qty, 0),
      moves: g.player.equip.moves,
    };
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.sandbox && !(window as any).__game.realm.busy, null, {
    timeout: 240_000 * SLOW,
  });
  const loaded = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      ammo: g.player.equip.items.filter((i: any) => i.def.id === 'arrowIron').reduce((n: number, i: any) => n + i.qty, 0),
      moves: g.player.equip.moves,
      instant: g.sandbox.settings.instantCooldowns,
    };
  });
  expect(loaded.ammo).toBe(saved.ammo);
  expect(loaded.moves).toEqual(saved.moves);
  expect(loaded.instant).toBe(true);
  expect(errors).toEqual([]);
});

test('the normal pause menu launches Sandbox and leaves the selected adventure intact', async ({ page }) => {
  test.setTimeout(720_000 * SLOW);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('adventure-seeded')) return;
    sessionStorage.setItem('adventure-seeded', '1');
    sessionStorage.setItem('fresh', '1');
    localStorage.clear();
    localStorage.setItem('fantasy.loadInto', 'saved');
    localStorage.setItem(
      'fantasy-rpg-save-v6',
      JSON.stringify({
        v: 6,
        seed: 1337,
        prog: { level: 1, xp: 0, total: 0, gold: 23456, origin: 'human' },
        items: [
          { id: 'longsword', qty: 1 },
          { id: 'roundShield', qty: 1 },
        ],
        equipped: { main: 0, off: 1 },
        quick: [null, null, null, null],
        moves: [null, null, null, null, null, null],
        activeSpell: null,
        maps: {},
        dungeon: { gateOpen: false, bossDead: false, chests: [] },
        mine: { gateOpen: false, guardianDead: false },
        guild: { rank: 'D', rep: 0, completed: 0, nextQuestId: 1, active: [], available: [], explored: [] },
        world: {
          flags: {},
          time: { hour: 9, day: 1 },
          pos: [0, 0, 10],
          quests: { 'mq-fall': { status: 'done', stage: 1, progress: [1] }, 'mq-stranger': { status: 'active', stage: 0, progress: [] } },
          story: { flags: { fallStarted: true, fallFought: true, fallMorning: true }, log: [], met: [], clues: [], named: {} },
        },
      }),
    );
  });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as any).__game, null, { timeout: 240_000 * SLOW });
  await page.evaluate(() => {
    (window as any).__game.player.invulnerable = true;
  });
  await page.locator('.cta').first().click();
  await page.waitForFunction(() => (window as any).__game.steps > 60, null, { timeout: 240_000 * SLOW });
  const position = await page.evaluate(() => {
    localStorage.setItem('fantasy.loadInto', 'ghagrabba');
    return (window as any).__game.player.pos.toArray();
  });
  await page.keyboard.press('Escape');
  // Headless Chrome keeps pointer lock after a synthetic Esc; release it as the browser normally does.
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByRole('button', { name: 'Enter Sandbox', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter Sandbox', exact: true }).click();
  await page.waitForURL(/sandbox/);
  await page.waitForFunction(() => (window as any).__game?.sandbox && !(window as any).__game.realm.busy, null, {
    timeout: 240_000 * SLOW,
  });
  const adventure = await page.evaluate(() => {
    const raw = localStorage.getItem('fantasy-rpg-save-v6');
    (window as any).__game.save();
    return { raw, after: localStorage.getItem('fantasy-rpg-save-v6'), gold: JSON.parse(raw!).prog.gold };
  });
  expect(adventure.gold).toBe(23456);
  expect(adventure.after).toBe(adventure.raw);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save Sandbox & return to adventure', exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has('sandbox'));
  await page.waitForFunction(() => (window as any).__game, null, { timeout: 240_000 * SLOW });
  const returned = await page.evaluate(() => {
    const g = (window as any).__game;
    return { gold: g.player.prog.gold, pos: g.player.pos.toArray(), title: g.overlays.start.classList.contains('hidden') };
  });
  expect(returned.gold).toBe(23456);
  expect(returned.title).toBe(true);
  expect(Math.hypot(returned.pos[0] - position[0], returned.pos[2] - position[2])).toBeLessThan(2);
  expect(errors).toEqual([]);
});
