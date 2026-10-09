import * as THREE from 'three';
import { Ship, NO_CONTROL, type ShipControls } from './ship';
import { STOCK_FIT } from './shipTypes';
import { SEA, cellStormAt, brewStorm } from './seaState';
import { QUAY_X } from '../portCity';
import { buildCharacter, type BuiltCharacter, type Look } from '../../npc/charBuilder';
import type { Sailing } from './sailing';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';

// The Iron Kettle (docs/design/mountains.md §3): the dwarves' sail-and-boiler
// brigantine, with a smokestack amidships and paddle boxes either side for
// calm water. On sailing day she carries Bruni's expedition out of Port
// Aurelle, north-east up the coast on the North Reach, through a storm and
// past the serpent's water (or a pirate cutter, if you've already killed the
// serpent), to Kettle Cove under the White Mountains. Captain Hamm
// Copperbeard keeps the helm unless you take it; the voyage is sailed, not
// skipped. Afterwards she berths at the cove and carries passengers between
// the cove and Port Aurelle.

export const HAMM_LOOK: Look = { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0xb8622a, skin: 0xe0b894, cloth: 0x6a4a2a, pauldron: true, height: 1.36 };

/** The course Hamm sails: out of the harbour, onto the North Reach, then north under the cliffs. */
export const KETTLE_ROUTE: [number, number][] = [
  [QUAY_X + 140, 150],
  [3400, -200],
  [4200, -900],
  [5000, -1600],
  [5500, -2600],
  [5700, -3600],
  [5500, -4300],
  [5268, -4705],
];
/** Where she lies at Port Aurelle, and where she berths at the cove. */
export const KETTLE_HOME: [number, number, number] = [QUAY_X + 64, 150, Math.PI / 2];

export interface KettleHooks {
  toast(msg: string): void;
  /** quest signals */
  signal(id: string): void;
  /** has the player beaten a great sea monster (the serpent) before? */
  slainMonster(): boolean;
  /** chart the map around a point */
  reveal(x: number, z: number, r: number): void;
  /** dock at a port by id (sailing's own docking) */
  dock(portId: string): boolean;
  save(): void;
}

export interface KettleSave { leg: number; x: number; z: number; yaw: number; at: 'port' | 'sea' | 'cove' }

export class IronKettle {
  ship: Ship | null = null;
  /** the voyage under way (leg = the waypoint she's making for) */
  voyage: { leg: number; storm: boolean; threat: boolean; peaks: boolean; slowT: number } | null = null;
  where: 'port' | 'sea' | 'cove' = 'port';
  private hamm: BuiltCharacter | null = null;
  private hammLoading = false;
  private stack = new THREE.Vector3();
  private smokeT = 0;
  private paddles: THREE.Object3D[] = [];
  private paddleT = 0;

  /** where you step ashore at the cove if she can't take a berth */
  cove = new THREE.Vector3(5250, 0, -4822);
  /** climbing back aboard mid-voyage (after a swim) */
  readonly interactable = {
    pos: new THREE.Vector3(0, -999, 0), radius: 6,
    label: () => 'Climb back aboard the Iron Kettle',
    enabled: () => this.reboard(),
    action: () => { if (this.ship) this.sailing.board(this.ship); },
  };

  constructor(private scene: THREE.Scene, private fx: FX, private player: Player, private sailing: Sailing, private hooks: KettleHooks) {}

  private reboard() {
    const s = this.ship;
    const ok = !!s && !!this.voyage && this.sailing.current !== s && Math.hypot(this.player.pos.x - s.pos.x, this.player.pos.z - s.pos.z) < s.length * 0.5 + 4;
    this.interactable.pos.copy(ok ? this.player.pos : new THREE.Vector3(0, -999, 0));
    return ok;
  }

  /** Sailing's helm controls (Hamm sets the sail while he steers). */
  private get ctl() {
    return (this.sailing as unknown as { ctl: ShipControls }).ctl;
  }

  /** Build her (once), lying at `at` with heading `yaw`. */
  private spawn(x: number, z: number, yaw: number) {
    if (this.ship) {
      this.ship.pos.set(x, 0, z);
      this.ship.yaw = yaw;
      this.ship.speed = 0;
      this.ship.place();
      this.ship.place();
      return this.ship;
    }
    const ship = new Ship(this.scene, 'brigantine', { ...STOCK_FIT(), guns: 2, hull: 2, pumps: 1 }, { name: 'Iron Kettle', hullColor: 0x4a3a2e, trim: 0x8a8a92, sail: 0xd8c8a0, flag: 0x8a3f22 });
    ship.owner = 'npc';
    ship.pos.set(x, 0, z);
    ship.yaw = yaw;
    ship.anchored = true;
    ship.place();
    ship.place();
    this.dress(ship);
    this.ship = ship;
    return ship;
  }

  /** The boiler: a smokestack amidships and a paddle box on each side. */
  private dress(ship: Ship) {
    const d = ship.def;
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.55, metalness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: 0x9b7130, roughness: 0.35, metalness: 0.75 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.85 });
    const g = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 4.2, 12), iron);
    stack.position.set(0, d.deckY + 2.1, -0.6);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.22, 12), brass);
    band.position.set(0, d.deckY + 3.9, -0.6);
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.4, 12), iron);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, d.deckY + 0.6, -0.6);
    g.add(stack, band, boiler);
    for (const s of [-1, 1]) {
      const box = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.9, 16, 1, false, 0, Math.PI), wood);
      box.rotation.set(0, 0, Math.PI / 2);
      box.rotation.y = s > 0 ? 0 : Math.PI;
      box.position.set(s * (d.beam / 2 + 0.45), d.deckY - 0.6, -0.6);
      const wheel = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 2.6), wood);
        blade.rotation.x = (k / 6) * Math.PI;
        wheel.add(blade);
      }
      wheel.position.set(s * (d.beam / 2 + 0.45), d.deckY - 0.9, -0.6);
      this.paddles.push(wheel);
      g.add(box, wheel);
    }
    g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    ship.group.add(g);
    this.stack.set(0, d.deckY + 4.3, -0.6);
  }

  /** Lying in her berth at Port Aurelle, ready for sailing day. */
  atPort() {
    this.spawn(...KETTLE_HOME);
    this.where = 'port';
  }

  /** Lying at Kettle Cove's quay. */
  atCove(berth: [number, number, number]) {
    this.spawn(...berth);
    this.where = 'cove';
  }

  /** Sailing day: aboard, cast off, and Hamm takes her out. */
  startVoyage(resume?: KettleSave | null) {
    const ship = resume && resume.at === 'sea' ? this.spawn(resume.x, resume.z, resume.yaw) : this.spawn(...KETTLE_HOME);
    this.where = 'sea';
    this.voyage = { leg: resume?.leg ?? 0, storm: (resume?.leg ?? 0) > 4, threat: (resume?.leg ?? 0) > 5, peaks: (resume?.leg ?? 0) > 5, slowT: 0 };
    if (this.sailing.current !== ship) this.sailing.board(ship);
    this.sailing.lashed = ship.yaw;
    Object.assign(this.ctl, { ...NO_CONTROL(), sail: 1 });
    this.hooks.toast('Hamm Copperbeard: "Stoke her, lads! North for the mountains." (Take the helm whenever you like; leave it and Hamm steers.)');
  }

  /** Jump the voyage ahead to a waypoint (tests, and a reload mid-voyage). */
  jump(leg: number) {
    const ship = this.ship;
    if (!ship || !this.voyage) return;
    const [x, z] = KETTLE_ROUTE[Math.max(0, leg - 1)];
    const [nx, nz] = KETTLE_ROUTE[Math.min(KETTLE_ROUTE.length - 1, leg)];
    const before = ship.frame.clone();
    ship.pos.set(x, 0, z);
    ship.yaw = Math.atan2(nx - x, nz - z);
    ship.place();
    ship.place();
    // Whoever stood on deck comes along.
    const local = this.player.pos.clone().applyMatrix4(before.invert());
    if (Math.abs(local.x) < 4 && Math.abs(local.z) < 12) this.player.teleport(local.applyMatrix4(ship.frame).add(new THREE.Vector3(0, 0.2, 0)));
    this.voyage.leg = leg;
  }

  toJSON(): KettleSave | null {
    const s = this.ship;
    if (!s) return null;
    return { leg: this.voyage?.leg ?? 0, x: Math.round(s.pos.x), z: Math.round(s.pos.z), yaw: +s.yaw.toFixed(3), at: this.where };
  }

  /** Before the player moves: Hamm steers, the boiler drives her, the voyage's events come. */
  preStep(dt: number) {
    const ship = this.ship;
    if (!ship) return;
    const aboard = this.sailing.current === ship;
    // Docked her yourself at Kettle Cove (or stepped ashore there): the voyage is over.
    if (this.voyage && !aboard && Math.hypot(ship.pos.x - KETTLE_ROUTE[KETTLE_ROUTE.length - 1][0], ship.pos.z - KETTLE_ROUTE[KETTLE_ROUTE.length - 1][1]) < 320) this.arrive();
    if (!aboard) {
      // Riding at her berth (only when someone is near enough to see her).
      if (Math.hypot(ship.pos.x - this.player.pos.x, ship.pos.z - this.player.pos.z) < 700) ship.update(dt, { ...NO_CONTROL(), anchor: true }, { skill: 0, assisted: true });
      return;
    }
    const v = this.voyage;
    if (!v) return;
    const storm = Math.max(SEA.storm, cellStormAt(ship.pos.x, ship.pos.z));
    const [tx, tz] = KETTLE_ROUTE[Math.min(v.leg, KETTLE_ROUTE.length - 1)];
    const dist = Math.hypot(tx - ship.pos.x, tz - ship.pos.z);
    const last = v.leg >= KETTLE_ROUTE.length - 1;
    if (!last && dist < 120) v.leg++;
    // Hamm keeps the helm while you're away from the wheel.
    const hamm = !this.sailing.atHelm;
    if (hamm) {
      this.sailing.lashed = Math.atan2(tx - ship.pos.x, tz - ship.pos.z);
      this.ctl.sail = last && dist < 260 ? 0 : 1;
      this.ctl.anchor = false;
      this.ctl.reef = storm > 0.45;
    }
    // The paddle boiler: in calm water she makes way whatever the wind does.
    // (Coming in, Hamm eases her down to a crawl alongside the quay.)
    let boiler = storm < 0.35 ? (hamm ? 12 : this.ctl.sail > 0.4 ? 7 : 0) : 0;
    if (last && hamm) boiler = dist > 40 ? Math.max(2, Math.min(12, (dist - 30) / 12)) : 0;
    if (boiler > 0 && ship.speed < boiler) ship.speed = Math.min(boiler, ship.speed * 1.012 + dt * 2.5);
    if (last && hamm && ship.speed > boiler + 0.5) ship.speed = Math.max(boiler, ship.speed - dt * 2.5);
    this.paddleT += dt * (boiler > 0 ? Math.max(0.6, ship.speed / 3) : 0);
    for (const p of this.paddles) p.rotation.x = this.paddleT;
    if (last && hamm && dist < 60 && Math.abs(ship.speed) < 2.6) {
      v.slowT += dt;
      if (v.slowT > 1.5) this.arrive();
    }
    // The voyage's events, as she comes to each stretch of water.
    if (!v.storm && v.leg >= 4) {
      v.storm = true;
      const [sx, sz] = KETTLE_ROUTE[4];
      brewStorm(sx + 120, sz + 200, 520, 0.95);
      this.hooks.toast('Hamm: "Black sky off the bow. Reef her down, and mind the boiler fires: we\'ll take this one on the bow quarter."');
    }
    if (!v.threat && v.leg >= 5) {
      v.threat = true;
      const side = new THREE.Vector3(Math.cos(ship.yaw), 0, -Math.sin(ship.yaw));
      const at = ship.pos.clone().addScaledVector(side, 140).add(new THREE.Vector3(Math.sin(ship.yaw) * 120, 0, Math.cos(ship.yaw) * 120));
      if (!this.hooks.slainMonster()) {
        this.sailing.spawnSerpent(at, 2.6);
        this.hooks.toast('The lookout screams: "Serpent! Serpent off the starboard bow!" Man the guns!');
      } else {
        this.sailing.spawnPirate(at, 2.2, { name: 'The Gull\'s Due', hull: 'cutter', fit: { ...STOCK_FIT(), guns: 1, sails: 1 } });
        this.hooks.toast('Hamm: "A cutter under black canvas, and she\'s seen our smoke. Guns, lads!"');
      }
    }
    if (!v.peaks && ship.pos.z < -3400) {
      v.peaks = true;
      this.hooks.reveal(5000, -4800, 1800);
      this.hooks.toast('Out of the haze to the north, white peaks above white cloud: the White Mountains.');
    }
  }

  /** Alongside at Kettle Cove: the voyage is over. */
  private arrive() {
    const v = this.voyage;
    if (!v) return;
    this.voyage = null;
    this.where = 'cove';
    this.sailing.lashed = null;
    if (this.sailing.current === this.ship && !this.hooks.dock('kettleCove')) this.sailing.leaveShip(this.cove);
    this.hooks.signal('kettle-landed');
    this.hooks.save();
  }

  /** Hamm at the helm, smoke from the stack. */
  frame(dt: number) {
    const ship = this.ship;
    if (!ship) return;
    const steering = !!this.voyage && this.sailing.current === ship && !this.sailing.atHelm;
    if (steering && !this.hamm && !this.hammLoading) {
      this.hammLoading = true;
      void buildCharacter(HAMM_LOOK, ['idle']).then((b) => {
        this.hammLoading = false;
        const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
        acts[0]?.play();
        this.hamm = b;
        this.scene.add(b.root);
      });
    }
    if (this.hamm) {
      this.hamm.root.visible = steering;
      if (steering) {
        this.hamm.root.position.copy(ship.toWorld(new THREE.Vector3(0, ship.def.deckY, ship.def.helmZ - 0.6)));
        this.hamm.root.rotation.y = ship.yaw;
        this.hamm.mixer.update(dt);
      }
    }
    const lit = this.where === 'sea' || (this.sailing.current === ship);
    this.smokeT -= dt;
    if (lit && this.smokeT <= 0) {
      this.smokeT = 0.12;
      this.fx.alpha.spawn({ pos: ship.toWorld(this.stack), vel: new THREE.Vector3(0, 2.4, 0), spread: 0.5, count: 2, life: [2, 3.4], size: [0.8, 2.6], color: 0x3a3836, alpha: 0.45, drag: 0.6, upBias: 1 });
    }
  }

  setVisible(v: boolean) {
    if (this.ship) this.ship.group.visible = v;
    if (this.hamm) this.hamm.root.visible = v && this.hamm.root.visible;
  }

  /** Back to before sailing day (tests). */
  reset() {
    this.voyage = null;
    if (this.ship && this.sailing.current === this.ship) {
      this.sailing.current = null;
      this.sailing.atHelm = false;
      this.player.vehicle = null;
    }
    this.ship?.dispose();
    this.ship = null;
    this.paddles = [];
    if (this.hamm) this.scene.remove(this.hamm.root);
    this.hamm = null;
    this.where = 'port';
  }
}
