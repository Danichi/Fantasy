import { test, expect, SLOW } from './fixtures';

// The Royal Capital (World Expansion phase 8): the city streams in as you come
// near, its avenue climbs clear from the East Gate to the palace, its great
// rooms have their keepers, the Crown checkpoint opens for registered cadets,
// Act III runs from the Academy to the throne, and the townsfolk have somewhere
// to walk.

test('the capital streams in as you approach, and the Royal Avenue climbs clear from the East Gate to the palace', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, c = g.capital;
    const { heightAt } = await import('/src/world/terrain.ts');
    const C = await import('/src/world/capitalCity.ts');
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const out: Record<string, unknown> = {};
    // From the Crown Road, a kilometre out: the city builds over a few frames.
    g.player.teleport(new T.Vector3(-2950, heightAt(-2950, -930) + 0.5, -930));
    for (let i = 0; i < 400 && !c.built; i++) await wait(50);
    await (window as any).waitSteps(5);
    out.built = c.built;
    out.shown = c.group.visible && !c.proxy.visible;
    out.houses = c.houseCount;
    const names = new Set(g.doors.map((d: { name?: string }) => d.name));
    out.landmarks = ['The Throne Hall', 'The Temple of the Dawn', 'The Royal Library', 'The Arcane Collegium', 'The Royal Chancery', 'The Gilded Stag', 'The Hall of the Silver Lance'].filter((n) => !names.has(n));
    out.doorPrompts = g.realm.overworldInteractables.some((i: { label: () => string }) => i.label() === 'Enter The Throne Hall');
    // Walk in 2 m steps through the East Gate to the plaza, and from beyond the
    // plaza up both ramps to the palace doors: nothing solid in the way at chest
    // height, and no step too tall to climb.
    const [px, pz] = C.PALACE, [ux, uz] = C.AVENUE_DIR;
    let blocked: number[] | null = null, worst = 0;
    const walk = (path: number[][]) => {
      let prev: any = null;
      for (let k = 1; k < path.length; k++) {
        const [ax, az] = path[k - 1], [bx, bz] = path[k];
        const len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s <= len; s += 2) {
          const p = new T.Vector3(ax + ((bx - ax) * s) / len, 0, az + ((bz - az) * s) / len);
          p.y = heightAt(p.x, p.z) + 1.2;
          if (prev) {
            worst = Math.max(worst, Math.abs(p.y - prev.y));
            if (!blocked && !g.physics.lineOfSight(prev, p, 0)) blocked = [Math.round(p.x), Math.round(p.z)];
          }
          prev = p;
        }
      }
    };
    walk([[C.EAST_GATE[0] + 30, C.EAST_GATE[1]], C.EAST_GATE, [-3240, -1065], [-3262, -1062]]);
    walk([[px + ux * 140, pz + uz * 140], [px + ux * 6, pz + uz * 6]]);
    out.blocked = blocked;
    out.steepest = worst;
    out.top = Math.round(heightAt(px + ux * 20, pz + uz * 20));
    return out;
  }, SLOW);
  expect(res.built).toBe(true);
  expect(res.shown).toBe(true);
  expect(res.houses as number).toBeGreaterThan(150);
  expect(res.landmarks).toEqual([]);
  expect(res.doorPrompts).toBe(true);
  expect(res.blocked).toBe(null);
  expect(res.steepest as number).toBeLessThan(0.45); // a 2 m stride never climbs more than ~22%
  expect(res.top).toBe(25);
  expect(game.errors).toEqual([]);
});

test('the King holds court on his throne; the Temple and the Library keep their keepers', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const until = async (f: () => boolean, ms = 15000) => {
      const t0 = performance.now();
      while (!f() && performance.now() - t0 < ms * slow) await wait(50);
      return f();
    };
    g.player.teleport(new T.Vector3(-3262, 30, -1062));
    g.capital.buildNow();
    await (window as any).waitSteps(10);
    const visit = async (name: string) => {
      const d = g.doors.find((x: { name?: string }) => x.name === name);
      g.player.teleport(new T.Vector3(d.pos.x, d.pos.y + 0.4, d.pos.z));
      await (window as any).waitSteps(10);
      g.realm.overworldInteractables.find((i: { label: () => string }) => i.label() === 'Enter ' + name).action();
      const entered = await until(() => g.realm.mode === 'interior' && !g.realm.busy);
      // The keeper is built for the visit (asynchronously): wait for their prompt.
      await until(() => g.realm.interactables.some((i: { label: () => string }) => i.label().startsWith('Talk to')), 8000);
      const r = { entered, kind: g.realm.interior?.kind, people: g.realm.interactables.map((i: { label: () => string }) => i.label()) };
      await g.realm.leaveInterior();
      await until(() => g.realm.mode === 'overworld' && !g.realm.busy);
      return r;
    };
    return {
      throne: await visit('The Throne Hall'),
      temple: await visit('The Temple of the Dawn'),
      library: await visit('The Royal Library'),
    };
  }, SLOW);
  expect(res.throne.entered).toBe(true);
  expect(res.throne.kind).toBe('throne');
  expect(res.throne.people).toContain('Talk to King Aldric IV');
  expect(res.throne.people).toContain('Inspect the throne');
  expect(res.temple.kind).toBe('temple');
  expect(res.temple.people).toContain('Talk to High Priestess Seraphine');
  expect(res.library.kind).toBe('library');
  expect(res.library.people).toContain('Talk to Master Tobias Quill');
  expect(game.errors).toEqual([]);
});

test('the Crown checkpoint lifts its barrier once you are registered at the Academy', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = window.__game, T = g.THREE, q = g.quests;
    const { heightAt } = await import('/src/world/terrain.ts');
    const gate = g.roads.gates.find((x: { road: string }) => x.road === 'capital');
    // A line across the barrier, along the road, at knee height.
    const a = new T.Vector3(-952, 0, -7), b = new T.Vector3(-968, 0, -13);
    a.y = heightAt(a.x, a.z) + 0.8;
    b.y = heightAt(b.x, b.z) + 0.8;
    const before = { open: gate.open, clear: g.physics.lineOfSight(a, b, 0) };
    // Registered (the entrance trial won), as when a save loads.
    q.state['academy-trial'] = { status: 'done', stage: 0, progress: [] };
    q.fromJSON(q.toJSON());
    return { before, after: { open: gate.open, clear: g.physics.lineOfSight(a, b, 0) } };
  });
  if (!res.before.open) expect(res.before.clear).toBe(false);
  expect(res.after).toEqual({ open: true, clear: true });
  expect(game.errors).toEqual([]);
});

test('Act III: the Crown’s Summons leads from the Academy to the throne, then to the Library and the Temple', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = window.__game, q = g.quests, T = g.THREE;
    const { heightAt } = await import('/src/world/terrain.ts');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tp = async (x: number, z: number) => {
      g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.3, z));
      for (let i = 0; i < 15; i++) {
        await sleep(60);
        q.update(1, g.player.pos);
      }
    };
    const talk = (npc: string) => q.options(npc, () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    for (const id of ['road-to-port', 'academy-trial', 'academy-lessons', 'academy-rival', 'academy-oath']) q.state[id] = { status: 'done', stage: 0, progress: [] };
    const offered = q.options('marrow', () => {}, () => {}).map((o: { label: string }) => o.label).join(' | ');
    q.accept('crown-summons');
    await tp(-3166, -1060);
    talk('crownCaptain');
    talk('king');
    const summons = q.isDone('crown-summons');
    q.accept('oldest-prayer');
    talk('librarian');
    talk('priestess');
    talk('king');
    return {
      offered, summons,
      prayer: q.isDone('oldest-prayer'),
      sword: g.player.equip.items.some((i: { def: { id: string } }) => i.def.id === 'knightSword'),
      vigil: q.options('priestess', () => {}, () => {}).some((o: { label: string }) => o.label.includes('Dawn Vigil')),
    };
  });
  expect(res.offered).toContain('The Crown’s Summons');
  expect(res.summons).toBe(true);
  expect(res.prayer).toBe(true);
  expect(res.sword).toBe(true);
  expect(res.vigil).toBe(true);
  expect(game.errors).toEqual([]);
});

test('the capital’s people: the court, the envoys and the townsfolk, on streets that all connect', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(() => {
    const g = window.__game;
    const folk = g.npcs.npcs.filter((n: { rec: { settlement: string } }) => n.rec.settlement === 'royalCapital');
    const named = folk.filter((n: { rec: { named?: boolean } }) => n.rec.named).map((n: { rec: { id: string } }) => n.rec.id);
    const s = g.npcs.settlements.get('royalCapital');
    // Every node of the walking graph is reachable from the first (the East Gate).
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) for (const n of s.edges[queue.shift()!]) if (!seen.has(n)) (seen.add(n), queue.push(n));
    return { count: folk.length, named, nodes: s.nodes.length, reached: seen.size };
  });
  expect(res.count).toBeGreaterThan(150);
  for (const id of ['king', 'queen', 'chancellor', 'marshal', 'priestess', 'librarian', 'archmage', 'grandmaster', 'elfEnvoy', 'dwarfEnvoy', 'valorianEnvoy', 'sunEnvoy', 'capOstler', 'stagKeeper']) expect(res.named).toContain(id);
  expect(res.reached).toBe(res.nodes);
  expect(game.errors).toEqual([]);
});

test('the Crown’s tourney: a bout with Ser Gawen in the Silver Lance’s ring', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = window.__game, q = g.quests, T = g.THREE;
    g.player.teleport(new T.Vector3(-3262, 30, -1062));
    g.capital.buildNow();
    await (window as any).waitSteps(10);
    q.accept('crown-tourney');
    await new Promise((r) => setTimeout(r, 400));
    const opp = g.duel.opponent;
    const started = { active: g.duel.active, name: opp?.name, near: g.player.pos.distanceTo(new T.Vector3(-3264, g.player.pos.y, -1162)) < 12 };
    for (let i = 0; i < 60 && g.duel.active; i++) {
      opp.takeHit({ damage: 45, poise: 40, dir: new T.Vector3(1, 0, 0), at: opp.center.clone(), crit: false, source: 'melee' });
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 300));
    const won = q.isActive('crown-tourney', 1);
    q.options('marshal', () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    return { started, won, done: q.isDone('crown-tourney') };
  });
  expect(res.started).toEqual({ active: true, name: 'Ser Gawen Ashby', near: true });
  expect(res.won).toBe(true);
  expect(res.done).toBe(true);
  expect(game.errors).toEqual([]);
});
