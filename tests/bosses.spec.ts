import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Field bosses (bosses/fieldBosses.ts): named beasts with a territory, hours,
// a bar of their own, phases, a unique first-kill drop, a weekly respawn,
// rumours, map marks and Guild bounties. Stepped tick by tick.

async function nightAt(page: Page, at: [number, number], hour = 22) {
  await page.evaluate(async ({ at, hour }) => {
    const g = (window as any).__game, T = g.THREE;
    const GS = await import('/src/creatures/geometryStore.ts');
    GS.prepareCreatureNow('wolf');
    GS.prepareCreatureNow('greyjaw');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    g.time.skipTo(hour);
    g.player.invulnerable = true;
    g.player.teleport(new T.Vector3(at[0], heightAt(at[0], at[1]) + 0.5, at[1]));
    g.stepSim(5);
  }, { at, hour });
}

const KILL = `(b, frac) => b.takeHit({ damage: b.maxHp * frac, poise: 0, dir: new window.__game.THREE.Vector3(0, 0, 1), at: b.center.clone(), crit: false, source: 'melee' })`;

test('Old Greyjaw: found at night in the north woods, howls in his pack, pounces and bites, turns Dark-touched, and drops his fang once', async ({ game }) => {
  const { page, errors } = game;
  await nightAt(page, [-362, -198]);
  const res = await page.evaluate(async (KILL) => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    const hit = eval(KILL);
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    let bar = '';
    const b0 = g.hud.bossBar.bind(g.hud);
    g.hud.bossBar = (t: any, name?: string) => ((bar = t ? name ?? '' : ''), b0(t, name));
    let renown = 0;
    const off = g.events.on('deed', (d: any) => d.id === 'boss:greyjaw' && (renown = d.renown));
    const body = B.spawnNow('greyjaw', new T.Vector3(-380, 0, -215));
    const modes = new Set<string>();
    let barWhileFighting = '', phases = new Set<number>();
    for (let i = 0; i < 60 * 24; i++) {
      g.stepSim(1);
      modes.add(body.mode);
      phases.add(body.phase);
      if (body.engaged && bar) barWhileFighting = bar;
      if (i === 60 * 10) hit(body, 0.5);
      if (i === 60 * 17) hit(body, 0.3);
    }
    const wolvesBefore = body.minions.filter((w: any) => w.alive).length;
    hit(body, 1);
    g.stepSim(2);
    const fleeing = body.minions.filter((w: any) => w.alive && w.fleeing).length;
    const fangs = g.player.equip.items.filter((it: any) => it.def.id === 'greyjawFang').length;
    // Dead this week: not offered as a bounty, marked slain; a second kill pays differently.
    const marks = B.markers();
    const bounties = B.bounties().length;
    const st = { ...B.st('greyjaw') };
    off();
    g.hud.toast = t0;
    g.hud.bossBar = b0;
    return { modes: [...modes], phases: [...phases], stats: body.stats, barWhileFighting, barAfter: bar, wolvesBefore, fleeing, fangs, renown, marks, bounties, st, toasts };
  }, KILL);
  expect(res.toasts[0]).toMatch(/Old Greyjaw\. A dire wolf/);
  expect(res.st.found).toBe(true);
  expect(res.modes).toEqual(expect.arrayContaining(['notice', 'howl', 'circle', 'snarl', 'lunge', 'rally']));
  expect(res.stats.pounces + res.stats.bites).toBeGreaterThan(1);
  expect(res.stats.rallies).toBe(2);
  expect(res.phases).toEqual(expect.arrayContaining([1, 2, 3]));
  expect(res.toasts.some((t) => /violet/.test(t))).toBe(true);
  expect(res.toasts.some((t) => /The Dark is in him/.test(t))).toBe(true);
  expect(res.barWhileFighting).toBe('Old Greyjaw');
  expect(res.barAfter).toBe('');
  expect(res.wolvesBefore).toBeGreaterThan(2);
  expect(res.fleeing).toBe(res.wolvesBefore);
  expect(res.fangs).toBe(1);
  expect(res.renown).toBe(2);
  expect(res.st.kills).toBe(1);
  expect(res.marks).toEqual([expect.objectContaining({ kind: 'bossSlain' })]);
  expect(res.bounties).toBe(0);
  expect(errors).toEqual([]);
});

test('Old Greyjaw keeps his hours and his ground: night only, gives up the chase and heals, back a week after he dies', async ({ game }) => {
  const { page, errors } = game;
  await nightAt(page, [-362, -198], 13);
  const res = await page.evaluate(async (KILL) => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const hit = eval(KILL);
    B.enabled = true;
    g.stepSim(120);
    const byDay = !!B.body('greyjaw');
    g.time.skipTo(22);
    g.stepSim(120);
    const body = B.body('greyjaw');
    const byNight = !!body;
    // Wound him, then run: he follows for a while, then goes home and heals.
    g.player.teleport(new T.Vector3(-372, heightAt(-372, -200) + 0.5, -200));
    g.stepSim(30);
    body.position && hit(body, 0.4);
    g.stepSim(60);
    const engaged = body.engaged;
    g.player.teleport(new T.Vector3(-230, heightAt(-230, -120) + 0.5, -120));
    let wentHome = false;
    for (let i = 0; i < 60 * 30 && !(wentHome && body.hp >= body.maxHp); i++) {
      g.stepSim(1);
      if (body.mode === 'home') wentHome = true;
    }
    const healed = body.hp >= body.maxHp;
    // Killed: nothing comes back for a week.
    hit(body, 1);
    g.stepSim(5);
    const day0 = g.time.day;
    g.player.teleport(new T.Vector3(-362, heightAt(-362, -198) + 0.5, -198));
    g.time.day = day0 + 3;
    g.stepSim(120);
    const afterThree = !!B.body('greyjaw') && B.body('greyjaw').alive;
    g.time.day = day0 + 7;
    g.stepSim(120);
    const afterWeek = !!B.body('greyjaw') && B.body('greyjaw').alive;
    B.enabled = false;
    return { byDay, byNight, engaged, wentHome, healed, afterThree, afterWeek };
  }, KILL);
  expect(res.byDay).toBe(false);
  expect(res.byNight).toBe(true);
  expect(res.engaged).toBe(true);
  expect(res.wentHome).toBe(true);
  expect(res.healed).toBe(true);
  expect(res.afterThree).toBe(false);
  expect(res.afterWeek).toBe(true);
  expect(errors).toEqual([]);
});

test('Guild bounty on Old Greyjaw: posted on the board, marks him on the map, paid when he dies; rumours spread in town', async ({ game }) => {
  const { page, errors } = game;
  await nightAt(page, [-362, -198]);
  const res = await page.evaluate(async (KILL) => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses, G = g.town.guild;
    const hit = eval(KILL);
    const news0 = B.rumours();
    const marks0 = B.markers().length;
    G.addRep(200); // rank C: bounties at rank C and below are open
    G.open('board');
    const posted = !!document.querySelector('[data-bounty="bounty:greyjaw"]');
    const took = G.acceptBounty('bounty:greyjaw');
    G.close();
    const marks1 = B.markers();
    const gold0 = g.player.prog.gold;
    const body = B.spawnNow('greyjaw', new T.Vector3(-380, 0, -215));
    g.stepSim(10);
    hit(body, 1);
    for (let i = 0; i < 20; i++) g.stepSim(1);
    G.update(0.016, g.player.pos); // the guild settles contracts once a frame
    const paid = g.player.prog.gold - gold0;
    const still = G.activeContracts.some((q: any) => q.templateId === 'bounty:greyjaw');
    const news1 = B.rumours();
    const save = JSON.parse(JSON.stringify(B.toJSON()));
    return { news0, marks0, posted, took, marks1, paid, still, news1, save };
  }, KILL);
  expect(res.news0[0]).toMatch(/Old Greyjaw is hunting the north woods/);
  expect(res.marks0).toBe(0);
  expect(res.posted).toBe(true);
  expect(res.took).toBe(true);
  expect(res.marks1).toEqual([expect.objectContaining({ kind: 'bossRumour' })]);
  expect(res.paid).toBeGreaterThan(200);
  expect(res.still).toBe(false);
  expect(res.news1[0]).toMatch(/you killed Old Greyjaw/);
  expect(res.save.greyjaw).toEqual(expect.objectContaining({ kills: 1, found: true }));
  expect(errors).toEqual([]);
});
