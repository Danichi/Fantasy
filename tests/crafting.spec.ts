import { test, expect } from './fixtures';
import { test as base, expect as baseExpect, type Page } from '@playwright/test';

// Arms and Crafting, phases A3 to A5 (docs/design/arms-and-crafting.md §9):
// materials and quality, the craft page and its timing step, the stations in
// the world's rooms, cooking, runes, salvage, discovery and recipe books,
// gathering nodes that deplete and come back by world time, and what
// survives a reload. Waits are counted in simulation steps (window.W).

/** In-page helpers: a Calling at a level, counting and clearing items, finding a recipe. */
const HELPERS = `(() => {
  const g = window.__game, p = g.player, c = g.arms.crafter;
  const calling = (id, L) => { if (!p.paths.learned(id)) p.paths.teach(id); p.paths.lv[id] = L; };
  const count = (id) => c.count(id);
  const clear = (ids) => { p.equip.items = p.equip.items.filter((it) => !ids.includes(it.def.id) || p.equip.slotOf(it.uid)); };
  const R = (id) => ['forge', 'workbench', 'alchemy', 'kitchen', 'runestone', 'loom'].flatMap((s) => c.at(s)).find((r) => r.id === id);
  const press = async (code = 'KeyE') => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    await window.W(3);
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  return { g, p, c, calling, count, clear, R, press };
})()`;

test('iron ore becomes an ingot and then a Fine sword at Smithing 5; quality rises with good timing', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { p, c, calling, count, clear, R } = eval(H);
    calling('smithing', 5);
    clear(['ironOre', 'ironIngot', 'leather', 'shortsword']);
    p.equip.add('ironOre', 8);
    p.equip.add('leather', 2);
    const ingot = R('ironIngot');
    for (let i = 0; i < 4; i++) c.craft(ingot, 0);
    const ingots = count('ironIngot'), ore = count('ironOre');
    const good = c.craft(R('shortsword'), 3);
    const sloppy = c.craft(R('shortsword'), 0);
    const short = c.craft(R('shortsword'), 3); // out of iron now
    return {
      ingots, ore,
      good: { q: good.q, name: good.inst.def.name, dmg: good.inst.def.stats.damage },
      sloppy: { q: sloppy.q ?? 1, name: sloppy.inst.def.name, dmg: sloppy.inst.def.stats.damage },
      short, left: count('ironIngot'),
    };
  }, HELPERS);
  expect(res.ingots).toBe(4);
  expect(res.ore).toBe(0);
  expect(res.good.q).toBe(2);
  expect(res.good.name).toBe('Fine Iron Shortsword');
  expect(res.sloppy.q).toBe(1);
  expect(res.good.dmg).toBeGreaterThan(res.sloppy.dmg);
  expect(typeof res.short).toBe('string');
  expect(res.left).toBe(0);
});

test('a tonic’s strength follows the Herbalism level', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { c, calling, clear, R, p } = eval(H);
    clear(['sungrass', 'wildmint', 'herbalTonic']);
    p.equip.add('sungrass', 4);
    p.equip.add('wildmint', 2);
    calling('herbalism', 1);
    const novice = c.craft(R('herbalTonic'), 3);
    p.paths.lv.herbalism = 20;
    const master = c.craft(R('herbalTonic'), 3);
    return { novice: [novice.q, novice.inst.def.stats.heal], master: [master.q, master.inst.def.stats.heal] };
  }, HELPERS);
  expect(res.master[0]).toBeGreaterThan(res.novice[0]);
  expect(res.master[1]).toBeGreaterThan(res.novice[1]);
});

test('the smithy’s forge opens the craft page; the timing step makes the sword', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, calling, clear, press } = eval(H);
    const T = g.THREE;
    calling('smithing', 5);
    clear(['ironIngot', 'leather', 'shortsword']);
    p.equip.add('ironIngot', 2);
    p.equip.add('leather', 1);
    // Into Fröst's smithy, to the forge.
    const door = g.doors.find((d: { keeper?: string }) => d.keeper === 'froest');
    p.teleport(new T.Vector3(door.pos.x, door.pos.y + 0.4, door.pos.z));
    await window.W(20);
    await press();
    for (let i = 0; i < 400 && !(g.realm.mode === 'interior' && !g.realm.busy); i++) await window.W(5);
    const labels = g.realm.interactables.map((i: { label: () => string }) => i.label());
    const forge = g.realm.interactables.find((i: { label: () => string }) => /forge/i.test(i.label()) && /Work/.test(i.label()));
    const rune = labels.some((l: string) => /runes/i.test(l));
    p.teleport(forge.pos.clone().setY(forge.pos.y + 0.2));
    await window.W(10);
    await press();
    await window.W(3);
    const ui = g.arms.craft;
    const open = ui.open && !!document.querySelector('.shop2.craft:not(.hidden)');
    const btn = document.querySelector('.shop2.craft [data-act="craft"][data-id="shortsword"]') as HTMLElement;
    btn.click();
    const timing = !!document.querySelector('.shop2.craft .ct-bar');
    // Three blows, whenever: some land, some don't; the sword is made either way.
    for (let i = 0; i < 3; i++) {
      (document.querySelector('.shop2.craft .ct-btns [data-act="strike"]') as HTMLElement)?.click();
      await new Promise((r) => setTimeout(r, 170));
    }
    const note = document.querySelector('.shop2.craft .sc-note')?.textContent ?? '';
    const made = p.equip.items.some((it: { def: { id: string } }) => it.def.id === 'shortsword');
    ui.close();
    // Out by the door you came in.
    const exit = g.realm.interior.interactables[0];
    p.teleport(exit.pos.clone().setY(exit.pos.y + 0.4));
    await window.W(10);
    await press();
    for (let i = 0; i < 400 && !(g.realm.mode === 'overworld' && !g.realm.interior && !g.realm.busy); i++) await window.W(5);
    return { labels: labels.length, forge: !!forge, rune, open, timing, note, made, mode: g.realm.mode };
  }, HELPERS);
  expect(res.forge).toBe(true);
  expect(res.rune).toBe(true);
  expect(res.open).toBe(true);
  expect(res.timing).toBe(true);
  expect(res.note).toMatch(/^Made: .*Iron Shortsword/);
  expect(res.made).toBe(true);
  expect(res.mode).toBe('overworld');
});

test('a meal’s buff lasts its time', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, c, calling, clear, R } = eval(H);
    calling('cooking', 1);
    clear(['glenPerch', 'grilledFish']);
    p.equip.add('glenPerch', 1);
    const meal = c.craft(R('grilledFish'), 3);
    const sec = meal.inst.def.buff.sec, id = meal.inst.def.buff.id;
    p.useConsumable(meal.inst.uid);
    const rt = g.arms.runtime;
    const at0 = rt.buffs.get(id)?.left;
    rt.update(sec - 2);
    const before = rt.buffs.has(id);
    rt.update(3);
    return { sec, at0, before, after: rt.buffs.has(id), eaten: c.count('grilledFish') };
  }, HELPERS);
  expect(res.at0).toBeGreaterThanOrEqual(res.sec - 1);
  expect(res.before).toBe(true);
  expect(res.after).toBe(false);
  expect(res.eaten).toBe(0);
});

test('a rune adds its element to a sword, and salvage gives materials back', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, c, calling, clear, R, count } = eval(H);
    calling('smithing', 5);
    calling('runecraft', 1);
    clear(['copperIngot', 'emberroot', 'runeEmber', 'longsword', 'shortsword', 'ironIngot', 'leather']);
    p.equip.add('copperIngot', 1);
    p.equip.add('emberroot', 1);
    c.craft(R('runeEmber'), 0);
    const sword = p.equip.add('longsword');
    p.equip.equip(sword.uid, 'main');
    const plain = sword.def.stats.burn ?? 0;
    const made = c.inscribe(sword.uid, 'runeEmber');
    const equipped = p.equip.mainWeapon?.uid === made.uid;
    // A burning edge keeps hurting after the blow.
    g.slimes.clear();
    p.yaw = Math.PI;
    const s = g.slimes.spawn('blue', p.pos.x, p.pos.z - 1.4);
    s.update = () => {};
    s.center.set(s.position.x, s.position.y + 0.9, s.position.z);
    s.hp = s.maxHp = 9999;
    p.lock = null;
    g.input.press('Mouse0');
    await window.W(3);
    g.input.release('Mouse0');
    for (let i = 0; i < 90 && s.hp === 9999; i++) await window.W(1);
    const afterHit = s.hp;
    await window.W(100);
    const burned = afterHit - s.hp;
    g.slimes.clear();
    // Salvage: an unworn shortsword comes apart into iron.
    const extra = p.equip.add('shortsword');
    const back = c.salvage(extra.uid);
    const worn = c.salvage(made.uid);
    return { hit: 9999 - afterHit, mode: g.realm.mode, ui: g.input.uiMode, plain, burn: made.def.stats.burn, name: made.def.name, rune: made.rune, equipped, burned, back, iron: count('ironIngot'), worn, runes: count('runeEmber') };
  }, HELPERS);
  expect(res.plain).toBe(0);
  expect(res.burn).toBe(6);
  expect(res.name).toContain('Embers');
  expect(res.equipped).toBe(true);
  expect(res.runes).toBe(0);
  expect(res.hit, JSON.stringify({ mode: res.mode, ui: res.ui })).toBeGreaterThan(0);
  expect(res.burned).toBeGreaterThan(0);
  expect(res.back).toEqual([{ id: 'ironIngot', n: 1 }]);
  expect(res.iron).toBe(1);
  expect(res.worn).toBeNull();
});

test('recipe books and discovery teach recipes; tree nodes teach theirs', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { p, c, calling, clear, R } = eval(H);
    calling('herbalism', 5);
    calling('smithing', 10);
    c.learned.clear();
    const before = { bomb: c.knows(R('emberBomb')), silver: c.knows(R('silversteelIngot')), stew: c.knows(R('heartyStew')) };
    const wrong = c.discover('alchemy', ['emberroot', 'sungrass']);
    const right = c.discover('alchemy', ['coal', 'emberroot']);
    clear(['bookSmithing']);
    const book = p.equip.add('bookSmithing');
    p.useConsumable(book.uid);
    // Cooking's tree: the "Hearty Stew" node (Feasts, second row) teaches the stew.
    calling('cooking', 5);
    p.paths.nodes.cooking = { ...p.paths.nodes.cooking, '0-1-0': { r: 1 } };
    const stew = c.knows(R('heartyStew'));
    delete p.paths.nodes.cooking['0-1-0'];
    return { before, wrong: wrong.ok, right: right.ok, bomb: c.knows(R('emberBomb')), silver: c.knows(R('silversteelIngot')), flamberge: c.knows(R('silversteelFlamberge')), stew };
  }, HELPERS);
  expect(res.before).toEqual({ bomb: false, silver: false, stew: false });
  expect(res.wrong).toBe(false);
  expect(res.right).toBe(true);
  expect(res.bomb).toBe(true);
  expect(res.silver).toBe(true);
  expect(res.flamberge).toBe(true);
  expect(res.stew).toBe(true);
});

test('an ore vein yields ore, is worked out, and comes back by world time', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, count, clear } = eval(H);
    const T = g.THREE;
    clear(['ironOre', 'copperOre', 'coal', 'silverOre', 'miningPick']);
    const nodes = g.arms.gathering;
    // The old quarry has iron close to home.
    const q = new T.Vector3(-180, 0, -262);
    const vein = nodes.around(q, 30).find((n: { kind: string; available: boolean }) => n.kind === 'iron' && n.available);
    p.teleport(vein.pos.clone().add(new T.Vector3(1.2, 0.6, 0)));
    await window.W(20);
    const noTool = g.realm.interactables.find((i: { label: () => string }) => /iron ore vein/i.test(i.label()))?.label();
    p.equip.add('miningPick');
    await window.W(2);
    const label = g.realm.interactables.find((i: { label: () => string }) => /Mine the iron/i.test(i.label()));
    label.action();
    await window.W(5);
    const working = nodes.working;
    await window.W(140);
    const ore = count('ironOre');
    const gone = !nodes.around(vein.pos, 0.5)[0].available;
    // Most of a day later it is still worked out; a day after that it is back.
    g.time.hour += 12;
    await window.W(2);
    const halfDay = nodes.around(vein.pos, 0.5)[0].available;
    g.time.day += 1;
    await window.W(2);
    const back = nodes.around(vein.pos, 0.5)[0].available;
    // Timber needs an axe: there is fallen wood in the forests.
    const woods = nodes.around(p.pos, 3000).filter((n: { kind: string }) => ['oak', 'ash', 'yew'].includes(n.kind)).length;
    return { noTool, working, ore, gone, halfDay, back, quarry: nodes.around(q, 30).length, woods };
  }, HELPERS);
  expect(res.noTool).toMatch(/you need a pick/);
  expect(res.working).toBe(true);
  expect(res.ore).toBeGreaterThanOrEqual(1);
  expect(res.gone).toBe(true);
  expect(res.halfDay).toBe(false);
  expect(res.back).toBe(true);
  expect(res.quarry).toBeGreaterThanOrEqual(5);
});

// ---- across a reload: its own page (the save is on) ------------------------------------------------
async function boot(page: Page, query: string) {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
}

base('a discovered recipe and a worked-out vein survive a reload', async ({ page }) => {
  base.setTimeout(420_000 * Number(process.env.PW_SLOW ?? '1')); // boots the game twice
  await boot(page, '?test&save');
  await page.evaluate(() => {
    localStorage.clear();
    const g = (window as any).__game, p = g.player, c = g.arms.crafter;
    p.paths.teach('herbalism');
    p.paths.lv.herbalism = 5;
    c.discover('alchemy', ['emberroot', 'coal']);
    c.quick = true;
    // Work out a quarry vein directly (the gathering test covers the work itself).
    const nodes = g.arms.gathering;
    (nodes as any).worked.set('quarry:0', g.time.day * 24 + g.time.hour);
    g.save();
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  const res = await page.evaluate(() => {
    const g = (window as any).__game, c = g.arms.crafter;
    const out = { bomb: c.learned.has('emberBomb'), quick: c.quick, vein: !!g.arms.gathering.toJSON()['quarry:0'] };
    localStorage.clear();
    return out;
  });
  baseExpect(res).toEqual({ bomb: true, quick: true, vein: true });
});
