import { add, recipe } from './kit';
import { named } from './templates';
for (const [id, name, color, desc] of [
  ['elfHeartwood', 'Fallen Heartwood', '#94734f', 'Sacred heartwood gathered from permitted deadfall. The living trees remain standing.'],
  ['elfIronbark', 'Fallen Ironbark', '#8eaa95', 'Dense silver bark gathered from permitted deadfall, never from the living sacred trees.'],
  ['elfSpiritAmber', 'Spirit Amber', '#c5dca0', 'Ancient resin holding the memory of a forest spirit.'],
  ['elfMoonblossom', 'Moonblossom', '#a4cfea', 'A flower that opens only beneath the moon.'],
] as const)
  add({ id, name, kind: 'material', rarity: 'rare', stack: true, stats: {}, desc }, ['quest:elven', 'elves'], { k: 'part', s: { kind: 'trophy', color } });
for (const [id, name, desc] of [
  ['elfGuideToken', 'Guide’s Token', 'A permanent welcome to the hidden trails. Your earned guidance remains even if this keepsake is stored.'],
  ['elfStarChart', 'Starfall Chart', 'The sky before the first Turning, pointing beneath the mountains and across the desert.'],
] as const)
  add({ id, name, kind: 'key', rarity: 'rare', stats: {}, desc }, ['elves'], { k: 'part', s: { kind: 'trophy', color: '#a8d6ce' } });
add(
  {
    id: 'elfStarward',
    name: 'Starward of the Living Bough',
    kind: 'accessory',
    slot: 'trinket',
    rarity: 'epic',
    lvl: 35,
    stats: { maxHp: 65, maxMana: 55, maxStamina: 25 },
    fx: { castSpeed: 0.05 },
    desc: 'Living silverwood around a fallen star. The temple has not forgotten its first keeper.',
  },
  ['elves'],
  { k: 'trinket', s: { kind: 'charm', metal: 'silver', color: '#87cfbd', hang: 'stone' } }
);
add(
  {
    id: 'elfTrailRation',
    name: 'Silverleaf Trail Ration',
    kind: 'consumable',
    rarity: 'fine',
    stack: true,
    stats: { heal: 75 },
    desc: 'Nuts, pressed berries and honey wrapped in a silver leaf.',
  },
  ['elves'],
  { k: 'part', s: { kind: 'trophy', color: '#7fa872' } }
);
recipe(
  'elfStarward',
  'workbench',
  'jewelcrafting',
  30,
  [
    ['elfHeartwood', 3],
    ['elfIronbark', 3],
    ['elfSpiritAmber', 4],
    ['silverIngot', 2],
  ],
  'basic'
);
recipe(
  'elfTrailRation',
  'kitchen',
  'cooking',
  15,
  [
    ['rawMeat', 1],
    ['wildmint', 2],
  ],
  'basic',
  { n: 3 }
);
add(
  {
    id: 'elfMoonDraught',
    name: 'Moonblossom Draught',
    kind: 'consumable',
    rarity: 'rare',
    stack: true,
    stats: { restoreMana: 100 },
    desc: 'Moonblossom steeped around a grain of spirit amber.',
  },
  ['elves']
);
recipe(
  'elfMoonDraught',
  'alchemy',
  'herbalism',
  20,
  [
    ['elfMoonblossom', 2],
    ['elfSpiritAmber', 1],
  ],
  'basic'
);
add({ id: 'elfStarKey', name: 'Starfall Observatory Key', kind: 'key', rarity: 'rare', stats: {}, desc: 'The silver key to the temple observatory.' }, ['elves']);

named(
  {
    id: 'elfSilverboughBow',
    name: 'Silverbough Moonbow',
    t: 'bow',
    tier: 5,
    desc: 'Faelan’s silver-limbed design, carved from fallen heartwood and strung beneath the World Tree.',
    s: { crit: 0.06 },
    fx: { bane_beast: 0.12 },
  },
  ['quest:elven', 'fshop:elven']
);
recipe(
  'elfSilverboughBow',
  'workbench',
  'smithing',
  24,
  [
    ['elfHeartwood', 5],
    ['elfIronbark', 3],
    ['elfSpiritAmber', 2],
  ],
  'basic'
);

add(
  { id: 'elfTrailJournal', name: 'Eryndis’s Trail Journal', kind: 'key', rarity: 'rare', stats: {}, desc: 'A hunter’s account of the blighted pack and the lantern road home.' },
  ['elves'],
  { k: 'paper', s: { kind: 'ledger', color: '#6a9075', glyph: 'star' } }
);
