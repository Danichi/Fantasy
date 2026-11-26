/** Shared names and positions: signs, local directions, sound and visible work agree. */
export interface GlenLandmark {
  id: string;
  name: string;
  at: [number, number];
  directions: string;
}

export const GLEN_CIRCUIT: GlenLandmark[] = [
  {
    id: 'bell',
    name: 'Market Bell',
    at: [-3, -4],
    directions:
      'The timber bell tower is the heart of Elder Glen. Blue-and-gold pennants lead east to the gate and the river bridge. For the farms, take the south street out through the palisade; look for the two tall granaries.'
  },
  {
    id: 'sheaf',
    name: 'Sheaf Yard',
    at: [-38, 114],
    directions:
      'The twin granaries mark the south farms. Wren works the wheat just beyond them; Dora counts the sacks here. Follow the street north to the Market Bell. The river mill is east of town: return to the square, then take the blue-and-gold east gate.'
  },
  {
    id: 'gate',
    name: 'Eastgate Lantern',
    at: [119, -9],
    directions:
      'Cross the stone bridge ahead for the King’s Road to Port Aurelle. The white-painted stones lead to the roadside rest just beyond the river. Behind you, follow the blue-and-gold pennants back to the Market Bell.'
  },
  {
    id: 'rest',
    name: 'White-Stone Rest',
    at: [217, 23],
    directions:
      'Elder Glen lies west, across the stone bridge: its lantern gate and tall Market Bell show the way home. Port Aurelle lies east along the King’s Road. Travel by daylight; the Watch checks the crossing at dusk.'
  }
];

export function glenDirections(x: number, z: number) {
  return GLEN_CIRCUIT.reduce((best, p) => (Math.hypot(x - p.at[0], z - p.at[1]) < Math.hypot(x - best.at[0], z - best.at[1]) ? p : best)).directions;
}

export interface LocalSound {
  kind: 'crowd' | 'river' | 'fire';
  x: number;
  z: number;
  radius: number;
  gain: number;
  daytime?: boolean;
}

/** Use-worn ground, shared by the terrain splat, grass and foot contacts. */
export const GLEN_WEAR: [number, number, number][] = [
  [-34, 117, 8],
  [217, 23, 6],
  [-19, -2, 4]
];

export const GLEN_SOUNDS: LocalSound[] = [
  { kind: 'crowd', x: 0, z: 7, radius: 38, gain: 0.27, daytime: true },
  { kind: 'crowd', x: -38, z: 115, radius: 18, gain: 0.13, daytime: true },
  { kind: 'fire', x: 217, z: 23, radius: 16, gain: 0.34 },
  { kind: 'river', x: 166, z: 6, radius: 45, gain: 0.42 }
];
