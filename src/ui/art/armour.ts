import { shade, line, glow, sparkle, light, dark, rgba, ellipse, circle, blob, rng, type G, type PathFn } from './kit';
import { drawGlyph } from './glyphs';
import { METAL } from './trinkets';

// Armour and shields, painted: helms, pauldrons, cuirasses, gauntlets, greaves
// and sabatons in steel; jerkins, bracers and boots in leather; quilted and
// scaled coats; and shields of every shape with their own faces.

export interface ArmourSpec {
  kind: 'helm' | 'pauldrons' | 'cuirass' | 'gauntlets' | 'greaves' | 'sabatons' | 'jerkin' | 'bracers' | 'boots' | 'gambeson' | 'brigandine' | 'scaled' | 'pelt' | 'antlerCrown' | 'shield';
  color?: string;
  accent?: string;
  shape?: 'round' | 'heater' | 'tower' | 'buckler' | 'shell' | 'carapace' | 'heartwood';
  face?: 'planks' | 'quartered' | 'chevron' | 'sun' | 'none';
  glow?: string;
}

const STEEL = '#b8c2cc';

export function paintArmour(g: G, a: ArmourSpec, seed: string) {
  const r = rng(seed);
  if (a.glow) glow(g, 64, 64, 60, a.glow, 0.55);
  const c = a.color ?? STEEL;
  switch (a.kind) {
    case 'helm': {
      shade(g, (q) => {
        q.moveTo(26, 92);
        q.bezierCurveTo(24, 50, 44, 18, 64, 12);
        q.bezierCurveTo(84, 18, 104, 50, 102, 92);
        q.quadraticCurveTo(64, 100, 26, 92);
        q.closePath();
      }, c, { gloss: 2, band: 6, rim: true, box: [24, 12, 104, 100] });
      // Brow band with rivets, and the nasal.
      shade(g, (q) => {
        q.moveTo(24, 80);
        q.quadraticCurveTo(64, 70, 104, 80);
        q.lineTo(104, 92);
        q.quadraticCurveTo(64, 82, 24, 92);
        q.closePath();
      }, dark(c, 0.1), { gloss: 1, band: 2, box: [24, 70, 104, 92] });
      for (let i = 0; i < 7; i++) shade(g, circle(30 + i * 11.3, 82 - Math.sin((i / 6) * Math.PI) * 5, 2.2), light(c, 0.3), { band: 0, gloss: 2 });
      shade(g, (q) => q.roundRect(58, 76, 12, 40, 4), c, { gloss: 2, band: 2, rim: true, box: [58, 76, 70, 116] });
      line(g, light(c, 0.5), 2, (q) => {
        q.moveTo(64, 16);
        q.quadraticCurveTo(60, 44, 62, 72);
      }, 0.6);
      return;
    }
    case 'pauldrons': {
      for (const s of [-1, 1]) {
        const cx = 64 + s * 26;
        for (let k = 2; k >= 0; k--) {
          shade(g, (q) => {
            q.moveTo(cx - 22, 44 + k * 16);
            q.bezierCurveTo(cx - 20, 22 + k * 16, cx + 20, 22 + k * 16, cx + 22, 44 + k * 16);
            q.quadraticCurveTo(cx, 54 + k * 16, cx - 22, 44 + k * 16);
            q.closePath();
          }, k ? dark(c, 0.06 * k) : c, { gloss: 2, band: 3, rim: true, box: [cx - 22, 22 + k * 16, cx + 22, 54 + k * 16] });
        }
        shade(g, circle(cx, 36, 3), light(c, 0.3), { gloss: 2, band: 0 });
      }
      return;
    }
    case 'cuirass': {
      shade(g, (q) => {
        q.moveTo(30, 22);
        q.quadraticCurveTo(64, 30, 98, 22);
        q.lineTo(108, 40);
        q.quadraticCurveTo(98, 52, 98, 70);
        q.bezierCurveTo(98, 96, 84, 112, 64, 116);
        q.bezierCurveTo(44, 112, 30, 96, 30, 70);
        q.quadraticCurveTo(30, 52, 20, 40);
        q.closePath();
      }, c, { gloss: 2, band: 6, rim: true, box: [20, 22, 108, 116] });
      line(g, light(c, 0.55), 2.4, (q) => {
        q.moveTo(64, 32);
        q.lineTo(64, 110);
      }, 0.7);
      line(g, dark(c, 0.35), 1.6, (q) => {
        q.moveTo(36, 92);
        q.quadraticCurveTo(64, 100, 92, 92);
        q.moveTo(30, 30);
        q.quadraticCurveTo(46, 44, 40, 60);
        q.moveTo(98, 30);
        q.quadraticCurveTo(82, 44, 88, 60);
      }, 0.7);
      for (const [x, y] of [[36, 32], [92, 32], [40, 96], [88, 96]] as [number, number][]) shade(g, circle(x, y, 2.4), light(c, 0.3), { band: 0, gloss: 2 });
      return;
    }
    case 'gauntlets':
    case 'bracers': {
      const leather = a.kind === 'bracers';
      for (const [dx, rot] of [[-16, -0.18], [16, 0.18]] as [number, number][]) {
        g.save();
        g.translate(64 + dx, 66);
        g.rotate(rot);
        if (leather) {
          shade(g, (q) => {
            q.moveTo(-16, -40);
            q.lineTo(16, -40);
            q.lineTo(13, 40);
            q.lineTo(-13, 40);
            q.closePath();
          }, c, { gloss: 1, band: 3, rim: true, box: [-16, -40, 16, 40] });
          line(g, '#e8d8b0', 1.6, (q) => {
            for (let i = 0; i < 5; i++) {
              q.moveTo(-6, -30 + i * 14);
              q.lineTo(6, -24 + i * 14);
              q.moveTo(6, -30 + i * 14);
              q.lineTo(-6, -24 + i * 14);
            }
          }, 0.9);
        } else {
          // Cuff, plates over the back of the hand, and fingers.
          shade(g, (q) => q.roundRect(-17, -42, 34, 40, 8), c, { gloss: 2, band: 3, rim: true, box: [-17, -42, 17, -2] });
          for (let k = 0; k < 3; k++) shade(g, (q) => q.roundRect(-15, -2 + k * 11, 30, 13, 5), k % 2 ? dark(c, 0.08) : c, { gloss: 2, band: 2, box: [-15, -2 + k * 11, 15, 11 + k * 11] });
          for (let f = 0; f < 4; f++) shade(g, (q) => q.roundRect(-14 + f * 7.4, 30, 6.4, 16 - Math.abs(f - 1.5) * 2, 3), c, { gloss: 1, band: 1, box: [-14 + f * 7.4, 30, -8 + f * 7.4, 46] });
        }
        g.restore();
      }
      return;
    }
    case 'greaves': {
      for (const [dx, rot] of [[-16, -0.08], [16, 0.08]] as [number, number][]) {
        g.save();
        g.translate(64 + dx, 64);
        g.rotate(rot);
        shade(g, (q) => {
          q.moveTo(-14, -52);
          q.lineTo(14, -52);
          q.quadraticCurveTo(18, -10, 12, 50);
          q.lineTo(-12, 50);
          q.quadraticCurveTo(-18, -10, -14, -52);
          q.closePath();
        }, c, { gloss: 2, band: 3, rim: true, box: [-18, -52, 18, 50] });
        shade(g, ellipse(0, -14, 13, 11), light(c, 0.1), { gloss: 2, band: 2, rim: true, box: [-13, -25, 13, -3] });
        line(g, light(c, 0.5), 1.6, (q) => {
          q.moveTo(0, 0);
          q.lineTo(0, 46);
        }, 0.6);
        g.restore();
      }
      return;
    }
    case 'sabatons':
    case 'boots': {
      const leather = a.kind === 'boots';
      for (const [dx, dy] of [[-12, -6], [12, 6]] as [number, number][]) {
        g.save();
        g.translate(56 + dx, 60 + dy);
        shade(g, (q) => {
          q.moveTo(-14, -40);
          q.lineTo(12, -40);
          q.lineTo(12, 10);
          q.bezierCurveTo(28, 12, 42, 18, 42, 30);
          q.lineTo(42, 36);
          q.lineTo(-16, 36);
          q.closePath();
        }, c, { gloss: leather ? 1 : 2, band: 4, rim: true, box: [-16, -40, 42, 36] });
        if (leather) {
          shade(g, (q) => q.roundRect(-18, -44, 34, 12, 4), dark(c, 0.15), { band: 2, box: [-18, -44, 16, -32] });
          shade(g, (q) => q.roundRect(-17, 32, 61, 7, 3), '#3a2614', { band: 1 });
        } else {
          line(g, dark(c, 0.35), 1.6, (q) => {
            for (let k = 0; k < 3; k++) {
              q.moveTo(10 + k * 9, 14 + k * 3);
              q.quadraticCurveTo(16 + k * 9, 24, 12 + k * 9, 34);
            }
          }, 0.8);
        }
        g.restore();
      }
      return;
    }
    case 'jerkin':
    case 'gambeson':
    case 'brigandine':
    case 'scaled': {
      const body: PathFn = (q) => {
        q.moveTo(40, 18);
        q.quadraticCurveTo(64, 30, 88, 18);
        q.lineTo(112, 36);
        q.lineTo(102, 56);
        q.lineTo(92, 50);
        q.lineTo(94, 114);
        q.lineTo(34, 114);
        q.lineTo(36, 50);
        q.lineTo(26, 56);
        q.lineTo(16, 36);
        q.closePath();
      };
      shade(g, body, c, { gloss: 1, band: 5, rim: true, box: [16, 18, 112, 114] });
      g.save();
      g.beginPath();
      body(g);
      g.clip();
      if (a.kind === 'gambeson') {
        g.strokeStyle = rgba(dark(c, 0.3), 0.7);
        g.lineWidth = 1.2;
        for (let i = -6; i < 12; i++) {
          g.beginPath();
          g.moveTo(10 + i * 10, 10);
          g.lineTo(10 + i * 10 + 60, 120);
          g.moveTo(10 + i * 10 + 60, 10);
          g.lineTo(10 + i * 10, 120);
          g.stroke();
        }
      } else if (a.kind === 'brigandine') {
        for (let y = 40; y < 112; y += 12) for (let x = 40; x < 92; x += 11) shade(g, circle(x + ((y / 12) % 2) * 5, y, 2.2), light(STEEL, 0.2), { band: 0, gloss: 2 });
      } else if (a.kind === 'scaled') {
        for (let y = 30; y < 118; y += 8) {
          for (let x = 30 + ((y / 8) % 2) * 5; x < 100; x += 10) {
            g.fillStyle = rgba(light(c, 0.15), 0.9);
            g.strokeStyle = rgba(dark(c, 0.4), 0.8);
            g.lineWidth = 1;
            g.beginPath();
            g.arc(x, y, 5.4, 0, Math.PI);
            g.fill();
            g.stroke();
          }
        }
      } else {
        // Laces down the front and stitching.
        line(g, '#e8d8b0', 1.6, (q) => {
          for (let i = 0; i < 6; i++) {
            q.moveTo(58, 40 + i * 11);
            q.lineTo(70, 46 + i * 11);
            q.moveTo(70, 40 + i * 11);
            q.lineTo(58, 46 + i * 11);
          }
        }, 0.9);
      }
      g.restore();
      // Collar and hem.
      shade(g, (q) => {
        q.moveTo(40, 18);
        q.quadraticCurveTo(64, 30, 88, 18);
        q.quadraticCurveTo(64, 40, 40, 18);
        q.closePath();
      }, dark(c, 0.3), { band: 1 });
      shade(g, (q) => q.roundRect(34, 106, 60, 8, 2), a.accent ?? dark(c, 0.15), { band: 1.5, box: [34, 106, 94, 114] });
      return;
    }
    case 'pelt': {
      // A silver wolf pelt worn as a cloak: the head over the shoulders.
      const fur = c;
      shade(g, blob([[20, 50], [36, 30], [64, 34], [92, 30], [108, 50], [112, 92], [96, 116], [64, 106], [32, 116], [16, 92]]), fur, { gloss: 1, band: 6, rim: true, box: [16, 30, 112, 116] });
      for (let i = 0; i < 140; i++) {
        const x = 20 + r() * 88, y = 34 + r() * 80;
        line(g, r() < 0.5 ? light(fur, 0.35) : dark(fur, 0.3), 1.2, (q) => {
          q.moveTo(x, y);
          q.lineTo(x + 1 + r() * 2, y + 5 + r() * 4);
        }, 0.5);
      }
      shade(g, (q) => {
        q.moveTo(40, 40);
        q.lineTo(46, 8);
        q.lineTo(56, 24);
        q.lineTo(72, 24);
        q.lineTo(82, 8);
        q.lineTo(88, 40);
        q.quadraticCurveTo(64, 62, 40, 40);
        q.closePath();
      }, light(fur, 0.12), { gloss: 1, band: 3, rim: true, box: [40, 8, 88, 56] });
      for (const x of [55, 73]) shade(g, ellipse(x, 36, 3.4, 2.2), '#e8f0ff', { gloss: 2, band: 0 });
      return;
    }
    case 'antlerCrown': {
      const metal = METAL.silver, bone = '#efe8dc';
      for (const s of [-1, 1]) {
        const stroke = (w: number, col: string) => line(g, col, w, (q) => {
          q.moveTo(64 + s * 18, 70);
          q.bezierCurveTo(64 + s * 30, 40, 64 + s * 40, 24, 64 + s * 52, 10);
          q.moveTo(64 + s * 30, 44);
          q.lineTo(64 + s * 22, 22);
          q.moveTo(64 + s * 40, 28);
          q.lineTo(64 + s * 56, 30);
        }, 1);
        stroke(10, dark(bone, 0.35));
        stroke(7, bone);
        stroke(2, '#ffffff');
      }
      shade(g, (q) => {
        q.moveTo(26, 64);
        q.quadraticCurveTo(64, 54, 102, 64);
        q.lineTo(100, 96);
        q.quadraticCurveTo(64, 108, 28, 96);
        q.closePath();
      }, metal, { gloss: 2, band: 4, rim: true, box: [26, 54, 102, 108] });
      for (let i = 0; i < 3; i++) shade(g, circle(44 + i * 20, 80, i === 1 ? 6 : 4), '#5ac88a', { gloss: 2, band: 1 });
      sparkle(g, 92, 20, 5);
      return;
    }
    case 'shield': return shield(g, a, r);
  }
}

function shield(g: G, a: ArmourSpec, r: () => number) {
  const c = a.color ?? '#a8784a';
  const rim = a.accent ?? METAL.iron;
  const shape = a.shape ?? 'round';
  let path: PathFn;
  let box: [number, number, number, number];
  if (shape === 'heater' || shape === 'tower') {
    const w = shape === 'tower' ? 34 : 40, top = shape === 'tower' ? 8 : 16;
    path = (q) => {
      q.moveTo(64 - w, top);
      q.quadraticCurveTo(64, top - 6, 64 + w, top);
      q.lineTo(64 + w, shape === 'tower' ? 84 : 62);
      q.bezierCurveTo(64 + w, shape === 'tower' ? 104 : 94, 80, 112, 64, 120);
      q.bezierCurveTo(48, 112, 64 - w, shape === 'tower' ? 104 : 94, 64 - w, shape === 'tower' ? 84 : 62);
      q.closePath();
    };
    box = [64 - w, top - 6, 64 + w, 120];
  } else if (shape === 'buckler') {
    path = circle(64, 64, 36);
    box = [28, 28, 100, 100];
  } else if (shape === 'shell' || shape === 'carapace') {
    path = blob([[18, 64], [26, 30], [64, 16], [102, 30], [110, 64], [96, 100], [64, 114], [32, 100]]);
    box = [18, 16, 110, 114];
  } else {
    path = circle(64, 64, 52);
    box = [12, 12, 116, 116];
  }
  // Rim then face.
  shade(g, path, rim, { gloss: 2, band: 4, rim: true, box });
  g.save();
  g.translate(64, 64);
  g.scale(0.88, 0.88);
  g.translate(-64, -64);
  shade(g, path, c, { gloss: 1, band: 4, box });
  g.save();
  g.beginPath();
  path(g);
  g.clip();
  const face = a.face ?? 'none';
  if (face === 'planks') {
    line(g, dark(c, 0.4), 1.4, (q) => {
      for (let x = box[0] + 12; x < box[2]; x += 14) {
        q.moveTo(x, box[1]);
        q.lineTo(x + 2, box[3]);
      }
    }, 0.7);
  } else if (face === 'quartered') {
    g.fillStyle = a.glow ?? '#f0e6d0';
    g.fillRect(64, 0, 64, 64);
    g.fillRect(0, 64, 64, 64);
  } else if (face === 'chevron') {
    g.fillStyle = '#e8c03a';
    g.beginPath();
    g.moveTo(box[0], 86);
    g.lineTo(64, 52);
    g.lineTo(box[2], 86);
    g.lineTo(box[2], 102);
    g.lineTo(64, 68);
    g.lineTo(box[0], 102);
    g.closePath();
    g.fill();
    for (const [x, y] of [[48, 32], [64, 30], [80, 32]] as [number, number][]) shade(g, circle(x, y, 4.2), '#e8c03a', { gloss: 1, band: 0.8 });
  } else if (face === 'sun') {
    drawGlyph(g, 'sun', 64, 64, 70, '#e8c03a', 3);
  }
  if (shape === 'shell') {
    for (let i = 0; i < 9; i++) shade(g, circle(28 + r() * 72, 28 + r() * 72, 3 + r() * 3.4), '#e8e0d0', { band: 1, gloss: 1 });
    line(g, dark(c, 0.35), 2, (q) => {
      q.moveTo(26, 56);
      q.quadraticCurveTo(64, 44, 102, 56);
      q.moveTo(30, 82);
      q.quadraticCurveTo(64, 72, 98, 82);
    }, 0.7);
  }
  if (shape === 'carapace') {
    line(g, dark(c, 0.4), 2.4, (q) => {
      q.moveTo(64, 16);
      q.lineTo(64, 114);
      q.moveTo(22, 60);
      q.quadraticCurveTo(64, 50, 106, 60);
    }, 0.7);
  }
  if (shape === 'heartwood') {
    line(g, '#7aff6a', 2, (q) => {
      for (let i = 0; i < 5; i++) {
        const a0 = (i / 5) * Math.PI * 2;
        q.moveTo(64, 64);
        q.bezierCurveTo(64 + Math.cos(a0) * 20, 64 + Math.sin(a0 + 0.6) * 20, 64 + Math.cos(a0 + 0.3) * 34, 64 + Math.sin(a0) * 34, 64 + Math.cos(a0 + 0.2) * 48, 64 + Math.sin(a0 + 0.2) * 48);
      }
    }, 0.85);
  }
  g.restore();
  g.restore();
  // Boss.
  if (shape !== 'heater' && shape !== 'tower' && shape !== 'shell') {
    shade(g, circle(64, 64, shape === 'buckler' ? 14 : 13), shape === 'carapace' ? METAL.gold : METAL.iron, { gloss: 2, band: 2, rim: true, box: [50, 50, 78, 78] });
    if (shape === 'buckler') {
      shade(g, (q) => {
        q.moveTo(58, 64);
        q.lineTo(64, 34);
        q.lineTo(70, 64);
        q.closePath();
      }, METAL.silver, { gloss: 2, band: 1, box: [58, 34, 70, 64] });
    }
  }
  if (a.glow && shape === 'heartwood') sparkle(g, 92, 30, 5, '#d8ffd0');
}

export const ARMOURS: Record<string, ArmourSpec> = {
  ironHelm: { kind: 'helm', color: '#a8b2bc' },
  pauldrons: { kind: 'pauldrons', color: '#b8c2cc' },
  breastplate: { kind: 'cuirass', color: '#c4ccd6' },
  gauntlets: { kind: 'gauntlets', color: '#b0bac4' },
  greaves: { kind: 'greaves', color: '#b8c2cc' },
  sabatons: { kind: 'sabatons', color: '#aab4be' },
  leatherJerkin: { kind: 'jerkin', color: '#8a5a32' },
  leatherBracers: { kind: 'bracers', color: '#8a5a32' },
  leatherBoots: { kind: 'boots', color: '#7a4e2c' },
  linenGambeson: { kind: 'gambeson', color: '#e2d8c0' },
  brigandine: { kind: 'brigandine', color: '#6a3a24' },
  drakeleatherJerkin: { kind: 'scaled', color: '#4a6a3a' },
  greymanePelt: { kind: 'pelt', color: '#a8acb4', glow: '#cfe0ff' },
  antlerCrown: { kind: 'antlerCrown', glow: '#bfffd0' },
  roundShield: { kind: 'shield', shape: 'round', color: '#b8303a', face: 'quartered', glow: '#f0e6d0' },
  buckler: { kind: 'shield', shape: 'buckler', color: '#9aa4ae', accent: METAL.iron },
  kiteShield: { kind: 'shield', shape: 'heater', color: '#2a5ab0', face: 'chevron', accent: METAL.silver },
  towerShield: { kind: 'shield', shape: 'tower', color: '#9a6a3a', face: 'planks', accent: METAL.iron },
  sunGuardShield: { kind: 'shield', shape: 'round', color: '#2a9a8a', face: 'sun', accent: METAL.gold },
  brineMawShell: { kind: 'shield', shape: 'shell', color: '#d04a2a', accent: '#7a3a24' },
  carapaceShield: { kind: 'shield', shape: 'carapace', color: '#d8a04a', accent: '#8a5a2a' },
  heartwoodShield: { kind: 'shield', shape: 'heartwood', color: '#7a5a34', accent: '#4a3a24', glow: '#8aff7a' },
};
