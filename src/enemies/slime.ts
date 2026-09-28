import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_ENEMY, STATIC_ONLY } from '../physics/physics';
import { heightAt } from '../world/terrain';
import { clamp, damp, dampAngle, segmentPointDistance } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// ---------------------------------------------------------------------------
// Slimes: translucent jelly with a darker core, drifting bubbles and eyes that
// track the player. The body is a unit sphere deformed in the vertex shader
// (wobble, squash-and-stretch, lean, flattened base) from spring-driven values
// so every hop, hit and landing jiggles.
// ---------------------------------------------------------------------------

export type SlimeKind = 'green' | 'blue' | 'magma';

interface Variant {
  radius: number;
  hp: number;
  damage: number;
  poise: number; // stagger threshold
  color: number;
  deep: number; // colour seen through thick jelly
  core: number;
  coreEmissive: number;
  hopDist: number;
  hopTime: number;
  leapDist: number;
  leapTime: number;
  windup: number;
  attackRange: number;
  burn?: number;
  emissiveCracks?: boolean;
}

export const VARIANTS: Record<SlimeKind, Variant> = {
  green: { radius: 0.42, hp: 60, damage: 14, poise: 22, color: 0x7ae65e, deep: 0x1f7a2a, core: 0x2d5e1e, coreEmissive: 0x0a1f05, hopDist: 1.7, hopTime: 0.42, leapDist: 4.2, leapTime: 0.5, windup: 0.45, attackRange: 3.4 },
  blue: { radius: 0.68, hp: 140, damage: 24, poise: 55, color: 0x5cb8ff, deep: 0x123f9a, core: 0x1a2f6e, coreEmissive: 0x050a26, hopDist: 2.2, hopTime: 0.62, leapDist: 5.2, leapTime: 0.72, windup: 0.62, attackRange: 4.4 },
  magma: { radius: 0.55, hp: 110, damage: 18, poise: 40, color: 0xff6a2a, deep: 0x7a1000, core: 0x2a0500, coreEmissive: 0xff3300, hopDist: 1.9, hopTime: 0.5, leapDist: 4.6, leapTime: 0.56, windup: 0.5, attackRange: 3.8, burn: 6, emissiveCracks: true },
};

type State = 'idle' | 'chase' | 'crouch' | 'air' | 'windup' | 'leap' | 'recover' | 'hurt' | 'stunned' | 'dying';

const GRAV = 20;

function bodyMaterial(v: Variant, uniforms: Record<string, THREE.IUniform>) {
  const m = new THREE.MeshPhysicalMaterial({
    color: v.color,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.3,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime, uWobble;
        uniform vec3 uSquash, uLean;
        varying vec3 vLocal;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = normalize(normal / uSquash);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 p = position;
        float ang = atan(p.x, p.z);
        float w = sin(uTime * 5.3 + p.y * 4.0 + ang * 3.0) * 0.5 + sin(uTime * 3.1 - p.x * 5.0 + p.z * 3.0) * 0.5;
        p += normal * w * uWobble;
        p.xz *= 1.0 - 0.1 * max(p.y, 0.0);  // soft teardrop: narrower on top
        p *= uSquash;
        p.xz += uLean.xz * (p.y + uSquash.y);   // top lags behind motion
        float floorY = -uSquash.y * 0.78;
        if (p.y < floorY) { float k = floorY - p.y; p.y = floorY; p.xz *= 1.0 + k * 0.9; }
        vLocal = position;
        vec3 transformed = p;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlash, uTime, uCracks;
        uniform vec3 uDeep;
        varying vec3 vLocal;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y),
                     mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float fres = pow(1.0 - facing, 2.2);
        // Thick jelly: centre shows the deep colour, rim stays bright.
        vec3 jelly = mix(uDeep, diffuseColor.rgb, 0.35 + 0.65 * fres);
        outgoingLight = mix(outgoingLight, outgoingLight * 0.6 + jelly * 0.35, 1.0 - fres);
        // Fake subsurface: soft inner light from below the surface.
        outgoingLight += diffuseColor.rgb * 0.18 * (1.0 - fres) * (0.6 + 0.4 * vLocal.y);
        if (uCracks > 0.5) {
          float c = n3(vLocal * 4.0 + vec3(0.0, uTime * 0.4, 0.0));
          float crack = smoothstep(0.47, 0.5, c) * smoothstep(0.53, 0.5, c);
          outgoingLight += vec3(4.0, 1.2, 0.2) * crack * (0.7 + 0.3 * sin(uTime * 3.0 + vLocal.x * 5.0));
          outgoingLight += vec3(0.6, 0.12, 0.0) * (1.0 - fres) * 0.6;
        }
        outgoingLight = mix(outgoingLight, vec3(1.6), uFlash);
        float alpha = mix(0.62, 0.96, fres);
        if (!gl_FrontFacing) { outgoingLight *= 0.55; alpha *= 0.7; }
        gl_FragColor = vec4(outgoingLight, alpha);`,
      );
  };
  return m;
}

// Shared geometries.
const BODY_GEO = new THREE.SphereGeometry(1, 48, 32);
const CORE_GEO = (() => {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1) * Math.cos(v.y * 4.3) * Math.sin(v.z * 3.7);
    v.multiplyScalar(1 + n * 0.18);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
})();
const EYE_GEO = new THREE.SphereGeometry(1, 20, 14);
const EYE_MAT = new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
const GLINT_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BUBBLE_MAT = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false });
const SHADOW_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export class Slime implements Target {
  id = newTargetId();
  kind: string;
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius: number;
  halfHeight = 0;
  position = new THREE.Vector3();
  center = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly v: Variant;

  private state: State = 'idle';
  private st = 0;
  private vel = new THREE.Vector3();
  private grounded = true;
  private yaw = Math.random() * Math.PI * 2;
  private home: THREE.Vector3;
  private nextIdleHop = 1 + Math.random() * 2;
  private cooldown = 0;
  private poiseAcc = 0;
  private hitDone = false;
  private deathT = 0;

  // jiggle springs
  private sy = 1;
  private syV = 0;
  private syTarget = 1;
  private lean = new THREE.Vector3();
  private leanV = new THREE.Vector3();
  private flash = 0;
  private uniforms: Record<string, THREE.IUniform>;

  private body: THREE.Mesh;
  private core: THREE.Mesh;
  private eyes: THREE.Group[] = [];
  private bubbles: { m: THREE.Mesh; phase: number; speed: number; x: number; z: number }[] = [];
  private shadow: THREE.Mesh;
  private rb: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private blink = 0;
  private nextBlink = 2 + Math.random() * 3;
  private lookDir = new THREE.Vector3(0, 0, 1);

  constructor(kind: SlimeKind, at: THREE.Vector3, private scene: THREE.Scene, private fx: FX) {
    this.kind = kind;
    const v = (this.v = VARIANTS[kind]);
    this.hp = this.maxHp = v.hp;
    this.radius = v.radius;
    this.home = at.clone();

    this.uniforms = {
      uTime: { value: Math.random() * 10 },
      uWobble: { value: 0.03 },
      uSquash: { value: new THREE.Vector3(1, 1, 1) },
      uLean: { value: new THREE.Vector3() },
      uFlash: { value: 0 },
      uDeep: { value: new THREE.Color(v.deep) },
      uCracks: { value: v.emissiveCracks ? 1 : 0 },
    };
    this.body = new THREE.Mesh(BODY_GEO, bodyMaterial(v, this.uniforms));
    this.body.castShadow = true;
    this.body.renderOrder = 2;

    const coreMat = new THREE.MeshStandardMaterial({ color: v.core, emissive: v.coreEmissive, emissiveIntensity: v.emissiveCracks ? 2.5 : 1, roughness: 0.5 });
    this.core = new THREE.Mesh(CORE_GEO, coreMat);
    this.core.scale.setScalar(0.34);
    this.core.position.y = -0.12;

    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(EYE_GEO, BUBBLE_MAT);
      b.scale.setScalar(0.03 + Math.random() * 0.04);
      b.renderOrder = 1;
      this.bubbles.push({ m: b, phase: Math.random(), speed: 0.15 + Math.random() * 0.2, x: (Math.random() - 0.5) * 0.9, z: (Math.random() - 0.5) * 0.9 });
    }

    // Everything inside the body lives in a unit-sphere "inner" group that
    // follows the body's squash.
    const inner = new THREE.Group();
    inner.add(this.core, ...this.bubbles.map((b) => b.m));
    const scaled = new THREE.Group();
    scaled.name = 'inner';
    scaled.add(inner);
    this.group.add(this.body, scaled);

    for (const side of [-1, 1]) {
      const e = new THREE.Group();
      const ball = new THREE.Mesh(EYE_GEO, EYE_MAT);
      ball.scale.set(0.085, 0.12, 0.05);
      const glint = new THREE.Mesh(EYE_GEO, GLINT_MAT);
      glint.scale.setScalar(0.026);
      glint.position.set(0.028 * side, 0.045, 0.04);
      e.add(ball, glint);
      e.userData.side = side;
      this.eyes.push(e);
      this.group.add(e);
    }

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false }),
    );
    scene.add(this.group, this.shadow);

    const r = v.radius * 0.78;
    this.position.copy(at);
    this.rb = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y + r + 0.05, at.z));
    this.col = physics.world.createCollider(RAPIER.ColliderDesc.ball(r).setCollisionGroups(groups(G_ENEMY, 0)), this.rb);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 3);
    targets.add(this);
    this.syncVisual(0);
  }

  // ---- Target ----------------------------------------------------------------
  takeHit(h: HitInfo) {
    if (!this.alive || this.state === 'dying') return;
    this.hp -= h.damage;
    this.flash = 1;
    this.syV -= 5;
    this.leanV.addScaledVector(h.dir, 3.5);
    const col = new THREE.Color(this.v.color);
    this.fx.drops.burst(h.at, col, 6, this.v.radius * 1.4, 3.5);
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.poiseAcc += h.poise;
    const wasStunned = this.stunned;
    if (this.poiseAcc >= this.v.poise || h.source === 'spell' || wasStunned) {
      this.poiseAcc = 0;
      this.stunned = false;
      this.setState('hurt');
      const kb = wasStunned ? 6 : 3.6;
      this.vel.set(h.dir.x * kb, this.grounded ? 3.2 : Math.max(this.vel.y, 1.5), h.dir.z * kb);
      this.grounded = false;
    }
  }

  private die() {
    this.alive = false;
    this.stunned = false;
    this.setState('dying');
    targets.delete(this);
    const col = new THREE.Color(this.v.color);
    this.fx.drops.burst(this.center, col, Math.round(22 * (this.v.radius / 0.5)), this.v.radius * 1.6, 5.5);
    if (this.v.emissiveCracks) {
      this.fx.add.spawn({ pos: this.center, spread: 5, count: 40, life: [0.4, 1], size: [0.12, 0.02], color: 0xffc070, color2: 0xff3000, gravity: 3, upBias: 0.5 });
    }
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
  }

  private setState(s: State) {
    this.state = s;
    this.st = 0;
  }

  get dead() {
    return this.state === 'dying' && this.deathT > 1.6;
  }

  dispose() {
    this.scene.remove(this.group, this.shadow);
    physics.world.removeCollider(this.col, false);
    physics.world.removeRigidBody(this.rb);
    physics.world.removeCharacterController(this.kcc);
    (this.body.material as THREE.Material).dispose();
    (this.core.material as THREE.Material).dispose();
  }

  // ---- AI --------------------------------------------------------------------
  update(dt: number, player: Player, others: Slime[]) {
    this.st += dt;
    this.cooldown -= dt;
    this.uniforms.uTime.value += dt;
    const v = this.v;

    if (this.state === 'dying') {
      this.deathT += dt;
      // Melt into a puddle, then fade.
      this.syTarget = 0.12;
      this.springs(dt);
      this.syncVisual(dt);
      const k = clamp(1 - (this.deathT - 0.4) / 1.2, 0, 1);
      this.group.scale.setScalar(Math.max(0.001, k));
      this.shadow.visible = false;
      return;
    }

    const toP = player.pos.clone().sub(this.position);
    const dist = Math.hypot(toP.x, toP.z);
    const aware = !player.dead && dist < 16;
    const wantYaw = Math.atan2(toP.x, toP.z);

    switch (this.state) {
      case 'idle':
        this.syTarget = 1;
        if (aware) this.setState('chase');
        else if (this.grounded && this.st > this.nextIdleHop) {
          this.nextIdleHop = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          const back = this.home.clone().sub(this.position);
          const dir = back.length() > 6 ? back.normalize() : new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          this.yaw = Math.atan2(dir.x, dir.z);
          this.startHop(dir, v.hopDist * 0.5, v.hopTime * 0.85);
        }
        break;
      case 'chase':
        this.syTarget = 1;
        this.yaw = dampAngle(this.yaw, wantYaw, 8, dt);
        if (!aware) this.setState('idle');
        else if (this.grounded && this.st > 0.28) {
          if (dist < v.attackRange && this.cooldown <= 0) this.setState('windup');
          else {
            // Hop toward the player, or circle a little when too close.
            const dir = toP.clone().setY(0).normalize();
            if (dist < 1.6) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() < 0.5 ? 1 : -1) * 1.3);
            this.startHop(dir, Math.min(v.hopDist, Math.max(0.6, dist - 1.2)), v.hopTime);
          }
        }
        break;
      case 'crouch':
        this.syTarget = 0.72;
        if (this.st > 0.16) this.launch();
        break;
      case 'air':
        this.syTarget = 1.15;
        break;
      case 'windup': {
        // Telegraph: deep squash, tremble, turn to face.
        this.syTarget = 0.56;
        this.yaw = dampAngle(this.yaw, wantYaw, 12, dt);
        this.lean.x += (Math.random() - 0.5) * 0.04;
        this.lean.z += (Math.random() - 0.5) * 0.04;
        if (this.st > v.windup) this.leap(player);
        break;
      }
      case 'leap':
        this.syTarget = 1.25;
        if (!this.hitDone) this.checkHit(player);
        break;
      case 'recover':
        this.syTarget = 0.9;
        if (this.st > 0.75) this.setState('chase');
        break;
      case 'hurt':
        this.syTarget = 0.85;
        if (this.grounded && this.st > 0.4) this.setState('chase');
        break;
      case 'stunned':
        this.syTarget = 0.62;
        this.uniforms.uWobble.value = 0.07;
        if (this.st > 2.0) {
          this.stunned = false;
          this.setState('chase');
        }
        break;
    }

    // Physics.
    if (!this.grounded) this.vel.y -= GRAV * dt;
    else {
      this.vel.y = Math.min(this.vel.y, 0) - 2 * dt;
      const fr = Math.exp(-12 * dt);
      this.vel.x *= fr;
      this.vel.z *= fr;
    }
    // Push apart from other slimes.
    const push = new THREE.Vector3();
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const d = Math.hypot(dx, dz), min = (this.v.radius + o.v.radius) * 0.85;
      if (d < min && d > 1e-4) push.set(push.x + (dx / d) * (min - d) * 0.5, 0, push.z + (dz / d) * (min - d) * 0.5);
    }
    // And from the player, so slimes never sit inside you.
    if (dist < this.v.radius * 0.8 + 0.32 && dist > 1e-4 && Math.abs(player.pos.y - this.position.y) < 1.2) {
      const k = (this.v.radius * 0.8 + 0.32 - dist) * 0.5;
      push.x -= (toP.x / dist) * k;
      push.z -= (toP.z / dist) * k;
    }
    const desired = { x: this.vel.x * dt + push.x, y: this.vel.y * dt, z: this.vel.z * dt + push.z };
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY);
    const m = this.kcc.computedMovement();
    const cur = this.rb.translation();
    const next = { x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z };
    this.rb.setNextKinematicTranslation(next);
    this.col.setTranslation(next);
    const r = v.radius * 0.78;
    this.position.set(next.x, next.y - r - 0.02, next.z);
    const g = this.kcc.computedGrounded();
    if (g && !this.grounded && this.vel.y <= 0) this.land();
    this.grounded = g && this.vel.y <= 0.01;
    if (this.position.y < -20) this.die();

    this.springs(dt);
    this.syncVisual(dt, player);
  }

  private startHop(dir: THREE.Vector3, dist: number, time: number) {
    this.hopPlan = { dir: dir.clone(), dist, time };
    this.setState('crouch');
  }
  private hopPlan: { dir: THREE.Vector3; dist: number; time: number } | null = null;

  private launch() {
    const p = this.hopPlan!;
    this.vel.set(p.dir.x * (p.dist / p.time), (GRAV * p.time) / 2, p.dir.z * (p.dist / p.time));
    this.grounded = false;
    this.syV += 4;
    this.setState('air');
  }

  private leap(player: Player) {
    const lead = player.pos.clone().addScaledVector(new THREE.Vector3(player.vel.x, 0, player.vel.z), 0.22);
    const to = lead.sub(this.position).setY(0);
    const d = Math.min(this.v.leapDist, Math.max(1.0, to.length() + 0.4));
    to.normalize();
    const T = this.v.leapTime;
    this.vel.set(to.x * (d / T), (GRAV * T) / 2 + 0.6, to.z * (d / T));
    this.grounded = false;
    this.hitDone = false;
    this.syV += 6;
    this.setState('leap');
  }

  private land() {
    this.syV -= this.state === 'leap' ? 7 : 4.5;
    events.emit('slimeLand', { at: this.position.clone(), size: this.radius });
    if (this.v.radius > 0.6) this.fx.dust(this.position.clone().setY(this.position.y + 0.05), 1);
    if (this.state === 'air') this.setState('chase');
    else if (this.state === 'leap') {
      this.setState('recover');
      this.cooldown = 1.1 + Math.random() * 1.2;
    }
  }

  private checkHit(player: Player) {
    // Sphere vs the player's capsule (feet+0.35 .. feet+1.45, radius 0.32).
    const a = player.pos.clone().setY(player.pos.y + 0.35);
    const b = player.pos.clone().setY(player.pos.y + 1.45);
    if (segmentPointDistance(a, b, this.center) > this.v.radius * 0.9 + 0.32) return;
    this.hitDone = true;
    const res = player.receiveAttack({
      damage: this.v.damage,
      from: this.position.clone(),
      parryable: true,
      poise: this.v.damage * 2.2,
      burn: this.v.burn,
      onParried: () => {
        this.stunned = true;
        this.flash = 0.6;
        const back = this.position.clone().sub(player.pos).setY(0).normalize();
        this.vel.set(back.x * 4, 4.5, back.z * 4);
        this.setState('stunned');
      },
    });
    if (res === 'blocked' || res === 'guardBroken') {
      const back = this.position.clone().sub(player.pos).setY(0).normalize();
      this.vel.set(back.x * 3.5, 3.5, back.z * 3.5);
      this.syV -= 5;
      this.fx.sparks(this.center.clone().addScaledVector(back, -this.radius), back);
    } else if (res === 'hit') {
      this.vel.x *= -0.3;
      this.vel.z *= -0.3;
    }
  }

  // ---- visuals ---------------------------------------------------------------
  private springs(dt: number) {
    // Vertical squash spring (underdamped for jelly).
    const k = 140, c = 7;
    this.syV += (k * (this.syTarget - this.sy) - c * this.syV) * dt;
    this.sy = clamp(this.sy + this.syV * dt, 0.35, 1.7);
    // Lean spring toward "top lags behind velocity".
    const want = new THREE.Vector3(-this.vel.x, 0, -this.vel.z).multiplyScalar(0.035);
    want.clampLength(0, 0.35);
    this.leanV.addScaledVector(want.sub(this.lean), 90 * dt).multiplyScalar(Math.exp(-6 * dt));
    this.lean.addScaledVector(this.leanV, dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.state !== 'stunned') this.uniforms.uWobble.value = damp(this.uniforms.uWobble.value, 0.028 + Math.abs(this.syV) * 0.004, 6, dt);
  }

  private syncVisual(dt: number, player?: Player) {
    const r = this.v.radius;
    const sy = this.sy;
    const sxz = 1 / Math.sqrt(sy);
    const squash = this.uniforms.uSquash.value as THREE.Vector3;
    squash.set(sxz * r, sy * r, sxz * r);
    (this.uniforms.uLean.value as THREE.Vector3).copy(this.lean).multiplyScalar(1 / Math.max(0.3, sy));
    this.uniforms.uFlash.value = this.flash;
    // Body origin: its flattened base sits on the ground.
    const baseY = this.position.y + squash.y * 0.78;
    this.group.position.set(this.position.x, baseY, this.position.z);
    this.center.set(this.position.x, baseY, this.position.z);
    // Hurt capsule follows the squash: wide and short, or tall and thin.
    this.radius = Math.max(squash.x, 0.2);
    this.halfHeight = Math.max(0, squash.y - squash.x);

    const inner = this.group.getObjectByName('inner')!;
    inner.scale.copy(squash);
    inner.position.set(this.lean.x * 0.5 * squash.y, 0, this.lean.z * 0.5 * squash.y);
    this.core.rotation.y += dt * 0.4;
    this.core.rotation.x += dt * 0.23;
    for (const b of this.bubbles) {
      b.phase = (b.phase + dt * b.speed) % 1;
      b.m.position.set(b.x * (1 - b.phase * 0.5) * 0.7, -0.6 + b.phase * 1.3, b.z * (1 - b.phase * 0.5) * 0.7);
      b.m.visible = b.phase < 0.92;
    }

    // Eyes: on the deformed surface, facing where the slime looks.
    if (player && this.state !== 'dying') {
      const to = player.center.clone().sub(this.center).normalize();
      this.lookDir.lerp(to, 1 - Math.exp(-6 * dt)).normalize();
    }
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    this.blink -= dt;
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      this.blink = 0.12;
      this.nextBlink = 2 + Math.random() * 4;
    }
    const angry = this.state === 'windup' || this.state === 'leap';
    for (const e of this.eyes) {
      const side = e.userData.side as number;
      // Point on the unit sphere, then the same squash + lean as the shader.
      const d = fwd.clone().multiplyScalar(0.86).addScaledVector(right, side * 0.33).add(new THREE.Vector3(0, 0.34, 0)).normalize();
      d.x *= 1 - 0.1 * Math.max(d.y, 0);
      d.z *= 1 - 0.1 * Math.max(d.y, 0);
      const p = d.clone().multiply(squash);
      p.x += this.lean.x * (p.y + squash.y) / Math.max(0.3, sy);
      p.z += this.lean.z * (p.y + squash.y) / Math.max(0.3, sy);
      e.position.copy(p).multiplyScalar(1.005);
      e.lookAt(e.getWorldPosition(new THREE.Vector3()).add(d.clone().lerp(this.lookDir, 0.35)));
      const s = r / 0.5;
      const blinkY = this.blink > 0 ? 0.15 : 1;
      e.scale.set(s, s * blinkY * (angry ? 0.62 : 1) * (this.state === 'stunned' ? 0.5 : 1), s);
      e.rotation.z += angry ? side * -0.35 : 0;
    }

    // Blob shadow stays on the ground under the body when airborne.
    const gy = heightAt(this.position.x, this.position.z);
    const air = Math.max(0, this.position.y - gy);
    const ss = r * 2.4 * sxz * (1 / (1 + air * 0.6));
    this.shadow.position.set(this.position.x, gy + 0.03, this.position.z);
    this.shadow.scale.set(ss, 1, ss);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 1 / (1 + air);

    // Magma embers.
    if (this.v.emissiveCracks && Math.random() < dt * 8) {
      this.fx.add.spawn({ pos: this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * r, r * 0.5, (Math.random() - 0.5) * r)), vel: new THREE.Vector3(0, 1.2, 0), spread: 0.5, count: 1, life: [0.8, 1.6], size: [0.05, 0.01], color: 0xffb060, color2: 0xff2a00 });
    }
  }
}
