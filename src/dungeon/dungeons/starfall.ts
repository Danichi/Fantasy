import * as THREE from 'three';
import { Bandit } from '../../enemies/bandit';
import type { HitInfo } from '../../combat/targets';
import type { Player } from '../../player/player';
import type { BossActor, BossDef, BossFight } from '../kit/boss';
import type { KitDungeonDef } from '../kit/build';
import { baseTable } from '../kit/loot';
import { gatedFloor, bossFloor } from './plans';
class Starwarden implements BossActor {
  inner: Bandit;
  name = 'Asterion, the Last Starwarden';
  constructor(
    at: THREE.Vector3,
    private f: BossFight
  ) {
    this.inner = this.make(at);
  }
  private make(at: THREE.Vector3) {
    const b = new Bandit('sword', at.clone(), this.f.c.scene, this.f.c.inst.bolts, at.clone(), {
      body: 'male',
      outfit: 'ranger',
      hood: false,
      hair: 'simpleparted',
      hairColor: 0xdbebdc,
      skin: 0xb3c9be,
      cloth: 0x3e7066,
      linen: 0xd7cea3,
      pauldron: true,
      height: 2.15,
    });
    b.kind = 'starwarden';
    b.level = 40;
    b.name = this.name;
    b.hp = b.maxHp = 6400;
    b.hitDamage = 48;
    b.pace = 1.15;
    return b;
  }
  get id() {
    return this.inner.id;
  }
  get kind() {
    return this.inner.kind;
  }
  get alive() {
    return this.inner.alive;
  }
  get center() {
    return this.inner.center;
  }
  get radius() {
    return this.inner.radius;
  }
  get position() {
    return this.inner.position;
  }
  get stunned() {
    return this.inner.stunned;
  }
  get lockable() {
    return this.inner.lockable;
  }
  get hp() {
    return this.inner.hp;
  }
  get maxHp() {
    return this.inner.maxHp;
  }
  get dead() {
    return this.inner.dead;
  }
  get awake() {
    return this.inner.alerted;
  }
  takeHit(h: HitInfo) {
    this.inner.takeHit(h);
  }
  update(dt: number, p: Player) {
    this.inner.update(dt, p);
  }
  reset(at: THREE.Vector3) {
    if (!this.inner.alive) return;
    this.inner.dispose();
    this.inner = this.make(at);
  }
  dispose() {
    this.inner.dispose();
  }
}
export const STARWARDEN: BossDef = {
  name: 'Asterion, the Last Starwarden',
  subtitle: 'Keeper of the sky before the Turning',
  kind: 'starwarden',
  phases: [0.65, 0.3],
  async create(at, _yaw, f) {
    return new Starwarden(at, f);
  },
  arena(f) {
    const c = f.c,
      r = f.room,
      O = c.inst.origin;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        p = c.centre(r).add(new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 6));
      c.mesh(r, new THREE.CylinderGeometry(0.45, 0.7, 4.4, 8), c.theme.m.trim, p.x, O.y + 2.2, p.z);
      c.flame(r, p.clone().setY(O.y + 4.6), 'cold', 0.75);
    }
  },
  onIntro(f) {
    f.c.toast('Asterion: “Stand where the stars can see you.” Watch the blade and step out of the falling light.');
  },
  onPhase(f, phase) {
    const a = f.target as Starwarden;
    a.inner.pace = phase === 1 ? 1.3 : 1.45;
    a.inner.hitDamage = phase === 1 ? 54 : 62;
    f.c.toast(phase === 1 ? 'The outer stars awaken. Asterion calls two sentinels.' : 'The last constellation burns. His recovery is shorter; keep moving.');
    if (phase === 1) for (const dx of [-7, 7]) (f.s.adds ??= []).push(f.c.spawnNow('crossbow', f.home.at.clone().add(new THREE.Vector3(dx, 0, -4)), f.room.id));
  },
  update(f, dt, player) {
    const pulses = (f.s.pulses ??= []) as { at: THREE.Vector3; t: number; mesh: THREE.Mesh }[];
    if (!f.started || !f.target?.alive) return;
    f.s.starTimer = (f.s.starTimer ?? 5) - dt;
    if (f.phase > 0 && f.s.starTimer <= 0) {
      f.s.starTimer = f.phase === 2 ? 5 : 7;
      for (let i = 0; i < (f.phase === 2 ? 3 : 2); i++) {
        const at = player.pos
          .clone()
          .add(new THREE.Vector3((i - 1) * 3.6, 0, i % 2 ? 3.2 : 0))
          .setY(f.c.inst.origin.y + 0.08);
        const mat = new THREE.MeshStandardMaterial({ color: 0xa4d7e7, emissive: 0x669ed0, emissiveIntensity: 1, transparent: true, opacity: 0.22, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.5, 24), mat);
        mesh.position.copy(at);
        mesh.rotation.x = -Math.PI / 2;
        f.c.group(f.room).add(mesh);
        pulses.push({ at, t: 1.4, mesh });
      }
      f.c.toast('Falling stars · leave the marked circles.');
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t -= dt;
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.22 + 0.5 * (1 - p.t / 1.4);
      if (p.t <= 0) {
        if (player.pos.distanceTo(p.at) < 2.8 && !player.dead) player.receiveAttack({ damage: f.phase === 2 ? 58 : 45, from: p.at.clone(), parryable: false, poise: 90 });
        f.c.fx.add.spawn({
          pos: p.at.clone().add(new THREE.Vector3(0, 0.3, 0)),
          spread: 3,
          count: 24,
          life: [0.4, 0.9],
          size: [0.15, 0.03],
          color: 0xb3edf5,
          color2: 0x6289bf,
          upBias: 1,
        });
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        pulses.splice(i, 1);
      }
    }
  },
  onReset(f) {
    for (const a of f.s.adds ?? []) {
      if (a.obj) {
        a.obj.dispose();
        const i = f.c.inst.mobs.indexOf(a);
        if (i >= 0) f.c.inst.mobs.splice(i, 1);
      }
    }
    f.s.adds = [];
    for (const p of f.s.pulses ?? []) {
      p.mesh.removeFromParent();
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    f.s.pulses = [];
    f.s.starTimer = 5;
  },
  loot(f, first, at) {
    this.onReset?.(f);
    f.c.hooks.giveGold(at, first ? 700 : 140);
    return first ? 'The Last Starwarden kneels. The chart chamber is open.' : 'The temple’s echo falls silent again.';
  },
};
export function starfallDef(): KitDungeonDef {
  const pool = ['hall', 'library', 'chapel', 'armoury'];
  return {
    id: 'starfall',
    name: 'Temple of Starfall',
    theme: 'starfall',
    origin: new THREE.Vector3(57000, 0, 0),
    seed: 731907,
    plans: [
      gatedFloor({
        floor: 1,
        name: 'I · THE MIRROR GARDENS',
        key: 'elfStarKey',
        mech: { id: 'starfall-dawn', kind: 'mirrors' },
        pool,
        tier: 2,
        n: {
          entry: ['the root stair', ''],
          hub: ['the Hall of Fallen Light', ''],
          ante: ['the dawn shrine', ''],
          gate: ['the silver gate', ''],
          alcove: ['the leaf alcove', 'the rain alcove'],
          stairs: ['the observatory stair', ''],
        },
        t: { entry: 'entry', hub: 'kingsHall', ante: 'shrine', gate: 'gatehouse', alcove: 'niche', stairs: 'stairs' },
      }),
      bossFloor({
        floor: 2,
        name: 'II · THE SKY BEFORE THE TURNING',
        pool,
        tier: 3,
        mech: { id: 'starfall-night', kind: 'mirrors' },
        gate: { a: 'hub', b: 'ante', kind: 'sealed', id: 'starfall-sky-door', mech: ['starfall-night'] },
        n: {
          entry: ['the observatory landing', ''],
          hub: ['the Constellation Hall', ''],
          ante: ['the last starlit shrine', ''],
          alcove: ['the moon mirror', ''],
          boss: ['the Last Starwarden’s Court', ''],
          reward: ['the Star Chart Chamber', ''],
          ret: ['the rootward stair', ''],
        },
        t: { entry: 'entry', hub: 'kingsHall', ante: 'shrine', alcove: 'niche', boss: 'chapelArena', reward: 'tomb', ret: 'kingsStair' },
      }),
    ],
    traps: ['darts', 'blade', 'portcullis'],
    mobLevel: 39,
    mobs: (floor) => (floor === 1 ? ['skeleton', 'crossbow'] : ['armour', 'crossbow']),
    loot: baseTable([[['elfSpiritAmber', 2]], [['elfIronbark', 3]], [['elfMoonblossom', 3]], []]),
    boss: { floor: 2, def: STARWARDEN },
    reward: 'elfStarChart',
    rewardUnlocked: true,
    exitLabel: () => 'Return to the Ancient Forest',
    arrive: (f) =>
      f === 1 ? 'Follow the reflected light. The observatory key lies in the western wing.' : 'Align the night mirrors. The guardian protects the chart beyond the sealed court.',
  };
}
