// Art style look test (?look=storybook | cel | facet): the same game drawn
// three ways, from global switches only, so the candidates can be compared
// side by side before the art style is redesigned. Without the parameter the
// game draws exactly as before (look 0).
//
//   storybook  the current direction pushed further: softer light, textures
//              flattened to broad colour, and a painterly brush filter.
//   cel        painted cel: a three-step light ramp, coloured ink outlines,
//              flat textures, a stronger rim.
//   facet      faceted low-poly diorama: flat-shaded facets, plain light,
//              strong contact shadows, a tilt-shift blur, a brighter palette.

export type LookName = 'default' | 'storybook' | 'cel' | 'facet';

const NAMES: LookName[] = ['default', 'storybook', 'cel', 'facet'];

function read(): number {
  if (typeof location === 'undefined') return 0;
  const q = new URLSearchParams(location.search).get('look');
  const i = NAMES.indexOf((q ?? 'default') as LookName);
  return i < 0 ? 0 : i;
}

/** 0 default, 1 storybook, 2 cel, 3 facet (a shader uniform). */
export const LOOK = { value: read() };
export const lookName = () => NAMES[LOOK.value];

/** Per-look settings for the shared material style and the final pass. */
export const LOOK_STYLE = [
  { softness: 0.55, rim: 0.22, ao: 0.85, bloom: 0.28 },
  { softness: 0.85, rim: 0.18, ao: 0.7, bloom: 0.34 },
  { softness: 0.95, rim: 0.4, ao: 0.45, bloom: 0.22 },
  { softness: 1.0, rim: 0.08, ao: 1.25, bloom: 0.18 },
][LOOK.value];
