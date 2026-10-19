import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildCharacter, type Look, type BuiltCharacter } from '../../npc/charBuilder';
import { heightAt } from '../terrainHeight';
import { dampAngle } from '../../core/math';
import type { WorldMats } from '../buildings';

// The moving parts of road life: people (walking, riding, sitting on a
// coach box), the animals that carry and pull for them, carts and a noble's
// carriage, and the speech bubbles travellers call out as you pass.
// Everything here is cheap to keep around: a figure's character is built
// once (asynchronously) and only animated while it's near the player.

// ---- people -----------------------------------------------------------------------------------

export const FIGURE_CLIPS = ['idle', 'walk', 'talk', 'sit', 'cheer', 'jog', 'fix', 'crouch', 'idle_tired', 'arms', 'drink', 'dance'];

export type Prop = 'staff' | 'banner' | 'lance' | 'lute' | 'bell' | 'basket' | 'lantern';

/** A road person: a built character inside a group that can stand, walk, sit, or ride. */
export class Figure {
  readonly root = new THREE.Group();
  built: BuiltCharacter | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  /** 0 standing, 1 astride a mount (the legs are posed over its back) */
  ride = 0;
  /** lift above the ground (riding, sitting on a coach box) */
  lift = 0;
  pos = new THREE.Vector3();
  yaw = 0;
  disposed = false;

  constructor(private scene: THREE.Scene, readonly look: Look, prop?: Prop, propColor = 0x2f5f9a) {
    scene.add(this.root);
    void buildCharacter(look, FIGURE_CLIPS).then((b) => {
      if (this.disposed) return;
      this.built = b;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      for (const a of acts) this.actions[a.getClip().name] = a;
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      if (prop) {
        const hand = b.bones.get('RightHand') ?? b.bones.get('hand_r');
        if (hand) {
          const p = buildProp(prop, propColor);
          p.scale.setScalar(1 / b.root.scale.x);
          hand.add(p);
        }
      }
      this.root.add(b.root);
      const c = this.clip;
      this.clip = '';
      this.play(c || 'idle');
    });
  }

  play(name: string, speed = 1) {
    const next = this.actions[name] ?? this.actions.idle;
    if (!next) {
      this.clip = name;
      return;
    }
    next.setEffectiveTimeScale(speed);
    if (this.clip === name) return;
    const prev = this.actions[this.clip];
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.3, false);
    this.clip = name;
  }

  get ready() {
    return !!this.built;
  }

  /** Place and animate (`full` false: a distant figure animates at a low rate). */
  update(dt: number, full = true) {
    this.root.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
    this.root.rotation.y = this.yaw;
    if (!this.built) return;
    this.built.mixer.update(full ? dt : dt * 0.5);
    if (this.ride > 0) {
      this.root.updateMatrixWorld(true);
      ridePose(this.built, this.root.quaternion, this.ride);
    }
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  get visible() {
    return this.root.visible;
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.root);
  }
}

/** Sit astride: thighs forward and apart, knees bent (the player's own riding pose, for road folk). */
function ridePose(b: BuiltCharacter, up: THREE.Quaternion, spread: number) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(up);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(up);
  const turn = (bone: THREE.Object3D | undefined, axis: THREE.Vector3, ang: number) => {
    if (!bone || !bone.parent) return;
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const target = new THREE.Quaternion().setFromAxisAngle(axis, ang).multiply(wq);
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(target));
    bone.updateMatrixWorld(true);
  };
  for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
    turn(b.bones.get(side + 'UpLeg'), fwd, s * 0.55 * spread);
    turn(b.bones.get(side + 'UpLeg'), right, -0.7);
    turn(b.bones.get(side + 'Leg'), right, 1.05);
  }
}

/** Hand-held things, authored along the hand bone's x axis (like the bandits' swords). */
function buildProp(kind: Prop, color: number): THREE.Object3D {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  const g = new THREE.Group();
  const pole = (len: number, r: number, off = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), wood);
    m.rotation.z = -Math.PI / 2;
    m.position.x = off;
    g.add(m);
  };
  switch (kind) {
    case 'staff':
      pole(1.7, 0.022, 0.15);
      break;
    case 'lance':
      pole(3.2, 0.03, 0.9);
      {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 }));
        tip.rotation.z = -Math.PI / 2;
        tip.position.x = 2.65;
        const pennon = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
        pennon.position.set(2.3, 0.13, 0);
        g.add(tip, pennon);
      }
      break;
    case 'banner': {
      pole(2.4, 0.025, 0.6);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
      cloth.position.set(1.45, 0.42, 0);
      const trim = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.08), new THREE.MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.6, side: THREE.DoubleSide }));
      trim.position.set(1.45, 0.02, 0.001);
      g.add(cloth, trim);
      break;
    }
    case 'lute': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 1.3, 0.45), new THREE.MeshStandardMaterial({ color: 0xa8743a, roughness: 0.6 }));
      body.position.x = -0.05;
      pole(0.45, 0.02, 0.22);
      g.add(body);
      break;
    }
    case 'bell': {
      pole(0.5, 0.015, 0.1);
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }));
      bell.position.x = 0.38;
      bell.rotation.z = Math.PI;
      g.add(bell);
      break;
    }
    case 'basket': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.22, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xb8925a, roughness: 1, side: THREE.DoubleSide }));
      b.position.y = -0.18;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 12, Math.PI), wood);
      g.add(b, handle);
      break;
    }
    case 'lantern': {
      pole(0.6, 0.012, 0.1);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 1.6 }));
      l.position.set(0.4, -0.12, 0);
      g.add(l);
      break;
    }
  }
  return g;
}

// ---- animals ----------------------------------------------------------------------------------

export type AnimalKind = 'horse' | 'donkey' | 'bull' | 'sheep' | 'dog' | 'cow';

const loader = new GLTFLoader();
const gltfs = new Map<string, Promise<GLTF>>();
const loadAnimal = (k: string) => {
  if (!gltfs.has(k)) gltfs.set(k, loader.loadAsync(`/assets/animals/${k}.glb`));
  return gltfs.get(k)!;
};
const HEIGHT: Record<AnimalKind, number> = { horse: 1.72, donkey: 1.35, bull: 1.55, cow: 1.45, sheep: 0.95, dog: 0.75 };
const CLIP: Record<AnimalKind, { idle: string; walk: string; run: string; eat: string }> = {
  horse: { idle: 'Idle', walk: 'Walk', run: 'Gallop', eat: 'Eating' },
  donkey: { idle: 'Idle', walk: 'Walk', run: 'Gallop', eat: 'Eating' },
  bull: { idle: 'Idle', walk: 'Walk', run: 'Gallop', eat: 'Eating' },
  cow: { idle: 'Idle', walk: 'Walk', run: 'Gallop', eat: 'Eating' },
  sheep: { idle: 'Idle', walk: 'Walk', run: 'Run', eat: 'Idle_Eating' },
  dog: { idle: 'Idle', walk: 'Walk', run: 'Run', eat: 'Idle_Eating' },
};
export const COATS: Record<string, { main: number; dark: number; light: number; hair: number }> = {
  bay: { main: 0x7a3f1c, dark: 0x4a2410, light: 0x9a5a2a, hair: 0x1a1210 },
  chestnut: { main: 0x9a4a1e, dark: 0x6a2e12, light: 0xba6a34, hair: 0x7a3a18 },
  black: { main: 0x1e1a1a, dark: 0x100e0e, light: 0x3a3232, hair: 0x0a0808 },
  grey: { main: 0x9a9a98, dark: 0x6a6a6a, light: 0xd0d0cc, hair: 0x3a3a3a },
  white: { main: 0xe6e2da, dark: 0xb8b4ac, light: 0xf6f4f0, hair: 0xd8d0c0 },
  dun: { main: 0xb8925a, dark: 0x7a5a32, light: 0xd8b880, hair: 0x2a1e14 },
};

export interface AnimalOpts {
  coat?: string;
  /** a saddle and blanket of this colour */
  saddle?: number;
  /** panniers of goods */
  packs?: boolean;
}

/** A horse, donkey, ox or other beast of the road: loads its model once, animates walk/run/idle. */
export class Animal {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private clip = '';
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  disposed = false;
  readonly height: number;

  constructor(scene: THREE.Scene, readonly kind: AnimalKind, opts: AnimalOpts = {}, parent?: THREE.Object3D) {
    this.height = HEIGHT[kind];
    (parent ?? scene).add(this.root);
    void loadAnimal(kind).then((g) => {
      if (this.disposed) return;
      const model = SkeletonUtils.clone(g.scene);
      const bb = new THREE.Box3().setFromObject(g.scene);
      model.scale.setScalar(this.height / Math.max(0.01, bb.max.y - bb.min.y));
      const coat = opts.coat ? COATS[opts.coat] : null;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false;
        if (coat) {
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          const c = ({ Main: coat.main, Main_Dark: coat.dark, Main_Light: coat.light, Hair: coat.hair } as Record<string, number>)[mat.name];
          if (c !== undefined) mat.color.set(c);
          m.material = mat;
        }
      });
      if (opts.saddle !== undefined || opts.packs) {
        model.updateMatrixWorld(true);
        const back = model.getObjectByName('Back') ?? model.getObjectByName('Body');
        if (back) {
          const tack = new THREE.Group();
          const blanket = new THREE.MeshStandardMaterial({ color: opts.saddle ?? 0x6a5a3a, roughness: 0.95 });
          const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });
          const k = this.height / 1.72;
          if (opts.saddle !== undefined) {
            tack.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.7), blanket));
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.5), leather);
            seat.position.y = 0.06;
            tack.add(seat);
          }
          if (opts.packs) {
            for (const s of [-1, 1]) {
              const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.5), new THREE.MeshStandardMaterial({ color: s > 0 ? 0x8a6a44 : 0x7a5a3a, roughness: 1 }));
              bag.position.set(s * 0.32, -0.12, 0);
              tack.add(bag);
            }
            const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 1 }));
            roll.rotation.z = Math.PI / 2;
            roll.position.y = 0.12;
            tack.add(roll);
          }
          tack.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
          const ws = back.getWorldScale(new THREE.Vector3());
          tack.scale.set(k / ws.x, k / ws.y, k / ws.z);
          tack.quaternion.copy(back.getWorldQuaternion(new THREE.Quaternion()).invert());
          tack.position.copy(back.worldToLocal(new THREE.Vector3(0, 1.3 * k, -0.1 * k)));
          back.add(tack);
        }
      }
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const c of g.animations) this.actions.set(c.name, this.mixer.clipAction(c));
      const c = this.clip;
      this.clip = '';
      this.play(c || CLIP[kind].idle);
    });
  }

  play(name: string, speed = 1) {
    const a = this.actions.get(name) ?? this.actions.get(CLIP[this.kind].idle);
    if (!a) {
      this.clip = name;
      return;
    }
    a.setEffectiveTimeScale(speed);
    if (this.clip === name) return;
    const prev = this.actions.get(this.clip);
    a.reset().play();
    if (prev && prev !== a) prev.crossFadeTo(a, 0.3, false);
    this.clip = name;
  }

  /** Pick walk/run/idle from `speed` (m/s); `grazing` idles with its head down. */
  gait(grazing = false) {
    const c = CLIP[this.kind];
    if (this.speed < 0.15) this.play(grazing ? c.eat : c.idle);
    else if (this.speed < (this.kind === 'horse' ? 4.2 : 2.6)) this.play(c.walk, Math.max(0.5, this.speed / (this.kind === 'sheep' || this.kind === 'dog' ? 1 : 1.5)));
    else this.play(c.run, Math.max(0.6, this.speed / (this.kind === 'horse' ? 10 : 4)));
  }

  /** Free-standing animals sit on the ground at `pos`; hitched ones are placed by their cart. */
  update(dt: number, free = true) {
    if (free) {
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
    }
    this.mixer?.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
  }
}

// ---- carts and carriages ----------------------------------------------------------------------

export type Cargo = 'cabbages' | 'barrels' | 'wool' | 'hay' | 'eggs' | 'coffin' | 'charcoal' | 'spice' | 'none';

const cargoColour: Record<Cargo, number> = { cabbages: 0x7aa84a, barrels: 0x8a5a32, wool: 0xe8e0cc, hay: 0xd8b860, eggs: 0xe8d8b0, coffin: 0x3a2a20, charcoal: 0x2a2624, spice: 0xb8602a, none: 0 };

/**
 * A two-wheeled farm cart (or a handcart, with no animal), or a four-wheeled
 * wagon: pulled by an animal walking ahead of it. Faces +Z; `pos` is the
 * middle of the bed on the ground.
 */
export class Cart {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  animal: Animal | null = null;
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  /** knocked off: a wheel lies on the road and the bed tips (broken-wagon event) */
  private loose: THREE.Mesh | null = null;

  constructor(private scene: THREE.Scene, m: WorldMats, opts: { animal?: AnimalKind | null; coat?: string; cargo?: Cargo; hood?: number; four?: boolean } = {}) {
    scene.add(this.root);
    this.root.add(this.body);
    const four = !!opts.four;
    const L = four ? 3 : 2.1;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, L), m.planks);
    bed.position.y = 0.85;
    this.body.add(bed);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, L), m.planks);
      side.position.set(s * 0.72, 1.1, 0);
      this.body.add(side);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.08), m.planks);
    tail.position.set(0, 1.1, -L / 2);
    this.body.add(tail);
    const wheelAt: [number, number][] = four ? [[-0.85, -0.95], [0.85, -0.95], [-0.85, 0.95], [0.85, 0.95]] : [[-0.85, -0.1], [0.85, -0.1]];
    for (const [x, z] of wheelAt) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.12, 14), m.planks);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.58, z);
      this.body.add(w);
      this.wheels.push(w);
    }
    if (opts.animal !== null) {
      for (const s of [-1, 1]) {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.3), m.timber);
        shaft.position.set(s * 0.45, 0.9, L / 2 + 1.0);
        this.body.add(shaft);
      }
    } else {
      // A handcart: two handles behind instead of shafts.
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.1), m.timber);
        h.position.set(s * 0.55, 0.95, -L / 2 - 0.5);
        this.body.add(h);
      }
    }
    if (opts.hood !== undefined) {
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, L - 0.2, 14, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: opts.hood, roughness: 0.95, side: THREE.DoubleSide }));
      hood.rotation.x = Math.PI / 2;
      hood.position.y = 1.2;
      this.body.add(hood);
    }
    const cargo = opts.cargo ?? 'none';
    if (cargo !== 'none') this.loadCargo(cargo, L, m);
    this.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    if (opts.animal) {
      this.animal = new Animal(scene, opts.animal, { coat: opts.coat }, this.root);
      this.animal.root.position.set(0, 0, L / 2 + 1.9);
    }
  }

  private loadCargo(c: Cargo, L: number, m: WorldMats) {
    const col = new THREE.MeshStandardMaterial({ color: cargoColour[c], roughness: 0.9 });
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, mat: THREE.Material = col) => {
      const o = new THREE.Mesh(g, mat);
      o.position.set(x, y, z);
      this.body.add(o);
    };
    if (c === 'coffin') {
      add(new THREE.BoxGeometry(0.7, 0.5, 1.9), 0, 1.16, 0);
      add(new THREE.BoxGeometry(0.76, 0.06, 1.96), 0, 1.44, 0, new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1 }));
      return;
    }
    for (let i = 0; i < 6; i++) {
      const x = ((i % 2) - 0.5) * 0.6, z = (Math.floor(i / 2) - 1) * (L / 3.4), y = 1.15;
      if (c === 'cabbages') for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.2, 8, 6), x + (k - 1) * 0.15, y + k * 0.12, z + (k % 2) * 0.1);
      else if (c === 'barrels' || c === 'spice') add(new THREE.CylinderGeometry(0.26, 0.28, 0.56, 10), x, y + 0.08, z, c === 'barrels' ? m.planks : col);
      else if (c === 'eggs') add(new THREE.BoxGeometry(0.5, 0.25, 0.4), x, y, z, new THREE.MeshStandardMaterial({ color: 0xb8925a, roughness: 1 }));
      else add(new THREE.BoxGeometry(0.62, 0.42, L / 3.6), x, y + 0.08, z);
    }
    if (c === 'hay' || c === 'wool') add(new THREE.SphereGeometry(0.75, 10, 6).scale(1, 0.55, L / 1.6), 0, 1.55, 0);
  }

  /** Knock a wheel off (it lies beside the cart) or put it back. */
  setBroken(broken: boolean) {
    const w = this.wheels[0];
    if (broken && !this.loose) {
      this.loose = w;
      w.visible = false;
      const lying = new THREE.Mesh(w.geometry, w.material as THREE.Material);
      lying.position.set(-1.6, 0.07, 0.6);
      lying.rotation.set(0, 0.4, 0);
      lying.name = 'looseWheel';
      this.root.add(lying);
      this.body.rotation.z = -0.16;
      this.body.position.y = -0.18;
    } else if (!broken && this.loose) {
      this.loose.visible = true;
      this.root.getObjectByName('looseWheel')?.removeFromParent();
      this.loose = null;
      this.body.rotation.z = 0;
      this.body.position.y = 0;
    }
  }

  /** Bogged down: the bed sinks and tips back into the mud. */
  setStuck(depth: number) {
    this.body.position.y = -depth;
    this.body.rotation.x = depth * 0.35;
  }

  update(dt: number) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.58;
    if (this.animal) {
      this.animal.speed = this.speed;
      this.animal.gait();
      this.animal.update(dt, false);
    }
  }

  dispose() {
    this.animal?.dispose();
    this.scene.remove(this.root);
  }
}

/** A noble's travelling coach: a painted body on four wheels, a coachman's box, two horses abreast. */
export class Carriage {
  readonly root = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private horses: Animal[] = [];
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  /** where a coachman sits (local) */
  static readonly BOX = new THREE.Vector3(0, 1.55, 1.55);

  constructor(private scene: THREE.Scene, m: WorldMats, paint = 0x24467e, trim = 0xd8b04a) {
    scene.add(this.root);
    const body = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.55, metalness: 0.1 });
    const gold = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.35, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5 });
    const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(g, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      this.root.add(o);
      return o;
    };
    add(new THREE.BoxGeometry(1.6, 1.3, 2.2), body, 0, 1.55, -0.2);
    add(new THREE.BoxGeometry(1.75, 0.12, 2.35), gold, 0, 2.26, -0.2);
    add(new THREE.BoxGeometry(1.4, 0.2, 2.0), body, 0, 2.38, -0.2);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.02, 0.5, 0.7), dark, s * 0.81, 1.8, -0.2);
      const crest = add(new THREE.CircleGeometry(0.18, 16), gold, s * 0.815, 1.3, -0.2);
      crest.rotation.y = s * Math.PI / 2;
      for (const z of [-0.85, 0.85]) {
        const lamp = add(new THREE.BoxGeometry(0.12, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.8 }), s * 0.9, 2.0, z);
        void lamp;
      }
    }
    add(new THREE.BoxGeometry(1.3, 0.12, 0.7), m.planks, 0, 1.35, 1.35);
    add(new THREE.BoxGeometry(1.3, 0.5, 0.08), m.planks, 0, 1.1, 1.7);
    add(new THREE.BoxGeometry(1.5, 0.1, 0.5), m.planks, 0, 0.9, -1.55);
    for (const [x, z, r] of [[-0.95, -1.05, 0.62], [0.95, -1.05, 0.62], [-0.95, 0.95, 0.48], [0.95, 0.95, 0.48]]) {
      const w = add(new THREE.CylinderGeometry(r, r, 0.1, 16), gold, x, r, z);
      w.rotation.z = Math.PI / 2;
      this.wheels.push(w);
    }
    add(new THREE.BoxGeometry(0.1, 0.1, 2.4), m.timber, 0, 0.9, 2.6);
    for (const s of [-1, 1]) {
      const h = new Animal(scene, 'horse', { coat: s < 0 ? 'black' : 'grey', saddle: paint }, this.root);
      h.root.position.set(s * 0.55, 0, 3.5);
      this.horses.push(h);
    }
  }

  update(dt: number) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.wheels.forEach((w, i) => (w.rotation.x += (this.speed * dt) / (i < 2 ? 0.62 : 0.48)));
    for (const h of this.horses) {
      h.speed = this.speed;
      h.gait();
      h.update(dt, false);
    }
  }

  dispose() {
    for (const h of this.horses) h.dispose();
    this.scene.remove(this.root);
  }
}

/** Ground point under (x, z). */
export const ground = (x: number, z: number, out = new THREE.Vector3()) => out.set(x, heightAt(x, z), z);

/** Turn smoothly toward a heading. */
export const face = (yaw: number, want: number, dt: number, rate = 6) => dampAngle(yaw, want, rate, dt);

// ---- speech bubbles ----------------------------------------------------------------------------

/** Short lines that pop up over a traveller's head ("Good morrow!"), placed on screen each frame. */
export class BarkLayer {
  private items: { el: HTMLDivElement; at: () => THREE.Vector3 | null; t: number }[] = [];
  private v = new THREE.Vector3();

  constructor(private camera: () => THREE.Camera | null) {}

  say(text: string, at: () => THREE.Vector3 | null, seconds = 3.2) {
    const ui = document.getElementById('ui');
    if (!ui) return;
    // One bubble per speaker position at a time: replace an older one at the same spot.
    const el = document.createElement('div');
    el.className = 'rl-bark';
    el.textContent = text;
    ui.appendChild(el);
    this.items.push({ el, at, t: seconds });
  }

  update(dt: number) {
    const cam = this.camera();
    for (const it of this.items) {
      it.t -= dt;
      const p = it.at();
      if (!cam || !p || it.t <= 0) {
        it.el.style.opacity = '0';
        continue;
      }
      this.v.copy(p).project(cam);
      const behind = this.v.z > 1;
      const x = (this.v.x * 0.5 + 0.5) * window.innerWidth, y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
      it.el.style.opacity = behind ? '0' : String(Math.min(1, it.t * 2));
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const it of this.items) if (it.t <= -0.5) it.el.remove();
    this.items = this.items.filter((it) => it.t > -0.5);
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }
}
