import * as THREE from 'three';
import { events } from '../core/events';
import type { Target } from './targets';
import type { FX } from '../fx/particles';

// Lingering effects that weapons leave on what they hit: fire that keeps
// burning for a few seconds, and frost that locks a foe up for a moment.

interface Burn {
  t: Target;
  dps: number;
  left: number;
  acc: number;
}

class Afflictions {
  fx: FX | null = null;
  private burns: Burn[] = [];

  /** Set a target alight (a fresh hit refreshes the fire rather than stacking it). */
  burn(t: Target, dps: number, seconds = 3) {
    const b = this.burns.find((x) => x.t === t);
    if (b) {
      b.left = Math.max(b.left, seconds);
      b.dps = Math.max(b.dps, dps);
    } else this.burns.push({ t, dps, left: seconds, acc: 0 });
  }

  /** Freeze: a heavy stagger, a burst of ice and a hiss of cold. */
  freeze(t: Target) {
    if (!t.alive) return;
    t.stunned = true;
    t.takeHit({ damage: 1, poise: 260, dir: new THREE.Vector3(0, 0, 1), at: t.center.clone(), crit: false, source: 'melee' });
    this.fx?.add.spawn({ pos: t.center.clone(), spread: 2.2, count: 26, life: [0.4, 0.9], size: [0.12, 0.02], color: 0xe8f6ff, color2: 0x5fb4ff, gravity: 2, jitter: 0.6 });
    events.emit('enemyHit', { at: t.center.clone(), amount: 0, crit: false, enemyId: t.id });
  }

  update(dt: number) {
    for (const b of this.burns) {
      b.left -= dt;
      b.acc += dt;
      if (!b.t.alive) continue;
      if (Math.random() < dt * 22) {
        const at = b.t.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.4) * 0.9, (Math.random() - 0.5) * 0.6));
        this.fx?.add.spawn({ pos: at, vel: new THREE.Vector3(0, 1.4, 0), spread: 0.4, count: 1, life: [0.25, 0.5], size: [0.16, 0.03], color: 0xffc060, color2: 0xff3000 });
      }
      // Ticks every half second; the killing tick still counts as a hit.
      while (b.acc >= 0.5) {
        b.acc -= 0.5;
        const d = Math.max(1, Math.round(b.dps * 0.5));
        if (b.t.hp - d > 0) b.t.hp -= d;
        else b.t.takeHit({ damage: d, poise: 0, dir: new THREE.Vector3(0, 0, 1), at: b.t.center.clone(), crit: false, source: 'spell' });
        events.emit('enemyHit', { at: b.t.center.clone(), amount: d, crit: false, enemyId: b.t.id });
      }
    }
    this.burns = this.burns.filter((b) => b.left > 0 && b.t.alive);
  }
}

export const afflictions = new Afflictions();
