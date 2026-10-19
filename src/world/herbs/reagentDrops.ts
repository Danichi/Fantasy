import * as THREE from 'three';
import { events } from '../../core/events';
import { REAGENT_MODELS } from '../../items/reagents';
import { ITEMS } from '../../items/itemDefs';
import type { FX } from '../../fx/particles';
import { gatherMods, bonusYield } from './gatherMods';

// Beast reagents: wolves leave fangs, slimes gel, venomous things their sacs,
// the restless dead their bone dust and fire creatures their ember ash. A
// drop lies glowing where the creature fell and is picked up by walking over
// it (or handed over directly at sea, where it would sink). Herbalism's
// rareChance makes drops likelier and yieldBonus makes them bigger.

interface DropRule {
  item: string;
  /** chance (0..1) of a drop */
  chance: number;
  n: [number, number];
}

/** Beasts (BeastSpawner): green = wolf, dire = dire wolf, magma = magma brute. Stags and goblins carry no reagents. */
const BEAST_DROPS: Record<string, DropRule[]> = {
  green: [{ item: 'wolfFang', chance: 0.55, n: [1, 2] }],
  dire: [{ item: 'wolfFang', chance: 1, n: [2, 4] }],
  magma: [{ item: 'emberAsh', chance: 0.65, n: [1, 2] }],
};
/** Slimes (the mine's slimes share kind strings with beasts, so they are told apart by id). */
const SLIME_DROPS: Record<string, DropRule[]> = {
  green: [{ item: 'slimeGel', chance: 0.7, n: [1, 2] }],
  blue: [{ item: 'slimeGel', chance: 0.7, n: [1, 2] }],
  cave: [{ item: 'slimeGel', chance: 0.7, n: [1, 3] }],
  magma: [{ item: 'slimeGel', chance: 0.6, n: [1, 2] }, { item: 'emberAsh', chance: 0.45, n: [1, 1] }],
};
/** Everything else, by kind. */
const KIND_DROPS: Record<string, DropRule[]> = {
  wolf: [{ item: 'wolfFang', chance: 0.55, n: [1, 2] }],
  zombie: [{ item: 'boneDust', chance: 0.6, n: [1, 2] }],
  skeleton: [{ item: 'boneDust', chance: 0.7, n: [1, 2] }],
  abomination: [{ item: 'boneDust', chance: 1, n: [4, 6] }],
  sandEel: [{ item: 'venomSac', chance: 0.5, n: [1, 1] }],
  duneJelly: [{ item: 'venomSac', chance: 0.55, n: [1, 1] }, { item: 'slimeGel', chance: 0.4, n: [1, 1] }],
  sandRay: [{ item: 'venomSac', chance: 0.45, n: [1, 1] }],
  rayRider: [{ item: 'venomSac', chance: 0.5, n: [1, 2] }],
  sandCrab: [{ item: 'venomSac', chance: 0.15, n: [1, 1] }],
  sawtooth: [{ item: 'venomSac', chance: 1, n: [2, 3] }],
  serpent: [{ item: 'venomSac', chance: 0.8, n: [1, 3] }],
  // Kinds other updates may add (spiders, scorpions, fire spirits...).
  spider: [{ item: 'venomSac', chance: 0.6, n: [1, 1] }],
  giantSpider: [{ item: 'venomSac', chance: 0.9, n: [1, 2] }],
  scorpion: [{ item: 'venomSac', chance: 0.6, n: [1, 1] }],
  wraith: [{ item: 'boneDust', chance: 0.5, n: [1, 2] }],
  lich: [{ item: 'boneDust', chance: 1, n: [3, 5] }],
  fireSpirit: [{ item: 'emberAsh', chance: 0.7, n: [1, 2] }],
  salamander: [{ item: 'emberAsh', chance: 0.6, n: [1, 2] }],
  imp: [{ item: 'emberAsh', chance: 0.5, n: [1, 1] }],
};
/** Kinds that die at sea: the reagent is handed over (a pickup would sink). */
const AT_SEA = new Set(['serpent']);

interface Drop {
  item: string;
  qty: number;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  t: number;
  pulse: number;
}

const LIFE = 150; // seconds a drop lies before it is lost
const REACH = 1.6;

export interface ReagentDropHooks {
  scene: THREE.Scene;
  fx: FX;
  give: (id: string, n: number) => void;
  /** is this target id one of the BeastSpawner's beasts (wolves...) rather than a slime? */
  isBeast: (enemyId: number) => boolean;
  /** ground height under a point (drops settle on it) */
  groundAt: (x: number, z: number) => number;
  toast?: (m: string) => void;
}

export class ReagentDrops {
  private drops: Drop[] = [];
  private off: () => void;

  constructor(private h: ReagentDropHooks) {
    this.off = events.on('enemyDied', ({ at, enemyId, kind }) => this.onDeath(at, enemyId, kind));
  }

  private rulesFor(enemyId: number, kind: string) {
    if (kind in BEAST_DROPS || kind in SLIME_DROPS) return (this.h.isBeast(enemyId) ? BEAST_DROPS[kind] : SLIME_DROPS[kind]) ?? [];
    return KIND_DROPS[kind] ?? [];
  }

  private onDeath(at: THREE.Vector3, enemyId: number, kind: string) {
    for (const r of this.rulesFor(enemyId, kind)) {
      if (Math.random() > Math.min(1, r.chance + gatherMods.rareChance * 0.5)) continue;
      const qty = r.n[0] + Math.floor(Math.random() * (r.n[1] - r.n[0] + 1)) + bonusYield();
      if (AT_SEA.has(kind)) {
        this.h.give(r.item, qty);
        events.emit('herbGathered', { id: r.item, qty, at: at.clone(), source: 'drop' });
        continue;
      }
      this.spawn(r.item, qty, at);
    }
  }

  /** Lay a reagent on the ground (also usable by other systems: chests, quests). */
  spawn(item: string, qty: number, at: THREE.Vector3) {
    const build = REAGENT_MODELS[item] ?? ITEMS[item]?.build;
    if (!build) return;
    const obj = build();
    obj.scale.setScalar(1.6);
    const a = Math.random() * Math.PI * 2, d = 0.3 + Math.random() * 0.5;
    const pos = new THREE.Vector3(at.x + Math.cos(a) * d, 0, at.z + Math.sin(a) * d);
    pos.y = this.h.groundAt(pos.x, pos.z);
    // A dungeon floor may sit far above or below the overworld ground: trust the corpse then.
    if (Math.abs(pos.y - at.y) > 3) pos.y = at.y - 0.6;
    obj.position.copy(pos);
    obj.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    this.h.scene.add(obj);
    this.drops.push({ item, qty, obj, pos, t: 0, pulse: Math.random() * 6 });
    this.h.fx.add.spawn({ pos: pos.clone().setY(pos.y + 0.3), spread: 1.4, count: 12, life: [0.3, 0.7], size: [0.06, 0.01], color: 0xfff0c0, color2: 0x9ad06a, upBias: 1, drag: 2 });
  }

  update(dt: number, player: THREE.Vector3) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.pulse += dt;
      // Bob and turn so it catches the eye; blink out over its last seconds.
      d.obj.position.y = d.pos.y + 0.12 + Math.sin(d.pulse * 2.4) * 0.05;
      d.obj.rotation.y += dt * 1.2;
      d.obj.visible = d.t < LIFE - 8 || Math.sin(d.t * 12) > 0;
      if (Math.random() < dt * 2.5) this.h.fx.add.spawn({ pos: d.obj.position.clone().setY(d.obj.position.y + 0.15), spread: 0.3, count: 1, life: [0.5, 0.9], size: [0.04, 0.01], color: 0xfff0b0, color2: 0x8ad06a, upBias: 2, drag: 1 });
      const dx = player.x - d.pos.x, dz = player.z - d.pos.z, dy = player.y - d.pos.y;
      if (dx * dx + dz * dz < REACH * REACH && Math.abs(dy) < 2.5) {
        this.collect(i);
        continue;
      }
      if (d.t > LIFE) this.remove(i);
    }
  }

  private collect(i: number) {
    const d = this.drops[i];
    this.h.give(d.item, d.qty);
    events.emit('herbGathered', { id: d.item, qty: d.qty, at: d.pos.clone(), source: 'drop' });
    this.h.fx.add.spawn({ pos: d.obj.position.clone(), spread: 1.6, count: 14, life: [0.3, 0.6], size: [0.06, 0.01], color: 0xfff4c8, color2: 0xc8a040, upBias: 1.4, drag: 2 });
    this.remove(i);
  }

  private remove(i: number) {
    const d = this.drops[i];
    this.h.scene.remove(d.obj);
    d.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });
    this.drops.splice(i, 1);
  }

  /** Drops lying around (tests, debugging). */
  get count() {
    return this.drops.length;
  }

  /** Clear every drop (leaving a dungeon, loading a save). */
  clear() {
    for (let i = this.drops.length - 1; i >= 0; i--) this.remove(i);
  }

  dispose() {
    this.clear();
    this.off();
  }
}
