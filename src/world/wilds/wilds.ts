import * as THREE from 'three';
import { Telegraphs } from '../../enemies/wilds/telegraph';
import { Missiles } from '../../enemies/wilds/projectiles';
import { Roamers } from './roamers';
import { LAIRS, LAIR_CLEARINGS, LairController, type WildsHooks } from './lairs';
import { dangerAt, dangerTier, DANGER_BANDS, terrainAt } from './danger';
import type { WildCtx } from '../../enemies/wilds/wildBeast';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';

// The wilds along the Crown Road and the King's Road: the roaming monsters
// (roamers.ts), the danger gradient they all read (danger.ts), and the five
// hidden bosses in their lairs deep in the woods (lairs.ts). One object for
// main.ts to build, step, present, hide and clear.

export type { WildsHooks } from './lairs';
export { dangerAt } from './danger';

/** Clearings the nature scatter must leave open (the lairs' arenas). */
export const WILDS_CLEARINGS = LAIR_CLEARINGS;

export class Wilds {
  readonly tele: Telegraphs;
  readonly missiles: Missiles;
  readonly roamers: Roamers;
  readonly lairs: LairController[];
  readonly interactables: Interactable[];
  private visible = true;

  constructor(scene: THREE.Scene, fx: FX, mats: WorldMats, private hooks: WildsHooks) {
    this.tele = new Telegraphs(scene);
    this.missiles = new Missiles(scene, fx);
    const ctx: WildCtx = { tele: this.tele, missiles: this.missiles };
    this.roamers = new Roamers(scene, fx, ctx, hooks);
    this.lairs = LAIRS.map((def) => new LairController(def, scene, fx, mats, ctx, hooks));
    // Nothing roams through a lair.
    for (const [x, z, r] of LAIR_CLEARINGS) this.roamers.avoid.push([x, z, r + 30]);
    this.interactables = this.lairs.map((l) => l.interactable);
  }

  /** Per simulation step. */
  update(dt: number, player: Player) {
    if (!this.visible) return;
    this.roamers.update(dt, player);
    for (const l of this.lairs) l.update(dt, player);
    this.missiles.update(dt, player);
    this.tele.update(dt);
  }

  /** Per rendered frame (Ulgra's blade hits are checked against the drawn pose). */
  present(alpha: number, dt: number, player: Player) {
    if (!this.visible) return;
    for (const l of this.lairs) l.present(alpha, dt, player);
  }

  /** Into an interior or a dungeon: everything out here is packed away. */
  setVisible(v: boolean) {
    this.visible = v;
    this.tele.setVisible(v);
    for (const l of this.lairs) l.setVisible(v);
    if (!v) {
      this.roamers.clear();
      this.missiles.clear();
      this.tele.clear();
    }
  }

  /** Turn the roaming spawns off or on (tests, cutscenes). */
  set enabled(v: boolean) {
    this.roamers.enabled = v;
  }
  get enabled() {
    return this.roamers.enabled;
  }

  /** Something out here is hunting you: no resting, no fast travel. */
  hostileAt(p: THREE.Vector3) {
    return this.roamers.hostileNear(p) || this.lairs.some((l) => l.engaged);
  }

  /** New game / load: drop everything that's spawned. */
  clear() {
    this.roamers.clear();
    for (const l of this.lairs) l.clear();
    this.missiles.clear();
    this.tele.clear();
  }

  /** Lairs the player has found (for the world map): name and where. */
  discoveredLairs() {
    return this.lairs.filter((l) => this.hooks.flags['wildsSeen:' + l.def.id]).map((l) => ({ id: l.def.id, name: l.def.place, boss: l.def.boss, x: l.def.at[0], z: l.def.at[1], slain: l.dead }));
  }

  /** What the wilds are like here (tests, the debug overlay). */
  probe(x: number, z: number) {
    const d = dangerAt(x, z);
    return { danger: +d.toFixed(3), band: DANGER_BANDS[dangerTier(d)].name, terrain: terrainAt(x, z) };
  }

  /** Everything alive out here (tests). */
  census() {
    return { roamers: this.roamers.census(), lairs: this.lairs.map((l) => l.status()), missiles: this.missiles.count };
  }
}
