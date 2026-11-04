import { test, expect } from './fixtures';

// Crafting depth, mastery and the dynamic main quest: Calling nodes that do
// what they say, practice that raises a Calling, tempering, Jewelcrafting,
// mastery earned by doing with perks that apply, and quests with
// alternatives, optional goals, crafting objectives and choices.

const HELPERS = `(() => {
  const g = window.__game, p = g.player, c = g.arms.crafter, P = p.paths;
  const calling = (id, L) => { if (!P.learned(id)) P.teach(id); P.lv[id] = L; };
  const node = (disc, name) => {
    const { DISC } = window.__mods;
    const t = window.__mods.treeOf(DISC[disc]);
    const n = t.nodes.find((x) => x.name === name || x.name.split('|').includes(name));
    P.nodes[disc][n.id] = n.type === 'choice' ? { r: 1, pick: n.name.split('|').indexOf(name) } : { r: 1 };
    return n;
  };
  const clear = (ids) => { p.equip.items = p.equip.items.filter((it) => !ids.includes(it.def.id) || p.equip.slotOf(it.uid)); };
  const R = (id) => ['forge', 'workbench', 'alchemy', 'kitchen', 'runestone', 'loom'].flatMap((s) => c.at(s)).find((r) => r.id === id);
  return { g, p, c, P, calling, node, clear, R };
})()`;

const load = async (page: import('@playwright/test').Page) => {
  await page.evaluate(async () => {
    const data = await import('/src/paths/data.ts');
    const paths = await import('/src/paths/paths.ts');
    (window as any).__mods = { DISC: data.DISC, treeOf: paths.treeOf };
  });
};

test('Calling nodes do what they say: quality by kind, spared materials, extra ingots, stronger meals', async ({ game }) => {
  const { page, errors } = game;
  await load(page);
  const res = await page.evaluate(async (H) => {
    const { g, p, c, calling, node, clear, R } = eval(H);
    calling('smithing', 6);
    calling('cooking', 3);
    const plain = c.preview(R('longsword'), 0);
    node('smithing', 'Clean Edge');
    node('smithing', 'Balanced');
    node('smithing', 'Light');
    const edged = c.preview(R('longsword'), 0);
    const helm = c.preview(R('ironHelm'), 0);
    // Spared materials and an extra ingot, with luck forced.
    c.rnd = () => 0;
    node('smithing', 'Fuller');
    node('smithing', 'Bellows');
    clear(['ironOre', 'ironIngot']);
    p.equip.add('ironOre', 2);
    const smelt = c.craft(R('ironIngot'), 0);
    const oreLeft = c.count('ironOre');
    c.rnd = Math.random;
    // A Savoury cook's meal lasts and bites harder.
    node('cooking', 'Savoury');
    node('cooking', 'Preserve');
    const rt = g.arms.runtime;
    const { ITEMS } = await import('/src/items/itemDefs.ts');
    rt.consume(ITEMS.heartyStew);
    const buff = rt.buffs.get('meal');
    return { plain, edged, helm, smeltN: smelt.n, oreLeft, sec: buff.left, stamina: buff.m.stamina, base: ITEMS.heartyStew.buff };
  }, HELPERS);
  expect(res.edged).toBeGreaterThan(res.plain);
  expect(res.helm).toBe(res.plain); // weapon nodes don't touch armour
  expect(res.smeltN).toBe(2);
  expect(res.oreLeft).toBe(2); // every unit spared
  expect(res.sec).toBeGreaterThan(res.base.sec);
  expect(res.stamina).toBeGreaterThan(res.base.m.stamina);
  expect(errors).toEqual([]);
});

test('crafting is practice: a Calling rises by working at it, and its mastery grows with it', async ({ game }) => {
  const { page, errors } = game;
  await load(page);
  const res = await page.evaluate(async (H) => {
    const { g, p, P, c, calling, clear, R } = eval(H);
    calling('smithing', 1);
    P.mx.smithing = 0;
    g.arms.practice.xp = {};
    clear(['ironOre', 'ironIngot', 'leather', 'ironDagger']);
    p.equip.add('ironOre', 40);
    for (let i = 0; i < 20; i++) c.craft(R('ironIngot'), 0);
    return { level: P.level('smithing'), mx: P.mx.smithing, frac: g.arms.practice.progress('smithing') };
  }, HELPERS);
  expect(res.level).toBeGreaterThan(1);
  expect(res.mx).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('tempering raises a piece you own a quality step, at the forge, for some of what it was made from', async ({ game }) => {
  const { page, errors } = game;
  await load(page);
  const res = await page.evaluate(async (H) => {
    const { p, c, calling, node, clear } = eval(H);
    calling('smithing', 8);
    clear(['ironIngot', 'coal', 'shortsword']);
    const sword = p.equip.add('shortsword', 1);
    const before = c.temperPlan(sword, 'forge');
    node('smithing', 'Temper');
    const plan = c.temperPlan(sword, 'forge');
    const wrong = c.temperPlan(sword, 'loom');
    p.equip.add('ironIngot', 6);
    p.equip.add('coal', 3);
    const out = c.temper(sword.uid, 'forge');
    return { before: before.ok, plan: { ok: plan.ok, to: plan.to, cost: plan.cost }, wrong: wrong.ok, q: out.inst?.q, name: out.inst?.def.name, ingots: c.count('ironIngot') };
  }, HELPERS);
  expect(res.before).toBe(false);
  expect(res.plan.ok).toBe(true);
  expect(res.plan.to).toBe(2);
  expect(res.wrong).toBe(false);
  expect(res.q).toBe(2);
  expect(res.name).toMatch(/^Fine /);
  expect(res.ingots).toBeLessThan(6);
  expect(errors).toEqual([]);
});

test('Jewelcrafting: cut a garnet, set it in a ring; quality lifts the ring\'s health', async ({ game }) => {
  const { page, errors } = game;
  await load(page);
  const res = await page.evaluate(async (H) => {
    const { p, c, calling, clear, R } = eval(H);
    calling('jewelcrafting', 4);
    clear(['roughGarnet', 'cutGarnet', 'copperIngot', 'garnetRing']);
    p.equip.add('roughGarnet', 1);
    p.equip.add('copperIngot', 2);
    const cut = c.craft(R('cutGarnet'), 0);
    const ring = c.craft(R('garnetRing'), 3);
    return { cut: cut.inst?.def.id, ring: ring.inst?.def.id, q: ring.q, hp: ring.inst?.def.stats.maxHp, mentor: !!R('garnetRing') };
  }, HELPERS);
  expect(res.cut).toBe('cutGarnet');
  expect(res.ring).toBe('garnetRing');
  expect(res.q).toBeGreaterThanOrEqual(2);
  expect(res.hp).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('mastery is earned by doing: blows with the active style raise it, ranks unlock perks that apply', async ({ game }) => {
  const { page, errors } = game;
  await load(page);
  const res = await page.evaluate(async (H) => {
    const { g, p, P } = eval(H);
    if (!P.learned('gale')) P.teach('gale');
    P.setActive('gale');
    P.mx.gale = 0;
    const melee0 = g.skillRt.passive?.m?.melee ?? 0;
    const target = { kind: 'wolf', id: 1, alive: true, position: p.pos.clone(), center: p.center.clone() };
    for (let i = 0; i < 60; i++) g.events.emit('meleeHit', { target, amount: 10, crit: true, action: 'slash1' });
    const r1 = P.masteryRank('gale');
    const melee1 = g.skillRt.passive?.m?.melee ?? 0;
    // A Calling's perks reach its crafting.
    P.mx.cooking = 1600;
    if (!P.learned('cooking')) P.teach('cooking');
    const meal = g.arms.crafter.x('cooking', 'mealPower');
    return { mx: P.mx.gale, r1, melee0, melee1, meal };
  }, HELPERS);
  expect(res.mx).toBeGreaterThanOrEqual(100);
  expect(res.r1).toBeGreaterThanOrEqual(1);
  expect(res.melee1).toBeGreaterThan(res.melee0);
  expect(res.meal).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('quests: alternatives, optional goals with bonuses, crafting objectives, and choices that steer the stages', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, Q = g.quests, E = g.events;
    const xp0 = g.player.prog.xp;
    Q.add({
      id: 't-dyn', title: 'Test', giver: 'maud', region: 'cresha', summary: '', offer: '', done: 'Done.', doneIf: [['path=b', 'Done the other way.']],
      rewards: { gold: 0, xp: 0 },
      stages: [
        { note: 'Either way.', objectives: [
          { type: 'signal', id: 't-a', group: 'way', flag: 'wayA', text: 'A' },
          { type: 'craft', item: 'ironIngot', count: 2, group: 'way', flag: 'wayB', text: 'B' },
          { type: 'craft', gear: 'meal', minQ: 2, count: 1, optional: true, flag: 'bonus', bonus: { xp: 33 }, text: 'Opt' },
        ] },
        { note: 'Choose.', objectives: [{ type: 'choose', npc: 'maud', key: 'path', text: 'Choose', prompt: '?', options: [{ id: 'a', label: 'A', say: 'a' }, { id: 'b', label: 'B', say: 'b' }] }] },
        { note: 'Only on a.', when: 'path=a', objectives: [{ type: 'signal', id: 't-only-a', text: 'only a' }] },
      ],
    });
    Q.accept('t-dyn');
    // A Fine meal (the optional goal), then the second alternative: two ingots.
    E.emit('crafted', { recipe: 'x', item: 'grilledFish', calling: 'cooking', station: 'kitchen', q: 2, n: 1, level: 1, gear: 'meal' });
    const opt = { flag: Q.flag('t-dyn', 'bonus'), xp: g.player.prog.xp - xp0, stage: Q.state['t-dyn'].stage };
    E.emit('crafted', { recipe: 'ironIngot', item: 'ironIngot', calling: 'smithing', station: 'forge', q: 1, n: 1, level: 1, gear: 'other' });
    E.emit('crafted', { recipe: 'ironIngot', item: 'ironIngot', calling: 'smithing', station: 'forge', q: 1, n: 1, level: 1, gear: 'other' });
    const afterB = { stage: Q.state['t-dyn'].stage, wayB: Q.flag('t-dyn', 'wayB'), wayA: !!Q.flag('t-dyn', 'wayA') };
    // The choice: "b" skips the stage that waits on "a" and ends the quest.
    let opts: any[] = [], said = '';
    const o = Q.options('maud', (t: string, os: any[]) => { said = t; opts = os; }, () => {}).find((x: any) => x.auto);
    o.run();
    opts.find((x: any) => x.label === 'B').run();
    return { opt, afterB, status: Q.status('t-dyn'), path: Q.flag('t-dyn', 'path'), said };
  });
  expect(res.opt).toEqual({ flag: true, xp: 33, stage: 0 });
  expect(res.afterB).toEqual({ stage: 1, wayB: true, wayA: false });
  expect(res.status).toBe('done');
  expect(res.path).toBe('b');
  expect(res.said).toContain('Done the other way.');
  expect(errors).toEqual([]);
});
