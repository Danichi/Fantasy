import * as THREE from 'three';
import { heightAt } from './terrainHeight';
import { mulberry32 } from '../core/math';
import {
  CAP_STREETS, PLAZA, MARKET, TEMPLE, GUILD, COMMANDERY, ENVOYS, LIBRARY, COLLEGIUM, CHANCERY, QUEENS_GARDEN, EAST_GATE, SOUTH_GATE, WEST_GATE,
  QUAY, PALACE, AVENUE_DIR, CAP_CENTER, type P2,
} from './capitalCity';
import { CAPITAL_SPOTS } from './royalCapital';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../npc/npcManager';
import type { Look } from '../npc/charBuilder';

// The people of the Royal Capital (World Expansion phase 8): the royal court,
// the orders and the scholars, the envoys of the known world, merchants under
// royal charter, and some hundred and thirty townsfolk on daily rounds
// between their homes, the Plaza of Crowns, the Crown Market and the Gilded
// Stag. (The city counts some five thousand souls; these are the ones you meet.)

const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
const ring = (cx: number, cz: number, r: number, n: number, a0 = 0) => Array.from({ length: n }, (_, i) => v(cx + Math.cos(a0 + (i / n) * Math.PI * 2) * r, cz + Math.sin(a0 + (i / n) * Math.PI * 2) * r));
/** Out from the palace along the Royal Avenue. */
const avenue = (t: number, lat = 0): P2 => [PALACE[0] + AVENUE_DIR[0] * t - AVENUE_DIR[1] * lat, PALACE[1] + AVENUE_DIR[1] * t + AVENUE_DIR[0] * lat];
/** In front of a Crown Ring building (its doors face away from the palace). */
const before = (p: P2, d: number): P2 => {
  const dx = p[0] - PALACE[0], dz = p[1] - PALACE[1], l = Math.hypot(dx, dz);
  return [p[0] + (dx / l) * d, p[1] + (dz / l) * d];
};

interface Named { id: string; name: string; title: string; look: Look; post: P2; yaw?: number; activity: ScheduleEntry['activity']; hours: [number, number]; lines: NpcRecord['lines'] }

const crownBlue = 0x24467e, gold = 0xc9a24a;

const NAMED: Named[] = [
  // ---- The royal court ----
  { id: 'king', name: 'King Aldric IV', title: 'King of Cresha', post: avenue(4), yaw: Math.atan2(AVENUE_DIR[0], AVENUE_DIR[1]), activity: 'idle', hours: [8, 20],
    lines: { any: ['Cresha has stood four hundred years on this hill. I intend that it stand four hundred more.', 'You have the look of someone who has not slept in a proper bed since they arrived. Few summoned do.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0x8a7a6a, skin: 0xe8c8a8, cloth: crownBlue, linen: 0xf0e0b0, pauldron: true, height: 1.86 } },
  { id: 'queen', name: 'Queen Elinor', title: 'Queen of Cresha', post: [QUEENS_GARDEN[0] + 5, QUEENS_GARDEN[1] + 6], activity: 'idle', hours: [9, 19],
    lines: { any: ['My garden is the only quiet acre in the city. Walk softly in it.', 'The court talks of nothing but the summoning. I would rather talk of roses.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xe8e0f8, cloth: crownBlue, height: 1.74 } },
  { id: 'chancellor', name: 'Lord Chancellor Edric Vaun', title: 'Keeper of the Royal Seal', post: before(CHANCERY, 13), activity: 'idle', hours: [7, 19],
    lines: { any: ['Every writ in Cresha passes my desk. Every one.', 'A petition, you say? Form twelve. In triplicate.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x3a2618, skin: 0xe0b894, linen: 0xd8d0c0, cloth: 0x3a2a4a, height: 1.8 } },
  { id: 'marshal', name: 'Grand Marshal Ser Roland Hart', title: 'Commander of the Silver Lance', post: [COMMANDERY[0] + 10, COMMANDERY[1] - 4], activity: 'patrol', hours: [6, 20],
    lines: { any: ['The Silver Lance does not ask whether a thing is possible. It asks where.', 'Squire, are you? Marrow trains them well, I will give the old goat that.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a6a6a, skin: 0xe0b894, cloth: 0xc9d6e6, pauldron: true, bracers: true, height: 1.94 } },
  { id: 'crownCaptain', name: 'Captain Mara Thorne', title: 'Captain of the Crown Guard', post: [EAST_GATE[0] - 16, EAST_GATE[1] + 6], activity: 'patrol', hours: [6, 22],
    lines: { any: ['East Gate, Crown Guard. State your business, or admire the gate and move along.', 'If you are registered at the Academy, the Crown Road is open to you. Mind the wolves past the checkpoint.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x1f1a17, skin: 0xa8744e, cloth: crownBlue, pauldron: true, bracers: true, height: 1.78 } },
  { id: 'herald', name: 'Herald Bartholomew Pike', title: 'Royal Herald', post: [PLAZA[0] - 18, PLAZA[1] + 15], activity: 'talk', hours: [8, 18],
    lines: { any: ['Hear ye! The Crown’s tourney at the Commandery, the third day of every week!', 'Hear ye! The Royal Library opens its reading room to the public, mornings only!'] },
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xf0e0b0, cloth: crownBlue, height: 1.76 } },
  // ---- Faith, scholarship and magic ----
  { id: 'priestess', name: 'High Priestess Seraphine', title: 'Temple of the Dawn', post: [TEMPLE[0] + 3, TEMPLE[1] - 21], yaw: Math.PI, activity: 'idle', hours: [5, 21],
    lines: { any: ['The Dawn returns to those who keep watch. That is the whole of our creed, and it is enough.', 'You carry a strange light, summoned one. The Sunwheel turned when you came.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xfff4dc, cloth: 0xe8c060, height: 1.72 } },
  { id: 'librarian', name: 'Master Tobias Quill', title: 'Royal Librarian', post: before(LIBRARY, 17), activity: 'idle', hours: [8, 22],
    lines: { any: ['Mell of the Academy writes to me weekly. Mostly to argue.', 'The Library holds every book written in Cresha, and four that were written before it.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0xb8b4ae, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x4a3a6a, height: 1.7 } },
  { id: 'archmage', name: 'Archmage Isolde Venn', title: 'Master of the Arcane Collegium', post: before(COLLEGIUM, 20), activity: 'idle', hours: [9, 24],
    lines: { any: ['Magic is not a gift. It is a grammar. The Collegium teaches the grammar.', 'Fire and healing are the first lessons. The rest the Collegium teaches its own.'] },
    look: { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x2a2a3a, skin: 0xfff0e6, cloth: 0x5a4aa0, height: 1.76 } },
  // ---- The Grand Hall of the Guild ----
  { id: 'grandmaster', name: 'Grandmaster Brannoc Steel', title: 'Grand Hall of the Adventurer’s Guild', post: [GUILD[0], GUILD[1] - 11], yaw: Math.PI, activity: 'idle', hours: [7, 23],
    lines: { any: ['D-rank or SSS, every name on my board earned its place.', 'The S-rank hall? Earn the invitation first.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x8a2a24, pauldron: true, bracers: true, height: 1.92 } },
  // ---- The envoys ----
  { id: 'elfEnvoy', name: 'Envoy Lirael Moonshade', title: 'Embassy of the Verdant Elves', post: [ENVOYS[0] - 10, ENVOYS[1] - 16], activity: 'idle', hours: [9, 20],
    lines: { any: ['The Greenwood Road is closed to your kind without a guide. It is not personal. Mostly.', 'Your city is loud. Beautiful, but loud.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0xe8e0c8, skin: 0xfff4ea, cloth: 0x2f6a3a, height: 1.84 } },
  { id: 'dwarfEnvoy', name: 'Thrain Ironbrow', title: 'Envoy of the Dwarven Holds', post: [ENVOYS[0] + 17, ENVOYS[1] - 7], activity: 'idle', hours: [8, 21],
    lines: { any: ['Bruni Stonevein’s expedition sails from Port Aurelle. Brave lass. Mad, but brave.', 'Your marble is pretty. Our granite holds up mountains.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x5a3a24, pauldron: true, height: 1.38 } },
  { id: 'valorianEnvoy', name: 'Legate Cassius Varro', title: 'Legation of the Valorian Empire', post: [ENVOYS[0] + 7, ENVOYS[1] + 17], activity: 'idle', hours: [9, 19],
    lines: { any: ['The Empire sends its warmest regards. And its tariffs.', 'Beyond the Frosted Peaks the Empire stretches farther than your maps.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', hairColor: 0x1f1a17, skin: 0xc89870, cloth: 0x8a3a24, pauldron: true, height: 1.8 } },
  { id: 'sunEnvoy', name: 'Envoy Amunet', title: 'Embassy of Sunspire', post: [ENVOYS[0] - 18, ENVOYS[1] + 4], activity: 'idle', hours: [8, 20],
    lines: { any: ['Queen Neferah sends greetings from Sunspire. Take the Queen’s Road south to the Caravan Way, and carry water.', 'Your rain is a marvel. It simply falls, here, for free.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x1f1a17, skin: 0x8a5a3a, linen: 0xf0e0b0, cloth: 0xd89a30, height: 1.72 } },
  // ---- Merchants by royal charter ----
  { id: 'armourer', name: 'Gerrit Vale', title: 'Master Armourer by Royal Charter', post: [MARKET[0] + 12, MARKET[1] - 12], activity: 'talk', hours: [8, 19],
    lines: { any: ['Plate for knights, mail for the sensible, and a fitting for everyone.', 'Royal charter steel. Stamped and guaranteed.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x5a5a5a, pauldron: true, height: 1.88 } },
  { id: 'bladesmith', name: 'Odile Brightforge', title: 'Royal Bladesmith', post: [MARKET[0] - 14, MARKET[1] - 10], activity: 'talk', hours: [8, 19],
    lines: { any: ['A capital blade for a capital hero. Claymores, estocs, sabres that bite frost.', 'Port steel is good. Mine is better. Don’t tell Ragna.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0x7a3a2a, bracers: true, height: 1.76 } },
  { id: 'capAlchemist', name: 'Fenwick Ashgrove', title: 'Alchemist to the Court', post: [MARKET[0] - 6, MARKET[1] + 15], activity: 'talk', hours: [8, 20],
    lines: { any: ['Greater draughts, brewed by the Collegium’s own recipes.', 'Mind the green one. No, the other green one.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'long', hairColor: 0x6a4428, skin: 0xfff0e6, linen: 0xd8e8c8, cloth: 0x3d7a45, height: 1.72 } },
  { id: 'capJeweller', name: 'Celestine Marlowe', title: 'Jeweller to the Court', post: [MARKET[0] + 14, MARKET[1] + 9], activity: 'talk', hours: [9, 19],
    lines: { any: ['The Queen herself wears my garnets.', 'A ring of vigour, an amulet of the deep red stone, a belt fit for a warrior.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x1f1a17, skin: 0x7a4e32, linen: 0xf0e0f0, cloth: 0x7a3f8a, height: 1.7 } },
  { id: 'cartographer', name: 'Ysolde Penwright', title: 'Royal Cartographer', post: [PLAZA[0] + 16, PLAZA[1] + 20], activity: 'talk', hours: [9, 18],
    lines: { any: ['Maps of the realm, inked from the Crown’s own surveys.', 'Every road on my maps has been walked by someone braver than me.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x8a3f22, skin: 0xfff0e6, linen: 0xe8d8b8, cloth: 0x2f5f6a, height: 1.68 } },
  // ---- The Gilded Stag, the stables, the quay ----
  { id: 'stagKeeper', name: 'Hollis Brandt', title: 'Keeper of the Gilded Stag', post: avenue(212, -18), activity: 'idle', hours: [9, 26],
    lines: { any: ['A room, a meal, a song. The Stag does all three.', 'The bard’s late again. The bard is always late.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x6a4428, skin: 0xfff0e6, linen: 0xe8c8c0, height: 1.8 } },
  { id: 'lark', name: 'Lark', title: 'Bard of the Gilded Stag', post: [PLAZA[0] + 20, PLAZA[1] - 14], activity: 'talk', hours: [11, 25],
    lines: { any: ['A song of the summoned hero? I’m still writing the ending.', 'Four summoned heroes in a thousand years. The songs about the other three are all tragedies. No pressure.'] },
    look: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0xb8402e, skin: 0xe0b894, cloth: 0x2f7f86, height: 1.66 } },
  { id: 'capOstler', name: 'Wat Cobble', title: 'Ostler · The Crown Stables', post: [CAPITAL_SPOTS.stable.x - 6, CAPITAL_SPOTS.stable.z], activity: 'work', hours: [6, 21],
    lines: { any: ['Coach to Elder Glen and on to the coast, leaving on the hour.', 'Royal horses, royal prices. Worth every coin.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xe0b894, cloth: 0x7a5a3a, height: 1.78 } },
  { id: 'ferrywoman', name: 'Old Maud Reeve', title: 'Boatwoman of the Crown Quay', post: [QUAY[0] - 3, QUAY[1] + 4], activity: 'work', hours: [5, 20],
    lines: { any: ['Pike under the Kingsbridge, trout in the shallows, and eels if you’re unlucky.', 'The river remembers every king. Floods for the bad ones.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xb8b4ae, skin: 0xe0b894, linen: 0xc9dbe8, height: 1.6 } },
  // ---- Intrigue and the streets ----
  { id: 'vesper', name: 'Lady Vesper Caul', title: 'Lady of the Crown Ring', post: [QUEENS_GARDEN[0] - 14, QUEENS_GARDEN[1] + 12], activity: 'idle', hours: [10, 22],
    lines: { any: ['The King is generous to the summoned. Generosity is so often a kind of leash.', 'Do come to my salon. Everyone who matters does. And some who don’t, for colour.'] },
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x1f1a17, skin: 0xfff0e6, linen: 0xd0c0e8, cloth: 0x5a1a3a, height: 1.76 } },
  { id: 'twig', name: 'Twig', title: 'Street Urchin', post: [MARKET[0] - 20, MARKET[1] + 4], activity: 'play', hours: [8, 21],
    lines: { any: ['A copper for a secret? Two for a good one.', 'The archmage’s crystal hums at night. I sat under it once. Couldn’t feel my teeth for a day.'] },
    look: { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0x6a4428, skin: 0xe0b894, linen: 0xd8c29a, height: 1.3 } },
  { id: 'gawen', name: 'Ser Gawen Ashby', title: 'Knight of the Silver Lance', post: avenue(150, 10), activity: 'patrol', hours: [7, 19],
    lines: { any: ['The ramps were built for horses, you know. Kings used to ride to the palace door.', 'Have you seen the lists at the Commandery? Tourney every week.'] },
    look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0xc9d6e6, pauldron: true, bracers: true, height: 1.86 } },
];

const JOBS: [string, number, ScheduleEntry['activity'], string][] = [
  ['crownguard', 16, 'patrol', 'gates'], ['knight', 8, 'patrol', 'commandery'], ['priest', 4, 'idle', 'temple'], ['scholar', 6, 'talk', 'library'],
  ['mage', 6, 'talk', 'collegium'], ['merchant', 14, 'shop', 'market'], ['citizen', 40, 'shop', 'plaza'], ['noble', 8, 'talk', 'gardens'],
  ['servant', 6, 'work', 'forecourt'], ['child', 6, 'play', 'plaza'], ['adventurer', 8, 'talk', 'guild'], ['clerk', 4, 'work', 'chancery'],
  ['pilgrim', 4, 'idle', 'temple'], ['envoyAide', 4, 'talk', 'envoys'], ['fisher', 3, 'work', 'quay'],
];

const LINES: Record<string, NpcRecord['lines']> = {
  crownguard: { any: ['Keep the peace, citizen.', 'The Crown Guard sees all from the walls.'], night: ['Curfew is a suggestion. The Guard is not.'] },
  knight: { any: ['For Crown and Lance.', 'The tourney is the third day of the week. Bring your own horse.'] },
  priest: { any: ['Dawn’s blessing on you.', 'The Sunwheel turns, and we turn with it.'] },
  scholar: { any: ['Have you read Halloran’s Chronicles? Neither have I. Nobody has. It’s nine volumes.', 'The Library’s fourth book is older than Cresha. Master Quill won’t let anyone near it.'] },
  mage: { any: ['Don’t touch the rune circle.', 'The crystal over the tower? It keeps the Collegium’s wards. Or so the Archmage says.'] },
  merchant: { any: ['Silk from Valoria! Glass from Sunspire! Granite from the holds!', 'Royal charter goods, fair royal prices.'] },
  citizen: { any: ['Lovely day on the plaza.', 'Did you see the summoned hero? No? Oh. Wait.', 'The King rides the avenue on feast days. Gold everywhere. You can’t see a thing.'] },
  noble: { any: ['Do mind the hem.', 'One simply cannot get good help on the Crown Ring.'] },
  servant: { any: ['Mind the steps, the palace floors were polished this morning.', 'Kitchens feed three hundred a day. I peel for most of them.'] },
  child: { any: ['Race you to the fountain!', 'I’m going to be a knight of the Silver Lance!'] },
  adventurer: { any: ['C-rank board’s thin today. Wolves, wolves, and a bandit.', 'S-rank hall? I’ve seen the door. That counts.'] },
  clerk: { any: ['Form twelve. Triplicate.', 'The Chancellor never sleeps. Neither, apparently, do we.'] },
  pilgrim: { any: ['I walked from the Southern Marches to see the Sunwheel.', 'Dawn’s light on you, friend.'] },
  envoyAide: { any: ['The Envoy is in conference. The Envoy is always in conference.'] },
  fisher: { any: ['Pike under the bridge. Big as a dog.', 'Cast where the current slows.'] },
};

/** The capital's residents: named court and townsfolk, their places, and the walking graph. */
export function capitalResidents(): { settlement: Settlement; records: NpcRecord[] } {
  const places = new Map<string, Place>();
  places.set('plaza', { id: 'plaza', spots: ring(PLAZA[0], PLAZA[1], 19, 16, 0.2) });
  places.set('market', { id: 'market', spots: ring(MARKET[0], MARKET[1], 11, 14) });
  places.set('temple', { id: 'temple', spots: ring(TEMPLE[0], TEMPLE[1] - 26, 7, 8) });
  places.set('guild', { id: 'guild', spots: [v(GUILD[0] - 6, GUILD[1] - 13), v(GUILD[0] + 4, GUILD[1] - 14), v(GUILD[0] - 2, GUILD[1] - 16), v(GUILD[0] + 8, GUILD[1] - 12), v(GUILD[0] - 9, GUILD[1] + 13), v(GUILD[0] + 2, GUILD[1] + 13)] });
  places.set('commandery', { id: 'commandery', spots: [v(COMMANDERY[0] - 14, COMMANDERY[1] + 2), v(COMMANDERY[0] + 4, COMMANDERY[1] - 4), v(COMMANDERY[0] + 18, COMMANDERY[1] + 10), v(COMMANDERY[0] - 4, COMMANDERY[1] + 14), v(COMMANDERY[0] + 8, COMMANDERY[1] + 2), v(COMMANDERY[0] - 20, COMMANDERY[1] - 6)] });
  places.set('gates', { id: 'gates', spots: [v(EAST_GATE[0] - 16, EAST_GATE[1] - 6), v(EAST_GATE[0] - 16, EAST_GATE[1] + 8), v(SOUTH_GATE[0] - 6, SOUTH_GATE[1] - 14), v(SOUTH_GATE[0] + 7, SOUTH_GATE[1] - 14), v(WEST_GATE[0] + 14, WEST_GATE[1] - 7), v(WEST_GATE[0] + 14, WEST_GATE[1] + 7), v(...avenue(240, 9)), v(...avenue(190, -9))] });
  {
    const f = CAPITAL_SPOTS.forecourt;
    places.set('forecourt', { id: 'forecourt', spots: ring(f.x, f.z, 9, 8) });
  }
  places.set('gardens', { id: 'gardens', spots: ring(QUEENS_GARDEN[0], QUEENS_GARDEN[1], 13, 8, 0.3) });
  places.set('library', { id: 'library', spots: [v(...before(LIBRARY, 18)), v(...before(LIBRARY, 22)), v(...before(LIBRARY, 20)).add(new THREE.Vector3(3, 0, 2)), v(...before(LIBRARY, 20)).add(new THREE.Vector3(-3, 0, -2))] });
  places.set('collegium', { id: 'collegium', spots: ring(...before(COLLEGIUM, 21), 5, 6) });
  places.set('chancery', { id: 'chancery', spots: [v(...before(CHANCERY, 12)), v(...before(CHANCERY, 15)), v(...before(CHANCERY, 13)).add(new THREE.Vector3(3, 0, 0))] });
  places.set('envoys', { id: 'envoys', spots: ring(ENVOYS[0], ENVOYS[1], 8, 6) });
  places.set('tavern', { id: 'tavern', spots: ring(...avenue(212, -10), 3.2, 6) });
  places.set('quay', { id: 'quay', spots: [v(QUAY[0] - 6, QUAY[1] + 1), v(QUAY[0] - 12, QUAY[1] - 1), v(QUAY[0] - 18, QUAY[1] + 1)] });
  places.set('homes', { id: 'homes', spots: ring(CAP_CENTER[0], CAP_CENTER[1] + 40, 150, 14), indoors: true });
  const graph = capitalGraph(places);
  const records: NpcRecord[] = [];
  for (const n of NAMED) {
    const id = 'post:' + n.id;
    places.set(id, { id, spots: [v(n.post[0], n.post[1])], yaw: n.yaw });
    const [a, b] = n.hours;
    const schedule: ScheduleEntry[] = b > 24
      ? [{ from: 0, activity: n.activity, place: id }, { from: b - 24, activity: 'sleep', place: 'homes' }, { from: a, activity: n.activity, place: id }]
      : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: a, activity: n.activity, place: id }, { from: b, activity: 'sleep', place: 'homes' }];
    records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'royalCapital', look: n.look, schedule, lines: n.lines, named: true });
  }
  const rnd = mulberry32(3399);
  const FIRST = ['Aldous', 'Beatrix', 'Cedric', 'Daphne', 'Edmund', 'Felicity', 'Godfrey', 'Henrietta', 'Ignatius', 'Juliana', 'Lambert', 'Mirabel', 'Nathaniel', 'Ottoline', 'Percival', 'Rosalind', 'Sebastian', 'Theodora', 'Ulric', 'Viola', 'Wilfred', 'Yvaine'];
  const FAM = ['Ashcroft', 'Bellamy', 'Crane', 'Davenport', 'Everleigh', 'Fairfax', 'Goldwyn', 'Hartwell', 'Kingsley', 'Lindqvist', 'Montrose', 'Whitlock'];
  let k = 0;
  for (const [job, count, activity, place] of JOBS) {
    for (let i = 0; i < count; i++, k++) {
      const female = rnd() < 0.5;
      const armed = job === 'crownguard' || job === 'knight' || job === 'adventurer';
      const look: Look = {
        body: female ? 'female' : 'male', outfit: armed || job === 'mage' ? 'ranger' : 'peasant', hood: job === 'mage' && rnd() < 0.5,
        hair: female ? (['long', 'buns', 'buzzedfemale'] as const)[Math.floor(rnd() * 3)] : (['simpleparted', 'buzzed'] as const)[Math.floor(rnd() * 2)],
        beard: !female && rnd() < 0.35, hairColor: [0x1f1a17, 0x3a2618, 0x6a4428, 0x8a3f22, 0xd2b26a, 0xb8b4ae][Math.floor(rnd() * 6)],
        skin: [0xfff0e6, 0xffffff, 0xe0b894, 0xa8744e, 0x7a4e32][Math.floor(rnd() * 5)],
        linen: job === 'priest' || job === 'pilgrim' ? 0xfff4dc : [0xe8d8b8, 0xc9dbe8, 0xd8c29a, 0xe8c8c0, 0xd9cfe8][Math.floor(rnd() * 5)],
        cloth: job === 'crownguard' ? crownBlue : job === 'knight' ? 0xc9d6e6 : job === 'priest' ? gold : job === 'mage' ? [0x5a4aa0, 0x3a5a9a, 0x6a3a8a][Math.floor(rnd() * 3)]
          : job === 'noble' ? [0x7a3f8a, 0x2f3f7a, 0x8a2a3a, 0x2f6a5a][Math.floor(rnd() * 4)] : job === 'adventurer' ? [0x8a2a24, 0x3d7a45, 0x5a5a5a][Math.floor(rnd() * 3)] : undefined,
        pauldron: job === 'crownguard' || job === 'knight', bracers: job === 'knight',
        height: job === 'child' ? 1.26 + rnd() * 0.1 : female ? 1.62 + rnd() * 0.1 : 1.72 + rnd() * 0.12,
      };
      const j = (h: number) => h + (rnd() - 0.5);
      const schedule: ScheduleEntry[] = job === 'crownguard'
        ? [{ from: 0, activity: 'patrol', place: 'gates' }, { from: j(6), activity: 'patrol', place: ['plaza', 'forecourt', 'market', 'gates'][i % 4] }, { from: j(18), activity: 'patrol', place: 'gates' }]
        : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: j(job === 'fisher' || job === 'servant' ? 5.5 : 8), activity, place }, { from: j(12.5), activity: 'talk', place: i % 2 ? 'plaza' : 'market' }, { from: j(13.5), activity, place }, { from: j(18.5), activity: job === 'child' ? 'play' : 'drink', place: job === 'child' ? 'plaza' : 'tavern' }, { from: j(22), activity: 'sleep', place: 'homes' }];
      records.push({
        id: 'rc-' + k, name: `${FIRST[k % FIRST.length]} ${FAM[(k * 5) % FAM.length]}`,
        title: TITLES[job] ?? job.charAt(0).toUpperCase() + job.slice(1), job, settlement: 'royalCapital', look, schedule, lines: LINES[job],
      });
    }
  }
  return { settlement: { id: 'royalCapital', center: v(CAP_CENTER[0], CAP_CENTER[1]), radius: 330, places, nodes: graph.nodes, edges: graph.edges }, records };
}

const TITLES: Record<string, string> = {
  crownguard: 'Crown Guard', knight: 'Knight of the Silver Lance', priest: 'Priest of the Dawn', scholar: 'Scholar of the Royal Library', mage: 'Student of the Collegium',
  merchant: 'Merchant of the Crown Market', citizen: 'Citizen of the Capital', noble: 'Noble of the Crown Ring', servant: 'Palace Servant', child: 'Child of the Capital',
  adventurer: 'Adventurer of the Grand Hall', clerk: 'Clerk of the Chancery', pilgrim: 'Pilgrim', envoyAide: 'Aide to the Envoys', fisher: 'Fisher of the Crown Quay',
};

/** Walking graph from the city streets (subdivided, junctions merged) plus the way out to the quay. */
function capitalGraph(places: Map<string, Place>) {
  const nodes: THREE.Vector3[] = [];
  const edges: number[][] = [];
  const nodeAt = (x: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - x, nodes[i].z - z) < 4) return i;
    nodes.push(v(x, z));
    edges.push([]);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };
  const raw: P2[][] = [...CAP_STREETS, [WEST_GATE, [-3800, -1064], [-3880, -1030], QUAY]];
  // Streets meet where they cross (the ring roads cross every radial street):
  // put a point at every crossing on both lines, so the graph joins there.
  const lines = raw.map((line, li) => {
    const out: P2[] = [line[0]];
    for (let k = 1; k < line.length; k++) {
      const [ax, az] = line[k - 1], [bx, bz] = line[k];
      const cuts: number[] = [];
      raw.forEach((other, oi) => {
        if (oi === li) return;
        for (let m = 1; m < other.length; m++) {
          const [cx, cz] = other[m - 1], [dx, dz] = other[m];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t > 0.001 && t < 0.999 && u >= -0.001 && u <= 1.001) cuts.push(t);
        }
      });
      cuts.sort((p, q) => p - q);
      for (const t of cuts) out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      out.push(line[k]);
    }
    return out;
  });
  for (const line of lines) {
    for (let k = 1; k < line.length; k++) {
      const [ax, az] = line[k - 1], [bx, bz] = line[k];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 12));
      let prev = nodeAt(ax, az);
      for (let s = 1; s <= n; s++) {
        const cur = nodeAt(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
        link(prev, cur);
        prev = cur;
      }
    }
  }
  for (const p of places.values()) for (const s of p.spots) {
    let best = 0, bd = Infinity;
    nodes.forEach((n, i) => {
      const d = n.distanceToSquared(s);
      if (d < bd) (bd = d), (best = i);
    });
    link(nodeAt(s.x, s.z), best);
  }
  return { nodes, edges };
}
