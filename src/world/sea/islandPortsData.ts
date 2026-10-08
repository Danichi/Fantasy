// The island harbours (docs/design/boating.md §11, World Expansion phase 12):
// where each one stands, which way its pier runs out to deep water, and the
// level pad its houses stand on. Plain numbers only: the terrain (and its
// worker) reads the pads.

export type PortStyle = 'azure' | 'emerald' | 'pirate' | 'sunken' | 'demon' | 'dwarf';

export interface IslandPortDef {
  id: string;
  name: string;
  /** a point on dry land by the shore, and the direction (rad, x = cos, z = sin) out to sea */
  land: [number, number];
  dir: number;
  /** metres from `land` to the water's edge */
  shore: number;
  /** the pad's level */
  padH: number;
  style: PortStyle;
  blurb: string;
}

export const ISLAND_PORTS: IslandPortDef[] = [
  { id: 'azureHaven', name: 'Azure Haven', land: [8084, -3786], dir: 0.393, shore: 25, padH: 3.4, style: 'azure', blurb: 'White walls and turquoise shallows: the trading post of the Azure Isles, rich in spice, sugar and pearls.' },
  { id: 'emeraldCove', name: 'Emerald Cove', land: [6800, 2690], dir: 0, shore: 35, padH: 1.6, style: 'emerald', blurb: 'A timber town under green hills, where the Emerald Isles\' timber, herbs and dyes go out to the world.' },
  { id: 'wreckersRest', name: 'Wrecker\'s Rest', land: [4334, 5132], dir: 0.785, shore: 25, padH: 4.2, style: 'pirate', blurb: 'A haven of wreckers and pirates on the Shattered Isles. Stolen goods change hands here, and nobody asks.' },
  { id: 'sunkenSpire', name: 'Sunken Spire', land: [9404, 5948], dir: 0.785, shore: 20, padH: 1.3, style: 'sunken', blurb: 'An outpost of divers and scholars among drowned ruins, where the old carvings go down under the sea.' },
  // Kettle Cove (the White and Deep Mountains, feat/mountains): cut into the cliffs where the White Mountains meet deep water.
  { id: 'kettleCove', name: 'Kettle Cove', land: [5250, -4830], dir: 1.571, shore: 30, padH: 3.2, style: 'dwarf', blurb: 'A dwarven harbour hewn into the cliffs of the White Mountains, where the ore of the high holds comes down to the sea.' },
  { id: 'ashenPort', name: 'Ashen Port', land: [9844, 190], dir: 3.534, shore: 15, padH: 2.8, style: 'demon', blurb: 'The black harbour of the Demon Continent. Only a great ship can cross to it.' },
];

/** Pad centre: a little inland from the shore point. */
export function padCentre(p: IslandPortDef): [number, number] {
  return [p.land[0] - Math.cos(p.dir) * 14, p.land[1] - Math.sin(p.dir) * 14];
}
export const PAD_R = 36;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The island harbours' level pads: [height, weight] where one applies. */
export function islandPadHeight(x: number, z: number): [number, number] | null {
  for (const p of ISLAND_PORTS) {
    const [cx, cz] = padCentre(p);
    const d = Math.hypot(x - cx, z - cz);
    if (d > PAD_R + 14) continue;
    return [p.padH, smooth(PAD_R + 14, PAD_R - 6, d)];
  }
  return null;
}
