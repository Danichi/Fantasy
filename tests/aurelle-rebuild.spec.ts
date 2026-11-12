import { test, expect, SLOW } from './fixtures';

test('Aurelle has distinct districts, purposeful interiors and two safe harbour basins', async ({
  game,
}) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game;
    const { PORT_DISTRICTS, PORT_BERTHS, quayAt, LIGHTHOUSE } = await import(
      '/src/world/portCity.ts' as string
    );
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    return {
      districts: PORT_DISTRICTS.map((d: any) => d.name),
      doors: g.doors
        .filter((d: any) => d.pos.x > 2690 && d.pos.x < 3000)
        .map((d: any) => [d.name, d.kind]),
      depths: PORT_BERTHS.map(([x, z]: number[]) => heightAt(x, z)),
      light: heightAt(...LIGHTHOUSE),
      curvature: [quayAt(110), quayAt(200), quayAt(286)],
      quests: [...g.quests.defs.keys()].filter((id: any) =>
        id.startsWith('aurelle-'),
      ).length,
    };
  });
  expect(r.districts).toHaveLength(8);
  expect(new Set(r.doors.map((d: any) => d[0])).size).toBeGreaterThanOrEqual(
    15,
  );
  expect(r.doors.some((d: any) => d[1] === 'lighthouse')).toBe(true);
  for (const depth of r.depths) expect(depth).toBeLessThan(-2);
  expect(r.light).toBeGreaterThan(0.5);
  expect(r.curvature[1] - r.curvature[0]).toBeGreaterThan(20);
  expect(r.quests).toBe(12);
  expect(game.errors).toEqual([]);
});

test('post-Glen combat tiers withstand strong hits and Academy opponents retain non-lethal rules', async ({
  game,
}) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      { roadTier, wildlifeScale, ACADEMY_TRIAL } = await import(
        '/src/combat/tiers.ts' as string
      ),
      { LADDER } = await import('/src/quests/academy.ts' as string);
    const near = roadTier(100, 100),
      east = roadTier(2400, 140);
    g.quests.state['academy-trial'] = {
      status: 'done',
      stage: 1,
      progress: [1],
    };
    g.time.day += 1;
    g.academy.fight();
    const b = g.duel.opponent,
      hp = b.hp;
    b.takeHit({
      damage: 450,
      poise: 40,
      dir: new g.THREE.Vector3(1, 0, 0),
      at: b.center.clone(),
      crit: false,
      source: 'melee',
    });
    const survived = b.alive && b.hp > 0,
      remaining = b.hp;
    b.takeHit({
      damage: b.maxHp * 3,
      poise: 40,
      dir: new g.THREE.Vector3(1, 0, 0),
      at: b.center.clone(),
      crit: false,
      source: 'melee',
    });
    g.duel.update(1 / 60);
    return {
      near,
      east,
      survived,
      remaining,
      hp,
      nonLethal: b.alive,
      won: !g.duel.active,
      ladder: g.worldFlags.ladder,
      trial: ACADEMY_TRIAL,
      levels: LADDER.map((x: any) => x.level),
      hpGrowth: wildlifeScale(18).hp / wildlifeScale(2).hp,
    };
  });
  expect(r.survived).toBe(true);
  expect(r.remaining).toBeGreaterThan(r.hp * 0.6);
  expect(r.nonLethal).toBe(true);
  expect(r.won).toBe(true);
  expect(r.ladder).toBe(1);
  expect(r.east.level).toBeGreaterThan(r.near.level + 8);
  expect(r.east.hp).toBeGreaterThan(6);
  expect(r.hpGrowth).toBeGreaterThan(5);
  expect(r.trial.hp).toBeGreaterThan(2000);
  expect(r.levels).toEqual([...r.levels].sort((a: number, b: number) => a - b));
});

test('False Lights plays through physical evidence, witnesses, combat and a persistent harbour outcome', async ({
  game,
}) => {
  test.setTimeout(300_000 * SLOW);
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      q = g.quests;
    const speak = (npc: string, id: string, choice?: string) => {
      const title = q.defs.get(id).title;
      let menu: any = null;
      const option = q
        .options(
          npc,
          (text: any, opts: any) => (menu = { text, opts }),
          () => {},
        )
        .find((o: any) => o.label.includes(title));
      if (!option)
        throw new Error(
          'Missing conversation ' +
            npc +
            ' ' +
            id +
            ' stage ' +
            q.state[id]?.stage,
        );
      option.run();
      if (choice) {
        const c = menu.opts.find((o: any) => o.label.includes(choice));
        if (!c) throw new Error('Missing choice ' + choice);
        c.run();
      }
    };
    const act = (label: string) => {
      g.dialogue.close();
      const i = g.realm.interactables.find(
        (x: any) => x.enabled() && x.label().includes(label),
      );
      if (!i) throw new Error('Missing interaction ' + label);
      g.player.teleport(i.pos.clone().add(new g.THREE.Vector3(0, 0.3, 0)));
      i.action();
      g.dialogue.close();
    };
    q.accept('aurelle-empty-berth');
    act('Brightwater’s empty berth');
    speak('nell', 'aurelle-empty-berth');
    speak('mira', 'aurelle-empty-berth');
    q.accept('aurelle-cargo');
    act('rear warehouse tally');
    act('double-stamped barrels');
    speak('tallow', 'aurelle-cargo');
    q.accept('aurelle-wreck');
    act('wreck’s oilskin log');
    speak('aurelle-keeper', 'aurelle-wreck');
    q.accept('aurelle-favour');
    speak('marlo', 'aurelle-favour', 'search the old customs vault');
    const door = g.doors.find((d: any) => d.name === 'The Old Customs Vaults');
    await g.realm.enterInterior(door, door.kind, g.world.mats, g.spells);
    const guards = g.portLife.interiorEnemies;
    const blocked = !g.realm.interactables.some(
      (x: any) => x.enabled() && x.label().includes('Quiet Landing ledger'),
    );
    const guardLevels = guards.map((b: any) => b.level);
    for (const b of guards)
      b.takeHit({
        damage: b.maxHp + 1,
        poise: 1,
        dir: new g.THREE.Vector3(1, 0, 0),
        at: b.center.clone(),
        crit: false,
        source: 'melee',
      });
    g.portLife.updateInterior(1 / 60);
    act('Quiet Landing ledger');
    await g.realm.leaveInterior();
    speak('mira', 'aurelle-favour');
    q.accept('aurelle-witnesses');
    speak('nell', 'aurelle-witnesses');
    speak('aurelle-keeper', 'aurelle-witnesses');
    speak('tallow', 'aurelle-witnesses');
    speak('mira', 'aurelle-witnesses', 'Academy');
    q.accept('aurelle-false-lights');
    speak('aurelle-keeper', 'aurelle-false-lights');
    g.dialogue.close();
    g.player.teleport(new g.THREE.Vector3(2956, 2, -9));
    g.portLife.update(1 / 60, true);
    const captain = g.portLife.captain;
    if (!captain) throw new Error('Signal captain did not appear');
    const guardsAtLight = g.portLife.enemies.length;
    captain.takeHit({
      damage: captain.maxHp + 1,
      poise: 40,
      dir: new g.THREE.Vector3(1, 0, 0),
      at: captain.center.clone(),
      crit: false,
      source: 'melee',
    });
    g.portLife.update(1 / 60, true);
    act('Restore the Aurelle Light');
    act('Sound the rescue signal');
    speak('mira', 'aurelle-false-lights', 'fishing families');
    g.portLife.update(1 / 60, true);
    const saved = q.toJSON();
    q.fromJSON(saved);
    return {
      blocked,
      guardLevels,
      guardsAtLight,
      done: q.isDone('aurelle-false-lights'),
      ending: q.flag('aurelle-false-lights', 'warehouse'),
      crew: g.worldFlags['pa:crewHome'],
      memorial: g.port.stateGroups.get('memorial').visible,
      completed: [...q.defs.keys()].filter(
        (id: any) => id.startsWith('aurelle-') && q.isDone(id),
      ).length,
    };
  });
  expect(r.blocked).toBe(true);
  expect(r.guardLevels).toEqual([16, 16]);
  expect(r.guardsAtLight).toBe(1);
  expect(r.completed).toBe(6);
  expect(r.done).toBe(true);
  expect(r.ending).toBe('families');
  expect(r.crew).toBe(true);
  expect(r.memorial).toBe(true);
  expect(game.errors).toEqual([]);
});

test('Quiet Hands bargaining consumes payment once and works as an alternative to fighting', async ({
  game,
}) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      q = g.quests;
    for (const id of ['aurelle-empty-berth', 'aurelle-cargo', 'aurelle-wreck'])
      q.state[id] = { status: 'done', stage: 0, progress: [] };
    q.accept('aurelle-favour');
    let menu: any = null;
    const opts = q.options(
      'marlo',
      (t: any, o: any) => (menu = o),
      () => {},
    );
    opts.find((o: any) => o.label.includes('A Favour Below')).run();
    menu.find((o: any) => o.label.includes('bargain')).run();
    const door = g.doors.find((d: any) => d.name === 'The Old Customs Vaults');
    await g.realm.enterInterior(door, door.kind, g.world.mats, g.spells);
    // The bargain and the guarded evidence are independent legitimate approaches.
    const bargain = g.realm.interactables.find(
      (i: any) => i.enabled() && i.label().includes('Bargain with Sallow'),
    );
    const original = g.dialogue.show.bind(g.dialogue);
    let payment: any;
    g.dialogue.show = (_a: any, _b: any, _t: any, options: any) => {
      payment = options[0];
    };
    const gold = (g.player.prog.gold = 1000);
    bargain.action();
    payment.run();
    payment.run();
    g.dialogue.show = original;
    const after = g.player.prog.gold;
    await g.realm.leaveInterior();
    return {
      spent: gold - after,
      stage: q.state['aurelle-favour'].stage,
      den: g.worldFlags.denKnown,
    };
  });
  expect(r.spent).toBe(200);
  expect(r.stage).toBe(2);
  expect(r.den).toBe(true);
});

test('discoveries, daily work and room storage cannot duplicate rewards or lose item quality', async ({
  game,
}) => {
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      life = g.portLife;
    const secret = life.interactables.find((i: any) =>
      i.label().includes('Discover: The Salt Roses'),
    );
    const gold0 = g.player.prog.gold;
    secret.action();
    const gold1 = g.player.prog.gold;
    secret.action();
    const gold2 = g.player.prog.gold;
    g.time.hour = 10;
    const work = life.interactables.find((i: any) =>
      i.label().includes('repair the hoist'),
    );
    const original = g.dialogue.show.bind(g.dialogue);
    let menu: any = [];
    g.dialogue.show = (_a: any, _b: any, _t: any, o: any) => (menu = o);
    work.action();
    const manual = menu.find((o: any) => o.label.includes('by hand'));
    const before = g.player.prog.gold;
    manual.run();
    manual.run();
    const paid = g.player.prog.gold - before;
    g.player.prog.gold = 1000;
    let room: any;
    life.services
      .get('bess')(
        (t: any, o: any) => (room = o),
        () => {},
      )[0]
      .run();
    room.find((o: any) => o.label.includes('Take the room')).run();
    const roomGold = g.player.prog.gold;
    const item = g.player.equip.add('armingSword', 1, 3);
    const uid = item.uid;
    life.storage();
    let store = menu.find((o: any) => o.label.includes(item.def.name));
    for (let page = 0; !store && page < 10; page++) {
      const next = menu.find((o: any) => o.label === 'Next page.');
      if (!next) break;
      next.run();
      store = menu.find((o: any) => o.label.includes(item.def.name));
    }
    if (!store) throw new Error('Storage entry missing');
    store.run();
    const removed = !g.player.equip.get(uid);
    const encoded = g.worldFlags['pa:stash'];
    life.storage('withdraw');
    menu.find((o: any) => o.label.startsWith('Take ')).run();
    const restored = g.player.equip.items.some(
      (i: any) => i.q === 3 && i.def.id === 'armingSword',
    );
    g.dialogue.show = original;
    return {
      gold0,
      gold1,
      gold2,
      paid,
      roomGold,
      room: g.worldFlags['pa:room'],
      removed,
      encoded,
      restored,
      empty: g.worldFlags['pa:stash'],
    };
  });
  expect(r.gold1 - r.gold0).toBe(15);
  expect(r.gold2).toBe(r.gold1);
  expect(r.paid).toBe(30);
  expect(r.roomGold).toBe(880);
  expect(r.room).toBe(true);
  expect(r.removed).toBe(true);
  expect(r.encoded).toContain('"q":3');
  expect(r.restored).toBe(true);
  expect(r.empty).toBe('[]');
});

test('legacy saves relocate only the rebuilt port and retain ships, cargo and quest progress', async ({
  game,
}) => {
  const r = await game.page.evaluate(async () => {
    const { migrateAurelle } = await import(
      '/src/world/port/migration.ts' as string
    );
    const save: any = {
      world: {
        pos: [2800, 4, 240],
        flags: { ladder: 4, quietFavour: true },
        quests: { 'academy-oath': { status: 'done', stage: 1, progress: [1] } },
        sailing: {
          ships: [
            {
              id: 'mine',
              port: 'portAurelle',
              x: 3010,
              z: 196,
              yaw: 0,
              cargo: { spices: 7 },
            },
            { id: 'away', port: null, x: 5500, z: 4800, yaw: 1 },
          ],
          rental: null,
        },
      },
    };
    migrateAurelle(save);
    const first = JSON.stringify(save);
    migrateAurelle(save);
    const away: any = { world: { pos: [100, 4, 90], flags: {} } };
    migrateAurelle(away);
    return {
      pos: save.world.pos,
      ships: save.world.sailing.ships,
      flags: save.world.flags,
      quest: save.world.quests['academy-oath'],
      idempotent: first === JSON.stringify(save),
      away: away.world.pos,
    };
  });
  expect(r.pos).toEqual([2710, 2, 150]);
  expect(r.ships[0].cargo.spices).toBe(7);
  expect(r.ships[1].x).toBe(5500);
  expect(r.flags.ladder).toBe(4);
  expect(r.flags.quietFavour).toBe(true);
  expect(r.quest.status).toBe('done');
  expect(r.idempotent).toBe(true);
  expect(r.away).toEqual([100, 4, 90]);
});

test('the public arrival, harbour loop and Academy approach can be walked without clipping buildings', async ({
  game,
}) => {
  const result = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const routes = [
      [
        [2708, 150],
        [2734, 150],
        [2762, 160],
        [2786, 164],
        [2802, 170],
        [2840, 176],
        [2886, 176],
        [2924, 176],
        [2928, 194],
        [2928, 201],
        [2886, 201],
        [2886, 224],
        [2894, 238],
        [2924, 238],
        [2924, 280],
        [2918, 288],
        [2912, 308],
      ],
      [
        [2786, 164],
        [2795, 132],
        [2800, 104],
        [2822, 96],
        [2822, 84],
        [2826, 74],
        [2826, 55],
      ],
    ];
    const blocked: any[] = [];
    for (const route of routes) {
      g.player.teleport(
        new g.THREE.Vector3(
          route[0][0],
          heightAt(...route[0]) + 0.25,
          route[0][1],
        ),
      );
      await new Promise((r) => setTimeout(r, 2500));
      g.stepSim(20);
      g.input.press('KeyW');
      for (const [x, z] of route.slice(1)) {
        let distance = Infinity;
        for (let i = 0; i < 1100; i++) {
          distance = Math.hypot(g.player.pos.x - x, g.player.pos.z - z);
          if (distance < 1.3) break;
          g.cam.yaw = Math.atan2(x - g.player.pos.x, z - g.player.pos.z);
          g.player.stamina = g.player.maxStamina;
          g.stepSim();
          if (i % 60 === 59) await new Promise((r) => setTimeout(r, 15));
        }
        if (distance >= 1.3) {
          blocked.push({
            target: [x, z],
            position: g.player.pos.toArray(),
            distance,
          });
          break;
        }
      }
      g.input.release('KeyW');
    }
    return blocked;
  });
  expect(result).toEqual([]);
});

test('Academy practicals require their own partner and award mastery only once', async ({
  game,
}) => {
  const result = await game.page.evaluate(() => {
    const g = (window as any).__game,
      d = g.portLife.drills;
    d.start('boundary');
    const floor = g.player.damageFloor;
    g.events.emit('perfectParry', { at: new g.THREE.Vector3(0, 0, 0) });
    const unrelated = d.count;
    const at = d.partner.center.clone();
    for (let i = 0; i < 3; i++) g.events.emit('perfectParry', { at });
    const mastered = g.worldFlags['pa:drill:boundary'],
      firstXp = g.player.prog.xp;
    d.start('boundary');
    const at2 = d.partner.center.clone();
    for (let i = 0; i < 3; i++) g.events.emit('perfectParry', { at: at2 });
    return {
      floor,
      unrelated,
      mastered,
      noRepeat: firstXp === g.player.prog.xp,
      stopped: d.active === null,
      cleared: g.player.damageFloor,
    };
  });
  expect(result.floor).toBeGreaterThan(0);
  expect(result.unrelated).toBe(0);
  expect(result.mastered).toBe(true);
  expect(result.noRepeat).toBe(true);
  expect(result.stopped).toBe(true);
  expect(result.cleared).toBe(0);
});
