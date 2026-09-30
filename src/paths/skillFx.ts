import * as THREE from 'three';
import type { FX } from '../fx/particles';
import { MagicCircles, type Style } from '../magic/circles';
import { physics } from '../physics/physics';
import { targets, hurtSegment, type Target } from '../combat/targets';
import { segmentPointDistance } from '../core/math';

// Visual building blocks for class skills: projectiles (wind blades, spears,
// tornadoes, meteors), lingering zones, shield bubbles, pillars of light and
// lightning. Gameplay (what a hit does) is passed in as callbacks, so this
// file only moves things, detects contact and draws.

export const PALETTE: Record<Style, { hot: number; cool: number; body: THREE.Color }> = {
  fire: { hot: 0xfff1c8, cool: 0xff4a10, body: new THREE.Color(3.2, 1.2, 0.3) },
  light: { hot: 0xfff8e0, cool: 0xffc050, body: new THREE.Color(3.0, 2.5, 1.3) },
  gale: { hot: 0xe8fffb, cool: 0x2fc8b0, body: new THREE.Color(0.9, 2.8, 2.4) },
  wind: { hot: 0xf2ffe0, cool: 0x7ac050, body: new THREE.Color(1.6, 2.6, 1.1) },
  frost: { hot: 0xeef6ff, cool: 0x5a9cff, body: new THREE.Color(1.3, 2.0, 3.2) },
  steel: { hot: 0xffffff, cool: 0x8a9ab8, body: new THREE.Color(2.0, 2.1, 2.5) },
  shadow: { hot: 0xe8d8ff, cool: 0x7a3ad0, body: new THREE.Color(1.7, 0.9, 3.0) },
  blood: { hot: 0xffd0c0, cool: 0xc02010, body: new THREE.Color(3.0, 0.6, 0.4) },
};

const glow = (color: THREE.Color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
/** A normally blended core, so effects still read against bright daylight ground (additive alone washes out). */
const solid = (hex: number, opacity = 0.6) =>
  new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

export type ProjShape = 'blade' | 'spear' | 'tornado' | 'orb';

export interface ProjOpts {
  from: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  range: number;
  style: Style;
  shape: ProjShape;
  size?: number;
  /** keeps going through enemies */
  pierce?: boolean;
  /** hits the same enemy again after this many seconds (tornadoes) */
  rehit?: number;
  /** contact radius */
  radius?: number;
  onHit: (t: Target, at: THREE.Vector3, dir: THREE.Vector3) => void;
  onEnd?: (at: THREE.Vector3) => void;
}

interface Proj extends ProjOpts {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  travelled: number;
  hits: Map<number, number>;
  t: number;
  done: boolean;
}

export interface ZoneOpts {
  pos: THREE.Vector3;
  radius: number;
  life: number;
  style: Style;
  /** seconds between ticks */
  every: number;
  onTick: (z: Zone) => void;
  /** follow something (auras) */
  follow?: () => THREE.Vector3;
  /** particle density per second */
  motes?: number;
  circle?: boolean;
}
export interface Zone extends ZoneOpts {
  t: number;
  acc: number;
  done: boolean;
}

interface Timed {
  obj: THREE.Object3D;
  t: number;
  life: number;
  update: (o: THREE.Object3D, u: number, dt: number) => void;
}

export class SkillFx {
  readonly circles: MagicCircles;
  private projs: Proj[] = [];
  zones: Zone[] = [];
  private timed: Timed[] = [];
  private geo = {
    blade: new THREE.RingGeometry(0.55, 1.05, 40, 1, -1.1, 2.2).rotateX(-Math.PI / 2),
    bladeCore: new THREE.RingGeometry(0.74, 0.9, 40, 1, -0.95, 1.9).rotateX(-Math.PI / 2),
    spear: new THREE.CylinderGeometry(0.035, 0.07, 1.6, 8, 1).rotateX(Math.PI / 2),
    spearTip: new THREE.ConeGeometry(0.1, 0.4, 8).rotateX(Math.PI / 2).translate(0, 0, 0.95),
    tornado: new THREE.CylinderGeometry(1.0, 0.18, 2.6, 24, 6, true).translate(0, 1.3, 0),
    orb: new THREE.IcosahedronGeometry(0.5, 2),
    sphere: new THREE.SphereGeometry(1, 32, 20),
    pillar: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
    arc: new THREE.RingGeometry(0.6, 1.0, 40, 1, -1.2, 2.4).rotateX(-Math.PI / 2),
    wall: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
  };

  constructor(private scene: THREE.Scene, readonly fx: FX) {
    this.circles = new MagicCircles(scene);
  }

  // ---- one-shot flourishes ---------------------------------------------------------
  private addTimed(obj: THREE.Object3D, life: number, update: Timed['update']) {
    this.scene.add(obj);
    this.timed.push({ obj, t: 0, life, update });
  }

  /** A flat sweep of light around `pos` facing `yaw`: sword arcs and crescents. */
  slash(pos: THREE.Vector3, yaw: number, radius: number, style: Style, spread = 1, tilt = 0.55) {
    const m = new THREE.Group();
    const outer = new THREE.Mesh(this.geo.arc, glow(PALETTE[style].body, 0.9));
    const core = new THREE.Mesh(this.geo.bladeCore, solid(PALETTE[style].hot, 0.75));
    core.scale.setScalar(1.1);
    m.add(outer, core);
    m.position.copy(pos);
    m.rotation.set(tilt, yaw - Math.PI / 2, 0, 'YXZ');
    m.scale.set(radius, 1, radius * spread);
    this.addTimed(m, 0.36, (o, u) => {
      o.scale.set(radius * (0.8 + u * 0.5), 1, radius * spread * (0.8 + u * 0.5));
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
      (core.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u) * (1 - u);
    });
  }

  /** Full-circle sweep (spins, novas). */
  spinSlash(pos: THREE.Vector3, radius: number, style: Style) {
    for (let i = 0; i < 3; i++) this.slash(pos.clone().setY(pos.y + 0.9 + i * 0.12), (i * Math.PI * 2) / 3 + Math.random(), radius, style, 1, (Math.random() - 0.5) * 0.6);
    this.fx.add.spawn({ pos: pos.clone().setY(pos.y + 1), spread: radius * 3, count: 40, life: [0.2, 0.45], size: [0.12, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool, drag: 4, jitter: 0.3 });
  }

  ring(pos: THREE.Vector3, style: Style, size: number) {
    this.circles.shockwave(pos.clone().setY(pos.y + 0.08), style, size);
  }

  groundCircle(pos: THREE.Vector3, style: Style, size: number, life: number) {
    this.circles.ground(pos, style, size, life);
  }

  burst(pos: THREE.Vector3, style: Style, amount = 1, spread = 5) {
    const c = PALETTE[style];
    this.fx.add.spawn({ pos, spread, count: Math.round(55 * amount), life: [0.3, 0.7], size: [0.5, 0.05], color: c.hot, color2: c.cool, drag: 3, jitter: 0.3 });
    this.fx.add.spawn({ pos, spread: spread * 1.4, count: Math.round(20 * amount), life: [0.4, 0.9], size: [0.06, 0.01], color: c.hot, color2: c.cool, gravity: 6, drag: 1, upBias: 0.4 });
  }

  /** Column of light (smites, judgments). */
  pillar(pos: THREE.Vector3, style: Style, radius: number, height = 9) {
    const m = new THREE.Group();
    const outer = new THREE.Mesh(this.geo.pillar, glow(PALETTE[style].body, 0.85));
    const core = new THREE.Mesh(this.geo.pillar, solid(PALETTE[style].hot, 0.7));
    core.scale.set(0.45, 1, 0.45);
    m.add(outer, core);
    m.position.copy(pos);
    this.addTimed(m, 0.75, (o, u) => {
      const w = radius * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) * 0.8);
      o.scale.set(Math.max(0.01, w), height, Math.max(0.01, w));
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - u);
      (core.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - u);
    });
    this.fx.add.spawn({ pos: pos.clone().setY(pos.y + 0.3), spread: radius * 3, count: 50, life: [0.3, 0.8], size: [0.2, 0.02], color: PALETTE[style].hot, color2: PALETTE[style].cool, upBias: 2.5, drag: 2, jitter: radius * 0.5 });
    this.ring(pos, style, radius * 4);
  }

  /** Jagged bolt between two points. */
  lightning(a: THREE.Vector3, b: THREE.Vector3, style: Style) {
    const pts: THREE.Vector3[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5));
      pts.push(p);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE[style].body, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.addTimed(line, 0.22, (o, u) => (((o as THREE.Line).material as THREE.LineBasicMaterial).opacity = 1 - u));
    for (const p of pts) this.fx.add.spawn({ pos: p, spread: 1, count: 2, life: [0.1, 0.25], size: [0.12, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool });
  }

  /** A falling star that calls `land` when it hits the ground at `to`. */
  meteor(to: THREE.Vector3, style: Style, size: number, fall: number, land: () => void) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo.orb, solid(PALETTE[style].hot, 1));
    const halo = new THREE.Mesh(this.geo.sphere, glow(PALETTE[style].body.clone().multiplyScalar(0.4), 0.35));
    halo.scale.setScalar(1.3);
    g.add(core, halo);
    g.scale.setScalar(size);
    const from = to.clone().add(new THREE.Vector3(3, 18, -2));
    g.position.copy(from);
    let landed = false;
    this.addTimed(g, fall, (o, u) => {
      o.position.lerpVectors(from, to, u * u);
      o.rotation.x += 0.2;
      this.fx.add.spawn({ pos: o.position, spread: 1.5, count: 4, life: [0.3, 0.6], size: [0.6 * size, 0.05], color: PALETTE[style].hot, color2: PALETTE[style].cool, drag: 2, jitter: 0.3 * size });
      this.fx.alpha.spawn({ pos: o.position, spread: 0.5, count: 1, life: [0.8, 1.4], size: [0.6, 1.5], color: 0x4a403a, alpha: 0.3, drag: 2 });
      if (u > 0.97 && !landed) {
        landed = true;
        land();
      }
    });
  }

  /** A bubble that follows `anchor` until `alive()` says otherwise. */
  bubble(anchor: () => THREE.Vector3, style: Style, radius: number, alive: () => boolean) {
    const m = new THREE.Mesh(this.geo.sphere, glow(PALETTE[style].body.clone().multiplyScalar(0.35), 0.28));
    m.scale.setScalar(radius);
    m.renderOrder = 4;
    const t0 = performance.now();
    this.addTimed(m, 9999, (o) => {
      o.position.copy(anchor()).setY(anchor().y + 1);
      const k = 1 + Math.sin((performance.now() - t0) / 180) * 0.03;
      o.scale.setScalar(radius * k);
      if (!alive()) (this.timed.find((t) => t.obj === o)!).t = 1e9;
    });
    this.fx.add.spawn({ pos: anchor().clone().setY(anchor().y + 1), spread: 3, count: 40, life: [0.3, 0.6], size: [0.12, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool, jitter: radius * 0.8, drag: 2 });
  }

  /** A standing curtain (Wind Wall) that lives `life` seconds. */
  wall(pos: THREE.Vector3, yaw: number, width: number, height: number, style: Style, life: number) {
    const m = new THREE.Mesh(this.geo.wall, glow(PALETTE[style].body.clone().multiplyScalar(0.45), 0.3));
    m.position.copy(pos);
    m.rotation.y = yaw;
    m.scale.set(width, height, 1);
    this.addTimed(m, life, (o, u) => {
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 * Math.min(1, u * 8) * Math.min(1, (1 - u) * 6);
      const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const p = o.position.clone().addScaledVector(side, (Math.random() - 0.5) * width).setY(o.position.y + Math.random() * height);
      this.fx.add.spawn({ pos: p, vel: new THREE.Vector3(0, 2.5, 0), spread: 0.6, count: 2, life: [0.3, 0.6], size: [0.1, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool });
    });
  }

  // ---- projectiles ---------------------------------------------------------------------
  projectile(o: ProjOpts) {
    const size = o.size ?? 1;
    let mesh: THREE.Object3D;
    const body = PALETTE[o.style].body;
    if (o.shape === 'blade') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geo.blade, glow(body.clone().multiplyScalar(0.7), 0.7)), new THREE.Mesh(this.geo.bladeCore, solid(PALETTE[o.style].hot, 0.85)));
      mesh = g;
    } else if (o.shape === 'spear') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geo.spear, solid(PALETTE[o.style].hot, 0.9)), new THREE.Mesh(this.geo.spearTip, solid(PALETTE[o.style].hot, 0.9)));
      const aura = new THREE.Mesh(this.geo.spear, glow(body, 0.8));
      aura.scale.set(3, 3, 1.1);
      g.add(aura);
      mesh = g;
    } else if (o.shape === 'tornado') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geo.tornado, glow(body.clone().multiplyScalar(0.6), 0.55)), new THREE.Mesh(this.geo.tornado, solid(PALETTE[o.style].hot, 0.28)));
      g.children[1].scale.set(0.8, 1, 0.8);
      mesh = g;
    } else {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geo.orb, solid(PALETTE[o.style].hot, 0.95)), new THREE.Mesh(this.geo.sphere, glow(body, 0.5)));
      g.children[1].scale.setScalar(0.8);
      mesh = g;
    }
    mesh.scale.setScalar(size);
    const dir = o.dir.clone().normalize();
    mesh.position.copy(o.from);
    // Tilt the crescent diagonally so it reads from a camera behind the shoulder, not edge-on.
    if (o.shape === 'blade') mesh.rotation.set(0.95, Math.atan2(-dir.z, dir.x), 0, 'YXZ');
    else if (o.shape === 'spear') mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(mesh);
    this.projs.push({ ...o, dir, mesh, pos: o.from.clone(), travelled: 0, hits: new Map(), t: 0, done: false });
  }

  // ---- zones --------------------------------------------------------------------------------
  zone(o: ZoneOpts): Zone {
    const z: Zone = { ...o, t: 0, acc: 0, done: false };
    if (o.circle !== false && !o.follow) this.groundCircle(o.pos, o.style, o.radius * 2.2, o.life);
    this.zones.push(z);
    return z;
  }

  /** Enemies within `r` of `pos` (horizontal distance, generous vertically). */
  near(pos: THREE.Vector3, r: number): Target[] {
    const out: Target[] = [];
    for (const t of targets) {
      if (!t.alive) continue;
      const d = Math.hypot(t.position.x - pos.x, t.position.z - pos.z);
      if (d <= r + t.radius && Math.abs(t.center.y - pos.y - 0.8) < 3) out.push(t);
    }
    return out;
  }

  update(dt: number) {
    this.circles.update(dt);
    for (const t of this.timed) {
      t.t += dt;
      t.update(t.obj, Math.min(1, t.t / t.life), dt);
    }
    for (const t of this.timed.filter((t) => t.t >= t.life)) {
      this.scene.remove(t.obj);
      t.obj.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.());
    }
    this.timed = this.timed.filter((t) => t.t < t.life);

    for (const p of this.projs) {
      p.t += dt;
      const step = p.speed * dt;
      const prev = p.pos.clone();
      p.pos.addScaledVector(p.dir, step);
      p.travelled += step;
      p.mesh.position.copy(p.pos);
      const c = PALETTE[p.style];
      if (p.shape === 'tornado') {
        p.mesh.rotation.y += dt * 9;
        this.fx.add.spawn({ pos: p.pos.clone().setY(p.pos.y + Math.random() * 2.4), spread: 2, count: 3, life: [0.2, 0.5], size: [0.12, 0.01], color: c.hot, color2: c.cool, jitter: 0.6 });
        this.fx.alpha.spawn({ pos: p.pos, spread: 1.5, count: 1, life: [0.5, 0.9], size: [0.4, 1.0], color: 0x8a8070, alpha: 0.2, drag: 3, upBias: 0.8 });
      } else {
        this.fx.add.spawn({ pos: p.pos, spread: 0.6, count: p.shape === 'blade' ? 3 : 2, life: [0.12, 0.3], size: [0.22 * (p.size ?? 1), 0.02], color: c.hot, color2: c.cool, jitter: 0.3 * (p.size ?? 1) });
      }
      const r = p.radius ?? 0.8;
      for (const t of targets) {
        if (!t.alive) continue;
        const last = p.hits.get(t.id);
        if (last !== undefined && (p.rehit === undefined || p.t - last < p.rehit)) continue;
        const [ha, hb] = hurtSegment(t);
        const probe = p.shape === 'tornado' ? p.pos.clone().setY(t.center.y) : p.pos;
        if (segmentPointDistance(ha, hb, probe) < t.radius + r) {
          p.hits.set(t.id, p.t);
          p.onHit(t, t.center.clone(), p.dir.clone());
          if (!p.pierce && p.rehit === undefined) {
            p.done = true;
            break;
          }
        }
      }
      const wall = p.shape === 'tornado' ? null : physics.castRay(prev, p.dir, step);
      if (wall !== null || p.travelled >= p.range) p.done = true;
      if (p.done) {
        this.scene.remove(p.mesh);
        p.mesh.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.());
        this.burst(p.pos, p.style, 0.5, 3);
        p.onEnd?.(p.pos.clone());
      }
    }
    this.projs = this.projs.filter((p) => !p.done);

    for (const z of this.zones) {
      z.t += dt;
      z.acc += dt;
      if (z.follow) z.pos.copy(z.follow());
      const c = PALETTE[z.style];
      const motes = (z.motes ?? 30) * dt * z.radius;
      for (let i = 0; i < motes; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.radius;
        const p = z.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r));
        this.fx.add.spawn({ pos: p, vel: new THREE.Vector3(0, 1.4, 0), spread: 0.4, count: 1, life: [0.4, 0.9], size: [0.12, 0.01], color: c.hot, color2: c.cool });
      }
      while (z.acc >= z.every) {
        z.acc -= z.every;
        z.onTick(z);
      }
      if (z.t >= z.life) z.done = true;
    }
    this.zones = this.zones.filter((z) => !z.done);
  }
}
