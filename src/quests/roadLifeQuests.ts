import type { QuestDef, QuestLog } from './questLog';
import { RL_SITES, WARDLIGHTS } from '../world/roadLife/paths';

// The roads' own quests (road life): ten small stories told by the people of
// the roads into the capital. The toll-keeper of Halfpenny Bridge and her
// drowned strongbox; Ser Tobin the hedge knight and his petition to the
// Crown's tourney; Old Wendel and the forgotten wardlights; the Mile-Reeve's
// survey; the Ashbys of the burnt farm, their runaway boy and their letter to
// a cousin in the Silver Lance; Garrick's silks and the Red Hand at Fort
// Rennick; a courier's dispatch for the Grand Marshal; a lady's lost locket;
// and a minstrel's ballad of the road.

const fort = RL_SITES.fort;

export const ROAD_LIFE_QUESTS: QuestDef[] = [
  {
    id: 'rl-drowned-strongbox', title: 'The Drowned Strongbox', giver: 'turnpenny', region: 'royalCapital',
    summary: 'Mags Turnpenny, toll-keeper of Halfpenny Bridge on the Queen’s Road, lost her strongbox of tolls in the spring flood.',
    offer: 'Spring flood took the bridge-house cellar and my strongbox with it: forty years of pennies, iron-bound. I’ve turned the ford over twice and my knees won’t do a third. Young eyes might spot it. It’ll be downstream of the bridge, where the stepping stones are. Bring it back and you’ll never pay my toll again.',
    acceptLabel: 'I’ll search the ford.',
    stages: [
      { note: 'Search Miller’s Ford, downstream of Halfpenny Bridge, for Mags’s strongbox.', objectives: [{ type: 'collect', item: 'tollStrongbox', count: 1, text: 'Find the strongbox in Miller’s Ford', at: RL_SITES.strongbox }] },
      { note: 'Bring the strongbox to Mags Turnpenny.', objectives: [{ type: 'deliver', npc: 'turnpenny', item: 'tollStrongbox', count: 1, text: 'Give Mags her strongbox', say: 'That’s it! Weed and all! Oh, you lovely thing. Mother’s initials on the lid, see? Here: a share of what’s inside, and the bridge is yours, toll-free, for as long as I keep it.' }] },
    ],
    done: 'The pole goes up for you now, free.',
    rewards: { gold: 90, xp: 180, items: [['spicedCider', 2]] },
  },
  {
    id: 'rl-hedge-knight', title: 'A Hedge Knight’s Honour', giver: 'tobin', region: 'royalCapital',
    summary: 'Ser Tobin Halloway, a landless hedge knight camped past the Crown checkpoint, wants a place in the Crown’s Tourney. First he wants to know you can fight.',
    offer: 'I’ve a petition for the Silver Lance: leave to ride in the Crown’s Tourney. A hedge knight’s letter goes in the fire, unless it’s carried by someone the Lance respects. So. Strike my shield and best me in the ring, and I’ll know you’re worth sending.',
    acceptLabel: 'Ready your blade, Ser Tobin.',
    stages: [
      { note: 'Strike Ser Tobin’s shield and best him in his sparring ring.', objectives: [{ type: 'signal', id: 'rl-tobin-bested', text: 'Best Ser Tobin in a friendly bout', at: RL_SITES.hedge }] },
      { note: 'Carry Ser Tobin’s petition to Ser Gawen Ashby of the Silver Lance in the Royal Capital.', hook: 'rl:give:tobinsLetter', objectives: [{ type: 'deliver', npc: 'gawen', item: 'tobinsLetter', count: 1, text: 'Give Ser Gawen the petition', say: 'Halloway? I know the name. His father held the Rennick march before the Crown let the fort fall. Tell him… tell him the lists are open to him. I’ll speak for him to the Marshal myself.' }] },
      { note: 'Tell Ser Tobin his petition was heard.', objectives: [{ type: 'talk', npc: 'tobin', text: 'Bring Ser Tobin the answer', say: 'He said that? He said my father’s name? … Give me a moment. Ha! The lists! Here, take my old shield; I’ll need a new one with my arms fresh painted on it. A hedge knight in the Crown’s Tourney. Mother would have laughed herself silly.' }] },
    ],
    done: 'Ser Tobin rides for the Crown’s Tourney.',
    rewards: { gold: 160, xp: 340, items: [['kiteShield', 1]] },
  },
  {
    id: 'rl-wardlights', title: 'The Wardlights', giver: 'wendel', region: 'royalCapital',
    summary: 'Old Wendel the hermit says three old wardlights stand along the Crown Road, unlit for a lifetime. He wants them burning again.',
    offer: 'Three lantern-posts on the Crown Road, older than the Crown. Wardlights, my grandmother called them. One short of the wreck past Thornfield, one by the wolf wood, one in the marches before the barrow. They kept the road when nobody else would. Take my wicks and my flint and light them, after dark, when it means something. The dead under the long mounds remember the lights, you know. They don’t like them.',
    acceptLabel: 'I’ll light them.',
    stages: [
      { note: 'After dark, relight the three wardlights along the Crown Road.', objectives: [{ type: 'signal', id: 'rl-wardlight', count: 3, text: 'Relight the wardlights (after dark)', at: WARDLIGHTS[1] }] },
      { note: 'Tell Old Wendel the wardlights burn.', objectives: [{ type: 'talk', npc: 'wendel', text: 'Return to Old Wendel', say: 'I saw them. All three, from my door, like stars sat down on the road. Forty winters I’ve wanted to see that. Here: my road-charm. I made it when my legs were still good for walking. Wear it; walk far.' }] },
    ],
    done: 'The wardlights burn on the Crown Road after dark.',
    rewards: { gold: 70, xp: 300, items: [['wayfarersCharm', 1]] },
  },
  {
    id: 'rl-milestones', title: 'The Mile-Reeve’s Survey', giver: 'osric', region: 'royalCapital',
    summary: 'Osric Penhallow, the Crown’s Mile-Reeve, needs his milestones checked: on the Queen’s Road, the Caravan Way, the Logging Road and past the River Gate.',
    offer: 'The Crown pays me to keep its milestones true, and the Crown pays me so little I can’t afford a horse to check them. Five stones, any five that I set new this year: on the Queen’s Road, the Caravan Way, the Logging Road out of the Glen, the one past the River Gate. Read them, clean them if they need it, and tell me if any lie.',
    acceptLabel: 'I’ll walk your survey.',
    stages: [
      { note: 'Check five of the Mile-Reeve’s new milestones on the roads around the capital.', objectives: [{ type: 'signal', id: 'rl-milestone', count: 5, text: 'Check the new milestones' }] },
      { note: 'Report to Osric Penhallow at the Wayfork.', objectives: [{ type: 'talk', npc: 'osric', text: 'Report to the Mile-Reeve', say: 'Mossed over on the Caravan Way and the Queen’s Road? Typical. But true, all of them, true to the pace. You’ve a surveyor’s eye. The Crown’s thanks, which come in a very small purse, and mine, which come in a slightly larger one.' }] },
    ],
    done: 'The milestones stand true.',
    rewards: { gold: 75, xp: 220 },
  },
  {
    id: 'rl-missing-boy', title: 'The Boy Who Went Back', giver: 'edda', region: 'royalCapital',
    summary: 'Edda Ashby’s son Tam has run back to the family’s burnt farm in the orc marches, after the dog.',
    offer: 'Tam’s gone. My boy. He kept on about the dog, Scrap, that we lost the night of the fire, and this morning his blanket was empty. He’ll have gone back to the farm. It’s down the road past the Kingsmile, what’s left of it, and the orcs are all around it. Please. Please bring him home.',
    acceptLabel: 'I’ll find him.',
    stages: [
      { note: 'Search the burnt Ashby cottage on the Crown Road, past the Kingsmile, for Tam.', hook: 'rl:tamWaits', objectives: [{ type: 'reach', at: RL_SITES.ashbyCottage, radius: 14, text: 'Find Tam at the burnt cottage' }] },
      { note: 'Bring Tam (and his dog) safely back to the Ashby camp below the Kingsmile.', hook: 'rl:tamFollow', objectives: [{ type: 'signal', id: 'rl-tam-home', text: 'Bring Tam home to his mother', at: RL_SITES.refugee }] },
      { note: 'Speak with Edda Ashby.', objectives: [{ type: 'talk', npc: 'edda', text: 'Speak with Edda', say: 'Tam! You stupid, brave, wonderful — and the DOG. Scrap! Oh, come here, both of you. Stranger, I’ve nothing. You know I’ve nothing. But the whole camp will remember your name, and that’s worth something on this road.' }] },
    ],
    done: 'Tam and Scrap are home with the Ashbys.',
    rewards: { gold: 60, xp: 320, items: [['healthPotion', 2]] },
  },
  {
    id: 'rl-ashby-letter', title: 'Kin of the Burnt Farm', giver: 'edda', region: 'royalCapital', requires: ['rl-missing-boy'],
    summary: 'Edda Ashby’s husband’s cousin is Ser Gawen Ashby, a knight of the Silver Lance. Her letters to him go unanswered.',
    offer: 'Harl’s nephew is a knight in the capital. Ser Gawen Ashby, of the Silver Lance, if you please. I’ve written three times. The gate guards take the letters and laugh. If someone handed it to him, in his hand… he was a kind boy. I can’t believe the Lance has made him otherwise.',
    acceptLabel: 'I’ll put it in his hand.',
    stages: [
      { note: 'Carry Edda’s letter to Ser Gawen Ashby in the Royal Capital.', hook: 'rl:give:ashbyLetter', objectives: [{ type: 'deliver', npc: 'gawen', item: 'ashbyLetter', count: 1, text: 'Give Ser Gawen Edda’s letter', say: 'Edda? Uncle Harl? They’re alive? … Three letters. I never saw one. Someone at the gate will be answering for that. Take her this purse, and tell her: the Lance rides past the Kingsmile next week, and I ride with it, and the Ashbys will have a roof by winter if I have to thatch it myself.' }] },
      { note: 'Bring Ser Gawen’s answer to Edda Ashby.', objectives: [{ type: 'talk', npc: 'edda', text: 'Bring Edda the answer', say: 'He never got them? Oh, Gawen. Oh, thank the Dawn. Harl! HARL! Gawen’s coming! … You keep the purse, stranger. No: I insist. We’ll have family again by winter. That’s worth more than coin.' }] },
    ],
    done: 'The Ashbys have kin in the Silver Lance again.',
    rewards: { gold: 140, xp: 260, guildRep: 10 },
  },
  {
    id: 'rl-silk-steel', title: 'Silk and Steel', giver: 'garrick', region: 'royalCapital',
    summary: 'Garrick Vell, silk merchant at the Wayfork, was robbed on the Queen’s Road by the Red Hand, who hide out in the ruins of Fort Rennick.',
    offer: 'Three bolts of Valorian silk, plum and gold, worth more than this whole market. Took them off me on the Queen’s Road in broad daylight, painted hands on their sleeves. The Crown riders say they’ve made a nest in old Fort Rennick on the hill above the road. Two riders won’t go near it. You look like you would.',
    acceptLabel: 'I’ll get your silks back.',
    stages: [
      { note: 'Find Fort Rennick, the ruined fort on the hill above the Queen’s Road.', objectives: [{ type: 'reach', at: fort, radius: 45, text: 'Find Fort Rennick on the Queen’s Road' }] },
      { note: 'Clear the Red Hand out of Fort Rennick.', hook: 'rl:fortGarrison', objectives: [
        { type: 'kill', kind: 'bandit', count: 4, text: 'Defeat the Red Hand cutthroats', at: fort, radius: 90 },
        { type: 'kill', kind: 'banditChief', count: 1, text: 'Defeat Hask, their quartermaster', at: fort, radius: 110 },
      ] },
      { note: 'Search the robbers’ chest in the fort for Garrick’s silks.', objectives: [{ type: 'collect', item: 'valorianSilk', count: 1, text: 'Recover the Valorian silks', at: fort }] },
      { note: 'Return the silks to Garrick Vell at the Wayfork.', objectives: [{ type: 'deliver', npc: 'garrick', item: 'valorianSilk', count: 1, text: 'Give Garrick his silks', say: 'Plum and gold! Not a thread pulled! I’ll have a cloak made for you from the end of the bolt, see if I don’t. And the Red Hand out of Rennick: the whole Queen’s Road owes you a drink.' }] },
    ],
    done: 'Fort Rennick is clear and Garrick has his silks.',
    rewards: { gold: 240, xp: 520, guildRep: 30, items: [['wayfarerCloak', 1]] },
  },
  {
    id: 'rl-dispatch', title: 'Dispatch for the Commandery', giver: 'pell', region: 'royalCapital',
    summary: 'Pell Swiftwater, a Crown courier, has a sealed dispatch for the Grand Marshal that he can’t deliver himself.',
    offer: 'Do me a turn? There’s a dispatch in my satchel for the Grand Marshal himself, from the checkpoint, and I’m due at the Wayfork post an hour ago. You’re headed to the capital sooner or later. Commandery, Ser Roland Hart, in his hand. Don’t open it; they can tell.',
    acceptLabel: 'I’ll carry it.',
    stages: [
      { note: 'Deliver the sealed dispatch to Grand Marshal Ser Roland Hart at the Silver Lance Commandery.', hook: 'rl:give:sealedDispatch', objectives: [{ type: 'deliver', npc: 'marshal', item: 'sealedDispatch', count: 1, text: 'Give the Grand Marshal the dispatch', say: 'Brask’s seal. Hm. Orc sign west of the barrow, and the Red Hand on the Queen’s Road. Nothing I didn’t fear. You’re not a courier. Pell’s idea? He’ll get a talking-to, and you’ll get the courier’s fee.' }] },
    ],
    done: 'The Grand Marshal has his dispatch.',
    rewards: { gold: 100, xp: 200 },
  },
  {
    id: 'rl-ladys-locket', title: 'The Lady’s Locket', giver: 'ysmay', region: 'royalCapital',
    summary: 'Lady Ysmay Harrowgate lost a gold locket on the road, where her carriage stopped at the King’s Prospect above the capital.',
    offer: 'I have lost a locket. Gold, with a blue stone, and inside it… a likeness I would very much like back. We stopped at the King’s Prospect, the overlook before the East Gate; I sat on the bench to admire the view and Burle says the clasp has been loose for weeks. My man-at-arms looked and found nothing, but he looks at nothing but the road. Find it, please. You’ll find me on the road, or at Thornfield.',
    acceptLabel: 'I’ll look for it.',
    stages: [
      { note: 'Search the King’s Prospect, the overlook above the capital on the Crown Road, for Lady Ysmay’s locket.', objectives: [{ type: 'collect', item: 'ladysLocket', count: 1, text: 'Find the locket at the King’s Prospect', at: RL_SITES.prospect }] },
      { note: 'Return the locket to Lady Ysmay (her carriage travels between the capital and Thornfield).', objectives: [{ type: 'deliver', npc: 'ysmay', item: 'ladysLocket', count: 1, text: 'Give Lady Ysmay her locket', say: 'Oh! Under the bench? Of course it was. … He was a Lance knight, the boy in the picture. A long time ago, before the marches took him. Thank you. Truly. Take this: it was his. He would want it on the road, not in my jewel box.' }] },
    ],
    done: 'Lady Ysmay has her locket.',
    rewards: { gold: 150, xp: 240, items: [['ringVigor', 1]] },
  },
  {
    id: 'rl-road-ballad', title: 'A Song for the Road', giver: 'lio', region: 'royalCapital',
    summary: 'Lio Quickstring, the Wayfork’s minstrel, wants true stories of the road for a new ballad: from the bridge-wife, the hedge knight and the hermit.',
    offer: 'I need a new ballad and I’ve sung every old one to death. Real tales, that’s what sells. Go and ask three people for their story: Mags Turnpenny at Halfpenny Bridge, Ser Tobin the hedge knight past the checkpoint, and Old Wendel in the south wood, if he’ll talk. Bring me what they say and I’ll make it sing.',
    acceptLabel: 'I’ll gather your tales.',
    stages: [
      { note: 'Gather three tales of the road for Lio.', objectives: [
        { type: 'talk', npc: 'turnpenny', text: 'Hear Mags Turnpenny’s tale', reply: 'Lio wants a tale of the road for his ballad.', say: 'A tale? The night the King’s own grandfather came over my mother’s bridge in the rain and wouldn’t pay the toll. Mother put the pole down in front of the royal horse. He paid. Three pennies, same as anyone. Put that in your ballad.' },
        { type: 'talk', npc: 'tobin', text: 'Hear Ser Tobin’s tale', reply: 'Lio wants a tale of the road for his ballad.', say: 'My father held Fort Rennick for the Crown, when it still had walls. The Crown called the garrison home and let it fall, and we kept the road anyway, him and me, with one horse between us. That’s my tale. A knight’s a knight, with or without the walls.' },
        { type: 'talk', npc: 'wendel', text: 'Hear Old Wendel’s tale', reply: 'Lio wants a tale of the road for his ballad.', say: 'The road was here before the kings. The old ones walked it with lights, to the long mounds and back, turning a wheel. When the lights went out, the mounds stopped sleeping. Tell your minstrel that. He won’t understand it. Nobody does.' },
      ] },
      { note: 'Bring the three tales to Lio at the Wayfork.', objectives: [{ type: 'talk', npc: 'lio', text: 'Bring the tales to Lio', say: 'A pole across a king’s road, a knight with no walls, lights for the dead… and the stranger who walked between them all. That’s it. That’s the ballad. ♪ Come down the Crown Road, come down from the Glen… ♪ I’ll sing it at every market day. Your name’s in the last verse. Don’t blush.' }] },
    ],
    done: 'Lio sings the Ballad of the Road at the Wayfork.',
    rewards: { gold: 80, xp: 260, items: [['travellersBread', 3]] },
  },
];

/** What road life does for its quests' stages (the world object is ../world/roadLife's RoadLife). */
export interface RoadLifeQuestWorld {
  spawnGarrison(): void;
  tam(state: 'waiting' | 'following' | 'home'): void;
  give(item: string, n: number): void;
  count(item: string): number;
}

export function setupRoadLifeQuests(quests: QuestLog, world: RoadLifeQuestWorld) {
  quests.add(...ROAD_LIFE_QUESTS);
  // Letters and dispatches change hands as the stage begins (and are replaced if lost, never doubled).
  for (const item of ['tobinsLetter', 'ashbyLetter', 'sealedDispatch']) {
    quests.hooks.set('rl:give:' + item, () => {
      if (world.count(item) === 0) world.give(item, 1);
    });
  }
  quests.hooks.set('rl:fortGarrison', () => world.spawnGarrison());
  quests.hooks.set('rl:tamWaits', () => world.tam('waiting'));
  quests.hooks.set('rl:tamFollow', () => world.tam('following'));
  quests.hooks.set('rl-missing-boy:done', () => world.tam('home'));
}
