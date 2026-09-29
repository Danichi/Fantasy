import * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { DialogueOption } from '../ui/dialogue';
import type { Look } from '../npc/charBuilder';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';

// The Knight's Academy after the entrance trial (World Expansion phase 5):
// academy ranks (Cadet -> Squire -> Knight-Aspirant; the Knight's accolade
// waits on the school masteries in the next chapter), a sparring ladder of
// repeatable bouts, one a day, Archivist Mell's lore examination, and a free
// dormitory bed for cadets. Everything here is dialogue and world flags.

export type AcademyRank = 'none' | 'cadet' | 'squire' | 'aspirant';
export const RANK_NAMES: Record<AcademyRank, string> = { none: 'Not enrolled', cadet: 'Cadet', squire: 'Squire', aspirant: 'Knight-Aspirant' };

export function academyRank(quests: QuestLog, flags: Record<string, unknown>): AcademyRank {
  if (flags.academyRank === 'aspirant') return 'aspirant';
  if (quests.isDone('academy-oath')) return 'squire';
  if (quests.isDone('academy-trial')) return 'cadet';
  return 'none';
}

const cadetLook = (hair: Look['hair'], hairColor: number, skin: number, female = false): Look =>
  ({ body: female ? 'female' : 'male', outfit: 'ranger', hair, hairColor, skin, cloth: 0x2f5f9a, height: female ? 1.7 : 1.8 });

/** The ladder, bottom rung first. `id` names a resident whose look is borrowed. */
export const LADDER: { name: string; id?: string; look?: Look; hp: number; damage: number; pace: number; purse: number }[] = [
  { name: 'Cadet Pell Ashby', look: cadetLook('buzzed', 0x6a4428, 0xe0b894), hp: 150, damage: 10, pace: 1.3, purse: 15 },
  { name: 'Cadet Wren Tidewell', look: cadetLook('buns', 0xa04a28, 0xfff0e6, true), hp: 180, damage: 12, pace: 1.15, purse: 20 },
  { name: 'Cadet Dorian Vale', id: 'dorian', hp: 240, damage: 14, pace: 1, purse: 30 },
  { name: 'Instructor Lyra Quen', id: 'lyra', hp: 280, damage: 15, pace: 0.8, purse: 40 },
  { name: 'Master Sable Ro', id: 'sable', hp: 320, damage: 17, pace: 0.85, purse: 50 },
  { name: 'Ser Hadrik Vane', id: 'hadrik', hp: 380, damage: 19, pace: 0.9, purse: 65 },
  { name: 'Knight-Captain Elian Marrow', id: 'marrow', hp: 440, damage: 21, pace: 0.8, purse: 90 },
];
export const ASPIRANT_RUNGS = 4;

/** Archivist Mell's examination: the first answer is the right one (shuffled when asked). */
export const QUIZ: [string, string[]][] = [
  ['Which farming town feeds half of Cresha, and whose word runs it?', ['Elder Glen, under Elder Maud Hollis', 'Millbrook, under the miller', 'Port Aurelle, under the governor']],
  ['The ring-and-rays mark cut into the crypt and the standing stones. What do scholars call it?', ['The Sunwheel', 'The Starfall Script', 'The Crown Seal']],
  ['Which road runs from Elder Glen east to the sea?', ['The King’s Road', 'The Crown Road', 'The Greenwood Road']],
  ['Name the three sword schools taught in this Academy.', ['Gale, Boundary and Cross', 'Flame, Frost and Storm', 'Shield, Spear and Bow']],
  ['Which school lives on rhythm and momentum?', ['Gale', 'Boundary', 'Cross']],
  ['What is the lowest rank the Adventurer’s Guild grants?', ['D', 'C', 'F']],
  ['What is the dwarven expedition ship in the harbour called?', ['The Iron Kettle', 'The Brightwater', 'The Gull']],
  ['Where do travellers rest halfway along the King’s Road?', ['The Wayfarer’s Rest', 'The Salty Anchor', 'The Drowned Lantern']],
];
export const QUIZ_LEN = 5;
export const QUIZ_PASS = 4;

export const ACADEMY_QUESTS: QuestDef[] = [
  {
    id: 'academy-aspirant', title: 'The Aspirant’s Road', giver: 'marrow', region: 'portAurelle', main: true, requires: ['academy-oath'],
    summary: 'A Squire becomes a Knight-Aspirant by climbing the sparring ladder and passing Archivist Mell’s examination.',
    offer: 'A Squire carries the Academy’s name. A Knight-Aspirant carries its steel. Climb four rungs of Ser Hadrik’s sparring ladder, and satisfy Archivist Mell that you know the world you are sworn to. Then come back to me.',
    acceptLabel: 'I will.',
    stages: [
      { note: 'Climb the sparring ladder and pass Archivist Mell’s examination.', hook: 'academy:aspirant', objectives: [
        { type: 'signal', id: 'ladder-4', text: `Climb ${ASPIRANT_RUNGS} rungs of the sparring ladder (Ser Hadrik; one bout a day)` },
        { type: 'signal', id: 'mell-quiz', text: 'Pass Archivist Mell’s lore examination' },
      ] },
      { note: 'Report to Ser Elian Marrow.', objectives: [{ type: 'talk', npc: 'marrow', text: 'Report to Ser Elian Marrow', reply: 'The ladder is climbed, and Mell is satisfied.', say: 'So I hear. Kneel. By the authority of the Knight’s Academy of Port Aurelle, rise, Knight-Aspirant. The accolade itself waits on mastery of your school. That road starts now.' }] },
    ],
    done: 'You are a Knight-Aspirant of the Knight’s Academy. The Knight’s accolade waits on your school mastery (next chapter).',
    rewards: { gold: 120, xp: 500, items: [['greaterHealthPotion', 2]] },
  },
];

interface Deps {
  quests: QuestLog;
  player: Player;
  time: { day: number; hour: number; skipTo(h: number): void };
  flags: Record<string, unknown>;
  lookOf: (id: string) => Look | undefined;
  close: () => void;
  toast: (m: string) => void;
  save: () => void;
  bout: (spec: { name: string; look: Look; hp: number; damage: number; pace: number }, onWin: () => void) => void;
  dormitory: THREE.Vector3;
  rnd?: () => number;
}

type Show = (t: string, opts: DialogueOption[]) => void;

export function setupAcademy(d: Deps) {
  const { quests, flags } = d;
  const rnd = d.rnd ?? Math.random;
  const rank = () => academyRank(quests, flags);
  const ladder = () => Number(flags.ladder ?? 0);
  const sync = () => {
    if (ladder() >= ASPIRANT_RUNGS) quests.signal('ladder-4');
    if (flags.mellQuiz) quests.signal('mell-quiz');
  };
  quests.add(...ACADEMY_QUESTS);
  quests.hooks.set('academy:aspirant', sync);
  quests.hooks.set('academy-aspirant:done', () => (flags.academyRank = 'aspirant'));

  /** Today's ladder bout, or why not. */
  const nextBout = () => {
    if (rank() === 'none') return { ok: false, why: 'The ladder is for enrolled cadets.' };
    const n = ladder();
    if (n >= LADDER.length) return { ok: false, why: 'You stand at the top of the ladder. Nobody left to climb past but yourself.' };
    if (Number(flags.ladderDay ?? -1) === d.time.day) return { ok: false, why: 'One bout a day. Rest, and come back tomorrow.' };
    return { ok: true, rung: LADDER[n], n };
  };
  const fight = () => {
    const b = nextBout();
    if (!b.ok || !b.rung) return d.toast(b.why!);
    const r = b.rung;
    const look = r.look ?? d.lookOf(r.id!);
    if (!look) return;
    flags.ladderDay = d.time.day;
    d.close();
    d.bout({ name: r.name, look, hp: r.hp, damage: r.damage, pace: r.pace }, () => {
      flags.ladder = b.n! + 1;
      d.player.prog.addGold(r.purse);
      d.toast(`Rung ${b.n! + 1} of ${LADDER.length}: ${r.name} beaten. +${r.purse}g from the purse.`);
      sync();
      d.save();
    });
  };

  const ladderOptions = (show: Show, back: () => void): DialogueOption[] => {
    if (rank() === 'none') return [];
    const n = ladder();
    const b = nextBout();
    const standing = n >= LADDER.length ? 'You have climbed the whole ladder.' : `You stand on rung ${n} of ${LADDER.length}. Next: ${LADDER[n].name}.`;
    return [{
      label: 'The sparring ladder',
      run: () => show(`${standing} ${b.ok ? 'Want your bout?' : b.why}`, [
        ...(b.ok ? [{ label: `Fight ${b.rung!.name}`, run: fight }] : []),
        { label: 'Back.', run: back },
      ]),
    }];
  };

  const quizOptions = (show: Show, back: () => void): DialogueOption[] => {
    if (rank() === 'none') return [];
    if (flags.mellQuiz) return [{ label: 'About the examination', run: () => show('You passed, and I remember it. I never forget a good student. Or a bad one.', [{ label: 'Back.', run: back }]) }];
    return [{
      label: 'Sit the lore examination',
      run: () => {
        if (Number(flags.quizDay ?? -1) === d.time.day) return show('Once a day, Cadet. Read something and come back tomorrow.', [{ label: 'Back.', run: back }]);
        flags.quizDay = d.time.day;
        const pool = QUIZ.map((q) => ({ q, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, QUIZ_LEN).map((x) => x.q);
        let right = 0;
        const ask = (i: number) => {
          if (i >= pool.length) {
            const pass = right >= QUIZ_PASS;
            if (pass) {
              flags.mellQuiz = true;
              sync();
              d.save();
            }
            return show(pass
              ? `${right} of ${pool.length}. Adequate. No, better than adequate. I’ll put your name in the register.`
              : `${right} of ${pool.length}. You need ${QUIZ_PASS}. The library is open until ten. Come back tomorrow.`, [{ label: 'Thank you, Archivist.', run: back }]);
          }
          const [text, answers] = pool[i];
          const order = answers.map((a, k) => ({ a, k, s: rnd() })).sort((x, y) => x.s - y.s);
          show(`Question ${i + 1} of ${pool.length}. ${text}`, order.map((o) => ({
            label: o.a,
            run: () => {
              if (o.k === 0) right++;
              ask(i + 1);
            },
          })));
        };
        ask(0);
      },
    }];
  };

  const standingOptions = (show: Show, back: () => void): DialogueOption[] => {
    const r = rank();
    if (r === 'none') return [];
    const next = r === 'cadet' ? 'Swear the Squire’s Oath to become a Squire.'
      : r === 'squire' ? `A Squire rises to Knight-Aspirant by climbing ${ASPIRANT_RUNGS} rungs of the ladder (you have ${Math.min(ladder(), ASPIRANT_RUNGS)}) and passing Archivist Mell’s examination (${flags.mellQuiz ? 'passed' : 'not yet'}).`
        : 'The Knight’s accolade waits on mastery of your school. We will speak of it when you are ready.';
    return [{ label: 'Ask about my standing', run: () => show(`You are a ${RANK_NAMES[r]} of this Academy. ${next}`, [{ label: 'Back.', run: back }]) }];
  };

  const dorm: Interactable = {
    pos: d.dormitory, radius: 2.4,
    label: () => (rank() === 'none' ? 'Academy dormitory (cadets only)' : 'Sleep in the Academy dormitory'),
    enabled: () => rank() !== 'none',
    action: () => {
      d.time.skipTo(6);
      const p = d.player;
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
      d.save();
      d.toast('A narrow cot, a scratchy blanket, a bugle at six. You wake rested.');
    },
  };

  return {
    rank,
    fight,
    nextBout,
    interactables: [dorm],
    services: [
      ['hadrik', ladderOptions],
      ['mell', quizOptions],
      ['marrow', standingOptions],
    ] as [string, (show: Show, back: () => void) => DialogueOption[]][],
  };
}
