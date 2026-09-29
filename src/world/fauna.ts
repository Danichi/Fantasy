import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { heightAt } from './terrainHeight';
import { reliefAt, RELIEF, SEA_LEVEL } from './worldMap';
import { mulberry32 } from '../core/math';
import { dampAngle } from '../core/math';

// Animals (docs/ART-DIRECTION.md rule 5; World Expansion phase 3):
//   livestock  cows, sheep, pigs, chickens, horses, donkeys in pens and
//              pastures: graze, wander inside their fence, sleep at night
//   town       dogs and cats trotting between spots in Elder Glen
//   wild       deer, stags and foxes in meadows and woods near the player,
//              pigeons on the plaza: wander and bolt when approached
// Models: Quaternius animated animals (CC0). Clones share geometry; each
// animal gets its own mixer. Only animals near the player exist as actors.

export type Species = 'cow' | 'bull' | 'sheep' | 'pig' | 'chicken' | 'chick' | 'horse' | 'horse_white' | 'donkey' | 'alpaca' | 'dog' | 'husky' | 'shiba' | 'cat' | 'deer' | 'stag' | 'fox' | 'pigeon';

interface SpeciesDef {
  height: number;
  walk: number;
  run: number;
  wild: boolean;
  /** clip names in the model */
  idle: string[];
  eat?: string;
  walkClip: string;
  runClip: string;
  /** bolt distance for wild animals */
  shy?: number;
  /** material name -> colour, to bring toy-bright palettes into the art direction */
  colors?: Record<string, number>;
}

const QUAD = { idle: ['Idle', 'Idle_2', 'Idle_Headlow'], eat: 'Eating', walkClip: 'Walk', runClip: 'Gallop' };
const SMALL = { idle: ['Idle'], eat: 'Idle_Eating', walkClip: 'Walk', runClip: 'Run' };
const SPECIES: Record<Species, SpeciesDef> = {
  cow: { height: 1.45, walk: 1.1, run: 4, wild: false, ...QUAD },
  bull: { height: 1.55, walk: 1.1, run: 4.5, wild: false, ...QUAD },
  horse: { height: 1.7, walk: 1.5, run: 7, wild: false, ...QUAD },
  horse_white: { height: 1.7, walk: 1.5, run: 7, wild: false, ...QUAD },
  donkey: { height: 1.35, walk: 1.2, run: 4, wild: false, ...QUAD },
  alpaca: { height: 1.6, walk: 1.2, run: 4, wild: false, ...QUAD },
  sheep: { height: 0.95, walk: 0.9, run: 3.5, wild: false, ...SMALL },
  pig: { height: 0.8, walk: 0.8, run: 3, wild: false, ...SMALL },
  chicken: { height: 0.45, walk: 0.7, run: 2.5, wild: false, idle: ['Idle', 'Idle_Peck'], eat: 'Idle_Peck', walkClip: 'Run', runClip: 'Run' },
  chick: { height: 0.22, walk: 0.5, run: 2, wild: false, idle: ['Idle', 'Idle_Peck'], eat: 'Idle_Peck', walkClip: 'Run', runClip: 'Run' },
  dog: { height: 0.75, walk: 1.4, run: 5, wild: false, ...SMALL },
  husky: { height: 0.8, walk: 1.4, run: 5.5, wild: false, idle: ['Idle', 'Idle_2'], eat: 'Eating', walkClip: 'Walk', runClip: 'Gallop' },
  shiba: { height: 0.6, walk: 1.3, run: 5, wild: false, idle: ['Idle', 'Idle_2'], eat: 'Eating', walkClip: 'Walk', runClip: 'Gallop' },
  cat: { height: 0.4, walk: 0.9, run: 3.5, wild: false, idle: ['Idle'], walkClip: 'Walk', runClip: 'Walk' },
  deer: { height: 1.35, walk: 1.2, run: 8, wild: true, shy: 16, ...QUAD },
  stag: { height: 1.7, walk: 1.2, run: 8, wild: true, shy: 14, ...QUAD },
  fox: { height: 0.55, walk: 1.2, run: 6.5, wild: true, shy: 12, idle: ['Idle', 'Idle_2'], eat: 'Eating', walkClip: 'Walk', runClip: 'Gallop' },
  pigeon: { height: 0.26, walk: 0.6, run: 2.2, wild: true, shy: 4, idle: ['Idle'], walkClip: 'Walk', runClip: 'Walk', colors: { Pigeon_Main: 0xaaa39a, Pigeon_Secondary: 0xd29a3a } },
};

/** A fenced pen or open range an animal belongs to. */
export interface Range {
  center: THREE.Vector3;
  radius: number;
  /** rectangle pens: half extents and yaw (fenced) */
  half?: THREE.Vector2;
  yaw?: number;
}

export interface Animal {
  species: Species;
  range: Range;
  pos: THREE.Vector3;
  yaw: number;
  target: THREE.Vector3 | null;
  state: 'idle' | 'eat' | 'walk' | 'flee' | 'sleep';
  timer: number;
  seed: number;
  actor: { root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; clip: string } | null;
  wildTile?: number;
  /** quest animals: trail this point (the player) instead of grazing */
  follow?: THREE.Vector3 | null;
  /** size multiplier (calves, prize bulls) */
  scale?: number;
}

const ACTOR_R = 110;
const MAX_ACTORS = 48;
const loader = new GLTFLoader();
const cache = new Map<Species, Promise<GLTF>>();
const load = (s: Species) => {
  if (!cache.has(s)) cache.set(s, loader.loadAsync(`/assets/animals/${s}.glb`));
  return cache.get(s)!;
};

export class Fauna {
  readonly animals: Animal[] = [];
  private active = 0;
  private scaleOf = new Map<Species, number>();
  private wildTiles = new Set<number>();
  private rng = mulberry32(777);
  private visible = true;
  private night = 0;

  constructor(private scene: THREE.Scene) {
    for (const s of Object.keys(SPECIES) as Species[]) void load(s).catch(() => {});
  }

  /** Livestock and town animals (authored herds). */
  addHerd(species: Species, count: number, range: Range) {
    for (let i = 0; i < count; i++) {
      const p = this.pointIn(range);
      this.animals.push({ species, range, pos: p, yaw: this.rng() * 6.28, target: null, state: 'idle', timer: this.rng() * 5, seed: (this.rng() * 1e9) | 0, actor: null });
    }
  }

  /** One authored animal (quest animals, named livestock). */
  addOne(species: Species, at: THREE.Vector3, range: Range, scale = 1): Animal {
    const a: Animal = { species, range, pos: at.clone(), yaw: this.rng() * 6.28, target: null, state: 'idle', timer: 2, seed: (this.rng() * 1e9) | 0, actor: null, scale };
    this.animals.push(a);
    return a;
  }

  remove(a: Animal) {
    this.release(a);
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
  }

  /** Is a point inside a range (fenced pens use their rectangle)? */
  contains(r: Range, p: THREE.Vector3) {
    return this.inRange(r, p);
  }

  private pointIn(r: Range) {
    let x: number, z: number;
    if (r.half) {
      const lx = (this.rng() * 2 - 1) * r.half.x * 0.85, lz = (this.rng() * 2 - 1) * r.half.y * 0.85;
      const c = Math.cos(r.yaw ?? 0), s = Math.sin(r.yaw ?? 0);
      x = r.center.x + lx * c + lz * s;
      z = r.center.z - lx * s + lz * c;
    } else {
      const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * r.radius;
      x = r.center.x + Math.cos(a) * d;
      z = r.center.z + Math.sin(a) * d;
    }
    return new THREE.Vector3(x, heightAt(x, z), z);
  }

  private inRange(r: Range, p: THREE.Vector3) {
    if (!r.half) return p.distanceTo(r.center) < r.radius * 1.4;
    const c = Math.cos(-(r.yaw ?? 0)), s = Math.sin(-(r.yaw ?? 0));
    const dx = p.x - r.center.x, dz = p.z - r.center.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return Math.abs(lx) < r.half.x * 0.95 && Math.abs(lz) < r.half.y * 0.95;
  }

  /** Wild animals: a deterministic handful per 256 m tile of meadow or forest near the player. */
  private spawnWild(player: THREE.Vector3) {
    const T = 256;
    const ci = Math.floor(player.x / T), cj = Math.floor(player.z / T);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const key = (i + 2048) * 4096 + (j + 2048);
      if (this.wildTiles.has(key)) continue;
      this.wildTiles.add(key);
      const rnd = mulberry32(((i * 92821) ^ (j * 68917)) >>> 0);
      const cx = (i + 0.5) * T, cz = (j + 0.5) * T;
      if (Math.hypot(cx, cz) < 180) continue; // not inside Elder Glen's walls
      const n = Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const x = i * T + rnd() * T, z = j * T + rnd() * T;
        const rel = reliefAt(x, z);
        if (heightAt(x, z) < SEA_LEVEL + 1) continue;
        let species: Species | null = null;
        if (rel === RELIEF.forest) species = rnd() < 0.5 ? 'deer' : rnd() < 0.5 ? 'stag' : 'fox';
        else if (rel === RELIEF.open || rel === RELIEF.marsh) species = rnd() < 0.55 ? 'deer' : 'fox';
        else if (rel === RELIEF.mountain) species = rnd() < 0.6 ? 'stag' : null;
        if (!species) continue;
        const herd = species === 'deer' ? 1 + Math.floor(rnd() * 3) : 1;
        const range: Range = { center: new THREE.Vector3(x, heightAt(x, z), z), radius: 40 };
        for (let h = 0; h < herd; h++) {
          const p = this.pointIn(range);
          this.animals.push({ species, range, pos: p, yaw: rnd() * 6.28, target: null, state: 'idle', timer: rnd() * 5, seed: (rnd() * 1e9) | 0, actor: null, wildTile: key });
        }
      }
    }
    // Forget tiles (and their animals) far behind.
    for (const key of [...this.wildTiles]) {
      const i = Math.floor(key / 4096) - 2048, j = (key % 4096) - 2048;
      if (Math.abs(i - ci) > 2 || Math.abs(j - cj) > 2) {
        this.wildTiles.delete(key);
        for (let a = this.animals.length - 1; a >= 0; a--) {
          if (this.animals[a].wildTile !== key) continue;
          this.release(this.animals[a]);
          this.animals.splice(a, 1);
        }
      }
    }
  }

  private async makeActor(a: Animal) {
    const gltf = await load(a.species).catch(() => null);
    if (!gltf) return null;
    const root = SkeletonUtils.clone(gltf.scene);
    let scale = this.scaleOf.get(a.species);
    if (scale === undefined) {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      scale = SPECIES[a.species].height / Math.max(0.01, box.max.y - box.min.y);
      this.scaleOf.set(a.species, scale);
    }
    root.scale.setScalar(scale * (a.scale ?? 1));
    const colors = SPECIES[a.species].colors;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (colors) {
        const mat = m.material as THREE.MeshStandardMaterial;
        const c = colors[mat.name];
        if (c !== undefined) m.material = this.recolored(a.species, mat, c);
      }
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    this.scene.add(root);
    return { root, mixer, actions, clip: '' };
  }

  private recolors = new Map<string, THREE.Material>();
  /** One shared recoloured copy per species and material. */
  private recolored(species: string, mat: THREE.MeshStandardMaterial, color: number) {
    const key = species + ':' + mat.name;
    let m = this.recolors.get(key);
    if (!m) {
      const c = mat.clone();
      c.color.set(color);
      this.recolors.set(key, (m = c));
    }
    return m;
  }

  private building = 0;
  private async spawnActor(a: Animal) {
    this.building++;
    this.active++;
    const act = await this.makeActor(a);
    this.building--;
    if (!act) {
      this.active--;
      return;
    }
    if (!this.animals.includes(a)) {
      this.scene.remove(act.root);
      this.active--;
      return;
    }
    a.actor = act;
    act.root.visible = this.visible;
  }

  private release(a: Animal) {
    if (!a.actor) return;
    this.scene.remove(a.actor.root);
    a.actor.mixer.stopAllAction();
    a.actor = null;
    this.active--;
  }

  private play(a: Animal, clip: string, speed = 1) {
    const act = a.actor!;
    if (act.clip === clip) return;
    const next = act.actions.get(clip) ?? act.actions.get('Idle');
    if (!next) return;
    const prev = act.clip ? act.actions.get(act.clip) : undefined;
    next.reset().setEffectiveTimeScale(speed).play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.3, false);
    act.clip = clip;
  }

  update(dt: number, player: THREE.Vector3, night: number) {
    this.night = night;
    this.spawnWild(player);
    for (const a of this.animals) {
      const def = SPECIES[a.species];
      const d = a.pos.distanceTo(player);
      // Actors only near the player.
      if (a.actor && d > ACTOR_R + 15) this.release(a);
      if (!a.actor && d < ACTOR_R && this.active < MAX_ACTORS && this.building < 2) void this.spawnActor(a);
      if (d > ACTOR_R + 40) continue; // nothing to simulate that nobody can see
      // Behaviour.
      a.timer -= dt;
      if (a.follow) {
        // Trail the player: walk when a few metres behind, trot when far.
        const to = a.follow.clone().sub(a.pos).setY(0);
        const len = to.length();
        if (len > 3.2) {
          a.state = len > 9 ? 'flee' : 'walk';
          const step = Math.min(len - 3, (len > 20 ? def.run * 1.4 : len > 9 ? def.run * 0.8 : def.walk * 1.6) * dt);
          a.pos.addScaledVector(to.normalize(), step);
          a.yaw = dampAngle(a.yaw, Math.atan2(to.x, to.z), 6, dt);
        } else if (a.state === 'walk' || a.state === 'flee') a.state = 'idle';
        a.timer = 1;
      }
      if (def.wild && def.shy && d < def.shy && a.state !== 'flee') {
        a.state = 'flee';
        const away = a.pos.clone().sub(player).setY(0).normalize().multiplyScalar(30 + this.rng() * 20);
        a.target = a.pos.clone().add(away);
        a.timer = 6;
      }
      if (a.timer <= 0 && a.state !== 'flee' && !a.follow) {
        const roll = this.rng();
        if (this.night > 0.7 && !def.wild) {
          a.state = 'sleep';
          a.timer = 20;
        } else if (roll < 0.4) {
          a.state = 'walk';
          a.target = this.pointIn(a.range);
          a.timer = 12;
        } else if (roll < 0.75 && def.eat) {
          a.state = 'eat';
          a.timer = 4 + this.rng() * 8;
        } else {
          a.state = 'idle';
          a.timer = 3 + this.rng() * 6;
        }
      }
      if ((a.state === 'walk' || a.state === 'flee') && a.target && !a.follow) {
        const to = a.target.clone().sub(a.pos).setY(0);
        const len = to.length();
        const speed = a.state === 'flee' ? def.run : def.walk;
        if (len < 0.4 || (a.state === 'flee' && a.timer <= 0)) {
          a.state = 'idle';
          a.target = null;
          a.timer = 2 + this.rng() * 4;
          if (a.state === 'idle' && !def.wild && !this.inRange(a.range, a.pos)) a.target = this.pointIn(a.range);
        } else {
          const step = Math.min(len, speed * dt);
          const next = a.pos.clone().addScaledVector(to.normalize(), step);
          // Livestock stays inside its fence.
          if (def.wild || this.inRange(a.range, next)) a.pos.copy(next);
          else {
            a.target = this.pointIn(a.range);
          }
          a.yaw = dampAngle(a.yaw, Math.atan2(to.x, to.z), 6, dt);
        }
      }
      a.pos.y = heightAt(a.pos.x, a.pos.z);
      if (!a.actor) continue;
      a.actor.root.position.copy(a.pos);
      a.actor.root.rotation.y = a.yaw;
      const clip = a.state === 'walk' ? def.walkClip : a.state === 'flee' ? def.runClip : a.state === 'eat' ? def.eat ?? def.idle[0] : def.idle[a.seed % def.idle.length];
      this.play(a, clip, a.state === 'sleep' ? 0.35 : 1);
      a.actor.mixer.update(d > 50 ? dt * 0.5 : dt);
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    for (const a of this.animals) if (a.actor) a.actor.root.visible = v;
  }

  get activeCount() {
    return this.active;
  }
}
