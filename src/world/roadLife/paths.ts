import { ROAD_SPECS, roadPoint, type P2 } from '../roadData';

// Road life (the roads into and out of the Royal Capital): the routes its
// travellers walk, and where its wayside places stand. Pure data and maths
// (no three.js), so quests and tests can import it cheaply.
//
// A chain is a route stitched from several roads, e.g. the Crown chain runs
// out of Elder Glen's west gate along the Logging Road and the whole Crown
// Road to the capital's East Gate. Distances along a chain are in metres.

export type ChainId = 'crown' | 'south' | 'kingsbridge';

export interface Chain {
  id: ChainId;
  name: string;
  pts: P2[];
  cum: number[];
  len: number;
}

const spec = (id: string) => ROAD_SPECS.find((r) => r.id === id)!;
const segLen = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Length of one road. */
export function roadLen(id: string) {
  const p = spec(id).pts;
  let a = 0;
  for (let i = 1; i < p.length; i++) a += segLen(p[i - 1], p[i]);
  return a;
}

/** Metres along a road of the point nearest (x, z). */
export function sOnRoad(id: string, x: number, z: number) {
  const p = spec(id).pts;
  let best = Infinity, at = 0, acc = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    const vx = bx - ax, vz = bz - az, l = Math.hypot(vx, vz);
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (l * l)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) (best = d), (at = acc + t * l);
    acc += l;
  }
  return at;
}

/** The road's points from `a` to `b` metres (reversed when b < a). */
function cut(id: string, a: number, b: number): P2[] {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const p = spec(id).pts;
  const out: P2[] = [roadPoint(id, lo)];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    acc += segLen(p[i - 1], p[i]);
    if (acc > lo + 0.5 && acc < hi - 0.5) out.push([p[i][0], p[i][1]]);
  }
  out.push(roadPoint(id, hi));
  return b < a ? out.reverse() : out;
}

function makeChain(id: ChainId, name: string, parts: [string, number, number][]): Chain {
  const pts: P2[] = [];
  for (const [r, a, b] of parts) {
    for (const q of cut(r, a, b)) {
      const last = pts[pts.length - 1];
      if (!last || segLen(last, q) > 0.25) pts.push(q);
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + segLen(pts[i - 1], pts[i]));
  return { id, name, pts, cum, len: cum[cum.length - 1] };
}

const WEST = roadLen('west');
const CROWN = roadLen('capital');
const QUEENS = roadLen('queens');
/** Where the Caravan Way leaves the Crown Road (Crown Road metres), and meets the Queen's Road (Caravan Way metres). */
export const CROWN_FORK_S = sOnRoad('capital', -700, 60);
export const QUEENS_JUNCTION_S = sOnRoad('sunspire', -3200, 560);

export const CHAINS: Record<ChainId, Chain> = {
  crown: makeChain('crown', 'the Crown Road', [['west', 0, WEST], ['capital', 0, CROWN]]),
  south: makeChain('south', 'the Caravan Way and the Queen’s Road', [['west', 0, WEST], ['capital', 0, CROWN_FORK_S], ['sunspire', 0, QUEENS_JUNCTION_S], ['queens', QUEENS, 0]]),
  kingsbridge: makeChain('kingsbridge', 'the Kingsbridge Road', [['kingsbridge', 0, roadLen('kingsbridge')]]),
};

export interface ChainPoint { x: number; z: number; dx: number; dz: number }

/** A point `s` metres along a chain, `lat` metres to its left (+) or right (-), with its heading. */
export function chainAt(c: Chain, s: number, lat = 0, out: ChainPoint = { x: 0, z: 0, dx: 1, dz: 0 }): ChainPoint {
  s = Math.max(0, Math.min(c.len, s));
  // Binary search for the segment.
  let lo = 1, hi = c.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.cum[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  const a = c.pts[lo - 1], b = c.pts[lo];
  const l = c.cum[lo] - c.cum[lo - 1] || 1;
  const t = (s - c.cum[lo - 1]) / l;
  const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
  out.x = a[0] + (b[0] - a[0]) * t - dz * lat;
  out.z = a[1] + (b[1] - a[1]) * t + dx * lat;
  out.dx = dx;
  out.dz = dz;
  return out;
}

/** Nearest point on a chain to (x, z): metres along it, and how far off it. */
export function chainProject(c: Chain, x: number, z: number) {
  let best = Infinity, at = 0;
  for (let i = 1; i < c.pts.length; i++) {
    const [ax, az] = c.pts[i - 1], [bx, bz] = c.pts[i];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) (best = d), (at = c.cum[i - 1] + t * Math.sqrt(l2));
  }
  return { s: at, off: best };
}

/** Crown Road metres -> Crown chain metres. */
export const crownChainS = (crownS: number) => WEST + crownS;

// ---- Where the wayside places stand ------------------------------------------------------------

const cr = (s: number, lat = 0) => roadPoint('capital', s, lat);
const qr = (s: number, lat = 0) => roadPoint('queens', s, lat);

/** The road's own frame at a place: metres along a road and off it (for builders that face the road). */
export const RL_FRAMES = {
  hedge: { road: 'capital', s: 860, lat: 40 },
  pilgrims: { road: 'capital', s: 1110, lat: 26 },
  hermit: { road: 'capital', s: 1600, lat: -110 },
  drovers: { road: 'capital', s: 1810, lat: -24 },
  refugee: { road: 'capital', s: 2105, lat: -34 },
  prospect: { road: 'capital', s: 2900, lat: -80 },
  toll: { road: 'queens', s: 520, lat: 0 },
  queensCamp: { road: 'queens', s: 880, lat: -20 },
  fort: { road: 'queens', s: 1060, lat: 74 },
  aveline: { road: 'queens', s: 1300, lat: 11 },
  kettle: { road: 'sunspire', s: 1000, lat: 24 },
} as const;
export type RlFrame = keyof typeof RL_FRAMES;
export const framePoint = (k: RlFrame, ds = 0, dl = 0): P2 => roadPoint(RL_FRAMES[k].road, RL_FRAMES[k].s + ds, RL_FRAMES[k].lat + dl);

/** Places along the roads (world x, z). */
export const RL_SITES = {
  /** the market crossroads where the Caravan Way leaves the Crown Road */
  wayfork: [-852, 58] as P2,
  hedge: framePoint('hedge'),
  pilgrims: framePoint('pilgrims'),
  hermit: framePoint('hermit'),
  drovers: framePoint('drovers'),
  refugee: framePoint('refugee'),
  prospect: framePoint('prospect'),
  toll: framePoint('toll'),
  ford: qr(520, -17),
  strongbox: qr(520.6, -19.5),
  queensCamp: framePoint('queensCamp'),
  fort: framePoint('fort'),
  aveline: framePoint('aveline'),
  kettle: framePoint('kettle'),
  /** the burnt Ashby cottage on the Crown Road (crownRoad.ts builds it) */
  ashbyCottage: cr(2390, -26),
};

/** The three old wardlights on the Crown Road (the hermit's quest). */
export const WARDLIGHTS: P2[] = [cr(1450, -7), cr(2000, 7), cr(2650, -8)];

/** New milestones: road, metres, side offset, and the distance they give to the capital (metres). */
export const RL_MILESTONES: { id: string; road: string; s: number; lat: number; toCapital: number; via: string; other: string }[] = [
  { id: 'west', road: 'west', s: 120, lat: 4.2, toCapital: WEST - 120 + CROWN, via: 'by the Crown Road', other: `ELDER GLEN ${(120 / 1609).toFixed(1)} MI` },
  { id: 'q400', road: 'queens', s: 400, lat: -5.4, toCapital: 400, via: 'to the Queen’s Gate', other: `SUNSPIRE ROAD ${((QUEENS - 400) / 1609).toFixed(1)} MI` },
  { id: 'q800', road: 'queens', s: 800, lat: -5.4, toCapital: 800, via: 'to the Queen’s Gate', other: `SUNSPIRE ROAD ${((QUEENS - 800) / 1609).toFixed(1)} MI` },
  { id: 'q1200', road: 'queens', s: 1200, lat: -5.4, toCapital: 1200, via: 'to the Queen’s Gate', other: `SUNSPIRE ROAD ${((QUEENS - 1200) / 1609).toFixed(1)} MI` },
  { id: 'c600', road: 'sunspire', s: 600, lat: 5.4, toCapital: Math.min(600 + CROWN - CROWN_FORK_S, QUEENS_JUNCTION_S - 600 + QUEENS), via: 'by the Crown Road', other: `SUNSPIRE ${((roadLen('sunspire') - 600) / 1609).toFixed(1)} MI` },
  { id: 'c1200', road: 'sunspire', s: 1200, lat: 5.4, toCapital: Math.min(1200 + CROWN - CROWN_FORK_S, QUEENS_JUNCTION_S - 1200 + QUEENS), via: 'by the Queen’s Road', other: `SUNSPIRE ${((roadLen('sunspire') - 1200) / 1609).toFixed(1)} MI` },
  { id: 'kb', road: 'kingsbridge', s: 170, lat: 5.2, toCapital: 170, via: 'to the River Gate', other: 'THE WILDLANDS ►' },
];
export const milestonePoint = (m: (typeof RL_MILESTONES)[number]) => roadPoint(m.road, m.s, m.lat);

/** Towns, gates, inns and camps where travellers start, stop and sleep. */
export type StopKind = 'town' | 'inn' | 'camp' | 'post';
export interface StopDef { id: string; name: string; kind: StopKind; at: P2 }
export const STOPS: StopDef[] = [
  { id: 'glen', name: 'Elder Glen', kind: 'town', at: [-104, 0] },
  { id: 'capital', name: 'the Royal Capital', kind: 'town', at: [-3196, -1060] },
  { id: 'southGate', name: 'the Queen’s Gate', kind: 'town', at: [-3440, -842] },
  { id: 'westGate', name: 'the River Gate', kind: 'town', at: [-3696, -1060] },
  { id: 'wilds', name: 'the edge of the Wildlands', kind: 'town', at: roadPoint('kingsbridge', roadLen('kingsbridge')) },
  { id: 'wayfork', name: 'the Wayfork', kind: 'camp', at: RL_SITES.wayfork },
  { id: 'outpost', name: 'the Crown checkpoint', kind: 'post', at: cr(640, 6) },
  { id: 'pilgrims', name: 'the Pilgrims’ Rest', kind: 'camp', at: RL_SITES.pilgrims },
  { id: 'thornfield', name: 'the Thornfield Arms', kind: 'inn', at: cr(1278, 9) },
  { id: 'drovers', name: 'the Drover’s Well', kind: 'camp', at: RL_SITES.drovers },
  { id: 'refugee', name: 'the Ashby camp', kind: 'camp', at: RL_SITES.refugee },
  { id: 'kingsmile', name: 'the Kingsmile', kind: 'inn', at: cr(2170, 12) },
  { id: 'barrow', name: 'the Barrow of the Old Kings', kind: 'post', at: cr(2790, 34) },
  { id: 'gateMarket', name: 'the Gate Market', kind: 'post', at: cr(3060, 6) },
  { id: 'toll', name: 'Halfpenny Bridge', kind: 'post', at: qr(536, 8) },
  { id: 'queensCamp', name: 'the Queen’s Camp', kind: 'camp', at: RL_SITES.queensCamp },
  { id: 'aveline', name: 'Saint Aveline’s shrine', kind: 'post', at: qr(1300, 6) },
  { id: 'kettle', name: 'the Copper Kettle', kind: 'camp', at: RL_SITES.kettle },
];
export const stopDef = (id: string) => STOPS.find((s) => s.id === id)!;

/** Every place a road event shouldn't happen on top of (towns, sites, the existing Crown Road stops): x, z, radius. */
export const BUSY_ZONES: [number, number, number][] = [
  [0, 0, 190], [-3440, -1060, 420], [2760, 150, 300],
  ...STOPS.filter((s) => s.kind !== 'town').map((s) => [s.at[0], s.at[1], 90] as [number, number, number]),
  ...Object.values(RL_SITES).map((p) => [p[0], p[1], 80] as [number, number, number]),
  [cr(640)[0], cr(640)[1], 110], [cr(1290)[0], cr(1290)[1], 150], [cr(1690, 78)[0], cr(1690, 78)[1], 120],
  [cr(2530, -112)[0], cr(2530, -112)[1], 130], [cr(2170, 24)[0], cr(2170, 24)[1], 130], [cr(1520, 7)[0], cr(1520, 7)[1], 50],
  [cr(3073)[0], cr(3073)[1], 120],
];
export const isBusy = (x: number, z: number) => BUSY_ZONES.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r);

