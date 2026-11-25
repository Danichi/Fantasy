import { macroHeight, WORLD_X0, WORLD_Z0, WORLD_W, WORLD_H } from '../worldMap';
import ISLES from '../islands/atlas.json';

// Separate physical space, shared map coordinates. Living fortifications cannot
// collide with an ancient path, and no saved hero position uses these offsets.
export const DARK_X = 60000,
  DARK_Z = -60000;
export const inDark = (x: number, z: number) => x > DARK_X - 16000 && x < DARK_X + 22000 && z > DARK_Z - 14000 && z < DARK_Z + 16000;
export const onMap = (x: number, z: number) => x >= WORLD_X0 && x <= WORLD_X0 + WORLD_W && z >= WORLD_Z0 && z <= WORLD_Z0 + WORLD_H;

export const SCARS = [
  {
    id: 'first-impact',
    name: 'The First Wound',
    x: 240,
    z: -170,
    r: 115,
    depth: 35,
    text: 'The bowl is fused glass. Something larger than a keep struck here before Elder Glen had a name.',
  },
  {
    id: 'severed-crown',
    name: 'The Severed Crown',
    x: -1280,
    z: -680,
    r: 210,
    depth: 65,
    text: 'A straight wound crosses the ridge. The mountain was not mined: it was parted in a single blow.',
  },
  {
    id: 'harbour-before',
    name: 'The Unbuilt Harbour',
    x: 2660,
    z: 110,
    r: 180,
    depth: 28,
    text: 'Where Aurelle now raises walls, a black basin remembers a different coastline. No living kingdom’s border reaches this basin.',
  },
  {
    id: 'white-cleft',
    name: 'The Spear of Silence',
    x: 250,
    z: -4480,
    r: 300,
    depth: 110,
    text: 'The petrified forest points away from the impact. Even the mountains seem to have recoiled.',
  },
  {
    id: 'western-fall',
    name: 'The Fallen Horizon',
    x: -4200,
    z: 200,
    r: 360,
    depth: 95,
    text: 'The broken foundations predate the present kingdoms. Their quarrels are young beside this scar.',
  },
  {
    id: 'forest-echo',
    name: 'The Rootless Choir',
    x: -850,
    z: -2780,
    r: 150,
    depth: 50,
    text: 'Stone roots hang over a wound in the earth. Whatever fought here left no armies to bury.',
  },
  {
    id: 'southern-wound',
    name: 'The Last Footfall',
    x: -600,
    z: 2000,
    r: 260,
    depth: 80,
    text: 'A crater has swallowed the old horizon. The Dawn holds your outline steady against its silence.',
  },
] as const;

/** Continental silhouette without settlements, roads or modern flattening. */
export function ancientHeight(x: number, z: number) {
  let h = Math.max(14, macroHeight(x, z) * 0.82 + 16);
  h += Math.sin(x / 73) * Math.cos(z / 91) * 5 + Math.sin((x + z) / 181) * 8;
  for (const s of SCARS) {
    const d = Math.hypot(x - s.x, z - s.z) / s.r;
    if (d < 1) h -= s.depth * Math.pow(1 - d * d, 2);
    if (d > 0.8 && d < 1.4) h += Math.sin(((d - 0.8) / 0.6) * Math.PI) * s.depth * 0.25;
  }
  // Long, traversable cleavages: ancient blows rather than modern trails.
  const cut = Math.abs(z + 680 - (x + 1280) * 0.26);
  const along = Math.abs(x + 1280);
  if (along < 650 && cut < 42) h -= Math.pow(1 - cut / 42, 2) * 44 * (1 - along / 650);
  // Dry exposed beds, kept above the game's global void rescue threshold.
  return Math.max(-18, h);
}

// Both dimensions have these wheels. Two lie across guarded boundaries;
// their living counterparts do not remove guards or grant diplomatic immunity.
export const PASSAGES = [
  { id: 'dawn-glen', name: 'Elder Glen • Root Wheel', x: -125, z: 0, warning: 'Beyond the western palisade' },
  { id: 'dawn-river', name: 'Riverbank • Broken Spoke', x: 240, z: 60, warning: 'Across the river without the bridge' },
  { id: 'dawn-aurelle', name: 'Aurelle • Forgotten Sea Gate', x: 2715, z: 220, warning: 'Within the port approaches; wartime patrols remain active' },
  { id: 'dawn-forest', name: 'Elven March • Rootbound Wheel', x: -730, z: -2900, warning: 'Beyond the forest approaches near Eastwatch; local patrols remain active' },
  { id: 'dawn-north', name: 'White Mountains • Split Ridge', x: 250, z: -4300, warning: 'Below the ancient mountain cleft' },
  { id: 'dawn-west', name: 'Western March • Ash Wheel', x: -4200, z: 430, warning: 'A frontier of the independent kingdoms' },
  { id: 'dawn-south', name: 'Southern Wilds • Last Light', x: -600, z: 1800, warning: 'Far beyond the settled roads' },
  {
    id: 'dawn-east',
    name: 'Eastern Front • The Unwatched Door',
    x: 10090,
    z: 205,
    warning: 'Behind the eastern requisition camp. Hostile soldiers control the nearby stores; the Queen’s blockade remains at sea',
  },
  ...ISLES.filter((isle, i, all) => all.findIndex((other) => other.region === isle.region) === i).map((isle) => ({
    id: 'dawn-isle-' + isle.id,
    name: isle.name + ' • Tidewheel',
    x: isle.landing[0] + 10,
    z: isle.landing[1] + 8,
    warning: 'An independent island shore. Fleet allegiances and hostile landing parties differ from port to port',
  })),
] as const;
