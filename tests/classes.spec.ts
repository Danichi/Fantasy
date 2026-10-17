import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// The reworked magic classes: trials that teach them, Pyromancer Heat
// (build, overheat, vent), Lightbinder Radiance and Verdict, Halo Ward
// against arrows, and gateways that stay "???" until their class is found.
// Waits are simulation steps, not wall-clock time.

const LEARN = `(disc, name, rank = 1) => {
  const g = window.__game, P = g.player.paths;
  P.lv[disc] = Math.max(P.lv[disc], 25);
  const tree = window.__trees[disc];
  const n = tree.nodes.find((n) => n.name === name || n.name.split('|').includes(name));
  P.nodes[disc][n.id] = { r: rank, pick: n.type === 'choice' ? n.name.split('|').indexOf(name) : undefined };
  g.skillRt.recompute();
  return 'skill:' + disc + ':' + n.id;
}`;

async function setup(page: Page) {
  await page.evaluate(async () => {
    const paths = await import('/src/paths/paths.ts');
    const data = await import('/src/paths/data.ts');
    (window as any).__trees = Object.fromEntries(data.DISCIPLINES.map((d: any) => [d.id, paths.treeOf(d)]));
  });
}

test('classes are learned through mentor trials', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, W = (window as any).waitSteps, pl = g.player;
    const start = { gale: P.learned('gale'), pyro: P.learned('pyromancer'), light: P.learned('lightbinder') };
    const kaela = g.town.npcs.find((n: any) => n.spec.id === 'kaela').spec;
    const said: string[] = [];
    const teach = () => g.town.mentorOptions(kaela, (t: string) => said.push(t)).find((o: any) => o.label.startsWith('Teach me Gale'));
    teach().run(); // starts the trial instead of teaching
    const accepted = g.quests.status('trial-gale');
    const stillUnlearned = !P.learned('gale');
    teach().run(); // while the trial runs: a reminder
    // Win three fights.
    for (let i = 0; i < 3; i++) {
      const s = g.slimes.spawn('blue', pl.pos.x + 3, pl.pos.z + 3 + i);
      await W(5);
      s.takeHit({ damage: 9999, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: s.center.clone(), crit: false, source: 'melee' });
      await W(5);
    }
    await W(10);
    // Report back to Kaela.
    const opts = g.quests.options('kaela', () => {}, () => {});
    opts.find((o: any) => o.label.includes('Still standing'))?.run();
    await W(5);
    return { start, accepted, stillUnlearned, said: said.length, done: g.quests.isDone('trial-gale'), gale: P.learned('gale'), active: P.active };
  });
  expect(res.start).toEqual({ gale: false, pyro: false, light: false });
  expect(res.accepted).toBe('active');
  expect(res.stillUnlearned).toBe(true);
  expect(res.said).toBe(2);
  expect(res.done).toBe(true);
  expect(res.gale).toBe(true);
  expect(res.active).toBe('gale');
  expect(errors).toEqual([]);
});

test('Pyromancer Heat builds, overheats, burns you and vents', async ({ game }) => {
  const { page, errors } = game;
  await setup(page);
  const res = await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game, rt = g.skillRt, pl = g.player, W = (window as any).waitSteps;
    const kindle = learn('pyromancer', 'Kindle');
    const vent = learn('pyromancer', 'Vent');
    pl.mana = pl.maxMana = 999;
    // Kindle needs no lock-on and builds Heat.
    for (let i = 0; i < 600 && !pl.canAct; i++) await W(1);
    const why = rt.use(kindle);
    const afterKindle = rt.heat; // Heat is built when the spell is cast
    await W(80);
    // Heat cools after 2 seconds of quiet.
    await W(260);
    const cooled = rt.heat;
    // Heat adds fire damage.
    rt.heat = 0;
    const cold = rt.spell(10, 'fire');
    rt.heat = 60;
    const hot = rt.spell(10, 'fire');
    // Above 80 you burn.
    rt.heat = 90;
    const hp0 = pl.hp;
    await W(60);
    const burnt = hp0 - pl.hp;
    // At 100 you overheat: hurt, Heat reset, fire locked for 3 s.
    const hp1 = pl.hp;
    rt.addHeat(50);
    const over = { heat: rt.heat, hurt: hp1 - pl.hp, blocked: rt.blocked(kindle) };
    await W(200);
    const unlocked = rt.blocked(kindle);
    // Vent: spends every point of Heat on a ring of fire.
    const s = g.slimes.spawn('blue', pl.pos.x + Math.sin(pl.yaw) * 2, pl.pos.z + Math.cos(pl.yaw) * 2);
    s.cooldown = 1e9;
    await W(20);
    rt.heat = 70;
    const shp = s.hp;
    for (let i = 0; i < 600 && !pl.canAct; i++) await W(1);
    const vwhy = rt.use(vent);
    await W(90);
    return { why, afterKindle, cooled, cold, hot, burnt, over, unlocked, vwhy, ventHeat: rt.heat, ventDmg: shp - Math.max(0, s.hp) };
  }, LEARN);
  expect(res.why).toBeNull();
  expect(res.afterKindle).toBeGreaterThan(8);
  expect(res.cooled).toBeLessThan(res.afterKindle);
  expect(res.hot / res.cold).toBeCloseTo(1.3, 2);
  expect(res.burnt).toBeGreaterThan(1);
  expect(res.over.heat).toBe(0);
  expect(res.over.hurt).toBeGreaterThan(5);
  expect(res.over.blocked).toBe('You are overheated');
  expect(res.unlocked === null || res.unlocked === 'busy').toBe(true);
  expect(res.vwhy).toBeNull();
  expect(res.ventHeat).toBeLessThan(5);
  expect(res.ventDmg).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('Lightbinder Verdict, Sentence, Radiance and Halo Ward', async ({ game }) => {
  const { page, errors } = game;
  await setup(page);
  const res = await page.evaluate(async (learnSrc) => {
    const learn = eval(learnSrc);
    const g = (window as any).__game, rt = g.skillRt, pl = g.player, W = (window as any).waitSteps;
    const ready = async () => { for (let i = 0; i < 600 && !pl.canAct; i++) await W(1); };
    const brand = learn('lightbinder', 'Brand');
    const sentence = learn('lightbinder', 'Sentence');
    const halo = learn('lightbinder', 'Halo Ward');
    const mote = learn('lightbinder', 'Mote of Light');
    pl.mana = pl.maxMana = 999;
    const s = g.slimes.spawn('blue', pl.pos.x + Math.sin(pl.yaw) * 4, pl.pos.z + Math.cos(pl.yaw) * 4);
    s.hp = 2000;
    s.cooldown = 1e9; // a punching bag: it never attacks back
    await W(20);
    pl.lock = s;
    await ready();
    const bwhy = rt.use(brand);
    await W(80);
    const branded = rt.branded(s);
    // Hits on a branded enemy lay Verdict and give Radiance.
    const rad0 = rt.radiance;
    for (let i = 0; i < 4; i++) rt.hit(s, 1);
    const verdict = rt.statusOf(s)?.verdict;
    const radGain = rt.radiance - rad0;
    // Sentence cashes the stacks in.
    const hp0 = s.hp;
    rt.radiance = 0; // no empowering, for a clean number
    await ready();
    const swhy = rt.use(sentence);
    await W(80);
    const sentenced = { dmg: hp0 - s.hp, left: rt.statusOf(s)?.verdict ?? 0 };
    // Halo Ward stops arrows from any side.
    s.takeHit({ damage: 99999, poise: 0, dir: new g.THREE.Vector3(0, 0, 1), at: s.center.clone(), crit: false, source: 'melee' });
    await W(30);
    await ready();
    const hwhy = rt.use(halo);
    await W(120);
    const hpA = pl.hp;
    const arrow = () => pl.receiveAttack({ damage: 20, from: pl.pos.clone().add(new g.THREE.Vector3(0, 1, -6)), parryable: true, poise: 30, projectile: true });
    const r1 = arrow(), r2 = arrow(), r3 = arrow();
    const haloHp = hpA - pl.hp;
    // Mote of Light heals you while you stand near it.
    pl.hp = pl.maxHp - 30;
    await ready();
    rt.use(mote);
    await W(240);
    const healed = pl.hp - (pl.maxHp - 30);
    return { bwhy, hwhy, halo: rt.halo, branded, verdict, radGain, swhy, sentenced, r: [r1, r2, r3], haloHp, healed, mote: !!rt.mote };
  }, LEARN);
  expect(res.bwhy).toBeNull();
  expect(res.branded).toBe(true);
  expect(res.verdict).toBe(4);
  expect(res.radGain).toBeGreaterThan(4);
  expect(res.swhy).toBeNull();
  expect(res.sentenced.dmg).toBeGreaterThan(50); // 15 + 12 x 4, before spell power
  expect(res.sentenced.left).toBe(0);
  expect(res.hwhy).toBeNull();
  expect(res.r.slice(0, 2)).toEqual(['blocked', 'blocked']);
  expect(res.r[2]).not.toBe('blocked');
  expect(res.mote).toBe(true);
  expect(res.healed).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('gateways stay ??? and need ten nodes in their branch, one per tree', async ({ game }) => {
  const { page, errors } = game;
  await setup(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, tree = (window as any).__trees.pyromancer;
    P.teach('pyromancer');
    P.lv.pyromancer = 25;
    g.player.prog.addXp(0);
    const cap0 = tree.map['0-cap'], cap1 = tree.map['1-cap'];
    const name = P.displayName('pyromancer', cap0);
    // Walk straight up to the gateway: only 5 nodes in the branch.
    for (let id = cap0.parent; id && id !== 'c'; id = tree.map[id].parent) P.nodes.pyromancer[id] = tree.map[id].type === 'choice' ? { r: 1, pick: 0 } : { r: 1 };
    const early = P.whyNot('pyromancer', cap0);
    // Fill branch 0 (Flame) without its gateway.
    for (const n of tree.nodes) if (n.branch === 0 && n.type !== 'cap') P.nodes.pyromancer[n.id] = n.type === 'choice' ? { r: 1, pick: 0 } : { r: 1 };
    for (const n of tree.nodes) if (n.branch === 1 && n.type !== 'cap') P.nodes.pyromancer[n.id] = n.type === 'choice' ? { r: 1, pick: 0 } : { r: 1 };
    const count = P.branchCount('pyromancer', 0);
    P.nodes.pyromancer['0-cap'] = { r: 1 };
    const second = P.whyNot('pyromancer', cap1);
    const hiddenShown = P.visible((await import('/src/paths/data.ts')).DISC.sunbreaker);
    return { name, early, count, second, hiddenShown };
  });
  expect(res.name).toBe('???');
  expect(res.early).toMatch(/Needs 10 nodes in Flame/);
  expect(res.count).toBeGreaterThanOrEqual(10);
  expect(res.second).toBe('You have already opened a gateway in this tree');
  expect(res.hiddenShown).toBe(false);
  expect(errors).toEqual([]);
});
