import * as THREE from 'three';
import { Bandit } from '../../enemies/bandit';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { KitDungeonDef } from '../kit/build';
import type { BossActor, BossDef, BossFight } from '../kit/boss';
import { baseTable } from '../kit/loot';
import { CAVE_PLANS } from './plans';

// ---------------------------------------------------------------------------
// The Cold Vein (docs/design/mountains.md, "The Iron Below", chapter 1): the
// old claim mine under Copperbrook, where the ore comes up black and cold.
// Varga Coldhand's smugglers have been working it at night and carting the
// black iron south. Down here: her crews, the rats, and black-iron armour that
// stands up and walks when the vein is cut.
//
// Varga Coldhand: a smuggler boss with a black-iron hook for a hand. At 60%
// she strikes the vein and the cold wakes two suits of black-iron armour; at
// 30% she drinks something from a black flask and comes on faster and harder.
// Her ledger is the prize (the Iron Below thread goes on from it).
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

class VargaActor implements BossActor {
  inner: Bandit;
  name = 'Varga Coldhand';
  constructor(at: THREE.Vector3, private f: BossFight) {
    this.inner = this.make(at);
  }
  private make(at: THREE.Vector3) {
    const b = new Bandit('chief', at.clone(), this.f.c.scene, this.f.c.inst.bolts, at.clone(), {
      body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0xd8d4cc, skin: 0xc8a888, cloth: 0x2a2a32, linen: 0x6a6a72, pauldron: true, bracers: true, height: 1.78,
    });
    b.kind = 'vargaColdhand';
    b.name = 'Varga Coldhand';
    b.hp = b.maxHp = 900;
    b.hitDamage = 24;
    return b;
  }
  get id() { return this.inner.id; }
  get kind() { return this.inner.kind; }
  get alive() { return this.inner.alive; }
  get center() { return this.inner.center; }
  get radius() { return this.inner.radius; }
  get position() { return this.inner.position; }
  get stunned() { return this.inner.stunned; }
  get lockable() { return this.inner.lockable; }
  get hp() { return this.inner.hp; }
  get maxHp() { return this.inner.maxHp; }
  get dead() { return this.inner.dead; }
  get awake() { return this.inner.alerted; }
  takeHit(h: HitInfo) { this.inner.takeHit(h); }
  update(dt: number, player: Player) { this.inner.update(dt, player); }
  reset(at: THREE.Vector3) {
    if (!this.inner.alive) return;
    this.inner.dispose();
    this.inner = this.make(at);
  }
  dispose() { this.inner.dispose(); }
}

const VARGA: BossDef = {
  name: 'Varga Coldhand',
  subtitle: 'The black-iron smuggler',
  kind: 'vargaColdhand',
  phases: [0.6, 0.3],
  async create(at, _yaw, f) {
    return new VargaActor(at, f);
  },
  arena(f) {
    const c = f.c, r = f.room, m = c.theme.m, O = c.inst.origin;
    // The vein: a black seam down the back wall, glittering with frost; carts of black ore.
    const back = f.home.at.clone().add(V(-Math.sin(f.home.yaw) * 6.5, 0, -Math.cos(f.home.yaw) * 6.5));
    const side = V(Math.cos(f.home.yaw), 0, -Math.sin(f.home.yaw));
    const seam = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.25, metalness: 0.8, emissive: 0x2a4a6a, emissiveIntensity: 0.25 });
    c.mesh(r, new THREE.BoxGeometry(r.rect.w * 3, 3.4, 0.6), seam, back.x, O.y + 1.7, back.z, f.home.yaw);
    for (const s of [-1, 1]) {
      const p = back.clone().addScaledVector(side, s * 5).add(V(Math.sin(f.home.yaw) * 2.5, 0, Math.cos(f.home.yaw) * 2.5));
      c.mesh(r, new THREE.BoxGeometry(1.4, 0.9, 2.2), m.planks, p.x, O.y + 0.6, p.z, f.home.yaw + Math.PI / 2);
      c.mesh(r, new THREE.SphereGeometry(0.7, 6, 4), seam, p.x, O.y + 1.2, p.z);
      c.solid(p.clone().setY(O.y + 0.6), V(0.7, 0.6, 1.1));
      c.flame(r, p.clone().addScaledVector(side, s * 1.6).setY(O.y + 2.1), 'lantern', 0.8);
    }
    f.s.vein = back;
  },
  onIntro(f) {
    f.c.hooks.banner('VARGA COLDHAND');
    f.c.toast('"Sky-born. Thought the dwarves would send someone. Thought they\'d send someone bigger."');
  },
  onPhase(f, phase) {
    const c = f.c;
    const varga = f.target as VargaActor;
    if (phase === 1) {
      // She strikes the seam; the cold that comes out of it stands two suits of black iron up.
      const vein = (f.s.vein as THREE.Vector3) ?? varga.position;
      for (let k = 0; k < 30; k++) c.fx.add.spawn({ pos: vein.clone().add(V((Math.random() - 0.5) * 6, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2)), spread: 0.8, count: 1, life: [0.6, 1.4], size: [0.16, 0.02], color: 0xcfe8ff, color2: 0x3a5a8a, drag: 2 });
      for (const s of [-1, 1]) c.spawnNow('armour', c.centre(f.room).add(V(s * 4, 0, -2)), f.room.id);
      c.toast('Varga drives her hook into the black seam. Frost pours out of it, and two suits of black iron stand up in the cold.');
    } else {
      varga.inner.pace = 1.45;
      varga.inner.hitDamage = 32;
      c.toast('Varga drinks from a black flask. Frost creeps up her arm, and she laughs.');
    }
  },
  loot(f, first, at) {
    const h = f.c.hooks;
    if (first) {
      h.giveGold(at, 300);
      return 'Varga Coldhand falls. Her ledger is in her coat.';
    }
    h.giveGold(at, 140);
    return 'Varga is down again. The black seam goes on bleeding cold.';
  },
};

export function coldVeinDef(): KitDungeonDef {
  return {
    id: 'coldVein',
    name: 'The Cold Vein',
    theme: 'cave',
    origin: new THREE.Vector3(52000, 0, 0),
    plans: CAVE_PLANS,
    traps: ['darts', 'collapse', 'boulder', 'portcullis'],
    mobs: (floor) => (floor > 1 ? ['bandit', 'armour', 'crossbow', 'armour'] : ['bandit', 'crossbow', 'rat', 'bandit']),
    loot: baseTable([[['blackIronIngot', 1]], [['blackIronIngot', 1], ['warmstone', 1]], [['blackIronIngot', 2]], [['blackIronIngot', 2]]]),
    boss: { floor: 1, def: VARGA },
    reward: 'coldhandLedger',
    exitLabel: () => 'Climb back up to Copperbrook',
    arrive: () => 'The Cold Vein. Your breath smokes. The walls sweat frost, and somewhere below, picks are working.',
  };
}
