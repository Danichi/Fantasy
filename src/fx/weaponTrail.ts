import * as THREE from 'three';
import type { Player } from '../player/player';

// A ribbon behind the blade through a swing (combat rework, phase 5): base
// and tip are sampled every frame of the blow and fade over a short time.
// Heavier and charged blows leave a brighter, longer trail.

const MAX = 24;

export class WeaponTrail {
  private pts: { base: THREE.Vector3; tip: THREE.Vector3; age: number }[] = [];
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 2 * 3);
  private col = new Float32Array(MAX * 2 * 4);
  private mesh: THREE.Mesh;
  private life = 0.16;

  constructor(scene: THREE.Scene, private player: Player) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(this.geo, mat);
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
        this.life = 0.12 + (a.tier ?? 0) * 0.04 + (h.dmg > 1.5 ? 0.06 : 0);
      }
    }
    this.pts = this.pts.filter((q) => q.age < this.life).slice(-MAX);
    const n = this.pts.length;
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    const charged = (a?.tier ?? 0) >= 3 || a?.perfect;
    const [r, g, b] = charged ? [1, 0.78, 0.4] : [0.85, 0.9, 1];
    for (let i = 0; i < MAX; i++) {
      const q = this.pts[Math.min(i, n - 1)];
      this.pos.set([q.base.x, q.base.y, q.base.z, q.tip.x, q.tip.y, q.tip.z], i * 6);
      const f = i < n ? (1 - q.age / this.life) * (i / (n - 1)) : 0;
      this.col.set([r, g, b, f * 0.15, r, g, b, f * 0.55], i * 8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
}
