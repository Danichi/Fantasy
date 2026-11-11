import { DISC } from '../paths/data';

// The world notices your class (docs/design/classes.md): now and then, someone
// who already knows you remarks on how you fight instead of saying hello.

const SPECIFIC: Record<string, string[]> = {
  ranger: ['A Ranger? Then you\'ll know the woods are louder than they used to be.', 'Bow on your back. Good. Things out there don\'t like to be close.'],
  lancer: ['A Lancer? We could use one at the gate.', 'That spear of yours is longer than my cart. Mind the washing line.'],
  brawler: ['You\'re the one who fights with their bare hands? Remind me never to owe you money.', 'Knuckles like that, you must win every tavern argument.'],
  rogue: ['Hands where I can see them, friend. Just a habit.', 'I count my purse twice after you pass. No offence.'],
  woodsman: ['An axe and a straight back. Garth\'s been teaching you, hasn\'t he?', 'If you\'re ever short of work, the woodpile behind the inn could use you.'],
  earthshaper: ['Is it true you can talk to stone? Ask it why my wall keeps falling down.', 'The ground felt odd this morning. Was that you?'],
  tidecaller: ['You smell of the sea. Not unpleasantly. Just very much.', 'Can you make it rain on the barley? Asking for my mother.'],
  druid: ['The birds go quiet when you walk past. Not scared. Listening.', 'My goat followed you halfway down the road yesterday. She never does that.'],
  gale: ['Light on your feet, you. Like the wind\'s carrying you.', 'Kaela\'s style, isn\'t it? I can tell by the way you never stand still.'],
  cross: ['Two swords? Doesn\'t that get confusing?', 'Left, right, left. I heard you practising behind the barn.'],
  boundary: ['You stand like Ser Corvin. Like nothing could move you.', 'I feel safer just with you standing there.'],
  warbreaker: ['You look like you\'ve been in a fight. You always look like you\'ve been in a fight.', 'Ilse says you hit like a falling tree. She meant it nicely.'],
  pyromancer: ['Keep your fire away from my thatch, please.', 'Warm day, or is that you?'],
  windcaller: ['My hat blew off when you walked past. Twice.', 'Can you do anything about the wind on washing day?'],
  lightbinder: ['There\'s a glow about you. The good kind.', 'Brother Aldous speaks well of you.'],
  necromancer: ['Leave my grandfather where he is, if you please.', 'The graveyard\'s been very quiet since you came. Too quiet.'],
  bloodmage: ['You\'re pale. Are you eating?', 'There\'s a bandage on your arm again.'],
  templar: ['The Dawn walks with you, I\'m told. Walk this way more often.', 'Bless you, and your mace.'],
  monk: ['You\'re very calm for someone who hits things for a living.', 'Brother Aldo says you can stand on one foot for an hour. Is that true?'],
  assassin: ['...I didn\'t see you there. I never see you there.', 'Don\'t stand behind me. Please.'],
  berserker: ['Is that your blood or someone else\'s? Never mind. Don\'t tell me.', 'You\'re smiling. Why are you smiling?'],
  paladin: ['A Paladin. The children have been playing at being you.', 'With you around, I sleep with the shutters open.'],
  beastmaster: ['Your wolves can stay outside, thank you.', 'Old Garth says you can talk to his dogs. He says they answer.'],
  seawitch: ['Old Nell\'s apprentice, they say. Don\'t curse my nets.', 'You leave wet footprints. Even when it\'s dry.'],
};

const BY_TIER: Record<string, ((name: string) => string)[]> = {
  foundation: [(n) => `Still learning to be a ${n}? We all start somewhere.`, (n) => `A ${n}, are you? There aren\'t many round here.`],
  advanced: [(n) => `A ${n}! I\'ve only ever heard of one before.`, (n) => `They say it takes years to become a ${n}. You don\'t look that old.`],
  hybrid: [(n) => `A ${n}? Two trades in one. Show-off.`, (n) => `I heard you\'d become a ${n}. Folk talk about you, you know.`],
  hidden: [(n) => `There\'s something about how you stand. ${n}, isn\'t it? I thought that was only a story.`, (n) => `My grandmother told tales of the ${n}s. I never thought I\'d see one.`],
  origin: [(n) => `That\'s old blood in you. ${n}, your people call it?`, (n) => `I\'ve never seen anyone fight like a ${n} before. Your people must be proud.`],
};

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/**
 * A remark on your fighting class, on roughly one day in three for any one
 * person (never on a first meeting), or null.
 */
export function classRemark(npcId: string, activeClass: string, day: number): string | null {
  const d = DISC[activeClass];
  if (!d || (d.fam !== 'combat' && d.fam !== 'magic')) return null;
  const h = hash(`${npcId}:${day}`);
  if (h % 3 !== 0) return null;
  const own = SPECIFIC[d.id];
  if (own && h % 2 === 0) return own[(h >>> 3) % own.length];
  const tier = BY_TIER[d.tier ?? 'foundation'] ?? BY_TIER.foundation;
  return tier[(h >>> 5) % tier.length](d.name);
}
