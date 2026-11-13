import * as THREE from 'three';
import type { Ship } from './ship';
export interface ShipMotion {
  speed: number;
  yawRate: number;
  side: number;
  sailSet: number;
  sheet: number;
  anchored: boolean;
  reefed: boolean;
  water: number;
  fire: number;
  mastCap: number;
  capsized: boolean;
  stormExposure: number;
  pressT?: number;
  drift?: [number, number];
  windOverride?: { dir: [number, number]; speed: number } | null;
}
export function shipMotion(s: Ship): ShipMotion {
  return {
    speed: s.speed,
    yawRate: s.yawRate,
    side: s.side,
    sailSet: s.sailSet,
    sheet: s.sheet,
    anchored: s.anchored,
    reefed: s.reefed,
    water: s.water,
    fire: s.fire,
    mastCap: s.mastCap,
    capsized: s.capsized,
    stormExposure: s.stormExposure,
    pressT: s.pressT,
    drift: s.driftLog.toArray() as [number, number],
    windOverride: s.windOverride
      ? {
          dir: s.windOverride.dir.toArray() as [number, number],
          speed: s.windOverride.speed,
        }
      : null,
  };
}
export function restoreMotion(s: Ship, m?: ShipMotion) {
  if (!m) return;
  for (const key of ['speed', 'yawRate', 'side', 'sailSet', 'sheet', 'water', 'fire', 'mastCap', 'stormExposure'] as const) {
    const n = m[key];
    if (Number.isFinite(n)) s[key] = n;
  }
  s.sailSet = Math.max(0, Math.min(1, s.sailSet));
  s.anchored = !!m.anchored;
  s.reefed = !!m.reefed;
  s.capsized = !!m.capsized;
  s.pressT = m.pressT ?? 0;
  s.driftLog.fromArray(m.drift ?? [0, 0]);
  s.windOverride = m.windOverride
    ? {
        dir: new THREE.Vector2(...m.windOverride.dir),
        speed: m.windOverride.speed,
      }
    : null;
  s.place();
  s.place();
}
