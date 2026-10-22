// What Elder Glen's townsfolk say, and when. Each named townsperson greets you
// according to the hour, the weather, how far the story has come and what
// you've learned, and has more to talk about than their wares. Anyone can be
// asked for news: rumours point at quests, trials and places you haven't
// found yet, and change as you finish them.

export interface TalkCtx {
  hour: number;
  rain: boolean;
  /** quest finished / in progress */
  done(id: string): boolean;
  active(id: string): boolean;
  /** discipline learned, and the active combat class ('' for none) */
  learned(id: string): boolean;
  activeClass: string;
  level: number;
  /** spoken to this person before (this session) */
  met: boolean;
  /** today's date, and the last night raid (days since, beaten back, animals lost), if any */
  raid?: { ago: number; won: boolean; lost: number; gloam: boolean; defended: number } | null;
}

type When = (c: TalkCtx) => boolean;
interface Greeting {
  when?: When;
  text: string;
}
export interface Topic {
  q: string;
  a: string | ((c: TalkCtx) => string);
  when?: When;
}

const dawn: When = (c) => c.hour >= 5 && c.hour < 9;
const evening: When = (c) => c.hour >= 18 && c.hour < 22;
const night: When = (c) => c.hour >= 22 || c.hour < 5;
const wet: When = (c) => c.rain;
const grukkDead: When = (c) => c.done('mq-crypt');
const woodQuiet: When = (c) => c.done('mq-gravewood');

interface Voice {
  /** special greetings, first match wins (story beats before weather before time) */
  greet: Greeting[];
  /** extra things to ask about */
  topics: Topic[];
}

const lastNight: When = (c) => !!c.raid && c.raid.ago <= 1;

const VOICES: Record<string, Voice> = {
  brannoc: {
    greet: [
      { when: (c) => lastNight(c) && !!c.raid?.won && !!c.raid?.gloam, text: 'You saw it too. That tear in the dark, and what came out of it. Those weren\'t wolves. I don\'t know what they were, and I\'ve been on the walls twenty years. Thank you for standing with us.' },
      { when: (c) => lastNight(c) && !!c.raid?.won, text: 'There\'s the one who stood with us last night. The watch drinks to you tonight. And I\'ll say it plainly: we\'d have lost more than a few animals without you.' },
      { when: (c) => lastNight(c) && !c.raid?.won && (c.raid?.lost ?? 0) > 0, text: 'We lost animals last night. Good ones. The watch did what it could, but there weren\'t enough of us. Next time the horn goes, I\'d be glad of another sword.' },
      { when: (c) => lastNight(c) && !c.raid?.won, text: 'A long night. They came for the pens and we held them off until dawn, just. Next time the horn goes, I\'d be glad of another sword.' },
      { when: night, text: 'Quiet so far. I don\'t trust quiet.' },
    ],
    topics: [
      { q: 'What are these raids?', a: (c) => (c.raid?.gloam ? 'Wolves, we thought, at first. Then the tear opened past the pens and the things that came through it were wolves the way a shadow is a man. Something is wrong out there in the dark, and it\'s getting worse.' : 'Wolves, mostly, out of the north woods. Hungry ones. They go for the pens, and if the pens are empty they try the gates. When you hear the horn, come running. Or don\'t, and we\'ll manage. Mostly.') },
      { q: 'How can I help the watch?', a: 'When the horn goes, find the pens it names and put yourself between them and whatever\'s coming. We\'ll be there. Stand with us often enough and you\'ll wear our colours.', when: (c) => (c.raid?.defended ?? 0) < 3 },
    ],
  },
  kaela: {
    greet: [
      { when: (c) => c.activeClass === 'gale' && grukkDead(c), text: 'There\'s my student. The whole yard heard about Grukk. Don\'t let it go to your feet: they still have to move.' },
      { when: (c) => c.active('trial-gale'), text: 'Three fights. Not three slimes you poked from a distance. Go on, the yard will still be here.' },
      { when: (c) => c.activeClass === 'gale', text: 'Back for more? Good. Flow fades when you stand still, and so do students.' },
      { when: (c) => c.activeClass === 'boundary', text: 'Corvin\'s shield-bearer. Hm. You still need to learn to get out of the way of things.' },
      { when: wet, text: 'Rain\'s the best teacher there is. Mud punishes heavy feet.' },
      { when: dawn, text: 'Early. I like that. The yard\'s quiet before the watch changes.' },
      { when: night, text: 'It\'s late to be swinging steel. Unless something out there is swinging first?' },
      { text: 'Feet apart. Shoulders loose. You hold that blade like it owes you money.' },
      { text: 'Watch my hips, not my hands. Hands lie.' },
    ],
    topics: [
      { q: 'How do I get better at fighting?', a: 'Lock on (middle mouse or Q) and the world gets smaller. Dodge through a blow rather than away from it. Parry (F) when you see the swing start, not when it lands. And never fight on an empty stamina bar.' },
      { q: 'What does a parry do?', a: 'A clean parry knocks the enemy reeling. You get a couple of seconds where every cut lands as a critical. Waste it on admiring yourself and they\'ll remind you.' },
      { q: 'Shield or two blades?', a: 'Corvin will tell you to stand your ground. Ilse, at the Wayfarer\'s Rest, will tell you two blades. I\'ll tell you to keep your feet moving, and carry whatever lets you do it.' },
    ],
  },
  froest: {
    greet: [
      { when: woodQuiet, text: 'The hero of the Gravewood, at my humble stall. I\'ve put out the good steel. The very good steel.' },
      { when: grukkDead, text: 'Grukk\'s gone, they\'re saying, and you\'re the one who did it. Come here, let me see what you used. Hm. Yes, we can do better.' },
      { when: wet, text: 'Mind the drip off the awning. Rain and hot iron make a terrible noise.' },
      { when: evening, text: 'Banking the forge for the night. If you want something, want it quickly.' },
      { when: night, text: 'Forge is cold. I\'m not. What is it?' },
      { text: 'Ah, a customer! A real town needs a real forge, and this town is finally getting one.' },
      { text: 'Pick something useful. I can sell you the steel; what you do with it is your business.' },
    ],
    topics: [
      { q: 'How do I choose a weapon?', a: 'Damage is how hard it bites. Speed is how often. A heavy blade wins slow fights; a quick one wins scrappy ones. The numbers on my ledger show green where it beats what you carry and red where it doesn\'t.' },
      { q: 'Will you get better stock?', a: (c) => (grukkDead(c) ? 'I have. And when the Gravewood\'s been put to rest, I\'ve a few pieces with something extra in them.' : 'When someone proves this town\'s worth arming properly. Deal with whatever\'s up at that crypt and I\'ll open the back room.') },
      { q: 'Is it worth selling things to you?', a: 'For about a third of what I charge, aye. Ore and hides I\'ll pay better for. And if you sell me something you regret, I\'ll sell it back to you at what I paid, today only.' },
    ],
  },
  magus: {
    greet: [
      { when: woodQuiet, text: 'The wheel turns again, and I can sleep. You have my thanks, and the Order\'s, wherever it is now.' },
      { when: (c) => c.active('trial-pyro'), text: 'The crypt mouth, after dark. Sit with the flame and don\'t run. That is the whole of the trial, and nobody finds it easy.' },
      { when: (c) => c.learned('pyromancer'), text: 'How is the Heat treating you? Not too well, I hope. The ones it treats well grow careless.' },
      { when: night, text: 'The stars are loud tonight. You hear them too, I think, though you don\'t know it yet.' },
      { when: wet, text: 'Rain on the ley lines. They hum like a struck wire. Stand closer, you can almost feel it.' },
      { text: 'The ley lines are restless tonight. This town was built where three old roads of magic meet.' },
      { text: 'Fire is a guest. Feed it, and it stays. Forget it, and it eats the house.' },
    ],
    topics: [
      { q: 'What is Heat?', a: 'Every flame you call leaves some of itself in you. The hotter you run, the harder your fire bites. Past four fifths of what you can hold, it starts to burn you. At the top, you go off like a lamp dropped in oil. Spend it before it spends you.' },
      { q: 'Who else teaches magic?', a: 'Brother Aldous at the Chapel of the Dawn, out on the King\'s Road east of here, binds light. He will want you to keep the dawn vigil first. Wind I can start you on myself, once you\'re ready for it.' },
      { q: 'What are the Sunwheel stones?', a: (c) => (woodQuiet(c) ? 'A ward older than the kingdom, mended now. The stones touch one another across the land. Touch a waystone and you may find you can step from one to the next.' : 'Old stones with an old mark: a wheel with eight spokes. Somebody raised them long before Cresha had a king. I am still learning what they were for.') },
    ],
  },
  veyr: {
    greet: [
      { when: (c) => c.level >= 6, text: 'You stand differently now. Weight lower. Somebody has been teaching you, or something has.' },
      { when: wet, text: 'My knees know it\'s raining before the sky does.' },
      { text: 'A fighter who only knows how to attack is predictable. I was not. Once.' },
      { text: 'Sit, if you like. The bench has heard more war stories than any tavern.' },
    ],
    topics: [
      { q: 'What makes a good duelist?', a: 'Patience. Most fights are lost by the one who swings first and second and third. Let them show you their rhythm, then break it.' },
      { q: 'Tell me a story.', a: 'Thirty years ago a man challenged me on the Kingsbridge with a sword twice the length of mine. I let him swing until his arms shook, then I tapped his knuckles and walked home. He bought me supper for a year after. Reach is nothing without breath.' },
    ],
  },
  corvin: {
    greet: [
      { when: grukkDead, text: 'Grukk fell, and the road north is a little safer. That\'s a debt I couldn\'t pay myself. Thank you.' },
      { when: (c) => c.activeClass === 'boundary', text: 'Shield up, oath kept. Good. Tell me what hit you hardest out there.' },
      { when: night, text: 'I keep this gate at night. Old habit. Old promise.' },
      { when: wet, text: 'Rain off the hills. The road turns to soup north of here. Watch your footing in a fight.' },
      { text: 'You have the look of someone headed north. This town is the last safe roof before the hills.' },
      { text: 'Stand still a moment. You\'re carrying that shield like a tray.' },
    ],
    topics: [
      { q: 'How do I block properly?', a: 'Hold your shield up (right mouse) and face what\'s coming: a shield only covers your front, though you\'ll turn to meet whatever\'s closest. Every blow costs stamina; run dry and your guard breaks. Lower it now and then and breathe.' },
      { q: 'What is the Boundary?', a: 'A ring you draw around yourself when you stand still and hold your ground (F). Anything that reaches into it, a blade, a claw, an arrow, is turned aside. Holding it costs Focus, and moving breaks it. Learn to hold it in the right moment, not all the time.' },
      { q: 'Block or parry?', a: 'Block when you\'re not sure. Parry when you are. A parry costs you nothing and leaves them reeling; a block costs you stamina but forgives bad timing.' },
    ],
  },
  innkeeper: {
    greet: [
      { when: evening, text: 'Supper\'s on and the fire\'s lit. Come in out of the dark, love.' },
      { when: night, text: 'Late for a traveller. There\'s a room if you want it, and nobody will ask where you\'ve been.' },
      { when: dawn, text: 'Up with the bakers? There\'s porridge, and the tea is mostly hot.' },
      { when: wet, text: 'Wipe your boots! No, both of them. Thank you.' },
      { text: 'Warm bed, clean water, hot stew. The road can wait until morning.' },
    ],
    topics: [
      { q: 'Heard anything from travellers?', a: 'Carters off the King\'s Road say bandits are nesting on Hollow Ridge, and that Sergeant Tove at the Wayfarer\'s Rest is paying for their heads. Nasty business. The stew\'s good, though.' },
      { q: 'Who drinks here?', a: 'Half the village, most evenings. Elder Maud has a cup of cider after the plaza clears, Captain Brannoc pretends he doesn\'t, and the guild lot sing until I throw them out.' },
    ],
  },
  apothecary: {
    greet: [
      { when: wet, text: 'Rain\'s good for the herb beds and bad for my joints. Come in, mind the jars.' },
      { text: 'Roots, salts, distilled mana and enough bitter tincture to make an orc reconsider life choices.' },
      { text: 'Health draughts on the left, mana on the right. If anything on the top shelf moves, tell me.' },
    ],
    topics: [
      { q: 'Any advice for the road?', a: 'Drink the red before you need it, not after. And keep a blue for when the fight goes long. Nobody ever died from carrying one potion too many.' },
      { q: 'Do you need herbs?', a: 'Always. Hearthroot grows wild near the fields, and the orchard north-east of town has things that aren\'t apples, if you look.' },
    ],
  },
  baker: {
    greet: [
      { when: dawn, text: 'First loaves are out! Careful, they bite back when they\'re this hot.' },
      { when: night, text: 'Shop\'s shut, but I\'m kneading for the morning. You can have yesterday\'s for nothing.' },
      { text: 'Fresh bread! The Guild eats like a small army after a long contract.' },
    ],
    topics: [{ q: 'How is the harvest?', a: 'Good, if we get it in before the rain. Old Wren Barley\'s been asking for spare hands in the south fields.' }],
  },
  tailor: {
    greet: [{ text: 'A cloak tells people where you have been. Mine are made for getting back alive.' }],
    topics: [{ q: 'What should I wear?', a: 'Whatever you can still run in. Heavy plate stops a blow, but it won\'t help you if you can\'t get out of the way of the next one.' }],
  },
  carpenter: {
    greet: [
      { when: wet, text: 'Timber swells in the rain. So does my temper.' },
      { text: 'Every wall, cart and shield in town has my fingerprints on it.' },
    ],
    topics: [{ q: 'Are your shields any good?', a: 'Linden and an iron rim. Light, quick, and they\'ll take a sword or ten. Ask Fröst for a heater if you mean to stand in front of orcs all day.' }],
  },
  arcanist: {
    greet: [{ text: 'Magic is expensive because mistakes are expensive.' }],
    topics: [{ q: 'Is magic dangerous?', a: 'Fire burns the caster too, if they\'re greedy. Light is kinder, but slower to anger. Wind will drop you on your back if you lean on it.' }],
  },
  stablemaster: {
    greet: [{ text: 'The frontier starts at the gate. A good mount makes the frontier smaller.' }],
    topics: [{ q: 'Where does the road go?', a: 'East along the King\'s Road: the Wayfarer\'s Rest, Millbrook, the Chapel of the Dawn and finally Port Aurelle on the sea. A long walk. A short ride.' }],
  },
};

/** What someone says when you walk up to them. */
export function greetingFor(id: string, fallback: string, c: TalkCtx, visit: number) {
  const v = VOICES[id];
  if (!v) return fallback;
  if (!c.met) return fallback; // first meeting: their introduction
  const special = v.greet.find((g) => g.when?.(c));
  if (special) return special.text;
  const plain = v.greet.filter((g) => !g.when);
  return plain.length ? plain[visit % plain.length].text : fallback;
}

/** Extra things to ask this townsperson about right now. */
export function topicsFor(id: string, c: TalkCtx) {
  return (VOICES[id]?.topics ?? []).filter((t) => !t.when || t.when(c)).map((t) => ({ q: t.q, a: typeof t.a === 'string' ? t.a : t.a(c) }));
}

/**
 * Rumours: news that points somewhere useful, freshest first. Elder Glen's
 * folk talk about Elder Glen; people elsewhere only know the wider news.
 */
export function rumours(c: TalkCtx, inGlen = true): string[] {
  const out: string[] = [];
  if (inGlen && c.raid && c.raid.ago <= 1) {
    if (c.raid.gloam) out.push(c.raid.won ? 'Did you see the light past the pens last night? Like the night itself tore open. Black wolves came out of it. The watch says you drove them back in.' : 'Something tore the night open past the pens last night, and black wolves came out of it. Brannoc won\'t talk about it. That frightens me more than the wolves.');
    else out.push(c.raid.won ? 'Wolves at the pens last night! The horn woke the whole village. They say you were out there with the watch. Well done.' : `Wolves got at the pens last night${c.raid.lost ? `, ${c.raid.lost} ${c.raid.lost === 1 ? 'animal' : 'animals'} lost` : ''}. Old Bren is bandaged to the elbow from trying to drive them off with a pitchfork.`);
  }
  if (inGlen) {
    if (!c.done('mq-crypt')) out.push('There\'ve been lights up at the old crypt on the hill, north of here. Shepherds won\'t take the flocks past it any more. Orcs, they say.');
    if (c.done('mq-crypt') && !c.done('mq-gravewood')) out.push('The Gravewood, south-west, has gone wrong. Folk heard bells there, and there\'s no bell in it. Magus Orren looks like he hasn\'t slept.');
    if (!c.learned('gale') && !c.active('trial-gale')) out.push('Kaela Voss at the drill yard teaches Gale Style, the quick sword. She sets you a test first: win three real fights and come back standing.');
    if (!c.learned('pyromancer') && !c.active('trial-pyro')) out.push('Magus Orren will teach fire, but only after you\'ve kept a night vigil at the crypt mouth. My cousin tried. Ran home by midnight.');
    if (!c.learned('boundary') && !c.active('trial-boundary')) out.push('Ser Corvin at the north gate teaches the Boundary, standing your ground so nothing gets through. He\'ll want to see you turn aside fifteen blows first. Grim fellow. Kind, underneath.');
  }
  if (!c.learned('cross') && !c.active('trial-cross')) out.push('A fencer called Ilse is staying at the Wayfarer\'s Rest on the King\'s Road. She fights with two swords and teaches anyone who can keep her rhythm.');
  if (!c.learned('lightbinder') && !c.active('trial-light')) out.push('There\'s a chapel out on the King\'s Road, the Chapel of the Dawn. Brother Aldous there teaches the binding of light to anyone who keeps the dawn vigil with him.');
  if (c.done('mq-gravewood') && inGlen) out.push('They say the Knight\'s Academy in Port Aurelle takes cadets from anywhere, if they can last a bout in the ring. Elder Maud has been asking after you about it.');
  out.push(
    'Bandits up on Hollow Ridge, off the King\'s Road. Sergeant Tove at the Wayfarer\'s Rest is paying good coin to see them gone.',
    'Something big has been taking sheep at Millbrook. Old Garth swears its paw prints are as wide as a dinner plate.',
    'Old waystones stand along the roads with a wheel carved on them. Touch one, and I hear you can find your way back to it.',
    'The rivers are full of pike and the sea is full of worse. Either way, the fishmongers pay fair.',
    'When it rains, half the town crowds under the nearest roof. The other half pretends not to mind.',
  );
  return out;
}
