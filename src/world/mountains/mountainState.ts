import type { KettleSave } from '../sea/ironKettle';

// What the White and Deep Mountains remember (docs/design/mountains.md §12):
// the cold, the cairns you've relit, how each king stands with you, the
// claim's settlement, whether the Deep Forge burns and the Great Lift runs.
// It rides in the save's world flags as one JSON string ('mountains'), so the
// save format needs no new field.

export type ClaimEnding = '' | 'shared' | 'bought' | 'fought';
export type Feud = '' | 'durin' | 'brokk' | 'united';

export interface MountainSave {
  /** the cold meter, 0 (frozen) .. 1 (warm) */
  cold: number;
  /** lantern cairns relit (indices into CAIRNS) */
  cairns: number[];
  /** each king's regard for you (0..3) */
  durin: number;
  brokk: number;
  claim: ClaimEnding;
  /** miners brought out of the Collapsed Shaft (indices) */
  rescued: number[];
  forgeOpen: boolean;
  liftUnlocked: boolean;
  /** how the feud of the two kings ended */
  feud: Feud;
  /** Vathrax: slain, or calmed by a dragonkin */
  vathrax: '' | 'slain' | 'calmed';
  /** places you've been (first-visit deeds) */
  visited: string[];
  /** the Iron Kettle: her voyage and where she lies */
  kettle: KettleSave | null;
  /** the Engine Below's Warden is down */
  engineDown: boolean;
  /** the Forge-Wyrm is dead */
  wyrmDead: boolean;
}

export const freshMountainSave = (): MountainSave => ({
  cold: 1, cairns: [], durin: 0, brokk: 0, claim: '', rescued: [], forgeOpen: false, liftUnlocked: false, feud: '', vathrax: '', visited: [], kettle: null, engineDown: false, wyrmDead: false,
});

export function readMountainSave(flags: Record<string, boolean | number | string>): MountainSave {
  const raw = flags.mountains;
  if (typeof raw !== 'string') return freshMountainSave();
  try {
    return { ...freshMountainSave(), ...(JSON.parse(raw) as Partial<MountainSave>) };
  } catch {
    return freshMountainSave();
  }
}

export function writeMountainSave(flags: Record<string, boolean | number | string>, s: MountainSave) {
  flags.mountains = JSON.stringify({ ...s, cold: +s.cold.toFixed(3) });
}
