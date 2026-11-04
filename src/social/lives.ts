import type { Profile } from './profile';
import { seedOf } from './profile';
import { regionOf, type Region } from './voices';

// A life of their own for every townsperson (NPC revamp). Profiles used to
// draw from two or three lines a job and ten secrets for the whole world, so
// half a village told you the same life story. Here each person gets a line
// about their work, a detail of their own, a want and a secret, and nobody in
// the same town gets the same ones as a neighbour while there are others left.

const ABOUT_JOB: Record<string, string[]> = {
  farmer: [
    'I work the east rows. Three generations of us have, and the ground’s never been this sour.',
    'Born on the land and I’ll be buried in it. Sooner than I’d like, the way the year’s going.',
    'Barley, mostly. Some beans. Whatever the crows leave.',
    'I took the farm when my father’s back went. His back’s fine now. Mine isn’t.',
    'I plough with an ox called Duchess. She’s the most reliable soul in this valley.',
    'Thirty acres and a leaky barn. Rich, by some people’s reckoning.',
  ],
  merchant: [
    'I buy cheap at the port and sell dear here. Honestly dear, mind.',
    'Trader. My stall’s the one with the patched awning.',
    'I sell needles, salt and gossip. The gossip’s free and worth what you pay.',
    'I came up the King’s Road with one mule and a cart of pots. I’ve still got the mule.',
    'My mother kept this stall forty years. I’ve kept it six, and it shows.',
  ],
  guard: [
    'I stand the gate. Somebody has to.',
    'Watch. Brannoc’s lot. Seven years and I’ve never once been warm on duty.',
    'I was a carpenter before the Watch. I still mend the gate when nobody’s looking.',
    'Night watch, mostly. I sleep through the day and miss everything worth seeing.',
    'Joined because my brother did. He’s not in the Watch any more. He’s not anything any more.',
  ],
  child: [
    'I’m nearly ten! Well. Nearly nine.',
    'I’m the fastest runner on our lane. Probably in the whole world.',
    'I have a frog. His name is Captain. He lives in my pocket. Don’t tell Mum.',
    'I know where all the good hiding places are. All of them.',
    'I’m going to be in the Watch when I’m big. Or a baker. Bakers get the crusts.',
  ],
  elder: [
    'I’ve seen sixty winters. This is the first one I’ve been afraid of.',
    'Old enough to remember the last time the wolves came this bold, and what it cost.',
    'I keep the old songs. Nobody asks for them, but I keep them.',
    'I was a midwife. Half this village came into the world through my hands.',
    'My eyes are going, but I can still tell a liar by the way they stand.',
  ],
  miller: ['The wheel turns, the stones grind, the town eats. That’s the whole of it.', 'My father built that race. I keep it running with spit and swearing.'],
  smith: ['Fröst runs the forge. I just sweat in it.', 'I make nails, hinges, horseshoes. The heroic stuff.', 'Burns on both arms. Every one a lesson.'],
  innfolk: ['I pour the ale and listen to everyone’s troubles. I should charge for the second.', 'I cook. The stew’s good. Don’t ask what’s in it this year.'],
  shepherd: ['The flock and me, up on the north slope, from thaw to first snow.', 'I talk to sheep more than people. The sheep are better listeners.'],
  weaver: ['I weave. Wool from the north pasture, dye from wherever I can get it.', 'My looms are older than I am. They complain less.'],
  scavenger: [
    'I dig in the dunes for what the old cities left. Glass, mostly. Sometimes worse.',
    'I came out here when the city closed its wells. I dig, I trade, I drink when there’s water.',
    'I know the sand by its colour. Red means metal. White means bones.',
  ],
  sailor: ['Twenty years before the mast. My legs don’t know what to do on land.', 'I’ve crossed to the isles and back more times than I can count. Lost friends on most of them.'],
  dockhand: ['I carry crates for men who don’t say what’s in them.', 'Born on the docks. Never been on a ship. Never wanted to.'],
  fisher: ['My boat’s older than me and leaks worse.', 'I fish the shallows. The deep water’s for fools and the drowned.'],
  traveller: ['I go where the road goes. Lately the road goes nowhere good.', 'Between places. Always between places.'],
  teamster: ['I drive a wagon from the port to the Capital and back. Ten days if it’s dry. It’s never dry.'],
  adventurer: ['Guild card, sword, bad knee. That’s the whole résumé.', 'I take contracts. The kind nobody else will.'],
  hawker: ['I sell from a tray round my neck. My stall is wherever I’m standing.'],
  pilgrim: ['I walk the road to the Dawn’s shrines. My feet were not consulted.'],
  refugee: ['We had a farm south of here. Then the orcs came. Now we have a road.'],
  villager: ['Born here, married here, I expect I’ll die here. It’s not a bad place to do all three.'],
  townsfolk: ['I mend nets and gut fish and keep my head down. Island life.', 'Washed up here at sixteen. Never washed back off.'],
  noble: ['My family has held lands in the west since the second Aldric. They are mostly mud.'],
  citizen: ['I live in the low city, where the walls keep out the light as well as the wolves.'],
  priest: ['I keep the Dawn’s lamps. That is most of the work, and most of the faith.'],
};

/** A detail of their own, after the work. */
const DETAIL: string[] = [
  'I have a daughter in the Capital. She writes when she remembers.',
  'My husband snores like a millwheel. I’ve grown fond of it.',
  'I had a dog. Grey, one ear up. I keep a bowl out in case.',
  'I sing in the evenings. Badly. The neighbours have stopped complaining, which worries me more.',
  'I carve little birds out of kindling. I’ve a shelf of them nobody’s seen.',
  'I’ve never been further than a day’s walk from where I was born.',
  'My twin moved to the port. We haven’t spoken in eleven years. Over a goat.',
  'I keep bees. Kept. The cold took the hive.',
  'I was going to be married in the spring. Then the spring happened.',
  'I can whistle any bird in the valley. Useful for absolutely nothing.',
  'I lost two fingers to a frost one winter. I still reach for things with them.',
  'I play dice at the inn. I lose at dice at the inn.',
  'My mother’s buried on the hill. I go up and tell her the news. She’d have hated this year.',
  'I learned my letters from a travelling priest. I write the town’s letters now, for a copper each.',
  'I’ve three children and one good pair of boots between them.',
  'I talk to the river. The river doesn’t talk back, which is the appeal.',
  'I was handsome once. You’ll have to take my word for it.',
  'I keep a lamp in the window every night for someone who isn’t coming.',
  'I collect old coins. I have four. One of them might be real.',
  'I’ve been to the sea once. It was bigger than I was ready for.',
  'I still can’t swim. Don’t tell anyone.',
  'I bake for the whole lane on feast days. Feast days have been thin.',
  'I nursed the sick through the fever two winters back. I don’t talk about it.',
  'I have a temper. I’m working on it. Slowly.',
];

const WANTS_JOB: Record<string, string[]> = {
  farmer: ['A dry week at harvest. Just one.', 'A second plough horse before the spring.', 'To see my boy take the farm over and not sell it.', 'One field that comes up clean. One.', 'To eat something I didn’t grow and worry over.'],
  merchant: ['A stall on the Capital’s high market.', 'One caravan that arrives on time with nothing missing.', 'To pay off my brother’s debts and be done with him.', 'Customers who can afford me. Remember those?'],
  guard: ['A quiet watch. Every guard wants that and none of us gets it.', 'Sergeant’s stripes before I’m forty.', 'To find out who’s been cutting the pen fences.', 'A lamp that doesn’t gutter at the worst moment.'],
  child: ['A real sword. A sharp one!', 'To see a dragon. A small one, so it doesn’t eat me.', 'To go to the Capital and see the king.', 'A whole loaf. Just for me. With butter.'],
  elder: ['To see the valley at peace before I go.', 'Someone to take up my chronicle of the Glen.', 'One more harvest feast with all my grandchildren there.', 'To be warm. Properly warm. Once more.'],
  scavenger: ['A full cistern and a roof that doesn’t sing in the wind.', 'To find the old city they talk about. The one with the fountains.', 'To trade glass for a ticket out. Anywhere with rain.'],
  sailor: ['A berth on a ship that comes home every time.', 'A cottage where I can’t hear the sea.'],
  refugee: ['Our farm back. Failing that, any farm.', 'To stop walking.'],
  default: ['A bit of peace and a bit of coin. In that order.', 'To see the sea once.', 'To be left alone, mostly.', 'To sleep through a night without waking at every sound.', 'For my children to have it easier. They won’t, but I want it.', 'To be somewhere nobody needs anything from me. A week. Even a day.'],
};

const SECRETS: string[] = [
  'I can’t read. Never learned. I hold the letters upside down sometimes and nobody’s caught on.',
  'I owe the Two Coins crew more than I’ll make this year.',
  'I was sweet on someone at the inn for three years and never said a word.',
  'I took a sack of flour from the granary in the hard winter. Dora counts twice. She never caught it.',
  'I’m afraid of the dark. A grown adult, and I sleep with a candle.',
  'My grandmother was a witch, a real one. I still have her book under the floor.',
  'I ran from a fight once, years ago. A man died who might not have.',
  'I’ve been saving coin in a sock to leave this town. Every year I nearly go.',
  'I write poems. Bad ones. If you laugh I’ll deny it.',
  'I saw something in the Gravewood once that I’ve never told anyone. It looked back.',
  'I moved the boundary stone. Only a foot. Twenty years ago. It’s still a foot over.',
  'I pray to the old gods, not the Dawn. In the cellar, where nobody hears.',
  'The child everyone thinks is my sister’s is mine.',
  'I sold my father’s sword to pay a debt and told everyone it was stolen.',
  'I heard someone screaming in the fields one night and I didn’t go. I barred the door and I didn’t go.',
  'I’m not who I say I am. Not really. The name came off a gravestone on the road.',
  'I know who’s been cutting the pen fences. I’m not telling, because it was me, once, and I’m not proud.',
  'I water the ale. Not much. Enough.',
  'I’ve a letter from my brother I’ve never opened. Five years. I’m afraid of what it says.',
  'I sleepwalk. Last month I woke up at the edge of the wheat, facing the dark, and I don’t know why.',
  'I wanted the old elder gone so I could have her house. Then she went. I still feel it.',
  'I keep a knife under my pillow. Not for robbers.',
  'I don’t think the Dawn listens any more. I keep the lamps lit anyway, so nobody else finds out.',
  'I hid a deserter in my loft for a winter. He left a ring. I still have it.',
  'I can hear the wheel at the east gate hum. Nobody else seems to. It started the night you fell.',
  'I cheat at dice. Everyone knows. Nobody can prove it.',
  'I was in love with my best friend’s husband. Still am, maybe.',
  'I found coins in the river last spring. Old ones. I spent them, and I’ve had bad luck ever since.',
  'I told the Watch I saw nothing. I saw everything.',
  'I’ve been feeding something that comes to my back step at night. It hasn’t hurt anyone. Yet.',
];

const CHILD_SECRETS: string[] = [
  'I broke Gran’s good jug and blamed the cat. We don’t have a cat.',
  'I go to the edge of the wheat at night sometimes. Just to see. I always run back.',
  'I’ve got a sweet hidden in the wall. It’s been there since the festival. I’m saving it for the worst day.',
  'I saw a lady made of smoke by the well. She waved. I waved back. Was that bad?',
  'I can’t sleep when Da is on watch. I count the bells.',
  'I told Pip the crypt was haunted so he’d be scared. Then I got scared.',
];

const REGION_DETAIL: Partial<Record<Region, string[]>> = {
  desert: ['I remember rain. Once. I was small. My mother held me out in it.', 'I can find water by the smell of the sand. Mostly.', 'My father went into the storm to find a lost goat. The goat came back.'],
  scrap: ['I built my house from a cart, three doors and a sign that says WELCOME in a language nobody speaks.', 'I can fix anything with wire. Anything. Except my knees.'],
  isles: ['I’ve seen the lights under the water off the reef. Everybody has. Nobody talks about it.', 'My father was a wrecker. I mend nets. We don’t talk.'],
  port: ['I’ve watched the Academy take three of my cousins. Two came back.', 'I know every tide table by heart. Sea’s in the blood, they say. It’s in the lungs, mostly.'],
  capital: ['I’ve seen the King, once, from a long way off. He looked tired.', 'I was born in the low city and I’ll die in it, but I’ve been up the High Stair twice.'],
};

/**
 * Give everyone in one settlement their own life: about (work + a detail),
 * want and secret, without repeats while there are fresh ones to give.
 * Authored people (cast.ts) keep their own words.
 */
export function varyLives(list: Profile[], authored: (p: Profile) => boolean) {
  const used = { about: new Set<string>(), detail: new Set<string>(), want: new Set<string>(), secret: new Set<string>() };
  const take = (pool: string[], set: Set<string>, seed: number) => {
    for (let k = 0; k < pool.length; k++) {
      const v = pool[(seed + k * 7) % pool.length];
      if (!set.has(v)) {
        set.add(v);
        return v;
      }
    }
    return pool[seed % pool.length];
  };
  for (const p of list) {
    if (authored(p)) continue;
    const s = seedOf(p.id + ':life');
    const region = regionOf(p.settlement);
    const work = take(ABOUT_JOB[p.job] ?? ABOUT_JOB.villager, used.about, s);
    const detail = take([...(REGION_DETAIL[region] ?? []), ...DETAIL], used.detail, s >>> 5);
    // Children and the very busy keep it short.
    p.about = p.child ? work : `${work} ${detail}`;
    p.want = take(p.child ? WANTS_JOB.child : [...(WANTS_JOB[p.job] ?? []), ...WANTS_JOB.default], used.want, s >>> 9);
    p.secret = take(p.child ? CHILD_SECRETS : SECRETS, used.secret, s >>> 13);
  }
}
