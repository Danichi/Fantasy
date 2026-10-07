import { mulberry32 } from '../../core/math';
import type { Look } from '../../npc/charBuilder';

// Crew (docs/design/boating.md §12): sailors you meet in the harbour taverns
// and hire for good (a daily wage), or take on for a single voyage (a fee up
// front). Each has a role that changes how the ship sails and fights, a level
// that rises with voyages, a trait or two, and morale. Pure data and rules.

export type Role = 'bosun' | 'navigator' | 'gunner' | 'shipwright' | 'lookout' | 'harpooner' | 'cook' | 'deckhand';
export type Trait = 'oldSalt' | 'superstitious' | 'seasick' | 'cantSwim' | 'sharpEyed' | 'brawler' | 'quickHands' | 'cheerful';

export const ROLE_INFO: Record<Role, { name: string; does: string }> = {
  bosun: { name: 'Bosun', does: 'Sets and trims sail faster; the ship is quicker' },
  navigator: { name: 'Navigator', does: 'Reads the sea: waves throw you less, storms are seen sooner' },
  gunner: { name: 'Gunner', does: 'Reloads the guns faster and aims truer' },
  shipwright: { name: 'Shipwright', does: 'Patches holes and sails at sea' },
  lookout: { name: 'Lookout', does: 'Spots sails, reefs and fins far off' },
  harpooner: { name: 'Harpooner', does: 'Harpoon bites deeper; monsters tow you less' },
  cook: { name: 'Cook', does: 'Keeps morale up on long voyages' },
  deckhand: { name: 'Deckhand', does: 'Works the pumps and the lines; fights boarders' },
};
export const TRAIT_INFO: Record<Trait, string> = {
  oldSalt: 'Old Salt: calm in a storm (the ship is thrown less)',
  superstitious: 'Superstitious: shaken by sea monsters (morale falls faster)',
  seasick: 'Seasick: useless in rough seas',
  cantSwim: 'Can’t Swim: lost for good if washed overboard',
  sharpEyed: 'Sharp-eyed: sees further',
  brawler: 'Brawler: fights boarders hard',
  quickHands: 'Quick Hands: faster at the guns and the pumps',
  cheerful: 'Cheerful: everyone’s morale is a little higher',
};

export interface CrewMember {
  id: string;
  name: string;
  role: Role;
  level: number; // 1..5
  xp: number;
  traits: Trait[];
  /** gold a day (permanent), or the voyage fee (hired for one voyage) */
  wage: number;
  morale: number; // 0..1
  look: Look;
  hire: 'permanent' | 'voyage';
  status: 'aboard' | 'ashore' | 'overboard' | 'lost';
  /** where a candidate waits to be met (harbour, tavern) */
  haunt?: 'harbour' | 'tavern' | 'wharf';
  /** voyages sailed with you, and the wish they make after a couple */
  voyages?: number;
  wish?: CrewWish;
}

const FIRST = ['Anselm', 'Brigid', 'Corwin', 'Dagny', 'Ewan', 'Freya', 'Gulliver', 'Hild', 'Ishmael', 'Jory', 'Kestrel', 'Lowen', 'Morwenna', 'Nils', 'Oona', 'Piran', 'Rhoswen', 'Silas', 'Tegan', 'Ulf', 'Wenna', 'Yorick'];
const LAST = ['Saltmarsh', 'Tidewell', 'Gullstone', 'Netherby', 'Cray', 'Pennock', 'Brine', 'Harrow', 'Keel', 'Marlin', 'Rook', 'Spratt', 'Trevail', 'Whitlow'];
const NICK = ['"One-Eye"', '"Barnacle"', '"Squall"', '"Lucky"', '"Old Rope"', '"Gull"', '"Splice"', '"Ballast"'];
const ROLES: Role[] = ['deckhand', 'deckhand', 'bosun', 'navigator', 'gunner', 'shipwright', 'lookout', 'harpooner', 'cook', 'deckhand'];
const TRAITS = Object.keys(TRAIT_INFO) as Trait[];

/** A day's candidates in the harbour: who you can meet and hire today. */
export function candidates(day: number, n = 8): CrewMember[] {
  const rnd = mulberry32(7700 + day * 31);
  const out: CrewMember[] = [];
  for (let i = 0; i < n; i++) {
    const role = ROLES[Math.floor(rnd() * ROLES.length)];
    const level = 1 + Math.floor(Math.pow(rnd(), 1.6) * 5);
    const female = rnd() < 0.42;
    const traits: Trait[] = [];
    if (rnd() < 0.7) traits.push(TRAITS[Math.floor(rnd() * TRAITS.length)]);
    if (rnd() < 0.2) {
      const t = TRAITS[Math.floor(rnd() * TRAITS.length)];
      if (!traits.includes(t)) traits.push(t);
    }
    const name = `${FIRST[Math.floor(rnd() * FIRST.length)]}${rnd() < 0.25 ? ' ' + NICK[Math.floor(rnd() * NICK.length)] : ''} ${LAST[Math.floor(rnd() * LAST.length)]}`;
    const base = role === 'deckhand' ? 6 : role === 'cook' ? 7 : 10;
    out.push({
      id: `crew-${day}-${i}`, name, role, level, xp: 0, traits, wage: Math.round(base * (0.7 + level * 0.45)), morale: 0.7, hire: 'permanent', status: 'ashore',
      haunt: (['harbour', 'tavern', 'wharf'] as const)[i % 3],
      look: {
        body: female ? 'female' : 'male', outfit: rnd() < 0.6 ? 'ranger' : 'peasant',
        hair: female ? (['long', 'buns', 'buzzedfemale'] as const)[Math.floor(rnd() * 3)] : (['simpleparted', 'buzzed'] as const)[Math.floor(rnd() * 2)],
        beard: !female && rnd() < 0.55, hood: rnd() < 0.2,
        hairColor: [0x1f1a17, 0x3a2618, 0x6a4428, 0x8a3f22, 0xd2b26a, 0xb8b4ae][Math.floor(rnd() * 6)],
        skin: [0xfff0e6, 0xe0b894, 0xa8744e, 0x7a4e32][Math.floor(rnd() * 4)],
        cloth: [0x2f4a6a, 0x3a5a7a, 0x6a3a2a, 0x2f7f86, 0x5a5a5a][Math.floor(rnd() * 5)],
        linen: [0xe8d8b8, 0xc9dbe8, 0xd8c29a][Math.floor(rnd() * 3)], height: female ? 1.64 + rnd() * 0.1 : 1.72 + rnd() * 0.14,
      },
    });
  }
  return out;
}

/** A crew for one voyage: so many deckhands and a bosun, at a flat fee. */
export function dayCrew(n: number, day: number): CrewMember[] {
  return candidates(day + 500, n).map((c, i) => ({ ...c, id: `day-${day}-${i}`, role: i === 0 ? 'bosun' : 'deckhand', level: 1 + (i === 0 ? 1 : 0), traits: [], hire: 'voyage', wage: 0 }));
}

/** What a crew does for the ship. */
export function crewEffects(crew: CrewMember[], rough: number) {
  const aboard = crew.filter((c) => c.status === 'aboard');
  const fit = (c: CrewMember) => (c.traits.includes('seasick') && rough > 0.4 ? 0.2 : 1) * (0.6 + c.morale * 0.5);
  const sum = (role: Role) => aboard.filter((c) => c.role === role).reduce((a, c) => a + c.level * fit(c), 0);
  const cheer = aboard.some((c) => c.traits.includes('cheerful')) ? 0.08 : 0;
  return {
    hands: aboard.length,
    /** speed multiplier from the bosun */
    sailing: 1 + Math.min(0.12, sum('bosun') * 0.025),
    /** 0..0.5 extra seamanship from navigators and old salts */
    seaSense: Math.min(0.5, sum('navigator') * 0.06 + aboard.filter((c) => c.traits.includes('oldSalt')).length * 0.06),
    gunner: sum('gunner') + aboard.filter((c) => c.traits.includes('quickHands')).length * 0.6,
    /** hull hit points patched per second */
    repair: sum('shipwright') * 0.35,
    lookout: 1 + sum('lookout') * 0.25 + aboard.filter((c) => c.traits.includes('sharpEyed')).length * 0.2,
    harpoon: 1 + sum('harpooner') * 0.12,
    pumps: aboard.filter((c) => c.role === 'deckhand').length + aboard.filter((c) => c.traits.includes('quickHands')).length * 0.5,
    fighters: aboard.reduce((a, c) => a + (c.role === 'deckhand' || c.traits.includes('brawler') ? 1 + c.level * 0.3 : 0.4), 0),
    morale: aboard.length ? aboard.reduce((a, c) => a + c.morale, 0) / aboard.length + cheer : 1,
    wages: crew.filter((c) => c.hire === 'permanent' && c.status !== 'lost').reduce((a, c) => a + c.wage, 0),
  };
}
export type CrewEffects = ReturnType<typeof crewEffects>;

/** Experience for a voyage: levels come every 100 xp, to 5. */
export function crewXp(c: CrewMember, xp: number) {
  c.xp += xp;
  while (c.level < 5 && c.xp >= c.level * 100) {
    c.xp -= c.level * 100;
    c.level++;
  }
}

// ---- a crewman's wish -------------------------------------------------------------------------

/** After a couple of voyages, a crewman asks something of you; do it and they're yours for life. */
export interface CrewWish {
  kind: 'visit' | 'beast' | 'storms' | 'pirates';
  /** a port id (visit) */
  target?: string;
  need: number;
  got: number;
  done: boolean;
  say: string;
}

const WISH_PORTS: [string, string][] = [['azureHaven', 'Azure Haven'], ['emeraldCove', 'Emerald Cove'], ['sunkenSpire', 'Sunken Spire'], ['wreckersRest', 'Wrecker\'s Rest']];

/** The wish a crewman will make (steady for a given crewman). */
export function wishFor(c: CrewMember): CrewWish {
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const k = h % 4;
  if (k === 0) {
    const [id, name] = WISH_PORTS[(h >> 3) % WISH_PORTS.length];
    return { kind: 'visit', target: id, need: 1, got: 0, done: false, say: `My sister keeps a tavern in ${name}. I haven't seen her in eleven years. Could we put in there, Captain?` };
  }
  if (k === 1) return { kind: 'beast', need: 1, got: 0, done: false, say: 'Something out of the deep took my brother\'s boat, years back. I want to see one of those monsters dead before I die.' };
  if (k === 2) return { kind: 'storms', need: 3, got: 0, done: false, say: 'My da said you\'re not a real sailor till you\'ve come through three storms. I want to be a real sailor, Captain.' };
  return { kind: 'pirates', need: 3, got: 0, done: false, say: 'Pirates burned my village when I was a girl. Sink three of the devils for me and I\'ll follow you anywhere.' };
}
