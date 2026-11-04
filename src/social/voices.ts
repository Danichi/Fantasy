// Where people are, what they do, and what kind of year it's been (NPC
// revamp). The line library (lines.ts) holds the moods; this holds the
// colour: a farmer talks about the blight, a dockhand about the tide, a
// scavenger about water. pickLine folds these in by key:
//   cat.<region>  cat.<job>  cat.hard (Elder Glen's hard year)
// so 'small.work' for a Glen smith draws on small.work, small.work.smith and
// small.work.hard together, the specific ones first. Overheard exchanges
// (CONVOS) are whole little conversations, not two lines picked at random.

export type Region = 'glen' | 'road' | 'port' | 'capital' | 'isles' | 'desert' | 'scrap';

export function regionOf(settlement: string): Region {
  if (settlement === 'elderGlen') return 'glen';
  if (settlement === 'portAurelle') return 'port';
  if (settlement === 'royalCapital') return 'capital';
  if (/^scraptown\d+$/.test(settlement)) return 'scrap';
  if (settlement === 'sunspire' || /^village\d+$/.test(settlement)) return 'desert';
  if (/^(azureHaven|emeraldCove|wreckersRest|sunkenSpire|ashenPort)$/.test(settlement)) return 'isles';
  return 'road';
}

type Pool = (string | { t: string })[];

export const MORE_LINES: Record<string, Pool> = {
  // ---- "How are things in {town}?" --------------------------------------------------------
  'small.town.glen': [
    'Quiet, if you don’t count the bells at night.',
    'The wheat came up black at the roots this year. Wren says it’s the blight. Old Hob says it’s something worse.',
    'We used to leave doors unbarred. My mother never once barred a door.',
    'Folk are leaving for the Capital. Then folk come back from the Capital, thinner.',
  ],
  'small.town.hard': [
    'We’re counting loaves. Not sacks, loaves. That’s how it is.',
    'Nine buried since the thaw that I know of. Maud knows the real number. She won’t say it out loud.',
    'Things come out of the wheat at night now. The Watch says it’s wolves. The Watch has never seen a wolf with no shadow.',
    'There was a family on the north lane. There was. Now there’s a door hanging open and nobody goes near it.',
    'Ask me again after the harvest. If there is one.',
    'Everyone’s polite and nobody sleeps. That’s the Glen this year.',
  ],
  'small.town.road': [
    'The road’s never empty and never safe. Good for trade, that.',
    'Crown riders through twice a day. They never stop, never say what they’re carrying.',
    'Every wagon from the south has a story about the orc marches, and every story’s worse than the last.',
    'You learn to sleep with one boot on, out here.',
  ],
  'small.town.port': [
    'Busy. The port’s always busy. Busy and short of honest men.',
    'Ships come in heavier than they go out. Nobody asks what’s in the barrels.',
    'The tide’s been wrong all month. The old salts won’t say it, but they’re scared.',
    'The Academy gets its pick of the young ones. The docks get the rest.',
    'Fog off the water every morning, and something in it that rings a bell. Nobody’s found the bell.',
  ],
  'small.town.capital': [
    'The Capital? Grand, if you look up. Don’t look down.',
    'The high market sells silk and the low city sells its children’s shoes. Same street, different ends.',
    'Every week another crier with another proclamation. Nobody reads them. Everybody fears them.',
    'The Crown’s good at walls. Less good at what’s behind them.',
    'They say the King hasn’t slept since winter. They say a lot of things, here.',
  ],
  'small.town.isles': [
    'Salt in everything. The bread, the beds, the people.',
    'The sea gives and the sea takes, and lately it takes more.',
    'A ship comes in, we eat. A ship doesn’t, we fish. A storm comes, we pray.',
    'Nobody here was born here. Everybody here washed up.',
  ],
  'small.town.desert': [
    'Water first. Then talk.',
    'The well dropped another arm’s length this month. We don’t say it, but we all measure.',
    'The storms strip the paint off the walls and the skin off your hands. You learn to listen for them.',
    'Sunspire takes our glass and gives us rules. We keep the glass, when we can.',
    'Raiders came at the full moon. We gave them water. They took the rest anyway.',
  ],
  'small.town.scrap': [
    'Everything here was something else first. Me too.',
    'We bolt it down, it rusts, we bolt it down again. That’s the whole town.',
    'The city closed its wells to us. We built a town out of what it threw away.',
    'Crab-folk got two of ours last week. Shells made of our own old roofs, some of them.',
  ],

  // ---- "How's the work?" -------------------------------------------------------------------
  'small.work': [
    'Work’s work. It doesn’t care how I feel about it.',
    'There’s always more of it than there is of me.',
    'I’d tell you, but you’d fall asleep, and then you’d be no use to anyone.',
  ],
  'small.work.farmer': [
    'You pull a stalk, you look at the root. Black, you burn the row. I’ve burned eleven rows.',
    'Crows don’t sleep and neither do I.',
    'My grandfather’s plough. My father’s field. My hands. Three generations, one bad year.',
    'Up before dawn, back after dark, and the ground gives less every season.',
  ],
  'small.work.merchant': [
    'Prices up, coin down, customers counting every copper twice. Can’t blame them.',
    'I sell what I can get. What I can get gets less every week.',
    'Half my stock comes up the King’s Road. The other half doesn’t come at all.',
    'You learn a face. The ones who can’t pay, you let it slide. Once.',
  ],
  'small.work.guard': [
    'Long nights. Bad lamps. Too few of us and too many shadows.',
    'Brannoc says keep your eyes on the dark. I say the dark keeps its eyes on us.',
    'Mostly it’s drunks and lost sheep. Mostly.',
    'I count the gate at dusk and I count it at dawn, and the numbers don’t always match.',
  ],
  'small.work.child': [
    'I fetch water. And I fetch Mum. And I fetch the goat when it runs off, which is always.',
    'I’m not allowed past the fields any more. Nobody is. Even the grown-ups.',
    'I help Gran with the bread. There’s not much bread so it doesn’t take long.',
  ],
  'small.work.elder': [
    'My work is remembering. Somebody has to, and the young ones haven’t the time.',
    'I sit, I watch, I tell them when they’re wrong. They rarely listen. Then they’re wrong.',
    'I’ve buried two husbands and a son. Work? I’m still here. That’s work enough.',
  ],
  'small.work.miller': [
    'No grain, no grinding. The stones are hungry as the rest of us.',
    'The wheel turns when the river lets it. Lately the river’s been sulking.',
    'Flour in my lungs, flour in my hair. Not enough in the sacks.',
  ],
  'small.work.smith': [
    'I mend more than I make, now. Blades come back notched from the night.',
    'No ore, no work. No work, no blades. No blades, well. You can finish that one yourself.',
    'Heat, hammer, quench, pray it holds.',
  ],
  'small.work.innfolk': [
    'Full every night. Not because they’re drinking. Because nobody wants to sit at home alone.',
    'Watered ale and thin stew, and they thank me for it. That’s how I know things are bad.',
    'I hear everything. I repeat about half.',
  ],
  'small.work.shepherd': [
    'Forty head at the thaw. Twenty-six now. I know every one by its face.',
    'Something walks the north slope at night and the dogs won’t go near it.',
    'Sheep are stupid and wolves are clever, and I’m somewhere in the middle, freezing.',
  ],
  'small.work.weaver': [
    'Cloth for shrouds, lately. More than for coats.',
    'Blue dye costs a fortune since the port raised its tariffs. Grey costs nothing. Everyone wears grey now.',
    'The loom keeps your hands busy so your head doesn’t wander. Good thing, this year.',
  ],
  'small.work.scavenger': [
    'Dig, sift, carry. Glass for the traders, metal for the walls, bones for nobody.',
    'You find a buried house, you find the people who lived in it. You learn not to look.',
    'Good day’s a full sack and both hands still on your arms.',
  ],
  'small.work.sailor': ['Haul, coil, swear, repeat. The sea doesn’t care how tired you are.', 'Three weeks out, two days home, and the home’s a hammock.'],
  'small.work.dockhand': ['Crates up, crates down. My back’s older than I am.', 'Some of the crates are heavier than they should be. Some of them knock. I don’t ask.'],
  'small.work.fisher': ['Nets come up lighter every season. Fish know something we don’t.', 'Up before the gulls. The gulls are winning.'],
  'small.work.noble': ['Work? My dear, I attend. It is exhausting.', 'One spends the day being seen. It is harder than it sounds.'],
  'small.work.priest': ['More funerals than weddings. I say the words the same way. I mean them differently.', 'I keep the lamps lit. That is most of faith, some days.'],
  'small.work.citizen': ['Work’s wherever you can find it in this city, and you have to find it before someone else does.', 'I carry things for people with more money than arms.'],
  'small.work.traveller': ['My work’s getting there. Wherever there is, this week.', 'The road’s my trade. The road takes its cut.'],
  'small.work.teamster': ['Two oxen, one wagon, and a road that wants all three of us dead.', 'Rain turns the King’s Road to glue. Then the wheel goes. Then the axle. Then my temper.'],
  'small.work.adventurer': ['Kill the thing, take the coin, try not to think about it.', 'The Guild pays by the head. Some heads are harder to bring back than others.'],
  'small.work.hawker': ['Shout loud, smile wide, never let them see you count.', 'I sell anything that isn’t nailed down. Anything that is, I sell the nails.'],
  'small.work.pilgrim': ['I walk. I pray. My feet do the praying, mostly.', 'Every shrine on the road, every one. Something has to listen eventually.'],
  'small.work.refugee': ['Work? I had a farm. I had a roof. Now I have this cloak and a long way left to go.', 'I take what work I can. Nobody wants to hire someone with nowhere to sleep.'],
  'small.work.villager': ['Fields, fences, firewood. Same as anywhere, only further from help.', 'Whatever wants doing. There’s always something wants doing.'],
  'small.work.townsfolk': ['Bit of this, bit of that. Mostly mending nets for other folk.', 'Whatever the harbour needs. The harbour always needs something.'],
  'small.work.hard': [
    'Work? We’re all doing three people’s work. Some of the three are buried.',
    'Maud has us rationing candles. We work in the dark now, mostly.',
  ],

  // ---- greetings, in the Glen's hard year --------------------------------------------------
  'greet.first.hard': [
    'You’re the sky-person. Everybody’s talking. Nobody’s talking to you.',
    'So you’re what fell. Hmm. Thought you’d be taller. Or on fire.',
    'Don’t take it to heart if folk stare. We’ve had a year of things falling on us.',
  ],
  'greet.wary.hard': ['You again. Has anything come out of the wheat behind you? No? Then go on.', 'Keep your voice down. The baby’s finally asleep.'],
  'greet.neutral.hard': ['Still breathing? Good. That’s the greeting this year.', 'Afternoon. Nobody died today. Yet. So it’s a good afternoon.', 'Come for news? It’s all bad. Pick a piece.'],
  'greet.warm.hard': ['You’re a good sight in a bad year.', 'There you are. I was half afraid I’d hear your name at the bell.'],
  'greet.night.hard': ['What are you doing out? Don’t you hear the bells?', 'Lamp’s lit. Door’s barred. Say your piece quick.'],

  // ---- said in passing, by what they're doing ----------------------------------------------
  'bark.at.shop': [
    'Bread! Yesterday’s, but bread!', 'Needles, thread, salt! Real salt!', 'Fair prices! Fairer than the Capital!', 'Don’t touch unless you’re buying.',
    'Last of the onions, last of the season!', 'Lamp oil, short measure but honest about it!',
  ],
  'bark.at.drink': ['One more and then home. I said that two ago.', 'To the ones who aren’t here.', 'This ale tastes of river. Still drinking it.', 'Sit, sit. Tell us something that isn’t bad news.'],
  'bark.at.farm': ['Black root. Another one.', 'Get off it! Shoo! Gods, the crows.', 'Pull it gentle, the stalks are rotten.', 'Rain tomorrow, my knee says.'],
  'bark.at.work': ['Mind your feet, it’s hot.', 'Pass me that. No, the other one.', 'Nearly. Nearly. There.'],
  'bark.at.patrol': ['Eyes front.', 'Seen anything in the fields? Anything at all?', 'Dark’s early tonight.', 'Keep to the lit streets.'],
  'bark.at.play': ['You’re it!', 'I’m the sky-person! Bang, you’re dead!', 'Mum says don’t go near the wheat.', 'Bet you can’t catch me!'],
  'bark.neutral.hard': ['Stay in the light.', 'Seen a grey dog about? He never came home.', 'Morning. Still here, then.'],
  'bark.neutral.port': ['Mind the ropes.', 'Tide’s turning.', 'Fresh catch, fresh-ish.'],
  'bark.neutral.capital': ['Make way.', 'Mind your purse.', 'Long live the King. Apparently.'],
  'bark.neutral.desert': ['Water first.', 'Storm by evening.', 'Sun keep you. Or don’t, today.'],
  'bark.neutral.scrap': ['Watch the edges, they’re sharp.', 'Don’t lean on that. It’s holding up the house.'],
  'bark.neutral.isles': ['Salt and sun.', 'Ship on the horizon?', 'Mind the nets.'],
  'bark.night.hard': ['Get inside. Get inside.', 'Did you hear that? No? Good.', 'Bell hasn’t rung tonight. Yet.'],
};

/**
 * Overheard: little conversations between two people standing together (the
 * first speaker, then the second, then sometimes the first again).
 */
export const CONVOS: Record<string, string[][]> = {
  glen: [
    ['Did you get any flour?', 'Half a sack. Oswin says that’s the last until the wheel’s fixed.', 'Half a sack. Gods.'],
    ['Your boy still coughing?', 'Worse at night. Ilyra says it’s the damp.', 'Everything’s the damp, with Ilyra.'],
    ['Wren’s burned another row.', 'How many’s that?', 'She’s stopped telling people.'],
    ['Have you seen the sky-person fight?', 'From the wall. Never seen anything move like that.', 'Never seen anything fall like that either.'],
    ['I’m thinking of the Capital.', 'Everyone’s thinking of the Capital. Nobody’s got the boots for it.'],
    ['Festival this year?', 'Maud says yes.', 'With what?'],
  ],
  hard: [
    ['Did you hear the bell last night?', 'Twice.', 'I counted three.', 'Don’t.'],
    ['They found the Penney boy’s boot.', 'Just the boot?', 'Just the boot.'],
    ['Maud’s counting loaves again.', 'Let her count. Counting’s better than the other thing.'],
    ['Do you think it’s coming for the sky-person?', 'I think it was coming anyway. The sky-person just gave it a reason to hurry.'],
    ['I barred the door and it scratched anyway.', 'What did?', 'If I knew that, I’d sleep.'],
  ],
  road: [
    ['How’s the road south?', 'Bridges are up. Prices are up. Bodies in the ditches are up.', 'So, normal.'],
    ['Crown riders went by at a gallop this morning.', 'Going which way?', 'Away from here. Always away from here.'],
    ['You heading to the Capital?', 'Got family there.', 'Lucky you.', 'Haven’t heard from them since spring.'],
    ['Seen the hedge knight?', 'Ser Tobin? Sharp sword, empty purse.', 'That’s most knights.'],
  ],
  port: [
    ['The Gull came in light.', 'Light how?', 'Light four men.'],
    ['Academy’s taking cadets again.', 'Taking’s the word.', 'Three square meals, though.', 'And a sword in your hand on the first day.'],
    ['Smell that?', 'Fish.', 'Under the fish.'],
    ['Harbourmaster raised the berthing fee.', 'Again?', 'Says it’s for the new chain across the mouth.', 'Against what?', 'He didn’t say.'],
  ],
  capital: [
    ['Another proclamation.', 'What’s it say?', 'Can’t read it. Big seal, though.'],
    ['The Silver Lance rode out at dawn.', 'Where to?', 'East. With the banners covered.'],
    ['My cousin works in the palace kitchens.', 'And?', 'And she says the King eats alone now. Every meal.'],
    ['Price of bread in the low city?', 'Don’t.', 'I’m asking.', 'Then don’t ask.'],
  ],
  isles: [
    ['Ship due today.', 'Ship was due yesterday.', 'Then it’s very due.'],
    ['Lights out on the reef again last night.', 'Wreckers?', 'Not wreckers. Wreckers carry lanterns. These moved under the water.'],
  ],
  desert: [
    ['How deep tonight?', 'Two hands less than last moon.', 'Then we ration again.'],
    ['Storm on the edge of the dunes.', 'Close?', 'Close enough to taste.'],
    ['Did the Sunspire caravan come?', 'Came, counted, took, left.', 'Left anything?', 'Rules.'],
  ],
  scrap: [
    ['That roof’s leaning.', 'That roof’s been leaning since my father bolted it.', 'It’s leaning more.'],
    ['Found a whole pane of glass today.', 'Whole?', 'Mostly whole.', 'Mostly whole’s whole, out here.'],
  ],
};
