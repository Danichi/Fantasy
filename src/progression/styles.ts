export type CombatStyleId = 'swordsman' | 'bulwark';

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
  nodes: SkillNode[];
}

export const COMBAT_STYLES: Record<CombatStyleId, CombatStyle> = {
  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    short: 'Fast melee pressure, flowing chains and aggressive finishers.',
    trainer: 'Kaela Voss',
    color: '#d6a85d',
    nodes: [
      { id: 'lunging-cut', name: 'Lunging Cut', desc: 'A fast advancing slash that closes distance.', cost: 1, actionId: 'swordsmanLunge', move: 'LUNGE' },
      { id: 'rising-fang', name: 'Rising Fang', desc: 'A rising cut with heavy poise damage.', cost: 1, requires: ['lunging-cut'], actionId: 'swordsmanRising', move: 'RISING FANG' },
      { id: 'crosscut', name: 'Crosscut', desc: 'A wide cross-body strike with strong reach.', cost: 1, requires: ['lunging-cut'], actionId: 'swordsmanCrosscut', move: 'CROSSCUT' },
      { id: 'executioner', name: 'Executioner', desc: 'A slow, devastating finishing blow.', cost: 1, requires: ['rising-fang'], actionId: 'swordsmanExecutioner', move: 'EXECUTIONER' },
      { id: 'blade-tempest', name: 'Blade Tempest', desc: 'A long advancing flurry that keeps pressure on a target.', cost: 2, requires: ['crosscut', 'executioner'], actionId: 'swordsmanTempest', move: 'BLADE TEMPEST' },
    ],
  },
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    short: 'Deliberate martial defence built around impact, control and counter-attacks.',
    trainer: 'Ser Corvin',
    color: '#d8dce5',
    nodes: [
      { id: 'breaker', name: 'Breaker', desc: 'A crushing opener built to stagger guarded foes.', cost: 1, actionId: 'bulwarkBreaker', move: 'BREAKER' },
      { id: 'iron-charge', name: 'Iron Charge', desc: 'Drive forward through a guarded enemy with a heavy blow.', cost: 1, requires: ['breaker'], actionId: 'bulwarkCharge', move: 'IRON CHARGE' },
      { id: 'counterblow', name: 'Counterblow', desc: 'A measured counterattack with exceptional poise damage.', cost: 1, requires: ['breaker'], actionId: 'bulwarkCounter', move: 'COUNTERBLOW' },
      { id: 'bastion-crush', name: 'Bastion Crush', desc: 'A brutal overhead strike that trades speed for force.', cost: 1, requires: ['counterblow'], actionId: 'bulwarkCrush', move: 'BASTION CRUSH' },
      { id: 'unyielding-advance', name: 'Unyielding Advance', desc: 'A huge advancing strike with the strongest stagger of the style.', cost: 2, requires: ['iron-charge', 'bastion-crush'], actionId: 'bulwarkAdvance', move: 'UNYIELDING ADVANCE' },
    ],
  },
};

export const styleIds = Object.keys(COMBAT_STYLES) as CombatStyleId[];

export function styleName(id: string | null | undefined) {
  return id && COMBAT_STYLES[id as CombatStyleId] ? COMBAT_STYLES[id as CombatStyleId].name : 'Untrained';
}
