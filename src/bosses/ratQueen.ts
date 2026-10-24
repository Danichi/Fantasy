import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { RatVisual, type RatPose } from '../creatures/rat/visual';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt, SINKHOLE } from '../world/terrainHeight';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';

// The Rat Queen of the Sinkhole (a discovery boss, docs/design/sites.md).
// A collapsed pit in the northern hills: step too near the edge and it gives
// way, and you come down in front of her. She's huge, bloated with young,
// mangy, and wears a crown of bone grown into her skull.
//
//   - The bite: she draws back low (the tell) and lunges. Parry it and she
//     reels.
//   - The tail: get behind her and she lashes it round in a wide sweep. It
//     can't be parried: roll, or stay out of reach.
//   - The screech: she rears up on her hind legs and screeches, and her brood
//     pour out of the burrows in the pit wall. While she's up her swollen belly
//     is open: hits there do double, and hit hard enough she comes down.
//   - Worn down she calls more often and bites faster; near the end her red
//     eyes go violet.

const QUEEN_SCALE = 2.4;
const BROOD_SCALE = 0.75;

const QUEEN: CreatureBase = { name: 'The Rat Queen', hp: 820, damage: 30, radius: 0.85, halfHeight: 0.25 };
const BROOD: CreatureBase = { name: 'Brood Rat', hp: 34, damage: 8, radius: 0.32, halfHeight: 0.05 };

const groundAt = (x: number, z: number) => heightAt(x, z);
const vol = (p: THREE.Vector3, k = 0.6) => {
  const c = creatureView.camera;
  return c ? Math.max(0.05, k * (1 - c.distanceTo(p) / 60)) : 0.3;
};

/** One of her brood: scuttles in, nips, darts off when hurt. */
export class BroodRat extends Creature {
  readonly look: RatVisual;
  private biteCd = 0.5 + Math.random();
  private biteT = -1;
  private fleeT = 0;
  private side = Math.random() < 0.5 ? 1 : -1;

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX) {
    super('broodRat', BROOD, level, at, scene, fx);
    this.corpseTime = 4;
    this.look = new RatVisual({ scale: BROOD_SCALE });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
  }

  protected onHurt(_h: HitInfo) {
    this.fleeT = 0.6;
    this.biteT = -1;
    this.look.setPose('hurt');
  }

  protected think(dt: number, player: Player) {
    this.biteCd -= dt;
    this.fleeT -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 9;
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (player.dead || ignoresPlayer(this)) return;
    if (this.fleeT > 0) {
      // Dart away to the side.
      this.wish.copy(to).normalize().multiplyScalar(-3.5).add(new THREE.Vector3(to.z, 0, -to.x).normalize().multiplyScalar(this.side * 2));
      this.yaw = dampAngle(this.yaw, Math.atan2(this.wish.x, this.wish.z), 10, dt);
      return;
    }
    this.yaw = dampAngle(this.yaw, face, 8, dt);
    if (this.biteT >= 0) {
      this.biteT += dt;
      if (this.biteT > 0.18 && this.biteT - dt <= 0.18 && dist < 1.4) {
        playerFoe(player).strike({ damage: this.damage, from: this.position.clone(), parryable: true, poise: 8, poison: 1.5 });
      }
      if (this.biteT > 0.55) {
        this.biteT = -1;
        this.biteCd = 0.9 + Math.random() * 0.9;
      }
      return;
    }
    // Circle in, then nip.
    if (dist > 1.1) {
      const orbit = new THREE.Vector3(to.z, 0, -to.x).normalize().multiplyScalar(this.side * (dist < 4 ? 1.6 : 0.4));
      this.wish.copy(to).normalize().multiplyScalar(dist > 6 ? 5 : 3).add(orbit);
    }
    if (dist < 1.3 && this.biteCd <= 0) {
      this.biteT = 0;
      this.look.setPose('bite');
      if (Math.random() < 0.3) sfx.chitter(vol(this.position, 0.3));
    }
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    if (!this.alive) L.setPose('dead');
    else if (this.biteT < 0 && L.pose === 'bite' && L.poseT > 0.5) L.setPose('idle');
    else if (L.pose === 'hurt' && L.poseT > 0.4) L.setPose('idle');
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, false);
    L.update(dt, this.vel, groundAt);
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

type Mode = 'lurk' | 'wake' | 'stalk' | 'windup' | 'bite' | 'whip' | 'rear' | 'reel' | 'home';

export class RatQueen extends Creature implements BossBody {
  readonly look: RatVisual;
  readonly brood: BroodRat[] = [];
  mode: Mode = 'lurk';
  phase = 1;
  private modeT = 0;
  private modeLen = 1;
  private struck = false;
  private biteCd = 1.2;
  private whipCd = 3;
  private callCd = 4;
  private bellyDmg = 0;
  private foeOn = false;
  private spoke = false;
  readonly den: THREE.Vector3;
  stats = { bites: 0, whips: 0, calls: 0, called: 0, belly: 0, broken: 0, parried: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX) {
    super('ratQueen', QUEEN, level, at, scene, fx);
    this.corpseTime = 40;
    this.den = at.clone();
    this.look = new RatVisual({ scale: QUEEN_SCALE, queen: true });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
  }

  get engaged() {
    return this.alive && this.mode !== 'lurk' && this.mode !== 'home';
  }

  /** Up on her hind legs: the belly is open. */
  get open() {
    return this.mode === 'rear' || this.mode === 'reel';
  }

  leash() {
    if (this.mode === 'home' || this.mode === 'lurk') return;
    this.foeOn = false;
    this.setMode('home', 999);
  }

  /** Wake her now (the edge gave way). */
  wake() {
    if (this.mode !== 'lurk' || !this.alive) return;
    this.foeOn = true;
    this.callCd = 0;
    this.setMode('wake', 1.0);
  }

  private setMode(m: Mode, len = 1) {
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
    this.struck = false;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    let dmg = h.damage;
    if (this.mode === 'rear') {
      // The swollen belly, right there.
      dmg *= 2;
      this.stats.belly++;
      this.bellyDmg += dmg;
      if (this.bellyDmg > this.maxHp * 0.07) {
        this.stats.broken++;
        this.callCd = 8;
        this.setMode('reel', 1.6);
        sfx.squeal(vol(this.position, 0.8));
      }
    }
    this.hp -= dmg;
    this.vel.addScaledVector(h.dir, Math.min(1.5, 0.4 + h.poise * 0.005));
    if (!this.foeOn) {
      this.foeOn = true;
      if (this.mode === 'lurk' || this.mode === 'home') this.setMode('wake', 0.6);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  /** The brood pour out of the burrows in the pit wall. */
  private callBrood() {
    const n = this.phase === 3 ? 4 : this.phase === 2 ? 3 : 3;
    const living = this.brood.filter((r) => r.alive).length;
    const want = Math.min(n, 7 - living);
    for (let i = 0; i < want; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = SINKHOLE.r - 3;
      const x = this.den.x + Math.cos(a) * r, z = this.den.z + Math.sin(a) * r;
      const rat = new BroodRat(new THREE.Vector3(x, heightAt(x, z), z), this.level - 3, this.scene, this.fx);
      rat.yaw = Math.atan2(this.den.x - x, this.den.z - z);
      this.brood.push(rat);
      this.stats.called++;
      this.fx.add.spawn({ pos: new THREE.Vector3(x, heightAt(x, z) + 0.4, z), spread: 0.6, count: 12, life: [0.4, 0.8], size: [0.1, 0.02], color: 0x5a4a3a, color2: 0x2a2018, gravity: 6, upBias: 1 });
    }
    // Clear away the long dead.
    for (let i = this.brood.length - 1; i >= 0; i--) if (this.brood[i].dead) this.brood.splice(i, 1);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.biteCd -= dt;
    this.whipCd -= dt;
    this.callCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 4;
    this.stunned = this.mode === 'reel';
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) this.look.dark(1);
      this.callCd = Math.min(this.callCd, 1);
    }
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    const behind = this.forward.dot(to.clone().normalize()) < -0.25;
    const quick = this.phase === 3 ? 1.3 : this.phase === 2 ? 1.12 : 1;
    if (this.foeOn && (!canSee || dist > 60)) {
      this.foeOn = false;
      this.setMode('home', 999);
    }
    switch (this.mode) {
      case 'lurk':
        // Curled up in the dark of the pit; she stirs if you come too close.
        if (canSee && dist < 7) this.wake();
        break;
      case 'wake':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) {
          if (this.callCd <= 0) this.startRear();
          else this.setMode('stalk', 0.4);
        }
        break;
      case 'stalk':
        this.yaw = dampAngle(this.yaw, face, behind ? 1.6 : 3.2, dt);
        if (dist > 3.4) this.wish.copy(to).normalize().multiplyScalar((dist > 9 ? 4.2 : 2.6) * quick);
        if (this.modeT < this.modeLen) break;
        if (this.callCd <= 0) this.startRear();
        else if (behind && dist < 6 && this.whipCd <= 0) {
          this.setMode('whip', 0.9 / quick);
          this.stats.whips++;
        } else if (dist < 4.2 && this.biteCd <= 0 && !behind) {
          this.setMode('windup', 0.55 / quick);
          sfx.hiss(vol(this.position, 0.5));
        }
        break;
      case 'windup':
        // Drawn back low: the bite is coming.
        this.yaw = dampAngle(this.yaw, face, 5, dt);
        if (this.modeT > this.modeLen) this.setMode('bite', 0.7);
        break;
      case 'bite':
        // The lunge carries her forward.
        if (this.modeT < 0.2) this.wish.copy(this.forward).multiplyScalar(7);
        if (!this.struck && this.modeT > 0.16) {
          this.struck = true;
          this.stats.bites++;
          const reach = this.position.clone().addScaledVector(this.forward, 2.2);
          if (reach.distanceTo(player.pos) < 2.2 && canSee) {
            playerFoe(player).strike({
              damage: this.damage, from: this.position.clone(), parryable: true, poise: 45, poison: 3,
              onParried: () => {
                this.stats.parried++;
                this.setMode('reel', 1.4);
              },
            });
          }
        }
        if (this.mode === 'bite' && this.modeT > this.modeLen) {
          this.biteCd = (this.phase === 3 ? 0.7 : 1.3) + Math.random() * 0.8;
          this.setMode('stalk', 0.3);
        }
        break;
      case 'whip':
        // The tail sweeps round behind and to the sides.
        if (!this.struck && this.modeT > 0.2) {
          this.struck = true;
          const tail = this.position.clone().addScaledVector(this.forward, -2.6);
          if ((tail.distanceTo(player.pos) < 4.2 || (dist < 3.5 && behind)) && canSee) {
            playerFoe(player).strike({ damage: this.damage * 0.8, from: tail, parryable: false, poise: 50, knock: 6 });
          }
          this.fx.add.spawn({ pos: tail.setY(this.position.y + 0.3), spread: 1.5, count: 14, life: [0.3, 0.6], size: [0.12, 0.03], color: 0x6a5a4a, color2: 0x2a2018, gravity: 4, upBias: 0.6 });
        }
        if (this.modeT > this.modeLen) {
          this.whipCd = 3 + Math.random() * 2;
          this.setMode('stalk', 0.3);
        }
        break;
      case 'rear':
        // Up on her hind legs, screeching; the brood come at the top of it.
        this.yaw = dampAngle(this.yaw, face, 1.5, dt);
        if (this.modeT > 1.0 && !this.struck) {
          this.struck = true;
          this.callBrood();
        }
        if (this.modeT > this.modeLen) {
          this.callCd = (this.phase === 3 ? 11 : this.phase === 2 ? 14 : 18) + Math.random() * 3;
          this.setMode('stalk', 0.5);
        }
        break;
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.3);
        break;
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 2) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 3, dt);
          this.wish.copy(d.normalize()).multiplyScalar(2.5);
        } else {
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
      events.emit('bossSpeaks', { id: 'ratQueen', line: 'The Rat Queen\'s eyes have gone violet, and the whole pit writhes. Something in the Dark is feeding her.' });
    }
  }

  private startRear() {
    this.setMode('rear', 2.0);
    this.bellyDmg = 0;
    this.stats.calls++;
    sfx.squeal(vol(this.position, 0.9));
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode;
    const pose: RatPose = !this.alive ? 'dead' : m === 'rear' ? 'rear' : m === 'whip' ? 'whip' : m === 'bite' || m === 'windup' ? 'bite' : m === 'reel' ? 'hurt' : 'idle';
    // The windup is the first part of the bite pose, held.
    if (m === 'windup') {
      L.setPose('bite');
      L.poseT = Math.min(L.poseT, 0.12);
    } else L.setPose(pose);
    L.lookAt = null;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10);
    L.update(dt, this.vel, groundAt);
  }

  update(dt: number, player: Player) {
    super.update(dt, player);
    for (const r of this.brood) r.update(dt, player);
  }

  protected onDeath() {
    sfx.squeal(vol(this.position, 1));
    this.look.dark(0);
    // Without her, the brood scatter into the walls.
    for (const r of this.brood) if (r.alive) r.takeHit({ damage: 1e4, poise: 0, dir: new THREE.Vector3(0, 1, 0), at: r.center.clone(), crit: false, source: 'spell' });
  }

  dispose() {
    super.dispose();
    for (const r of this.brood) r.dispose();
    this.brood.length = 0;
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

/** The pit floor, where she lurks. */
const DEN = { x: SINKHOLE.x - 3, z: SINKHOLE.z + 2 };

export const RAT_QUEEN: BossDef = {
  id: 'ratQueen',
  kind: 'ratQueen',
  name: 'The Rat Queen',
  title: 'the thing at the bottom of the sinkhole',
  home: { x: DEN.x, z: DEN.z, r: SINKHOLE.r + 4 },
  levelBonus: 3,
  looks: ['rat'],
  abroad: () => true,
  summoned: true,
  once: true,
  spawn: (_at, level, scene, fx) => new RatQueen(new THREE.Vector3(DEN.x, heightAt(DEN.x, DEN.z), DEN.z), level, scene, fx),
  rumour: 'There\'s a sinkhole up in the north hills, past the old quarry road. Shepherds won\'t graze near it. They say the ground there is hollow, and at night you can hear scratching under your feet.',
  found: 'The Rat Queen. A rat the size of an ox, swollen with young, a crown of bone grown out of her skull. Her brood are in the walls.',
  phaseLines: ['The Rat Queen screeches, and the walls of the pit squirm.', 'The Rat Queen\'s eyes have gone from red to violet.'],
  unique: 'boneCrown',
  renown: 2,
  deed: 'Killed the Rat Queen of the Sinkhole',
  slain: 'The Rat Queen rolls onto her back and is still. The scratching in the walls stops. Her crown of bone comes away in your hands.',
  again: { items: [], gold: [0, 0] },
  bounty: { title: '', description: '', gold: 0, xp: 0, rep: 0, minRank: 99 },
};
