import type { NodeEffect } from '../effects';

// Warbreaker's passives (its techniques are in warbreaker.ts).

// m: straight into the combat modifiers; x: read by classes/combat.ts and the techniques.
export const WAR_PASSIVES: Record<string, NodeEffect> = {
  'warbreaker:War Cleave': { text: 'Strikes that keep the beat (left, right, left) build Rage, 7 a strike; every blow you take gives 5. Each point of Rage is 0.3% more damage (30% at full). Rage drains once you stop fighting' },
  // Ruin
  'warbreaker:Heavy Hands': { text: '+15% poise damage', m: { poise: 0.15 } },
  'warbreaker:Iron Grip': { text: 'Off-hand strikes deal 15% more damage', x: { ironGrip: 0.15 } },
  'warbreaker:Bone Breaker': { text: 'Hits on enemies below half health deal 25% more damage', x: { boneBreaker: 0.25 } },
  'warbreaker:Brute': { text: '+8% damage', m: { melee: 0.08 } },
  'warbreaker:Fault Line': { text: 'Earthbreaker\'s crack bursts a second time a moment later', x: { faultLine: 1 } },
  'warbreaker:Aftershock': { text: 'Earthbreaker also throws down everything within 4 m of you', x: { aftershock: 1 } },
  'warbreaker:Iron Back': { text: 'Take 10% less damage while you have 50 Rage or more', x: { ironBack: 1 } },
  'warbreaker:Reckless': { text: 'Rage builds twice as fast, but you take 15% more damage', m: { dmgTaken: 0.15 }, x: { reckless: 1 } },
  'warbreaker:Hammerfall': { text: 'Skullsplitter and Ruinous Blow crater the ground: everything within 3 m takes 40% of the blow', x: { hammerfall: 1 } },
  'warbreaker:Mountain Breaker': { text: '+15% damage to bosses', x: { mountainBreaker: 0.15 } },
  'warbreaker:Bone Crusher': { text: '+25% poise damage', m: { poise: 0.25 } },
  // Fury
  'warbreaker:Hot Blood': { text: 'Strikes in rhythm build 30% more Rage', x: { hotBlood: 0.3 } },
  'warbreaker:War Drum': { text: 'Every fourth strike in rhythm sends out a shockwave: 30% weapon damage to everything within 3 m', x: { warDrum: 1 } },
  'warbreaker:Fury Well': { text: 'Rage drains half as fast', x: { furyWell: 1 } },
  'warbreaker:Snarl': { text: 'Blood Howl makes enemies within 6 m flinch', x: { snarl: 1 } },
  'warbreaker:Berserk': { text: 'While Frenzy lasts, every hit heals you for 3% of your health', x: { berserk: 1 } },
  'warbreaker:Cold Rage': { text: 'Frenzy no longer makes you take more damage', x: { coldRage: 1 } },
  'warbreaker:Bloodlust': { text: 'Kills give 15 Rage and 10 stamina', x: { bloodlust: 1 } },
  'warbreaker:Red Mist': { text: 'At 90 Rage or more you deal 20% more damage and attack 15% faster, but you cannot block', x: { redMist: 1 } },
  'warbreaker:Pain Eater': { text: 'Blows you take give twice as much Rage', x: { painEater: 1 } },
  'warbreaker:Unstoppable': { text: 'Rampage deals 40% more damage', x: { unstoppable: 1 } },
  'warbreaker:Warpath': { text: '+5% movement speed for every 25 Rage', x: { warpath: 1 } },
  // Ironhide
  'warbreaker:Scarred': { text: '+20 max health', m: { hp: 20 } },
  'warbreaker:Thick Skin': { text: 'Take 5% less damage', m: { dmgTaken: -0.05 } },
  'warbreaker:Hard to Kill': { text: '+10% max health', m: { hpMult: 0.1 } },
  'warbreaker:Stubborn': { text: 'Blocking costs 20% less stamina', m: { blockCost: -0.2 } },
  'warbreaker:Defiant': { text: 'After Iron Roar you take 25% less damage for 6 seconds', x: { defiant: 1 } },
  'warbreaker:Taunting': { text: 'Iron Roar reaches 10 m', x: { taunting: 1 } },
  'warbreaker:Bulwark Body': { text: 'Take 8% less damage while you have 25 Rage or more', x: { bulwarkBody: 1 } },
  'warbreaker:Unbreakable': { text: 'Take 20% less damage, but stamina comes back 25% slower', m: { dmgTaken: -0.2, staminaRegen: -0.25 } },
  'warbreaker:Oxhide': { text: '+30 max health', m: { hp: 30 } },
  'warbreaker:Old Wounds': { text: '1% more damage for every 2% of your health that is missing', x: { oldWounds: 1 } },
  'warbreaker:Orc Blood': { text: 'Skullsplitter and Ruinous Blow heal you for 4% of your health', x: { orcBlood: 1 } },
};
