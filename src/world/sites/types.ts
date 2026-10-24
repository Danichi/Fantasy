import type * as THREE from 'three';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { WorldMats } from '../buildings';
import type { Habitat } from '../herbs/flora';
import type { SiteKit } from './kit';

// Sites (docs/design/sites.md): the points of interest scattered across
// Cresha. Each kind says where it likes to stand and how many there are;
// the placer finds them homes from a fixed seed; the manager builds a site
// when you come near and takes it down when you leave.

export type SiteKind =
  | 'tower' | 'farmstead' | 'hunter' | 'shrine' | 'stone' | 'caravan'
  | 'well' | 'graves' | 'hideout' | 'hermit' | 'bridge' | 'statue' | 'beacon' | 'hives' | 'orchard'
  | 'championCamp' | 'darkScar' | 'fallenStar' | 'chapel' | 'fairyRing' | 'spring' | 'hollowTree'
  | 'cache' | 'vault' | 'lookout' | 'shepherd' | 'charcoal' | 'players' | 'skirmish' | 'duel' | 'gallows'
  | 'drownedTower' | 'sinkhole' | 'hangingTree' | 'wrongCircle' | 'mine';

/** One placed site. */
export interface Site {
  id: string;
  kind: SiteKind;
  /** which of its kind (0..count-1): picks a variant, a lore line, a hermit */
  n: number;
  x: number;
  z: number;
  y: number;
  /** which way it faces (radians) */
  yaw: number;
  seed: number;
  /** how dangerous the country is here, 0..1 (wilds/danger.ts) */
  danger: number;
}

/** What is saved about a site. */
export interface SiteState {
  /** seen with your own eyes (marked on the map) */
  seen?: boolean;
  /** finished: looted, read, cleared, lit (drawn as done on the map) */
  done?: boolean;
  /** game day something was last used (shrines, rests) */
  day?: number;
  /** anything else a kind wants to keep */
  k?: Record<string, number | string | boolean>;
}

/** Something you can do at a site (shows as the interaction prompt). */
export interface SiteAction {
  at: THREE.Vector3;
  radius: number;
  label: () => string;
  enabled?: () => boolean;
  act: () => void;
}

/** A hostile thing a site has let loose (rats from a cellar, wolves at a wreck). */
export interface SiteFoe {
  readonly alive: boolean;
  update(dt: number, player: Player): void;
  dispose(): void;
}

/** What the game lends the sites. */
export interface SiteHooks {
  scene: THREE.Scene;
  fx: FX;
  mats: WorldMats;
  player: Player;
  toast: (m: string) => void;
  give: (id: string, n: number) => void;
  gold: (n: number) => void;
  xp: (n: number) => void;
  /** heal and save (resting) */
  rest: () => void;
  /** sleep until morning, heal, save */
  sleep: () => void;
  save: () => void;
  reveal: (x: number, z: number, r: number) => void;
  bless: (b: { id: string; label: string; sec: number; m: Record<string, number> }) => void;
  hour: () => number;
  day: () => number;
  /** a conversation with choices */
  talk: (name: string, title: string, text: string, options: { label: string; run: () => void }[]) => void;
  /** level of the wild here */
  level: (x: number, z: number) => number;
  /** a creature kind's geometry is built (sites wait before spawning it) */
  ready: (look: string) => boolean;
  /** a teleport for climbing (the tower stair) */
  teleport: (at: THREE.Vector3, yaw?: number) => void;
  /** how many of an item you carry, take some, pay gold (false if you can't) */
  count: (id: string) => number;
  take: (id: string, n: number) => boolean;
  spend: (gold: number) => boolean;
  /** no night raids for this many days (a beacon is lit) */
  calmRaids: (days: number) => void;
  /** a discovery boss: its body if it's about, whether it's dead, and a way to call it up */
  boss: (id: string) => { body: { alive: boolean; phase: number } | null; slain: boolean; summon: (at?: THREE.Vector3) => { alive: boolean; phase: number } | null };
  /** the moon is full tonight; nights until it is */
  fullMoon: () => boolean;
  moonIn: () => number;
}

/** A site while it's built. */
export interface SiteLive {
  actions: SiteAction[];
  update?(dt: number, player: Player): void;
  dispose?(): void;
}

export interface SiteCtx {
  site: Site;
  kit: SiteKit;
  state: SiteState;
  hooks: SiteHooks;
  rnd: () => number;
  /** let a foe loose (the manager updates it and clears it up) */
  spawn(f: SiteFoe): void;
  /** finished: marks the map */
  finish(): void;
  /** the saved state of every site of a kind (the twelve stones) */
  others(kind: SiteKind): SiteState[];
  /** the other sites of this kind (the champion's trail, the fairy rings) */
  siblings(): Site[];
  /** mark a site as seen (it shows on the map) */
  markSeen(id: string): void;
  /** the nearest site you haven't seen (rumours, spyglasses) */
  unseen(x: number, z: number): { site: Site; st: SiteState; name: string } | null;
}

export interface SiteType {
  kind: SiteKind;
  /** what the map and the prompt call it */
  label: string;
  /** a map glyph and its colour */
  glyph: string;
  color: string;
  /** how many to place */
  count: number;
  /** the country it likes */
  habitats: Habitat[];
  /** metres it keeps clear of trees */
  clear: number;
  /** a per-site name (the hermits), else the label */
  name?: (s: Site) => string;
  /** placement score at a candidate (higher is better); default 1 */
  score?: (x: number, z: number, h: number) => number;
  /** never nearer to Elder Glen than this (metres) */
  minFar?: number;
  /** keep within this of a road (the wrecked caravans) */
  nearRoad?: number;
  /** stands at this exact spot (the discovery sites); count is 1 */
  at?: { x: number; z: number; yaw: number };
  build(c: SiteCtx): SiteLive;
}
