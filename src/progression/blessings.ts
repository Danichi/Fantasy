// Lasting gifts to your health, stamina and mana that aren't gear or levels:
// the Wardens' rank (the bestiary), the Lanternbearer's rank (Lost Lanterns).
// Each source sets its own numbers; the player adds the sum.

export type BlessStat = 'hp' | 'stamina' | 'mana';
const SOURCES = new Map<string, Partial<Record<BlessStat, number>>>();

/** Set what one source gives (replaces what it gave before). */
export function setBlessing(source: string, gives: Partial<Record<BlessStat, number>>) {
  SOURCES.set(source, gives);
}

/** Everything the sources give to one stat. */
export function blessing(stat: BlessStat) {
  let n = 0;
  for (const g of SOURCES.values()) n += g[stat] ?? 0;
  return n;
}
