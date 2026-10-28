import * as THREE from 'three';
import type { Armour, AttackKind, CritReason, DmgType, Reaction } from './core';

export interface HitInfo {
  damage: number;
  poise: number;
  /** horizontal direction from attacker to target */
  dir: THREE.Vector3;
  at: THREE.Vector3;
  crit: boolean;
  source: 'melee' | 'spell';
  /** combat core: how the blow moved it (none: it held its ground), what kind of blow, why it crit */
  react?: Reaction;
  type?: DmgType;
  reason?: CritReason;
  /** this blow broke its posture */
  broke?: boolean;
  /** batters a raised guard aside (shoves, shield bashes) */
  guardBreak?: boolean;
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
  /** name and level shown over the health bar */
  label?: string;
  level?: number;
  takeHit(h: HitInfo): void;
  // ---- combat core (combat/core.ts): all optional ----
  /** facing (radians, 0 = +Z): backstabs */
  yaw?: number;
  /** what it's made of (default from its kind) */
  armour?: Armour;
  /** a boss: bigger posture, shorter breaks don't apply */
  boss?: boolean;
  postureMax?: number;
  poiseMax?: number;
  /** reads raw poise itself (its own stagger meter): gets every blow's poise unfiltered */
  ownPoise?: boolean;
  /** posture broke: reel for `sec` seconds */
  onBreak?(sec: number): void;
  /** a blow landing at this point hits a weak spot */
  weakPoint?(at: THREE.Vector3): boolean;
}

export const targets = new Set<Target>();
let nextId = 1;
export const newTargetId = () => nextId++;

export interface IncomingAttack {
  damage: number;
  from: THREE.Vector3; // attacker position or projectile origin
  at?: THREE.Vector3; // current impact/projectile position, when applicable
  /** an arrow, bolt or thrown thing (wards can stop these) */
  projectile?: boolean;
  parryable: boolean;
  poise: number;
  onParried?: () => void;
  burn?: number;
  /** shove (m/s) away from the attacker when it lands: charges, slams */
  knock?: number;
  /** venom: damage per second for a few seconds after it lands */
  poison?: number;
  /** webbing: seconds you are slowed and stuck (a roll tears free sooner) */
  web?: number;
  /** combat core: how it can be answered (default normal: block, parry or dodge) */
  kind?: AttackKind;
  /** who swung it (parries build its posture) */
  attacker?: Target;
}

export type DefenceResult = 'dodged' | 'parried' | 'blocked' | 'guardBroken' | 'hit';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
/** Endpoints of a target's vertical hurt capsule. */
export function hurtSegment(t: Target): [THREE.Vector3, THREE.Vector3] {
  const h = t.halfHeight ?? 0;
  return [_a.copy(t.center).setY(t.center.y - h), _b.copy(t.center).setY(t.center.y + h)];
}
