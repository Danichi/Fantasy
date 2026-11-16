import * as THREE from 'three';
import { events } from '../core/events';
import { targets, type Target } from './targets';
import { combatOf, peekCombat } from './core';

// Fluid combat helpers (docs/design/combat-flow.md): who a dash strike goes for,
// who you can vault over, and the warning flash for a blow coming from behind.

/** The foe a dash strike would close on: the nearest one 3 to 6.5 m away inside a narrow cone along `dir`. */
export function dashCandidate(from: THREE.Vector3, dir: THREE.Vector3, min = 3, max = 6.5, cone = 0.82): Target | null {
  const f = dir.clone().setY(0);
  if (f.lengthSq() < 1e-4) return null;
  f.normalize();
  let best: Target | null = null, bd = Infinity;
  for (const t of targets) {
    if (!t.alive || !t.lockable) continue;
    const to = t.position.clone().sub(from);
    if (Math.abs(to.y) > 2) continue;
    to.setY(0);
    const d = to.length() - t.radius;
    if (d > max) continue;
    // Something already in reach along the cone: no dash, just cut it.
    const cos = d > 0.01 ? to.normalize().dot(f) : 1;
    if (cos < cone) continue;
    if (d < min) return null;
    if (d < bd) (bd = d), (best = t);
  }
  return best;
}

/** Reeling, broken or behind a raised shield: a foe you can vault over. */
export function vaultable(t: Target): boolean {
  if (!t.alive || t.boss) return false;
  const s = peekCombat(t);
  return t.stunned || !!s?.broken || (s ? s.reactAgo < 0.9 && s.lastReact !== 'none' : false) || !!(t as Target & { guarding?: boolean }).guarding;
}

/** The vaultable foe right in front, within `reach` m. */
export function vaultTarget(from: THREE.Vector3, dir: THREE.Vector3, reach = 2.2): Target | null {
  const f = dir.clone().setY(0).normalize();
  for (const t of targets) {
    if (!vaultable(t)) continue;
    const to = t.position.clone().sub(from);
    if (Math.abs(to.y) > 1.2) continue;
    to.setY(0);
    const d = to.length() - t.radius;
    if (d < reach && to.normalize().dot(f) > 0.6) return t;
  }
  return null;
}

// ---- the warning flash -----------------------------------------------------------------------------
const warned = new WeakMap<Target, number>();
let clock = 0;

/**
 * Per fixed step: a foe winding up a blow behind you (outside the camera's
 * view, within 7 m) flashes a warning on that side of the screen, once per tell.
 */
export function scanThreats(dt: number, pos: THREE.Vector3, viewDir: THREE.Vector3) {
  clock += dt;
  const v = viewDir.clone().setY(0);
  if (v.lengthSq() < 1e-4) return;
  v.normalize();
  for (const t of targets) {
    if (!t.alive) continue;
    const s = peekCombat(t);
    if (!s) continue;
    const winding = s.read && (s.read.phase === 'windup' || s.read.phase === 'commit') ? s.read.left : s.windupT > 0 ? s.windupT : 0;
    if (winding <= 0) continue;
    const to = t.position.clone().sub(pos).setY(0);
    const d = to.length();
    if (d > 7 || d < 0.01) continue;
    if (to.normalize().dot(v) > 0.2) continue; // in view: you can see it coming
    const last = warned.get(t) ?? -9;
    if (clock - last < 1.2) continue;
    warned.set(t, clock);
    events.emit('threatBehind', { from: t.position.clone(), left: winding });
  }
}

/** For tests and the Sandbox: make the combat state of a target exist. */
export const touchCombat = (t: Target) => combatOf(t);
