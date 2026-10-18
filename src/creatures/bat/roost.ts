import * as THREE from 'three';
import { heightAt } from '../../world/terrainHeight';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundPatch } from '../dens';

// A bat roost: a tumble of boulders leaning together into an overhang over a
// dark cleft, the ground beneath streaked pale with droppings.

function rock(r: number, seed: number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(r, 3));
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * 0.12 + Math.sin(v.z * 5.3 + seed * 2) * 0.06;
    v.multiplyScalar(1 + n);
    v.y *= 0.8;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Moss and lichen on what faces the sky, darker stone underneath.
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const stoneC = new THREE.Color(0xa29c90), moss = new THREE.Color(0x6f7e45), under = new THREE.Color(0x6e685e), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const up = nor.getY(i);
    const n = Math.sin(pos.getX(i) * 4.1 + seed) * Math.sin(pos.getZ(i) * 3.7 - seed);
    c.copy(stoneC).lerp(under, THREE.MathUtils.smoothstep(-up, 0.1, 0.8)).lerp(moss, THREE.MathUtils.smoothstep(up + n * 0.25, 0.55, 0.85) * 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function batRoost(at: THREE.Vector3, seed: number) {
  let s = seed >>> 0 || 3;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = new THREE.Group();
  g.position.copy(at);
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  g.add(groundPatch(at, 6, (x, z, rr) => new THREE.Color(0x6d675c).lerp(new THREE.Color(0xd6d0c0), (1 - rr) * 0.45 * (0.5 + 0.5 * Math.sin(x * 3 + z * 2)))));
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1 });
  const place = (geo: THREE.BufferGeometry, x: number, yy: number, z: number, rot: [number, number, number], sc: [number, number, number]) => {
    const m = new THREE.Mesh(geo, stone);
    m.position.set(x, yy, z);
    m.rotation.set(...rot);
    m.scale.set(...sc);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  const a = r() * Math.PI * 2;
  const fx = Math.cos(a), fz = Math.sin(a);
  // Two leaning pillars and a capstone: the overhang.
  for (const side of [-1, 1]) {
    const x = -fz * side * 2.2, z = fx * side * 2.2;
    place(rock(1.6, seed + side), x, y(x, z) + 1.4, z, [0.1 * side, r() * 3, 0.25 * side], [1, 1.9, 1.1]);
  }
  place(rock(2.4, seed + 9), 0, y(0, 0) + 3.7, 0, [0.15, a, 0.05], [1.5, 0.6, 1.1]);
  // Boulders round about.
  for (let i = 0; i < 6; i++) {
    const b = r() * Math.PI * 2, d = 3.5 + r() * 3;
    const x = Math.cos(b) * d, z = Math.sin(b) * d;
    const k = 0.5 + r() * 0.9;
    place(rock(1, seed + i * 7), x, y(x, z) + k * 0.4, z, [r(), r() * 3, r()], [k, k * 0.8, k]);
  }
  // The dark cleft behind the arch.
  const cleft = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), dark);
  cleft.position.set(-fx * 0.9, y(0, 0) + 1.6, -fz * 0.9);
  cleft.rotation.y = Math.atan2(fx, fz);
  cleft.scale.set(1, 1.15, 1);
  g.add(cleft);
  return g;
}
