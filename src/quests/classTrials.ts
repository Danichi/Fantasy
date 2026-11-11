import type { QuestDef, QuestLog } from './questLog';
import type { Paths } from '../paths/paths';
import { DISC, DISCIPLINES } from '../paths/data';
import { events } from '../core/events';
import { lessonHook } from '../paths/mentors';
import { CRYPT } from '../world/terrainHeight';
import { CHAPEL } from '../world/kingsRoad';
import { ROSTER } from '../paths/roster';

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
    id: 'trial-boundary', title: 'Hold the Line', giver: 'corvin', region: 'cresha',
    summary: 'Ser Corvin will teach the Boundary only to someone who can stand their ground and turn blows aside.',
    offer: 'Anyone can swing a sword. The Boundary is the opposite: you choose a spot, and nothing gets past you. Show me you can stand. Turn aside fifteen blows, with a shield or a parry, it makes no difference to me. Then come back.',
    acceptLabel: 'Fifteen blows. I\'ll hold.',
    stages: [
      { note: 'Turn aside 15 blows: block them with a shield or parry them (F).', objectives: [{ type: 'signal', id: 'trial-boundary', count: 15, text: 'Block or parry 15 blows' }] },
      { note: 'Return to Ser Corvin at the north gate.', objectives: [{ type: 'talk', npc: 'corvin', text: 'Return to Ser Corvin', reply: 'Fifteen blows. I\'m still standing.', say: 'So you are. Now forget the shield for a moment. Plant your feet. Breathe. Draw a line around yourself in your mind. That ring is yours, and nothing crosses it unless you let it.' }] },
    ],
    done: 'That is the Boundary. Hold F and stand still to raise it. Open your Skills (K) and spend your XP on it.',
    rewards: { gold: 0, xp: 60 },
  },
  {
    id: 'trial-cross', title: 'Keep the Beat', giver: 'ilse', region: 'kingsRoad',
    summary: 'Ilse Vantara, a travelling fencer at the Wayfarer\'s Rest, teaches two-sword Cross Style to anyone who can keep her rhythm.',
    offer: 'Two blades are not twice one blade. They are a rhythm: left, right, left, right, and the enemy never finds the gap. Carry a sword in each hand and land twelve strikes in rhythm, alternating, no pauses. Then we\'ll talk.',
    acceptLabel: 'Twelve in rhythm.',
    stages: [
      { note: 'With a sword in each hand, land 12 strikes alternating left (left mouse) and right (right mouse) without pausing.', objectives: [{ type: 'signal', id: 'trial-cross', count: 12, text: 'Land 12 alternating strikes with two swords' }] },
      { note: 'Return to Ilse at the Wayfarer\'s Rest.', objectives: [{ type: 'talk', npc: 'ilse', text: 'Return to Ilse', reply: 'Left, right, left. Twelve.', say: 'I heard it from here. You have the beat. Now we make it faster.' }] },
    ],
    done: 'Cross Style is yours. Open your Skills (K). Keep the beat, and your blades will keep you.',
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

// The roster's foundation classes (paths/roster): one trial each, from the class's own spec.
export const ROSTER_TRIALS: QuestDef[] = ROSTER.filter((s) => s.trial && s.mentorNpc).map((s) => {
  const t = s.trial!, who = s.mentor.split(',')[0];
  return {
    id: `trial-${s.id}`, title: `Trial of the ${s.name}`, giver: s.mentorNpc!, region: t.region ?? 'cresha',
    summary: `${who} will teach ${s.name} to anyone who passes a trial first.`,
    offer: t.offer, acceptLabel: t.accept,
    stages: [
      { note: `${t.text}.`, objectives: [t.kill ? { type: 'kill', kind: t.kill, count: t.count, text: t.text } : { type: 'signal', id: t.signal ?? `trial-${s.id}`, count: t.count, text: t.text }] },
      { note: `Return to ${who}.`, objectives: [{ type: 'talk', npc: s.mentorNpc!, text: `Return to ${who}`, reply: t.reply, say: t.say }] },
    ],
    done: `${s.name} is yours. Open your Skills (K) and put XP into it.`,
    rewards: { gold: 0, xp: 60 },
  } as QuestDef;
});

const VIGILS = [
  { id: 'vigil-pyro', at: () => [CRYPT.x, CRYPT.y] as const, r: 16, from: 20, to: 4, wait: 'The crypt mouth is just stone by daylight. Come back after 20:00 and keep the vigil.', start: 'You settle at the crypt mouth. The dark leans in. Stay.' },
  { id: 'vigil-light', at: () => [CHAPEL.x, CHAPEL.z] as const, r: 18, from: 5, to: 8, wait: 'The dawn vigil is kept between 5:00 and 8:00. Come back at first light.', start: 'You kneel by the chapel as the sky begins to pale. Stay.' },
];
const inHours = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** Which class each trial teaches. */
const TEACHES: Record<string, string> = {
  'trial-gale': 'gale', 'trial-boundary': 'boundary', 'trial-cross': 'cross', 'trial-pyro': 'pyromancer', 'trial-light': 'lightbinder',
  ...Object.fromEntries(ROSTER_TRIALS.map((q) => [q.id, q.id.slice('trial-'.length)])),
};

/** The level a class's mastery quest opens at. */
export const MASTERY_LEVEL = 20;
const COMBAT_KILLS = 30, MAGIC_CASTS = 40;

/**
 * Mastery quests: at level 20 a class's mentor sets one last task, and gives
 * you a keepsake of theirs when it's done (items/catalog/classKeepsakes.ts).
 * Combat classes count kills while they are your fighting class; magic
 * classes count their techniques used.
 */
export function masteryQuests(paths: Paths): QuestDef[] {
  return DISCIPLINES.filter((d) => (d.fam === 'combat' || d.fam === 'magic') && d.mentorNpc).map((d) => {
    const who = d.mentor.split(',')[0];
    const combat = d.fam === 'combat';
    const task = combat ? `Defeat ${COMBAT_KILLS} enemies with ${d.name} as your fighting class` : `Use ${d.name} techniques ${MAGIC_CASTS} times in battle`;
    return {
      id: `mastery-${d.id}`, title: `Mastery of the ${d.name}`, giver: d.mentorNpc!, region: 'cresha',
      summary: `${who} has one last task for you before calling you a master of ${d.name}.`,
      offer: `You have come a long way with ${d.name}. Before I call you a master there is one more thing: ${task.charAt(0).toLowerCase()}${task.slice(1)}. Not to prove it to me. To prove it to yourself.`,
      acceptLabel: 'I\'ll do it.',
      offerIf: () => paths.level(d.id) >= MASTERY_LEVEL,
      stages: [
        { note: `${task}.`, objectives: [{ type: 'signal', id: `mastery-${d.id}`, count: combat ? COMBAT_KILLS : MAGIC_CASTS, text: task }] },
        { note: `Return to ${who}.`, objectives: [{ type: 'talk', npc: d.mentorNpc!, text: `Return to ${who}`, reply: 'It is done.', say: `Then you are a master of ${d.name}, and nobody can take that from you. Here. This was mine. It should be yours now.` }] },
      ],
      done: `You have mastered ${d.name}. Your mentor's keepsake is in your bag.`,
      rewards: { gold: 0, xp: 600 },
    } as QuestDef;
  });
}

export function setupClassTrials(o: { quests: QuestLog; paths: Paths; toast: (m: string) => void }) {
  o.quests.add(...CLASS_TRIALS, ...ROSTER_TRIALS, ...masteryQuests(o.paths));
  // Mastery counts: kills with your fighting class, techniques of a magic class.
  events.on('enemyDied', () => {
    const a = o.paths.active;
    if (DISC[a]?.fam === 'combat') o.quests.signal(`mastery-${a}`);
  });
  events.on('spellCast', ({ spell }) => {
    const head = spell.split(':')[0];
    if (DISC[head]?.fam === 'magic') o.quests.signal(`mastery-${head}`);
  });
  for (const [quest, disc] of Object.entries(TEACHES)) {
    o.quests.hooks.set(quest + ':done', () => {
      if (o.paths.learned(disc)) return; // already taught (or re-run on load)
      // The mentor's lesson does the teaching, once the turn-in conversation is over.
      if (lessonHook.start?.(DISC[disc], true)) return;
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
