import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { heightAt } from '../terrainHeight';
import { cellWorld, isStreet, streetCells, cityDoors, doorFront, CITY_SHOPS, GRID_NX, GRID_NZ } from './cityGrid';
import { SCAV_CAMPS, CAMP_INFO, SUNSPIRE, SUNSPIRE_GATE_Z, WEST_GATE } from './desertLayout';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';

// The people of Ghagrabba, capital of the Sunborn (not Cresha: their own
// crown, gods and customs), the royal family in the Palace of the Sun, and
// the scavenger villages out in the dunes. Places come from the city's street
// map so nobody stands in a wall.

const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
const cw = (i: number, j: number) => {
  const [x, z] = cellWorld(i, j);
  return v(x, z);
};

/** Cells of the obelisk forecourt before the palace (the Court of the Sun). */
const COURT = { i0: 184, i1: 213, j0: 97, j1: 123 };
/** Just inside the east gate. */
const GATE = { i0: 236, i1: 249, j0: 104, j1: 126 };
const inRect = (r: typeof COURT, i: number, j: number) => i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1;

const SKIN = [0xa8744e, 0x7a4e32, 0x8a5a3a, 0xc08a5a, 0x6a4028];
const ROYAL_GOLD = 0xd4a640, TEAL = 0x1f7a7a, PURPLE = 0x5a2a7a, CRIMSON = 0x8a2a2a, DUST = 0x6a5a48;

/** A named desert resident. `inside` people live in the palace and are met only when you enter. */
interface Named {
  id: string;
  name: string;
  title: string;
  look: Look;
  post: THREE.Vector3;
  yaw?: number;
  activity: ScheduleEntry['activity'];
  hours: [number, number];
  lines: NpcRecord['lines'];
  inside?: boolean;
}

/** The royal household, met in the palace (main.ts seats them by their palace spot). */
export const PALACE_SEATS: Record<string, string> = {
  neferah: 'throne', ankhet: 'vizier', khamet: 'consort', sethi: 'prince', nefret: 'princess', tiyet: 'queenMother',
  senmut: 'treasurer', meryre: 'herald', 'pguard-1': 'guardL', 'pguard-2': 'guardR', bennu: 'servant', 'noble-court-1': 'court1', 'noble-court-2': 'court2', hori: 'diner', 'lady-isetnofret': 'garden', 'lady-tamit': 'garden2',
};

const LINES: Record<string, NpcRecord['lines']> = {
  noble: { any: ['The sun is generous to those who stand close to the throne.', 'You smell of grass. How rustic.', 'Water from the Queen\'s wells tastes of silver, they say. I would not know anything else.'] },
  merchant: { any: ['Sun-silk! Glass from the furnaces! Spice from the deep dunes!', 'Cresha coin? We take it — at a Cresha price.', 'Everything in Ghagrabba is gilded. Even the bargains.'] },
  guard: { any: ['Keep to the paved ways, outlander.', 'The Sun Guard sees all that moves in the city. Beyond the walls, the sand sees the rest.', 'Scavengers are not permitted past the gate. Rules of the Crown.'] },
  priest: { any: ['The sun rose again. We give thanks; it is never certain.', 'Below the dunes the old sea still remembers us. That is why its beasts swim in sand.'] },
  citizen: { any: ['Mind the obelisk shadows at noon: they are the only cool place in the city.', 'Have you seen a sand whale breach? The whole wall shakes.', 'My cousin went out past the Hulks to trade. We have not heard from him.', 'When the sandstorms come we bar the doors and sing. Loudly. It helps.'] },
  child: { any: ['I saw a sand dolphin! It jumped higher than the gate!', 'Are you from the green lands? Is it true water falls from the sky there?'] },
  servant: { any: ['The palace eats more bread than the whole lower city.', 'The Vizier is in a temper. Best keep out of his shadow.'] },
  artisan: { any: ['Copper, glass, gold leaf. My hands remember it all.', 'The Queen ordered forty lamps for the throne room. Forty! By the new moon!'] },
  porter: { any: ['Mind your back — big load coming through!', 'Every caravan that comes in, I carry it in. Every caravan that goes out, I carry it out.'] },
  musician: { any: ['A song for a copper, a better song for two.', 'The palace musicians play the old court airs. I play what people actually hum.'] },
  scavenger: { any: ['Scrap\'s scrap. Glass, iron, bone — the city melts it down and pays us a tenth.', 'They threw us out when the wells ran low. Now they buy back what we dig up.', 'Watch the dune crests. If one moves, run.', 'A storm\'s coming. You can smell it: like hot copper.'], night: ['Keep the fire small. Light brings raiders.'] },
};

function lookFor(job: string, variant: number): Look {
  const r = mulberry32(job.length * 97 + variant * 13 + job.charCodeAt(0));
  const female = variant === 1 || (variant === 2 && r() < 0.5);
  const rich = job === 'noble' || job === 'priest';
  return {
    body: female ? 'female' : 'male',
    outfit: job === 'guard' ? 'ranger' : 'peasant',
    hood: job === 'priest' || (!rich && job !== 'guard' && r() < 0.35),
    hair: female ? (['long', 'buns', 'long'] as const)[Math.floor(r() * 3)] : (['buzzed', 'simpleparted', null] as const)[Math.floor(r() * 3)],
    beard: !female && r() < 0.5,
    hairColor: [0x120c08, 0x1a1410, 0x2a1a10][Math.floor(r() * 3)],
    skin: SKIN[Math.floor(r() * SKIN.length)],
    linen: rich ? 0xfaf2dc : [0xe8dcc0, 0xd8c8a0, 0xf0e4c8][Math.floor(r() * 3)],
    cloth: job === 'guard' ? ROYAL_GOLD : rich ? [ROYAL_GOLD, PURPLE, TEAL, CRIMSON][Math.floor(r() * 4)] : [TEAL, 0xb86a2a, 0x2a5a8a, 0x8a6a2a][Math.floor(r() * 4)],
    pauldron: job === 'guard', bracers: job === 'guard',
    height: job === 'child' ? 1.25 : female ? 1.62 + r() * 0.1 : 1.72 + r() * 0.12,
  };
}

function scavLook(variant: number): Look {
  const r = mulberry32(900 + variant * 31);
  const female = variant % 2 === 1;
  return {
    body: female ? 'female' : 'male', outfit: r() < 0.6 ? 'ranger' : 'peasant', hood: r() < 0.7,
    hair: female ? 'long' : (['buzzed', 'simpleparted'] as const)[Math.floor(r() * 2)], beard: !female && r() < 0.6,
    hairColor: [0x1a1410, 0x3a2a1a, 0x6a5a48][Math.floor(r() * 3)], skin: SKIN[Math.floor(r() * SKIN.length)],
    cloth: [DUST, 0x5a4a3a, 0x7a6040, 0x4a4a40][Math.floor(r() * 4)], linen: [0x9a8a70, 0x8a7a60, 0xa89878][Math.floor(r() * 3)],
    bracers: r() < 0.5, height: variant === 5 ? 1.25 : 1.6 + r() * 0.2,
  };
}

function placesFromGrid() {
  const rnd = mulberry32(5830);
  const cells = streetCells();
  const court = cells.filter((c) => inRect(COURT, c.i, c.j));
  const gate = cells.filter((c) => inRect(GATE, c.i, c.j));
  // The bazaar: the most open square that isn't the court or the gate.
  const rest = cells.filter((c) => !inRect(COURT, c.i, c.j) && !inRect(GATE, c.i, c.j) && c.i > 25);
  const best = rest.reduce((a, b) => (b.open > a.open ? b : a), rest[0]);
  const bazaar = rest.filter((c) => Math.hypot(c.i - best.i, c.j - best.j) < 10);
  // A second, smaller square for the artisans, well away from the first.
  const far = rest.filter((c) => Math.hypot(c.i - best.i, c.j - best.j) > 50);
  const best2 = far.reduce((a, b) => (b.open > a.open ? b : a), far[0]);
  const artisans = rest.filter((c) => Math.hypot(c.i - best2.i, c.j - best2.j) < 8);
  const pick = <T,>(arr: T[], n: number) => Array.from({ length: n }, () => arr[Math.floor(rnd() * arr.length)]);
  const places = new Map<string, Place>();
  places.set('court', { id: 'court', spots: pick(court, 30).map((c) => cw(c.i, c.j)) });
  places.set('gate', { id: 'gate', spots: pick(gate, 12).map((c) => cw(c.i, c.j)) });
  places.set('bazaar', { id: 'bazaar', spots: pick(bazaar, 50).map((c) => cw(c.i, c.j)) });
  places.set('artisans', { id: 'artisans', spots: pick(artisans, 20).map((c) => cw(c.i, c.j)) });
  // People in every quarter, not just the squares.
  places.set('streets', { id: 'streets', spots: pick(rest.filter((c) => c.open > 10), 180).map((c) => cw(c.i, c.j)) });
  places.set('westgate', { id: 'westgate', spots: pick(rest.filter((c) => c.i < 45 && Math.abs(c.j - 129.5) < 8), 8).map((c) => cw(c.i, c.j)) });
  const doors = cityDoors();
  const homes = doors.filter((d) => d.kind === 'home');
  places.set('homes', { id: 'homes', spots: homes.map((d) => v(...doorFront(d, 0))), indoors: true });
  const tav = doors.filter((d) => d.kind === 'tavern').map((d) => v(...doorFront(d, -1.5)));
  places.set('taverns', { id: 'taverns', spots: tav.length ? tav : pick(bazaar, 4).map((c) => cw(c.i, c.j)) });
  const palace = doors.find((d) => d.kind === 'palace')!;
  places.set('palace', { id: 'palace', spots: [v(...doorFront(palace, 0))], indoors: true });
  return { places, bazaarCenter: cw(best.i, best.j), artisansCenter: cw(best2.i, best2.j), court: court.map((c) => cw(c.i, c.j)), palace };
}

/** Walking graph along the streets: a node every third cell, linked where the paving runs straight between them. */
function streetGraph(places: Map<string, Place>) {
  const STEP = 3;
  const nodes: THREE.Vector3[] = [];
  const edges: number[][] = [];
  const index = new Map<number, number>();
  for (let j = 0; j < GRID_NZ; j += STEP) {
    for (let i = 0; i < GRID_NX; i += STEP) {
      if (!isStreet(i, j)) continue;
      index.set(j * GRID_NX + i, nodes.length);
      nodes.push(cw(i, j));
      edges.push([]);
    }
  }
  const link = (a: number, b: number) => {
    if (a === b || edges[a].includes(b)) return;
    edges[a].push(b);
    edges[b].push(a);
  };
  for (const [key, n] of index) {
    const i = key % GRID_NX, j = Math.floor(key / GRID_NX);
    for (const [di, dj] of [[STEP, 0], [0, STEP], [STEP, STEP], [STEP, -STEP]]) {
      const m = index.get((j + dj) * GRID_NX + (i + di));
      if (m === undefined) continue;
      let clear = true;
      for (let s = 1; s < STEP && clear; s++) clear = isStreet(i + Math.round((di * s) / STEP), j + Math.round((dj * s) / STEP));
      if (clear) link(n, m);
    }
  }
  const street = nodes.length;
  for (const p of places.values()) {
    for (const s of p.spots) {
      let best = -1, bd = Infinity;
      for (let k = 0; k < street; k++) {
        const d = nodes[k].distanceToSquared(s);
        if (d < bd) (bd = d), (best = k);
      }
      const k = nodes.length;
      nodes.push(s.clone());
      edges.push([]);
      if (best >= 0) link(k, best);
    }
  }
  return { nodes, edges };
}

function cityNamed(r: ReturnType<typeof placesFromGrid>): Named[] {
  const off = (p: THREE.Vector3, dx: number, dz: number) => v(p.x + dx, p.z + dz);
  const roy = (id: string, name: string, title: string, look: Look, lines: string[]): Named => ({ id, name, title, look, post: v(...doorFront(r.palace, 0)), activity: 'idle', hours: [0, 24], lines: { any: lines }, inside: true });
  const eastOut = SUNSPIRE.x + 440, westOut = WEST_GATE.x0 - 4;
  const guardLook = (f: boolean): Look => ({ body: f ? 'female' : 'male', outfit: 'ranger', hair: f ? 'buns' : 'buzzed', beard: !f, hairColor: 0x1a1410, skin: 0x8a5a3a, cloth: ROYAL_GOLD, pauldron: true, bracers: true, hood: false, height: f ? 1.74 : 1.86 });
  const gateLines = ['Halt. Ghagrabba is the Queen\'s city — enter in peace or not at all.', 'Weapons stay sheathed inside the walls.', 'Raiders tried the west gate last moon. They are buried under it now.'];
  const out: Named[] = [
    // ---- the royal household, inside the Palace of the Sun ----
    roy('neferah', 'Queen Neferah Sunborn', 'Sovereign of Ghagrabba', { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x120c08, skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: ROYAL_GOLD, height: 1.82 },
      ['You stand before the Sun Throne. Kneel, or at least stand straight.', 'Cresha sends us a sword-for-hire. How generous of them.', 'My city is gold on the outside. Keep looking, and you will see the rest.']),
    roy('ankhet', 'Vizier Ankhet', 'Voice of the Throne', { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x1a1410, skin: 0x7a4e32, linen: 0xe8e0c8, cloth: PURPLE, height: 1.86 },
      ['Petitions to the Throne are heard at dawn. Bribes, at any hour.', 'The scavengers are a necessary inconvenience.']),
    roy('khamet', 'Prince-Consort Khamet', 'Husband of the Queen', { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x2a1a10, skin: 0xa8744e, linen: 0xfaf2dc, cloth: TEAL, height: 1.84 },
      ['I married a queen. Some days I think I married a city.', 'Do not let Ankhet tell you what the Queen thinks. Ask her.']),
    roy('sethi', 'Prince Sethi', 'Heir of the Sun', { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x120c08, skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: TEAL, height: 1.78 },
      ['Mother thinks the walls keep the sand out. I have been outside. The sand is winning.', 'Have you hunted a sand shark? I would give my second-best falcon to see one up close.']),
    roy('nefret', 'Princess Nefret', 'Daughter of the Sun', { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x120c08, skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: PURPLE, height: 1.6 },
      ['Sethi wants to ride with the caravans. I want to read every book in the Scroll House first.', 'They say a golem sleeps under the southern sands. The old scrolls call it the Warden.']),
    roy('tiyet', 'Queen Mother Tiyet', 'Widow of the Old King', { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xd8d0c4, skin: 0x7a4e32, linen: 0xe8dcc0, cloth: CRIMSON, height: 1.56 },
      ['In my day the scavengers lived inside the walls. Ask my son-in-law why they do not now. Watch him squirm.', 'Sit, child. My knees are older than this palace and twice as loud.']),
    roy('senmut', 'Treasurer Senmut', 'Keeper of the Royal Gold', { body: 'male', outfit: 'peasant', hair: null, beard: false, skin: 0xc08a5a, linen: 0xf0e4c8, cloth: ROYAL_GOLD, height: 1.68 },
      ['Every coin in this room is counted twice a day. Please do not breathe on them.']),
    roy('meryre', 'Herald Meryre', 'Voice of the Court', { body: 'male', outfit: 'peasant', hair: 'buzzed', skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: TEAL, height: 1.76 },
      ['Approach the throne with your head bowed and your hands empty.']),
    roy('pguard-1', 'Palace Guard Ahmes', 'Sun Guard of the Throne', guardLook(false), ['No one passes without the Queen\'s leave.']),
    roy('pguard-2', 'Palace Guard Henut', 'Sun Guard of the Throne', guardLook(true), ['Eyes forward, outlander.']),
    roy('bennu', 'Bennu', 'Palace Servant', lookFor('servant', 1), ['Wine? Dates? Please say no, I have forty more trays to carry.']),
    roy('hori', 'Lord Hori', 'Courtier', lookFor('noble', 0), ['The royal table seats twelve. I have eaten at it twice. I count every time.']),
    roy('lady-isetnofret', 'Lady Isetnofret', 'Lady of the Court', lookFor('noble', 1), ['The garden is the only place in the city with grass. Do not step on it.']),
    roy('lady-tamit', 'Lady Tamit', 'Lady of the Court', lookFor('noble', 2), ['Have you met the Princess? She is cleverer than the whole court together.']),
    roy('noble-court-1', 'Lord Nebamun', 'Courtier', lookFor('noble', 0), ['A petition to the throne takes three days to be heard. A bribe takes three minutes.']),
    roy('noble-court-2', 'Lady Baketamun', 'Courtier', lookFor('noble', 2), ['Mind where you stand. The Vizier counts footsteps.']),
    // ---- the city ----
    {
      id: 'mereth', name: 'Captain Mereth', title: 'Captain of the Sun Guard',
      look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x1a1410, skin: 0xa8744e, cloth: ROYAL_GOLD, pauldron: true, bracers: true, height: 1.76 },
      post: v(SUNSPIRE.x + 400, SUNSPIRE_GATE_Z + 4), yaw: Math.PI / 2, activity: 'patrol', hours: [6, 22],
      lines: { any: ['State your business at the gate.', 'My guard holds the walls. The desert beyond them is a different matter.', 'Something walks under the southern sand. My scouts call it the Warden. They do not go south any more.'] },
    },
    {
      id: 'hassun', name: 'Bazaar Master Hassun', title: 'Merchant Prince of the Grand Bazaar',
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xc08a5a, linen: 0xf2e6c8, cloth: CRIMSON, height: 1.7 },
      post: off(r.bazaarCenter, 0, 0), activity: 'talk', hours: [7, 21],
      lines: { any: ['Blades of sunsteel, curved as the dunes!', 'Everything has a price. Even you, friend. Especially you.'] },
    },
    {
      id: 'ptah', name: 'Glassmaker Ptahmose', title: 'Master of the Furnace Street',
      look: { body: 'male', outfit: 'peasant', hair: null, beard: true, hairColor: 0x3a2a1a, skin: 0x7a4e32, linen: 0xc8b898, cloth: 0x8a5a2a, height: 1.74 },
      post: off(r.artisansCenter, 0, 0), activity: 'work', hours: [6, 19],
      lines: { any: ['The furnaces eat sand and give back glass. The desert never runs out of either.'] },
    },
    // Two guards outside each gate.
    { id: 'gateguard-1', name: 'Gate Guard Kawab', title: 'Sun Guard · East Gate', look: guardLook(false), post: v(eastOut, SUNSPIRE_GATE_Z - 6.5), yaw: Math.PI / 2, activity: 'patrol', hours: [0, 24], lines: { any: gateLines } },
    { id: 'gateguard-2', name: 'Gate Guard Isis', title: 'Sun Guard · East Gate', look: guardLook(true), post: v(eastOut, SUNSPIRE_GATE_Z + 6.5), yaw: Math.PI / 2, activity: 'patrol', hours: [0, 24], lines: { any: gateLines } },
    { id: 'gateguard-3', name: 'Gate Guard Rahotep', title: 'Sun Guard · West Gate', look: guardLook(false), post: v(westOut, WEST_GATE.z - 6.5), yaw: -Math.PI / 2, activity: 'patrol', hours: [0, 24], lines: { any: gateLines } },
    { id: 'gateguard-4', name: 'Gate Guard Nebet', title: 'Sun Guard · West Gate', look: guardLook(true), post: v(westOut, WEST_GATE.z + 6.5), yaw: -Math.PI / 2, activity: 'patrol', hours: [0, 24], lines: { any: gateLines } },
  ];
  // Shopkeepers stand at their doors by day and keep the shop inside.
  const doors = cityDoors();
  CITY_SHOPS.forEach(([id, name, shop], k) => {
    const d = doors.find((x) => x.keeper === id)!;
    const [fx, fz] = doorFront(d, -1.6);
    out.push({ id, name, title: shop, look: lookFor('merchant', k % 3), post: v(fx, fz), yaw: d.yaw, activity: 'shop', hours: [7, 21], lines: { any: [`Welcome to ${shop}. Step inside — the shade is free.`] } });
  });
  return out;
}

const JOBS: [string, number, ScheduleEntry['activity'], string][] = [
  ['merchant', 30, 'shop', 'bazaar'], ['noble', 16, 'talk', 'court'], ['guard', 18, 'patrol', 'gate'], ['citizen', 52, 'talk', 'streets'],
  ['priest', 8, 'idle', 'court'], ['servant', 14, 'work', 'streets'], ['child', 18, 'play', 'streets'], ['artisan', 16, 'work', 'artisans'],
  ['porter', 12, 'work', 'gate'], ['musician', 5, 'play', 'bazaar'],
];
const FIRST = ['Amun', 'Bastet', 'Djedi', 'Hathor', 'Imhet', 'Khaf', 'Meri', 'Nebet', 'Omari', 'Paser', 'Renni', 'Sahure', 'Tiye', 'Userkaf', 'Wadjet', 'Ahmose', 'Isis', 'Kemsit', 'Nubia', 'Seti', 'Huya', 'Mutem', 'Peshet', 'Qenna'];
const FAM = ['of the Third Gate', 'Sandborn', 'of the Furnace', 'Goldhand', 'of the Wells', 'Sunward', 'Duneglass', 'of the Long Shadow', 'of the Bazaar', 'Palmreed'];

const VILLAGE_ELDERS = ['Old Mother Huy', 'Elder Kenamun', 'Wise Ta-Nedjem', 'Elder Ramose', 'Grandmother Sheri', 'Elder Djeser'];

export function sunspireResidents(): { settlements: Settlement[]; records: NpcRecord[] } {
  const r = placesFromGrid();
  const places = r.places;
  const records: NpcRecord[] = [];
  for (const n of cityNamed(r)) {
    if (n.inside) {
      records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'sunspire', look: n.look, schedule: [{ from: 0, activity: 'idle', place: 'palace' }], lines: n.lines, named: true });
      continue;
    }
    const id = 'post:' + n.id;
    places.set(id, { id, spots: [n.post], yaw: n.yaw });
    const [a, b] = n.hours;
    const schedule: ScheduleEntry[] = b - a >= 24 ? [{ from: 0, activity: n.activity, place: id }] : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: a, activity: n.activity, place: id }, { from: b, activity: 'sleep', place: 'homes' }];
    records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'sunspire', look: n.look, schedule, lines: n.lines, named: true });
  }
  const rnd = mulberry32(6020);
  let k = 0;
  for (const [job, count, activity, place] of JOBS) {
    for (let i = 0; i < count; i++, k++) {
      const look = lookFor(job, i % 3);
      const j = (h: number) => h + (rnd() - 0.5);
      const roam = rnd() < 0.45 ? 'streets' : place;
      const schedule: ScheduleEntry[] = job === 'guard'
        ? [{ from: 0, activity: 'patrol', place: i % 3 === 0 ? 'westgate' : 'gate' }, { from: j(6), activity: 'patrol', place: i % 3 === 1 ? 'court' : i % 3 === 2 ? 'streets' : 'bazaar' }, { from: j(20), activity: 'patrol', place: i % 2 ? 'westgate' : 'gate' }]
        : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: j(6.5), activity, place: roam }, { from: j(11.5), activity: 'talk', place: 'bazaar' }, { from: j(13.5), activity, place }, { from: j(18.5), activity: 'drink', place: rnd() < 0.4 ? 'taverns' : 'streets' }, { from: j(22.5), activity: 'sleep', place: 'homes' }];
      records.push({ id: 'ss-' + k, name: `${FIRST[k % FIRST.length]} ${FAM[(k * 3) % FAM.length]}`, title: job.charAt(0).toUpperCase() + job.slice(1) + ' of Ghagrabba', job, settlement: 'sunspire', look, schedule, lines: LINES[job] });
    }
  }
  const graph = streetGraph(places);
  const settlements: Settlement[] = [{ id: 'sunspire', center: v(SUNSPIRE.x, SUNSPIRE.z), radius: 520, places, nodes: graph.nodes, edges: graph.edges }];

  // ---- the friendly scavenger villages: an elder, a trader and villagers each ----
  const ring = (cx: number, cz: number, rad: number, n: number) => Array.from({ length: n }, (_, i) => v(cx + Math.cos((i / n) * 6.28) * rad, cz + Math.sin((i / n) * 6.28) * rad));
  let elder = 0;
  CAMP_INFO.forEach((info, c) => {
    if (!info.friendly) return;
    const [cx, cz, cr] = SCAV_CAMPS[c];
    const sid = 'village' + c;
    const sp = new Map<string, Place>();
    sp.set('camp', { id: 'camp', spots: ring(cx, cz, cr * 0.45, 12) });
    sp.set('fire', { id: 'fire', spots: ring(cx, cz, 3.2, 8) });
    sp.set('huts', { id: 'huts', spots: ring(cx, cz, cr * 0.7, 6), indoors: true });
    const post = (id: string, x: number, z: number) => {
      sp.set('post:' + id, { id: 'post:' + id, spots: [v(x, z)] });
      return 'post:' + id;
    };
    const named = (id: string, name: string, title: string, look: Look, lines: NpcRecord['lines'], x: number, z: number, act: ScheduleEntry['activity'] = 'idle') =>
      records.push({ id, name, title, job: id, settlement: sid, look, schedule: [{ from: 0, activity: 'sleep', place: 'huts' }, { from: 5.5, activity: act, place: post(id, x, z) }, { from: 22.5, activity: 'sleep', place: 'huts' }], lines, named: true });
    if (c === 0) {
      named('rusk', 'Old Rusk', 'Scrap Boss of the Rust Market', { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x8a8070, skin: 0x8a5a3a, cloth: DUST, linen: 0x9a8a70, bracers: true, height: 1.72 },
        { any: ['The city throws away what it can\'t use. We\'re what it can\'t use.', 'Buy, sell or move along. Rust Market rules.'] }, cx + 2, cz + 2);
      named('kib', 'Kib', 'Scavenger Child', scavLook(5), { any: ['I found a shark tooth as big as my hand! Wanna see? ...No, you can\'t have it.'] }, cx - 6, cz + 4, 'play');
    } else if (c === 5) {
      named('tamsa', 'Tamsa Glassfinder', 'Keeper of the Waystop Well', { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x2a1a10, skin: 0xa8744e, cloth: 0x7a6040, linen: 0xa89878, height: 1.66 },
        { any: ['Last water before the city. Drink — it\'s free. The city\'s isn\'t.', 'Raiders from Glasswind took my brother\'s skiff. Some of us steal from each other too.'] }, cx - 2, cz + 1, 'talk');
    } else {
      named('elder-' + c, VILLAGE_ELDERS[elder++ % VILLAGE_ELDERS.length], 'Elder of ' + info.name.replace(/^The /, ''), scavLook(elder + 1),
        { any: [`${info.name} was a well once. Now it is a few huts, a fire and whoever is still breathing.`, 'The raider camps hit us every few weeks. Every one you break buys us a month.', 'When the sky turns brown, get under a roof. The storms strip skin.'] }, cx + 3, cz - 2, 'talk');
    }
    named('vtrader-' + c, ['Haggler Ib', 'Swapper Nenet', 'Trader Wenu', 'Barterwife Meryt', 'Dealer Pa-Ankh', 'Scrapmonger Iti'][c % 6], 'Trader of ' + info.name.replace(/^The /, ''), scavLook(c % 5),
      { any: ['Scrap for water, water for scrap. Simple trade.'] }, cx - 4, cz - 3, 'shop');
    for (let i = 0; i < 9; i++) {
      const jj = (h: number) => h + ((i * 37) % 10) / 10 - 0.5;
      records.push({
        id: `sc-${c}-${i}`, name: ['Grit', 'Ash', 'Tarn', 'Wick', 'Sable', 'Cinder', 'Rook', 'Flint', 'Dune'][i] + ' ' + ['of the Rust', 'No-Well', 'Glassback', 'the Digger'][(i + c) % 4], title: 'Scavenger of ' + info.name.replace(/^The /, ''), job: 'scavenger', settlement: sid, look: scavLook(i % 6),
        schedule: [{ from: 0, activity: 'sleep', place: 'huts' }, { from: jj(6), activity: i % 3 ? 'work' : 'idle', place: 'camp' }, { from: jj(18.5), activity: 'talk', place: 'fire' }, { from: jj(23), activity: 'sleep', place: 'huts' }],
        lines: LINES.scavenger,
      });
    }
    // No streets out here: every spot links to the centre of the camp.
    const nodes: THREE.Vector3[] = [v(cx, cz)], edges: number[][] = [[]];
    for (const p of sp.values()) for (const s of p.spots) {
      nodes.push(s.clone());
      edges.push([0]);
      edges[0].push(nodes.length - 1);
    }
    settlements.push({ id: sid, center: v(cx, cz), radius: cr + 30, places: sp, nodes, edges });
  });
  return { settlements, records };
}
