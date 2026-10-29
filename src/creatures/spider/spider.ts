import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creature';
import { SpiderVisual, type SpiderPose } from './visual';
import { Snare } from './webs';
import { dampAngle } from '../../core/math';
import { ignoresPlayer } from '../../origins/stealth';
import { sfx } from '../../audio/sfx';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import { creatureView } from '../view';

// The Giant Forest Spider hunts by ambush. It waits still in the undergrowth;
// come close and it rears up, legs raised and fangs spread, hissing. Then it
// works you: skittering sideways, flinging web from its spinnerets to stick
// your feet, and leaping in to bite with venom before scuttling back out of
// reach. Block the web with a shield or roll out of it; parry the bite and it
// is flipped, legs kicking, open to a riposte.

const BASE: CreatureBase = { name: 'Giant Forest Spider', hp: 62, damage: 13, radius: 0.5, halfHeight: 0.12 };

type Mode = 'lurk' | 'threat' | 'stalk' | 'spit' | 'crouch' | 'leap' | 'bite' | 'retreat' | 'hurt' | 'flipped';

interface Glob {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

let snare: Snare | null = null;
/** The web on the player's feet: shown while it holds, whoever spun it (main calls this each frame). */
export function updateSnare(player: Player) {
  snare?.update(player.pos, player.webbed);
}
let globGeo: THREE.BufferGeometry | null = null;
let globMat: THREE.MeshStandardMaterial | null = null;

export class Spider extends Creature {
  readonly look: SpiderVisual;
  private mode: Mode = 'lurk';
  private modeT = 0;
  private modeLen = 2;
  private angry = false;
  private spitCd = 1.5;
  private leapCd = 0;
  private circleDir = Math.random() < 0.5 ? 1 : -1;
  private bitten = false;
  private spat = false;
  private globs: Glob[] = [];
  private size: number;
  private chitterT = 3;
  private wander: THREE.Vector3 | null = null;

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, opts: { size?: number } = {}) {
    super('spider', BASE, level, at, scene, fx);
    this.size = opts.size ?? 0.9 + Math.min(0.25, level * 0.02) + Math.random() * 0.12;
    this.radius = BASE.radius * this.size;
    this.look = new SpiderVisual({ scale: this.size });
    this.look.root.position.copy(at);
    this.look.root.rotation.y = this.yaw;
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
    snare ??= new Snare(scene);
  }

  private setMode(m: Mode, len = 1) {
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;    if (m === 'crouch') this.tell(len + 0.15);
    else if (m === 'spit') this.tell(len * 0.45);
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private volume(player: Player) {
    return Math.max(0, 0.45 * (1 - player.pos.distanceTo(this.position) / 30));
  }

  private rouse(player: Player) {
    if (this.angry) return;
    this.angry = true;
    this.setMode('threat', 0.9);
    sfx.hiss(this.volume(player) + 0.1);
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.spitCd -= dt;
    this.leapCd -= dt;
    this.stunned = this.mode === 'flipped';
    this.accel = 12;
    this.wish.set(0, 0, 0);
    const toP = player.pos.clone().sub(this.position).setY(0);
    const dist = toP.length();
    const faceP = Math.atan2(toP.x, toP.z);
    const ignored = player.dead || ignoresPlayer(this);
    const s = this.size;
    const scuttle = 3.6 * s, dash = 6.5 * s;
    this.updateGlobs(dt, player);
    if (this.angry && (ignored || dist > 30)) {
      this.angry = false;
      this.setMode('lurk', 2);
    }

    switch (this.mode) {
      case 'lurk': {
        // Mostly still; now and then it creeps to a new spot.
        const night = creatureView.night;
        if (!ignored && dist < (night ? 16 : 12)) {
          this.yaw = dampAngle(this.yaw, faceP, 3, dt);
          this.rouse(player);
          break;
        }
        if (this.modeT > this.modeLen && !this.wander) {
          const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 5;
          this.wander = this.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        if (this.wander) {
          const to = this.wander.clone().sub(this.position).setY(0);
          if (to.length() < 0.5 || this.bumped) {
            this.wander = null;
            this.setMode('lurk', 3 + Math.random() * 7);
          } else {
            this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 4, dt);
            this.wish.copy(this.forward).multiplyScalar(1.2 * s);
          }
        }
        break;
      }
      case 'threat':
        this.yaw = dampAngle(this.yaw, faceP, 6, dt);
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.8 + Math.random());
        break;
      case 'stalk': {
        // Skitter around at the edge of reach, then pick a move.
        this.yaw = dampAngle(this.yaw, faceP, 7, dt);
        const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(this.circleDir);
        const keep = dist < 4 ? -1 : dist > 7 ? 1 : 0;
        this.wish.copy(side).multiplyScalar(scuttle).addScaledVector(toP.clone().normalize(), keep * scuttle * 0.8);
        if (this.bumped) this.circleDir *= -1;
        this.chitterT -= dt;
        if (this.chitterT <= 0) {
          this.chitterT = 1.5 + Math.random() * 3;
          sfx.chitter(this.volume(player));
        }
        if (this.modeT > this.modeLen) {
          if (dist < 2.2) this.setMode('bite', 0.75);
          else if (dist < 6.5 && this.leapCd <= 0) this.setMode('crouch', 0.38);
          else if (dist < 15 && this.spitCd <= 0) this.setMode('spit', 1.0);
          else this.setMode('stalk', 0.5 + Math.random() * 0.6);
          if (Math.random() < 0.3) this.circleDir *= -1;
        }
        break;
      }
      case 'spit': {
        // Turn tail-on? No: tips the abdomen up over its back and flings.
        this.yaw = dampAngle(this.yaw, faceP, 8, dt);
        if (this.modeT > 0.45 && !this.spat) {
          this.spat = true;
          this.fling(player);
        }
        if (this.modeT > this.modeLen) {
          this.spat = false;
          this.spitCd = 3.5 + Math.random() * 2.5;
          this.setMode('stalk', 0.6 + Math.random() * 0.8);
        }
        break;
      }
      case 'crouch':
        // The tell: it sinks low and goes still for a beat.
        this.yaw = dampAngle(this.yaw, faceP, 10, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('leap', 0.42);
          this.bitten = false;
          this.vel.copy(toP.clone().normalize()).multiplyScalar(Math.min(dash * 1.5, dist / 0.42 + 1));
          this.vel.y = 3.2;
          sfx.hiss(this.volume(player) * 0.6);
        }
        break;
      case 'leap':
        this.accel = 0.5; // ballistic
        this.wish.copy(this.vel).setY(0);
        if (!this.bitten && dist < 1.5 * s + 0.4) this.bite(player);
        if (this.modeT > this.modeLen) {
          this.leapCd = 2.5 + Math.random() * 1.5;
          this.setMode(this.bitten ? 'retreat' : 'stalk', 0.8);
        }
        break;
      case 'bite':
        this.yaw = dampAngle(this.yaw, faceP, 10, dt);
        if (this.modeT > 0.3 && this.modeT < 0.45) this.wish.copy(this.forward).multiplyScalar(2.5);
        if (this.modeT > 0.38 && !this.bitten) {
          if (dist < 2.1 * s && toP.clone().normalize().dot(this.forward) > 0.3) this.bite(player);
          this.bitten = true;
        }
        if (this.modeT > this.modeLen) {
          this.bitten = false;
          this.setMode('retreat', 0.7);
        }
        break;
      case 'retreat':
        // Hit and run: back off out of reach.
        this.yaw = dampAngle(this.yaw, faceP, 6, dt);
        this.wish.copy(toP).normalize().multiplyScalar(-dash * 0.8);
        if (this.modeT > this.modeLen) this.setMode('stalk', 0.6 + Math.random() * 0.8);
        break;
      case 'hurt':
        if (this.modeT > this.modeLen) this.setMode(this.angry ? 'retreat' : 'threat', 0.5);
        break;
      case 'flipped':
        if (this.modeT > this.modeLen) {
          this.stunned = false;
          this.setMode('retreat', 0.6);
        }
        break;
    }
  }

  private bite(player: Player) {
    this.bitten = true;
    player.receiveAttack({
      damage: this.damage, from: this.position.clone(), parryable: true, poise: 30, poison: 2.2 + this.level * 0.35,
      onParried: () => {
        this.stunned = true;
        this.vel.copy(this.forward).multiplyScalar(-3.5);
        this.vel.y = 2.5;
        this.setMode('flipped', 2.2);
        sfx.hiss(0.3);
      },
    });
  }

  /** A gob of web, lobbed to where you will be. */
  private fling(player: Player) {
    globGeo ??= new THREE.IcosahedronGeometry(0.16, 1);
    globMat ??= new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.55, transparent: true, opacity: 0.92 });
    const from = this.position.clone().addScaledVector(this.forward, -0.4 * this.size).setY(this.position.y + 1.1 * this.size);
    const lead = player.pos.clone().addScaledVector(player.vel.clone().setY(0), 0.35).setY(player.pos.y + 0.6);
    const flight = Math.max(0.35, from.distanceTo(lead) / 16);
    const vel = lead.clone().sub(from).divideScalar(flight);
    vel.y += 0.5 * 14 * flight; // gravity 14
    const mesh = new THREE.Mesh(globGeo, globMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.globs.push({ mesh, vel, life: 2.5 });
    sfx.hiss(this.volume(player) * 0.5);
  }

  private updateGlobs(dt: number, player: Player) {
    for (const g of this.globs) {
      g.life -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += dt * 9;
      if (Math.random() < dt * 30) this.fx.add.spawn({ pos: g.mesh.position.clone(), spread: 0.15, count: 1, life: [0.2, 0.45], size: [0.06, 0.01], color: 0xf6f3ea, color2: 0xd8d4c8, gravity: 2 });
      const at = g.mesh.position;
      if (player.center.distanceTo(at) < 0.75) {
        const res = player.receiveAttack({ damage: this.damage * 0.35, from: at.clone().sub(g.vel.clone().normalize()), at: at.clone(), parryable: false, poise: 8, projectile: true, web: 2.6 });
        if (res === 'hit') this.fx.add.spawn({ pos: at.clone(), spread: 1.2, count: 18, life: [0.3, 0.7], size: [0.08, 0.01], color: 0xffffff, color2: 0xd8d4c8, gravity: 3 });
        g.life = 0;
      } else if (at.y < this.groundAt(at.x, at.z)) g.life = 0;
    }
    for (const g of this.globs.filter((x) => x.life <= 0)) g.mesh.removeFromParent();
    this.globs = this.globs.filter((x) => x.life > 0);
  }

  protected onHurt(h: HitInfo) {
    const player = creatureView.player;
    if (player && !this.angry) this.rouse(player);
    if (this.mode === 'flipped') return;
    if (h.crit || h.poise > 30) this.setMode('hurt', 0.35);
  }

  protected onDeath() {
    sfx.hiss(0.35);
    for (const g of this.globs) g.mesh.removeFromParent();
    this.globs = [];
  }

  protected animate(dt: number, player: Player) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const pose: SpiderPose = !this.alive
      ? 'dead'
      : this.mode === 'threat' ? 'threat'
      : this.mode === 'spit' ? 'spit'
      : this.mode === 'bite' || this.mode === 'leap' ? 'bite'
      : this.mode === 'hurt' || this.mode === 'flipped' ? 'hurt'
      : this.mode === 'crouch' ? 'crouch'
      : 'idle';
    L.setPose(pose);
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, creatureView.fur);
    L.update(dt, this.vel, this.groundAt);
    if (!this.alive && this.deadT > this.corpseTime - 1.5) L.root.position.y -= (this.deadT - (this.corpseTime - 1.5)) * 0.3;
  }

  protected disposeLook() {
    for (const g of this.globs) g.mesh.removeFromParent();
    this.globs = [];
    this.look.dispose();
  }
}
