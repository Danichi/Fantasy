import { test, expect } from './fixtures';

// Save slots (save.ts): a save from before slots is Save 1 under its old key;
// new slots get their own keys; the slot in play can't be deleted.

test('save slots: the old save is Save 1, and slots can be made, renamed and deleted', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const S = await import('/src/save.ts');
    const before = localStorage.getItem('fantasy-rpg-slots');
    const save1 = localStorage.getItem('fantasy-rpg-save-v6');
    try {
      localStorage.removeItem('fantasy-rpg-slots');
      localStorage.setItem('fantasy-rpg-save-v6', JSON.stringify({ v: 6, prog: { level: 4, origin: 'human' }, look: { name: 'Aster' }, world: { time: { day: 2 } } }));
      const first = S.listSlots();
      const id = S.createSlot('  Jordan  ');
      localStorage.setItem(`fantasy-rpg-save-v6:${id}`, JSON.stringify({ v: 6, prog: { level: 1, origin: 'human' }, look: { name: 'Bryn' } }));
      S.renameSlot('1', 'Malachi');
      const two = S.listSlots();
      const activeAfterCreate = JSON.parse(localStorage.getItem('fantasy-rpg-slots')!).active;
      S.deleteSlot('1'); // in play: refused
      S.deleteSlot(id);
      const after = S.listSlots();
      return {
        first: first.map((s) => [s.id, s.name, s.hero?.name, s.hero?.level, s.current]),
        two: two.map((s) => [s.id, s.name, s.hero?.name]),
        activeAfterCreate, id,
        after: after.map((s) => s.id),
        keyGone: localStorage.getItem(`fantasy-rpg-save-v6:${id}`) === null,
        save1Kept: !!localStorage.getItem('fantasy-rpg-save-v6'),
      };
    } finally {
      if (before === null) localStorage.removeItem('fantasy-rpg-slots');
      else localStorage.setItem('fantasy-rpg-slots', before);
      if (save1 === null) localStorage.removeItem('fantasy-rpg-save-v6');
      else localStorage.setItem('fantasy-rpg-save-v6', save1);
    }
  });
  expect(res.first).toEqual([['1', 'Save 1', 'Aster', 4, true]]);
  expect(res.id).toBe('2');
  expect(res.activeAfterCreate).toBe('2');
  expect(res.two).toEqual([['1', 'Malachi', 'Aster'], ['2', 'Jordan', 'Bryn']]);
  expect(res.after).toEqual(['1']);
  expect(res.keyGone).toBe(true);
  expect(res.save1Kept).toBe(true);
});
