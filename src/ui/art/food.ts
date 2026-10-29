import { shade, line, glow, sparkle, light, dark, rgba, ellipse, circle, blob, rng, leaf, type G, type PathFn } from './kit';

// Fish and food: each fish species with its own body, fins and markings, and
// the kitchen's goods (fruit, bread, cheese, stews, rations, raw meat, seeds).

// ---- fish -------------------------------------------------------------------------------------
export interface FishSpec {
  back: string;
  belly: string;
  fin?: string;
  /** body depth relative to length */
  depth?: number;
  tail?: 'fork' | 'round' | 'lunate';
  pattern?: 'stripes' | 'bands' | 'spots' | 'wavy' | 'scales' | 'rainbow' | 'none';
  patternColor?: string;
  extra?: 'whiskers' | 'lure' | 'bill' | 'sail' | 'eel' | 'ray' | 'crab' | 'boot';
  glow?: string;
}

export function paintFish(g: G, f: FishSpec, seed: string) {
  const r = rng(seed);
  if (f.glow) glow(g, 64, 64, 60, f.glow, 0.55);
  if (f.extra === 'crab') return crab(g, f);
  if (f.extra === 'ray') return ray(g, f);
  if (f.extra === 'boot') return boot(g);
  if (f.extra === 'eel') return eel(g, f, r);
  g.save();
  // Fish swim up and to the right on the diagonal, like the weapons.
  g.translate(64, 66);
  g.rotate(-0.42);
  const L = 50, D = L * (f.depth ?? 0.42);
  const fin = f.fin ?? dark(f.back, 0.1);
  const body: PathFn = (c) => {
    c.moveTo(L, 0);
    c.bezierCurveTo(L * 0.7, -D * 1.05, -L * 0.45, -D * 1.1, -L * 0.72, -D * 0.12);
    c.lineTo(-L * 0.72, D * 0.12);
    c.bezierCurveTo(-L * 0.45, D * 1.1, L * 0.7, D * 1.05, L, 0);
    c.closePath();
  };
  // Tail.
  const tailPath: PathFn = (c) => {
    const tx = -L * 0.68;
    c.moveTo(tx + 4, 0);
    if (f.tail === 'round') {
      c.bezierCurveTo(tx - 18, -D * 1.1, tx - 30, -D * 0.4, tx - 28, 0);
      c.bezierCurveTo(tx - 30, D * 0.4, tx - 18, D * 1.1, tx + 4, 0);
    } else if (f.tail === 'lunate') {
      c.lineTo(tx - 22, -D * 1.25);
      c.quadraticCurveTo(tx - 14, 0, tx - 22, D * 1.25);
      c.closePath();
    } else {
      c.lineTo(tx - 24, -D * 1.0);
      c.lineTo(tx - 14, 0);
      c.lineTo(tx - 24, D * 1.0);
      c.closePath();
    }
  };
  shade(g, tailPath, fin, { band: 2, box: [-L - 30, -D, -L * 0.5, D] });
  line(g, dark(fin, 0.4), 0.8, (c) => {
    for (let i = -2; i <= 2; i++) {
      c.moveTo(-L * 0.68, 0);
      c.lineTo(-L * 0.68 - 22, i * D * 0.38);
    }
  }, 0.6);
  // Dorsal fin (a sail for the marlin) and a belly fin.
  const dorsal: PathFn = f.extra === 'sail'
    ? (c) => {
      c.moveTo(L * 0.3, -D * 0.8);
      c.quadraticCurveTo(L * 0.1, -D * 3.2, -L * 0.45, -D * 1.2);
      c.lineTo(-L * 0.4, -D * 0.7);
      c.closePath();
    }
    : (c) => {
      c.moveTo(L * 0.25, -D * 0.92);
      c.quadraticCurveTo(L * 0.02, -D * 1.75, -L * 0.32, -D * 0.98);
      c.lineTo(-L * 0.22, -D * 0.72);
      c.closePath();
    };
  shade(g, dorsal, fin, { band: 1.5, box: [-L * 0.5, -D * 3, L * 0.3, -D * 0.6] });
  shade(g, (c) => {
    c.moveTo(L * 0.05, D * 0.85);
    c.quadraticCurveTo(-L * 0.1, D * 1.55, -L * 0.25, D * 0.9);
    c.closePath();
  }, fin, { band: 1, box: [-L * 0.3, D * 0.8, L * 0.1, D * 1.6] });
  // Body: dark back, pale belly.
  g.save();
  g.beginPath();
  body(g);
  g.clip();
  const bg = g.createLinearGradient(0, -D, 0, D);
  bg.addColorStop(0, dark(f.back, 0.12));
  bg.addColorStop(0.45, f.back);
  bg.addColorStop(0.62, f.belly);
  bg.addColorStop(1, light(f.belly, 0.25));
  g.fillStyle = bg;
  g.fillRect(-L, -D * 1.2, L * 2, D * 2.4);
  const pc = f.patternColor ?? dark(f.back, 0.35);
  switch (f.pattern) {
    case 'stripes':
      for (let i = 0; i < 6; i++) {
        g.fillStyle = rgba(pc, 0.7);
        g.beginPath();
        g.ellipse(-L * 0.45 + i * L * 0.2, -D * 0.25, 3, D * 0.8, 0.15, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'bands':
      g.fillStyle = rgba(pc, 0.75);
      g.fillRect(-L, -D * 0.12, L * 2, D * 0.2);
      break;
    case 'spots':
      for (let i = 0; i < 22; i++) {
        g.fillStyle = rgba(pc, 0.85);
        g.beginPath();
        g.arc(-L * 0.6 + r() * L * 1.4, -D * 0.9 + r() * D * 1.1, 1 + r() * 1.4, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'wavy':
      g.strokeStyle = rgba(pc, 0.8);
      g.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        const x = -L * 0.5 + i * L * 0.16;
        g.moveTo(x, -D);
        g.bezierCurveTo(x + 6, -D * 0.7, x - 6, -D * 0.4, x + 2, -D * 0.1);
        g.stroke();
      }
      break;
    case 'rainbow': {
      const cols = ['#ff5a5a', '#ffb43a', '#ffe84a', '#5ae07a', '#4ab0ff', '#9a6aff'];
      cols.forEach((c, i) => {
        g.fillStyle = rgba(c, 0.75);
        g.fillRect(-L, -D + i * (D * 2) / 6, L * 2, (D * 2) / 6 + 0.5);
      });
      break;
    }
    case 'scales':
      g.strokeStyle = rgba(dark(f.back, 0.4), 0.5);
      g.lineWidth = 1;
      for (let y = -D; y < D; y += 6) {
        for (let x = -L * 0.6 + ((y / 6) % 2 ? 3 : 0); x < L * 0.6; x += 6) {
          g.beginPath();
          g.arc(x, y, 3.4, 0.3, Math.PI - 0.3);
          g.stroke();
        }
      }
      break;
  }
  // Core shadow and gloss.
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = rgba(dark(f.back, 0.5), 0.35);
  g.beginPath();
  g.ellipse(-L * 0.05, D * 0.75, L * 0.95, D * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  const sp = g.createRadialGradient(L * 0.2, -D * 0.55, 0, L * 0.2, -D * 0.55, L * 0.5);
  sp.addColorStop(0, 'rgba(255,255,255,0.65)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sp;
  g.fillRect(-L, -D * 1.2, L * 2, D * 2.4);
  g.restore();
  // Gill line and eye.
  line(g, dark(f.back, 0.45), 1.4, (c) => {
    c.moveTo(L * 0.52, -D * 0.6);
    c.quadraticCurveTo(L * 0.4, 0, L * 0.52, D * 0.6);
  }, 0.75);
  shade(g, circle(L * 0.7, -D * 0.25, 4.6), '#f4f0e0', { band: 0.8, box: [L * 0.6, -D * 0.4, L * 0.8, -D * 0.1] });
  g.fillStyle = '#141018';
  g.beginPath();
  g.arc(L * 0.72, -D * 0.25, 2.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(L * 0.73, -D * 0.3, 0.9, 0, Math.PI * 2);
  g.fill();
  if (f.extra === 'whiskers') {
    line(g, dark(f.back, 0.5), 1.4, (c) => {
      c.moveTo(L * 0.92, D * 0.15);
      c.quadraticCurveTo(L * 1.2, D * 0.6, L * 1.05, D * 1.3);
      c.moveTo(L * 0.9, D * 0.25);
      c.quadraticCurveTo(L * 1.05, D * 0.9, L * 0.8, D * 1.4);
    }, 1);
  }
  if (f.extra === 'bill') {
    shade(g, (c) => {
      c.moveTo(L * 0.94, -D * 0.12);
      c.lineTo(L * 1.55, -D * 0.02);
      c.lineTo(L * 0.94, D * 0.12);
      c.closePath();
    }, f.back, { band: 0.8, box: [L * 0.9, -D * 0.2, L * 1.6, D * 0.2] });
  }
  if (f.extra === 'lure') {
    line(g, dark(f.back, 0.3), 1.6, (c) => {
      c.moveTo(L * 0.6, -D * 0.85);
      c.quadraticCurveTo(L * 0.9, -D * 2.2, L * 1.15, -D * 1.4);
    }, 1);
    glow(g, L * 1.15, -D * 1.3, 12, '#ffe86a', 0.95);
    shade(g, circle(L * 1.15, -D * 1.3, 3.4), '#fff4a0', { gloss: 2, band: 0 });
  }
  g.restore();
}

function eel(g: G, f: FishSpec, r: () => number) {
  const path: PathFn = (c) => {
    c.moveTo(24, 104);
    c.bezierCurveTo(10, 80, 50, 76, 58, 64);
    c.bezierCurveTo(68, 48, 40, 34, 64, 22);
    c.bezierCurveTo(78, 14, 104, 18, 108, 30);
    c.bezierCurveTo(102, 34, 86, 28, 76, 34);
    c.bezierCurveTo(60, 44, 84, 60, 70, 76);
    c.bezierCurveTo(60, 88, 34, 88, 30, 106);
    c.closePath();
  };
  shade(g, path, f.back, { band: 4, gloss: 2, rim: true, box: [10, 14, 110, 108] });
  line(g, '#ffe86a', 2, (c) => {
    c.moveTo(58, 52);
    c.lineTo(52, 60);
    c.lineTo(58, 62);
    c.lineTo(50, 72);
  }, 0.9);
  shade(g, circle(98, 25, 3.2), '#ffe070', { band: 0, gloss: 2 });
  g.fillStyle = '#100810';
  g.beginPath();
  g.arc(98.6, 25, 1.6, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 3; i++) sparkle(g, 40 + r() * 50, 30 + r() * 60, 3, '#e8f4ff');
}

function ray(g: G, f: FishSpec) {
  shade(g, (c) => {
    c.moveTo(64, 26);
    c.bezierCurveTo(90, 30, 110, 54, 118, 70);
    c.bezierCurveTo(98, 72, 80, 80, 64, 92);
    c.bezierCurveTo(48, 80, 30, 72, 10, 70);
    c.bezierCurveTo(18, 54, 38, 30, 64, 26);
    c.closePath();
  }, f.back, { band: 4, gloss: 2, box: [10, 26, 118, 92] });
  line(g, dark(f.back, 0.3), 3, (c) => {
    c.moveTo(64, 92);
    c.quadraticCurveTo(66, 108, 60, 122);
  }, 1);
  for (const sx of [56, 72]) {
    g.fillStyle = 'rgba(30,30,50,0.7)';
    g.beginPath();
    g.arc(sx, 44, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  sparkle(g, 40, 50, 4, '#ffffff');
}

function crab(g: G, f: FishSpec) {
  const c = f.back;
  // Legs.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      line(g, dark(c, 0.35), 5, (p) => {
        p.moveTo(64 + s * 20, 76 + i * 6);
        p.quadraticCurveTo(64 + s * 42, 70 + i * 8, 64 + s * 50, 92 + i * 7);
      }, 1);
      line(g, c, 3, (p) => {
        p.moveTo(64 + s * 20, 76 + i * 6);
        p.quadraticCurveTo(64 + s * 42, 70 + i * 8, 64 + s * 50, 92 + i * 7);
      }, 1);
    }
    // Claws.
    shade(g, (p) => {
      const x = 64 + s * 38;
      p.moveTo(x - s * 6, 52);
      p.bezierCurveTo(x - s * 4, 30, x + s * 16, 24, x + s * 14, 40);
      p.lineTo(x + s * 4, 42);
      p.lineTo(x + s * 12, 50);
      p.bezierCurveTo(x + s * 8, 60, x - s * 4, 62, x - s * 6, 52);
      p.closePath();
    }, c, { band: 2.5, gloss: 1, box: [64 + s * 30 - 12, 24, 64 + s * 30 + 24, 62] });
  }
  shade(g, ellipse(64, 70, 30, 20), c, { band: 4, gloss: 2, rim: true, box: [34, 50, 94, 90] });
  for (let i = 0; i < 9; i++) {
    const x = 42 + (i % 5) * 11, y = 62 + Math.floor(i / 5) * 8;
    shade(g, circle(x, y, 2.2), light(c, 0.25), { band: 0 });
  }
  for (const s of [-1, 1]) {
    line(g, dark(c, 0.4), 2, (p) => {
      p.moveTo(64 + s * 6, 52);
      p.lineTo(64 + s * 8, 44);
    }, 1);
    shade(g, circle(64 + s * 8, 43, 3), '#1a1014', { band: 0, gloss: 2 });
  }
}

function boot(g: G) {
  const c = '#6a4a30';
  shade(g, (p) => {
    p.moveTo(46, 18);
    p.lineTo(78, 16);
    p.lineTo(80, 72);
    p.bezierCurveTo(98, 76, 112, 84, 112, 100);
    p.lineTo(110, 108);
    p.lineTo(34, 108);
    p.lineTo(36, 74);
    p.closePath();
  }, c, { band: 4, gloss: 1, rim: true, box: [34, 16, 112, 108] });
  shade(g, (p) => p.roundRect(32, 104, 82, 9, 3), '#3a2618', { band: 2, box: [32, 104, 114, 113] });
  line(g, '#2a1a10', 1.4, (p) => {
    for (let i = 0; i < 4; i++) {
      p.moveTo(52, 30 + i * 9);
      p.lineTo(72, 28 + i * 9);
    }
  }, 0.8);
  // Water dripping out and a weed hanging off it.
  for (const [x, y] of [[40, 118], [70, 120], [96, 118]] as [number, number][]) shade(g, ellipse(x, y, 2, 3), '#8ad0ff', { gloss: 2, band: 0 });
  line(g, '#4a8a3a', 3, (p) => {
    p.moveTo(76, 18);
    p.quadraticCurveTo(90, 26, 84, 44);
  }, 1);
}

export const FISH: Record<string, FishSpec> = {
  glenPerch: { back: '#6a8a3a', belly: '#e8d890', fin: '#e07a3a', pattern: 'stripes', patternColor: '#2e4a1a', depth: 0.46 },
  silverTrout: { back: '#7a8a98', belly: '#eef2f4', fin: '#a8b4bc', pattern: 'spots', patternColor: '#2a3440', tail: 'round', depth: 0.36 },
  mudcat: { back: '#5a4a3a', belly: '#c8b490', fin: '#4a3a2a', extra: 'whiskers', tail: 'round', depth: 0.38 },
  goldenCarp: { back: '#e8a01a', belly: '#ffe08a', fin: '#ff8a1a', pattern: 'scales', depth: 0.5, glow: '#ffd04a' },
  mackerel: { back: '#2a6a8a', belly: '#e8f0f4', fin: '#3a5a6a', pattern: 'wavy', patternColor: '#0a2a3a', tail: 'fork', depth: 0.34 },
  seaBream: { back: '#c08a9a', belly: '#f4e8ec', fin: '#d8a0b0', pattern: 'scales', depth: 0.5 },
  rainbowWrasse: { back: '#4a8aff', belly: '#ffe86a', fin: '#ff5aa8', pattern: 'rainbow', depth: 0.42 },
  moonfish: { back: '#c8d0e8', belly: '#f8f8ff', fin: '#a8b4d8', depth: 0.74, tail: 'round', glow: '#c8d4ff' },
  stormjaw: { back: '#2a3a5a', belly: '#6a7a9a', extra: 'eel' },
  bluefin: { back: '#1a2a5a', belly: '#d8e0e8', fin: '#e8c23a', pattern: 'bands', patternColor: '#8a9ab8', tail: 'lunate', depth: 0.4 },
  marlin: { back: '#1a3a7a', belly: '#e0e8f0', fin: '#2a4a8a', pattern: 'stripes', patternColor: '#5a8ad8', tail: 'lunate', extra: 'sail', depth: 0.3 },
  lanternjaw: { back: '#1e1a24', belly: '#3a3446', fin: '#2a2430', extra: 'lure', depth: 0.5 },
  ghostRay: { back: '#d8e4ec', belly: '#ffffff', extra: 'ray', glow: '#cfe4ff' },
  kingCrab: { back: '#d0402a', belly: '#f0c0a0', extra: 'crab' },
  oldBoot: { back: '#6a4a30', belly: '#6a4a30', extra: 'boot' },
};

// ---- food --------------------------------------------------------------------------------------
export type FoodKind = 'apple' | 'pear' | 'carrot' | 'cabbage' | 'pumpkin' | 'egg' | 'milk' | 'cheese' | 'loaf' | 'dates' | 'cake' | 'grilledFish' | 'stew' | 'feast' | 'ration' | 'biscuit' | 'brick' | 'meat' | 'seeds' | 'water';

export interface FoodSpec {
  kind: FoodKind;
  color?: string;
  accent?: string;
  /** seeds: the crop's colour on the tag */
  crop?: string;
}

export function paintFood(g: G, f: FoodSpec, seed: string) {
  const r = rng(seed);
  switch (f.kind) {
    case 'apple':
    case 'pear': {
      const c = f.color ?? (f.kind === 'apple' ? '#d8322a' : '#c8c83a');
      const path = f.kind === 'apple'
        ? blob([[64, 36], [86, 30], [104, 52], [98, 92], [76, 110], [64, 104], [52, 110], [30, 92], [24, 52], [42, 30]])
        : blob([[64, 26], [74, 34], [80, 56], [98, 82], [90, 108], [64, 114], [38, 108], [30, 82], [48, 56], [54, 34]]);
      shade(g, path, c, { gloss: 2, band: 6, rim: true, box: [24, 26, 104, 114], glossAt: [48, f.kind === 'apple' ? 52 : 62, 16] });
      if (f.kind === 'apple') {
        g.fillStyle = rgba(light(c, 0.5), 0.35);
        for (let i = 0; i < 18; i++) {
          g.beginPath();
          g.arc(36 + r() * 56, 44 + r() * 56, 0.9, 0, Math.PI * 2);
          g.fill();
        }
      }
      line(g, '#5a3a1a', 3.4, (p) => {
        p.moveTo(64, f.kind === 'apple' ? 38 : 28);
        p.quadraticCurveTo(62, 22, 68, 14);
      }, 1);
      shade(g, leaf(68, 22, 92, 14, 7, 2), '#5aa03a', { band: 1.5, gloss: 1, box: [68, 10, 92, 28] });
      return;
    }
    case 'carrot': {
      shade(g, (p) => {
        p.moveTo(44, 40);
        p.quadraticCurveTo(64, 30, 84, 42);
        p.quadraticCurveTo(82, 70, 66, 106);
        p.quadraticCurveTo(62, 114, 58, 106);
        p.quadraticCurveTo(46, 70, 44, 40);
        p.closePath();
      }, '#f07a1e', { gloss: 1, band: 4, rim: true, box: [44, 32, 84, 112] });
      line(g, '#a8480a', 1.4, (p) => {
        for (let i = 0; i < 6; i++) {
          const y = 50 + i * 9, w = 16 - i * 2.2;
          p.moveTo(64 - w, y);
          p.lineTo(64 - w + 7, y + 1);
        }
      }, 0.7);
      for (let i = 0; i < 4; i++) shade(g, leaf(64, 40, 44 + i * 14, 8 + Math.abs(i - 1.5) * 6, 5), '#4a9a2a', { band: 1, box: [40, 6, 92, 40] });
      return;
    }
    case 'cabbage': {
      const c = '#7ab84a';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        shade(g, ellipse(64 + Math.cos(a) * 18, 70 + Math.sin(a) * 14, 28, 22, a), dark(c, 0.1), { band: 3, box: [20, 40, 108, 108] });
      }
      shade(g, circle(64, 68, 26), light(c, 0.15), { gloss: 1, band: 4, rim: true, box: [38, 42, 90, 94] });
      line(g, light(c, 0.5), 1.6, (p) => {
        p.moveTo(64, 90);
        p.quadraticCurveTo(58, 66, 64, 44);
        p.moveTo(64, 74);
        p.quadraticCurveTo(76, 64, 84, 60);
        p.moveTo(64, 66);
        p.quadraticCurveTo(52, 58, 46, 56);
      }, 0.8);
      return;
    }
    case 'pumpkin': {
      const c = '#f08a1a';
      for (const [x, w] of [[38, 20], [90, 20], [52, 22], [76, 22], [64, 22]] as [number, number][]) shade(g, ellipse(x, 76, w, 32), c, { band: 3, gloss: 1, box: [x - w, 44, x + w, 108] });
      shade(g, (p) => p.roundRect(59, 30, 10, 18, 3), '#5a7a2a', { band: 1.5, box: [59, 30, 69, 48] });
      line(g, '#4a8a2a', 2, (p) => {
        p.moveTo(68, 36);
        p.bezierCurveTo(84, 28, 86, 44, 96, 38);
      }, 1);
      return;
    }
    case 'egg': {
      for (const [x, y, k] of [[48, 74, 0.9], [76, 70, 1]] as [number, number, number][]) {
        shade(g, (p) => {
          p.moveTo(x, y - 30 * k);
          p.bezierCurveTo(x + 22 * k, y - 30 * k, x + 22 * k, y + 28 * k, x, y + 28 * k);
          p.bezierCurveTo(x - 22 * k, y + 28 * k, x - 22 * k, y - 30 * k, x, y - 30 * k);
        }, f.color ?? '#c88a5a', { gloss: 2, band: 4, rim: true, box: [x - 22, y - 30, x + 22, y + 28] });
      }
      return;
    }
    case 'milk': {
      // A clay jug.
      const c = '#8aa0b8';
      shade(g, (p) => {
        p.moveTo(46, 28);
        p.lineTo(82, 28);
        p.quadraticCurveTo(78, 44, 90, 62);
        p.bezierCurveTo(100, 84, 92, 112, 64, 114);
        p.bezierCurveTo(36, 112, 28, 84, 38, 62);
        p.quadraticCurveTo(50, 44, 46, 28);
        p.closePath();
      }, c, { gloss: 1, band: 5, rim: true, box: [32, 28, 98, 114] });
      line(g, dark(c, 0.4), 7, (p) => {
        p.moveTo(86, 46);
        p.bezierCurveTo(108, 46, 108, 80, 90, 84);
      }, 1);
      shade(g, ellipse(64, 29, 18, 5), '#f8f6f0', { band: 0, box: [46, 24, 82, 34] });
      shade(g, (p) => p.roundRect(40, 70, 48, 10, 3), '#c8a070', { band: 1.5, box: [40, 70, 88, 80] });
      return;
    }
    case 'cheese': {
      const c = '#f2c23a';
      shade(g, (p) => {
        p.moveTo(22, 88);
        p.lineTo(98, 44);
        p.quadraticCurveTo(110, 56, 108, 74);
        p.lineTo(108, 92);
        p.lineTo(26, 108);
        p.closePath();
      }, c, { gloss: 1, band: 4, box: [22, 44, 110, 108] });
      shade(g, (p) => {
        p.moveTo(22, 88);
        p.lineTo(98, 44);
        p.quadraticCurveTo(110, 56, 108, 74);
        p.lineTo(26, 92);
        p.closePath();
      }, light(c, 0.25), { band: 1, box: [22, 44, 110, 92] });
      for (const [x, y, rr] of [[52, 98, 4], [74, 96, 3], [92, 92, 2.6], [40, 100, 2]] as [number, number, number][]) shade(g, circle(x, y, rr), dark(c, 0.25), { band: 0 });
      shade(g, (p) => {
        p.moveTo(98, 44);
        p.quadraticCurveTo(110, 56, 108, 74);
        p.lineTo(108, 92);
        p.lineTo(104, 92);
        p.lineTo(104, 70);
        p.quadraticCurveTo(104, 56, 96, 46);
        p.closePath();
      }, '#c8902a', { band: 1, box: [96, 44, 110, 92] });
      return;
    }
    case 'loaf': {
      const c = f.color ?? '#c8843a';
      shade(g, blob([[18, 86], [26, 58], [52, 42], [82, 42], [108, 56], [112, 84], [96, 104], [32, 104]]), c, { gloss: 1, band: 6, rim: true, box: [18, 42, 112, 104] });
      for (let i = 0; i < 3; i++) {
        line(g, light(c, 0.45), 4, (p) => {
          p.moveTo(36 + i * 22, 62);
          p.quadraticCurveTo(46 + i * 22, 52, 54 + i * 22, 50);
        }, 0.9);
      }
      if (f.accent) for (let i = 0; i < 12; i++) shade(g, circle(30 + r() * 70, 54 + r() * 34, 1.6), f.accent, { band: 0 });
      return;
    }
    case 'dates': {
      line(g, '#8a6a3a', 2.4, (p) => {
        p.moveTo(64, 14);
        p.lineTo(64, 40);
        for (let i = 0; i < 5; i++) {
          p.moveTo(64, 30);
          p.quadraticCurveTo(40 + i * 12, 40, 34 + i * 15, 60);
        }
      }, 1);
      for (let i = 0; i < 12; i++) {
        const x = 32 + (i % 5) * 16 + r() * 4, y = 62 + Math.floor(i / 5) * 18 + r() * 4;
        shade(g, ellipse(x, y, 7, 10, (r() - 0.5) * 0.6), '#8a3a1a', { gloss: 2, band: 2, box: [x - 7, y - 10, x + 7, y + 10] });
      }
      return;
    }
    case 'cake': {
      const c = '#c88a4a';
      shade(g, (p) => {
        p.moveTo(18, 74);
        p.lineTo(92, 46);
        p.lineTo(112, 62);
        p.lineTo(112, 96);
        p.lineTo(38, 112);
        p.lineTo(18, 98);
        p.closePath();
      }, c, { band: 4, gloss: 1, box: [18, 46, 112, 112] });
      shade(g, (p) => {
        p.moveTo(18, 74);
        p.lineTo(92, 46);
        p.lineTo(112, 62);
        p.lineTo(38, 88);
        p.closePath();
      }, '#f0c060', { band: 1, gloss: 2, box: [18, 46, 112, 88] });
      for (let i = 0; i < 10; i++) shade(g, ellipse(36 + r() * 60, 64 + r() * 14, 3, 2, r()), i % 2 ? '#7ac04a' : '#8a3a1a', { band: 0 });
      return;
    }
    case 'grilledFish': {
      shade(g, (p) => p.roundRect(14, 82, 100, 22, 6), '#8a5a32', { band: 3, box: [14, 82, 114, 104] });
      g.save();
      g.translate(0, -10);
      paintFish(g, { back: '#c0702a', belly: '#e8b060', fin: '#8a4a1a', depth: 0.38 }, seed + 'f');
      g.restore();
      line(g, '#3a1a0a', 3, (p) => {
        for (let i = 0; i < 4; i++) {
          p.moveTo(40 + i * 12, 40 + i * 4);
          p.lineTo(52 + i * 12, 64 + i * 4);
        }
      }, 0.7);
      shade(g, leaf(86, 30, 104, 22, 5), '#5aa03a', { band: 1, box: [86, 18, 104, 34] });
      return;
    }
    case 'stew':
    case 'feast': {
      const bowl = f.color ?? '#8a5a32';
      if (f.kind === 'feast') {
        shade(g, ellipse(64, 92, 56, 18), '#c8a070', { band: 3, gloss: 1, box: [8, 74, 120, 110] });
        // A roast with a bone, an apple and bread.
        shade(g, blob([[30, 82], [36, 56], [62, 46], [90, 54], [98, 78], [80, 94], [44, 96]]), '#9a4a1e', { gloss: 2, band: 5, rim: true, box: [30, 46, 98, 96] });
        shade(g, (p) => p.roundRect(90, 46, 26, 8, 4), '#f4ecd8', { band: 1.5, box: [90, 46, 116, 54] });
        shade(g, circle(116, 46, 5), '#f4ecd8', { band: 1 });
        shade(g, circle(26, 94, 10), '#d8322a', { gloss: 2, band: 2, box: [16, 84, 36, 104] });
        shade(g, ellipse(100, 92, 14, 8, -0.3), '#c8843a', { gloss: 1, band: 2, box: [86, 84, 114, 100] });
        return;
      }
      shade(g, (p) => {
        p.moveTo(16, 62);
        p.lineTo(112, 62);
        p.bezierCurveTo(110, 96, 88, 110, 64, 110);
        p.bezierCurveTo(40, 110, 18, 96, 16, 62);
        p.closePath();
      }, bowl, { gloss: 1, band: 5, rim: true, box: [16, 62, 112, 110] });
      shade(g, ellipse(64, 62, 48, 12), f.accent ?? '#a85a2a', { band: 0, box: [16, 50, 112, 74] });
      for (let i = 0; i < 10; i++) {
        const x = 26 + r() * 76, y = 56 + r() * 10;
        shade(g, (p) => p.roundRect(x - 4, y - 3, 8, 6, 2), ['#f08a2a', '#7ab84a', '#c88a5a', '#e8d8a8'][i % 4], { band: 1, box: [x - 4, y - 3, x + 4, y + 3] });
      }
      shade(g, (p) => p.roundRect(84, 20, 8, 46, 4), '#c8a070', { band: 1.5, box: [84, 20, 92, 66] });
      for (let i = 0; i < 3; i++) {
        line(g, '#ffffff', 3.5 - i, (p) => {
          const x = 46 + i * 12;
          p.moveTo(x, 48);
          p.bezierCurveTo(x - 8, 38, x + 8, 30, x, 18);
        }, 0.55);
      }
      return;
    }
    case 'ration':
    case 'biscuit':
    case 'brick': {
      // A cloth bundle tied with string, with the meal peeking out.
      const cloth = f.color ?? '#c8b48a';
      if (f.kind !== 'brick') {
        shade(g, circle(46, 52, 14), f.kind === 'biscuit' ? '#d8b878' : '#f2c23a', { band: 2, box: [32, 38, 60, 66] });
        shade(g, ellipse(80, 50, 16, 11, -0.4), f.kind === 'biscuit' ? '#7a8aa8' : '#c8843a', { band: 2, gloss: 1, box: [64, 39, 96, 61] });
      }
      shade(g, (p) => {
        p.moveTo(18, 60);
        p.quadraticCurveTo(64, 50, 110, 60);
        p.lineTo(104, 106);
        p.quadraticCurveTo(64, 114, 24, 106);
        p.closePath();
      }, f.kind === 'brick' ? '#7a5a3a' : cloth, { band: 4, gloss: 1, rim: true, box: [18, 52, 110, 112] });
      line(g, '#6a4a2a', 3, (p) => {
        p.moveTo(64, 56);
        p.lineTo(64, 110);
        p.moveTo(20, 82);
        p.quadraticCurveTo(64, 88, 108, 82);
      }, 0.9);
      if (f.kind === 'brick') {
        shade(g, (p) => p.roundRect(36, 30, 56, 32, 4), '#9a5a3a', { band: 3, gloss: 1, box: [36, 30, 92, 62] });
        line(g, '#5a2a1a', 1.2, (p) => {
          for (let i = 0; i < 4; i++) {
            p.moveTo(40, 36 + i * 7);
            p.lineTo(88, 36 + i * 7);
          }
        }, 0.6);
      }
      return;
    }
    case 'meat': {
      shade(g, blob([[24, 70], [34, 42], [66, 30], [100, 40], [108, 70], [90, 98], [52, 104], [28, 92]]), '#c03a3a', { gloss: 2, band: 5, rim: true, box: [24, 30, 108, 104] });
      line(g, '#f4d8d0', 3, (p) => {
        p.moveTo(40, 52);
        p.bezierCurveTo(60, 60, 70, 46, 92, 60);
        p.moveTo(44, 78);
        p.bezierCurveTo(64, 86, 76, 70, 96, 80);
      }, 0.85);
      shade(g, circle(58, 68, 9), '#f4ecd8', { band: 1.5, box: [49, 59, 67, 77] });
      return;
    }
    case 'seeds': {
      const c = '#c8a878';
      shade(g, (p) => {
        p.moveTo(34, 44);
        p.quadraticCurveTo(64, 36, 94, 44);
        p.bezierCurveTo(108, 70, 104, 108, 64, 112);
        p.bezierCurveTo(24, 108, 20, 70, 34, 44);
        p.closePath();
      }, c, { band: 5, gloss: 1, rim: true, box: [22, 36, 106, 112] });
      line(g, '#6a4a2a', 3, (p) => {
        p.moveTo(36, 50);
        p.quadraticCurveTo(64, 58, 92, 50);
      }, 1);
      // Seeds spilling at the mouth and a sprout.
      for (let i = 0; i < 8; i++) shade(g, ellipse(44 + r() * 40, 40 + r() * 8, 3, 2, r() * 3), '#e8c878', { band: 0.6 });
      line(g, '#4a9a2a', 2.4, (p) => {
        p.moveTo(64, 40);
        p.quadraticCurveTo(62, 26, 66, 16);
      }, 1);
      shade(g, leaf(66, 22, 82, 12, 5), '#5ab03a', { band: 1, box: [66, 8, 82, 26] });
      shade(g, leaf(64, 26, 50, 14, 5), '#5ab03a', { band: 1, box: [50, 10, 64, 26] });
      // A painted tag with the crop.
      shade(g, (p) => p.roundRect(46, 74, 36, 26, 4), '#efe0b8', { band: 2, box: [46, 74, 82, 100] });
      shade(g, circle(64, 87, 8), f.crop ?? '#e2b84a', { gloss: 1, band: 1.2, box: [56, 79, 72, 95] });
      return;
    }
    case 'water': {
      shade(g, (p) => {
        p.moveTo(54, 16);
        p.lineTo(74, 16);
        p.lineTo(74, 34);
        p.bezierCurveTo(98, 40, 100, 70, 96, 96);
        p.quadraticCurveTo(94, 114, 64, 114);
        p.quadraticCurveTo(34, 114, 32, 96);
        p.bezierCurveTo(28, 70, 30, 40, 54, 34);
        p.closePath();
      }, f.color ?? '#a8c8e0', { gloss: 2, band: 4, rim: true, box: [30, 16, 98, 114] });
      shade(g, (p) => p.roundRect(52, 8, 24, 12, 3), '#b07a46', { band: 2, box: [52, 8, 76, 20] });
      if (f.accent) glow(g, 64, 80, 30, f.accent, 0.5);
      sparkle(g, 48, 56, 6);
      return;
    }
  }
}

export const FOODS: Record<string, FoodSpec> = {
  apple: { kind: 'apple' },
  pear: { kind: 'pear' },
  carrot: { kind: 'carrot' },
  cabbage: { kind: 'cabbage' },
  pumpkin: { kind: 'pumpkin' },
  egg: { kind: 'egg' },
  milk: { kind: 'milk' },
  roadCheese: { kind: 'cheese' },
  travellersBread: { kind: 'loaf', color: '#b8803a', accent: '#e8d8a8' },
  battleBread: { kind: 'loaf', color: '#d0943a', accent: '#f4f0e0' },
  dates: { kind: 'dates' },
  dateCake: { kind: 'cake' },
  grilledFish: { kind: 'grilledFish' },
  heartyStew: { kind: 'stew', accent: '#a85a2a' },
  warmStew: { kind: 'stew', color: '#5a3a2a', accent: '#c8401a' },
  huntersFeast: { kind: 'feast' },
  trailRation: { kind: 'ration' },
  sailorsRation: { kind: 'biscuit', color: '#a8b4c0' },
  ironRation: { kind: 'brick' },
  rawMeat: { kind: 'meat' },
  wheatSeed: { kind: 'seeds', crop: '#e2b84a' },
  carrotSeed: { kind: 'seeds', crop: '#f07a1e' },
  cabbageSeed: { kind: 'seeds', crop: '#7ab84a' },
  pumpkinSeed: { kind: 'seeds', crop: '#f08a1a' },
  springWater: { kind: 'water', color: '#a8d0f0' },
  oasisWater: { kind: 'water', color: '#7ad8e0', accent: '#5af0ff' },
  grainSpirit: { kind: 'water', color: '#e8e0c8' },
  pressedOil: { kind: 'water', color: '#e8c24a' },
};

export { sparkle };
