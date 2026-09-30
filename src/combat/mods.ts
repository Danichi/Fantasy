// Combat modifiers the skill runtime (paths/skills.ts) writes onto the player
// every step: tree passives plus whatever buffs are running. The player reads
// them wherever it computes damage, speed, costs and defence.

export interface CombatMods {
  /** melee damage multiplier */
  melee: number;
  /** extra multiplier on the basic light combo (slash1-3) */
  lightAttack: number;
  poise: number;
  spell: number;
  heal: number;
  /** incoming damage multiplier */
  dmgTaken: number;
  moveSpeed: number;
  attackSpeed: number;
  castSpeed: number;
  staminaCost: number;
  dodgeCost: number;
  parryWindow: number;
  blockCost: number;
  /** extra chance for a melee hit to crit (0..1) */
  crit: number;
  canBlock: boolean;
  /** flat bonuses to maxima */
  hp: number;
  stamina: number;
  mana: number;
  staminaRegen: number;
  manaRegen: number;
  manaCost: number;
  /** multiplies skill buff and status durations */
  duration: number;
  /** multiplies skill radii */
  area: number;
}

export function baseMods(): CombatMods {
  return {
    melee: 1, lightAttack: 1, poise: 1, spell: 1, heal: 1, dmgTaken: 1, moveSpeed: 1, attackSpeed: 1, castSpeed: 1,
    staminaCost: 1, dodgeCost: 1, parryWindow: 1, blockCost: 1, crit: 0, canBlock: true,
    hp: 0, stamina: 0, mana: 0, staminaRegen: 0, manaRegen: 0, manaCost: 1, duration: 1, area: 1,
  };
}
