import * as THREE from 'three';
import type { Sailing } from '../sea/sailing';
import type { Player } from '../../player/player';

// The Iron Kettle (docs/design/mountains.md §3): Bruni's sail-and-boiler
// brigantine runs between Port Aurelle and Kettle Cove. The voyage is sailed,
// not skipped: you're aboard while Captain Hamm Copperbeard's crew sails her
// (take the wheel if you like; let go and they carry on), north-east up the
// coast on the boiler, through a squall, past the serpent's water (or a pirate
// cutter, if the serpent is already dead), until the white peaks come up over
// the bow. About six minutes; resting below decks skips to landfall.

/** The course north: out of Port Aurelle, round the headland, into the bay under the mountains. */
export const KETTLE_NORTH: [number, number][] = [
  [2990, 156], [3200, 120], [3700, -300], [5000, -1300], [6150, -1800], [6850, -2600], [6650, -3300], [6000, -3900], [5200, -4150], [4482, -4075],
];
/** Where she berths at each end. */
const AURELLE: [number, number, number] = [2968, 156, Math.PI / 2];
const COVE: [number, number, number] = [4482, -4068, Math.PI];
/** Where you step ashore. */
const COVE_LANDING = new THREE.Vector3(4480, 0, -3990);
const AURELLE_LANDING = new THREE.Vector3(2930, 0, 150);
/** metres a second on the boiler */
const CRUISE = 22;

export interface KettleHooks {
  sailing: Sailing;
  player: Player;
  flags: Record<string, boolean | number | string>;
  toast(m: string): void;
  card(title: string, sub: string): void;
  /** force (or release) a storm overhead */
  storm(on: boolean): void;
  signal(id: string): void;
  save(): void;
  shake(n: number): void;
  ground(x: number, z: number): number;
}

export class IronKettle {
  private dir: 'north' | 'south' | null = null;
  private beats = new Set<string>();
  constructor(private d: KettleHooks) {}

  get voyaging() {
    return this.dir !== null;
  }

  /** Cast off: north to Kettle Cove, or south home to Port Aurelle. */
  sail(dir: 'north' | 'south') {
    const s = this.d.sailing;
    if (this.dir || s.aboard) return false;
    this.dir = dir;
    this.beats.clear();
    this.d.flags['kettle:voyage'] = dir;
    const pts = dir === 'north' ? KETTLE_NORTH : [...KETTLE_NORTH].reverse().map(([x, z], i, a) => (i === a.length - 1 ? [AURELLE[0], AURELLE[1]] : [x, z]) as [number, number]);
    const from = dir === 'north' ? AURELLE : COVE;
    s.charter('Iron Kettle', 'brigantine', [pts[0][0], pts[0][1], from[2]], pts, CRUISE, () => this.arrive());
    this.d.toast(dir === 'north'
      ? 'Captain Hamm: "Lines off! Stoke her up!" The Iron Kettle shudders, coughs smoke and pulls away from the quay. (Walk the deck, or take the wheel. Rest below decks to skip ahead.)'
      : 'Captain Hamm: "Home to the Port, then. Mind the boom." The Kettle backs off the cove quay under steam.');
    this.d.save();
    return true;
  }

  /** Rest below decks: wake as the destination comes up. */
  rest() {
    if (!this.dir) return;
    this.d.sailing.charterSkip();
    this.beats.add('storm').add('beast').add('peaks');
    this.d.storm(false);
    this.d.toast('You sleep in a hammock that smells of coal and herring. When you come up on deck, land is close.');
  }

  private arrive() {
    const dir = this.dir;
    const s = this.d.sailing;
    this.d.storm(false);
    const landing = (dir === 'north' ? COVE_LANDING : AURELLE_LANDING).clone();
    landing.y = this.d.ground(landing.x, landing.z);
    s.leaveShip(landing);
    s.endCharter();
    this.dir = null;
    delete this.d.flags['kettle:voyage'];
    if (dir === 'north') {
      this.d.flags.kettleLanded = true;
      this.d.card('Kettle Cove', 'The White Mountains');
      this.d.signal('kettle-landed');
    } else this.d.card('Port Aurelle', 'Home from the mountains');
    this.d.save();
  }

  update() {
    const s = this.d.sailing;
    if (!this.dir) return;
    const a = s.autopilot;
    // Sunk, or the charter's gone (left the ship somehow): Hamm gets you there anyway.
    if (!a || a.ship.sunk) {
      if (a?.ship.sunk) this.d.toast('The Kettle limps in on her boiler alone, half full of water. Hamm swears for an hour.');
      const dir = this.dir;
      s.endCharter();
      this.dir = dir;
      this.arrive();
      return;
    }
    const f = s.charterProgress ?? 0;
    const beat = (id: string, at: number, run: () => void) => {
      if (f >= at && !this.beats.has(id)) {
        this.beats.add(id);
        run();
      }
    };
    if (this.dir === 'north') {
      beat('storm', 0.3, () => {
        this.d.storm(true);
        this.d.shake(0.4);
        this.d.toast('Captain Hamm: "Squall coming! Hold on to something that isn\'t me!"');
      });
      beat('calm', 0.5, () => this.d.storm(false));
      beat('beast', 0.6, () => {
        const ship = a.ship;
        const ahead = ship.pos.clone().add(new THREE.Vector3(Math.sin(ship.yaw) * 180 + Math.cos(ship.yaw) * 60, 0, Math.cos(ship.yaw) * 180 - Math.sin(ship.yaw) * 60));
        if (s.stats.monsters > 0) {
          s.spawnPirate(ahead, 0.3);
          this.d.toast('Captain Hamm: "Sail to starboard. Black flag. They\'ve not met a boiler before, I\'d wager. Man the guns if you\'ve a mind!"');
        } else {
          s.spawnSerpent(ahead, 0.25);
          this.d.toast('Captain Hamm: "Serpent! Off the bow! Keep her stoked, lads, she can\'t catch a kettle at the boil!"');
        }
      });
      beat('peaks', 0.82, () => this.d.card('The White Mountains', 'Snow on the peaks, smoke from the cove'));
    }
  }

  /** On load: a voyage that was under way when you saved ends at its destination. */
  restore() {
    const dir = this.d.flags['kettle:voyage'];
    if (dir !== 'north' && dir !== 'south') return;
    this.dir = dir;
    const landing = (dir === 'north' ? COVE_LANDING : AURELLE_LANDING).clone();
    landing.y = this.d.ground(landing.x, landing.z) + 0.4;
    this.d.player.teleport(landing);
    this.dir = null;
    delete this.d.flags['kettle:voyage'];
    if (dir === 'north') {
      this.d.flags.kettleLanded = true;
      this.d.signal('kettle-landed');
    }
  }
}
