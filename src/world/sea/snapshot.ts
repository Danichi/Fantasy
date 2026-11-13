/** Only encounter state, never render objects, callbacks, target IDs or shared data. */
export type PhaseState = Record<string, number | string | boolean>;
const immutable = new Set([
  'id',
  'kind',
  'danger',
  'maxHp',
  'radius',
  'halfHeight',
  'name',
  'captain',
  'tag',
  'bounty',
  'crewStart',
  'tetherable',
  'lockable',
]);
export function phaseState(object: object): PhaseState {
  const out: PhaseState = {};
  for (const [k, v] of Object.entries(object))
    if (!immutable.has(k) && ['number', 'string', 'boolean'].includes(typeof v) && !(typeof v === 'number' && !Number.isFinite(v)))
      out[k] = v;
  return out;
}
export function restorePhase(object: object, state: PhaseState) {
  const target = object as Record<string, unknown>;
  for (const [k, v] of Object.entries(state)) if (!immutable.has(k) && k in target && typeof target[k] === typeof v) target[k] = v;
}
