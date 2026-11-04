import type { ItemStats, Rarity } from '../itemDefs';
import type { ArmorLook, ArmorWeight } from '../armorModels';
import type { TrinketSpec } from '../../ui/art/trinkets';
import type { PaperSpec } from '../../ui/art/paper';
import { named, namedShield, type Named } from './templates';
import { add } from './kit';
import { PIECE, pieceStats, type ArmourSlot } from './armour';
import { SET_BOOKS, SET } from './sets';
import { TIERS } from './tiers';

// Named uniques and legendaries (the item plan, §9): what bosses, lair
// beasts, sea monsters, the story and the wild sites give, once each, and the
// Grandmaster pieces each teacher gives at mastery rank 10.

const W = (src: string, n: Named, rarity?: Rarity) => named({ ...n, ...(rarity ? { rarity } : {}) }, [src], true);
const A = (src: string, id: string, name: string, slot: ArmourSlot | 'cloak', weight: ArmorWeight, tier: number, look: Partial<ArmorLook>, desc: string, fx?: Record<string, number>, extra: ItemStats = {}, rarity: Rarity = 'epic') => {
  const t = TIERS[tier - 1];
  const stats: ItemStats = slot === 'cloak' ? { armor: Math.round(2 + tier), maxStamina: 8 * tier, ...extra } : { ...pieceStats(weight, slot, tier, 1.3), ...extra };
  return add({
    id, name, kind: 'armor', slot, rarity, lvl: t.lvl[0], desc, stats, armor: slot === 'cloak' ? 'cloak' : PIECE[slot],
    look: { weight: slot === 'cloak' ? 'robe' : weight, base: t.col.metal, trim: t.col.trim, cloth: t.col.cloth, strap: t.col.leather, shine: t.col.shine, ...look },
    ...(fx ? { fx } : {}),
  }, [src]);
};
const T = (src: string, id: string, name: string, slot: 'trinket' | 'amulet' | 'ring1', desc: string, stats: ItemStats, fx: Record<string, number> | undefined, art: TrinketSpec, rarity: Rarity = 'epic', lvl = 10) =>
  add({ id, name, kind: 'accessory', slot, rarity, lvl, desc, stats, ...(fx ? { fx } : {}), ...(slot === 'amulet' ? { armor: 'amulet' as const } : {}) }, [src], { k: 'trinket', s: art });

// ---- bosses ------------------------------------------------------------------------------------------
W('kill:grukk', { id: 'grukksCrownSpoon', name: 'Grukk\'s Crown-Spoon', t: 'mace', tier: 3, desc: 'The soup ladle Grukk held like a sceptre, crusted with gold leaf and old stew. It hits like a sceptre too.', s: { stagger: 1.8 }, fx: { crit: 0.06, goldFind: 0.1 } });
T('kill:grukk', 'tithePouch', 'Black-Iron Tithe Pouch', 'trinket', 'The pouch Grukk\'s black-iron tithes went into. Somehow it is never quite empty.', {}, { goldFind: 0.15 }, { kind: 'box', metal: 'blackIron', color: '#2a2a30' });
W('kill:grukk', { id: 'cryptdiggersPick', name: 'Cryptdigger\'s Pick', t: 'club', tier: 3, desc: 'The pick that dug Grukk\'s crypt deeper. It still digs: you can work ore veins with it in your pack.', fx: { oreYield: 0.15 } }).tool = 'pick';
W('boss:ratQueen', { id: 'plaguetoothDagger', name: 'Plaguetooth Dagger', t: 'kris', tier: 3, desc: 'A sickly green bone blade from the Rat Queen\'s throne. Wounds it makes fester.', s: { bleed: 6 }, o: { tint: 0xa8c87a } });
A('boss:ratQueen', 'ratKingCloak', 'Rat-King Cloak', 'cloak', 'robe', 3, { cloth: 0x5a4a3a }, 'A hundred rat tails sewn together into a cloak. It smells exactly as you would think.', { bane_insect: 0.12, dodgeCost: -0.08 });
W('boss:motherOoze', { id: 'acidspitter', name: 'Acidspitter Crossbow', t: 'crossbow', tier: 3, desc: 'A crossbow whose bolts come out wet and green. Hits burn like acid.', s: { burn: 6 } });
T('boss:motherOoze', 'oozeHeartAmulet', 'Ooze-Heart Amulet', 'amulet', 'Mother Ooze\'s core in a little silver cage. It wobbles. It heals.', { maxHp: 40 }, { heal: 0.12, bane_slime: 0.15 }, { kind: 'amulet', metal: 'silver', color: '#8ae05a', glow: '#8ae05a', shape: 'drop' });
namedShield({ id: 'gelatinWard', name: 'Gelatin Ward', tier: 3, desc: 'A shield of Mother Ooze\'s hardened jelly in an iron hoop. Arrows sink into it and melt.', look: { shape: 'round', face: 0x8ae05a, accent: 0x6ab03a, rim: 0x5a5650, device: 'none', metalFace: true, glow: 0x8ae05a }, s: { block: 125, stability: 0.7 }, fx: { blockHeal: 4 }, rarity: 'epic' }, ['boss:motherOoze']);
W('boss:snaggletooth', { id: 'tuskbreaker', name: 'Tuskbreaker Greataxe', t: 'greataxe', tier: 3, desc: 'Snaggletooth\'s broken tusk lashed to an axe head. It splits boar and boar-rider alike.', fx: { bane_beast: 0.15 } });
A('boss:snaggletooth', 'boarRiderChest', 'Boar-Rider\'s Saddle Armour', 'chest', 'leather', 3, { base: 0x5a3a22, trim: 0xe8d8a8 }, 'A goblin war-boar\'s saddle and barding, cut down to fit a person.', { poiseDmg: 0.1 });
W('boss:varga', { id: 'oneEyesGreatbow', name: 'One-Eye\'s Greatbow', t: 'bow', tier: 4, desc: 'Varga One-Eye\'s bow, strung with sinew. It never misses what it wants.', s: { crit: 0.12 }, o: { len: 1.15 } });
A('boss:varga', 'packMotherMantle', 'Pack-Mother Mantle', 'shoulders', 'leather', 4, { base: 0x6a6a70 }, 'A wolf-pelt mantle with the pack-mother\'s grey ruff.', { ward_wolf: 0.15, moveSpeed: 0.03 });
A('boss:greyjaw', 'greyPeltHood', 'Grey Pelt Hood', 'head', 'leather', 3, { base: 0x8a8a90, helm: 'hood' }, 'Old Greyjaw\'s head and pelt, worn as a hood.', { bane_beast: 0.1, crit: 0.03 });
W('boss:greyjaw', { id: 'howlingSpear', name: 'Howling Spear', t: 'spear', tier: 3, desc: 'A spear with a hollow head that howls when it is thrust. Wolves hear it and hesitate.', fx: { ward_wolf: 0.1 } });
A('boss:whiteStag', 'whiteAntlerCirclet', 'White Antler Circlet', 'head', 'robe', 5, { base: 0xf4f4f8, trim: 0xf4f4f8, helm: 'circlet', glow: 0xcfe8ff, glowStrength: 0.3 }, 'A crown of pale antler, shed by the White Stag. In the wilds, spells come easier.', { wildsSpell: 0.2 }, { maxMana: 30 });
W('boss:whiteStag', { id: 'stagheartBow', name: 'Stagheart Bow', t: 'bow', tier: 5, desc: 'A white-wood bow. It glows faintly when there is something to hunt.', o: { glow: 0xcfe8ff, curve: 1 }, s: { crit: 0.08 } });
A('boss:whiteStag', 'feyTouchedBoots', 'Fey-Touched Boots', 'feet', 'leather', 5, { base: 0xe8e0f0, trim: 0xe8a0ff }, 'Soft boots that leave no prints.', { moveSpeed: 0.06, dodgeCost: -0.1 });
W('boss:hollowThane', { id: 'barrowKingSword', name: 'Barrow-King Sword', t: 'sword', tier: 5, desc: 'An ancient bronze leaf-blade from the Hollow Thane\'s barrow. The dead remember it.', o: { tint: 0xb8803a }, fx: { bane_undead: 0.2 } });
A('boss:hollowThane', 'thanesHollowPlate', 'Thane\'s Hollow Plate', 'chest', 'plate', 5, { base: 0x6a6a72, glow: 0x8ad0ff, glowStrength: 0.5 }, 'Plate with nothing inside it, glowing faintly where the Thane was.', { ward_undead: 0.15 });
A('boss:rustKnight', 'rustKnightsVisor', 'Rust Knight\'s Visor', 'head', 'plate', 5, { base: 0x8a4a2a, helm: 'great' }, 'The Rust Knight\'s great helm. It creaks, but it holds.', { ward_undead: 0.1, poiseDmg: 0.08 });
W('boss:rustKnight', { id: 'oxidisedGreatsword', name: 'Oxidised Greatsword', t: 'greatsword', tier: 5, desc: 'Rust has eaten into the edge and made it a saw. Hits bleed.', o: { tint: 0x8a4a2a }, s: { bleed: 8 } });
namedShield({ id: 'tobinsShield', name: 'Tobin\'s Shield', tier: 5, desc: 'The fourth champion\'s own heater, his spur scratched into the paint. It was lost with him in the Rust Knight\'s hall.', look: { shape: 'heater', face: 0x6a2a2a, accent: 0xd8b04a, rim: 0xb08a3a, device: 'chevron' }, s: { block: 145, stability: 0.78, poise: 8 }, fx: { parryStamina: 8 }, rarity: 'epic' }, ['boss:rustKnight']);
A('boss:delver', 'delversClaws', 'Delver\'s Claw-Gauntlets', 'hands', 'plate', 5, { base: 0x5a5048 }, 'Gauntlets with the Delver\'s spade claws for fingers. They dig, and they tear.', { oreYield: 0.25, melee: 0.05 });
T('boss:delver', 'deepEyeLantern', 'Deep-Eye Lantern', 'trinket', 'A lantern with the Delver\'s eye behind the glass. It lights the dark, and you see what is hidden.', {}, { lightRoom: 1, luck: 0.1 }, { kind: 'lantern', metal: 'iron', glow: '#ffe08a' });
W('boss:brineMaw', { id: 'brineMawsJaw', name: 'Brine-Maw\'s Jaw Mace', t: 'star', tier: 4, desc: 'A mace made from a piece of Brine-Maw\'s jaw, still with its teeth.', fx: { bane_sea: 0.15 }, s: { bleed: 4 } });
A('boss:brineMaw', 'saltcrustPauldrons', 'Saltcrust Pauldrons', 'shoulders', 'plate', 4, { base: 0xd8d0c0 }, 'Pauldrons grown over with a crust of salt and barnacles.', { seaDmg: 0.1 });
T('boss:brineMaw', 'brinePearlRing', 'Brine Pearl Ring', 'ring1', 'A grey pearl from Brine-Maw\'s gut on a silver band.', { maxHp: 30 }, { heal: 0.08 }, { kind: 'ring', metal: 'silver', color: '#a8a8a0' });
W('boss:hangedLord', { id: 'gallowsRope', name: 'Gallows Rope', t: 'flail', tier: 4, desc: 'Red Corwen\'s noose, weighted at the end. It wraps round a guard and pulls.', s: { crit: 0.08 } });
A('boss:hangedLord', 'corwensRedCoat', 'Corwen\'s Red Coat', 'chest', 'leather', 4, { base: 0x9a1a1a, trim: 0xd8b04a }, 'The Hanged Lord\'s red coat, still with the rope-burn at the collar.', { critGold: 2, crit: 0.04 });
A('boss:circleWraith', 'shroudWrongCircle', 'Shroud of the Wrong Circle', 'cloak', 'robe', 6, { cloth: 0x2a2a3a, glow: 0x7a3aff, glowStrength: 0.2 }, 'The Wraith\'s shroud. It moves when you do not.', { ward_gloam: 0.15, dodgeCost: -0.1 });
T('boss:circleWraith', 'wrongTurningRing', 'Wrong-Turning Ring', 'ring1', 'A ring that is never quite where you left it.', {}, { wheelHeal: 1, wheelSurge: 0.25 }, { kind: 'ring', metal: 'blackIron', color: '#7a3aff', glow: '#7a3aff' });
W('boss:circleWraith', { id: 'circleBreakerStaff', name: 'Circle-Breaker Staff', t: 'staff', tier: 6, desc: 'The staff that broke the wrong circle. The rings carved on it do not close.', o: { glow: 0x7a3aff }, fx: { spell: 0.12, bane_gloam: 0.15 } });
T('kill:ulgra', 'lastChieftainsSkull', 'Skull of the Last Chieftain', 'trinket', 'A boar-tusked skull on a cord: the last chieftain before Ulgra.', {}, { rage: 0.15, ward_beast: 0.05 }, { kind: 'charm', metal: 'bone', color: '#e8dcc0', hang: 'bone' });
W('kill:ulgra', { id: 'exilesTwoAxes', name: 'Exile\'s Two Axes', t: 'beardedAxe', tier: 4, desc: 'A matched pair of throwing axes, carried as one. Ulgra had them from the exile.', s: { speed: 1.15 }, fx: { attackSpeed: 0.06 } });
A('kill:ulgra', 'ulgrasBoneMail', 'Ulgra\'s Bone Mail', 'chest', 'mail', 4, { base: 0xe8dcc0, cloth: 0x4a2a1a }, 'Mail of bone plates laced on thongs.', { lowHp: 0.12, poiseDmg: 0.08 });

// ---- lair beasts ---------------------------------------------------------------------------------
A('lair:greymane', 'wolfMotherPelt', 'Wolf-Mother Pelt', 'cloak', 'robe', 4, { cloth: 0x8a8a90 }, 'Greymane\'s pelt, worn as a cloak. Wolves give you room.', { ward_wolf: 0.2 });
T('lair:greymane', 'greymanesCollar', 'Greymane\'s Collar', 'amulet', 'The spiked collar some fool once put on the Wolf-Mother.', { maxHp: 30, maxStamina: 20 }, { bane_beast: 0.1 }, { kind: 'amulet', metal: 'iron', color: '#8a8a90' });
A('lair:thornhorn', 'thornhornCrown', 'Thornhorn Crown', 'head', 'leather', 5, { base: 0x5a4a32, helm: 'horned' }, 'The Antlered King\'s crown of thorny antler.', { thorns: 12, bane_beast: 0.08 });
W('lair:thornhorn', { id: 'briarAntlerSpear', name: 'Briar-Antler Spear', t: 'spear', tier: 5, desc: 'An antler tine for a head, briar for a shaft. Hits bleed.', s: { bleed: 6 }, o: { wood: 'gloamwood' } });
A('lair:bristleback', 'bristlebackJerkin', 'Bristleback Hide Jerkin', 'chest', 'leather', 3, { base: 0x4a3a2a }, 'Old Bristleback\'s hide, bristles and all.', { thorns: 6, dmgTaken: -0.04 });
W('lair:bristleback', { id: 'bristleBrushMace', name: 'Bristle Brush Mace', t: 'star', tier: 3, desc: 'A mace head studded with Bristleback\'s bristles, stiff as nails.', s: { bleed: 4 } });

// ---- sea monsters --------------------------------------------------------------------------------
W('beast:kraken', { id: 'krakenInkBlade', name: 'Kraken-Ink Blade', t: 'cutlass', tier: 6, desc: 'A blade quenched in kraken ink. It blackens what it cuts.', o: { tint: 0x1a1a2a, glow: 0x3a3a8a }, fx: { bane_sea: 0.15, crit: 0.05 } });
W('beast:kraken', { id: 'tentacleWhip', name: 'Tentacle Whip', t: 'flail', tier: 6, desc: 'A length of kraken tentacle, suckers and all, on a handle.', s: { stagger: 1.7 } });
A('beast:crab', 'colossusClawGauntlet', 'Colossus Claw Gauntlet', 'hands', 'plate', 6, { base: 0xc03a2a }, 'A gauntlet made from a Crab Colossus claw.', { poiseDmg: 0.15 });
namedShield({ id: 'chitinTowerShield', name: 'Chitin Tower Shield', tier: 6, desc: 'A plate of the Crab Colossus\'s shell, as big as a door.', look: { shape: 'shell', face: 0xc03a2a, accent: 0xe8a07a, rim: 0x8a2a1a, device: 'wave', metalFace: true }, s: { block: 165, stability: 0.88, poise: 12 }, rarity: 'epic' }, ['beast:crab']);
T('beast:sirens', 'sirensPearlNecklace', 'Siren\'s Pearl Necklace', 'amulet', 'Pearls from the Siren Choir. Foes falter at their song: they hit you less hard.', { maxMana: 40 }, { dmgTaken: -0.06, bane_sea: 0.1 }, { kind: 'amulet', metal: 'silver', color: '#f0e8ff', glow: '#e0d0ff', shape: 'drop' });
W('beast:sirens', { id: 'choirHarpBow', name: 'Choir Harp-Bow', t: 'bow', tier: 6, desc: 'A bow strung like a harp. It sings when it shoots.', o: { curve: 1 }, s: { crit: 0.08 }, fx: { castSpeed: 0.05 } });
A('beast:wyrm', 'stormscaleMail', 'Stormscale Mail', 'chest', 'mail', 7, { base: 0x5a7a9a, glow: 0xbfe8ff, glowStrength: 0.3 }, 'Mail of Storm Wyrm scales. Blocked blows crackle back at whoever struck them.', { thorns: 20, windDmg: 0.1 });
A('beast:wyrm', 'wyrmCrestHelm', 'Wyrm Crest Helm', 'head', 'plate', 7, { base: 0x5a7a9a, helm: 'crested', crest: 0xbfe8ff, glow: 0xbfe8ff, glowStrength: 0.3 }, 'A helm crowned with the Storm Wyrm\'s crest.', { rainDmg: 0.2 });
W('beast:oldTeeth', { id: 'oldTeethJawbone', name: 'Old Teeth Jawbone Axe', t: 'greataxe', tier: 6, desc: 'Old Teeth\'s jawbone, teeth and all, set on a haft.', s: { bleed: 8 } });
A('beast:oldTeeth', 'barnaclePlateGreaves', 'Barnacle Plate Greaves', 'legs', 'plate', 6, { base: 0x6a7a7a }, 'Greaves crusted with Old Teeth\'s barnacles.', { thorns: 8, seaDmg: 0.08 });
T('beast:leviathan', 'leviathanHeart', 'Leviathan Heart', 'trinket', 'The Leviathan\'s heart, still beating slowly in a glass. You breathe underwater and are harder to kill.', { maxHp: 50, waterBreathing: 600 }, undefined, { kind: 'heart', metal: 'silver', color: '#2a4a8a', glow: '#8ad0ff' });
A('beast:leviathan', 'leviathanScaleCloak', 'Leviathan Scale Cloak', 'cloak', 'robe', 7, { cloth: 0x2a4a6a, glow: 0x8ad0ff, glowStrength: 0.2 }, 'A cloak of Leviathan scales sewn on sea-silk.', { dmgTaken: -0.06, seaDmg: 0.1 });

// ---- the desert -------------------------------------------------------------------------------
A('kill:sandGolem', 'golemCoreFist', 'Golem-Core Fist', 'hands', 'plate', 5, { base: 0xc8a050, glow: 0xffc040, glowStrength: 0.3 }, 'Gauntlets built round a sand golem\'s core.', { poiseDmg: 0.15, bane_construct: 0.15 });
W('kill:sandGolem', { id: 'sandstoneWarhammer', name: 'Sandstone Warhammer', t: 'maul', tier: 5, desc: 'A block of the Sand Golem on a brass haft.', s: { stagger: 2.5 } });
A('done:queens', 'sunCrownedCirclet', 'Sun-Crowned Circlet', 'head', 'robe', 5, { base: 0xd8a84a, trim: 0xd8a84a, helm: 'circlet', glow: 0xffc040, glowStrength: 0.3 }, 'Queen Neferah\'s gift: a gold circlet with a sun-disc at the brow.', { fireDmg: 0.1, desertWard: 0.1 }, { maxMana: 30 });
W('done:queens', { id: 'sceptreOfTheSun', name: 'Sceptre of the Sun', t: 'mace', tier: 6, desc: 'A gold sceptre topped with a sun-disc. In the Queen\'s hand it was a symbol; in yours, a mace.', o: { metal: 'sunbrass', glow: 0xffc040 }, s: { burn: 8 } });
T('done:cistern-rats', 'sunstoneChalice', 'Sunstone Chalice', 'trinket', 'A chalice cut from one sunstone, from the bottom of the Great Well. Water drunk from it heals.', {}, { potionPower: 0.15, heal: 0.06 }, { kind: 'box', metal: 'gold', color: '#ffb040', glow: '#ffb040' });
W('done:os-4', { id: 'boneWellBlade', name: 'Bone-Well Blade', t: 'khopesh', tier: 6, desc: 'A blade from the Outcast Sands\' bone well, given for the choice you made there.', o: { tint: 0xe8dcc0 }, fx: { lowHp: 0.15 } });
namedShield({ id: 'waterbearersYoke', name: 'Waterbearer\'s Yoke', tier: 6, desc: 'A water-carrier\'s yoke, iron-shod into a shield. Ishara\'s people carried life across the sand on it.', look: { shape: 'heater', face: 0x8a6a44, accent: 0x2aa8a0, rim: 0xd8a84a, device: 'wave' }, s: { block: 140, stability: 0.8 }, fx: { desertWard: 0.1, oocRegen: 3 }, rarity: 'epic' }, ['done:os-4']);
T('done:scrap-for-rusk', 'gearheartAmulet', 'Old Rusk\'s Gearheart Amulet', 'amulet', 'A brass gear-heart that ticks. Old Rusk built it for his daughter.', { maxStamina: 30 }, { scrapFind: 0.3, attackSpeed: 0.03 }, { kind: 'amulet', metal: 'brass', color: '#c8a050' });
W('done:furnace-scrap', { id: 'solderingIron', name: 'Mother Solder\'s Soldering Iron', t: 'stiletto', tier: 5, desc: 'A soldering iron with a point on it, kept red-hot by something in the handle.', s: { burn: 10 }, o: { glow: 0xff6a2a } });

// ---- champions and the story -----------------------------------------------------------------
W('done:mq-wheelbreaker', { id: 'wheelbreaker', name: 'Wheelbreaker', t: 'greatsword', tier: 6, desc: 'Ser Malric Dane\'s greatsword, after the duel. The Sunwheel on its pommel is cracked across.', o: { metal: 'duskiron' }, fx: { poiseDmg: 0.15, bane_gloam: 0.1 } });
T('done:malric', 'malricsGorget', 'Malric\'s Black-Iron Gorget', 'amulet', 'Malric\'s gorget, black iron, dented where a sword nearly found his throat.', { maxHp: 50 }, { dmgTaken: -0.06 }, { kind: 'amulet', metal: 'blackIron', color: '#2a2a30' });
W('done:hesk', { id: 'hesksBlackKnife', name: 'Hesk\'s Black Knife', t: 'stiletto', tier: 6, desc: 'The real one: cold, silent, and poisoned. A kill with it hides you.', o: { tint: 0x0a0a0e }, s: { bleed: 6 }, fx: { backstab: 0.3, killVeil: 2 } });
T('done:varro', 'varrosEmberSignet', 'Varro\'s Ember Signet', 'ring1', 'Legate Cassius Varro\'s signet, given because you shielded the King.', {}, { fireDmg: 0.15, fireResist: 0.15 }, { kind: 'ring', metal: 'gold', color: '#ff6a2a', glow: '#ff6a2a' });
T('done:elin', 'elinsJournalCharm', 'Elin\'s Journal-Charm', 'trinket', 'A page of Elin\'s journal, folded into a charm. It remembers the way.', {}, { xpGain: 0.1, moveSpeed: 0.03 }, { kind: 'flag', color: '#efe0b8', accent: '#6a4a2a', glyph: 'book' });
W('done:oswald', { id: 'oswaldsGoldenSpoke', name: 'Oswald\'s Golden Spoke', t: 'staff', tier: 6, desc: 'One of the Sunwheel\'s five spokes, which Oswald carried as a staff.', o: { metal: 'sunbrass', glow: 0xffe08a }, fx: { holyDmg: 0.15, spell: 0.08 } });
T('done:tobin', 'tobinsBrokenSpur', 'Tobin\'s Broken Spur', 'trinket', 'The fourth champion\'s spur, broken at the rowel.', {}, { sprintHit: 0.2, moveSpeed: 0.04 }, { kind: 'charm', metal: 'silver', color: '#c4ccd6', hang: 'wheel' });
W('done:mq-four', { id: 'fifthsSunwheelBlade', name: 'The Fifth\'s Sunwheel Blade', t: 'longsword', tier: 7, desc: 'Forged from all five spokes at the end of the third act. The fuller is a line of morning light.', o: { tint: 0xfff0c0, glow: 0xffe08a, glowStrength: 2.4 }, fx: { holyDmg: 0.2, bane_gloam: 0.2 } }, 'legendary');
T('done:mq-bells', 'bellOfTheGlen', 'Bell of the Glen', 'trinket', 'A little bronze bell from the chapel tower. The Glen remembers you.', {}, { allyCall: 1 }, { kind: 'lantern', metal: 'bronze', glow: '#ffe08a' });
T('done:mq-feast', 'aldricsSignet', 'King Aldric\'s Signet', 'ring1', 'The King\'s own signet, given in thanks.', { maxHp: 40 }, { shopDiscount: 0.1 }, { kind: 'ring', metal: 'gold', color: '#2a4a8a', glyph: 'crown' });
T('done:mq-feast', 'elinorsLocket', 'Queen Elinor\'s Locket', 'amulet', 'A locket with a portrait of a girl who became a queen.', { maxMana: 40 }, { heal: 0.1 }, { kind: 'amulet', metal: 'gold', color: '#e8b0c0', shape: 'heart' });
T('done:mq-ledger', 'vaunsLedgerKey', 'Vaun\'s Ledger-Key', 'trinket', 'The key to the ledger, given by a man you let live.', {}, { goldFind: 0.2, shopDiscount: 0.05 }, { kind: 'key', metal: 'brass' });
W('done:mq-ledger', { id: 'executionersSword', name: 'Executioner\'s Sword', t: 'greatsword', tier: 5, desc: 'A broad, square-ended sword for one purpose.', fx: { crit: 0.08, poiseDmg: 0.1 } });
W('done:mq-dorian', { id: 'clawSwornDagger', name: 'Dorian\'s Claw-Sworn Dagger', t: 'rondel', tier: 4, desc: 'The dagger Dorian swore on.', fx: { backstab: 0.15, crit: 0.04 } });
T('done:academy-lessons', 'mellsBookmark', 'Mell\'s Index Bookmark', 'trinket', 'A ribbon bookmark from the Academy library, with Mell\'s notes in the margin.', {}, { xpGain: 0.08, masteryGain: 0.05 }, { kind: 'ribbon', color: '#6a2a2a', accent: '#e8c060' });
A('done:mq-stranger', 'maudsShawl', 'Maud\'s Shawl', 'cloak', 'robe', 1, { cloth: 0x8a5a7a }, 'Maud\'s knitted shawl. She put it round your shoulders the first night.', { oocRegen: 2 });
A('done:night-watch', 'brannocsOldHelm', 'Brannoc\'s Old Helm', 'head', 'mail', 2, { helm: 'coif' }, 'Brannoc\'s helm from the old wars, dented but sound.', { parryStamina: 6 });
W('done:mq-crypt', { id: 'kaelasFirstBlade', name: 'Kaela\'s First Blade', t: 'sword', tier: 2, desc: 'The sword Kaela learned with, too short for her now.', fx: { attackSpeed: 0.04 } });

// ---- wild sites ----------------------------------------------------------------------------------
W('site:fallenStar', { id: 'starFallenHammer', name: 'Star-Fallen Hammer', t: 'hammer', tier: 7, desc: 'A hammer whose head is the star itself.', o: { metal: 'starmetal', glow: 0x9ab8ff } });
T('site:fallenStar', 'shardOfTheSky', 'Shard of the Sky', 'trinket', 'A sliver of the fallen star, cold and bright.', { maxMana: 30 }, { spell: 0.1 }, { kind: 'crystal', color: '#9ab8ff', glow: '#9ab8ff' });
namedShield({ id: 'drownedBellShield', name: 'Drowned Bell', tier: 6, desc: 'The bell of the drowned tower, turned upside down and strapped to an arm. It rings when it is struck.', look: { shape: 'round', face: 0x6a8a7a, accent: 0x5a7a6a, rim: 0x3a5a4a, device: 'none', metalFace: true }, s: { block: 150, stability: 0.84, poise: 10 }, fx: { thorns: 10 }, rarity: 'epic' }, ['site:drownedTower']);
T('site:drownedTower', 'tideglassSpyglass', 'Tideglass Spyglass', 'trinket', 'A spyglass with tideglass lenses. Through it you see further, and the sea\'s creatures do not see you first.', {}, { seaDmg: 0.1, crit: 0.03 }, { kind: 'rod', color: '#5ac8c0' });
T('site:hangingTree', 'nooseCharm', 'Hanged Man\'s Noose-Charm', 'trinket', 'A knot of the hanging tree\'s rope. Death passes you by, a little.', { maxHp: 25 }, { lowHp: 0.1 }, { kind: 'knot', color: '#8a6a44' });
W('site:darkScar', { id: 'scarredEdge', name: 'Scarred Edge', t: 'longsword', tier: 6, desc: 'A sword from a Dark scar. In the Dark\'s places it grows stronger.', o: { tint: 0x2a2232, glow: 0x7a3aff }, fx: { darkDmg: 0.25 } });
A('site:fairyRing', 'feyCrownOfMushrooms', 'Fey Crown of Mushrooms', 'head', 'robe', 4, { base: 0xc85a4a, helm: 'circlet', trim: 0xe8c0ff }, 'A ring of tiny red mushrooms that grew around your head while you slept in the ring.', { luck: 0.12, heal: 0.06 }, { maxMana: 20 });
T('site:championCamp', 'lostChampionsBanner', 'Lost Champion\'s Banner', 'trinket', 'The banner of a champion who never came back. Fighting under it, you hit harder in a crowd.', {}, { crowdDmg: 0.12, dmgTaken: -0.03 }, { kind: 'flag', color: '#2a4a8a', accent: '#e8c060', glyph: 'shield' });
W('site:vault', { id: 'vaultkeepersKeySword', name: 'Vaultkeeper\'s Key-Sword', t: 'estoc', tier: 5, desc: 'A sword whose hilt is a key. It opened the vault; now it opens guards.', s: { crit: 0.08 } });
W('site:well', { id: 'wishingBlade', name: 'Wishing Blade', t: 'sword', tier: 4, desc: 'A sword fished out of a haunted well. Someone wished on it.', fx: { luck: 0.1, crit: 0.04 } });
T('site:hermit', 'wendelsLantern', 'Wendel\'s Lantern', 'trinket', 'The hermit\'s lantern: its wardlight keeps the dead back.', {}, { lightRoom: 1, ward_undead: 0.1 }, { kind: 'lantern', metal: 'brass', glow: '#ffe08a' });
T('site:hives', 'queenBeeAmulet', 'Queen Bee Amulet', 'amulet', 'A queen bee in amber on a gold chain.', { maxHp: 30 }, { heal: 0.08, potionPower: 0.08 }, { kind: 'amulet', metal: 'gold', color: '#e0902a' });
W('site:charcoal', { id: 'everEmberAxe', name: 'Ever-Ember Axe', t: 'axe', tier: 4, desc: 'A charcoal-burner\'s axe that never cooled.', s: { burn: 8 }, o: { glow: 0xff6a2a } });
namedShield({ id: 'statuePieceShield', name: 'Statue-Piece Shield', tier: 5, desc: 'A stone shield broken off the fallen statue. It is very heavy and very hard.', look: { shape: 'kite', face: 0xa8a8a0, accent: 0x8a8a84, rim: 0x6a6a64, device: 'none', metalFace: true }, s: { block: 160, stability: 0.9, poise: 14 }, rarity: 'epic' }, ['site:statue']);
T('site:wrongCircle', 'circleStone', 'The Circle Stone', 'trinket', 'A small stone from the wrong circle. It is warm on one side and cold on the other.', { maxMana: 25 }, { ward_gloam: 0.12, spell: 0.06 }, { kind: 'orb', color: '#5a4a6a', glow: '#7a3aff' });
W('site:graves', { id: 'gravediggersSpade', name: 'Gravedigger\'s Spade', t: 'club', tier: 4, desc: 'A spade with a sharpened edge. The dead do not like it.', fx: { bane_undead: 0.15 } });
T('site:sinkhole', 'fallenLantern', 'Fallen Lantern of the Mine', 'trinket', 'A miner\'s lantern from the bottom of the sinkhole. It still lights.', {}, { lightRoom: 1, oreYield: 0.15 }, { kind: 'lantern', metal: 'iron', glow: '#ffd060' });
W('site:lookout', { id: 'watchersBow', name: 'Watcher\'s Bow', t: 'bow', tier: 4, desc: 'The lookout\'s bow, made for long shots from high places.', o: { len: 1.15 }, s: { crit: 0.1 } });

// ---- Grandmaster items (mastery rank 10, from each teacher) ---------------------------------------
A('master:gale', 'kaelasGaleCrown', 'Kaela\'s Gale Crown', 'head', 'leather', 7, { base: 0xcfe8ff, helm: 'circlet', glow: 0x9ad0ff, glowStrength: 0.4 }, 'Kaela gives it to the student who has outrun her. Grandmaster of Gale Style.', { attackSpeed: 0.08, windDmg: 0.15, dodgeCost: -0.12 }, {}, 'legendary');
W('master:cross', { id: 'ilsesTwinFangs', name: 'Ilse\'s Twin Fangs of Tempo', t: 'sabre', tier: 7, desc: 'Ilse\'s own pair, at last. Grandmaster of Cross Style.', s: { speed: 1.3 }, fx: { crit: 0.08, parryWindow: 0.12 } }, 'legendary');
T('master:boundary', 'corvinsBoundaryRing', 'Corvin\'s Boundary Ring', 'ring1', 'Ser Corvin\'s ring, a closed circle of silversteel. Grandmaster of Boundary Style.', { maxHp: 60 }, { blockCost: -0.25, dmgTaken: -0.08 }, { kind: 'ring', metal: 'silver', color: '#c0c8ff', glow: '#c0c8ff' }, 'legendary', 30);
W('master:pyromancer', { id: 'orrensSunfireStaff', name: 'Orren\'s Sunfire Staff', t: 'staff', tier: 7, desc: 'Magus Orren\'s staff, the sun burning in its head. Grandmaster Pyromancer.', o: { glow: 0xff9a3a }, fx: { fireDmg: 0.3, spell: 0.1 } }, 'legendary');
T('master:lightbinder', 'aldousDawnCenser', 'Aldous\'s Dawn Censer', 'trinket', 'Brother Aldous\'s censer: the smoke smells of morning. Grandmaster Lightbinder.', { maxMana: 50 }, { holyDmg: 0.25, heal: 0.15 }, { kind: 'lantern', metal: 'gold', glow: '#fff0a0' }, 'legendary', 30);
T('master:herbalism', 'wennasFlask', 'Wenna\'s Philosopher\'s Flask', 'trinket', 'A flask that is never quite empty: every draught you drink is stronger. Grandmaster of Herbalism.', {}, { potionPower: 0.35, heal: 0.1 }, { kind: 'heart', metal: 'gold', color: '#8ae05a', glow: '#8ae05a' }, 'legendary', 30);
W('master:smithing', { id: 'froestsHammer', name: 'Fröst\'s Masterwork Hammer', t: 'hammer', tier: 7, desc: 'Master Fröst\'s own hammer. A weapon, and a smith\'s best tool: your gathering and work go further. Grandmaster of Smithing.', fx: { oreYield: 0.3, masteryGain: 0.1 } }, 'legendary');
T('master:cooking', 'marasEverfullPot', 'Mara\'s Everfull Pot', 'trinket', 'Mara Bell\'s little copper pot. Everything you eat does you more good. Grandmaster of Cooking.', { maxHp: 40 }, { potionPower: 0.2, oocRegen: 4 }, { kind: 'box', metal: 'copper', color: '#c8743a' }, 'legendary', 30);
add({ id: 'velasBag', name: 'Vela\'s Bag of Holding', kind: 'accessory', slot: 'belt', rarity: 'legendary', lvl: 30, desc: 'Vela Thread\'s own satchel: more fits in it than should. Grandmaster of Tailoring.', stats: { maxStamina: 60, staminaRegen: 0.3 }, fx: { potionPower: 0.15, beastLoot: 0.25 }, armor: 'belt' }, ['master:tailoring'], { k: 'trinket', s: { kind: 'belt', metal: 'gold', color: '#8a5a32' } });
T('master:runecraft', 'runemastersChisel', 'The Runemaster\'s Chisel', 'trinket', 'A chisel that has cut the First Word. Grandmaster of Runecraft.', { maxMana: 40 }, { spell: 0.12, duration: 0.15 }, { kind: 'rod', color: '#c0c8ff', glow: '#c0c8ff' }, 'legendary', 30);
T('master:jewelcrafting', 'brunisLoupe', 'Bruni\'s Starstone Loupe', 'trinket', 'Bruni\'s loupe, its lens a starstone. You see every glint. Grandmaster of Jewelcrafting.', {}, { luck: 0.2, goldFind: 0.2, oreYield: 0.2 }, { kind: 'orb', color: '#9ab8ff', glow: '#9ab8ff' }, 'legendary', 30);
W('master:prospecting', { id: 'bramsWoodsmanAxe', name: 'Bram\'s Woodsman Axe', t: 'beardedAxe', tier: 7, desc: 'Bram Oakhand\'s axe, worn smooth at the grip. Grandmaster of Prospecting.', fx: { oreYield: 0.3, beastLoot: 0.25 } }, 'legendary');

// ---- recipe books ------------------------------------------------------------------------------
const book = (id: string, name: string, desc: string, art: PaperSpec, src: string[], rarity: Rarity = 'rare') =>
  add({ id, name, kind: 'consumable', rarity, desc, stats: {} }, src, { k: 'paper', s: art });
book('bookDwarvenForge', 'The Dwarven Forge-Book', 'Read it to learn the deepsteel, ironwood, deephide and deepwool recipes (tier 4).', { kind: 'book', color: '#3a4a5a', glyph: 'hammer', accent: '#d0a040' }, ['fshop:dwarven', 'quest:dwarven', 'chest:4']);
book('bookSunbrass', 'The Sunspire Pattern-Book', 'Read it to learn the sunbrass, sunpalm, sandwyrm and sun-silk recipes (tier 5).', { kind: 'book', color: '#c89030', glyph: 'sun', accent: '#2aa8a0' }, ['fshop:desert', 'quest:desert', 'chest:5']);
book('bookTideglass', 'The Shipwright\'s Glassbook', 'Read it to learn the tideglass, driftwood, sharkskin and sea-silk recipes (tier 6).', { kind: 'book', color: '#1a7a8a', glyph: 'anchor', accent: '#f0eee0', worn: true }, ['fshop:wrecker', 'quest:wrecker', 'chest:6']);
book('bookStarfall', 'The Starfall Script', 'Read it to learn to work star-metal: starmetal, starwood, starhide and moonweave (tier 7). It is never sold.', { kind: 'tablet', color: '#22224a', glyph: 'star', glow: '#9ab8ff' }, ['site:fallenStar', 'chest:7'], 'epic');
book('bookIronBelow', 'The Codex of the Iron Below', 'Read it to learn to work dusk-iron: duskiron, gloamwood, gloamhide and gloamweave (tier 8). It is never sold.', { kind: 'book', color: '#1e1428', glyph: 'skull', accent: '#7a3aff', glow: '#7a3aff' }, ['site:darkScar', 'chest:8'], 'epic');
for (const [setId, id] of Object.entries(SET_BOOKS)) {
  const s = SET[setId];
  book(id, `${s.name} Patterns`, `Read it to learn to make the ${s.name} set yourself.`, { kind: 'ledger', color: '#5a4a3a', glyph: 'shield' }, [`fshop:${s.faction}`, `quest:${s.faction}`]);
}
