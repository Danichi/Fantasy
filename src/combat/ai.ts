import * as THREE from 'three';
import { dampAngle, segmentPointDistance } from '../core/math';
import { combat, combatOf, type AttackKind } from './core';
import { targets, type HitInfo, type IncomingAttack, type Target } from './targets';
import type { Player } from '../player/player';

// Enemy brains (combat rework, phase 4).
//
//  - The director hands out attack tokens: only a couple of enemies swing at
//    the player at once (one more if the player turtles behind a shield); the
//    rest hold at their own distance, circle and look for the player's back.
//  - HumanoidBrain drives the people and the walking dead: spacing, strafing,
//    flanking, reading the player (dodging a wind-up, raising a shield,
//    punishing a heal, retaliating through a light combo), and a move list per
//    enemy with telegraphed wind-ups, combos, delayed swings, gap-closers,
//    unblockables and grabs. It learns: parry it often and it mixes in more
//    delays and unblockables.

// ---------------------------------------------------------------------------
// The director
// ---------------------------------------------------------------------------

class Director {
  private holders = new Map<Target, number>();
  /** seconds the player has held a guard up in a row */
  private turtle = 0;
  /** the player is healing or casting: open season */
  vulnerable = false;

  /** How many may swing at once. */
  get capacity() {
    return 2 + (this.turtle > 2 ? 1 : 0) + (this.vulnerable ? 1 : 0);
  }
  /** Ask to attack. Bosses and lone fighters always may. */
  request(t: Target, solo = false): boolean {
    if (!combat.canAct(t)) return false;
    if (this.holders.has(t)) return true;
    if (!solo && this.holders.size >= this.capacity) return false;
    this.holders.set(t, 5);
    return true;
  }
  holds(t: Target) {
    return this.holders.has(t);
  }
  release(t: Target) {
    this.holders.delete(t);
  }
  /** Others waiting their turn near the player (for spacing round the ring). */
  get busy() {
    return this.holders.size;
  }
  tick(dt: number, player: Player | null) {
    for (const [t, left] of this.holders) {
      if (!t.alive || left - dt <= 0 || !combat.canAct(t)) this.holders.delete(t);
      else this.holders.set(t, left - dt);
    }
    this.turtle = player?.blocking ? this.turtle + dt : 0;
    const id = player?.act?.def.id ?? '';
    this.vulnerable = !!player && (id === 'castHeal' || id === 'castFireball' || (player.act?.def.id.startsWith('cast') ?? false));
  }
}
export const director = new Director();

// ---------------------------------------------------------------------------
// Moves and archetypes
// ---------------------------------------------------------------------------

export interface MoveDef {
  id: string;
  /** clip to play, and its rate */
  clip: string;
  speed: number;
  /** blows, in clip seconds (a combo clip can hold several) */
  blows: [number, number][];
  /** clip seconds where the move is over (default: the last blow + 0.5) */
  end?: number;
  /** start it from this far (m, centre to centre); at least this close for gap-closers */
  reach: number;
  minRange?: number;
  /** cos of the blow's cone in front (default 0.2); sweep hits all round */
  arc?: number;
  sweep?: boolean;
  /** damage x the enemy's base, and stagger power */
  dmg: number;
  poise: number;
  /** how it can be answered: white parryable, gold heavy, red unblockable, yellow grab */
  kind?: AttackKind;
  /** forward speed (m/s) through the blow, and from how long before it */
  lunge?: number;
  lungeLead?: number;
  /** turn rate while winding up (damp factor), and whether it keeps turning into the blow */
  track?: number;
  /** freeze the wind-up this long at `holdAt` clip seconds: a delayed swing */
  hold?: number;
  holdAt?: number;
  /** super armour from the start through the last blow */
  armour?: boolean;
  /** shove (m/s) on the player when it lands */
  knock?: number;
  /** chained follow-ups and the chance to take one */
  next?: string[];
  nextChance?: number;
  /** pick weight (default 1) and seconds before it can be used again */
  weight?: number;
  cooldown?: number;
  /** procedural flourish the body adds (whole-body turns, a hop) */
  spin?: number;
  leap?: number;
}

export interface Archetype {
  name: 'grunt' | 'shield' | 'spear' | 'brute' | 'skirmisher' | 'archer';
  /** distance it holds at while waiting for its turn */
  hold: number;
  run: number;
  strafe: number;
  /** chance per decision to step in when it has a token */
  aggression: number;
  /** chance to dodge a player's wind-up in reach */
  evade: number;
  /** chance to raise a guard against a wind-up (only with a shield) */
  guard: number;
  /** chance to hit straight back through a blow that didn't stagger it */
  retaliate: number;
  /** wants to get behind the player */
  flank: boolean;
  /** seconds between attacks (min, spread) */
  rest: [number, number];
}

export const ARCHETYPES: Record<Archetype['name'], Archetype> = {
  grunt: { name: 'grunt', hold: 3.4, run: 3.8, strafe: 1.5, aggression: 0.75, evade: 0.12, guard: 0, retaliate: 0.25, flank: false, rest: [0.9, 0.9] },
  shield: { name: 'shield', hold: 3.0, run: 3.2, strafe: 1.3, aggression: 0.55, evade: 0.05, guard: 0.6, retaliate: 0.35, flank: false, rest: [1.1, 0.8] },
  spear: { name: 'spear', hold: 4.2, run: 3.6, strafe: 1.6, aggression: 0.7, evade: 0.25, guard: 0, retaliate: 0.2, flank: false, rest: [0.8, 0.8] },
  brute: { name: 'brute', hold: 3.8, run: 3.4, strafe: 1.1, aggression: 0.85, evade: 0, guard: 0, retaliate: 0.55, flank: false, rest: [1.2, 0.8] },
  skirmisher: { name: 'skirmisher', hold: 4.6, run: 4.6, strafe: 2.4, aggression: 0.65, evade: 0.55, guard: 0, retaliate: 0.3, flank: true, rest: [0.6, 0.7] },
  archer: { name: 'archer', hold: 11, run: 3.8, strafe: 1.9, aggression: 0.9, evade: 0.35, guard: 0, retaliate: 0, flank: false, rest: [1.6, 1] },
};

/** The body a brain moves (the enemy class keeps its own physics and look). */
export interface BrainBody extends Target {
  yaw: number;
  vel: THREE.Vector3;
  grounded: boolean;
}

export interface BrainHooks {
  /** a parried blow: reel (the class plays its hurt and sets stunned) */
  onParried(): void;
  /** clip length lookup (seconds), when known */
  duration?(clip: string): number;
  /** a blow landed (sound, sparks) */
  onBlow?(move: MoveDef, result: string): void;
  /** the enemy's own base damage per blow */
  damage(): number;
  /** a shield on its arm (guard needs one) */
  shield?: boolean;
  /** extra guard hook: the class shows its shield up */
  onGuard?(up: boolean): void;
}

export type BrainMode = 'approach' | 'hold' | 'attack' | 'evade' | 'guard' | 'broken';

const _v = new THREE.Vector3();

export class HumanoidBrain {
  mode: BrainMode = 'approach';
  move: MoveDef | null = null;
  /** clip seconds into the move */
  mt = 0;
  private held = 0;
  private blowDone: boolean[] = [];
  private cooldown = 0.6 + Math.random();
  private moveCd = new Map<string, number>();
  private orbit = Math.random() < 0.5 ? 1 : -1;
  private orbitT = 2 + Math.random() * 3;
  private modeT = 0;
  private evadeDir = new THREE.Vector3();
  /** parried this many times (it adapts) */
  parried = 0;
  /** the move's hop and spin right now (the class adds them to the look) */
  hop = 0;
  spin = 0;
  /** local strafe for the walk blend: -1 left .. 1 right, and backing off */
  strafe = 0;
  backing = false;
  private retaliateNext = false;
  /** the move it means to make once in range (holding an attack turn), and how long it has tried */
  private planned: MoveDef | null = null;
  private plannedT = 0;
  /** rest between attacks scales by this (sparring partners slow down) */
  paceK = 1;
  private lastPlayerAct: unknown = null;
  private readonly byId: Map<string, MoveDef>;

  constructor(
    readonly body: BrainBody,
    readonly arch: Archetype,
    readonly moves: MoveDef[],
    readonly hooks: BrainHooks,
  ) {
    this.byId = new Map(moves.map((m) => [m.id, m]));
  }

  /** Swap the move list (the drill yard's sparring partner throws only what the drill is about). */
  setMoves(list: MoveDef[]) {
    (this as { moves: MoveDef[] }).moves = list;
    this.byId.clear();
    for (const m of list) this.byId.set(m.id, m);
  }

  get guarding() {
    return this.mode === 'guard';
  }
  get attacking() {
    return this.mode === 'attack' && !!this.move;
  }

  /** The clip and clip time the class should show (null: locomotion). */
  get clip(): string | null {
    return this.mode === 'attack' && this.move ? this.move.clip : null;
  }

  /** A blow got through (the class calls this from takeHit). */
  onHurt(h: HitInfo) {
    if (h.react && h.react !== 'none') {
      this.interrupt();
      return;
    }
    if (this.mode !== 'attack' && Math.random() < this.arch.retaliate) this.retaliateNext = true;
  }

  /** Damage multiplier against a blow while the guard is up (1: not guarded). The class applies it. */
  guardFilter(h: HitInfo): number {
    if (this.mode !== 'guard' || !this.hooks.shield) return 1;
    const fwd = _v.set(Math.sin(this.body.yaw), 0, Math.cos(this.body.yaw));
    if (fwd.dot(h.dir) > -0.3) return 1; // from the side or behind
    if (h.guardBreak || h.type === 'blunt' && h.poise > 70) {
      // Battered aside: the guard drops and posture takes the rest.
      this.mode = 'hold';
      this.hooks.onGuard?.(false);
      combat.addPosture(this.body, combatOf(this.body).postureMax * 0.3);
      return 0.6;
    }
    combat.addPosture(this.body, h.poise * 0.5 + h.damage * 0.3);
    return 0.15;
  }

  /** Stop the swing (staggered, parried, broken). */
  interrupt() {
    if (this.move || this.planned) director.release(this.body);
    this.move = null;
    this.planned = null;
    this.mode = 'approach';
    this.hop = this.spin = 0;
    combat.release(this.body);
    this.cooldown = Math.max(this.cooldown, 0.5);
  }

  /** Choose a move: those that reach from here weigh most, but it can plan to close in for any. */
  private pick(dist: number): MoveDef | null {
    let total = 0;
    const ok: [MoveDef, number][] = [];
    const learnt = Math.min(3, this.parried);
    for (const m of this.moves) {
      if ((this.moveCd.get(m.id) ?? 0) > 0) continue;
      const inRange = dist <= m.reach + 0.3 && (!m.minRange || dist >= m.minRange);
      let w = (m.weight ?? 1) * (inRange ? 3 : 1);
      // Gap-closers only make sense from out of reach.
      if (m.minRange && dist < m.minRange) continue;
      // Parried a lot: favour delays and unblockables.
      if (learnt && (m.hold || m.kind === 'unblockable' || m.kind === 'grab')) w *= 1 + learnt * 0.8;
      // The player is behind or beside it: spinning sweeps.
      if (m.sweep) w *= 1.4;
      ok.push([m, w]);
      total += w;
    }
    if (!ok.length) return null;
    let r = Math.random() * total;
    for (const [m, w] of ok) if ((r -= w) <= 0) return m;
    return ok[ok.length - 1][0];
  }

  private start(m: MoveDef) {
    this.move = m;
    this.mt = 0;
    this.held = m.hold ?? 0;
    this.blowDone = m.blows.map(() => false);
    this.mode = 'attack';
    const firstBlow = m.blows[0][0] / m.speed + (m.hold ?? 0);
    combat.windup(this.body, firstBlow * 0.92, m.kind ?? 'normal', m.armour ? firstBlow + (m.blows[m.blows.length - 1][1] - m.blows[0][0]) / m.speed : 0);
  }

  private endOf(m: MoveDef) {
    return m.end ?? Math.min(this.hooks.duration?.(m.clip) ?? 99, m.blows[m.blows.length - 1][1] + 0.5);
  }

  /** One step: sets the body's velocity (x, z) and yaw. */
  update(dt: number, player: Player, solo = false) {
    const b = this.body;
    for (const [k, v] of this.moveCd) this.moveCd.set(k, v - dt);
    this.cooldown -= dt;
    this.modeT += dt;
    this.hop = this.spin = 0;
    if (!combat.canAct(b)) {
      if (this.move) this.interrupt();
      this.mode = 'broken';
      b.vel.x *= Math.exp(-8 * dt);
      b.vel.z *= Math.exp(-8 * dt);
      return;
    }
    if (this.mode === 'broken') this.mode = 'approach';
    const to = _v.copy(player.pos).sub(b.position).setY(0);
    const dist = to.length();
    const dir = dist > 1e-4 ? to.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
    const wantYaw = Math.atan2(dir.x, dir.z);
    const fwd = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw));
    this.strafe = 0;
    this.backing = false;

    // ---- a move in progress ----
    if (this.mode === 'attack' && this.move) {
      const m = this.move;
      const first = m.blows[0][0];
      if (this.held > 0 && this.mt >= (m.holdAt ?? first * 0.6)) {
        this.held -= dt; // frozen in the wind-up: the delayed swing
        b.yaw = dampAngle(b.yaw, wantYaw, m.track ?? 6, dt);
      } else this.mt += dt * m.speed;
      const t = this.mt;
      if (t < first) b.yaw = dampAngle(b.yaw, wantYaw, m.track ?? 8, dt);
      else if (t < first + 0.1) combat.release(b);
      // Lunge through the blow.
      const last = m.blows[m.blows.length - 1];
      const lead = m.lungeLead ?? 0.22;
      const lunging = m.lunge && t > first - lead && t < last[1] && dist > 1.1;
      const k = Math.exp(-14 * dt);
      const sp = lunging ? m.lunge! : 0;
      b.vel.x = b.vel.x * k + fwd.x * sp * (1 - k);
      b.vel.z = b.vel.z * k + fwd.z * sp * (1 - k);
      if (m.leap) this.hop = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - first * 0.4) / (first * 0.75))))) * m.leap;
      if (m.spin) this.spin = m.spin * Math.PI * 2 * THREE.MathUtils.smoothstep(t, first - 0.1, last[1] + 0.05);
      m.blows.forEach(([a, z], i) => {
        if (!this.blowDone[i] && t >= a && t <= z) {
          if (this.tryHit(m, player)) this.blowDone[i] = true;
        }
        if (t > z) this.blowDone[i] = true;
      });
      if (t >= this.endOf(m)) this.finishMove(m, dist);
      return;
    }

    // ---- reading the player ----
    const pa = player.act;
    const fresh = pa !== this.lastPlayerAct;
    this.lastPlayerAct = pa;
    const incoming = !!pa?.def.hit && pa.t < pa.def.hit.from && dist < 3.4;
    if (incoming && fresh && this.mode !== 'evade' && this.mode !== 'guard') {
      if (this.hooks.shield && Math.random() < this.arch.guard) {
        this.mode = 'guard';
        this.modeT = 0;
        this.hooks.onGuard?.(true);
      } else if (Math.random() < this.arch.evade) {
        this.mode = 'evade';
        this.modeT = 0;
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        this.evadeDir.copy(dir).multiplyScalar(-0.8).add(side.multiplyScalar(0.6)).normalize();
      }
    }
    if (this.mode === 'guard') {
      b.yaw = dampAngle(b.yaw, wantYaw, 10, dt);
      b.vel.x *= Math.exp(-10 * dt);
      b.vel.z *= Math.exp(-10 * dt);
      if (this.modeT > 1.1 || (!pa && this.modeT > 0.5)) {
        this.mode = 'hold';
        this.hooks.onGuard?.(false);
        // Shield down: straight into a counter if it can.
        if (Math.random() < this.arch.retaliate + 0.2) this.retaliateNext = true;
      }
      return;
    }
    if (this.mode === 'evade') {
      const k = Math.exp(-12 * dt);
      const sp = this.modeT < 0.32 ? 6.5 : 0;
      b.vel.x = b.vel.x * k + this.evadeDir.x * sp * (1 - k);
      b.vel.z = b.vel.z * k + this.evadeDir.z * sp * (1 - k);
      b.yaw = dampAngle(b.yaw, wantYaw, 9, dt);
      this.backing = true;
      if (this.modeT > 0.5) {
        this.mode = 'hold';
        if (Math.random() < 0.6) this.retaliateNext = true; // dodge, then punish
      }
      return;
    }

    // ---- choosing to attack ----
    b.yaw = dampAngle(b.yaw, wantYaw, 8, dt);
    if (player.dead) {
      b.vel.multiplyScalar(Math.exp(-6 * dt));
      return;
    }
    const wantsIn = this.retaliateNext || director.vulnerable || this.cooldown <= 0;
    if (!this.planned && wantsIn && (this.retaliateNext || Math.random() < this.arch.aggression * dt * 8 || director.vulnerable)) {
      const m = this.pick(dist);
      if (m && director.request(b, solo || this.retaliateNext)) {
        this.retaliateNext = false;
        this.planned = m;
        this.plannedT = 0;
      }
    }
    if (this.retaliateNext && this.modeT > 1.2) this.retaliateNext = false;
    // A move planned: close to its range, then make it.
    if (this.planned) {
      const m = this.planned;
      this.plannedT += dt;
      if (dist <= m.reach + 0.2 && (!m.minRange || dist >= m.minRange)) {
        this.planned = null;
        this.start(m);
        return;
      }
      if (this.plannedT > 3.5) {
        // Couldn't get there: give the turn back.
        this.planned = null;
        director.release(b);
        this.cooldown = 0.6;
      } else {
        const want = new THREE.Vector3().copy(dir).multiplyScalar(dist > m.reach ? this.arch.run : m.minRange && dist < m.minRange ? -this.arch.run * 0.6 : 0);
        this.mode = 'approach';
        const k = Math.exp(-8 * dt);
        b.vel.x = b.vel.x * k + want.x * (1 - k);
        b.vel.z = b.vel.z * k + want.z * (1 - k);
        this.backing = want.dot(dir) < 0;
        return;
      }
    }

    // ---- positioning: close in, hold at its distance, circle, flank ----
    const myTurn = director.holds(b) || solo;
    const reachMax = Math.max(...this.moves.map((m) => m.reach));
    const holdAt = myTurn || this.cooldown <= 0 ? Math.min(this.arch.hold, reachMax * 0.8) : this.arch.hold;
    let want = new THREE.Vector3();
    if (dist > holdAt + 0.6) {
      want.copy(dir).multiplyScalar(dist > holdAt + 5 ? this.arch.run : this.arch.run * 0.7);
      this.mode = 'approach';
    } else {
      this.mode = 'hold';
      // Circle at its distance; switch direction now and then.
      this.orbitT -= dt;
      if (this.orbitT <= 0) {
        this.orbitT = 1.5 + Math.random() * 3;
        if (Math.random() < 0.4) this.orbit = -this.orbit;
      }
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.orbit);
      // Flankers circle toward the player's back.
      if (this.arch.flank) {
        const pf = player.forward;
        const cross = pf.x * -dir.z - pf.z * -dir.x;
        if (pf.dot(dir) < 0.3) this.orbit = cross > 0 ? 1 : -1;
      }
      want.copy(side).multiplyScalar(this.arch.strafe);
      const err = dist - holdAt;
      want.addScaledVector(dir, THREE.MathUtils.clamp(err * 1.8, -this.arch.run * 0.6, this.arch.run * 0.6));
      this.strafe = this.orbit;
      this.backing = err < -0.3;
    }
    // Keep apart from other fighters.
    for (const o of targets) {
      if (o === b || !o.alive) continue;
      const dx = b.position.x - o.position.x, dz = b.position.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.4 && d2 > 1e-5) {
        const d = Math.sqrt(d2), push = (1.55 - d) * 2.4;
        want.x += (dx / d) * push;
        want.z += (dz / d) * push;
      }
    }
    const k = Math.exp(-8 * dt);
    b.vel.x = b.vel.x * k + want.x * (1 - k);
    b.vel.z = b.vel.z * k + want.z * (1 - k);
  }

  private finishMove(m: MoveDef, dist: number) {
    this.moveCd.set(m.id, m.cooldown ?? 0);
    // Chain into a follow-up while the player is still in reach.
    const nx = m.next?.length && Math.random() < (m.nextChance ?? 0.5) ? this.byId.get(m.next[Math.floor(Math.random() * m.next.length)]) : undefined;
    if (nx && dist < nx.reach + 0.4 && combat.canAct(this.body)) {
      this.start(nx);
      return;
    }
    director.release(this.body);
    this.move = null;
    this.mode = 'hold';
    this.modeT = 0;
    this.cooldown = (this.arch.rest[0] + Math.random() * this.arch.rest[1]) * this.paceK;
  }

  /** Does the blow reach the player? If so, deliver it. */
  private tryHit(m: MoveDef, player: Player): boolean {
    const b = this.body;
    if (player.dead) return false;
    const fwd = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw));
    const to = player.pos.clone().sub(b.position).setY(0);
    const d = to.length();
    const reach = Math.min(m.reach, 2.6) + 0.35;
    if (d > reach) return false;
    if (!m.sweep && d > 0.5 && to.normalize().dot(fwd) < (m.arc ?? 0.2)) return false;
    const a = player.pos.clone().setY(player.pos.y + 0.3), c = player.pos.clone().setY(player.pos.y + 1.6);
    if (segmentPointDistance(a, c, b.center) > reach + 0.6) return false;
    const kind = m.kind ?? 'normal';
    const att: IncomingAttack = {
      damage: this.hooks.damage() * m.dmg,
      from: b.position.clone(),
      parryable: kind === 'normal' || kind === 'heavy',
      poise: m.poise,
      kind,
      attacker: b,
      knock: m.knock,
      onParried: () => {
        this.parried++;
        this.interrupt();
        this.hooks.onParried();
      },
    };
    const res = player.receiveAttack(att);
    this.hooks.onBlow?.(m, res);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Move lists
// ---------------------------------------------------------------------------

/** The hero's Mixamo clips (the walking dead and the orcs are skinned to the hero's rig). */
export const HERO_CLIP_MOVES: Record<string, MoveDef> = {
  cut: { id: 'cut', clip: 'attack_light_1', speed: 1.1, blows: [[0.5, 0.72]], reach: 2.2, dmg: 1, poise: 28, lunge: 2.2, next: ['cut2'], nextChance: 0.45 },
  cut2: { id: 'cut2', clip: 'attack_light_2', speed: 1.05, blows: [[0.34, 0.54]], reach: 2.2, dmg: 0.9, poise: 24, lunge: 1.8, next: ['cut3'], nextChance: 0.35, weight: 0.6 },
  cut3: { id: 'cut3', clip: 'attack_light_3', speed: 1.05, blows: [[0.72, 0.95]], reach: 2.3, dmg: 1.25, poise: 40, lunge: 2.4, weight: 0.4 },
  overhead: { id: 'overhead', clip: 'attack_heavy', speed: 0.95, blows: [[0.55, 0.95]], reach: 2.4, dmg: 1.6, poise: 62, kind: 'heavy', armour: true, lunge: 2.6, weight: 0.6, cooldown: 3 },
  delayed: { id: 'delayed', clip: 'attack_heavy', speed: 1.0, blows: [[0.55, 0.95]], reach: 2.4, dmg: 1.3, poise: 45, hold: 0.5, holdAt: 0.42, lunge: 2.4, weight: 0.4, cooldown: 4 },
  lunge: { id: 'lunge', clip: 'attack_sprint', speed: 1.0, blows: [[0.45, 0.75]], reach: 5, minRange: 2.8, dmg: 1.2, poise: 36, lunge: 6.5, lungeLead: 0.4, weight: 1.2, cooldown: 3 },
  kick: { id: 'kick', clip: 'kick', speed: 1.1, blows: [[0.42, 0.62]], reach: 1.9, dmg: 0.5, poise: 60, knock: 5, lunge: 1.2, weight: 0.5, cooldown: 4 },
  leapSlam: { id: 'leapSlam', clip: 'attack_leap', speed: 1.05, blows: [[1.05, 1.35]], reach: 6, minRange: 2.6, dmg: 1.9, poise: 90, kind: 'unblockable', armour: true, lunge: 5.5, lungeLead: 0.7, knock: 4, weight: 0.7, cooldown: 7, arc: -0.2 },
  spin: { id: 'spin', clip: 'skill_spin', speed: 1.1, blows: [[0.7, 1.0], [1.1, 1.4]], reach: 2.5, dmg: 1.1, poise: 45, kind: 'heavy', sweep: true, armour: true, weight: 0.5, cooldown: 6 },
  grab: { id: 'grab', clip: 'attack_heavy', speed: 0.85, blows: [[0.55, 0.85]], reach: 2.1, dmg: 1.5, poise: 0, kind: 'grab', lunge: 3, weight: 0.5, cooldown: 6 },
};

const pickMoves = (ids: string[], tweak: Record<string, Partial<MoveDef>> = {}) => ids.map((id) => ({ ...HERO_CLIP_MOVES[id], ...tweak[id] }));

export const MOVESETS = {
  /** a skeleton warrior: sword and shield, quick strings, shield kicks, a delayed overhead */
  skeleton: pickMoves(['cut', 'cut2', 'cut3', 'overhead', 'delayed', 'lunge', 'kick']),
  /** a zombie: slow clawing swings, a lurch and a grab */
  zombie: pickMoves(['cut', 'cut2', 'lunge', 'grab'], {
    cut: { speed: 0.85, lunge: 1.4, next: ['cut2'], nextChance: 0.5 },
    cut2: { speed: 0.8, lunge: 1.2, next: [] },
    lunge: { speed: 0.8, lunge: 4.5, reach: 3.8, minRange: 2.3 },
    grab: { weight: 0.8, cooldown: 5 },
  }),
  /** an orc warrior: heavy chops, a leaping slam, a whirl, a kick */
  orc: pickMoves(['cut', 'cut2', 'cut3', 'overhead', 'leapSlam', 'spin', 'kick', 'grab'], {
    cut: { dmg: 1.1, poise: 34 },
    overhead: { weight: 0.8 },
  }),
};

/** UAL clips (people built with the character kit: bandits, raiders). Two swings, held and retimed into a set. */
export const UAL_MOVES: MoveDef[] = [
  { id: 'cut', clip: 'sword_attack', speed: 1.15, blows: [[0.52, 0.72]], end: 1.2, reach: 2.2, dmg: 1, poise: 26, lunge: 3, next: ['flurry', 'cut'], nextChance: 0.35 },
  { id: 'flurry', clip: 'sword_combo', speed: 1.1, blows: [[0.45, 0.62], [1.05, 1.25], [1.9, 2.15]], end: 2.5, reach: 2.2, dmg: 0.75, poise: 20, lunge: 2.2, weight: 0.8, cooldown: 4 },
  { id: 'lunge', clip: 'sword_attack', speed: 1.25, blows: [[0.52, 0.72]], end: 1.1, reach: 5, minRange: 2.8, dmg: 1.2, poise: 34, lunge: 7, lungeLead: 0.45, weight: 1, cooldown: 3 },
  { id: 'delayed', clip: 'sword_attack', speed: 1.1, blows: [[0.52, 0.72]], end: 1.2, reach: 2.3, dmg: 1.25, poise: 34, hold: 0.55, holdAt: 0.36, lunge: 3, weight: 0.5, cooldown: 4 },
  { id: 'cleave', clip: 'sword_attack', speed: 0.8, blows: [[0.52, 0.76]], end: 1.3, reach: 2.6, dmg: 1.8, poise: 70, kind: 'unblockable', armour: true, lunge: 3.5, leap: 0.35, weight: 0.45, cooldown: 7 },
  { id: 'whirl', clip: 'sword_attack', speed: 0.95, blows: [[0.5, 0.8]], end: 1.25, reach: 2.4, dmg: 1.1, poise: 40, kind: 'heavy', sweep: true, spin: 1, armour: true, weight: 0.4, cooldown: 6 },
];
