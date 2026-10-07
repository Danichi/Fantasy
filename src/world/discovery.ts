import * as THREE from 'three';
import { GW, GH, CELL, WORLD_X0, WORLD_Z0, regionAt } from './worldMap';
import { REGIONS, type Landmark } from './regionDefinitions';
import { events } from '../core/events';

// Exploration state (prompt §§49, 80): the fog of war over the world map,
// regions entered, and places discovered. Only this is saved: a bitmask of
// revealed 60 m cells and the ids of known regions and places.
//
// Map knowledge levels per place: known (heard of, e.g. from a signpost or
// NPC), discovered (seen within its radius), visited (walked into it).

const REVEAL_R = 260; // metres revealed around the player
const DISCOVER_R = 230; // metres to count as having found a place
const VISIT_R = 90;

export type Knowledge = 'known' | 'discovered' | 'visited';

export interface DiscoverySave {
  cells: string; // base64 bitmask, GW * GH bits
  regions: string[];
  places: Record<string, Knowledge>;
}

export class Discovery {
  readonly cells = new Uint8Array(Math.ceil((GW * GH) / 8));
  readonly regions = new Set<string>();
  readonly places = new Map<string, Knowledge>();
  private lastCell = -1;
  private lastRegion = '';
  /** every landmark in the world with its region id */
  readonly landmarks: (Landmark & { region: string })[] = [];

  constructor() {
    for (const r of Object.values(REGIONS)) for (const l of r.landmarks) this.landmarks.push({ ...l, region: r.id });
    // Elder Glen is where the hero wakes: known from the start.
    this.places.set('elderGlen', 'visited');
    this.places.set('crypt', 'known');
  }

  isRevealed(gx: number, gz: number) {
    const k = gz * GW + gx;
    return (this.cells[k >> 3] & (1 << (k & 7))) !== 0;
  }

  /** how far you see (at sea, from a deck, further; with charts, three times as far) */
  revealScale = 1;

  /** Chart everything within `r` metres of a point (a relit lighthouse, a chart bought). */
  revealAround(x: number, z: number, r: number) {
    const gx = Math.floor((x - WORLD_X0) / CELL), gz = Math.floor((z - WORLD_Z0) / CELL);
    const n = Math.ceil(r / CELL);
    let revealed = 0;
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dz * dz > n * n) continue;
      const cx = gx + dx, cz = gz + dz;
      if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) continue;
      const k = cz * GW + cx;
      if (!(this.cells[k >> 3] & (1 << (k & 7)))) {
        this.cells[k >> 3] |= 1 << (k & 7);
        revealed++;
      }
    }
    if (revealed) events.emit('mapRevealed', { cells: revealed });
  }

  /** Call every frame (cheap: only does work when the player changes cell). */
  update(pos: THREE.Vector3) {
    const gx = Math.floor((pos.x - WORLD_X0) / CELL), gz = Math.floor((pos.z - WORLD_Z0) / CELL);
    if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) return;
    const cell = gz * GW + gx;
    if (cell === this.lastCell) return;
    this.lastCell = cell;
    const r = Math.ceil((REVEAL_R * this.revealScale) / CELL);
    let revealed = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r + 1) continue;
      const x = gx + dx, z = gz + dz;
      if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
      const k = z * GW + x;
      if (!(this.cells[k >> 3] & (1 << (k & 7)))) {
        this.cells[k >> 3] |= 1 << (k & 7);
        revealed++;
      }
    }
    if (revealed) events.emit('mapRevealed', { cells: revealed });
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

  /** Reveal a whole region's cells (bought maps, cartographers). */
  revealRegion(id: string) {
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
      if (regionAt(WORLD_X0 + (x + 0.5) * CELL, WORLD_Z0 + (z + 0.5) * CELL) !== id) continue;
      const k = z * GW + x;
      this.cells[k >> 3] |= 1 << (k & 7);
    }
    events.emit('mapRevealed', { cells: 1 });
  }

  /** Fraction of a region's cells revealed (for the "fully explored" state). */
  explored(id: string) {
    let total = 0, seen = 0;
    for (let z = 0; z < GH; z += 2) for (let x = 0; x < GW; x += 2) {
      if (regionAt(WORLD_X0 + (x + 0.5) * CELL, WORLD_Z0 + (z + 0.5) * CELL) !== id) continue;
      total++;
      if (this.isRevealed(x, z)) seen++;
    }
    return total ? seen / total : 0;
  }

  toJSON(): DiscoverySave {
    let bin = '';
    for (let k = 0; k < this.cells.length; k++) bin += String.fromCharCode(this.cells[k]);
    return { cells: btoa(bin), regions: [...this.regions], places: Object.fromEntries(this.places) };
  }

  fromJSON(d: DiscoverySave | undefined) {
    if (!d) return;
    try {
      const bin = atob(d.cells);
      for (let k = 0; k < Math.min(bin.length, this.cells.length); k++) this.cells[k] = bin.charCodeAt(k);
    } catch {}
    for (const r of d.regions ?? []) this.regions.add(r);
    for (const [k, v] of Object.entries(d.places ?? {})) this.places.set(k, v);
    this.lastCell = -1;
    this.lastRegion = '';
  }
}
