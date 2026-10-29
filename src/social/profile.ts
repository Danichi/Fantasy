import { mulberry32 } from '../core/math';

// Who an NPC is (NPC overhaul, phase 2): traits, a way of speaking, likes and
// dislikes, the people they're tied to, something they want and something they
// hide. Ordinary townsfolk are rolled from their id (the same person every
// game); named characters are written by hand in social/cast.ts and override
// whatever the roll would have given.

/** Personality on -1..1 axes. */
export interface Traits {
  /** cold (-1) .. warm (1) */
  warmth: number;
  /** timid .. brave */
  courage: number;
  /** sly .. honest */
  honesty: number;
  /** generous .. greedy */
  greed: number;
  /** dour .. funny */
  humor: number;
  /** worldly .. pious */
  piety: number;
  /** patient .. hot-tempered */
  temper: number;
}

/** How they talk. */
export type Voice = 'folksy' | 'gruff' | 'formal' | 'flowery' | 'blunt' | 'nervous' | 'cheery';

/** What gifts are made of, for likes and dislikes. */
export type GiftKind = 'food' | 'sweets' | 'drink' | 'flowers' | 'herbs' | 'coin' | 'weapons' | 'books' | 'trinkets' | 'gems' | 'tools' | 'fish' | 'potions';

export type Bond = 'spouse' | 'sibling' | 'parent' | 'child' | 'friend' | 'rival' | 'sweetheart' | 'mentor';

export interface Tie {
  id: string;
  bond: Bond;
}

export interface Profile {
  id: string;
  name: string;
  first: string;
  job: string;
  settlement: string;
  traits: Traits;
  voice: Voice;
  likes: GiftKind[];
  dislikes: GiftKind[];
  /** topics they light up about, and ones that sour them */
  loves?: string[];
  ties: Tie[];
  /** what they want, said in their own words */
  want: string;
  /** what they hide (told only to friends) */
  secret: string;
  /** a line about themselves */
  about: string;
  /** can't die (story and quest characters): a beating only knocks them down */
  essential: boolean;
  /** a child (never fought, never threatened without a heavy price) */
  child: boolean;
  /** how they feel about you before you've said a word (-30..30) */
  firstImpression: number;
  /** the guard (they answer crimes with steel) */
  guard: boolean;
  /** hit points when struck (townsfolk are not fighters) */
  hp: number;
}

const VOICES: Voice[] = ['folksy', 'gruff', 'formal', 'flowery', 'blunt', 'nervous', 'cheery'];
const GIFTS: GiftKind[] = ['food', 'sweets', 'drink', 'flowers', 'herbs', 'coin', 'weapons', 'books', 'trinkets', 'gems', 'tools', 'fish', 'potions'];

/** What a job leans toward (likes come mostly from here). */
const JOB_LIKES: Record<string, GiftKind[]> = {
  farmer: ['food', 'tools', 'drink'], merchant: ['coin', 'gems', 'trinkets'], guard: ['weapons', 'drink', 'food'], child: ['sweets', 'trinkets', 'flowers'],
  elder: ['books', 'herbs', 'flowers'], miller: ['food', 'tools'], smith: ['tools', 'weapons', 'gems'], innfolk: ['drink', 'food', 'coin'],
  shepherd: ['food', 'herbs'], weaver: ['flowers', 'trinkets'], sailor: ['drink', 'fish', 'coin'], fisher: ['fish', 'drink'], noble: ['gems', 'books', 'drink'],
  priest: ['books', 'flowers', 'herbs'], scholar: ['books', 'potions'], dockhand: ['drink', 'food'], herbalist: ['herbs', 'flowers', 'potions'],
};
const JOB_WANTS: Record<string, string[]> = {
  farmer: ['A dry week at harvest. Just one.', 'A second plough horse before the spring.', 'To see my boy take the farm over and not sell it.'],
  merchant: ['A stall on the Capital\'s high market.', 'One caravan that arrives on time with nothing missing.', 'To pay off my brother\'s debts and be done with him.'],
  guard: ['A quiet watch. Every guard wants that and none of us gets it.', 'Sergeant\'s stripes before I\'m forty.', 'To find out who\'s been cutting the pen fences.'],
  child: ['A real sword. A sharp one!', 'To see a dragon. A small one, so it doesn\'t eat me.', 'To go to the Capital and see the king.'],
  elder: ['To see the valley at peace before I go.', 'Someone to take up my chronicle of the Glen.', 'One more harvest festival with all my grandchildren there.'],
  miller: ['A new millstone. This one\'s a hand thinner every year.', 'Less flour in my lungs.'],
  smith: ['Good ore. Real ore, not the slag the caravans sell.', 'To forge one blade worth a song.', 'An apprentice who listens.'],
  innfolk: ['A full house every night and no fights.', 'To brew an ale they talk about in the Capital.'],
  shepherd: ['Not to lose another lamb to the wolves.', 'A good dog. My old Bess is going grey.'],
  weaver: ['Dye that doesn\'t run. Blue that stays blue.', 'To weave a banner for the festival.'],
  default: ['A bit of peace and a bit of coin. In that order.', 'To see the sea once.', 'To be left alone, mostly.'],
};
const SECRETS = [
  'I can\'t read. Never learned. I hold the letters upside down sometimes and nobody\'s caught on.',
  'I owe the Two Coins crew more than I\'ll make this year.',
  'I was sweet on someone at the inn for three years and never said a word.',
  'I took a sack of flour from the granary in the hard winter. Dora counts twice. She never caught it.',
  'I\'m afraid of the dark. A grown adult, and I sleep with a candle.',
  'My grandmother was a witch, a real one. I still have her book under the floor.',
  'I ran from a fight once, years ago. A man died who might not have.',
  'I\'ve been saving coin in a sock to leave this town. Every year I nearly go.',
  'I write poems. Bad ones. If you laugh I\'ll deny it.',
  'I saw something in the Gravewood once that I\'ve never told anyone. It looked back.',
];
const ABOUT: Record<string, string[]> = {
  farmer: ['Born in the Glen, raised on the land, and I\'ll be buried in it, most likely under a turnip.', 'I work the east fields. Three generations of us have.'],
  merchant: ['I buy cheap in Port Aurelle and sell dear here. Honestly dear, mind.', 'Trader. My stall\'s the one with the blue awning.'],
  guard: ['I stand the gate. Somebody has to.', 'Watchman. Brannoc\'s lot. We keep the wolves on the right side of the wall.'],
  child: ['I\'m nearly ten! Well. Nearly nine.', 'I\'m the fastest runner on our lane. Probably in the whole Glen.'],
  elder: ['I\'ve seen sixty winters here. The town\'s grown, but it hasn\'t changed much.', 'Old enough to remember the last time the wolves came this bold.'],
  default: ['Not much to tell. I work, I eat, I sleep, and the Glen goes round.', 'I keep my head down and my door mended.'],
};

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** A stable number from a string. */
export function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface PersonSeed {
  id: string;
  name: string;
  job: string;
  settlement: string;
  named?: boolean;
}

const HONORIFICS = new Set(['master', 'ser', 'captain', 'elder', 'old', 'magus', 'lady', 'lord', 'king', 'queen', 'instructor', 'archivist', 'cadet', 'weaponsmaster', 'harbourmaster', 'grand', 'marshal', 'high', 'priestess', 'envoy', 'legate', 'herald', 'little', 'slick', 'knight-captain', 'chancellor', 'archmage', 'grandmaster', 'brother', 'sister', 'mother', 'father', 'sergeant', 'dame', 'sir', 'young', 'big', 'mad', 'royal']);

/** What people call someone in passing: "Master Fröst" is Fröst, "Delphine “Dice” Coveley" is Dice. */
export function firstName(name: string) {
  const nick = name.match(/[“"]([^”"]+)[”"]/);
  if (nick) return nick[1];
  const words = name.split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && HONORIFICS.has(words[i].toLowerCase())) i++;
  return words[i];
}

/** Roll a townsperson's profile (the same every game). */
export function rollProfile(p: PersonSeed): Profile {
  const r = mulberry32(seedOf(p.id));
  const t = (bias = 0) => clamp((r() + r() + r()) / 1.5 - 1 + bias);
  const job = p.job;
  const child = job === 'child';
  const guard = job === 'guard';
  const traits: Traits = {
    warmth: t(child ? 0.3 : 0),
    courage: t(guard ? 0.45 : child ? -0.1 : 0),
    honesty: t(job === 'merchant' ? -0.1 : 0.05),
    greed: t(job === 'merchant' ? 0.3 : 0),
    humor: t(child ? 0.3 : 0),
    piety: t(job === 'elder' || job === 'priest' ? 0.4 : 0),
    temper: t(guard ? 0.15 : 0),
  };
  const voice: Voice = child ? (r() < 0.6 ? 'cheery' : 'nervous') : guard ? (r() < 0.6 ? 'gruff' : 'blunt') : job === 'elder' ? (r() < 0.6 ? 'formal' : 'folksy') : traits.courage < -0.45 ? 'nervous' : traits.humor > 0.45 ? 'cheery' : VOICES[Math.floor(r() * VOICES.length)];
  const base = JOB_LIKES[job] ?? [];
  const likes = [...new Set([...base.slice(0, 2), GIFTS[Math.floor(r() * GIFTS.length)]])];
  const dislikes = GIFTS.filter((g) => !likes.includes(g)).sort(() => r() - 0.5).slice(0, 2);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const first = firstName(p.name);
  return {
    id: p.id, name: p.name, first, job, settlement: p.settlement, traits, voice, likes, dislikes, ties: [],
    want: pick(JOB_WANTS[job] ?? JOB_WANTS.default),
    secret: pick(SECRETS),
    about: pick(ABOUT[job] ?? ABOUT.default),
    essential: !!p.named,
    child,
    guard,
    firstImpression: Math.round(traits.warmth * 18 - traits.temper * 6),
    hp: guard ? 140 : child ? 30 : 55,
  };
}

/**
 * Tie the people of one settlement together: families by surname, friends,
 * a rival or two, the odd sweetheart. Deterministic: the same town every game.
 */
export function weaveTies(people: Profile[]) {
  const bySurname = new Map<string, Profile[]>();
  for (const p of people) {
    const words = p.name.split(' ');
    const fam = words.length > 1 ? words[words.length - 1] : '';
    if (!fam) continue;
    const list = bySurname.get(fam) ?? [];
    list.push(p);
    bySurname.set(fam, list);
  }
  const tie = (a: Profile, b: Profile, ab: Bond, ba: Bond) => {
    if (a === b || a.ties.some((x) => x.id === b.id)) return;
    a.ties.push({ id: b.id, bond: ab });
    b.ties.push({ id: a.id, bond: ba });
  };
  for (const fam of bySurname.values()) {
    const adults = fam.filter((p) => !p.child), kids = fam.filter((p) => p.child);
    if (adults.length >= 2 && (seedOf(adults[0].id + adults[1].id) & 3) !== 0) tie(adults[0], adults[1], 'spouse', 'spouse');
    for (let i = 2; i < adults.length; i++) tie(adults[0], adults[i], 'sibling', 'sibling');
    for (const k of kids) if (adults[0]) tie(adults[0], k, 'child', 'parent');
  }
  const n = people.length;
  if (n < 3) return;
  for (let i = 0; i < n; i++) {
    const a = people[i];
    const s = seedOf(a.id);
    const b = people[(i + 1 + (s % (n - 1))) % n];
    if (a.child !== b.child) continue;
    tie(a, b, 'friend', 'friend');
    if ((s >>> 4) % 7 === 0) {
      const c = people[(i + 3 + ((s >>> 8) % Math.max(1, n - 3))) % n];
      if (!c.child && !a.child) tie(a, c, 'rival', 'rival');
    }
    if ((s >>> 12) % 11 === 0) {
      const c = people[(i + 5 + ((s >>> 9) % (n - 5 || 1))) % n];
      if (!c.child && !a.child && !a.ties.some((t) => t.bond === 'spouse') && !c.ties.some((t) => t.bond === 'spouse')) tie(a, c, 'sweetheart', 'sweetheart');
    }
  }
}

/** What an item counts as for gifts. */
export function giftKind(id: string, kind: string): GiftKind | null {
  if (kind === 'sword' || kind === 'spear' || kind === 'axe' || kind === 'mace' || kind === 'dagger' || kind === 'greatsword' || kind === 'bow' || kind === 'crossbow' || kind === 'shield') return 'weapons';
  if (/potion|elixir|tonic|draught/i.test(id)) return 'potions';
  if (/honey|cake|pie|sweet|berry|apple|candy|tart/i.test(id)) return 'sweets';
  if (/ale|wine|mead|beer|cider|rum/i.test(id)) return 'drink';
  if (/fish|trout|salmon|eel|carp|perch|cod|mackerel|crab/i.test(id)) return 'fish';
  if (/rose|flower|bloom|lily|daisy|poppy|lavender/i.test(id)) return 'flowers';
  if (/herb|sage|thistle|root|moss|leaf|weed|mint|duskbloom|emberroot/i.test(id)) return 'herbs';
  if (/gem|ruby|sapphire|emerald|diamond|amethyst|opal|pearl|glass/i.test(id)) return 'gems';
  if (/book|tome|scroll|letter|map|chronicle/i.test(id)) return 'books';
  if (/ring|amulet|charm|trinket|bead|locket|figurine|silk/i.test(id)) return 'trinkets';
  if (/hammer|tool|nail|ore|ingot|iron|plank|rope|hide|leather/i.test(id)) return 'tools';
  if (/bread|stew|meat|cheese|carrot|wheat|cabbage|pumpkin|egg|milk|meal|ration|potato|turnip/i.test(id)) return 'food';
  if (kind === 'consumable') return 'food';
  return null;
}
