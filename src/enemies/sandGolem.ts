import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY } from '../physics/physics';
import { dampAngle } from '../core/math';
import { events } from '../core/events';
import { compressedGltf } from '../core/gltf';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { heightAt } from '../world/terrainHeight';
import { sfx } from '../audio/sfx';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';

// The Warden: a sandstone golem asleep under the southern dunes. Nothing marks
// the spot. Walk close and the ground starts to shake, then it hauls itself out
// of the sand. It has no rig, so it fights with its whole body: an overhead
// slam that shakes the ground, a spinning sweep, sand boulders thrown at range,
// and a stagger when it has taken enough punishment.
//
// The same body serves old Amaunet's greater guardians (GolemOpts): bigger,
// gilded, and able to call down pillars of sunfire where you stand, with a
// second phase once it has lost half its strength.

type State = 'dormant' | 'rising' | 'idle' | 'walk' | 'slam' | 'sweep' | 'throw' | 'sunfire' | 'stagger' | 'dying' | 'gone';

const SCALE = 0.78; // ~5.4 m tall
const SAND = 0xd9b77a, SAND_DARK = 0x9a7a4a;

interface Boulder { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }
interface Strike { at: THREE.Vector3; t: number; ring: THREE.Mesh; pillar: THREE.Mesh; hit: boolean }

/** A greater golem: the Warden's defaults unless given. */
export interface GolemOpts {
  name?: string;
  kind?: string;
  hp?: number;
  /** size relative to the Warden */
  scale?: number;
  /** damage multiplier */
  damage?: number;
  /** gold leaf and a sun-coloured inner fire */
  gilded?: boolean;
  /** calls pillars of sunfire down on the player, and rages below half health */
  sunfire?: boolean;
}

const SUN = 0xffc24a;

export class SandGolem implements Target {
  id = newTargetId();
  kind = 'sandGolem';
  name = 'The Warden of the Sands';
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius = 1.5;
  halfHeight = 1.6;
  position = new THREE.Vector3();
  stunned = false;
  lockable = false;
  maxHp: number;
  hp: number;
  private root = new THREE.Group();
  private body = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private eye: THREE.PointLight;
  private state: State = 'dormant';
  private st = 0;
  private yaw = 0;
  private cooldown = 2;
  private hitDone = false;
  private poiseDmg = 0;
  private flash = 0;
  private boulders: Boulder[] = [];
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private boulderGeo = new THREE.DodecahedronGeometry(0.7, 0);
  private boulderMat = new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 1, flatShading: true });
  private strikes: Strike[] = [];
  private ringGeo = new THREE.RingGeometry(1.7, 2.2, 32);
  private pillarGeo = new THREE.CylinderGeometry(1.6, 2.1, 30, 16, 1, true);
  private ringMat = new THREE.MeshBasicMaterial({ color: SUN, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  private pillarMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  private size: number;
  private dmg: number;
  /** below half health (sunfire golems only): faster, more fire */
  enraged = false;
  onWake?: () => void;
  onDeath?: () => void;
  /** the second phase began (half health) */
  onPhase?: (phase: number) => void;

  constructor(readonly home: THREE.Vector3, private scene: THREE.Scene, private fx: FX, private opts: GolemOpts = {}) {
    this.size = opts.scale ?? 1;
    this.dmg = opts.damage ?? 1;
    this.maxHp = this.hp = opts.hp ?? 1800;
    if (opts.name) this.name = opts.name;
    if (opts.kind) this.kind = opts.kind;
    this.radius = 1.5 * this.size;
    this.halfHeight = 1.6 * this.size;
    this.position.copy(home).setY(heightAt(home.x, home.z));
    this.root.add(this.body);
    this.eye = new THREE.PointLight(opts.gilded ? SUN : 0xffa030, 0, 9 * this.size, 2);
    this.eye.position.set(0, 4.6 * this.size, 0.6 * this.size);
    this.body.add(this.eye);
    scene.add(this.root);
    this.root.visible = false;
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y - 10, this.position.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(1.5 * this.size, 1.3 * this.size).setCollisionGroups(groups(G_ENEMY, 0xffff)), this.rb);
    void compressedGltf.loadAsync('/assets/desert/sandGolem.glb').then((g) => {
      const m = g.scene;
      m.scale.setScalar(SCALE * this.size);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // (The loader gives each load its own material; a clone of it failed to render.)
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.set(opts.gilded ? SUN : 0xff6020);
        // Gold leaf over the sandstone, worn through in places.
        if (opts.gilded && mat.color) {
          mat.color.lerp(new THREE.Color(0xe8b850), 0.55);
          mat.metalness = 0.45;
          mat.roughness = 0.5;
        }
        mat.emissiveIntensity = 0;
      });
      this.model = m;
      this.body.add(m);
    });
  }

  get awake() {
    return this.state !== 'dormant' && this.state !== 'gone';
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dormant' || this.state === 'rising' || this.state === 'dying') return;
    const mult = this.state === 'stagger' ? 1.5 : 1;
    this.hp -= h.damage * mult;
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 2, count: 12, life: [0.4, 0.9], size: [0.18, 0.04], color: SAND, color2: SAND_DARK, gravity: 7, upBias: 0.4 });
    if (this.hp <= 0) return this.die();
    if (this.opts.sunfire && !this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      sfx.roar(1);
      this.onPhase?.(2);
    }
    this.poiseDmg += h.poise + (h.source === 'spell' ? 20 : 0);
    if (this.poiseDmg > 260 * this.size && this.state !== 'stagger' && this.state !== 'slam') {
      this.poiseDmg = 0;
      this.set('stagger');
      this.stunned = true;
      sfx.rumble(1.2, 0.6);
    }
  }

  private die() {
    this.alive = false;
    this.lockable = false;
    this.stunned = false;
    this.set('dying');
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    sfx.rumble(4, 1);
    this.onDeath?.();
  }

  private set(s: State) {
    this.state = s;
    this.st = 0;
    this.hitDone = false;
    if (s !== 'stagger') this.stunned = false;
  }

  /** Wake now (a scripted rising), wherever the player stands. */
  wake() {
    if (this.state !== 'dormant' || !this.alive) return;
    this.set('rising');
    this.root.visible = true;
    sfx.rumble(6, 1);
    targets.add(this);
    this.onWake?.();
  }

  private sandBurst(at: THREE.Vector3, n: number, power = 1) {
    this.fx.add.spawn({ pos: at, vel: new THREE.Vector3(0, 5 * power, 0), spread: 3 * power, count: n, life: [0.7, 1.6], size: [0.5 * power, 0.12], color: SAND, color2: SAND_DARK, gravity: 7, upBias: 0.8, alpha: 0.85 });
  }

  private hurtIfNear(player: Player, at: THREE.Vector3, radius: number, damage: number, poise: number) {
    if (player.dead || this.hitDone) return;
    if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < radius && Math.abs(player.pos.y - at.y) < 3) {
      this.hitDone = true;
      player.receiveAttack({ damage: damage * this.dmg, from: this.position.clone(), at: player.center.clone(), parryable: false, poise });
    }
  }

  update(dt: number, player: Player) {
    this.st += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    const g = heightAt(this.position.x, this.position.z);
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const dist = to.length();
    const want = Math.atan2(to.x, to.z);
    const Z = this.size;
    let sink = 0, lean = 0, spin = 0, lift = 0;
    switch (this.state) {
      case 'dormant':
        // Nothing to see. Then the ground starts to shake.
        if (!player.dead && dist < 16) {
          this.set('rising');
          this.root.visible = true;
          this.yaw = want;
          sfx.rumble(6, 1);
          targets.add(this);
          this.onWake?.();
        }
        this.updateBoulders(dt, player);
        return;
      case 'rising': {
        const t = Math.min(1, this.st / 6);
        sink = (1 - t * t * (3 - 2 * t)) * 6.5 * Z;
        lean = Math.sin(this.st * 3) * 0.08 * (1 - t);
        if (Math.random() < dt * 20) this.sandBurst(this.position.clone().setY(g + 0.3), 6, 1.4);
        if (Math.random() < dt * 4) events.emit('bossSlam', { at: player.pos.clone() });
        if (t >= 1) {
          sfx.roar(1);
          this.lockable = true;
          this.set('idle');
          this.cooldown = 1.2;
        }
        break;
      }
      case 'idle':
      case 'walk': {
        if (player.dead) {
          this.set('idle');
          break;
        }
        this.yaw = dampAngle(this.yaw, want, 1.6, dt);
        if (this.cooldown <= 0) {
          if (this.opts.sunfire && dist < 40 && Math.random() < (this.enraged ? 0.4 : 0.22)) this.set('sunfire');
          else if (dist < 5.5 * Z) this.set(Math.random() < 0.55 ? 'slam' : 'sweep');
          else if (dist > 11 * Z && dist < 34 + 6 * Z) this.set('throw');
          else if (dist < 8 * Z) this.set('slam');
        }
        if (this.state === 'idle' || this.state === 'walk') {
          const moving = dist > 4.2 * Z;
          this.state = moving ? 'walk' : 'idle';
          if (moving) {
            const sp = 2.3 * Math.sqrt(Z) * (this.enraged ? 1.25 : 1);
            this.position.x += Math.sin(this.yaw) * sp * dt;
            this.position.z += Math.cos(this.yaw) * sp * dt;
            lift = Math.abs(Math.sin(this.st * 3.2)) * 0.25;
            lean = 0.06;
            if (Math.sin(this.st * 3.2) * Math.sin((this.st - dt) * 3.2) < 0) {
              events.emit('bossSlam', { at: this.position.clone() });
              this.sandBurst(this.position.clone().setY(g + 0.2), 5, 0.6);
            }
          }
        }
        break;
      }
      case 'slam': {
        // Rear back, then crash forward: the ground cracks in front of it.
        const wind = 1.3, hit = 1.6;
        if (this.st < wind) {
          this.yaw = dampAngle(this.yaw, want, 2.5, dt);
          lean = -0.32 * (this.st / wind);
          lift = 0.4 * (this.st / wind);
        } else {
          const t = Math.min(1, (this.st - wind) / (hit - wind));
          lean = -0.32 + t * 0.85;
          if (t >= 1 && !this.hitDone) {
            const at = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(3.4 * Z)).setY(g);
            this.sandBurst(at.clone().setY(g + 0.2), 40, 2 * Z);
            events.emit('bossSlam', { at: at.clone() });
            sfx.rumble(1.4, 0.9);
            this.hurtIfNear(player, at, 4.6 * Z, 46, 90);
            this.hitDone = true;
          }
        }
        if (this.st > 2.6) {
          this.cooldown = (1.2 + Math.random()) * (this.enraged ? 0.7 : 1);
          this.set('idle');
        }
        break;
      }
      case 'sweep': {
        // Wind up the other way, then a full turn with the arms out.
        const t = this.st;
        if (t < 0.8) spin = -0.5 * (t / 0.8);
        else if (t < 1.8) {
          spin = -0.5 + ((t - 0.8) / 1.0) * (Math.PI * 2 + 0.5);
          if (Math.random() < dt * 30) this.sandBurst(this.position.clone().setY(g + 0.3), 3, 0.8);
          if (t > 1.1 && t < 1.6) this.hurtIfNear(player, this.position.clone().setY(g), 5.2 * Z, 32, 60);
        } else spin = 0;
        if (t > 2.4) {
          this.cooldown = 1 + Math.random();
          this.set('idle');
        }
        break;
      }
      case 'throw': {
        // Scoop sand, pack it, hurl it.
        this.yaw = dampAngle(this.yaw, want, 3, dt);
        lean = this.st < 1 ? 0.35 * this.st : this.st < 1.4 ? 0.35 - (this.st - 1) * 1.6 : -0.3 + (this.st - 1.4) * 0.3;
        if (this.st > 1.2 && !this.hitDone) {
          this.hitDone = true;
          const from = this.position.clone().setY(g + 5.2 * Z);
          const target = player.center.clone();
          const T = Math.max(0.7, from.distanceTo(target) / 22);
          const vel = target.sub(from).divideScalar(T).add(new THREE.Vector3(0, 0.5 * 14 * T, 0));
          const mesh = new THREE.Mesh(this.boulderGeo, this.boulderMat);
          mesh.position.copy(from);
          mesh.castShadow = true;
          this.scene.add(mesh);
          this.boulders.push({ mesh, vel, life: 5 });
        }
        if (this.st > 2.2) {
          this.cooldown = (1.5 + Math.random()) * (this.enraged ? 0.7 : 1);
          this.set('idle');
        }
        break;
      }
      case 'sunfire': {
        // Arms raised to the sky: rings of light open on the sand, then the sun comes down through them.
        lean = -0.4 * Math.min(1, this.st / 0.6);
        lift = 0.3 * Math.min(1, this.st / 0.6);
        if (!this.hitDone && this.st > 0.5) {
          this.hitDone = true;
          const n = this.enraged ? 5 : 3;
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, r = k === 0 ? 0 : 4 + Math.random() * 7;
            // The first ring opens where you are going, not where you were.
            const at = player.pos.clone().addScaledVector(player.vel ?? new THREE.Vector3(), k === 0 ? 0.6 : 0).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
            at.y = heightAt(at.x, at.z) + 0.08;
            const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
            ring.rotation.x = -Math.PI / 2;
            ring.position.copy(at);
            const pillar = new THREE.Mesh(this.pillarGeo, this.pillarMat.clone());
            pillar.position.copy(at).setY(at.y + 15);
            pillar.visible = false;
            this.scene.add(ring, pillar);
            this.strikes.push({ at, t: -k * 0.25, ring, pillar, hit: false });
          }
          sfx.beam(0.5);
        }
        if (Math.random() < dt * 20) this.fx.add.spawn({ pos: this.center.clone().setY(this.center.y + 2 * Z), vel: new THREE.Vector3(0, 6, 0), spread: 1.5, count: 2, life: [0.4, 0.9], size: [0.3, 0.05], color: 0xfff0b0, color2: SUN, upBias: 2 });
        if (this.st > 2.2) {
          this.cooldown = (1.4 + Math.random()) * (this.enraged ? 0.7 : 1);
          this.set('idle');
        }
        break;
      }
      case 'stagger':
        // Down on one knee: the moment to hit it.
        sink = Math.min(1, this.st / 0.4) * 1.1;
        lean = 0.25;
        if (Math.random() < dt * 6) this.fx.add.spawn({ pos: this.center.clone(), spread: 1.5, count: 2, life: [0.6, 1.2], size: [0.2, 0.04], color: SAND, color2: SAND_DARK, gravity: 6 });
        if (this.st > 3.2) {
          this.stunned = false;
          this.set('idle');
        }
        break;
      case 'dying': {
        // Crumbles back into the sand it came from.
        sink = Math.min(6.5 * Z, this.st * this.st * 0.5 * Z);
        lean = Math.min(0.4, this.st * 0.1);
        if (Math.random() < dt * 30) this.sandBurst(this.position.clone().setY(g + 1 + Math.random() * 3 * Z), 6, 1.2 * Z);
        if (this.st > 4.5) {
          this.state = 'gone';
          this.root.visible = false;
          this.dead = true;
        }
        break;
      }
      case 'gone':
        this.updateBoulders(dt, player);
        return;
    }
    this.position.y = heightAt(this.position.x, this.position.z);
    this.root.position.set(this.position.x, this.position.y - sink + lift, this.position.z);
    this.root.rotation.set(0, this.yaw + spin, 0);
    this.body.rotation.set(lean, 0, 0);
    this.center.set(this.position.x, this.position.y - sink + 2.6 * Z, this.position.z);
    this.rb.setNextKinematicTranslation({ x: this.position.x, y: this.position.y - sink + 2.8 * Z, z: this.position.z });
    this.eye.intensity = this.state === 'dying' ? Math.max(0, 6 - this.st * 2) : 6 + Math.sin(this.st * 5) * 1.5;
    if (this.model) {
      const glow = this.flash * 1.2 + (this.state === 'slam' || this.state === 'throw' ? 0.25 : 0) + (this.state === 'stagger' ? 0.5 : 0) + (this.state === 'sunfire' ? 0.8 : 0) + (this.enraged ? 0.2 + Math.sin(this.st * 6) * 0.1 : 0);
      this.model.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'emissiveIntensity' in m) m.emissiveIntensity = glow;
      });
    }
    this.updateBoulders(dt, player);
  }

  private updateStrikes(dt: number, player: Player) {
    for (const s of this.strikes) {
      s.t += dt;
      const ringMat = s.ring.material as THREE.MeshBasicMaterial;
      if (s.t < 1.5) {
        // The ring tightens and brightens: get out.
        const k = Math.max(0, s.t) / 1.5;
        s.ring.scale.setScalar(1.6 - k * 0.6);
        ringMat.opacity = 0.25 + k * 0.6;
      } else {
        s.pillar.visible = true;
        const k = Math.min(1, (s.t - 1.5) / 0.6);
        s.pillar.scale.set(1 - k * 0.7, 1, 1 - k * 0.7);
        (s.pillar.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
        ringMat.opacity = 0.8 * (1 - k);
        if (!s.hit) {
          s.hit = true;
          this.fx.add.spawn({ pos: s.at.clone().setY(s.at.y + 0.3), vel: new THREE.Vector3(0, 7, 0), spread: 4, count: 30, life: [0.4, 1], size: [0.35, 0.05], color: 0xfff4c8, color2: SUN, gravity: 6, upBias: 1 });
          events.emit('bossSlam', { at: s.at.clone() });
          if (!player.dead && Math.hypot(player.pos.x - s.at.x, player.pos.z - s.at.z) < 2.3 && player.pos.y < s.at.y + 4) {
            player.receiveAttack({ damage: 38 * this.dmg, from: s.at.clone().setY(s.at.y + 10), at: player.center.clone(), parryable: false, poise: 70, burn: 6 });
          }
        }
      }
    }
    for (const s of this.strikes) if (s.t > 2.1) this.scene.remove(s.ring, s.pillar);
    this.strikes = this.strikes.filter((s) => s.t <= 2.1);
  }

  private updateBoulders(dt: number, player: Player) {
    this.updateStrikes(dt, player);
    for (const b of this.boulders) {
      b.life -= dt;
      b.vel.y -= 14 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 4;
      const p = b.mesh.position;
      if (!player.dead && p.distanceTo(player.center) < 1.4) {
        player.receiveAttack({ damage: 30, from: p.clone().sub(b.vel.clone().normalize().multiplyScalar(4)), at: p.clone(), parryable: false, poise: 50, projectile: true });
        b.life = 0;
      }
      if (p.y < heightAt(p.x, p.z)) b.life = 0;
      if (b.life <= 0) this.sandBurst(p.clone(), 16, 1);
    }
    for (const b of this.boulders) if (b.life <= 0) this.scene.remove(b.mesh);
    this.boulders = this.boulders.filter((b) => b.life > 0);
  }

  /** The player died or ran: it sinks back down and waits again, healed. */
  reset() {
    if (!this.alive) return;
    this.hp = this.maxHp;
    this.poiseDmg = 0;
    this.enraged = false;
    for (const s of this.strikes) this.scene.remove(s.ring, s.pillar);
    this.strikes = [];
    this.lockable = false;
    targets.delete(this);
    this.position.copy(this.home).setY(heightAt(this.home.x, this.home.z));
    this.state = 'dormant';
    this.st = 0;
    this.root.visible = false;
    this.rb.setNextKinematicTranslation({ x: this.position.x, y: this.position.y - 10, z: this.position.z });
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.root);
    for (const b of this.boulders) this.scene.remove(b.mesh);
    this.boulders = [];
    for (const s of this.strikes) this.scene.remove(s.ring, s.pillar);
    this.strikes = [];
    physics.world.removeRigidBody(this.rb);
    void this.col;
  }
}
