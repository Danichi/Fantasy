import { combat, type AttackKind } from '../../combat/core';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { physics, groups, G_ENEMY } from '../../physics/physics';
import { clamp, dampAngle, mulberry32, smoothstep } from '../../core/math';
import { events } from '../../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { heightAt } from '../../world/terrainHeight';
import { wildsSfx } from './wildsSfx';
import type { Telegraphs, Telegraph } from './telegraph';
import type { Missiles } from './projectiles';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// Old Gnarlbark, the Rootwarden: the oldest tree in the Elder Glade, which is
// not a tree. Nothing marks it out but its size: a dead-looking oak in the
// middle of a ring of standing stones. Step into the ring and its eyes open.
// It has no rig, so it is built here and fights with its whole body (like the
// Warden of the Sands): an overhead branch slam, a sweep of both arms, roots
// that erupt along marked lines, and, as it weakens, thorn volleys, a ring of
// roots all round it, and briarlings it calls up out of the moss. Fire hurts
// it more. Hit it hard enough and it sinks to one knee.

type State = 'dormant' | 'waking' | 'idle' | 'walk' | 'slam' | 'sweep' | 'roots' | 'thorns' | 'ring' | 'summon' | 'stagger' | 'dying' | 'fallen';

const BARK = 0x4a3a2c, BARK_DARK = 0x2e241a, MOSS = 0x4f6a2a, LEAF = 0x2f4a22, EYE = 0x9aff5a;

interface Spike {
  mesh: THREE.Mesh;
  t: number;
  base: THREE.Vector3;
  h: number;
}

/** Bark-like geometry: a tapered, faceted trunk segment with a little noise. */
function barkSegment(r0: number, r1: number, h: number, seed: number) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 9, 4, false);
  const rnd = mulberry32(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = 1 + (rnd() - 0.5) * 0.18;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Rootwarden implements Target {
  id = newTargetId();
  kind = 'gnarlbark';
  name = 'Old Gnarlbark, the Rootwarden';
  alive = true;
  lockable = false;
  stunned = false;
  maxHp = 1500;
  hp = 1500;
  radius = 1.3;
  halfHeight = 1.8;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  phase = 0;
  readonly phaseMarks = [0.6, 0.3];
  onWake?: () => void;
  onPhase?: (phase: number) => void;
  onSummon?: () => void;
  onDeath?: () => void;

  private root = new THREE.Group();
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private eyes: THREE.MeshStandardMaterial;
  private barkMat: THREE.MeshStandardMaterial;
  private state: State = 'dormant';
  private st = 0;
  yaw: number;
  private cooldown = 1.5;
  private hitDone = false;
  private poise = 0;
  private flash = 0;
  private mark: Telegraph | null = null;
  private lines: { from: THREE.Vector3; dir: THREE.Vector3; len: number }[] = [];
  private spikes: Spike[] = [];
  private spikeGeo = new THREE.ConeGeometry(0.35, 1, 6);
  private spikeMat: THREE.MeshStandardMaterial;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private time = 0;
  private enraged = false;
  private pendingSummon = false;
  private home: THREE.Vector3;

  constructor(at: THREE.Vector3, yaw: number, private scene: THREE.Scene, private fx: FX, private tele: Telegraphs, private missiles: Missiles, bark?: THREE.Material) {
    this.home = at.clone().setY(heightAt(at.x, at.z));
    this.position.copy(this.home);
    this.yaw = yaw;
    this.barkMat = (bark as THREE.MeshStandardMaterial | undefined)?.clone() ?? new THREE.MeshStandardMaterial({ roughness: 1 });
    this.barkMat.color = new THREE.Color(BARK);
    this.barkMat.roughness = 1;
    this.barkMat.emissive = new THREE.Color(0, 0, 0);
    this.eyes = new THREE.MeshStandardMaterial({ color: 0x0a0a06, emissive: new THREE.Color(EYE), emissiveIntensity: 0 });
    this.spikeMat = new THREE.MeshStandardMaterial({ color: BARK_DARK, roughness: 1, emissive: new THREE.Color(0x203a10), emissiveIntensity: 0.4 });
    this.build();
    this.root.add(this.body);
    scene.add(this.root);
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, this.home.y + 2.2, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.capsule(1.6, 1.15).setCollisionGroups(groups(G_ENEMY, 0xffff)), this.rb);
    this.pose(0, 0, 0, 0, 0);
  }

  // ---- the body ----------------------------------------------------------------------------

  private build() {
    const moss = new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: LEAF, roughness: 0.9, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 });
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    // Roots splayed round the foot like toes.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const r = new THREE.ConeGeometry(0.42, 2.6, 6);
      r.rotateZ(Math.PI / 2 - 0.35);
      r.rotateY(-a);
      mesh(r, this.barkMat, this.body, Math.cos(a) * 1.2, 0.25, Math.sin(a) * 1.2);
    }
    // The trunk: three segments, bending a little forward, a hollow of a mouth, two eyes.
    const trunk = mergeGeometries([
      barkSegment(1.2, 1.0, 2.2, 1).translate(0, 1.1, 0),
      barkSegment(1.0, 0.85, 2.0, 2).translate(0, 3.1, 0.08),
      barkSegment(0.85, 0.55, 1.6, 3).translate(0, 4.8, 0.18),
    ])!;
    mesh(trunk, this.barkMat, this.body);
    mesh(new THREE.BoxGeometry(0.9, 0.22, 0.2), dark, this.body, 0, 3.15, 0.92, 0.1);
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.15, 10, 8), this.eyes, this.body, s * 0.36, 3.85, 0.86);
      // A heavy brow of bark over each eye.
      mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), this.barkMat, this.body, s * 0.36, 4.05, 0.88, 0.25, 0, s * 0.25);
    }
    // Moss down its back and shoulders.
    for (let k = 0; k < 7; k++) {
      const g = new THREE.SphereGeometry(0.5 + (k % 3) * 0.15, 8, 6);
      g.scale(1, 0.4, 1);
      mesh(g, moss, this.body, Math.sin(k * 1.7) * 0.8, 1.6 + k * 0.5, -0.6 + Math.cos(k * 2.3) * 0.3);
    }
    // The crown: clumps of dark leaves on the broken top.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mesh(new THREE.IcosahedronGeometry(0.9 + (k % 2) * 0.35, 0), leaf, this.body, Math.cos(a) * 0.9, 5.7 + (k % 3) * 0.3, Math.sin(a) * 0.9);
    }
    // Arms: pivots at the shoulders, a crooked bough and a hand of twigs.
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
      arm.position.set(s * 0.95, 4.3, 0.1);
      this.body.add(arm);
      const upper = barkSegment(0.36, 0.28, 2.2, 10 + s).translate(0, -1.1, 0);
      mesh(upper, this.barkMat, arm, 0, 0, 0, 0, 0, s * 0.25);
      const fore = barkSegment(0.28, 0.2, 2.0, 20 + s).translate(0, -1.0, 0);
      const elbow = new THREE.Group();
      elbow.position.set(s * 0.5, -2.05, 0);
      elbow.rotation.x = -0.35;
      arm.add(elbow);
      mesh(fore, this.barkMat, elbow);
      for (let f = 0; f < 4; f++) {
        const tw = new THREE.ConeGeometry(0.08, 0.9, 5);
        tw.translate(0, -0.45, 0);
        mesh(tw, this.barkMat, elbow, (f - 1.5) * 0.12, -1.95, 0.05, 0.3 * (f - 1.5), 0, s * 0.2);
      }
      mesh(new THREE.SphereGeometry(0.35, 7, 5).scale(1, 0.5, 1), moss, arm, 0, 0.1, 0);
    }
  }

  /** Arms and lean: (l, r) arm swing forward, spread sideways, body lean, twist. */
  private pose(l: number, r: number, spread: number, lean: number, twist: number) {
    this.armL.rotation.set(-l, 0, -0.18 - spread);
    this.armR.rotation.set(-r, 0, 0.18 + spread);
    this.body.rotation.set(lean, twist, 0);
  }

  // ---- damage ------------------------------------------------------------------------------

  get awake() {
    return this.state !== 'dormant' && this.state !== 'fallen';
  }
  get dead() {
    return this.state === 'fallen';
  }

  readonly ownPoise = true;
  readonly boss = true;
  /** Posture broken (combat/core.ts): the giant kneels. */
  onBreak() {
    if (this.state === 'stagger' || this.state === 'dying' || this.state === 'fallen' || this.state === 'dormant') return;
    this.poise = 0;
    this.tele.cancel(this.mark);
    this.lines = [];
    this.set('stagger');
    this.stunned = true;
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying' || this.state === 'fallen') return;
    if (this.state === 'dormant') {
      this.wake();
      return;
    }
    // Old wood burns; and a kneeling giant is easy to hurt.
    const mult = (h.source === 'spell' ? 1.3 : 1) * (this.state === 'stagger' ? 1.5 : 1);
    this.hp -= h.damage * mult;
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 2.5, count: 10, life: [0.4, 0.9], size: [0.12, 0.03], color: 0x8a6a3a, color2: 0x3a2a18, gravity: 8, upBias: 0.4 });
    if (this.hp <= 0) return this.die();
    this.checkPhase();
    this.poise += h.poise + (h.source === 'spell' ? 25 : 0);
    if (this.poise > 300 && this.state !== 'stagger' && this.state !== 'waking') {
      this.poise = 0;
      this.tele.cancel(this.mark);
      this.lines = [];
      this.set('stagger');
      this.stunned = true;
      wildsSfx.creak(0, 0.6);
    }
  }

  private checkPhase() {
    const f = this.hp / this.maxHp;
    while (this.phase < this.phaseMarks.length && f < this.phaseMarks[this.phase]) {
      this.phase++;
      this.pendingSummon = true;
      if (this.phase === 2) this.enraged = true;
      this.onPhase?.(this.phase);
    }
  }

  private die() {
    this.alive = false;
    this.lockable = false;
    this.stunned = false;
    this.tele.cancel(this.mark);
    this.lines = [];
    this.set('dying');
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    wildsSfx.creak(0, 0.9);
    this.onDeath?.();
  }

  wake() {
    if (this.state !== 'dormant') return;
    this.set('waking');
    wildsSfx.creak(0, 0.9);
    this.onWake?.();
  }

  private set(s: State) {
    // Its tell (combat/core.ts): the colour says how to answer it; a blow now is a counter-hit.
    const tell = ({ slam: ['unblockable', 0.9, 1.2], sweep: ['heavy', 0.7, 1.0], roots: ['unblockable', 0.6, 0] } as Partial<Record<State, [AttackKind, number, number]>>)[s];
    if (tell && this.alive) combat.windup(this, tell[1], tell[0], tell[2]);
    this.state = s;
    this.st = 0;
    this.hitDone = false;
    if (s !== 'stagger') this.stunned = false;
  }

  private hurt(player: Player, at: THREE.Vector3, radius: number, damage: number, poise: number, knock = 0) {
    if (player.dead || this.hitDone) return;
    if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < radius && Math.abs(player.pos.y - at.y) < 3) {
      this.hitDone = true;
      const res = player.receiveAttack({ damage: Math.round(damage * (this.enraged ? 1.15 : 1)), from: this.position.clone(), at: player.center.clone(), parryable: false, poise });
      if (res === 'hit' && knock) player.vel.addScaledVector(player.pos.clone().sub(this.position).setY(0).normalize(), knock);
    }
  }

  private fwd() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Roots erupt along a line: a row of spikes bursting from the ground. */
  private erupt(from: THREE.Vector3, dir: THREE.Vector3, len: number, player: Player) {
    let hit = false;
    for (let d = 1.5; d < len; d += 1.1) {
      const p = from.clone().addScaledVector(dir, d);
      p.y = heightAt(p.x, p.z);
      this.spike(p, 1.6 + Math.random() * 1.2, d * 0.025);
      if (!hit && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.25 && !player.dead) {
        hit = true;
        player.receiveAttack({ damage: Math.round(30 * (this.enraged ? 1.15 : 1)), from: p.clone().addScaledVector(dir, -2), parryable: false, poise: 100 });
        player.vel.y += 5;
      }
    }
    events.emit('bossSlam', { at: from.clone().addScaledVector(dir, len * 0.5) });
  }

  private spike(p: THREE.Vector3, h: number, delay: number) {
    const m = new THREE.Mesh(this.spikeGeo, this.spikeMat);
    m.position.copy(p);
    m.scale.set(1, 0.01, 1);
    m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 3, (Math.random() - 0.5) * 0.4);
    m.castShadow = true;
    this.scene.add(m);
    this.spikes.push({ mesh: m, t: -delay, base: p.clone(), h });
    this.fx.add.spawn({ pos: p.clone().setY(p.y + 0.2), spread: 2, count: 4, life: [0.4, 0.8], size: [0.2, 0.05], color: 0x5a4632, color2: 0x2a2018, gravity: 8, upBias: 1 });
  }

  update(dt: number, player: Player) {
    this.time += dt;
    this.st += dt;
    this.cooldown -= dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.updateSpikes(dt);
    const g = heightAt(this.position.x, this.position.z);
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const dist = to.length();
    const want = Math.atan2(to.x, to.z);
    let l = 0, r = 0, spread = 0, lean = 0, twist = 0, sink = 0;
    let eye = this.state === 'dormant' ? 0 : this.enraged ? 4 : 2.4;
    const speedMul = this.enraged ? 1.25 : 1;
    switch (this.state) {
      case 'dormant':
        // A dead old oak: arms hanging, leaning a little.
        l = r = -0.1;
        lean = 0.12;
        if (!player.dead && dist < 13) this.wake();
        break;
      case 'waking': {
        // Roots tear out of the earth, it straightens, the eyes kindle.
        const t = Math.min(1, this.st / 3.2);
        lean = 0.12 * (1 - t) + Math.sin(this.st * 9) * 0.03 * (1 - t);
        l = r = -0.1 + t * 0.4;
        spread = Math.sin(t * Math.PI) * 0.6;
        eye = t * 2.4;
        if (Math.random() < dt * 12) this.fx.add.spawn({ pos: this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0.2, (Math.random() - 0.5) * 4)), spread: 2.5, count: 5, life: [0.5, 1], size: [0.2, 0.05], color: 0x4a3a28, color2: 0x1a140c, gravity: 8, upBias: 1.2 });
        if (Math.random() < dt * 3) events.emit('bossSlam', { at: this.position.clone() });
        if (t >= 1) {
          this.lockable = true;
          targets.add(this);
          this.cooldown = 0.8;
          this.set('idle');
        }
        break;
      }
      case 'idle':
      case 'walk': {
        if (player.dead) {
          this.state = 'idle';
          break;
        }
        this.yaw = dampAngle(this.yaw, want, 1.4 * speedMul, dt);
        if (this.cooldown <= 0) this.choose(dist, player);
        if (this.state === 'idle' || this.state === 'walk') {
          const moving = dist > 4.6;
          this.state = moving ? 'walk' : 'idle';
          if (moving) {
            const sp = 1.7 * speedMul;
            this.position.addScaledVector(this.fwd(), sp * dt);
            lean = 0.06;
            twist = Math.sin(this.time * 2.2) * 0.08;
            l = Math.sin(this.time * 2.2) * 0.25;
            r = -l;
            if (Math.sin(this.time * 2.2) * Math.sin((this.time - dt) * 2.2) < 0) {
              events.emit('bossSlam', { at: this.position.clone() });
              this.fx.dust(this.position.clone(), 0.6);
            }
          }
        }
        break;
      }
      case 'slam': {
        // The right bough goes up and over, and comes down where the circle says.
        const wind = this.enraged ? 0.9 : 1.15;
        const at = this.position.clone().addScaledVector(this.fwd(), 3.4).setY(g);
        if (this.st < wind) {
          this.yaw = dampAngle(this.yaw, want, 2.2, dt);
          r = 2.6 * (this.st / wind);
          lean = -0.15 * (this.st / wind);
        } else {
          const t = Math.min(1, (this.st - wind) / 0.22);
          r = 2.6 - t * 3.6;
          lean = -0.15 + t * 0.45;
          if (t >= 1 && !this.hitDone) {
            this.hurt(player, at, 2.9, 46, 120, 6);
            this.hitDone = true;
            events.emit('bossSlam', { at });
            this.fx.dust(at, 2);
            this.fx.add.spawn({ pos: at.clone().setY(g + 0.3), spread: 4, count: 24, life: [0.4, 0.9], size: [0.25, 0.06], color: 0x5a4632, color2: 0x2a2018, gravity: 8, upBias: 1 });
          }
        }
        if (this.st > wind + 1.0) this.recover(1.2);
        break;
      }
      case 'sweep': {
        // Both arms out, a full turn: the circle all round it.
        const wind = this.enraged ? 0.85 : 1.05;
        spread = 1.3;
        l = r = 0.9;
        if (this.st < wind) twist = -0.6 * (this.st / wind);
        else {
          const t = Math.min(1, (this.st - wind) / 0.8);
          twist = -0.6 + t * (Math.PI * 2 + 0.6);
          if (t > 0.2 && t < 0.8) this.hurt(player, this.position.clone().setY(g), 5.4, 32, 90, 9);
          if (Math.random() < dt * 30) this.fx.add.spawn({ pos: this.position.clone().setY(g + 0.4), spread: 4, count: 2, life: [0.3, 0.6], size: [0.2, 0.04], color: 0x6a8a3a, color2: 0x2a3a18, upBias: 0.5 });
        }
        if (this.st > wind + 1.1) this.recover(1);
        break;
      }
      case 'roots':
      case 'ring': {
        // Arms plunge into the ground; the roots go where the lines say.
        const wind = this.state === 'ring' ? 1.2 : 1.05;
        l = r = -0.9 * Math.min(1, this.st / 0.4);
        lean = 0.35 * Math.min(1, this.st / 0.4);
        if (Math.random() < dt * 16) for (const ln of this.lines) {
          const p = ln.from.clone().addScaledVector(ln.dir, Math.random() * ln.len);
          this.fx.add.spawn({ pos: p.setY(heightAt(p.x, p.z) + 0.1), spread: 0.8, count: 1, life: [0.3, 0.6], size: [0.18, 0.04], color: EYE, color2: 0x204010, upBias: 0.6 });
        }
        if (this.st >= wind && !this.hitDone) {
          this.hitDone = true;
          for (const ln of this.lines) this.erupt(ln.from, ln.dir, ln.len, player);
          this.lines = [];
          wildsSfx.creak(dist, 0.5);
        }
        if (this.st > wind + 0.9) this.recover(1.1);
        break;
      }
      case 'thorns': {
        r = 1.4 * Math.min(1, this.st / 0.7);
        lean = -0.12;
        this.yaw = dampAngle(this.yaw, want, 2.5, dt);
        if (this.st > 0.8 && !this.hitDone) {
          this.hitDone = true;
          const from = this.position.clone().setY(g + 5.2);
          const aim = player.center.clone().sub(from).normalize();
          const n = this.enraged ? 7 : 5;
          for (let k = 0; k < n; k++) this.missiles.shoot('thorn', from, aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (k - (n - 1) / 2) * 0.13), 22, 22);
          this.fx.add.spawn({ pos: from, spread: 3, count: 20, life: [0.3, 0.7], size: [0.18, 0.03], color: LEAF, color2: 0x101808, gravity: 5 });
        }
        if (this.st > 1.6) this.recover(0.9);
        break;
      }
      case 'summon': {
        // It shakes its crown and the moss gives up briarlings.
        spread = 0.8 + Math.sin(this.st * 14) * 0.15;
        l = r = 1.2;
        twist = Math.sin(this.st * 10) * 0.12;
        eye = 5;
        if (Math.random() < dt * 30) this.fx.add.spawn({ pos: this.position.clone().setY(g + 5.5), spread: 3, count: 2, life: [0.8, 1.6], size: [0.2, 0.04], color: LEAF, color2: MOSS, gravity: 2 });
        if (this.st > 1.8 && !this.hitDone) {
          this.hitDone = true;
          this.onSummon?.();
        }
        if (this.st > 2.2) this.recover(0.6);
        break;
      }
      case 'stagger':
        // Down on its roots: the moment to cut it.
        sink = Math.min(1, this.st / 0.4) * 0.9;
        lean = 0.4;
        l = r = -0.6;
        eye = 0.8;
        if (Math.random() < dt * 8) this.fx.add.spawn({ pos: this.center.clone(), spread: 1.5, count: 2, life: [0.6, 1.2], size: [0.15, 0.04], color: 0x6a5a3a, color2: 0x2a2018, gravity: 6 });
        if (this.st > 3.4) {
          this.stunned = false;
          this.set('idle');
          this.cooldown = 0.4;
        }
        break;
      case 'dying': {
        // Topples backward and settles, the light going out of its eyes.
        const t = smoothstep(0, 3.2, this.st);
        lean = -t * 1.35;
        sink = t * 1.2;
        l = r = -0.4 - t * 0.6;
        eye = Math.max(0, 2.4 - this.st);
        if (this.st > 1.8 && this.st - dt <= 1.8) {
          events.emit('bossSlam', { at: this.position.clone().addScaledVector(this.fwd(), -4) });
          this.fx.dust(this.position.clone().addScaledVector(this.fwd(), -4), 3);
        }
        if (Math.random() < dt * 20) this.fx.add.spawn({ pos: this.position.clone().setY(g + 3 + Math.random() * 2), spread: 3, count: 2, life: [1, 2], size: [0.18, 0.04], color: LEAF, color2: 0x2a3a18, gravity: 1.5 });
        if (this.st > 4) this.state = 'fallen';
        break;
      }
      case 'fallen':
        lean = -1.35;
        sink = 1.2;
        l = r = -1;
        eye = 0;
        break;
    }
    this.position.y = heightAt(this.position.x, this.position.z);
    this.pose(l, r, spread, lean, twist);
    this.root.position.set(this.position.x, this.position.y - sink, this.position.z);
    this.root.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y - sink + 2.6, this.position.z);
    if (this.state !== 'fallen') this.rb.setNextKinematicTranslation({ x: this.position.x, y: this.position.y - sink + 2.2, z: this.position.z });
    else this.rb.setNextKinematicTranslation({ x: this.position.x, y: this.position.y - 20, z: this.position.z });
    this.eyes.emissiveIntensity = eye * (0.85 + Math.sin(this.time * 3) * 0.15);
    this.barkMat.emissive.setRGB(0.5 * this.flash, 0.2 * this.flash, 0.05 * this.flash);
    if (this.enraged && this.alive) this.barkMat.emissive.r += 0.06 + Math.sin(this.time * 4) * 0.03;
  }

  /** Pick the next attack by distance and phase. */
  private choose(dist: number, player: Player) {
    const p = this.position;
    if (this.pendingSummon) {
      this.pendingSummon = false;
      this.set('summon');
      wildsSfx.creak(dist, 0.8);
      return;
    }
    const opts: [State, number][] = [];
    if (dist < 5) opts.push(['slam', 3], ['sweep', dist < 4 ? 3 : 1]);
    if (dist > 3) opts.push(['roots', 3]);
    if (this.phase >= 1 && dist > 7) opts.push(['thorns', 2.5]);
    if (this.phase >= 2 && dist < 9) opts.push(['ring', 2]);
    if (!opts.length) return;
    let roll = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
    let pick = opts[0][0];
    for (const [s, w] of opts) if ((roll -= w) <= 0) { pick = s; break; }
    this.set(pick);
    const red = 0xff6a2a;
    if (pick === 'slam') {
      const at = p.clone().addScaledVector(this.fwd(), 3.4);
      this.mark = this.tele.circle(at.x, at.z, 2.9, this.enraged ? 1.1 : 1.37, red);
    } else if (pick === 'sweep') {
      this.mark = this.tele.circle(p.x, p.z, 5.4, this.enraged ? 1.0 : 1.2, red);
      wildsSfx.creak(dist, 0.4);
    } else if (pick === 'roots') {
      // One line straight at you; more of them, fanned, once it's hurt.
      const n = this.phase === 0 ? 1 : 3;
      const base = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * 0.42;
        const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const len = clamp(dist + 6, 10, 22);
        this.lines.push({ from: p.clone(), dir, len });
        this.tele.line(p.x, p.z, a, len, 2.4, 1.05, 0x9aff5a, 0.3);
      }
    } else if (pick === 'ring') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        this.lines.push({ from: p.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), len: 9 });
      }
      this.mark = this.tele.ring(p.x, p.z, 1.5, 9, 1.2, 0x9aff5a, 0.3);
    }
  }

  private recover(t: number) {
    this.cooldown = t * (this.enraged ? 0.7 : 1);
    this.set('idle');
  }

  private updateSpikes(dt: number) {
    for (const s of this.spikes) {
      s.t += dt;
      if (s.t < 0) continue;
      // Up fast, hold, sink slowly.
      const k = s.t < 0.15 ? s.t / 0.15 : s.t < 1.1 ? 1 : Math.max(0, 1 - (s.t - 1.1) / 0.8);
      s.mesh.scale.set(1, Math.max(0.01, k * s.h), 1);
      s.mesh.position.set(s.base.x, s.base.y + (k * s.h) / 2 - 0.1, s.base.z);
    }
    const done = this.spikes.filter((s) => s.t > 1.95);
    for (const s of done) this.scene.remove(s.mesh);
    if (done.length) this.spikes = this.spikes.filter((s) => s.t <= 1.95);
  }

  /** The player fled or died: it walks back to its place and goes still again, healed. */
  reset() {
    if (!this.alive) return;
    this.hp = this.maxHp;
    this.phase = 0;
    this.poise = 0;
    this.enraged = false;
    this.pendingSummon = false;
    this.lines = [];
    this.tele.cancel(this.mark);
    this.lockable = false;
    targets.delete(this);
    this.position.copy(this.home);
    this.set('dormant');
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.root);
    for (const s of this.spikes) this.scene.remove(s.mesh);
    this.spikes = [];
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
  }
}
