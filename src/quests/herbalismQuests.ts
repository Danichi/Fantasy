import type { QuestDef, QuestLog } from './questLog';
import type { Herbalism } from '../herbalism/herbalism';

// The herbalist's road: Wenna Thistledown teaches the calling (The Green
// Craft: gather, brew, experiment, fight under an elixir), then the
// apothecaries each set a test of the craft. Hand-ins of brewed items go
// through the herbalism system's dialogue options (any quality at or above
// the asked one), which fire the signals below.

export const HERBALISM_QUESTS: QuestDef[] = [
  {
    id: 'herb-green-craft', title: 'The Green Craft', giver: 'wenna', region: 'royalCapital',
    summary: 'Wenna Thistledown will teach you Herbalism: gather, brew a tonic, discover a recipe of your own, and fight with an elixir in your blood.',
    offer: "You've been looking at my baskets the way a hungry man looks at a pie. Want to learn what's in them? Herb-lore isn't hard. It's patient. I'll teach you the first lesson now, and you'll do the rest. Pick two Sungrass and two Wild Mint, then brew me a Healing Tonic at my cauldron or any apothecary's table. After that, you experiment. Nettle and wolf fang in grain spirit, say. Find something I didn't tell you about.",
    acceptLabel: 'Teach me.',
    stages: [
      { note: 'Gather two Sungrass and two Wild Mint.', hook: 'herb:teach', objectives: [
        { type: 'collect', item: 'sungrass', count: 2, text: 'Gather Sungrass (meadows, roadsides)' },
        { type: 'collect', item: 'wildmint', count: 2, text: 'Gather Wild Mint (meadows)' },
      ] },
      { note: 'Brew a Healing Tonic at an alchemy table (Wenna\'s cauldron, or any apothecary).', objectives: [{ type: 'signal', id: 'herb-brew-healingTonic', text: 'Brew a Healing Tonic (two healing herbs, spring water)' }] },
      { note: 'Experiment: combine reagents into a recipe you were never taught.', objectives: [{ type: 'signal', id: 'herb-discover', text: 'Discover a recipe by experimenting (try nettle or wolf fang in grain spirit)' }] },
      { note: 'Drink a combat elixir and win a fight while it works.', objectives: [{ type: 'signal', id: 'herb-buffed-kill', count: 3, text: 'Defeat 3 foes with an elixir running' }] },
      { note: 'Go back to Wenna.', objectives: [{ type: 'talk', npc: 'wenna', text: 'Tell Wenna Thistledown what you brewed', reply: 'I brewed, I found something new, and I fought on it.', say: "Ha! Look at you, all lit up like a lantern. That's the craft: a few weeds, a bit of fire, and you're twice what you were. Here: a satchel, so you can brew on the road, and an old primer of mine." }] },
    ],
    done: "From here it's all practice. Every herb you pick and every pot you stir teaches you something. And mind your toxicity: you're not a barrel.",
    rewards: { gold: 80, xp: 160, items: [['herbalistSatchel', 1], ['bookHedgeWitch', 1], ['grainSpirit', 3], ['pressedOil', 2]] },
  },
  {
    id: 'herb-watch-draughts', title: 'Draughts for the Watch', giver: 'apothecary', region: 'cresha', requires: ['herb-green-craft'],
    summary: 'Ilyra Moss needs three Fine (or better) Healing Tonics for Captain Brannoc\'s Watch.',
    offer: "So Wenna took you on? Then you can help me. Brannoc's Watch goes through tonics like bread, and my hands are full. Three Healing Tonics, Fine or better. Not Crude, not Common. A good pour, steady heat, clean herbs.",
    stages: [
      { note: 'Brew three Healing Tonics of Fine quality or better and hand them to Ilyra Moss.', objectives: [{ type: 'signal', id: 'herb-ilyra-tonics', text: 'Hand Ilyra three Fine Healing Tonics', at: [48, -2] }] },
    ],
    done: "There. You're no apprentice any more. Take this: the sergeants' herbal. Every soldier should have it; none of them read it.",
    rewards: { gold: 120, xp: 180, items: [['bookSoldier', 1]] },
  },
  {
    id: 'herb-quill-rival', title: "The Rival's Bottle", giver: 'quill', region: 'portAurelle', requires: ['herb-green-craft'],
    summary: 'Quill Mereweather doubts any village herbalist can match his draughts. Show him an elixir of Superior quality or better.',
    offer: "A herbalist? From the Glen? Hah. Village tonics are pond water with a pretty label. Bring me an elixir, a real combat elixir, of Superior quality or better, and I'll eat my apron. And pay you. Mostly pay you.",
    stages: [
      { note: 'Brew a combat elixir of Superior quality (or better) and show it to Quill.', objectives: [{ type: 'signal', id: 'herb-quill-elixir', text: 'Show Quill a Superior (or better) combat elixir', at: [2776, 158] }] },
    ],
    done: "Don't look so smug. Here, take my sea-surgeon's notes and some decent oil. And if anyone asks, you learned it all from me.",
    rewards: { gold: 220, xp: 260, items: [['bookMariner', 1], ['pressedOil', 4], ['saltwort', 3]] },
  },
  {
    id: 'herb-sun-balm', title: 'Balm for the Sun-Struck', giver: 'gh-apoth', region: 'Golden Expanse', requires: ['herb-green-craft'],
    summary: 'Healer Meritites needs Fireward Draughts for the quarry gangs working through the noon heat.',
    offer: "The sun is killing my quarrymen. Not quickly. Quickly would be kinder. A Fireward Draught keeps the heat out of the blood: frost and ward, in water. Sand sage grows in the dunes and has the frost in it. Bring me two, and the House of Balms will remember.",
    stages: [
      { note: 'Brew two Fireward Draughts (frost + ward, in water) and bring them to Healer Meritites.', objectives: [{ type: 'signal', id: 'herb-meritites-fireward', text: 'Hand Meritites two Fireward Draughts' }] },
    ],
    done: "Take these, from the deep sand. Flowers that bloom in fire and by moonlight. Use them well.",
    rewards: { gold: 260, xp: 280, items: [['desertRose', 3], ['ghostCactus', 1], ['bookDesert', 1]] },
  },
  {
    id: 'herb-grey-work', title: 'The Grey Work', giver: 'capAlchemist', region: 'royalCapital', requires: ['herb-green-craft'],
    summary: 'Fenwick Ashgrove wants proof that hallowed oil works on the restless dead. Destroy five undead with a hallowed blade.',
    offer: "The temple says hallowed oil burns the dead. The Collegium says the temple says a lot of things. Settle it for me: coat a blade in Hallowed Oil, from the Grey Compendium if you don't know it, and put five of the restless dead back in the ground. Crypts, barrows, the Gravewood. Wherever they walk.",
    stages: [
      { note: 'Destroy five undead with Hallowed Oil on your blade.', objectives: [{ type: 'signal', id: 'herb-hallowed-kill', count: 5, text: 'Destroy undead with a hallowed blade' }] },
      { note: 'Report to Fenwick Ashgrove in the market.', objectives: [{ type: 'talk', npc: 'capAlchemist', text: 'Report to Fenwick Ashgrove', reply: 'Five of them. The oil burned them like dry leaves.', say: 'Like dry leaves! I knew it. I shall write a very rude letter to the temple.' }] },
    ],
    done: "Here, the Pharmacopoeia. It cost the Collegium a fortune; it cost me a favour. Worth it.",
    rewards: { gold: 300, xp: 340, items: [['bookCollegium', 1]] },
  },
];

/** Register the quests and their hooks. */
export function setupHerbalismQuests(quests: QuestLog, herb: Herbalism) {
  quests.add(...HERBALISM_QUESTS);
  // Accepting The Green Craft is Wenna's first lesson: it teaches the calling.
  quests.hooks.set('herb:teach', () => {
    if (herb.teach()) herb.hooks.toast('Learned Herbalism · gather and brew to raise it, or invest XP (K)');
  });
}
