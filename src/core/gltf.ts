import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// One loader for third-party packs (Quaternius via Drawcall Market, the creature
// mirror) that ship Draco, meshopt or Basis-compressed files. The decoders are
// copied from three's examples into public/decoders/.
const draco = new DRACOLoader().setDecoderPath('/decoders/draco/');
const ktx2 = new KTX2Loader().setTranscoderPath('/decoders/basis/');

export const compressedGltf = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);

/** KTX2 needs to know which GPU texture formats exist; call once the renderer exists. */
export function initCompressedGltf(renderer: THREE.WebGLRenderer) {
  ktx2.detectSupport(renderer);
}
