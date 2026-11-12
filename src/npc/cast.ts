import type { Look } from './charBuilder';

// The Elderglen cast (docs/ART-DIRECTION.md §7): each named character has a
// signature colour readable from 30 m away, and a garb of their own (the cut of
// their clothes and what they wear over them: npc/sculpt.ts builds it).
// Skin multiplies the painted base tone (white = as painted).

const SKIN = { fair: 0xfff0e6, light: 0xffffff, tan: 0xe0b894, brown: 0xa8744e, deep: 0x7a4e32 };
const HAIR = { black: 0x1f1a17, dark: 0x3a2618, brown: 0x6a4428, auburn: 0x8a3f22, ginger: 0xb0562a, blonde: 0xd2b26a, grey: 0xb8b4ae, white: 0xe6e2da };

/** The player's hero (art bible: sky blue). */
export const HERO: Look = { body: 'male', outfit: 'ranger', pauldron: true, bracers: true, hair: 'simpleparted', hairColor: HAIR.brown, cloth: 0x4f8fd0, linen: 0xefe6d2, skin: SKIN.light };

export const CAST: Record<string, Look> = {
  // Mentors
  // Kaela Voss, Gale Mentor: teal and white, light on her feet. A fitted tunic, a long white scarf
  // streaming behind, a white half-cape.
  kaela: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: HAIR.dark, cloth: 0x2f9e94, linen: 0xf2f2ee, skin: SKIN.light, bracers: true,
    garb: { cut: 'tunic', scarf: true, second: 0xf4f4f0, cloak: 'half', accent: 0xf2f2ee, trim: 0x2f9e94, sash: true } },
  // Ser Corvin, Boundary Mentor: gunmetal and deep red. A knight in plate, a red tabard, a red cloak.
  corvin: { body: 'male', outfit: 'ranger', pauldron: true, hair: 'simpleparted', beard: true, hairColor: HAIR.black, cloth: 0x8e2b2b, linen: 0x7d8590, skin: SKIN.fair,
    garb: { armour: true, metal: 0x626a73, tabard: true, cloak: 'full', accent: 0x8e2b2b, trim: 0xb89250, build: 1.08 } },
  // Master Veyr, Old Duelist: ochre and black. A close black tunic, an ochre sash and half-cape.
  veyr: { body: 'male', outfit: 'ranger', hair: 'buzzed', hairColor: HAIR.black, cloth: 0x2a2624, linen: 0x383330, skin: SKIN.deep,
    garb: { cut: 'tunic', sash: true, second: 0xc08a2e, cloak: 'half', accent: 0xc08a2e, trim: 0x1c1a18 } },
  // Magus Orren, Keeper of the Old Arts: violet. A long robe, a deeper mantle edged in gold, a grey beard to the chest.
  magus: { body: 'male', outfit: 'ranger', hood: true, beard: true, hair: null, hairColor: HAIR.grey, cloth: 0x6b4fa0, linen: 0xd9cfe8, skin: SKIN.tan,
    garb: { cut: 'robe', accent: 0x4a3578, trim: 0xc9a45c, longBeard: true } },
  // Merchants and townsfolk
  // Master Froest, Smith: ice blue and leather. A big man in a leather apron, a white beard.
  froest: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: HAIR.white, cloth: 0x8fb8d8, linen: 0xcfe2f0, skin: SKIN.fair,
    garb: { apron: 'leather', build: 1.14, longBeard: true, tallBoots: true } },
  innkeeper: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: HAIR.auburn, cloth: 0xa8553c, linen: 0xf0dcb8, skin: SKIN.light, garb: { sash: true, second: 0x6a3a2a } },
  apothecary: { body: 'female', outfit: 'ranger', hood: true, hair: null, cloth: 0x5f8a4a, linen: 0xe8e4c8, skin: SKIN.brown, garb: { cut: 'robe', accent: 0x44663a, trim: 0xd8c890, satchel: true } },
  baker: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: HAIR.blonde, cloth: 0xd9b56a, linen: 0xffffff, skin: SKIN.fair, garb: { hat: 'kerchief' } },
  tailor: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: HAIR.black, cloth: 0x8f6aa8, linen: 0xe8dcec, skin: SKIN.tan, garb: { sash: true, second: 0xe0c060 } },
  carpenter: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: HAIR.brown, cloth: 0x9a7a4a, linen: 0xc9a878, skin: SKIN.brown, garb: { apron: 'leather', build: 1.06 } },
  arcanist: { body: 'female', outfit: 'ranger', hood: true, hair: null, cloth: 0x4e62a8, linen: 0xdfe6f5, skin: SKIN.light, garb: { cut: 'robe', accent: 0x33427a, trim: 0xd9c070 } },
  stablemaster: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: HAIR.ginger, cloth: 0x7a8a4a, linen: 0xd8d0b0, skin: SKIN.fair, garb: { hat: 'straw', tallBoots: true } },
};

/** Generic villagers for crowds and ambient walkers. */
export const VILLAGERS: Look[] = [
  { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: HAIR.brown, linen: 0xe8d8b8, skin: SKIN.tan },
  { body: 'female', outfit: 'peasant', hair: 'long', hairColor: HAIR.blonde, linen: 0xc9dbe8, skin: SKIN.fair },
  { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: HAIR.black, linen: 0xd8c29a, skin: SKIN.deep },
  { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: HAIR.dark, linen: 0xe8c8c0, skin: SKIN.brown },
  { body: 'male', outfit: 'ranger', hair: 'simpleparted', hairColor: HAIR.auburn, cloth: 0x6a7f3a, skin: SKIN.light },
  { body: 'female', outfit: 'ranger', hair: 'long', hairColor: HAIR.brown, cloth: 0x8a5a3a, skin: SKIN.tan },
  { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: HAIR.grey, linen: 0xb8c4a0, skin: SKIN.fair },
  { body: 'female', outfit: 'peasant', hair: 'buzzedfemale', hairColor: HAIR.black, linen: 0xf0e0a8, skin: SKIN.deep },
];
