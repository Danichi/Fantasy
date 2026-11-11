import { test, expect } from './fixtures';

// The classes update (docs/design/classes.md): the later classes' own
// mechanics (Cryomancer Chill and shatter, Shadowcaller curses and souls,
// Voidwalker Entropy, Dawnblade Sunfire), the second class, the level-50 cap
// and Ascensions. Hits go straight through the skill runtime so each rule is
// tested on its own. Waits are simulation steps.

test('Cryomancer chills, freezes and shatters', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    P.setLevelFromRenown('cryomancer', 5);
    rt.recompute();
    const a = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 4);
    const b = g.slimes.spawn('blue', pl.pos.x + 5, pl.pos.z + 4);
    a.hp = a.maxHp = b.hp = b.maxHp = 5000;
    await W(3);
    const chills: number[] = [];
    for (let i = 0; i < 4; i++) {
      rt.hit(a, 1, { school: 'frost', type: 'frost', poise: 0 });
      chills.push(rt.statusOf(a).chill);
    }
    rt.hit(a, 1, { school: 'frost', type: 'frost', poise: 0 });
    const frozen = rt.statusOf(a).frozen > 0 && a.stunned;
    const bBefore = b.hp;
    rt.hit(a, 100, { school: 'fire', poise: 0 });
    return { chills, frozen, after: rt.statusOf(a).frozen, splashed: b.hp < bBefore, chillBar: rt.resources().map((r: any) => r.name) };
  });
  expect(res.chills).toEqual([1, 2, 3, 4]);
  expect(res.frozen).toBe(true);
  expect(res.after).toBe(0);
  expect(res.splashed).toBe(true);
  expect(errors).toEqual([]);
});

test('Shadowcaller curses, harvests souls and spends them', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    P.setLevelFromRenown('shadowcaller', 5);
    rt.recompute();
    const spell0 = pl.mods.spell;
    const s = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 4);
    await W(3);
    rt.hit(s, 1, { school: 'shadow', poise: 0 });
    const cursed = rt.statusOf(s).curse > 0;
    rt.hit(s, 99999, { school: 'shadow', poise: 0 });
    await W(5);
    const souls = rt.kits.souls;
    const spell1 = pl.mods.spell;
    // An uncursed kill gives nothing.
    const t = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 5);
    await W(3);
    rt.hit(t, 99999, { school: 'fire', poise: 0 });
    await W(5);
    const souls2 = rt.kits.souls;
    rt.kits.onUse('shadowcaller:Soul Storm');
    await W(2);
    return { cursed, souls, souls2, more: spell1 > spell0, spent: rt.kits.souls, fuel: rt.buff('soulFuel'), bar: rt.resources().some((r: any) => r.name === 'SOULS') };
  });
  expect(res.cursed).toBe(true);
  expect(res.souls).toBe(1);
  expect(res.souls2).toBe(1);
  expect(res.more).toBe(true);
  expect(res.spent).toBe(0);
  expect(res.fuel).toBe(true);
  expect(res.bar).toBe(true);
  expect(errors).toEqual([]);
});

test('Voidwalker Entropy builds and collapses', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    P.setLevelFromRenown('voidwalker', 5);
    rt.recompute();
    const s = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 4);
    s.hp = s.maxHp = 5000;
    await W(3);
    rt.hit(s, 1, { school: 'void', poise: 0 });
    rt.hit(s, 1, { school: 'void', poise: 0 });
    const built = rt.kits.entropy;
    rt.kits.entropy = 100;
    const hp0 = s.hp;
    rt.hit(s, 1, { school: 'void', poise: 0 });
    await W(40);
    return { built, after: rt.kits.entropy, crushed: hp0 - s.hp > 5 };
  });
  expect(res.built).toBe(16);
  expect(res.after).toBe(0);
  expect(res.crushed).toBe(true);
  expect(errors).toEqual([]);
});

test('Dawnblade blade hits build Radiance and release Sunfire', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    P.setLevelFromRenown('dawnblade', 5);
    P.setActive('dawnblade');
    rt.recompute();
    const s = g.slimes.spawn('blue', pl.pos.x + 2, pl.pos.z + 2);
    s.hp = s.maxHp = 5000;
    await W(3);
    rt.radiance = 0;
    g.events.emit('meleeHit', { target: s, amount: 20, crit: false, action: 'slash1' });
    const r1 = rt.radiance;
    rt.radiance = 100;
    await W(2);
    const lit = rt.kits.sunfireLit;
    g.events.emit('meleeHit', { target: s, amount: 20, crit: false, action: 'slash1' });
    return { r1, lit, after: rt.radiance, branded: rt.branded(s) };
  });
  expect(res.r1).toBeGreaterThanOrEqual(5);
  expect(res.lit).toBe(true);
  expect(res.after).toBeLessThan(20);
  expect(res.branded).toBe(true);
  expect(errors).toEqual([]);
});

test('second class, level 50 and Ascensions', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths;
    const { capOf } = await import('/src/paths/paths.ts');
    P.setLevelFromRenown('gale', 31);
    P.setLevelFromRenown('warbreaker', 10);
    P.setActive('gale');
    const second = P.setSecondary('warbreaker');
    const cantBeActive = P.setSecondary('gale');
    const canAscend = P.canAscend('gale');
    const free0 = P.points('gale');
    const asc = P.ascend('gale', 1);
    const node = P.learnAscNode('gale');
    rt.recompute();
    const saved = JSON.parse(JSON.stringify(P.serialize ? P.serialize() : {}));
    return {
      caps: [capOf('gale'), capOf('pyromancer'), capOf('smithing')],
      second, cantBeActive, secondary: P.secondary, canAscend, asc, node, spent: free0 - P.points('gale'),
      why: P.ascWhyNot('gale'), saved: !!saved,
    };
  });
  expect(res.caps).toEqual([50, 50, 30]);
  expect(res.second).toBe(true);
  expect(res.cantBeActive).toBe(false);
  expect(res.secondary).toBe('warbreaker');
  expect(res.canAscend).toBe(true);
  expect(res.asc).toBe(true);
  expect(res.node).toBe(true);
  expect(res.spent).toBe(3);
  expect(res.why).toBe('Needs level 35');
  expect(errors).toEqual([]);
});
