import * as THREE from 'three';
import { heightAt } from './terrain';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';
import type { WorldMats } from './buildings';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math';
import { GRASS_MASKS } from './groundWindow';

/**
 * Where the mine is: north of the King's Road, a short trail off it (signposted
 * at the junction), its portal cut into a rocky outcrop. It used to stand on
 * the road itself, a stone arch in open field.
 */
export const MINE_ENTRANCE = new THREE.Vector2(330, -28);
/** keep trees and grass off the outcrop: [x, z, radius] */
export const MINE_CLEARING: [number, number, number] = [MINE_ENTRANCE.x, MINE_ENTRANCE.y - 8, 26];

/** A boulder: a jittered icosahedron, flat-shaded, grey with moss where it faces up. */
function boulderGeo(seed: number, sx: number, sy: number, sz: number) {
  // Weld the shared corners first, then jitter: jittering the separate copies
  // of a corner split the faces apart into shards.
  let g: THREE.BufferGeometry = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute('normal').deleteAttribute('uv'), 1e-4);
  const rnd = mulberry32(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + rnd() * 0.35;
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3);
  const stone = new THREE.Color(0x7c766c), shade = new THREE.Color(0x4f4b46), moss = new THREE.Color(0x56782c), c = new THREE.Color();
  for (let i = 0; i < n.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    c.copy(shade).lerp(stone, Math.min(1, ny * 0.5 + 0.6)).multiplyScalar(0.9 + rnd() * 0.18);
    if (ny > 0.65 && rnd() < 0.85) c.lerp(moss, 0.6);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildMineEntrance(scene: THREE.Scene, m: WorldMats, fx: FX) {
  const at = MINE_ENTRANCE;
  const baseY = heightAt(at.x, at.y) + 0.05;
  const g = new THREE.Group();
  const stone = m.bridgeStone ?? m.stone;
  const wood = m.timber;
  const metal = new THREE.MeshStandardMaterial({ color: 0x34383a, metalness: 0.82, roughness: 0.42 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x383632, roughness: 1 });

  g.add(
    new THREE.Mesh(new THREE.BoxGeometry(1.7, 6.4, 2.3), stone),
    new THREE.Mesh(new THREE.BoxGeometry(1.7, 6.4, 2.3), stone),
    new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.7, 2.3), stone),
  );
  g.children[0].position.set(-4.15, 3.2, 0);
  g.children[1].position.set(4.15, 3.2, 0);
  g.children[2].position.set(0, 5.55, 0);

  const darkness = new THREE.Mesh(
    new THREE.PlaneGeometry(6.8, 4.8),
    new THREE.MeshBasicMaterial({ color: 0x030303 }),
  );
  darkness.position.set(0, 2.45, 1.18);
  g.add(darkness);

  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, 5.3, 0.38), wood);
    post.position.set(sx * 3.7, 2.65, 1.35);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.45, 0.45), wood);
  beam.position.set(0, 5.25, 1.3);
  g.add(beam);

  const track = new THREE.Group();
  for (const x of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 11, 6), metal);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0.12, -5);
    track.add(rail);
  }
  for (let z = 0; z > -11; z -= 2.2) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.34), wood);
    tie.position.set(0, 0.02, z);
    track.add(tie);
  }
  g.add(track);

  const cart = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 1.3), metal);
  cart.position.set(0, 0.8, -3.4);
  g.add(cart);

  for (const [x, z, s] of [[-5.8, -0.8, 1.4], [5.6, 0.5, 1.25]] as const) {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rock);
    b.scale.set(1.5 * s, s, 1.2 * s);
    b.position.set(x, 1.0 * s, z);
    g.add(b);
  }

  // The outcrop the mine is cut into: shoulders either side of the portal and
  // a crag rising behind it (the rails run on into the rock).
  const parts: THREE.BufferGeometry[] = [];
  const crag = (seed: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => {
    const b = boulderGeo(seed, sx, sy, sz);
    b.rotateY(ry);
    b.translate(x, y, z);
    parts.push(b);
  };
  crag(1, 0, 6.5, -9, 9, 8, 7);
  crag(2, -8.5, 3.6, -2.5, 4.6, 4.6, 4.2, 0.4);
  crag(3, 8.6, 3.4, -2.2, 4.4, 4.4, 4.2, -0.3);
  crag(4, -12, 2.4, -9, 5, 4.2, 6, 0.8);
  crag(5, 12.5, 2.6, -10, 5.4, 4.6, 6, -0.6);
  crag(6, -4, 10.5, -12, 5, 4, 5, 0.2);
  crag(7, 5, 9.5, -13, 5.5, 4.4, 5, 1.1);
  crag(8, 0, 3.2, -17, 10, 5, 4, 0.1);
  crag(9, -15.5, 1.2, -1, 2.4, 1.8, 2.2, 0.5);
  crag(10, 15, 1.1, 0.5, 2.2, 1.6, 2, 1.3);
  const hill = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }));
  hill.position.y = -0.6;
  g.add(hill);

  g.position.set(at.x, baseY, at.y);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
  });
  scene.add(g);

  const add = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    physics.addBox(new THREE.Vector3(at.x + x, baseY + y, at.y + z), new THREE.Vector3(hx, hy, hz));
  add(-4.2, 2.5, 0, 0.8, 2.5, 2);
  add(4.2, 2.5, 0, 0.8, 2.5, 2);
  add(0, 5.4, 0, 4.2, 0.35, 1.2);
  add(0, 0.5, -7, 4.2, 0.5, 5);
  // The outcrop's mass: shoulders, the crag behind, its far side.
  add(-10, 4, -5, 5.6, 4, 6.5);
  add(10, 4, -5, 5.6, 4, 6.5);
  add(0, 6, -14, 15, 6, 6);
  add(0, 4, -5.5, 4.2, 4, 3.2); // the tunnel ends in rock a few metres in
  GRASS_MASKS.push({ x: at.x, z: at.y - 8, r: 16, amount: 1 });

  return {
    door: new THREE.Vector3(at.x, baseY + 0.3, at.y - 1.7),
    update(dt: number) {
      if (Math.random() < dt * 2.5) {
        fx.add.spawn({
          pos: new THREE.Vector3(at.x, baseY + 1.2, at.y - 2),
          vel: new THREE.Vector3(0, 0.5, -0.2),
          spread: 0.5,
          count: 1,
          life: [0.5, 1],
          size: [0.06, 0.02],
          color: 0xd6a25c,
          color2: 0x604327,
        });
      }
    },
  };
}
