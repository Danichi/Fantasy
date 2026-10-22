import * as THREE from 'three';
import type { FX } from '../fx/particles';

// A rift into the Dark: a ragged vertical tear in the night, black at its
// heart, its edges burning violet and crawling. It opens slowly, pulls dust
// and leaves into itself, flares when something comes through, and closes
// again when the raid is over.

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform float uFlare;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return n(p) * 0.55 + n(p * 2.1 + 3.0) * 0.3 + n(p * 4.3 + 7.0) * 0.15; }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // A tall lens, its outline torn by noise that crawls upward.
  float ragged = (fbm(vec2(p.y * 3.0 - uTime * 0.6, uTime * 0.2)) - 0.5) * 0.35;
  float w = (1.0 - p.y * p.y) * 0.42 * uOpen + ragged * uOpen;
  float d = abs(p.x) - w;
  if (d > 0.18) discard;
  // Inside: near-black, slowly swirling, with faint violet motes.
  float swirl = fbm(vec2(p.x * 4.0 + sin(p.y * 3.0 + uTime) * 0.6, p.y * 2.0 - uTime * 0.4));
  vec3 inside = mix(vec3(0.01, 0.0, 0.03), vec3(0.12, 0.02, 0.22), swirl * swirl);
  // Edge: hot violet fading into white at the lip.
  float edge = smoothstep(0.18, 0.0, d) * smoothstep(-0.12, 0.0, d);
  vec3 rim = mix(vec3(0.45, 0.12, 0.95), vec3(0.95, 0.85, 1.0), smoothstep(0.03, 0.0, abs(d)));
  vec3 col = d < 0.0 ? inside : vec3(0.0);
  col += rim * edge * (1.6 + uFlare * 3.0);
  float a = d < 0.0 ? 1.0 : edge * 0.9;
  gl_FragColor = vec4(col, a * min(1.0, uOpen * 3.0));
}`;

export class Rift {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private open = 0;
  private closing = false;
  private flare = 0;
  private light: THREE.PointLight;
  private scorch: THREE.Mesh;
  gone = false;

  constructor(private scene: THREE.Scene, private fx: FX, readonly at: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uFlare: { value: 0 } },
    });
    // Two crossed sheets so it reads from every side.
    for (const r of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.2), this.mat);
      m.rotation.y = r;
      m.position.y = 2.1;
      m.renderOrder = 4;
      this.group.add(m);
    }
    this.light = new THREE.PointLight(0x8a3cff, 0, 16, 2);
    this.light.position.y = 2;
    this.group.add(this.light);
    const sm = new THREE.MeshBasicMaterial({ color: 0x0a0610, transparent: true, opacity: 0, depthWrite: false });
    this.scorch = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), sm);
    this.scorch.position.y = 0.05;
    this.group.add(this.scorch);
    this.group.position.copy(at);
    scene.add(this.group);
  }

  /** Something comes through: a flare and a burst. */
  surge() {
    this.flare = 1;
    this.fx.add.spawn({ pos: this.at.clone().setY(this.at.y + 1.8), spread: 1.5, count: 30, life: [0.4, 1.0], size: [0.2, 0.03], color: 0xb070ff, color2: 0x1a0630, upBias: 0.4, drag: 1.5 });
  }

  close() {
    this.closing = true;
  }

  update(dt: number) {
    if (this.gone) return;
    const u = this.mat.uniforms;
    u.uTime.value += dt;
    this.open = this.closing ? Math.max(0, this.open - dt * 0.5) : Math.min(1, this.open + dt * 0.25);
    this.flare = Math.max(0, this.flare - dt * 2);
    u.uOpen.value = this.open;
    u.uFlare.value = this.flare;
    this.light.intensity = (6 + Math.sin(u.uTime.value * 7) * 1.5 + this.flare * 20) * this.open;
    (this.scorch.material as THREE.MeshBasicMaterial).opacity = 0.6 * this.open;
    // Dust and motes drawn in toward the tear.
    if (this.open > 0.2 && Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3;
      const from = this.at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3 + Math.random() * 2.5, Math.sin(a) * r));
      const vel = this.at.clone().setY(this.at.y + 2).sub(from).multiplyScalar(0.8);
      this.fx.add.spawn({ pos: from, vel, spread: 0.1, count: 1, life: [0.8, 1.2], size: [0.08, 0.02], color: 0x9a60e0, color2: 0x200838, drag: 0.5 });
    }
    if (this.closing && this.open <= 0) {
      this.gone = true;
      this.scene.remove(this.group);
      this.light.dispose();
    }
  }
}
