import { add } from './kit';

// The White Mountains' goods (world/mountains): what keeps the cold off (a
// warm-stone charm, hold stew; the Highland Furs set is in sets.ts), what the
// Cold Vein gives up, and the keepsakes of the expedition's chain.

const T = (id: string, name: string, rarity: 'fine' | 'rare' | 'epic', lvl: number, desc: string, stats: Record<string, number>, fx: Record<string, number>, src: string[], s: Parameters<typeof add>[2]) =>
  add({ id, name, kind: 'accessory', slot: 'trinket', rarity, lvl, desc, stats, fx }, src, s);

T('warmstone', 'Warm-Stone Charm', 'fine', 4, 'A pebble of hearth-stone from a dwarf forge, in a copper cage. It never quite cools.', { maxStamina: 10 }, { warm: 0.5 }, ['shop:mountains', 'done:lantern-road'], { k: 'trinket', s: { kind: 'charm', metal: 'copper', color: '#ff8a3a', glow: '#ff6a1a', hang: 'stone' } });
T('frostpeakSigil', 'Frostpeak Sigil', 'rare', 14, 'King Durin\'s own sigil in gold and blue enamel: a mountain with a lantern on its peak. The holds open their doors to whoever wears it.', { maxHp: 30 }, { warm: 0.3, bane_construct: 0.1, shopDiscount: 0.05 }, ['done:kings-audience'], { k: 'trinket', s: { kind: 'badge', metal: 'gold', color: '#3a6ab0', accent: '#e8dcc0', glyph: 'mountain' } });
T('stoneveinBraid', 'Stonevein Beard-Ring', 'rare', 8, 'A copper ring from Bruni\'s own braid. Among dwarves, that is not a small thing.', { maxStamina: 15 }, { oreYield: 0.15, warm: 0.15 }, ['done:first-claim'], { k: 'trinket', s: { kind: 'ring', metal: 'copper', color: '#c8743a' } });

add({
  id: 'holdStew', name: 'Hold Stew', kind: 'consumable', rarity: 'common', stack: true, stats: { heal: 40 },
  desc: 'Mutton, barley and black beer, boiled until the spoon stands up. Warms you to the boots for ten minutes.',
  buff: { id: 'holdStew', label: 'Hold Stew', sec: 600, m: { warm: 0.7, staminaRegen: 0.1 } },
}, ['shop:mountains'], { k: 'food', s: { kind: 'stew', color: '#8a5a2a', accent: '#d8b070' } });

add({
  id: 'blackIronIngot', name: 'Black Iron Ingot', kind: 'material', rarity: 'rare', stack: true, stats: {},
  desc: 'Iron smelted from the Cold Vein. It is cold in your hand however long you hold it, and the dwarves will not let it into a forge.',
}, ['drop:coldVein'], { k: 'part', s: { kind: 'seal', color: '#2a2a32' } });

add({
  id: 'coldhandLedger', name: 'The Coldhand Ledger', kind: 'key', rarity: 'epic', stats: {},
  desc: 'Varga Coldhand\'s accounts, in a smuggler\'s cipher that is not very good. Black iron, by the cartload, shipped south from the Cold Vein. Every page is stamped with the same seal: an anvil with an eye.',
}, ['quest:cold-iron'], { k: 'paper', s: { kind: 'ledger', color: '#2a2a30', glyph: 'anvil' } });

add({
  id: 'trollHide', name: 'Troll Hide', kind: 'material', rarity: 'fine', stack: true, stats: {},
  desc: 'Grey hide as thick as a door, with moss still growing in the creases. The furriers of the holds pay well for it.',
}, ['drop:troll'], { k: 'part', s: { kind: 'trophy', color: '#6a6a5a' } });
