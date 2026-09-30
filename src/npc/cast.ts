import type { Look } from './charBuilder';

// The Elderglen cast (docs/ART-DIRECTION.md §7): each named character is built
// from the Quaternius kits with a signature colour readable from 30 m away.
// Skin multiplies the painted base tone (white = as painted).

const SKIN = { fair: 0xfff0e6, light: 0xffffff, tan: 0xe0b894, brown: 0xa8744e, deep: 0x7a4e32 };
const HAIR = { black: 0x1f1a17, dark: 0x3a2618, brown: 0x6a4428, auburn: 0x8a3f22, ginger: 0xb0562a, blonde: 0xd2b26a, grey: 0xb8b4ae, white: 0xe6e2da };

/** The player's hero (art bible: sky blue). */
export const HERO: Look = { body: 'male', outfit: 'ranger', pauldron: true, bracers: true, hair: 'simpleparted', hairColor: HAIR.brown, cloth: 0x4f8fd0, linen: 0xefe6d2, skin: SKIN.light };

export const CAST: Record<string, Look> = {
  // Mentors
  kaela: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: HAIR.dark, cloth: 0x2f9e94, linen: 0xf2f2ee, skin: SKIN.light, bracers: true },
  corvin: { body: 'male', outfit: 'ranger', pauldron: true, hair: 'simpleparted', beard: true, hairColor: HAIR.black, cloth: 0x8e2b2b, linen: 0x7d8590, skin: SKIN.fair },
  veyr: { body: 'male', outfit: 'ranger', pauldron: true, hair: 'buzzed', hairColor: HAIR.black, cloth: 0xc08a2e, linen: 0x2e2a26, skin: SKIN.deep },
  magus: { body: 'male', outfit: 'ranger', hood: true, beard: true, hair: null, hairColor: HAIR.grey, cloth: 0x6b4fa0, linen: 0xd9cfe8, skin: SKIN.tan },
  // Merchants and townsfolk
  froest: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: HAIR.white, linen: 0x9fc4e0, skin: SKIN.fair },
  innkeeper: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: HAIR.auburn, linen: 0xf0dcb8, skin: SKIN.light },
  apothecary: { body: 'female', outfit: 'ranger', hood: true, hair: null, cloth: 0x5f8a4a, linen: 0xe8e4c8, skin: SKIN.brown },
  baker: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: HAIR.blonde, linen: 0xffffff, skin: SKIN.fair },
  tailor: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: HAIR.black, linen: 0xb88fc0, skin: SKIN.tan },
  carpenter: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: HAIR.brown, linen: 0xc9a878, skin: SKIN.brown },
  arcanist: { body: 'female', outfit: 'ranger', hood: true, hair: null, cloth: 0x4e62a8, linen: 0xdfe6f5, skin: SKIN.light },
  stablemaster: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: HAIR.ginger, linen: 0x9aa56e, skin: SKIN.fair },
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
