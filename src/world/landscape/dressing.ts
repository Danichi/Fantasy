import { markClimbable, addGrappleAnchor, grappleAnchors } from '../../player/traversalSurfaces';
import * as THREE from 'three';
import { physics, G_STATIC, groups } from '../../physics/physics';
import { heightAt } from '../terrainHeight';
import { regionAt, reliefAt, RELIEF, SEA_LEVEL } from '../worldMap';
import { mulberry32, fbm } from '../../core/math';

export interface Stone {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  yaw: number;
  lean: number;
  kind: number;
  warm: number;
}
export interface Formation {
  x: number;
  z: number;
  radius: number;
  stones: Stone[];
}
export const DRESSING_CELL = 160;
/** Seeded, authored-scale geological clusters. The footprint is checked before any member is placed. */
export function formationsForCell(i: number, j: number, allow: (x: number, z: number, r: number) => boolean): Formation[] {
  const rnd = mulberry32((Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 91731) >>> 0),
    out: Formation[] = [];
  for (let candidate = 0; candidate < 5; candidate++) {
    const x = (i + 0.12 + rnd() * 0.76) * DRESSING_CELL,
      z = (j + 0.12 + rnd() * 0.76) * DRESSING_CELL,
      h = heightAt(x, z),
      rel = reliefAt(x, z),
      region = regionAt(x, z);
    const gx = (heightAt(x + 4, z) - heightAt(x - 4, z)) / 8,
      gz = (heightAt(x, z + 4) - heightAt(x, z - 4)) / 8,
      slope = Math.hypot(gx, gz);
    const mountain = rel === RELIEF.mountain || rel === RELIEF.snow || /Mountains|Peaks/.test(region),
      desert = rel === RELIEF.sand || rel === RELIEF.mesa;
    const roll = rnd(),
      shape = rnd(),
      scale = rnd();
    if (h < SEA_LEVEL + 1.2 || rel === RELIEF.deep || rel === RELIEF.shelf || rel === RELIEF.lava) continue;
    const rocky = fbm(x * 0.006 + 19, z * 0.006 - 31, 2);
    if (roll > (mountain ? 0.86 : slope > 0.3 ? 0.64 : 0.2 + Math.max(0, rocky - 0.3) * 0.7)) continue;
    const size = mountain ? 7 + scale * 7 : slope > 0.25 ? 4 + scale * 4 : 2.4 + scale * 2.8,
      radius = size + 5;
    if (!allow(x, z, radius)) continue;
    const stones: Stone[] = [],
      yaw = Math.atan2(gx, gz) + Math.PI / 2,
      kind = mountain ? (shape < 0.55 ? 2 : 1) : shape < 0.3 ? 1 : 0;
    const warm = desert ? 1 : /demon|volcanic/i.test(region) ? -1 : 0;
    const count = kind === 0 ? 4 : kind === 1 ? 5 : 4;
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2,
        offset = k ? size * (0.25 + rnd() * 0.42) : 0,
        px = x + Math.cos(a) * offset,
        pz = z + Math.sin(a) * offset;
      const w = k === 0 ? size * (kind === 2 ? 0.52 : 0.85) : size * (0.22 + rnd() * 0.42),
        d = k === 0 ? size * (kind === 2 ? 0.9 : 0.7) : w * (0.65 + rnd() * 0.3);
      const rise = k === 0 ? size * (kind === 2 ? 1.5 : kind === 1 ? 0.9 : 0.55) : size * (0.16 + rnd() * 0.42);
      const base = Math.min(heightAt(px, pz), heightAt(px - w * 0.35, pz), heightAt(px + w * 0.35, pz), heightAt(px, pz - d * 0.35), heightAt(px, pz + d * 0.35));
      stones.push({
        x: px,
        y: base - rise * 0.15,
        z: pz,
        width: w,
        height: rise + Math.min(5, slope * w * 0.65),
        depth: d,
        yaw: yaw + (rnd() - 0.5) * 0.5,
        lean: (rnd() - 0.5) * 0.2,
        kind,
        warm,
      });
    }
    // Talus makes a formation belong to the ground, rather than look like one prop dropped on a hill.
    for (let k = 0; k < 7; k++) {
      const a = rnd() * 6.283,
        r = size * (0.55 + rnd() * 0.32),
        px = x + Math.cos(a) * r,
        pz = z + Math.sin(a) * r,
        w = 0.45 + rnd() * 1.25;
      stones.push({ x: px, y: heightAt(px, pz) - w * 0.25, z: pz, width: w, height: w * (0.5 + rnd() * 0.4), depth: w * 0.8, yaw: rnd() * 6.283, lean: 0, kind: 0, warm });
    }
    out.push({ x, z, radius, stones });
  }
  return out;
}
function stoneGeometry(kind: number) {
  const g = new THREE.IcosahedronGeometry(1, kind === 2 ? 0 : 1),
    p = g.attributes.position,
    rnd = mulberry32(41 + kind * 371);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    // Broad split faces, horizontal bedding and an asymmetric crown.
    if (kind === 1) {
      x = Math.max(-0.78, Math.min(0.84, x));
      z = Math.max(-0.74, Math.min(0.8, z));
      y = Math.round(y * 5) / 5;
    }
    if (kind === 2) {
      x *= 0.7 + Math.max(0, y) * 0.2;
      z *= 0.85;
      y += x * 0.18;
    }
    const grain = 1 + 0.05 * Math.sin(x * 11 + z * 7 + kind * 3);
    p.setXYZ(i, x * grain * 0.5, Math.max(0, (y + 1) * 0.5), z * grain * 0.5);
  }
  g.computeVertexNormals();
  const c = new Float32Array(p.count * 3),
    color = new THREE.Color(),
    n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const stripe = Math.sin(p.getY(i) * 38 + p.getX(i) * 2) * 0.025,
      light = 0.62 + Math.max(0, n.getY(i)) * 0.2 + stripe + (rnd() - 0.5) * 0.045;
    color.setRGB(light * 0.98, light, light * 0.94);
    if (n.getY(i) > 0.45 && p.getY(i) < 0.75 && Math.sin(p.getX(i) * 14 + p.getZ(i) * 11) > 0.2) color.lerp(new THREE.Color(0x687959), 0.35);
    c.set([color.r, color.g, color.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}
interface Live {
  formations: Formation[];
  colliders: Map<Stone, ReturnType<typeof physics.addBox>>;
}
/** Three instanced batches serve the whole visible landscape, with near hulls and distant silhouettes. */
export class TerrainDressing {
  readonly active = new Map<string, Live>();
  private geometries = [stoneGeometry(0), stoneGeometry(1), stoneGeometry(2)];
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  private root = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private timer = 0;
  private visible = true;
  private readonly capacity = 2048;
  constructor(
    scene: THREE.Scene,
    private allow: (x: number, z: number, radius: number) => boolean
  ) {
    this.meshes = this.geometries.map((g) => {
      const mesh = new THREE.InstancedMesh(g, this.material, this.capacity);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    });
    scene.add(this.root);
  }
  private matrix(s: Stone) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(s.x, s.y, s.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(s.lean, s.yaw, 0)),
      new THREE.Vector3(s.width, s.height, s.depth)
    );
  }
  private draw(pos: THREE.Vector3) {
    const counts = [0, 0, 0],
      stones: Stone[] = [];
    for (const l of this.active.values())
      for (const f of l.formations)
        for (let i = 0; i < f.stones.length; i++) {
          const s = f.stones[i],
            distance = Math.hypot(s.x - pos.x, s.z - pos.z);
          if (distance > 850 || (distance > 380 && i !== 0) || (distance > 220 && s.height < 1.2)) continue;
          stones.push(s);
        }
    stones.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
    for (const s of stones) {
      const k = counts[s.kind]++;
      if (k >= this.capacity) continue;
      const mesh = this.meshes[s.kind];
      mesh.setMatrixAt(k, this.matrix(s));
      mesh.setColorAt(k, new THREE.Color(s.warm > 0 ? 0xc49a73 : s.warm < 0 ? 0x777984 : 0xaeb4ab));
    }
    this.meshes.forEach((m, i) => {
      m.count = Math.min(this.capacity, counts[i]);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }
  update(dt: number, pos: THREE.Vector3, overworld = true) {
    this.root.visible = overworld && this.visible;
    if (!overworld || !this.visible) {
      if (this.active.size) this.reset();
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.3;
    const ci = Math.floor(pos.x / DRESSING_CELL),
      cj = Math.floor(pos.z / DRESSING_CELL),
      wanted = new Set<string>(),
      cells: [number, number][] = [];
    for (let i = ci - 6; i <= ci + 6; i++)
      for (let j = cj - 6; j <= cj + 6; j++)
        if (Math.hypot((i + 0.5) * DRESSING_CELL - pos.x, (j + 0.5) * DRESSING_CELL - pos.z) < 850) {
          wanted.add(i + ':' + j);
          cells.push([i, j]);
        }
    for (const [key, l] of this.active)
      if (!wanted.has(key)) {
        this.unload(l);
        this.active.delete(key);
      }
    cells.sort((a, b) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b[0] - ci, b[1] - cj));
    let built = 0;
    for (const [i, j] of cells)
      if (!this.active.has(i + ':' + j)) {
        this.active.set(i + ':' + j, { formations: formationsForCell(i, j, this.allow), colliders: new Map() });
        if (++built >= 3) break;
      }
    for (const l of this.active.values())
      for (const f of l.formations)
        for (const s of f.stones) {
          const near = Math.hypot(s.x - pos.x, s.z - pos.z) < 70;
          if (near && !l.colliders.has(s)) {
            const source = this.geometries[s.kind].attributes.position,
              m = this.matrix(s),
              v = new THREE.Vector3(),
              vertices = new Float32Array(source.count * 3);
            for (let k = 0; k < source.count; k++) {
              v.fromBufferAttribute(source, k).applyMatrix4(m);
              vertices.set([v.x, v.y, v.z], k * 3);
            }
            const desc = physics.R.ColliderDesc.convexHull(vertices);
            if (!desc) continue;
            const body = physics.world.createRigidBody(physics.R.RigidBodyDesc.fixed());
            const collider = physics.world.createCollider(desc.setCollisionGroups(groups(G_STATIC, 0xffff)), body);
            if (s.height > 2.2) markClimbable(collider);
            l.colliders.set(s, collider);
          } else if (!near && l.colliders.has(s)) {
            physics.removeStatic(l.colliders.get(s)!);
            l.colliders.delete(s);
          }
          const c = l.colliders.get(s);
          if (near && c && s.kind === 1 && s.width > 4 && s.depth > 3 && s.height > 3 && !grappleAnchors.has('outcrop:' + c.handle)) {
            const origin = new THREE.Vector3(s.x, s.y + s.height * 1.3 + 3, s.z);
            const hit = physics.world.castRayAndGetNormal(new physics.R.Ray(origin, { x: 0, y: -1, z: 0 }), s.height * 1.5 + 4, true, undefined, groups(0xffff, G_STATIC));
            if (hit && hit.collider.handle === c.handle && hit.normal.y > 0.8) {
              const landing = origin.clone().setY(origin.y - hit.timeOfImpact + 0.055);
              const point = landing.clone().add(new THREE.Vector3(Math.sin(s.yaw) * s.depth * 0.45, 1.8, Math.cos(s.yaw) * s.depth * 0.45));
              addGrappleAnchor({ id: 'outcrop:' + c.handle, point, landing, owner: c.handle });
            }
          }
        }
    this.draw(pos);
  }
  warm(pos: THREE.Vector3) {
    if (!this.visible) return;
    for (let i = 0; i < 34; i++) {
      this.timer = 0;
      this.update(0, pos, true);
    }
  }
  setVisible(v: boolean) {
    this.visible = v;
    this.root.visible = v;
    if (!v) this.reset();
  }
  reset() {
    for (const l of this.active.values()) this.unload(l);
    this.active.clear();
    for (const m of this.meshes) m.count = 0;
    this.timer = 0;
  }
  private unload(l: Live) {
    for (const c of l.colliders.values()) physics.removeStatic(c);
    l.colliders.clear();
  }
  get stats() {
    return {
      cells: this.active.size,
      formations: [...this.active.values()].reduce((n, l) => n + l.formations.length, 0),
      colliders: [...this.active.values()].reduce((n, l) => n + l.colliders.size, 0),
      instances: this.meshes.reduce((n, m) => n + m.count, 0),
      draws: this.meshes.filter((m) => m.count > 0).length,
    };
  }
}
