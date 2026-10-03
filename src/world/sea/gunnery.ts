import * as THREE from 'three';
import { SEA_LEVEL } from '../worldMap';
import { waveAt } from './seaState';
import type { Ship } from './ship';
import type { FX } from '../../fx/particles';

// Naval gunnery (docs/design/boating.md §9.1): broadsides from either beam,
// auto-ranged on the nearest enemy in the arc; round shot that holes the
// section it strikes (or tears the sails if it flies high); the harpoon, a
// barbed line that bites deep into sea monsters. Balls fly on real arcs and
// splash where they miss.

/** Anything at sea a cannonball or harpoon can hit besides a ship (monsters). */
export interface SeaTarget {
  pos: THREE.Vector3;
  radius: number;
  alive: boolean;
  hitBy(dmg: number, from: THREE.Vector3, kind: 'ball' | 'harpoon'): void;
  /** a long body can be hit anywhere along it, not just at `pos` */
  hitTest?(p: THREE.Vector3, pad: number): boolean;
  /** how it's moving, so the guns can lead it */
  vel?: THREE.Vector3;
}

/** Where to aim so a shot at `speed` meets something at `pos` moving at `vel`. */
export function leadPoint(from: THREE.Vector3, pos: THREE.Vector3, vel: THREE.Vector3 | undefined, speed: number) {
  const p = pos.clone();
  if (!vel) return p;
  for (let k = 0; k < 3; k++) p.copy(pos).addScaledVector(vel, from.distanceTo(p) / speed);
  return p;
}

interface Shot {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  from: Ship;
  dmg: number;
  kind: 'ball' | 'harpoon';
  life: number;
  line?: THREE.Line;
}

const BALL_SPEED = 68, HARPOON_SPEED = 55;

export class Gunnery {
  private shots: Shot[] = [];
  private ballGeo = new THREE.SphereGeometry(0.16, 8, 6);
  private ballMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.6, roughness: 0.4 });
  private harpoonGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5).rotateX(Math.PI / 2);
  private harpoonMat = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.8, roughness: 0.3 });
  /** a ship was hit (section, damage, who fired) */
  onShipHit?: (ship: Ship, section: number, dmg: number, by: Ship) => void;
  /** a shot splashed or landed near the player (for shake and crew hits) */
  onImpact?: (at: THREE.Vector3, by: Ship) => void;

  constructor(private scene: THREE.Scene, private fx: FX) {}

  /** Reload time (s) for a ship's broadside. */
  static reload(ship: Ship, gunner: number) {
    return (7.5 - Math.min(3, gunner * 1.2)) * (ship.stats.calibre > 1.2 ? 1.2 : 1);
  }

  /**
   * Fire every gun on one side. `range` (m) sets the elevation; `targetPos`
   * overrides the aim yaw toward a target within 35 degrees of the beam.
   */
  broadside(ship: Ship, side: -1 | 1, range = 55, targetPos?: THREE.Vector3, targetVel?: THREE.Vector3) {
    const n = ship.stats.guns;
    if (!n || ship.sunk || ship.capsized) return 0;
    // A good gun captain leads a moving target (less the ship's own way).
    if (targetPos) {
      const rel = targetVel?.clone().sub(new THREE.Vector3(Math.sin(ship.yaw) * ship.speed, 0, Math.cos(ship.yaw) * ship.speed));
      targetPos = leadPoint(ship.pos, targetPos, rel?.setY(0), BALL_SPEED * 0.97);
      range = targetPos.distanceTo(ship.pos);
    }
    // Elevation for the range on a flat arc (plus the ship's roll: fire on the up-roll).
    const elev = 0.5 * Math.asin(Math.max(-1, Math.min(1, (Math.max(12, Math.min(140, range)) * 9.8) / (BALL_SPEED * BALL_SPEED))));
    const beam = new THREE.Vector3(Math.cos(ship.yaw) * -side, 0, -Math.sin(ship.yaw) * -side).normalize();
    let aim = beam.clone();
    if (targetPos) {
      const to = targetPos.clone().sub(ship.pos).setY(0).normalize();
      if (to.dot(beam) > Math.cos((35 * Math.PI) / 180)) aim = to;
    }
    for (let k = 0; k < n; k++) {
      const muzzle = ship.toWorld(ship.gunLocal(side, k).add(new THREE.Vector3(-side * 0.6, 0, 0)));
      const spread = (Math.random() - 0.5) * 0.05;
      const dir = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      const vel = dir.multiplyScalar(BALL_SPEED * Math.cos(elev)).setY(BALL_SPEED * Math.sin(elev) + (Math.random() - 0.5) * 1.5);
      vel.x += Math.sin(ship.yaw) * ship.speed;
      vel.z += Math.cos(ship.yaw) * ship.speed;
      this.spawn(ship, muzzle, vel, 24 * ship.stats.calibre, 'ball', k * 0.08);
      // Muzzle flash and a bank of smoke.
      this.fx.add.spawn({ pos: muzzle, vel: aim.clone().multiplyScalar(6), spread: 2, count: 10, life: [0.08, 0.2], size: [0.5, 0.1], color: 0xfff0b0, color2: 0xff6a10, drag: 6 });
      this.fx.alpha.spawn({ pos: muzzle, vel: aim.clone().multiplyScalar(3), spread: 1.4, count: 8, life: [1.6, 3], size: [0.8, 2.6], color: 0xd8d4cc, alpha: 0.55, drag: 1.5, upBias: 0.3, jitter: 0.4 });
    }
    return n;
  }

  /** Fire the harpoon along `dir`; with a target near that line it's aimed (and led) onto it. */
  harpoon(ship: Ship, dir: THREE.Vector3, heavy: boolean, target?: { pos: THREE.Vector3; vel?: THREE.Vector3 }) {
    const from = ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 0.8, ship.length * 0.4));
    let vel = dir.clone().setY(0).normalize().multiplyScalar(HARPOON_SPEED).setY(4);
    if (target) {
      const rel = target.vel?.clone().sub(new THREE.Vector3(Math.sin(ship.yaw) * ship.speed, 0, Math.cos(ship.yaw) * ship.speed));
      const at = leadPoint(from, target.pos, rel?.setY(0), HARPOON_SPEED);
      at.y = Math.max(at.y, SEA_LEVEL + waveAt(at.x, at.z).y + 0.1); // at what shows above the water
      const flat = at.clone().sub(from).setY(0);
      const t = flat.length() / HARPOON_SPEED;
      // straight at it, lifted to cancel the drop over the flight
      vel = flat.normalize().multiplyScalar(HARPOON_SPEED).setY((at.y - from.y) / Math.max(0.05, t) + 4.9 * t);
    }
    this.spawn(ship, from, vel, heavy ? 140 : 80, 'harpoon');
  }

  private spawn(from: Ship, pos: THREE.Vector3, vel: THREE.Vector3, dmg: number, kind: 'ball' | 'harpoon', delay = 0) {
    const mesh = new THREE.Mesh(kind === 'ball' ? this.ballGeo : this.harpoonGeo, kind === 'ball' ? this.ballMat : this.harpoonMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const shot: Shot = { mesh, pos: pos.clone(), vel, from, dmg, kind, life: 4 + delay };
    if (kind === 'harpoon') {
      shot.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos, pos]), new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
      this.scene.add(shot.line);
    }
    this.shots.push(shot);
  }

  update(dt: number, ships: Ship[], monsters: SeaTarget[]) {
    for (const s of this.shots) {
      s.life -= dt;
      const prev = s.pos.clone();
      s.vel.y -= 9.8 * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      if (s.kind === 'harpoon') {
        s.mesh.lookAt(s.pos.clone().add(s.vel));
        const from = s.from.toWorld(new THREE.Vector3(0, s.from.def.deckY + 0.8, s.from.length * 0.4));
        (s.line!.geometry as THREE.BufferGeometry).setFromPoints([from, s.pos]);
      }
      // Ships.
      for (const ship of ships) {
        if (ship === s.from || ship.sunk || s.life <= 0) continue;
        if (!ship.contains(s.pos, 0.2) && !ship.contains(prev.clone().lerp(s.pos, 0.5), 0.2)) continue;
        const local = ship.toLocal(s.pos);
        const high = local.y > ship.def.deckY + 1.8;
        if (high) ship.sailHp = Math.max(0, ship.sailHp - s.dmg * 0.8);
        else {
          const sec = ship.sectionOf(local);
          ship.damage(sec, s.dmg);
          this.onShipHit?.(ship, sec, s.dmg, s.from);
        }
        this.fx.add.spawn({ pos: s.pos, spread: 5, count: 16, life: [0.2, 0.5], size: [0.12, 0.02], color: 0xffd090, color2: 0x8a4a1a, gravity: 9 });
        this.fx.alpha.spawn({ pos: s.pos, spread: 2.5, count: 10, life: [0.5, 1.2], size: [0.15, 0.05], color: 0x6a4a2a, alpha: 0.9, gravity: 9 });
        this.onImpact?.(s.pos, s.from);
        s.life = 0;
      }
      // Monsters.
      for (const m of monsters) {
        if (!m.alive || s.life <= 0) continue;
        if (m.hitTest ? m.hitTest(s.pos, 0.4) : m.pos.distanceTo(s.pos) < m.radius + 0.4) {
          m.hitBy(s.dmg * (s.kind === 'harpoon' ? 1 : 0.8), s.from.pos, s.kind);
          this.fx.alpha.spawn({ pos: s.pos, spread: 3, count: 14, life: [0.4, 0.9], size: [0.18, 0.05], color: 0x5a1a14, alpha: 0.9, gravity: 6 });
          s.life = 0;
        }
      }
      // The sea.
      if (s.life > 0 && s.pos.y < SEA_LEVEL + waveAt(s.pos.x, s.pos.z).y) {
        this.fx.alpha.spawn({ pos: s.pos.clone().setY(SEA_LEVEL + 0.2), vel: new THREE.Vector3(0, 6, 0), spread: 2.5, count: 18, life: [0.5, 1.1], size: [0.35, 0.12], color: 0xeaf6fa, alpha: 0.8, gravity: 10 });
        this.onImpact?.(s.pos, s.from);
        s.life = 0;
      }
    }
    for (const s of this.shots) if (s.life <= 0) {
      this.scene.remove(s.mesh);
      if (s.line) { this.scene.remove(s.line); s.line.geometry.dispose(); }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  get flying() {
    return this.shots.length;
  }

  clear() {
    for (const s of this.shots) { this.scene.remove(s.mesh); if (s.line) this.scene.remove(s.line); }
    this.shots = [];
  }
}
