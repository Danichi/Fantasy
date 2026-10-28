import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creature';
import { BatVisual, type BatPose } from './visual';
import { dampAngle } from '../../core/math';
import { ignoresPlayer } from '../../origins/stealth';
import { sfx } from '../../audio/sfx';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import { creatureView } from '../view';
import { noise3 } from '../kit/noise';

// Cave Bats come out at dusk. A colony hangs folded in its roost by day and
// bursts out if disturbed; at night they flit in loose, jinking flocks. When
// they find you they circle overhead and take turns diving to bite, then
// climb away. Each is frail, but hard to hit on the wing: swing as one dives,
// or parry the bite and knock it to the ground, where it flops, stunned.

const BASE: CreatureBase = { name: 'Cave Bat', hp: 20, damage: 7, radius: 0.24, halfHeight: 0.02 };
const SIZE = 2.4; // the model is a real bat; these are giants

type Mode = 'roost' | 'flutter' | 'harass' | 'dive' | 'climb' | 'grounded' | 'hurt';

const flock = new Set<Bat>();

export class Bat extends Creature {
  readonly look: BatVisual;
  private mode: Mode = 'flutter';
  private modeT = 0;
  private modeLen = 1;
  private angry = false;
  private diveCd = 2 + Math.random() * 3;
  private bit = false;
  private orbit = Math.random() * Math.PI * 2;
  private orbitDir = Math.random() < 0.5 ? 1 : -1;
  private seed = Math.random() * 100;
  private lastYaw = 0;
  private squeakT = 1 + Math.random() * 4;
  private age = 0;
  /** a roost spot (den bats hang there by day) */
  private perch: THREE.Vector3 | null = null;

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, opts: { perch?: THREE.Vector3 } = {}) {
    super('bat', BASE, level, at.clone().setY(at.y + 3), scene, fx);
    this.flying = true;
    this.minAltitude = 1.2;
    this.setGroundSnap(false);
    this.corpseTime = 5;
    this.look = new BatVisual({ scale: SIZE * (0.9 + Math.random() * 0.2) });
    scene.add(this.look.root);
    this.perch = opts.perch ?? null;
    if (this.perch && !creatureView.night) this.setMode('roost', 1e9);
    flock.add(this);
  }

  private setMode(m: Mode, len = 1) {
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;    if (m === 'dive') this.tell(0.55);
  }
  private volume(player: Player) {
    return Math.max(0, 0.35 * (1 - player.pos.distanceTo(this.position) / 30));
  }

  /** The whole flock nearby turns on you. */
  private alarm(player: Player) {
    for (const b of flock) {
      if (!b.alive || b.angry || b.position.distanceTo(this.position) > 18) continue;
      b.angry = true;
      if (b.mode === 'roost' || b.mode === 'flutter') b.setMode('harass', 1 + Math.random());
    }
    sfx.chitter(this.volume(player) + 0.1);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.diveCd -= dt;
    this.stunned = this.mode === 'grounded';
    this.flying = this.mode !== 'grounded';
    this.accel = 4;
    this.age += dt;
    const t = this.age + this.seed;
    const toP = player.center.clone().sub(this.center);
    const dist = Math.hypot(toP.x, toP.z);
    const ignored = player.dead || ignoresPlayer(this);
    const night = creatureView.night;
    if (this.angry && (ignored || dist > 34)) {
      this.angry = false;
      this.setMode(this.perch && !night ? 'roost' : 'flutter', 2);
    }
    this.squeakT -= dt;
    if (this.squeakT <= 0 && this.mode !== 'roost') {
      this.squeakT = 2 + Math.random() * 5;
      sfx.chitter(this.volume(player) * 0.6);
    }
    const g = this.groundAt(this.position.x, this.position.z);
    const fly = (target: THREE.Vector3, speed: number) => {
      const d = target.clone().sub(this.center);
      const len = d.length();
      if (len > 0.01) this.wish.copy(d).multiplyScalar(Math.min(speed, len * 3) / len);
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 6, dt);
    };

    switch (this.mode) {
      case 'roost': {
        this.wish.set(0, 0, 0);
        this.vel.set(0, 0, 0);
        if (this.perch) this.wish.copy(this.perch).sub(this.center).multiplyScalar(4);
        if (night || (!ignored && player.pos.distanceTo(this.position) < 9)) {
          this.setMode('flutter', 2);
          if (!night) this.alarm(player);
        }
        break;
      }
      case 'flutter': {
        // Loose loops around home, jinking on the noise.
        const a = t * 0.45 + this.seed;
        const home = this.perch ?? this.home;
        const target = home.clone().add(new THREE.Vector3(Math.cos(a) * 7 + (noise3(t * 0.7, this.seed, 0) - 0.5) * 6, 0, Math.sin(a * 1.3) * 7 + (noise3(0, t * 0.7, this.seed) - 0.5) * 6));
        target.y = this.groundAt(target.x, target.z) + 3.5 + Math.sin(t * 0.9 + this.seed) * 1.5;
        fly(target, 5);
        if (!ignored && player.pos.distanceTo(this.position) < (night ? 15 : 10)) this.alarm(player);
        if (this.perch && !night && this.modeT > 6) this.setMode('roost', 1e9);
        break;
      }
      case 'harass': {
        // Circle above you, each at its own height, waiting for a turn to dive.
        this.orbit += dt * this.orbitDir * (1.1 + Math.sin(t * 0.5) * 0.3);
        const r = 3.4 + Math.sin(t * 0.8 + this.seed) * 0.8;
        const target = player.center.clone().add(new THREE.Vector3(Math.cos(this.orbit) * r, 2.2 + Math.sin(t * 1.3 + this.seed) * 0.8, Math.sin(this.orbit) * r));
        target.y = Math.max(target.y, g + 2);
        fly(target, 7);
        const diving = [...flock].some((b) => b !== this && b.mode === 'dive' && b.position.distanceTo(this.position) < 20);
        if (this.diveCd <= 0 && !diving && dist < 9) {
          this.bit = false;
          this.setMode('dive', 1.4);
          sfx.chitter(this.volume(player) + 0.05);
        }
        break;
      }
      case 'dive': {
        // Straight at your head.
        const target = player.center.clone().setY(player.center.y + 0.35);
        fly(target, 9.5);
        this.accel = 7;
        if (!this.bit && this.center.distanceTo(target) < 0.85) {
          this.bit = true;
          player.receiveAttack({
            damage: this.damage, from: this.center.clone(), parryable: true, poise: 12,
            onParried: () => {
              // Knocked out of the air.
              this.vel.set(-toP.x, 0, -toP.z).normalize().multiplyScalar(3);
              this.stunned = true;
              this.setMode('grounded', 2.4);
            },
          });
          if (this.mode === 'dive') this.setMode('climb', 0.9);
        }
        if (this.mode === 'dive' && this.modeT > this.modeLen) this.setMode('climb', 0.7);
        break;
      }
      case 'climb': {
        const away = this.center.clone().sub(player.center).setY(0).normalize();
        fly(this.center.clone().addScaledVector(away, 5).setY(player.center.y + 3.5), 8);
        if (this.modeT > this.modeLen) {
          this.diveCd = 2.5 + Math.random() * 3;
          this.setMode('harass', 1);
        }
        break;
      }
      case 'grounded':
        this.wish.set(0, 0, 0);
        this.accel = 6;
        if (this.modeT > this.modeLen) {
          this.flying = true;
          this.vel.y = 3;
          this.setMode('climb', 0.8);
        }
        break;
      case 'hurt':
        this.wish.set(0, 1.5, 0);
        if (this.modeT > this.modeLen) this.setMode(this.angry ? 'climb' : 'flutter', 0.6);
        break;
    }
  }

  protected onHurt(h: HitInfo) {
    const player = creatureView.player;
    if (player && !this.angry) this.alarm(player);
    if (this.mode === 'grounded') return;
    this.vel.addScaledVector(h.dir, 3);
    this.setMode('hurt', 0.3);
    sfx.chitter(0.25);
  }

  protected onDeath() {
    flock.delete(this);
    sfx.chitter(0.3);
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.center);
    if (this.mode === 'roost' && this.alive) L.root.position.y -= 0.1;
    L.root.rotation.y = this.yaw;
    const turn = (((this.yaw - this.lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / Math.max(dt, 1e-3);
    this.lastYaw = this.yaw;
    const pose: BatPose = !this.alive
      ? 'dead'
      : this.mode === 'roost' ? 'hang'
      : this.mode === 'grounded' ? 'grounded'
      : this.mode === 'dive' ? 'dive'
      : this.vel.y < -1.5 && this.mode === 'flutter' ? 'glide'
      : 'fly';
    L.setPose(pose);
    L.flapRate = this.mode === 'climb' ? 7 : this.mode === 'harass' ? 6 : 5;
    L.jaw = this.mode === 'dive' ? 1 : Math.max(0, L.jaw - dt * 3);
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.center) : 10, creatureView.fur);
    L.update(dt, turn, this.vel.y);
    if (!this.alive && this.deadT > this.corpseTime - 1.2) L.root.position.y -= (this.deadT - (this.corpseTime - 1.2)) * 0.25;
  }

  protected disposeLook() {
    flock.delete(this);
    this.look.dispose();
  }
}
