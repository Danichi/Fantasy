import RAW from './atlas.json';
import { ISLAND_PORTS, padCentre } from '../sea/islandPortsData';

export type IslandRegion = 'azureIsles' | 'emeraldIsles' | 'shatteredIsles' | 'sunkenIsles';
export interface IslandDef {
  id: string;
  name: string;
  region: IslandRegion;
  area: number;
  at: number[];
  h: number;
  extent: number;
  landing: number[];
  sea: number[];
  sites: { at: number[]; h: number }[];
  paths: number[][][];
  dive: number[] | null;
  cells: number[];
}
export const ISLANDS = RAW as IslandDef[];
/** The swimmer approaches the side of the landing, clear of its deck. */
export function islandLandingWater(isle: IslandDef): [number, number] {
  const dx = isle.sea[0] - isle.landing[0],
    dz = isle.sea[1] - isle.landing[1],
    len = Math.hypot(dx, dz) || 1;
  return [isle.sea[0] - (dz / len) * 2.5, isle.sea[1] + (dx / len) * 2.5];
}
export const REGIONS: IslandRegion[] = ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles'];
export const THEMES = {
  azureIsles: {
    name: 'The Azure Isles',
    color: 0x3d9ea8,
    stone: 0xe3d9b7,
    wood: 0x97764b,
    level: 24,
    material: 'islandPearl',
    ward: ['Low shell', 'High shell', 'Middle shell'],
    sequence: [0, 2, 1],
    hint: 'The oldest bell sounds low. The rising tide takes the middle note. The gull answers high.',
    boss: 'Pearlback, the Reef Tyrant',
    bossType: 'crab',
    keepsake: 'lagoonHeart',
    blurb: 'Spice terraces, sheltered lagoons and pearl divers. The old reef bells have fallen silent.',
  },
  emeraldIsles: {
    name: 'The Emerald Isles',
    color: 0x4b8b56,
    stone: 0x839574,
    wood: 0x6c4d33,
    level: 29,
    material: 'islandHeartwood',
    ward: ['Rain', 'Sun', 'Root'],
    sequence: [2, 0, 1],
    hint: 'First the root takes hold. Then the rain comes. Only then does the sun call the leaves.',
    boss: 'Old Mossroot, the Hollow Grove',
    bossType: 'tree',
    keepsake: 'grovekeepersSeal',
    blurb: 'Timber villages, fern valleys and old forest shrines. Something is drinking the roots dry.',
  },
  shatteredIsles: {
    name: 'The Shattered Isles',
    color: 0xa85a43,
    stone: 0x666c74,
    wood: 0x4c3530,
    level: 35,
    material: 'islandSalvage',
    ward: ['West watch', 'East watch', 'North watch'],
    sequence: [1, 0, 2],
    hint: 'The eastern lookout answers first, the western lookout second. The north watch gives the all-clear.',
    boss: 'Commodore Vane, the Shorebreaker',
    bossType: 'pirate',
    keepsake: 'freeHarboursMark',
    blurb: 'Wreckers, prison hulks and pirate signal towers. Calloway sails the sea; Vane holds the shore.',
  },
  sunkenIsles: {
    name: 'The Sunken Isles',
    color: 0x5b9fbc,
    stone: 0x8ca3a8,
    wood: 0x53696f,
    level: 41,
    material: 'islandTideglass',
    ward: ['Dawn', 'Tide', 'Night'],
    sequence: [0, 1, 2],
    hint: 'Light opens the wheel. The tide carries it. Night closes it, but never turns it back.',
    boss: 'The Drowned Archivist',
    bossType: 'dead',
    keepsake: 'keepersTidewheel',
    blurb: 'Drowned causeways, coral courts and the first wheel-cutters. Their bells still ring below the water.',
  },
} as const;
export type SiteKind = 'village' | 'cache' | 'resource' | 'ward' | 'camp' | 'boss' | 'dive' | 'vista';
export interface IslandSite {
  id: string;
  island: string;
  region: IslandRegion | 'demonContinent';
  name: string;
  kind: SiteKind;
  x: number;
  z: number;
  h: number;
  hint: string;
  item?: string;
}
const cellOwner = new Map<number, IslandDef>();
for (const isle of ISLANDS) for (const c of isle.cells) cellOwner.set(c, isle);
const GW = Math.ceil((1536 * 14.8) / 60);
export function islandAt(x: number, z: number) {
  return cellOwner.get(Math.floor((z + 6586) / 60) * GW + Math.floor((x + 9176) / 60)) ?? null;
}
export const HUB_LINKS = ISLAND_PORTS.filter((p) => p.style !== 'dwarven').map((p) => {
  const [x, z] = padCentre(p);
  let best = Infinity;
  let island = ISLANDS[0];
  let cell = 0;
  for (const i of ISLANDS) {
    if (p.style === 'demon') break;
    for (const c of i.cells) {
      const cx = -9176 + ((c % GW) + 0.5) * 60,
        cz = -6586 + (Math.floor(c / GW) + 0.5) * 60;
      const dist = Math.hypot(cx - x, cz - z);
      if (dist < best) {
        best = dist;
        island = i;
        cell = c;
      }
    }
  }
  return {
    port: p.id,
    island: p.style === 'demon' ? 'ashen-coast' : island.id,
    from: [x, z, p.padH],
    to:
      p.style === 'demon'
        ? [p.land[0] - Math.cos(p.dir) * 115, p.land[1] - Math.sin(p.dir) * 115, 5]
        : [-9176 + ((cell % GW) + 0.5) * 60, -6586 + (Math.floor(cell / GW) + 0.5) * 60, Math.max(2.4, island.h)],
  };
});
export const SITES: IslandSite[] = [];
for (const region of REGIONS) {
  const islands = ISLANDS.filter((i) => i.region === region),
    theme = THEMES[region];
  islands.forEach((isle, index) => {
    isle.sites.forEach((p, n) => {
      const kind: SiteKind =
        n === 0 ? (index === 0 ? 'village' : index < 3 ? 'ward' : 'cache') : n === 1 ? 'camp' : n === 2 ? (index === 0 ? 'boss' : 'resource') : n === 3 ? 'resource' : 'vista';
      const title =
        kind === 'village'
          ? `${isle.name} Outpost`
          : kind === 'boss'
            ? theme.boss
            : kind === 'ward'
              ? `${isle.name} ${region === 'shatteredIsles' ? 'Watch' : 'Sanctuary'}`
              : kind === 'camp'
                ? `${isle.name} ${region === 'sunkenIsles' ? 'Drowned Watch' : 'Raider Camp'}`
                : kind === 'resource'
                  ? `${isle.name} ${region === 'emeraldIsles' ? 'Heartwood Stand' : 'Gathering Ground'}`
                  : kind === 'vista'
                    ? `${isle.name} Lookout`
                    : `${isle.name} Lost Cache`;
      SITES.push({
        id: `${isle.id}:${n}`,
        island: isle.id,
        region,
        name: title,
        kind,
        x: p.at[0],
        z: p.at[1],
        h: p.h,
        hint: kind === 'ward' ? theme.hint : theme.blurb,
        item: theme.material,
      });
    });
    if (isle.dive)
      SITES.push({
        id: `${isle.id}:dive`,
        island: isle.id,
        region,
        name: `${isle.name} ${region === 'azureIsles' ? 'Pearl Grotto' : 'Drowned Reliquary'}`,
        kind: 'dive',
        x: isle.dive[0],
        z: isle.dive[1],
        h: -4.8,
        hint: 'Dive to the blue lantern below the surface. The cache lies on the reef shelf.',
        item: theme.material,
      });
  });
  // Three independent wards: two outlying isles and one location on the main island.
  const third = SITES.find((s) => s.island === islands[0].id && s.kind === 'vista') ?? SITES.find((s) => s.island === islands[0].id && s.kind === 'resource');
  if (third) {
    third.kind = 'ward';
    third.name = `${islands[0].name} Sanctuary`;
    third.hint = theme.hint;
  } else
    SITES.push({
      id: `${islands[0].id}:ward`,
      island: islands[0].id,
      region,
      name: `${islands[0].name} Watch`,
      kind: 'ward',
      x: islands[0].at[0] + 28,
      z: islands[0].at[1] + 12,
      h: islands[0].h,
      hint: theme.hint,
    });
}
const ap = ISLAND_PORTS.find((p) => p.id === 'ashenPort')!;
for (const [n, kind, name, dx, dz] of [
  [0, 'village', 'The Ash Exchange', -100, -10],
  [1, 'camp', 'Ember Road Checkpoint', -165, -25],
  [2, 'cache', "The Exiles' Dead Drop", -100, 70],
  [3, 'ward', 'The First Ember Gate', -225, 25],
] as const) {
  const x = ap.land[0] + Math.cos(ap.dir) * dx - Math.sin(ap.dir) * dz,
    z = ap.land[1] + Math.sin(ap.dir) * dx + Math.cos(ap.dir) * dz;
  SITES.push({
    id: `ashen:${n}`,
    island: 'ashen-coast',
    region: 'demonContinent',
    name,
    kind,
    x,
    z,
    h: 5,
    hint: 'Ashen Port trades under an old truce. The inland gate is watched by those who remember the first crossing.',
    item: 'islandAshSilk',
  });
}
export const wardsOf = (region: IslandRegion) => SITES.filter((s) => s.region === region && s.kind === 'ward');
export const bossOf = (region: IslandRegion) => SITES.find((s) => s.region === region && s.kind === 'boss')!;

// Plain-data terrain shaping is shared with the terrain worker. Keep every
// pad and path local so existing coasts and ocean channels remain open.
const siteRadius = (s: IslandSite) => (s.kind === 'village' ? 22 : s.kind === 'boss' ? 18 : s.kind === 'dive' ? 8 : 10);
const padRadii = new Map(SITES.filter((s) => s.kind !== 'dive').map((s) => [s.x + ',' + s.z, siteRadius(s)]));
const buckets = new Map<string, { sites: IslandSite[]; paths: number[][][] }>();
const bucket = (x: number, z: number) => {
  const k = Math.floor(x / 256) + ',' + Math.floor(z / 256);
  let b = buckets.get(k);
  if (!b) buckets.set(k, (b = { sites: [], paths: [] }));
  return b;
};
for (const s of SITES)
  for (let x = Math.floor((s.x - 34) / 256); x <= Math.floor((s.x + 34) / 256); x++)
    for (let z = Math.floor((s.z - 34) / 256); z <= Math.floor((s.z + 34) / 256); z++) bucket(x * 256, z * 256).sites.push(s);
for (const i of ISLANDS)
  for (const path of i.paths)
    for (let n = 1; n < path.length; n++) {
      const seg = [path[n - 1], path[n]].map((p) => [...p, padRadii.get(p[0] + ',' + p[1]) ?? 0]);
      const [a, b] = seg;
      for (let x = Math.floor((Math.min(a[0], b[0]) - 12) / 256); x <= Math.floor((Math.max(a[0], b[0]) + 12) / 256); x++)
        for (let z = Math.floor((Math.min(a[1], b[1]) - 12) / 256); z <= Math.floor((Math.max(a[1], b[1]) + 12) / 256); z++) bucket(x * 256, z * 256).paths.push(seg);
    }
const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
export function shapeIslands(x: number, z: number, h: number) {
  const b = buckets.get(Math.floor(x / 256) + ',' + Math.floor(z / 256));
  if (!b) return h;
  let corridor = Infinity,
    trail = h;
  for (const [a, c] of b.paths) {
    const dx = c[0] - a[0],
      dz = c[1] - a[1],
      length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (length * length || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < corridor) {
      corridor = d;
      // Start the incline at the edge of a flat site. Flattening a pad on
      // top of a linear incline otherwise leaves an unclimbable lip.
      const grade = Math.max(0, Math.min(1, (t * length - a[3]) / Math.max(1, length - a[3] - c[3])));
      trail = a[2] + (c[2] - a[2]) * grade;
    }
  }
  if (corridor < 10) h += (trail - h) * (1 - smooth(3, 10, corridor));
  for (const s of b.sites) {
    const r = siteRadius(s),
      dist = Math.hypot(x - s.x, z - s.z);
    if (dist < r + 10 && (corridor > 3 || s.kind === 'dive')) h += (s.h - h) * (1 - smooth(r, r + 10, dist));
  }
  return h;
}
