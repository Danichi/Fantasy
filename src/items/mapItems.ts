import type { ItemDef } from './itemDefs';

// Maps (docs/design/mapping.md). Every map item is read once: it inks your
// world map (or lays a plan over a dungeon floor) and goes into the Map Case,
// so it leaves your bags. The world/cartography.ts runtime does the inking.
//
//   mapPiece_<region>_<n>   one piece of a region's map: inks a fixed patch
//   oldChart_<region>       a whole region, out of date (1 to 3 errors)
//   seaChart                the coasts of the western isles
//   surveySheet             turns everything you've sketched near you into ink
//   treasureMap_<n>         a riddle sketch: an X somewhere; no ink
//   fullChart_<region>      the reward for every piece of a region (sells well)
//   floorPlan_<dungeon>_<n> a builder's plan piece, laid over a dungeon floor
//   guildPlan_<dungeon>     the guild's whole-floor plan: no chests, no secrets
//   delverNote_<n>          an earlier delver's page: pins a note in a dungeon
//   blankSheet, inkPot      for copying a chart to sell

/** How many pieces each region's map is torn into (bigger regions, more pieces). */
export const REGION_PIECES: Record<string, number> = {
  elderGlen: 4, cresha: 7, portAurelle: 4, royalCapital: 4, verdantElves: 6, whiteMountains: 7, deepMountains: 6,
  wildlands: 7, goldenExpanse: 8, southernMarches: 6, frostedPeaks: 6, deepWilderness: 7, valoria: 7, azureIsles: 5,
  emeraldIsles: 5, shatteredIsles: 5, sunkenIsles: 5, demonContinent: 8,
};

export const REGION_NAMES: Record<string, string> = {
  elderGlen: 'Elder Glen', cresha: 'Cresha', portAurelle: 'Port Aurelle', royalCapital: 'the Crown Lands', verdantElves: 'the Verdant Wood',
  whiteMountains: 'the White Mountains', deepMountains: 'the Deep Mountains', wildlands: 'the Wildlands', goldenExpanse: 'the Golden Expanse',
  southernMarches: 'the Southern Marches', frostedPeaks: 'the Frosted Peaks', deepWilderness: 'the Deep Wilderness', valoria: 'Valoria',
  azureIsles: 'the Azure Isles', emeraldIsles: 'the Emerald Isles', shatteredIsles: 'the Shattered Isles', sunkenIsles: 'the Sunken Isles',
  demonContinent: 'the Demon Continent',
};

/** The dungeons with builder's plans, and how many pieces each floor's plan is in. */
export const PLAN_DUNGEONS: Record<string, { name: string; pieces: number }> = {
  crypt: { name: 'the Old Crypt', pieces: 3 },
  drownedShrine: { name: 'the Drowned Shrine', pieces: 3 },
  hollowRidge: { name: 'Hollow Ridge', pieces: 3 },
  mine: { name: 'the Glen Mine', pieces: 2 },
};

/** Delvers' notes: who wrote them, and what they say. */
export const DELVER_NOTES: { dungeon: string; text: string }[] = [
  { dungeon: 'crypt', text: 'The third lever is a lie. Pull it and the floor goes.' },
  { dungeon: 'crypt', text: 'Sealed after the flood, they said. Sealed with what? The mortar is fresh.' },
  { dungeon: 'crypt', text: 'Something sleeps in the ossuary. Go round by the low passage.' },
  { dungeon: 'drownedShrine', text: 'The water drops when the bell rings. I heard it twice and then never again.' },
  { dungeon: 'drownedShrine', text: 'Left at the broken statue. Always left. Right is where Hob went.' },
  { dungeon: 'drownedShrine', text: 'The altar room has a second door behind the tapestry. I could not open it.' },
  { dungeon: 'hollowRidge', text: 'Bats in the long hall. Douse your torch and walk slow.' },
  { dungeon: 'hollowRidge', text: 'The plan shows a wall here. There is no wall. There is a drop.' },
  { dungeon: 'hollowRidge', text: 'Two chests past the bridge. One bites.' },
  { dungeon: 'mine', text: 'Old Varn sealed shaft four. He would not say why. I think I know now.' },
  { dungeon: 'mine', text: 'The ore runs blue past the second timber frame. Worth the dark.' },
  { dungeon: 'mine', text: 'If the lamps go out, follow the rail. It always comes back up.' },
];

/** The treasure maps: one per dig spot (world/cartography.ts places them). */
export const TREASURE_COUNT = 25;

const reading = (id: string, name: string, desc: string, rarity: ItemDef['rarity'], kind = 'map'): ItemDef =>
  ({ id, name, kind: 'consumable', rarity, stack: false, desc, stats: {}, use: { kind } });

export const MAP_ITEMS: Record<string, ItemDef> = {};
/** item id -> the baked icon it shares (pieces of one region share their region's art) */
export const MAP_ICON_ALIAS: Record<string, string> = {};

for (const [r, n] of Object.entries(REGION_PIECES)) {
  const where = REGION_NAMES[r];
  for (let i = 1; i <= n; i++) {
    const id = `mapPiece_${r}_${i}`;
    MAP_ITEMS[id] = reading(id, `Map of ${where}, piece ${i} of ${n}`,
      `A torn piece of a surveyor's map of ${where}. Read it to ink its part of the land onto your map; find every piece for the whole chart.`, 'fine');
    MAP_ICON_ALIAS[id] = `mapPiece_${r}`;
  }
  const oc = `oldChart_${r}`;
  MAP_ITEMS[oc] = reading(oc, `Old Chart of ${where}`,
    `A whole chart of ${where}, drawn a long time ago. Read it to ink the region. Things change: some of it will be wrong, and you'll only know by going.`, 'rare');
  MAP_ICON_ALIAS[oc] = 'oldChart';
  const fc = `fullChart_${r}`;
  MAP_ITEMS[fc] = { id: fc, name: `Full Chart of ${where}`, kind: 'key', rarity: 'epic', stack: false, stats: {},
    desc: `Every piece of ${where}, put together and sealed. The Royal Cartographer pays well for a chart like this, and every guild hall wants one.` };
  MAP_ICON_ALIAS[fc] = 'fullChart';
}
MAP_ITEMS.seaChart = reading('seaChart', 'Sea Chart of the Western Isles', 'A captain\'s chart: the coasts and islands of the western seas, soundings and all. Read it to ink the isles\' shores.', 'rare');
MAP_ITEMS.surveySheet = reading('surveySheet', "Surveyor's Sheet", 'A blank survey sheet on a board. Use it where you stand: everything you have walked within 600 m goes onto your map in ink.', 'fine', 'survey');
MAP_ITEMS.blankSheet = { id: 'blankSheet', name: 'Blank Map Sheet', kind: 'material', rarity: 'common', stack: true, stats: {}, desc: 'Good paper for maps. With ink, the Royal Cartographer will let you copy one of your charts at her desk to sell.' };
MAP_ITEMS.inkPot = { id: 'inkPot', name: 'Pot of Iron-Gall Ink', kind: 'material', rarity: 'common', stack: true, stats: {}, desc: 'Black ink that browns with age. One pot is enough for one chart.' };
for (let i = 0; i < TREASURE_COUNT; i++) {
  const id = `treasureMap_${i}`;
  MAP_ITEMS[id] = reading(id, 'Treasure Map', 'A scrap of paper with a few landmarks and a red X. Lay it beside your map (M) and work out where it is. Dig at the X.', 'rare', 'treasure');
  MAP_ICON_ALIAS[id] = `treasure/t${String(i).padStart(2, '0')}`;
}
for (const [d, p] of Object.entries(PLAN_DUNGEONS)) {
  for (let i = 1; i <= p.pieces; i++) {
    const id = `floorPlan_${d}_${i}`;
    MAP_ITEMS[id] = reading(id, `Builder's Plan of ${p.name}, piece ${i}`,
      `A torn corner of the old builders' plan of ${p.name}. Read it and it lays over your dungeon map in brown ink. Plans are old: where the plan and the stone disagree, look harder.`, 'fine', 'plan');
    MAP_ICON_ALIAS[id] = 'floorPlanPiece';
  }
  const gp = `guildPlan_${d}`;
  MAP_ITEMS[gp] = reading(gp, `Guild Plan of ${p.name}`, `The guild's plan of ${p.name}, from the last party that cleared it. The whole floor, but no chests and no secrets, and it's not new.`, 'fine', 'plan');
  MAP_ICON_ALIAS[gp] = 'guildPlan';
}
DELVER_NOTES.forEach((n, i) => {
  const id = `delverNote_${i}`;
  MAP_ITEMS[id] = reading(id, "A Delver's Note", `A grimy page from someone who came this way before you. "${n.text}"`, 'common', 'note');
  MAP_ICON_ALIAS[id] = 'delverNote';
});
