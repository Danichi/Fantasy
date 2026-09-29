import * as THREE from 'three';
import type { NpcRecord, Place, ScheduleEntry } from './npcManager';
import type { Look } from './charBuilder';
import { heightAt } from '../world/terrainHeight';

// Elder Glen's named residents (World Expansion phase 3): the people who
// give the town's side quests, and the adventurers who hang around the guild
// hall in their parties. Each has a post they keep by day, so the player can
// find them, and ordinary evenings at the inn.

const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);

interface Named {
  id: string;
  name: string;
  title: string;
  look: Look;
  /** where they stand by day */
  post: [number, number];
  postYaw?: number;
  /** what they do there */
  activity: ScheduleEntry['activity'];
  /** on duty from..to (hours) */
  hours: [number, number];
  home: string;
  evening?: 'tavern' | 'guild' | 'plaza';
  lines: NpcRecord['lines'];
}

const NAMED: Named[] = [
  {
    id: 'hale', name: 'Tom Hale', title: 'Cattle Farmer', post: [-112, 66], postYaw: -Math.PI / 2, activity: 'idle', hours: [6, 18.5], home: 'home17',
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, linen: 0xd8c29a, height: 1.84 },
    lines: { any: ['Twelve head of cattle and every one of them has a name.', 'The grass on the west pasture is the sweetest in Cresha.'], evening: ['A pint and a sit. The cows can watch themselves for an hour.'] },
  },
  {
    id: 'wren', name: 'Old Wren Barley', title: 'Wheat Farmer', post: [4, 127], postYaw: 0, activity: 'farm', hours: [5.5, 18], home: 'home33',
    look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xb8b4ae, skin: 0xfff0e6, linen: 0xf0e0a8, height: 1.6 },
    lines: { any: ['Sixty harvests I\'ve brought in off this field.', 'Wheat wants sun, rain and no crows. Two out of three most years.'] },
  },
  {
    id: 'oswin', name: 'Oswin Grist', title: 'Miller', post: [0, 0], activity: 'work', hours: [6, 18], home: 'home15',
    look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xe8d8b8, height: 1.78 },
    lines: { any: ['The river turns the wheel, the wheel turns the stones, the stones turn grain into bread.', 'Flour in my hair, flour in my beard. Flour in my dreams.'] },
  },
  {
    id: 'dora', name: 'Dora Sheaf', title: 'Granary Keeper', post: [-38, 114], postYaw: 0, activity: 'idle', hours: [7, 19], home: 'home32',
    look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x3a2618, skin: 0xa8744e, linen: 0xc4d8c0, height: 1.66 },
    lines: { any: ['Every sack in these granaries is counted. Twice.', 'Half the Glen\'s harvest sits in these two barns until the caravans come.'] },
  },
  {
    id: 'brannoc', name: 'Captain Brannoc', title: 'Captain of the Watch', post: [4, 97], postYaw: Math.PI, activity: 'patrol', hours: [6, 26], home: 'home4',
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0x7a4e32, cloth: 0x3a5f9e, pauldron: true, height: 1.9 },
    lines: { any: ['The Watch keeps the gates. The Guild keeps the roads. Everyone keeps their heads.', 'Goblins have been sniffing round the fields after dark.'], night: ['Quiet so far. I don\'t trust quiet.'] },
  },
  {
    id: 'pip', name: 'Pip Tanner', title: 'Village Child', post: [-6, -12], activity: 'play', hours: [8, 19], home: 'home9',
    look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x8a3f22, skin: 0xfff0e6, linen: 0xc9dbe8, height: 1.28 },
    lines: { any: ['Race you to the well!', 'Nell says the crypt is haunted. Nell says a lot of things.'] },
  },
  {
    id: 'maud', name: 'Elder Maud Hollis', title: 'Village Elder', post: [8, -14], activity: 'sit', hours: [8, 19], home: 'home2', evening: 'tavern',
    look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xd9cfe8, height: 1.58 },
    lines: { any: ['Elder Glen was a glen before it was a town, and a town before it was a kingdom\'s breadbasket.', 'The harvest festival is the one night the whole valley dances.'] },
  },
  // The guild hall regulars: two parties and a veteran.
  {
    id: 'rook', name: 'Rook Ashdown', title: 'D-Rank Swordsman · Glen Wardens', post: [16, -4], activity: 'talk', hours: [8, 18], home: 'home5', evening: 'tavern',
    look: { body: 'male', outfit: 'ranger', hair: 'simpleparted', hairColor: 0x3a2618, skin: 0xfff0e6, cloth: 0x8a3a2a, height: 1.8 },
    lines: { any: ['The Glen Wardens: me, Lyssa and Garrick. D-rank now, B-rank by spring.', 'Wolf contracts pay the rent. Crypt contracts pay for the good ale.'] },
  },
  {
    id: 'lyssa', name: 'Lyssa Fen', title: 'C-Rank Archer · Glen Wardens', post: [18, -2], activity: 'talk', hours: [8, 18], home: 'home6', evening: 'tavern',
    look: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0xb0562a, skin: 0xfff0e6, cloth: 0x3d7a45, hood: true, height: 1.7 },
    lines: { any: ['Rook swings first and thinks second. That\'s why I stand behind him with a bow.', 'There are goblin tracks along the north pasture. Fresh ones.'] },
  },
  {
    id: 'garrick', name: 'Garrick Stone', title: 'D-Rank Shieldbearer · Glen Wardens', post: [20, -4], activity: 'patrol', hours: [8, 18], home: 'home7', evening: 'tavern',
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x5a6a7a, pauldron: true, height: 1.74 },
    lines: { any: ['A good shield is a door you carry with you.', 'The dwarves in Port Aurelle make shields that ring like bells.'] },
  },
  {
    id: 'selka', name: 'Selka Moor', title: 'D-Rank Mage · Two Coins', post: [26, -3], activity: 'talk', hours: [9, 19], home: 'home8', evening: 'tavern',
    look: { body: 'female', outfit: 'peasant', hair: 'buzzedfemale', hairColor: 0x1f1a17, skin: 0x7a4e32, linen: 0xd9cfe8, cloth: 0x5a3f8a, height: 1.68 },
    lines: { any: ['Magus Orren taught me my first flame. I only burned one eyebrow off.', 'Tam and I are "Two Coins". Heads I cast, tails he stabs.'] },
  },
  {
    id: 'tam', name: 'Tam Quickley', title: 'D-Rank Rogue · Two Coins', post: [28, -1], activity: 'idle', hours: [10, 20], home: 'home10', evening: 'tavern',
    look: { body: 'male', outfit: 'ranger', hair: 'buzzed', hairColor: 0x6a4428, skin: 0xfff0e6, cloth: 0x2a2a30, hood: true, height: 1.72 },
    lines: { any: ['Rogue is a strong word. I prefer "flexible".', 'Heard there\'s a thieves\' guild down in Port Aurelle\'s Lower City. Purely academic interest.'] },
  },
  {
    id: 'ingrid', name: 'Ingrid Vale', title: 'B-Rank Veteran', post: [22, -6], activity: 'sit', hours: [9, 17], home: 'home11', evening: 'tavern',
    look: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x3a5f9e, pauldron: true, height: 1.76 },
    lines: { any: ['B-rank took me twelve years. Don\'t rush it and you\'ll live to see A.', 'When you reach Port Aurelle, visit the big guild hall. The board there is three times this size.'] },
  },
];

/** Posts become places; records keep their post by day and go home at night. */
export function glenNamedFolk(millSpot: THREE.Vector3): { places: Place[]; records: NpcRecord[] } {
  const places: Place[] = [];
  const records: NpcRecord[] = [];
  for (const n of NAMED) {
    const post = n.id === 'oswin' ? millSpot.clone() : v(n.post[0], n.post[1]);
    const placeId = 'post:' + n.id;
    places.push({ id: placeId, spots: [post], yaw: n.postYaw });
    const [from, to] = n.hours;
    const evening = n.evening ?? 'tavern';
    const schedule: ScheduleEntry[] = to > 24
      ? [{ from: 0, activity: n.activity, place: placeId }, { from: to - 24, activity: 'sleep', place: n.home }, { from, activity: n.activity, place: placeId }]
      : [
        { from: 0, activity: 'sleep', place: n.home },
        { from, activity: n.activity, place: placeId },
        { from: to, activity: evening === 'tavern' ? 'drink' : 'talk', place: evening },
        { from: Math.min(23.5, to + 3.5), activity: 'sleep', place: n.home },
      ];
    records.push({ id: n.id, name: n.name, title: n.title, job: n.id, settlement: 'elderGlen', look: n.look, schedule, lines: n.lines, named: true });
  }
  return { places, records };
}
