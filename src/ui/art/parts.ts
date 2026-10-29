import { shade, line, glow, sparkle, light, dark, rgba, ellipse, circle, blob, rng, poly, type G, type PathFn } from './kit';
import { drawGlyph } from './glyphs';
import { METAL } from './trinkets';

// Materials: what beasts leave behind (fangs, tusks, horns, antlers, scales,
// shells, pelts and hides, glands and gels), what the land gives (ore, coal,
// timber, glass, wool) and what crafters make of it (ingots, leather, cloth,
// runes).

export interface PartSpec {
  kind: 'fang' | 'tusk' | 'horn' | 'antler' | 'claw' | 'scale' | 'shell' | 'pelt' | 'hide' | 'leather' | 'cloth' | 'wool' | 'gourd' | 'pearl' | 'bone' | 'gel' | 'sac' | 'dust' | 'scrap' | 'glass' | 'ore' | 'ingot' | 'planks' | 'logs' | 'coal' | 'meteor' | 'rune' | 'fetish' | 'essence' | 'trophy' | 'fin' | 'bunting' | 'satchel' | 'seal' | 'wire';
  color?: string;
  accent?: string;
  glow?: string;
  glyph?: string;
  /** how many (ingots in a stack, teeth, bolts of cloth) */
  count?: number;
}

export function paintPart(g: G, p: PartSpec, seed: string) {
  const r = rng(seed);
  if (p.glow) glow(g, 64, 66, 60, p.glow, 0.65);
  const c = p.color ?? '#e8dcc0';
  switch (p.kind) {
    case 'fang':
    case 'tusk': {
      const shape = p.glyph ?? (p.kind === 'tusk' ? 'crescent' : 'slim');
      g.save();
      g.translate(64, 64);
      g.rotate(shape === 'tri' ? 0 : -0.45);
      let path: PathFn;
      if (shape === 'tri') {
        path = (q) => {
          q.moveTo(-34, 30);
          for (let k = 0; k <= 6; k++) q.lineTo(-34 + k * (34 / 6) + (k % 2 ? 2 : 0), 30 - k * (74 / 6) + (k % 2 ? -3 : 0));
          for (let k = 6; k >= 0; k--) q.lineTo(34 - k * (34 / 6) - (k % 2 ? 2 : 0), 30 - k * (74 / 6) + (k % 2 ? -3 : 0));
          q.quadraticCurveTo(0, 40, -34, 30);
          q.closePath();
        };
      } else if (shape === 'crescent') {
        path = (q) => {
          q.moveTo(-40, -30);
          q.bezierCurveTo(-4, -46, 40, -20, 42, 34);
          q.bezierCurveTo(26, 4, 0, -16, -36, -14);
          q.closePath();
        };
      } else if (shape === 'thick') {
        path = (q) => {
          q.moveTo(-22, -40);
          q.lineTo(20, -40);
          q.bezierCurveTo(26, -4, 18, 22, -6, 44);
          q.lineTo(-10, 34);
          q.lineTo(-16, 38);
          q.bezierCurveTo(-14, 10, -20, -14, -22, -40);
          q.closePath();
        };
      } else {
        const w = shape === 'long' ? 12 : 9, len = shape === 'long' ? 56 : 46;
        path = (q) => {
          q.moveTo(-w, -len * 0.8);
          q.lineTo(w, -len * 0.8);
          q.bezierCurveTo(w * 1.4, -len * 0.1, w * 0.6, len * 0.5, -w * 1.2, len);
          q.bezierCurveTo(-w * 0.2, len * 0.4, -w * 0.4, -len * 0.2, -w, -len * 0.8);
          q.closePath();
        };
      }
      shade(g, path, c, { gloss: 2, band: 4, rim: true, box: [-40, -46, 42, 46] });
      if (shape === 'slim' || shape === 'long') shade(g, ellipse(0, shape === 'long' ? -45 : -37, shape === 'long' ? 12 : 9, 4), shape === 'long' ? '#5a3a2a' : dark(c, 0.3), { band: 1 });
      if (shape === 'crescent') line(g, dark(c, 0.3), 1.2, (q) => {
        q.moveTo(-30, -28);
        q.bezierCurveTo(0, -36, 24, -16, 32, 14);
      }, 0.5);
      if (p.accent) shade(g, (q) => q.roundRect(-34, -40, 22, 18, 3), p.accent!, { gloss: 2, band: 1.5 });
      g.restore();
      return;
    }
    case 'horn': {
      shade(g, (q) => {
        q.moveTo(18, 104);
        q.bezierCurveTo(20, 50, 70, 30, 104, 16);
        q.bezierCurveTo(84, 40, 52, 70, 40, 112);
        q.closePath();
      }, c, { gloss: 2, band: 4, rim: true, box: [18, 16, 104, 112] });
      g.save();
      g.beginPath();
      g.moveTo(18, 104);
      g.bezierCurveTo(20, 50, 70, 30, 104, 16);
      g.bezierCurveTo(84, 40, 52, 70, 40, 112);
      g.closePath();
      g.clip();
      g.fillStyle = rgba(p.accent ?? '#1a1414', 0.9);
      g.beginPath();
      g.arc(104, 16, 30, 0, Math.PI * 2);
      g.fill();
      g.restore();
      line(g, dark(c, 0.25), 1.2, (q) => {
        for (let i = 0; i < 6; i++) {
          const u = 0.2 + i * 0.1;
          q.moveTo(18 + u * 30, 104 - u * 60);
          q.lineTo(30 + u * 40, 108 - u * 54);
        }
      }, 0.6);
      return;
    }
    case 'antler': {
      const stroke = (w: number, col: string) => line(g, col, w, (q) => {
        q.moveTo(40, 116);
        q.bezierCurveTo(44, 80, 60, 50, 86, 14);
        q.moveTo(48, 86);
        q.quadraticCurveTo(28, 70, 22, 46);
        q.moveTo(58, 64);
        q.quadraticCurveTo(52, 40, 54, 22);
        q.moveTo(70, 42);
        q.quadraticCurveTo(92, 40, 108, 30);
        q.moveTo(78, 28);
        q.quadraticCurveTo(70, 16, 72, 6);
      }, 1);
      stroke(13, dark(c, 0.35));
      stroke(9, c);
      stroke(3, light(c, 0.45));
      shade(g, ellipse(40, 114, 10, 6), dark(c, 0.15), { band: 1.5, gloss: 1 });
      if (p.glow) for (let i = 0; i < 4; i++) sparkle(g, 30 + r() * 70, 14 + r() * 70, 4, '#ffffff');
      return;
    }
    case 'claw': {
      shade(g, (q) => {
        q.moveTo(30, 30);
        q.bezierCurveTo(70, 20, 108, 56, 104, 112);
        q.bezierCurveTo(88, 80, 60, 64, 26, 58);
        q.closePath();
      }, c, { gloss: 2, band: 5, rim: true, box: [26, 20, 108, 112] });
      shade(g, ellipse(30, 44, 10, 15, 0.3), dark(c, 0.35), { band: 1 });
      return;
    }
    case 'scale': {
      shade(g, (q) => {
        q.moveTo(64, 14);
        q.bezierCurveTo(104, 30, 108, 80, 64, 116);
        q.bezierCurveTo(20, 80, 24, 30, 64, 14);
      }, c, { gloss: 2, band: 5, rim: true, box: [24, 14, 108, 116] });
      line(g, light(c, 0.35), 1.6, (q) => {
        for (let i = 0; i < 4; i++) {
          q.moveTo(40 + i * 3, 40 + i * 16);
          q.quadraticCurveTo(64, 50 + i * 16, 88 - i * 3, 40 + i * 16);
        }
      }, 0.6);
      if (p.accent) line(g, p.accent!, 2.4, (q) => {
        q.moveTo(56, 26);
        q.lineTo(66, 48);
        q.lineTo(56, 60);
        q.lineTo(70, 84);
      }, 0.95);
      return;
    }
    case 'shell': {
      shade(g, blob([[16, 76], [28, 40], [64, 26], [100, 40], [112, 76], [92, 102], [36, 102]]), c, { gloss: 2, band: 5, rim: true, box: [16, 26, 112, 104] });
      line(g, dark(c, 0.35), 1.6, (q) => {
        q.moveTo(28, 62);
        q.quadraticCurveTo(64, 50, 100, 62);
        q.moveTo(30, 82);
        q.quadraticCurveTo(64, 72, 98, 82);
      }, 0.7);
      for (let i = 0; i < 12; i++) shade(g, circle(30 + r() * 68, 38 + r() * 56, 2 + r() * 2.2), light(c, 0.25), { band: 0 });
      return;
    }
    case 'pelt':
    case 'hide': {
      const path = blob([[24, 30], [44, 20], [64, 26], [84, 20], [104, 30], [98, 52], [110, 74], [100, 104], [80, 98], [64, 112], [48, 98], [28, 104], [18, 74], [30, 52]]);
      shade(g, path, c, { gloss: 1, band: 5, rim: true, box: [18, 20, 110, 112] });
      g.save();
      g.beginPath();
      path(g);
      g.clip('evenodd');
      if (p.kind === 'pelt' || p.accent === 'bristle') {
        for (let i = 0; i < 160; i++) {
          const x = 18 + r() * 92, y = 20 + r() * 92;
          g.strokeStyle = rgba(r() < 0.5 ? light(c, 0.3) : dark(c, 0.3), 0.6);
          g.lineWidth = p.accent === 'bristle' ? 1.4 : 1;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 2 + r() * 3, y + 5 + r() * 4);
          g.stroke();
        }
      } else if (p.accent === 'scales') {
        for (let y = 26; y < 110; y += 8) for (let x = 20 + ((y / 8) % 2) * 5; x < 110; x += 10) {
          g.strokeStyle = rgba(dark(c, 0.35), 0.6);
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(x, y, 5, 0.2, Math.PI - 0.2);
          g.stroke();
        }
      } else {
        // Raw hide: a paler flesh side showing at a turned corner.
        shade(g, (q) => {
          q.moveTo(80, 98);
          q.lineTo(100, 104);
          q.lineTo(110, 74);
          q.quadraticCurveTo(92, 84, 80, 98);
        }, '#e8c8a8', { band: 1 });
      }
      g.restore();
      return;
    }
    case 'leather':
    case 'cloth': {
      const n = p.count ?? 1;
      for (let i = n - 1; i >= 0; i--) {
        const dx = i * -10, dy = i * -15, col = i % 2 && p.accent ? p.accent : c;
        // The unrolled length lying flat, in front.
        shade(g, (q) => {
          q.moveTo(26 + dx, 86 + dy);
          q.lineTo(104 + dx, 80 + dy);
          q.lineTo(112 + dx, 104 + dy);
          q.quadraticCurveTo(70 + dx, 112 + dy, 18 + dx, 108 + dy);
          q.closePath();
        }, light(col, 0.08), { band: 2.5, gloss: 1, box: [18 + dx, 80 + dy, 112 + dx, 112 + dy] });
        line(g, dark(col, 0.3), 1, (q) => {
          q.moveTo(36 + dx, 96 + dy);
          q.quadraticCurveTo(64 + dx, 100 + dy, 98 + dx, 94 + dy);
        }, 0.5);
        // The roll.
        shade(g, (q) => q.roundRect(20 + dx, 56 + dy, 78, 32, 15), col, { gloss: 1, band: 4, rim: true, box: [20 + dx, 56 + dy, 98 + dx, 88 + dy] });
        shade(g, ellipse(98 + dx, 72 + dy, 9, 16), dark(col, 0.12), { band: 1.5, box: [89 + dx, 56 + dy, 107 + dx, 88 + dy] });
        line(g, dark(col, 0.4), 1.1, (q) => {
          q.ellipse(98 + dx, 72 + dy, 5, 10, 0, 0, Math.PI * 2);
          q.moveTo(100 + dx, 72 + dy);
          q.ellipse(98 + dx, 72 + dy, 2, 4, 0, 0, Math.PI * 2);
        }, 0.6);
        if (p.kind === 'cloth' && p.glyph === 'weave') {
          line(g, light(col, 0.3), 0.8, (q) => {
            for (let x = 26; x < 92; x += 5) {
              q.moveTo(x + dx, 58 + dy);
              q.lineTo(x + dx, 86 + dy);
            }
          }, 0.35);
        }
        line(g, p.kind === 'leather' ? '#3a2410' : '#c8a060', 3, (q) => {
          q.moveTo(44 + dx, 55 + dy);
          q.lineTo(44 + dx, 89 + dy);
          q.moveTo(72 + dx, 55 + dy);
          q.lineTo(72 + dx, 89 + dy);
        }, 0.9);
      }
      return;
    }
    case 'wool': {
      for (let i = 0; i < 14; i++) {
        const x = 30 + r() * 68, y = 42 + r() * 54;
        shade(g, circle(x, y, 13 + r() * 7), c, { gloss: 1, band: 3, box: [x - 18, y - 18, x + 18, y + 18] });
      }
      return;
    }
    case 'gourd': {
      shade(g, blob([[54, 30], [74, 30], [76, 44], [96, 66], [92, 104], [64, 114], [36, 104], [32, 66], [52, 44]]), c, { gloss: 2, band: 5, rim: true, box: [32, 30, 96, 114] });
      shade(g, (q) => q.roundRect(54, 16, 20, 16, 3), p.accent ?? '#3a2a1a', { band: 2, gloss: 1 });
      // A drip of ink.
      shade(g, (q) => {
        q.moveTo(70, 30);
        q.quadraticCurveTo(76, 44, 72, 52);
        q.arc(71, 52, 3.4, 0, Math.PI * 2);
      }, p.glyph === 'teal' ? '#1a8a8a' : '#0a0a14', { gloss: 2, band: 0 });
      return;
    }
    case 'pearl': {
      if (!p.glow) {
        shade(g, (q) => {
          q.moveTo(16, 90);
          q.bezierCurveTo(20, 60, 60, 54, 64, 54);
          q.bezierCurveTo(68, 54, 108, 60, 112, 90);
          q.quadraticCurveTo(64, 110, 16, 90);
          q.closePath();
        }, '#b8a8a0', { band: 3, gloss: 1, box: [16, 54, 112, 110] });
        line(g, '#8a7a72', 1.4, (q) => {
          for (let i = 0; i < 6; i++) {
            q.moveTo(64, 104);
            q.lineTo(24 + i * 16, 74);
          }
        }, 0.5);
      }
      shade(g, circle(64, p.glow ? 64 : 70, p.glow ? 28 : 20), c, { gloss: 2, band: 3, hi: 0.5, box: [36, 36, 92, 92], glossAt: [54, p.glow ? 52 : 60, 12] });
      if (p.glow) {
        line(g, light(p.glow, 0.5), 1.6, (q) => {
          for (let i = 0; i < 3; i++) q.arc(64, 64, 34 + i * 7, -0.9 - i * 0.1, -0.2 + i * 0.1);
        }, 0.7);
        sparkle(g, 92, 36, 6);
      }
      return;
    }
    case 'bone': {
      shade(g, (q) => {
        q.moveTo(20, 104);
        q.bezierCurveTo(40, 70, 70, 40, 110, 16);
        q.bezierCurveTo(96, 40, 84, 50, 88, 60);
        q.bezierCurveTo(70, 70, 48, 90, 34, 112);
        q.closePath();
      }, c, { gloss: 2, band: 5, rim: true, box: [20, 16, 110, 112] });
      shade(g, ellipse(27, 108, 10, 7, -0.6), dark(c, 0.1), { band: 2, gloss: 1 });
      return;
    }
    case 'gel': {
      const path = blob([[22, 96], [28, 64], [48, 44], [80, 42], [102, 62], [108, 96], [88, 108], [42, 108]]);
      shade(g, path, c, { gloss: 2, band: 5, rim: true, hi: 0.45, box: [22, 42, 108, 108], glossAt: [48, 58, 14] });
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = rgba(light(c, 0.6), 0.7);
        g.lineWidth = 1;
        g.beginPath();
        g.arc(36 + r() * 56, 60 + r() * 40, 2 + r() * 3, 0, Math.PI * 2);
        g.stroke();
      }
      if (p.accent) shade(g, circle(66, 80, 12), p.accent!, { gloss: 2, band: 1 });
      return;
    }
    case 'sac': {
      shade(g, blob([[30, 70], [40, 40], [70, 30], [96, 46], [102, 78], [80, 106], [48, 104]]), c, { gloss: 2, band: 5, rim: true, box: [30, 30, 102, 106] });
      line(g, dark(c, 0.35), 1.6, (q) => {
        q.moveTo(44, 60);
        q.bezierCurveTo(60, 50, 64, 80, 84, 70);
        q.moveTo(52, 86);
        q.quadraticCurveTo(68, 80, 80, 92);
      }, 0.7);
      shade(g, (q) => q.roundRect(60, 22, 12, 14, 4), dark(c, 0.2), { band: 1 });
      if (p.accent) shade(g, ellipse(80, 108, 3.4, 5), p.accent!, { gloss: 2, band: 0 });
      return;
    }
    case 'dust': {
      // A small heap of powder in a cloth.
      shade(g, ellipse(64, 98, 50, 16), p.accent ?? '#d8c8a0', { band: 3, box: [14, 82, 114, 114] });
      shade(g, (q) => {
        q.moveTo(24, 98);
        q.bezierCurveTo(36, 56, 54, 40, 64, 40);
        q.bezierCurveTo(74, 40, 92, 56, 104, 98);
        q.quadraticCurveTo(64, 108, 24, 98);
        q.closePath();
      }, c, { band: 4, gloss: 1, box: [24, 40, 104, 108] });
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rgba(r() < 0.5 ? light(c, 0.4) : dark(c, 0.3), 0.7);
        g.fillRect(30 + r() * 70, 50 + r() * 50, 1.6, 1.6);
      }
      if (p.glow) for (let i = 0; i < 10; i++) sparkle(g, 34 + r() * 60, 52 + r() * 46, 2 + r() * 2.4, p.glow);
      return;
    }
    case 'scrap': {
      shade(g, poly([[18, 84], [56, 66], [76, 90], [40, 110]]), '#8a6a52', { band: 3, gloss: 1, box: [18, 66, 76, 110] });
      shade(g, poly([[44, 34], [100, 28], [108, 72], [58, 78]]), '#9a7a62', { band: 3, gloss: 1, box: [44, 28, 108, 78] });
      for (const [x, y] of [[54, 42], [96, 38], [100, 66], [62, 70]] as [number, number][]) shade(g, circle(x, y, 3.4), '#5a4a42', { gloss: 1, band: 0.6 });
      for (let i = 0; i < 24; i++) {
        g.fillStyle = rgba(r() < 0.5 ? '#b0602a' : '#6a3a1a', 0.55);
        g.beginPath();
        g.arc(24 + r() * 80, 32 + r() * 76, 1.5 + r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      shade(g, (q) => q.roundRect(78, 86, 30, 10, 4), '#7a7a80', { gloss: 2, band: 1.5 });
      return;
    }
    case 'glass': {
      shade(g, poly([[30, 104], [44, 30], [78, 18], [104, 60], [88, 108]]), c, { gloss: 2, band: 3, hi: 0.5, box: [30, 18, 104, 108] });
      line(g, light(c, 0.6), 1.6, (q) => {
        q.moveTo(44, 30);
        q.lineTo(62, 70);
        q.lineTo(78, 18);
        q.moveTo(62, 70);
        q.lineTo(88, 108);
      }, 0.6);
      sparkle(g, 56, 40, 6);
      return;
    }
    case 'ore':
    case 'coal': {
      const rock = p.kind === 'coal' ? '#2a2a30' : '#7c7a74';
      const lumps: [number, number, number][] = p.kind === 'coal' ? [[44, 80, 20], [80, 74, 22], [62, 96, 18], [60, 56, 16]] : [[64, 70, 38]];
      for (const [x, y, rr] of lumps) {
        shade(g, blob([[x - rr, y + rr * 0.3], [x - rr * 0.6, y - rr * 0.8], [x + rr * 0.3, y - rr], [x + rr, y - rr * 0.2], [x + rr * 0.7, y + rr * 0.8], [x - rr * 0.3, y + rr * 0.9]]), rock, { gloss: p.kind === 'coal' ? 2 : 1, band: 4, rim: true, box: [x - rr, y - rr, x + rr, y + rr] });
      }
      if (p.kind === 'ore') {
        for (let i = 0; i < 9; i++) {
          const x = 40 + r() * 48, y = 46 + r() * 48;
          const s = 4 + r() * 5;
          shade(g, poly([[x - s, y], [x - s * 0.3, y - s], [x + s, y - s * 0.4], [x + s * 0.6, y + s * 0.8]]), c, { gloss: 2, band: 1, box: [x - s, y - s, x + s, y + s] });
        }
      }
      return;
    }
    case 'ingot':
    case 'wire': {
      if (p.kind === 'wire') {
        for (let i = 0; i < 6; i++) {
          line(g, dark(c, 0.3), 5, (q) => q.ellipse(64, 70 - i * 4, 40, 24, 0, 0, Math.PI * 2), 1);
          line(g, light(c, 0.15), 2.4, (q) => q.ellipse(64, 70 - i * 4, 40, 24, 0, 0, Math.PI * 2), 1);
        }
        line(g, c, 3, (q) => {
          q.moveTo(100, 60);
          q.quadraticCurveTo(116, 70, 108, 94);
        }, 1);
        return;
      }
      const bar = (x: number, y: number) => shade(g, poly([[x, y], [x + 50, y - 10], [x + 60, y + 4], [x + 56, y + 20], [x + 6, y + 30], [x - 4, y + 16]]), c, { gloss: 2, band: 3, rim: true, box: [x - 4, y - 10, x + 60, y + 30] });
      bar(18, 78);
      bar(52, 72);
      bar(34, 52);
      if (p.glow) sparkle(g, 88, 50, 7);
      return;
    }
    case 'planks':
    case 'logs': {
      if (p.kind === 'planks') {
        for (let i = 0; i < 4; i++) {
          const y = 92 - i * 14, x = 16 + (i % 2) * 6;
          shade(g, poly([[x, y], [x + 86, y - 18], [x + 92, y - 10], [x + 6, y + 8]]), i % 2 ? c : light(c, 0.08), { band: 2, gloss: 1, box: [x, y - 18, x + 92, y + 8] });
          line(g, dark(c, 0.35), 0.8, (q) => {
            q.moveTo(x + 10, y - 2);
            q.quadraticCurveTo(x + 40, y - 12, x + 80, y - 14);
          }, 0.5);
        }
        return;
      }
      for (const [x, y] of [[40, 84], [74, 84], [57, 56]] as [number, number][]) {
        shade(g, (q) => q.roundRect(x - 34, y - 13, 60, 26, 12), p.accent ?? dark(c, 0.3), { band: 3, gloss: 1, box: [x - 34, y - 13, x + 26, y + 13] });
        shade(g, ellipse(x + 26, y, 11, 13), c, { band: 2, gloss: 1, box: [x + 15, y - 13, x + 37, y + 13] });
        line(g, dark(c, 0.3), 1, (q) => {
          q.ellipse(x + 26, y, 6, 7.5, 0, 0, Math.PI * 2);
          q.moveTo(x + 29, y);
          q.ellipse(x + 26, y, 3, 3.5, 0, 0, Math.PI * 2);
        }, 0.7);
      }
      return;
    }
    case 'meteor': {
      shade(g, blob([[24, 80], [30, 46], [62, 28], [96, 40], [106, 74], [84, 104], [42, 106]]), '#2a2a34', { gloss: 2, band: 5, rim: true, box: [24, 28, 106, 106] });
      for (let i = 0; i < 9; i++) shade(g, poly([[40 + r() * 50, 44 + r() * 50], [46 + r() * 50, 40 + r() * 50], [44 + r() * 50, 52 + r() * 50]]), '#d8e0ec', { gloss: 2, band: 0 });
      for (let i = 0; i < 5; i++) sparkle(g, 30 + r() * 70, 30 + r() * 70, 3 + r() * 3, '#e8f0ff');
      return;
    }
    case 'rune': {
      const glowC = p.glow ?? '#7ab8ff';
      shade(g, blob([[30, 104], [26, 50], [44, 22], [84, 20], [102, 46], [100, 100], [64, 110]]), c, { gloss: 1, band: 5, rim: true, box: [26, 20, 102, 110] });
      glow(g, 64, 64, 30, glowC, 0.85);
      drawGlyph(g, p.glyph ?? 'rune', 64, 64, 46, light(glowC, 0.55), 3);
      drawGlyph(g, p.glyph ?? 'rune', 64, 64, 46, rgba('#ffffff', 0.55), 1.4);
      return;
    }
    case 'fetish': {
      line(g, '#6a4a2a', 6, (q) => {
        q.moveTo(30, 118);
        q.lineTo(86, 12);
      }, 1);
      shade(g, blob([[52, 50], [62, 38], [80, 42], [82, 60], [70, 68], [56, 64]]), '#ece4d0', { gloss: 1, band: 2.5, rim: true, box: [52, 38, 82, 68] });
      for (const [x, y] of [[62, 52], [74, 52]] as [number, number][]) shade(g, circle(x, y, 3.4), '#1a1010', { band: 0 });
      shade(g, (q) => {
        q.moveTo(76, 40);
        q.bezierCurveTo(96, 20, 112, 24, 114, 10);
        q.bezierCurveTo(108, 34, 96, 40, 80, 46);
        q.closePath();
      }, '#c0302a', { band: 1.5, gloss: 1, box: [76, 10, 114, 46] });
      line(g, '#3a2a1a', 1.6, (q) => {
        q.moveTo(48, 80);
        q.lineTo(60, 90);
        q.moveTo(50, 74);
        q.lineTo(62, 84);
      }, 1);
      return;
    }
    case 'essence': {
      const col = p.glow ?? c;
      glow(g, 64, 64, 50, col, 0.9);
      shade(g, poly([[64, 14], [86, 52], [72, 114], [52, 92], [44, 48]]), light(col, 0.3), { gloss: 2, band: 3, hi: 0.6, box: [44, 14, 86, 114] });
      for (let i = 0; i < 6; i++) sparkle(g, 32 + r() * 64, 20 + r() * 88, 3 + r() * 3, '#ffffff');
      return;
    }
    case 'trophy': {
      shade(g, (q) => q.roundRect(26, 86, 76, 24, 4), '#6a4a2a', { gloss: 1, band: 3, box: [26, 86, 102, 110] });
      shade(g, (q) => q.roundRect(50, 92, 28, 10, 2), METAL.gold, { gloss: 2, band: 1 });
      shade(g, blob([[38, 84], [40, 50], [64, 32], [88, 50], [90, 84]]), '#ece2cc', { gloss: 1, band: 4, rim: true, box: [38, 32, 90, 86] });
      for (const [x, y] of [[54, 60], [74, 60]] as [number, number][]) shade(g, ellipse(x, y, 6, 7), '#1a1010', { band: 0 });
      for (const s of [-1, 1]) shade(g, (q) => {
        q.moveTo(64 + s * 18, 44);
        q.bezierCurveTo(64 + s * 40, 30, 64 + s * 46, 14, 64 + s * 38, 6);
        q.bezierCurveTo(64 + s * 34, 24, 64 + s * 24, 32, 64 + s * 14, 38);
        q.closePath();
      }, '#d8c8a0', { gloss: 1, band: 2, box: [64 - 46, 6, 64 + 46, 44] });
      return;
    }
    case 'fin': {
      shade(g, (q) => {
        q.moveTo(18, 108);
        q.bezierCurveTo(40, 76, 60, 30, 80, 14);
        q.bezierCurveTo(84, 50, 96, 84, 112, 108);
        q.closePath();
      }, c, { gloss: 2, band: 5, rim: true, box: [18, 14, 112, 108] });
      shade(g, (q) => {
        q.moveTo(18, 108);
        q.quadraticCurveTo(64, 98, 112, 108);
        q.lineTo(112, 112);
        q.quadraticCurveTo(64, 104, 18, 112);
        q.closePath();
      }, '#e8d0c0', { band: 1 });
      return;
    }
    case 'bunting': {
      line(g, '#6a4a2a', 2, (q) => {
        q.moveTo(10, 30);
        q.quadraticCurveTo(64, 70, 118, 30);
      }, 1);
      const cols = ['#c0302a', '#e8c03a', '#2a6ad0', '#3a9a4a', '#e8c03a', '#c0302a'];
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6, x = 10 + u * 108, y = 30 + Math.sin(u * Math.PI) * 30;
        shade(g, poly([[x - 9, y], [x + 9, y], [x, y + 28]]), cols[i], { band: 1.5, gloss: 1, box: [x - 9, y, x + 9, y + 28] });
      }
      return;
    }
    case 'satchel': {
      const col = c;
      line(g, dark(col, 0.3), 5, (q) => {
        q.moveTo(30, 52);
        q.quadraticCurveTo(64, -6, 98, 52);
      }, 1);
      shade(g, (q) => q.roundRect(22, 46, 84, 64, 10), col, { gloss: 1, band: 5, rim: true, box: [22, 46, 106, 110] });
      shade(g, (q) => {
        q.moveTo(22, 52);
        q.quadraticCurveTo(64, 92, 106, 52);
        q.lineTo(106, 48);
        q.lineTo(22, 48);
        q.closePath();
      }, dark(col, 0.15), { band: 2, box: [22, 46, 106, 90] });
      shade(g, (q) => q.roundRect(58, 72, 12, 10, 2), METAL.brass, { gloss: 2, band: 1 });
      // Vials poking out.
      for (let i = 0; i < 3; i++) shade(g, (q) => q.roundRect(36 + i * 10, 30, 7, 20, 3), ['#e05a5a', '#5aa0e0', '#7ac05a'][i], { gloss: 2, band: 1 });
      shade(g, ellipse(92, 40, 10, 6), '#9aa0a8', { gloss: 2, band: 1.5 });
      return;
    }
    case 'seal': {
      shade(g, circle(64, 70, 38), c, { gloss: 2, band: 5, rim: true, box: [26, 32, 102, 108] });
      shade(g, circle(64, 70, 28), dark(c, 0.12), { band: 2, box: [36, 42, 92, 98] });
      drawGlyph(g, p.glyph ?? 'wheel', 64, 70, 40, dark(c, 0.5), 2.6);
      shade(g, (q) => q.roundRect(54, 18, 20, 18, 5), '#6a4a2a', { gloss: 1, band: 2 });
      return;
    }
  }
}

export const PARTS: Record<string, PartSpec> = {
  // teeth, tusks, horns, antlers, claws
  wolfFang: { kind: 'fang', color: '#efe6cc', glyph: 'slim' },
  direFang: { kind: 'fang', color: '#e8dcb0', glyph: 'long' },
  sharkTooth: { kind: 'fang', color: '#f4f0e4', glyph: 'tri' },
  boarTusk: { kind: 'tusk', color: '#e8d8a8' },
  warBoarTusk: { kind: 'tusk', color: '#e0cc98', accent: '#7a7a80' },
  orcTusk: { kind: 'tusk', color: '#d8c890', glyph: 'thick' },
  aurochsHorn: { kind: 'horn', color: '#d8c8a8', accent: '#1a1414' },
  stagAntler: { kind: 'antler', color: '#c8a87a' },
  whiteAntler: { kind: 'antler', color: '#f4f4f8', glow: '#cfe8ff' },
  delverClaw: { kind: 'claw', color: '#5a5048' },
  leviathanBone: { kind: 'bone', color: '#e8e4d8', glow: '#a8d8ff' },
  // scales, shells and fins
  wyrmScale: { kind: 'scale', color: '#5a7a9a', accent: '#bfe8ff', glow: '#8ad0ff' },
  serpentScale: { kind: 'scale', color: '#2a4a3a' },
  colossusShell: { kind: 'shell', color: '#c03a2a' },
  crabShell: { kind: 'shell', color: '#c8964a' },
  sharkFin: { kind: 'fin', color: '#7a8490' },
  // pelts, hides and leather
  wolfPelt: { kind: 'pelt', color: '#8a8a90' },
  rawHide: { kind: 'hide', color: '#9a6a44' },
  boarHide: { kind: 'hide', color: '#6a4a32', accent: 'bristle' },
  drakeHide: { kind: 'hide', color: '#5a7a3a', accent: 'scales' },
  leather: { kind: 'leather', color: '#8a5a32' },
  hardenedLeather: { kind: 'leather', color: '#6a4224', count: 2 },
  drakeLeather: { kind: 'leather', color: '#4a6a3a', count: 2 },
  // cloth and fibre
  wool: { kind: 'wool', color: '#f2ece0' },
  woolCloth: { kind: 'cloth', color: '#b0a088', glyph: 'weave' },
  linen: { kind: 'cloth', color: '#e8e0c8', glyph: 'weave', count: 2 },
  silk: { kind: 'cloth', color: '#c0306a', accent: '#e8c03a', count: 2 },
  sunSilk: { kind: 'cloth', color: '#2a9a8a', accent: '#e8c03a', count: 2 },
  valorianSilk: { kind: 'cloth', color: '#6a2a6a', accent: '#d9a83a', count: 3 },
  // glands, gels, inks, dusts
  krakenInk: { kind: 'gourd', color: '#2a2a3a', accent: '#1a1010' },
  rayInk: { kind: 'gourd', color: '#2a7a7a', accent: '#1a3a3a', glyph: 'teal' },
  slimeGel: { kind: 'gel', color: '#6ad06a' },
  slimeJelly: { kind: 'gel', color: '#8ae05a', accent: '#c8ff7a' },
  jellyCore: { kind: 'gel', color: '#e8a0ff', accent: '#ffe86a', glow: '#ff9aff' },
  murkySludge: { kind: 'gel', color: '#6a6a4a' },
  venomSac: { kind: 'sac', color: '#7a9a3a', accent: '#c8f04a' },
  eelGland: { kind: 'sac', color: '#a87a6a' },
  boneDust: { kind: 'dust', color: '#c8c4bc', accent: '#6a6a70', glow: '#bfe0ff' },
  emberAsh: { kind: 'dust', color: '#5a4a44', accent: '#3a3030', glow: '#ff8a3a' },
  // pearls, glass, crystals, essences
  pearl: { kind: 'pearl', color: '#f4eee8' },
  sirenPearl: { kind: 'pearl', color: '#e8e0ff', glow: '#b8a8ff' },
  duneGlass: { kind: 'glass', color: '#6ac08a' },
  wispEssence: { kind: 'essence', glow: '#6ac8ff' },
  starmetal: { kind: 'meteor' },
  // ore, coal, metal, wood
  ironOre: { kind: 'ore', color: '#c0683a' },
  copperOre: { kind: 'ore', color: '#3aa08a' },
  silverOre: { kind: 'ore', color: '#e8eef2' },
  coal: { kind: 'coal' },
  ironIngot: { kind: 'ingot', color: '#8a8e96' },
  steelIngot: { kind: 'ingot', color: '#b8c4d0' },
  silversteelIngot: { kind: 'ingot', color: '#dce8f4', glow: '#cfe4ff' },
  copperIngot: { kind: 'wire', color: '#d0783a' },
  scrapMetal: { kind: 'scrap' },
  planks: { kind: 'planks', color: '#c8964a' },
  ashWood: { kind: 'logs', color: '#e2d6b8', accent: '#8a8a80' },
  yewWood: { kind: 'logs', color: '#c8704a', accent: '#5a3428' },
  // runes
  runeEmber: { kind: 'rune', color: '#7a7470', glow: '#ff8a3a', glyph: 'flame' },
  runeRime: { kind: 'rune', color: '#7a8088', glow: '#8ad8ff', glyph: 'flake' },
  runeAnvil: { kind: 'rune', color: '#6a6660', glow: '#ffc84a', glyph: 'hammer' },
  runeSwift: { kind: 'rune', color: '#7a8478', glow: '#8aff9a', glyph: 'wing' },
  runeWarding: { kind: 'rune', color: '#7a7a84', glow: '#a8b8ff', glyph: 'shield' },
  runeReturning: { kind: 'rune', color: '#74706a', glow: '#e8c8ff', glyph: 'rune' },
  // odds and ends
  goblinFetish: { kind: 'fetish' },
  championTrophy: { kind: 'trophy' },
  bunting: { kind: 'bunting' },
  herbalistSatchel: { kind: 'satchel', color: '#7a5a32' },
  sunSeal: { kind: 'seal', color: '#e0ac34', glyph: 'sun' },
};

export { blob };
export type { PathFn };
