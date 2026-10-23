import * as THREE from 'three';
import { events } from '../core/events';
import { heightAt } from '../world/terrainHeight';
import { zoneLevel } from '../creatures/population';
import { creatureReady, prepareCreature } from '../creatures/geometryStore';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// Field bosses: named beasts that keep a territory somewhere in Cresha. Each
// one is abroad only at its own times (Old Greyjaw hunts at night), is talked
// about in the towns, and is posted as a bounty at the Adventurer's Guild.
// Come close and it is named on your screen and marked on your map; fight it
// and it gets a bar of its own. Run far enough and it goes home to lick its
// wounds. Kill it and it drops something nobody else has (the first time),
// and a week later another takes its place.
//
// Lore: these beasts are bigger and meaner than anything natural because the
// Dark is leaking into the world as its old ruler dies (see
// docs/design/lore-dark-dimension.md). Some show it when hard pressed.

/** The body a boss fights with (a Creature, plus what the manager needs). */
export interface BossBody {
  readonly alive: boolean;
  readonly dead: boolean;
  hp: number;
  readonly maxHp: number;
  readonly label: string;
  readonly position: THREE.Vector3;
  readonly center: THREE.Vector3;
  /** fighting someone (not wandering, not gone home) */
  readonly engaged: boolean;
  /** 1, 2, 3 as it is worn down */
  readonly phase: number;
  update(dt: number, player: Player): void;
  /** Give up the chase: go home and heal. */
  leash(): void;
  /** Something you can do to it right now (lay a hand on the White Stag). */
  interact?(): { at: THREE.Vector3; label: string; act: () => void } | null;
  dispose(): void;
}

export interface BossDef {
  id: string;
  /** what the death event reports (bounties count this) */
  kind: string;
  name: string;
  /** one line, for the map and the bounty */
  title: string;
  /** its territory */
  home: { x: number; z: number; r: number };
  /** its lair (built once, when you first come near) and the clearing the trees leave for it */
  lair?: (at: THREE.Vector3, seed: number) => THREE.Object3D;
  clearing?: number;
  /** levels above the wild around it */
  levelBonus: number;
  /** creature looks to build before it can appear */
  looks: string[];
  /** out and about at this hour? */
  abroad(hour: number): boolean;
  /** only some days (a rare beast) */
  days?: (day: number) => boolean;
  /** a timed blessing it leaves you (each time) */
  blessing?: { id: string; label: string; sec: number; m: Record<string, number> };
  /** what later encounters say (default: dead again) */
  againText?: string;
  spawn(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX): BossBody;
  /** what townsfolk say while it lives */
  rumour: string;
  /** on first sight */
  found: string;
  /** when it changes phase (index 0: phase 2, 1: phase 3) */
  phaseLines?: [string, string];
  /** first kill: the unique drop, renown, and a line */
  unique: string;
  renown: number;
  /** the deed's words (default: Slew <name>) */
  deed?: string;
  slain: string;
  /** later kills */
  again: { items: [string, number][]; gold: [number, number] };
  bounty: { title: string; description: string; gold: number; xp: number; rep: number; minRank: number };
}

export interface BossState {
  /** seen with your own eyes */
  found?: boolean;
  /** heard of (a rumour or a bounty): marked roughly on the map */
  heard?: boolean;
  /** game day it last died */
  slain?: number;
  kills?: number;
}

interface Hooks {
  scene: THREE.Scene;
  fx: FX;
  toast: (m: string) => void;
  give: (id: string, n: number) => void;
  addGold: (n: number) => void;
  bossBar: (t: { hp: number; maxHp: number; alive: boolean } | null, name?: string) => void;
  outdoors: () => boolean;
  bless?: (b: { id: string; label: string; sec: number; m: Record<string, number> }) => void;
}

/** Days before a slain boss is replaced. */
export const RESPAWN_DAYS = 7;

interface Live {
  def: BossDef;
  body: BossBody;
  phase: number;
  counted: boolean;
}

export class FieldBosses {
  readonly defs: BossDef[] = [];
  state: Record<string, BossState> = {};
  private live = new Map<string, Live>();
  private lairs = new Map<string, THREE.Object3D>();
  /** this manager put the boss bar up */
  private barOwner: string | null = null;
  /** spawning switched off (tests turn it on when they want it) */
  enabled = true;
  private day = 0;

  constructor(private h: Hooks) {}

  add(def: BossDef) {
    this.defs.push(def);
  }

  st(id: string): BossState {
    return (this.state[id] ??= {});
  }

  /** The boss's body while it is in the world. */
  body(id: string) {
    return this.live.get(id)?.body ?? null;
  }

  /** Abroad and not slain this week. */
  available(id: string, day = this.day) {
    const s = this.st(id);
    return s.slain === undefined || day - s.slain >= RESPAWN_DAYS;
  }

  /** Put a boss in the world now (tests, debug). */
  spawnNow(id: string, at?: THREE.Vector3) {
    const def = this.defs.find((d) => d.id === id)!;
    this.despawn(id);
    const p = at ?? new THREE.Vector3(def.home.x, 0, def.home.z);
    p.y = heightAt(p.x, p.z);
    const level = zoneLevel(def.home.x, def.home.z, () => 0.5) + def.levelBonus;
    const body = def.spawn(p, level, this.h.scene, this.h.fx);
    this.live.set(id, { def, body, phase: 1, counted: false });
    return body;
  }

  private despawn(id: string) {
    const l = this.live.get(id);
    if (!l) return;
    l.body.dispose();
    this.live.delete(id);
    if (this.barOwner === id) {
      this.barOwner = null;
      this.h.bossBar(null);
    }
  }

  update(dt: number, player: Player, hour: number, day: number) {
    this.day = day;
    const p = player.pos;
    for (const def of this.defs) {
      const l = this.live.get(def.id);
      const toHome = Math.hypot(p.x - def.home.x, p.z - def.home.z);
      if (def.lair) {
        let lair = this.lairs.get(def.id);
        if (!lair && toHome < 280) {
          lair = def.lair(new THREE.Vector3(def.home.x, heightAt(def.home.x, def.home.z), def.home.z), def.id.length * 977 + 13);
          this.h.scene.add(lair);
          this.lairs.set(def.id, lair);
        }
        if (lair) lair.visible = toHome < 340;
      }
      const near = toHome < def.home.r + 160;
      if (!l) {
        if (!this.enabled || !near || !this.h.outdoors() || !def.abroad(hour) || !this.available(def.id, day) || (def.days && !def.days(day))) continue;
        if (!def.looks.every((k) => creatureReady(k))) {
          for (const k of def.looks) void prepareCreature(k);
          continue;
        }
        // Somewhere in its territory, out of sight if it can be.
        const a = Math.random() * Math.PI * 2, r = def.home.r * (0.3 + Math.random() * 0.5);
        this.spawnNow(def.id, new THREE.Vector3(def.home.x + Math.cos(a) * r, 0, def.home.z + Math.sin(a) * r));
        continue;
      }
      const b = l.body;
      b.update(dt, player);
      const dist = b.position.distanceTo(p);
      if (b.alive) {
        // First sight.
        const s = this.st(def.id);
        if (!s.found && dist < 45) {
          s.found = s.heard = true;
          this.h.toast(def.found);
          events.emit('bossFound', { id: def.id });
        }
        // Worn down: the next phase.
        if (b.phase !== l.phase) {
          l.phase = b.phase;
          const line = def.phaseLines?.[b.phase - 2];
          if (line) this.h.toast(line);
        }
        // Run far enough and it gives up the chase.
        if (b.engaged && toHome > def.home.r + 60) b.leash();
        // The bar while it fights you (and nothing else has the bar).
        const show = b.engaged && dist < 55;
        if (show) {
          this.barOwner = def.id;
          this.h.bossBar(b, def.name);
        } else if (this.barOwner === def.id) {
          this.barOwner = null;
          this.h.bossBar(null);
        }
        // Wandered out of range, or its hours are over and it isn't fighting.
        if ((!near && !b.engaged) || (!def.abroad(hour) && !b.engaged && dist > 70)) this.despawn(def.id);
      } else {
        if (!l.counted) {
          l.counted = true;
          this.slain(def);
        }
        // Gone, or a week has passed (sleeping it away): clear the body so another can come.
        if (b.dead) this.live.delete(def.id);
        else if (this.available(def.id, day)) this.despawn(def.id);
      }
    }
  }

  private slain(def: BossDef) {
    const s = this.st(def.id);
    const first = !s.kills;
    s.slain = this.day;
    s.kills = (s.kills ?? 0) + 1;
    s.found = s.heard = true;
    if (this.barOwner === def.id) {
      this.barOwner = null;
      this.h.bossBar(null);
    }
    if (first) {
      this.h.give(def.unique, 1);
      this.h.toast(def.slain);
      events.emit('deed', { id: 'boss:' + def.id, renown: def.renown, label: def.deed ?? `Slew ${def.name}` });
    } else {
      for (const [id, n] of def.again.items) this.h.give(id, n);
      const [lo, hi] = def.again.gold;
      const g = Math.round(lo + Math.random() * (hi - lo));
      this.h.addGold(g);
      this.h.toast(def.againText ?? `${def.name} is dead again. ${g} gold and a trophy.`);
    }
    if (def.blessing) this.h.bless?.(def.blessing);
    events.emit('bossSlain', { id: def.id, first });
  }

  /** Something to do to a boss you're standing by (main.ts makes it an interactable). */
  interaction(at: THREE.Vector3) {
    for (const l of this.live.values()) {
      const i = l.body.interact?.();
      if (i && i.at.distanceTo(at) < 3.5) return i;
    }
    return null;
  }

  /** Rumours for the townsfolk: live bosses not yet killed this week. */
  rumours(): string[] {
    const out: string[] = [];
    for (const d of this.defs) {
      const s = this.st(d.id);
      if (s.slain !== undefined && this.day - s.slain <= 2) out.push(`Is it true? They say you killed ${d.name}. The whole valley will sleep easier.`);
      else if (this.available(d.id) && !s.kills) out.push(d.rumour);
    }
    return out;
  }

  /** A rumour was told: the boss is now marked (roughly) on the map. */
  heard(text: string) {
    const d = this.defs.find((x) => x.rumour === text);
    if (d) this.st(d.id).heard = true;
  }
  /** Heard of it some other way (a bounty taken). */
  hear(id: string) {
    this.st(id).heard = true;
  }

  /** Map marks: found bosses at home, heard-of ones as a question, slain ones crossed out. */
  markers() {
    const out: { x: number; z: number; kind: 'boss' | 'bossRumour' | 'bossSlain'; label: string }[] = [];
    for (const d of this.defs) {
      const s = this.st(d.id);
      if (!s.heard && !s.found) continue;
      const slain = !this.available(d.id);
      out.push({ x: d.home.x, z: d.home.z, kind: slain ? 'bossSlain' : s.found ? 'boss' : 'bossRumour', label: slain ? `${d.name} (slain)` : s.found ? `${d.name}, ${d.title}` : `${d.name}? (rumoured)` });
    }
    return out;
  }

  /** Bounty notices for the guild board (bosses alive this week). */
  bounties() {
    return this.defs
      .filter((d) => this.available(d.id))
      .map((d) => ({
        id: 'bounty:' + d.id, bossId: d.id, title: d.bounty.title, description: d.bounty.description, objective: 'kill' as const,
        targetKind: d.kind, targetCount: 1, targetName: d.name, target: [d.home.x, d.home.z] as [number, number], radius: d.home.r,
        rewardGold: d.bounty.gold, rewardXp: d.bounty.xp, rewardRep: d.bounty.rep, minRank: d.bounty.minRank,
      }));
  }

  /** Everything in the world goes (realm change, tests). */
  clear() {
    for (const id of [...this.live.keys()]) this.despawn(id);
  }

  toJSON() {
    return { ...this.state };
  }
  fromJSON(s?: Record<string, BossState>) {
    this.state = structuredClone(s ?? {});
  }
}
