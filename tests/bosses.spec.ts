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
    const bounties = B.bounties().filter((b: any) => b.bossId === 'greyjaw').length;
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

test('The White Stag: a hunt, not a fight. It bolts, leaves shining prints, tires, turns at bay, and yields to a steady hand', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    (await import('/src/creatures/geometryStore.ts')).prepareCreatureNow('stag');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const tp = (x: number, z: number) => g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
    g.time.skipTo(18.5);
    g.player.invulnerable = true;
    tp(-300, 10);
    g.stepSim(5);
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    const body = B.spawnNow('whiteStag', new T.Vector3(-300, 0, -20));
    // A blow does it no harm: it only runs.
    body.takeHit({ damage: 500, poise: 0, dir: new T.Vector3(0, 0, 1), at: body.center.clone(), crit: false, source: 'melee' });
    const unhurt = body.hp === body.maxHp && body.alive;
    const ranFromBlow = body.mode === 'bolt';
    const modes = new Set<string>();
    // Run it down: stay on its heels.
    for (let i = 0; i < 60 * 90 && body.mode !== 'yield'; i++) {
      if (i % 30 === 0) {
        const dir = g.player.pos.clone().sub(body.position).setY(0).normalize();
        const at = body.position.clone().addScaledVector(dir, body.mode === 'atBay' ? 6 : 14);
        tp(at.x, at.z);
      }
      g.stepSim(1);
      modes.add(body.mode);
    }
    const prints = body.tracks.laid;
    const withstood = body.withstood;
    tp(body.position.x + 1.5, body.position.z);
    g.stepSim(1);
    const offer = B.interaction(g.player.pos);
    const label = offer?.label ?? '';
    offer?.act();
    for (let i = 0; i < 300; i++) g.stepSim(1);
    g.hud.toast = t0;
    return {
      unhurt, ranFromBlow, modes: [...modes], prints, withstood, label, gone: !body.alive,
      antler: g.player.equip.items.filter((it: any) => it.def.id === 'whiteAntler').length,
      blessed: g.arms.runtime.buffs.has('stagGrace'), st: { ...B.st('whiteStag') }, toasts,
      dawnOnly: [6, 12, 19, 23].map((h) => B.defs.find((d: any) => d.id === 'whiteStag').abroad(h)),
    };
  });
  expect(res.unhurt).toBe(true);
  expect(res.ranFromBlow).toBe(true);
  expect(res.modes).toEqual(expect.arrayContaining(['bolt', 'atBay', 'paw', 'charge', 'yield']));
  expect(res.prints).toBeGreaterThan(20);
  expect(res.withstood).toBe(2);
  expect(res.label).toBe('Lay your hand on the White Stag');
  expect(res.gone).toBe(true);
  expect(res.antler).toBe(1);
  expect(res.blessed).toBe(true);
  expect(res.st.kills).toBe(1);
  expect(res.toasts.some((t) => /turns at bay/.test(t))).toBe(true);
  expect(res.dawnOnly).toEqual([true, false, true, false]);
  expect(errors).toEqual([]);
});

test('Brine-Maw: up at low tide, its crusher guards its front, it rears and slams, tips onto its back, and leaves its shell', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    (await import('/src/creatures/geometryStore.ts')).prepareCreatureNow('crab');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    g.time.skipTo(16);
    g.player.invulnerable = true;
    g.player.teleport(new T.Vector3(2182, heightAt(2182, -150) + 0.5, -150));
    g.stepSim(5);
    const def = B.defs.find((d: any) => d.id === 'brineMaw');
    const tides = [4, 10, 16, 21].map((h) => def.abroad(h));
    const body = B.spawnNow('brineMaw', new T.Vector3(2182, 0, -162));
    const hit = (dir: any, dmg: number, poise: number) => {
      const h0 = body.hp;
      body.takeHit({ damage: dmg, poise, dir, at: body.center.clone(), crit: false, source: 'melee' });
      return h0 - body.hp;
    };
    g.stepSim(90);
    const toward = () => body.forward.clone().negate();
    const front = hit(toward(), 100, 10);
    const side = hit(new T.Vector3(Math.cos(body.yaw), 0, -Math.sin(body.yaw)), 100, 10);
    const modes = new Set<string>();
    let reared = 0, flippedHit = 0;
    for (let i = 0; i < 60 * 40 && body.alive; i++) {
      g.stepSim(1);
      modes.add(body.mode);
      if (body.mode === 'rear' && i % 12 === 0) reared += hit(toward(), 30, 35);
      if (body.mode === 'flipped' && i % 15 === 0) flippedHit = Math.max(flippedHit, hit(toward(), 40, 5));
      if (body.mode === 'scuttle' && i % 120 === 0) hit(new T.Vector3(Math.cos(body.yaw), 0, -Math.sin(body.yaw)), 140, 10);
    }
    if (body.alive) hit(toward(), 1e6, 0);
    for (let i = 0; i < 5; i++) g.stepSim(1);
    return {
      tides, front, side, reared, flippedHit, modes: [...modes], stats: body.stats, alive: body.alive,
      shell: g.player.equip.items.filter((it: any) => it.def.id === 'brineMawShell').length,
    };
  });
  expect(res.tides).toEqual([true, false, true, false]);
  expect(res.front).toBeLessThan(res.side * 0.3);
  expect(res.side).toBe(100);
  expect(res.modes).toEqual(expect.arrayContaining(['scuttle', 'rear', 'flipped']));
  expect(res.stats.flips).toBeGreaterThan(0);
  expect(res.reared).toBeGreaterThan(0);
  expect(res.flippedHit).toBeGreaterThan(90);
  expect(res.alive).toBe(false);
  expect(res.shell).toBe(1);
  expect(errors).toEqual([]);
});

test('Mother Ooze: leaps and splats, swallows you in a surge, sheds lumps that crawl back to heal her, spits acid, and gives up the knight\'s sword', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const tp = (x: number, z: number) => g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
    g.time.skipTo(12);
    g.player.invulnerable = true;
    tp(215, 128);
    g.stepSim(5);
    const body = B.spawnNow('motherOoze', new T.Vector3(215, 0, 145));
    const hit = (dmg: number, poise: number) => body.takeHit({ damage: dmg, poise, dir: new T.Vector3(0, 0, 1), at: body.center.clone(), crit: false, source: 'melee' });
    const size0 = body.size;
    for (let i = 0; i < 60 * 12; i++) g.stepSim(1);
    const early = { ...body.stats };
    // A heavy blow knocks a lump loose; left alone, it crawls back and she heals.
    const before = body.hp;
    hit(body.maxHp * 0.06, 60);
    const afterHit = body.hp;
    for (let i = 0; i < 60 * 8; i++) g.stepSim(1);
    const healed = body.hp > afterHit;
    // Worn past half and kept at a distance, she spits.
    hit(body.maxHp * 0.45, 0);
    for (let i = 0; i < 60 * 16 && body.stats.globs === 0; i++) {
      if (i % 30 === 0) {
        const away = g.player.pos.clone().sub(body.position).setY(0).normalize().multiplyScalar(11).add(body.position);
        tp(away.x, away.z);
      }
      g.stepSim(1);
    }
    const sizeNow = body.size;
    hit(1e6, 0);
    for (let i = 0; i < 5; i++) g.stepSim(1);
    return {
      early, before, afterHit, healed, stats: body.stats, phase: body.phase, size0, sizeNow, alive: body.alive,
      sword: g.player.equip.items.filter((it: any) => it.def.id === 'drownedKnightSword').length,
    };
  });
  expect(res.early.leaps + res.early.surges).toBeGreaterThan(0);
  expect(res.stats.splits).toBeGreaterThan(0);
  expect(res.healed).toBe(true);
  expect(res.stats.absorbed).toBeGreaterThan(0);
  expect(res.stats.globs).toBeGreaterThan(0);
  expect(res.sizeNow).toBeLessThan(res.size0);
  expect(res.alive).toBe(false);
  expect(res.sword).toBe(1);
  expect(errors).toEqual([]);
});

test('The Hollow Thane: warded but for when it raises the dead or is spent, breathes grave-cold, fades behind you, speaks of the fifth, and drops its crown', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    (await import('/src/creatures/geometryStore.ts')).prepareCreatureNow('wight');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const def = B.defs.find((d: any) => d.id === 'hollowThane');
    const tp = (x: number, z: number) => g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
    g.time.skipTo(23);
    g.player.invulnerable = true;
    tp(def.home.x + 10, def.home.z + 4);
    g.stepSim(5);
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    const body = B.spawnNow('hollowThane');
    const hit = (dmg: number) => {
      const h0 = body.hp;
      body.takeHit({ damage: dmg, poise: 10, dir: new T.Vector3(0, 0, 1), at: body.center.clone(), crit: false, source: 'melee' });
      return h0 - body.hp;
    };
    g.stepSim(30);
    const warded = hit(100);
    // Let it raise the dead undisturbed.
    let openDmg = 0;
    for (let i = 0; i < 60 * 30 && body.stats.raised === 0; i++) g.stepSim(1);
    const raised = body.stats.raised;
    // Wear it down through its open moments until it speaks.
    for (let i = 0; i < 60 * 60 && body.alive && body.phase < 3; i++) {
      g.stepSim(1);
      if (body.open && i % 10 === 0) openDmg = Math.max(openDmg, hit(body.maxHp * 0.04));
    }
    for (let i = 0; i < 60 * 3; i++) g.stepSim(1);
    const stats = { ...body.stats };
    hit(1e7);
    body.takeHit({ damage: 1e7, poise: 0, dir: new T.Vector3(0, 0, 1), at: body.center.clone(), crit: false, source: 'melee' });
    // Kill it in the open if the ward is up.
    for (let i = 0; i < 60 * 20 && body.alive; i++) {
      g.stepSim(1);
      if (body.open) hit(1e7);
    }
    for (let i = 0; i < 5; i++) g.stepSim(1);
    g.hud.toast = t0;
    return {
      nightOnly: [22, 3, 9, 15].map((h) => def.abroad(h)), warded, raised, openDmg, stats, alive: body.alive, phase: body.phase,
      crown: g.player.equip.items.filter((it: any) => it.def.id === 'thaneCrown').length, toasts,
    };
  });
  expect(res.nightOnly).toEqual([true, true, false, false]);
  expect(res.warded).toBeLessThan(15);
  expect(res.raised).toBeGreaterThan(0);
  expect(res.openDmg).toBeGreaterThan(res.warded * 3);
  expect(res.stats.breaths + res.stats.cuts + res.stats.fades).toBeGreaterThan(0);
  expect(res.toasts.some((t) => /The fifth\. They always send another/.test(t))).toBe(true);
  expect(res.alive).toBe(false);
  expect(res.crown).toBe(1);
  expect(errors).toEqual([]);
});

test('The Rust Knight: waits bowed over its sword, blocks with its shield until the guard breaks or an overhead is parried, throws the shield, speaks as a man, and leaves a signet and a journal page', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const def = B.defs.find((d: any) => d.id === 'rustKnight');
    const tp = (x: number, z: number) => g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
    g.time.skipTo(13);
    g.player.invulnerable = true;
    tp(def.home.x + 30, def.home.z + 4);
    g.stepSim(5);
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    const body = B.spawnNow('rustKnight');
    const fwd = () => new T.Vector3(Math.sin(body.yaw), 0, Math.cos(body.yaw));
    const hit = (dir: any, dmg: number, poise = 20) => {
      const h0 = body.hp;
      body.takeHit({ damage: dmg, poise, dir, at: body.center.clone(), crit: false, source: 'melee' });
      return h0 - body.hp;
    };
    g.stepSim(60);
    const waiting = body.mode;
    tp(def.home.x + 10, def.home.z + 3);
    for (let i = 0; i < 60 * 6 && body.mode !== 'advance'; i++) g.stepSim(1);
    const rose = body.mode;
    // Into the shield, then behind it.
    const front = hit(fwd().negate(), 100);
    const back = hit(fwd(), 100);
    // Three blows into the shield break its guard.
    for (let i = 0; i < 60 * 10 && body.stats.guardBreaks === 0; i++) {
      g.stepSim(1);
      if (body.mode === 'advance' && i % 10 === 0) hit(fwd().negate(), 20);
    }
    const broke = body.mode;
    const staggered = hit(fwd().negate(), 100);
    // Parry its overhead (the player's guard is stood in for here).
    const recv = g.player.receiveAttack.bind(g.player);
    g.player.receiveAttack = (att: any) => (att.parryable && att.onParried ? (att.onParried(), recv({ ...att, damage: 0 })) : recv(att));
    for (let i = 0; i < 60 * 30 && body.stats.parried === 0; i++) g.stepSim(1);
    g.player.receiveAttack = recv;
    const parried = body.stats.parried;
    // Wear it down: it throws its shield, then turns violet and speaks.
    for (let i = 0; i < 60 * 60 && body.alive && !toasts.some((t) => /Run\. While you still can/.test(t)); i++) {
      g.stepSim(1);
      if (i % 20 === 0 && body.phase < 3) hit(fwd(), body.maxHp * 0.03);
    }
    const stats = { ...body.stats };
    const shield = body.hasShield;
    hit(fwd(), 1e7);
    for (let i = 0; i < 5; i++) g.stepSim(1);
    g.hud.toast = t0;
    const has = (id: string) => g.player.equip.items.filter((it: any) => it.def.id === id).length;
    return { waiting, rose, front, back, broke, staggered, parried, stats, shield, alive: body.alive, phase: body.phase, signet: has('dentedSignet'), page: has('journalPage'), toasts };
  });
  expect(res.waiting).toBe('kneel');
  expect(res.rose).toBe('advance');
  expect(res.front).toBeLessThan(res.back * 0.2);
  expect(res.broke).toBe('stagger');
  expect(res.staggered).toBeGreaterThan(res.back);
  expect(res.parried).toBeGreaterThan(0);
  expect(res.stats.sweeps + res.stats.overheads + res.stats.slams).toBeGreaterThan(2);
  expect(res.shield).toBe(false);
  expect(res.toasts.some((t) => /tears its shield/.test(t))).toBe(true);
  expect(res.toasts.some((t) => /Run\. While you still can/.test(t))).toBe(true);
  expect(res.alive).toBe(false);
  expect(res.signet).toBe(1);
  expect(res.page).toBe(1);
  expect(errors).toEqual([]);
});

test('Snaggletooth: rides out at sundown on an armoured war-boar, is thrown when it falls, horns up his band, drinks the violet vial, and leaves his horn', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, B = g.bosses;
    const GS = await import('/src/creatures/geometryStore.ts');
    GS.prepareCreatureNow('boar');
    GS.prepareCreatureNow('goblin');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const def = B.defs.find((d: any) => d.id === 'snaggletooth');
    const tp = (x: number, z: number) => g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
    g.time.skipTo(18);
    g.player.invulnerable = true;
    tp(def.home.x + 14, def.home.z + 5);
    g.stepSim(5);
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    const body = B.spawnNow('snaggletooth');
    const hit = (tgt: any, dir: any, dmg: number) => {
      const h0 = body.hp;
      tgt.takeHit({ damage: dmg, poise: 20, dir, at: tgt.center.clone(), crit: false, source: 'melee' });
      return h0 - body.hp;
    };
    const boar = body.boar;
    const fwd = () => boar.forward.clone();
    g.stepSim(30);
    const front = hit(boar, fwd().negate(), 100);
    const flank = hit(boar, new T.Vector3(fwd().z, 0, -fwd().x), 100);
    // Parry the charge: the boar tumbles.
    const recv = g.player.receiveAttack.bind(g.player);
    g.player.receiveAttack = (att: any) => (att.parryable && att.onParried ? (att.onParried(), recv({ ...att, damage: 0 })) : recv(att));
    for (let i = 0; i < 60 * 20 && boar.stats.tumbles === 0; i++) g.stepSim(1);
    g.player.receiveAttack = recv;
    const tumbled = boar.mode;
    // Bring the boar down: Snaggletooth is thrown and blows his horn.
    hit(boar, fwd(), 1e6);
    g.stepSim(2);
    const thrown = body.chief?.mode;
    for (let i = 0; i < 60 * 10 && body.band.length === 0; i++) g.stepSim(1);
    const band1 = body.band.length;
    // Wear him down to the vial.
    const chief = body.chief;
    for (let i = 0; i < 60 * 40 && chief.alive && !chief.frenzy; i++) {
      g.stepSim(1);
      if (i % 30 === 0 && chief.mode !== 'thrown') hit(chief, new T.Vector3(1, 0, 0), chief.maxHp * 0.06);
    }
    for (let i = 0; i < 60 * 3; i++) g.stepSim(1);
    const band2 = body.stats.called;
    const stats = { ...chief.stats, riderCuts: body.stats.riderCuts, charges: boar.stats.charges };
    const phase = body.phase;
    hit(chief, new T.Vector3(1, 0, 0), 1e6);
    for (let i = 0; i < 5; i++) g.stepSim(1);
    g.hud.toast = t0;
    for (const m of body.band) m.b.dispose();
    return {
      hours: [18, 1, 10, 14].map((h) => def.abroad(h)), front, flank, tumbled, thrown, band1, band2, stats, phase, alive: body.alive,
      horn: g.player.equip.items.filter((it: any) => it.def.id === 'snaggleHorn').length, toasts,
    };
  });
  expect(res.hours).toEqual([true, true, false, false]);
  expect(res.front).toBeLessThan(res.flank * 0.6);
  expect(res.tumbled).toBe('daze');
  expect(res.thrown).toBe('thrown');
  expect(res.band1).toBeGreaterThanOrEqual(3);
  expect(res.band2).toBeGreaterThan(res.band1);
  expect(res.stats.horns).toBe(2);
  expect(res.phase).toBe(3);
  expect(res.toasts.some((t) => /flies over its head/.test(t))).toBe(true);
  expect(res.toasts.some((t) => /something violet/.test(t))).toBe(true);
  expect(res.alive).toBe(false);
  expect(res.horn).toBe(1);
  expect(errors).toEqual([]);
});
