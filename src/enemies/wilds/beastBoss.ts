import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clamp } from '../../core/math';
import { events } from '../../core/events';
import { heightAt } from '../../world/terrainHeight';
import { targets, type HitInfo } from '../../combat/targets';
import { WildBeast, type WildCtx } from './wildBeast';
import { wildsSfx } from './wildsSfx';
import type { WildSpec, MoveId } from './wildSpecs';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// A great beast of the deep woods: one of the wild creature models grown to
// monstrous size, asleep in its lair until you come too close. It fights in
// phases (thresholds on its health): each phase has its own moves, and
// crossing into one makes it roar, call its kin, and fight harder. Its big
// moves are all marked on the ground first. Old Bristleback, Greymane the
// Wolf-Mother and Thornhorn the Antlered King are built on this.

export interface BeastBossDef {
  spec: WildSpec;
  /** card subtitle when it wakes */
  title: string;
  /** health fractions where the next phase begins, e.g. [0.66, 0.33] */
  phases: number[];
  /** move weights per phase (phase 0 first) */
  moves: Partial<Record<MoveId, number>>[];
  /** glow colour (eyes, antlers, the frenzy) */
  glow: number;
  /** how close you must come to wake it */
  wake: number;
  /** pounces chained back to back per phase */
  chain?: number[];
  /** charges chained back to back per phase */
  charges?: number[];
}

interface Runner {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  t: number;
  hit: boolean;
}

export class BeastBoss extends WildBeast {
  phase = 0;
  /** woken (fighting) */
  awake = false;
  onWake?: (b: BeastBoss) => void;
  onPhase?: (b: BeastBoss, phase: number) => void;
  /** a summon move: the lair sends its kin */
  onSummon?: (b: BeastBoss) => void;
  onDeath?: (b: BeastBoss) => void;
  private chainLeft = 0;
  private chargeLeft = 0;
  private runners: Runner[] = [];
  private pendingSummon = false;
  private spawnAt: THREE.Vector3;
  private spawnYaw: number;

  constructor(readonly def: BeastBossDef, at: THREE.Vector3, yaw: number, scene: THREE.Scene, fx: FX, ctx: WildCtx) {
    super(def.spec, at, scene, fx, ctx, { danger: 0, leash: 1e9 });
    this.kind = def.spec.id;
    this.name = def.spec.name;
    this.glowColor = new THREE.Color(def.glow);
    this.glowBase = 1.4;
    this.keepCorpse = true;
    this.spawnAt = at.clone();
    this.spawnYaw = yaw;
    this.yaw = yaw;
    this.state = 'dormant';
    this.lockable = false;
    targets.delete(this);
  }

  /** The phase thresholds (for notches on the boss bar). */
  get phaseMarks() {
    return this.def.phases;
  }

  protected decorate(model: THREE.Object3D) {
    // Antlers and horns glow along with the eyes.
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && /horn/i.test(m.name)) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!this.glowMats.includes(mat)) this.glowMats.push(mat);
      }
    });
  }

  wake() {
    if (this.awake || !this.alive) return;
    this.awake = true;
    this.alerted = true;
    this.lockable = true;
    targets.add(this);
    this.setState('roar');
    this.play('howl', 0.2);
    this.onWake?.(this);
  }

  takeHit(h: HitInfo) {
    if (!this.awake) this.wake();
    if (this.state === 'roar') {
      // Too big to flinch while it bellows; still takes the wound.
      this.hp -= h.damage;
      this.flash = 1;
      if (this.hp <= 0) this.die();
      return;
    }
    super.takeHit(h);
    this.checkPhase();
  }

  protected flinch(dir: THREE.Vector3) {
    // Bosses only stagger on a parry, a riposte or a lot of punishment.
    super.flinch(dir.clone().multiplyScalar(0.3));
    this.chainLeft = 0;
    this.chargeLeft = 0;
  }

  protected die() {
    super.die();
    for (const r of this.runners) this.scene.remove(r.obj);
    this.runners = [];
    this.onDeath?.(this);
  }

  private checkPhase() {
    if (!this.alive) return;
    const f = this.hp / this.maxHp;
    while (this.phase < this.def.phases.length && f < this.def.phases[this.phase]) {
      this.phase++;
      this.pendingSummon = true;
      if (this.phase === this.def.phases.length) this.enraged = 1e9;
      this.fx.add.spawn({ pos: this.center.clone(), spread: 4, count: 50, life: [0.5, 1.2], size: [0.2, 0.02], color: this.glowColor, color2: 0x200000, upBias: 1 });
      this.onPhase?.(this, this.phase);
    }
  }

  protected reachNow() {
    return this.spec.reach;
  }

  protected windupTime(m: MoveId) {
    const fast = this.phase >= 2 ? 0.8 : this.phase === 1 ? 0.9 : 1;
    const t: Partial<Record<MoveId, number>> = { bite: 0.42, gore: 0.55, kick: 0.4, pounce: 0.8, charge: 1.1, smash: 0.9, quake: 1.0, mudfling: 0.9, spirits: 1.35, nova: 1.1, summon: 0.2, quills: 0.8, howl: 0.2 };
    // A chained pounce comes faster than the first.
    const chained = (m === 'pounce' && this.chainLeft > 0) || (m === 'charge' && this.chargeLeft > 0) ? 0.6 : 1;
    return (t[m] ?? 0.8) * fast * chained;
  }

  protected chooseMove(dist: number, player: Player): MoveId | null {
    // Crossing into a phase: it calls its kin first.
    if (this.pendingSummon && this.def.moves[this.phase]?.summon !== undefined) {
      this.pendingSummon = false;
      return 'summon';
    }
    this.pendingSummon = false;
    const w = this.def.moves[Math.min(this.phase, this.def.moves.length - 1)];
    const reach = this.spec.reach;
    const ok = (m: MoveId) => {
      switch (m) {
        case 'bite': case 'gore': case 'smash': return dist < reach;
        case 'kick': return dist < reach && this.playerBehind(player);
        case 'pounce': return dist > 4 && dist < 15;
        case 'charge': return dist > 6 && dist < 26;
        case 'quake': return dist < 6.5;
        case 'mudfling': case 'quills': return dist > 4 && dist < 24;
        case 'spirits': return dist < 30;
        case 'nova': return dist < 12;
        case 'summon': return false;
        default: return true;
      }
    };
    const opts = (Object.entries(w) as [MoveId, number][]).filter(([m, v]) => v > 0 && ok(m));
    if (!opts.length) return null;
    let r = Math.random() * opts.reduce((a, [, v]) => a + v, 0);
    for (const [m, v] of opts) if ((r -= v) <= 0) return m;
    return opts[0][0];
  }

  protected startMove(m: MoveId, player: Player) {
    const p = this.position;
    const red = this.glowColor.getHex();
    if (m === 'pounce' && this.chainLeft <= 0) this.chainLeft = this.def.chain?.[this.phase] ?? 0;
    if (m === 'charge' && this.chargeLeft <= 0) this.chargeLeft = this.def.charges?.[this.phase] ?? 0;
    if (m === 'quake' || m === 'mudfling' || m === 'spirits' || m === 'nova' || m === 'summon') {
      this.move = m;
      this.setState('windup');
      const w = this.windupTime(m);
      if (m === 'quake') {
        this.mark = this.ctx.tele.circle(p.x, p.z, 7, w, red);
        this.play('leap', 0.1, 0.8);
      } else if (m === 'nova') {
        this.mark = this.ctx.tele.ring(p.x, p.z, 1.5, 11, w, 0x9aff5a);
        this.play('howl', 0.2);
      } else if (m === 'mudfling') {
        for (let k = 0; k < 3 + this.phase; k++) {
          const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
          if (k === 0) at.copy(player.pos);
          this.ctx.tele.circle(at.x, at.z, 2.2, w + 0.9, 0xc08040);
          this.flingAt.push(at);
        }
        this.play('gore', 0.1);
      } else if (m === 'spirits') {
        // Three lanes across the arena, one of them through you.
        this.lanes = [];
        const base = Math.random() * Math.PI * 2;
        for (let k = 0; k < 2 + this.phase; k++) {
          const a = base + (k / (2 + this.phase)) * Math.PI;
          const off = k === 0 ? 0 : (Math.random() - 0.5) * 8;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          const side = new THREE.Vector3(dir.z, 0, -dir.x);
          const from = player.pos.clone().addScaledVector(dir, -18).addScaledVector(side, off);
          this.ctx.tele.line(from.x, from.z, a, 36, 2.6, w, 0x9fe0ff, 0.6);
          this.lanes.push({ from, dir });
        }
        this.play('howl', 0.2);
        wildsSfx.chime(0, 0.5);
      } else {
        this.play('howl', 0.2);
      }
      return;
    }
    super.startMove(m, player);
  }

  private flingAt: THREE.Vector3[] = [];
  private lanes: { from: THREE.Vector3; dir: THREE.Vector3 }[] = [];

  protected updateWindup(dt: number, player: Player, dist: number) {
    const m = this.move!;
    if (m !== 'quake' && m !== 'mudfling' && m !== 'spirits' && m !== 'nova' && m !== 'summon') {
      super.updateWindup(dt, player, dist);
      return;
    }
    const w = this.windupTime(m);
    this.tell = Math.min(1, this.st / w);
    if (m === 'summon') {
      if (this.st < dt * 1.5) wildsSfx.howl(dist, (this.spec.pitch ?? 1) * 0.7, 0.8);
      if (Math.random() < dt * 25) this.fx.add.spawn({ pos: this.center.clone().setY(this.center.y + 1), vel: new THREE.Vector3(0, 3, 0), spread: 2, count: 1, life: [0.6, 1.2], size: [0.25, 0.02], color: this.glowColor, color2: 0x101010, upBias: 1 });
      if (this.st > 1.8) {
        this.onSummon?.(this);
        this.finish(0.4);
      }
      return;
    }
    if (m !== 'spirits') this.faceToward(player.pos, 4, dt);
    if (this.st < w) return;
    this.tell = 0;
    const p = this.position;
    if (m === 'quake') {
      // Up, and down: a ring of earth bursts outward.
      events.emit('bossSlam', { at: p.clone() });
      wildsSfx.charge(0, 0.3);
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const q = p.clone().add(new THREE.Vector3(Math.sin(a) * 4, 0, Math.cos(a) * 4));
        q.y = heightAt(q.x, q.z) + 0.2;
        this.fx.add.spawn({ pos: q, vel: new THREE.Vector3(Math.sin(a) * 6, 2, Math.cos(a) * 6), spread: 1.5, count: 2, life: [0.4, 0.8], size: [0.35, 0.1], color: 0x6a5440, color2: 0x2a2018, gravity: 6, alpha: 0.8 });
      }
      if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 7 && player.pos.y - heightAt(player.pos.x, player.pos.z) < 0.7) this.strike(player, this.damage * 1.25, false, 130, 8);
      this.finish(0.9);
    } else if (m === 'mudfling') {
      const from = this.center.clone().setY(this.center.y + 0.6);
      for (const at of this.flingAt) this.ctx.missiles.lob('mud', from, at.clone().setY(heightAt(at.x, at.z) + 0.3), 0.9, Math.round(this.damage * 0.9), { splash: 2.2 });
      this.flingAt = [];
      this.finish(0.7);
    } else if (m === 'spirits') {
      this.spawnRunners();
      this.finish(0.8);
    } else if (m === 'nova') {
      const from = this.center.clone();
      const n = 14 + this.phase * 4;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.1;
        this.ctx.missiles.shoot('thorn', from, new THREE.Vector3(Math.sin(a), -0.04, Math.cos(a)), 17, Math.round(this.damage * 0.75));
      }
      this.fx.add.spawn({ pos: from, spread: 5, count: 40, life: [0.3, 0.7], size: [0.16, 0.02], color: 0x9aff5a, color2: 0x204010 });
      this.finish(0.8);
    }
  }

  private finish(recover: number) {
    this.move = null;
    this.cooldown = recover;
    this.setState('recover');
  }

  /** Ghostly copies of itself galloping down the marked lanes. */
  private spawnRunners() {
    if (!this.gltf) return;
    const ghost = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 1.9), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const lane of this.lanes) {
      const obj = SkeletonUtils.clone(this.gltf.scene);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      obj.scale.multiplyScalar(2.2 / Math.max(0.01, box.max.y - box.min.y));
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = ghost;
          m.castShadow = false;
          m.frustumCulled = false;
        }
      });
      const holder = new THREE.Group();
      holder.add(obj);
      obj.rotation.y = Math.atan2(lane.dir.x, lane.dir.z) + this.spec.facing;
      this.scene.add(holder);
      let mixer: THREE.AnimationMixer | null = null;
      const run = this.gltf.animations.find((c) => /gallop$/i.test(c.name)) ?? this.gltf.animations.find((c) => /run/i.test(c.name));
      if (run) {
        mixer = new THREE.AnimationMixer(obj);
        mixer.clipAction(run).play();
      }
      this.runners.push({ obj: holder, mixer, from: lane.from.clone(), dir: lane.dir.clone(), len: 36, t: 0, hit: false });
    }
    this.lanes = [];
    wildsSfx.chime(0, 0.6);
  }

  private updateRunners(dt: number, player: Player) {
    for (const r of this.runners) {
      r.t += dt;
      const d = r.t * 17;
      const p = r.from.clone().addScaledVector(r.dir, d);
      p.y = heightAt(p.x, p.z);
      r.obj.position.copy(p);
      r.mixer?.update(dt * 1.6);
      if (Math.random() < dt * 30) this.fx.add.spawn({ pos: p.clone().setY(p.y + 1), spread: 0.6, count: 1, life: [0.4, 0.8], size: [0.2, 0.02], color: 0xcff4ff, color2: 0x3a7aff, upBias: 0.5 });
      if (!r.hit && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.6 && !player.dead) {
        r.hit = true;
        player.receiveAttack({ damage: Math.round(this.damage * 1.1), from: p.clone().addScaledVector(r.dir, -2), parryable: false, poise: 120 });
      }
      if (d > r.len) r.t = -1;
    }
    for (const r of this.runners.filter((r) => r.t < 0)) {
      this.scene.remove(r.obj);
      r.mixer?.stopAllAction();
    }
    this.runners = this.runners.filter((r) => r.t >= 0);
  }

  update(dt: number, player: Player) {
    this.updateRunners(dt, player);
    if (this.state === 'dormant') {
      this.mixer?.update(dt);
      this.play('idle', 0.3, 0.6);
      this.walk(dt, 0);
      this.paint(dt);
      const d = Math.hypot(player.pos.x - this.position.x, player.pos.z - this.position.z);
      if (!player.dead && d < this.def.wake) this.wake();
      return;
    }
    if (this.state === 'roar') {
      this.st += dt;
      this.mixer?.update(dt);
      this.faceToward(player.pos, 4, dt);
      if (Math.random() < dt * 30) this.fx.add.spawn({ pos: this.center.clone().setY(this.center.y + 0.5), vel: new THREE.Vector3(0, 2.5, 0), spread: 2, count: 1, life: [0.5, 1.1], size: [0.2, 0.02], color: this.glowColor, color2: 0x101010, upBias: 1 });
      if (this.st > 2.2) {
        this.cooldown = 0.5;
        this.setState('chase');
      }
      this.walk(dt, 0);
      this.paint(dt);
      return;
    }
    // Chained pounces and charges: straight into the next one.
    const was = this.state;
    super.update(dt, player);
    if (this.alive && was !== 'recover' && this.state === 'recover' && !this.stunned) {
      if (this.chainLeft > 0 && (this.move === 'pounce' || was === 'leap')) {
        this.chainLeft--;
        this.startMove('pounce', player);
      } else if (this.chargeLeft > 0 && (was === 'charge')) {
        this.chargeLeft--;
        this.startMove('charge', player);
      }
    }
    this.alerted = this.awake && this.alive;
  }

  /** The player fled or died: back to its lair, healed, asleep. */
  reset() {
    if (!this.alive) return;
    for (const r of this.runners) this.scene.remove(r.obj);
    this.runners = [];
    this.flingAt = [];
    this.lanes = [];
    this.resetTo(this.spawnAt);
    this.yaw = this.spawnYaw;
    this.phase = 0;
    this.chainLeft = this.chargeLeft = 0;
    this.awake = false;
    this.lockable = false;
    targets.delete(this);
    this.setState('dormant');
  }

  dispose() {
    for (const r of this.runners) this.scene.remove(r.obj);
    this.runners = [];
    super.dispose();
  }

  /** Is the body done falling (for the victory beat)? */
  get settled() {
    return !this.alive && this.deadT > 2.5;
  }

  /** Health fraction (0..1). */
  get frac() {
    return clamp(this.hp / this.maxHp, 0, 1);
  }
}
