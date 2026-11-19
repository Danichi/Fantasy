import { test, expect, boot, SLOW } from './fixtures';

// A real world boot, native enemies/quests/physics/charter and a save reload.
test('island expedition: every island, four sanctuary bosses, diving, economies and persistent passage', async ({ page }) => {
  test.setTimeout(900_000 * SLOW);
  const errors = await boot(page, '?test&save');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause(true);
    g.sleep(true);
    g.player.invulnerable = true;
    g.dialogue.paging = false;
  });

  await test.step('atlas covers all landmasses and walking routes stay under the climbing limit', async () => {
    const r = await page.evaluate(async () => {
      const L = await import('/src/world/islands/layout.ts' as string),
        T = await import('/src/world/terrainHeight.ts' as string);
      let worst = 0;
      const flooded: string[] = [];
      for (const i of L.ISLANDS) {
        if (!L.SITES.some((s: any) => s.island === i.id)) throw new Error('Empty island ' + i.id);
        if (T.worldHeightFn(...i.landing) < 0.4) flooded.push(i.id);
        for (const p of i.paths)
          for (let j = 1; j < p.length; j++) {
            const a = p[j - 1],
              b = p[j],
              n = 20;
            for (let k = 0; k < n; k++) {
              const h0 = T.worldHeightFn(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
              const h1 = T.worldHeightFn(a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n);
              worst = Math.max(worst, Math.abs(h1 - h0) / (Math.hypot(b[0] - a[0], b[1] - a[1]) / n));
            }
          }
      }
      return { count: L.ISLANDS.length, sites: L.SITES.length, wards: L.REGIONS.map((r: string) => L.wardsOf(r).length), worst, flooded };
    });
    console.log('atlas', r);
    expect(r.count).toBe(43);
    expect(r.sites).toBe(122);
    expect(r.wards).toEqual([3, 3, 3, 3]);
    expect(r.flooded).toEqual([]);
    expect(r.worst).toBeLessThan(Math.tan((48 * Math.PI) / 180));
  });
  await test.step('all 43 islands stream, discoveries replay into late quests, and static bodies are released', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game,
        L = await import('/src/world/islands/layout.ts' as string),
        T = await import('/src/world/terrainHeight.ts' as string),
        a = g.archipelagos;
      // Isolate the island stream from unrelated terrain/forest collider LOD.
      const warm = g.player.onTeleport;
      g.player.onTeleport = undefined;
      const startBodies = g.physics.world.bodies.len();
      let max = 0;
      for (const i of L.ISLANDS) {
        g.player.swimming = false;
        g.player.teleport(new g.THREE.Vector3(i.at[0], T.heightAt(...i.at) + 0.1, i.at[1]));
        a.update(3.1, true);
        max = Math.max(max, a.active.size);
      }
      a.suspend();
      const afterBodies = g.physics.world.bodies.len();
      g.player.onTeleport = warm;
      g.quests.accept('isles-azureIsles-landfall');
      a.update(0.3, true);
      const stage = g.quests.state['isles-azureIsles-landfall'].stage;
      const safeOutposts = L.SITES.filter((s: any) => s.kind === 'village').every((s: any) => !g.population.spotOk(s.x, s.z));
      const records = a.records.length;
      const quests = [...g.quests.defs.keys()].filter((id: any) => id.startsWith('isles-')).length;
      a.suspend();
      return { visited: L.ISLANDS.filter((i: any) => g.worldFlags['isle:visited:' + i.id]).length, max, startBodies, afterBodies, stage, records, quests, safeOutposts };
    });
    console.log('streaming', r);
    expect(r.visited).toBe(43);
    expect(r.max).toBeLessThanOrEqual(6);
    expect(r.afterBodies).toBe(r.startBodies);
    expect(r.stage).toBe(1);
    expect(r.safeOutposts).toBe(true);
    expect(r.records).toBe(15);
    expect(r.quests).toBe(18);
  });
  await test.step('bosses require all three correctly solved sanctuaries and clear through real combat', async () => {
    for (const region of ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles']) {
      console.log('boss', region);
      const result = await page.evaluate(async (region) => {
        const g = (window as any).__game,
          L = await import('/src/world/islands/layout.ts' as string),
          T = await import('/src/world/terrainHeight.ts' as string),
          C = await import('/src/combat/core.ts' as string),
          a = g.archipelagos;
        const walk = (s: any) => {
          g.player.swimming = false;
          g.player.teleport(new g.THREE.Vector3(s.x, T.heightAt(s.x, s.z) + 0.1, s.z));
          a.update(0.3, true);
        };
        const q = g.quests,
          giver = 'hm-' + { azureIsles: 'azureHaven', emeraldIsles: 'emeraldCove', shatteredIsles: 'wreckersRest', sunkenIsles: 'sunkenSpire' }[region];
        const report = (id: string) => {
          const title = q.defs.get(id).title;
          const option = q
            .options(
              giver,
              () => {},
              () => {}
            )
            .find((o: any) => o.label.includes(title));
          if (!option) throw new Error('No turn-in for ' + id);
          option.run();
        };
        const prefix = 'isles-' + region;
        q.accept(prefix + '-landfall');
        a.update(0.3, true);
        report(prefix + '-landfall');
        if (!q.canOffer(q.defs.get(prefix + '-wards'))) throw new Error('Sanctuary quest did not unlock');
        q.accept(prefix + '-wards');
        const boss = L.bossOf(region);
        walk(boss);
        const blocked = !a.startEncounter(boss);
        for (const w of L.wardsOf(region)) {
          walk(w);
          a.interact(w.id);
          g.dialogue.options[(L.THEMES[region].sequence[0] + 1) % 3].run();
          if (g.worldFlags['isle:rune:' + w.id] !== 0) throw new Error('Wrong answer did not reset');
          const answers: Record<string, string[]> = {
            azureIsles: ['Low shell', 'Middle shell', 'High shell'],
            emeraldIsles: ['Root', 'Rain', 'Sun'],
            shatteredIsles: ['East watch', 'West watch', 'North watch'],
            sunkenIsles: ['Dawn', 'Tide', 'Night'],
          };
          for (const label of answers[region]) g.dialogue.options.find((o: any) => o.label === label).run();
          if (!g.worldFlags['isle:done:' + w.id]) throw new Error('Sanctuary failed ' + w.id);
        }
        a.update(0.3, true);
        report(prefix + '-wards');
        q.accept(prefix + '-boss');
        walk(boss);
        // Re-enter while the first preparation promise is outstanding.
        // A discarded encounter must not appear later as a second boss.
        if (region === 'azureIsles') {
          a.startEncounter(boss);
          a.resetFights();
        }
        const started = a.startEncounter(boss);
        const live = a.active.get(boss.island);
        for (let k = 0; k < 180 && live.encounters.get(boss.id).pending; k++) await new Promise((r) => setTimeout(r, 250));
        const enc = live.encounters.get(boss.id);
        if (enc.pending) throw new Error('Boss preparation timed out');
        await Promise.all(enc.actors.map((b: any) => b.ready));
        if (live.actors.length !== enc.actors.length) throw new Error('An abandoned preparation spawned a ghost boss');
        const actor = enc.actors[0];
        const engaged = actor.engaged ?? actor.awake ?? actor.alerted;
        if (!engaged) throw new Error('The challenge left its boss asleep');
        const hp = enc.actors[0].maxHp,
          level = enc.actors[0].level;
        for (const b of enc.actors) C.strike(b, { base: 999999, poise: 9999, type: 'fire', from: g.player.pos.clone(), at: b.center.clone(), source: 'melee', noCrit: true });
        a.update(0.1, true);
        const clear = !!g.worldFlags['isle:clear:' + boss.id];
        a.interact(boss.id);
        const gold = g.player.prog.gold;
        a.interact(boss.id);
        const duplicate = g.player.prog.gold !== gold;
        g.dialogue.close();
        report(prefix + '-boss');
        const completed = q.isDone(prefix + '-boss');
        a.suspend();
        return { completed, blocked, started, clear, duplicate, hp, level };
      }, region);
      console.log(region, result);
      expect(result.completed).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.started).toBe(true);
      expect(result.clear).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.hp).toBeGreaterThan(2000);
    }
  });
  await test.step('a dive cache needs actual depth, gathers renew by day, merchants remove the sold quantity', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game,
        L = await import('/src/world/islands/layout.ts' as string),
        T = await import('/src/world/terrainHeight.ts' as string),
        a = g.archipelagos,
        p = g.player;
      const dive = L.SITES.find((s: any) => s.kind === 'dive');
      p.teleport(new g.THREE.Vector3(dive.x, -1, dive.z));
      p.swimming = true;
      p.diveDepth = 0;
      a.update(0.3, true);
      a.interact(dive.id);
      const surface = !!g.worldFlags['isle:done:' + dive.id];
      g.dialogue.close();
      g.input.uiMode = false;
      p.stamina = p.maxStamina;
      p.breath = 1;
      g.input.press('KeyC');
      g.stepSim(120);
      g.input.releaseAll();
      const actualDepth = p.diveDepth;
      const recovered = a.interact(dive.id) && !!g.worldFlags['isle:done:' + dive.id];
      const resource = L.SITES.find((s: any) => s.kind === 'resource');
      p.swimming = false;
      p.teleport(new g.THREE.Vector3(resource.x, T.heightAt(resource.x, resource.z) + 0.1, resource.z));
      a.update(0.3, true);
      const count = () => p.equip.items.filter((i: any) => i.def.id === resource.item).reduce((n: number, i: any) => n + i.qty, 0);
      const before = count();
      a.interact(resource.id);
      a.interact(resource.id);
      const first = count() - before;
      g.time.day++;
      a.interact(resource.id);
      const renewed = count() - before - first;
      const qty = count(),
        gold = p.prog.gold;
      const opts = a.services().get('isle-folk:' + resource.region + ':1')(
        () => {},
        () => {}
      );
      opts[1].run();
      const sold = qty - count(),
        paid = p.prog.gold - gold;
      a.suspend();
      return { surface, recovered, first, renewed, sold, paid, actualDepth };
    });
    console.log('economy', r);
    expect(r.actualDepth).toBeGreaterThan(1);
    expect(r.surface).toBe(false);
    expect(r.recovered).toBe(true);
    expect([r.first, r.renewed, r.sold, r.paid]).toEqual([3, 3, 3, 75]);
  });
  await test.step('native charter finds safe harbour routes and the cabin rest completes an island voyage', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game,
        T = await import('/src/world/terrainHeight.ts' as string),
        N = await import('/src/world/sea/navigation.ts' as string),
        a = g.archipelagos;
      const port = (id: string) => a.d.ports.find((p: any) => p.def.id === id);
      const routes = a.d.ports.map((p: any) => ({ id: p.def.id, route: !!N.chartRoute(new g.THREE.Vector3(3000, 0, 150), p.zone, 2.4, p.def.name) }));
      g.player.teleport(new g.THREE.Vector3(2930, T.heightAt(2930, 150) + 0.3, 150));
      g.player.swimming = false;
      g.player.prog.addGold(5000);
      const sailed = a.sail('portAurelle', 'azureHaven'),
        aboard = g.sailing.aboard;
      g.sailing.onCharterRest();
      await new Promise((r) => setTimeout(r, 0));
      for (let k = 0; k < 160 && g.sailing.autopilot; k++) g.stepSim(30);
      return { routes, sailed, aboard, landed: !a.voyaging && !g.sailing.aboard, distance: g.player.pos.distanceTo(port('azureHaven').landing) };
    });
    console.log('passage', r);
    expect(r.routes.every((r) => r.route)).toBe(true);
    expect(r.sailed).toBe(true);
    expect(r.aboard).toBe(true);
    expect(r.landed).toBe(true);
    expect(r.distance).toBeLessThan(10);
  });
  await test.step('world save restores discoveries, puzzles, harvested sites and a pending passage', async () => {
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.worldFlags['isle:passage'] = 'emeraldCove';
      g.save();
    });
    await page.reload();
    await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 240_000 * SLOW });
    const r = await page.evaluate(async () => {
      const g = (window as any).__game,
        L = await import('/src/world/islands/layout.ts' as string);
      g.pause(true);
      g.sleep(true);
      return {
        visited: L.ISLANDS.filter((i: any) => g.worldFlags['isle:visited:' + i.id]).length,
        wards: L.SITES.filter((s: any) => s.kind === 'ward' && g.worldFlags['isle:done:' + s.id]).length,
        clears: L.SITES.filter((s: any) => s.kind === 'boss' && g.worldFlags['isle:clear:' + s.id]).length,
        questComplete: ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles'].every((r) => g.quests.isDone('isles-' + r + '-boss')),
        pending: g.worldFlags['isle:passage'] ?? null,
        x: g.player.pos.x,
        z: g.player.pos.z,
      };
    });
    console.log('reload', r);
    expect(r.visited).toBe(43);
    expect(r.wards).toBe(12);
    expect(r.clears).toBe(4);
    expect(r.questComplete).toBe(true);
    expect(r.pending).toBeNull();
    expect(Math.hypot(r.x - 6800, r.z - 2690)).toBeLessThan(70);
  });
  expect(errors).toEqual([]);
});
