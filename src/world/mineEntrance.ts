import * as THREE from 'three';
import { heightAt } from './terrain';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';
import type { WorldMats } from './buildings';

export function buildMineEntrance(scene: THREE.Scene, m: WorldMats, fx: FX) {
  const at = new THREE.Vector2(250, 34);
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
