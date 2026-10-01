import * as THREE from 'three';
import { FX } from '../fx/particles';
import { heightAt } from '../world/terrain';
import { physics } from '../physics/physics';
import { targets, hurtSegment, type Target } from '../combat/targets';
import { segmentPointDistance } from '../core/math';
import { events } from '../core/events';
import { Q } from '../core/settings';
import type { Player } from '../player/player';
import { ITEMS } from '../items/itemDefs';
import { MagicCircles } from './circles';

// Spell effects: Fireball projectiles, Healing Light aura, potion sparkles.
// Dynamic lights come from a fixed pool created up front so adding a light
// never forces shader recompilation mid-fight.

class LightPool {
  private lights: THREE.PointLight[] = [];
  private owners: (object | null)[] = [];
  constructor(scene: THREE.Scene, n: number) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
      this.owners.push(null);
    }
  }
  acquire(owner: object) {
    const i = this.owners.indexOf(null);
    if (i < 0) return null;
    this.owners[i] = owner;
    return this.lights[i];
  }
  release(l: THREE.PointLight | null) {
    if (!l) return;
    const i = this.lights.indexOf(l);
    l.intensity = 0;
    this.owners[i] = null;
  }
}

const FIRE_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vP; varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const FIRE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vN; varying vec3 vP; varying vec3 vV;
  float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
  float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
  void main() {
    float f = n(vP * 7.0 + vec3(0.0, -uTime * 6.0, uTime * 2.0)) * 0.6 + n(vP * 15.0 - uTime * 4.0) * 0.4;
    float rim = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    vec3 hot = vec3(7.0, 5.0, 2.4);
    vec3 warm = vec3(5.0, 1.4, 0.25);
    vec3 col = mix(hot, warm, clamp(rim * 1.4 + f * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, 'rgba(255,220,160,0.7)');
  gr.addColorStop(0.5, 'rgba(255,120,40,0.18)');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface Fireball {
  group: THREE.Group;
  phase: number;
  vel: THREE.Vector3;
  life: number;
  target: Target | null;
  light: THREE.PointLight | null;
  damage: number;
  splash: number;
}

interface Flash {
  light: THREE.PointLight | null;
  t: number;
  dur: number;
  peak: number;
}

export class Spells {
  private balls: Fireball[] = [];
  private flashes: Flash[] = [];
  private lights: LightPool;
  private fireMat: THREE.ShaderMaterial;
  private glowMat: THREE.SpriteMaterial;
  private heal: { t: number; ring: THREE.Mesh } | null = null;
  private ringMat: THREE.MeshBasicMaterial;
  private time = 0;
  private circles: MagicCircles;
  private castSeen: object | null = null;

  /** Lend a pooled light to something else (building interiors). */
  borrowLight(owner: object) {
    return this.lights.acquire(owner);
  }

  returnLight(l: THREE.PointLight) {
    this.lights.release(l);
  }

  constructor(private scene: THREE.Scene, private fx: FX, private player: Player) {
    this.circles = new MagicCircles(scene);
    this.lights = new LightPool(scene, Math.max(1, Q.maxDynamicLights));
    this.fireMat = new THREE.ShaderMaterial({ vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG, uniforms: { uTime: { value: 0 } } });
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

    player.onSpell = (spell, from, dir, target) => {
      if (spell === 'fireball') this.castFireball(from, dir, target);
      else if (spell === 'healingLight') this.startHeal();
      else if (spell === 'potionHeal') this.sparkle(0xff5a5a);
      else if (spell === 'potionMana') this.sparkle(0x5aa8ff);
    };
  }

  castFireball(from: THREE.Vector3, dir: THREE.Vector3, target: Target | null, damage?: number, scale = 1, splash = 2.6) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 3), this.fireMat);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(1.3);
    group.add(core, glow);
    group.position.copy(from);
    this.scene.add(group);
    const light = this.lights.acquire(group);
    if (light) {
      light.color.set(0xff8a3a);
      light.intensity = 18;
      light.distance = 9;
    }
    this.balls.push({ phase: Math.random() * 6, group, vel: dir.clone().normalize().multiplyScalar(17), life: 3, target, light, splash, damage: damage ?? (ITEMS.fireball.stats.damage ?? 40) * this.player.paths.spellPower });
    group.scale.setScalar(scale);
    this.fx.add.spawn({ pos: from, spread: 3, count: 18, life: [0.15, 0.35], size: [0.15, 0.02], color: 0xffe0a0, color2: 0xff4000 });
  }

  private explode(fb: Fireball, at: THREE.Vector3, direct: Target | null) {
    this.scene.remove(fb.group);
    this.lights.release(fb.light);
    // Damage: full to a direct hit, splash with falloff around it.
    for (const t of targets) {
      if (!t.alive) continue;
      const d = t.center.distanceTo(at);
      const splash = fb.splash;
      if (t !== direct && d > splash + t.radius) continue;
      if (t !== direct && !physics.lineOfSight(at, t.center, t.radius * 0.5)) continue; // splash doesn't pass through walls
      const k = t === direct ? 1 : Math.max(0.25, 1 - d / (splash + t.radius));
      const dmg = Math.round(fb.damage * k * (0.9 + Math.random() * 0.2) * (t.stunned ? 2 : 1));
      const dir = t.position.clone().sub(at).setY(0);
      if (dir.lengthSq() < 1e-4) dir.copy(fb.vel).setY(0);
      dir.normalize();
      t.takeHit({ damage: dmg, poise: 60, dir, at: t.center.clone(), crit: false, source: 'spell' });
      events.emit('enemyHit', { at: t.center.clone(), amount: dmg, crit: false, enemyId: t.id });
    }
    const fx = this.fx;
    // Hot core flash, then a wide fire burst.
    fx.add.spawn({ pos: at, spread: 1.5, count: 14, life: [0.12, 0.22], size: [1.6, 0.6], color: 0xfff6d8, color2: 0xffa040, jitter: 0.2 });
    fx.add.spawn({ pos: at, spread: 7, count: 90, life: [0.25, 0.7], size: [0.7, 0.08], color: 0xffe0a0, color2: 0xff3000, drag: 3, jitter: 0.4 });
    fx.add.spawn({ pos: at, spread: 9, count: 40, life: [0.4, 1.1], size: [0.06, 0.01], color: 0xffd080, color2: 0xff2000, gravity: 9, drag: 1, upBias: 0.4 });
    fx.alpha.spawn({ pos: at.clone().setY(at.y + 0.4), spread: 1.4, count: 10, life: [1.0, 2.0], size: [0.5, 1.8], color: 0x6b625a, alpha: 0.28, drag: 2, upBias: 1.4, jitter: 0.8 });
    const light = this.lights.acquire({});
    if (light) {
      light.position.copy(at);
      light.color.set(0xff9a4a);
    }
    this.flashes.push({ light, t: 0, dur: 0.45, peak: 60 });
    this.circles.shockwave(at.clone().setY(Math.max(at.y - 0.3, heightAt(at.x, at.z) + 0.08)), 'fire', 6.5);
    events.emit('spellImpact', { at: at.clone(), spell: 'fireball' });
    const d = at.distanceTo(this.player.center);
    if (d < 12) this.player.onShake?.(0.35 * (1 - d / 12));
  }

  private startHeal() {
    this.circles.ground(this.player.pos, 'light', 3.2, 3.0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48).rotateX(-Math.PI / 2), this.ringMat.clone());
    this.scene.add(ring);
    if (this.heal) this.scene.remove(this.heal.ring);
    this.heal = { t: 0, ring };
    const light = this.lights.acquire({});
    if (light) {
      light.position.copy(this.player.center);
      light.color.set(0xffd98a);
    }
    this.flashes.push({ light, t: 0, dur: 1.6, peak: 14 });
  }

  private sparkle(color: number) {
    this.fx.add.spawn({ pos: this.player.center, spread: 1.5, count: 30, life: [0.5, 1.1], size: [0.08, 0.01], color, color2: 0xffffff, upBias: 1.2, jitter: 0.6, drag: 1.5 });
  }

  update(dt: number) {
    this.time += dt;
    this.fireMat.uniforms.uTime.value = this.time;
    const p = this.player;

    this.circles.update(dt);
    // Charging sparks gather at the blade tip while casting.
    const a = p.act;
    if (a && a !== this.castSeen && (a.def.id === 'castFireball' || a.def.id === 'castHeal')) {
      this.castSeen = a;
      const fire = a.def.id === 'castFireball';
      this.circles.ground(p.pos, fire ? 'fire' : 'light', fire ? 2.4 : 3.2, fire ? 1.1 : 1.6);
      if (fire) {
        // Upright circle in front of the caster's weapon hand, facing the target.
        const hand = p.char.bone('RightHand');
        this.circles.facing(() => {
          const pos = new THREE.Vector3();
          hand?.getWorldPosition(pos);
          const f = p.forward;
          pos.addScaledVector(f, 0.55).setY(pos.y + 0.1);
          const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), f);
          return { pos, quat };
        }, 'fire', 1.1, 0.9);
      }
    }
    if (!a) this.castSeen = null;
    if (a && a.def.id === 'castFireball' && !a.fired) {
      const main = p.equip.model('main');
      if (main) {
        const tip = main.localToWorld(new THREE.Vector3(0, main.userData.bladeTip ?? 0.5, 0));
        const off = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(0.9);
        this.fx.add.spawn({ pos: tip.clone().add(off), vel: off.multiplyScalar(-3), spread: 0.1, count: 2, life: [0.25, 0.3], size: [0.07, 0.01], color: 0xffd080, color2: 0xff5000 });
      }
    }
    if (a && a.def.id === 'castHeal' && !a.fired) {
      this.fx.add.spawn({ pos: p.center.clone().setY(p.pos.y + 1.9), spread: 0.6, count: 2, life: [0.4, 0.7], size: [0.06, 0.01], color: 0xfff2c0, color2: 0xffc050, gravity: 1 });
    }

    for (const fb of this.balls) {
      fb.life -= dt;
      // Gentle homing toward the locked target.
      if (fb.target?.alive) {
        const want = fb.target.center.clone().sub(fb.group.position).normalize();
        const cur = fb.vel.clone().normalize();
        const turned = cur.lerp(want, 1 - Math.exp(-3.2 * dt)).normalize();
        fb.vel.copy(turned.multiplyScalar(fb.vel.length()));
      }
      const from = fb.group.position.clone();
      const step = fb.vel.clone().multiplyScalar(dt);
      const to = from.clone().add(step);
      let hit: Target | null = null;
      for (const t of targets) {
        if (!t.alive) continue;
        const [ha, hb] = hurtSegment(t);
        if (segmentPointDistance(ha, hb, to) < t.radius + 0.22) {
          hit = t;
          break;
        }
      }
      const len = step.length();
      const wall = physics.castRay(from, step.clone().normalize(), len);
      const ground = to.y < heightAt(to.x, to.z) + 0.1;
      if (hit || wall !== null || ground || fb.life <= 0) {
        const at = wall !== null ? from.addScaledVector(step.normalize(), wall) : hit ? hit.center.clone().lerp(to, 0.5) : to;
        this.explode(fb, at, hit);
        fb.life = -99;
        continue;
      }
      fb.group.position.copy(to);
      fb.group.children[0].rotation.x += dt * 5;
      fb.group.children[0].rotation.y += dt * 7;
      if (fb.light) fb.light.position.copy(to);
      // Trail: flame puffs and embers.
      this.fx.add.spawn({ pos: to, vel: fb.vel.clone().multiplyScalar(-0.08), spread: 0.8, count: 4, life: [0.18, 0.4], size: [0.32, 0.04], color: 0xffc070, color2: 0xff2a00, jitter: 0.12 });
      // Two ember streams spiralling around the flight path.
      fb.phase += dt * 22;
      const fwd = fb.vel.clone().normalize();
      const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(side, fwd);
      for (const off of [0, Math.PI]) {
        const a = fb.phase + off;
        const p2 = to.clone().addScaledVector(side, Math.cos(a) * 0.28).addScaledVector(up, Math.sin(a) * 0.28);
        this.fx.add.spawn({ pos: p2, spread: 0.1, count: 1, life: [0.25, 0.45], size: [0.09, 0.01], color: 0xfff0b0, color2: 0xff6010 });
      }
      if (Math.random() < 0.5) this.fx.alpha.spawn({ pos: to, spread: 0.3, count: 1, life: [0.5, 0.9], size: [0.2, 0.5], color: 0x2d2622, alpha: 0.35, upBias: 1 });
    }
    this.balls = this.balls.filter((b) => b.life > -99);

    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.max(0, 1 - f.t / f.dur);
      if (f.light) {
        f.light.intensity = f.peak * k * k;
        f.light.distance = 12;
        if (this.heal && f.peak < 20) f.light.position.copy(p.center);
      }
    }
    for (const f of this.flashes.filter((f) => f.t >= f.dur)) this.lights.release(f.light);
    this.flashes = this.flashes.filter((f) => f.t < f.dur);

    if (this.heal) {
      const h = this.heal;
      h.t += dt;
      const k = h.t / 3;
      h.ring.position.set(p.pos.x, p.pos.y + 0.04, p.pos.z);
      h.ring.scale.setScalar(1 + Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * 0.6);
      (h.ring.material as THREE.MeshBasicMaterial).opacity = Math.min(1, h.t * 4) * Math.max(0, 1 - k) * 0.8;
      // Motes spiral up around the body.
      const ang = this.time * 6;
      for (let i = 0; i < 2; i++) {
        const a2 = ang + i * Math.PI;
        const pos = p.pos.clone().add(new THREE.Vector3(Math.cos(a2) * 0.55, 0.1 + ((h.t * 1.3 + i * 0.5) % 1.8), Math.sin(a2) * 0.55));
        this.fx.add.spawn({ pos, vel: new THREE.Vector3(0, 1.2, 0), spread: 0.2, count: 1, life: [0.6, 1], size: [0.09, 0.01], color: 0xfff4c8, color2: 0xffb040 });
      }
      if (h.t > 3) {
        this.scene.remove(h.ring);
        this.heal = null;
      }
    }
  }
}
