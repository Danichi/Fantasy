import { test, expect, boot, SLOW } from './fixtures';

// The White Mountains' lower holds (docs/design/mountains.md, the open-world
// plan's phase 3): the Iron Kettle's passage, the Great Winch, the cold, the
// cairns, Stonegate's trolls, Frostpeak's hooded Sunwheel, the Cold Vein, and
// the people the quests need.

test('White Mountains: the Kettle sails, the Winch climbs, the cold bites, trolls fall, the hood lifts', async ({ page }) => {
  test.setTimeout(600_000 * SLOW);
  const errors = await boot(page, '?test&quality=low');
  await page.evaluate(() => (window as any).__game.pause(true));

  await test.step('the ground is shaped: level pads, a walkable road, a graded incline', async () => {
    const r = await page.evaluate(async () => {
      const T = await import('/src/world/terrainHeight.ts' as string);
      const L = await import('/src/world/mountains/mountainLayout.ts' as string);
      const H = T.worldHeightFn;
      const pads = L.PADS.map((p: any) => Math.abs(H(p.x + p.r * 0.6, p.z) - p.h) + Math.abs(H(p.x, p.z - p.r * 0.6) - p.h));
      let worst = 0;
      const K = L.DWARF_ROAD_K;
      for (let i = 0; i + 1 < K.length; i++) {
        const [ax, az] = K[i], [bx, bz] = K[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 10);
        for (let k = 0; k < n; k++) {
          const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
          worst = Math.max(worst, Math.abs(H(x1, z1) - H(x0, z0)) / Math.hypot(x1 - x0, z1 - z0));
        }
      }
      const lift = [0, 0.5, 1].map((t) => H(L.LIFT.bottom[0] + (L.LIFT.top[0] - L.LIFT.bottom[0]) * t, L.LIFT.bottom[1] + (L.LIFT.top[1] - L.LIFT.bottom[1]) * t));
      return { pads, worst, lift };
    });
    for (const d of r.pads) expect(d).toBeLessThan(1);
    // Steepest stretch of road: under the player's 48° climbing limit.
    expect(r.worst).toBeLessThan(Math.tan((44 * Math.PI) / 180));
    expect(r.lift[0]).toBeLessThan(10);
    expect(r.lift[2]).toBeGreaterThan(280);
  });

  await test.step('the Iron Kettle sails to Kettle Cove and lands you there', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game, P = g.player, S = g.sailing, m = g.mountains;
      const T = await import('/src/world/terrainHeight.ts' as string);
      P.teleport(new g.THREE.Vector3(2930, T.heightAt(2930, 150) + 0.5, 150));
      g.stepSim(20);
      const sailed = m.sailNorth();
      g.stepSim(600);
      const moving = S.autopilot ? S.autopilot.ship.pos.distanceTo(new g.THREE.Vector3(2990, 0, 156)) : 0;
      const aboard = S.aboard;
      m.kettle.rest();
      for (let k = 0; k < 120 && S.autopilot; k++) g.stepSim(30);
      return { sailed, moving, aboard, landed: !!g.worldFlags.kettleLanded, x: P.pos.x, z: P.pos.z, quest: g.quests.status('kettle-landing') };
    });
    expect(r.sailed).toBe(true);
    expect(r.aboard).toBe(true);
    expect(r.moving).toBeGreaterThan(150);
    expect(r.landed).toBe(true);
    expect(Math.hypot(r.x - 4480, r.z + 3990)).toBeLessThan(30);
    expect(r.quest).toBe('active');
  });

  await test.step('the Great Winch carries you up to Copperbrook', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game, P = g.player, m = g.mountains.mountains;
      const T = await import('/src/world/terrainHeight.ts' as string);
      P.teleport(new g.THREE.Vector3(4322, T.heightAt(4322, -4034) + 0.5, -4034));
      g.stepSim(10);
      const it = m.interactables.find((i: any) => /Ride the Great Winch up/.test(i.label()));
      it.action();
      g.stepSim(60 * 18);
      g.stepSim(30);
      return { y: P.pos.y, quest: g.quests.isActive('kettle-landing', 1) };
    });
    expect(r.y).toBeGreaterThan(280);
    expect(r.quest).toBe(true);
  });

  await test.step('up on the High Shelf the cold closes in, and a hut\'s hearth lets it go', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game, P = g.player, ex = g.gearRt.exposure;
      const T = await import('/src/world/terrainHeight.ts' as string);
      g.weather.forced = 'blizzard';
      g.stepSim(60);
      ex.cold = 0;
      P.teleport(new g.THREE.Vector3(3500, T.heightAt(3500, -4935) + 0.5, -4935));
      g.stepSim(60 * 30);
      const cold = ex.cold;
      // the hut beside the cairn at (3600, -4952): x - 7
      P.teleport(new g.THREE.Vector3(3593, T.heightAt(3593, -4952) + 0.5, -4952));
      g.stepSim(60 * 10);
      const warmed = ex.cold;
      g.weather.forced = null;
      return { cold, warmed };
    });
    expect(r.cold).toBeGreaterThan(0.1);
    expect(r.warmed).toBeLessThan(r.cold);
  });

  await test.step('a cairn lantern lights and stays lit in the flags', async () => {
    const r = await page.evaluate(() => {
      const g = (window as any).__game, m = g.mountains.mountains;
      const it = m.interactables.find((i: any) => /Light the cairn lantern/.test(i.label()));
      it.action();
      return Object.keys(g.worldFlags).filter((k) => k.startsWith('cairn:')).length;
    });
    expect(r).toBeGreaterThan(0);
  });

  await test.step('Stonegate\'s three trolls wake when you come, and the fort is clear when they fall', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game, P = g.player, m = g.mountains.mountains;
      const T = await import('/src/world/terrainHeight.ts' as string);
      const { strike } = await import('/src/combat/core.ts' as string);
      P.invulnerable = true;
      P.teleport(new g.THREE.Vector3(4362, T.heightAt(4362, -4720) + 0.5, -4720));
      for (let k = 0; k < 60 && m.trolls.filter(Boolean).length < 3; k++) {
        g.stepSim(10);
        await new Promise((res) => setTimeout(res, 200));
      }
      const spawned = m.trolls.filter(Boolean).length;
      for (const t of m.trolls) if (t && t.alive) strike(t, { base: 99999, poise: 0, type: 'fire', from: P.pos.clone(), at: t.center.clone(), source: 'melee', noCrit: true });
      g.stepSim(30);
      P.invulnerable = false;
      return { spawned, clear: !!g.worldFlags.stonegateClear, hides: g.player.equip.items.filter((i: any) => i.def.id === 'trollHide').reduce((n: number, i: any) => n + i.qty, 0) };
    });
    expect(r.spawned).toBe(3);
    expect(r.clear).toBe(true);
    expect(r.hides).toBe(3);
  });

  await test.step('Frostpeak\'s Sunwheel waits under its hood until you lift it', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game, m = g.mountains.mountains;
      const { WAYSTONES } = await import('/src/world/kingsRoad.ts' as string);
      const ws = WAYSTONES.find((w: any) => w.id === 'frostpeak');
      const before = ws.hooded();
      const it = m.interactables.find((i: any) => i.label() === 'The hooded Sunwheel');
      it.action();
      const asked = g.dialogue.open;
      m.unhood();
      return { before, asked, after: ws.hooded(), attuned: !!g.worldFlags['way:frostpeak'] || !!g.story.wheel.attuned('frostpeak') };
    });
    expect(r.before).toBe(true);
    expect(r.asked).toBe(true);
    expect(r.after).toBe(false);
    expect(r.attuned).toBe(true);
  });

  await test.step('the people are home, and the Cold Vein opens under Copperbrook', async () => {
    const r = await page.evaluate(async () => {
      const g = (window as any).__game;
      const ids = ['hamm', 'tova', 'bruni-wm', 'marta', 'sigrun', 'olga', 'annick', 'brynja', 'dagny', 'durin', 'hrafna', 'ulla'];
      const known = ids.filter((id) => g.npcs.npcs.some((n: any) => n.rec.id === id));
      const kit = g.realm.overworldInteractables.find((i: any) => i.label() === 'Go down into the Cold Vein');
      const quests = ['kettle-landing', 'first-claim', 'cold-iron', 'troll-toll', 'kings-audience', 'lantern-road', 'troll-hide-furs'].filter((id) => g.quests.status(id) !== undefined);
      return { known, kit: !!kit, quests };
    });
    expect(r.known.length).toBe(12);
    expect(r.kit).toBe(true);
    expect(r.quests.length).toBe(7);
  });

  expect(errors).toEqual([]);
});
