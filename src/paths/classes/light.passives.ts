import type { NodeEffect } from '../effects';

// Lightbinder passives. Radiance (0-100) is the class resource: it builds
// whenever your light touches something (a heal lands, a branded enemy is hit,
// a ward stops a shot) and slowly in daylight. Empowered spells spend 25 of it
// to work 50% better. The x-keys are read by the skill runtime (paths/skills.ts).

const gate = (hint: string): NodeEffect => ({ text: `Opens the way to a hidden class. ${hint}` });

export const LIGHT_PASSIVES: Record<string, NodeEffect> = {
  // Mercy
  'lightbinder:Gentle Hands': { text: '+6% healing', m: { heal: 0.06 } },
  'lightbinder:Steady Prayer': { text: 'Healing Light drains 25% less mana', x: { steadyPrayer: 0.25 } },
  'lightbinder:Afterglow': { text: 'Healing past full health becomes a shield, up to 20', x: { afterglow: 20 } },
  'lightbinder:Soft Light': { text: 'Mote of Light heals 50% more', x: { softLight: 0.5 } },
  'lightbinder:Spring': { text: 'Lightwell also heals you over time while you stand in it', x: { spring: 1 } },
  'lightbinder:Beacon': { text: 'Each Lightwell burst also gives 15 Radiance', x: { beaconWell: 15 } },
  'lightbinder:Warm Glow': { text: 'Gain Radiance 20% faster', x: { radGain: 0.2 } },
  'lightbinder:Vow of Mercy': { text: '+40% healing, but your light can no longer deal damage', m: { heal: 0.4 }, x: { vowMercy: 1 } },
  'lightbinder:Grace': { text: '+5% healing and -3% damage taken', m: { heal: 0.05, dmgTaken: -0.03 } },
  'lightbinder:Unfading': { text: "Afterglow's shield can hold twice as much", x: { unfading: 1 } },
  'lightbinder:Grace Under Fire': { text: 'Healing is doubled while you are below 30% health', x: { graceFire: 1 } },
  'lightbinder:Gate of the Lifewarden': gate('Somewhere a healer keeps a garden that never dies.'),
  // Judgment
  'lightbinder:Zeal': { text: '+5% holy damage', x: { holyDmg: 0.05 } },
  'lightbinder:Long Memory': { text: 'Brand lasts 3 seconds longer', x: { brandTime: 3 } },
  'lightbinder:Witness': { text: 'Each Verdict stack you lay on a branded enemy gives 3 Radiance', x: { witness: 3 } },
  'lightbinder:Righteous': { text: '+4% holy damage', x: { holyDmg: 0.04 } },
  'lightbinder:Swift Justice': { text: 'Sentence recharges 40% faster, but Verdict can only build to 3', x: { swiftJustice: 1 } },
  'lightbinder:Final Word': { text: 'Sentence at 5 Verdict is always a critical hit', x: { finalWord: 1 } },
  'lightbinder:Glare': { text: 'Branded enemies take 5% more damage from everything', x: { glare: 0.05 } },
  'lightbinder:Zealot': { text: '+30% holy damage, but you take 15% more damage', x: { holyDmg: 0.3 }, m: { dmgTaken: 0.15 } },
  'lightbinder:Bright Eyes': { text: 'Branding an enemy gives 10 Radiance', x: { brightEyes: 10 } },
  'lightbinder:Judgment Day': { text: "When a branded enemy dies, its Brand and Verdict pass to the nearest enemy", x: { judgmentDay: 1 } },
  'lightbinder:Unblinking': { text: 'Brand lasts until the enemy dies', x: { unblinking: 1 } },
  'lightbinder:Gate of the Inquisitor': gate('A judge with no court is said to walk the roads, looking for the guilty.'),
  // Binding
  'lightbinder:Warded': { text: '-4% damage taken', m: { dmgTaken: -0.04 } },
  'lightbinder:Firm Grip': { text: 'Tethers last 1 second longer', x: { tetherTime: 1 } },
  'lightbinder:Taut': { text: 'Tethered enemies take 10% more damage', x: { taut: 0.1 } },
  'lightbinder:Faithful': { text: '+8 max mana', m: { mana: 8 } },
  'lightbinder:Mirror Halo': { text: 'Shots Halo Ward stops fly back at whoever loosed them', x: { mirrorHalo: 1 } },
  'lightbinder:Wide Halo': { text: 'Halo Ward stops 4 shots instead of 2', x: { wideHalo: 1 } },
  'lightbinder:Steadfast': { text: 'Take 6% less damage while Halo Ward is up', x: { steadfast: 0.06 } },
  "lightbinder:Binder's Oath": { text: 'Tethers and chains last twice as long, but you move 15% slower while one holds', x: { bindersOath: 1 } },
  'lightbinder:Purity': { text: 'When Halo Ward stops a shot it also puts out your burns', x: { purity: 1 } },
  'lightbinder:Sanctuary Line': { text: 'Raising Halo Ward throws back every enemy within 2.5 m', x: { sanctuaryLine: 1 } },
  'lightbinder:Lantern Cage': { text: 'The first enemy to come near your Mote of Light is held in place for 2 seconds', x: { lanternCage: 1 } },
  'lightbinder:Gate of the Lightweaver': gate('Somewhere, someone weaves light the way others weave cloth.'),
};
