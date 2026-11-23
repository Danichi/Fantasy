import { add, recipe } from './kit';

for (const [id, name, color, desc] of [
  ['islandPearl', 'Lagoon Pearl', '#d9f0df', "A living pearl gathered in the Azure lagoons, rather than bought in a trader's sack."],
  ['islandHeartwood', 'Rain-Isle Heartwood', '#6ca471', 'Resin-scented heartwood cut from fallen island trees. The grovekeepers mark each piece.'],
  ['islandSalvage', 'Blackwake Salvage', '#9f7972', "Sound fittings and worked silver recovered from the wreckers' shore camps."],
  ['islandTideglass', 'Wheel-Cut Tideglass', '#78b7ca', 'Blue glass from the drowned sanctuaries. Old letters move inside it when the tide turns.'],
  ['islandAshSilk', 'Ember-Spun Silk', '#b25d49', "Heat-dark silk traded by the exiles outside Ashen Port's inland gate."],
] as const)
  add({ id, name, kind: 'material', rarity: 'rare', stack: true, stats: {}, desc }, ['islands'], { k: 'part', s: { kind: 'trophy', color } });
for (const [id, name, lvl, color, stats, fx, desc] of [
  [
    'lagoonHeart',
    'Heart of the Lagoon',
    24,
    '#65c5c7',
    { maxHp: 45, maxStamina: 20 },
    { heal: 0.08 },
    "A pearl set in a reef-keeper's silver wheel. It remembers the clear water before the raiders came.",
  ],
  [
    'grovekeepersSeal',
    'Seal of the Rain Grove',
    29,
    '#66a776',
    { maxMana: 45, maxStamina: 20 },
    { moveSpeed: 0.04 },
    'Living heartwood in a copper seal. The island paths seem shorter when you carry it.',
  ],
  [
    'freeHarboursMark',
    'Mark of the Free Harbours',
    35,
    '#b47755',
    { maxHp: 60, maxStamina: 25 },
    { crit: 0.04 },
    "The shore captains' broken chain, forged into a badge. No ship owns the people who sail it.",
  ],
  [
    'keepersTidewheel',
    "The Keeper's Tidewheel",
    41,
    '#83cada',
    { maxMana: 70, maxHp: 35 },
    { castSpeed: 0.06 },
    "A wheel cut the right way round, brought up from the first keepers' drowned archive.",
  ],
  [
    'fourSeasCompass',
    'Compass of the Four Seas',
    30,
    '#d4bb77',
    { maxStamina: 40 },
    { moveSpeed: 0.05 },
    'Four shells, four bearings, and the names of the people who helped you find your way.',
  ],
] as const)
  add({ id, name, kind: 'accessory', slot: 'trinket', rarity: 'epic', lvl, stats, fx, desc }, ['islands'], {
    k: 'trinket',
    s: { kind: 'charm', metal: 'silver', color, hang: 'stone' },
  });
add(
  {
    id: 'islandTrailRation',
    name: 'Island Trail Ration',
    kind: 'consumable',
    rarity: 'fine',
    stack: true,
    stats: { heal: 65 },
    desc: 'Smoked meat, dried fruit and a twist of spiced bread. Keeps your legs under you on a long island trail.',
    buff: { id: 'islandTrailRation', label: 'Island Trail Ration', sec: 600, m: { staminaRegen: 0.12 } },
  },
  ['shop:islands'],
  { k: 'food', s: { kind: 'meat', color: '#ac7b45' } }
);
add(
  {
    id: 'keepersRubbing',
    name: 'Rubbing of the First Turning',
    kind: 'key',
    rarity: 'epic',
    stats: {},
    desc: "The drowned archive's record of the first wheel-cutters: four harbours, four lights, one turning. The Dawn's mark predates the Crown.",
  },
  ['islands'],
  { k: 'paper', s: { kind: 'ledger', color: '#608c9c', glyph: 'wheel' } }
);
add(
  {
    id: 'ashenHarbourWrit',
    name: 'Writ of the Ash Harbour',
    kind: 'key',
    rarity: 'rare',
    stats: {},
    desc: "Vashka's seal permits a visitor to trade and shelter under the harbour truce. The inland gate has its own laws.",
  },
  ['islands'],
  { k: 'paper', s: { kind: 'ledger', color: '#8a443b', glyph: 'seal' } }
);
recipe(
  'lagoonHeart',
  'workbench',
  'jewelcrafting',
  18,
  [
    ['islandPearl', 5],
    ['silverIngot', 2],
  ],
  'basic'
);
recipe(
  'grovekeepersSeal',
  'workbench',
  'jewelcrafting',
  22,
  [
    ['islandHeartwood', 5],
    ['silverIngot', 2],
  ],
  'basic'
);
recipe(
  'freeHarboursMark',
  'workbench',
  'jewelcrafting',
  25,
  [
    ['islandSalvage', 6],
    ['silverIngot', 2],
  ],
  'basic'
);
recipe(
  'keepersTidewheel',
  'workbench',
  'jewelcrafting',
  28,
  [
    ['islandTideglass', 6],
    ['silverIngot', 2],
  ],
  'basic'
);
recipe(
  'islandTrailRation',
  'kitchen',
  'cooking',
  12,
  [
    ['rawMeat', 1],
    ['wildmint', 1],
  ],
  'basic',
  { n: 3 }
);
