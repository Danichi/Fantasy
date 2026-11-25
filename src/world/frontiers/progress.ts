import { FRONTS, pressureKey } from './context';
import type { FieldDef } from './catalog';
export type FieldFlags = Record<string, boolean | number | string>;
export const fieldKey = (id: string, part: string) => `field:${id}:${part}`;
/** Progress is stored in the ordinary world save. Loading scenery never awards anything. */
export class FieldProgress {
  constructor(readonly flags: FieldFlags) {}
  seen(d: FieldDef) {
    return !!this.flags[fieldKey(d.id, 'seen')];
  }
  done(d: FieldDef) {
    return !!this.flags[fieldKey(d.id, 'done')];
  }
  step(d: FieldDef) {
    return Math.max(0, Math.min(3, Number(this.flags[fieldKey(d.id, 'step')]) || 0));
  }
  fighting(d: FieldDef) {
    return !!this.flags[fieldKey(d.id, 'combat')] && !this.done(d);
  }
  defeated(d: FieldDef) {
    return Number(this.flags[fieldKey(d.id, 'defeated')]) || 0;
  }
  enemyCount(d: FieldDef) {
    return d.kind === 'rift' ? 2 : 3;
  }
  clear(d: FieldDef) {
    return this.defeated(d) === (1 << this.enemyCount(d)) - 1;
  }
  discover(d: FieldDef) {
    if (this.seen(d)) return false;
    this.flags[fieldKey(d.id, 'seen')] = true;
    return true;
  }
  advance(d: FieldDef, index: number) {
    if (this.done(d) || this.step(d) !== index || index > 2 || index < 0) return false;
    this.flags[fieldKey(d.id, 'step')] = index + 1;
    return true;
  }
  begin(d: FieldDef) {
    if (this.done(d) || this.clear(d)) return false;
    this.flags[fieldKey(d.id, 'combat')] = true;
    return true;
  }
  defeat(d: FieldDef, index: number) {
    if (!this.fighting(d) || index < 0 || index >= this.enemyCount(d)) return false;
    this.flags[fieldKey(d.id, 'defeated')] = this.defeated(d) | (1 << index);
    return true;
  }
  finish(d: FieldDef, outcome: string) {
    if (this.done(d)) return false;
    const investigation = ['cache', 'vista', 'memory'].includes(d.kind);
    if (investigation && this.step(d) !== 3) return false;
    if ((d.kind === 'convoy' || d.kind === 'rift' || outcome === 'fought') && !this.clear(d)) return false;
    if (d.kind === 'rift' && this.step(d) !== 3) return false;
    this.flags[fieldKey(d.id, 'done')] = true;
    this.flags[fieldKey(d.id, 'outcome')] = outcome;
    this.flags[fieldKey(d.id, 'combat')] = false;
    if (!investigation && d.kind !== 'rift' && outcome !== 'paid') {
      const key = pressureKey(d.front);
      this.flags[key] = Math.min(3, (Number(this.flags[key]) || 0) + 1);
      if (d.kind === 'convoy' || d.kind === 'refugees') this.flags['field:pass:' + d.front] = true;
    }
    return true;
  }
  hint(d: FieldDef) {
    if (this.done(d))
      return (
        (
          {
            recorded: 'Discovery recorded',
            supplied: 'Travelers supplied',
            negotiated: 'Passage negotiated',
            paid: 'Passage paid',
            fought: 'Route secured',
            sealed: 'Breach sealed',
          } as Record<string, string>
        )[String(this.flags[fieldKey(d.id, 'outcome')])] ?? 'Resolved'
      );
    if (this.fighting(d))
      return this.clear(d)
        ? d.kind === 'rift'
          ? 'Return to the breach and seal it.'
          : 'Return to the people at the camp.'
        : `${this.enemyCount(d) - this.defeated(d).toString(2).replace(/0/g, '').length} hostile figures remain. You can withdraw and return.`;
    if (d.kind === 'rift') return `Bind the three ward stakes in order (${this.step(d)}/3). Each stake’s notches show its place.`;
    return d.clues[Math.min(2, this.step(d))];
  }
  context(d: FieldDef) {
    return FRONTS[d.front];
  }
}
