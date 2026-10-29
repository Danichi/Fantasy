import type { G } from './kit';
import { paintPotion, type PotionArt } from './potions';
import { paintPlant, PLANTS } from './plants';
import { paintFish, FISH, paintFood, FOODS } from './food';
import { paintPaper, PAPERS } from './paper';
import { paintTrinket, TRINKETS } from './trinkets';
import { paintPart, PARTS } from './parts';
import { paintEmblem, emblemFor, EMBLEMS } from './emblems';
import { paintArmour, ARMOURS } from './armour';

// Which items get painted art instead of a render of their 3D model, and how.
// Painters live beside this file; each entry here is the item's look.

type Painter = (g: G) => void;

// ---- brews (herbalism: 40 recipes x 5 strengths, "brew_<key>_<tier>") -----------------------
const BREWS: Record<string, PotionArt> = {
  // healing tonics
  healingTonic: { vessel: 'round', liquid: ['#ff6464', '#900c1c'], glyph: 'heart' },
  hearthroot: { vessel: 'cone', liquid: ['#ff8a4a', '#9a2410'], glyph: 'leaf', stopper: 'wax', seal: '#7a3a1a' },
  renewalTea: { vessel: 'cup', liquid: ['#e8b860', '#8a4a10'], glyph: 'leaf', seal: '#d8c4a0' },
  lifebloom: { vessel: 'cone', liquid: ['#ff7ad0', '#a0106a'], glyph: 'lotus', fx: ['sparkle'], stopper: 'wax', seal: '#e05aa8' },
  panacea: { vessel: 'heart', liquid: ['#fff09a', '#e09a18'], stopper: 'gold', fx: ['glow'] },
  elixirOfLife: { vessel: 'heart', liquid: ['#ff5a8a', '#b00a40'], stopper: 'gold', seal: '#ff9ac0', fx: ['glow', 'sparkle'] },
  // draughts
  manaDraught: { vessel: 'round', liquid: ['#5ab0ff', '#141e8a'], glyph: 'star', fx: ['glow'] },
  staminaDraught: { vessel: 'round', liquid: ['#7ee05a', '#16642a'], glyph: 'bolt' },
  purgingDraught: { vessel: 'cone', liquid: ['#e4f6a8', '#7aa42a'], glyph: 'drop', fx: ['bubbles'] },
  antivenom: { vessel: 'tall', liquid: ['#c4ec5a', '#3e7a12'], glyph: 'fang', stopper: 'wax', seal: '#3a6a2a' },
  fireward: { vessel: 'square', liquid: ['#ffc24a', '#c0400e'], glyph: 'shield', stopper: 'wax', seal: '#c0401a', fx: ['embers'] },
  frostward: { vessel: 'square', liquid: ['#a8e4ff', '#2e60b0'], glyph: 'shield', stopper: 'wax', seal: '#2e70c0', fx: ['frost'] },
  nightsight: { vessel: 'vial', liquid: ['#8af0c0', '#0a5a48'], glyph: 'eye', fx: ['glow'] },
  shadow: { vessel: 'bottle', liquid: ['#5a4a7a', '#0c0818'], glyph: 'moon', glass: '#3a3450', fx: ['dark'] },
  gills: { vessel: 'gourd', liquid: ['#4ae4d0', '#0a5a74'], glyph: 'fish', fx: ['bubbles'] },
  featherfall: { vessel: 'tall', liquid: ['#e0f0ff', '#7aa0d8'], glyph: 'feather', fx: ['sparkle'] },
  foragersTea: { vessel: 'cup', liquid: ['#c8a050', '#5a3a10'], glyph: 'leaf', seal: '#b8a07a' },
  travellersBrew: { vessel: 'bottle', liquid: ['#e0a458', '#7a4210'], glyph: 'boot', glass: '#a8c49a' },
  moonpetal: { vessel: 'vial', liquid: ['#dccaff', '#5a3ab8'], glyph: 'moon', fx: ['glow', 'sparkle'] },
  // combat elixirs
  might: { vessel: 'square', liquid: ['#ff9a3a', '#8a200a'], glyph: 'fist', stopper: 'wax', seal: '#8a1a10' },
  berserker: { vessel: 'square', liquid: ['#ff3a2a', '#5a0408'], glyph: 'axe', stopper: 'wax', seal: '#3a0a0a', fx: ['steam'] },
  ironbark: { vessel: 'tall', liquid: ['#b8844a', '#4a2a12'], glyph: 'tree' },
  stoneskin: { vessel: 'square', liquid: ['#c4bca8', '#5a5246'], glyph: 'mountain', glass: '#b8b4a8' },
  swiftroot: { vessel: 'vial', liquid: ['#d4f45a', '#5a8a0a'], glyph: 'wing' },
  hawkeye: { vessel: 'vial', liquid: ['#ffd64a', '#a0700a'], glyph: 'eye', stopper: 'wax', seal: '#a0700a' },
  trollsBlood: { vessel: 'gourd', liquid: ['#6ac45a', '#14401a'], glyph: 'claw', fx: ['bubbles'] },
  bloodcap: { vessel: 'round', liquid: ['#d8243e', '#4a0612'], glyph: 'mushroom', stopper: 'wax', seal: '#5a0a1a' },
  sageBrew: { vessel: 'round', liquid: ['#a4dcb4', '#1e6a4a'], glyph: 'leaf', fx: ['glow'] },
  stormleaf: { vessel: 'cone', liquid: ['#8ae8ff', '#1e5aa8'], glyph: 'bolt', fx: ['glow', 'sparkle'] },
  dragonbloom: { vessel: 'gourd', liquid: ['#ffa02a', '#a01a06'], glyph: 'flame', stopper: 'gold', fx: ['embers'] },
  philosopher: { vessel: 'gourd', liquid: ['#ff6ad8', '#4a18a8'], glyph: 'circle', stopper: 'gold', fx: ['glow', 'sparkle'] },
  // blade oils
  fireOil: { vessel: 'oil', liquid: ['#ffb02a', '#a8400a'], glyph: 'flame', fx: ['embers'] },
  frostOil: { vessel: 'oil', liquid: ['#a8e0ff', '#2a5aa8'], glyph: 'flake', fx: ['frost'] },
  nightshade: { vessel: 'oil', liquid: ['#9a4ac8', '#2a0a4a'], glyph: 'skull' },
  wither: { vessel: 'oil', liquid: ['#a4a45a', '#3a3a14'], glyph: 'hourglass', glass: '#a8b49a' },
  hallowed: { vessel: 'oil', liquid: ['#fff2b0', '#d8a03a'], glyph: 'sun', stopper: 'gold', fx: ['glow'] },
  huntsman: { vessel: 'oil', liquid: ['#a8c060', '#46561a'], glyph: 'paw' },
  blackLotusOil: { vessel: 'oil', liquid: ['#4a3a6a', '#0a0612'], glyph: 'lotus', glass: '#4a4060', stopper: 'wax', seal: '#6a2a8a', fx: ['dark'] },
  widowsKiss: { vessel: 'heart', liquid: ['#6a1a40', '#180610'], glyph: 'spider', glass: '#4a2a3a', stopper: 'wax', seal: '#1a0a12', fx: ['dark'] },
  // thrown flasks
  fireFlask: { vessel: 'bomb', liquid: ['#ff7a1a', '#9a1400'], glyph: 'flame', fx: ['embers'] },
  frostFlask: { vessel: 'bomb', liquid: ['#bfe8ff', '#2e6ad0'], glyph: 'flake', fx: ['frost'] },
  plagueFlask: { vessel: 'bomb', liquid: ['#b0d040', '#34540a'], glyph: 'skull', fx: ['toxic'] },
  smokeBomb: { vessel: 'bomb', liquid: ['#c8c8c8', '#4a4a50'], glyph: 'cloud', fx: ['smoke'] },
  holyWater: { vessel: 'bomb', liquid: ['#eef8ff', '#8ab4e8'], glyph: 'cross', fx: ['glow'] },
};

// ---- other potions, tonics and drinks ---------------------------------------------------------
const POTIONS: Record<string, PotionArt> = {
  healthPotion: { vessel: 'round', liquid: ['#ff5050', '#880a18'], glyph: 'heart' },
  greaterHealthPotion: { vessel: 'round', liquid: ['#ff3a4a', '#6a0010'], glyph: 'heart', stopper: 'gold', fx: ['glow'] },
  manaPotion: { vessel: 'round', liquid: ['#5aaaff', '#121c86'], glyph: 'star' },
  greaterManaPotion: { vessel: 'round', liquid: ['#4a9aff', '#0a1070'], glyph: 'star', stopper: 'gold', fx: ['glow'] },
  herbalTonic: { vessel: 'vial', liquid: ['#ff8a5a', '#a0301e'], glyph: 'leaf' },
  manaTonic: { vessel: 'vial', liquid: ['#a4d4ff', '#2a5aa8'], glyph: 'moon' },
  hearthrootDraught: BREWS.hearthroot,
  renewalTea: BREWS.renewalTea,
  lifebloomTonic: BREWS.lifebloom,
  ironbarkTonic: BREWS.ironbark,
  swiftrootElixir: BREWS.swiftroot,
  stormleafElixir: BREWS.stormleaf,
  nightshadeOil: BREWS.nightshade,
  emberBomb: { vessel: 'bomb', liquid: ['#ff8a2a', '#8a2a06'], glyph: 'flame', glass: '#b0704a', fx: ['embers'] },
  waterBreathingDraught: BREWS.gills,
  spicedCider: { vessel: 'cup', liquid: ['#e09a3a', '#7a3a0a'], seal: '#a86a3a', glyph: 'leaf' },
  spicedTea: { vessel: 'cup', liquid: ['#b8c860', '#5a6a14'], seal: '#3a8a8a', glyph: 'leaf' },
  feverBalm: { vessel: 'jar', liquid: ['#f0d080', '#a8782a'], glyph: 'leaf', seal: '#6a9a4a' },
};

const potion = (a: PotionArt, seed: string): Painter => (g) => paintPotion(g, a, seed);

export function artFor(id: string): Painter | null {
  // Skills, spells and origin abilities: "emblem:<discipline>:<name>".
  if (id.startsWith('emblem:')) return (g) => paintEmblem(g, emblemFor(id.slice(7)));
  // The two spell items share their schools' emblems.
  if (id === 'fireball' || id === 'healingLight') return (g) => paintEmblem(g, emblemFor('spell:' + id));
  const b = /^brew_(\w+)_(\d)$/.exec(id);
  if (b && BREWS[b[1]]) return potion({ ...BREWS[b[1]], tier: Number(b[2]) }, b[1]);
  if (POTIONS[id]) return potion(POTIONS[id], id);
  if (PLANTS[id]) return (g) => paintPlant(g, PLANTS[id], id);
  if (FISH[id]) return (g) => paintFish(g, FISH[id], id);
  if (FOODS[id]) return (g) => paintFood(g, FOODS[id], id);
  if (PAPERS[id]) return (g) => paintPaper(g, PAPERS[id], id);
  if (TRINKETS[id]) return (g) => paintTrinket(g, TRINKETS[id], id);
  if (PARTS[id]) return (g) => paintPart(g, PARTS[id], id);
  if (ARMOURS[id]) return (g) => paintArmour(g, ARMOURS[id], id);
  return null;
}

/** Every item id with painted art that the registry knows by name (for the preview tool). */
export function ART_IDS() {
  const brews = Object.keys(BREWS).flatMap((k) => [1, 2, 3, 4, 5].map((t) => `brew_${k}_${t}`));
  return [...Object.keys(POTIONS), ...brews, ...Object.keys(PLANTS), ...Object.keys(FISH), ...Object.keys(FOODS), ...Object.keys(PAPERS), ...Object.keys(TRINKETS), ...Object.keys(PARTS), ...Object.keys(ARMOURS), ...Object.keys(EMBLEMS).map((k) => 'emblem:' + k)];
}
