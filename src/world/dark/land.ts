import { WORLD_X0, WORLD_Z0, WORLD_W, WORLD_H } from '../worldMap';
import ISLES from '../islands/atlas.json';

// The Dark is the world's shadow: the same land, in the same place, under a
// red sky. Nothing anyone built stands in it. The seven scars below are where
// the war that ended the endless day struck the shadow so hard it still shows.
export const onMap = (x: number, z: number) => x >= WORLD_X0 && x <= WORLD_X0 + WORLD_W && z >= WORLD_Z0 && z <= WORLD_Z0 + WORLD_H;

export const SCARS = [
  {
    id: 'first-impact',
    name: 'The First Wound',
    x: 240,
    z: -170,
    r: 115,
    depth: 35,
    text: 'The ground here is fused glass. Light fell on this place the wrong way: down, into the shadow, to burn out whatever lived in it.',
  },
  {
    id: 'severed-crown',
    name: 'The Severed Crown',
    x: -1280,
    z: -680,
    r: 210,
    depth: 65,
    text: 'A knight cut this ridge in two to stop an army that never slept. It marched around.',
  },
  {
    id: 'harbour-before',
    name: 'The Unbuilt Harbour',
    x: 2660,
    z: 110,
    r: 180,
    depth: 28,
    text: 'The sea pulled back from here for a hundred years. The things that crawled up out of the dry bed were starving.',
  },
  {
    id: 'white-cleft',
    name: 'The Spear of Silence',
    x: 250,
    z: -4480,
    r: 300,
    depth: 110,
    text: 'The trees bent away from a light that never set, until they turned to stone rather than face it.',
  },
  {
    id: 'western-fall',
    name: 'The Fallen Horizon',
    x: -4200,
    z: 200,
    r: 360,
    depth: 95,
    text: 'A city stood here that kept its lamps lit for someone else’s king. Its people left lanterns at the edge of town for the knights who came to put the others out.',
  },
  {
    id: 'forest-echo',
    name: 'The Rootless Choir',
    x: -850,
    z: -2780,
    r: 150,
    depth: 50,
    text: 'Eleven knights went down into the dark from here. One came back up. Then he went down again, alone, and stayed.',
  },
  {
    id: 'southern-wound',
    name: 'The Last Footfall',
    x: -600,
    z: 2000,
    r: 260,
    depth: 80,
    text: 'A crater has swallowed the old horizon. The Dawn holds your outline steady against its silence. Something here remembers being held the same way, and let go.',
  },
] as const;

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
