import * as THREE from 'three';
import { REGIONS } from '../world/regionDefinitions';
import { PLACE_DEFS, pxToWorld, regionAt, reliefAt, RELIEF } from '../world/worldMap';
import { heightAt, roadDist, RIVER_LEVEL, TOWN_R } from '../world/terrainHeight';
import { events } from '../core/events';
import { GRASS_MASKS } from '../world/groundWindow';
import type { Creature } from './creature';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';

// Wild things across Cresha: groups of creatures appear out of sight around
// the player and fade away once far behind. What appears depends on where you
// are and when: the region sets the level range, and leaving the roads raises
// both how many there are and how strong. Dens are fixed places (a boar
// wallow, a spider hollow, a bat roost) that hold a stronger group and keep
// sending out wanderers until they are cleared; a cleared den comes back after
// a few days.

export interface Habitat {
  x: number;
  z: number;
  region: string;
  /** forest / open / mountain ... (worldMap RELIEF) */
  relief: number;
  /** metres to the nearest road (large when none is near) */
  road: number;
  hour: number;
  night: boolean;
}

export interface Species {
  id: string;
  /** How welcome it is here (0 = never). */
  habitat(h: Habitat): number;
  /** Group size range. */
  group: [number, number];
  /** How far apart a group spreads (m). */
  spread: number;
  /** Never appears nearer a road than this (m). */
  minRoad: number;
  /** Can it be spawned yet (its look built)? */
  ready?: () => boolean;
  make(at: THREE.Vector3, level: number, opts: { leader: boolean; den: boolean; index: number }): Creature;
  den?: { name: string; build: (at: THREE.Vector3, seed: number) => THREE.Object3D; found?: string };
}

export interface Den {
  id: string;
  species: string;
  x: number;
  z: number;
  level: number;
}

/** Level of the wild at a point: the region's range, pushed up away from roads. */
export function zoneLevel(x: number, z: number, rand = Math.random) {
  const reg = REGIONS[regionAt(x, z)] ?? REGIONS.cresha;
  const [lo, hi] = reg.levels;
  const off = THREE.MathUtils.smoothstep(Math.min(roadDist(x, z), 400), 12, 160);
  const span = Math.min(hi - lo, 12);
  const l = lo + span * (0.1 + 0.75 * off) + (rand() - 0.5) * 1.6;
  return THREE.MathUtils.clamp(Math.round(l), lo, hi);
}

/** Places nothing wild should appear: towns and cities. */
const SAFE: { x: number; z: number; r: number }[] = [
  { x: 0, z: -4, r: TOWN_R + 25 },
  ...PLACE_DEFS.filter((p) => ['town', 'city', 'capital', 'port', 'castle'].includes(p.kind)).map((p) => {
    const w = pxToWorld(p.px[0], p.px[1]);
    return { x: w.x, z: w.y, r: 190 };
  }),
];
export const isSafe = (x: number, z: number) => SAFE.some((s) => Math.hypot(x - s.x, z - s.z) < s.r);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Group {
  members: Creature[];
  den?: Den;
  at: THREE.Vector3;
}

export class Population {
  readonly species = new Map<string, Species>();
  readonly dens: Den[] = [];
  /** den id -> game day it was cleared */
  cleared: Record<string, number> = {};
  /** set false to stop spawning (tests switch it on when they need it) */
  enabled = true;
  readonly groups: Group[] = [];
  private tick = 0;
  private spawnCd = 4;
  private denLooks = new Map<string, THREE.Object3D>();
  /** dens already announced this session */
  private announced = new Set<string>();
  private rand = Math.random;

  constructor(
    private readonly scene: THREE.Scene,
    readonly fx: FX,
    private readonly toast: (m: string) => void,
  ) {}

  add(s: Species) {
    this.species.set(s.id, s);
  }

  /** Scatter dens over an area (deterministic: same world, same dens). */
  placeDens(seed: number, area: { x0: number; z0: number; x1: number; z1: number }, count: number) {
    const r = rng(seed);
    let tries = 0;
    while (this.dens.filter((d) => d.id.startsWith(`d${seed}-`)).length < count && tries++ < count * 400) {
      const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
      if (!this.spotOk(x, z, 40)) continue;
      if (this.dens.some((d) => Math.hypot(d.x - x, d.z - z) < 120)) continue;
      const h = this.habitatAt(x, z, 12), hn = this.habitatAt(x, z, 0);
      const options = [...this.species.values()].filter((s) => s.den && Math.max(s.habitat(h), s.habitat(hn)) > 0 && h.road >= Math.max(40, s.minRoad));
      if (!options.length) continue;
      const s = options[Math.floor(r() * options.length)];
      this.dens.push({ id: `d${seed}-${this.dens.length}`, species: s.id, x, z, level: Math.min(zoneLevel(x, z, r) + 1, (REGIONS[h.region] ?? REGIONS.cresha).levels[1]) });
      // Trampled ground: the grass thins out over the den.
      GRASS_MASKS.push({ x, z, r: 7, amount: 0.85, tint: 1 });
    }
  }

  habitatAt(x: number, z: number, hour: number): Habitat {
    return { x, z, region: regionAt(x, z), relief: reliefAt(x, z), road: Math.min(roadDist(x, z), 999), hour, night: hour < 5.5 || hour > 20.5 };
  }

  /** Dry, not too steep, not in a town. */
  spotOk(x: number, z: number, minRoad = 0) {
    if (isSafe(x, z)) return false;
    const y = heightAt(x, z);
    if (y < RIVER_LEVEL + 0.3) return false;
    const rel = reliefAt(x, z);
    if (rel === RELIEF.deep || rel === RELIEF.shelf || rel === RELIEF.lava) return false;
    const slope = Math.max(Math.abs(heightAt(x + 2, z) - y), Math.abs(heightAt(x, z + 2) - y)) / 2;
    if (slope > 0.55) return false;
    if (minRoad > 0 && roadDist(x, z) < minRoad) return false;
    return true;
  }

  /** How many groups the wild around here holds. */
  private wanted(at: THREE.Vector3, night: boolean) {
    const road = roadDist(at.x, at.z);
    const off = THREE.MathUtils.smoothstep(Math.min(road, 400), 10, 90);
    return Math.round((1 + off * 2.4) * (night ? 1.3 : 1));
  }

  spawnGroup(s: Species, at: THREE.Vector3, level: number, den?: Den) {
    const n = den ? s.group[1] + 1 : s.group[0] + Math.floor(this.rand() * (s.group[1] - s.group[0] + 1));
    const g: Group = { members: [], den, at: at.clone() };
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, r = i === 0 ? 0 : s.spread * (0.4 + this.rand() * 0.6);
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      const p = new THREE.Vector3(x, heightAt(x, z), z);
      const leader = i === 0 && (!!den || n >= 3);
      g.members.push(s.make(p, level + (leader && den ? 2 : 0) - (i > 0 && this.rand() < 0.3 ? 1 : 0), { leader, den: !!den, index: i }));
    }
    this.groups.push(g);
    return g;
  }

  /** All living wild creatures (tests and the HUD). */
  get creatures() {
    return this.groups.flatMap((g) => g.members.filter((m) => m.alive));
  }

  /** fallen creatures still lying where they dropped */
  private corpses: Creature[] = [];

  update(dt: number, player: Player, hour: number, day: number) {
    for (const g of this.groups) for (const m of g.members) if (!m.dead) m.update(dt, player);
    for (const c of this.corpses) c.update(dt, player);
    if (this.corpses.length) this.corpses = this.corpses.filter((c) => !c.dead);
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    const p = player.pos;

    // Let go of groups far behind (unless still fighting), and of the fallen.
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i];
      const living = g.members.filter((m) => m.alive);
      const far = living.length > 0 && living.every((m) => m.position.distanceTo(p) > 190);
      if (far) for (const m of living) m.dispose();
      if (!living.length || far) {
        // A den whose whole group fell is cleared.
        if (g.den && !living.length) {
          this.cleared[g.den.id] = day;
          const s = this.species.get(g.den.species);
          this.toast(`${s?.den?.name ?? 'Den'} cleared`);
          events.emit('denCleared', { id: g.den.id, species: g.den.species });
        }
        for (const m of g.members) if (!m.dead && !m.alive) this.corpses.push(m);
        this.groups.splice(i, 1);
      }
    }
    if (!this.enabled) return;
    for (const s of this.species.values()) s.ready?.();

    // Dens: wake when you come near; build their look first.
    for (const d of this.dens) {
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      const s = this.species.get(d.species);
      if (!s) continue;
      if (dist < 260 && !this.denLooks.has(d.id) && s.den) {
        const look = s.den.build(new THREE.Vector3(d.x, heightAt(d.x, d.z), d.z), d.id.length * 7919 + Math.round(d.x));
        this.scene.add(look);
        this.denLooks.set(d.id, look);
      } else if (dist > 320 && this.denLooks.has(d.id)) {
        const look = this.denLooks.get(d.id)!;
        look.removeFromParent();
        this.denLooks.delete(d.id);
      }
      const cleared = this.cleared[d.id];
      if (dist < 32 && !this.announced.has(d.id) && s.den?.found && (cleared === undefined || day - cleared >= 3)) {
        this.announced.add(d.id);
        this.toast(s.den.found);
      }
      if (cleared !== undefined && day - cleared < 3) continue;
      if (cleared !== undefined) delete this.cleared[d.id];
      if (dist < 130 && !this.groups.some((g) => g.den === d) && s.ready?.() !== false) this.spawnGroup(s, new THREE.Vector3(d.x, heightAt(d.x, d.z), d.z), d.level, d);
    }

    // Wanderers: keep the wild topped up around the player, out of sight.
    this.spawnCd -= 1;
    const night = hour < 5.5 || hour > 20.5;
    const roaming = this.groups.filter((g) => !g.den).length;
    if (this.spawnCd > 0 || roaming >= this.wanted(p, night)) return;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = this.rand() * Math.PI * 2, r = 60 + this.rand() * 65;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!this.spotOk(x, z)) continue;
      if (this.groups.some((g) => g.at.distanceTo(new THREE.Vector3(x, g.at.y, z)) < 40)) continue;
      const h = this.habitatAt(x, z, hour);
      const opts = [...this.species.values()].map((s) => [s, h.road < s.minRoad || s.ready?.() === false ? 0 : s.habitat(h)] as const).filter(([, w]) => w > 0);
      if (!opts.length) continue;
      let pick = this.rand() * opts.reduce((n, [, w]) => n + w, 0);
      const s = opts.find(([, w]) => (pick -= w) <= 0)?.[0] ?? opts[0][0];
      this.spawnGroup(s, new THREE.Vector3(x, heightAt(x, z), z), zoneLevel(x, z, this.rand));
      this.spawnCd = 6 + this.rand() * 8;
      break;
    }
  }

  toJSON() {
    return { dens: { ...this.cleared } };
  }
  fromJSON(s?: { dens?: Record<string, number> }) {
    this.cleared = { ...(s?.dens ?? {}) };
  }

  /** Remove everything (realm change, tests). */
  clear() {
    for (const g of this.groups) for (const m of g.members) m.dispose();
    for (const c of this.corpses) c.dispose();
    this.groups.length = 0;
    this.corpses.length = 0;
  }
}
