import type { DisciplineDef } from '../data';
import type { NodeEffect } from '../effects';
import type { AscensionDef } from '../ascensions';
import type { FieldAbility } from '../fieldAbilities';
import type { Spec } from '../classes/forge';
import { ascensions, discipline, passives } from './gen';
import type { ClassSpec } from './types';
import { FOUNDATION } from './foundation';
import { ADVANCED } from './advanced';
import { HYBRID } from './hybrid';
import { HIDDEN } from './hidden';
import { ORIGIN } from './origin';

// The class roster: every class the classes update adds, in one list, and
// everything the rest of the game reads from it.

export const ROSTER: ClassSpec[] = [...FOUNDATION, ...ADVANCED, ...HYBRID, ...HIDDEN, ...ORIGIN];
export const ROSTER_BY_ID: Record<string, ClassSpec> = Object.fromEntries(ROSTER.map((s) => [s.id, s]));

/** New disciplines (the hidden gateway classes already in data.ts are only overlaid, not repeated). */
export const ROSTER_DEFS: DisciplineDef[] = ROSTER.filter((s) => !s.overlay).map(discipline);
/** Their trees' passives, keyed "id:Node". */
export const ROSTER_PASSIVES: Record<string, NodeEffect> = Object.assign({}, ...ROSTER.filter((s) => !s.noEngine).map(passives));
/** Their techniques, as forge specs by discipline. */
export const ROSTER_SPECS: Record<string, Record<string, Spec>> = Object.fromEntries(ROSTER.filter((s) => !s.overlay).map((s) => [s.id, s.skills]));
export const ROSTER_ASC: Record<string, [AscensionDef, AscensionDef]> = Object.fromEntries(ROSTER.filter((s) => !s.noEngine).map((s) => [s.id, ascensions(s)]));
/** Classes already in data.ts that the roster gives a teacher, a mechanic and passives. */
export const ROSTER_OVERLAYS = ROSTER.filter((s) => s.overlay);
export const ROSTER_FIELD: Record<string, FieldAbility> = Object.fromEntries(ROSTER.filter((s) => s.field).map((s) => [s.id, { name: s.field!.name, text: s.field!.text }]));
/** Where hidden teachers wait, by class id. */
export const ROSTER_TEACHERS = ROSTER.filter((s) => s.teacher).map((s) => ({ id: s.id, ...s.teacher! }));
