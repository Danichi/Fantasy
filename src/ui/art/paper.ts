import { shade, line, glow, light, dark, rgba, ellipse, circle, rng, type G } from './kit';
import { drawGlyph } from './glyphs';

// Books, letters, scrolls, pages, ledgers, rubbings and tablets.

export interface PaperSpec {
  kind: 'book' | 'letter' | 'scroll' | 'page' | 'ledger' | 'rubbing' | 'tablet' | 'map';
  /** cover / ribbon / wax colour */
  color?: string;
  /** emblem on a cover or seal */
  glyph?: string;
  /** a second colour (book corners, ribbon) */
  accent?: string;
  /** torn, stained, waterlogged */
  worn?: boolean;
  glow?: string;
}

const PARCH = '#efe0b8';

export function paintPaper(g: G, p: PaperSpec, seed: string) {
  const r = rng(seed);
  if (p.glow) glow(g, 64, 64, 60, p.glow, 0.55);
  switch (p.kind) {
    case 'book':
    case 'ledger': return book(g, p, r);
    case 'letter': return letter(g, p);
    case 'scroll': return scroll(g, p, r);
    case 'page':
    case 'rubbing':
    case 'map': return page(g, p, r);
    case 'tablet': return tablet(g, p, r);
  }
}

function book(g: G, p: PaperSpec, r: () => number) {
  const c = p.color ?? '#7a2a1e';
  const corner = p.accent ?? '#d9a83a';
  // A closed book in three-quarter view: cover, page block, spine.
  const cover = (q: G) => {
    q.moveTo(28, 26);
    q.lineTo(92, 18);
    q.lineTo(104, 92);
    q.lineTo(40, 104);
    q.closePath();
  };
  // Pages (the block under the cover, seen at the fore-edge and bottom).
  shade(g, (q) => {
    q.moveTo(40, 104);
    q.lineTo(104, 92);
    q.lineTo(106, 100);
    q.lineTo(42, 113);
    q.closePath();
  }, '#f2e6c8', { band: 1.5, box: [40, 92, 106, 113] });
  line(g, '#b8a478', 0.7, (q) => {
    for (let i = 0; i < 4; i++) {
      q.moveTo(42, 106 + i * 1.8);
      q.lineTo(105, 94 + i * 1.8);
    }
  }, 0.8);
  // Spine.
  shade(g, (q) => {
    q.moveTo(28, 26);
    q.lineTo(40, 104);
    q.lineTo(42, 113);
    q.quadraticCurveTo(28, 110, 24, 98);
    q.lineTo(18, 32);
    q.quadraticCurveTo(20, 26, 28, 26);
    q.closePath();
  }, dark(c, 0.25), { band: 2, box: [18, 26, 42, 113] });
  line(g, corner, 2, (q) => {
    q.moveTo(19, 44);
    q.lineTo(29, 42);
    q.moveTo(21, 90);
    q.lineTo(33, 88);
  }, 0.9);
  shade(g, cover, c, { gloss: 1, band: 4, rim: true, box: [28, 18, 104, 104] });
  // Tooled border and an emblem plate.
  line(g, light(c, 0.35), 1.2, (q) => {
    q.moveTo(34, 31);
    q.lineTo(88, 24);
    q.lineTo(98, 87);
    q.lineTo(44, 98);
    q.closePath();
  }, 0.7);
  // Metal corners.
  for (const [x, y, a] of [[92, 18, 2.4], [104, 92, 4], [28, 26, 0.9]] as [number, number, number][]) {
    shade(g, (q) => {
      q.moveTo(x, y);
      q.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      q.lineTo(x + Math.cos(a + 1.2) * 12, y + Math.sin(a + 1.2) * 12);
      q.closePath();
    }, corner, { gloss: 2, band: 1, box: [x - 12, y - 12, x + 12, y + 12] });
  }
  if (p.glyph) {
    shade(g, (q) => q.ellipse(65, 61, 18, 20, -0.12, 0, Math.PI * 2), dark(c, 0.3), { band: 1.5, box: [47, 41, 83, 81] });
    drawGlyph(g, p.glyph, 65, 61, 24, corner, 2.4);
  }
  if (p.kind === 'ledger') {
    // A strap and buckle.
    shade(g, (q) => {
      q.moveTo(76, 21);
      q.lineTo(88, 19.5);
      q.lineTo(102, 98);
      q.lineTo(90, 100);
      q.closePath();
    }, '#5a3a20', { band: 1.5, box: [76, 19, 102, 100] });
    shade(g, (q) => q.roundRect(88, 58, 14, 12, 2), corner, { gloss: 2, band: 1 });
  } else {
    // A cloth bookmark.
    shade(g, (q) => {
      q.moveTo(70, 100);
      q.lineTo(76, 99);
      q.lineTo(78, 118);
      q.lineTo(74, 114);
      q.lineTo(70, 118);
      q.closePath();
    }, p.accent && p.accent !== corner ? p.accent : '#c0303a', { band: 1, box: [70, 99, 78, 118] });
  }
  if (p.worn) {
    g.save();
    g.beginPath();
    cover(g);
    g.clip();
    g.translate(66, 60);
    stains(g, r);
    g.restore();
  }
}

function letter(g: G, p: PaperSpec) {
  // A folded letter seen at an angle with a wax seal.
  g.save();
  g.translate(64, 66);
  g.rotate(-0.18);
  shade(g, (q) => q.rect(-46, -32, 92, 64), PARCH, { band: 3, gloss: 1, box: [-46, -32, 46, 32] });
  line(g, dark(PARCH, 0.3), 1.4, (q) => {
    q.moveTo(-46, -32);
    q.lineTo(0, 6);
    q.lineTo(46, -32);
  }, 0.7);
  line(g, dark(PARCH, 0.2), 1, (q) => {
    q.moveTo(-46, 32);
    q.lineTo(-10, 2);
    q.moveTo(46, 32);
    q.lineTo(10, 2);
  }, 0.5);
  const c = p.color ?? '#b0202a';
  shade(g, (q) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, rr = i % 2 ? 13 : 15;
      q.lineTo(Math.cos(a) * rr, 6 + Math.sin(a) * rr);
    }
    q.closePath();
  }, c, { gloss: 2, band: 2, rim: true, box: [-15, -9, 15, 21] });
  drawGlyph(g, p.glyph ?? 'crown', 0, 6, 15, dark(c, 0.45), 2);
  if (p.accent) {
    // A ribbon under the seal.
    shade(g, (q) => {
      q.moveTo(-6, 16);
      q.lineTo(-12, 40);
      q.lineTo(-4, 36);
      q.lineTo(0, 18);
      q.closePath();
    }, p.accent, { band: 1, box: [-12, 16, 0, 40] });
  }
  if (p.worn) stains(g, rng('letter'));
  g.restore();
}

function scroll(g: G, p: PaperSpec, r: () => number) {
  g.save();
  g.translate(64, 64);
  g.rotate(-0.7);
  // The rolled body with the end curls visible.
  shade(g, (q) => q.rect(-44, -18, 88, 36), PARCH, { band: 4, gloss: 1, box: [-44, -18, 44, 18] });
  for (const s of [-1, 1]) {
    shade(g, ellipse(s * 44, 0, 8, 18), dark(PARCH, 0.08), { band: 2, box: [s * 44 - 8, -18, s * 44 + 8, 18] });
    line(g, dark(PARCH, 0.35), 1.2, (q) => q.ellipse(s * 44, 0, 4, 10, 0, 0, Math.PI * 2), 0.8);
  }
  const c = p.color ?? '#c0303a';
  shade(g, (q) => q.rect(-6, -19, 12, 38), c, { band: 1.5, gloss: 1, box: [-6, -19, 6, 19] });
  if (p.glyph) {
    shade(g, circle(0, 0, 9), p.accent ?? '#b0202a', { gloss: 2, band: 1.5 });
    drawGlyph(g, p.glyph, 0, 0, 11, dark(p.accent ?? '#b0202a', 0.5));
  }
  if (p.worn) stains(g, r);
  g.restore();
}

function page(g: G, p: PaperSpec, r: () => number) {
  g.save();
  g.translate(64, 64);
  g.rotate(-0.12);
  const torn = (q: G) => {
    q.moveTo(-38, -48);
    for (let i = 0; i <= 8; i++) q.lineTo(-38 + i * 9.5, -48 + (i % 2 ? 3 : -1) * (p.worn ? 1.6 : 0.4));
    q.lineTo(38, 48);
    for (let i = 8; i >= 0; i--) q.lineTo(-38 + i * 9.5, 48 + (i % 2 ? -3 : 2) * (p.worn ? 1 : 0.3));
    q.closePath();
  };
  const paper = p.kind === 'rubbing' ? '#e8e0cc' : PARCH;
  shade(g, torn, paper, { band: 3, gloss: 1, box: [-38, -48, 38, 48] });
  if (p.kind === 'rubbing') {
    // Charcoal rubbing of the Sunwheel.
    g.fillStyle = 'rgba(40,36,40,0.55)';
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.fill();
    drawGlyph(g, 'wheel', 0, 0, 52, 'rgba(232,224,204,0.9)', 2.2);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(30,26,30,0.25)';
      g.fillRect(-30 + r() * 60, -30 + r() * 60, 2, 1);
    }
  } else if (p.kind === 'map') {
    line(g, '#8a5a2a', 1.6, (q) => {
      q.moveTo(-30, 20);
      q.bezierCurveTo(-10, 0, 10, 30, 28, -20);
    }, 0.8);
    drawGlyph(g, 'cross', 26, -22, 12, '#b0202a');
  } else {
    // Lines of handwriting.
    line(g, '#4a3420', 1.3, (q) => {
      for (let i = 0; i < 9; i++) {
        const y = -38 + i * 9, w = 24 + r() * 40;
        q.moveTo(-30, y);
        for (let x = -30; x < -30 + w; x += 4) q.lineTo(x + 2, y + (r() - 0.5) * 1.6);
      }
    }, 0.7);
  }
  if (p.glyph) {
    shade(g, circle(24, 36, 9), p.color ?? '#b0202a', { gloss: 2, band: 1.5, box: [15, 27, 33, 45] });
    drawGlyph(g, p.glyph, 24, 36, 11, dark(p.color ?? '#b0202a', 0.5));
  }
  if (p.worn) stains(g, r);
  g.restore();
}

function tablet(g: G, p: PaperSpec, r: () => number) {
  const c = p.color ?? '#d9a83a';
  shade(g, (q) => q.roundRect(26, 20, 76, 92, 8), c, { gloss: 2, band: 4, rim: true, box: [26, 20, 102, 112] });
  line(g, dark(c, 0.45), 1.6, (q) => {
    for (let i = 0; i < 8; i++) {
      const y = 34 + i * 9;
      for (let x = 36; x < 92; x += 7 + r() * 4) {
        q.moveTo(x, y);
        q.lineTo(x + 3, y + (r() < 0.5 ? 3 : -2));
      }
    }
  }, 0.8);
  if (p.glyph) drawGlyph(g, p.glyph, 64, 98, 16, dark(c, 0.5));
}

function stains(g: G, r: () => number) {
  for (let i = 0; i < 3; i++) {
    g.fillStyle = 'rgba(120,90,50,0.18)';
    g.beginPath();
    g.ellipse(-20 + r() * 40, -20 + r() * 40, 8 + r() * 10, 6 + r() * 8, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  void rgba;
}

export const PAPERS: Record<string, PaperSpec> = {
  // books
  bookSmithing: { kind: 'book', color: '#5a3a2a', glyph: 'hammer' },
  bookAlchemy: { kind: 'book', color: '#2a5a3a', glyph: 'leaf' },
  bookCooking: { kind: 'book', color: '#8a4a1e', glyph: 'pot' },
  bookRunes: { kind: 'book', color: '#3a2a5a', glyph: 'rune', glow: '#7a8aff' },
  bookHedgeWitch: { kind: 'book', color: '#6a6a3a', glyph: 'mushroom', accent: '#a8a07a', worn: true },
  bookSoldier: { kind: 'book', color: '#7a2a24', glyph: 'shield' },
  bookMariner: { kind: 'book', color: '#2a4a6a', glyph: 'anchor', worn: true },
  bookHuntsman: { kind: 'book', color: '#4a5a2a', glyph: 'paw' },
  bookNight: { kind: 'book', color: '#2a2a4a', glyph: 'moon', accent: '#c8d0e8' },
  bookGrey: { kind: 'book', color: '#6a6a70', glyph: 'skull', accent: '#c8c8d0' },
  bookDesert: { kind: 'book', color: '#b8783a', glyph: 'sun' },
  bookCollegium: { kind: 'book', color: '#5a1a2a', glyph: 'star', glow: '#ffd76a' },
  herbAlmanac: { kind: 'book', color: '#4a6a3a', glyph: 'leaf', accent: '#c8a060', worn: true },
  captainsLog: { kind: 'ledger', color: '#3a4a5a', glyph: 'anchor', worn: true },
  wreckLedger: { kind: 'ledger', color: '#5a4a3a', glyph: 'wheel', worn: true },
  bazaarLedger: { kind: 'ledger', color: '#7a2a5a', glyph: 'sun' },
  // letters, scrolls and pages
  sealedDispatch: { kind: 'letter', color: '#2a5ab0', glyph: 'crown' },
  tobinsLetter: { kind: 'letter', color: '#7a3a1a', glyph: 'shield' },
  ashbyLetter: { kind: 'letter', color: '#5a6a3a', glyph: 'leaf' },
  vizierOrders: { kind: 'letter', color: '#6a2a8a', glyph: 'eye' },
  waterWrit: { kind: 'scroll', color: '#2a8a8a', glyph: 'drop', accent: '#d9a83a' },
  riddleScroll: { kind: 'scroll', color: '#6a5a4a', worn: true },
  journalPage: { kind: 'page', worn: true },
  championPage1: { kind: 'page', worn: true, glyph: 'crown', color: '#8a6a2a' },
  championPage2: { kind: 'page', worn: true, glyph: 'crown', color: '#8a6a2a' },
  championPage3: { kind: 'page', worn: true, glyph: 'crown', color: '#8a6a2a' },
  glyphRubbing: { kind: 'rubbing' },
  dungeonRubbing: { kind: 'rubbing', worn: true },
  amaunetTablet: { kind: 'tablet', color: '#d9a83a', glyph: 'eye' },
};
