import { test, expect } from './fixtures';
test('Starfall plans remain connected and every forest reward and crafting ingredient exists', async ({ page }) => {
  await page.route('**/forest-content.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/forest-content.html');
  const r = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const S = await import('/src/dungeon/dungeons/starfall.ts' as string),
      G = await import('/src/dungeon/kit/grammar.ts' as string),
      Q = await import('/src/quests/elfQuests.ts' as string),
      I = await import('/src/items/itemDefs.ts' as string),
      C = await import('/src/items/catalog/kit.ts' as string),
      R = await import('/src/sandbox/bossRoster.ts' as string);
    const roads = await import('/src/world/roadData.ts' as string),
      L = await import('/src/world/elves/layout.ts' as string);
    const road = roads.ROAD_SPECS.find((r: any) => r.id === 'forest');
    const roadConnects = ['thornwick', 'silverbough', 'sanctum'].every((id) => road.pts.some((p: any) => p[0] === L.FOREST_NODES[id][0] && p[1] === L.FOREST_NODES[id][1]));
    const storyKeysOnly = Object.values(I.ITEMS)
      .filter((i: any) => i.id.startsWith('elf') && i.kind === 'key')
      .every((i: any) => (C.SOURCES[i.id] ?? []).every((s: string) => !/^(quest|boss|fshop|chest):/.test(s)));
    const bad: string[] = [],
      missing: string[] = [];
    let checked = 0;
    for (const p of S.starfallDef().plans)
      for (let seed = 1; seed <= 40; seed++) {
        const fg = G.buildFloor(p, seed * 17, { theme: 'starfall', traps: ['darts', 'blade', 'portcullis'] });
        checked++;
        bad.push(...G.validateFloor(fg));
        if (G.reachableRooms(fg, () => true).size !== fg.rooms.length) bad.push('Unreachable room');
        const plain = G.reachableRooms(fg, (d: any) => ['open', 'arena'].includes(d.kind)),
          key = fg.rooms.find((r: any) => r.tags.has('key'));
        if (key && !plain.has(key.id)) bad.push('Key behind gate');
      }
    for (const q of Q.ELF_QUESTS) for (const [id] of q.rewards.items ?? []) if (!I.ITEMS[id]) missing.push(q.id + ':' + id);
    for (const recipe of C.CAT_RECIPES.filter((r: any) => r.id.startsWith('elf')))
      for (const input of recipe.inputs) if (!I.ITEMS[input.id]) missing.push(recipe.id + ':' + input.id);
    return {
      bad,
      roadConnects,
      storyKeysOnly,
      missing,
      checked,
      quests: Q.ELF_QUESTS.length,
      bosses: R.PRACTICE_BOSSES.filter((b: any) => ['elfBlightedElder', 'starwarden'].includes(b.id)).map((b: any) => b.id),
    };
  });
  expect(r.roadConnects).toBe(true);
  expect(r.storyKeysOnly).toBe(true);
  expect(r.bad).toEqual([]);
  expect(r.missing).toEqual([]);
  expect(r.checked).toBe(80);
  expect(r.quests).toBe(13);
  expect(r.bosses.sort()).toEqual(['elfBlightedElder', 'starwarden']);
});
