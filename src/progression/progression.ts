import * as THREE from 'three';
import { events } from '../core/events';
import { heightAt } from '../world/terrain';
/** The origin picked when a new game starts (it grants the V ability). */
export type Origin = 'human' | 'dragon' | 'demon';

// XP and gold, plus the glowing orbs and coins that
// burst out of defeated enemies and fly to the player.

export const XP_FOR_KIND: Record<string, [xp: number, gold: number]> = {
  green: [12, 3], blue: [26, 6], magma: [30, 8], cave: [22, 5], armour: [48, 14], orc: [420, 0], dummy: [0, 0],
  rat: [4, 1], dire: [140, 30], bandit: [34, 12], banditChief: [260, 120],
  zombie: [28, 5], skeleton: [32, 7], abomination: [650, 240],
  // the Golden Expanse
  sandGolem: [1500, 500], sandEel: [30, 6], sandCrab: [42, 9], duneJelly: [18, 4], rayRider: [95, 30],
  sandShark: [70, 12], sandRay: [32, 6], sawtooth: [1100, 400], scavenger: [44, 16], scavengerChief: [320, 160],
};

/** XP a level cost under the old auto-levelling system (used to refund old saves). */
export function xpToNext(level: number) {
  return Math.round(80 * Math.pow(level, 1.45));
}

/**
 * XP is a currency: pickups add to the unspent pool and the player invests it
 * in disciplines (see paths/paths.ts). `level` is the character level, which
 * Paths derives from discipline levels and writes back here.
 */
export class Progression {
  level = 1;
  xp = 0;
  /** every XP point ever picked up */
  totalXp = 0;
  gold = 0;
  origin: Origin = 'human';

  addXp(n: number) {
    this.xp += n;
    this.totalXp += n;
    events.emit('progressChanged', {});
  }

  addGold(n: number) {
    this.gold += n;
    events.emit('progressChanged', {});
  }
}

interface Pickup {
  kind: 'xp' | 'gold';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  value: number;
}

export class Rewards {
  private items: Pickup[] = [];
  private orbs: THREE.InstancedMesh;
  private coins: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private time = 0;
  static MAX = 160;

  constructor(scene: THREE.Scene, private prog: Progression) {
    this.orbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.4, 3.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      Rewards.MAX,
    );
    this.coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.25, emissive: 0x3a2800 }),
      Rewards.MAX,
    );
    for (const im of [this.orbs, this.coins]) {
      im.count = 0;
      im.frustumCulled = false;
      scene.add(im);
    }
  }

  spawn(at: THREE.Vector3, xp: number, gold: number) {
    const burst = (kind: Pickup['kind'], total: number, pieces: number) => {
      if (total <= 0) return;
      const n = Math.max(1, Math.min(pieces, total));
      for (let i = 0; i < n; i++) {
        if (this.items.length >= Rewards.MAX * 2) break;
        const a = Math.random() * Math.PI * 2;
        this.items.push({
          kind,
          pos: at.clone(),
          vel: new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 3 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 2)),
          t: -Math.random() * 0.15,
          value: Math.floor(total / n) + (i < total % n ? 1 : 0),
        });
      }
    };
    burst('xp', xp, Math.ceil(xp / 6));
    burst('gold', gold, Math.ceil(gold / 8));
  }

  update(dt: number, target: THREE.Vector3) {
    this.time += dt;
    let no = 0, nc = 0;
    for (const p of this.items) {
      p.t += dt;
      if (p.t < 0.55) {
        // Burst out and bounce on the ground.
        p.vel.y -= 12 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const g = heightAt(p.pos.x, p.pos.z) + 0.1;
        if (p.pos.y < g) {
          p.pos.y = g;
          p.vel.y = Math.abs(p.vel.y) * 0.4;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        }
      } else {
        // Home in, accelerating.
        const to = target.clone().sub(p.pos);
        const d = to.length();
        const speed = 4 + (p.t - 0.55) * 22;
        p.pos.addScaledVector(to.normalize(), Math.min(d, speed * dt));
        if (d < 0.35) {
          if (p.kind === 'xp') this.prog.addXp(p.value);
          else this.prog.addGold(p.value);
          p.value = -1;
          events.emit('pickup', { kind: p.kind });
          continue;
        }
      }
      if (p.kind === 'xp' && no < Rewards.MAX) {
        const s = 1 + Math.sin(this.time * 12 + p.pos.x * 5) * 0.2;
        this.m.makeScale(s, s, s).setPosition(p.pos);
        this.orbs.setMatrixAt(no++, this.m);
      } else if (p.kind === 'gold' && nc < Rewards.MAX) {
        this.q.setFromEuler(new THREE.Euler(0, this.time * 8 + p.pos.z * 3, 0));
        this.m.compose(p.pos, this.q, new THREE.Vector3(1, 1, 1));
        this.coins.setMatrixAt(nc++, this.m);
      }
    }
    this.items = this.items.filter((p) => p.value >= 0);
    this.orbs.count = no;
    this.coins.count = nc;
    this.orbs.instanceMatrix.needsUpdate = true;
    this.coins.instanceMatrix.needsUpdate = true;
  }
}
