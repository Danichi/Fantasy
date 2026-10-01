import type { QuestDef } from './questLog';

// Port Aurelle's quests (World Expansion phase 5): the main story's Act I
// finale and the start of Act II at the Knight's Academy, Bruni Stonevein's
// dwarven expedition (which sails for the White Mountains), and the first
// threads of the city's other storylines.

export const ACADEMY = { x: 2806, z: 70 };
export const ACADEMY_RING = { x: 2822, z: 84 };
export const HARBOUR_BERTH = { x: 2930, z: 150 };

export const PORT_QUESTS: QuestDef[] = [
  // ---- Main story -------------------------------------------------------------------------
  {
    id: 'road-to-port', title: 'The Road to Port Aurelle', giver: 'maud', region: 'cresha', main: true,
    requires: ['mq-gravewood'],
    summary: 'Elder Maud believes the Knight\'s Academy in Port Aurelle can teach a summoned hero what they need to survive this world.',
    offer: 'You didn\'t come to Elder Glen by any road I know of, and you fight like someone half-remembering a dream. The Knight\'s Academy in Port Aurelle trains the realm\'s best. Follow the King\'s Road east to the sea — ten minutes\' walk for young legs — and present yourself to Ser Elian Marrow. Tell him Elder Glen sent you.',
    acceptLabel: 'I\'ll go to Port Aurelle.',
    stages: [
      { note: 'Follow the King\'s Road east to Port Aurelle.', objectives: [{ type: 'reach', at: [2640, 150], radius: 40, text: 'Reach Port Aurelle\'s West Gate' }] },
      { note: 'Find Ser Elian Marrow at the Knight\'s Academy.', objectives: [{ type: 'talk', npc: 'marrow', text: 'Speak to Ser Elian Marrow at the Academy', reply: 'Elder Glen sent me.', say: 'Elder Glen? Maud Hollis\'s hand is on this letter, then. Summoned from another world, she writes. Well. The Academy does not care where you came from — only whether you can stand in the ring.' }] },
    ],
    done: 'Enrolment is by trial. Speak to me again when you are ready to face an instructor.',
    rewards: { gold: 50, xp: 150 },
  },
  {
    id: 'academy-trial', title: 'The Entrance Trial', giver: 'marrow', region: 'portAurelle', main: true,
    summary: 'To enter the Knight\'s Academy you must hold your own in a sparring bout with Ser Hadrik Vane.',
    offer: 'The entrance trial is simple: step into the ring with Ser Hadrik and last. Beat him and you are a cadet. No one dies in my ring — the instructors call the bout before that — but pride has been known to.',
    acceptLabel: 'I\'m ready.',
    stages: [
      { note: 'Win the sparring bout against Ser Hadrik Vane in the Academy ring.', hook: 'duel:hadrik', objectives: [{ type: 'signal', id: 'trial-won', text: 'Defeat Ser Hadrik in the ring', at: [ACADEMY_RING.x, ACADEMY_RING.z] }] },
      { note: 'Report to Ser Elian Marrow.', objectives: [{ type: 'talk', npc: 'marrow', text: 'Report to Ser Elian Marrow', say: 'Hadrik is still rubbing his wrist. Welcome to the Knight\'s Academy, Cadet.' }] },
    ],
    done: 'Your cadet\'s tabard. Wear it with care; the city will treat you differently now.',
    rewards: { gold: 100, xp: 300, guildRep: 40 },
  },
  {
    id: 'academy-lessons', title: 'First Lessons', giver: 'marrow', region: 'portAurelle', main: true, requires: ['academy-trial'],
    summary: 'A new cadet meets the school instructors and the Academy archivist.',
    offer: 'Cadets learn from all three schools before they specialise. Present yourself to Instructor Lyra Quen of the Gale school, Ser Hadrik of the Boundary, and Master Sable Ro of the Cross. Then see Archivist Mell in the library: the world you have fallen into has a long memory.',
    stages: [
      { note: 'Meet the Academy\'s instructors and its archivist.', objectives: [
        { type: 'talk', npc: 'lyra', text: 'Meet Instructor Lyra Quen (Gale)', say: 'Speed is not running fast. Speed is never stopping. Keep your momentum and the fight bends around you.' },
        { type: 'talk', npc: 'hadrik', text: 'Meet Ser Hadrik Vane (Boundary)', say: 'You again. Good. The Boundary is a promise: nothing crosses this line. Hold still, hold the line, and let them break on it.' },
        { type: 'talk', npc: 'sable', text: 'Meet Master Sable Ro (Cross)', say: 'Every attack is a door. Parry, and step through it before it closes.' },
        { type: 'talk', npc: 'mell', text: 'Meet Archivist Mell in the library', say: 'A summoned hero! The chronicles record four. Each one arrived when something old was waking. Come back when you have questions; I have more books than answers.' },
      ] },
      { note: 'Return to Ser Elian Marrow.', objectives: [{ type: 'talk', npc: 'marrow', text: 'Return to Ser Elian Marrow', say: 'Good. Now meet the rest of your class. One of them in particular has been asking about you.' }] },
    ],
    done: 'Cadet Dorian Vale has challenged you to a bout. He does that to every new cadet. Win, and the others will leave you alone.',
    rewards: { gold: 80, xp: 250 },
  },
  {
    id: 'academy-rival', title: 'The Rival', giver: 'dorian', region: 'portAurelle', main: true, requires: ['academy-lessons'],
    summary: 'Cadet Dorian Vale, the best blade in your class, wants to know if the summoned hero is real or a rumour.',
    offer: 'So you\'re the summoned hero. You don\'t look like a legend. The ring, now, in front of everyone — unless you\'d rather hide behind Marrow\'s letter.',
    acceptLabel: 'The ring it is.',
    stages: [
      { note: 'Defeat Cadet Dorian Vale in the Academy ring.', hook: 'duel:dorian', objectives: [{ type: 'signal', id: 'rival-won', text: 'Defeat Dorian Vale in the ring', at: [ACADEMY_RING.x, ACADEMY_RING.z] }] },
      { note: 'Speak with Dorian.', objectives: [{ type: 'talk', npc: 'dorian', text: 'Speak with Dorian Vale', say: '…Fine. You\'re real. Don\'t let it go to your head. Next time I\'ll be ready for that parry.' }] },
    ],
    done: 'The other cadets look at you differently now. Ser Marrow is waiting for you at dawn.',
    rewards: { gold: 60, xp: 300 },
  },
  {
    id: 'academy-oath', title: 'Squire\'s Oath', giver: 'marrow', region: 'portAurelle', main: true, requires: ['academy-rival'],
    summary: 'At dawn on the Academy wall, cadets who have proven themselves swear the Squire\'s Oath.',
    offer: 'At dawn you will swear the Squire\'s Oath on the Academy wall, facing the sea. It binds you to nothing but your own word: to protect, to learn, and to go where you are needed. Meet me there when the sun comes up.',
    stages: [
      { note: 'Meet Ser Marrow on the Academy wall at dawn (5:00–8:00).', objectives: [
        { type: 'hour', from: 5, to: 8, text: 'Wait for dawn (5:00)' },
        { type: 'reach', at: [ACADEMY.x + 18, ACADEMY.z - 14], radius: 8, text: 'Stand on the Academy wall' },
      ] },
      { note: 'Swear the oath to Ser Marrow.', objectives: [{ type: 'talk', npc: 'marrow', text: 'Swear the Squire\'s Oath', reply: 'I swear it.', say: 'Then rise, Squire. The road ahead is longer than the King\'s Road, and it does not end at the sea. When you are ready, the dwarves in the harbour need blades for the White Mountains, and the Crown will want to meet you before long.' }] },
    ],
    done: 'ACT I COMPLETE — you are a Squire of the Knight\'s Academy.',
    rewards: { gold: 200, xp: 500, guildRep: 80 },
  },
  // ---- The dwarven expedition ----------------------------------------------------------------
  {
    id: 'dwarf-expedition', title: 'The White Mountain Expedition', giver: 'bruni', region: 'portAurelle',
    summary: 'Bruni Stonevein\'s expedition sails for the White Mountains in three days. She needs ore samples, a miner\'s lantern, and someone the Guild will vouch for.',
    offer: 'Three days. In three days the Iron Kettle sails north for the White Mountains, and there\'s ore up there that never reaches Cresha\'s markets. I need blades who can handle themselves underground. Bring me five good iron samples so I know you\'ve held a pick, buy yourself a proper miner\'s lantern, and get the Guild to vouch for you. Then be on the harbour at eight in the morning, sailing day.',
    acceptLabel: 'Count me in.',
    stages: [
      { note: 'Prepare for the expedition before the ship sails.', objectives: [
        { type: 'deliver', npc: 'bruni', item: 'ironOre', count: 5, text: 'Bring Bruni 5 iron ore samples', say: 'Good weight to these. You know a vein when you see one.' },
        { type: 'collect', item: 'minersLantern', count: 1, text: 'Buy a miner\'s lantern (Dwarven Quarter)' },
        { type: 'talk', npc: 'guildmaster', text: 'Get the Guild\'s recommendation', reply: 'Will the Guild vouch for me? Bruni Stonevein\'s expedition.', say: 'Stonevein? She\'s the best there is. Yes — here, the Guild\'s seal. Don\'t make us regret it.' },
      ] },
      { note: 'Be at the harbour on sailing day at 8:00.', hook: 'dwarves:sailing', objectives: [{ type: 'signal', id: 'expedition-sails', text: 'Board the Iron Kettle at the harbour (sailing day, 8:00)', at: [HARBOUR_BERTH.x, HARBOUR_BERTH.z] }] },
    ],
    done: 'The Iron Kettle slips out of Port Aurelle on the morning tide, bound for the White Mountains. (The mountains open in a later chapter; Bruni will hold your berth.)',
    rewards: { gold: 150, xp: 400, items: [['healthPotion', 3]], guildRep: 60 },
  },
  // ---- The fish market -------------------------------------------------------------------------
  {
    id: 'first-catch', title: 'A Fisher\'s First Catch', giver: 'mira', region: 'portAurelle',
    summary: 'Dockmaster Mira Vane will teach you to fish if you bring the fish market three catches.',
    offer: 'Fishing license? It\'s free for anyone who can actually catch something. Here — a rod. Cast from the wharf, strike when the float dips, reel when the line\'s slack. Bring three fish to Old Nell at the fish market and I\'ll call you a fisher.',
    stages: [
      { note: 'Catch three fish and sell them at the fish market.', hook: 'fishing:rod', objectives: [{ type: 'signal', id: 'fish-caught', count: 3, text: 'Catch fish (the wharf, the piers, rivers)' }] },
      { note: 'Tell Mira Vane.', objectives: [{ type: 'talk', npc: 'mira', text: 'Tell Dockmaster Mira', say: 'Three already? You\'ve the patience for it. The sea\'s full of stranger fish than those — some only bite at night, some only in storms.' }] },
    ],
    done: 'Keep the rod. And if you ever catch a Moonfish, I want to see it.',
    rewards: { gold: 40, xp: 120 },
  },
  // ---- Seeds of later storylines ------------------------------------------------------------------
  {
    id: 'serpent-rumour', title: 'The Sea Serpent Rumour', giver: 'nell', region: 'portAurelle',
    summary: 'Old Nell swears a sea serpent took three fishing boats off the Shattered Isles. The harbourmaster says it is nonsense.',
    offer: 'You hear what took the Gull and the Brightwater? Serpent. Long as a street, eyes like lanterns. Harbourmaster Tallow says it was a squall. Ask him yourself — and watch his face when you do.',
    stages: [{ note: 'Ask Harbourmaster Tallow about the lost boats.', objectives: [{ type: 'talk', npc: 'tallow', text: 'Ask Harbourmaster Tallow about the serpent', reply: 'What really happened to the Gull and the Brightwater?', say: '…A squall. That\'s what the report says, and that\'s what you\'ll say too, if anyone asks. The Admiralty is sending a naval ship to look. When they\'re back — maybe we\'ll talk.' }] }],
    done: 'The harbourmaster is hiding something about the Shattered Isles. (The Grand Ocean opens in a later chapter.)',
    rewards: { gold: 20, xp: 80 },
  },
  {
    id: 'missing-heir', title: 'The Missing Heir', giver: 'corvina', region: 'portAurelle',
    summary: 'Lady Corvina Aurelle\'s son has vanished into the Lower City, and she cannot ask the Watch without a scandal.',
    offer: 'My son Aldric has not come home in four nights. He has been seen in the Lower City, near the Drowned Lantern tavern, in company I would rather not name. I cannot send the Watch. I can send you. Discreetly.',
    stages: [{ note: 'Look for Aldric Aurelle near the Drowned Lantern in the Lower City.', objectives: [{ type: 'talk', npc: 'marlo', text: 'Ask around the Drowned Lantern', reply: 'I\'m looking for Aldric Aurelle.', say: 'The young lordling? Plays cards badly and pays debts worse. He owes the wrong people, friend. The Guild of Quiet Hands, if you catch my meaning. You\'ll need more than asking nicely to get him back.' }] }],
    done: 'Aldric is in debt to the thieves\' guild. (The Lower City\'s underworld opens in a later chapter.)',
    rewards: { gold: 60, xp: 100 },
  },
];
