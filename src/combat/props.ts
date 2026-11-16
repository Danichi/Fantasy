import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { physics } from '../physics/physics';

// Things in the world a fight can use (docs/design/combat-flow.md, "The world
// as a weapon"): barrels you kick at a foe, braziers that set a foe alight
// when knocked into them, fences a foe breaks through, and pools that soak.
// Anything that builds a scene (the Sandbox, later the world) registers them
// here; combat/impacts.ts and the player's kicks read them.

export type PropKind = 'barrel' | 'brazier' | 'fence' | 'pool';

export interface CombatProp {
  kind: PropKind;
  /** centre on the ground */
  pos: THREE.Vector3;
  /** reach (barrel, brazier) or half-size (fence: along its length; pool: square) */
  radius: number;
  /** fences: the direction they run (unit, horizontal) */
  along?: THREE.Vector3;
  mesh?: THREE.Object3D;
  collider?: RAPIER.Collider;
  alive: boolean;
  /** a barrel in flight */
  vel?: THREE.Vector3;
  /** what to do when it is used up (remove the mesh, drop the collider) */
  onBreak?: () => void;
}

export const combatProps = new Set<CombatProp>();

export function addProp(p: Omit<CombatProp, 'alive'>): CombatProp {
  const prop: CombatProp = { ...p, alive: true };
  combatProps.add(prop);
  return prop;
}

export function breakProp(p: CombatProp) {
  if (!p.alive) return;
  p.alive = false;
  if (p.collider) {
    physics.removeStatic(p.collider);
    p.collider = undefined;
  }
  p.onBreak?.();
  combatProps.delete(p);
}

export function clearProps() {
  for (const p of [...combatProps]) {
    p.onBreak?.();
    if (p.collider) physics.removeStatic(p.collider);
  }
  combatProps.clear();
}

/** The nearest live prop of a kind within reach of a point (fences: distance to the line). */
export function propNear(kind: PropKind, at: THREE.Vector3, reach: number): CombatProp | null {
  let best: CombatProp | null = null, bd = Infinity;
  for (const p of combatProps) {
    if (!p.alive || p.kind !== kind) continue;
    let d: number;
    if (kind === 'fence' && p.along) {
      const rel = at.clone().sub(p.pos).setY(0);
      const u = THREE.MathUtils.clamp(rel.dot(p.along), -p.radius, p.radius);
      d = rel.sub(p.along.clone().multiplyScalar(u)).length();
    } else if (kind === 'pool') {
      d = Math.max(Math.abs(at.x - p.pos.x), Math.abs(at.z - p.pos.z)) - p.radius;
    } else d = Math.hypot(at.x - p.pos.x, at.z - p.pos.z) - p.radius;
    if (d < reach && d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Is a point standing in one of the registered pools? */
export const inPool = (at: THREE.Vector3) => !!propNear('pool', at, 0);
