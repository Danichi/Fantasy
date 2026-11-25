import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vector3 } from 'three';
export type ClimbSurface = 'rock' | 'terrain';
const surfaces = new Map<number, ClimbSurface>();
export interface GrappleAnchor {
  id: string;
  point: Vector3;
  landing: Vector3;
  owner?: number;
}
export const grappleAnchors = new Map<string, GrappleAnchor>();
export function markClimbable(c: RAPIER.Collider, kind: ClimbSurface = 'rock') {
  surfaces.set(c.handle, kind);
  return c;
}
export function climbSurface(c: RAPIER.Collider) {
  return surfaces.get(c.handle);
}
export function addGrappleAnchor(a: GrappleAnchor) {
  grappleAnchors.set(a.id, a);
}
export function removeGrappleAnchor(id: string) {
  grappleAnchors.delete(id);
}
export function forgetTraversalSurface(c: RAPIER.Collider) {
  surfaces.delete(c.handle);
  for (const [id, a] of grappleAnchors) if (a.owner === c.handle) grappleAnchors.delete(id);
}
export const traversalSurfaceCount = () => surfaces.size;
