// ---------------------------------------------------------------------------
// Dungeon plans (docs/design/mapping.md, step 4).
//
// The builders' plans of a dungeon come in torn pieces; each piece covers a
// strip of every floor, west to east. Read one and that strip lays over your
// hand-drawn map in brown ink. The guild's plan covers the whole floor at once.
// Plans are old: a few walls on them are wrong (a wall that isn't there, a gap
// that's been bricked up). The builders knew where the secret doors were and
// left gaps for them; the guild's plan, drawn by delvers, doesn't.
// With Cartographer's Eye the wrong walls are crossed out in red once you've
// seen the room they're in.
// ---------------------------------------------------------------------------

import type { AutoLayer } from '../ui/dungeonMap';

export type Dir = 'n' | 's' | 'e' | 'w';

export interface PlanLayer extends AutoLayer {
  /** edge indices on the plan that disagree with the stone */
  wrongH: number[];
  wrongV: number[];
}

/** 0..1, stable for a string */
export function hash01(s: string) {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface PlanSource {
  w: number;
  h: number;
  open: (i: number, j: number) => boolean;
  /** the true wall on cell (i, j)'s side d (only asked of open cells) */
  wall: (i: number, j: number, d: Dir) => boolean;
}

/**
 * The plan as the pieces you hold show it.
 * `pieces`: how many strips the plan is torn into; `have(n)`: you've read strip n (1-based);
 * `guild`: you've read the guild's whole plan; `key`: dungeon + floor, seeds the errors.
 */
export function planLayer(src: PlanSource, pieces: number, have: (n: number) => boolean, guild: boolean, key: string): PlanLayer | null {
  const { w, h } = src;
  const strip = (i: number) => Math.min(pieces, Math.floor((i / w) * pieces) + 1);
  const shown = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && src.open(i, j) && (guild || have(strip(i)));
  const out: PlanLayer = { hw: new Array(w * (h + 1)).fill(0), vw: new Array((w + 1) * h).fill(0), fill: new Array(w * h).fill(0), icons: {}, wrongH: [], wrongV: [] };
  let any = false;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (shown(i, j)) { out.fill[j * w + i] = 1; any = true; }
  if (!any) return null;
  const rate = guild ? 0.035 : 0.07;
  const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && src.open(i, j);
  // Horizontal edges: edge (i, j) is the north side of cell (i, j).
  for (let j = 0; j <= h; j++) for (let i = 0; i < w; i++) {
    const a = shown(i, j - 1), b = shown(i, j);
    if (!a && !b) continue;
    const truth = isOpen(i, j) ? src.wall(i, j, 'n') : src.wall(i, j - 1, 's');
    const idx = j * w + i;
    let v = truth;
    // Only edges between two open cells can be wrong: an outer wall is always where the plan says.
    if (isOpen(i, j) && isOpen(i, j - 1) && hash01(`${key}:h:${idx}`) < rate) {
      v = !v;
      out.wrongH.push(idx);
    }
    out.hw[idx] = v ? 1 : 0;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i <= w; i++) {
    const a = shown(i - 1, j), b = shown(i, j);
    if (!a && !b) continue;
    const truth = isOpen(i, j) ? src.wall(i, j, 'w') : src.wall(i - 1, j, 'e');
    const idx = j * (w + 1) + i;
    let v = truth;
    if (isOpen(i, j) && isOpen(i - 1, j) && hash01(`${key}:v:${idx}`) < rate) {
      v = !v;
      out.wrongV.push(idx);
    }
    out.vw[idx] = v ? 1 : 0;
  }
  return out;
}

/** A floor's find-spots for plan pieces and delvers' notes: which items lie on which floor. */
export function findsFor(dungeon: string, floors: number, floor: number, pieces: number, notes: number[]) {
  const all = [...Array.from({ length: pieces }, (_, k) => `floorPlan_${dungeon}_${k + 1}`), ...notes.map((n) => `delverNote_${n}`)];
  return all.filter((_, k) => (k % floors) + 1 === floor);
}
