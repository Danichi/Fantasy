import * as THREE from 'three';
import { events } from '../core/events';
import { peekCombat } from './core';
import { ATTACK_CUE } from './readability';
import type { Player } from '../player/player';
import type { Target } from './targets';

/** Optional practice geometry uses the enemy's actual current strike envelope. */
export class CombatTelegraphs {
  enabled = false;
  private rows = new Map<Target, THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>();
  constructor(
    private scene: THREE.Scene,
    private player: Player,
  ) {
    events.on('telegraph', ({ target }) => {
      if (target.center.distanceTo(player.center) > 32 || this.rows.has(target)) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(70 * 3), 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.4 }));
      line.frustumCulled = false;
      line.renderOrder = 2;
      line.visible = false;
      this.rows.set(target, line);
      scene.add(line);
    });
  }
  update() {
    for (const [target, line] of this.rows) {
      const read = peekCombat(target)?.read;
      if (!read || !target.alive) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        this.rows.delete(target);
        continue;
      }
      line.visible = this.enabled && read.managed && read.range > 0 && target.center.distanceTo(this.player.center) < 28;
      if (!line.visible) continue;
      line.position.copy(target.position).y += 0.035;
      line.rotation.y = read.yaw;
      line.material.color.setHex(read.phase === 'recovery' ? 0x93d9b2 : ATTACK_CUE[read.kind].color);
      line.material.opacity = read.phase === 'active' ? 0.95 : read.phase === 'commit' ? 0.8 : read.phase === 'recovery' ? 0.18 : 0.32;
      const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      let count = 0;
      const point = (x: number, z: number) => positions.setXYZ(count++, x, 0, z);
      if (read.shape === 'line') {
        point(0, 0.6);
        point(0, read.range);
        point(-0.18, read.range - 0.5);
        point(0, read.range);
        point(0.18, read.range - 0.5);
      } else {
        const angle = read.shape === 'circle' ? Math.PI : Math.acos(THREE.MathUtils.clamp(read.arc, -1, 1));
        if (read.shape !== 'circle') point(0, 0);
        for (let i = 0; i <= 64; i++) {
          const a = -angle + (2 * angle * i) / 64;
          point(Math.sin(a) * read.range, Math.cos(a) * read.range);
        }
        if (read.shape !== 'circle') point(0, 0);
      }
      positions.needsUpdate = true;
      line.geometry.setDrawRange(0, count);
    }
  }
}
