import type { NodeEffect } from './effects';

// Ascensions (docs/design/classes.md): at level 30 a combat or magic class
// chooses one of two Ascensions, a specialisation that reshapes it. Each has
// four nodes past the tree, opening at levels 30, 35, 40 and 45. Their effects
// are real: `m` goes into the combat modifiers, `x` keys are read by the skill
// runtime and the class mechanics (killHealPct, critStamina, lowHpDmg, cdr,
// resGain and the classes' own keys).

export interface AscensionNode extends NodeEffect {
  name: string;
}
export interface AscensionDef {
  name: string;
  flavour: string;
  nodes: [AscensionNode, AscensionNode, AscensionNode, AscensionNode];
}

/** The level each Ascension node opens at, and its cost in tree points. */
export const ASC_LEVEL = [30, 35, 40, 45];
export const ASC_COST = [3, 3, 4, 5];

const n = (name: string, text: string, m?: NodeEffect['m'], x?: NodeEffect['x']): AscensionNode => ({ name, text, m, x });

export const ASCENSIONS: Record<string, [AscensionDef, AscensionDef]> = {
  gale: [
    { name: 'Tempest', flavour: 'Faster than the eye. Faster than the blow.', nodes: [
      n('Storm Legs', '+10% movement and attack speed', { moveSpeed: 0.1, attackSpeed: 0.1 }),
      n('Gale Fed', 'Flow builds 40% faster', undefined, { resGain: 0.4 }),
      n('Eye of the Storm', 'Dodging costs 30% less stamina and your techniques recharge 15% faster', { dodgeCost: -0.3 }, { cdr: 0.15 }),
      n('Hurricane Body', '+20% damage and +15% attack speed, but you take 10% more damage', { melee: 0.2, attackSpeed: 0.15, dmgTaken: 0.1 }),
    ] },
    { name: 'Still Blade', flavour: 'One breath, one cut, and the fight is over.', nodes: [
      n('Patient Edge', '+8% critical chance', { crit: 0.08 }),
      n('Clean Kill', 'Critical hits restore 8 stamina', undefined, { critStamina: 8 }),
      n('Perfect Read', 'The parry window is 30% wider', { parryWindow: 0.3 }),
      n('Final Cut', '+30% damage while you are below 35% health, and kills heal 5% of your health', undefined, { lowHpDmg: 0.3, killHealPct: 0.05 }),
    ] },
  ],
  cross: [
    { name: 'Blade Storm', flavour: 'Never one blade at rest.', nodes: [
      n('Double Time', '+12% attack speed', { attackSpeed: 0.12 }),
      n('Tempo Heart', 'Tempo builds 40% faster', undefined, { resGain: 0.4 }),
      n('Whirling Edge', 'Your techniques recharge 20% faster', undefined, { cdr: 0.2 }),
      n('Thousand Edges', '+18% damage and every critical hit restores 6 stamina', { melee: 0.18 }, { critStamina: 6 }),
    ] },
    { name: 'Duellist', flavour: 'Two blades, one opponent, no witnesses.', nodes: [
      n('Measured', '+6% critical chance and +8% damage', { crit: 0.06, melee: 0.08 }),
      n('Cold Read', 'The parry window is 25% wider', { parryWindow: 0.25 }),
      n('Pressing', '+15% poise damage', { poise: 0.15 }),
      n('Last Word', 'Kills heal 6% of your health, and you deal 25% more below 35% health', undefined, { killHealPct: 0.06, lowHpDmg: 0.25 }),
    ] },
  ],
  boundary: [
    { name: 'Bulwark', flavour: 'The wall the kingdom leans on.', nodes: [
      n('Stone Skin', 'Take 10% less damage', { dmgTaken: -0.1 }),
      n('Long Guard', 'Blocking costs 30% less stamina', { blockCost: -0.3 }),
      n('Unshaken', '+60 max health', { hp: 60 }),
      n('The Wall', 'Take 15% less damage more, and kills heal 4% of your health', { dmgTaken: -0.15 }, { killHealPct: 0.04 }),
    ] },
    { name: 'Riposte Master', flavour: 'Everything you stop comes back harder.', nodes: [
      n('Read Them', 'The parry window is 25% wider', { parryWindow: 0.25 }),
      n('Counterweight', '+15% damage and +15% poise damage', { melee: 0.15, poise: 0.15 }),
      n('Ready Again', 'Your techniques recharge 20% faster', undefined, { cdr: 0.2 }),
      n('Return to Sender', 'Critical hits restore 10 stamina and Focus builds 40% faster', undefined, { critStamina: 10, resGain: 0.4 }),
    ] },
  ],
  warbreaker: [
    { name: 'Juggernaut', flavour: 'Nothing stops it. Nothing slows it.', nodes: [
      n('Iron Hide', '+60 max health', { hp: 60 }),
      n('Rage Engine', 'Rage builds 40% faster', undefined, { resGain: 0.4 }),
      n('Unbowed', 'Take 12% less damage', { dmgTaken: -0.12 }),
      n('Unstoppable Force', '+20% damage and poise damage, and kills heal 5% of your health', { melee: 0.2, poise: 0.2 }, { killHealPct: 0.05 }),
    ] },
    { name: 'Berserker', flavour: 'Closer to death, closer to glory.', nodes: [
      n('Blood Up', '+10% attack speed', { attackSpeed: 0.1 }),
      n('Death Wish', '+35% damage below 35% health', undefined, { lowHpDmg: 0.35 }),
      n('Feeding Frenzy', 'Kills heal 7% of your health', undefined, { killHealPct: 0.07 }),
      n('Red Tide', '+25% damage and techniques recharge 20% faster, but you take 15% more damage', { melee: 0.25, dmgTaken: 0.15 }, { cdr: 0.2 }),
    ] },
  ],
  dawnblade: [
    { name: 'Sunsworn', flavour: 'A blade that carries the morning.', nodes: [
      n('Bright Steel', '+12% damage', { melee: 0.12 }),
      n('Morning Speed', '+10% attack speed', { attackSpeed: 0.1 }),
      n('Dawn\'s Patience', 'Techniques recharge 20% faster', undefined, { cdr: 0.2 }),
      n('High Noon', '+20% damage and holy damage', { melee: 0.2 }, { holyDmg: 0.2 }),
    ] },
    { name: 'Lightguard', flavour: 'Where you stand, the dark does not.', nodes: [
      n('Warm Plate', 'Take 10% less damage', { dmgTaken: -0.1 }),
      n('Mending Light', '+25% healing', { heal: 0.25 }),
      n('Faith\'s Reach', '+40 max health and +20 max mana', { hp: 40, mana: 20 }),
      n('Last Light', 'Kills heal 6% of your health and you deal 25% more below 35% health', undefined, { killHealPct: 0.06, lowHpDmg: 0.25 }),
    ] },
  ],
  oathbreaker: [
    { name: 'Forsworn', flavour: 'The oath is broken. So is everything in front of you.', nodes: [
      n('Spite', '+12% damage', { melee: 0.12 }),
      n('Hate Is Fuel', '+30% damage below 35% health', undefined, { lowHpDmg: 0.3 }),
      n('No Rest', 'Techniques recharge 20% faster', undefined, { cdr: 0.2 }),
      n('Damned', '+25% damage, kills heal 5%, but you take 10% more damage', { melee: 0.25, dmgTaken: 0.1 }, { killHealPct: 0.05 }),
    ] },
    { name: 'Penitent', flavour: 'Every blow you take is a debt paid.', nodes: [
      n('Hair Shirt', 'Take 10% less damage', { dmgTaken: -0.1 }),
      n('Atonement', '+50 max health', { hp: 50 }),
      n('Scourge', '+15% poise damage', { poise: 0.15 }),
      n('Absolved', 'Kills heal 8% of your health', undefined, { killHealPct: 0.08 }),
    ] },
  ],
  pyromancer: [
    { name: 'Inferno', flavour: 'Fire, and more fire, and nothing left.', nodes: [
      n('White Heat', '+12% spell damage', { spell: 0.12 }),
      n('Fanned', '+20% area', { area: 0.2 }),
      n('Wildfire Mind', 'Your spells recharge 15% faster and burns deal 25% more', undefined, { cdr: 0.15, burnDmg: 0.25 }),
      n('Sunfall', '+25% spell damage, but you take 10% more damage', { spell: 0.25, dmgTaken: 0.1 }),
    ] },
    { name: 'Ember Saint', flavour: 'Fire that warms instead of burns.', nodes: [
      n('Hearth Soul', '+40 max health', { hp: 40 }),
      n('Kind Flame', '+25% healing', { heal: 0.25 }),
      n('Banked Coals', 'Spells cost 15% less mana', { manaCost: -0.15 }),
      n('Undying Ember', 'Kills heal 6% of your health and you deal 25% more below 35% health', undefined, { killHealPct: 0.06, lowHpDmg: 0.25 }),
    ] },
  ],
  windcaller: [
    { name: 'Stormbringer', flavour: 'The sky answers, and it is angry.', nodes: [
      n('Gale Force', '+12% spell damage', { spell: 0.12 }),
      n('Squall', '+15% cast speed', { castSpeed: 0.15 }),
      n('Pressure Front', 'Spells recharge 20% faster', undefined, { cdr: 0.2 }),
      n('Eye of Heaven', '+25% spell damage and wind damage', { spell: 0.25 }, { windDmg: 0.15 }),
    ] },
    { name: 'Skywalker', flavour: 'Never on the ground long enough to be hit.', nodes: [
      n('Light Feet', '+12% movement speed', { moveSpeed: 0.12 }),
      n('Updraft', 'Dodging costs 30% less stamina', { dodgeCost: -0.3 }),
      n('Thin Air', '+30 max mana and spells cost 10% less', { mana: 30, manaCost: -0.1 }),
      n('Cloud Body', 'Take 12% less damage and kills heal 4% of your health', { dmgTaken: -0.12 }, { killHealPct: 0.04 }),
    ] },
  ],
  lightbinder: [
    { name: 'Radiant', flavour: 'Light as a weapon. Light as judgment.', nodes: [
      n('Searing Light', '+12% spell damage', { spell: 0.12 }),
      n('Gathering Dawn', 'Radiance builds 40% faster', undefined, { radGain: 0.4 }),
      n('Swift Verdict', 'Spells recharge 15% faster', undefined, { cdr: 0.15 }),
      n('Solar Judgment', '+25% spell damage and holy damage', { spell: 0.25 }, { holyDmg: 0.2 }),
    ] },
    { name: 'Lifebinder', flavour: 'Nobody near you dies today.', nodes: [
      n('Open Hands', '+25% healing', { heal: 0.25 }),
      n('Deep Wells', '+40 max mana', { mana: 40 }),
      n('Steadfast Grace', 'Take 10% less damage', { dmgTaken: -0.1 }),
      n('Second Sunrise', '+25% healing more, and kills heal 5% of your health', { heal: 0.25 }, { killHealPct: 0.05 }),
    ] },
  ],
  cryomancer: [
    { name: 'Glacial', flavour: 'Cold that cracks stone.', nodes: [
      n('Deep Cold', '+12% spell damage', { spell: 0.12 }),
      n('Long Winter', 'Your effects last 25% longer', { duration: 0.25 }),
      n('Ice Mind', 'Spells recharge 15% faster', undefined, { cdr: 0.15 }),
      n('Absolute Zero', '+25% spell damage', { spell: 0.25 }),
    ] },
    { name: 'Frostward', flavour: 'Armoured in winter.', nodes: [
      n('Rime Coat', 'Take 10% less damage', { dmgTaken: -0.1 }),
      n('Frozen Heart', '+40 max health', { hp: 40 }),
      n('Clear Mind', 'Spells cost 15% less mana', { manaCost: -0.15 }),
      n('Permafrost', 'Take 12% less damage more and kills heal 4% of your health', { dmgTaken: -0.12 }, { killHealPct: 0.04 }),
    ] },
  ],
  shadowcaller: [
    { name: 'Reaper', flavour: 'The harvest never ends.', nodes: [
      n('Grave Hunger', '+12% spell damage', { spell: 0.12 }),
      n('Soul Toll', 'Kills heal 5% of your health', undefined, { killHealPct: 0.05 }),
      n('Black Patience', 'Spells recharge 15% faster', undefined, { cdr: 0.15 }),
      n('Death\'s Hand', '+25% spell damage and +30% below 35% health', { spell: 0.25 }, { lowHpDmg: 0.3 }),
    ] },
    { name: 'Hexmaster', flavour: 'Every curse, all at once.', nodes: [
      n('Long Curse', 'Your effects last 25% longer', { duration: 0.25 }),
      n('Wide Malice', '+20% area', { area: 0.2 }),
      n('Cheap Spite', 'Spells cost 15% less mana', { manaCost: -0.15 }),
      n('Doom Bringer', '+25% spell damage', { spell: 0.25 }),
    ] },
  ],
  voidwalker: [
    { name: 'Riftlord', flavour: 'The world is a door, and you hold the key.', nodes: [
      n('Null Edge', '+12% spell damage', { spell: 0.12 }),
      n('Collapse', '+20% area', { area: 0.2 }),
      n('Event Horizon', 'Spells recharge 20% faster', undefined, { cdr: 0.2 }),
      n('Star Eater', '+30% spell damage, but you take 10% more damage', { spell: 0.3, dmgTaken: 0.1 }),
    ] },
    { name: 'Phantom', flavour: 'Half here. Half nowhere.', nodes: [
      n('Unanchored', '+12% movement speed', { moveSpeed: 0.12 }),
      n('Slip Between', 'Dodging costs 30% less stamina', { dodgeCost: -0.3 }),
      n('Faded', 'Take 12% less damage', { dmgTaken: -0.12 }),
      n('Nowhere at All', 'Kills heal 5% of your health and techniques recharge 15% faster', undefined, { killHealPct: 0.05, cdr: 0.15 }),
    ] },
  ],
};
