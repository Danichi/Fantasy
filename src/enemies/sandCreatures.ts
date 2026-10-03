import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { events } from '../core/events';
import { dampAngle } from '../core/math';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { heightAt } from '../world/terrainHeight';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';

// The Golden Expanse's sea life, gone to sand: sharks that swim under the
// dunes with only a fin showing and leap out to bite, rays that lie buried
// in ambush, dolphin pods arcing through the sand, and whales that breach
// in a fountain of dust. Every body is built here from a lathe profile and
// fins merged into one mesh; the tail swings in the vertex shader.

const SAND = 0xd9b77a, SAND_DARK = 0xa8854f;

// ---- bodies ------------------------------------------------------------------------------------------

export interface BodySpec {
  length: number;
  /** radius along the body, tail (t=0) to nose (t=1), as a fraction of length */
  profile: [number, number][];
  /** vertical squash of the body (1 = round) */
  squash: number;
  /** flatten sideways (rays) */
  widen?: number;
  back: number;
  belly: number;
  fin: number;
  finGlow?: number;
  dorsal?: { at: number; h: number; sweep: number };
  pectorals?: { at: number; span: number };
  /** tail fluke: vertical (sharks) or horizontal (dolphins, whales) */
  fluke: 'vertical' | 'horizontal';
  plates?: number;
  /** whale throat grooves / dolphin beak etc. are just profile shapes */
  eyes: number;
  eyeAt: number;
}

function colorize(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => THREE.Color) {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = fn(p);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const clean = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  n.computeVertexNormals();
  return n;
};

/** A fin: a swept triangle with a little thickness. */
function finGeometry(h: number, base: number, sweep: number, thick: number) {
  const s = new THREE.Shape();
  s.moveTo(-base / 2, 0);
  s.quadraticCurveTo(-base * 0.1 + sweep * 0.4, h * 0.7, sweep, h);
  s.quadraticCurveTo(base * 0.15, h * 0.35, base / 2, 0);
  s.lineTo(-base / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** One merged, vertex-coloured body with fins; +Z is the nose, origin at mid-body. */
function buildBody(spec: BodySpec) {
  const L = spec.length;
  const pts = spec.profile.map(([t, r]) => new THREE.Vector2(Math.max(0.0001, r * L), (t - 0.5) * L));
  const lathe = new THREE.LatheGeometry(pts, 14);
  lathe.rotateX(Math.PI / 2); // lathe axis Y -> Z (tail at -Z)
  lathe.scale(spec.widen ?? 1, spec.squash, 1);
  const back = new THREE.Color(spec.back), belly = new THREE.Color(spec.belly), fin = new THREE.Color(spec.fin);
  const parts: THREE.BufferGeometry[] = [];
  const maxR = Math.max(...spec.profile.map(([, r]) => r)) * L;
  parts.push(colorize(clean(lathe), (p) => {
    // Countershaded: dark back, pale belly, a few darker bands across the back.
    const up = THREE.MathUtils.smoothstep(p.y / (maxR * spec.squash), -0.3, 0.5);
    const band = Math.sin(p.z * (6 / L) * Math.PI) > 0.75 && up > 0.6 ? 0.82 : 1;
    return belly.clone().lerp(back, up).multiplyScalar(band);
  }));
  const finColor = () => fin;
  if (spec.dorsal) {
    const d = spec.dorsal;
    const g = finGeometry(d.h * L, d.h * L * 1.1, -d.sweep * L, Math.max(0.02, L * 0.012));
    g.rotateY(Math.PI / 2); // fin plane = YZ
    g.translate(0, maxR * spec.squash * 0.85, (d.at - 0.5) * L);
    parts.push(colorize(clean(g), finColor));
  }
  if (spec.pectorals) {
    const pc = spec.pectorals;
    for (const s of [-1, 1]) {
      const g = finGeometry(pc.span * L, pc.span * L * 0.7, -pc.span * L * 0.5, Math.max(0.015, L * 0.01));
      g.rotateY(Math.PI / 2);
      g.rotateZ(s * (Math.PI / 2 + 0.35));
      g.translate(s * maxR * (spec.widen ?? 1) * 0.7, -maxR * spec.squash * 0.25, (pc.at - 0.5) * L);
      parts.push(colorize(clean(g), finColor));
    }
  }
  // Tail fluke.
  {
    const h = L * (spec.fluke === 'vertical' ? 0.26 : 0.2);
    for (const s of [-1, 1]) {
      const g = finGeometry(h, h * 0.65, -h * 0.55, Math.max(0.02, L * 0.012));
      g.rotateY(Math.PI / 2);
      if (spec.fluke === 'horizontal') g.rotateZ(s * Math.PI / 2);
      else if (s < 0) g.rotateZ(Math.PI * 0.82);
      g.translate(0, 0, -0.5 * L + L * 0.03);
      parts.push(colorize(clean(g), finColor));
    }
  }
  // Rough sandstone plates along the spine (sharks wear armour out here).
  for (let i = 0; i < (spec.plates ?? 0); i++) {
    const t = 0.35 + (i / Math.max(1, (spec.plates ?? 1) - 1)) * 0.4;
    const g = new THREE.DodecahedronGeometry(maxR * 0.28, 0);
    g.scale(1.3, 0.45, 1.6);
    g.translate(0, maxR * spec.squash * 0.92, (t - 0.5) * L);
    parts.push(colorize(clean(g), () => new THREE.Color(SAND_DARK).multiplyScalar(0.85 + (i % 2) * 0.1)));
  }
  // Eyes: amber glass.
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(maxR * 0.12, 8, 6);
    g.translate(s * maxR * (spec.widen ?? 1) * 0.55, maxR * spec.squash * 0.25, (spec.eyeAt - 0.5) * L);
    parts.push(colorize(clean(g), () => new THREE.Color(spec.eyes)));
  }
  const geo = mergeGeometries(parts)!;
  return geo;
}

/** Body material with a swimming tail: the rear half swings sideways (or up and down). */
function swimMaterial(length: number, vertical: boolean, glow = 0) {
  const uniforms = { uPhase: { value: 0 }, uAmp: { value: 0.12 }, uLen: { value: length } };
  // Emissive only flashes on a hit (the fin's colour is in the vertex colours).
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, flatShading: true, emissive: new THREE.Color(glow || 0xff6040), emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform float uPhase; uniform float uAmp; uniform float uLen;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float tt = clamp((uLen * 0.25 - transformed.z) / (uLen * 0.75), 0.0, 1.0);
       float sw = sin(uPhase - tt * 3.4) * uAmp * tt * tt * uLen;
       ${vertical ? 'transformed.y += sw;' : 'transformed.x += sw;'}`,
    );
  };
  return { m, uniforms };
}

const SHARK: BodySpec = {
  length: 4.2, squash: 0.9, back: 0x7a5a36, belly: 0xeedbb0, fin: 0xd8782a, finGlow: 0xff6a2a,
  profile: [[0, 0.015], [0.12, 0.05], [0.32, 0.1], [0.55, 0.13], [0.75, 0.12], [0.9, 0.08], [0.98, 0.03], [1, 0]],
  dorsal: { at: 0.58, h: 0.26, sweep: 0.12 }, pectorals: { at: 0.62, span: 0.2 }, fluke: 'vertical', plates: 4, eyes: 0xffb020, eyeAt: 0.9,
};
export const RAY: BodySpec = {
  length: 2.2, squash: 0.22, widen: 3.2, back: 0xc8a36a, belly: 0xf2e2bc, fin: 0x8a6a3a,
  profile: [[0, 0.01], [0.25, 0.06], [0.5, 0.17], [0.7, 0.2], [0.88, 0.14], [1, 0]], fluke: 'vertical', eyes: 0x60ffd0, eyeAt: 0.82,
};
const DOLPHIN: BodySpec = {
  length: 2.4, squash: 0.95, back: 0xc79b5a, belly: 0xfaecc8, fin: 0xb08040,
  profile: [[0, 0.015], [0.15, 0.06], [0.4, 0.12], [0.62, 0.13], [0.82, 0.1], [0.9, 0.05], [0.97, 0.035], [1, 0.02]],
  dorsal: { at: 0.5, h: 0.14, sweep: 0.1 }, pectorals: { at: 0.68, span: 0.11 }, fluke: 'horizontal', eyes: 0x221810, eyeAt: 0.86,
};
const WHALE: BodySpec = {
  length: 26, squash: 0.85, back: 0x8a6d4a, belly: 0xe2cfa4, fin: 0x6e5436,
  profile: [[0, 0.01], [0.1, 0.04], [0.3, 0.1], [0.55, 0.14], [0.78, 0.14], [0.92, 0.11], [1, 0.05]],
  dorsal: { at: 0.32, h: 0.04, sweep: 0.03 }, pectorals: { at: 0.72, span: 0.14 }, fluke: 'horizontal', plates: 7, eyes: 0x2a1c10, eyeAt: 0.86,
};

const geoCache = new Map<BodySpec, THREE.BufferGeometry>();
const bodyGeo = (s: BodySpec) => {
  let g = geoCache.get(s);
  if (!g) geoCache.set(s, (g = buildBody(s)));
  return g;
};

/** A swimming body: the mesh plus its swim uniforms. */
export class Swimmer {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly swim: { uPhase: { value: number }; uAmp: { value: number }; uLen: { value: number } };
  phase = Math.random() * 6;
  constructor(spec: BodySpec, scale: number, vertical: boolean) {
    const { m, uniforms } = swimMaterial(spec.length, vertical, spec.finGlow ?? 0);
    this.mesh = new THREE.Mesh(bodyGeo(spec), m);
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(scale);
    this.group.add(this.mesh);
    this.swim = uniforms;
  }
  stroke(dt: number, rate: number, amp: number) {
    this.phase += dt * rate;
    this.swim.uPhase.value = this.phase;
    this.swim.uAmp.value = amp;
  }
  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    (this.mesh.material as THREE.Material).dispose();
  }
}

export const sandSpray = (fx: FX, at: THREE.Vector3, n: number, power = 1) =>
  fx.add.spawn({ pos: at, vel: new THREE.Vector3(0, 4 * power, 0), spread: 1.4 * power, count: n, life: [0.5, 1.3], size: [0.28 * power, 0.06], color: SAND, color2: SAND_DARK, gravity: 9, upBias: 0.8, alpha: 0.85 });

// ---- sand shark --------------------------------------------------------------------------------------

type SharkState = 'roam' | 'circle' | 'charge' | 'breach' | 'stranded' | 'dive' | 'dying';

export interface SharkOpts {
  name?: string;
  scale?: number;
  hp?: number;
  damage?: number;
  boss?: boolean;
  kind?: string;
}

export class SandShark implements Target {
  id = newTargetId();
  kind: string;
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius: number;
  halfHeight: number;
  position = new THREE.Vector3();
  stunned = false;
  lockable = false;
  hp: number;
  maxHp: number;
  name: string;
  readonly boss: boolean;
  private body: Swimmer;
  private state: SharkState = 'roam';
  private st = 0;
  private yaw = Math.random() * 6.28;
  private circleA = 0;
  private wander = new THREE.Vector3();
  private breachFrom = new THREE.Vector3();
  private breachTo = new THREE.Vector3();
  private hitDone = false;
  private combo = 0;
  private flash = 0;
  private scale: number;
  private damage: number;
  /** fires once when it first notices the player (boss intro) */
  onAggro?: () => void;
  private aggro = false;

  constructor(readonly home: THREE.Vector3, private scene: THREE.Scene, private fx: FX, o: SharkOpts = {}) {
    this.scale = o.scale ?? 1;
    this.boss = !!o.boss;
    this.kind = o.kind ?? 'sandShark';
    this.name = o.name ?? 'Sand Shark';
    this.maxHp = this.hp = o.hp ?? 170;
    this.damage = o.damage ?? 20;
    this.radius = 0.75 * this.scale;
    this.halfHeight = 0.4 * this.scale;
    this.body = new Swimmer(SHARK, this.scale, false);
    this.position.copy(home);
    this.wander.copy(home);
    scene.add(this.body.group);
    targets.add(this);
  }

  private get submerged() {
    return this.state === 'roam' || this.state === 'circle' || this.state === 'charge' || this.state === 'dive';
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying') return;
    // Under the sand: blades only throw up dust.
    if (this.submerged && this.state !== 'dive') {
      sandSpray(this.fx, h.at ?? this.position, 6, 0.5);
      return;
    }
    this.hp -= h.damage;
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 2, count: 10, life: [0.3, 0.6], size: [0.07, 0.01], color: 0x8a2a14, color2: 0x2a0a04, gravity: 8 });
    if (this.hp <= 0) this.die();
  }

  private die() {
    this.alive = false;
    this.lockable = false;
    this.stunned = false;
    this.state = 'dying';
    this.st = 0;
    targets.delete(this);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    sandSpray(this.fx, this.position.clone(), 30, this.scale);
  }

  private set(s: SharkState) {
    this.state = s;
    this.st = 0;
    this.lockable = s === 'stranded' || s === 'breach';
    if (s !== 'stranded') this.stunned = false;
  }

  /** Parried mid-leap: it slams down stunned, wide open for a riposte. */
  private parried() {
    this.breachTo.copy(this.position);
    this.set('stranded');
    this.stunned = true;
    this.st = -1.2;
    sandSpray(this.fx, this.position.clone(), 24, this.scale);
    events.emit('bossSlam', { at: this.position.clone() });
  }

  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    const S = this.scale;
    const ground = heightAt(this.position.x, this.position.z);
    const toP = new THREE.Vector3(player.pos.x - this.position.x, 0, player.pos.z - this.position.z);
    const dist = toP.length();
    const canHunt = !player.dead && !sheltered(player.pos) && player.pos.distanceTo(this.home) < (this.boss ? 70 : 110);
    let y = ground - 0.62 * S; // swimming: only the dorsal fin breaks the sand
    let pitch = 0, roll = 0;
    const swimTo = (target: THREE.Vector3, speed: number, turn: number) => {
      const want = Math.atan2(target.x - this.position.x, target.z - this.position.z);
      this.yaw = dampAngle(this.yaw, want, turn, dt);
      this.position.x += Math.sin(this.yaw) * speed * dt;
      this.position.z += Math.cos(this.yaw) * speed * dt;
    };
    switch (this.state) {
      case 'roam': {
        if (this.position.distanceTo(this.wander) < 3 || this.st > 9) {
          const a = Math.random() * 6.28, r = Math.random() * 30;
          this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.st = 0;
        }
        swimTo(this.wander, 3.2, 2);
        this.body.stroke(dt, 5, 0.1);
        if (canHunt && dist < (this.boss ? 55 : 34)) {
          if (!this.aggro) (this.aggro = true), this.onAggro?.();
          this.circleA = Math.atan2(this.position.x - player.pos.x, this.position.z - player.pos.z);
          this.set('circle');
        }
        break;
      }
      case 'circle': {
        if (!canHunt) {
          this.set('roam');
          break;
        }
        const R = (this.boss ? 15 : 11) + Math.sin(this.st * 0.7) * 2;
        this.circleA += (7 / R) * dt;
        swimTo(new THREE.Vector3(player.pos.x + Math.sin(this.circleA) * R, 0, player.pos.z + Math.cos(this.circleA) * R), 7.5, 4);
        this.body.stroke(dt, 8, 0.12);
        if (this.st > (this.boss ? 2.5 : 3) + Math.random() * 3) this.set('charge');
        break;
      }
      case 'charge': {
        swimTo(player.pos, this.boss ? 15 : 13, 3);
        this.body.stroke(dt, 13, 0.16);
        if (dist < 6.5 * Math.max(1, S * 0.6)) {
          this.breachFrom.copy(this.position);
          const dir = toP.normalize();
          this.breachTo.copy(player.pos).addScaledVector(dir, 4.5 * S).setY(0);
          this.hitDone = false;
          this.set('breach');
          sandSpray(this.fx, this.position.clone().setY(ground), 26, S);
        } else if (this.st > 5 || !canHunt) this.set('circle');
        break;
      }
      case 'breach': {
        // An arc out of the sand and through where the player stood.
        const T = 1.05 * Math.sqrt(S);
        const t = Math.min(1, this.st / T);
        this.position.lerpVectors(this.breachFrom, this.breachTo, t);
        const g = heightAt(this.position.x, this.position.z);
        y = g - 0.5 * S + Math.sin(Math.PI * t) * 3.6 * S;
        pitch = -Math.cos(Math.PI * t) * 0.85;
        this.yaw = Math.atan2(this.breachTo.x - this.breachFrom.x, this.breachTo.z - this.breachFrom.z);
        this.body.stroke(dt, 16, 0.2);
        if (!this.hitDone && t > 0.25 && t < 0.7) {
          const mouth = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(1.7 * S).add(this.position).setY(y);
          if (mouth.distanceTo(player.center) < 1.4 * S) {
            this.hitDone = true;
            player.receiveAttack({ damage: this.damage, from: this.position.clone().setY(y), at: mouth, parryable: true, poise: 45 * S, onParried: () => this.parried() });
          }
        }
        if (t >= 1) {
          sandSpray(this.fx, this.position.clone().setY(g), 30, S);
          events.emit('bossSlam', { at: this.position.clone() });
          // The boss chains leaps before it tires.
          if (this.boss && this.combo < 2 && Math.random() < 0.7) {
            this.combo++;
            this.set('dive');
            this.st = 0.5;
          } else {
            this.combo = 0;
            this.set('stranded');
          }
        }
        break;
      }
      case 'stranded': {
        // Beached on the sand, thrashing: the moment to strike.
        const g = heightAt(this.position.x, this.position.z);
        y = g + 0.15 * S;
        roll = Math.sin(this.st * 9) * 0.35 + 0.9;
        this.body.stroke(dt, 18, 0.24);
        if (this.st > (this.boss ? 2.2 : 2.6)) {
          this.set('dive');
          sandSpray(this.fx, this.position.clone().setY(g), 20, S);
        }
        break;
      }
      case 'dive': {
        const g = heightAt(this.position.x, this.position.z);
        const t = Math.min(1, this.st / 0.9);
        y = g + 0.15 * S - t * 0.77 * S;
        pitch = 0.5 * (1 - t);
        this.body.stroke(dt, 10, 0.14);
        if (t >= 1) this.set(canHunt ? 'circle' : 'roam');
        break;
      }
      case 'dying': {
        const g = heightAt(this.position.x, this.position.z);
        roll = Math.PI / 2 + 0.2;
        y = g + 0.2 * S - Math.max(0, this.st - 2.5) * 0.4 * S;
        this.body.stroke(dt, 2 * Math.max(0, 1 - this.st / 2), 0.05);
        if (this.st > 6) {
          this.dead = true;
          this.body.dispose(this.scene);
          return;
        }
        break;
      }
    }
    // A wake of sand behind the fin while it swims.
    if (this.submerged && this.state !== 'dive' && Math.random() < dt * (this.state === 'charge' ? 30 : 12)) {
      const fin = new THREE.Vector3(this.position.x, ground + 0.05, this.position.z);
      this.fx.add.spawn({ pos: fin, vel: new THREE.Vector3(-Math.sin(this.yaw) * 1.5, 1.2, -Math.cos(this.yaw) * 1.5), spread: 0.5 * S, count: 2, life: [0.4, 0.9], size: [0.22 * S, 0.05], color: SAND, color2: SAND_DARK, gravity: 6, alpha: 0.7 });
    }
    this.body.group.position.set(this.position.x, y, this.position.z);
    this.body.group.rotation.set(0, 0, 0);
    this.body.group.rotateY(this.yaw);
    this.body.group.rotateX(pitch);
    this.body.group.rotateZ(roll);
    this.position.y = y;
    this.center.set(this.position.x, y + 0.2 * S, this.position.z);
    const mat = this.body.mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = this.flash * 1.2;
  }

  /** The boss resets if the player dies or leaves. */
  reset() {
    if (!this.alive) return;
    this.hp = this.maxHp;
    this.position.copy(this.home);
    this.aggro = false;
    this.set('roam');
  }

  dispose() {
    targets.delete(this);
    if (!this.dead) this.body.dispose(this.scene);
    this.dead = true;
  }
}

// ---- sand ray --------------------------------------------------------------------------------------

type RayState = 'buried' | 'rise' | 'glide' | 'sting' | 'bury' | 'dying';

/** Lies flat under a skin of sand; bursts up when you step close, glides round you and stings. */
export class SandRay implements Target {
  id = newTargetId();
  kind = 'sandRay';
  alive = true;
  dead = false;
  center = new THREE.Vector3();
  radius = 0.9;
  halfHeight = 0.25;
  position = new THREE.Vector3();
  stunned = false;
  lockable = false;
  hp = 75;
  maxHp = 75;
  name = 'Dune Ray';
  private body: Swimmer;
  private state: RayState = 'buried';
  private st = 0;
  private yaw = Math.random() * 6.28;
  private a = 0;
  private hitDone = false;
  private flash = 0;

  constructor(readonly home: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.body = new Swimmer(RAY, 1, true);
    this.position.copy(home);
    scene.add(this.body.group);
    targets.add(this);
  }

  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'buried' || this.state === 'dying') return;
    this.hp -= h.damage;
    this.flash = 1;
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 1.5, count: 8, life: [0.3, 0.6], size: [0.06, 0.01], color: 0x5a7a3a, color2: 0x1a2a0a, gravity: 8 });
    if (h.poise > 20 && this.state === 'glide') this.st = Math.max(0, this.st - 0.6);
    if (this.hp <= 0) {
      this.alive = false;
      this.lockable = false;
      this.state = 'dying';
      this.st = 0;
      targets.delete(this);
      events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    }
  }

  update(dt: number, player: Player, sheltered: (p: THREE.Vector3) => boolean) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    const g = heightAt(this.position.x, this.position.z);
    const dist = Math.hypot(player.pos.x - this.position.x, player.pos.z - this.position.z);
    let y = g + 0.02;
    let pitch = 0;
    switch (this.state) {
      case 'buried':
        y = g - 0.12;
        this.body.stroke(dt, 1, 0.03);
        if (!player.dead && dist < 6.5 && !sheltered(player.pos)) {
          this.state = 'rise';
          this.st = 0;
          sandSpray(this.fx, this.position.clone().setY(g), 22, 0.8);
        }
        break;
      case 'rise':
        y = g - 0.12 + Math.min(1, this.st / 0.5) * 1.2;
        this.body.stroke(dt, 6, 0.2);
        if (this.st > 0.5) (this.state = 'glide'), (this.st = 0), (this.a = Math.atan2(this.position.x - player.pos.x, this.position.z - player.pos.z));
        break;
      case 'glide': {
        this.a += dt * 1.4;
        const tx = player.pos.x + Math.sin(this.a) * 4, tz = player.pos.z + Math.cos(this.a) * 4;
        const want = Math.atan2(tx - this.position.x, tz - this.position.z);
        this.yaw = dampAngle(this.yaw, want, 5, dt);
        this.position.x += Math.sin(this.yaw) * 5 * dt;
        this.position.z += Math.cos(this.yaw) * 5 * dt;
        y = g + 1.1 + Math.sin(this.st * 3) * 0.15;
        this.body.stroke(dt, 5, 0.28);
        if (this.st > 1.8 + Math.random()) (this.state = 'sting'), (this.st = 0), (this.hitDone = false);
        if (dist > 18 || player.dead) (this.state = 'bury'), (this.st = 0);
        break;
      }
      case 'sting': {
        // A dart at the player, tail first-ish.
        const want = Math.atan2(player.pos.x - this.position.x, player.pos.z - this.position.z);
        this.yaw = dampAngle(this.yaw, want, 10, dt);
        const sp = this.st < 0.35 ? -1.5 : 11;
        this.position.x += Math.sin(this.yaw) * sp * dt;
        this.position.z += Math.cos(this.yaw) * sp * dt;
        y = g + 1.1 - Math.min(0.6, this.st);
        pitch = 0.3;
        this.body.stroke(dt, 12, 0.35);
        if (!this.hitDone && this.st > 0.35 && this.center.distanceTo(player.center) < 1.5) {
          this.hitDone = true;
          player.receiveAttack({ damage: 14, from: this.position.clone(), at: this.center.clone(), parryable: true, poise: 18, burn: 0 });
        }
        if (this.st > 0.9) (this.state = this.st > 0 && Math.random() < 0.25 ? 'bury' : 'glide'), (this.st = 0);
        break;
      }
      case 'bury':
        y = g + 1.1 - Math.min(1, this.st / 0.8) * 1.22;
        this.body.stroke(dt, 4, 0.15);
        if (this.st > 0.8) {
          this.state = 'buried';
          this.st = 0;
          sandSpray(this.fx, this.position.clone().setY(g), 12, 0.6);
        }
        break;
      case 'dying':
        y = g + Math.max(-0.2, 1 - this.st * 1.5);
        this.body.stroke(dt, 1, 0.02);
        if (this.st > 4) {
          this.dead = true;
          this.body.dispose(this.scene);
          return;
        }
        break;
    }
    this.lockable = this.alive && this.state !== 'buried';
    this.body.group.position.set(this.position.x, y, this.position.z);
    this.body.group.rotation.set(0, 0, 0);
    this.body.group.rotateY(this.yaw);
    this.body.group.rotateX(pitch);
    this.position.y = y;
    this.center.set(this.position.x, y, this.position.z);
    (this.body.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = this.flash * 1.5;
  }

  dispose() {
    targets.delete(this);
    if (!this.dead) this.body.dispose(this.scene);
    this.dead = true;
  }
}

// ---- ambient: dolphin pods and sand whales ----------------------------------------------------------

/** A pod of sand dolphins porpoising round a loop: harmless, just alive. */
export class DolphinPod {
  private swimmers: { s: Swimmer; off: number; lane: number }[] = [];
  private t = Math.random() * 100;
  constructor(readonly center: THREE.Vector3, private radius: number, n: number, private scene: THREE.Scene, private fx: FX) {
    for (let i = 0; i < n; i++) {
      const s = new Swimmer(DOLPHIN, 0.9 + Math.random() * 0.25, true);
      scene.add(s.group);
      this.swimmers.push({ s, off: i * 0.22 + Math.random() * 0.1, lane: (Math.random() - 0.5) * 6 });
    }
  }
  update(dt: number) {
    this.t += dt;
    for (const d of this.swimmers) {
      // Round a wide loop, each leaping on its own beat.
      const a = (this.t * 0.11) + d.off;
      const r = this.radius + d.lane;
      const x = this.center.x + Math.sin(a) * r, z = this.center.z + Math.cos(a) * r;
      const g = heightAt(x, z);
      const beat = (this.t * 0.55 + d.off * 3.1) % 1;
      const up = Math.sin(Math.PI * beat);
      const y = g - 0.9 + up * 3.4;
      const yaw = a + Math.PI / 2;
      d.s.group.position.set(x, y, z);
      d.s.group.rotation.set(0, 0, 0);
      d.s.group.rotateY(yaw);
      d.s.group.rotateX(-Math.cos(Math.PI * beat) * 0.7);
      d.s.stroke(dt, 9, 0.12);
      // Puffs where they break the surface.
      if ((beat < 0.08 || beat > 0.92) && Math.random() < dt * 25) sandSpray(this.fx, new THREE.Vector3(x, g, z), 3, 0.5);
    }
  }
  dispose() {
    for (const d of this.swimmers) d.s.dispose(this.scene);
    this.swimmers = [];
  }
}

/** A sand whale: vast, slow, mostly under the dunes; now and then it breaches in a fountain of sand. */
export class SandWhale {
  private s: Swimmer;
  private t = Math.random() * 30;
  private a = Math.random() * 6.28;
  private nextBreach = 8 + Math.random() * 10;
  private breaching = -1;
  onBreach?: (at: THREE.Vector3) => void;
  constructor(readonly center: THREE.Vector3, private radius: number, private scene: THREE.Scene, private fx: FX) {
    this.s = new Swimmer(WHALE, 1, true);
    scene.add(this.s.group);
  }
  get position() {
    return this.s.group.position;
  }
  update(dt: number) {
    this.t += dt;
    this.a += dt * (4 / this.radius);
    const x = this.center.x + Math.sin(this.a) * this.radius, z = this.center.z + Math.cos(this.a) * this.radius;
    const g = heightAt(x, z);
    let y = g - 6.5; // just the ridge of its back breaking the sand
    let pitch = 0;
    if (this.breaching < 0 && this.t > this.nextBreach) {
      this.breaching = 0;
      this.onBreach?.(new THREE.Vector3(x, g, z));
    }
    if (this.breaching >= 0) {
      this.breaching += dt;
      const b = Math.min(1, this.breaching / 5);
      y = g - 6.5 + Math.sin(Math.PI * b) * 15;
      pitch = -Math.cos(Math.PI * b) * 0.55;
      if (Math.random() < dt * 40) sandSpray(this.fx, new THREE.Vector3(x + (Math.random() - 0.5) * 10, g, z + (Math.random() - 0.5) * 10), 6, 2.4);
      if (b >= 1) {
        this.breaching = -1;
        this.t = 0;
        this.nextBreach = 18 + Math.random() * 20;
      }
    } else if (Math.random() < dt * 2) {
      // The spout: a plume of sand from the blowhole.
      if (Math.sin(this.t * 0.3) > 0.96) this.fx.add.spawn({ pos: new THREE.Vector3(x, g + 0.5, z), vel: new THREE.Vector3(0, 9, 0), spread: 1.2, count: 8, life: [1.2, 2.2], size: [1.2, 0.3], color: SAND, color2: SAND_DARK, gravity: 4, alpha: 0.6 });
    }
    this.s.group.position.set(x, y, z);
    this.s.group.rotation.set(0, 0, 0);
    this.s.group.rotateY(this.a + Math.PI / 2);
    this.s.group.rotateX(pitch);
    this.s.stroke(dt, 1.2, 0.06);
  }
  setVisible(v: boolean) {
    this.s.group.visible = v;
  }
  dispose() {
    this.s.dispose(this.scene);
  }
}
