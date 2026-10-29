import { shade, line, glow, sparkle, light, dark, rgba, leaf, ellipse, circle, rng, blob, type G } from './kit';

// Herbs, flowers, mushrooms, mosses and roots, each drawn as a gathered
// specimen: stems fanning up from a bundle (tied with twine for cut herbs),
// leaves of the plant's own shape, and its flower, cap or root. One spec per
// species (see PLANTS) so a herbalist can tell them apart at a glance.

export type LeafKind = 'oval' | 'lance' | 'round' | 'fern' | 'blade' | 'trefoil' | 'jagged' | 'needle' | 'broad';
export type FlowerKind = 'daisy' | 'umbel' | 'bells' | 'spike' | 'star' | 'cup' | 'pom' | 'crescent' | 'crystal' | 'flame' | 'lotus' | 'thistle' | 'hood' | 'cattail' | 'berries';

export interface PlantSpec {
  stems?: number;
  stem?: string;
  /** how far the stems fan apart (radians) */
  spread?: number;
  /** stem length, 0..1 of the frame */
  height?: number;
  leafKind?: LeafKind;
  leafColor?: string;
  leaves?: number;
  flower?: FlowerKind;
  petal?: string;
  center?: string;
  /** flowers per stem tip (bells, berries, spike florets) */
  size?: number;
  glow?: string;
  tie?: boolean;
  /** draw a mushroom, moss, root or special form instead of a stemmed plant */
  form?: 'mushroom' | 'moss' | 'root' | 'kelp' | 'cactus' | 'sheaf' | 'comb' | 'fronds';
  cap?: string;
  capKind?: 'dome' | 'bell' | 'flat' | 'cone';
  spots?: string;
  rootKind?: 'carrot' | 'knobbly' | 'bulb' | 'pebbles' | 'gnarled';
}

const BASE: [number, number] = [64, 112];

export function paintPlant(g: G, s: PlantSpec, seed: string) {
  const r = rng(seed);
  if (s.glow) glow(g, 64, s.form === 'moss' ? 88 : s.stems === 1 ? 44 : 56, s.form === 'moss' ? 50 : 58, s.glow, 0.7);
  switch (s.form) {
    case 'mushroom': return mushrooms(g, s, r);
    case 'moss': return moss(g, s, r);
    case 'root': return root(g, s, r);
    case 'kelp': return kelp(g, s, r);
    case 'cactus': return cactus(g, s, r);
    case 'sheaf': return sheaf(g, s, r);
    case 'comb': return comb(g, r);
    case 'fronds': return fronds(g, s, r);
  }
  const n = s.stems ?? 3, spread = s.spread ?? 0.7, H = (s.height ?? 0.72) * 100;
  const stemC = s.stem ?? '#4f8a2e';
  const leafC = s.leafColor ?? '#5aa03a';
  const tips: [number, number, number][] = [];
  // Stems, back to front.
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const ang = -Math.PI / 2 + t * spread * 2 + (r() - 0.5) * 0.12;
    const len = H * (0.82 + r() * 0.22) * (1 - Math.abs(t) * 0.25);
    const tx = BASE[0] + Math.cos(ang) * len, ty = BASE[1] + Math.sin(ang) * len;
    const cx = BASE[0] + Math.cos(ang) * len * 0.5 + t * 10, cy = BASE[1] + Math.sin(ang) * len * 0.55;
    tips.push([tx, ty, ang]);
    line(g, dark(stemC, 0.45), 4.2, (c) => {
      c.moveTo(BASE[0] + t * 6, BASE[1]);
      c.quadraticCurveTo(cx, cy, tx, ty);
    }, 1);
    line(g, light(stemC, 0.1), 2.4, (c) => {
      c.moveTo(BASE[0] + t * 6, BASE[1]);
      c.quadraticCurveTo(cx, cy, tx, ty);
    }, 1);
    // Leaves along the stem.
    const nl = s.leaves ?? 3;
    for (let k = 0; k < nl; k++) {
      const u = 0.25 + (k / Math.max(1, nl)) * 0.6;
      const px = (1 - u) * (1 - u) * (BASE[0] + t * 6) + 2 * (1 - u) * u * cx + u * u * tx;
      const py = (1 - u) * (1 - u) * BASE[1] + 2 * (1 - u) * u * cy + u * u * ty;
      const side = k % 2 ? 1 : -1;
      drawLeaf(g, s.leafKind ?? 'oval', px, py, ang + side * 0.95 + (r() - 0.5) * 0.3, (s.leafKind === 'needle' ? 9 : 16) * (1.1 - u * 0.4), leafC, r);
    }
  }
  if (s.tie !== false && n > 1) twine(g);
  for (const [tx, ty, ang] of tips) drawFlower(g, s, tx, ty, ang, r);
  if (s.glow) for (let i = 0; i < 3; i++) sparkle(g, 30 + r() * 68, 16 + r() * 60, 3 + r() * 3, light(s.glow, 0.6));
}

function twine(g: G) {
  shade(g, (c) => c.roundRect(52, 92, 24, 9, 3), '#b89058', { band: 2, box: [52, 92, 76, 101] });
  line(g, '#6a4a22', 0.9, (c) => {
    for (let x = 54; x < 76; x += 4) {
      c.moveTo(x, 93);
      c.lineTo(x + 2.5, 100);
    }
  }, 0.8);
  line(g, '#8a6a3a', 1.6, (c) => {
    c.moveTo(74, 97);
    c.quadraticCurveTo(82, 102, 80, 110);
  }, 1);
}

function drawLeaf(g: G, kind: LeafKind, x: number, y: number, ang: number, len: number, c: string, r: () => number) {
  const tx = x + Math.cos(ang) * len, ty = y + Math.sin(ang) * len;
  const box: [number, number, number, number] = [Math.min(x, tx) - 8, Math.min(y, ty) - 8, Math.max(x, tx) + 8, Math.max(y, ty) + 8];
  if (kind === 'fern') {
    line(g, dark(c, 0.3), 1.6, (p) => {
      p.moveTo(x, y);
      p.lineTo(tx, ty);
    }, 1);
    for (let i = 1; i <= 6; i++) {
      const u = i / 7, px = x + (tx - x) * u, py = y + (ty - y) * u, w = (1 - u) * 7 + 2;
      for (const sd of [-1, 1]) shade(g, leaf(px, py, px + Math.cos(ang + sd * 1.1) * w, py + Math.sin(ang + sd * 1.1) * w, 2), c, { band: 1, box });
    }
    return;
  }
  if (kind === 'needle') {
    for (let i = 0; i < 5; i++) {
      const a = ang + (i - 2) * 0.28;
      line(g, c, 1.8, (p) => {
        p.moveTo(x, y);
        p.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      }, 1);
    }
    return;
  }
  if (kind === 'trefoil') {
    for (const d of [-0.6, 0, 0.6]) {
      const a = ang + d, lx = x + Math.cos(a) * len * 0.8, ly = y + Math.sin(a) * len * 0.8;
      shade(g, leaf(x, y, lx, ly, len * 0.32), c, { band: 1.5, box, gloss: 1 });
    }
    return;
  }
  const w = { oval: 0.36, lance: 0.2, round: 0.55, blade: 0.12, jagged: 0.34, broad: 0.5 }[kind] * len;
  const path = kind === 'jagged' ? jagged(x, y, tx, ty, w, r) : leaf(x, y, tx, ty, w);
  shade(g, path, c, { band: 1.8, box, gloss: kind === 'broad' || kind === 'round' ? 1 : 0 });
  line(g, dark(c, 0.35), 0.8, (p) => {
    p.moveTo(x, y);
    p.lineTo(x + (tx - x) * 0.85, y + (ty - y) * 0.85);
  }, 0.7);
}

function jagged(x: number, y: number, tx: number, ty: number, w: number, r: () => number) {
  const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const pts: [number, number][] = [[x, y]];
  for (let i = 1; i < 7; i++) {
    const u = i / 7, ww = Math.sin(u * Math.PI) * w * (i % 2 ? 1.15 : 0.75);
    pts.push([x + dx * u + nx * ww, y + dy * u + ny * ww]);
  }
  pts.push([tx, ty]);
  for (let i = 6; i >= 1; i--) {
    const u = i / 7, ww = Math.sin(u * Math.PI) * w * (i % 2 ? 1.15 : 0.75) * (0.9 + r() * 0.2);
    pts.push([x + dx * u - nx * ww, y + dy * u - ny * ww]);
  }
  return (c: G) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) c.lineTo(px, py);
    c.closePath();
  };
}

function drawFlower(g: G, s: PlantSpec, x: number, y: number, ang: number, r: () => number) {
  const p = s.petal ?? '#f2f2f2', ctr = s.center ?? '#f2c23a', k = s.size ?? 1;
  switch (s.flower) {
    case 'daisy': {
      const n = 11, R = 9 * k;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        shade(g, ellipse(x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, R * 0.55, R * 0.2, a), p, { band: 1, box: [x - R, y - R, x + R, y + R] });
      }
      shade(g, circle(x, y, R * 0.38), ctr, { gloss: 1, band: 1.2, box: [x - 4, y - 4, x + 4, y + 4] });
      return;
    }
    case 'umbel': {
      const R = 11 * k;
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
        const fx = x + Math.cos(a) * d, fy = y - 2 + Math.sin(a) * d * 0.55;
        shade(g, circle(fx, fy, 2.6), p, { band: 0.8, box: [fx - 3, fy - 3, fx + 3, fy + 3] });
        g.fillStyle = rgba(ctr, 0.9);
        g.fillRect(fx - 0.6, fy - 0.6, 1.2, 1.2);
      }
      return;
    }
    case 'star': {
      for (let j = 0; j < (s.size ?? 1) * 3; j++) {
        const fx = x + (r() - 0.5) * 16, fy = y + (r() - 0.5) * 12;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          shade(g, ellipse(fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 3.4, 1.4, a), p, { band: 0.6, box: [fx - 6, fy - 6, fx + 6, fy + 6] });
        }
        shade(g, circle(fx, fy, 1.4), ctr, { band: 0 });
      }
      return;
    }
    case 'bells':
    case 'hood': {
      // A spike of bells hanging from the top of the stem.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const u = i / n, bx = x + Math.cos(ang) * -u * 26 + (i % 2 ? 5 : -5), by = y + Math.sin(ang) * -u * 26;
        const sz = (6.5 - u * 2.5) * k;
        const path = s.flower === 'hood'
          ? (c: G) => {
            c.moveTo(bx - sz, by + sz);
            c.quadraticCurveTo(bx - sz * 1.2, by - sz * 1.4, bx + sz * 0.6, by - sz);
            c.quadraticCurveTo(bx + sz * 1.3, by, bx + sz, by + sz);
            c.closePath();
          }
          : (c: G) => {
            c.moveTo(bx - sz * 0.6, by - sz);
            c.quadraticCurveTo(bx - sz * 1.2, by + sz * 0.6, bx - sz, by + sz);
            c.quadraticCurveTo(bx, by + sz * 0.5, bx + sz, by + sz);
            c.quadraticCurveTo(bx + sz * 1.2, by + sz * 0.6, bx + sz * 0.6, by - sz);
            c.closePath();
          };
        shade(g, path, p, { band: 1.6, gloss: 1, box: [bx - sz, by - sz, bx + sz, by + sz] });
        if (s.flower === 'bells') {
          g.fillStyle = rgba(dark(p, 0.5), 0.8);
          g.beginPath();
          g.ellipse(bx, by + sz * 0.8, sz * 0.6, sz * 0.25, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      return;
    }
    case 'spike': {
      for (let i = 0; i < 9; i++) {
        const u = i / 9, sx = x + Math.cos(ang) * -u * 22, sy = y + Math.sin(ang) * -u * 22;
        for (const sd of [-1, 1]) shade(g, ellipse(sx + sd * 3, sy, 3.2 * k, 2.2 * k, sd * 0.5), p, { band: 0.8, box: [sx - 5, sy - 3, sx + 5, sy + 3] });
      }
      return;
    }
    case 'cup': {
      // A rose: rings of petals around a tight heart.
      for (let ring = 2; ring >= 0; ring--) {
        const R = (5 + ring * 4) * k;
        for (let i = 0; i < 5 + ring; i++) {
          const a = (i / (5 + ring)) * Math.PI * 2 + ring * 0.4;
          shade(g, ellipse(x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.4, R * 0.62, R * 0.48, a), ring ? p : dark(p, 0.15), { band: 1.2, box: [x - R, y - R, x + R, y + R] });
        }
      }
      line(g, dark(p, 0.45), 1, (c) => c.arc(x, y, 3 * k, 0.4, 4.4), 0.8);
      return;
    }
    case 'pom': {
      for (let ring = 3; ring >= 0; ring--) {
        const R = (3 + ring * 3) * k;
        for (let i = 0; i < 8 + ring * 3; i++) {
          const a = (i / (8 + ring * 3)) * Math.PI * 2 + ring;
          shade(g, ellipse(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.55, 3.2, 2.2, a), ring % 2 ? p : light(p, 0.18), { band: 0.6, box: [x - R, y - R, x + R, y + R] });
        }
      }
      return;
    }
    case 'crescent': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const px = x + Math.cos(a) * 7 * k, py = y + Math.sin(a) * 7 * k;
        shade(g, (c) => {
          c.arc(px, py, 6 * k, a - 2.2, a + 2.2);
          c.arc(px - Math.cos(a) * 3 * k, py - Math.sin(a) * 3 * k, 5 * k, a + 2.0, a - 2.0, true);
          c.closePath();
        }, p, { band: 0.8, gloss: 1, box: [px - 6, py - 6, px + 6, py + 6] });
      }
      shade(g, circle(x, y, 3 * k), ctr, { gloss: 2, band: 0 });
      return;
    }
    case 'crystal': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55, L = (16 - Math.abs(i - 2) * 3) * k;
        const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
        shade(g, (c) => {
          c.moveTo(x - Math.sin(a) * 3 * k, y + Math.cos(a) * 3 * k);
          c.lineTo(ex, ey);
          c.lineTo(x + Math.sin(a) * 3 * k, y - Math.cos(a) * 3 * k);
          c.closePath();
        }, p, { gloss: 2, band: 1, hi: 0.5, box: [Math.min(x, ex) - 3, Math.min(y, ey) - 3, Math.max(x, ex) + 3, Math.max(y, ey) + 3] });
      }
      sparkle(g, x + 4, y - 12, 5);
      return;
    }
    case 'flame': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5, L = (15 - Math.abs(i - 2) * 3) * k;
        const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
        shade(g, (c) => {
          c.moveTo(x, y + 3);
          c.quadraticCurveTo(x + Math.cos(a + 0.9) * L * 0.7, y + Math.sin(a + 0.9) * L * 0.7, ex, ey);
          c.quadraticCurveTo(x + Math.cos(a - 0.9) * L * 0.7, y + Math.sin(a - 0.9) * L * 0.7, x, y + 3);
        }, i % 2 ? p : ctr, { band: 1, gloss: 1, box: [x - L, y - L, x + L, y + 4] });
      }
      return;
    }
    case 'lotus': {
      for (let layer = 0; layer < 2; layer++) {
        for (let i = -2; i <= 2; i++) {
          const a = -Math.PI / 2 + i * (0.45 - layer * 0.1), L = (16 - Math.abs(i) * 2 - layer * 4) * k;
          const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
          shade(g, (c) => {
            c.moveTo(x, y + 4);
            c.quadraticCurveTo(x + Math.cos(a + 0.6) * L * 0.8, y + Math.sin(a + 0.6) * L * 0.8, ex, ey);
            c.quadraticCurveTo(x + Math.cos(a - 0.6) * L * 0.8, y + Math.sin(a - 0.6) * L * 0.8, x, y + 4);
          }, layer ? light(p, 0.15) : p, { band: 1, gloss: 1, box: [x - L, y - L, x + L, y + 4] });
        }
      }
      return;
    }
    case 'thistle': {
      shade(g, (c) => {
        c.moveTo(x - 6, y - 2);
        c.quadraticCurveTo(x, y + 9, x + 6, y - 2);
        c.closePath();
      }, s.leafColor ?? '#6a8a5a', { band: 1, box: [x - 6, y - 2, x + 6, y + 8] });
      for (let i = 0; i < 13; i++) {
        const a = -Math.PI + (i / 12) * Math.PI;
        line(g, p, 1.6, (c) => {
          c.moveTo(x, y - 2);
          c.lineTo(x + Math.cos(a) * 11 * k, y - 2 + Math.sin(a) * 11 * k);
        }, 1);
      }
      sparkle(g, x + 5, y - 10, 3.5);
      return;
    }
    case 'cattail': {
      shade(g, ellipse(x, y + 6, 3.6, 10, ang + Math.PI / 2), p, { band: 1.2, gloss: 1, box: [x - 4, y - 4, x + 4, y + 16] });
      return;
    }
    case 'berries': {
      for (let i = 0; i < 6 * k; i++) {
        const bx = x + (r() - 0.5) * 14, by = y + (r() - 0.5) * 10;
        shade(g, circle(bx, by, 4.2), p, { gloss: 2, band: 1.2, box: [bx - 4, by - 4, bx + 4, by + 4], glossAt: [bx - 1.4, by - 1.6, 2.2] });
      }
      return;
    }
  }
}

// ---- special forms --------------------------------------------------------------------------
function mushrooms(g: G, s: PlantSpec, r: () => number) {
  const cap = s.cap ?? '#d03a2a', stemC = s.stem ?? '#efe6d2';
  const set: [number, number, number][] = [[46, 104, 0.72], [80, 108, 0.6], [62, 100, 1]];
  for (const [x, y, k] of set) {
    const h = 34 * k, w = 9 * k;
    shade(g, (c) => {
      c.moveTo(x - w * 0.55, y);
      c.quadraticCurveTo(x - w * 0.75, y - h * 0.5, x - w * 0.45, y - h);
      c.lineTo(x + w * 0.45, y - h);
      c.quadraticCurveTo(x + w * 0.75, y - h * 0.5, x + w * 0.55, y);
      c.closePath();
    }, stemC, { band: 2, box: [x - w, y - h, x + w, y] });
    const cw = 22 * k, ch = 15 * k, cy = y - h;
    const kind = s.capKind ?? 'dome';
    const path = (c: G) => {
      if (kind === 'cone') {
        c.moveTo(x - cw * 0.8, cy + 2);
        c.quadraticCurveTo(x - cw * 0.3, cy - ch * 1.6, x, cy - ch * 1.8);
        c.quadraticCurveTo(x + cw * 0.3, cy - ch * 1.6, x + cw * 0.8, cy + 2);
      } else if (kind === 'flat') {
        c.moveTo(x - cw, cy + 2);
        c.bezierCurveTo(x - cw, cy - ch * 0.7, x + cw, cy - ch * 0.7, x + cw, cy + 2);
      } else if (kind === 'bell') {
        c.moveTo(x - cw * 0.7, cy + 4);
        c.bezierCurveTo(x - cw * 0.8, cy - ch * 1.5, x + cw * 0.8, cy - ch * 1.5, x + cw * 0.7, cy + 4);
      } else {
        c.moveTo(x - cw, cy + 3);
        c.bezierCurveTo(x - cw, cy - ch * 1.25, x + cw, cy - ch * 1.25, x + cw, cy + 3);
      }
      c.quadraticCurveTo(x, cy + 8, x - cw * (kind === 'cone' ? 0.8 : kind === 'bell' ? 0.7 : 1), cy + (kind === 'bell' ? 4 : kind === 'flat' ? 2 : 3));
      c.closePath();
    };
    shade(g, path, cap, { gloss: 2, band: 3, rim: true, box: [x - cw, cy - ch * 1.6, x + cw, cy + 8] });
    if (s.spots) {
      for (let i = 0; i < 5; i++) {
        const sx = x - cw * 0.6 + r() * cw * 1.2, sy = cy - ch * 0.2 - r() * ch * 0.7;
        shade(g, ellipse(sx, sy, 2.4 * k + 0.6, 1.8 * k + 0.4, r()), s.spots, { band: 0, box: [sx - 3, sy - 3, sx + 3, sy + 3] });
      }
    }
  }
  if (s.glow) for (let i = 0; i < 4; i++) sparkle(g, 26 + r() * 76, 30 + r() * 50, 3 + r() * 2.5, light(s.glow, 0.6));
  grass(g, r);
}

function moss(g: G, s: PlantSpec, r: () => number) {
  const c = s.leafColor ?? '#5a8a3a';
  shade(g, blob([[22, 100], [30, 76], [52, 66], [78, 68], [100, 80], [108, 100], [86, 112], [44, 112]]), c, { band: 4, gloss: 1, box: [22, 64, 108, 114] });
  for (let i = 0; i < 70; i++) {
    const x = 28 + r() * 76, y = 70 + r() * 40;
    g.fillStyle = rgba(r() < 0.5 ? light(c, 0.35) : dark(c, 0.3), 0.8);
    g.beginPath();
    g.arc(x, y, 1 + r() * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  if (s.petal) for (let i = 0; i < 14; i++) sparkle(g, 30 + r() * 70, 66 + r() * 38, 1.8 + r() * 2.2, s.petal);
}

function root(g: G, s: PlantSpec, r: () => number) {
  const c = s.cap ?? '#d07a3a';
  const kind = s.rootKind ?? 'carrot';
  if (kind === 'pebbles') {
    const pts: [number, number, number][] = [[40, 92, 11], [58, 82, 13], [78, 76, 11], [94, 64, 9]];
    for (const [x, y, rr] of pts) shade(g, ellipse(x, y, rr, rr * 0.82, r()), c, { gloss: 1, band: 2.5, box: [x - rr, y - rr, x + rr, y + rr] });
    line(g, dark(c, 0.4), 1.4, (p) => {
      p.moveTo(30, 100);
      p.lineTo(40, 92);
    });
  } else {
    const path = kind === 'bulb'
      ? blob([[64, 46], [86, 66], [84, 94], [64, 106], [44, 94], [42, 66]])
      : kind === 'knobbly' || kind === 'gnarled'
        ? blob([[34, 52], [52, 50], [70, 60], [90, 70], [100, 88], [92, 98], [72, 86], [54, 78], [38, 70]])
        : (p: G) => {
          p.moveTo(42, 46);
          p.quadraticCurveTo(64, 38, 80, 48);
          p.quadraticCurveTo(84, 64, 72, 86);
          p.quadraticCurveTo(64, 104, 54, 114);
          p.quadraticCurveTo(52, 96, 46, 78);
          p.quadraticCurveTo(38, 60, 42, 46);
          p.closePath();
        };
    shade(g, path, c, { gloss: 1, band: 4, rim: true, box: [36, 40, 100, 112] });
    // Root rings and hair roots.
    line(g, dark(c, 0.35), 1.2, (p) => {
      for (let i = 0; i < 5; i++) {
        const y = 56 + i * 9;
        p.moveTo(46 + i * 2, y);
        p.quadraticCurveTo(60, y + 3, 72 - i * 2, y - 1);
      }
    }, 0.6);
    line(g, dark(c, 0.2), 0.9, (p) => {
      p.moveTo(50, 92);
      p.lineTo(40, 98);
      p.moveTo(70, 80);
      p.lineTo(84, 86);
    }, 0.8);
  }
  // Leafy top.
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.35;
    drawLeaf(g, s.leafKind ?? 'lance', kind === 'pebbles' ? 96 : 60, kind === 'pebbles' ? 58 : 46, a, 26, s.leafColor ?? '#5aa03a', r);
  }
  if (s.glow) for (let i = 0; i < 3; i++) sparkle(g, 40 + r() * 50, 50 + r() * 40, 3, light(s.glow, 0.5));
}

function kelp(g: G, s: PlantSpec, r: () => number) {
  const c = s.leafColor ?? '#7a7a2a';
  for (let i = 0; i < 4; i++) {
    const x0 = 42 + i * 14;
    shade(g, (p) => {
      p.moveTo(x0, 116);
      p.bezierCurveTo(x0 - 18, 84, x0 + 18, 56, x0 - 4 + r() * 8, 18 + i * 6);
      p.bezierCurveTo(x0 + 26, 56, x0 - 6, 84, x0 + 8, 116);
      p.closePath();
    }, i % 2 ? c : light(c, 0.12), { band: 2, gloss: 1, box: [x0 - 18, 18, x0 + 26, 116] });
  }
}

function cactus(g: G, s: PlantSpec, r: () => number) {
  const c = s.leafColor ?? '#5a9a6a';
  shade(g, blob([[42, 112], [38, 80], [46, 56], [64, 50], [82, 56], [90, 80], [86, 112]]), c, { band: 4, gloss: 1, box: [38, 50, 90, 112] });
  line(g, dark(c, 0.35), 1.2, (p) => {
    p.moveTo(56, 58);
    p.quadraticCurveTo(52, 86, 54, 110);
    p.moveTo(72, 58);
    p.quadraticCurveTo(76, 86, 74, 110);
  }, 0.7);
  for (let i = 0; i < 14; i++) {
    const x = 44 + r() * 42, y = 60 + r() * 48;
    line(g, '#f4f0d8', 0.8, (p) => {
      p.moveTo(x, y);
      p.lineTo(x + 3, y - 3);
    }, 0.9);
  }
  drawFlower(g, { ...s, flower: s.flower ?? 'lotus' }, 64, 46, -Math.PI / 2, r);
}

function sheaf(g: G, s: PlantSpec, r: () => number) {
  const c = s.petal ?? '#e0b84a';
  // Stalks gathered at a tie and splayed above and below it, ears of grain on top.
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5, ang = -Math.PI / 2 + t * 0.75;
    const tx = 64 + Math.cos(ang) * 60, ty = 88 + Math.sin(ang) * 60;
    for (const [w, col] of [[3, dark(c, 0.35)], [1.5, light(c, 0.1)]] as [number, string][]) {
      line(g, col, w, (p) => {
        p.moveTo(64 - t * 22, 120);
        p.quadraticCurveTo(64, 88, tx, ty + 10);
      }, 1);
    }
    for (let k = 0; k < 7; k++) {
      const u = k / 7, ex = tx - Math.cos(ang) * u * 18, ey = ty - Math.sin(ang) * u * 18 + 4;
      for (const sd of [-1, 1]) shade(g, ellipse(ex + sd * 3, ey, 2.8, 4.2, ang + Math.PI / 2 + sd * 0.5), c, { band: 0.9, gloss: 1, box: [ex - 5, ey - 5, ex + 5, ey + 5] });
    }
    line(g, light(c, 0.35), 0.8, (p) => {
      p.moveTo(tx, ty);
      p.lineTo(tx + Math.cos(ang) * 14, ty + Math.sin(ang) * 14);
    }, 0.9);
  }
  shade(g, (p) => p.roundRect(52, 90, 24, 10, 3), '#b07a3a', { band: 2, box: [52, 90, 76, 100] });
  line(g, '#6a4220', 0.9, (p) => {
    for (let x = 54; x < 76; x += 4) {
      p.moveTo(x, 91);
      p.lineTo(x + 2.5, 99);
    }
  }, 0.8);
  void r;
}

function fronds(g: G, s: PlantSpec, r: () => number) {
  const c = s.leafColor ?? '#4a8a3a';
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i - 2) * 0.42;
    drawLeaf(g, 'fern', 64 + (i - 2) * 3, 112, ang, 84 - Math.abs(i - 2) * 12, i % 2 ? c : light(c, 0.12), r);
  }
  // A curled fiddlehead in front.
  line(g, dark(c, 0.3), 3, (p) => {
    p.moveTo(70, 112);
    p.quadraticCurveTo(84, 90, 80, 76);
    p.arc(76, 78, 4.5, 0, Math.PI * 1.6);
  }, 1);
}

function comb(g: G, r: () => number) {
  const c = '#f0a828';
  shade(g, blob([[30, 56], [64, 40], [98, 52], [104, 86], [80, 108], [40, 106], [24, 82]]), c, { band: 4, gloss: 2, box: [24, 40, 104, 108] });
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const hx = 38 + x * 13 + (y % 2) * 6.5, hy = 56 + y * 11;
      if (hx > 96) continue;
      g.save();
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(hx + Math.cos(a) * 5.4, hy + Math.sin(a) * 5.4);
      }
      g.closePath();
      g.fillStyle = rgba(dark(c, 0.35), 0.7);
      g.fill();
      g.fillStyle = rgba(light(c, 0.4), 0.6);
      g.beginPath();
      g.arc(hx - 1.4, hy - 1.4, 1.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  // A drip of honey.
  shade(g, (p) => {
    p.moveTo(70, 104);
    p.quadraticCurveTo(74, 116, 72, 122);
    p.arc(72, 120, 3.4, 0, Math.PI * 2);
  }, '#ffb830', { gloss: 2, band: 1, box: [68, 104, 76, 124] });
  void r;
}

function grass(g: G, r: () => number) {
  for (let i = 0; i < 8; i++) {
    const x = 30 + r() * 68;
    line(g, '#5a8a2e', 1.6, (p) => {
      p.moveTo(x, 114);
      p.quadraticCurveTo(x + (r() - 0.5) * 8, 106, x + (r() - 0.5) * 10, 98 + r() * 6);
    }, 0.9);
  }
}

// ---- the species ----------------------------------------------------------------------------
export const PLANTS: Record<string, PlantSpec> = {
  sungrass: { stems: 5, leafKind: 'blade', leafColor: '#b8c84a', stem: '#8aa83a', flower: 'spike', petal: '#ffd84a', spread: 0.55, leaves: 2 },
  moongrass: { stems: 5, leafKind: 'blade', leafColor: '#9ac0c8', stem: '#7aa0a8', flower: 'spike', petal: '#dfe8ff', spread: 0.55, leaves: 2, glow: '#bcd4ff' },
  wildmint: { stems: 3, leafKind: 'oval', leafColor: '#4ab85a', stem: '#3a8a3a', flower: 'spike', petal: '#c8a8e8', leaves: 4 },
  ironleaf: { stems: 3, leafKind: 'broad', leafColor: '#6a8a8a', stem: '#4a6a5a', leaves: 4, flower: 'umbel', petal: '#b8c4c8', size: 0.6 },
  brambleBerries: { stems: 3, leafKind: 'jagged', leafColor: '#4a8a3a', stem: '#6a3a3a', flower: 'berries', petal: '#3a1a4a', leaves: 2, size: 1.2 },
  honeycomb: { form: 'comb' },
  redcap: { form: 'mushroom', cap: '#d8322a', spots: '#fff4e8', capKind: 'dome' },
  bloodcap: { form: 'mushroom', cap: '#9a0a1e', capKind: 'bell', stem: '#e8d6c8' },
  ghostcap: { form: 'mushroom', cap: '#e8f0f4', capKind: 'cone', stem: '#f4f8fa', glow: '#bfe6ff' },
  silverthistle: { stems: 3, leafKind: 'jagged', leafColor: '#7a9a8a', stem: '#5a7a6a', flower: 'thistle', petal: '#e0e6f0', leaves: 2 },
  duskbloom: { stems: 3, leafKind: 'lance', leafColor: '#4a6a5a', flower: 'cup', petal: '#9a5ae0', glow: '#b07aff', size: 0.9 },
  riverReed: { stems: 4, leafKind: 'blade', leafColor: '#8aa84a', stem: '#7a9a3a', flower: 'cattail', petal: '#7a4a24', spread: 0.4, leaves: 2, height: 0.86 },
  wildGarlic: { stems: 3, leafKind: 'broad', leafColor: '#4aa04a', flower: 'star', petal: '#ffffff', center: '#e8e0a0', leaves: 2 },
  emberroot: { form: 'root', rootKind: 'carrot', cap: '#e8642a', leafColor: '#6a9a2a', glow: '#ff8a3a' },
  marigold: { stems: 3, leafKind: 'jagged', leafColor: '#4a8a2a', flower: 'pom', petal: '#ff9a1a', leaves: 2 },
  yarrow: { stems: 3, leafKind: 'fern', leafColor: '#6a9a4a', flower: 'umbel', petal: '#f8f6ec', center: '#d8d0a0', leaves: 2 },
  chamomile: { stems: 4, leafKind: 'needle', leafColor: '#7ab04a', flower: 'daisy', petal: '#ffffff', center: '#f2c41a', size: 0.8, leaves: 2 },
  nettle: { stems: 3, leafKind: 'jagged', leafColor: '#3a8a3a', stem: '#3a6a2a', leaves: 4, flower: 'spike', petal: '#a8c870', size: 0.6 },
  oakmoss: { form: 'moss', leafColor: '#8a9a7a' },
  marshmallow: { form: 'root', rootKind: 'gnarled', cap: '#f0e6d0', leafColor: '#8ab06a', leafKind: 'round' },
  sailorsKelp: { form: 'kelp', leafColor: '#7a7a2a' },
  foxglove: { stems: 2, leafKind: 'broad', leafColor: '#4a8a4a', flower: 'bells', petal: '#c04ab0', leaves: 3, height: 0.85, spread: 0.22, size: 1.25 },
  bogbean: { stems: 3, leafKind: 'trefoil', leafColor: '#4a9a5a', flower: 'star', petal: '#fff4f8', center: '#f0a0b8', leaves: 2 },
  glowmoss: { form: 'moss', leafColor: '#3a8a6a', petal: '#a8fff0', glow: '#5affd8' },
  stoneroot: { form: 'root', rootKind: 'pebbles', cap: '#a8a49c', leafColor: '#6a8a5a' },
  saltwort: { stems: 4, leafKind: 'needle', leafColor: '#7ab08a', stem: '#5a9a6a', flower: 'berries', petal: '#9ad0a0', leaves: 3, size: 0.6 },
  sandSage: { stems: 4, leafKind: 'lance', leafColor: '#b8c4b0', stem: '#8a9a80', flower: 'spike', petal: '#d8d0e8', leaves: 4 },
  wolfsbane: { stems: 2, leafKind: 'jagged', leafColor: '#3a6a4a', flower: 'hood', petal: '#4a3ab8', leaves: 3, height: 0.85, spread: 0.22, size: 1.25 },
  frostbloom: { stems: 1, leafKind: 'lance', leafColor: '#8ab8c8', stem: '#7aa8b8', flower: 'crystal', petal: '#d8f4ff', glow: '#a8e0ff', leaves: 3, tie: false, size: 2.86, height: 0.6 },
  eaglefern: { form: 'fronds', leafColor: '#4a8a3a' },
  desertRose: { stems: 1, leafKind: 'oval', leafColor: '#4a7a3a', flower: 'cup', petal: '#e0302a', glow: '#ff7a3a', leaves: 3, tie: false, size: 2.6, height: 0.6 },
  ghostCactus: { form: 'cactus', leafColor: '#5a9a7a', flower: 'lotus', petal: '#f8fbff', glow: '#cfe8ff' },
  moonpetal: { stems: 1, leafKind: 'oval', leafColor: '#5a7a8a', flower: 'crescent', petal: '#e8eeff', center: '#c8d8ff', glow: '#b8c8ff', leaves: 3, tie: false, size: 2.86, height: 0.6 },
  dragonbloom: { stems: 1, leafKind: 'lance', leafColor: '#4a6a3a', flower: 'flame', petal: '#ff5a1a', center: '#ffc23a', glow: '#ff7a2a', leaves: 3, tie: false, size: 3.12, height: 0.6 },
  blackLotus: { stems: 1, leafKind: 'round', leafColor: '#2a4a3a', flower: 'lotus', petal: '#3a2050', glow: '#8a3ae0', leaves: 3, tie: false, size: 3.12, height: 0.55 },
  starmoss: { form: 'moss', leafColor: '#2a3a4a', petal: '#ffffff', glow: '#6a8aff' },
  flax: { stems: 5, leafKind: 'needle', leafColor: '#7aa84a', flower: 'daisy', petal: '#6a9ae0', center: '#e8e0a0', size: 0.6, leaves: 2 },
  wheat: { form: 'sheaf', petal: '#e2b84a' },
  heartwoodSplinter: { form: 'root', rootKind: 'gnarled', cap: '#8a6a3a', leafColor: '#5ab04a', glow: '#8aff7a' },
};
