import type { QuestDef } from './questLog';
import { SITES, GATE_AT } from '../world/elves/elvenForestData';

// The Verdant Elves' quests (docs/design/verdant-elves.md §8).
// Act IV, part one: the Starfall Script.
//   1 The Marker Stone        Thornwick: get the elves' leave to walk the Greenwood Road
//   2 The Guide's Token       Silverbough: the spring's spiders and the loggers' quarrel
//   3 The Council of Leaves   the Sanctum: what the elves know of the Turning
//   4 The Blight              the oldest grove: the Blighted Elder
//   5 The Temple of Starfall  the dungeon under the grove: the star-chart
//   6 What the Stars Say      Moonlight Glade, at night: Sylwen reads the chart
// And the region's own stories: the loggers' grievance, the lost hunter, the
// fox who stole, the brood-mother, a song for the World Tree, the night bloom,
// and the elf origin's homecoming.

export const ACT4_CHAIN = ['the-marker-stone', 'the-guides-token', 'the-council-of-leaves', 'the-blight', 'the-temple-of-starfall', 'what-the-stars-say'];

const WT = SITES.worldTree;

export const ELF_QUESTS: QuestDef[] = [
  {
    id: 'the-marker-stone', title: 'The Marker Stone', giver: 'corwen', region: 'verdantElves', main: true,
    summary: 'The elves have closed the Greenwood Road with a marker stone north of Thornwick. Corwen Ashford wants it open; Nimri the guide knows the elves’ ways.',
    offer: 'You’ve seen the stone across the road north of here? The elves put it there in spring. Nobody passes into the woods without their leave, they say. My loggers can’t reach the good timber and my village is starving for trade. You’re the Crown’s champion, they tell me. Talk to Nimri, by the Rest. She’s half elf. She’ll know how to get their leave.',
    acceptLabel: 'I’ll get the road open.',
    stages: [
      { note: 'Ask Nimri, the guide by the Woodsman’s Rest, how to get the elves’ leave.', objectives: [{ type: 'talk', npc: 'nimri', text: 'Ask Nimri about the elves', reply: 'How do I get past the marker stone?', say: 'You ask the sentinel. Politely. Aelrin has stood at that stone since before Corwen’s grandfather felled his first oak. He’ll want you to prove you’re not another axe. Either drive the charcoal burners out of the old pits east of the road, they’ve been felling marked trees, or bring Thornwick’s peace-gift and I’ll speak for you.' }] },
      { note: 'Speak to the elven sentinel at the marker stone, north of Thornwick.', objectives: [{ type: 'talk', npc: 'aelrin', text: 'Speak to the sentinel at the marker stone', reply: 'I want to walk the Greenwood Road.', say: 'Many want to. Few ask. The forest has been cut, human: marked trees, felled for charcoal in the old pits, and your woodcutters’ stones moved to suit them. Show me you are not another axe. Drive the burners from the pits, or come back with Thornwick’s apology in your hands and Nimri at your side.' }] },
      { note: 'Prove yourself: drive Gant the Burner from the charcoal pits, or bring Thornwick’s peace-gift with Nimri.', objectives: [{ type: 'signal', id: 'marker-proven', text: 'Defeat Gant the Burner at the pits, or carry the peace-gift with Nimri', at: SITES.pits }] },
      { note: 'Return to Sentinel Aelrin at the marker stone.', objectives: [{ type: 'talk', npc: 'aelrin', text: 'Return to the sentinel', reply: 'It’s done.', say: 'It is. The forest heard it before I did. Walk the road, then, and walk softly. Past the stone the woods are older, and they do not love strangers: keep to the path, or find a guide.' }] },
    ],
    done: 'The sentinel rolls the fallen trunk aside. The Greenwood Road is open.',
    rewards: { gold: 160, xp: 420, items: [['elvenWaybread', 3]] },
  },
  {
    id: 'the-guides-token', title: 'The Guide’s Token', giver: 'aelrin', region: 'verdantElves', main: true, requires: ['the-marker-stone'],
    summary: 'To walk the Lost Woods freely you need the trust of Silverbough, a village hidden among three great trees. Only a guide can find it.',
    offer: 'The road is yours. The woods are not. East of the road, among three great trees, is Silverbough: our oldest village nearest your kind. Earn their trust and they will give you a token the forest knows. You will not find it alone. Hire Nimri; she knows the way.',
    acceptLabel: 'I’ll find Silverbough.',
    stages: [
      { note: 'Find Silverbough, hidden east of the Greenwood Road (hire Nimri in Thornwick as a guide).', objectives: [{ type: 'reach', at: SITES.silverbough, radius: 34, text: 'Find Silverbough (with a guide)' }] },
      { note: 'Speak to Elder Caelith of Silverbough.', objectives: [{ type: 'talk', npc: 'caelith', text: 'Speak to Elder Caelith', reply: 'Aelrin sent me.', say: 'A human who came with a guide and not an axe. Sit. Our spring is sick with spiders, and the loggers of Thornwick want our Hollow Grove. Clear the one and settle the other, and Silverbough will know your name.' }] },
      { note: 'Drive the spiders from Silverbough’s spring.', objectives: [{ type: 'kill', kind: 'forestSpider', count: 5, text: 'Kill the spiders at the spring', at: SITES.spring, radius: 70 }] },
      { note: 'Settle the quarrel over the Hollow Grove: speak with Corwen in Thornwick.', objectives: [{ type: 'signal', id: 'quarrel-settled', text: 'Settle the loggers’ quarrel (Corwen, in Thornwick)' }] },
      { note: 'Return to Elder Caelith.', objectives: [{ type: 'talk', npc: 'caelith', text: 'Return to Elder Caelith', reply: 'The quarrel is settled.', say: 'So it is, one way or the other. Take this: a silver leaf. The forest knows it. Where you carry it, the paths will not turn you round. Go to the Sanctum, child. The Council of Leaves will want to see you.', give: [['guidesToken', 1]] }] },
    ],
    done: 'Silverbough trusts you. With the Guide’s Token the Lost Woods let you walk where you will.',
    rewards: { gold: 220, xp: 700 },
  },
  {
    id: 'the-council-of-leaves', title: 'The Council of Leaves', giver: 'caelith', region: 'verdantElves', main: true, requires: ['the-guides-token'],
    summary: 'The Council of Leaves in the Elven Sanctum knows of the Sunwheel. They call it the Turning, and they want to know what you are.',
    offer: 'The Sanctum lies where the Greenwood Road ends, in the roots and branches of the World Tree. Elder Lirael speaks for the Council. She has asked for you by name, which she has not done for a human in three hundred years.',
    acceptLabel: 'To the Sanctum.',
    stages: [
      { note: 'Follow the Greenwood Road to the Elven Sanctum.', objectives: [{ type: 'reach', at: WT, radius: 130, text: 'Reach the Elven Sanctum' }] },
      { note: 'Speak to Elder Lirael Moonwhisper in the Council hall.', objectives: [{ type: 'talk', npc: 'lirael', text: 'Speak to Elder Lirael in the Council hall', reply: 'You asked for me.', say: 'We did. The wheel has turned four times since the Sanctum was planted, and each time someone came through: a woman of the deserts, a smith, a child, a king. You are the fifth. The Council wants to know what you are. So do I. Look into the moon-pool at the tree’s foot. It shows the summoned what they would rather not see.' }] },
      { note: 'Look into the moon-pool below the Sanctum.', objectives: [{ type: 'signal', id: 'moonpool-seen', text: 'Look into the moon-pool', at: SITES.moonPool }] },
      { note: 'Tell Elder Lirael what the moon-pool showed you.', objectives: [{ type: 'talk', npc: 'lirael', text: 'Tell Lirael what you saw', reply: 'A wheel of stars, turning. And me, in its spokes.', say: 'Then you are what we feared and what we hoped. The Turning. Our oldest songs say the wheel-cutters counted it by the stars, and left the count in the Temple of Starfall, under the oldest grove. But the grove is dying. Something there has gone wrong.' }] },
    ],
    done: 'The Council of Leaves has named you a guest of the Sanctum.',
    rewards: { gold: 260, xp: 800, items: [['moonblossomTonic', 2]] },
  },
  {
    id: 'the-blight', title: 'The Blight', giver: 'lirael', region: 'verdantElves', main: true, requires: ['the-council-of-leaves'],
    summary: 'The Blighted Elder, a great tree gone wrong, is killing the oldest grove where the Temple of Starfall stands.',
    offer: 'Follow the Oldest Way from the Sanctum, through the Ancient Forest, to the oldest grove. A tree there was old when the wheel-cutters were young. It has turned. Its rot spreads a little further every night, and the Temple’s door is in its roots. We cannot kill one of our eldest. You can.',
    acceptLabel: 'I’ll end it.',
    stages: [
      { note: 'Follow the Oldest Way to the oldest grove and fell the Blighted Elder.', objectives: [{ type: 'kill', kind: 'blightedElder', count: 1, text: 'Fell the Blighted Elder', at: SITES.elderGrove, radius: 120 }] },
      { note: 'Return to Elder Lirael at the Sanctum.', objectives: [{ type: 'talk', npc: 'lirael', text: 'Return to Elder Lirael', reply: 'The Elder is dead.', say: 'We felt it fall. Every tree in the Sanctum shivered. It was right, and it was terrible, and we thank you. The Temple’s door is open now. Go down, summoned one. Find the count.' }] },
    ],
    done: 'The oldest grove is quiet. The rot is draining from the soil.',
    rewards: { gold: 420, xp: 1500, items: [['heartwood', 2]] },
  },
  {
    id: 'the-temple-of-starfall', title: 'The Temple of Starfall', giver: 'lirael', region: 'verdantElves', main: true, requires: ['the-blight'],
    summary: 'Under the oldest grove the Temple of Starfall keeps what the wheel-cutters counted: the turning of the Sunwheel, written in the stars.',
    offer: 'Two floors of grown stone and roots, the Script on every wall, and a light that must be led. At the bottom, the songs say, is a chart of the stars that matches your Sunwheel. Bring it to me.',
    acceptLabel: 'Into the Temple.',
    stages: [
      { note: 'Enter the Temple of Starfall, in the hillside of the oldest grove.', objectives: [{ type: 'signal', id: 'temple-entered', text: 'Enter the Temple of Starfall', at: SITES.temple }] },
      { note: 'Reach the Temple’s depths and defeat its guardian.', objectives: [{ type: 'kill', kind: 'templeGuardian', count: 1, text: 'Defeat the Temple’s guardian' }] },
      { note: 'Take the star-chart from the Temple’s heart.', objectives: [{ type: 'collect', item: 'starChart', count: 1, text: 'Take the star-chart' }] },
      { note: 'Bring the star-chart to Elder Lirael.', objectives: [{ type: 'talk', npc: 'lirael', text: 'Show Lirael the star-chart', reply: 'The chart of the wheel-cutters.', say: 'Twelve spokes, and the stars set in them like a calendar. I can read it as far as the trees. Not further. Sylwen can: she has counted the stars at Moonlight Glade for four hundred years. Take it to her, at night, when the moonblossoms open.' }] },
    ],
    done: 'The star-chart of the wheel-cutters is yours.',
    rewards: { gold: 500, xp: 1800, items: [['spiritAmber', 1]] },
  },
  {
    id: 'what-the-stars-say', title: 'What the Stars Say', giver: 'lirael', region: 'verdantElves', main: true, requires: ['the-temple-of-starfall'],
    summary: 'Sylwen Starwatcher reads the stars at Moonlight Glade, far to the east. Under the moonblossoms she can read the wheel-cutters’ chart.',
    offer: 'Moonlight Glade lies far to the east, on the shore of the lake. Go at night. Sylwen does not wake for the sun.',
    acceptLabel: 'To Moonlight Glade.',
    stages: [
      { note: 'Travel east to Moonlight Glade.', objectives: [{ type: 'reach', at: SITES.glade, radius: 36, text: 'Reach Moonlight Glade' }] },
      { note: 'Wait for night, and show Sylwen the chart under the moonblossoms.', objectives: [
        { type: 'hour', from: 21, to: 4, text: 'Wait for night (after nine)' },
        { type: 'talk', npc: 'sylwen', text: 'Show Sylwen the star-chart', reply: 'Lirael sent me with this.', take: [['starChart', 1]], say: 'Hold it up. There. The twelfth spoke points to that star, low over the mountains, and the eleventh to the one that sets over the desert. The wheel-cutters counted the Turning at three places: here, under the mountains, and beneath the sand. The next mark is in the deep halls the dwarves have stopped speaking of. And the last is in the Golden Expanse, under the dunes. Go and find them, summoned one. The wheel is nearly round.' },
      ] },
    ],
    done: 'ACT IV, PART ONE ENDS — What the Stars Say. The next marks wait under the mountains and beneath the sand.',
    rewards: { gold: 600, xp: 2200, items: [['starfallBow', 1]] },
  },

  // ---- the region's own stories -------------------------------------------------------------------
  {
    id: 'loggers-grievance', title: 'The Loggers’ Grievance', giver: 'corwen', region: 'verdantElves', requires: ['the-marker-stone'],
    summary: 'Thornwick’s mill needs ironbark for a new saw-frame, and the good ironbark grows past the marker stone.',
    offer: 'Old Hesk’s saw-frame cracked. Oak won’t hold the new blade; ironbark will, and ironbark grows past the stone, in the Inner Forest. You’ve the elves’ leave now. Take one of Hesk’s axes and bring him three lengths. Careful which trees you cut. Some of them, the elves say, are not trees.',
    acceptLabel: 'Three lengths of ironbark.',
    stages: [
      { note: 'Borrow a felling axe from Old Hesk at the mill.', objectives: [{ type: 'talk', npc: 'hesk', text: 'Borrow an axe from Old Hesk', reply: 'Corwen says you need ironbark.', say: 'Here. Sharp as the day I ground it. Ironbark’s grey-black, smooth, and it rings when you knock it. If it groans, run.', give: [['woodsmansAxe', 1]] }] },
      { note: 'Cut three lengths of ironbark in the Inner Forest and bring them to Hesk.', objectives: [{ type: 'deliver', npc: 'hesk', item: 'ironbark', count: 3, text: 'Bring 3 ironbark to Old Hesk', say: 'Rings like a bell. Good. The mill turns again. Keep the axe, you’ve earned the right to it.' }] },
    ],
    done: 'Thornwick Mill has a new saw-frame of ironbark.',
    rewards: { gold: 180, xp: 380 },
  },
  {
    id: 'lost-hunter', title: 'The Lost Hunter', giver: 'marta', region: 'verdantElves', requires: ['the-marker-stone'],
    summary: 'Tobin Fenn followed a white stag into the Lost Woods three days ago and has not come back.',
    offer: 'Tobin went after a white stag, three days gone, past the stone. He knows better than to leave the path. He did anyway. If you’ve a way through those woods, bring him home. Please.',
    acceptLabel: 'I’ll find him.',
    stages: [
      { note: 'Find Tobin in the Lost Woods, west of the Greenwood Road (you’ll need a guide or the token).', objectives: [{ type: 'reach', at: SITES.lostHunter, radius: 14, text: 'Find Tobin in the Lost Woods' }] },
      { note: 'Talk to Tobin.', objectives: [{ type: 'talk', npc: 'tobin', text: 'Talk to Tobin', reply: 'Marta sent me. Follow me out.', say: 'Marta! Gods, three days. Every way I walk brings me back to this log. Lead on, I’ll keep your heels in sight.' }] },
      { note: 'Tell Marta that Tobin is safe.', objectives: [{ type: 'talk', npc: 'marta', text: 'Tell Marta', reply: 'Tobin’s on his way home.', say: 'He’s through the gate, muddy as a hog and grinning. Thank you. Here: the best hide we’ve had all year, and coin besides.' }] },
    ],
    done: 'Tobin Fenn is home in Thornwick.',
    rewards: { gold: 140, xp: 420, items: [['elvenWaybread', 2]] },
  },
  {
    id: 'fox-who-stole', title: 'The Fox Who Stole', giver: 'lisse', region: 'verdantElves', requires: ['the-guides-token'],
    summary: 'A spirit fox stole the silver bell from Silverbough’s spring-shrine. Follow it to its glade.',
    offer: 'The fox took the spring’s bell. Not to sell it; foxes don’t sell. It likes the sound. Follow it when you see it near the spring, and it will lead you to where it keeps its treasures. Don’t hurt it.',
    acceptLabel: 'I’ll follow the fox.',
    stages: [
      { note: 'Follow the spirit fox from the spring to its hidden glade.', hook: 'elves:foxLead', objectives: [{ type: 'signal', id: 'fox-followed', text: 'Follow the spirit fox to its glade', at: SITES.foxGlade }] },
      { note: 'Find the bell among the fox’s treasures.', objectives: [{ type: 'collect', item: 'silverBell', count: 1, text: 'Find the silver bell', at: SITES.foxGlade }] },
      { note: 'Return the bell to Lisse at the spring.', objectives: [{ type: 'deliver', npc: 'lisse', item: 'silverBell', count: 1, text: 'Return the bell to Lisse', say: 'There it is. Listen: the spring is singing again. The fox will be back, it always is. Let it. A spring with a fox is luckier than one without.' }] },
    ],
    done: 'The spring’s bell rings again.',
    rewards: { gold: 90, xp: 320, items: [['moonblossom', 2]] },
  },
  {
    id: 'webs-in-the-spring', title: 'Webs in the Spring', giver: 'lisse', region: 'verdantElves', requires: ['the-guides-token'],
    summary: 'The spiders you drove from the spring came from a brood-mother in a hollow to the south-west, near the Ancient Forest.',
    offer: 'The spiders will come back. They come from a hollow where the old trees begin, past the lost hunter’s trail. A mother there, big as a cart. Without her, no more webs.',
    acceptLabel: 'I’ll find the brood-mother.',
    stages: [
      { note: 'Kill the brood-mother in her hollow.', objectives: [{ type: 'kill', kind: 'spiderQueen', count: 1, text: 'Kill the brood-mother', at: SITES.spiderHollow, radius: 90 }] },
      { note: 'Tell Lisse the hollow is clear.', objectives: [{ type: 'talk', npc: 'lisse', text: 'Tell Lisse', say: 'Then the spring is safe for a generation. Silverbough will sing about this. Badly, at first.' }] },
    ],
    done: 'No more webs in Silverbough’s spring.',
    rewards: { gold: 260, xp: 900, items: [['moonweave', 1]] },
  },
  {
    id: 'song-for-the-world-tree', title: 'A Song for the World Tree', giver: 'ellisande', region: 'verdantElves', requires: ['the-council-of-leaves'],
    summary: 'Ellisande, keeper of the Archive of Songs, wants three moonblossoms to sing the World Tree’s night-song at its roots.',
    offer: 'Once a year someone sings to the World Tree at its roots, with moonblossoms in their hands. This year I would like it to be you. Bring me three moonblossoms, they open at night, and then come to the roots after dark.',
    acceptLabel: 'I’ll sing. Badly.',
    stages: [
      { note: 'Bring Ellisande three moonblossoms (they open at night).', objectives: [{ type: 'deliver', npc: 'ellisande', item: 'moonblossom', count: 3, text: 'Bring 3 moonblossoms to Ellisande', say: 'Perfect. Now: the roots, after dark.' }] },
      { note: 'After dark, stand among the World Tree’s roots.', objectives: [
        { type: 'hour', from: 20, to: 4, text: 'Wait for dark' },
        { type: 'reach', at: [WT[0] + 30, WT[1] + 20], radius: 14, text: 'Stand among the World Tree’s roots' },
      ] },
      { note: 'Return to Ellisande.', objectives: [{ type: 'talk', npc: 'ellisande', text: 'Return to Ellisande', say: 'I heard it from up here. The tree hummed back. It has not done that in a hundred years.' }] },
    ],
    done: 'The World Tree hummed back.',
    rewards: { gold: 120, xp: 500, items: [['moonweaveCloak', 1]] },
  },
  {
    id: 'night-bloom', title: 'The Night Bloom', giver: 'sylwen', region: 'verdantElves',
    summary: 'Sylwen needs five moonblossoms picked at night to ink her star-maps.',
    offer: 'My ink is made of moonblossom, and I am out. Five, picked when they are open. The glade is full of them, after dark.',
    acceptLabel: 'Five moonblossoms.',
    stages: [{ note: 'Pick five moonblossoms at night and bring them to Sylwen.', objectives: [{ type: 'deliver', npc: 'sylwen', item: 'moonblossom', count: 5, text: 'Bring 5 moonblossoms to Sylwen', say: 'Lovely. Tonight I’ll draw the wheel again, in silver.' }] }],
    done: 'Sylwen has her ink.',
    rewards: { gold: 110, xp: 300, items: [['moonblossomTonic', 2]] },
  },
  {
    id: 'a-name-among-the-leaves', title: 'A Name Among the Leaves', giver: '__elfOrigin', region: 'verdantElves',
    summary: 'You are an elf, and the Sanctum is your homeland. Somewhere in the Archive of Songs is the song of your family.',
    offer: 'You have come home, though you do not remember it.',
    stages: [
      { note: 'Ask Ellisande to find your family’s song in the Archive of Songs.', objectives: [{ type: 'talk', npc: 'ellisande', text: 'Ask Ellisande about your family', reply: 'Is my family in the archive?', say: 'Every elf is. Give me a moment. Here: a line of wardens, of Silverbough, who went south a hundred years ago and did not come back. You came back.' }] },
      { note: 'Visit Silverbough, where your family lived.', objectives: [{ type: 'reach', at: SITES.silverbough, radius: 34, text: 'Visit Silverbough' }] },
      { note: 'Tell Elder Lirael you found your name.', objectives: [{ type: 'talk', npc: 'lirael', text: 'Tell Lirael', say: 'Then the Council will write it again, beside the ones who went before. Welcome home.' }] },
    ],
    done: 'Your name is written again among the leaves.',
    rewards: { gold: 100, xp: 600, items: [['heartwoodTalisman', 1]] },
  },
];

/** Where the marker stone stands (quest markers and tests). */
export const MARKER_AT = GATE_AT;
