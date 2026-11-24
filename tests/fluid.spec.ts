import { test, expect, boot, SLOW } from './fixtures';

// Fluid combat (docs/design/combat-flow.md) in the Sandbox's Proving Grounds:
// moves shaped by how you move, the launcher and air string, the vault, the
// riposte, and the world hitting back (a wall slam, a kicked barrel).

test('fluid combat: shaped openers, launcher and air string, vault, riposte, wall slam, barrels', async ({ page }) => {
  test.setTimeout(480_000 * SLOW);
  const errors = await boot(page, '?test&sandbox&save');
  await page.evaluate(() => (window as any).__game.pause(true));
  const r = await page.evaluate(async () => {
    const g = (window as any).__game,
      P = g.player,
      I = g.input,
      S = g.sandbox,
      it = g.realm.interior;
    S.settings.enemyAI = false;
    S.settings.unlimited = true;
    S.settings.immortal = false;
    const log: string[] = [];
    g.events.on('combatMove', (e: any) => log.push(e.id));
    g.events.on('worldImpact', (e: any) => log.push('impact:' + e.kind));
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        g.stepSim(1);
        P.present(1, 1 / 60);
      }
    };
    const tap = (k: string, n = 3) => {
      I.press(k);
      step(n);
      I.release(k);
    };
    const place = (x: number, z: number, yaw: number) => {
      I.releaseAll();
      P.act = null;
      P.teleport(it.at(x, z, 0.1));
      P.yaw = g.cam.yaw = yaw;
      P.lock = null;
      step(15);
    };
    const acts = (n: number) => {
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        step(1);
        if (P.act) seen.add(P.act.def.id);
      }
      return [...seen];
    };
    const floor = it.at(0, 0).y;
    const out: Record<string, any> = {};

    // Launcher, then the air string.
    S.props.reset();
    S.spawn('dummy');
    let d = S.actors[0];
    place(0, -0.4, Math.PI);
    P.lock = d;
    tap('Mouse0');
    step(14);
    tap('KeyC', 2);
    let up = 0;
    for (let i = 0; i < 30; i++) {
      step(1);
      up = Math.max(up, d.position.y - floor);
    }
    const air = new Set<string>();
    for (let k = 0; k < 3; k++) {
      tap('Mouse0');
      acts(20).forEach((a) => air.add(a));
    }
    out.launch = { up, air: [...air] };
    step(120);

    // Explicit sprint + attack closes distance; ordinary attacks no longer select a dash.
    S.spawn('dummy');
    d = S.actors[0];
    place(0, 3.5, Math.PI);
    const far = P.pos.distanceTo(d.position);
    I.press('ShiftLeft');
    I.press('KeyW');
    step(6);
    tap('Mouse0');
    const dash = acts(40);
    I.release('KeyW');
    I.release('ShiftLeft');
    out.running = { acts: dash, before: far, after: P.pos.distanceTo(d.position) };
    step(60);

    // Locked on, walking in: a lunge.
    S.spawn('dummy');
    d = S.actors[0];
    place(0, 0.2, Math.PI);
    P.lock = d;
    I.press('KeyW');
    step(3);
    tap('Mouse0');
    step(4);
    out.lunge = P.act?.def.id;
    I.releaseAll();
    step(60);

    // Dodge toward a shield bearer: over and behind it.
    S.spawn('shield');
    d = S.actors[0];
    place(0, -0.2, Math.PI);
    I.press('KeyW');
    step(2);
    tap('Space');
    const vault = acts(40);
    I.releaseAll();
    out.vault = { acts: vault, behind: P.pos.z < d.position.z };
    step(30);

    // A perfect parry, then attack: the riposte.
    S.spawn('dummy');
    d = S.actors[0];
    place(0, 0.2, Math.PI);
    P.lock = d;
    tap('KeyF', 1);
    step(1);
    const res = P.receiveAttack({ damage: 20, from: d.position.clone(), parryable: true, poise: 30, attacker: d });
    step(2);
    tap('Mouse0');
    out.riposte = { res, acts: acts(10) };
    step(60);

    // The world: kick a straw dummy into the slam wall; kick a barrel.
    S.props.reset();
    S.spawn('world');
    place(14.3, -6, Math.PI / 2);
    tap('KeyG');
    step(60);
    place(6.5, 6.0, Math.PI);
    I.press('KeyW');
    step(25);
    I.release('KeyW');
    tap('KeyG');
    step(90);
    out.log = log;
    out.learned = S.settings.learned.length;
    return out;
  });
  expect(r.launch.up).toBeGreaterThan(0.8);
  expect(r.launch.air).toEqual(expect.arrayContaining(['airSlash1', 'airSlash2', 'airSlash3']));
  expect(r.running.acts).toContain('sprintAttack');
  expect(r.running.after).toBeLessThan(r.running.before - 1.5);
  expect(r.lunge).toBe('thrust');
  expect(r.vault.acts).toContain('vault');
  expect(r.vault.behind).toBe(true);
  expect(r.riposte.res).toBe('parried');
  expect(r.riposte.acts).toContain('riposte');
  expect(r.log).toEqual(expect.arrayContaining(['launcher', 'sprintAttack', 'vault', 'riposte', 'impact:wall', 'impact:barrel']));
  expect(r.learned).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
