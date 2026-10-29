import { shade, line, glow, sparkle, light, dark, rgba, mix, ellipse, rrect, tierPlate, rng, type G, type PathFn } from './kit';
import { drawGlyph } from './glyphs';

// Potions, draughts, elixirs, oils and thrown flasks. A vessel shape (by what
// the brew is for), glass with a gloss, the liquid in its own colours, a
// stopper or wax seal, a parchment label with an ink emblem, and an effect:
// a glow for magic, smoke, frost, embers or rising bubbles.

export type Vessel = 'round' | 'heart' | 'tall' | 'cone' | 'vial' | 'square' | 'gourd' | 'oil' | 'bomb' | 'jar' | 'cup' | 'bottle';
export type Stopper = 'cork' | 'wax' | 'gold' | 'none';
export type Fx = 'glow' | 'sparkle' | 'smoke' | 'toxic' | 'frost' | 'embers' | 'bubbles' | 'steam' | 'dark';

export interface PotionArt {
  vessel: Vessel;
  /** liquid: top colour, bottom colour */
  liquid: [string, string];
  /** liquid surface height, 0 (empty) to 1 (full) */
  level?: number;
  stopper?: Stopper;
  /** wax seal / cap / ribbon colour */
  seal?: string;
  /** label emblem (glyphs.ts), or none */
  glyph?: string;
  fx?: Fx[];
  /** brew strength I..V */
  tier?: number;
  /** tinted glass (green bottle glass, smoked glass) */
  glass?: string;
}

interface Shape {
  body: PathFn;
  /** the part that holds liquid: [top y of body, bottom y] */
  span: [number, number];
  box: [number, number, number, number];
  /** neck: [x left, x right, top y] for the stopper */
  neck: [number, number, number] | null;
  /** where a label goes: [cx, cy, w, h] */
  label: [number, number, number, number] | null;
}

function shapeOf(v: Vessel): Shape {
  switch (v) {
    case 'round': {
      const a0 = Math.atan2(-31.6, -9), a1 = Math.atan2(-31.6, 9);
      return {
        body: (g) => {
          g.moveTo(55, 22);
          g.lineTo(55, 82 - 31.6);
          g.arc(64, 82, 33, a0, a1, true);
          g.lineTo(73, 22);
          g.closePath();
        },
        span: [49, 115], box: [31, 20, 97, 115], neck: [55, 73, 22], label: [64, 86, 30, 22],
      };
    }
    case 'heart':
      return {
        body: (g) => {
          g.moveTo(56, 22);
          g.lineTo(56, 40);
          g.bezierCurveTo(42, 30, 22, 40, 26, 64);
          g.bezierCurveTo(30, 86, 52, 98, 64, 114);
          g.bezierCurveTo(76, 98, 98, 86, 102, 64);
          g.bezierCurveTo(106, 40, 86, 30, 72, 40);
          g.lineTo(72, 22);
          g.closePath();
        },
        span: [34, 114], box: [26, 22, 102, 114], neck: [56, 72, 22], label: null,
      };
    case 'tall':
      return {
        body: (g) => {
          g.moveTo(57, 16);
          g.lineTo(57, 34);
          g.bezierCurveTo(57, 42, 42, 42, 42, 52);
          g.lineTo(42, 108);
          g.quadraticCurveTo(42, 116, 50, 116);
          g.lineTo(78, 116);
          g.quadraticCurveTo(86, 116, 86, 108);
          g.lineTo(86, 52);
          g.bezierCurveTo(86, 42, 71, 42, 71, 34);
          g.lineTo(71, 16);
          g.closePath();
        },
        span: [44, 116], box: [42, 16, 86, 116], neck: [57, 71, 16], label: [64, 82, 34, 30],
      };
    case 'bottle':
      return {
        body: (g) => {
          g.moveTo(58, 12);
          g.lineTo(58, 38);
          g.bezierCurveTo(58, 48, 40, 50, 40, 64);
          g.lineTo(40, 110);
          g.quadraticCurveTo(40, 117, 48, 117);
          g.lineTo(80, 117);
          g.quadraticCurveTo(88, 117, 88, 110);
          g.lineTo(88, 64);
          g.bezierCurveTo(88, 50, 70, 48, 70, 38);
          g.lineTo(70, 12);
          g.closePath();
        },
        span: [50, 117], box: [40, 12, 88, 117], neck: [58, 70, 12], label: [64, 88, 36, 28],
      };
    case 'cone':
      return {
        body: (g) => {
          g.moveTo(56, 20);
          g.lineTo(56, 50);
          g.lineTo(30, 106);
          g.quadraticCurveTo(26, 116, 38, 116);
          g.lineTo(90, 116);
          g.quadraticCurveTo(102, 116, 98, 106);
          g.lineTo(72, 50);
          g.lineTo(72, 20);
          g.closePath();
        },
        span: [50, 116], box: [28, 20, 100, 116], neck: [56, 72, 20], label: [64, 96, 32, 18],
      };
    case 'vial':
      return {
        body: (g) => {
          g.moveTo(52, 16);
          g.lineTo(52, 104);
          g.arc(64, 104, 12, Math.PI, 0, true);
          g.lineTo(76, 16);
          g.closePath();
        },
        span: [22, 116], box: [52, 16, 76, 116], neck: [52, 76, 16], label: [64, 72, 26, 20],
      };
    case 'square':
      return {
        body: (g) => {
          g.moveTo(57, 18);
          g.lineTo(57, 34);
          g.lineTo(38, 46);
          g.lineTo(38, 110);
          g.quadraticCurveTo(38, 116, 44, 116);
          g.lineTo(84, 116);
          g.quadraticCurveTo(90, 116, 90, 110);
          g.lineTo(90, 46);
          g.lineTo(71, 34);
          g.lineTo(71, 18);
          g.closePath();
        },
        span: [44, 116], box: [38, 18, 90, 116], neck: [57, 71, 18], label: [64, 82, 38, 30],
      };
    case 'gourd':
      return {
        body: (g) => {
          g.moveTo(57, 16);
          g.lineTo(57, 30);
          g.bezierCurveTo(44, 32, 44, 52, 54, 58);
          g.bezierCurveTo(30, 64, 30, 116, 64, 116);
          g.bezierCurveTo(98, 116, 98, 64, 74, 58);
          g.bezierCurveTo(84, 52, 84, 32, 71, 30);
          g.lineTo(71, 16);
          g.closePath();
        },
        span: [32, 116], box: [34, 16, 94, 116], neck: [57, 71, 16], label: [64, 90, 30, 20],
      };
    case 'oil':
      return {
        body: (g) => {
          g.moveTo(60, 14);
          g.lineTo(60, 32);
          g.bezierCurveTo(60, 40, 34, 46, 34, 76);
          g.bezierCurveTo(34, 104, 46, 116, 64, 116);
          g.bezierCurveTo(82, 116, 94, 104, 94, 76);
          g.bezierCurveTo(94, 46, 68, 40, 68, 32);
          g.lineTo(68, 14);
          g.closePath();
        },
        span: [40, 116], box: [34, 14, 94, 116], neck: [60, 68, 14], label: [64, 84, 32, 24],
      };
    case 'bomb':
      return {
        body: (g) => {
          g.moveTo(56, 30);
          g.lineTo(56, 40);
          g.arc(64, 78, 38, Math.atan2(-37.2, -8), Math.atan2(-37.2, 8), true);
          g.lineTo(72, 30);
          g.closePath();
        },
        span: [40, 116], box: [26, 30, 102, 116], neck: [56, 72, 30], label: [64, 80, 30, 24],
      };
    case 'jar':
      return {
        body: (g) => {
          g.moveTo(40, 40);
          g.lineTo(38, 46);
          g.bezierCurveTo(30, 60, 30, 104, 40, 112);
          g.quadraticCurveTo(64, 120, 88, 112);
          g.bezierCurveTo(98, 104, 98, 60, 90, 46);
          g.lineTo(88, 40);
          g.closePath();
        },
        span: [44, 116], box: [32, 40, 96, 116], neck: null, label: [64, 82, 36, 26],
      };
    case 'cup':
      return {
        body: (g) => {
          g.moveTo(28, 54);
          g.lineTo(100, 54);
          g.bezierCurveTo(100, 96, 84, 110, 64, 110);
          g.bezierCurveTo(44, 110, 28, 96, 28, 54);
          g.closePath();
        },
        span: [54, 110], box: [28, 54, 100, 110], neck: null, label: null,
      };
  }
}

const GLASS = '#cfe4ef';

export function paintPotion(g: G, a: PotionArt, seed = 'p') {
  const s = shapeOf(a.vessel);
  const r = rng(seed);
  const [l1, l2] = a.liquid;
  const fx = new Set(a.fx ?? []);
  const [bx0, by0, bx1, by1] = s.box;
  const cx = (bx0 + bx1) / 2;

  // Behind: a glow for magic brews.
  if (fx.has('glow')) glow(g, cx, (by0 + by1) / 2 + 6, 62, l1, 0.75);
  if (fx.has('dark')) glow(g, cx, (by0 + by1) / 2 + 6, 60, '#3a1a5a', 0.6);

  if (a.vessel === 'cup') return paintCup(g, a, s, fx);
  if (a.vessel === 'jar') return paintJar(g, a, s, r);

  // Glass, back wall.
  const glassC = a.glass ?? GLASS;
  g.save();
  g.beginPath();
  s.body(g);
  const bk = g.createLinearGradient(bx0, by0, bx1, by1);
  bk.addColorStop(0, light(glassC, 0.55));
  bk.addColorStop(1, dark(glassC, a.glass ? 0.35 : 0.18));
  g.fillStyle = bk;
  g.fill();
  g.restore();

  // Liquid.
  const [sTop, sBot] = s.span;
  const lv = a.level ?? 0.68;
  const top = sBot - (sBot - sTop) * lv;
  g.save();
  g.beginPath();
  s.body(g);
  g.clip();
  const lg = g.createLinearGradient(bx0, top, bx1, sBot);
  lg.addColorStop(0, light(l1, 0.12));
  lg.addColorStop(0.55, l1);
  lg.addColorStop(1, l2);
  g.fillStyle = lg;
  g.fillRect(0, top, 128, 128 - top);
  // Depth: the liquid is darker at the far edges and lit through from the upper left.
  const deep = g.createRadialGradient(cx - 10, top + (sBot - top) * 0.35, 4, cx, top + (sBot - top) * 0.5, (bx1 - bx0) * 0.7);
  deep.addColorStop(0, rgba(light(l1, 0.55), 0.55));
  deep.addColorStop(0.6, rgba(l1, 0));
  deep.addColorStop(1, rgba(dark(l2, 0.4), 0.55));
  g.fillStyle = deep;
  g.fillRect(0, top, 128, 128 - top);
  // Surface.
  g.fillStyle = rgba(light(l1, 0.45), 0.9);
  g.beginPath();
  g.ellipse(cx, top, (bx1 - bx0) / 2, 3.2, 0, 0, Math.PI * 2);
  g.fill();
  // Bubbles.
  const nb = fx.has('bubbles') ? 9 : 4;
  for (let i = 0; i < nb; i++) {
    const bx = bx0 + 8 + r() * (bx1 - bx0 - 16), byy = top + 6 + r() * (sBot - top - 12), br = 1 + r() * (fx.has('bubbles') ? 2.6 : 1.6);
    g.strokeStyle = rgba(light(l1, 0.7), 0.75);
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(bx, byy, br, 0, Math.PI * 2);
    g.stroke();
  }
  if (fx.has('dark')) {
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(40,20,60,0.35)';
      g.beginPath();
      g.ellipse(bx0 + 10 + r() * (bx1 - bx0 - 20), top + 10 + r() * (sBot - top - 20), 10, 6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();

  // Glass, front: thickness at the base, a gloss stripe and a rim of light.
  g.save();
  g.beginPath();
  s.body(g);
  g.clip();
  g.fillStyle = rgba(dark(glassC, 0.4), 0.35);
  g.beginPath();
  g.ellipse(cx, by1 + 1, (bx1 - bx0) * 0.42, 4.5, 0, 0, Math.PI * 2);
  g.fill();
  const gl = g.createLinearGradient(bx0, 0, bx0 + (bx1 - bx0) * 0.35, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath();
  g.ellipse(bx0 + (bx1 - bx0) * 0.24, (sTop + sBot) / 2 - 2, (bx1 - bx0) * 0.08 + 2, (sBot - sTop) * 0.34, 0.08, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(bx0 + (bx1 - bx0) * 0.3, sTop + (sBot - sTop) * 0.2, 3, 2, -0.6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rgba(dark(glassC, 0.5), 0.45);
  g.lineWidth = 2.2;
  g.beginPath();
  s.body(g);
  g.stroke();
  g.restore();
  g.save();
  g.globalCompositeOperation = 'screen';
  g.strokeStyle = 'rgba(235,248,255,0.55)';
  g.lineWidth = 1.4;
  g.translate(1.6, 1.2);
  g.beginPath();
  s.body(g);
  g.stroke();
  g.restore();

  // Bombs: a rope band and a fuse.
  if (a.vessel === 'bomb') paintBombTop(g, a, fx);

  // Label.
  if (a.glyph && s.label) {
    const [lx, ly, lw0, lh0] = s.label;
    const lw = lw0 * 1.22, lh = lh0 * 1.3;
    const parch = '#efe0b8';
    g.save();
    g.translate(lx, ly);
    g.rotate((r() - 0.5) * 0.08);
    shade(g, rrect(-lw / 2, -lh / 2, lw, lh, 3), parch, { hi: 0.2, lo: 0.25, band: 2, box: [-lw / 2, -lh / 2, lw / 2, lh / 2] });
    line(g, '#7a5a30', 0.8, (c) => c.roundRect(-lw / 2 + 2, -lh / 2 + 2, lw - 4, lh - 4, 2), 0.6);
    drawGlyph(g, a.glyph, 0, 0, Math.min(lw, lh) * 0.82, a.seal ? dark(a.seal, 0.35) : '#4a2a14', 2.4);
    g.restore();
  }

  // Stopper.
  if (s.neck && a.vessel !== 'bomb') paintStopper(g, s.neck, a.stopper ?? 'cork', a.seal);

  // Oils: a drip down the side.
  if (a.vessel === 'oil') {
    shade(g, (c) => {
      c.moveTo(69, 26);
      c.bezierCurveTo(74, 30, 74, 44, 72, 50);
      c.arc(72, 52, 3, -Math.PI / 2, Math.PI * 1.5);
    }, l1, { gloss: 2, band: 1, box: [66, 26, 76, 56], glossAt: [71, 46, 3] });
  }

  // In front: effects.
  if (fx.has('smoke') || fx.has('toxic')) wisps(g, cx, by0 - 2, fx.has('toxic') ? '#a8d84a' : '#cfcfcf', r);
  if (fx.has('steam')) wisps(g, cx, by0 - 2, '#ffffff', r, 0.6);
  if (fx.has('frost')) frost(g, s, r);
  if (fx.has('embers')) for (let i = 0; i < 7; i++) sparkle(g, cx - 26 + r() * 52, by0 - 6 - r() * 18, 2 + r() * 2.5, i % 2 ? '#ffd27a' : '#ff8a3a');
  if (fx.has('sparkle') || fx.has('glow')) for (let i = 0; i < (fx.has('sparkle') ? 4 : 2); i++) sparkle(g, bx0 - 4 + r() * (bx1 - bx0 + 8), by0 + 8 + r() * (by1 - by0 - 10), 3 + r() * 4, light(l1, 0.7));
  if (a.tier) tierPlate(g, a.tier);
}

function paintStopper(g: G, [x0, x1, y]: [number, number, number], kind: Stopper, seal?: string) {
  const w = x1 - x0;
  // A lip of glass around the mouth.
  shade(g, rrect(x0 - 3, y - 2, w + 6, 7, 3), GLASS, { gloss: 1, band: 1.5, hi: 0.4, box: [x0 - 3, y - 2, x1 + 3, y + 5] });
  if (kind === 'none') return;
  if (kind === 'gold') {
    shade(g, rrect(x0 - 2, y - 13, w + 4, 13, 4), '#d9a83a', { gloss: 2, band: 2.5, rim: true, box: [x0 - 2, y - 13, x1 + 2, y] });
    shade(g, (c) => c.arc((x0 + x1) / 2, y - 15, 5, 0, Math.PI * 2), seal ?? '#e9c35a', { gloss: 2, band: 1.5, box: [x0, y - 20, x1, y - 10] });
    return;
  }
  // Cork.
  shade(g, rrect(x0 + 1, y - 14, w - 2, 16, 3), '#b07a46', { band: 2.5, hi: 0.25, box: [x0, y - 14, x1, y + 2] });
  line(g, '#6a4220', 0.8, (c) => {
    c.moveTo(x0 + 4, y - 9);
    c.lineTo(x0 + 6, y - 9);
    c.moveTo(x1 - 6, y - 5);
    c.lineTo(x1 - 3, y - 5);
  }, 0.7);
  if (kind === 'wax') {
    const c = seal ?? '#b0202a';
    shade(g, (p) => {
      p.moveTo(x0 - 2, y - 10);
      p.quadraticCurveTo((x0 + x1) / 2, y - 19, x1 + 2, y - 10);
      p.lineTo(x1 + 2, y - 2);
      p.quadraticCurveTo(x1 + 2, y + 6, x1 - 1, y + 7);
      p.quadraticCurveTo(x1 - 3, y + 1, x1 - 5, y - 1);
      p.quadraticCurveTo((x0 + x1) / 2, y + 2, x0 + 4, y - 1);
      p.quadraticCurveTo(x0 + 2, y + 9, x0, y + 9);
      p.quadraticCurveTo(x0 - 3, y + 6, x0 - 2, y - 2);
      p.closePath();
    }, c, { gloss: 2, band: 2, box: [x0 - 2, y - 19, x1 + 2, y + 9] });
  }
}

function paintBombTop(g: G, a: PotionArt, fx: Set<Fx>) {
  // A cord around the neck and a lit fuse.
  shade(g, rrect(52, 26, 24, 8, 3), '#9a7448', { band: 2, box: [52, 26, 76, 34] });
  line(g, '#5a3a1a', 0.8, (c) => {
    for (let x = 54; x < 76; x += 4) {
      c.moveTo(x, 27);
      c.lineTo(x + 2, 33);
    }
  });
  line(g, '#3a2a1a', 3, (c) => {
    c.moveTo(64, 26);
    c.bezierCurveTo(64, 16, 74, 18, 76, 8);
  }, 1);
  const hot = fx.has('frost') ? '#bfe8ff' : '#ffb03a';
  glow(g, 76, 8, 12, hot, 0.9);
  sparkle(g, 76, 8, 6, '#fff6d0');
  if (a.glyph) drawGlyph(g, a.glyph, 64, 82, 24, rgba(dark(a.liquid[1], 0.6), 0.75));
}

function paintCup(g: G, a: PotionArt, s: Shape, fx: Set<Fx>) {
  const [l1, l2] = a.liquid;
  const clay = a.seal ?? '#c9b38a';
  // Saucer.
  shade(g, ellipse(64, 112, 46, 9), clay, { band: 2, gloss: 1, box: [18, 103, 110, 121] });
  // Handle.
  line(g, dark(clay, 0.45), 8, (c) => {
    c.moveTo(98, 64);
    c.bezierCurveTo(118, 62, 118, 90, 92, 92);
  }, 1);
  line(g, light(clay, 0.2), 4.5, (c) => {
    c.moveTo(98, 64);
    c.bezierCurveTo(118, 62, 118, 90, 92, 92);
  }, 1);
  shade(g, s.body, clay, { gloss: 1, band: 4, box: s.box, rim: true });
  // Rim and drink.
  shade(g, ellipse(64, 54, 36, 9), dark(clay, 0.2), { band: 0, box: [28, 45, 100, 63] });
  const tea = g.createRadialGradient(56, 52, 2, 64, 55, 34);
  tea.addColorStop(0, light(l1, 0.25));
  tea.addColorStop(1, l2);
  g.fillStyle = tea;
  g.beginPath();
  g.ellipse(64, 55, 31, 6.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(52, 54, 7, 1.6, -0.1, 0, Math.PI * 2);
  g.fill();
  if (a.glyph) drawGlyph(g, a.glyph, 64, 84, 20, rgba(dark(clay, 0.55), 0.8));
  wisps(g, 64, 46, '#ffffff', rng('cup' + l1), 0.65);
  if (fx.has('sparkle')) sparkle(g, 92, 40, 5);
  if (a.tier) tierPlate(g, a.tier);
}

function paintJar(g: G, a: PotionArt, s: Shape, r: () => number) {
  const [l1, l2] = a.liquid;
  const pot = a.glass ?? '#b8875a';
  shade(g, s.body, pot, { gloss: 1, band: 5, box: s.box, rim: true });
  // The balm showing at the top, under a cloth cover tied with twine.
  const cloth = a.seal ?? '#d8c8a0';
  shade(g, (c) => {
    c.moveTo(32, 46);
    c.quadraticCurveTo(64, 20, 96, 46);
    c.lineTo(99, 56);
    c.quadraticCurveTo(64, 64, 29, 56);
    c.closePath();
  }, cloth, { band: 2.5, box: [29, 28, 99, 62] });
  line(g, '#6a4a2a', 2.4, (c) => {
    c.moveTo(31, 52);
    c.quadraticCurveTo(64, 58, 97, 52);
  }, 0.9);
  line(g, '#6a4a2a', 2, (c) => {
    c.moveTo(80, 55);
    c.quadraticCurveTo(84, 66, 78, 70);
    c.moveTo(80, 55);
    c.quadraticCurveTo(90, 64, 90, 70);
  }, 0.9);
  // A smear of the balm on the rim.
  shade(g, ellipse(48, 47, 8, 3, -0.3), l1, { gloss: 2, band: 1, box: [40, 44, 56, 50] });
  if (a.glyph && s.label) {
    const [lx, ly, lw, lh] = s.label;
    shade(g, rrect(lx - lw / 2, ly - lh / 2, lw, lh, 3), '#efe0b8', { band: 2, hi: 0.2, box: [lx - lw / 2, ly - lh / 2, lx + lw / 2, ly + lh / 2] });
    drawGlyph(g, a.glyph, lx, ly, lh * 0.8, dark(l2, 0.3));
  }
  void r;
  if (a.tier) tierPlate(g, a.tier);
}

function wisps(g: G, x: number, y: number, c: string, r: () => number, a = 0.8) {
  g.save();
  for (let i = 0; i < 3; i++) {
    const ox = x + (i - 1) * 12 + (r() - 0.5) * 6;
    g.strokeStyle = rgba(c, a * (0.9 - i * 0.15));
    g.lineWidth = 5 - i;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ox, y);
    g.bezierCurveTo(ox - 10, y - 8, ox + 10, y - 14, ox - 2, y - 24 - r() * 6);
    g.stroke();
  }
  g.restore();
}

function frost(g: G, s: Shape, r: () => number) {
  const [x0, , x1, y1] = s.box;
  for (let i = 0; i < 9; i++) {
    const x = x0 + r() * (x1 - x0), y = y1 - r() * 26;
    const h = 5 + r() * 9;
    shade(g, (c) => {
      c.moveTo(x - 2.5, y);
      c.lineTo(x, y - h);
      c.lineTo(x + 2.5, y);
      c.closePath();
    }, '#d8f2ff', { gloss: 1, band: 1, hi: 0.5, box: [x - 3, y - h, x + 3, y] });
  }
  sparkle(g, x1 - 6, y1 - 30, 6, '#ffffff');
}

/** Liquid colour pairs by purpose, for painters elsewhere to agree with. */
export const LIQUIDS = {
  health: ['#ff5a5a', '#8a0a1a'] as [string, string],
  mana: ['#5ab4ff', '#14208a'] as [string, string],
  stamina: ['#7ae05a', '#1a6a2a'] as [string, string],
};

export { mix };
