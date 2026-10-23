import * as THREE from 'three';
import { Bandit, type BanditRole, type Bolts } from '../../enemies/bandit';
import { cityGround } from './ghagrabbaPlaces';
import type { Look } from '../../npc/charBuilder';
import type { Player } from '../../player/player';
import type { QuestLog } from '../../quests/questLog';

// Quest fights: a pack of foes that turns up at a place while a quest stage
// still wants them dead, as many as are still wanted, and packs itself away
// when the player leaves (so a death or a long walk resets the fight).

export interface Mob {
  dead: boolean;
  dispose(): void;
}

export class Pack<T extends Mob> {
  live: T[] = [];
  constructor(
    private at: () => THREE.Vector3 | null,
    private make: (k: number, at: THREE.Vector3) => T,
    private tick: (m: T, dt: number) => void,
    private near = 170,
  ) {}
  /** `want`: how many should be out (0: none needed). */
  update(dt: number, player: Player, want: number) {
    const at = this.at();
    const d = at ? Math.hypot(player.pos.x - at.x, player.pos.z - at.z) : Infinity;
    if (at && want > 0 && !this.live.length && d < this.near && !player.dead) {
      for (let k = 0; k < want; k++) this.live.push(this.make(k, at));
    }
    for (const m of this.live) this.tick(m, dt);
    for (const m of this.live.filter((m) => m.dead)) m.dispose();
    this.live = this.live.filter((m) => !m.dead);
    if (this.live.length && (d > this.near + 160 || !at)) this.clear();
  }
  clear() {
    for (const m of this.live) m.dispose();
    this.live = [];
  }
}

/** How many more kills an objective wants (0 when that quest isn't on that stage). */
export function need(quests: QuestLog, id: string, stage: number, obj = 0) {
  const st = quests.state[id];
  if (!st || st.status !== 'active' || st.stage !== stage) return 0;
  const o = quests.defs.get(id)?.stages[stage]?.objectives[obj];
  if (!o || o.type !== 'kill') return 0;
  return Math.max(0, o.count - (st.progress[obj] ?? 0));
}

/** A ring of bandit-style fighters round a point. */
export function banditAt(scene: THREE.Scene, bolts: Bolts, at: THREE.Vector3, k: number, n: number, spec: { role: BanditRole; kind: string; name: string; look: Look; hp?: number; damage?: number; radius?: number }) {
  const a = (k / Math.max(1, n)) * Math.PI * 2 + 0.4;
  const r = spec.radius ?? 5;
  const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
  const b = new Bandit(spec.role, new THREE.Vector3(x, cityGround(x, z), z), scene, bolts, undefined, spec.look);
  b.kind = spec.kind;
  b.name = spec.name;
  if (spec.hp) b.hp = b.maxHp = spec.hp;
  if (spec.damage) b.hitDamage = spec.damage;
  return b;
}
