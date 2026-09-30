import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { captureRest, retargetClip, HUMANOID_TO_UE } from '../anim/retarget';
import { characterAtlas, mergeParts, DYE_FNS, dyeBlock, dyeUniforms } from './charMerge';

// Storybook cast builder (docs/ART-DIRECTION.md §7). Characters are assembled
// from Quaternius' CC0 kits: a Fantasy outfit (clothed body on the shared
// 65-bone rig) plus a head, eyes and brows from the Universal Base Character
// and a hairstyle. The head and hair come from rigs with other proportions, so
// their vertices are re-bound onto the outfit's skeleton: each vertex keeps its
// offset from every bone that influences it, measured in the rest pose.
//
// Each named character gets a signature colour: saturated cloth is hue-rotated
// toward it and pale linen is dyed with it.

const BASE = '/assets/characters/';
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const load = (file: string) => {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(BASE + file));
  return cache.get(file)!;
};

export type Hair = 'long' | 'buns' | 'buzzed' | 'buzzedfemale' | 'simpleparted' | null;

export interface Look {
  body: 'female' | 'male';
  outfit: 'peasant' | 'ranger';
  hood?: boolean;
  pauldron?: boolean;
  bracers?: boolean;
  hair?: Hair;
  beard?: boolean;
  /** multiplies the skin texture (1,1,1 = as painted) */
  skin?: number;
  hairColor?: number;
  /** signature colour: saturated cloth is hue-rotated toward it */
  cloth?: number;
  /** pale linen is dyed toward this */
  linen?: number;
  /** standing height in metres */
  height?: number;
}

export interface BuiltCharacter {
  root: THREE.Group; // feet at the origin, facing +Z
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  bones: Map<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
}

// ---- re-binding skinned geometry onto another skeleton -----------------------------

/**
 * Move `src` (skinned to its own skeleton) onto `dst`'s skeleton.
 * Works in bind space: a vertex keeps its offset from each influencing bone's
 * bind frame (the frames the skinning shader itself uses), so differing rest
 * poses and proportions between the rigs don't matter.
 * `keep` filters triangles by their bind-space positions on the new rig.
 */
function rebind(src: THREE.SkinnedMesh, dst: THREE.SkinnedMesh, keep?: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean) {
  const sBones = src.skeleton.bones;
  const dBones = dst.skeleton.bones;
  const dIndex = new Map(dBones.map((b, i) => [b.name, i]));
  const dBindWorld = dst.skeleton.boneInverses.map((m) => m.clone().invert());
  const dBindInv = dst.bindMatrix.clone().invert();
  // Per source bone: source bind space -> destination bind space (same bone name).
  const xf = sBones.map((b, i) => {
    const di = dIndex.get(b.name);
    return di === undefined ? null : { di, m: dBindWorld[di].clone().multiply(src.skeleton.boneInverses[i]) };
  });

  const g = src.geometry.index ? src.geometry.toNonIndexed() : src.geometry.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const si = g.attributes.skinIndex as THREE.BufferAttribute;
  const sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const n = pos.count;
  const outP = new Float32Array(n * 3), outN = new Float32Array(n * 3), outI = new Uint16Array(n * 4), outW = new Float32Array(n * 4);
  const bindPos = new Float32Array(n * 3);
  const v0 = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3(), nAcc = new THREE.Vector3(), nTmp = new THREE.Vector3();
  const m3 = new THREE.Matrix3();
  // Normals go through the same chain as positions: mesh -> source bind space
  // -> destination bind space -> destination mesh space.
  const srcBindN = new THREE.Matrix3().setFromMatrix4(src.bindMatrix);
  const dstBindInvN = new THREE.Matrix3().setFromMatrix4(dBindInv);
  const headIndex = dIndex.get('Head') ?? 0;
  for (let v = 0; v < n; v++) {
    v0.fromBufferAttribute(pos, v).applyMatrix4(src.bindMatrix);
    acc.set(0, 0, 0);
    nAcc.set(0, 0, 0);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      const x = w > 0 ? xf[si.getComponent(v, k)] : null;
      outI[v * 4 + k] = x ? x.di : 0;
      outW[v * 4 + k] = x ? w : 0;
      if (!x) continue;
      acc.addScaledVector(tmp.copy(v0).applyMatrix4(x.m), w);
      nAcc.addScaledVector(nTmp.fromBufferAttribute(nor, v).applyMatrix3(srcBindN).applyMatrix3(m3.setFromMatrix4(x.m)), w);
      total += w;
    }
    if (total > 0) {
      acc.divideScalar(total);
      for (let k = 0; k < 4; k++) outW[v * 4 + k] /= total;
    } else {
      acc.copy(v0);
      outI[v * 4] = headIndex;
      outW[v * 4] = 1;
    }
    acc.toArray(bindPos, v * 3);
    acc.applyMatrix4(dBindInv).toArray(outP, v * 3);
    if (total === 0) nAcc.fromBufferAttribute(nor, v).applyMatrix3(srcBindN);
    nAcc.applyMatrix3(dstBindInvN).normalize().toArray(outN, v * 3);
  }

  let keepTri: number[] | null = null;
  if (keep) {
    keepTri = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) {
      a.fromArray(bindPos, t * 3);
      b.fromArray(bindPos, t * 3 + 3);
      c.fromArray(bindPos, t * 3 + 6);
      if (keep(a, b, c)) keepTri.push(t);
    }
  }
  const pick = <T extends Float32Array | Uint16Array>(arr: T, size: number, Ctor: new (n: number) => T): T => {
    if (!keepTri) return arr;
    const out = new Ctor(keepTri.length * 3 * size);
    keepTri.forEach((t, j) => out.set(arr.subarray(t * size, (t + 3) * size), j * 3 * size));
    return out;
  };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pick(outP, 3, Float32Array), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(pick(outN, 3, Float32Array), 3));
  if (g.attributes.uv) {
    const uv = (g.attributes.uv as THREE.BufferAttribute).array as Float32Array;
    geo.setAttribute('uv', new THREE.BufferAttribute(pick(new Float32Array(uv), 2, Float32Array), 2));
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(pick(outI, 4, Uint16Array), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(pick(outW, 4, Float32Array), 4));
  const mat = (src.material as THREE.MeshStandardMaterial).clone();
  // The rebuilt geometry has no vertex colours; a material still expecting
  // them would read black.
  mat.vertexColors = false;
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = src.name + ':rebound';
  mesh.bind(dst.skeleton, dst.bindMatrix);
  return mesh;
}

// Building a townsperson used to redo the same heavy work every time: re-binding
// the head and hair onto the outfit rig, measuring the skinned model vertex by
// vertex for its height, and retargeting every clip. All of it depends only on
// the kit pieces, so it is done once per combination and shared.
const reboundCache = new Map<string, THREE.SkinnedMesh>();
function rebindShared(key: string, src: THREE.SkinnedMesh, dst: THREE.SkinnedMesh, keep?: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean) {
  let proto = reboundCache.get(key);
  if (!proto) {
    proto = rebind(src, dst, keep);
    reboundCache.set(key, proto);
  }
  // Shared geometry (never disposed), own material, bound to this character's skeleton.
  const mesh = new THREE.SkinnedMesh(proto.geometry, (proto.material as THREE.Material).clone());
  mesh.name = proto.name;
  mesh.bind(dst.skeleton, dst.bindMatrix);
  return mesh;
}
const heightCache = new Map<string, number>();
const restCache = new Map<string, ReturnType<typeof captureRest>>();
const retargetCache = new Map<string, THREE.AnimationClip>();

// ---- recolouring --------------------------------------------------------------------

function recolor(mat: THREE.MeshStandardMaterial, hue: THREE.Color | null, linen: THREE.Color | null) {
  const u = dyeUniforms(hue, linen);
  mat.userData.dye = true; // merged characters dye these parts per vertex (charMerge)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${DYE_FNS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${dyeBlock('1.0')}`);
  };
  mat.customProgramCacheKey = () => 'recolor';
}

// ---- animation clips --------------------------------------------------------------

const CLIP_FILES: Record<string, string> = {
  idle: '/assets/anims/idle.glb',
  idle_tired: '/assets/anims/idle_tired.glb',
  talk: '/assets/anims/talk.glb',
  walk: '/assets/anims/walk.glb',
  sit: '/assets/anims/sit.glb',
  farm: '/assets/anims/farm.glb',
  water: '/assets/anims/water.glb',
  chop: '/assets/anims/chop.glb',
  cheer: '/assets/anims/cheer.glb',
  drink: '/assets/anims/drink.glb',
  arms: '/assets/anims/arms.glb',
  fix: '/assets/anims/fix.glb',
  dance: '/assets/anims/dance.glb',
  crouch: '/assets/anims/crouch.glb',
  // Combat and work clips (phase 4): bandits, foraging, farming, fishing.
  ...Object.fromEntries(['sword_idle', 'sword_attack', 'sword_combo', 'hit', 'death', 'jog', 'bow_aim', 'bow_shoot', 'pickup', 'harvest', 'plant', 'watering', 'pick_tree', 'fish_cast', 'fish_idle', 'fish_reel'].map((k) => [k, `/assets/anims/${k}.glb`])),
};
const clipCache = new Map<string, Promise<{ clip: THREE.AnimationClip; rest: ReturnType<typeof captureRest> } | null>>();
function loadClip(key: string) {
  if (!clipCache.has(key)) {
    clipCache.set(key, loader.loadAsync(CLIP_FILES[key]).then((g) => {
      const clip = g.animations[0];
      if (!clip) return null;
      return { clip, rest: captureRest(g.scene) };
    }).catch(() => null));
  }
  return clipCache.get(key)!;
}

// ---- assembly -----------------------------------------------------------------------

const HAIR_FILE: Record<Exclude<Hair, null>, string> = {
  long: 'hair_long.glb', buns: 'hair_buns.glb', buzzed: 'hair_buzzed.glb', buzzedfemale: 'hair_buzzedfemale.glb', simpleparted: 'hair_simpleparted.glb',
};

const firstSkinned = (o: THREE.Object3D) => {
  let found: THREE.SkinnedMesh | null = null;
  o.traverse((c) => {
    if (!found && (c as THREE.SkinnedMesh).isSkinnedMesh) found = c as THREE.SkinnedMesh;
  });
  return found as THREE.SkinnedMesh | null;
};

/** Every file a character can be built from (the shared texture array covers them all). */
/** `?nomerge` keeps characters in parts (to compare looks). */
const NO_MERGE = typeof location !== 'undefined' && location.search.includes('nomerge');
const ALL_FILES = ['base_female.glb', 'base_male.glb', 'hair_beard.glb', ...Object.values(HAIR_FILE), ...['female', 'male'].flatMap((b) => ['peasant', 'ranger'].map((o) => `outfit_${b}_${o}.glb`))];

/**
 * `merge` (default) folds the parts into one skinned mesh: one draw call per
 * character (charMerge). The player's hero keeps its parts.
 */
export async function buildCharacter(look: Look, clips: string[] = ['idle', 'talk'], opts: { merge?: boolean } = {}): Promise<BuiltCharacter> {
  const sex = look.body;
  const [outfitG, baseG] = await Promise.all([load(`outfit_${sex}_${look.outfit}.glb`), load(`base_${sex}.glb`)]);
  const model = SkeletonUtils.clone(outfitG.scene);
  model.updateMatrixWorld(true);

  // Optional outfit pieces.
  const drop: string[] = [];
  if (!look.hood) drop.push('Hood');
  if (!look.pauldron) drop.push('Pauldron');
  if (look.bracers === false) drop.push('Bracer');
  const remove: THREE.Object3D[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && drop.some((d) => o.name.includes(d))) remove.push(o);
  });
  for (const o of remove) o.removeFromParent();

  const anchor = firstSkinned(model)!;
  const parent = anchor.parent!;

  // Head and neck from the base character (not the torso: the outfit covers that).
  const baseScene = baseG.scene;
  baseScene.updateMatrixWorld(true);
  let skinMat: THREE.MeshStandardMaterial | null = null;
  const baseMeshes: THREE.SkinnedMesh[] = [];
  baseScene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) baseMeshes.push(o as THREE.SkinnedMesh);
  });
  // Keep the head and neck down to just below the neck bone's bind position.
  let neckY = 1.45;
  const ni = anchor.skeleton.bones.findIndex((b) => b.name === 'neck_01');
  if (ni >= 0) neckY = new THREE.Vector3().setFromMatrixPosition(anchor.skeleton.boneInverses[ni].clone().invert()).y - 0.03;
  for (const bm of baseMeshes) {
    const isBody = /superhero|sphere|retopology/i.test(bm.name) || bm.geometry.attributes.position.count > 5000;
    const mesh = rebindShared(`${sex}|${look.outfit}|${bm.name}`, bm, anchor, isBody ? (a, b, c) => Math.min(a.y, b.y, c.y) > neckY && Math.max(Math.abs(a.x), Math.abs(b.x), Math.abs(c.x)) < 0.14 : undefined);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    if (isBody) skinMat = mesh.material as THREE.MeshStandardMaterial;
  }

  // Hair and beard.
  const extras: string[] = [];
  if (look.hair) extras.push(HAIR_FILE[look.hair]);
  if (look.beard) extras.push('hair_beard.glb');
  for (const file of extras) {
    const hg = await load(file);
    const hs = hg.scene;
    hs.updateMatrixWorld(true);
    const hm = firstSkinned(hs);
    if (!hm) continue;
    const mesh = rebindShared(`${sex}|${look.outfit}|${file}`, hm, anchor);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.set(look.hairColor ?? 0x4a3322);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  }

  // Materials: skin tone, signature colours.
  const skin = new THREE.Color(look.skin ?? 0xffffff);
  const hue = look.cloth !== undefined ? new THREE.Color(look.cloth) : null;
  const linen = look.linen !== undefined ? new THREE.Color(look.linen) : null;
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
    const next = mats.map((mat) => {
      const c = mat.clone();
      // Outfits exported with vertex colours enabled but no colour attribute
      // read black in WebGL (the default attribute value is 0).
      if (!m.geometry.attributes.color) c.vertexColors = false;
      const isSkin = /regular|superhero|skin/i.test(mat.name) || c === skinMat;
      if (isSkin) c.color.copy(skin);
      else if (/hair/i.test(mat.name)) c.color.set(look.hairColor ?? 0x4a3322); // brows match the hair
      else if (!/hair|eye/i.test(mat.name) && (hue || linen)) recolor(c, hue, linen);
      c.roughness = 0.85;
      c.metalness = 0;
      return c;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
  if (skinMat) (skinMat as THREE.MeshStandardMaterial).color.copy(skin);
  if (opts.merge !== false && !NO_MERGE) {
    const at = await characterAtlas(ALL_FILES, load);
    const key = [sex, look.outfit, !!look.hood, !!look.pauldron, look.bracers !== false, look.hair ?? '', !!look.beard, look.skin ?? '', look.hairColor ?? ''].join('|');
    mergeParts(model, anchor, at, key, hue, linen);
  }

  // Normalise height (the rig is in metres already; this only fine-tunes).
  const root = new THREE.Group();
  root.add(model);
  const rig = `${sex}|${look.outfit}`;
  // The rig's rest pose, before any height scaling (retargeting is scale-independent).
  let rest = restCache.get(rig);
  if (!rest) {
    rest = captureRest(model);
    restCache.set(rig, rest);
  }
  if (look.height) {
    const hk = `${rig}|${!!look.hood}|${!!look.pauldron}|${look.hair ?? ''}|${!!look.beard}`;
    let h = heightCache.get(hk);
    if (h === undefined) {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      h = box.max.y - box.min.y;
      heightCache.set(hk, h);
    }
    if (h > 0.5) model.scale.multiplyScalar(look.height / h);
  }

  // Animations, retargeted onto this rig (once per rig and clip).
  const mixer = new THREE.AnimationMixer(model);
  for (const key of clips) {
    const ck = `${rig}|${key}`;
    let clip = retargetCache.get(ck);
    if (!clip) {
      const c = await loadClip(key);
      if (!c) continue;
      clip = retargetClip(c.clip, c.rest, rest, HUMANOID_TO_UE);
      clip.name = key;
      retargetCache.set(ck, clip);
    }
    mixer.clipAction(clip);
  }
  const bones = new Map<string, THREE.Bone>();
  for (const b of anchor.skeleton.bones) bones.set(b.name, b);
  return { root, model, mixer, bones, skeleton: anchor.skeleton };
}
