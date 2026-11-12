import * as THREE from 'three';
import type { Style } from '../magic/circles';
import { physics } from '../physics/physics';
import { stillTex, type StillKey } from './vfxSprites';

// Lingering ground marks: a scorch where a fireball landed, a frost patch after
// a shatter, glowing cracks under a slam. Painted textures with real alpha
// (public/assets/fx/decal_*.webp), laid flat on whatever the impact was over
// (a ray down finds the floor, so they work in dungeons and towns too), and
// faded out after a while. A fixed pool keeps the count bounded.

export type DecalKey = 'scorch' | 'frost' | 'cracks' | 'void' | 'holy' | 'storm' | 'bloom';
export const DECAL_KEYS: DecalKey[] = ['scorch', 'frost', 'cracks', 'void', 'holy', 'storm', 'bloom'];

/** Which mark each school leaves (steel sparks leave nothing). */
export const STYLE_DECAL: Partial<Record<Style, DecalKey>> = {
  fire: 'scorch', frost: 'frost', water: 'frost', earth: 'cracks', blood: 'cracks',
  void: 'void', shadow: 'void', light: 'holy', storm: 'storm', gale: 'storm', nature: 'bloom', wind: 'bloom',
};

interface Live {
  mesh: THREE.Mesh;
  t: number;
  life: number;
}

const MAX = 24;
const DOWN = new THREE.Vector3(0, -1, 0);
const GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export class GroundDecals {
  private live: Live[] = [];

  constructor(private scene: THREE.Scene) {}

  /** Leave a mark under `pos` (if there is ground within `reach` below it). */
  add(pos: THREE.Vector3, key: DecalKey, size: number, life = 14, reach = 3) {
    const map = stillTex(`decal_${key}` as StillKey);
    if (!map) return false;
    const from = pos.clone().setY(pos.y + 0.4);
    const d = physics.castRay(from, DOWN, reach + 0.4);
    if (d === null) return false;
    const mat = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // glowing embers and frost read a little brighter than the lit ground around them
      color: new THREE.Color(1.15, 1.15, 1.15),
    });
    const mesh = new THREE.Mesh(GEO, mat);
    mesh.position.copy(from).setY(from.y - d + 0.03);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(size * (0.85 + Math.random() * 0.3));
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({ mesh, t: 0, life });
    // Oldest marks go first when the pool is full.
    while (this.live.length > MAX) this.drop(this.live.shift()!);
    return true;
  }

  private drop(l: Live) {
    this.scene.remove(l.mesh);
    (l.mesh.material as THREE.Material).dispose();
  }

  update(dt: number) {
    for (const l of this.live) {
      l.t += dt;
      const u = l.t / l.life;
      // Burn in fast, hold, then fade over the last third.
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, l.t * 6) * Math.min(1, (1 - u) * 3) * 0.95;
    }
    for (const l of this.live.filter((l) => l.t >= l.life)) this.drop(l);
    this.live = this.live.filter((l) => l.t < l.life);
  }

  /** How many marks are on the ground (tests). */
  get count() {
    return this.live.length;
  }
}
