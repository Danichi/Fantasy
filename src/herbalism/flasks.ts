import * as THREE from 'three';
import { events } from '../core/events';
import { targets, type Target } from '../combat/targets';
import { afflictions } from '../combat/afflictions';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import { buildFlask } from '../items/brews';
import { fxAt, type BrewFx, type RecipeDef } from './recipes';
import { isUndead } from './kinds';
import type { BrewEffects, EffectsOwner } from './brewEffects';

// Thrown flasks: a glass ball lobbed in an arc at your target (or where you
// look), bursting on whatever it hits. Fire, frost, holy water, and clouds
// that linger: venom and blinding smoke. Contagion makes them bounce once;
// Deathcap scatters bomblets.

const G = 14;

interface Flying {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  bounced: boolean;
  r: RecipeDef;
  fx: BrewFx;
}
interface Cloud {
  pos: THREE.Vector3;
  r: number;
  left: number;
  acc: number;
  kind: 'venom' | 'smoke';
  hit: Set<number>;
  dps: number;
}

export class Flasks {
  private flying: Flying[] = [];
  private clouds: Cloud[] = [];
  private later: { t: number; fn: () => void }[] = [];

  constructor(private scene: THREE.Scene, private player: Player, private fx: FX, private effects: BrewEffects, private owner: EffectsOwner) {}

  /** Lob a flask. Returns why not, or null when thrown. */
  throw(r: RecipeDef, q: number): string | null {
    const p = this.player;
    if (p.dead) return 'You are dead';
    if (p.act) return 'busy';
    const start = p.center.addScaledVector(p.forward, 0.5).add(new THREE.Vector3(0, 0.5, 0));
    const t = p.lock?.alive ? p.lock : p.aimTarget(22);
    let aim: THREE.Vector3;
    if (t && t.center.distanceTo(start) < 26) aim = t.center.clone();
    else {
      const dir = p.aimDir.clone().setY(0);
      if (dir.lengthSq() < 1e-4) dir.copy(p.forward);
      dir.normalize();
      aim = p.pos.clone().addScaledVector(dir, 11);
    }
    const d = aim.distanceTo(start);
    const T = THREE.MathUtils.clamp(d / 13, 0.35, 1.2);
    const vel = aim.clone().sub(start).divideScalar(T).add(new THREE.Vector3(0, 0.5 * G * T, 0));
    const mesh = buildFlask('bomb', r.color, q);
    mesh.scale.setScalar(1.3);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.flying.push({ mesh, pos: start.clone(), vel, life: 3, bounced: false, r, fx: fxAt(r, q) });
    this.owner.signal('herb-throw');
    return null;
  }

  update(dt: number) {
    for (const f of [...this.flying]) {
      f.life -= dt;
      const prev = f.pos.clone();
      f.vel.y -= G * dt;
      f.pos.addScaledVector(f.vel, dt);
      f.mesh.position.copy(f.pos);
      f.mesh.rotation.x += dt * 9;
      f.mesh.rotation.z += dt * 6;
      if (Math.random() < dt * 30) this.fx.add.spawn({ pos: f.pos.clone().setY(f.pos.y + 0.3), spread: 0.3, count: 1, life: [0.15, 0.3], size: [0.07, 0.01], color: 0xffd080, color2: 0xff5000 });
      // Hit a foe?
      let hitFoe: Target | null = null;
      for (const t of targets) {
        if (t.alive && t.kind !== 'dummy' && t.center.distanceTo(f.pos) < t.radius + 0.45 + (t.halfHeight ?? 0) * 0.5) {
          hitFoe = t;
          break;
        }
      }
      if (hitFoe) {
        this.burst(f, f.pos.clone());
        continue;
      }
      // Hit the world?
      const seg = f.pos.clone().sub(prev);
      const len = seg.length();
      const d = len > 1e-4 ? physics.castRay(prev, seg.clone().normalize(), len + 0.12) : null;
      if (d !== null) {
        const at = prev.clone().addScaledVector(seg.normalize(), Math.max(0, d - 0.05));
        if (this.owner.perk('bounce') > 0 && !f.bounced) {
          f.bounced = true;
          f.pos.copy(at).add(new THREE.Vector3(0, 0.08, 0));
          f.vel.set(f.vel.x * 0.6, Math.abs(f.vel.y) * 0.45 + 1.5, f.vel.z * 0.6);
          f.life = Math.min(f.life, 1.2);
          this.fx.add.spawn({ pos: at, spread: 1.5, count: 8, life: [0.1, 0.3], size: [0.05, 0.01], color: 0xffffff, color2: 0xa0c0d0, gravity: 8 });
          continue;
        }
        this.burst(f, at);
        continue;
      }
      if (f.life <= 0) this.burst(f, f.pos.clone());
    }
    this.later = this.later.filter((l) => {
      l.t -= dt;
      if (l.t <= 0) l.fn();
      return l.t > 0;
    });
    this.tickClouds(dt);
  }

  private burst(f: Flying, at: THREE.Vector3) {
    this.scene.remove(f.mesh);
    this.flying.splice(this.flying.indexOf(f), 1);
    const area = 1 + this.owner.perk('bombArea');
    this.explode(f.r, f.fx, at, f.fx.radius! * area, 1);
    // Deathcap: two bomblets scatter and burst again.
    if (this.owner.perk('cluster') > 0) {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2, d = 1.6 + Math.random() * 1.2;
        const p2 = at.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
        this.later.push({ t: 0.25 + i * 0.15, fn: () => this.explode(f.r, f.fx, p2, f.fx.radius! * area * 0.6, 0.4) });
      }
    }
  }

  private explode(r: RecipeDef, f: BrewFx, at: THREE.Vector3, radius: number, k: number) {
    const color = r.color;
    // The burst itself.
    this.fx.add.spawn({ pos: at, spread: radius * 2.2, count: Math.round(40 * k + 10), life: [0.25, 0.6], size: [0.22, 0.03], color: 0xffffff, color2: color, upBias: 0.6, jitter: 0.4 });
    this.fx.add.spawn({ pos: at, spread: 3, count: 14, life: [0.15, 0.4], size: [0.05, 0.01], color: 0xe8f4ff, color2: 0x8aa0b0, gravity: 9 }); // glass
    if (f.burn) this.fx.add.spawn({ pos: at, spread: radius * 1.6, count: Math.round(30 * k), life: [0.4, 0.9], size: [0.35, 0.05], color: 0xffd080, color2: 0xff3000, upBias: 1.2, jitter: radius * 0.5 });
    if (f.freeze) this.fx.add.spawn({ pos: at, spread: radius * 1.4, count: Math.round(30 * k), life: [0.5, 1], size: [0.18, 0.03], color: 0xffffff, color2: 0x5fb4ff, jitter: radius * 0.6 });
    for (const t of [...targets]) {
      if (!t.alive || t.kind === 'dummy') continue;
      const dist = t.center.distanceTo(at) - t.radius;
      if (dist > radius) continue;
      const fall = 1 - 0.4 * Math.max(0, dist) / radius;
      let dmg = (f.dmg ?? 0) * fall * k;
      if (f.holy) dmg *= isUndead(t.kind) ? 1 : 0.25;
      const dir = t.position.clone().sub(at).setY(0);
      if (dir.lengthSq() < 1e-4) dir.copy(this.player.forward);
      dir.normalize();
      if (dmg > 0) {
        const d = Math.max(1, Math.round(dmg * (0.92 + Math.random() * 0.16)));
        t.takeHit({ damage: d, poise: (f.holy && isUndead(t.kind) ? 160 : 60) * k, dir, at: t.center.clone(), crit: false, source: 'spell' });
        events.emit('enemyHit', { at: t.center.clone(), amount: d, crit: false, enemyId: t.id });
      }
      if (!t.alive) continue;
      if (f.burn) afflictions.burn(t, f.burn, 4);
      if (f.freeze && k >= 1) afflictions.freeze(t);
      if (f.holy && isUndead(t.kind)) t.stunned = true;
    }
    if (f.cloud && k >= 1) this.clouds.push({ pos: at.clone(), r: radius, left: f.cloud, acc: 0, kind: 'venom', hit: new Set(), dps: Math.max(2, (f.dmg ?? 15) * 0.2) });
    if (f.smoke && k >= 1) this.clouds.push({ pos: at.clone(), r: radius, left: f.smoke, acc: 0, kind: 'smoke', hit: new Set(), dps: 0 });
    if (k >= 1) this.owner.signal('herb-bomb-burst');
  }

  private tickClouds(dt: number) {
    const p = this.player;
    for (const c of this.clouds) {
      c.left -= dt;
      c.acc += dt;
      const venom = c.kind === 'venom';
      // Billowing.
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * c.r;
        this.fx.alpha.spawn({ pos: c.pos.clone().add(new THREE.Vector3(Math.cos(a) * d, 0.3 + Math.random() * 1.2, Math.sin(a) * d)), vel: new THREE.Vector3(0, 0.25, 0), spread: 0.3, count: 1, life: [1.2, 2.2], size: [0.9, 1.6], color: venom ? 0x8ac04a : 0x9a9a9a, color2: venom ? 0x3a5a1a : 0x5a5a5a, alpha: venom ? 0.35 : 0.55, drag: 0.5 });
      }
      for (const t of targets) {
        if (!t.alive || t.kind === 'dummy' || t.position.distanceTo(c.pos) > c.r + t.radius) continue;
        if (!venom && !c.hit.has(t.id)) {
          // Blinded: they reel, open to a critical.
          c.hit.add(t.id);
          t.stunned = true;
          t.takeHit({ damage: 1, poise: 150, dir: t.position.clone().sub(c.pos).setY(0).normalize(), at: t.center.clone(), crit: false, source: 'spell' });
        }
      }
      if (venom && c.acc >= 0.5) {
        c.acc -= 0.5;
        for (const t of targets) if (t.alive && t.kind !== 'dummy' && t.position.distanceTo(c.pos) <= c.r + t.radius) this.effects.addVenom(t, 1, c.dps);
      }
      if (!venom && p.pos.distanceTo(c.pos) < c.r) this.effects.inSmoke = 0.3;
    }
    this.clouds = this.clouds.filter((c) => c.left > 0);
  }

  setVisible(v: boolean) {
    for (const f of this.flying) f.mesh.visible = v;
  }
  clear() {
    for (const f of this.flying) this.scene.remove(f.mesh);
    this.flying = [];
    this.clouds = [];
    this.later = [];
  }
}
