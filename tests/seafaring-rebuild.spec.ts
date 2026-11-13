import { test, expect, SLOW } from './fixtures';

test('every hired boat has a readable HUD and the legacy rowboat controller cannot own a ship helm', async ({ game }) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sailing;
    g.player.prog.addGold(1000);
    s.hireRowboat();
    const boat = s.current;
    g.input.press('KeyW');
    g.stepSim(180);
    g.input.release('KeyW');
    s.frame(1);
    const start = boat.pos.clone(),
      old = g.boats.state.pos.clone();
    g.input.press('KeyX');
    g.stepSim(2);
    g.input.release('KeyX');
    g.boats.update(1);
    return {
      hull: boat.hull,
      mode: s.travelMode,
      hud: (document.querySelector('.sea-hud') as HTMLElement).innerText,
      visible: getComputedStyle(document.querySelector('.sea-hud')!).display,
      legacy: g.boats.active,
      oldMoved: g.boats.state.pos.distanceTo(old),
      speed: boat.speed,
      same: s.current === boat,
      position: boat.pos.distanceTo(start),
    };
  });
  expect(r.hull).toBe('rowboat');
  expect(r.mode).toBe('rowing');
  expect(r.visible).toBe('block');
  expect(r.hud).toMatch(/km\/h/);
  expect(r.hud).toMatch(/Heading/i);
  expect(r.hud).toMatch(/P ship/);
  expect(r.legacy).toBe(false);
  expect(r.oldMoved).toBe(0);
  expect(r.speed).toBeGreaterThan(0.5);
  expect(r.same).toBe(true);
  expect(r.position).toBeLessThan(2);
  expect(game.errors).toEqual([]);
});

test('water controls allow fast swimming, descent, ascent and surface recovery without land attacks', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sailing,
      T = g.THREE;
    g.player.prog.addGold(1000);
    const boat = s.rent('sloop');
    s.board(boat);
    s.enterWater();
    await new Promise((r) => setTimeout(r, 1500));
    g.stepSim(30);
    const start = g.player.pos.clone();
    g.input.press('KeyW');
    g.input.press('ShiftLeft');
    g.stepSim(90);
    const fast = g.player.sprinting,
      moved = g.player.pos.distanceTo(start);
    g.input.releaseAll();
    g.input.press('KeyC');
    g.stepSim(90);
    g.input.releaseAll();
    const deep = g.player.diveDepth;
    g.input.press('Space');
    g.stepSim(100);
    g.input.releaseAll();
    const surfaced = g.player.diveDepth;
    g.player.stamina = 30;
    g.stepSim(120);
    s.frame(1);
    return {
      fast,
      moved,
      deep,
      surfaced,
      swimming: g.player.swimming,
      stamina: g.player.stamina,
      act: g.player.act?.def.id ?? null,
      hud: (document.querySelector('.sea-hud') as HTMLElement).innerText,
      finite: g.player.pos.toArray().every(Number.isFinite),
    };
  });
  expect(r.fast).toBe(true);
  expect(r.moved).toBeGreaterThan(3);
  expect(r.deep).toBeGreaterThan(1);
  expect(r.surfaced).toBeLessThan(0.2);
  expect(r.swimming).toBe(true);
  expect(r.stamina).toBeGreaterThan(30);
  expect(r.act).toBeNull();
  expect(r.hud).toMatch(/Breath/i);
  expect(r.hud).toMatch(/rise/);
  expect(r.finite).toBe(true);
  expect(game.errors).toEqual([]);
});

test('sea input does not open the herbalism codex or alter a second vehicle', async ({ game }) => {
  const r = await game.page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing;
    const boat = s.rent('skiff');
    s.board(boat);
    g.input.press('KeyO');
    g.stepSim(2);
    g.input.release('KeyO');
    const atHelm = s.atHelm,
      mode = s.travelMode;
    g.input.press('KeyP');
    g.stepSim();
    g.input.release('KeyP');
    return {
      atHelm,
      mode,
      herbs: g.herbalism.isOpen,
      dialogue: g.dialogue.open,
      menu: g.dialogue.options.map((o: any) => o.label),
    };
  });
  expect(r.atHelm).toBe(true);
  expect(r.mode).toBe('helm');
  expect(r.herbs).toBe(false);
  expect(r.dialogue).toBe(true);
  expect(r.menu).toContain('Chart a course to a harbour');
  expect(game.errors).toEqual([]);
});

test('helm and deck resumes preserve cargo, motion, sail orders, settings and crew', async ({ game }) => {
  const r = await game.page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing,
      T = g.THREE;
    const r = s.buy('cutter'),
      ship = s.ships.get(r.id);
    r.cargo = { spices: 8 };
    ship.pos.set(3600, 0, 450);
    ship.yaw = 1;
    ship.place();
    ship.place();
    s.board(ship);
    s.takeHelm();
    s.ctl.sail = 0.6;
    s.ctl.anchor = false;
    ship.anchored = false;
    ship.sailSet = 0.6;
    ship.speed = 4;
    s.settings.advanced = true;
    s.settings.units = 'knots';
    s.windCd = 22;
    const save = structuredClone(s.toJSON());
    s.reset();
    s.fromJSON(save);
    s.restoreVoyage();
    const a = s.current;
    const helm = {
      id: s.current && s.records.find((r: any) => s.ships.get(r.id) === s.current).id,
      speed: a.speed,
      sail: s.ctl.sail,
      anchor: s.ctl.anchor,
      mode: s.travelMode,
      cargo: s.records[0].cargo,
      units: s.settings.units,
      wind: s.windCd,
    };
    s.leaveHelm();
    s.player.teleport(a.toWorld(new T.Vector3(0.3, a.def.deckY + 0.3, 0)));
    const local = a.toLocal(s.player.pos).toArray();
    const saved = structuredClone(s.toJSON());
    s.reset();
    s.fromJSON(saved);
    s.restoreVoyage();
    return {
      helm,
      deck: {
        mode: s.travelMode,
        local: s.current.toLocal(g.player.pos).toArray(),
        vehicle: g.player.vehicle,
        hasDeck: s.current.hasDeck,
      },
      local,
    };
  });
  expect(r.helm).toMatchObject({
    speed: 4,
    sail: 0.6,
    anchor: false,
    mode: 'helm',
    cargo: { spices: 8 },
    units: 'knots',
    wind: 22,
  });
  expect(r.deck.mode).toBe('deck');
  expect(r.deck.vehicle).toBeNull();
  expect(r.deck.hasDeck).toBe(true);
  for (let i = 0; i < 3; i++) expect(r.deck.local[i]).toBeCloseTo(r.local[i], 2);
  expect(game.errors).toEqual([]);
});

test('Sea Legs uses visible course markers and a coastal job pays once on its return', async ({ game }) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sailing;
    const { TRAINING_MARKS, COASTAL_JOBS } = await import('/src/world/sea/voyages.ts' as string);
    g.quests.accept('sea-legs');
    const ship = s.rent('skiff');
    s.board(ship);
    for (const [x, z] of TRAINING_MARKS) {
      ship.pos.set(x, 0, z);
      s.voyages.update(1 / 60, ship, true);
    }
    const stage = g.quests.state['sea-legs'].stage;
    s.voyages.start('rescue');
    const j = COASTAL_JOBS.find((j: any) => j.id === 'rescue');
    ship.pos.set(...[j.at[0], 0, j.at[1]]);
    ship.speed = 0;
    const canCollect = s.voyages.canCollect(ship);
    s.voyages.collect();
    const gold = g.player.prog.gold;
    s.voyages.dock('portAurelle', g.time.day);
    s.voyages.dock('portAurelle', g.time.day);
    return {
      stage,
      training: s.voyages.state.training,
      canCollect,
      paid: g.player.prog.gold - gold,
      log: s.voyages.state.log,
      active: s.voyages.state.active,
    };
  });
  expect(r.stage).toBe(1);
  expect(r.training).toBe(3);
  expect(r.canCollect).toBe(true);
  expect(r.paid).toBe(120);
  expect(r.active).toBeUndefined();
  expect(r.log.length).toBeGreaterThan(0);
  expect(game.errors).toEqual([]);
});

test('a large ship has a walkable cabin and returns to its own deck', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sailing;
    const rec = s.buy('cutter'),
      ship = s.ships.get(rec.id);
    ship.pos.set(3500, 0, 500);
    ship.place();
    ship.place();
    s.board(ship);
    s.enterCabin();
    for (let i = 0; i < 200 && (g.realm.mode !== 'interior' || g.realm.busy); i++) await new Promise((r) => setTimeout(r, 30));
    const kind = g.realm.interior?.kind,
      spots = Object.keys(g.realm.interior?.spots ?? {});
    await g.realm.leaveInterior();
    return {
      kind,
      spots,
      mode: g.realm.mode,
      deck: ship.onDeck(g.player.pos),
      cabin: s.inCabin,
      same: s.current === ship,
    };
  });
  expect(r.kind).toBe('cabin');
  expect(r.spots).toContain('cabinChart');
  expect(r.mode).toBe('overworld');
  expect(r.deck).toBe(true);
  expect(r.cabin).toBe(false);
  expect(r.same).toBe(true);
  expect(game.errors).toEqual([]);
});

test('weather, boarding casualties and monster phases survive a voyage restore', async ({ game }) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sailing,
      T = g.THREE;
    const { seaRuntime } = await import('/src/world/sea/runtime.ts' as string);
    g.player.invulnerable = true;
    const rec = s.buy('galleon'),
      ship = s.ships.get(rec.id);
    ship.pos.set(4200, 0, 200);
    ship.place();
    ship.place();
    s.board(ship);
    const pr = s.spawnPirate(ship.pos.clone().add(new T.Vector3(-16, 0, 0)), 3);
    pr.ship.yaw = ship.yaw;
    pr.ship.sections = pr.ship.sections.map((h: number) => h * 0.4);
    s.boardEnemy(pr);
    g.stepSim(5);
    const defender = pr.defenders[0],
      hp = defender.hp;
    defender.hp = hp - 100;
    pr.defenders[1].dispose();
    const b = s.spawnBeast('kraken');
    g.stepSim(440);
    const parts = b.snapshot().parts.length;
    const live = b.parts().find((p: any) => p.kind === 'tentacle');
    if (live) live.hit(99999, 'ball');
    g.seaState.brewStorm(ship.pos.x, ship.pos.z, 800, 0.8);
    s.windCd = 31;
    s.stores.state.wageDebt = 44;
    const saved = structuredClone(s.toJSON()),
      seed = seaRuntime.seed,
      mode = s.travelMode,
      local = pr.ship.toLocal(g.player.pos).toArray();
    s.fromJSON(saved);
    s.restoreVoyage();
    const restored = s.beast.snapshot();
    const p = s.pirates[0];
    const a = {
      mode: s.travelMode,
      local: p.ship.toLocal(g.player.pos).toArray(),
      hp: p.defenders[0].hp,
      dead: !p.defenders[1].alive,
      state: p.state,
      parts: restored.parts,
      phase: restored.phase,
      seed: seaRuntime.seed,
      storm: g.seaState.STORMS.length,
      debt: s.stores.state.wageDebt,
    };
    return {
      a,
      mode,
      local,
      hp: hp - 100,
      parts,
      expected: saved.encounters.beast,
    };
  });
  expect(r.a.mode).toBe(r.mode);
  expect(r.a.hp).toBe(r.hp);
  expect(r.a.dead).toBe(true);
  expect(r.a.parts).toEqual(r.expected.parts);
  expect(r.a.parts.length).toBeGreaterThan(4);
  expect(r.a.phase).toEqual(r.expected.phase);
  expect(r.a.storm).toBe(1);
  expect(r.a.debt).toBe(44);
  for (let i = 0; i < 3; i++) expect(r.a.local[i]).toBeCloseTo(r.local[i], 1);
  expect(game.errors).toEqual([]);
});

test('charted routes remain in water and nearest swept contact wins', async ({ game }) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      T = g.THREE,
      s = g.sailing;
    const { chartRoute } = await import('/src/world/sea/navigation.ts' as string),
      { heightAt } = await import('/src/world/terrainHeight.ts' as string),
      { SEA_LEVEL } = await import('/src/world/worldMap.ts' as string);
    const from = new T.Vector3(3050, 0, 200),
      to = new T.Vector3(3500, 0, -200),
      route = chartRoute(from, to, 0.3, 'Coast');
    let safe = !!route;
    if (route)
      for (let k = 1; k < route.points.length; k++) {
        const a = route.points[k - 1],
          b = route.points[k],
          n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10);
        for (let i = 0; i <= n; i++)
          if (SEA_LEVEL - heightAt(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n) < 0.3) safe = false;
      }
    const ship = s.rent('sloop');
    ship.pos.set(4200, 0, 200);
    ship.place();
    ship.place();
    const near = {
        pos: new T.Vector3(4190, 2, 200),
        radius: 1,
        alive: true,
        hitBy() {},
      },
      far = { ...near, pos: new T.Vector3(4170, 2, 200) };
    const hit = s.gunnery.trace(new T.Vector3(4200, 2, 200), new T.Vector3(4150, 2, 200), ship, [], [far, near]);
    return {
      safe,
      points: route?.points.length,
      nearest: hit.monster === near,
      t: hit.t,
    };
  });
  expect(r.safe).toBe(true);
  expect(r.points).toBeGreaterThanOrEqual(2);
  expect(r.nearest).toBe(true);
  expect(r.t).toBeLessThan(0.3);
  expect(game.errors).toEqual([]);
});

test('provisions consume by game hours and legacy saves load safely', async ({ game }) => {
  const r = await game.page.evaluate(async () => {
    const { ShipStores } = await import('/src/world/sea/stores.ts' as string);
    const st = new ShipStores();
    const crew = [{ status: 'aboard', morale: 0.8 }];
    st.update(10, crew, false);
    st.update(34, crew, false);
    const used = { ...st.state };
    st.update(34, crew, false);
    const same = st.state.rations === used.rations;
    const ashore = new ShipStores();
    ashore.update(10, [], false);
    ashore.update(58, [], false);
    const kept = ashore.state.rations;
    const s = (window as any).__game.sailing;
    const ship = s.rent('skiff');
    s.board(ship);
    const old = structuredClone(s.toJSON());
    for (const k of ['version', 'sea', 'stores', 'encounters', 'runtime', 'resume', 'settings', 'bindings', 'voyages', 'route'])
      delete old[k];
    for (const r of old.ships) delete r.motion;
    delete old.rental.motion;
    s.reset();
    s.fromJSON(old);
    s.restoreVoyage();
    return {
      kept,
      used,
      same,
      mode: s.travelMode,
      fleet: s.ships.size,
      units: s.settings.units,
    };
  });
  expect(r.kept).toBe(30);
  expect(r.used.rations).toBe(28);
  expect(r.used.water).toBe(38);
  expect(r.same).toBe(true);
  expect(r.mode).toBe('ashore');
  expect(r.fleet).toBe(1);
  expect(r.units).toBe('kmh');
  expect(game.errors).toEqual([]);
});

test('a saved race resumes with its marks, timer, hulls and visible directions', async ({ game }) => {
  const r = await game.page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing;
    s.regatta.start('harbourCup');
    g.stepSim(400);
    s.regatta.race.next = 2;
    s.regatta.race.rivalNext = 1;
    const before = s.regatta.snapshot(),
      saved = structuredClone(s.toJSON());
    s.fromJSON(saved);
    s.restoreVoyage();
    s.frame(1);
    const after = s.regatta.snapshot();
    return {
      before,
      after,
      mode: s.travelMode,
      same: s.current === s.regatta.race.mine,
      hud: (document.querySelector('.sea-hud') as HTMLElement).innerText,
    };
  });
  expect(r.after).toEqual(r.before);
  expect(r.mode).toBe('helm');
  expect(r.same).toBe(true);
  expect(r.hud).toMatch(/Harbour Cup/);
  expect(r.hud).toMatch(/Mark 3/);
  expect(game.errors).toEqual([]);
});

test('rebound controls update the HUD and save without opening another menu', async ({ game }) => {
  const r = await game.page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing;
    const ship = s.rent('skiff');
    s.board(ship);
    const choose = (re: RegExp) => g.dialogue.options.find((o: any) => re.test(o.label)).run();
    s.openOrders();
    choose(/Sailing and swimming settings/);
    choose(/Rebind/);
    choose(/Ship and navigation/);
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'KeyJ',
        bubbles: true,
        cancelable: true,
      }),
    );
    g.dialogue.close();
    g.input.press('KeyJ');
    g.stepSim();
    g.input.releaseAll();
    const open = g.dialogue.open;
    g.dialogue.close();
    s.frame(1);
    return {
      open,
      binding: g.input.bindings.seaOrders,
      saved: s.toJSON().bindings.seaOrders,
      hud: (document.querySelector('.sea-hud') as HTMLElement).innerText,
    };
  });
  expect(r.open).toBe(true);
  expect(r.binding).toEqual(['KeyJ']);
  expect(r.saved).toEqual(['KeyJ']);
  expect(r.hud).toMatch(/J ship/);
  expect(game.errors).toEqual([]);
});

test('harbour ladders give swimmers a dry exit and underwater saves preserve air', async ({ game }) => {
  const r = await game.page.evaluate(() => {
    const g = (window as any).__game,
      s = g.sailing,
      T = g.THREE;
    const point = s.landings.points[0];
    g.player.teleport(point.water.clone());
    g.player.swimming = true;
    g.player.diveDepth = 1;
    g.player.breath = 0.64;
    g.player.stamina = 48;
    const saved = structuredClone(s.toJSON());
    s.fromJSON(saved);
    s.restoreVoyage();
    const water = {
      swim: g.player.swimming,
      depth: g.player.diveDepth,
      breath: g.player.breath,
      stamina: g.player.stamina,
    };
    const ladder = s.interactables.find((i: any) => i.label() === 'Climb the harbour ladder' && i.pos.distanceTo(point.water) < 1);
    const enabled = ladder.enabled();
    ladder.action();
    g.stepSim(10);
    return {
      water,
      enabled,
      swim: g.player.swimming,
      y: g.player.pos.y,
      near: g.player.pos.distanceTo(point.top),
    };
  });
  expect(r.water).toEqual({ swim: true, depth: 1, breath: 0.64, stamina: 48 });
  expect(r.enabled).toBe(true);
  expect(r.swim).toBe(false);
  expect(r.y).toBeGreaterThan(0);
  expect(r.near).toBeLessThan(2);
  expect(game.errors).toEqual([]);
});

test('paid escorts restore, sunk hulls finish disappearing, and water menus release dive input', async ({ game }) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      s = g.sailing,
      T = g.THREE;
    const { Consort } = await import('/src/world/sea/seaThreats.ts' as string);
    g.player.invulnerable = true;
    const record = s.buy('sloop'),
      ship = s.ships.get(record.id);
    ship.pos.set(4200, 0, 200);
    ship.place();
    ship.place();
    s.board(ship);
    s.consort = new Consort(g.r.scene, ship.pos.clone().add(new T.Vector3(50, 0, 0)), 0, 'HMS Steadfast');
    s.consort.ship.sections[0] -= 70;
    const before = s.consort.snapshot(),
      save = structuredClone(s.toJSON());
    s.fromJSON(save);
    s.restoreVoyage();
    const after = s.consort.snapshot(),
      hull = s.current;
    hull.water = 1;
    g.stepSim(100);
    const lost = !s.current && s.records.length === 0,
      deck = hull.hasDeck;
    g.stepSim(920);
    const vanished = hull.group.parent === null;
    g.player.teleport(new T.Vector3(3500, -1, 500));
    g.player.swimming = true;
    g.input.press('KeyC');
    g.stepSim(90);
    const deep = g.player.diveDepth;
    s.openOrders();
    g.input.releaseAll();
    g.stepSim(90);
    const released = !g.player.diveHeld && g.player.diveDepth < deep;
    g.dialogue.close();
    return { before, after, lost, deck, vanished, released };
  });
  expect(r.after).toEqual(r.before);
  expect(r.lost).toBe(true);
  expect(r.deck).toBe(false);
  expect(r.vanished).toBe(true);
  expect(r.released).toBe(true);
  expect(game.errors).toEqual([]);
});
