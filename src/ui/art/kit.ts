// The painted-icon kit: colour helpers and a shading routine every painter
// shares, so a herb, a potion and a key are lit the same way. Light comes from
// the upper left; each shape gets a body gradient, a darker band along its
// lower-right edge, a soft gloss and (optionally) an inner rim of light. The
// dark outline and drop shadow are added afterwards by icons.ts's finish().
// Painters draw in a 128 x 128 space.

export type G = CanvasRenderingContext2D;
export type PathFn = (g: G) => void;

// ---- colour ------------------------------------------------------------------------------------
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function hex([r, g, b]: [number, number, number]) {
  return '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
}
export function mix(a: string, b: string, t: number) {
  const A = rgb(a), B = rgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
/** Lighter toward a warm white (light is warm), darker toward a cool deep shade. */
export const light = (c: string, t: number) => mix(c, '#fff8e8', t);
export const dark = (c: string, t: number) => mix(c, '#140c1c', t);
export function rgba(c: string, a: number) {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

// ---- seeded randomness (icons must bake the same every time) -------------------------------
export function rng(seed: string | number) {
  let h = typeof seed === 'number' ? seed >>> 0 : 2166136261;
  if (typeof seed === 'string') for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- shading -----------------------------------------------------------------------------------
export interface ShadeOpts {
  /** how much lighter the lit side gets (0..1) */
  hi?: number;
  /** how much darker the shadow side gets (0..1) */
  lo?: number;
  /** the core shadow band along the lower right (offset in units; 0 = none) */
  band?: number;
  /** soft specular blob: 0 none, 1 normal, 2 glossy (glass, gems, metal) */
  gloss?: number;
  /** where the gloss sits (defaults to the upper left of the bounds) */
  glossAt?: [number, number, number?];
  /** a thin edge of light along the upper left */
  rim?: boolean;
  /** shape bounds, for the gradient: [x0, y0, x1, y1] */
  box?: [number, number, number, number];
  /** extra painting inside the shape, after the base and before the gloss */
  inside?: (g: G) => void;
}

/** Fill a shape with the kit's lighting. */
export function shade(g: G, path: PathFn, base: string, o: ShadeOpts = {}) {
  const [x0, y0, x1, y1] = o.box ?? [0, 0, 128, 128];
  const hi = o.hi ?? 0.32, lo = o.lo ?? 0.38, band = o.band ?? 5;
  g.save();
  g.beginPath();
  path(g);
  // Even-odd, so a ring's hole or a buckle's opening stays open.
  g.clip('evenodd');
  // Body: lit upper left to shaded lower right.
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, light(base, hi));
  gr.addColorStop(0.5, base);
  gr.addColorStop(1, dark(base, lo));
  g.fillStyle = gr;
  g.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
  // Core shadow: the same shape nudged up-left, painted lighter, leaves a dark crescent.
  if (band > 0) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgba(dark(base, 0.55), 0.55);
    g.beginPath();
    g.rect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
    g.translate(-band, -band * 1.1);
    path(g);
    g.fill('evenodd');
    g.restore();
  }
  o.inside?.(g);
  if (o.gloss) {
    const [gx, gy, gr0] = o.glossAt ?? [x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.26, Math.min(x1 - x0, y1 - y0) * 0.32];
    const r = gr0 ?? 12;
    const sp = g.createRadialGradient(gx, gy, 0, gx, gy, r);
    sp.addColorStop(0, `rgba(255,255,250,${o.gloss > 1 ? 0.95 : 0.55})`);
    sp.addColorStop(0.35, `rgba(255,255,245,${o.gloss > 1 ? 0.45 : 0.22})`);
    sp.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = sp;
    g.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  if (o.rim) {
    g.save();
    g.globalCompositeOperation = 'screen';
    g.strokeStyle = rgba(light(base, 0.7), 0.6);
    g.lineWidth = 2.2;
    g.translate(1.2, 1.4);
    g.beginPath();
    path(g);
    g.stroke();
    g.restore();
  }
  g.restore();
}

/** A thin dark line in a darker shade of the colour (seams, veins, engraving). */
export function line(g: G, c: string, w: number, draw: PathFn, alpha = 0.85) {
  g.save();
  g.strokeStyle = rgba(c, alpha);
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  draw(g);
  g.stroke();
  g.restore();
}

/** Glow behind or over something magical. */
export function glow(g: G, x: number, y: number, r: number, c: string, a = 0.7) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(light(c, 0.5), a));
  gr.addColorStop(0.4, rgba(c, a * 0.5));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A four-pointed twinkle. */
export function sparkle(g: G, x: number, y: number, r: number, c = '#fffbe8', a = 0.95) {
  g.save();
  g.fillStyle = rgba(c, a);
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
  g.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
  g.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
  g.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
  g.fill();
  g.restore();
}

// ---- common paths ----------------------------------------------------------------------------
export const circle = (x: number, y: number, r: number): PathFn => (g) => g.arc(x, y, r, 0, Math.PI * 2);
export const ellipse = (x: number, y: number, rx: number, ry: number, rot = 0): PathFn => (g) => g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
export const rrect = (x: number, y: number, w: number, h: number, r: number): PathFn => (g) => g.roundRect(x, y, w, h, r);
export function poly(pts: [number, number][]): PathFn {
  return (g) => {
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.closePath();
  };
}
/** A smooth closed shape through points (Catmull-Rom). */
export function blob(pts: [number, number][]): PathFn {
  return (g) => {
    const n = pts.length;
    const p = (i: number) => pts[(i + n) % n];
    g.moveTo(...p(0));
    for (let i = 0; i < n; i++) {
      const [x0, y0] = p(i - 1), [x1, y1] = p(i), [x2, y2] = p(i + 1), [x3, y3] = p(i + 2);
      g.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
    }
    g.closePath();
  };
}
/** A leaf from base to tip with a given width and bend. */
export function leaf(bx: number, by: number, tx: number, ty: number, w: number, bend = 0): PathFn {
  const mx = (bx + tx) / 2, my = (by + ty) / 2;
  const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return (g) => {
    g.moveTo(bx, by);
    g.quadraticCurveTo(mx + nx * (w + bend), my + ny * (w + bend), tx, ty);
    g.quadraticCurveTo(mx - nx * (w - bend), my - ny * (w - bend), bx, by);
    g.closePath();
  };
}

/** Roman numerals for tiers. */
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** A small tier plate in the lower right (brews I to V): bronze, silver, gold, then glowing. */
export function tierPlate(g: G, tier: number) {
  if (tier < 1) return;
  const metals = ['#a8703a', '#9aa6b2', '#d9a83a', '#d9a83a', '#e9c35a'];
  const c = metals[Math.min(4, tier - 1)];
  const w = 13 + ROMAN[tier].length * 6.5, x = 122 - w, y = 103;
  if (tier >= 4) glow(g, x + w / 2, y + 9, 22, tier === 5 ? '#ffd76a' : '#ffb84a', 0.55);
  shade(g, rrect(x, y, w, 19, 5), c, { gloss: 1, band: 2.5, box: [x, y, x + w, y + 19] });
  g.save();
  g.font = '700 14px Cinzel, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = dark(c, 0.75);
  g.fillText(ROMAN[tier], x + w / 2, y + 10.5);
  g.restore();
}
