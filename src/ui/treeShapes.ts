// Themed skill tree shapes. Each discipline's tree is laid out along three
// paths that draw its emblem: Cross Style's two crossed blades, Warbreaker's
// war hammer, Pyromancer's three tongues of flame, Cryomancer's snowflake,
// Smithing's anvil and so on. The nodes of branch b sit along path b, tier by
// tier from the centre node outwards, with the capstone at the end; a faint
// silhouette of the emblem is drawn behind them (ui/skillTree.ts).
//
// World space is roughly x -420..420, y -400..400 (y down). Disciplines with
// no entry here keep their family's layout (wheel, constellation, tree).

export type Pt = [number, number];

export interface TreeShape {
  /** where the centre (core) node sits */
  c: Pt;
  /** the three branches' paths, from near the centre outwards (smoothed through these points) */
  p: [Pt[], Pt[], Pt[]];
  /** the emblem behind the nodes: outlines (closed if the last point repeats the first) */
  sil: Pt[][];
  /** where to write each branch's name (default: past the end of its path) */
  label?: Pt[];
}

const spiral = (a0: number, turn: number, r0: number, r1: number, n = 7): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), a = a0 + t * turn, r = r0 + (r1 - r0) * t;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
const circle = (cx: number, cy: number, r: number, n = 40): Pt[] => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
const mirror = (ps: Pt[]): Pt[] => ps.map(([x, y]) => [-x, y]);
const spoke = (a: number, r0: number, r1: number, wob = 0): Pt[] =>
  Array.from({ length: 5 }, (_, i) => {
    const r = r0 + ((r1 - r0) * i) / 4, w = i % 2 ? wob : -wob;
    return [Math.cos(a) * r - Math.sin(a) * w, Math.sin(a) * r + Math.cos(a) * w];
  });

const flameL: Pt[] = [[0, 300], [-110, 210], [-80, 80], [-200, -40], [-150, -190], [-230, -300]];
const steam = (x: number): Pt[] => [[0, 250], [x * 0.5, 160], [x + 40, 60], [x - 30, -60], [x + 40, -180], [x, -320]];

export const TREE_SHAPES: Record<string, TreeShape> = {
  // ---- combat ------------------------------------------------------------------------------
  gale: {
    c: [0, 40],
    p: [
      [[0, 40], [-110, 0], [-230, 20], [-320, -60], [-290, -190], [-200, -260]],
      [[0, 40], [30, -70], [-10, -170], [-80, -260], [0, -340], [110, -330]],
      [[0, 40], [110, 20], [230, 60], [330, -10], [330, -150], [240, -240]],
    ],
    sil: [spiral(-2.6, 3.2, 40, 330, 24), spiral(-0.5, 3.2, 40, 330, 24), spiral(1.5, 3.2, 40, 330, 24)],
  },
  cross: {
    c: [0, 70],
    p: [
      [[0, 70], [-90, -20], [-180, -110], [-270, -200], [-340, -280]],
      [[0, 70], [0, 160], [0, 250], [0, 350]],
      [[0, 70], [90, -20], [180, -110], [270, -200], [340, -280]],
    ],
    // two swords crossed: blades up and out, hilts down and in
    sil: [
      [[-360, -300], [-330, -330], [160, 160], [130, 190], [-360, -300]],
      [[360, -300], [330, -330], [-160, 160], [-130, 190], [360, -300]],
      [[90, 230], [210, 110]], [[-90, 230], [-210, 110]],
      [[150, 170], [230, 250]], [[-150, 170], [-230, 250]],
    ],
  },
  boundary: {
    c: [0, 0],
    p: [
      [[0, 0], [-110, -60], [-210, -140], [-280, -250]],
      [[0, 0], [0, 110], [0, 220], [0, 340]],
      [[0, 0], [110, -60], [210, -140], [280, -250]],
    ],
    sil: [[[-320, -300], [320, -300], [310, 40], [200, 240], [0, 380], [-200, 240], [-310, 40], [-320, -300]], circle(0, 0, 70)],
  },
  warbreaker: {
    // a war hammer: two branches out along the head, one down the haft
    c: [0, -230],
    p: [
      [[0, -230], [-100, -235], [-200, -235], [-300, -230], [-360, -220]],
      [[0, -230], [0, -90], [0, 40], [0, 170], [0, 300]],
      [[0, -230], [100, -235], [200, -235], [300, -230], [360, -220]],
    ],
    sil: [
      [[-390, -330], [390, -330], [390, -130], [-390, -130], [-390, -330]],
      [[-28, -130], [28, -130], [22, 370], [-22, 370], [-28, -130]],
      [[-60, 330], [60, 330]],
    ],
  },
  dawnblade: {
    c: [0, 230],
    p: [
      [[0, 230], [-110, 140], [-220, 40], [-330, -60]],
      [[0, 230], [0, 90], [0, -60], [0, -200], [0, -350]],
      [[0, 230], [110, 140], [220, 40], [330, -60]],
    ],
    sil: [
      [[-26, 200], [-26, -330], [0, -390], [26, -330], [26, 200], [-26, 200]],
      [[-110, 205], [110, 205]], [[0, 205], [0, 330]],
      ...Array.from({ length: 9 }, (_, i): Pt[] => { const a = Math.PI + (i / 8) * Math.PI; return [[Math.cos(a) * 120, 230 + Math.sin(a) * 120], [Math.cos(a) * 380, 230 + Math.sin(a) * 380]]; }),
    ],
  },
  oathbreaker: {
    c: [0, 0],
    p: [
      [[0, 0], [-120, -60], [-90, -160], [-230, -210], [-200, -320]],
      [[0, 0], [30, 120], [-30, 220], [20, 340]],
      [[0, 0], [120, -60], [90, -160], [230, -210], [200, -320]],
    ],
    sil: [[[-320, -300], [-40, -300], [20, -150], [-30, 0], [40, 160], [0, 380], [-200, 240], [-310, 40], [-320, -300]], [[60, -300], [320, -300], [310, 40], [200, 240], [60, 330], [100, 150], [40, -20], [90, -160], [60, -300]]],
  },

  // ---- magic -------------------------------------------------------------------------------
  pyromancer: {
    c: [0, 300],
    p: [flameL, [[0, 300], [30, 160], [-30, 20], [30, -140], [0, -340]], mirror(flameL)],
    sil: [[[0, 360], [-200, 260], [-260, 80], [-200, -60], [-250, -330], [-120, -150], [-60, -260], [0, -390], [60, -260], [120, -150], [250, -330], [200, -60], [260, 80], [200, 260], [0, 360]]],
  },
  windcaller: {
    c: [0, 0],
    p: [spiral(-Math.PI / 2, 2.2, 70, 340), spiral(-Math.PI / 2 + 2.09, 2.2, 70, 340), spiral(-Math.PI / 2 + 4.19, 2.2, 70, 340)],
    sil: [spiral(0, 9, 20, 380, 60)],
  },
  lightbinder: {
    c: [0, 80],
    p: [spoke(-Math.PI / 2 - 0.85, 110, 400), spoke(-Math.PI / 2, 110, 420), spoke(-Math.PI / 2 + 0.85, 110, 400)],
    sil: [circle(0, 80, 90), circle(0, 80, 60), ...Array.from({ length: 16 }, (_, i): Pt[] => { const a = (i / 16) * Math.PI * 2; return [[Math.cos(a) * 100, 80 + Math.sin(a) * 100], [Math.cos(a) * 150, 80 + Math.sin(a) * 150]]; })],
  },
  cryomancer: {
    c: [0, 20],
    p: [spoke(-Math.PI / 2, 80, 380, 18), spoke(Math.PI / 6, 80, 380, 18), spoke((Math.PI * 5) / 6, 80, 380, 18)],
    sil: Array.from({ length: 6 }, (_, i): Pt[][] => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      const at = (r: number, o: number): Pt => [ca * r - sa * o, 20 + sa * r + ca * o];
      return [[at(0, 0), at(390, 0)], [at(200, 0), at(270, 60)], [at(200, 0), at(270, -60)], [at(300, 0), at(350, 40)], [at(300, 0), at(350, -40)]];
    }).flat(),
  },
  shadowcaller: {
    c: [80, 0],
    p: [
      [[80, 0], [10, -100], [-50, -200], [-60, -300], [10, -380]],
      [[80, 0], [-30, 0], [-140, 0], [-260, 0], [-360, 0]],
      [[80, 0], [10, 100], [-50, 200], [-60, 300], [10, 380]],
    ],
    sil: [[[60, -390], [-200, -300], [-360, -60], [-360, 60], [-200, 300], [60, 390], [-60, 220], [-120, 0], [-60, -220], [60, -390]]],
  },
  voidwalker: {
    c: [0, 0],
    p: [spiral(-Math.PI / 2, -2.6, 70, 360), spiral(-Math.PI / 2 + 2.09, -2.6, 70, 360), spiral(-Math.PI / 2 + 4.19, -2.6, 70, 360)],
    sil: [circle(0, 0, 50), circle(0, 0, 130), circle(0, 0, 250), circle(0, 0, 380, 60)],
  },

  // ---- callings ------------------------------------------------------------------------------
  smithing: {
    // an anvil: the horn to one side, the heel to the other, the foot below
    c: [0, -90],
    p: [
      [[0, -90], [-100, -100], [-200, -110], [-300, -90], [-380, -60]],
      [[0, -90], [0, 30], [0, 140], [0, 250], [0, 340]],
      [[0, -90], [100, -100], [200, -110], [290, -110], [340, -110]],
    ],
    sil: [[[-400, -60], [-220, -170], [330, -170], [330, -40], [120, -20], [80, 200], [200, 260], [200, 370], [-200, 370], [-200, 260], [-80, 200], [-120, -20], [-260, -30], [-400, -60]]],
  },
  cooking: {
    c: [0, 270],
    p: [steam(-200), steam(0), steam(200)],
    sil: [[[-230, 220], [230, 220], [200, 360], [-200, 360], [-230, 220]], [[-260, 220], [260, 220]], [[-280, 250], [-230, 250]], [[230, 250], [280, 250]]],
  },
  tailoring: {
    c: [0, 0],
    p: [
      [[0, 0], [-120, 80], [-240, 20], [-260, -120], [-150, -200], [-260, -320]],
      [[0, 0], [80, -90], [160, -180], [240, -270], [320, -360]],
      [[0, 0], [120, 100], [60, 220], [-80, 260], [-200, 340]],
    ],
    sil: [[[-330, 390], [330, -370], [345, -355], [-315, 405], [-330, 390]], circle(320, -362, 10, 12)],
  },
  runecraft: {
    c: [0, 330],
    p: [
      [[0, 330], [-90, 220], [-180, 110], [-270, 0], [-340, -90]],
      [[0, 330], [0, 170], [0, 10], [0, -150], [0, -330]],
      [[0, 330], [90, 220], [180, 110], [270, 0], [340, -90]],
    ],
    sil: [[[0, 390], [-370, -40], [0, -390], [370, -40], [0, 390]], [[-180, 100], [180, -160]]],
  },
  jewelcrafting: {
    c: [0, 320],
    p: [
      [[0, 320], [-90, 210], [-190, 90], [-290, -40], [-330, -150]],
      [[0, 320], [0, 170], [0, 20], [0, -130], [0, -250]],
      [[0, 320], [90, 210], [190, 90], [290, -40], [330, -150]],
    ],
    sil: [[[0, 390], [-380, -110], [-220, -300], [220, -300], [380, -110], [0, 390]], [[-380, -110], [380, -110]], [[-220, -300], [-100, -110], [0, -300], [100, -110], [220, -300]]],
  },
  prospecting: {
    // a pickaxe: two curved prongs out from the head, the haft below
    c: [0, -210],
    p: [
      [[0, -210], [-110, -230], [-210, -210], [-300, -160], [-370, -90]],
      [[0, -210], [0, -80], [0, 50], [0, 180], [0, 320]],
      [[0, -210], [110, -230], [210, -210], [300, -160], [370, -90]],
    ],
    sil: [[[-390, -60], [-220, -270], [0, -300], [220, -270], [390, -60], [200, -200], [0, -230], [-200, -200], [-390, -60]], [[-22, -230], [22, -230], [18, 370], [-18, 370], [-22, -230]]],
  },
  dungeoneering: {
    c: [0, 330],
    p: [
      [[0, 330], [-200, 300], [-240, 150], [-240, 0], [-200, -170], [-110, -280]],
      [[0, 330], [0, 200], [0, 70], [0, -60], [0, -200]],
      [[0, 330], [200, 300], [240, 150], [240, 0], [200, -170], [110, -280]],
    ],
    sil: [[[-300, 380], [-300, -60], [-260, -230], [-140, -340], [0, -380], [140, -340], [260, -230], [300, -60], [300, 380]], [[-400, 380], [400, 380]]],
  },
  beastbinding: {
    c: [0, 230],
    p: [
      [[0, 230], [-100, 140], [-200, 40], [-270, -60]],
      [[0, 230], [0, 90], [0, -60], [0, -200], [0, -310]],
      [[0, 230], [100, 140], [200, 40], [270, -60]],
    ],
    sil: [circle(0, 250, 120), circle(-280, -80, 70), circle(0, -320, 70), circle(280, -80, 70)],
  },
};

// ---- sampling ------------------------------------------------------------------------------
/** Catmull-Rom through the points, sampled densely, with cumulative lengths. */
function sample(ps: Pt[]): { pts: Pt[]; len: number[] } {
  const pts: Pt[] = [];
  const P = (i: number) => ps[Math.max(0, Math.min(ps.length - 1, i))];
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      pts.push([f(0), f(1)]);
    }
  }
  pts.push(ps[ps.length - 1]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len };
}
const cache = new Map<Pt[], ReturnType<typeof sample>>();

/** The point at fraction u (0..1, by length) along a path, and the unit tangent there. */
export function along(path: Pt[], u: number): { p: Pt; t: Pt } {
  let s = cache.get(path);
  if (!s) cache.set(path, (s = sample(path)));
  const total = s.len[s.len.length - 1], want = Math.max(0, Math.min(1, u)) * total;
  let i = 1;
  while (i < s.len.length - 1 && s.len[i] < want) i++;
  const a = s.pts[i - 1], b = s.pts[i];
  const k = (want - s.len[i - 1]) / Math.max(1e-6, s.len[i] - s.len[i - 1]);
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * k, a[1] + dy * k], t: [dx / l, dy / l] };
}

/** The smoothed points of a path (for drawing it). */
export function smooth(path: Pt[]): Pt[] {
  let s = cache.get(path);
  if (!s) cache.set(path, (s = sample(path)));
  return s.pts;
}
