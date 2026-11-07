import { events } from '../core/events';
import { familyOf } from '../items/catalog/gearFx';

// The Wardens' Bestiary: every kind of foe you have killed, how many times,
// and what the Glen Wardens' hunters have written about it. Kills are counted
// from the start of the game (the book fills in what you've already done the
// day Rook hands it over), but the hunting lore only helps once you carry it:
// the more of a kind you've killed, the better you know where to cut, and the
// more often its good drops come away whole (CatalogSources asks `luck`).
//
// Kill counts live in the world flags ('bk:<entry>'), so they save, load and
// reset with everything else; 'bestiary' marks the book as given.

export interface BeastEntry {
  id: string;
  name: string;
  /** banes, wards, parts and trophies (gearFx familyOf) */
  family: string;
  boss: boolean;
  region: string;
  /** the catalog tier its parts are listed at */
  tier: number;
  lore: string;
}

type Row = [name: string, region: string, tier: number, lore: string];

const COMMON: Record<string, Row> = {
  green: ['Green Slime', 'Elder Glen, the crypt', 1, 'A bag of meadow-water with an appetite. Soft, slow, and the first thing most Glen children learn to swat.'],
  cave: ['Cave Slime', 'Crypts and caves', 1, 'Grey ooze that drips from crypt ceilings and lands on whoever is underneath. Mind the roof.'],
  blue: ['Blue Slime', 'The lower crypt', 2, 'Colder and tougher than its green cousin. It splits a bolt of frost when struck hard.'],
  magma: ['Magma Slime', 'Deep places, hot springs', 3, 'Burning jelly. It leaves scorched footprints, if a slime can be said to have feet.'],
  oozeSpawn: ['Ooze Spawn', 'The Mother Ooze\'s pools', 2, 'Little ones shed by the Mother Ooze. Kill them before they find each other and grow.'],
  duneJelly: ['Dune Jelly', 'The Golden Expanse', 4, 'A clear sack of sand-water that floats a hand above the dunes. Stings like a nettle bed.'],
  rat: ['Granary Rat', 'Barns, cellars, sewers', 1, 'Fat on the Glen\'s forty days of bread. Where there is one there are twenty.'],
  wolf: ['Grey Wolf', 'The Glen woods, the Crown Road', 1, 'Hunts in threes. Circle so you can see them all, and they lose their nerve.'],
  direWolf: ['Dire Wolf', 'Deep woods', 3, 'A wolf the size of a pony. It goes for the legs and drags.'],
  gloamWolf: ['Gloam Wolf', 'Wherever the Dark is thin', 2, 'A wolf the Dark has walked through. Its shadow moves a moment after it does.'],
  fox: ['Red Fox', 'Meadows and hedges', 1, 'More nuisance than danger. Wren swears one has learned to open the hen-house latch.'],
  boar: ['Wild Boar', 'Woods and wallows', 1, 'Charges in a straight line and cannot turn. Step aside; strike the flank.'],
  warBoar: ['War Boar', 'Orc camps', 3, 'A boar the orcs feed on blood and armour with iron. It remembers who hit it.'],
  aurochs: ['Aurochs', 'Open plains', 2, 'Wild cattle as tall as a man at the shoulder. Leave the calves alone.'],
  stag: ['Forest Stag', 'The Glen woods', 1, 'Proud and quick to fight in rut. The antlers fetch a good price.'],
  spider: ['Cave Spider', 'Caves, cellars, the crypt', 2, 'Long-legged and patient. The web is the warning; by the time you see the spider it\'s too late to leave.'],
  bat: ['Cave Bat', 'Caves and towers', 1, 'Swarms in the dark. Carry a torch, keep moving.'],
  briarling: ['Briarling', 'The tangled woods', 2, 'A knot of thorn that walks. The wood makes them when it is angry.'],
  wisp: ['Gloam Wisp', 'Haunted woods, at night', 3, 'A light that leads travellers off the road. It burns cold, and it laughs.'],
  goblin: ['Goblin', 'Caves and the wild roads', 2, 'Small, quick and cowardly, until there are six of them.'],
  orc: ['Crypt Orc', 'The crypt, orc camps', 2, 'One of Grukk\'s band: heavy, slow, and paid in black iron.'],
  exileOrc: ['Exiled Orc', 'The Skull Grove', 3, 'An orc cast out of Gorrak\'s horde. Exiles fight as if they have nothing left to lose. They haven\'t.'],
  bandit: ['Bandit', 'The roads', 2, 'Hungry men with knives and a story about why. Most of them would rather you just paid.'],
  scavenger: ['Scavenger', 'Scrap towns of the Expanse', 4, 'Picks the dead clean and the living too, if they\'re slow about it.'],
  sunGuard: ['Sun Guard', 'Ghagrabba', 4, 'The Queen\'s gilded soldiers. They fight in pairs, shields locked.'],
  scrapshell: ['Scrapshell', 'The Golden Expanse', 4, 'A crab that wears a scrap-iron shell. Hit the joints, not the plate.'],
  duneAngler: ['Dune Angler', 'The deep dunes', 4, 'Buries itself and dangles a glittering lure above the sand. Don\'t pick up the coin.'],
  sandUrchin: ['Sand Urchin', 'Dunes and salt flats', 3, 'A ball of spines that rolls with the wind and stops for blood.'],
  sandEel: ['Sand Eel', 'The Golden Expanse', 4, 'Swims through sand as a fish does through water.'],
  sandCrab: ['Sand Crab', 'Oases and the shore', 4, 'Armoured and bad-tempered. It snaps at anything that throws a shadow.'],
  sandRay: ['Sand Ray', 'The deep dunes', 4, 'Glides just under the sand surface. You\'ll see the ripple before the sting.'],
  sandShark: ['Sand Shark', 'The deep dunes', 5, 'A fin cutting through the dunes. Stand on rock.'],
  rayRider: ['Ray Rider', 'The deep dunes', 5, 'Sand-folk who ride the great rays. They strike and are gone.'],
  zombie: ['Zombie', 'The Gravewood', 2, 'The Glen\'s dead, walking. Burn what you can; they don\'t like the light.'],
  skeleton: ['Skeleton', 'The Gravewood, the crypt', 2, 'Old bones with old grudges. Blunt weapons break them best.'],
  hollowKnight: ['Hollow Knight', 'Ruins and barrows', 3, 'Armour with nobody inside, still keeping the oath.'],
  armour: ['Living Armour', 'The crypt', 2, 'A suit of plate the Dark got into. It rattles before it swings.'],
  pirate: ['Pirate', 'The open sea', 4, 'Cutthroats under a black flag. They board fast and fight dirty.'],
  serpent: ['Sea Serpent', 'Deep water', 5, 'Coils as thick as a mast. It hunts ships, not swimmers.'],
};

const BOSSES: Record<string, Row> = {
  grukk: ['Grukk, the Orc Warlord', 'The Crypt of Elder Glen', 3, 'Warlord of the crypt, paid in black iron by someone who wanted the Glen\'s dead dug up. His war-chest refills every time you leave.'],
  captainVess: ['Captain Vess', 'Hollow Ridge Caves', 3, 'Smuggler-captain of the Hollow Ridge. Someone always takes her place, and her purse.'],
  tideWarden: ['The Tide-Warden', 'The Drowned Shrine', 5, 'A shrine guardian of coral and old prayer. The water rises when it is angry.'],
  ulgra: ['Ulgra Skullsplitter', 'The Skull Grove', 4, 'The Exile. Cast out by Gorrak; hunts what Gorrak fears.'],
  bristleback: ['Old Bristleback', 'The Wallow', 3, 'A boar so old the moss grows on him. He has killed eleven hunters.'],
  gnarlbark: ['Old Gnarlbark', 'The Elder Glade', 4, 'The Rootwarden. The wood remembers, and the wood is angry.'],
  greymane: ['Greymane, the Wolf-Mother', 'The Wolf-Mother\'s Den', 4, 'Every wolf in the Glen woods is one of hers.'],
  thornhorn: ['Thornhorn, the Antlered King', 'The Antlered King\'s Glade', 5, 'A stag with a crown of thorns and a king\'s temper.'],
  sandGolem: ['The Sand Golem', 'The Golden Expanse', 5, 'A walking dune bound round a burning core.'],
  sawtooth: ['Sawtooth', 'The deep dunes', 5, 'The great shark of the sand. The fin alone is taller than a man.'],
  edricHollowed: ['Edric, Hollowed', 'The Sanctum Below', 5, 'The brother who went down to the Sanctum and came back wrong.'],
  ishara: ['Ishara', 'Ghagrabba', 5, 'The Queen\'s blade, and the best duellist in the Expanse.'],
  sunCaptain: ['The Sun Captain', 'Ghagrabba', 5, 'Captain of the Sun Guard. Gilded, proud, and very good.'],
  banditChief: ['Bandit Chief', 'Bandit camps', 3, 'Bigger, meaner and better armed than the rest of them, which is how he got the job.'],
  scavengerChief: ['Scavenger Chief', 'Scrap towns of the Expanse', 4, 'Rules a scrap town by being the last one standing.'],
  abomination: ['The Abomination', 'The Gravewood', 3, 'Stitched together from the Gravewood\'s dead. It wants to be finished.'],
  greyjaw: ['Greyjaw', 'The Glen woods', 3, 'A wolf too old and too clever to die. Shepherds leave him a lamb at midsummer.'],
  whiteStag: ['The White Stag', 'The deep woods', 4, 'Seen once a generation. Killing it is said to be very lucky, or very much the opposite.'],
  brineMaw: ['The Brine Maw', 'The coast', 4, 'A mouth in the shallows that swallows boats whole.'],
  motherOoze: ['The Mother Ooze', 'The sunken pools', 3, 'The slime that makes slimes. Kill the spawn, or she grows.'],
  hollowThane: ['The Hollow Thane', 'The old barrow', 4, 'A thane buried with his oath and his sword. He kept both.'],
  rustKnight: ['The Rust Knight', 'The ruined keep', 4, 'A knight still guarding a keep that fell a century ago.'],
  snaggletooth: ['Snaggletooth', 'The orc camps', 4, 'The orcs\' prize war-boar, gone feral.'],
  varga: ['Varga One-Eye', 'The north road', 4, 'An orc chieftain with one eye and no mercy.'],
  ratQueen: ['The Rat Queen', 'Under the city', 3, 'A rat as big as a dog, and every rat in the sewers answers to her.'],
  drownedCaptain: ['Captain Ansel Hale', 'The drowned watchtower', 4, 'The drowned keeper of the watchtower. He still keeps the light.'],
  hangedLord: ['Red Corwen', 'The hanging tree', 4, 'The hanged lord of the road, who will not stay hanged.'],
  circleWraith: ['The Wraith of the Wrong Circle', 'The backwards stones', 5, 'What the backwards wheel let in.'],
  delver: ['The Delver', 'The old mine', 5, 'The blind thing in the old mine. It hears your heart.'],
  kraken: ['The Kraken', 'The open sea', 6, 'Arms from below the keel. Cut the arms and the body surfaces.'],
  crab: ['The Crab Colossus', 'The shoals', 5, 'A crab the size of a sloop.'],
  sirens: ['The Siren Choir', 'The singing rocks', 5, 'Stop your crew\'s ears, or lose them over the rail.'],
  wyrm: ['The Storm Wyrm', 'The storm belt', 6, 'It rides the storm, and the storm obeys it.'],
  oldTeeth: ['Old Teeth', 'The coastal shelf', 5, 'The terror of the coastal shelf. Older than the port.'],
  leviathan: ['The Leviathan', 'The far deep', 7, 'Pale as moonlight and longer than any fleet.'],
};

/** Kinds that are the same creature under another name (the wilds' roamers, the elites). */
const ALIAS: Record<string, string> = {
  wildWolf: 'wolf', wildDireWolf: 'direWolf', dire: 'direWolf', wildFox: 'fox', wildBoar: 'boar', wildAurochs: 'aurochs',
  wildStag: 'stag', wildGoblin: 'goblin', wildOrc: 'orc', wildWisp: 'wisp', broodRat: 'rat', shark: 'sandShark',
};
/** Not foes: practice dummies, people you are made to fight, carts. */
const IGNORE = new Set(['dummy', 'watchGuard', 'flowerGirl', 'edric', 'player', 'cargo', 'ship', 'courier']);

const pretty = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** The bestiary entry a kill of this kind counts toward (null: not a foe). */
export function entryId(kind: string): string | null {
  if (!kind || IGNORE.has(kind)) return null;
  let k = kind.endsWith('Elite') ? kind.slice(0, -5) : kind;
  k = ALIAS[k] ?? k;
  return k;
}

const cache = new Map<string, BeastEntry>();
export function entry(id: string): BeastEntry {
  let e = cache.get(id);
  if (e) return e;
  const b = BOSSES[id], c = COMMON[id];
  const row = b ?? c;
  e = row
    ? { id, name: row[0], family: familyOf(id), boss: !!b, region: row[1], tier: row[2], lore: row[3] }
    : { id, name: pretty(id), family: familyOf(id), boss: false, region: 'Out in the world', tier: 2, lore: 'The Wardens have nothing written on this one yet. You are the first to bring one down and say so.' };
  cache.set(id, e);
  return e;
}
/** Every entry the book knows of, kills or not (for the "?" pages). */
export const ALL_ENTRIES = [...Object.keys(COMMON), ...Object.keys(BOSSES)];

/**
 * What a page shows at each count: the creature and its lore, then its
 * common drops, then its rare ones, then mastery. Bosses come quicker.
 */
export const REVEAL = { common: [1, 5, 15, 30], boss: [1, 2, 3, 5] } as const;
export type Stage = 0 | 1 | 2 | 3 | 4;
export const STAGE_NAMES = ['Unknown', 'Sighted', 'Studied', 'Known', 'Mastered'];

export function stageOf(kills: number, boss: boolean): Stage {
  const r = boss ? REVEAL.boss : REVEAL.common;
  let s = 0;
  for (const n of r) if (kills >= n) s++;
  return s as Stage;
}

/**
 * The hunter's edge on this kind's drops, as a fraction added to luck:
 * +2% a kill up to +40%, and +10% more at mastery (common foes);
 * +15% a kill up to +60%, and +15% more at mastery (bosses).
 */
export function luckFor(kills: number, boss: boolean): number {
  if (kills <= 0) return 0;
  if (boss) return Math.min(0.6, kills * 0.15) + (kills >= REVEAL.boss[3] ? 0.15 : 0);
  return Math.min(0.4, kills * 0.02) + (kills >= REVEAL.common[3] ? 0.1 : 0);
}

/** What CatalogSources needs from the book (set once the bestiary exists). */
export const bestiaryHook: { luck?: (kind: string) => number; isBoss?: (kind: string) => boolean; name?: (kind: string) => string } = {};

export class Bestiary {
  /** a new entry, or a page that turned (the UI redraws, the HUD says so) */
  onChange?: () => void;
  onNews?: (msg: string) => void;

  constructor(private flags: Record<string, boolean | number | string>) {
    events.on('enemyDied', ({ kind }) => this.record(kind));
    bestiaryHook.luck = (kind) => this.luck(kind);
    bestiaryHook.isBoss = (kind) => {
      const id = entryId(kind);
      return !!id && entry(id).boss;
    };
    bestiaryHook.name = (kind) => {
      const id = entryId(kind);
      return id ? entry(id).name : kind;
    };
  }

  get unlocked() {
    return !!this.flags.bestiary;
  }
  unlock() {
    if (this.unlocked) return false;
    this.flags.bestiary = 1;
    this.onChange?.();
    return true;
  }

  kills(id: string) {
    return Number(this.flags['bk:' + id] ?? 0);
  }

  record(kind: string) {
    const id = entryId(kind);
    if (!id) return;
    const before = this.kills(id);
    const n = before + 1;
    this.flags['bk:' + id] = n;
    const e = entry(id);
    const s0 = stageOf(before, e.boss), s1 = stageOf(n, e.boss);
    if (this.unlocked && s1 > s0) {
      this.onNews?.(s1 === 1 ? `New bestiary entry: ${e.name}` : `Bestiary: ${e.name} is now ${STAGE_NAMES[s1]}${s1 >= 2 ? ', more of its drops revealed' : ''}`);
    }
    this.onChange?.();
  }

  /** The drop-luck bonus a kill of this kind gets (only while you carry the book). */
  luck(kind: string) {
    if (!this.unlocked) return 0;
    const id = entryId(kind);
    if (!id) return 0;
    return luckFor(this.kills(id), entry(id).boss);
  }

  /** Every entry with at least one kill. */
  seen(): { e: BeastEntry; kills: number }[] {
    const out: { e: BeastEntry; kills: number }[] = [];
    for (const [k, v] of Object.entries(this.flags)) {
      if (!k.startsWith('bk:') || !Number(v)) continue;
      out.push({ e: entry(k.slice(3)), kills: Number(v) });
    }
    return out;
  }

  /** How many known entries there are to find (for the "x of y" count). */
  total() {
    const ids = new Set([...ALL_ENTRIES, ...this.seen().map((s) => s.e.id)]);
    return ids.size;
  }
}
