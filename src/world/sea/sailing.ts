import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { SEA_LEVEL } from '../worldMap';
import { waterSurfaceAt } from '../waterLevel';
import { QUAY_X } from '../portCity';
import { buildCharacter, type BuiltCharacter, type Look } from '../../npc/charBuilder';
import { Ship, NO_CONTROL, POINT_NAMES, SECTION_NAMES, type ShipControls, type ShipPerks } from './ship';
import { HULLS, HULL_ORDER, UPGRADES, SLOTS, STOCK_FIT, type HullId, type Fit } from './shipTypes';
import { SEA, dangerAt, DANGER_NAMES, waveHeight, cellStormAt, STORMS, STORM_WAVES, BASE_WAVES, CURRENTS, windAt, type StormCell } from './seaState';
import { seaPerks, canBuy, type SeaPerks } from './seamanship';
import { FISH } from '../fishing';
import { Gunnery, SHOT_NAMES, type ShotKind, type DeckFoe } from './gunnery';
import { PirateShip, SeaSerpent, Shark, Consort, type PirateOpts } from './seaThreats';
import { BLACK_TIDE_SCOUT, BLACK_TIDE_FLAG } from '../../quests/seaQuests';
import { makeBeast, BEAST_NAMES, Leviathan, type SeaBeast, type BeastId, type BeastCtx } from './seaMonsters';
import { regionAt } from '../worldMap';
import { GOODS, GOOD, MARKETS, price, shiftSupply, recoverSupply, offers, type Contract, type Supply } from './trade';
import { CustomsCutter } from './seaThreats';
import type { IslandPort } from './islandPorts';
import { candidates, dayCrew, crewEffects, crewXp, ROLE_INFO, TRAIT_INFO, type CrewMember } from './crew';
import { Bolts } from '../../enemies/bandit';
import { SailingHud } from '../../ui/sailingHud';
import type { Player } from '../../player/player';
import type { Input } from '../../core/input';
import type { ThirdPersonCamera } from '../../player/camera';
import type { FX } from '../../fx/particles';
import type { Interactable } from '../../dungeon/instance';
import type { NpcRecord, Place, ScheduleEntry } from '../../npc/npcManager';

// Boats you own, rent and crew (docs/design/boating.md): the Aurelle
// Shipwrights sell hulls and fit upgrades; Mira hires out skiffs, sloops and
// cutters by the day; Rigby at the Salty Anchor finds crews, and sailors wait
// around the harbour to be met and signed on. Take the helm, walk the deck,
// dock at a port. The further you sail from Port Aurelle the wilder the sea:
// bigger waves, storms, pirates and the sea serpent. A ship that sinks is
// gone for good; its wreck stays on the seabed to dive for. Seamanship grows
// with every voyage sailed well.

export interface ShipRecord {
  id: string;
  hull: HullId;
  name: string;
  fit: Fit;
  hullColor: number;
  trim: number;
  sections: number[];
  sails: number;
  water: number;
  x: number;
  z: number;
  yaw: number;
  /** the port it's berthed at, or null when anchored somewhere else */
  port: string | null;
  /** goods in the hold */
  cargo?: Record<string, number>;
}
export interface WreckRecord { id: string; name: string; hull: HullId; x: number; z: number; gold: number; items: [string, number][]; searched: boolean }
export interface Rental { hull: HullId; until: number; deposit: number; port: string; x: number; z: number; yaw: number; sections: number[]; water: number; cargo?: Record<string, number> }
export interface SailingSave {
  ships: ShipRecord[];
  rental: Rental | null;
  crew: CrewMember[];
  xp: number;
  mode: 'assisted' | 'seafarer';
  wrecks: WreckRecord[];
  stats: { metres: number; pirates: number; monsters: number; storms: number };
  paidDay?: number;
  /** the Seamanship tree: node id -> ranks */
  picks?: Record<string, number>;
  /** currents you've ridden */
  currents?: string[];
  /** the great monsters you've beaten (trophies) */
  trophies?: string[];
  /** the markets, your Maritime Guild contracts, first landfalls, relit lighthouses */
  supply?: Supply;
  contracts?: Contract[];
  landfalls?: string[];
  lit?: string[];
}

export interface SailingHooks {
  toast(msg: string): void;
  gold(): number;
  addGold(n: number): void;
  give(id: string, n: number): void;
  count(id: string): number;
  take(id: string, n: number): void;
  talk(who: string, title: string, text: string, opts: { label: string; run: () => void }[]): void;
  close(): void;
  save(): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  day(): number;
  /** game hours since the start (day * 24 + hour) */
  hours(): number;
  /** where the player's map pin is, if they've set one */
  waypoint?(): { x: number; z: number } | null;
  /** quest signals (quests.signal / quests.wants) */
  signal?(id: string): void;
  /** chart the map around a point (a relit lighthouse) */
  reveal?(x: number, z: number, r: number): void;
  /** real seconds in a game day */
  dayLengthSec?(): number;
  wants?(id: string): boolean;
  shake(n: number): void;
  dismount(): void;
}

interface Port { id: string; name: string; zone: THREE.Vector3; r: number; berths: [number, number, number][]; landing: THREE.Vector3; crown?: boolean }
const PORTS: Port[] = [
  { id: 'portAurelle', name: 'Port Aurelle', crown: true, zone: new THREE.Vector3(QUAY_X + 50, 0, 200), r: 150, berths: [[QUAY_X + 64, 172, Math.PI / 2], [QUAY_X + 64, 196, Math.PI / 2], [QUAY_X + 64, 218, Math.PI / 2], [QUAY_X + 92, 184, Math.PI / 2], [QUAY_X + 92, 210, Math.PI / 2], [QUAY_X + 52, 318, Math.PI / 2]], landing: new THREE.Vector3(QUAY_X - 4, 0, 196) },
  { id: 'crownQuay', name: 'The Crown Quay', crown: true, zone: new THREE.Vector3(-3990, 0, -1010), r: 90, berths: [[-3990, -1000, Math.PI], [-3985, -985, Math.PI]], landing: new THREE.Vector3(-3916, 0, -1010) },
];
/** What the shipwright calls the monster materials an upgrade needs. */
const NEED_NAMES: Record<string, string> = { serpentScale: 'sea serpent scales', moongrass: 'moongrass', wyrmScale: 'Storm Wyrm scales', colossusShell: 'colossus shells', leviathanBone: 'leviathan bones', krakenInk: 'gourds of kraken ink' };
const needName = (id: string) => NEED_NAMES[id] ?? id;
const SHIP_NAMES = ['Sea Lark', 'Dawn Runner', 'Gull’s Pride', 'Salt Rose', 'Wavecutter', 'Lucky Kettle', 'The Brave Herring', 'Morning Star', 'Tidewalker', 'Silver Wake', 'The Stubborn Mule', 'Kestrel'];
const HULL_COLOURS: [string, number, number][] = [['Oak and gold', 0x5a3a24, 0xc9a25a], ['Crown blue', 0x24467e, 0xe8c060], ['Black and red', 0x1e1a1c, 0x8a1a1a], ['Sea green', 0x2f6a5a, 0xe8dcc0], ['White and blue', 0xd8d4cc, 0x24467e]];

/** Seamanship: cumulative XP needed to reach each level (1..30). */
export const seamanshipLevel = (xp: number) => {
  let lvl = 1, need = 0;
  while (lvl < 30) {
    const step = 60 * Math.pow(lvl, 1.35);
    if (xp < need + step) break;
    need += step;
    lvl++;
  }
  const next = lvl >= 30 ? 1 : 60 * Math.pow(lvl, 1.35);
  return { level: lvl, frac: lvl >= 30 ? 1 : (xp - need) / next };
};

/** The sailors waiting around Port Aurelle to be met and signed on (they're the day-one candidates). */
export const HARBOUR_SAILORS = candidates(0, 8);

export class Sailing {
  records: ShipRecord[] = [];
  rental: Rental | null = null;
  crew: CrewMember[] = [];
  xp = 0;
  mode: 'assisted' | 'seafarer' = 'assisted';
  wrecks: WreckRecord[] = [];
  stats = { metres: 0, pirates: 0, monsters: 0, storms: 0 };
  paidDay = -1;

  readonly ships = new Map<string, Ship>();
  /** the ship the player is aboard (at the helm or on deck) */
  current: Ship | null = null;
  atHelm = false;
  readonly interactables: Interactable[] = [];
  readonly gunnery: Gunnery;
  readonly bolts: Bolts;
  pirates: PirateShip[] = [];
  serpent: SeaSerpent | null = null;
  sharks: Shark[] = [];
  private hud = new SailingHud();
  private helm = { pos: new THREE.Vector3(), yaw: 0, speed: 0, stand: true };
  private ctl: ShipControls = NO_CONTROL();
  private reload: Record<number, number> = { [-1]: 0, [1]: 0 };
  private harpoonT = 0;
  private pirateT = 40;
  private monsterT = 80;
  private wasStorm = false;
  private lastPos = new THREE.Vector3();
  private overboard: { c: CrewMember; pos: THREE.Vector3; t: number; mark: THREE.Mesh }[] = [];
  private crewActors: { c: CrewMember; built: BuiltCharacter; local: THREE.Vector3 }[] = [];
  private loot: { pos: THREE.Vector3; mesh: THREE.Object3D; gold: number; items: [string, number][] }[] = [];
  private wreckMeshes = new Map<string, THREE.Object3D>();
  private plunderBy: PirateShip | null = null;
  /** the Seamanship tree */
  picks: Record<string, number> = {};
  private perkCache: SeaPerks = seaPerks({});
  /** a lashed helm holds this heading while you're away from the wheel */
  lashed: number | null = null;
  knownCurrents = new Set<string>();
  private windT = 0;
  private windCd = 0;
  private pressCd = 0;
  private rogueT = 70;
  private rogueWarn = 0;
  private rogueDir = new THREE.Vector2();
  private wavebroken = false;
  private starDay = -1;
  private eyeWarned = new WeakSet<StormCell>();
  private trawlT = 0;
  private spyglass = false;
  private fovWas = 62;
  private tackSaid = 0;
  private surfSaid = false;
  /** the shot in the guns, the last thunder broadside, the swivel's reload, a ram's cooldown */
  shot: ShotKind = 'ball';
  private thunderAt = -999;
  private swivelT = 0;
  private ramT = 0;
  private rakeSaid = 0;
  /** the pirate ship you've boarded (you're fighting on, or have taken, her deck) */
  boarding: PirateShip | null = null;
  /** a hired consort (Fleet Signal) and whether one sails with your next voyage */
  consort: Consort | null = null;
  consortHired = false;
  /** quest stages that put ships and monsters on the sea (stage hooks) */
  readonly story = new Set<string>();
  /** one great monster at a time (besides the serpent) */
  beast: SeaBeast | null = null;
  /** the great monsters you've beaten */
  trophies = new Set<string>();
  /** the markets' gluts and shortages, your contracts, ports you've reached, lighthouses you've relit */
  supply: Supply = {};
  contracts: Contract[] = [];
  landfalls = new Set<string>();
  lit = new Set<string>();
  private lighthouses = new Map<string, IslandPort['lighthouse']>();
  customs: CustomsCutter | null = null;
  private customsChecked = false;
  private supplyHour = -1;

  constructor(private scene: THREE.Scene, private fx: FX, private player: Player, private input: Input, private cam: ThirdPersonCamera, private hooks: SailingHooks) {
    this.gunnery = new Gunnery(scene, fx);
    this.bolts = new Bolts(scene);
    this.gunnery.onShipHit = (ship, section, dmg, by, kind) => {
      if (ship === this.current) {
        hooks.shake(0.25);
        if (kind === 'fire') this.hooks.toast('Fire pots! She\'s burning! Your crew run for the buckets (E on deck to help).');
        else if (kind === 'chain' && ship.sailHp < ship.stats.sails * 0.3 && ship.mastCap === 1) {
          ship.mastCap = 0.6;
          this.hooks.toast('Chain shot brings down the topmast! She can\'t carry full sail until the shipwright sees to it.');
        } else if (dmg > 20 && Math.random() < 0.3) this.hooks.toast(`A ball smashes into the ${SECTION_NAMES[section]}!`);
      }
      void by;
    };
    this.gunnery.onCrewHit = (ship, n, by) => {
      const pr = this.pirates.find((p) => p.ship === ship);
      if (pr) pr.loseCrew(n);
      else if (ship === this.current) for (const c of this.crew) if (c.status === 'aboard') c.morale = Math.max(0, c.morale - 0.02 * n);
      void by;
    };
    this.gunnery.onRake = (ship, by) => {
      if (by === this.current && performance.now() - this.rakeSaid > 8000) {
        this.rakeSaid = performance.now();
        this.hooks.toast(`Raked her! The shot runs the length of the ${ship.name}.`);
        this.addXp(10);
      }
    };
    this.gunnery.onTether = (t, ev) => {
      if (t.ship !== this.current) return;
      if (ev === 'hold') {
        t.tow = this.perks.tow;
        this.hooks.toast('The harpoon bites and the line goes taut! Hold right click to reel it in; O cuts the line.');
      } else this.hooks.toast('The line parts with a crack like a pistol shot!');
    };
    this.buildInteractables();
  }

  // ---- what the player knows -------------------------------------------------------------

  get level() { return seamanshipLevel(this.xp).level; }
  get perks() { return this.perkCache; }

  /** Learn a node of the Seamanship tree (null on success, else why not). */
  learn(id: string): string | null {
    const why = canBuy(id, this.picks, this.level);
    if (why) return why;
    this.picks[id] = (this.picks[id] ?? 0) + 1;
    this.perkCache = seaPerks(this.picks);
    this.hooks.save();
    return null;
  }

  /** The helm's share of the tree: what it does to the ship you command. */
  private shipPerks(): ShipPerks {
    const p = this.perks;
    return { tackWindow: p.tackWindow, turn: p.turn, thrown: p.thrown, kick: p.kick, groundDmg: p.groundDmg, surf: p.surf, trimWidth: p.trimWidth, sailDrive: p.sailDrive, setRate: p.setRate, reefSpeed: p.reefSpeed, capsizeMargin: p.capsizeMargin, irons: p.irons, current: p.current };
  }
  get skill() { return (this.level - 1) / 29; }
  get assisted() { return this.mode === 'assisted'; }
  get aboard() { return !!this.current; }
  /** Owned ships (records) and the live ship for each. */
  ownedShips() { return this.records.map((r) => ({ r, ship: this.ships.get(r.id) })); }

  private addXp(n: number, why?: string) {
    const before = this.level;
    this.xp += n;
    const after = this.level;
    if (after > before) {
      const unlocked = HULL_ORDER.find((h) => HULLS[h].level === after);
      this.hooks.toast(`Seamanship ${after}!${unlocked ? ` You can now command a ${HULLS[unlocked].name}.` : ''}`);
    } else if (why && n >= 25) this.hooks.toast(`+${n} Seamanship (${why})`);
  }

  // ---- ships in the world ------------------------------------------------------------------

  private spawn(r: ShipRecord) {
    const ship = new Ship(this.scene, r.hull, r.fit, { name: r.name, hullColor: r.hullColor, trim: r.trim });
    ship.pos.set(r.x, 0, r.z);
    ship.yaw = r.yaw;
    ship.sections = r.sections.map((h) => Math.min(h, ship.stats.hull));
    ship.sailHp = Math.min(r.sails, ship.stats.sails);
    ship.water = r.water;
    ship.anchored = true;
    ship.place();
    ship.place(); // (twice: the deck's previous frame too)
    ship.onEvent = (e, d) => this.shipEvent(ship, e, d);
    this.ships.set(r.id, ship);
    return ship;
  }

  private freeBerth(port: Port) {
    for (const b of port.berths) {
      const taken = [...this.ships.values()].some((s) => !s.sunk && Math.hypot(s.pos.x - b[0], s.pos.z - b[1]) < 9);
      if (!taken) return b;
    }
    return port.berths[port.berths.length - 1];
  }

  /** Buy a new hull: it's waiting at a berth in Port Aurelle. */
  buy(hull: HullId, colour = 0) {
    const def = HULLS[hull];
    const port = PORTS[0];
    const [x, z, yaw] = this.freeBerth(port);
    const [, hc, tc] = HULL_COLOURS[colour];
    const r: ShipRecord = {
      id: 'ship-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), hull, name: SHIP_NAMES[(this.records.length * 5 + Math.floor(Math.random() * 3)) % SHIP_NAMES.length],
      fit: STOCK_FIT(), hullColor: hc, trim: tc, sections: [def.hull, def.hull, def.hull], sails: def.sails, water: 0, x, z, yaw, port: port.id,
    };
    this.records.push(r);
    this.spawn(r);
    return r;
  }

  /** Hire a boat for a day: it's waiting at the port's rental berth. */
  rent(hull: HullId, portId = 'portAurelle') {
    if (this.rental) this.endRental(false);
    const def = HULLS[hull];
    const port = PORTS.find((p) => p.id === portId)!;
    const [x, z, yaw] = portId === 'portAurelle' ? port.berths[port.berths.length - 1] : port.berths[0];
    this.rental = { hull, until: (this.hooks.day() + 1) * 24 + 8, deposit: def.deposit, port: portId, x, z, yaw, sections: [def.hull, def.hull, def.hull], water: 0 };
    const r: ShipRecord = { id: 'rental', hull, name: hull === 'skiff' ? 'Hired Skiff' : hull === 'sloop' ? 'Mira’s Sloop' : 'The Hired Cutter', fit: STOCK_FIT(), hullColor: 0x6a4a2a, trim: 0x2f7f86, sections: this.rental.sections, sails: def.sails, water: 0, x, z, yaw, port: portId };
    const ship = this.spawn(r);
    ship.owner = 'rental';
    return ship;
  }

  private endRental(refund: boolean) {
    const r = this.rental;
    if (!r) return;
    const ship = this.ships.get('rental');
    if (ship) {
      if (this.current === ship) this.leaveShip(this.landingNear(ship) ?? PORTS[0].landing);
      ship.dispose();
      this.ships.delete('rental');
    }
    if (refund) {
      const late = Math.max(0, Math.ceil((this.hooks.hours() - r.until) / 24));
      const back = Math.max(0, r.deposit - late * HULLS[r.hull].rent);
      if (back) this.hooks.addGold(back);
      this.hooks.toast(`Boat returned. ${back}g of your deposit back${late ? ` (${late} day${late > 1 ? 's' : ''} late)` : ''}.`);
    }
    this.rental = null;
  }

  // ---- getting aboard and ashore -----------------------------------------------------------

  /** Step aboard a ship: big ships put you on deck, a skiff at the tiller. */
  board(ship: Ship) {
    this.hooks.dismount();
    this.current = ship;
    ship.anchored = false;
    // Your crew (and any hired for the voyage) come aboard with you.
    for (const c of this.crew) if (c.status === 'ashore') c.status = 'aboard';
    this.spawnCrewActors();
    if (ship.def.model === 'skiff') this.takeHelm();
    else {
      ship.place();
      ship.enableDeck();
      this.player.teleport(ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 0.3, ship.def.helmZ + 1.6)));
      this.hooks.toast(`Aboard the ${ship.name}. The wheel is at the stern.`);
    }
    this.lastPos.copy(ship.pos);
    this.voyageFrom.copy(ship.pos);
    this.wavebroken = false;
    this.customsChecked = false;
    ship.perks = this.shipPerks();
    // A hired consort joins you off the quarter.
    if (this.consortHired && !this.consort && ship.def.model !== 'skiff') {
      const back = new THREE.Vector3(-Math.sin(ship.yaw), 0, -Math.cos(ship.yaw));
      const at = ship.pos.clone().addScaledVector(back, 50);
      this.consort = new Consort(this.scene, at, ship.yaw, 'HMS Steadfast');
      this.consortHired = false;
      this.hooks.toast('Your consort, the Steadfast, falls in astern.');
    }
  }
  private voyageFrom = new THREE.Vector3();

  takeHelm() {
    const ship = this.current;
    if (!ship) return;
    this.atHelm = true;
    this.player.vehicle = this.helm;
    this.lashed = null;
    this.ctl = { ...NO_CONTROL(), sail: ship.sailSet, anchor: false, reef: ship.reefed };
    this.placeHelm();
  }

  leaveHelm() {
    const ship = this.current;
    if (!ship || !this.atHelm) return;
    this.atHelm = false;
    this.player.vehicle = null;
    this.cam.extra = 0;
    if (ship.def.model === 'skiff') return;
    // The helm is lashed: the ship holds its sail and steers straight.
    this.ctl.rudder = 0;
    this.player.teleport(ship.toWorld(new THREE.Vector3(0, ship.def.deckY + 0.3, ship.def.helmZ + 1.4)));
  }

  /** Go ashore (or onto a pier) at `land`; the ship stays where it is, at anchor. */
  leaveShip(land: THREE.Vector3) {
    const ship = this.current;
    if (!ship) return;
    if (this.atHelm) { this.atHelm = false; this.player.vehicle = null; this.cam.extra = 0; }
    ship.anchored = true;
    this.ctl = { ...NO_CONTROL(), anchor: true };
    this.lashed = null;
    this.endBoarding();
    if (this.consort) {
      this.consort.dispose();
      this.consort = null;
      this.hooks.toast('Your consort fires a gun in salute and makes for port.');
    }
    ship.windOverride = null;
    ship.lean = 0;
    ship.disableDeck();
    this.current = null;
    this.player.teleport(land.clone().setY(heightAt(land.x, land.z) + 0.4));
    // A voyage crew goes home; your own crew waits in port.
    this.crew = this.crew.filter((c) => c.hire !== 'voyage');
    for (const c of this.crew) if (c.status === 'aboard') c.status = 'ashore';
    this.clearCrewActors();
    this.syncRecord(ship);
    this.hooks.save();
  }

  /** Dock at a port: the ship takes a berth and you step onto the quay. */
  dock(port: Port) {
    const ship = this.current;
    if (!ship) return;
    const [x, z, yaw] = this.freeBerth(port);
    ship.pos.set(x, 0, z);
    ship.yaw = yaw;
    ship.speed = 0;
    ship.place();
    ship.place();
    const rec = this.records.find((r) => this.ships.get(r.id) === ship);
    if (rec) rec.port = port.id;
    this.addXp(10, 'docked');
    this.hooks.signal?.('sea-dock');
    if (!this.landfalls.has(port.id)) {
      this.landfalls.add(port.id);
      if (port.id !== 'portAurelle') {
        this.addXp(150, 'first landfall');
        this.hooks.toast(`First landfall at ${port.name}!`);
      }
    }
    // The customs cutter on your heels catches you at the quay.
    if (this.customs && this.customs.state !== 'gone' && this.customs.ship.pos.distanceTo(ship.pos) < 300) this.inspect(ship);
    // The crew learn from every voyage.
    const sailed = Math.hypot(ship.pos.x - this.voyageFrom.x, ship.pos.z - this.voyageFrom.z);
    for (const c of this.crew) if (c.status === 'aboard' && c.hire === 'permanent') crewXp(c, Math.round(15 + sailed / 40));
    this.leaveShip(port.landing);
    if (ship.owner === 'rental' && this.rental) this.endRental(true);
  }

  /** The nearest dry land (or pier) within reach of the ship's side. */
  private landingNear(ship: Ship) {
    for (const r of [ship.beam / 2 + 2, ship.beam / 2 + 5, ship.beam / 2 + 9, ship.beam / 2 + 14]) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = ship.pos.x + Math.cos(a) * r, z = ship.pos.z + Math.sin(a) * r;
        const surf = waterSurfaceAt(x, z);
        if (surf === null || heightAt(x, z) > surf + 0.15) return new THREE.Vector3(x, 0, z);
      }
    }
    return null;
  }

  private portAt(p: THREE.Vector3) {
    return PORTS.find((port) => Math.hypot(p.x - port.zone.x, p.z - port.zone.z) < port.r) ?? null;
  }

  private placeHelm() {
    const ship = this.current!;
    const local = ship.def.model === 'skiff' ? new THREE.Vector3(0, 0.05, ship.def.helmZ) : new THREE.Vector3(0, ship.def.deckY + 0.05, ship.def.helmZ);
    this.helm.pos.copy(ship.toWorld(local));
    this.helm.yaw = ship.yaw;
    this.helm.speed = ship.speed;
    this.helm.stand = ship.def.model !== 'skiff';
    this.cam.extra = ship.def.model === 'skiff' ? 1.2 : ship.length * 0.75 + 2;
  }

  // ---- the crew aboard ------------------------------------------------------------------------

  private spawnCrewActors() {
    this.clearCrewActors();
    const ship = this.current;
    if (!ship || ship.def.model === 'skiff') return;
    const aboard = this.crew.filter((c) => c.status === 'aboard').slice(0, 8);
    aboard.forEach((c, i) => {
      // Stations: at the masts, the rails, the guns, the bow.
      const local = new THREE.Vector3(((i % 2) - 0.5) * ship.beam * 0.5, ship.def.deckY, -ship.length * 0.25 + (i / Math.max(1, aboard.length)) * ship.length * 0.6);
      void buildCharacter(c.look, ['idle']).then((b) => {
        if (this.current !== ship || c.status !== 'aboard') return;
        const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
        acts[0]?.play();
        b.mixer.update(Math.random() * 2);
        this.scene.add(b.root);
        this.crewActors.push({ c, built: b, local });
      });
    });
  }

  private clearCrewActors() {
    for (const a of this.crewActors) this.scene.remove(a.built.root);
    this.crewActors = [];
  }

  // ---- interactables ------------------------------------------------------------------------

  private buildInteractables() {
    const self = this;
    const p = this.player;
    const nearShip = () => {
      // A ship you can board: yours or your rental, close by, and you're not aboard.
      if (self.current) return null;
      let best: Ship | null = null, bd = Infinity;
      for (const s of self.ships.values()) {
        if (s.sunk) continue;
        const d = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z) - s.length * 0.5;
        if (d < 6 && d < bd) (bd = d), (best = s);
      }
      return best;
    };
    const boardPos = new THREE.Vector3(0, -999, 0);
    const helmPos = new THREE.Vector3(0, -999, 0);
    const ashorePos = new THREE.Vector3(0, -999, 0);
    const wreckPos = new THREE.Vector3(0, -999, 0);
    const lootPos = new THREE.Vector3(0, -999, 0);
    const plunderPos = new THREE.Vector3(0, -999, 0);
    const rescuePos = new THREE.Vector3(0, -999, 0);
    const boardEnemyPos = new THREE.Vector3(0, -999, 0);
    const returnPos = new THREE.Vector3(0, -999, 0);
    const firePos = new THREE.Vector3(0, -999, 0);
    this.interactables.push(
      {
        pos: boardPos, radius: 7,
        label: () => { const s = nearShip(); return s ? (s.capsized ? `Right the ${s.name}` : `Board the ${s.name}`) : ''; },
        enabled: () => !!nearShip(),
        action: () => {
          const s = nearShip();
          if (!s) return;
          if (s.capsized) {
            s.capsized = false;
            s.water = Math.max(0, s.water - 0.4);
            this.hooks.toast('You haul her upright. Water sloshes in the bilge.');
          }
          self.board(s);
        },
      },
      {
        pos: helmPos, radius: 2.4,
        label: () => (self.atHelm ? 'Leave the helm' : self.current && !self.atHelm ? 'Take the helm' : ''),
        enabled: () => !!self.current && (self.atHelm ? self.current.def.model !== 'skiff' : true),
        action: () => (self.atHelm ? self.leaveHelm() : self.takeHelm()),
      },
      {
        pos: ashorePos, radius: 30,
        label: () => {
          const s = self.current;
          if (!s) return '';
          const port = self.portAt(s.pos);
          if (port && Math.abs(s.speed) < 2.5) return `Dock at ${port.name}`;
          return self.landingNear(s) && Math.abs(s.speed) < 2 ? 'Go ashore' : '';
        },
        enabled: () => {
          const s = self.current;
          if (!s || Math.abs(s.speed) >= 2.5) return false;
          return !!self.portAt(s.pos) || !!self.landingNear(s);
        },
        action: () => {
          const s = self.current!;
          const port = self.portAt(s.pos);
          if (port) return self.dock(port);
          const land = self.landingNear(s);
          if (land) self.leaveShip(land);
        },
      },
      {
        pos: wreckPos, radius: 7,
        label: () => { const w = self.nearWreck(); return w ? `Search the wreck of the ${w.name}` : ''; },
        enabled: () => !!self.nearWreck(),
        action: () => {
          const w = self.nearWreck();
          if (!w) return;
          w.searched = true;
          if (w.gold) self.hooks.addGold(w.gold);
          for (const [id, n] of w.items) self.hooks.give(id, n);
          self.hooks.toast(`In the drowned hold of the ${w.name}: ${w.gold} gold${w.items.length ? ' and more' : ''}.`);
          self.hooks.save();
        },
      },
      {
        pos: lootPos, radius: 9,
        label: () => (self.nearLoot() ? 'Haul in the floating cargo' : ''),
        enabled: () => !!self.nearLoot(),
        action: () => {
          const l = self.nearLoot();
          if (!l) return;
          self.hooks.addGold(l.gold);
          for (const [id, n] of l.items) self.hooks.give(id, n);
          self.scene.remove(l.mesh);
          self.loot = self.loot.filter((x) => x !== l);
          self.hooks.toast(`Hauled aboard: ${l.gold} gold of salvage.`);
        },
      },
      {
        pos: plunderPos, radius: 18,
        label: () => (self.plunderBy ? `Decide the fate of the ${self.plunderBy.ship.name}` : ''),
        enabled: () => !!self.plunderBy,
        action: () => { if (self.plunderBy) self.parley(self.plunderBy); },
      },
      {
        pos: boardEnemyPos, radius: 16,
        label: () => { const pr = self.boardable(); return pr ? `Grapple and board the ${pr.ship.name}!` : ''; },
        enabled: () => !!self.boardable(),
        action: () => { const pr = self.boardable(); if (pr) self.boardEnemy(pr); },
      },
      {
        pos: returnPos, radius: 6,
        label: () => (self.boarding && self.current && !self.current.onDeck(self.player.pos) && self.boarding.ship.onDeck(self.player.pos) ? `Back aboard the ${self.current.name}` : ''),
        enabled: () => !!self.boarding && !!self.current && self.boarding.ship.onDeck(self.player.pos),
        action: () => { const c = self.current; if (c) self.player.teleport(c.toWorld(new THREE.Vector3(0, c.def.deckY + 0.3, 0))); },
      },
      {
        pos: firePos, radius: 30,
        label: () => (self.current && self.current.fire > 0 && self.current.onDeck(self.player.pos) ? 'Fight the fire!' : ''),
        enabled: () => !!self.current && self.current.fire > 0 && self.current.onDeck(self.player.pos),
        action: () => {
          const c = self.current;
          if (!c) return;
          c.fire = Math.max(0, c.fire - 0.3);
          self.fx.alpha.spawn({ pos: self.player.pos.clone().setY(self.player.pos.y + 1), spread: 1.5, count: 12, life: [0.6, 1.2], size: [0.4, 1.2], color: 0xd8d4cc, alpha: 0.6, upBias: 0.4 });
          self.hooks.toast(c.fire > 0 ? 'A bucket on the flames: keep at it!' : 'The fire\'s out.');
        },
      },
      {
        pos: rescuePos, radius: 5,
        label: () => (self.player.swimming && self.current === null && self.lastShipNear() ? 'Climb aboard' : ''),
        enabled: () => self.player.swimming && !!self.lastShipNear(),
        action: () => {
          const s = self.lastShipNear();
          if (s) self.board(s);
        },
      },
    );
    // (Positions follow the player and the ships each step.)
    this.updateInteractables = () => {
      const s = nearShip();
      boardPos.copy(s ? p.pos : new THREE.Vector3(0, -999, 0));
      const c = self.current;
      if (c) {
        helmPos.copy(self.atHelm ? p.pos : c.toWorld(new THREE.Vector3(0, c.def.deckY, c.def.helmZ)));
        ashorePos.copy(p.pos);
      } else {
        helmPos.set(0, -999, 0);
        ashorePos.set(0, -999, 0);
      }
      wreckPos.copy(self.nearWreck() ? p.pos : new THREE.Vector3(0, -999, 0));
      lootPos.copy(self.nearLoot() ? p.pos : new THREE.Vector3(0, -999, 0));
      plunderPos.copy(self.plunderBy ? p.pos : new THREE.Vector3(0, -999, 0));
      rescuePos.copy(self.player.swimming && self.lastShipNear() ? p.pos : new THREE.Vector3(0, -999, 0));
      boardEnemyPos.copy(self.boardable() ? p.pos : new THREE.Vector3(0, -999, 0));
      returnPos.copy(self.boarding ? p.pos : new THREE.Vector3(0, -999, 0));
      firePos.copy(self.current && self.current.fire > 0 ? p.pos : new THREE.Vector3(0, -999, 0));
    };
  }
  private updateInteractables = () => {};

  private nearWreck() {
    if (!this.player.underwater) return null;
    return this.wrecks.find((w) => !w.searched && Math.hypot(this.player.pos.x - w.x, this.player.pos.z - w.z) < 9) ?? null;
  }
  private nearLoot() {
    const c = this.current;
    const at = c ? c.pos : this.player.pos;
    return this.loot.find((l) => Math.hypot(at.x - l.pos.x, at.z - l.pos.z) < (c ? c.length * 0.5 + 8 : 4)) ?? null;
  }
  private lastShipNear() {
    for (const s of this.ships.values()) {
      if (s.sunk || s.capsized) continue;
      if (Math.hypot(this.player.pos.x - s.pos.x, this.player.pos.z - s.pos.z) < s.length * 0.5 + 3) return s;
    }
    return null;
  }

  // ---- every simulation step ----------------------------------------------------------------

  /** Before the player moves: ships sail, decks carry what stands on them, threats act. */
  preStep(dt: number) {
    const ship = this.current;
    const eff = crewEffects(this.crew, ship ? ship.thrown : 0);
    const pk = this.perks;
    // The Diver's craft, and floating wreckage to cling to.
    this.player.breathTime = 25 * pk.breath;
    this.player.swimSpeedMul = pk.swimSpeed;
    this.player.swimStaminaMul = pk.swimStamina;
    this.player.armourDrag = !pk.weighted;
    this.player.tideChild = pk.childOfTide;
    this.player.buoyed = this.player.swimming && this.loot.some((l) => Math.hypot(l.pos.x - this.player.pos.x, l.pos.z - this.player.pos.z) < 3);
    // The spyglass: hold B to look far.
    const glass = this.input.heldKey('KeyB');
    if (glass !== this.spyglass) {
      this.spyglass = glass;
      if (glass) {
        this.fovWas = this.cam.fovBase;
        this.cam.fovBase = 16;
      } else this.cam.fovBase = this.fovWas;
    }
    this.windCd = Math.max(0, this.windCd - dt);
    this.pressCd = Math.max(0, this.pressCd - dt);
    // The markets settle back, hour by hour.
    const hourNow = Math.floor(this.hooks.hours());
    if (hourNow !== this.supplyHour) {
      if (this.supplyHour >= 0) recoverSupply(this.supply, hourNow - this.supplyHour);
      this.supplyHour = hourNow;
    }
    this.updateCustoms(dt, ship);
    // Lit lighthouses shine at night.
    const night = this.hooks.hours() % 24;
    const dark = night > 19 || night < 6;
    for (const [id, l] of this.lighthouses) if (this.lit.has(id)) (l.glow.material as THREE.SpriteMaterial).opacity = dark ? 0.9 : 0.25;
    // Ships nobody sails ride at anchor (only the near ones need updating).
    for (const s of this.ships.values()) {
      if (s === ship) continue;
      if (Math.hypot(s.pos.x - this.player.pos.x, s.pos.z - this.player.pos.z) < 700) s.update(dt, { ...NO_CONTROL(), anchor: true }, { skill: 0, assisted: true });
    }
    if (ship) {
      ship.perks = this.shipPerks();
      if (this.atHelm) this.readHelm(dt, ship);
      else if (this.lashed !== null) {
        // The lashed wheel: she holds the heading you left her on.
        const err = Math.atan2(Math.sin(ship.yaw - this.lashed), Math.cos(ship.yaw - this.lashed));
        this.ctl.rudder = Math.max(-1, Math.min(1, err * 3));
      }
      ship.lean = this.atHelm && (ship.hull === 'skiff' || ship.hull === 'sloop') && this.input.held('sprint') ? 1 : 0;
      if (this.windT > 0) {
        this.windT -= dt;
        if (this.windT <= 0) {
          ship.windOverride = null;
          this.hooks.toast('The called wind dies away.');
        }
      }
      if (pk.mend && !ship.sunk) {
        ship.sailHp = Math.min(ship.stats.sails, ship.sailHp + ship.stats.sails * 0.004 * dt);
        for (let i = 0; i < 3; i++) ship.sections[i] = Math.min(ship.stats.hull, ship.sections[i] + ship.stats.hull * 0.0015 * dt);
      }
      ship.crew = eff.hands + (this.atHelm ? 0 : 1);
      ship.pumping = this.atHelm ? 0 : 0.5;
      ship.stats.speed = ship.stats.speed; // (crew's bosun applies below)
      const skill = Math.min(1, this.skill + eff.seaSense);
      const before = ship.speed;
      ship.update(dt, this.ctl, { skill, assisted: this.assisted });
      if (eff.sailing > 1 && ship.speed > 0) ship.speed = Math.min(ship.speed * (1 + (eff.sailing - 1) * dt), ship.stats.speed * 1.12);
      void before;
      // The shipwright patches holes at sea.
      if (eff.repair > 0) for (let i = 0; i < 3; i++) ship.sections[i] = Math.min(ship.stats.hull, ship.sections[i] + eff.repair * dt * (ship.sections[i] < ship.stats.hull * 0.98 ? 1 : 0));
      if (this.atHelm) this.placeHelm();
      else if (ship.onDeck(this.player.pos)) {
        // Whoever stands on the deck moves with it, exactly.
        this.player.carry(ship.carry(this.player.pos), ship.carryYaw());
      } else if (this.boarding && this.boarding.ship.onDeck(this.player.pos)) {
        // Fighting on the enemy's deck: it carries you just the same.
        const s2 = this.boarding.ship;
        this.player.carry(s2.carry(this.player.pos), s2.carryYaw());
      }
      // Your crew fight the fire, and the ram.
      if (ship.fire > 0) ship.fire = Math.max(0, ship.fire - dt * 0.012 * Math.min(6, eff.hands));
      this.ramT = Math.max(0, this.ramT - dt);
      if (Math.abs(ship.speed) > 3 && this.ramT <= 0) {
        const bow = ship.toWorld(new THREE.Vector3(0, ship.def.deckY * 0.3, ship.length * 0.5));
        for (const pr of this.pirates) {
          if (pr.ship.sunk || !pr.ship.contains(bow, 0.6)) continue;
          // Ramming: her bow stove into the pirate's side; it costs you some planking too.
          const hit = Math.abs(ship.speed) * ship.length * 3.2;
          const sec = pr.ship.sectionOf(pr.ship.toLocal(bow));
          pr.ship.damage(sec, hit);
          pr.loseCrew(2);
          ship.damage(0, hit * (ship.fit.hull >= 2 ? 0.15 : 0.3));
          ship.speed *= 0.3;
          this.ramT = 3;
          this.hooks.shake(0.9);
          this.hooks.toast(`You ram the ${pr.ship.name} in the ${SECTION_NAMES[sec]}!`);
          this.addXp(15);
        }
      }
      // Seamanship for sailing well: distance on a good trim.
      const moved = Math.hypot(ship.pos.x - this.lastPos.x, ship.pos.z - this.lastPos.z);
      this.lastPos.copy(ship.pos);
      if (moved < 5) {
        this.stats.metres += moved;
        if (ship.trim > 0.8 && ship.sailSet > 0.5) this.xp += moved * (this.assisted ? 0.03 : 0.045) * (1 + dangerAt(ship.pos.x, ship.pos.z) * 0.25);
      }
      for (const a of this.crewActors) {
        a.built.root.position.copy(ship.toWorld(a.local));
        a.built.root.rotation.y = ship.yaw + (a.local.x > 0 ? Math.PI / 2 : -Math.PI / 2);
        a.built.mixer.update(dt);
      }
      // Storms: a warning, then the reward for coming through one.
      const storm = Math.max(SEA.storm, cellStormAt(ship.pos.x, ship.pos.z));
      if (storm > 0.45 && !this.wasStorm) {
        this.wasStorm = true;
        this.hooks.toast('A storm is on you! Reef the sails (R) and meet the waves on the bow quarter.');
      } else if (storm < 0.2 && this.wasStorm) {
        this.wasStorm = false;
        this.stats.storms++;
        this.addXp(Math.round(50 + ship.def.length * 2), 'weathered a storm');
      }
      if (!this.wasStorm && eff.lookout > 1.2) {
        const near = STORMS.find((c) => Math.hypot(c.x - ship.pos.x, c.z - ship.pos.z) < c.r + 500 * eff.lookout);
        if (near && Math.random() < dt * 0.02) this.hooks.toast('Your lookout sees a storm building on the horizon.');
      }
      this.encounters(dt, ship, eff.lookout);
      this.seaCraft(dt, ship, storm, eff);
    } else this.cam.extra = 0;
    this.updateThreats(dt, ship, eff);
    if (this.consort) {
      this.consort.update(dt, ship, this.pirates, this.gunnery);
      if (this.consort.ship.sunk && this.consort.ship.sinkT > 30) {
        this.consort.dispose();
        this.consort = null;
      }
    }
    const foes: DeckFoe[] = this.pirates.flatMap((p) => p.fighters());
    this.gunnery.update(dt, [...this.ships.values(), ...this.pirates.map((p) => p.ship), ...(this.consort ? [this.consort.ship] : [])], [...(this.serpent ? [this.serpent] : []), ...this.sharks, ...(this.beast ? this.beast.parts() : [])], foes);
    this.bolts.update(dt, this.player);
    this.updateOverboard(dt);
    this.updateInteractables();
    this.payWages();
    // Rentals that are never brought back cost the deposit.
    if (this.rental && this.hooks.hours() > this.rental.until + 72) {
      this.hooks.toast('Mira has written off your hired boat. The deposit is gone.');
      this.rental.deposit = 0;
      this.endRental(false);
    }
  }

  /** The helm: rudder, sail, reef, anchor, oars, trim, and the guns. */
  private readHelm(dt: number, ship: Ship) {
    const inp = this.input;
    const c = this.ctl;
    const steer = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
    c.rudder += (steer - c.rudder) * Math.min(1, dt * (steer ? 3 : 2));
    if (inp.held('forward')) c.sail = Math.min(1, c.sail + dt * 0.7);
    if (inp.held('back')) c.sail = Math.max(0, c.sail - dt * 0.9);
    if (inp.pressedKey('KeyR')) {
      c.reef = !c.reef;
      this.hooks.toast(c.reef ? 'Sails reefed: slower, steadier.' : 'Reefs shaken out.');
    }
    if (inp.pressedKey('KeyF')) {
      c.anchor = !c.anchor;
      this.hooks.toast(c.anchor ? 'Anchor down.' : 'Anchor up.');
    }
    if (inp.pressedKey('KeyG')) {
      this.mode = this.assisted ? 'seafarer' : 'assisted';
      this.hooks.toast(this.assisted ? 'Assisted sailing: the sails trim themselves.' : 'Full sailing: trim with Z and X. More Seamanship for sailing well.');
      if (!this.assisted) c.sheet = ship.sheet;
    }
    if (!this.assisted) {
      if (c.sheet === null) c.sheet = ship.sheet;
      if (inp.heldKey('KeyZ')) c.sheet = Math.max(0, c.sheet - dt * 0.8);
      if (inp.heldKey('KeyX')) c.sheet = Math.min(1.5, c.sheet + dt * 0.8);
    } else c.sheet = null;
    c.row = inp.held('jump') ? 1 : 0;
    if (inp.pressedKey('KeyL') && ship.def.model !== 'skiff') {
      // Lash the wheel and walk away: she holds this heading.
      this.leaveHelm();
      this.lashed = ship.yaw;
      this.hooks.toast('Helm lashed. She\'ll hold this heading; the wind and waves still have their say.');
      return;
    }
    if (inp.pressedKey('KeyY') && this.perks.windcaller) {
      if (this.windCd > 0) this.hooks.toast(`The wind won't answer again for ${Math.ceil(this.windCd / 60)} minutes.`);
      else {
        // A fair wind on the quarter, whatever the sky was doing.
        const a = ship.yaw + (Math.random() < 0.5 ? 1 : -1) * 0.95;
        ship.windOverride = { dir: new THREE.Vector2(Math.sin(a), Math.cos(a)), speed: Math.max(11, ship.windSpeed) };
        this.windT = 60;
        this.windCd = 600;
        this.hooks.toast('You call the wind, and it comes: fair on the quarter.');
      }
    }
    if (inp.pressedKey('KeyU') && this.perks.fullPress) {
      if (this.pressCd > 0) this.hooks.toast(`The crew are spent: ${Math.ceil(this.pressCd)}s.`);
      else {
        ship.pressT = 30;
        this.pressCd = 300;
        this.hooks.toast('Full press! Every stitch of canvas, and she points higher.');
      }
    }
    // Guns: fire the broadside on the side you're looking at.
    const eff = crewEffects(this.crew, ship.thrown);
    this.reload[-1] = Math.max(0, this.reload[-1] - dt);
    this.reload[1] = Math.max(0, this.reload[1] - dt);
    this.harpoonT = Math.max(0, this.harpoonT - dt);
    const look = this.cam.forward();
    const right = new THREE.Vector3(-Math.cos(ship.yaw), 0, Math.sin(ship.yaw));
    const side = (look.dot(right) > 0 ? 1 : -1) as -1 | 1;
    // T: the shot in the guns (round always; chain and grape, and fire pots, are learned).
    if (inp.pressedKey('KeyT') && ship.stats.guns) {
      const kinds = this.shotKinds();
      this.shot = kinds[(kinds.indexOf(this.shot) + 1) % kinds.length];
      this.hooks.toast(`${SHOT_NAMES[this.shot]} in the guns.`);
    }
    if (!this.shotKinds().includes(this.shot)) this.shot = 'ball';
    this.swivelT = Math.max(0, this.swivelT - dt);
    const swivels = ship.fit.guns === 1;
    if (inp.wasPressed('attack') && swivels && this.swivelT <= 0) {
      // Swivel guns: one at a time, aimed freely from the rail.
      this.gunnery.swivel(ship, look, this.nearestEnemy(ship, look, 0.96, 120, true) ?? undefined, this.perks.ballDmg);
      this.swivelT = 2.4 * this.perks.reload;
      this.hooks.shake(0.15);
    } else if (inp.wasPressed('attack') && ship.stats.guns && !swivels && this.reload[side] <= 0) {
      const beam = new THREE.Vector3(-Math.cos(ship.yaw) * side, 0, Math.sin(ship.yaw) * side);
      const target = this.nearestEnemy(ship, beam, 0.75);
      const range = target ? target.pos.distanceTo(ship.pos) : 60;
      // Thunder Broadside: every ninety seconds, every gun as one.
      const thunder = this.perks.thunder && performance.now() / 1000 - this.thunderAt > 90;
      if (thunder) {
        this.thunderAt = performance.now() / 1000;
        this.hooks.toast('Thunder broadside!');
      }
      this.gunnery.broadside(ship, side, range, target?.pos, target?.vel, { shot: this.shot, dmg: this.perks.ballDmg * (thunder ? 2 : 1), spread: this.perks.spread * (thunder ? 0.3 : 1) });
      this.reload[side] = Gunnery.reload(ship, eff.gunner) * this.perks.reload;
      this.hooks.shake(thunder ? 0.7 : 0.35);
    }
    const line = this.gunnery.tetheredTo(ship);
    if (line) {
      // On the line: hold right click to reel in, O to cut it loose.
      if (inp.held('offhand')) this.gunnery.reel(ship, dt);
      if (inp.pressedKey('KeyO')) {
        this.gunnery.cut(ship);
        this.hooks.toast('You cut the line.');
      }
    } else if (inp.wasPressed('offhand') && ship.stats.harpoon && this.harpoonT <= 0) {
      // The harpooner lays it on whatever's near where you're looking.
      this.gunnery.harpoon(ship, look, ship.stats.harpoon >= 2, this.nearestEnemy(ship, look, 0.94, 90, true) ?? undefined, this.perks.harpoonDmg);
      this.harpoonT = 4 / eff.harpoon;
    }
  }

  /** The nearest pirate or monster within the cone `dir`·`cos`, out to `range`. */
  private nearestEnemy(ship: Ship, dir: THREE.Vector3, cos: number, range = 160, sharks = false) {
    const d0 = dir.clone().setY(0).normalize();
    let best: { pos: THREE.Vector3; vel?: THREE.Vector3 } | null = null, bd = range;
    const consider = (pos: THREE.Vector3, vel?: THREE.Vector3) => {
      const to = pos.clone().sub(ship.pos).setY(0);
      const d = to.length();
      if (d < bd && to.normalize().dot(d0) > cos) (bd = d), (best = { pos, vel });
    };
    for (const p of this.pirates) if (!p.ship.sunk) consider(p.ship.pos, new THREE.Vector3(Math.sin(p.ship.yaw) * p.ship.speed, 0, Math.cos(p.ship.yaw) * p.ship.speed));
    if (this.serpent?.alive) consider(this.serpent.pos, this.serpent.vel);
    if (this.beast) for (const p of this.beast.parts()) consider(p.pos, p.vel);
    if (sharks) for (const s of this.sharks) if (s.alive) consider(s.pos, s.vel);
    return best as { pos: THREE.Vector3; vel?: THREE.Vector3 } | null;
  }

  // ---- what the sea throws at you ---------------------------------------------------------------

  private encounters(dt: number, ship: Ship, lookout: number) {
    const danger = dangerAt(ship.pos.x, ship.pos.z);
    this.storyEncounters(ship);
    // Pirates in open water, more the wilder it gets.
    this.pirateT -= dt;
    if (this.pirateT <= 0) {
      this.pirateT = 70 + Math.random() * 80;
      const max = danger < 3 ? 1 : 2;
      if (danger >= 1.2 && this.pirates.filter((p) => !p.ship.sunk).length < max && Math.random() < 0.18 + (danger - 1.2) * 0.14) {
        const a = Math.random() * Math.PI * 2, d = 340 + Math.random() * 120;
        const at = new THREE.Vector3(ship.pos.x + Math.cos(a) * d, 0, ship.pos.z + Math.sin(a) * d);
        if (heightAt(at.x, at.z) < SEA_LEVEL - 3) {
          const pr = new PirateShip(this.scene, this.fx, this.bolts, at, danger);
          pr.ship.onEvent = (e) => { if (e === 'sinking') this.pirateSunk(pr); };
          this.pirates.push(pr);
          this.hooks.toast(lookout > 1.2 ? `Your lookout cries: "Sail ho! Black sails, the ${pr.ship.name}!"` : 'A ship with black sails is closing on you!');
        }
      }
    }
    // The serpent hunts the wild water.
    this.monsterT -= dt;
    if (this.monsterT <= 0) {
      this.monsterT = 100 + Math.random() * 90;
      this.beastEncounter(ship, danger);
      const hunting = this.beast ? 0 : this.hooks.wants?.('serpent-slain') ? 3 : 1;
      if (danger >= 2.3 && !this.serpent && Math.random() < (0.12 + (danger - 2.3) * 0.12) * hunting) {
        const a = Math.random() * Math.PI * 2;
        this.spawnSerpent(new THREE.Vector3(ship.pos.x + Math.cos(a) * 90, 0, ship.pos.z + Math.sin(a) * 90), danger);
        this.hooks.toast('The water heaves. Something huge is circling the ship…');
      }
    }
  }

  spawnSerpent(at: THREE.Vector3, danger: number) {
    const s = new SeaSerpent(this.scene, this.fx, at, danger);
    s.weakMul = this.perks.weakPoint;
    s.onRam = (sec) => {
      const ship = this.current;
      if (!ship) return;
      ship.damage(sec, ship.stats.hull * 0.16 * ship.stats.monster);
      ship.water = Math.min(1, ship.water + 0.05);
      this.hooks.shake(0.8);
      this.hooks.toast(`The serpent rams the ${SECTION_NAMES[sec]}!`);
      this.crewOverboard(0.25);
    };
    s.onBite = () => {
      this.hooks.shake(0.5);
      const crewHit = this.crew.filter((c) => c.status === 'aboard');
      if (crewHit.length && Math.random() < 0.3) {
        const c = crewHit[Math.floor(Math.random() * crewHit.length)];
        c.morale = Math.max(0, c.morale - 0.2);
        this.hooks.toast(`The serpent snaps at ${c.name}!`);
      }
    };
    s.onDeath = () => {
      const n = 2 + Math.round(danger);
      this.hooks.give('serpentScale', n);
      this.hooks.addGold(Math.round(150 + danger * 120));
      this.hooks.toast(`The sea serpent sinks, dead. You cut ${n} great scales from its back.`);
      this.addXp(Math.round(220 + danger * 80), 'slew a sea serpent');
      this.stats.monsters++;
      this.hooks.signal?.('serpent-slain');
    };
    this.serpent = s;
    return s;
  }

  spawnPirate(at: THREE.Vector3, danger: number, opts?: PirateOpts) {
    const pr = new PirateShip(this.scene, this.fx, this.bolts, at, danger, opts);
    pr.ship.onEvent = (e) => { if (e === 'sinking') this.pirateSunk(pr); };
    this.pirates.push(pr);
    return pr;
  }

  private pirateSunk(pr: PirateShip) {
    if (pr.plundered) return;
    this.storyBeaten(pr, true);
    this.stats.pirates++;
    this.addXp(Math.round(80 + pr.danger * 50), 'sank a pirate');
    // Floating cargo where she went down, and her wreck to dive.
    for (let k = 0; k < 3; k++) this.dropLoot(pr.ship.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)), Math.round(pr.bounty / 4), k === 0 ? [['healthPotion', 1]] : []);
    this.addWreck(pr.ship, Math.round(pr.bounty / 2), [['greaterHealthPotion', 1]]);
  }

  private dropLoot(at: THREE.Vector3, gold: number, items: [string, number][]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 }));
    mesh.position.copy(at).setY(SEA_LEVEL);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.loot.push({ pos: at, mesh, gold, items });
  }

  private addWreck(ship: Ship, gold: number, items: [string, number][]) {
    const w: WreckRecord = { id: 'wreck-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name: ship.name, hull: ship.hull, x: ship.pos.x, z: ship.pos.z, gold, items, searched: false };
    this.wrecks.push(w);
    this.showWreck(w);
  }

  private showWreck(w: WreckRecord) {
    if (this.wreckMeshes.has(w.id)) return;
    const s = new Ship(this.scene, w.hull, STOCK_FIT(), { name: w.name, hullColor: 0x3a3028, trim: 0x4a4038 });
    s.sailSet = 0;
    s.place();
    const g = s.group;
    g.position.set(w.x, heightAt(w.x, w.z) + 0.6, w.z);
    g.rotation.set(0.15, Math.random() * 6, 0.9);
    this.wreckMeshes.set(w.id, g);
  }

  private updateThreats(dt: number, ship: Ship | null, eff: ReturnType<typeof crewEffects>) {
    for (const pr of this.pirates) {
      pr.update(dt, ship, this.gunnery, !!ship);
      pr.updateBoarders(dt, this.player);
      // Your crew fight boarders (and defenders when you board her): they wear them down.
      const fierce = eff.fighters * (this.perks.boardingParty ? 2 : 1);
      if (ship && (pr.grappled || pr.state === 'boarded')) for (const b of pr.fighters()) if (Math.random() < dt * 0.25 * fierce / 3) b.takeHit({ damage: 18, poise: 10, dir: new THREE.Vector3(1, 0, 0), at: b.center.clone(), crit: false, source: 'melee' });
      if (pr.state === 'struck' && !pr.plundered && ship && pr.ship.pos.distanceTo(ship.pos) < 30) this.plunderBy = pr;
      if (pr === this.boarding && pr.won) {
        pr.state = 'taken';
        this.plunderBy = pr;
        this.hooks.toast(`The ${pr.ship.name} is yours! Her last defender falls. Decide her fate (E).`);
        this.addXp(Math.round(80 + pr.danger * 40), 'took a ship by boarding');
      }
    }
    if (this.plunderBy && (this.plunderBy.plundered || !ship)) this.plunderBy = null;
    // Pack up what's sunk, fled or far behind.
    this.pirates = this.pirates.filter((pr) => {
      if (pr === this.boarding) return true;
      const far = pr.ship.pos.distanceTo(this.player.pos) > 1100;
      const gone = (pr.ship.sunk && pr.ship.sinkT > 30) || far;
      if (gone) pr.dispose();
      return !gone;
    });
    const s = this.serpent;
    if (s) {
      s.update(dt, ship, this.player);
      const near = s.alive && s.pos.distanceTo(this.player.pos) < 60;
      if (near) this.hooks.bossBar(s, 'Sea Serpent');
      else if (!s.alive) this.hooks.bossBar(null);
      if ((!s.alive && s.state === 'dying' && !s.pos.y) || s.pos.distanceTo(this.player.pos) > 900) {
        if (!s.alive || s.pos.distanceTo(this.player.pos) > 900) {
          this.hooks.bossBar(null);
          s.dispose();
          this.serpent = null;
        }
      }
    }
    // The great monster of the moment.
    const bst = this.beast;
    if (bst) {
      bst.update(dt, ship, this.player, this.beastCtx(ship));
      const near = bst.alive && bst.pos.distanceTo(this.player.pos) < 260;
      if (near) this.hooks.bossBar(bst, bst.name);
      if (bst.beaten && !this.trophiesTaken.has(bst)) {
        this.trophiesTaken.add(bst);
        this.beastBeaten(bst);
      }
      if (bst.finished || bst.pos.distanceTo(this.player.pos) > 1200) {
        this.hooks.bossBar(null);
        bst.dispose();
        this.beast = null;
      }
    }
    // Sharks circle anyone in the water out at sea.
    const danger = dangerAt(this.player.pos.x, this.player.pos.z);
    if (this.player.swimming && danger >= 0.8 && this.sharks.length === 0) {
      const n = 1 + Math.floor(danger / 1.5);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        this.sharks.push(new Shark(this.scene, this.fx, this.player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 22, 0, Math.sin(a) * 22)), danger));
      }
    }
    for (const sh of this.sharks) sh.update(dt, this.player);
    this.sharks = this.sharks.filter((sh) => {
      const gone = !sh.alive || sh.bored > 25 || sh.pos.distanceTo(this.player.pos) > 200;
      if (gone) sh.dispose();
      return !gone;
    });
  }

  // ---- ship events ---------------------------------------------------------------------------

  private shipEvent(ship: Ship, e: string, d?: number) {
    const mine = ship === this.current;
    // Wavebreaker: once a voyage, a knockdown is shrugged off.
    if ((e === 'broach' || e === 'capsize') && mine && this.perks.wavebreaker && !this.wavebroken) {
      this.wavebroken = true;
      ship.capsized = false;
      ship.water = Math.max(0, ship.water - 0.12);
      (ship as unknown as { knock: number }).knock = 0;
      this.hooks.toast('Wavebreaker! You throw your weight and the wheel over, and she rights herself.');
      return;
    }
    if (e === 'tack' && mine) {
      if (d) {
        this.hooks.signal?.('sea-tack');
        this.addXp(this.assisted ? 5 : 8);
        if (performance.now() - this.tackSaid > 30000) { this.tackSaid = performance.now(); this.hooks.toast('A clean tack: she comes through the wind and keeps her way.'); }
      } else this.hooks.toast('A slow tack: she hung in the wind and lost her way.');
      return;
    }
    if (e === 'jibe' && mine) {
      if (d) this.hooks.toast('Crash jibe! The boom slams across and tears the canvas. Reef or slow down to jibe.');
      else this.addXp(4);
      return;
    }
    if (e === 'irons' && mine) {
      this.hooks.toast('In irons: you can\'t sail into the wind. Bear away (A/D), or row out (C).');
      return;
    }
    if (e === 'surf' && mine) {
      this.addXp(3);
      if (!this.surfSaid) { this.surfSaid = true; this.hooks.toast('Surfing! She catches the face of a wave and flies.'); }
      return;
    }
    if (e === 'shallows' && mine) {
      if (this.perks.rockSense || crewEffects(this.crew, 0).lookout > 1.2) this.hooks.toast('"Shoal water ahead!" Bear away or slow down.');
      return;
    }
    if (e === 'rogue') return;
    if (e === 'broach' && mine) {
      this.hooks.shake(1);
      this.hooks.toast('A sea breaks over the side and knocks her flat!');
      this.crewOverboard(0.35);
      if (!this.atHelm && ship.onDeck(this.player.pos) && Math.random() < 0.35) this.washOverboard(ship);
    } else if (e === 'capsize' && mine) {
      this.hooks.toast(`The ${ship.name} capsizes! Swim to her and right her.`);
      this.washOverboard(ship);
    } else if (e === 'ground' && mine) {
      this.hooks.shake(0.6);
      this.hooks.toast(`Aground! The ${ship.name}'s bow grinds on the bottom.`);
    } else if (e === 'lightning' && mine) {
      this.hooks.shake(0.7);
      this.hooks.toast('Lightning strikes the mast! The sails burn.');
    } else if (e === 'greenWater' && mine && !this.atHelm && ship.onDeck(this.player.pos) && Math.random() < 0.2) {
      this.hooks.toast('Green water sweeps the deck!');
    } else if (e === 'sinking') {
      if (mine) this.hooks.toast(`The ${ship.name} is going down! Abandon ship!`);
      if (ship.owner === 'player' || ship.owner === 'rental') this.lose(ship);
    }
    void d;
  }

  /** A ship of yours is lost: gone for good, its wreck stays on the seabed. */
  private lose(ship: Ship) {
    if (this.current === ship) {
      if (this.atHelm) { this.atHelm = false; this.player.vehicle = null; this.cam.extra = 0; }
      this.current = null;
      this.washOverboard(ship);
      this.clearCrewActors();
      // Crew in the water: most reach floating wreckage, some don't.
      for (const c of this.crew) if (c.status === 'aboard') {
        if (c.traits.includes('cantSwim') || Math.random() < 0.25) c.status = 'lost';
        else c.status = 'ashore';
      }
      const lost = this.crew.filter((c) => c.status === 'lost');
      if (lost.length) this.hooks.toast(`Lost with the ship: ${lost.map((c) => c.name).join(', ')}.`);
      this.crew = this.crew.filter((c) => c.status !== 'lost' && c.hire !== 'voyage');
    }
    if (ship.owner === 'rental') {
      this.hooks.toast('Mira’s boat is lost. So is your deposit.');
      this.rental = null;
      this.ships.delete('rental');
    } else {
      const rec = this.records.find((r) => this.ships.get(r.id) === ship);
      if (rec) {
        this.records = this.records.filter((r) => r !== rec);
        this.ships.delete(rec.id);
        this.addWreck(ship, Math.round(HULLS[ship.hull].price * 0.1), []);
        this.hooks.toast(`The ${ship.name} is lost for good. Her wreck lies where she sank.`);
      }
    }
    this.hooks.save();
  }

  private washOverboard(ship: Ship) {
    const right = new THREE.Vector3(-Math.cos(ship.yaw), 0, Math.sin(ship.yaw));
    const at = ship.pos.clone().addScaledVector(right, (Math.random() < 0.5 ? -1 : 1) * (ship.beam / 2 + 2.5));
    if (this.atHelm) { this.atHelm = false; this.player.vehicle = null; this.cam.extra = 0; }
    this.current = ship.capsized || ship.sunk ? null : this.current;
    if (this.current === ship) this.current = null;
    this.player.teleport(at.setY(SEA_LEVEL - 1.2));
    this.hooks.toast('You’re in the water! Swim back and climb aboard (E).');
  }

  private crewOverboard(chance: number) {
    const aboard = this.crew.filter((c) => c.status === 'aboard');
    const ship = this.current;
    if (!ship || !aboard.length || Math.random() > chance * this.perks.overboard) return;
    const c = aboard[Math.floor(Math.random() * aboard.length)];
    c.status = 'overboard';
    const right = new THREE.Vector3(-Math.cos(ship.yaw), 0, Math.sin(ship.yaw));
    const pos = ship.pos.clone().addScaledVector(right, (Math.random() < 0.5 ? -1 : 1) * (ship.beam / 2 + 4));
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff6a3a, emissive: 0x8a2a10 }));
    mark.position.copy(pos).setY(SEA_LEVEL);
    this.scene.add(mark);
    this.overboard.push({ c, pos, t: c.traits.includes('cantSwim') ? 25 : 60, mark });
    this.clearCrewActors();
    this.spawnCrewActors();
    this.hooks.toast(`${c.name} is washed overboard! Come about and pick them up.`);
  }

  private updateOverboard(dt: number) {
    const ship = this.current;
    for (const o of this.overboard) {
      o.t -= dt;
      o.mark.position.y = SEA_LEVEL + Math.sin(performance.now() / 400) * 0.15;
      if (ship && Math.hypot(ship.pos.x - o.pos.x, ship.pos.z - o.pos.z) < ship.beam / 2 + 6 && Math.abs(ship.speed) < 4) {
        o.c.status = 'aboard';
        o.t = -999;
        this.hooks.toast(`${o.c.name} is hauled back aboard, coughing.`);
        this.spawnCrewActors();
      } else if (o.t <= 0 && o.t > -900) {
        o.c.status = 'lost';
        this.hooks.toast(`${o.c.name} is lost to the sea.`);
        this.crew = this.crew.filter((c) => c !== o.c);
      }
    }
    for (const o of this.overboard) if (o.t <= 0) this.scene.remove(o.mark);
    this.overboard = this.overboard.filter((o) => o.t > 0);
  }

  /** Wages each morning: pay your crew, or watch their morale sink. */
  private payWages() {
    const day = this.hooks.day();
    if (this.paidDay === day || this.hooks.hours() % 24 < 8) return;
    this.paidDay = day;
    const owed = Math.round(this.crew.filter((c) => c.hire === 'permanent').reduce((a, c) => a + c.wage, 0) * this.perks.wages);
    if (!owed) return;
    if (this.hooks.gold() >= owed) {
      this.hooks.addGold(-owed);
      for (const c of this.crew) c.morale = Math.min(1, c.morale + 0.05);
      this.hooks.toast(`Paid your crew: ${owed}g.`);
    } else {
      for (const c of this.crew) c.morale = Math.max(0, c.morale - 0.25);
      const left = this.crew.filter((c) => c.morale <= 0.05);
      this.crew = this.crew.filter((c) => c.morale > 0.05);
      this.hooks.toast(`You can't pay your crew. Morale falls${left.length ? `; ${left.map((c) => c.name).join(', ')} walked off` : ''}.`);
    }
  }

  // ---- ship against ship: shot, boarding, prizes, parley, the Black Tide -----------------------

  /** The shot you can load: round always; chain and grape, then fire pots, by Gunnery. */
  shotKinds(): ShotKind[] {
    const k: ShotKind[] = ['ball'];
    if (this.perks.chainShot) k.push('chain', 'grape');
    if (this.perks.firePots) k.push('fire');
    return k;
  }

  /** A pirate alongside you can board: beaten, grappled to you, or (Boarding Party) below half her hull. */
  boardable() {
    const ship = this.current;
    if (!ship || this.boarding || this.atHelm || !ship.onDeck(this.player.pos)) return null;
    return this.pirates.find((pr) => !pr.ship.sunk && !pr.plundered && pr.state !== 'taken' && pr.state !== 'boarded'
      && pr.ship.pos.distanceTo(ship.pos) < (pr.ship.beam + ship.beam) / 2 + 9
      && (pr.state === 'struck' || pr.grappled || (this.perks.boardingParty && pr.ship.hullFrac < 0.5))) ?? null;
  }

  /** Grapples over, and over the rail onto her deck: her crew make their stand. */
  boardEnemy(pr: PirateShip) {
    const ship = this.current;
    if (!ship) return;
    this.boarding = pr;
    if (pr.state === 'struck') {
      // She has struck: her crew throw down their arms.
      pr.yieldTo(ship);
      this.plunderBy = pr;
    } else pr.defend(ship);
    this.player.teleport(pr.ship.toWorld(new THREE.Vector3(0, pr.ship.def.deckY + 0.4, 0)));
    this.hooks.toast(pr.state === 'taken' ? `You board the ${pr.ship.name}. Her crew throw down their arms.` : `Over the rail! ${pr.captain} and the crew of the ${pr.ship.name} stand to meet you.`);
  }

  private endBoarding() {
    const pr = this.boarding;
    if (!pr) return;
    this.boarding = null;
    if (!pr.ship.sunk && pr.state !== 'taken') pr.state = 'flee';
    pr.ship.disableDeck();
  }

  /** What to do with a beaten pirate: plunder and scuttle her, ransom her crew, or sail her home. */
  parley(pr: PirateShip) {
    const opts: { label: string; run: () => void }[] = [];
    const finish = () => {
      pr.plundered = true;
      this.plunderBy = null;
      this.stats.pirates++;
      this.storyBeaten(pr, false);
      if (this.boarding === pr) {
        const c = this.current;
        this.boarding = null;
        if (c) this.player.teleport(c.toWorld(new THREE.Vector3(0, c.def.deckY + 0.3, 0)));
      }
      this.hooks.close();
      this.hooks.save();
    };
    opts.push({
      label: `Plunder her and scuttle her (${pr.bounty}g and her stores)`,
      run: () => {
        this.hooks.addGold(pr.bounty);
        this.hooks.give('healthPotion', 2);
        if (pr.danger > 2.5) this.hooks.give('greaterHealthPotion', 1);
        this.addXp(Math.round(60 + pr.danger * 40), 'a pirate taken');
        this.hooks.toast(`You take ${pr.bounty} gold and her stores, put her crew in the boats and fire her magazine. The ${pr.ship.name} goes down.`);
        pr.ship.sunk = true;
        this.addWreck(pr.ship, Math.round(pr.bounty / 4), []);
        finish();
      },
    });
    const ransom = Math.round(pr.bounty * 1.35);
    opts.push({
      label: `Ransom her crew and let them sail (${ransom}g)`,
      run: () => {
        this.hooks.addGold(ransom);
        this.addXp(Math.round(40 + pr.danger * 30), 'a pirate ransomed');
        this.hooks.toast(`${pr.captain} pays ${ransom}g in Crown silver and the ${pr.ship.name} limps away, chastened.`);
        pr.state = 'flee';
        pr.release();
        if (pr.ship.hasDeck) pr.ship.disableDeck();
        finish();
      },
    });
    if (this.perks.prizeCrew) {
      opts.push({
        label: this.records.length >= 4 ? 'Take her as a prize (your fleet is full)' : `Put a prize crew aboard: sail her to Port Aurelle as yours (a ${HULLS[pr.ship.hull].name})`,
        run: () => {
          if (this.records.length >= 4) return;
          this.takePrize(pr);
          finish();
        },
      });
    }
    this.hooks.talk(pr.captain, pr.ship.name, pr.state === 'taken' ? `"Mercy, Captain. The ship is yours. Do with her what you will."` : `"We strike! We strike!" The ${pr.ship.name}'s colours come down.`, [...opts, { label: 'Not yet.', run: () => this.hooks.close() }]);
  }

  /** A captured ship joins your fleet: her prize crew sails her home to a berth. */
  private takePrize(pr: PirateShip) {
    const s = pr.ship;
    pr.release();
    this.pirates = this.pirates.filter((p) => p !== pr);
    s.disableDeck();
    s.owner = 'player';
    s.anchored = true;
    s.fire = 0;
    s.name = 'The ' + ['Redemption', 'Second Chance', 'Prize', 'Turncoat', 'Fortune'][this.records.length % 5];
    const port = PORTS[0];
    const [x, z, yaw] = this.freeBerth(port);
    s.pos.set(x, 0, z);
    s.yaw = yaw;
    s.speed = 0;
    s.place();
    s.place();
    s.onEvent = (e, d) => this.shipEvent(s, e, d);
    const r: ShipRecord = { id: 'ship-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), hull: s.hull, name: s.name, fit: { ...s.fit }, hullColor: 0x1e1a1c, trim: 0x8a1a1a, sections: [...s.sections], sails: s.sailHp, water: 0, x, z, yaw, port: port.id };
    this.records.push(r);
    this.ships.set(r.id, s);
    this.hooks.toast(`A prize crew sails her into Port Aurelle. She's yours now: ${s.name}, a ${HULLS[s.hull].name}. Barrow can refit her.`);
    this.addXp(120, 'a prize taken');
  }

  /** Quest stages that put named ships on the sea. */
  private storyEncounters(ship: Ship) {
    const near = (at: [number, number], r: number) => Math.hypot(ship.pos.x - at[0], ship.pos.z - at[1]) < r;
    if (this.story.has('btScout') && this.hooks.wants?.('bt-scout') !== false && !this.pirates.some((p) => p.tag === 'scout') && near(BLACK_TIDE_SCOUT, 900)) {
      const at = new THREE.Vector3(BLACK_TIDE_SCOUT[0], 0, BLACK_TIDE_SCOUT[1]);
      this.spawnPirate(at, 3, { name: 'The Gallows Tide', captain: 'Captain Ysolde Marr', hull: 'brigantine', fit: { ...STOCK_FIT(), guns: 2, hull: 1, sails: 1 }, bounty: 420, tag: 'scout' });
      this.hooks.toast('Sail ho! A black brigantine with a white wave on her flag: the Gallows Tide!');
    }
    if (this.story.has('btFlag') && this.hooks.wants?.('bt-calloway') !== false && !this.pirates.some((p) => p.tag === 'calloway') && near(BLACK_TIDE_FLAG, 1000)) {
      const at = new THREE.Vector3(BLACK_TIDE_FLAG[0], 0, BLACK_TIDE_FLAG[1]);
      this.spawnPirate(at, 4.2, { name: 'The Widow\'s Wake', captain: 'Captain Rook Calloway', hull: 'galleon', fit: { ...STOCK_FIT(), guns: 3, hull: 2, sails: 2, keel: 1 }, bounty: 1400, tag: 'calloway' });
      this.spawnPirate(at.clone().add(new THREE.Vector3(60, 0, -40)), 3, { name: 'The Black Gull', hull: 'cutter', fit: { ...STOCK_FIT(), guns: 1, sails: 2 }, tag: 'escort' });
      this.hooks.toast('The Widow\'s Wake! Calloway\'s black galleon, with a cutter running escort. Clear for action!');
    }
  }

  /** A story pirate beaten (sunk, scuttled, ransomed or taken). */
  private storyBeaten(pr: PirateShip, sunk: boolean) {
    if (pr.tag === 'scout') this.hooks.signal?.('bt-scout');
    if (pr.tag === 'calloway') {
      this.hooks.signal?.('bt-calloway');
      if (sunk) this.dropLoot(pr.ship.pos.clone(), 300, [['blackTideColours', 1]]);
      else this.hooks.give('blackTideColours', 1);
      this.hooks.toast(sunk ? 'Calloway\'s colours float free of the wreck: haul them in!' : 'You strike the Black Tide\'s colours from Calloway\'s mast with your own hands.');
    }
  }

  // ---- the island harbours, trade and the Maritime Guild ------------------------------------------

  /** The island harbours join the ports you can dock at (and their lighthouses can be relit). */
  addPorts(ports: IslandPort[]) {
    for (const ip of ports) {
      if (PORTS.some((p) => p.id === ip.def.id)) continue;
      PORTS.push({ id: ip.def.id, name: ip.def.name, zone: ip.zone, r: 110, berths: ip.berths, landing: ip.landing });
      this.lighthouses.set(ip.def.id, ip.lighthouse);
      const self = this;
      const at = ip.lighthouse.pos.clone();
      this.interactables.push({
        pos: at, radius: 5,
        label: () => (self.lit.has(ip.def.id) ? '' : `Relight the lighthouse of ${ip.def.name}`),
        enabled: () => !self.lit.has(ip.def.id),
        action: () => {
          self.lightUp(ip.def.id);
          self.addXp(80, 'relit a lighthouse');
          self.hooks.reveal?.(at.x, at.z, 1600);
          self.hooks.toast(`The lamp of ${ip.def.name} burns again. Ships will see it for leagues, and so will you: the waters around are charted.`);
          self.hooks.save();
        },
      });
    }
  }

  /** Light (or put out) a lighthouse. */
  lightUp(id: string, on = true) {
    const l = this.lighthouses.get(id);
    if (on) this.lit.add(id);
    if (!l) return;
    l.lamp.emissiveIntensity = on ? 2.6 : 0;
    (l.glow.material as THREE.SpriteMaterial).opacity = on ? 0.9 : 0;
  }

  portName(id: string) {
    return PORTS.find((p) => p.id === id)?.name ?? id;
  }

  /** Your ships (and a hired one) in a port's harbour. */
  shipsInPort(portId: string) {
    const port = PORTS.find((p) => p.id === portId);
    if (!port) return [];
    return [...this.ships.values()].filter((s) => !s.sunk && (s.owner === 'player' || s.owner === 'rental') && Math.hypot(s.pos.x - port.zone.x, s.pos.z - port.zone.z) < port.r + 40);
  }

  /** A ship's hold (goods -> count). */
  holdOf(ship: Ship): Record<string, number> {
    if (ship.owner === 'rental' && this.rental) return (this.rental.cargo ??= {});
    const rec = this.records.find((r) => this.ships.get(r.id) === ship);
    return rec ? (rec.cargo ??= {}) : {};
  }
  holdUsed(ship: Ship) {
    return Object.values(this.holdOf(ship)).reduce((a, n) => a + n, 0);
  }

  /** A trader: buy and sell by the shipload. */
  tradeOptions(portId: string, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    if (!MARKETS[portId]) return [];
    const ships = this.shipsInPort(portId);
    if (!ships.length) return [{ label: 'Trade cargo', run: () => show('My goods go by the shipload, Captain. Bring your ship into the harbour and we\'ll talk.', [{ label: 'Back.', run: back }]) }];
    return [{
      label: 'Trade cargo',
      run: () => ships.length === 1 ? this.tradeMenu(portId, ships[0], show, back) : show('Which ship\'s hold?', [...ships.map((sh) => ({ label: `${sh.name} (${this.holdUsed(sh)}/${sh.stats.cargo})`, run: () => this.tradeMenu(portId, sh, show, back) })), { label: 'Back.', run: back }]),
    }];
  }

  tradeMenu(portId: string, ship: Ship, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const hold = this.holdOf(ship);
    const opts = GOODS.map((g) => {
      const b = price(portId, g.id, this.supply, 'buy');
      const sl = price(portId, g.id, this.supply, 'sell');
      const n = hold[g.id] ?? 0;
      if (b === null && (sl === null || !n)) return null;
      return { label: `${g.name}: ${b !== null ? `buy ${b}g` : '—'} / ${sl !== null ? `sell ${sl}g` : 'no market'}${n ? ` · ${n} aboard` : ''}`, run: () => this.goodMenu(portId, ship, g.id, show, back) };
    }).filter((x): x is { label: string; run: () => void } => !!x);
    show(`The ${ship.name}'s hold: ${this.holdUsed(ship)} of ${ship.stats.cargo}. What's made here is cheap; what's wanted here is dear.`, [...opts, { label: 'Done.', run: back }]);
  }

  private goodMenu(portId: string, ship: Ship, good: string, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const hold = this.holdOf(ship);
    const g = GOOD[good];
    const b = price(portId, good, this.supply, 'buy');
    const sl = price(portId, good, this.supply, 'sell');
    const n = hold[good] ?? 0;
    const room = ship.stats.cargo - this.holdUsed(ship);
    const again = () => this.goodMenu(portId, ship, good, show, back);
    const buy = (k: number) => {
      const cost = (b ?? 0) * k;
      if (k > room) return show(`She hasn't the room: ${room} left in the hold.`, [{ label: 'Back.', run: again }]);
      if (this.hooks.gold() < cost) return show(`That's ${cost}g.`, [{ label: 'Back.', run: again }]);
      this.hooks.addGold(-cost);
      hold[good] = n + k;
      shiftSupply(this.supply, portId, good, k);
      again();
    };
    const sell = (k: number) => {
      const got = (sl ?? 0) * k;
      this.hooks.addGold(got);
      hold[good] = n - k;
      if (hold[good] <= 0) delete hold[good];
      shiftSupply(this.supply, portId, good, -k);
      this.hooks.toast(`Sold ${k} ${g.name} for ${got}g.`);
      again();
    };
    const opts: { label: string; run: () => void }[] = [];
    if (b !== null) for (const k of [1, 5, 10]) if (k <= Math.max(1, room)) opts.push({ label: `Buy ${k} — ${b * k}g`, run: () => buy(k) });
    if (sl !== null && n > 0) {
      opts.push({ label: `Sell 1 — ${sl}g`, run: () => sell(1) });
      if (n > 1) opts.push({ label: `Sell all ${n} — ${sl * n}g`, run: () => sell(n) });
    }
    show(`${g.name}${g.contraband ? ' (contraband: the Crown\'s customs will take it)' : ''}. ${b !== null ? `${b}g each to buy` : 'Not sold here'}; ${sl !== null ? `${sl}g each to sell` : 'nobody here buys it'}. ${n} aboard, room for ${room}.`, [...opts, { label: 'Back.', run: () => this.tradeMenu(portId, ship, show, back) }]);
  }

  private contractLabel(c: Contract) {
    const left = c.due - this.hooks.hours();
    const mins = Math.round(left * 60);
    const time = left > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : 'overdue';
    return c.kind === 'courier' ? `sealed letters to ${this.portName(c.to)} — ${c.pay}g (${time})` : `${c.n} ${GOOD[c.good!].name} to ${this.portName(c.to)} — ${c.pay}g (${time})`;
  }

  /** The Maritime Guild's board at a port: today's offers and your contracts. */
  contractsMenu(portId: string, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const now = this.hooks.hours();
    const ids = PORTS.map((p) => p.id);
    const dist = (a: string, b: string) => {
      const pa = PORTS.find((p) => p.id === a)!, pb = PORTS.find((p) => p.id === b)!;
      return Math.hypot(pa.zone.x - pb.zone.x, pa.zone.z - pb.zone.z);
    };
    // Game hours per metre at a steady 6 m/s.
    const hpm = 24 / (this.hooks.dayLengthSec?.() ?? 2880) / 6;
    const list = offers(portId, this.hooks.day(), now, ids, dist, hpm).filter((c) => !this.contracts.some((x) => x.id === c.id) && !this.doneContracts.has(c.id));
    const opts: { label: string; run: () => void }[] = list.map((c) => ({
      label: `Take it: ${this.contractLabel(c)}`,
      run: () => {
        if (this.contracts.length >= 4) return show('Four contracts is all the Guild trusts one captain with.', [{ label: 'Back.', run: back }]);
        if (c.kind === 'cargo') {
          const sh = this.shipsInPort(portId).find((x) => x.stats.cargo - this.holdUsed(x) >= c.n!);
          if (!sh) return show(`The cargo goes aboard here: you need a ship in the harbour with room for ${c.n}.`, [{ label: 'Back.', run: back }]);
          const hold = this.holdOf(sh);
          hold[c.good!] = (hold[c.good!] ?? 0) + c.n!;
          this.hooks.toast(`${c.n} ${GOOD[c.good!].name} loaded into the ${sh.name}, bound for ${this.portName(c.to)}.`);
        } else this.hooks.toast(`Sealed letters for ${this.portName(c.to)}. The Guild pays half again if they're early.`);
        this.contracts.push(c);
        this.hooks.save();
        this.contractsMenu(portId, show, back);
      },
    }));
    for (const c of this.contracts) opts.push({ label: `Abandon: ${this.contractLabel(c)}`, run: () => { this.contracts = this.contracts.filter((x) => x !== c); this.doneContracts.add(c.id); this.hooks.toast('The Guild notes it. Your name is a little less good with them.'); this.contractsMenu(portId, show, back); } });
    show(list.length ? 'The Maritime Guild pays for cargo delivered on time, and half again for early. Cargo is loaded here, into a ship of yours in the harbour.' : 'Nothing more on the board today. Come back tomorrow.', [...opts, { label: 'Back.', run: back }]);
  }
  private doneContracts = new Set<string>();

  /** Hand over a contract's cargo (or letters) here. */
  deliver(c: Contract, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const now = this.hooks.hours();
    if (c.kind === 'cargo') {
      const sh = this.shipsInPort(c.to).find((x) => (this.holdOf(x)[c.good!] ?? 0) >= c.n!);
      if (!sh) return show(`Where's the cargo? Bring a ship into the harbour with ${c.n} ${GOOD[c.good!].name} aboard.`, [{ label: 'Back.', run: back }]);
      const hold = this.holdOf(sh);
      hold[c.good!] -= c.n!;
      if (hold[c.good!] <= 0) delete hold[c.good!];
    }
    const pay = now <= c.early ? Math.round(c.pay * 1.5) : now <= c.due ? c.pay : now <= c.due + 24 ? Math.round(c.pay * 0.5) : 0;
    this.hooks.addGold(pay);
    this.contracts = this.contracts.filter((x) => x !== c);
    this.doneContracts.add(c.id);
    this.addXp(pay ? Math.round(30 + pay / 10) : 5, 'a contract delivered');
    this.hooks.signal?.('contract-done');
    show(pay > c.pay ? `Early! The Guild pays ${pay}g, half again for the speed.` : pay ? `On time. ${pay}g, as agreed.` : 'A full day late? The Guild pays nothing for that, Captain.', [{ label: 'Back.', run: back }]);
    this.hooks.save();
  }

  // ---- the customs cutter -----------------------------------------------------------------------

  private contrabandIn(ship: Ship) {
    const hold = this.holdOf(ship);
    return Object.entries(hold).filter(([g, n]) => n > 0 && GOOD[g]?.contraband);
  }

  private updateCustoms(dt: number, ship: Ship | null) {
    if (ship && !this.customs && !this.customsChecked) {
      const crown = PORTS.find((p) => p.crown && Math.hypot(ship.pos.x - p.zone.x, ship.pos.z - p.zone.z) < 750);
      if (crown && this.contrabandIn(ship).length) {
        this.customsChecked = true;
        const hour = this.hooks.hours() % 24;
        const chance = 0.7 * (ship.fit.hold >= 2 ? 0.4 : 1) * (hour > 20 || hour < 5 ? 0.55 : 1);
        if (Math.random() < chance) {
          const dir = new THREE.Vector3(crown.zone.x - ship.pos.x, 0, crown.zone.z - ship.pos.z).normalize();
          this.customs = new CustomsCutter(this.scene, ship.pos.clone().addScaledVector(dir, 220));
          this.hooks.toast('A navy cutter puts out from the harbour flying the customs flag. Heave to for inspection, or run for it!');
        }
      }
    }
    const cu = this.customs;
    if (!cu) return;
    cu.update(dt, ship);
    if (ship && cu.state === 'alongside' && Math.abs(ship.speed) < 3) this.inspect(ship);
    if (cu.state === 'gone') {
      if (!cu.ship.sunk && ship && cu.ship.pos.distanceTo(ship.pos) > 590 && !this.lostCustoms) {
        this.lostCustoms = true;
        this.hooks.toast('You\'ve shaken off the customs cutter.');
      }
      if (!ship || cu.ship.pos.distanceTo(this.player.pos) > 900) {
        cu.dispose();
        this.customs = null;
        this.lostCustoms = false;
      }
    }
  }
  private lostCustoms = false;

  /** The customs men come aboard. */
  inspect(ship: Ship) {
    const cu = this.customs;
    if (cu) {
      cu.state = 'gone';
      this.lostCustoms = true;
    }
    const found = this.contrabandIn(ship);
    if (!found.length) return this.hooks.toast('The customs men poke about the hold and find nothing amiss. They wish you good day.');
    if (ship.fit.hold >= 2 && Math.random() < 0.75) return this.hooks.toast('The customs men search her stem to stern and find nothing. Your smuggler\'s hold keeps its secrets.');
    const hold = this.holdOf(ship);
    let value = 0;
    for (const [g, n] of found) {
      value += GOOD[g].base * n;
      delete hold[g];
    }
    const fine = Math.min(this.hooks.gold(), Math.round(value * 0.3));
    this.hooks.addGold(-fine);
    this.hooks.toast(`The customs men find your contraband and seize it all, and fine you ${fine}g.`);
    this.hooks.save();
  }

  // ---- the chart: what the sea shows on your map --------------------------------------------------

  /** Map marks: your ships, wrecks, lit lighthouses, storms (Weather Eye), contract ports. */
  seaMarkers() {
    const out: { x: number; z: number; kind: 'ship' | 'wreck' | 'light' | 'storm' | 'dest' | 'treasure'; label?: string }[] = [];
    for (const r of this.records) {
      const sh = this.ships.get(r.id);
      if (sh && !sh.sunk) out.push({ x: sh.pos.x, z: sh.pos.z, kind: 'ship', label: r.name });
    }
    for (const w of this.wrecks) if (!w.searched || this.perks.starReckoning) out.push({ x: w.x, z: w.z, kind: 'wreck', label: `Wreck of the ${w.name}` });
    for (const id of this.lit) { const l = this.lighthouses.get(id); if (l) out.push({ x: l.pos.x, z: l.pos.z, kind: 'light', label: `${this.portName(id)} light` }); }
    if (this.perks.weatherEye) for (const c of STORMS) out.push({ x: c.x, z: c.z, kind: 'storm', label: 'Storm' });
    for (const c of this.contracts) { const p = PORTS.find((x) => x.id === c.to); if (p) out.push({ x: p.zone.x, z: p.zone.z, kind: 'dest', label: this.contractLabel(c) }); }
    return out;
  }

  /** Map lines: sea routes between ports you've reached (Charts), currents (Current Lore). */
  seaLines() {
    const out: { pts: [number, number][]; kind: 'route' | 'current' }[] = [];
    if (this.perks.charts) {
      const known = PORTS.filter((p) => p.id === 'portAurelle' || this.landfalls.has(p.id));
      for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) out.push({ pts: [[known[i].zone.x, known[i].zone.z], [known[j].zone.x, known[j].zone.z]], kind: 'route' });
    }
    if (this.perks.currentLore) for (const c of CURRENTS) out.push({ pts: c.pts, kind: 'current' });
    return out;
  }

  // ---- the great monsters ---------------------------------------------------------------------

  private trophiesTaken = new WeakSet<SeaBeast>();

  /** Raise a great monster near the ship (encounters, quests, tests). */
  spawnBeast(id: BeastId, at?: THREE.Vector3) {
    const ship = this.current;
    const base = ship ? ship.pos : this.player.pos;
    this.beast?.dispose();
    const danger = dangerAt(base.x, base.z);
    let where = at;
    if (!where) {
      if (id === 'sirens') {
        // Their rocks lie ahead, off the bow.
        const yaw = ship ? ship.yaw : 0;
        where = base.clone().add(new THREE.Vector3(Math.sin(yaw) * 230 + (Math.random() - 0.5) * 80, 0, Math.cos(yaw) * 230 + (Math.random() - 0.5) * 80));
      } else if (id === 'leviathan') where = base.clone().add(new THREE.Vector3(140, 0, 60));
      else if (id === 'wyrm') where = base.clone().add(new THREE.Vector3(60, 0, -40));
      else if (id === 'oldTeeth') where = base.clone().add(new THREE.Vector3(30, 0, 30));
      else where = base.clone();
    }
    const b = makeBeast(id, this.scene, this.fx, where, Math.max(1.5, danger));
    if (b instanceof Leviathan) b.onBreach = (dir, size) => { const s = this.current; if (s && s.pos.distanceTo(b.pos) < 400) s.rogue(dir, size); };
    this.beast = b;
    const tell: Record<BeastId, string> = {
      kraken: 'The sea goes black around the hull, and something vast moves beneath it…',
      crab: 'Sand boils up through the shallows. The reef is moving.',
      sirens: 'Fog gathers on the water ahead, and rocks rise out of it.',
      wyrm: 'Something long and winged twists through the storm clouds above you!',
      oldTeeth: 'A fin the size of a door cuts the water, and circles. Old Teeth.',
      leviathan: 'The sea swells ahead as if an island were rising. It is not an island.',
    };
    this.hooks.toast(tell[id]);
    return b;
  }

  /** Which great monster the sea throws at you here, if any. */
  private beastEncounter(ship: Ship, danger: number) {
    if (this.beast || this.serpent) return;
    const depth = SEA_LEVEL - heightAt(ship.pos.x, ship.pos.z);
    const storm = Math.max(SEA.storm, cellStormAt(ship.pos.x, ship.pos.z));
    const hour = this.hooks.hours() % 24;
    const region = regionAt(ship.pos.x, ship.pos.z);
    const roll = Math.random();
    let id: BeastId | null = null;
    if (ship.pos.x > 8500 && danger >= 4.3 && roll < 0.35) id = 'leviathan';
    else if (storm > 0.6 && danger >= 3 && roll < 0.3) id = 'wyrm';
    else if (danger >= 4.1 && depth > 25 && roll < 0.12) id = 'kraken';
    else if ((region === 'shatteredIsles' || danger >= 3.6) && (hour >= 18 || hour < 5) && roll < 0.22) id = 'sirens';
    else if (depth > 3 && depth < 16 && danger >= 1.8 && roll < 0.16) id = 'crab';
    else if (this.perks.oldTeeth && !this.trophies.has('oldTeeth') && danger >= 0.9 && danger <= 2.6 && roll < 0.2) id = 'oldTeeth';
    if (!id) return;
    this.spawnBeast(id);
  }

  private beastCtx(ship: Ship | null): BeastCtx {
    return {
      toast: (m) => this.hooks.toast(m),
      shake: (n) => this.hooks.shake(n),
      crewOverboard: (c) => this.crewOverboard(c),
      crewLost: () => {
        const aboard = this.crew.filter((c) => c.status === 'aboard');
        if (!aboard.length || (this.perks.overboard < 1 && Math.random() < 0.5)) return null;
        const c = aboard[Math.floor(Math.random() * aboard.length)];
        c.status = 'lost';
        this.crew = this.crew.filter((x) => x !== c);
        this.spawnCrewActors();
        return c.name;
      },
      weak: this.perks.weakPoint,
      lore: this.perks.monsterLore,
      earplugs: this.hooks.count('waxEarplugs') > 0,
      monster: ship ? ship.stats.monster : 1,
    };
  }

  /** A great monster beaten: its spoils, a trophy, Seamanship. */
  private beastBeaten(b: SeaBeast) {
    const first = !this.trophies.has(b.id);
    this.trophies.add(b.id);
    const loot: Record<BeastId, { items: [string, number][]; gold: number; xp: number; say: string }> = {
      kraken: { items: [['krakenInk', 4]], gold: 2600, xp: 1600, say: 'The Kraken sinks into the deep, its eye dark. Its ink stains the sea for a mile: you fill four gourds.' },
      crab: { items: [['colossusShell', 3]], gold: 900, xp: 700, say: 'The Crab Colossus is dead. You pry three great plates of shell from its back.' },
      sirens: { items: [['sirenPearl', 3]], gold: 300, xp: 600, say: 'On the silent rocks you find the sirens\' hoard: pearls that hum when you hold them.' },
      wyrm: { items: [['wyrmScale', 3]], gold: 1400, xp: 1200, say: 'The Storm Wyrm falls into the sea, and the storm loses its voice. You cut three scales from its hide.' },
      oldTeeth: { items: first ? [['oldTeethJaw', 1]] : [], gold: 1500, xp: 1300, say: 'Old Teeth, the terror of the coastal shelf, is dead at last. Its jaw will hang in your cabin.' },
      leviathan: { items: first ? [['leviathanBone', 2]] : [['leviathanBone', 1]], gold: 0, xp: first ? 3000 : 800, say: 'The barbs you tore from the Leviathan\'s back float up, pale as moonlight. You haul them aboard.' },
    };
    const l = loot[b.id];
    for (const [id, n] of l.items) this.hooks.give(id, n);
    if (l.gold) this.hooks.addGold(l.gold);
    this.hooks.toast(l.say);
    this.addXp(l.xp, `beat ${BEAST_NAMES[b.id]}`);
    this.stats.monsters++;
    this.hooks.signal?.('beast-' + b.id);
    this.hooks.save();
  }

  // ---- the craft: rogue waves, weather eye, star sights, currents, the trawl --------------------

  private seaCraft(dt: number, ship: Ship, storm: number, eff: ReturnType<typeof crewEffects>) {
    const pk = this.perks;
    // Rogue waves: in a big storm, now and then a wall of water twice the rest.
    if (storm > 0.5 && !ship.sunk) {
      if (this.rogueWarn > 0) {
        this.rogueWarn -= dt;
        if (this.rogueWarn <= 0) {
          const beam = ship.rogue(this.rogueDir, waveHeight(SEA.amp, storm) * 2);
          this.hooks.shake(beam > 0.55 ? 1 : 0.6);
          const right = new THREE.Vector3(-Math.cos(ship.yaw), 0, Math.sin(ship.yaw));
          for (let k = -3; k <= 3; k++) this.fx.alpha.spawn({ pos: ship.pos.clone().addScaledVector(right, k * 3).setY(SEA_LEVEL + 1), vel: new THREE.Vector3(this.rogueDir.x * 4, 9, this.rogueDir.y * 4), spread: 3, count: 14, life: [0.8, 1.6], size: [0.8, 0.3], color: 0xeef6fa, alpha: 0.85, gravity: 9 });
          if (beam <= 0.55) this.hooks.toast('She climbs the rogue wave and slams down its back. Well met!');
          if (beam <= 0.55) this.addXp(20, 'met a rogue wave');
          else this.crewOverboard(0.6);
        }
      } else {
        this.rogueT -= dt;
        if (this.rogueT <= 0) {
          this.rogueT = 60 + Math.random() * 70;
          const big = STORM_WAVES[0];
          const d = new THREE.Vector2(big[0], big[1]).normalize();
          this.rogueDir.copy(d);
          this.rogueWarn = 4 + (pk.waveReader ? 2 : 0);
          // Where it comes from, relative to the bow.
          const rel = Math.atan2(Math.sin(Math.atan2(-d.x, -d.y) - ship.yaw), Math.cos(Math.atan2(-d.x, -d.y) - ship.yaw));
          const where = Math.abs(rel) < 0.5 ? 'dead ahead' : Math.abs(rel) > 2.6 ? 'astern' : `off the ${rel > 0 ? 'port' : 'starboard'} ${Math.abs(rel) < 1.6 ? 'bow' : 'quarter'}`;
          this.hooks.toast(`A rogue wave rears out of the storm, ${where}! Turn your bow into it!`);
        }
      }
    } else this.rogueWarn = 0;
    // Weather Eye: you feel a storm coming long before it arrives.
    if (pk.weatherEye) for (const c of STORMS) {
      if (this.eyeWarned.has(c)) continue;
      const d = Math.hypot(c.x - ship.pos.x, c.z - ship.pos.z);
      if (d < c.r + 1400 && d > c.r) {
        this.eyeWarned.add(c);
        const b = Math.atan2(c.x - ship.pos.x, -(c.z - ship.pos.z));
        const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
        const name = dirs[(Math.round(b / (Math.PI / 4)) + 8) % 8];
        const closing = (c.vx * (ship.pos.x - c.x) + c.vz * (ship.pos.z - c.z)) > 0;
        this.hooks.toast(`Weather Eye: a storm builds to the ${name}, ${closing ? 'drifting your way' : 'drifting off'}.`);
      }
    }
    // A star sight at night: where you are, by the heavens.
    const hour = this.hooks.hours() % 24;
    const day = this.hooks.day();
    if (pk.starReckoning && (hour > 21 || hour < 4.5) && this.starDay !== day && this.atHelm) {
      this.starDay = day;
      const km = (Math.hypot(ship.pos.x - PORTS[0].zone.x, ship.pos.z - PORTS[0].zone.z) / 1000).toFixed(1);
      this.hooks.toast(`A star sight: ${km} km from Port Aurelle, and true to your reckoning.`);
      this.addXp(15);
    }
    // Currents: the first time you ride one, it's yours.
    if (ship.currentId && !this.knownCurrents.has(ship.currentId)) {
      this.knownCurrents.add(ship.currentId);
      const c = CURRENTS.find((x) => x.id === ship.currentId);
      this.hooks.toast(`You've found ${c?.name ?? 'a current'}: the sea itself carries you here.`);
      this.addXp(30, 'found a current');
    }
    if (ship.currentSpeed > 0.4 && Math.random() < dt * (pk.currentLore ? 6 : 2)) {
      // Streaks on the water where it runs.
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 40;
      this.fx.alpha.spawn({ pos: new THREE.Vector3(ship.pos.x + Math.cos(a) * r, SEA_LEVEL + 0.15, ship.pos.z + Math.sin(a) * r), spread: 1.5, count: pk.currentLore ? 6 : 3, life: [1.2, 2.2], size: [0.5, 0.2], color: 0xeaf6fa, alpha: 0.5, gravity: 0 });
    }
    // The trawl: sail slow with the net out and the sea fills it.
    if (pk.trawl && ship.hull !== 'skiff' && ship.sailSet > 0.2 && Math.abs(ship.speed) > 0.6 && Math.abs(ship.speed) < 4.5) {
      this.trawlT += dt * (pk.baitLore ? 1.4 : 1) * this.shoalBoost(ship);
      if (this.trawlT > 45) {
        this.trawlT = 0;
        const pool = FISH.filter((f) => f.water.includes('sea') && !f.bigGame && (f.rarity > 0 || (pk.deepTables && f.deep && dangerAt(ship.pos.x, ship.pos.z) > 1.5)));
        const w = pool.map((f) => (f.deep ? 1.2 : f.rarity));
        let r = Math.random() * w.reduce((a, b) => a + b, 0);
        const fish = pool.find((_, i) => (r -= w[i]) <= 0) ?? pool[0];
        this.hooks.give(fish.id, 1);
        this.hooks.toast(`The trawl comes up heavy: a ${fish.name}.`);
        this.addXp(4);
      }
    }
    void eff;
    void BASE_WAVES;
    void windAt;
  }

  /** A shoal under the keel fills the trawl three times as fast (sea events add shoals). */
  shoalBoost(ship: Ship) {
    void ship;
    return 1;
  }

  // ---- the HUD (every rendered frame) --------------------------------------------------------

  frame(dt: number) {
    const ship = this.current;
    this.hud.setBreath(this.player.breath, this.player.underwater);
    if (!ship) return this.hud.hide();
    const eff = crewEffects(this.crew, ship.thrown);
    const w = { dir: SEA.windDir };
    const windYaw = Math.atan2(w.dir.x, w.dir.y);
    const lvl = seamanshipLevel(this.xp);
    this.hud.update(dt, {
      name: ship.name, hull: ship.def.name, danger: dangerAt(ship.pos.x, ship.pos.z), dangerName: DANGER_NAMES[Math.min(5, Math.round(dangerAt(ship.pos.x, ship.pos.z)))],
      heading: ship.yaw, windRel: windYaw - ship.yaw, windSpeed: ship.windSpeed, knots: Math.abs(ship.speed) * 1.94, point: POINT_NAMES(ship.offWind), trim: ship.trim, assisted: this.assisted,
      sail: ship.sailSet, reefed: ship.reefed, anchored: ship.anchored, sections: ship.sections.map((h) => h / ship.stats.hull), sails: ship.sailHp / ship.stats.sails, water: ship.water,
      waves: waveHeight(SEA.amp, Math.max(SEA.storm, cellStormAt(ship.pos.x, ship.pos.z))), rated: ship.stats.seaworthy * (1 + this.skill * 0.35), storm: Math.max(SEA.storm, cellStormAt(ship.pos.x, ship.pos.z)),
      guns: ship.stats.guns, reload: [this.reload[-1], this.reload[1]], harpoon: ship.stats.harpoon > 0, crew: eff.hands, crewMin: ship.def.crewMin, morale: eff.morale,
      courseError: ship.kick, atHelm: this.atHelm, level: lvl.level, xpFrac: lvl.frac,
      notes: this.helmNotes(ship), skiff: ship.hull === 'skiff' || ship.hull === 'sloop',
      extraKeys: [this.shotKinds().length > 1 && ship.fit.guns > 1 ? 'T change shot' : '', this.perks.windcaller ? `Y call the wind${this.windCd > 0 ? ` (${Math.ceil(this.windCd / 60)}m)` : ''}` : '', this.perks.fullPress ? `U full press${this.pressCd > 0 ? ` (${Math.ceil(this.pressCd)}s)` : ''}` : ''].filter(Boolean).join(' · '),
    });
  }

  /** The helm's extra lines: what the Navigator and Helmsman know, and what's happening. */
  private helmNotes(ship: Ship) {
    const out: string[] = [];
    const pk = this.perks;
    const deg = (a: number) => Math.round(((a * 180) / Math.PI + 360) % 360);
    // Bearing on the map: 0 is north (-z), 90 east (+x).
    const bearing = (dx: number, dz: number) => deg(Math.atan2(dx, -dz));
    if (pk.compass) {
      out.push(`Heading ${bearing(Math.sin(ship.yaw), Math.cos(ship.yaw))}°`);
      const wp = this.hooks.waypoint?.();
      if (wp) {
        const d = Math.hypot(wp.x - ship.pos.x, wp.z - ship.pos.z);
        out.push(`Pin bears ${bearing(wp.x - ship.pos.x, wp.z - ship.pos.z)}°, ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`);
      }
    }
    const storm = Math.max(SEA.storm, cellStormAt(ship.pos.x, ship.pos.z));
    if (pk.waveReader && ship.thrown > 0.1) {
      // Meet the seas on the bow quarter: 30-45 degrees off where they come from.
      const big = storm > 0.3 ? STORM_WAVES[0] : BASE_WAVES[0];
      const from = Math.atan2(-big[0], -big[1]);
      const rel = Math.atan2(Math.sin(from - ship.yaw), Math.cos(from - ship.yaw));
      const off = Math.abs(rel) * (180 / Math.PI);
      out.push(off >= 25 && off <= 50 ? 'Seas on the bow quarter: well met.' : off < 25 ? 'Seas dead ahead: bear off a little.' : `Seas ${off > 120 ? 'astern' : 'abeam'}: turn ${rel > 0 ? 'left (A)' : 'right (D)'} to meet them.`);
    }
    if (ship.surge > 0.1) out.push(`Surfing +${Math.round(ship.surge * 100)}%`);
    if (ship.currentSpeed > 0.4) out.push(`In ${CURRENTS.find((c) => c.id === ship.currentId)?.name ?? 'a current'} (${(ship.currentSpeed * 1.94).toFixed(1)} kn)`);
    if (this.windT > 0) out.push(`Called wind: ${Math.ceil(this.windT)}s`);
    if (ship.pressT > 0) out.push(`Full press: ${Math.ceil(ship.pressT)}s`);
    if (this.lashed !== null && !this.atHelm) out.push('Helm lashed: holding her course.');
    if (ship.stats.guns && ship.fit.guns > 1) out.push(`Guns loaded with ${SHOT_NAMES[this.shot].toLowerCase()}`);
    if (ship.fit.guns === 1) out.push(`Swivel guns: ${this.swivelT > 0 ? this.swivelT.toFixed(1) + 's' : 'ready'} (aim and click)`);
    const line = this.gunnery.tetheredTo(ship);
    if (line) out.push(`<span class="${line.strain > 0.5 ? 'warn' : ''}">On the line: ${Math.round(line.len)} m${line.strain > 0.5 ? ', straining!' : ''} · hold right click to reel, O to cut</span>`);
    if (ship.mastCap < 1) out.push('<span class="warn">Topmast down: sails limited</span>');
    if (this.consort) out.push(`Consort ${this.consort.name}: hull ${Math.round(this.consort.ship.hullFrac * 100)}%`);
    if (ship.fire > 0) out.push('<span class="warn">FIRE ABOARD!</span>');
    if (this.rogueWarn > 0) out.push('<span class="warn">ROGUE WAVE!</span>');
    return out;
  }

  // ---- port services (dialogue options) -----------------------------------------------------

  /** Dockmaster Mira: boats for hire by the day, and returning them. */
  miraOptions(show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const out: { label: string; run: () => void }[] = [];
    const hire = (hull: HullId) => {
      const d = HULLS[hull];
      const cost = d.rent + d.deposit;
      if (this.hooks.gold() < cost) return show(`${d.rent}g for the day and ${d.deposit}g deposit, love. You're short.`, [{ label: 'Back.', run: back }]);
      this.hooks.addGold(-cost);
      this.rent(hull);
      this.hooks.close();
      this.hooks.toast(`The ${d.name} is yours until 8 tomorrow, at the end of the wharf. Board her (E). Bring her back for your deposit.`);
    };
    if (!this.rental) {
      out.push({ label: `Hire a skiff for the day — ${HULLS.skiff.rent}g (+${HULLS.skiff.deposit}g deposit)`, run: () => hire('skiff') });
      out.push({ label: `Hire the fishing sloop — ${HULLS.sloop.rent}g (+${HULLS.sloop.deposit}g deposit)`, run: () => hire('sloop') });
      if (this.level >= 5) out.push({ label: `Hire a cutter — ${HULLS.cutter.rent}g (+${HULLS.cutter.deposit}g deposit)`, run: () => hire('cutter') });
    } else {
      out.push({ label: 'About my hired boat…', run: () => show(`Due back by 8 on day ${Math.floor(this.rental!.until / 24)}. Sail her into the harbour and dock (E) and I'll give you your deposit back.`, [{ label: 'Right.', run: back }]) });
    }
    out.push({ label: 'Sailing lessons', run: () => show('W and S set and take in the sail. A and D steer. You can\'t sail straight into the wind: zig-zag across it. Fastest with the wind on your beam. Reef (R) when it blows hard, and meet big waves on the bow quarter, never side-on. The further out you go the rougher it gets: past the harbour mouth you\'re in Coastal Waters, then the Open Sea, and beyond that, well. Upgrade your boat or learn your trade before you go far.', [{ label: 'Thanks, Mira.', run: back }]) });
    return out;
  }

  /** Old Maud Reeve at the Crown Quay: a skiff for the capital's river. */
  ferryOptions(show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    if (this.rental) return [];
    const d = HULLS.skiff;
    return [{
      label: `Hire a skiff for the river \u2014 ${d.rent}g (+${d.deposit}g deposit)`,
      run: () => {
        if (this.hooks.gold() < d.rent + d.deposit) return show('Coin first, dearie.', [{ label: 'Back.', run: back }]);
        this.hooks.addGold(-(d.rent + d.deposit));
        this.rent('skiff', 'crownQuay');
        this.hooks.close();
        this.hooks.toast('The skiff is tied up off the quay. Board her (E). The river runs south to the sea.');
      },
    }];
  }

  /** The Aurelle Shipwrights: hulls, upgrades, repairs, paint. */
  shipwrightOptions(show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const here = this.ownedShips().filter(({ ship }) => ship && !ship.sunk && this.portAt(ship.pos)?.id === 'portAurelle');
    const out: { label: string; run: () => void }[] = [];
    out.push({
      label: 'Buy a ship',
      run: () => show(`Every hull here was laid on my slipway. Seamanship ${this.level} lets you command up to a ${HULLS[[...HULL_ORDER].reverse().find((h) => HULLS[h].level <= this.level) ?? 'skiff'].name}.`, [
        ...HULL_ORDER.map((h) => {
          const d = HULLS[h];
          const ok = this.level >= d.level;
          return {
            label: `${d.name} — ${d.price}g${ok ? '' : ` (Seamanship ${d.level})`} · ${d.desc}`,
            run: () => {
              if (!ok) return show(`You'd drown her and yourself. Come back at Seamanship ${d.level}.`, [{ label: 'Back.', run: back }]);
              if (this.records.length >= 4) return show('Four ships is a fleet. Sell one first (the harbourmaster handles that).', [{ label: 'Back.', run: back }]);
              if (this.hooks.gold() < d.price) return show(`${d.price} gold. Not a copper less: oak doesn't grow on trees. Well, it does, but slowly.`, [{ label: 'Back.', run: back }]);
              show('What colours will she wear?', HULL_COLOURS.map(([name], i) => ({
                label: name,
                run: () => {
                  this.hooks.addGold(-d.price);
                  const r = this.buy(h, i);
                  this.hooks.close();
                  this.hooks.toast(`The ${r.name} is yours! She's at a berth off the quay. Walk out along the pier and board her (E).`);
                  this.hooks.save();
                },
              })));
            },
          };
        }),
        { label: 'Not today.', run: back },
      ]),
    });
    if (here.length) {
      out.push({
        label: 'Upgrade a ship',
        run: () => show('Which ship?', [...here.map(({ r, ship }) => ({ label: `${r.name} (${HULLS[r.hull].name})`, run: () => this.upgradeMenu(r, ship!, show, back) })), { label: 'Back.', run: back }]),
      });
      out.push({
        label: 'Repair',
        run: () => {
          const jobs = here.map(({ r, ship }) => {
            const s = ship!;
            const dmg = 1 - (s.hullFrac * 3 + s.sailHp / s.stats.sails) / 4;
            const cost = Math.round(dmg * HULLS[r.hull].price * 0.2 + s.water * 30 + (s.mastCap < 1 ? HULLS[r.hull].price * 0.05 : 0));
            return { r, s, cost };
          }).filter((j) => j.cost > 0);
          if (!jobs.length) return show('Not a plank out of place. Off you go.', [{ label: 'Back.', run: back }]);
          show('My carpenters can have her right by the evening tide.', [...jobs.map((j) => ({
            label: `${j.r.name} — ${j.cost}g`,
            run: () => {
              if (this.hooks.gold() < j.cost) return show('Gold first, then nails.', [{ label: 'Back.', run: back }]);
              this.hooks.addGold(-j.cost);
              j.s.repairAll();
              j.s.mastCap = 1;
              j.s.fire = 0;
              this.syncRecord(j.s);
              this.hooks.close();
              this.hooks.toast(`The ${j.r.name} is sound again.`);
              this.hooks.save();
            },
          })), { label: 'Back.', run: back }]);
        },
      });
    }
    return out;
  }

  private upgradeMenu(r: ShipRecord, ship: Ship, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const hullIdx = HULL_ORDER.indexOf(r.hull);
    const lines = SLOTS.map((slot) => `${UPGRADES[slot].label}: ${UPGRADES[slot].tiers[r.fit[slot]].name}`).join(' · ');
    show(`The ${r.name}. ${lines}`, [
      ...SLOTS.map((slot) => {
        const next = UPGRADES[slot].tiers[r.fit[slot] + 1];
        if (!next) return null;
        const fits = (next.minHull ?? 0) <= hullIdx && !(slot === 'guns' && HULLS[r.hull].guns === 0) && !(slot === 'harpoon' && HULLS[r.hull].harpoons === 0);
        return {
          label: `${UPGRADES[slot].label}: ${next.name} — ${next.price}g${next.needs ? ` + ${next.needs[1]} ${needName(next.needs[0])}` : ''}${fits ? '' : ' (needs a bigger hull)'}`,
          run: () => {
            if (!fits) return show('She hasn\'t the frame for it. A bigger hull would.', [{ label: 'Back.', run: back }]);
            if (this.hooks.gold() < next.price) return show(`${next.price} gold for ${next.name}.`, [{ label: 'Back.', run: back }]);
            if (next.needs && this.hooks.count(next.needs[0]) < next.needs[1]) return show(`I need ${next.needs[1]} ${needName(next.needs[0])} for that. Bring them and I'll fit it.`, [{ label: 'Back.', run: back }]);
            this.hooks.addGold(-next.price);
            if (next.needs) this.hooks.take(next.needs[0], next.needs[1]);
            r.fit = { ...r.fit, [slot]: r.fit[slot] + 1 } as Fit;
            ship.refit(r.fit);
            this.syncRecord(ship);
            this.hooks.toast(`${next.name} fitted to the ${r.name}. ${next.desc}`);
            this.hooks.save();
            this.upgradeMenu(r, ship, show, back);
          },
        };
      }).filter((x): x is { label: string; run: () => void } => !!x),
      { label: 'Done.', run: back },
    ]);
  }

  /** A harbourmaster (any port): contracts, your ships, fetching one here, selling one, consorts. */
  harbourOptions(show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void, portId = 'portAurelle') {
    const out: { label: string; run: () => void }[] = [];
    const port = PORTS.find((p) => p.id === portId) ?? PORTS[0];
    // The Maritime Guild's board, and anything due here.
    for (const c of this.contracts.filter((c) => c.to === portId)) {
      out.push({ label: `Deliver: ${this.contractLabel(c)}`, run: () => this.deliver(c, show, back) });
    }
    out.push({ label: 'The Maritime Guild\'s contracts', run: () => this.contractsMenu(portId, show, back) });
    if (portId === 'portAurelle' && this.perks.fleetSignal && !this.consortHired && !this.consort) {
      out.push({
        label: 'Hire a consort ship for your next voyage — 450g',
        run: () => {
          if (this.hooks.gold() < 450) return show('The Steadfast\'s captain wants his fee first.', [{ label: 'Back.', run: back }]);
          this.hooks.addGold(-450);
          this.consortHired = true;
          this.hooks.close();
          this.hooks.toast('The brigantine Steadfast will sail with you on your next voyage.');
        },
      });
    }
    if (!this.records.length) return out;
    out.push({
      label: 'My ships',
      run: () => show(this.records.map((r) => {
        const sh = this.ships.get(r.id);
        const at = PORTS.find((p) => p.id === r.port);
        const where = at ? at.name : `at anchor ${(Math.hypot((sh?.pos.x ?? r.x) - port.zone.x, (sh?.pos.z ?? r.z) - port.zone.z) / 1000).toFixed(1)} km from here`;
        const h = r.cargo ? Object.values(r.cargo).reduce((x, y) => x + y, 0) : 0;
        return `${r.name} (${HULLS[r.hull].name}): ${where}, hull ${Math.round((sh?.hullFrac ?? 1) * 100)}%${h ? `, ${h} cargo aboard` : ''}`;
      }).join('. '), [{ label: 'Back.', run: back }]),
    });
    for (const r of this.records.filter((r) => r.port !== portId)) {
      const sh = this.ships.get(r.id);
      if (!sh || sh === this.current) continue;
      const fee = Math.round(40 + Math.hypot(sh.pos.x - port.zone.x, sh.pos.z - port.zone.z) / 25);
      out.push({
        label: `Send a crew to sail the ${r.name} here — ${fee}g`,
        run: () => {
          if (this.hooks.gold() < fee) return show('They won\'t row out for less.', [{ label: 'Back.', run: back }]);
          this.hooks.addGold(-fee);
          const [x, z, yaw] = this.freeBerth(port);
          sh.pos.set(x, 0, z);
          sh.yaw = yaw;
          sh.place();
          sh.place();
          r.port = port.id;
          this.syncRecord(sh);
          this.hooks.close();
          this.hooks.toast(`The ${r.name} is berthed at ${port.name}.`);
        },
      });
    }
    for (const r of this.records) {
      const sh = this.ships.get(r.id);
      if (!sh || sh === this.current) continue;
      const value = Math.round(HULLS[r.hull].price * 0.55 * sh.hullFrac);
      out.push({
        label: `Sell the ${r.name} — ${value}g`,
        run: () => show(`Sell the ${r.name} for ${value}g? She won't come back.`, [
          { label: 'Sell her.', run: () => { this.hooks.addGold(value); sh.dispose(); this.ships.delete(r.id); this.records = this.records.filter((x) => x !== r); this.hooks.close(); this.hooks.save(); } },
          { label: 'No.', run: back },
        ]),
      });
    }
    return out;
  }

  /** Rigby, who finds crews: today's sailors, a crew for one voyage, your own crew. */
  brokerOptions(show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const day = this.hooks.day();
    const hiredIds = new Set(this.crew.map((c) => c.id));
    const pool = [...HARBOUR_SAILORS, ...candidates(day, 6)].filter((c) => !hiredIds.has(c.id));
    return [
      {
        label: 'Who\'s looking for a berth?',
        run: () => show('Here\'s who I can vouch for. The ones on the quay and in the Anchor you can meet yourself.', [
          ...pool.slice(0, 10).map((c) => ({ label: `${c.name}: ${ROLE_INFO[c.role].name} ${c.level} — ${c.wage}g a day${c.traits.length ? ' · ' + c.traits.map((t) => TRAIT_INFO[t].split(':')[0]).join(', ') : ''}`, run: () => this.signOn(c, show, back) })),
          { label: 'Back.', run: back },
        ]),
      },
      {
        label: 'Ship\'s stores',
        run: () => show('Odds and ends a captain shouldn\'t sail without.', [
          ...([['waxEarplugs', 'Wax earplugs for the crew (the sirens) — 15g', 15], ['waterBreathingDraught', 'A Draught of Gills (breathe underwater) — 60g', 60]] as [string, string, number][]).map(([id, label, cost]) => ({
            label,
            run: () => {
              if (this.hooks.gold() < cost) return show('Coin first, Captain.', [{ label: 'Back.', run: back }]);
              this.hooks.addGold(-cost);
              this.hooks.give(id, 1);
              this.hooks.toast(label.split(' — ')[0] + ': stowed.');
            },
          })),
          { label: 'Back.', run: back },
        ]),
      },
      {
        label: 'Hire a crew for one voyage',
        run: () => show('Deckhands for a single voyage, paid up front. They go home when you dock.', [
          ...([[2, 25], [4, 55], [8, 120]] as [number, number][]).map(([n, fee]) => ({
            label: `${n} hands — ${fee}g`,
            run: () => {
              if (this.hooks.gold() < fee) return show('Up front, I said.', [{ label: 'Back.', run: back }]);
              this.hooks.addGold(-fee);
              this.crew.push(...dayCrew(n, day).map((c) => ({ ...c, status: 'ashore' as const })));
              this.hooks.close();
              this.hooks.toast(`${n} hands will come aboard with you on your next voyage.`);
            },
          })),
          { label: 'Back.', run: back },
        ]),
      },
      {
        label: 'My crew',
        run: () => {
          if (!this.crew.length) return show('You haven\'t got one, captain.', [{ label: 'Back.', run: back }]);
          show(this.crew.map((c) => `${c.name}, ${ROLE_INFO[c.role].name} ${c.level} (morale ${Math.round(c.morale * 100)}%${c.hire === 'voyage' ? ', this voyage only' : `, ${c.wage}g/day`})`).join('. '), [
            ...this.crew.filter((c) => c.hire === 'permanent').map((c) => ({ label: `Let ${c.name} go`, run: () => { this.crew = this.crew.filter((x) => x !== c); this.hooks.toast(`${c.name} shoulders their sea-bag and goes.`); back(); } })),
            { label: 'Back.', run: back },
          ]);
        },
      },
    ];
  }

  /** Talk to a sailor in the harbour: they'll sign on if you pay. */
  sailorOptions(id: string, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    const c = HARBOUR_SAILORS.find((x) => x.id === id);
    if (!c || this.crew.some((x) => x.id === id)) return [];
    return [{ label: `Sign on as my ${ROLE_INFO[c.role].name.toLowerCase()} — ${c.wage}g a day`, run: () => this.signOn(c, show, back) }];
  }

  private signOn(c: CrewMember, show: (t: string, o: { label: string; run: () => void }[]) => void, back: () => void) {
    if (!this.records.length && !this.rental) return show('Sign on to what, a rowing boat? Come back when you\'ve a ship.', [{ label: 'Fair.', run: back }]);
    const room = Math.max(...this.records.map((r) => HULLS[r.hull].crewMax), this.rental ? HULLS[this.rental.hull].crewMax : 0);
    if (this.crew.filter((x) => x.hire === 'permanent').length >= Math.max(room, 2) + this.perks.berths) return show('Your ship\'s full up. Bigger hull, bigger crew.', [{ label: 'Back.', run: back }]);
    this.crew.push({ ...c, status: 'ashore', morale: 0.75 });
    this.hooks.close();
    this.hooks.toast(`${c.name} signs on as your ${ROLE_INFO[c.role].name.toLowerCase()} (${c.wage}g a day): ${ROLE_INFO[c.role].does}.`);
    this.hooks.save();
  }

  // ---- saving ----------------------------------------------------------------------------------

  private syncRecord(ship: Ship) {
    const rec = this.records.find((r) => this.ships.get(r.id) === ship);
    if (rec) {
      rec.x = ship.pos.x;
      rec.z = ship.pos.z;
      rec.yaw = ship.yaw;
      rec.sections = [...ship.sections];
      rec.sails = ship.sailHp;
      rec.water = ship.water;
      rec.fit = ship.fit;
      if (!this.portAt(ship.pos)) rec.port = null;
    }
    if (ship.owner === 'rental' && this.rental) {
      Object.assign(this.rental, { x: ship.pos.x, z: ship.pos.z, yaw: ship.yaw, sections: [...ship.sections], water: ship.water });
    }
  }

  toJSON(): SailingSave {
    for (const s of this.ships.values()) this.syncRecord(s);
    return { ships: this.records, rental: this.rental, crew: this.crew, xp: Math.round(this.xp), mode: this.mode, wrecks: this.wrecks, stats: this.stats, paidDay: this.paidDay, picks: this.picks, currents: [...this.knownCurrents], trophies: [...this.trophies], supply: this.supply, contracts: this.contracts, landfalls: [...this.landfalls], lit: [...this.lit] };
  }

  fromJSON(d: SailingSave | undefined) {
    for (const s of this.ships.values()) s.dispose();
    this.ships.clear();
    this.current = null;
    this.atHelm = false;
    if (!d) return;
    this.records = d.ships ?? [];
    this.crew = (d.crew ?? []).filter((c) => c.hire === 'permanent').map((c) => ({ ...c, status: c.status === 'lost' ? 'lost' : 'ashore' }));
    this.xp = d.xp ?? 0;
    this.mode = d.mode ?? 'assisted';
    this.wrecks = d.wrecks ?? [];
    this.stats = d.stats ?? this.stats;
    this.paidDay = d.paidDay ?? -1;
    this.picks = { ...(d.picks ?? {}) };
    this.perkCache = seaPerks(this.picks);
    this.knownCurrents = new Set(d.currents ?? []);
    this.trophies = new Set(d.trophies ?? []);
    this.supply = d.supply ?? {};
    this.contracts = d.contracts ?? [];
    this.landfalls = new Set(d.landfalls ?? []);
    this.lit = new Set(d.lit ?? []);
    for (const id of this.lit) this.lightUp(id);
    for (const r of this.records) this.spawn(r);
    for (const w of this.wrecks) this.showWreck(w);
    if (d.rental) {
      this.rental = d.rental;
      const ship = this.spawn({ id: 'rental', hull: d.rental.hull, name: 'Hired Boat', fit: STOCK_FIT(), hullColor: 0x6a4a2a, trim: 0x2f7f86, sections: d.rental.sections, sails: HULLS[d.rental.hull].sails, water: d.rental.water, x: d.rental.x, z: d.rental.z, yaw: d.rental.yaw, port: d.rental.port, cargo: d.rental.cargo });
      ship.owner = 'rental';
    }
  }

  /** Everything off the water (tests). */
  reset() {
    this.fromJSON(undefined);
    this.records = [];
    this.rental = null;
    this.crew = [];
    this.xp = 0;
    this.mode = 'assisted';
    this.picks = {};
    this.perkCache = seaPerks({});
    this.knownCurrents.clear();
    this.lashed = null;
    if (this.spyglass) { this.spyglass = false; this.cam.fovBase = this.fovWas; }
    this.player.vehicle = null;
    this.cam.extra = 0;
    for (const p of this.pirates) p.dispose();
    this.pirates = [];
    this.boarding = null;
    this.plunderBy = null;
    this.consort?.dispose();
    this.consort = null;
    this.consortHired = false;
    this.beast?.dispose();
    this.beast = null;
    this.trophies.clear();
    this.supply = {};
    this.contracts = [];
    this.landfalls.clear();
    this.customs?.dispose();
    this.customs = null;
    for (const id of [...this.lit]) this.lightUp(id, false);
    this.lit.clear();
    this.story.clear();
    this.shot = 'ball';
    this.serpent?.dispose();
    this.serpent = null;
    for (const s of this.sharks) s.dispose();
    this.sharks = [];
    for (const l of this.loot) this.scene.remove(l.mesh);
    this.loot = [];
    this.gunnery.clear();
    this.clearCrewActors();
    this.hud.hide();
  }
}

// ---- harbour folk -------------------------------------------------------------------------------

/** The shipwright, the crew broker and the sailors to be met around the harbour. */
export function harbourFolk(v: (x: number, z: number) => THREE.Vector3): { records: NpcRecord[]; places: Place[] } {
  const places: Place[] = [];
  const records: NpcRecord[] = [];
  const post = (id: string, x: number, z: number, yaw?: number) => {
    places.push({ id: 'post:' + id, spots: [v(x, z)], yaw });
    return 'post:' + id;
  };
  const named = (id: string, name: string, title: string, look: Look, at: [number, number], hours: [number, number], lines: NpcRecord['lines'], activity: ScheduleEntry['activity'] = 'idle') => {
    const p = post(id, at[0], at[1]);
    records.push({ id, name, title, job: id, settlement: 'portAurelle', look, named: true, lines, schedule: [{ from: 0, activity: 'sleep', place: 'homes' }, { from: hours[0], activity, place: p }, { from: hours[1], activity: 'drink', place: 'tavern' }, { from: Math.min(23.8, hours[1] + 2), activity: 'sleep', place: 'homes' }] });
  };
  named('shipwright', 'Master Hale Barrow', 'Aurelle Shipwrights · Hulls, Upgrades, Repairs', { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x6a4a2a, bracers: true, height: 1.84 }, [QUAY_X - 6, 62], [6, 20],
    { any: ['Every hull is a promise to the sea. I make good promises.', 'Serpent scales make the finest plating there is. Bring me some and I\'ll show you.'] }, 'work');
  named('rigby', 'Sal Rigby', 'Crew Broker · The Salty Anchor', { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x8a3f22, skin: 0xa8744e, linen: 0xe8c8c0, cloth: 0x2f4a6a, height: 1.68 }, [2776, 262], [9, 23],
    { any: ['Need hands? I know every sailor in this port, and which ones you can trust with a rope.', 'A crew that\'s paid is a crew that stays.'] }, 'talk');
  HARBOUR_SAILORS.forEach((c, i) => {
    const at: [number, number] = c.haunt === 'tavern' ? [2780 + (i % 3) * 3, 266 + (i % 2) * 2] : c.haunt === 'wharf' ? [2916 + i * 2, 308] : [QUAY_X - 3, 120 + i * 14];
    named(c.id, c.name, `${ROLE_INFO[c.role].name} · looking for a berth (level ${c.level})`, c.look, at, [7, 21],
      { any: [`${ROLE_INFO[c.role].does}. That's me. ${c.wage} gold a day and I'm yours.`, c.traits.length ? TRAIT_INFO[c.traits[0]].split(':')[0] + ', they call me. Fair enough.' : 'Know any captains hiring?'] }, c.haunt === 'tavern' ? 'drink' : 'idle');
  });
  return { records, places };
}
