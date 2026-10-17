import type { QuestDef, QuestLog } from './questLog';
import type { Paths } from '../paths/paths';
import { DISC } from '../paths/data';
import { CRYPT } from '../world/terrainHeight';
import { CHAPEL } from '../world/kingsRoad';

// Class trials: nobody starts with a class. Each mentor sets a short trial,
// and finishing it teaches the class (Skills screen, K). Asking the mentor to
// "teach me" starts the trial; the quest's completion hook does the teaching.

export const CLASS_TRIALS: QuestDef[] = [
  {
    id: 'trial-gale', title: 'Trial of the Gale', giver: 'kaela', region: 'cresha',
    summary: 'Kaela Voss will teach Gale Style to anyone who can prove they keep their feet in a real fight.',
    offer: 'Gale Style is footwork first and steel second. I don\'t teach it to people who freeze. Go and win three real fights, any three, and come back still standing. Then we talk.',
    acceptLabel: 'Three fights. Done.',
    stages: [
      { note: 'Defeat any three enemies.', objectives: [{ type: 'kill', kind: 'any', count: 3, text: 'Defeat 3 enemies' }] },
      { note: 'Return to Kaela Voss at the drill yard.', objectives: [{ type: 'talk', npc: 'kaela', text: 'Return to Kaela Voss', reply: 'Three fights. Still standing.', say: 'You came back, and you came back walking. Good. Now feel the wind before the blade moves.' }] },
    ],
    done: 'Gale Style is yours. Open your Skills (K) and put XP into it. Every level opens more of the way.',
    rewards: { gold: 0, xp: 60 },
  },
  {
    id: 'trial-pyro', title: 'Trial of the Ember', giver: 'magus', region: 'cresha',
    summary: 'Magus Orren will only teach fire to someone who has sat with it in the dark and not run.',
    offer: 'Fire is easy to make and hard to live with. Go to the mouth of the old crypt after nightfall and keep a vigil there. Feel how the dark presses on a small flame. If you come back, I will show you how to feed it.',
    acceptLabel: 'I\'ll keep the vigil.',
    stages: [
      { note: 'Keep a night vigil at the mouth of the crypt (after 20:00).', objectives: [
        { type: 'hour', from: 20, to: 4, text: 'Wait for nightfall (20:00)' },
        { type: 'reach', at: [CRYPT.x, CRYPT.y], radius: 16, text: 'Stand at the crypt entrance' },
      ] },
      { note: 'Return to Magus Orren.', objectives: [{ type: 'talk', npc: 'magus', text: 'Return to Magus Orren', reply: 'I kept the vigil.', say: 'You smell of cold stone and you did not run. Hold out your hand. Feel that? That is Heat. Feed it and it feeds you. Let it run wild and it eats you.' }] },
    ],
    done: 'You are a Pyromancer now, in name at least. Open your Skills (K). And mind the Heat.',
    rewards: { gold: 0, xp: 60 },
  },
  {
    id: 'trial-light', title: 'Vigil of the Dawn', giver: 'aldous', region: 'kingsRoad',
    summary: 'Brother Aldous teaches the binding of light, but only to those who have watched the sun come up at the Chapel of the Dawn.',
    offer: 'Light is not a weapon, traveller. It is a promise that the night ends. Keep the dawn vigil here at the chapel, between five and eight in the morning, and watch it keep that promise. Then I will teach you to hold it.',
    acceptLabel: 'I\'ll keep the dawn vigil.',
    stages: [
      { note: 'Keep the dawn vigil at the Chapel of the Dawn (5:00 to 8:00).', objectives: [
        { type: 'hour', from: 5, to: 8, text: 'Wait for dawn (5:00)' },
        { type: 'reach', at: [CHAPEL.x, CHAPEL.z], radius: 18, text: 'Stand at the Chapel of the Dawn' },
      ] },
      { note: 'Speak with Brother Aldous.', objectives: [{ type: 'talk', npc: 'aldous', text: 'Speak with Brother Aldous', reply: 'I watched the sun rise.', say: 'And it rose, as it always does. Now cup your hands. There. Do not throw it. Hold it, place it, tie it to things. That is the Lightbinder\'s way.' }] },
    ],
    done: 'You carry a little of the dawn now. Open your Skills (K). Your light grows in daylight and fades in the dark places.',
    rewards: { gold: 0, xp: 60 },
  },
];

/** Which class each trial teaches. */
const TEACHES: Record<string, string> = { 'trial-gale': 'gale', 'trial-pyro': 'pyromancer', 'trial-light': 'lightbinder' };

export function setupClassTrials(o: { quests: QuestLog; paths: Paths; toast: (m: string) => void }) {
  o.quests.add(...CLASS_TRIALS);
  for (const [quest, disc] of Object.entries(TEACHES)) {
    o.quests.hooks.set(quest + ':done', () => {
      if (o.paths.learned(disc)) return; // already taught (or re-run on load)
      if (o.paths.teach(disc)) o.toast(`Learned ${DISC[disc].name} · open Skills (K) to invest XP`);
    });
  }
  return {
    status: (id: string) => o.quests.status(id),
    accept: (id: string) => o.quests.accept(id),
    offer: (id: string) => o.quests.defs.get(id)?.offer ?? '',
    note: (id: string) => {
      const st = o.quests.state[id];
      const q = o.quests.defs.get(id);
      return st && q ? q.stages[st.stage]?.note ?? '' : '';
    },
  };
}
