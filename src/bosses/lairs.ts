import * as THREE from 'three';
import { heightAt } from '../world/terrainHeight';
import { groundPatch } from '../creatures/dens';
import { physics } from '../physics/physics';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Where field bosses live: a clearing with a few telling things in it, so you
// know whose ground you're on before you see who owns it.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296;
}

const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a766e, roughness: 0.95 });
const mossMat = new THREE.MeshStandardMaterial({ color: 0x4f6a35, roughness: 1 });
const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb2, roughness: 0.7 });

/** A lumpy boulder (a squashed, jittered icosahedron), with moss on top. */
function boulder(r: () => number, size: number) {
  const g = new THREE.IcosahedronGeometry(size, 3);
  const p = g.getAttribute('position');
  const ph = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / size, y = p.getY(i) / size, z = p.getZ(i) / size;
    // Big lumps, then cracks and chips, then a flattish base.
    const k = 0.86 + 0.16 * Math.sin(x * 2.3 + ph) * Math.cos(z * 2.1 - ph) + 0.06 * Math.sin(x * 7 + y * 5 + ph) + 0.03 * Math.sin(z * 13 - y * 11);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (y < -0.3 ? 0.55 : 0.75), p.getZ(i) * k);
  }
  g.deleteAttribute('normal');
  const merged = mergeVertices(g);
  merged.computeVertexNormals();
  const m = new THREE.Mesh(merged, rockMat);
  const moss = new THREE.Mesh(merged, mossMat);
  moss.scale.set(1.02, 0.4, 1.02);
  moss.position.y = size * 0.42;
  m.add(moss);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A ribcage: two rows of curved ribs on a spine. */
function ribcage(r: () => number) {
  const g = new THREE.Group();
  const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 1.1, 3, 6), boneMat);
  spine.rotation.x = Math.PI / 2;
  spine.position.y = 0.05;
  g.add(spine);
  for (let i = 0; i < 6; i++) {
    for (const s of [1, -1]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.28 - Math.abs(i - 2.5) * 0.03, 0.018, 4, 10, Math.PI * 0.8), boneMat);
      rib.rotation.set(0, Math.PI / 2, s > 0 ? 0.1 : Math.PI - 0.1);
      rib.position.set(0, 0.05, -0.45 + i * 0.18);
      rib.scale.y = 1.3;
      g.add(rib);
    }
  }
  g.rotation.set(0, r() * Math.PI * 2, (r() - 0.5) * 0.6);
  return g;
}

/** Old Greyjaw's glade: trampled earth, a mossy outcrop with a dark den mouth, old kills. */
export function wolfGlade(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const earth = new THREE.Color(0x5b4a35), worn = new THREE.Color(0x6e5c44), needles = new THREE.Color(0x4a3a26);
  g.add(groundPatch(at, 11, (x, z, rr) => earth.clone().lerp(worn, Math.sin(x * 0.9 + z * 0.4) * 0.5 + 0.5).lerp(needles, THREE.MathUtils.smoothstep(rr, 0.5, 1) * 0.7)));
  // The outcrop: a heap of boulders on the north side, a gap at its foot.
  const ox = 0, oz = -9;
  const heap: [number, number, number][] = [[-2.6, 0, 2.2], [2.4, 0.2, 2.0], [-0.2, 1.6, 2.6], [-4.4, -0.8, 1.5], [4.2, -0.6, 1.6], [0.4, -2.0, 1.8], [-1.9, 1.8, 1.4], [1.8, 1.9, 1.3]];
  for (const [dx, dy, sz] of heap) {
    const b = boulder(r, sz);
    const x = ox + dx, z = oz + (dy < 0 ? -1.2 : 0.4) - Math.abs(dx) * 0.15;
    b.position.set(x, heightAt(at.x + x, at.z + z) - at.y + Math.max(0, dy) * 0.9 + sz * 0.25, z);
    b.rotation.y = r() * Math.PI * 2;
    g.add(b);
    if (sz > 1.5) physics.addCylinder(new THREE.Vector3(at.x + x, at.y + b.position.y, at.z + z), sz * 0.85, sz * 0.9);
  }
  // Old kills: a ribcage, scattered long bones, a stag's skull with its antlers.
  for (let i = 0; i < 2; i++) {
    const rc = ribcage(r);
    const a = r() * Math.PI * 2, d = 3 + r() * 4;
    rc.position.set(Math.cos(a) * d, heightAt(at.x + Math.cos(a) * d, at.z + Math.sin(a) * d) - at.y + 0.05, Math.sin(a) * d);
    g.add(rc);
  }
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.3 + r() * 0.35, 3, 6), boneMat);
    const a = r() * Math.PI * 2, d = 1 + r() * 7;
    b.position.set(Math.cos(a) * d, heightAt(at.x + Math.cos(a) * d, at.z + Math.sin(a) * d) - at.y + 0.04, Math.sin(a) * d);
    b.rotation.set(Math.PI / 2, 0, r() * Math.PI);
    g.add(b);
  }
  const skull = new THREE.Group();
  const cran = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), boneMat);
  cran.scale.set(1, 0.8, 1.7);
  skull.add(cran);
  for (const s of [1, -1]) {
    const beam = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.5, 3, 6), boneMat);
    beam.position.set(s * 0.18, 0.2, -0.05);
    beam.rotation.set(-0.4, 0, s * -0.6);
    skull.add(beam);
    for (let t = 0; t < 3; t++) {
      const tine = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.16, 3, 5), boneMat);
      tine.position.set(s * (0.24 + t * 0.06), 0.3 + t * 0.07, 0.04);
      tine.rotation.set(0.5, 0, s * -0.2);
      skull.add(tine);
    }
  }
  skull.position.set(-3, heightAt(at.x - 3, at.z + 2) - at.y + 0.1, 2);
  skull.rotation.set(0.2, 0.8, 0.3);
  g.add(skull);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}

const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.95 });
const wetWood = new THREE.MeshStandardMaterial({ color: 0x6e5e48, roughness: 0.75 });
const shellMat = new THREE.MeshStandardMaterial({ color: 0x9a4a2a, roughness: 0.75 });

/** Brine-Maw's cove: a beached wreck cut in half, scattered planks, old shells, a lobster pot. */
export function crabCove(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const sand = new THREE.Color(0xc8b48a), wet = new THREE.Color(0x8a7a5a), weed = new THREE.Color(0x4a5a2a);
  g.add(groundPatch(at, 12, (x, z, rr) => sand.clone().lerp(wet, THREE.MathUtils.smoothstep(z, -2, 8) * 0.6).lerp(weed, Math.max(0, Math.sin(x * 1.3) * Math.cos(z * 0.9) - 0.6) * 1.5 * (1 - rr))));
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  // The wreck: a rowing boat's stern half, ribs standing up out of the sand.
  const hull = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.085, 6, 14, Math.PI * (0.75 - i * 0.04)), i % 2 ? woodMat : wetWood);
    rib.rotation.set(0, Math.PI / 2, Math.PI + 0.3);
    rib.position.set(0, 0.2, -i * 0.45);
    hull.add(rib);
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), wetWood);
  keel.position.set(0, -0.6, -1.4);
  hull.add(keel);
  for (const s of [1, -1]) {
    const strake = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 2.4), woodMat);
    strake.position.set(s * 0.7, -0.1, -1.0);
    strake.rotation.z = s * 0.4;
    hull.add(strake);
  }
  hull.position.set(-4.5, y(-4.5, -2) + 0.45, -2);
  hull.rotation.set(0.15, 0.7, 0.25);
  g.add(hull);
  physics.addCylinder(new THREE.Vector3(at.x - 5.2, at.y + y(-5.2, -3) + 0.6, at.z - 3), 0.6, 1.1);
  // Planks and oars strewn about.
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 1.2 + r() * 1.2), r() < 0.5 ? woodMat : wetWood);
    const a = r() * Math.PI * 2, d = 2 + r() * 8;
    p.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) + 0.04, Math.sin(a) * d);
    p.rotation.set((r() - 0.5) * 0.2, r() * Math.PI, (r() - 0.5) * 0.2);
    g.add(p);
  }
  // Old cast shells (it moults), and broken bits of claw.
  for (let i = 0; i < 4; i++) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), shellMat);
    const a = r() * Math.PI * 2, d = 3 + r() * 6;
    sh.scale.set(1.3, 0.6, 1);
    sh.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) - 0.05, Math.sin(a) * d);
    sh.rotation.set((r() - 0.5) * 0.4, r() * Math.PI, (r() - 0.5) * 0.4);
    g.add(sh);
  }
  // A lobster pot of withies, stove in.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 10, 3, true), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9, wireframe: true }));
  pot.position.set(3.5, y(3.5, -4) + 0.25, -4);
  pot.rotation.z = 1.2;
  g.add(pot);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  return g;
}
