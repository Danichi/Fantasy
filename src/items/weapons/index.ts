import type { ItemDef } from '../itemDefs';
import { isWeaponKind, type FamilyId } from './kinds';
import type { FamilyDef } from './kit';
import { SPEAR } from './spear';
import { GREATSWORD } from './greatsword';
import { AXE } from './axe';
import { MACE } from './mace';
import { DAGGER } from './dagger';
import { STAFF } from './staff';
import { BOW } from './bow';
import { CROSSBOW } from './crossbow';

// Every weapon family. The sword keeps the original moveset (combat/actions.ts)
// and only brings its school numbers, the baseline the others are told against.

export const SWORD: FamilyDef = {
  id: 'sword', name: 'Sword', hands: 1, reach: 1.8,
  feel: 'Balanced: the original combo, heavy, sprint and plunge.',
  moves: {},
  schools: {
    gale: { flow: 1, note: 'One Flow a hit.' },
    boundary: { zone: 2.5, arc: 0.3, intercept: 'block', note: 'A 2.5 m zone; blocks from the front.' },
    cross: { opening: 'riposte', mult: 1.3, note: 'After a parry or a dodge, a riposte strikes 30% harder.' },
  },
};

export const FAMILIES: Record<FamilyId, FamilyDef> = {
  sword: SWORD, spear: SPEAR, greatsword: GREATSWORD, axe: AXE, mace: MACE, dagger: DAGGER, bow: BOW, crossbow: CROSSBOW, staff: STAFF,
};

/** The family of a weapon item (null for shields, armour and the rest). */
export function familyOf(def: ItemDef | undefined): FamilyDef | null {
  return def && isWeaponKind(def.kind) ? FAMILIES[def.kind] : null;
}

export type { FamilyDef } from './kit';
