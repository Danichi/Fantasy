import type { QuestDef } from '../quests/questLog';

// Personal quests (NPC overhaul, phase 2): things the written characters only
// ask of a friend, drawn from what they want and what they hide. A giver
// offers theirs once they count you a friend (social/wiring.ts hides it
// until then). Finishing one is a favour they won't forget.

const talk = (npc: string, text: string, reply: string, say: string) => ({ type: 'talk' as const, npc, text, reply, say });

export const PERSONAL_QUESTS: QuestDef[] = [
  {
    id: 'pq:froest', title: 'The Starmetal Blade', giver: 'froest', region: 'cresha',
    summary: 'Fröst has dreamed of one blade for thirty years. He needs a single ingot of starmetal to make it.',
    offer: 'I\'ll tell you something I don\'t tell many. Thirty years I\'ve had a blade in my head. Every line of it. All I need is starmetal, one ingot, and I\'ve never once seen it for sale. If you ever find some... bring it to me. I\'ll make it for you. It\'s yours, not mine. I just want to see it real.',
    acceptLabel: 'If I find starmetal, it\'s yours.',
    stages: [{ note: 'Find an ingot of starmetal and bring it to Fröst.', objectives: [{ type: 'deliver', npc: 'froest', item: 'starmetal', count: 1, text: 'Bring Fröst an ingot of starmetal', say: 'That\'s it. That\'s really it. Give me three days and don\'t come near the forge.' }] }],
    done: 'There. Thirty years. Take it, and don\'t you dare hang it on a wall.',
    rewards: { gold: 120, xp: 400, items: [['knightSword', 1]] },
  },
  {
    id: 'pq:pip', title: 'A Real Sword (Sort Of)', giver: 'pip', region: 'cresha',
    summary: 'Pip wants a real sword. Bram the carpenter might be persuaded to make a safe one.',
    offer: 'Can you get me a sword? A REAL one? ...Mum says no. Mum says no to everything. But Bram makes shields! Maybe he could make a sword. A wooden one. That\'s nearly real.',
    acceptLabel: 'I\'ll ask Bram.',
    stages: [
      { note: 'Ask Bram Oakhand to make Pip a wooden sword.', objectives: [talk('carpenter', 'Ask Bram about a sword for Pip', 'Pip wants a sword.', 'A sword? For Pip? Gods help us. ...All right. Blunt edges, round tip, and I\'m telling his mother. Here.')] },
      { note: 'Give Pip the wooden sword.', objectives: [talk('pip', 'Give Pip the wooden sword', 'From Bram. Be careful with it.', 'IT\'S PERFECT! I\'m going to call it Wolfbiter. No, Dragonbane. No... Wolfbiter. Thank you thank you thank you!')] },
    ],
    done: 'You\'re my best friend now. Sorry, Nell.',
    rewards: { gold: 10, xp: 80 },
  },
  {
    id: 'pq:kaela', title: 'The Rematch', giver: 'kaela', region: 'cresha',
    summary: 'Kaela lost a duel to Master Veyr when she was twenty. He doesn\'t remember it. She wants a rematch.',
    offer: 'You\'ve earned this, so I\'ll say it once. I lost to Veyr, years ago. He doesn\'t even remember. I want a rematch, but I won\'t beg the man. Ask him for me. Make it sound like his idea.',
    acceptLabel: 'I\'ll talk to Veyr.',
    stages: [
      { note: 'Ask Master Veyr if he\'ll cross blades with Kaela.', objectives: [talk('veyr', 'Ask Veyr about a bout with Kaela', 'Kaela Voss would like a bout.', 'Kaela. Yes, I remember. Quick, too quick. I wondered when she would ask. Tell her dawn, at the yard. Tell her I have been waiting.')] },
      { note: 'Tell Kaela.', objectives: [talk('kaela', 'Tell Kaela what Veyr said', 'He remembers. Dawn, at the yard.', 'He... remembers? Dawn. Right. Right. I need to oil my blade. I need to sleep. I won\'t sleep.')] },
    ],
    done: 'Whatever happens at dawn: thank you.',
    rewards: { gold: 60, xp: 150 },
  },
  {
    id: 'pq:brannoc', title: 'The Captain\'s Letter', giver: 'brannoc', region: 'cresha',
    summary: 'Brannoc has written a letter asking to retire, three times. He wants someone to tell Mara before he tears it up again.',
    offer: 'I\'ve a letter here. Retirement. Third time I\'ve written it. Every time the horn goes I tear it up. Take it to Mara at the Wayfarer. If she reads it, I can\'t take it back. That\'s the point.',
    acceptLabel: 'I\'ll take it to her.',
    stages: [
      { note: 'Take Brannoc\'s letter to Mara Bell at the inn.', objectives: [talk('innkeeper', 'Give Mara the captain\'s letter', 'From Brannoc. He wanted you to read it.', 'He wrote this? Him? ...Oh, you great daft man. Tell him yes. Tell him I\'ve had a room upstairs ready for five years.')] },
      { note: 'Tell Brannoc what Mara said.', objectives: [talk('brannoc', 'Go back to Brannoc', 'She said yes. And there\'s a room upstairs.', 'Did she. ...Did she now. Well. After the harvest, then. After the harvest.')] },
    ],
    done: 'If you ever want the Watch, it\'s yours. I mean that.',
    rewards: { gold: 80, xp: 150 },
  },
  {
    id: 'pq:lyssa', title: 'A Bow of Yew', giver: 'lyssa', region: 'cresha',
    summary: 'Lyssa wants a yew bow before she goes north alone, and hasn\'t told Rook she\'s leaving.',
    offer: 'I\'m going north. Alone. I haven\'t told Rook. Before I go I want a proper bow, a yew one, and I need the wood. Three good staves. And then... maybe you could be there when I tell him.',
    acceptLabel: 'I\'ll find the yew.',
    stages: [
      { note: 'Bring Lyssa three pieces of yew wood.', objectives: [{ type: 'deliver', npc: 'lyssa', item: 'yewWood', count: 3, text: 'Bring Lyssa 3 yew wood', say: 'Good grain. Good. I\'ll have it strung by the week\'s end.' }] },
      { note: 'Be there when Lyssa tells Rook.', objectives: [talk('rook', 'Talk to Rook with Lyssa', 'Lyssa has something to tell you.', 'North? Alone? ...You could have just said. I\'d have come. ...I know, I know. Your road. Write, then. Every month. And shoot something big.')] },
    ],
    done: 'That went better than I deserved. Thank you for standing there.',
    rewards: { gold: 70, xp: 160, items: [['healthPotion', 2]] },
  },
  {
    id: 'pq:maud', title: 'The Chronicle of the Glen', giver: 'maud', region: 'cresha',
    summary: 'Elder Maud wants the old stories for her chronicle, from the people who remember them.',
    offer: 'My chronicle has a hole in it: the hard winter, forty years back. The people who lived through it are getting old. Would you ask Wren, Tom Hale and Dora what they remember? Their words, not mine.',
    acceptLabel: 'I\'ll gather the stories.',
    stages: [
      { note: 'Ask Wren, Tom Hale and Dora about the hard winter.', objectives: [
        talk('wren', 'Ask Old Wren about the hard winter', 'Maud asked about the hard winter.', 'The hard winter. We ate the seed corn. Then we ate the seed corn\'s seed corn. My father walked to Millbrook in snow to his waist for a sack of oats. He came back with two.'),
        talk('hale', 'Ask Tom Hale about the hard winter', 'Do you remember the hard winter?', 'I was a boy. We brought the cows into the house to keep warm. Mother never forgave the smell. I loved it.'),
        talk('dora', 'Ask Dora about the hard winter', 'What do you remember of the hard winter?', 'A sack went missing from the granary. I knew who took it. They had children. I wrote down that the rats got it. Don\'t put that in the chronicle. ...Put it in. It\'s true.'),
      ] },
      { note: 'Bring the stories back to Maud.', objectives: [talk('maud', 'Take the stories to Elder Maud', 'Here are the stories.', 'Oh. Oh, these are good. These are real. Dora said that? She never told me. ...Thank you. This is the best chapter.')] },
    ],
    done: 'You\'re in the chronicle now too, you know. I\'ve been kind.',
    rewards: { gold: 60, xp: 200 },
  },
  {
    id: 'pq:baker', title: 'Fit for a King', giver: 'baker', region: 'cresha',
    summary: 'Tessa wants to bake for the king\'s table. A honey-oat loaf might get her noticed; she needs honeycomb.',
    offer: 'I\'ve a plan. Don\'t laugh. The Gilded Stag in the Capital serves the court on feast days. If I can get a honey-oat loaf onto that table... I need honeycomb. Five good combs.',
    acceptLabel: 'Five combs. I\'m on it.',
    stages: [{ note: 'Bring Tessa five honeycombs.', objectives: [{ type: 'deliver', npc: 'baker', item: 'honeycomb', count: 5, text: 'Bring Tessa 5 honeycomb', say: 'Look at the colour on these. Oh, the king won\'t know what hit him.' }] }],
    done: 'One day the king will eat my bread. And you\'ll know you helped.',
    rewards: { gold: 70, xp: 120, items: [['apple', 4]] },
  },
  {
    id: 'pq:magus', title: 'The Sealed Shelf', giver: 'magus', region: 'cresha',
    summary: 'Magus Orren has never opened the sealed shelf in his tower. He suspects Archmage Isolde Venn knows what\'s on it.',
    offer: 'There is a sealed shelf in my library. I have never opened it. I have a suspicion who sealed it, and she sits at the head of the Arcane Collegium in the Capital. Ask Isolde Venn what she put there. I would ask her myself, but we parted badly.',
    acceptLabel: 'I\'ll go to the Collegium.',
    stages: [
      { note: 'Ask Archmage Isolde Venn in the Royal Capital about the sealed shelf.', objectives: [talk('archmage', 'Ask Isolde Venn about Orren\'s sealed shelf', 'Magus Orren asks what you sealed on his shelf.', 'He asked. After forty years. ...His own notes. From before he left. He wrote down how to open the way the Dark comes through, and then he asked me to make him forget. Tell him that. Tell him he was right to ask.')] },
      { note: 'Tell Magus Orren what Isolde said.', objectives: [talk('magus', 'Go back to Magus Orren', 'Isolde says it\'s your own notes. You asked her to make you forget.', 'My own... Of course. Of course it was. I am less afraid now, which is strange. Thank you.')] },
    ],
    done: 'I may open it. Not yet. But I may.',
    rewards: { gold: 100, xp: 250, items: [['manaPotion', 3]] },
  },
  {
    id: 'pq:corvina', title: 'Paste and Pearls', giver: 'corvina', region: 'portAurelle',
    summary: 'Lady Corvina\'s jewels are paste. Two real pearls would let her face the season.',
    offer: 'You may as well know, since you notice things. The jewels are paste. All of them. The season opens soon and Vesper Caul will look at my throat and know. Two real pearls. That\'s all. I\'ll pay what I can.',
    acceptLabel: 'Two pearls. I\'ll find them.',
    stages: [{ note: 'Bring Lady Corvina two pearls.', objectives: [{ type: 'deliver', npc: 'corvina', item: 'pearl', count: 2, text: 'Bring Lady Corvina 2 pearls', say: 'Real. They\'re real. I\'d forgotten how they catch the light.' }] }],
    done: 'House Aurelle remembers its friends. There are very few of them. You\'re one.',
    rewards: { gold: 150, xp: 160 },
  },
  {
    id: 'pq:gawen', title: 'The Poem in the Boot', giver: 'gawen', region: 'royalCapital',
    summary: 'Ser Gawen has written a poem for Lark, the bard of the Gilded Stag, and keeps it in his boot.',
    offer: 'I have a... document. A poem. For Lark, at the Gilded Stag. It has been in my boot for a month. I cannot give it to her. I have faced charging horse with less fear. Would you?',
    acceptLabel: 'Give me the poem.',
    stages: [
      { note: 'Give Ser Gawen\'s poem to Lark at the Gilded Stag.', objectives: [talk('lark', 'Give Lark Ser Gawen\'s poem', 'From Ser Gawen. He wrote it for you.', 'Gawen wrote this? The serious one with the lance? ...It doesn\'t scan at all. It\'s the loveliest thing anyone\'s ever given me. Tell him to come and hear me sing it.')] },
      { note: 'Tell Ser Gawen.', objectives: [talk('gawen', 'Go back to Ser Gawen', 'She loved it. She wants you to hear her sing it.', 'She... I must polish my armour. I must... thank you. I owe you a debt of honour.')] },
    ],
    done: 'If ever you need a lance beside you, send for me.',
    rewards: { gold: 80, xp: 140 },
  },
];
