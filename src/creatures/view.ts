import type * as THREE from 'three';
import type { Player } from '../player/player';

/** What creatures need to know about the viewer each frame (set by main). */
export const creatureView: {
  camera: THREE.Vector3 | null;
  player: Player | null;
  /** fur and fine detail on (quality setting) */
  fur: boolean;
  /** it is night (creatures are bolder, see further) */
  night: boolean;
} = { camera: null, player: null, fur: true, night: false };
