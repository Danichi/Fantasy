import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { physics, groups, G_STATIC } from '../../physics/physics';
import { buildShip } from '../cityKit';
import { heightAt } from '../terrainHeight';
import { SEA_LEVEL } from '../worldMap';
import { waveAt, windAt, waveHeight, SEA, cellStormAt, currentAt, STORM_WAVES, BASE_WAVES } from './seaState';
import { HULLS, shipStats, type HullId, type Fit, type ShipStats, type HullDef } from './shipTypes';

// A sailable ship (docs/design/boating.md §5–8): the wind drives it by its
// point of sail and the trim of its sails; the waves it floats on pitch, roll
// and heave it, kick its bow off course and, beyond what the hull can take,
// flood it, knock it down and capsize small boats; storms drift it downwind;
// shallows ground it; holes in its three hull sections let water in that the
// pumps must clear, or it sinks. Its deck is a moving platform you can walk on.
// Kinematic (our own integration), so it's deterministic and testable.

export interface ShipControls {
  /** -1 hard to port (left) .. +1 hard to starboard (right) */
  rudder: number;
  /** sail wanted: 0 furled .. 1 full */
  sail: number;
  /** sheet angle (rad from the centreline), or null to trim automatically */
  sheet: number | null;
  reef: boolean;
  anchor: boolean;
  /** oars (small boats): -1 back .. +1 ahead */
  row: number;
}
export const NO_CONTROL = (): ShipControls => ({ rudder: 0, sail: 0, sheet: null, reef: false, anchor: false, row: 0 });

export const SECTION_NAMES = ['bow', 'midships', 'stern'];

/** What the captain's Seamanship does to the ship (seamanship.ts seaPerks; neutral for AI ships). */
export interface ShipPerks {
  tackWindow: number; turn: number; thrown: number; kick: number; groundDmg: number; surf: number;
  trimWidth: number; sailDrive: number; setRate: number; reefSpeed: number; capsizeMargin: number; irons: number; current: number;
}
export const NEUTRAL_PERKS: ShipPerks = { tackWindow: 1, turn: 1, thrown: 1, kick: 1, groundDmg: 1, surf: 1, trimWidth: 1, sailDrive: 1, setRate: 1, reefSpeed: 0.6, capsizeMargin: 1, irons: 32, current: 1 };

/** Degrees off the wind → share of hull speed (0 in irons, best on a beam reach). */
export function polar(deg: number, irons = 32) {
  if (deg < irons) return 0;
  if (deg < 45) return ((deg - irons) / (45 - irons)) * 0.45;
  if (deg < 90) return 0.45 + ((deg - 45) / 45) * 0.55;
  if (deg < 130) return 1 - ((deg - 90) / 40) * 0.12;
  return 0.88 - ((deg - 130) / 50) * 0.25;
}
/** The best sheet angle (rad from the centreline) for a point of sail. */
export const idealSheet = (deg: number) => Math.max(0, Math.min(1, (deg - 25) / 155)) * 1.45;
export const POINT_NAMES = (deg: number) => (deg < 32 ? 'In irons' : deg < 60 ? 'Close-hauled' : deg < 110 ? 'Beam reach' : deg < 150 ? 'Broad reach' : 'Running');

/** A one-sail skiff: a small clinker hull, a mast and a triangular sail. */
function buildSkiff(hull: number) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: hull, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.8, 0.5);
  shape.quadraticCurveTo(-0.82, -0.15, 0, -0.35);
  shape.quadraticCurveTo(0.82, -0.15, 0.8, 0.5);
  shape.lineTo(0.68, 0.5);
  shape.quadraticCurveTo(0.68, -0.05, 0, -0.22);
  shape.quadraticCurveTo(-0.68, -0.05, -0.68, 0.5);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.2, bevelEnabled: false, steps: 10 });
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / 4.2;
    const pinch = t > 0.7 ? 1 - Math.pow((t - 0.7) / 0.3, 1.5) * 0.92 : t < 0.08 ? 0.78 + t * 2.7 : 1;
    p.setX(i, p.getX(i) * pinch);
  }
  geo.translate(0, 0, -2.1);
  geo.computeVertexNormals();
  const h = new THREE.Mesh(geo, wood);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 3.4), dark);
  floor.position.y = -0.12;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.6, 6), dark);
  mast.position.set(0, 2.2, 0.7);
  g.add(h, floor, mast);
  // The sail and its boom swing about the mast.
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, 0.7);
  const cloth = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 4.4, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0.5, -2.4)]);
  cloth.computeVertexNormals();
  const sail = new THREE.Mesh(cloth, new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.95, side: THREE.DoubleSide }));
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), dark);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.48, -1.2);
  pivot.add(sail, boom);
  g.add(pivot);
  g.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
  return { group: g, sails: [pivot] };
}

export class Ship {
  readonly def: HullDef;
  stats: ShipStats;
  readonly group = new THREE.Group();
  private sails: THREE.Object3D[] = [];
  private cannons: THREE.Object3D[] = [];
  private model: THREE.Object3D;
  name: string;
  owner: 'player' | 'rental' | 'pirate' | 'npc' = 'player';

  // Motion.
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  side = 0;
  yawRate = 0;
  heel = 0;
  pitch = 0;
  roll = 0;
  heave = 0;
  private knock = 0; // roll impulse from a broach, decaying
  // Rig and state.
  sailSet = 0;
  sheet = 0;
  reefed = false;
  anchored = true;
  capsized = false;
  sections: number[];
  sailHp: number;
  water = 0;
  sunk = false;
  sinkT = 0;
  /** crew aboard (sails, pumps), from the owner */
  crew = 0;
  /** pumps manned (crew at the pumps, or the player) */
  pumping = 0;
  // Readouts (HUD, tests).
  offWind = 90;
  windSpeed = 0;
  trim = 1;
  thrown = 0;
  kick = 0;
  grounded = false;
  /** surfing surge (0..), the current under the hull (m/s), for the HUD */
  surge = 0;
  currentSpeed = 0;
  currentId = '';
  /** the captain's Seamanship, a called wind, all canvas pressed, leaning out (0..1) */
  perks: ShipPerks = NEUTRAL_PERKS;
  windOverride: { dir: THREE.Vector2; speed: number } | null = null;
  pressT = 0;
  lean = 0;
  /** how far storms have carried her (m), for the log after a storm */
  driftLog = new THREE.Vector2();
  /** fire aboard (0..1) and a sprung mast (sails can't pass this share) */
  fire = 0;
  mastCap = 1;
  /** events the owner reacts to */
  onEvent?: (e: 'broach' | 'capsize' | 'ground' | 'lightning' | 'sinking' | 'sunk' | 'greenWater' | 'tack' | 'jibe' | 'irons' | 'surf' | 'rogue' | 'shallows', detail?: number) => void;
  private prevWindSide = 0;
  private ironsT = 0;
  private ironsSaid = false;
  private tackSpeed = 0;
  private surfT = 0;
  private shallowT = 0;

  // The deck: a kinematic body that moves with the hull.
  private deckBody: RAPIER.RigidBody | null = null;
  readonly frame = new THREE.Matrix4();
  readonly prevFrame = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  private lightningT = 8;
  private broachT = 0;

  constructor(private scene: THREE.Scene, readonly hull: HullId, public fit: Fit, opts: { name: string; hullColor?: number; trim?: number; sail?: number; flag?: number } = { name: 'Boat' }) {
    this.def = HULLS[hull];
    this.stats = shipStats(hull, fit);
    this.name = opts.name;
    this.sections = [this.stats.hull, this.stats.hull, this.stats.hull];
    this.sailHp = this.stats.sails;
    if (this.def.model === 'skiff') {
      const s = buildSkiff(opts.hullColor ?? 0x9a6a3e);
      this.model = s.group;
      this.sails = s.sails;
    } else {
      const s = buildShip(this.def.model, opts.hullColor ?? 0x5a3a24, opts.trim ?? 0xc9a25a, { rigged: true, sail: opts.sail, flag: opts.flag });
      this.model = s.group;
      this.sails = s.sails;
    }
    this.group.add(this.model);
    this.buildCannons();
    scene.add(this.group);
  }

  get length() { return this.def.length; }
  get beam() { return this.def.beam; }
  get maxHull() { return this.stats.hull; }
  get hullFrac() { return (this.sections[0] + this.sections[1] + this.sections[2]) / (3 * this.stats.hull); }

  /** New paint, canvas and colours: the model is rebuilt. */
  repaint(hullColor: number, trim: number, sail?: number, flag?: number) {
    this.group.remove(this.model);
    this.model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    if (this.def.model === 'skiff') {
      const s = buildSkiff(hullColor);
      this.model = s.group;
      this.sails = s.sails;
    } else {
      const s = buildShip(this.def.model, hullColor, trim, { rigged: true, sail, flag });
      this.model = s.group;
      this.sails = s.sails;
    }
    this.group.add(this.model);
    this.cannons = [];
    this.buildCannons();
    this.place();
  }

  /** Re-fit (shipyard upgrades): new numbers, new guns. */
  refit(fit: Fit) {
    const old = this.stats;
    this.fit = fit;
    this.stats = shipStats(this.hull, fit);
    this.sections = this.sections.map((h) => Math.min(this.stats.hull, h * (this.stats.hull / old.hull)));
    this.sailHp = Math.min(this.stats.sails, this.sailHp * (this.stats.sails / old.sails));
    this.buildCannons();
  }

  repairAll() {
    this.sections = [this.stats.hull, this.stats.hull, this.stats.hull];
    this.sailHp = this.stats.sails;
    this.water = 0;
  }

  private buildCannons() {
    for (const c of this.cannons) this.model.remove(c);
    this.cannons = [];
    const n = this.stats.guns;
    if (!n) return;
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.45 });
    for (const s of [-1, 1]) for (let k = 0; k < n; k++) {
      const local = this.gunLocal(s as -1 | 1, k);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.1, 8), iron);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.copy(local);
      barrel.castShadow = true;
      this.model.add(barrel);
      this.cannons.push(barrel);
    }
  }

  /** Where gun `k` on side `s` (-1 port/left, +1 starboard/right) sits, in the ship's frame. */
  gunLocal(s: -1 | 1, k: number) {
    const n = Math.max(1, this.stats.guns);
    const z = n === 1 ? 0 : -this.length * 0.24 + (k / (n - 1)) * this.length * 0.48;
    // (local +x is the ship's left: the frame faces +z with x to the left of the bow)
    return new THREE.Vector3(-s * this.beam * 0.52, this.def.deckY * 0.82, z);
  }

  /** A point in the ship's frame to world space. */
  toWorld(local: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.frame);
  }
  /** A world point into the ship's frame. */
  toLocal(world: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(world).applyMatrix4(new THREE.Matrix4().copy(this.frame).invert());
  }
  /** Which hull section a point in the ship's frame is nearest. */
  sectionOf(local: THREE.Vector3) {
    return local.z > this.length * 0.17 ? 0 : local.z < -this.length * 0.17 ? 2 : 1;
  }
  /** Is a world point inside the hull (cannonballs, rams, bites)? */
  contains(world: THREE.Vector3, pad = 0) {
    const l = this.toLocal(world);
    return Math.abs(l.x) < this.beam * 0.5 + pad && Math.abs(l.z) < this.length * 0.5 + pad && l.y > -this.def.draft - 1 - pad && l.y < this.def.deckY + 2.5 + pad;
  }

  damage(section: number, amount: number) {
    if (this.sunk) return;
    this.sections[section] = Math.max(0, this.sections[section] - amount);
  }

  /** Every frame: wind, sails, waves, damage, water, and where the ship goes. */
  update(dt: number, ctl: ShipControls, opts: { skill: number; assisted: boolean }) {
    if (this.sunk) return this.sinking(dt);
    const L = this.length, B = this.beam;
    const heading = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    // (Right of the heading: turning right lowers the yaw.)
    const right = new THREE.Vector2(-Math.cos(this.yaw), Math.sin(this.yaw));

    // ---- wind and sails ----
    const pk = this.perks;
    this.pressT = Math.max(0, this.pressT - dt);
    const w = this.windOverride ?? windAt(this.pos.x, this.pos.z);
    this.windSpeed = w.speed;
    const from = w.dir.clone().negate();
    const offWind = Math.acos(Math.max(-1, Math.min(1, heading.dot(from)))) * (180 / Math.PI);
    this.offWind = offWind;
    // Which side the wind comes over: the sails swing to the other (leeward) side.
    const windSide = Math.sign(heading.x * from.y - heading.y * from.x) || 1;
    const want = idealSheet(offWind);
    const auto = ctl.sheet === null || opts.assisted;
    const target = auto ? want : ctl.sheet!;
    this.sheet += (target - this.sheet) * Math.min(1, dt * 2.5);
    const err = this.sheet - want;
    this.trim = auto ? 0.96 : Math.max(0.2, 1 - Math.abs(err) / (0.6 * pk.trimWidth));
    // Setting and furling sail takes hands: fast with a crew, slow without one.
    const hands = this.crew >= this.def.crewMin ? 1 : 0.35 + 0.65 * (this.crew / Math.max(1, this.def.crewMin));
    const setRate = (0.35 + hands * 0.4) * dt * pk.setRate;
    const sailWant = this.capsized || ctl.anchor ? 0 : ctl.sail;
    this.sailSet += Math.max(-setRate, Math.min(setRate, sailWant - this.sailSet));
    this.reefed = ctl.reef;
    this.anchored = ctl.anchor;
    const reef = this.reefed ? pk.reefSpeed : 1;
    const sailHealth = (0.35 + 0.65 * (this.sailHp / this.stats.sails)) * this.mastCap;
    const pressing = this.pressT > 0;
    const irons = pk.irons - (pressing ? 8 : 0);
    const windFactor = Math.pow(Math.max(0.15, Math.min(1.5, w.speed / 9)), 0.7);
    let targetSpeed = this.stats.speed * polar(offWind, irons) * pk.sailDrive * (pressing ? 1.2 : 1) * this.trim * this.sailSet * reef * sailHealth * (0.6 + 0.4 * hands) * windFactor * (1 - this.water * 0.55);
    // Oars for the small boats (and getting out of irons).
    if (ctl.row && (this.hull === 'skiff' || this.hull === 'sloop')) targetSpeed = Math.max(targetSpeed, (this.hull === 'skiff' ? 2.2 : 1.4) * ctl.row);
    if (this.anchored || this.capsized) targetSpeed = 0;

    // ---- the sea under the hull ----
    const pts = [[0, L * 0.42], [0, -L * 0.42], [B * 0.45, 0], [-B * 0.45, 0]].map(([lx, lz]) => {
      const x = this.pos.x + right.x * -lx + heading.x * lz;
      const z = this.pos.z + right.y * -lx + heading.y * lz;
      const s = waveAt(x, z);
      return { y: s.y, dx: s.dx, dz: s.dz };
    });
    const [bow, stern, port, star] = pts;
    const localStorm = Math.max(SEA.storm, cellStormAt(this.pos.x, this.pos.z));
    const H = waveHeight(SEA.amp, localStorm);
    const sea = this.stats.seaworthy * (1 + opts.skill * 0.35);
    // How far beyond the hull's comfort the sea is (0 = fine, 1 = twice what it can take).
    this.thrown = (Math.max(0, H - sea) / sea) * pk.thrown;
    const follow = Math.min(1, dt * (8 / (1 + L / 9)));
    this.heave += ((bow.y + stern.y + port.y + star.y) / 4 - this.heave) * follow;
    this.pitch += (Math.atan2(bow.y - stern.y, L * 0.84) - this.pitch) * follow;
    this.roll += (Math.atan2(port.y - star.y, B * 0.9) - this.roll) * follow;
    // Wave kick: a crest shoving one end of the hull before the other swings the bow.
    const shove = ((bow.dx - stern.dx) * right.x + (bow.dz - stern.dz) * right.y) / (L * 0.84);
    const kickScale = (0.35 + this.thrown * 2.8 + localStorm * 0.6) * (1 - opts.skill * 0.45) * pk.kick / Math.sqrt(this.stats.seaworthy / this.def.seaworthy);
    // (A crest shoving the bow to the right turns it right: the yaw falls.) In
    // heavy seas the ship is also buffeted, a slow wander you must steer against.
    const buffet = Math.sin(SEA.t * 0.37 + this.pos.x * 0.01) * Math.sin(SEA.t * 0.23 + 1.7) * (this.thrown * 0.35 + localStorm * 0.12) * (1 - opts.skill * 0.45);
    this.kick += ((-shove * kickScale * 0.5 + buffet * pk.kick) - this.kick) * Math.min(1, dt * 3);

    // ---- surfing: running before a sea, the face of a wave carries her on ----
    this.surge = 0;
    if (offWind > 105 && this.pitch < -0.04 && this.speed > 2 && !this.anchored) {
      this.surge = Math.min(0.35, -this.pitch * 1.6) * pk.surf;
      targetSpeed *= 1 + this.surge;
      this.surfT -= dt;
      if (this.surge > 0.15 && this.surfT <= 0) {
        this.surfT = 6;
        this.onEvent?.('surf', this.surge);
      }
    }

    // ---- tacking (bow through the wind) and jibing (stern through it) ----
    if (offWind < irons + 10) this.ironsT += dt;
    else if (offWind > irons + 20) this.ironsT = 0;
    if (offWind > irons + 20) this.tackSpeed = Math.abs(this.speed);
    if (this.prevWindSide && windSide !== this.prevWindSide && this.sailSet > 0.3) {
      if (offWind < 90) {
        // A crisp tack carries her way through the eye of the wind.
        const perfect = this.ironsT < 2.4 * pk.tackWindow * (opts.assisted ? 1.4 : 1);
        if (perfect) this.speed = Math.max(this.speed, this.tackSpeed * 0.85);
        this.onEvent?.('tack', perfect ? 1 : 0);
      } else {
        // A jibe: the boom crashes across unless the sail is reefed, or it's light air.
        const crash = w.speed > 7.5 && !this.reefed && this.sailSet > 0.6 && Math.abs(this.yawRate) > 0.12;
        if (crash) {
          this.sailHp = Math.max(0, this.sailHp - this.stats.sails * 0.07);
          if (this.def.capsize) this.knock += (Math.random() < 0.5 ? -1 : 1) * 0.45;
        }
        this.onEvent?.('jibe', crash ? 1 : 0);
      }
      this.ironsT = 0;
      this.ironsSaid = false;
    }
    this.prevWindSide = windSide;
    if (this.ironsT > 4 && Math.abs(this.speed) < 0.6 && this.sailSet > 0.4 && !this.ironsSaid && !this.anchored) {
      this.ironsSaid = true;
      this.onEvent?.('irons');
    }

    // ---- steering ----
    const steer = Math.max(0.2, Math.min(1.1, 0.25 + Math.abs(this.speed) / this.stats.speed));
    const wantYawRate = -ctl.rudder * this.stats.turn * steer * pk.turn;
    this.yawRate += (wantYawRate - this.yawRate) * Math.min(1, dt * 2.5);
    this.yaw += (this.yawRate + this.kick) * dt;

    // ---- speed, leeway, storm drift ----
    const accel = this.def.accel * (targetSpeed > this.speed ? 1 : 1.6);
    this.speed += (targetSpeed - this.speed) * Math.min(1, accel * dt * 0.5);
    const leeway = (offWind < 70 ? 0.12 : 0.05) * this.stats.leeway * this.sailSet;
    const sideTarget = this.speed * leeway * -windSide;
    this.side += (sideTarget - this.side) * Math.min(1, dt);
    const drift = (localStorm * 2.2 + this.thrown * 1.4) * (this.anchored ? 0.25 : 1);
    this.driftLog.x += SEA.windDir.x * drift * dt;
    this.driftLog.y += SEA.windDir.y * drift * dt;
    // The current carries her (riding it with Current Lore, twice as hard).
    const cur = currentAt(this.pos.x, this.pos.z);
    this.currentSpeed = Math.hypot(cur.x, cur.z) * pk.current;
    this.currentId = cur.id;
    const vx = heading.x * this.speed + right.x * this.side + SEA.windDir.x * drift + cur.x * pk.current;
    const vz = heading.y * this.speed + right.y * this.side + SEA.windDir.y * drift + cur.z * pk.current;

    // ---- shallows and shore ----
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const bowX = nx + heading.x * L * 0.45, bowZ = nz + heading.y * L * 0.45;
    const depthBow = SEA_LEVEL - heightAt(bowX, bowZ);
    const depthMid = SEA_LEVEL - heightAt(nx, nz);
    this.grounded = false;
    if (depthBow < 0.3 || depthMid < this.def.draft * 0.6) {
      // Run aground: stop, a shudder, and damage by how fast you hit.
      if (Math.abs(this.speed) > 1.2) {
        this.damage(0, Math.abs(this.speed) * this.stats.hull * 0.035 * pk.groundDmg);
        this.onEvent?.('ground', Math.abs(this.speed));
      }
      this.speed = -Math.sign(this.speed) * 0.4;
      this.grounded = true;
    } else {
      // A leadsman's call: shoal water ahead.
      this.shallowT -= dt;
      if (this.shallowT <= 0 && Math.abs(this.speed) > 1.5) {
        const ahead = SEA_LEVEL - heightAt(nx + heading.x * (L * 0.5 + 25), nz + heading.y * (L * 0.5 + 25));
        if (ahead < this.def.draft + 0.5) {
          this.shallowT = 8;
          this.onEvent?.('shallows');
        }
      }
      if (depthBow < this.def.draft) {
        // Scraping over shallows.
        this.speed *= Math.exp(-2 * dt);
        if (Math.abs(this.speed) > 1.5) this.damage(0, Math.abs(this.speed) * dt * this.stats.hull * 0.01);
      }
      this.pos.x = nx;
      this.pos.z = nz;
    }

    // ---- heel, broaching, capsizing ----
    const press = (w.speed / 12) * this.sailSet * reef * (offWind < 95 ? 1 : 0.4) * (auto ? 1 : 1 + Math.max(0, -err) * 1.5);
    const heelTarget = -windSide * press * (this.def.capsize ? 0.75 : 0.32) * (1 - this.lean * 0.45) / (1 + opts.skill * 0.3);
    this.heel += (heelTarget - this.heel) * Math.min(1, dt * 1.5);
    this.knock *= Math.exp(-0.8 * dt);
    this.broachT -= dt;
    if (this.thrown > 0.35 && this.broachT <= 0) {
      // Beam-on to the big seas is how ships are knocked flat.
      const big = (localStorm > 0.3 ? STORM_WAVES[0] : BASE_WAVES[0]);
      const wd = new THREE.Vector2(big[0], big[1]).normalize();
      const beamOn = 1 - Math.abs(heading.dot(wd));
      if (beamOn > 0.7 && Math.random() < dt * this.thrown * 0.6 * (1 - opts.skill * 0.5)) {
        this.broachT = 6;
        this.knock = (Math.random() < 0.5 ? -1 : 1) * Math.min(1.2, 0.5 + this.thrown * 0.5);
        this.water = Math.min(1, this.water + 0.08 + this.thrown * 0.06);
        this.damage(1, this.stats.hull * 0.06);
        this.onEvent?.('broach', this.thrown);
      }
    }
    if (this.def.capsize && !this.capsized && Math.abs(this.heel + this.knock) > this.def.capsize * pk.capsizeMargin && (!opts.assisted || this.thrown > 0.5)) {
      this.capsized = true;
      this.sailSet = 0;
      this.onEvent?.('capsize');
    }

    // ---- water in the hold ----
    const leaks = this.sections.reduce((a, h) => a + (1 - h / this.stats.hull), 0) * 0.018;
    const seas = this.thrown * 0.022 + (this.pitch < -0.22 && this.speed > 3 ? 0.03 : 0); // green water over the bow
    if (this.pitch < -0.28 && this.speed > 4 && Math.random() < dt * 0.3) this.onEvent?.('greenWater');
    // past the point of no return the pumps can't keep up: she's awash
    const pumps = this.water >= 0.97 ? 0 : 0.012 * this.stats.pump * (1 + this.pumping * 0.8 + Math.min(this.crew, 3) * 0.25);
    this.water = Math.max(0, Math.min(1, this.water + (leaks + seas - pumps) * dt));
    if (this.capsized) this.water = Math.min(1, this.water + dt * 0.01);
    if (this.water >= 0.999 || this.hullFrac <= 0.02) {
      this.sunk = true;
      this.speed = 0;
      this.onEvent?.('sinking');
    }

    // ---- fire aboard: it eats the canvas and the planking until it's put out ----
    if (this.fire > 0) {
      this.sailHp = Math.max(0, this.sailHp - this.stats.sails * 0.02 * this.fire * dt);
      this.damage(1, this.stats.hull * 0.008 * this.fire * dt);
      this.fire = Math.min(1, this.fire + dt * 0.012 * (localStorm > 0.4 ? -2 : 1));
      if (this.fire <= 0) this.fire = 0;
    }

    // ---- lightning on the mast in a storm ----
    if (localStorm > 0.5) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 25 + Math.random() * 50;
        if (Math.random() < localStorm * 0.45) {
          this.sailHp = Math.max(0, this.sailHp - this.stats.sails * 0.3);
          this.damage(1, this.stats.hull * 0.05);
          this.onEvent?.('lightning');
        }
      }
    }

    this.place();
  }

  /**
   * A rogue wave strikes, travelling along `from` (a unit direction): bows on,
   * she climbs it and slams; beam on, she's knocked flat and swamped.
   */
  rogue(from: THREE.Vector2, size: number) {
    if (this.sunk) return 0;
    const heading = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    const meet = -heading.dot(from); // 1 = meeting it bow-on
    const beam = 1 - Math.abs(meet);
    if (beam > 0.55) {
      this.knock = (Math.random() < 0.5 ? -1 : 1) * Math.min(1.4, 0.6 + size * 0.15);
      this.water = Math.min(1, this.water + 0.1 + size * 0.025);
      this.damage(1, this.stats.hull * 0.08 * size * 0.3);
      if (this.def.capsize) { this.capsized = true; this.sailSet = 0; }
      this.onEvent?.('broach', size);
    } else {
      this.pitch = meet > 0 ? 0.5 : -0.4;
      this.water = Math.min(1, this.water + 0.03);
      if (meet < 0) this.damage(2, this.stats.hull * 0.04);
    }
    this.onEvent?.('rogue', beam);
    return beam;
  }

  /** Put the model and the deck where the ship is. */
  place() {
    const capsizeRoll = this.capsized ? 1.9 : 0;
    this.prevFrame.copy(this.frame);
    this.tmpE.set(-this.pitch * 0.85, this.yaw, this.roll * 0.8 + this.heel + this.knock + capsizeRoll, 'YXZ');
    this.tmpQ.setFromEuler(this.tmpE);
    const y = SEA_LEVEL + this.heave - (this.def.model === 'skiff' ? 0.1 : 0.3) - this.water * this.def.draft * 0.35;
    this.frame.compose(new THREE.Vector3(this.pos.x, y, this.pos.z), this.tmpQ, new THREE.Vector3(1, 1, 1));
    this.group.position.set(this.pos.x, y, this.pos.z);
    this.group.quaternion.copy(this.tmpQ);
    // Sails: swing to leeward by the sheet, furl by the set, shorten when reefed.
    const w = this.windOverride ?? windAt(this.pos.x, this.pos.z);
    const heading = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    const from = w.dir.clone().negate();
    const windSide = Math.sign(heading.x * from.y - heading.y * from.x) || 1;
    const square = this.def.model !== 'skiff' && this.def.model !== 'fishing' && this.def.model !== 'sloop';
    for (const s of this.sails) {
      s.rotation.y = -windSide * this.sheet * (square ? 0.5 : 1);
      const k = Math.max(0.05, this.sailSet * (this.reefed ? 0.65 : 1));
      s.scale.set(1, k, 1);
      s.position.y = (1 - k) * this.def.deckY * 0.6 + (this.def.model === 'skiff' ? (1 - k) * 0.4 : (1 - k) * this.length * 0.25);
      s.visible = this.sailSet > 0.03;
    }
    if (this.deckBody) {
      // Moved into place (no platform velocity: whatever stands on the deck is
      // carried exactly by the owner), and its colliders synced for queries now.
      const p = new THREE.Vector3(0, this.def.deckY - 0.12, 0).applyMatrix4(this.frame);
      this.deckBody.setTranslation(p, false);
      this.deckBody.setRotation(this.tmpQ, false);
      physics.world.propagateModifiedBodyPositionsToColliders();
    }
  }

  private sinking(dt: number) {
    this.sinkT += dt;
    this.heave -= dt * (0.4 + this.sinkT * 0.05);
    this.pitch += dt * 0.04;
    this.knock += dt * 0.03;
    this.place();
    if (this.sinkT > 28 && this.group.visible) {
      this.group.visible = false;
      this.disableDeck();
      this.onEvent?.('sunk');
    }
  }

  /** The deck (and rails) as a moving platform you can stand and fight on. */
  enableDeck() {
    if (this.deckBody || this.def.model === 'skiff') return;
    const L = this.length, B = this.beam;
    const p = new THREE.Vector3(0, this.def.deckY - 0.12, 0).applyMatrix4(this.frame);
    this.deckBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setRotation(this.tmpQ));
    const g = groups(G_STATIC, 0xffff);
    const add = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(g), this.deckBody!);
    add(B * 0.42, 0.12, L * 0.4, 0, 0, 0);
    for (const s of [-1, 1]) add(0.08, 0.6, L * 0.4, s * B * 0.44, 0.7, 0);
    add(B * 0.44, 0.6, 0.08, 0, 0.7, L * 0.41);
    add(B * 0.44, 0.6, 0.08, 0, 0.7, -L * 0.41);
  }

  disableDeck() {
    if (!this.deckBody) return;
    physics.world.removeRigidBody(this.deckBody);
    this.deckBody = null;
  }

  get hasDeck() {
    return !!this.deckBody;
  }

  /** Is a world point standing on this deck (feet within the rails, near deck height)? */
  onDeck(world: THREE.Vector3) {
    const l = this.toLocal(world);
    return Math.abs(l.x) < this.beam * 0.46 && Math.abs(l.z) < this.length * 0.42 && l.y > this.def.deckY - 1.2 && l.y < this.def.deckY + 2.2;
  }

  /** How the deck moved since the last frame: apply to whatever stands on it. */
  carry(world: THREE.Vector3) {
    const inv = new THREE.Matrix4().copy(this.prevFrame).invert();
    return world.clone().applyMatrix4(inv).applyMatrix4(this.frame);
  }
  carryYaw() {
    const a = new THREE.Euler().setFromRotationMatrix(this.prevFrame, 'YXZ').y;
    const b = new THREE.Euler().setFromRotationMatrix(this.frame, 'YXZ').y;
    return Math.atan2(Math.sin(b - a), Math.cos(b - a));
  }

  dispose() {
    this.disableDeck();
    this.scene.remove(this.group);
  }
}
