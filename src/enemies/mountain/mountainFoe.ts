import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY } from '../../physics/physics';
import { dampAngle } from '../../core/math';
import { events } from '../../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { heightAt } from '../../world/terrainHeight';
import { sfx } from '../../audio/sfx';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';

// The creatures of the White and Deep Mountains (docs/design/mountains.md §8),
// built from painted primitives and animated by hand, one class with a body
// plan and a fighting style per kind:
//
//   snowWolf     packs in the foothills and passes; a howl brings the pack
//   rockTroll    huge and slow on the bridges and passes; regenerates unless burned
//   yeti         the high snow; throws ice, and fades into a blizzard
//   wyvern       cliffs and glaciers; circles high, dives, lashes a poisoned tail
//   golem        stone and crystal in the deep places; weak at its glowing core
//   caveCrawler  quick, in swarms, out of the cavern walls
//   sentinel     the wheel-cutters' brass constructs; telegraphed patterns

export type FoeKind = 'snowWolf' | 'rockTroll' | 'yeti' | 'wyvern' | 'golem' | 'caveCrawler' | 'sentinel';

interface FoeSpec {
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  reach: number;
  radius: number;
  halfHeight: number;
  /** centre height above the feet */
  cy: number;
  sight: number;
  cooldown: number;
  poise: number;
  /** XP and gold beyond the default (the rewards for the mountains' levels) */
  xp: number;
  gold: number;
}

export const FOES: Record<FoeKind, FoeSpec> = {
  snowWolf: { name: 'Snow Wolf', hp: 140, dmg: 16, speed: 6.8, reach: 1.9, radius: 0.55, halfHeight: 0.2, cy: 0.7, sight: 28, cooldown: 1.4, poise: 60, xp: 60, gold: 4 },
  rockTroll: { name: 'Rock Troll', hp: 900, dmg: 42, speed: 2.6, reach: 3.6, radius: 1.3, halfHeight: 1.1, cy: 2.2, sight: 30, cooldown: 2.4, poise: 320, xp: 420, gold: 40 },
  yeti: { name: 'Yeti', hp: 620, dmg: 30, speed: 4.2, reach: 2.6, radius: 0.9, halfHeight: 0.8, cy: 1.6, sight: 34, cooldown: 2, poise: 220, xp: 320, gold: 25 },
  wyvern: { name: 'Wyvern', hp: 420, dmg: 26, speed: 9, reach: 2.6, radius: 1.1, halfHeight: 0.5, cy: 1.4, sight: 60, cooldown: 3, poise: 160, xp: 300, gold: 20 },
  golem: { name: 'Crystal Golem', hp: 760, dmg: 38, speed: 2.4, reach: 3, radius: 1.1, halfHeight: 1.1, cy: 2, sight: 24, cooldown: 2.4, poise: 400, xp: 380, gold: 30 },
  caveCrawler: { name: 'Cave Crawler', hp: 70, dmg: 11, speed: 7.5, reach: 1.5, radius: 0.5, halfHeight: 0.15, cy: 0.45, sight: 22, cooldown: 1.1, poise: 30, xp: 35, gold: 2 },
  sentinel: { name: 'Wheel-cutter Sentinel', hp: 820, dmg: 36, speed: 3.2, reach: 3.2, radius: 1, halfHeight: 1, cy: 1.9, sight: 26, cooldown: 2.2, poise: 360, xp: 450, gold: 35 },
};

type State = 'idle' | 'chase' | 'wind' | 'strike' | 'recover' | 'stagger' | 'throw' | 'circle' | 'dive' | 'dying' | 'gone';

const mat = (color: number, roughness = 0.85, metalness = 0, emissive = 0, ei = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: ei, flatShading: true });
const shared = new Map<string, THREE.Material>();
const M = (key: string, make: () => THREE.Material) => shared.get(key) ?? (shared.set(key, make()), shared.get(key)!);

interface Body {
  root: THREE.Group;
  /** limbs swung by the walk cycle: [object, phase, axis amplitude] */
  legs: [THREE.Object3D, number, number][];
  arms: THREE.Object3D[];
  head?: THREE.Object3D;
  core?: THREE.MeshStandardMaterial;
  wings?: THREE.Object3D[];
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1) {
  const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
}
/** A limb hanging from a pivot, so it swings from the shoulder or hip. */
function limb(len: number, thick: number, m: THREE.Material, x: number, y: number, z: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const l = box(thick, len, thick, m, 0, -len / 2, 0);
  pivot.add(l);
  return pivot;
}

function buildBody(kind: FoeKind): Body {
  const root = new THREE.Group();
  const legs: Body['legs'] = [];
  const arms: THREE.Object3D[] = [];
  const out: Body = { root, legs, arms };
  if (kind === 'snowWolf') {
    const fur = M('wolf', () => mat(0xe4e8ee)), dark = M('wolfDark', () => mat(0x8a929e));
    root.add(ball(0.42, fur, 0, 0.78, 0, 0.9, 0.75, 1.7));
    const head = new THREE.Group();
    head.position.set(0, 0.95, 0.72);
    head.add(ball(0.24, fur, 0, 0, 0, 1, 0.9, 1.1), box(0.16, 0.13, 0.32, dark, 0, -0.06, 0.24));
    for (const s of [-1, 1]) head.add(box(0.07, 0.16, 0.05, fur, s * 0.12, 0.2, -0.04));
    const eyes = M('wolfEye', () => mat(0x9fd8ff, 0.3, 0, 0x5ab4ff, 1.4));
    for (const s of [-1, 1]) head.add(ball(0.03, eyes, s * 0.09, 0.05, 0.18, 1, 1, 1, 0));
    root.add(head);
    out.head = head;
    for (const [x, z, ph] of [[-0.2, 0.42, 0], [0.2, 0.42, Math.PI], [-0.2, -0.42, Math.PI], [0.2, -0.42, 0]] as const) {
      const l = limb(0.6, 0.11, fur, x, 0.62, z);
      root.add(l);
      legs.push([l, ph, 0.6]);
    }
    const tail = box(0.1, 0.1, 0.5, fur, 0, 0.82, -0.82);
    tail.rotation.x = 0.5;
    root.add(tail);
  } else if (kind === 'rockTroll' || kind === 'yeti' || kind === 'golem' || kind === 'sentinel') {
    const skin = kind === 'rockTroll' ? M('troll', () => mat(0x6e7466, 0.95)) : kind === 'yeti' ? M('yeti', () => mat(0xf2f4f8, 1)) : kind === 'golem' ? M('golem', () => mat(0x4a4c52, 0.9)) : M('sentinel', () => mat(0x9b7130, 0.35, 0.8));
    const accent = kind === 'rockTroll' ? M('trollMoss', () => mat(0x4a5a3a, 1)) : kind === 'yeti' ? M('yetiFace', () => mat(0x5a6a7a, 0.8)) : kind === 'golem' ? M('golemStone', () => mat(0x2e3036, 0.9)) : M('sentinelDark', () => mat(0x3a3430, 0.5, 0.6));
    const s = kind === 'rockTroll' ? 1.25 : kind === 'golem' ? 1.15 : kind === 'sentinel' ? 1.05 : 1;
    const g = new THREE.Group();
    g.scale.setScalar(s);
    root.add(g);
    // Torso: hunched forward, huge shoulders.
    g.add(ball(0.75, skin, 0, 1.9, 0, 1.15, 0.95, 0.85));
    g.add(ball(0.55, skin, 0, 1.25, 0.05, 1, 0.8, 0.8));
    if (kind === 'sentinel') g.add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 18), accent).translateY(1.9).translateZ(0.5));
    const head = new THREE.Group();
    head.position.set(0, 2.55, 0.42);
    head.add(ball(0.32, kind === 'yeti' ? skin : accent, 0, 0, 0, 1, 0.95, 1));
    if (kind === 'yeti') head.add(ball(0.2, accent, 0, -0.05, 0.2, 1, 0.8, 0.6));
    const eyeM = kind === 'golem' || kind === 'sentinel' ? M('crystalEye', () => mat(0x8ad8ff, 0.2, 0.2, 0x3aa8ff, 2.2)) : M('trollEye', () => mat(0xffd060, 0.4, 0, 0xffa020, 1.2));
    for (const sx of [-1, 1]) head.add(ball(0.05, eyeM, sx * 0.12, 0.05, 0.27, 1, 1, 1, 0));
    g.add(head);
    out.head = head;
    if (kind === 'golem' || kind === 'sentinel') {
      const core = mat(kind === 'golem' ? 0x7fd0ff : 0xffc060, 0.2, 0.2, kind === 'golem' ? 0x2a90ff : 0xff9a20, 1.5);
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), core);
      c.position.set(0, 1.85, 0.62);
      c.scale.set(1, 1.4, 0.7);
      g.add(c);
      out.core = core;
      if (kind === 'golem') for (let k = 0; k < 5; k++) {
        const cr = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), M('golemCrystal', () => mat(0x7fc8ff, 0.2, 0.2, 0x2a7acc, 1.2)));
        cr.position.set(Math.cos(k * 1.3) * 0.5, 2.4 + (k % 2) * 0.15, -0.3 + Math.sin(k * 1.3) * 0.2);
        cr.rotation.set(-0.4, 0, Math.cos(k * 1.3) * 0.6);
        g.add(cr);
      }
    }
    if (kind === 'rockTroll') for (let k = 0; k < 4; k++) g.add(ball(0.22, accent, Math.cos(k * 1.7) * 0.6, 2.2 + (k % 2) * 0.2, -0.4, 1, 0.5, 1));
    for (const sx of [-1, 1]) {
      const a = limb(1.5, 0.36, skin, sx * 0.95, 2.2, 0.1);
      a.add(ball(0.3, accent, 0, -1.55, 0.05));
      g.add(a);
      arms.push(a);
      const l = limb(1.0, 0.42, skin, sx * 0.4, 1.0, 0);
      g.add(l);
      legs.push([l, sx > 0 ? 0 : Math.PI, 0.45]);
    }
  } else if (kind === 'wyvern') {
    const hide = M('wyvern', () => mat(0xc8ccd4, 0.7)), membrane = M('wyvernWing', () => new THREE.MeshStandardMaterial({ color: 0x8a94a4, roughness: 0.8, side: THREE.DoubleSide }));
    root.add(ball(0.5, hide, 0, 1.4, 0, 0.8, 0.7, 1.7));
    const neck = box(0.22, 0.22, 0.8, hide, 0, 1.6, 0.9);
    neck.rotation.x = -0.4;
    root.add(neck);
    const head = new THREE.Group();
    head.position.set(0, 1.85, 1.35);
    head.add(box(0.3, 0.22, 0.55, hide), ball(0.04, M('wyvernEye', () => mat(0xffe060, 0.3, 0, 0xffa000, 1.5)), 0.1, 0.06, 0.15, 1, 1, 1, 0));
    root.add(head);
    out.head = head;
    const tail = box(0.16, 0.16, 1.8, hide, 0, 1.35, -1.6);
    root.add(tail);
    root.add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), M('sting', () => mat(0x4a8a3a, 0.5, 0, 0x2a6a1a, 0.6))).translateY(1.35).translateZ(-2.6).rotateX(-Math.PI / 2));
    out.wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * 0.35, 1.6, 0.2);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(sx * 2.6, 0.3);
      shape.lineTo(sx * 2.2, -0.9);
      shape.lineTo(sx * 0.6, -1.2);
      shape.lineTo(0, -0.6);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), membrane);
      m.rotation.x = -Math.PI / 2;
      w.add(m);
      root.add(w);
      out.wings.push(w);
    }
    for (const sx of [-1, 1]) {
      const l = limb(0.7, 0.12, hide, sx * 0.25, 1.1, 0.1);
      root.add(l);
      legs.push([l, sx > 0 ? 0 : Math.PI, 0.3]);
    }
  } else {
    // caveCrawler: a low, six-legged thing, pale as something that never saw the sun.
    const shell = M('crawler', () => mat(0x6a6a5e, 0.6)), leg = M('crawlerLeg', () => mat(0x3a3a32, 0.7));
    root.add(ball(0.32, shell, 0, 0.42, 0, 1, 0.55, 1.4));
    root.add(ball(0.2, shell, 0, 0.4, 0.45, 1, 0.7, 0.9));
    const eyes = M('crawlerEye', () => mat(0xff6040, 0.3, 0, 0xff3010, 1.6));
    for (const s of [-1, 1]) root.add(ball(0.04, eyes, s * 0.08, 0.48, 0.6, 1, 1, 1, 0));
    for (let k = 0; k < 6; k++) {
      const s = k % 2 ? 1 : -1;
      const z = -0.25 + Math.floor(k / 2) * 0.25;
      const l = limb(0.5, 0.06, leg, s * 0.25, 0.45, z);
      l.rotation.z = s * 0.9;
      root.add(l);
      legs.push([l, k * 1.1, 0.7]);
    }
  }
  return out;
}

interface Shot { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; dmg: number }

export class MountainFoe implements Target {
  id = newTargetId();
  readonly kind: FoeKind;
  readonly spec: FoeSpec;
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius: number;
  halfHeight: number;
  position = new THREE.Vector3();
  stunned = false;
  lockable = true;
  hp: number;
  maxHp: number;
  name: string;
  /** fade into the snow (a yeti in a blizzard) */
  hidden = 0;
  /** others of the pack, woken by a howl */
  pack: MountainFoe[] | null = null;
  onDeath?: (f: MountainFoe) => void;
  private body: Body;
  private yaw = Math.random() * 6.28;
  private state: State = 'idle';
  private st = 0;
  private cd = 1;
  private walkT = Math.random() * 6;
  private hitDone = false;
  private poiseDmg = 0;
  private flash = 0;
  private alert = false;
  private howled = false;
  private lastHp: number;
  private burnedT = 0;
  private coreOpen = 0;
  private fly = 0;
  private shots: Shot[] = [];
  private rb: RAPIER.RigidBody;
  private shotGeo: THREE.BufferGeometry;
  private shotMat: THREE.Material;

  constructor(kind: FoeKind, readonly home: THREE.Vector3, private scene: THREE.Scene, private fx: FX, level = 1) {
    this.kind = kind;
    this.spec = FOES[kind];
    this.name = this.spec.name;
    this.maxHp = this.hp = Math.round(this.spec.hp * level);
    this.lastHp = this.hp;
    this.radius = this.spec.radius;
    this.halfHeight = this.spec.halfHeight;
    this.position.copy(home).setY(heightAt(home.x, home.z));
    this.body = buildBody(kind);
    scene.add(this.body.root);
    this.fly = kind === 'wyvern' ? 14 : 0;
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y + this.spec.cy, this.position.z));
    physics.world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.1, this.halfHeight), this.radius * 0.8).setCollisionGroups(groups(G_ENEMY, 0xffff)), this.rb);
    this.shotGeo = new THREE.IcosahedronGeometry(kind === 'yeti' ? 0.45 : 0.2, 0);
    this.shotMat = M('ice', () => mat(0xd8f0ff, 0.2, 0.1, 0x5ab4ff, 0.6));
    targets.add(this);
    this.sync(0);
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    let dmg = h.damage;
    // The golem's crystal core, open after a slam: struck from the front, it shatters.
    if (this.kind === 'golem' && this.coreOpen > 0) {
      const front = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (-h.dir.x * front.x - h.dir.z * front.z > 0.2) dmg *= 2.2;
    } else if (this.kind === 'golem' || this.kind === 'sentinel') dmg *= 0.75;
    if (this.state === 'stagger') dmg *= 1.4;
    if (h.source === 'spell') this.burnedT = 6;
    this.hp -= dmg;
    this.lastHp = this.hp;
    this.flash = 1;
    this.alert = true;
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 1.6, count: 8, life: [0.3, 0.7], size: [0.12, 0.03], color: this.kind === 'golem' || this.kind === 'rockTroll' ? 0x8a8a80 : this.kind === 'sentinel' ? 0xffc060 : 0xb83a2a, gravity: 6 });
    if (this.hp <= 0) return this.die();
    this.poiseDmg += h.poise;
    if (this.poiseDmg > this.spec.poise && this.state !== 'stagger' && this.fly < 2) {
      this.poiseDmg = 0;
      this.set('stagger');
      this.stunned = true;
    }
    if (this.kind === 'wyvern' && this.fly > 2 && this.hp < this.maxHp * 0.5) this.set('dive');
  }

  private die() {
    this.alive = false;
    this.lockable = false;
    this.stunned = false;
    this.set('dying');
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.onDeath?.(this);
  }

  private set(s: State) {
    this.state = s;
    this.st = 0;
    this.hitDone = false;
    if (s !== 'stagger') this.stunned = false;
  }

  private strike(player: Player, at: THREE.Vector3, r: number, dmg: number, poise: number, parryable = true) {
    if (player.dead || this.hitDone) return;
    if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < r && Math.abs(player.pos.y - at.y) < 3.2) {
      this.hitDone = true;
      const res = player.receiveAttack({ damage: dmg, from: this.position.clone(), at: player.center.clone(), parryable, poise, onParried: () => { this.set('stagger'); this.stunned = true; } });
      // The wyvern's tail is poisoned.
      if (this.kind === 'wyvern' && res === 'hit') {
        let n = 0;
        const tick = setInterval(() => { if (++n > 5 || player.dead) clearInterval(tick); else player.takeDamage(4); }, 1000);
      }
    }
  }

  /** Wake to a howl, or to the fight nearby. */
  rouse() {
    this.alert = true;
  }

  update(dt: number, player: Player, blizzard = 0) {
    this.st += dt;
    this.cd -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.coreOpen = Math.max(0, this.coreOpen - dt);
    this.burnedT = Math.max(0, this.burnedT - dt);
    // Fire (a burning blade, a spell) keeps a troll's wounds open; otherwise they close.
    if (this.hp < this.lastHp) this.burnedT = 6;
    if (this.kind === 'rockTroll' && this.alive && this.burnedT <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
    this.lastHp = this.hp;
    this.updateShots(dt, player);
    if (this.state === 'gone') return;
    const S = this.spec;
    const g = heightAt(this.position.x, this.position.z);
    const to = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const dist = to.length();
    const want = Math.atan2(to.x, to.z);
    const fromHome = Math.hypot(this.position.x - this.home.x, this.position.z - this.home.z);
    let lunge = 0, lean = 0, armSwing = 0, moving = false;
    if (this.alive && !player.dead && (dist < S.sight || this.alert) && dist < S.sight * 2.2 && fromHome < 90) this.alert = true;
    else if (this.state !== 'dying' && this.state !== 'stagger') this.alert = false;
    // A wolf that sees you howls for the pack.
    if (this.alert && this.kind === 'snowWolf' && !this.howled) {
      this.howled = true;
      for (const o of this.pack ?? []) if (o !== this && o.position.distanceTo(this.position) < 45) o.rouse();
      sfx.roar(0.4);
    }
    switch (this.state) {
      case 'idle':
      case 'chase': {
        if (!this.alert) {
          // Wander home.
          if (fromHome > 3) {
            this.yaw = dampAngle(this.yaw, Math.atan2(this.home.x - this.position.x, this.home.z - this.position.z), 3, dt);
            this.move(S.speed * 0.35, dt);
            moving = true;
          }
          if (this.kind === 'wyvern') this.set('circle');
          break;
        }
        this.yaw = dampAngle(this.yaw, want, this.kind === 'rockTroll' || this.kind === 'golem' ? 2 : 5, dt);
        if (this.kind === 'yeti' && dist > 8 && dist < 26 && this.cd <= 0) { this.set('throw'); break; }
        if (this.kind === 'wyvern' && this.cd <= 0 && dist > 6) { this.set('circle'); break; }
        if (dist < S.reach + 0.6 && this.cd <= 0) { this.set('wind'); break; }
        if (dist > S.reach * 0.8) {
          this.move(S.speed, dt);
          moving = true;
        }
        break;
      }
      case 'circle': {
        // The wyvern rides the wind above you, then folds and drops.
        this.fly = Math.min(16, this.fly + dt * 6);
        const a = this.st * 0.7 + this.id;
        const cx = (this.alert ? player.pos.x : this.home.x) + Math.cos(a) * 18, cz = (this.alert ? player.pos.z : this.home.z) + Math.sin(a) * 18;
        this.yaw = dampAngle(this.yaw, Math.atan2(cx - this.position.x, cz - this.position.z), 3, dt);
        this.move(S.speed, dt);
        moving = true;
        if (this.alert && this.st > 5 + (this.id % 3)) this.set('dive');
        break;
      }
      case 'dive': {
        this.yaw = dampAngle(this.yaw, want, 4, dt);
        this.fly = Math.max(0.6, this.fly - dt * 12);
        this.move(S.speed * 1.4, dt);
        moving = true;
        lean = 0.5;
        if (dist < 3.4) this.strike(player, this.position, 3.6, S.dmg, 80, false);
        if (this.fly <= 0.7 && (dist < 3 || this.st > 3)) {
          this.set('recover');
          this.cd = S.cooldown;
        }
        break;
      }
      case 'wind': {
        // The telegraph: rear back (the sentinel's core blazes).
        this.yaw = dampAngle(this.yaw, want, 3, dt);
        lean = -0.25 * Math.min(1, this.st / 0.6);
        armSwing = -1.2 * Math.min(1, this.st / 0.6);
        const wind = this.kind === 'snowWolf' || this.kind === 'caveCrawler' ? 0.35 : this.kind === 'sentinel' ? 0.9 : 0.65;
        if (this.st >= wind) this.set('strike');
        break;
      }
      case 'strike': {
        const t = Math.min(1, this.st / 0.25);
        lean = -0.25 + t * 0.6;
        armSwing = -1.2 + t * 2.2;
        lunge = (this.kind === 'snowWolf' || this.kind === 'caveCrawler' ? 7 : this.kind === 'sentinel' ? 5 : 1.5) * (1 - t);
        this.move(lunge, dt);
        if (t >= 0.6) {
          const at = this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(S.reach * 0.6)).setY(g);
          const heavy = this.kind === 'rockTroll' || this.kind === 'golem' || this.kind === 'sentinel';
          this.strike(player, at, S.reach * (heavy ? 0.9 : 0.7), S.dmg, heavy ? 90 : 35, !heavy);
          if (heavy && !this.hitDone) events.emit('bossSlam', { at });
          if (heavy) {
            this.hitDone = true;
            this.fx.dust(at, 1.5);
            if (this.kind === 'golem') this.coreOpen = 2.2;
          }
        }
        if (this.st > 0.5) {
          this.set('recover');
          this.cd = S.cooldown * (0.8 + Math.random() * 0.4);
        }
        break;
      }
      case 'throw': {
        this.yaw = dampAngle(this.yaw, want, 4, dt);
        armSwing = this.st < 0.7 ? -2.4 * (this.st / 0.7) : 1;
        if (this.st > 0.75 && !this.hitDone) {
          this.hitDone = true;
          const from = this.position.clone().setY(g + 3);
          const target = player.center.clone();
          const T = Math.max(0.6, from.distanceTo(target) / 20);
          const vel = target.sub(from).divideScalar(T).add(new THREE.Vector3(0, 0.5 * 14 * T, 0));
          const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
          mesh.position.copy(from);
          this.scene.add(mesh);
          this.shots.push({ mesh, vel, life: 4, dmg: S.dmg });
        }
        if (this.st > 1.3) {
          this.set('recover');
          this.cd = S.cooldown;
        }
        break;
      }
      case 'recover':
        armSwing = 0.6 * (1 - this.st);
        if (this.st > (this.kind === 'golem' ? 1.2 : 0.6)) this.set(this.kind === 'wyvern' ? 'circle' : 'chase');
        break;
      case 'stagger':
        lean = 0.35;
        if (this.st > 1.6) {
          this.stunned = false;
          this.set('chase');
        }
        break;
      case 'dying':
        lean = Math.min(1.4, this.st * 1.6);
        this.fly = Math.max(0, this.fly - dt * 10);
        if (this.st > 2.2) {
          this.state = 'gone';
          this.body.root.visible = false;
          this.dead = true;
          physics.world.removeRigidBody(this.rb);
        }
        break;
    }
    if (this.kind === 'wyvern' && this.state !== 'circle' && this.state !== 'dive' && this.state !== 'dying') this.fly = Math.max(0, this.fly - dt * 4);
    if (moving) this.walkT += dt * (this.kind === 'snowWolf' || this.kind === 'caveCrawler' ? 14 : 6);
    // A yeti in a blizzard is a shape in the snow.
    this.hidden = this.kind === 'yeti' && blizzard > 0.5 && this.state !== 'strike' && this.state !== 'throw' ? Math.min(1, this.hidden + dt) : Math.max(0, this.hidden - dt * 2);
    this.lockable = this.alive && this.hidden < 0.6;
    this.animate(moving, lean, armSwing);
    this.sync(dt);
  }

  private move(speed: number, dt: number) {
    const nx = this.position.x + Math.sin(this.yaw) * speed * dt, nz = this.position.z + Math.cos(this.yaw) * speed * dt;
    // Don't walk off a cliff or up a wall (the ground must stay within a stride).
    const h0 = heightAt(this.position.x, this.position.z), h1 = heightAt(nx, nz);
    if (this.fly < 1 && Math.abs(h1 - h0) > speed * dt * 2.2 + 0.4) return;
    this.position.x = nx;
    this.position.z = nz;
  }

  private animate(moving: boolean, lean: number, armSwing: number) {
    const b = this.body;
    const w = moving ? Math.sin(this.walkT) : 0;
    for (const [l, ph, amp] of b.legs) l.rotation.x = Math.sin(this.walkT + ph) * amp * (moving ? 1 : 0);
    b.arms.forEach((a, i) => (a.rotation.x = armSwing + (moving ? Math.sin(this.walkT + i * Math.PI) * 0.5 : 0)));
    if (b.wings) for (const [i, wg] of b.wings.entries()) wg.rotation.z = (i ? -1 : 1) * Math.sin(this.st * (this.fly > 2 ? 6 : 2)) * (this.fly > 2 ? 0.6 : 0.15);
    b.root.rotation.set(lean * 0.6, this.yaw, 0, 'YXZ');
    if (b.core) b.core.emissiveIntensity = (this.coreOpen > 0 ? 3.5 : 1.2) + this.flash * 2 + (this.state === 'wind' && this.kind === 'sentinel' ? 3 : 0);
    // (in the blizzard only a glimpse now and then)
    b.root.visible = this.state !== 'gone' && (this.hidden < 0.7 || Math.random() < 0.06);
    void w;
  }

  private sync(_dt: number) {
    const g = heightAt(this.position.x, this.position.z);
    this.position.y = g + this.fly;
    this.body.root.position.set(this.position.x, this.position.y + (this.state === 'dying' && this.kind !== 'wyvern' ? -Math.min(0.6, this.st * 0.4) : 0), this.position.z);
    this.center.set(this.position.x, this.position.y + this.spec.cy, this.position.z);
    if (this.state !== 'gone') this.rb.setNextKinematicTranslation({ x: this.center.x, y: this.center.y, z: this.center.z });
  }

  private updateShots(dt: number, player: Player) {
    for (const s of this.shots) {
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 5;
      const p = s.mesh.position;
      if (!player.dead && p.distanceTo(player.center) < 1.2) {
        player.receiveAttack({ damage: s.dmg, from: p.clone().sub(s.vel.clone().normalize().multiplyScalar(3)), at: p.clone(), parryable: false, poise: 40 });
        s.life = 0;
      }
      if (p.y < heightAt(p.x, p.z)) s.life = 0;
      if (s.life <= 0) {
        this.fx.add.spawn({ pos: p.clone(), spread: 2.5, count: 14, life: [0.3, 0.7], size: [0.14, 0.03], color: 0xe8f6ff, color2: 0x8ac8ff, gravity: 6 });
        this.scene.remove(s.mesh);
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  setVisible(v: boolean) {
    this.body.root.visible = v && this.state !== 'gone';
  }

  dispose() {
    if (this.state !== 'gone') physics.world.removeRigidBody(this.rb);
    this.state = 'gone';
    targets.delete(this);
    this.alive = false;
    this.dead = true;
    this.scene.remove(this.body.root);
    for (const s of this.shots) this.scene.remove(s.mesh);
    this.shots = [];
  }
}
