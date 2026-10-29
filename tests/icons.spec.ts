import { test, expect } from './fixtures';

// The icon set (ui/icons.ts, ui/art): every item has a baked icon that loads,
// and every skill, spell and origin ability has its own painted emblem.

test('every item has a baked icon that loads', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const { ITEMS } = await import('/src/items/itemDefs.ts');
    const m = await (await fetch('/assets/icons/manifest.json')).json();
    const baked = new Set(m.square as string[]);
    const missing = Object.keys(ITEMS).filter((id) => !baked.has(id));
    // Load a spread of them as images.
    const ids = Object.keys(ITEMS).filter((_, i) => i % 23 === 0);
    const sizes = await Promise.all(ids.map((id) => new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth);
      img.onerror = () => resolve(0);
      img.src = `/assets/icons/${id}.${m.ext ?? 'png'}?v=${m.v}`;
    })));
    return { ext: m.ext, missing, loaded: sizes.filter((w) => w >= 256).length, tried: ids.length };
  });
  expect(res.ext).toBe('webp');
  expect(res.missing).toEqual([]);
  expect(res.loaded).toBe(res.tried);
});

test('every skill, spell and origin ability has its own emblem, and emblems paint', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const { SKILLS } = await import('/src/paths/skills.ts');
    const { ORIGINS } = await import('/src/origins/data.ts');
    const { EMBLEMS } = await import('/src/ui/art/emblems.ts');
    const { emblemIcon } = await import('/src/ui/icons.ts');
    const origin = Object.values(ORIGINS as Record<string, { innate?: { id: string }; tiers?: { id: string }[][] }>)
      .flatMap((o) => JSON.stringify(o).match(/"id":"(\w+)","name":"[^"]+","kind":"(active|passive)"/g) ?? [])
      .map((s) => 'origin:' + /"id":"(\w+)"/.exec(s)![1]);
    const keys = [...Object.keys(SKILLS), 'spell:fireball', 'spell:healingLight', ...origin];
    const without = keys.filter((k) => !EMBLEMS[k]);
    const url = emblemIcon('pyromancer:Fireball');
    const w = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth);
      img.onerror = () => resolve(0);
      img.src = url;
    });
    return { count: keys.length, without, w };
  });
  expect(res.count).toBeGreaterThan(90);
  expect(res.without).toEqual([]);
  expect(res.w).toBe(256);
});
