import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { damp, dampAngle, segmentPointDistance, smoothstep } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// ---------------------------------------------------------------------------
// The Tide-Warden: an ancient construct of the wheel-cutters, set to guard the
// Drowned Shrine's basin. A hulking body of green-bronze plates and old stone
// around a turning core of sea-glass, in the painted style (built here, no
// model). Every big blow has a tell:
//   slam    both fists rise and the core flares            -> roll away
//   sweep   one arm draws back low                          -> roll through or back off
//   wave    it crouches and the water boils round its feet  -> get up on a dais, or roll the ring
//   jet     the core charges and points                     -> keep moving sideways
// The dungeon's boss template (dungeon/kit/boss.ts) runs its phases: from the
// second the wave, from the third the jet, and it moves faster.
// ---------------------------------------------------------------------------

type State = 'dormant' | 'wake' | 'chase' | 'slam' | 'sweep' | 'wave' | 'jet' | 'recover' | 'stagger' | 'dying';

const HP = 1400;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class TideWarden implements Target {
  id = newTargetId();
  kind = 'tideWarden';
  name = 'The Tide-Warden';
  alive = true;
  lockable = true;
  stunned = false;
  hp = HP;
  maxHp = HP;
  radius = 1.2;
  halfHeight = 1.4;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  /** phases the template has opened: 1 adds the wave, 2 the jet */
  phase = 0;
  speedMul = 1;
  /** is this point on high ground (a dais)? the wave rolls under it */
  onHigh: (p: THREE.Vector3) => boolean = () => false;
  /** the wave's ring, for the arena to draw (radius, or -1) */
  waveR = -1;

  private group = new THREE.Group();
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private core: THREE.Mesh;
  private coreMat: THREE.MeshStandardMaterial;
  private mats: THREE.MeshStandardMaterial[] = [];
  private jetMesh: THREE.Mesh;
  private ring: THREE.Mesh;
  private state: State = 'dormant';
  private st = 0;
  private yaw = 0;
  private vel = new THREE.Vector3();
  private cooldown = 1.5;
  private poise = 0;
  private hitDone = false;
  private deathT = 0;
  private flash = 0;
  private lastMove = '';
  private jetDir = new THREE.Vector3();
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private t = 0;

  constructor(at: THREE.Vector3, yaw: number, private scene: THREE.Scene, private fx: FX) {
    this.position.copy(at);
    this.yaw = yaw;
    const bronze = new THREE.MeshStandardMaterial({ color: 0x4f7a68, metalness: 0.7, roughness: 0.45 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a9a94, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3a36, roughness: 0.8 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x6af0e8, emissive: 0x30c8c0, emissiveIntensity: 1.2, roughness: 0.2 });
    this.mats.push(bronze, stone, dark, this.coreMat);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // Legs: stone pillars with bronze greaves.
    for (const s of [-1, 1]) {
      box(0.7, 1.5, 0.8, stone, s * 0.6, 0.75, 0, this.body);
      box(0.8, 0.5, 0.9, bronze, s * 0.6, 1.1, 0.05, this.body);
    }
    // Torso: a heavy drum of plates round the core.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 1.6, 10), bronze);
    torso.position.y = 2.3;
    torso.castShadow = true;
    this.body.add(torso);
    box(2.6, 0.45, 1.1, stone, 0, 3.2, 0, this.body);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), this.coreMat);
    this.core.position.set(0, 2.35, 0.75);
    this.body.add(this.core);
    // A head like a wheel: a stone disc with eight bronze rays.
    const head = new THREE.Group();
    head.position.set(0, 3.85, 0.1);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), stone);
    disc.rotation.x = Math.PI / 2;
    head.add(disc);
    for (let a = 0; a < 8; a++) {
      const ray = box(0.08, 0.35, 0.12, bronze, Math.sin((a * Math.PI) / 4) * 0.7, Math.cos((a * Math.PI) / 4) * 0.7, 0, head, -(a * Math.PI) / 4);
      void ray;
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), this.coreMat);
    eye.position.z = 0.17;
    head.add(eye);
    this.body.add(head);
    // Arms pivot at the shoulders: stone upper arm, bronze fist.
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(s * 1.45, 3.1, 0);
      box(0.55, 1.3, 0.6, stone, 0, -0.65, 0, arm);
      box(0.75, 0.9, 0.8, bronze, 0, -1.65, 0.05, arm);
      box(0.6, 0.25, 0.65, dark, 0, -1.1, 0, arm);
      this.body.add(arm);
    }
    this.group.add(this.body);
    // The jet (a column of sea water) and the wave's ring.
    this.jetMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 1.7), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.jetMesh.visible = false;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.8, 1.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.group, this.jetMesh, this.ring);
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + 1.8, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(1.0, 1.0).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.03);
    targets.add(this);
    this.sync(0);
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 4;
  }
  get awake() {
    return this.state !== 'dormant';
  }
  /** what it's doing (tests read it) */
  get doing() {
    return this.state;
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    if (this.state === 'dormant') this.setState('wake');
    // Hits on the core (from in front) bite deeper; the plates turn the rest a little.
    const front = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).dot(h.dir) < -0.3;
    const dmg = h.damage * (front ? 1.15 : 0.85) * (this.phase >= 2 ? 1.2 : 1);
    this.hp -= dmg;
    this.flash = 1;
    this.fx.sparks(h.at, h.dir);
    events.emit('enemyHit', { at: h.at.clone(), amount: Math.round(dmg), crit: h.crit, enemyId: this.id });
    if (this.hp <= 0) return this.die();
    this.poise += h.poise;
    if (this.poise > 260 || this.stunned) {
      this.poise = 0;
      this.stunned = false;
      this.setState('stagger');
    }
  }

  private die() {
    this.alive = false;
    this.lockable = false;
    this.setState('dying');
    targets.delete(this);
    this.jetMesh.visible = false;
    this.ring.visible = false;
    this.waveR = -1;
    this.fx.add.spawn({ pos: this.center, spread: 5, count: 60, life: [0.6, 1.4], size: [0.12, 0.02], color: 0xb8fff8, color2: 0x2a8a88, upBias: 0.8, drag: 1.2 });
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
  }

  private setState(s: State) {
    this.state = s;
    this.st = 0;
    this.hitDone = false;
  }

  reset(at: THREE.Vector3, yaw: number) {
    if (!this.alive) return;
    this.hp = this.maxHp;
    this.phase = 0;
    this.speedMul = 1;
    this.position.copy(at);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    const c = { x: at.x, y: at.y + 1.8, z: at.z };
    this.rb.setTranslation(c, true);
    this.rb.setNextKinematicTranslation(c);
    this.col.setTranslation(c);
    this.jetMesh.visible = false;
    this.ring.visible = false;
    this.waveR = -1;
    this.setState('dormant');
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.group, this.jetMesh, this.ring);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    for (const m of this.mats) m.dispose();
  }

  private choose(dist: number) {
    const opts: [State, number][] = [];
    if (dist < 4.2) opts.push(['slam', 3], ['sweep', 3]);
    else opts.push(['slam', dist < 7 ? 1 : 0]);
    if (this.phase >= 1) opts.push(['wave', dist < 9 ? 2 : 1]);
    if (this.phase >= 2) opts.push(['jet', dist > 5 ? 3 : 1]);
    const w = opts.map(([n, v]) => [n, n === this.lastMove ? v * 0.3 : v] as [State, number]).filter(([, v]) => v > 0);
    if (!w.length) return null;
    let r = Math.random() * w.reduce((a, [, v]) => a + v, 0);
    for (const [n, v] of w) if ((r -= v) <= 0) return n;
    return w[0][0];
  }

  update(dt: number, player: Player) {
    this.t += dt;
    this.st += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.state === 'dying') {
      this.deathT += dt;
      // It kneels, and the plates sag; the core gutters out.
      this.body.rotation.x = Math.min(0.5, this.deathT * 0.4);
      this.body.position.y = -Math.min(1.2, this.deathT * 0.6);
      this.coreMat.emissiveIntensity = Math.max(0, 1.2 - this.deathT);
      this.sync(dt);
      return;
    }
    const to = player.pos.clone().sub(this.position).setY(0);
    const dist = to.length();
    const want = Math.atan2(to.x, to.z);
    const sp = this.speedMul;
    let move = 0;
    let turn = 0;
    switch (this.state) {
      case 'dormant':
        if (!player.dead && dist < 15) this.setState('wake');
        break;
      case 'wake':
        // The core lights; the head turns; it stands.
        if (this.st > 2.0) this.setState('chase');
        break;
      case 'chase':
        turn = 3;
        if (player.dead) break;
        if (this.cooldown <= 0) {
          const n = this.choose(dist);
          if (n && (n !== 'slam' || dist < 7) && (n !== 'sweep' || dist < 4.5)) {
            this.lastMove = n;
            this.setState(n);
            break;
          }
        }
        move = dist > 3.2 ? 1.9 * sp : 0;
        break;
      case 'slam': {
        // Tell: both fists rise and the core flares (0.9 s), then down.
        turn = this.st < 0.6 ? 2.5 : 0;
        const T = 0.9 / sp;
        if (this.st > T && !this.hitDone) {
          this.hitDone = true;
          const at = this.position.clone().add(V(Math.sin(this.yaw) * 1.8, 0, Math.cos(this.yaw) * 1.8));
          this.fx.dust(at, 5);
          this.fx.add.spawn({ pos: at.clone().setY(at.y + 0.3), spread: 8, count: 40, life: [0.3, 0.8], size: [0.14, 0.03], color: 0xd8fff8, color2: 0x4aa8a0, gravity: 8, upBias: 0.6 });
          events.emit('bossSlam', { at });
          const d = player.pos.distanceTo(at);
          if (d < 4.5 && player.pos.y - at.y < 1.2) player.receiveAttack({ damage: Math.round(46 * (1 - d / 9)), from: at.clone(), parryable: false, poise: 160 });
        }
        if (this.st > T + 1.0) this.endMove();
        break;
      }
      case 'sweep': {
        turn = this.st < 0.5 ? 3 : 0;
        const T = 0.7 / sp;
        if (this.st > T && this.st < T + 0.35 && !this.hitDone) {
          const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          if (dist < 4.3 && to.clone().normalize().dot(f) > -0.2) {
            this.hitDone = true;
            player.receiveAttack({ damage: 34, from: this.position.clone(), parryable: true, poise: 90, onParried: () => (this.stunned = true) });
          }
        }
        if (this.st > T + 0.9) this.endMove();
        break;
      }
      case 'wave': {
        // Tell: it crouches and the water boils round its feet; then a ring rolls outward.
        const T = 1.2;
        if (this.st < T && Math.random() < dt * 30) this.fx.alpha.spawn({ pos: this.position.clone().add(V((Math.random() - 0.5) * 4, 0.2, (Math.random() - 0.5) * 4)), spread: 0.3, count: 1, life: [0.4, 0.8], size: [0.2, 0.4], color: 0xd8fff8, alpha: 0.6, upBias: 1.2 });
        if (this.st > T) {
          const prev = this.waveR;
          this.waveR = (this.st - T) * 9;
          this.ring.visible = true;
          this.ring.position.copy(this.position).setY(this.position.y + 0.5);
          this.ring.scale.setScalar(Math.max(0.1, this.waveR));
          const d = Math.hypot(player.pos.x - this.position.x, player.pos.z - this.position.z);
          // Caught by the ring unless you're on high ground, in the air, or rolling through it.
          if (!this.hitDone && prev < d && this.waveR >= d && !this.onHigh(player.pos) && player.grounded) {
            const res = player.receiveAttack({ damage: 32, from: this.position.clone(), parryable: false, poise: 100 });
            if (res !== 'dodged') this.hitDone = true;
          }
          if (this.waveR > 16) {
            this.ring.visible = false;
            this.waveR = -1;
            this.endMove();
          }
        }
        break;
      }
      case 'jet': {
        // Tell: the core charges (1 s), then a column of sea water sweeps after you.
        const T = 1.0;
        turn = this.st < T ? 2 : 0.45;
        const from = this.core.getWorldPosition(V(0, 0, 0));
        if (this.st < T) this.coreMat.emissiveIntensity = 1.2 + this.st * 3;
        else {
          if (this.st < T + 0.05) this.jetDir.copy(to).normalize();
          this.jetDir.lerp(to.clone().normalize(), Math.min(1, dt * 0.9)).normalize();
          const len = 14;
          const end = from.clone().addScaledVector(this.jetDir, len).setY(player.pos.y + 0.9);
          this.jetMesh.visible = true;
          this.jetMesh.position.copy(from).lerp(end, 0.5);
          this.jetMesh.scale.set(1, from.distanceTo(end), 1);
          this.jetMesh.quaternion.setFromUnitVectors(V(0, 1, 0), end.clone().sub(from).normalize());
          const a = player.pos.clone().setY(player.pos.y + 0.4), b = player.pos.clone().setY(player.pos.y + 1.6);
          if (this.hitCool <= 0 && segmentPointDistance(a, b, from.clone().lerp(end, 0.5)) < 7 && this.segDist(from, end, player) < 0.7) {
            this.hitCool = 0.5;
            player.receiveAttack({ damage: 14, from: from.clone(), parryable: false, poise: 40 });
          }
          if (Math.random() < dt * 30) this.fx.add.spawn({ pos: end.clone(), spread: 2, count: 2, life: [0.3, 0.6], size: [0.1, 0.02], color: 0xd8fff8, color2: 0x4aa8a0, gravity: 6 });
        }
        if (this.st > T + 2.2) {
          this.jetMesh.visible = false;
          this.endMove();
        }
        break;
      }
      case 'recover':
        turn = 1.5;
        if (this.st > 0.9 / sp) this.setState('chase');
        break;
      case 'stagger':
        if (this.st > 1.8) {
          this.stunned = false;
          this.setState('chase');
        }
        break;
    }
    this.hitCool = Math.max(0, this.hitCool - dt);
    if (turn) this.yaw = dampAngle(this.yaw, want, turn, dt);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(move);
    this.vel.x = damp(this.vel.x, fwd.x, 4, dt);
    this.vel.z = damp(this.vel.z, fwd.z, 4, dt);
    const desired = { x: this.vel.x * dt, y: -2 * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const mv = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    this.position.set(next.x, next.y - 1.8 - 0.03, next.z);
    this.sync(dt);
  }

  private hitCool = 0;
  private segDist(a: THREE.Vector3, b: THREE.Vector3, player: Player) {
    const p = player.pos.clone().setY(player.pos.y + 0.9);
    return segmentPointDistance(a, b, p);
  }

  private endMove() {
    this.coreMat.emissiveIntensity = 1.2;
    this.cooldown = (this.phase >= 2 ? 0.6 : 1.1) / this.speedMul;
    this.setState('recover');
  }

  /** Pose the body: the tells live here. */
  private sync(dt: number) {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y + 2.2, this.position.z);
    const s = this.state, t = this.st;
    let l = 0, r = 0, crouch = 0;
    if (s === 'dormant') crouch = 0.6;
    else if (s === 'wake') crouch = 0.6 * (1 - smoothstep(0, 2, t));
    else if (s === 'slam') {
      const k = smoothstep(0, 0.9 / this.speedMul, t);
      l = r = t < 0.9 / this.speedMul ? -2.6 * k : -2.6 + smoothstep(0.9 / this.speedMul, 1.05 / this.speedMul, t) * 2.9;
      this.coreMat.emissiveIntensity = 1.2 + (t < 0.9 ? k * 2.5 : 0);
    } else if (s === 'sweep') {
      r = t < 0.7 ? smoothstep(0, 0.7, t) * 1.2 : 1.2 - smoothstep(0.7, 1.0, t) * 2.6;
    } else if (s === 'wave') crouch = t < 1.2 ? smoothstep(0, 1.2, t) * 0.5 : 0.5 - smoothstep(1.2, 1.6, t) * 0.5;
    else if (s === 'jet') l = r = -0.6;
    else if (s === 'stagger') crouch = 0.3;
    this.armL.rotation.x = damp(this.armL.rotation.x, l, 12, dt || 1);
    this.armR.rotation.x = damp(this.armR.rotation.x, r, 12, dt || 1);
    if (s !== 'dying') {
      this.body.position.y = -crouch;
      this.body.rotation.x = crouch * 0.25;
    }
    this.core.rotation.y += dt * 1.5;
    for (const m of this.mats) if (m !== this.coreMat) m.emissive.setRGB(this.flash * 0.4, this.flash * 0.4, this.flash * 0.4);
  }
}
