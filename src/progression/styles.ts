export type CombatStyleId = 'swordsman' | 'mage' | 'bulwark';

export interface SkillNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string[];
  effect: string;
}

export interface CombatStyle {
  id: CombatStyleId;
  name: string;
  short: string;
  trainer: string;
  color: string;
  nodes: SkillNode[];
}

export const STYLE_SWAP_LEVEL = 12;

export const COMBAT_STYLES: Record<CombatStyleId, CombatStyle> = {
  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    short: 'Fast melee pressure, long combos, brutal finishers.',
    trainer: 'Kaela Voss',
    color: '#d6a85d',
    nodes: [
      { id: 'keen-edge', name: 'Keen Edge', desc: '+6% melee damage.', cost: 1, effect: '+6% melee damage' },
      { id: 'flowing-steel', name: 'Flowing Steel', desc: '+8% attack speed on weapon actions.', cost: 1, requires: ['keen-edge'], effect: '+8% attack speed' },
      { id: 'iron-will', name: 'Iron Will', desc: '+12 maximum stamina.', cost: 1, requires: ['keen-edge'], effect: '+12 max stamina' },
      { id: 'executioner', name: 'Executioner', desc: '+18% heavy-attack damage.', cost: 1, requires: ['flowing-steel'], effect: '+18% heavy damage' },
      { id: 'blade-master', name: 'Blade Master', desc: '+10% melee damage and +5% attack speed.', cost: 2, requires: ['iron-will', 'executioner'], effect: '+10% melee, +5% speed' },
    ],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    short: 'High mana, efficient casting, powerful elemental damage.',
    trainer: 'Magus Orren',
    color: '#78aef0',
    nodes: [
      { id: 'arcane-well', name: 'Arcane Well', desc: '+20 maximum mana.', cost: 1, effect: '+20 max mana' },
      { id: 'efficient-casting', name: 'Efficient Casting', desc: 'Spells cost 10% less mana.', cost: 1, requires: ['arcane-well'], effect: '-10% mana cost' },
      { id: 'arcane-focus', name: 'Arcane Focus', desc: '+15% spell damage.', cost: 1, requires: ['arcane-well'], effect: '+15% spell damage' },
      { id: 'quick-cast', name: 'Quick Cast', desc: '+10% action speed while casting.', cost: 1, requires: ['efficient-casting'], effect: '+10% cast speed' },
      { id: 'archmage', name: 'Archmage', desc: '+15% spell damage and +10 maximum mana.', cost: 2, requires: ['arcane-focus', 'quick-cast'], effect: '+15% spell damage, +10 max mana' },
    ],
  },
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    short: 'Shield defense, poise and survivability.',
    trainer: 'Ser Corvin',
    color: '#d8dce5',
    nodes: [
      { id: 'iron-guard', name: 'Iron Guard', desc: '+5 armour.', cost: 1, effect: '+5 armour' },
      { id: 'fortified', name: 'Fortified', desc: '+20 maximum health.', cost: 1, requires: ['iron-guard'], effect: '+20 max health' },
      { id: 'steadfast', name: 'Steadfast', desc: '+20% stamina regeneration.', cost: 1, requires: ['iron-guard'], effect: '+20% stamina regen' },
      { id: 'aegis', name: 'Aegis', desc: 'Block absorbs 8% more physical damage.', cost: 1, requires: ['fortified'], effect: '+8 block' },
      { id: 'last-stand', name: 'Last Stand', desc: 'Take 12% less damage while below 40% health.', cost: 2, requires: ['steadfast', 'aegis'], effect: '-12% low-health damage' },
    ],
  },
};

export const styleIds = Object.keys(COMBAT_STYLES) as CombatStyleId[];

export function styleName(id: string | null | undefined) {
  return id && COMBAT_STYLES[id as CombatStyleId] ? COMBAT_STYLES[id as CombatStyleId].name : 'Untrained';
}
