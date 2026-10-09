import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import type { Look } from '../../npc/charBuilder';
import type { NpcRecord, Place, Settlement, ScheduleEntry } from '../../npc/npcManager';

// The people of the White Mountains (docs/design/mountains.md §7): who they
// are, how they look (the dwarves stand a head shorter than the humans) and
// the settlements they live in. Named folk keep their posts all day so the
// expedition can always find them.

export const LOOKS: Record<string, Look> = {
  bruni: { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x7a5a3a, pauldron: true, height: 1.4 },
  hamm: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0xb8622a, skin: 0xe0b894, cloth: 0x6a4a2a, pauldron: true, height: 1.36 },
  marta: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x3a2618, skin: 0xf0d0b0, linen: 0x9a8a72, cloth: 0x5a4a3a, height: 1.7 },
  durin: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0xe6e2da, skin: 0xe0b894, cloth: 0x2a5a9a, pauldron: true, bracers: true, height: 1.42 },
  thrain: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a4428, skin: 0xe0b894, cloth: 0x2f5f9a, pauldron: true, height: 1.38 },
  ulla: { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0xd8d4cc, skin: 0xf0d0b0, cloth: 0x3a6a8a, height: 1.36 },
  brenna: { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0x8a6a3a, skin: 0xe0b894, cloth: 0x5a5a62, pauldron: true, bracers: true, height: 1.74 },
  tobin: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x6a4428, skin: 0xf0d0b0, linen: 0xd8ccb0, cloth: 0x6a5a3a, height: 1.7 },
  brokk: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0xb88a6a, cloth: 0x8a2a1a, pauldron: true, bracers: true, height: 1.4 },
  helga: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xb8562a, skin: 0xd8a888, linen: 0x6a5a4a, cloth: 0x3a3a3e, height: 1.38 },
  dwarfM: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, skin: 0xe0b894, linen: 0x9a8a72, cloth: 0x6a4a2a, height: 1.34 },
  dwarfF: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0x6a3a1e, skin: 0xf0d0b0, cloth: 0x4a5a6a, height: 1.38 },
  minerM: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, skin: 0xd8a888, linen: 0x7a6a5a, cloth: 0x4a3a2a, height: 1.78 },
  minerF: { body: 'female', outfit: 'peasant', hair: 'buns', skin: 0xf0d0b0, linen: 0x8a7a62, cloth: 0x5a4a3a, height: 1.66 },
  guard: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, skin: 0xe0b894, cloth: 0x2a5a9a, pauldron: true, bracers: true, height: 1.4 },
};

const v3 = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

/** A settlement with a few places and a star-shaped walking graph round its centre. */
export function settlement(id: string, cx: number, cz: number, radius: number, places: Place[]): Settlement {
  const map = new Map<string, Place>();
  for (const p of places) map.set(p.id, p);
  const centre = v3(cx, cz);
  const nodes = [centre, ...places.flatMap((p) => p.spots.slice(0, 2).map((s) => s.clone()))];
  const edges: number[][] = nodes.map(() => []);
  for (let i = 1; i < nodes.length; i++) {
    edges[0].push(i);
    edges[i].push(0);
  }
  return { id, center: centre, radius, places: map, nodes, edges };
}

/** A named resident who keeps one post all day (and the place for it). */
export function named(id: string, name: string, title: string, look: Look, home: string, at: [number, number], yaw: number, activity: ScheduleEntry['activity'], lines: string[]): { rec: NpcRecord; place: Place } {
  const place: Place = { id: 'post:' + id, spots: [v3(at[0], at[1])], yaw };
  const rec: NpcRecord = { id, name, title, job: 'resident', settlement: home, look, named: true, schedule: [{ from: 0, activity, place: place.id }], lines: { any: lines } };
  return { rec, place };
}

/** Ordinary folk going between a few places through the day. */
export function folk(prefix: string, home: string, looks: Look[], names: string[], where: string, day: string, evening: string, lines: string[]): NpcRecord[] {
  return looks.map((look, i) => ({
    id: `${prefix}-${i}`, name: names[i % names.length], job: 'townsfolk', settlement: home, look,
    schedule: [{ from: 0, activity: 'sleep', place: where }, { from: 6 + (i % 3), activity: i % 2 ? 'work' : 'talk', place: day }, { from: 18 + (i % 3), activity: 'drink', place: evening }, { from: 23, activity: 'sleep', place: where }],
    lines: { any: lines },
  }));
}

export { v3 };
