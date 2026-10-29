import { combat, type AttackKind } from '../combat/core';
import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { OozeVisual } from '../creatures/ooze/visual';
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
import { mire } from './lairs';

// Mother Ooze, of the mire below the mill: a heap of green jelly as big as a
// haycart, with what she has eaten turning slowly inside her (a ribcage, a
// skull, a knight's helm, his sword). She creeps; she gathers herself and
// leaps; she surges forward and swallows whatever is in front of her.
//
//   - Leap: she squashes down, quivering (the tell), then jumps at you and
//     splats: get out from under her.
//   - Surge: her front bulges (the tell), then she lurches forward over you.
//     Caught, you're stuck in her and the acid burns; roll to tear free.
//   - Spit (worn down): she lobs globs of acid that leave burning puddles.
//   - Split: hit her hard and a lump of her breaks off and comes after you.
//     The spawn crawl back to her if they can, and she heals: kill them.
// She shrinks as she's worn down. Near the end a violet heart shows in her.

const BASE: CreatureBase = { name: 'Mother Ooze', hp: 780, damage: 24, radius: 1.5, halfHeight: 0.35 };

type Mode = 'lurk' | 'creep' | 'gather' | 'leap' | 'splat' | 'bulge' | 'surge' | 'spit' | 'home';

/** A lump of her that broke off: hops at you, or back to her to rejoin. */
export class OozeSpawn extends Creature {
  readonly look: OozeVisual;
  private hopT = Math.random();
  private air = false;
  private bit = false;
  private landT = 0;
  merged = false;
  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, private mother: MotherOoze) {
    super('oozeSpawn', { name: 'Ooze Spawn', hp: 46, damage: 9, radius: 0.4, halfHeight: 0.05 }, level, at, scene, fx);
    this.corpseTime = 1.2;
    this.look = new OozeVisual({ look: 'spawn', size: 0.5 + Math.random() * 0.15 });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
  }
  protected think(dt: number, player: Player) {
    this.wish.set(0, 0, 0);
    this.accel = 3;
    const m = this.mother;
    // Back to her if she's hurt and near; otherwise at you.
    const home = m.alive && m.hp < m.maxHp && m.position.distanceTo(this.position) < 14;
    const target = home ? m.position : player.pos;
    const d = target.clone().sub(this.position).setY(0);
    this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 6, dt);
    if (home && d.length() < m.size + 0.3) {
      // Rejoined: she takes it back in.
      this.merged = true;
      m.absorb();
      this.alive = false;
      this.deadT = this.corpseTime;
      return;
    }
    this.hopT -= dt;
    if (!this.air && this.grounded && this.hopT <= 0) {
      this.hopT = 0.7 + Math.random() * 0.5;
      const dir = d.normalize();
      this.vel.set(dir.x * 4.5, 5.5, dir.z * 4.5);
      this.air = true;
      this.bit = false;
      this.look.setSquash(1.4);
    }
    if (this.air) {
      this.wish.set(this.vel.x, 0, this.vel.z);
      if (!home && !this.bit && player.pos.distanceTo(this.position) < 1.1 && !player.dead && !ignoresPlayer(this)) {
        this.bit = true;
        playerFoe(player).strike({ damage: this.damage, from: this.position.clone(), parryable: true, poise: 20, poison: 3 });
      }
      if (this.grounded && this.vel.y <= 0) {
        this.air = false;
        this.look.setSquash(0.7);
        this.landT = 0.12;
      }
    }
    if (this.landT > 0) {
      this.landT -= dt;
      if (this.landT <= 0) this.look.setSquash(1);
    }
  }
  protected animate(dt: number) {
    this.look.root.position.copy(this.position);
    this.look.root.rotation.y = this.yaw;
    if (!this.alive) this.look.melt = Math.min(1, this.look.melt + dt * 2);
    this.look.update(dt);
  }
  protected onHurt() {
    this.look.hit(0.8);
  }
  protected disposeLook() {
    this.look.dispose();
  }
}

/** A lobbed glob of acid, and the puddle it leaves. */
interface Glob {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  puddle: THREE.Mesh | null;
  life: number;
  tick: number;
}
const globGeo = new THREE.IcosahedronGeometry(0.22, 1);
const globMat = new THREE.MeshStandardMaterial({ color: 0x9acb3a, emissive: new THREE.Color(0x2a4a08), roughness: 0.2, transparent: true, opacity: 0.85 });
const puddleMat = new THREE.MeshStandardMaterial({ color: 0x7aa82a, emissive: new THREE.Color(0x1a3a04), roughness: 0.15, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });

export class MotherOoze extends Creature implements BossBody {
  readonly look: OozeVisual;
  readonly minions: OozeSpawn[] = [];
  mode: Mode = 'lurk';
  phase = 1;
  private modeT = 0;
  private modeLen = 2;
  private foeOn = false;
  private struck = false;
  private leapCd = 3;
  private surgeCd = 6;
  private spitCd = 4;
  private splitCd = 0;
  private globs: Glob[] = [];
  private leapAt = new THREE.Vector3();
  readonly den: THREE.Vector3;
  stats = { leaps: 0, leapHits: 0, surges: 0, engulfed: 0, splits: 0, absorbed: 0, globs: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den?: THREE.Vector3) {
    super('motherOoze', BASE, level, at, scene, fx);
    this.corpseTime = 40;
    this.den = (den ?? at).clone();
    this.look = new OozeVisual({ look: 'mother', size: 2.4 });
    this.look.root.position.copy(at);
    scene.add(this.look.root);
  }

  /** Her radius now (she shrinks as she's worn down). */
  get size() {
    return 1.4 + 1.0 * Math.sqrt(Math.max(0, this.hp / this.maxHp));
  }

  get engaged() {
    return this.alive && this.mode !== 'lurk' && this.mode !== 'home';
  }

  leash() {
    if (this.mode === 'home') return;
    this.foeOn = false;
    this.setMode('home', 999);
  }

  /** A spawn crawled back into her. */
  absorb() {
    this.stats.absorbed++;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03);
    this.look.hit(0.6);
  }

  private setMode(m: Mode, len = 1) {
    // Its tell (combat/core.ts): the colour says how to answer it; a blow now is a counter-hit.
    const tell = ({ gather: ['unblockable', 0.25, 1.0], bulge: ['heavy', 0.15, 0], spit: ['normal', 0, 0] } as Partial<Record<Mode, [AttackKind, number, number]>>)[m];
    if (tell) combat.windup(this, len + tell[1], tell[0], tell[2] ? len + tell[2] : 0);
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

  private spawnLump(n = 1) {
    for (let i = 0; i < n && this.minions.filter((m) => m.alive).length < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = this.size + 0.6;
      const x = this.position.x + Math.cos(a) * r, z = this.position.z + Math.sin(a) * r;
      const s = new OozeSpawn(new THREE.Vector3(x, heightAt(x, z), z), Math.max(1, this.level - 4), this.scene, this.fx, this);
      s.vel.set(Math.cos(a) * 3, 4, Math.sin(a) * 3);
      this.minions.push(s);
      this.stats.splits++;
    }
    this.fx.add.spawn({ pos: this.center.clone(), spread: 1.2, count: 18, life: [0.3, 0.7], size: [0.12, 0.03], color: 0x9acb3a, color2: 0x3a5a14, gravity: 8, upBias: 1 });
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    this.look.hit(Math.min(1.2, 0.3 + h.damage / 60));
    if (!this.foeOn) {
      this.foeOn = true;
      if (this.mode === 'lurk' || this.mode === 'home') this.setMode('creep', 1);
    }
    // A heavy blow knocks a lump of her loose.
    if ((h.poise >= 50 || h.damage >= this.maxHp * 0.05) && this.splitCd <= 0) {
      this.splitCd = 1.5;
      this.spawnLump(1);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.leapCd -= dt;
    this.surgeCd -= dt;
    this.spitCd -= dt;
    this.splitCd -= dt;
    this.wish.set(0, 0, 0);
    this.accel = 4;
    this.stunned = this.mode === 'splat' && this.modeT > 0.2;
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      this.spawnLump(3);
      sfx.groan(this.volume() + 0.2);
    }
    this.look.dark += ((this.phase === 3 ? 1 : 0) - this.look.dark) * Math.min(1, dt * 2);
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    if (canSee && this.mode === 'lurk' && dist < 18) {
      this.foeOn = true;
      this.setMode('creep', 1);
    }
    if (this.foeOn && (!canSee || dist > 50)) {
      this.foeOn = false;
      if (this.mode !== 'leap') this.setMode(this.hp < this.maxHp ? 'home' : 'lurk', 3);
    }
    const R = this.size;

    switch (this.mode) {
      case 'lurk':
        this.look.setSquash(1 + Math.sin(this.modeT * 1.5) * 0.03);
        break;
      case 'creep': {
        this.look.setSquash(1 + Math.sin(this.modeT * 4) * 0.05);
        this.look.setBulge(0);
        this.yaw = dampAngle(this.yaw, face, 2, dt);
        if (dist > R + 1) this.wish.copy(to).normalize().multiplyScalar(this.phase === 3 ? 2.3 : 1.7);
        if (this.modeT < 0.8) break;
        if (this.phase >= 2 && this.spitCd <= 0 && dist > 6 && dist < 22) this.setMode('spit', 1.4);
        else if (this.leapCd <= 0 && dist > 4 && dist < 14) {
          this.setMode('gather', this.phase === 3 ? 0.7 : 0.95);
          this.leapAt.copy(player.pos);
        } else if (this.surgeCd <= 0 && dist < R + 3.2) this.setMode('bulge', this.phase === 3 ? 0.55 : 0.75);
        break;
      }
      case 'gather':
        // Squashed down, quivering: the leap is coming.
        this.look.setSquash(0.62 + Math.sin(this.modeT * 40) * 0.03);
        this.leapAt.lerp(player.pos, Math.min(1, dt * 3));
        if (this.modeT > this.modeLen) {
          const d = this.leapAt.clone().sub(this.position).setY(0);
          const D = Math.min(14, d.length()), T = 0.85;
          d.normalize().multiplyScalar(D / T);
          this.vel.set(d.x, 20 * T * 0.5, d.z);
          this.setGroundSnap(false);
          this.look.setSquash(1.5);
          this.setMode('leap', 2);
          this.stats.leaps++;
        }
        break;
      case 'leap':
        this.accel = 0.2;
        this.wish.set(this.vel.x, 0, this.vel.z);
        if (this.modeT > 0.2 && (this.grounded || this.modeT > this.modeLen)) {
          this.setGroundSnap(true);
          this.look.setSquash(0.5);
          events.emit('bossSlam', { at: this.position.clone() });
          this.fx.add.spawn({ pos: this.position.clone().setY(this.position.y + 0.4), spread: R, count: 30, life: [0.3, 0.8], size: [0.14, 0.03], color: 0x9acb3a, color2: 0x3a5a14, gravity: 9, upBias: 1.3 });
          if (player.pos.distanceTo(this.position) < R + 1.4 && canSee) {
            this.stats.leapHits++;
            playerFoe(player).strike({ damage: this.damage * 1.4, from: this.position.clone(), parryable: false, poise: 120, knock: 6 });
          }
          this.vel.x *= 0.1;
          this.vel.z *= 0.1;
          this.leapCd = (this.phase === 3 ? 4 : 6) + Math.random() * 3;
          this.setMode('splat', 1.0);
        }
        break;
      case 'splat':
        // Flattened, slow to gather herself: hit her now.
        if (this.modeT > 0.3) this.look.setSquash(1);
        if (this.modeT > this.modeLen) this.setMode('creep', 0.6);
        break;
      case 'bulge':
        // Her front swells toward you (the tell).
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        this.look.setBulge(1);
        if (this.modeT > this.modeLen) {
          this.setMode('surge', 0.6);
          this.stats.surges++;
          this.vel.copy(this.forward).multiplyScalar(7);
        }
        break;
      case 'surge': {
        // A lurch forward, over whatever is in front of her.
        this.accel = 8;
        this.wish.copy(this.forward).multiplyScalar(this.modeT < 0.35 ? 7 : 0);
        this.look.setBulge(1.3);
        const front = this.forward.dot(to.clone().normalize());
        if (!this.struck && dist < R + 1.2 && front > 0.3 && canSee) {
          this.struck = true;
          this.stats.engulfed++;
          // Swallowed: stuck in her, the acid burning. A roll tears you free.
          playerFoe(player).strike({ damage: this.damage * 0.6, from: this.position.clone(), parryable: false, poise: 40, web: 3, poison: 8 });
          sfx.groan(this.volume());
        }
        if (this.modeT > this.modeLen) {
          this.look.setBulge(0);
          this.surgeCd = (this.phase === 3 ? 5 : 7) + Math.random() * 3;
          this.setMode('creep', 0.8);
        }
        break;
      }
      case 'spit': {
        // Lobs globs of acid at where you are, one after another.
        this.yaw = dampAngle(this.yaw, face, 4, dt);
        const shots = this.phase === 3 ? 3 : 2;
        const due = Math.floor(this.modeT / 0.4);
        if (due > 0 && due <= shots && this.modeT - dt < due * 0.4) this.lob(player.pos);
        if (this.modeT > this.modeLen) {
          this.spitCd = (this.phase === 3 ? 4 : 6) + Math.random() * 2;
          this.setMode('creep', 0.5);
        }
        break;
      }
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 3) this.wish.copy(d.normalize()).multiplyScalar(2.2);
        else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15 * dt);
          if (this.hp >= this.maxHp) {
            this.phase = 1;
            this.setMode('lurk', 3);
          }
        }
        break;
      }
    }
    this.updateGlobs(dt, player);
  }

  private lob(at: THREE.Vector3) {
    this.stats.globs++;
    const from = this.position.clone().setY(this.position.y + this.size * 1.1);
    const target = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    const T = 1.0;
    const vel = target.clone().sub(from).divideScalar(T);
    vel.y = (target.y - from.y) / T + 0.5 * 18 * T;
    const mesh = new THREE.Mesh(globGeo, globMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.globs.push({ mesh, vel, puddle: null, life: 0, tick: 0 });
    sfx.hiss(this.volume() * 0.7);
  }

  private updateGlobs(dt: number, player: Player) {
    for (const g of this.globs) {
      g.life += dt;
      if (!g.puddle) {
        g.vel.y -= 18 * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        const gy = heightAt(g.mesh.position.x, g.mesh.position.z);
        if (g.mesh.position.y <= gy) {
          // Splash: it burns where it lands, and leaves a puddle.
          g.mesh.removeFromParent();
          const p = new THREE.Mesh(new THREE.CircleGeometry(1.6, 18).rotateX(-Math.PI / 2), puddleMat);
          p.position.set(g.mesh.position.x, gy + 0.05, g.mesh.position.z);
          this.scene.add(p);
          g.puddle = p;
          g.life = 0;
          this.fx.add.spawn({ pos: p.position.clone().setY(gy + 0.3), spread: 0.8, count: 12, life: [0.3, 0.6], size: [0.1, 0.02], color: 0xb8e84a, color2: 0x3a5a14, gravity: 6, upBias: 1 });
          if (player.pos.distanceTo(p.position) < 1.8) playerFoe(player).strike({ damage: this.damage * 0.5, from: p.position.clone(), parryable: false, poise: 20, poison: 5 });
        }
      } else {
        // Standing in it burns.
        g.tick -= dt;
        if (g.tick <= 0 && player.pos.distanceTo(g.puddle.position) < 1.6) {
          g.tick = 0.6;
          playerFoe(player).strike({ damage: this.damage * 0.15, from: g.puddle.position.clone(), parryable: false, poise: 0, projectile: true });
        }
        if (Math.random() < dt * 3) this.fx.add.spawn({ pos: g.puddle.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.1, (Math.random() - 0.5) * 2)), spread: 0.05, count: 1, life: [0.5, 0.9], size: [0.06, 0.01], color: 0xd8f070, color2: 0x5a7a20, upBias: 0.6 });
        (g.puddle.material as THREE.Material).opacity = 0.7;
        g.puddle.scale.setScalar(Math.max(0.05, 1 - Math.max(0, g.life - 5) / 1.5));
      }
    }
    for (const g of this.globs.filter((x) => (x.puddle && x.life > 6.5) || (!x.puddle && x.life > 4))) {
      g.mesh.removeFromParent();
      g.puddle?.removeFromParent();
      g.puddle?.geometry.dispose();
    }
    this.globs = this.globs.filter((x) => !((x.puddle && x.life > 6.5) || (!x.puddle && x.life > 4)));
  }

  protected animate(dt: number) {
    const L = this.look;
    L.root.position.copy(this.position);
    L.root.rotation.y = this.yaw;
    L.size = this.size;
    if (!this.alive) L.melt = Math.min(1, L.melt + dt * 0.5);
    L.update(dt);
    // Drips.
    if (this.alive && Math.random() < dt * 4) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add.spawn({ pos: this.position.clone().add(new THREE.Vector3(Math.cos(a) * this.size * 0.9, 0.3, Math.sin(a) * this.size * 0.9)), spread: 0.05, count: 1, life: [0.4, 0.7], size: [0.07, 0.02], color: 0x8ab83a, color2: 0x3a5a14, gravity: 6 });
    }
    if (this.alive && this.phase === 3 && Math.random() < dt * 6) {
      this.fx.add.spawn({ pos: this.center.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.5, (Math.random() - 0.5))), spread: 0.3, count: 1, life: [0.6, 1.2], size: [0.14, 0.03], color: 0x6a3aa8, color2: 0x10061a, upBias: 0.8, drag: 1 });
    }
  }

  update(dt: number, player: Player) {
    super.update(dt, player);
    for (const m of this.minions) if (!m.dead) m.update(dt, player);
    if (this.minions.some((m) => m.dead)) this.minions.splice(0, this.minions.length, ...this.minions.filter((m) => !m.dead));
  }

  protected onDeath() {
    sfx.groan(this.volume() + 0.3);
    // Her spawn lose their hold together and run to slime.
    for (const m of this.minions) if (m.alive) m.takeHit({ damage: 1e4, poise: 0, dir: new THREE.Vector3(0, 1, 0), at: m.center.clone(), crit: false, source: 'melee' });
  }

  dispose() {
    super.dispose();
    for (const m of this.minions) m.dispose();
    this.minions.length = 0;
    for (const g of this.globs) {
      g.mesh.removeFromParent();
      g.puddle?.removeFromParent();
    }
    this.globs = [];
  }

  protected disposeLook() {
    this.look.dispose();
  }
}

export const MOTHER_OOZE: BossDef = {
  id: 'motherOoze',
  kind: 'motherOoze',
  name: 'Mother Ooze',
  title: 'the thing in the mire below the mill',
  home: { x: 215, z: 140, r: 45 },
  levelBonus: 4,
  lair: mire,
  clearing: 18,
  looks: [],
  // Always there, in her mire.
  abroad: () => true,
  spawn: (at, level, scene, fx) => new MotherOoze(at, level, scene, fx, new THREE.Vector3(MOTHER_OOZE.home.x, heightAt(MOTHER_OOZE.home.x, MOTHER_OOZE.home.z), MOTHER_OOZE.home.z)),
  rumour: 'Don\'t cut across the mire below the mill. There\'s a thing in it like a heap of frogspawn the size of a haycart. A knight went in after it last autumn. You can still see his helmet. Inside it.',
  found: 'Mother Ooze. A heap of green jelly as big as a haycart, and inside her, turning slowly: bones, a skull, a knight\'s helm, his sword.',
  phaseLines: ['Mother Ooze heaves, and lumps of her break away and come after you.', 'Deep in Mother Ooze, something has started to glow violet, like a heart.'],
  unique: 'drownedKnightSword',
  renown: 2,
  slain: 'Mother Ooze runs out into the mire like spilled soup. What she ate is left on the ground: the knight\'s sword among it, still sharp under the slime.',
  again: { items: [['slimeJelly', 3]], gold: [50, 90] },
  bounty: {
    title: 'Bounty: Mother Ooze',
    description: 'The miller wants the mire below his mill cleared of the thing that lives in it. It ate a knight of the Crown last autumn, and his family would like his sword back.',
    gold: 240, xp: 300, rep: 130, minRank: 1,
  },
};
