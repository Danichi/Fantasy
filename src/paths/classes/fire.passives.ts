import type { NodeEffect } from '../effects';

// Pyromancer passives. Heat (0-100) is the class resource: fire spells build
// it, every point adds +0.5% fire damage, above 80 it burns you and at 100 you
// overheat. The x-keys are read by the skill runtime (paths/skills.ts).

const gate = (name: string, hint: string): NodeEffect => ({ text: `Opens the way to ${name}. ${hint}` });

export const FIRE_PASSIVES: Record<string, NodeEffect> = {
  // Flame
  'pyromancer:Kindling': { text: '+5% fire damage', x: { fireDmg: 0.05 } },
  'pyromancer:Hot Hands': { text: '+6% cast speed', m: { castSpeed: 0.06 } },
  'pyromancer:Flashpoint': { text: 'A Fireball that hits a burning enemy builds 10 less Heat', x: { flashpoint: 10 } },
  'pyromancer:Searing': { text: 'Fireball deals 10% more damage', x: { fireballDmg: 0.1 } },
  'pyromancer:Seeking Embers': { text: 'Cinder Volley embers home in on enemies', x: { seeking: 1 } },
  'pyromancer:Scatter': { text: 'Cinder Volley fires in a wide fan and each ember bursts on impact', x: { scatter: 1 } },
  'pyromancer:Accelerant': { text: 'Fire hits deal 8% more damage to burning enemies', x: { accelerant: 0.08 } },
  'pyromancer:Pure Flame': { text: '+30% fire damage, but Heat never cools down on its own. Only spending it or overheating lowers it', x: { fireDmg: 0.3, pureFlame: 1 } },
  'pyromancer:Wide Burst': { text: 'Fireball and Falling Star blasts are 20% wider', x: { fireArea: 0.2 } },
  'pyromancer:Starfire': { text: 'Falling Star gives back a third of the Heat it spent', x: { starfire: 1 } },
  'pyromancer:Red Giant': { text: 'When you overheat, a star also falls on you, striking every enemy nearby (not you)', x: { redGiant: 1 } },
  'pyromancer:Gate of the Sunbreaker': gate('a hidden class', 'Someone, somewhere, studies what lies past the sun.'),
  // Ember
  'pyromancer:Smoulder': { text: 'Burns deal 15% more damage', x: { burnDmg: 0.15 } },
  'pyromancer:Lingering Heat': { text: 'Burns last 2 seconds longer', x: { burnTime: 2 } },
  'pyromancer:Char': { text: 'Burning enemies take 8% more damage from everything', x: { char: 0.08 } },
  'pyromancer:Fuel': { text: 'Each burn tick restores 1 mana', x: { fuel: 1 } },
  'pyromancer:Controlled Burn': { text: 'Wildfire no longer spreads, but burns deal 40% more damage while it lasts', x: { controlledBurn: 1 } },
  'pyromancer:Hungry Flame': { text: 'Wildfire spreads every second instead of every two', x: { hungryFlame: 1 } },
  'pyromancer:Stacking Heat': { text: 'Enemies can carry 2 more burn stacks', x: { burnStacks: 2 } },
  'pyromancer:Scorched Earth': { text: 'Burns deal 50% more damage, but you take 10% more damage', x: { burnDmg: 0.5 }, m: { dmgTaken: 0.1 } },
  'pyromancer:Smoke Veil': { text: '-5% damage taken', m: { dmgTaken: -0.05 } },
  'pyromancer:Inferno': { text: 'Burning enemies explode when they die, hitting everything within 3 m', x: { inferno: 1 } },
  'pyromancer:Everburn': { text: 'Burns last twice as long', x: { everburn: 1 } },
  'pyromancer:Gate of the Ashwalker': gate('a hidden class', 'They say someone walks the burned places and is never hurt.'),
  // Hearth
  'pyromancer:Warm Blood': { text: '+10 max health', m: { hp: 10 } },
  'pyromancer:Ash Skin': { text: '-4% damage taken', m: { dmgTaken: -0.04 } },
  'pyromancer:Ember Shield': { text: 'Take 15% less damage while Firebrand is lit', x: { emberShield: 1 } },
  'pyromancer:Burning Will': { text: 'Firebrand hits restore 3 stamina', x: { burningWill: 3 } },
  'pyromancer:Cauterize': { text: 'Vent heals you for a quarter of the Heat it releases', x: { cauterize: 1 } },
  'pyromancer:Backdraft': { text: 'Vent explodes a second time a moment later', x: { backdraft: 1 } },
  'pyromancer:Heat Haze': { text: 'Heat cools 30% faster', x: { heatHaze: 0.3 } },
  'pyromancer:Blood of Fire': { text: 'Overheating no longer hurts you, but your max health is 20% lower', x: { bloodOfFire: 1 }, m: { hpMult: -0.2 } },
  'pyromancer:Hearthfire': { text: 'Heal 1 health a second while above 50 Heat', x: { hearthfire: 1 } },
  'pyromancer:Phoenix Down': { text: 'Once every 5 minutes, a killing blow leaves you at 30% health instead, and you overheat on the spot', x: { phoenixDown: 1 } },
  'pyromancer:Kindred Flame': { text: 'Vent restores 20 stamina', x: { kindred: 20 } },
  'pyromancer:Gate of the Phoenix': gate('a hidden class', 'An old story tells of a fire that would not stay dead.'),
};
