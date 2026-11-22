import { waveNormalTexture } from '../water';
import * as THREE from 'three';
import { BANK_EXITS, CROSSINGS, LANDFORMS, PONDS, TRAILS, WATERCOURSES, bankExitProfile, landscapeWaterAt, landscapeTrailDistance, trailProfile, type Point } from './layout';
import { baseWorldHeightFn, heightAt, surveyHeightAt } from '../terrainHeight';
import { walkHeightAt } from './surfaces';
import { waterSurfaceAt } from '../waterLevel';
import { StaticBatch } from '../cityKit';
import { physics } from '../../physics/physics';
import type { Interactable } from '../../dungeon/instance';
import type { MapMarker } from '../../ui/worldMap';
import type { FishingSpot } from '../fishing';

interface Hooks {
  scene: THREE.Scene;
  flags: Record<string, boolean | number | string>;
  toast(s: string): void;
  save(): void;
}
interface Feature {
  id: string;
  at: Point;
  radius: number;
  build(live: Live): void;
}
interface Live {
  root: THREE.Group;
  colliders: ReturnType<typeof physics.addBox>[];
}
/** Water, crossings, trail furniture and geology stream independently of ground LOD. */
export class Landscape {
  readonly interactables: Interactable[] = [];
  readonly clearings: [number, number, number][] = [];
  private features: Feature[] = [];
  private live = new Map<string, Live>();
  private timer = 0;
  private active = false;
  private stone = new THREE.MeshStandardMaterial({ color: 0x8c8879, roughness: 1 });
  private timber = new THREE.MeshStandardMaterial({ color: 0x756044, roughness: 1 });
  private trailMat = new THREE.MeshStandardMaterial({ color: 0x9a8562, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private water = new THREE.MeshStandardMaterial({
    color: 0x367f8c,
    roughness: 0.22,
    metalness: 0.12,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private foam = new THREE.MeshStandardMaterial({ color: 0xd6ece8, roughness: 0.6, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
  constructor(private h: Hooks) {
    const normals = waveNormalTexture();
    this.water.normalMap = normals;
    this.water.normalScale.set(0.28, 0.28);
    this.foam.normalMap = normals;
    this.foam.normalScale.set(0.45, 0.45);
    for (const c of CROSSINGS)
      this.features.push({
        id: c.id,
        at: c.at,
        radius: c.half + 20,
        build: (l) => {
          const batch = new StaticBatch(),
            angle = c.angle ?? (c.axis === 'x' ? 0 : Math.PI / 2);
          const box = (along: number, y: number, across: number, hx: number, hy: number, hz: number, mat: THREE.Material, solid: boolean) => {
            const x = c.at[0] + Math.cos(angle) * along - Math.sin(angle) * across,
              z = c.at[1] + Math.sin(angle) * along + Math.cos(angle) * across;
            this.box(l, batch, x, y, z, hx, hy, hz, mat, solid, -angle);
          };
          box(0, c.level - 0.15, 0, c.half, 0.15, c.width * 0.5, this.timber, false);
          // Rotated convex cuboids make Rapier's capsule controller lose speed
          // on a flat face. A matching triangle mesh keeps the deck continuous.
          const deckGeo = new THREE.BoxGeometry(c.half * 2, 0.3, c.width);
          this.solidMesh(
            l,
            deckGeo,
            new THREE.Matrix4().compose(
              new THREE.Vector3(c.at[0], c.level - 0.15, c.at[1]),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle),
              new THREE.Vector3(1, 1, 1)
            )
          );
          deckGeo.dispose();
          for (const side of [-1, 1]) {
            box(0, c.level + 0.95, side * (c.width * 0.5 - 0.15), c.half, 0.11, 0.12, this.timber, true);
            for (let a = -c.half; a <= c.half; a += 6) box(a, c.level + 0.5, side * (c.width * 0.5 - 0.15), 0.15, 0.65, 0.15, this.stone, false);
          }
          // Short solid ramps overlap the heightfield edge. Interpolation of a
          // 2 m ground cell must not turn the bank-to-deck join into a high lip.
          for (const side of [-1, 1]) {
            const run = 6,
              outer = c.half + run,
              ex = c.at[0] + Math.cos(angle) * side * outer,
              ez = c.at[1] + Math.sin(angle) * side * outer;
            const end = surveyHeightAt(ex, ez) + 0.05,
              dy = end - c.level,
              slope = side * Math.atan2(dy, run);
            const q = new THREE.Quaternion()
              .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle)
              .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope));
            const centre = new THREE.Vector3(
              c.at[0] + Math.cos(angle) * side * (c.half + run / 2),
              (c.level + end) / 2 - 0.125 * Math.cos(slope),
              c.at[1] + Math.sin(angle) * side * (c.half + run / 2)
            );
            const geo = new THREE.BoxGeometry(Math.hypot(run, dy), 0.25, c.width);
            batch.add(geo, this.timber, new THREE.Matrix4().compose(centre, q, new THREE.Vector3(1, 1, 1)));
            this.solidMesh(l, geo, new THREE.Matrix4().compose(centre, q, new THREE.Vector3(1, 1, 1)));
            geo.dispose();
          }
          // Abutments stand on each bank; no pier blocks the channel.
          for (const side of [-1, 1]) {
            const a = side * (c.half - 1),
              x = c.at[0] + Math.cos(angle) * a,
              z = c.at[1] + Math.sin(angle) * a,
              floor = heightAt(x, z);
            box(a, (floor + c.level - 0.3) / 2, 0, 1, Math.max(0.15, (c.level - 0.3 - floor) / 2), c.width * 0.5, this.stone, true);
          }
          batch.build(l.root, 64);
        },
      });
    // Short strips keep both visibility and terrain queries bounded while travelling.
    for (const w of WATERCOURSES)
      for (let i = 1; i < w.knots.length; i++) {
        const a = w.knots[i - 1],
          b = w.knots[i],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          n = Math.ceil(length / 110);
        for (let part = 0; part < n; part++) {
          const from = [a[0] + ((b[0] - a[0]) * part) / n, a[1] + ((b[1] - a[1]) * part) / n, a[2] + ((b[2] - a[2]) * part) / n],
            to = [a[0] + ((b[0] - a[0]) * (part + 1)) / n, a[1] + ((b[1] - a[1]) * (part + 1)) / n, a[2] + ((b[2] - a[2]) * (part + 1)) / n];
          this.features.push({
            id: `water-${w.id}-${i}-${part}`,
            at: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
            radius: 80,
            build: (l) => this.waterStrip(l, from, to, w.width + w.bank, w.id),
          });
        }
      }
    for (const p of PONDS)
      this.features.push({
        id: p.id,
        at: p.at,
        radius: p.radius + 20,
        build: (l) => {
          // Rings follow the exact local-water shoreline, including the bank apron.
          const pos: number[] = [],
            idx: number[] = [];
          const rings = 14,
            sectors = 64;
          for (let r = 0; r <= rings; r++)
            for (let j = 0; j <= sectors; j++) {
              const theta = (j / sectors) * Math.PI * 2,
                rad = ((p.radius * 1.25 + 20) * r) / rings,
                x = p.at[0] + Math.cos(theta) * rad,
                z = p.at[1] + Math.sin(theta) * rad;
              pos.push(x, p.level + 0.025, z);
            }
          for (let r = 0; r < rings; r++)
            for (let j = 0; j < sectors; j++) {
              const a = r * (sectors + 1) + j,
                b = a + sectors + 1;
              for (const tri of [
                [a, b, a + 1],
                [a + 1, b, b + 1],
              ])
                idx.push(...tri);
            }
          this.waterMesh(l, pos, idx, this.water, p.id);
        },
      });
    for (const e of BANK_EXITS) {
      bankExitProfile(e, baseWorldHeightFn);
      this.features.push({
        id: e.id,
        at: e.at,
        radius: 220,
        build: (l) => {
          const points: number[][] = [];
          for (let i = 0; i <= 24; i++) points.push([e.at[0] + ((e.end[0] - e.at[0]) * i) / 24, e.at[1] + ((e.end[1] - e.at[1]) * i) / 24]);
          this.trail(l, points);
          const b = new StaticBatch(),
            x = e.end[0],
            z = e.end[1],
            y = heightAt(x, z);
          for (let i = 0; i < 3; i++) this.box(l, b, x + 2, y + 0.2 + i * 0.28, z, 0.6 - i * 0.14, 0.15, 0.45 - i * 0.1, this.stone, false);
          b.build(l.root);
        },
      });
    }
    for (const t of TRAILS) {
      const profile = trailProfile(t, baseWorldHeightFn);
      for (let i = 1; i < profile.length; i += 8) {
        const chunk = profile.slice(i - 1, Math.min(i + 8, profile.length));
        this.features.push({ id: `trail-${t.id}-${i}`, at: [chunk[0][0], chunk[0][1]], radius: 110, build: (l) => this.trail(l, chunk) });
      }
      const at = t.points[Math.floor(t.points.length / 2)];
      this.waypoint(t.id, t.name, at, t.hint);
    }
    // Every island receives a regional rock silhouette. Azure/sunken arches
    // have an actual opening and triangle collision, rather than a heightfield hump.
    for (const f of LANDFORMS.filter((f) => f.id.startsWith('island-') && !f.id.startsWith('island-gully'))) {
      const at: Point = [(f.line[0][0] + f.line[1][0]) / 2, (f.line[0][1] + f.line[1][1]) / 2];
      this.clearings.push([at[0], at[1], f.width < 50 ? 7 : 12]);
      this.features.push({
        id: 'geology-' + f.id,
        at,
        radius: 24,
        build: (l) => {
          const y = heightAt(at[0], at[1]);
          if (y < 1 || landscapeTrailDistance(at[0], at[1]) < 12) return;
          if (f.region === 'azureIsles' || f.region === 'sunkenIsles') {
            const geo = new THREE.TorusGeometry(f.width < 50 ? 3.6 : 5.8, f.width < 50 ? 0.65 : 1.25, 6, 20, Math.PI);
            geo.translate(at[0], y - 0.5, at[1]);
            const m = new THREE.Mesh(geo, this.stone);
            m.castShadow = m.receiveShadow = true;
            l.root.add(m);
            l.colliders.push(physics.addTrimesh(new Float32Array(geo.attributes.position.array), new Uint32Array(geo.index!.array)));
          } else {
            const batch = new StaticBatch();
            const compact = f.width < 50;
            for (let i = 0; i < (compact ? 3 : 4); i++) {
              const x = at[0] + i * (compact ? 2.2 : 3.8),
                z = at[1] + Math.sin(i) * 3,
                floor = heightAt(x, z),
                height = compact ? 2.5 + i * 1.5 : 5 + i * 2.8;
              this.box(l, batch, x, floor + height / 2, z, compact ? 0.85 : 1.6, height / 2, compact ? 0.85 : 1.6, this.stone, true);
            }
            batch.build(l.root);
          }
        },
      });
    }
  }
  private solidMesh(l: Live, geo: THREE.BufferGeometry, matrix: THREE.Matrix4) {
    const world = geo.clone().applyMatrix4(matrix);
    l.colliders.push(physics.addTrimesh(new Float32Array(world.attributes.position.array), new Uint32Array(world.index!.array)));
    world.dispose();
  }
  /** Clip mixed shore triangles instead of dropping a whole wet cell. */
  private waterMesh(l: Live, pos: number[], triangles: number[], mat: THREE.Material, owner: string) {
    const depths: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i],
        z = pos[i + 2],
        level = pos[i + 1] - 0.025,
        w = landscapeWaterAt(x, z, false, owner),
        other = landscapeWaterAt(x, z, false, undefined, owner);
      // A 2 m overlap covers the different stream and polar-lake tessellations.
      const margin = w && other ? other.distance - other.half - (w.distance - w.half) : Infinity;
      depths.push(w && Math.abs(w.level - level) < 0.3 ? Math.min(level - surveyHeightAt(x, z), margin + 2) : -0.01);
    }
    const indices: number[] = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const tri = triangles.slice(t, t + 3),
        poly: number[] = [];
      for (let j = 0; j < 3; j++) {
        const a = tri[j],
          b = tri[(j + 1) % 3],
          da = depths[a],
          db = depths[b];
        if (da >= 0) poly.push(a);
        if (da >= 0 !== db >= 0) {
          const f = da / (da - db),
            index = pos.length / 3;
          pos.push(pos[a * 3] + (pos[b * 3] - pos[a * 3]) * f, pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * f, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * f);
          poly.push(index);
        }
      }
      for (let j = 1; j < poly.length - 1; j++) indices.push(poly[0], poly[j], poly[j + 1]);
    }
    this.mesh(l, pos, indices, mat);
  }
  private mesh(l: Live, positions: number[], indices: number[], mat: THREE.Material) {
    if (indices.length === 0) return;
    const g = new THREE.BufferGeometry();
    const uv: number[] = [];
    for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] * 0.07, positions[i + 2] * 0.07);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    if (mat === this.water || mat === this.foam) m.name = 'landscape-water';
    m.receiveShadow = true;
    l.root.add(m);
    return m;
  }
  private waterStrip(l: Live, a: number[], b: number[], half: number, owner: string) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz),
      nx = -dz / length,
      nz = dx / length,
      n = Math.ceil(length / 4),
      across = 14,
      pos: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= across; j++) {
        const t = i / n,
          off = ((j / across) * 2 - 1) * half;
        pos.push(a[0] + dx * t + nx * off, a[2] + (b[2] - a[2]) * t + 0.025, a[1] + dz * t + nz * off);
      }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < across; j++) {
        const k = i * (across + 1) + j,
          v = k + across + 1;
        for (const tri of [
          [k, v, k + 1],
          [k + 1, v, v + 1],
        ])
          indices.push(...tri);
      }
    this.waterMesh(l, pos, indices, Math.abs(a[2] - b[2]) / length > 0.4 ? this.foam : this.water, owner);
  }
  private box(l: Live, b: StaticBatch, x: number, y: number, z: number, hx: number, hy: number, hz: number, mat: THREE.Material, solid: boolean, angle = 0) {
    const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    b.add(geo, mat, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rot, new THREE.Vector3(1, 1, 1)));
    geo.dispose();
    if (solid) l.colliders.push(physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(hx, hy, hz), rot));
  }
  private trail(l: Live, points: readonly (readonly number[])[]) {
    const pos: number[] = [],
      idx: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz) || 1,
        n = Math.ceil(len / 2);
      for (let j = 0; j < n; j++) {
        const start = pos.length / 3;
        for (const [t, s] of [
          [j / n, -1],
          [j / n, 1],
          [(j + 1) / n, -1],
          [(j + 1) / n, 1],
        ]) {
          const x = a[0] + dx * t - (dz / len) * s * 0.8,
            z = a[1] + dz * t + (dx / len) * s * 0.8;
          pos.push(x, surveyHeightAt(x, z) + 0.045, z);
        }
        const wet = pos.slice(start * 3).some((_, k, arr) => k % 3 === 0 && waterSurfaceAt(arr[k], arr[k + 2]) !== null);
        if (!wet) idx.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
      }
    }
    this.mesh(l, pos, idx, this.trailMat);
  }
  private waypoint(id: string, name: string, at: Point, hint: string) {
    const pos = new THREE.Vector3(at[0], surveyHeightAt(at[0], at[1]), at[1]);
    this.clearings.push([at[0], at[1], 7]);
    this.interactables.push({
      pos,
      radius: 3,
      level: 3,
      label: () => `Read trail guide — ${name}`,
      enabled: () => this.active,
      action: () => {
        this.h.flags['terrain:seen:' + id] = true;
        this.h.toast(name + ' — ' + hint);
        this.h.save();
      },
    });
    this.features.push({
      id: 'guide-' + id,
      at,
      radius: 10,
      build: (l) => {
        const b = new StaticBatch(),
          y = heightAt(at[0], at[1]);
        this.box(l, b, at[0] + 2, y + 0.9, at[1], 0.12, 0.9, 0.12, this.timber, true);
        this.box(l, b, at[0] + 2, y + 1.55, at[1], 1, 0.22, 0.1, this.timber, false);
        // A dry stone seat and cairn make the guide visible without UI markers.
        for (let i = 0; i < 3; i++) this.box(l, b, at[0] - 2, y + 0.22 + i * 0.32, at[1], 0.65 - i * 0.15, 0.18, 0.55 - i * 0.12, this.stone, false);
        b.build(l.root);
      },
    });
  }
  update(dt: number, pos: THREE.Vector3, overworld: boolean) {
    this.active = overworld;
    this.timer -= dt;
    if (overworld && this.water.normalMap) {
      this.water.normalMap.offset.x += dt * 0.012;
      this.water.normalMap.offset.y -= dt * 0.018;
    }
    if (this.timer > 0 && overworld) return;
    this.timer = 0.35;
    const desired = overworld ? this.features.filter((f) => Math.hypot(pos.x - f.at[0], pos.z - f.at[1]) < 440 + f.radius) : [];
    const ids = new Set(desired.map((f) => f.id));
    for (const [id, live] of this.live) if (!ids.has(id)) this.unload(id, live);
    // Limit construction spikes to two chunks per update; bridges near the
    // player always load first, including immediately after a teleport.
    desired.sort(
      (a, b) =>
        (a.id.includes('bridge') ? -1000 : 0) +
        Math.hypot(a.at[0] - pos.x, a.at[1] - pos.z) -
        ((b.id.includes('bridge') ? -1000 : 0) + Math.hypot(b.at[0] - pos.x, b.at[1] - pos.z))
    );
    let built = 0;
    for (const f of desired)
      if (!this.live.has(f.id)) {
        const live: Live = { root: new THREE.Group(), colliders: [] };
        f.build(live);
        this.h.scene.add(live.root);
        this.live.set(f.id, live);
        if (++built >= 4) break;
      }
  }
  warm(pos: THREE.Vector3) {
    this.timer = 0;
    this.update(0, pos, true);
  }
  reset() {
    for (const [id, live] of this.live) this.unload(id, live);
    this.timer = 0;
  }
  private unload(id: string, l: Live) {
    for (const c of l.colliders) physics.removeStatic(c);
    l.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.h.scene.remove(l.root);
    this.live.delete(id);
  }
  get stats() {
    return { chunks: this.live.size, colliders: [...this.live.values()].reduce((n, l) => n + l.colliders.length, 0), features: this.features.length };
  }
  markers(): MapMarker[] {
    return TRAILS.filter((t) => this.h.flags['terrain:seen:' + t.id]).map((t) => ({
      x: t.points[Math.floor(t.points.length / 2)][0],
      z: t.points[Math.floor(t.points.length / 2)][1],
      kind: 'siteDone',
      label: t.name,
    }));
  }
}
/** Native fishing spots on dry banks use the same pond levels as swimming. */
export function landscapeFishingSpots(): FishingSpot[] {
  return PONDS.map((p) => {
    const x = p.at[0] + p.radius + 19,
      z = p.at[1];
    return { pos: new THREE.Vector3(x, heightAt(x, z), z), water: new THREE.Vector3(p.at[0] + p.radius * 0.6, p.level, z), kind: 'river', name: p.name };
  });
}
/** First load after reshaping: keep progress, resolve old positions to dry ground. */
export function migrateTerrainPosition(pos: THREE.Vector3) {
  // A roof, gallery or existing deck is a legitimate saved floor. The nearby
  // static probe distinguishes it from a position suspended over reshaped land.
  if (physics.world && pos.y > walkHeightAt(pos.x, pos.z) + 1) {
    const hit = physics.castRay(pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, -1, 0), 1.5);
    if (hit !== null && Math.abs(1 - hit) < 0.3) return pos.clone().setY(pos.y + 1 - hit + 0.08);
  }
  const safe = (x: number, z: number) => {
    const h = walkHeightAt(x, z),
      w = waterSurfaceAt(x, z);
    return (w === null || h >= w + 0.15) && Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) < 3 && Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2)) < 3;
  };
  if (safe(pos.x, pos.z)) return pos.clone().setY(walkHeightAt(pos.x, pos.z) + 0.2);
  for (let r = 4; r <= 160; r += 4)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2,
        x = pos.x + Math.cos(a) * r,
        z = pos.z + Math.sin(a) * r;
      if (safe(x, z)) return new THREE.Vector3(x, walkHeightAt(x, z) + 0.2, z);
    }
  // Remote swimming saves stay at their original location; never move someone
  // kilometres away or discard a vessel because no nearby bank was found.
  return pos.clone().setY(Math.max(pos.y, walkHeightAt(pos.x, pos.z) + 0.2));
}
