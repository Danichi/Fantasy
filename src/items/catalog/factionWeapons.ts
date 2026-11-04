import { named, namedShield, type Named } from './templates';
import { FACTIONS } from './factions';

// Faction and regional weapons (the item plan, §2b): 113 named weapons and
// six faction shields. Each faction's gear is sold by its quartermasters and
// the shops of its home regions, given for its quests, and carried by the foes
// that belong to it (factions.ts).

type W = Omit<Named, 'id'> & { id: string };
const F = (faction: string, list: W[]) => {
  const f = FACTIONS[faction];
  for (const w of list) {
    const src = [`fshop:${faction}`];
    if (f.quest || f.deed) src.push(`quest:${faction}`);
    for (const d of f.drop ?? []) src.push(`drop:${d}:${w.tier}`);
    named(w, src);
  }
};

F('glenWatch', [
  { id: 'watchSpear', name: 'Watch Spear', t: 'spear', tier: 2, desc: 'An ash shaft with a blue pennant under the head: the Glen Watch on the wall.', s: { stagger: 1.1 }, fx: { parryStamina: 4 } },
  { id: 'watchmansFalchion', name: 'Watchman\'s Falchion', t: 'falchion', tier: 2, desc: 'A broad, slightly curved chopper. The Watch never had money for swords that did one thing.' },
  { id: 'lanternMace', name: 'Lantern Mace', t: 'mace', tier: 2, desc: 'Its head is an iron lantern cage. On the long nights of the bells, there was a candle in it.', fx: { lightRoom: 1, bane_undead: 0.08 } },
  { id: 'glenBillhook', name: 'Glen Billhook', t: 'glaive', tier: 1, desc: 'A hedging tool sharpened into a weapon. Half the Watch carried one the first winter.', s: { bleed: 2 } },
  { id: 'bellringersMaul', name: 'Bellringer\'s Maul', t: 'hammer', tier: 2, desc: 'The mallet that rang the chapel bell on the Night of Bells, iron-bound for the wall afterwards.', fx: { poiseDmg: 0.1 } },
  { id: 'wallCrossbow', name: 'Wall Crossbow', t: 'crossbow', tier: 2, desc: 'Squat, with a brass crank. Made to be fired over a palisade at things that should not be there.', o: { len: 1.1 } },
]);
F('glenWarden', [
  { id: 'wardensHatchet', name: 'Warden\'s Hatchet', t: 'axe', tier: 2, desc: 'A notch in the haft for every beast it has put down. There are a lot of notches.', fx: { bane_beast: 0.1 } },
  { id: 'rooksPike', name: 'Rook\'s Pike', t: 'spear', tier: 3, desc: 'A boar pike with a crossbar, made to Rook\'s measure.', o: { len: 1.1 }, fx: { bane_beast: 0.1 } },
  { id: 'lyssasRecurve', name: 'Lyssa\'s Recurve', t: 'bow', tier: 3, desc: 'Green-dyed limbs and a stag-horn grip.', o: { curve: 1 }, s: { crit: 0.06 } },
  { id: 'garricksHammer', name: 'Garrick\'s Hammer', t: 'hammer', tier: 3, desc: 'Garrick swears it was a smith\'s hammer once. It has not been a smith\'s hammer for a long time.' },
  { id: 'wardenHuntingKnife', name: 'Warden Hunting Knife', t: 'dagger', tier: 2, desc: 'A skinning knife with a sharp back. Wardens skin what they kill.', fx: { beastLoot: 0.15 } },
]);
F('academy', [
  { id: 'galeSabre', name: 'Gale Sabre', t: 'sabre', tier: 3, desc: 'A thin sabre whose fuller whistles. Gale Style students learn to hear where the blade is.', s: { speed: 1.22 }, fx: { attackSpeed: 0.04 } },
  { id: 'windcutter', name: 'Windcutter', t: 'katana', tier: 4, desc: 'A single-edged blade of cloud-pattern steel, from the far west by way of the Academy\'s vault.', s: { crit: 0.04 } },
  { id: 'cadetsWindBlade', name: 'Cadet\'s Wind Blade', t: 'sword', tier: 2, desc: 'A light practice sword with a real edge. Cadets carry them in their second year.' },
  { id: 'crossTwinBlades', name: 'Cross Twin Blades', t: 'shortsword', tier: 3, desc: 'A paired set in one scabbard: the Cross Style\'s first lesson is that one hand lies.', s: { speed: 1.35 }, fx: { crit: 0.03 } },
  { id: 'tempoDirk', name: 'Tempo Dirk', t: 'dagger', tier: 3, desc: 'A long parrying dirk. In the Cross ring it keeps time.', fx: { parryWindow: 0.08 } },
  { id: 'ilsesWaltzSword', name: 'Ilse\'s Waltz Sword', t: 'rapier', tier: 4, desc: 'One of a pair Ilse danced with at the Wayfarer\'s Rest. She lent this one out, and it never went back.' },
  { id: 'boundaryLongsword', name: 'Boundary Longsword', t: 'longsword', tier: 3, desc: 'A ring-shaped guard: the Boundary Style draws its circle with it.', fx: { blockCost: -0.1 } },
  { id: 'stillpointEstoc', name: 'Stillpoint Estoc', t: 'estoc', tier: 4, desc: 'A thrusting blade for the student who has learned not to move.' },
  { id: 'corvinsTrainingBlade', name: 'Corvin\'s Training Blade', t: 'longsword', tier: 2, desc: 'Blunted once, sharpened again by someone who meant it. Ser Corvin\'s name is scratched on the tang.', fx: { masteryGain: 0.05 } },
]);
F('crown', [
  { id: 'crownGuardHalberd', name: 'Crown Guard Halberd', t: 'partisan', tier: 3, desc: 'The palace guard\'s halberd, the crown stamped on the langets.', o: { len: 1.08 } },
  { id: 'lancersSword', name: 'Lancer\'s Sword', t: 'longsword', tier: 3, desc: 'A blued blade inlaid with gold: the Silver Lance\'s sidearm.', o: { tint: 0x8aa0c8 } },
  { id: 'silverLance', name: 'Silver Lance', t: 'spear', tier: 4, desc: 'A true lance-spear, long and silver-shod. The order is named for it.', o: { len: 1.2, metal: 'silversteel' }, fx: { sprintHit: 0.2 } },
  { id: 'heraldsMace', name: 'Herald\'s Mace', t: 'mace', tier: 3, desc: 'Gilded, with a crown for a head. Heralds carry it to read proclamations; it has settled arguments too.', o: { metal: 'sunbrass' } },
  { id: 'royalArbalest', name: 'Royal Arbalest', t: 'crossbow', tier: 4, desc: 'A palace arbalest with the royal arms on the stock.', o: { len: 1.1 } },
  { id: 'palaceRapier', name: 'Palace Rapier', t: 'rapier', tier: 3, desc: 'A courtier\'s rapier with a swept hilt. Duels at court are rarely to the death; this one does not know that.' },
  { id: 'marshalsGreatsword', name: 'Marshal\'s Greatsword', t: 'greatsword', tier: 4, desc: 'A white-steel zweihänder, carried before the Marshal on feast days.', o: { len: 1.06 } },
  { id: 'inquisitorsFlail', name: 'Inquisitor\'s Flail', t: 'flail', tier: 4, desc: 'The Temple of the Dawn\'s scourge for the risen dead.', fx: { bane_undead: 0.15 } },
]);
F('dwarven', [
  { id: 'deepdelverMattock', name: 'Deepdelver Mattock', t: 'hammer', tier: 4, desc: 'Half pick, half hammer: a dwarf\'s tool for rock and anything that lives in it.', fx: { oreYield: 0.15 } },
  { id: 'runebreakerAxe', name: 'Runebreaker Axe', t: 'beardedAxe', tier: 4, desc: 'Rune channels cut along the beard glow when it bites.', o: { glow: 0x5a8aff } },
  { id: 'anvilfistHammer', name: 'Anvilfist Hammer', t: 'club', tier: 4, desc: 'A one-handed hammer with a head like a little anvil.', s: { stagger: 1.8 } },
  { id: 'holdCaptainsGreataxe', name: 'Hold-Captain\'s Greataxe', t: 'doubleAxe', tier: 5, desc: 'A double-bit greataxe with braided gold wire on the haft: a hold-captain\'s.' },
  { id: 'stonepiercer', name: 'Stonepiercer Crossbow', t: 'crossbow', tier: 4, desc: 'A deepsteel crossbow whose bolts go through shields.', s: { pierce: 0.2 }, o: { len: 1.1 } },
  { id: 'tunnelShortblade', name: 'Tunnel Shortblade', t: 'shortsword', tier: 4, desc: 'Short enough to swing in a mine. Most dwarven fights are in mines.' },
  { id: 'thrainsAxe', name: 'Thrain\'s Ceremonial Axe', t: 'axe', tier: 5, desc: 'Gold knotwork over deepsteel. It was made for ceremonies; it was used for other things.', o: { metal: 'sunbrass' } },
  { id: 'lanternPick', name: 'Lantern Pick', t: 'club', tier: 4, desc: 'A miner\'s pick with a lantern hung off the back of the head.', fx: { lightRoom: 1, oreYield: 0.1 } },
]);
F('desert', [
  { id: 'sunGuardKhopesh', name: 'Sun Guard Khopesh', t: 'khopesh', tier: 5, desc: 'The palace Sun Guard\'s hooked blade: it catches shields and opens guards.' },
  { id: 'bazaarScimitar', name: 'Bazaar Scimitar', t: 'scimitar', tier: 5, desc: 'A good blade at a bazaar price, if you haggle.' },
  { id: 'duneSpear', name: 'Dune Spear', t: 'spear', tier: 5, desc: 'A long spear with a tasselled neck, for fighting from a sand-skiff.' },
  { id: 'scarabMace', name: 'Scarab Mace', t: 'mace', tier: 5, desc: 'A brass scarab for a head, enamelled turquoise.', fx: { bane_insect: 0.12 } },
  { id: 'furnaceGlaive', name: 'Furnace Glaive', t: 'glaive', tier: 5, desc: 'Runes along the blade glow red-hot. It is warm to hold even at night.', s: { burn: 6 }, o: { glow: 0xff5a18 } },
  { id: 'throneGuardHalberd', name: 'Throne Guard Halberd', t: 'partisan', tier: 6, desc: 'The halberd of the guard that stands at the throne itself.' },
  { id: 'mirageDagger', name: 'Mirage Dagger', t: 'stiletto', tier: 5, desc: 'It shimmers as if it is only half there.', fx: { backstab: 0.15 } },
  { id: 'sandstriderBow', name: 'Sandstrider Bow', t: 'bow', tier: 5, desc: 'A horn bow wrapped in linen against the grit.', o: { curve: 1, len: 0.9 } },
  { id: 'viziersSunStaff', name: 'Vizier\'s Sun Staff', t: 'staff', tier: 5, desc: 'A sun disc in a ring of brass on top. The vizier had several.', o: { glow: 0xffc040 }, fx: { fireDmg: 0.1 } },
  { id: 'glassCuttersKris', name: 'Glass-Cutter\'s Kris', t: 'kris', tier: 5, desc: 'A wavy blade from the Furnace Street, used to score lightning-glass.' },
  { id: 'caravanGuardAxe', name: 'Caravan Guard Axe', t: 'beardedAxe', tier: 5, desc: 'A guard\'s axe from the salt caravans, notched by raiders.' },
  { id: 'oasisTrident', name: 'Oasis Trident', t: 'partisan', tier: 5, desc: 'A three-pronged spear for oasis eels. It works on larger things.', fx: { bane_sea: 0.1 } },
]);
F('scrap', [
  { id: 'rivetCleaver', name: 'Rivet Cleaver', t: 'falchion', tier: 4, desc: 'A sheet of steel bolted to a pipe. It looks like a joke until it hits you.', o: { tint: 0x8a7a6a } },
  { id: 'gearMace', name: 'Gear Mace', t: 'star', tier: 4, desc: 'A cog for a head, welded to a crank handle.' },
  { id: 'pipeSpear', name: 'Pipe Spear', t: 'spear', tier: 4, desc: 'A length of pipe with a blade hammered into the end.' },
  { id: 'sawbladeAxe', name: 'Sawblade Axe', t: 'axe', tier: 5, desc: 'A sawmill blade cut in half and bolted on. Hits bleed badly.', s: { bleed: 5 } },
  { id: 'chainflail', name: 'Chainflail', t: 'flail', tier: 5, desc: 'A length of anchor chain on a handle.' },
  { id: 'junkCrossbow', name: 'Junk Crossbow', t: 'crossbow', tier: 4, desc: 'A crossbow built from bedframes and wire. It fires whatever you put in it.' },
  { id: 'rebarGreatsword', name: 'Rebar Greatsword', t: 'greatsword', tier: 5, desc: 'Rebar beaten flat and ground to an edge. Heavy enough not to need a good one.', o: { tint: 0x7a6a5a } },
  { id: 'solderKnife', name: 'Solder Knife', t: 'dagger', tier: 4, desc: 'Kept hot on the bench. Some of the heat stays.', s: { burn: 3 } },
  { id: 'boltThrower', name: 'Bolt-Thrower', t: 'crossbow', tier: 5, desc: 'A heavy repeating crossbow with a hopper. Mother Solder\'s own design.', s: { speed: 1.15 }, o: { len: 1.15 } },
  { id: 'tinroofBucklerBlade', name: 'Tinroof Buckler-Blade', t: 'shortsword', tier: 4, desc: 'A short blade with a tin buckler welded over the hand.', fx: { parryWindow: 0.06 } },
]);
F('wrecker', [
  { id: 'cutlass', name: 'Cutlass', t: 'cutlass', tier: 5, desc: 'A sailor\'s cutlass, the guard a basket of brass.' },
  { id: 'boardingAxe', name: 'Boarding Axe', t: 'axe', tier: 5, desc: 'An axe with a spike on the back for climbing a hull.' },
  { id: 'gaffHook', name: 'Gaff Hook', t: 'glaive', tier: 5, desc: 'A fisherman\'s gaff. Wreckers use it to pull men off the rigging.', s: { bleed: 3 } },
  { id: 'lanternFlail', name: 'Wrecker\'s Lantern-Flail', t: 'flail', tier: 6, desc: 'A false-light lantern on a chain, the kind hung on the rocks to bring ships in.', fx: { lightRoom: 1 }, s: { burn: 4 } },
  { id: 'harpoon', name: 'Harpoon', t: 'spear', tier: 6, desc: 'A whaling harpoon with a toggle head.', fx: { bane_sea: 0.15 } },
  { id: 'corsairsSaber', name: 'Corsair\'s Saber', t: 'sabre', tier: 6, desc: 'A red-tasselled saber from a pirate\'s belt.' },
  { id: 'belayingPin', name: 'Belaying-Pin Club', t: 'club', tier: 5, desc: 'An oak belaying pin. Every ship has a hundred of them, and every brawl uses one.', o: { metal: 'iron', wood: 'oak' } },
  { id: 'powderCrossbow', name: 'Powder Pistol-Crossbow', t: 'crossbow', tier: 6, desc: 'A short crossbow that throws its bolt with a pinch of powder. Loud.', s: { stagger: 1.4 } },
  { id: 'captainsHanger', name: 'Captain\'s Hanger', t: 'cutlass', tier: 6, desc: 'A short, heavy officer\'s hanger with a shell guard.' },
  { id: 'sirenLureTrident', name: 'Siren-Lure Trident', t: 'partisan', tier: 7, desc: 'Pearls hang from its tines; they hum when the sea is calm.', fx: { seaDmg: 0.1 } },
]);
F('orc', [
  { id: 'tuskCleaverOrc', name: 'Tusk Cleaver', t: 'falchion', tier: 3, desc: 'A great cleaver with a boar tusk set in the pommel.', s: { bleed: 3 } },
  { id: 'warBoarGoad', name: 'War-Boar Goad Spear', t: 'spear', tier: 3, desc: 'The goad the orcs use to drive their war-boars.', s: { stagger: 1.2 } },
  { id: 'skullsplitterAxe', name: 'Skullsplitter Axe', t: 'greataxe', tier: 4, desc: 'Ulgra\'s camp\'s axe. They name their weapons for what they do.' },
  { id: 'blackIronBludgeon', name: 'Black-Iron Bludgeon', t: 'club', tier: 3, desc: 'Cast from the black iron Grukk took in payment. Heavy and ugly.', o: { metal: 'duskiron' } },
  { id: 'orcHookblade', name: 'Orc Hookblade', t: 'khopesh', tier: 3, desc: 'A hooked blade for pulling shields down.' },
  { id: 'raidersWarbow', name: 'Raider\'s Warbow', t: 'bow', tier: 3, desc: 'A heavy orc bow. Hard to draw; harder to be hit by.', s: { damage: 4 } },
  { id: 'bonecrusherMaul', name: 'Bonecrusher Maul', t: 'maul', tier: 4, desc: 'A stone head on an iron haft.' },
  { id: 'chieftainsGreataxe', name: 'Chieftain\'s Greataxe', t: 'doubleAxe', tier: 4, desc: 'The double axe of a chieftain, notched for every challenger.', fx: { lowHp: 0.1 } },
  { id: 'grukksLadleMace', name: 'Grukk\'s Ladle Mace', t: 'mace', tier: 3, desc: 'A soup ladle the size of a man\'s leg, hammered and weighted. A joke weapon. It is oddly good.', fx: { crit: 0.05 } },
  { id: 'exilesGlaive', name: 'Exile\'s Glaive', t: 'glaive', tier: 4, desc: 'The orc exile\'s glaive, carried out of the band when they left it.' },
]);
F('goblin', [
  { id: 'goblinShiv', name: 'Goblin Shiv', t: 'dagger', tier: 1, desc: 'A nail filed down and wrapped in rag. It is the rust that gets you.', s: { bleed: 2 } },
  { id: 'rustySickle', name: 'Rusty Sickle', t: 'kris', tier: 1, desc: 'Stolen from a field. It still cuts wheat, and other things.' },
  { id: 'bentSpear', name: 'Bent Spear', t: 'spear', tier: 1, desc: 'A spear that was straight once.', o: { len: 0.85 } },
  { id: 'potLidMace', name: 'Pot-Lid Mace', t: 'club', tier: 1, desc: 'A stick with a pot-lid nailed to it. Goblins are inventive.' },
  { id: 'twigBow', name: 'Twig Bow', t: 'bow', tier: 1, desc: 'A goblin bow made of green wood and spite.', o: { len: 0.8 } },
  { id: 'firebombSling', name: 'Goblin Firebomb Sling', t: 'bow', tier: 2, desc: 'A sling the goblins use to throw lit pots. Arrows shot from it come out burning.', s: { burn: 4 }, o: { len: 0.7 } },
  { id: 'scrapHatchet', name: 'Scrap Hatchet', t: 'axe', tier: 1, desc: 'Half a horseshoe on a stick.' },
  { id: 'toadStaff', name: 'Chieftain\'s Toad-Staff', t: 'staff', tier: 2, desc: 'A dried toad on a stick, with glass eyes. The goblin chief cast spells with it. Or thought it did.', o: { glow: 0x8ad04a } },
]);
F('twoCoins', [
  { id: 'footpadsCudgel', name: 'Footpad\'s Cudgel', t: 'club', tier: 2, desc: 'Leather over lead. Made for the back of a head.', fx: { backstab: 0.1 } },
  { id: 'highwaymansSaber', name: 'Highwayman\'s Saber', t: 'sabre', tier: 2, desc: 'A saber for robbing coaches. The guard is engraved with someone else\'s initials.' },
  { id: 'twoCoinDaggers', name: 'Two-Coin Daggers', t: 'dagger', tier: 3, desc: 'A pair, with a coin set in each pommel: the crew\'s mark.', fx: { critGold: 1 } },
  { id: 'ambushersCrossbow', name: 'Ambusher\'s Crossbow', t: 'crossbow', tier: 2, desc: 'Short and quiet, for shooting from a hedge.', s: { crit: 0.08 } },
  { id: 'smugglersHook', name: 'Smuggler\'s Hook', t: 'kris', tier: 3, desc: 'A cargo hook from the Hollow Ridge smugglers, sharpened all the way round.' },
  { id: 'banditCaptainsAxe', name: 'Bandit Captain\'s Axe', t: 'beardedAxe', tier: 3, desc: 'A captain\'s axe: better steel than the rest of the crew ever saw.' },
  { id: 'cutpurseKnife', name: 'Cutpurse Knife', t: 'stiletto', tier: 2, desc: 'A little curved blade for purse strings.', fx: { goldFind: 0.1 } },
  { id: 'tollBreakerMaul', name: 'Toll-Breaker Maul', t: 'hammer', tier: 3, desc: 'Used to knock down toll gates on the King\'s Road. And toll keepers.' },
]);
F('gloam', [
  { id: 'shadeEdge', name: 'Shade-Edge', t: 'longsword', tier: 7, desc: 'A sword made of smoke and violet light. You can see through it; you cannot see past it.', o: { tint: 0x2a2232, glow: 0x8a4aff, glowStrength: 2.2 }, fx: { darkDmg: 0.1 } },
  { id: 'gravewoodScythe', name: 'Gravewood Scythe', t: 'glaive', tier: 6, desc: 'A scythe from the Gravewood, its haft grown from a dead tree.', o: { wood: 'gloamwood' }, s: { bleed: 4 } },
  { id: 'wightsLongsword', name: 'Wight\'s Longsword', t: 'longsword', tier: 5, desc: 'Rusted, and rimed with frost that never melts. Hits may freeze.', s: { frost: 0.12 }, o: { tint: 0x8a9aa8, glow: 0x7fd4ff, glowStrength: 1 } },
  { id: 'hollowSpear', name: 'Hollow Spear', t: 'spear', tier: 6, desc: 'The shaft is hollow, and something whistles inside it.' },
  { id: 'riftTornAxe', name: 'Rift-Torn Axe', t: 'greataxe', tier: 7, desc: 'Half its head is missing, and the edge where it was is a line of violet.' },
  { id: 'gloamBow', name: 'Gloam Bow', t: 'bow', tier: 7, desc: 'There is no visible string. The arrows go anyway.', o: { curve: 1 }, s: { pierce: 0.2 } },
  { id: 'barrowBlade', name: 'Barrow Blade', t: 'sword', tier: 5, desc: 'A bronze leaf-blade from the Barrow of the Old Kings.', o: { tint: 0xa87840 }, fx: { bane_undead: 0.12 } },
  { id: 'heskReplica', name: 'Black Knife (replica)', t: 'stiletto', tier: 5, desc: 'Hesk\'s design, copied by those who wanted to be Hesk. Most of them died of it.', o: { tint: 0x1a1a1e }, fx: { backstab: 0.2 } },
  { id: 'graveBellMace', name: 'Grave-Bell Mace', t: 'mace', tier: 6, desc: 'A little bell hangs inside the head. It rings for the dead.', fx: { bane_undead: 0.15 } },
  { id: 'lichCandleStaff', name: 'Lich-Candle Staff', t: 'staff', tier: 7, desc: 'A black candle burns at its head and never shortens.', o: { glow: 0x8a4aff }, fx: { spell: 0.1 } },
]);
F('elven', [
  { id: 'verdantLeafblade', name: 'Verdant Leafblade', t: 'sword', tier: 4, desc: 'A blade shaped like a willow leaf, green in the steel.', o: { tint: 0x8ac08a } },
  { id: 'thornbow', name: 'Thornbow', t: 'bow', tier: 4, desc: 'A bow grown, not made: its limbs still have thorns.', o: { curve: 1 }, s: { bleed: 3 } },
  { id: 'moonglaive', name: 'Moonglaive', t: 'glaive', tier: 5, desc: 'A pale crescent glaive. It shines at night.', o: { glow: 0xcfe8ff }, fx: { nightDmg: 0.12 } },
  { id: 'rootstaff', name: 'Rootstaff', t: 'staff', tier: 4, desc: 'A staff of living root. Sometimes it buds.', o: { glow: 0x8ad04a }, fx: { heal: 0.08 } },
  { id: 'elvenHuntingKnife', name: 'Elven Hunting Knife', t: 'dagger', tier: 3, desc: 'A leaf-bladed knife, very light.', s: { speed: 1.55 } },
  { id: 'briarSpear', name: 'Briar Spear', t: 'spear', tier: 4, desc: 'A spear bound in briar; it tears on the way out.', s: { bleed: 4 } },
]);
F('valorian', [
  { id: 'legionGladius', name: 'Legion Gladius', t: 'gladius', tier: 4, desc: 'The Legion\'s short sword: stab, step, stab.' },
  { id: 'legionPilum', name: 'Legion Pilum Spear', t: 'spear', tier: 4, desc: 'A long iron shank on a short shaft, made to bend in a shield.', s: { pierce: 0.2 } },
  { id: 'emberSpatha', name: 'Ember Spatha', t: 'longsword', tier: 5, desc: 'A cavalry sword whose edge smoulders.', s: { burn: 6 }, o: { glow: 0xff6a2a } },
  { id: 'centurionsMace', name: 'Centurion\'s Mace', t: 'mace', tier: 4, desc: 'A mace with a vine-stock haft: a centurion\'s badge of office.' },
  { id: 'legionScorpion', name: 'Legion Scorpion-Crossbow', t: 'crossbow', tier: 5, desc: 'A hand-scorpion from the Legion artillery.', o: { len: 1.1 } },
  { id: 'dragonScaleFalx', name: 'Dragon-Scale Falx', t: 'khopesh', tier: 5, desc: 'A forward-curved blade with a grip of dragon scale.' },
  { id: 'tribunesSword', name: 'Tribune\'s Sword', t: 'longsword', tier: 5, desc: 'A tribune\'s sword, gilded at the hilt.', o: { tint: 0xd0b080 } },
  { id: 'emberLegatesStaff', name: 'Ember Legate\'s Staff', t: 'staff', tier: 5, desc: 'A staff tipped with an ember that never goes out.', o: { glow: 0xff6a2a }, fx: { fireDmg: 0.12 } },
]);
F('hunter', [
  { id: 'hedgeSickle', name: 'Sickle of the Hedge', t: 'kris', tier: 2, desc: 'A herb-wife\'s sickle, sharp enough for more than herbs.', fx: { oreYield: 0.08 } },
  { id: 'huntersBoarSpear', name: 'Hunter\'s Boar Spear', t: 'spear', tier: 2, desc: 'Lugs below the head stop a boar running up the shaft at you.', fx: { bane_beast: 0.1 } },
  { id: 'skinningCleaver', name: 'Skinning Cleaver', t: 'falchion', tier: 2, desc: 'A butcher\'s cleaver for the hunting camp.', fx: { beastLoot: 0.15 } },
  { id: 'charcoalBurnersAxe', name: 'Charcoal-Burner\'s Axe', t: 'beardedAxe', tier: 2, desc: 'Black with soot; it never quite comes off.', s: { burn: 2 } },
  { id: 'trappersBow', name: 'Trapper\'s Bow', t: 'bow', tier: 2, desc: 'A short bow for shooting in thick woods.', o: { len: 0.85 }, s: { crit: 0.05 } },
]);
F('temple', [
  { id: 'pilgrimsStaff', name: 'Pilgrim\'s Staff', t: 'staff', tier: 2, desc: 'A walking staff with a little sunwheel on top.', o: { glow: 0xffe08a }, fx: { holyDmg: 0.05 } },
  { id: 'dawnstarMace', name: 'Dawnstar Mace', t: 'star', tier: 3, desc: 'A star-headed mace, gilt, blessed in the chapel.', fx: { bane_undead: 0.12 } },
  { id: 'chapelSword', name: 'Chapel Sword', t: 'sword', tier: 3, desc: 'A plain sword with a sunwheel pommel, hung in a chapel until someone needed it.', fx: { holyDmg: 0.06 } },
  { id: 'agnesWalkingStick', name: 'Mother Agnes\'s Walking Stick', t: 'club', tier: 3, desc: 'A walking stick, surprisingly heavy. Mother Agnes does not say why.', s: { stagger: 1.9 } },
]);

// ---- faction shields (§3) -----------------------------------------------------------------------
namedShield({ id: 'watchPavise', name: 'Watch Pavise', tier: 2, desc: 'A tall Glen Watch pavise with a prop leg. On the wall it was planted in the ground; off it, it is a wall you carry.', look: { shape: 'pavise', face: 0x2a4a8a, accent: 0xe8e4d8, rim: 0x5a5650, device: 'pale' }, s: { block: 120, stability: 0.74, poise: 6 } }, ['fshop:glenWatch', 'quest:glenWatch']);
namedShield({ id: 'silverLanceHeater', name: 'Silver Lance Heater', tier: 3, desc: 'A silversteel heater with the lance on a blue field.', look: { shape: 'heater', face: 0x2a4a8a, accent: 0xdfe6f4, rim: 0xdfe6f4, device: 'pale' }, s: { block: 115, stability: 0.7 }, fx: { sprintHit: 0.1 } }, ['fshop:crown', 'quest:crown']);
namedShield({ id: 'dwarvenDoorshield', name: 'Dwarven Doorshield', tier: 4, desc: 'A tower shield the size of a hold\'s door, and as hard to get through.', look: { shape: 'tower', face: 0x46526a, accent: 0xd0a040, rim: 0xd0a040, device: 'cross', metalFace: true }, s: { block: 150, stability: 0.86, poise: 12 } }, ['fshop:dwarven', 'quest:dwarven']);
namedShield({ id: 'wreckersHatchLid', name: 'Wrecker\'s Hatch-Lid', tier: 5, desc: 'A ship\'s hatch with a handle bolted on.', look: { shape: 'hatch', face: 0x6a5a44, accent: 0x6a5a44, rim: 0x3a3a3a, device: 'none' }, s: { block: 125, stability: 0.74, poise: 6 } }, ['fshop:wrecker', 'quest:wrecker']);
namedShield({ id: 'legionScutum', name: 'Legion Scutum', tier: 4, desc: 'The Legion\'s curved oblong shield, red with a gold eagle.', look: { shape: 'scutum', face: 0x9a2a1a, accent: 0xd8b04a, rim: 0xb08a3a, device: 'sun' }, s: { block: 130, stability: 0.8, poise: 8 } }, ['fshop:valorian', 'quest:valorian']);
namedShield({ id: 'duneTargeShield', name: 'Sun Guard Targe', tier: 5, desc: 'The Sun Guard\'s round shield, a sun-disc boss on white enamel. It leads the desert line.', look: { shape: 'targe', face: 0xe8e0c8, accent: 0xd8a84a, rim: 0xd8a84a, device: 'sun', metalFace: true, spikes: 1 }, s: { block: 115, stability: 0.7 }, fx: { desertWard: 0.05 } }, ['fshop:desert', 'quest:desert']);
