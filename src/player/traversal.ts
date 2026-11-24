import { physics, STATIC_ONLY } from '../physics/physics';

export const WALKABLE_SLOPE = (48 * Math.PI) / 180;
export const WALKABLE_NORMAL = Math.cos(WALKABLE_SLOPE);
const HIKE_NORMAL = Math.cos((30 * Math.PI) / 180);
export interface Support {
  height: number;
  nx: number;
  ny: number;
  nz: number;
}
export interface Motion {
  x: number;
  y: number;
  z: number;
}
/** Physical faces, including authored decks and rocks; interpolated terrain normals are too forgiving at cliffs. */
export function traversalSupport(x: number, z: number, feetY: number): Support | null {
  const top = feetY + 1.3;
  const hit = physics.world.castRayAndGetNormal(new physics.R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 3, true, undefined, STATIC_ONLY);
  if (!hit || hit.normal.x ** 2 + hit.normal.y ** 2 + hit.normal.z ** 2 < 0.5) return null;
  return { height: top - hit.timeOfImpact, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z };
}
export function uphillSpeed(s: Support | null, direction: Motion) {
  if (!s || s.ny >= HIKE_NORMAL) return 1;
  const horizontal = Math.hypot(s.nx, s.nz),
    length = Math.hypot(direction.x, direction.z);
  const uphill = horizontal * length > 1e-6 ? Math.max(0, -(direction.x * s.nx + direction.z * s.nz) / (horizontal * length)) : 0;
  const effort = Math.max(0, Math.min(1, (HIKE_NORMAL - s.ny) / (HIKE_NORMAL - WALKABLE_NORMAL)));
  return 1 - uphill * effort * 0.58;
}
/** Shared by the real player and the capsule regression harness. No uphill lift is granted on unwalkable faces. */
export function resolveTraversalStep(delta: Motion, feetY: number, current: Support | null, ahead: Support | null, grounded: boolean, dt: number, previousSlide = 0) {
  const out = { ...delta };
  const contact = (s: Support | null) => s !== null && s.height > feetY - Math.min(1.5, 0.18 + 0.32 / Math.max(0.15, s.ny) - 0.32) && s.height < feetY + 0.2;
  const steepCurrent = contact(current) && current!.ny < WALKABLE_NORMAL;
  const steepAhead = ahead !== null && ahead.height > feetY - 0.25 && ahead.height < feetY + 0.5 && ahead.ny < WALKABLE_NORMAL;
  const face = steepCurrent ? current : steepAhead ? ahead : null;
  if (face) {
    const uphill = out.x * face.nx + out.z * face.nz,
      denom = face.nx ** 2 + face.nz ** 2;
    if (uphill < 0 && denom > 1e-6) {
      out.x -= (face.nx * uphill) / denom;
      out.z -= (face.nz * uphill) / denom;
    }
  }
  let slide = 0;
  if (steepCurrent && delta.y <= 0) {
    slide = Math.min(5.2, previousSlide + 9 * dt);
    const s = current!,
      length = Math.sqrt(Math.max(1e-6, 1 - s.ny * s.ny));
    const downhillDrop = -(s.nx * out.x + s.nz * out.z) / Math.max(0.15, s.ny);
    out.x += ((s.nx * s.ny) / length) * slide * dt;
    out.z += ((s.nz * s.ny) / length) * slide * dt;
    // Surface contact follows a tangent at the capped slide speed. Carrying
    // last frame's downward velocity here would add gravity again each tick.
    out.y = downhillDrop - length * slide * dt - 0.004;
  } else if (grounded && delta.y <= 0) {
    const run = Math.hypot(out.x, out.z);
    if (run < 1e-5) out.y = -0.001;
    else if (current && ahead && ahead.ny >= WALKABLE_NORMAL) {
      const rise = ahead.height - current.height;
      // A real step can be at most the controller's 40 cm autostep. A high
      // plateau seen by the downward probe must never become a climbing aid.
      if (rise <= 0.4 && rise > -Math.max(0.3, run * 1.3)) out.y = Math.min(rise, run * Math.tan(WALKABLE_SLOPE) + 0.01) - 0.005;
      else out.y = Math.min(delta.y, -22 * dt * dt);
    } else out.y = Math.min(delta.y, -22 * dt * dt);
  }
  return { delta: out, slide, steep: !!face };
}
