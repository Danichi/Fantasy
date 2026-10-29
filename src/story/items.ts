import type { ItemDef } from '../items/itemDefs';

// What the main story puts in your hands.
export const STORY_ITEMS: Record<string, ItemDef> = {
  sunwheelSpoke: {
    id: 'sunwheelSpoke', name: 'A Spoke of the Sunwheel', kind: 'key', rarity: 'epic', stack: true, stats: {},
    desc: 'A bent ray of old gold as long as your forearm, warm as a hand. Each of the Dawn\'s champions carried one. The wheel on the hill above Elder Glen has empty sockets for them.',
  },
  blackIronBox: {
    id: 'blackIronBox', name: 'The Black Iron Box', kind: 'key', rarity: 'epic', stats: {},
    desc: 'The box Grukk dug out from under the crypt for Ser Malric. Black iron, cold as a well. The Sunwheel is cut into the lid. Inside, wrapped in rotted silk: a spoke.',
  },
  hallamsSeal: {
    id: 'hallamsSeal', name: 'Ser Hallam\'s Seal', kind: 'accessory', slot: 'trinket', rarity: 'epic', stats: { maxHp: 30, poise: 4 },
    desc: 'A knight\'s seal ring with the Sunwheel on it, from the cairn at Harrow Ford. Ser Corvin left it there forty years ago. He said it was never his to wear.',
  },
};
