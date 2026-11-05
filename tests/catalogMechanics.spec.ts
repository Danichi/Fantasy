import { test, expect } from './fixtures';

/** Put the shared game back as it was: take off and drop what a test added, cool down, dismiss spirits. */
const CLEAN = `(() => {
  const g = window.__game, P = g.player, eq = P.equip;
  const keep = new Set(window.__catKeep ?? []);
  for (const slot of Object.keys(eq.equipped)) {
    const it = eq.get(eq.equipped[slot]);
    if (it && !keep.has(it.uid)) delete eq.equipped[slot];
  }
  eq.items = eq.items.filter((i) => keep.has(i.uid));
  const ex = g.gearRt.exposure;
  if (ex) { ex.heat = 0; ex.thirst = 0; }
  for (const id of ['heat', 'thirst', 'sandstorm', 'meal', 'phoenix', 'light']) g.arms.runtime.buffs.delete(id);
  g.specials.allies.clear();
  P.waterWalk = 0;
  g.locks.close();
  g.events.emit('equipmentChanged', {});
  g.stepSim(2);
})()`;
const SNAP = `(() => { window.__catKeep = window.__game.player.equip.items.map((i) => i.uid); })()`;

// The catalog's one-of-a-kind items, working the way they should: locks and
// picks, the grappling hook, summoned spirits, the desert's heat and thirst,
// water-walking, unlearning a node, the Sunwheel tokens, the bell, the flask,
// the pot, traps, Fröst's hammer and the Corsair's guns.

test('locks: picks lift the pins (a miss strains them), forcing needs a heavy weapon, chests and caches are locked', async ({ game }) => {
  const { page, errors } = game;
  await page.evaluate(SNAP);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player, eq = P.equip, L = g.locks;
    const { lockLevel } = await import('/src/items/catalog/locks.ts');
    const before = L.label(2);
    eq.add('lockpicks', 3);
    let opened = 0;
    L.attempt('spec-lock', 2, () => opened++);
    const steps = [L.lift(true), L.lift(false), L.lift(true), L.lift(true), L.lift(true)];
    const levels = Array.from({ length: 40 }, (_, i) => lockLevel('chest' + i, 3));
    // No picks and a sword: it can't be forced.
    eq.items = eq.items.filter((i: any) => i.def.id !== 'lockpicks');
    let forced = 0;
    L.attempt('spec-lock-2', 1, (f: boolean) => (forced += f ? 1 : 0));
    const swordForce = forced;
    // A greatsword forces it.
    const gs = eq.add('ironGreatsword', 1);
    eq.equip(gs.uid, 'main');
    L.attempt('spec-lock-2', 1, (f: boolean) => (forced += f ? 1 : 0));
    return { before, steps, opened, isOpen: L.isOpen('spec-lock'), locked: levels.filter((v: number) => v > 0).length, swordForce, forced, ui: L.open };
  });
  await page.evaluate(CLEAN);
  expect(res.before).toMatch(/locked.*lockpicks or a heavy weapon/);
  expect(res.steps[0]).toBe('set');
  expect(['strained', 'snapped']).toContain(res.steps[1]);
  expect(res.steps.at(-1)).toBe('opened');
  expect(res.opened).toBe(1);
  expect(res.isOpen).toBe(true);
  expect(res.locked).toBeGreaterThan(30);
  expect(res.swordForce).toBe(0);
  expect(res.forced).toBe(1);
  expect(res.ui).toBe(false);
  expect(errors).toEqual([]);
});

test('the grappling hook hauls you up onto what it bites; a spectral wolf runs down a foe and bites it', async ({ game }) => {
  const { page, errors } = game;
  await page.evaluate(SNAP);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const { physics } = await import('/src/physics/physics.ts');
    // Find somewhere to throw it: a wall near the village, with a top you can stand on.
    let ok = false, y0 = 0;
    for (const [x, z] of [[0, 0], [10, 10], [-10, 5], [5, -12], [20, 0], [-20, -10], [30, 20], [-30, 25]]) {
      P.teleport(new T.Vector3(x, heightAt(x, z) + 0.1, z));
      g.stepSim(2);
      for (let a = 0; a < 32 && !ok; a++) {
        const dir = new T.Vector3(Math.cos((a / 32) * Math.PI * 2), 0.05, Math.sin((a / 32) * Math.PI * 2)).normalize();
        const o = P.pos.clone().setY(P.pos.y + 1.6);
        const d = physics.castRay(o, dir, 14);
        if (d === null || d < 2) continue;
        g.specials.d.camera = { getWorldPosition: (v: any) => v.copy(o), getWorldDirection: (v: any) => v.copy(dir) };
        y0 = P.pos.y;
        ok = g.specials.grapple(30);
      }
      if (ok) break;
    }
    for (let i = 0; i < 150; i++) g.stepSim(1);
    const climbed = P.pos.y - y0;
    // The wolf.
    P.teleport(new T.Vector3(0, heightAt(0, 40) + 0.1, 40));
    g.stepSim(2);
    const s = g.slimes.spawn('blue', P.pos.x + 6, P.pos.z);
    s.update = () => {};
    s.hp = s.maxHp = 500;
    g.specials.allies.clear();
    g.specials.allies.summon('wolf', 1, 20, 20);
    for (let i = 0; i < 240; i++) g.stepSim(1);
    const wolf = g.specials.allies.list[0];
    const out = { ok, climbed, grapples: g.specials.stats.grapples, wolfHits: wolf?.hits ?? 0, slimeHurt: 500 - s.hp };
    g.slimes.clear();
    g.specials.allies.clear();
    return out;
  });
  await page.evaluate(CLEAN);
  expect(res.ok).toBe(true);
  expect(res.climbed).toBeGreaterThan(0.5);
  expect(res.wolfHits).toBeGreaterThan(0);
  expect(res.slimeHurt).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('the desert: heat and thirst build at noon, water quenches, the Sun Guard is immune; water-walking holds you up', async ({ game }) => {
  const { page, errors } = game;
  await page.evaluate(SNAP);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player, eq = P.equip, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const { regionAt } = await import('/src/world/worldMap.ts');
    const use = (id: string) => {
      eq.add(id, 1);
      P.useConsumable(eq.items.find((i: any) => i.def.id === id).uid);
      g.stepSim(2);
    };
    let dp: number[] | null = null;
    for (let x = -2400; x > -5200 && !dp; x -= 200) for (let z = -1500; z < 1500 && !dp; z += 300) if (regionAt(x, z) === 'goldenExpanse') dp = [x, z];
    g.time.skipTo?.(12);
    P.teleport(new T.Vector3(dp![0], heightAt(dp![0], dp![1]) + 0.3, dp![1]));
    g.stepSim(5);
    const ex = g.gearRt.exposure;
    for (let i = 0; i < 300; i++) ex.update(2);
    const hot = { heat: ex.heat, thirst: ex.thirst, debuffs: [...g.arms.runtime.buffs.keys()] };
    use('waterskin');
    const quenched = ex.thirst;
    for (const s of ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet']) {
      eq.add('sunGuard_' + s, 1);
      eq.equip(eq.items.find((i: any) => i.def.id === 'sunGuard_' + s).uid);
    }
    g.events.emit('equipmentChanged', {});
    for (let i = 0; i < 10; i++) ex.update(2);
    const guarded = ex.heat;
    // Water-walking on the sea.
    let sea = 0;
    for (let x = 2600; x < 6000 && !sea; x += 100) if (regionAt(x, 0) === 'ocean') sea = x;
    P.teleport(new T.Vector3(sea, 2, 0));
    use('scrollWaterwalk');
    for (let i = 0; i < 120; i++) g.stepSim(1);
    return { hot, quenched, guarded, walking: { swimming: P.swimming, above: P.pos.y > -2.2 } };
  });
  await page.evaluate(CLEAN);
  expect(res.hot.heat).toBeGreaterThan(0.9);
  expect(res.hot.thirst).toBeGreaterThan(0.5);
  expect(res.hot.debuffs).toContain('heat');
  expect(res.quenched).toBeLessThan(res.hot.thirst);
  expect(res.guarded).toBe(0);
  expect(res.walking.swimming).toBe(false);
  expect(res.walking.above).toBe(true);
  expect(errors).toEqual([]);
});

test('unlearning a node, the Full Wheel, the bell, the flask, the pot, a tripwire, Fröst\'s hammer and the Corsair\'s guns', async ({ game }) => {
  const { page, errors } = game;
  await page.evaluate(SNAP);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player, eq = P.equip, T = g.THREE;
    const { DISC } = await import('/src/paths/data.ts');
    const { treeOf } = await import('/src/paths/paths.ts');
    const { RECIPE } = await import('/src/crafting/recipes.ts');
    const { GEAR } = await import('/src/items/catalog/hooks.ts');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const use = (id: string) => {
      eq.add(id, 1);
      P.useConsumable(eq.items.find((i: any) => i.def.id === id).uid);
      g.stepSim(2);
    };
    const count = (id: string) => eq.items.filter((i: any) => i.def.id === id).reduce((a: number, i: any) => a + i.qty, 0);
    // The Draught of Remembering.
    if (!P.paths.learned('gale')) P.paths.teach('gale');
    P.paths.lv.gale = Math.max(P.paths.lv.gale, 10);
    const node = Object.values(treeOf(DISC.gale)!.map).find((n: any) => n.type !== 'center' && P.paths.canLearn('gale', n)) as any;
    P.paths.learn('gale', node);
    const had = !!P.paths.nodes.gale[node.id];
    use('draughtOfRemembering');
    g.dialogue.options.find((o: any) => /^Forget/.test(o.label))?.run();
    const forgot = !P.paths.nodes.gale[node.id];
    // The twelve tokens, carried.
    for (let i = 1; i <= 12; i++) eq.add('sunwheelToken' + i, 1);
    g.events.emit('equipmentChanged', {});
    const wheel = g.gearRt.fullWheel;
    // The bell: three watchmen, once a day. The flask: refills. The pot: a meal.
    g.specials.allies.clear();
    use('bellOfTheGlen');
    const bell = g.specials.allies.list.length;
    use('bellOfTheGlen');
    const bell2 = g.specials.allies.list.length;
    g.specials.allies.clear();
    P.hp = 10;
    use('wennasFlask');
    const flask = { hp: P.hp, left: g.specials.flaskCharges(), kept: count('wennasFlask') };
    use('marasEverfullPot');
    const pot = g.arms.runtime.buffs.get('meal')?.label;
    // A tripwire in the grass, and a slime walking onto it.
    P.teleport(new T.Vector3(0, heightAt(0, 30) + 0.1, 30));
    g.stepSim(2);
    use('tripwireRune');
    const s = g.slimes.spawn('blue', P.pos.x + 0.5, P.pos.z);
    s.update = () => {};
    s.hp = s.maxHp = 300;
    g.stepSim(4);
    const trap = { hits: g.specials.stats.trapHits, hurt: 300 - s.hp };
    g.slimes.clear();
    // Fröst's hammer: a step finer at the forge.
    const R = RECIPE['iron_longsword'];
    const q0 = g.arms.crafter.preview(R, 2);
    eq.add('froestsHammer', 1);
    g.events.emit('equipmentChanged', {});
    const q1 = g.arms.crafter.preview(R, 2);
    // The Corsair Captain's guns.
    for (const sl of ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet']) {
      eq.add('corsairCaptain_' + sl, 1);
      eq.equip(eq.items.find((i: any) => i.def.id === 'corsairCaptain_' + sl).uid);
    }
    g.events.emit('equipmentChanged', {});
    g.stepSim(2);
    return { had, forgot, wheel, bell, bell2, flask, pot, trap, q: [q0, q1], cannon: GEAR.cannonReload };
  });
  await page.evaluate(CLEAN);
  expect(res.had).toBe(true);
  expect(res.forgot).toBe(true);
  expect(res.wheel).toBe(true);
  expect(res.bell).toBe(3);
  expect(res.bell2).toBe(3);
  expect(res.flask.hp).toBeGreaterThan(50);
  expect(res.flask.left).toBe(2);
  expect(res.flask.kept).toBe(1);
  expect(res.pot).toMatch(/Mara/);
  expect(res.trap.hits).toBeGreaterThan(0);
  expect(res.trap.hurt).toBeGreaterThan(0);
  expect(res.q[1]).toBe(res.q[0] + 1);
  expect(res.cannon).toBeCloseTo(0.2, 5);
  expect(errors).toEqual([]);
});
