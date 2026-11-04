import { events } from '../core/events';
import { DISC } from '../paths/data';
import { MAX_LEVEL, type Paths } from '../paths/paths';
import { practiceNeed } from '../herbalism/alchemy';
import type { Recipe } from './recipes';

// Learning a trade by working at it (crafting depth): every thing made at a
// station is practice in its Calling. Practice raises the Calling's level the
// way gathering and brewing raise Herbalism, and it is mastery too: the work
// itself is what makes a Grandmaster. XP can still buy levels at a mentor;
// practice is the other road.

export class CraftPractice {
  /** practice toward each Calling's next level */
  xp: Record<string, number> = {};
  /** Herbalism keeps its own practice (herbalism.ts); crafts at the alchemy table go there */
  herbalism?: (n: number) => void;
  /** bonus practice (a Calling's own passives, and practiceAll from any) */
  bonus: (calling: string) => number = () => 0;

  constructor(private paths: Paths, private toast: (m: string) => void, private level: () => number, private setLevel: (L: number) => void) {}

  /** How much practice a thing made is worth: harder recipes, finer results. */
  static worth(r: Recipe, q: number | undefined, n: number) {
    const base = 8 + r.level * 4 + Math.max(0, (q ?? 1) - 1) * 6;
    // Batches (arrows, ingots) count once and a bit, not ten times.
    return Math.round(base * (n > 1 ? 1.25 : 1));
  }

  add(calling: string | undefined, n: number) {
    if (!calling || n <= 0) return;
    const P = this.paths;
    if (calling === 'herbalism') return void this.herbalism?.(n);
    if (!P.learned(calling)) return;
    n = Math.round(n * (1 + this.bonus(calling)));
    // Mastery grows with every piece of work (paths/mastery.ts reads it).
    P.mx[calling] = (P.mx[calling] ?? 0) + n;
    events.emit('masteryGained', { id: calling, n });
    this.xp[calling] = (this.xp[calling] ?? 0) + n;
    let rose = false;
    while (P.lv[calling] < MAX_LEVEL && this.xp[calling] >= practiceNeed(P.lv[calling])) {
      this.xp[calling] -= practiceNeed(P.lv[calling]);
      P.lv[calling]++;
      rose = true;
      const L = P.lv[calling];
      events.emit('disciplineLevel', { id: calling, level: L });
      this.toast(`${DISC[calling].name} rose to level ${L} through practice${L % 5 === 0 ? ' · bonus tree point' : ''}`);
    }
    if (P.lv[calling] >= MAX_LEVEL) this.xp[calling] = 0;
    if (rose) {
      // The character level follows the disciplines (as Paths.syncLevel does).
      const cl = P.charLevel;
      if (cl > this.level()) {
        this.setLevel(cl);
        events.emit('levelUp', { level: cl });
      }
      events.emit('pathsChanged', {});
      events.emit('progressChanged', {});
    }
  }

  /** How far into the next level, 0..1 (the Skills page and the craft page show it). */
  progress(calling: string) {
    const L = this.paths.level(calling);
    if (L <= 0 || L >= MAX_LEVEL) return 0;
    return Math.min(1, (this.xp[calling] ?? 0) / practiceNeed(L));
  }

  toJSON() {
    return { ...this.xp };
  }
  fromJSON(d?: Record<string, number>) {
    this.xp = { ...(d ?? {}) };
  }
}
