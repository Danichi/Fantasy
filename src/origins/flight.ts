import * as THREE from 'three';
import { damp, clamp } from '../core/math';
import { heightAt } from '../world/terrain';
import type { Input } from '../core/input';
import type { ThirdPersonCamera } from '../player/camera';
import type { Origins } from './origins';

// Dragonkin flight (docs/design/origins.md §5). The player's kinematic
// controller keeps doing collisions and landings; while `player.flying` is set
// this module owns the velocity instead of gravity and walking:
//   Glide       hold jump (C) while falling: wings out, a slow sink, speed
//               builds where the camera looks
//   Wing Burst  press jump again while gliding: a flap that climbs 6 m (3 in a row)
//   True Flight hold jump in the air: fly where you look and steer, hover still
//   Dragon's Descent  attack while airborne: a dive that strikes where you land
// Draconic Energy pays for all of it and only comes back on the ground. No
// flight in dungeons, interiors, the Gravewood's curse or over the capital's
// walls; a ceiling of 120 m (40 m in a storm); landing fast rolls you.

export const ENERGY_MAX = 100;
const GLIDE_DRAIN = 3;
const FLY_DRAIN = 8;
const FLAP_COST = 20;
const DIVE_COST = 30;
const REGEN = 18;
const CEILING = 120;

export class Flight {
  energy = ENERGY_MAX;
  state: 'none' | 'glide' | 'fly' | 'dive' = 'none';
  /** wings 0 folded .. 1 spread, and the flap phase (radians), for charParts */
  spread = 0;
  flapPhase = 0;
  private flaps = 0;
  private climb = 0;
  private grace = 0;
  private heldT = 0;
  private airSpeed = 0;
  private diving = false;
  private landSpeed = 0;
  private lean = 0;
  private bar: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  /** the last reason flight was refused (tests, toasts) */
  refused: string | null = null;
  private toastT = 0;

  constructor(private o: Origins) {
    o.player.flight = (dt, input, cam) => this.step(dt, input, cam);
  }

  get active() {
    return this.state !== 'none';
  }
  private get p() {
    return this.o.player;
  }
  /** Which flight tiers are open (0 glide .. 3 descent). */
  private can(tier: number) {
    return this.o.origin === 'dragonkin' && this.o.legacy.open(tier);
  }

  reset() {
    this.state = 'none';
    this.energy = ENERGY_MAX;
    this.flaps = 0;
    this.climb = 0;
    this.diving = false;
    this.p.flying = false;
  }

  private stop() {
    if (this.state !== 'dive') this.state = 'none';
    this.climb = 0;
    this.p.flying = this.state === 'dive';
  }

  step(dt: number, input: Input, cam: ThirdPersonCamera) {
    const p = this.p;
    if (this.toastT > 0) this.toastT -= dt;
    // On the ground (or in water, or in the saddle): wings fold, energy returns.
    if (p.grounded || p.swimming || p.vehicle || p.mounted || p.dead) {
      if (this.state !== 'none' || this.diving) this.land();
      this.state = 'none';
      this.diving = false;
      p.flying = false;
      this.flaps = 0;
      this.heldT = 0;
      if (p.grounded || p.swimming) this.energy = Math.min(ENERGY_MAX, this.energy + REGEN * dt);
      this.landSpeed = 0;
      return;
    }
    this.landSpeed = Math.max(this.landSpeed, Math.hypot(p.vel.x, p.vel.z) * 0.6, -p.vel.y);
    if (!this.can(0)) return this.stop();
    const why = this.o.noFly();
    if (why) {
      if (this.state !== 'none' && this.toastT <= 0) {
        this.o.d.toast(why);
        this.toastT = 4;
      }
      this.refused = why;
      this.state = 'none';
      this.diving = false;
      p.flying = false;
      return;
    }
    this.refused = null;
    const held = input.held('jump');
    this.heldT = held ? this.heldT + dt : 0;
    const a = p.act;
    // Dragon's Descent: an air attack while on the wing becomes a dive.
    if (a?.def.air && this.state !== 'none' && this.state !== 'dive' && this.can(3) && this.energy >= DIVE_COST) {
      this.energy -= DIVE_COST;
      this.state = 'dive';
      this.diving = true;
      const t = p.lock?.alive ? p.lock : p.aimTarget(30);
      const to = t ? t.position.clone().sub(p.pos) : p.forward.multiplyScalar(10).setY(-(p.pos.y - heightAt(p.pos.x, p.pos.z)));
      const dir = to.normalize();
      dir.y = Math.min(dir.y, -0.45);
      p.vel.copy(dir.normalize().multiplyScalar(26));
    }
    if (this.state === 'dive') {
      p.flying = true;
      p.vel.y = Math.min(p.vel.y, -12);
      return;
    }
    if (a) return this.stop(); // anything else you do in the air, you do falling
    // Take wing: hold jump once the jump has stopped rising.
    if (this.state === 'none') {
      if (!held || p.vel.y > 2 || this.energy <= 4) return;
      this.state = this.can(2) && this.energy > 12 ? 'fly' : 'glide';
      this.airSpeed = Math.hypot(p.vel.x, p.vel.z);
      this.grace = 0;
    }
    // Letting go: a moment's grace (to flap again), then you fall.
    if (!held && this.climb <= 0) {
      this.grace += dt;
      if (this.grace > 0.3) return this.stop();
    } else if (held) this.grace = 0;
    if (this.state === 'fly' && !held) this.state = 'glide';
    if (this.state === 'glide' && held && this.can(2) && this.heldT > 0.25 && this.energy > 12 && this.climb <= 0) this.state = 'fly';
    // Wing Burst: press again while gliding.
    if (input.wasPressed('jump') && this.state === 'glide' && this.can(1) && this.flaps < 3 && this.energy >= FLAP_COST) {
      this.energy -= FLAP_COST;
      this.flaps++;
      this.climb = 6;
      this.flapPhase = 0;
    }
    p.flying = true;
    const ground = heightAt(p.pos.x, p.pos.z);
    const ceiling = ground + (this.o.d.storm() > 0.3 ? 40 : CEILING);
    const look = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    if (this.state === 'fly') {
      // True Flight: steer with WASD, climb or dive with the camera's pitch.
      const fast = input.held('sprint');
      this.energy = Math.max(0, this.energy - (FLY_DRAIN + (fast ? 6 : 0)) * dt);
      if (this.energy <= 0) this.state = 'glide';
      const want = p.moveIntent.clone().multiplyScalar(fast ? 17 : 11);
      p.vel.x = damp(p.vel.x, want.x, 2.2, dt);
      p.vel.z = damp(p.vel.z, want.z, 2.2, dt);
      const moving = p.moveIntent.lengthSq() > 0;
      const vy = moving ? clamp(-cam.pitch * 14, -14, 9) : 0;
      p.vel.y = damp(p.vel.y, vy, 3, dt);
    } else {
      // Glide: forward speed builds lift; looking down trades height for speed.
      this.energy = Math.max(0, this.energy - GLIDE_DRAIN * dt);
      const pitch = clamp(cam.pitch, -0.2, 1.2);
      const target = 10 + Math.max(0, pitch - 0.25) * 9;
      this.airSpeed = damp(this.airSpeed, target, 1.2, dt);
      const steer = p.moveIntent.lengthSq() > 0 ? p.moveIntent.clone().lerp(look, 0.3).normalize() : look;
      p.vel.x = damp(p.vel.x, steer.x * this.airSpeed, 2.5, dt);
      p.vel.z = damp(p.vel.z, steer.z * this.airSpeed, 2.5, dt);
      const sink = -1.9 - Math.max(0, pitch - 0.25) * 5;
      if (this.climb > 0) {
        p.vel.y = 9;
        this.climb -= 9 * dt;
      } else p.vel.y = damp(p.vel.y, this.energy > 0 ? sink : -7, 3, dt);
    }
    if (p.pos.y > ceiling && p.vel.y > 0) p.vel.y = Math.min(p.vel.y, (ceiling - p.pos.y) * 2);
  }

  private land() {
    const p = this.p;
    const fast = this.landSpeed > 9.5;
    if (this.diving) {
      // Dragon's Descent: the ground breaks around you.
      const rt = this.o.d.rt;
      rt.area(p.pos, 3.6, rt.weapon() * 1.8 + 20, { poise: 120, source: 'melee' });
      rt.vfx.ring(p.pos, 'fire', 8);
      this.o.d.fx.dust(p.pos, 3);
      this.o.d.cam.shake(0.4);
    } else if (fast && !p.swimming && p.grounded && !p.act) p.startSkill('roll', 1);
    this.lastLanding = { fast, dive: this.diving };
  }
  /** what the last landing was (tests) */
  lastLanding: { fast: boolean; dive: boolean } | null = null;

  /** Per frame: wings, the body's lean, the camera pulling back, the energy bar. */
  frame(dt: number) {
    const p = this.p, cam = this.o.d.cam;
    const on = this.state === 'glide' || this.state === 'fly';
    this.spread = damp(this.spread, on ? 1 : this.state === 'dive' ? 0.35 : 0, on ? 7 : 5, dt);
    const beat = this.climb > 0 ? 15 : this.state === 'fly' ? 8 + Math.hypot(p.vel.x, p.vel.z) * 0.2 : 0;
    this.flapPhase = beat ? this.flapPhase + beat * dt : damp(this.flapPhase, Math.round(this.flapPhase / (Math.PI * 2)) * Math.PI * 2 + 0.25, 3, dt);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.lean = damp(this.lean, on ? clamp(speed / 14, 0, 1) * 0.75 : this.state === 'dive' ? 1.1 : 0, 4, dt);
    if (this.lean > 0.01) p.char.visual.rotation.x += this.lean;
    cam.extra = damp(cam.extra, on || this.state === 'dive' ? 2.4 : 0, 2.5, dt);
    if (on && speed > 9 && Math.random() < dt * 20) {
      const s = p.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
      this.o.d.fx.add.spawn({ pos: s, vel: p.vel.clone().multiplyScalar(-0.4), spread: 0.2, count: 1, life: [0.2, 0.4], size: [0.05, 0.01], color: 0xffffff, color2: 0xcfe6ff, alpha: 0.5 });
    }
    this.meter();
  }

  /** Draconic Energy: a gold bar under stamina, dragonkin only. */
  private meter() {
    const show = this.o.origin === 'dragonkin';
    if (!this.bar && show) {
      const st = document.querySelector('#ui .vitals .bar.st');
      if (!st) return;
      const bar = document.createElement('div');
      bar.className = 'bar dr';
      bar.innerHTML = '<span class="label">DRACONIC</span><div class="fill" style="background:linear-gradient(180deg,#ffe28a,#e0a020 60%,#7a5208);transform-origin:left"></div><span class="num"></span>';
      bar.style.width = '180px';
      st.after(bar);
      this.bar = bar;
      this.fill = bar.querySelector('.fill');
    }
    if (!this.bar) return;
    this.bar.style.display = show ? '' : 'none';
    if (this.fill) this.fill.style.transform = `scaleX(${this.energy / ENERGY_MAX})`;
    (this.bar.querySelector('.num') as HTMLElement).textContent = `${Math.ceil(this.energy)} / ${ENERGY_MAX}`;
  }
}
