import { forestWaterAt } from './elves/layout';
import { inDark } from './dark/land';
import { forestBaseHeight } from './terrainHeight';
import { CREEK } from './roadData';
import { segment } from './landscape/layout';
import { landscapeWaterAt } from './landscape/layout';
import { heightAt, riverX, RIVER_LEVEL, DROWNED_MERE } from './terrainHeight';
import { macroElevAt, SEA_LEVEL } from './worldMap';
import { CANAL, QUAY_X } from './portCity';

// Where the water is (World Expansion phase 5): the Elder Glen river, Port
// Aurelle's canal and the open sea. Swimming, fishing and wading all ask here.

/** Water surface height at a point, or null if there is no water. */
export function waterSurfaceAt(x: number, z: number): number | null {
  if (inDark(x, z)) return null; // The Dark's ancient sea beds are exposed, not swimmable living ocean.
  const ground = heightAt(x, z);
  const forest = forestWaterAt(x,z,forestBaseHeight);
  if(forest && ground < forest.level) return forest.level;
  const local = landscapeWaterAt(x, z);
  if (local && ground < local.level && local.distance < local.half + local.bank) {
    // A falling ribbon over the coast is not a tall column of swimmable water.
    if (local.id.startsWith('emerald-') && ground < SEA_LEVEL && macroElevAt(x,z) < SEA_LEVEL+1.4) return SEA_LEVEL;
    return local.level;
  }
  // The existing Millbrook ribbon follows its bed at a depth of 1.15 m.
  if(x>1490&&x<1670&&z>-445&&z<185)for(let i=1;i<CREEK.length;i++) {
    const a=CREEK[i-1],b=CREEK[i],s=segment(x,z,a,b);
    if(s.d<4.4) { const level=heightAt(a[0]+(b[0]-a[0])*s.t,a[1]+(b[1]-a[1])*s.t)+1.15; if(ground<level)return level; }
  }
  // The river (constant level along its channel through the valley).
  if (Math.abs(x - riverX(z)) < 16 && Math.abs(z) < 440 && ground < RIVER_LEVEL) return RIVER_LEVEL;
  // The canal in Port Aurelle.
  if (x > CANAL.x0 && x < QUAY_X + 2 && Math.abs(z - CANAL.z) < CANAL.half) return SEA_LEVEL + 0.25;
  // The mere over the Drowned Watchtower keeps its own level.
  if (Math.abs(x - DROWNED_MERE.x) < DROWNED_MERE.r + 14 && Math.abs(z - DROWNED_MERE.z) < DROWNED_MERE.r + 14 && ground < DROWNED_MERE.water && Math.hypot(x - DROWNED_MERE.x, z - DROWNED_MERE.z) < DROWNED_MERE.r + 14) return DROWNED_MERE.water;
  // The sea: wherever the map says ocean and the ground is below the waterline.
  if (ground < SEA_LEVEL && macroElevAt(x, z) < SEA_LEVEL + 1.4) return SEA_LEVEL;
  return null;
}

/** Depth of water standing at a point (0 when dry). */
export function waterDepth(x: number, z: number) {
  const s = waterSurfaceAt(x, z);
  return s === null ? 0 : Math.max(0, s - heightAt(x, z));
}
