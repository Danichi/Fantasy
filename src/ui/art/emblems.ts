import { light, dark, rgba, glow, sparkle, mix, type G } from './kit';
import { GLYPHS, STROKED } from './glyphs';

// Skill, spell and origin-ability emblems: a medallion in the class's colours
// with a metal rim, and an illustrated motif built from a few shapes (a slash,
// a gust, a dome, a chain...) lit from the upper left with a glow behind it.
// One spec per action (EMBLEMS) so no two moves share a picture.

/** Motifs drawn for emblems (24 x 24 SVG paths), on top of the label glyphs. */
const MOTIFS: Record<string, string> = {
  gust: 'M2 8h11a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M2 16h9',
  tornado: 'M3 4h18M5 8h14M7 12h10M9 16h6M11 20h3',
  vortex: 'M12 12m-2 0a2 2 0 1 0 4 0 4 4 0 1 0-8 0 6 6 0 1 0 12 0 8 8 0 1 0-16 0',
  dome: 'M2 20h20M4 20a8 8 0 0 1 16 0M7 20a5 5 0 0 1 10 0',
  wall: 'M2 7h20v13H2zM2 13.5h20M8 7v6.5M16 7v6.5M5 13.5V20M12 13.5V20M19 13.5V20',
  slash: 'M3 21C9 15 15 9 21 3',
  slashes: 'M3 16L16 3M6 21L21 6M9 21l12-12',
  crossSlash: 'M4 4l16 16M20 4L4 20',
  crescent: 'M4 18C6 9 13 4 21 5c-6 2-11 7-13 15z',
  sword: 'M18.5 2.5L21 3l.5 2.5L10 17l-3-3zM6 13l5 5-2 2-1.5-1.5L5 21l-2-2 2.5-2.5L4 15z',
  spear: 'M21 3l-2 6-1.5-1.5L5 20l-1-1L16.5 6.5 15 5z',
  arrowUp: 'M12 2l7 8h-4v12H9V10H5z',
  arrowDown: 'M12 22l7-8h-4V2H9v12H5z',
  arrowCurve: 'M5 9a7 7 0 1 1 1 9M5 9V3M5 9h6',
  dash: 'M3 12h12M15 7l6 5-6 5M3 7h6M3 17h6',
  ripple: 'M12 12m-3 0a3 1.2 0 1 0 6 0 3 1.2 0 1 0-6 0M12 12m-7 0a7 2.8 0 1 0 14 0 7 2.8 0 1 0-14 0M12 12m-10 0a10 4 0 1 0 20 0 10 4 0 1 0-20 0',
  burst: 'M12 1l2.5 7.5L22 6l-5 6 6 3-7.5 1L17 23l-5-5-5 5 1.5-7L1 15l6-3-5-6 7.5 2.5z',
  chain: 'M7 9a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6M17 15a3 3 0 0 1-3 3h-3a3 3 0 0 1 0-6M6 12h4M14 12h4',
  banner: 'M5 2v20M5 3h14l-3 5 3 5H5',
  hornCall: 'M3 15c6 0 12-5 15-11l3 2c-1 6-7 13-16 13zM3 15v4',
  halo: 'M12 6a9 3 0 1 0 0.1 0zM12 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  fountain: 'M12 21V9M12 9c-3-4-7-4-8-1M12 9c3-4 7-4 8-1M5 21h14M7 17h10',
  meteor: 'M15 9a4 4 0 1 0 0 0.1zM12 12L3 21M10 8L4 14M16 14l-6 6',
  fireball: 'M15 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 12C7 12 4 15 2 19c3-2 6-2 9-4M10 9C7 8 4 9 2 11',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  wolf: 'M4 3l4 5h8l4-5 1 9-3 5-6 4-6-4-3-5z',
  horns: 'M3 3c0 7 3 10 7 10M21 3c0 7-3 10-7 10M8 13h8l-1 8H9z',
  mask: 'M3 6c5-3 13-3 18 0 0 8-4 13-9 13S3 14 3 6zm5 4a2 1.4 0 1 0 0.1 0zm8 0a2 1.4 0 1 0 0.1 0z',
  figure: 'M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM7 22l2-9-3 3-2-2 5-5h6l5 5-2 2-3-3 2 9h-3l-2-6-2 6z',
  hand: 'M8 21v-8L5 9l2-1 3 3V3h2v7-6h2v6-5h2v6-3h2v9c0 3-2 5-5 5z',
  wingF: 'M2 21C3 12 9 5 22 2c-1 3-3 5-5 6.5 2 0 3.5-.2 5-1-1.5 3-4 5-7 6 1.5.3 3 .2 4.5-.3-2.5 3-6 4.5-10 4.5 1 .8 2 1 3.5 1-3 1.8-6.5 2.3-11 2.3z',
  horn: 'M2.5 19.5c5 .5 10-2 13.5-6.5 1.8-2.4 2.6-5 2.8-8.5l3.7 1.3c-.4 4.3-1.9 7.6-4.6 10.4-3.9 4-9.7 5.8-15.4 5zM18 3.5l5 1.8M7 15.5l1.4 3.6M11.5 13l1.8 3.4',
};
const MOTIF_STROKED = new Set(['gust', 'tornado', 'vortex', 'dome', 'wall', 'slash', 'slashes', 'crossSlash', 'arrowCurve', 'dash', 'ripple', 'chain', 'banner', 'fountain', 'halo']);

export interface Layer {
  m: string;
  /** raw path data instead of a named motif (class sigils), drawn as lines */
  d?: string;
  x?: number;
  y?: number;
  s?: number;
  r?: number;
  /** fill/stroke tint for this layer (defaults to the palette's light) */
  c?: string;
}

export interface Palette {
  /** medallion inner / outer colours */
  bg: [string, string];
  /** emblem colour */
  fg: string;
  /** glow behind the emblem */
  glow: string;
  /** rim metal */
  rim: string;
}

export const PALETTES: Record<string, Palette> = {
  windcaller: { bg: ['#3a8a6a', '#0e2a26'], fg: '#d8ffe8', glow: '#8affc8', rim: '#c8d0c0' },
  gale: { bg: ['#2a8a9a', '#0a2430'], fg: '#e0fbff', glow: '#7ae8f0', rim: '#c4ccd6' },
  boundary: { bg: ['#2a5aa8', '#0a1838'], fg: '#e6f0ff', glow: '#7ab0ff', rim: '#c4ccd6' },
  cross: { bg: ['#9a2a2a', '#2a0a0e'], fg: '#ffe8e0', glow: '#ff7a6a', rim: '#c4ccd6' },
  pyromancer: { bg: ['#c84a1a', '#3a0e06'], fg: '#fff0c8', glow: '#ffa040', rim: '#d9a83a' },
  lightbinder: { bg: ['#c89a2a', '#3a2808'], fg: '#fffbe8', glow: '#ffe08a', rim: '#e0ac34' },
  human: { bg: ['#b08a3a', '#2e2410'], fg: '#fff6d8', glow: '#ffd76a', rim: '#e0ac34' },
  elf: { bg: ['#2a8a6a', '#0a2a20'], fg: '#e8fff4', glow: '#8affc8', rim: '#c4ccd6' },
  dwarf: { bg: ['#8a6a4a', '#2a1e14'], fg: '#ffeed0', glow: '#ffb84a', rim: '#b8783a' },
  beastfolk: { bg: ['#9a6a2a', '#2a1a08'], fg: '#fff0d8', glow: '#ffc06a', rim: '#a87a4a' },
  demon: { bg: ['#8a1a2a', '#22060a'], fg: '#ffe0e0', glow: '#ff4a4a', rim: '#3a3a44' },
  dragonkin: { bg: ['#b8401a', '#2e0a04'], fg: '#fff0d0', glow: '#ff8a2a', rim: '#d9a83a' },
};

export interface EmblemSpec {
  /** a named palette, or one given directly */
  pal: string | Palette;
  layers: Layer[];
  sparkles?: number;
}

/** Paint an emblem into the 128 space. */
export function paintEmblem(g: G, e: EmblemSpec) {
  const P = typeof e.pal === 'string' ? PALETTES[e.pal] ?? PALETTES.human : e.pal;
  const cx = 64, cy = 64, R = 58;
  // Medallion.
  const bg = g.createRadialGradient(cx - 14, cy - 18, 4, cx, cy, R);
  bg.addColorStop(0, light(P.bg[0], 0.25));
  bg.addColorStop(0.55, P.bg[0]);
  bg.addColorStop(1, P.bg[1]);
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  // Engraved rings and rays inside the medallion.
  g.save();
  g.beginPath();
  g.arc(cx, cy, R - 6, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = rgba(light(P.bg[0], 0.4), 0.18);
  g.lineWidth = 1.2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, R - 16, 0, Math.PI * 2);
  g.stroke();
  glow(g, cx, cy, 46, P.glow, 0.7);
  g.restore();
  // Rim: a metal ring with rivets.
  const rim = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  rim.addColorStop(0, light(P.rim, 0.5));
  rim.addColorStop(0.5, P.rim);
  rim.addColorStop(1, dark(P.rim, 0.5));
  g.strokeStyle = rim;
  g.lineWidth = 7;
  g.beginPath();
  g.arc(cx, cy, R - 3.5, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = rgba(dark(P.rim, 0.6), 0.8);
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(cx, cy, R - 7.5, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * (R - 3.5), y = cy + Math.sin(a) * (R - 3.5);
    const rv = g.createRadialGradient(x - 1, y - 1, 0, x, y, 2.6);
    rv.addColorStop(0, light(P.rim, 0.7));
    rv.addColorStop(1, dark(P.rim, 0.4));
    g.fillStyle = rv;
    g.beginPath();
    g.arc(x, y, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  // The emblem layers.
  for (const L of e.layers) drawLayer(g, L, P);
  for (let i = 0; i < (e.sparkles ?? 0); i++) {
    const a = 0.8 + i * 2.1;
    sparkle(g, cx + Math.cos(a) * 32, cy + Math.sin(a) * 30, 4.5, light(P.glow, 0.6));
  }
}

function drawLayer(g: G, L: Layer, P: Palette) {
  const d = L.d ?? MOTIFS[L.m] ?? GLYPHS[L.m];
  if (!d) return;
  const path = new Path2D(d);
  const stroked = !!L.d || MOTIF_STROKED.has(L.m) || STROKED.has(L.m);
  const size = (L.s ?? 1) * 64;
  const col = L.c ?? P.fg;
  g.save();
  g.translate(64 + (L.x ?? 0), 64 + (L.y ?? 0));
  g.rotate(L.r ?? 0);
  g.scale(size / 24, size / 24);
  g.translate(-12, -12);
  const u = 24 / size; // one 128-unit in glyph space
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (stroked) {
    // Dark outline, glow, colour, and a bright core.
    g.strokeStyle = rgba('#120808', 0.9);
    g.lineWidth = 7.5 * u;
    g.stroke(path);
    g.shadowColor = P.glow;
    g.shadowBlur = 14;
    g.strokeStyle = col;
    g.lineWidth = 4.6 * u;
    g.stroke(path);
    g.shadowBlur = 0;
    g.strokeStyle = rgba('#ffffff', 0.85);
    g.lineWidth = 1.6 * u;
    g.stroke(path);
  } else {
    g.strokeStyle = rgba('#120808', 0.9);
    g.lineWidth = 4 * u;
    g.stroke(path);
    g.shadowColor = P.glow;
    g.shadowBlur = 16;
    const gr = g.createLinearGradient(0, 0, 24, 24);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.45, col);
    gr.addColorStop(1, dark(col, 0.35));
    g.fillStyle = gr;
    g.fill(path, 'evenodd');
    g.shadowBlur = 0;
    // A highlight along the upper-left edge.
    g.save();
    g.clip(path, 'evenodd');
    g.strokeStyle = rgba('#ffffff', 0.55);
    g.lineWidth = 1.4 * u;
    g.translate(0.6 * u, 0.6 * u);
    g.stroke(path);
    g.restore();
  }
  g.restore();
}

// ---- every move's emblem ------------------------------------------------------------------
const E = (pal: string, ...layers: Layer[]): EmblemSpec => ({ pal, layers });
const Es = (pal: string, sparkles: number, ...layers: Layer[]): EmblemSpec => ({ pal, layers, sparkles });

export const EMBLEMS: Record<string, EmblemSpec> = {
  // Windcaller
  'windcaller:Gust': E('windcaller', { m: 'gust', s: 1.25 }),
  'windcaller:Updraft': E('windcaller', { m: 'gust', s: 0.9, y: 14, r: -0.15 }, { m: 'arrowUp', s: 0.6, y: -12, x: 18 }),
  'windcaller:Cyclone Bolt': E('windcaller', { m: 'tornado', s: 1.1 }, { m: 'bolt', s: 0.55, x: 20, y: 14 }),
  'windcaller:Haste': E('windcaller', { m: 'boot', s: 0.85, x: 4, y: 4 }, { m: 'wingF', s: 0.62, x: -16, y: -14 }),
  'windcaller:Blink': Es('windcaller', 3, { m: 'figure', s: 0.55, x: 18, y: 2 }, { m: 'figure', s: 0.55, x: -16, y: 2, c: rgba('#d8ffe8', 0.45) }, { m: 'dash', s: 0.55, y: 26 }),
  'windcaller:Wind Walk': E('windcaller', { m: 'boot', s: 0.8, x: 8, y: 6 }, { m: 'gust', s: 0.75, x: -10, y: -14 }),
  'windcaller:Wind Wall': E('windcaller', { m: 'wall', s: 1.05, y: 6 }, { m: 'gust', s: 0.6, y: -24 }),
  'windcaller:Vacuum': E('windcaller', { m: 'vortex', s: 1.2 }),
  'windcaller:Pressure Dome': E('windcaller', { m: 'dome', s: 1.15, y: 4 }, { m: 'gust', s: 0.5, y: -20 }),
  'windcaller:Tempest Crown': Es('windcaller', 2, { m: 'crown', s: 0.95, y: 8 }, { m: 'bolt', s: 0.5, y: -22 }),
  'windcaller:Eye of Heaven': Es('windcaller', 2, { m: 'sun', s: 1.15 }, { m: 'eye', s: 0.75 }),
  // Gale Style
  'gale:Gale Step': E('gale', { m: 'dash', s: 1.0, y: 10 }, { m: 'sword', s: 0.7, x: 6, y: -12 }),
  'gale:Crescent Sweep': E('gale', { m: 'crescent', s: 1.25 }),
  'gale:Cyclone': E('gale', { m: 'tornado', s: 1.05, y: 4 }, { m: 'sword', s: 0.5, x: 22, y: -18 }),
  'gale:Moonlit Draw': Es('gale', 2, { m: 'moon', s: 0.85, x: -10, y: -8 }, { m: 'sword', s: 0.8, x: 8, y: 8 }),
  'gale:Flash Cut': Es('gale', 3, { m: 'slash', s: 1.25 }),
  'gale:Razor Gale': E('gale', { m: 'gust', s: 0.95, y: 10 }, { m: 'slash', s: 0.8, x: 4, y: -6 }),
  'gale:Thousand Cuts': E('gale', { m: 'slashes', s: 1.2 }, { m: 'crossSlash', s: 0.55, x: -18, y: 18 }),
  'gale:Riposte': E('gale', { m: 'sword', s: 1.0, x: 6 }, { m: 'arrowCurve', s: 0.6, x: -18, y: 14 }),
  'gale:Counterstance': E('gale', { m: 'sword', s: 0.95, x: -4 }, { m: 'sword', s: 0.95, x: 4, r: Math.PI / 2 }),
  'gale:Stillwater': E('gale', { m: 'ripple', s: 1.25, y: 12 }, { m: 'drop', s: 0.6, y: -14 }),
  // Boundary Style
  'boundary:Hold Fast': E('boundary', { m: 'shield', s: 1.1 }, { m: 'mountain', s: 0.5, y: 2 }),
  'boundary:Ward Stone': E('boundary', { m: 'rune', s: 1.15 }),
  'boundary:Sanctum': E('boundary', { m: 'dome', s: 1.2, y: 6 }, { m: 'cross', s: 0.45, y: -2 }),
  'boundary:Return Strike': E('boundary', { m: 'shield', s: 0.95, x: -6 }, { m: 'arrowCurve', s: 0.6, x: 20, y: 14 }),
  'boundary:Repel': E('boundary', { m: 'burst', s: 1.2, c: '#a8c8ff' }, { m: 'shield', s: 0.7 }),
  'boundary:Collapse': E('boundary', { m: 'vortex', s: 1.1 }, { m: 'arrowDown', s: 0.45, y: -24 }),
  'boundary:Challenge': E('boundary', { m: 'fist', s: 0.95 }, { m: 'shield', s: 0.5, x: 22, y: 20 }),
  'boundary:Oath Ward': Es('boundary', 2, { m: 'shield', s: 1.05 }, { m: 'hand', s: 0.55, y: 2 }),
  'boundary:Rallying Cry': E('boundary', { m: 'horn', s: 1.15 }),
  // Cross Style
  'cross:Cross Cut': E('cross', { m: 'crossSlash', s: 1.2 }),
  'cross:Blade Dance': E('cross', { m: 'dagger', s: 0.8, x: -12, r: -0.5 }, { m: 'dagger', s: 0.8, x: 12, r: 0.5 }, { m: 'gust', s: 0.5, y: 26 }),
  'cross:Viper Lunge': E('cross', { m: 'fang', s: 0.8, y: -6 }, { m: 'dash', s: 0.65, y: 24 }),
  'cross:Twin Fangs': E('cross', { m: 'fang', s: 0.75, x: -14 }, { m: 'fang', s: 0.75, x: 14 }),
  'cross:Feint': E('cross', { m: 'sword', s: 0.9, x: 8 }, { m: 'sword', s: 0.9, x: -10, c: rgba('#ffe8e0', 0.4) }),
  'cross:Flourish': Es('cross', 3, { m: 'star', s: 0.85 }, { m: 'slash', s: 0.8 }),
  'cross:Mirror Image': E('cross', { m: 'mask', s: 1.1 }),
  'cross:Whirling Step': E('cross', { m: 'vortex', s: 0.95, y: -6 }, { m: 'boot', s: 0.55, x: 18, y: 18 }),
  'cross:Lunge': E('cross', { m: 'spear', s: 1.15 }),
  'cross:Tempest Waltz': Es('cross', 2, { m: 'tornado', s: 1.0 }, { m: 'dagger', s: 0.6, x: 20, y: 16, r: 0.6 }),
  // Pyromancer
  'pyromancer:Kindle': E('pyromancer', { m: 'flame', s: 0.95 }),
  'pyromancer:Fireball': E('pyromancer', { m: 'fireball', s: 1.2 }),
  'pyromancer:Cinder Volley': E('pyromancer', { m: 'fireball', s: 0.6, x: -14, y: 14 }, { m: 'fireball', s: 0.6, x: 4, y: -2 }, { m: 'fireball', s: 0.6, x: 20, y: -18 }),
  'pyromancer:Falling Star': Es('pyromancer', 2, { m: 'meteor', s: 1.2 }),
  'pyromancer:Ignite': E('pyromancer', { m: 'burst', s: 1.15, c: '#ffc06a' }, { m: 'flame', s: 0.6 }),
  'pyromancer:Wildfire': E('pyromancer', { m: 'flame', s: 0.65, x: -16, y: 10 }, { m: 'flame', s: 0.9, y: -4 }, { m: 'flame', s: 0.65, x: 16, y: 10 }),
  'pyromancer:Funeral Pyre': E('pyromancer', { m: 'flame', s: 1.1, y: -4 }, { m: 'skull', s: 0.5, y: 14 }),
  'pyromancer:Firebrand': E('pyromancer', { m: 'sword', s: 1.0 }, { m: 'flame', s: 0.5, x: 14, y: -14 }),
  'pyromancer:Vent': E('pyromancer', { m: 'cloud', s: 0.9, y: -8 }, { m: 'flame', s: 0.55, y: 18 }),
  'pyromancer:Flame Step': E('pyromancer', { m: 'boot', s: 0.85, x: 4, y: 4 }, { m: 'flame', s: 0.55, x: -16, y: -14 }),
  // Lightbinder
  'lightbinder:Mote of Light': Es('lightbinder', 4, { m: 'star', s: 0.8 }),
  'lightbinder:Healing Light': E('lightbinder', { m: 'sun', s: 1.2 }, { m: 'heart', s: 0.55 }),
  'lightbinder:Lightwell': Es('lightbinder', 2, { m: 'fountain', s: 1.15 }),
  'lightbinder:Second Dawn': E('lightbinder', { m: 'dawn', s: 1.25 }),
  'lightbinder:Brand': E('lightbinder', { m: 'target', s: 1.0 }, { m: 'sun', s: 0.4 }),
  'lightbinder:Sentence': E('lightbinder', { m: 'hammer', s: 1.05 }),
  'lightbinder:Radiant Lance': Es('lightbinder', 2, { m: 'spear', s: 1.15 }),
  'lightbinder:Light Tether': E('lightbinder', { m: 'chain', s: 1.2 }),
  'lightbinder:Halo Ward': E('lightbinder', { m: 'halo', s: 1.1 }, { m: 'shield', s: 0.5, y: 10 }),
  'lightbinder:Chains of Dawn': E('lightbinder', { m: 'dawn', s: 0.9, y: -8 }, { m: 'chain', s: 0.7, y: 18 }),
  // spell items
  'spell:fireball': E('pyromancer', { m: 'fireball', s: 1.2 }),
  'spell:healingLight': E('lightbinder', { m: 'sun', s: 1.2 }, { m: 'heart', s: 0.55 }),
  // Origins
  'origin:heroicAdaptation': E('human', { m: 'star', s: 0.9 }, { m: 'fist', s: 0.5, y: 4 }),
  'origin:rally': E('human', { m: 'horn', s: 1.15 }),
  'origin:heroResolve': E('human', { m: 'shield', s: 1.05 }, { m: 'heart', s: 0.5, y: 2 }),
  'origin:banner': E('human', { m: 'banner', s: 1.1, x: 4 }),
  'origin:unbroken': E('human', { m: 'shield', s: 1.05 }, { m: 'sword', s: 0.6, r: 0.0 }),
  'origin:legendAwakened': Es('human', 3, { m: 'crown', s: 0.9, y: 6 }, { m: 'sun', s: 0.55, y: -20 }),
  'origin:elvenGrace': Es('elf', 2, { m: 'leaf', s: 0.95 }),
  'origin:moonveil': E('elf', { m: 'moon', s: 0.9, x: -4 }, { m: 'cloud', s: 0.55, x: 14, y: 16, c: rgba('#e8fff4', 0.6) }),
  'origin:starlightVolley': Es('elf', 2, { m: 'star', s: 0.5, x: -16, y: 12 }, { m: 'star', s: 0.55, x: 0, y: -4 }, { m: 'star', s: 0.5, x: 18, y: -18 }),
  'origin:treeshape': E('elf', { m: 'tree', s: 1.1 }),
  'origin:windWalker': E('elf', { m: 'wingF', s: 1.1 }),
  'origin:grace': Es('elf', 3, { m: 'wingF', s: 0.9, x: -6 }, { m: 'star', s: 0.45, x: 18, y: -16 }),
  'origin:stubborn': E('dwarf', { m: 'mountain', s: 1.1, y: 4 }),
  'origin:bulwark': E('dwarf', { m: 'dome', s: 1.15, y: 6 }, { m: 'mountain', s: 0.45, y: -4 }),
  'origin:mountainsWrath': E('dwarf', { m: 'burst', s: 1.15, c: '#ffd08a' }, { m: 'hammer', s: 0.6 }),
  'origin:runeheart': E('dwarf', { m: 'rune', s: 1.0 }, { m: 'heart', s: 0.4, y: 2 }),
  'origin:delversEndurance': E('dwarf', { m: 'boot', s: 0.85, x: 4, y: 6 }, { m: 'mountain', s: 0.5, x: -16, y: -16 }),
  'origin:heartOfMountain': Es('dwarf', 2, { m: 'mountain', s: 1.05, y: 4 }, { m: 'heart', s: 0.45, y: 8 }),
  'origin:wildSprint': E('beastfolk', { m: 'paw', s: 0.8, x: 6 }, { m: 'gust', s: 0.55, x: -16, y: 18 }),
  'origin:huntersMark': E('beastfolk', { m: 'target', s: 1.1 }),
  'origin:savageHowl': E('beastfolk', { m: 'wolf', s: 0.95, y: 4 }, { m: 'moon', s: 0.4, x: 20, y: -20 }),
  'origin:packCall': E('beastfolk', { m: 'paw', s: 0.5, x: -16, y: 12 }, { m: 'paw', s: 0.55, x: 0, y: -8 }, { m: 'paw', s: 0.5, x: 16, y: 12 }),
  'origin:bloodscent': E('beastfolk', { m: 'drop', s: 0.85, c: '#ff8a7a' }, { m: 'eye', s: 0.45, y: 6 }),
  'origin:primalRage': E('beastfolk', { m: 'claw', s: 1.1 }),
  'origin:bloodRush': E('demon', { m: 'drop', s: 0.95, c: '#ff8a8a' }, { m: 'bolt', s: 0.45, x: 16, y: -14 }),
  'origin:hellstep': E('demon', { m: 'boot', s: 0.85, x: 4, y: 4 }, { m: 'flame', s: 0.55, x: -16, y: -14 }),
  'origin:bloodAwakening': E('demon', { m: 'eye', s: 1.0 }, { m: 'drop', s: 0.4, y: 22, c: '#ff8a8a' }),
  'origin:demonicHide': E('demon', { m: 'shield', s: 1.0 }, { m: 'horns', s: 0.5, y: -2 }),
  'origin:brimstone': Es('demon', 2, { m: 'ripple', s: 1.1, y: 14 }, { m: 'flame', s: 0.6, y: -8 }),
  'origin:demonForm': E('demon', { m: 'horns', s: 1.15 }),
  'origin:dragonBreath': E('dragonkin', { m: 'fireball', s: 1.15, r: Math.PI }),
  'origin:glide': E('dragonkin', { m: 'wingF', s: 1.1 }),
  'origin:wingBurst': E('dragonkin', { m: 'burst', s: 1.05, c: '#ffc08a' }, { m: 'wingF', s: 0.6 }),
  'origin:trueFlight': Es('dragonkin', 2, { m: 'wingF', s: 0.8, x: -10 }, { m: 'wingF', s: 0.8, x: 10, r: 0, c: '#ffe0b0' }, { m: 'arrowUp', s: 0.4, y: -22 }),
  'origin:descent': E('dragonkin', { m: 'arrowDown', s: 0.8, y: -6 }, { m: 'burst', s: 0.6, y: 22, c: '#ffc08a' }),
  'origin:fireBreath': E('dragonkin', { m: 'flame', s: 1.15 }, { m: 'horns', s: 0.4, y: 26 }),
};

/** An emblem for any move: a written one, or a fallback from the discipline's sigil glyph. */
export function emblemFor(key: string): EmblemSpec {
  if (EMBLEMS[key]) return EMBLEMS[key];
  const disc = key.split(':')[0];
  return E(PALETTES[disc] ? disc : 'human', { m: 'star', s: 0.9 });
}

const RIMS: Record<string, string> = { combat: '#c4ccd6', magic: '#d9a83a', calling: '#b8783a', legacy: '#e0ac34' };

/** A class's medallion: its own colour and its sigil (ui/skillTree.ts ICONS). */
export function classEmblem(hex: string, sigil: string, family: string): EmblemSpec {
  const pal: Palette = { bg: [mix(hex, '#000000', 0.35), mix(hex, '#000000', 0.82)], fg: light(hex, 0.78), glow: hex, rim: RIMS[family] ?? RIMS.combat };
  return { pal, layers: [{ m: 'sigil', d: sigil, s: 1.15 }] };
}
