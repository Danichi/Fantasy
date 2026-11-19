import { test, expect, SLOW } from './fixtures';

test('island encounters keep the combat HUD and underwater finds use the normal interaction key', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const r = await game.page.evaluate(async () => {
    const g = (window as any).__game,
      L = await import('/src/world/islands/layout.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string);
    g.pause(true);
    g.sleep(true);
    g.player.invulnerable = true;
    const a = g.archipelagos,
      p = g.player,
      boss = L.bossOf('emeraldIsles');
    for (const s of L.wardsOf('emeraldIsles')) g.worldFlags['isle:done:' + s.id] = true;
    p.teleport(new g.THREE.Vector3(boss.x, T.heightAt(boss.x, boss.z) + 0.1, boss.z));
    a.update(0.3, true);
    a.startEncounter(boss);
    const actor = a.active.get(boss.island).actors[0];
    // Includes the mountains, field-boss and other legacy HUD writers.
    let announcements = 0;
    const previous = g.hud.onBossShown;
    g.hud.onBossShown = (name: string) => {
      announcements++;
      previous?.(name);
    };
    g.stepSim(4);
    g.hud.onBossShown = previous;
    const shown = document.querySelector('.bossbar')!.classList.contains('show');
    const name = document.querySelector('.bossbar .nm')!.textContent;
    const owned = g.hud.boss === actor;
    actor.onSummon();
    const { strike } = await import('/src/combat/core.ts' as string);
    strike(actor, { base: 999999, poise: 9999, type: 'fire', from: p.pos.clone(), at: actor.center.clone(), source: 'melee', noCrit: true });
    a.update(0.1, true);
    const hiddenDuringAdds = !document.querySelector('.bossbar')!.classList.contains('show');
    a.suspend();
    const hidden = !document.querySelector('.bossbar')!.classList.contains('show');
    const dive = L.SITES.find((s: any) => s.kind === 'dive');
    p.teleport(new g.THREE.Vector3(dive.x, -1, dive.z));
    p.swimming = true;
    p.diveDepth = 0;
    p.breath = 1;
    p.stamina = p.maxStamina;
    g.input.uiMode = false;
    g.input.press('KeyC');
    g.stepSim(120);
    g.input.releaseAll();
    const depth = p.diveDepth;
    g.input.press('KeyE');
    g.stepSim(1);
    g.input.releaseAll();
    const recovered = !!g.worldFlags['isle:done:' + dive.id];
    const { SEA_LEVEL } = await import('/src/world/worldMap.ts' as string);
    const landings = [];
    for (const region of L.REGIONS) {
      const isle = L.ISLANDS.find((i: any) => i.region === region),
        [x, z] = L.islandLandingWater(isle);
      p.teleport(new g.THREE.Vector3(x, SEA_LEVEL - 1.1, z));
      p.swimming = true;
      p.diveDepth = 0;
      a.update(0.3, true);
      const streamed = a.active.has(isle.id);
      g.input.press('KeyE');
      g.stepSim(1);
      g.input.releaseAll();
      g.stepSim(5);
      landings.push({ region, streamed, climbed: Math.hypot(p.pos.x - isle.sea[0], p.pos.z - isle.sea[1]) < 1 && !p.swimming && p.pos.y > SEA_LEVEL + 0.9 });
    }
    return { shown, name, owned, hidden, depth, recovered, announcements, landings, hiddenDuringAdds };
  });
  console.log('native island interaction', r);
  expect(r.announcements).toBe(1);
  expect(r.landings.every((i) => i.streamed && i.climbed)).toBe(true);
  expect(r.shown).toBe(true);
  expect(r.name).toContain('Mossroot');
  expect(r.owned).toBe(true);
  expect(r.hidden).toBe(true);
  expect(r.hiddenDuringAdds).toBe(true);
  expect(r.depth).toBeGreaterThan(1);
  expect(r.recovered).toBe(true);
  expect(game.errors).toEqual([]);
});
