import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { UndeadVisual, type UndeadPose } from '../creatures/undeadHumanoid/visual';
import type { UndeadVariant } from '../creatures/undeadHumanoid/model';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import { Undead } from '../enemies/undead';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody } from './fieldBosses';

// Three of the discovery bosses are the dead who walk for a reason
// (docs/design/sites.md), one body (creatures/undeadHumanoid), each fighting
// its own way. They share the sword work: a flurry of cuts (the last one
// heavy and parryable: parry it and they reel), an overhead chop that can't
// be parried, only dodged. And each has its own:
//
//   The Drowned Captain (the Drowned Watchtower): calls his drowned crew up
//   out of the water, and spews a wave of black brine that slows you.
//   The Hanged Lord (the Hanging Tree, at midnight): lifts his lantern and his
//   hanged men climb out of the roots; flings burning oil from it; lashes the
//   noose round your neck and drags you to him.
//   The Wraith (the Wrong Stone Circle, at the full moon): drifts, fades out
//   and back in behind you, shrieks (it saps your stamina), and while the
//   circle's stones burn it can barely be hurt: put them out.

export interface DeadLordSpec {
  variant: UndeadVariant;
  kind: string;
  base: CreatureBase;
  scale: number;
  /** how many of its dead it can call at once */
  maxRisen: number;
  /** what it says near the end */
  speech: string;
}

type Mode = 'wait' | 'notice' | 'walk' | 'windup' | 'cut' | 'chopUp' | 'chop' | 'call' | 'special' | 'fade' | 'appear' | 'reel' | 'home';

export class DeadLord extends Creature implements BossBody {
  readonly look: UndeadVisual;
  readonly risen: Undead[] = [];
  mode: Mode = 'wait';
  phase = 1;
  private modeT = 0;
  private modeLen = 1;
  private struck = false;
  private cuts = 0;
  private cutCd = 1;
  private chopCd = 5;
  private callCd = 6;
  private specialCd = 4;
  private fadeCd = 7;
  private foeOn = false;
  private spoke = false;
  private aim = new THREE.Vector3();
  /** the wraith's ward: true while the stones burn (the site sets this) */
  warded: () => boolean = () => false;
  readonly den: THREE.Vector3;
  stats = { cuts: 0, heavy: 0, parried: 0, chops: 0, calls: 0, risen: 0, specials: 0, fades: 0, wardedHits: 0 };

  constructor(readonly spec: DeadLordSpec, at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX) {
    super(spec.kind, spec.base, level, at, scene, fx);
    this.corpseTime = 30;
    this.den = at.clone();
    this.look = new UndeadVisual(spec.variant, { scale: spec.scale });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
    if (spec.variant === 'wraith') this.minAltitude = 0.1;
  }

  get engaged() {
    return this.alive && this.mode !== 'wait' && this.mode !== 'home';
  }

  leash() {
    if (this.mode === 'home' || this.mode === 'wait') return;
    this.foeOn = false;
    this.setMode('home', 999);
  }

  /** It comes for you now (the log read, the grave dug, the moon up). */
  rouse() {
    if (!this.alive || this.mode !== 'wait') return;
    this.foeOn = true;
    this.setMode('notice', 1.4);
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
  private vol(k = 0.6) {
    const c = creatureView.camera;
    return c ? Math.max(0.05, k * (1 - c.distanceTo(this.position) / 60)) : 0.3;
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.mode === 'fade') return;
    let dmg = h.damage;
    if (this.warded()) {
      dmg *= 0.12;
      this.stats.wardedHits++;
      this.fx.add.spawn({ pos: h.at.clone(), spread: 0.4, count: 8, life: [0.2, 0.4], size: [0.07, 0.01], color: 0xb0c8ff, color2: 0x4a5a98, upBias: 0.4, drag: 2 });
    } else if (this.mode === 'reel' || this.mode === 'call') dmg *= 1.4;
    this.hp -= dmg;
    if (!this.foeOn) {
      this.foeOn = true;
      if (this.mode === 'wait' || this.mode === 'home') this.setMode('notice', 0.6);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private callDead(player: Player) {
    const n = this.phase === 3 ? 3 : 2;
    const living = this.risen.filter((u) => u.alive).length;
    for (let i = 0; i < Math.min(n, this.spec.maxRisen - living); i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 4;
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      const u = new Undead('skeleton', new THREE.Vector3(x, heightAt(x, z), z), Math.atan2(player.pos.x - x, player.pos.z - z), this.scene, this.fx);
      this.risen.push(u);
      this.stats.risen++;
      const wet = this.spec.variant === 'drowned';
      this.fx.add.spawn({ pos: new THREE.Vector3(x, heightAt(x, z) + 0.3, z), spread: 0.8, count: 16, life: [0.4, 0.9], size: [0.1, 0.02], color: wet ? 0x3a5a5a : 0x6a5a44, color2: wet ? 0x1a2a2a : 0x2a2018, gravity: 5, upBias: 1.2 });
    }
    for (let i = this.risen.length - 1; i >= 0; i--) if (this.risen[i].dead) this.risen.splice(i, 1);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.cutCd -= dt;
    this.chopCd -= dt;
    this.callCd -= dt;
    this.specialCd -= dt;
    this.fadeCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 6;
    this.stunned = this.mode === 'reel';
    const v = this.spec.variant;
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) this.look.dark(1);
      this.callCd = Math.min(this.callCd, 0.5);
    }
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    const quick = this.phase === 3 ? 1.25 : 1;
    if (this.foeOn && (!canSee || dist > 60)) {
      this.foeOn = false;
      if (this.mode !== 'fade') this.setMode('home', 999);
    }
    switch (this.mode) {
      case 'wait':
        break;
      case 'notice':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) this.setMode('walk', 0.5);
        break;
      case 'walk': {
        this.yaw = dampAngle(this.yaw, face, 4, dt);
        const pace = v === 'wraith' ? 3.4 : dist > 10 ? 3.6 : 2.2;
        if (dist > 2.4) this.wish.copy(to).normalize().multiplyScalar(pace * quick);
        if (this.modeT < this.modeLen) break;
        if (this.callCd <= 0 && v !== 'wraith') {
          this.setMode('call', 2.4);
          this.stats.calls++;
          sfx.groan(this.vol(0.8));
        } else if (v === 'wraith' && this.fadeCd <= 0 && (dist > 10 || Math.random() < dt * 0.5)) {
          this.setMode('fade', 0.8);
          this.stats.fades++;
        } else if (this.specialCd <= 0 && this.specialReady(dist)) {
          this.startSpecial(player, dist);
        } else if (this.chopCd <= 0 && dist < 3.6) {
          this.setMode('chopUp', 0.9 / quick);
        } else if (this.cutCd <= 0 && dist < 3.2) {
          this.cuts = 0;
          this.setMode('windup', 0.45 / quick);
        }
        break;
      }
      case 'windup':
        this.yaw = dampAngle(this.yaw, face, 6, dt);
        if (this.modeT > this.modeLen) this.setMode('cut', 0.42 / quick);
        break;
      case 'cut': {
        // A flurry: two or three quick cuts, the last one heavy.
        const last = this.cuts >= (this.phase === 1 ? 1 : 2);
        if (this.modeT < 0.15) this.wish.copy(this.forward).multiplyScalar(3);
        this.yaw = dampAngle(this.yaw, face, 4, dt);
        if (!this.struck && this.modeT > 0.24) {
          this.struck = true;
          this.stats.cuts++;
          if (last) this.stats.heavy++;
          if (dist < 3.2 && this.forward.dot(to.clone().normalize()) > 0.3 && canSee) {
            playerFoe(player).strike({
              damage: this.damage * (last ? 1.3 : 0.7), from: this.position.clone(), parryable: true, poise: last ? 60 : 20,
              onParried: last ? () => {
                this.stats.parried++;
                this.setMode('reel', 1.8);
              } : undefined,
            });
          }
        }
        if (this.mode === 'cut' && this.modeT > this.modeLen) {
          if (!last) {
            this.cuts++;
            this.look.restart();
            this.setMode('cut', (last ? 0.6 : 0.42) / quick);
          } else {
            this.cutCd = (this.phase === 3 ? 0.9 : 1.6) + Math.random() * 0.8;
            this.setMode('walk', 0.3);
          }
        }
        break;
      }
      case 'chopUp':
        // Up high (the tell): this one can't be parried.
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) this.setMode('chop', 0.8);
        break;
      case 'chop':
        if (this.modeT < 0.12) this.wish.copy(this.forward).multiplyScalar(5);
        if (!this.struck && this.modeT > 0.12) {
          this.struck = true;
          this.stats.chops++;
          const hit = this.position.clone().addScaledVector(this.forward, 1.8);
          if (hit.distanceTo(player.pos) < 2.2 && canSee) playerFoe(player).strike({ damage: this.damage * 1.6, from: this.position.clone(), parryable: false, poise: 80, knock: 5 });
          this.fx.add.spawn({ pos: hit.setY(heightAt(hit.x, hit.z) + 0.1), spread: 0.6, count: 14, life: [0.3, 0.6], size: [0.1, 0.02], color: 0x6a5a4a, color2: 0x2a2018, gravity: 6, upBias: 1 });
          sfx.rumble(0.4, this.vol(0.6));
        }
        if (this.modeT > this.modeLen) {
          this.chopCd = 6 + Math.random() * 3;
          this.setMode('walk', 0.3);
        }
        break;
      case 'call':
        this.yaw = dampAngle(this.yaw, face, 2, dt);
        if (this.modeT > 1.4 && !this.struck) {
          this.struck = true;
          this.callDead(player);
        }
        if (this.modeT > this.modeLen) {
          this.callCd = (this.phase === 3 ? 13 : 18) + Math.random() * 4;
          this.setMode('walk', 0.5);
        }
        break;
      case 'special':
        this.special(dt, player, dist, to, canSee);
        break;
      case 'fade':
        this.look.root.visible = this.modeT < this.modeLen * 0.8;
        if (this.modeT > this.modeLen) {
          const behind = player.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), -3.5);
          this.teleport(new THREE.Vector3(behind.x, heightAt(behind.x, behind.z), behind.z));
          this.yaw = Math.atan2(player.pos.x - behind.x, player.pos.z - behind.z);
          this.fadeCd = (this.phase === 3 ? 6 : 9) + Math.random() * 3;
          this.setMode('appear', 0.6);
        }
        break;
      case 'appear':
        this.look.root.visible = true;
        if (this.modeT > this.modeLen) {
          this.cutCd = 0;
          this.setMode('walk', 0.1);
        }
        break;
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode('walk', 0.4);
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
            this.look.dark(0);
            this.setMode('wait', 1);
          }
        }
        break;
      }
    }
    if (this.phase === 3 && !this.spoke && this.foeOn) {
      this.spoke = true;
      events.emit('bossSpeaks', { id: this.spec.kind, line: this.spec.speech });
    }
  }

  // ---- each one's own move -------------------------------------------------
  private specialReady(dist: number) {
    switch (this.spec.variant) {
      case 'drowned': return dist < 9 && dist > 2.5;
      case 'revenant': return dist > 4 && dist < 16;
      case 'wraith': return dist < 8;
    }
  }

  private startSpecial(player: Player, _dist: number) {
    this.stats.specials++;
    this.aim.copy(player.pos);
    const v = this.spec.variant;
    // The drowned man spews brine; the hanged man flings his lantern's oil or
    // throws the noose; the wraith shrieks.
    const len = v === 'drowned' ? 2.2 : v === 'revenant' ? (this.stats.specials % 2 === 0 ? 1.2 : 3.2) : 2.0;
    this.setMode('special', len);
    this.struck = false;
    if (v === 'wraith') sfx.howl(this.vol(0.8));
    else sfx.groan(this.vol(0.6));
  }

  private special(dt: number, player: Player, dist: number, to: THREE.Vector3, canSee: boolean) {
    const v = this.spec.variant;
    const t = this.modeT;
    this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), v === 'drowned' ? 1.2 : 4, dt);
    if (v === 'drowned') {
      // Jaw wide after a beat; a cone of black brine pours out (slows you).
      if (t > 0.7) {
        const mouth = this.position.clone().setY(this.position.y + 1.7 * this.spec.scale).addScaledVector(this.forward, 0.3);
        if (Math.random() < dt * 30) this.fx.add.spawn({ pos: mouth, vel: this.forward.multiplyScalar(7).setY(-2), spread: 0.25, count: 2, life: [0.5, 0.9], size: [0.25, 0.5], color: 0x2a4a48, color2: 0x0a1414, gravity: 4, drag: 1 });
        if (!this.struck && t > 1.0 && dist < 8 && this.forward.dot(to.clone().normalize()) > 0.75 && canSee) {
          this.struck = true;
          playerFoe(player).strike({ damage: this.damage * 0.6, from: this.position.clone(), parryable: false, poise: 30, web: 2.2, knock: 4 });
        }
      }
    } else if (v === 'revenant') {
      // Alternate: a flask of lantern oil lobbed at where you stood, or the noose.
      const noose = this.stats.specials % 2 === 0;
      if (noose) {
        if (!this.struck && t > 0.7) {
          this.struck = true;
          if (dist < 12 && canSee) {
            // From behind you: the shove drags you to him.
            const from = player.pos.clone().addScaledVector(to.clone().normalize(), 1);
            playerFoe(player).strike({ damage: this.damage * 0.4, from, parryable: false, poise: 50, knock: Math.min(12, dist * 1.4) });
          }
          this.fx.add.spawn({ pos: this.position.clone().setY(this.position.y + 1.4).lerp(player.pos.clone().setY(player.pos.y + 1.4), 0.5), spread: dist * 0.3, count: 12, life: [0.2, 0.3], size: [0.04, 0.01], color: 0x8a7a52, color2: 0x4a3a22 });
          this.cutCd = 0;
        }
      } else if (t > 0.6) {
        if (!this.struck) {
          this.struck = true;
          this.fx.add.spawn({ pos: this.aim.clone().setY(this.aim.y + 0.2), spread: 1.4, count: 30, life: [0.4, 1.0], size: [0.3, 0.05], color: 0xffa040, color2: 0x8a2a08, upBias: 1.4, drag: 1 });
        }
        // The oil burns where it fell for a while.
        if (Math.random() < dt * 14) this.fx.add.spawn({ pos: this.aim.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3)), spread: 0.2, count: 1, life: [0.4, 0.8], size: [0.35, 0.05], color: 0xffa040, color2: 0x8a2a08, upBias: 1.5 });
        if (player.pos.distanceTo(this.aim) < 1.8 && Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
          playerFoe(player).strike({ damage: this.damage * 0.3, from: this.aim.clone(), parryable: false, poise: 5, burn: 4 });
        }
      }
    } else {
      // The shriek: a ring of cold that saps your strength.
      if (!this.struck && t > 0.6) {
        this.struck = true;
        this.fx.add.spawn({ pos: this.center.clone(), spread: 2.5, count: 40, life: [0.4, 0.8], size: [0.2, 0.02], color: 0xa8c8ff, color2: 0x3a3a88, drag: 0.5 });
        if (dist < 8 && canSee) {
          playerFoe(player).strike({ damage: this.damage * 0.5, from: this.position.clone(), parryable: false, poise: 40, knock: 3 });
          player.stamina = Math.max(0, player.stamina - 50);
        }
      }
    }
    if (this.mode === 'special' && t > this.modeLen) {
      this.specialCd = (v === 'revenant' ? 5 : 8) + Math.random() * 3;
      this.setMode('walk', 0.3);
    }
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode, v = this.spec.variant;
    const pose: UndeadPose = !this.alive ? 'dead'
      : m === 'cut' ? 'cut'
      : m === 'windup' ? 'idle'
      : m === 'chopUp' || m === 'chop' ? 'chop'
      : m === 'call' ? (v === 'revenant' ? 'raise' : 'call')
      : m === 'special' ? (v === 'revenant' ? (this.stats.specials % 2 === 0 ? 'cut' : 'raise') : 'call')
      : m === 'reel' ? 'reel' : 'idle';
    if (m === 'chop') {
      // The second half of the chop pose (the blow).
      L.setPose('chop');
      if (L.poseT < 0.5) L.poseT = 0.5;
    } else L.setPose(pose);
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10);
    L.update(dt, Math.hypot(this.vel.x, this.vel.z));
    // Each trails something: drips, a lantern's sparks, a cold mist.
    if (this.alive && Math.random() < dt * 6) {
      const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6));
      if (v === 'drowned') this.fx.add.spawn({ pos: p, spread: 0.1, count: 1, life: [0.3, 0.6], size: [0.04, 0.02], color: 0x5a8a88, color2: 0x1a2a2a, gravity: 9 });
      else if (v === 'wraith') this.fx.add.spawn({ pos: p.setY(this.position.y + 0.2), spread: 0.3, count: 1, life: [0.9, 1.6], size: [0.3, 0.5], color: this.phase === 3 ? 0x6a4aa8 : 0x8aa8c0, color2: 0x1a2028, drag: 1.5, upBias: 0.2 });
    }
  }

  update(dt: number, player: Player) {
    super.update(dt, player);
    for (const u of this.risen) u.update(dt, player, this.risen);
  }

  protected onDeath() {
    sfx.groan(this.vol(1));
    this.look.dark(0);
    this.look.root.visible = true;
    for (const u of this.risen) if (u.alive) u.takeHit({ damage: 1e4, poise: 0, dir: new THREE.Vector3(0, 1, 0), at: u.center.clone(), crit: false, source: 'spell' });
  }

  dispose() {
    super.dispose();
    for (const u of this.risen) u.dispose();
    this.risen.length = 0;
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

export const DROWNED_CAPTAIN: DeadLordSpec = {
  variant: 'drowned', kind: 'drownedCaptain', scale: 1.15, maxRisen: 5,
  base: { name: 'Captain Ansel Hale', hp: 620, damage: 28, radius: 0.45, halfHeight: 0.6 },
  speech: '"Hold the tower," the drowned captain gurgles through a mouthful of lake. "Hold it till they come. They\'re coming. They\'re always coming."',
};
export const HANGED_LORD: DeadLordSpec = {
  variant: 'revenant', kind: 'hangedLord', scale: 1.1, maxRisen: 5,
  base: { name: 'Red Corwen, the Hanged Lord', hp: 680, damage: 30, radius: 0.45, halfHeight: 0.6 },
  speech: '"Mine," Red Corwen rasps round the rope. "Every coin under this tree is mine. I swung for it."',
};
export const WRAITH: DeadLordSpec = {
  variant: 'wraith', kind: 'circleWraith', scale: 1.25, maxRisen: 0,
  base: { name: 'The Wraith of the Wrong Circle', hp: 720, damage: 32, radius: 0.45, halfHeight: 0.65 },
  speech: 'The wraith speaks in a voice like stones grinding: "Fifth. You turn the wheel the right way round. He turned it back. You will see him at the end of it."',
};
