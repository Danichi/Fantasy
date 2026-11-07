import type { Profile, Voice } from './profile';

// What people say the first time they meet someone who is plainly not one of
// them (an elf, a dwarf, a beastfolk, a demon, a dragonkin). Not everyone
// remarks on it, and the ones who do say it in their own way: the nervous
// stammer, the gruff grunt, the devout reach for a charm, the friendly make
// a joke of it. A few lines belong to a particular region's people (the
// `react.<origin>.<faction>` pools). Used by social/conversation.ts.

type Cond = (p: Profile) => boolean;
interface Entry {
  t: string;
  v?: Voice[];
  when?: Cond;
}
type Pool = (string | Entry)[];

const warm: Cond = (p) => p.traits.warmth > 0.25;
const cold: Cond = (p) => p.traits.warmth < -0.25;
const timid: Cond = (p) => p.traits.courage < -0.2;
const funny: Cond = (p) => p.traits.humor > 0.35;
const greedy: Cond = (p) => p.traits.greed > 0.3;
const pious: Cond = (p) => p.traits.piety > 0.35;

const F: Voice[] = ['folksy'], G: Voice[] = ['gruff'], FO: Voice[] = ['formal'], FL: Voice[] = ['flowery'], B: Voice[] = ['blunt'], N: Voice[] = ['nervous'], C: Voice[] = ['cheery'];

/** How likely a stranger is to remark on what you are, by origin (how much you stand out). */
export const NOTICE: Record<string, number> = { elf: 0.45, dwarf: 0.45, beastfolk: 0.6, demon: 0.85, dragonkin: 0.8 };

export const ORIGIN_LINES: Record<string, Pool> = {
  'react.elf': [
    'An elf. Huh. You\'re the second interesting thing to happen this year, and the first was the blight.',
    'You\'ll have to excuse the stares. Folk here think elves are something out of a song.',
    'Elf, eh? Well, the wheat doesn\'t care what you are, and neither do I.',
    'Long way from the trees. Did you come for the scenery? There isn\'t any.',

    { t: 'An elf, in {town}! My gran used to say you lot could hear grass growing. ...Can you?', v: [...F, ...C] },
    { t: 'Don\'t see many of the forest folk this far from the trees. Welcome, I suppose.', v: [...F, ...B] },
    { t: 'Elf. Hm. You\'ll find we don\'t sing much round here.', v: G },
    { t: 'Forgive me for staring. I have only ever seen your people in paintings, and the paintings were wrong about the ears.', v: [...FO, ...FL] },
    { t: 'Oh! You\'re, um. An elf. Sorry. That\'s a stupid thing to say to an elf. Hello.', v: N },
    { t: 'Ooh, an elf! How old are you? No, don\'t tell me. Older than the mill, I bet.', v: C, when: funny },
    { t: 'Elves. Last one through here left without paying. Not saying you would.', when: greedy },
    { t: 'You\'re a long way from the forest, friend. Mind the roads; they\'re not kind to strangers this year.', when: warm },
  ],
  'react.elf.elves': [
    '"Aiya." (They touch two fingers to their brow.) Welcome home, sibling of the leaves.',
    'You walk like one of ours who has been among the short-lived too long. Sit. Rest your ears.',
  ],
  'react.elf.merchants': [
    { t: 'Elven custom! Your people pay in silver and patience, and I like both.', when: greedy },
  ],
  'react.elf.pirates': [
    'Pointy ears. You lot can see a sail at twenty miles, they say. Looking for work?',
  ],

  'react.dwarf': [
    'A dwarf, walking about in daylight. Don\'t see that every day.',
    'You\'re sturdier than you look. Which is saying something.',
    'Dwarf! You\'ll want Fröst, then. He thinks he\'s half dwarf, the way he goes on about steel.',
    'The mountains are that way, if you\'re lost. No? Just passing through, then.',

    { t: 'A dwarf! Mind the doorframe. Ha, no, you\'re fine. Welcome to {town}.', v: [...F, ...C], when: funny },
    { t: 'Dwarf. Good. Somebody round here who knows which end of a hammer to hold.', v: [...G, ...B] },
    { t: 'You\'re a long way from the mountains. What brings stone-folk down to {town}?', v: [...F, ...FO] },
    { t: 'I don\'t believe I have had the honour of a dwarf in my company before. You must forgive my manners if they are the wrong shape.', v: [...FO, ...FL] },
    { t: 'Oh. A dwarf. I didn\'t, um, I wasn\'t expecting... Hello!', v: N },
    { t: 'A dwarf! Is it true you can smell iron in the ground? Can you smell any here? Please say yes.', v: C },
    { t: 'Dwarf, eh. You\'ll want to haggle, I suppose. Your folk always do.', when: greedy },
    { t: 'Come in out of the wind. Your people built the old bridge on the north road, you know. Still standing.', when: warm },
  ],
  'react.dwarf.dwarves': [
    'Stone keep you, cousin. We don\'t haggle with our own.',
    'One of ours, walking the surface roads? Sit, then, and tell me which hall you come from.',
  ],
  'react.dwarf.knights': [
    'Dwarf-forged armour, is that? The armourers here would give a year\'s wage to see it up close.',
  ],

  'react.beastfolk': [
    'Didn\'t hear you come up. You walk soft for someone your size.',
    'Beastfolk. Huh. The dogs have been odd all morning; I suppose that explains it.',
    'You\'ll have the children asking if they can touch your ears. Say no. Firmly.',
    'Wild country, wild folk. Don\'t mind me. Good day.',

    { t: '(Their dog runs up to you, sniffs, and sits on your foot.) Well. He likes you. That settles it.', v: [...F, ...C] },
    { t: 'Wild folk. Keep your claws to yourself and we\'ll get on fine.', v: [...G, ...B] },
    { t: 'You\'re not from round here, are you? I mean, obviously. The ears. Sorry. Hello.', v: N },
    { t: 'Beastfolk! Can you smell rain coming? Tom Hale swears your people can. He\'d pay good money to know before the harvest.', v: [...F, ...C] },
    { t: 'I confess I have only ever read about your people. The books did not do you justice, I think.', v: [...FO, ...FL] },
    { t: 'Hm. Don\'t track mud in.', v: G, when: cold },
    { t: 'You must be tired, coming all that way on foot. Sit, if you like. Nobody here bites. Well. You might.', when: funny },
    { t: 'The children will follow you about all day. Let them; it\'s the most excitement they\'ve had since the thaw.', when: warm },
  ],
  'react.beastfolk.wildTribes': [
    'The pack sees you. Hunt well.',
    '(They tap their chest twice, the old greeting.) Run with us a while, cousin.',
  ],
  'react.beastfolk.pirates': [
    'A beastfolk! Good nose for a storm, your kind. Sit, sit.',
  ],

  'react.demon': [
    'Well. You\'re not what I expected to see today. Or ever.',
    'I\'ll be honest, the horns are taking some getting used to.',
    'Demon or no, you\'re a customer, and we\'ve had few enough of those.',
    'The priest will want a word with you, I expect. I don\'t. What do you need?',

    { t: '(Their hand goes to the charm at their neck.) We\'ve no trouble here. None at all.', when: pious },
    { t: '(They make the Dawn\'s sign, quickly, and pretend they didn\'t.) Can I... help you?', v: [...F, ...N], when: pious },
    { t: 'Horns. Right. I\'m going to assume you\'re here to buy something.', v: [...B, ...G] },
    { t: 'Oh gods. Oh. Sorry. Hello. You\'re a... sorry. Hello.', v: N, when: timid },
    { t: 'Well, you\'re not something we see every day. Warm in here, isn\'t it? Or is that you?', v: [...F, ...C], when: funny },
    { t: 'I have read that your people keep their word to the letter, and only to the letter. I shall choose mine carefully.', v: [...FO, ...FL] },
    { t: 'I don\'t care what you are. The Glen\'s burying people every week; a pair of hands is a pair of hands.', when: warm },
    { t: 'You\'ll forgive me if I keep my eyes on you. Nothing personal.', when: cold },
    { t: 'Coin is coin, even if it\'s warm.', when: greedy },
    { t: 'A demon in {town}. The old women are going to have a lot to say about this.', v: [...F, ...B] },
  ],
  'react.demon.knights': [
    '(The guard eyes your horns.) Walk careful in the Crown\'s streets. Careful.',
  ],
  'react.demon.demons': [
    'You\'ve come a long way from the ash, kin. Sit down before somebody prays at you.',
  ],
  'react.demon.pirates': [
    'A demon aboard brings luck or storms, sailors say. Which are you?',
  ],

  'react.dragonkin': [
    'You blot out the sun a bit, standing there. Not a complaint.',
    'Wings. Real ones. My nephew is going to be unbearable when I tell him.',
    'Don\'t take it amiss if folk duck when you stretch.',
    'Dragonkin, here. The Glen gets stranger every week.',

    { t: '(They stare at your wings, then remember themselves.) Old stories walk again. Welcome, I think.', v: [...F, ...FO] },
    { t: 'Wings. Indoors. Mind the lamps.', v: [...G, ...B] },
    { t: 'You can fly? Actually fly? Up there? I\'d be sick. Gods, I\'d be so sick.', v: [...C, ...F], when: funny },
    { t: 'Oh. Oh my. You\'re very... tall. And, um. Winged. Hello.', v: N },
    { t: 'My grandfather saw a dragon once, over the Crown Road, when he was a boy. He never stopped talking about it. He\'d have liked to meet you.', when: warm },
    { t: 'I had heard the wingborn were proud. You\'ll find nothing to be proud of in {town} this year, I\'m afraid.', v: [...FO, ...FL] },
    { t: 'Keep that fire to yourself. We\'ve lost enough roofs this year.', when: cold },
    { t: '(They make the Dawn\'s sign.) The old tales say your kind were here before the wheels. I hope the tales are wrong about the rest.', when: pious },
  ],
  'react.dragonkin.dwarves': [
    'The eyries remember your people, wingborn. Not all of it fondly.',
  ],
  'react.dragonkin.pirates': [
    'Keep that fire off the canvas and the powder, and you can sail with any crew in the port.',
  ],
};
