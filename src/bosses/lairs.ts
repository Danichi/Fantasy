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

const reedMat = new THREE.MeshStandardMaterial({ color: 0x6a7a3a, roughness: 0.9, side: THREE.DoubleSide });
const poolMat = new THREE.MeshStandardMaterial({ color: 0x2a3a16, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
const stumpMat = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.95 });

/** Mother Ooze's mire: black pools filmed with green, reeds, drowned stumps, the knight's shield. */
export function mire(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const mud = new THREE.Color(0x3e3a24), slick = new THREE.Color(0x4a5a22), dark = new THREE.Color(0x24261a);
  g.add(groundPatch(at, 16, (x, z, rr) => mud.clone().lerp(slick, Math.max(0, Math.sin(x * 0.7 + 1) * Math.cos(z * 0.6)) * 0.8).lerp(dark, THREE.MathUtils.smoothstep(rr, 0.7, 0.2) * 0.4)));
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  // Pools of black water with a green film.
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, d = 4 + r() * 10, R = 1.5 + r() * 2.5;
    const p = new THREE.Mesh(new THREE.CircleGeometry(R, 20).rotateX(-Math.PI / 2), poolMat);
    p.scale.set(1, 1, 0.6 + r() * 0.5);
    p.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) + 0.06, Math.sin(a) * d);
    p.rotation.y = r() * Math.PI;
    g.add(p);
  }
  // Reeds in clumps.
  const blade = new THREE.PlaneGeometry(0.06, 1.3).translate(0, 0.65, 0);
  const reeds = new THREE.InstancedMesh(blade, reedMat, 320);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 320; i++) {
    const c = Math.floor(i / 20);
    const ca = c * 2.4 + seed, cd = 6 + (c % 4) * 3.5;
    const x = Math.cos(ca) * cd + (r() - 0.5) * 2, z = Math.sin(ca) * cd + (r() - 0.5) * 2;
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * Math.PI, (r() - 0.5) * 0.4));
    m.compose(new THREE.Vector3(x, y(x, z), z), q, new THREE.Vector3(1, 0.6 + r() * 0.8, 1));
    reeds.setMatrixAt(i, m);
  }
  g.add(reeds);
  // Drowned stumps.
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, d = 5 + r() * 9;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.25 + r() * 0.2, 0.4, 0.8 + r() * 1.4, 8), stumpMat);
    s.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) + 0.3, Math.sin(a) * d);
    s.rotation.set((r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3);
    s.castShadow = true;
    g.add(s);
  }
  // The knight's shield, half sunk, his colours still showing.
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.7 }));
  sh.position.set(2.5, y(2.5, 3) + 0.12, 3);
  sh.rotation.set(1.2, 0.4, 0.2);
  g.add(sh);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8, metalness: 0.3 }));
  boss.position.set(0, 0.03, 0);
  sh.add(boss);
  return g;
}

const steelMat = new THREE.MeshStandardMaterial({ color: 0x6a5446, roughness: 0.8, metalness: 0.45 });
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
const clothMats = [0x7a2a24, 0x2a3a5a, 0x8a7a4a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide }));
const cairnMat = new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.95 });

/** A rusted blade stuck in the earth at an angle. */
function stuckBlade(r: () => number) {
  const g = new THREE.Group();
  const len = 0.6 + r() * 0.5;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.008).translate(0, len / 2, 0), steelMat);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), steelMat);
  guard.position.y = len;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 6), shaftMat);
  grip.position.y = len + 0.1;
  g.add(blade, guard, grip);
  g.rotation.set((r() - 0.5) * 0.6, r() * Math.PI, (r() - 0.5) * 0.6);
  g.position.y = -0.2;
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** A tattered banner on a leaning pole. */
function banner(r: () => number) {
  const g = new THREE.Group();
  const h = 3 + r() * 1.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 6).translate(0, h / 2, 0), shaftMat);
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), shaftMat);
  cross.rotation.z = Math.PI / 2;
  cross.position.set(0.42, h - 0.12, 0);
  // Ragged cloth: a strip with its bottom edge torn and the whole thing sagging.
  const cloth = new THREE.PlaneGeometry(0.8, 1.3, 6, 8).translate(0.42, h - 0.12 - 0.65, 0);
  const p = cloth.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const down = h - 0.12 - y;
    let yy = y;
    if (down > 0.9) yy += (r() * 0.4) * (down - 0.9) * 3;
    p.setXYZ(i, x, yy, Math.sin(x * 7 + y * 3) * 0.05 + down * 0.04);
  }
  cloth.computeVertexNormals();
  const flag = new THREE.Mesh(cloth, clothMats[Math.floor(r() * clothMats.length)]);
  flag.castShadow = true;
  pole.castShadow = true;
  g.add(pole, cross, flag);
  g.rotation.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
  return g;
}

/** A burial cairn: a heap of grey stones. */
function cairn(r: () => number) {
  const g = new THREE.Group();
  const rock = new THREE.IcosahedronGeometry(0.25, 0);
  for (let i = 0; i < 16; i++) {
    const lvl = i < 8 ? 0 : i < 13 ? 1 : 2;
    const a = r() * Math.PI * 2, d = (2 - lvl) * 0.35 * (0.5 + r() * 0.5);
    const m = new THREE.Mesh(rock, cairnMat);
    m.scale.set(1 + r() * 0.6, 0.6 + r() * 0.4, 1 + r() * 0.5);
    m.position.set(Math.cos(a) * d, 0.1 + lvl * 0.3, Math.sin(a) * d);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** A helm lying in the grass. */
function helm(r: () => number) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), steelMat);
  m.scale.set(1, 1.15, 1.1);
  m.rotation.set(1.3 + r(), r() * 6, r() - 0.5);
  m.position.y = 0.08;
  m.castShadow = true;
  return m;
}

/** The Rust Knight's battlefield: trodden grass, cairns for the dead, blades still in the earth, banners nobody took home. */
export function battlefield(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const grass = new THREE.Color(0x5a6a34), dry = new THREE.Color(0x7a7044), earth = new THREE.Color(0x4a3e2a);
  g.add(groundPatch(at, 18, (x, z, rr) => grass.clone().lerp(dry, Math.sin(x * 0.5 + z * 0.3) * 0.5 + 0.5).lerp(earth, THREE.MathUtils.smoothstep(rr, 0.35, 0) * 0.6)));
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  const place = (o: THREE.Object3D, x: number, z: number, lift = 0) => {
    o.position.x = x;
    o.position.z = z;
    o.position.y += y(x, z) + lift;
    g.add(o);
    return o;
  };
  // Blades and spears where they fell, all round the middle.
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 3.5 + r() * 15;
    place(stuckBlade(r), Math.cos(a) * d, Math.sin(a) * d);
  }
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2, d = 5 + r() * 14, len = 2 + r() * 1.2;
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, len, 5).translate(0, len / 2, 0), shaftMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4).translate(0, len + 0.1, 0), steelMat);
    const s = new THREE.Group().add(spear, head);
    s.rotation.set(0.5 + r() * 0.6, r() * Math.PI * 2, 0, 'YXZ');
    s.position.y = -0.3;
    spear.castShadow = true;
    place(s, Math.cos(a) * d, Math.sin(a) * d);
  }
  // Banners, faded, at the edges.
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + r() * 0.5, d = 13 + r() * 6;
    place(banner(r), Math.cos(a) * d, Math.sin(a) * d, -0.2);
  }
  // Cairns for the dead, in a loose ring, with physics so you can't walk through them.
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.4 + r() * 0.4, d = 15 + r() * 5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    place(cairn(r), x, z);
    physics.addCylinder(new THREE.Vector3(at.x + x, at.y + y(x, z) + 0.4, at.z + z), 0.4, 0.75);
  }
  // Helms and bones in the grass.
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 3 + r() * 14;
    place(helm(r), Math.cos(a) * d, Math.sin(a) * d);
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2, d = 6 + r() * 10;
    const rc = ribcage(r);
    rc.scale.setScalar(0.8);
    place(rc, Math.cos(a) * d, Math.sin(a) * d, 0.05);
  }
  // A broken cart wheel.
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 20, Math.PI * 1.5), shaftMat));
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4).translate(0, 0.27, 0), shaftMat);
    sp.rotation.z = k * 0.95;
    wheel.add(sp);
  }
  wheel.rotation.set(-Math.PI / 2 + 0.1, 0, r() * 6);
  place(wheel, 7, -5, 0.06);
  return g;
}

const stakeMat = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95 });
const hideMat = new THREE.MeshStandardMaterial({ color: 0x8a7656, roughness: 1, side: THREE.DoubleSide });
const earthMat = new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x080604 });
const emberMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xff5a14, emissiveIntensity: 1.4, roughness: 1 });

/** Snaggletooth's warren: a burrow in the hillside behind sharpened stakes, a totem, a cookfire, sheep bones. */
export function warren(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const dirt = new THREE.Color(0x5a4a32), trod = new THREE.Color(0x6a5a3e), grassy = new THREE.Color(0x5a6a34);
  g.add(groundPatch(at, 14, (x, z, rr) => dirt.clone().lerp(trod, Math.sin(x * 1.1) * Math.cos(z * 0.8) * 0.5 + 0.5).lerp(grassy, THREE.MathUtils.smoothstep(rr, 0.55, 1) * 0.8)));
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  // The burrow: an earth mound with a dark mouth framed by timbers.
  const mx = 0, mz = -9;
  const mound = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), earthMat);
  mound.scale.set(1.3, 0.7, 1);
  mound.position.set(mx, y(mx, mz) - 0.3, mz);
  mound.receiveShadow = mound.castShadow = true;
  g.add(mound);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16, 0, Math.PI), holeMat);
  mouth.position.set(mx, y(mx, mz + 4.2) - 0.05, mz + 4.15);
  mouth.scale.set(1, 1.2, 1);
  g.add(mouth);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2, 6), stakeMat);
    post.position.set(mx + s * 1.15, y(mx, mz + 4.3) + 0.8, mz + 4.3);
    post.rotation.z = -s * 0.08;
    post.castShadow = true;
    g.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 6), stakeMat);
  lintel.rotation.z = Math.PI / 2;
  lintel.position.set(mx, y(mx, mz + 4.3) + 1.75, mz + 4.3);
  g.add(lintel);
  physics.addCylinder(new THREE.Vector3(at.x + mx, at.y + y(mx, mz) + 1, at.z + mz), 1.2, 4.2);
  // A boar skull nailed over the door.
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), boneMat);
  skull.rotation.x = Math.PI / 2;
  skull.position.set(mx, y(mx, mz + 4.3) + 2.05, mz + 4.45);
  g.add(skull);
  // Sharpened stakes in a ragged arc round the front.
  for (let i = 0; i < 22; i++) {
    const a = -0.4 + (i / 21) * (Math.PI + 0.8) + (r() - 0.5) * 0.08, d = 11.5 + r() * 1.5;
    if (Math.abs(a - Math.PI / 2) < 0.18) continue; // the way in
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 2;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.09, 1.6 + r() * 0.6, 6).translate(0, 0.8, 0), stakeMat);
    st.position.set(x, y(x, z) - 0.15, z);
    st.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    st.castShadow = true;
    g.add(st);
  }
  // A totem: a pole of skulls and a rag.
  const totem = new THREE.Group();
  totem.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6).translate(0, 1.6, 0), stakeMat));
  for (let i = 0; i < 3; i++) {
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), boneMat);
    sk.scale.set(1, 1.1, 1.25);
    sk.position.set(0, 2.9 - i * 0.45, 0.1);
    totem.add(sk);
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8).translate(0.25, 2.6, 0), new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 1, side: THREE.DoubleSide }));
  totem.add(flag);
  totem.position.set(4, y(4, -2), -2);
  totem.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.add(totem);
  // The cookfire: a ring of stones, embers, a spit with something on it.
  const fx = -3.5, fz = 1;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), rockMat);
    s.position.set(fx + Math.cos(a) * 0.6, y(fx, fz) + 0.06, fz + Math.sin(a) * 0.6);
    g.add(s);
  }
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10).rotateX(-Math.PI / 2), emberMat);
  embers.position.set(fx, y(fx, fz) + 0.04, fz);
  g.add(embers);
  for (const s of [-1, 1]) {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 5), stakeMat);
    fork.position.set(fx + s * 0.85, y(fx, fz) + 0.5, fz);
    g.add(fork);
  }
  const spit = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2, 5), stakeMat);
  spit.rotation.z = Math.PI / 2;
  spit.position.set(fx, y(fx, fz) + 1.0, fz);
  g.add(spit);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.7 }));
  haunch.scale.set(1.6, 0.9, 0.9);
  haunch.position.set(fx, y(fx, fz) + 0.95, fz);
  g.add(haunch);
  // Hide lean-tos.
  for (const [hx, hz, ry] of [[6.5, 3, -0.8], [-7, -3, 0.9]] as [number, number, number][]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.8), hideMat);
    t.rotation.set(-0.9, ry, 0);
    t.position.set(hx, y(hx, hz) + 0.7, hz);
    t.castShadow = true;
    g.add(t);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), stakeMat);
    pole.rotation.z = Math.PI / 2;
    pole.rotation.y = ry;
    pole.position.set(hx, y(hx, hz) + 1.3, hz);
    g.add(pole);
  }
  // Sheep bones and a ribcage or two.
  for (let i = 0; i < 2; i++) {
    const rc = ribcage(r);
    rc.scale.setScalar(0.7);
    const x = (r() - 0.5) * 12, z = r() * 6 - 1;
    rc.position.set(x, y(x, z) + 0.05, z);
    g.add(rc);
  }
  return g;
}

const canvasMat = new THREE.MeshStandardMaterial({ color: 0xb8a882, roughness: 1, side: THREE.DoubleSide });
const plankMat = new THREE.MeshStandardMaterial({ color: 0x7a5e40, roughness: 0.9 });
const sackMat = new THREE.MeshStandardMaterial({ color: 0x9a8a62, roughness: 1 });
const woolMat = new THREE.MeshStandardMaterial({ color: 0xbcb096, roughness: 1 });

/** Varga One-Eye's raid camp off the Crown Road: a looted caravan, wool bales and sacks, a banner, a fire. */
export function raidCamp(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const trod = new THREE.Color(0x5a4c34), grass = new THREE.Color(0x5e6a36), ash = new THREE.Color(0x3a342a);
  g.add(groundPatch(at, 16, (x, z, rr) => trod.clone().lerp(grass, THREE.MathUtils.smoothstep(rr, 0.45, 1) * 0.8).lerp(ash, THREE.MathUtils.smoothstep(Math.hypot(x - 3, z - 2), 3, 0) * 0.7)));
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  const put = (o: THREE.Object3D, x: number, z: number, lift = 0, ry = 0) => {
    o.position.set(x, y(x, z) + lift, z);
    o.rotation.y = ry;
    o.traverse((m) => ((m as THREE.Mesh).isMesh && ((m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true)));
    g.add(o);
    return o;
  };
  // The looted wagon, on its side, its canvas torn.
  const wagon = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 3.4), plankMat);
  wagon.add(bed);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 3.4), plankMat);
    side.position.set(s * 0.86, 0.3, 0);
    wagon.add(side);
  }
  const hoopGeo = new THREE.TorusGeometry(0.9, 0.03, 4, 12, Math.PI);
  for (let i = 0; i < 4; i++) {
    const hoop = new THREE.Mesh(hoopGeo, plankMat);
    hoop.position.set(0, 0.5, -1.3 + i * 0.85);
    wagon.add(hoop);
  }
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 2.2, 10, 1, true, -Math.PI / 2, Math.PI * 0.75).rotateX(Math.PI / 2), canvasMat);
  cover.position.set(0, 0.5, -0.4);
  wagon.add(cover);
  for (const [wx, wz] of [[-0.95, 1.2], [0.95, 1.2], [-0.95, -1.2]] as [number, number][]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 16), plankMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(wx, -0.1, wz);
    wagon.add(wheel);
  }
  wagon.rotation.z = Math.PI / 2 - 0.15;
  put(wagon, -7, -4, 0.9, 0.5);
  physics.addCylinder(new THREE.Vector3(at.x - 7, at.y + y(-7, -4) + 0.9, at.z - 4), 0.9, 1.7);
  // A loose wheel, wool bales and grain sacks spilled about.
  const loose = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 16), plankMat);
  loose.rotation.x = Math.PI / 2;
  put(loose, -4, -7, 0.06);
  for (let i = 0; i < 6; i++) {
    // Wool bales: lumpy bundles, roped.
    const bale = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), woolMat);
    bale.scale.set(1.25, 0.8, 0.95);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 4, 16), plankMat);
    rope.rotation.y = Math.PI / 2;
    rope.scale.set(1, 0.85, 1);
    bale.add(rope);
    bale.rotation.set(0, r() * 3, (r() - 0.5) * 0.3);
    put(bale, -10 + r() * 5, 1 + r() * 4, 0.22);
  }
  for (let i = 0; i < 8; i++) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), sackMat);
    sack.scale.set(1, 0.7, 1.3);
    put(sack, -3 + r() * 5, -9 + r() * 4, 0.15, r() * 3);
  }
  // The fire, a spit and the bones of somebody's ox.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), rockMat);
    put(s, 3 + Math.cos(a) * 0.9, 2 + Math.sin(a) * 0.9, 0.08);
  }
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xff5a14, emissiveIntensity: 1.3, roughness: 1 }));
  put(embers, 3, 2, 0.04);
  const rc = ribcage(r);
  rc.scale.setScalar(1.3);
  put(rc, 5, 4.5, 0.1);
  // Hide bedrolls round the fire.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const roll = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 2), new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 1 }));
    put(roll, 3 + Math.cos(a) * 4, 2 + Math.sin(a) * 4, 0.03, -a);
  }
  // Her banner: a tall pole, a red rag with one eye painted on it.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 6).translate(0, 2.5, 0), plankMat);
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 96;
  const cx = cv.getContext('2d')!;
  cx.fillStyle = '#7a1a14';
  cx.fillRect(0, 0, 64, 96);
  cx.fillStyle = '#e8d8b0';
  cx.beginPath();
  cx.ellipse(32, 40, 20, 11, 0, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = '#1a0a08';
  cx.beginPath();
  cx.arc(32, 40, 8, 0, Math.PI * 2);
  cx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.1, 4, 6).translate(0.72, 3.8, 0), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 }));
  const fp = flag.geometry.getAttribute('position');
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 4 + fp.getY(i) * 2) * 0.08);
  flag.geometry.computeVertexNormals();
  const banner = new THREE.Group().add(pole, flag);
  put(banner, -4, 7, -0.2, 0.4);
  physics.addCylinder(new THREE.Vector3(at.x - 4, at.y + y(-4, 7) + 2, at.z + 7), 2, 0.12);
  // Weapon rack: crude spears and axes.
  const rack = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), plankMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.1;
  rack.add(bar);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5), plankMat);
    leg.position.set(s * 1.1, 0.6, 0);
    rack.add(leg);
  }
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 2.2, 5), plankMat);
    sp.position.set(-0.9 + i * 0.45, 1.0, 0.12);
    sp.rotation.x = -0.25;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 4), rockMat);
    head.position.y = 1.2;
    sp.add(head);
    rack.add(sp);
  }
  put(rack, 7, -5, 0, -0.6);
  // A captured caravan pennant trampled in the mud.
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4).rotateX(-Math.PI / 2 + 0.05), new THREE.MeshStandardMaterial({ color: 0x2a4a7a, roughness: 1, side: THREE.DoubleSide }));
  put(pennant, -2, 3, 0.03, 1.2);
  // Trophy stakes: helms of caravan guards.
  for (let i = 0; i < 4; i++) {
    const a = 2.4 + i * 0.5, d = 12 + r() * 2;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2, 5).translate(0, 1, 0), plankMat);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x6a6460, roughness: 0.5, metalness: 0.5 }));
    h.position.y = 2.05;
    st.add(h);
    put(st, Math.cos(a) * d, Math.sin(a) * d, -0.2, r() * 3);
  }
  return g;
}
