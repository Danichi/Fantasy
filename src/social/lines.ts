import type { Profile, Voice } from './profile';
import type { Memory, Mood } from './reputation';

// The line library (NPC overhaul, phases 1-2). Every situation has a pool of
// lines, many written per way of speaking (a gruff guard and a cheery baker
// greet you differently), some only for certain natures (the brave, the
// timid, the hot-tempered). Lines carry tokens filled in from the speaker's
// profile and the moment ({you}, {town}, {friend}, {deed}...). A person never
// repeats one of their last few lines, and the pick is varied per person.

export interface LineCtx {
  hour: number;
  rain: boolean;
  /** what the player is called by this person */
  you: string;
  town: string;
  /** the latest thing the town says about you (good or bad) */
  deed?: string;
  deedGood?: boolean;
  /** another resident to mention */
  other?: string;
  /** days since you last spoke (-1: never) */
  away: number;
}

type Cond = (p: Profile) => boolean;
interface Entry {
  t: string;
  v?: Voice[];
  when?: Cond;
}
type Pool = (string | Entry)[];

const warm: Cond = (p) => p.traits.warmth > 0.25;
const cold: Cond = (p) => p.traits.warmth < -0.25;
const brave: Cond = (p) => p.traits.courage > 0.2;
const timid: Cond = (p) => p.traits.courage < -0.2;
const hot: Cond = (p) => p.traits.temper > 0.3;
const funny: Cond = (p) => p.traits.humor > 0.35;
const honest: Cond = (p) => p.traits.honesty > 0.2;
const sly: Cond = (p) => p.traits.honesty < -0.2;
const greedy: Cond = (p) => p.traits.greed > 0.3;
const pious: Cond = (p) => p.traits.piety > 0.35;

const F: Voice[] = ['folksy'], G: Voice[] = ['gruff'], FO: Voice[] = ['formal'], FL: Voice[] = ['flowery'], B: Voice[] = ['blunt'], N: Voice[] = ['nervous'], C: Voice[] = ['cheery'];

export const LINES: Record<string, Pool> = {
  // ---- greetings by how they feel about you ----
  'greet.first': [
    { t: 'Don\'t think I know you. New to {town}?', v: [...F, ...B] },
    { t: 'A new face. We get fewer than you\'d think. Welcome to {town}.', v: [...F, ...C] },
    { t: 'Who\'s this, then? Haven\'t seen you about.', v: G },
    { t: 'Good day to you, stranger. I don\'t believe we\'ve been introduced.', v: FO },
    { t: 'Oh! A stranger, and a well-travelled one by the look of those boots. Welcome, welcome.', v: FL },
    { t: 'Oh. Hello. Um. Can I help you?', v: N },
    { t: 'Hello hello! You\'re new! I know everyone, and I don\'t know you, so you must be new.', v: C },
    { t: 'You\'re not from here.', v: B },
  ],
  'greet.hostile': [
    { t: 'You. Get away from me.', v: [...B, ...G] },
    { t: 'I\'ve nothing to say to you. Nothing.', v: [...FO, ...F] },
    { t: 'Keep your distance. I mean it.', v: [...N, ...G] },
    { t: 'The nerve, coming up to me after what you did.', v: [...FL, ...F, ...C] },
    { t: 'Leave. Before I call the Watch.', when: brave },
    { t: 'P-please. Just go.', when: timid },
  ],
  'greet.cold': [
    { t: 'What do you want.', v: [...G, ...B] },
    { t: 'Make it quick.', v: [...G, ...B, ...F] },
    { t: 'I suppose you want something. People like you always do.', v: [...FO, ...FL] },
    { t: 'Oh. It\'s you.', v: [...C, ...N, ...F] },
    { t: 'I\'m busy. Unless you\'ve come to apologise.', when: hot },
  ],
  'greet.wary': [
    { t: 'Hm. You again.', v: [...G, ...B] },
    { t: 'I\'ll hear you out. That\'s all I\'ll promise.', v: [...FO, ...F] },
    { t: 'Afternoon. If that\'s what it is.', v: [...F, ...G] },
    { t: 'Ah. Hello. What is it?', v: [...N, ...C] },
    { t: 'You\'ve a way of turning up. What is it this time?', v: [...FL, ...B] },
  ],
  'greet.neutral': [
    { t: 'Morning. Or is it afternoon already?', v: F },
    { t: 'What can I do for you?', v: [...F, ...B, ...FO] },
    { t: 'Aye?', v: G },
    { t: 'Well met. How may I help?', v: FO },
    { t: 'Ah, a visitor! What brings you my way?', v: FL },
    { t: 'Oh! Hello. Sorry, you startled me.', v: N },
    { t: 'Hi! Nice day for it, isn\'t it? Whatever "it" is.', v: C },
    { t: 'Yes?', v: B },
    { t: 'Another day in {town}. What\'s yours?', v: [...F, ...G] },
  ],
  'greet.warm': [
    { t: 'Good to see you, {you}.', v: [...F, ...B, ...FO] },
    { t: 'There you are. Was hoping you\'d come by.', v: [...F, ...C] },
    { t: 'Ah. You. Good.', v: G },
    { t: 'Always a pleasure, {you}. Truly.', v: FO },
    { t: '{you}! You brighten the street just walking down it.', v: FL },
    { t: 'Oh, it\'s you. Thank goodness. I mean, hello.', v: N },
    { t: 'Hey, {you}! I was just thinking about you. Not in a strange way.', v: C },
    { t: 'Back again. Good.', v: B },
  ],
  'greet.friend': [
    { t: 'My friend! Sit a moment, if you\'ve a moment.', v: [...F, ...C, ...FL] },
    { t: '{you}. Glad you\'re still in one piece.', v: [...G, ...B] },
    { t: 'There\'s the face I wanted to see today.', v: [...F, ...FO, ...C] },
    { t: 'Well, look who it is. The best thing to happen to {town} all week.', v: [...FL, ...C] },
    { t: 'You. Good. I\'ve been meaning to tell you something.', v: [...B, ...G, ...N] },
  ],
  'greet.devoted': [
    { t: '{you}! Whatever you need. You only have to ask.', v: [...F, ...C, ...FL] },
    { t: 'I\'d walk into the Gravewood for you, {you}. Don\'t make me, mind.', v: [...G, ...B, ...F], when: (p) => p.traits.humor > -0.2 },
    { t: 'My door\'s always open to you. You know that.', v: [...FO, ...N, ...F] },
    { t: 'You\'re family now, as far as I\'m concerned.', v: [...F, ...FL, ...C] },
  ],
  // ---- what colours a greeting ----
  'greet.back': [
    'Haven\'t seen you in an age.', 'Where have you been hiding?', 'Thought you\'d gone off and got yourself killed.', 'Back from the wilds, then.', 'It\'s been a while.',
  ],
  'greet.morning': ['Early start?', 'Sun\'s barely up.', 'Mornings. Can\'t abide them.', 'Fine morning for it.', { t: 'Light keep you this morning.', when: pious }],
  'greet.evening': ['Long day?', 'Nearly time to put my feet up.', 'Evening\'s drawing in.'],
  'greet.night': ['It\'s late to be about.', 'Can\'t sleep either?', 'Mind the dark out there.', { t: 'Say a prayer before you sleep. The dark\'s thick tonight.', when: pious }],
  'greet.rain': ['Wretched weather.', 'You\'re soaked through.', 'Rain\'s good for the fields, bad for my knees.', 'Come in out of the wet, if you like.'],
  'greet.goodDeed': [
    { t: 'They say {deed}. Is it true?', v: [...F, ...C, ...N] },
    { t: 'Heard {deed}. Not bad.', v: [...G, ...B] },
    { t: 'The whole town\'s saying {deed}. I\'m impressed.', v: [...FO, ...FL] },
    { t: 'Word is {deed}. Thank you, truly.', when: warm },
  ],
  'greet.badDeed': [
    { t: 'They say {deed}. I hope it\'s not true.', when: (p) => !cold(p) },
    { t: 'Heard {deed}. I\'m keeping my eye on you.', when: brave },
    { t: 'Everyone knows {deed}. Everyone.', v: [...B, ...G, ...FO] },
    { t: 'P-people are saying {deed}...', when: timid },
  ],
  // ---- your words (what the player says, by tone) ----
  'you.kind': [
    'You look well today.', 'Thank you for always having a kind word.', 'This town\'s lucky to have someone like you.', 'How are you keeping, truly?', 'I like what you\'ve done with the place.', 'You work harder than anyone I\'ve met here.',
  ],
  'you.rude': [
    'Must be a slow day if you\'re the best company around.', 'Do you ever stop talking?', 'I\'ve met friendlier wolves.', 'You smell like the back end of a cow.', 'Out of my way.', 'Is this really the best {town} can do?',
  ],
  'you.threat': [
    'Answer me, or I\'ll make you.', 'Nice place. Would be a shame if it burned.', 'Careful. I\'ve killed for less.', 'You\'ll do what I say, or you\'ll regret it.',
  ],
  // ---- their answers to your tone ----
  'react.kind': [
    { t: 'That\'s kind of you to say.', v: [...F, ...FO, ...N] },
    { t: 'Hm. Thanks.', v: [...G, ...B] },
    { t: 'Oh, stop it. No, don\'t stop it.', v: [...C, ...FL], when: funny },
    { t: 'Well! You\'ve made my morning.', v: [...C, ...FL, ...F] },
    { t: 'Flattery. I know it when I hear it. Still, thank you.', when: cold },
    { t: 'You\'re a good sort, {you}.', when: warm },
  ],
  'react.rude': [
    { t: 'Say that again. Go on.', when: (p) => hot(p) && brave(p) },
    { t: 'Charming. Truly.', v: [...FO, ...FL, ...B] },
    { t: 'There\'s no call for that.', v: [...F, ...N, ...C] },
    { t: 'I\'ve had worse said by better.', v: [...G, ...B], when: brave },
    { t: 'Oh. I... see.', when: timid },
    { t: 'Ha! You\'ve a tongue on you. I\'ll give you that.', when: funny },
  ],
  'react.threat': [
    { t: 'Try it. See where it gets you.', when: brave },
    { t: 'Please, I don\'t want any trouble. I\'ll do what you want.', when: timid },
    { t: 'The Watch will hear about this.', when: (p) => !timid(p) && !brave(p) },
    { t: 'You\'d threaten me? In my own town?', v: [...FO, ...FL, ...G] },
    { t: 'Gods. Get away from me.', v: [...N, ...C] },
  ],
  'react.childThreat': ['*bursts into tears and runs*', 'I\'m telling my mum!', 'Leave me alone!'],
  // ---- persuasion and bribes ----
  'persuade.ok': [
    { t: 'Well... when you put it like that. Fine.', v: [...F, ...C, ...N] },
    { t: 'Hmph. You\'ve a point.', v: [...G, ...B] },
    { t: 'A fair argument. Very well.', v: [...FO, ...FL] },
  ],
  'persuade.fail': [
    { t: 'Nice try.', v: [...B, ...G, ...C] },
    { t: 'I don\'t think so.', v: [...F, ...FO, ...N] },
    { t: 'You\'ll have to do better than that.', v: [...FL, ...F, ...G] },
  ],
  'bribe.ok': [
    { t: 'I didn\'t see a thing. And I didn\'t take a thing.', when: sly },
    { t: 'Well, a body has to eat.', when: greedy },
    { t: 'Coin talks. What did you want?', v: [...B, ...G] },
    { t: 'Most generous. Most generous indeed.', v: [...FO, ...FL] },
    'Just this once.',
  ],
  'bribe.no': [
    { t: 'Put your money away. I\'m not for sale.', when: honest },
    { t: 'You think I can be bought? Get out.', when: (p) => honest(p) && hot(p) },
    { t: 'Keep it. Some of us still have our pride.', v: [...FO, ...F] },
  ],
  // ---- gifts ----
  'gift.loved': [
    { t: 'For me? Oh, you shouldn\'t have. You really should have.', v: [...C, ...FL, ...F] },
    { t: 'That\'s... that\'s exactly what I wanted. How did you know?', v: [...N, ...F, ...FO] },
    { t: 'Hm. Good. This is good. Thank you.', v: [...G, ...B] },
  ],
  'gift.liked': [
    { t: 'That\'s thoughtful of you. Thank you.', v: [...F, ...FO, ...N] },
    { t: 'Oh, how lovely!', v: [...C, ...FL] },
    { t: 'I\'ll use this. Thanks.', v: [...G, ...B] },
  ],
  'gift.neutral': ['Oh. Thank you. I\'ll... find a place for it.', 'That\'s very kind, I\'m sure.', 'Huh. Well. Thanks.'],
  'gift.disliked': [
    { t: 'What am I meant to do with this?', v: [...B, ...G, ...C] },
    { t: 'I... don\'t care for these, I\'m afraid.', v: [...FO, ...N, ...FL] },
    { t: 'You don\'t know me very well, do you?', when: cold },
  ],
  'gift.tooMany': ['You\'ve given me enough for one day. Truly.', 'Another one? Save something for tomorrow.'],
  // ---- apologies ----
  'apology.ok': [
    { t: 'Apology accepted. Don\'t make me regret it.', v: [...G, ...B, ...FO] },
    { t: 'Water under the bridge. Mostly.', v: [...F, ...C] },
    { t: 'Thank you for saying so. That took something.', when: warm },
  ],
  'apology.no': [
    { t: 'Words are cheap.', v: [...B, ...G] },
    { t: 'Sorry doesn\'t mend it.', v: [...F, ...FO, ...N] },
    { t: 'Come back when you mean it. With something to show for it.', when: (p) => !warm(p) },
  ],
  // ---- refusals ----
  'refuse.service': [
    { t: 'I don\'t sell to your kind. Not any more.', v: [...B, ...G] },
    { t: 'My stall\'s closed. To you, it\'s closed.', v: [...F, ...C, ...N] },
    { t: 'I\'m afraid I must decline your custom.', v: [...FO, ...FL] },
  ],
  'refuse.quest': [
    'I\'ve no work for someone like you.', 'Ask someone else. Anyone else.', 'I wouldn\'t trust you to carry a bucket.',
  ],
  'refuse.secret': ['Some things I keep to myself. Ask me again when I know you better.', 'Maybe one day. Not today.'],
  // ---- small talk ----
  'small.self': ['{about}'],
  'small.want': [
    { t: 'What do I want? {want}', v: [...F, ...B, ...G, ...C] },
    { t: 'If I\'m honest? {want}', v: [...N, ...FO, ...FL] },
  ],
  'small.secret': [
    { t: 'Since it\'s you... {secret}', v: [...F, ...C, ...FL] },
    { t: 'Don\'t tell a soul. {secret}', v: [...N, ...B, ...G, ...FO] },
  ],
  'small.town': [
    '{town}\'s not much, but it\'s ours.', 'Things have been tense since the raids began.', 'The harvest festival\'s the best night of the year here.', 'Prices keep going up. Wages don\'t.', 'You hear things at the inn, if you listen.', 'The Watch does its best. Its best isn\'t always enough.',
  ],
  'small.weather': ['If it rains one more day my roof\'ll go.', 'Lovely day for once.', 'Wind\'s from the north. Means wolves, my gran used to say.', 'Too hot by half.'],
  'small.you': [
    { t: 'People talk about you, you know. {deed}', when: (p) => !cold(p) },
    { t: 'You fight for a living, then. Can\'t say I envy you.', when: timid },
    { t: 'You\'ve the look of someone who\'s seen things.', v: [...FO, ...FL, ...N] },
    { t: 'You carry yourself like a soldier. Or a thief. Hard to tell.', when: sly },
  ],
  // ---- other people (ties) ----
  'tie.spouse': ['My {bond}, {other}. Best thing that ever happened to me. Don\'t tell them I said so.', '{other} and I have been wed twelve years. Some of them happy.', 'That\'s my {bond}, {other}. Keeps me honest.'],
  'tie.sibling': ['{other}? My {bond}. We fought like cats as children. Still do.', 'My {bond} {other} got the brains. I got the looks. Allegedly.'],
  'tie.parent': ['My {bond}, {other}. Strict, but fair. Mostly strict.', '{other} raised me on this street. Ask them about me, they\'ll tell you everything. Don\'t.'],
  'tie.child': ['My little one, {other}. Runs me ragged.', '{other}\'s my {bond}. Too clever by half, that one.'],
  'tie.friend': ['{other}\'s a good friend. Would lend me their last copper.', 'You know {other}? We go back years.', 'If you see {other}, tell them they still owe me a drink.'],
  'tie.rival': [
    { t: '{other}? Don\'t get me started on {other}.', when: hot },
    '{other} and I don\'t see eye to eye. On anything.', 'I\'d sooner kiss a goat than ask {other} for help.',
  ],
  'tie.sweetheart': [
    { t: 'Have you met {other}? They\'re... nice. Very nice. Why are you smiling?', v: [...N, ...C, ...F] },
    { t: '{other} and I are walking out together. Not that it\'s anyone\'s business.', v: [...B, ...G, ...FO] },
  ],
  'tie.mentor': ['{other} taught me everything I know. Well. Most of it.'],
  // ---- barks: said in passing ----
  'bark.hostile': ['Murderer.', 'Keep walking.', 'Don\'t you dare.', 'I know what you did.', 'Watch out, it\'s that one.'],
  'bark.cold': ['Hmph.', 'Watch where you\'re going.', 'Not you again.', 'Keep your hands where I can see them.'],
  'bark.wary': ['...', 'Mind yourself.', 'Afternoon.'],
  'bark.neutral': ['Morning.', 'Afternoon.', 'Evening.', 'Mind the cart.', 'Lovely day.', 'Busy, busy.', 'You\'re not from round here, are you?', { t: 'Light keep you.', when: pious }],
  'bark.warm': ['Hello, {you}!', 'There\'s {you}.', 'Good to see you.', 'Stay safe out there.', 'Thanks again, {you}.'],
  'bark.friend': ['{you}! Come by later!', 'My favourite adventurer!', 'Drinks on me tonight, {you}.', 'Look who it is!'],
  'bark.devoted': ['Hero of {town}!', 'It\'s {you}! Make way!', 'Bless you, {you}.'],
  'bark.rain': ['Soaked again.', 'This rain\'ll never stop.', 'Ugh, my boots.'],
  'bark.night': ['Late, isn\'t it?', 'Off to bed for me.', 'Careful out there in the dark.'],
  'bark.child': ['Are you a knight?', 'Can I hold your sword?', 'Race you!', 'Have you killed a dragon?', 'My dad says adventurers are trouble.'],
  'bark.guard': ['Move along.', 'Keep the peace.', 'All quiet.', 'Eyes open.', 'No trouble today, eh?'],
  'bark.fear': ['Please don\'t hurt me.', 'Stay back!', 'It\'s them!', 'Run!'],
  'bark.weapon': ['Put that away, would you?', 'Mind where you swing that thing.', 'No steel drawn in town, friend.'],
  // ---- overheard: two townsfolk ----
  'chat.a': [
    'Did you hear? {deed}.', 'Have you seen {other} lately?', 'Prices at the market are criminal.', 'They say the wolves are bolder this year.', 'My back\'s killing me.', 'Going to the festival?', 'I swear the Watch gets younger every year.', 'Someone left the pen gate open again.',
  ],
  'chat.b': [
    'You don\'t say.', 'I heard different.', 'Mm. Shocking.', 'Not in front of the children.', 'That\'s what I keep telling everyone.', 'Ha! Typical.', 'Oh, don\'t.', 'Well, I never.',
  ],
  // ---- fear and pain ----
  'hurt': ['Agh! What are you doing?!', 'Help! Help me!', 'Stop! Please!', 'Guards! GUARDS!', 'Are you mad?!'],
  'hurt.brave': ['You\'ll pay for that!', 'Is that all you\'ve got?', 'Come on, then!'],
  'scream': ['Murder! Murder in the street!', 'Run! Everyone run!', 'Call the Watch!', 'Oh gods, oh gods!'],
  'knockedOut': ['*groans*', 'Ugh... my head...'],
  // ---- the Watch ----
  'guard.halt': [
    { t: 'Halt! You\'ve broken the law in {town}.', v: [...G, ...B, ...FO, ...F] },
    { t: 'Stop right there, criminal scum.', when: hot },
  ],
  'guard.cleared': ['Your debt is paid. Keep your nose clean.', 'We\'re square. Don\'t make me come looking for you again.'],
  'guard.attack': ['Then we do this the hard way!', 'Resisting! To arms!', 'So be it.'],
  'guard.jailed': ['A night in the cells will cool your blood.', 'Off you go. Mind the rats.'],
};

/** Fill in the tokens. */
export function fill(text: string, p: Profile, c: LineCtx, extra: Record<string, string> = {}) {
  return text
    .replace(/\{you\}/g, c.you)
    .replace(/\{town\}/g, c.town)
    .replace(/\{deed\}/g, extra.deed ?? c.deed ?? 'nothing much')
    .replace(/\{other\}/g, extra.other ?? c.other ?? 'old Hob')
    .replace(/\{bond\}/g, extra.bond ?? 'friend')
    .replace(/\{about\}/g, p.about)
    .replace(/\{want\}/g, p.want)
    .replace(/\{secret\}/g, p.secret)
    .replace(/\{name\}/g, p.first);
}

/** The lines in a pool this person can say (their voice and nature). */
function eligible(pool: Pool, p: Profile) {
  const out: { t: string; k: number }[] = [];
  pool.forEach((e, k) => {
    if (typeof e === 'string') return void out.push({ t: e, k });
    if (e.v && !e.v.includes(p.voice)) return;
    if (e.when && !e.when(p)) return;
    out.push({ t: e.t, k });
  });
  // Nobody is left speechless: if nothing suits, the voice filter is dropped.
  if (!out.length) pool.forEach((e, k) => out.push({ t: typeof e === 'string' ? e : e.t, k }));
  return out;
}

let roll = 0;
/**
 * A line for a person to say, from a pool. Avoids what they've said lately
 * (remembered in `mem.said`), varies per person and per moment.
 */
export function pickLine(cat: string, p: Profile, c: LineCtx, mem?: Memory, extra: Record<string, string> = {}): string {
  const pool = LINES[cat];
  if (!pool?.length) return '';
  const opts = eligible(pool, p);
  const said = mem?.said ?? [];
  const fresh = opts.filter((o) => !said.includes(cat + ':' + o.k));
  const from = fresh.length ? fresh : opts;
  roll = (roll + 1) >>> 0;
  const h = (p.id.length * 7 + roll * 31 + Math.floor(c.hour * 3)) >>> 0;
  const o = from[h % from.length];
  if (mem) {
    mem.said.push(cat + ':' + o.k);
    if (mem.said.length > 14) mem.said.shift();
  }
  return fill(o.t, p, c, extra);
}

/** The greeting pool for a mood. */
export const greetFor = (m: Mood) => `greet.${m}`;
