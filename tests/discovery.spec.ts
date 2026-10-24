import { test, expect } from './fixtures';

// The discovery bosses (docs/design/sites.md): five places at chosen spots,
// each with something you do there that wakes what lives in it, once. And the
// moon, whose full nights the Wrong Stone Circle waits for.

test('the moon is full every eighth night; the clock shows it; the sinkhole and the mere are cut into the ground', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, t = g.time;
    const { heightAt, SINKHOLE, DROWNED_MERE } = await import('/src/world/terrainHeight.ts');
    const { waterSurfaceAt } = await import('/src/world/waterLevel.ts');
    const at = (day: number, hour: number) => {
      t.day = day;
      t.hour = hour;
      t.update(0);
      return { full: t.fullMoon, toFull: t.nightsToFull, glyph: t.moonGlyph, light: +t.state.moonLight.toFixed(2) };
    };
    const moon = { d8: at(8, 22), d9: at(9, 22), d9am: at(9, 2), d7: at(7, 22), d12: at(12, 22) };
    const rim = heightAt(SINKHOLE.x + SINKHOLE.r + 8, SINKHOLE.z + 4);
    const pit = heightAt(SINKHOLE.x - 3, SINKHOLE.z + 2);
    const ramp = heightAt(SINKHOLE.x + SINKHOLE.r, SINKHOLE.z);
    const mere = heightAt(DROWNED_MERE.x, DROWNED_MERE.z);
    const water = waterSurfaceAt(DROWNED_MERE.x, DROWNED_MERE.z);
    const shore = waterSurfaceAt(DROWNED_MERE.x + DROWNED_MERE.r + 14, DROWNED_MERE.z);
    const sites = ['drownedTower', 'sinkhole', 'hangingTree', 'wrongCircle', 'mine'].map((k) => g.sites.of(k).length);
    return { moon, rim, pit, ramp, mere, water, shore, waterLevel: DROWNED_MERE.water, sites };
  });
  expect(res.moon.d8.full).toBe(true);
  expect(res.moon.d8.light).toBe(1);
  expect(res.moon.d9am.full).toBe(true); // still the night of day 8
  expect(res.moon.d9.full).toBe(false);
  expect(res.moon.d9.toFull).toBe(7);
  expect(res.moon.d7.toFull).toBe(1);
  expect(res.moon.d12.light).toBe(0); // new moon
  expect(res.moon.d8.glyph).not.toBe(res.moon.d12.glyph);
  expect(res.rim - res.pit).toBeGreaterThan(6);
  expect(res.ramp).toBeGreaterThan(res.pit + 2);
  expect(res.ramp).toBeLessThan(res.rim - 1);
  expect(res.mere).toBeLessThan(res.waterLevel - 1.5);
  expect(res.water).toBe(res.waterLevel);
  expect(res.shore).toBe(null);
  expect(res.sites).toEqual([1, 1, 1, 1, 1]);
  expect(errors).toEqual([]);
});

/** Shared bits for the boss tests: go to a site, do a thing there, kill what comes. */
const setup = `
  const g = window.__game, T = g.THREE, S = g.sites, B = g.bosses;
  const { heightAt } = await import('/src/world/terrainHeight.ts');
  const GS = await import('/src/creatures/geometryStore.ts');
  g.player.invulnerable = true;
  S.enabled = true;
  const toasts = [];
  const t0 = g.hud.toast.bind(g.hud);
  g.hud.toast = (m) => (toasts.push(m), t0(m));
  const tp = (x, z) => { g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z)); };
  const go = (s, dx = 0, dz = 0) => { tp(s.x + dx, s.z + dz); g.stepSim(20); };
  const action = (s, label) => S.live(s.id)?.actions.find((a) => label.test(a.label()));
  const has = (id) => g.player.equip.items.filter((it) => it.def.id === id).reduce((n, it) => n + it.qty, 0);
  const kill = (b) => { for (let i = 0; i < 40 && b.alive; i++) { b.takeHit({ damage: 400, poise: 0, dir: new T.Vector3(1, 0, 0), at: b.center.clone(), crit: false, source: 'melee' }); g.stepSim(2); } };
`;

test('the Sinkhole: the rotten edge gives way and the Rat Queen wakes; she rears to call her brood and her belly is open then; she leaves her crown, once', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(new Function(`return (async () => {${setup}
    GS.prepareCreatureNow('rat');
    const s = S.of('sinkhole')[0];
    const { SINKHOLE } = await import('/src/world/terrainHeight.ts');
    go(s, SINKHOLE.r + 12, 0);
    const before = !!B.body('ratQueen');
    // Onto the rim.
    tp(SINKHOLE.x - (SINKHOLE.r - 0.5), SINKHOLE.z);
    g.stepSim(5);
    const q = B.body('ratQueen');
    const woke = !!q && q.mode !== 'lurk';
    // Up she rears, and the brood come.
    for (let i = 0; i < 60 * 8 && q.stats.calls === 0; i++) g.stepSim(1);
    for (let i = 0; i < 60 * 2 && q.mode === 'rear' && q.brood.length === 0; i++) g.stepSim(1);
    const brood = q.brood.length;
    // The belly is open while she's up.
    let belly = 0, normal = 0;
    for (let i = 0; i < 60 * 30 && !(q.mode === 'rear'); i++) g.stepSim(1);
    if (q.mode === 'rear') { const h0 = q.hp; q.takeHit({ damage: 10, poise: 0, dir: new T.Vector3(1, 0, 0), at: q.center.clone(), crit: false, source: 'melee' }); belly = h0 - q.hp; }
    for (let i = 0; i < 60 * 5 && q.mode === 'rear'; i++) g.stepSim(1);
    { const h0 = q.hp; q.takeHit({ damage: 10, poise: 0, dir: new T.Vector3(1, 0, 0), at: q.center.clone(), crit: false, source: 'melee' }); normal = h0 - q.hp; }
    kill(q);
    g.stepSim(10);
    const crown = has('boneCrown');
    const done = S.st(s.id).done;
    const again = B.summon('ratQueen');
    S.enabled = false;
    g.hud.toast = t0;
    return { before, woke, brood, belly, normal, crown, done, again: !!again, toasts };
  })()`) as never);
  expect(res.before).toBe(false);
  expect(res.woke).toBe(true);
  expect(res.brood).toBeGreaterThanOrEqual(3);
  expect(res.belly).toBeCloseTo(20, 0);
  expect(res.normal).toBeCloseTo(10, 0);
  expect(res.crown).toBe(1);
  expect(res.done).toBe(true);
  expect(res.again).toBe(false);
  expect(res.toasts.some((t: string) => /edge gives way/.test(t))).toBe(true);
  expect(errors).toEqual([]);
});

test('the Hanging Tree: the grave only opens at midnight; Red Corwen climbs out; his silver is under him', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(new Function(`return (async () => {${setup}
    GS.prepareCreatureNow('undeadRevenant');
    GS.prepareCreatureNow('skeleton');
    const s = S.of('hangingTree')[0];
    g.time.skipTo(13);
    go(s, 6, 3);
    const dig = () => { const a = action(s, /Dig/); a.act(); g.stepSim(3); };
    tp(s.x, s.z); g.stepSim(5);
    const live = S.live(s.id);
    const grave = live.actions.find((a) => /Dig/.test(a.label()));
    tp(grave.at.x + 1, grave.at.z + 1); g.stepSim(5);
    dig();
    const byDay = !!B.body('hangedLord');
    g.time.skipTo(23.8);
    dig();
    const b = B.body('hangedLord');
    const up = !!b && b.engaged;
    g.stepSim(60 * 6);
    const gold0 = g.player.prog.gold;
    kill(b);
    g.stepSim(10);
    S.enabled = false;
    g.hud.toast = t0;
    return { byDay, up, gold: g.player.prog.gold - gold0, knot: has('hangmansKnot'), done: S.st(s.id).done, specials: b.stats.specials + b.stats.cuts + b.stats.calls };
  })()`) as never);
  expect(res.byDay).toBe(false);
  expect(res.up).toBe(true);
  expect(res.gold).toBeGreaterThanOrEqual(320);
  expect(res.knot).toBe(1);
  expect(res.done).toBe(true);
  expect(errors).toEqual([]);
});

test('the Wrong Stone Circle: only at the full moon; the wraith is warded while the stones burn; put them out and it can be hurt', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(new Function(`return (async () => {${setup}
    GS.prepareCreatureNow('undeadWraith');
    const s = S.of('wrongCircle')[0];
    g.time.day = 9;
    g.time.skipTo(22);
    go(s, 0, 1.5);
    const altar = () => action(s, /altar/);
    altar().act();
    g.stepSim(2);
    const notTonight = !B.body('circleWraith');
    const told = toasts.some((t) => /full in 7 nights/.test(t));
    g.time.day = 16;
    g.time.update(0);
    altar().act();
    g.stepSim(5);
    const w = B.body('circleWraith');
    const warded = w.warded();
    const h0 = w.hp;
    w.takeHit({ damage: 100, poise: 0, dir: new T.Vector3(1, 0, 0), at: w.center.clone(), crit: false, source: 'melee' });
    const wardedDmg = h0 - w.hp;
    for (const a of S.live(s.id).actions.filter((a) => /Scrape/.test(a.label()))) a.act();
    const open = !w.warded();
    const h1 = w.hp;
    w.takeHit({ damage: 100, poise: 0, dir: new T.Vector3(1, 0, 0), at: w.center.clone(), crit: false, source: 'melee' });
    const openDmg = h1 - w.hp;
    kill(w);
    g.stepSim(10);
    S.enabled = false;
    g.hud.toast = t0;
    return { notTonight, told, warded, wardedDmg, open, openDmg, wheel: has('backwardsWheel'), done: S.st(s.id).done };
  })()`) as never);
  expect(res.notTonight).toBe(true);
  expect(res.told).toBe(true);
  expect(res.warded).toBe(true);
  expect(res.wardedDmg).toBeLessThan(20);
  expect(res.open).toBe(true);
  expect(res.openDmg).toBeGreaterThan(50);
  expect(res.wheel).toBe(1);
  expect(res.done).toBe(true);
  expect(errors).toEqual([]);
});

test('the Drowned Watchtower and the Abandoned Mine: the log raises the captain; the Delver cannot be hurt underground, bursts up, and leaves its crystal', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(new Function(`return (async () => {${setup}
    GS.prepareCreatureNow('undeadDrowned');
    GS.prepareCreatureNow('delver');
    // The captain.
    const tower = S.of('drownedTower')[0];
    go(tower, 0, 12);
    const log = S.live(tower.id).actions[0];
    tp(log.at.x, log.at.z); g.stepSim(5);
    log.act();
    g.dialogue.close?.();
    g.stepSim(5);
    const cap = B.body('drownedCaptain');
    const capUp = !!cap && cap.engaged;
    kill(cap);
    g.stepSim(10);
    const compass = has('drownedCompass');
    // The Delver.
    const mine = S.of('mine')[0];
    go(mine, 0, -4);
    const clear = action(mine, /rubble/);
    tp(clear.at.x, clear.at.z); g.stepSim(5);
    clear.act();
    g.stepSim(5);
    const d = B.body('delver');
    const buried = d.buried;
    const h0 = d.hp;
    d.takeHit({ damage: 100, poise: 0, dir: new T.Vector3(1, 0, 0), at: d.center.clone(), crit: false, source: 'melee' });
    const buriedDmg = h0 - d.hp;
    // Run about and it comes up under you.
    let ran = 0;
    for (let i = 0; i < 60 * 20 && d.buried; i++) { ran += 1 / 60; const a = ran * 0.8; tp(mine.x + Math.cos(a) * 10, mine.z - 4 + Math.sin(a) * 10); g.stepSim(1); }
    const burst = d.stats.bursts;
    for (let i = 0; i < 60 * 2 && d.buried; i++) g.stepSim(1);
    const h1 = d.hp;
    d.takeHit({ damage: 100, poise: 0, dir: new T.Vector3(1, 0, 0), at: d.center.clone(), crit: false, source: 'melee' });
    const upDmg = h1 - d.hp;
    kill(d);
    g.stepSim(10);
    S.enabled = false;
    g.hud.toast = t0;
    return { capUp, compass, log: has('captainsLog'), buried, buriedDmg, burst, upDmg, crystal: has('delverCrystal'), claw: has('delverClaw'), towerDone: S.st(tower.id).done, mineDone: S.st(mine.id).done };
  })()`) as never);
  expect(res.capUp).toBe(true);
  expect(res.compass).toBe(1);
  expect(res.log).toBe(1);
  expect(res.towerDone).toBe(true);
  expect(res.buried).toBe(true);
  expect(res.buriedDmg).toBe(0);
  expect(res.burst).toBeGreaterThan(0);
  expect(res.upDmg).toBeGreaterThan(50);
  expect(res.crystal).toBe(1);
  expect(res.claw).toBe(1);
  expect(res.mineDone).toBe(true);
  expect(errors).toEqual([]);
});
