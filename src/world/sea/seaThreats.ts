import * as THREE from 'three';
import { SEA_LEVEL } from '../worldMap';
import { waveAt, windAt } from './seaState';
import { Ship, NO_CONTROL, type ShipControls } from './ship';
import { STOCK_FIT, type HullId, type Fit } from './shipTypes';
import { Gunnery, type SeaTarget, type ShotKind } from './gunnery';
import { Bandit, type Bolts } from '../../enemies/bandit';
import { newTargetId, targets, type HitInfo, type Target } from '../../combat/targets';
import { events } from '../../core/events';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { Look } from '../../npc/charBuilder';

// What attacks you at sea (docs/design/boating.md §9): pirate ships that hunt
// you down, trade broadsides, and grapple alongside to send boarders onto your
// deck; the sea serpent, which circles, dives, rams the hull, and rears up
// beside the rail to snatch whoever stands there; and sharks for anyone in the
// water.

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const surface = (x: number, z: number) => SEA_LEVEL + waveAt(x, z).y;

// ---- pirates ------------------------------------------------------------------------------

const PIRATE_NAMES = ['The Black Gull', 'The Salt Widow', 'Red Morrow', 'The Drowned Crow', 'The Rattling Kate', 'The Gallows Tide', 'The Sea Wolf', 'The Bitter Pearl'];
const PIRATE_LOOKS: Look[] = [
  { body: 'male', outfit: 'ranger', hood: false, hair: 'buzzed', beard: true, hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x2a2a30, linen: 0x8a2a2a, height: 1.82 },
  { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x8a3f22, skin: 0xfff0e6, cloth: 0x6a1a1a, height: 1.72 },
  { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x3a2618, skin: 0xe0b894, linen: 0x5a2a2a, cloth: 0x2a2a30, height: 1.76 },
];

/** A pirate hull and guns for how dangerous the sea is. */
export function pirateFit(danger: number): { hull: HullId; fit: Fit } {
  const fit = STOCK_FIT();
  if (danger < 2.2) return { hull: 'cutter', fit: { ...fit, guns: 1, sails: 1 } };
  if (danger < 3.4) return { hull: 'brigantine', fit: { ...fit, guns: 2, hull: 1 } };
  if (danger < 4.4) return { hull: 'brigantine', fit: { ...fit, guns: 3, hull: 2, sails: 2 } };
  return { hull: 'galleon', fit: { ...fit, guns: 3, hull: 2, sails: 2, keel: 2 } };
}

export interface PirateOpts { name?: string; captain?: string; hull?: HullId; fit?: Fit; bounty?: number; colours?: [number, number]; tag?: string }

export class PirateShip {
  readonly ship: Ship;
  state: 'hunt' | 'broadside' | 'board' | 'flee' | 'struck' | 'boarded' | 'taken' | 'sunk' = 'hunt';
  /** pirates sent onto your deck */
  readonly boarders: Bandit[] = [];
  /** pirates holding their own deck when you board her */
  readonly defenders: Bandit[] = [];
  grappled = false;
  plundered = false;
  /** hands aboard: grapeshot thins them; a ship with too few strikes her colours */
  crew: number;
  readonly crewStart: number;
  readonly captain: string;
  /** a story pirate (the Black Tide) */
  readonly tag: string;
  private reload = { [-1]: 2, [1]: 4 } as Record<number, number>;
  private side: -1 | 1 = 1;
  private t = 0;
  readonly bounty: number;

  constructor(private scene: THREE.Scene, private fx: FX, private bolts: Bolts, at: THREE.Vector3, readonly danger: number, opts: PirateOpts = {}) {
    const pf = pirateFit(danger);
    const hull = opts.hull ?? pf.hull, fit = opts.fit ?? pf.fit;
    const [hc, tc] = opts.colours ?? [0x1e1a1c, 0x8a1a1a];
    this.ship = new Ship(scene, hull, fit, { name: opts.name ?? PIRATE_NAMES[Math.floor(Math.random() * PIRATE_NAMES.length)], hullColor: hc, trim: tc });
    this.ship.owner = 'pirate';
    this.ship.crew = this.ship.def.crewMax;
    this.ship.pos.copy(at);
    this.ship.yaw = Math.random() * Math.PI * 2;
    this.ship.anchored = false;
    this.ship.sailSet = 1;
    this.crew = this.crewStart = Math.round(this.ship.def.crewMax * 2 + 4 + danger * 3);
    this.captain = opts.captain ?? `Captain of ${this.ship.name}`;
    this.tag = opts.tag ?? '';
    this.bounty = opts.bounty ?? Math.round(60 + danger * 90 + this.ship.def.length * 6);
  }

  /** Grapeshot and blades: hands lost. */
  loseCrew(n: number) {
    this.crew = Math.max(0, this.crew - n);
    this.ship.crew = Math.max(0, Math.min(this.ship.def.crewMax, Math.round(this.crew / 2)));
  }

  /** Beaten enough to strike: her hull shot through, or too few hands to fight her. */
  get beaten() {
    return this.ship.hullFrac < 0.28 || this.crew < this.crewStart * 0.3;
  }

  /** Steering, sailing and gunnery against the player's ship. */
  update(dt: number, prey: Ship | null, gunnery: Gunnery, playerAboard: boolean) {
    const s = this.ship;
    this.t += dt;
    const ctl: ShipControls = { ...NO_CONTROL(), sail: 1 };
    if (s.sunk) {
      this.state = 'sunk';
      s.update(dt, NO_CONTROL(), { skill: 0.3, assisted: true });
      return;
    }
    if (this.state === 'boarded' || this.state === 'taken') {
      // Lashed alongside the ship that boarded her: she goes where it goes.
      if (prey) this.lashTo(prey, dt);
      s.update(dt, { ...NO_CONTROL(), sail: 0 }, { skill: 0.3, assisted: true });
      this.carryCrew(prey);
      return;
    }
    // Beaten: strike the colours (most do; the proud and the desperate run).
    if (this.state !== 'struck' && !this.grappled && this.beaten) this.state = this.tag || Math.random() < 0.25 ? 'flee' : 'struck';
    if (this.state === 'flee' && this.beaten && this.crew < this.crewStart * 0.2) this.state = 'struck';
    if ((!prey || prey.sunk) && this.state !== 'struck') this.state = 'flee';
    let want = s.yaw;
    if (prey && !prey.sunk) {
      const to = prey.pos.clone().sub(s.pos).setY(0);
      const dist = to.length();
      const bearing = Math.atan2(to.x, to.z);
      if (this.state === 'hunt' || this.state === 'broadside') {
        // Board a crippled or becalmed prey; otherwise hold it abeam at gun range.
        if ((prey.hullFrac < 0.55 || Math.abs(prey.speed) < 1.2) && dist < 80 && playerAboard && this.crew > 6) this.state = 'board';
        else this.state = dist < 75 ? 'broadside' : 'hunt';
      }
      if (this.state === 'hunt') want = bearing;
      else if (this.state === 'broadside') {
        // Keep the prey on one beam, closing if far and opening if close.
        const rel = wrap(bearing - s.yaw);
        this.side = rel < 0 ? 1 : -1;
        const close = dist > 55 ? 0.45 : dist < 30 ? -0.45 : 0;
        want = bearing + this.side * (Math.PI / 2 - close);
        // Fire when the prey is in the arc of the loaded side: chain to cripple
        // a fast ship's sails, fire pots in the wildest water, round shot otherwise.
        for (const side of [-1, 1] as const) {
          this.reload[side] -= dt;
          const beamYaw = s.yaw - side * (Math.PI / 2);
          const off = Math.abs(wrap(bearing - beamYaw));
          if (this.reload[side] <= 0 && off < 0.5 && dist < 110) {
            const shot: ShotKind = this.danger > 3.4 && Math.random() < 0.2 ? 'fire' : this.danger > 1.8 && prey.sailHp > prey.stats.sails * 0.5 && Math.random() < 0.3 ? 'chain' : 'ball';
            gunnery.broadside(s, side, dist, prey.pos, undefined, { shot });
            this.reload[side] = Gunnery.reload(s, 2) + Math.random() * 2;
          }
        }
      } else if (this.state === 'board') {
        want = bearing;
        // The last stretch under sweeps (oars): close alongside whatever the wind.
        if (dist < 34 && !this.grappled) {
          const beside = this.besidePoint(prey);
          const step = beside.sub(s.pos).setY(0);
          const len = step.length();
          if (len > 0.01) s.pos.addScaledVector(step, Math.min(len, dt * (3.5 + Math.abs(prey.speed))) / len);
        }
        if (dist < 14 && !this.grappled) this.grapple(prey);
        if (this.grappled) {
          this.lashTo(prey, dt);
          ctl.sail = 0;
          if (!this.boarders.some((b) => !b.dead)) {
            // Boarders beaten: the pirates strike their colours.
            this.state = 'struck';
            this.grappled = false;
          }
        }
      } else if (this.state === 'flee') {
        want = Math.atan2(windAt(s.pos.x, s.pos.z).dir.x, windAt(s.pos.x, s.pos.z).dir.y);
      }
      if (this.state === 'struck') ctl.sail = 0;
    }
    // Never point into the wind: sail a close-hauled tack instead.
    const w = windAt(s.pos.x, s.pos.z);
    const from = Math.atan2(-w.dir.x, -w.dir.y);
    const intoWind = wrap(want - from);
    if (Math.abs(intoWind) < 0.8) want = from + Math.sign(intoWind || 1) * 0.85;
    if (!this.grappled) ctl.rudder = Math.max(-1, Math.min(1, -wrap(want - s.yaw) * 2));
    s.update(dt, ctl, { skill: 0.3 + this.danger * 0.08, assisted: true });
    this.carryCrew(prey);
  }

  /** The point alongside the prey where she lies when lashed to it. */
  private besidePoint(prey: Ship) {
    return prey.pos.clone().add(new THREE.Vector3(Math.cos(prey.yaw), 0, -Math.sin(prey.yaw)).multiplyScalar(this.side * (prey.beam / 2 + this.ship.beam / 2 + 1)));
  }

  private lashTo(prey: Ship, dt: number) {
    const s = this.ship;
    s.pos.lerp(this.besidePoint(prey), Math.min(1, dt * 1.5));
    s.yaw = prey.yaw;
    s.speed = prey.speed;
  }

  /** Boarders on the prey's deck ride with it; defenders ride their own. */
  private carryCrew(prey: Ship | null) {
    if (prey) for (const b of this.boarders) {
      if (b.dead || !prey.onDeck(b.position)) continue;
      const d = prey.carry(b.position.clone()).sub(b.position);
      b.carry(d.x, d.y, d.z);
    }
    for (const b of this.defenders) {
      if (b.dead || !this.ship.onDeck(b.position)) continue;
      const d = this.ship.carry(b.position.clone()).sub(b.position);
      b.carry(d.x, d.y, d.z);
    }
  }

  private pirate(i: number, at: THREE.Vector3, captain: boolean) {
    const b = new Bandit(i % 3 === 2 ? 'crossbow' : 'sword', at, this.scene, this.bolts, undefined, PIRATE_LOOKS[i % PIRATE_LOOKS.length]);
    b.kind = 'pirate';
    b.name = captain ? this.captain : i % 3 === 2 ? 'Pirate Gunner' : 'Pirate Cutthroat';
    if (captain) b.hp = b.maxHp = 220 + this.danger * 40 + (this.tag ? 160 : 0);
    b.alerted = true;
    return b;
  }

  /** Throw grapples and send boarders onto the prey's deck. */
  private grapple(prey: Ship) {
    this.grappled = true;
    prey.enableDeck();
    const n = Math.max(2, Math.min(6, Math.round(this.crew / 4), 2 + Math.round(this.danger)));
    for (let i = 0; i < n; i++) {
      const local = new THREE.Vector3((Math.random() - 0.5) * prey.beam * 0.5, prey.def.deckY + 0.4, -prey.length * 0.3 + (i / Math.max(1, n - 1)) * prey.length * 0.6);
      this.boarders.push(this.pirate(i, prey.toWorld(local), i === 0));
    }
    this.fx.alpha.spawn({ pos: prey.pos.clone().setY(prey.pos.y + 3), spread: 3, count: 12, life: [0.6, 1.2], size: [0.4, 1.2], color: 0xd8d4cc, alpha: 0.5 });
  }

  /** Lash her to the boarding ship on whichever side she lies (besidePoint's side, in its frame). */
  private lashSide(by: Ship) {
    const port = new THREE.Vector3(Math.cos(by.yaw), 0, -Math.sin(by.yaw));
    this.side = (this.ship.pos.clone().sub(by.pos).dot(port) > 0 ? 1 : -1) as -1 | 1;
    this.grappled = false;
    this.ship.place();
    this.ship.enableDeck();
  }

  /** She has struck and you board her: her crew throw down their arms. */
  yieldTo(by: Ship) {
    this.lashSide(by);
    this.state = 'taken';
  }

  /** You board her: her crew make their stand on their own deck. */
  defend(by: Ship) {
    this.lashSide(by);
    this.state = 'boarded';
    const s = this.ship;
    const n = Math.max(1, Math.min(7, Math.round(this.crew / 3)));
    for (let i = 0; i < n; i++) {
      const local = new THREE.Vector3((Math.random() - 0.5) * s.beam * 0.45, s.def.deckY + 0.4, -s.length * 0.3 + (i / Math.max(1, n - 1)) * s.length * 0.6);
      this.defenders.push(this.pirate(i, s.toWorld(local), i === 0));
    }
  }

  /** Every defender down: she's yours to plunder, ransom or sail home. */
  get won() {
    return this.state === 'boarded' && this.defenders.length > 0 && this.defenders.every((b) => !b.alive);
  }

  updateBoarders(dt: number, player: Player) {
    for (const b of this.boarders) if (!b.dead) b.update(dt, player);
    for (const b of this.defenders) if (!b.dead) b.update(dt, player);
  }

  /** Every pirate fighting (for grapeshot and your crew's blades). */
  fighters() {
    return [...this.boarders, ...this.defenders].filter((b) => b.alive);
  }

  /** Hand her over (a prize): the hull is no longer a pirate's. */
  release() {
    for (const b of this.boarders) b.dispose();
    for (const b of this.defenders) b.dispose();
    this.boarders.length = 0;
    this.defenders.length = 0;
  }

  dispose() {
    this.release();
    this.ship.dispose();
  }
}

// ---- the sea serpent ------------------------------------------------------------------------

export class SeaSerpent implements Target, SeaTarget {
  id = newTargetId();
  kind = 'serpent';
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius = 1.4;
  vel = new THREE.Vector3();
  /** a harpoon line can hold it; while held it's slower, it bleeds, and it can be hauled up */
  tetherable = true;
  held = false;
  /** Monster Lore: its head (when it rears) takes this much more */
  weakMul = 1;
  halfHeight = 1.2;
  center = new THREE.Vector3();
  position = new THREE.Vector3();
  pos = new THREE.Vector3();
  state: 'stalk' | 'dive' | 'ram' | 'rear' | 'dying' = 'stalk';
  private group = new THREE.Group();
  private segs: THREE.Mesh[] = [];
  private head: THREE.Group;
  private trail: THREE.Vector3[] = [];
  private yaw = 0;
  private st = 0;
  private circle = Math.random() * 6.28;
  private bit = false;
  private deathT = 0;
  /** what it did (the owner turns these into damage, toasts and drops) */
  onRam?: (section: number) => void;
  onBite?: () => void;
  onDeath?: () => void;

  constructor(private scene: THREE.Scene, private fx: FX, at: THREE.Vector3, readonly danger: number) {
    this.maxHp = this.hp = Math.round(700 + danger * 220);
    this.pos.copy(at).setY(SEA_LEVEL - 2);
    const scale = Math.min(1.6, 0.9 + danger * 0.15);
    const skin = new THREE.MeshStandardMaterial({ color: 0x1e5a52, roughness: 0.45, metalness: 0.15 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xc8b878, roughness: 0.6 });
    const fin = new THREE.MeshStandardMaterial({ color: 0x8a2a3a, roughness: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) {
      const r = (1.15 - i * 0.032) * scale;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), i % 2 ? skin : skin);
      m.scale.set(1, 0.92, 1.25);
      if (i % 3 === 0 && i > 1) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 1.4, 4), fin);
        f.position.y = r * 0.9;
        f.rotation.x = -0.5;
        m.add(f);
      }
      m.castShadow = true;
      this.group.add(m);
      this.segs.push(m);
    }
    // The head: a long snout, jaws, glowing eyes, a crest.
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1.25 * scale, 14, 10), skin);
    skull.scale.set(0.95, 0.75, 1.6);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1.0 * scale, 12, 8), belly);
    jaw.scale.set(0.8, 0.4, 1.4);
    jaw.position.set(0, -0.55 * scale, 0.5 * scale);
    jaw.name = 'jaw';
    const eyeM = new THREE.MeshStandardMaterial({ color: 0xffe060, emissive: 0xffb020, emissiveIntensity: 1.4 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 8, 6), eyeM);
      e.position.set(s * 0.7 * scale, 0.35 * scale, 0.6 * scale);
      this.head.add(e);
      for (let k = 0; k < 3; k++) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, 0.9 * scale, 5), belly);
        horn.position.set(s * (0.35 + k * 0.15) * scale, 0.75 * scale, (-0.4 - k * 0.45) * scale);
        horn.rotation.x = -0.9;
        this.head.add(horn);
      }
    }
    this.head.add(skull, jaw);
    this.head.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    this.group.add(this.head);
    scene.add(this.group);
    for (let i = 0; i < 200; i++) this.trail.push(this.pos.clone());
    targets.add(this);
  }

  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hurt(h.damage);
    this.fx.alpha.spawn({ pos: h.at, spread: 3, count: 12, life: [0.4, 0.9], size: [0.18, 0.05], color: 0x2a6a4a, alpha: 0.9, gravity: 6 });
  }
  hitBy(dmg: number, _from?: THREE.Vector3, kind?: string) {
    // Its rearing head is the weak point; chain shot tangles the coils.
    this.hurt(dmg * (this.state === 'rear' ? 1.3 * this.weakMul : 1) * (kind === 'chain' ? 1.15 : 1));
  }
  /** The head or any coil of the body. */
  hitTest(p: THREE.Vector3, pad: number) {
    if (this.pos.distanceTo(p) < this.radius + pad) return true;
    for (let i = 0; i < this.segs.length; i += 2) {
      const s = this.segs[i];
      if (s.position.distanceTo(p) < (1.15 - i * 0.032) * s.scale.z * 1.1 + pad) return true;
    }
    return false;
  }
  private hurt(d: number) {
    this.hp -= d;
    if (this.state === 'rear' && d > 40) this.st = Math.max(this.st, 3.2); // a heavy blow drives it back down
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dying';
      targets.delete(this);
      events.emit('enemyDied', { at: this.pos.clone(), enemyId: this.id, kind: this.kind });
      this.onDeath?.();
    }
  }

  update(dt: number, ship: Ship | null, player: Player) {
    this.st += dt;
    const t = performance.now() / 1000;
    if (this.state === 'dying') {
      this.deathT += dt;
      this.pos.y -= dt * 1.2;
      this.place(t);
      if (this.deathT > 8) this.group.visible = false;
      return;
    }
    if (!ship || ship.sunk) {
      // Nothing to hunt: sink away.
      this.pos.y = Math.max(this.pos.y - dt, SEA_LEVEL - 12);
      this.place(t);
      return;
    }
    const sea = surface(this.pos.x, this.pos.z);
    let goal = this.pos.clone(), speed = 9, y = sea - 0.3;
    if (this.held) {
      // On the line: it bleeds, and hauled in close it's dragged up beside the hull.
      this.hurt(dt * 5);
      if (!this.alive) return;
      if (this.state !== 'rear' && this.pos.distanceTo(ship.pos) < ship.length * 0.5 + 12) {
        this.state = 'rear';
        this.st = 0;
        this.bit = false;
      }
    }
    if (this.state === 'stalk') {
      this.circle += dt * 0.32;
      goal = ship.pos.clone().add(new THREE.Vector3(Math.cos(this.circle) * 34, 0, Math.sin(this.circle) * 34));
      if (this.st > 9 + Math.random() * 5) {
        this.state = Math.random() < 0.55 ? 'dive' : 'rear';
        this.st = 0;
        this.bit = false;
      }
    } else if (this.state === 'dive') {
      // Submerged, coming in: a line of wake on the surface is the tell.
      goal = ship.pos.clone();
      y = sea - 4;
      speed = 11;
      if (Math.random() < dt * 30) this.fx.alpha.spawn({ pos: this.pos.clone().setY(sea + 0.1), spread: 1.5, count: 2, life: [0.8, 1.4], size: [0.6, 1.4], color: 0xeef8fa, alpha: 0.6, upBias: 0.3 });
      if (this.st > 2.2) { this.state = 'ram'; this.st = 0; }
    } else if (this.state === 'ram') {
      goal = ship.pos.clone();
      speed = 15;
      y = sea - 0.8;
      if (ship.contains(this.pos, 1.2)) {
        const sec = ship.sectionOf(ship.toLocal(this.pos));
        this.onRam?.(sec);
        this.fx.alpha.spawn({ pos: this.pos.clone().setY(sea + 0.5), vel: new THREE.Vector3(0, 7, 0), spread: 4, count: 30, life: [0.6, 1.3], size: [0.5, 0.15], color: 0xeaf6fa, alpha: 0.8, gravity: 10 });
        this.state = 'stalk';
        this.st = 0;
        this.circle += Math.PI;
      } else if (this.st > 6) { this.state = 'stalk'; this.st = 0; }
    } else if (this.state === 'rear') {
      // Rise beside the rail, strike at the deck, and hang there a moment.
      const right = new THREE.Vector3(-Math.cos(ship.yaw), 0, Math.sin(ship.yaw));
      const side = right.dot(this.pos.clone().sub(ship.pos)) > 0 ? 1 : -1;
      goal = ship.pos.clone().addScaledVector(right, side * (ship.beam / 2 + 3.2));
      speed = 10;
      const near = this.pos.distanceTo(goal.setY(this.pos.y)) < 4;
      y = near ? SEA_LEVEL + ship.heave + ship.def.deckY + 3.8 : sea - 0.3;
      if (near && !this.bit && this.st > 2.4) {
        this.bit = true;
        const deckSpot = ship.pos.clone().addScaledVector(right, side * ship.beam * 0.3);
        if (player.pos.distanceTo(deckSpot.setY(player.pos.y)) < 4.5) {
          player.receiveAttack({ damage: 28 + this.danger * 8, from: this.pos.clone(), parryable: true, poise: 50 });
        }
        this.onBite?.();
      }
      if (this.st > 6.5) { this.state = 'stalk'; this.st = 0; }
    }
    // Swim toward the goal.
    if (this.held) speed *= 0.55;
    const to = goal.clone().sub(this.pos).setY(0);
    if (to.lengthSq() > 1) this.yaw += wrap(Math.atan2(to.x, to.z) - this.yaw) * Math.min(1, dt * 2.2);
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 2.5);
    this.vel.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
    this.place(t);
  }

  private place(t: number) {
    this.trail.unshift(this.pos.clone());
    this.trail.length = 200;
    this.head.position.copy(this.pos);
    this.head.rotation.set(this.state === 'rear' ? 0.35 : 0, this.yaw, 0);
    const jaw = this.head.getObjectByName('jaw');
    if (jaw) jaw.rotation.x = this.state === 'rear' ? 0.35 + Math.sin(t * 6) * 0.15 : 0.05;
    this.segs.forEach((s, i) => {
      const p = this.trail[Math.min(this.trail.length - 1, 3 + i * 4)];
      s.position.copy(p);
      // Humps rolling down the body as it swims at the surface.
      if (this.state === 'stalk' || this.state === 'ram') s.position.y += Math.sin(i * 0.55 - t * 3) * 0.9 - 0.5;
      const q = this.trail[Math.min(this.trail.length - 1, 3 + i * 4 + 2)];
      s.lookAt(q);
    });
    this.center.copy(this.pos);
    this.position.copy(this.pos).setY(this.pos.y - 1);
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
  }
}

// ---- sharks -----------------------------------------------------------------------------------

export class Shark implements Target, SeaTarget {
  id = newTargetId();
  kind = 'shark';
  alive = true;
  lockable = true;
  stunned = false;
  hp: number;
  maxHp: number;
  radius = 0.7;
  vel = new THREE.Vector3();
  halfHeight = 0.4;
  center = new THREE.Vector3();
  position = new THREE.Vector3();
  pos = new THREE.Vector3();
  private group = new THREE.Group();
  private yaw = Math.random() * 6.28;
  private circle = Math.random() * 6.28;
  private biteT = 6 + Math.random() * 4; // they circle a while first: time to swim for it
  private lunge = 0;
  bored = 0;

  constructor(private scene: THREE.Scene, private fx: FX, at: THREE.Vector3, readonly danger: number) {
    this.maxHp = this.hp = Math.round(70 + danger * 25);
    this.pos.copy(at).setY(SEA_LEVEL - 0.6);
    const grey = new THREE.MeshStandardMaterial({ color: 0x5a6a74, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xd8dcd8, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), grey);
    body.scale.set(0.75, 0.7, 2.6);
    const under = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
    under.scale.set(0.74, 0.6, 2.5);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 4), grey);
    dorsal.position.set(0, 0.55, 0.1);
    dorsal.rotation.x = -0.35;
    dorsal.scale.z = 0.3;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 4), grey);
    tail.position.set(0, 0.15, -1.45);
    tail.rotation.x = 1.9;
    tail.scale.z = 0.25;
    this.group.add(body, under, dorsal, tail);
    this.group.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(this.group);
    targets.add(this);
  }

  takeHit(h: HitInfo) {
    this.hitBy(h.damage);
  }
  hitBy(dmg: number) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.fx.alpha.spawn({ pos: this.pos.clone(), spread: 2, count: 10, life: [0.6, 1.2], size: [0.3, 0.8], color: 0x7a1a14, alpha: 0.6 });
    if (this.hp <= 0) {
      this.alive = false;
      targets.delete(this);
      events.emit('enemyDied', { at: this.pos.clone(), enemyId: this.id, kind: this.kind });
      this.group.visible = false;
    }
  }

  /** Circle a swimmer; now and then lunge and bite. Lose interest in anyone dry. */
  update(dt: number, player: Player) {
    if (!this.alive) return;
    const p = player.pos;
    const inWater = player.swimming;
    this.circle += dt * (inWater ? 0.9 : 0.5);
    const r = inWater ? 7 : 14;
    let goal = p.clone().add(new THREE.Vector3(Math.cos(this.circle) * r, 0, Math.sin(this.circle) * r));
    let speed = 4.5;
    if (inWater) {
      this.biteT -= dt;
      if (this.biteT <= 0) { this.lunge = 1.6; this.biteT = 6 + Math.random() * 4; }
    } else this.bored += dt;
    if (this.lunge > 0) {
      this.lunge -= dt;
      goal = p.clone();
      speed = 9;
      if (this.pos.distanceTo(new THREE.Vector3(p.x, this.pos.y, p.z)) < 1.6 && inWater) {
        player.receiveAttack({ damage: 10 + this.danger * 3, from: this.pos.clone(), parryable: false, poise: 30 });
        this.lunge = 0;
      }
    }
    const to = goal.sub(this.pos).setY(0);
    this.yaw += wrap(Math.atan2(to.x, to.z) - this.yaw) * Math.min(1, dt * 3);
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    this.vel.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
    this.pos.y = surface(this.pos.x, this.pos.z) - 0.55;
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw, Math.sin(performance.now() / 300) * 0.08);
    this.center.copy(this.pos);
    this.position.copy(this.pos).setY(this.pos.y - 0.3);
  }

  dispose() {
    targets.delete(this);
    this.scene.remove(this.group);
  }
}

// ---- a consort (Seamanship: Fleet Signal) ---------------------------------------------------

/** A hired ship that keeps station off your quarter and engages any pirate that comes near. */
export class Consort {
  readonly ship: Ship;
  private reload = { [-1]: 3, [1]: 5 } as Record<number, number>;
  constructor(scene: THREE.Scene, at: THREE.Vector3, yaw: number, readonly name: string, hull: HullId = 'brigantine') {
    this.ship = new Ship(scene, hull, { ...STOCK_FIT(), guns: 2, hull: 1, sails: 1 }, { name, hullColor: 0x24467e, trim: 0xe8c060 });
    this.ship.owner = 'npc';
    this.ship.crew = this.ship.def.crewMax;
    this.ship.pos.copy(at);
    this.ship.yaw = yaw;
    this.ship.anchored = false;
    this.ship.sailSet = 1;
    this.ship.place();
  }

  update(dt: number, leader: Ship | null, foes: PirateShip[], gunnery: Gunnery) {
    const s = this.ship;
    if (s.sunk) return s.update(dt, NO_CONTROL(), { skill: 0.5, assisted: true });
    const ctl: ShipControls = { ...NO_CONTROL(), sail: 1 };
    let want = s.yaw;
    const foe = foes.filter((p) => !p.ship.sunk && p.state !== 'struck' && p.state !== 'taken' && p.state !== 'boarded' && leader && p.ship.pos.distanceTo(leader.pos) < 320)
      .sort((a, b) => a.ship.pos.distanceTo(s.pos) - b.ship.pos.distanceTo(s.pos))[0];
    if (foe) {
      // Engage: hold the pirate abeam and fire as she bears.
      const to = foe.ship.pos.clone().sub(s.pos).setY(0);
      const dist = to.length();
      const bearing = Math.atan2(to.x, to.z);
      const side = wrap(bearing - s.yaw) < 0 ? 1 : -1;
      want = dist > 90 ? bearing : bearing + side * (Math.PI / 2 - (dist > 55 ? 0.4 : dist < 30 ? -0.4 : 0));
      for (const sd of [-1, 1] as const) {
        this.reload[sd] -= dt;
        const off = Math.abs(wrap(bearing - (s.yaw - sd * (Math.PI / 2))));
        if (this.reload[sd] <= 0 && off < 0.5 && dist < 110) {
          gunnery.broadside(s, sd, dist, foe.ship.pos);
          this.reload[sd] = Gunnery.reload(s, 2) + 1;
        }
      }
    } else if (leader) {
      // Keep station 45 m off the leader's quarter, matching her speed.
      const port = new THREE.Vector3(Math.cos(leader.yaw), 0, -Math.sin(leader.yaw));
      const back = new THREE.Vector3(-Math.sin(leader.yaw), 0, -Math.cos(leader.yaw));
      const station = leader.pos.clone().addScaledVector(port, 30).addScaledVector(back, 35);
      const to = station.sub(s.pos).setY(0);
      const d = to.length();
      want = d > 12 ? Math.atan2(to.x, to.z) : leader.yaw;
      ctl.sail = d > 60 ? 1 : d < 15 ? Math.max(0.3, Math.min(1, Math.abs(leader.speed) / Math.max(1, s.stats.speed))) : 0.8;
      // Falling far behind, she crowds on sail and catches up (a consort's crew rows hard).
      if (d > 220) s.pos.addScaledVector(to.normalize(), Math.min(d - 200, dt * 6));
    }
    const w = windAt(s.pos.x, s.pos.z);
    const from = Math.atan2(-w.dir.x, -w.dir.y);
    const intoWind = wrap(want - from);
    if (Math.abs(intoWind) < 0.8) want = from + Math.sign(intoWind || 1) * 0.85;
    ctl.rudder = Math.max(-1, Math.min(1, -wrap(want - s.yaw) * 2));
    s.update(dt, ctl, { skill: 0.6, assisted: true });
  }

  dispose() {
    this.ship.dispose();
  }
}
