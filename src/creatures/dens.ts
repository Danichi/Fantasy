import * as THREE from 'three';
import { heightAt } from '../world/terrainHeight';

// What a den looks like: churned ground and a few telling props, laid over the terrain.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296;
}

/** A patch of ground hugging the terrain, coloured by a function of (dx, dz, r01). */
export function groundPatch(at: THREE.Vector3, radius: number, color: (dx: number, dz: number, r: number) => THREE.Color, rough = 0.95) {
  // Several rings so the patch can follow the terrain.
  const ring = new THREE.RingGeometry(0.001, radius, 56, 8);
  ring.rotateX(-Math.PI / 2);
  const pos = ring.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z) / radius;
    pos.setY(i, heightAt(at.x + x, at.z + z) - at.y + 0.035 + (1 - r) * 0.01);
    const c = color(x, z, r);
    col.set([c.r, c.g, c.b], i * 3);
  }
  ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ring.computeVertexNormals();
  const m = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  // fade the rim into the grass
  (m.material as THREE.MeshStandardMaterial).onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vR;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvR = length(position.xz) / ' + radius.toFixed(3) + ';');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vR;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.7, 1.0, vR);');
  };
  m.receiveShadow = true;
  return m;
}

/** A boar wallow: a churned mud hollow, rooted-up earth, a rotten log they rub on, old bones. */
export function boarWallow(at: THREE.Vector3, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.copy(at);
  const mud = new THREE.Color(0x4a3524), wet = new THREE.Color(0x2e2117), earth = new THREE.Color(0x6b4e33);
  const n = (x: number, z: number) => Math.sin(x * 1.7 + seed) * Math.cos(z * 1.3 - seed * 0.5) * 0.5 + Math.sin(x * 4.1 - z * 3.3) * 0.25;
  g.add(groundPatch(at, 5.5, (x, z, rr) => {
    const c = earth.clone().lerp(mud, THREE.MathUtils.smoothstep(rr, 0.95, 0.4));
    return c.lerp(wet, THREE.MathUtils.smoothstep(n(x, z) + (1 - rr) * 0.6, 0.55, 0.9) * 0.8);
  }));
  // Clods of turned earth.
  const clodGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const clodMat = new THREE.MeshStandardMaterial({ color: 0x5a4130, roughness: 1 });
  const clods = new THREE.InstancedMesh(clodGeo, clodMat, 26);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 2 + r() * 4;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    const k = 0.5 + r() * 0.9;
    s.set(k * (1 + r()), k * 0.45, k);
    m.compose(new THREE.Vector3(x, heightAt(at.x + x, at.z + z) - at.y + 0.02, z), q, s);
    clods.setMatrixAt(i, m);
  }
  clods.castShadow = clods.receiveShadow = true;
  g.add(clods);
  // A fallen, bark-stripped log, rubbed smooth on one side.
  const la = r() * Math.PI;
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 4.2, 12, 1), new THREE.MeshStandardMaterial({ color: 0x6b5440, roughness: 0.9 }));
  log.rotation.set(0, la, Math.PI / 2);
  const lx = Math.cos(la + 1.6) * 3.6, lz = Math.sin(la + 1.6) * 3.6;
  log.position.set(lx, heightAt(at.x + lx, at.z + lz) - at.y + 0.28, lz);
  log.castShadow = log.receiveShadow = true;
  g.add(log);
  // Bones of something unlucky.
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8cdb2, roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.35 + r() * 0.3, 3, 6), bone);
    const a = r() * Math.PI * 2, d = 1 + r() * 3.5;
    b.position.set(Math.cos(a) * d, heightAt(at.x + Math.cos(a) * d, at.z + Math.sin(a) * d) - at.y + 0.05, Math.sin(a) * d);
    b.rotation.set(Math.PI / 2, 0, r() * Math.PI);
    g.add(b);
  }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bone);
  skull.scale.set(1, 0.8, 1.5);
  skull.position.set(1.2, heightAt(at.x + 1.2, at.z - 0.6) - at.y + 0.07, -0.6);
  g.add(skull);
  return g;
}
