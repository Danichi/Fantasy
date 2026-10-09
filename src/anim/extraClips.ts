import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { captureRest, retargetClip, HUMANOID_TO_UE } from './retarget';
import type { Character } from '../player/character';

// Extra clips for the hero from the Universal Animation Library (CC0, the
// same files the townsfolk and bandits play: public/assets/anims). They are
// retargeted onto the hero's own rest pose, exactly as charBuilder does for
// NPCs, and stored under "ual_<name>" so the Animator can play them like any
// manifest clip. The weapon families use them (bows aim and loose with the
// bandits' archery clips; axes chop with the woodcutter's swing) until the
// Mixamo packs in the plan are downloaded.

export const UAL_CLIPS = ['bow_aim', 'bow_shoot', 'chop', 'sword_attack', 'sword_combo', 'pickup', 'pick_tree'] as const;
export type UalClip = (typeof UAL_CLIPS)[number];

const loader = new GLTFLoader();

/** Load and retarget the extra clips onto `char` (no-op for a rig without a rest pose). */
export async function loadExtraClips(char: Character, names: readonly UalClip[] = UAL_CLIPS) {
  const rest = char.restPose;
  if (!rest) return 0;
  let n = 0;
  await Promise.all(names.map(async (name) => {
    try {
      const g = await loader.loadAsync(`/assets/anims/${name}.glb`);
      const src = g.animations[0] as THREE.AnimationClip | undefined;
      if (!src) return;
      const clip = retargetClip(src, captureRest(g.scene), rest, HUMANOID_TO_UE);
      clip.name = 'ual_' + name;
      char.clips.set(clip.name, clip);
      char.clipInfo.set(clip.name, { file: `${name}.glb`, loop: name === 'bow_aim' });
      n++;
    } catch (e) {
      console.warn('extra clip failed', name, e);
    }
  }));
  return n;
}
