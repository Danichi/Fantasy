import { ITEMS } from '../../items/itemDefs';

// ---------------------------------------------------------------------------
// Chests by tier (docs/design/dungeons.md §6): wooden, iron, gilded and the
// vault, each with a table per dungeon. Tables may name materials and recipe
// books from other updates (Arms and Crafting); an id that isn't in ITEMS
// yet simply rolls again from what is, and gold always comes.
// ---------------------------------------------------------------------------

/** Per tier: [item id, weight] pairs, plus a gold range. */
export type LootTable = { gold: [number, number]; items: [string, number][] }[];

const has = (id: string) => !!ITEMS[id];

/** Roll a chest: gold, and one item (two from a vault), never an id the game doesn't have. */
export function rollChest(table: LootTable, tier: number, mul = 1, fixed?: string, rnd = Math.random) {
  const t = table[Math.max(0, Math.min(table.length - 1, tier))];
  const gold = Math.round((t.gold[0] + rnd() * (t.gold[1] - t.gold[0])) * mul);
  const items: string[] = [];
  if (fixed && has(fixed)) items.push(fixed);
  const pool = t.items.filter(([id]) => has(id));
  const draws = fixed ? 0 : tier >= 3 ? 2 : 1;
  for (let k = 0; k < draws && pool.length; k++) {
    let r = rnd() * pool.reduce((a, [, w]) => a + w, 0);
    for (const [id, w] of pool) if ((r -= w) <= 0) {
      items.push(id);
      break;
    }
  }
  // Treasure Nose: now and then one more find.
  if (mul > 1.15 && pool.length && rnd() < mul - 1) items.push(pool[Math.floor(rnd() * pool.length)][0]);
  return { gold, items };
}

/** The loot every dungeon starts from (each dungeon adds its own finds). */
export function baseTable(extra: [string, number][][] = []): LootTable {
  const tiers: LootTable = [
    { gold: [25, 70], items: [['healthPotion', 4], ['manaPotion', 3], ['staminaPotion', 2], ['ironOre', 2], ['ironIngot', 2], ['coal', 2], ['leather', 2], ['dungeonRubbing', 1]] },
    { gold: [50, 120], items: [['healthPotion', 3], ['manaPotion', 2], ['ringVigor', 1], ['luckyCharm', 1], ['steelIngot', 2], ['silverOre', 1], ['hardenedLeather', 1], ['dungeonRubbing', 2], ['arrowIron', 1]] },
    { gold: [110, 220], items: [['knightSword', 1], ['kiteShield', 1], ['ringSage', 1], ['silverOre', 2], ['silversteelIngot', 1], ['silk', 1], ['dungeonRubbing', 2], ['greaterHealthPotion', 2]] },
    { gold: [220, 380], items: [['ringSage', 1], ['ringVigor', 1], ['silversteelIngot', 2], ['dungeonRubbing', 2], ['greaterHealthPotion', 2], ['luckyCharm', 1]] },
  ];
  extra.forEach((list, k) => tiers[k]?.items.push(...list));
  return tiers;
}
