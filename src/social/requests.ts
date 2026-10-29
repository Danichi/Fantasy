import { mulberry32 } from '../core/math';
import type { QuestDef, QuestLog } from '../quests/questLog';
import { ITEMS } from '../items/itemDefs';
import type { GiftKind, Profile } from './profile';
import { seedOf } from './profile';
import type { Social } from './wiring';
import type { Mood } from './reputation';

// Favours (NPC overhaul, phase 4): anyone who doesn't dislike you may ask for
// a hand: fetch them something they need, run a message to someone in their
// life, or deal with the wolves at the edge of town. They're ordinary quests
// (the journal tracks them, rewards scale with goodwill) made up on the spot
// from who the person is. Friends ask more often and pay better.

export interface RequestSave {
  /** how many favours each person has asked (the next one's seed) */
  seq: Record<string, number>;
  /** quest ids made so far that are still in play */
  open: string[];
  /** the last day each person asked */
  asked: Record<string, number>;
}

const FETCH: Partial<Record<GiftKind, string[]>> = {
  food: ['wheat', 'carrot', 'cabbage', 'pumpkin', 'egg', 'milk'],
  sweets: ['apple', 'pear', 'honeycomb', 'brambleBerries'],
  drink: ['honeycomb', 'apple'],
  herbs: ['wildGarlic', 'silverthistle', 'duskbloom', 'emberroot', 'chamomile', 'yarrow', 'nettle'],
  flowers: ['marigold', 'foxglove', 'moonpetal', 'duskbloom'],
  tools: ['ironOre', 'planks', 'coal', 'leather'],
  gems: ['silverOre', 'pearl'],
  potions: ['healthPotion'],
};
const MOODS: Mood[] = ['hostile', 'cold', 'wary', 'neutral', 'warm', 'friend', 'devoted'];

const WHY_FETCH = [
  'I\'m short of {item} and the market\'s been no help.',
  'I need {n} {item}. Don\'t ask what for. All right, it\'s for a pie.',
  'If you happen across {item}, I\'d pay for {n} of them. Fair pay.',
  'My stores are down to nothing. {n} {item} would see me through the week.',
];
const WHY_ERRAND = [
  'Would you look in on {other} for me? We had words, and I\'d like to know they\'re all right.',
  'Take a message to {other}, would you? Tell them I\'m sorry about the other night. They\'ll know.',
  'I owe {other} a favour and I can\'t get away. Ask them what they need from me, and come back and tell me.',
];
const WHY_HUNT = [
  'Wolves have been at the edge of town again. Thin a few out and I\'ll make it worth your while.',
  'Something\'s been taking the hens. Wolves, I\'d bet. Three of them, if you can.',
];

export function setupRequests(social: Social, quests: QuestLog, day: () => number, save?: RequestSave) {
  const { people, rep } = social;
  const state: RequestSave = { seq: { ...(save?.seq ?? {}) }, open: [...(save?.open ?? [])], asked: { ...(save?.asked ?? {}) } };

  /** Make (or remake, after a load) the favour with this id. */
  const build = (id: string): QuestDef | null => {
    const [, who, nStr] = id.split(':');
    const p = people.get(who);
    if (!p) return null;
    const r = mulberry32(seedOf(id));
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const others = p.ties.filter((t) => t.id !== who && people.present(t.id) && people.get(t.id)?.settlement === p.settlement);
    const kinds: ('fetch' | 'errand' | 'hunt')[] = ['fetch', 'fetch'];
    if (others.length) kinds.push('errand', 'errand');
    if (p.guard || p.job === 'farmer' || p.job === 'shepherd') kinds.push('hunt');
    const kind = pick(kinds);
    const base = 30 + Math.floor(r() * 30) + Number(nStr) * 5;
    const title = (t: string) => `${p.first}: ${t}`;
    const fill = (s: string, x: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => x[k] ?? k);
    if (kind === 'fetch') {
      const pool = p.likes.flatMap((k) => FETCH[k] ?? []).filter((x) => ITEMS[x]);
      const item = pool.length ? pick(pool) : 'wheat';
      const n = item === 'healthPotion' || item === 'pearl' || item === 'silverOre' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 4);
      const name = ITEMS[item]?.name ?? item;
      return {
        id, giver: who, region: p.settlement, title: title(`${n} ${name}`), summary: `${p.name} needs ${n} ${name}.`,
        offer: fill(pick(WHY_FETCH), { item: name, n: String(n) }), acceptLabel: 'I\'ll find some.',
        stages: [{ note: `Bring ${p.first} ${n} ${name}.`, objectives: [{ type: 'deliver', npc: who, item, count: n, text: `Bring ${n} ${name} to ${p.first}`, say: 'Oh, that\'s perfect. Thank you. Here, for your trouble.' }] }],
        done: 'You\'re a good sort. I won\'t forget it.',
        rewards: { gold: base + n * 4, xp: 40 + n * 6 },
      };
    }
    if (kind === 'errand') {
      const o = people.get(pick(others).id)!;
      return {
        id, giver: who, region: p.settlement, title: title(`a word with ${o.first}`), summary: `${p.name} asked you to see ${o.name}.`,
        offer: fill(pick(WHY_ERRAND), { other: o.first }), acceptLabel: 'I\'ll go.',
        stages: [
          { note: `Find ${o.name}.`, objectives: [{ type: 'talk', npc: o.id, text: `Talk to ${o.name}`, say: `${p.first} sent you? Ha. Tell them I'm fine, and that I miss them. Don't tell them that last bit.`, reply: `${p.first} sent me.` }] },
          { note: `Tell ${p.first} what ${o.first} said.`, objectives: [{ type: 'talk', npc: who, text: `Go back to ${p.first}`, say: `They said that? Thank you. Truly. That's a weight off.`, reply: `I spoke to ${o.first}.` }] },
        ],
        done: 'I owe you one.',
        rewards: { gold: base, xp: 50 },
      };
    }
    const n = 3;
    return {
      id, giver: who, region: p.settlement, title: title('wolves at the edge of town'), summary: `${p.name} wants the wolves thinned out.`,
      offer: pick(WHY_HUNT), acceptLabel: 'Consider it done.',
      stages: [
        { note: `Kill ${n} wolves.`, objectives: [{ type: 'kill', kind: 'wildWolf', count: n, text: `Kill ${n} wolves` }] },
        { note: `Tell ${p.first} it's done.`, objectives: [{ type: 'talk', npc: who, text: `Go back to ${p.first}`, say: 'That\'s three fewer to worry about. Thank you.', reply: 'The wolves are dealt with.' }] },
      ],
      done: 'The town sleeps easier for it.',
      rewards: { gold: base + 25, xp: 90 },
    };
  };

  // Remake the favours still in play before the journal loads.
  for (const id of state.open) {
    const d = build(id);
    if (d) quests.add(d);
  }

  /** Before a conversation: someone who likes you may have a favour to ask. */
  const prepare = (who: string) => {
    const p: Profile | undefined = people.get(who);
    if (!p || p.child || !people.present(who)) return;
    const mood = rep.moodOf(who);
    if (MOODS.indexOf(mood) < MOODS.indexOf('neutral')) return;
    // One at a time each, a few at a time in all, and not every day.
    state.open = state.open.filter((id) => quests.status(id) !== 'done' && (quests.status(id) === 'active' || quests.offers(id.split(':')[1]).some((q) => q.id === id)));
    if (state.open.some((id) => id.split(':')[1] === who)) return;
    if (state.open.filter((id) => quests.isActive(id)).length >= 4) return;
    const wait = mood === 'devoted' || mood === 'friend' ? 1 : mood === 'warm' ? 2 : 3;
    if (day() - (state.asked[who] ?? -99) < wait) return;
    // Strangers don't always have something; friends usually do.
    const chance = mood === 'neutral' ? 0.35 : mood === 'warm' ? 0.6 : 0.85;
    const r = mulberry32(seedOf(who + ':' + day()))();
    state.asked[who] = day();
    if (r > chance) return;
    const n = state.seq[who] ?? 0;
    state.seq[who] = n + 1;
    const id = `req:${who}:${n}`;
    const d = build(id);
    if (!d) return;
    // Friends add something from their own stores.
    if (mood === 'friend' || mood === 'devoted') d.rewards.items = [['healthPotion', mood === 'devoted' ? 2 : 1]];
    quests.add(d);
    state.open.push(id);
  };

  // A favour done is a favour remembered (on top of the quest-done goodwill).
  const prevDone = quests.onDone;
  quests.onDone = (q) => {
    prevDone?.(q);
    if (q.id.startsWith('req:')) {
      rep.act('favour', { who: q.giver });
      state.open = state.open.filter((x) => x !== q.id);
    }
  };

  return {
    prepare,
    save: (): RequestSave => state,
  };
}

export type Requests = ReturnType<typeof setupRequests>;
