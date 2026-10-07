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
