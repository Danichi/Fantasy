import * as THREE from 'three';
import { heightAt } from '../../world/terrainHeight';

// Ground telegraphs for the wilds' big attacks: a warning painted on the
// ground that fills from the attacker toward the edge as the wind-up runs, so
// the player can read where (and when) a pounce lands, a charge runs or a slam
// falls. Circles, rings, lines and cones; each shape's vertices are draped over
// the terrain so they don't vanish into a slope.

type Shape =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'ring'; x: number; z: number; r0: number; r1: number }
  | { kind: 'line'; x: number; z: number; yaw: number; len: number; width: number }
  | { kind: 'cone'; x: number; z: number; yaw: number; len: number; angle: number };

export interface Mark {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  hold: number;
}

const VERT = /* glsl */ `
  attribute float k;
  varying float vK;
  varying float vEdge;
  attribute float edge;
  void main() {
    vK = k;
    vEdge = edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform float uFill, uAlpha, uTime;
  uniform vec3 uColor;
  varying float vK;
  varying float vEdge;
  void main() {
    // A faint base, a bright filled part that sweeps outward, and a hot rim.
    float filled = step(vK, uFill);
    float rim = smoothstep(0.86, 1.0, vEdge);
    float front = smoothstep(0.06, 0.0, abs(vK - uFill)) * step(uFill, 0.999);
    float pulse = 0.85 + 0.15 * sin(uTime * 18.0);
    float a = (0.16 + filled * 0.34 + rim * 0.5 + front * 0.6) * uAlpha * pulse;
    gl_FragColor = vec4(uColor * (1.0 + front * 1.5 + rim * 0.6), a);
  }`;

/** Builds a draped mesh for a shape: `k` runs 0 at the source to 1 at the far edge; `edge` marks the outline. */
function buildShape(s: Shape) {
  const pos: number[] = [], k: number[] = [], edge: number[] = [], idx: number[] = [];
  const lift = 0.12;
  const put = (x: number, z: number, kk: number, e: number) => {
    pos.push(x, heightAt(x, z) + lift, z);
    k.push(kk);
    edge.push(e);
  };
  if (s.kind === 'circle' || s.kind === 'ring' || s.kind === 'cone') {
    const r0 = s.kind === 'ring' ? s.r0 : 0;
    const r1 = s.kind === 'ring' ? s.r1 : s.kind === 'circle' ? s.r : s.len;
    const a0 = s.kind === 'cone' ? s.yaw - s.angle / 2 : 0;
    const span = s.kind === 'cone' ? s.angle : Math.PI * 2;
    const segA = Math.max(10, Math.round((span * r1) / 0.9));
    const segR = Math.max(3, Math.round((r1 - r0) / 0.8));
    for (let j = 0; j <= segR; j++) {
      const t = j / segR;
      const r = r0 + (r1 - r0) * t;
      for (let i = 0; i <= segA; i++) {
        const a = a0 + (i / segA) * span;
        // (yaw convention: forward is (sin, cos))
        const edgeSide = s.kind === 'cone' ? Math.max(t, i === 0 || i === segA ? 1 : 0) : s.kind === 'ring' ? Math.max(t, 1 - t) : t;
        put(s.x + Math.sin(a) * r, s.z + Math.cos(a) * r, s.kind === 'ring' ? t : t, edgeSide);
      }
    }
    const row = segA + 1;
    for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  } else {
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), sx = fz, sz = -fx;
    const segL = Math.max(4, Math.round(s.len / 0.8)), segW = 3;
    for (let j = 0; j <= segL; j++) {
      const t = j / segL;
      for (let i = 0; i <= segW; i++) {
        const u = i / segW - 0.5;
        const x = s.x + fx * s.len * t + sx * u * s.width, z = s.z + fz * s.len * t + sz * u * s.width;
        put(x, z, t, Math.max(Math.abs(u) * 2, t > 0.97 ? 1 : 0));
      }
    }
    const row = segW + 1;
    for (let j = 0; j < segL; j++) for (let i = 0; i < segW; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('k', new THREE.Float32BufferAttribute(k, 1));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** All the ground warnings in play (one per scene). */
export class Telegraphs {
  private marks: Mark[] = [];
  private time = 0;
  constructor(private scene: THREE.Scene) {}

  private add(shape: Shape, dur: number, color: number, hold: number) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uFill: { value: 0 }, uAlpha: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    });
    const mesh = new THREE.Mesh(buildShape(shape), mat);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const m: Mark = { mesh, mat, t: 0, dur: Math.max(0.05, dur), hold };
    this.marks.push(m);
    return m;
  }

  /** A disc that fills from its centre (a pounce's landing, a slam). */
  circle(x: number, z: number, r: number, dur: number, color = 0xff5a2a, hold = 0.15) {
    return this.add({ kind: 'circle', x, z, r }, dur, color, hold);
  }
  /** A ring between two radii (a shockwave you must roll through or stand clear of). */
  ring(x: number, z: number, r0: number, r1: number, dur: number, color = 0xff5a2a, hold = 0.15) {
    return this.add({ kind: 'ring', x, z, r0, r1 }, dur, color, hold);
  }
  /** A lane from (x, z) along yaw (a charge, a root eruption). */
  line(x: number, z: number, yaw: number, len: number, width: number, dur: number, color = 0xff5a2a, hold = 0.15) {
    return this.add({ kind: 'line', x, z, yaw, len, width }, dur, color, hold);
  }
  /** A wedge in front of the attacker (a sweep, a breath). */
  cone(x: number, z: number, yaw: number, len: number, angle: number, dur: number, color = 0xff5a2a, hold = 0.15) {
    return this.add({ kind: 'cone', x, z, yaw, len, angle }, dur, color, hold);
  }

  /** Cancel a warning early (the attacker was staggered). */
  cancel(m: Mark | null | undefined) {
    if (!m) return;
    m.t = m.dur + m.hold;
  }

  update(dt: number) {
    this.time += dt;
    for (const m of this.marks) {
      m.t += dt;
      const fill = Math.min(1, m.t / m.dur);
      const fade = m.t > m.dur ? 1 - Math.min(1, (m.t - m.dur) / Math.max(0.05, m.hold)) : Math.min(1, m.t / 0.12);
      m.mat.uniforms.uFill.value = fill;
      m.mat.uniforms.uAlpha.value = fade;
      m.mat.uniforms.uTime.value = this.time;
    }
    const done = this.marks.filter((m) => m.t >= m.dur + m.hold);
    for (const m of done) {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mat.dispose();
    }
    if (done.length) this.marks = this.marks.filter((m) => m.t < m.dur + m.hold);
  }

  clear() {
    for (const m of this.marks) {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mat.dispose();
    }
    this.marks = [];
  }

  setVisible(v: boolean) {
    for (const m of this.marks) m.mesh.visible = v;
  }
}

export type Telegraph = Mark;
