import { ITEMS } from '../items/itemDefs';
import { REGIONS } from '../world/regionDefinitions';

// The Quest Wall's contracts (docs/design/guild.md). Each guild hall posts its
// own work, drawn fresh every dawn from its region: a named client, a kind of
// job, a place, a count, a difficulty in stars and a purse to match. About one
// notice in four is urgent (red wax): it pays half again, and comes down if it
// isn't done in time, which costs you standing.
//
//   hunt     kill N of a family of creature (wolves and boars, the dead...)
//   clear    kill N of anything within a place (a quarry, a ridge, a ruin)
//   gather   bring N of an item to the counter
//   explore  reach a place and come back with word of it
//   survey   map N new sectors of the land
//   deliver  carry a parcel to someone in another town

export type HallId = 'glen' | 'port' | 'capital';
export type ContractKind = 'hunt' | 'clear' | 'gather' | 'explore' | 'survey' | 'deliver' | 'kill';

export interface HallDef {
  id: HallId;
  name: string;
  /** the regions whose landmarks its contracts send you to */
  regions: string[];
  /** who posts work here */
  clients: string[];
  /** families of creature hunted here: [family, how the notice names them] */
  hunts: [string, string][];
  /** items wanted here */
  gathers: string[];
  /** where its parcels go: [name, x, z, who takes it] */
  deliveries: [string, number, number, string][];
  /** the rank (index) this hall's work starts at */
  minRank: number;
}

export const HALLS: Record<HallId, HallDef> = {
  glen: {
    id: 'glen', name: 'Elder Glen Chapter', regions: ['elderGlen', 'cresha'], minRank: 0,
    clients: ['Tom Hale', 'Old Wren Barley', 'Dora Sheaf', 'Ilyra Moss', 'Master Fröst', 'Captain Brannoc', 'Elder Maud', 'Oswin Grist', 'Mara Bell', 'Vela Thread'],
    hunts: [['beast', 'wolves and boars'], ['slime', 'slimes'], ['goblin', 'goblins'], ['undead', 'the restless dead'], ['bandit', 'bandits']],
    gathers: ['sungrass', 'moongrass', 'wheat', 'wool', 'ironOre', 'honeycomb', 'wolfPelt', 'logs', 'apple', 'leather', 'copperOre'],
    deliveries: [['Millbrook', 640, 70, 'Old Garth'], ['the Chapel of the Dawn', 668, 184, 'Brother Aldous'], ['the Lantern Camp', 1072, 46, 'Dagna Holt'], ['the Wayfarer\'s Rest', 1385, 92, 'Hester Brightwater']],
  },
  port: {
    id: 'port', name: 'Port Aurelle Hall', regions: ['portAurelle', 'cresha'], minRank: 1,
    clients: ['Mira Vane', 'Old Nell Crabbe', 'Harbourmaster Tallow', 'Ragna Ironsides', 'Quill Mereweather', 'Bess Harrow', 'Bruni Stonevein', 'Lady Corvina Aurelle'],
    hunts: [['bandit', 'bandits and smugglers'], ['sea', 'things from the sea'], ['insect', 'giant vermin'], ['beast', 'road beasts']],
    gathers: ['ironOre', 'silverOre', 'leather', 'rawHide', 'logs', 'bone', 'feather', 'honeycomb'],
    deliveries: [['the Wayfarer\'s Rest', 1385, 92, 'Hester Brightwater'], ['Elder Glen', 0, -4, 'Elder Maud'], ['the Lantern Camp', 1072, 46, 'Dagna Holt'], ['Gull Ridge', 2234, 108, 'the lookout']],
  },
  capital: {
    id: 'capital', name: 'The Grand Hall', regions: ['royalCapital'], minRank: 2,
    clients: ['the Crown Chancery', 'Gerrit Vale', 'Odile Brightforge', 'Fenwick Ashgrove', 'the Silver Lance', 'Archmage Venn', 'the Royal Library', 'the Temple of the Dawn'],
    hunts: [['bandit', 'highwaymen'], ['undead', 'barrow-dead'], ['construct', 'old war-engines'], ['orc', 'orc raiders'], ['beast', 'road beasts']],
    gathers: ['silverOre', 'leather', 'bone', 'feather', 'logs', 'wool'],
    deliveries: [['Port Aurelle', 2746, 256, 'Wendeline Ashcombe'], ['Elder Glen', 0, -4, 'Elder Maud'], ['the Wayfarer\'s Rest', 1385, 92, 'Hester Brightwater']],
  },
};

export interface ContractSpec {
  kind: ContractKind;
  title: string;
  description: string;
  client: string;
  stars: number;
  targetFamily?: string;
  targetKind?: string;
  targetItem?: string;
  targetCount?: number;
  targetName?: string;
  target?: [number, number];
  radius?: number;
  rewardGold: number;
  rewardXp: number;
  rewardRep: number;
  rewardMarks: number;
  minRank: number;
  /** urgent: the day it comes down */
  expires?: number;
}

/** A small seeded random (so a hall's board for a given day is the same on reload). */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];

/** Landmarks a hall sends you to (not the hall's own town). */
function places(h: HallDef) {
  const out: { name: string; x: number; z: number }[] = [];
  for (const id of h.regions) for (const l of REGIONS[id]?.landmarks ?? []) {
    if (l.x === undefined || l.z === undefined) continue;
    if (l.kind === 'town' || l.kind === 'city' || l.kind === 'capital') continue;
    out.push({ name: l.name, x: l.x, z: l.z });
  }
  return out;
}

const PURSE: Record<ContractKind, [number, number, number]> = {
  // gold, xp, rep per star
  hunt: [34, 40, 22], clear: [40, 46, 26], gather: [26, 30, 18], explore: [32, 40, 22], survey: [30, 40, 22], deliver: [36, 34, 20], kill: [40, 46, 26],
};

/**
 * One notice for a hall: `rank` is your rank (index) and lifts the stars and the
 * purse; `day` dates urgent notices.
 */
export function makeContract(h: HallDef, rank: number, day: number, r: () => number): ContractSpec {
  const client = pick(r, h.clients);
  const level = Math.max(h.minRank, rank);
  const stars = Math.max(1, Math.min(5, 1 + level + (r() < 0.35 ? 1 : 0) - (r() < 0.25 ? 1 : 0)));
  const kinds: ContractKind[] = ['hunt', 'hunt', 'clear', 'gather', 'gather', 'explore', 'deliver', 'survey'];
  const kind = pick(r, kinds);
  const urgent = r() < 0.25;
  const k = (1 + 0.3 * (stars - 1)) * (urgent ? 1.5 : 1);
  const [g, x, rp] = PURSE[kind];
  const base = { client, stars, minRank: Math.max(0, Math.min(level, stars - 1)), rewardGold: Math.round(g * stars * k), rewardXp: Math.round(x * stars * k), rewardRep: Math.round(rp * stars * (urgent ? 1.3 : 1)), rewardMarks: stars * 2 + (urgent ? 3 : 0), expires: urgent ? day + 1 + Math.floor(r() * 2) : undefined };
  const by = urgent ? ' Needed urgently.' : '';
  switch (kind) {
    case 'hunt': {
      const [fam, label] = pick(r, h.hunts);
      const n = 3 + stars * 2;
      return { ...base, kind, targetFamily: fam, targetCount: n, title: `Cull: ${label[0].toUpperCase() + label.slice(1)}`, description: `${client} wants ${n} of ${label} put down near ${h.id === 'glen' ? 'the Glen' : h.id === 'port' ? 'the port roads' : 'the capital'}. They have been getting bolder.${by}` };
    }
    case 'clear': {
      const p = pick(r, places(h));
      const n = 3 + stars * 2;
      return { ...base, kind, targetCount: n, target: [p.x, p.z], radius: 60, targetName: p.name, title: `Clear Out: ${p.name}`, description: `Something has made ${p.name} its own. ${client} will pay to have it cleared: kill ${n} of whatever lives there.${by}` };
    }
    case 'gather': {
      const items = h.gathers.filter((id) => ITEMS[id]);
      const id = pick(r, items.length ? items : ['wheat']);
      const n = 2 + stars * 2;
      const name = ITEMS[id]?.name ?? id;
      return { ...base, kind, targetItem: id, targetCount: n, title: `Wanted: ${name}`, description: `${client} needs ${n} ${name} brought to the guild counter.${by}` };
    }
    case 'explore': {
      const p = pick(r, places(h));
      return { ...base, kind, target: [p.x, p.z], radius: 28, targetName: p.name, title: `Scout: ${p.name}`, description: `${client} wants fresh word of ${p.name}. Go there, look around, and come back alive.${by}` };
    }
    case 'deliver': {
      const [to, dx, dz, who] = pick(r, h.deliveries);
      return { ...base, kind, target: [dx, dz], radius: 16, targetName: `${who} at ${to}`, title: `Delivery to ${to}`, description: `${client} has a sealed parcel for ${who} at ${to}. Carry it there; the guild seal means nobody opens it.${by}` };
    }
    case 'survey': {
      const n = 6 + stars * 4;
      return { ...base, kind, targetCount: n, title: 'Cartographer\'s Commission', description: `The guild\'s map is out of date. Explore ${n} parts of the land you haven\'t seen.${by}` };
    }
    default:
      return makeContract(h, rank, day, r);
  }
}
