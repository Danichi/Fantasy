import { test, expect } from './fixtures';

// Painted art (Higgsfield): bestiary plates, conversation portraits, region vistas, the title painting.

test('every bestiary entry has a plate, every region a vista, and the files are there', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const ART = (await import('/src/ui/art/artManifest.json' as string)).default;
    const { ALL_ENTRIES } = await import('/src/progression/bestiary.ts' as string);
    const { REGION_NAMES } = await import('/src/items/mapItems.ts' as string);
    const ok = async (u: string) => (await fetch(u, { method: 'HEAD' })).ok;
    const missingPlates = ALL_ENTRIES.filter((id: string) => !ART.beast.includes(id));
    const missingRegions = Object.keys(REGION_NAMES).filter((id) => !ART.region.includes(id));
    const files = await Promise.all([`/assets/art/beast/${ART.beast[0]}.webp`, `/assets/art/region/${ART.region[0]}.webp`, '/assets/art/title.webp'].map(ok));
    return { missingPlates, missingRegions, files };
  });
  expect(res.missingPlates).toEqual([]);
  expect(res.missingRegions).toEqual([]);
  expect(res.files).toEqual([true, true, true]);
  expect(errors).toEqual([]);
});

test('the conversation box shows the speaker: their own portrait, one by trade, or none for a sign', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const { portraitFor } = await import('/src/ui/art/portraits.ts' as string);
    const g = (window as any).__game;
    const shown = (name: string, title: string) => {
      g.dialogue.show(name, title, 'Hello.', [{ label: 'Bye.', run: () => g.dialogue.close() }]);
      const el = document.querySelector('.dialogue') as HTMLElement;
      const img = el.querySelector('.portrait') as HTMLImageElement;
      const r = el.classList.contains('has-portrait') ? img.getAttribute('src') : null;
      g.dialogue.close();
      return r;
    };
    const named = shown('Ysolde Penwright', 'Royal Cartographer');
    const guard = portraitFor('Gate Warden Oswy', 'Town Watch');
    const sign = shown('Elder Glen', 'A signpost');
    const ok = named ? (await fetch(named, { method: 'HEAD' })).ok : false;
    return { named, ok, guard, sign };
  });
  expect(res.named).toContain('/assets/art/npc/');
  expect(res.ok).toBe(true);
  expect(res.guard).toContain('/assets/art/arch/guard');
  expect(res.sign).toBe(null);
  expect(errors).toEqual([]);
});
