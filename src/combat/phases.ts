import type { ActionDef } from './actions';

export type AttackPhase = 'windup' | 'commit' | 'active' | 'recovery';
export const PHASE_LABEL: Record<AttackPhase, string> = { windup: 'Prepare', commit: 'Committed', active: 'Strike', recovery: 'Open' };

/** The same clock drives the body, collision and practice readouts. */
export function actionPhase(def: ActionDef, t: number, charging = false): AttackPhase {
  const start = def.hit?.from ?? def.event?.at ?? def.dur * 0.5;
  const end = def.hit?.to ?? start + 0.08;
  if (charging || t < Math.max(0, start - 0.12)) return 'windup';
  if (t < start) return 'commit';
  return t <= end ? 'active' : 'recovery';
}

/** Small steps around light attacks; planted strikes; freedom returns through recovery. */
export function actionMobility(def: ActionDef, t: number): number {
  if (!def.hit || def.roll || def.air || def.id === 'finisher') return 0;
  const light = /^(slash|offslash|thrust|sideSweep|retreatCut)/.test(def.id);
  if (t < def.hit.from) return light ? 0.4 : 0.1;
  if (t <= def.hit.to) return light ? 0.08 : 0;
  const u = Math.min(1, (t - def.hit.to) / Math.max(0.08, def.cancel - def.hit.to));
  return (light ? 0.35 : 0.15) + u * (light ? 0.5 : 0.4);
}
