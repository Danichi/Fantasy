// Turn a painted source image into a seamless, game-ready texture set.
//
//   node tools/make-texture.mjs <name> <source-image> [options]
//
//   --size=1024          albedo size (square)
//   --normal-size=512    normal map size
//   --normal=1.0         normal strength (0 = no normal map)
//   --wrap=xy|x|y|none   which axes to make seamless (default xy)
//   --overlap=0.04,0.26  smallest and largest overlap tried (fraction of the image)
//   --feather=3          softness (px of the source) of the join; --feather-x / --feather-y per axis
//   --flatten=0.6        how much uneven lighting to remove (0..1)
//   --calm=0             remove this much of the broad colour blotching, so a
//                        tile repeated across a wall doesn't show the same stain
//                        every two metres (the shader adds drift in world space)
//   --trim=0.015         cut this much off every edge first (borders, vignettes)
//   --tint=#rrggbb       pull the average colour toward this
//   --tint-amount=0.6
//   --repeat=1           texture repeats per material tile (feature scale)
//   --decal              one whole object (window, door): keep its shape, no tiling
//   --glow               (decal) also write a mask of its glass for lit windows
//
// Writes public/assets/textures/painted/<name>_albedo.webp (+ _normal.webp), a
// reference copy in docs/art-bible/materials/, and records the set in
// src/render/paintedSets.json (src/render/painted.ts reads it).
//
// Seams: an image does not tile by itself. For each axis the tool tries a
// range of overlaps, lays one edge over the other and finds the path down the
// overlap where the two differ least (a minimum-error cut, as in image
// quilting). The overlap whose cut is cheapest wins, so rows of tiles and
// courses of stone meet in step and the join runs along mortar lines and gaps
// instead of ghosting two pictures over each other.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [name, src] = process.argv.slice(2);
if (!name || !src) {
  console.error('usage: node tools/make-texture.mjs <name> <source-image> [--size=1024] ...');
  process.exit(1);
}
const opt = Object.fromEntries(
  process.argv.slice(4).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || '1'];
  }),
);
const SIZE = +(opt.size ?? 1024);
const NSIZE = +(opt['normal-size'] ?? 512);
const NORMAL = +(opt.normal ?? 1);
const WRAP = opt.wrap ?? 'xy';
const [OV0, OV1] = (opt.overlap ?? '0.04,0.26').split(',').map(Number);
const FLATTEN = +(opt.flatten ?? 0.6);
const TRIM = +(opt.trim ?? 0.015);
const TINT_AMOUNT = +(opt['tint-amount'] ?? 0.6);
const REPEAT = +(opt.repeat ?? 1);
const FEATHER_X = +(opt['feather-x'] ?? opt.feather ?? 3);
const FEATHER_Y = +(opt['feather-y'] ?? opt.feather ?? 3);
const CALM = +(opt.calm ?? 0);
const OUT = 'public/assets/textures/painted';
const REF = 'docs/art-bible/materials';

/** An RGB float image (0..255), row-major. */
class Img {
  constructor(w, h, d) {
    this.w = w;
    this.h = h;
    this.d = d ?? new Float32Array(w * h * 3);
  }
  transpose() {
    const o = new Img(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const a = (y * this.w + x) * 3, b = (x * this.h + y) * 3;
      o.d[b] = this.d[a]; o.d[b + 1] = this.d[a + 1]; o.d[b + 2] = this.d[a + 2];
    }
    return o;
  }
}

async function load(file) {
  const meta = await sharp(file).metadata();
  const t = Math.round(Math.min(meta.width, meta.height) * TRIM);
  const side = Math.min(meta.width, meta.height) - t * 2;
  const { data, info } = await sharp(file)
    .extract({ left: Math.floor((meta.width - side) / 2), top: Math.floor((meta.height - side) / 2), width: side, height: side })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new Img(info.width, info.height, Float32Array.from(data));
}

const luma = (d, i) => d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;

/** Even out lighting: divide by a very soft copy of the brightness. */
function flatten(img, amount) {
  if (amount <= 0) return;
  const G = 12; // a 12 x 12 grid of average brightness
  const cell = new Float32Array(G * G), cnt = new Float32Array(G * G);
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const k = Math.min(G - 1, Math.floor((y / img.h) * G)) * G + Math.min(G - 1, Math.floor((x / img.w) * G));
    cell[k] += luma(img.d, (y * img.w + x) * 3);
    cnt[k]++;
  }
  let mean = 0;
  for (let k = 0; k < G * G; k++) { cell[k] /= cnt[k]; mean += cell[k] / (G * G); }
  // Soften the grid twice so only the broadest light and dark survive.
  for (let pass = 0; pass < 2; pass++) {
    const c = cell.slice();
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= G || b >= G) continue;
        s += c[b * G + a]; n++;
      }
      cell[j * G + i] = s / n;
    }
  }
  const at = (gx, gy) => cell[Math.max(0, Math.min(G - 1, gy)) * G + Math.max(0, Math.min(G - 1, gx))];
  for (let y = 0; y < img.h; y++) {
    const fy = (y / img.h) * G - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < img.w; x++) {
      const fx = (x / img.w) * G - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      const low = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      const k = Math.pow(mean / Math.max(low, 1), amount);
      const i = (y * img.w + x) * 3;
      img.d[i] *= k; img.d[i + 1] *= k; img.d[i + 2] *= k;
    }
  }
}

/**
 * Make the image tile along x. For each candidate overlap the cheapest cut
 * down it is found (dynamic programming); the overlap whose cut is cheapest
 * wins. Returns the narrower image.
 */
function tileX(img, F) {
  const { w, h, d } = img;
  const b0 = Math.max(2 * F + 8, Math.round(w * OV0)), b1 = Math.max(b0, Math.round(w * OV1));
  const lo = F + 1;
  /** Cheapest path down an overlap of B columns: its mean cost and (if kept) the path. */
  const cutFor = (B, keep) => {
    const hi = B - F - 2;
    let prev = new Float32Array(B).fill(1e12), cur = new Float32Array(B).fill(1e12);
    const from = keep ? new Int16Array(B * h) : null;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = lo; x <= hi; x++) {
        const a = (row + x) * 3, b = (row + w - B + x) * 3;
        const dr = d[a] - d[b], dg = d[a + 1] - d[b + 1], db = d[a + 2] - d[b + 2];
        const c = dr * dr + dg * dg + db * db;
        if (y === 0) { cur[x] = c; continue; }
        let m = prev[x], mx = x;
        if (x > lo && prev[x - 1] < m) { m = prev[x - 1]; mx = x - 1; }
        if (x < hi && prev[x + 1] < m) { m = prev[x + 1]; mx = x + 1; }
        cur[x] = m + c;
        if (from) from[y * B + x] = mx;
      }
      const t = prev; prev = cur; cur = t;
    }
    let cx = lo;
    for (let x = lo; x <= hi; x++) if (prev[x] < prev[cx]) cx = x;
    const total = prev[cx];
    if (!keep) return { mean: total / h };
    const cut = new Int16Array(h);
    for (let y = h - 1; y >= 0; y--) { cut[y] = cx; if (y > 0) cx = from[y * B + cx]; }
    return { mean: total / h, cut };
  };
  let best = b0, bestScore = Infinity;
  const step = Math.max(2, Math.round(w / 300));
  for (let B = b0; B <= b1; B += step) {
    const score = cutFor(B, false).mean * (1 + 0.3 * (B / w)); // prefer keeping more of the picture
    if (score < bestScore) { bestScore = score; best = B; }
  }
  const B = best;
  const { cut, mean } = cutFor(B, true);
  // Compose: left of the cut continues from the far edge, right of it is the near edge.
  const W = w - B;
  const o = new Img(W, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 3, a = (y * w + x) * 3;
    if (x >= B) { o.d[k] = d[a]; o.d[k + 1] = d[a + 1]; o.d[k + 2] = d[a + 2]; continue; }
    const b = (y * w + w - B + x) * 3;
    let t = (x - cut[y] + F) / (2 * F);
    t = t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
    o.d[k] = d[b] + (d[a] - d[b]) * t; o.d[k + 1] = d[b + 1] + (d[a + 1] - d[b + 1]) * t; o.d[k + 2] = d[b + 2] + (d[a + 2] - d[b + 2]) * t;
  }
  return { img: o, overlap: B / w, err: Math.sqrt(mean) };
}

function toBuffer(img) {
  const b = Buffer.alloc(img.w * img.h * 3);
  for (let i = 0; i < b.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(img.d[i])));
  return b;
}

/** Tangent-space normal map from brightness: dark gaps sink, light edges stand up. */
function normalMap(rgb, n, strength) {
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = (rgb[i * 3] * 0.3 + rgb[i * 3 + 1] * 0.55 + rgb[i * 3 + 2] * 0.15) / 255;
  const wrap = (v) => ((v % n) + n) % n;
  // Wrapped box blur (run three times: close to a gaussian).
  const blur = (f, r) => {
    let a = f;
    for (let pass = 0; pass < 3; pass++) {
      const t = new Float32Array(n * n), o = new Float32Array(n * n);
      for (let y = 0; y < n; y++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += a[y * n + wrap(x)];
        for (let x = 0; x < n; x++) { t[y * n + x] = s / (2 * r + 1); s += a[y * n + wrap(x + r + 1)] - a[y * n + wrap(x - r)]; }
      }
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += t[wrap(y) * n + x];
        for (let y = 0; y < n; y++) { o[y * n + x] = s / (2 * r + 1); s += t[wrap(y + r + 1) * n + x] - t[wrap(y - r) * n + x]; }
      }
      a = o;
    }
    return a;
  };
  // Height = shape detail only: drop the broad tone (a darker stone is not a deeper stone).
  const broad = blur(h, Math.round(n / 14)), fine = blur(h, 1);
  const hgt = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) hgt[i] = fine[i] - broad[i] * 0.85;
  const out = Buffer.alloc(n * n * 3);
  const s = strength * 5.5;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xm = wrap(x - 1), xp = wrap(x + 1), ym = wrap(y - 1), yp = wrap(y + 1);
    const gx = (hgt[ym * n + xp] + 2 * hgt[y * n + xp] + hgt[yp * n + xp] - hgt[ym * n + xm] - 2 * hgt[y * n + xm] - hgt[yp * n + xm]) * s;
    const gy = (hgt[yp * n + xm] + 2 * hgt[yp * n + x] + hgt[yp * n + xp] - hgt[ym * n + xm] - 2 * hgt[ym * n + x] - hgt[ym * n + xp]) * s;
    // Image y runs down, texture v runs up: +gy (rising downward) tilts the normal up.
    const nx = -gx, ny = gy, l = Math.hypot(nx, ny, 1);
    const k = (y * n + x) * 3;
    out[k] = Math.round((nx / l * 0.5 + 0.5) * 255);
    out[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    out[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
  }
  return out;
}

/** Pull the broad colour (a wrapped blur of a small copy) toward the average. */
async function calm(albedo, amount) {
  const G = 64, R = 5;
  const small = await sharp(albedo, { raw: { width: SIZE, height: SIZE, channels: 3 } }).resize(G, G, { kernel: 'cubic' }).raw().toBuffer();
  let low = Float32Array.from(small);
  const wrapG = (v) => ((v % G) + G) % G;
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(G * G * 3);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) s += low[(wrapG(y + dy) * G + wrapG(x + dx)) * 3 + c];
      o[(y * G + x) * 3 + c] = s / ((2 * R + 1) * (2 * R + 1));
    }
    low = o;
  }
  const mean = [0, 0, 0];
  for (let i = 0; i < low.length; i += 3) for (let c = 0; c < 3; c++) mean[c] += low[i + c] / (G * G);
  const at = (gx, gy, c) => low[(wrapG(gy) * G + wrapG(gx)) * 3 + c];
  for (let y = 0; y < SIZE; y++) {
    const fy = (y / SIZE) * G - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < SIZE; x++) {
      const fx = (x / SIZE) * G - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      const k = (y * SIZE + x) * 3;
      for (let c = 0; c < 3; c++) {
        const l = (at(x0, y0, c) * (1 - tx) + at(x0 + 1, y0, c) * tx) * (1 - ty) + (at(x0, y0 + 1, c) * (1 - tx) + at(x0 + 1, y0 + 1, c) * tx) * ty;
        albedo[k + c] = Math.max(0, Math.min(255, Math.round(albedo[k + c] - (l - mean[c]) * amount)));
      }
    }
  }
}

// A decal is one whole thing (a window, a door), not a tiling surface: it keeps
// its shape and is not made seamless. --glow also writes a mask of its glass
// (the blue of the panes), which lit windows shine through at night.
if (opt.decal) {
  const meta = await sharp(src).metadata();
  const w = SIZE, h = Math.round((SIZE * meta.height) / meta.width / 4) * 4;
  const albedo = await sharp(src).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(REF, { recursive: true });
  await sharp(albedo, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 90, effort: 5 }).toFile(`${OUT}/${name}_albedo.webp`);
  await sharp(albedo, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 86 }).toFile(`${REF}/${name}.jpg`);
  if (NORMAL > 0) {
    const small = await sharp(albedo, { raw: { width: w, height: h, channels: 3 } }).resize(NSIZE, NSIZE, { fit: 'fill' }).raw().toBuffer();
    await sharp(normalMap(small, NSIZE, NORMAL), { raw: { width: NSIZE, height: NSIZE, channels: 3 } }).webp({ quality: 92, effort: 5 }).toFile(`${OUT}/${name}_normal.webp`);
  }
  if (opt.glow) {
    const glow = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      let g = (albedo[i * 3 + 2] - albedo[i * 3] - 10) / 36;
      g = g < 0 ? 0 : g > 1 ? 1 : g;
      // Brighter toward the middle of each pane, as the painting is.
      const v = Math.round(g * Math.min(255, 110 + albedo[i * 3 + 2] * 1.1));
      glow[i * 3] = glow[i * 3 + 1] = glow[i * 3 + 2] = v;
    }
    await sharp(glow, { raw: { width: w, height: h, channels: 3 } }).resize(w / 2, h / 2).webp({ quality: 88 }).toFile(`${OUT}/${name}_glow.webp`);
  }
  const file = 'src/render/paintedSets.json';
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  all[name] = { decal: true, normal: NORMAL > 0, glow: !!opt.glow, aspect: +(w / h).toFixed(4), repeat: 1, color: '#808080', source: path.basename(src) };
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(all).sort()), null, 2) + '\n');
  console.log(JSON.stringify({ name, decal: `${w}x${h}` }));
  process.exit(0);
}

let img = await load(src);
flatten(img, FLATTEN);
const report = { name };
if (WRAP.includes('x')) {
  const r = tileX(img, FEATHER_X);
  img = r.img;
  report.overlapX = +r.overlap.toFixed(3);
  report.seamX = +r.err.toFixed(1);
}
if (WRAP.includes('y')) {
  const r = tileX(img.transpose(), FEATHER_Y);
  img = r.img.transpose();
  report.overlapY = +r.overlap.toFixed(3);
  report.seamY = +r.err.toFixed(1);
}
// Features keep their shape when the two axes lost different amounts.
const aspect = img.w / img.h;

const albedo = await sharp(toBuffer(img), { raw: { width: img.w, height: img.h, channels: 3 } })
  .resize(SIZE, SIZE, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();

// The normal map comes from the picture as painted, before calming or tinting.
let normal = null;
if (NORMAL > 0) {
  const small = await sharp(albedo, { raw: { width: SIZE, height: SIZE, channels: 3 } }).resize(NSIZE, NSIZE, { kernel: 'lanczos3' }).raw().toBuffer();
  normal = normalMap(small, NSIZE, NORMAL);
}

if (CALM > 0) await calm(albedo, CALM);

if (opt.tint) {
  const t = opt.tint.replace('#', '');
  const target = [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16));
  const mean = [0, 0, 0];
  for (let i = 0; i < albedo.length; i += 3) for (let c = 0; c < 3; c++) mean[c] += albedo[i + c];
  const px = albedo.length / 3;
  const k = mean.map((m, c) => 1 + (target[c] / Math.max(m / px, 1) - 1) * TINT_AMOUNT);
  for (let i = 0; i < albedo.length; i += 3) for (let c = 0; c < 3; c++) albedo[i + c] = Math.max(0, Math.min(255, Math.round(albedo[i + c] * k[c])));
  report.tint = opt.tint;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REF, { recursive: true });
const raw = { raw: { width: SIZE, height: SIZE, channels: 3 } };
await sharp(albedo, raw).webp({ quality: 90, effort: 5 }).toFile(`${OUT}/${name}_albedo.webp`);
if (normal) await sharp(normal, { raw: { width: NSIZE, height: NSIZE, channels: 3 } }).webp({ quality: 92, effort: 5 }).toFile(`${OUT}/${name}_normal.webp`);
// Reference sheet for the art bible: the tile laid out 2 x 2, so the repeat can be judged by eye.
const tile = await sharp(albedo, raw).resize(512, 512).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#000' } })
  .composite([{ input: tile, left: 0, top: 0 }, { input: tile, left: 512, top: 0 }, { input: tile, left: 0, top: 512 }, { input: tile, left: 512, top: 512 }])
  .jpeg({ quality: 86 }).toFile(`${REF}/${name}.jpg`);

// Average colour (sRGB), so the game can show it while the picture loads.
const avg = [0, 0, 0];
for (let i = 0; i < albedo.length; i += 3) for (let c = 0; c < 3; c++) avg[c] += albedo[i + c];
const hex = '#' + avg.map((v) => Math.round(v / (albedo.length / 3)).toString(16).padStart(2, '0')).join('');

const manifestFile = 'src/render/paintedSets.json';
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
manifest[name] = { normal: !!normal, aspect: +aspect.toFixed(4), repeat: REPEAT, color: hex, source: path.basename(src) };
fs.writeFileSync(manifestFile, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
console.log(JSON.stringify({ ...report, aspect: +aspect.toFixed(3), color: hex }));
