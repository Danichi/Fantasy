import type { AttackKind } from './core';
import type { AttackPhase } from './phases';

/** A live description, never a separate visual countdown for managed attacks. */
export interface AttackRead {
  name: string;
  kind: AttackKind;
  phase: AttackPhase;
  left: number;
  total: number;
  range: number;
  arc: number;
  yaw: number;
  shape: 'cone' | 'circle' | 'line';
  managed: boolean;
  blow: number;
  blows: number;
}
export const ATTACK_CUE: Record<AttackKind, { symbol: string; answer: string; color: number }> = {
  normal: { symbol: '◇', answer: 'Block / parry', color: 0xdbeaff },
  heavy: { symbol: '◆', answer: 'Parry / dodge', color: 0xffcf6a },
  unblockable: { symbol: '!', answer: 'Dodge', color: 0xff6558 },
  grab: { symbol: '✋', answer: 'Evade grab', color: 0xebe969 },
};
