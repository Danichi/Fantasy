import type { QuestDef } from './questLog';
import { crownSitePoint } from '../world/roadData';

// The Crown Road's quests: the Crown's bounties posted at the checkpoint (Red
// Morwen of the Old Watchtower, Gorrak Bonebreaker of the warcamp), the
// Barrow of the Old Kings, Thornfield's wolves, and the Kingsmile's lost
// caravan.

const tower = crownSitePoint('watchtower');
const camp = crownSitePoint('orcCamp');
const barrow = crownSitePoint('barrow');
const den = crownSitePoint('wolfDen');
const wreck = crownSitePoint('wreck');

export const CROWN_ROAD_QUESTS: QuestDef[] = [
  {
    id: 'red-hand', title: 'The Red Hand', giver: 'brask', region: 'royalCapital',
    summary: 'Sergeant Brask has a Crown bounty on Red Morwen, whose Red Hand gang holds the Old Watchtower and tolls the Crown Road in blood.',
    offer: 'See the gibbet by the road past Thornfield? That’s Red Morwen’s toll sign. She and her Red Hand hold the Old Watchtower on the knoll, and every week another wagon goes into the ditch. The Crown pays well for her. Bring her down.',
    acceptLabel: 'I’ll deal with Red Morwen.',
    stages: [
      { note: 'Defeat Red Morwen at the Old Watchtower.', objectives: [{ type: 'kill', kind: 'morwen', count: 1, text: 'Defeat Red Morwen', at: tower, radius: 80 }] },
      { note: 'Report to Sergeant Brask at the Crown checkpoint.', objectives: [{ type: 'talk', npc: 'brask', text: 'Report to Sergeant Brask', say: 'Morwen? Dead? Then the watchtower’s empty, for a while at least. Bandits are like weeds. Here’s the Crown’s coin, and mine.' }] },
    ],
    done: 'The Red Hand is broken, for now.',
    rewards: { gold: 260, xp: 520, guildRep: 40, items: [['greaterHealthPotion', 2]] },
  },
  {
    id: 'bonebreaker', title: 'Gorrak Bonebreaker', giver: 'brask', region: 'royalCapital', requires: ['red-hand'],
    summary: 'The orc warchief Gorrak Bonebreaker raids the Crown Road from a warcamp in the marches east of the Kingsmile.',
    offer: 'You handled Morwen. Now the real trouble. Gorrak Bonebreaker has a warcamp out in the marches past the Kingsmile: stakes, skulls, a cage for whoever he catches. He burnt the Ashby farm last month. The Silver Lance can’t spare the knights. Can you?',
    acceptLabel: 'I’ll break the Bonebreaker.',
    stages: [
      { note: 'Storm Gorrak’s warcamp: cut down his raiders and Gorrak himself.', objectives: [
        { type: 'kill', kind: 'orc', count: 4, text: 'Cut down Gorrak’s raiders', at: camp, radius: 70 },
        { type: 'kill', kind: 'gorrak', count: 1, text: 'Defeat Gorrak Bonebreaker', at: camp, radius: 80 },
      ] },
      { note: 'Report to Sergeant Brask.', objectives: [{ type: 'talk', npc: 'brask', text: 'Report to Sergeant Brask', say: 'Gorrak’s skull on his own totem. The Silver Lance will be green with envy. Take this blade; it was meant for a knight, and you’ve done a knight’s work.' }] },
    ],
    done: 'The Crown Road breathes easier with Gorrak gone.',
    rewards: { gold: 420, xp: 900, guildRep: 80, items: [['claymore', 1]] },
  },
  {
    id: 'barrow-dead', title: 'The Barrow of the Old Kings', giver: 'aldo', region: 'royalCapital',
    summary: 'Brother Aldo says the dead rise from the Barrow of the Old Kings after dark and wander the Crown Road.',
    offer: 'After nightfall the old barrow by the road gives up its dead. They are not evil, I think: only woken, and lost. Put them back to rest, six of them, and the road will be quieter for the pilgrims. Go after dark. Go with the Dawn.',
    acceptLabel: 'I’ll lay them to rest.',
    stages: [
      { note: 'After dark, put down six of the risen dead at the Barrow of the Old Kings.', objectives: [{ type: 'kill', kind: 'any', count: 6, text: 'Lay the barrow dead to rest (after dark)', at: barrow, radius: 70 }] },
      { note: 'Return to Brother Aldo at the Kingsmile.', objectives: [{ type: 'talk', npc: 'aldo', text: 'Return to Brother Aldo', reply: 'They rest again.', say: 'Did you see the stone? “Wake them not before the wheel turns.” If the wheel is turning, they will not stay asleep for long. Still: tonight, they rest. The Dawn thanks you.' }] },
    ],
    done: 'The barrow is quiet, for a night.',
    rewards: { gold: 200, xp: 460, items: [['greaterManaPotion', 2]] },
  },
  {
    id: 'thornfield-wolves', title: 'Wolves of the North Wood', giver: 'hedda', region: 'royalCapital',
    summary: 'Wolves from a den in the woods north of the Crown Road are taking Thornfield’s sheep.',
    offer: 'Three ewes this week, and the pack’s getting bolder. There’s a den in the rocks in the wood across the road, a little way toward the Kingsmile. Thin the pack, would you? Four will do. They’ll think twice.',
    acceptLabel: 'I’ll thin the pack.',
    stages: [
      { note: 'Kill four wolves at the den in the wood beyond Thornfield.', objectives: [{ type: 'kill', kind: 'green', count: 4, text: 'Kill wolves at the den', at: den, radius: 90 }] },
      { note: 'Tell Hedda the pack is thinned.', objectives: [{ type: 'talk', npc: 'hedda', text: 'Tell Hedda', say: 'The flock slept through the night for the first time in a month. Thornfield owes you. Here, and a fleece for your bedroll.' }] },
    ],
    done: 'Thornfield’s flock is safe, for now.',
    rewards: { gold: 120, xp: 260 },
  },
  {
    id: 'lost-caravan', title: 'The Lost Caravan', giver: 'oswin', region: 'royalCapital',
    summary: 'Oswin Hale of the Kingsmile lost a supply wagon on the road near Thornfield. He wants its ledger back.',
    offer: 'My wagon left Thornfield a week ago and never came. A drover says it’s in the ditch past the hamlet, smashed. The goods are gone, I don’t doubt. But the ledger: names, debts, the Crown’s seal. If it’s still there, bring it to me before someone worse finds it.',
    acceptLabel: 'I’ll find the wagon.',
    stages: [
      { note: 'Search the wrecked wagon by the road past Thornfield for the ledger.', objectives: [{ type: 'collect', item: 'wreckLedger', count: 1, text: 'Find the ledger in the wrecked wagon', at: wreck }] },
      { note: 'Bring the ledger to Oswin at the Kingsmile.', objectives: [{ type: 'deliver', npc: 'oswin', item: 'wreckLedger', count: 1, text: 'Give Oswin the ledger', say: 'Waterlogged, but the seal’s whole. Red Hand arrows in the boards, you say. Morwen, then. Thank you, friend. The Kingsmile’s beds are yours at half price.' }] },
    ],
    done: 'The Kingsmile’s ledger is home.',
    rewards: { gold: 150, xp: 300 },
  },
];
