import type { QuestDef } from './questLog';

// Quests at sea (docs/design/boating.md §9.2, §11): Mira's first lessons on
// the water; the serpent Nell swore she saw, which the harbourmaster finally
// admits to; and the Black Tide, the pirate fleet of the Shattered Isles,
// whose scout and then whose captain, Rook Calloway, the Crown pays to see
// at the bottom of the sea.

/** Where the Black Tide's ships lie in wait (off the Shattered Isles). */
export const BLACK_TIDE_SCOUT: [number, number] = [4250, 4500];
export const BLACK_TIDE_FLAG: [number, number] = [4800, 6050];

export const SEA_QUESTS: QuestDef[] = [
  {
    id: 'sea-legs', title: 'Sea Legs', giver: 'mira', region: 'portAurelle',
    summary: 'Dockmaster Mira will make a sailor of you: take a boat out, tack her cleanly through the wind, and bring her home to a berth.',
    offer: 'Want to learn the water properly? Hire one of my boats (or buy your own off Barrow). Take her out past the harbour mouth, put her about through the wind clean as a whistle, and bring her back to a berth without scratching my paint.',
    acceptLabel: 'Teach me the sea.',
    stages: [
      { note: 'Sail out and make a clean tack: turn your bow through the wind quickly, without stalling.', objectives: [{ type: 'signal', id: 'sea-tack', text: 'Make a clean tack (turn through the wind, quickly)' }] },
      { note: 'Bring her back and dock at Port Aurelle (E when slow in the harbour).', objectives: [{ type: 'signal', id: 'sea-dock', text: 'Dock at a port' }] },
      { note: 'Tell Mira how it went.', objectives: [{ type: 'talk', npc: 'mira', text: 'Report to Dockmaster Mira', say: 'Not a scratch! You\'ve sea legs after all. Here: a sailor\'s first pay, and something to remember it by. Press N any time to see what the sea is teaching you.' }] },
    ],
    done: 'You have your sea legs.',
    rewards: { gold: 60, xp: 160, items: [['healthPotion', 2]] },
  },
  {
    id: 'serpent-hunt', title: 'The Serpent of the Open Sea', giver: 'tallow', region: 'portAurelle', requires: ['serpent-rumour'],
    summary: 'Harbourmaster Tallow admits it: there is a sea serpent beyond the coastal waters, and the Admiralty will pay whoever kills it.',
    offer: 'All right. Shut the door. It\'s real. The naval cutter came back with half her crew and a bite out of her stern the size of a cart. The Admiralty wants it dead and quiet. It hunts the wild water, the Wild Sea and beyond, the Shattered Isles most of all. A harpoon will hold it; cannon will finish it.',
    acceptLabel: 'I\'ll hunt the serpent.',
    stages: [
      { note: 'Hunt the sea serpent in the wild water (the Wild Sea and beyond; the Shattered Isles most of all).', hook: 'sea:serpentHunt', objectives: [{ type: 'signal', id: 'serpent-slain', text: 'Slay a sea serpent', at: [4300, 4900] }] },
      { note: 'Report to Harbourmaster Tallow.', objectives: [{ type: 'talk', npc: 'tallow', text: 'Report to Harbourmaster Tallow', say: 'Dead? Truly? Then here\'s the Admiralty\'s purse, and here\'s mine. Take the scales to Barrow at the shipwrights: plating of serpent scale, that\'s a hull nothing will bite through.' }] },
    ],
    done: 'The serpent that took the Gull and the Brightwater is dead.',
    rewards: { gold: 900, xp: 1400, items: [['serpentScale', 2]] },
  },
  {
    id: 'black-tide', title: 'The Black Tide', giver: 'tallow', region: 'portAurelle',
    summary: 'Pirates of the Black Tide prey on every ship that rounds the Shattered Isles. The harbourmaster wants their scout ship, the Gallows Tide, sunk or taken.',
    offer: 'Six merchantmen this season, all off the Shattered Isles. The Black Tide: a whole fleet of cutthroats under one captain. Their scout runs ahead of them, a brigantine called the Gallows Tide, lurking north of the Isles. Sink her or take her and the Crown will pay. And bring back word of who leads them.',
    acceptLabel: 'I\'ll hunt the Gallows Tide.',
    stages: [
      { note: 'Find the Gallows Tide off the north of the Shattered Isles and sink or take her.', hook: 'sea:btScout', objectives: [{ type: 'signal', id: 'bt-scout', text: 'Sink or take the Gallows Tide', at: BLACK_TIDE_SCOUT }] },
      { note: 'Bring Harbourmaster Tallow word of the Black Tide.', objectives: [{ type: 'talk', npc: 'tallow', text: 'Report to Harbourmaster Tallow', reply: 'Her captain cursed one name as she went down: Calloway.', say: 'Rook Calloway. I hoped he was dead. He was a navy captain once, before he turned. If he leads the Black Tide, they\'ll not stop at merchantmen. Here\'s the Crown\'s bounty for the scout. And there\'s more where that came from, if you\'ll go after him.' }] },
    ],
    done: 'The Black Tide\'s scout is gone, and you know their captain\'s name.',
    rewards: { gold: 600, xp: 1000, items: [['greaterHealthPotion', 2]] },
  },
  {
    id: 'black-tide-calloway', title: 'Captain Rook Calloway', giver: 'tallow', region: 'portAurelle', requires: ['black-tide'],
    summary: 'Rook Calloway, captain of the Black Tide, sails a galleon called the Widow\'s Wake south of the Shattered Isles with an escort. The Crown wants him finished.',
    offer: 'Calloway\'s flagship is the Widow\'s Wake: a galleon, black as tar, twelve-pounders on both decks. She anchors south of the Shattered Isles with a cutter to guard her. You\'ll want a ship that can stand a broadside, and a crew that can fight. Bring me his colours.',
    acceptLabel: 'I\'ll bring you his colours.',
    stages: [
      { note: 'Defeat Captain Rook Calloway and the Widow\'s Wake south of the Shattered Isles.', hook: 'sea:btFlag', objectives: [{ type: 'signal', id: 'bt-calloway', text: 'Defeat Rook Calloway\'s Widow\'s Wake', at: BLACK_TIDE_FLAG }] },
      { note: 'Bring Calloway\'s colours to Harbourmaster Tallow.', objectives: [{ type: 'deliver', npc: 'tallow', item: 'blackTideColours', count: 1, text: 'Give Tallow the Black Tide\'s colours', say: 'The black flag with the white wave. I never thought I\'d hold it. The Black Tide is broken, and the Shattered Isles are open water again. The Crown\'s reward, Captain, and the harbour\'s thanks. Every ship in this port will know your name.' }] },
    ],
    done: 'Rook Calloway is beaten and the Black Tide is broken.',
    rewards: { gold: 2400, xp: 3200, guildRep: 120, items: [['greaterHealthPotion', 3]] },
  },
];
