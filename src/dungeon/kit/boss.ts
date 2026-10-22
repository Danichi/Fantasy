import * as THREE from 'three';
import type { Target } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { KitCtx } from './build';
import { DV, type KRoom } from './types';

// ---------------------------------------------------------------------------
// The boss template (docs/design/dungeons.md §3 "Bosses"). Every boss:
//   - an intro: step into the arena and its portcullis drops behind you, the
//     boss's name card comes up, its health bar appears;
//   - two or three phases, each crossing a share of its health (Grukk changes
//     at 60% and 25%), with new attacks and the arena used (adds from the
//     walls, the roof coming in, water rising);
//   - a tell before every big attack (the boss itself shows it);
//   - a death that opens the reward room and the shortcut home, pays its hoard
//     once (a lesser purse after), and is a great deed the first time.
// Dying resets the fight: the boss goes home at full strength, the arena opens.
// ---------------------------------------------------------------------------

/** What the template needs from the boss itself. */
export interface BossActor extends Target {
  name: string;
  readonly dead: boolean;
  readonly awake: boolean;
  update(dt: number, player: Player): void;
  present?(alpha: number, dt: number, player: Player): void;
  reset(at: THREE.Vector3, yaw: number): void;
  dispose(): void;
}

export interface BossDef {
  name: string;
  subtitle: string;
  /** enemyDied kind (and the deed id, 'boss:<kind>') */
  kind: string;
  /** health shares where the phases change, highest first */
  phases: number[];
  create(at: THREE.Vector3, yaw: number, fight: BossFight): Promise<BossActor>;
  /** the arena's set pieces (pillars, ledges, daises) */
  arena?(fight: BossFight): void;
  onIntro?(fight: BossFight): void;
  onPhase?(fight: BossFight, phase: number): void;
  update?(fight: BossFight, dt: number, player: Player): void;
  /** the arena's own ground (water rising) */
  groundAt?(fight: BossFight, x: number, z: number): number | null;
  onReset?(fight: BossFight): void;
  /** the hoard the first time, the purse after; returns the toast */
  loot(fight: BossFight, first: boolean, at: THREE.Vector3): string;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class BossFight {
  target: BossActor | null = null;
  phase = 0;
  started = false;
  readonly ready: Promise<void>;
  readonly home: { at: THREE.Vector3; yaw: number };
  /** per-boss state the def keeps (water level, adds...) */
  s: Record<string, any> = {};
  private downHandled = false;
  readonly arenaDoor: string | null;

  constructor(readonly c: KitCtx, readonly def: BossDef, readonly room: KRoom) {
    const door = c.fg.doors.find((d) => d.kind === 'arena' && (d.a === room.id || d.b === room.id));
    this.arenaDoor = door?.id ?? null;
    const ctr = c.centre(room);
    const doorPos = door ? c.edgePos(door.cell, door.dir) : ctr.clone().add(V(0, 0, 8));
    const into = ctr.clone().sub(doorPos).setY(0).normalize();
    const depth = room.rect.h * 4 * Math.abs(into.z) + room.rect.w * 4 * Math.abs(into.x);
    const at = ctr.clone().addScaledVector(into, depth * 0.2);
    this.home = { at, yaw: Math.atan2(-into.x, -into.z) };
    def.arena?.(this);
    this.ready = def.create(at.clone(), this.home.yaw, this).then((t) => {
      this.target = t;
    });
    void DV;
  }

  get alive() {
    return !!this.target?.alive;
  }

  groundAt(x: number, z: number) {
    return this.def.groundAt?.(this, x, z) ?? null;
  }

  update(dt: number, player: Player) {
    const t = this.target;
    const c = this.c;
    if (t) {
      t.update(dt, player);
      if (t.alive) {
        // The intro: you're inside and it has noticed you.
        if (!this.started && c.inst.room === this.room.id && !player.dead) {
          this.started = true;
          if (this.arenaDoor) c.inst.closeDoor(this.arenaDoor);
          c.hooks.card(this.def.name, this.def.subtitle);
          this.def.onIntro?.(this);
        }
        if (t.awake || this.started) c.hooks.bossBar(t, this.def.name);
        // Phases.
        const frac = t.hp / t.maxHp;
        while (this.phase < this.def.phases.length && frac <= this.def.phases[this.phase]) {
          this.phase++;
          this.def.onPhase?.(this, this.phase);
        }
      } else if (!this.downHandled) this.down(t);
      if (t.dead) {
        t.dispose();
        this.target = null;
      }
    }
    this.def.update?.(this, dt, player);
  }

  private down(t: BossActor) {
    this.downHandled = true;
    const c = this.c;
    const first = !c.progress.boss;
    c.progress.boss = true;
    if (this.arenaDoor) c.openDoor(this.arenaDoor, true);
    for (const d of c.fg.doors) if (d.kind === 'reward') c.openDoor(d.id, true);
    const msg = this.def.loot(this, first, t.center.clone());
    c.toast(msg);
    if (first) c.hooks.deed(`boss:${this.def.kind}`, 2, `Defeated ${this.def.name}`);
    c.hooks.onBoss?.(first);
    setTimeout(() => c.hooks.bossBar(null), 2500);
    c.inst.buildPortal();
    c.hooks.save();
  }

  /** The player died: the boss goes home at full strength, the arena opens. */
  reset() {
    if (!this.target?.alive) return;
    this.target.reset(this.home.at.clone(), this.home.yaw);
    this.phase = 0;
    this.started = false;
    if (this.arenaDoor) this.c.openDoor(this.arenaDoor, true);
    this.c.hooks.bossBar(null);
    this.def.onReset?.(this);
  }

  present(alpha: number, dt: number, player: Player) {
    this.target?.present?.(alpha, dt, player);
  }

  dispose() {
    this.target?.dispose();
    this.target = null;
  }
}
