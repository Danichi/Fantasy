import { test, expect, boot, SLOW } from './fixtures';
import type { Page } from '@playwright/test';

// Rough edges of phases 3-5: Millbrook Brook and its bridge, the waystones,
// boat hire in the harbour, and small river life (ducks).

test('Millbrook Brook runs in a carved bed under a bridge you can walk over', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const bed = heightAt(1572, -40), bank = heightAt(1600, -40);
    // Drop onto the middle of the King's Road bridge: the deck holds you above the brook.
    g.player.teleport(new T.Vector3(1556, heightAt(1556, 124) + 4, 124));
    await new Promise((r) => setTimeout(r, 2500));
    const minY = g.player.pos.y;
    return { bed, bank, bridgeBed: heightAt(1556, 124), minY, grounded: g.player.grounded, swimming: g.player.swimming };
  });
  expect(res.bank - res.bed).toBeGreaterThan(1.2);
  // The player stands at deck height, not down in the brook.
  expect(res.minY).toBeGreaterThan(res.bridgeBed + 0.8);
  expect(res.grounded).toBe(true);
  expect(res.swimming).toBe(false);
  expect(errors).toEqual([]);
});

test('waystones attune by touch and carry you once the Sunwheel is understood', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { WAYSTONES } = await import('/src/world/kingsRoad.ts' as string);
    const stone = (id: string) => g.realm.overworldInteractables.find((i: any) => i.pos.distanceTo(WAYSTONES.find((w: any) => w.id === id).pos.clone().setY(i.pos.y)) < 4 && /waystone/i.test(i.label()));
    const glen = stone('glen');
    const label0 = glen.label();
    glen.action();
    g.dialogue.close();
    stone('rest').action();
    g.dialogue.close();
    const attuned = [g.worldFlags['way:glen'], g.worldFlags['way:rest'], g.worldFlags['way:gull']];
    g.quests.state['the-sunwheel'] = { status: 'done', stage: 0, progress: [] };
    const label1 = glen.label();
    glen.action();
    const opts = g.dialogue['options'].map((o: any) => o.label);
    g.dialogue['options'].find((o: any) => /Wayfarer/.test(o.label)).run();
    await new Promise((r) => setTimeout(r, 500));
    const rest = WAYSTONES.find((w: any) => w.id === 'rest').pos;
    return { label0, label1, attuned, opts, dist: Math.hypot(g.player.pos.x - rest.x, g.player.pos.z - rest.z) };
  });
  expect(res.label0).toBe('Touch the waystone');
  expect(res.attuned).toEqual([true, true, undefined]);
  expect(res.label1).toBe('Travel by waystone');
  expect(res.opts.some((l: string) => /Gull/.test(l))).toBe(false);
  expect(res.dist).toBeLessThan(6);
  expect(errors).toEqual([]);
});

test('boat hire: row out of the wharf, then step ashore', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    g.player.teleport(new T.Vector3(2930, 1.5, 300));
    await new Promise((r) => setTimeout(r, 1500));
    g.boats.launch(new T.Vector3(2998, 0, 292), Math.PI / 2);
    const s = g.boats.state;
    const start = s.pos.clone();
    g.input.press('KeyD');
    await new Promise((r) => setTimeout(r, 4000));
    g.input.release('KeyD');
    const rowed = s.pos.distanceTo(start);
    const riding = !!g.player.vehicle;
    const onWater = Math.abs(g.player.pos.y - s.pos.y) < 1.5;
    // Pull up against the quay and step off.
    s.pos.set(2951, s.pos.y, 250);
    s.speed = 0;
    await new Promise((r) => setTimeout(r, 400));
    const ashore = g.realm.overworldInteractables.find((i: any) => i.label() === 'Step ashore');
    ashore?.action();
    await new Promise((r) => setTimeout(r, 800));
    return { rowed, riding, onWater, canLand: !!ashore, after: !!g.player.vehicle, x: g.player.pos.x, grounded: g.player.grounded };
  });
  expect(res.riding).toBe(true);
  expect(res.rowed).toBeGreaterThan(3);
  expect(res.onWater).toBe(true);
  expect(res.canLand).toBe(true);
  expect(res.after).toBe(false);
  expect(res.x).toBeLessThan(2951);
  expect(errors).toEqual([]);
});

test('ducks paddle the Elder Glen river and keep to the water', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { riverX, heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const { waterSurfaceAt } = await import('/src/world/waterLevel.ts' as string);
    g.player.teleport(new T.Vector3(riverX(40) - 20, heightAt(riverX(40) - 20, 40) + 0.5, 40));
    await new Promise((r) => setTimeout(r, 4000));
    const ducks = g.riverLife['ducks'].filter((d: any) => d.root.visible);
    const wet = ducks.filter((d: any) => waterSurfaceAt(d.pos.x, d.pos.z) !== null).length;
    return { n: ducks.length, wet };
  });
  expect(res.n).toBeGreaterThan(2);
  expect(res.wet).toBe(res.n);
  expect(errors).toEqual([]);
});
