export type CombatStyleId = 'gale' | 'boundary' | 'cross';

export interface SkillNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string[];
  actionId: string;
  move: string;
}

export interface CombatStyle {
  id: CombatStyleId;
  name: string;
  short: string;
  trainer: string;
  color: string;
  mechanic: string;
  nodes: SkillNode[];
}

export const COMBAT_STYLES: Record<CombatStyleId, CombatStyle> = {
  gale: {
    id: 'gale',
    name: 'Gale',
    short: 'Speed, momentum, chaining attacks and constant movement.',
    trainer: 'Kaela Voss',
    color: '#69d7ff',
    mechanic: 'Build Momentum by landing attacks in rhythm. Higher Momentum increases attack speed and damage; hesitation, misses and taking hits bleed it away.',
    nodes: [
      { id: 'gale-step', name: 'Gale Step', desc: 'A fast advancing strike that preserves your Momentum.', cost: 1, actionId: 'galeStep', move: 'GALE STEP' },
      { id: 'gale-rush', name: 'Gale Rush', desc: 'A rapid follow-up that gains extra reach while Momentum is high.', cost: 1, requires: ['gale-step'], actionId: 'galeRush', move: 'GALE RUSH' },
      { id: 'gale-crosswind', name: 'Crosswind', desc: 'A wide chained cut that rewards tight attack timing.', cost: 1, requires: ['gale-step'], actionId: 'galeCrosswind', move: 'CROSSWIND' },
      { id: 'gale-finish', name: 'Gale Finish', desc: 'A heavy finisher that cashes in your built Momentum.', cost: 1, requires: ['gale-rush'], actionId: 'galeFinish', move: 'GALE FINISH' },
      { id: 'gale-tempest', name: 'Tempest', desc: 'A long pressure chain that becomes stronger with high Momentum.', cost: 2, requires: ['gale-crosswind', 'gale-finish'], actionId: 'galeTempest', move: 'TEMPEST' },
    ],
  },
  boundary: {
    id: 'boundary',
    name: 'Boundary',
    short: 'Plant your ground, manage Focus and control the space around you.',
    trainer: 'Ser Corvin',
    color: '#ffcf72',
    mechanic: 'Hold your Boundary stance while still. Focus determines and pays for its radius. Attacks entering the zone can be intercepted without frame-perfect parries.',
    nodes: [
      { id: 'boundary-anchor', name: 'Anchor', desc: 'Increase the minimum Boundary radius and Focus efficiency.', cost: 1, actionId: 'boundaryAnchor', move: 'ANCHOR' },
      { id: 'boundary-pulse', name: 'Pulse', desc: 'Release a countershock after a successful Boundary interception.', cost: 1, requires: ['boundary-anchor'], actionId: 'boundaryPulse', move: 'BOUNDARY PULSE' },
      { id: 'boundary-wall', name: 'Inner Wall', desc: 'Increase interception radius and make ranged attacks easier to catch.', cost: 1, requires: ['boundary-anchor'], actionId: 'boundaryWall', move: 'INNER WALL' },
      { id: 'boundary-counter', name: 'Counter', desc: 'Your next melee strike after an interception deals increased stagger.', cost: 1, requires: ['boundary-pulse'], actionId: 'boundaryCounter', move: 'BOUNDARY COUNTER' },
      { id: 'boundary-domain', name: 'Domain', desc: 'Sustain a larger Boundary for longer and unlock the strongest counter window.', cost: 2, requires: ['boundary-wall', 'boundary-counter'], actionId: 'boundaryDomain', move: 'DOMAIN' },
    ],
  },
  cross: {
    id: 'cross',
    name: 'Cross',
    short: 'Deflect, create openings and punish from the opposite line.',
    trainer: 'Master Veyr',
    color: '#e89cff',
    mechanic: 'A successful parry creates a Cross Opening. Your next damaging strike exploits that opening for bonus damage and stagger; dual wielding makes the window stronger.',
    nodes: [
      { id: 'cross-parry', name: 'Cross Parry', desc: 'Expand the post-parry opening window and reward clean deflections.', cost: 1, actionId: 'crossParry', move: 'CROSS PARRY' },
      { id: 'cross-lunge', name: 'Cross Lunge', desc: 'Exploit an opening with a fast counterattack.', cost: 1, requires: ['cross-parry'], actionId: 'crossLunge', move: 'CROSS LUNGE' },
      { id: 'cross-feint', name: 'Feint', desc: 'A quick attack that converts an opening into a longer punish window.', cost: 1, requires: ['cross-parry'], actionId: 'crossFeint', move: 'CROSS FEINT' },
      { id: 'cross-execution', name: 'Execution', desc: 'Cash in a Cross Opening for a devastating hit.', cost: 1, requires: ['cross-lunge'], actionId: 'crossExecution', move: 'EXECUTION' },
      { id: 'cross-master', name: 'Cross Master', desc: 'Greatly improve opening duration and the damage of opening strikes.', cost: 2, requires: ['cross-feint', 'cross-execution'], actionId: 'crossMaster', move: 'CROSS MASTER' },
    ],
  },
};

export const styleIds = Object.keys(COMBAT_STYLES) as CombatStyleId[];

export function styleName(id: string | null | undefined) {
  return id && COMBAT_STYLES[id as CombatStyleId] ? COMBAT_STYLES[id as CombatStyleId].name : 'Untrained';
}
