import * as THREE from 'three';
import type { Interior } from '../world/interior';
import { physics } from '../physics/physics';
import { markClimbable, addGrappleAnchor } from '../player/traversalSurfaces';
/** An open practice wall beside the combat ring: real surfaces, safe landings and repeatable anchors. */
export function buildTraversalLane(root: THREE.Group, it: Interior) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x656c72, roughness: 1 }),
    chalk = new THREE.MeshStandardMaterial({ color: 0xe8ce8d }),
    wood = new THREE.MeshStandardMaterial({ color: 0x896844 });
  const colliders: ReturnType<typeof physics.addBox>[] = [],
    geometries: THREE.BufferGeometry[] = [],
    materials = [stone, chalk, wood];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, solid = false, climb = false) => {
    const g = new THREE.BoxGeometry(w, h, d),
      m = new THREE.Mesh(g, mat);
    geometries.push(g);
    m.position.copy(it.at(x, z, y));
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    if (solid) {
      const c = physics.addBox(m.position, new THREE.Vector3(w / 2, h / 2, d / 2));
      colliders.push(c);
      if (climb) markClimbable(c);
      return c;
    }
  };
  const wall = box(-22, 4, 8, 8, 8, 2, stone, true, true)!;
  // Shelves provide two ledge catches, rests and clear glider launch positions.
  const shelf = box(-17.6, 3.8, 7, 2.8, 0.4, 4, wood, true, true)!;
  const top = box(-22, 7.8, 7.3, 8.1, 0.4, 3.4, wood, true, true)!;
  for (let y = 0.7; y < 7.7; y += 0.8) for (const x of [-24.2, -22, -19.8]) box(x, y, 9.02, 0.4, 0.08, 0.05, chalk);
  for (const [id, x, y, z, c] of [
    ['lower', -17.6, 4, 7, shelf],
    ['upper', -22, 8, 8, top],
  ] as const) {
    const landing = it.at(x, z, y + 0.055);
    addGrappleAnchor({ id: 'practice:' + id, point: landing.clone().add(new THREE.Vector3(0, 1.3, 0)), landing, owner: c.handle });
  }
  // The first wall owns its climb tag even if the practice shelves are removed independently.
  void wall;
  return () => {
    for (const c of colliders) physics.removeStatic(c);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };
}
