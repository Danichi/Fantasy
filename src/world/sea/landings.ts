import * as THREE from 'three';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import { heightAt } from '../terrainHeight';
import { SEA_LEVEL } from '../worldMap';

/** Visible escape routes from vertical harbour walls. Each ladder has a dry exit. */
export class HarbourLandings {
  readonly points: { water: THREE.Vector3; top: THREE.Vector3 }[] = [];
  constructor(
    private scene: THREE.Scene,
    private player: Player,
    private climb: (top: THREE.Vector3) => void,
  ) {}
  add(top: THREE.Vector3, water: THREE.Vector3): Interactable {
    top = top.clone().setY(heightAt(top.x, top.z) + 0.4);
    water = water.clone().setY(SEA_LEVEL - 0.7);
    this.points.push({ top, water });
    const g = new THREE.Group(),
      wood = new THREE.MeshStandardMaterial({
        color: 0xd4a66b,
        roughness: 0.8,
      });
    const h = Math.max(2, top.y - SEA_LEVEL + 1.8);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, h, 6), wood);
      rail.position.set(side * 0.48, 0, 0);
      g.add(rail);
    }
    for (let y = -h / 2 + 0.2; y < h / 2; y += 0.35) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.98, 6), wood);
      rung.rotation.z = Math.PI / 2;
      rung.position.y = y;
      g.add(rung);
    }
    g.position.copy(water).setY(top.y - h / 2);
    g.rotation.y = Math.atan2(top.x - water.x, top.z - water.z);
    this.scene.add(g);
    return {
      pos: water,
      radius: 3.5,
      label: () => 'Climb the harbour ladder',
      enabled: () => this.player.swimming && this.player.diveDepth < 2,
      action: () => {
        if (!this.player.swimming || this.player.diveDepth >= 2) return;
        this.player.diveDepth = 0;
        this.player.swimming = false;
        this.climb(top);
      },
    };
  }
}
