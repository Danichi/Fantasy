import { combat, type AttackKind } from '../combat/core';
import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { WolfVisual, greyjawDark, type WolfPose } from '../creatures/wolf/visual';
import { greyjawGeometry } from '../creatures/wolf/greyjaw';
import { Pack, Wolf } from '../creatures/wolf/wolf';
import { creatureView } from '../creatures/view';
import { playerFoe, type Foe } from '../creatures/foes';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';
import { wolfGlade } from './lairs';

// Old Greyjaw, the night wolf of the north woods. A dire wolf the size of a
// pony, old, scarred and half blind, who hunts only after dark with a pack of
// grey wolves at his heels.
//
// The fight: he notices you, stops, and howls; the pack fans out. He circles
// wide and comes in two ways:
//   - the bite: head low, a rumbling snarl (the tell), then a lunge. Parry it
//     and he reels, open.
//   - the pounce: he sinks onto his haunches, growling (a longer tell), then
//     leaps at where you stand. It can't be parried: get out from under it.
//     If he lands on nothing he stumbles, open.
// Worn down past half he howls again and more wolves come; his eye turns
// violet (the Dark is in him) and he bites twice. Near the end his coat
// smoulders and he is faster still. Kill him and the pack scatters.

const SIZE = 1.9;
const BASE: CreatureBase = { name: 'Old Greyjaw', hp: 560, damage: 22, radius: 0.48, halfHeight: 0.36 };

type Mode = 'roam' | 'notice' | 'howl' | 'circle' | 'snarl' | 'lunge' | 'recoil' | 'gather' | 'leap' | 'reel' | 'rally' | 'home';

export class Greyjaw extends Creature implements BossBody {
  readonly look: WolfVisual;
  readonly pack = new Pack();
  readonly minions: Wolf[] = [];
  mode: Mode = 'roam';
  phase = 1;
  private modeT = 0;
  private modeLen = 2;
  private foe: Foe | null = null;
  private slot = Math.random() * Math.PI * 2;
  private circleDir = Math.random() < 0.5 ? 1 : -1;
  private biteCd = 1.5;
  private pounceCd = 4;
  private combo = 0;
  private bit = false;
  private leapAt = new THREE.Vector3();
  private wander: THREE.Vector3 | null = null;
  private growlT = 1;
  private healT = 0;
  /** stepping round a tree or rock: seconds left, and which way */
  private detourT = 0;
  private detourDir = 1;
  /** territory centre (where it goes to lick its wounds) */
  readonly den: THREE.Vector3;
  /** pounces that landed on you / missed (tests) */
  stats = { pounces: 0, pounceHits: 0, bites: 0, rallies: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den?: THREE.Vector3) {
    super('greyjaw', BASE, level, at, scene, fx);
    this.corpseTime = 40;
    this.den = (den ?? at).clone();
    greyjawDark(0);
    this.look = new WolfVisual({ scale: SIZE, look: 'greyjaw', geometry: greyjawGeometry() });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
    this.look.gait.reset(this.look.root, this.groundAt);
    // His pack: three grey wolves that keep near him and bite one at a time.
    this.pack.follow = this;
    this.pack.maxBiting = 1;
    for (let i = 0; i < 3; i++) this.addWolf(at, 3 + Math.random() * 3, Math.max(1, level - 3));
  }

  private addWolf(near: THREE.Vector3, r: number, level: number) {
    const a = Math.random() * Math.PI * 2;
    const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
    const w = new Wolf(new THREE.Vector3(x, heightAt(x, z), z), level, this.scene, this.fx, { pack: this.pack });
    this.minions.push(w);
    return w;
  }

  get engaged() {
    return this.alive && this.mode !== 'roam' && this.mode !== 'home';
  }

  leash() {
    if (this.mode === 'home') return;
    this.foe = null;
    this.setMode('home', 999);
  }

  private setMode(m: Mode, len = 1) {
    // Its tell (combat/core.ts): the colour says how to answer it; a blow now is a counter-hit.
    const tell = ({ snarl: ['normal', 0.2, 0], gather: ['unblockable', 0.25, 1.0] } as Partial<Record<Mode, [AttackKind, number, number]>>)[m];
    if (tell) combat.windup(this, len + tell[1], tell[0], tell[2] ? len + tell[2] : 0);
    this.mode = m;
    this.modeT = 0;
    this.modeLen = len;
  }
  private get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  private volume() {
    const c = creatureView.camera;
    return c ? Math.max(0.05, 0.6 * (1 - c.distanceTo(this.position) / 70)) : 0.3;
  }
  /** quicker as he is worn down */
  private get haste() {
    return this.phase === 3 ? 1.2 : this.phase === 2 ? 1.1 : 1;
  }

  private engage(foe: Foe) {
    this.foe = foe;
    if (this.mode === 'roam' || this.mode === 'home') this.setMode('notice', 0.9);
    for (const w of this.minions) if (w.alive) w.rally(foe);
  }

  /** Call the pack in: two more wolves come out of the trees. */
  private callPack() {
    this.stats.rallies++;
    const foe = this.foe;
    const living = this.minions.filter((w) => w.alive).length;
    for (let i = 0; i < Math.min(2, 5 - living); i++) {
      const w = this.addWolf(foe ? foe.pos : this.position, 20 + Math.random() * 6, Math.max(1, this.level - 3));
      if (foe) w.rally(foe);
    }
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.biteCd -= dt;
    this.pounceCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 8;
    this.stunned = this.mode === 'reel';
    const h = this.haste;
    const walk = 1.6, trot = 4.2 * h, run = 9.5 * h;

    // Worn down: the next phase, announced with a howl that calls the pack.
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase && this.mode !== 'leap') {
      this.phase = want;
      greyjawDark(want === 2 ? 0.55 : 1);
      this.setMode('rally', 2.6);
      sfx.howl(this.volume() + 0.25);
    }

    // Who to fight: you, if you're close and not hidden.
    const pf = playerFoe(player);
    const canSee = !player.dead && !ignoresPlayer(this);
    const d0 = player.pos.distanceTo(this.position);
    if (canSee && (this.mode === 'roam') && d0 < (creatureView.night ? 32 : 24)) this.engage(pf);
    if (this.foe && (!this.foe.alive || (this.foe === pf && !canSee) || this.foe.pos.distanceTo(this.position) > 60)) {
      this.foe = null;
      // Lost you: back to wandering, or home to lick his wounds if you hurt him.
      if (this.mode !== 'home' && this.mode !== 'leap') this.setMode(this.hp < this.maxHp ? 'home' : 'roam', 2);
    }
    const foe = this.foe;
    const to = foe ? foe.pos.clone().sub(this.position).setY(0) : new THREE.Vector3();
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);

    switch (this.mode) {
      case 'roam': {
        // Prowl the territory; the pack keeps near.
        if (!this.wander || this.wander.distanceTo(this.position) < 2 || this.bumped || this.modeT > 25) {
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 30;
          this.wander = this.den.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
          this.modeT = 0;
        }
        const d = this.wander.clone().sub(this.position).setY(0);
        if (d.length() > 1.5) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 2.5, dt);
          this.wish.copy(this.forward).multiplyScalar(walk);
        }
        break;
      }
      case 'notice':
        this.yaw = dampAngle(this.yaw, face, 5, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('howl', 2.4);
          sfx.howl(this.volume() + 0.2);
        }
        break;
      case 'howl':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) this.setMode('circle', 1.2);
        break;
      case 'rally':
        // The phase howl: muzzle to the sky; the pack answers out of the dark.
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > 1 && this.modeT - dt <= 1) this.callPack();
        if (this.modeT > this.modeLen) this.setMode('circle', 0.8);
        break;
      case 'circle': {
        if (!foe) break;
        // Wide and slow round you, head turned in.
        this.slot += dt * 0.4 * this.circleDir;
        const r = 6 + Math.sin(this.modeT * 0.7) * 1;
        const spot = foe.pos.clone().add(new THREE.Vector3(Math.cos(this.slot) * r, 0, Math.sin(this.slot) * r));
        const d = spot.sub(this.position).setY(0);
        if (dist > 14) this.wish.copy(to).normalize().multiplyScalar(run * 0.8);
        else if (d.length() > 0.4) this.wish.copy(d.normalize()).multiplyScalar(Math.min(trot, d.length() * 2.5));
        this.yaw = dampAngle(this.yaw, face, 6, dt);
        if (this.bumped) this.circleDir *= -1;
        this.growlT -= dt;
        if (this.growlT <= 0) {
          this.growlT = 1.8 + Math.random() * 3;
          sfx.growl(this.volume() * 0.9);
        }
        if (this.modeT < 0.6) break;
        // Pounce from range now and then; otherwise the bite.
        if (this.pounceCd <= 0 && dist > 4.5 && dist < 14 && (dist > 9 || Math.random() < dt * 1.2)) {
          this.setMode('gather', this.phase === 3 ? 0.6 : 0.85);
          this.leapAt.copy(foe.pos);
        } else if (this.biteCd <= 0 && dist < 8.5) {
          this.combo = 0;
          this.setMode('snarl', this.phase === 1 ? 0.55 : 0.42);
        }
        break;
      }
      case 'snarl':
        this.yaw = dampAngle(this.yaw, face, 10, dt);
        if (this.modeT > this.modeLen) {
          // Long enough to reach you, no longer.
          this.setMode('lunge', THREE.MathUtils.clamp(dist / (run * 1.1) + 0.25, 0.4, 1.1));
          this.bit = false;
          sfx.snarl(this.volume());
        }
        break;
      case 'lunge': {
        this.accel = 14;
        if (this.modeT < 0.22) this.yaw = dampAngle(this.yaw, face, 7, dt);
        this.wish.copy(this.forward).multiplyScalar(run * 1.1);
        if (foe && !this.bit && dist < 1.25 * SIZE + 0.4 && to.clone().normalize().dot(this.forward) > 0.2) {
          this.bit = true;
          this.stats.bites++;
          foe.strike({
            damage: this.damage, from: this.position.clone(), parryable: true, poise: 80, knock: 3.5,
            onParried: () => {
              this.vel.copy(this.forward).multiplyScalar(-5);
              this.setMode('reel', 1.7);
              sfx.yelp(this.volume());
            },
          });
          if (this.mode === 'lunge') {
            // Worn down, he bites twice.
            if (this.phase >= 2 && this.combo === 0) {
              this.combo = 1;
              this.setMode('snarl', 0.22);
            } else this.setMode('recoil', 0.7);
          }
        } else if (this.modeT > this.modeLen) this.setMode('recoil', 0.5);
        break;
      }
      case 'recoil':
        if (foe) {
          this.yaw = dampAngle(this.yaw, face, 5, dt);
          this.wish.copy(to).normalize().multiplyScalar(-trot);
        }
        if (this.modeT > this.modeLen) {
          this.biteCd = (this.phase === 3 ? 1.1 : 1.8) + Math.random() * 1.5;
          this.setMode('circle', 0.5);
        }
        break;
      case 'gather':
        // Haunches down, growling: the pounce is coming. He tracks you as he gathers.
        if (foe) {
          this.yaw = dampAngle(this.yaw, face, 6, dt);
          this.leapAt.lerp(foe.pos, Math.min(1, dt * 4));
        }
        if (this.modeT > this.modeLen) {
          const d = this.leapAt.clone().sub(this.position).setY(0);
          const D = THREE.MathUtils.clamp(d.length(), 3, 14);
          const T = 0.66;
          d.normalize().multiplyScalar(D / T);
          this.vel.set(d.x, 20 * T * 0.5, d.z);
          this.wish.set(d.x, 0, d.z);
          this.yaw = Math.atan2(d.x, d.z);
          this.setGroundSnap(false);
          this.setMode('leap', 1.6);
          this.bit = false;
          this.stats.pounces++;
          sfx.snarl(this.volume() + 0.1);
        }
        break;
      case 'leap': {
        // In the air: hold the line; land on whatever is under him.
        this.accel = 0.2;
        this.wish.set(this.vel.x, 0, this.vel.z);
        if (this.modeT > 0.15 && (this.grounded || this.modeT > this.modeLen)) {
          this.setGroundSnap(true);
          this.pounceCd = (this.phase === 3 ? 3.5 : 5.5) + Math.random() * 3;
          events.emit('bossSlam', { at: this.position.clone() });
          this.fx.dust(this.position.clone(), 3);
          const hit = foe && foe.pos.distanceTo(this.position) < 2.3;
          if (hit) {
            this.stats.pounceHits++;
            foe.strike({ damage: this.damage * 1.5, from: this.position.clone().addScaledVector(this.forward, -2), parryable: false, poise: 140, knock: 7 });
            this.setMode('recoil', 0.6);
          } else {
            // Landed on nothing: he stumbles, open.
            this.setMode('reel', 1.2);
          }
          this.vel.x *= 0.2;
          this.vel.z *= 0.2;
        }
        break;
      }
      case 'reel':
        if (this.modeT > this.modeLen) this.setMode(foe ? 'circle' : 'roam', 0.6);
        break;
      case 'home': {
        // Back to the den to lick his wounds; he heals there.
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 5) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 4, dt);
          this.wish.copy(this.forward).multiplyScalar(trot * 1.4);
          this.healT = 0;
        } else {
          this.healT += dt;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
          if (this.hp >= this.maxHp) {
            this.phase = 1;
            greyjawDark(0);
            this.setMode('roam', 2);
          }
        }
        break;
      }
    }
    // Blocked by a tree or a rock: step round it for a moment.
    if (this.mode !== 'leap' && this.mode !== 'lunge') {
      if (this.bumped && this.detourT <= 0 && this.wish.lengthSq() > 1) {
        this.detourT = 0.7 + Math.random() * 0.5;
        this.detourDir = Math.random() < 0.5 ? 1 : -1;
      }
      if (this.detourT > 0) {
        this.detourT -= dt;
        this.wish.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.detourDir * 1.2);
      }
    }
  }

  protected onHurt(_h: HitInfo) {
    const player = creatureView.player;
    if (player && (this.mode === 'roam' || this.mode === 'home') && player.pos.distanceTo(this.position) < 90) this.engage(playerFoe(player));
  }

  protected onDeath() {
    sfx.yelp(this.volume() + 0.2);
    greyjawDark(0);
    this.pack.broken = true;
    for (const w of this.minions) w.panic();
  }

  update(dt: number, player: Player) {
    super.update(dt, player);
    for (const w of this.minions) if (!w.dead) w.update(dt, player);
    if (this.minions.some((w) => w.dead)) this.minions.splice(0, this.minions.length, ...this.minions.filter((w) => !w.dead));
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    const m = this.mode;
    const pose: WolfPose = !this.alive
      ? 'dead'
      : m === 'howl' || m === 'rally' ? 'howl'
      : m === 'notice' ? 'alert'
      : m === 'snarl' ? 'snarl'
      : m === 'lunge' ? 'lunge'
      : m === 'gather' || m === 'leap' ? 'pounce'
      : m === 'reel' ? 'hurt'
      : m === 'circle' ? (Math.hypot(this.vel.x, this.vel.z) < 2.5 ? 'snarl' : 'idle')
      : 'idle';
    L.setPose(pose);
    L.airborne = this.alive && m === 'leap' && !this.grounded;
    L.lookAt = this.alive && this.foe && (m === 'circle' || m === 'notice') ? this.foe.center : null;
    const cam = creatureView.camera;
    L.lod(cam ? cam.distanceTo(this.position) : 10, creatureView.fur);
    L.update(dt, this.vel, this.groundAt);
    // The Dark in him: a smoulder off his coat, thicker at the end.
    if (this.alive && this.phase >= 2 && Math.random() < dt * (this.phase === 3 ? 16 : 6)) {
      const p = this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.9, (Math.random() - 0.5) * 1.4));
      this.fx.add.spawn({ pos: p, spread: 0.3, count: 1, life: [0.7, 1.4], size: [0.26, 0.05], color: 0x2a1840, color2: 0x07040c, upBias: 0.7, drag: 1 });
    }
    if (!this.alive && this.deadT > this.corpseTime - 2) L.root.position.y -= (this.deadT - (this.corpseTime - 2)) * 0.4;
  }

  dispose() {
    super.dispose();
    for (const w of this.minions) w.dispose();
    this.minions.length = 0;
  }

  protected disposeLook() {
    greyjawDark(0);
    this.look.dispose();
  }
}

export const GREYJAW: BossDef = {
  id: 'greyjaw',
  kind: 'greyjaw',
  name: 'Old Greyjaw',
  title: 'the Night Wolf of the North Woods',
  home: { x: -370, z: -210, r: 70 },
  levelBonus: 4,
  lair: wolfGlade,
  clearing: 24,
  looks: ['greyjaw', 'wolf'],
  abroad: (h) => h >= 20.5 || h < 5,
  spawn: (at, level, scene, fx) => new Greyjaw(at, level, scene, fx, new THREE.Vector3(GREYJAW.home.x, heightAt(GREYJAW.home.x, GREYJAW.home.z), GREYJAW.home.z)),
  rumour: 'Old Greyjaw is hunting the north woods again. Grey as frost and big as a pony, one eye gone white. He only comes out at night, and never alone.',
  found: 'Old Greyjaw. A dire wolf the size of a pony, grey as frost, one eye milky white. His pack fans out around him.',
  phaseLines: ['Old Greyjaw howls, and the woods answer. His good eye has turned violet.', 'Old Greyjaw\'s coat smoulders with something that isn\'t smoke. The Dark is in him, and he will not stop.'],
  unique: 'greyjawFang',
  renown: 2,
  slain: 'Old Greyjaw is dead, and his pack scatters into the trees. You take one of his great yellow fangs.',
  again: { items: [['rawHide', 3], ['rawMeat', 2]], gold: [60, 110] },
  bounty: {
    title: 'Bounty: Old Greyjaw',
    description: 'A dire wolf the size of a pony leads a pack through the north woods by night. He has taken sheep, a shepherd\'s dog, and last winter the shepherd. The guild pays for his head.',
    gold: 260, xp: 320, rep: 140, minRank: 1,
  },
};
