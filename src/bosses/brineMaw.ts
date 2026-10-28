import { combat, type AttackKind } from '../combat/core';
import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { CrabVisual, crabDark, type CrabPose } from '../creatures/crab/visual';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';
import { crabCove } from './lairs';

// Brine-Maw, the crab of the cove north of Gull Ridge. It comes up out of the
// water at low tide (before dawn, and late in the afternoon) and suns itself
// on the sand. As big as a cart, and old: barnacled, weed-hung, its great
// crusher claw held up in front like a shield.
//
// The fight: blows to its front glance off the crusher (sparks and a clatter;
// a sliver of damage). Get round to its side or back: it turns to keep its
// claw on you, but slowly. It comes at you three ways:
//   - snap: the long cutter claw opens wide (the tell), then thrusts and
//     shuts. Parry it and it reels, its guard down.
//   - sweep: the crusher draws far back and out (the tell), then sweeps across
//     its whole front. Block it or get out of the way.
//   - rear and slam: it rears up on its back legs, both claws high, its pale
//     underside showing (the tell, and the opening: hits there do double, and a
//     heavy enough blow tips it over). Then it slams both claws down.
// Tipped over, it lies on its back with its legs clawing the air: everything
// hurts it then. Worn down, it froths a spray of foam that clings and slows.
// Near the end its shell cracks, and something violet shows underneath.

const SIZE = 3.0;
const BASE: CreatureBase = { name: 'Brine-Maw', hp: 700, damage: 26, radius: 1.15, halfHeight: 0.25 };

type Mode = 'bask' | 'notice' | 'scuttle' | 'snap' | 'sweep' | 'rear' | 'slam' | 'froth' | 'reel' | 'flipped' | 'home';

export class BrineMaw extends Creature implements BossBody {
  readonly look: CrabVisual;
  mode: Mode = 'bask';
  phase = 1;
  private modeT = 0;
  private modeLen = 3;
  private foeOn = false;
  private struck = false;
  private atkCd = 2;
  private rearCd = 7;
  private frothCd = 5;
  private tip = 0;
  private strafe = 1;
  private chitterT = 2;
  /** where it goes back into the water */
  readonly den: THREE.Vector3;
  /** guarded blows, tips onto its back, slams (tests) */
  stats = { guarded: 0, flips: 0, slams: 0, snaps: 0, sweeps: 0, froths: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den?: THREE.Vector3) {
    super('brineMaw', BASE, level, at, scene, fx);
    this.corpseTime = 40;
    this.den = (den ?? at).clone();
    crabDark(0);
    this.look = new CrabVisual({ scale: SIZE });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
  }

  get engaged() {
    return this.alive && this.mode !== 'bask' && this.mode !== 'home';
  }

  leash() {
    if (this.mode === 'home') return;
    this.foeOn = false;
    this.setMode('home', 999);
  }

  private setMode(m: Mode, len = 1) {
    // Its tell (combat/core.ts): the colour says how to answer it; a blow now is a counter-hit.
    const tell = ({ snap: ['normal', 0.1, 0], sweep: ['heavy', 0.15, 0], rear: ['unblockable', 0.2, 1.2] } as Partial<Record<Mode, [AttackKind, number, number]>>)[m];
    if (tell) combat.windup(this, len + tell[1], tell[0], tell[2] ? len + tell[2] : 0);
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
    this.struck = false;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0.05, 0.6 * (1 - c.distanceTo(this.position) / 60)) : 0.3;
  }

  /** Blows to its front glance off the crusher; reared, its belly is soft; on its back, everything lands. */
  takeHit(h: HitInfo) {
    if (!this.alive) return;
    const fromFront = this.forward.dot(h.dir.clone().negate().setY(0).normalize()) > 0.35;
    let dmg = h.damage;
    if (this.mode === 'flipped') dmg *= 2.5;
    else if (this.mode === 'rear') {
      dmg *= 2;
      this.tip += h.poise + (h.crit ? 30 : 0);
      if (this.tip >= 60) this.flipOver();
    } else if (fromFront && this.mode !== 'reel') {
      dmg *= this.phase === 3 ? 0.35 : 0.15;
      this.stats.guarded++;
      this.fx.add.spawn({ pos: h.at.clone(), spread: 0.3, count: 10, life: [0.15, 0.35], size: [0.06, 0.01], color: 0xfff2c8, color2: 0xff9a3a, gravity: 8, upBias: 0.6 });
      sfx.chitter(this.volume() * 0.6);
    }
    this.hp -= dmg;
    if (!this.foeOn) this.wake();
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private flipOver() {
    this.tip = 0;
    this.stats.flips++;
    this.setMode('flipped', this.phase === 3 ? 3.5 : 4.5);
    events.emit('bossSlam', { at: this.position.clone() });
    this.fx.dust(this.position.clone(), 3);
    sfx.chitter(this.volume() + 0.2);
  }

  private wake() {
    this.foeOn = true;
    if (this.mode === 'bask' || this.mode === 'home') this.setMode('notice', 1);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.atkCd -= dt;
    this.rearCd -= dt;
    this.frothCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 7;
    this.stunned = this.mode === 'reel' || this.mode === 'flipped';
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) crabDark(1);
    }
    const quick = this.phase === 3 ? 1.25 : this.phase === 2 ? 1.12 : 1;
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (canSee && this.mode === 'bask' && dist < 16) this.wake();
    if (this.foeOn && (!canSee || dist > 50)) {
      this.foeOn = false;
      if (this.mode !== 'flipped' && this.mode !== 'home') this.setMode(this.hp < this.maxHp ? 'home' : 'bask', 4);
    }
    // It turns to keep its claw on you, but slowly: get round to its side.
    const turn = (this.phase === 3 ? 2.0 : 1.5) * (this.mode === 'scuttle' || this.mode === 'notice' ? 1 : 0.35);
    if (this.foeOn && this.mode !== 'flipped' && this.mode !== 'reel') {
      const d = THREE.MathUtils.euclideanModulo(face - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += THREE.MathUtils.clamp(d, -turn * dt, turn * dt);
    }
    this.chitterT -= dt;
    if (this.chitterT <= 0 && this.foeOn) {
      this.chitterT = 1.5 + Math.random() * 3;
      sfx.chitter(this.volume() * 0.5);
    }
    const front = this.forward.dot(to.clone().normalize());

    switch (this.mode) {
      case 'bask': {
        // On the sand, eyes swivelling; now and then it shifts a few steps sideways.
        if (this.modeT > this.modeLen) {
          this.setMode('bask', 3 + Math.random() * 5);
          this.strafe = Math.random() < 0.5 ? 1 : -1;
        }
        if (this.modeT < 1.2) this.wish.copy(this.right).multiplyScalar(this.strafe * 1.2);
        break;
      }
      case 'notice':
        if (this.modeT > this.modeLen) this.setMode('scuttle', 1.5);
        break;
      case 'scuttle': {
        // Sideways round you, keeping its distance; in and out.
        const want = 5;
        const side = this.right.multiplyScalar(this.strafe * 3.4 * quick);
        const inOut = this.forward.multiplyScalar(THREE.MathUtils.clamp((dist - want) * 1.2, -2, 2.5));
        this.wish.copy(side).add(inOut);
        if (this.bumped || Math.random() < dt * 0.3) this.strafe *= -1;
        if (this.modeT < 0.6 || this.atkCd > 0) break;
        // Choose a move by range and what's open to it.
        if (this.phase >= 2 && this.frothCd <= 0 && dist < 7.5 && front > 0.7) {
          this.setMode('froth', 0.9);
          sfx.hiss(this.volume() + 0.1);
        } else if (this.rearCd <= 0 && dist < 6.5) {
          this.setMode('rear', this.phase === 3 ? 0.9 : 1.15);
          this.tip = 0;
        } else if (dist < 5.8 && front > 0.2 && Math.random() < 0.5) {
          this.setMode('sweep', 1.2);
        } else if (dist < 4.8 && front > 0.5) {
          this.setMode('snap', 0.95);
        }
        break;
      }
      case 'snap':
        // Open wide (the tell), then thrust and shut.
        if (this.modeT > 0.5 / quick && this.modeT - dt <= 0.5 / quick) this.wish.copy(this.forward).multiplyScalar(6);
        if (!this.struck && this.modeT > 0.55 / quick) {
          this.struck = true;
          this.stats.snaps++;
          if (dist < 4.8 && front > 0.45) {
            playerFoe(player).strike({
              damage: this.damage, from: this.position.clone(), parryable: true, poise: 55,
              onParried: () => this.setMode('reel', 1.6),
            });
          }
        }
        if (this.modeT > this.modeLen) this.endAttack(1.1);
        break;
      case 'sweep':
        // Drawn back (the tell), then swept across the whole front.
        if (!this.struck && this.modeT > 0.8 / quick) {
          this.struck = true;
          this.stats.sweeps++;
          if (dist < 6 && front > -0.1) playerFoe(player).strike({ damage: this.damage * 1.3, from: this.position.clone(), parryable: false, poise: 90, knock: 6 });
        }
        if (this.modeT > this.modeLen) this.endAttack(1.3);
        break;
      case 'rear':
        // Up on its back legs, belly showing: the opening. Then down.
        if (this.modeT > this.modeLen) {
          this.setMode('slam', 0.7);
          this.stats.slams++;
          const at = this.position.clone().addScaledVector(this.forward, 2);
          events.emit('bossSlam', { at });
          this.fx.dust(at, 3);
          this.fx.add.spawn({ pos: at.clone().setY(at.y + 0.3), spread: 2.5, count: 30, life: [0.4, 0.9], size: [0.12, 0.02], color: 0xe8eef0, color2: 0x8aa0a8, gravity: 6, upBias: 1.2 });
          if (player.pos.distanceTo(at) < 4.8) playerFoe(player).strike({ damage: this.damage * 1.6, from: this.position.clone(), parryable: false, poise: 130, knock: 7 });
        }
        break;
      case 'slam':
        if (this.modeT > this.modeLen) {
          this.rearCd = (this.phase === 3 ? 6 : 9) + Math.random() * 3;
          this.endAttack(0.6);
        }
        break;
      case 'froth':
        // A spray of clinging foam across its front.
        if (this.modeT > 0.4 && Math.random() < dt * 30) {
          const p = this.position.clone().addScaledVector(this.forward, 1.2).setY(this.position.y + 0.8);
          this.fx.add.spawn({ pos: p, vel: this.forward.multiplyScalar(9).setY(1), spread: 0.4, count: 3, life: [0.4, 0.8], size: [0.14, 0.05], color: 0xf4f8f6, color2: 0xb8c8c4, gravity: 3, drag: 1.5 });
        }
        if (!this.struck && this.modeT > 0.55) {
          this.struck = true;
          this.stats.froths++;
          if (dist < 7.5 && front > 0.7) playerFoe(player).strike({ damage: this.damage * 0.3, from: this.position.clone(), parryable: false, poise: 10, web: 2.5 });
        }
        if (this.modeT > this.modeLen) {
          this.frothCd = 8 + Math.random() * 4;
          this.endAttack(0.8);
        }
        break;
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode('scuttle', 0.6);
        break;
      case 'flipped':
        if (this.modeT > this.modeLen) {
          sfx.chitter(this.volume() + 0.1);
          this.setMode('scuttle', 0.8);
          this.atkCd = 0.6;
        }
        break;
      case 'home': {
        // Back into the water to heal.
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 3) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z) + Math.PI / 2, 3, dt);
          this.wish.copy(d.normalize()).multiplyScalar(3);
        } else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * dt);
          if (this.hp >= this.maxHp) {
            this.phase = 1;
            crabDark(0);
            this.setMode('bask', 4);
          }
        }
        break;
      }
    }
  }

  private endAttack(cd: number) {
    this.atkCd = cd / (this.phase === 3 ? 1.4 : 1);
    this.setMode('scuttle', 0.4);
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode;
    const pose: CrabPose = !this.alive ? 'dead' : m === 'snap' ? 'snap' : m === 'sweep' ? 'sweep' : m === 'rear' ? 'rear' : m === 'slam' ? 'slam' : m === 'froth' ? 'froth' : m === 'flipped' ? 'flipped' : 'guard';
    L.setPose(pose);
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10);
    L.update(dt, this.vel, this.groundAt);
    // The Dark under its cracked shell: violet motes leaking out.
    if (this.alive && this.phase === 3 && Math.random() < dt * 10) {
      const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6));
      this.fx.add.spawn({ pos: p, spread: 0.2, count: 1, life: [0.6, 1.2], size: [0.16, 0.03], color: 0x6a3aa8, color2: 0x10061a, upBias: 0.7, drag: 1 });
    }
    if (!this.alive && this.deadT > this.corpseTime - 2) L.root.position.y -= (this.deadT - (this.corpseTime - 2)) * 0.4;
  }

  protected onDeath() {
    sfx.chitter(this.volume() + 0.2);
    crabDark(0);
  }

  protected disposeLook() {
    crabDark(0);
    this.look.dispose();
  }
}

const COVE = new THREE.Vector3(2180, 0, -120);

export const BRINE_MAW: BossDef = {
  id: 'brineMaw',
  kind: 'brineMaw',
  name: 'Brine-Maw',
  title: 'the crab of the cove',
  home: { x: 2182, z: -156, r: 55 },
  levelBonus: 4,
  lair: crabCove,
  clearing: 20,
  looks: ['crab'],
  // Low tide: before dawn, and late in the afternoon.
  abroad: (h) => (h >= 3 && h < 6.5) || (h >= 15 && h < 18.5),
  spawn: (at, level, scene, fx) => new BrineMaw(at, level, scene, fx, new THREE.Vector3(COVE.x, heightAt(COVE.x, COVE.z), COVE.z)),
  rumour: 'The fishermen at Gull Ridge won\'t row into the cove north of the ridge any more. At low tide, before dawn and late in the afternoon, a crab as big as a cart comes up on the sand. It took a rowing boat in half. They call it Brine-Maw.',
  found: 'Brine-Maw. A shore crab as big as a cart, crusted with barnacles, its great crusher claw raised like a shield. Get round its side.',
  phaseLines: ['Brine-Maw froths at the mouth. Its barnacles crack and weep black water.', 'Brine-Maw\'s shell splits, and under the cracks something glows violet. Whatever this is, it isn\'t only a crab.'],
  unique: 'brineMawShell',
  renown: 2,
  slain: 'Brine-Maw lies still on the sand. You prise away a piece of its carapace: it will make a shield.',
  again: { items: [['rawMeat', 4]], gold: [80, 140] },
  bounty: {
    title: 'Bounty: Brine-Maw',
    description: 'The Gull Ridge fishermen have pooled their coin. A crab the size of a cart comes up in the cove north of the ridge at low tide and has wrecked three boats. The guild has added its own purse.',
    gold: 300, xp: 380, rep: 160, minRank: 2,
  },
};
