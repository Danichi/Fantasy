import * as THREE from 'three';
import { heightAt } from '../../world/terrain';
import { physics } from '../../physics/physics';
import { damp } from '../../core/math';
import { events } from '../../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { buildGiant } from '../../world/elves/megaTree';
import { ForestCreature } from './forestCreature';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// ---------------------------------------------------------------------------
// The Blighted Elder (docs/design/verdant-elves.md §7, quest 4): a great tree
// gone wrong in the oldest grove, killing the forest around the Temple of
// Starfall. Three phases, each announced:
//   1  Roots     rooted in place; telegraphed root spikes burst under you,
//                and a sweeping slam if you stand at its feet.
//   2  Blight    (below 2/3) it spits blight sprouts and spreads pools of
//                rot that burn while you stand in them.
//   3  Uprooted  (below 1/3) it tears itself out of the ground and walks
//                after you, sweeping its limbs wide; the roots come faster.
// ---------------------------------------------------------------------------

const HP = 2600;

interface Spike { at: THREE.Vector3; t: number; mesh: THREE.Mesh; struck: boolean }
interface Pool { at: THREE.Vector3; r: number; life: number; mesh: THREE.Mesh; acc: number }

export class BlightedElder implements Target {
  id = newTargetId();
  kind = 'blightedElder';
  name = 'The Blighted Elder';
  alive = true;
  lockable = true;
  stunned = false;
  hp = HP;
  maxHp = HP;
  radius = 2.6;
  halfHeight = 3;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  /** 1 roots, 2 blight, 3 uprooted */
  phase: 1 | 2 | 3 = 1;
  /** its sprouts (the forest's threats update them) */
  sprouts: ForestCreature[] = [];
  onPhase?: (phase: number) => void;
  readonly group = new THREE.Group();
  private limbs: THREE.Group[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private spikes: Spike[] = [];
  private pools: Pool[] = [];
  private t = 0;
  private spikeT = 2;
  private slamT = 3;
  private sproutT = 4;
  private poolT = 6;
  private sweepT = 0;
  private sweepHit = false;
  private yaw = 0;
  private flash = 0;
  private deathT = 0;
  private uprootT = 0;
  private collider: ReturnType<typeof physics.addCylinder> | null = null;
  private spikeGeo = new THREE.ConeGeometry(0.55, 3.2, 6);
  private spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a24, roughness: 1, emissive: 0x4a1a5a, emissiveIntensity: 0.5 });
  private warnMat = new THREE.MeshBasicMaterial({ color: 0xb050ff, transparent: true, opacity: 0.45, depthWrite: false });
  private poolMat = new THREE.MeshStandardMaterial({ color: 0x2a0a2a, roughness: 0.3, emissive: 0x6a1a8a, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });

  constructor(at: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(at).setY(heightAt(at.x, at.z));
    const g = buildGiant(6606, 26, 0, { blobs: 2, crownScale: 0.7, roots: 9, lean: 0.06 });
    const rot = (geo: THREE.BufferGeometry, tint: THREE.Color) => {
      const c = geo.attributes.color as THREE.BufferAttribute;
      const k = new THREE.Color();
      for (let i = 0; i < c.count; i++) {
        k.fromBufferAttribute(c, i).lerp(tint, 0.65);
        c.setXYZ(i, k.r, k.g, k.b);
      }
    };
    rot(g.trunk, new THREE.Color(0x24161e));
    rot(g.crown, new THREE.Color(0x3a1a3a));
    const bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x3a0a4a, emissiveIntensity: 0.25 });
    const crown = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x4a1a5a, emissiveIntensity: 0.35 });
    this.mats.push(bark, crown);
    const body = new THREE.Group();
    body.add(new THREE.Mesh(g.trunk, bark), new THREE.Mesh(g.crown, crown));
    // Two great limbs that sweep, and a split in the trunk that glows like an eye.
    for (const s of [-1, 1]) {
      const l = new THREE.Group();
      l.position.set(s * 1.6, 9, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 9, 7).translate(0, -4.5, 0), bark);
      const claws = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 6).rotateX(Math.PI).translate(0, -9.6, 0), bark);
      l.add(arm, claws);
      l.rotation.z = s * 1.1;
      body.add(l);
      this.limbs.push(l);
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd8ff80, emissive: 0xb0ff30, emissiveIntensity: 2.5 });
    this.mats.push(eyeMat);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), eyeMat);
    eye.scale.set(0.6, 1.6, 0.4);
    eye.position.set(0, 6.5, 1.7);
    body.add(eye);
    body.traverse((o) => ((o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true))));
    this.group.add(body);
    this.group.position.copy(this.position);
    scene.add(this.group);
    this.collider = physics.addCylinder(new THREE.Vector3(at.x, this.position.y + 4, at.z), 4, 1.9);
    targets.add(this);
    this.center.set(this.position.x, this.position.y + 3, this.position.z);
  }

  get dead() {
    return !this.alive && this.deathT > 4;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.source === 'spell' ? h.damage * 1.25 : h.damage; // it burns well
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at, spread: 3, count: 14, life: [0.3, 0.7], size: [0.12, 0.02], color: 0xb050ff, color2: 0x2a0a2a, gravity: 5 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      targets.delete(this);
      if (this.collider) physics.removeStatic(this.collider);
      this.collider = null;
      this.fx.add.spawn({ pos: this.center.clone().setY(this.center.y + 4), spread: 8, count: 120, life: [0.8, 1.8], size: [0.2, 0.02], color: 0xd8ffb0, color2: 0x6a2a8a, upBias: 1.2, drag: 1 });
      for (const s of this.sprouts) if (s.alive) s.takeHit({ ...h, damage: 9999 });
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
      return;
    }
    const f = this.hp / this.maxHp;
    const next = f < 1 / 3 ? 3 : f < 2 / 3 ? 2 : 1;
    if (next > this.phase) {
      this.phase = next as 2 | 3;
      this.onPhase?.(this.phase);
      events.emit('bossSlam', { at: this.position.clone() });
      this.fx.dust(this.position, 6);
      if (this.phase === 3) {
        this.uprootT = 0;
        if (this.collider) physics.removeStatic(this.collider);
        this.collider = null;
      }
    }
  }

  update(dt: number, player: Player) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    for (const m of this.mats) m.emissiveIntensity = (m === this.mats[2] ? 2.5 : 0.3) + this.flash * 1.5 + (this.phase - 1) * 0.15;
    this.updateSpikes(dt, player);
    this.updatePools(dt, player);
    if (!this.alive) {
      this.deathT += dt;
      // It withers: the crown greys and the whole tree sinks a little and leans.
      this.group.rotation.z = Math.min(0.3, this.deathT * 0.1);
      this.group.position.y = this.position.y - Math.min(2, this.deathT * 0.5);
      return;
    }
    const toP = player.pos.clone().sub(this.position).setY(0);
    const dist = toP.length();
    const engaged = !player.dead && dist < 34;
    this.yaw = damp(this.yaw, Math.atan2(toP.x, toP.z), this.phase === 3 ? 2 : 0.6, dt);
    this.group.rotation.y = this.yaw;
    if (!engaged) {
      this.limbs.forEach((l, i) => (l.rotation.z = (i ? -1 : 1) * (1.1 + Math.sin(this.t * 0.7 + i) * 0.08)));
      return;
    }
    const fast = this.phase === 3 ? 0.55 : this.phase === 2 ? 0.8 : 1;
    // Root spikes: a warning ring under the player, then a burst of black wood.
    this.spikeT -= dt;
    if (this.spikeT <= 0) {
      this.spikeT = 3.2 * fast;
      const n = this.phase === 1 ? 1 : this.phase === 2 ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const off = k === 0 ? new THREE.Vector3() : new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
        this.spike(player.pos.clone().add(off));
      }
    }
    // Phase 2+: sprouts and rot pools.
    if (this.phase >= 2) {
      this.sproutT -= dt;
      if (this.sproutT <= 0 && this.sprouts.filter((s) => s.alive).length < 4) {
        this.sproutT = 7 * fast;
        const a = Math.random() * Math.PI * 2;
        const p = this.position.clone().add(new THREE.Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5));
        this.sprouts.push(new ForestCreature('blightSprout', p, this.scene, this.fx));
        this.fx.dust(p, 1.5);
      }
      this.poolT -= dt;
      if (this.poolT <= 0) {
        this.poolT = 8 * fast;
        this.pool(player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)));
      }
    }
    // The limb sweep: telegraphed by raising both limbs, then a wide arc.
    this.slamT -= dt;
    const reach = this.phase === 3 ? 11 : 9;
    if (this.slamT <= 0 && this.sweepT === 0 && dist < reach) {
      this.sweepT = 0.001;
      this.sweepHit = false;
    }
    if (this.sweepT > 0) {
      this.sweepT += dt;
      const up = Math.min(1, this.sweepT / 1.0);
      const down = Math.max(0, Math.min(1, (this.sweepT - 1.0) / 0.25));
      this.limbs.forEach((l, i) => (l.rotation.z = (i ? -1 : 1) * (1.1 + up * 1.4 - down * 2.6)));
      if (!this.sweepHit && this.sweepT > 1.1 && dist < reach + 1) {
        this.sweepHit = true;
        player.receiveAttack({ damage: this.phase === 3 ? 48 : 38, from: this.position.clone(), parryable: false, poise: 120 });
        events.emit('bossSlam', { at: this.position.clone() });
        this.fx.dust(this.position.clone().addScaledVector(toP.normalize(), 5), 3);
      }
      if (this.sweepT > 1.8) {
        this.sweepT = 0;
        this.slamT = 3.5 * fast;
      }
    } else this.limbs.forEach((l, i) => (l.rotation.z = damp(l.rotation.z, (i ? -1 : 1) * (1.1 + Math.sin(this.t * 1.3 + i) * 0.12), 3, dt)));
    // Phase 3: uprooted, it walks.
    if (this.phase === 3) {
      this.uprootT += dt;
      if (this.uprootT > 1.5 && dist > 6) {
        const step = Math.min(dt * 2.2, dist - 6);
        this.position.addScaledVector(toP.normalize(), step);
        this.position.y = heightAt(this.position.x, this.position.z);
        if (Math.random() < dt * 3) this.fx.dust(this.position, 1.2);
      }
      this.group.position.set(this.position.x, this.position.y + Math.abs(Math.sin(this.t * 2.2)) * 0.4, this.position.z);
    }
    this.center.set(this.position.x, this.position.y + 3, this.position.z);
  }

  private spike(at: THREE.Vector3) {
    at.y = heightAt(at.x, at.z);
    const warn = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20).rotateX(-Math.PI / 2), this.warnMat);
    warn.position.copy(at).setY(at.y + 0.08);
    this.scene.add(warn);
    this.spikes.push({ at, t: 0, mesh: warn, struck: false });
  }

  private updateSpikes(dt: number, player: Player) {
    for (const s of this.spikes) {
      s.t += dt;
      if (!s.struck && s.t > 1.1 && this.alive) {
        s.struck = true;
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh = new THREE.Mesh(this.spikeGeo, this.spikeMat);
        s.mesh.position.copy(s.at).setY(s.at.y + 1.2);
        this.scene.add(s.mesh);
        this.fx.dust(s.at, 1.5);
        if (Math.hypot(player.pos.x - s.at.x, player.pos.z - s.at.z) < 1.6) player.receiveAttack({ damage: 30, from: s.at.clone().setY(s.at.y - 1), parryable: false, poise: 80 });
      }
      if (s.struck) s.mesh.position.y = s.at.y + 1.2 - Math.max(0, s.t - 2) * 3;
    }
    for (const s of this.spikes.filter((x) => x.t > 3 || (!this.alive && !x.struck))) this.scene.remove(s.mesh);
    this.spikes = this.spikes.filter((x) => x.t <= 3 && (this.alive || x.struck));
  }

  private pool(at: THREE.Vector3) {
    at.y = heightAt(at.x, at.z);
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), this.poolMat);
    mesh.position.copy(at).setY(at.y + 0.06);
    this.scene.add(mesh);
    this.pools.push({ at, r: 2.6, life: 9, mesh, acc: 0 });
  }

  private updatePools(dt: number, player: Player) {
    for (const p of this.pools) {
      p.life -= this.alive ? dt : dt * 4;
      p.mesh.scale.setScalar(Math.min(1, (9 - p.life) * 2) * Math.min(1, p.life));
      if (Math.hypot(player.pos.x - p.at.x, player.pos.z - p.at.z) < p.r) {
        p.acc += dt;
        if (p.acc > 0.5) {
          p.acc = 0;
          player.takeDamage(6);
        }
      }
      if (Math.random() < dt * 4) this.fx.add.spawn({ pos: p.at.clone().setY(p.at.y + 0.2), spread: 2, count: 1, life: [0.6, 1.2], size: [0.2, 0.05], color: 0x8a2aaa, color2: 0x2a0a2a, upBias: 0.6, jitter: p.r * 0.7 });
    }
    for (const p of this.pools.filter((x) => x.life <= 0)) this.scene.remove(p.mesh);
    this.pools = this.pools.filter((x) => x.life > 0);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const s of this.spikes) this.scene.remove(s.mesh);
    for (const p of this.pools) this.scene.remove(p.mesh);
    for (const s of this.sprouts) s.dispose();
    this.sprouts = [];
    this.spikes = [];
    this.pools = [];
    if (this.collider) physics.removeStatic(this.collider);
    this.collider = null;
    targets.delete(this);
  }
}
