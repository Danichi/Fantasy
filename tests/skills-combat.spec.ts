import { test, expect, type Page } from '@playwright/test';

// Tree nodes in combat: passives change the player's modifiers (only while
// their class is active), and skills on the moves bar cost resources, play
// their action and hurt enemies. Waits are counted in simulation steps, not
// wall-clock time, so a slow machine can't cut an animation short.

async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`${r.status()} ${r.url()}`));
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  await page.evaluate(() => {
    (window as any).waitSteps = async (n: number) => {
      const g = (window as any).__game, s0 = g.steps;
      while (g.steps < s0 + n) await new Promise((r) => setTimeout(r, 20));
    };
  });
  return errors;
}

/** Learn a node by name (raising the discipline high enough for its tier). */
const LEARN = `(disc, name, rank = 1) => {
  const g = window.__game, P = g.player.paths;
  P.lv[disc] = Math.max(P.lv[disc], 25);
  const find = (n) => n.name === name || n.name.split('|').includes(name);
  const tree = window.__trees[disc];
  const n = tree.nodes.find(find);
  P.nodes[disc][n.id] = { r: rank, pick: n.type === 'choice' ? n.name.split('|').indexOf(name) : undefined };
  g.skillRt.recompute();
  return 'skill:' + disc + ':' + n.id;
}`;

async function setup(page: Page) {
  await page.evaluate(async () => {
    const paths = await import('/src/paths/paths.ts');
    const data = await import('/src/paths/data.ts');
    (window as any).__trees = Object.fromEntries(data.DISCIPLINES.map((d: any) => [d.id, paths.treeOf(d)]));
  });
}

test('passives change combat stats, and only while their class is active', async ({ page }) => {
  const errors = await boot(page);
  await setup(page);
  const res = await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths;
    await (window as any).waitSteps(2);
    const base = { move: g.player.mods.moveSpeed, dmgTaken: g.player.mods.dmgTaken, fire: rt.x('fireDmg') };
    learn('gale', 'Swift Feet');
    learn('pyromancer', 'Kindling');
    P.teach('boundary');
    learn('boundary', 'Hold the Line');
    await (window as any).waitSteps(2);
    const galeActive = { move: g.player.mods.moveSpeed, dmgTaken: g.player.mods.dmgTaken, fire: rt.x('fireDmg') };
    P.setActive('boundary');
    await (window as any).waitSteps(2);
    const boundaryActive = { move: g.player.mods.moveSpeed, dmgTaken: g.player.mods.dmgTaken, fire: rt.x('fireDmg') };
    return { base, galeActive, boundaryActive };
  }, LEARN);
  expect(res.base.move).toBeCloseTo(1, 5);
  expect(res.galeActive.move).toBeCloseTo(1.05, 5); // Swift Feet
  expect(res.galeActive.dmgTaken).toBeCloseTo(1, 5); // Boundary inactive: no effect
  expect(res.galeActive.fire).toBeCloseTo(0.05, 5); // magic passives always apply
  expect(res.boundaryActive.move).toBeCloseTo(1, 5);
  expect(res.boundaryActive.dmgTaken).toBeCloseTo(0.92, 5); // Hold the Line
  expect(res.boundaryActive.fire).toBeCloseTo(0.05, 5);
  expect(errors).toEqual([]);
});

test('skills on the moves bar cost resources, animate and hurt enemies', async ({ page }) => {
  const errors = await boot(page);
  await setup(page);
  const res = await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game, rt = g.skillRt, pl = g.player, W = (window as any).waitSteps;
    const step = learn('gale', 'Gale Step', 2);
    const fire = learn('pyromancer', 'Fireball');
    pl.equip.moves[0] = step;
    pl.equip.moves[1] = fire;
    g.hud.setMode('moves');
    const spawn = () => g.slimes.spawn('blue', pl.pos.x + Math.sin(pl.yaw) * 3, pl.pos.z + Math.cos(pl.yaw) * 3);
    // Gale Step: stamina, a dash with i-frames, and a blade hit.
    let s = spawn();
    await W(20);
    pl.lock = s;
    const st0 = pl.stamina, hp0 = s.hp;
    g.input.press('Digit1');
    await W(3);
    g.input.release('Digit1');
    await W(4);
    const action = pl.act?.def.id;
    const spent = st0 - pl.stamina; // before regen refills it
    await W(120);
    const step1 = { stamina: spent > 10, dmg: hp0 - Math.max(0, s.hp), action, cd: rt.cooldown('gale:Gale Step') > 0 };
    // Fireball: mana, and the burst sets the slime burning.
    if (s.alive) s.takeHit({ damage: 999, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: s.center.clone(), crit: false, source: 'melee' });
    await W(60);
    s = spawn();
    await W(20);
    pl.lock = s;
    const m0 = pl.mana, hp1 = s.hp;
    g.input.press('Digit2');
    await W(3);
    g.input.release('Digit2');
    await W(2);
    const manaSpent = m0 - pl.mana; // before regen
    await W(150);
    const fire1 = { mana: manaSpent, dmg: hp1 - Math.max(0, s.hp) };
    // Not enough Flow: Severing Arc refuses and says why.
    const arc = learn('gale', 'Severing Arc');
    rt.flow = 0;
    const refused = rt.use(arc);
    return { step1, fire1, refused, flowAfterHits: rt.flow };
  }, LEARN);
  expect(res.step1.action).toBe('sk_galeStep');
  expect(res.step1.stamina).toBe(true);
  expect(res.step1.dmg).toBeGreaterThan(0);
  expect(res.step1.cd).toBe(true);
  expect(res.fire1.mana).toBeGreaterThanOrEqual(15);
  expect(res.fire1.dmg).toBeGreaterThan(0);
  expect(res.refused).toBe('Needs 1 Flow');
  expect(errors).toEqual([]);
});

test('skills on the bar are saved', async ({ page }) => {
  await boot(page, '?test&save');
  await setup(page);
  await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game;
    g.player.equip.moves[3] = learn('lightbinder', 'Smite', 2);
    g.save();
  }, LEARN);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  const saved = await page.evaluate(() => {
    const g = (window as any).__game;
    const m = g.player.equip.moves[3];
    localStorage.clear();
    return m;
  });
  expect(saved).toMatch(/^skill:lightbinder:/);
});
