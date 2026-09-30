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
