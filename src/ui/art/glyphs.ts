// Small ink emblems (24 x 24, SVG path data) for labels, seals, book covers and
// rune stones. Filled shapes unless listed in STROKED.

export const GLYPHS: Record<string, string> = {
  heart: 'M12 21C5 15.5 2 12 2 8a5 5 0 0 1 10-1.5A5 5 0 0 1 22 8c0 4-3 7.5-10 13z',
  drop: 'M12 2c4 6 7 9.5 7 13a7 7 0 0 1-14 0c0-3.5 3-7 7-13z',
  leaf: 'M4 20C4 10 10 4 21 3c-1 11-7 17-17 17zm0 0l9-9',
  flame: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z',
  flake: 'M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  skull: 'M12 2c5 0 8 3.5 8 8 0 3-1.5 4.5-3 5.5V20h-3v-2h-1v2h-2v-2h-1v2H7v-4.5C5.5 14.5 4 13 4 10c0-4.5 3-8 8-8zM8.5 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  feather: 'M20 3C11 4 6 9 5 17l-2 4 4-2c8-1 13-6 13-16zM5 17L14 9',
  fist: 'M7 9V6a1.5 1.5 0 0 1 3 0v2-3a1.5 1.5 0 0 1 3 0v3-2a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7h-1c-3 0-6-2-6-5v-3c0-1.5 1-2.5 2-2.5z',
  shield: 'M12 2l9 3.5v6.5c0 5-4 9-9 10-5-1-9-5-9-10V5.5z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  moon: 'M20 15A9 9 0 1 1 9 3a7 7 0 0 0 11 12z',
  star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z',
  fish: 'M2 12c3-5 9-7 15-3l4-3v12l-4-3c-6 4-12 2-15-3zm13-1.5a1.2 1.2 0 1 0 0 .1z',
  wing: 'M2 18C5 8 12 3 22 3c-1 4-3 6-6 7 2 0 3 0 4-1-2 4-5 6-9 6 1 1 2 1 4 1-3 3-8 3-13 2z',
  mountain: 'M1 21L9 7l4 6 3-4 7 12z',
  bolt: 'M13 1L4 14h7l-2 9 10-14h-7z',
  cloud: 'M7 19a5 5 0 0 1-.5-10A6.5 6.5 0 0 1 19 9a5 5 0 0 1-1 10z',
  paw: 'M12 12c3 0 6 3.5 6 6.5 0 2-2 2.5-3 2.5-1.5 0-2-1-3-1s-1.5 1-3 1c-1 0-3-.5-3-2.5C6 15.5 9 12 12 12zM5 7a2 2.5 0 1 0 0 5 2 2.5 0 0 0 0-5zm14 0a2 2.5 0 1 0 0 5 2 2.5 0 0 0 0-5zM9 2.5a2 2.5 0 1 0 0 5 2 2.5 0 0 0 0-5zm6 0a2 2.5 0 1 0 0 5 2 2.5 0 0 0 0-5z',
  tree: 'M12 1l7 9h-3l5 6h-7v6h-4v-6H3l5-6H5z',
  boot: 'M6 2h7v9l7 4c1.5 1 2 2 2 3v3H4V9z',
  lotus: 'M12 4c2 3 3 6 0 12-3-6-2-9 0-12zM12 16c-4-1-8-4-9-9 4 0 7 3 9 9zm0 0c4-1 8-4 9-9-4 0-7 3-9 9zM3 18c5 2 13 2 18 0-4 3-14 3-18 0z',
  spider: 'M12 7a3 3 0 1 0 0 6 3.5 4.5 0 1 0 0 9 3.5 4.5 0 1 0 0-9 3 3 0 1 0 0-6zM2 6l6 4M22 6l-6 4M1 12h7M23 12h-7M2 19l6-4M22 19l-6-4',
  hourglass: 'M5 2h14v2c0 4-5 6-5 8s5 4 5 8v2H5v-2c0-4 5-6 5-8S5 8 5 4z',
  mushroom: 'M12 3c6 0 10 4 10 8H2c0-4 4-8 10-8zM9 11h6l1 10H8z',
  fang: 'M3 3h18c-1 6-4 9-5 18-1-6-2-9-4-9s-3 3-4 9C7 12 4 9 3 3z',
  cross: 'M10 2h4v7h7v4h-7v9h-4v-9H3V9h7z',
  claw: 'M4 21C4 12 8 5 15 2c-4 5-5 10-5 19zM10 21c1-7 4-12 10-15-3 4-4 9-4 15z',
  wheel: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM12 2v20M2 12h20M5 5l14 14M19 5L5 19',
  circle: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3l6 10H6z',
  hammer: 'M3 7l6-5 4 3-2 2 10 11-3 3L7 10l-2 2z',
  book: 'M4 3h7a3 3 0 0 1 1 1 3 3 0 0 1 1-1h7v16h-7a2 2 0 0 0-1 1 2 2 0 0 0-1-1H4z',
  pot: 'M4 9h16v4a8 8 0 0 1-16 0zM2 9h20M8 3c0 2 1 2 1 4M12 3c0 2 1 2 1 4M16 3c0 2 1 2 1 4',
  rune: 'M12 2l7 10-7 10-7-10zM12 2v20M7 9l10 6',
  anchor: 'M12 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 7v15M7 11h10M3 14c0 5 4 8 9 8s9-3 9-8',
  dagger: 'M12 1l2.5 14h-5zM6 15h12v2H6zM10.5 17h3v4h-3z',
  key: 'M8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm4.5 7L22 19.5l-2 2-2-2-1.5 1.5-2-2 1.5-1.5-4-4z',
  crown: 'M2 8l5 4 5-8 5 8 5-4-2 12H4z',
  axe: 'M10 2l2 2-1 1 10 10c1 3-1 6-4 6l-1-1 1-4-8-8-1 1-2-2z',
  dawn: 'M2 18h20M5 18a7 7 0 0 1 14 0M12 4v4M4 9l3 2M20 9l-3 2',
};

/** Glyphs drawn as lines rather than solid shapes. */
export const STROKED = new Set(['flake', 'sun', 'spider', 'wheel', 'anchor', 'dawn']);

const cache = new Map<string, Path2D>();
export function glyphPath(name: string) {
  let p = cache.get(name);
  if (!p) cache.set(name, (p = new Path2D(GLYPHS[name] ?? GLYPHS.star)));
  return p;
}

/** Draw a glyph centred at (x, y), `size` units across, in a colour. */
export function drawGlyph(g: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, stroke = 2.2) {
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  const p = glyphPath(name);
  if (STROKED.has(name)) {
    g.strokeStyle = color;
    g.lineWidth = stroke * (24 / size) * (size / 24) * 1.0;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke(p);
  } else {
    g.fillStyle = color;
    g.fill(p, 'evenodd');
    // Leaf, feather and similar: their spines are drawn as lines too.
    if (name === 'leaf' || name === 'feather') {
      g.strokeStyle = color;
      g.lineWidth = 1.2;
      g.stroke(p);
    }
  }
  g.restore();
}
