import * as THREE from 'three';
import { heightAt } from '../world/terrainHeight';
import { events } from '../core/events';
import { dampAngle } from '../core/math';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// Farmyard pests for Elder Glen's early quests: granary rats (weak melee
// enemies that swarm and nip) and crows (not enemies: a flock that pecks at
// the wheat and scatters when you run at it).

const ratMats = {
  fur: new THREE.MeshStandardMaterial({ color: 0x6b5a4c, roughness: 0.95 }),
  pink: new THREE.MeshStandardMaterial({ color: 0xd49a92, roughness: 0.7 }),
  eye: new THREE.MeshBasicMaterial({ color: 0x120c08 }),
};

function ratModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), ratMats.fur);
  body.scale.set(1, 0.75, 1.6);
  body.position.y = 0.14;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 8), ratMats.fur);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.16, 0.32);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), ratMats.pink);
  nose.position.set(0, 0.16, 0.44);
  g.add(body, head, nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), ratMats.pink);
    ear.position.set(s * 0.07, 0.25, 0.25);
    ear.rotation.y = s * 0.5;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), ratMats.eye);
    eye.position.set(s * 0.05, 0.2, 0.36);
    g.add(ear, eye);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.5, 5), ratMats.pink);
  tail.rotation.x = Math.PI / 2 - 0.3;
  tail.position.set(0, 0.1, -0.45);
  g.add(tail);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}

export class Rat implements Target {
  id = newTargetId();
  kind = 'rat';
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius = 0.3;
  halfHeight = 0.05;
  position = new THREE.Vector3();
  stunned = false;
  lockable = true;
  hp = 16;
  maxHp = 16;
  private root = ratModel();
  private yaw = Math.random() * 6.28;
  private cooldown = 1 + Math.random();
  private hurtT = 0;
  private deathT = 0;
  private wander = new THREE.Vector3();
  private t = Math.random() * 10;

  constructor(at: THREE.Vector3, private scene: THREE.Scene, private fx: FX, private home = at.clone()) {
    this.position.copy(at);
    this.wander.copy(at);
    scene.add(this.root);
    targets.add(this);
    this.sync();
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    this.hurtT = 0.35;
    this.position.addScaledVector(h.dir, 0.8);
    events.emit('enemyHit', { at: this.center.clone(), amount: h.damage, crit: h.crit, enemyId: this.id });
    if (this.hp <= 0) {
      this.alive = false;
      targets.delete(this);
      this.fx.dust(this.position, 0.6);
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    }
  }

  update(dt: number, player: Player) {
    this.t += dt;
    if (!this.alive) {
      this.deathT += dt;
      this.root.rotation.z = Math.min(Math.PI, this.deathT * 8);
      this.root.scale.setScalar(Math.max(0.01, 1 - this.deathT * 0.8));
      if (this.deathT > 1.2 && !this.dead) {
        this.dead = true;
        this.scene.remove(this.root);
      }
      return;
    }
    this.cooldown -= dt;
    this.hurtT -= dt;
    const to = player.pos.clone().sub(this.position).setY(0);
    const d = to.length();
    let speed = 0;
    let want = this.yaw;
    if (this.hurtT > 0) speed = 0;
    else if (d < 12 && !player.dead && this.position.distanceTo(this.home) < 22) {
      // Scurry at the player in little zig-zags and nip at the ankles.
      want = Math.atan2(to.x, to.z) + Math.sin(this.t * 7) * 0.5;
      speed = d > 0.9 ? 4.2 : 0;
      if (d < 1.1 && this.cooldown <= 0) {
        this.cooldown = 1.1 + Math.random() * 0.6;
        const dir = to.normalize();
        player.receiveAttack({
          damage: 5,
          from: this.position.clone(),
          parryable: true,
          poise: 4,
          onParried: () => this.position.addScaledVector(dir, -1.2),
        });
      }
    } else {
      // Nose about near home.
      const w = this.wander.clone().sub(this.position).setY(0);
      if (w.length() < 0.5 || Math.random() < dt * 0.2) {
        const a = Math.random() * 6.28, r = Math.random() * 6;
        this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      }
      want = Math.atan2(w.x, w.z);
      speed = 1.2;
    }
    this.yaw = dampAngle(this.yaw, want, 10, dt);
    this.position.x += Math.sin(this.yaw) * speed * dt;
    this.position.z += Math.cos(this.yaw) * speed * dt;
    this.position.y = heightAt(this.position.x, this.position.z);
    this.sync();
    // A little scamper bob.
    this.root.position.y += Math.abs(Math.sin(this.t * 22)) * 0.03 * Math.min(1, speed);
  }

  private sync() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y + 0.15, this.position.z);
  }

  dispose() {
    this.alive = false;
    targets.delete(this);
    this.scene.remove(this.root);
    this.dead = true;
  }
}

// ---- crows ------------------------------------------------------------------------

const crowMat = new THREE.MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.6, metalness: 0.1 });
const beakMat = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.6 });

function crowModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), crowMat);
  body.scale.set(0.9, 0.85, 1.5);
  body.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), crowMat);
  head.position.set(0, 0.3, 0.16);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 6), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.29, 0.26);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.16), crowMat);
  tail.position.set(0, 0.2, -0.22);
  tail.rotation.x = 0.3;
  g.add(body, head, beak, tail);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.08, 0.25, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.16), crowMat);
    wing.position.x = s * 0.17;
    pivot.add(wing);
    g.add(pivot);
    wings.push(pivot);
  }
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return { g, wings, head };
}

interface Crow {
  root: THREE.Group;
  wings: THREE.Object3D[];
  head: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  state: 'peck' | 'hop' | 'flee' | 'gone';
  t: number;
  yaw: number;
}

/** Crows pecking at a field; each scattered bird calls onScare once. */
export class CrowFlock {
  private crows: Crow[] = [];
  onScare?: () => void;

  constructor(private scene: THREE.Scene, readonly center: THREE.Vector3, private halfX: number, private halfZ: number) {}

  /** Land `n` more crows in the field. */
  land(n: number) {
    for (let i = 0; i < n; i++) {
      const { g, wings, head } = crowModel();
      const x = this.center.x + (Math.random() * 2 - 1) * this.halfX;
      const z = this.center.z + (Math.random() * 2 - 1) * this.halfZ;
      const pos = new THREE.Vector3(x, heightAt(x, z) + 0.05, z);
      this.scene.add(g);
      this.crows.push({ root: g, wings, head, pos, vel: new THREE.Vector3(), state: 'peck', t: Math.random() * 3, yaw: Math.random() * 6.28 });
    }
  }

  get perched() {
    return this.crows.filter((c) => c.state === 'peck' || c.state === 'hop').length;
  }

  update(dt: number, player: THREE.Vector3, running: boolean) {
    for (const c of this.crows) {
      c.t += dt;
      if (c.state === 'peck' || c.state === 'hop') {
        const d = Math.hypot(c.pos.x - player.x, c.pos.z - player.z);
        // Walking up sends them hopping away; running at them (or coming very close) scatters them.
        if (d < (running ? 7 : 3)) {
          c.state = 'flee';
          const away = c.pos.clone().sub(player).setY(0).normalize();
          c.vel.set(away.x * 6, 5 + Math.random() * 2, away.z * 6);
          c.t = 0;
          this.onScare?.();
        } else if (d < 6 && c.state === 'peck') {
          c.state = 'hop';
          c.t = 0;
          const away = c.pos.clone().sub(player).setY(0).normalize();
          c.vel.set(away.x * 1.5, 0, away.z * 1.5);
        } else if (c.state === 'hop' && c.t > 0.8) c.state = 'peck';
        if (c.state === 'hop') {
          c.pos.addScaledVector(c.vel, dt);
          c.pos.y = heightAt(c.pos.x, c.pos.z) + 0.05 + Math.abs(Math.sin(c.t * 9)) * 0.12;
        }
        // Pecking: the head bobs down to the soil.
        c.head.position.y = 0.3 - Math.max(0, Math.sin(c.t * 5)) * 0.12;
        for (const [k, w] of c.wings.entries()) w.rotation.z = (k ? -1 : 1) * 0.1;
        if (Math.random() < dt * 0.3) c.yaw += (Math.random() - 0.5) * 2;
      } else if (c.state === 'flee') {
        c.vel.y += dt * 1.5;
        c.pos.addScaledVector(c.vel, dt);
        c.yaw = Math.atan2(c.vel.x, c.vel.z);
        for (const [k, w] of c.wings.entries()) w.rotation.z = (k ? -1 : 1) * Math.sin(c.t * 26) * 0.9;
        if (c.t > 6) {
          c.state = 'gone';
          this.scene.remove(c.root);
        }
      }
      c.root.position.copy(c.pos);
      c.root.rotation.y = c.yaw;
    }
    this.crows = this.crows.filter((c) => c.state !== 'gone');
  }

  clear() {
    for (const c of this.crows) this.scene.remove(c.root);
    this.crows = [];
  }
}
