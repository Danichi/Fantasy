import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { heightAt } from '../world/terrain';
import { damp, dampAngle, smoothstep } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { armorPieces } from '../items/armorModels';
import { buildSword, buildRoundShield } from '../items/weaponModels';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// ---------------------------------------------------------------------------
// Living Armour: an empty suit of plate held together by a cold blue light.
// Floats a hand's breadth off the floor, raises its shield when struck, and
// telegraphs a heavy overhead swing that can be parried. On death the plates
// clatter to the ground and the light gutters out.
// ---------------------------------------------------------------------------

type State = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'guard' | 'stagger' | 'dying';

const HP = 190;
const DAMAGE = 26;
const SPEED = 2.3;
const REACH = 2.5;

interface Piece {
  obj: THREE.Object3D;
  rest: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

export class LivingArmour implements Target {
  id = newTargetId();
  kind = 'armour';
  alive = true;
  lockable = true;
  stunned = false;
  hp = HP;
  maxHp = HP;
  radius = 0.42;
  halfHeight = 0.5;
  position = new THREE.Vector3();
  center = new THREE.Vector3();

  private group = new THREE.Group(); // at the feet, yaw only
  private body = new THREE.Group(); // bob and lean
  private swordArm = new THREE.Group(); // pivots at the right shoulder
  private shieldArm = new THREE.Group(); // pivots at the left shoulder
  private pieces: Piece[] = [];
  private glow: THREE.PointLight | null = null;
  private eyes: THREE.Mesh[] = [];
  private state: State = 'idle';
  private st = 0;
  private yaw = 0;
  private vel = new THREE.Vector3();
  private cooldown = 1;
  private poiseAcc = 0;
  private hitDone = false;
  private guardHits = 0;
  private deathT = 0;
  private flash = 0;
  private t = Math.random() * 10;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(at: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(at);
    // Armour, laid out on an invisible body (limb frames: +Y along the bone).
    const put = (o: THREE.Object3D, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const h = new THREE.Group();
      h.add(o);
      h.position.set(x, y, z);
      h.rotation.set(rx, 0, rz);
      return h;
    };
    const helm = put(armorPieces.helm(0.2), 0, 1.58, 0);
    const chest = put(armorPieces.breastplate(0.14), 0, 1.22, 0);
    // Arms/legs: limb frames point down the bone, so flip them upside down.
    const pl = put(armorPieces.pauldron(0.28, -1), 0.23, 1.44, 0, 0, Math.PI);
    const pr = put(armorPieces.pauldron(0.28, 1), -0.23, 1.44, 0, 0, Math.PI);
    const gl = put(armorPieces.greave(0.44), 0.11, 0.52, 0.02, 0, Math.PI);
    const gr = put(armorPieces.greave(0.44), -0.11, 0.52, 0.02, 0, Math.PI);
    const cl = put(armorPieces.cuisse(0.42), 0.11, 0.95, 0.02, 0, Math.PI);
    const cr = put(armorPieces.cuisse(0.42), -0.11, 0.95, 0.02, 0, Math.PI);
    this.body.add(helm, chest, pl, pr, gl, gr, cl, cr);

    // Sword arm: vambrace hanging from the shoulder, sword in the "hand".
    this.swordArm.position.set(-0.26, 1.4, 0.02);
    const vr = put(armorPieces.vambrace(0.28), 0, -0.3, 0.02, 0, Math.PI);
    const sword = buildSword({ bladeLen: 0.85, bladeWidth: 0.027, thickness: 0.0045, fullerLen: 0.6, gripLen: 0.14, guardSpan: 0.12, guardStyle: 'straight', pommel: 'wheel' });
    const swordHold = put(sword, 0, -0.56, 0.08, Math.PI / 2 - 0.35, 0);
    this.swordArm.add(vr, swordHold);
    this.shieldArm.position.set(0.26, 1.4, 0.02);
    const vl = put(armorPieces.vambrace(0.28), 0, -0.3, 0.02, 0, Math.PI);
    const shield = buildRoundShield('plain');
    shield.scale.setScalar(0.95);
    const shieldHold = put(shield, 0.05, -0.5, 0.16, 0, 0);
    this.shieldArm.add(vl, shieldHold);
    this.body.add(this.swordArm, this.shieldArm);

    // Cold light in the eye slits and the gaps of the plate.
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 3.5) });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeMat);
      e.position.set(sx * 0.035, 1.61, 0.12);
      this.body.add(e);
      this.eyes.push(e);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), eyeMat);
    heart.position.set(0, 1.25, 0.02);
    this.body.add(heart);

    this.group.add(this.body);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        // Own material copies so the hit flash only affects this suit.
        if ((m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          m.material = (m.material as THREE.MeshStandardMaterial).clone();
          const mm = m.material as THREE.MeshStandardMaterial;
          mm.color.multiplyScalar(0.72); // tarnished, darker steel
          this.mats.push(mm);
        }
      }
    });
    // Each directly-held piece can fly apart on death.
    for (const h of [helm, chest, pl, pr, gl, gr, cl, cr, this.swordArm, this.shieldArm]) {
      this.pieces.push({ obj: h, rest: h.position.clone(), vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    scene.add(this.group);

    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 0.9, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.45, 0.38).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    targets.add(this);
    this.sync(0);
  }
  /** Attach a light for the eerie glow (from the dungeon's light pool). */
  setGlow(l: THREE.PointLight | null) {
    this.glow = l;
    if (l) {
      l.color.set(0x7fb4ff);
      l.distance = 4;
    }
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 5;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    // Facing the blow with the shield raised: most of it is absorbed.
    const facing = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).dot(h.dir) < -0.3;
    if (this.state === 'guard' && facing && h.source === 'melee' && !h.crit) {
      this.hp -= h.damage * 0.15;
      this.fx.sparks(h.at, h.dir.clone().negate());
      events.emit('blockImpact', { at: h.at, guardBroken: false });
      this.guardHits++;
      if (this.guardHits >= 3) this.setState('stagger'); // shield battered aside
      return;
    }
    this.hp -= h.damage;
    this.flash = 1;
    this.fx.sparks(h.at, h.dir);
    if (this.hp <= 0) {
      this.die(h.dir);
      return;
    }
    this.poiseAcc += h.poise;
    if (this.poiseAcc > 90 || this.stunned) {
      this.poiseAcc = 0;
      this.stunned = false;
      this.setState('stagger');
      this.vel.addScaledVector(h.dir, 3);
    } else if (this.state === 'chase' || this.state === 'recover' || this.state === 'idle') {
      // Learns: raises the shield after being struck.
      if (Math.random() < 0.55) {
        this.guardHits = 0;
        this.setState('guard');
      }
    }
  }

  private die(dir: THREE.Vector3) {
    this.alive = false;
    this.stunned = false;
    this.setState('dying');
    targets.delete(this);
    for (const p of this.pieces) {
      p.vel.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3).addScaledVector(dir, 2);
      p.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    this.fx.add.spawn({ pos: this.center, spread: 3, count: 40, life: [0.5, 1.2], size: [0.1, 0.01], color: 0xb8dcff, color2: 0x3a6cff, upBias: 0.6, drag: 1.5 });
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
  }

  private setState(s: State) {
    this.state = s;
    this.st = 0;
  }

  dispose() {
    this.scene.remove(this.group);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    targets.delete(this);
    for (const m of this.mats) m.dispose();
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.t += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.state === 'dying') {
      this.deathT += dt;
      const floor = heightAt(this.position.x, this.position.z);
      for (const p of this.pieces) {
        const wp = p.obj.getWorldPosition(new THREE.Vector3());
        if (wp.y > floor + 0.08) {
          p.vel.y -= 14 * dt;
          p.obj.position.addScaledVector(p.vel, dt);
          p.obj.rotation.x += p.spin.x * dt;
          p.obj.rotation.y += p.spin.y * dt;
          p.obj.rotation.z += p.spin.z * dt;
        } else {
          p.vel.multiplyScalar(0.3);
          p.spin.multiplyScalar(0.5);
          if (Math.abs(p.vel.y) > 0.5) events.emit('slimeLand', { at: wp, size: 0.2 });
          p.vel.y = 0;
        }
      }
      for (const e of this.eyes) e.visible = this.deathT < 0.4;
      if (this.glow) this.glow.intensity = Math.max(0, 2.5 * (1 - this.deathT / 0.8));
      return;
    }

    const toP = player.pos.clone().sub(this.position);
    const dist = Math.hypot(toP.x, toP.z);
    const wantYaw = Math.atan2(toP.x, toP.z);
    const aware = !player.dead && dist < 15;
    let move = 0;

    switch (this.state) {
      case 'idle':
        if (aware) this.setState('chase');
        break;
      case 'chase':
        this.yaw = dampAngle(this.yaw, wantYaw, 5, dt);
        if (!aware) this.setState('idle');
        else if (dist < REACH && this.cooldown <= 0) this.setState('windup');
        else if (dist > REACH * 0.8) move = SPEED;
        break;
      case 'windup':
        this.yaw = dampAngle(this.yaw, wantYaw, 7, dt);
        if (this.st > 0.7) {
          this.hitDone = false;
          this.setState('strike');
        }
        break;
      case 'strike':
        move = this.st < 0.2 ? 3.5 : 0;
        if (!this.hitDone && this.st > 0.1 && this.st < 0.3) this.tryHit(player, dist, toP);
        if (this.st > 0.4) this.setState('recover');
        break;
      case 'recover':
        if (this.st > 0.9) {
          this.cooldown = 0.6 + Math.random() * 1.2;
          this.setState('chase');
        }
        break;
      case 'guard':
        this.yaw = dampAngle(this.yaw, wantYaw, 6, dt);
        if (dist > REACH * 0.9) move = SPEED * 0.45;
        if (this.st > 1.6) this.setState(dist < REACH ? 'windup' : 'chase');
        break;
      case 'stagger':
        if (this.st > 1.7) {
          this.stunned = false;
          this.setState('chase');
        }
        break;
    }

    // Glide over the floor.
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const want = fwd.multiplyScalar(move);
    this.vel.x = damp(this.vel.x, want.x, 6, dt);
    this.vel.z = damp(this.vel.z, want.z, 6, dt);
    const desired = { x: this.vel.x * dt, y: -0.5 * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - 0.83 - 0.02, next.z);
    this.sync(dt);
  }

  private tryHit(player: Player, dist: number, toP: THREE.Vector3) {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (dist > REACH + 0.4 || fwd.dot(toP.clone().setY(0).normalize()) < 0.35) return;
    this.hitDone = true;
    const res = player.receiveAttack({
      damage: DAMAGE,
      from: this.position.clone(),
      parryable: true,
      poise: 55,
      onParried: () => {
        this.stunned = true;
        this.setState('stagger');
        this.fx.sparks(this.center.clone().addScaledVector(fwd, 0.5), fwd.clone().negate());
      },
    });
    if (res === 'blocked' || res === 'guardBroken') this.fx.sparks(player.center.addScaledVector(fwd, -0.4), fwd);
  }

  private sync(dt: number) {
    const s = this.state, st = this.st;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    // Hover and bob; staggering rocks back.
    const hover = 0.12 + Math.sin(this.t * 2.2) * 0.04;
    this.body.position.y = hover;
    const lean = s === 'stagger' ? -0.35 * (1 - smoothstep(0.3, 1.6, st)) : s === 'strike' ? 0.25 : s === 'windup' ? -0.12 : 0;
    this.body.rotation.x = damp(this.body.rotation.x, lean, 12, dt);
    // Sword arm: hang, raise overhead in windup, chop down on strike.
    let sw = 0.35;
    if (s === 'windup') sw = -2.5 * smoothstep(0, 0.5, st);
    else if (s === 'strike') sw = -2.5 + 3.6 * smoothstep(0.02, 0.2, st);
    else if (s === 'recover') sw = 1.1 - 0.75 * smoothstep(0.2, 0.9, st);
    else if (s === 'guard') sw = 0.6;
    this.swordArm.rotation.x = damp(this.swordArm.rotation.x, sw, s === 'strike' ? 30 : 10, dt);
    // Shield arm: raise across the body when guarding.
    const sh = s === 'guard' ? -1.35 : s === 'windup' ? 0.2 : -0.35;
    this.shieldArm.rotation.x = damp(this.shieldArm.rotation.x, sh, 12, dt);
    this.shieldArm.rotation.z = damp(this.shieldArm.rotation.z, s === 'guard' ? -0.55 : 0, 12, dt);
    this.center.set(this.position.x, this.position.y + 1.05 + hover, this.position.z);
    for (const m of this.mats) m.emissive.setRGB(0.5 * this.flash, 0.6 * this.flash, 0.9 * this.flash);
    if (this.glow) {
      this.glow.position.set(this.center.x, this.center.y + 0.3, this.center.z);
      this.glow.intensity = 2.2 + Math.sin(this.t * 9) * 0.3;
    }
    // Windup telegraph: the eyes flare.
    const flare = s === 'windup' ? 1 + smoothstep(0, 0.6, st) * 2 : 1;
    for (const e of this.eyes) e.scale.setScalar(flare);
  }
}
