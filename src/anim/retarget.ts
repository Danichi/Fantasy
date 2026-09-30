import * as THREE from 'three';

// Rest-pose-corrected animation retargeting between humanoid skeletons that
// name and orient their bones differently (Mixamo, VRM-style "humanoid",
// Unreal-style Quaternius).
//
// For every mapped bone the source's animated WORLD rotation is carried over
// as a delta from its rest pose:
//     T'_w(b) = S'_w(b) · S_w(b)⁻¹ · T_w(b)
// and turned back into the target's local rotation through the target's own
// hierarchy, so extra or missing intermediate bones don't matter. The hips
// translation is carried as a world-space offset scaled by leg length.

export type BoneMap = Record<string, string>; // source bone name -> target bone name

/** VRM-style humanoid names (Drawcall market / Quaternius UAL clips) -> Unreal-style Quaternius rig. */
export const HUMANOID_TO_UE: BoneMap = (() => {
  const m: BoneMap = {
    hips: 'pelvis', spine: 'spine_01', chest: 'spine_02', upperChest: 'spine_03', neck: 'neck_01', head: 'Head',
  };
  for (const [s, u] of [['left', 'l'], ['right', 'r']] as const) {
    Object.assign(m, {
      [`${s}Shoulder`]: `clavicle_${u}`, [`${s}UpperArm`]: `upperarm_${u}`, [`${s}LowerArm`]: `lowerarm_${u}`, [`${s}Hand`]: `hand_${u}`,
      [`${s}UpperLeg`]: `thigh_${u}`, [`${s}LowerLeg`]: `calf_${u}`, [`${s}Foot`]: `foot_${u}`, [`${s}Toes`]: `ball_${u}`,
      [`${s}ThumbMetacarpal`]: `thumb_01_${u}`, [`${s}ThumbProximal`]: `thumb_02_${u}`, [`${s}ThumbDistal`]: `thumb_03_${u}`,
    });
    for (const [f, uf] of [['Index', 'index'], ['Middle', 'middle'], ['Ring', 'ring'], ['Little', 'pinky']]) {
      m[`${s}${f}Proximal`] = `${uf}_01_${u}`;
      m[`${s}${f}Intermediate`] = `${uf}_02_${u}`;
      m[`${s}${f}Distal`] = `${uf}_03_${u}`;
    }
  }
  return m;
})();

/** Mixamo short names (prefix stripped) -> Unreal-style Quaternius rig. */
export const MIXAMO_TO_UE: BoneMap = (() => {
  const m: BoneMap = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head' };
  for (const [s, u] of [['Left', 'l'], ['Right', 'r']] as const) {
    Object.assign(m, {
      [`${s}Shoulder`]: `clavicle_${u}`, [`${s}Arm`]: `upperarm_${u}`, [`${s}ForeArm`]: `lowerarm_${u}`, [`${s}Hand`]: `hand_${u}`,
      [`${s}UpLeg`]: `thigh_${u}`, [`${s}Leg`]: `calf_${u}`, [`${s}Foot`]: `foot_${u}`, [`${s}ToeBase`]: `ball_${u}`,
    });
    for (const [f, uf] of [['Thumb', 'thumb'], ['Index', 'index'], ['Middle', 'middle'], ['Ring', 'ring'], ['Pinky', 'pinky']]) {
      for (let k = 1; k <= 3; k++) m[`${s}Hand${f}${k}`] = `${uf}_0${k}_${u}`;
    }
  }
  return m;
})();

interface RestBone {
  name: string;
  parent: RestBone | null;
  local: THREE.Quaternion;
  pos: THREE.Vector3;
  world: THREE.Quaternion;
  worldPos: THREE.Vector3;
  /** linear part (rotation + scale) of the parent's world matrix at rest */
  parentLinear: THREE.Matrix3;
}

/** Snapshot the rest pose (local + world rotations) of every node under `root`. */
export function captureRest(root: THREE.Object3D, rename: (n: string) => string = (n) => n) {
  const out = new Map<string, RestBone>();
  root.updateMatrixWorld(true);
  const walk = (o: THREE.Object3D, parent: RestBone | null) => {
    let me: RestBone | null = parent;
    if ((o as THREE.Bone).isBone || o.name) {
      const world = new THREE.Quaternion();
      const worldPos = new THREE.Vector3();
      o.getWorldQuaternion(world);
      o.getWorldPosition(worldPos);
      const parentLinear = new THREE.Matrix3();
      if (o.parent) parentLinear.setFromMatrix4(o.parent.matrixWorld);
      me = { name: rename(o.name), parent, local: o.quaternion.clone(), pos: o.position.clone(), world, worldPos, parentLinear };
      out.set(me.name, me);
    }
    for (const c of o.children) walk(c, me);
  };
  walk(root, null);
  return out;
}

/**
 * Retarget `clip` (animating nodes of the source rig) onto the target rig.
 * `srcRest`/`dstRest` come from captureRest on each rig in its bind pose;
 * `map` maps source bone names to target bone names.
 */
export function retargetClip(
  clip: THREE.AnimationClip,
  srcRest: Map<string, RestBone>,
  dstRest: Map<string, RestBone>,
  map: BoneMap,
  opts: { srcName?: (n: string) => string; hips?: string; fps?: number } = {},
): THREE.AnimationClip {
  const name = opts.srcName ?? ((n: string) => n);
  const fps = opts.fps ?? 30;
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  for (let i = 0; i < frames; i++) times[i] = Math.min(clip.duration, i / fps);

  // Sample the source's local rotations (and hips position) per frame.
  const rotTracks = new Map<string, THREE.QuaternionKeyframeTrack>();
  let hipsPos: THREE.VectorKeyframeTrack | null = null;
  const srcHips = Object.keys(map).find((k) => map[k] === (opts.hips ?? 'pelvis')) ?? 'hips';
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const bone = name(t.name.slice(0, dot));
    const prop = t.name.slice(dot + 1);
    if (prop === 'quaternion') rotTracks.set(bone, t as THREE.QuaternionKeyframeTrack);
    else if (prop === 'position' && bone === srcHips) hipsPos = t as THREE.VectorKeyframeTrack;
  }
  const interps = new Map<THREE.KeyframeTrack, THREE.Interpolant>();
  const sample = (track: THREE.KeyframeTrack, time: number, out: number[]) => {
    let interp = interps.get(track);
    if (!interp) {
      // createInterpolant is assigned at runtime and missing from the typings.
      interp = (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
      interps.set(track, interp);
    }
    const v = interp.evaluate(time);
    for (let i = 0; i < v.length; i++) out[i] = v[i];
    return out;
  };

  // Source world rotations per frame (unanimated bones keep their rest local).
  const srcOrder = [...srcRest.values()];
  const dstOrder = [...dstRest.values()];
  const outRot = new Map<string, Float32Array>();
  const reverse = new Map<string, string>();
  for (const [s, d] of Object.entries(map)) reverse.set(d, s);
  for (const b of dstOrder) if (reverse.has(b.name)) outRot.set(b.name, new Float32Array(frames * 4));
  const hipsOut = new Float32Array(frames * 3);
  const inv = (q: THREE.Quaternion) => q.clone().invert();

  const srcHipsRest = srcRest.get(srcHips);
  const dstHipsName = opts.hips ?? 'pelvis';
  const dstHipsRest = dstRest.get(dstHipsName);
  const hipsScale = srcHipsRest && dstHipsRest && srcHipsRest.worldPos.y > 1e-4 ? dstHipsRest.worldPos.y / srcHipsRest.worldPos.y : 1;

  const tmp: number[] = [0, 0, 0, 0];
  const dstInvParent = dstHipsRest ? dstHipsRest.parentLinear.clone().invert() : new THREE.Matrix3();
  const sWorld = new Map<string, THREE.Quaternion>();
  const tWorld = new Map<string, THREE.Quaternion>();
  for (let f = 0; f < frames; f++) {
    const time = times[f];
    sWorld.clear();
    for (const b of srcOrder) {
      const tr = rotTracks.get(b.name);
      const local = tr ? new THREE.Quaternion().fromArray(sample(tr, time, tmp)) : b.local;
      const parentW = b.parent ? sWorld.get(b.parent.name) ?? b.parent.world : new THREE.Quaternion();
      sWorld.set(b.name, parentW.clone().multiply(local));
    }
    tWorld.clear();
    for (const b of dstOrder) {
      const src = reverse.get(b.name);
      const sb = src ? srcRest.get(src) : undefined;
      let w: THREE.Quaternion;
      if (sb && sWorld.has(src!)) {
        // T'_w = S'_w · S_w⁻¹ · T_w
        w = sWorld.get(src!)!.clone().multiply(inv(sb.world)).multiply(b.world);
      } else {
        const parentW = b.parent ? tWorld.get(b.parent.name) ?? b.parent.world : new THREE.Quaternion();
        w = parentW.clone().multiply(b.local);
      }
      tWorld.set(b.name, w);
      const arr = outRot.get(b.name);
      if (arr) {
        const parentW = b.parent ? tWorld.get(b.parent.name) ?? b.parent.world : new THREE.Quaternion();
        inv(parentW).multiply(w).normalize().toArray(arr, f * 4);
      }
    }
    // Hips: world offset from rest, scaled to the target's leg length.
    if (dstHipsRest) {
      const p = dstHipsRest.pos.clone();
      if (hipsPos && srcHipsRest) {
        const d = new THREE.Vector3().fromArray(sample(hipsPos, time, tmp)).sub(srcHipsRest.pos);
        d.applyMatrix3(srcHipsRest.parentLinear).multiplyScalar(hipsScale);
        d.applyMatrix3(dstInvParent);
        p.add(d);
      }
      p.toArray(hipsOut, f * 3);
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, values] of outRot) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  if (dstHipsRest) tracks.push(new THREE.VectorKeyframeTrack(`${dstHipsName}.position`, times, hipsOut));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
