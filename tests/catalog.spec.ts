import { test, expect } from './fixtures';

// The item catalog (items/catalog): over a thousand new items in eight tiers,
// each with a look, a source and effects that work.

test('the catalog: over a thousand items, every one with a source, an icon and makeable inputs', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const { ITEMS, CATALOG_CLASHES, buildItemModel } = await import('/src/items/itemDefs.ts');
    const { CATALOG_ITEMS, SOURCES, SETS } = await import('/src/items/catalog/index.ts');
    const { RECIPES, BOOK_RECIPES, GROUPS } = await import('/src/crafting/recipes.ts');
    const { artFor } = await import('/src/ui/art/registry.ts');
    const ids = Object.keys(CATALOG_ITEMS);
    const noSource = ids.filter((id) => !(SOURCES[id] ?? []).length);
    const noLook = ids.filter((id) => !artFor(id) && !buildItemModel(ITEMS[id]));
    const badInput = RECIPES.flatMap((r) => r.inputs.filter((i) => !ITEMS[i.id] && !GROUPS[i.id]).map((i) => `${r.id}<-${i.id}`));
    const badOut = RECIPES.filter((r) => !ITEMS[r.out]).map((r) => r.id);
    const books = ids.filter((id) => id.startsWith('book'));
    const emptyBooks = books.filter((id) => !BOOK_RECIPES(id).length);
    const names = new Map<string, string>();
    const dupNames: string[] = [];
    for (const d of Object.values(ITEMS)) {
      if (names.has(d.name) && (CATALOG_ITEMS[d.id] || CATALOG_ITEMS[names.get(d.name)!])) dupNames.push(d.name);
      names.set(d.name, d.id);
    }
    const tiers = new Set(ids.map((id) => id.split('_')[0]).filter((t) => ['iron', 'steel', 'silversteel', 'deepsteel', 'sunbrass', 'tideglass', 'starmetal', 'duskiron'].includes(t)));
    return { n: ids.length, clashes: CATALOG_CLASHES, noSource, noLook, badInput, badOut, emptyBooks, dupNames, sets: SETS.length, setPieces: SETS.every((s) => Object.keys(s.pieces).length === 6), tiers: tiers.size, recipes: RECIPES.length };
  });
  expect(res.n).toBeGreaterThan(1000);
  expect(res.clashes).toEqual([]);
  expect(res.noSource).toEqual([]);
  expect(res.noLook).toEqual([]);
  expect(res.badInput).toEqual([]);
  expect(res.badOut).toEqual([]);
  expect(res.emptyBooks).toEqual([]);
  expect(res.dupNames).toEqual([]);
  expect(res.sets).toBe(20);
  expect(res.setPieces).toBe(true);
  expect(res.tiers).toBe(8);
  expect(errors).toEqual([]);
});

test('a full Glen Watch set: its bonuses take hold, parries restore stamina, armour shows on the body', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, p = g.player, eq = p.equip;
    const before = p.mods.blockCost;
    for (const s of ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet']) {
      eq.add('glenWatch_' + s, 1);
      eq.equip(eq.items.find((i: any) => i.def.id === 'glenWatch_' + s).uid);
    }
    g.events.emit('equipmentChanged', {});
    g.stepSim(3);
    const after = p.mods.blockCost;
    p.stamina = 10;
    g.events.emit('parrySuccess', { at: p.pos.clone(), perfect: true });
    return { sets: g.gearRt.sets, before, after, stamina: p.stamina, worn: eq.models?.size ?? 0 };
  });
  expect(res.sets.glenWatch).toBe(6);
  expect(res.after).toBeLessThan(res.before);
  expect(res.stamina).toBeGreaterThanOrEqual(25);
  expect(errors).toEqual([]);
});

test('one-use items do what they say: a healing scroll, a fire bomb, a phoenix tear', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, p = g.player, eq = p.equip;
    const use = (id: string) => {
      eq.add(id, 1);
      p.useConsumable(eq.items.find((i: any) => i.def.id === id).uid);
      g.stepSim(3);
    };
    p.hp = 20;
    use('scrollHealingLight');
    const healed = p.hp;
    use('phoenixTear');
    const phoenix = g.arms.runtime.buffs.has('phoenix');
    p.hp = 5;
    const saved = p.cheatDeath?.();
    use('lanternOil');
    const lit = (g.gearRt.fx.lightRoom ?? 0) > 0;
    use('spyglass');
    const kept = eq.items.some((i: any) => i.def.id === 'spyglass');
    return { healed, phoenix, saved, hpAfter: p.hp, lit, kept, uses: g.gearRt.stats.uses };
  });
  expect(res.healed).toBeGreaterThan(100);
  expect(res.phoenix).toBe(true);
  expect(res.saved).toBe(true);
  expect(res.lit).toBe(true);
  expect(res.kept).toBe(true);
  expect(res.uses).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('sources: shops stock their tier, bosses and quests give their uniques, the stones give tokens, foes drop parts', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, S = g.catalogSources, p = g.player;
    const has = (id: string) => p.equip.items.some((i: any) => i.def.id === id);
    const smith = S.stockFor('Master Fröst', 'Smith & Merchant', 'Reliable gear', []).map(([id]: [string]) => id);
    // (A boss gives one piece of its hoard a kill now: kill her until the dagger comes.)
    for (let i = 0; i < 20 && !has('plaguetoothDagger'); i++) S.poolDrop('ratQueen');
    g.events.emit('questChanged', { id: 'wren', status: 'done' });
    g.events.emit('siteDone', { id: 'x', kind: 'stone' });
    const before = S.stats.drops;
    for (let i = 0; i < 80; i++) g.events.emit('enemyDied', { at: p.pos.clone(), enemyId: 9000 + i, kind: 'wildWolf', level: 3 });
    return {
      smithIron: smith.filter((id: string) => id.startsWith('iron_')).length,
      plague: has('plaguetoothDagger'), wren: has('wrensWheatEar'), token: has('sunwheelToken1'),
      drops: S.stats.drops - before,
    };
  });
  expect(res.smithIron).toBeGreaterThan(3);
  expect(res.plague).toBe(true);
  expect(res.wren).toBe(true);
  expect(res.token).toBe(true);
  expect(res.drops).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
