import * as THREE from 'three';
import type { HouseSpec } from './buildings';

// Every building you can walk into. Builders register a door as they place a
// house (buildHouse knows where its door is); the interior behind it is built
// only when you step through (world/interior.ts).

export type InteriorKind = 'home' | 'tavern' | 'shop' | 'smithy' | 'guild' | 'hall';

export interface Door {
  /** the doorstep, just outside, on the ground */
  pos: THREE.Vector3;
  /** the direction the door faces (out of the building) */
  yaw: number;
  spec: HouseSpec;
  /** what's inside; resolved from who works nearby when not given */
  kind?: InteriorKind;
  name?: string;
  /** NPC id of whoever keeps the place (they meet you inside) */
  keeper?: string;
}

export const DOORS: Door[] = [];

/**
 * Register the door of a placed house. `local` is buildHouse's `door` (in the
 * house's own frame); the group must already have its final position/rotation.
 */
export function registerDoor(group: THREE.Object3D, local: THREE.Vector3, spec: HouseSpec, extra: Partial<Door> = {}) {
  group.updateMatrixWorld(true);
  const pos = local.clone().applyMatrix4(group.matrixWorld);
  const door: Door = { pos, yaw: group.rotation.y, spec, ...extra };
  DOORS.push(door);
  return door;
}
