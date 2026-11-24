import { test, expect, boot, SLOW } from './fixtures';
test('Verdant forest: native quest chain, encounters, temple, gathering and saved welcome', async ({ page }) => {
  test.setTimeout(900_000 * SLOW);
  const errors = await boot(page, '?test&save');
  await page.evaluate(async () => {
    const g = (window as any).__game,
      L = await import('/src/world/elves/layout.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      F = await import('/src/world/elves/forestGeometry.ts' as string),
      C = await import('/src/combat/core.ts' as string);
    g.pause(true);
    g.sleep(true);
    g.player.invulnerable = true;
    g.dialogue.paging = false;
    const go = (id: string) => {
      const a = L.FOREST_NODES[id];
      g.dialogue.close();
      g.player.teleport(new g.THREE.Vector3(a[0], T.heightAt(...a) + 0.3, a[1]));
      g.elves.update(1, true);
    };
    const speak = (qid: string, npc: string, choice?: string) => {
      let answers: any[] = [];
      const show = (text: string, opts: any[]) => {
        answers = opts;
        g.dialogue.show(npc, 'Verdant quest', text, opts);
      };
      const options = g.quests.options(npc, show, () => {}),
        title = g.quests.defs.get(qid).title,
        o = options.find((o: any) => o.auto && o.label.includes(title)) ?? options.find((o: any) => o.auto);
      if (!o) throw new Error(qid + ' no conversation: ' + options.map((x: any) => x.label));
      o.run();
      if (choice) {
        const c = answers.find((o) => o.label.includes(choice));
        if (!c) throw new Error('No choice ' + choice);
        c.run();
      }
      g.dialogue.close();
    };
    const hit = (a: any, damage = 999999) => C.strike(a, { base: damage, poise: 0, type: 'fire', from: g.player.pos.clone(), at: a.center.clone(), source: 'spell', noCrit: true });
    (window as any).elfTest = { g, L, T, F, C, go, speak, hit };
  });
  await test.step('the reachable marker opens the road, a hired guide reveals Silverbough, and the dispute persists', async () => {
    const r = await page.evaluate(() => {
      const { g, go, speak } = (window as any).elfTest,
        q = g.quests;
      go('marker');
      q.accept('elf-marker');
      speak('elf-marker', 'elf-nimri');
      q.accept('elf-token');
      g.elves
        .services()
        .get('elf-nimri')(
          () => {},
          () => {}
        )[0]
        .run();
      const hired = g.elves.guided;
      go('thornwick');
      q.accept('elf-loggers');
      go('silverbough');
      speak('elf-loggers', 'elf-thessaly');
      go('thornwick');
      speak('elf-loggers', 'elf-corwen', 'fallen-timber');
      return {
        open: g.roads.gates.find((x: any) => x.road === 'forest').open,
        hired,
        agreement: g.worldFlags['elf:logging'],
        silverbough: g.worldFlags['elf:visited:silverbough'],
      };
    });
    expect(r).toEqual({ open: true, hired: true, agreement: 'concession', silverbough: true });
  });
  await test.step('real spring spiders survive an ordinary hit and cleared encounters count for quests accepted later', async () => {
    const r = await page.evaluate(() => {
      const { g, go, hit, speak } = (window as any).elfTest;
      go('spring');
      g.elves.interactables.find((i: any) => i.label().startsWith('Challenge Webs')).action();
      const live = g.elves.live.get('spring'),
        spider = live.actors[0];
      hit(spider, 100);
      const survived = spider.alive;
      for (const a of live.actors) hit(a);
      g.elves.update(0.1, true);
      g.quests.accept('elf-webs');
      const late = g.quests.state['elf-webs'].stage;
      go('silverbough');
      speak('elf-webs', 'elf-thessaly');
      go('marker');
      speak('elf-token', 'elf-nimri');
      g.worldFlags['elf:guideUntil'] = 0;
      g.elves.update(1, true);
      return { survived, cleared: g.worldFlags['elf:clear:spring'], late, token: g.worldFlags['elf:token'], guided: g.elves.guided };
    });
    expect(r).toEqual({ survived: true, cleared: true, late: 1, token: true, guided: true });
  });
  await test.step('ordered fox and harp interactions, canopy archives and the Council all use saved quest objectives', async () => {
    const r = await page.evaluate(() => {
      const { g, go, speak, F } = (window as any).elfTest,
        q = g.quests;
      q.accept('elf-fox');
      go('fox');
      for (let k = 1; k <= 3; k++) {
        const i = g.elves.interactables.find((i: any) => i.label().includes('pawprints ' + k + '/3'));
        g.player.teleport(i.pos.clone());
        i.action();
      }
      go('silverbough');
      speak('elf-fox', 'elf-faelan');
      q.accept('elf-song');
      go('song');
      for (const note of ['Leaf', 'Rain', 'Starlight']) {
        const i = g.elves.interactables.find((i: any) => i.label() === 'Play the ' + note + ' root harp');
        g.player.teleport(i.pos.clone());
        i.action();
      }
      q.accept('elf-council');
      go('sanctum');
      for (let k = 0; k < 3; k++) {
        const at = F.canopyArchiveAt(k);
        g.player.teleport(at.clone().add(new g.THREE.Vector3(0, 0.15, 0)));
        const i = g.elves.interactables.find((i: any) => i.pos.distanceTo(at) < 0.1);
        i.action();
        g.dialogue.close();
      }
      speak('elf-council', 'elf-lirael');
      speak('elf-song', 'elf-lirael');
      return {
        fox: q.isDone('elf-fox'),
        song: q.isDone('elf-song'),
        council: q.isDone('elf-council'),
        archives: [g.worldFlags['elf:archive:turning'], g.worldFlags['elf:archive:summon'], g.worldFlags['elf:archive:roots']],
        canopyNpc: g.elves.records.filter((r: any) => r.elevation === 28).length,
      };
    });
    expect(r).toEqual({ fox: true, song: true, council: true, archives: [true, true, true], canopyNpc: 2 });
  });
  await test.step('the Blighted Elder owns the boss HUD, summons a pack and unlocks Starfall only after the encounter clears', async () => {
    const r = await page.evaluate(async () => {
      const { g, go, hit, speak } = (window as any).elfTest;
      g.quests.accept('elf-blight');
      go('elder');
      g.elves.startEncounter('elder');
      const live = g.elves.live.get('elder'),
        b = live.actors[0];
      g.elves.update(0.1, true);
      const hp = b.maxHp,
        owned = g.hud.boss === b;
      hit(b, b.maxHp * 0.45);
      const phase = b.phase;
      b.onSummon();
      await Promise.all(live.actors.map((a: any) => a.ready));
      for (const a of live.actors) hit(a);
      g.elves.update(0.1, true);
      go('sanctum');
      speak('elf-blight', 'elf-lirael');
      g.quests.accept('elf-starfall');
      return { hp, owned, phase, pack: live.actors.length, clear: g.worldFlags['elf:clear:elder'], quest: g.quests.isDone('elf-blight') };
    });
    expect(r.hp).toBeGreaterThan(5000);
    expect(r.owned).toBe(true);
    expect(r.phase).toBeGreaterThan(0);
    expect(r.pack).toBe(3);
    expect(r.clear).toBe(true);
    expect(r.quest).toBe(true);
  });
  await test.step('Starfall has two solvable mirror seals, a level 39 population, a phased guardian and a real chart chest', async () => {
    const r = await page.evaluate(async () => {
      const { g, go, hit } = (window as any).elfTest;
      go('temple');
      await g.realm.enterKit(g.elves.dungeon, 1, 'entrance');
      const one = g.realm.instance;
      const solve = (inst: any) => {
        const p = inst.puzzles;
        for (let k = 0; k < 2; k++) for (let n = 0; n < 4 && p.state[k] !== p.answer[k]; n++) p.rotate(k);
        return inst.progress.mech.includes(p.id);
      };
      const first = solve(one),
        level = one.mobs[0].obj.level;
      await g.realm.enterKit(g.elves.dungeon, 2, 'entrance');
      const two = g.realm.instance,
        second = solve(two),
        b = two.bossTarget;
      await b.inner.ready;
      const arena = two.fg.rooms.find((r: any) => r.role === 'boss');
      g.player.teleport(two.centreOf(arena));
      two.update(0.1, g.player);
      b.takeHit({ damage: b.maxHp * 0.4, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: b.center.clone(), crit: false, source: 'melee' });
      two.update(0.1, g.player);
      const phase = two.boss.phase;
      // The falling-light attack must leave a visible warning before dealing damage.
      two.boss.s.starTimer = 0;
      two.update(0.1, g.player);
      const warnings = two.boss.s.pulses.length;
      hit(b);
      two.update(0.1, g.player);
      const chest = two.chests.find((c: any) => c.item === 'elfStarChart' || c.id === 'reward-2');
      if (!chest) throw new Error('No chart chest');
      // The story chart chest is deliberately unlocked for every build.
      const chestAction = two.interactables.find((i: any) => i.pos.distanceTo(chest.pos) < 0.1 && i.label().startsWith('Open chest'));
      if (!chestAction) throw new Error('No chart chest interaction');
      chestAction.action();
      g.quests.update(1, g.player.pos);
      const chart = g.player.equip.items.some((i: any) => i.def.id === 'elfStarChart');
      const boss = two.progress.boss,
        cleared = two.doors.filter((d: any) => d.d.kind === 'reward').every((d: any) => d.open);
      await g.realm.leave();
      g.elves.sync();
      return { first, second, level, phase, warnings, boss, cleared, chart, forestBodies: g.elves.live.size };
    });
    console.log('Starfall', r);
    expect(r.first).toBe(true);
    expect(r.second).toBe(true);
    expect(r.level).toBe(39);
    expect(r.phase).toBe(1);
    expect(r.warnings).toBe(2);
    expect(r.boss).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.chart).toBe(true);
  });
  await test.step('night gathering uses E, the sky reading obeys its time window, and rewards do not repeat', async () => {
    const r = await page.evaluate(() => {
      const { g, go, speak } = (window as any).elfTest;
      go('sanctum');
      speak('elf-starfall', 'elf-lirael');
      g.quests.accept('elf-stars');
      g.quests.accept('elf-bloom');
      go('glade');
      g.time.skipTo(12);
      g.quests.update(1, g.player.pos);
      const dayTalk = g.quests
        .options(
          'elf-sylwen',
          () => {},
          () => {}
        )
        .some((o: any) => o.auto && o.label.includes('What the Stars Say'));
      const patch = g.elves.interactables.find((i: any) => i.label() === 'Gather Night Bloom');
      g.player.teleport(patch.pos.clone());
      patch.action();
      const before = g.player.equip.items.filter((i: any) => i.def.id === 'elfMoonblossom').reduce((n: number, i: any) => n + i.qty, 0);
      g.time.skipTo(21);
      g.dialogue.close();
      g.input.uiMode = false;
      g.input.releaseAll();
      g.input.press('KeyE');
      g.stepSim(2);
      g.input.releaseAll();
      const after = g.player.equip.items.filter((i: any) => i.def.id === 'elfMoonblossom').reduce((n: number, i: any) => n + i.qty, 0);
      patch.action();
      const repeat = g.player.equip.items.filter((i: any) => i.def.id === 'elfMoonblossom').reduce((n: number, i: any) => n + i.qty, 0);
      g.quests.update(1, g.player.pos);
      speak('elf-stars', 'elf-sylwen');
      g.save();
      return { dayTalk, before, after, repeat, done: g.quests.isDone('elf-stars'), bearing: g.worldFlags['elf:mountainBearing'], temple: g.realm.progress.kit.starfall.boss };
    });
    console.log('night', r);
    expect(r.dayTalk).toBe(false);
    expect(r.after - r.before).toBe(3);
    expect(r.repeat).toBe(r.after);
    expect(r.done).toBe(true);
    expect(r.bearing).toBe(true);
    expect(r.temple).toBe(true);
  });
  await test.step('saved quests, earned guidance, choices and temple progress survive reload', async () => {
    await page.reload();
    await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 240_000 * SLOW });
    const r = await page.evaluate(() => {
      const g = (window as any).__game;
      g.pause(true);
      g.sleep(true);
      return {
        token: g.worldFlags['elf:token'],
        guided: g.elves.guided,
        logging: g.worldFlags['elf:logging'],
        stars: g.quests.isDone('elf-stars'),
        boss: g.realm.progress.kit.starfall.boss,
      };
    });
    expect(r).toEqual({ token: true, guided: true, logging: 'concession', stars: true, boss: true });
  });
  expect(errors).toEqual([]);
});
