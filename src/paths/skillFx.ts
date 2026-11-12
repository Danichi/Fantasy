import * as THREE from 'three';
import type { FX } from '../fx/particles';
import { MagicCircles, type Style } from '../magic/circles';
import { physics } from '../physics/physics';
import { targets, hurtSegment, type Target } from '../combat/targets';
import { segmentPointDistance } from '../core/math';
import { STYLE_FX, Billboard, burstTex, slashTex, stillTex, vfxMaterial, setOpacity, setFrame, slashGeometry, type BurstKey } from '../fx/vfxSprites';

// Visual building blocks for class skills: projectiles (wind blades, spears,
// tornadoes, meteors), lingering zones, shield bubbles, pillars of light and
// lightning. Gameplay (what a hit does) is passed in as callbacks, so this
// file only moves things, detects contact and draws.

// Vivid on purpose: each school owns one saturated hue (cool) with a white-hot
// centre (hot), and an over-bright body colour that the bloom pass turns into glow.
export const PALETTE: Record<Style, { hot: number; cool: number; body: THREE.Color }> = {
  fire: { hot: 0xfff05a, cool: 0xff2a00, body: new THREE.Color(4.0, 1.1, 0.1) },
  light: { hot: 0xffffff, cool: 0xffc400, body: new THREE.Color(3.6, 2.9, 0.8) },
  // Gale reads electric blue-white and Cross (steel) crimson, after the combat reference boards.
  gale: { hot: 0xeaf4ff, cool: 0x2f7dff, body: new THREE.Color(0.45, 1.7, 4.6) },
  wind: { hot: 0xecffd8, cool: 0x2bff5e, body: new THREE.Color(0.7, 3.6, 0.8) },
  frost: { hot: 0xf2fbff, cool: 0x1e8cff, body: new THREE.Color(0.5, 2.1, 4.4) },
  steel: { hot: 0xffe4dc, cool: 0xff1e32, body: new THREE.Color(4.4, 0.45, 0.55) },
  shadow: { hot: 0xffd2ff, cool: 0xa21cff, body: new THREE.Color(2.6, 0.35, 4.4) },
  blood: { hot: 0xffd4d4, cool: 0xff0a2a, body: new THREE.Color(4.4, 0.2, 0.45) },
  void: { hot: 0xff9cff, cool: 0x5a10ff, body: new THREE.Color(1.8, 0.15, 4.6) },
  nature: { hot: 0xf4ffb0, cool: 0x00e04a, body: new THREE.Color(0.9, 4.0, 0.45) },
  // the classes update: stone, sea and storm
  earth: { hot: 0xffe2b0, cool: 0xb06a1e, body: new THREE.Color(3.2, 1.7, 0.5) },
  water: { hot: 0xe0fbff, cool: 0x10a8e8, body: new THREE.Color(0.2, 2.6, 4.0) },
  storm: { hot: 0xffffff, cool: 0x8a7aff, body: new THREE.Color(2.4, 2.4, 4.6) },
};

// Shared sprite textures (a soft glow and a four-point flare), drawn once.
let TEX: { glow: THREE.Texture; flare: THREE.Texture } | null = null;
function textures() {
  if (TEX) return TEX;
  const make = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    draw(c.getContext('2d')!);
    return new THREE.CanvasTexture(c);
  };
  const glowT = make((g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, 'rgba(255,255,255,0.65)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const flareT = make((g) => {
    g.translate(64, 64);
    const ray = (len: number, w: number, a: number) => {
      g.save();
      g.rotate(a);
      const gr = g.createLinearGradient(-len, 0, len, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(0, 0, len, w, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    ray(63, 4, 0);
    ray(63, 4, Math.PI / 2);
    ray(38, 2.5, Math.PI / 4);
    ray(38, 2.5, -Math.PI / 4);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 24);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-24, -24, 48, 48);
  });
  return (TEX = { glow: glowT, flare: flareT });
}
const sprite = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.renderOrder = 11;
  return s;
};
const BLUE_SCHOOLS = new Set<Style>(['gale', 'frost', 'water', 'storm']);
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

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
    edge: new THREE.RingGeometry(0.97, 1.02, 48, 1, -1.25, 2.5).rotateX(-Math.PI / 2),
    wall: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
    slashPaint: slashGeometry(),
  };

  constructor(private scene: THREE.Scene, readonly fx: FX) {
    this.circles = new MagicCircles(scene);
  }

  /** A school's saturated colour (particle tails). */
  color(style: Style) {
    return PALETTE[style].cool;
  }

  // ---- one-shot flourishes ---------------------------------------------------------
  /** Run `fn` after `delay` seconds of game time (staggered patterns). */
  later(delay: number, fn: () => void) {
    let done = false;
    this.addTimed(new THREE.Group(), delay, (_o, u) => {
      if (u >= 1 && !done) {
        done = true;
        fn();
      }
    });
  }

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
    const edge = new THREE.Mesh(this.geo.edge, glow(new THREE.Color(2.2, 2.2, 2.2), 1));
    edge.scale.setScalar(1.12);
    m.add(outer, core, edge);
    // The painted ribbon (when its texture has loaded) carries the look; the
    // procedural arcs drop to a faint underlay that keeps the hit readable.
    const ribbonTex = slashTex(STYLE_FX[style].slash);
    let ribbon: THREE.Mesh | null = null;
    if (ribbonTex) {
      ribbon = new THREE.Mesh(this.geo.slashPaint, vfxMaterial({ map: ribbonTex, gain: 2.2, occlude: 0.45 }));
      ribbon.renderOrder = 12;
      m.add(ribbon);
    }
    const under = ribbon ? 0.25 : 1;
    m.position.copy(pos);
    m.rotation.set(tilt, yaw - Math.PI / 2, 0, 'YXZ');
    m.scale.set(radius, 1, radius * spread);
    this.addTimed(m, ribbon ? 0.42 : 0.38, (o, u) => {
      o.scale.set(radius * (0.8 + u * 0.55), 1, radius * spread * (0.8 + u * 0.55));
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - u) * under;
      (core.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - u) * (1 - u) * under;
      (edge.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u * 2.2) * under;
      // Snap on at full strength, then thin out from the tail.
      if (ribbon) setOpacity(ribbon.material as THREE.Material, Math.min(1, u * 12) * Math.pow(1 - u, 1.4));
    });
    // Sparks flung off along the arc.
    const c = PALETTE[style];
    for (let i = 0; i < 7; i++) {
      const a = yaw + (i / 6 - 0.5) * 2.2;
      const dir = new THREE.Vector3(Math.sin(a), 0.15, Math.cos(a));
      this.fx.add.spawn({ pos: pos.clone().addScaledVector(dir, radius * 0.95), vel: dir.multiplyScalar(5), spread: 1.5, count: 3, life: [0.15, 0.35], size: [0.14, 0.01], color: c.hot, color2: c.cool, drag: 3 });
    }
  }

  /** Full-circle sweep (spins, novas). */
  spinSlash(pos: THREE.Vector3, radius: number, style: Style) {
    for (let i = 0; i < 3; i++) this.slash(pos.clone().setY(pos.y + 0.9 + i * 0.12), (i * Math.PI * 2) / 3 + Math.random(), radius, style, 1, (Math.random() - 0.5) * 0.6);
    this.fx.add.spawn({ pos: pos.clone().setY(pos.y + 1), spread: radius * 3, count: 40, life: [0.2, 0.45], size: [0.12, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool, drag: 4, jitter: 0.3 });
  }

  ring(pos: THREE.Vector3, style: Style, size: number) {
    this.circles.shockwave(pos.clone().setY(pos.y + 0.08), style, size);
  }

  /** A bright pop of light: a soft glow that swells and a white star flare that spins away. */
  flash(pos: THREE.Vector3, style: Style, size = 1) {
    const t = textures();
    const g = new THREE.Group();
    const soft = sprite(t.glow, PALETTE[style].body, 1);
    const star = sprite(t.flare, new THREE.Color(2.4, 2.4, 2.4), 1);
    g.add(soft, star);
    g.position.copy(pos);
    const rot = Math.random() * Math.PI;
    const s0 = Math.min(size, 3);
    this.addTimed(g, 0.3, (_o, u) => {
      soft.scale.setScalar(s0 * (0.7 + 1.5 * Math.sqrt(u)));
      soft.material.opacity = 0.85 * (1 - u) * (1 - u);
      star.scale.setScalar(s0 * (2.4 - 1.2 * u));
      star.material.rotation = rot + u * 1.2;
      star.material.opacity = Math.max(0, 1 - u * 1.8);
    });
  }

  /**
   * A painted, animated burst (fire blooming into smoke, ice shattering, lightning
   * crackling) that faces the camera at `pos`. Does nothing until its texture has loaded.
   */
  paintedBurst(pos: THREE.Vector3, key: BurstKey, size: number, life = 0.75, gain = 2) {
    const map = burstTex(key);
    if (!map) return false;
    const b = new Billboard(vfxMaterial({ map, grid: 4, gain, occlude: 0.55 }));
    b.position.copy(pos);
    b.roll = Math.random() * Math.PI * 2;
    b.scale.setScalar(size);
    this.addTimed(b, life, (o, u) => {
      const mat = (o as THREE.Mesh).material as THREE.Material;
      setFrame(mat, Math.min(15, u * 16));
      setOpacity(mat, Math.min(1, (1 - u) * 4));
      o.scale.setScalar(size * (0.92 + 0.16 * u));
    });
    return true;
  }

  /** Everything a spell does when it lands: flash, burst, shockwaves, sparks and rising embers. */
  impact(pos: THREE.Vector3, style: Style, size = 1) {
    const c = PALETTE[style];
    this.paintedBurst(pos, STYLE_FX[style].burst, 3.2 * size);
    this.flash(pos, style, 1.2 * size);
    this.fx.add.spawn({ pos, spread: 6 * size, count: Math.round(45 * size), life: [0.25, 0.6], size: [0.45 * size, 0.04], color: c.hot, color2: c.cool, drag: 3, jitter: 0.3 * size });
    this.fx.add.spawn({ pos, spread: 11 * size, count: Math.round(30 * size), life: [0.2, 0.5], size: [0.07, 0.01], color: 0xffffff, color2: c.cool, gravity: 9, drag: 1.5, upBias: 0.5 });
    this.fx.add.spawn({ pos, vel: new THREE.Vector3(0, 2.2, 0), spread: 1.6 * size, count: Math.round(14 * size), life: [0.6, 1.2], size: [0.12, 0.01], color: c.hot, color2: c.cool, drag: 1, jitter: 0.8 * size });
    this.ring(pos.clone().setY(pos.y - 0.6), style, 4.5 * size);
  }

  /** An exploding shell of light around `pos`: novas, war cries, ultimates. */
  nova(pos: THREE.Vector3, style: Style, radius: number) {
    const c = PALETTE[style];
    const wall = new THREE.Mesh(this.geo.pillar, glow(c.body.clone().multiplyScalar(0.4), 0.55));
    wall.position.copy(pos).setY(pos.y + 0.05);
    this.addTimed(wall, 0.45, (o, u) => {
      const s = radius * (0.15 + 0.9 * (1 - Math.pow(1 - u, 3)));
      o.scale.set(s, 1.3 * (1 - u * 0.6), s);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - u);
    });
    this.flash(pos.clone().setY(pos.y + 1), style, 1.1 + Math.min(radius, 8) * 0.12);
    // Painted pattern: a big bloom at the centre, then a ring of eruptions racing outward.
    const key = STYLE_FX[style].burst;
    if (this.paintedBurst(pos.clone().setY(pos.y + 1), key, Math.min(9, 2.2 + radius * 0.9), 0.8)) {
      const n = Math.max(6, Math.min(12, Math.round(radius * 1.8)));
      const turn = Math.random() * Math.PI * 2;
      for (let ring = 0; ring < 2; ring++) {
        const rr = radius * (ring === 0 ? 0.5 : 0.9);
        for (let i = 0; i < n; i++) {
          const a = turn + ((i + ring * 0.5) / n) * Math.PI * 2;
          const at = pos.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0.7, Math.sin(a) * rr));
          this.later(0.05 + ring * 0.09 + Math.random() * 0.03, () => this.paintedBurst(at, key, 1.3 + radius * 0.22, 0.6));
        }
      }
    }
    this.ring(pos, style, radius * 2.4);
    this.spinSlash(pos, radius * 0.8, style);
    // Jets thrown outward along the ground.
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.12, Math.sin(a));
      this.fx.add.spawn({ pos: pos.clone().setY(pos.y + 0.5), vel: dir.multiplyScalar(radius * 3.2), spread: 1, count: 2, life: [0.25, 0.45], size: [0.32, 0.02], color: c.hot, color2: c.cool, drag: 3 });
    }
  }

  /** A helix of motes climbing around `pos` (casting, buffs, summons). */
  spiral(pos: THREE.Vector3, style: Style, height = 2.4, radius = 0.9, count = 28) {
    const c = PALETTE[style];
    for (let i = 0; i < count; i++) {
      const k = i / count, a = k * Math.PI * 6;
      for (const s of [0, Math.PI]) {
        this.fx.add.spawn({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a + s) * radius * (1 - k * 0.4), k * height, Math.sin(a + s) * radius * (1 - k * 0.4))), vel: new THREE.Vector3(0, 1.4, 0), spread: 0.15, count: 1, life: [0.4, 0.8], size: [0.16, 0.01], color: c.hot, color2: c.cool, drag: 1 });
      }
    }
  }

  /** Motes rushing into the hand before a spell leaves it. */
  gather(at: THREE.Vector3, style: Style, size = 1) {
    const c = PALETTE[style];
    for (let i = 0; i < 18; i++) {
      const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(1.4 * size);
      this.fx.add.spawn({ pos: at.clone().add(off), vel: off.clone().multiplyScalar(-4), spread: 0.1, count: 1, life: [0.22, 0.28], size: [0.14, 0.03], color: c.hot, color2: c.cool });
    }
    this.flash(at, style, 0.6 * size);
  }

  /** A turning circle and rising motes that follow `anchor` for `life` seconds (buffs, auras). */
  aura(anchor: () => THREE.Vector3, style: Style, radius: number, life: number) {
    const c = PALETTE[style];
    this.circles.facing(() => ({ pos: anchor().clone().setY(anchor().y + 0.06), quat: FLAT }), style, radius * 2, life);
    this.addTimed(new THREE.Group(), life, (_o, u, dt) => {
      const p = anchor();
      const n = dt * 26;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.add.spawn({ pos: new THREE.Vector3(p.x + Math.cos(a) * radius, p.y + 0.1, p.z + Math.sin(a) * radius), vel: new THREE.Vector3(-Math.sin(a) * 1.2, 2.2, Math.cos(a) * 1.2), spread: 0.2, count: 1, life: [0.4, 0.7], size: [0.14 * (1 - u * 0.3), 0.01], color: c.hot, color2: c.cool });
      }
    });
  }

  groundCircle(pos: THREE.Vector3, style: Style, size: number, life: number) {
    this.circles.ground(pos, style, size, life);
  }

  burst(pos: THREE.Vector3, style: Style, amount = 1, spread = 5) {
    const c = PALETTE[style];
    this.paintedBurst(pos, STYLE_FX[style].burst, 1.4 + amount * 1.4, 0.6);
    this.flash(pos, style, 0.5 + amount * 0.6);
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
    const beamTex = stillTex('pillar');
    if (beamTex) {
      const beam = new Billboard(vfxMaterial({ map: beamTex, gain: 2.4, occlude: 0.3, tint: PALETTE[style].hot }));
      beam.upright = true;
      beam.position.copy(pos).setY(pos.y + height * 0.5);
      this.addTimed(beam, 0.9, (o, u) => {
        const w = radius * 3.2 * (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) * 0.6);
        o.scale.set(Math.max(0.01, w), height, 1);
        setOpacity((o as THREE.Mesh).material as THREE.Material, 1 - u);
      });
    }
    this.addTimed(m, 0.75, (o, u) => {
      const w = radius * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) * 0.8);
      o.scale.set(Math.max(0.01, w), height, Math.max(0.01, w));
      (outer.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - u);
      (core.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - u);
    });
    this.fx.add.spawn({ pos: pos.clone().setY(pos.y + 0.3), spread: radius * 3, count: 50, life: [0.3, 0.8], size: [0.2, 0.02], color: PALETTE[style].hot, color2: PALETTE[style].cool, upBias: 2.5, drag: 2, jitter: radius * 0.5 });
    this.ring(pos, style, radius * 4);
    this.flash(pos.clone().setY(pos.y + 0.6), style, radius * 2.2);
    this.flash(pos.clone().setY(pos.y + height * 0.8), style, radius * 1.4);
    this.spiral(pos, style, height * 0.7, radius * 1.2, 30);
  }

  /** Jagged bolt between two points. */
  lightning(a: THREE.Vector3, b: THREE.Vector3, style: Style, width = 1) {
    const g = new THREE.Group();
    const core = solid(0xffffff, 1);
    const aura = glow(PALETTE[style].body, 0.75);
    const up = new THREE.Vector3(0, 1, 0);
    const bolt = (from: THREE.Vector3, to: THREE.Vector3, n: number, jag: number, w: number, branch: boolean) => {
      let prev = from.clone();
      for (let i = 1; i <= n; i++) {
        const p = from.clone().lerp(to, i / n);
        if (i < n) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(jag));
        const d = p.clone().sub(prev);
        const len = d.length();
        if (len > 1e-3) {
          const q = new THREE.Quaternion().setFromUnitVectors(up, d.divideScalar(len));
          for (const [mat, k] of [[core, 1], [aura, 4.5]] as const) {
            const seg = new THREE.Mesh(this.geo.pillar, mat);
            seg.position.copy(prev);
            seg.quaternion.copy(q);
            seg.scale.set(w * k, len, w * k);
            g.add(seg);
          }
        }
        if (branch && i > 1 && i < n - 1 && Math.random() < 0.3) {
          const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.7, Math.random() - 0.5).multiplyScalar(2.2);
          bolt(p, p.clone().add(off), 3, jag * 0.6, w * 0.55, false);
        }
        prev = p;
      }
    };
    bolt(a, b, Math.max(6, Math.min(16, Math.round(a.distanceTo(b) * 1.2))), 0.7, 0.035 * width, true);
    this.addTimed(g, 0.3, (_o, u) => {
      const f = (1 - u) * (Math.random() < 0.25 ? 0.35 : 1);
      core.opacity = f;
      aura.opacity = 0.75 * f;
    });
    this.flash(a, style, 0.9);
    this.flash(b, style, 1.6);
    this.fx.add.spawn({ pos: b, spread: 5, count: 26, life: [0.15, 0.4], size: [0.12, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool, gravity: 6, drag: 2 });
  }

  /** A falling star that calls `land` when it hits the ground at `to`. */
  meteor(to: THREE.Vector3, style: Style, size: number, fall: number, land: () => void) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo.orb, solid(PALETTE[style].hot, 1));
    const halo = new THREE.Mesh(this.geo.sphere, glow(PALETTE[style].body.clone().multiplyScalar(0.4), 0.35));
    halo.scale.setScalar(1.3);
    const flare = sprite(textures().glow, PALETTE[style].body, 0.9);
    flare.scale.setScalar(4);
    g.add(core, halo, flare);
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
        this.impact(to, style, 1.4 * size);
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
    // The painted hex-lattice shield is blue (Boundary); other schools keep the plain glow.
    const shellTex = BLUE_SCHOOLS.has(style) ? stillTex('dome') : null;
    let shell: Billboard | null = null;
    if (shellTex) {
      shell = new Billboard(vfxMaterial({ map: shellTex, gain: 1.6, occlude: 0.15 }));
      this.scene.add(shell);
    }
    this.addTimed(m, 9999, (o, _u, dt) => {
      o.position.copy(anchor()).setY(anchor().y + 1);
      const s = (performance.now() - t0) / 1000;
      const k = 1 + Math.sin(s * 5.5) * 0.03;
      o.scale.setScalar(radius * k);
      if (shell) {
        shell.position.copy(o.position);
        shell.scale.setScalar(radius * 2.15 * k * Math.min(1, s * 6));
        shell.roll += dt * 0.15;
        setOpacity(shell.material as THREE.Material, Math.min(1, s * 5) * (0.75 + 0.25 * Math.sin(s * 3)));
      }
      if (!alive()) {
        (this.timed.find((t) => t.obj === o)!).t = 1e9;
        if (shell) this.scene.remove(shell);
      }
    });
    this.fx.add.spawn({ pos: anchor().clone().setY(anchor().y + 1), spread: 3, count: 40, life: [0.3, 0.6], size: [0.12, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool, jitter: radius * 0.8, drag: 2 });
  }

  /** A small floating light (Mote of Light) that bobs at `anchor` until `alive()` says otherwise. */
  orb(anchor: () => THREE.Vector3, style: Style, size: number, alive: () => boolean) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.geo.orb, solid(PALETTE[style].hot, 0.95)), new THREE.Mesh(this.geo.sphere, glow(PALETTE[style].body.clone().multiplyScalar(0.5), 0.45)));
    g.children[0].scale.setScalar(0.5);
    g.children[1].scale.setScalar(0.55);
    g.scale.setScalar(size);
    const t0 = performance.now();
    this.addTimed(g, 9999, (o) => {
      const s = (performance.now() - t0) / 1000;
      o.position.copy(anchor()).setY(anchor().y + Math.sin(s * 2) * 0.12);
      o.rotation.y += 0.02;
      if (Math.random() < 0.5) this.fx.add.spawn({ pos: o.position, spread: 0.5, count: 1, life: [0.4, 0.8], size: [0.1 * size, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool, upBias: 0.6, jitter: 0.2 * size });
      if (!alive()) (this.timed.find((t) => t.obj === o)!).t = 1e9;
    });
  }

  /** A taut beam between two moving points (tethers, chains) until `alive()` says otherwise. */
  beam(a: () => THREE.Vector3, b: () => THREE.Vector3, style: Style, alive: () => boolean, width = 0.05) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo.pillar, solid(PALETTE[style].hot, 0.85));
    const aura = new THREE.Mesh(this.geo.pillar, glow(PALETTE[style].body.clone().multiplyScalar(0.6), 0.5));
    core.scale.set(width, 1, width);
    aura.scale.set(width * 3, 1, width * 3);
    g.add(core, aura);
    const up = new THREE.Vector3(0, 1, 0);
    this.addTimed(g, 9999, (o) => {
      const pa = a(), pb = b();
      const d = pb.clone().sub(pa);
      const len = Math.max(0.01, d.length());
      o.position.copy(pa);
      o.quaternion.setFromUnitVectors(up, d.divideScalar(len));
      o.scale.set(1, len, 1);
      if (Math.random() < 0.4) this.fx.add.spawn({ pos: pa.clone().lerp(pb, Math.random()), spread: 0.3, count: 1, life: [0.2, 0.4], size: [0.08, 0.01], color: PALETTE[style].hot, color2: PALETTE[style].cool });
      if (!alive()) (this.timed.find((t) => t.obj === o)!).t = 1e9;
    });
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
    const halo = sprite(textures().glow, PALETTE[o.style].body.clone().multiplyScalar(0.5), 0.9);
    halo.scale.setScalar(o.shape === 'tornado' ? 3.2 : o.shape === 'spear' ? 1.6 : 2.4);
    if (o.shape === 'tornado') halo.position.y = 1.2;
    mesh.add(halo);
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
        // A comet tail: hot sparks at the head fading to the school's colour behind.
        this.fx.add.spawn({ pos: p.pos, spread: 0.6, count: p.shape === 'blade' ? 4 : 3, life: [0.18, 0.42], size: [0.3 * (p.size ?? 1), 0.02], color: c.hot, color2: c.cool, jitter: 0.3 * (p.size ?? 1) });
        this.fx.add.spawn({ pos: p.pos, vel: p.dir.clone().multiplyScalar(-2), spread: 0.4, count: 1, life: [0.3, 0.6], size: [0.5 * (p.size ?? 1), 0.05], color: c.cool, color2: c.cool, drag: 2, jitter: 0.2 });
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
        this.impact(p.pos, p.style, 0.55 * (p.size ?? 1));
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
