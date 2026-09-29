import * as THREE from 'three';
import { Bandit, type Bolts } from '../enemies/bandit';
import type { Look } from '../npc/charBuilder';
import type { Player } from '../player/player';

// Sparring duels (World Expansion phase 5: the Knight's Academy trials and
// the rivalry with Cadet Dorian Vale). The opponent is a real fighter with
// the full sword moveset, but nobody dies: they yield when beaten, and if the
// player is about to fall the instructor calls the bout.

export interface DuelSpec {
  name: string;
  look: Look;
  hp: number;
  /** ring centre and radius: stepping out forfeits */
  ring: THREE.Vector3;
  radius: number;
}

export class Duel {
  opponent: Bandit | null = null;
  active = false;
  private spec: DuelSpec | null = null;
  private floorHp = 0;
  onEnd?: (won: boolean, reason: string) => void;

  constructor(private scene: THREE.Scene, private bolts: Bolts, private player: Player) {}

  start(spec: DuelSpec) {
    this.stop();
    this.spec = spec;
    const at = spec.ring.clone().add(new THREE.Vector3(0, 0, -spec.radius * 0.5));
    const b = new Bandit('sword', at, this.scene, this.bolts, spec.ring.clone(), spec.look);
    b.name = spec.name;
    b.kind = 'duelist';
    b.maxHp = b.hp = spec.hp;
    b.alerted = true;
    b.nonLethal = true;
    this.opponent = b;
    this.active = true;
    this.floorHp = this.player.maxHp * 0.15;
    this.player.damageFloor = this.floorHp * 0.5;
    // Start the player across the ring, facing the opponent.
    const start = spec.ring.clone().add(new THREE.Vector3(0, 0.3, spec.radius * 0.5));
    this.player.teleport(start);
    this.player.yaw = Math.PI;
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
  }

  stop() {
    this.player.damageFloor = 0;
    if (this.opponent && !this.opponent.dead) this.opponent.dispose();
    this.opponent = null;
    this.active = false;
  }

  private end(won: boolean, reason: string) {
    const b = this.opponent;
    this.active = false;
    if (b && !b.dead) {
      // They bow out rather than die: leave them standing briefly, then remove.
      setTimeout(() => b.dispose(), won ? 1500 : 200);
    }
    this.opponent = null;
    this.player.damageFloor = 0;
    this.player.hp = Math.max(this.player.hp, this.player.maxHp * 0.5);
    this.onEnd?.(won, reason);
  }

  update(dt: number) {
    if (!this.active || !this.opponent || !this.spec) return;
    const b = this.opponent;
    // Yield before the killing blow.
    if (b.hp <= b.maxHp * 0.08 || !b.alive) {
      return this.end(true, `${this.spec.name} lowers their blade and yields.`);
    }
    if (this.player.hp <= this.floorHp || this.player.dead) return this.end(false, 'The instructor calls the bout. You are beaten — for now.');
    if (this.player.pos.distanceTo(this.spec.ring) > this.spec.radius + 2) return this.end(false, 'You stepped out of the ring and forfeit the bout.');
    b.update(dt, this.player);
  }
}
