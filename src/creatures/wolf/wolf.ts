import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creature';
import { WolfVisual, type WolfLook, type WolfPose } from './visual';
import { dampAngle } from '../../core/math';
import { ignoresPlayer } from '../../origins/stealth';
import { sfx } from '../../audio/sfx';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import { creatureView } from '../view';
import { extraFoes, playerFoe, type Foe } from '../foes';

// Wolves hunt as a pack. They roam behind their leader; when they find prey
// the leader howls and the pack fans out around it, low and slow. Then they
// take turns: one snarls (the tell) and darts in to bite while the rest keep
// circling, never more than two at once. A bitten wolf drops back to the
// ring. Parry a bite and the wolf yelps and reels, open to a riposte; kill
// the leader and the rest lose their nerve.
//
// Raiders (raid/raids.ts) also go for the watch and the livestock, and make
// for an objective (a gate, a pen) when nothing is in reach.

const BASE: CreatureBase = { name: 'Grey Wolf', hp: 52, damage: 12, radius: 0.34, halfHeight: 0.2 };

type Mode = 'roam' | 'howl' | 'stalk' | 'circle' | 'snarl' | 'lunge' | 'retreat' | 'hurt' | 'flee' | 'raid';

export class Pack {
  readonly members: Wolf[] = [];
  leader: Wolf | null = null;
  /** wolves biting right now */
  biting = 0;
  /** the pack has lost its nerve (leader dead) */
  broken = false;
  howled = false;
}

const NAMES: Record<WolfLook, [string, string]> = {
  grey: ['Grey Wolf', 'Pack Leader'],
  leader: ['Grey Wolf', 'Pack Leader'],
  gloam: ['Gloam Wolf', 'Gloam Alpha'],
};

export class Wolf extends Creature {
  readonly look: WolfVisual;
  readonly pack: Pack;
  readonly isLeader: boolean;
  /** raiding: make for this point when nothing is in reach */
  objective: THREE.Vector3 | null = null;
  raider = false;
  private mode: Mode = 'roam';
  private modeT = 0;
  private modeLen = 2;
  private foe: Foe | null = null;
  private slot = Math.random() * Math.PI * 2;
  private circleDir = Math.random() < 0.5 ? 1 : -1;
  private biteCd = 1 + Math.random() * 2;
  private bit = false;
  private wander: THREE.Vector3 | null = null;
  private growlT = 2;
  private size: number;
  private biting = false;

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, opts: { pack?: Pack; leader?: boolean; look?: WolfLook; size?: number } = {}) {
    const look = opts.look ?? 'grey';
    const leader = !!opts.leader;
    super(look === 'gloam' ? 'gloamWolf' : 'wolf', { ...BASE, name: NAMES[look][leader ? 1 : 0], hp: BASE.hp * (leader ? 1.9 : 1) * (look === 'gloam' ? 1.15 : 1), damage: BASE.damage * (leader ? 1.4 : 1) }, level, at, scene, fx);
    this.isLeader = leader;
    this.size = opts.size ?? (leader ? 1.25 : 0.95 + Math.random() * 0.1);
    this.radius = BASE.radius * this.size;
    this.look = new WolfVisual({ scale: this.size, look: leader && look === 'grey' ? 'leader' : look });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
    this.pack = opts.pack ?? new Pack();
    this.pack.members.push(this);
    if (leader || !this.pack.leader) this.pack.leader = leader ? this : this.pack.leader ?? this;
    this.slot = (this.pack.members.length - 1) * 2.1 + Math.random() * 0.4;
  }

  /** Running for it (out of the fight). */
  get fleeing() {
    return this.mode === 'flee';
  }

  /** Join a raid: lope for the objective, turning on whatever is in reach. */
  beginRaid(objective: THREE.Vector3) {
    this.raider = true;
    this.objective = objective;
    this.setMode('raid', 1);
  }

  private setMode(m: Mode, len = 1) {
    // A turn at biting runs from the snarl through the lunge.
    if (this.biting && !(m === 'lunge' && this.mode === 'snarl')) {
      this.biting = false;
      this.pack.biting = Math.max(0, this.pack.biting - 1);
    }
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0, 0.45 * (1 - c.distanceTo(this.position) / 45)) : 0.2;
  }

  /** The nearest thing worth biting. */
  private pickFoe(player: Player): Foe | null {
    const pf = playerFoe(player);
    const playerOk = !player.dead && !ignoresPlayer(this);
    let best: Foe | null = null, bd = Infinity;
    const reach = this.raider ? 28 : creatureView.night ? 24 : 18;
    if (playerOk) {
      const d = player.pos.distanceTo(this.position);
      if (d < reach || (this.foe === pf && d < reach + 12)) (best = pf), (bd = d * 0.8); // prefer you a little
    }
    if (this.raider)
      for (const f of extraFoes) {
        if (!f.alive) continue;
        const d = f.pos.distanceTo(this.position);
        if (d < 22 && d < bd) (best = f), (bd = d);
      }
    return best;
  }

  /** Turn the whole pack on a foe. */
  private rouse(foe: Foe) {
    for (const w of this.pack.members) {
      if (!w.alive || w.mode === 'hurt' || w.mode === 'flee') continue;
      w.foe = foe;
      if (w.mode === 'roam' || w.mode === 'raid') w.setMode('stalk', 1.2 + Math.random() * 1.5);
    }
    const lead = this.pack.leader;
    if (lead && lead.alive && !this.pack.howled) {
      this.pack.howled = true;
      lead.setMode('howl', 2.4);
      sfx.howl(lead.volume() + 0.15);
    }
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.biteCd -= dt;
    this.stunned = this.mode === 'hurt' && this.modeLen > 1;
    this.wish.set(0, 0, 0);
    this.accel = 9;
    const s = this.size;
    const walk = 1.3 * s, trot = 3.2 * s, run = (this.isLeader ? 8.6 : 8.2) * s;
    const fresh = this.pickFoe(player);
    if (fresh && (this.mode === 'roam' || this.mode === 'raid')) this.rouse(fresh);
    if (this.foe && (!this.foe.alive || (this.foe.kind === 'player' && (player.dead || ignoresPlayer(this))))) this.foe = fresh;
    if (this.foe && this.foe.pos.distanceTo(this.position) > 45) this.foe = null;
    const foe = this.foe;
    const to = foe ? foe.pos.clone().sub(this.position).setY(0) : new THREE.Vector3();
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (!foe && this.mode !== 'roam' && this.mode !== 'raid' && this.mode !== 'flee' && this.mode !== 'hurt') this.setMode(this.raider ? 'raid' : 'roam', 2);

    // Raiders clear fences and hedges at a bound when something blocks the way.
    if (this.raider && this.bumped && this.grounded && this.vel.y <= 0.1 && this.mode !== 'hurt') {
      this.vel.y = 7.2;
      this.vel.addScaledVector(this.forward, 2);
    }

    switch (this.mode) {
      case 'roam': {
        // Follow the leader in a loose file; the leader picks the way.
        const lead = this.pack.leader;
        let target: THREE.Vector3;
        if (lead && lead !== this && lead.alive) {
          target = lead.position.clone().add(new THREE.Vector3(Math.cos(this.slot) * 3, 0, Math.sin(this.slot) * 3));
        } else {
          if (!this.wander || this.wander.distanceTo(this.position) < 1.5 || this.bumped) {
            const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
            this.wander = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
          }
          target = this.wander;
        }
        const d = target.clone().sub(this.position).setY(0);
        if (d.length() > 1.2) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 3, dt);
          this.wish.copy(this.forward).multiplyScalar(d.length() > 8 ? trot : walk);
        }
        break;
      }
      case 'raid': {
        // Lope toward the objective (a gate, a pen), ready to turn on whatever comes.
        if (this.objective) {
          const d = this.objective.clone().sub(this.position).setY(0);
          if (d.length() > 3) {
            this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 4, dt);
            this.wish.copy(this.forward).multiplyScalar(trot * 1.3);
          }
        }
        break;
      }
      case 'howl':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) this.setMode('circle', 1 + Math.random());
        break;
      case 'stalk': {
        // Low and slow, closing to the edge of the ring.
        this.yaw = dampAngle(this.yaw, face, 5, dt);
        if (dist > 7) this.wish.copy(this.forward).multiplyScalar(walk * 1.3);
        if (this.modeT > this.modeLen || dist < 6) this.setMode('circle', 1 + Math.random() * 1.5);
        break;
      }
      case 'circle': {
        if (!foe) break;
        // Hold a place on a ring round the prey, each wolf at its own angle.
        this.slot += dt * 0.5 * this.circleDir;
        const r = this.isLeader ? 5 : 4.2 + Math.sin(this.modeT + this.slot) * 0.6;
        const spot = foe.pos.clone().add(new THREE.Vector3(Math.cos(this.slot) * r, 0, Math.sin(this.slot) * r));
        const d = spot.sub(this.position).setY(0);
        const sp = Math.min(trot * 1.2, d.length() * 2);
        if (d.length() > 0.3) this.wish.copy(d.normalize()).multiplyScalar(sp);
        this.yaw = dampAngle(this.yaw, face, 6, dt);
        if (this.bumped) this.circleDir *= -1;
        this.growlT -= dt;
        if (this.growlT <= 0) {
          this.growlT = 2 + Math.random() * 4;
          sfx.growl(this.volume() * 0.7);
        }
        // My turn? Never more than two biting at once.
        const limit = foe.kind === 'player' ? 2 : 1;
        if (this.biteCd <= 0 && this.pack.biting < limit && dist < 8 && this.modeT > 0.6) {
          this.setMode('snarl', this.isLeader ? 0.5 : 0.38);
          this.pack.biting++;
          this.biting = true;
        }
        break;
      }
      case 'snarl':
        // The tell: head low, lips back, a beat of stillness.
        this.yaw = dampAngle(this.yaw, face, 10, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('lunge', 0.6);
          this.bit = false;
          sfx.snarl(this.volume() * 0.9);
        }
        break;
      case 'lunge': {
        this.accel = 14;
        if (this.modeT < 0.25) this.yaw = dampAngle(this.yaw, face, 6, dt);
        this.wish.copy(this.forward).multiplyScalar(run);
        if (foe && !this.bit && dist < 1.25 * s + 0.3 && to.clone().normalize().dot(this.forward) > 0.2) {
          this.bit = true;
          const leader = this.isLeader;
          foe.strike({
            damage: this.damage, from: this.position.clone(), parryable: true, poise: leader ? 60 : 30, knock: leader ? 3.5 : 1.5,
            onParried: () => {
              this.vel.copy(this.forward).multiplyScalar(-4);
              this.setMode('hurt', 1.8);
              this.stunned = true;
              sfx.yelp(0.4);
            },
          });
          if (this.mode === 'lunge') this.setMode('retreat', 0.7);
        } else if (this.modeT > this.modeLen) this.setMode('retreat', 0.5);
        break;
      }
      case 'retreat':
        if (foe) {
          this.yaw = dampAngle(this.yaw, face, 5, dt);
          this.wish.copy(to).normalize().multiplyScalar(-trot * 1.2);
        }
        if (this.modeT > this.modeLen) {
          this.biteCd = (this.isLeader ? 1.8 : 2.4) + Math.random() * 2;
          this.setMode('circle', 1);
        }
        break;
      case 'hurt':
        if (this.modeT > this.modeLen) {
          this.stunned = false;
          this.setMode(this.pack.broken && !this.isLeader ? 'flee' : 'retreat', 0.5);
        }
        break;
      case 'flee': {
        // Tail tucked, away from the fight; gone when far enough.
        const away = foe ? to.clone().normalize().negate() : this.forward;
        this.yaw = dampAngle(this.yaw, Math.atan2(away.x, away.z), 5, dt);
        this.wish.copy(this.forward).multiplyScalar(run * 0.85);
        if (this.modeT > 6 && foe && dist > 30) this.dispose();
        break;
      }
    }
  }

  protected onHurt(h: HitInfo) {
    const player = creatureView.player;
    if (player && (this.mode === 'roam' || this.mode === 'raid') && player.pos.distanceTo(this.position) < 30) this.rouse(playerFoe(player));
    if (h.crit || h.poise > 35) {
      this.setMode('hurt', 0.45);
      sfx.yelp(this.volume());
    }
    // Badly hurt and not the leader: some break and run.
    if (!this.isLeader && this.hp < this.maxHp * 0.22 && Math.random() < 0.4) this.setMode('flee', 8);
  }

  protected onDeath() {
    sfx.yelp(this.volume() + 0.1);
    if (this.biting) this.pack.biting = Math.max(0, this.pack.biting - 1);
    if (this.pack.leader === this) {
      // The leader is down: the pack loses its nerve.
      this.pack.broken = true;
      for (const w of this.pack.members) if (w !== this && w.alive) w.setMode('flee', 8);
    }
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const pose: WolfPose = !this.alive
      ? 'dead'
      : this.mode === 'howl' ? 'howl'
      : this.mode === 'stalk' ? 'stalk'
      : this.mode === 'snarl' ? 'snarl'
      : this.mode === 'lunge' ? 'lunge'
      : this.mode === 'hurt' ? 'hurt'
      : this.mode === 'circle' ? (Math.hypot(this.vel.x, this.vel.z) < 2 ? 'snarl' : 'idle')
      : 'idle';
    L.setPose(pose);
    L.lookAt = this.alive && this.foe && (this.mode === 'circle' || this.mode === 'stalk') ? this.foe.center : null;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, creatureView.fur);
    L.update(dt, this.vel, this.groundAt);
    // The gloam wolves trail a little darkness.
    if (L.look === 'gloam' && this.alive && Math.random() < dt * 8) {
      const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
      this.fx.add.spawn({ pos: p, spread: 0.2, count: 1, life: [0.6, 1.2], size: [0.18, 0.04], color: 0x2a1840, color2: 0x07040c, upBias: 0.6, drag: 1 });
    }
    if (!this.alive && this.deadT > this.corpseTime - 1.5) L.root.position.y -= (this.deadT - (this.corpseTime - 1.5)) * 0.35;
  }

  protected disposeLook() {
    if (this.biting) this.pack.biting = Math.max(0, this.pack.biting - 1);
    this.look.dispose();
  }
}
