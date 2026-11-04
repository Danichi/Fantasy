import type { Rarity } from '../itemDefs';
import type { PartSpec } from '../../ui/art/parts';
import { add, recipe, source, type CatArt } from './kit';

// Crafting materials (the item plan, §8): ores and ingots, timber, hides and
// leathers, cloth and fibres, gems, monster parts, essences and rare finds.
// Every one has a home: a vein, a foe, a shop, a site.

const RAR: Rarity[] = ['common', 'common', 'common', 'fine', 'fine', 'rare', 'rare', 'epic', 'epic'];
const part = (s: PartSpec): CatArt => ({ k: 'part', s });
const mat = (id: string, name: string, tier: number, desc: string, art: CatArt, src: string[], rarity?: Rarity) =>
  add({ id, name, kind: 'material', rarity: rarity ?? RAR[tier], stack: true, desc, stats: {}, tier }, src, art);

// ---- ores and ingots ----------------------------------------------------------------------------
mat('deepsteelOre', 'Deepsteel Ore', 4, 'Blue-black ore from the dwarven veins of the White and Deep Mountains (tier 4). Heavy as a promise.', part({ kind: 'ore', color: '#3a4458', accent: '#5a7ad8' }), ['node:deepsteel', 'drop:construct:4', 'shop:smith:4']);
mat('tinOre', 'Tin Ore', 5, 'Grey tin from the desert hills, streaked with copper. Smelted together they make sunbrass (tier 5).', part({ kind: 'ore', color: '#8a8478', accent: '#c8a050' }), ['node:tin', 'shop:smith:5']);
mat('goldOre', 'Gold Ore', 4, 'Quartz shot through with gold, from the high veins. Jewellers want it.', part({ kind: 'ore', color: '#8a8070', accent: '#f0c040', glow: '#ffd060' }), ['node:gold', 'shop:jeweller:4']);
mat('seaGlass', 'Sea-Glass', 6, 'Glass the sea has ground smooth: from wrecks, beaches and the bellies of sea beasts (tier 6).', part({ kind: 'glass', color: '#5ad0c0' }), ['drop:sea:6', 'site:drownedTower', 'shop:smith:6', 'chest:6']);
mat('coralIron', 'Coral Iron', 6, 'Iron from a wreck, grown through with red coral. Smelted with sea-glass it makes tideglass.', part({ kind: 'ore', color: '#6a4a44', accent: '#e05a4a' }), ['drop:sea:6', 'chest:6', 'shop:smith:6']);
mat('duskOre', 'Dusk Ore', 8, 'Black ore from the Iron Below, cold to the touch, found where the Dark has torn the ground (tier 8).', part({ kind: 'ore', color: '#1e1b24', accent: '#7a3aff', glow: '#7a3aff' }), ['drop:gloam:6', 'site:darkScar', 'chest:7']);
mat('deepsteelIngot', 'Deepsteel Ingot', 4, 'A bar of dwarven deepsteel (tier 4): blue-black, stubborn, very hard.', part({ kind: 'ingot', color: '#46526a', count: 2 }), ['shop:smith:4']);
mat('sunbrassIngot', 'Sunbrass Ingot', 5, 'Tin and copper and a little sun: the warm brass of the Expanse (tier 5).', part({ kind: 'ingot', color: '#d8a84a', count: 2 }), ['shop:smith:5']);
mat('tideglassIngot', 'Tideglass Ingot', 6, 'A bar of sea-green glass-metal (tier 6). It rings like a bell.', part({ kind: 'ingot', color: '#5ac8c0', count: 2, glow: '#5ad0c0' }), ['shop:smith:6']);
mat('starmetalIngot', 'Starmetal Ingot', 7, 'Star-metal folded into a bar (tier 7): black, flecked with silver, faintly warm.', part({ kind: 'ingot', color: '#34343f', accent: '#c8d4ff', count: 2, glow: '#9ab8ff' }), []);
mat('duskironIngot', 'Duskiron Ingot', 8, 'Dusk-iron (tier 8): matte black that seems to swallow light.', part({ kind: 'ingot', color: '#1e1b24', accent: '#7a3aff', count: 2, glow: '#7a3aff' }), []);
mat('goldIngot', 'Gold Bar', 4, 'A little gold bar for settings and chains.', part({ kind: 'ingot', color: '#e8c040' }), ['shop:jeweller:3']);
recipe('deepsteelIngot', 'forge', 'smithing', 15, [['deepsteelOre', 2], ['coal', 1]], 'basic', { quality: false });
recipe('sunbrassIngot', 'forge', 'smithing', 20, [['tinOre', 1], ['copperOre', 1], ['coal', 1]], 'basic', { quality: false });
recipe('tideglassIngot', 'forge', 'smithing', 25, [['seaGlass', 2], ['coralIron', 1]], 'basic', { quality: false });
recipe('starmetalIngot', 'forge', 'smithing', 30, [['starmetal', 1], ['coal', 2]], 'book:bookStarfall', { quality: false });
recipe('duskironIngot', 'forge', 'smithing', 35, [['duskOre', 2], ['essenceShadow', 1]], 'book:bookIronBelow', { quality: false });
recipe('goldIngot', 'forge', 'jewelcrafting', 8, [['goldOre', 2]], 'basic', { quality: false });

// ---- timber ----------------------------------------------------------------------------------------
mat('ironwood', 'Ironwood Timber', 4, 'Dark, dense mountain wood (tier 4). It blunts axes.', part({ kind: 'logs', color: '#4a3a2e', accent: '#7a5a3a' }), ['node:ironwood', 'shop:bowyer:4']);
mat('sunpalm', 'Sunpalm Timber', 5, 'Pale, springy palm from the oases (tier 5).', part({ kind: 'logs', color: '#d8b878', accent: '#f0e0b0' }), ['node:sunpalm', 'shop:bowyer:5']);
mat('driftwood', 'Driftwood', 6, 'Sea-bleached timber from the isles\' beaches (tier 6). Salt has made it hard.', part({ kind: 'logs', color: '#b4ab9c', accent: '#e0d8c8' }), ['node:driftwood', 'shop:bowyer:6']);
mat('starwood', 'Starwood', 7, 'Wood from a tree a fallen star struck: black-grained and shining (tier 7).', part({ kind: 'logs', color: '#2e2c44', accent: '#9ab8ff', glow: '#9ab8ff' }), ['site:fallenStar']);
mat('gloamwood', 'Gloamwood', 8, 'Wood from the Gravewood\'s heart and the Dark scars (tier 8). It is cold and it does not burn.', part({ kind: 'logs', color: '#2a1e2e', accent: '#7a3aff' }), ['site:darkScar', 'drop:undead:6', 'site:graves']);

// ---- hides and leathers ------------------------------------------------------------------------
const HIDES: [string, string, string, string, number, string, string[]][] = [
  ['deephideRaw', 'Raw Deephide', 'deephide', 'Deephide', 4, '#3a3a44', ['drop:beast:4', 'drop:insect:4']],
  ['sandwyrmHide', 'Sandwyrm Hide', 'sandwyrmLeather', 'Sandwyrm Leather', 5, '#b08850', ['drop:sea:5', 'drop:wyrm:5', 'drop:desert:5']],
  ['sharkHide', 'Shark Hide', 'sharkskin', 'Sharkskin', 6, '#6a7480', ['drop:sea:6']],
  ['starhideRaw', 'Raw Starhide', 'starhide', 'Starhide', 7, '#2a2a38', ['drop:beast:7', 'site:fallenStar']],
  ['gloamhideRaw', 'Raw Gloamhide', 'gloamhide', 'Gloamhide', 8, '#1a141e', ['drop:gloam:7']],
];
for (const [raw, rawName, tanned, tannedName, t, col, src] of HIDES) {
  mat(raw, rawName, t, `An untanned hide (tier ${t}). The tanning rack makes ${tannedName.toLowerCase()} of it.`, part({ kind: 'hide', color: col }), src);
  mat(tanned, tannedName, t, `Tanned ${tannedName.toLowerCase()} (tier ${t}): straps, jerkins, grips.`, part({ kind: 'leather', color: col, count: 2 }), t <= 6 ? [`shop:tailor:${t}`] : []);
  recipe(tanned, 'loom', 'tailoring', [0, 0, 0, 0, 15, 20, 25, 30, 35][t], [[raw, 1]], t >= 7 ? `book:${t === 7 ? 'bookStarfall' : 'bookIronBelow'}` : 'basic', { quality: false });
}

// ---- cloth and fibres --------------------------------------------------------------------------
const CLOTH: [string, string, string, string, number, string, string, string[]][] = [
  ['deepwoolFleece', 'Deepwool Fleece', 'deepwool', 'Deepwool Felt', 4, '#6a7480', '#4a5a6a', ['shop:tailor:4', 'drop:beast:4']],
  ['sunCotton', 'Sun-Cotton', 'sunSilk', '', 5, '#f0e8d0', '', ['shop:tailor:5', 'site:farmstead']],
  ['seaByssus', 'Sea-Silk Byssus', 'seaSilk', 'Sea-Silk', 6, '#c8b88a', '#1a7a8a', ['drop:sea:6', 'shop:tailor:6']],
  ['moonThread', 'Moon-Thread', 'moonweave', 'Moonweave', 7, '#dfe6ff', '#22224a', ['site:fairyRing', 'site:wrongCircle']],
  ['gloamThread', 'Gloam-Thread', 'gloamweave', 'Gloamweave', 8, '#5a4a6a', '#1e1428', ['drop:gloam:7', 'site:darkScar']],
];
for (const [fibre, fibreName, cloth, clothName, t, fc, cc, src] of CLOTH) {
  mat(fibre, fibreName, t, `Fibre for the loom (tier ${t}).`, part({ kind: fibre === 'deepwoolFleece' ? 'wool' : 'dust', color: fc }), src);
  if (clothName) mat(cloth, clothName, t, `${clothName}, woven (tier ${t}).`, part({ kind: 'cloth', color: cc, count: 2, glyph: 'weave' }), t <= 6 ? [`shop:tailor:${t}`] : []);
  recipe(cloth, 'loom', 'tailoring', [0, 0, 0, 0, 15, 20, 25, 30, 35][t], [[fibre, 2]], t >= 7 ? `book:${t === 7 ? 'bookStarfall' : 'bookIronBelow'}` : 'basic', { quality: false });
}
mat('silkCocoon', 'Silk Cocoons', 3, 'Cocoons from the capital\'s silk farms. The loom spins them into silk.', part({ kind: 'gel', color: '#f0e8d0' }), ['shop:tailor:3']);
recipe('silk', 'loom', 'tailoring', 8, [['silkCocoon', 2]], 'basic', { quality: false });
source('sunSilk', 'shop:tailor:5');

// ---- gems --------------------------------------------------------------------------------------
export const GEM_INFO: [string, string, number, string, string, string[]][] = [
  // key, name, tier, colour, where, sources for the rough stone
  ['Topaz', 'Topaz', 5, '#f0a830', 'from the desert\'s copper and tin veins', ['node:tin', 'shop:jeweller:5']],
  ['Emerald', 'Emerald', 4, '#2ac06a', 'from gold veins, Emerald Cove and elven trade', ['node:gold', 'fshop:elven', 'shop:jeweller:6']],
  ['Ruby', 'Ruby', 4, '#e0102a', 'from the deep dwarven veins', ['node:deepsteel', 'shop:jeweller:4']],
  ['Starstone', 'Starstone', 7, '#9ab8ff', 'from fallen-star sites', ['site:fallenStar']],
  ['Onyx', 'Onyx', 6, '#1a1a22', 'from the Dark\'s scars', ['site:darkScar', 'drop:gloam:5']],
  ['Moonstone', 'Moonstone', 5, '#dfe8ff', 'from Gravewood graves, by night', ['site:graves', 'drop:undead:4']],
  ['Sunstone', 'Sunstone', 6, '#ffb040', 'from Sunspire\'s Great Well', ['done:cistern-rats', 'shop:jeweller:5', 'fshop:desert']],
];
for (const [key, name, t, col, where, src] of GEM_INFO) {
  mat(`rough${key}`, `Rough ${name}`, t, `A dull stone ${where}. A jewelcrafter sees the ${name.toLowerCase()} inside it.`, { k: 'trinket', s: { kind: 'crystal', color: col } }, src, 'fine');
  mat(`cut${key}`, name, t, `A cut ${name.toLowerCase()}.`, { k: 'trinket', s: { kind: 'crystal', color: col, glow: col } }, [`shop:jeweller:${Math.min(6, t)}`], t >= 6 ? 'rare' : 'fine');
  recipe(`cut${key}`, 'workbench', 'jewelcrafting', [0, 1, 5, 10, 12, 15, 20, 25, 30][t], [[`rough${key}`, 1]], 'basic', { quality: false, step: 'none' });
}
source('pearl', 'drop:sea:5', 'shop:jeweller:6');

// ---- monster parts -----------------------------------------------------------------------------
// [id, name, tier, art, the family that drops it, desc]
const PARTS: [string, string, number, PartSpec, string, string][] = [
  ['alphaMane', 'Alpha Mane', 3, { kind: 'pelt', color: '#5a5a62' }, 'beast', 'The ruff of a pack leader. Tailors trim cloaks with it.'],
  ['boarBristle', 'Boar Bristles', 1, { kind: 'dust', color: '#4a3a2a' }, 'beast', 'Stiff bristles for brushes and fletching.'],
  ['goblinEar', 'Goblin Ear', 1, { kind: 'trophy', color: '#7a9a4a' }, 'goblin', 'The Watch pays a bounty on them. Don\'t ask how they know.'],
  ['crudeBomb', 'Crude Goblin Bomb', 1, { kind: 'gourd', color: '#6a5a3a', accent: '#3a2a1a' }, 'goblin', 'A clay pot of black powder and nails. An alchemist can make something better of it.'],
  ['goblinTotem', 'Goblin Totem', 2, { kind: 'fetish', color: '#8a6a3a' }, 'goblin', 'Bones and feathers on a stick. The goblins think it keeps them safe.'],
  ['warPaint', 'Orc War-Paint', 3, { kind: 'gourd', color: '#a02a1a', accent: '#3a1a10' }, 'orc', 'Red clay and fat in a horn pot.'],
  ['blackIronCoin', 'Black-Iron Coin', 3, { kind: 'seal', color: '#2a2a30' }, 'orc', 'Grukk\'s black-iron payment. The smith can melt it; a collector would rather not.'],
  ['acidSac', 'Acid Sac', 2, { kind: 'sac', color: '#a8d04a', accent: '#e8ff7a' }, 'slime', 'A bladder of acid from an ooze. Alchemists make flasks of it.'],
  ['ratTail', 'Rat Tail', 1, { kind: 'trophy', color: '#9a7a6a' }, 'insect', 'The cellar-man pays a copper a tail.'],
  ['plagueTooth', 'Plague Tooth', 2, { kind: 'fang', color: '#c8c09a', glyph: 'slim' }, 'insect', 'A yellow rat tooth. Venom oil starts with these.'],
  ['batWing', 'Bat Wing', 2, { kind: 'hide', color: '#3a2a2a' }, 'insect', 'Leathery wing membrane.'],
  ['echoGland', 'Echo-Gland', 3, { kind: 'sac', color: '#8a6a7a' }, 'insect', 'A bat\'s hearing, in a little sac. Night Eyes are brewed from it.'],
  ['caveGuano', 'Cave Guano', 1, { kind: 'dust', color: '#5a5a3a' }, 'insect', 'Saltpetre: the start of blackpowder.'],
  ['spiderSilk', 'Spider Silk', 3, { kind: 'cloth', color: '#e8e8f0', glyph: 'weave' }, 'insect', 'A skein of spider silk, stronger than linen.'],
  ['eyeCluster', 'Spider Eye Cluster', 3, { kind: 'gel', color: '#2a2a3a', accent: '#c02a2a' }, 'insect', 'Eight eyes, still glistening.'],
  ['crabClaw', 'Crab Claw', 4, { kind: 'claw', color: '#c8643a' }, 'sea', 'A great crab claw.'],
  ['colossusChitin', 'Colossus Chitin', 6, { kind: 'shell', color: '#a0302a' }, 'sea', 'A plate of the Crab Colossus\'s shell.'],
  ['graveCloth', 'Grave Cloth', 3, { kind: 'cloth', color: '#9a9a88' }, 'undead', 'A burial wrapping. Tailors of a certain kind use it.'],
  ['frostHeart', 'Wight\'s Frost-Heart', 5, { kind: 'essence', color: '#7fd4ff', glow: '#7fd4ff' }, 'undead', 'A lump of ice that was a heart. It never melts.'],
  ['shadeSmoke', 'Shade Smoke', 5, { kind: 'essence', color: '#4a3a6a', glow: '#7a3aff' }, 'gloam', 'Smoke in a stoppered jar. It moves on its own.'],
  ['riftShard', 'Rift Shard', 6, { kind: 'glass', color: '#8a4aff' }, 'gloam', 'A sliver of the rift itself, sharp on every side.'],
  ['gloamIchor', 'Gloam Ichor', 6, { kind: 'gel', color: '#2a1a3a', accent: '#7a3aff', glow: '#7a3aff' }, 'gloam', 'What runs in the Dark\'s creatures instead of blood.'],
  ['scarabCarapace', 'Scarab Carapace', 5, { kind: 'shell', color: '#2a6a5a' }, 'insect', 'An iridescent beetle shell from the desert.'],
  ['golemCore', 'Sand-Golem Core', 6, { kind: 'meteor', color: '#c8a050', glow: '#ffc040' }, 'construct', 'The warm stone heart of a sand golem.'],
  ['mummyWrap', 'Mummy Wrap', 5, { kind: 'cloth', color: '#c8b890' }, 'undead', 'Linen wrapped around the dead of the deep Expanse.'],
  ['leviathanScale', 'Leviathan Scale', 7, { kind: 'scale', color: '#2a4a6a', accent: '#8ad0ff', glow: '#8ad0ff' }, 'sea', 'A scale as big as a shield.'],
  ['sirenFeather', 'Siren Feather', 6, { kind: 'scale', color: '#c8e0e8', accent: '#ffffff' }, 'sea', 'A long feather that hums.'],
  ['drakeScale', 'Drake Scale', 3, { kind: 'scale', color: '#4a6a3a' }, 'wyrm', 'A single drake scale.'],
  ['drakeHeart', 'Drake Heart', 5, { kind: 'essence', color: '#c0302a', glow: '#ff6a2a' }, 'wyrm', 'Still warm. Fire elixirs need it.'],
  ['wyrmTooth', 'Wyrm Tooth', 6, { kind: 'fang', color: '#efe6cc', glyph: 'long' }, 'wyrm', 'A tooth as long as a dagger.'],
  ['feyDust', 'Fey Dust', 4, { kind: 'dust', color: '#e8c0ff', glow: '#e8a0ff' }, 'beast', 'Glittering dust from a fairy ring.'],
  ['treantBark', 'Treant Bark', 4, { kind: 'planks', color: '#5a4a32' }, 'beast', 'Bark from a walking tree. It still flinches.'],
  ['armourRivet', 'Living-Armour Rivet', 3, { kind: 'scrap', color: '#8a8a90' }, 'construct', 'A rivet from armour that walked.'],
  ['rustPlate', 'Rust-Knight Plate', 5, { kind: 'scrap', color: '#8a4a2a' }, 'construct', 'A plate of the Rust Knight\'s armour, still rusting.'],
  ['constructGear', 'Construct Gear', 4, { kind: 'scrap', color: '#a08a5a' }, 'construct', 'A brass gear from something that moved on its own.'],
  ['stormCrest', 'Storm-Wyrm Crest', 7, { kind: 'scale', color: '#5a7a9a', accent: '#ffffff', glow: '#bfe8ff' }, 'sea', 'The crest of the Storm Wyrm, crackling.'],
  ['choirPearl', 'Siren Choir Pearl', 7, { kind: 'pearl', color: '#f0e8ff', glow: '#e0d0ff' }, 'sea', 'A pearl that sings.'],
  ['eelSkin', 'Eel Skin', 4, { kind: 'hide', color: '#4a5a4a' }, 'sea', 'Slick eel skin for grips.'],
  ['raySting', 'Ray Sting', 4, { kind: 'fang', color: '#6a6a7a', glyph: 'long' }, 'sea', 'A barbed sting. Venom oils use it.'],
  ['urchinSpine', 'Urchin Spines', 4, { kind: 'dust', color: '#3a2a4a' }, 'insect', 'A bundle of long black spines.'],
  ['beastSinew', 'Beast Sinew', 2, { kind: 'wire', color: '#c8a87a' }, 'beast', 'Dried sinew for bowstrings.'],
  ['bearClaw', 'Bear Claw', 3, { kind: 'claw', color: '#3a3028' }, 'beast', 'A claw as long as a finger.'],
  ['skeletonBone', 'Old Bone', 2, { kind: 'bone', color: '#e8dcc0' }, 'undead', 'A bone from something that should have stayed in the ground.'],
  ['wispCore', 'Wisp Core', 4, { kind: 'essence', color: '#cfe8ff', glow: '#cfe8ff' }, 'gloam', 'The light at the middle of a wisp, gone still.'],
  ['banditBadge', 'Bandit Token', 2, { kind: 'seal', color: '#8a6a3a' }, 'bandit', 'A crew\'s token. The Watch and the Crown pay for them.'],
  ['raiderSash', 'Raider Sash', 4, { kind: 'cloth', color: '#a02a2a' }, 'desert', 'A red sash from a desert raider.'],
  ['scrapGear', 'Scrap Gears', 4, { kind: 'scrap', color: '#8a7a5a' }, 'scrap', 'Gears and springs the scrap towns trade by weight.'],
  ['sunGuardScale', 'Sun Guard Scale', 5, { kind: 'scale', color: '#d8b050' }, 'desert', 'A gilt scale from Sun Guard armour.'],
];
for (const [id, name, t, art, fam, desc] of PARTS) mat(id, name, t, desc + ` (tier ${t})`, part(art), [`drop:${fam}:0`]);
for (const id of ['wolfPelt', 'wolfFang', 'boarTusk', 'boarHide']) source(id, 'drop:beast:0');
for (const id of ['slimeJelly', 'slimeGel']) source(id, 'drop:slime:0');
for (const id of ['orcTusk']) source(id, 'drop:orc:0');
for (const id of ['boneDust']) source(id, 'drop:undead:0');
for (const id of ['crabShell', 'sharkTooth', 'sharkFin']) source(id, 'drop:sea:0');
for (const id of ['venomSac']) source(id, 'drop:insect:0');
for (const id of ['wispEssence']) source(id, 'drop:gloam:0');
for (const id of ['scrapMetal']) source(id, 'drop:scrap:0', 'drop:construct:0');

// ---- essences (distilled at the alchemy table) -------------------------------------------------
const ESS: [string, string, string, [string, number][]][] = [
  ['Fire', '#ff6a2a', 'the heat of drake hearts and emberroot', [['drakeHeart', 1], ['emberroot', 2]]],
  ['Frost', '#7fd4ff', 'frost-hearts and silverthistle', [['frostHeart', 1], ['silverthistle', 2]]],
  ['Wind', '#cfeeff', 'feathers and echo-glands', [['sirenFeather', 1], ['echoGland', 1]]],
  ['Light', '#fff0a0', 'wisp cores and holy water', [['wispCore', 1], ['sungrass', 2]]],
  ['Shadow', '#5a3a8a', 'shade smoke and gloam ichor', [['shadeSmoke', 1], ['duskbloom', 1]]],
  ['Earth', '#a08050', 'golem cores and ironleaf', [['golemCore', 1], ['ironleaf', 2]]],
  ['Tide', '#2aa8a0', 'sea-silk and pearls', [['seaByssus', 1], ['pearl', 1]]],
  ['Star', '#9ab8ff', 'star-metal and starmoss', [['starmetal', 1], ['starmoss', 1]]],
];
for (const [k, col, from, inputs] of ESS) {
  mat(`essence${k}`, `Essence of ${k}`, 5, `${k} itself, distilled from ${from}. Runes and the finest work need it.`, part({ kind: 'essence', color: col, glow: col }), [`chest:5`, 'shop:alchemist:5'], 'rare');
  recipe(`essence${k}`, 'alchemy', 'herbalism', 14, inputs, 'basic', { quality: false, step: 'stir' });
}

// ---- rare finds and reagents ---------------------------------------------------------------------
const RARE: [string, string, number, PartSpec, string, string[]][] = [
  ['amber', 'Amber', 3, { kind: 'glass', color: '#e0902a' }, 'Old resin with a fly in it.', ['shop:jeweller:2', 'site:hollowTree']],
  ['coral', 'Red Coral', 6, { kind: 'glass', color: '#e05a4a' }, 'A branch of red coral from the reefs.', ['drop:sea:5', 'shop:jeweller:6']],
  ['ambergris', 'Ambergris', 6, { kind: 'gel', color: '#c8b890' }, 'Grey, waxy and worth its weight in gold. Perfumers and alchemists want it.', ['beast:leviathan', 'chest:6']],
  ['phoenixFeather', 'Phoenix Feather', 7, { kind: 'scale', color: '#ff6a2a', accent: '#ffe080', glow: '#ff9a3a' }, 'A feather that is warm, and that grows back if you burn it.', ['site:fallenStar', 'chest:7']],
  ['unicornHair', 'White Stag Hair', 6, { kind: 'wire', color: '#f4f4f8', glow: '#cfe8ff' }, 'Hair from the White Stag\'s mane: the old songs call it unicorn hair.', ['boss:whiteStag']],
  ['pureSalt', 'Pure Salt', 2, { kind: 'dust', color: '#f0f0f0' }, 'Salt from the desert pans: for curing, and for wards.', ['shop:alchemist:2', 'shop:trader:5']],
  ['quicksilver', 'Quicksilver', 4, { kind: 'gel', color: '#c8ccd4', glow: '#ffffff' }, 'Liquid metal in a vial.', ['shop:alchemist:3', 'chest:3']],
  ['sulphur', 'Sulphur', 2, { kind: 'dust', color: '#e8d040' }, 'Yellow stone that stinks when it burns. Blackpowder needs it.', ['shop:alchemist:2', 'shop:smith:2', 'node:coal']],
  ['iceMoss', 'Ice-Moss', 4, { kind: 'dust', color: '#bfe8ff' }, 'Moss from the frozen peaks that stays frozen in your hand.', ['shop:alchemist:4']],
  ['sunflowerOil', 'Sunflower Oil', 1, { kind: 'gourd', color: '#e8c040', accent: '#8a6a1a' }, 'Pressed oil for cooking and for blade oils.', ['shop:inn:1', 'shop:alchemist:1']],
  ['dragonsBlood', 'Dragon\'s-Blood Resin', 5, { kind: 'glass', color: '#9a1a1a' }, 'Red resin from the desert trees.', ['shop:alchemist:5']],
  ['mithrilDust', 'Mithril Dust', 6, { kind: 'dust', color: '#dfe8ff', glow: '#dfe8ff' }, 'A pinch of the metal of the old songs, from deep deepsteel veins.', ['node:deepsteel', 'chest:6']],
];
for (const [id, name, t, art, desc, src] of RARE) mat(id, name, t, desc, part(art), src);
