import type { DialogueOption } from '../ui/dialogue';
import type { NpcSpec } from '../npc/npc';
import { DISC, DISCIPLINES, type DisciplineDef } from './data';
import type { Paths } from './paths';

/**
 * Lessons (story/lessons.ts): set by main. Being taught plays the mentor's
 * lesson, which does the teaching; `wait` holds it until the conversation
 * that led to it has closed (a trial's turn-in). False: no lesson ran.
 */
export const lessonHook: { start?: (d: DisciplineDef, wait?: boolean) => boolean; has?: (id: string) => boolean } = {};

/**
 * What mentors have told you (saved world flags, set by main). A mentor who
 * teaches more than one class offers only the first; the others come up when
 * you ask whether there is anything else (`mentorAsked:<npc>`).
 */
export const mentorMemory: { flags: Record<string, unknown> } = { flags: {} };

// What a mentor can do for you, as extra dialogue replies: teach their
// disciplines, make one of their combat classes your active one, or undo
// your training (respec, 75% of the XP back). Classes with a trial quest are
// only taught once the trial is done (the quest's completion teaches them).

/** The quest log, as far as trials need it. */
export interface Trials {
  status(id: string): 'active' | 'done' | 'available' | 'locked';
  accept(id: string): void;
  offer(id: string): string;
  note(id: string): string;
}

export function mentorOptions(paths: Paths, s: Pick<NpcSpec, 'id'>, say: (text: string) => void, notify: (msg: string) => void, trials?: Trials): DialogueOption[] {
  const out: DialogueOption[] = [];
  // Hidden classes only come up once their way is open (a gateway, your people's blood).
  const mine = DISCIPLINES.filter((d) => d.mentorNpc === s.id && (!d.secret || paths.learned(d.id) || paths.canTeach(d.id)));
  // The one they offer up front: the first you haven't learned that needs nothing
  // else first (or whose groundwork you have). The rest wait until you ask.
  const unlearned = mine.filter((d) => !paths.learned(d.id));
  const first = unlearned.find((d) => !d.requires) ?? unlearned.find((d) => paths.canTeach(d.id));
  const asked = !!mentorMemory.flags['mentorAsked:' + s.id];
  const held = unlearned.filter((d) => d !== first && !asked);
  for (const d of mine) {
    if (!paths.learned(d.id) && held.includes(d)) continue;
    if (!paths.learned(d.id)) {
      out.push({
        label: `Teach me ${d.name}.`,
        run: () => {
          if (d.trial && trials && trials.status(d.trial) !== 'done') {
            if (trials.status(d.trial) === 'active') {
              say(`Not until you have finished my trial. ${trials.note(d.trial)}`);
              return;
            }
            trials.accept(d.trial);
            notify(`Trial accepted · ${d.name}`);
            say(trials.offer(d.trial));
            return;
          }
          if (!paths.canTeach(d.id)) {
            say(`Not yet. ${paths.teachWhyNot(d.id) ?? 'You are not ready.'}. Come back when you are.`);
            return;
          }
          // The lesson teaches it, one step at a time (the tree opens at the end).
          if (lessonHook.start?.(d)) return;
          paths.teach(d.id);
          notify(`Learned ${d.name} · open Skills (K) to invest XP`);
          say(`${d.flavour} That is the first lesson. The rest you pay for in sweat, and in the XP you bring me.`);
        },
      });
      continue;
    }
    if (lessonHook.has?.(d.id)) out.push({ label: `Go over the first lesson of ${d.name} again.`, run: () => void lessonHook.start?.(d) });
    if (d.fam === 'combat' && paths.active !== d.id) {
      out.push({
        label: `Make ${d.name} my fighting class.`,
        run: () => {
          const prev = DISC[paths.active]?.name;
          paths.setActive(d.id);
          notify(`${d.name} is now your active combat class`);
          say(prev ? `Then leave ${prev} at the door. Only one way of fighting lives in your hands at a time.` : 'Good. Then this is how you fight now.');
        },
      });
    }
    if (paths.level(d.id) > 1) {
      const back = paths.respecRefund(d.id);
      out.push({
        label: `Undo my training in ${d.name}.`,
        run: () =>
          say(`I can strip it back to the first lesson. Your ${d.name} returns to level 1, every technique forgotten, and you keep ${back.toLocaleString()} of the XP. A quarter is lost. Mastery stays with you. Say the word.`),
      });
      out.push({
        label: `Do it: reset ${d.name} (+${back.toLocaleString()} XP).`,
        run: () => {
          const got = paths.respec(d.id);
          notify(`${d.name} reset · ${got.toLocaleString()} XP returned`);
          say('Done. I have seen stranger choices. Spend it better this time.');
        },
      });
    }
  }
  if (held.length) {
    out.push({
      label: 'Is there anything else you could teach me?',
      run: () => {
        mentorMemory.flags['mentorAsked:' + s.id] = 1;
        say(askReply(paths, held, !!first && !paths.learned(first.id)));
      },
    });
  }
  return out;
}

/** A mentor owning up to the other classes they teach, in plain words. */
function askReply(paths: Paths, held: DisciplineDef[], firstPending: boolean) {
  const names = held.map((d) => d.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const notYet = held.filter((d) => !paths.canTeach(d.id) && (d.requires || d.also));
  const lead = firstPending ? 'I do. But one thing at a time.' : 'I do, as it happens.';
  let text = `${lead} I also teach ${list}. ${held.map((d) => `${d.name}: ${d.how.charAt(0).toLowerCase()}${d.how.slice(1)}`).join(' ')}`;
  if (notYet.length) {
    text += ' ' + notYet.map((d) => `For ${d.name}: ${(paths.teachWhyNot(d.id) ?? '').replace(/^Needs /, 'you need ')} first.`).join(' ');
  }
  return text;
}
