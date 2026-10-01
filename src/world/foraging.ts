import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, riverX, roadDist, TOWN_R, PORT_AURELLE } from './terrainHeight';
import { reliefAt, RELIEF, SEA_LEVEL } from './worldMap';
import { HERB_MODELS } from '../items/herbs';
import { ITEMS } from '../items/itemDefs';
import { mulberry32 } from '../core/math';
import type { Interactable } from '../dungeon/instance';

// Foraging (World Expansion phase 4): herbs, mushrooms, berries and roots
// scattered deterministically per 256 m tile by terrain (meadow, forest,
// riverbank, hillside), plus the roadside patches along the King's Road.
// Picked nodes come back after some game hours; Duskbloom only shows at night.
// One instanced mesh per herb keeps it to a dozen draw calls.

interface HerbDef {
  item: string;
  /** game hours to regrow */
  regrow: number;
  /** yield range */
  n: [number, number];
  night?: boolean;
}

export const FORAGE: Record<string, HerbDef> = {
  sungrass: { item: 'sungrass', regrow: 6, n: [1, 2] },
  moongrass: { item: 'moongrass', regrow: 10, n: [1, 1] },
  wildmint: { item: 'wildmint', regrow: 6, n: [1, 2] },
  ironleaf: { item: 'ironleaf', regrow: 10, n: [1, 1] },
  redcap: { item: 'redcap', regrow: 12, n: [1, 3] },
  brambleBerries: { item: 'brambleBerries', regrow: 18, n: [2, 4] },
  silverthistle: { item: 'silverthistle', regrow: 14, n: [1, 1] },
  duskbloom: { item: 'duskbloom', regrow: 24, n: [1, 1], night: true },
  riverReed: { item: 'riverReed', regrow: 8, n: [2, 3] },
  honeycomb: { item: 'honeycomb', regrow: 30, n: [1, 1] },
  wildGarlic: { item: 'wildGarlic', regrow: 10, n: [1, 3] },
  emberroot: { item: 'emberroot', regrow: 16, n: [1, 1] },
};
type HerbId = keyof typeof FORAGE;

interface Node {
  id: string;
  herb: HerbId;
  pos: THREE.Vector3;
  yaw: number;
  tile: number;
}

const T = 256;
const MAX_PER_HERB = 96;
/** Fixed patches along the King's Road (as they were before phase 4, plus new finds). */
const ROADSIDE: [HerbId, number, number][] = [
  ['sungrass', 132, 18], ['wildmint', 151, 30], ['moongrass', 178, 8], ['sungrass', 290, 70],
  ['ironleaf', 480, 104], ['wildmint', 640, 118], ['moongrass', 790, 96], ['sungrass', 960, 136],
  ['ironleaf', 1130, 108], ['wildmint', 1300, 132], ['moongrass', 1470, 110], ['sungrass', 1620, 140],
  ['ironleaf', 1790, 124], ['wildmint', 1950, 162], ['moongrass', 2120, 138], ['sungrass', 2300, 166],
  ['ironleaf', 2450, 136], ['wildmint', 2560, 164], ['brambleBerries', 560, 102], ['wildGarlic', 880, 138],
  ['brambleBerries', 1210, 104], ['silverthistle', 1560, 142], ['brambleBerries', 1880, 118], ['emberroot', 2250, 134],
];

export class Foraging {
  private nodes = new Map<string, Node>();
  private tiles = new Set<number>();
  /** node id -> game hour it was picked */
  private picked = new Map<string, number>();
  private meshes = new Map<HerbId, THREE.InstancedMesh>();
  private dirty = true;
  private near: Node | null = null;
  readonly interactable: Interactable & { update(p: THREE.Vector3, hours: number): void };
  onGather?: (herb: string, n: number) => void;

  constructor(scene: THREE.Scene, private give: (id: string, n: number) => void, private hours: () => number, private hour: () => number) {
    // One instanced mesh per herb, built from its painted model (colours baked to vertices).
    for (const herb of Object.keys(FORAGE) as HerbId[]) {
      const model = HERB_MODELS[herb]();
      model.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      let glow = false;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.emissiveIntensity > 0.3) glow = true;
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        const c = mat.color.clone().lerp(mat.emissive, mat.emissiveIntensity * 0.4);
        const col = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
      });
      const geo = mergeGeometries(parts, false)!;
      geo.scale(1.7, 1.7, 1.7);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: glow ? 0.18 : 0 });
      if (glow) (mat as THREE.MeshStandardMaterial & { userData: Record<string, unknown> }).userData.styleSoftness = 0;
      const im = new THREE.InstancedMesh(geo, mat, MAX_PER_HERB);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      scene.add(im);
      this.meshes.set(herb, im);
    }
    ROADSIDE.forEach(([herb, x, z], i) => this.addNode({ id: 'road:' + i, herb, pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: i * 1.3, tile: -1 }));
    const self = this;
    const pos = new THREE.Vector3(0, -999, 0);
    this.interactable = {
      pos, radius: 1.7,
      label: () => (self.near ? `Gather ${ITEMS[FORAGE[self.near.herb].item].name}` : ''),
      enabled: () => !!self.near,
      action: () => self.gather(),
      update(p: THREE.Vector3) {
        self.near = null;
        let best = 2.2;
        for (const n of self.nodes.values()) {
          if (Math.abs(n.pos.x - p.x) > 3 || Math.abs(n.pos.z - p.z) > 3) continue;
          if (!self.available(n)) continue;
          const d = n.pos.distanceTo(p);
          if (d < best) (best = d), (self.near = n);
        }
        if (self.near) pos.copy(self.near.pos);
        else pos.set(0, -999, 0);
      },
    };
  }

  private addNode(n: Node) {
    this.nodes.set(n.id, n);
    this.dirty = true;
  }

  private available(n: Node) {
    const t = this.picked.get(n.id);
    if (t !== undefined && this.hours() - t < FORAGE[n.herb].regrow) return false;
    if (FORAGE[n.herb].night) {
      const h = this.hour();
      if (!(h >= 20 || h < 5)) return false;
    }
    return true;
  }

  private gather() {
    const n = this.near;
    if (!n) return;
    const def = FORAGE[n.herb];
    const k = def.n[0] + ((n.id.length + Math.floor(this.hours())) % (def.n[1] - def.n[0] + 1));
    this.picked.set(n.id, this.hours());
    this.give(def.item, k);
    this.onGather?.(n.herb, k);
    this.dirty = true;
  }

  /** What grows here (null for nothing): by terrain, river and height. */
  private pick(x: number, z: number, r: number): HerbId | null {
    const h = heightAt(x, z);
    if (h < SEA_LEVEL + 0.8) return null;
    if (Math.hypot(x, z) < TOWN_R + 10 || roadDist(x, z) < 4) return null;
    if (Math.hypot(x - PORT_AURELLE.x, z - PORT_AURELLE.y) < 180) return null;
    const dr = Math.abs(x - riverX(z));
    if (dr > 5 && dr < 14 && Math.abs(z) < 420) return r < 0.55 ? 'riverReed' : 'moongrass';
    const rel = reliefAt(x, z);
    if (rel === RELIEF.forest) return r < 0.35 ? 'redcap' : r < 0.55 ? 'honeycomb' : r < 0.75 ? 'wildGarlic' : r < 0.87 ? 'duskbloom' : 'ironleaf';
    if (rel === RELIEF.mountain || h > 14) return r < 0.5 ? 'emberroot' : r < 0.8 ? 'silverthistle' : 'ironleaf';
    if (rel === RELIEF.marsh) return r < 0.6 ? 'riverReed' : 'moongrass';
    if (rel === RELIEF.open || rel === RELIEF.beach || rel === RELIEF.shore) return r < 0.28 ? 'sungrass' : r < 0.48 ? 'wildmint' : r < 0.66 ? 'brambleBerries' : r < 0.8 ? 'wildGarlic' : r < 0.9 ? 'silverthistle' : 'duskbloom';
    return null;
  }

  private stream(p: THREE.Vector3) {
    const ci = Math.floor(p.x / T), cj = Math.floor(p.z / T);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const key = (i + 2048) * 4096 + (j + 2048);
      if (this.tiles.has(key)) continue;
      this.tiles.add(key);
      const rnd = mulberry32(((i * 73856093) ^ (j * 19349663)) >>> 0);
      const count = 5 + Math.floor(rnd() * 5);
      for (let k = 0; k < count; k++) {
        const x = i * T + rnd() * T, z = j * T + rnd() * T;
        const herb = this.pick(x, z, rnd());
        if (!herb) continue;
        // Herbs grow in little clusters.
        const cl = herb === 'honeycomb' || herb === 'duskbloom' ? 1 : 1 + Math.floor(rnd() * 3);
        for (let c = 0; c < cl; c++) {
          const px = x + (rnd() - 0.5) * 6, pz = z + (rnd() - 0.5) * 6;
          this.addNode({ id: `${i},${j},${k},${c}`, herb, pos: new THREE.Vector3(px, heightAt(px, pz) + (herb === 'honeycomb' ? 1.4 : 0), pz), yaw: rnd() * 6.28, tile: key });
        }
      }
    }
    for (const key of [...this.tiles]) {
      const i = Math.floor(key / 4096) - 2048, j = (key % 4096) - 2048;
      if (Math.abs(i - ci) <= 2 && Math.abs(j - cj) <= 2) continue;
      this.tiles.delete(key);
      for (const [id, n] of this.nodes) if (n.tile === key) this.nodes.delete(id);
      this.dirty = true;
    }
  }

  private tick = 0;
  update(dt: number, p: THREE.Vector3) {
    this.tick += dt;
    if (this.tick > 1) {
      this.tick = 0;
      this.stream(p);
      this.dirty = true; // regrowth and night flowers change with the clock
    }
    this.interactable.update(p, this.hours());
    if (!this.dirty) return;
    this.dirty = false;
    const counts = new Map<HerbId, number>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const n of this.nodes.values()) {
      if (!this.available(n)) continue;
      if (Math.abs(n.pos.x - p.x) > 160 || Math.abs(n.pos.z - p.z) > 160) continue;
      const im = this.meshes.get(n.herb)!;
      const c = counts.get(n.herb) ?? 0;
      if (c >= MAX_PER_HERB) continue;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, n.yaw);
      im.setMatrixAt(c, m.compose(n.pos, q, one));
      counts.set(n.herb, c + 1);
    }
    for (const [herb, im] of this.meshes) {
      im.count = counts.get(herb) ?? 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  setVisible(v: boolean) {
    for (const im of this.meshes.values()) im.visible = v;
  }

  get nodeCount() {
    return this.nodes.size;
  }

  toJSON() {
    // Only remember picks that have not regrown yet.
    const out: Record<string, number> = {};
    for (const [id, t] of this.picked) {
      const n = this.nodes.get(id);
      const herb = n?.herb;
      if (!herb || this.hours() - t < FORAGE[herb].regrow) out[id] = t;
    }
    return out;
  }

  fromJSON(d?: Record<string, number>) {
    for (const [id, t] of Object.entries(d ?? {})) this.picked.set(id, t);
    this.dirty = true;
  }
}
