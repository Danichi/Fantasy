import { test, expect, boot, SLOW } from './fixtures';
import type { Page } from '@playwright/test';

// Origins and the Legendary Hero (docs/design/origins.md), phase by phase,
// through window.__game.origins (the runtime) and __game.creator.

const ev = <T>(page: Page, fn: () => Promise<T> | T) => page.evaluate(fn);

/** In-page: give the hero enough Renown for a Legendary Hero level (5, 15, 30, 50, 80). */
const RENOWN = `(o, n) => { let i = 0; while (o.legacy.renown < n) o.legacy.grant('test:' + (i++), Math.min(10, n - o.legacy.renown), 'A test deed'); }`;

// ---- O1: the six origins and their passives -------------------------------------------------

test('O1: a new save can be any origin, and every passive changes its number', async ({ game }) => {
  const { page } = game;
  const res = await ev(page, async () => {
    const g = (window as any).__game, o = g.origins, p = g.player;
    const out: Record<string, unknown> = {};
    // Human: Heroic Adaptation pays 15% more XP for a kill (on top of the orbs), more tree points.
    const s = g.slimes.spawn('blue', p.pos.x + 30, p.pos.z + 30);
    s.update = () => {};
    const xp0 = p.prog.xp;
    s.takeHit({ damage: 9999, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: s.center.clone(), crit: false, source: 'melee' });
    out.humanXp = p.prog.xp - xp0;
    p.prog.addXp(60000);
    if (!p.paths.learned('gale')) p.paths.teach('gale'); // nobody starts with a class: Kaela's trial teaches it
    while (p.paths.canInvest('gale')) p.paths.invest('gale');
    out.humanPoints = p.paths.earned('gale') - (p.paths.level('gale') + Math.floor(p.paths.level('gale') / 5));
    const hp0 = p.maxHp;
    const vals: Record<string, unknown> = {};
    for (const id of ['elf', 'dwarf', 'beastfolk', 'demon', 'dragonkin']) {
      await o.setOrigin(id);
      g.stepSim(2);
      const v: Record<string, unknown> = { origin: p.prog.origin, manaRegen: p.mods.manaRegen, poiseMul: p.poiseMul, fire: p.fireResist, lock: p.lockRange, maxHp: p.maxHp };
      if (id === 'beastfolk') {
        g.input.press('KeyW');
        g.input.press('ShiftLeft');
        g.stepSim(20);
        v.sprintSpeed = p.mods.moveSpeed;
        v.pounce = o.forms.remap('sprintAttack');
        g.input.releaseAll();
      }
      if (id === 'demon') {
        p.hp = 50;
        g.stepSim(60);
        v.regen = p.hp - 50;
      }
      vals[id] = v;
    }
    out.vals = vals;
    out.hp0 = hp0;
    // The human's XP bonus doesn't apply to other peoples.
    await o.setOrigin('human');
    return out;
  });
  expect(res.humanXp).toBe(4); // 15% of a stag's 26 XP, paid at once
  expect(res.humanPoints).toBeGreaterThan(0);
  const v = res.vals as Record<string, any>;
  expect(v.elf.manaRegen).toBeGreaterThanOrEqual(0.3);
  expect(v.dwarf.poiseMul).toBe(1.25);
  expect(v.beastfolk.sprintSpeed).toBeGreaterThanOrEqual(1.12);
  expect(v.beastfolk.pounce).toBe('pounce');
  expect(v.demon.fire).toBe(0.4);
  expect(v.demon.regen).toBeGreaterThan(0.8);
  expect(v.dragonkin.fire).toBe(0.5);
  expect(v.dragonkin.lock).toBeCloseTo(31.2, 1);
  expect(v.dragonkin.maxHp).toBeGreaterThan(v.demon.maxHp as number);
  for (const id of ['elf', 'dwarf', 'beastfolk', 'demon', 'dragonkin']) expect(v[id].origin).toBe(id);
  expect(game.errors).toEqual([]);
});

test('O1: people react to your origin, and prices move where you are feared', async ({ game }) => {
  const { page } = game;
  const res = await ev(page, async () => {
    const g = (window as any).__game, o = g.origins;
    await o.setOrigin('demon');
    const first = o.greet('Maud', 'Good morning.');
    const again = o.greet('Maud', 'Good morning.');
    const factor = o.priceFactor();
    g.town.shopUI.show({ speaker: 'Test', title: 'Shop', intro: '', stock: [['healthPotion', 100]] });
    const price = g.town.shopUI.opts.stock[0][1];
    g.town.shopUI.close();
    await o.setOrigin('human');
    return { first, again, factor, price, human: o.greet('Corvin', 'Hail.') };
  });
  expect(res.first).toContain('horned one');
  expect(res.first).toContain('Good morning.');
  expect(res.again).toBe('Good morning.');
  expect(res.factor).toBeGreaterThan(1);
  expect(res.price).toBe(Math.round(100 * res.factor));
  expect(res.human).toBe('Hail.');
});

test('O1: a v6 save with the old "dragon" origin loads as Dragonkin with a default look', async ({ page }) => {
  test.setTimeout(480_000 * SLOW);
  const errors = await boot(page, '?test&save');
  await page.evaluate(() => {
    // What a save from before the six peoples holds: origin 'dragon', no look (the page saves on unload).
    const g = (window as any).__game;
    g.player.prog.origin = 'dragon';
    g.player.prog.look = null;
    g.save();
    const d = JSON.parse(localStorage.getItem('fantasy-rpg-save-v6')!);
    if (d.prog.origin !== 'dragon' || d.look) throw new Error('old-style save not written');
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const res = await page.evaluate(() => {
    const g = (window as any).__game, o = g.origins;
    return { origin: o.origin, look: o.look.origin, horns: o.look.horns, parts: o.bodyParts.length, matches: o.bodyMatches(), renown: o.legacy.renown >= 0 };
  });
  expect(res).toEqual({ origin: 'dragonkin', look: 'dragonkin', horns: 0, parts: 3, matches: true, renown: true });
  expect(errors).toEqual([]);
});

// ---- O2: the character creator and the parts -----------------------------------------------

test('O2: every origin combination builds without errors', async ({ game }) => {
  test.setTimeout(400_000 * SLOW);
  const { page } = game;
  const built = await ev(page, async () => {
    const g = (window as any).__game, o = g.origins;
    const combos: any[] = [
      { origin: 'human', build: 'slim', body: 'female', hair: 'buns' }, { origin: 'human', build: 'broad', beard: true },
      { origin: 'elf' }, { origin: 'elf', body: 'female', build: 'slim', hair: null },
      { origin: 'dwarf', build: 'broad' }, { origin: 'dwarf', body: 'female', beard: true },
      { origin: 'beastfolk', ears: 'wolf', markings: false }, { origin: 'beastfolk', ears: 'cat', body: 'female' },
      ...[-1, 0, 1, 2, 3].map((h) => ({ origin: 'demon', horns: h, tail: h % 2 === 0, body: h > 1 ? 'female' : 'male' })),
      ...[-1, 0, 1, 2].map((h) => ({ origin: 'dragonkin', horns: h, markings: h !== 1 })),
    ];
    const out: string[] = [];
    for (const c of combos) {
      await o.setLook(c);
      out.push(`${c.origin}:${o.bodyMatches()}:${o.bodyParts.length}`);
    }
    await o.setOrigin('human');
    return out;
  });
  expect(built.length).toBe(17);
  for (const b of built) expect(b).toMatch(/:true:\d$/);
  expect(game.errors).toEqual([]);
});

test('O2: the creator makes the hero and the look survives a reload', async ({ page }) => {
  test.setTimeout(480_000 * SLOW);
  const errors = await boot(page, '?test&save');
  // Drive the creator itself: pick a people, shape them, begin.
  await page.evaluate(() => (window as any).__game.creator.show(() => ((window as any).__began = true)));
  await expect(page.locator('.creator')).toBeVisible();
  await page.locator('.creator .cr-origin', { hasText: 'DEMON' }).click();
  await page.locator('.creator [data-k="horns"][data-v="2"]').click();
  await page.locator('.creator [data-k="body"][data-v="female"]').click();
  await page.locator('.creator input[data-k="name"]').fill('Vexa');
  await page.evaluate(() => (window as any).__game.creator.ready);
  await page.screenshot({ path: 'test-results/origins-creator.png' });
  await page.locator('.creator .cr-begin').click();
  await page.waitForFunction(() => (window as any).__began === true, null, { timeout: 60_000 * SLOW });
  await expect(page.locator('.creator')).toBeHidden();
  const before = await page.evaluate(() => {
    const g = (window as any).__game;
    g.save();
    return g.origins.look;
  });
  expect(before).toMatchObject({ origin: 'demon', horns: 2, body: 'female', name: 'Vexa' });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const after = await page.evaluate(() => {
    const o = (window as any).__game.origins;
    return { look: o.look, matches: o.bodyMatches(), parts: o.bodyParts.length };
  });
  expect(after.look).toEqual(before);
  expect(after.matches).toBe(true);
  expect(after.parts).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('O2: horns, tail and wings follow the head and hips through idle, run and attack', async ({ game }) => {
  const { page } = game;
  const res = await ev(page, async () => {
    const g = (window as any).__game, o = g.origins, p = g.player, T = g.THREE;
    await o.setLook({ origin: 'dragonkin', horns: 0 });
    const find = (n: string) => { let s: any = null; p.char.root.traverse((x: any) => { if (x.name === n && !s) s = x; }); return s; };
    const head = find('part:head'), tail = find('part:tail'), wings = find('part:wings');
    const sample = () => {
      p.char.root.updateMatrixWorld(true);
      const hb = p.char.bone('Head').getWorldPosition(new T.Vector3()), pb = p.char.bone('pelvis').getWorldPosition(new T.Vector3()), cb = p.char.bone('spine_03').getWorldPosition(new T.Vector3());
      const hs = head.getWorldPosition(new T.Vector3()), ts = tail.getWorldPosition(new T.Vector3()), ws = wings.getWorldPosition(new T.Vector3());
      return { hd: hs.distanceTo(hb), td: ts.distanceTo(pb), wd: ws.distanceTo(cb), h: hs.clone().sub(p.char.root.position), t: ts.clone().sub(p.char.root.position) };
    };
    const idle = sample();
    await (window as any).W(20);
    const idle2 = sample();
    g.input.press('KeyW');
    g.input.press('ShiftLeft');
    await (window as any).W(50);
    const run = sample();
    g.input.releaseAll();
    await (window as any).W(30);
    g.pose('slash3', 0.55);
    const atk = sample();
    g.pause(false);
    await o.setOrigin('human');
    const moved = (a: any, b: any) => a.h.distanceTo(b.h) + a.t.distanceTo(b.t);
    return { d: [idle, idle2, run, atk].map((s) => [s.hd, s.td, s.wd]), runMoved: moved(idle, run), atkMoved: moved(idle, atk) };
  });
  // Rigidly on their bones (the socket sits on the bone itself) in every pose...
  for (const [hd, td, wd] of res.d) {
    expect(hd).toBeLessThan(0.002);
    expect(td).toBeLessThan(0.002);
    expect(wd).toBeLessThan(0.002);
  }
  // ...and the bones carry them around as the clips play.
  expect(res.runMoved).toBeGreaterThan(0.05);
  expect(res.atkMoved).toBeGreaterThan(0.05);
});

// ---- O3: the Legacy family, Renown, tiers 1 to 3 ---------------------------------------------

test('O3: killing a named boss grants Renown once; level 2 opens tier 2', async ({ game }) => {
  const { page } = game;
  const r = await page.evaluate(`(async () => {
    const g = window.__game, o = g.origins, p = g.player, grant = ${RENOWN};
    g.crownRoad.threats.fillAll();
    const gorrak = g.crownRoad.threats.orcs.find((x) => x.kind === 'gorrak');
    const r0 = o.legacy.renown;
    gorrak.takeHit({ damage: 99999, poise: 999, dir: new g.THREE.Vector3(0, 0, 1), at: gorrak.center.clone(), crit: false, source: 'melee' });
    const r1 = o.legacy.renown;
    g.events.emit('deed', { id: 'boss:gorrak', renown: 2, label: 'again' });
    g.events.emit('deed', { id: 'boss:captainVess', renown: 2, label: 'Captain Vess' });
    const r2 = o.legacy.renown;
    await o.setOrigin('elf');
    grant(o, 5);
    const l1 = { lvl: p.paths.level('legendaryHero'), t1: o.abilities.owned('moonveil'), t2: o.abilities.owned('starlightVolley'), xp: p.paths.canInvest('legendaryHero') };
    grant(o, 15);
    const l2 = { lvl: p.paths.level('legendaryHero'), t2: o.abilities.owned('starlightVolley'), t3: o.abilities.owned('treeshape'), why: o.abilities.blocked('treeshape') };
    await o.setOrigin('human');
    return { r0, r1, r2, l1, l2 };
  })()`) as any;
  expect(r.r1 - r.r0).toBe(2);
  expect(r.r2 - r.r1).toBe(2); // Gorrak counted once; Captain Vess is a new deed
  expect(r.l1).toEqual({ lvl: 1, t1: true, t2: false, xp: false });
  expect(r.l2).toMatchObject({ lvl: 2, t2: true, t3: false });
  expect(r.l2.why).toContain('Legendary Hero 3');
});

test('O3: every tier-1 to tier-3 ability fires and costs what it says', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const { page } = game;
  const res = await page.evaluate(`(async () => {
    const g = window.__game, o = g.origins, p = g.player, grant = ${RENOWN};
    const foe = g.slimes.spawn('blue', p.pos.x, p.pos.z - 3);
    foe.update = () => {};
    foe.center.set(foe.position.x, foe.position.y + 0.9, foe.position.z);
    const out = {};
    for (const id of ['human', 'elf', 'dwarf', 'beastfolk', 'demon', 'dragonkin']) {
      await o.setOrigin(id);
      grant(o, 30);
      for (const t of o.def.tree.slice(0, 3)) {
        if (t.kind !== 'active') { out[t.id] = { passive: true, owned: o.abilities.owned(t.id) }; continue; }
        p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana; o.flight.energy = 100;
        p.lock = foe.alive ? foe : null;
        const before = { st: p.stamina, mp: p.mana, hp: p.hp };
        const why = o.abilities.use(t.id);
        const c = t.cost || {};
        out[t.id] = {
          why, cd: o.abilities.cooldown(t.id) === t.cd,
          paid: (c.stamina ? Math.abs(before.st - p.stamina - c.stamina) < 0.5 : true) && (c.mana ? Math.abs(before.mp - p.mana - c.mana) < 0.5 : true) && (c.hpPct ? Math.abs(before.hp - p.hp - p.maxHp * c.hpPct / 100) < 0.5 : true),
          again: o.abilities.use(t.id),
          st: o.abilities.state(),
        };
      }
      o.abilities.reset();
    }
    await o.setOrigin('human');
    return out;
  })()`) as Record<string, any>;
  const expectFired = (id: string, check: (s: any) => boolean) => {
    expect(res[id].why, id).toBeNull();
    expect(res[id].cd, id).toBe(true);
    expect(res[id].paid, id).toBe(true);
    expect(res[id].again, id).toContain('s'); // on cooldown now
    expect(check(res[id].st), id).toBe(true);
  };
  expectFired('rally', (s) => s.buffs.rally > 0);
  expectFired('banner', (s) => s.banner);
  expectFired('moonveil', (s) => s.buffs.veil > 0);
  expectFired('starlightVolley', (s) => s.motes === 5);
  expectFired('treeshape', (s) => s.buffs.treeshape > 0);
  expectFired('bulwark', (s) => s.dome);
  expectFired('mountainsWrath', () => true);
  expectFired('huntersMark', (s) => s.marked === 1);
  expectFired('savageHowl', (s) => s.fearful >= 1);
  expectFired('packCall', (s) => s.wolves === 2);
  expectFired('hellstep', () => true);
  expectFired('bloodAwakening', (s) => s.buffs.bloodAwakening > 0);
  for (const id of ['heroResolve', 'runeheart', 'demonicHide', 'glide', 'wingBurst', 'trueFlight']) expect(res[id]).toEqual({ passive: true, owned: true });
  expect(game.errors).toEqual([]);
});

test('O3: the Legacy family shows in the Skills screen with Renown and the tree', async ({ game }) => {
  const { page } = game;
  await page.evaluate(`(() => { const o = window.__game.origins; (${RENOWN})(o, 15); })()`);
  await page.evaluate(() => (window as any).__game.skills.toggle(true));
  const sk = page.locator('.sk:not(.sea)');
  await expect(sk.locator('.sk-disc', { hasText: 'Legendary Hero' })).toHaveCount(1);
  await sk.locator('.sk-disc', { hasText: 'Legendary Hero' }).locator('.nm').click();
  await expect(sk.locator('.lg-tier')).toHaveCount(6);
  await expect(sk.locator('.lg-tier.open')).toHaveCount(3); // the birthright and tiers I and II
  await page.screenshot({ path: 'test-results/origins-legacy.png' });
  // Put Rally on the moves bar from the page.
  await sk.locator('[data-bar="rally"][data-i="2"]').click();
  expect(await page.evaluate(() => (window as any).__game.player.equip.moves[2])).toBe('origin:rally');
  // Back out to the atlas before closing (the screen reopens where it was left).
  await page.evaluate(() => {
    const s = (window as any).__game.skills;
    s.closeTree();
    s.toggle(false);
  });
  expect(game.errors).toEqual([]);
});

// ---- O4: flight -------------------------------------------------------------------------------

const FLY_SETUP = `async (lvl, up) => {
  const g = window.__game, o = g.origins, p = g.player, T = g.THREE;
  await o.setOrigin('dragonkin');
  (${RENOWN})(o, [0, 5, 15, 30, 50, 80][lvl]);
  g.cam.yaw = Math.PI; g.cam.pitch = 0.22;
  p.teleport(new T.Vector3(p.pos.x, p.pos.y + up, p.pos.z));
  g.stepSim(2);
  return { g, o, p };
}`;

test('O4: a dragonkin glides far, a flap climbs, and energy drains in the air and returns on the ground', async ({ game }) => {
  const { page } = game;
  const r = await page.evaluate(`(async () => {
    const { g, o, p } = await (${FLY_SETUP})(2, 60);
    const start = p.pos.clone();
    g.input.press('KeyC');
    g.stepSim(180);
    const glide = { state: o.flight.state, dist: Math.hypot(p.pos.x - start.x, p.pos.z - start.z), drop: start.y - p.pos.y, energy: o.flight.energy };
    // Wing Burst: let go for a moment and press again.
    g.input.release('KeyC'); g.stepSim(4); g.input.press('KeyC');
    const y0 = p.pos.y, e0 = o.flight.energy;
    g.stepSim(45);
    const flap = { climb: p.pos.y - y0, cost: e0 - o.flight.energy };
    // Fall to the ground, then rest.
    g.input.releaseAll();
    for (let i = 0; i < 900 && !p.grounded; i++) g.stepSim(1);
    g.stepSim(10);
    const e1 = o.flight.energy;
    g.stepSim(120);
    const rest = { grounded: p.grounded, gain: o.flight.energy - e1 };
    // Compare: a human falls straight down.
    await o.setOrigin('human');
    p.teleport(new g.THREE.Vector3(p.pos.x, p.pos.y + 20, p.pos.z));
    g.input.press('KeyC');
    let t = 0;
    for (; t < 600 && !(p.grounded && t > 5); t++) g.stepSim(1);
    g.input.releaseAll();
    return { glide, flap, rest, humanFallSteps: t };
  })()`) as any;
  expect(r.glide.state).toBe('glide');
  expect(r.glide.dist).toBeGreaterThan(20); // 3 s on the wing
  expect(r.glide.drop).toBeLessThan(12);
  expect(r.glide.energy).toBeLessThan(100);
  expect(r.flap.climb).toBeGreaterThan(3);
  expect(r.flap.cost).toBeGreaterThanOrEqual(20);
  expect(r.rest.grounded).toBe(true);
  expect(r.rest.gain).toBeGreaterThan(20);
  expect(r.humanFallSteps).toBeLessThan(150);
  expect(game.errors).toEqual([]);
});

test('O4: True Flight climbs where you look; a fast landing rolls; the dive strikes', async ({ game }) => {
  const { page } = game;
  const r = await page.evaluate(`(async () => {
    const { g, o, p } = await (${FLY_SETUP})(4, 30);
    g.input.press('KeyC');
    g.stepSim(30);
    g.cam.pitch = -0.6; // look up
    g.input.press('KeyW');
    const y0 = p.pos.y;
    g.stepSim(90);
    const fly = { state: o.flight.state, climb: p.pos.y - y0 };
    // Dive into the ground looking down: a fast landing rolls you.
    g.input.release('KeyW');
    g.input.release('KeyC'); g.stepSim(25); g.input.press('KeyC');
    g.cam.pitch = 1.2;
    let rolled = false;
    for (let i = 0; i < 1500; i++) { g.stepSim(1); if (p.act && p.act.def.id === 'roll') rolled = true; if (p.grounded && i > 30) { g.stepSim(3); if (p.act && p.act.def.id === 'roll') rolled = true; break; } }
    const landing = { ...o.flight.lastLanding, rolled };
    g.input.releaseAll();
    g.stepSim(60);
    // Dragon's Descent: attack on the wing.
    p.teleport(new g.THREE.Vector3(p.pos.x, p.pos.y + 15, p.pos.z));
    g.cam.pitch = 0.22;
    g.stepSim(2);
    g.input.press('KeyC');
    g.stepSim(20);
    o.flight.energy = 100;
    const e0 = o.flight.energy;
    g.input.press('Mouse0'); g.stepSim(2); g.input.release('Mouse0');
    g.stepSim(4);
    const dive = { state: o.flight.state, cost: e0 - o.flight.energy };
    for (let i = 0; i < 600 && !p.grounded; i++) g.stepSim(1);
    g.stepSim(2);
    g.input.releaseAll();
    return { fly, landing, dive, diveLanding: o.flight.lastLanding };
  })()`) as any;
  expect(r.fly.state).toBe('fly');
  expect(r.fly.climb).toBeGreaterThan(4);
  expect(r.landing.fast).toBe(true);
  expect(r.landing.rolled).toBe(true);
  // (A dive at a dummy close below can already have landed.)
  expect(r.dive.state === 'dive' || r.diveLanding.dive).toBe(true);
  expect(r.dive.cost).toBeGreaterThanOrEqual(29);
  expect(r.diveLanding.dive).toBe(true);
});

test('O4: no flight in a dungeon', async ({ game }) => {
  const { page } = game;
  const r = await page.evaluate(`(async () => {
    const g = window.__game, o = g.origins, p = g.player;
    await o.setOrigin('dragonkin');
    (${RENOWN})(o, 80);
    await g.realm.enter(1, 'entrance');
    for (let i = 0; i < 120 && !p.grounded; i++) g.stepSim(1);
    g.input.press('KeyC');
    let flew = false;
    for (let i = 0; i < 50; i++) { g.stepSim(1); if (p.flying || o.flight.active) flew = true; }
    g.input.releaseAll();
    return { mode: g.realm.mode, flew, why: o.noFly() };
  })()`) as any;
  expect(r.mode).toBe('dungeon');
  expect(r.flew).toBe(false);
  expect(r.why).toContain('no sky');
});

// ---- O5: the capstones -------------------------------------------------------------------------

test('O5: every capstone fires, lasts its time and ends cleanly', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const { page } = game;
  const r = await page.evaluate(`(async () => {
    const g = window.__game, o = g.origins, p = g.player, grant = ${RENOWN};
    const out = {};
    const caps = { human: ['legendAwakened', 'legend', 20], elf: ['grace', 'grace', 10], dwarf: ['heartOfMountain', 'stone', 6], beastfolk: ['primalRage', 'rage', 20], demon: ['demonForm', 'demon', 25] };
    for (const [id, [cap, key, sec]] of Object.entries(caps)) {
      await o.setOrigin(id);
      grant(o, 80);
      p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;
      const why = o.abilities.use(cap);
      g.stepSim(30);
      const on = (o.abilities.state().buffs[key] || 0) > 0 || (o.forms.state().forms[key] || 0) > 0;
      const extra = {};
      if (key === 'stone') { const hp = p.hp; p.takeDamage(50); extra.stoneDmg = hp - p.hp; extra.immune = p.staggerImmune; }
      if (key === 'demon') {
        await window.W(40);
        extra.scale = p.char.root.scale.x;
        g.input.press('Mouse0'); g.stepSim(3); g.input.release('Mouse0');
        extra.move = p.act && p.act.def.id;
        g.stepSim(90);
      }
      if (key === 'rage') { extra.claws = o.forms.state().claws; extra.weapon = p.equip.model('main').visible; }
      g.stepSim(Math.round(sec * 60));
      await window.W(40);
      const after = { buff: o.abilities.state().buffs[key] || 0, forms: Object.keys(o.forms.state().forms).length, tinted: o.forms.state().tinted, claws: o.forms.state().claws, scale: +p.char.root.scale.x.toFixed(3), weapon: p.equip.model('main') ? p.equip.model('main').visible : true };
      if (key === 'demon') {
        g.input.press('Mouse0'); g.stepSim(3); g.input.release('Mouse0');
        after.move = p.act && p.act.def.id;
        g.stepSim(90);
      }
      out[id] = { why, on, extra, after };
      o.abilities.reset();
    }
    // Fire Breath: channelled while V is held, draining energy.
    await o.setOrigin('dragonkin');
    grant(o, 80);
    o.flight.energy = 100;
    const why = o.abilities.use('fireBreath');
    g.input.press('KeyV');
    g.stepSim(60);
    const held = { breathing: o.abilities.state().breathing, energy: o.flight.energy };
    g.input.release('KeyV');
    g.stepSim(5);
    out.dragonkin = { why, held, stopped: !o.abilities.state().breathing };
    await o.setOrigin('human');
    return out;
  })()`) as Record<string, any>;
  for (const id of ['human', 'elf', 'dwarf', 'beastfolk', 'demon']) {
    expect(r[id].why, id).toBeNull();
    expect(r[id].on, id).toBe(true);
    expect(r[id].after, id).toMatchObject({ buff: 0, forms: 0, tinted: 0, claws: 0, scale: 1, weapon: true });
  }
  expect(r.dwarf.extra.stoneDmg).toBe(0);
  expect(r.dwarf.extra.immune).toBe(true);
  expect(r.beastfolk.extra).toEqual({ claws: 2, weapon: false });
  expect(r.demon.extra.scale).toBeGreaterThan(1.15);
  expect(r.demon.extra.move).toBe('demonSlash1'); // the form's moveset...
  expect(r.demon.after.move).toBe('slash1'); // ...and back
  expect(r.dragonkin.why).toBeNull();
  expect(r.dragonkin.held.breathing).toBe(true);
  expect(r.dragonkin.held.energy).toBeLessThan(85);
  expect(r.dragonkin.stopped).toBe(true);
  expect(game.errors).toEqual([]);
});
