import type { QuestDef } from './questLog';
import { COPPERBROOK, STONEGATE, FROSTPEAK, LIFT, COLD_VEIN, CAIRNS } from '../world/mountains/mountainLayout';

// The White Mountains' first chapters (docs/design/mountains.md §9 and the
// open-world plan's phase 3). The Iron Kettle lands you in Kettle Cove; the
// Great Winch takes you up to Copperbrook, where Bruni's claim is in dispute
// and the ore is coming up black. "The Iron Below" thread begins: chapter 1
// (Cold Iron) in the Cold Vein, chapter 2 (The King's Audience) at Frostpeak,
// where the Lorekeeper reads you a name the Temple never sings.

const C: [number, number] = [COPPERBROOK.x, COPPERBROOK.z];
const F: [number, number] = [FROSTPEAK.x, FROSTPEAK.z];

export const MOUNTAIN_QUESTS: QuestDef[] = [
  {
    id: 'kettle-landing', title: 'The Landing', giver: 'hamm', region: 'White Mountains',
    summary: 'Kettle Cove: a quay, a camp, and a cliff. Bruni has gone up the Great Winch to Copperbrook ahead of you.',
    offer: 'Landed and all your limbs on. Good. Bruni\'s gone up the Winch to Copperbrook to see about her claim; she wants you up there. Tova runs the Winch: west end of the cove, can\'t miss it, it\'s the only thing going up.',
    acceptLabel: 'Up the Winch, then.',
    stages: [
      { note: 'Ride the Great Winch up the cliff to Copperbrook.', objectives: [{ type: 'signal', id: 'winch-up', text: 'Ride the Great Winch up the cliff (the west end of the cove)', at: LIFT.bottom }] },
      { note: 'Find Bruni in Copperbrook.', objectives: [{ type: 'talk', npc: 'bruni-wm', text: 'Find Bruni at her camp on Copperbrook\'s square', reply: 'The Winch is something.', say: 'Isn\'t it? My grandfather built it, and my mother won\'t ride it. Now. The claim. We have a problem, and her name is Marta Hollins.' }] },
    ],
    done: 'Welcome to the White Mountains. Mind the cold above the village: it creeps up on you, and a fire, a hot meal or good furs are the only cures.',
    rewards: { gold: 40, xp: 160, items: [['holdStew', 2]] },
  },
  {
    id: 'first-claim', title: 'The First Claim', giver: 'bruni-wm', region: 'White Mountains', requires: ['kettle-landing'],
    summary: 'Bruni\'s family claim, the old mine east of Copperbrook, is being worked by Marta Hollins\'s human crew. Twelve years they\'ve been at it. Bruni has the paper. Marta has the miners.',
    offer: 'My grandmother cut that drift. Stonevein mark on the lintel and everything. Marta Hollins has been working it for twelve years, and when I showed her the deed she laughed. Talk to her. I\'ll take shared, I\'ll take bought, I\'ll take a fair fight. What I won\'t take is laughing.',
    acceptLabel: 'I\'ll talk to her.',
    stages: [
      {
        note: 'Settle the claim with Marta Hollins, by the mine\'s mouth east of the square.',
        objectives: [{
          type: 'choose', npc: 'marta', key: 'deal', text: 'Settle the claim with Marta Hollins (by the mine\'s mouth)',
          prompt: 'Bruni sent you. Of course she did. Listen: I\'ve buried two men in that hill. I\'m not walking away because a dwarf found a piece of paper in her grandmother\'s drawer. So. What are you offering?',
          reply: 'Bruni sent me to settle the claim.',
          options: [
            { id: 'share', label: 'Work it together: half to the Hollins crew, half to Stonevein.', say: 'Half. Hm. Her people know stone, I\'ll give her that, and mine are tired. Half, then. And she buys the first round.' },
            { id: 'buy', label: 'Buy her out. 250 gold, here and now.', say: 'Two hundred and fifty. That\'s more than the hill paid me in the last three years. Done. I\'ll take my lads to the coast road and leave the black ore to the dwarves.', when: 'rich' },
            { id: 'fight', label: 'Settle it the old way: my best fighter against yours.', say: 'Ha! Now you\'re talking like a miner. Tomas! Get out here. Bare blades, first to yield. If you win, the dwarves have it. If he wins, you buy him a drink and go home.' },
          ],
        }],
      },
      { note: 'Beat Tomas Hollins in a fair fight by the mine\'s mouth.', when: 'deal=fight', hook: 'claim:brawl', objectives: [{ type: 'signal', id: 'claim-won', text: 'Beat Tomas Hollins (first to yield, by the mine\'s mouth)', at: COLD_VEIN.at }] },
      { note: 'Pay Marta Hollins.', when: 'deal=buy', hook: 'claim:buy', objectives: [{ type: 'talk', npc: 'marta', text: 'Pay Marta her 250 gold', reply: 'Here. Two hundred and fifty.', say: 'Counted it twice. It\'s all there. Good luck with the black ore. You\'ll need it.' }] },
      {
        note: 'Tell Bruni how it went.',
        objectives: [{
          type: 'talk', npc: 'bruni-wm', text: 'Tell Bruni the claim is settled', reply: 'The claim\'s settled.',
          say: 'Settled! Good. Now we can find out what\'s wrong with it.',
          sayIf: [
            ['deal=share', 'Half? Half. Well. My grandmother would spit, but my grandmother never had to feed forty dwarves on a cliff. Half it is. And Marta can tell my people where the black ore comes up.'],
            ['deal=buy', 'You bought it? With your own coin? I\'ll pay you back. Eventually. Probably. Dwarves always pay. Eventually.'],
            ['deal=fight', 'You put Tomas on his back? Marta will be telling that one for a year. The claim\'s ours, and you\'ve a friend in every Stonevein for life.'],
          ],
        }],
      },
    ],
    done: 'Take this. It came out of my braid, and it\'s been in my family longer than the Winch. Now: my mother wants to see you. The Thane. The ore\'s coming up black, and she thinks someone\'s been stealing it.',
    doneIf: [['deal=fight', 'Take this ring from my braid. You fought for my family\'s name; you can carry it. Now go and see my mother, the Thane, at Kettlehold\'s gate. Something\'s wrong with the ore.']],
    rewards: { gold: 120, xp: 450, items: [['stoneveinBraid', 1]], guildRep: 20 },
  },
  {
    id: 'cold-iron', title: 'Cold Iron', giver: 'brynja', region: 'White Mountains', requires: ['first-claim'], main: true,
    summary: 'The Iron Below, chapter 1. The ore in the claim\'s low drift comes up black and cold, and someone has been working it at night and carting it away. The Thane of Kettlehold wants to know who, and for whom.',
    offer: 'You are the sky-born who settled my daughter\'s claim. Good. Now settle this. There is a seam in that hill we call the Cold Vein. The iron in it is black, and it is cold, and it does not belong in any forge of ours. Someone has been digging it at night, and carting it south. Go down. Find who. Bring me something with a name on it.',
    acceptLabel: 'I\'ll go down.',
    stages: [
      { note: 'Go down into the Cold Vein and find who has been working it at night.', objectives: [{ type: 'collect', item: 'coldhandLedger', count: 1, text: 'Go down into the Cold Vein (east of Copperbrook) and take the smugglers\' ledger', at: COLD_VEIN.at }] },
      {
        note: 'Show the ledger to Hold-Thane Brynja at Kettlehold\'s gate.',
        objectives: [{
          type: 'talk', npc: 'brynja', text: 'Show the Thane the Coldhand Ledger (Kettlehold\'s gate, west of Copperbrook)', reply: 'Varga Coldhand\'s ledger. Black iron, shipped south.',
          say: '...Give it here. Cartloads. Cartloads, for three winters. And every page stamped with this. An anvil, with an eye. You know it? No. You would not. It is the mark of the Iron Below, the god under the oldest holds, and there is only one man on the surface who wears it: a tall knight with a cold voice. Ser Malric Dane. The Wheelbreaker, they call him in the lowlands. He has been buying our cold iron. Why does a knight need black iron by the cartload?',
        }],
      },
    ],
    done: 'I do not know what Malric wants with cold iron, but the old ledgers might. Frostpeak keeps every hold\'s accounts back to the first stone. Take the Dwarf Road north, past Stonegate, along the High Shelf. Go to the King. Tell him Brynja sent you, and that it is the Iron Below.',
    rewards: { gold: 400, xp: 1100, items: [['anvilfistHammer', 1], ['coldward', 2]], guildRep: 40 },
  },
  {
    id: 'troll-toll', title: 'Troll Toll', giver: 'dagny', region: 'White Mountains',
    summary: 'Three rock trolls have taken Stonegate, the fort on the Dwarf Road, and demand a toll of meat from every caravan. Captain Dagny has run out of meat and soldiers.',
    offer: 'Three of them. Gristle, Mossback, and the big one we call Grandmother Scree. They took my walls in a night, and now every caravan to Frostpeak pays them in meat or in men. Here is what I know: cut a troll and it knits, like stone growing back. Burn it and it doesn\'t. They keep braziers burning in my courtyard. Use them.',
    acceptLabel: 'I\'ll clear your fort.',
    stages: [
      { note: 'Kill the three rock trolls holding Stonegate. They heal unless they\'re burning: knock them into the braziers, or bring fire.', objectives: [{ type: 'signal', id: 'stonegate-clear', text: 'Kill the trolls in Stonegate (Gristle, Mossback, Grandmother Scree)', at: [STONEGATE.x, STONEGATE.z] }] },
      { note: 'Tell Captain Dagny her fort is hers again.', objectives: [{ type: 'talk', npc: 'dagny', text: 'Tell Captain Dagny Stonegate is clear', reply: 'Your fort is yours again.', say: 'All three. Even Scree. I\'ve been looking at that wall for a month thinking of ways to die well, and you just walked in. The road to Frostpeak is open. The King will hear your name from me.' }] },
    ],
    done: 'The caravans will run again. Take this, and come back to Stonegate whenever the road is cold: there will always be a fire for you here.',
    rewards: { gold: 350, xp: 900, items: [['coldward', 3], ['holdStew', 3]], guildRep: 30 },
  },
  {
    id: 'kings-audience', title: 'The King\'s Audience', giver: 'brynja', region: 'White Mountains', requires: ['cold-iron'], main: true,
    summary: 'The Iron Below, chapter 2. Take the Coldhand Ledger up the Dwarf Road to Frostpeak Citadel, to King Durin and his Lorekeeper, who keeps the oldest ledgers in the mountains.',
    offer: 'The King will not see a sky-born because I ask it. He will see you because of what you carry. Go up the road, past Stonegate and along the High Shelf. Keep a fire close; it is cold up there in a way it is not cold down here.',
    acceptLabel: 'I\'ll take it to the King.',
    stages: [
      { note: 'Take the Dwarf Road north past Stonegate and along the High Shelf to Frostpeak Citadel.', objectives: [{ type: 'reach', at: F, radius: 60, text: 'Reach Frostpeak Citadel (the Dwarf Road, north then west)' }] },
      { note: 'Ask King Durin for an audience in the King\'s Hall.', objectives: [{ type: 'talk', npc: 'durin', text: 'Ask King Durin for an audience (the King\'s Hall)', reply: 'Hold-Thane Brynja sent me. It concerns the Iron Below.', say: 'Brynja Stonevein does not send people. She sends rocks, sometimes, with notes tied to them. So this is serious. But my road is closed at Stonegate, and a King who cannot keep his own road open has no time for ledgers. Open my road, sky-born. Then we will talk.' }] },
      { note: 'Clear the trolls out of Stonegate (the King\'s price).', objectives: [{ type: 'signal', id: 'stonegate-clear', text: 'Clear the trolls out of Stonegate (the King\'s price)', at: [STONEGATE.x, STONEGATE.z] }] },
      { note: 'Tell King Durin his road is open.', objectives: [{ type: 'talk', npc: 'durin', text: 'Tell King Durin Stonegate is open', reply: 'Stonegate is open.', say: 'So Dagny tells me, by a runner who could not stop smiling. Then you have earned an hour of my Lorekeeper\'s time, which is worth more than my own. Hrafna. Show her what you carry.' }] },
      {
        note: 'Show the Coldhand Ledger to Lorekeeper Hrafna.',
        objectives: [{
          type: 'talk', npc: 'hrafna', text: 'Show Lorekeeper Hrafna the Coldhand Ledger', reply: 'The anvil with the eye. What does the Iron Below want with black iron?',
          say: 'Sit. This will take a while, and you will not like the end of it. Three thousand years ago a man cut the first Sunwheel. A scholar. He found that through the wheels you could see the underside of the world, the Dark, and draw its power up. He made himself king. The Lamplighter King, our ledgers call him; your Temple calls those years nothing at all. For a hundred years the wheels never let night fall. He chained our forges to the wheels, and the holds burned their own mountains hollow to feed his light. Black iron is what is left when the wheels drink a seam dry: cold, because the warmth went up to him. The Iron Below is what we prayed to, down in the dark, while he ruled the light. And your Ser Malric serves it. He breaks Sunwheels, sky-born. Every one he breaks, the old king loses an eye.',
        }],
      },
      {
        note: 'Answer the King about the hooded Sunwheel in his courtyard.',
        objectives: [{
          type: 'choose', npc: 'durin', key: 'hood', text: 'Answer the King about the hooded Sunwheel', reply: 'The stone in your courtyard. Why is it hooded?',
          prompt: 'Because it looks. That is all I know and all my grandfather knew: keep it covered, and it does not look. Your people use the stones to travel, I hear, from one to the next in a heartbeat. I will not forbid a guest. But I ask you, as a King asks: leave mine hooded.',
          options: [
            { id: 'leave', label: 'Then it stays hooded. I can walk.', say: 'Hm. A sky-born who keeps a promise she was not asked to make. Wear this: the holds will know you.' },
            { id: 'wake', label: 'I need that waystone, King. I\'ll wake it.', say: 'Then wake it, and be quick, and do not stand near it longer than you must. I will not pretend I like it.' },
          ],
        }],
      },
      { note: 'Wake the Sunwheel in the courtyard (lift its hood and touch it).', when: 'hood=wake', objectives: [{ type: 'signal', id: 'frostpeak-unhooded', text: 'Lift the iron hood off the courtyard Sunwheel and touch it', at: [FROSTPEAK.x - 8, FROSTPEAK.z + 10] }] },
    ],
    done: 'Go carefully. A knight who breaks wheels for a god under the mountains is no friend of yours, but he may not be your enemy either. And the one who called you here, the voice you call the Dawn: ask yourself why it never mentions any of this. My Great Lift goes down to the Deep Hold, when the Under-King answers my letters. I will write him again. Tell him I said please.',
    doneIf: [['hood=wake', 'You woke it. Then it has seen my hall, and you, and me. So be it. My Great Lift goes down to the Deep Hold when the Under-King answers my letters. I will write him again. And sky-born: the voice you call the Dawn. Ask yourself why it never mentioned any of this.']],
    rewards: { gold: 600, xp: 1800, items: [['frostpeakSigil', 1]], guildRep: 60 },
  },
  {
    id: 'lantern-road', title: 'The Lantern Road', giver: 'tova', region: 'White Mountains', requires: ['kettle-landing'],
    summary: 'The cairn lanterns along the Dwarf Road have gone out, one by one, and nobody has walked far enough up the road to light them again. In a blizzard they are the only way to find the road.',
    offer: 'The Winch is mine, but the road lanterns used to be my brother\'s. He went up the road in the spring and the lanterns went out after him. Light them again? Six would do. Every cairn has a wick and a flint; it only wants someone with legs and nerve. Some have huts beside them with a hearth: you\'ll be glad of those.',
    acceptLabel: 'I\'ll light them.',
    stages: [
      { note: `Light six of the cairn lanterns along the Dwarf Road (there are ${CAIRNS.length}).`, objectives: [{ type: 'signal', id: 'cairn-lit', count: 6, text: 'Light cairn lanterns along the Dwarf Road', at: CAIRNS[1].at }] },
      { note: 'Tell Tova the road is lit.', objectives: [{ type: 'talk', npc: 'tova', text: 'Tell Tova at the Winch the lanterns burn again', reply: 'The lanterns are lit.', say: 'I saw the glow from the top of the Winch last night, all the way up the valley. Like he was still up there, lighting them.' }] },
    ],
    done: 'Here. A warm-stone from my own forge-hearth. Keep it on you up the road, and the cold will take longer to find you.',
    rewards: { gold: 180, xp: 520, items: [['warmstone', 1]] },
  },
  {
    id: 'troll-hide-furs', title: 'Furs Fit for a Troll', giver: 'annick', region: 'White Mountains',
    summary: 'Annick the furrier will make a proper winter coat out of troll hide, if you can bring her some.',
    offer: 'Wolf fur keeps the wind off. Sheepskin keeps the cold out. Troll hide keeps out wind, cold, arrows and bad opinions. Bring me two hides and I\'ll make you the warmest coat in the mountains.',
    stages: [
      { note: 'Bring Annick two troll hides (rock trolls: Stonegate).', objectives: [{ type: 'deliver', npc: 'annick', item: 'trollHide', count: 2, text: 'Bring Annick two troll hides', say: 'Oh, these are lovely. Still warm. Sit, and give me an hour.' }] },
    ],
    done: 'There. Fleece inside, hide outside, wolf on the collar. You\'ll never be cold in the mountains again. Well. Less often.',
    rewards: { gold: 60, xp: 300, items: [['highlandFurs_chest', 1], ['highlandFurs_head', 1]] },
  },
];

/** Where each quest's places are (for tests and the map). */
export const MOUNTAIN_SPOTS = { copperbrook: C, frostpeak: F, stonegate: [STONEGATE.x, STONEGATE.z] as [number, number], coldVein: COLD_VEIN.at };
