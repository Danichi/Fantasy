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

type State = 'dormant' | 'rising' | 'idle' | 'walk' | 'slam' | 'sweep' | 'throw' | 'stagger' | 'dying' | 'gone';

const SCALE = 0.78; // ~5.4 m tall
const SAND = 0xd9b77a, SAND_DARK = 0x9a7a4a;

interface Boulder { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

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
  maxHp = 1800;
  hp = 1800;
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
  onWake?: () => void;
  onDeath?: () => void;

  constructor(readonly home: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(home).setY(heightAt(home.x, home.z));
    this.root.add(this.body);
    this.eye = new THREE.PointLight(0xffa030, 0, 9, 2);
    this.eye.position.set(0, 4.6, 0.6);
    this.body.add(this.eye);
    scene.add(this.root);
    this.root.visible = false;
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y - 10, this.position.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(1.5, 1.3).setCollisionGroups(groups(G_ENEMY, 0xffff)), this.rb);
    void compressedGltf.loadAsync('/assets/desert/sandGolem.glb').then((g) => {
      const m = g.scene;
      m.scale.setScalar(SCALE);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // (The loader gives each load its own material; a clone of it failed to render.)
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.set(0xff6020);
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
    this.poiseDmg += h.poise + (h.source === 'spell' ? 20 : 0);
    if (this.poiseDmg > 260 && this.state !== 'stagger' && this.state !== 'slam') {
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

  private sandBurst(at: THREE.Vector3, n: number, power = 1) {
    this.fx.add.spawn({ pos: at, vel: new THREE.Vector3(0, 5 * power, 0), spread: 3 * power, count: n, life: [0.7, 1.6], size: [0.5 * power, 0.12], color: SAND, color2: SAND_DARK, gravity: 7, upBias: 0.8, alpha: 0.85 });
  }

  private hurtIfNear(player: Player, at: THREE.Vector3, radius: number, damage: number, poise: number) {
    if (player.dead || this.hitDone) return;
    if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < radius && Math.abs(player.pos.y - at.y) < 3) {
      this.hitDone = true;
      player.receiveAttack({ damage, from: this.position.clone(), at: player.center.clone(), parryable: false, poise });
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
        sink = (1 - t * t * (3 - 2 * t)) * 6.5;
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
          if (dist < 5.5) this.set(Math.random() < 0.55 ? 'slam' : 'sweep');
          else if (dist > 11 && dist < 34) this.set('throw');
          else if (dist < 8) this.set('slam');
        }
        if (this.state === 'idle' || this.state === 'walk') {
          const moving = dist > 4.2;
          this.state = moving ? 'walk' : 'idle';
          if (moving) {
            const sp = 2.3;
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
            const at = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(3.4)).setY(g);
            this.sandBurst(at.clone().setY(g + 0.2), 40, 2);
            events.emit('bossSlam', { at: at.clone() });
            sfx.rumble(1.4, 0.9);
            this.hurtIfNear(player, at, 4.6, 46, 90);
            this.hitDone = true;
          }
        }
        if (this.st > 2.6) {
          this.cooldown = 1.2 + Math.random();
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
          if (t > 1.1 && t < 1.6) this.hurtIfNear(player, this.position.clone().setY(g), 5.2, 32, 60);
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
          const from = this.position.clone().setY(g + 5.2);
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
          this.cooldown = 1.5 + Math.random();
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
        sink = Math.min(6.5, this.st * this.st * 0.5);
        lean = Math.min(0.4, this.st * 0.1);
        if (Math.random() < dt * 30) this.sandBurst(this.position.clone().setY(g + 1 + Math.random() * 3), 6, 1.2);
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
    this.center.set(this.position.x, this.position.y - sink + 2.6, this.position.z);
    this.rb.setNextKinematicTranslation({ x: this.position.x, y: this.position.y - sink + 2.8, z: this.position.z });
    this.eye.intensity = this.state === 'dying' ? Math.max(0, 6 - this.st * 2) : 6 + Math.sin(this.st * 5) * 1.5;
    if (this.model) {
      const glow = this.flash * 1.2 + (this.state === 'slam' || this.state === 'throw' ? 0.25 : 0) + (this.state === 'stagger' ? 0.5 : 0);
      this.model.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'emissiveIntensity' in m) m.emissiveIntensity = glow;
      });
    }
    this.updateBoulders(dt, player);
  }

  private updateBoulders(dt: number, player: Player) {
    for (const b of this.boulders) {
      b.life -= dt;
      b.vel.y -= 14 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 4;
      const p = b.mesh.position;
      if (!player.dead && p.distanceTo(player.center) < 1.4) {
        player.receiveAttack({ damage: 30, from: p.clone().sub(b.vel.clone().normalize().multiplyScalar(4)), at: p.clone(), parryable: false, poise: 50 });
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
    physics.world.removeRigidBody(this.rb);
    void this.col;
  }
}
