import * as THREE from 'three';

export interface HitInfo {
  damage: number;
  poise: number;
  /** horizontal direction from attacker to target */
  dir: THREE.Vector3;
  at: THREE.Vector3;
  crit: boolean;
  source: 'melee' | 'spell';
}

/** Anything the player can hit or lock on to. */
export interface Target {
  id: number;
  kind: string;
  alive: boolean;
  /** centre of the hurt capsule (vertical: centre +/- halfHeight, radius) */
  center: THREE.Vector3;
  radius: number;
  halfHeight?: number;
  /** feet position, used for pushing apart */
  position: THREE.Vector3;
  /** riposte window: hits deal critical damage */
  stunned: boolean;
  lockable: boolean;
  hp: number;
  maxHp: number;
  takeHit(h: HitInfo): void;
}

export const targets = new Set<Target>();
let nextId = 1;
export const newTargetId = () => nextId++;

export interface IncomingAttack {
  damage: number;
  from: THREE.Vector3; // attacker position or projectile origin
  at?: THREE.Vector3; // current impact/projectile position, when applicable
  parryable: boolean;
  poise: number;
  onParried?: () => void;
  burn?: number;
}

export type DefenceResult = 'dodged' | 'parried' | 'blocked' | 'guardBroken' | 'hit';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
/** Endpoints of a target's vertical hurt capsule. */
export function hurtSegment(t: Target): [THREE.Vector3, THREE.Vector3] {
  const h = t.halfHeight ?? 0;
  return [_a.copy(t.center).setY(t.center.y - h), _b.copy(t.center).setY(t.center.y + h)];
}
