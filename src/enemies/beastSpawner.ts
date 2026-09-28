import * as THREE from 'three';
import { Beast, type BeastKind } from './beast';
import { heightAt } from '../world/terrain';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';

interface Spot {
  pos: THREE.Vector2;
  kind: BeastKind;
  beast: Beast | null;
  timer: number;
}

export class BeastSpawner {
  slimes: Beast[] = [];
  private readonly spots: Spot[];
  enabled = true;

  constructor(private readonly scene: THREE.Scene, private readonly fx: FX) {
    const S = (x: number, z: number, kind: BeastKind): Spot => ({
      pos: new THREE.Vector2(x, z),
      kind,
      beast: null,
      timer: Math.random() * 4,
    });

    this.spots = [
      S(-22, 112, 'green'),
      S(18, 118, 'green'),
      S(-35, 140, 'cave'),
      S(30, 150, 'blue'),
      S(-10, 175, 'green'),
      S(40, 190, 'magma'),
      S(-45, 205, 'blue'),
      S(12, 230, 'cave'),
      S(105, 40, 'green'),
      S(115, -30, 'cave'),
      S(100, 70, 'blue'),
    ];
  }

  spawn(kind: BeastKind, x: number, z: number) {
    const beast = new Beast(kind, new THREE.Vector3(x, heightAt(x, z), z), this.scene, this.fx);
    this.slimes.push(beast);
    return beast;
  }

  update(dt: number, player: Player) {
    for (const spot of this.spots) {
      if (!this.enabled) break;

      if (spot.beast && !spot.beast.alive) {
        spot.beast = null;
        spot.timer = 9 + Math.random() * 6;
      }

      if (!spot.beast) {
        spot.timer -= dt;
        const far = player.pos.distanceTo(new THREE.Vector3(spot.pos.x, player.pos.y, spot.pos.y)) > 14;
        if (spot.timer <= 0 && far) {
          spot.beast = this.spawn(spot.kind, spot.pos.x, spot.pos.y);
        }
      }
    }

    for (const beast of this.slimes) {
      if (beast.alive) beast.update(dt, player);
    }

    this.slimes = this.slimes.filter((beast) => !beast.dead);
  }

  clear() {
    for (const beast of this.slimes) {
      beast.alive = false;
      beast.dispose();
    }
    this.slimes = [];
    for (const spot of this.spots) spot.beast = null;
  }
}
