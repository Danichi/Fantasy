import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RIG_PROFILES, detectRigFamily, type RigFamily, type RigProfile } from './rigProfile';
import { buildCharacter, type Look } from '../npc/charBuilder';
import { captureRest, retargetClip, MIXAMO_TO_UE } from '../anim/retarget';

// ---------------------------------------------------------------------------
// Character rig: loads the skinned model plus any animation files listed in
// /assets/character/manifest.json (written by tools/import-mixamo.mjs). Every Mixamo rig
// shares the same bone names, so gameplay code addresses bones by their short
// name ("RightHand", "Spine2") regardless of the "mixamorig1:" style prefix.
// ---------------------------------------------------------------------------

export interface ClipEntry {
  file: string;
  /** name of the clip inside the file (defaults to the first clip) */
  name?: string;
  loop?: boolean;
  /** strip horizontal hips motion at load (locomotion downloaded without "In Place") */
  inPlace?: boolean;
  /** forward root motion as a fraction of hips height (written by the importer) */
  rootMotionRatio?: number;
  /** the same in metres for the loaded character (computed at load) */
  rootMotion?: number;
  /** forward travel over time, 30 fps, as a fraction of hips height */
  rootCurve?: number[];
  /** locomotion: travel speed as a fraction of hips height per second */
  speedRatio?: number;
  /** locomotion: travel direction in the character frame (+X left, +Z forward) */
  dir?: [number, number];
}

export interface CharacterManifest {
  model: string;
  height?: number;
  clips: Record<string, ClipEntry>;
  /** fine tuning for items attached to bones (per character) */
  sockets?: Record<string, { pos?: [number, number, number]; rot?: [number, number, number] }>;
}

const BONE_PREFIX = /^mixamorig\d*[:_]?/;
export const shortBoneName = (n: string) => n.replace(BONE_PREFIX, '');

/** Another body on the hero's skeleton (tools/rig-orcs.mjs), playing the hero's clips. */
export interface BodyOptions {
  /** absolute URL of a model skinned to the hero skeleton (default: the hero's own) */
  model?: string;
  /** standing height to normalise the model's bind pose to (metres); 0 keeps the file's size */
  height?: number;
  /** load only these clips (keys from the manifest) */
  clips?: string[];
}

// Parsed files are shared by every character (each model instance is cloned).
const fileCache = new Map<string, Promise<any>>();
const loadShared = (url: string) => {
  if (!fileCache.has(url)) fileCache.set(url, new GLTFLoader().loadAsync(url));
  return fileCache.get(url)!;
};

export class Character {
  readonly root = new THREE.Group(); // positioned at the feet, yaw only
  readonly visual = new THREE.Group(); // procedural roll/lean/hit offsets go here
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  bones = new Map<string, THREE.Bone>();
  clips = new Map<string, THREE.AnimationClip>();
  clipInfo = new Map<string, ClipEntry>();
  manifest!: CharacterManifest;
  rigFamily: RigFamily = 'generic';
  rigProfile: RigProfile = RIG_PROFILES.generic;
  meshes: THREE.SkinnedMesh[] = [];
  /** standing hips height in metres (after height normalisation) */
  hipsHeight = 1;
  /** built from the stylised kits (Mixamo clips are retargeted onto it) */
  built = false;
  private hipsTrack = 'mixamorigHips.position';

  /**
   * `body`: another model on the hero's Mixamo skeleton (tools/rig-orcs.mjs).
   * `look`: build the body from the stylised character kits instead; the
   * manifest's Mixamo clips are retargeted onto it and its bones are also
   * registered under their Mixamo names.
   */
  async load(base = '/assets/character/', body?: BodyOptions, look?: Look) {
    const res = await fetch(base + 'manifest.json');
    if (!res.ok) throw new Error(`character manifest missing (${res.status})`);
    let manifest: CharacterManifest = await res.json();
    if (body) manifest = { ...manifest, model: body.model ?? manifest.model, height: body.height ?? manifest.height };
    this.manifest = manifest;

    const get = (f: string) => loadShared(f.startsWith('/') ? f : base + f);

    const gltf = await get(manifest.model);
    let mixamoRest: ReturnType<typeof captureRest> | null = null;
    if (look) {
      // The manifest model is still read for its Mixamo rest pose (the clips' source rig).
      mixamoRest = captureRest(gltf.scene, shortBoneName);
      const hero = await buildCharacter(look, [], { merge: false });
      this.model = hero.model;
      this.built = true;
    } else {
      this.model = SkeletonUtils.clone(gltf.scene);
    }
    this.model.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) this.bones.set(shortBoneName(o.name), o as THREE.Bone);
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh || (m as any).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false; // skinned bounds are unreliable once animated
        if (m.isSkinnedMesh) this.meshes.push(m);
        // Own materials: the parsed file is shared, and bodies get tinted or flashed.
        if (!this.built) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats as THREE.MeshStandardMaterial[]) {
          if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 0.9;
        }
      }
    });

    if (this.built) {
      // Gameplay, IK and sockets address bones by Mixamo names.
      for (const [mix, ue] of Object.entries(MIXAMO_TO_UE)) {
        const b = this.bones.get(ue);
        if (b) this.bones.set(mix, b);
      }
      this.hipsTrack = 'pelvis.position';
    }
    this.rigFamily = detectRigFamily(this.bones.keys());
    this.rigProfile = RIG_PROFILES[this.rigFamily];

    // Normalise height so gameplay distances are in real metres. A body
    // rebound onto the hero's skeleton is already in hero metres (height 0):
    // its rest pose may be a crouch, so its bounds say nothing about its size.
    if (body?.height !== 0) {
      this.model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.model);
      const h = box.max.y - box.min.y;
      const target = manifest.height ?? 1.8;
      if (h > 0.01) this.model.scale.multiplyScalar(target / h);
      this.model.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(this.model);
      this.model.position.y -= box2.min.y;
    }

    this.visual.add(this.model);
    this.root.add(this.visual);
    this.mixer = new THREE.AnimationMixer(this.model);

    // Load every clip, remapping bone prefixes to match this model.
    const modelPrefix = this.detectPrefix(this.model);
    if (!this.built) this.hipsTrack = `${modelPrefix}Hips.position`;
    this.model.updateMatrixWorld(true);
    const hipsY = this.bones.get('Hips')?.getWorldPosition(new THREE.Vector3()).y ?? 1;
    this.hipsHeight = hipsY;
    const heroRest = this.built ? captureRest(this.model) : null;
    for (const [key, entry] of Object.entries(manifest.clips)) {
      if (body?.clips && !body.clips.includes(key)) continue;
      try {
        const g = await get(entry.file);
        const src: THREE.AnimationClip | undefined = entry.name
          ? g.animations.find((a: THREE.AnimationClip) => a.name === entry.name)
          : g.animations[0];
        if (!src) continue;
        let clip = this.retarget(src.clone(), mixamoRest ? 'mixamorig' : modelPrefix, !!entry.inPlace);
        if (mixamoRest && heroRest) clip = retargetClip(clip, mixamoRest, heroRest, MIXAMO_TO_UE, { srcName: shortBoneName, hips: 'pelvis' });
        clip.name = key;
        this.clips.set(key, clip);
        this.clipInfo.set(key, {
          ...entry,
          rootMotion: entry.rootMotionRatio !== undefined ? entry.rootMotionRatio * hipsY : undefined,
          rootCurve: entry.rootCurve?.map((v) => v * hipsY), // now in metres
        });
      } catch (e) {
        console.warn('clip failed', key, e);
      }
    }
    this.deriveGroundedClips(modelPrefix);
  }

  private detectPrefix(obj: THREE.Object3D) {
    let prefix = 'mixamorig';
    obj.traverse((o) => {
      if (o.name.endsWith('Hips')) prefix = o.name.slice(0, -4);
    });
    return prefix;
  }

  private retarget(clip: THREE.AnimationClip, prefix: string, inPlace: boolean) {
    clip.tracks = clip.tracks.filter((t) => {
      const [node, prop] = t.name.split('.');
      const short = shortBoneName(node);
      t.name = `${prefix}${short}.${prop}`;
      // Only the hips may translate; other position tracks fight retargeting.
      if (prop === 'position' && short !== 'Hips') return false;
      if (prop === 'scale') return false;
      if (inPlace && short === 'Hips' && prop === 'position') {
        const v = t.values;
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) {
          v[i] = x0;
          v[i + 2] = z0;
        }
      }
      return true;
    });
    return clip;
  }

  private clean: { b: THREE.Bone; p: THREE.Vector3; q: THREE.Quaternion }[] = [];

  /**
   * three.js only writes a bone when the mixed animation value changes, so
   * procedural offsets would pile up on bones whose clip value holds still.
   * Call restore before mixer.update and save right after it.
   */
  restoreCleanPose() {
    for (const c of this.clean) {
      c.b.position.copy(c.p);
      c.b.quaternion.copy(c.q);
    }
  }

  saveCleanPose() {
    if (!this.clean.length) {
      for (const b of this.bones.values()) this.clean.push({ b, p: new THREE.Vector3(), q: new THREE.Quaternion() });
    }
    for (const c of this.clean) {
      c.p.copy(c.b.position);
      c.q.copy(c.b.quaternion);
    }
  }

  /** Advance animation to a clean pose, ready for procedural layers. */
  animate(dt: number) {
    this.restoreCleanPose();
    this.mixer.update(dt);
    this.saveCleanPose();
  }

  /**
   * Physics owns vertical movement for jumps and air attacks, so derive
   * versions of those clips whose hips never rise above standing height
   * (crouches and landings still dip).
   */
  private deriveGroundedClips(prefix: string) {
    const pairs: [string, string][] = [['jump', 'jump_air'], ['attack_leap', 'attack_plunge']];
    for (const [src, dst] of pairs) {
      const clip = this.clips.get(src);
      if (!clip) continue;
      const c = clip.clone();
      c.name = dst;
      const t = c.tracks.find((tr) => tr.name === this.hipsTrack);
      void prefix;
      if (t) {
        const v = t.values;
        const y0 = v[1];
        for (let i = 1; i < v.length; i += 3) v[i] = Math.min(v[i], y0);
      }
      this.clips.set(dst, c);
      this.clipInfo.set(dst, { ...this.clipInfo.get(src)!, loop: false });
    }
  }

  has(clip: string) {
    return this.clips.has(clip);
  }

  bone(name: string) {
    const candidates = [name, ...(this.rigProfile.aliases[name] ?? [])];
    for (const candidate of candidates) {
      const direct = this.bones.get(candidate);
      if (direct) return direct;
      const short = this.bones.get(shortBoneName(candidate));
      if (short) return short;
    }
    return undefined;
  }

  /** Create an attachment point on a bone that ignores the rig's unit scale. */
  socket(boneName: string, id: string) {
    const bone = this.bones.get(boneName);
    if (!bone) throw new Error('missing bone ' + boneName);
    const existing = bone.children.find((c) => c.name === 'socket:' + id);
    if (existing) return existing as THREE.Group;
    const g = new THREE.Group();
    g.name = 'socket:' + id;
    this.model.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    bone.getWorldScale(ws);
    // Remove the character's own world scale; the root may be rescaled later
    // so divide by the rig scale relative to the model root only.
    const rs = this.root.getWorldScale(new THREE.Vector3());
    g.scale.set(rs.x / ws.x, rs.y / ws.y, rs.z / ws.z);
    const tune = this.manifest.sockets?.[id];
    if (tune?.pos) g.position.set(...tune.pos).multiply(g.scale);
    bone.add(g);
    return g;
  }

  /** Length of a bone in metres (distance to its first bone child). */
  boneLength(name: string) {
    const b = this.bones.get(name);
    const child = b?.children.find((c) => (c as THREE.Bone).isBone);
    if (!b || !child) return 0.25;
    this.model.updateMatrixWorld(true);
    const a = b.getWorldPosition(new THREE.Vector3());
    const c = child.getWorldPosition(new THREE.Vector3());
    return a.distanceTo(c) / this.root.getWorldScale(new THREE.Vector3()).y;
  }
}
