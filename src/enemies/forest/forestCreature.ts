import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../../physics/physics';
import { heightAt } from '../../world/terrain';
import { damp, dampAngle } from '../../core/math';
import { events } from '../../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { XP_FOR_KIND } from '../../progression/progression';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// ---------------------------------------------------------------------------
// The creatures of the elven woods (docs/design/verdant-elves.md §7):
//   spiritFox    blinks about when struck and steals coin from your pack
//   forestSpider spits webs that slow you; nests in the hollows
//   spiderQueen  the brood-mother of the hollow, three times the size
//   wisp         a floating light that zaps from a distance
//   treant       slow and huge and fire-weak; wakes when its tree is cut
//   giantMoth    a night flyer whose dust leaves you reeling
// One procedural body per kind and one small state machine: wander, notice,
// close in, telegraph, strike, recover, stagger, die.
// ---------------------------------------------------------------------------

export type ForestKind = 'spiritFox' | 'forestSpider' | 'spiderQueen' | 'wisp' | 'treant' | 'giantMoth' | 'blightSprout';

interface Spec {
  hp: number; damage: number; speed: number; reach: number; aware: number; radius: number; halfHeight: number;
  /** flies at this height above the ground */
  fly?: number;
  /** ranged attack: projectile speed and range */
  ranged?: { range: number; speed: number; web?: boolean; dust?: boolean };
  windup: number;
  poiseLimit: number;
  xp: [number, number];
}
const SPECS: Record<ForestKind, Spec> = {
  spiritFox: { hp: 60, damage: 9, speed: 5.2, reach: 1.4, aware: 16, radius: 0.35, halfHeight: 0.25, windup: 0.35, poiseLimit: 30, xp: [40, 10] },
  forestSpider: { hp: 90, damage: 14, speed: 3.6, reach: 1.8, aware: 18, radius: 0.6, halfHeight: 0.35, windup: 0.5, poiseLimit: 60, ranged: { range: 11, speed: 14, web: true }, xp: [55, 8] },
  spiderQueen: { hp: 520, damage: 30, speed: 3, reach: 3.2, aware: 24, radius: 1.4, halfHeight: 0.8, windup: 0.8, poiseLimit: 260, ranged: { range: 14, speed: 15, web: true }, xp: [600, 220] },
  wisp: { hp: 45, damage: 10, speed: 3.2, reach: 0, aware: 20, radius: 0.35, halfHeight: 0.35, fly: 1.8, windup: 0.7, poiseLimit: 20, ranged: { range: 9, speed: 12 }, xp: [45, 6] },
  treant: { hp: 560, damage: 36, speed: 1.6, reach: 3.6, aware: 22, radius: 1.2, halfHeight: 1.6, windup: 1.1, poiseLimit: 300, xp: [700, 120] },
  giantMoth: { hp: 75, damage: 8, speed: 4, reach: 0, aware: 22, radius: 0.6, halfHeight: 0.4, fly: 3.2, windup: 0.9, poiseLimit: 40, ranged: { range: 8, speed: 7, dust: true }, xp: [60, 10] },
  blightSprout: { hp: 50, damage: 11, speed: 2.8, reach: 1.6, aware: 30, radius: 0.45, halfHeight: 0.45, windup: 0.5, poiseLimit: 40, xp: [20, 3] },
};
// Rewards for the forest's foes (the progression table is shared).
Object.assign(XP_FOR_KIND, Object.fromEntries(Object.entries(SPECS).map(([k, s]) => [k, s.xp])), {
  blightedElder: [2400, 600], templeGuardian: [2000, 500], charcoalBurner: [40, 14], charcoalChief: [300, 140],
});

type State = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'stagger' | 'flee' | 'dying';

/** A slow-or-confuse effect the creature leaves on the player (the forest's threats apply it). */
export interface Affliction { slow: number; seconds: number; reel?: boolean }

const std = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });

export class ForestCreature implements Target {
  id = newTargetId();
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius: number;
  halfHeight: number;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  name: string;
  /** what the creature does to the player (read and cleared by the threats) */
  inflicted: Affliction | null = null;
  /** gold the fox snatched (returned if you catch it) */
  stolen = 0;
  /** a hidden fox that leads you somewhere instead of fighting */
  leadTo: THREE.Vector3 | null = null;
  /** asleep until something wakes it (treants rooted as trees) */
  dormant = false;
  readonly spec: Spec;
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private wings: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private state: State = 'idle';
  private st = 0;
  private t = Math.random() * 10;
  private yaw = Math.random() * 6;
  private vel = new THREE.Vector3();
  private cooldown = 1;
  private poiseAcc = 0;
  private flash = 0;
  private deathT = 0;
  private hitDone = false;
  private wanderAt: THREE.Vector3;
  private rb: RAPIER.RigidBody | null = null;
  private col: RAPIER.Collider | null = null;
  private kcc: RAPIER.KinematicCharacterController | null = null;
  private shots: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private shotMat: THREE.MeshBasicMaterial | null = null;

  constructor(readonly kind: ForestKind, at: THREE.Vector3, private scene: THREE.Scene, private fx: FX, readonly home = at.clone()) {
    this.spec = SPECS[kind];
    this.hp = this.maxHp = this.spec.hp;
    this.radius = this.spec.radius;
    this.halfHeight = this.spec.halfHeight;
    this.name = ({ spiritFox: 'Spirit Fox', forestSpider: 'Forest Spider', spiderQueen: 'The Brood-Mother', wisp: 'Wisp', treant: 'Treant', giantMoth: 'Giant Moth', blightSprout: 'Blight Sprout' } as const)[kind];
    this.position.copy(at).setY(heightAt(at.x, at.z) + (this.spec.fly ?? 0));
    this.wanderAt = at.clone();
    this.buildBody();
    this.group.add(this.body);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = kind !== 'wisp';
    });
    scene.add(this.group);
    if (!this.spec.fly) {
      const r = this.spec.radius * 0.8, hh = Math.max(0.05, this.spec.halfHeight * 0.8);
      this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, this.position.y + hh + r, at.z));
      this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(hh, r).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
      this.kcc = physics.createCharacterController(0.02);
    }
    targets.add(this);
    this.sync(0);
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 2.5;
  }

  private buildBody() {
    const add = (m: THREE.Object3D, parent: THREE.Object3D = this.body) => (parent.add(m), m);
    const mesh = (g: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial) => {
      this.mats.push(mat);
      return new THREE.Mesh(g, mat);
    };
    switch (this.kind) {
      case 'spiritFox': {
        const m = std(0xe8f8ff, { emissive: 0x58c8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.82 });
        const torso = add(mesh(new THREE.CapsuleGeometry(0.16, 0.42, 4, 8), m));
        torso.rotation.x = Math.PI / 2;
        torso.position.y = 0.42;
        const head = add(mesh(new THREE.ConeGeometry(0.15, 0.36, 8), m));
        head.rotation.x = Math.PI / 2;
        head.position.set(0, 0.55, 0.42);
        for (const s of [-1, 1]) add(mesh(new THREE.ConeGeometry(0.05, 0.16, 5), m)).position.set(s * 0.08, 0.7, 0.34);
        const tail = add(mesh(new THREE.ConeGeometry(0.14, 0.7, 8), m));
        tail.rotation.x = -Math.PI / 2 - 0.5;
        tail.position.set(0, 0.6, -0.5);
        this.arms.push(tail);
        for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) {
          const leg = add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.32, 5), m));
          leg.position.set(x, 0.16, z);
          this.legs.push(leg);
        }
        break;
      }
      case 'forestSpider':
      case 'spiderQueen':
      case 'blightSprout': {
        if (this.kind === 'blightSprout') {
          const m = std(0x2a1a2a, { emissive: 0x6a2a8a, emissiveIntensity: 0.6 });
          const bulb = add(mesh(new THREE.IcosahedronGeometry(0.38, 1), m));
          bulb.position.y = 0.5;
          bulb.scale.set(1, 1.3, 1);
          for (let k = 0; k < 5; k++) {
            const tendril = add(mesh(new THREE.ConeGeometry(0.07, 0.8, 5), m));
            const a = (k / 5) * Math.PI * 2;
            tendril.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3);
            tendril.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
            this.legs.push(tendril);
          }
          const eye = add(mesh(new THREE.SphereGeometry(0.08, 8, 6), std(0xd8ff60, { emissive: 0xc0ff40, emissiveIntensity: 2 })));
          eye.position.set(0, 0.7, 0.3);
          break;
        }
        const q = this.kind === 'spiderQueen' ? 2.6 : 1;
        const m = std(this.kind === 'spiderQueen' ? 0x2a1e2a : 0x3a3028, { roughness: 0.6 });
        const stripe = std(0x8a7a3a, { emissive: 0x3a5a10, emissiveIntensity: 0.3 });
        const abdomen = add(mesh(new THREE.SphereGeometry(0.42 * q, 12, 9), m));
        abdomen.scale.set(1, 0.82, 1.2);
        abdomen.position.set(0, 0.62 * q, -0.45 * q);
        const band = add(mesh(new THREE.TorusGeometry(0.36 * q, 0.04 * q, 5, 16), stripe));
        band.position.copy(abdomen.position).add(new THREE.Vector3(0, 0.1 * q, -0.1 * q));
        band.rotation.x = 0.4;
        const thorax = add(mesh(new THREE.SphereGeometry(0.26 * q, 10, 8), m));
        thorax.position.set(0, 0.5 * q, 0.12 * q);
        const eyeM = std(0xd8ff80, { emissive: 0xb8ff40, emissiveIntensity: 2.2 });
        for (const [x, y] of [[-0.08, 0.06], [0.08, 0.06], [-0.04, 0.12], [0.04, 0.12]]) add(mesh(new THREE.SphereGeometry(0.035 * q, 6, 5), eyeM)).position.set(x * q, 0.5 * q + y * q, 0.36 * q);
        for (let k = 0; k < 8; k++) {
          const side = k < 4 ? -1 : 1, i = k % 4;
          const hip = new THREE.Group();
          hip.position.set(side * 0.18 * q, 0.5 * q, (0.28 - i * 0.16) * q);
          const upper = mesh(new THREE.CylinderGeometry(0.035 * q, 0.03 * q, 0.62 * q, 5), m);
          upper.position.set(side * 0.27 * q, 0.16 * q, 0);
          upper.rotation.z = side * 1.05;
          const lower = mesh(new THREE.CylinderGeometry(0.028 * q, 0.012 * q, 0.75 * q, 5), m);
          lower.position.set(side * 0.62 * q, -0.15 * q, 0);
          lower.rotation.z = -side * 0.5;
          hip.add(upper, lower);
          hip.rotation.y = side * (i - 1.5) * 0.35;
          add(hip);
          this.legs.push(hip);
        }
        break;
      }
      case 'wisp': {
        const core = add(mesh(new THREE.SphereGeometry(0.16, 12, 10), std(0xf0ffff, { emissive: 0x9ae8ff, emissiveIntensity: 3 })));
        core.position.y = 0;
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
        add(halo);
        this.wings.push(halo);
        break;
      }
      case 'treant': {
        const bark = std(0x4a3a2a, { roughness: 1 });
        const moss = std(0x3d6a2a, { roughness: 1 });
        const torso = add(mesh(new THREE.CylinderGeometry(0.75, 1.0, 2.6, 10), bark));
        torso.position.y = 2.6;
        const head = add(mesh(new THREE.IcosahedronGeometry(1.5, 1), moss));
        head.position.y = 4.4;
        head.scale.set(1.2, 0.8, 1.2);
        const eyeM = std(0xfff0a0, { emissive: 0xffc840, emissiveIntensity: 2 });
        for (const s of [-1, 1]) add(mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeM)).position.set(s * 0.28, 3.4, 0.72);
        for (const s of [-1, 1]) {
          const leg = add(mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.5, 8), bark));
          leg.position.set(s * 0.45, 0.75, 0);
          this.legs.push(leg);
          const arm = new THREE.Group();
          arm.position.set(s * 0.85, 3.4, 0);
          const a1 = mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 7), bark);
          a1.position.y = -1.2;
          const claw = mesh(new THREE.ConeGeometry(0.4, 0.9, 6), bark);
          claw.position.y = -2.6;
          claw.rotation.x = Math.PI;
          const leaves = mesh(new THREE.IcosahedronGeometry(0.55, 0), moss);
          leaves.position.y = -0.3;
          arm.add(a1, claw, leaves);
          arm.rotation.z = s * 0.25;
          add(arm);
          this.arms.push(arm);
        }
        break;
      }
      case 'giantMoth': {
        const fur = std(0xd8c8a8);
        const torso = add(mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), fur));
        torso.rotation.x = Math.PI / 2;
        const wingTex = mothTexture();
        for (const s of [-1, 1]) {
          const w = new THREE.Group();
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9).translate(0.62, 0, 0), new THREE.MeshStandardMaterial({ map: wingTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, emissive: 0x6a8aff, emissiveMap: wingTex, emissiveIntensity: 0.5 }));
          plane.rotation.x = -Math.PI / 2;
          w.add(plane);
          w.scale.x = s;
          add(w);
          this.wings.push(w);
        }
        break;
      }
    }
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    if (this.dormant) this.wake();
    // Treants are wood: spells (fire most of all) bite deep.
    const dmg = this.kind === 'treant' && h.source === 'spell' ? h.damage * 1.6 : h.damage;
    this.hp -= dmg;
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at, spread: 2, count: 10, life: [0.2, 0.5], size: [0.08, 0.01], color: this.kind === 'treant' ? 0x8a6a3a : this.kind === 'spiritFox' || this.kind === 'wisp' ? 0xd8f8ff : 0x9ad04a, color2: 0x2a2a1a, gravity: 6 });
    if (this.hp <= 0) return this.die(h.dir);
    if (this.kind === 'spiritFox' && Math.random() < 0.6) return this.blink(h.dir);
    this.poiseAcc += h.poise;
    if (this.poiseAcc > this.spec.poiseLimit || this.stunned) {
      this.poiseAcc = 0;
      this.stunned = false;
      this.set('stagger');
      if (!this.spec.fly) this.vel.addScaledVector(h.dir, this.kind === 'treant' || this.kind === 'spiderQueen' ? 0.6 : 3);
    } else if (this.state === 'idle') this.set('chase');
  }

  /** The fox vanishes in a puff of light and reappears a few metres away. */
  private blink(dir: THREE.Vector3) {
    this.fx.add.spawn({ pos: this.center, spread: 1.6, count: 24, life: [0.3, 0.6], size: [0.12, 0.01], color: 0xe8fbff, color2: 0x58c8ff });
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    const to = this.position.clone().addScaledVector(side, 4 + Math.random() * 3).addScaledVector(dir, 2);
    this.teleport(to);
  }

  private teleport(to: THREE.Vector3) {
    to.y = heightAt(to.x, to.z) + (this.spec.fly ?? 0);
    this.position.copy(to);
    if (this.rb && this.col) {
      const r = this.spec.radius * 0.8, hh = Math.max(0.05, this.spec.halfHeight * 0.8);
      const t = { x: to.x, y: to.y + hh + r + 0.05, z: to.z };
      this.rb.setTranslation(t, true);
      this.col.setTranslation(t);
    }
  }

  /** A sleeping treant pulls up its roots. */
  wake() {
    if (!this.dormant) return;
    this.dormant = false;
    this.set('stagger');
    this.fx.dust(this.position, 3);
    events.emit('bossSlam', { at: this.position.clone() });
  }

  private die(dir: THREE.Vector3) {
    this.alive = false;
    this.stunned = false;
    this.set('dying');
    targets.delete(this);
    this.fx.add.spawn({ pos: this.center, spread: 3, count: 30, life: [0.5, 1.1], size: [0.1, 0.01], color: this.kind === 'spiritFox' || this.kind === 'wisp' ? 0xe8fbff : 0xb8d880, color2: 0x3a6a3a, upBias: 0.8, drag: 1.5 });
    this.vel.copy(dir).multiplyScalar(1.5);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
  }

  private set(s: State) {
    this.state = s;
    this.st = 0;
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.t += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.updateShots(dt, player);
    if (this.state === 'dying') {
      this.deathT += dt;
      this.body.rotation.z = Math.min(1.4, this.deathT * 2.5) * (this.spec.fly ? 0 : 1);
      if (this.spec.fly) this.position.y -= dt * 2.5 * Math.max(0, Math.min(1, this.position.y - heightAt(this.position.x, this.position.z)));
      const fade = Math.max(0, 1 - this.deathT / 2.5);
      for (const m of this.mats) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity, fade);
      }
      this.group.scale.setScalar(this.kind === 'wisp' ? fade : 1);
      this.sync(dt);
      return;
    }
    if (this.dormant) {
      this.sync(dt);
      return;
    }
    const toP = player.pos.clone().sub(this.position);
    const dist = Math.hypot(toP.x, toP.z);
    const want = Math.atan2(toP.x, toP.z);
    const aware = !player.dead && dist < this.spec.aware;
    let move = 0;
    // A leading fox keeps ahead of you toward its glade, waiting when you fall back.
    if (this.leadTo) {
      const toG = this.leadTo.clone().sub(this.position).setY(0);
      if (toG.length() < 2) move = 0;
      else if (dist < 14) {
        this.yaw = dampAngle(this.yaw, Math.atan2(toG.x, toG.z), 6, dt);
        move = this.spec.speed * 0.8;
      } else this.yaw = dampAngle(this.yaw, want, 3, dt);
      this.integrate(dt, move);
      return;
    }
    switch (this.state) {
      case 'idle': {
        if (aware) {
          this.set('chase');
          break;
        }
        const toW = this.wanderAt.clone().sub(this.position).setY(0);
        if (toW.length() < 1.5 || this.st > 8) {
          this.wanderAt.set(this.home.x + (Math.random() - 0.5) * 14, 0, this.home.z + (Math.random() - 0.5) * 14);
          this.st = 0;
        } else {
          this.yaw = dampAngle(this.yaw, Math.atan2(toW.x, toW.z), 3, dt);
          move = this.spec.speed * 0.3;
        }
        break;
      }
      case 'chase': {
        this.yaw = dampAngle(this.yaw, want, 5, dt);
        const leash = Math.hypot(this.position.x - this.home.x, this.position.z - this.home.z) > 45;
        if (!aware || leash) {
          this.wanderAt.copy(this.home);
          this.set('idle');
          break;
        }
        const r = this.spec.ranged;
        if (r && dist < r.range && dist > this.spec.reach + 1 && this.cooldown <= 0) this.set('windup');
        else if (this.spec.reach && dist < this.spec.reach && this.cooldown <= 0) this.set('windup');
        else if (dist > (this.spec.reach || (r?.range ?? 6) * 0.7) * 0.85) move = this.spec.speed;
        else if (!this.spec.reach && dist < 4) move = -this.spec.speed * 0.6; // flyers keep their distance
        break;
      }
      case 'windup':
        this.yaw = dampAngle(this.yaw, want, 7, dt);
        if (this.st > this.spec.windup) {
          this.hitDone = false;
          this.set('strike');
        }
        break;
      case 'strike': {
        const r = this.spec.ranged;
        const melee = this.spec.reach > 0 && dist < this.spec.reach + 1.2;
        if (!this.hitDone) {
          this.hitDone = true;
          if (melee) this.tryHit(player, dist, toP);
          else if (r) this.shoot(player);
        }
        move = melee && this.st < 0.15 ? this.spec.speed * 1.2 : 0;
        if (this.st > 0.45) this.set('recover');
        break;
      }
      case 'recover':
        if (this.st > (this.kind === 'treant' ? 1.3 : 0.7)) {
          this.cooldown = 0.5 + Math.random() * 1.4;
          this.set(this.stolen ? 'flee' : 'chase');
        }
        break;
      case 'stagger':
        if (this.st > (this.kind === 'treant' ? 1.4 : 0.9)) {
          this.stunned = false;
          this.set('chase');
        }
        break;
      case 'flee':
        this.yaw = dampAngle(this.yaw, want + Math.PI, 6, dt);
        move = this.spec.speed;
        if (dist > 40) this.vanish();
        break;
    }
    this.integrate(dt, move);
  }

  /** The thief gets away with what it took. */
  private vanish() {
    this.fx.add.spawn({ pos: this.center, spread: 1.6, count: 20, life: [0.3, 0.6], size: [0.12, 0.01], color: 0xe8fbff, color2: 0x58c8ff });
    this.alive = false;
    this.state = 'dying';
    this.deathT = 2.4;
    targets.delete(this);
  }

  private integrate(dt: number, move: number) {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.vel.x = damp(this.vel.x, fwd.x * move, 6, dt);
    this.vel.z = damp(this.vel.z, fwd.z * move, 6, dt);
    if (this.spec.fly) {
      const x = this.position.x + this.vel.x * dt, z = this.position.z + this.vel.z * dt;
      this.position.set(x, heightAt(x, z) + this.spec.fly + Math.sin(this.t * 1.7) * 0.35, z);
    } else if (this.kcc && this.col && this.rb) {
      const r = this.spec.radius * 0.8, hh = Math.max(0.05, this.spec.halfHeight * 0.8);
      this.kcc.computeColliderMovement(this.col, { x: this.vel.x * dt, y: -2 * dt, z: this.vel.z * dt }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
      const m = this.kcc.computedMovement();
      const cur = this.rb.translation();
      const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
      // Never sink under the terrain (its collider only exists near the player).
      const ground = heightAt(next.x, next.z) + hh + r;
      if (next.y < ground) next.y = ground;
      this.rb.setNextKinematicTranslation(next);
      this.col.setTranslation(next);
      this.position.set(next.x, next.y - hh - r, next.z);
    }
    this.sync(dt);
  }

  private tryHit(player: Player, dist: number, toP: THREE.Vector3) {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (dist > this.spec.reach + 0.6 || fwd.dot(toP.clone().setY(0).normalize()) < 0.3) return;
    const res = player.receiveAttack({
      damage: this.spec.damage, from: this.position.clone(), parryable: this.kind !== 'treant', poise: this.kind === 'treant' ? 90 : 30,
      onParried: () => {
        this.stunned = true;
        this.set('stagger');
      },
    });
    if (this.kind === 'treant') {
      this.fx.dust(player.pos, 1.5);
      events.emit('bossSlam', { at: this.position.clone() });
    }
    // A fox that bites snatches coin and runs.
    if (this.kind === 'spiritFox' && res === 'hit' && !this.stolen) {
      this.stolen = 5 + Math.floor(Math.random() * 15);
      this.inflicted = { slow: 1, seconds: 0 };
      this.set('flee');
    }
  }

  private shoot(player: Player) {
    const r = this.spec.ranged!;
    this.shotMat ??= new THREE.MeshBasicMaterial({ color: r.web ? 0xf0f0e8 : r.dust ? 0xc8b8ff : 0x9ae8ff, transparent: true, opacity: 0.85, blending: r.web ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r.dust ? 0.5 : r.web ? 0.18 : 0.14, 8, 6), this.shotMat);
    const from = this.center.clone();
    mesh.position.copy(from);
    const to = player.center.clone();
    const vel = to.sub(from).normalize().multiplyScalar(r.speed);
    this.scene.add(mesh);
    this.shots.push({ mesh, vel, life: r.range / r.speed + 0.3 });
  }

  private updateShots(dt: number, player: Player) {
    const r = this.spec.ranged;
    for (const s of this.shots) {
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (r?.dust) s.mesh.scale.multiplyScalar(1 + dt * 0.8);
      if (s.life > 0 && s.mesh.position.distanceTo(player.center) < (r?.dust ? 1.2 : 0.7)) {
        s.life = 0;
        const res = player.receiveAttack({ damage: this.spec.damage, from: s.mesh.position.clone().sub(s.vel.clone().multiplyScalar(0.1)), parryable: false, poise: 10 });
        if (res === 'hit' || res === 'blocked') this.inflicted = r?.web ? { slow: 0.5, seconds: 3 } : r?.dust ? { slow: 0.7, seconds: 4, reel: true } : null;
        this.fx.add.spawn({ pos: s.mesh.position, spread: 2, count: 14, life: [0.2, 0.5], size: [0.08, 0.01], color: r?.web ? 0xffffff : 0xa8e8ff, color2: 0x6a8aa8 });
      }
    }
    for (const s of this.shots.filter((x) => x.life <= 0)) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.shots = this.shots.filter((x) => x.life > 0);
  }

  private sync(dt: number) {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    const s = this.state, st = this.st;
    const moving = Math.hypot(this.vel.x, this.vel.z);
    const gait = this.t * (this.kind === 'treant' ? 3 : this.kind === 'spiritFox' ? 14 : 11);
    if (this.kind === 'forestSpider' || this.kind === 'spiderQueen') {
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(gait + i * 1.7) * 0.35 * Math.min(1, moving)));
      this.body.rotation.x = s === 'windup' ? -0.3 : s === 'strike' ? 0.2 : 0;
    } else if (this.kind === 'spiritFox') {
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(gait + (i % 2) * Math.PI) * 0.7 * Math.min(1, moving / 3)));
      if (this.arms[0]) this.arms[0].rotation.z = Math.sin(this.t * 4) * 0.3;
    } else if (this.kind === 'treant') {
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(gait + i * Math.PI) * 0.4 * Math.min(1, moving)));
      const raise = s === 'windup' ? -2.4 * Math.min(1, st / this.spec.windup) : s === 'strike' ? -2.4 + 3.2 * Math.min(1, st / 0.15) : 0;
      this.arms.forEach((a) => (a.rotation.x = damp(a.rotation.x, raise, s === 'strike' ? 30 : 8, dt)));
      if (this.dormant) this.arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * 1.1));
      else this.arms.forEach((a, i) => (a.rotation.z = damp(a.rotation.z, (i ? -1 : 1) * 0.25, 4, dt)));
    } else if (this.kind === 'giantMoth') {
      this.wings.forEach((w, i) => (w.rotation.z = Math.sin(this.t * 14) * 0.8 * (i ? -1 : 1)));
    } else if (this.kind === 'wisp') {
      this.wings[0]?.scale.setScalar(1 + Math.sin(this.t * 6) * 0.15 + (s === 'windup' ? st * 0.8 : 0));
    } else if (this.kind === 'blightSprout') {
      this.legs.forEach((l, i) => (l.rotation.y = Math.sin(this.t * 3 + i) * 0.3));
    }
    const h = this.spec.halfHeight;
    this.center.set(this.position.x, this.position.y + (this.spec.fly ? 0 : this.kind === 'treant' ? 2.6 : h + 0.15), this.position.z);
    for (const m of this.mats) if (m.emissive) {
      if (!m.userData.e) m.userData.e = { c: m.emissive.clone(), i: m.emissiveIntensity };
      m.emissive.copy(m.userData.e.c).lerp(new THREE.Color(1, 1, 1), this.flash * 0.6);
      m.emissiveIntensity = m.userData.e.i + this.flash;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.shots) this.scene.remove(s.mesh);
    this.shots = [];
    if (this.col) physics.world.removeCollider(this.col, false);
    if (this.rb) physics.world.removeRigidBody(this.rb);
    if (this.kcc) physics.world.removeCharacterController(this.kcc);
    this.col = null;
    this.rb = null;
    this.kcc = null;
    targets.delete(this);
    for (const m of this.mats) m.dispose();
  }
}

let mothTex: THREE.CanvasTexture | null = null;
function mothTexture() {
  if (mothTex) return mothTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8c8a8';
  g.beginPath();
  g.ellipse(64, 48, 62, 44, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5a6aa8';
  g.beginPath();
  g.arc(80, 44, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8f0ff';
  g.beginPath();
  g.arc(80, 44, 7, 0, Math.PI * 2);
  g.fill();
  mothTex = new THREE.CanvasTexture(c);
  mothTex.colorSpace = THREE.SRGBColorSpace;
  return mothTex;
}
