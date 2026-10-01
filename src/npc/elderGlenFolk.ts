import * as THREE from 'three';
import type { NpcRecord, Place, ScheduleEntry, Settlement } from './npcManager';
import type { Look } from './charBuilder';
import { STREET_LINES, heightAt, PLAZA_CENTER, TOWN_R, GATES } from '../world/terrainHeight';
import { mulberry32 } from '../core/math';

// Elder Glen's townsfolk (prompt §4): the farming town that feeds Cresha.
// About eighty named residents with jobs and daily routines: farmers in the
// fields from dawn, merchants at the market, the miller and smith at work,
// children at play, guards on their rounds, and everyone at the inn after
// dark. Places and the walking graph are built from the real town layout.

export interface HouseInfo {
  x: number;
  z: number;
  rot: number;
  half: THREE.Vector3;
}

const FIRST = ['Ada', 'Bram', 'Cora', 'Dane', 'Edda', 'Finn', 'Greta', 'Hale', 'Ida', 'Jonas', 'Kerra', 'Lorne', 'Maren', 'Nils', 'Orla', 'Pim', 'Quill', 'Rosa',
  'Sten', 'Tilda', 'Ulla', 'Vance', 'Wynn', 'Ysolde', 'Aldo', 'Berit', 'Cass', 'Dorian', 'Elin', 'Fenn', 'Gilda', 'Hob', 'Isla', 'Jory', 'Kit', 'Lena',
  'Mott', 'Nessa', 'Oswin', 'Peggy', 'Rhys', 'Sabine', 'Tam', 'Una', 'Wim', 'Yara', 'Zed', 'Ansel', 'Brisa', 'Cole', 'Della', 'Evert', 'Fay', 'Gus',
  'Hester', 'Ivo', 'Juna', 'Kasimir', 'Lotte', 'Merrin'];
const FAMILY = ['Barley', 'Millward', 'Thatcher', 'Oakes', 'Brook', 'Fairfield', 'Harrow', 'Wheatley', 'Cobb', 'Fenwick', 'Hollis', 'Greaves', 'Sowerby', 'Pike'];

const SKINS = [0xfff0e6, 0xffffff, 0xe0b894, 0xa8744e, 0x7a4e32];
const HAIRS = [0x1f1a17, 0x3a2618, 0x6a4428, 0x8a3f22, 0xb0562a, 0xd2b26a, 0xb8b4ae];
const LINENS = [0xe8d8b8, 0xc9dbe8, 0xd8c29a, 0xe8c8c0, 0xb8c4a0, 0xf0e0a8, 0xd9cfe8, 0xc4d8c0];

type Job = 'farmer' | 'merchant' | 'guard' | 'child' | 'elder' | 'miller' | 'smith' | 'innfolk' | 'shepherd' | 'weaver';
const JOBS: [Job, number][] = [['farmer', 27], ['merchant', 9], ['guard', 7], ['child', 12], ['elder', 6], ['miller', 2], ['smith', 3], ['innfolk', 4], ['shepherd', 4], ['weaver', 4]];

const LINES: Record<Job, NpcRecord['lines']> = {
  farmer: {
    morning: ['Up with the sun or the crows get the seed.', 'Dew’s still on the wheat. Good day for it.'],
    any: ['Half of Cresha eats what this valley grows.', 'The river’s been kind this year. Knock on wood.', 'If you see crows in the east field, run ’em off, would you?'],
    evening: ['My back’s telling me it’s time for a pint.'],
    night: ['Should be abed. Harvest won’t bring itself in.'],
  },
  merchant: {
    morning: ['Fresh bread, fresh greens, fresh from the valley!'],
    any: ['Caravans from Port Aurelle pay double for our grain this season.', 'You’ve the look of someone who needs supplies.', 'Prices? Blame the salt tax, not me.'],
    evening: ['Closing up soon. Come back at first light.'],
  },
  guard: {
    any: ['Keep your blade sheathed inside the walls.', 'Wolves have been bold near the south fields.', 'The guild handles the monsters. We handle the drunks.'],
    night: ['Stay near the lanterns after dark.', 'Something’s been moving up by the old crypt at night.'],
  },
  child: {
    any: ['Are you the hero? You don’t look like a hero.', 'Tag! You’re it!', 'My da says the crypt is haunted. I’m not scared.'],
    evening: ['Mum’s calling. Bye!'],
  },
  elder: {
    any: ['When I was young the crypt door was sealed with iron.', 'The standing stone on the north hill hums at midsummer. Nobody believes me.', 'Heroes come and go. The fields remain.'],
    evening: ['A seat by the inn fire is worth more than gold at my age.'],
  },
  miller: { any: ['The wheel turns, the stones grind, the town eats.', 'Mind the millrace; it’s deeper than it looks.'] },
  smith: { any: ['Fröst runs the forge; I just sweat in it.', 'Iron comes up the King’s Road from the port these days.'] },
  innfolk: {
    any: ['The Wayfarer never runs dry.', 'Rooms upstairs, stew by the fire.'],
    evening: ['Busy tonight. Grab a seat if you can find one.'],
  },
  shepherd: { any: ['The flock grazes the north slopes by day.', 'Lost a lamb to a wolf last week. The guild posted a bounty.'] },
  weaver: { any: ['Our wool goes all the way to the capital.', 'Blue dye costs a fortune since the port raised tariffs.'] },
};

/** Named places in Elder Glen (spots spread around each). */
function buildPlaces(houses: HouseInfo[]) {
  const places = new Map<string, Place>();
  const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const ring = (cx: number, cz: number, r: number, n: number) => Array.from({ length: n }, (_, i) => v(cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r));
  const P = PLAZA_CENTER;
  // The plaza: an outer and an inner ring, so a crowd fills the square instead of lining its rim.
  places.set('plaza', { id: 'plaza', spots: [...ring(P.x, P.y, 9.5, 14), ...ring(P.x + 1, P.y - 1, 5.5, 7)] });
  // The lanes: loitering spots along every street, a couple of metres off the
  // road, so the town's idle hours spread through it rather than piling onto the plaza.
  {
    const lanes: THREE.Vector3[] = [];
    for (const line of STREET_LINES) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let s = 6; s < len - 4; s += 11) {
          const x = ax + dx * s, z = az + dz * s;
          if (Math.hypot(x - P.x, z - P.y) < 16) continue; // the plaza has its own
          const side = lanes.length % 2 ? 1 : -1;
          lanes.push(v(x - dz * 3.2 * side, z + dx * 3.2 * side));
        }
      }
    }
    places.set('lanes', { id: 'lanes', spots: lanes });
  }
  places.set('market', { id: 'market', spots: [v(-8, 6), v(-3, 8), v(3, 8), v(8, 6), v(12, 1), v(-12, 1)], yaw: Math.PI });
  places.set('tavern', { id: 'tavern', spots: [v(-20, 21), v(-22, 22.5), v(-25, 22), v(-27, 20.5), v(-19, 19)] }); // outside the Wayfarer Inn
  places.set('forge', { id: 'forge', spots: [v(24, 17), v(29, 16)] });
  places.set('mill', { id: 'mill', spots: [v(150, 18), v(152, 24)] });
  places.set('guild', { id: 'guild', spots: [v(18, -5), v(26, -5)] });
  places.set('training', { id: 'training', spots: ring(P.x, P.y - 6, 13, 6) });
  places.set('fields', { id: 'fields', spots: Array.from({ length: 18 }, (_, i) => v(-60 + (i % 6) * 26, 150 + Math.floor(i / 6) * 22)) });
  places.set('pasture', { id: 'pasture', spots: [v(-60, -150), v(-40, -170), v(-80, -135)] });
  places.set('southGate', { id: 'southGate', spots: [v(GATES.south.x - 3, GATES.south.y - 6), v(GATES.south.x + 3, GATES.south.y - 6)] });
  places.set('northGate', { id: 'northGate', spots: [v(GATES.north.x - 3, GATES.north.y + 6), v(GATES.north.x + 3, GATES.north.y + 6)] });
  places.set('eastGate', { id: 'eastGate', spots: [v(GATES.east.x - 6, GATES.east.y - 3), v(GATES.east.x - 6, GATES.east.y + 3)] });
  places.set('westGate', { id: 'westGate', spots: [v(GATES.west.x + 6, GATES.west.y - 3), v(GATES.west.x + 6, GATES.west.y + 3)] });
  places.set('looms', { id: 'looms', spots: [v(-44, 26), v(-47, 29)] });
  // Homes: each house's front door (indoors when sleeping).
  houses.forEach((h, i) => {
    const f = new THREE.Vector3(Math.sin(h.rot), 0, Math.cos(h.rot));
    const door = new THREE.Vector3(h.x, 0, h.z).addScaledVector(f, h.half.z + 1.2);
    places.set('home' + i, { id: 'home' + i, spots: [v(door.x, door.z)], indoors: true, yaw: h.rot });
    places.set('yard' + i, { id: 'yard' + i, spots: [v(door.x, door.z)], yaw: h.rot });
  });
  return places;
}

/** A walking graph from the town's streets, subdivided every ~12 m, with junctions merged. */
function buildGraph(places: Map<string, Place>) {
  const nodes: THREE.Vector3[] = [];
  const edges: number[][] = [];
  const nodeAt = (x: number, z: number) => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - x, nodes[i].z - z) < 3.5) return i;
    nodes.push(new THREE.Vector3(x, heightAt(x, z), z));
    edges.push([]);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };
  for (const line of STREET_LINES) {
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
  // Out through the gates to the fields and pasture along the roads.
  const out: [number, number][][] = [[[0, TOWN_R - 6], [0, 130], [-14, 170]], [[0, -TOWN_R + 6], [-20, -140], [-50, -150]], [[TOWN_R - 6, 0], [150, 12]]];
  for (const line of out) {
    let prev = nodeAt(line[0][0], line[0][1]);
    for (let k = 1; k < line.length; k++) {
      const cur = nodeAt(line[k][0], line[k][1]);
      link(prev, cur);
      prev = cur;
    }
  }
  // Every place spot hooks onto its nearest street node.
  for (const p of places.values()) {
    for (const s of p.spots) {
      let best = 0, bd = Infinity;
      nodes.forEach((n, i) => {
        const d = n.distanceToSquared(s);
        if (d < bd) (bd = d), (best = i);
      });
      const i = nodeAt(s.x, s.z);
      link(i, best);
    }
  }
  return { nodes, edges };
}

function schedule(job: Job, home: string, rnd: () => number): ScheduleEntry[] {
  const j = (h: number) => h + (rnd() - 0.5) * 0.6; // everyone keeps slightly different hours
  // Free hours: some on the plaza, most out along the lanes (one choice per person).
  const square = rnd() < 0.4 ? 'plaza' : 'lanes';
  switch (job) {
    case 'farmer': return [
      { from: 0, activity: 'sleep', place: home }, { from: j(5.4), activity: 'idle', place: home.replace('home', 'yard') }, { from: j(6.2), activity: 'farm', place: 'fields' },
      { from: j(12), activity: 'idle', place: square }, { from: j(13), activity: 'farm', place: 'fields' }, { from: j(18.6), activity: 'drink', place: 'tavern' }, { from: j(21.4), activity: 'sleep', place: home }];
    case 'merchant': return [
      { from: 0, activity: 'sleep', place: home }, { from: j(6.8), activity: 'shop', place: 'market' }, { from: j(12.5), activity: 'idle', place: square },
      { from: j(13.5), activity: 'shop', place: 'market' }, { from: j(19), activity: 'drink', place: 'tavern' }, { from: j(22), activity: 'sleep', place: home }];
    case 'guard': {
      const posts = ['northGate', 'eastGate', 'plaza', 'southGate', 'westGate', 'plaza'];
      const off = Math.floor(rnd() * posts.length);
      const s: ScheduleEntry[] = [{ from: 0, activity: 'sleep', place: home }];
      // Night watch for some, day rounds for others.
      const night = rnd() < 0.34;
      const start = night ? 18 : 6;
      for (let h = 0; h < 12; h += 1.5) s.push({ from: (start + h) % 24, activity: 'patrol', place: posts[(off + h / 1.5) % posts.length] });
      if (!night) s.push({ from: 18.5, activity: 'drink', place: 'tavern' }, { from: 21.5, activity: 'sleep', place: home });
      return s.sort((a, b) => a.from - b.from);
    }
    case 'child': return [
      { from: 0, activity: 'sleep', place: home }, { from: j(7.5), activity: 'play', place: square }, { from: j(11), activity: 'play', place: 'training' },
      { from: j(12.2), activity: 'idle', place: home.replace('home', 'yard') }, { from: j(13.5), activity: 'play', place: square }, { from: j(18), activity: 'idle', place: home.replace('home', 'yard') }, { from: j(20), activity: 'sleep', place: home }];
    case 'elder': return [
      { from: 0, activity: 'sleep', place: home }, { from: j(8), activity: 'idle', place: square }, { from: j(12), activity: 'idle', place: home.replace('home', 'yard') },
      { from: j(14), activity: 'idle', place: square }, { from: j(17.5), activity: 'drink', place: 'tavern' }, { from: j(21), activity: 'sleep', place: home }];
    case 'miller': return [{ from: 0, activity: 'sleep', place: home }, { from: j(6), activity: 'work', place: 'mill' }, { from: j(18), activity: 'drink', place: 'tavern' }, { from: j(21.5), activity: 'sleep', place: home }];
    case 'smith': return [{ from: 0, activity: 'sleep', place: home }, { from: j(7), activity: 'work', place: 'forge' }, { from: j(12.5), activity: 'idle', place: square }, { from: j(13.5), activity: 'work', place: 'forge' }, { from: j(19), activity: 'drink', place: 'tavern' }, { from: j(22), activity: 'sleep', place: home }];
    case 'innfolk': return [{ from: 0, activity: 'sleep', place: home }, { from: j(9), activity: 'work', place: 'tavern' }, { from: j(15), activity: 'shop', place: 'market' }, { from: j(16.5), activity: 'work', place: 'tavern' }, { from: j(23.5), activity: 'sleep', place: home }];
    case 'shepherd': return [{ from: 0, activity: 'sleep', place: home }, { from: j(5.8), activity: 'work', place: 'pasture' }, { from: j(17.5), activity: 'idle', place: 'northGate' }, { from: j(18.5), activity: 'drink', place: 'tavern' }, { from: j(21), activity: 'sleep', place: home }];
    case 'weaver': return [{ from: 0, activity: 'sleep', place: home }, { from: j(7.5), activity: 'work', place: 'looms' }, { from: j(12.5), activity: 'talk', place: 'market' }, { from: j(13.5), activity: 'work', place: 'looms' }, { from: j(19), activity: 'drink', place: 'tavern' }, { from: j(22), activity: 'sleep', place: home }];
  }
}

function lookFor(job: Job, rnd: () => number): Look {
  const female = rnd() < 0.5;
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const hair = female ? pick(['long', 'buns', 'buzzedfemale', 'long'] as const) : pick(['simpleparted', 'buzzed', 'simpleparted'] as const);
  const look: Look = {
    body: female ? 'female' : 'male',
    outfit: job === 'guard' || job === 'shepherd' ? 'ranger' : 'peasant',
    hair: job === 'guard' ? (female ? 'buns' : 'buzzed') : hair,
    beard: !female && (job === 'elder' || rnd() < 0.3),
    hairColor: job === 'elder' ? pick([0xb8b4ae, 0xe6e2da]) : pick(HAIRS),
    skin: pick(SKINS),
    linen: pick(LINENS),
    height: job === 'child' ? 1.3 : female ? 1.62 + rnd() * 0.1 : 1.72 + rnd() * 0.12,
  };
  if (job === 'guard') look.cloth = 0x3a5f9e; // the town watch wears Cresha blue
  if (job === 'shepherd') { look.cloth = 0x6a7f3a; look.hood = rnd() < 0.5; }
  return look;
}

/** The Elder Glen settlement and its residents. */
export function elderGlenFolk(houses: HouseInfo[]): { settlement: Settlement; records: NpcRecord[] } {
  const places = buildPlaces(houses);
  const graph = buildGraph(places);
  const settlement: Settlement = { id: 'elderGlen', center: new THREE.Vector3(0, 0, 0), radius: 260, places, nodes: graph.nodes, edges: graph.edges };
  const rnd = mulberry32(20260929);
  const records: NpcRecord[] = [];
  let n = 0;
  for (const [job, count] of JOBS) {
    for (let k = 0; k < count; k++, n++) {
      const home = 'home' + ((n * 7) % Math.max(1, houses.length));
      const name = `${FIRST[n % FIRST.length]} ${FAMILY[(n * 5 + k) % FAMILY.length]}`;
      records.push({ id: 'eg-' + n, name, job, settlement: 'elderGlen', look: lookFor(job, rnd), schedule: schedule(job, home, rnd), lines: LINES[job] });
    }
  }
  return { settlement, records };
}
