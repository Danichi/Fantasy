import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { WightVisual, wightDark, type WightPose } from '../creatures/wight/visual';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import { Undead } from '../enemies/undead';
import { CROWN_SITES, crownAt } from '../world/crownRoad';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';

// The Hollow Thane: the dead chieftain of the Barrow of the Old Kings on the
// Crown Road, who walks at night. A pale ward hangs round it: blows barely
// touch it while the ward is up. The ward drops when it works its magic:
//
//   - Raising: arms high, head back, eyes flaring (a long channel): skeletons
//     claw up out of the barrow earth. The ward is down while it calls them:
//     hit it then. Hit it hard enough and the calling breaks off.
//   - Cold breath: it leans in, jaw wide (the tell), and breathes a cone of
//     grave-cold that chills and slows. After it, it's spent and open.
//   - The sword: drawn back high (the tell), a long cut. Parry it and it reels,
//     its ward down.
//   - It fades into mist and steps out of it somewhere else, often behind you.
//
// Worn down, it calls more. Near the end its eyes go violet, and it speaks.

const BASE: CreatureBase = { name: 'The Hollow Thane', hp: 560, damage: 28, radius: 0.45, halfHeight: 0.75 };

type Mode = 'stand' | 'notice' | 'glide' | 'raise' | 'breathe' | 'windup' | 'cut' | 'reel' | 'fade' | 'appear' | 'spent' | 'home';

export class HollowThane extends Creature implements BossBody {
  readonly look: WightVisual;
  readonly risen: Undead[] = [];
  mode: Mode = 'stand';
  phase = 1;
  private modeT = 0;
  private modeLen = 2;
  private foeOn = false;
  private struck = false;
  private raiseCd = 2.5;
  private breathCd = 6;
  private fadeCd = 8;
  private cutCd = 1.5;
  private channelDmg = 0;
  private breathTick = 0;
  private spoke = false;
  readonly den: THREE.Vector3;
  stats = { raised: 0, raisings: 0, broken: 0, breaths: 0, chilled: 0, cuts: 0, fades: 0, wardedHits: 0, openHits: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den?: THREE.Vector3) {
    super('hollowThane', BASE, level, at, scene, fx);
    this.corpseTime = 30;
    this.den = (den ?? at).clone();
    wightDark(0);
    this.look = new WightVisual();
    this.look.root.position.copy(at);
    scene.add(this.look.root);
  }

  /** The ward is down: channelling, spent after its breath, or reeling. */
  get open() {
    return this.mode === 'raise' || this.mode === 'spent' || this.mode === 'reel';
  }

  get engaged() {
    return this.alive && this.mode !== 'stand' && this.mode !== 'home';
  }

  leash() {
    if (this.mode === 'home') return;
    this.foeOn = false;
    this.setMode('home', 999);
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
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0.05, 0.6 * (1 - c.distanceTo(this.position) / 60)) : 0.3;
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.mode === 'fade') return;
    let dmg = h.damage;
    if (this.open) {
      dmg *= 1.5;
      this.stats.openHits++;
      if (this.mode === 'raise') {
        // Hurt enough while calling and the calling breaks off.
        this.channelDmg += dmg;
        if (this.channelDmg > this.maxHp * 0.08) {
          this.stats.broken++;
          this.raiseCd = 9 + Math.random() * 3;
          this.setMode('reel', 1.4);
        }
      }
    } else {
      dmg *= 0.1;
      this.stats.wardedHits++;
      this.fx.add.spawn({ pos: h.at.clone(), spread: 0.4, count: 8, life: [0.2, 0.4], size: [0.07, 0.01], color: 0xbfe8ff, color2: 0x4a7aa8, upBias: 0.4, drag: 2 });
    }
    this.hp -= dmg;
    if (!this.foeOn) {
      this.foeOn = true;
      if (this.mode === 'stand' || this.mode === 'home') this.setMode('notice', 0.8);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  /** The dead claw up out of the earth around you. */
  private raiseDead(player: Player) {
    const n = this.phase === 3 ? 4 : this.phase === 2 ? 3 : 2;
    const living = this.risen.filter((u) => u.alive).length;
    for (let i = 0; i < Math.min(n, 6 - living); i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 4;
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      const u = new Undead('skeleton', new THREE.Vector3(x, heightAt(x, z), z), Math.atan2(player.pos.x - x, player.pos.z - z), this.scene, this.fx);
      this.risen.push(u);
      this.stats.raised++;
      this.fx.add.spawn({ pos: new THREE.Vector3(x, heightAt(x, z) + 0.3, z), spread: 0.8, count: 16, life: [0.4, 0.9], size: [0.1, 0.02], color: 0x6a5a44, color2: 0x2a2018, gravity: 5, upBias: 1.2 });
    }
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.raiseCd -= dt;
    this.breathCd -= dt;
    this.fadeCd -= dt;
    this.cutCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 5;
    this.stunned = this.mode === 'reel';
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) wightDark(1);
      // Worn down: straight to calling more of them.
      if (this.mode !== 'fade' && this.mode !== 'appear') {
        this.raiseCd = 0;
        this.setMode('glide', 0.2);
      }
    }
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (canSee && this.mode === 'stand' && dist < 26) {
      this.foeOn = true;
      this.setMode('notice', 1.2);
      sfx.groan(this.volume() + 0.15);
    }
    if (this.foeOn && (!canSee || dist > 55)) {
      this.foeOn = false;
      if (this.mode !== 'fade') this.setMode(this.hp < this.maxHp ? 'home' : 'stand', 3);
    }
    const quick = this.phase === 3 ? 1.25 : 1;

    switch (this.mode) {
      case 'stand':
        break;
      case 'notice':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) this.setMode('glide', 0.6);
        break;
      case 'glide': {
        this.yaw = dampAngle(this.yaw, face, 4, dt);
        if (dist > 2.6) this.wish.copy(to).normalize().multiplyScalar((dist > 10 ? 4.5 : 2.6) * quick);
        if (this.modeT < this.modeLen) break;
        if (this.raiseCd <= 0) {
          this.setMode('raise', 3.2 / quick);
          this.channelDmg = 0;
          this.stats.raisings++;
          sfx.groan(this.volume() + 0.25);
        } else if (this.fadeCd <= 0 && (dist > 12 || Math.random() < dt * 0.4)) {
          this.setMode('fade', 0.9);
          this.stats.fades++;
        } else if (this.breathCd <= 0 && dist < 7 && dist > 2) {
          this.setMode('breathe', 2.2);
          this.breathTick = 0;
          this.stats.breaths++;
        } else if (this.cutCd <= 0 && dist < 3.4) {
          this.setMode('windup', 0.6 / quick);
        }
        break;
      }
      case 'raise':
        // Arms up, calling: the ward is down. At the end of it, they rise.
        this.yaw = dampAngle(this.yaw, face, 2, dt);
        if (this.modeT > this.modeLen) {
          this.raiseDead(player);
          this.raiseCd = (this.phase === 3 ? 10 : 14) + Math.random() * 3;
          this.setMode('glide', 0.8);
        }
        break;
      case 'breathe': {
        // Jaw wide; a cone of grave-cold rolls out in front of it.
        this.yaw = dampAngle(this.yaw, face, 1.2, dt);
        if (this.modeT > 0.75) {
          const mouth = this.position.clone().setY(this.position.y + 2.05).addScaledVector(this.forward, 0.3);
          if (Math.random() < dt * 40) this.fx.add.spawn({ pos: mouth, vel: this.forward.multiplyScalar(6).setY(-1.2), spread: 0.3, count: 2, life: [0.6, 1.1], size: [0.3, 0.6], color: 0xd8f0ff, color2: 0x6a9ac8, drag: 1.2 });
          this.breathTick -= dt;
          const inCone = dist < 7.5 && this.forward.dot(to.clone().normalize()) > 0.8;
          if (this.breathTick <= 0 && inCone && canSee) {
            this.breathTick = 0.35;
            this.stats.chilled++;
            playerFoe(player).strike({ damage: this.damage * 0.22, from: this.position.clone(), parryable: false, poise: 5, web: 1.2 });
          }
        }
        if (this.modeT > this.modeLen) {
          this.breathCd = 9 + Math.random() * 3;
          this.setMode('spent', 1.6);
        }
        break;
      }
      case 'spent':
        // The breath took something out of it: the ward is down.
        if (this.modeT > this.modeLen) this.setMode('glide', 0.4);
        break;
      case 'windup':
        this.yaw = dampAngle(this.yaw, face, 6, dt);
        if (this.modeT > this.modeLen) this.setMode('cut', 0.55);
        break;
      case 'cut':
        if (!this.struck && this.modeT > 0.08) {
          this.struck = true;
          this.stats.cuts++;
          if (dist < 3.6 && this.forward.dot(to.clone().normalize()) > 0.3 && canSee) {
            playerFoe(player).strike({
              damage: this.damage, from: this.position.clone(), parryable: true, poise: 60,
              onParried: () => this.setMode('reel', 1.8),
            });
          }
        }
        if (this.modeT > this.modeLen) {
          this.cutCd = (this.phase === 3 ? 0.8 : 1.4) + Math.random() * 0.8;
          this.setMode('glide', 0.3);
        }
        break;
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode('glide', 0.4);
        break;
      case 'fade':
        // Into mist...
        this.look.opacity = Math.max(0, 1 - this.modeT / this.modeLen);
        if (this.modeT > this.modeLen) {
          // ...and out of it, behind you.
          const behind = player.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), -4);
          this.teleport(new THREE.Vector3(behind.x, heightAt(behind.x, behind.z), behind.z));
          this.yaw = Math.atan2(player.pos.x - behind.x, player.pos.z - behind.z);
          this.fadeCd = (this.phase === 3 ? 6 : 10) + Math.random() * 4;
          this.setMode('appear', 0.7);
        }
        break;
      case 'appear':
        this.look.opacity = Math.min(1, this.modeT / this.modeLen);
        if (this.modeT > this.modeLen) {
          this.look.opacity = 1;
          this.cutCd = 0;
          this.setMode('glide', 0.1);
        }
        break;
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 2) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 3, dt);
          this.wish.copy(d.normalize()).multiplyScalar(3);
        } else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * dt);
          if (this.hp >= this.maxHp) {
            this.phase = 1;
            wightDark(0);
            this.setMode('stand', 3);
          }
        }
        break;
      }
    }
    // Near the end, it speaks.
    if (this.phase === 3 && !this.spoke && this.foeOn) {
      this.spoke = true;
      events.emit('bossSpeaks', { id: 'hollowThane', line: '"Another one," the Hollow Thane breathes, in a voice like wind in a barrow. "The fifth. They always send another."' });
    }
  }


  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode;
    const pose: WightPose = !this.alive ? 'dead' : m === 'raise' ? 'raise' : m === 'breathe' ? 'breathe' : m === 'windup' ? 'windup' : m === 'cut' ? 'cut' : m === 'reel' || m === 'spent' ? 'reel' : Math.hypot(this.vel.x, this.vel.z) > 0.5 ? 'glide' : 'idle';
    L.setPose(pose);
    L.warded = this.alive && !this.open;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10);
    L.update(dt, this.vel);
    // A cold mist curls off it; violet near the end.
    if (this.alive && Math.random() < dt * 8) {
      const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8));
      this.fx.add.spawn({ pos: p, spread: 0.3, count: 1, life: [0.9, 1.6], size: [0.3, 0.5], color: this.phase === 3 ? 0x6a4aa8 : 0x8aa8c0, color2: 0x1a2028, drag: 1.5, upBias: 0.2 });
    }
  }

  update(dt: number, player: Player) {
    super.update(dt, player);
    for (const u of this.risen) u.update(dt, player, this.risen);
  }

  protected onDeath() {
    sfx.groan(this.volume() + 0.3);
    wightDark(0);
    // Its dead lie down again.
    for (const u of this.risen) if (u.alive) u.takeHit({ damage: 1e4, poise: 0, dir: new THREE.Vector3(0, 1, 0), at: u.center.clone(), crit: false, source: 'spell' });
  }

  dispose() {
    super.dispose();
    for (const u of this.risen) u.dispose();
    this.risen.length = 0;
  }

  protected disposeLook() {
    wightDark(0);
    this.look.dispose();
  }
}

const SITE = crownAt(CROWN_SITES.barrow.s, CROWN_SITES.barrow.lat);
const FACE = Math.atan2(-SITE.side.x, -SITE.side.y);
/** The barrow door, where it comes out. */
const DOOR = new THREE.Vector3(SITE.x + Math.sin(FACE) * 10, 0, SITE.z + Math.cos(FACE) * 10);

export const HOLLOW_THANE: BossDef = {
  id: 'hollowThane',
  kind: 'hollowThane',
  name: 'The Hollow Thane',
  title: 'the dead king of the barrow',
  home: { x: Math.round(DOOR.x), z: Math.round(DOOR.z), r: 40 },
  levelBonus: 4,
  looks: ['wight'],
  abroad: (h) => h >= 21 || h < 5,
  spawn: (_at, level, scene, fx) => new HollowThane(new THREE.Vector3(DOOR.x, heightAt(DOOR.x, DOOR.z), DOOR.z), level, scene, fx, new THREE.Vector3(DOOR.x, heightAt(DOOR.x, DOOR.z), DOOR.z)),
  rumour: 'Out on the Crown Road, past the orc marches, there\'s the Barrow of the Old Kings. The carters say that at night a tall thing in a rotted crown comes out of the barrow door, and the dead get up when it lifts its arms. Swords go right through it, they say, unless it\'s busy.',
  found: 'The Hollow Thane. A tall, starved dead king in a crown of green bronze, a pale ward shimmering round it. Blows will glance off that ward. Watch for when it drops.',
  phaseLines: ['The Hollow Thane raises its arms, and more of the barrow\'s dead answer.', 'The Hollow Thane\'s eyes have gone from pale blue to violet.'],
  unique: 'thaneCrown',
  renown: 3,
  slain: 'The Hollow Thane folds down into its rags and is still. Its crown rolls into the grass at your feet: green bronze, older than the Crown of Cresha.',
  again: { items: [['silverOre', 2]], gold: [90, 160] },
  bounty: {
    title: 'Bounty: The Hollow Thane',
    description: 'The Crown pays for the barrow on the Crown Road to be quiet at night. Something in a dead king\'s crown has been raising the barrow dead against the carters. Bring back the crown.',
    gold: 360, xp: 420, rep: 180, minRank: 2,
  },
};
