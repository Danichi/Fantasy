import * as THREE from 'three';
import { Slime, type SlimeKind } from './slime';
import { heightAt } from '../world/terrain';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

// Keeps the Training Grounds stocked with slimes. Dead slimes respawn after a
// delay at a spawn point out of the player's immediate reach.

interface Spot {
  pos: THREE.Vector2;
  kind: SlimeKind;
  slime: Slime | null;
  timer: number;
}

export class SlimeSpawner {
  slimes: Slime[] = [];
  private spots: Spot[];
  enabled = true;

  constructor(private scene: THREE.Scene, private fx: FX) {
    const S = (x: number, z: number, kind: SlimeKind): Spot => ({ pos: new THREE.Vector2(x, z), kind, slime: null, timer: 0 });
    // Meadows outside the south and east gates.
    this.spots = [
      S(-22, 112, 'green'), S(18, 118, 'green'), S(-35, 140, 'green'), S(30, 150, 'blue'),
      S(-10, 175, 'green'), S(40, 190, 'magma'), S(-45, 205, 'blue'), S(12, 230, 'green'),
      S(105, 40, 'green'), S(115, -30, 'green'), S(100, 70, 'blue'),
    ];
  }

  spawn(kind: SlimeKind, x: number, z: number) {
    const s = new Slime(kind, new THREE.Vector3(x, heightAt(x, z) + 0.2, z), this.scene, this.fx);
    this.slimes.push(s);
    return s;
  }

  update(dt: number, player: Player) {
    for (const sp of this.spots) {
      if (!this.enabled) break;
      if (sp.slime && !sp.slime.alive) {
        sp.slime = null;
        sp.timer = 9 + Math.random() * 6;
      }
      if (!sp.slime) {
        sp.timer -= dt;
        const far = player.pos.distanceTo(new THREE.Vector3(sp.pos.x, player.pos.y, sp.pos.y)) > 14;
        if (sp.timer <= 0 && far) sp.slime = this.spawn(sp.kind, sp.pos.x, sp.pos.y);
      }
    }
    for (const s of this.slimes) s.update(dt, player, this.slimes);
    // Remove finished corpses.
    for (const s of this.slimes.filter((s) => s.dead)) s.dispose();
    this.slimes = this.slimes.filter((s) => !s.dead);
  }

  clear() {
    for (const s of this.slimes) {
      s.alive = false;
      s.dispose();
    }
    this.slimes = [];
    for (const sp of this.spots) sp.slime = null;
  }
}
