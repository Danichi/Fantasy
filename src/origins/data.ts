import type { Origin } from '../progression/progression';
import type { Hair } from '../npc/charBuilder';

// The six peoples you can be summoned as (docs/design/origins.md §3): what
// each one looks like in the character creator, the passives it always has,
// the innate V ability it starts with, and its legendary tree of five tiers
// that the Legendary Hero discipline opens one Renown level at a time.
// Pure data; origins/abilities.ts, flight.ts and forms.ts make it work.

export const ORIGIN_IDS: Origin[] = ['human', 'elf', 'dwarf', 'beastfolk', 'demon', 'dragonkin'];

export type Build = 'slim' | 'average' | 'broad';
export type Ears = 'none' | 'elf' | 'wolf' | 'cat';

/** Everything the character creator decides; saved, and used wherever the hero's body is built. */
export interface OriginLook {
  origin: Origin;
  name: string;
  body: 'male' | 'female';
  /** standing height in metres (within the origin's range) */
  height: number;
  build: Build;
  hair: Hair;
  beard: boolean;
  hairColor: number;
  skin: number;
  eyes: number;
  ears: Ears;
  /** horn style index into the origin's list; -1 for none */
  horns: number;
  tail: boolean;
  /** fur markings (beastfolk) or scale patches (dragonkin) */
  markings: boolean;
}

export interface TreeTier {
  id: string;
  name: string;
  /** actives go on V and the moves bar; passives are simply on */
  kind: 'active' | 'passive';
  text: string;
  cost?: { stamina?: number; mana?: number; hpPct?: number; energy?: number };
  /** cooldown in seconds */
  cd?: number;
}

export interface OriginDef {
  id: Origin;
  name: string;
  /** one line for the creator */
  line: string;
  passives: { name: string; text: string }[];
  /** the ability V fires before the first tier opens (the old origin abilities) */
  innate: TreeTier;
  tree: TreeTier[];
  homeland: string;
  look: {
    heights: [number, number];
    skins: number[];
    hair: number[];
    eyes: number[];
    /** eyes glow (demon, dragonkin) */
    glow?: boolean;
    ears: Ears[];
    /** names of horn styles (index = OriginLook.horns) */
    horns: string[];
    tail: 'none' | 'optional' | 'always';
    markings: 'none' | 'fur' | 'scales';
    wings?: boolean;
    builds: Build[];
    /** bone proportions on top of the build (charParts) */
    legs: number;
    limbs: number;
    shoulders: number;
    head: number;
  };
}

/** Renown needed for Legendary Hero levels 1 to 5. */
export const RENOWN_LEVELS = [5, 15, 30, 50, 80];

const HAIR_NATURAL = [0x1f1a17, 0x3a2618, 0x6a4428, 0x8a3f22, 0xb0562a, 0xd2b26a, 0xb8b4ae, 0xe6e2da];

export const ORIGINS: Record<Origin, OriginDef> = {
  human: {
    id: 'human', name: 'Human', line: 'Adaptable, stubborn, quick to learn: the people of Cresha.',
    passives: [
      { name: 'Heroic Adaptation', text: '+15% XP from every source; +1 tree point in each combat class every 5 character levels.' },
      { name: 'Second Wind', text: 'Once per fight, falling below 20% health restores 25%.' },
    ],
    innate: { id: 'heroicAdaptation', name: 'Heroic Adaptation', kind: 'active', text: 'Draw on your will: restore 22 mana and 22 stamina.', cd: 6 },
    tree: [
      { id: 'rally', name: 'Rally', kind: 'active', text: 'A war cry: for 20 s you and your allies and crew deal 15% more damage and take 10% less.', cost: { stamina: 25 }, cd: 45 },
      { id: 'heroResolve', name: "Hero's Resolve", kind: 'passive', text: 'Survive a lethal blow at 1 health. Once every 3 minutes.' },
      { id: 'banner', name: 'Banner of Cresha', kind: 'active', text: 'Plant a standard for 12 s: inside its circle you heal 3% a second, and enemies falter.', cost: { stamina: 30 }, cd: 50 },
      { id: 'unbroken', name: 'Unbroken', kind: 'active', text: 'For 12 s nothing can stagger you.', cost: { stamina: 20 }, cd: 40 },
      { id: 'legendAwakened', name: 'Legend Awakened', kind: 'active', text: 'For 20 s every stat rises (25% damage, speed and spell power, 25% less damage taken) and every class meter fills.', cost: { stamina: 40 }, cd: 180 },
    ],
    homeland: 'Cresha: you are standing in it.',
    look: { heights: [1.65, 1.9], skins: [0xfff0e6, 0xffffff, 0xe0b894, 0xa8744e, 0x7a4e32], hair: HAIR_NATURAL, eyes: [0x5a3a22, 0x3d6a9a, 0x4f7a3a, 0x6a6a6a], ears: ['none'], horns: [], tail: 'none', markings: 'none', builds: ['slim', 'average', 'broad'], legs: 1, limbs: 1, shoulders: 1, head: 1 },
  },
  elf: {
    id: 'elf', name: 'Elf', line: 'Long-lived, sharp-eyed children of the Verdant forest.',
    passives: [
      { name: 'Keen Sight', text: 'Herbs, hidden paths and secret doors glint within 20 m.' },
      { name: 'Sylvan Step', text: '+20% speed in forest regions.' },
      { name: 'Arcane Affinity', text: '+30% mana regeneration.' },
    ],
    innate: { id: 'elvenGrace', name: 'Elven Grace', kind: 'active', text: 'A breath of old magic: restore 30 mana.', cd: 8 },
    tree: [
      { id: 'moonveil', name: 'Moonveil', kind: 'active', text: 'Fade from sight for 4 s: enemies lose you. Attacking breaks the veil.', cost: { mana: 25 }, cd: 30 },
      { id: 'starlightVolley', name: 'Starlight Volley', kind: 'active', text: 'Five homing motes of starlight seek the nearest enemies.', cost: { mana: 30 }, cd: 12 },
      { id: 'treeshape', name: 'Treeshape', kind: 'active', text: 'Root yourself for 6 s: you cannot move, take 40% less damage and heal 30% of your health.', cost: { mana: 35 }, cd: 40 },
      { id: 'windWalker', name: 'Wind-Walker', kind: 'passive', text: 'You never take harm from a fall, and dodge in mid-air to dash.' },
      { id: 'grace', name: 'Grace of the Ancients', kind: 'active', text: 'For 10 s every dodge is a blink that leaves a damaging afterimage.', cost: { mana: 50 }, cd: 120 },
    ],
    homeland: 'The Verdant Elves: the Elven Sanctum in the great forest north of Cresha.',
    look: { heights: [1.75, 1.95], skins: [0xfff6f0, 0xf0ece6, 0xe6eef0, 0xd8c8b0, 0xb8a090], hair: [0xf2ead0, 0xd2b26a, 0xe6e2da, 0x2a2420, 0x8a3f22, 0x6a7a9a], eyes: [0x4f9a6a, 0x6aa0d0, 0xa080c0, 0xc0a040], ears: ['elf'], horns: [], tail: 'none', markings: 'none', builds: ['slim', 'average'], legs: 1.06, limbs: 1.04, shoulders: 0.95, head: 0.97 },
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf', line: 'Stout, tireless smiths and miners of the White and Deep Mountains.',
    passives: [
      { name: 'Stoneblood', text: '+25% poise, and poison cannot take hold of you.' },
      { name: 'Deep Sense', text: 'Ore veins and gems glint through rock within 30 m.' },
      { name: 'Forgemaster', text: 'Gear you craft has a 15% chance to come out one quality tier higher.' },
    ],
    innate: { id: 'stubborn', name: 'Stubborn', kind: 'active', text: 'Dig in: restore 35 stamina and stand firm against staggers for 3 s.', cd: 8 },
    tree: [
      { id: 'bulwark', name: 'Earthen Bulwark', kind: 'active', text: 'Raise a stone dome for 8 s that stops arrows, bolts and spells from outside it.', cost: { stamina: 30 }, cd: 35 },
      { id: 'mountainsWrath', name: "Mountain's Wrath", kind: 'active', text: 'Slam the ground: heavy damage around you and enemies are thrown off their feet.', cost: { stamina: 35 }, cd: 14 },
      { id: 'runeheart', name: 'Runeheart', kind: 'passive', text: 'One rune on your armour works twice as hard. Until you carry runes, your armour turns 10% more damage.' },
      { id: 'delversEndurance', name: "Delver's Endurance", kind: 'passive', text: 'Sprinting underground costs no stamina.' },
      { id: 'heartOfMountain', name: 'Heart of the Mountain', kind: 'active', text: 'For 6 s your skin is living stone: no damage, no stagger.', cost: { stamina: 40 }, cd: 120 },
    ],
    homeland: 'The White and Deep Mountains: the Deep Hold.',
    look: { heights: [1.35, 1.55], skins: [0xffe0d0, 0xf0c0a8, 0xe0a888, 0xc08868, 0x8a5a40], hair: HAIR_NATURAL, eyes: [0x5a3a22, 0x3d6a9a, 0x6a6a6a, 0x4f7a3a], ears: ['none'], horns: [], tail: 'none', markings: 'none', builds: ['average', 'broad'], legs: 0.84, limbs: 0.95, shoulders: 1.12, head: 1.06 },
  },
  beastfolk: {
    id: 'beastfolk', name: 'Beastfolk', line: 'Wolf- and cat-blooded hunters of the wild places.',
    passives: [
      { name: 'Feral Senses', text: 'Nearby beasts show to you; the dark is lighter.' },
      { name: 'Pounce', text: 'Your sprint attack becomes a long leap.' },
      { name: 'Swift Paws', text: '+12% sprint speed.' },
    ],
    innate: { id: 'wildSprint', name: 'Wild Sprint', kind: 'active', text: 'The blood quickens: +25% speed and 30 stamina for 5 s.', cd: 12 },
    tree: [
      { id: 'huntersMark', name: "Hunter's Mark", kind: 'active', text: 'Mark your target for 20 s: it takes 20% more damage from you.', cost: { stamina: 15 }, cd: 10 },
      { id: 'savageHowl', name: 'Savage Howl', kind: 'active', text: 'Enemies within 9 m break and flee for 4 s.', cost: { stamina: 25 }, cd: 30 },
      { id: 'packCall', name: 'Pack Call', kind: 'active', text: 'Two spirit wolves fight beside you for 30 s.', cost: { stamina: 35 }, cd: 60 },
      { id: 'bloodscent', name: 'Bloodscent', kind: 'passive', text: 'Wounded enemies show through walls within 30 m.' },
      { id: 'primalRage', name: 'Primal Rage', kind: 'active', text: 'For 20 s claws replace your weapon: +30% speed, and every strike feeds you.', cost: { stamina: 40 }, cd: 120 },
    ],
    homeland: 'The Deep Wilderness, far to the south-west; a beastfolk camp in the Wildlands until then.',
    look: { heights: [1.7, 1.95], skins: [0xfff0e6, 0xe0b894, 0xa8744e, 0x7a4e32, 0xd8c0a0], hair: [0x3a2618, 0x6a4428, 0xb0562a, 0xb8b4ae, 0x1f1a17, 0xe6e2da], eyes: [0xd0a020, 0x6aa040, 0xe08020, 0x80b0d0], ears: ['wolf', 'cat'], horns: [], tail: 'always', markings: 'fur', builds: ['slim', 'average', 'broad'], legs: 1.02, limbs: 1.02, shoulders: 1.02, head: 1 },
  },
  demon: {
    id: 'demon', name: 'Demon', line: 'Horned, hot-blooded exiles of the Demon Continent.',
    passives: [
      { name: 'Demonic Regeneration', text: 'You heal 1% of your health every second, in and out of combat.' },
      { name: 'Darkvision', text: 'The dark is lighter to you.' },
      { name: 'Infernal Affinity', text: '40% less damage from fire and shadow.' },
    ],
    innate: { id: 'bloodRush', name: 'Blood Rush', kind: 'active', text: 'Your blood runs hot: heal 8% of your health over 2.5 s and restore 30 stamina.', cd: 5.5 },
    tree: [
      { id: 'hellstep', name: 'Hellstep', kind: 'active', text: 'Step through the fire: a 7 m teleport dash that burns everything you pass through.', cost: { stamina: 20 }, cd: 6 },
      { id: 'bloodAwakening', name: 'Blood Awakening', kind: 'active', text: 'Pay 15% of your health: +40% damage for 10 s.', cost: { hpPct: 15 }, cd: 25 },
      { id: 'demonicHide', name: 'Demonic Hide', kind: 'passive', text: 'Your hide hardens as you bleed: up to 40% less damage taken as your health falls.' },
      { id: 'brimstone', name: 'Brimstone Aura', kind: 'passive', text: 'Enemies within 3.5 m of you catch fire.' },
      { id: 'demonForm', name: 'Demon Form', kind: 'active', text: 'For 25 s you take your true form: 2.4 m tall, wreathed in fire, with a heavy new moveset.', cost: { hpPct: 10 }, cd: 150 },
    ],
    homeland: 'The Demon Continent, beyond Ashen Port.',
    look: { heights: [1.75, 2.0], skins: [0xd05040, 0xa83a30, 0x8a8a90, 0x5a6070, 0x7a3a5a], hair: [0x1f1a17, 0x2a2430, 0xe6e2da, 0x8a1a1a, 0x3a2618], eyes: [0xff7a20, 0xffd040, 0xff3030, 0xc060ff], glow: true, ears: ['none'], horns: ['Ram', 'Spire', 'Swept', 'Crown'], tail: 'optional', markings: 'none', builds: ['slim', 'average', 'broad'], legs: 1.02, limbs: 1.02, shoulders: 1.04, head: 1 },
  },
  dragonkin: {
    id: 'dragonkin', name: 'Dragonkin', line: 'Scaled, winged heirs of the dragons of the high eyries.',
    passives: [
      { name: 'Innate Fire Resistance', text: '50% less damage from fire.' },
      { name: 'Draconic Physique', text: '+10% health and poise.' },
      { name: 'Dragon Senses', text: 'Lock-on reaches 30% further.' },
    ],
    innate: { id: 'dragonBreath', name: 'Dragon Breath', kind: 'active', text: 'A short gout of flame in a 6.5 m cone.', cd: 4.5 },
    tree: [
      { id: 'glide', name: 'Glide', kind: 'passive', text: 'Hold jump (C) while falling to spread your wings and glide, steering with the camera. Drains Draconic Energy.' },
      { id: 'wingBurst', name: 'Wing Burst', kind: 'passive', text: 'Press jump while gliding: one great flap climbs 6 m (three in a row at most). 20 energy a flap.' },
      { id: 'trueFlight', name: 'True Flight', kind: 'passive', text: 'Hold jump in the air to keep flapping: climb, hover and fly where you look. Energy drains steadily and comes back on the ground.' },
      { id: 'descent', name: "Dragon's Descent", kind: 'passive', text: 'Attack while flying: dive onto your target and strike everything around where you land. 30 energy.' },
      { id: 'fireBreath', name: 'Fire Breath', kind: 'active', text: 'Hold V: a channelled cone of fire 9 m long that sets enemies burning, on the ground or in the air. Drains energy while held.', cost: { energy: 10 }, cd: 1 },
    ],
    homeland: "The upper White Mountains: the dragons' old eyries.",
    look: { heights: [1.8, 2.0], skins: [0xc0d0a0, 0x9ab0c8, 0xd0a080, 0x80a090, 0xb07060], hair: [0x1f1a17, 0xe6e2da, 0x8a3f22, 0x2a3a5a, 0xd2b26a], eyes: [0xffc020, 0xff8020, 0x60e0a0, 0xa0d0ff], glow: true, ears: ['none'], horns: ['Swept', 'Crown', 'Twin'], tail: 'always', markings: 'scales', wings: true, builds: ['average', 'broad'], legs: 1.02, limbs: 1.02, shoulders: 1.05, head: 1 },
  },
};

/** A sensible starting look for an origin (the creator opens on it; old saves get it). */
export function defaultLook(origin: Origin, body: 'male' | 'female' = 'male'): OriginLook {
  const L = ORIGINS[origin].look;
  const mid = Math.round(((L.heights[0] + L.heights[1]) / 2) * 100) / 100;
  return {
    origin, name: 'Hero', body,
    height: origin === 'human' ? 1.8 : mid,
    build: L.builds.includes('average') ? 'average' : L.builds[0],
    hair: origin === 'dwarf' ? 'buzzed' : body === 'female' ? 'long' : 'simpleparted',
    beard: origin === 'dwarf',
    hairColor: origin === 'human' ? 0x6a4428 : L.hair[0],
    skin: origin === 'human' ? 0xffffff : L.skins[0],
    eyes: L.eyes[0],
    ears: L.ears[0],
    horns: L.horns.length ? 0 : -1,
    tail: L.tail !== 'none',
    markings: L.markings !== 'none',
  };
}

/** Make a saved or typed look safe: unknown fields fall back to the origin's defaults. */
export function cleanLook(raw: Partial<OriginLook> | undefined, origin: Origin): OriginLook {
  const d = defaultLook(origin, raw?.body === 'female' ? 'female' : 'male');
  if (!raw) return d;
  const L = ORIGINS[origin].look;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const hairOk = ['long', 'buns', 'buzzed', 'buzzedfemale', 'simpleparted', null];
  return {
    origin,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 24) : d.name,
    body: d.body,
    height: Math.min(L.heights[1], Math.max(L.heights[0], num(raw.height, d.height))),
    build: raw.build && L.builds.includes(raw.build) ? raw.build : d.build,
    hair: hairOk.includes(raw.hair as never) ? (raw.hair as Hair) : d.hair,
    beard: typeof raw.beard === 'boolean' ? raw.beard : d.beard,
    hairColor: num(raw.hairColor, d.hairColor),
    skin: num(raw.skin, d.skin),
    eyes: num(raw.eyes, d.eyes),
    ears: raw.ears && L.ears.includes(raw.ears) ? raw.ears : d.ears,
    horns: L.horns.length ? Math.max(-1, Math.min(L.horns.length - 1, Math.round(num(raw.horns, d.horns)))) : -1,
    tail: L.tail === 'always' ? true : L.tail === 'none' ? false : raw.tail !== false,
    markings: L.markings === 'none' ? false : raw.markings !== false,
  };
}

const NAMES: Record<Origin, string[]> = {
  human: ['Aldric', 'Mara', 'Tomas', 'Elsbeth', 'Corwin', 'Hilde', 'Bram', 'Rosalind'],
  elf: ['Aelindra', 'Thalion', 'Sylvara', 'Elaren', 'Miriel', 'Caelan', 'Ithil', 'Lorien'],
  dwarf: ['Thorin', 'Brunhild', 'Durgan', 'Helga', 'Borin', 'Dagny', 'Grimli', 'Kettla'],
  beastfolk: ['Fenn', 'Ravka', 'Tarrow', 'Lyx', 'Grael', 'Sable', 'Whisker', 'Rhuun'],
  demon: ['Azrakel', 'Vexa', 'Morroth', 'Ilsabeth', 'Kharn', 'Nyx', 'Zarael', 'Cindra'],
  dragonkin: ['Vaelthor', 'Syrrah', 'Kaedros', 'Ithrael', 'Drakon', 'Zyra', 'Orvex', 'Tamsyn'],
};
export function randomName(origin: Origin, rnd = Math.random) {
  const list = NAMES[origin];
  return list[Math.floor(rnd() * list.length)];
}

/**
 * How people react to you (§3 notes): a line the first time someone speaks to
 * you, by the faction of the region you're in, and a price nudge where your
 * people are liked (cheaper) or feared (dearer).
 */
export const REACTIONS: Partial<Record<Origin, { lines: Partial<Record<string, string>>; prices: Partial<Record<string, number>> }>> = {
  elf: {
    lines: {
      cresha: '(They look twice at your ears.) "An elf, this far south? The forest folk don\'t often walk our roads."',
      merchants: '"Elven custom! Your people pay in silver and patience. I like both."',
      elves: '"Aiya, sibling of the leaves. Welcome home." (They greet you in the old tongue.)',
      pirates: '"Pointy ears. You lot can see a sail at twenty miles, they say. Want work?"',
    },
    prices: { merchants: 0.97, elves: 0.9, dwarves: 1.05 },
  },
  dwarf: {
    lines: {
      cresha: '"A dwarf! Mind the doorframe. Ha, no, you\'re fine."',
      merchants: '"You\'ll want to haggle, I suppose. Your folk always do. Fine: a fair price, first time."',
      dwarves: '"Stone keep you, cousin. We don\'t haggle with our own."',
      knights: '"Dwarf-forged armour, is that? The armourers here would give a year\'s wage to see it close."',
    },
    prices: { merchants: 0.95, dwarves: 0.9, elves: 1.05 },
  },
  beastfolk: {
    lines: {
      cresha: '(A dog barks at you, then wags.) "Don\'t mind him. He thinks you\'re family."',
      merchants: '"Wild folk at my stall. Keep your claws off the cloth, friend, and we\'ll get on."',
      wildTribes: '"The pack sees you. Hunt well."',
      pirates: '"A beastfolk! Good nose for a storm, your kind. Sit, sit."',
    },
    prices: { merchants: 1.03, wildTribes: 0.9 },
  },
  demon: {
    lines: {
      cresha: '(Their hand goes to a charm at their neck.) "We\'ve no trouble here, horned one. None at all."',
      knights: '(The guard eyes your horns.) "Walk careful in the Crown\'s streets, demon. Careful."',
      merchants: '"Coin is coin, even if it\'s warm. Prices are a little higher for... insurance."',
      demons: '"You\'ve come a long way from the ash, kin."',
      pirates: '"A demon aboard brings luck or storms, sailors say. Which are you?"',
    },
    prices: { cresha: 1.06, merchants: 1.05, knights: 1.08, demons: 0.9, pirates: 0.97 },
  },
  dragonkin: {
    lines: {
      cresha: '(They stare at your wings.) "Old stories walk again. Welcome, I think."',
      merchants: '"Dragonkin! I\'ll ask you to keep the fire off the canvas, if it\'s all the same."',
      pirates: '"Keep that fire off the canvas and the powder, and you can sail with any crew in the port."',
      dwarves: '"The eyries remember your people, wingborn. Not all of it fondly."',
    },
    prices: { merchants: 1.02, pirates: 0.97 },
  },
};
