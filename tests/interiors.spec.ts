import { test, expect, SLOW } from './fixtures';

// Buildings you can walk into (world/doors.ts, world/interior.ts).

test('walk into the inn, meet the innkeeper, and step back out onto the doorstep', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const press = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      await (window as any).waitSteps(3);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    };
    const prompt = () => (document.querySelector('.prompt.show')?.textContent ?? '').replace(/^E/, '');
    const until = async (f: () => boolean, ms = 15000) => {
      const t0 = performance.now();
      while (!f() && performance.now() - t0 < ms * slow) await wait(50);
      return f();
    };
    const lights = () => { let n = 0; g.r.scene.traverse((o: { isLight?: boolean }) => o.isLight && n++); return n; };
    const inn = g.doors.find((d: { keeper?: string }) => d.keeper === 'innkeeper');
    const mara = g.town.npcs.find((n: { spec: { id: string } }) => n.spec.id === 'innkeeper');
    const maraAt = mara.pos.clone();
    const out: Record<string, unknown> = { doors: g.doors.length, lights0: lights() };
    // Stand on the doorstep: the prompt offers the door.
    g.player.teleport(new T.Vector3(inn.pos.x, inn.pos.y + 0.4, inn.pos.z));
    await (window as any).waitSteps(20);
    out.doorPrompt = prompt();
    await press();
    out.entered = await until(() => g.realm.mode === 'interior' && !g.realm.busy);
    out.kind = g.realm.interior?.kind;
    out.lightsIn = lights(); // borrowed from the pool, never added
    out.inRoom = Math.abs(g.player.pos.x - (-40000)) < 12 && g.player.pos.y > -1 && g.player.pos.y < 2;
    // The innkeeper works inside while you're there.
    out.maraInside = mara.pos.distanceTo(g.player.pos) < 12 && mara.root.visible;
    out.people = g.realm.interactables.map((i: { label: () => string }) => i.label());
    // Stand still a moment: the floor holds you.
    await (window as any).waitSteps(60);
    out.stillInRoom = g.player.pos.y > -1 && Math.abs(g.player.pos.x - (-40000)) < 12;
    // Leave by the door you came in.
    const exit = g.realm.interior.interactables[0];
    g.player.teleport(exit.pos.clone().setY(exit.pos.y + 0.4));
    await (window as any).waitSteps(10);
    out.exitPrompt = prompt();
    await press();
    out.left = await until(() => g.realm.mode === 'overworld' && !g.realm.busy);
    out.backAtDoor = g.player.pos.distanceTo(inn.pos) < 2.5;
    out.maraHome = mara.pos.distanceTo(maraAt) < 0.01;
    out.lights1 = lights();
    return out;
  }, SLOW);
  expect(res.doors).toBeGreaterThan(100);
  expect(res.doorPrompt).toBe('Enter the Wayfarer Inn');
  expect(res.entered).toBe(true);
  expect(res.kind).toBe('tavern');
  expect(res.lightsIn).toBe(res.lights0);
  expect(res.inRoom).toBe(true);
  expect(res.maraInside).toBe(true);
  expect(res.people).toContain('Talk to Mara Bell');
  expect(res.stillInRoom).toBe(true);
  expect(res.exitPrompt).toBe('Leave the Wayfarer Inn');
  expect(res.left).toBe(true);
  expect(res.backAtDoor).toBe(true);
  expect(res.maraHome).toBe(true);
  expect(res.lights1).toBe(res.lights0);
  // Closed menus stay out of sight (a grid layout once overrode .hidden).
  expect(await page.locator('.inventory').isVisible()).toBe(false);
  expect(game.errors).toEqual([]);
});

test('down the trapdoor: the Quiet Hands’ den, the cistern rats and the drowned satchel', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (slow) => {
    const g = window.__game, T = g.THREE;
    const W = (n: number) => (window as any).waitSteps(n);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow));
    const until = async (f: () => boolean, ms = 20000) => {
      const t0 = performance.now();
      while (!f() && performance.now() - t0 < ms * slow) await wait(50);
      return f();
    };
    const press = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      await W(3);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    };
    const labels = () => g.realm.interactables.map((i: { label: () => string }) => i.label());
    // Aldric is already home: the Hands know you.
    g.quests.state['quiet-hands'] = { status: 'done', stage: 2, progress: [] };
    g.worldFlags.denKnown = true;
    g.worldFlags.aldricFreed = true;
    g.quests.accept('cistern-rats');
    g.quests.accept('drowned-satchel');
    const out: Record<string, unknown> = {};
    const trap = g.realm.overworldInteractables.find((i: { label: () => string }) => i.label() === 'Knock twice on the trapdoor');
    out.trapdoor = !!trap;
    g.player.teleport(new T.Vector3(trap.pos.x + 0.5, trap.pos.y + 0.4, trap.pos.z));
    await W(15);
    await press();
    out.entered = await until(() => g.realm.mode === 'interior' && !g.realm.busy);
    out.kind = g.realm.interior?.kind;
    // Sallow and Nix are built for the visit and can be talked to.
    out.people = await until(() => labels().includes('Talk to Mother Sallow') && labels().includes('Talk to Nix the Fence'));
    out.rats = g.inside.rats.length;
    // Stand still: the floor holds.
    await W(40);
    out.floor = g.player.pos.y > -0.5 && g.player.pos.y < 1;
    // Clear the cistern.
    for (const rat of g.inside.rats) rat.takeHit({ damage: 999, poise: 0, dir: new T.Vector3(0, 0, 1), at: rat.center.clone(), crit: false, source: 'melee' });
    await W(5);
    out.ratsStage = g.quests.state['cistern-rats'].stage;
    // Fish out the satchel.
    const sat = g.realm.interior.spots.ledger.pos;
    g.player.teleport(new T.Vector3(sat.x, 0.4, sat.z + 0.5));
    await W(20);
    await press();
    await W(5);
    out.satchelStage = g.quests.state['drowned-satchel'].stage;
    // Back up the stairs.
    await g.realm.leaveInterior();
    out.back = g.realm.mode === 'overworld' && g.player.pos.distanceTo(trap.pos) < 2.5;
    out.ratsGone = g.inside.rats.length === 0;
    return out;
  }, SLOW);
  expect(res).toEqual({ trapdoor: true, entered: true, kind: 'undercity', people: true, rats: 8, floor: true, ratsStage: 1, satchelStage: 1, back: true, ratsGone: true });
  expect(game.errors).toEqual([]);
});
