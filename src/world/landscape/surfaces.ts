import { forestCrossingHeightAt } from '../elves/layout';
import { forestBaseHeight } from '../terrainHeight';
import { heightAt } from '../terrainHeight';
import { crossingHeightAt } from './layout';
/** Grounded travel follows the bridge deck, while boats still sample the bed. */
export function walkHeightAt(x: number, z: number) {
  return Math.max(heightAt(x, z), crossingHeightAt(x, z, heightAt) ?? -Infinity, forestCrossingHeightAt(x,z,forestBaseHeight) ?? -Infinity);
}
