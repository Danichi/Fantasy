import * as THREE from 'three';
import { buildCharacter, type BuiltCharacter, type Look } from '../../npc/charBuilder';
import { heightAt } from '../terrainHeight';
import { dampAngle } from '../../core/math';

// A scripted person: the Queen in her palanquin, a crier with his bell, a
// priest at the dawn rite, a thief running for it, the Vizier on a buried
// throne. Built from a Look like any resident (one merged draw call), but
// steered by whoever owns it instead of the schedule system.

const DEFAULT_CLIPS = ['idle', 'walk', 'jog', 'talk', 'cheer', 'dance', 'sit', 'arms', 'crouch', 'drink'];

export class Puppet {
  readonly root = new THREE.Group();
  built: BuiltCharacter | null = null;
  pos: THREE.Vector3;
  yaw = 0;
  /** feet above the ground (riding a palanquin, standing on a dais) */
  lift = 0;
  /** null: follow the ground; a number: stand at exactly this height */
  floorY: number | null = null;
  /** what counts as the ground (the city's paving instead of the terrain under it) */
  ground: (x: number, z: number) => number = heightAt;
  private actions: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  private want = 'idle';
  private wantSpeed = 1;
  private props: { obj: THREE.Object3D; bone: string }[] = [];
  disposed = false;

  constructor(private scene: THREE.Scene, look: Look, at: THREE.Vector3 | [number, number], clips = DEFAULT_CLIPS, yaw = 0) {
    this.pos = Array.isArray(at) ? new THREE.Vector3(at[0], 0, at[1]) : at.clone();
    this.yaw = yaw;
    scene.add(this.root);
    void buildCharacter(look, clips).then((b) => {
      if (this.disposed) return;
      this.built = b;
      const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      for (const a of acts) this.actions[a.getClip().name] = a;
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
      this.root.add(b.root);
      for (const p of this.props) this.mount(p.obj, p.bone);
      this.clip = '';
      this.play(this.want, this.wantSpeed);
      b.mixer.update(Math.random() * 2);
    });
  }

  /** Hold something (a bell, a lantern, a banner pole) in a hand, or at the root ('root'). Replaces what was held. */
  hold(obj: THREE.Object3D, bone = 'hand_r') {
    for (const p of this.props) p.obj.removeFromParent();
    this.props = [{ obj, bone }];
    if (this.built) this.mount(obj, bone);
  }

  private mount(obj: THREE.Object3D, bone: string) {
    const b = this.built!;
    const hand = bone === 'root' ? null : b.bones.get(bone) ?? b.bones.get(bone === 'hand_r' ? 'Hand_R' : 'Hand_L') ?? null;
    if (hand) {
      obj.scale.setScalar(1 / b.root.scale.x);
      hand.add(obj);
    } else this.root.add(obj);
  }

  play(name: string, speed = 1) {
    this.want = name;
    this.wantSpeed = speed;
    const next = this.actions[name] ?? this.actions.idle;
    if (!next) return;
    next.setEffectiveTimeScale(speed);
    if (this.clip === name) return;
    const prev = this.actions[this.clip];
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.25, false);
    this.clip = name;
  }

  /** Walk toward a point at `speed` m/s; true once there (within `near`). */
  walkTo(x: number, z: number, speed: number, dt: number, near = 0.4) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d <= near) return true;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.play(speed > 2.4 ? 'jog' : 'walk', speed > 2.4 ? speed / 3.6 : speed / 1.15);
    return false;
  }

  face(x: number, z: number, dt: number, rate = 5) {
    this.yaw = dampAngle(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  update(dt: number) {
    this.pos.y = (this.floorY ?? this.ground(this.pos.x, this.pos.z)) + this.lift;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.built?.mixer.update(dt);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.built?.mixer.stopAllAction();
    this.scene.remove(this.root);
  }
}

/** Looks for the city's scripted crowd. */
export const LOOKS = {
  guard: (f = false): Look => ({ body: f ? 'female' : 'male', outfit: 'ranger', hair: f ? 'buns' : 'buzzed', beard: !f, hairColor: 0x1a1410, skin: 0x8a5a3a, cloth: 0xd4a640, pauldron: true, bracers: true, hood: false, height: f ? 1.74 : 1.86 }),
  priest: (k = 0): Look => ({ body: k % 3 === 1 ? 'female' : 'male', outfit: 'peasant', hood: true, hair: null, skin: [0x8a5a3a, 0x7a4e32, 0xa8744e][k % 3], linen: 0xfaf2dc, cloth: 0xd4a640, height: 1.72 + (k % 2) * 0.08 }),
  bearer: (k = 0): Look => ({ body: 'male', outfit: 'peasant', hood: false, hair: 'buzzed', beard: k % 2 === 0, hairColor: 0x120c08, skin: [0x6a4028, 0x7a4e32][k % 2], linen: 0xe8dcc0, cloth: 0x1f7a7a, height: 1.84 }),
  herald: (): Look => ({ body: 'male', outfit: 'peasant', hair: 'buzzed', skin: 0x8a5a3a, linen: 0xfaf2dc, cloth: 0x1f7a7a, height: 1.76 }),
  musician: (k = 0): Look => ({ body: k % 2 ? 'female' : 'male', outfit: 'peasant', hood: k % 3 === 0, hair: k % 2 ? 'long' : 'simpleparted', beard: k % 2 === 0, hairColor: 0x1a1410, skin: [0xa8744e, 0x7a4e32, 0x8a5a3a][k % 3], linen: 0xf0e4c8, cloth: [0xb8402e, 0x5a2a7a, 0x2a5a8a][k % 3], height: k % 2 ? 1.64 : 1.76 }),
  child: (k = 0): Look => ({ body: k % 2 ? 'female' : 'male', outfit: 'peasant', hood: false, hair: k % 2 ? 'buns' : 'buzzed', hairColor: 0x120c08, skin: [0xa8744e, 0x7a4e32, 0xc08a5a][k % 3], linen: 0xe8dcc0, cloth: [0x1f7a7a, 0xb86a2a, 0x2a5a8a][k % 3], height: 1.18 + (k % 3) * 0.06 }),
  dancer: (): Look => ({ body: 'female', outfit: 'peasant', hood: false, hair: 'long', hairColor: 0x120c08, skin: 0xa8744e, linen: 0xd4a640, cloth: 0xb8402e, height: 1.66 }),
  crier: (k = 0): Look => ({ body: 'male', outfit: 'peasant', hood: false, hair: k ? 'buzzed' : 'simpleparted', beard: true, hairColor: 0x2a1a10, skin: 0x8a5a3a, linen: 0xf2e6c8, cloth: k ? 0x8a2a2a : 0x1f7a7a, height: 1.78 }),
  assassin: (k = 0): Look => ({ body: k % 3 === 1 ? 'female' : 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: false, hairColor: 0x120c08, skin: [0x7a4e32, 0x8a5a3a][k % 2], cloth: 0x3a1a4a, linen: 0x2a2030, bracers: true, height: 1.74 + (k % 2) * 0.08 }),
  enforcer: (k = 0): Look => ({ body: 'male', outfit: 'ranger', hood: k % 2 === 0, hair: 'buzzed', beard: k % 3 !== 0, hairColor: 0x1a1410, skin: [0x8a5a3a, 0x6a4028, 0xa8744e][k % 3], cloth: 0x5a2a7a, linen: 0x8a7a60, pauldron: k % 2 === 1, bracers: true, height: 1.8 + (k % 3) * 0.04 }),
};
