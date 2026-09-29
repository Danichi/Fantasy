import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { heightAt } from './terrainHeight';
import { road, roadLength, pointAlong } from './roadNetwork';
import { buildCharacter, type Look, type BuiltCharacter } from '../npc/charBuilder';
import { dampAngle } from '../core/math';
import type { WorldMats } from './buildings';
import type { WorldTime } from './worldTime';

// Caravans (World Expansion phase 4, prompt §44): merchant wagons that run
// the King's Road between Elder Glen, the Wayfarer's Rest and Port Aurelle.
// Far away a caravan is just a number (distance along the road, from the
// clock); near the player it materialises as a real wagon pulled by a horse,
// with a driver and outriders. The escort quest drives one wagon by hand.

const loader = new GLTFLoader();
let horseGltf: Promise<GLTF> | null = null;

/** A painted wagon with a canvas hood, pulled by an animated horse. */
export class Wagon {
  root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private clip = '';
  private wheels: THREE.Mesh[] = [];
  s = 0;
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;

  constructor(private scene: THREE.Scene, m: WorldMats, hood = 0xe8dcc0) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 3.2), m.planks);
    bed.position.y = 1.05;
    const hoodM = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3, 14, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: hood, roughness: 0.95, side: THREE.DoubleSide }));
    hoodM.rotation.x = Math.PI / 2;
    hoodM.position.y = 1.3;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), m.timber);
    shaft.position.set(0, 0.95, 2.6);
    this.root.add(bed, hoodM, shaft);
    for (const [x, z] of [[-0.95, -1.1], [0.95, -1.1], [-0.95, 1.1], [0.95, 1.1]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14), m.planks);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.62, z);
      this.root.add(w);
      this.wheels.push(w);
    }
    // Goods: barrels and sacks in the back.
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.6, 10), m.planks);
      b.position.set(-0.4 + k * 0.4, 1.6, -1.2);
      this.root.add(b);
    }
    this.root.traverse((o) => (o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)));
    scene.add(this.root);
    void (horseGltf ??= loader.loadAsync('/assets/animals/horse.glb')).then((g) => {
      const h = SkeletonUtils.clone(g.scene);
      const box = new THREE.Box3().setFromObject(g.scene);
      h.scale.setScalar(1.7 / (box.max.y - box.min.y));
      h.position.set(0, 0, 4.1);
      h.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      this.root.add(h);
      this.mixer = new THREE.AnimationMixer(h);
      for (const c of g.animations) this.actions.set(c.name, this.mixer.clipAction(c));
    });
  }

  private play(n: string, speed = 1) {
    const a = this.actions.get(n);
    if (!a) return;
    a.setEffectiveTimeScale(speed);
    if (this.clip === n) return;
    const prev = this.actions.get(this.clip);
    a.reset().play();
    if (prev) prev.crossFadeTo(a, 0.3, false);
    this.clip = n;
  }

  /** Place the wagon at distance `s` along the King's Road, travelling `dir`. */
  place(s: number, dir: 1 | -1, dt: number) {
    const kr = road('kings');
    this.s = s;
    const p = pointAlong(kr, s);
    const side = new THREE.Vector2(-p.dir.y, p.dir.x).multiplyScalar(-dir * 1.6);
    this.pos.set(p.x + side.x, 0, p.z + side.y);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.yaw = dampAngle(this.yaw, Math.atan2(p.dir.x * dir, p.dir.y * dir), 4, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.62;
    if (this.speed > 0.2) this.play('Walk', this.speed / 1.6);
    else this.play('Idle');
    this.mixer?.update(dt);
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

/** A person who walks (or jogs) after the player: escorts, rescued pilgrims. */
export class Follower {
  built: BuiltCharacter | null = null;
  pos: THREE.Vector3;
  yaw = 0;
  following = false;
  private clip = '';
  private actions: Record<string, THREE.AnimationAction> = {};

  constructor(private scene: THREE.Scene, look: Look, at: THREE.Vector3, readonly name: string) {
    this.pos = at.clone();
    void buildCharacter(look, ['walk', 'jog', 'idle', 'sit', 'cheer']).then((b) => {
      this.built = b;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      for (const a of acts) this.actions[a.getClip().name] = a;
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      scene.add(b.root);
    });
  }

  play(n: string) {
    if (this.clip === n) return;
    const next = this.actions[n];
    if (!next) return;
    const prev = this.actions[this.clip];
    next.reset().play();
    if (prev) prev.crossFadeTo(next, 0.25, false);
    this.clip = n;
  }

  update(dt: number, target: THREE.Vector3, idle = 'idle') {
    if (this.following) {
      const to = target.clone().sub(this.pos).setY(0);
      const d = to.length();
      if (d > 2.6) {
        const sp = d > 9 ? 4.8 : 1.6;
        this.yaw = dampAngle(this.yaw, Math.atan2(to.x, to.z), 8, dt);
        this.pos.addScaledVector(to.normalize(), Math.min(d - 2.4, sp * dt));
        this.play(sp > 3 ? 'jog' : 'walk');
      } else this.play('idle');
    } else this.play(idle);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    if (this.built) {
      this.built.root.position.copy(this.pos);
      this.built.root.rotation.y = this.yaw;
      this.built.mixer.update(dt);
    }
  }

  dispose() {
    if (this.built) this.scene.remove(this.built.root);
  }
}

/** The regular merchant caravans: abstract far away, a real wagon near the player. */
export class Caravans {
  private wagons = new Map<number, Wagon>();
  private riders = new Map<number, Follower[]>();
  private len = roadLength(road('kings'));

  constructor(private scene: THREE.Scene, private m: WorldMats, private time: WorldTime) {}

  /** Two caravans shuttle the whole road, each round trip taking a game day. */
  private where(k: number): { s: number; dir: 1 | -1; resting: boolean } {
    const t = ((this.time.day * 24 + this.time.hour) / 24 + k * 0.5) % 1;
    // Out 45% of the day, rest at Port Aurelle 5%, back 45%, rest in Elder Glen 5%.
    if (t < 0.45) return { s: 120 + (t / 0.45) * (this.len - 300), dir: 1, resting: false };
    if (t < 0.5) return { s: this.len - 180, dir: 1, resting: true };
    if (t < 0.95) return { s: this.len - 180 - ((t - 0.5) / 0.45) * (this.len - 300), dir: -1, resting: false };
    return { s: 120, dir: -1, resting: true };
  }

  /** Where each caravan is (for the map, the economy, and quests). */
  positions() {
    return [0, 1].map((k) => {
      const w = this.where(k);
      const p = pointAlong(road('kings'), w.s);
      return { id: k, x: p.x, z: p.z, ...w };
    });
  }

  update(dt: number, player: THREE.Vector3) {
    const kr = road('kings');
    for (const c of this.positions()) {
      const near = Math.hypot(c.x - player.x, c.z - player.z) < 220 && !c.resting;
      let w = this.wagons.get(c.id);
      if (near && !w) {
        w = new Wagon(this.scene, this.m, c.id ? 0x2f5f9a : 0xb8402e);
        this.wagons.set(c.id, w);
        const looks: Look[] = [
          { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xe0b894, cloth: 0x3a5f9e, pauldron: true, height: 1.82 },
          { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x1f1a17, skin: 0xa8744e, cloth: 0x3a5f9e, height: 1.72 },
        ];
        this.riders.set(c.id, looks.map((l, i) => new Follower(this.scene, l, new THREE.Vector3(c.x, 0, c.z), i ? 'Caravan guard' : 'Caravan master')));
      } else if (!near && w) {
        w.dispose();
        this.wagons.delete(c.id);
        for (const r of this.riders.get(c.id) ?? []) r.dispose();
        this.riders.delete(c.id);
      }
      if (!w) continue;
      // Caravans pause when the player stands right in front of them.
      w.speed = c.resting ? 0 : 2.4;
      w.place(c.s, c.dir, dt);
      const riders = this.riders.get(c.id)!;
      riders.forEach((r, i) => {
        r.following = false;
        const back = pointAlong(kr, c.s - c.dir * (4 + i * 2));
        const side = new THREE.Vector2(-back.dir.y, back.dir.x).multiplyScalar(-c.dir * (i ? 3.4 : 0.2));
        const t = new THREE.Vector3(back.x + side.x, 0, back.z + side.y);
        r.yaw = w!.yaw;
        r.pos.lerp(t, Math.min(1, dt * 4));
        r.update(dt, t, w!.speed > 0.2 ? 'walk' : 'idle');
      });
    }
  }

  setVisible(v: boolean) {
    for (const w of this.wagons.values()) w.root.visible = v;
    for (const rs of this.riders.values()) for (const r of rs) if (r.built) r.built.root.visible = v;
  }
}
