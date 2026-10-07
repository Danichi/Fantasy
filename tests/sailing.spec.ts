import { test, expect, SLOW } from './fixtures';

// Sailing (docs/design/boating.md): owning, renting, upgrading and crewing
// ships; the sea getting rougher the further out you go; storms that throw a
// ship off course; decks you can walk while she sails; ships that sink for
// good and leave wrecks to dive; broadsides, boarders and sea serpents.

type Opt = { label: string; run: () => void };

test('the shipwright sells and refits ships, the broker finds crew, and it all saves', async ({ game }) => {
  test.setTimeout(120_000 * SLOW);
  const res = await game.page.evaluate(async () => {
    const g = window.__game, sl = g.sailing;
    const SS = await import('/src/world/sea/seaState.ts');
    const { HULLS } = await import('/src/world/sea/shipTypes.ts');
    // Drive a dialogue menu: each step picks the option whose label matches.
    const menu = (open: (show: (t: string, o: Opt[]) => void, back: () => void) => Opt[], ...picks: RegExp[]) => {
      let opts = open((_t, o) => (opts = o), () => {});
      const seen: string[] = [];
      for (const re of picks) {
        const o = opts.find((x) => re.test(x.label));
        seen.push(o ? o.label : `!! no ${re} in [${opts.map((x) => x.label).join(' | ')}]`);
        if (!o) break;
        o.run();
      }
      return seen;
    };
    const out: Record<string, unknown> = {};
    g.player.prog.addGold(50000);
    // A novice can't command a cutter.
    const gold0 = g.player.prog.gold;
    menu((s, b) => sl.shipwrightOptions(s, b), /^Buy a ship/, /^Cutter/);
    out.noviceRefused = sl.records.length === 0 && g.player.prog.gold === gold0;
    sl.xp = 1e6;
    out.level = sl.level;
    out.buy = menu((s, b) => sl.shipwrightOptions(s, b), /^Buy a ship/, /^Cutter/, /./);
    out.owned = sl.records.map((r: { hull: string }) => r.hull);
    out.paid = gold0 - g.player.prog.gold === HULLS.cutter.price;
    const ship = sl.ships.get(sl.records[0].id);
    const speed0 = ship.stats.speed;
    out.upgrade = menu((s, b) => sl.shipwrightOptions(s, b), /^Upgrade a ship/, /Cutter/, /^Sails:/);
    out.fit = { ...sl.records[0].fit };
    out.faster = ship.stats.speed > speed0;
    // Crew from the broker.
    out.crew0 = sl.crew.length;
    out.hire = menu((s, b) => sl.brokerOptions(s, b), /looking for a berth/, /g a day/);
    out.crew = sl.crew.map((c: { role: string }) => c.role);
    // A hired skiff.
    sl.rent('skiff');
    out.rental = sl.rental?.hull;
    // The sea gets wilder the further from Port Aurelle.
    out.danger = [SS.dangerAt(2990, 200), SS.dangerAt(4200, 200), SS.dangerAt(7800, 600), SS.dangerAt(9300, 6100)].map((d: number) => +d.toFixed(2));
    // Saving and loading keeps the fleet, the refit, the crew and Seamanship.
    const j = JSON.parse(JSON.stringify(sl.toJSON()));
    sl.reset();
    out.afterReset = sl.records.length;
    sl.fromJSON(j);
    out.restored = { ships: sl.records.length, sails: sl.records[0]?.fit.sails, crew: sl.crew.length, level: sl.level, rental: sl.rental?.hull, live: sl.ships.size };
    return out;
  });
  console.log(JSON.stringify(res));
  expect(res.noviceRefused).toBe(true);
  expect(res.owned).toEqual(['cutter']);
  expect(res.paid).toBe(true);
  expect((res.fit as { sails: number }).sails).toBe(1);
  expect(res.faster).toBe(true);
  expect(res.crew).toHaveLength(1);
  expect(res.rental).toBe('skiff');
  const d = res.danger as number[];
  expect(d[0]).toBeLessThan(d[1]);
  expect(d[1]).toBeLessThan(d[2]);
  expect(d[3]).toBeGreaterThan(3);
  expect(res.afterReset).toBe(0);
  expect(res.restored).toMatchObject({ ships: 1, sails: 1, crew: 1, rental: 'skiff' });
});

test('storms throw a ship off course, the deck carries you, and a sunk ship is gone for good', async ({ game }) => {
  test.setTimeout(180_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, sl = g.sailing, inp = g.input;
    const SS = await import('/src/world/sea/seaState.ts');
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const out: Record<string, unknown> = {};
    g.player.prog.addGold(100000);
    sl.xp = 1e6;
    // A skiff caught in a storm far out.
    const sk = sl.rent('skiff');
    sk.pos.set(5200, 0, 300);
    sl.board(sk);
    SS.brewStorm(5200, 300, 900, 1);
    inp.press('KeyW');
    let kick = 0, thrown = 0;
    for (let i = 0; i < 16; i++) {
      await wait(250);
      kick = Math.max(kick, Math.abs(sk.kick));
      thrown = Math.max(thrown, sk.thrown);
    }
    inp.release('KeyW');
    out.storm = { waves: +SS.waveHeight(SS.SEA.amp, SS.cellStormAt(5200, 300)).toFixed(1), kick: +kick.toFixed(2), thrown: +thrown.toFixed(2) };
    SS.STORMS.length = 0;
    // A galleon under sail: walk her deck.
    const r = sl.buy('galleon');
    const gal = sl.ships.get(r.id);
    gal.pos.set(4200, 0, 200);
    gal.yaw = 0.4;
    sl.board(gal);
    sl.takeHelm();
    inp.press('KeyW');
    await wait(2500);
    inp.release('KeyW');
    sl.leaveHelm();
    const p0 = gal.pos.clone();
    const local0 = gal.toLocal(g.player.pos.clone());
    await wait(3000);
    const local1 = gal.toLocal(g.player.pos.clone());
    out.deck = { sailed: +gal.pos.distanceTo(p0).toFixed(1), onDeck: gal.onDeck(g.player.pos), slid: +Math.hypot(local1.x - local0.x, local1.z - local0.z).toFixed(2), swimming: g.player.swimming };
    // Flood her: she goes down, off the books, and leaves a wreck to dive.
    const owned = sl.records.length;
    gal.water = 1;
    await wait(1500);
    out.sunk = { sunk: gal.sunk, owned: sl.records.length, was: owned, wrecks: sl.wrecks.length };
    const w = sl.wrecks[0];
    g.player.teleport(new T.Vector3(w.x + 2, 0, w.z));
    await wait(800);
    inp.press('KeyC');
    await wait(2500);
    const search = sl.interactables.find((i: { label: () => string }) => /Search the wreck/.test(i.label()));
    out.dive = { swimming: g.player.swimming, under: g.player.underwater, breath: +g.player.breath.toFixed(2), canSearch: !!search?.enabled() };
    const gold = g.player.prog.gold;
    search?.action();
    inp.release('KeyC');
    out.searched = { gold: g.player.prog.gold - gold, done: w.searched };
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  const st = res.storm as { kick: number; thrown: number; waves: number };
  expect(st.waves).toBeGreaterThan(5);
  expect(st.thrown).toBeGreaterThan(0.5);
  expect(st.kick).toBeGreaterThan(0.03);
  const dk = res.deck as { sailed: number; onDeck: boolean; slid: number; swimming: boolean };
  expect(dk.sailed).toBeGreaterThan(3);
  expect(dk.onDeck).toBe(true);
  expect(dk.slid).toBeLessThan(1);
  expect(dk.swimming).toBe(false);
  expect(res.sunk).toMatchObject({ sunk: true, owned: 0, wrecks: 1 });
  expect(res.dive).toMatchObject({ under: true, canSearch: true });
  expect((res.searched as { done: boolean }).done).toBe(true);
});

test('broadsides hit, pirates grapple and board, and the harpoon finds a sea serpent', async ({ game }) => {
  test.setTimeout(180_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, sl = g.sailing, inp = g.input;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const out: Record<string, unknown> = {};
    g.player.prog.addGold(100000);
    sl.xp = 1e6;
    const r = sl.buy('galleon');
    const gal = sl.ships.get(r.id);
    r.fit = { ...r.fit, guns: 3, harpoon: 2 };
    gal.refit(r.fit);
    gal.pos.set(4200, 0, 200);
    gal.yaw = 0;
    sl.board(gal);
    sl.takeHelm();
    // A pirate off the starboard beam (right of a ship heading +z is -x).
    const pr = sl.spawnPirate(new T.Vector3(4150, 0, 200), 2.5);
    pr.ship.yaw = 0;
    await wait(600);
    const right = new T.Vector3(-Math.cos(gal.yaw), 0, Math.sin(gal.yaw));
    g.cam.yaw = Math.atan2(right.x, right.z);
    inp.press('Mouse0');
    await wait(120);
    inp.release('Mouse0');
    out.fired = sl.gunnery.flying;
    await wait(2500);
    out.pirateHull = +pr.ship.hullFrac.toFixed(2);
    // Heave to: they close under sweeps, grapple and send boarders.
    gal.speed = 0;
    sl.leaveHelm();
    for (let i = 0; i < 40 && !pr.grappled; i++) await wait(250);
    await wait(1500);
    out.boarding = { grappled: pr.grappled, boarders: pr.boarders.length, onDeck: pr.boarders.filter((b: { position: unknown }) => gal.onDeck(b.position)).length };
    // A sea serpent: the harpoon lays onto it when it's near the line of sight.
    const sp = sl.spawnSerpent(gal.pos.clone().add(new T.Vector3(0, 0, 40)), 3);
    const hp0 = sp.hp;
    await wait(400); // under way, so there's a course to lead
    sl.gunnery.harpoon(gal, new T.Vector3(0, 0, 1), true, { pos: sp.pos, vel: sp.vel });
    await wait(2000);
    out.serpent = { hp0, hp: sp.hp };
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  expect(res.fired).toBeGreaterThan(0);
  expect(res.pirateHull).toBeLessThan(1);
  expect(res.boarding).toMatchObject({ grappled: true });
  expect((res.boarding as { onDeck: number }).onDeck).toBeGreaterThan(0);
  const s = res.serpent as { hp0: number; hp: number };
  expect(s.hp).toBeLessThan(s.hp0);
});

test('the Seamanship calling: skills open by level, the wheel can be lashed, tacks, currents and the trawl', async ({ game }) => {
  test.setTimeout(150_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, sl = g.sailing, inp = g.input, SS = g.seaState;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const toasts: string[] = [];
    const ot = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => { toasts.push(m); ot(m); };
    const out: Record<string, unknown> = {};
    g.player.prog.addGold(100000);
    out.tooEarly = sl.learn('stormHand');
    sl.xp = 1e6;
    for (const id of ['lungs', 'lungs', 'trawl', 'steadyHand', 'compass']) out['learn_' + id] = sl.learn(id);
    // A cutter on a beam reach: lash the wheel and she holds her heading.
    const r = sl.buy('cutter');
    const s = sl.ships.get(r.id);
    s.pos.set(4200, 0, -600);
    s.yaw = 0;
    sl.board(s);
    sl.takeHelm();
    const wind = SS.windAt(s.pos.x, s.pos.z);
    const into = Math.atan2(-wind.dir.x, -wind.dir.y);
    s.yaw = into + 0.95;
    s.sailSet = 1;
    sl.ctl.sail = 1;
    await wait(2500);
    inp.press('KeyL');
    await wait(150);
    inp.release('KeyL');
    const y0 = s.yaw;
    await wait(2500);
    out.breathTime = g.player.breathTime;
    out.lashed = { atHelm: sl.atHelm, held: Math.abs(Math.atan2(Math.sin(s.yaw - y0), Math.cos(s.yaw - y0))) < 0.05 };
    // Back to the wheel and tack: turn right through the eye of the wind.
    sl.takeHelm();
    inp.press('KeyD');
    for (let i = 0; i < 60 && !toasts.some((t) => /tack/i.test(t)); i++) await wait(150);
    inp.release('KeyD');
    out.tack = toasts.find((t) => /tack/i.test(t)) ?? null;
    // The trawl hauls in fish while she sails slow.
    sl.trawlT = 44.5;
    s.speed = 2;
    sl.ctl.sail = 0.4;
    await wait(1500);
    out.trawl = toasts.find((t) => /trawl/i.test(t)) ?? null;
    // The Aurelle Stream carries her (and is learned the first time).
    s.pos.set(3900, 0, 620);
    await wait(800);
    out.current = { id: s.currentId, speed: +s.currentSpeed.toFixed(2), known: sl.knownCurrents.has('aurelleStream') };
    out.hud = (document.querySelector('.helm') as HTMLElement | null)?.innerText ?? '';
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  expect(res.tooEarly).toBe('Seamanship 10');
  expect(res.learn_lungs).toBeNull();
  expect(res.breathTime).toBeCloseTo(25 * 1.6, 1);
  expect(res.lashed).toEqual({ atHelm: false, held: true });
  expect(res.tack).toMatch(/tack/);
  expect(res.trawl).toMatch(/trawl/);
  expect(res.current).toMatchObject({ id: 'aurelleStream', known: true });
  expect(res.hud).toMatch(/Heading \d+°/);
});

test('ship against ship: chain and grape, boarding, prizes and ransoms, the harpoon line, the Black Tide', async ({ game }) => {
  test.setTimeout(180_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, sl = g.sailing, inp = g.input;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const out: Record<string, unknown> = {};
    const pick = (re: RegExp) => g.dialogue.options.find((o: { label: string }) => re.test(o.label))?.run();
    g.player.prog.addGold(100000);
    sl.xp = 1e6;
    for (const id of ['quickLoad', 'harpooner', 'chainShot', 'quartermaster', 'bigCrew', 'boardingParty', 'steadyCrew', 'prizeCrew']) sl.learn(id);
    out.kinds = sl.shotKinds();
    const r = sl.buy('galleon');
    r.fit = { ...r.fit, guns: 3, harpoon: 2 };
    const gal = sl.ships.get(r.id);
    gal.refit(r.fit);
    gal.pos.set(4200, 0, 200);
    gal.yaw = 0;
    sl.board(gal);
    sl.takeHelm();
    const pr = sl.spawnPirate(new T.Vector3(4150, 0, 200), 2.5);
    pr.ship.yaw = 0;
    await wait(500);
    const right = new T.Vector3(-Math.cos(gal.yaw), 0, Math.sin(gal.yaw));
    g.cam.yaw = Math.atan2(right.x, right.z);
    // Chain shot for her sails, grape for her crew.
    sl.shot = 'chain';
    const sails0 = pr.ship.sailHp;
    inp.press('Mouse0');
    await wait(120);
    inp.release('Mouse0');
    await wait(2000);
    out.chain = pr.ship.sailHp < sails0;
    sl.shot = 'grape';
    sl.reload[1] = 0;
    const crew0 = pr.crew;
    inp.press('Mouse0');
    await wait(120);
    inp.release('Mouse0');
    await wait(2000);
    out.grape = pr.crew < crew0;
    // She strikes; board her and sail her home as a prize.
    gal.speed = 0;
    sl.leaveHelm();
    pr.ship.pos.copy(gal.pos).add(new T.Vector3(-(gal.beam / 2 + pr.ship.beam / 2 + 1), 0, 0));
    pr.ship.yaw = gal.yaw;
    pr.state = 'struck';
    await wait(400);
    const b = sl.boardable();
    out.boardable = !!b;
    if (b) sl.boardEnemy(b);
    await wait(500);
    out.onHerDeck = pr.ship.onDeck(g.player.pos);
    sl.parley(sl.plunderBy);
    out.parley = g.dialogue.options.map((o: { label: string }) => o.label).join(' | ');
    const fleet = sl.records.length;
    pick(/prize crew/i);
    await wait(500);
    out.prize = { fleet: sl.records.length - fleet, back: gal.onDeck(g.player.pos) };
    // Boarding Party: board a half-wrecked pirate and beat her defenders, then ransom her.
    const pr2 = sl.spawnPirate(gal.pos.clone().add(new T.Vector3(-20, 0, 0)), 2);
    pr2.ship.yaw = gal.yaw;
    pr2.ship.sections = pr2.ship.sections.map((h: number) => h * 0.4);
    pr2.ship.pos.copy(gal.pos).add(new T.Vector3(-(gal.beam / 2 + pr2.ship.beam / 2 + 1), 0, 0));
    await wait(300);
    const b2 = sl.boardable();
    out.boardable2 = b2 === pr2;
    if (b2) sl.boardEnemy(b2);
    await wait(400);
    out.defenders = pr2.defenders.length;
    for (const d of pr2.defenders) d.takeHit({ damage: 9999, poise: 99, dir: new T.Vector3(1, 0, 0), at: d.center.clone(), crit: false, source: 'melee' });
    await wait(1000);
    out.taken = pr2.state;
    sl.parley(pr2);
    const gold = g.player.prog.gold;
    pick(/Ransom/);
    await wait(300);
    out.ransom = { gold: g.player.prog.gold > gold, back: gal.onDeck(g.player.pos), state: pr2.state };
    // The harpoon line holds a serpent; reeling it in hauls it up beside the hull.
    sl.takeHelm();
    const sp = sl.spawnSerpent(gal.pos.clone().add(new T.Vector3(0, 0, 40)), 3);
    await wait(400);
    // (it circles fast: a harpooner may need a second throw)
    for (let i = 0; i < 4 && !sl.gunnery.tetheredTo(gal); i++) {
      sl.gunnery.harpoon(gal, sp.pos.clone().sub(gal.pos), true, { pos: sp.pos, vel: sp.vel });
      await wait(1500);
    }
    const line = sl.gunnery.tetheredTo(gal);
    out.line = { held: sp.held, len0: line ? Math.round(line.len) : 0 };
    inp.press('Mouse2');
    await wait(2500);
    inp.release('Mouse2');
    out.reeled = line ? Math.round(line.len) : 0;
    inp.press('KeyO');
    await wait(150);
    inp.release('KeyO');
    out.cut = !sl.gunnery.tetheredTo(gal);
    sl.serpent?.dispose();
    sl.serpent = null;
    // The Black Tide: the quest puts the Gallows Tide off the Shattered Isles.
    g.quests.accept('black-tide');
    await wait(200);
    gal.pos.set(4250, 0, 3900);
    gal.place();
    g.player.teleport(gal.toWorld(new T.Vector3(0, gal.def.deckY + 0.3, 0)));
    await wait(1500);
    out.scout = sl.pirates.filter((p: { tag: string }) => p.tag === 'scout').map((p: { ship: { name: string } }) => p.ship.name);
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  expect(res.kinds).toEqual(['ball', 'chain', 'grape']);
  expect(res.chain).toBe(true);
  expect(res.grape).toBe(true);
  expect(res.boardable).toBe(true);
  expect(res.onHerDeck).toBe(true);
  expect(res.parley).toMatch(/prize crew/);
  expect(res.prize).toEqual({ fleet: 1, back: true });
  expect(res.boardable2).toBe(true);
  expect(res.defenders as number).toBeGreaterThan(0);
  expect(res.taken).toBe('taken');
  expect(res.ransom).toMatchObject({ gold: true, back: true });
  expect((res.line as { held: boolean }).held).toBe(true);
  expect(res.reeled as number).toBeLessThan((res.line as { len0: number }).len0);
  expect(res.cut).toBe(true);
  expect(res.scout).toEqual(['The Gallows Tide']);
});

test('the great monsters: each fights the ship its own way, and each yields its trophy', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, sl = g.sailing;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const errors: string[] = [];
    const onErr = (e: ErrorEvent) => errors.push(String(e.message));
    window.addEventListener('error', onErr);
    const toasts: string[] = [];
    const ot = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => { toasts.push(m); ot(m); };
    g.player.prog.addGold(100000);
    sl.xp = 1e6;
    const r = sl.buy('galleon');
    const gal = sl.ships.get(r.id);
    const out: Record<string, unknown> = {};
    for (const [id, secs] of [['kraken', 12], ['crab', 8], ['sirens', 4], ['wyrm', 10], ['oldTeeth', 12], ['leviathan', 4]] as [string, number][]) {
      gal.repairAll();
      gal.pos.set(5600, 0, 900);
      gal.yaw = 0;
      gal.speed = 0;
      gal.place();
      if (!sl.current) sl.board(gal);
      g.player.teleport(gal.toWorld(new T.Vector3(0, gal.def.deckY + 0.3, 0)));
      const t0 = toasts.length;
      const b = sl.spawnBeast(id);
      const hull0 = gal.hullFrac;
      for (let i = 0; i < secs * 2 && sl.beast; i++) await wait(500);
      const fought = { toasts: toasts.length - t0, hurtShip: gal.hullFrac < hull0, parts: b.parts().length };
      // Break every part it has (the Leviathan's barbs want the harpoon).
      for (let k = 0; k < 8 && !b.beaten; k++) {
        for (const p of b.parts()) p.hit(99999, p.only ?? 'harpoon');
        await wait(500);
      }
      await wait(600);
      out[id] = { ...fought, beaten: b.beaten, trophy: sl.trophies.has(id) };
      g.player.hp = g.player.maxHp;
      if (sl.beast) { sl.beast.dispose(); sl.beast = null; }
    }
    // Their spoils fit the shipwright's finest upgrades.
    const shown: string[] = [];
    let opts = sl.shipwrightOptions((_t: string, o: { label: string }[]) => { opts = o; shown.push(...o.map((x) => x.label)); }, () => {});
    void opts;
    out.counts = Object.fromEntries(['krakenInk', 'colossusShell', 'sirenPearl', 'wyrmScale', 'oldTeethJaw', 'leviathanBone'].map((i) => [i, g.inv.count?.(i) ?? g.player.equip.items.filter((x: { def: { id: string }; qty: number }) => x.def.id === i).reduce((a: number, x: { qty: number }) => a + x.qty, 0)]));
    window.removeEventListener('error', onErr);
    out.errors = errors;
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  for (const id of ['kraken', 'crab', 'sirens', 'wyrm', 'oldTeeth', 'leviathan']) {
    expect(res[id], id).toMatchObject({ beaten: true, trophy: true });
    expect((res[id] as { toasts: number }).toasts, id).toBeGreaterThan(0);
  }
  const c = res.counts as Record<string, number>;
  for (const k of ['krakenInk', 'colossusShell', 'sirenPearl', 'wyrmScale', 'oldTeethJaw', 'leviathanBone']) expect(c[k], k).toBeGreaterThan(0);
  expect(res.errors).toEqual([]);
});

test('the island harbours: landfall, trade by the hold, Guild contracts, the customs cutter and the lighthouses', async ({ game }) => {
  test.setTimeout(150_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, sl = g.sailing;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    type Opt = { label: string; run: () => void };
    let menu: { t: string; o: Opt[] } = { t: '', o: [] };
    const show = (t: string, o: Opt[]) => { menu = { t, o }; };
    const back = () => {};
    const pick = (re: RegExp) => { const o = menu.o.find((x) => re.test(x.label)); o?.run(); return o?.label ?? null; };
    const toasts: string[] = [];
    const ot = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => { toasts.push(m); ot(m); };
    const out: Record<string, unknown> = {};
    g.player.prog.addGold(100000);
    sl.xp = 1e6;
    const r = sl.buy('brigantine');
    const ship = sl.ships.get(r.id);
    // Off Azure Haven's pier head: dock, step ashore, first landfall.
    ship.pos.set(8149, 0, -3759);
    ship.yaw = 0;
    ship.place();
    sl.board(ship);
    await wait(400);
    ship.speed = 0;
    const dock = sl.interactables.find((i: { label: () => string }) => /Dock at Azure Haven/.test(i.label()));
    out.dock = dock?.label() ?? null;
    dock?.action();
    await wait(400);
    out.ashore = { swimming: g.player.swimming, landfall: sl.landfalls.has('azureHaven') };
    // Spices are cheap here, and dearer once you've bought a load.
    sl.tradeOptions('azureHaven', show, back)[0].run();
    const before = menu.o.find((x) => /Spices/.test(x.label))?.label;
    pick(/Spices/);
    pick(/Buy 10/);
    out.hold = { ...sl.holdOf(ship) };
    sl.tradeOptions('azureHaven', show, back)[0].run();
    out.prices = [before, menu.o.find((x) => /Spices/.test(x.label))?.label];
    // A Guild contract: the cargo goes into the hold here and is paid for there.
    sl.harbourOptions(show, back, 'azureHaven').find((o: Opt) => /Maritime/.test(o.label))!.run();
    const offer = menu.o.find((x) => /^Take it: \d+/.test(x.label));
    out.offer = offer?.label ?? null;
    offer?.run();
    const c = sl.contracts[0];
    out.contract = c ? { kind: c.kind, to: c.to, n: c.n, loaded: sl.holdOf(ship)[c.good] } : null;
    if (c) {
      // Fetch her to the destination and deliver.
      sl.leaveShip(new T.Vector3(8091, 0, -3783));
      const dest = sl.harbourOptions(show, back, c.to);
      dest.find((o: Opt) => /Send a crew to sail/.test(o.label))?.run();
      await wait(200);
      const gold = g.player.prog.gold;
      sl.harbourOptions(show, back, c.to).find((o: Opt) => /^Deliver/.test(o.label))?.run();
      out.delivered = { paid: g.player.prog.gold - gold, open: sl.contracts.length, text: menu.t };
    }
    // Contraband near Port Aurelle brings out the customs cutter.
    sl.holdOf(ship).demonGlass = 2;
    ship.pos.set(3300, 0, 250);
    ship.place();
    sl.board(ship);
    sl.customsChecked = false;
    const rnd = Math.random;
    Math.random = () => 0.01;
    await wait(500);
    Math.random = rnd;
    out.customs = !!sl.customs;
    if (sl.customs) {
      ship.speed = 0;
      sl.customs.ship.pos.copy(ship.pos).add(new T.Vector3(18, 0, 0));
    }
    for (let i = 0; i < 12 && sl.customs && sl.customs.state !== 'gone'; i++) await wait(300);
    out.seized = !sl.holdOf(ship).demonGlass;
    // Relight a lighthouse: it's charted, and it shows on the map.
    const lh = sl.interactables.find((i: { label: () => string }) => /Relight the lighthouse of Emerald/.test(i.label()));
    lh?.action();
    out.lit = sl.lit.has('emeraldCove');
    out.marks = [...new Set(sl.seaMarkers().map((m: { kind: string }) => m.kind))];
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  expect(res.dock).toBe('Dock at Azure Haven');
  expect(res.ashore).toEqual({ swimming: false, landfall: true });
  expect((res.hold as Record<string, number>).spices).toBe(10);
  const [a, b] = res.prices as string[];
  expect(Number(/buy (\d+)g/.exec(b)![1])).toBeGreaterThan(Number(/buy (\d+)g/.exec(a)![1]));
  expect(res.offer).toBeTruthy();
  expect((res.contract as { loaded: number }).loaded).toBeGreaterThan(0);
  expect((res.delivered as { paid: number; open: number }).paid).toBeGreaterThan(0);
  expect((res.delivered as { open: number }).open).toBe(0);
  expect(res.customs).toBe(true);
  expect(res.seized).toBe(true);
  expect(res.lit).toBe(true);
  expect(res.marks).toEqual(expect.arrayContaining(['ship', 'light']));
});

test('life on the sea: events, a treasure map, pearl beds, the storm log and the regatta', async ({ game }) => {
  test.setTimeout(200_000 * SLOW);
  const res = await game.page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, sl = g.sailing, inp = g.input, SS = g.seaState;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const errors: string[] = [];
    const onErr = (e: ErrorEvent) => errors.push(String(e.message));
    window.addEventListener('error', onErr);
    const toasts: string[] = [];
    const ot = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => { toasts.push(m); ot(m); };
    const out: Record<string, unknown> = {};
    g.player.prog.addGold(100000);
    sl.xp = 1e6;
    for (const id of ['trawl', 'baitLore', 'shoalSight', 'bigGame', 'pearlDiver']) sl.learn(id);
    const r = sl.buy('brigantine');
    const ship = sl.ships.get(r.id);
    ship.pos.set(4600, 0, 900);
    ship.yaw = 0.5;
    ship.place();
    sl.board(ship);
    sl.takeHelm();
    await wait(300);
    // Every event announces itself once.
    const told: Record<string, number> = {};
    for (const id of ['dolphins', 'whale', 'waterspout', 'bloom', 'shoal', 'merchant']) {
      const t0 = toasts.length;
      sl.startEvent(id);
      await wait(1200);
      told[id] = toasts.slice(t0).filter((t) => !/Seamanship|Pearl|current/.test(t)).length;
      sl.event?.dispose();
      sl.event = null;
    }
    out.told = told;
    // Floating cargo comes aboard; a bottle holds a treasure map.
    for (const id of ['flotsam', 'bottle']) {
      const ev = sl.startEvent(id);
      await wait(300);
      ship.speed = 0;
      ship.pos.copy(ev.pos);
      await wait(500);
      out[id] = ev.done;
    }
    out.hold = sl.holdUsed(ship);
    const t = sl.treasures[0];
    out.treasure = t ? t.kind : null;
    // Dig it up (or dive for it).
    if (t) {
      sl.leaveShip(new T.Vector3(2940, 0, 196));
      const { heightAt } = await import('/src/world/terrainHeight.ts');
      g.player.teleport(new T.Vector3(t.x, t.kind === 'dig' ? heightAt(t.x, t.z) + 1 : -3, t.z));
      await wait(800);
      if (t.kind === 'dive') { inp.press('KeyC'); await wait(2500); }
      sl.interactables.find((i: { label: () => string }) => /Dig up|sunken chest/.test(i.label()))?.action();
      inp.release('KeyC');
      out.found = t.found;
    }
    // Pearl beds lie in the shallows round the warm-water harbours.
    out.beds = sl.pearlBeds.length;
    // The storm log: how far a storm blew you.
    ship.pos.set(5200, 0, 300);
    ship.place();
    sl.board(ship);
    SS.brewStorm(5200, 300, 900, 1);
    await wait(2500);
    out.drifting = ship.driftLog.length() > 0;
    // (as if it had raged a while: then it blows itself out)
    ship.driftLog.set(700, -500);
    SS.STORMS.length = 0;
    SS.SEA.storm = 0;
    await wait(1500);
    out.log = toasts.find((x) => /blew you/.test(x)) ?? null;
    // The Harbour Cup: round the marks in order after the gun.
    sl.leaveShip(new T.Vector3(2930, 0, 300));
    sl.regatta.start('harbourCup');
    for (let i = 0; i < 60 && sl.regatta.race && sl.regatta.race.countdown > 0; i++) await wait(200);
    const race = sl.regatta.race;
    out.racing = !!race && sl.current === race.mine;
    for (const [x, z] of race.course.buoys) {
      race.mine.pos.set(x + 4, 0, z);
      await wait(400);
    }
    await wait(400);
    out.race = { over: !sl.regatta.race, won: sl.regatta.wins.has('harbourCup'), ashore: !sl.current };
    window.removeEventListener('error', onErr);
    out.errors = errors;
    return out;
  }, SLOW);
  console.log(JSON.stringify(res));
  for (const [id, n] of Object.entries(res.told as Record<string, number>)) expect(n, id).toBe(1);
  expect(res.flotsam).toBe(true);
  expect(res.bottle).toBe(true);
  expect(res.treasure).toBeTruthy();
  expect(res.found).toBe(true);
  expect(res.beds as number).toBeGreaterThan(3);
  expect(res.drifting).toBe(true);
  expect(res.log).toMatch(/blew you [\d.]+ k?m/);
  expect(res.racing).toBe(true);
  expect(res.race).toEqual({ over: true, won: true, ashore: true });
  expect(res.errors).toEqual([]);
});
