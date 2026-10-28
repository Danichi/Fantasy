import { combat, type AttackKind } from '../combat/core';
import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { DelverVisual, type DelverPose } from '../creatures/delver/visual';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody } from './fieldBosses';

// The Delver of the Abandoned Mine (a discovery boss, docs/design/sites.md):
// a blind burrowing beast the size of a cart that dug into the old workings
// and ate the miners' luck. It hunts by feel: it hears your footsteps.
//
//   - It lives under the ground. Buried, it can't be hurt; a ridge of heaving
//     earth tracks you. Stand still (or walk, not run) and it loses you;
//     sprint and it comes up right under you: the ground bulges (the tell),
//     then it bursts out and throws you.
//   - Up, it rakes with its spade arms (one at a time, parryable), and rears
//     and slams both arms down (can't be parried; the ground shakes round it).
//   - After a slam its claws are stuck in the earth for a moment: hit it then.
//   - Then it dives again. Worn down it stays up less and comes up faster;
//     near the end the crystals in its back go violet.

const BASE: CreatureBase = { name: 'The Delver', hp: 950, damage: 34, radius: 1.1, halfHeight: 0.4 };
const SCALE = 1;

type Mode = 'lurk' | 'under' | 'bulge' | 'burst' | 'stalk' | 'rake' | 'rear' | 'slam' | 'stuck' | 'dive' | 'reel' | 'home';

export class Delver extends Creature implements BossBody {
  readonly look: DelverVisual;
  mode: Mode = 'lurk';
  phase = 1;
  private modeT = 0;
  private modeLen = 1;
  private struck = false;
  private rakeCd = 0.8;
  private slamCd = 5;
  private upT = 0;
  private foeOn = false;
  private spoke = false;
  /** where it will come up */
  private target = new THREE.Vector3();
  /** what it can hear of you (0..1, from how fast you move) */
  private heard = 0;
  private lastPlayer = new THREE.Vector3();
  readonly den: THREE.Vector3;
  stats = { bursts: 0, burstHits: 0, rakes: 0, parried: 0, slams: 0, stuckHits: 0, dives: 0, buriedHits: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX) {
    super('delver', BASE, level, at, scene, fx);
    this.corpseTime = 60;
    this.den = at.clone();
    this.look = new DelverVisual({ scale: SCALE });
    this.look.root.position.copy(at);
    this.look.root.visible = false;
    scene.add(this.look.root);
    this.lockable = false;
  }

  get engaged() {
    return this.alive && this.mode !== 'lurk' && this.mode !== 'home';
  }
  /** Under the ground: can't be hurt or targeted. */
  get buried() {
    return this.mode === 'lurk' || this.mode === 'under' || this.mode === 'bulge' || (this.mode === 'dive' && this.modeT > 0.8);
  }

  leash() {
    if (this.mode === 'home' || this.mode === 'lurk') return;
    this.foeOn = false;
    this.setMode('home', 999);
  }

  /** You broke into its gallery: it comes for you. */
  rouse(at?: THREE.Vector3) {
    if (!this.alive || this.mode !== 'lurk') return;
    this.foeOn = true;
    if (at) this.target.copy(at);
    this.setMode('under', 2.5);
    sfx.rumble(2, 0.8);
  }

  private setMode(m: Mode, len = 1) {
    // Its tell (combat/core.ts): the colour says how to answer it; a blow now is a counter-hit.
    const tell = ({ bulge: ['unblockable', 0.2, 0], rear: ['heavy', 0.15, 1.0], rake: ['normal', 0, 0] } as Partial<Record<Mode, [AttackKind, number, number]>>)[m];
    if (tell) combat.windup(this, len + tell[1], tell[0], tell[2] ? len + tell[2] : 0);
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
    this.struck = false;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private vol(k = 0.6) {
    const c = creatureView.camera;
    return c ? Math.max(0.05, k * (1 - c.distanceTo(this.position) / 60)) : 0.3;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    if (this.buried) {
      this.stats.buriedHits++;
      return;
    }
    let dmg = h.damage;
    if (this.mode === 'stuck') {
      dmg *= 1.6;
      this.stats.stuckHits++;
    }
    this.hp -= dmg;
    if (!this.foeOn) this.foeOn = true;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private dirt(at: THREE.Vector3, n: number, spread: number, up = 1.4) {
    this.fx.add.spawn({ pos: at.clone().setY(heightAt(at.x, at.z) + 0.2), spread, count: n, life: [0.5, 1.1], size: [0.18, 0.04], color: 0x5a4a38, color2: 0x2a2018, gravity: 9, upBias: up });
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.rakeCd -= dt;
    this.slamCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 5;
    this.stunned = this.mode === 'reel' || this.mode === 'stuck';
    this.lockable = !this.buried && this.alive;
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) this.look.dark(1);
    }
    // It hears you by your footfalls: running is loud, walking is quiet, still is silent.
    const moved = player.pos.distanceTo(this.lastPlayer) / Math.max(dt, 1e-3);
    this.lastPlayer.copy(player.pos);
    const loud = player.dead ? 0 : moved > 5.5 ? 1 : moved > 2.2 ? 0.35 : 0;
    this.heard += (loud - this.heard) * Math.min(1, dt * 3);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    const quick = this.phase === 3 ? 1.35 : this.phase === 2 ? 1.15 : 1;
    if (this.foeOn && (player.dead || player.pos.distanceTo(this.den) > 80)) {
      this.foeOn = false;
      this.setMode('home', 999);
    }
    switch (this.mode) {
      case 'lurk':
        break;
      case 'under': {
        // A ridge of heaving earth hunts you by sound.
        if (this.heard > 0.25) this.target.copy(player.pos);
        const d = this.target.clone().sub(this.position).setY(0);
        if (d.length() > 1) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 3, dt);
          this.wish.copy(d.normalize()).multiplyScalar((this.heard > 0.6 ? 7 : 4.5) * quick);
        }
        if (Math.random() < dt * 10) this.dirt(this.position, 2, 0.8, 0.8);
        if (Math.random() < dt * 1.5) sfx.rumble(0.6, this.vol(0.5));
        // Close under a loud step (or it's been down long enough): up it comes.
        const under = this.position.distanceTo(player.pos) < 2.5;
        if (this.modeT > this.modeLen && ((under && this.heard > 0.2) || this.modeT > 9 / quick)) {
          this.setMode('bulge', 0.9 / quick);
          this.target.copy(this.heard > 0.2 ? player.pos : this.position);
        }
        break;
      }
      case 'bulge':
        // The ground bulges and cracks: get off it.
        if (Math.random() < dt * 30) this.dirt(this.target, 3, 1.2, 1.2);
        if (this.modeT > this.modeLen) {
          this.teleport(new THREE.Vector3(this.target.x, heightAt(this.target.x, this.target.z), this.target.z));
          this.yaw = face;
          this.setMode('burst', 1.3);
          this.stats.bursts++;
          sfx.roar(this.vol(1));
        }
        break;
      case 'burst':
        if (!this.struck) {
          this.struck = true;
          this.dirt(this.position, 40, 2.5, 2.2);
          if (dist < 2.8) {
            this.stats.burstHits++;
            playerFoe(player).strike({ damage: this.damage * 1.2, from: this.position.clone(), parryable: false, poise: 90, knock: 9 });
          }
        }
        if (this.modeT > this.modeLen) {
          this.upT = 0;
          this.setMode('stalk', 0.4);
        }
        break;
      case 'stalk':
        this.upT += dt;
        this.yaw = dampAngle(this.yaw, face, 2.4, dt);
        if (dist > 3.6) this.wish.copy(to).normalize().multiplyScalar((dist > 10 ? 4 : 2.5) * quick);
        if (this.modeT < this.modeLen) break;
        if (this.upT > (this.phase === 3 ? 9 : 13) || dist > 18) {
          this.setMode('dive', 1.6);
          this.stats.dives++;
        } else if (this.slamCd <= 0 && dist < 5.5) {
          this.setMode('rear', 0.9 / quick);
          sfx.roar(this.vol(0.9));
        } else if (this.rakeCd <= 0 && dist < 4.6) {
          this.setMode('rake', 1.2 / quick);
        }
        break;
      case 'rake':
        this.yaw = dampAngle(this.yaw, face, 2, dt);
        if (!this.struck && this.modeT > 0.45 / quick) {
          this.struck = true;
          this.stats.rakes++;
          const reach = this.position.clone().addScaledVector(this.forward, 2.4);
          if (reach.distanceTo(player.pos) < 2.6) {
            playerFoe(player).strike({
              damage: this.damage, from: this.position.clone(), parryable: true, poise: 55, knock: 4,
              onParried: () => {
                this.stats.parried++;
                this.setMode('reel', 1.5);
              },
            });
          }
        }
        if (this.mode === 'rake' && this.modeT > this.modeLen) {
          this.rakeCd = (this.phase === 3 ? 0.6 : 1.1) + Math.random() * 0.7;
          this.setMode('stalk', 0.2);
        }
        break;
      case 'rear':
        // Up on its hind legs, arms high: the slam is coming.
        this.yaw = dampAngle(this.yaw, face, 1.6, dt);
        if (this.modeT > this.modeLen) this.setMode('slam', 0.5);
        break;
      case 'slam':
        if (!this.struck && this.modeT > 0.2) {
          this.struck = true;
          this.stats.slams++;
          const at = this.position.clone().addScaledVector(this.forward, 2.2);
          this.dirt(at, 36, 3, 1.6);
          sfx.rumble(0.8, this.vol(1));
          // The ground shakes round it: close in front is worst.
          const d = at.distanceTo(player.pos);
          if (d < 4.5) playerFoe(player).strike({ damage: this.damage * (d < 2.2 ? 1.5 : 0.8), from: at, parryable: false, poise: 80, knock: 7 });
        }
        if (this.modeT > this.modeLen) this.setMode('stuck', this.phase === 3 ? 1.4 : 2.0);
        break;
      case 'stuck':
        // Its claws are in the earth up to the wrist: hit it now.
        if (this.modeT > this.modeLen) {
          this.slamCd = 6 + Math.random() * 3;
          this.setMode('stalk', 0.3);
        }
        break;
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.3);
        break;
      case 'dive':
        if (Math.random() < dt * 25) this.dirt(this.position, 3, 1.4, 1.4);
        if (this.modeT > this.modeLen) {
          this.target.copy(player.pos);
          this.setMode('under', 1.5);
        }
        break;
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 2) this.wish.copy(d.normalize()).multiplyScalar(4);
        else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15 * dt);
          if (this.hp >= this.maxHp) {
            this.phase = 1;
            this.look.dark(0);
            this.setMode('lurk', 1);
          }
        }
        break;
      }
    }
    if (this.phase === 3 && !this.spoke && this.foeOn) {
      this.spoke = true;
      events.emit('bossSpeaks', { id: 'delver', line: 'The crystals in the Delver\'s back have gone violet. Whatever it found down there, the Dark found it first.' });
    }
  }

  protected animate(dt: number) {
    const L = this.look;
    // Buried, it's out of sight; its back shows as it dives and bursts.
    const m = this.mode;
    let sink = 0;
    if (m === 'lurk' || m === 'under' || m === 'bulge' || m === 'home') sink = 4;
    else if (m === 'dive') sink = THREE.MathUtils.smoothstep(this.modeT, 0.2, 1.4) * 4;
    else if (m === 'burst') sink = (1 - THREE.MathUtils.smoothstep(this.modeT, 0, 0.45)) * 4;
    L.root.visible = sink < 3.9;
    L.root.position.copy(this.position);
    L.root.position.y -= sink;
    L.root.rotation.y = this.yaw;
    const pose: DelverPose = !this.alive ? 'dead' : m === 'rake' ? 'rake' : m === 'rear' ? 'rear' : m === 'slam' || m === 'stuck' ? 'slam' : m === 'dive' ? 'dive' : m === 'burst' ? 'burst' : m === 'reel' ? 'hurt' : 'idle';
    L.setPose(pose);
    // Stuck: hold the slam's landing.
    if (m === 'stuck') L.poseT = Math.min(L.poseT, 0.4);
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10);
    if (L.root.visible) L.update(dt, this.vel, (x, z) => heightAt(x, z) - sink);
  }

  protected onDeath() {
    sfx.roar(this.vol(1));
    this.look.dark(0);
    this.look.root.visible = true;
    this.look.root.position.y = this.position.y;
  }

  protected disposeLook() {
    this.look.dispose();
  }
}
