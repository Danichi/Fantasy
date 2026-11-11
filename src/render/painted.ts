import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import SETS from './paintedSets.json';

// Painted surface kit (docs/ART-DIRECTION.md §1, §3): the hand-painted
// textures every wall, roof, beam, path and cliff in the world is made of.
//
// The paintings live in public/assets/textures/painted (an albedo and a normal
// map each, made seamless by tools/make-texture.mjs, which also records them
// in paintedSets.json). A surface without a painting falls back to the simple
// pattern drawn in code below (PAINT), so a missing file never leaves a hole.

type Ctx = CanvasRenderingContext2D;
const SIZE = 512;

function canvas(fill: string) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  g.fillStyle = fill;
  g.fillRect(0, 0, SIZE, SIZE);
  return { c, g };
}

/** Soft mottling: many faint blobs, wrapped so the texture tiles. */
function mottle(g: Ctx, rnd: () => number, colors: string[], count: number, rMin: number, rMax: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, r = rMin + rnd() * (rMax - rMin);
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      if (x + ox + r < 0 || x + ox - r > SIZE || y + oy + r < 0 || y + oy - r > SIZE) continue;
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, g.fillStyle as string);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    }
  }
  g.globalAlpha = 1;
}

/** Short soft strokes (brush marks), wrapped. */
function strokes(g: Ctx, rnd: () => number, colors: string[], count: number, len: number, width: number, angle: number, jitter: number, alpha: number) {
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE;
    const a = angle + (rnd() - 0.5) * jitter;
    const l = len * (0.5 + rnd());
    g.strokeStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = alpha * (0.5 + rnd() * 0.5);
    g.lineWidth = width * (0.6 + rnd() * 0.8);
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function toTexture(c: HTMLCanvasElement, aniso: number) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

export const PAINT = {
  plaster(rnd: () => number) {
    const { c, g } = canvas('#eadcc0');
    mottle(g, rnd, ['#e2d2b2', '#efe4cc', '#ddcdab'], 60, 60, 180, 0.18);
    strokes(g, rnd, ['#e4d5b7', '#efe3ca'], 140, 40, 10, 0.3, 1.2, 0.18);
    return c;
  },
  timber(rnd: () => number) {
    const { c, g } = canvas('#6b4a33');
    mottle(g, rnd, ['#5a3c28', '#7a5639', '#634430'], 50, 30, 120, 0.4);
    strokes(g, rnd, ['#5b3d29', '#7d5a3f', '#86613f'], 260, 90, 4, Math.PI / 2, 0.15, 0.35);
    return c;
  },
  stone(rnd: () => number, base = '#a7a39a') {
    const { c, g } = canvas('#8e897f');
    const rows = 5;
    const rh = SIZE / rows;
    const tones = ['#aaa69c', '#b4afa4', '#9d998f', '#a8a296', '#b8b2a5', '#a19b8e'];
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 80;
      while (x < SIZE) {
        const w = 70 + rnd() * 90;
        g.fillStyle = r === 0 && x < 0 ? base : tones[Math.floor(rnd() * tones.length)];
        for (const ox of [0, SIZE, -SIZE]) {
          roundRect(g, x + ox + 4, r * rh + 4, w - 8, rh - 8, 18);
          g.fill();
        }
        // Soft top light and bottom shade on each stone.
        const grd = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        grd.addColorStop(0, 'rgba(255,250,235,0.18)');
        grd.addColorStop(1, 'rgba(60,55,50,0.16)');
        g.fillStyle = grd;
        for (const ox of [0, SIZE, -SIZE]) {
          roundRect(g, x + ox + 4, r * rh + 4, w - 8, rh - 8, 18);
          g.fill();
        }
        x += w;
      }
    }
    mottle(g, rnd, ['#8f8a80', '#bdb7aa', '#7f8a6a'], 40, 30, 110, 0.18);
    return c;
  },
  roofTiles(rnd: () => number, base: string, dark: string, light: string) {
    const { c, g } = canvas(dark);
    const rows = 10;
    const rh = SIZE / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 25;
      for (let x = -50 + off; x < SIZE + 50; x += 50) {
        const tint = rnd();
        g.fillStyle = tint < 0.3 ? light : tint > 0.85 ? dark : base;
        roundRect(g, x + 2, r * rh + 1, 46, rh + 6, 14);
        g.fill();
        const grd = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh + 6);
        grd.addColorStop(0, 'rgba(0,0,0,0.22)');
        grd.addColorStop(0.35, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(255,255,255,0.1)');
        g.fillStyle = grd;
        roundRect(g, x + 2, r * rh + 1, 46, rh + 6, 14);
        g.fill();
      }
    }
    mottle(g, rnd, [dark, light, '#6f7a55'], 30, 40, 140, 0.16);
    return c;
  },
  thatch(rnd: () => number) {
    const { c, g } = canvas('#9e8452');
    mottle(g, rnd, ['#8f7646', '#b0965f', '#86703f'], 50, 40, 130, 0.35);
    strokes(g, rnd, ['#ad9360', '#8a7142', '#bda46e', '#7c6538'], 900, 60, 5, Math.PI / 2, 0.25, 0.5);
    // Bundle rows.
    for (let r = 0; r < 6; r++) {
      g.fillStyle = 'rgba(80,60,25,0.22)';
      g.fillRect(0, r * (SIZE / 6) + SIZE / 6 - 10, SIZE, 10);
    }
    return c;
  },
  planks(rnd: () => number) {
    const { c, g } = canvas('#9a7650');
    const n = 6;
    const pw = SIZE / n;
    const tones = ['#9f7b53', '#a8845a', '#8f6d48', '#b08c62'];
    for (let i = 0; i < n; i++) {
      g.fillStyle = tones[Math.floor(rnd() * tones.length)];
      g.fillRect(i * pw + 3, 0, pw - 6, SIZE);
    }
    strokes(g, rnd, ['#86643f', '#b69468'], 220, 110, 3, Math.PI / 2, 0.08, 0.3);
    return c;
  },
  cobbles(rnd: () => number) {
    const { c, g } = canvas('#6a655b');
    // Rounded stones on a loose grid, each with a soft top-lit gradient.
    const n = 7;
    const cell = SIZE / n;
    const tones = ['#9a9488', '#8f897d', '#a39c8e', '#878175', '#a0957f', '#918f85'];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = (i + 0.5 + (j % 2) * 0.5) * cell + (rnd() - 0.5) * 10;
      const cy = (j + 0.5) * cell + (rnd() - 0.5) * 10;
      const rw = cell * (0.4 + rnd() * 0.08), rh = cell * (0.38 + rnd() * 0.08);
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
        g.fillStyle = tones[Math.floor(rnd() * tones.length)];
        roundRect(g, cx + ox - rw, cy + oy - rh, rw * 2, rh * 2, rh * 0.9);
        g.fill();
        const grd = g.createLinearGradient(cx + ox - rw, cy + oy - rh, cx + ox + rw, cy + oy + rh);
        grd.addColorStop(0, 'rgba(255,248,230,0.2)');
        grd.addColorStop(1, 'rgba(50,45,40,0.2)');
        g.fillStyle = grd;
        roundRect(g, cx + ox - rw, cy + oy - rh, rw * 2, rh * 2, rh * 0.9);
        g.fill();
      }
    }
    mottle(g, rnd, ['#8a8578', '#c2bba9', '#6f7c55'], 30, 40, 140, 0.15);
    return c;
  },
  dirt(rnd: () => number) {
    const { c, g } = canvas('#ad9676');
    mottle(g, rnd, ['#a08a6b', '#bba584', '#9b8566', '#c2ad8c', '#98936a'], 90, 30, 140, 0.3);
    // Pebbles.
    for (let i = 0; i < 220; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 2 + rnd() * 5;
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,98,70,0.5)' : 'rgba(205,185,150,0.45)';
      g.beginPath();
      g.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  },
  bark(rnd: () => number) {
    const { c, g } = canvas('#6a4b35');
    strokes(g, rnd, ['#5a3e2b', '#7c5a40', '#4f3625'], 500, 120, 7, Math.PI / 2, 0.2, 0.45);
    return c;
  },
};

/** A painted set as tools/make-texture.mjs recorded it. */
interface PaintedSet {
  normal: boolean;
  /** width / height of what the tile shows, so features keep their shape */
  aspect: number;
  /** tiles per material tile (the scale of its features) */
  repeat: number;
  /** its average colour */
  color: string;
  /** one whole object (a window, a door), not a tiling surface */
  decal?: boolean;
  /** it has a mask of its glass (lit windows) */
  glow?: boolean;
}
const KIT = SETS as Record<string, PaintedSet | undefined>;
const loader = new THREE.TextureLoader();
const kitCache = new Map<string, THREE.Texture>();
const kitLoaded = new Map<string, Promise<void>>();

/** One map of a painted set, shared by everything that uses it. */
function kitTexture(name: string, map: 'albedo' | 'normal' | 'glow', aniso: number) {
  const key = `${name}_${map}`;
  let t = kitCache.get(key);
  if (!t) {
    const set = KIT[name]!;
    let done!: () => void;
    kitLoaded.set(key, new Promise<void>((r) => (done = r)));
    t = loader.load(`/assets/textures/painted/${key}.webp`, () => done());
    t.wrapS = t.wrapT = set.decal ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (map === 'albedo') t.colorSpace = THREE.SRGBColorSpace;
    if (!set.decal) t.repeat.set(set.repeat, set.repeat * set.aspect);
    kitCache.set(key, t);
  }
  t.anisotropy = Math.max(t.anisotropy, aniso);
  return t;
}

/**
 * The same picture as its own texture object (one upload: they share the
 * image), for a material whose scale the caller sets itself.
 */
function kitInstance(name: string, map: 'albedo' | 'normal', aniso: number) {
  const base = kitTexture(name, map, aniso);
  const t = new THREE.Texture();
  t.source = base.source;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = base.colorSpace;
  t.anisotropy = aniso;
  t.repeat.copy(base.repeat);
  void kitLoaded.get(`${name}_${map}`)!.then(() => (t.needsUpdate = true));
  return t;
}

/**
 * A material of its own from the painted kit (dungeon walls, cave rock: one
 * per use, so its scale and tint are its own). `average` is the colour the
 * surface should come out on the whole (linear): the painting is tinted to
 * it and keeps its drawing. Returns null when the kit has no such painting.
 */
export function paintedMaterial(name: string, opts: THREE.MeshStandardMaterialParameters = {}, aniso = 4, average?: THREE.Color) {
  const set = KIT[name];
  if (!set) return null;
  const { color, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...rest, map: kitInstance(name, 'albedo', aniso) });
  if (set.normal) m.normalMap = kitInstance(name, 'normal', aniso);
  if (average) {
    const mean = new THREE.Color(set.color);
    m.color.setRGB(Math.min(3, average.r / Math.max(mean.r, 0.02)), Math.min(3, average.g / Math.max(mean.g, 0.02)), Math.min(3, average.b / Math.max(mean.b, 0.02)));
  } else if (color !== undefined) m.color.set(color as THREE.ColorRepresentation);
  m.userData.styleSoftness = 0;
  return m;
}

/**
 * A whole painted object on a box or a card (a window, a door): the picture
 * fills each face. `glow` lights its glass from inside (emissive, masked to
 * the panes); the caller turns emissiveIntensity up at night.
 */
export function paintedDecal(name: string, aniso: number, glow?: THREE.ColorRepresentation) {
  const set = KIT[name];
  if (!set) return null;
  const m = new THREE.MeshStandardMaterial({ map: kitTexture(name, 'albedo', aniso), roughness: 0.8, metalness: 0 });
  if (set.normal) m.normalMap = kitTexture(name, 'normal', aniso);
  if (glow !== undefined && set.glow) {
    m.emissive.set(glow);
    m.emissiveMap = kitTexture(name, 'glow', aniso);
    m.emissiveIntensity = 0.28;
  }
  m.userData.styleSoftness = 0;
  return m;
}

export interface PaintedMats {
  stone: THREE.MeshStandardMaterial;
  bridgeStone: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  slate: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  thatch: THREE.MeshStandardMaterial;
  planks: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
}

/** A ground surface the terrain samples itself: its picture and how often it repeats per metre. */
export interface PaintedGround {
  map: THREE.Texture;
  /** multiply world metres by this for UVs (x, z) */
  scale: THREE.Vector2;
  /** average linear brightness of the picture (to use it as light and shade only) */
  mean: number;
}

const FALLBACK_SEED: Record<string, number> = { cobbles: 7, dirt: 8, grass: 9, rock: 10, forest_floor: 11 };

/**
 * A painted ground texture for the terrain shader. `metres` is how much ground
 * one tile covers.
 */
export function paintedGround(kind: 'cobbles' | 'dirt' | 'grass' | 'rock' | 'forest_floor', metres: number, aniso: number): PaintedGround {
  const set = KIT[kind];
  if (set) {
    const c = new THREE.Color(set.color);
    return {
      map: kitTexture(kind, 'albedo', aniso),
      scale: new THREE.Vector2(set.repeat / metres, (set.repeat * set.aspect) / metres),
      mean: c.r * 0.3 + c.g * 0.55 + c.b * 0.15,
    };
  }
  const rnd = mulberry32(FALLBACK_SEED[kind]);
  const canvas = kind === 'cobbles' ? PAINT.cobbles(rnd) : kind === 'rock' ? PAINT.stone(rnd) : PAINT.dirt(rnd);
  return { map: toTexture(canvas, aniso), scale: new THREE.Vector2(1 / metres, 1 / metres), mean: 0.3 };
}

export function paintedMaterials(aniso: number): PaintedMats {
  const rnd = mulberry32(4242);
  /** `relief` scales the normal map: how deep the joints and grain read. */
  const mat = (name: string, fallback: () => HTMLCanvasElement, roughness = 0.92, relief = 1) => {
    const set = KIT[name];
    const m = new THREE.MeshStandardMaterial({ map: set ? kitTexture(name, 'albedo', aniso) : toTexture(fallback(), aniso), roughness, metalness: 0 });
    if (set?.normal) {
      m.normalMap = kitTexture(name, 'normal', aniso);
      m.normalScale.setScalar(relief);
    }
    m.userData.styleSoftness = 0; // already painted
    return m;
  };
  // Building surfaces weather in the shader (render/stylize.ts): colour drift,
  // rain streaks, and moss on roofs.
  const weather = (m: THREE.MeshStandardMaterial, roof = false) => {
    m.defines = { ...m.defines, STYLE_WEATHER: '', ...(roof ? { STYLE_ROOF: '' } : {}) };
    return m;
  };
  const stone = weather(mat('stone', () => PAINT.stone(rnd)));
  // Bridges and quays: the same masonry, a shade paler and cooler.
  const bridgeStone = weather(mat('stone', () => PAINT.stone(rnd, '#b3ada1')));
  if (KIT.stone) bridgeStone.color.setRGB(1.06, 1.07, 1.1);
  return {
    stone,
    bridgeStone,
    plaster: weather(mat('plaster', () => PAINT.plaster(rnd), 0.96, 0.6)),
    timber: weather(mat('timber', () => PAINT.timber(rnd))),
    slate: weather(mat('roof_slate', () => PAINT.roofTiles(rnd, '#566479', '#465266', '#687690'), 0.8, 1.2), true),
    tile: weather(mat('roof_tile', () => PAINT.roofTiles(rnd, '#a4553c', '#874632', '#b86a4d'), 0.85, 1.2), true),
    thatch: weather(mat('thatch', () => PAINT.thatch(rnd), 1, 1.2), true),
    planks: weather(mat('planks', () => PAINT.planks(rnd))),
    bark: mat('bark', () => PAINT.bark(rnd), 0.95, 1.2),
  };
}
