import * as THREE from 'three';
import { SEA_LEVEL } from '../worldMap';
import { waveAt } from './seaState';
import type { Ship } from './ship';
import type { FX } from '../../fx/particles';
import type { HitInfo } from '../../combat/targets';

// Naval gunnery (docs/design/boating.md §9.1): broadsides from either beam,
// auto-ranged and led onto the nearest enemy in the arc, in four kinds of
// shot (round shot holes the hull, chain shreds the sails, grape sweeps the
// decks, fire pots set her burning); swivel guns aimed freely from the rail;
// raking fire down a ship's length hits half again as hard; and the harpoon, a
// barbed line that bites deep into sea monsters and tethers them: a big one
// then tows your ship until you reel it in or cut the line.

/** Anything at sea a cannonball or harpoon can hit besides a ship (monsters). */
export interface SeaTarget {
  pos: THREE.Vector3;
  radius: number;
  alive: boolean;
  hitBy(dmg: number, from: THREE.Vector3, kind: ShotKind): void;
  /** a long body can be hit anywhere along it, not just at `pos` */
  hitTest?(p: THREE.Vector3, pad: number): boolean;
  /** how it's moving, so the guns can lead it */
  vel?: THREE.Vector3;
  /** a harpoon line holds it (and it tows whatever holds the line) */
  tetherable?: boolean;
  /** set while a line holds it: it swims slower and bleeds */
  held?: boolean;
}

/** People on a deck a grape or swivel shot can cut down (boarders, defenders). */
export interface DeckFoe {
  center: THREE.Vector3;
  alive: boolean;
  takeHit(h: HitInfo): void;
}

export type ShotKind = 'ball' | 'chain' | 'grape' | 'fire' | 'swivel' | 'harpoon';
export const SHOT_NAMES: Record<ShotKind, string> = { ball: 'Round shot', chain: 'Chain shot', grape: 'Grapeshot', fire: 'Fire pots', swivel: 'Swivel', harpoon: 'Harpoon' };

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
  kind: ShotKind;
  life: number;
  line?: THREE.Line;
}

/** A harpoon line between a ship's bow and a monster. */
export interface Tether {
  ship: Ship;
  target: SeaTarget;
  len: number;
  heavy: boolean;
  /** how hard the monster drags the ship (Harpooner: less) */
  tow: number;
  line: THREE.Line;
  strain: number;
}

const BALL_SPEED = 68, HARPOON_SPEED = 55;
const SHOT_COLOR: Partial<Record<ShotKind, number>> = { chain: 0x4a4a52, grape: 0x6a6a70, fire: 0xff7a2a, swivel: 0x5a5a60 };

export class Gunnery {
  private shots: Shot[] = [];
  readonly tethers: Tether[] = [];
  private ballGeo = new THREE.SphereGeometry(0.16, 8, 6);
  private ballMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.6, roughness: 0.4 });
  private kindMats = new Map<ShotKind, THREE.Material>();
  private harpoonGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5).rotateX(Math.PI / 2);
  private harpoonMat = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.8, roughness: 0.3 });
  /** a ship was hit (section, damage, who fired, what with) */
  onShipHit?: (ship: Ship, section: number, dmg: number, by: Ship, kind: ShotKind) => void;
  /** a shot raked a ship down her length */
  onRake?: (ship: Ship, by: Ship) => void;
  /** grapeshot cut down hands aboard a ship */
  onCrewHit?: (ship: Ship, n: number, by: Ship) => void;
  /** a shot splashed or landed near the player (for shake and crew hits) */
  onImpact?: (at: THREE.Vector3, by: Ship) => void;
  /** a harpoon line took hold, or parted */
  onTether?: (t: Tether, event: 'hold' | 'snap') => void;

  constructor(private scene: THREE.Scene, private fx: FX) {}

  /** Reload time (s) for a ship's broadside. */
  static reload(ship: Ship, gunner: number) {
    return (7.5 - Math.min(3, gunner * 1.2)) * (ship.stats.calibre > 1.2 ? 1.2 : 1);
  }

  /**
   * Fire every gun on one side. `range` (m) sets the elevation; `targetPos`
   * overrides the aim yaw toward a target within 35 degrees of the beam.
   */
  broadside(ship: Ship, side: -1 | 1, range = 55, targetPos?: THREE.Vector3, targetVel?: THREE.Vector3, opts: { shot?: ShotKind; dmg?: number; spread?: number } = {}) {
    const n = ship.stats.guns;
    if (!n || ship.sunk || ship.capsized) return 0;
    const shot = opts.shot ?? 'ball';
    // A good gun captain leads a moving target (less the ship's own way).
    if (targetPos) {
      const rel = targetVel?.clone().sub(new THREE.Vector3(Math.sin(ship.yaw) * ship.speed, 0, Math.cos(ship.yaw) * ship.speed));
      targetPos = leadPoint(ship.pos, targetPos, rel?.setY(0), BALL_SPEED * 0.97);
      range = targetPos.distanceTo(ship.pos);
    }
    // Grape and chain carry short: they're for close work.
    const maxRange = shot === 'grape' ? 70 : shot === 'chain' ? 100 : 140;
    // Elevation for the range on a flat arc (plus the ship's roll: fire on the up-roll).
    const elev = 0.5 * Math.asin(Math.max(-1, Math.min(1, (Math.max(12, Math.min(maxRange, range)) * 9.8) / (BALL_SPEED * BALL_SPEED))));
    const beam = new THREE.Vector3(Math.cos(ship.yaw) * -side, 0, -Math.sin(ship.yaw) * -side).normalize();
    let aim = beam.clone();
    if (targetPos) {
      const to = targetPos.clone().sub(ship.pos).setY(0).normalize();
      if (to.dot(beam) > Math.cos((35 * Math.PI) / 180)) aim = to;
    }
    const spread0 = (shot === 'grape' ? 0.16 : 0.05) * (opts.spread ?? 1);
    const dmg = 24 * ship.stats.calibre * (opts.dmg ?? 1);
    for (let k = 0; k < n; k++) {
      const muzzle = ship.toWorld(ship.gunLocal(side, k).add(new THREE.Vector3(-side * 0.6, 0, 0)));
      const spread = (Math.random() - 0.5) * spread0;
      const dir = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      const vel = dir.multiplyScalar(BALL_SPEED * Math.cos(elev)).setY(BALL_SPEED * Math.sin(elev) + (Math.random() - 0.5) * 1.5 * (opts.spread ?? 1));
      vel.x += Math.sin(ship.yaw) * ship.speed;
      vel.z += Math.cos(ship.yaw) * ship.speed;
      this.spawn(ship, muzzle, vel, dmg, shot, k * 0.08);
      // Muzzle flash and a bank of smoke.
      this.fx.add.spawn({ pos: muzzle, vel: aim.clone().multiplyScalar(6), spread: 2, count: 10, life: [0.08, 0.2], size: [0.5, 0.1], color: 0xfff0b0, color2: 0xff6a10, drag: 6 });
      this.fx.alpha.spawn({ pos: muzzle, vel: aim.clone().multiplyScalar(3), spread: 1.4, count: 8, life: [1.6, 3], size: [0.8, 2.6], color: 0xd8d4cc, alpha: 0.55, drag: 1.5, upBias: 0.3, jitter: 0.4 });
    }
    return n;
  }

  /** One swivel gun from the rail, aimed wherever you look (and laid onto a target near that line). */
  swivel(ship: Ship, dir: THREE.Vector3, target?: { pos: THREE.Vector3; vel?: THREE.Vector3 }, dmg = 1) {
    const flat = dir.clone().setY(0).normalize();
    const right = new THREE.Vector3(-Math.cos(ship.yaw), 0, Math.sin(ship.yaw));
    const side = flat.dot(right) > 0 ? 1 : -1;
    const muzzle = ship.toWorld(new THREE.Vector3(-side * ship.beam * 0.5, ship.def.deckY + 1.1, 0));
    let vel = flat.clone().multiplyScalar(BALL_SPEED).setY(dir.y * BALL_SPEED + 2);
    if (target) {
      const at = leadPoint(muzzle, target.pos, target.vel, BALL_SPEED);
      at.y = Math.max(at.y, SEA_LEVEL + waveAt(at.x, at.z).y + 0.4);
      const d = at.clone().sub(muzzle);
      const t = d.length() / BALL_SPEED;
      vel = d.clone().setY(0).normalize().multiplyScalar(BALL_SPEED).setY((at.y - muzzle.y) / Math.max(0.05, t) + 4.9 * t);
    }
    this.spawn(ship, muzzle, vel, 16 * dmg, 'swivel');
    this.fx.add.spawn({ pos: muzzle, vel: flat.clone().multiplyScalar(5), spread: 1.2, count: 8, life: [0.06, 0.15], size: [0.35, 0.08], color: 0xfff0b0, color2: 0xff6a10, drag: 6 });
    this.fx.alpha.spawn({ pos: muzzle, spread: 0.8, count: 5, life: [1, 2], size: [0.5, 1.6], color: 0xd8d4cc, alpha: 0.5, drag: 1.5, upBias: 0.3 });
  }

  /** Fire the harpoon along `dir`; with a target near that line it's aimed (and led) onto it. */
  harpoon(ship: Ship, dir: THREE.Vector3, heavy: boolean, target?: { pos: THREE.Vector3; vel?: THREE.Vector3 }, dmg = 1) {
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
    this.spawn(ship, from, vel, (heavy ? 140 : 80) * dmg, 'harpoon');
  }

  private spawn(from: Ship, pos: THREE.Vector3, vel: THREE.Vector3, dmg: number, kind: ShotKind, delay = 0) {
    let mat: THREE.Material = kind === 'harpoon' ? this.harpoonMat : this.ballMat;
    const c = SHOT_COLOR[kind];
    if (c !== undefined) {
      if (!this.kindMats.has(kind)) this.kindMats.set(kind, new THREE.MeshStandardMaterial({ color: c, emissive: kind === 'fire' ? 0xff4a10 : 0x000000, emissiveIntensity: kind === 'fire' ? 1.5 : 0, metalness: 0.5, roughness: 0.5 }));
      mat = this.kindMats.get(kind)!;
    }
    const mesh = new THREE.Mesh(kind === 'harpoon' ? this.harpoonGeo : this.ballGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const shot: Shot = { mesh, pos: pos.clone(), vel, from, dmg, kind, life: 4 + delay };
    if (kind === 'harpoon') {
      shot.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos, pos]), new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
      this.scene.add(shot.line);
    }
    this.shots.push(shot);
  }

  /** The harpoon line's end at the bow. */
  static bow(ship: Ship) {
    return ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 0.8, ship.length * 0.4));
  }

  update(dt: number, ships: Ship[], monsters: SeaTarget[], foes: DeckFoe[] = []) {
    for (const s of this.shots) {
      s.life -= dt;
      const prev = s.pos.clone();
      s.vel.y -= 9.8 * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      if (s.kind === 'fire' && Math.random() < 0.6) this.fx.add.spawn({ pos: s.pos, spread: 0.3, count: 1, life: [0.15, 0.3], size: [0.3, 0.05], color: 0xffb040, color2: 0xff3a10 });
      if (s.kind === 'harpoon') {
        s.mesh.lookAt(s.pos.clone().add(s.vel));
        (s.line!.geometry as THREE.BufferGeometry).setFromPoints([Gunnery.bow(s.from), s.pos]);
      }
      // People on a deck: grape and swivel shot cut them down.
      if (s.kind === 'grape' || s.kind === 'swivel') for (const f of foes) {
        if (!f.alive || s.life <= 0) continue;
        if (f.center.distanceTo(s.pos) < 1.1 || f.center.distanceTo(prev.clone().lerp(s.pos, 0.5)) < 1.1) {
          f.takeHit({ damage: s.kind === 'swivel' ? 45 : 30, poise: 30, dir: s.vel.clone().setY(0).normalize(), at: f.center.clone(), crit: false, source: 'melee' });
          if (s.kind === 'swivel') s.life = 0;
        }
      }
      // Ships.
      for (const ship of ships) {
        if (ship === s.from || ship.sunk || s.life <= 0) continue;
        if (!ship.contains(s.pos, 0.2) && !ship.contains(prev.clone().lerp(s.pos, 0.5), 0.2)) continue;
        if (s.kind === 'harpoon') { s.life = 0; continue; }
        const local = ship.toLocal(s.pos);
        const high = local.y > ship.def.deckY + 1.8;
        // Raking: a shot travelling down her length, bow to stern, does half as much again.
        const d = s.vel.clone().setY(0).normalize();
        const along = Math.abs(d.x * Math.sin(ship.yaw) + d.z * Math.cos(ship.yaw));
        const rake = along > 0.85 ? 1.6 : 1;
        if (rake > 1) this.onRake?.(ship, s.from);
        const dmg = s.dmg * rake;
        const sec = ship.sectionOf(local);
        if (s.kind === 'chain') {
          ship.sailHp = Math.max(0, ship.sailHp - dmg * 1.2);
          ship.damage(sec, dmg * 0.25);
        } else if (s.kind === 'grape' || s.kind === 'swivel') {
          ship.damage(sec, dmg * 0.15);
          this.onCrewHit?.(ship, s.kind === 'grape' ? 1 + Math.round(Math.random() * rake) : 1, s.from);
        } else if (s.kind === 'fire') {
          ship.damage(sec, dmg * 0.5);
          ship.fire = Math.min(1, ship.fire + 0.35);
        } else if (high) ship.sailHp = Math.max(0, ship.sailHp - dmg * 0.8);
        else ship.damage(sec, dmg);
        if (!high || s.kind !== 'ball') this.onShipHit?.(ship, sec, dmg, s.from, s.kind);
        this.fx.add.spawn({ pos: s.pos, spread: 5, count: 16, life: [0.2, 0.5], size: [0.12, 0.02], color: s.kind === 'fire' ? 0xffa040 : 0xffd090, color2: 0x8a4a1a, gravity: 9 });
        this.fx.alpha.spawn({ pos: s.pos, spread: 2.5, count: 10, life: [0.5, 1.2], size: [0.15, 0.05], color: 0x6a4a2a, alpha: 0.9, gravity: 9 });
        this.onImpact?.(s.pos, s.from);
        s.life = 0;
      }
      // Monsters.
      for (const m of monsters) {
        if (!m.alive || s.life <= 0) continue;
        if (m.hitTest ? m.hitTest(s.pos, 0.4) : m.pos.distanceTo(s.pos) < m.radius + 0.4) {
          const k = s.kind === 'harpoon' ? 1 : s.kind === 'grape' ? 0.5 : s.kind === 'chain' ? 0.9 : s.kind === 'swivel' ? 0.7 : 0.8;
          m.hitBy(s.dmg * k, s.from.pos, s.kind);
          this.fx.alpha.spawn({ pos: s.pos, spread: 3, count: 14, life: [0.4, 0.9], size: [0.18, 0.05], color: 0x5a1a14, alpha: 0.9, gravity: 6 });
          if (s.kind === 'harpoon' && m.tetherable && m.alive && !this.tethers.some((t) => t.target === m)) this.tether(s.from, m, s.dmg > 100);
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
    this.updateTethers(dt);
  }

  // ---- harpoon lines ------------------------------------------------------------------------

  private tether(ship: Ship, target: SeaTarget, heavy: boolean) {
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x2a1e12 }));
    this.scene.add(line);
    const t: Tether = { ship, target, len: Math.max(14, Gunnery.bow(ship).distanceTo(target.pos)), heavy, tow: 1, line, strain: 0 };
    this.tethers.push(t);
    target.held = true;
    this.onTether?.(t, 'hold');
  }

  /** Haul on the line: shorten it (the monster comes to you, or you to it). */
  reel(ship: Ship, dt: number) {
    for (const t of this.tethers) if (t.ship === ship) t.len = Math.max(9, t.len - dt * (t.heavy ? 5 : 3.5));
  }

  /** Cut the line. */
  cut(ship: Ship) {
    for (const t of this.tethers) if (t.ship === ship) this.drop(t);
  }

  tetheredTo(ship: Ship) {
    return this.tethers.find((t) => t.ship === ship) ?? null;
  }

  private drop(t: Tether) {
    t.target.held = false;
    this.scene.remove(t.line);
    t.line.geometry.dispose();
    const i = this.tethers.indexOf(t);
    if (i >= 0) this.tethers.splice(i, 1);
  }

  private updateTethers(dt: number) {
    for (const t of [...this.tethers]) {
      if (!t.target.alive || t.ship.sunk) {
        this.drop(t);
        continue;
      }
      const bow = Gunnery.bow(t.ship);
      const to = t.target.pos.clone().sub(bow);
      const flat = to.clone().setY(0);
      const d = flat.length();
      (t.line.geometry as THREE.BufferGeometry).setFromPoints([bow, t.target.pos.clone().setY(Math.max(t.target.pos.y, SEA_LEVEL))]);
      // Past the line's length the monster drags the ship after it (and swings her head round).
      const over = d - t.len;
      t.strain = Math.max(0, over / t.len);
      if (over > 0) {
        flat.normalize();
        const pull = Math.min(over, over * Math.min(1, dt * 2)) * t.tow;
        t.ship.pos.addScaledVector(flat, pull);
        const want = Math.atan2(flat.x, flat.z);
        t.ship.yaw += Math.atan2(Math.sin(want - t.ship.yaw), Math.cos(want - t.ship.yaw)) * Math.min(1, dt * 0.6 * t.tow);
      }
      // A light line parts under too much strain.
      if (!t.heavy && t.strain > 0.9) {
        this.onTether?.(t, 'snap');
        this.drop(t);
      }
    }
  }

  get flying() {
    return this.shots.length;
  }

  clear() {
    for (const s of this.shots) { this.scene.remove(s.mesh); if (s.line) this.scene.remove(s.line); }
    this.shots = [];
    for (const t of [...this.tethers]) this.drop(t);
  }
}
