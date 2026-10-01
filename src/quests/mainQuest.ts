import type { QuestDef, QuestLog } from './questLog';
import { CRYPT, GRAVEWOOD } from '../world/terrainHeight';
import { STANDING_STONES } from '../world/glenLandmarks';

// The main story's opening act, before the Road to Port Aurelle: find your
// feet in Elder Glen, then the crypt on the hill, then the cursed Gravewood.
// Each chapter hands straight on to the next, so the tracker always has
// somewhere to point you.

export const MAIN_CHAIN = ['mq-stranger', 'mq-crypt', 'mq-gravewood', 'road-to-port'];

const GW_GATE: [number, number] = [GRAVEWOOD.x, GRAVEWOOD.y - 24];

export const MAIN_QUESTS: QuestDef[] = [
  {
    id: 'mq-stranger', title: 'A Stranger in Elder Glen', giver: 'maud', region: 'cresha', main: true,
    summary: 'You woke in a field outside Elder Glen with no memory of the road that brought you. The village elder, Maud Hollis, wants a word.',
    offer: 'You look lost, dear. Come and sit a moment.',
    stages: [
      { note: 'Speak with Elder Maud on the plaza.', objectives: [{ type: 'talk', npc: 'maud', text: 'Speak with Elder Maud on the plaza', reply: 'Where am I?', say: 'Elder Glen, in the Kingdom of Cresha — and you arrived in a flash of light over the south field, which is not how most folk arrive. Walk the village first. See the market, the forge and the Wardens\' guild hall; you\'ll need all three. Then come back to me.' }] },
      { note: 'Get to know the village.', objectives: [
        { type: 'reach', at: [0, 6], radius: 9, text: 'Browse the market stalls' },
        { type: 'reach', at: [27, 17], radius: 7, text: 'Visit Master Fröst\'s forge' },
        { type: 'reach', at: [22, -6], radius: 7, text: 'Look in on the Wardens\' guild hall' },
      ] },
      { note: 'Return to Elder Maud.', objectives: [{ type: 'talk', npc: 'maud', text: 'Return to Elder Maud', reply: 'I\'ve seen the village.', say: 'Good. Then you\'ve seen what there is to protect.' }] },
    ],
    done: 'Here — a little coin and some of Ilyra\'s draughts. Now, there\'s something I didn\'t want to say in front of the children.',
    rewards: { gold: 40, xp: 60, items: [['healthPotion', 3]] },
  },
  {
    id: 'mq-crypt', title: 'Lights on the Hill', giver: 'maud', region: 'cresha', main: true, requires: ['mq-stranger'],
    summary: 'Lights have been seen at the old crypt on the hill north of the village, and orcs have been seen on the path. Maud wants to know what\'s down there.',
    offer: 'For a week now there have been lights in the old crypt on the hill, and the shepherds have seen orcs on the path. An orc warlord called Grukk has made his den under our dead. Go up the north road and put an end to it.',
    stages: [
      { note: 'Climb the north road to the crypt on the hill.', objectives: [{ type: 'reach', at: [CRYPT.x, CRYPT.y + 12], radius: 12, text: 'Climb to the crypt on the hill (north)' }] },
      { note: 'Descend into the crypt and defeat Grukk.', objectives: [{ type: 'signal', id: 'grukk-dead', text: 'Defeat Grukk in the crypt\'s depths', at: [CRYPT.x, CRYPT.y] }] },
      { note: 'Tell Elder Maud the crypt is clear.', objectives: [{ type: 'talk', npc: 'maud', text: 'Tell Elder Maud the crypt is clear', reply: 'Grukk is dead.', say: 'Dead? Truly? I\'ll have the bell rung. Fröst will want to hear it too — he\'s been hoarding his good steel for someone who\'s earned it.' }] },
    ],
    done: 'But I\'m afraid Grukk was not the worst of it. Magus Orren has been reading the old stones, and he\'s frightened. Go and see him, by the forge.',
    rewards: { gold: 150, xp: 250, guildRep: 20 },
  },
  {
    id: 'mq-gravewood', title: 'The Dead Wood', giver: 'magus', region: 'cresha', main: true, requires: ['mq-crypt'],
    summary: 'The dead are rising in the Gravewood, south-west of the village. Magus Orren believes the old Sunwheel stones once kept them down.',
    offer: 'The Gravewood, south-west of here. Its dead are walking again.',
    stages: [
      { note: 'Speak with Magus Orren.', objectives: [{ type: 'talk', npc: 'magus', text: 'Speak with Magus Orren', reply: 'Maud sent me.', say: 'Something old is waking in the Gravewood, and the ward that held it has failed. The Sunwheel stones in the northern hills held that ward. Read the carving on the central stone and tell me what it says.' }] },
      { note: 'Read the Sunwheel on the standing stones.', objectives: [{ type: 'signal', id: 'stones-read', text: 'Study the carving at the standing stones (north-west hills)', at: [STANDING_STONES.x, STANDING_STONES.z] }] },
      { note: 'Enter the Gravewood.', objectives: [{ type: 'reach', at: GW_GATE, radius: 14, text: 'Enter the Gravewood (south-west)' }] },
      { note: 'Survive the risen dead and destroy what wakes them.', objectives: [{ type: 'signal', id: 'gravewood-cleared', text: 'Break the curse on the Gravewood', at: [GRAVEWOOD.x, GRAVEWOOD.y] }] },
      { note: 'Return to Magus Orren.', objectives: [{ type: 'talk', npc: 'magus', text: 'Return to Magus Orren', reply: 'The Gravewood is quiet.', say: 'I felt it break from here — a clean note, like a struck bell. The wheel turns again.' }] },
    ],
    done: 'This was left with the Order when the ward was raised: Dawnbreaker. It burns clean. And Maud has a road for you now, I think — east, to the sea.',
    rewards: { gold: 250, xp: 400, items: [['dawnbreaker', 1]], guildRep: 30 },
  },
];

/**
 * Wire the chain: each chapter starts the next, a new game starts the first,
 * and world state (Grukk's death, a broken curse) is polled into signals so
 * a crypt cleared before the quest asked still counts.
 */
export function setupMainQuest(quests: QuestLog, world: { grukkDead: () => boolean; gravewoodCleared: () => boolean }) {
  quests.add(...MAIN_QUESTS);
  for (let i = 0; i < MAIN_CHAIN.length - 1; i++) {
    const next = MAIN_CHAIN[i + 1];
    quests.hooks.set(MAIN_CHAIN[i] + ':done', () => quests.accept(next));
  }
  let t = 0;
  return {
    /** After the save loads: an old save that already started the port road keeps its story. */
    begin() {
      if (!MAIN_CHAIN.some((id) => quests.state[id])) quests.accept('mq-stranger');
    },
    update(dt: number) {
      t += dt;
      if (t < 0.5) return;
      t = 0;
      if (quests.wants('grukk-dead') && world.grukkDead()) quests.signal('grukk-dead');
      if (quests.wants('gravewood-cleared') && world.gravewoodCleared()) quests.signal('gravewood-cleared');
    },
  };
}
