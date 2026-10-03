import * as THREE from 'three';
import { events } from '../core/events';
import { dampAngle } from '../core/math';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { heightAt } from '../world/terrainHeight';
import { buildCharacter, type Look } from '../npc/charBuilder';
import { Swimmer, RAY, sandSpray } from './sandCreatures';
import type { Bolts } from './bandit';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';

// More of the sand-sea: eels that strike from burrows, armoured crabs, dune
// jellyfish drifting over the pans, raiders riding harnessed sand rays, and
// the trader caravans' great harnessed sand turtles.

const std = (color: number, roughness = 0.8, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const hitFx = (fx: FX, at: THREE.Vector3, color: number) => fx.add.spawn({ pos: at, spread: 1.6, count: 8, life: [0.3, 0.6], size: [0.07, 0.01], color, color2: 0x1a0a04, gravity: 8 });

export interface SandCreature {
  dead: boolean;
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean): void;
  dispose(): void;
}

/** Shared bits of a hittable sand creature. */
abstract class Beastie implements Target, SandCreature {
  id = newTargetId();
  abstract kind: string;
  abstract name: string;
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius = 0.8;
  halfHeight = 0.5;
  position = new THREE.Vector3();
  stunned = false;
  lockable = false;
  hp = 100;
  maxHp = 100;
  protected group = new THREE.Group();
  protected st = 0;
  protected flash = 0;
  protected deathT = -1;
  constructor(readonly home: THREE.Vector3, protected scene: THREE.Scene, protected fx: FX) {
    this.position.copy(home).setY(heightAt(home.x, home.z));
    scene.add(this.group);
    targets.add(this);
  }
  protected blood = 0x7a2a14;
  /** damage after armour; return 0 to ignore the hit */
  protected absorb(h: HitInfo) {
    return h.damage;
  }
  takeHit(h: HitInfo) {
    if (!this.alive) return;
    const d = this.absorb(h);
    if (d <= 0) return;
    this.hp -= d;
    this.flash = 1;
    hitFx(this.fx, h.at ?? this.center, this.blood);
    if (this.hp <= 0) {
      this.alive = false;
      this.lockable = false;
      this.stunned = false;
      this.deathT = 0;
      targets.delete(this);
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
      this.onDie();
    }
  }
  protected onDie() {}
  abstract update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean): void;
  /** Sink into the sand after dying; true once gone. */
  protected sinkAway(dt: number) {
    this.deathT += dt;
    this.group.position.y -= dt * 0.5;
    if (this.deathT > 4) {
      this.dead = true;
      this.scene.remove(this.group);
      return true;
    }
    return false;
  }
  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
    this.dead = true;
  }
}

// ---- sand eel ---------------------------------------------------------------------------------------

/** Lives in a burrow. Step close and it lashes out of the sand, bites, and pulls back. */
export class SandEel extends Beastie {
  kind = 'sandEel';
  name = 'Burrow Eel';
  private segs: THREE.Mesh[] = [];
  private head: THREE.Group;
  private out = 0; // 0 in the burrow .. 1 fully out
  private mode: 'hide' | 'strike' | 'hold' | 'back' = 'hide';
  private aim = new THREE.Vector3();
  private bit = false;
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX) {
    super(home, scene, fx);
    this.hp = this.maxHp = 90;
    this.radius = 0.6;
    const body = std(0xc89a52, 0.7), band = std(0x6a4a24, 0.7);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.34 - i * 0.012, 10, 8), i % 3 === 0 ? band : body);
      m.castShadow = true;
      this.group.add(m);
      this.segs.push(m);
    }
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), body);
    skull.scale.set(0.85, 0.75, 1.3);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 8), std(0x3a1a10));
    jaw.rotation.x = Math.PI / 2;
    jaw.position.z = 0.45;
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a20 }));
      eye.position.set(s * 0.24, 0.16, 0.22);
      this.head.add(eye);
    }
    this.head.add(skull, jaw);
    this.group.add(this.head);
    // The burrow: a dark ring in the sand.
    const hole = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.9, 16), std(0x5a4428, 1));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.04;
    this.group.add(hole);
    this.group.position.copy(this.position);
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (!this.alive) {
      this.out = Math.max(0, this.out - dt);
      this.pose();
      this.sinkAway(dt);
      return;
    }
    const d = Math.hypot(player.pos.x - this.position.x, player.pos.z - this.position.z);
    switch (this.mode) {
      case 'hide':
        this.out = Math.max(0, this.out - dt * 2);
        if (this.out <= 0 && Math.random() < dt * 0.15) sandSpray(this.fx, this.position.clone(), 2, 0.4);
        if (!player.dead && d < 5.5 && !sheltered(player.pos)) {
          this.mode = 'strike';
          this.st = 0;
          this.bit = false;
          this.aim.copy(player.center);
          sandSpray(this.fx, this.position.clone(), 20, 0.9);
        }
        break;
      case 'strike':
        this.out = Math.min(1, this.out + dt * 4.5);
        if (!this.bit && this.out > 0.85 && this.head.getWorldPosition(new THREE.Vector3()).distanceTo(player.center) < 1.3) {
          this.bit = true;
          player.receiveAttack({ damage: 20, from: this.position.clone(), at: player.center.clone(), parryable: true, poise: 30, onParried: () => (this.stunned = true, this.mode = 'hold', this.st = -1.2) });
        }
        if (this.out >= 1) (this.mode = 'hold'), (this.st = 0);
        break;
      case 'hold':
        // Out and swaying, exposed for a moment (longer if parried).
        this.aim.lerp(player.center, dt * 1.5);
        if (this.st > 1.8) {
          this.stunned = false;
          this.mode = 'back';
        }
        break;
      case 'back':
        this.out = Math.max(0, this.out - dt * 1.5);
        if (this.out <= 0) (this.mode = 'hide'), (this.st = -2.5);
        break;
    }
    this.lockable = this.out > 0.3;
    this.pose();
  }
  private pose() {
    const base = this.position.clone();
    const top = base.clone().setY(base.y + 3.4 * this.out);
    const reach = this.aim.clone().sub(base).setY(0);
    const len = Math.min(3.2, reach.length());
    reach.normalize().multiplyScalar(len * this.out);
    const tip = top.clone().add(reach).setY(base.y + Math.max(0.6, (this.aim.y - base.y) * this.out + 1.2 * this.out));
    const sway = Math.sin(this.st * 5) * 0.25 * this.out;
    for (let i = 0; i < this.segs.length; i++) {
      const t = (i + 1) / (this.segs.length + 1);
      // Quadratic curve: burrow -> straight up -> toward the target.
      const a = base.clone().lerp(top, t), b = top.clone().lerp(tip, t);
      const p = a.lerp(b, t);
      p.x += sway * Math.sin(t * 3);
      const under = p.y < base.y - 0.1 || this.out < 0.05;
      this.segs[i].visible = !under;
      this.segs[i].position.copy(p).sub(this.group.position);
    }
    this.head.visible = this.out > 0.05;
    this.head.position.copy(tip).sub(this.group.position);
    this.head.lookAt(this.aim);
    this.center.copy(tip);
  }
}

// ---- sand crab ------------------------------------------------------------------------------------

/** A big armoured crab: sideways rushes and a heavy pincer. Hit it from behind or the side. */
export class SandCrab extends Beastie {
  kind = 'sandCrab';
  name = 'Dune Crab';
  private body: THREE.Group;
  private legs: THREE.Mesh[] = [];
  private claws: THREE.Group[] = [];
  private yaw = Math.random() * 6.28;
  private mode: 'buried' | 'chase' | 'pinch' | 'back' = 'buried';
  private hitDone = false;
  private cool = 0;
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX) {
    super(home, scene, fx);
    this.hp = this.maxHp = 140;
    this.radius = 1;
    this.halfHeight = 0.5;
    this.blood = 0x4a6a3a;
    const shell = std(0xb8642a, 0.55, 0.1), dark = std(0x5a2a10, 0.6);
    this.body = new THREE.Group();
    const carapace = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shell);
    carapace.scale.set(1.1, 0.42, 0.85);
    carapace.position.y = 0.7;
    carapace.castShadow = true;
    this.body.add(carapace);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 5), dark);
      spike.position.set(-0.6 + i * 0.3, 1.05, -0.2);
      this.body.add(spike);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.12), dark);
      leg.geometry.translate(0.55, 0, 0);
      leg.position.set(s * 0.8, 0.65, -0.4 + k * 0.4);
      leg.rotation.y = s < 0 ? Math.PI : 0;
      leg.rotation.z = s * -0.6;
      this.body.add(leg);
      this.legs.push(leg);
    }
    for (const s of [-1, 1]) {
      const claw = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.9), shell);
      arm.position.z = 0.45;
      const pincer = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.6), shell);
      pincer.position.z = 1.05;
      claw.add(arm, pincer);
      claw.position.set(s * 0.6, 0.75, 0.6);
      claw.rotation.y = s * 0.3;
      this.body.add(claw);
      this.claws.push(claw);
    }
    for (const s of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), dark);
      stalk.position.set(s * 0.2, 1.05, 0.65);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(0x101010, 0.2));
      eye.position.set(s * 0.2, 1.22, 0.65);
      this.body.add(stalk, eye);
    }
    this.group.add(this.body);
  }
  protected absorb(h: HitInfo) {
    // The front of the shell turns blades.
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const front = h.dir.clone().setY(0).normalize().dot(fwd) < -0.5;
    if (front && h.source !== 'spell') {
      this.fx.sparks(this.center.clone().addScaledVector(fwd, 0.8), fwd);
      return h.damage * 0.35;
    }
    return h.damage;
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.cool -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    const g = heightAt(this.position.x, this.position.z);
    if (!this.alive) {
      this.body.rotation.z = Math.min(Math.PI, this.deathT * 2);
      this.sinkAway(dt);
      return;
    }
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const d = to.length();
    let y = g, walk = 0;
    switch (this.mode) {
      case 'buried':
        y = g - 0.75;
        if (!player.dead && d < 9 && !sheltered(player.pos)) {
          this.mode = 'chase';
          sandSpray(this.fx, this.position.clone().setY(g), 18, 0.9);
        }
        break;
      case 'chase': {
        this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 4, dt);
        // Crabs come at you crabwise: half sideways.
        const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(Math.sin(this.st * 0.8) * 0.8);
        const dir = to.clone().normalize().add(side).normalize();
        if (d > 1.9) {
          this.position.x += dir.x * 4 * dt;
          this.position.z += dir.z * 4 * dt;
          walk = 1;
        }
        if (d < 2.4 && this.cool <= 0) (this.mode = 'pinch'), (this.st = 0), (this.hitDone = false);
        if (d > 24 || player.dead) this.mode = 'back';
        break;
      }
      case 'pinch': {
        const t = this.st;
        for (const c of this.claws) c.rotation.x = t < 0.45 ? -0.9 * (t / 0.45) : Math.min(0.4, -0.9 + (t - 0.45) * 8);
        if (!this.hitDone && t > 0.5 && d < 2.6) {
          this.hitDone = true;
          player.receiveAttack({ damage: 19, from: this.position.clone(), at: player.center.clone(), parryable: true, poise: 34, onParried: () => (this.stunned = true, this.st = -0.6) });
        }
        if (t > 1.1) {
          this.stunned = false;
          for (const c of this.claws) c.rotation.x = 0;
          this.mode = 'chase';
          this.cool = 1 + Math.random();
        }
        break;
      }
      case 'back': {
        const h = new THREE.Vector3(this.home.x - this.position.x, 0, this.home.z - this.position.z);
        if (h.length() < 1) this.mode = 'buried';
        else {
          h.normalize();
          this.position.x += h.x * 3 * dt;
          this.position.z += h.z * 3 * dt;
          this.yaw = dampAngle(this.yaw, Math.atan2(h.x, h.z), 3, dt);
          walk = 1;
        }
        if (!player.dead && d < 6) this.mode = 'chase';
        break;
      }
    }
    this.legs.forEach((l, i) => (l.rotation.x = walk * Math.sin(this.st * 16 + i * 1.7) * 0.5));
    this.lockable = this.mode !== 'buried';
    this.position.y = y;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.center.set(this.position.x, y + 0.7, this.position.z);
  }
}

// ---- dune jellyfish -----------------------------------------------------------------------------------

/** Translucent bells adrift over the flat pans, trailing stinging threads. */
export class DuneJelly extends Beastie {
  kind = 'duneJelly';
  name = 'Dune Jelly';
  private bell: THREE.Mesh;
  private threads: THREE.LineSegments;
  private zap = 0;
  private drift = new THREE.Vector3();
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX, private hue = Math.random()) {
    super(home, scene, fx);
    this.hp = this.maxHp = 45;
    this.radius = 0.9;
    this.halfHeight = 0.6;
    this.blood = 0xc0a0ff;
    const col = new THREE.Color().setHSL(0.72 + this.hue * 0.25, 0.7, 0.6);
    this.bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.3), transparent: true, opacity: 0.7 }));
    inner.position.y = 0.2;
    this.bell.add(inner);
    const pts: number[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = Math.cos(a) * 0.6, z = Math.sin(a) * 0.6;
      for (let s = 0; s < 5; s++) pts.push(x * (1 - s * 0.08), -s * 0.45, z * (1 - s * 0.08), x * (1 - (s + 1) * 0.08), -(s + 1) * 0.45, z * (1 - (s + 1) * 0.08));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.threads = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
    this.group.add(this.bell, this.threads);
    this.lockable = true;
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.zap -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (!this.alive) {
      this.group.scale.multiplyScalar(1 - dt * 0.8);
      this.sinkAway(dt);
      return;
    }
    const g = heightAt(this.position.x, this.position.z);
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const d = to.length();
    // Drift: toward the player if near, else a slow wander round home.
    if (!player.dead && d < 18 && !sheltered(player.pos)) this.drift.lerp(to.normalize().multiplyScalar(1.6), dt);
    else {
      const h = new THREE.Vector3(this.home.x - this.position.x + Math.sin(this.st * 0.2) * 8, 0, this.home.z - this.position.z + Math.cos(this.st * 0.17) * 8);
      this.drift.lerp(h.multiplyScalar(0.05), dt);
    }
    this.position.addScaledVector(this.drift, dt);
    const pulse = Math.sin(this.st * 2.4);
    const y = g + 2.2 + pulse * 0.25;
    this.position.y = y;
    this.bell.scale.set(1 + pulse * 0.08, 1 - pulse * 0.12, 1 + pulse * 0.08);
    this.threads.rotation.y = this.st * 0.3;
    this.group.position.copy(this.position);
    this.center.set(this.position.x, y + 0.2, this.position.z);
    (this.bell.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + this.flash + Math.max(0, pulse) * 0.3;
    // Under the bell, the threads sting.
    if (!player.dead && d < 1.8 && player.pos.y < y && this.zap <= 0) {
      this.zap = 1.1;
      player.receiveAttack({ damage: 10, from: this.position.clone(), at: player.center.clone(), parryable: false, poise: 8 });
      this.fx.add.spawn({ pos: player.center.clone(), spread: 1.2, count: 14, life: [0.15, 0.35], size: [0.06, 0.01], color: 0xe0d0ff, color2: 0x8060ff });
    }
  }
}

// ---- raiders on harnessed sand rays -----------------------------------------------------------------

/** A scavenger raider in a saddle on a great sand ray, circling and throwing javelins. */
export class RaySkimmer extends Beastie {
  kind = 'rayRider';
  name = 'Ray-Rider';
  private mount: Swimmer;
  private riderRoot = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private yaw = Math.random() * 6.28;
  private orbit = Math.random() * 6.28;
  private throwT = 2;
  private mode: 'roam' | 'circle' | 'swoop' = 'roam';
  private hitDone = false;
  private wander = new THREE.Vector3();
  /** the rider is thrown clear when the ray dies (main spawns him on foot) */
  onDismount?: (at: THREE.Vector3) => void;
  constructor(home: THREE.Vector3, scene: THREE.Scene, fx: FX, private bolts: Bolts, look: Look) {
    super(home, scene, fx);
    this.hp = this.maxHp = 240;
    this.radius = 2.2;
    this.halfHeight = 0.6;
    this.mount = new Swimmer(RAY, 2.4, true);
    this.group.add(this.mount.group);
    // The harness: a saddle, girth straps over the wings and reins to the head.
    const leather = std(0x5a3418, 0.85), brass = std(0xc89a4a, 0.4, 0.7);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 1.1), leather);
    saddle.position.set(0, 0.3, -0.1);
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6), brass);
    pommel.position.set(0, 0.5, 0.4);
    this.group.add(saddle, pommel);
    for (const z of [-0.3, 0.2]) {
      const girth = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.05, 0.14), leather);
      girth.position.set(0, 0.2, z);
      this.group.add(girth);
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 10), brass);
        ring.position.set(s * 0.45, 0.32, z);
        this.group.add(ring);
      }
    }
    for (const s of [-1, 1]) {
      const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), leather);
      rein.rotation.x = Math.PI / 2 - 0.25;
      rein.position.set(s * 0.18, 0.62, 0.95);
      this.group.add(rein);
    }
    // Pennant on a pole behind the saddle: raiders fly their camp's rag.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), leather);
    pole.position.set(0.3, 1.3, -0.7);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: 0x8a2a1a, side: THREE.DoubleSide }));
    flag.position.set(0.65, 2.15, -0.7);
    this.group.add(pole, flag);
    this.riderRoot.position.set(0, 0.32, -0.1);
    this.group.add(this.riderRoot);
    void buildCharacter(look, ['sit', 'idle']).then((b) => {
      if (this.dead) return;
      this.riderRoot.add(b.root);
      b.root.position.y = -0.45;
      this.mixer = b.mixer;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      (acts.find((a) => a.getClip().name === 'sit') ?? acts[0])?.play();
      b.root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    });
    this.wander.copy(home);
    this.lockable = true;
  }
  protected onDie() {
    this.riderRoot.visible = false;
    this.onDismount?.(this.position.clone());
  }
  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.throwT -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.mixer?.update(dt);
    if (!this.alive) {
      this.mount.stroke(dt, 1, 0.04);
      this.group.position.y = Math.max(heightAt(this.position.x, this.position.z) - 0.3, this.group.position.y - dt * 2);
      this.sinkAway(dt);
      return;
    }
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const d = to.length();
    const hunt = !player.dead && !sheltered(player.pos) && d < 70;
    let target: THREE.Vector3;
    let speed = 9, height = 1.8;
    if (!hunt) {
      this.mode = 'roam';
      if (this.position.distanceTo(this.wander) < 6) this.wander.set(this.home.x + (Math.random() - 0.5) * 120, 0, this.home.z + (Math.random() - 0.5) * 120);
      target = this.wander;
      speed = 6;
    } else if (this.mode === 'swoop') {
      target = player.pos;
      speed = 16;
      height = 1.1;
      if (!this.hitDone && this.center.distanceTo(player.center) < 2.4) {
        this.hitDone = true;
        player.receiveAttack({ damage: 24, from: this.position.clone(), at: player.center.clone(), parryable: true, poise: 50, onParried: () => (this.mode = 'circle', this.stunned = true, this.st = -1.5) });
      }
      if (this.hitDone || this.st > 3) (this.mode = 'circle'), (this.st = 0);
    } else {
      this.mode = 'circle';
      this.stunned = this.st < 0;
      this.orbit += dt * 0.55;
      target = new THREE.Vector3(player.pos.x + Math.sin(this.orbit) * 13, 0, player.pos.z + Math.cos(this.orbit) * 13);
      // The rider throws javelins from the saddle; now and then the ray swoops.
      if (this.throwT <= 0 && d < 30) {
        this.throwT = 2.4 + Math.random() * 1.2;
        const from = this.center.clone().setY(this.center.y + 1.3);
        this.bolts.fire(from, player.pos.clone().setY(player.pos.y + 1.1).addScaledVector(player.vel ?? new THREE.Vector3(), 0.4), 28, 15);
      }
      if (this.st > 6 + Math.random() * 4) (this.mode = 'swoop'), (this.st = 0), (this.hitDone = false);
    }
    const want = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    this.yaw = dampAngle(this.yaw, want, this.mode === 'swoop' ? 3 : 1.8, dt);
    this.position.x += Math.sin(this.yaw) * speed * dt;
    this.position.z += Math.cos(this.yaw) * speed * dt;
    const g = heightAt(this.position.x, this.position.z);
    const y = g + height + Math.sin(this.st * 1.3) * 0.25;
    this.position.y = y;
    this.mount.stroke(dt, 3.2, 0.3);
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.rotateZ(-dampAngle(0, want - this.yaw, 1, 1) * 0.4);
    this.center.set(this.position.x, y + 0.4, this.position.z);
    if (Math.random() < dt * 8) this.fx.add.spawn({ pos: this.position.clone().setY(g + 0.1), vel: new THREE.Vector3(0, 1, 0), spread: 1.6, count: 1, life: [0.4, 0.9], size: [0.4, 0.08], color: 0xd9b77a, color2: 0xa8854f, gravity: 3, alpha: 0.6 });
  }
  dispose() {
    super.dispose();
    this.mixer?.stopAllAction();
  }
}

// ---- trader caravans on sand turtles -----------------------------------------------------------------

/** A great harnessed sand turtle hauling a trader's packs down the Caravan Way. Friendly. */
export class CaravanTurtle {
  readonly group = new THREE.Group();
  private flippers: THREE.Mesh[] = [];
  private head: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private seg = 0;
  private dir = 1;
  private u = 0;
  private wait = 0;
  readonly pos = new THREE.Vector3();
  private t = Math.random() * 10;
  constructor(private road: [number, number][], start: number, private scene: THREE.Scene, private fx: FX, trader: Look, readonly name: string) {
    this.seg = Math.min(road.length - 2, start);
    const shell = std(0x8a6a3a, 0.75), plate = std(0x6a4a24, 0.7), skin = std(0xa89060, 0.85);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell);
    dome.scale.set(1, 0.62, 1.25);
    dome.castShadow = true;
    this.group.add(dome);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 6), plate);
      p.position.set(Math.cos(a) * 1.4, 1.25, Math.sin(a) * 1.75);
      p.lookAt(p.position.clone().multiplyScalar(2).setY(4));
      this.group.add(p);
    }
    this.head = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.4, 10), skin);
    neck.rotation.x = Math.PI / 2 - 0.4;
    neck.position.set(0, 0.6, 0.4);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), skin);
    skull.scale.set(0.9, 0.75, 1.15);
    skull.position.set(0, 1.05, 1.1);
    this.head.add(neck, skull);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std(0x101010, 0.2));
      eye.position.set(s * 0.42, 1.2, 1.45);
      this.head.add(eye);
    }
    this.head.position.z = 2.9;
    this.group.add(this.head);
    for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.8), skin);
      f.geometry.translate(x * 0.9, 0, 0);
      f.position.set(x * 2.1, 0.35, z * 1.8);
      this.group.add(f);
      this.flippers.push(f);
    }
    // Harness, packs and a canopy over the trader's seat.
    const leather = std(0x5a3418, 0.85);
    for (const z of [-1, 0.6]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.06, 5, 30, Math.PI), leather);
      band.scale.set(1, 0.65, 1);
      band.position.z = z;
      this.group.add(band);
    }
    const cols = [0x1f7a7a, 0xb8402e, 0xd4a640, 0x6a4a2a];
    for (let k = 0; k < 6; k++) {
      const pack = new THREE.Mesh(k % 2 ? new THREE.BoxGeometry(0.8, 0.6, 0.6) : new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), std(cols[k % cols.length], 0.9));
      const s = k < 3 ? -1 : 1;
      pack.position.set(s * 1.9, 0.9, -1 + (k % 3) * 0.9);
      pack.rotation.z = s * 0.6;
      this.group.add(pack);
    }
    for (const [x, z] of [[-0.8, -1.2], [0.8, -1.2], [-0.8, 0.4], [0.8, 0.4]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), leather);
      post.position.set(x, 2.3, z);
      this.group.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.95, side: THREE.DoubleSide }));
    canopy.rotation.x = -Math.PI / 2;
    canopy.position.set(0, 3.2, -0.4);
    this.group.add(canopy);
    const seat = new THREE.Group();
    seat.position.set(0, 1.62, -0.4);
    this.group.add(seat);
    void buildCharacter(trader, ['sit', 'idle']).then((b) => {
      seat.add(b.root);
      b.root.position.y = -0.45;
      this.mixer = b.mixer;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      (acts.find((a) => a.getClip().name === 'sit') ?? acts[0])?.play();
    });
    scene.add(this.group);
    this.place();
  }
  /** Stopped at a stop (and so tradeable)? */
  get stopped() {
    return this.wait > 0;
  }
  private place() {
    const a = this.road[this.seg], b = this.road[this.seg + 1];
    const x = a[0] + (b[0] - a[0]) * this.u, z = a[1] + (b[1] - a[1]) * this.u;
    this.pos.set(x + 7, heightAt(x + 7, z), z); // keeps to the verge, off the road itself
  }
  update(dt: number, playerPos: THREE.Vector3) {
    this.t += dt;
    this.mixer?.update(dt);
    const near = playerPos.distanceTo(this.pos) < 9;
    // Stops to trade when you walk up, and rests at the road's ends.
    if (near) this.wait = Math.max(this.wait, 1.5);
    if (this.wait > 0) this.wait -= dt;
    else {
      const a = this.road[this.seg], b = this.road[this.seg + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.u += (this.dir * 2.4 * dt) / len;
      if (this.u > 1) {
        if (this.seg + 2 < this.road.length) (this.seg++, (this.u = 0));
        else (this.u = 1), (this.dir = -1), (this.wait = 25);
      } else if (this.u < 0) {
        if (this.seg > 0) (this.seg--, (this.u = 1));
        else (this.u = 0), (this.dir = 1), (this.wait = 25);
      }
    }
    const before = this.pos.clone();
    this.place();
    const mv = this.pos.clone().sub(before);
    const moving = this.wait <= 0;
    if (mv.lengthSq() > 1e-6) this.group.rotation.y = Math.atan2(mv.x, mv.z);
    // Swims through the sand: low in it, flippers sweeping, a wake of dust.
    const bob = moving ? Math.sin(this.t * 2.2) * 0.12 : 0;
    this.group.position.set(this.pos.x, this.pos.y - 0.55 + bob, this.pos.z);
    this.flippers.forEach((f, i) => (f.rotation.y = moving ? Math.sin(this.t * 2.2 + (i % 2) * Math.PI) * 0.5 : 0));
    this.head.rotation.y = Math.sin(this.t * 0.4) * 0.25;
    if (moving && Math.random() < dt * 10) this.fx.add.spawn({ pos: this.pos.clone().setY(this.pos.y + 0.1), vel: new THREE.Vector3(0, 1.4, 0), spread: 2.4, count: 1, life: [0.6, 1.2], size: [0.6, 0.1], color: 0xd9b77a, color2: 0xa8854f, gravity: 3, alpha: 0.6 });
  }
  setVisible(v: boolean) {
    this.group.visible = v;
  }
  dispose() {
    this.scene.remove(this.group);
  }
}
