import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { physics } from '../physics/physics';
import { heightAt } from '../world/terrain';
import { rotateWorld } from '../player/ik';
import { damp } from '../core/math';
import type { CombatStyleId } from '../progression/styles';
import { buildCharacter, type Look } from './charBuilder';

// ---------------------------------------------------------------------------
// Town NPCs. Three kinds of body:
//   clip     rigged and animated (Mr. Fröst's own Shop_Idle)
//   rigged   rigged but without clips (Kaela): arms lowered from the A-pose,
//            breathing through the spine, head turns toward you
//   statue   a sculpted, unrigged figure (Magus, Ser Corvin): a breathing
//            swell through the chest from the vertex shader
// Each NPC stands on a collider, shows a name tag, and can be talked to.
// ---------------------------------------------------------------------------

export interface NpcSpec {
  id: string;
  name: string;
  title: string;
  file: string;
  height: number;
  pos: [number, number];
  yaw: number;
  kind: 'clip' | 'rigged' | 'statue' | 'built';
  /** built: assembled from the stylised character kits (src/npc/cast.ts) */
  look?: Look;
  clip?: string;
  /** rigged: bone names for arms/spine/head */
  bones?: { upperArmL: string; upperArmR: string; spine: string[]; head: string };
  /** A-pose arm drop (radians) */
  armDrop?: number;
  greeting: string;
  lines: { q: string; a: string }[];
  trainerStyle?: CombatStyleId;
  magicTrainer?: boolean;
}

const loader = new GLTFLoader();

export class NPC {
  readonly root = new THREE.Group();
  readonly pos: THREE.Vector3;
  private mixer: THREE.AnimationMixer | null = null;
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private rest = new Map<THREE.Object3D, THREE.Quaternion>();
  private uniforms = { uBreath: { value: 0 } };
  private t = Math.random() * 10;
  private headYaw = 0;
  private idleAction: THREE.AnimationAction | null = null;
  private talkAction: THREE.AnimationAction | null = null;
  private talking = false;
  /** seconds left in the talking animation (refreshed by each dialogue line) */
  talkT = 0;
  loaded: Promise<void>;

  constructor(readonly spec: NpcSpec, scene: THREE.Scene) {
    const [x, z] = spec.pos;
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = spec.yaw;
    scene.add(this.root);
    physics.addCylinder(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 1, 0.38);
    this.loaded = this.load();
  }

  private async load() {
    if (this.spec.kind === 'built' && this.spec.look) {
      const c = await buildCharacter(this.spec.look, ['idle', 'talk']);
      this.root.add(c.root);
      this.mixer = c.mixer;
      const acts = (c.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      this.idleAction = acts.find((a) => a.getClip().name === 'idle') ?? null;
      this.talkAction = acts.find((a) => a.getClip().name === 'talk') ?? null;
      // Offset each NPC's idle so the town doesn't breathe in unison.
      if (this.idleAction) this.idleAction.play().time = Math.random() * 3;
      this.bones = { head: c.bones.get('Head') };
      return;
    }
    const g = await loader.loadAsync(`/assets/npc/${this.spec.file}`);
    const model = g.scene;
    // Normalise height, feet on the ground, centred on the origin.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const k = this.spec.height / (box.max.y - box.min.y);
    model.scale.multiplyScalar(k);
    model.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(model);
    const c = b2.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= b2.min.y;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      if (this.spec.kind === 'statue') this.breathe(m, b2.min.y, b2.max.y);
    });
    this.root.add(model);
    if (this.spec.kind === 'clip' && this.spec.clip) {
      this.mixer = new THREE.AnimationMixer(model);
      const clip = g.animations.find((a) => a.name === this.spec.clip) ?? g.animations[0];
      if (clip) this.mixer.clipAction(clip).play();
    }
    if (this.spec.kind === 'rigged' && this.spec.bones) {
      const bn = this.spec.bones;
      const find = (n: string) => model.getObjectByName(n);
      this.bones = { armL: find(bn.upperArmL), armR: find(bn.upperArmR), head: find(bn.head) };
      bn.spine.forEach((n, i) => (this.bones['spine' + i] = find(n)));
      for (const b of Object.values(this.bones)) if (b) this.rest.set(b, b.quaternion.clone());
    }
  }

  /** Statues: gently swell the chest (object-space height band) in and out. */
  private breathe(m: THREE.Mesh, minY: number, maxY: number) {
    const mat = (m.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
    const H = maxY - minY;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uBreath = this.uniforms.uBreath;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBreath;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            float h = (wp.y - ${minY.toFixed(3)}) / ${H.toFixed(3)};
            // Chest band rises and widens a touch on each breath.
            float band = smoothstep(0.52, 0.66, h) * (1.0 - smoothstep(0.78, 0.88, h));
            transformed += normal * band * uBreath * 0.012;
            transformed.y += smoothstep(0.55, 0.9, h) * uBreath * 0.006 / ${Math.max(0.001, m.getWorldScale(new THREE.Vector3()).y).toFixed(4)};
          }`,
        );
    };
    m.material = mat;
  }

  /** Nameplate anchor (world). */
  get head() {
    return this.pos.clone().setY(this.pos.y + this.spec.height + 0.3);
  }

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    this.uniforms.uBreath.value = Math.sin(this.t * 1.6) * 0.5 + 0.5;
    if (this.spec.kind === 'built') {
      this.talkT = Math.max(0, this.talkT - dt);
      const want = this.talkT > 0;
      if (want !== this.talking && this.idleAction && this.talkAction) {
        this.talking = want;
        const [from, to] = want ? [this.idleAction, this.talkAction] : [this.talkAction, this.idleAction];
        to.reset().play();
        from.crossFadeTo(to, 0.4, false);
      }
      this.mixer?.update(dt);
      // Turn the head toward the player when close (on top of the clip).
      const to = player.clone().sub(this.pos);
      const yawTo = Math.atan2(to.x, to.z) - this.root.rotation.y;
      const wantYaw = to.length() < 7 ? Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(yawTo), Math.cos(yawTo)))) : 0;
      this.headYaw = damp(this.headYaw, wantYaw, 4, dt);
      if (this.bones.head) rotateWorld(this.bones.head, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.headYaw * 0.75));
      return;
    }
    this.mixer?.update(dt);
    if (this.spec.kind !== 'rigged' || !this.rest.size) return;
    // Restore the rest pose, then layer the idle on top.
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ);
    const up = new THREE.Vector3(0, 1, 0);
    // Lower the arms from the A-pose: turn each upper arm's own direction
    // (shoulder -> elbow) most of the way toward straight down. Works for any
    // model orientation.
    const drop = this.spec.armDrop ?? 0.9;
    const sway = Math.sin(this.t * 1.6) * 0.03;
    const down = new THREE.Vector3(0, -1, 0);
    // The next limb segment: the farthest child bone (rigs also hang twist
    // and helper bones right at the joint).
    const next = (bone: THREE.Object3D) => {
      const o = bone.getWorldPosition(new THREE.Vector3());
      let best: THREE.Object3D | undefined, bd = -1;
      for (const c of bone.children) {
        if (!(c as THREE.Bone).isBone) continue;
        const d = c.getWorldPosition(new THREE.Vector3()).distanceTo(o);
        if (d > bd) (bd = d), (best = c);
      }
      return best;
    };
    const aim = (bone: THREE.Object3D, want: THREE.Vector3) => {
      const child = next(bone);
      if (!child) return;
      const dir = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
      rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(dir, dir.clone().lerp(want, Math.min(1, drop)).normalize()));
    };
    for (const key of ['armL', 'armR']) {
      const arm = this.bones[key];
      const elbow = arm && next(arm);
      if (!arm || !elbow) continue;
      // Outward = the A-pose arm's horizontal direction (away from the body).
      const a = arm.getWorldPosition(new THREE.Vector3());
      const out = elbow.getWorldPosition(new THREE.Vector3()).sub(a).setY(0).normalize();
      aim(arm, down.clone().addScaledVector(out, 0.22 + sway).addScaledVector(fwd, 0.04).normalize());
      // Forearm hangs with a relaxed bend forward.
      aim(elbow, down.clone().addScaledVector(fwd, 0.32).addScaledVector(out, 0.08).normalize());
    }
    for (let i = 0; this.bones['spine' + i]; i++) {
      rotateWorld(this.bones['spine' + i]!, new THREE.Quaternion().setFromAxisAngle(left, Math.sin(this.t * 1.6) * 0.012));
    }
    // Look toward the player when close.
    const to = player.clone().sub(this.pos);
    const d = to.length();
    const yawTo = Math.atan2(to.x, to.z) - this.root.rotation.y;
    const want = d < 7 ? Math.max(-1, Math.min(1, Math.atan2(Math.sin(yawTo), Math.cos(yawTo)))) : 0;
    this.headYaw = damp(this.headYaw, want, 4, dt);
    if (this.bones.head) rotateWorld(this.bones.head, new THREE.Quaternion().setFromAxisAngle(up, this.headYaw * 0.8));
  }
}
