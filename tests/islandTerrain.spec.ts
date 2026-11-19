import { test, expect } from './fixtures';
test('island terrain: connected landings, graded trails, no mountain harbour bridges', async ({ page }) => {
  await page.route('**/island-audit.html', (r) => r.fulfill({ body: '<!doctype html><html><body>Island terrain audit</body></html>', contentType: 'text/html' }));
  await page.goto('/island-audit.html');
  const r = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const L = await import('/src/world/islands/layout.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string);
    let worst = 0,
      worstAt: any = null;
    const wet: string[] = [];
    for (const i of L.ISLANDS) {
      for (const p of i.paths)
        for (let j = 1; j < p.length; j++) {
          const a = p[j - 1],
            b = p[j],
            length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let k = 0; k < 20; k++) {
            const x = a[0] + ((b[0] - a[0]) * k) / 20,
              z = a[1] + ((b[1] - a[1]) * k) / 20;
            const grade = Math.abs(T.worldHeightFn(x + (b[0] - a[0]) / 20, z + (b[1] - a[1]) / 20) - T.worldHeightFn(x, z)) / (length / 20);
            if (grade > worst) {
              worst = grade;
              worstAt = { island: i.id, x, z };
            }
          }
        }
      if (T.worldHeightFn(...i.landing) < 0.4) wet.push(i.id);
    }
    // A sparse chart must match the actual 2 m terrain mesh without filling
    // every distant tile just to inspect four corners of one sea sample.
    const probe = [11813.3, 7114.7];
    const coldTile = T.hasTile(Math.floor(probe[0] / T.TILE), Math.floor(probe[1] / T.TILE));
    const sparse = T.surveyHeightAt(...probe),
      stillCold = !T.hasTile(Math.floor(probe[0] / T.TILE), Math.floor(probe[1] / T.TILE));
    const mesh = T.heightAt(...probe);
    const I = await import('/src/items/itemDefs.ts' as string),
      C = await import('/src/crafting/recipes.ts' as string);
    const puzzleOrders = L.REGIONS.map((r: string) => L.THEMES[r].sequence.map((n: number) => L.THEMES[r].ward[n]));
    const azureHint = L.THEMES.azureIsles.hint.toLowerCase();
    const hintOrder = ['low', 'middle', 'high'].map((word) => azureHint.indexOf(word));
    const badInputs = C.RECIPES.flatMap((r: any) => r.inputs.filter((i: any) => !I.ITEMS[i.id] && !C.GROUPS[i.id]).map((i: any) => i.id));
    return {
      puzzleOrders,
      hintOrder,
      sparseError: Math.abs(sparse - mesh),
      coldTile,
      stillCold,
      clashes: I.CATALOG_CLASHES,
      badInputs,
      worst,
      worstAt,
      wet,
      count: L.ISLANDS.length,
      sites: L.SITES.length,
      wards: L.REGIONS.map((r: string) => L.wardsOf(r).length),
      links: L.HUB_LINKS.map((l: any) => ({ port: l.port, length: Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1]) })),
    };
  });
  console.log('terrain audit', r);
  expect(r.puzzleOrders).toEqual([
    ['Low shell', 'Middle shell', 'High shell'],
    ['Root', 'Rain', 'Sun'],
    ['East watch', 'West watch', 'North watch'],
    ['Dawn', 'Tide', 'Night'],
  ]);
  expect(r.hintOrder.every((n) => n >= 0)).toBe(true);
  expect(r.hintOrder).toEqual([...r.hintOrder].sort((a, b) => a - b));
  expect(r.sparseError).toBeLessThan(1e-6);
  expect(r.coldTile).toBe(false);
  expect(r.stillCold).toBe(true);
  expect(r.clashes).toEqual([]);
  expect(r.badInputs).toEqual([]);
  expect(r.count).toBe(43);
  expect(r.sites).toBe(122);
  expect(r.wards).toEqual([3, 3, 3, 3]);
  expect(r.wet).toEqual([]);
  expect(r.links.map((l) => l.port)).not.toContain('kettleCove');
  expect(r.worst).toBeLessThan(Math.tan((48 * Math.PI) / 180));
});
