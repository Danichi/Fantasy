import { test, expect, boot, SLOW } from './fixtures';

// The Verdant Elves (docs/design/verdant-elves.md): Thornwick and the marker
// stone (E1), the Lost Woods and Silverbough (E2), the Ancient Forest and the
// Blighted Elder (E3), the Sanctum's teachers and heartwood (E4), the Temple
// of Starfall and Moonlight Glade (E5).

test('E1: the marker stone opens the Greenwood Road; Thornwick keeps its hours; the region banner shows on entry', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, q = g.quests, e = g.elves;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const tp = async (x: number, z: number) => { g.player.teleport(new T.Vector3(x, heightAt(x, z) + 1, z)); await (window as any).waitSteps(30); };
    const talk = (npc: string) => q.options(npc, () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    const out: Record<string, unknown> = {};
    const gate = g.roads.gates.find((x: { road: string }) => x.road === 'forest');
    out.gateClosed = !gate.open;
    // Walking north out of Cresha into the forest: the region banner.
    await tp(-1300, -1800);
    await wait(300);
    const th = e.forest.spots.thornwick;
    await tp(th.x, th.z);
    for (let i = 0; i < 40 && !document.querySelector('.region-card .rc-name')?.textContent?.includes('Verdant'); i++) await wait(100);
    out.banner = document.querySelector('.region-card .rc-name')?.textContent;
    // Thornwick's people: at their posts by day, home at night.
    g.time.skipTo(10);
    await wait(1500);
    const corwen = g.npcs.find('corwen');
    out.corwenDay = corwen && !corwen.hidden && corwen.pos.distanceTo(e.forest.spots.corwen) < 6;
    // (Away and back: a settlement you come back to has everyone where the clock says.)
    g.time.skipTo(2.5);
    await tp(th.x, th.z + 900);
    await wait(1500);
    await tp(th.x, th.z);
    await wait(1500);
    out.corwenNight = corwen?.hidden;
    out.loggersNight = g.npcs.npcs.filter((n: any) => n.rec.settlement === 'thornwick' && !n.rec.named).every((n: any) => n.hidden);
    g.time.skipTo(10);
    // The Marker Stone: Nimri, the sentinel, Gant the Burner, the sentinel again.
    q.accept('the-marker-stone');
    talk('nimri');
    out.stage1 = q.isActive('the-marker-stone', 1);
    talk('aelrin');
    out.stage2 = q.isActive('the-marker-stone', 2);
    e.forest.threats.fillPits();
    const gant = e.forest.threats.burners.find((b: { kind: string }) => b.kind === 'charcoalChief');
    out.gant = gant?.name;
    for (let i = 0; i < 40 && !gant.dead && gant.alive; i++) {
      gant.takeHit({ damage: 80, poise: 40, dir: new T.Vector3(1, 0, 0), at: gant.center.clone(), crit: false, source: 'melee' });
      await wait(40);
    }
    await wait(200);
    out.proven = q.isActive('the-marker-stone', 3);
    talk('aelrin');
    out.done = q.isDone('the-marker-stone');
    out.gateOpen = gate.open;
    // The road past the stone is walkable: the player can stand where the barrier stood.
    return out;
  }, SLOW);
  expect(res.gateClosed).toBe(true);
  expect(res.banner).toContain('Verdant');
  expect(res.corwenDay).toBe(true);
  expect(res.corwenNight).toBe(true);
  expect(res.loggersNight).toBe(true);
  expect(res.stage1).toBe(true);
  expect(res.stage2).toBe(true);
  expect(res.gant).toBe('Gant the Burner');
  expect(res.proven).toBe(true);
  expect(res.done).toBe(true);
  expect(res.gateOpen).toBe(true);
  expect(game.errors).toEqual([]);
});

test('E2: off the path the Lost Woods turn you back; with a guide you get through; Silverbough and its quarrel', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE, q = g.quests, e = g.elves;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const { roadPoint } = await import('/src/world/roadData.ts');
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const tp = async (x: number, z: number, steps = 30) => { g.player.teleport(new T.Vector3(x, heightAt(x, z) + 1, z)); await (window as any).waitSteps(steps); };
    const out: Record<string, unknown> = {};
    // On the road past the stone, inside the Inner Forest: the woods let you be.
    const [rx, rz] = roadPoint('forest', 3000);
    await tp(rx, rz);
    out.strict = e.lost.strictAt(rx, rz);
    out.allowedAlone = e.lost.allowed();
    // Seventy metres into the trees: the forest turns you round.
    const [ox, oz] = roadPoint('forest', 3000, 70);
    await tp(ox, oz, 10);
    for (let i = 0; i < 50 && e.lost.loops === 0; i++) await wait(100);
    for (let i = 0; i < 30 && e.lost.turning; i++) await wait(100);
    out.loops = e.lost.loops;
    out.backOnRoad = Math.hypot(g.player.pos.x - rx, g.player.pos.z - rz) < 20;
    // Hire Nimri: now you can walk off the path.
    g.player.prog.addGold(100);
    const hire = g.npcs && (e.lost.hire(24), true);
    out.hired = hire && e.lost.allowed() === 'guide';
    await tp(ox, oz, 10);
    await wait(2500);
    out.loopsGuided = e.lost.loops;
    out.stayed = Math.hypot(g.player.pos.x - ox, g.player.pos.z - oz) < 8;
    out.guideBuilt = !!(e.lost as any).guide;
    // Silverbough: found with the guide; the spring's spiders; the quarrel.
    q.state['the-marker-stone'] = { status: 'done', stage: 3, progress: [1] };
    q.accept('the-guides-token');
    const sb = e.forest.spots.silverbough;
    await tp(sb.x + 5, sb.z + 5);
    await wait(800);
    out.found = q.isActive('the-guides-token', 1);
    q.options('caelith', () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    const sp = e.forest.spots.spring;
    await tp(sp.x + 8, sp.z + 8);
    for (let i = 0; i < 30 && e.forest.threats.creatures.filter((c: any) => c.kind === 'forestSpider' && c.alive).length < 5; i++) await wait(100);
    const spiders = e.forest.threats.creatures.filter((c: any) => c.kind === 'forestSpider' && c.alive);
    out.spiders = spiders.length;
    for (const s of spiders.slice(0, 5)) s.takeHit({ damage: 999, poise: 10, dir: new T.Vector3(1, 0, 0), at: s.center.clone(), crit: false, source: 'melee' });
    await wait(300);
    out.spring = q.isActive('the-guides-token', 3);
    e.settleQuarrel('elves');
    out.quarrel = g.worldFlags['elves:quarrel'];
    out.groveStanding = (e.forest as any).groveVariants ? (e.forest as any).groveVariants.standing.visible : 'unbuilt';
    q.options('caelith', () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    out.tokenDone = q.isDone('the-guides-token');
    out.token = g.player.equip.items.some((i: any) => i.def.id === 'guidesToken');
    g.worldFlags['elves:guideUntil'] = 0;
    out.allowedToken = e.lost.allowed();
    return out;
  }, SLOW);
  expect(res.strict).toBe(true);
  expect(res.allowedAlone).toBe(null);
  expect(res.loops).toBe(1);
  expect(res.backOnRoad).toBe(true);
  expect(res.hired).toBe(true);
  expect(res.loopsGuided).toBe(1);
  expect(res.stayed).toBe(true);
  expect(res.guideBuilt).toBe(true);
  expect(res.found).toBe(true);
  expect(res.spiders).toBeGreaterThanOrEqual(5);
  expect(res.spring).toBe(true);
  expect(res.quarrel).toBe('elves');
  expect(res.tokenDone).toBe(true);
  expect(res.token).toBe(true);
  expect(res.allowedToken).toBe('token');
  expect(game.errors).toEqual([]);
});

test('E2: the Guide’s Token persists through a save and reload', async ({ page }) => {
  test.setTimeout(300_000 * SLOW);
  const errors = await boot(page, '?test&save');
  await page.evaluate(() => {
    const g = (window as any).__game, q = g.quests;
    q.state['the-marker-stone'] = { status: 'done', stage: 3, progress: [1] };
    q.state['the-guides-token'] = { status: 'active', stage: 4, progress: [0] };
    q.options('caelith', () => {}, () => {}).find((o: { label: string }) => !o.label.startsWith('❗'))?.run();
    g.save();
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  const res = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      token: g.player.equip.items.some((i: any) => i.def.id === 'guidesToken'),
      flag: g.worldFlags['elves:token'],
      allowed: g.elves.lost.allowed(),
      gateOpen: g.roads.gates.find((x: { road: string }) => x.road === 'forest').open,
    };
  });
  expect(res.token).toBe(true);
  expect(res.flag).toBe(true);
  expect(res.allowed).toBe('token');
  expect(res.gateOpen).toBe(true);
  expect(errors).toEqual([]);
});
