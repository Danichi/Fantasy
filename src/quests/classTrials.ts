import type { QuestDef, QuestLog } from './questLog';
import type { Paths } from '../paths/paths';
import { DISC } from '../paths/data';
import { CRYPT } from '../world/terrainHeight';
import { CHAPEL } from '../world/kingsRoad';

// Class trials: nobody starts with a class. Each mentor sets a short trial,
// and finishing it teaches the class (Skills screen, K). Asking the mentor to
// "teach me" starts the trial; the quest's completion hook does the teaching.

/** Seconds a vigil takes: you have to stay there through it, at the right hour. */
const VIGIL = 20;

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
      { note: 'Keep a night vigil at the mouth of the crypt, between 20:00 and 4:00. Stay close and keep still.', objectives: [
        { type: 'signal', id: 'vigil-pyro', count: VIGIL, text: 'Keep the night vigil at the crypt mouth (20:00 to 4:00)', at: [CRYPT.x, CRYPT.y] },
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
      { note: 'Keep the dawn vigil at the Chapel of the Dawn, between 5:00 and 8:00. Stay close and watch the sun come up.', objectives: [
        { type: 'signal', id: 'vigil-light', count: VIGIL, text: 'Keep the dawn vigil at the chapel (5:00 to 8:00)', at: [CHAPEL.x, CHAPEL.z] },
      ] },
      { note: 'Speak with Brother Aldous.', objectives: [{ type: 'talk', npc: 'aldous', text: 'Speak with Brother Aldous', reply: 'I watched the sun rise.', say: 'And it rose, as it always does. Now cup your hands. There. Do not throw it. Hold it, place it, tie it to things. That is the Lightbinder\'s way.' }] },
    ],
    done: 'You carry a little of the dawn now. Open your Skills (K). Your light grows in daylight and fades in the dark places.',
    rewards: { gold: 0, xp: 60 },
  },
];

const VIGILS = [
  { id: 'vigil-pyro', at: () => [CRYPT.x, CRYPT.y] as const, r: 16, from: 20, to: 4, wait: 'The crypt mouth is just stone by daylight. Come back after 20:00 and keep the vigil.', start: 'You settle at the crypt mouth. The dark leans in. Stay.' },
  { id: 'vigil-light', at: () => [CHAPEL.x, CHAPEL.z] as const, r: 18, from: 5, to: 8, wait: 'The dawn vigil is kept between 5:00 and 8:00. Come back at first light.', start: 'You kneel by the chapel as the sky begins to pale. Stay.' },
];
const inHours = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

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
  // Vigils: count the seconds you spend at the spot during the right hours.
  const acc: Record<string, number> = {};
  const told: Record<string, string> = {};
  const vigil = (dt: number, pos: { x: number; z: number }, hour: number) => {
    for (const v of VIGILS) {
      if (!o.quests.wants(v.id)) continue;
      const [x, z] = v.at();
      const here = Math.hypot(pos.x - x, pos.z - z) < v.r;
      if (!here) {
        acc[v.id] = 0;
        if (told[v.id] === 'start') told[v.id] = '';
        continue;
      }
      if (!inHours(hour, v.from, v.to)) {
        if (told[v.id] !== 'wait') o.toast(v.wait);
        told[v.id] = 'wait';
        continue;
      }
      if (told[v.id] !== 'start') o.toast(v.start);
      told[v.id] = 'start';
      acc[v.id] = (acc[v.id] ?? 0) + dt;
      while (acc[v.id] >= 1) {
        acc[v.id] -= 1;
        o.quests.signal(v.id);
      }
    }
  };
  return {
    update: vigil,
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
