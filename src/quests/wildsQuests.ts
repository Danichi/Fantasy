import type { QuestDef } from './questLog';
import { LAIRS } from '../world/wilds/lairs';

// Bounties on the hidden bosses of the wilds, offered by the people whose
// lives they make hard: a shepherd, a chapel keeper, a farmer, an innkeeper
// and the Crown's sergeant. Plus a standing Crown bounty on the champions
// (elite beasts) that prowl the deeper wilds.

const at = (id: string): [number, number] => LAIRS.find((l) => l.id === id)!.at;

export const WILDS_QUESTS: QuestDef[] = [
  {
    id: 'wilds-bristleback', title: 'The Tusked Terror', giver: 'garth', region: 'kingsRoad', requires: ['wolf-among-sheep'],
    summary: 'Old Garth says the dire wolf was not the only thing at his flock: a boar the size of a cart wallows in the woods south of Millbrook.',
    offer: 'The dire wolf’s dead, bless you, but it wasn’t only the wolf. There’s a boar in the woods south of here, past the fields: Old Bristleback, my father called it, and it was old then. It tears up the hedges and it killed my dog. Find its wallow, deep in the trees. Bring it down.',
    acceptLabel: 'I’ll find the wallow.',
    stages: [
      { note: 'Find Old Bristleback’s wallow in the woods south of Millbrook and kill it.', objectives: [{ type: 'kill', kind: 'bristleback', count: 1, text: 'Kill Old Bristleback', at: at('bristleback'), radius: 120 }] },
      { note: 'Tell Old Garth the boar is dead.', objectives: [{ type: 'talk', npc: 'garth', text: 'Tell Old Garth', say: 'Bristleback? Dead? Forty years that hog’s been in those woods. Here: my father’s purse, I never had a use for it. And drink to the dog, would you.' }] },
    ],
    done: 'Millbrook’s hedges are safe from Old Bristleback.',
    rewards: { gold: 180, xp: 420, items: [['greaterHealthPotion', 2]], guildRep: 30 },
  },
  {
    id: 'wilds-gnarlbark', title: 'The Groaning Glade', giver: 'aldous', region: 'kingsRoad',
    summary: 'Brother Aldous hears the old glade in the woods north of the King’s Road groaning at night, and pilgrims who go that way do not come back.',
    offer: 'There is a glade north of the road, far into the trees, where the first priests of the Dawn kept a ring of stones. Lately it groans at night like an old house in a gale, and two pilgrims who went to pray there never came back. The wood is waking, I think. Go and see. Be careful of the old oak.',
    acceptLabel: 'I’ll go to the glade.',
    stages: [
      { note: 'Find the Elder Glade in the woods north of the King’s Road, and whatever guards it.', objectives: [{ type: 'kill', kind: 'gnarlbark', count: 1, text: 'Lay the Rootwarden to rest', at: at('gnarlbark'), radius: 120 }] },
      { note: 'Tell Brother Aldous what you found.', objectives: [{ type: 'talk', npc: 'aldous', text: 'Tell Brother Aldous', say: 'A tree. A walking tree, that the old priests set to guard their stones, and that forgot why. Poor old thing. The Dawn will keep it now. Take this, with the chapel’s thanks.' }] },
    ],
    done: 'The Elder Glade sleeps again.',
    rewards: { gold: 220, xp: 560, items: [['greaterManaPotion', 2]], guildRep: 35 },
  },
  {
    id: 'wilds-greymane', title: 'The Wolf-Mother', giver: 'hedda', region: 'royalCapital', requires: ['thornfield-wolves'],
    summary: 'Hedda Thorne says the wolves keep coming back however many are killed, because their mother lives: a great grey she-wolf with a den north of the Crown Road.',
    offer: 'You thinned the pack, and a fortnight later they were back, more of them. My grandmother had a name for it: Greymane, the Wolf-Mother, big as a horse, with a den in the rocks deep in the woods north of the road. Every wolf on this road is one of hers. Kill her, and they’ll scatter for good.',
    acceptLabel: 'I’ll hunt the Wolf-Mother.',
    stages: [
      { note: 'Find Greymane’s den deep in the woods north of the Crown Road, and kill the Wolf-Mother.', objectives: [{ type: 'kill', kind: 'greymane', count: 1, text: 'Kill Greymane, the Wolf-Mother', at: at('greymane'), radius: 130 }] },
      { note: 'Tell Hedda the Wolf-Mother is dead.', objectives: [{ type: 'talk', npc: 'hedda', text: 'Tell Hedda', say: 'Greymane, dead. I didn’t truly believe she was real. Thornfield’s flocks will graze in peace. Take this, and the best fleece we have.' }] },
    ],
    done: 'The Wolf-Mother is dead and her packs scattered.',
    rewards: { gold: 300, xp: 700, items: [['wool', 3]], guildRep: 45 },
  },
  {
    id: 'wilds-thornhorn', title: 'The Antlered King', giver: 'oswin', region: 'royalCapital',
    summary: 'Oswin Hale of the Kingsmile tells of a white stag big as a warhorse, crowned in glowing antlers, that gores hunters in the deep woods north of the road.',
    offer: 'Three hunters from the capital stopped here last month, after the Antlered King. Old story: a white stag in the deep woods north of the road, crowned with antlers that shine like the moon. One of them came back. He drinks here every night now and doesn’t talk. If you want a legend, it’s out there. Bring back the crown and I’ll stand you drinks for a year.',
    acceptLabel: 'I’ll find the Antlered King.',
    stages: [
      { note: 'Find the Antlered King’s glade deep in the woods north of the Crown Road, beyond the Kingsmile.', objectives: [{ type: 'kill', kind: 'thornhorn', count: 1, text: 'Defeat Thornhorn, the Antlered King', at: at('thornhorn'), radius: 140 }] },
      { note: 'Tell Oswin at the Kingsmile.', objectives: [{ type: 'talk', npc: 'oswin', text: 'Tell Oswin', say: 'The crown! By the Dawn, it’s real. That hunter’s going to cry into his ale. Here: a year of drinks, paid up front. And a little more besides.' }] },
    ],
    done: 'The Antlered King is a story again.',
    rewards: { gold: 420, xp: 900, items: [['greaterHealthPotion', 3]], guildRep: 60 },
  },
  {
    id: 'wilds-ulgra', title: 'The Exile of the Skull Grove', giver: 'brask', region: 'royalCapital', requires: ['bonebreaker'],
    summary: 'With Gorrak dead, Sergeant Brask has a worse name on his list: Ulgra Skullsplitter, Gorrak’s exiled blood-sister, who hunts the deep woods south of the marches.',
    offer: 'Gorrak’s dead, and good riddance. But his lot whisper about one he threw out: Ulgra Skullsplitter. Too savage even for Gorrak, if you can believe it. She keeps a grove of skulls in the deep woods south of the marches, and she takes Crown couriers like a fox takes hens. Bring her down and I’ll see the Crown pays double.',
    acceptLabel: 'I’ll take the Skull Grove.',
    stages: [
      { note: 'Find the Skull Grove in the deep woods south of the orc marches and defeat Ulgra Skullsplitter.', objectives: [{ type: 'kill', kind: 'ulgra', count: 1, text: 'Defeat Ulgra Skullsplitter', at: at('ulgra'), radius: 140 }] },
      { note: 'Report to Sergeant Brask.', objectives: [{ type: 'talk', npc: 'brask', text: 'Report to Sergeant Brask', say: 'Ulgra. You’re sure? Then the couriers can ride again. Double, I said, and double it is. The Silver Lance will want to hear your name.' }] },
    ],
    done: 'The Skull Grove has lost its hunter.',
    rewards: { gold: 520, xp: 1100, guildRep: 90 },
  },
  {
    id: 'wilds-champions', title: 'Champions of the Wilds', giver: 'brask', region: 'royalCapital',
    summary: 'The Crown pays a bounty on the champions of the wilds: the elite beasts that prowl the deeper woods. Bring Sergeant Brask three trophies.',
    offer: 'Out past Thornfield the beasts get worse. Not just more of them: bigger ones, wrong ones. Wolves with eyes like coals, boars that bleed fire. The Crown pays for proof. Kill three of those champions, bring me something to show for each, and the bounty’s yours.',
    acceptLabel: 'I’ll hunt champions.',
    stages: [
      { note: 'Kill champions (elite beasts) in the wilds and bring Sergeant Brask three Champion’s Trophies.', objectives: [{ type: 'deliver', npc: 'brask', item: 'championTrophy', count: 3, text: 'Bring Brask 3 Champion’s Trophies', say: 'Three of them. Look at that one: the size of it. The Crown’s bounty, as promised, and the clerks will want to know where you found them.' }] },
    ],
    done: 'The Crown’s bounty, paid in full.',
    rewards: { gold: 360, xp: 650, guildRep: 40 },
  },
];
