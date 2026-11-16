import * as THREE from 'three';
import { physics } from '../physics/physics';
import { events } from '../core/events';
import { strike, combatOf } from './core';
import { targets, type Target } from './targets';
import { afflictions } from './afflictions';
import { waterDepthAt } from '../world/water';
import { combatProps, propNear, breakProp, inPool, type CombatProp } from './props';

// What happens to a foe the player throws around (docs/design/combat-flow.md):
// launched into the air and kept up by air cuts, spiked back down, knocked
// back into a wall (a slam), through a fence, into a brazier or a pool, or off
// a ledge. Works on anything with a velocity and a grounded flag (bandits, the
// dead, orcs, beasts); bosses and heavy foes only stagger.

type Body = Target & { vel?: THREE.Vector3; grounded?: boolean };

const movable = (t: Target): t is Body & { vel: THREE.Vector3 } => (t as Body).vel instanceof THREE.Vector3 && typeof (t as Body).grounded === 'boolean';
/** Light enough to throw about: not a boss, not a wall of posture. */
export const throwable = (t: Target) => movable(t) && !t.boss && (t.poiseMax ?? combatOf(t).poiseMax) <= 75;
/** In the air right now (launched, knocked up). */
export const airborne = (t: Target) => movable(t) && !(t as Body).grounded;

interface Knock {
  t: Body & { vel: THREE.Vector3 };
  dir: THREE.Vector3;
  left: number;
  /** blow damage the slam is scaled from */
  base: number;
  startY: number;
  done: Set<string>;
}

const knocks = new Map<number, Knock>();
const _o = new THREE.Vector3();

/** Up into the air (a launcher): `vy` m/s up, dazed while it flies. */
export function launch(t: Target, vy: number): boolean {
  if (!throwable(t) || !t.alive) return false;
  const b = t as Body & { vel: THREE.Vector3 };
  b.vel.y = vy;
  b.vel.x *= 0.2;
  b.vel.z *= 0.2;
  b.grounded = false;
  t.stunned = true;
  t.onBreak?.(Math.max(1.2, vy / 6));
  events.emit('launched', { target: t });
  return true;
}

/** An air cut keeps a launched foe up near `wantY` (your feet): a short hang, not an endless juggle. */
export function juggle(t: Target, from: THREE.Vector3, wantY = t.position.y) {
  if (!airborne(t) || !t.alive) return;
  const b = t as Body & { vel: THREE.Vector3 };
  b.vel.y = THREE.MathUtils.clamp((wantY - t.position.y) * 4 + 2.4, 1.2, 6);
  // Drift with the blow, a little.
  const d = t.position.clone().sub(from).setY(0);
  if (d.lengthSq() > 1e-4) b.vel.addScaledVector(d.normalize(), 0.6);
  t.onBreak?.(0.9);
}

/** Driven down out of the air: lands hard and stays down a moment. */
export function spike(t: Target) {
  if (!airborne(t) || !t.alive) return;
  const b = t as Body & { vel: THREE.Vector3 };
  b.vel.y = -16;
  t.onBreak?.(1.6);
}

/**
 * Knocked back along `dir` at `speed` m/s. For the next half second the foe is
 * watched: a wall it hits is a slam, a fence breaks, a brazier sets it alight,
 * water soaks it, a long drop takes it out of the fight for a while.
 */
export function knock(t: Target, dir: THREE.Vector3, speed: number, base: number) {
  if (!t.alive || !movable(t)) return;
  const d = dir.clone().setY(0);
  if (d.lengthSq() < 1e-6) return;
  d.normalize();
  const heavy = !throwable(t);
  const sp = heavy ? speed * 0.35 : speed;
  t.vel.x = d.x * sp;
  t.vel.z = d.z * sp;
  if (!heavy) {
    t.vel.y = Math.max(t.vel.y, 1.6);
    t.grounded = false;
  }
  knocks.set(t.id, { t, dir: d, left: 0.55, base, startY: t.position.y, done: new Set() });
}

function slam(k: Knock, kind: 'wall' | 'fence', mult: number) {
  const t = k.t;
  k.done.add('wall');
  strike(t, { base: k.base * mult, type: 'blunt', poise: 95, posture: 70, from: t.position.clone().addScaledVector(k.dir, -1), at: t.center.clone(), source: 'melee', heavy: true, noCrit: true, react: 'knockdown' });
  t.vel.x = -k.dir.x * 1.2;
  t.vel.z = -k.dir.z * 1.2;
  t.onBreak?.(1.5);
  t.stunned = true;
  events.emit('worldImpact', { kind, at: t.center.clone() });
}

/** Per fixed step: follow every knocked foe for what it runs into. */
export function stepImpacts(dt: number) {
  for (const [id, k] of knocks) {
    const t = k.t;
    k.left -= dt;
    if (!t.alive || k.left <= 0) {
      knocks.delete(id);
      continue;
    }
    // A fence in the way breaks (and still hurts).
    const fence = propNear('fence', t.position, t.radius + 0.35);
    if (fence && !k.done.has('wall')) {
      breakProp(fence);
      slam(k, 'fence', 0.7);
      continue;
    }
    // A wall: the ray along the knock meets static geometry right in front.
    if (!k.done.has('wall')) {
      _o.copy(t.center);
      const hit = physics.castRay(_o, k.dir, t.radius + 0.45);
      if (hit !== null) {
        slam(k, 'wall', 1.1);
        continue;
      }
    }
    // A brazier: alight.
    if (!k.done.has('fire')) {
      const br = propNear('brazier', t.position, t.radius + 0.3);
      if (br) {
        k.done.add('fire');
        afflictions.burn(t, Math.max(6, k.base * 0.25), 4);
        events.emit('worldImpact', { kind: 'brazier', at: br.pos.clone().setY(br.pos.y + 1) });
      }
    }
    // Water: soaked through, slow to get up.
    if (!k.done.has('water') && (inPool(t.position) || waterDepthAt(t.position.x, t.position.z) > 0.35)) {
      k.done.add('water');
      t.onBreak?.(1.4);
      t.stunned = true;
      strike(t, { base: k.base * 0.2, type: 'blunt', poise: 40, posture: 55, from: t.position.clone().addScaledVector(k.dir, -1), at: t.center.clone(), source: 'melee', noCrit: true });
      events.emit('worldImpact', { kind: 'water', at: t.position.clone() });
    }
    // Off a ledge: a long drop.
    if (!k.done.has('ledge') && t.position.y < k.startY - 2.5) {
      k.done.add('ledge');
      t.onBreak?.(2.2);
      strike(t, { base: k.base * 0.8, type: 'blunt', poise: 80, from: t.position.clone(), at: t.center.clone(), source: 'melee', noCrit: true, react: 'knockdown' });
      events.emit('worldImpact', { kind: 'ledge', at: t.position.clone() });
    }
  }
  stepBarrels(dt);
}

// ---- kicked barrels --------------------------------------------------------------------------------
/** A kick, shove or slide that meets a barrel sends it rolling along `dir`. */
export function kickBarrels(from: THREE.Vector3, dir: THREE.Vector3, reach: number): number {
  let n = 0;
  const f = dir.clone().setY(0).normalize();
  for (const p of combatProps) {
    if (!p.alive || p.kind !== 'barrel' || p.vel) continue;
    const to = p.pos.clone().sub(from).setY(0);
    const d = to.length();
    if (d > reach + p.radius || (d > 0.4 && to.normalize().dot(f) < 0.35)) continue;
    p.vel = f.clone().multiplyScalar(15);
    // Off its spot and rolling: no longer something to bump into.
    if (p.collider) {
      physics.removeStatic(p.collider);
      p.collider = undefined;
    }
    if (p.mesh) p.mesh.rotation.y = Math.atan2(f.x, f.z);
    n++;
  }
  return n;
}

/** Damage a rolling barrel does, set by whoever owns the scene (the player's weapon). */
export const barrelHit = { base: 40 };

function stepBarrels(dt: number) {
  for (const p of combatProps) {
    if (!p.alive || p.kind !== 'barrel' || !p.vel) continue;
    p.pos.addScaledVector(p.vel, dt);
    p.vel.multiplyScalar(Math.exp(-0.9 * dt));
    if (p.mesh) {
      p.mesh.position.x = p.pos.x;
      p.mesh.position.z = p.pos.z;
      // (a barrel lies across its heading and turns over as it rolls)
      (p.mesh.children[0] ?? p.mesh).rotation.x += (p.vel.length() * dt) / 0.4;
    }
    // Rolls into a wall: bursts.
    const wall = physics.castRay(p.pos.clone().setY(p.pos.y + 0.5), p.vel.clone().normalize(), p.radius + 0.1);
    let burst = wall !== null || p.vel.length() < 1.5;
    for (const t of targets) {
      if (burst || !t.alive) break;
      if (Math.hypot(t.position.x - p.pos.x, t.position.z - p.pos.z) > t.radius + p.radius + 0.1) continue;
      strike(t, { base: barrelHit.base * 1.6, type: 'blunt', poise: 90, posture: 60, from: p.pos.clone().addScaledVector(p.vel.clone().normalize(), -1), at: t.center.clone(), source: 'melee', heavy: true, noCrit: true, react: 'knockdown' });
      events.emit('enemyHit', { at: t.center.clone(), amount: Math.round(barrelHit.base * 1.6), crit: false, enemyId: t.id });
      knock(t, p.vel.clone(), 6, barrelHit.base);
      burst = true;
    }
    if (burst) {
      events.emit('worldImpact', { kind: 'barrel', at: p.pos.clone().setY(p.pos.y + 0.5) });
      breakProp(p);
    }
  }
}

/** Forget everything in flight (tests, a Sandbox reset). */
export function resetImpacts() {
  knocks.clear();
}

export type { CombatProp };
