import * as THREE from 'three';
import { GW, GH, CELL, WORLD_X0, WORLD_Z0, regionAt } from './worldMap';
import { REGIONS, type Landmark } from './regionDefinitions';
import { ROAD_LINES } from './terrainHeight';
import { events } from '../core/events';

// Exploration state (docs/design/mapping.md). The world map is one sheet in
// three hands:
//   sketch : pencil. Walking lifts it in a circle around you: the rough shape
//            of the land, no names, no roads you haven't walked.
//   ink    : the real map. It comes from maps you find, buy or copy (region
//            pieces, charts, cartographers, lighthouses, surveying), from
//            walking a road, and from entering a town.
//   marks  : your own hand: pins, circles, lines, notes, rumours you copied.
// Saved: two bitmasks of 60 m cells, the regions entered, place knowledge,
// the map pieces read, your marks and a short trail of where you walked.
//
// Place knowledge: known (named on a map or a signpost), discovered (seen),
// visited (walked into). A place you've only seen shows as an unnamed sketch
// until a map or a sign names it.

const REVEAL_R = 260; // metres sketched around the player
const DISCOVER_R = 230; // metres to count as having seen a place
const VISIT_R = 90;
/** a town's gate signpost inks the town and its fields */
const TOWN_INK_R = 380;
const TOWN_KINDS = new Set(['town', 'city', 'capital', 'port', 'castle']);
const TRAIL_STEP = 24; // metres between trail points
const TRAIL_MAX = 900;

export type Knowledge = 'known' | 'discovered' | 'visited';

/** One of your own marks on the world map. */
export interface MapMark {
  id: number;
  kind: 'pin' | 'circle' | 'line' | 'note' | 'rumour';
  x: number;
  z: number;
  /** circles and rumours: radius in metres */
  r?: number;
  /** lines: the far end */
  x2?: number;
  z2?: number;
  /** pins: a glyph from the mark kit (mapglyph/<name>) */
  glyph?: string;
  color?: string;
  /** your note, shown on hover and beside the mark */
  text?: string;
  /** struck through: done, cleared, wrong */
  struck?: boolean;
  /** a copied rumour: its id on the guild wall, and the day you copied it */
  rumour?: string;
  day?: number;
  /** an old chart's mistake: struck through when you get close */
  err?: boolean;
}

export interface DiscoverySave {
  /** the sketch (walking) */
  cells: string;
  /** the ink (maps); absent in saves from before the mapping update */
  ink?: string;
  regions: string[];
  places: Record<string, Knowledge>;
  pieces?: string[];
  marks?: MapMark[];
  trail?: number[];
  classic?: boolean;
}

const enc = (a: Uint8Array) => {
  let bin = '';
  for (let k = 0; k < a.length; k++) bin += String.fromCharCode(a[k]);
  return btoa(bin);
};
const dec = (s: string, into: Uint8Array) => {
  try {
    const bin = atob(s);
    for (let k = 0; k < Math.min(bin.length, into.length); k++) into[k] = bin.charCodeAt(k);
  } catch {}
};
const cellOf = (x: number, z: number) => {
  const gx = Math.floor((x - WORLD_X0) / CELL), gz = Math.floor((z - WORLD_Z0) / CELL);
  return gx < 0 || gz < 0 || gx >= GW || gz >= GH ? -1 : gz * GW + gx;
};

export class Discovery {
  /** the pencil sketch: where you have walked and looked */
  readonly cells = new Uint8Array(Math.ceil((GW * GH) / 8));
  /** the ink: what your maps show */
  readonly ink = new Uint8Array(Math.ceil((GW * GH) / 8));
  readonly regions = new Set<string>();
  readonly places = new Map<string, Knowledge>();
  /** map items read (region pieces, charts, plans): their item ids */
  readonly pieces = new Set<string>();
  /** your own marks on the world map */
  marks: MapMark[] = [];
  /** where you walked lately (x, z pairs, metres) */
  trail: number[] = [];
  /** the old automap: walking inks everything (a setting, off by default) */
  classic = false;
  private lastCell = -1;
  private lastRegion = '';
  private nextMarkId = 1;
  /** every landmark in the world with its region id */
  readonly landmarks: (Landmark & { region: string })[] = [];
  /** cells a road runs through (walking one inks it) */
  private readonly roadCells = new Set<number>();

  constructor() {
    for (const r of Object.values(REGIONS)) for (const l of r.landmarks) this.landmarks.push({ ...l, region: r.id });
    for (const line of ROAD_LINES) {
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1], [bx, bz] = line[i];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 20));
        for (let s = 0; s <= n; s++) {
          const c = cellOf(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
          if (c >= 0) this.roadCells.add(c);
        }
      }
    }
    // Elder Glen is where the hero wakes: known from the start.
    this.places.set('elderGlen', 'visited');
    this.places.set('crypt', 'known');
  }

  /** A new game: the hero knows the Glen by heart, and nothing else. */
  startFresh() {
    this.inkRegion('elderGlen');
  }

  private static has(a: Uint8Array, k: number) {
    return (a[k >> 3] & (1 << (k & 7))) !== 0;
  }
  private static set(a: Uint8Array, k: number) {
    if ((a[k >> 3] & (1 << (k & 7))) !== 0) return false;
    a[k >> 3] |= 1 << (k & 7);
    return true;
  }

  /** Sketched (walked near, or inked). */
  isRevealed(gx: number, gz: number) {
    const k = gz * GW + gx;
    return Discovery.has(this.cells, k) || Discovery.has(this.ink, k);
  }
  isSketched(gx: number, gz: number) {
    return this.isRevealed(gx, gz);
  }
  /** On your map in ink. */
  isInked(gx: number, gz: number) {
    return Discovery.has(this.ink, gz * GW + gx);
  }
  isInkedAt(x: number, z: number) {
    const c = cellOf(x, z);
    return c >= 0 && Discovery.has(this.ink, c);
  }

  /** how far you see (at sea, from a deck, further; with charts, three times as far) */
  revealScale = 1;

  private circle(x: number, z: number, r: number, fn: (k: number) => boolean) {
    const gx = Math.floor((x - WORLD_X0) / CELL), gz = Math.floor((z - WORLD_Z0) / CELL);
    const n = Math.ceil(r / CELL);
    let changed = 0;
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dz * dz > n * n + 1) continue;
      const cx = gx + dx, cz = gz + dz;
      if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) continue;
      if (fn(cz * GW + cx)) changed++;
    }
    return changed;
  }

  /** Ink everything within `r` metres of a point (a relit lighthouse, a lookout, a survey). */
  inkAround(x: number, z: number, r: number) {
    const n = this.circle(x, z, r, (k) => {
      Discovery.set(this.cells, k);
      return Discovery.set(this.ink, k);
    });
    if (n) this.afterInk(n);
    return n;
  }
  /** Old name, same thing: a lighthouse or a chart inks a circle. */
  revealAround(x: number, z: number, r: number) {
    return this.inkAround(x, z, r);
  }

  /** Pencil only: a lookout's view, or a spyglass. */
  sketchAround(x: number, z: number, r: number) {
    const n = this.circle(x, z, r, (k) => Discovery.set(this.cells, k));
    if (n) events.emit('mapRevealed', { cells: n });
    return n;
  }

  /** Ink a list of cell indices (a map piece's patch). Returns how many were new. */
  inkCells(cells: Iterable<number>) {
    let n = 0;
    for (const k of cells) {
      Discovery.set(this.cells, k);
      if (Discovery.set(this.ink, k)) n++;
    }
    if (n) this.afterInk(n);
    return n;
  }

  /** Ink a whole region (an old chart, the cartographer's survey). */
  inkRegion(id: string) {
    return this.inkCells(this.regionCells(id));
  }
  revealRegion(id: string) {
    return this.inkRegion(id);
  }

  /** New ink names the places it covers. */
  private afterInk(n: number) {
    for (const l of this.landmarks) {
      if (!this.places.has(l.id) && this.isInkedAt(l.x, l.z)) this.places.set(l.id, 'known');
    }
    events.emit('mapRevealed', { cells: n });
  }

  /** Call every frame (cheap: only does work when the player changes cell). */
  update(pos: THREE.Vector3) {
    const cell = cellOf(pos.x, pos.z);
    if (cell < 0) return;
    // The trail: a pencil line of where you've been.
    const tl = this.trail.length;
    if (tl < 2 || Math.hypot(pos.x - this.trail[tl - 2], pos.z - this.trail[tl - 1]) > TRAIL_STEP) {
      this.trail.push(Math.round(pos.x), Math.round(pos.z));
      if (this.trail.length > TRAIL_MAX * 2) this.trail.splice(0, this.trail.length - TRAIL_MAX * 2);
    }
    if (cell === this.lastCell) return;
    this.lastCell = cell;
    const sketched = this.circle(pos.x, pos.z, REVEAL_R * this.revealScale, (k) => Discovery.set(this.cells, k));
    if (this.classic) {
      const inked = this.circle(pos.x, pos.z, REVEAL_R * this.revealScale, (k) => Discovery.set(this.ink, k));
      if (inked) this.afterInk(inked);
    }
    // Walking a road inks that stretch of it.
    if (this.roadCells.has(cell)) {
      const inked = this.circle(pos.x, pos.z, CELL * 1.5, (k) => (this.roadCells.has(k) || k === cell ? Discovery.set(this.ink, k) : false));
      if (inked) this.afterInk(inked);
    }
    if (sketched) events.emit('mapRevealed', { cells: sketched });
    // Regions: announce the first entry (and every re-entry gets a quieter title).
    const region = regionAt(pos.x, pos.z);
    if (region !== this.lastRegion && region !== 'ocean') {
      const first = !this.regions.has(region);
      this.regions.add(region);
      this.lastRegion = region;
      const def = REGIONS[region];
      if (def) events.emit('regionEntered', { id: region, name: def.name, subtitle: def.subtitle, first });
    }
    // Places.
    for (const l of this.landmarks) {
      const d = Math.hypot(pos.x - l.x, pos.z - l.z);
      const had = this.places.get(l.id);
      if (d < VISIT_R && had !== 'visited') {
        this.places.set(l.id, 'visited');
        // The signpost at a town's gate: the town and its fields go on your map.
        if (TOWN_KINDS.has(l.kind)) {
          this.inkAround(l.x, l.z, TOWN_INK_R);
          // ...and its signposts name the towns down the roads from it.
          for (const o of this.landmarks) if (TOWN_KINDS.has(o.kind) && Math.hypot(o.x - l.x, o.z - l.z) < 2600) this.learn(o.id);
        }
        if (!had || had === 'known') events.emit('placeDiscovered', { id: l.id, name: l.name, kind: l.kind });
      } else if (d < DISCOVER_R && !had) {
        this.places.set(l.id, 'discovered');
        events.emit('placeDiscovered', { id: l.id, name: l.name, kind: l.kind });
      }
    }
  }

  /** Mark a place as heard of (signposts, NPC directions, bought maps). */
  learn(id: string) {
    if (!this.places.has(id)) this.places.set(id, 'known');
  }

  /** Is this place named on your map? (inked where it stands, or you've been in) */
  named(id: string) {
    const k = this.places.get(id);
    if (!k) return false;
    if (k === 'visited' || k === 'known') return true;
    const l = this.landmarks.find((p) => p.id === id);
    return !!l && this.isInkedAt(l.x, l.z);
  }

  /** Every cell's region (built once, on first use). */
  private regionIdx: Uint8Array | null = null;
  private regionIds: string[] = [];
  /** cell indices of a region */
  regionCells(id: string) {
    this.buildRegionIdx();
    const want = this.regionIds.indexOf(id) + 1;
    const out: number[] = [];
    if (!want) return out;
    for (let k = 0; k < this.regionIdx!.length; k++) if (this.regionIdx![k] === want) out.push(k);
    return out;
  }
  private buildRegionIdx() {
    if (this.regionIdx) return;
    this.regionIdx = new Uint8Array(GW * GH);
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
      const id = regionAt(WORLD_X0 + (x + 0.5) * CELL, WORLD_Z0 + (z + 0.5) * CELL);
      let i = this.regionIds.indexOf(id);
      if (i < 0) { this.regionIds.push(id); i = this.regionIds.length - 1; }
      this.regionIdx[z * GW + x] = i + 1;
    }
  }

  /** Fraction of a region's cells inked (for the "fully charted" state). */
  explored(id: string, layer: 'ink' | 'sketch' = 'ink') {
    this.buildRegionIdx();
    const want = this.regionIds.indexOf(id) + 1;
    if (!want) return 0;
    let total = 0, seen = 0;
    const idx = this.regionIdx!;
    for (let k = 0; k < idx.length; k += 3) {
      if (idx[k] !== want) continue;
      total++;
      if (layer === 'ink' ? Discovery.has(this.ink, k) : Discovery.has(this.cells, k) || Discovery.has(this.ink, k)) seen++;
    }
    return total ? seen / total : 0;
  }

  // ---- marks ------------------------------------------------------------------------
  addMark(m: Omit<MapMark, 'id'>) {
    const mark = { ...m, id: this.nextMarkId++ } as MapMark;
    this.marks.push(mark);
    events.emit('mapRevealed', { cells: 0 });
    return mark;
  }
  removeMark(id: number) {
    this.marks = this.marks.filter((m) => m.id !== id);
  }
  markNear(x: number, z: number, r: number) {
    let best: MapMark | null = null, bd = r;
    for (const m of this.marks) {
      let d = Math.hypot(m.x - x, m.z - z);
      if (m.kind === 'circle' || m.kind === 'rumour') d = Math.min(d, Math.abs(d - (m.r ?? 0)));
      if (m.kind === 'line' && m.x2 !== undefined && m.z2 !== undefined) {
        const vx = m.x2 - m.x, vz = m.z2 - m.z, L = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - m.x) * vx + (z - m.z) * vz) / L));
        d = Math.hypot(m.x + vx * t - x, m.z + vz * t - z);
      }
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  toJSON(): DiscoverySave {
    return {
      cells: enc(this.cells), ink: enc(this.ink), regions: [...this.regions], places: Object.fromEntries(this.places),
      pieces: [...this.pieces], marks: this.marks, trail: this.trail.slice(-400), classic: this.classic || undefined,
    };
  }

  fromJSON(d: DiscoverySave | undefined) {
    if (!d) return;
    dec(d.cells, this.cells);
    // Saves from before the mapping update: everything you'd seen was inked, and stays so.
    dec(d.ink ?? d.cells, this.ink);
    for (const r of d.regions ?? []) this.regions.add(r);
    for (const [k, v] of Object.entries(d.places ?? {})) this.places.set(k, v);
    for (const p of d.pieces ?? []) this.pieces.add(p);
    this.marks = (d.marks ?? []).filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.z));
    this.nextMarkId = this.marks.reduce((a, m) => Math.max(a, m.id + 1), 1);
    this.trail = (d.trail ?? []).slice();
    this.classic = !!d.classic;
    this.lastCell = -1;
    this.lastRegion = '';
  }
}
