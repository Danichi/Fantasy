import { PLACE_DEFS, pxToWorld } from './worldMap';

// Every region of the known world (World Expansion prompt §§2–16, §82).
// Outlines live in data/regions.json (traced from the world map); this file
// is the design data systems read: names, levels, weather, ambience,
// encounters, resources, factions, landmarks and the three content layers.

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'heavyRain' | 'fog' | 'storm' | 'snow' | 'blizzard' | 'heatHaze';
export type FactionId =
  | 'cresha' | 'knights' | 'adventurers' | 'merchants' | 'dwarves' | 'elves' | 'valoria' | 'pirates' | 'desertKingdoms' | 'demons' | 'wildTribes' | 'none';

export interface Landmark {
  id: string;
  name: string;
  kind: 'town' | 'city' | 'capital' | 'castle' | 'port' | 'landmark' | 'dungeon' | 'ruin';
  x: number;
  z: number;
}

export interface RegionDef {
  id: string;
  name: string;
  subtitle: string;
  levels: [number, number];
  /** weather weights; normalised by the weather system */
  weather: Partial<Record<WeatherKind, number>>;
  ambience: string;
  music: 'village' | 'crypt' | 'wild' | 'city' | 'sea' | 'mountain' | 'desert' | 'demon';
  encounters: string;
  faction: FactionId;
  resources: string[];
  exports: string[];
  imports: string[];
  landmarks: Landmark[];
  /** §71: surface, hidden and deep content (built out in each region's phase) */
  surface: string[];
  hidden: string[];
  deep: string[];
  /** §82: why this region exists and why the player goes there */
  coherence: {
    geography: string;
    people: string;
    produces: string;
    threats: string;
    roads: string;
    power: string;
    unique: string;
    secrets: string;
    draw: string;
    story: string;
  };
}

const place = (id: string, name: string, kind: Landmark['kind']): Landmark => {
  const p = PLACE_DEFS.find((d) => d.id === id);
  const w = p ? pxToWorld(p.px[0], p.px[1]) : { x: 0, y: 0 };
  return { id, name, kind, x: Math.round(w.x), z: Math.round(w.y) };
};
const at = (id: string, name: string, kind: Landmark['kind'], x: number, z: number): Landmark => ({ id, name, kind, x, z });

export const REGIONS: Record<string, RegionDef> = {
  elderGlen: {
    id: 'elderGlen', name: 'Elder Glen', subtitle: 'The Breadbasket of Cresha', levels: [1, 5],
    weather: { clear: 5, cloudy: 3, rain: 2, fog: 1, storm: 0.3 }, ambience: 'meadow', music: 'village', encounters: 'elderGlen', faction: 'cresha',
    resources: ['grain', 'vegetables', 'livestock', 'wool', 'milk', 'eggs', 'sungrass', 'wild mint'], exports: ['grain', 'vegetables', 'livestock'], imports: ['tools', 'salt', 'cloth'],
    landmarks: [place('elderGlen', 'Elder Glen', 'town'), at('crypt', 'The Old Crypt', 'dungeon', 0, -318), at('mill', 'The River Mill', 'landmark', 154, -36), at('quarry', 'The Old Quarry', 'landmark', -180, -262), at('standingStones', 'The Sunwheel Stones', 'ruin', -300, -350)],
    surface: ['farms and fields', 'the plaza and training yard', 'guild D-rank contracts', 'the river mills'],
    hidden: ['the standing stone in the north hills', 'the granary cellar tunnels', 'the crypt’s sealed glyph door'],
    deep: ['the lower crypt', 'the Orc Warlord'],
    coherence: {
      geography: 'Fertile river valley between the northern woods and the southern marches.', people: 'Farmers settled the flood-rich soil generations ago.',
      produces: 'Grain, vegetables and livestock that feed Cresha.', threats: 'Wolves, crows, goblins at night, and whatever wakes in the old crypt.',
      roads: 'The King’s Road east to Port Aurelle; lanes to the capital road and the north woods.', power: 'The Crown of Cresha, through a town reeve and the Adventurer’s Guild.',
      unique: 'Golden fields, windmills and red-and-slate roofs.', secrets: 'The crypt predates Cresha: its glyphs match ruins across the world.',
      draw: 'Home, first friends, first steel.', story: 'Where the summoned hero wakes and learns to survive.',
    },
  },
  cresha: {
    id: 'cresha', name: 'The Kingdom of Cresha', subtitle: 'Unity · Trade · Prosperity', levels: [1, 18],
    weather: { clear: 5, cloudy: 3, rain: 2.2, heavyRain: 0.5, fog: 1, storm: 0.4 }, ambience: 'meadow', music: 'wild', encounters: 'creshaWilds', faction: 'cresha',
    resources: ['timber', 'herbs', 'game', 'stone', 'iron (hills)'], exports: ['grain', 'wool', 'timber'], imports: ['ore', 'spices', 'luxury goods'],
    landmarks: [at('waystation', 'The Wayfarer’s Rest', 'landmark', 1380, 150), at('ridge', 'Gull Ridge Overlook', 'landmark', 2230, 120)],
    surface: ['hamlets, farms and roadside inns', 'the King’s Road', 'river crossings'],
    hidden: ['bandit hideouts in the hills', 'forgotten shrines'],
    deep: ['the sunken abbey beneath the marsh'],
    coherence: {
      geography: 'Rolling green heartland of the continent, sheltered by forest to the north and mountains to the south.', people: 'Humans drawn by farmland, rivers and trade roads.',
      produces: 'Food, wool and timber for the realm.', threats: 'Bandits, beasts, border raids.', roads: 'The King’s Road links the capital, Elder Glen and Port Aurelle.',
      power: 'The Crown of Cresha and its knightly orders.', unique: 'Emerald fields, blue rivers and white-walled towns.', secrets: 'Standing stones older than the kingdom.',
      draw: 'Travel, contracts and the road to the great cities.', story: 'The kingdom that summoned the hero.',
    },
  },
  portAurelle: {
    id: 'portAurelle', name: 'Port Aurelle', subtitle: 'Great Port City of Cresha', levels: [5, 20],
    weather: { clear: 4, cloudy: 3, rain: 2, fog: 2, storm: 0.8 }, ambience: 'harbor', music: 'city', encounters: 'portAurelle', faction: 'cresha',
    resources: ['fish', 'salt', 'pearls'], exports: ['fish', 'imported goods', 'ships'], imports: ['grain', 'ore', 'spices', 'timber'],
    landmarks: [at('portAurelle', 'Port Aurelle', 'city', 2760, 150), at('lighthouse', 'The Aurelle Light', 'landmark', 2990, 60), at('academy', 'The Knight’s Academy', 'landmark', 2800, 80)],
    surface: ['Grand Market', 'Adventurer’s Quarter', 'Knight’s District', 'the Harbour and Fisherman’s Wharf', 'the Dwarven Quarter', 'the Noble District'],
    hidden: ['the Lower City’s black market', 'smugglers’ sea caves', 'the thieves’ den'],
    deep: ['the drowned catacombs under the old harbour'],
    coherence: {
      geography: 'A sheltered bay on the eastern coast where the King’s Road meets the Grand Ocean.', people: 'Sailors, merchants, dwarves and adventurers from every land.',
      produces: 'Fish, ships and trade.', threats: 'Pirates, smugglers, sea monsters beyond the reef.', roads: 'The King’s Road west; sea routes to the islands, the White Mountains and beyond.',
      power: 'A royal governor, the merchant guilds and the Academy’s knights.', unique: 'White stone and blue slate, canals, towers and sails.',
      secrets: 'The harbour is built on older quays than anyone remembers.', draw: 'The Academy, the second guild, ships and the dwarves’ expedition.', story: 'Where the hero begins real training.',
    },
  },
  royalCapital: {
    id: 'royalCapital', name: 'The Royal Capital', subtitle: 'Heart of the Kingdom', levels: [10, 30],
    weather: { clear: 5, cloudy: 3, rain: 2, fog: 1, storm: 0.3 }, ambience: 'city', music: 'city', encounters: 'capital', faction: 'cresha',
    resources: ['knowledge', 'arcane reagents'], exports: ['law', 'coin', 'enchantments'], imports: ['everything'],
    landmarks: [place('royalCapital', 'The Royal Capital', 'capital'), at('palace', 'The Sunspire Palace', 'castle', -3300, -1000)],
    surface: ['the palace and court', 'the grand Adventurer’s Guild', 'temples, markets, the Royal Library', 'the Arcane Collegium'],
    hidden: ['the old city beneath the palace', 'court intrigues'],
    deep: ['the Crown Vault', 'the summoning chamber'],
    coherence: {
      geography: 'A hill above a river bend in the kingdom’s west.', people: 'The court, the orders, scholars and merchants.', produces: 'Law, coin, knowledge.',
      threats: 'Politics, assassins, what the summoning woke.', roads: 'Royal roads to every corner of Cresha.', power: 'The Crown.', unique: 'White marble, gold and blue banners.',
      secrets: 'Why the hero was summoned.', draw: 'Royal quests, the Collegium, the grand guild.', story: 'The political heart of the hero’s tale.',
    },
  },
  verdantElves: {
    id: 'verdantElves', name: 'The Verdant Elves', subtitle: 'Ancient Forest', levels: [12, 40],
    weather: { clear: 3, cloudy: 3, rain: 3, fog: 3, storm: 0.4 }, ambience: 'forest', music: 'wild', encounters: 'elvenForest', faction: 'elves',
    resources: ['heartwood', 'moonblossom', 'herbs', 'spirit amber'], exports: ['herbs', 'wood', 'magical materials'], imports: ['metals', 'grain'],
    landmarks: [place('elvenSanctum', 'The Elven Sanctum', 'town'), place('moonlightGlade', 'Moonlight Glade', 'landmark')],
    surface: ['Outer Forest villages, hunters and woodcutters'], hidden: ['Inner Forest elven settlements', 'lost paths'], deep: ['the Ancient Forest temples', 'the Deep Elven Lands'],
    coherence: {
      geography: 'A vast woodland between Cresha and the White Mountains, fed by mountain rivers.', people: 'The elves, who have tended it for millennia.', produces: 'Herbs, heartwood, magic.',
      threats: 'Deep-forest beasts, spirits, getting lost.', roads: 'The North Road to the forest edge, then elven paths.', power: 'The elven councils.', unique: 'Giant trees, waterfalls, glowing blossoms.',
      secrets: 'Starfall Script in the oldest groves.', draw: 'Magic, elven teachers, ancient ruins.', story: 'The ancient mystery begins to speak.',
    },
  },
  whiteMountains: {
    id: 'whiteMountains', name: 'White Mountains', subtitle: 'Dwarven Kingdoms & Ancient Secrets', levels: [18, 50],
    weather: { clear: 3, cloudy: 3, snow: 3, blizzard: 1, fog: 1 }, ambience: 'mountain', music: 'mountain', encounters: 'whiteMountains', faction: 'dwarves',
    resources: ['iron', 'silver', 'gems', 'mithril (deep)'], exports: ['ore', 'metal', 'gemstones'], imports: ['food', 'timber', 'cloth'],
    landmarks: [place('frostpeakCitadel', 'Frostpeak Citadel', 'castle')],
    surface: ['foothill mining villages', 'dwarf roads and bridges'], hidden: ['abandoned mines', 'mountain passes'], deep: ['the upper glaciers and dragons'],
    coherence: {
      geography: 'The great northern range, from forested foothills to glaciers.', people: 'Dwarves and miners.', produces: 'Ore, metal, gems.', threats: 'Avalanches, trolls, wyverns, dragons.',
      roads: 'Dwarf roads from the coast landing; sea route from Port Aurelle.', power: 'The dwarven kingdoms.', unique: 'Snow, ice-blue granite, stone bridges and fortresses.',
      secrets: 'Machines older than the dwarves.', draw: 'The mining expedition, smithing, legendary materials.', story: 'Where the dwarves’ chain leads.',
    },
  },
  deepMountains: {
    id: 'deepMountains', name: 'Deep Mountains', subtitle: 'Forgotten Realms', levels: [35, 70],
    weather: { cloudy: 3, snow: 3, blizzard: 2, fog: 2 }, ambience: 'cave', music: 'mountain', encounters: 'deepMountains', faction: 'dwarves',
    resources: ['star-iron', 'deep crystal', 'mithril'], exports: ['legendary materials'], imports: ['food'],
    landmarks: [place('deepHold', 'The Deep Hold', 'city')],
    surface: ['the high passes'], hidden: ['colossal caverns', 'underground rivers'], deep: ['the Deep Forge', 'ancient machines', 'legendary bosses'],
    coherence: {
      geography: 'The roots of the White Mountains, far below the snow.', people: 'Dwarven capitals underground.', produces: 'Legendary materials.', threats: 'The deep things.',
      roads: 'Through the White Mountains only.', power: 'The dwarf kings.', unique: 'Black stone, blue crystals, forge-light.', secrets: 'A forgotten civilisation’s machines.',
      draw: 'Endgame crafting and dungeons.', story: 'Ancient truths about the summoning.',
    },
  },
  wildlands: {
    id: 'wildlands', name: 'The Wildlands', subtitle: 'Beasts · Ruins · Outlaws', levels: [10, 30],
    weather: { clear: 3, cloudy: 3, rain: 3, fog: 2, storm: 1 }, ambience: 'forest', music: 'wild', encounters: 'wildlands', faction: 'wildTribes',
    resources: ['game', 'hides', 'timber', 'rare herbs'], exports: ['hides'], imports: ['everything'],
    landmarks: [], surface: ['isolated villages and adventurer camps'], hidden: ['bandit camps, monster nests'], deep: ['ruined forts where the road simply ends'],
    coherence: {
      geography: 'Untamed hills and forests west of the capital.', people: 'Trappers, outlaws, holdouts.', produces: 'Hides and game.', threats: 'Beasts, outlaws.',
      roads: 'Roads fade to trails, then nothing.', power: 'No one.', unique: 'Grey crags and dark woods.', secrets: 'Abandoned settlements.', draw: 'Hunting and exploration.', story: 'The edge of civilisation.',
    },
  },
  goldenExpanse: {
    id: 'goldenExpanse', name: 'The Golden Expanse', subtitle: 'Desert of the Lost', levels: [20, 45],
    weather: { clear: 6, heatHaze: 4, storm: 0.6 }, ambience: 'desert', music: 'desert', encounters: 'desert', faction: 'desertKingdoms',
    resources: ['spices', 'glass sand', 'sunstone'], exports: ['spices', 'rare materials', 'caravan goods'], imports: ['water', 'grain', 'metals'],
    landmarks: [place('sunspireOasis', 'Sunspire Oasis', 'city')],
    surface: ['oasis towns and caravans'], hidden: ['buried cities'], deep: ['underground temples and tombs'],
    coherence: {
      geography: 'Dunes and mesas west of the mountains’ rain shadow.', people: 'Desert kingdoms and nomad tribes.', produces: 'Spices and rare materials.', threats: 'Heat, thirst, sand monsters.',
      roads: 'Caravan routes between oases.', power: 'Desert kingdoms.', unique: 'Amber dunes, red mesas, turquoise oases.', secrets: 'Cities beneath the sand.', draw: 'Trade, tombs, treasure.', story: 'An old empire buried.',
    },
  },
  southernMarches: {
    id: 'southernMarches', name: 'The Southern Marches', subtitle: 'Frontier Lands', levels: [8, 25],
    weather: { clear: 4, cloudy: 3, rain: 2, storm: 0.6 }, ambience: 'meadow', music: 'wild', encounters: 'marches', faction: 'cresha',
    resources: ['horses', 'cattle', 'timber'], exports: ['horses', 'cattle'], imports: ['tools'],
    landmarks: [], surface: ['border forts and ranches'], hidden: ['smuggler trails'], deep: ['a collapsed border keep'],
    coherence: {
      geography: 'Rolling frontier between Cresha and the Frosted Peaks.', people: 'Ranchers and border garrisons.', produces: 'Horses and cattle.', threats: 'Raiders from the peaks.',
      roads: 'The south road to Frosthold.', power: 'Cresha’s border lords.', unique: 'Open ranges, watchtowers.', secrets: 'Old smuggler trails.', draw: 'Horses and frontier work.', story: 'The gateway south.',
    },
  },
  frostedPeaks: {
    id: 'frostedPeaks', name: 'The Frosted Peaks', subtitle: 'Ice · Giants · Ancient Ruins', levels: [25, 55],
    weather: { cloudy: 3, snow: 4, blizzard: 2.5, fog: 1 }, ambience: 'mountain', music: 'mountain', encounters: 'frostedPeaks', faction: 'none',
    resources: ['ice crystal', 'furs'], exports: ['furs'], imports: ['food'],
    landmarks: [place('frosthold', 'Frosthold', 'castle')], surface: ['passes and isolated holds'], hidden: ['frozen lakes, ice caves'], deep: ['the giants’ halls'],
    coherence: {
      geography: 'A harsh southern range that walls off the Valorian Empire.', people: 'Few: hardy holds and pass-wardens.', produces: 'Furs.', threats: 'Frost giants, blizzards, thin ice.',
      roads: 'One high pass through Frosthold.', power: 'Nobody holds it for long.', unique: 'Cold white and steel blue.', secrets: 'Ruins frozen in glaciers.', draw: 'The way to Valoria.', story: 'A barrier between nations.',
    },
  },
  deepWilderness: {
    id: 'deepWilderness', name: 'The Deep Wilderness', subtitle: 'Untamed · Dangerous · Mysterious', levels: [30, 65],
    weather: { rain: 4, heavyRain: 2, fog: 3, cloudy: 2, storm: 1 }, ambience: 'jungle', music: 'wild', encounters: 'deepWilderness', faction: 'wildTribes',
    resources: ['glowbloom', 'venom', 'rare hides', 'ancient relics'], exports: ['rare resources'], imports: [],
    landmarks: [], surface: ['jungle edges and tribal villages'], hidden: ['monster territories'], deep: ['ruins older than any map'],
    coherence: {
      geography: 'Jungle and marsh in the continent’s south-west.', people: 'Isolated tribes and beastfolk.', produces: 'Rare flora and fauna.', threats: 'Everything that lives there.',
      roads: 'None.', power: 'The tribes.', unique: 'Dark jungle, purple glowing flora, waterfalls.', secrets: 'The ancient civilisation’s heartland.', draw: 'The most dangerous nature in the world.', story: 'The mystery’s roots.',
    },
  },
  valoria: {
    id: 'valoria', name: 'The Valorian Empire', subtitle: 'A New Kingdom', levels: [30, 60],
    weather: { clear: 6, cloudy: 2, rain: 1.5, storm: 0.4 }, ambience: 'meadow', music: 'city', encounters: 'valoria', faction: 'valoria',
    resources: ['wine', 'marble', 'olives'], exports: ['wine', 'steel'], imports: ['furs', 'spices'],
    landmarks: [place('valoriaCapital', 'Valoria', 'capital')], surface: ['imperial cities and legions'], hidden: ['old republic catacombs'], deep: ['the Emperor’s secret'],
    coherence: {
      geography: 'Warm southern lands beyond the Frosted Peaks.', people: 'Valorians: a distinct culture and empire.', produces: 'Wine, marble, steel.', threats: 'Imperial politics.',
      roads: 'Paved imperial roads; the Frosthold pass north.', power: 'The Emperor and the legions.', unique: 'Terracotta and cream, cypress, vineyards.', secrets: 'Their own summoning records.', draw: 'Another nation to discover.', story: 'A rival view of the hero legend.',
    },
  },
  azureIsles: {
    id: 'azureIsles', name: 'The Azure Isles', subtitle: 'New Lands Await', levels: [15, 35],
    weather: { clear: 6, cloudy: 2, rain: 1.5, storm: 0.6 }, ambience: 'beach', music: 'sea', encounters: 'azureIsles', faction: 'merchants',
    resources: ['pearls', 'coral', 'fish', 'coconuts'], exports: ['pearls', 'fish'], imports: ['tools', 'grain'],
    landmarks: [place('azureHaven', 'Azure Haven', 'port')], surface: ['tropical villages and beaches'], hidden: ['treasure coves'], deep: ['a sunken temple'],
    coherence: {
      geography: 'Warm islands north-east across the Grand Ocean.', people: 'Island traders and fishers.', produces: 'Pearls, fish.', threats: 'Pirates, reef beasts.', roads: 'Sea routes.',
      power: 'Merchant houses.', unique: 'Turquoise lagoons, white sand, palms.', secrets: 'Treasure maps.', draw: 'Exploration and trade.', story: 'The first taste of the sea.',
    },
  },
  emeraldIsles: {
    id: 'emeraldIsles', name: 'The Emerald Isles', subtitle: 'Islands · Fishing · Resources', levels: [15, 35],
    weather: { clear: 4, cloudy: 3, rain: 3, fog: 1, storm: 0.5 }, ambience: 'beach', music: 'sea', encounters: 'emeraldIsles', faction: 'merchants',
    resources: ['rare plants', 'copper', 'timber', 'fish'], exports: ['rare plants', 'timber'], imports: ['tools'],
    landmarks: [place('emeraldCove', 'Emerald Cove', 'port')], surface: ['forested islands and settlements'], hidden: ['mines'], deep: ['a drowned mine'],
    coherence: {
      geography: 'Green islands south-east of Port Aurelle.', people: 'Settlers and miners.', produces: 'Rare plants and resources.', threats: 'Wildlife.', roads: 'Short sea routes.',
      power: 'Merchant charters.', unique: 'Emerald forests on blue water.', secrets: 'Old mine shafts.', draw: 'Resources and fishing.', story: 'Resources for the hero’s craft.',
    },
  },
  shatteredIsles: {
    id: 'shatteredIsles', name: 'The Shattered Isles', subtitle: 'Storms · Survival', levels: [25, 45],
    weather: { storm: 4, heavyRain: 3, fog: 2, cloudy: 2 }, ambience: 'storm', music: 'sea', encounters: 'shatteredIsles', faction: 'pirates',
    resources: ['salvage', 'black pearls'], exports: ['stolen goods'], imports: ['everything'],
    landmarks: [place('wreckersRest', 'Wrecker’s Rest', 'port')], surface: ['pirate havens'], hidden: ['wrecks'], deep: ['the storm’s eye'],
    coherence: {
      geography: 'Broken black rocks in the southern sea.', people: 'Pirates and wreckers.', produces: 'Salvage.', threats: 'Storms, pirates, sea monsters.', roads: 'Dangerous sea routes.',
      power: 'Pirate captains.', unique: 'Slate seas and jagged cliffs.', secrets: 'Wrecks of ships from the far continent.', draw: 'Loot and danger.', story: 'Clues from across the sea.',
    },
  },
  sunkenIsles: {
    id: 'sunkenIsles', name: 'The Sunken Isles', subtitle: 'Ruins · Treasures', levels: [30, 55],
    weather: { clear: 3, cloudy: 3, rain: 2, fog: 2 }, ambience: 'underwater', music: 'sea', encounters: 'sunkenIsles', faction: 'none',
    resources: ['ancient relics', 'deep coral'], exports: [], imports: [],
    landmarks: [place('sunkenSpire', 'The Sunken Spire', 'landmark')], surface: ['ruins breaking the surface'], hidden: ['diving sites'], deep: ['the drowned city'],
    coherence: {
      geography: 'A drowned archipelago far to the south-east.', people: 'None now.', produces: 'Relics.', threats: 'Things of the deep.', roads: 'Sea only.', power: 'None.',
      unique: 'Teal underwater light, submerged ruins.', secrets: 'Ancient technology.', draw: 'Diving and treasure.', story: 'The ancient civilisation’s fall.',
    },
  },
  demonContinent: {
    id: 'demonContinent', name: 'The Demon Continent', subtitle: 'Chaos · Fire · Fallen Kingdoms', levels: [45, 80],
    weather: { cloudy: 3, storm: 2, heatHaze: 3, fog: 1 }, ambience: 'volcanic', music: 'demon', encounters: 'demonContinent', faction: 'demons',
    resources: ['obsidian', 'hellfire ore', 'ashwood'], exports: ['obsidian', 'demon steel'], imports: ['food', 'water'],
    landmarks: [place('ashenPort', 'Ashen Port', 'port'), place('demonCitadel', 'The Obsidian Citadel', 'capital')],
    surface: ['demon ports and cities'], hidden: ['ash forests, ruined kingdoms'], deep: ['the underground systems'],
    coherence: {
      geography: 'A volcanic continent across the Grand Ocean.', people: 'Demons: civilians, merchants, warriors, rulers.', produces: 'Obsidian, demon steel.', threats: 'Volcanoes, monsters, rival factions.',
      roads: 'Ashen roads between citadels; the long sea route west.', power: 'Demon factions.', unique: 'Obsidian, magma, crimson skies.', secrets: 'The other side of the summoning.',
      draw: 'The furthest shore.', story: 'The truth about how the hero came here.',
    },
  },
};

/** Look up a region, falling back to Cresha for anything unmapped on land. */
export function regionDef(id: string): RegionDef | null {
  return REGIONS[id] ?? null;
}
