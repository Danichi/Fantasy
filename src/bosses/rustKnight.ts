import { combat, type AttackKind } from '../combat/core';
import * as THREE from 'three';
import { Creature, type CreatureBase } from '../creatures/creature';
import { creatureView } from '../creatures/view';
import { playerFoe } from '../creatures/foes';
import { damp, dampAngle, smoothstep } from '../core/math';
import { events } from '../core/events';
import { ignoresPlayer } from '../origins/stealth';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import { getArmourKit, type PartName } from '../enemies/armourKit';
import { buildSword, buildKiteShield } from '../items/weaponModels';
import { paintedWood } from '../items/materials';
import { crownAt } from '../world/crownRoad';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';
import { battlefield } from './lairs';

// The Rust Knight: a suit of plate half again the height of a man, red with
// rust and green with moss, standing bowed over its greatsword in the middle of
// an old battlefield on the Crown fields. Come near and it lifts its head.
//
// It was someone. The armour was made for one of the four who were summoned
// before you, and the cold light that wears it now is not him. (See
// docs/design/lore-dark-dimension.md: the player is the fifth summon.)
//
// The fight:
//   - Its kite shield blocks whatever comes at its front. Break its guard: three
//     blows into the shield (a heavy blow counts twice) or a parried overhead,
//     and it staggers, open.
//   - Sweeps: the greatsword drawn far back to one side (the tell), then two
//     wide sweeps. Block or get clear; they can't be parried.
//   - The overhead: raised high (the tell), a straight cut down. Parry it and
//     its guard is broken.
//   - Slam: both hands on the hilt, high, then down into the earth: a ring of
//     force round the blade.
//   - At range it charges behind its shield.
// At half strength it throws the shield away and fights two-handed, faster.
// Near the end its light goes violet, and the man inside speaks once.

const S = 1.45;
/** how the sword sits in its fist (pointing forward and up) */
const GRIP = Math.PI / 2 - 0.35;
const BASE: CreatureBase = { name: 'The Rust Knight', hp: 900, damage: 32, radius: 0.6, halfHeight: 0.85 };

type Mode = 'kneel' | 'rise' | 'advance' | 'windSweep' | 'sweep' | 'overUp' | 'overDown' | 'slamUp' | 'slam' | 'charge' | 'stagger' | 'throw' | 'home';

interface Piece {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

export class RustKnight extends Creature implements BossBody {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private swordArm = new THREE.Group();
  private shieldArm = new THREE.Group();
  private shield: THREE.Object3D;
  private grip!: THREE.Object3D;
  private shieldHold!: THREE.Object3D;
  private helm: THREE.Object3D | null = null;
  private pieces: Piece[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 3.5) });
  private light = new THREE.PointLight(0x7fb4ff, 2, 8, 2);
  private eyes: THREE.Mesh[] = [];
  private legs: THREE.Object3D[] = [];
  private stride = 0;
  mode: Mode = 'kneel';
  phase = 1;
  hasShield = true;
  private modeT = 0;
  private modeLen = 1;
  private foeOn = false;
  private struck = false;
  private sweeps = 0;
  private guard = 0;
  private atkCd = 1;
  private slamCd = 6;
  private chargeCd = 4;
  private spoke = false;
  private speakT = -1;
  private t = 0;
  private flash = 0;
  private swing = { x: 0.35, y: 0, lean: 0, sh: -0.35, shz: 0, kneel: 1, grip: GRIP };
  private thrown: Piece | null = null;
  readonly den: THREE.Vector3;
  stats = { blocked: 0, guardBreaks: 0, sweeps: 0, overheads: 0, parried: 0, slams: 0, charges: 0 };

  constructor(at: THREE.Vector3, level: number, scene: THREE.Scene, fx: FX, den?: THREE.Vector3) {
    super('rustKnight', BASE, level, at, scene, fx);
    this.corpseTime = 40;
    this.den = (den ?? at).clone();
    const kit = getArmourKit();
    const sword = buildSword({ bladeLen: 1.35, bladeWidth: 0.05, thickness: 0.007, fullerLen: 0.9, gripLen: 0.3, guardSpan: 0.3, guardStyle: 'straight', pommel: 'wheel', tint: 0x8a6a50 });
    const shield = buildKiteShield();
    shield.scale.set(1.1, 1.35, 1.1);
    // Its old arms, nearly gone under the rust: a five-pointed star, like the one on the ring.
    const face = paintedWood(77, (g, sz) => {
      g.fillStyle = '#5a4434';
      g.fillRect(0, 0, sz, sz);
      g.fillStyle = 'rgba(150,118,70,0.75)';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 === 0 ? 0.3 : 0.12) * sz;
        g.lineTo(sz / 2 + Math.cos(a) * r, sz * 0.45 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${110 + (i % 5) * 12},${50 + (i % 3) * 10},30,${0.25 + (i % 4) * 0.08})`;
        g.beginPath();
        g.ellipse(((i * 97) % 100) / 100 * sz, ((i * 61) % 100) / 100 * sz, sz * (0.03 + (i % 6) * 0.012), sz * (0.05 + (i % 4) * 0.02), i, 0, Math.PI * 2);
        g.fill();
      }
    }, 5);
    shield.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && Array.isArray(m.material)) m.material = [new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 }), m.material[1]];
    });
    this.shield = shield;
    const put = (o: THREE.Object3D, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const h = new THREE.Group();
      h.add(o);
      h.position.set(x, y, z);
      h.rotation.set(rx, 0, rz);
      return h;
    };
    let eyeY = 1.61;
    const plates: THREE.Object3D[] = [];
    if (kit) {
      const part = (n: PartName) => {
        const m = new THREE.Mesh(kit.parts[n].geometry, kit.material);
        const g = new THREE.Group();
        g.add(m);
        g.position.copy(kit.parts[n].pivot);
        return g;
      };
      const helm = part('helm'), torso = part('torso'), legL = part('legL'), legR = part('legR'), armR = part('armR'), armL = part('armL');
      this.body.add(helm, torso, legL, legR);
      this.swordArm.position.copy(kit.parts.armR.pivot);
      this.shieldArm.position.copy(kit.parts.armL.pivot);
      armR.position.set(0, 0, 0);
      armL.position.set(0, 0, 0);
      const handY = -(kit.parts.armR.pivot.y - kit.height * 0.46);
      this.grip = put(sword, -0.05, handY, 0.08, GRIP, 0);
      this.shieldHold = put(shield, 0.12, handY + 0.18, 0.2, 0, 0);
      this.swordArm.add(armR, this.grip);
      this.shieldArm.add(armL, this.shieldHold);
      this.helm = helm;
      eyeY = kit.height * 0.9;
      plates.push(helm, torso, legL, legR);
      this.legs = [legL, legR];
    } else {
      // No armour model (tests without assets): a plain stand-in.
      const steel = new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.8, metalness: 0.4 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), steel);
      torso.position.y = 1.25;
      const helm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.28), steel);
      helm.position.y = 1.72;
      this.body.add(torso, helm);
      this.swordArm.position.set(-0.3, 1.5, 0);
      this.shieldArm.position.set(0.3, 1.5, 0);
      this.grip = put(sword, 0, -0.6, 0.08, GRIP, 0);
      this.shieldHold = put(shield, 0.05, -0.5, 0.18, 0, 0);
      this.swordArm.add(this.grip);
      this.shieldArm.add(this.shieldHold);
      plates.push(torso, helm);
    }
    this.body.add(this.swordArm, this.shieldArm);
    // The cold light in the visor and the gaps of the plate.
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), this.eyeMat);
      e.position.set(sx * 0.035, eyeY, 0.12);
      this.body.add(e);
      this.eyes.push(e);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), this.eyeMat);
    heart.position.set(0, eyeY - 0.36, 0.02);
    this.body.add(heart);
    this.light.position.set(0, eyeY - 0.2, 0.3);
    this.body.add(this.light);
    // Moss on the shoulders, helm and shield; weed hanging off it.
    const moss = new THREE.MeshStandardMaterial({ color: 0x2f4020, roughness: 1 });
    const mossAt: [THREE.Object3D, number, number, number, number, boolean][] = [
      [this.body, 0.19, eyeY - 0.19, -0.03, 0.09, false], [this.body, -0.18, eyeY - 0.2, -0.02, 0.08, false], [this.body, 0.03, eyeY + 0.09, -0.06, 0.06, false],
      [this.shield, 0.1, 0.24, 0.03, 0.06, true], [this.shield, -0.13, -0.02, 0.03, 0.045, true], [this.shield, 0.02, -0.3, 0.02, 0.04, true],
    ];
    for (const [parent, x, y, z, r, flat] of mossAt) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), moss);
      if (flat) m.scale.set(1.3, 1, 0.22);
      else m.scale.set(1.3, 0.35, 1.1);
      m.position.set(x, y, z);
      m.rotation.set(Math.random(), Math.random(), Math.random() * 0.3);
      parent.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.4 + Math.random() * 0.4, 4), moss);
      vine.position.set((Math.random() - 0.5) * 0.5, eyeY - 0.35 - Math.random() * 0.3, (Math.random() - 0.5) * 0.2);
      this.body.add(vine);
    }
    this.root.add(this.body);
    // Rust: everything goes red-brown (its own copies, so the hit flash is its own).
    const rusted = new Map<THREE.Material, THREE.Material>();
    const rust = (mat: THREE.Material) => {
      const sm = mat as THREE.MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial || mat === moss) return mat;
      let c = rusted.get(mat) as THREE.MeshStandardMaterial | undefined;
      if (!c) {
        c = sm.clone();
        if (kit && mat === kit.material) {
          // The plate itself: brightened and reddened, much less metallic.
          c.color.setRGB(1.3, 0.84, 0.6);
          c.metalness = Math.min(c.metalness, 0.3);
        } else if (c.map) {
          // Painted faces keep their colours.
        } else c.color.multiply(new THREE.Color(0.85, 0.58, 0.42));
        c.roughness = Math.min(1, c.roughness + 0.25);
        rusted.set(mat, c);
        this.mats.push(c);
      }
      return c;
    };
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.material = Array.isArray(m.material) ? m.material.map(rust) : rust(m.material);
    });
    for (const h of [...plates, this.swordArm, this.shieldArm]) this.pieces.push({ obj: h, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    this.root.scale.setScalar(S);
    this.root.position.copy(at);
    scene.add(this.root);
  }

  get engaged() {
    return this.alive && this.mode !== 'kneel' && this.mode !== 'home';
  }

  leash() {
    if (this.mode === 'home') return;
    this.foeOn = false;
    this.setMode('home', 999);
  }

  private setMode(m: Mode, len = 1) {
    // Its tell (combat/core.ts): the colour says how to answer it; a blow now is a counter-hit.
    const tell = ({ windSweep: ['heavy', 0.15, 0.8], overUp: ['normal', 0.1, 0], slamUp: ['unblockable', 0.2, 1.2], charge: ['heavy', 0, 0] } as Partial<Record<Mode, [AttackKind, number, number]>>)[m];
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
  /** Its shield is up toward you. */
  private get guarding() {
    return this.hasShield && (this.mode === 'advance' || this.mode === 'charge' || this.mode === 'windSweep');
  }

  private breakGuard() {
    this.guard = 0;
    this.stats.guardBreaks++;
    this.setMode('stagger', 2.2);
    sfx.gateSlam(this.volume() * 0.6);
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    const fromFront = this.forward.dot(h.dir.clone().negate().setY(0).normalize()) > 0.3;
    if (this.guarding && fromFront) {
      // Into the shield: sparks, a clang, and the guard wears thin.
      this.hp -= h.damage * 0.1;
      this.stats.blocked++;
      this.fx.sparks(h.at.clone(), h.dir.clone().negate());
      events.emit('blockImpact', { at: h.at.clone(), guardBroken: false });
      this.guard += h.poise >= 60 ? 2 : 1;
      if (this.guard >= 3) this.breakGuard();
    } else {
      this.hp -= h.damage * (this.mode === 'stagger' ? 1.5 : 1);
      this.flash = 1;
      this.fx.sparks(h.at.clone(), h.dir.clone());
    }
    if (!this.foeOn) this.wake();
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private wake() {
    this.foeOn = true;
    if (this.mode === 'kneel' || this.mode === 'home') {
      this.setMode('rise', 2.2);
      sfx.gateSlam(this.volume() * 0.4);
    }
  }

  protected think(dt: number, player: Player) {
    this.modeT += dt;
    this.atkCd -= dt;
    this.slamCd -= dt;
    this.chargeCd -= dt;
    this.t += dt;
    this.wish.set(0, 0, 0);
    this.accel = 6;
    this.stunned = this.mode === 'stagger';
    const frac = this.hp / this.maxHp;
    const want = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 2 && this.hasShield) this.setMode('throw', 1.2);
      if (want === 3) {
        this.eyeMat.color.setRGB(2.2, 0.8, 3.6);
        this.light.color.set(0xa06aff);
        this.speakT = 4;
      }
    }
    const quick = this.phase === 3 ? 1.3 : this.phase === 2 ? 1.15 : 1;
    const canSee = !player.dead && !ignoresPlayer(this);
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const face = Math.atan2(to.x, to.z);
    const front = this.forward.dot(to.clone().normalize());
    if (canSee && this.mode === 'kneel' && dist < 20) this.wake();
    if (this.foeOn && (!canSee || dist > 50)) {
      this.foeOn = false;
      if (this.mode !== 'stagger') this.setMode(this.hp < this.maxHp ? 'home' : 'kneel', 3);
    }

    switch (this.mode) {
      case 'kneel':
        break;
      case 'rise':
        // It stands, slowly, pulling the greatsword out of the earth.
        this.yaw = dampAngle(this.yaw, face, 1.5, dt);
        if (this.modeT > this.modeLen) this.setMode('advance', 0.5);
        break;
      case 'advance': {
        this.yaw = dampAngle(this.yaw, face, 3.5 * quick, dt);
        if (dist > 3.2) this.wish.copy(this.forward).multiplyScalar((this.hasShield ? 2.2 : 3.2) * quick);
        if (this.modeT < this.modeLen || this.atkCd > 0) break;
        if (this.hasShield && this.chargeCd <= 0 && dist > 9 && dist < 20 && front > 0.8) {
          this.setMode('charge', 1.1);
          this.stats.charges++;
        } else if (this.slamCd <= 0 && dist < 5) {
          this.setMode('slamUp', 1.0 / quick);
        } else if (dist < 4.6 && (Math.random() < 0.55 || !this.hasShield)) {
          this.sweeps = this.phase === 1 ? 2 : 3;
          this.setMode('windSweep', 0.75 / quick);
        } else if (dist < 4) {
          this.setMode('overUp', 0.7 / quick);
        }
        break;
      }
      case 'windSweep':
        // Drawn far back to the side: the sweep is coming.
        this.yaw = dampAngle(this.yaw, face, 5, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('sweep', 0.42 / quick);
          sfx.groan(this.volume() * 0.3);
        }
        break;
      case 'sweep':
        this.wish.copy(this.forward).multiplyScalar(2.5);
        if (!this.struck && this.modeT > 0.12 / quick) {
          this.struck = true;
          this.stats.sweeps++;
          if (dist < 5 && front > -0.2 && canSee) playerFoe(player).strike({ damage: this.damage, from: this.position.clone(), parryable: false, poise: 75, knock: 4 });
        }
        if (this.modeT > this.modeLen) {
          this.sweeps--;
          if (this.sweeps > 0) this.setMode('sweep', 0.42 / quick);
          else this.setMode('overUp', 0.55 / quick);
          this.yaw = dampAngle(this.yaw, face, 30, dt);
        }
        break;
      case 'overUp':
        // Raised high (the tell)...
        this.yaw = dampAngle(this.yaw, face, 6, dt);
        if (this.modeT > this.modeLen) this.setMode('overDown', 0.6);
        break;
      case 'overDown':
        // ...and down. Parry it and its guard is broken.
        if (!this.struck && this.modeT > 0.1) {
          this.struck = true;
          this.stats.overheads++;
          if (dist < 4.6 && front > 0.3 && canSee) {
            playerFoe(player).strike({
              damage: this.damage * 1.25, from: this.position.clone(), parryable: true, poise: 90,
              onParried: () => {
                this.stats.parried++;
                this.breakGuard();
              },
            });
          }
        }
        if (this.mode === 'overDown' && this.modeT > this.modeLen) this.endAttack(1.3);
        break;
      case 'slamUp':
        this.yaw = dampAngle(this.yaw, face, 3, dt);
        if (this.modeT > this.modeLen) {
          this.setMode('slam', 0.9);
          this.stats.slams++;
          const at = this.position.clone().addScaledVector(this.forward, 2.2);
          events.emit('bossSlam', { at });
          this.fx.dust(at, 3);
          this.fx.add.spawn({ pos: at.clone().setY(at.y + 0.2), spread: 3, count: 34, life: [0.4, 0.9], size: [0.12, 0.02], color: 0x8a6a4a, color2: 0x3a2a1a, gravity: 7, upBias: 1.3 });
          sfx.gateSlam(this.volume() + 0.2);
          if (player.pos.distanceTo(at) < 4.5 && canSee) playerFoe(player).strike({ damage: this.damage * 1.5, from: at, parryable: false, poise: 130, knock: 7 });
        }
        break;
      case 'slam':
        if (this.modeT > this.modeLen) {
          this.slamCd = (this.phase === 3 ? 7 : 10) + Math.random() * 3;
          this.endAttack(0.6);
        }
        break;
      case 'charge': {
        // Behind the shield, at a run.
        this.accel = 10;
        this.wish.copy(this.forward).multiplyScalar(8.5);
        if (!this.struck && dist < 2.4 && front > 0.4 && canSee) {
          this.struck = true;
          playerFoe(player).strike({ damage: this.damage * 0.8, from: this.position.clone(), parryable: false, poise: 100, knock: 6 });
        }
        if (this.modeT > this.modeLen) {
          this.chargeCd = 8 + Math.random() * 4;
          this.endAttack(0.8);
        }
        break;
      }
      case 'stagger':
        if (this.modeT > this.modeLen) {
          this.guard = 0;
          this.setMode('advance', 0.3);
        }
        break;
      case 'throw':
        // It tears the shield off its arm and flings it away.
        if (!this.struck && this.modeT > 0.6 && this.hasShield) {
          this.struck = true;
          this.hasShield = false;
          const wp = new THREE.Vector3();
          this.shield.getWorldPosition(wp);
          const q = new THREE.Quaternion();
          this.shield.getWorldQuaternion(q);
          this.shield.removeFromParent();
          this.shield.position.copy(wp);
          this.shield.quaternion.copy(q);
          this.shield.scale.multiplyScalar(S);
          this.scene.add(this.shield);
          this.thrown = { obj: this.shield, vel: new THREE.Vector3(Math.cos(this.yaw) * 5, 5, -Math.sin(this.yaw) * 5), spin: new THREE.Vector3(3, 6, 2) };
          sfx.gateSlam(this.volume() * 0.5);
        }
        if (this.modeT > this.modeLen) this.endAttack(0.4);
        break;
      case 'home': {
        const d = this.den.clone().sub(this.position).setY(0);
        if (d.length() > 2) {
          this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 3, dt);
          this.wish.copy(this.forward).multiplyScalar(2.4);
        } else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.15 * dt);
          if (this.hp >= this.maxHp) this.setMode('kneel', 3);
        }
        break;
      }
    }
    // Near the end, the man inside speaks.
    if (this.speakT > 0) this.speakT -= dt;
    if (this.phase === 3 && !this.spoke && this.foeOn && this.speakT <= 0) {
      this.spoke = true;
      events.emit('bossSpeaks', { id: 'rustKnight', line: 'For a moment the Rust Knight stops, and a man\'s voice comes out of the helm, cracked and far away: "Run. While you still can. It was in me before I knew." Then the violet light takes it again.' });
    }
  }

  private endAttack(cd: number) {
    this.atkCd = cd / (this.phase === 3 ? 1.5 : 1);
    this.setMode('advance', 0.2);
  }

  protected animate(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 5);
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    if (this.thrown) {
      const p = this.thrown;
      const floor = heightAt(p.obj.position.x, p.obj.position.z);
      if (p.obj.position.y > floor + 0.1) {
        p.vel.y -= 14 * dt;
        p.obj.position.addScaledVector(p.vel, dt);
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.y += p.spin.y * dt;
      }
    }
    if (!this.alive) {
      // The plates fall apart and the light goes out.
      const floor = heightAt(this.position.x, this.position.z);
      for (const p of this.pieces) {
        const wp = p.obj.getWorldPosition(new THREE.Vector3());
        if (wp.y > floor + 0.1) {
          p.vel.y -= 14 * dt;
          p.obj.position.addScaledVector(p.vel, dt / S);
          p.obj.rotation.x += p.spin.x * dt;
          p.obj.rotation.z += p.spin.z * dt;
        }
      }
      this.light.intensity = Math.max(0, this.light.intensity - dt * 3);
      for (const e of this.eyes) e.visible = this.deadT < 0.5;
      return;
    }
    const m = this.mode, mt = this.modeT;
    const W = this.swing;
    // Kneeling on the greatsword, or rising from it.
    const kneel = m === 'kneel' ? 1 : m === 'rise' ? 1 - smoothstep(0.3, 2, mt) : 0;
    W.kneel = damp(W.kneel, kneel, 6, dt);
    this.body.position.y = -0.05 * W.kneel + Math.sin(this.t * 1.6) * 0.01;
    let x = 0.35, y = 0, lean = 0, sh = this.hasShield ? -0.9 : -0.2, shz = this.hasShield ? -0.35 : 0;
    let grip = GRIP;
    if (kneel > 0.5) {
      // Bowed over the greatsword, its point planted in the earth.
      x = -0.5; lean = 0.1; sh = 0.05; shz = 0;
      grip = Math.PI + 0.5;
    }
    switch (m) {
      case 'windSweep':
        x = -1.5; y = 1.4; lean = -0.1;
        break;
      case 'sweep': {
        const s = smoothstep(0, 0.25, mt);
        x = -1.5; y = 1.4 - 2.8 * s; lean = 0.15;
        if (this.sweeps % 2 === 0) y = -1.4 + 2.8 * s;
        break;
      }
      case 'overUp':
        x = -2.7 * smoothstep(0, 0.4, mt); lean = -0.12;
        break;
      case 'overDown':
        x = -2.7 + 3.8 * smoothstep(0.02, 0.15, mt); lean = 0.3;
        break;
      case 'slamUp':
        x = -2.9; lean = -0.2; sh = -2.6; shz = 0.4;
        break;
      case 'slam':
        x = 1.0; lean = 0.45; sh = 0.6;
        break;
      case 'charge':
        x = 0.6; lean = 0.25; sh = -1.4; shz = -0.6;
        break;
      case 'stagger': {
        const e = 1 - smoothstep(0.2, this.modeLen, mt);
        lean = -0.4 * e; x = 0.8 * e; sh = 0.5 * e; shz = 0.6 * e;
        break;
      }
      case 'throw':
        sh = mt < 0.6 ? -1.6 : 0.4; shz = mt < 0.6 ? -0.4 : 1.2;
        break;
    }
    const fast = m === 'sweep' || m === 'overDown' || m === 'slam' ? 30 : 9;
    W.x = damp(W.x, x, fast, dt);
    W.y = damp(W.y, y, fast, dt);
    W.lean = damp(W.lean, lean, 10, dt);
    W.sh = damp(W.sh, sh, 10, dt);
    W.shz = damp(W.shz, shz, 10, dt);
    W.grip = damp(W.grip, grip, 4, dt);
    this.grip.rotation.x = W.grip;
    // The shield stays upright in front of it however the arm moves.
    this.shieldHold.rotation.set(-W.sh * 0.85, 0, -W.shz * 0.8);
    if (this.helm) this.helm.rotation.x = 0.45 * W.kneel;
    this.swordArm.rotation.order = 'YXZ';
    this.swordArm.rotation.set(W.x, W.y, 0);
    this.shieldArm.rotation.set(W.sh, 0, W.shz);
    this.body.rotation.x = W.lean;
    // Heavy steps.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.stride += speed * dt * 1.6 / S;
    const sw = Math.sin(this.stride) * Math.min(1, speed / 2) * 0.45;
    if (this.legs.length === 2) {
      this.legs[0].rotation.x = damp(this.legs[0].rotation.x, sw, 12, dt);
      this.legs[1].rotation.x = damp(this.legs[1].rotation.x, -sw, 12, dt);
    }
    for (const mat of this.mats) mat.emissive.setRGB(0.5 * this.flash, 0.35 * this.flash, 0.2 * this.flash);
    // Tells: the eyes flare when it winds up.
    const flare = m === 'windSweep' || m === 'overUp' || m === 'slamUp' ? 2.2 : 1;
    for (const e of this.eyes) e.scale.setScalar(damp(e.scale.x, flare, 10, dt));
    this.light.intensity = 2 + Math.sin(this.t * 7) * 0.3 + (flare - 1);
    // The Dark: violet motes off it, at the end.
    if (this.phase === 3 && Math.random() < dt * 8) {
      this.fx.add.spawn({ pos: this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.8, (Math.random() - 0.5) * 0.8)), spread: 0.2, count: 1, life: [0.6, 1.2], size: [0.14, 0.03], color: 0x6a3aa8, color2: 0x10061a, upBias: 0.7, drag: 1 });
    }
  }

  protected die() {
    super.die();
    for (const p of this.pieces) {
      p.vel.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      p.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    this.fx.add.spawn({ pos: this.center, spread: 3, count: 40, life: [0.5, 1.2], size: [0.1, 0.01], color: 0xb8dcff, color2: 0x3a6cff, upBias: 0.6, drag: 1.5 });
    sfx.gateSlam(this.volume() + 0.2);
  }

  dispose() {
    super.dispose();
    this.thrown?.obj.removeFromParent();
  }

  protected disposeLook() {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

const FIELD = crownAt(2300, 150);

export const RUST_KNIGHT: BossDef = {
  id: 'rustKnight',
  kind: 'rustKnight',
  name: 'The Rust Knight',
  title: 'the armour on the old battlefield',
  home: { x: Math.round(FIELD.x), z: Math.round(FIELD.z), r: 45 },
  levelBonus: 4,
  lair: battlefield,
  clearing: 26,
  looks: [],
  abroad: () => true,
  spawn: (_at, level, scene, fx) => new RustKnight(new THREE.Vector3(FIELD.x, heightAt(FIELD.x, FIELD.z), FIELD.z), level, scene, fx, new THREE.Vector3(FIELD.x, heightAt(FIELD.x, FIELD.z), FIELD.z)),
  rumour: 'Past Kingsmile, off the Crown Road, there\'s an old battlefield nobody ploughs, and in the middle of it a suit of armour stands with its head bowed over its sword, rusted red. It\'s been there five years. Shepherds say it moves when you get close.',
  found: 'The Rust Knight. A suit of plate half again as tall as a man, red with rust and green with moss, bowed over a greatsword planted in the earth. As you come near, it lifts its head.',
  phaseLines: ['The Rust Knight tears its shield from its arm and flings it away.', 'The cold light in the Rust Knight\'s visor has turned violet.'],
  unique: 'dentedSignet',
  uniqueAlso: ['journalPage'],
  renown: 3,
  deed: 'Laid the Rust Knight to rest',
  slain: 'The Rust Knight comes apart, plate by plate. In the empty breastplate you find a dented signet ring and a page of a journal, folded small.',
  again: { items: [['steelIngot', 2]], gold: [100, 170] },
  bounty: {
    title: 'Commission: The Rust Knight',
    description: 'The Crown wants the old battlefield past Kingsmile ploughed again, and the thing standing in the middle of it is in the way. Nobody knows whose armour it was. Find out, if you can.',
    gold: 340, xp: 420, rep: 180, minRank: 2,
  },
};
