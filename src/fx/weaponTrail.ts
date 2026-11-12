import * as THREE from 'three';
import type { Player } from '../player/player';
import { stillTex } from './vfxSprites';

// A ribbon behind the blade through a swing (combat rework, phase 5): base
// and tip are sampled every frame of the blow and fade over a short time.
// Heavier and charged blows leave a brighter, longer trail. The ribbon is
// drawn with the painted streak texture (public/assets/fx/trail.webp): faint
// broken wisps at the old end, a razor-bright edge along the blade tip.

const VERT = /* glsl */ `
  attribute vec4 color;
  varying vec4 vColor;
  varying vec2 vUv;
  void main() {
    vColor = color;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uPainted;
  varying vec4 vColor;
  varying vec2 vUv;
  void main() {
    vec3 t = uPainted > 0.5 ? texture2D(uMap, vUv).rgb : vec3(1.0);
    float lum = max(t.r, max(t.g, t.b));
    // Painted: glow and a little occlusion so it reads on bright ground.
    vec3 col = vColor.rgb * t * vColor.a * (uPainted > 0.5 ? 2.4 : 1.0);
    gl_FragColor = vec4(col, uPainted > 0.5 ? smoothstep(0.05, 0.7, lum) * vColor.a * 0.5 : 0.0);
  }`;

const MAX = 24;

/**
 * Trail colour per weapon family, after the combat reference board: sword
 * electric blue, greatsword crimson, spear gold, axe fire orange, mace violet,
 * daggers emerald, staff arcane blue.
 */
const FAMILY_TINT: Record<string, [number, number, number]> = {
  sword: [0.55, 0.76, 1],
  greatsword: [1, 0.26, 0.2],
  spear: [1, 0.8, 0.36],
  axe: [1, 0.5, 0.16],
  mace: [0.72, 0.38, 1],
  dagger: [0.34, 1, 0.46],
  staff: [0.42, 0.62, 1],
};
const STEEL: [number, number, number] = [0.72, 0.84, 1];

export class WeaponTrail {
  private pts: { base: THREE.Vector3; tip: THREE.Vector3; age: number }[] = [];
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 2 * 3);
  private col = new Float32Array(MAX * 2 * 4);
  private uv = new Float32Array(MAX * 2 * 2);
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private life = 0.16;
  private tint: [number, number, number] = STEEL;

  constructor(scene: THREE.Scene, private player: Player) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    const idx: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: null }, uPainted: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  update(dt: number) {
    const p = this.player;
    const a = p.act;
    for (const q of this.pts) q.age += dt;
    const h = a?.def.hit;
    if (a && h && a.t >= h.from - 0.1 && a.t <= h.to + 0.05 && !a.def.sweep) {
      const m = p.equip?.model(h.hand);
      if (m && m.userData.bladeTip !== undefined) {
        const base = m.localToWorld(new THREE.Vector3(0, m.userData.bladeBase + (m.userData.bladeTip - m.userData.bladeBase) * 0.35, 0));
        const tip = m.localToWorld(new THREE.Vector3(0, m.userData.bladeTip, 0));
        const last = this.pts[this.pts.length - 1];
        if (!last || last.tip.distanceToSquared(tip) > 1e-4) this.pts.push({ base, tip, age: 0 });
        this.tint = FAMILY_TINT[p.equip?.inSlot(h.hand)?.def.kind ?? ''] ?? STEEL;
        this.life = 0.12 + (a.tier ?? 0) * 0.04 + (h.dmg > 1.5 ? 0.06 : 0);
      }
    }
    this.pts = this.pts.filter((q) => q.age < this.life).slice(-MAX);
    const n = this.pts.length;
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    const charged = (a?.tier ?? 0) >= 3 || a?.perfect;
    const map = stillTex('trail');
    const painted = !!map;
    if (painted && this.mat.uniforms.uMap.value !== map) {
      this.mat.uniforms.uMap.value = map;
      this.mat.uniforms.uPainted.value = 1;
    }
    // The weapon family's colour; a charged or perfect blow burns toward white-hot and lingers.
    const t = painted ? this.tint : ([0.85, 0.9, 1] as [number, number, number]);
    const hot = charged ? 0.45 : 0;
    const [r, g, b] = [t[0] + (1 - t[0]) * hot, t[1] + (1 - t[1]) * hot, t[2] + (1 - t[2]) * hot];
    // The painted streak carries its own falloff toward the base, so the base needs less fading.
    const baseA = painted ? (charged ? 0.8 : 0.6) : 0.15, tipA = painted ? (charged ? 1 : 0.85) : 0.55;
    for (let i = 0; i < MAX; i++) {
      const q = this.pts[Math.min(i, n - 1)];
      this.pos.set([q.base.x, q.base.y, q.base.z, q.tip.x, q.tip.y, q.tip.z], i * 6);
      const k = i / (n - 1);
      const f = i < n ? (1 - q.age / this.life) * k : 0;
      this.col.set([r, g, b, f * baseA, r, g, b, f * tipA], i * 8);
      this.uv.set([Math.min(1, k), 0, Math.min(1, k), 1], i * 4);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
}
