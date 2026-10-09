import type { ItemDef } from '../itemDefs';

// The weapon families as item kinds (docs/design/arms-and-crafting.md §3).
// Pure lookups with no imports beyond types, so the inventory, equipment and
// shop code can ask "is this a weapon, does it take both hands?" without
// pulling in the movesets.

export type FamilyId = 'sword' | 'spear' | 'greatsword' | 'axe' | 'mace' | 'dagger' | 'bow' | 'crossbow' | 'staff';
export const FAMILY_IDS: FamilyId[] = ['sword', 'spear', 'greatsword', 'axe', 'mace', 'dagger', 'bow', 'crossbow', 'staff'];
/** The new families (the sword is the original). */
export const NEW_FAMILIES: FamilyId[] = ['spear', 'greatsword', 'axe', 'mace', 'dagger', 'bow', 'crossbow', 'staff'];

/** Hands a family takes when the item doesn't say (axes and maces come in both). */
const DEFAULT_HANDS: Record<FamilyId, 1 | 2> = {
  sword: 1, spear: 2, greatsword: 2, axe: 1, mace: 1, dagger: 1, bow: 2, crossbow: 2, staff: 2,
};

export function isWeaponKind(kind: string): kind is FamilyId {
  return (FAMILY_IDS as string[]).includes(kind);
}

export function isRangedKind(kind: string) {
  return kind === 'bow' || kind === 'crossbow';
}

/** Takes both hands (the off hand stays empty: decision 1 of the plan). */
export function twoHanded(def: ItemDef | undefined) {
  if (!def || !isWeaponKind(def.kind)) return false;
  return (def.hands ?? DEFAULT_HANDS[def.kind]) === 2;
}

/** Can go in the main hand. */
export function mainHandKind(kind: string) {
  return isWeaponKind(kind);
}

/** Can go in the off hand as a second weapon (dual wielding). */
export function offHandWeapon(def: ItemDef) {
  return isWeaponKind(def.kind) && !twoHanded(def) && def.kind !== 'bow' && def.kind !== 'crossbow' && def.kind !== 'staff';
}
