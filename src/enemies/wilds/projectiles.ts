import * as THREE from 'three';
import { heightAt } from '../../world/terrainHeight';
import { physics } from '../../physics/physics';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';

// Things the wilds throw at you: a goblin's sling stone, a thornback's quills,
// clods of mud, the Rootwarden's thorns. Each flies on a simple ballistic arc,
// hurts the player on contact (a shield blocks most of them), and may splash
// when it lands.

export type MissileKind = 'stone' | 'thorn' | 'mud' | 'spirit';

interface Missile {
  kind: MissileKind;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravity: number;
  life: number;
  damage: number;
  /** splash radius on landing (0: none) */
  splash: number;
  burn?: number;
  trail: number;
  color: number;
}

const GEO: Record<MissileKind, THREE.BufferGeometry> = {
  stone: new THREE.DodecahedronGeometry(0.13, 0),
  thorn: new THREE.ConeGeometry(0.06, 0.62, 5).rotateX(Math.PI / 2),
  mud: new THREE.IcosahedronGeometry(0.34, 1),
  spirit: new THREE.SphereGeometry(0.22, 10, 8),
};
const MAT: Record<MissileKind, THREE.Material> = {
  stone: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1, flatShading: true }),
  thorn: new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.7, emissive: 0x2a4a10, emissiveIntensity: 0.6 }),
  mud: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1, flatShading: true }),
  spirit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.4, 2.8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
};
const TRAIL: Record<MissileKind, number> = { stone: 0x9a9080, thorn: 0x9aff5a, mud: 0x5a4030, spirit: 0xbfefff };

export class Missiles {
  private list: Missile[] = [];
  constructor(private scene: THREE.Scene, private fx: FX) {}

  /**
   * Throw at a point, arriving after `time` seconds (a lob: gravity set so the
   * arc lands on target), or straight at it (`gravity` 0 and a speed).
   */
  lob(kind: MissileKind, from: THREE.Vector3, to: THREE.Vector3, time: number, damage: number, opts: { splash?: number; burn?: number; gravity?: number } = {}) {
    const g = opts.gravity ?? 14;
    const vel = to.clone().sub(from).divideScalar(time);
    vel.y += 0.5 * g * time;
    return this.spawn(kind, from, vel, g, damage, opts.splash ?? 0, opts.burn);
  }

  shoot(kind: MissileKind, from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, opts: { splash?: number; burn?: number } = {}) {
    return this.spawn(kind, from, dir.clone().normalize().multiplyScalar(speed), 1.2, damage, opts.splash ?? 0, opts.burn);
  }

  private spawn(kind: MissileKind, from: THREE.Vector3, vel: THREE.Vector3, gravity: number, damage: number, splash: number, burn?: number) {
    const mesh = new THREE.Mesh(GEO[kind], MAT[kind]);
    mesh.castShadow = kind !== 'spirit';
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.list.push({ kind, mesh, pos: from.clone(), vel, gravity, life: 4, damage, splash, burn, trail: 0, color: TRAIL[kind] });
  }

  update(dt: number, player: Player) {
    for (const m of this.list) {
      m.life -= dt;
      const prev = m.pos.clone();
      m.vel.y -= m.gravity * dt;
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      if (m.kind === 'thorn') m.mesh.lookAt(m.pos.clone().add(m.vel));
      else m.mesh.rotation.x += dt * 6;
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = m.kind === 'spirit' ? 0.02 : 0.05;
        this.fx.add.spawn({ pos: m.pos.clone(), spread: 0.15, count: 1, life: [0.2, 0.45], size: [m.kind === 'mud' ? 0.3 : 0.14, 0.02], color: m.color, color2: m.color, alpha: 0.6 });
      }
      // The player: a capsule from shin to head.
      const pc = player.pos.clone().setY(player.pos.y + 0.9);
      const near = Math.hypot(m.pos.x - pc.x, m.pos.z - pc.z) < 0.55 + (m.kind === 'mud' ? 0.25 : 0) && Math.abs(m.pos.y - pc.y) < 1.1;
      if (near && !player.dead) {
        const res = player.receiveAttack({ damage: m.damage, from: prev.clone().sub(m.vel.clone().setY(0).normalize().multiplyScalar(3)), at: m.pos.clone(), parryable: false, poise: m.kind === 'mud' ? 60 : 22, burn: m.burn });
        if (res === 'blocked' || res === 'guardBroken') this.fx.sparks(m.pos.clone());
        if (res !== 'dodged') m.life = 0;
      }
      const ground = heightAt(m.pos.x, m.pos.z);
      const hitWall = m.vel.lengthSq() > 1 && physics.castRay(prev, m.vel.clone().normalize(), m.vel.length() * dt) !== null;
      if (m.pos.y < ground || hitWall) {
        m.life = 0;
        if (m.splash > 0) {
          const d = Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
          if (d < m.splash && Math.abs(player.pos.y - ground) < 1.6 && !player.dead) {
            player.receiveAttack({ damage: Math.round(m.damage * (1 - d / (m.splash * 1.6))), from: m.pos.clone().setY(ground), at: player.center.clone(), parryable: false, poise: 50, burn: m.burn });
          }
        }
        this.burst(m);
      }
    }
    const gone = this.list.filter((m) => m.life <= 0);
    for (const m of gone) this.scene.remove(m.mesh);
    if (gone.length) this.list = this.list.filter((m) => m.life > 0);
  }

  private burst(m: Missile) {
    const at = m.pos.clone().setY(Math.max(m.pos.y, heightAt(m.pos.x, m.pos.z) + 0.1));
    if (m.kind === 'mud') this.fx.add.spawn({ pos: at, spread: 3, count: 18, life: [0.4, 0.9], size: [0.22, 0.06], color: 0x4a3626, color2: 0x2a1e14, gravity: 9, upBias: 0.8 });
    else if (m.kind === 'spirit') this.fx.add.spawn({ pos: at, spread: 2.5, count: 16, life: [0.3, 0.7], size: [0.16, 0.02], color: 0xdff8ff, color2: 0x5ab0ff, upBias: 0.6 });
    else this.fx.add.spawn({ pos: at, spread: 1.4, count: 6, life: [0.3, 0.6], size: [0.08, 0.02], color: m.color, color2: 0x3a3028, gravity: 8 });
  }

  clear() {
    for (const m of this.list) this.scene.remove(m.mesh);
    this.list = [];
  }

  get count() {
    return this.list.length;
  }
}
