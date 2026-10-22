import * as THREE from 'three';
import { Bandit } from '../../enemies/bandit';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { KitDungeonDef } from '../kit/build';
import type { BossActor, BossDef, BossFight } from '../kit/boss';
import { baseTable } from '../kit/loot';
import { CAVE_PLANS } from './plans';

// ---------------------------------------------------------------------------
// Hollow Ridge Caves (docs/design/dungeons.md §5): the smugglers' cave behind
// Varn's bandit camp on the King's Road spur. One floor: the cave mouth, the
// waterfall cavern (the hub), dens and rope bridges, a weighted-plate winch
// and the smuggler's key, then Vess's landing on the underground water.
//
// Captain Vess and her crossbows: she fights from range with her
// crossbowmen on the ledges; at 60% she throws smoke, slips away up the
// landing and her smugglers pour in from the side tunnel; at 25% she sets the
// spilled lamp oil alight (the slick shines before it burns) and closes in.
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Captain Vess: a bandit chief with her own name, health and kind, under the boss template. */
class VessActor implements BossActor {
  inner: Bandit;
  name = 'Captain Vess';
  constructor(at: THREE.Vector3, private f: BossFight) {
    this.inner = this.make(at);
  }
  private make(at: THREE.Vector3) {
    const b = new Bandit('chief', at.clone(), this.f.c.scene, this.f.c.inst.bolts, at.clone(), {
      body: 'female', outfit: 'ranger', hood: false, hair: 'long', hairColor: 0x2a1a12, skin: 0xd8a880, cloth: 0x3a2a4a, linen: 0x8a6a4a, pauldron: true, height: 1.82,
    });
    b.kind = 'captainVess';
    b.name = 'Captain Vess';
    b.hp = b.maxHp = 720;
    b.hitDamage = 22;
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

const VESS: BossDef = {
  name: 'Captain Vess',
  subtitle: 'Smuggler queen of Hollow Ridge',
  kind: 'captainVess',
  phases: [0.6, 0.25],
  async create(at, _yaw, f) {
    return new VessActor(at, f);
  },
  arena(f) {
    const c = f.c, r = f.room, m = c.theme.m, O = c.inst.origin;
    // The landing: underground water along the back, a boat at it, crates, two ledges.
    const back = f.home.at.clone().add(V(-Math.sin(f.home.yaw) * 6, 0, -Math.cos(f.home.yaw) * 6));
    const side = V(Math.cos(f.home.yaw), 0, -Math.sin(f.home.yaw));
    c.mesh(r, new THREE.BoxGeometry(r.rect.w * 4 - 1, 0.05, 2.6), m.water, back.x, O.y + 0.05, back.z, f.home.yaw);
    c.mesh(r, new THREE.BoxGeometry(1.6, 0.7, 4.2), m.planks, back.x + side.x * 4, O.y + 0.35, back.z + side.z * 4, f.home.yaw + Math.PI / 2);
    const ledges: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const p = f.home.at.clone().addScaledVector(side, s * (r.rect.w * 2 - 3));
      c.mesh(r, new THREE.BoxGeometry(3, 1.2, 3), m.rock, p.x, O.y + 0.6, p.z);
      c.solid(p.clone().setY(O.y + 0.6), V(1.5, 0.6, 1.5));
      c.mesh(r, new THREE.BoxGeometry(1.2, 0.6, 1.2), m.rock, p.x - side.x * s * 2, O.y + 0.3, p.z - side.z * s * 2);
      c.solid(p.clone().addScaledVector(side, -s * 2).setY(O.y + 0.3), V(0.6, 0.3, 0.6));
      ledges.push(p.clone().setY(O.y + 1.3));
      c.flame(r, p.clone().setY(O.y + 2.2), 'lantern', 0.9);
    }
    for (let k = 0; k < 6; k++) {
      const p = f.home.at.clone().addScaledVector(side, (k - 2.5) * 2.6).add(V(Math.sin(f.home.yaw) * 4, 0, Math.cos(f.home.yaw) * 4));
      if (k === 2 || k === 3) continue;
      c.mesh(r, new THREE.BoxGeometry(0.9, 0.9, 0.9), m.planks, p.x, O.y + 0.45, p.z, k);
      c.solid(p.clone().setY(O.y + 0.45), V(0.45, 0.45, 0.45));
    }
    f.s.ledges = ledges;
    f.s.fires = [] as { at: THREE.Vector3; t: number; mesh: THREE.Mesh }[];
  },
  onIntro(f) {
    // Her crossbowmen take the ledges.
    for (const p of f.s.ledges as THREE.Vector3[]) f.c.spawnNow('crossbow', p.clone(), f.room.id);
    f.c.hooks.banner('CAPTAIN VESS');
  },
  onPhase(f, phase) {
    const c = f.c, O = c.inst.origin;
    const vess = f.target as VessActor;
    if (phase === 1) {
      // Smoke, and she's gone up the landing; her smugglers pour in.
      const at = vess.position.clone();
      for (let k = 0; k < 40; k++) c.fx.alpha.spawn({ pos: at.clone().add(V((Math.random() - 0.5) * 3, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3)), spread: 0.5, count: 1, life: [2, 4], size: [0.8, 1.6], color: 0x9a948a, alpha: 0.6, drag: 1 });
      const to = f.home.at.clone().add(V(-Math.sin(f.home.yaw) * 3, 0, -Math.cos(f.home.yaw) * 3)).sub(at);
      vess.inner.carry(to.x, 0, to.z);
      for (let k = 0; k < 2; k++) c.spawnNow('bandit', c.centre(f.room).add(V((k - 0.5) * 3, 0, 4)), f.room.id);
      c.toast('Vess vanishes in smoke. "Cut them down, lads!"');
    } else {
      // Lamp oil on the floor: it shines for a moment, then burns.
      vess.inner.pace = 1.4;
      vess.inner.hitDamage = 28;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const at = c.centre(f.room).add(V(Math.cos(a) * 6, 0, Math.sin(a) * 4)).setY(O.y + 0.03);
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(2, 20), new THREE.MeshStandardMaterial({ color: 0x2a2010, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.8 }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(at);
        c.inst.group.add(mesh);
        (f.s.fires as { at: THREE.Vector3; t: number; mesh: THREE.Mesh }[]).push({ at, t: -1.5, mesh });
      }
      c.toast('Vess kicks over the lamps. The oil on the floor catches!');
    }
  },
  update(f, dt, player) {
    const fires = (f.s.fires ?? []) as { at: THREE.Vector3; t: number; mesh: THREE.Mesh }[];
    for (const fire of fires) {
      fire.t += dt;
      if (fire.t < 0) continue;
      (fire.mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.9, 0.35, 0.05);
      if (Math.random() < dt * 25) f.c.fx.add.spawn({ pos: fire.at.clone().add(V((Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3)), vel: V(0, 2, 0), spread: 0.3, count: 1, life: [0.4, 0.9], size: [0.18, 0.02], color: 0xffb040, color2: 0xff3000 });
      if (player.pos.distanceTo(fire.at) < 2 && !player.dead && f.target?.alive) player.takeDamage(12 * dt);
    }
  },
  onReset(f) {
    for (const fire of (f.s.fires ?? []) as { mesh: THREE.Mesh }[]) fire.mesh.removeFromParent();
    f.s.fires = [];
  },
  loot(f, first, at) {
    const h = f.c.hooks;
    for (const fire of (f.s.fires ?? []) as { mesh: THREE.Mesh }[]) fire.mesh.removeFromParent();
    f.s.fires = [];
    if (first) {
      h.giveGold(at, 260);
      const a = h.giveItem('vessBandolier');
      return `Captain Vess falls. Found: ${a}`;
    }
    h.giveGold(at, 120);
    return 'Vess is down again. Someone always takes her place, and her purse.';
  },
};

export function hollowRidgeDef(): KitDungeonDef {
  return {
    id: 'hollowRidge',
    name: 'Hollow Ridge Caves',
    theme: 'cave',
    origin: new THREE.Vector3(43000, 0, 0),
    plans: CAVE_PLANS,
    traps: ['darts', 'collapse', 'boulder', 'blade', 'portcullis'],
    mobs: () => ['bandit', 'crossbow', 'rat', 'cave'],
    loot: baseTable([[['smugglersCutlass', 1]], [['smugglersCutlass', 1]], [], []]),
    boss: { floor: 1, def: VESS },
    reward: 'smugglersCutlass',
    exitLabel: () => 'Leave the caves',
    arrive: () => "Hollow Ridge Caves. The smugglers' road runs on under the ridge.",
  };
}
