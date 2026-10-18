import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Hand-built creatures and the wild population: the Wild Boar's charge and
// tusks, levels by region and distance from the road, dens. Waits are
// simulation steps.

/** Build the boar (on this thread), move to an open meadow off the road, return a spawner. */
async function meadow(page: Page) {
  await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE;
    const gs = await import('/src/creatures/geometryStore.ts');
    gs.prepareCreatureNow('boar');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    g.time.skipTo(13);
    g.player.teleport(new T.Vector3(-150, heightAt(-150, 230) + 0.5, 230));
    await (window as any).W(10);
    (window as any).__spawnBoar = (dx: number, dz: number, level = 3) => {
      const p = g.player.pos;
      const grp = g.population.spawnGroup(g.population.species.get('boar'), new T.Vector3(p.x + dx, p.y, p.z + dz), level);
      for (const b of grp.members.slice(1)) b.dispose();
      return grp.members[0];
    };
  });
}

test('a Wild Boar paws the ground, charges and bowls you over; dodging through it costs nothing', async ({ game }) => {
  const { page, errors } = game;
  await meadow(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, W = (window as any).W;
    const b = (window as any).__spawnBoar(0, 11);
    b.yaw = Math.PI; // facing the player
    b.angry = true;
    b.setMode('paw', 0.3);
    const modes = new Set<string>();
    const hp0 = pl.hp;
    let hitAt = -1;
    // Step the world one tick at a time (frame waits can skip a whole charge).
    for (let i = 0; i < 240 && hitAt < 0; i++) {
      g.stepSim(1);
      modes.add(b.mode);
      if (pl.hp < hp0) hitAt = i;
    }
    const took = hp0 - pl.hp;
    // Again, but roll through it.
    b.dispose();
    await W(30);
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    pl.teleport(new g.THREE.Vector3(-150, heightAt(-150, 230) + 0.5, 230));
    g.stepSim(5);
    pl.hp = pl.maxHp;
    pl.act = null;
    pl.stamina = pl.maxStamina;
    const b2 = (window as any).__spawnBoar(0, 11);
    b2.yaw = Math.PI;
    b2.angry = true;
    b2.setMode('paw', 0.2);
    let dodged = false;
    for (let i = 0; i < 240; i++) {
      g.stepSim(1);
      const d = Math.hypot(b2.position.x - pl.pos.x, b2.position.z - pl.pos.z);
      // The roll's invulnerable window opens a moment after it starts: go early.
      if (b2.mode === 'charge' && d < 5.6 && !dodged) {
        // Sideways out of its path: a roll straight back just gets run down.
        pl.yaw = Math.PI / 2;
        pl.startAction('roll');
        dodged = pl.act?.def.id === 'roll';
      }
      if (b2.mode === 'skid' || b2.mode === 'circle') break;
    }
    return { modes: [...modes], took, hitAt, dodged, hpAfterDodge: pl.hp === pl.maxHp, label: b.label, level: b.level };
  });
  expect(res.modes).toContain('charge');
  expect(res.hitAt).toBeGreaterThan(0);
  expect(res.took).toBeGreaterThan(10);
  expect(res.dodged).toBe(true);
  expect(res.hpAfterDodge).toBe(true);
  expect(res.label).toBe('Wild Boar');
  expect(res.level).toBe(3);
  expect(errors).toEqual([]);
});

test('parrying the tusks knocks a boar senseless, open to a riposte', async ({ game }) => {
  const { page, errors } = game;
  await meadow(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, W = (window as any).W;
    const b = (window as any).__spawnBoar(0, 1.9);
    b.yaw = Math.PI;
    b.angry = true;
    pl.yaw = 0; // face +Z, toward the boar
    await W(2);
    b.setMode('gore', 0.95);
    for (let i = 0; i < 60 && b.modeT < 0.31; i++) g.stepSim(1);
    pl.startAction('parryShield');
    pl.act.t = pl.act.def.parry[0] + 0.01;
    let parried = false;
    const was = pl.hp;
    for (let i = 0; i < 20; i++) {
      g.stepSim(1);
      if (b.mode === 'daze') parried = true;
    }
    return { parried, stunned: b.stunned, unhurt: pl.hp === was };
  });
  expect(res.parried).toBe(true);
  expect(res.stunned).toBe(true);
  expect(res.unhurt).toBe(true);
  expect(errors).toEqual([]);
});

test('boars scale with level, carry their name and level, and pay out by level', async ({ game }) => {
  const { page, errors } = game;
  await meadow(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, W = (window as any).W;
    const weak = (window as any).__spawnBoar(6, 6, 1);
    const strong = (window as any).__spawnBoar(-6, 6, 5);
    const died: any[] = [];
    const off = g.events.on('enemyDied', (e: any) => died.push(e));
    strong.takeHit({ damage: 9999, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: strong.center.clone(), crit: false, source: 'melee' });
    await W(3);
    off();
    return { weakHp: weak.maxHp, strongHp: strong.maxHp, weakDmg: weak.damage, strongDmg: strong.damage, died: died.map((d) => [d.kind, d.level]) };
  });
  expect(res.strongHp).toBeGreaterThan(res.weakHp * 1.4);
  expect(res.strongDmg).toBeGreaterThan(res.weakDmg * 1.25);
  expect(res.died).toEqual([['boar', 5]]);
  expect(errors).toEqual([]);
});

test('the wild is stronger and busier off the road, never in town, and dens hold their ground', async ({ game }) => {
  const { page, errors } = game;
  await meadow(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, W = (window as any).W, P = g.population, T = g.THREE;
    const { zoneLevel, isSafe } = await import('/src/creatures/population.ts');
    const { roadDist } = await import('/src/world/terrainHeight.ts');
    // Average level beside the King's Road vs deep in the country (Elder Glen is 1-5).
    const avg = (x: number, z: number) => {
      let s = 0;
      for (let i = 0; i < 40; i++) s += zoneLevel(x, z);
      return s / 40;
    };
    let road: [number, number] | null = null, wild: [number, number] | null = null;
    for (let x = -700; x <= 700 && (!road || !wild); x += 23)
      for (let z = -700; z <= 700 && (!road || !wild); z += 29) {
        if (isSafe(x, z)) continue;
        const d = roadDist(x, z);
        if (!road && d < 4) road = [x, z];
        if (!wild && d > 300) wild = [x, z];
      }
    const levels = { road: avg(...road!), wild: avg(...wild!) };
    const dens = P.dens.map((d: any) => ({ road: roadDist(d.x, d.z), safe: isSafe(d.x, d.z), species: d.species }));
    // Wanderers turn up around you once the wild is switched on.
    P.enabled = true;
    for (let i = 0; i < 40 && !P.groups.some((gr: any) => !gr.den); i++) await W(30);
    const roaming = P.groups.filter((gr: any) => !gr.den).length;
    const spawnedNear = P.creatures.every((c: any) => !isSafe(c.position.x, c.position.z));
    P.enabled = false;
    P.clear();
    // A den: kill its whole group and it is cleared, with a toast.
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    const pl = g.player.pos;
    const den = { id: 'test-den', species: 'boar', x: pl.x + 20, z: pl.z, level: 3 };
    P.dens.push(den);
    P.enabled = true;
    for (let i = 0; i < 10 && !P.groups.some((gr: any) => gr.den === den); i++) await W(30);
    P.enabled = false;
    const grp = P.groups.find((gr: any) => gr.den === den);
    const size = grp?.members.length ?? 0;
    const leaderLevel = grp?.members[0].level;
    for (const m of grp?.members ?? []) m.takeHit({ damage: 9999, poise: 0, dir: new T.Vector3(1, 0, 0), at: m.center.clone(), crit: false, source: 'melee' });
    await W(80);
    g.hud.toast = t0;
    P.dens.splice(P.dens.indexOf(den), 1);
    return { levels, dens, roaming, spawnedNear, size, leaderLevel, cleared: P.cleared['test-den'] !== undefined, toasts };
  });
  expect(res.levels.wild).toBeGreaterThan(res.levels.road + 1.5);
  expect(res.dens.length).toBeGreaterThanOrEqual(3);
  for (const d of res.dens) {
    expect(d.road).toBeGreaterThanOrEqual(40);
    expect(d.safe).toBe(false);
  }
  expect(res.roaming).toBeGreaterThan(0);
  expect(res.spawnedNear).toBe(true);
  expect(res.size).toBeGreaterThanOrEqual(3);
  expect(res.leaderLevel).toBe(5);
  expect(res.cleared).toBe(true);
  expect(res.toasts.some((t: string) => /wallow cleared/i.test(t))).toBe(true);
  expect(errors).toEqual([]);
});
