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

    // The wild edges of Elder Glen: wolves in the western woods and across the
    // river, stags on the far meadows, goblins in the hills. Never in the
    // fields, pastures or on the town's doorstep.
    this.spots = [
      S(-215, 60, 'green'),
      S(-240, -30, 'green'),
      S(-205, 150, 'green'),
      S(235, -110, 'green'),
      S(265, 175, 'green'),
      S(-285, 115, 'blue'),
      S(305, 60, 'blue'),
      S(125, -255, 'cave'),
      S(-255, 245, 'cave'),
      S(-330, -205, 'magma'),
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
