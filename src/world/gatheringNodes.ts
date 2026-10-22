import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, roadDist, TOWN_R, PORT_AURELLE } from './terrainHeight';
import { reliefAt, RELIEF, SEA_LEVEL } from './worldMap';
import { QUARRY } from './glenLandmarks';
import { mulberry32 } from '../core/math';
import type { Interactable } from '../dungeon/instance';

// Gathering (docs/design/arms-and-crafting.md §7, phase A5): ore veins in the
// hills, the mountains and the old quarry, and windfall timber in the woods,
// scattered per 256 m tile like the herbs (world/foraging.ts). A vein needs a
// pick in your pack, timber a hatchet or any axe; the work takes a moment and
// you have to stand at it. Nodes come back after some game hours and are
// saved as depleted until then. Tiers 1 to 3 everywhere, the better ones
// further from Elder Glen.

export interface NodeKind {
  item: string;
  label: string;
  tool: 'pick' | 'axe';
  /** game hours to come back */
  regrow: number;
  n: [number, number];
  /** what a rare find gives (Smithing's rare-find nodes raise the chance) */
  rare?: string;
}

export const NODE_KINDS = {
  iron: { item: 'ironOre', label: 'Iron ore vein', tool: 'pick', regrow: 24, n: [1, 3], rare: 'copperOre' },
  coal: { item: 'coal', label: 'Coal seam', tool: 'pick', regrow: 24, n: [2, 3] },
  copper: { item: 'copperOre', label: 'Copper ore vein', tool: 'pick', regrow: 28, n: [1, 2], rare: 'silverOre' },
  silver: { item: 'silverOre', label: 'Silver ore vein', tool: 'pick', regrow: 40, n: [1, 2] },
  oak: { item: 'planks', label: 'Fallen oak', tool: 'axe', regrow: 30, n: [2, 3], rare: 'ashWood' },
  ash: { item: 'ashWood', label: 'Fallen ash', tool: 'axe', regrow: 36, n: [1, 2], rare: 'yewWood' },
  yew: { item: 'yewWood', label: 'Fallen yew', tool: 'axe', regrow: 48, n: [1, 1] },
} satisfies Record<string, NodeKind>;
export type NodeKindId = keyof typeof NODE_KINDS;

interface Node {
  id: string;
  kind: NodeKindId;
  pos: THREE.Vector3;
  yaw: number;
  tile: number;
}

/** Where the dwarf's Deep Sense looks for ore (origins/wiring.ts). */
export const ORE_SENSE: { near?: (p: THREE.Vector3, r: number) => THREE.Vector3[] } = {};

const T = 256;
const MAX_PER_KIND = 48;
/** Fixed nodes at the old quarry, so Elder Glen's smiths have ore close to home. */
const QUARRY_NODES: [NodeKindId, number, number][] = [['iron', -6, 4], ['iron', 5, 6], ['coal', -2, -4], ['copper', 8, -1], ['iron', 1, 9]];
const WORK = { pick: 1.6, axe: 1.9 };

// ---- models --------------------------------------------------------------------------------------
type Part = [THREE.BufferGeometry, number];

function rock(rnd: () => number, s: number) {
  const g = new THREE.DodecahedronGeometry(s, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + rnd() * 0.3), p.getY(i) * (0.7 + rnd() * 0.25), p.getZ(i) * (0.85 + rnd() * 0.3));
  g.computeVertexNormals();
  return g;
}

function veinModel(ore: number, glow: boolean, seed: number): Part[] {
  const rnd = mulberry32(seed);
  const parts: Part[] = [];
  const stones: [number, number, number, number][] = [[0, 0.45, 0, 0.75], [0.7, 0.3, 0.3, 0.5], [-0.55, 0.25, 0.35, 0.45], [0.2, 0.2, -0.6, 0.42]];
  for (const [x, y, z, s] of stones) parts.push([rock(rnd, s).translate(x, y, z), 0x7c7a74]);
  // Ore showing through the rock: chunky nuggets and a streak.
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.45;
    const g = new THREE.OctahedronGeometry(0.1 + rnd() * 0.09, 0);
    g.rotateY(rnd() * 3).rotateX(rnd() * 3).translate(Math.cos(a) * r, 0.35 + rnd() * 0.5, Math.sin(a) * r);
    parts.push([g, ore]);
  }
  parts.push([new THREE.BoxGeometry(0.9, 0.08, 0.14).rotateZ(0.35).translate(0.05, 0.62, 0.55), ore]);
  if (glow) parts.push([new THREE.OctahedronGeometry(0.09, 0).translate(-0.2, 0.95, 0.2), 0xffffff]);
  return parts;
}

function logModel(bark: number, wood: number): Part[] {
  const parts: Part[] = [];
  const trunk = new THREE.CylinderGeometry(0.32, 0.38, 3.4, 9);
  trunk.rotateZ(Math.PI / 2).rotateY(0.15).translate(0, 0.34, 0);
  parts.push([trunk, bark]);
  // Cut ends and an axe notch show the wood.
  parts.push([new THREE.CylinderGeometry(0.3, 0.3, 0.04, 9).rotateZ(Math.PI / 2).rotateY(0.15).translate(1.69, 0.34, -0.25), wood]);
  parts.push([new THREE.BoxGeometry(0.34, 0.2, 0.5).rotateZ(0.6).rotateY(0.15).translate(-0.5, 0.62, 0.08), wood]);
  // A broken branch and a stump beside it.
  parts.push([new THREE.CylinderGeometry(0.07, 0.1, 1.1, 6).rotateZ(1.1).translate(0.6, 0.75, 0.25), bark]);
  parts.push([new THREE.CylinderGeometry(0.36, 0.44, 0.55, 9).translate(-2.1, 0.27, 0.5), bark]);
  parts.push([new THREE.CylinderGeometry(0.34, 0.34, 0.04, 9).translate(-2.1, 0.56, 0.5), wood]);
  return parts;
}

function bake(parts: Part[]) {
  const geos = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    const col = new THREE.Color(c);
    const arr = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([col.r, col.g, col.b], i);
    n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return n;
  });
  return mergeGeometries(geos, false)!;
}

const MODELS: Record<NodeKindId, () => Part[]> = {
  iron: () => veinModel(0x9a5a3a, false, 11),
  coal: () => veinModel(0x1c1c20, false, 12),
  copper: () => veinModel(0x3aa08a, false, 13),
  silver: () => veinModel(0xe8eef2, true, 14),
  oak: () => logModel(0x5a4430, 0xc8a070),
  ash: () => logModel(0x8a8a80, 0xe2d6b8),
  yew: () => logModel(0x5a3428, 0xb8604a),
};

export class GatheringNodes {
  private nodes = new Map<string, Node>();
  private tiles = new Set<number>();
  /** node id -> game hour it was worked out */
  private worked = new Map<string, number>();
  private meshes = new Map<NodeKindId, THREE.InstancedMesh>();
  private dirty = true;
  private near: Node | null = null;
  /** the node being worked, and for how long */
  private work: { node: Node; t: number; dur: number; at: THREE.Vector3 } | null = null;
  readonly interactable: Interactable;
  /** a strike landed while working (for sparks, chips and sound) */
  onStrike?: (pos: THREE.Vector3, tool: 'pick' | 'axe') => void;
  onGather?: (kind: NodeKindId, item: string, n: number, rare?: string) => void;

  constructor(
    scene: THREE.Scene,
    private deps: {
      give: (id: string, n: number) => void;
      hours: () => number;
      hasTool: (tool: 'pick' | 'axe') => boolean;
      /** Smithing's gathering bonuses: yield, gather speed, rare finds */
      bonus: (key: 'yield' | 'gather' | 'rare') => number;
      toast: (msg: string) => void;
      rnd?: () => number;
    },
  ) {
    for (const kind of Object.keys(NODE_KINDS) as NodeKindId[]) {
      const geo = bake(MODELS[kind]());
      const glow = kind === 'silver';
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'silver' || kind === 'copper' ? 0.55 : 0.9, metalness: kind === 'silver' ? 0.35 : 0, emissive: glow ? 0x334050 : 0x000000 });
      const im = new THREE.InstancedMesh(geo, mat, MAX_PER_KIND);
      im.count = 0;
      im.castShadow = im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
      this.meshes.set(kind, im);
    }
    QUARRY_NODES.forEach(([kind, dx, dz], i) => {
      const x = QUARRY.x + dx, z = QUARRY.z + dz;
      this.nodes.set('quarry:' + i, { id: 'quarry:' + i, kind, pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: i * 1.7, tile: -1 });
    });
    const self = this;
    const pos = new THREE.Vector3(0, -999, 0);
    this.interactable = {
      pos, radius: 2,
      label: () => {
        const n = self.near;
        if (!n) return '';
        const k = NODE_KINDS[n.kind];
        if (self.work) return `${k.tool === 'pick' ? 'Mining' : 'Cutting'}… (stand still)`;
        if (!self.deps.hasTool(k.tool)) return `${k.label} · you need ${k.tool === 'pick' ? 'a pick' : 'a hatchet or an axe'}`;
        return `${k.tool === 'pick' ? 'Mine' : 'Cut'} the ${k.label.toLowerCase()}`;
      },
      enabled: () => !!self.near && !self.work,
      action: () => self.start(),
    };
    ORE_SENSE.near = (p, r) => [...this.nodes.values()].filter((n) => NODE_KINDS[n.kind].tool === 'pick' && this.available(n) && n.pos.distanceTo(p) < r).map((n) => n.pos);
  }

  available(n: Node) {
    const t = this.worked.get(n.id);
    return t === undefined || this.deps.hours() - t >= NODE_KINDS[n.kind].regrow;
  }

  /** Begin working the nearest node (the work finishes in update()). */
  start() {
    const n = this.near;
    if (!n || this.work || !this.available(n)) return false;
    const k = NODE_KINDS[n.kind];
    if (!this.deps.hasTool(k.tool)) {
      this.deps.toast(k.tool === 'pick' ? 'You need a pick to work ore (Fröst sells them).' : 'You need a hatchet or an axe to cut timber.');
      return false;
    }
    this.work = { node: n, t: 0, dur: WORK[k.tool] * Math.max(0.4, 1 - this.deps.bonus('gather')), at: new THREE.Vector3() };
    return true;
  }

  private finish(n: Node) {
    const k: NodeKind = NODE_KINDS[n.kind];
    const rnd = this.deps.rnd ?? Math.random;
    let got = k.n[0] + Math.floor(rnd() * (k.n[1] - k.n[0] + 1));
    if (rnd() < this.deps.bonus('yield')) got++;
    const rare = k.rare && rnd() < 0.04 + this.deps.bonus('rare') ? k.rare : undefined;
    this.worked.set(n.id, this.deps.hours());
    this.deps.give(k.item, got);
    if (rare) this.deps.give(rare, 1);
    this.onGather?.(n.kind, k.item, got, rare);
    this.dirty = true;
  }

  /** What the ground holds here (null for nothing): by terrain, height and distance from Elder Glen. */
  private pick(x: number, z: number, r: number, r2: number): NodeKindId | null {
    const h = heightAt(x, z);
    if (h < SEA_LEVEL + 1) return null;
    if (Math.hypot(x, z) < TOWN_R + 30 || roadDist(x, z) < 6) return null;
    if (Math.hypot(x - PORT_AURELLE.x, z - PORT_AURELLE.y) < 220) return null;
    const far = Math.min(1, Math.hypot(x, z) / 2500);
    const rel = reliefAt(x, z);
    if (rel === RELIEF.mountain || h > 16) {
      if (r2 < 0.08 + far * 0.18) return 'silver';
      return r < 0.45 ? 'iron' : r < 0.75 ? 'coal' : 'copper';
    }
    if (rel === RELIEF.forest) {
      if (r2 < 0.04 + far * 0.12) return 'yew';
      return r < 0.62 ? 'oak' : 'ash';
    }
    // Now and then a vein breaks the surface in open hill country.
    if (rel === RELIEF.open && h > 8 && r < 0.12) return 'iron';
    return null;
  }

  private stream(p: THREE.Vector3) {
    const ci = Math.floor(p.x / T), cj = Math.floor(p.z / T);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const key = (i + 2048) * 4096 + (j + 2048);
      if (this.tiles.has(key)) continue;
      this.tiles.add(key);
      const rnd = mulberry32(((i * 92837111) ^ (j * 689287499) ^ 0x5eed) >>> 0);
      const count = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const x = i * T + rnd() * T, z = j * T + rnd() * T;
        const kind = this.pick(x, z, rnd(), rnd());
        if (!kind) continue;
        this.nodes.set(`${i},${j},${k}`, { id: `${i},${j},${k}`, kind, pos: new THREE.Vector3(x, heightAt(x, z) - 0.05, z), yaw: rnd() * 6.28, tile: key });
      }
    }
    for (const key of [...this.tiles]) {
      const i = Math.floor(key / 4096) - 2048, j = (key % 4096) - 2048;
      if (Math.abs(i - ci) <= 2 && Math.abs(j - cj) <= 2) continue;
      this.tiles.delete(key);
      for (const [id, n] of this.nodes) if (n.tile === key) this.nodes.delete(id);
    }
    this.dirty = true;
  }

  private tick = 1;
  private strikeT = 0;
  update(dt: number, p: THREE.Vector3) {
    this.tick += dt;
    if (this.tick > 1) {
      this.tick = 0;
      this.stream(p);
    }
    // The work in hand: stand at it until it's done; walking away stops it.
    const w = this.work;
    if (w) {
      if (w.t === 0) w.at.copy(p);
      w.t += dt;
      this.strikeT -= dt;
      if (p.distanceTo(w.at) > 0.6 || !this.available(w.node)) this.work = null;
      else {
        if (this.strikeT <= 0) {
          this.strikeT = 0.45;
          this.onStrike?.(w.node.pos, NODE_KINDS[w.node.kind].tool);
        }
        if (w.t >= w.dur) {
          this.work = null;
          this.finish(w.node);
        }
      }
    }
    // The nearest workable node gets the prompt.
    if (!this.work) {
      this.near = null;
      let best = 2.6;
      for (const n of this.nodes.values()) {
        if (Math.abs(n.pos.x - p.x) > 4 || Math.abs(n.pos.z - p.z) > 4 || !this.available(n)) continue;
        const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
        if (d < best) (best = d), (this.near = n);
      }
    }
    if (this.near) this.interactable.pos.copy(this.near.pos).setY(this.near.pos.y + 0.5);
    else this.interactable.pos.set(0, -999, 0);
    if (!this.dirty) return;
    this.dirty = false;
    const counts = new Map<NodeKindId, number>();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const n of this.nodes.values()) {
      if (!this.available(n) || Math.abs(n.pos.x - p.x) > 220 || Math.abs(n.pos.z - p.z) > 220) continue;
      const c = counts.get(n.kind) ?? 0;
      if (c >= MAX_PER_KIND) continue;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, n.yaw);
      this.meshes.get(n.kind)!.setMatrixAt(c, m.compose(n.pos, q, one));
      counts.set(n.kind, c + 1);
    }
    for (const [kind, im] of this.meshes) {
      im.count = counts.get(kind) ?? 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  get working() {
    return !!this.work;
  }

  setVisible(v: boolean) {
    for (const im of this.meshes.values()) im.visible = v;
  }

  /** For tests and the map: nodes near a point. */
  around(p: THREE.Vector3, r: number) {
    return [...this.nodes.values()].filter((n) => n.pos.distanceTo(p) < r).map((n) => ({ id: n.id, kind: n.kind, pos: n.pos.clone(), available: this.available(n) }));
  }

  toJSON() {
    const out: Record<string, number> = {};
    for (const [id, t] of this.worked) {
      const n = this.nodes.get(id);
      // Keep anything not yet regrown (and anything out of range: it may not have regrown either).
      if (!n || this.deps.hours() - t < NODE_KINDS[n.kind].regrow) out[id] = t;
    }
    return out;
  }

  fromJSON(d?: Record<string, number>) {
    this.worked.clear();
    for (const [id, t] of Object.entries(d ?? {})) this.worked.set(id, t);
    this.dirty = true;
  }
}
