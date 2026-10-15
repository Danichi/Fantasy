import { test, expect, boot, SLOW } from './fixtures';

// Dungeons Reborn (docs/design/dungeons.md): the dungeon kit's grammar, traps,
// secrets and puzzles, the rebuilt crypt with Grukk's phases, Dungeoneering
// made real with the automap, and Hollow Ridge Caves and the Drowned Shrine.

/** In-page helpers every test below uses (as a string, so each evaluate can define them). */
const HELPERS = `
  const g = window.__game, T = g.THREE;
  const kitB = await import('/src/dungeon/kit/build.ts');
  const kitT = await import('/src/dungeon/kit/types.ts');
  const mk = (def, floor, seed, kp) => new kitB.KitInstance(def, floor, seed, g.r.scene, g.fx, kp ?? kitT.freshProgress(seed), g.realm.kitHooks(def, floor));
  const kill = (t, dmg = 99999) => t.takeHit({ damage: dmg, poise: 0, dir: new T.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'melee' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = (inst, n = 1, dt = 1 / 60) => { for (let k = 0; k < n; k++) inst.update(dt, g.player); };
  const label = (inst, re) => inst.interactables.find((i) => re.test(i.label()) && i.enabled());
`;
const run = <R,>(page: import('@playwright/test').Page, body: string): Promise<R> => page.evaluate(`(async () => { ${HELPERS} ${body} })()`) as Promise<R>;

test('D1: the grammar lays out 40 seeds of every plan: all rooms reachable, the key before the gate, shortcuts home', async ({ game }) => {
  const res = await run<{ bad: string[]; checked: number; wings: number[] }>(game.page, `
    const G = await import('/src/dungeon/kit/grammar.ts');
    const P = await import('/src/dungeon/dungeons/plans.ts');
    const sets = [['crypt', P.CRYPT_PLANS, 'crypt'], ['cave', P.CAVE_PLANS, 'cave'], ['shrine', P.SHRINE_PLANS, 'drowned'], ['test', P.TEST_PLANS, 'crypt']];
    const bad = []; let checked = 0; const wings = [];
    for (const [n, plans, theme] of sets) for (const plan of plans) for (let s = 1; s <= 40; s++) {
      const fg = G.buildFloor(plan, s * 7 + 3, { theme, traps: ['darts', 'portcullis', 'blade', 'collapse', 'gas', 'boulder'] });
      checked++;
      for (const v of G.validateFloor(fg)) bad.push(n + plan.floor + ':' + s + ' ' + v);
      // Spelled out too: every room reachable with every door open.
      const all = G.reachableRooms(fg, () => true);
      if (all.size !== fg.rooms.length) bad.push(n + ' unreachable rooms');
      // The key is reachable with every gate shut; the way on isn't.
      const plain = (d) => d.kind === 'open' || d.kind === 'arena';
      const before = G.reachableRooms(fg, plain);
      const keyRoom = fg.rooms.find((r) => r.tags.has('key'));
      if (keyRoom && !before.has(keyRoom.id)) bad.push(n + ' key behind gate');
      // Every shortcut opens from its far side onto the hub or the entry hall.
      for (const d of fg.doors.filter((q) => q.kind === 'shortcut')) {
        const home = fg.rooms[d.from === d.a ? d.b : d.a];
        if (home.role !== 'hub' && home.role !== 'entry') bad.push(n + ' shortcut ' + d.id + ' leads to ' + home.role);
      }
      for (const z of plan.zones.filter((q) => q.role === 'wing')) wings.push(fg.rooms.filter((r) => r.zone === z.id).length);
    }
    return { bad, checked, wings };
  `);
  expect(res.bad).toEqual([]);
  expect(res.checked).toBe(40 * 7);
  expect(Math.min(...res.wings)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...res.wings)).toBeLessThanOrEqual(6);
});

test('D2: every trap fires and shows its tell; a cracked wall breaks to a heavy blow but not a light one', async ({ game }) => {
  test.setTimeout(180_000 * SLOW);
  const res = await run<Record<string, unknown>>(game.page, `
    const def = g.dungeons.kitTest;
    const seen = {};
    let wall = null;
    for (let s = 1; s <= 30 && (Object.keys(seen).length < 6 || !wall); s++) {
      const inst = mk(def, 1, s);
      for (const rt of inst.traps.list) {
        if (seen[rt.t.kind]) continue;
        const tell = rt.tell.length > 0 && rt.tell.every((o) => o.visible);
        inst.traps.fire(rt, g.player);
        tick(inst, 50);
        let fired = rt.fired > 0;
        if (rt.t.kind === 'darts') fired = fired && (rt.s.darts.length > 0 || rt.fired > 0);
        if (rt.t.kind === 'collapse') fired = inst.traps.pitOpen(rt.t.cell[1] * inst.fg.w + rt.t.cell[0]);
        if (rt.t.kind === 'portcullis') fired = fired && !!rt.s.col;
        if (rt.t.kind === 'boulder') fired = fired && (rt.s.rolling || rt.s.ball.position.distanceTo(rt.s.start) > 0.01 || rt.fired > 0);
        if (rt.t.kind === 'blade') { const a0 = rt.s.pivot.rotation.x; tick(inst, 20); fired = Math.abs(rt.s.pivot.rotation.x - a0) > 0.01; }
        seen[rt.t.kind] = { tell, fired };
      }
      const cracked = inst.secrets.list.find((q) => q.kind === 'cracked');
      if (cracked && !wall) {
        kill(cracked.target, 50); // a light blow (poise 0)
        const after1 = cracked.found;
        cracked.target.takeHit({ damage: 60, poise: 80, dir: new T.Vector3(0, 0, 1), at: cracked.pos.clone(), crit: false, source: 'melee' });
        wall = { light: after1, heavy: cracked.found, colliderGone: !cracked.col, door: inst.doors.find((d) => d.d.id === cracked.id)?.open };
      }
      inst.dispose();
    }
    return { seen, wall };
  `);
  for (const k of ['darts', 'portcullis', 'blade', 'collapse', 'gas', 'boulder']) expect((res.seen as any)[k], k).toEqual({ tell: true, fired: true });
  expect(res.wall).toEqual({ light: false, heavy: true, colliderGone: true, door: true });
});

test('D2: each puzzle opens its door when solved, and through its fallback fight', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const res = await run<Record<string, unknown>>(game.page, `
    const out = {};
    const cases = [[g.realm.crypt, 1], [g.realm.crypt, 2], [g.dungeons.hollowRidge, 1], [g.dungeons.drownedShrine, 1], [g.dungeons.drownedShrine, 2]];
    for (const [def, floor] of cases) {
      // Solved properly.
      let inst = mk(def, floor, 11);
      const pz = inst.puzzles;
      const door = () => inst.doors.find((d) => d.d.kind === 'sealed' && d.d.mech?.includes(pz.id));
      const before = door()?.open;
      if (pz.kind === 'dial') for (let k = 0; k < 3; k++) while (pz.state[k] !== pz.answer[k]) pz.turn(k);
      if (pz.kind === 'mirrors') for (let k = 0; k < 2; k++) while (pz.state[k] !== pz.answer[k]) pz.rotate(k);
      if (pz.kind === 'weights') for (const k of pz.answer) pz.step(k);
      if (pz.kind === 'bells') { pz.ring((pz.answer[0] + 1) % 3); for (const k of pz.answer) pz.ring(k); }
      if (pz.kind === 'lever') label(inst, /lever/).action();
      const solved = { kind: pz.kind, before, after: door()?.open, mech: inst.progress.mech.includes(pz.id) };
      inst.dispose();
      // Through the fallback: a hard fight.
      let fallback = null;
      if (pz.kind !== 'lever') {
        inst = mk(def, floor, 11);
        inst.puzzles.challenge();
        const foes = inst.puzzles['challengers'];
        for (const m of foes) { await m.obj.ready; kill(m.obj); }
        tick(inst, 3);
        fallback = { foes: foes.length, open: inst.doors.find((d) => d.d.kind === 'sealed' && d.d.mech?.includes(inst.puzzles.id))?.open };
        inst.dispose();
      }
      out[def.id + floor] = { ...solved, fallback };
    }
    return out;
  `);
  const r = res as Record<string, any>;
  expect(Object.values(r).map((x) => x.kind).sort()).toEqual(['bells', 'dial', 'lever', 'mirrors', 'weights']);
  for (const [k, v] of Object.entries(r)) {
    expect(v.before, k).toBe(false);
    expect(v.after, k).toBe(true);
    expect(v.mech, k).toBe(true);
    if (v.kind !== 'lever') expect(v.fallback, k).toEqual({ foes: 3, open: true });
  }
});

test('D3: the crypt can be finished end to end; Grukk changes phase at 60% and 25%; the shortcut opens after him', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const res = await run<Record<string, any>>(game.page, `
    const out = {};
    const deeds = []; const died = [];
    const off1 = g.events.on('deed', (d) => deeds.push(d.id));
    const off2 = g.events.on('enemyDied', (d) => died.push(d.kind));
    await g.realm.enter(1, 'entrance');
    let inst = g.realm.instance;
    for (const m of inst.mobs) m.obj.dispose(); inst.mobs = [];
    // The key, the portcullis, the dial, the seal.
    label(inst, /Take the Crypt Key/).action();
    out.key = g.player.equip.items.some((i) => i.def.id === 'cryptKey');
    label(inst, /Unlock the gate/).action();
    out.gate = g.realm.progress.gateOpen;
    const pz = inst.puzzles;
    for (let k = 0; k < 3; k++) while (pz.state[k] !== pz.answer[k]) pz.turn(k);
    out.seal = inst.doors.find((d) => d.d.id === 'f1-seal').open;
    // Down the stairs.
    label(inst, /Descend/).action();
    for (let i = 0; i < 100 && (g.realm.busy || g.realm.floor !== 2); i++) await sleep(100);
    inst = g.realm.instance;
    out.floor2 = g.realm.floor;
    for (const m of inst.mobs) m.obj.dispose(); inst.mobs = [];
    const bz = inst.puzzles;
    for (const k of bz.answer) bz.ring(k);
    out.chapelDoor = inst.doors.find((d) => d.d.id === 'f2-chapel-door').open;
    // Into the chapel: the arena seals, the name card shows.
    const o = inst.bossTarget;
    out.grukkKind = o.kind;
    const arena = inst.fg.rooms.find((r) => r.role === 'boss');
    g.player.teleport(inst.centreOf(arena).add(new T.Vector3(0, 0.3, 6)));
    for (let i = 0; i < 40 && !inst.boss.started; i++) await sleep(50);
    out.sealed = !inst.doors.find((d) => d.d.kind === 'arena').open;
    g.player.invulnerable = true;
    const hp = o.maxHp;
    kill(o, hp * 0.45);
    for (let i = 0; i < 40 && inst.boss.phase < 1; i++) await sleep(50);
    out.phase60 = inst.boss.phase;
    out.adds = inst.orcs.length;
    kill(o, hp * 0.35);
    for (let i = 0; i < 40 && inst.boss.phase < 2; i++) await sleep(50);
    out.phase25 = inst.boss.phase;
    kill(o);
    await sleep(400);
    out.bossDead = g.realm.progress.bossDead;
    out.reward = inst.doors.find((d) => d.d.kind === 'reward').open;
    out.arenaOpen = inst.doors.find((d) => d.d.kind === 'arena').open;
    // The kings' stair: barred from the hub side, opened from the far side.
    const sc = inst.doors.find((d) => d.d.id === 'f2-return');
    const ret = inst.fg.rooms[sc.d.from];
    g.player.teleport(inst.centreOf(ret).add(new T.Vector3(0, 0.3, 0)));
    for (let i = 0; i < 40 && inst.room !== ret.id; i++) await sleep(50);
    const it = inst.interactables.find((i) => /Lift the bar/.test(i.label()));
    it?.action();
    out.shortcut = sc.open;
    out.portal = inst.interactables.some((i) => /portal/.test(i.label()));
    g.player.invulnerable = false;
    off1(); off2();
    out.deeds = deeds; out.died = died;
    await g.realm.leave();
    return out;
  `);
  expect(res.key).toBe(true);
  expect(res.gate).toBe(true);
  expect(res.seal).toBe(true);
  expect(res.floor2).toBe(2);
  expect(res.chapelDoor).toBe(true);
  expect(res.grukkKind).toBe('grukk');
  expect(res.sealed).toBe(true);
  expect(res.phase60).toBe(1);
  expect(res.adds).toBeGreaterThanOrEqual(2);
  expect(res.phase25).toBe(2);
  expect(res.bossDead).toBe(true);
  expect(res.reward).toBe(true);
  expect(res.arenaOpen).toBe(true);
  expect(res.shortcut).toBe(true);
  expect(res.portal).toBe(true);
  expect(res.died).toContain('grukk');
  expect(res.deeds).toContain('boss:grukk');
  expect(res.deeds).toContain('place:crypt');
});

test('D4: each Dungeoneering node changes what it says; the automap shows seen rooms only', async ({ game }) => {
  test.setTimeout(180_000 * SLOW);
  const res = await run<Record<string, any>>(game.page, `
    const P = g.player.paths;
    const { treeOf } = await import('/src/paths/paths.ts');
    const { DISC } = await import('/src/paths/data.ts');
    const { PASSIVES } = await import('/src/paths/effects.ts');
    const t = treeOf(DISC.dungeoneering);
    const id = (name) => t.nodes.find((n) => n.name === name).id;
    const learn = (names) => { P.lv.dungeoneering = 30; P.nodes.dungeoneering = {}; for (const n of names) P.nodes.dungeoneering[id(n)] = { r: 1 }; };
    const out = { texts: {} };
    for (const n of ['Torchbearer', "Cartographer's Eye", 'Trap Sense', "Delver's Sense", 'Light Feet', 'Treasure Nose', 'Deep Breath', 'Master Delver']) out.texts[n] = PASSIVES['dungeoneering:' + n]?.text ?? null;
    await g.realm.enterKit(g.dungeons.kitTest, 1, 'entrance');
    const inst = g.realm.instance;
    // Torchbearer: the light reaches further.
    learn([]); tick(inst, 2); const d0 = inst['lantern'].distance;
    learn(['Torchbearer']); tick(inst, 2); out.light = [d0, inst['lantern'].distance];
    // Trap Sense: outlines within 8 m.
    const rt = inst.traps.list[0];
    const near = rt.outline.getWorldPosition(new T.Vector3()).add(new T.Vector3(2, 0.3, 0));
    g.player.teleport(near);
    learn([]); tick(inst, 2); const o0 = rt.outline.visible;
    learn(['Trap Sense']); tick(inst, 2); out.outline = [o0, rt.outline.visible];
    // Delver's Sense: hidden walls shimmer within 10 m.
    const sec = inst.secrets.list[0];
    g.player.teleport(sec.pos.clone().add(new T.Vector3(1.5, 0.3, 1.5)));
    learn([]); tick(inst, 2); const s0 = sec.shimmer.visible;
    learn(["Delver's Sense"]); tick(inst, 2); out.shimmer = [s0, sec.shimmer.visible, sec.kind];
    // Master Delver: a lock opens without its key.
    learn([]); const lk = inst.interactables.find((i) => /Locked gate/.test(i.label()));
    const lab0 = lk.label();
    learn(['Master Delver']); out.master = [lab0, lk.label()];
    lk.action();
    out.forced = inst.doors.find((d) => d.d.kind === 'locked').open && inst.progress.masterUsed;
    // Light Feet: a plate stays quiet at a walk.
    const plateTrap = inst.traps.list.find((q) => q.plate && q.t.kind !== 'collapse');
    out.lightFeet = null;
    if (plateTrap) {
      learn(['Light Feet']); plateTrap.fired = 0; plateTrap.cool = 0;
      g.player.teleport(inst.cellCenter(plateTrap.plate[0], plateTrap.plate[1]).setY(0.3));
      for (let i = 0; i < 30 && !g.player.grounded; i++) await sleep(30);
      g.player.sprinting = false; tick(inst, 3); const walk = plateTrap.fired;
      learn([]); plateTrap.cool = 0; tick(inst, 3); out.lightFeet = [walk, plateTrap.fired];
    }
    // The automap: nothing without the perk; with it, only the rooms you've seen.
    learn([]);
    const before = inst.autoLayer(g.realm.perks).fill.filter(Boolean).length;
    learn(["Cartographer's Eye"]);
    const seen = inst.progress.seen['1'] ?? [];
    const layer = inst.autoLayer(g.realm.perks);
    const cells = layer.fill.map((v, k) => (v ? inst.fg.roomAt[k] : -1)).filter((r) => r >= 0);
    out.auto = { before, filled: cells.length, onlySeen: cells.every((r) => seen.includes(r)), seen: seen.length, total: inst.fg.rooms.length };
    for (let i = 0; i < 20 && !g.mapUI.auto; i++) await sleep(60);
    out.mapHasAuto = !!g.mapUI.auto;
    // Treasure Nose: chests on the map.
    learn(['Treasure Nose']);
    out.chestIcons = Object.values(inst.autoLayer(g.realm.perks).icons).filter((v) => v === 'chest').length;
    learn([]); P.lv.dungeoneering = 0;
    await g.realm.leave();
    return out;
  `);
  for (const [k, v] of Object.entries(res.texts)) expect(v, k).toBeTruthy();
  expect(res.light[1]).toBeGreaterThan(res.light[0]);
  expect(res.outline).toEqual([false, true]);
  expect(res.shimmer.slice(0, 2)).toEqual([false, true]);
  expect(res.master[0]).toMatch(/Locked gate/);
  expect(res.master[1]).toMatch(/Master Delver/);
  expect(res.forced).toBe(true);
  if (res.lightFeet) expect(res.lightFeet).toEqual([0, 1]);
  expect(res.auto.before).toBe(0);
  expect(res.auto.filled).toBeGreaterThan(0);
  expect(res.auto.onlySeen).toBe(true);
  expect(res.auto.seen).toBeLessThan(res.auto.total);
  expect(res.mapHasAuto).toBe(true);
  expect(res.chestIcons).toBeGreaterThan(0);
});

test('D5: Hollow Ridge Caves and the Drowned Shrine can be finished; the shrine floods in the fight', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const res = await run<Record<string, any>>(game.page, `
    const out = {};
    const deeds = [];
    const off = g.events.on('deed', (d) => deeds.push(d.id));
    // The doors are there in the world.
    out.doors = ['Enter Hollow Ridge Caves', 'Go down into the Drowned Shrine'].map((l) => g.realm.overworldInteractables.some((i) => i.label() === l));
    g.player.invulnerable = true;
    const clear = (inst) => { for (const m of inst.mobs) m.obj.dispose(); inst.mobs = []; };
    const solve = (inst) => {
      const pz = inst.puzzles;
      if (pz.kind === 'dial') for (let k = 0; k < 3; k++) while (pz.state[k] !== pz.answer[k]) pz.turn(k);
      if (pz.kind === 'mirrors') for (let k = 0; k < 2; k++) while (pz.state[k] !== pz.answer[k]) pz.rotate(k);
      if (pz.kind === 'weights') for (const k of pz.answer) pz.step(k);
      if (pz.kind === 'bells') for (const k of pz.answer) pz.ring(k);
      if (pz.kind === 'lever') label(inst, /lever/).action();
    };
    const fight = async (inst, mid) => {
      const o = inst.bossTarget;
      const arena = inst.fg.rooms.find((r) => r.role === 'boss');
      g.player.teleport(inst.centreOf(arena).add(new T.Vector3(0, 0.3, 6)));
      for (let i = 0; i < 40 && !inst.boss.started; i++) await sleep(50);
      kill(o, o.maxHp * 0.45);
      for (let i = 0; i < 40 && inst.boss.phase < 1; i++) await sleep(50);
      await mid?.();
      kill(o);
      for (let i = 0; i < 40 && !inst.progress.boss; i++) await sleep(50);
      return { boss: inst.progress.boss, reward: inst.doors.find((d) => d.d.kind === 'reward').open };
    };
    // Hollow Ridge: key, winch plates, gate, Vess.
    await g.realm.enterKit(g.dungeons.hollowRidge, 1, 'entrance');
    let inst = g.realm.instance;
    clear(inst);
    label(inst, /Take the Smuggler/).action();
    solve(inst);
    label(inst, /Unlock the gate/).action();
    out.caveGates = inst.doors.filter((d) => d.d.kind === 'locked' || d.d.kind === 'sealed').map((d) => d.open);
    out.vess = await fight(inst);
    out.vessKind = inst.def.boss.def.kind;
    await g.realm.leave();
    // The Drowned Shrine: two floors, the water rises.
    await g.realm.enterKit(g.dungeons.drownedShrine, 1, 'entrance');
    inst = g.realm.instance;
    clear(inst);
    label(inst, /Take the Tide Key/).action();
    solve(inst);
    label(inst, /Unlock the gate/).action();
    out.shrineGates = inst.doors.filter((d) => d.d.kind === 'locked' || d.d.kind === 'sealed').map((d) => d.open);
    label(inst, /Descend/).action();
    for (let i = 0; i < 100 && (g.realm.busy || g.realm.floor !== 2); i++) await sleep(100);
    inst = g.realm.instance;
    clear(inst);
    solve(inst);
    out.basinDoor = inst.doors.find((d) => d.d.kind === 'sealed').open;
    out.warden = await fight(inst, async () => {
      const f = inst.boss;
      out.water0 = f.s.level;
      for (let i = 0; i < 80 && f.s.level < 0.35; i++) await sleep(100);
      out.water1 = f.s.level;
      const c = inst.centreOf(f.room);
      out.wading = inst.groundAt(c.x, c.z + 2);
    });
    await g.realm.leave();
    g.player.invulnerable = false;
    off();
    out.deeds = deeds;
    return out;
  `);
  expect(res.doors).toEqual([true, true]);
  expect(res.caveGates).toEqual([true, true]);
  expect(res.vess).toEqual({ boss: true, reward: true });
  expect(res.shrineGates).toEqual([true, true]);
  expect(res.basinDoor).toBe(true);
  expect(res.water1).toBeGreaterThan(res.water0 + 0.2);
  expect(res.wading).toBeLessThan(-0.5);
  expect(res.warden).toEqual({ boss: true, reward: true });
  for (const d of ['boss:captainVess', 'boss:tideWarden', 'place:hollowRidge', 'place:drownedShrine']) expect(res.deeds).toContain(d);
});

test('D5: dungeon progress survives a reload mid-dungeon', async ({ page }) => {
  test.setTimeout(400_000 * SLOW);
  await boot(page, '?test&save');
  const before = await run<Record<string, any>>(page, `
    localStorage.clear();
    await g.realm.enterKit(g.dungeons.drownedShrine, 1, 'entrance');
    const inst = g.realm.instance;
    label(inst, /Take the Tide Key/).action();
    const pz = inst.puzzles;
    for (let k = 0; k < 2; k++) while (pz.state[k] !== pz.answer[k]) pz.rotate(k);
    // A shortcut opened from its far side, and a chest.
    const sc = inst.doors.find((d) => d.d.kind === 'shortcut');
    if (sc) inst.openDoor(sc.d.id);
    g.save();
    const kp = g.realm.progress.kit.drownedShrine;
    return { seed: kp.seed, mech: [...kp.mech], doors: [...kp.doors], seen: (kp.seen['1'] ?? []).length };
  `);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const after = await run<Record<string, any>>(page, `
    const kp = g.realm.progress.kit?.drownedShrine;
    const saved = kp ? { seed: kp.seed, mech: [...kp.mech], doors: [...kp.doors], seen: (kp.seen['1'] ?? []).length } : null;
    await g.realm.enterKit(g.dungeons.drownedShrine, 1, 'entrance');
    const inst = g.realm.instance;
    const sealOpen = inst.doors.find((d) => d.d.kind === 'sealed').open;
    const scOpen = inst.doors.filter((d) => d.d.kind === 'shortcut' && kp.doors.includes(d.d.id)).every((d) => d.open);
    const keyGone = !inst.interactables.some((i) => /Take the Tide Key/.test(i.label()) && i.enabled());
    await g.realm.leave();
    localStorage.clear();
    return { saved, sealOpen, scOpen, keyGone };
  `);
  expect(before.mech).toContain('shrine-mirrors');
  expect(after.saved).toEqual(before);
  expect(after.sealOpen).toBe(true);
  expect(after.scOpen).toBe(true);
  expect(after.keyGone).toBe(true);
});
