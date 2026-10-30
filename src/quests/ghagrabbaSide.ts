import type { QuestDef } from './questLog';
import { WEST_GATE_OUT, PATROL_REMAINS, FALCON_PERCH, STAR_STONES, STELAE, MIRAGE_WELL, HULKS, KETTLE_ROCK, OLD_OASIS, ARTISANS } from '../world/desert/ghagrabbaPlaces';

// Ghagrabba's errands: the eight shops of the bazaar quarter, the gate
// guards, the royal household, and the elders and traders of the friendly
// villages. Hunts whose prey drops what the giver needs, deliveries across
// the dunes, a night watch, a thief in the spice house, loaded dice, a lost
// falcon, a lost child, and stars that only speak after dark.

const R = 'Golden Expanse';
const ARRIVED = ['silk-road-west'];

export const GHAGRABBA_SIDE_QUESTS: QuestDef[] = [
  // ---- the shops ----
  {
    id: 'hekat-flux', title: 'Fire for the Forge', giver: 'gh-smith', region: R, requires: ARRIVED,
    summary: 'Sunsmith Hekat\'s furnace will not run hot enough for true sunsteel. Dune-jelly cores burn hotter than charcoal.',
    offer: 'Charcoal! Pah. Charcoal is for bread ovens. True sunsteel wants a fire like the noon sun, and the only thing in the Expanse that burns like that is a dune jelly\'s heart. They drift over the flat pans, glowing like lamps. Pop four of them and bring me their cores — mind the sting.',
    stages: [
      { note: 'Hunt dune jellies on the flat pans for their cores.', objectives: [{ type: 'collect', item: 'jellyCore', count: 4, text: 'Take jelly cores from dune jellies (the flat pans)' }] },
      { note: 'Bring the cores to Sunsmith Hekat.', objectives: [{ type: 'deliver', npc: 'gh-smith', item: 'jellyCore', count: 4, text: 'Bring 4 jelly cores to Sunsmith Hekat', say: '(She drops one into the furnace and the whole forge goes white.) THAT is a fire. Stand back — no, further.' }] },
    ],
    done: 'The first blade out of a true fire in ten years. It is yours. Do not let it near anything you want to keep cold.',
    rewards: { gold: 120, xp: 380, items: [['furnaceKhopesh', 1]] },
  },
  {
    id: 'djau-shells', title: 'Shells for Shields', giver: 'gh-armour', region: R, requires: ARRIVED,
    summary: 'Armourer Djau wants dune-crab shell to face a new kind of shield.',
    offer: 'Bronze is heavy and the Sun Guard sweat through their boots by noon. But a dune crab\'s shell — have you hit one? Like hitting a temple door. Bring me five plates of it from the crabs under the dune crests and I\'ll make something the Queen\'s guard will fight over.',
    stages: [
      { note: 'Hunt dune crabs for their shells.', objectives: [{ type: 'collect', item: 'crabShell', count: 5, text: 'Take shell from dune crabs (under the dune crests)' }] },
      { note: 'Bring the shell to Armourer Djau.', objectives: [{ type: 'deliver', npc: 'gh-armour', item: 'crabShell', count: 5, text: 'Bring 5 crab shells to Armourer Djau', say: 'Listen — (he raps one with his knuckles) — like a temple door. Give me the night.' }] },
    ],
    done: 'The first of them. Shell over a sunsteel boss, and you can carry it all day. The guard can have the second one.',
    rewards: { gold: 110, xp: 360, items: [['carapaceShield', 1]] },
  },
  {
    id: 'meritites-fever', title: 'Fever in the Lower Streets', giver: 'gh-apoth', region: R, requires: ARRIVED,
    summary: 'A sand fever is spreading through the houses by the artisans\' square. Healer Meritites needs burrow-eel glands for her balm, and someone to carry it.',
    offer: 'Sand fever. Three houses by the artisans\' square already, and it moves house to house like gossip. The balm that breaks it wants a gland from a burrow eel\'s jaw — the eels that lash out of the sand when you walk too close. Three glands. Then I\'ll need legs to carry the balm, because mine are needed here.',
    stages: [
      { note: 'Take glands from burrow eels.', objectives: [{ type: 'collect', item: 'eelGland', count: 3, text: 'Take glands from burrow eels (out in the dunes)' }] },
      { note: 'Bring the glands to Healer Meritites.', objectives: [{ type: 'talk', npc: 'gh-apoth', text: 'Bring the eel glands to Healer Meritites', reply: 'Three eel glands.', take: [['eelGland', 3]], give: [['feverBalm', 3]], say: '(An hour of boiling and swearing later:) Three pots of balm. The houses with the fever have a blue rag tied over the door — by the artisans\' square. Leave one at each. Don\'t go in.' }] },
      { note: 'Leave the balm at the three sick houses.', hook: 'fever:houses', objectives: [{ type: 'signal', id: 'fever-balm', count: 3, text: 'Leave balm at the houses with blue rags (by the artisans\' square)', at: ARTISANS }] },
      { note: 'Return to Healer Meritites.', objectives: [{ type: 'talk', npc: 'gh-apoth', text: 'Return to Healer Meritites', reply: 'The balm is delivered.', say: 'Already a child at the second house is asking for dates. That is how you know a fever has broken: they get greedy.' }] },
    ],
    done: 'Take these, and come to me before the next storm. Sand gets into cuts.',
    rewards: { gold: 140, xp: 420, items: [['greaterHealthPotion', 3], ['spicedTea', 2]] },
  },
  {
    id: 'nakht-thief', title: 'The Saffron Thief', giver: 'gh-spice', region: R, requires: ARRIVED,
    summary: 'Somebody has been stealing saffron from Nakht\'s Spice House by night. Watch the shop and catch them.',
    offer: 'Three nights running, saffron gone. Saffron! Worth more than the gold it\'s weighed against. The door is barred and nobody comes past my lamp, yet in the morning there\'s a hole in a sack. Watch the shop tonight, would you? After the twenty-second hour. Catch whoever it is — and bring them to me. Not to the guard. To me.',
    stages: [
      { note: 'Watch the Spice House after dark.', objectives: [{ type: 'hour', from: 22, to: 4, text: 'Wait until the twenty-second hour' }] },
      { note: 'Catch the saffron thief.', hook: 'thief:night', objectives: [{ type: 'signal', id: 'thief-caught', text: 'Catch the thief at Nakht\'s Spice House (night)' }] },
      { note: 'Tell Nakht who the thief was.', objectives: [{ type: 'talk', npc: 'gh-spice', text: 'Tell Spicer Nakht who the thief was', reply: 'Your thief is a scavenger boy from Tarp Row. He trades it for water.', say: 'A child. Through the drain, I suppose — gods, the size of him. (He is quiet a while.) Water. For saffron. ...Tell him that if he comes to the front door in daylight there is work here, and water with it. A nose that can find saffron in the dark is wasted on stealing it.' }] },
    ],
    done: 'For your night\'s sleep. And this tea is mine — the best in the city, whatever Baket says.',
    rewards: { gold: 160, xp: 380, items: [['spicedTea', 4]] },
  },
  {
    id: 'sitre-ink', title: 'Royal Teal', giver: 'gh-silk', region: R, requires: ARRIVED,
    summary: 'Weaver Sitre\'s royal dye is running out. True teal comes only from the ink of dune rays.',
    offer: 'You see this teal? The Queen\'s colour — the guard, the banners, the canopy over the Sun Throne. It comes from one place: the ink sac of a dune ray. The caravans used to bring it. Now the caravans bring excuses. Four ink sacs and I\'ll weave you something worth being seen in.',
    stages: [
      { note: 'Take ink from dune rays.', objectives: [{ type: 'collect', item: 'rayInk', count: 4, text: 'Take ink from dune rays (open sand)' }] },
      { note: 'Bring the ink to Weaver Sitre.', objectives: [{ type: 'deliver', npc: 'gh-silk', item: 'rayInk', count: 4, text: 'Bring 4 ray ink to Weaver Sitre', say: 'Oh, look at that colour. Like the sea that used to be here.' }] },
    ],
    done: 'The first bolt from the new vat. I cut it as a mantle — you look like you need the shade more than the court does.',
    rewards: { gold: 120, xp: 360, items: [['sunSilkMantle', 1]] },
  },
  {
    id: 'paneb-ring', title: 'Loaded Bones', giver: 'gh-jewel', region: R, requires: ARRIVED,
    summary: 'Jeweller Paneb lost his signet at knucklebones to Ubaid, who keeps a dice table outside the Thirsty Scarab. Paneb swears the bones are loaded.',
    offer: 'My signet. My grandfather\'s signet! Lost on one throw to Ubaid the Sharp, outside the Thirsty Scarab. Three sixes, he threw — three! Nobody throws three sixes. Play him. Watch his hands. If his bones are loaded, I want my ring back, and I want him to know it was me.',
    stages: [
      { note: 'Play knucklebones with Ubaid and watch his hands.', objectives: [{ type: 'signal', id: 'dice-watched', text: 'Play knucklebones with Ubaid (outside the Thirsty Scarab)' }] },
      { note: 'Ubaid draws a knife.', objectives: [{ type: 'kill', kind: 'cheat', count: 1, text: 'Deal with Ubaid the Sharp', radius: 400 }] },
      { note: 'Return the signet to Paneb.', objectives: [{ type: 'talk', npc: 'gh-jewel', text: 'Return the signet to Jeweller Paneb', reply: 'Ubaid\'s bones were loaded. Here is your signet.', say: '(He slides it back on his finger and closes his eyes.) Lead in the bones. I knew it. I KNEW it.' }] },
    ],
    done: 'Keep it. No — keep it. I will never wear it again without thinking of that table. You wear it, and think of me fondly.',
    rewards: { gold: 150, xp: 360, items: [['panebSignet', 1]] },
  },
  {
    id: 'ipuwer-stelae', title: 'The Lost Pages', giver: 'gh-scribe', region: R, requires: ARRIVED,
    summary: 'Scribe Ipuwer is rebuilding the Scroll House\'s lost history of Amaunet from the old stelae half-buried across the Expanse.',
    offer: 'Two hundred years ago the Sunborn burned the Amaunet scrolls they found here. Very thorough, the Sunborn. But stone does not burn. There are stelae out in the dunes, half under the sand, with the old script cut in them. Four of them. Take a rubbing of each — charcoal and this cloth — and I\'ll have back a chapter of history nobody has read since.',
    stages: [
      { note: 'Take rubbings of Amaunet\'s stelae in the dunes.', hook: 'stelae:on', objectives: [{ type: 'signal', id: 'stele-rubbing', count: 4, text: 'Take rubbings of the four stelae (far west, west, south, east)', at: STELAE[0] }] },
      { note: 'Bring the rubbings to Scribe Ipuwer.', objectives: [{ type: 'talk', npc: 'gh-scribe', text: 'Bring the rubbings to Scribe Ipuwer', reply: 'Four rubbings.', say: '(He spreads them out and reads aloud, finger moving right to left.) "...and the king of Amaunet gave his name to the sun, that it would carry him under the sand and keep him." A king who would not die. Lovely. Horrible. Lovely.' }] },
    ],
    done: 'Take this for your trouble, and come back when I have the rest translated. There will be a copy with your name in the margin.',
    rewards: { gold: 300, xp: 520, items: [['greaterManaPotion', 3]] },
  },
  {
    id: 'baket-feast', title: 'A Feast for the Name-Day', giver: 'gh-food', region: R, requires: ARRIVED,
    summary: 'Cook Baket is making the Queen\'s name-day feast and is short of dates and shark fin.',
    offer: 'The Queen\'s name-day! And the date-sellers are out of dates and the fin-sellers are out of fin. I need six handfuls of dates — shake the palms in the Court of the Sun, the priests won\'t mind if you\'re quick — and two sand-shark fins. Sharks are out past the walls, being sharks. You\'ll manage.',
    stages: [
      { note: 'Gather dates and shark fins.', objectives: [
        { type: 'collect', item: 'dates', count: 6, text: 'Shake dates from the palms in the Court of the Sun' },
        { type: 'collect', item: 'sharkFin', count: 2, text: 'Take fins from sand sharks' },
      ] },
      { note: 'Bring them to Cook Baket.', objectives: [
        { type: 'deliver', npc: 'gh-food', item: 'dates', count: 6, text: 'Bring 6 dates to Cook Baket', say: 'Fat ones! These will go in the cakes.' },
        { type: 'deliver', npc: 'gh-food', item: 'sharkFin', count: 2, text: 'Bring 2 shark fins to Cook Baket', say: 'And fin for the stew. You have saved my reputation, and possibly my neck.' },
      ] },
    ],
    done: 'Take some cakes from the first batch. From now on my kitchen sells them — tell everyone they were your idea.',
    rewards: { gold: 110, xp: 320, items: [['dateCake', 5], ['spicedTea', 2]] },
  },
  // ---- the gates ----
  {
    id: 'west-wall-watch', title: 'The West Wall Watch', giver: 'gateguard-3', region: R, requires: ARRIVED,
    summary: 'Gate Guard Rahotep is short of men for the night watch at the west gate, and raiders have been testing it.',
    offer: 'Half my watch has the sand fever and the other half has excuses. Raiders tried the west gate last moon and they will try it again in the dark. Stand the watch with me tonight: light the four watch braziers outside the gate after the twenty-first hour, and when they come — and they will come — help me send them back to the sand.',
    stages: [
      { note: 'Wait for the night watch.', objectives: [{ type: 'hour', from: 21, to: 4, text: 'Wait for the night watch (after the twenty-first hour)' }] },
      { note: 'Light the four watch braziers outside the west gate.', objectives: [{ type: 'signal', id: 'watch-brazier', count: 4, text: 'Light the watch braziers outside the west gate', at: WEST_GATE_OUT }] },
      { note: 'Raiders out of the dark!', hook: 'watch:raid', objectives: [{ type: 'kill', kind: 'scavenger', count: 5, text: 'Drive the raiders from the west gate', at: WEST_GATE_OUT, radius: 160 }] },
      { note: 'Report to Rahotep.', objectives: [{ type: 'talk', npc: 'gateguard-3', text: 'Report to Gate Guard Rahotep', reply: 'The west gate held.', say: 'It held. Because of you it held. I will put it in the watch-book in my best hand.' }] },
    ],
    done: 'The watch pays in silver and in sleep. Here is the silver; the sleep you will have to find yourself.',
    rewards: { gold: 220, xp: 480, items: [['greaterHealthPotion', 2]] },
  },
  {
    id: 'lost-patrol', title: 'The Missing Patrol', giver: 'gateguard-2', region: R, requires: ARRIVED,
    summary: 'Two Sun Guards rode out along the Caravan Way and never came back. Gate Guard Isis wants to know why.',
    offer: 'Two of ours — Ib and young Seneb — rode the Caravan Way east four days ago. Their camels came back without them. Ray-riders have been seen south of the road. Find them. If they are dead, bring back their badges, so their mothers have something to hold.',
    stages: [
      { note: 'Search south of the Caravan Way for the patrol.', objectives: [{ type: 'reach', at: PATROL_REMAINS, radius: 30, text: 'Search for the patrol (south of the Caravan Way, east)' }] },
      { note: 'Ray-riders circle back to their kill.', hook: 'patrol:riders', objectives: [{ type: 'kill', kind: 'rayRider', count: 2, text: 'Bring down the ray-riders', at: PATROL_REMAINS, radius: 260 }] },
      { note: 'Recover the guards\' badges.', hook: 'patrol:riders', objectives: [{ type: 'signal', id: 'patrol-badges', text: 'Recover the fallen guards\' badges', at: PATROL_REMAINS }] },
      { note: 'Bring the badges to Gate Guard Isis.', objectives: [{ type: 'deliver', npc: 'gateguard-2', item: 'sunGuardBadge', count: 2, text: 'Bring the badges to Gate Guard Isis (the east gate)', say: '(She holds them a long time.) Ib taught me to ride. Seneb was nineteen. Thank you for not leaving them out there.' }] },
    ],
    done: 'The guard owes you. That means something in this city — more than gold, though here is gold too.',
    rewards: { gold: 260, xp: 520, items: [['sunGuardShield', 1]] },
  },
  {
    id: 'caravan-ledger', title: 'Caravan Insurance', giver: 'hassun', region: R, requires: ARRIVED,
    summary: 'Bazaar Master Hassun needs his sealed ledger put into Caravan Master Amenhir\'s hands on the Caravan Way — and the ray-riders have been shadowing the caravans.',
    offer: 'Amenhir\'s turtle is somewhere on the Caravan Way, plodding east or west — the beast has no opinion. This ledger is the bazaar\'s whole year with him, sealed. Put it in his hand and nobody else\'s. And friend: the ray-riders have been following the caravans like gulls follow fishing boats.',
    acceptLabel: 'I\'ll find the caravan.',
    stages: [
      { note: 'Find Caravan Master Amenhir on the Caravan Way and hand over the ledger.', hook: 'caravan:ledger', objectives: [{ type: 'signal', id: 'amenhir-met', text: 'Give the ledger to Caravan Master Amenhir (the Caravan Way)' }] },
      { note: 'Ray-riders swoop on the caravan!', hook: 'caravan:raid', objectives: [{ type: 'kill', kind: 'rayRider', count: 2, text: 'Drive the ray-riders off the caravan', radius: 400 }] },
      { note: 'Return to Hassun.', objectives: [{ type: 'talk', npc: 'hassun', text: 'Return to Bazaar Master Hassun', reply: 'Amenhir has the ledger. The riders won\'t trouble him again.', say: 'Delivered AND defended. If you ever tire of swords, there is a stall here with your name on it.' }] },
    ],
    done: 'Your fee, plus a little insurance of your own.',
    rewards: { gold: 280, xp: 440, items: [['greaterHealthPotion', 2], ['sunSilk', 1]] },
  },
  // ---- the royal household ----
  {
    id: 'sethi-falcon', title: 'Khepri', giver: 'sethi', region: R, requires: ARRIVED,
    summary: 'Prince Sethi\'s falcon Khepri flew off after a sand dolphin and has not come back.',
    offer: 'Khepri — my falcon — chased a dolphin pod out past the walls two days ago and did not come back. The guard saw her perched on an old wreck north-east of the city. Mother will not let me ride out to fetch her. You are not my mother. Take this whistle; she knows the call.',
    stages: [
      { note: 'Find Khepri on the wreck north-east of the city.', objectives: [{ type: 'reach', at: FALCON_PERCH, radius: 40, text: 'Find Khepri (a wreck north-east of the city)' }] },
      { note: 'Sand sharks circle the wreck.', hook: 'falcon:sharks', objectives: [{ type: 'kill', kind: 'sandShark', count: 2, text: 'Drive off the sharks circling the wreck', at: FALCON_PERCH, radius: 160 }] },
      { note: 'Whistle Khepri down.', hook: 'falcon:sharks', objectives: [{ type: 'signal', id: 'falcon-whistle', text: 'Whistle Khepri down from the mast', at: FALCON_PERCH }] },
      { note: 'Tell Prince Sethi his falcon is coming home.', objectives: [{ type: 'talk', npc: 'sethi', text: 'Tell Prince Sethi that Khepri is safe', reply: 'Khepri is flying home.', say: 'She came in through the window an hour ago and bit me! That is how she says thank you. Mostly.' }] },
    ],
    done: 'She dropped this on my pillow. A flight feather — falconers say it carries the bird\'s speed. Take it.',
    rewards: { gold: 140, xp: 340, items: [['falconFeather', 1]] },
  },
  {
    id: 'nefret-stars', title: 'Three Stars over Amaunet', giver: 'nefret', region: R, requires: ARRIVED,
    summary: 'Princess Nefret believes the old star-stones point to something buried. They can only be read after dark.',
    offer: 'There are three star-stones: one in the Court of the Sun, two out in the dunes, west and east. In daylight they are just stones. After dark the stars cut into them line up with the real ones. Read all three for me — I am not allowed out at night. I am not allowed out at all, in fact.',
    stages: [
      { note: 'Wait for the stars.', objectives: [{ type: 'hour', from: 21, to: 4, text: 'Wait for full dark (after the twenty-first hour)' }] },
      { note: 'Read the three star-stones by starlight.', objectives: [{ type: 'signal', id: 'star-read', count: 3, text: 'Read the star-stones (the Court, the far west, the east)', at: STAR_STONES[0] }] },
      { note: 'Tell Princess Nefret what the stars say.', objectives: [{ type: 'talk', npc: 'nefret', text: 'Tell Princess Nefret what the stars say', reply: 'The three stars all point south-west.', say: 'South-west. Past the Warden\'s sands. (She draws three lines on her map; they meet in a ring of dunes.) There is something there. I knew it. I KNEW it.' }] },
    ],
    done: 'Grandmother gave me this when I learned my first star. You have learned three. It is only fair.',
    rewards: { gold: 160, xp: 420, items: [['starReaderRing', 1]] },
  },
  {
    id: 'garden-water', title: 'Sweet Water', giver: 'lady-isetnofret', region: R, requires: ARRIVED,
    summary: 'The palace garden is wilting on Great Well water. Lady Isetnofret wants water from the Old Oasis.',
    offer: 'The only grass in Ghagrabba, and it is turning yellow. The Well water has gone bitter — salt, the gardeners say. The Old Oasis, far to the east, still has sweet water. Three waterskins of it. I would go myself but I would die, and then who would tend the grass?',
    stages: [
      { note: 'Fill waterskins at the Old Oasis well.', hook: 'oasis:skins', objectives: [{ type: 'collect', item: 'oasisWater', count: 3, text: 'Fill waterskins at the Old Oasis well (far east)', at: OLD_OASIS }] },
      { note: 'Bring the water to Lady Isetnofret.', objectives: [{ type: 'deliver', npc: 'lady-isetnofret', item: 'oasisWater', count: 3, text: 'Bring 3 skins of oasis water to Lady Isetnofret (the palace garden)', say: '(She pours a little on the grass and actually sighs.) Listen. You can hear it drinking.' }] },
    ],
    done: 'For your trouble: a ring my mother wore to the Old Oasis when she was a girl. It has been thirsty ever since.',
    rewards: { gold: 140, xp: 340, items: [['oasisRing', 1]] },
  },
  {
    id: 'missing-gold', title: 'The Missing Gold', giver: 'senmut', region: R, requires: ['os-2'],
    summary: 'Treasurer Senmut\'s counts do not add up. Someone in the palace is skimming the Queen\'s gold.',
    offer: '(He leans close.) Every coin in this room is counted twice a day, and for a year now the second count has been short. Not by much. By exactly enough that a careful man would notice, and a careless man would not. I am a careful man. I cannot be seen searching the palace. You can. Look at the treasury ledger, the Vizier\'s writing-desk by the throne, and — this is embarrassing — the garden. Something keeps glinting in the pool.',
    stages: [
      { note: 'Search the palace for where the gold went.', objectives: [{ type: 'signal', id: 'gold-clue', count: 3, text: 'Search the treasury ledger, the Vizier\'s desk and the garden pool (the palace)' }] },
      { note: 'Tell Treasurer Senmut what you found.', objectives: [{ type: 'talk', npc: 'senmut', text: 'Tell Treasurer Senmut what you found', reply: 'The ledger is altered in the Vizier\'s hand, his desk holds pay-chits for diggers, and the pool hides a bag of coin waiting to be collected.', say: '(He goes pale, then very calm.) The Vizier. Paying diggers with the Queen\'s own gold. I will write it all down — twice — and put it where she will read it.' }] },
    ],
    done: 'A finder\'s fee, from the recovered coin. Counted twice.',
    rewards: { gold: 350, xp: 460 },
  },
  // ---- the villages ----
  {
    id: 'mirage-lights', title: 'Lights over the Well', giver: 'elder-9', region: R, requires: ARRIVED,
    summary: 'Dune jellies have drifted in over Mirage Well and sting anyone who goes for water.',
    offer: 'Lights over the well, every evening. Pretty, the children say, until they go for water and come back screaming. Dune jellies — five of them, drifting in from the pans. We have no one who can reach them. You have a long arm.',
    stages: [
      { note: 'Clear the dune jellies drifting over Mirage Well.', hook: 'mirage:jellies', objectives: [{ type: 'kill', kind: 'duneJelly', count: 5, text: 'Burst the dune jellies over Mirage Well', at: MIRAGE_WELL, radius: 140 }] },
      { note: 'Tell Elder Kenamun the well is clear.', objectives: [{ type: 'talk', npc: 'elder-9', text: 'Tell Elder Kenamun the well is clear', reply: 'Your well is safe again.', say: 'The children are already fighting over who carries the first jar. That is the sound of a good day.' }] },
    ],
    done: 'We have little, but this was my daughter\'s, and she would want it on someone who keeps wells safe.',
    rewards: { gold: 140, xp: 340, items: [['scarabCharm', 1]] },
  },
  {
    id: 'lost-pebble', title: 'Pebble', giver: 'elder-17', region: R, requires: ARRIVED,
    summary: 'A Kettle Rock child called Pebble went scavenging at the Hulks and was taken by the raiders there.',
    offer: 'Pebble. Eight years old and too brave by half. She went to dig at the Hulks — the wrecked skiffs, north of the city — and the raiders that squat there took her. They will sell her to the crews that dig for the city. Bring her home. Please.',
    stages: [
      { note: 'Find Pebble at the Hulks.', objectives: [{ type: 'reach', at: HULKS, radius: 45, text: 'Find Pebble at the Hulks (north of the city)' }] },
      { note: 'Free Pebble.', hook: 'pebble:captive', objectives: [{ type: 'signal', id: 'pebble-found', text: 'Free Pebble from the raiders\' stake', at: HULKS }] },
      { note: 'Bring Pebble home to Kettle Rock.', hook: 'pebble:escort', objectives: [{ type: 'signal', id: 'pebble-home', text: 'Bring Pebble home to Kettle Rock (north-east)', at: KETTLE_ROCK }] },
      { note: 'Speak with Grandmother Sheri.', objectives: [{ type: 'talk', npc: 'elder-17', text: 'Speak with Grandmother Sheri', reply: 'Pebble is home.', say: '(She does not say anything for a while; she is busy holding a child.) ...Kettle Rock will remember your name until the last of us is sand.' }] },
    ],
    done: 'Everything we could gather. Take it — no, take it, or I will have Pebble chase you.',
    rewards: { gold: 180, xp: 460, items: [['greaterHealthPotion', 3], ['duneGlass', 3]] },
  },
  {
    id: 'oasis-eels', title: 'Eels in the Oasis', giver: 'elder-15', region: R, requires: ARRIVED,
    summary: 'Burrow eels have dug in around the Old Oasis and bite anyone who goes to the water.',
    offer: 'The eels came up with the dry season. They dig in round the water\'s edge and wait. Old Senu lost a hand to one last week. Four of them. Pull them out of their holes.',
    stages: [
      { note: 'Kill the burrow eels around the Old Oasis.', hook: 'oasis:eels', objectives: [{ type: 'kill', kind: 'sandEel', count: 4, text: 'Kill the burrow eels at the Old Oasis', at: OLD_OASIS, radius: 140 }] },
      { note: 'Tell Elder Ramose the water is safe.', objectives: [{ type: 'talk', npc: 'elder-15', text: 'Tell Elder Ramose the water is safe', reply: 'The eels are gone.', say: 'Senu will be glad. He says he wants to see their teeth. I think he wants to see them dead.' }] },
    ],
    done: 'Dates from our own trees, and the coin we put aside for a better day. This is the better day.',
    rewards: { gold: 140, xp: 330, items: [['dates', 6], ['greaterHealthPotion', 1]] },
  },
  {
    id: 'furnace-scrap', title: 'Scrap for the Furnaces', giver: 'vtrader-13', region: R, requires: ARRIVED,
    summary: 'The trader of Tarp Row has a deal with Glassmaker Ptahmose: scrap for glass. They need a carrier.',
    offer: 'Ptahmose the glassmaker will pay in good glass for good scrap, and nobody here has legs for the walk. Eight pieces of scrap, delivered to his furnaces in the city — you\'ll find him in the artisans\' square. The heaps at the Hulks and the Bone Wells are full of it, if you don\'t mind raiders.',
    stages: [
      { note: 'Gather eight pieces of scrap.', objectives: [{ type: 'collect', item: 'scrapMetal', count: 8, text: 'Gather scrap metal (the Hulks or the Bone Wells)' }] },
      { note: 'Deliver the scrap to Glassmaker Ptahmose.', objectives: [{ type: 'deliver', npc: 'ptah', item: 'scrapMetal', count: 8, text: 'Deliver 8 scrap to Glassmaker Ptahmose (the artisans\' square)', say: 'Tarp Row\'s scrap! Good iron in this. Tell them the glass goes out on the next cart.' }] },
    ],
    done: 'Tarp Row\'s cut, and yours. The furnace thanks you.',
    rewards: { gold: 170, xp: 300, items: [['duneGlass', 2]] },
  },
];

/** What the notice wall in the bazaar says about each errand while it is on offer. */
export const NOTICES: Record<string, string> = {
  'hekat-flux': 'WANTED — dune-jelly cores, four. Ask at the Sunsteel Forge. (Hekat)',
  'djau-shells': 'Crab shell bought: five plates. Djau\'s Scale & Shield.',
  'meritites-fever': 'Sand fever by the artisans\' square. The House of Balms needs burrow-eel glands and a runner.',
  'nakht-thief': 'REWARD for the saffron thief. Nakht\'s Spice House. Discretion paid extra.',
  'sitre-ink': 'The Silk Loom buys dune-ray ink. Royal teal does not dye itself.',
  'paneb-ring': 'Has anyone ever beaten Ubaid at knucklebones? Paneb the jeweller would like a word.',
  'ipuwer-stelae': 'The Scroll House seeks rubbings of the old stelae in the dunes. Charcoal provided.',
  'baket-feast': 'Dates and shark fin wanted for the Queen\'s name-day feast. The Date Palm Kitchen.',
  'west-wall-watch': 'The west gate watch is short of hands. Report to Gate Guard Rahotep.',
  'lost-patrol': 'MISSING: Sun Guards Ib and Seneb, the Caravan Way. Word to Gate Guard Isis, east gate.',
  'caravan-ledger': 'Courier wanted, Caravan Way, discreet, armed. Bazaar Master Hassun.',
  'sethi-falcon': 'LOST: a falcon, jesses of royal teal. Answers to "Khepri" (and bites). The palace.',
  'nefret-stars': 'Star-readers wanted. Night work. Enquire at the palace (the Princess, not the Vizier).',
  'garden-water': 'Sweet water from the Old Oasis wanted for the palace garden. Lady Isetnofret.',
  'missing-gold': '(A note in a careful hand:) The Treasurer would like to discuss arithmetic with a trustworthy outlander.',
  'mirage-lights': 'Mirage Well: jellies over the water. The elder asks for help.',
  'lost-pebble': 'Kettle Rock: a child taken at the Hulks. Grandmother Sheri begs anyone with a sword.',
  'oasis-eels': 'Old Oasis: burrow eels at the waterline. Elder Ramose pays in dates and coin.',
  'furnace-scrap': 'Carrier wanted: Tarp Row scrap to the glass furnaces. Ask the Tarp Row trader.',
};

