import { shade, line, glow, sparkle, light, dark, rgba, ellipse, circle, blob, rng, leaf, type G, type PathFn } from './kit';
import { drawGlyph } from './glyphs';

// Jewellery, charms, badges, belts, crowns, horns, keys, flags and the odd
// quest object: each a small piece of craft in its own metal and stone.

export const METAL: Record<string, string> = {
  gold: '#e0ac34', silver: '#c4ccd6', iron: '#7c8088', bronze: '#b8783a', copper: '#c8743a', brass: '#c8a040', pewter: '#9aa0a4', blackIron: '#3a3a44', greenBronze: '#6a9a7a', bone: '#e8dcc0',
};

export interface TrinketSpec {
  kind: 'ring' | 'amulet' | 'charm' | 'badge' | 'belt' | 'ribbon' | 'crown' | 'horn' | 'key' | 'flag' | 'compass' | 'lantern' | 'box' | 'orb' | 'crystal' | 'heart' | 'knot' | 'feather' | 'jaw' | 'plugs' | 'gloves' | 'sickle' | 'rod' | 'sash' | 'bandolier' | 'cloak';
  metal?: string;
  /** gem / stone / cloth / flag colour */
  color?: string;
  /** second colour (flag stripe, cord, ribbon) */
  accent?: string;
  /** emblem: on a badge, a signet, a key's bow, a flag */
  glyph?: string;
  /** charm object hanging from the cord */
  hang?: 'tusk' | 'fang' | 'stone' | 'feather' | 'bone' | 'disc' | 'scarab' | 'heart' | 'wheel';
  glow?: string;
  /** shape variant (crown points, pendant shape, key bow) */
  shape?: string;
}

export function paintTrinket(g: G, t: TrinketSpec, seed: string) {
  const r = rng(seed);
  if (t.glow) glow(g, 64, 64, 60, t.glow, 0.6);
  const m = METAL[t.metal ?? 'gold'] ?? t.metal ?? METAL.gold;
  switch (t.kind) {
    case 'ring': return ring(g, t, m);
    case 'amulet': return amulet(g, t, m, r);
    case 'charm': return charm(g, t, m, r);
    case 'badge': return badge(g, t, m);
    case 'belt':
    case 'bandolier':
    case 'sash': return belt(g, t, m);
    case 'crown': return crown(g, t, m);
    case 'horn': return horn(g, t, m);
    case 'key': return key(g, t, m, r);
    case 'flag': return flag(g, t);
    case 'compass': return compass(g, m);
    case 'lantern': return lantern(g, m);
    case 'box': return box(g, m);
    case 'orb': return orb(g, t);
    case 'crystal': return crystal(g, t, r);
    case 'heart': return heart(g, t, m);
    case 'knot': return knot(g, t);
    case 'feather': return feather(g, t, m);
    case 'jaw': return jaw(g);
    case 'plugs': return plugs(g);
    case 'gloves': return gloves(g, t);
    case 'sickle': return sickle(g, m);
    case 'rod': return rod(g);
    case 'cloak': return cloak(g, t);
    case 'ribbon': return ribbon(g, t);
  }
}

function gem(g: G, x: number, y: number, rr: number, c: string, cut: 'round' | 'oval' | 'drop' = 'round') {
  const path: PathFn = cut === 'drop'
    ? (q) => {
      q.moveTo(x, y - rr * 1.3);
      q.bezierCurveTo(x + rr * 1.1, y - rr * 0.2, x + rr, y + rr, x, y + rr);
      q.bezierCurveTo(x - rr, y + rr, x - rr * 1.1, y - rr * 0.2, x, y - rr * 1.3);
    }
    : cut === 'oval' ? ellipse(x, y, rr * 0.8, rr) : circle(x, y, rr);
  shade(g, path, c, { gloss: 2, band: rr * 0.25, hi: 0.45, lo: 0.5, box: [x - rr, y - rr, x + rr, y + rr], glossAt: [x - rr * 0.35, y - rr * 0.4, rr * 0.55] });
  // Facets.
  line(g, light(c, 0.5), 0.8, (q) => {
    q.moveTo(x - rr * 0.5, y - rr * 0.1);
    q.lineTo(x, y - rr * 0.55);
    q.lineTo(x + rr * 0.5, y - rr * 0.1);
  }, 0.6);
  sparkle(g, x + rr * 0.45, y - rr * 0.55, rr * 0.45);
}

function ring(g: G, t: TrinketSpec, m: string) {
  // A band in three-quarter view with a setting on top.
  shade(g, (q) => {
    q.ellipse(64, 78, 36, 26, 0, 0, Math.PI * 2);
    q.ellipse(64, 80, 26, 17, 0, 0, Math.PI * 2);
  }, m, { gloss: 2, band: 3, rim: true, box: [28, 52, 100, 104] });
  // The band's inner face is shaded.
  g.save();
  g.beginPath();
  g.ellipse(64, 80, 26, 17, 0, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = rgba(dark(m, 0.5), 0.0);
  g.fillRect(0, 0, 128, 128);
  g.restore();
  if (t.glyph) {
    // A signet face.
    shade(g, ellipse(64, 50, 20, 15), m, { gloss: 2, band: 2.5, rim: true, box: [44, 35, 84, 65] });
    shade(g, ellipse(64, 50, 15, 11), t.color ?? dark(m, 0.15), { band: 1.5, box: [49, 39, 79, 61] });
    drawGlyph(g, t.glyph, 64, 50, 15, dark(t.color ?? m, 0.55));
  } else if (t.color) {
    // Claws around a stone.
    for (const dx of [-11, 11]) shade(g, (q) => q.roundRect(64 + dx - 3, 44, 6, 18, 3), m, { band: 1.2, gloss: 1 });
    gem(g, 64, 48, 13, t.color);
  }
  if (t.glow) sparkle(g, 92, 40, 6);
}

function chainTo(g: G, m: string, x: number, y: number) {
  // Two curves of chain from the top corners down to the pendant.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const cx = 64 + s * (40 - 40 * u * 0.85) * Math.sin(u * Math.PI * 0.9 + 0.3);
      const cy = 10 + (y - 22) * u;
      const lx = cx + (x - 64) * u * u;
      shade(g, ellipse(lx, cy, 3.2, 2.2, s * 0.9 + u), m, { band: 0.6, gloss: 1, box: [lx - 3, cy - 3, lx + 3, cy + 3] });
    }
  }
}

function amulet(g: G, t: TrinketSpec, m: string, r: () => number) {
  chainTo(g, m, 64, 74);
  const shape = t.shape ?? 'round';
  const c = t.color ?? '#c0203a';
  if (shape === 'scarab') {
    shade(g, ellipse(64, 84, 22, 27), c, { gloss: 2, band: 3, rim: true, box: [42, 57, 86, 111] });
    line(g, dark(c, 0.45), 1.6, (q) => {
      q.moveTo(64, 64);
      q.lineTo(64, 110);
      q.moveTo(44, 78);
      q.quadraticCurveTo(64, 70, 84, 78);
    }, 0.8);
    for (const s of [-1, 1]) {
      shade(g, ellipse(64 + s * 26, 80, 10, 5, s * 0.5), m, { gloss: 1, band: 1 });
      shade(g, ellipse(64 + s * 24, 98, 8, 4, -s * 0.5), m, { gloss: 1, band: 1 });
    }
    shade(g, ellipse(64, 59, 9, 6), m, { gloss: 2, band: 1 });
    return;
  }
  if (shape === 'wheel') {
    shade(g, circle(64, 84, 24), m, { gloss: 2, band: 3, rim: true, box: [40, 60, 88, 108] });
    drawGlyph(g, 'wheel', 64, 84, 38, dark(m, 0.55), 2.6);
    if (t.glyph === 'bent') line(g, '#8a1a2a', 2, (q) => {
      q.moveTo(50, 70);
      q.lineTo(78, 98);
    }, 0.8);
    return;
  }
  if (shape === 'heartwood') {
    shade(g, circle(64, 84, 24), m, { gloss: 2, band: 3, rim: true, box: [40, 60, 88, 108] });
    shade(g, blob([[52, 74], [64, 66], [78, 74], [80, 92], [64, 102], [48, 92]]), '#6a5030', { gloss: 1, band: 2, box: [48, 66, 80, 102] });
    line(g, '#7aff6a', 1.6, (q) => {
      q.moveTo(56, 78);
      q.quadraticCurveTo(66, 86, 72, 96);
      q.moveTo(70, 72);
      q.quadraticCurveTo(64, 82, 58, 94);
    }, 0.9);
    return;
  }
  if (shape === 'seaglass') {
    shade(g, (q) => q.roundRect(46, 66, 36, 44, 12), m, { gloss: 2, band: 2, box: [46, 66, 82, 110] });
    gem(g, 64, 88, 15, c, 'oval');
    return;
  }
  // A metal frame and a stone.
  shade(g, shape === 'drop' ? (q) => {
    q.moveTo(64, 62);
    q.bezierCurveTo(88, 80, 86, 112, 64, 112);
    q.bezierCurveTo(42, 112, 40, 80, 64, 62);
  } : circle(64, 88, 22), m, { gloss: 2, band: 3, rim: true, box: [42, 62, 86, 112] });
  gem(g, 64, shape === 'drop' ? 92 : 88, 14, c, shape === 'drop' ? 'drop' : 'round');
  void r;
}

function charm(g: G, t: TrinketSpec, m: string, r: () => number) {
  const cord = t.accent ?? '#8a5a3a';
  line(g, cord, 3, (q) => {
    q.moveTo(26, 14);
    q.bezierCurveTo(30, 52, 52, 60, 64, 58);
    q.bezierCurveTo(76, 60, 98, 52, 102, 14);
  }, 1);
  // A knot of the cord.
  shade(g, circle(64, 58, 5), cord, { band: 1 });
  const c = t.color ?? '#f0e6cc';
  switch (t.hang ?? 'tusk') {
    case 'tusk':
    case 'fang':
      shade(g, (q) => {
        q.moveTo(54, 62);
        q.lineTo(74, 62);
        q.bezierCurveTo(78, 84, 70, 104, 50, 116);
        q.bezierCurveTo(60, 98, 60, 80, 54, 62);
        q.closePath();
      }, c, { gloss: 2, band: 3, rim: true, box: [50, 62, 78, 116] });
      if (m !== METAL.gold || t.metal) line(g, m, 3, (q) => {
        q.moveTo(54, 68);
        q.lineTo(74, 66);
        q.moveTo(54, 73);
        q.lineTo(74, 71);
      }, 1);
      break;
    case 'stone':
      shade(g, ellipse(58, 84, 16, 13, 0.3), c, { gloss: 2, band: 3, box: [42, 71, 74, 97] });
      line(g, '#8a7a6a', 2, (q) => {
        q.moveTo(70, 66);
        q.quadraticCurveTo(84, 90, 92, 110);
      }, 1);
      feather(g, { kind: 'feather', color: '#e8e8ec' }, METAL.gold, 0.55, 82, 92);
      break;
    case 'bone':
      shade(g, (q) => q.roundRect(52, 64, 24, 30, 9), c, { gloss: 1, band: 3, rim: true, box: [52, 64, 76, 94] });
      for (const [x, y] of [[52, 66], [76, 66], [52, 92], [76, 92]] as [number, number][]) shade(g, circle(x, y, 6), c, { band: 1.5, gloss: 1 });
      line(g, '#c0302a', 2.4, (q) => {
        q.moveTo(64, 58);
        q.lineTo(64, 70);
      }, 1);
      break;
    case 'feather':
      feather(g, { kind: 'feather', color: c }, m, 0.8, 64, 84);
      break;
    case 'disc':
    case 'wheel':
      shade(g, circle(64, 86, 22), m, { gloss: 2, band: 3, rim: true, box: [42, 64, 86, 108] });
      drawGlyph(g, t.glyph ?? 'wheel', 64, 86, 32, dark(m, 0.55), 2.4);
      break;
    case 'scarab':
      amulet(g, { ...t, shape: 'scarab' }, m, r);
      break;
    case 'heart':
      shade(g, blob([[64, 72], [78, 64], [88, 76], [64, 108], [40, 76], [50, 64]]), c, { gloss: 2, band: 3, box: [40, 64, 88, 108] });
      break;
  }
}

function badge(g: G, t: TrinketSpec, m: string) {
  const c = t.color;
  const path: PathFn = t.shape === 'round' ? circle(64, 66, 38) : (q) => {
    q.moveTo(28, 26);
    q.lineTo(100, 26);
    q.lineTo(100, 66);
    q.bezierCurveTo(100, 92, 80, 104, 64, 112);
    q.bezierCurveTo(48, 104, 28, 92, 28, 66);
    q.closePath();
  };
  shade(g, path, m, { gloss: 2, band: 4, rim: true, box: [26, 26, 102, 112] });
  if (c) {
    g.save();
    g.translate(64, 66);
    g.scale(0.78, 0.78);
    g.translate(-64, -66);
    shade(g, path, c, { gloss: 1, band: 2, box: [26, 26, 102, 112] });
    g.restore();
  }
  if (t.glyph) drawGlyph(g, t.glyph, 64, 66, 38, c ? dark(m, 0.1) : dark(m, 0.55), 2.6);
  // A cord loop on top.
  line(g, t.accent ?? '#8a5a3a', 3, (q) => {
    q.moveTo(56, 24);
    q.quadraticCurveTo(64, 6, 72, 24);
  }, 1);
}

function belt(g: G, t: TrinketSpec, m: string) {
  const c = t.color ?? '#6a4428';
  if (t.kind === 'sash') {
    shade(g, (q) => {
      q.moveTo(20, 30);
      q.bezierCurveTo(50, 60, 80, 70, 110, 70);
      q.lineTo(108, 92);
      q.bezierCurveTo(78, 92, 46, 82, 16, 52);
      q.closePath();
    }, c, { gloss: 1, band: 3, rim: true, box: [16, 30, 110, 92] });
    shade(g, (q) => {
      q.moveTo(70, 80);
      q.lineTo(60, 116);
      q.lineTo(72, 108);
      q.lineTo(82, 114);
      q.lineTo(84, 80);
      q.closePath();
    }, dark(c, 0.1), { band: 2, box: [60, 80, 84, 116] });
    shade(g, (q) => q.roundRect(62, 64, 24, 22, 4), m, { gloss: 2, band: 2, rim: true });
    return;
  }
  // A coiled belt: an outer loop with the buckle in front.
  shade(g, (q) => {
    q.ellipse(64, 70, 46, 30, 0, 0, Math.PI * 2);
    q.ellipse(64, 70, 34, 20, 0, 0, Math.PI * 2);
  }, c, { gloss: 1, band: 3, rim: true, box: [18, 40, 110, 100] });
  line(g, light(c, 0.3), 1, (q) => {
    q.ellipse(64, 70, 43, 27, 0, 0, Math.PI * 2);
    q.moveTo(101, 70);
    q.ellipse(64, 70, 37, 23, 0, 0, Math.PI * 2);
  }, 0.5);
  if (t.kind === 'bandolier') {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7;
      const x = 64 + Math.cos(a) * 40, y = 70 + Math.sin(a) * 25;
      shade(g, (q) => q.roundRect(x - 2.5, y - 12, 5, 16, 2), '#8a8a90', { band: 1, gloss: 1 });
      shade(g, (q) => {
        q.moveTo(x - 2.5, y - 12);
        q.lineTo(x, y - 18);
        q.lineTo(x + 2.5, y - 12);
      }, '#c8c8d0', { band: 0 });
    }
  }
  // Buckle.
  shade(g, (q) => {
    q.roundRect(50, 86, 28, 22, 4);
    q.roundRect(55, 91, 18, 12, 2);
  }, m, { gloss: 2, band: 2, rim: true, box: [50, 86, 78, 108] });
  line(g, dark(m, 0.4), 2.2, (q) => {
    q.moveTo(64, 91);
    q.lineTo(64, 103);
  }, 1);
  if (t.accent) {
    // A pouch on the belt.
    shade(g, (q) => q.roundRect(80, 72, 26, 28, 6), t.accent!, { gloss: 1, band: 3, rim: true, box: [80, 72, 106, 100] });
    shade(g, (q) => {
      q.moveTo(80, 76);
      q.quadraticCurveTo(93, 92, 106, 76);
      q.lineTo(106, 72);
      q.lineTo(80, 72);
      q.closePath();
    }, dark(t.accent!, 0.15), { band: 1, box: [80, 72, 106, 88] });
    shade(g, circle(93, 84, 3), m, { gloss: 2, band: 0 });
  }
}

function crown(g: G, t: TrinketSpec, m: string) {
  const n = Number(t.shape ?? 5);
  const c = t.color;
  shade(g, (q) => {
    q.moveTo(22, 96);
    q.lineTo(22, 64);
    for (let i = 0; i <= n * 2; i++) {
      const x = 22 + (i / (n * 2)) * 84;
      q.lineTo(x, i % 2 ? 66 : 24 + (Math.abs(i - n) % 3) * 4);
    }
    q.lineTo(106, 96);
    q.quadraticCurveTo(64, 104, 22, 96);
    q.closePath();
  }, m, { gloss: 2, band: 4, rim: true, box: [22, 24, 106, 104] });
  shade(g, (q) => {
    q.moveTo(22, 82);
    q.quadraticCurveTo(64, 90, 106, 82);
    q.lineTo(106, 96);
    q.quadraticCurveTo(64, 104, 22, 96);
    q.closePath();
  }, dark(m, 0.12), { band: 1.5, box: [22, 82, 106, 104] });
  if (c) for (let i = 0; i < 3; i++) gem(g, 40 + i * 24, 90, i === 1 ? 7 : 5, c);
  for (let i = 0; i <= n; i++) shade(g, circle(22 + (i / n) * 84, 24 + (Math.abs(i * 2 - n) % 3) * 4, 3.4), light(m, 0.2), { gloss: 2, band: 0 });
}

function horn(g: G, t: TrinketSpec, m: string) {
  const c = t.color ?? '#e8d8b0';
  shade(g, (q) => {
    q.moveTo(14, 96);
    q.bezierCurveTo(30, 40, 80, 28, 112, 40);
    q.lineTo(108, 58);
    q.bezierCurveTo(80, 50, 46, 64, 32, 108);
    q.closePath();
  }, c, { gloss: 2, band: 4, rim: true, box: [14, 28, 112, 108] });
  shade(g, ellipse(110, 49, 6, 10, 0.25), dark(c, 0.4), { band: 1 });
  // Bindings.
  for (const u of [0.35, 0.62]) {
    const x = 14 + u * 98, y = 96 - u * 64;
    shade(g, (q) => q.roundRect(x - 4, y - 16, 9, 24, 2), t.accent ?? m, { gloss: 1, band: 1.5, box: [x - 4, y - 16, x + 5, y + 8] });
  }
  line(g, t.accent ?? '#8a5a3a', 2.4, (q) => {
    q.moveTo(48, 70);
    q.quadraticCurveTo(64, 108, 92, 52);
  }, 0.9);
}

function key(g: G, t: TrinketSpec, m: string, r: () => number) {
  g.save();
  g.translate(64, 64);
  g.rotate(-Math.PI / 4);
  // Shaft and bit.
  shade(g, (q) => q.roundRect(-6, -10, 12, 62, 4), m, { gloss: 2, band: 2, rim: true, box: [-6, -10, 6, 52] });
  shade(g, (q) => {
    q.moveTo(6, 30);
    q.lineTo(22, 30);
    q.lineTo(22, 38);
    q.lineTo(14, 38);
    q.lineTo(14, 44);
    q.lineTo(22, 44);
    q.lineTo(22, 52);
    q.lineTo(6, 52);
    q.closePath();
  }, m, { gloss: 1, band: 1.5, box: [6, 30, 22, 52] });
  // Bow: a ring, or a shaped plate with an emblem.
  const shape = t.shape ?? 'ring';
  if (shape === 'ring') {
    shade(g, (q) => {
      q.arc(0, -26, 20, 0, Math.PI * 2);
      q.arc(0, -26, 11, 0, Math.PI * 2);
    }, m, { gloss: 2, band: 2.5, rim: true, box: [-20, -46, 20, -6] });
  } else {
    shade(g, shape === 'ornate' ? (q) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, rr = i % 2 ? 16 : 22;
        q.lineTo(Math.cos(a) * rr, -28 + Math.sin(a) * rr);
      }
      q.closePath();
    } : circle(0, -28, 21), m, { gloss: 2, band: 2.5, rim: true, box: [-22, -50, 22, -6] });
    if (t.glyph) drawGlyph(g, t.glyph, 0, -28, 22, dark(m, 0.55), 2.4);
  }
  // Collar between bow and shaft.
  shade(g, (q) => q.roundRect(-9, -8, 18, 6, 2), dark(m, 0.1), { gloss: 1, band: 1 });
  if (t.color) {
    // A ribbon (Posy's key) or crust of barnacles (the tide key).
    if (t.shape === 'barnacle') {
      for (let i = 0; i < 6; i++) shade(g, circle(-4 + r() * 10, 0 + r() * 40, 2.4 + r() * 2), t.color, { band: 0.6 });
    } else {
      line(g, t.color, 4, (q) => {
        q.moveTo(0, -48);
        q.bezierCurveTo(-20, -60, -28, -40, -14, -36);
        q.moveTo(0, -48);
        q.bezierCurveTo(20, -64, 28, -42, 12, -38);
      }, 1);
    }
  }
  g.restore();
}

function flag(g: G, t: TrinketSpec) {
  const c = t.color ?? '#1a1a22', a = t.accent ?? '#f4f4f4';
  shade(g, (q) => q.roundRect(20, 10, 7, 110, 3), '#6a4a30', { band: 2, gloss: 1, box: [20, 10, 27, 120] });
  shade(g, circle(23.5, 10, 5), METAL.gold, { gloss: 2, band: 0 });
  const cloth: PathFn = t.shape === 'pennant'
    ? (q) => {
      q.moveTo(27, 18);
      q.bezierCurveTo(60, 14, 80, 30, 112, 40);
      q.bezierCurveTo(80, 50, 60, 62, 27, 66);
      q.closePath();
    }
    : (q) => {
      q.moveTo(27, 16);
      q.bezierCurveTo(56, 10, 80, 22, 110, 16);
      q.lineTo(110, 68);
      q.lineTo(98, 58);
      q.lineTo(88, 72);
      q.bezierCurveTo(60, 76, 50, 66, 27, 72);
      q.closePath();
    };
  shade(g, cloth, c, { gloss: 1, band: 3, rim: true, box: [27, 10, 112, 76] });
  g.save();
  g.beginPath();
  cloth(g);
  g.clip();
  if (t.glyph) drawGlyph(g, t.glyph, 66, 42, 30, a, 2.6);
  else {
    g.fillStyle = a;
    g.fillRect(20, 36, 100, 10);
  }
  g.restore();
}

function compass(g: G, m: string) {
  shade(g, circle(64, 68, 44), m, { gloss: 2, band: 4, rim: true, box: [20, 24, 108, 112] });
  shade(g, circle(64, 68, 36), '#efe2c0', { band: 2, box: [28, 32, 100, 104] });
  line(g, '#8a6a40', 1, (q) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      q.moveTo(64 + Math.cos(a) * 30, 68 + Math.sin(a) * 30);
      q.lineTo(64 + Math.cos(a) * (i % 4 ? 33 : 35), 68 + Math.sin(a) * (i % 4 ? 33 : 35));
    }
  }, 0.9);
  shade(g, (q) => {
    q.moveTo(64, 38);
    q.lineTo(70, 68);
    q.lineTo(58, 68);
    q.closePath();
  }, '#c0302a', { band: 1, gloss: 1, box: [58, 38, 70, 68] });
  shade(g, (q) => {
    q.moveTo(64, 98);
    q.lineTo(70, 68);
    q.lineTo(58, 68);
    q.closePath();
  }, '#3a4a5a', { band: 1, box: [58, 68, 70, 98] });
  shade(g, circle(64, 68, 4), m, { gloss: 2, band: 0 });
  shade(g, (q) => q.roundRect(56, 16, 16, 10, 3), m, { gloss: 2, band: 1 });
  // Green with the mere: patches of verdigris.
  for (const [x, y] of [[34, 86], [92, 44], [88, 96]] as [number, number][]) {
    g.fillStyle = 'rgba(80,150,120,0.55)';
    g.beginPath();
    g.ellipse(x, y, 7, 4, 0.6, 0, Math.PI * 2);
    g.fill();
  }
  // Glass.
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.ellipse(52, 52, 14, 8, -0.6, 0, Math.PI * 2);
  g.fill();
}

function lantern(g: G, m: string) {
  glow(g, 64, 72, 40, '#ffb84a', 0.75);
  line(g, dark(m, 0.3), 3.4, (q) => {
    q.moveTo(50, 26);
    q.quadraticCurveTo(64, 2, 78, 26);
  }, 1);
  shade(g, (q) => {
    q.moveTo(46, 26);
    q.lineTo(82, 26);
    q.lineTo(88, 36);
    q.lineTo(40, 36);
    q.closePath();
  }, m, { gloss: 2, band: 1.5, box: [40, 26, 88, 36] });
  shade(g, (q) => q.roundRect(42, 36, 44, 58, 4), '#ffd88a', { gloss: 2, band: 2, box: [42, 36, 86, 94] });
  glow(g, 64, 66, 18, '#fff0b0', 1);
  shade(g, (q) => {
    q.moveTo(64, 54);
    q.bezierCurveTo(72, 64, 70, 76, 64, 78);
    q.bezierCurveTo(58, 76, 56, 64, 64, 54);
  }, '#ff9a2a', { gloss: 2, band: 0 });
  for (const x of [42, 58, 70, 86]) shade(g, (q) => q.roundRect(x - 2.5, 36, 5, 58, 1.5), m, { gloss: 1, band: 1 });
  shade(g, (q) => q.roundRect(36, 92, 56, 12, 3), m, { gloss: 2, band: 2, rim: true, box: [36, 92, 92, 104] });
}

function box(g: G, m: string) {
  const wood = '#6a4a2a';
  shade(g, (q) => q.roundRect(20, 54, 88, 54, 4), wood, { band: 4, gloss: 1, box: [20, 54, 108, 108] });
  shade(g, (q) => {
    q.moveTo(20, 56);
    q.quadraticCurveTo(22, 30, 40, 28);
    q.lineTo(88, 28);
    q.quadraticCurveTo(106, 30, 108, 56);
    q.closePath();
  }, light(wood, 0.08), { band: 3, gloss: 1, box: [20, 28, 108, 56] });
  for (const x of [32, 92]) shade(g, (q) => q.roundRect(x - 5, 28, 10, 80, 2), m, { gloss: 2, band: 1.5, box: [x - 5, 28, x + 5, 108] });
  shade(g, (q) => q.roundRect(54, 50, 20, 22, 3), METAL.brass, { gloss: 2, band: 1.5, rim: true });
  g.fillStyle = '#1a1010';
  g.beginPath();
  g.arc(64, 59, 2.6, 0, Math.PI * 2);
  g.fill();
  g.fillRect(63, 59, 2, 7);
  // River weed.
  line(g, '#4a8a3a', 2.4, (q) => {
    q.moveTo(22, 80);
    q.quadraticCurveTo(14, 92, 20, 108);
    q.moveTo(104, 60);
    q.quadraticCurveTo(114, 72, 108, 84);
  }, 0.9);
}

function orb(g: G, t: TrinketSpec) {
  const c = t.color ?? '#7a3ab8';
  glow(g, 64, 64, 54, c, 0.6);
  shade(g, circle(64, 64, 34), c, { gloss: 2, band: 5, rim: true, hi: 0.4, lo: 0.6, box: [30, 30, 98, 98], glossAt: [52, 50, 16] });
  if (t.glyph === 'eye') {
    shade(g, circle(70, 68, 15), '#f0f0f4', { band: 2 });
    shade(g, circle(72, 68, 9), t.accent ?? '#8a3ae0', { gloss: 2, band: 1 });
    g.fillStyle = '#100810';
    g.beginPath();
    g.arc(73, 68, 4.4, 0, Math.PI * 2);
    g.fill();
  } else if (t.glyph) {
    drawGlyph(g, t.glyph, 64, 66, 30, rgba(light(c, 0.7), 0.85));
  }
  sparkle(g, 48, 46, 7);
}

function crystal(g: G, t: TrinketSpec, r: () => number) {
  const c = t.color ?? '#9a5aff';
  glow(g, 64, 70, 52, c, 0.6);
  const shards: [number, number, number, number][] = [[64, 20, 13, 0], [42, 44, 10, -0.45], [86, 46, 9, 0.45], [54, 60, 8, -0.2], [76, 64, 8, 0.25]];
  for (const [x, y, w, a] of shards.slice().reverse()) {
    g.save();
    g.translate(x, 112);
    g.rotate(a);
    const h = 112 - y;
    shade(g, (q) => {
      q.moveTo(-w, 0);
      q.lineTo(-w, -h * 0.75);
      q.lineTo(0, -h);
      q.lineTo(w, -h * 0.75);
      q.lineTo(w, 0);
      q.closePath();
    }, c, { gloss: 2, band: 2, hi: 0.5, box: [-w, -h, w, 0] });
    line(g, light(c, 0.6), 1.2, (q) => {
      q.moveTo(0, -h);
      q.lineTo(0, 0);
    }, 0.6);
    g.restore();
  }
  shade(g, blob([[30, 112], [40, 102], [88, 100], [100, 112]]), t.accent ?? '#6a5a50', { band: 2, box: [30, 100, 100, 116] });
  for (let i = 0; i < 3; i++) sparkle(g, 36 + r() * 56, 24 + r() * 50, 4, light(c, 0.7));
}

function heart(g: G, t: TrinketSpec, m: string) {
  const c = t.color ?? '#c8a070';
  glow(g, 64, 68, 50, t.glow ?? c, 0.5);
  shade(g, blob([[64, 38], [86, 28], [104, 50], [96, 82], [64, 112], [32, 82], [24, 50], [42, 28]]), c, { gloss: 2, band: 5, rim: true, box: [24, 28, 104, 112] });
  // Cracks with light inside.
  line(g, t.accent ?? '#ffe08a', 2.6, (q) => {
    q.moveTo(52, 40);
    q.lineTo(60, 60);
    q.lineTo(54, 74);
    q.lineTo(66, 92);
    q.moveTo(60, 60);
    q.lineTo(78, 64);
  }, 0.95);
  void m;
}

function knot(g: G, t: TrinketSpec) {
  const c = t.color ?? '#a87a4a';
  // A noose: a loop and wrapped turns.
  line(g, dark(c, 0.4), 9, (q) => {
    q.moveTo(64, 10);
    q.lineTo(64, 50);
    q.moveTo(64, 74);
    q.bezierCurveTo(30, 80, 30, 120, 64, 120);
    q.bezierCurveTo(98, 120, 98, 80, 64, 74);
  }, 1);
  line(g, c, 6, (q) => {
    q.moveTo(64, 10);
    q.lineTo(64, 50);
    q.moveTo(64, 74);
    q.bezierCurveTo(30, 80, 30, 120, 64, 120);
    q.bezierCurveTo(98, 120, 98, 80, 64, 74);
  }, 1);
  for (let i = 0; i < 6; i++) shade(g, (q) => q.roundRect(54, 46 + i * 5, 20, 6, 3), i % 2 ? c : light(c, 0.12), { band: 1, gloss: 1, box: [54, 46 + i * 5, 74, 52 + i * 5] });
  if (t.accent) line(g, t.accent, 2, (q) => {
    q.moveTo(46, 100);
    q.lineTo(58, 108);
  }, 0.8);
}

function feather(g: G, t: TrinketSpec, m: string, k = 1, cx = 64, cy = 64) {
  const c = t.color ?? '#c8a070';
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
  g.rotate(-0.7);
  shade(g, (q) => {
    q.moveTo(0, -54);
    q.bezierCurveTo(20, -30, 18, 20, 4, 42);
    q.lineTo(-4, 42);
    q.bezierCurveTo(-20, 16, -18, -30, 0, -54);
  }, c, { gloss: 1, band: 3, rim: true, box: [-20, -54, 20, 42] });
  line(g, dark(c, 0.4), 1, (q) => {
    for (let i = 0; i < 9; i++) {
      const y = -40 + i * 9;
      q.moveTo(0, y);
      q.lineTo(-14 + Math.abs(i - 4) * 1.4, y + 8);
      q.moveTo(0, y);
      q.lineTo(14 - Math.abs(i - 4) * 1.4, y + 8);
    }
  }, 0.5);
  line(g, light(c, 0.5), 1.6, (q) => {
    q.moveTo(0, -52);
    q.lineTo(0, 56);
  }, 1);
  if (t.metal) shade(g, (q) => q.roundRect(-4, 40, 8, 10, 2), m, { gloss: 2, band: 1 });
  g.restore();
}

function jaw(g: G) {
  const c = '#e8dcc0';
  shade(g, (q) => {
    q.moveTo(14, 60);
    q.bezierCurveTo(30, 100, 98, 100, 114, 60);
    q.lineTo(104, 58);
    q.bezierCurveTo(92, 86, 36, 86, 24, 58);
    q.closePath();
  }, c, { gloss: 1, band: 3, rim: true, box: [14, 58, 114, 100] });
  for (let i = 0; i < 9; i++) {
    const u = i / 8, x = 26 + u * 76, y = 62 + Math.sin(u * Math.PI) * 20;
    shade(g, (q) => {
      q.moveTo(x - 4, y);
      q.lineTo(x, y - 18 - Math.sin(u * Math.PI) * 6);
      q.lineTo(x + 4, y);
      q.closePath();
    }, '#f4f0e4', { band: 1, gloss: 1, box: [x - 4, y - 24, x + 4, y] });
  }
}

function plugs(g: G) {
  for (const [x, y] of [[44, 76], [84, 62]] as [number, number][]) {
    shade(g, blob([[x - 20, y + 13], [x - 17, y - 16], [x + 6, y - 26], [x + 23, y - 6], [x + 16, y + 20], [x - 3, y + 26]]), '#f0d070', { gloss: 2, band: 3, rim: true, box: [x - 20, y - 26, x + 23, y + 26] });
  }
}

function gloves(g: G, t: TrinketSpec) {
  const c = t.color ?? '#7a5a3a';
  for (const [dx, rot] of [[-14, -0.15], [14, 0.15]] as [number, number][]) {
    g.save();
    g.translate(64 + dx, 64);
    g.rotate(rot);
    shade(g, (q) => {
      q.moveTo(-16, 46);
      q.lineTo(-16, 0);
      q.lineTo(-22, -16);
      q.quadraticCurveTo(-20, -22, -14, -16);
      q.lineTo(-10, -8);
      for (let i = 0; i < 4; i++) {
        const x = -10 + i * 7;
        q.lineTo(x, -36 + Math.abs(i - 1.5) * 4);
        q.quadraticCurveTo(x + 3.5, -42 + Math.abs(i - 1.5) * 4, x + 7, -36 + Math.abs(i - 1.5) * 4);
      }
      q.lineTo(18, 0);
      q.lineTo(16, 46);
      q.closePath();
    }, c, { gloss: 1, band: 3, rim: true, box: [-22, -42, 18, 46] });
    shade(g, (q) => q.roundRect(-18, 30, 36, 16, 3), dark(c, 0.15), { band: 1.5, box: [-18, 30, 18, 46] });
    g.restore();
  }
}

function sickle(g: G, m: string) {
  shade(g, (q) => q.roundRect(56, 74, 12, 46, 4), '#7a5030', { band: 2, gloss: 1, box: [56, 74, 68, 120] });
  shade(g, (q) => q.roundRect(54, 70, 16, 8, 2), METAL.bronze, { gloss: 2, band: 1 });
  shade(g, (q) => {
    q.moveTo(58, 72);
    q.bezierCurveTo(30, 60, 26, 20, 64, 12);
    q.bezierCurveTo(96, 6, 112, 30, 104, 44);
    q.bezierCurveTo(100, 26, 80, 18, 64, 24);
    q.bezierCurveTo(42, 32, 46, 60, 68, 70);
    q.closePath();
  }, m, { gloss: 2, band: 2.5, rim: true, box: [26, 6, 112, 72] });
}

function rod(g: G) {
  line(g, '#5a3a20', 5, (q) => {
    q.moveTo(20, 116);
    q.lineTo(108, 14);
  }, 1);
  line(g, '#a8784a', 3, (q) => {
    q.moveTo(20, 116);
    q.lineTo(108, 14);
  }, 1);
  shade(g, (q) => q.roundRect(14, 96, 12, 24, 4), '#3a2a1a', { band: 1.5, box: [14, 96, 26, 120] });
  shade(g, circle(36, 92, 7), '#9aa0a8', { gloss: 2, band: 1 });
  line(g, '#f4f4f4', 0.9, (q) => {
    q.moveTo(108, 14);
    q.quadraticCurveTo(116, 60, 98, 96);
  }, 0.9);
  shade(g, (q) => {
    q.moveTo(96, 96);
    q.quadraticCurveTo(92, 108, 100, 108);
    q.quadraticCurveTo(104, 104, 102, 100);
  }, '#e8dcc0', { band: 0 });
}

function ribbon(g: G, t: TrinketSpec) {
  const c = t.color ?? '#f08ab0';
  // Two tails, two loops and a knot.
  for (const s of [-1, 1]) {
    shade(g, (q) => {
      q.moveTo(64, 62);
      q.bezierCurveTo(64 + s * 8, 84, 64 + s * 20, 100, 64 + s * 26, 118);
      q.lineTo(64 + s * 16, 110);
      q.lineTo(64 + s * 10, 120);
      q.bezierCurveTo(64 + s * 6, 98, 64, 80, 58 + s * 2, 64);
      q.closePath();
    }, dark(c, 0.08), { band: 2, gloss: 1, box: [64 - 26, 62, 64 + 26, 120] });
    shade(g, (q) => {
      q.moveTo(64, 58);
      q.bezierCurveTo(64 + s * 20, 30, 64 + s * 50, 34, 64 + s * 46, 58);
      q.bezierCurveTo(64 + s * 42, 76, 64 + s * 20, 70, 64, 60);
      q.closePath();
    }, c, { band: 3, gloss: 1, rim: true, box: [64 - 50, 30, 64 + 50, 76] });
  }
  shade(g, (q) => q.roundRect(56, 50, 16, 18, 5), dark(c, 0.15), { gloss: 1, band: 1.5 });
}

function cloak(g: G, t: TrinketSpec) {
  const c = t.color ?? '#3a6a3a';
  shade(g, (q) => {
    q.moveTo(46, 22);
    q.quadraticCurveTo(64, 16, 82, 22);
    q.bezierCurveTo(100, 50, 108, 90, 112, 116);
    q.quadraticCurveTo(96, 110, 88, 116);
    q.quadraticCurveTo(76, 108, 64, 116);
    q.quadraticCurveTo(52, 108, 40, 116);
    q.quadraticCurveTo(30, 110, 16, 116);
    q.bezierCurveTo(20, 90, 28, 50, 46, 22);
    q.closePath();
  }, c, { gloss: 1, band: 5, rim: true, box: [16, 16, 112, 116] });
  line(g, dark(c, 0.35), 2, (q) => {
    q.moveTo(56, 30);
    q.quadraticCurveTo(48, 70, 40, 112);
    q.moveTo(72, 30);
    q.quadraticCurveTo(80, 70, 88, 112);
  }, 0.6);
  // Hood and clasp.
  shade(g, (q) => {
    q.moveTo(44, 24);
    q.bezierCurveTo(44, 4, 84, 4, 84, 24);
    q.quadraticCurveTo(64, 34, 44, 24);
    q.closePath();
  }, dark(c, 0.12), { band: 2, box: [44, 6, 84, 34] });
  shade(g, circle(64, 30, 6), METAL[t.metal ?? 'brass'] ?? METAL.brass, { gloss: 2, band: 1 });
  if (t.accent) line(g, t.accent, 3, (q) => {
    q.moveTo(18, 112);
    q.quadraticCurveTo(64, 104, 110, 112);
  }, 0.9);
}

export const TRINKETS: Record<string, TrinketSpec> = {
  // rings
  ringVigor: { kind: 'ring', metal: 'iron', color: '#c04a3a' },
  ringSage: { kind: 'ring', metal: 'silver', color: '#cfe0ff', glow: '#bcd4ff' },
  oldKingsRing: { kind: 'ring', metal: 'gold', glyph: 'crown', color: '#c0902a' },
  panebSignet: { kind: 'ring', metal: 'gold', color: '#d84a2a' },
  oasisRing: { kind: 'ring', metal: 'copper', color: '#5ac87a' },
  starReaderRing: { kind: 'ring', metal: 'silver', color: '#2a4ab8', glow: '#6a8aff' },
  oldKingsSignet: { kind: 'ring', metal: 'greenBronze', glyph: 'crown' },
  dentedSignet: { kind: 'ring', metal: 'gold', glyph: 'shield', color: '#b0802a' },
  // amulets
  garnetAmulet: { kind: 'amulet', metal: 'silver', color: '#b01a2a' },
  scarabAmulet: { kind: 'amulet', metal: 'gold', color: '#2a9a8a', shape: 'scarab' },
  scarabCharm: { kind: 'amulet', metal: 'copper', color: '#3a7ad8', shape: 'scarab' },
  rootwardenHeart: { kind: 'amulet', metal: 'brass', shape: 'heartwood', glow: '#7aff6a' },
  tidewardenHeart: { kind: 'amulet', metal: 'silver', color: '#4ad8c8', shape: 'seaglass', glow: '#5af0e0' },
  backwardsWheel: { kind: 'amulet', metal: 'blackIron', shape: 'wheel', glyph: 'bent' },
  ladysLocket: { kind: 'amulet', metal: 'gold', color: '#2a5ad8', shape: 'drop' },
  // charms and trophies on cords
  luckyCharm: { kind: 'charm', hang: 'tusk', color: '#f0e2c0', accent: '#a03a2a' },
  greyjawFang: { kind: 'charm', hang: 'fang', color: '#e8d48a', accent: '#6a4a2a' },
  warlordTusk: { kind: 'charm', hang: 'tusk', color: '#e0d0a0', accent: '#7a3a2a', metal: 'iron' },
  bristlebackTusk: { kind: 'charm', hang: 'tusk', color: '#f4ead0', accent: '#5a3a1a' },
  wayfarersCharm: { kind: 'charm', hang: 'stone', color: '#8a9aa8', accent: '#8a6a4a' },
  dicersCharm: { kind: 'charm', hang: 'bone', color: '#f0e6cc', accent: '#c0302a' },
  falconFeather: { kind: 'charm', hang: 'feather', color: '#a8784a', metal: 'gold', accent: '#d9a83a' },
  sunwheelCharm: { kind: 'charm', hang: 'wheel', metal: 'gold', accent: '#6a4a2a', glow: '#ffd76a' },
  diggersTag: { kind: 'charm', hang: 'disc', metal: 'brass', glyph: 'eye', accent: '#5a3a1a' },
  // badges, belts and cloth
  pilgrimsBadge: { kind: 'badge', metal: 'pewter', glyph: 'dawn', shape: 'round' },
  sunGuardBadge: { kind: 'badge', metal: 'gold', color: '#2a9a8a', glyph: 'sun' },
  warriorBelt: { kind: 'belt', metal: 'brass', color: '#6a4428', accent: '#8a5a32' },
  foragersSatchel: { kind: 'belt', metal: 'bronze', color: '#7a5a32', accent: '#5a7a3a' },
  vessBandolier: { kind: 'bandolier', metal: 'iron', color: '#4a3220' },
  sunGuardSash: { kind: 'sash', metal: 'gold', color: '#2a9a8a' },
  watchBanner: { kind: 'flag', color: '#2a4a8a', accent: '#d9b15a', glyph: 'shield' },
  posysRibbon: { kind: 'ribbon', color: '#e88aa8' },
  // crowns and horns
  thaneCrown: { kind: 'crown', metal: 'greenBronze', shape: '4', color: '#3a8a6a' },
  boneCrown: { kind: 'crown', metal: 'bone', shape: '7' },
  sunkenCrown: { kind: 'crown', metal: 'gold', shape: '8', color: '#2ab8a8', glow: '#5af0e0' },
  snaggleHorn: { kind: 'horn', color: '#e8d8a0', metal: 'copper', accent: '#c8743a' },
  ulgraWarHorn: { kind: 'horn', color: '#e0d0b0', accent: '#a02a2a' },
  // keys
  cryptKey: { kind: 'key', metal: 'iron', shape: 'ornate', glyph: 'skull' },
  vaultKeyA: { kind: 'key', metal: 'bronze', shape: 'plate', glyph: 'sun' },
  vaultKeyB: { kind: 'key', metal: 'bronze', shape: 'plate', glyph: 'dagger' },
  vaultKeyC: { kind: 'key', metal: 'bronze', shape: 'plate', glyph: 'hourglass' },
  smugglersKey: { kind: 'key', metal: 'iron', shape: 'ring' },
  tideKey: { kind: 'key', metal: 'greenBronze', shape: 'ornate', color: '#e8e0d0' },
  gravewoodKey: { kind: 'key', metal: 'iron', shape: 'ring', color: '#f08ab0' },
  sunkenKey: { kind: 'key', metal: 'gold', shape: 'ornate', glyph: 'eye', glow: '#5af0e0' },
  // flags
  blackTideColours: { kind: 'flag', color: '#16161e', accent: '#f4f4f4' },
  regattaPennant: { kind: 'flag', color: '#c0302a', accent: '#e8c03a', shape: 'pennant', glyph: 'anchor' },
  // objects
  drownedCompass: { kind: 'compass', metal: 'brass' },
  minersLantern: { kind: 'lantern', metal: 'brass' },
  tollStrongbox: { kind: 'box', metal: 'iron' },
  vargasEye: { kind: 'orb', color: '#6a3ab8', glyph: 'eye', accent: '#a86aff', glow: '#a86aff' },
  sunEye: { kind: 'orb', color: '#e0a83a', glyph: 'eye', accent: '#e05a1a', glow: '#ffd76a' },
  stormTear: { kind: 'orb', color: '#7ad8ff', glyph: 'bolt', glow: '#8ae8ff' },
  sunEaterHeart: { kind: 'heart', color: '#c0401a', accent: '#ffd06a', glow: '#ff7a2a' },
  wardenHeart: { kind: 'heart', color: '#c89a60', accent: '#ffe08a', glow: '#ffc84a' },
  delverCrystal: { kind: 'crystal', color: '#5ad8ff' },
  voidCrystal: { kind: 'crystal', color: '#9a4aff', accent: '#2a2030' },
  hangmansKnot: { kind: 'knot', color: '#a87a4a', accent: '#8a1a1a' },
  oldTeethJaw: { kind: 'jaw' },
  waxEarplugs: { kind: 'plugs' },
  thornGloves: { kind: 'gloves', color: '#6a4a2a' },
  herbSickle: { kind: 'sickle', metal: 'bronze' },
  fishingRod: { kind: 'rod' },
  travellersCloak: { kind: 'cloak', color: '#4a6a3a' },
  wayfarerCloak: { kind: 'cloak', color: '#7a2a24', accent: '#d9a83a' },
  silkMantle: { kind: 'cloak', color: '#7a2a6a', accent: '#e8c03a', metal: 'gold' },
  sunSilkMantle: { kind: 'cloak', color: '#2a9a8a', accent: '#e8c03a', metal: 'gold' },
};

export { leaf };
