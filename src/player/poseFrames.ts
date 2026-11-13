import * as THREE from 'three';
import type { Character } from './character';

type Transform = { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 };
const transform = (): Transform => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) });

/** Gameplay owns these poses. Drawing between them never evaluates combat or advances animation. */
export class PoseFrames {
  private rows: { node: THREE.Object3D; before: Transform; now: Transform }[];
  private ready = false;
  private root: THREE.Object3D;
  constructor(char: Character) {
    this.root = char.root;
    this.rows = [...new Set<THREE.Object3D>([char.root, char.visual, ...char.bones.values()])].map((node) => ({
      node,
      before: transform(),
      now: transform(),
    }));
  }
  capture(snap = false) {
    for (const r of this.rows) {
      r.before.p.copy(r.now.p);
      r.before.q.copy(r.now.q);
      r.before.s.copy(r.now.s);
      r.now.p.copy(r.node.position);
      r.now.q.copy(r.node.quaternion);
      r.now.s.copy(r.node.scale);
      if (!this.ready || snap) {
        r.before.p.copy(r.now.p);
        r.before.q.copy(r.now.q);
        r.before.s.copy(r.now.s);
      }
    }
    this.ready = true;
  }
  restore() {
    if (this.ready) this.draw(1);
  }
  draw(alpha: number) {
    if (!this.ready) return;
    const t = THREE.MathUtils.clamp(alpha, 0, 1);
    for (const r of this.rows) {
      r.node.position.lerpVectors(r.before.p, r.now.p, t);
      r.node.quaternion.slerpQuaternions(r.before.q, r.now.q, t);
      // Origin forms own root scale on the gameplay clock.
      if (r.node !== this.root) r.node.scale.lerpVectors(r.before.s, r.now.s, t);
    }
  }
}
