import { test, expect, boot, SLOW } from './fixtures';

test('field progress preserves ordered clues, separate war and rift outcomes, and one-time completion across save data', async ({ page }) => {
  await page.route('**/field-audit.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/field-audit.html');
  const r = await page.evaluate(async () => {
    const C = await import('/src/world/frontiers/catalog.ts' as string),
      P = await import('/src/world/frontiers/progress.ts' as string),
      F = await import('/src/world/frontiers/context.ts' as string);
    const defs = C.fieldCatalog(),
      flags: any = {},
      p = new P.FieldProgress(flags);
    const cache = defs.find((d: any) => d.id === 'glen-letters'),
      rift = defs.find((d: any) => d.id === 'heartland-rift'),
      aid = defs.find((d: any) => d.id === 'glen-relief');
    const skipped = p.advance(cache, 2),
      premature = p.finish(cache, 'recorded');
    for (let i = 0; i < 3; i++) p.advance(cache, i);
    const completed = p.finish(cache, 'recorded'),
      duplicate = p.finish(cache, 'recorded');
    for (let i = 0; i < 3; i++) p.advance(rift, i);
    p.begin(rift);
    const guarded = p.finish(rift, 'sealed');
    p.defeat(rift, 0);
    p.defeat(rift, 1);
    const sealed = p.finish(rift, 'sealed');
    const riftRelief = flags[F.pressureKey('heartland')] ?? 0;
    p.discover(aid);
    const supplied = p.finish(aid, 'supplied');
    p.finish(
      defs.find((d: any) => d.id === 'crown-toll'),
      'paid'
    );
    const paidRelief = flags[F.pressureKey('crownRoad')] ?? 0;
    const copy = new P.FieldProgress(JSON.parse(JSON.stringify(flags)));
    return {
      count: defs.length,
      unique: new Set(defs.map((d: any) => d.id)).size,
      skipped,
      premature,
      completed,
      duplicate,
      guarded,
      sealed,
      riftRelief,
      supplied,
      paidRelief,
      restored: copy.done(cache) && copy.done(rift) && copy.done(aid),
      pass: flags['field:pass:heartland'],
      relief: flags[F.pressureKey('heartland')],
      kinds: [...new Set(defs.map((d: any) => d.kind))],
    };
  });
  expect(r.count).toBe(28);
  expect(r.unique).toBe(28);
  expect(r.skipped).toBe(false);
  expect(r.premature).toBe(false);
  expect(r.completed).toBe(true);
  expect(r.duplicate).toBe(false);
  expect(r.guarded).toBe(false);
  expect(r.sealed).toBe(true);
  expect(r.riftRelief).toBe(0);
  expect(r.paidRelief).toBe(0);
  expect(r.relief).toBe(1);
  expect(r.pass).toBe(true);
  expect(r.restored).toBe(true);
  expect(r.kinds).toHaveLength(7);
});

test('playable field discoveries, aid, negotiation, combat, rift sealing, journal and streaming cleanup', async ({ page }, info) => {
  test.setTimeout(700_000 * SLOW);
  const errors = await boot(page, '?test&save');
  const placement = await page.evaluate(async () => {
    const g = (window as any).__game,
      H = await import('/src/world/terrainHeight.ts' as string),
      W = await import('/src/world/waterLevel.ts' as string),
      C = await import('/src/world/frontiers/scenery.ts' as string);
    g.pause(true);
    g.sleep(true);
    g.dialogue.close();
    g.dialogue.paging = false;
    g.input.uiMode = false;
    g.input.releaseAll();
    g.player.invulnerable = true;
    g.population.enabled = false;
    g.raids.enabled = false;
    g.sites.enabled = false;
    g.encounters.enabled = false;
    g.fieldLife.reset();
    const f = g.fieldLife,
      p = g.player;
    (window as any).FT = {
      g,
      f,
      p,
      go: (id: string, node = 0) => {
        g.dialogue.close();
        g.input.releaseAll();
        p.act = null;
        p.clearCombatInput();
        const d = f.defs.find((d: any) => d.id === id),
          at = f.locations.get(id),
          [x, z] = C.NODE_OFFSETS[node];
        p.teleport(new g.THREE.Vector3(at.x + x, H.heightAt(at.x + x, at.z + z) + 0.08, at.z + z));
        f.update(0.5, true);
        g.physics.step(1 / 60);
        return d;
      },
      act: (id: string, node = 0) => {
        const at = f.locations.get(id),
          [x, z] = C.NODE_OFFSETS[node];
        const a = f.interactables
          .filter((a: any) => Math.hypot(a.pos.x - at.x - x, a.pos.z - at.z - z) < (node === 0 ? 3 : 0.1) && a.enabled())
          .sort((a: any, b: any) => Math.hypot(a.pos.x - at.x - x, a.pos.z - at.z - z) - Math.hypot(b.pos.x - at.x - x, b.pos.z - at.z - z))[0];
        if (!a) throw new Error('No action for ' + id + ' node ' + node);
        a.action();
        return a;
      },
    };
    const wet: any[] = [];
    for (const d of f.defs) {
      const at = f.locations.get(d.id);
      for (const [x, z] of C.NODE_OFFSETS) {
        const water = W.waterSurfaceAt(at.x + x, at.z + z),
          y = H.heightAt(at.x + x, at.z + z);
        if (water !== null && y <= water + 0.2) wet.push({ id: d.id, x: at.x + x, z: at.z + z, y, water });
      }
    }
    return { count: f.defs.length, unavailable: f.stats.unavailable, unavailableIds:[...f.unavailable], wet, locations: f.defs.map((d: any) => ({ id: d.id, p: f.locations.get(d.id).toArray() })) };
  });
  console.log('field placement', placement);
  expect(placement.count).toBe(28);
  expect(placement.unavailable).toBe(0);
  expect(placement.wet).toEqual([]);
  const find = await page.evaluate(() => {
    const { g, f, p, go, act } = (window as any).FT;
    const d = go('glen-letters'),
      before = p.equip.items.filter((i: any) => i.def.id === 'healthPotion').reduce((n: number, i: any) => n + i.qty, 0);
    act(d.id);
    go(d.id, 1);
    act(d.id, 1);
    go(d.id, 2);
    const final = act(d.id, 2);
    const once = p.equip.items.filter((i: any) => i.def.id === 'healthPotion').reduce((n: number, i: any) => n + i.qty, 0);
    final.action();
    const twice = p.equip.items.filter((i: any) => i.def.id === 'healthPotion').reduce((n: number, i: any) => n + i.qty, 0);
    const seen = f.markers().find((m: any) => m.label === d.name);
    g.questUI.toggle(true);
    return { done: f.progress.done(d), gain: once - before, replay: twice - once, marker: seen.kind };
  });
  expect(find).toEqual({ done: true, gain: 3, replay: 0, marker: 'siteDone' });
  await page.locator('.journal [data-cat="field"]').click();
  await expect(page.locator('.journal .j-body')).toContainText('Letters that never arrived');
  await expect(page.locator('.journal [data-field-map="glen-letters"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('field-notes.png') });
  await page.evaluate(() => {
    (window as any).__game.questUI.toggle(false);
  });
  const aid = await page.evaluate(() => {
    const { g, f, p, go, act } = (window as any).FT;
    const d = go('glen-relief');
    const before = p.equip.items.filter((i: any) => i.def.id === 'healthPotion').reduce((n: number, i: any) => n + i.qty, 0);
    act(d.id);
    const choice = g.dialogue.options.find((o: any) => o.label.includes('Health Draught'));
    choice.run();
    choice.run();
    const after = p.equip.items.filter((i: any) => i.def.id === 'healthPotion').reduce((n: number, i: any) => n + i.qty, 0);
    return { used: before - after, done: f.progress.done(d), pass: g.worldFlags['field:pass:heartland'], relief: g.worldFlags['field:relief:heartland'] };
  });
  expect(aid).toEqual({ used: 1, done: true, pass: true, relief: 1 });
  await page.evaluate(async () => {
    const { g, f, p } = (window as any).FT;
    const live = f.live.get('glen-relief');
    await live.scenery.ready;
    p.present(1, 0);
    g.r.camera.position.copy(p.pos).add(new g.THREE.Vector3(10, 7, 12));
    g.r.camera.lookAt(p.pos.clone().add(new g.THREE.Vector3(0, 1, 0)));
    g.r.camera.updateMatrixWorld();
    g.r.render(0.016);
  });
  await page.screenshot({ path: info.outputPath('relief-camp.png') });
  const parley = await page.evaluate(() => {
    const { g, f, go, act } = (window as any).FT;
    // The discovered false-payroll evidence supplies a nonviolent option at a real checkpoint.
    for (let i = 0; i < 3; i++) {
      go('crown-payroll', i);
      act('crown-payroll', i);
    }
    const d = go('crown-toll');
    act(d.id);
    const choice = g.dialogue.options.find((o: any) => o.label.includes('forged'));
    choice.run();
    return { done: f.progress.done(d), foes: f.actors(d.id).length, outcome: g.worldFlags['field:' + d.id + ':outcome'] };
  });
  expect(parley).toEqual({ done: true, foes: 0, outcome: 'negotiated' });
  const convoy = await page.evaluate(async () => {
    const { g, f, p, go, act } = (window as any).FT;
    const d = go('crown-convoy');
    act(d.id);
    g.dialogue.options.find((o: any) => o.label.includes('clear the raiders')).run();
    await Promise.all(f.actors(d.id).map((a: any) => a.ready));
    const count = f.actors(d.id).length,
      level = f.actors(d.id)[0].level;
    const kill = (a: any) => a.takeHit({ damage: 1e7, at: a.center.clone(), dir: new g.THREE.Vector3(1, 0, 0), poise: 1e6, heavy: true, type: 'blunt', crit: false });
    kill(f.actors(d.id)[0]);
    // Death is persisted even when a teleport immediately unloads the site.
    go('glen-letters');
    go(d.id);
    await Promise.all(f.actors(d.id).map((a: any) => a.ready));
    const remaining = f.actors(d.id).filter((a: any) => a.alive).length;
    for (const a of f.actors(d.id)) if (a.alive) kill(a);
    f.update(0.05, true);
    const gold = p.prog.gold;
    act(d.id);
    const reward = p.prog.gold - gold;
    act(d.id);
    g.dialogue.close();
    return { count, level, remaining, done: f.progress.done(d), reward, duplicate: p.prog.gold - gold - reward };
  });
  console.log('field convoy', convoy);
  expect(convoy.count).toBe(3);
  expect(convoy.level).toBe(16);
  expect(convoy.remaining).toBe(2);
  expect(convoy.done).toBe(true);
  expect(convoy.reward).toBeGreaterThan(0);
  expect(convoy.duplicate).toBe(0);
  const rift = await page.evaluate(async () => {
    const { g, f, go, act } = (window as any).FT;
    const d = go('heartland-rift');
    for (let i = 0; i < 3; i++) {
      go(d.id, i);
      act(d.id, i);
    }
    await Promise.all(f.actors(d.id).map((a: any) => a.ready));
    for (let i = 0; i < 180; i++) {
      f.update(1 / 60, true);
      g.physics.step(1 / 60);
    }
    go(d.id);
    const seal = f.interactables.find((a: any) => a.label() === 'Seal the Dark breach' && a.pos.distanceTo(f.locations.get(d.id)) < 3);
    seal.action();
    const blocked = !f.progress.done(d);
    for (const a of f.actors(d.id)) a.takeHit({ damage: 1e7, at: a.center.clone(), dir: new g.THREE.Vector3(1, 0, 0), poise: 1e6, heavy: true, type: 'blunt', crit: false });
    f.update(0.05, true);
    seal.action();
    const closed = f.progress.done(d);
    go('glen-relief');
    f.reset();
    const count = g.physics.world.bodies.len(),
      targets = (await import('/src/combat/targets.ts' as string)).targets.size;
    for (let i = 0; i < 3; i++) {
      go('glen-relief');
      f.reset();
    }
    const after = g.physics.world.bodies.len(),
      afterTargets = (await import('/src/combat/targets.ts' as string)).targets.size;
    g.save();
    const saves = Object.values(localStorage).filter((v: any) => typeof v === 'string' && v.includes('field:heartland-rift:done'));
    return { blocked, closed, bodyDelta: after - count, targetDelta: afterTargets - targets, live: f.stats.live, saved: saves.length > 0 };
  });
  console.log('field rift and cleanup', rift);
  expect(rift).toEqual({ blocked: true, closed: true, bodyDelta: 0, targetDelta: 0, live: 0, saved: true });
  const roads = await page.evaluate(async () => {
    const { g, p } = (window as any).FT,
      N = await import('/src/world/roadNetwork.ts' as string),
      H = await import('/src/world/terrainHeight.ts' as string);
    const e = g.encounters;
    e.clear();
    for (const kind of ['refugees', 'courier', 'sappers']) e.force(kind, 1800, 'capital');
    const groups = e.census().map((g: any) => ({ kind: g.kind, n: g.walkers }));
    e.clear();
    const q = N.pointAlong(N.road('capital'), 1800);
    p.teleport(new g.THREE.Vector3(q.x, H.heightAt(q.x, q.z) + 0.1, q.z));
    const roll = e.roll,
      captures: any[] = [];
    e.roll = (t: any) => {
      captures.push(Object.fromEntries(t.map(([w, k]: any) => [k, w])));
      return 'courier';
    };
    e.enabled = true;
    for (const relief of [0, 3]) {
      g.worldFlags['field:relief:crownRoad'] = relief;
      e.timer = 0;
      e.update(0.05, 12, 0);
    }
    e.roll = roll;
    e.enabled = false;
    e.clear();
    return { groups, before: captures[0], after: captures[1] };
  });
  console.log('wartime roads', roads);
  expect(roads.groups).toEqual([
    { kind: 'refugees', n: 3 },
    { kind: 'courier', n: 1 },
    { kind: 'sappers', n: 2 },
  ]);
  expect(roads.after.bandits).toBeLessThan(roads.before.bandits);
  expect(roads.after.refugees).toBeLessThan(roads.before.refugees);
  expect(roads.after.sappers).toBeGreaterThan(roads.before.sappers);
  expect(errors).toEqual([]);
});
