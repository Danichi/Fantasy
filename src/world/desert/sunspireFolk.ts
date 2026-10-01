import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { heightAt } from '../terrainHeight';
import { cellWorld, isStreet, streetCells, GRID_NX, GRID_NZ } from './cityGrid';
import { SCAV_CAMPS, campFloor } from './desertLayout';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';

// The people of Sunspire, capital of the Sunborn (not Cresha: their own
// crown, gods and customs), and the scavengers the city has pushed out into
// the dunes. Places come from the city's street map so nobody stands in a wall.

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

export interface DesertNamed {
  id: string;
  name: string;
  title: string;
  look: Look;
  post: THREE.Vector3;
  yaw?: number;
  activity: ScheduleEntry['activity'];
  hours: [number, number];
  lines: NpcRecord['lines'];
  settlement: 'sunspire' | 'scavengers';
}

const SKIN = [0xa8744e, 0x7a4e32, 0x8a5a3a, 0xc08a5a, 0x6a4028];
const ROYAL_GOLD = 0xd4a640, TEAL = 0x1f7a7a, PURPLE = 0x5a2a7a, CRIMSON = 0x8a2a2a, DUST = 0x6a5a48;

function placesFromGrid() {
  const rnd = mulberry32(5830);
  const cells = streetCells();
  const court = cells.filter((c) => inRect(COURT, c.i, c.j));
  const gate = cells.filter((c) => inRect(GATE, c.i, c.j));
  // The bazaar: the most open square that isn't the court or the gate.
  const rest = cells.filter((c) => !inRect(COURT, c.i, c.j) && !inRect(GATE, c.i, c.j));
  const best = rest.reduce((a, b) => (b.open > a.open ? b : a), rest[0]);
  const bazaar = rest.filter((c) => Math.hypot(c.i - best.i, c.j - best.j) < 9);
  // A second, smaller square for the artisans, well away from the first.
  const far = rest.filter((c) => Math.hypot(c.i - best.i, c.j - best.j) > 50);
  const best2 = far.reduce((a, b) => (b.open > a.open ? b : a), far[0]);
  const artisans = rest.filter((c) => Math.hypot(c.i - best2.i, c.j - best2.j) < 7);
  const pick = <T,>(arr: T[], n: number) => Array.from({ length: n }, () => arr[Math.floor(rnd() * arr.length)]);
  const places = new Map<string, Place>();
  places.set('court', { id: 'court', spots: pick(court, 20).map((c) => cw(c.i, c.j)) });
  places.set('gate', { id: 'gate', spots: pick(gate, 8).map((c) => cw(c.i, c.j)) });
  places.set('bazaar', { id: 'bazaar', spots: pick(bazaar, 26).map((c) => cw(c.i, c.j)) });
  places.set('artisans', { id: 'artisans', spots: pick(artisans, 12).map((c) => cw(c.i, c.j)) });
  places.set('streets', { id: 'streets', spots: pick(rest.filter((c) => c.open > 12), 40).map((c) => cw(c.i, c.j)) });
  places.set('homes', { id: 'homes', spots: pick(rest, 20).map((c) => cw(c.i, c.j)), indoors: true });
  places.set('palace', { id: 'palace', spots: [cw(150, 110), cw(140, 108), cw(160, 112)], indoors: true });
  return { places, bazaarCenter: cw(best.i, best.j), artisansCenter: cw(best2.i, best2.j), court: court.map((c) => cw(c.i, c.j)) };
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
  // Hook every spot onto its nearest node.
  for (const p of places.values()) {
    for (const s of p.spots) {
      let best = -1, bd = Infinity;
      nodes.forEach((n, k) => {
        const d = n.distanceToSquared(s);
        if (d < bd) (bd = d), (best = k);
      });
      const k = nodes.length;
      nodes.push(s.clone());
      edges.push([]);
      if (best >= 0) link(k, best);
    }
  }
  return { nodes, edges };
}

const LINES: Record<string, NpcRecord['lines']> = {
  noble: { any: ['The sun is generous to those who stand close to the throne.', 'You smell of grass. How rustic.', 'Water from the Queen\'s wells tastes of silver, they say. I would not know anything else.'] },
  merchant: { any: ['Sun-silk! Glass from the furnaces! Spice from the deep dunes!', 'Cresha coin? We take it — at a Cresha price.', 'Everything in Sunspire is gilded. Even the bargains.'] },
  guard: { any: ['Keep to the paved ways, outlander.', 'The Sun Guard sees all that moves in the city. Beyond the walls, the sand sees the rest.', 'Scavengers are not permitted past the gate. Rules of the Crown.'] },
  priest: { any: ['The sun rose again. We give thanks; it is never certain.', 'Below the dunes the old sea still remembers us. That is why its beasts swim in sand.'] },
  citizen: { any: ['Mind the obelisk shadows at noon: they are the only cool place in the city.', 'Have you seen a sand whale breach? The whole wall shakes.', 'My cousin went out past the Hulks to trade. We have not heard from him.'] },
  child: { any: ['I saw a sand dolphin! It jumped higher than the gate!', 'Are you from the green lands? Is it true water falls from the sky there?'] },
  servant: { any: ['The palace eats more bread than the whole lower city.', 'The Vizier is in a temper. Best keep out of his shadow.'] },
  scavenger: { any: ['Scrap\'s scrap. Glass, iron, bone — the city melts it down and pays us a tenth.', 'They threw us out when the wells ran low. Now they buy back what we dig up.', 'Watch the dune crests. If one moves, run.'], night: ['Keep the fire small. Light brings raiders.'] },
};

const named = (r: { court: THREE.Vector3[]; bazaarCenter: THREE.Vector3; artisansCenter: THREE.Vector3 }): DesertNamed[] => {
  const courtFront = r.court.reduce((a, b) => (b.x < a.x ? b : a), r.court[0]); // west end: the palace steps
  const off = (p: THREE.Vector3, dx: number, dz: number) => v(p.x + dx, p.z + dz);
  const camp = (k: number, dx: number, dz: number) => v(SCAV_CAMPS[k][0] + dx, SCAV_CAMPS[k][1] + dz);
  return [
    {
      id: 'neferah', name: 'Queen Neferah Sunborn', title: 'Sovereign of Sunspire', settlement: 'sunspire',
      look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x120c08, skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: ROYAL_GOLD, height: 1.82 },
      post: off(courtFront, 4, 0), yaw: Math.PI / 2, activity: 'idle', hours: [8, 20],
      lines: { any: ['You stand in the Court of the Sun. Kneel, or at least stand straight.', 'Cresha sends us a sword-for-hire. How generous of them.', 'My city is gold on the outside. Keep looking, and you will see the rest.'] },
    },
    {
      id: 'ankhet', name: 'Vizier Ankhet', title: 'Voice of the Throne', settlement: 'sunspire',
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x1a1410, skin: 0x7a4e32, linen: 0xe8e0c8, cloth: PURPLE, height: 1.86 },
      post: off(courtFront, 7, -4), yaw: Math.PI / 2, activity: 'talk', hours: [7, 21],
      lines: { any: ['Petitions to the Throne are heard at dawn. Bribes, at any hour.', 'The scavengers are a necessary inconvenience.'] },
    },
    {
      id: 'sethi', name: 'Prince Sethi', title: 'Heir of the Sun', settlement: 'sunspire',
      look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x120c08, skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: TEAL, height: 1.78 },
      post: off(courtFront, 6, 5), yaw: Math.PI / 2, activity: 'talk', hours: [9, 22],
      lines: { any: ['Mother thinks the walls keep the sand out. I have been outside. The sand is winning.', 'Have you hunted a sand shark? I would give my second-best falcon to see one up close.'] },
    },
    {
      id: 'mereth', name: 'Captain Mereth', title: 'Captain of the Sun Guard', settlement: 'sunspire',
      look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x1a1410, skin: 0xa8744e, cloth: ROYAL_GOLD, pauldron: true, bracers: true, height: 1.76 },
      post: off(cwCenter(GATE), 0, 3), yaw: Math.PI / 2, activity: 'patrol', hours: [6, 22],
      lines: { any: ['State your business at the gate.', 'My guard holds the walls. The desert beyond them is a different matter.'] },
    },
    {
      id: 'hassun', name: 'Bazaar Master Hassun', title: 'Merchant Prince of the Grand Bazaar', settlement: 'sunspire',
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xc08a5a, linen: 0xf2e6c8, cloth: CRIMSON, height: 1.7 },
      post: off(r.bazaarCenter, 0, 0), activity: 'talk', hours: [7, 21],
      lines: { any: ['Blades of sunsteel, curved as the dunes!', 'Everything has a price. Even you, friend. Especially you.'] },
    },
    {
      id: 'ptah', name: 'Glassmaker Ptahmose', title: 'Master of the Furnace Street', settlement: 'sunspire',
      look: { body: 'male', outfit: 'peasant', hair: null, beard: true, hairColor: 0x3a2a1a, skin: 0x7a4e32, linen: 0xc8b898, cloth: 0x8a5a2a, height: 1.74 },
      post: off(r.artisansCenter, 0, 0), activity: 'work', hours: [6, 19],
      lines: { any: ['The furnaces eat sand and give back glass. The desert never runs out of either.'] },
    },
    // ---- the scavengers outside the walls ----
    {
      id: 'rusk', name: 'Old Rusk', title: 'Scrap Boss of the Rust Market', settlement: 'scavengers',
      look: { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x8a8070, skin: 0x8a5a3a, cloth: DUST, linen: 0x9a8a70, bracers: true, height: 1.72 },
      post: camp(0, 2, 2), activity: 'idle', hours: [5, 23],
      lines: { any: ['The city throws away what it can\'t use. We\'re what it can\'t use.', 'Buy, sell or move along. Rust Market rules.'] },
    },
    {
      id: 'tamsa', name: 'Tamsa Glassfinder', title: 'Keeper of the Waystop Well', settlement: 'scavengers',
      look: { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x2a1a10, skin: 0xa8744e, cloth: 0x7a6040, linen: 0xa89878, height: 1.66 },
      post: camp(5, -2, 1), activity: 'talk', hours: [5, 22],
      lines: { any: ['Last water before the city. Drink — it\'s free. The city\'s isn\'t.', 'Raiders from Glasswind took my brother\'s skiff. Some of us steal from each other too.'] },
    },
    {
      id: 'kib', name: 'Kib', title: 'Scavenger Child', settlement: 'scavengers',
      look: { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0x2a1a10, skin: 0x8a5a3a, linen: 0x8a7a60, cloth: DUST, height: 1.25 },
      post: camp(0, -6, 4), activity: 'play', hours: [7, 20],
      lines: { any: ['I found a shark tooth as big as my hand! Wanna see? ...No, you can\'t have it.'] },
    },
  ];
};

function cwCenter(r: typeof COURT) {
  return cw(Math.round((r.i0 + r.i1) / 2), Math.round((r.j0 + r.j1) / 2));
}

const JOBS: [string, number, ScheduleEntry['activity'], string][] = [
  ['merchant', 12, 'shop', 'bazaar'], ['noble', 9, 'talk', 'court'], ['guard', 8, 'patrol', 'gate'], ['citizen', 14, 'talk', 'streets'],
  ['priest', 4, 'idle', 'court'], ['servant', 6, 'work', 'streets'], ['child', 6, 'play', 'bazaar'], ['merchant', 5, 'work', 'artisans'],
];
const FIRST = ['Amun', 'Bastet', 'Djedi', 'Hathor', 'Imhet', 'Khaf', 'Meri', 'Nebet', 'Omari', 'Paser', 'Renni', 'Sahure', 'Tiye', 'Userkaf', 'Wadjet', 'Ahmose', 'Isis', 'Kemsit', 'Nubia', 'Seti'];
const FAM = ['of the Third Gate', 'Sandborn', 'of the Furnace', 'Goldhand', 'of the Wells', 'Sunward', 'Duneglass', 'of the Long Shadow'];

export function sunspireResidents(): { settlements: Settlement[]; records: NpcRecord[]; named: DesertNamed[] } {
  const r = placesFromGrid();
  const places = r.places;
  const records: NpcRecord[] = [];
  const nm = named(r);
  for (const n of nm.filter((n) => n.settlement === 'sunspire')) {
    const id = 'post:' + n.id;
    places.set(id, { id, spots: [n.post], yaw: n.yaw });
    const [a, b] = n.hours;
    const home = n.id === 'neferah' || n.id === 'ankhet' || n.id === 'sethi' ? 'palace' : 'homes';
    const schedule: ScheduleEntry[] = [{ from: 0, activity: 'sleep', place: home }, { from: a, activity: n.activity, place: id }, { from: b, activity: 'sleep', place: home }];
    records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'sunspire', look: n.look, schedule, lines: n.lines, named: true });
  }
  const rnd = mulberry32(6020);
  const looks = new Map<string, Look>();
  let k = 0;
  for (const [job, count, activity, place] of JOBS) {
    for (let i = 0; i < count; i++, k++) {
      // Three looks per trade, shared: fewer unique looks to bake (the sprite
      // atlas is shared by the whole world) and the crowd still varies.
      const variant = i % 3;
      const lkey = job + ':' + variant;
      const vr = mulberry32(job.length * 97 + variant * 13 + 5);
      const female = variant === 1 || (variant === 2 && vr() < 0.5);
      const rich = job === 'noble' || job === 'priest';
      const look: Look = looks.get(lkey) ?? {
        body: female ? 'female' : 'male',
        outfit: job === 'guard' ? 'ranger' : 'peasant',
        hood: job === 'priest' || (!rich && rnd() < 0.35),
        hair: female ? (['long', 'buns', 'long'] as const)[Math.floor(rnd() * 3)] : (['buzzed', 'simpleparted', null] as const)[Math.floor(rnd() * 3)],
        beard: !female && rnd() < 0.5,
        hairColor: [0x120c08, 0x1a1410, 0x2a1a10][Math.floor(rnd() * 3)],
        skin: SKIN[Math.floor(rnd() * SKIN.length)],
        linen: rich ? 0xfaf2dc : [0xe8dcc0, 0xd8c8a0, 0xf0e4c8][Math.floor(rnd() * 3)],
        cloth: job === 'guard' ? ROYAL_GOLD : rich ? [ROYAL_GOLD, PURPLE, TEAL, CRIMSON][Math.floor(rnd() * 4)] : [TEAL, 0xb86a2a, 0x2a5a8a, 0x8a6a2a][Math.floor(rnd() * 4)],
        pauldron: job === 'guard', bracers: job === 'guard',
        height: job === 'child' ? 1.25 : female ? 1.62 + rnd() * 0.1 : 1.72 + rnd() * 0.12,
      };
      looks.set(lkey, look);
      const j = (h: number) => h + (rnd() - 0.5);
      const schedule: ScheduleEntry[] = job === 'guard'
        ? [{ from: 0, activity: 'patrol', place: 'gate' }, { from: j(6), activity: 'patrol', place: i % 2 ? 'court' : 'bazaar' }, { from: j(20), activity: 'patrol', place: 'gate' }]
        : [{ from: 0, activity: 'sleep', place: 'homes' }, { from: j(7), activity, place }, { from: j(12), activity: 'talk', place: 'bazaar' }, { from: j(13.5), activity, place }, { from: j(19), activity: 'talk', place: 'streets' }, { from: j(22), activity: 'sleep', place: 'homes' }];
      records.push({ id: 'ss-' + k, name: `${FIRST[k % FIRST.length]} ${FAM[(k * 3) % FAM.length]}`, title: job.charAt(0).toUpperCase() + job.slice(1) + ' of Sunspire', job, settlement: 'sunspire', look, schedule, lines: LINES[job] });
    }
  }
  const graph = streetGraph(places);
  const sunspire: Settlement = { id: 'sunspire', center: cwCenter(COURT), radius: 480, places, nodes: graph.nodes, edges: graph.edges };

  // ---- scavenger camps (only the friendly ones are settled; raiders are enemies) ----
  const sp = new Map<string, Place>();
  const ring = (cx: number, cz: number, r: number, n: number) => Array.from({ length: n }, (_, i) => v(cx + Math.cos((i / n) * 6.28) * r, cz + Math.sin((i / n) * 6.28) * r));
  const camps = [0, 5];
  for (const c of camps) {
    const [cx, cz, cr] = SCAV_CAMPS[c];
    sp.set('camp' + c, { id: 'camp' + c, spots: ring(cx, cz, cr * 0.45, 10) });
    sp.set('fire' + c, { id: 'fire' + c, spots: ring(cx, cz, 3.2, 6) });
    sp.set('huts' + c, { id: 'huts' + c, spots: ring(cx, cz, cr * 0.7, 6), indoors: true });
  }
  for (const n of nm.filter((n) => n.settlement === 'scavengers')) {
    const id = 'post:' + n.id;
    sp.set(id, { id, spots: [n.post], yaw: n.yaw });
    const c = n.id === 'tamsa' ? 5 : 0;
    records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'scavengers', look: n.look, schedule: [{ from: 0, activity: 'sleep', place: 'huts' + c }, { from: n.hours[0], activity: n.activity, place: id }, { from: n.hours[1], activity: 'sleep', place: 'huts' + c }], lines: n.lines, named: true });
  }
  const srnd = mulberry32(777);
  const scavLooks: Look[] = [];
  for (let i = 0; i < 16; i++) {
    const c = camps[i % 2];
    const female = i % 4 === 1 || i % 4 === 3;
    const look: Look = scavLooks[i % 4] ?? {
      body: female ? 'female' : 'male', outfit: srnd() < 0.6 ? 'ranger' : 'peasant', hood: srnd() < 0.7,
      hair: female ? 'long' : (['buzzed', 'simpleparted'] as const)[Math.floor(srnd() * 2)], beard: !female && srnd() < 0.6,
      hairColor: [0x1a1410, 0x3a2a1a, 0x6a5a48][Math.floor(srnd() * 3)], skin: SKIN[Math.floor(srnd() * SKIN.length)],
      cloth: [DUST, 0x5a4a3a, 0x7a6040, 0x4a4a40][Math.floor(srnd() * 4)], linen: [0x9a8a70, 0x8a7a60, 0xa89878][Math.floor(srnd() * 3)],
      bracers: srnd() < 0.5, height: 1.6 + srnd() * 0.2,
    };
    scavLooks[i % 4] = look;
    const jj = (h: number) => h + (srnd() - 0.5);
    records.push({
      id: 'sc-' + i, name: ['Grit', 'Ash', 'Tarn', 'Wick', 'Sable', 'Cinder', 'Rook', 'Flint'][i % 8] + ' ' + ['of the Rust', 'No-Well', 'Glassback', 'the Digger'][i % 4], title: 'Scavenger', job: 'scavenger', settlement: 'scavengers', look,
      schedule: [{ from: 0, activity: 'sleep', place: 'huts' + c }, { from: jj(6), activity: i % 3 ? 'work' : 'idle', place: 'camp' + c }, { from: jj(18.5), activity: 'talk', place: 'fire' + c }, { from: jj(23), activity: 'sleep', place: 'huts' + c }],
      lines: LINES.scavenger,
    });
  }
  // The camps have no streets: a node at each spot linked to the camp centre.
  const nodes: THREE.Vector3[] = [], edges: number[][] = [];
  for (const c of camps) {
    const centre = nodes.length;
    nodes.push(v(SCAV_CAMPS[c][0], SCAV_CAMPS[c][1]));
    edges.push([]);
    for (const p of sp.values()) {
      if (!p.spots.every((s) => s.distanceTo(nodes[centre]) < SCAV_CAMPS[c][2] + 8)) continue;
      for (const s of p.spots) {
        const k = nodes.length;
        nodes.push(s.clone());
        edges.push([centre]);
        edges[centre].push(k);
      }
    }
  }
  const scav: Settlement = { id: 'scavengers', center: v(SCAV_CAMPS[0][0], SCAV_CAMPS[0][1]), radius: 1600, places: sp, nodes, edges };
  void campFloor;
  return { settlements: [sunspire, scav], records, named: nm };
}
