import * as THREE from 'three';
import { Q } from '../core/settings';

// Pooled point-sprite particles simulated on the CPU, drawn in one call.
// Two pools: additive (sparks, fire, magic) and alpha-blended (dust, smoke).

export interface SpawnOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  spread?: number; // random velocity magnitude
  count?: number;
  life?: [number, number];
  size?: [number, number]; // start, end (metres)
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation; // fades toward this
  gravity?: number;
  drag?: number;
  alpha?: number;
  jitter?: number; // spawn position randomness
  upBias?: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  #include <fog_pars_vertex>
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  uniform float uSoft;
  #include <fog_pars_fragment>
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, uSoft, r);
    if (a <= 0.001) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    #include <fog_fragment>
  }
`;

class Pool {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private c1: Float32Array;
  private c2: Float32Array;
  private size: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private alpha: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;

  constructor(n: number, blending: THREE.Blending, soft: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.c1 = new Float32Array(n * 3);
    this.c2 = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 800 }, uSoft: { value: soft }, ...THREE.UniformsLib.fog },
      transparent: true,
      depthWrite: false,
      blending,
      fog: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setScale(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h;
  }

  spawn(o: SpawnOpts) {
    const count = Math.max(1, Math.round((o.count ?? 10) * Q.particleScale));
    const c1 = new THREE.Color(o.color ?? 0xffffff);
    const c2 = new THREE.Color(o.color2 ?? o.color ?? 0xffffff);
    const [l0, l1] = o.life ?? [0.4, 0.8];
    const [sa, sb] = o.size ?? [0.1, 0.02];
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const j = o.jitter ?? 0;
      this.pos[i * 3] = o.pos.x + (Math.random() - 0.5) * j;
      this.pos[i * 3 + 1] = o.pos.y + (Math.random() - 0.5) * j;
      this.pos[i * 3 + 2] = o.pos.z + (Math.random() - 0.5) * j;
      const s = o.spread ?? 1;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5 + (o.upBias ?? 0), Math.random() - 0.5).normalize();
      const sp = s * (0.35 + Math.random() * 0.65);
      this.vel[i * 3] = (o.vel?.x ?? 0) + dir.x * sp;
      this.vel[i * 3 + 1] = (o.vel?.y ?? 0) + dir.y * sp;
      this.vel[i * 3 + 2] = (o.vel?.z ?? 0) + dir.z * sp;
      this.c1.set([c1.r, c1.g, c1.b], i * 3);
      this.c2.set([c2.r, c2.g, c2.b], i * 3);
      this.maxLife[i] = this.life[i] = l0 + Math.random() * (l1 - l0);
      this.s0[i] = sa * (0.7 + Math.random() * 0.6);
      this.s1[i] = sb;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1;
      this.alpha[i] = o.alpha ?? 1;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      for (let c = 0; c < 3; c++) this.col[i * 4 + c] = this.c1[i * 3 + c] + (this.c2[i * 3 + c] - this.c1[i * 3 + c]) * t;
      // Fade in quickly, fade out over the last half.
      this.col[i * 4 + 3] = this.alpha[i] * Math.min(1, t * 8) * Math.min(1, (1 - t) * 2);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

/** Instanced jelly droplets with simple ground bounce. */
class Droplets {
  readonly mesh: THREE.InstancedMesh;
  private n = 160;
  private p: THREE.Vector3[] = [];
  private v: THREE.Vector3[] = [];
  private life: number[] = [];
  private s: number[] = [];
  private cursor = 0;
  private m = new THREE.Matrix4();
  private groundAt: (x: number, z: number) => number;

  constructor(groundAt: (x: number, z: number) => number) {
    this.groundAt = groundAt;
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.85, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, this.n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < this.n; i++) {
      this.p.push(new THREE.Vector3());
      this.v.push(new THREE.Vector3());
      this.life.push(0);
      this.s.push(0);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
  }

  burst(at: THREE.Vector3, color: THREE.Color, count: number, size: number, speed: number) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      this.p[i].copy(at).add(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * size * 0.5, (Math.random() - 0.5) * size));
      this.v[i].set((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.4, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.life[i] = 1.2 + Math.random() * 0.8;
      this.s[i] = size * (0.08 + Math.random() * 0.12);
      this.mesh.setColorAt(i, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = this.p[i], v = this.v[i];
      v.y -= 16 * dt;
      p.addScaledVector(v, dt);
      const g = this.groundAt(p.x, p.z);
      let sy = 1, sxz = 1;
      if (p.y < g + this.s[i] * 0.4) {
        p.y = g + this.s[i] * 0.4;
        v.y = Math.abs(v.y) * 0.25;
        v.x *= 0.6;
        v.z *= 0.6;
        sy = 0.45;
        sxz = 1.4;
      }
      const shrink = Math.min(1, this.life[i] / 0.4);
      const s = this.s[i] * shrink;
      this.m.makeScale(s * sxz, s * sy, s * sxz).setPosition(p);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class FX {
  readonly add: Pool;
  readonly alpha: Pool;
  readonly drops: Droplets;

  constructor(scene: THREE.Scene, groundAt: (x: number, z: number) => number) {
    this.add = new Pool(1800, THREE.AdditiveBlending, 0.0);
    this.alpha = new Pool(900, THREE.NormalBlending, 0.3);
    this.drops = new Droplets(groundAt);
    scene.add(this.add.points, this.alpha.points, this.drops.mesh);
  }

  update(dt: number, viewportHeight: number, fovDeg: number) {
    // Point size in pixels = size * (h / (2 tan(fov/2))) / depth.
    const k = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.setScale(k);
    this.alpha.setScale(k);
    this.add.update(dt);
    this.alpha.update(dt);
    this.drops.update(dt);
  }

  sparks(at: THREE.Vector3, dir?: THREE.Vector3) {
    this.add.spawn({ pos: at, vel: dir?.clone().multiplyScalar(2.5), spread: 6, count: 22, life: [0.15, 0.4], size: [0.05, 0.01], color: 0xfff1c8, color2: 0xff7a1a, gravity: 9, drag: 2 });
  }

  dust(at: THREE.Vector3, amount = 1) {
    this.alpha.spawn({ pos: at, spread: 1.2, count: 8 * amount, life: [0.5, 1.1], size: [0.25, 0.7], color: 0x9a8a72, alpha: 0.35, drag: 3, upBias: 0.6, jitter: 0.4 });
  }
}
