export const TECHNIQUE_SLOTS = ['light', 'heavy', 'dodge', 'guard'] as const;
export type TechniqueSlot = (typeof TECHNIQUE_SLOTS)[number];
export interface TechniqueLoadout {
  discipline: string;
  bindings: Record<string, Partial<Record<TechniqueSlot, string>>>;
  shortcuts: Record<string, string>;
  last: string | null;
}
export const emptyTechniques = (): TechniqueLoadout => ({ discipline: '', bindings: {}, shortcuts: {}, last: null });
/** Optional save extension: stable skill/item identifiers never depend on inventory UIDs. */
export function readTechniques(value: unknown): TechniqueLoadout {
  const out = emptyTechniques();
  if (!value || typeof value !== 'object') return out;
  const v = value as Partial<TechniqueLoadout>;
  const ref = (s: unknown): s is string => typeof s === 'string' && s.length < 180 && /^(skill|spell):/.test(s);
  if (typeof v.discipline === 'string') out.discipline = v.discipline.slice(0, 100);
  if (ref(v.last)) out.last = v.last;
  for (const [d, slots] of Object.entries(v.bindings ?? {})) {
    if (!slots || typeof slots !== 'object') continue;
    out.bindings[d] = {};
    for (const slot of TECHNIQUE_SLOTS) if (ref(slots[slot])) out.bindings[d][slot] = slots[slot];
  }
  for (const [code, r] of Object.entries(v.shortcuts ?? {}))
    if (/^(Key[A-Z]|Digit[0-9]|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Comma|Period|Slash|Minus|Equal)$/.test(code) && ref(r)) out.shortcuts[code] = r;
  return out;
}
