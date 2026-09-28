import * as THREE from 'three';
import { events } from '../core/events';
import { heightAt } from '../world/terrain';
import { COMBAT_STYLES, STYLE_SWAP_LEVEL, type CombatStyleId } from './styles';

// Levels, XP, gold and skill points, plus the glowing orbs and coins that
// burst out of defeated enemies and fly to the player.

export const XP_FOR_KIND: Record<string, [xp: number, gold: number]> = {
  green: [12, 3], blue: [26, 6], magma: [30, 8], cave: [22, 5], armour: [48, 14], orc: [420, 0], dummy: [0, 0],
};

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number) {
  return Math.round(80 * Math.pow(level, 1.45));
}

export class Progression {
  level = 1;
  xp = 0;
  gold = 0;
  skillPoints = 0;
  learnedStyles: CombatStyleId[] = [];
  activeStyle: CombatStyleId | null = null;
  learnedSkills: Record<CombatStyleId, string[]> = { swordsman: [], bulwark: [] };

  get next() {
    return xpToNext(this.level);
  }

  addXp(n: number) {
    this.xp += n;
    while (this.xp >= this.next) {
      this.xp -= this.next;
      this.level++;
      this.skillPoints++;
      events.emit('levelUp', { level: this.level });
    }
    events.emit('progressChanged', {});
  }

  knowsStyle(id: CombatStyleId) {
    return this.learnedStyles.includes(id);
  }

  learnStyle(id: CombatStyleId) {
    if (!COMBAT_STYLES[id] || this.knowsStyle(id)) return false;
    this.learnedStyles.push(id);
    if (!this.activeStyle) this.activeStyle = id;
    events.emit('progressChanged', {});
    return true;
  }

  setActiveStyle(id: CombatStyleId) {
    if (!this.knowsStyle(id)) return false;
    this.activeStyle = id;
    events.emit('progressChanged', {});
    return true;
  }

  unlockSkill(style: CombatStyleId, nodeId: string) {
    const tree = COMBAT_STYLES[style];
    if (!tree || !this.knowsStyle(style)) return false;
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node || this.learnedSkills[style].includes(nodeId)) return false;
    if (node.requires?.some((req) => !this.learnedSkills[style].includes(req))) return false;
    if (this.skillPoints < node.cost) return false;
    this.skillPoints -= node.cost;
    this.learnedSkills[style].push(nodeId);
    events.emit('progressChanged', {});
    return true;
  }

  hasSkill(style: CombatStyleId, nodeId: string) {
    return this.learnedSkills[style]?.includes(nodeId) ?? false;
  }

  skillMove(style: CombatStyleId, nodeId: string) {
    if (!this.hasSkill(style, nodeId)) return null;
    return COMBAT_STYLES[style].nodes.find((n) => n.id === nodeId) ?? null;
  }

  addGold(n: number) {
    this.gold += n;
    events.emit('progressChanged', {});
  }

  /** Stat growth per level. */
  get bonusHp() {
    return (this.level - 1) * 10;
  }
  get bonusStamina() {
    return (this.level - 1) * 4;
  }
  get bonusMana() {
    return (this.level - 1) * 5;
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
