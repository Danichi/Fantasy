import { heightAt, riverX, RIVER_LEVEL } from './terrainHeight';
import { macroElevAt, SEA_LEVEL } from './worldMap';
import { CANAL, QUAY_X } from './portCity';

// Where the water is (World Expansion phase 5): the Elder Glen river, Port
// Aurelle's canal and the open sea. Swimming, fishing and wading all ask here.

/** Water surface height at a point, or null if there is no water. */
export function waterSurfaceAt(x: number, z: number): number | null {
  const ground = heightAt(x, z);
  // The river (constant level along its channel through the valley).
  if (Math.abs(x - riverX(z)) < 16 && Math.abs(z) < 440 && ground < RIVER_LEVEL) return RIVER_LEVEL;
  // The canal in Port Aurelle.
  if (x > CANAL.x0 && x < QUAY_X + 2 && Math.abs(z - CANAL.z) < CANAL.half) return SEA_LEVEL + 0.25;
  // The sea: wherever the map says ocean and the ground is below the waterline.
  if (ground < SEA_LEVEL && macroElevAt(x, z) < SEA_LEVEL + 1.4) return SEA_LEVEL;
  return null;
}

/** Depth of water standing at a point (0 when dry). */
export function waterDepth(x: number, z: number) {
  const s = waterSurfaceAt(x, z);
  return s === null ? 0 : Math.max(0, s - heightAt(x, z));
}
