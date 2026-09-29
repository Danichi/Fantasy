// Build the macro world data from the painted world map.
//
//   node tools/build-worldmap.mjs
//
// Input:  tools/data/worldmap.webp (1536x1024, 1 px = 14.8 m) and
//         src/world/data/regions.json (region outlines in map pixels).
// Output: public/assets/world/macro.png   RGBA, one texel per 60 m cell:
//           R = region index (regions.json order, 255 = open ocean)
//           G = relief class (see RELIEF below)
//           B = elevation, 0..255 -> ELEV_MIN..ELEV_MAX metres (smoothed)
//           A = 255 (opaque; browsers would premultiply a data alpha away)
//         public/assets/world/macro-mountain.png  mountainness 0..255 per cell
//           (smoothed share of mountain/snow nearby)
//         public/assets/world/map.webp    the painted map, for the world-map UI
//                                         and far-terrain tint
//         screenshots/worldmap-debug.png  classified preview for review
import fs from 'node:fs';
import sharp from 'sharp';

const SRC = 'tools/data/worldmap.webp';
const DEF = JSON.parse(fs.readFileSync('src/world/data/regions.json', 'utf8'));
const OUT = 'public/assets/world';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync('screenshots', { recursive: true });

const MPP = DEF.metresPerPx; // 14.8
const CELL = 60; // metres per macro cell
const [PW, PH] = DEF.mapPx;
const GW = Math.ceil((PW * MPP) / CELL);
const GH = Math.ceil((PH * MPP) / CELL);
const PX_PER_CELL = CELL / MPP;
export const ELEV_MIN = -80, ELEV_MAX = 720;

// Relief classes (keep in sync with src/world/worldMap.ts).
const RELIEF = { deep: 0, shelf: 1, beach: 2, open: 3, forest: 4, mountain: 5, snow: 6, sand: 7, mesa: 8, marsh: 9, lava: 10, volcanic: 11 };

// Legend panels, compass and title painted over the map: classified from neighbours instead.
const MASKS = [[0, 0, 180, 254], [1298, 6, 1534, 338], [0, 830, 340, 1024], [1352, 786, 1536, 1024], [1370, 925, 1536, 1000]];

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;

// ---- region lookup ---------------------------------------------------------------
const pointInPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const regionAt = (px, py) => {
  for (let i = 0; i < DEF.regions.length; i++) {
    const r = DEF.regions[i];
    if (r.circle ? Math.hypot(px - r.circle[0], py - r.circle[1]) <= r.circle[2] : pointInPoly(px, py, r.poly)) return i;
  }
  return 255;
};
const regionId = (i) => (i === 255 ? 'ocean' : DEF.regions[i].id);

// ---- average colour per cell ------------------------------------------------------
const N = GW * GH;
const mean = new Float32Array(N * 3);
const masked = new Uint8Array(N);
for (let gy = 0; gy < GH; gy++) {
  for (let gx = 0; gx < GW; gx++) {
    const x0 = Math.floor(gx * PX_PER_CELL), x1 = Math.min(PW, Math.ceil((gx + 1) * PX_PER_CELL));
    const y0 = Math.floor(gy * PX_PER_CELL), y1 = Math.min(PH, Math.ceil((gy + 1) * PX_PER_CELL));
    const c = gy * GW + gx;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (x0 >= PW || y0 >= PH || MASKS.some(([a, b, c2, d]) => cx >= a && cx < c2 && cy >= b && cy < d)) {
      masked[c] = 1;
      continue;
    }
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = (y * PW + x) * ch;
      r += data[k]; g += data[k + 1]; b += data[k + 2]; n++;
    }
    mean[c * 3] = r / n; mean[c * 3 + 1] = g / n; mean[c * 3 + 2] = b / n;
  }
}

// ---- classification ---------------------------------------------------------------
const hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx < 1e-6 ? 0 : d / mx, mx];
};

const region = new Uint8Array(N);
const relief = new Uint8Array(N);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const c = gy * GW + gx;
  const px = (gx + 0.5) * PX_PER_CELL, py = (gy + 0.5) * PX_PER_CELL;
  region[c] = regionAt(px, py);
  if (masked[c]) { relief[c] = 255; continue; }
  const [r, g, b] = [mean[c * 3], mean[c * 3 + 1], mean[c * 3 + 2]];
  const [h, s, v] = hsv(r, g, b);
  const rid = regionId(region[c]);
  let cls;
  let water = b - g > 16 && b > r + 28 && s > 0.3;
  // Mountain ranges paint their snow shadows blue: only deep, saturated blue is sea there.
  if (rid === 'frostedPeaks') water = false;
  if ((rid === 'whiteMountains' || rid === 'deepMountains') && water && !(s > 0.6 && v < 0.5)) water = false;
  if (water) cls = v > 0.4 || g > 95 ? RELIEF.shelf : RELIEF.deep;
  else if (region[c] === 255) cls = v > 0.35 ? RELIEF.shelf : RELIEF.deep; // open ocean: map labels are not land
  else if (!water && (rid === 'frostedPeaks' || rid === 'whiteMountains' || rid === 'deepMountains') && b - g > 16 && b > r + 28) cls = v > 0.45 ? RELIEF.snow : RELIEF.mountain;
  else if (rid === 'demonContinent') {
    cls = (h < 25 || h > 330) && s > 0.55 && v > 0.4 ? RELIEF.lava : v < 0.2 ? RELIEF.volcanic : s < 0.3 ? RELIEF.volcanic : RELIEF.mountain;
  } else if (s < 0.28 && v > 0.5) cls = RELIEF.snow;
  else if (s < 0.3 && v > 0.14) cls = RELIEF.mountain;
  else if (h >= 12 && h <= 48 && s > 0.45) {
    if (rid === 'goldenExpanse') cls = v > 0.62 ? RELIEF.sand : RELIEF.mesa;
    else cls = v > 0.72 ? RELIEF.beach : RELIEF.open; // golden fields elsewhere
  } else if (h > 48 && h < 175) cls = v < 0.2 ? RELIEF.forest : RELIEF.open;
  else if (h >= 175 && h < 215) cls = v < 0.28 ? RELIEF.forest : RELIEF.marsh; // teal-dark jungle / wet ground
  else if (h >= 215 && h < 320) cls = rid === 'deepWilderness' ? RELIEF.forest : v < 0.25 ? RELIEF.forest : RELIEF.mountain;
  else cls = v < 0.22 ? RELIEF.forest : RELIEF.open;
  // Region character: mountain ranges read as mountains even where painted dark.
  if ((rid === 'deepMountains' || rid === 'whiteMountains' || rid === 'frostedPeaks') && cls === RELIEF.forest && v < 0.3) cls = RELIEF.mountain;
  relief[c] = cls;
}

// Masked cells (legend panels) take their region's typical relief, varied with noise.
const hash = (x, y) => {
  const t = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return t - Math.floor(t);
};
const smoothNoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
};
const DEFAULT_RELIEF = {
  ocean: [RELIEF.deep], deepWilderness: [RELIEF.forest, RELIEF.forest, RELIEF.marsh, RELIEF.open], wildlands: [RELIEF.forest, RELIEF.open, RELIEF.mountain],
  deepMountains: [RELIEF.mountain, RELIEF.mountain, RELIEF.snow], demonContinent: [RELIEF.volcanic, RELIEF.volcanic, RELIEF.mountain, RELIEF.lava],
  valoria: [RELIEF.open, RELIEF.forest], azureIsles: [RELIEF.deep], sunkenIsles: [RELIEF.deep], shatteredIsles: [RELIEF.deep], emeraldIsles: [RELIEF.deep],
};
// Land or water under a panel comes from the nearest real cell (breadth-first).
const nearestWater = new Int8Array(N).fill(-1);
{
  const queue = [];
  for (let c = 0; c < N; c++) if (relief[c] !== 255) {
    nearestWater[c] = relief[c] === RELIEF.deep || relief[c] === RELIEF.shelf ? 1 : 0;
    queue.push(c);
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], gx = c % GW, gy = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      const n = y * GW + x;
      if (nearestWater[n] !== -1) continue;
      nearestWater[n] = nearestWater[c];
      queue.push(n);
    }
  }
}
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const c = gy * GW + gx;
  if (relief[c] !== 255) continue;
  if (nearestWater[c] === 1 || region[c] === 255) {
    relief[c] = RELIEF.deep;
    continue;
  }
  const opts = DEFAULT_RELIEF[regionId(region[c])] ?? [RELIEF.open, RELIEF.forest];
  const n = smoothNoise(gx * 0.18, gy * 0.18) * 0.7 + smoothNoise(gx * 0.5, gy * 0.5) * 0.3;
  relief[c] = opts[Math.min(opts.length - 1, Math.floor(n * opts.length))];
}

// Majority filter on land: removes the thin strokes of painted labels and icons.
for (let pass = 0; pass < 2; pass++) {
  const next = relief.slice();
  for (let gy = 1; gy < GH - 1; gy++) for (let gx = 1; gx < GW - 1; gx++) {
    const c = gy * GW + gx;
    if (relief[c] === RELIEF.deep || relief[c] === RELIEF.shelf) continue;
    const votes = new Map();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = relief[(gy + dy) * GW + gx + dx];
      votes.set(v, (votes.get(v) ?? 0) + 1);
    }
    const [top, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n >= 5 && top !== relief[c]) next[c] = top;
  }
  relief.set(next);
}

// Town footprints are authored in-game: open ground (keeping the port's harbour water).
for (let c = 0; c < N; c++) {
  const rid = regionId(region[c]);
  if ((rid === 'elderGlen' || rid === 'royalCapital' || rid === 'portAurelle') && relief[c] !== RELIEF.deep && relief[c] !== RELIEF.shelf) relief[c] = RELIEF.open;
}

// Painted hills in the lowland kingdoms are grassy hills, not bare rock:
// they keep extra height (HILLS) but take meadow relief.
const LOWLAND = new Set(['cresha', 'southernMarches', 'valoria', 'elderGlen', 'royalCapital', 'portAurelle']);
const hill = new Uint8Array(N);
for (let c = 0; c < N; c++) {
  if (relief[c] === RELIEF.mountain && LOWLAND.has(regionId(region[c]))) {
    relief[c] = RELIEF.open;
    hill[c] = 1;
  }
}

// Coastline: a thin beach where land meets shallow water.
const isWater = (cls) => cls === RELIEF.deep || cls === RELIEF.shelf;
for (let gy = 1; gy < GH - 1; gy++) for (let gx = 1; gx < GW - 1; gx++) {
  const c = gy * GW + gx;
  if (isWater(relief[c]) || relief[c] === RELIEF.mountain || relief[c] === RELIEF.snow || relief[c] === RELIEF.lava || relief[c] === RELIEF.volcanic) continue;
  if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWater(relief[(gy + dy) * GW + gx + dx]))) relief[c] = RELIEF.beach;
}

// ---- elevation ---------------------------------------------------------------------
const brightness = (c) => (mean[c * 3] + mean[c * 3 + 1] + mean[c * 3 + 2]) / (3 * 255);
const base = new Float32Array(N);
const mount = new Float32Array(N);
for (let c = 0; c < N; c++) {
  const v = masked[c] ? 0.5 : brightness(c);
  switch (relief[c]) {
    case RELIEF.deep: base[c] = -28 - (0.35 - Math.min(v, 0.35)) * 120; break;
    case RELIEF.shelf: base[c] = -7; break;
    case RELIEF.beach: base[c] = 0.6; break;
    case RELIEF.open: base[c] = hill[c] ? 30 + v * 60 : 5; if (hill[c]) mount[c] = 0.25; break;
    case RELIEF.forest: base[c] = 9; break;
    case RELIEF.marsh: base[c] = 0.4; break;
    case RELIEF.sand: base[c] = 14; break;
    case RELIEF.mesa: base[c] = 48; break;
    case RELIEF.mountain: {
      // True ranges tower; painted hills in the lowland kingdoms stay hills.
      const rid = regionId(region[c]);
      const lowland = rid === 'cresha' || rid === 'southernMarches' || rid === 'valoria' || rid === 'wildlands' || rid === 'deepWilderness' || rid === 'goldenExpanse' || rid === 'elderGlen' || rid === 'royalCapital';
      base[c] = lowland ? 45 + v * 70 : 170 + v * 260;
      mount[c] = lowland ? 0.35 : 0.75;
      break;
    }
    case RELIEF.snow: base[c] = 320 + v * 360; mount[c] = 1; break;
    case RELIEF.lava: base[c] = 30; mount[c] = 0.35; break;
    case RELIEF.volcanic: base[c] = 90 + v * 200; mount[c] = 0.7; break;
  }
}
const blur = (src, radius, keepSign) => {
  const tmp = new Float32Array(N), out = new Float32Array(N);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    let s = 0, n = 0;
    for (let d = -radius; d <= radius; d++) {
      const x = Math.min(GW - 1, Math.max(0, gx + d));
      s += src[gy * GW + x]; n++;
    }
    tmp[gy * GW + gx] = s / n;
  }
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    let s = 0, n = 0;
    for (let d = -radius; d <= radius; d++) {
      const y = Math.min(GH - 1, Math.max(0, gy + d));
      s += tmp[y * GW + gx]; n++;
    }
    out[gy * GW + gx] = s / n;
  }
  if (keepSign) {
    // Blur must not move the coastline: land stays above sea level, water below.
    for (let c = 0; c < N; c++) {
      const w = isWater(relief[c]);
      if (w && out[c] > -2.5) out[c] = -2.5;
      if (!w && out[c] < 0.4) out[c] = 0.4;
    }
  }
  return out;
};
const elev = blur(blur(base, 2, true), 1, true);
const mountain = blur(blur(mount, 2, false), 2, false);

// ---- write outputs -----------------------------------------------------------------
const rgba = Buffer.alloc(N * 4);
for (let c = 0; c < N; c++) {
  rgba[c * 4] = region[c];
  rgba[c * 4 + 1] = relief[c];
  rgba[c * 4 + 2] = Math.round(Math.max(0, Math.min(255, ((elev[c] - ELEV_MIN) / (ELEV_MAX - ELEV_MIN)) * 255)));
  rgba[c * 4 + 3] = 255; // opaque: browsers premultiply alpha when decoding images
}
await sharp(rgba, { raw: { width: GW, height: GH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(`${OUT}/macro.png`);
const mgrey = Buffer.alloc(N);
for (let c = 0; c < N; c++) mgrey[c] = Math.round(Math.max(0, Math.min(1, mountain[c])) * 255);
await sharp(mgrey, { raw: { width: GW, height: GH, channels: 1 } }).png({ compressionLevel: 9 }).toFile(`${OUT}/macro-mountain.png`);
await sharp(SRC).webp({ quality: 86 }).toFile(`${OUT}/map.webp`);

// Debug preview: relief colours, region borders darkened.
const PAL = [[20, 40, 90], [40, 120, 160], [230, 215, 150], [120, 175, 70], [30, 95, 45], [120, 115, 110], [240, 245, 250], [235, 170, 80], [170, 95, 55], [80, 120, 90], [230, 70, 20], [60, 40, 45]];
const dbg = Buffer.alloc(N * 3);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const c = gy * GW + gx;
  const p = PAL[relief[c]] ?? [255, 0, 255];
  const edge = gx > 0 && gy > 0 && (region[c] !== region[c - 1] || region[c] !== region[c - GW]);
  const shade = 0.55 + 0.45 * ((elev[c] - ELEV_MIN) / (ELEV_MAX - ELEV_MIN));
  for (let k = 0; k < 3; k++) dbg[c * 3 + k] = edge ? 0 : Math.min(255, p[k] * shade + 30);
}
await sharp(dbg, { raw: { width: GW, height: GH, channels: 3 } }).resize(GW * 3, GH * 3, { kernel: 'nearest' }).png().toFile('screenshots/worldmap-debug.png');
const counts = {};
for (let c = 0; c < N; c++) counts[relief[c]] = (counts[relief[c]] ?? 0) + 1;
console.log(`macro ${GW}x${GH} cells of ${CELL} m (${((GW * CELL) / 1000).toFixed(1)} x ${((GH * CELL) / 1000).toFixed(1)} km)`, counts);
