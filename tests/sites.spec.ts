import { test, expect } from './fixtures';

// Sites (world/sites/): points of interest across Cresha, placed from a fixed
// seed, built as you come near and taken down as you leave. Stepped tick by tick.

test('sites are placed across Cresha, apart from each other and off the roads, and stream in and out', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, S = g.sites;
    const { heightAt, roadDist } = await import('/src/world/terrainHeight.ts');
    const { regionAt } = await import('/src/world/worldMap.ts');
    const by: Record<string, number> = {};
    let minGap = Infinity, onRoad = 0, outside = 0;
    for (const s of S.sites) {
      by[s.kind] = (by[s.kind] ?? 0) + 1;
      if (roadDist(s.x, s.z) < 30) onRoad++;
      const r = regionAt(s.x, s.z);
      if (r !== 'cresha' && r !== 'elderGlen') outside++;
      for (const o of S.sites) if (o !== s) minGap = Math.min(minGap, Math.hypot(o.x - s.x, o.z - s.z));
    }
    // Stream one in and out again.
    const s = S.of('tower')[0];
    S.enabled = true;
    // The site's own colliders come with it and go with it.
    const away = () => { g.player.teleport(new T.Vector3(s.x + 900, heightAt(s.x + 900, s.z) + 0.5, s.z)); g.stepSim(30); };
    away();
    g.player.teleport(new T.Vector3(s.x + 20, heightAt(s.x + 20, s.z) + 0.5, s.z));
    g.stepSim(30);
    const built = !!S.live(s.id);
    const cols = [...(S.built.get(s.id)?.kit.colliders ?? [])];
    const live1 = cols.filter((c) => c.isValid()).length;
    away();
    const gone = !S.live(s.id);
    const live2 = cols.filter((c) => c.isValid()).length;
    const bodies0 = 0, bodies1 = live1, bodies2 = live2;
    S.enabled = false;
    return { n: S.sites.length, by, minGap, onRoad, outside, built, gone, bodies: [bodies0, bodies1, bodies2] };
  });
  expect(res.n).toBeGreaterThan(80);
  for (const k of ['tower', 'farmstead', 'hunter', 'shrine', 'caravan']) expect(res.by[k]).toBeGreaterThanOrEqual(10);
  expect(res.by.stone).toBe(12);
  expect(res.minGap).toBeGreaterThanOrEqual(150);
  expect(res.onRoad).toBe(0);
  expect(res.outside).toBe(0);
  expect(res.built).toBe(true);
  expect(res.gone).toBe(true);
  expect(res.bodies[1]).toBeGreaterThan(res.bodies[0]);
  expect(res.bodies[2]).toBe(res.bodies[0]);
  expect(errors).toEqual([]);
});

test('a watchtower can be climbed for the view (the map is revealed) and its chest looted; a shrine blesses once a day', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, S = g.sites;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    S.enabled = true;
    const go = (s: any, dx = 0, dz = 0) => {
      g.player.teleport(new T.Vector3(s.x + dx, heightAt(s.x + dx, s.z + dz) + 0.5, s.z + dz));
      g.stepSim(20);
    };
    const act = (s: any, label: RegExp) => {
      const a = S.live(s.id).actions.find((x: any) => label.test(x.label()));
      a.act();
      g.stepSim(2);
      return a;
    };
    // A tower with a chest.
    const tower = S.of('tower').find((s: any) => s.seed % 5 < 2);
    go(tower, 12);
    const gold0 = g.player.prog.gold;
    const seen = () => [...atob(g.discovery.toJSON().cells)].filter((ch) => ch.charCodeAt(0) !== 0).length;
    const cells0 = seen();
    act(tower, /Climb the tower/);
    const y = g.player.pos.y - heightAt(g.player.pos.x, g.player.pos.z);
    const cells1 = seen();
    act(tower, /Open the old chest/);
    const towerDone = S.st(tower.id).done;
    const gold1 = g.player.prog.gold;
    act(tower, /Climb back down/);
    // A shrine.
    const shrine = S.of('shrine')[0];
    go(shrine, 3);
    act(shrine, /Pray at the shrine/);
    const prayedLabel = S.live(shrine.id).actions[0].label();
    S.enabled = false;
    g.hud.toast = t0;
    return { y, revealed: cells1 > cells0, gold: gold1 - gold0, towerDone, prayedLabel, toasts, seen: S.markers().length };
  });
  expect(res.y).toBeGreaterThan(7);
  expect(res.revealed).toBe(true);
  expect(res.gold).toBeGreaterThan(0);
  expect(res.towerDone).toBe(true);
  expect(res.prayedLabel).toMatch(/You have prayed/);
  expect(res.toasts.some((t) => /Blessing of/.test(t))).toBe(true);
  expect(res.seen).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('reading all twelve Sunwheel stones gives the charm; a farm cellar and a guarded wreck give loot; a hunter\'s fire heals and lets you sleep', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, S = g.sites;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const GS = await import('/src/creatures/geometryStore.ts');
    GS.prepareCreatureNow('wolf');
    GS.prepareCreatureNow('boar');
    g.player.invulnerable = true;
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    S.enabled = true;
    const go = (s: any, dx = 0, dz = 0) => {
      g.player.teleport(new T.Vector3(s.x + dx, heightAt(s.x + dx, s.z + dz) + 0.5, s.z + dz));
      g.stepSim(20);
    };
    const action = (s: any, label: RegExp) => S.live(s.id).actions.find((x: any) => label.test(x.label()));
    // The twelve stones.
    for (const s of S.of('stone')) {
      go(s, 3);
      action(s, /Read/).act();
    }
    const has = (id: string) => g.player.equip.items.filter((it: any) => it.def.id === id).length;
    const charm = has('sunwheelCharm');
    // A farm cellar.
    const farm = S.of('farmstead')[0];
    go(farm, 4);
    action(farm, /cellar/).act();
    g.stepSim(5);
    const farmDone = S.st(farm.id).done;
    // A guarded wreck: something comes, and the wreck can't be searched until it's dead.
    const wreck = S.of('caravan').find((s: any) => s.seed % 2 === 0);
    go(wreck, 26);
    g.player.teleport(new T.Vector3(wreck.x + 4, heightAt(wreck.x + 4, wreck.z) + 0.5, wreck.z));
    g.stepSim(60);
    const blocked = /Not while/.test(action(wreck, /./).label());
    const foes = S.foesFor(wreck.id);
    for (const f of foes) if (f.alive) f.takeHit({ damage: 1e6, poise: 0, dir: new T.Vector3(1, 0, 0), at: f.center.clone(), crit: false, source: 'melee' });
    g.stepSim(5);
    const gold0 = g.player.prog.gold;
    action(wreck, /Search/).act();
    const wreckGold = g.player.prog.gold - gold0;
    // The hunter's fire: heal, and sleep the night away.
    const camp = S.of('hunter')[0];
    go(camp, 3);
    g.player.hp = 10;
    const origTalk = g.dialogue.show.bind(g.dialogue);
    let opts: any[] = [];
    g.dialogue.show = (n: string, t: string, x: string, o: any[]) => { opts = o; return origTalk(n, t, x, o); };
    g.time.skipTo(22);
    action(camp, /Rest by the fire/).act();
    opts.find((o) => /Sleep/.test(o.label)).run();
    g.dialogue.show = origTalk;
    const hour = g.time.hour, hp = g.player.hp >= g.player.maxHp;
    S.enabled = false;
    g.hud.toast = t0;
    return { charm, read: S.of('stone').filter((s: any) => S.st(s.id).done).length, farmDone, blocked, foes: foes.length, wreckGold, hour, hp, toasts };
  });
  expect(res.read).toBe(12);
  expect(res.charm).toBe(1);
  expect(res.toasts.some((t) => /Go carefully, fifth/.test(t))).toBe(true);
  expect(res.farmDone).toBe(true);
  expect(res.foes).toBeGreaterThan(0);
  expect(res.blocked).toBe(true);
  expect(res.wreckGold).toBeGreaterThan(0);
  expect(res.hour).toBeCloseTo(7, 0);
  expect(res.hp).toBe(true);
  expect(errors).toEqual([]);
});

test('the lore and secrets: the champion\'s trail marks each next camp and ends in Firstlight; a Dark scar wakes gloam wolves and shatters; a beacon calms the raids; the vault takes three keys; a fairy ring carries you at dusk', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, S = g.sites;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const GS = await import('/src/creatures/geometryStore.ts');
    GS.prepareCreatureNow('wolf');
    g.player.invulnerable = true;
    S.enabled = true;
    const go = (s: any, dx = 0, dz = 0) => {
      g.player.teleport(new T.Vector3(s.x + dx, heightAt(s.x + dx, s.z + dz) + 0.5, s.z + dz));
      g.stepSim(20);
    };
    const action = (s: any, label: RegExp) => S.live(s.id)?.actions.find((x: any) => label.test(x.label()));
    const has = (id: string) => g.player.equip.items.filter((it: any) => it.def.id === id).reduce((n: number, it: any) => n + it.qty, 0);
    const close = () => g.dialogue.close?.();
    // The champion's trail.
    const camps = S.of('championCamp').sort((a: any, b: any) => a.n - b.n);
    go(camps[0], 3);
    action(camps[0], /journal|page/i).act();
    close();
    const nextMarked = !!S.st(camps[1].id).seen;
    go(camps[2], 3);
    action(camps[2], /page|journal/i).act();
    close();
    const sword = has('firstlight');
    // A Dark scar.
    const scar = S.of('darkScar')[0];
    go(scar, 4);
    action(scar, /crystal/).act();
    g.stepSim(5);
    const shades = S.foesFor(scar.id);
    for (const f of shades) f.takeHit({ damage: 1e6, poise: 0, dir: new T.Vector3(1, 0, 0), at: f.center.clone(), crit: false, source: 'melee' });
    g.stepSim(5);
    action(scar, /Shatter/).act();
    const crystals = has('voidCrystal');
    // A beacon.
    const beacon = S.of('beacon')[0];
    go(beacon, 4);
    action(beacon, /Light/).act();
    const calm = g.raids.toJSON().calmUntil;
    // The vault, with all three keys.
    const vault = S.of('vault')[0];
    for (const k of ['vaultKeyA', 'vaultKeyB', 'vaultKeyC']) g.player.equip.add?.(k, 1);
    go(vault, 4);
    const gold0 = g.player.prog.gold;
    const keysHeld = ['vaultKeyA', 'vaultKeyB', 'vaultKeyC'].map(has);
    // A fairy ring at dusk.
    const ring = S.of('fairyRing')[0];
    g.time.skipTo(19);
    go(ring, 2);
    action(ring, /Step into/).act();
    g.stepSim(3);
    const moved = Math.hypot(g.player.pos.x - ring.x, g.player.pos.z - ring.z);
    S.enabled = false;
    return { nextMarked, sword, shades: shades.length, crystals, calm, day: g.time.day, keysHeld, gold0, moved };
  });
  expect(res.nextMarked).toBe(true);
  expect(res.sword).toBe(1);
  expect(res.shades).toBe(3);
  expect(res.crystals).toBeGreaterThan(0);
  expect(res.calm).toBeGreaterThanOrEqual(res.day);
  expect(res.moved).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});
