import type { GiftKind, Profile, Tie, Traits, Voice } from './profile';
import type { Mood } from './reputation';

// Elder Glen's named people, written by hand (NPC overhaul, phase 2): who
// they are, how they talk, what they love and loathe, who they love and
// loathe, what they want and what they hide, and the things you can only ask
// them once they trust you.

export interface PersonalTopic {
  q: string;
  a: string;
  /** they only open up this far once they feel at least this way */
  min?: Mood;
}

export interface Authored {
  traits: Partial<Traits>;
  voice: Voice;
  likes: GiftKind[];
  dislikes: GiftKind[];
  about: string;
  want: string;
  secret: string;
  ties?: Tie[];
  topics?: PersonalTopic[];
  /** what they say when they're truly fond of you */
  fond?: string;
  /** what they say when they can't stand you */
  scorn?: string;
}

const T = (warmth = 0, courage = 0, honesty = 0, greed = 0, humor = 0, piety = 0, temper = 0): Partial<Traits> => ({ warmth, courage, honesty, greed, humor, piety, temper });

export const CAST: Record<string, Authored> = {
  kaela: {
    traits: T(0.1, 0.8, 0.6, -0.2, 0.4, -0.3, 0.3), voice: 'blunt', likes: ['weapons', 'drink'], dislikes: ['flowers', 'sweets'],
    about: 'I trained the Watch for six years. Now I train anyone with legs and the sense to use them.',
    want: 'One student who\'s better than me. Then I can stop.',
    secret: 'I lost a duel to Veyr when I was twenty. I\'ve been training to win the rematch ever since. He doesn\'t remember it.',
    ties: [{ id: 'veyr', bond: 'rival' }, { id: 'brannoc', bond: 'friend' }],
    topics: [
      { q: 'Why did you leave the Watch?', a: 'Brannoc wanted a sergeant. I wanted a yard. He got a better sergeant than I\'d have been, and I got the yard. We both won.', min: 'warm' },
      { q: 'What do you think of Master Veyr?', a: 'Best blade in the valley, and he knows it. Insufferable. I\'d still give my left hand to fight him again. Well. My off hand.', min: 'warm' },
    ],
    fond: 'You fight like you mean it now. Good. I\'m almost proud.',
    scorn: 'I don\'t teach people who hit the defenceless. Get out of my yard.',
  },
  froest: {
    traits: T(0.4, 0.3, 0.4, 0.4, 0.5, 0, 0.1), voice: 'cheery', likes: ['tools', 'gems', 'coin'], dislikes: ['flowers', 'books'],
    about: 'Forty years at the anvil. Came from the dwarf-holds as a boy and never went back. The Glen needed a smith more than the holds did.',
    want: 'Starmetal. Just one ingot of it. I\'ve been dreaming of the blade for thirty years.',
    secret: 'I can\'t stand dwarven ale. I drink it to be polite and pour half in the quench tub.',
    ties: [{ id: 'carpenter', bond: 'friend' }, { id: 'baker', bond: 'friend' }],
    topics: [
      { q: 'Tell me about the dwarf-holds.', a: 'Cold, dark, loud, and full of relatives. I loved it. I\'d never go back.', min: 'neutral' },
      { q: 'What makes a good blade?', a: 'Patience, mostly. Good iron, a clean fire, and a smith who doesn\'t rush the quench. Most rush the quench.', min: 'warm' },
    ],
    fond: 'For you, I\'d light the forge at midnight. Have done, in fact.',
    scorn: 'My forge isn\'t for the likes of you. Take your coin elsewhere.',
  },
  magus: {
    traits: T(-0.1, 0.2, 0.5, -0.1, -0.2, -0.4, 0.2), voice: 'formal', likes: ['books', 'potions', 'gems'], dislikes: ['drink', 'food'],
    about: 'I keep the old arts alive in a valley that would rather forget them.',
    want: 'A pupil with the patience to read before they burn.',
    secret: 'The tower\'s library has a sealed shelf. I have never opened it. I am afraid of what I\'d find I already knew.',
    ties: [{ id: 'arcanist', bond: 'rival' }],
    topics: [
      { q: 'What is the Dark?', a: 'Not a place, exactly. A tide. It ebbs as its old ruler dies, and spills where the world is thin. The Gravewood is thin. So, increasingly, is everywhere.', min: 'warm' },
      { q: 'Do you know Sera Lumis?', a: 'The arcane merchant. She sells spells like turnips. I suppose someone must.', min: 'neutral' },
    ],
    fond: 'You have become, against all odds, a person I look forward to seeing.',
    scorn: 'I have nothing to teach a brute.',
  },
  veyr: {
    traits: T(-0.3, 0.9, 0.3, 0, 0.1, 0, -0.4), voice: 'formal', likes: ['weapons', 'drink'], dislikes: ['sweets', 'trinkets'],
    about: 'I fought in the Ninefold Duels when your parents were children. I won most of them. The rest, I learned from.',
    want: 'A fight that frightens me. It has been many years.',
    secret: 'My right eye is going. I fight by sound now, mostly. Nobody has noticed, and nobody will.',
    ties: [{ id: 'kaela', bond: 'rival' }],
    topics: [
      { q: 'Have you fought Kaela?', a: 'Once, long ago. She was quick. Too quick to be patient. I hear she has learned patience since. I should like to see it.', min: 'warm' },
    ],
    fond: 'You fight with honour. That is rarer than skill.',
    scorn: 'You strike the unarmed. You are no duelist. You are nothing.',
  },
  corvin: {
    traits: T(0.3, 0.9, 0.8, -0.4, -0.2, 0.6, -0.3), voice: 'formal', likes: ['weapons', 'books', 'food'], dislikes: ['coin', 'drink'],
    about: 'I held the north road for the Crown eleven years. Now I hold it because nobody else will.',
    want: 'A road where nobody needs me.',
    secret: 'I was not knighted. I took the title off a dead man at Harrow Ford because the soldiers needed someone to follow. I have tried to deserve it every day since.',
    ties: [{ id: 'brannoc', bond: 'friend' }],
    topics: [
      { q: 'What happened at Harrow Ford?', a: 'We held it. That is all anyone needs to know.', min: 'friend' },
    ],
    fond: 'If ever I fall, I would want you holding the road after me.',
    scorn: 'You have broken faith with these people. I will not stand beside you.',
  },
  innkeeper: {
    traits: T(0.7, 0.2, 0.3, 0.2, 0.6, 0, 0.2), voice: 'folksy', likes: ['drink', 'food', 'coin'], dislikes: ['weapons'],
    about: 'I\'ve run the Wayfarer since my mother passed it to me. Beds, beer and every rumour in the valley.',
    want: 'A full house every night, and nobody breaking my chairs.',
    secret: 'Half the "old family recipe" stew is Tessa\'s. I buy it from her back door and add salt.',
    ties: [{ id: 'baker', bond: 'friend' }, { id: 'brannoc', bond: 'sweetheart' }],
    topics: [
      { q: 'Heard anything interesting?', a: 'Always. The question is whether you\'re paying for a room or a rumour. Both, ideally.', min: 'neutral' },
      { q: 'You and the Captain?', a: 'I don\'t know what you\'re talking about. And if I did, I wouldn\'t tell you. He snores, by the way.', min: 'friend' },
    ],
    fond: 'Your room\'s always made up. Don\'t argue.',
    scorn: 'No room. No beer. No.',
  },
  apothecary: {
    traits: T(0.2, -0.3, 0.6, 0, -0.1, 0.2, -0.2), voice: 'nervous', likes: ['herbs', 'flowers', 'potions'], dislikes: ['weapons', 'drink'],
    about: 'I brew what keeps adventurers breathing. Most of them come back. Most.',
    want: 'Duskbloom that isn\'t half rotten by the time the caravans bring it.',
    secret: 'I failed my guild examinations twice. Everything I know I taught myself from my grandmother\'s notebook.',
    ties: [{ id: 'baker', bond: 'friend' }],
    topics: [
      { q: 'Any advice for the road?', a: 'Drink the red one when you\'re bleeding, the blue one when your head hurts from spellwork, and never, ever drink anything a bandit leaves behind.', min: 'neutral' },
    ],
    fond: 'I put a little extra in your potions. Don\'t tell anyone.',
    scorn: 'P-please leave. I don\'t serve you.',
  },
  baker: {
    traits: T(0.8, 0.1, 0.5, 0.1, 0.5, 0.2, -0.1), voice: 'cheery', likes: ['sweets', 'food', 'flowers'], dislikes: ['weapons', 'gems'],
    about: 'Up at four, bread out by six, pies by noon. Everything in the Glen tastes better after I\'ve had a go at it.',
    want: 'To bake for the king\'s table. Once. Then I\'d die happy. Covered in flour.',
    secret: 'I sell Mara her stew out the back door. She tells everyone it\'s her mother\'s recipe. I let her.',
    ties: [{ id: 'innkeeper', bond: 'friend' }, { id: 'froest', bond: 'friend' }, { id: 'pip', bond: 'friend' }],
    topics: [
      { q: 'What\'s your best bake?', a: 'Honey-oat loaf. Three days to get the starter right. Worth every minute.', min: 'neutral' },
    ],
    fond: 'There\'s a honey cake with your name on it. Literally. I wrote it in icing.',
    scorn: 'No bread for bullies. Not even the stale.',
  },
  tailor: {
    traits: T(-0.2, 0, 0.1, 0.3, 0.3, -0.2, 0.3), voice: 'flowery', likes: ['trinkets', 'gems', 'flowers'], dislikes: ['fish', 'tools'],
    about: 'Cloth and leather, darling. I make adventurers look like they meant to survive.',
    want: 'Sun-silk from Ghagrabba. A bolt of it. I would weep.',
    secret: 'I was a seamstress to a countess in the Capital until she caught me wearing her gown to a ball.',
    ties: [{ id: 'arcanist', bond: 'friend' }],
    topics: [{ q: 'Why leave the Capital?', a: 'A misunderstanding involving a gown, a ball and a countess with no sense of humour. I\'d rather not.', min: 'friend' }],
    fond: 'You, darling, are the only customer I\'d sew for at cost.',
    scorn: 'I don\'t dress brutes. It ruins the cloth.',
  },
  carpenter: {
    traits: T(0.3, 0.4, 0.7, 0, 0.1, 0.1, -0.3), voice: 'gruff', likes: ['tools', 'food', 'drink'], dislikes: ['books', 'flowers'],
    about: 'Shields, fences, coffins. Wood\'s honest. It does what it\'s shaped to.',
    want: 'Good oak. The Gravewood\'s full of it, and nobody will go in to fell it.',
    secret: 'I made the coffin for my own father and couldn\'t bring myself to close it.',
    ties: [{ id: 'froest', bond: 'friend' }],
    fond: 'You\'re all right. I\'d build you a house.',
    scorn: 'Get off my porch.',
  },
  arcanist: {
    traits: T(0, 0.1, -0.1, 0.5, 0.3, -0.5, 0), voice: 'flowery', likes: ['gems', 'books', 'potions'], dislikes: ['food', 'tools'],
    about: 'I sell the arcane by the scroll. Fire, light, the odd curse. Not the curses, officially.',
    want: 'A shop on the Capital\'s Street of Lamps.',
    secret: 'The "rare grimoire" in my window is a cookbook in a nice binding.',
    ties: [{ id: 'magus', bond: 'rival' }, { id: 'tailor', bond: 'friend' }],
    fond: 'For you, the good stock. Under the counter. Shh.',
    scorn: 'My wares are not for you. Not at any price.',
  },
  stablemaster: {
    traits: T(0.4, 0.2, 0.5, 0.1, 0.2, 0, 0), voice: 'folksy', likes: ['food', 'herbs'], dislikes: ['weapons', 'gems'],
    about: 'Horses don\'t lie, don\'t cheat and don\'t talk back. Best company in the Glen.',
    want: 'A Ghagrabba sand-runner. Fastest horse alive.',
    secret: 'I\'m frightened of the big draught horses. Thirty years and I still flinch.',
    fond: 'Take the grey, she likes you. She doesn\'t like anybody.',
    scorn: 'Find another stable. Mine\'s full. Always will be, for you.',
  },
  hale: {
    traits: T(0.4, 0.3, 0.6, 0, 0.2, 0.1, 0), voice: 'folksy', likes: ['food', 'tools'], dislikes: ['gems', 'books'],
    about: 'Cattle. Twelve head, every one named. Bess, Old Tom, Thistle...',
    want: 'Not to lose another calf to the wolves.',
    secret: 'I named one of the cows after Elder Maud. She knows. She pretends she doesn\'t.',
    ties: [{ id: 'wren', bond: 'friend' }, { id: 'maud', bond: 'friend' }],
  },
  wren: {
    traits: T(0.2, 0.5, 0.7, 0, 0.4, 0.3, 0.1), voice: 'folksy', likes: ['food', 'drink', 'tools'], dislikes: ['trinkets', 'coin'],
    about: 'Sixty harvests off the one field. My father\'s, his father\'s.',
    want: 'One more harvest. Then one more after that.',
    secret: 'My knees are gone. I harvest on my knees, crawling. Don\'t you tell the young ones.',
    ties: [{ id: 'hale', bond: 'friend' }],
  },
  oswin: {
    traits: T(0.1, 0, 0.5, 0.2, 0.3, 0, 0.2), voice: 'gruff', likes: ['food', 'tools'], dislikes: ['flowers'],
    about: 'I grind every grain in the Glen. Every loaf you eat passed through these stones.',
    want: 'A new millstone. This one\'s a hand thinner every year.',
    secret: 'I keep the miller\'s eighth and a sixteenth on top. Everyone suspects. Nobody can prove it.',
    ties: [{ id: 'dora', bond: 'rival' }],
  },
  dora: {
    traits: T(-0.2, 0.2, 0.9, -0.1, -0.3, 0.2, 0.3), voice: 'blunt', likes: ['books', 'coin'], dislikes: ['sweets', 'drink'],
    about: 'I count the granaries. Twice. Then once more for luck.',
    want: 'One season where my count and Oswin\'s match.',
    secret: 'A sack went missing in the hard winter. I covered it. I knew who took it, and they had children.',
    ties: [{ id: 'oswin', bond: 'rival' }],
  },
  brannoc: {
    traits: T(0.1, 0.9, 0.7, -0.2, 0, 0.1, 0.3), voice: 'gruff', likes: ['weapons', 'drink', 'food'], dislikes: ['flowers', 'trinkets'],
    about: 'Captain of the Watch. Twenty years on these walls.',
    want: 'Enough men to hold the walls without the farmers picking up pitchforks.',
    secret: 'I\'ve put in for retirement three times. I tear the letter up every time the horn goes.',
    ties: [{ id: 'innkeeper', bond: 'sweetheart' }, { id: 'kaela', bond: 'friend' }, { id: 'corvin', bond: 'friend' }],
    topics: [{ q: 'How long have you known Mara?', a: '...Long enough. Why? Who\'s been talking?', min: 'friend' }],
    fond: 'You\'d make a fine sergeant. Think about it.',
    scorn: 'One more step out of line and you\'ll see the inside of my cells.',
  },
  pip: {
    traits: T(0.6, 0.6, 0.2, 0.2, 0.8, 0, 0.2), voice: 'cheery', likes: ['sweets', 'trinkets', 'weapons'], dislikes: ['books', 'herbs'],
    about: 'I\'m Pip! I\'m going to be an adventurer when I\'m big. Bigger. Next year probably.',
    want: 'A real sword! Or a dog. A dog with a sword.',
    secret: 'I went to the edge of the Gravewood on my own. I saw lights. I ran home and didn\'t tell anybody. Not even Nell.',
    ties: [{ id: 'baker', bond: 'friend' }],
  },
  maud: {
    traits: T(0.5, 0.3, 0.6, -0.3, 0.2, 0.6, -0.3), voice: 'formal', likes: ['flowers', 'books', 'herbs'], dislikes: ['weapons', 'coin'],
    about: 'I have kept this town\'s peace and its chronicle for thirty years.',
    want: 'To see the valley at peace before I\'m done.',
    secret: 'There was a cow named after me. I pretend not to know. I have been to visit her twice.',
    ties: [{ id: 'hale', bond: 'friend' }],
    fond: 'You are written in the chronicle now. Kindly.',
    scorn: 'The chronicle will remember what you did here. So will I.',
  },
  rook: {
    traits: T(0.3, 0.8, 0.4, 0.2, 0.5, -0.2, 0.5), voice: 'cheery', likes: ['weapons', 'drink', 'coin'], dislikes: ['books', 'flowers'],
    about: 'Glen Wardens! D-rank today, B-rank by spring. That\'s the plan.',
    want: 'A contract with a dragon in it. A small dragon. To start.',
    secret: 'I\'ve never actually finished a wolf contract on my own. Lyssa shoots them. I take the bow-wounds.',
    ties: [{ id: 'lyssa', bond: 'friend' }, { id: 'garrick', bond: 'friend' }, { id: 'tam', bond: 'rival' }],
  },
  lyssa: {
    traits: T(0, 0.4, 0.6, 0, 0.2, 0, -0.2), voice: 'blunt', likes: ['weapons', 'herbs'], dislikes: ['trinkets', 'sweets'],
    about: 'I stand behind Rook with a bow. Someone has to.',
    want: 'A bow of yew from the White Mountains.',
    secret: 'I\'m going to leave the Wardens and go north alone. I haven\'t told Rook.',
    ties: [{ id: 'rook', bond: 'friend' }, { id: 'garrick', bond: 'friend' }],
  },
  garrick: {
    traits: T(0.5, 0.4, 0.8, -0.2, 0, 0.3, -0.4), voice: 'gruff', likes: ['food', 'tools', 'weapons'], dislikes: ['drink', 'gems'],
    about: 'I carry the shield. Rook carries the sword and the trouble.',
    want: 'For the three of us to make it to spring in one piece.',
    secret: 'Lyssa\'s leaving. I know. I haven\'t told Rook either.',
    ties: [{ id: 'rook', bond: 'friend' }, { id: 'lyssa', bond: 'friend' }],
  },
  selka: {
    traits: T(-0.1, 0.1, 0.1, 0.3, 0.4, -0.3, 0.2), voice: 'flowery', likes: ['books', 'gems', 'potions'], dislikes: ['food', 'tools'],
    about: 'Two Coins. A mage and a rogue: the coin that lands either side.',
    want: 'To be taken seriously by Magus Orren. Once.',
    secret: 'Tam and I owe the wrong people money in Port Aurelle.',
    ties: [{ id: 'tam', bond: 'friend' }, { id: 'magus', bond: 'mentor' }],
  },
  tam: {
    traits: T(0.1, 0.2, -0.6, 0.6, 0.6, -0.4, 0), voice: 'cheery', likes: ['coin', 'gems', 'trinkets'], dislikes: ['books', 'herbs'],
    about: 'Rogue, entrepreneur, finder of lost things. Things other people lost on purpose, mostly.',
    want: 'Enough coin to pay off Port Aurelle and never go back.',
    secret: 'I picked Brannoc\'s pocket on my first day in the Glen. I gave it back. He never knew.',
    ties: [{ id: 'selka', bond: 'friend' }, { id: 'rook', bond: 'rival' }],
  },
  ingrid: {
    traits: T(0.2, 0.7, 0.6, -0.1, 0.2, 0.1, -0.5), voice: 'formal', likes: ['drink', 'weapons', 'books'], dislikes: ['sweets', 'trinkets'],
    about: 'B-rank, retired. I sit, I drink, I tell the young ones which contracts will kill them.',
    want: 'For one of these young fools to listen to me before it\'s too late.',
    secret: 'My whole party died in the Hollow Ridge caves. I went back for them. There was nothing to bring home.',
    fond: 'You listened. You\'re still alive. Those two things are related.',
  },
};

/** Apply a written character over a rolled profile. */
export function authored(base: Profile): Profile {
  const a = CAST[base.id];
  if (!a) return base;
  return {
    ...base,
    traits: { ...base.traits, ...a.traits },
    voice: a.voice,
    likes: a.likes,
    dislikes: a.dislikes,
    about: a.about,
    want: a.want,
    secret: a.secret,
    ties: [...(a.ties ?? []), ...base.ties.filter((t) => !(a.ties ?? []).some((x) => x.id === t.id))],
    essential: true,
    firstImpression: Math.round((a.traits.warmth ?? 0) * 18 - (a.traits.temper ?? 0) * 6),
  };
}

// ---- Port Aurelle and the Royal Capital (NPC overhaul, phase 5) -------------------------
const CITY_CAST: Record<string, Authored> = {
  // Port Aurelle: the Academy
  marrow: {
    traits: T(0.1, 0.7, 0.8, -0.2, -0.2, 0.3, 0.1), voice: 'formal', likes: ['books', 'weapons'], dislikes: ['drink', 'trinkets'],
    about: 'I keep the Academy\'s rolls and its rules. Both are longer than they need to be. Both are necessary.',
    want: 'A class of cadets who finish what they start.',
    secret: 'I failed the entrance bout my first year. Instructor Lyra\'s mother let me in anyway. I have never told Lyra.',
    ties: [{ id: 'lyra', bond: 'friend' }, { id: 'hadrik', bond: 'friend' }, { id: 'sable', bond: 'rival' }],
    topics: [{ q: 'What makes a good cadet?', a: 'Not talent. Talent is common. Turning up on the wet mornings is rare.', min: 'neutral' }],
    fond: 'You honour the Academy. I will see your name is written well in the rolls.',
    scorn: 'Your name is struck from my good opinion. That is a harder roll to get back on.',
  },
  lyra: {
    traits: T(0.5, 0.6, 0.5, 0, 0.6, -0.1, 0.2), voice: 'cheery', likes: ['sweets', 'weapons', 'flowers'], dislikes: ['books', 'coin'],
    about: 'I teach the Gale here. Quick feet, quick blade, quicker mouth. The last one isn\'t on the syllabus.',
    want: 'To beat Kaela Voss in the Glen. Once. She was my teacher.',
    secret: 'I write to Kaela every month. She has never written back. I keep writing.',
    ties: [{ id: 'marrow', bond: 'friend' }, { id: 'sable', bond: 'friend' }],
    topics: [{ q: 'You know Kaela Voss?', a: 'She taught me. She taught me everything, and then she told me to go away and find my own way of doing it. Best and worst advice I ever had.', min: 'warm' }],
    fond: 'You fight like the wind\'s on your side. I like that.',
    scorn: 'Get out of my yard before I show you how fast the Gale really is.',
  },
  hadrik: {
    traits: T(0, 0.8, 0.7, -0.1, -0.4, 0.4, -0.2), voice: 'gruff', likes: ['weapons', 'food', 'tools'], dislikes: ['flowers', 'sweets'],
    about: 'Boundary School. Stand, hold, outlast. I have stood in worse places than this.',
    want: 'A shield wall that doesn\'t break. I\'ve only seen one, once.',
    secret: 'The wall I saw hold was at Harrow Ford. Ser Corvin was on it. So was I. He doesn\'t know I know what he did there.',
    ties: [{ id: 'marrow', bond: 'friend' }],
    fond: 'You hold. Good. Hold a little longer.',
    scorn: 'You are not welcome on my sand.',
  },
  sable: {
    traits: T(-0.2, 0.5, -0.2, 0.2, 0.5, -0.5, 0.1), voice: 'flowery', likes: ['drink', 'gems', 'trinkets'], dislikes: ['tools', 'herbs'],
    about: 'The Cross, darling. Two blades, two thoughts, and an opponent who can only keep track of one of them.',
    want: 'A pupil who can dance. Most of them can only march.',
    secret: 'I was a thief in the Lower City before the Academy. Some of the Quiet Hands still call me by the old name.',
    ties: [{ id: 'dice', bond: 'friend' }, { id: 'marrow', bond: 'rival' }, { id: 'lyra', bond: 'friend' }],
    topics: [{ q: 'Where did you learn to fight?', a: 'In alleys. Then in ballrooms. The alleys were more honest.', min: 'warm' }],
    fond: 'You, my dear, have rhythm. Come and dance with me sometime.',
    scorn: 'How tediously brutish of you.',
  },
  // Port Aurelle: the harbour and the town
  mira: {
    traits: T(0.2, 0.5, 0.6, 0.1, 0.2, 0, 0.3), voice: 'blunt', likes: ['fish', 'drink', 'tools'], dislikes: ['flowers', 'books'],
    about: 'Dockmaster. Every rope, every berth, every captain who thinks the rules don\'t apply to them.',
    want: 'One season without a ship sunk at its moorings.',
    secret: 'I can\'t swim. Thirty years on the docks. Not a stroke.',
    ties: [{ id: 'tallow', bond: 'friend' }, { id: 'nell', bond: 'friend' }],
    fond: 'Your ship gets the best berth in the harbour. Don\'t tell the others.',
    scorn: 'No berth for you. Moor in the sea.',
  },
  nell: {
    traits: T(0.6, 0.2, 0.3, 0.3, 0.7, 0.1, 0), voice: 'folksy', likes: ['fish', 'drink', 'sweets'], dislikes: ['weapons', 'gems'],
    about: 'Fifty years selling fish on this quay, dearie. I\'ve outlived three husbands and two harbourmasters.',
    want: 'A pike as long as I am tall. Somebody\'s going to catch one. Might as well be you.',
    secret: 'Two of the husbands I didn\'t much like. The third I miss every day.',
    ties: [{ id: 'mira', bond: 'friend' }, { id: 'bess', bond: 'friend' }],
    fond: 'For you, dearie, I pay full weight. Don\'t you tell a soul.',
    scorn: 'Go and bother the gulls. They might like you.',
  },
  tallow: {
    traits: T(-0.1, 0.1, 0.4, 0.4, -0.1, 0, 0.2), voice: 'formal', likes: ['coin', 'books', 'drink'], dislikes: ['fish', 'herbs'],
    about: 'I keep the harbour\'s accounts, its licences and its peace, in roughly that order.',
    want: 'A new harbour wall, paid for by somebody else.',
    secret: 'The Black Tide pays a harbour fee. Through a cousin of a cousin. I take it. I am not proud.',
    ties: [{ id: 'mira', bond: 'friend' }],
    fond: 'Your papers are always in order with me.',
    scorn: 'Your licence is under review. Indefinitely.',
  },
  bess: {
    traits: T(0.7, 0.4, 0.4, 0.2, 0.6, 0, 0.3), voice: 'folksy', likes: ['drink', 'food', 'coin'], dislikes: ['weapons'],
    about: 'The Salty Anchor\'s mine. Every sailor who ever lied about a sea serpent has lied about it at my bar.',
    want: 'To see a sea serpent. A real one. From a safe distance.',
    secret: 'The anchor over the door isn\'t from a ship. I bought it from a scrap man and made up the story.',
    ties: [{ id: 'nell', bond: 'friend' }],
    fond: 'There\'s always a stool for you at the Anchor.',
    scorn: 'Drink somewhere else.',
  },
  corvina: {
    traits: T(-0.4, 0.3, 0.1, 0.4, 0.2, 0.2, 0.3), voice: 'formal', likes: ['gems', 'flowers', 'books'], dislikes: ['fish', 'tools'],
    about: 'House Aurelle built this port. I am what is left of House Aurelle, and I intend to be a great deal.',
    want: 'A seat on the king\'s council. The Aurelles had one, once.',
    secret: 'The house is nearly broke. The gowns are rented. The jewels are paste.',
    ties: [{ id: 'vesper', bond: 'rival' }],
    topics: [{ q: 'What happened to House Aurelle?', a: 'Pirates, a bad marriage, and a worse investment in a silver mine that turned out to be mostly a hole. In that order.', min: 'friend' }],
    fond: 'You are, I think, the only honest person I know. It\'s quite refreshing.',
    scorn: 'You will not be received in this house again.',
  },
  dice: {
    traits: T(0.2, 0.4, -0.7, 0.6, 0.7, -0.6, 0), voice: 'cheery', likes: ['coin', 'drink', 'trinkets'], dislikes: ['books', 'herbs'],
    about: 'Cards, dice, bones, shells. If it can be thrown, I\'ll take your coin on it.',
    want: 'One perfectly fair game. Just to see what it feels like.',
    secret: 'I\'ve never once played a fair hand. Not even with Pim.',
    ties: [{ id: 'pim', bond: 'friend' }, { id: 'sable', bond: 'friend' }, { id: 'marlo', bond: 'rival' }],
    fond: 'For you, the honest deck. Mostly honest.',
    scorn: 'Table\'s closed. For you, forever.',
  },
  pim: {
    traits: T(0.5, 0.5, 0, 0.3, 0.6, 0, 0.1), voice: 'cheery', likes: ['sweets', 'coin', 'trinkets'], dislikes: ['books', 'herbs'],
    about: 'I run messages. Fastest legs in the Lower City and I never read what I carry. Hardly ever.',
    want: 'Boots. Real ones, with soles.',
    secret: 'I can read. Mother Sallow doesn\'t know. That\'s how I know what\'s in the messages.',
    ties: [{ id: 'dice', bond: 'friend' }],
  },
  ragna: {
    traits: T(0, 0.6, 0.7, 0.3, 0.1, 0, 0.4), voice: 'blunt', likes: ['tools', 'gems', 'weapons'], dislikes: ['sweets', 'flowers'],
    about: 'I fold Aurelle steel. Heavier purse, lighter grave.',
    want: 'Starmetal. Every smith wants starmetal.',
    secret: 'I trained under Fröst in the Glen. Left after a row about quenching. He was right. I\'ll never say so.',
    ties: [{ id: 'froest', bond: 'mentor' }],
    fond: 'For you, the good steel at the bad price.',
    scorn: 'My forge is closed to you.',
  },
  // The Royal Capital
  king: {
    traits: T(0.2, 0.3, 0.5, -0.2, 0.2, 0.4, -0.2), voice: 'formal', likes: ['books', 'gems', 'drink'], dislikes: ['fish', 'tools'],
    about: 'I have worn this crown for twenty-two years. It has not grown lighter.',
    want: 'That my daughter inherits a kingdom and not a war.',
    secret: 'I do not sleep. The physicians call it a melancholy. I call it the Dark, knocking.',
    ties: [{ id: 'queen', bond: 'spouse' }, { id: 'chancellor', bond: 'friend' }, { id: 'marshal', bond: 'friend' }],
    fond: 'Cresha owes you. I owe you. A king does not say that lightly.',
    scorn: 'You will not be admitted to this court again.',
  },
  queen: {
    traits: T(0.5, 0.4, 0.6, -0.3, 0.3, 0.5, -0.3), voice: 'formal', likes: ['flowers', 'books', 'trinkets'], dislikes: ['weapons', 'coin'],
    about: 'I keep the court\'s charities and, when he lets me, the king\'s counsel.',
    want: 'A hospital in the Lower City, with real physicians, not the Hands\' back-room surgeons.',
    secret: 'I go to the Lower City in a plain cloak once a month. The Crown Guard think I am at prayer.',
    ties: [{ id: 'king', bond: 'spouse' }, { id: 'priestess', bond: 'friend' }],
    fond: 'You are a friend of this house. Come whenever you like.',
    scorn: 'I had hoped better of you.',
  },
  chancellor: {
    traits: T(-0.4, 0, -0.3, 0.5, -0.2, 0, 0.1), voice: 'formal', likes: ['coin', 'books', 'gems'], dislikes: ['flowers', 'sweets'],
    about: 'I keep the Royal Seal. Which is to say: nothing in Cresha happens unless I agree that it does.',
    want: 'Order. Ledgers that balance. Fewer adventurers.',
    secret: 'The treasury is short by a sum I will not name, and I have been hiding it for three years.',
    ties: [{ id: 'king', bond: 'friend' }, { id: 'marshal', bond: 'rival' }],
    fond: 'You are useful. I value useful.',
    scorn: 'I have a file on you. It grows.',
  },
  marshal: {
    traits: T(0.1, 0.9, 0.7, -0.1, 0, 0.2, 0.3), voice: 'gruff', likes: ['weapons', 'drink', 'food'], dislikes: ['books', 'trinkets'],
    about: 'I command the Silver Lance. Three hundred lances, and not one of them sharp enough for what\'s coming.',
    want: 'More lances. Better ones. And the Chancellor\'s signature on the requisition.',
    secret: 'I have asked the king to let me retire. He said no. I was relieved.',
    ties: [{ id: 'king', bond: 'friend' }, { id: 'chancellor', bond: 'rival' }, { id: 'gawen', bond: 'mentor' }],
    fond: 'There\'s a lance in the Silver Lance with your name on it, if you ever want it.',
    scorn: 'You\'re a disgrace to anyone who ever held a sword.',
  },
  crownCaptain: {
    traits: T(0, 0.7, 0.8, -0.2, -0.1, 0.1, 0.2), voice: 'blunt', likes: ['weapons', 'food'], dislikes: ['drink', 'trinkets'],
    about: 'Captain of the Crown Guard. If you\'re near the king, you\'re near me.',
    want: 'One week where nobody tries to stab anybody in this palace.',
    secret: 'I know where the queen goes once a month. I follow her. She doesn\'t know.',
    ties: [{ id: 'queen', bond: 'friend' }],
    fond: 'I\'d trust you at the king\'s back. That\'s the most I say about anyone.',
    scorn: 'Touch the palace gate and I\'ll have you in irons.',
  },
  priestess: {
    traits: T(0.6, 0.3, 0.7, -0.5, 0, 0.9, -0.4), voice: 'formal', likes: ['flowers', 'books', 'herbs'], dislikes: ['weapons', 'coin'],
    about: 'I keep the Temple of the Dawn. The light does not need keeping. The people do.',
    want: 'That the Dawn still rises over Cresha when I\'m gone.',
    secret: 'I have doubted. For a whole winter, once. The light came back. I still don\'t know why.',
    ties: [{ id: 'queen', bond: 'friend' }],
    fond: 'The Dawn walks with you. I have seen it.',
    scorn: 'I will pray for you. It\'s all I can do now.',
  },
  archmage: {
    traits: T(-0.2, 0.4, 0.5, 0, 0.1, -0.6, 0.3), voice: 'formal', likes: ['books', 'gems', 'potions'], dislikes: ['food', 'drink'],
    about: 'I run the Arcane Collegium. I teach fire to people who mostly want to set things on fire.',
    want: 'Magus Orren back at the Collegium. He was the best of us.',
    secret: 'I sealed the shelf in Orren\'s tower myself, forty years ago. I know what\'s on it.',
    ties: [{ id: 'magus', bond: 'friend' }],
    topics: [{ q: 'You know Magus Orren?', a: 'We studied together. He left. I stayed. One of us made the right choice, and I am not sure which.', min: 'warm' }],
    fond: 'You have a mind worth teaching. That is rare.',
    scorn: 'The Collegium\'s doors are closed to you.',
  },
  lark: {
    traits: T(0.5, 0.2, 0.2, 0.2, 0.9, -0.2, 0), voice: 'flowery', likes: ['drink', 'coin', 'flowers'], dislikes: ['weapons', 'books'],
    about: 'I sing at the Gilded Stag. Songs about heroes, mostly. You could be in one, if you do something worth rhyming.',
    want: 'A song that\'s still sung after I\'m gone.',
    secret: 'Half my heroic ballads are about the same man. He was a turnip farmer. He was lovely.',
    ties: [{ id: 'stagKeeper', bond: 'friend' }],
    fond: 'I\'ve started a song about you. Don\'t ask what rhymes with your name.',
    scorn: 'I\'ve started a song about you too. You won\'t like it.',
  },
  stagKeeper: {
    traits: T(0.4, 0.3, 0.5, 0.3, 0.4, 0, 0.1), voice: 'folksy', likes: ['drink', 'food', 'coin'], dislikes: ['weapons'],
    about: 'The Gilded Stag\'s the best inn in the Capital. Ask anyone. Ask Lark, she\'ll sing it.',
    want: 'A royal warrant over the door. Just a little one.',
    secret: 'The stag over the bar is plaster. Painted gold. Don\'t touch it, it flakes.',
    ties: [{ id: 'lark', bond: 'friend' }],
  },
  vesper: {
    traits: T(-0.3, 0.2, -0.2, 0.5, 0.4, 0, 0.2), voice: 'flowery', likes: ['gems', 'trinkets', 'drink'], dislikes: ['fish', 'herbs'],
    about: 'The Crown Ring is my set. Who comes, who goes, who\'s whispered about. Mostly the last one.',
    want: 'To be invited to the queen\'s table. Not the long one. The small one.',
    secret: 'Corvina Aurelle and I were girls together. I miss her. I would rather die than say so.',
    ties: [{ id: 'corvina', bond: 'rival' }],
  },
  twig: {
    traits: T(0.3, 0.4, -0.2, 0.4, 0.5, 0, 0.3), voice: 'cheery', likes: ['sweets', 'coin', 'food'], dislikes: ['books', 'flowers'],
    about: 'Twig. Just Twig. I live where I like and I know every roof in the Capital.',
    want: 'A hot meal every day. And a dog.',
    secret: 'I sleep in the Temple sometimes. The High Priestess leaves a blanket out. She thinks I don\'t know it\'s for me.',
    ties: [{ id: 'priestess', bond: 'friend' }],
  },
  gawen: {
    traits: T(0.4, 0.8, 0.8, -0.3, 0.2, 0.5, 0), voice: 'formal', likes: ['weapons', 'books', 'flowers'], dislikes: ['coin', 'drink'],
    about: 'A knight of the Silver Lance. The youngest. They remind me daily.',
    want: 'To be worthy of the lance. I am not sure yet that I am.',
    secret: 'I wrote a poem for Lark. I have not given it to her. It is in my boot.',
    ties: [{ id: 'marshal', bond: 'mentor' }, { id: 'lark', bond: 'sweetheart' }],
    fond: 'I would ride beside you anywhere.',
    scorn: 'You have no honour. I will not cross blades with you; it would shame the blade.',
  },
  librarian: {
    traits: T(0.1, -0.3, 0.7, -0.2, 0.3, 0, -0.2), voice: 'nervous', likes: ['books', 'potions', 'trinkets'], dislikes: ['weapons', 'drink'],
    about: 'The Royal Library. Four hundred thousand volumes. I\'ve read, um, most of them.',
    want: 'Quiet. Just a little more quiet. Please.',
    secret: 'There\'s a book in the restricted stacks that turns its own pages at night. I just leave it be.',
  },
};
Object.assign(CAST, CITY_CAST);
