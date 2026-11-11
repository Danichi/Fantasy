// Field abilities (docs/design/classes.md): something each class lets you do
// outside a fight. Wired in main.ts (Player.fieldAirJumps, fieldGlide, the
// Lightbinder's lantern).

import { ROSTER_FIELD } from './roster';

export interface FieldAbility {
  name: string;
  text: string;
}

export const FIELD_ABILITIES: Record<string, FieldAbility> = {
  gale: { name: 'Wind Step', text: 'Jump again in mid-air, off the wind itself.' },
  windcaller: { name: 'Glide', text: 'Hold Jump while falling to glide down slowly, off cliffs and roofs.' },
  lightbinder: { name: 'Lantern Soul', text: 'A soft light follows you in the dark: at night, underground and in the Dark.' },
};

// The roster's classes bring their own (paths/roster/engine.ts runs them).
Object.assign(FIELD_ABILITIES, ROSTER_FIELD);
