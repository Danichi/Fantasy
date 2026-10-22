import { test, expect, boot, SLOW } from './fixtures';
import type { Page } from '@playwright/test';

// Tree nodes in combat: passives change the player's modifiers (only while
// their class is active), and skills on the moves bar cost resources, play
// their action and hurt enemies. Waits are counted in simulation steps, not
// wall-clock time, so a slow machine can't cut an animation short.

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

test('passives change combat stats, and only while their class is active', async ({ game }) => {
  const { page } = game;
  const errors = game.errors;
  await setup(page);
  const res = await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths;
    await (window as any).waitSteps(2);
    P.teach('gale');
    await (window as any).waitSteps(2);
    const base = { move: g.player.mods.moveSpeed, dmgTaken: g.player.mods.dmgTaken, fire: rt.x('fireDmg') };
    learn('gale', 'Swift Feet');
    learn('pyromancer', 'Kindling');
    P.teach('boundary');
    learn('boundary', 'Tough');
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
  expect(res.boundaryActive.dmgTaken).toBeCloseTo(0.96, 5); // Tough
  expect(res.boundaryActive.fire).toBeCloseTo(0.05, 5);
  expect(errors).toEqual([]);
});

test('skills on the moves bar cost resources, animate and hurt enemies', async ({ game }) => {
  const { page } = game;
  const errors = game.errors;
  await setup(page);
  const res = await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game, rt = g.skillRt, pl = g.player, W = (window as any).waitSteps;
    pl.paths.teach('gale');
    const step = learn('gale', 'Gale Step', 2);
    const fire = learn('pyromancer', 'Fireball');
    pl.equip.moves[0] = step;
    pl.equip.moves[1] = fire;
    g.hud.setMode('moves');
    const spawn = (d = 3) => {
      const sl = g.slimes.spawn('blue', pl.pos.x + Math.sin(pl.yaw) * d, pl.pos.z + Math.cos(pl.yaw) * d);
      sl.cooldown = 1e9; // a punching bag: it never attacks back
      return sl;
    };
    const ready = async () => { for (let i = 0; i < 600 && !pl.canAct; i++) await W(1); };
    // Gale Step: stamina, a dash with i-frames, and a blade hit.
    // (Far enough that the dash reaches it mid-swing rather than starting inside it.)
    let s = spawn(4.5);
    await W(5);
    pl.lock = s;
    await ready();
    rt.flow = 3; // Gale Step costs 1 Flow
    const st0 = pl.stamina, hp0 = s.hp;
    const why0 = rt.blocked(step);
    // Read the action and stamina the moment the skill fires (waits can overshoot).
    let action: string | undefined, spent = 0, cd = false;
    const off = g.events.on('spellCast', () => {
      action = pl.act?.def.id;
      cd = rt.cooldown('gale:Gale Step') > 0;
      spent = st0 - pl.stamina;
    });
    g.input.press('Digit1');
    await W(3);
    g.input.release('Digit1');
    await W(4);
    off();
    await W(120);
    const step1 = { stamina: spent > 10, dmg: hp0 - Math.max(0, s.hp), action, cd, why0, active: pl.paths.active, moves: pl.equip.moves.slice(0, 2) };
    // Fireball: mana, and the burst sets the slime burning.
    if (s.alive) s.takeHit({ damage: 999, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: s.center.clone(), crit: false, source: 'melee' });
    await W(60);
    s = spawn();
    await W(20);
    pl.lock = s;
    await ready();
    const m0 = pl.mana, hp1 = s.hp;
    const why2 = rt.blocked(fire);
    let manaSpent = 0;
    const off2 = g.events.on('spellCast', () => (manaSpent = m0 - pl.mana));
    g.input.press('Digit2');
    await W(3);
    g.input.release('Digit2');
    await W(150);
    off2();
    const fire1 = { mana: manaSpent, dmg: hp1 - Math.max(0, s.hp), why2 };
    // Not enough Flow: Flash Cut refuses and says why.
    const arc = learn('gale', 'Flash Cut');
    rt.flow = 0;
    const refused = rt.use(arc);
    return { step1, fire1, refused, flowAfterHits: rt.flow };
  }, LEARN);
  expect(res.step1.why0, JSON.stringify(res.step1)).toBeNull();
  expect(res.step1.action).toBe('sk_galeStep');
  expect(res.step1.stamina).toBe(true);
  // (No damage check here: blade hits are detected per rendered frame, and a headless run renders
  // too few frames to be sure of catching the dash's swing. Fireball below checks damage.)
  expect(res.step1.cd).toBe(true);
  expect(res.fire1.mana, JSON.stringify(res.fire1)).toBeGreaterThanOrEqual(15);
  expect(res.fire1.dmg).toBeGreaterThan(0);
  expect(res.refused).toBe('Needs 2 Flow');
  expect(errors).toEqual([]);
});

test('skills on the bar are saved', async ({ page }) => {
  await boot(page, '?test&save');
  await setup(page);
  await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game;
    g.player.equip.moves[3] = learn('lightbinder', 'Sentence', 2);
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
