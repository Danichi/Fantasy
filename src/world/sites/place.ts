import { heightAt, roadDist, streetDist } from '../terrainHeight';
import { regionAt, SEA_LEVEL, MPP, ORIGIN_PX } from '../worldMap';
import { habitatAt, keptOut } from '../herbs/flora';
import { dangerAt } from '../wilds/danger';
import { mulberry32 } from '../../core/math';
import REGIONS from '../data/regions.json';
import type { Site, SiteType } from './types';

// Where the sites go: a fixed seed, so every playthrough has the same world.
// Each kind looks for country it likes in Cresha (never in water, on roads, in
// towns, fields or anybody else's clearing), keeps its distance from the
// other sites, and wants reasonably level ground.

/** Cresha's box, in world metres. */
const BOX = { x0: -4000, x1: 4200, z0: -2200, z1: 1100 };
/** Sites keep this far apart (metres). */
const SPACING = 150;
/** And this far from Elder Glen's centre. */
const GLEN_R = 330;

const PLACES = REGIONS.places.map((p) => [(p.px[0] - ORIGIN_PX[0]) * MPP, (p.px[1] - ORIGIN_PX[1]) * MPP] as [number, number]);

export function placeSites(types: SiteType[], avoid: [number, number, number][], seed = 4471): Site[] {
  const out: Site[] = [];
  const rnd = mulberry32(seed);
  const free = (x: number, z: number, r: number) => {
    for (const s of out) if ((s.x - x) ** 2 + (s.z - z) ** 2 < SPACING * SPACING) return false;
    for (const [cx, cz, cr] of avoid) if ((x - cx) ** 2 + (z - cz) ** 2 < (cr + r + 25) ** 2) return false;
    for (const [px, pz] of PLACES) if ((x - px) ** 2 + (z - pz) ** 2 < 170 * 170) return false;
    return true;
  };
  // The fixed ones first (the discovery sites), then the rarer and bigger kinds.
  for (const t of types) {
    if (!t.at) continue;
    const { x, z, yaw } = t.at;
    out.push({ id: `${t.kind}0`, kind: t.kind, n: 0, x, z, y: heightAt(x, z), yaw, seed: (seed * 17 + out.length * 7919) >>> 0, danger: dangerAt(x, z) });
  }
  const order = [...types].filter((t) => !t.at).sort((a, b) => a.count - b.count || b.clear - a.clear);
  for (const t of order) {
    let placed = 0;
    for (let tries = 0; tries < t.count * 90 && placed < t.count; tries++) {
      const x = BOX.x0 + rnd() * (BOX.x1 - BOX.x0), z = BOX.z0 + rnd() * (BOX.z1 - BOX.z0);
      const roll = rnd(), yawRoll = rnd();
      const region = regionAt(x, z);
      if (region !== 'cresha' && region !== 'elderGlen') continue;
      if (Math.hypot(x, z) < Math.max(GLEN_R, t.minFar ?? 0)) continue;
      const hab = habitatAt(x, z);
      if (!hab || !t.habitats.includes(hab)) continue;
      if (keptOut(x, z)) continue;
      const rd = roadDist(x, z);
      if (rd < 32 + t.clear || (t.nearRoad && rd > t.nearRoad)) continue;
      if (streetDist(x, z) < 30) continue;
      const h = heightAt(x, z);
      if (h < SEA_LEVEL + 1.5) continue;
      // Level enough to stand on.
      const r = Math.max(6, t.clear * 0.7);
      let lo = h, hi = h, wet = false;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const hh = heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
        if (hh < SEA_LEVEL + 0.8) wet = true;
      }
      if (wet || hi - lo > 2.5 + r * 0.12) continue;
      if (t.score && roll > t.score(x, z, h)) continue;
      if (!free(x, z, t.clear)) continue;
      out.push({ id: `${t.kind}${placed}`, kind: t.kind, n: placed, x, z, y: h, yaw: yawRoll * Math.PI * 2, seed: (seed * 31 + out.length * 977) >>> 0, danger: dangerAt(x, z) });
      placed++;
    }
  }
  return out;
}
