import { test, expect } from './fixtures';

test('forest guidance expires safely, Lost Woods return to a refuge, and pending encounters release their bodies', async ({ page }) => {
  await page.route('**/forest-lifecycle.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/forest-lifecycle.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const THREE = await import('/node_modules/three/build/three.module.js' as string),
      P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      L = await import('/src/world/elves/layout.ts' as string),
      F = await import('/src/world/elves/elvenForest.ts' as string),
      Q = await import('/src/quests/questLog.ts' as string),
      FX = await import('/src/fx/particles.ts' as string),
      C = await import('/src/combat/targets.ts' as string);
    await P.physics.init();
    const scene = new THREE.Scene(),
      flags: Record<string, any> = {},
      inventory: Record<string, number> = {};
    let day = 0,
      hour = 7;
    const player: any = {
      pos: new THREE.Vector3(),
      prog: { origin: 'human', gold: 1000, addXp: () => {}, addGold: () => {} },
      paths: { level: () => 0 },
      dead: false,
      mounted: false,
      swimming: false,
      teleport(p: any) {
        this.pos.copy(p);
      },
    };
    const q = new Q.QuestLog({
      count: (id: string) => inventory[id] ?? 0,
      take: (id: string, n: number) => (inventory[id] -= n),
      give: (id: string, n: number) => (inventory[id] = (inventory[id] ?? 0) + n),
      gold: () => {},
      xp: () => {},
      guildRep: () => {},
      toast: () => {},
      npcPos: () => null,
      hour: () => hour,
    });
    const mats: any = {};
    for (const k of ['stone', 'bridgeStone', 'plaster', 'timber', 'slate', 'tile', 'thatch', 'planks', 'glass', 'bark', 'window', 'windowLit', 'door'])
      mats[k] = new THREE.MeshStandardMaterial({ color: 0x729579 });
    const realm: any = {
      overworldInteractables: [],
      progress: {},
      registerKit(_def: any, door: any) {
        this.overworldInteractables.push({ pos: door });
      },
    };
    const forest = new F.ElvenForest({
      scene,
      mats,
      fx: new FX.FX(scene),
      player,
      quests: q,
      realm,
      flags,
      day: () => day,
      hour: () => hour,
      toast: () => {},
      card: () => {},
      give: (id: string, n: number) => (inventory[id] = (inventory[id] ?? 0) + n),
      save: () => {},
      talk: () => {},
      close: () => {},
      bossBar: () => {},
      openRoad: () => {},
      rest: () => {},
      craft: () => {},
      trade: () => {},
    });
    const NPC = await import('/src/npc/npcManager.ts' as string);
    const residents = new NPC.NpcManager(scene, { hour: 7, day: 0 });
    for (const settlement of forest.settlements) residents.addSettlement(settlement);
    for (const record of forest.records) residents.add(record);
    const councilHeight = residents.find('elf-lirael').pos.y - T.heightAt(...L.FOREST_NODES.sanctum);
    const go = (id: string) => {
      const a = L.FOREST_NODES[id];
      player.teleport(new THREE.Vector3(a[0], T.heightAt(...a) + 0.2, a[1]));
      forest.update(1, true);
    };
    go('sanctum');
    const introduction = forest.interactables.find((i: any) => i.label() === 'Explore Elven Sanctum');
    let introductionOverlaps = 0;
    P.physics.step(1 / 60);
    P.physics.world.intersectionsWithShape(
      { x: introduction.pos.x, y: introduction.pos.y + 0.95, z: introduction.pos.z },
      { x: 0, y: 0, z: 0, w: 1 },
      new P.physics.R.Capsule(0.55, 0.32),
      () => {
        introductionOverlaps++;
        return true;
      },
      P.physics.R.QueryFilterFlags.ONLY_FIXED,
      P.STATIC_ONLY
    );
    flags['elf:guideUntil'] = 24;
    go('silverbough');
    const revealed = forest.live.has('silverbough');
    day = 1;
    hour = 0;
    forest.update(1, true);
    const hidden = !forest.live.has('silverbough');
    player.teleport(new THREE.Vector3(-2200, T.heightAt(-2200, -3200), -3200));
    forest.update(5.4, true);
    const refuge = L.forestRefugeAt(L.FOREST_NODES.sanctum);
    const returned = player.pos.distanceTo(new THREE.Vector3(refuge[0], T.heightAt(...refuge) + 0.3, refuge[1])) < 0.1;
    flags['elf:token'] = true;
    go('glade');
    const patch = forest.interactables.find((i: any) => i.label() === 'Gather Night Bloom');
    player.teleport(patch.pos.clone());
    hour = 12;
    patch.action();
    const daytime = inventory.elfMoonblossom ?? 0;
    hour = 21;
    patch.action();
    patch.action();
    const once = inventory.elfMoonblossom;
    day++;
    patch.action();
    const tomorrow = inventory.elfMoonblossom;
    forest.suspend();
    const baseline = P.physics.world.bodies.len();
    go('hunter');
    forest.startEncounter('hunter');
    const actors = forest.live.get('hunter').actors.slice();
    forest.suspend();
    await Promise.all(actors.map((a: any) => a.ready));
    const after = P.physics.world.bodies.len(),
      targets = C.targets.size;
    // Saved encounter facts replay into side quests accepted later.
    flags['elf:clear:hunter'] = true;
    q.accept('elf-hunter');
    forest.sync();
    const late = q.state['elf-hunter'].stage;
    return { introductionOverlaps, councilHeight, revealed, hidden, returned, daytime, once, tomorrow, baseline, after, targets, late, rescuedNpc: !forest.absent('elf-eryndis') };
  });
  expect(result.introductionOverlaps).toBe(0);
  expect(result.councilHeight).toBeCloseTo(28, 1);
  expect(result.revealed).toBe(true);
  expect(result.hidden).toBe(true);
  expect(result.returned).toBe(true);
  expect(result.daytime).toBe(0);
  expect(result.once).toBe(3);
  expect(result.tomorrow).toBe(6);
  expect(result.after).toBe(result.baseline);
  expect(result.targets).toBe(0);
  expect(result.late).toBe(1);
  expect(result.rescuedNpc).toBe(true);
});

test('both forest bosses run their real sandbox sessions with phases and clean retry disposal', async ({ page }) => {
  await page.route('**/forest-bosses.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/forest-bosses.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const THREE = await import('/node_modules/three/build/three.module.js' as string),
      P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      R = await import('/src/sandbox/bossRoster.ts' as string),
      B = await import('/src/enemies/bandit.ts' as string),
      F = await import('/src/fx/particles.ts' as string),
      C = await import('/src/combat/targets.ts' as string);
    await P.physics.init();
    T.setGroundOverride(() => 0);
    const scene = new THREE.Scene(),
      fx = new F.FX(scene),
      bolts = new B.Bolts(scene),
      player: any = {
        pos: new THREE.Vector3(70, 0, 0),
        center: new THREE.Vector3(70, 0.9, 0),
        vel: new THREE.Vector3(),
        dead: false,
        receiveAttack: () => ({}),
        takeDamage: () => {},
      };
    const start = P.physics.world.bodies.len(),
      out = [];
    for (const id of ['elfBlightedElder', 'starwarden']) {
      const session = await R.PRACTICE_BOSSES.find((b: any) => b.id === id).create({ scene, fx, bolts, at: new THREE.Vector3(), say: () => {} });
      await session.ready;
      const boss = session.health();
      boss.takeHit({ damage: boss.maxHp * 0.5, poise: 0, dir: new THREE.Vector3(0, 0, 1), at: boss.center.clone(), source: 'melee', crit: false });
      session.update(0.1, player);
      for (let i = 0; i < (id === 'elfBlightedElder' ? 70 : 51); i++) session.update(0.1, player);
      let warnings = 0;
      scene.traverse((o: any) => {
        if (o.isMesh && o.geometry.type === 'CircleGeometry' && o.material.transparent && o.material.emissive) warnings++;
      });
      out.push({ id, phaseHealth: boss.hp / boss.maxHp, targets: session.targets().length, warnings });
      session.dispose();
      await new Promise((r) => setTimeout(r, 100));
    }
    return { out, start, end: P.physics.world.bodies.len(), targets: C.targets.size };
  });
  console.log('forest sandbox', result);
  expect(result.out[0].targets).toBeGreaterThan(1);
  expect(result.out[1].warnings).toBeGreaterThanOrEqual(2);
  expect(result.end).toBe(result.start);
  expect(result.targets).toBe(0);
});
