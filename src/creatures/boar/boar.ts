import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creature';
import { BoarVisual, type BoarPose } from './visual';
import { dampAngle } from '../../core/math';
import { ignoresPlayer } from '../../origins/stealth';
import { sfx } from '../../audio/sfx';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import { creatureView } from '../view';

// The Wild Boar. Left alone it grazes and roots in the leaf litter. Come too
// close and it lifts its head, ears up, snorting. Keep coming (or strike it)
// and it paws the ground, then charges: a straight, heavy rush that bowls you
// over if it connects. Dodge aside and it overruns, skids and turns; parry
// the tusks at the last moment and it tumbles, dazed. Run it into a tree and
// it stuns itself. Up close it hooks with its tusks. Boars defend each other.

const BASE: CreatureBase = { name: 'Wild Boar', hp: 74, damage: 15, radius: 0.36, halfHeight: 0.28 };

type Mode = 'graze' | 'root' | 'alert' | 'paw' | 'charge' | 'skid' | 'circle' | 'gore' | 'hurt' | 'daze';

const all = new Set<Boar>();

export class Boar extends Creature {
  readonly look: BoarVisual;
  private mode: Mode = 'graze';
  private modeT = 0;
  private modeLen = 2;
  private angry = false;
  private target: THREE.Vector3 | null = null;
  private chargeHit = false;
  private passedT = -1;
  private committed = false;
  private goreCd = 0;
  private goreHit = false;
  private gruntT = 2 + Math.random() * 5;
  private dustT = 0;
  private size: number;

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, opts: { size?: number } = {}) {
    super('boar', BASE, level, at, scene, fx);
    this.size = opts.size ?? 1.0 + Math.min(0.3, level * 0.03) + Math.random() * 0.08;
    this.radius = BASE.radius * this.size;
    this.look = new BoarVisual({ scale: this.size });
    this.look.root.position.copy(at);
    this.look.root.rotation.y = this.yaw;
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
    this.setMode('graze', 1 + Math.random() * 3);
    all.add(this);
  }

  private setMode(m: Mode, len = 1) {
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
  }

  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Turn hostile (and rouse the rest of the sounder). */
  private enrage(player: Player, spread = true) {
    if (!this.angry) {
      this.angry = true;
      sfx.squeal(this.volume(player) * 0.8);
    }
    if (spread)
      for (const b of all)
        if (b !== this && b.alive && !b.angry && b.position.distanceTo(this.position) < 16) b.enrage(player, false);
    if (this.mode === 'graze' || this.mode === 'root' || this.mode === 'alert') this.setMode('paw', 0.55 + Math.random() * 0.3);
  }

  private volume(player: Player) {
    return Math.max(0, 0.5 * (1 - player.pos.distanceTo(this.position) / 35));
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.goreCd -= dt;
    const toP = player.pos.clone().sub(this.position).setY(0);
    const dist = toP.length();
    const faceP = Math.atan2(toP.x, toP.z);
    const ignored = player.dead || ignoresPlayer(this);
    const walk = 1.05 * this.size, trot = 2.6 * this.size, rush = 8.2 * this.size;
    this.wish.set(0, 0, 0);
    this.accel = 9;
    this.stunned = this.mode === 'daze';

    // Calm down if the player is gone or far away.
    if (this.angry && (ignored || dist > 34)) {
      this.angry = false;
      this.setMode('graze', 2);
    }

    switch (this.mode) {
      case 'graze':
      case 'root': {
        if (!ignored && dist < 15) {
          this.setMode('alert', 1.1 + Math.random() * 0.5);
          sfx.snort(this.volume(player));
          break;
        }
        if (this.mode === 'root') {
          this.dustT -= dt;
          if (this.dustT <= 0) {
            this.dustT = 0.5 + Math.random() * 0.6;
            this.fx.dust(this.snout(), 0.35);
          }
          if (this.modeT > this.modeLen) this.setMode('graze', 2 + Math.random() * 4);
          break;
        }
        // Amble between spots near home; stop to root now and then.
        if (!this.target) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
          this.target = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        const to = this.target.clone().sub(this.position).setY(0);
        if (to.length() < 0.7 || this.modeT > 14 || this.bumped) {
          this.target = null;
          if (Math.random() < 0.6) this.setMode('root', 3 + Math.random() * 5);
          else this.setMode('graze', 0);
        } else if (this.modeT > this.modeLen) {
          this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 2.5, dt);
          this.wish.copy(this.forward).multiplyScalar(walk);
        }
        this.gruntT -= dt;
        if (this.gruntT <= 0) {
          this.gruntT = 4 + Math.random() * 8;
          sfx.grunt(this.volume(player) * 0.7);
        }
        break;
      }
      case 'alert': {
        // Head up, ears forward, sniffing the air.
        this.yaw = dampAngle(this.yaw, faceP, 4, dt);
        if (ignored || dist > 19) this.setMode('graze', 1);
        else if (this.modeT > this.modeLen) {
          if (dist < 11) this.enrage(player);
          else this.setMode('alert', 0.8 + Math.random() * 0.6);
        }
        break;
      }
      case 'paw': {
        // Lowered head, scraping a forefoot: the tell before the rush.
        this.yaw = dampAngle(this.yaw, faceP, 7, dt);
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.18;
          this.fx.dust(this.foot(0), 0.4);
        }
        if (this.modeT > this.modeLen) {
          if (dist < 2.6) this.setMode('gore', 0.95);
          else {
            this.setMode('charge', 2.3);
            this.chargeHit = false;
            this.committed = false;
            this.passedT = -1;
            sfx.squeal(this.volume(player));
          }
        }
        break;
      }
      case 'charge': {
        // Steer hard at first, then barely, and not at all in the last few metres:
        // a well-timed sidestep leaves it running at nothing.
        if (dist < 3.4) this.committed = true;
        const turn = this.modeT < 0.5 ? 2.2 : 0.45;
        if (this.passedT < 0 && !this.committed) this.yaw = dampAngle(this.yaw, faceP, turn, dt);
        this.wish.copy(this.forward).multiplyScalar(rush * Math.min(1, 0.45 + this.modeT * 2.2));
        this.accel = 7;
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.09;
          this.fx.dust(this.foot(Math.random() < 0.5 ? 2 : 3), 0.3);
        }
        // Tusks into whatever is in front.
        const snout = this.snout();
        if (!this.chargeHit && player.pos.distanceTo(new THREE.Vector3(snout.x, player.pos.y, snout.z)) < 0.95 + this.radius && Math.abs(player.pos.y - this.position.y) < 1.6) {
          this.chargeHit = true;
          const res = player.receiveAttack({
            damage: this.damage * 1.6, from: this.position.clone(), parryable: true, poise: 95, knock: 7.5,
            onParried: () => this.tumble(2.6),
          });
          if (res === 'hit' || res === 'guardBroken') sfx.grunt(0.5);
        }
        // Ran past: overrun a little, then skid.
        if (this.passedT < 0 && (this.chargeHit || (this.committed && this.forward.dot(toP.clone().normalize()) < 0.2)) && dist > 1.2) this.passedT = this.modeT;
        if (this.mode !== 'charge') break;
        if (this.bumped && this.modeT > 0.3) {
          // Straight into a tree or a wall.
          this.fx.dust(this.snout(), 1.2);
          sfx.grunt(this.volume(player) + 0.2);
          this.tumble(1.8);
        } else if ((this.passedT >= 0 && this.modeT - this.passedT > 0.35) || this.modeT > this.modeLen) this.setMode('skid', 0.6);
        break;
      }
      case 'skid': {
        this.accel = 3.5;
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.08;
          this.fx.dust(this.foot(0), 0.5);
          this.fx.dust(this.foot(1), 0.5);
        }
        if (this.modeT > this.modeLen) this.setMode('circle', 0.9 + Math.random() * 1.1);
        break;
      }
      case 'circle': {
        // Wheel round to face the enemy, edging in.
        this.yaw = dampAngle(this.yaw, faceP, 5, dt);
        if (dist > 3) this.wish.copy(toP).normalize().multiplyScalar(trot * 0.5);
        if (dist < 2.5 && this.goreCd <= 0) this.setMode('gore', 0.95);
        else if (this.modeT > this.modeLen) {
          if (dist > 5) this.setMode('paw', 0.5 + Math.random() * 0.35);
          else if (this.goreCd <= 0) {
            // Close but not close enough: trot in for the hook.
            this.wish.copy(toP).normalize().multiplyScalar(trot);
            if (dist < 2.5) this.setMode('gore', 0.95);
          } else this.setMode('circle', 0.6);
        }
        break;
      }
      case 'gore': {
        const t = this.modeT;
        if (t < 0.28) this.yaw = dampAngle(this.yaw, faceP, 8, dt);
        if (t > 0.24 && t < 0.42) this.wish.copy(this.forward).multiplyScalar(3.2);
        if (t > 0.34 && !this.goreHit) {
          this.goreHit = true;
          const inFront = toP.clone().normalize().dot(this.forward) > 0.25;
          if (dist < 2.4 * this.size && inFront)
            player.receiveAttack({
              damage: this.damage, from: this.position.clone(), parryable: true, poise: 45, knock: 3,
              onParried: () => this.tumble(2.2),
            });
        }
        if (t > this.modeLen) {
          this.goreHit = false;
          this.goreCd = 1.4 + Math.random() * 0.8;
          this.setMode('circle', 0.6 + Math.random() * 0.8);
        }
        break;
      }
      case 'hurt':
        if (this.modeT > this.modeLen) this.setMode(this.angry ? 'circle' : 'alert', 0.5);
        break;
      case 'daze':
        if (this.modeT > this.modeLen) {
          this.stunned = false;
          this.setMode('circle', 0.8);
        }
        break;
    }
    if (this.mode === 'gore' && this.modeT === 0) this.goreHit = false;
  }

  /** Bowled over: stunned and wide open to a riposte. */
  private tumble(seconds: number) {
    this.stunned = true;
    this.vel.copy(this.forward).multiplyScalar(-3);
    this.setMode('daze', seconds);
    sfx.squeal(0.35);
  }

  protected onHurt(h: HitInfo) {
    const player = creatureView.player;
    if (player && !this.angry) this.enrage(player);
    if (this.mode === 'daze') return;
    // Heavy blows interrupt; a charge shrugs off light ones.
    if (h.crit || h.poise > (this.mode === 'charge' ? 70 : 28)) {
      this.setMode('hurt', 0.4);
      if (Math.random() < 0.5) sfx.squeal(0.3);
    }
  }

  protected onDeath() {
    sfx.squeal(0.45);
    all.delete(this);
  }

  private snout() {
    const s = this.size;
    return this.position.clone().addScaledVector(this.forward, 1.0 * s).setY(this.position.y + 0.5 * s);
  }
  private foot(i: number) {
    const f = this.look.gait.feet[i];
    return f ? f.pos.clone() : this.position.clone();
  }

  protected animate(dt: number, player: Player) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const pose: BoarPose = !this.alive
      ? 'dead'
      : this.mode === 'root' ? 'root'
      : this.mode === 'alert' ? 'alert'
      : this.mode === 'paw' || this.mode === 'charge' || this.mode === 'skid' ? 'charge'
      : this.mode === 'gore' ? 'gore'
      : this.mode === 'hurt' || this.mode === 'daze' ? 'hurt'
      : 'idle';
    L.setPose(pose);
    L.lookAt = this.alive && (this.mode === 'alert' || this.mode === 'circle' || this.mode === 'paw') ? player.center : null;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, creatureView.fur);
    L.update(dt, this.vel, this.groundAt);
    // Sink away once it has lain a while.
    if (!this.alive && this.deadT > this.corpseTime - 1.5) L.root.position.y -= (this.deadT - (this.corpseTime - 1.5)) * 0.4;
  }

  protected disposeLook() {
    all.delete(this);
    this.look.dispose();
  }
}
