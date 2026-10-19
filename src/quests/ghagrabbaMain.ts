import type { QuestDef, QuestLog } from './questLog';
import { SAWTOOTH_BASIN, WARDEN_AT } from '../world/desert/goldenExpanse';
import { GREAT_WELL, BONE_WELLS, DIG_SHAFT, EAST_GATE, WEST_GATE_OUT, SALTREACH, SETHI_CAPTIVE, GLASS_SPIRE, SUNKEN, GNASHERS_DEN } from '../world/desert/ghagrabbaPlaces';

// The Sunborn: Ghagrabba's own story, beside Cresha's. The Great Well is
// dying; someone is digging under the city for old Amaunet, the buried
// kingdom the Sunborn took their city from; the Vizier has been feeding the
// dig with scavengers and the Queen's water, and means to wear a dead king's
// crown. Seven chapters, each handing on to the next, from the Sun Throne to
// the Sunken Gate, ending in a choice about who the crown belongs to.

export const SUNBORN_CHAIN = ['sb-1', 'sb-2', 'sb-3', 'sb-4', 'sb-5', 'sb-6', 'sb-7'];

const R = 'Golden Expanse';

export const SUNBORN_QUESTS: QuestDef[] = [
  {
    id: 'sb-1', title: 'The Sunborn I: The Thirsting Throne', giver: 'hassun', region: R, main: true, requires: ['silk-road-west'],
    summary: 'The palace has been asking after the outlander who carried Zarek\'s letter. Queen Neferah of Ghagrabba wants to see you.',
    offer: 'Herald Meryre has been round the bazaar twice asking for "the outlander with Zarek\'s letter". When the palace asks twice, friend, you go. The Palace of the Sun — west across the Court, you cannot miss it, it is the gold one.',
    acceptLabel: 'I\'ll answer the summons.',
    stages: [
      { note: 'Answer the Queen\'s summons at the Palace of the Sun.', objectives: [{ type: 'talk', npc: 'meryre', text: 'Speak with Herald Meryre (the Palace of the Sun)', reply: 'I was told the Queen wishes to see me.', say: 'You are the outlander. Good. Her Radiance is on the Sun Throne. Approach with your head bowed and your hands empty, and do not speak until she does. ...She will not wait for you to finish bowing, so be quick about it.' }] },
      { note: 'Kneel before Queen Neferah.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Present yourself to Queen Neferah on the Sun Throne', reply: 'You sent for me, Your Radiance.', say: 'I did. Look at my court: gold to the ceiling, and the Great Well in my own forecourt has dropped six cubits since the new moon. In my grandmother\'s day the well sang when you dropped a stone in it. Now it clicks. My Vizier says the scavengers are tunnelling under the walls to steal our water. My mother says my Vizier is a liar. I want an answer from someone who owes nobody in this city anything. Go down to the Great Well in the Court of the Sun and tell me what you find.' }] },
      { note: 'Examine the Great Well in the Court of the Sun.', objectives: [{ type: 'signal', id: 'sb-well', text: 'Examine the Great Well (the Court of the Sun)', at: GREAT_WELL }] },
      { note: 'Ask the scavengers about the digger\'s tag.', objectives: [{ type: 'talk', npc: 'rusk', text: 'Show the digger\'s tag to Old Rusk (the Rust Market)', reply: 'I found this at the bottom of the Queen\'s well.', say: 'Hm. Know it? Course I know it. That\'s a crew tag — purple eye, see. Somebody pays our people in water to dig at night, under the city and out under the dunes. Pays well, asks no questions, and doesn\'t much care if they come back up. The crews go down at the Bone Wells, south of the walls. Last month eleven went down. Seven came up.' }] },
    ],
    done: 'If you\'re going to the Bone Wells, take these. And if anyone asks, you never heard the word "eye" from me.',
    rewards: { gold: 120, xp: 320, items: [['healthPotion', 3]] },
  },
  {
    id: 'sb-2', title: 'The Sunborn II: Diggers in the Dark', giver: 'rusk', region: R, main: true, requires: ['sb-1'],
    summary: 'Somebody is paying scavengers to dig under the Expanse, and the crews go down at the Bone Wells. Find out what they are digging for.',
    offer: 'You want to know who\'s drinking the Queen\'s well? Go and look down the hole they\'re drinking it through.',
    stages: [
      { note: 'Go to the Bone Wells, south of the city.', objectives: [{ type: 'reach', at: BONE_WELLS, radius: 45, text: 'Go to the Bone Wells (south of the city)' }] },
      { note: 'The dig is guarded by men in purple sashes. Drive them off.', hook: 'sb:dig', objectives: [
        { type: 'kill', kind: 'enforcer', count: 4, text: 'Drive off the Purple Hand at the dig', at: DIG_SHAFT, radius: 150 },
        { type: 'kill', kind: 'enforcerCaptain', count: 1, text: 'Defeat their overseer', at: DIG_SHAFT, radius: 150 },
      ] },
      { note: 'Search the dig shaft.', hook: 'sb:dig', objectives: [{ type: 'signal', id: 'sb-shaft', text: 'Search the dig shaft at the Bone Wells', at: DIG_SHAFT }] },
      { note: 'Take the gold tablet to Princess Nefret, who reads the old scripts.', objectives: [{ type: 'talk', npc: 'nefret', text: 'Show the tablet to Princess Nefret (the palace)', reply: 'Can you read this? It was in a dead digger\'s hand.', say: '(She turns the tablet to the light and her breath catches.) This is Amaunet. The speech of the kings before ours — nobody has written it in two hundred years. "Here sleeps Amaunet beneath the sand. The Warden keeps the door. The Sun-Eater keeps the king." ...Someone is digging for a buried kingdom under our feet, and drinking our well dry to do it. Grandmother knows the old songs better than any scroll in the Scroll House. Ask her. She will be in Mother\'s chamber, pretending to sleep.' }] },
      { note: 'Ask Queen Mother Tiyet about Amaunet.', objectives: [{ type: 'talk', npc: 'tiyet', text: 'Ask Queen Mother Tiyet about Amaunet (the palace)', reply: 'Nefret says you know the old songs.', say: 'Sit. (She does not look at the tablet for a long while.) When the Sunborn came out of the east, child, this city was already here — half buried, with wells and gods and people of its own. Amaunet. We took the walls and gave them the sand. The scavengers outside are their grandchildren\'s grandchildren. My husband, the old King, wanted to open the gates to them again. He said the dead city would wake if its children were kept from it. A week after he said so in court, he was dead. His cupbearer that year was a clever young man called Ankhet. ...Go to Tarp Row. Old Ta-Nedjem keeps the songs. Show her that tablet.' }] },
    ],
    done: 'And take this. It was his. He would have liked you — he liked anyone who asked questions.',
    rewards: { gold: 200, xp: 520, items: [['oldKingsRing', 1]] },
  },
  {
    id: 'sb-3', title: 'The Sunborn III: Songs of the Sand', giver: 'tiyet', region: R, main: true, requires: ['sb-2'],
    summary: 'Wise Ta-Nedjem of Tarp Row keeps the songs of Amaunet. The songs say the buried city\'s door wants three things before it opens.',
    offer: 'Tarp Row is east of the city, past the Waystop road. Go before the Vizier thinks to.',
    stages: [
      { note: 'Find Wise Ta-Nedjem at Tarp Row.', objectives: [{ type: 'talk', npc: 'elder-13', text: 'Show the tablet to Wise Ta-Nedjem (Tarp Row, east)', reply: 'Queen Mother Tiyet sent me — with this.', say: '(She closes her eyes and sings under her breath before she answers.) "Where the Warden sleeps, the door sleeps." The Warden was Amaunet\'s doorkeeper, and the door wants three things before it opens: the Eye that the shark swallowed, the Heart the Warden carries, and the Tear the storm weeps over the Glass Spire. Bring me those and I will sing you a key. But hear me, outlander. Whoever digs for Amaunet is digging for its king. And its king is not dead. He is only waiting for someone foolish enough to wear his crown.' }] },
      { note: 'Gather the Eye, the Heart and the Tear.', hook: 'sb:pieces', objectives: [
        { type: 'signal', id: 'sb-eye', text: 'Take the Sun-Eye from Old Sawtooth\'s jaw (slay him in the southern basin)', at: [SAWTOOTH_BASIN.x, SAWTOOTH_BASIN.z] },
        { type: 'signal', id: 'sb-heart', text: 'Take the Warden\'s heart-stone (break the Warden, south-west)', at: [WARDEN_AT.x, WARDEN_AT.z] },
        { type: 'signal', id: 'sb-tear', text: 'Catch the Storm\'s Tear at the Glass Spire in a sandstorm (strike its gong)', at: GLASS_SPIRE },
      ] },
      { note: 'Bring the three pieces to Ta-Nedjem.', objectives: [{ type: 'talk', npc: 'elder-13', text: 'Bring the Eye, the Heart and the Tear to Ta-Nedjem', reply: 'The Eye, the Heart and the Tear.', take: [['sunEye', 1], ['wardenHeart', 1], ['stormTear', 1]], give: [['sunkenKey', 1]], say: '(She lays the three on a cloth by the fire and sings over them, low, for a long time. When she lifts her hands they have run together into one thing: a key of gold glass, warm as skin.) The Sunken Gate lies west of the Warden\'s sleep, in the ring of dunes the caravans will not cross. But you will not be the first to want it. The Vizier\'s people have been watching you since the Bone Wells. Go back to the city by the east gate, where there are guards — and keep your hand on your sword.' }] },
    ],
    done: 'Go carefully. The sand remembers everything.',
    rewards: { gold: 300, xp: 800, items: [['greaterHealthPotion', 3]] },
  },
  {
    id: 'sb-4', title: 'The Sunborn IV: The Purple Hand', giver: 'elder-13', region: R, main: true, requires: ['sb-3'],
    summary: 'The Vizier\'s people have been following you. Return to Ghagrabba with the Sunken Key — carefully.',
    offer: 'Back to the city, outlander. Walk in the open.',
    stages: [
      { note: 'Return to Ghagrabba\'s east gate.', objectives: [{ type: 'reach', at: EAST_GATE, radius: 60, text: 'Return to Ghagrabba (the east gate)' }] },
      { note: 'Assassins! Fight off the Purple Hand.', hook: 'sb:ambush', objectives: [{ type: 'kill', kind: 'assassin', count: 5, text: 'Fight off the Purple Hand assassins', at: EAST_GATE, radius: 220 }] },
      { note: 'Search the assassins\' leader.', hook: 'sb:satchel', objectives: [{ type: 'signal', id: 'sb-orders', text: 'Search the fallen assassin\'s satchel', at: EAST_GATE }] },
      { note: 'Take the Vizier\'s orders to Captain Mereth.', objectives: [{ type: 'talk', npc: 'mereth', text: 'Show the orders to Captain Mereth (the east gate)', reply: 'The assassins carried this, under the Vizier\'s seal.', say: '(She reads it twice, and her jaw sets.) "The outlander and the boy, both, before the new moon." The boy. Sethi. The Prince rode out to hunt at Saltreach this morning with two of my guards — the Vizier suggested the place himself. Saltreach is west of the city, out of the west gate. Go. Now. I will see to the palace, and to Ankhet, if he is still in it.' }] },
      { note: 'Find Prince Sethi at Saltreach.', hook: 'sb:captive', objectives: [
        { type: 'kill', kind: 'enforcer', count: 4, text: 'Break the Purple Hand holding the Prince', at: SALTREACH, radius: 150 },
        { type: 'kill', kind: 'enforcerCaptain', count: 1, text: 'Defeat Nebka the Knife', at: SALTREACH, radius: 150 },
      ] },
      { note: 'Free the Prince.', hook: 'sb:captive', objectives: [{ type: 'signal', id: 'sb-sethi-freed', text: 'Cut Prince Sethi\'s bonds', at: SETHI_CAPTIVE }] },
      { note: 'Bring Prince Sethi home to the west gate.', hook: 'sb:escort', objectives: [{ type: 'signal', id: 'sb-sethi-home', text: 'Escort Prince Sethi to the west gate', at: WEST_GATE_OUT }] },
      { note: 'Tell the Queen everything.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Give the Vizier\'s orders to Queen Neferah', reply: 'Your son is home. And this was carried by the men sent to kill him.', take: [['vizierOrders', 1]], say: '(She reads it without expression. Then she reads it again, and for a moment she is not a queen at all.) Thirty years Ankhet has stood at my right hand. He poured my father\'s wine. ...He is gone. Mereth found his chambers empty and the treasury lighter by a third, and his diggers rode south-west at dawn — toward the Warden\'s sands. He has gone to open whatever my well has been dying for.' }] },
    ],
    done: 'You brought my son home. Ghagrabba will not forget it, and I certainly will not. Wear this; my guard will know what it means.',
    rewards: { gold: 450, xp: 1100, items: [['sunGuardSash', 1]], guildRep: 30 },
  },
  {
    id: 'sb-5', title: 'The Sunborn V: Water for the Outcast', giver: 'neferah', region: R, main: true, requires: ['sb-4'],
    summary: 'To follow the Vizier into the deep sand the Sun Guard needs guides, and only the scavengers know the ring of dunes. They have no reason to love the crown.',
    offer: 'My Sun Guard can hold a wall. They cannot find a ring of dunes the caravans will not cross. The sand-folk can — and my family has given them two hundred years of reasons to let us die out there. So we start paying. Herald Meryre has my water-writs: a share of the Great Well for every village that rides with us, sealed in my own hand. Carry them.',
    acceptLabel: 'I\'ll carry your writs.',
    stages: [
      { note: 'Collect the water-writs from Herald Meryre.', objectives: [{ type: 'talk', npc: 'meryre', text: 'Collect the water-writs from Herald Meryre', reply: 'The Queen\'s writs, please.', give: [['waterWrit', 3]], say: 'Three writs, sealed in gold wax. Do you know what these are? Nobody outside the walls has been given a drop of the Great Well since before I was born. ...Carry them carefully.' }] },
      { note: 'Carry the writs to the village elders.', objectives: [
        { type: 'deliver', npc: 'elder-6', item: 'waterWrit', count: 1, text: 'Bring a writ to Old Mother Huy (Dunewatch)', say: 'Water from the Queen\'s own well. (She holds the seal up to the light as if it might be painted on.) I will believe it when it is in my jars. But I will believe it.' },
        { type: 'deliver', npc: 'elder-9', item: 'waterWrit', count: 1, text: 'Bring a writ to Elder Kenamun (Mirage Well)', say: 'A queen who asks instead of taking. Our grandmothers would not have known what to say. Mirage Well will ride.' },
        { type: 'deliver', npc: 'elder-15', item: 'waterWrit', count: 1, text: 'Bring a writ to Elder Ramose (Old Oasis)', say: 'The Old Oasis remembers when we drank from that well. Tell the Queen we have long memories — and that we will come anyway.' },
      ] },
      { note: 'Ask Old Rusk whether the Rust Market will ride.', objectives: [{ type: 'talk', npc: 'rusk', text: 'Ask Old Rusk to guide the Sun Guard', reply: 'The elders have taken the Queen\'s water. Will the Rust Market ride with her?', say: 'Water for promises. We\'ve had promises before. ...Here\'s my price. Gnasher. The Scrap King, in his den down south — he\'s been selling our people to Ankhet\'s crews by the head. Kill him and the Rust Market rides with whoever you like.' }] },
      { note: 'Defeat Gnasher, the Scrap King.', objectives: [{ type: 'kill', kind: 'scavengerChief', count: 1, text: 'Defeat Gnasher, the Scrap King (Gnasher\'s Den, far south)', at: GNASHERS_DEN, radius: 170 }] },
      { note: 'Tell Rusk that Gnasher is dead.', objectives: [{ type: 'talk', npc: 'rusk', text: 'Tell Old Rusk that Gnasher is dead', reply: 'Gnasher won\'t sell anyone again.', say: 'Ha! Then the Rust Market rides with the Sun Guard, gods help us all. Kib knows the ring of dunes better than any man alive — don\'t laugh, he does, he\'s been sneaking out there since he could walk. Tell your Queen we\'re coming.' }] },
      { note: 'Report to Queen Neferah.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Tell Queen Neferah the sand-folk will guide her', reply: 'The villages and the Rust Market will ride with your guard.', say: 'Then for the first time in two hundred years the Sunborn and the sand-folk ride out together. My mother wept when I told her. I nearly did. ...Go ahead of us. Captain Mereth and the guides will hold the ring of dunes so nothing of Ankhet\'s gets out; you find the gate.' }] },
    ],
    done: 'Whatever you find at the Sunken Gate — bring it back to the light.',
    rewards: { gold: 400, xp: 1000, items: [['greaterManaPotion', 3], ['greaterHealthPotion', 2]] },
  },
  {
    id: 'sb-6', title: 'The Sunborn VI: The Sunken Gate', giver: 'neferah', region: R, main: true, requires: ['sb-5'],
    summary: 'The Vizier has gone to the Sunken Gate, in the ring of dunes west of the Warden\'s sleep, to wake the buried king. Stop him.',
    offer: 'Ankhet is at the gate already. Go.',
    stages: [
      { note: 'Ride to the ring of dunes west of the Warden\'s sands.', hook: 'sb:gate', objectives: [{ type: 'reach', at: SUNKEN, radius: 75, text: 'Find the Sunken Gate (the ring of dunes, far south-west)' }] },
      { note: 'The Vizier\'s guard holds the gate.', hook: 'sb:gate', objectives: [
        { type: 'kill', kind: 'enforcer', count: 5, text: 'Defeat the Purple Hand at the gate', at: SUNKEN, radius: 140 },
        { type: 'kill', kind: 'enforcerCaptain', count: 1, text: 'Defeat Hemaka the Bitter', at: SUNKEN, radius: 140 },
      ] },
      { note: 'Open the Sunken Gate.', hook: 'sb:gate', objectives: [{ type: 'signal', id: 'sb-gate-open', text: 'Set the Sunken Key in the gate obelisk', at: SUNKEN }] },
      { note: 'The dead of Amaunet rise from the courtyard.', hook: 'sb:dead', objectives: [{ type: 'kill', kind: 'skeleton', count: 8, text: 'Survive the Sunken Dead', at: SUNKEN, radius: 120 }] },
      { note: 'Confront the Vizier on the buried throne.', hook: 'sb:ankhet', objectives: [{ type: 'signal', id: 'sb-confront', text: 'Confront Vizier Ankhet on the throne of Amaunet', at: SUNKEN }] },
      { note: 'The Sun-Eater wakes.', hook: 'sb:boss', objectives: [{ type: 'kill', kind: 'sunEater', count: 1, text: 'Destroy Sekhem-Ra, the Sun-Eater', at: SUNKEN, radius: 200 }] },
    ],
    done: 'The Sun-Eater is sand again.',
    rewards: { gold: 800, xp: 2400, items: [['greaterHealthPotion', 4]], guildRep: 60 },
  },
  {
    id: 'sb-7', title: 'The Sunborn VII: Two Crowns', giver: 'neferah', region: R, main: true, requires: ['sb-6'],
    summary: 'The Sun-Eater is broken and the Vizier lies at the foot of the buried throne. The Sunken Crown waits in the sand. Who should have it?',
    offer: 'The crown.',
    stages: [
      { note: 'Decide the fate of the Sunken Crown.', hook: 'sb:crown', objectives: [{ type: 'signal', id: 'sb-choice', text: 'Lift the Sunken Crown from the sand', at: SUNKEN }] },
      { note: 'Bring word of the crown home.', hook: 'sb:epilogue', objectives: [{ type: 'talk', npc: 'neferah', text: 'Present the Sunken Crown to Queen Neferah', reply: 'The Sunken Crown, Your Radiance.', take: [['sunkenCrown', 1]], say: '' }] },
    ],
    done: '',
    rewards: { gold: 1000, xp: 2000 },
  },
];

/** How the crown's fate rewrites the last chapter: who you go to, what they say, what they give. */
export const ENDINGS = {
  queen: {
    npc: 'neferah', text: 'Present the Sunken Crown to Queen Neferah (the palace)', reply: 'The Sunken Crown, Your Radiance. One crown over both sands.', take: true,
    say: '(The court falls silent. Neferah turns the crown in her hands, then — to the horror of every courtier in the room — calls for Rusk of the Rust Market and old Ta-Nedjem to stand beside the throne.) Two hundred years ago my house took this city and gave its people the sand. Tomorrow I am crowned again, with this, before the Court of the Sun: Queen of the Two Sands, not of one. The gates stay open. The Well is shared. And anyone who wants to argue may take it up with my Sun Guard — and with you.',
    done: 'Hekat forged this from the crown\'s spare gold and my own sunsteel, overnight, on my order. Carry it. You are the blade that made two peoples one.',
    gold: 1500, items: [['twoSandsBlade', 1], ['sunSilk', 2]] as [string, number][],
  },
  sand: {
    npc: 'elder-13', text: 'Give the Sunken Crown to Wise Ta-Nedjem (Tarp Row)', reply: 'This belongs to Amaunet\'s children. It belongs to you.', take: true,
    say: '(She does not put it on. She sets it on a stone by the fire and every scavenger in Tarp Row comes to look at it, one by one, in silence.) Two hundred years we have been thieves in our own grandparents\' sand. Now we have a crown — and a queen in the city who sent us water before she knew we would have it. We will not wear this to fight her. We will wear it to sit beside her. The Rust Market moves inside the walls by the new moon. She has already said yes.',
    done: 'Every grandmother in the Expanse threaded a bead into this. It will keep the sand from forgetting you.',
    gold: 800, items: [['scarabAmulet', 1], ['sunSilk', 3]] as [string, number][],
  },
  broken: {
    npc: 'tiyet', text: 'Tell Queen Mother Tiyet what became of the crown (the palace)', reply: 'I broke the Sunken Crown on the throne of Amaunet.', take: false,
    say: '(The old woman is quiet a long time. Then she laughs — a real laugh, the first you have heard in the palace.) Broken. On his own throne. No Vizier will ever dig for it again, and no queen will ever be tempted to wear it. My husband would have kissed you. ...The storms, you know, have been gentler these last days. The sand is sleeping easier. So shall I.',
    done: 'You kept what was left in your hand when it broke? Good. Keep it. A coal of the old sun should be carried by someone who would not use it for a crown.',
    gold: 600, items: [['sunEaterHeart', 1], ['greaterManaPotion', 3]] as [string, number][],
  },
};
export type Ending = keyof typeof ENDINGS;

/** Rewrite the last chapter for the choice made at the Sunken Gate (run on stage entry, and on load). */
export function applyEnding(quests: QuestLog, ending: Ending, ankhet: string) {
  const q = quests.defs.get('sb-7');
  if (!q) return;
  const e = ENDINGS[ending];
  const o = q.stages[1].objectives[0];
  if (o.type !== 'talk') return;
  o.npc = e.npc;
  o.text = e.text;
  o.reply = e.reply;
  o.take = e.take ? [['sunkenCrown', 1]] : undefined;
  const fate = ankhet === 'chains'
    ? ' And Ankhet will answer for my father before the whole court, in chains, in daylight.'
    : ' As for Ankhet — the sand has him now. It always did.';
  o.say = e.say + (ending === 'queen' ? fate : '');
  q.done = e.done;
  q.stages[1].note = e.text.replace(/ \(.*\)$/, '') + '.';
  q.rewards = { gold: e.gold, xp: 2000, items: e.items, guildRep: 50 };
}

/**
 * Chain the chapters: the first opens when the Caravan Way's letter is
 * delivered, and each hands on to the next. (Done hooks also run on load,
 * so an old save that already finished a chapter picks the story up.)
 */
export function chainSunborn(quests: QuestLog, onDone: (id: string) => void) {
  quests.add(...SUNBORN_QUESTS);
  const prev = quests.hooks.get('silk-road-west:done');
  quests.hooks.set('silk-road-west:done', (q) => {
    prev?.(q);
    quests.accept('sb-1');
  });
  SUNBORN_CHAIN.forEach((id, k) => {
    quests.hooks.set(id + ':done', () => {
      onDone(id);
      const next = SUNBORN_CHAIN[k + 1];
      if (next) quests.accept(next);
    });
  });
}
