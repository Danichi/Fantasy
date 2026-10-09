import type { QuestDef } from './questLog';
import { MTN_PLACES, CAIRNS } from '../world/mountains/mountainData';

// The White and Deep Mountains' quests (docs/design/mountains.md §9): Bruni's
// expedition chain from the voyage to King Durin's audience, then Act IV
// part two under the mountains, from the two kings' letters to the Engine
// Below; and the mountains' side quests. Pure data: the world scripting
// hangs off the stage hooks ('mtn:*'), which world/mountains/mountains.ts sets.

const P = MTN_PLACES;

export const MOUNTAIN_QUESTS: QuestDef[] = [
  // ---- The expedition ------------------------------------------------------------------------------
  {
    id: 'mtn-iron-kettle', title: 'The Iron Kettle', giver: 'bruni', region: 'whiteMountains', main: true, requires: ['dwarf-expedition'],
    summary: 'Bruni Stonevein\'s expedition sails north for the White Mountains aboard the Iron Kettle, the dwarves\' sail-and-boiler brigantine.',
    offer: 'Aboard, aboard! The Kettle won\'t wait for the tide twice.',
    stages: [
      { note: 'Sail north aboard the Iron Kettle. Captain Hamm Copperbeard has the helm; take it if you like, or man the guns.', hook: 'mtn:voyage', objectives: [{ type: 'signal', id: 'kettle-landed', text: 'Reach Kettle Cove under the White Mountains', at: P.kettleCove }] },
    ],
    done: 'The Iron Kettle comes alongside a stone quay cut into the cliffs. Kettle Cove: the expedition has landed.',
    rewards: { gold: 120, xp: 600 },
  },
  {
    id: 'mtn-landing', title: 'The Landing', giver: 'hamm', region: 'whiteMountains', main: true, requires: ['mtn-iron-kettle'],
    summary: 'Make camp at Kettle Cove, ride the dwarves\' winch-lift up the cliff, and follow the dwarf road to the mining village of Copperbrook.',
    offer: 'Bruni\'s gone ahead with the mules. Help me get the camp up, then go after her: the road to Copperbrook starts at the top of the cliff, or along the shore if you\'ve no head for heights.',
    stages: [
      { note: 'Make camp at Kettle Cove and see the clifftop from the winch-lift.', objectives: [
        { type: 'talk', npc: 'hamm', text: 'Help Hamm Copperbeard make camp', reply: 'Where do you want these crates?', say: 'Stack \'em under the cliff, out of the spray. Good. Now go up and look at what we came for.' },
        { type: 'signal', id: 'winch-ridden', text: 'Ride the winch-lift to the clifftop', at: [5250, -4884] },
      ] },
      { note: 'Follow the dwarf road to Copperbrook and find Bruni.', objectives: [
        { type: 'reach', at: P.copperbrook, radius: 45, text: 'Follow the dwarf road to Copperbrook' },
        { type: 'talk', npc: 'bruniMtn', text: 'Find Bruni in Copperbrook', reply: 'The camp\'s up. What now?', say: 'Now? Now we\'ve a problem. Look up the valley: that\'s my claim, bought and sealed in Port Aurelle. And there are someone else\'s picks in it.' },
      ] },
    ],
    done: 'Copperbrook: half dwarf, half human, all of it mud. And Bruni\'s claim already has miners in it.',
    rewards: { gold: 80, xp: 500 },
  },
  {
    id: 'mtn-first-claim', title: 'The First Claim', giver: 'bruniMtn', region: 'whiteMountains', main: true, requires: ['mtn-landing'],
    summary: 'Marta Hollins\'s miners are working Bruni\'s claim above Copperbrook. Settle it: share it, buy Marta out, or drive her people off.',
    offer: 'Marta Hollins. Human, stubborn, and sitting on my ore with my seal on the deed. Talk to her. I\'d rather not start the expedition with a feud, but I will.',
    stages: [
      { note: 'Speak to Marta Hollins, the mine-boss, at the claim.', objectives: [{ type: 'talk', npc: 'marta', text: 'Talk to Marta Hollins at the claim', reply: 'This claim belongs to Bruni Stonevein. She has the deed.', say: 'Deeds. Paper from a city that\'s never seen this valley. My people dug this seam out of nothing when nobody else wanted it. So: what\'s your offer?' }] },
      { note: 'Settle the claim: share it, buy Marta out, or drive her miners off.', hook: 'mtn:claim', objectives: [{ type: 'signal', id: 'claim-settled', text: 'Settle the claim with Marta (talk to her)', at: P.claim }] },
      { note: 'Tell Bruni how it ended.', objectives: [{ type: 'talk', npc: 'bruniMtn', text: 'Tell Bruni', reply: 'The claim is settled.', say: 'Settled. Good. I\'ll take settled over clever any day. Now let\'s see what\'s in it.' }] },
    ],
    done: 'The claim is Bruni\'s, one way or another. The first ore comes out of it the same afternoon, and the ground shakes the same night.',
    rewards: { gold: 150, xp: 700 },
  },
  {
    id: 'mtn-collapsed-shaft', title: 'The Collapsed Shaft', giver: 'bruniMtn', region: 'whiteMountains', main: true, requires: ['mtn-first-claim'],
    summary: 'A cave-in at the claim has trapped three miners. Something moved in the dark down there before the roof came down.',
    offer: 'The roof came in at the second gallery. Three of ours under it, Marta\'s Jory among them. Something moved down there before the fall, something big. Get them out. Please.',
    stages: [
      { note: 'Go down the Collapsed Shaft at the claim, find the three trapped miners and get out alive.', hook: 'mtn:shaft', objectives: [
        { type: 'signal', id: 'miner-rescued', count: 3, text: 'Free the trapped miners', at: P.shaftMouth },
        { type: 'kill', kind: 'golem', count: 1, text: 'Destroy what woke in the shaft' },
        { type: 'signal', id: 'shaft-escaped', text: 'Climb back out of the shaft', at: P.shaftMouth },
      ] },
      { note: 'Report to Bruni.', objectives: [{ type: 'talk', npc: 'bruniMtn', text: 'Report to Bruni', reply: 'They\'re out. All three.', say: 'A stone golem. In my claim. Crystal in its chest like the old carvings in the deep halls. That\'s not ours. Nothing the surface dwarves make walks.' }] },
    ],
    done: 'The miners are out, and the thing that woke under the claim is rubble. Bruni wants the king to see what you broke.',
    rewards: { gold: 220, xp: 900, items: [['gemRuby', 2]] },
  },
  {
    id: 'mtn-kings-audience', title: 'The King\'s Audience', giver: 'bruniMtn', region: 'whiteMountains', main: true, requires: ['mtn-collapsed-shaft'],
    summary: 'Up the pass to Frostpeak Citadel: King Durin Frostbeard will hear Bruni\'s case, for a price.',
    offer: 'Up the road, over Stonegate, and on to Frostpeak. The king will hear the expedition\'s case. Take the golem\'s heart-crystal: kings like proof.',
    stages: [
      { note: 'Climb the dwarf road over Stonegate Pass to Frostpeak Citadel and ask for an audience.', objectives: [
        { type: 'reach', at: P.frostpeak, radius: 80, text: 'Climb to Frostpeak Citadel' },
        { type: 'talk', npc: 'durin', text: 'Ask King Durin Frostbeard for an audience', reply: 'Bruni Stonevein\'s expedition asks the king\'s leave to mine the White Mountains.', say: 'A surface claim, a human mine-boss, and a golem with a crystal heart. Hm. You\'ll have my leave when the trolls at Stonegate stop eating my toll-keepers. Two of them. Big ones. Off you go.' },
      ] },
      { note: 'King Durin\'s favour: deal with the trolls at Stonegate.', objectives: [
        { type: 'kill', kind: 'rockTroll', count: 2, text: 'Kill the trolls of Stonegate Pass', at: P.stonegate, radius: 160 },
        { type: 'talk', npc: 'durin', text: 'Return to King Durin', reply: 'The Stonegate trolls are dead.', say: 'Burned, I hope; they grow back otherwise. Good. The expedition has my leave, and you have my ear. Which you\'ll need: there\'s something I haven\'t told Bruni.' },
      ] },
    ],
    done: 'King Durin grants the expedition its leave, and you his favour. The surface holds are open to you.',
    rewards: { gold: 400, xp: 1400, guildRep: 40 },
  },
  // ---- Act IV, part two: under the mountains -----------------------------------------------------------
  {
    id: 'mtn-two-kings', title: 'Two Kings', giver: 'durin', region: 'whiteMountains', main: true, requires: ['mtn-kings-audience'],
    summary: 'The surface king and the Under-King haven\'t spoken in a century. Thrain Ironbrow carries letters; you carry Thrain.',
    offer: 'There\'s a king under my mountain. Brokk Deepdelver. We have not spoken in a hundred years, and now the deep halls have gone quiet and things with crystal hearts are walking up my mines. I\'ve written to him. Thrain will carry the letters. You\'ll carry Thrain.',
    stages: [
      { note: 'Take the kings\' letters from King Durin, then find Thrain Ironbrow in Frostpeak.', objectives: [
        { type: 'talk', npc: 'durin', text: 'Take the letters from King Durin', reply: 'I\'ll carry your letter.', say: 'Mine is the blue seal. The red is Brokk\'s last to me, a hundred years unanswered. Give him both. He\'ll understand.', give: [['kingsLetters', 1]] },
        { type: 'talk', npc: 'thrainMtn', text: 'Find Thrain Ironbrow in Frostpeak', reply: 'King Durin says you\'re coming down the lift with me.', say: 'So I am. Home from the capital for a month and already sent down a hole. Lead on, then: the Great Lift is at the back of the outer ward.' },
      ] },
    ],
    done: 'Thrain is ready. The Great Lift waits at the back of Frostpeak\'s outer ward.',
    rewards: { gold: 150, xp: 600 },
  },
  {
    id: 'mtn-the-lift', title: 'The Lift', giver: 'thrainMtn', region: 'deepMountains', main: true, requires: ['mtn-two-kings'],
    summary: 'Down the Great Lift into the Deep Mountains, to the Under-King\'s court in the Deep Hold.',
    offer: 'Down we go. Don\'t look at the chains.',
    stages: [
      { note: 'Ride the Great Lift down into the Deep Mountains.', hook: 'mtn:lift', objectives: [{ type: 'signal', id: 'lift-descended', text: 'Ride the Great Lift down', at: P.greatLift }] },
      { note: 'Deliver the kings\' letters to the Under-King, Brokk Deepdelver, in the Deep Hold.', objectives: [{ type: 'deliver', npc: 'brokk', item: 'kingsLetters', count: 1, text: 'Deliver the letters to the Under-King', say: 'Durin\'s seal. And my own, a century old. The fool kept it. ...The forge is cold, surface-walker. The Deep Hold has not made a nail in a year. Talk to Helga.' }] },
    ],
    done: 'The Under-King reads both letters twice and says nothing for a long while. Then he sends you to his Forgemaster.',
    rewards: { gold: 200, xp: 900 },
  },
  {
    id: 'mtn-forge-cold', title: 'The Forge Is Cold', giver: 'brokk', region: 'deepMountains', main: true, requires: ['mtn-the-lift'],
    summary: 'Something lives in the Deep Forge\'s river of fire: the Forge-Wyrm. While it lives the forge is cold, and the Deep Hold can make nothing.',
    offer: 'The Forge-Wyrm came up the magma river a year ago and coiled in the forge-pit. My smiths can\'t get near it. Kill it, and the Deep Forge is yours to use. That\'s not a small thing to give a surface-walker.',
    stages: [
      { note: 'Speak to the Forgemaster, Helga Anvilborn, at the Deep Forge.', objectives: [{ type: 'talk', npc: 'helga', text: 'Speak to Helga Anvilborn', reply: 'The Under-King sent me about the Wyrm.', say: 'Then you\'re mad, and I like you. It lives in the heat. Hit it when it surfaces to breathe, and keep off the glowing rock.' }] },
      { note: 'Kill the Forge-Wyrm in the forge-pit.', hook: 'mtn:wyrm', objectives: [{ type: 'kill', kind: 'forgeWyrm', count: 1, text: 'Kill the Forge-Wyrm' }] },
      { note: 'Tell Helga the forge is clear.', objectives: [{ type: 'talk', npc: 'helga', text: 'Tell Helga the forge is clear', reply: 'The Wyrm is dead.', say: 'Listen. Hear that? The bellows. The Deep Forge is burning again, and you lit it. Bring me mithril and I\'ll teach you what it\'s for.' }] },
    ],
    done: 'The Deep Forge roars again. Mithril, star-iron and deep crystal can be worked here, by a master smith or a dwarf.',
    rewards: { gold: 600, xp: 1800, items: [['mithrilOre', 4]] },
  },
  {
    id: 'mtn-old-roads', title: 'The Old Roads', giver: 'brokk', region: 'deepMountains', main: true, requires: ['mtn-forge-cold'],
    summary: 'The star-chart\'s next mark lies beneath the mountains, along the wheel-cutters\' arrow-straight tunnels, older than the dwarves.',
    offer: 'Your star-chart. Show me. ...That mark is under us, at the end of the Old Roads. We don\'t go there. The roads were cut by someone else, before us, and their machines still walk them.',
    stages: [
      { note: 'Follow the star-chart\'s mark along the Old Roads, past the wheel-cutters\' sentinels.', hook: 'mtn:oldRoads', objectives: [
        { type: 'kill', kind: 'sentinel', count: 2, text: 'Get past the wheel-cutters\' sentinels' },
        { type: 'signal', id: 'old-roads-mark', text: 'Find the star-chart\'s mark at the end of the Old Roads' },
      ] },
      { note: 'Tell the Under-King what you found.', objectives: [{ type: 'talk', npc: 'brokk', text: 'Tell Brokk what lies at the end of the Old Roads', reply: 'There\'s a door at the end of the Old Roads. It\'s counting.', say: 'Counting. Yes. We hear it in the deep halls when the forges are quiet: tick, tick, tick, for longer than there have been dwarves. Go through. Find out what it counts.' }] },
    ],
    done: 'At the end of the Old Roads stands a door of brass and stone, and behind it something keeps time.',
    rewards: { gold: 400, xp: 1600, items: [['starIronOre', 2]] },
  },
  {
    id: 'mtn-engine-below', title: 'The Engine Below', giver: 'brokk', region: 'deepMountains', main: true, requires: ['mtn-old-roads'],
    summary: 'Beneath the Old Roads, a machine of brass, stone and starlight counts the turning of the world. Its Warden will not let you near.',
    offer: 'Go. And come back, surface-walker. I find I\'d like to know how this ends.',
    stages: [
      { note: 'Enter the Engine Below, through the counting door at the end of the Old Roads.', hook: 'mtn:engine', objectives: [{ type: 'signal', id: 'engine-entered', text: 'Enter the Engine Below' }] },
      { note: 'Defeat the Engine\'s Warden and read the great wheel.', objectives: [
        { type: 'kill', kind: 'engineWarden', count: 1, text: 'Defeat the Engine\'s Warden' },
        { type: 'signal', id: 'engine-wheel', text: 'Read the great wheel' },
      ] },
      { note: 'Bring the news to the kings. How the feud ends is up to you.', hook: 'mtn:feud', objectives: [{ type: 'signal', id: 'feud-settled', text: 'Tell the kings what the Engine counts (King Durin or the Under-King)' }] },
    ],
    done: 'Eleven spokes lit and one dark: one age is left. And the star-chart\'s next mark points beneath the sand.',
    rewards: { gold: 1200, xp: 3500, items: [['starIronOre', 3], ['deepCrystal', 3]] },
  },
  // ---- Side quests --------------------------------------------------------------------------------------
  {
    id: 'mtn-lost-lanterns', title: 'The Lost Lantern Cairns', giver: 'brenna', region: 'whiteMountains', requires: ['mtn-landing'],
    summary: `Captain Brenna Hask of Stonegate wants the ${CAIRNS.length} lantern cairns on the dwarf road relit, so travellers can find the road in a blizzard.`,
    offer: `The cairns. Every one of them dark since the autumn: ${CAIRNS.length} lanterns between the cove and the citadel, and every blizzard someone walks off the road and we find them in spring. Relight them. There's oil in each.`,
    stages: [{ note: 'Relight the lantern cairns along the dwarf road.', objectives: [{ type: 'signal', id: 'cairn-lit', count: CAIRNS.length, text: 'Relight the lantern cairns' }] }],
    done: 'The road shines from the sea to the citadel. In a blizzard, follow the lanterns.',
    rewards: { gold: 300, xp: 1100, items: [['furCloak', 1]] },
  },
  {
    id: 'mtn-avalanche-watch', title: 'The Avalanche Watch', giver: 'brenna', region: 'whiteMountains', requires: ['mtn-landing'],
    summary: 'The Gullet and the Widow\'s Slope are loaded with snow. Brenna wants someone to walk them, set the snow off, and live.',
    offer: 'Two slopes, the Gullet and the Widow\'s, loaded to bursting. A loud fight or a shout sets them off. Walk them, bring the snow down, and run sideways. Not downhill. Sideways.',
    stages: [{ note: 'Set off the avalanches on the marked slopes and outrun them (run sideways out of the path).', objectives: [{ type: 'signal', id: 'avalanche-outrun', count: 2, text: 'Outrun the avalanches on the marked slopes' }] }],
    done: 'Both slopes are down to bare rock for a while. The road is safer, and you\'re faster than you were.',
    rewards: { gold: 220, xp: 900 },
  },
  {
    id: 'mtn-yeti-cave', title: 'The Yeti\'s Cave', giver: 'tobin', region: 'whiteMountains', requires: ['mtn-landing'],
    summary: 'A yeti has been taking goats off the high road. Tobin the goatherd wants it gone.',
    offer: 'Something\'s taking my goats on the high road, past the Gullet. Big tracks, white fur on the rocks. It hides in the snow when the wind blows. There\'s a cave there. Please.',
    stages: [{ note: 'Find the yeti\'s cave above the high road and kill it.', objectives: [{ type: 'kill', kind: 'yeti', count: 1, text: 'Kill the goat-stealing yeti', at: [3420, -5232], radius: 120 }] }],
    done: 'No more goats lost on the high road. Tobin sends you off with a cheese the size of a cartwheel.',
    rewards: { gold: 180, xp: 800, items: [['dwarfStew', 3]] },
  },
  {
    id: 'mtn-dragons-hoard', title: 'The Dragon\'s Hoard', giver: 'ulla', region: 'whiteMountains', requires: ['mtn-kings-audience'],
    summary: 'Vathrax the Pale, an old white dragon gone feral, nests in the eyrie above Frostpeak on a hoard of the citadel\'s own gold.',
    offer: 'Vathrax. White as the glacier, old as the citadel, and lately mad: it took three of the king\'s wagons last month. Up the glacier trail behind the citadel. Bring me a scale, and I\'ll make you something with it. If you\'re of the dragon blood, though... it might listen to you.',
    stages: [{ note: 'Climb the glacier trail to the eyrie and deal with Vathrax the Pale.', hook: 'mtn:vathrax', objectives: [{ type: 'signal', id: 'vathrax-done', text: 'Deal with Vathrax the Pale at the eyrie', at: [2792, -5850] }] }],
    done: 'The eyrie is quiet. The citadel\'s wagons will roll again.',
    rewards: { gold: 900, xp: 2400, items: [['runewrightCrossbow', 1]] },
  },
  {
    id: 'mtn-stone-remembers', title: 'Stone Remembers', giver: 'helga', region: 'deepMountains', requires: ['mtn-forge-cold'],
    summary: 'Helga Anvilborn asks you to find the Ancestor Stone of her clan, lost in the Colossal Caverns when the deep roads were abandoned.',
    offer: 'Every clan had a stone with its names cut in it. Mine went into the caverns with the last miners and never came out. It\'s near the fungus forest, by the river. Dwarf or not, I\'d like it home.',
    stages: [
      { note: 'Find the Ancestor Stone in the Colossal Caverns.', objectives: [{ type: 'signal', id: 'ancestor-stone', text: 'Find the Ancestor Stone in the caverns' }] },
      { note: 'Tell Helga.', objectives: [{ type: 'talk', npc: 'helga', text: 'Tell Helga you found it', reply: 'I found your clan\'s stone.', say: 'Read me the last name. ...Anvilborn. My grandmother. Thank you. Stone remembers; so will I.' }] },
    ],
    done: 'Helga\'s clan stone stands in the Deep Forge again, and Helga teaches you a trick or two at the anvil.',
    rewards: { gold: 300, xp: 1200, items: [['mithrilIngot', 1]] },
  },
];
