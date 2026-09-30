import type { DialogueOption } from '../ui/dialogue';
import type { NpcSpec } from '../npc/npc';
import { DISC, DISCIPLINES } from './data';
import type { Paths } from './paths';

// What a mentor can do for you, as extra dialogue replies: teach their
// disciplines, make one of their combat classes your active one, or undo
// your training (respec, 75% of the XP back).

export function mentorOptions(paths: Paths, s: NpcSpec, say: (text: string) => void, notify: (msg: string) => void): DialogueOption[] {
  const out: DialogueOption[] = [];
  for (const d of DISCIPLINES) {
    if (d.mentorNpc !== s.id || d.secret) continue;
    if (!paths.learned(d.id)) {
      out.push({
        label: `Teach me ${d.name}.`,
        run: () => {
          if (!paths.canTeach(d.id)) {
            const [req, lv] = d.requires!;
            say(`Not yet. Come back when your ${DISC[req].name} has reached level ${lv}.`);
            return;
          }
          paths.teach(d.id);
          notify(`Learned ${d.name} · open Skills (K) to invest XP`);
          say(`${d.flavour} That is the first lesson. The rest you pay for in sweat, and in the XP you bring me.`);
        },
      });
      continue;
    }
    if (d.fam === 'combat' && paths.active !== d.id) {
      out.push({
        label: `Make ${d.name} my fighting class.`,
        run: () => {
          const prev = DISC[paths.active].name;
          paths.setActive(d.id);
          notify(`${d.name} is now your active combat class`);
          say(`Then leave ${prev} at the door. Only one way of fighting lives in your hands at a time.`);
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
  return out;
}
