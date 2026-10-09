import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import type { NpcRecord, Place, Settlement, ScheduleEntry, Activity } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';

// The people of the Verdant Elves (docs/design/verdant-elves.md §6): the
// woodcutters of Thornwick and their foreman Corwen Ashford, Nimri the
// half-wild guide, the sentinel at the marker stone, the hidden village of
// Silverbough, the Council of Leaves and the teachers of the Elven Sanctum,
// Sylwen Starwatcher at Moonlight Glade and the Hermit of the Hollow.
// Records only: the forest's builders hand in where everyone stands.

export interface Person {
  id: string;
  name: string;
  title: string;
  look: Look;
  post: THREE.Vector3;
  yaw?: number;
  activity: Activity;
  /** on duty [from, to); `to` past 24 wraps over midnight; [0, 24] never leaves */
  hours: [number, number];
  lines: NpcRecord['lines'];
}
export interface Crowd {
  job: string;
  n: number;
  activity: Activity;
  spots: THREE.Vector3[];
  looks: Look[];
  lines: NpcRecord['lines'];
  title: string;
  /** working hours (default 7 to 20) */
  hours?: [number, number];
}
export interface FolkSettlement { settlement: Settlement; records: NpcRecord[] }

const rnd = mulberry32(7171);

/** A settlement of named people at their posts and a working crowd (same shape as the Crown Road's). */
export function settlementOf(id: string, center: THREE.Vector3, radius: number, people: Person[], crowd: Crowd[] = [], extra: Place[] = []): FolkSettlement {
  const places = new Map<string, Place>();
  const records: NpcRecord[] = [];
  places.set('home', { id: 'home', spots: [center.clone()], indoors: true });
  for (const p of extra) places.set(p.id, p);
  if (!places.has('tavern')) places.set('tavern', { id: 'tavern', spots: [center.clone()], indoors: true });
  for (const p of people) {
    places.set('post:' + p.id, { id: 'post:' + p.id, spots: [p.post], yaw: p.yaw });
    const [a, b] = p.hours;
    const schedule: ScheduleEntry[] = a <= 0 && b >= 24
      ? [{ from: 0, activity: p.activity, place: 'post:' + p.id }]
      : b > 24
        ? [{ from: 0, activity: p.activity, place: 'post:' + p.id }, { from: b - 24, activity: 'sleep', place: 'home' }, { from: a, activity: p.activity, place: 'post:' + p.id }]
        : [{ from: 0, activity: 'sleep', place: 'home' }, { from: a, activity: p.activity, place: 'post:' + p.id }, { from: b, activity: 'sleep', place: 'home' }];
    records.push({ id: p.id, name: p.name, title: p.title, job: p.id, settlement: id, look: p.look, schedule, lines: p.lines, named: true });
  }
  let n = 0;
  for (const c of crowd) {
    const pid = 'work:' + c.job;
    places.set(pid, { id: pid, spots: c.spots });
    const [h0, h1] = c.hours ?? [7, 20];
    for (let i = 0; i < c.n; i++, n++) {
      const j = (h: number) => h + (rnd() - 0.5);
      records.push({
        id: `${id}-${n}`, name: c.title, title: c.title, job: c.job, settlement: id, look: c.looks[i % c.looks.length], lines: c.lines,
        schedule: [{ from: 0, activity: 'sleep', place: 'home' }, { from: j(h0), activity: c.activity, place: pid }, { from: j(h1), activity: 'sleep', place: 'home' }],
      });
    }
  }
  return { settlement: { id, center, radius, places, nodes: [], edges: [] }, records };
}

// ---- looks ------------------------------------------------------------------------------------
const woodcutter = (female: boolean, hair: number, skin: number, cloth: number): Look => ({ body: female ? 'female' : 'male', outfit: female ? 'peasant' : 'ranger', hair: female ? 'buns' : 'buzzed', beard: !female && rnd() < 0.6, hairColor: hair, skin, linen: 0xd8c29a, cloth, height: female ? 1.66 : 1.82 });
/** The elves: tall and slender, cool-skinned, in jade, teal and gold. (Tapered ears come with the origins update.) */
export const elf = (female: boolean, hair: number, cloth: number, o: Partial<Look> = {}): Look => ({ body: female ? 'female' : 'male', outfit: 'ranger', hair: 'long', hairColor: hair, skin: 0xf4eef2, linen: 0xe8f0e0, cloth, height: female ? 1.84 : 1.92, ...o });

const ELF_HAIR = [0xe8e2d0, 0xd8b868, 0x2a2a3a, 0xc8c8d8, 0x8a5a3a];
const ELF_CLOTH = [0x2f8a7a, 0x3d7a45, 0x2f6a8a, 0x5a8a3a, 0xc8a040];
export const elfCrowdLooks = (n: number) => Array.from({ length: n }, (_, k) => elf(k % 2 === 0, ELF_HAIR[k % ELF_HAIR.length], ELF_CLOTH[(k * 3) % ELF_CLOTH.length], { hood: k % 3 === 2 }));

// ---- Thornwick -----------------------------------------------------------------------------
export interface ThornwickSpots { center: THREE.Vector3; inn: THREE.Vector3; corwen: THREE.Vector3; nimri: THREE.Vector3; mill: THREE.Vector3; yard: THREE.Vector3; store: THREE.Vector3; lodge: THREE.Vector3; well: THREE.Vector3; logging: THREE.Vector3[] }

export function thornwickFolk(s: ThornwickSpots): FolkSettlement {
  return settlementOf('thornwick', s.center, 110, [
    { id: 'corwen', name: 'Corwen Ashford', title: 'Foreman of the Thornwick Loggers', post: s.corwen, activity: 'idle', hours: [6, 21], look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a4a22, skin: 0xe0b894, cloth: 0x7a3a22, bracers: true, height: 1.9 },
      lines: { any: ['Every spring those stones are a hundred paces nearer the village. Every spring. Stones don’t walk, friend.', 'Thornwick timber built half the ships in Port Aurelle. The elves would have us chop kindling.'], evening: ['A long day at the saw. The Woodsman’s Rest pours a fair ale.'] } },
    { id: 'nimri', name: 'Nimri', title: 'Guide of the Greenwood', post: s.nimri, activity: 'sit', hours: [7, 23], look: elf(true, 0x3a2a1a, 0x5a7a3a, { hood: true, height: 1.76 }),
      lines: { any: ['Half elf, half Thornwick, and neither side quite sure what to do with me. I know the paths, though.', 'The Lost Woods aren’t cruel. They just don’t want strangers in their house.'] } },
    { id: 'bram', name: 'Bram Oakes', title: 'Keeper of the Woodsman’s Rest', post: s.inn, activity: 'idle', hours: [8, 25], look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x3a2618, skin: 0xe0b894, linen: 0xf0e0a8, cloth: 0x6a4a2a, height: 1.8 },
      lines: { any: ['A bed, a bowl and a fire. The Rest has stood since before the stones started walking.', 'Elves don’t drink here. Except Nimri. Nimri drinks everywhere.'] } },
    { id: 'hesk', name: 'Old Hesk', title: 'Sawyer of Thornwick Mill', post: s.mill, activity: 'work', hours: [6, 19], look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0xd8d4cc, skin: 0xe0b894, linen: 0xd8c29a, cloth: 0x5a5a4a, height: 1.74 },
      lines: { any: ['The wheel turns, the saw sings, the boards stack up. Forty years of it.', 'Planks for Aurelle’s shipwrights, beams for the capital. Good oak and ironbark.'] } },
    { id: 'marta', name: 'Marta Fenn', title: 'Hunter’s Wife', post: s.lodge, activity: 'work', hours: [7, 20], look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x6a4428, skin: 0xfff0e6, linen: 0xe8d8b8, cloth: 0x3d7a45, height: 1.64 },
      lines: { any: ['Tobin went after a white stag three days ago. Into the Lost Woods. He knows better.', 'Hides drying, meat smoking, and no husband. Some week.'] } },
    { id: 'ashgrove', name: 'Mother Ashgrove', title: 'Thornwick Stores', post: s.store, activity: 'shop', hours: [8, 19], look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xb8b4ae, skin: 0xe0b894, linen: 0xe8c8c0, cloth: 0x8a6a3a, height: 1.6 },
      lines: { any: ['Rope, lamp oil, axes, and the only salt this side of the Glen.'] } },
  ], [
    { job: 'smith', n: 5, activity: 'work', spots: s.logging, looks: [woodcutter(false, 0x3a2618, 0xe0b894, 0x7a3a22), woodcutter(false, 0x6a4428, 0xa8744e, 0x3d5a3a), woodcutter(true, 0x8a3f22, 0xfff0e6, 0x6a4a2a)], lines: { any: ['Mind the swing.', 'Timber!', 'The elves say every tree has a name. This one’s called Firewood.'] }, title: 'Thornwick Logger', hours: [6.5, 19] },
    { job: 'villager', n: 4, activity: 'talk', spots: [s.well, s.well.clone().add(new THREE.Vector3(3, 0, 2)), s.yard], looks: [woodcutter(true, 0x3a2618, 0xe0b894, 0x8a6a3a), woodcutter(false, 0x1f1a17, 0xe0b894, 0x5a5a4a)], lines: { any: ['Corwen’s right, the stones move. Seen it myself.', 'The elves leave flowers on the stones. Nobody knows why.'] }, title: 'Villager of Thornwick' },
  ], [{ id: 'tavern', spots: [s.inn.clone()], indoors: true }]);
}

// ---- the marker stone ----------------------------------------------------------------------
export function markerFolk(stone: THREE.Vector3, yaw: number): FolkSettlement {
  return settlementOf('markerStone', stone, 60, [
    { id: 'aelrin', name: 'Sentinel Aelrin', title: 'Warden of the Marker Stone', post: stone, yaw, activity: 'idle', hours: [0, 24], look: elf(false, 0xe8e2d0, 0x2f8a7a, { pauldron: true, bracers: true, height: 1.96 }),
      lines: { any: ['The stone marks the edge of our care, human. Past it, the forest decides.', 'Your woodcutters cut what they like. The forest remembers each stump.'] } },
  ]);
}

// ---- Silverbough -------------------------------------------------------------------------------
export interface SilverboughSpots { center: THREE.Vector3; elder: THREE.Vector3; thessaly: THREE.Vector3; spring: THREE.Vector3; bridges: THREE.Vector3[]; hearth: THREE.Vector3; child: THREE.Vector3 }
export function silverboughFolk(s: SilverboughSpots): FolkSettlement {
  return settlementOf('silverbough', s.center, 90, [
    { id: 'caelith', name: 'Elder Caelith', title: 'Elder of Silverbough', post: s.elder, activity: 'sit', hours: [6, 23], look: elf(false, 0xd8d8e0, 0xc8a040, { height: 1.94 }),
      lines: { any: ['Silverbough has stood in these roots for nine hundred years. You are the first human to find it without being carried.', 'Trust is a seed, child. It grows slowly, and it can be cut.'] } },
    { id: 'thessaly', name: 'Thessaly of the Wind', title: 'Windcaller of Silverbough', post: s.thessaly, activity: 'idle', hours: [5, 22], look: elf(true, 0xe8e2d0, 0x6ab0c8, { height: 1.86 }),
      lines: { any: ['The wind in these branches has been singing the same song since before your kingdom. Listen.', 'Your Orren teaches the wind like a dog to heel. We ask it.'] } },
    { id: 'lisse', name: 'Lisse', title: 'Keeper of the Spring', post: s.spring, activity: 'work', hours: [6, 20], look: elf(true, 0x2a2a3a, 0x3d7a45),
      lines: { any: ['The spring sings when it is clean. Lately it whispers.', 'There is a fox who takes things. Small, bright things.'] } },
    { id: 'tamwyn', name: 'Tamwyn', title: 'Child of Silverbough', post: s.child, activity: 'play', hours: [8, 19], look: elf(false, 0xd8b868, 0x5a8a3a, { height: 1.32 }),
      lines: { any: ['Are your ears really that round? Can I touch them?', 'The spirit fox stole Lisse’s bell! I saw it!'] } },
  ], [
    { job: 'elfWeaver', n: 4, activity: 'work', spots: s.bridges, looks: elfCrowdLooks(4), lines: { any: ['Mind the bridge, it sways for strangers.', 'Moonweave takes a year a bolt. We are not in a hurry.'] }, title: 'Elf of Silverbough' },
    { job: 'elfSinger', n: 3, activity: 'sit', spots: [s.hearth, s.hearth.clone().add(new THREE.Vector3(2.2, 0, 0.6)), s.hearth.clone().add(new THREE.Vector3(-1.6, 0, 1.8))], looks: elfCrowdLooks(3), lines: { any: ['We sing at night so the trees remember us.', 'A human in Silverbough. My grandmother will not believe it.'] }, title: 'Elf of Silverbough', hours: [10, 24] },
  ]);
}

// ---- the Elven Sanctum ---------------------------------------------------------------------------
export interface SanctumSpots { center: THREE.Vector3; council: THREE.Vector3; lirael: THREE.Vector3; faelan: THREE.Vector3; carvers: THREE.Vector3; archive: THREE.Vector3; pool: THREE.Vector3; weavers: THREE.Vector3[]; plaza: THREE.Vector3[]; guards: THREE.Vector3[] }
export function sanctumFolk(s: SanctumSpots): FolkSettlement {
  return settlementOf('elvenSanctum', s.center, 180, [
    { id: 'lirael', name: 'Elder Lirael Moonwhisper', title: 'Speaker of the Council of Leaves', post: s.lirael, activity: 'idle', hours: [0, 24], look: elf(true, 0xf2f0f8, 0xe0c060, { height: 1.95 }),
      lines: { any: ['The Council has watched the wheel turn four times. We did not expect it to send us a guest.', 'Sit, summoned one. The World Tree is patient. So are we.'] } },
    { id: 'faelan', name: 'Faelan the Bowyer', title: 'Bowyer of the Sanctum · Ranger', post: s.faelan, activity: 'work', hours: [6, 22], look: elf(false, 0x8a5a3a, 0x3d6a2a, { bracers: true, hood: true }),
      lines: { any: ['A bow is a tree that remembers being bent by the wind.', 'Heartwood from a fallen giant, string from moonweave. Patience from nowhere: you bring that.'] } },
    { id: 'ellisande', name: 'Ellisande', title: 'Keeper of the Archive of Songs', post: s.archive, activity: 'sit', hours: [7, 24], look: elf(true, 0xc8c8d8, 0x6a5aa8),
      lines: { any: ['Every song in the archive is a history. Some of them are also warnings.', 'The World Tree has a song of its own. Nobody living has heard all of it.'] } },
    { id: 'orielCarver', name: 'Oriel', title: 'Master Heartwood-Carver', post: s.carvers, activity: 'work', hours: [7, 21], look: elf(false, 0xd8b868, 0x8a6a2a, { bracers: true }),
      lines: { any: ['We carve only what the forest gives. A fallen giant gives a great deal.', 'Bring me heartwood and I will show you what it wants to be.'] } },
  ], [
    { job: 'elfWeaver', n: 5, activity: 'work', spots: s.weavers, looks: elfCrowdLooks(5), lines: { any: ['Moonweave, for the Council’s cloaks.', 'The looms are quiet at noon. The moon does the rest.'] }, title: 'Weaver of the Sanctum' },
    { job: 'elfFolk', n: 7, activity: 'talk', spots: s.plaza, looks: elfCrowdLooks(7), lines: { any: ['A human, in the Sanctum! The Council must have its reasons.', 'Have you seen the moon-pool at night? The stars come up out of it.'], evening: ['The blossoms are opening. Walk with us.'] }, title: 'Elf of the Sanctum', hours: [7, 23] },
    { job: 'guard', n: 4, activity: 'patrol', spots: s.guards, looks: [elf(false, 0xe8e2d0, 0x2f6a5a, { pauldron: true, bracers: true }), elf(true, 0x2a2a3a, 0x2f6a5a, { pauldron: true, bracers: true })], lines: { any: ['Walk softly, guest. The roots are listening.'] }, title: 'Sentinel of the Sanctum', hours: [0, 24] },
  ], [{ id: 'tavern', spots: [s.council.clone()], indoors: true }]);
}

// ---- Moonlight Glade, the Hermit, the lost hunter ---------------------------------------------------
export function gladeFolk(sylwen: THREE.Vector3): FolkSettlement {
  return settlementOf('moonlightGlade', sylwen, 70, [
    { id: 'sylwen', name: 'Sylwen Starwatcher', title: 'Starwatcher of Moonlight Glade · Lightbinder', post: sylwen, activity: 'idle', hours: [0, 24], look: elf(true, 0xe8eaf8, 0x6a8ad8, { height: 1.9 }),
      lines: { any: ['By day I sleep in the stones’ shadow. By night I count.', 'The moonblossoms open only on clear nights. So do I.'], night: ['Look up. The wheel is up there too, if you know where.'] } },
  ]);
}
export function hermitFolk(at: THREE.Vector3): FolkSettlement {
  return settlementOf('hermitHollow', at, 50, [
    { id: 'hermit', name: 'The Hermit of the Hollow', title: 'Who Was Once a Wolf', post: at, activity: 'sit', hours: [0, 24], look: { body: 'male', outfit: 'ranger', hood: true, hair: 'long', beard: true, hairColor: 0x9a9a8a, skin: 0xc8a888, cloth: 0x4a5a2a, height: 1.86 },
      lines: { any: ['Hm. Two legs. You walk loudly.', 'I was a bear for eleven winters. It was quieter.'] } },
  ]);
}
export function hunterFolk(at: THREE.Vector3): FolkSettlement {
  return settlementOf('lostHunter', at, 40, [
    { id: 'tobin', name: 'Tobin Fenn', title: 'Lost Hunter of Thornwick', post: at, activity: 'sit', hours: [0, 24], look: { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x5a4a2a, height: 1.8 },
      lines: { any: ['Three days I’ve walked toward the road. Three days I’ve come back to this same log.', 'The white stag. I swear I saw it.'] } },
  ]);
}
