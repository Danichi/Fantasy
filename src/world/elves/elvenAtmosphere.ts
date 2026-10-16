import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { mulberry32 } from '../../core/math';
import { forestLayer, type Layer } from './elvenForestData';

// Light through leaves (docs/design/verdant-elves.md §10): what makes the
// elven woods glow. Streamed in 40 m cells round the camera, deterministic per
// cell so nothing pops when you turn round, and a handful of draw calls:
//   blossoms   pale emissive flowers in the undergrowth and hanging from
//              branches, thicker in each older layer, brightest after dusk
//   god rays   crossed shafts of light where the canopy opens, by day
//   mist       low sheets of mist in the hollows of the Inner Forest
//   fireflies  drifting sparks round you at night

const CELL = 40, RING = 3;
const PER: Record<Layer, { bloom: number; ray: number; mist: number }> = {
  outer: { bloom: 0, ray: 0, mist: 0 },
  inner: { bloom: 6, ray: 0.15, mist: 2 },
  ancient: { bloom: 10, ray: 0.4, mist: 1 },
  deep: { bloom: 14, ray: 0.35, mist: 1 },
};
const MAX_BLOOM = 800, MAX_RAY = 60, MAX_MIST = 110, FLIES = 160;

function soft(kind: 'ray' | 'mist') {
  const c = document.createElement('canvas');
  c.width = 64; c.height = kind === 'ray' ? 256 : 64;
  const g = c.getContext('2d')!;
  if (kind === 'ray') {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,248,220,0)');
    v.addColorStop(0.25, 'rgba(255,248,220,0.55)');
    v.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
  } else {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(230,240,255,0.9)');
    r.addColorStop(1, 'rgba(230,240,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ElvenAtmosphere {
  private blooms: THREE.InstancedMesh;
  private rays: THREE.InstancedMesh;
  private mist: THREE.InstancedMesh;
  private flies: THREE.Points;
  private flyBase = new Float32Array(FLIES * 3);
  private cell = '';
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private visible = true;
  private inForest = false;
  /** how many of each are placed right now (perf probes, tests) */
  counts = { blooms: 0, rays: 0, mist: 0 };

  constructor(scene: THREE.Scene) {
    const bloomMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0x9ad8ff, emissiveIntensity: 1, roughness: 0.5 });
    this.blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), bloomMat, MAX_BLOOM);
    this.blooms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BLOOM * 3), 3);
    const ray = new THREE.PlaneGeometry(5, 34).translate(0, 17, 0);
    const ray2 = ray.clone().rotateY(Math.PI / 2);
    const rays = new THREE.BufferGeometry();
    rays.setAttribute('position', new THREE.Float32BufferAttribute([...ray.attributes.position.array, ...ray2.attributes.position.array], 3));
    rays.setAttribute('uv', new THREE.Float32BufferAttribute([...ray.attributes.uv.array, ...ray2.attributes.uv.array], 2));
    const idx2 = [...ray.index!.array, ...ray2.index!.array.map((i) => i + ray.attributes.position.count)];
    rays.setIndex(idx2);
    this.rays = new THREE.InstancedMesh(rays, new THREE.MeshBasicMaterial({ map: soft('ray'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }), MAX_RAY);
    this.mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: soft('mist'), transparent: true, opacity: 0.22, depthWrite: false }), MAX_MIST);
    const fp = new THREE.BufferGeometry();
    fp.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
    this.flies = new THREE.Points(fp, new THREE.PointsMaterial({ color: 0xe8ff9a, size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const o of [this.blooms, this.rays, this.mist, this.flies]) {
      o.frustumCulled = false;
      o.renderOrder = 2;
      scene.add(o);
    }
    for (const im of [this.blooms, this.rays, this.mist]) im.count = 0;
  }

  update(dt: number, camera: THREE.Vector3, night: number, sun: THREE.Vector3) {
    this.t += dt;
    const ci = Math.floor(camera.x / CELL), cj = Math.floor(camera.z / CELL);
    const key = ci + ',' + cj;
    if (key !== this.cell) {
      this.cell = key;
      this.refill(ci, cj, sun);
    }
    const show = this.visible && this.inForest;
    this.blooms.visible = show;
    (this.blooms.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + night * 2.6;
    this.rays.visible = show && night < 0.6;
    (this.rays.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - night);
    this.mist.visible = show;
    (this.mist.material as THREE.MeshBasicMaterial).opacity = 0.16 + night * 0.1;
    this.flies.visible = show && night > 0.35;
    if (this.flies.visible) {
      const p = this.flies.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < FLIES; k++) {
        const bx = this.flyBase[k * 3], bz = this.flyBase[k * 3 + 2];
        const x = camera.x + bx + Math.sin(this.t * 0.4 + k) * 2.5, z = camera.z + bz + Math.cos(this.t * 0.33 + k * 1.7) * 2.5;
        p.setXYZ(k, x, heightAt(x, z) + 0.6 + this.flyBase[k * 3 + 1] + Math.sin(this.t * 0.9 + k * 0.7) * 0.4, z);
      }
      p.needsUpdate = true;
      (this.flies.material as THREE.PointsMaterial).opacity = 0.5 + 0.4 * Math.sin(this.t * 3);
    }
  }

  private refill(ci: number, cj: number, sun: THREE.Vector3) {
    let nb = 0, nr = 0, nm = 0;
    const col = new THREE.Color();
    // Shafts lean away from the sun.
    this.q.setFromEuler(new THREE.Euler(Math.atan2(sun.z, sun.y) * 0.4, 0, -Math.atan2(sun.x, sun.y) * 0.4));
    const s = new THREE.Vector3(), p = new THREE.Vector3();
    let forest = 0;
    for (let dj = -RING; dj <= RING; dj++) for (let di = -RING; di <= RING; di++) {
      const i = ci + di, j = cj + dj;
      const x0 = i * CELL, z0 = j * CELL;
      const layer = forestLayer(x0 + CELL / 2, z0 + CELL / 2);
      if (!layer) continue;
      forest++;
      const per = PER[layer];
      const r = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0);
      for (let k = 0; k < per.bloom && nb < MAX_BLOOM; k++) {
        const x = x0 + r() * CELL, z = z0 + r() * CELL;
        const high = r() < 0.3;
        p.set(x, heightAt(x, z) + (high ? 2.5 + r() * 3 : 0.25 + r() * 0.5), z);
        this.m.compose(p, this.q.clone().identity(), s.setScalar(0.7 + r() * 0.8));
        this.blooms.setMatrixAt(nb, this.m);
        this.blooms.setColorAt(nb, col.setHex(r() < 0.7 ? 0xeaf6ff : r() < 0.5 ? 0xffd8f0 : 0xd8ffe8));
        nb++;
      }
      if (r() < per.ray && nr < MAX_RAY) {
        const x = x0 + r() * CELL, z = z0 + r() * CELL;
        this.m.compose(p.set(x, heightAt(x, z) - 2, z), this.q, s.set(1, 1, 1));
        this.rays.setMatrixAt(nr++, this.m);
      }
      for (let k = 0; k < per.mist && nm < MAX_MIST; k++) {
        const x = x0 + r() * CELL, z = z0 + r() * CELL;
        const w = 14 + r() * 16;
        this.m.compose(p.set(x, heightAt(x, z) + 0.5 + r() * 0.6, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), s.set(w, 1, w * 0.7));
        this.mist.setMatrixAt(nm++, this.m);
      }
    }
    this.inForest = forest > 6;
    this.blooms.count = nb;
    this.rays.count = nr;
    this.mist.count = nm;
    for (const im of [this.blooms, this.rays, this.mist]) im.instanceMatrix.needsUpdate = true;
    if (this.blooms.instanceColor) this.blooms.instanceColor.needsUpdate = true;
    this.counts = { blooms: nb, rays: nr, mist: nm };
    const r = mulberry32(5);
    for (let k = 0; k < FLIES; k++) {
      const a = r() * Math.PI * 2, d = 3 + r() * 28;
      this.flyBase[k * 3] = Math.cos(a) * d;
      this.flyBase[k * 3 + 1] = r() * 2.4;
      this.flyBase[k * 3 + 2] = Math.sin(a) * d;
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!v) for (const o of [this.blooms, this.rays, this.mist, this.flies]) o.visible = false;
  }
}
