import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { StaticBatch } from '../cityKit';
import { worldUV, type WorldMats } from '../buildings';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { mulberry32 } from '../../core/math';
import { sunwheelTexture } from '../glenLandmarks';
import type { FX } from '../../fx/particles';

// The site builder's toolbox. Everything static goes into one StaticBatch per
// site (a few draw calls, merged by material); the colliders a site adds are
// remembered so the whole site can be taken down when you walk away. Fires,
// glows and small moving things are kept apart and animated only while built.

const shared = new Map<string, THREE.Material>();
/** A plain material, shared across all sites. */
export function col(c: number, rough = 0.9, opts: { side?: THREE.Side; metal?: number; emissive?: number; ei?: number } = {}) {
  const k = `${c}:${rough}:${opts.side ?? 0}:${opts.metal ?? 0}:${opts.emissive ?? 0}:${opts.ei ?? 0}`;
  let m = shared.get(k);
  if (!m) shared.set(k, (m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, side: opts.side ?? THREE.FrontSide, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0, emissiveIntensity: opts.ei ?? 1 })));
  return m;
}

let glyphMat: THREE.Material | null = null;
/** The Sunwheel, carved and faintly glowing (decal). */
export function sunwheelMat() {
  return (glyphMat ??= new THREE.MeshStandardMaterial({ map: sunwheelTexture('rgba(80, 64, 46, 1)', false), emissiveMap: sunwheelTexture(), emissive: 0xffc860, emissiveIntensity: 0.25, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }));
}

/** A lumpy rock (a squashed, jittered icosahedron, welded so it stays whole). */
export function rockGeo(rnd: () => number, sx: number, sy: number, sz: number, detail = 1) {
  let g: THREE.BufferGeometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'), 1e-4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + rnd() * 0.3;
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export class SiteKit {
  readonly batch = new StaticBatch();
  readonly group = new THREE.Group();
  readonly rnd: () => number;
  private colliders: RAPIER.Collider[] = [];
  private meshes: THREE.Mesh[] = [];
  private fires: { light: THREE.PointLight; flame: THREE.Object3D; base: number; t: number; at: THREE.Vector3 }[] = [];
  private t = 0;
  private built = false;

  /** Builds are in world space; `o` is the site's origin and `yaw` its facing. */
  constructor(readonly scene: THREE.Scene, readonly m: WorldMats, private fx: FX, readonly o: THREE.Vector3, readonly yaw: number, seed: number) {
    this.rnd = mulberry32(seed);
    scene.add(this.group);
  }

  /** A local point (x right, z forward of the site's facing) in world space, on the ground plus `y`. */
  at(x: number, z: number, y = 0) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const wx = this.o.x + x * c + z * s, wz = this.o.z - x * s + z * c;
    return new THREE.Vector3(wx, heightAt(wx, wz) + y, wz);
  }
  /** Ground height at a local point. */
  ground(x: number, z: number) {
    return this.at(x, z).y;
  }

  /** Add a geometry at a local point (on the ground plus y), turned by `ry` on top of the site's facing. */
  add(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, uv = 1.5) {
    const p = this.at(x, z, y);
    const mesh = new THREE.Mesh(uv && g.attributes.normal ? worldUV(g, uv) : g, mat);
    mesh.position.copy(p);
    mesh.rotation.set(rx, this.yaw + ry, rz, 'YXZ');
    this.batch.addObject(mesh);
    return p;
  }
  /** Add at an absolute height (not following the ground at that point). */
  addAt(g: THREE.BufferGeometry, mat: THREE.Material, x: number, absY: number, z: number, ry = 0, rx = 0, rz = 0, uv = 1.5) {
    const p = this.at(x, z);
    p.y = absY;
    const mesh = new THREE.Mesh(uv && g.attributes.normal ? worldUV(g, uv) : g, mat);
    mesh.position.copy(p);
    mesh.rotation.set(rx, this.yaw + ry, rz, 'YXZ');
    this.batch.addObject(mesh);
    return p;
  }
  /** Add a whole object (already shaped around its own origin) at a local point. */
  addObject(o: THREE.Object3D, x: number, y: number, z: number, ry = 0) {
    o.position.copy(this.at(x, z, y));
    o.rotation.y = this.yaw + ry;
    this.batch.addObject(o);
  }
  /** A mesh kept apart from the batch (it moves, glows or comes and goes). */
  live(o: THREE.Object3D) {
    this.group.add(o);
    o.traverse((m) => (m as THREE.Mesh).isMesh && this.meshes.push(m as THREE.Mesh));
    return o;
  }

  /** A box collider at a local point (centre `y` above the ground there). */
  solid(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    const p = this.at(x, z, y);
    const c = physics.addBox(p, new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw + ry, 0)));
    this.colliders.push(c);
    return c;
  }
  /** A box collider at an absolute height. */
  solidAt(w: number, h: number, d: number, x: number, absY: number, z: number, ry = 0) {
    const p = this.at(x, z);
    p.y = absY;
    const c = physics.addBox(p, new THREE.Vector3(w / 2, h / 2, d / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw + ry, 0)));
    this.colliders.push(c);
    return c;
  }
  /** An upright cylinder collider. */
  post(r: number, h: number, x: number, z: number) {
    const p = this.at(x, z, h / 2);
    const c = physics.addCylinder(p, h / 2, r);
    this.colliders.push(c);
    return c;
  }

  /** Take one collider away (a door that opens). */
  dropCollider(c: RAPIER.Collider) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    physics.removeStatic(c);
  }

  // ---- common pieces ----------------------------------------------------------------------------
  rock(x: number, z: number, s: number, sink = 0.3) {
    const g = rockGeo(this.rnd, s * (0.9 + this.rnd() * 0.4), s * (0.6 + this.rnd() * 0.3), s * (0.9 + this.rnd() * 0.4));
    this.add(g, this.m.stone, x, s * 0.5 - sink, z, this.rnd() * 6, 0, 0, 0);
    if (s > 0.7) this.post(s * 0.8, s, x, z);
  }
  /** A ring of stones, logs, and a fire that burns while `lit` says so. */
  campfire(x: number, z: number, size = 1, lit = true) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.add(rockGeo(this.rnd, 0.2 * size, 0.14 * size, 0.2 * size, 0), this.m.stone, x + Math.cos(a) * 0.7 * size, 0.06, z + Math.sin(a) * 0.7 * size, 0, 0, 0, 0);
    }
    for (let k = 0; k < 4; k++) {
      const log = new THREE.CylinderGeometry(0.07 * size, 0.09 * size, 1.0 * size, 6);
      log.rotateX(Math.PI / 2 - 0.4).rotateY((k / 4) * Math.PI * 2);
      this.add(log, this.m.bark, x, 0.2 * size, z, 0, 0, 0, 0);
    }
    if (lit) this.fire(x, 0.35 * size, z, size);
  }
  /** A flame with a flickering light. */
  fire(x: number, y: number, z: number, size = 1) {
    const at = this.at(x, z, y);
    // Flames: an orange outer tongue and a yellow core, additive, flickering.
    const flame = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.26 * size, 0.7 * size, 8, 1, true).translate(0, 0.35 * size, 0), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.14 * size, 0.45 * size, 8).translate(0, 0.22 * size, 0), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (let i = 0; i < 3; i++) {
      const lick = new THREE.Mesh(new THREE.ConeGeometry(0.08 * size, 0.4 * size, 6).translate(0, 0.2 * size, 0), outer.material);
      lick.position.set(Math.cos(i * 2.1) * 0.15 * size, 0, Math.sin(i * 2.1) * 0.15 * size);
      lick.rotation.set(Math.sin(i * 2.1) * 0.3, 0, -Math.cos(i * 2.1) * 0.3);
      flame.add(lick);
    }
    flame.add(outer, inner);
    flame.position.copy(at).add(new THREE.Vector3(0, -0.05 * size, 0));
    const light = new THREE.PointLight(0xff9040, 2.2 * size, 9 * size, 2);
    light.position.copy(at).add(new THREE.Vector3(0, 0.7 * size, 0));
    this.live(flame);
    this.live(light);
    this.fires.push({ light, flame, base: 2.2 * size, t: this.rnd() * 10, at });
  }
  /** A wooden crate or barrel (loot dressing). */
  crate(x: number, z: number, s = 0.6, ry = 0) {
    this.add(new THREE.BoxGeometry(s, s, s), this.m.planks, x, s / 2, z, ry);
  }
  barrel(x: number, z: number, s = 1, lie = false) {
    const g = new THREE.CylinderGeometry(0.3 * s, 0.26 * s, 0.85 * s, 10);
    if (lie) this.add(g, this.m.planks, x, 0.3 * s, z, this.rnd() * 6, Math.PI / 2, 0, 0);
    else this.add(g, this.m.planks, x, 0.42 * s, z, 0, 0, 0, 0);
  }
  /** A chest that can be opened (a lid that lifts when it's looted). */
  chest(x: number, z: number, ry = 0, open = false) {
    const wood = col(0x6a4a2a, 0.85), band = col(0x3a3a3a, 0.5, { metal: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5).translate(0, 0.225, 0), wood);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.52).translate(0, 0.07, 0.26), wood);
    const g = new THREE.Group();
    g.add(box);
    for (const sx of [-0.28, 0.28]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.47, 0.52).translate(sx, 0.235, 0), band);
      g.add(b);
    }
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.45, -0.26);
    hinge.add(lid);
    hinge.rotation.x = open ? -1.6 : 0;
    g.add(hinge);
    g.position.copy(this.at(x, z));
    g.rotation.y = this.yaw + ry;
    this.live(g);
    return { group: g, open: () => (hinge.rotation.x = -1.6), at: g.position.clone() };
  }

  /** Make the batch into meshes. */
  finish() {
    if (this.built) return;
    this.built = true;
    for (const mesh of this.batch.build(this.group)) {
      mesh.castShadow = mesh.receiveShadow = true;
      this.meshes.push(mesh);
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const f of this.fires) {
      f.t += dt;
      const fl = 0.8 + Math.sin(f.t * 13) * 0.12 + Math.sin(f.t * 7.3) * 0.1;
      f.light.intensity = f.base * fl;
      f.flame.scale.set(1 + (fl - 0.8) * 0.3, fl, 1 + (fl - 0.8) * 0.3);
      f.flame.rotation.y += dt * 1.5;
      if (Math.random() < dt * 3) this.fx.add.spawn({ pos: f.at.clone().add(new THREE.Vector3(0, 0.5, 0)), spread: 0.2, count: 1, life: [0.4, 0.8], size: [0.08, 0.01], color: 0xffb050, color2: 0xff3000, upBias: 1.5 });
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.colliders) physics.removeStatic(c);
    this.colliders = [];
    for (const m of this.meshes) {
      // Shared materials stay; merged geometry belongs to this site.
      m.geometry.dispose();
    }
    this.meshes = [];
  }
}
