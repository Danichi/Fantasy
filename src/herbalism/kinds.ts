import type { Target } from '../combat/targets';

// What a foe is, for banes and resistances, read from its `kind` (the same
// string enemyDied reports). Patterns rather than lists, so creatures added
// later (frost wraiths, spiders, drakes) are recognised by name.

const UNDEAD = /zombie|skeleton|abomination|wraith|ghost|ghoul|lich|revenant|undead|draugr|bone|spectre|specter|barrow|crypt|armour|mummy|shade/i;
const BEAST = /^(green|blue|dire)$|wolf|stag|boar|bear|rat|spider|beast|eel|shark|crab|ray|jelly|serpent|sawtooth|lion|scorpion|hound|bat|toad|lizard|cat|worm|turtle/i;
const FIRE = /magma|fire|ember|flame|drake|dragon|salamander|imp|cinder|lava|ash|sun/i;
const FROST = /frost|ice|snow|yeti|winter|rime|glacier|cold|wraith/i;
const POISON = /jelly|eel|spider|venom|rat|zombie|abomination|plague|bog|toad|serpent|scorpion|sandRay|ray|slime|ooze|wasp|snake/i;

export const isUndead = (kind: string) => UNDEAD.test(kind);
export const isBeast = (kind: string) => BEAST.test(kind) && !UNDEAD.test(kind);
/** Great beasts and bosses: no executions, and they shrug off seizures. */
export const isBoss = (t: Target) => t.maxHp >= 600;

export type Element = 'fire' | 'frost' | 'poison' | null;
export function elementOf(kind: string): Element {
  if (FIRE.test(kind)) return 'fire';
  if (FROST.test(kind)) return 'frost';
  if (POISON.test(kind)) return 'poison';
  return null;
}
