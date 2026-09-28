import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Character rig: loads the skinned model plus any animation files listed in
// /assets/character/manifest.json (written by tools/import-mixamo.mjs). With no
// manifest it falls back to the three.js Xbot placeholder. Every Mixamo rig
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
  /** extracted forward root motion in metres, written by the importer */
  rootMotion?: number;
}

export interface CharacterManifest {
  model: string;
  height?: number;
  clips: Record<string, ClipEntry>;
  /** fine tuning for items attached to bones (per character) */
  sockets?: Record<string, { pos?: [number, number, number]; rot?: [number, number, number] }>;
}

const FALLBACK: CharacterManifest = {
  model: 'Xbot.glb',
  height: 1.8,
  clips: {
    idle: { file: 'Xbot.glb', name: 'idle', loop: true },
    walk: { file: 'Xbot.glb', name: 'walk', loop: true },
    run: { file: 'Xbot.glb', name: 'run', loop: true },
  },
};

const BONE_PREFIX = /^mixamorig\d*[:_]?/;
export const shortBoneName = (n: string) => n.replace(BONE_PREFIX, '');

export class Character {
  readonly root = new THREE.Group(); // positioned at the feet, yaw only
  readonly visual = new THREE.Group(); // procedural roll/lean/hit offsets go here
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  bones = new Map<string, THREE.Bone>();
  clips = new Map<string, THREE.AnimationClip>();
  clipInfo = new Map<string, ClipEntry>();
  manifest!: CharacterManifest;
  usingPlaceholder = true;
  meshes: THREE.SkinnedMesh[] = [];

  async load(base = '/assets/character/') {
    let manifest = FALLBACK;
    try {
      const res = await fetch(base + 'manifest.json');
      if (res.ok && res.headers.get('content-type')?.includes('json')) {
        manifest = await res.json();
        this.usingPlaceholder = false;
      }
    } catch {}
    this.manifest = manifest;

    const loader = new GLTFLoader();
    const cache = new Map<string, Promise<any>>();
    const get = (f: string) => {
      if (!cache.has(f)) cache.set(f, loader.loadAsync(base + f));
      return cache.get(f)!;
    };

    const gltf = await get(manifest.model);
    this.model = gltf.scene;
    this.model.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) this.bones.set(shortBoneName(o.name), o as THREE.Bone);
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh || (m as any).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false; // skinned bounds are unreliable once animated
        if (m.isSkinnedMesh) this.meshes.push(m);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats as THREE.MeshStandardMaterial[]) {
          if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 0.9;
        }
      }
    });

    // Normalise height so gameplay distances are in real metres.
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const h = box.max.y - box.min.y;
    const target = manifest.height ?? 1.8;
    if (h > 0.01) this.model.scale.multiplyScalar(target / h);
    this.model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(this.model);
    this.model.position.y -= box2.min.y;

    this.visual.add(this.model);
    this.root.add(this.visual);
    this.mixer = new THREE.AnimationMixer(this.model);

    // Load every clip, remapping bone prefixes to match this model.
    const modelPrefix = this.detectPrefix(this.model);
    for (const [key, entry] of Object.entries(manifest.clips)) {
      try {
        const g = await get(entry.file);
        const src: THREE.AnimationClip | undefined = entry.name
          ? g.animations.find((a: THREE.AnimationClip) => a.name === entry.name)
          : g.animations[0];
        if (!src) continue;
        const clip = this.retarget(src.clone(), modelPrefix, !!entry.inPlace);
        clip.name = key;
        this.clips.set(key, clip);
        this.clipInfo.set(key, entry);
      } catch (e) {
        console.warn('clip failed', key, e);
      }
    }
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

  has(clip: string) {
    return this.clips.has(clip);
  }

  bone(name: string) {
    return this.bones.get(name);
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
