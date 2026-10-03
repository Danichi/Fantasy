import { test, expect, SLOW } from './fixtures';

// The Crown Road (Elder Glen to the Royal Capital): its camps fill as you come
// near and their chiefs answer to the Crown's bounties; orc raiders and the
// barrow dead come down the road; the wreck, the shrine and the Kingsmile.

test('the Red Hand holds the Old Watchtower and Gorrak his warcamp; both bounties can be claimed', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, q = g.quests, th = g.crownRoad.threats;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const { crownSitePoint } = await import('/src/world/roadData.ts');
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const tp = async (x: number, z: number) => { g.player.teleport(new T.Vector3(x, heightAt(x, z) + 1, z)); await (window as any).waitSteps(30); };
    const talk = (npc: string) => q.options(npc, () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    const strike = async (t: any) => {
      for (let i = 0; i < 60 && (t.alive ?? !t.dead) && !t.dead; i++) {
        t.takeHit({ damage: 60, poise: 40, dir: new T.Vector3(1, 0, 0), at: t.center.clone(), crit: false, source: 'melee' });
        await wait(60);
      }
    };
    const near = async (site: string, back = 70) => {
      const [x, z] = crownSitePoint(site);
      const [rx, rz] = crownSitePoint('kingsmile');
      const d = Math.hypot(x - rx, z - rz);
      await tp(x + ((rx - x) * back) / d, z + ((rz - z) * back) / d);
    };
    const out: Record<string, unknown> = {};
    // The Red Hand.
    q.accept('red-hand');
    await near('watchtower');
    out.bandits = th.stats().bandits;
    const morwen = th.bandits.find((b: { kind: string }) => b.kind === 'morwen');
    out.morwen = morwen?.name;
    await strike(morwen);
    await wait(300);
    out.morwenDown = q.isActive('red-hand', 1);
    talk('brask');
    out.redHand = q.isDone('red-hand');
    // Gorrak Bonebreaker.
    q.accept('bonebreaker');
    await near('orcCamp', 80);
    out.orcs = th.stats().orcs;
    const gorrak = th.orcs.find((o: { kind: string }) => o.kind === 'gorrak');
    out.gorrakHp = gorrak?.maxHp;
    for (const o of th.orcs.filter((o: { kind: string }) => o.kind === 'orc').slice(0, 4)) await strike(o);
    await strike(gorrak);
    await wait(300);
    out.gorrakDown = q.isActive('bonebreaker', 1);
    talk('brask');
    out.bonebreaker = q.isDone('bonebreaker');
    out.claymore = g.player.equip.items.some((i: { def: { id: string } }) => i.def.id === 'claymore');
    return out;
  }, SLOW);
  expect(res.bandits).toBe(6);
  expect(res.morwen).toBe('Red Morwen');
  expect(res.morwenDown).toBe(true);
  expect(res.redHand).toBe(true);
  expect(res.orcs).toBe(7);
  expect(res.gorrakHp).toBe(420);
  expect(res.gorrakDown).toBe(true);
  expect(res.bonebreaker).toBe(true);
  expect(res.claymore).toBe(true);
  expect(game.errors).toEqual([]);
});

test('orc raiders, the barrow dead and a royal supply train travel the Crown Road', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = window.__game, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const { roadPoint, crownSitePoint } = await import('/src/world/roadData.ts');
    const [x, z] = roadPoint('capital', 2500);
    g.player.teleport(new T.Vector3(x, heightAt(x, z) + 1, z));
    await (window as any).waitSteps(20);
    g.encounters.enabled = false;
    g.encounters.force('orcs', 2560, 'capital');
    g.encounters.force('undead', 2470, 'capital');
    await (window as any).waitSteps(20);
    const census = g.encounters.census().filter((c: { route: string }) => c.route === 'capital');
    g.encounters.clear();
    g.encounters.enabled = true;
    // The barrow wakes after dark.
    g.time.hour = 23;
    const [bx, bz] = crownSitePoint('barrow');
    g.player.teleport(new T.Vector3(bx + 70, heightAt(bx + 70, bz) + 1, bz));
    await (window as any).waitSteps(30);
    const barrowNight = g.crownRoad.threats.stats().dead;
    g.time.hour = 11;
    const routes = g.caravans.positions().map((c: { route: string }) => c.route);
    return { census, barrowNight, routes };
  });
  expect(res.census.some((c: { kind: string; orcs: number }) => c.kind === 'orcs' && c.orcs === 3)).toBe(true);
  expect(res.census.some((c: { kind: string; dead: number }) => c.kind === 'undead' && c.dead === 3)).toBe(true);
  expect(res.barrowNight).toBe(6);
  expect(res.routes).toContain('capital');
  expect(game.errors).toEqual([]);
});

test('the wrecked wagon holds the Kingsmile’s ledger, and the shrine heals the weary', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = window.__game, T = g.THREE, q = g.quests, p = g.player;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const find = (label: string) => g.realm.overworldInteractables.find((i: { label: () => string }) => i.label() === label);
    q.accept('lost-caravan');
    const wreck = find('Search the wrecked wagon');
    g.player.teleport(wreck.pos.clone().setY(heightAt(wreck.pos.x, wreck.pos.z) + 0.5));
    await (window as any).waitSteps(10);
    wreck.action();
    await (window as any).waitSteps(5);
    q.update(1, p.pos);
    const found = { stage: q.state['lost-caravan']?.stage, again: find('Search the wrecked wagon') };
    q.options('oswin', () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    const delivered = q.isDone('lost-caravan');
    p.hp = 5;
    const shrine = find('Pray at the shrine of the Dawn');
    shrine.action();
    return { found, delivered, healed: p.hp === p.maxHp };
  });
  expect(res.found.stage).toBe(1);
  expect(res.found.again).toBeUndefined();
  expect(res.delivered).toBe(true);
  expect(res.healed).toBe(true);
  expect(game.errors).toEqual([]);
});
