import type { DisciplineDef } from '../paths/data';
import { NODE_COST, TIER_GATE, treeOf, type Paths, type Tree, type TreeNode } from '../paths/paths';

// Canvas renderer for one discipline's tree. Each family gets its own look:
//   combat  -> Sigil Wheel (rune circle, branches as wedges, tiers as rings)
//   magic   -> Constellation (stars on a nebula)
//   calling -> Living Tree (trunk, three boughs, leaves and blossoms)
// Layout happens once per tree in a fixed world space; the camera fits it
// to the canvas every frame.

export const ICONS: Record<string, string> = {
  gale: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8',
  cross: 'M5 3l11 11M19 3L8 14M13 17l4-4M7 13l4 4M16 16l4 4M8 16l-4 4',
  boundary: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 7v10M8 11h8',
  dawnblade: 'M12 2v14M9 16h6M12 16v5M5 6l2 1.5M19 6l-2 1.5M4 11h2.5M17.5 11H20',
  warbreaker: 'M6 21L16 7M13 4c5 0 7 3 7 7-4 0-6-1-7-3z',
  oathbreaker: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8 8l8 8M16 8l-4 4',
  pyromancer: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 2 3 1-2 1-4 1-7z',
  windcaller: 'M4 12a8 8 0 1 1 8 8M8 12a4 4 0 1 1 4 4M12 12h.01',
  cryomancer: 'M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 4l3 2 3-2M9 20l3-2 3 2',
  lightbinder: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  shadowcaller: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  voidwalker: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  herbalism: 'M5 19C5 10 11 5 20 4c-1 9-6 15-15 15zM5 19l8-8',
  dungeoneering: 'M5 21V10a7 7 0 0 1 14 0v11M3 21h18M9 21v-4a3 3 0 0 1 6 0v4',
  smithing: 'M4 20l8-8M10 6l4-3 7 7-3 4-3-1-3 3-4-4 3-3z',
  cooking: 'M4 10h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM8 7c0-1 1-2 1-3M12 7c0-1 1-2 1-3M16 7c0-1 1-2 1-3',
  runecraft: 'M12 3l7 9-7 9-7-9zM12 3v18M8 9l8 6',
  beastbinding: 'M6 14c0-4 3-7 6-7s6 3 6 7-3 6-6 6-6-2-6-6zM8 7L6 3M16 7l2-4M10 13h.01M14 13h.01',
};

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const BR_ANG = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6];

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function hexA(hex: string, a: number) {
  const h = hex.trim().replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

type Bez = { s: [number, number]; c1: [number, number]; c2: [number, number]; e: [number, number] };
const BOUGHS: Bez[] = [
  { s: [0, 150], c1: [-60, 80], c2: [-240, 40], e: [-360, -140] },
  { s: [0, 90], c1: [10, 0], c2: [-10, -160], e: [0, -330] },
  { s: [0, 200], c1: [60, 130], c2: [240, 60], e: [360, -120] },
];
const bez = (b: Bez, u: number): [number, number] => {
  const m = 1 - u;
  const f = (i: 0 | 1) => m * m * m * b.s[i] + 3 * m * m * u * b.c1[i] + 3 * m * u * u * b.c2[i] + u * u * u * b.e[i];
  return [f(0), f(1)];
};

interface BB { x0: number; y0: number; x1: number; y1: number }
const bounds = new Map<string, BB>();

function layout(d: DisciplineDef, t: Tree) {
  if (bounds.has(d.id)) return bounds.get(d.id)!;
  let bb: BB;
  if (d.fam === 'combat') {
    for (const n of t.nodes) {
      if (n.type === 'center') { n.x = 0; n.y = 0; continue; }
      const R = n.type === 'cap' ? 82 + 5 * 60 + 8 : 82 + (n.tier - 1) * 60;
      const a = BR_ANG[n.branch] + (n.len === 1 ? 0 : (n.k / (n.len - 1) - 0.5) * (0.72 + n.tier * 0.03));
      n.x = Math.cos(a) * R;
      n.y = Math.sin(a) * R;
    }
    bb = { x0: -425, y0: -425, x1: 425, y1: 425 };
  } else if (d.fam === 'magic') {
    const baseY = 300, angs = [-Math.PI / 2 - 0.78, -Math.PI / 2, -Math.PI / 2 + 0.78];
    bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const n of t.nodes) {
      if (n.type === 'center') { n.x = 0; n.y = baseY; }
      else {
        const a = angs[n.branch] + Math.sin(n.tier * 0.9 + n.branch) * 0.08;
        const dist = n.type === 'cap' ? 60 + 6 * 64 : 60 + n.tier * 64;
        const cx = Math.cos(a) * dist, cy = baseY + Math.sin(a) * dist, px = -Math.sin(a), py = Math.cos(a);
        const off = n.len === 1 ? 0 : (n.k - (n.len - 1) / 2) * 46;
        n.x = cx + px * off + (hash(d.id + n.id) - 0.5) * 22;
        n.y = cy + py * off + (hash(n.id + d.id) - 0.5) * 22;
      }
      bb.x0 = Math.min(bb.x0, n.x!); bb.y0 = Math.min(bb.y0, n.y!); bb.x1 = Math.max(bb.x1, n.x!); bb.y1 = Math.max(bb.y1, n.y!);
    }
    bb = { x0: bb.x0 - 70, y0: bb.y0 - 70, x1: bb.x1 + 70, y1: bb.y1 + 70 };
  } else {
    for (const n of t.nodes) {
      if (n.type === 'center') { n.x = 0; n.y = 320; continue; }
      const b = BOUGHS[n.branch];
      const u = n.type === 'cap' ? 1 : 0.2 + (n.tier - 1) * 0.165;
      const [x, y] = bez(b, u), [x2, y2] = bez(b, Math.min(1, u + 0.01));
      let dx = x2 - x, dy = y2 - y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      if (n.type === 'cap') { n.x = b.e[0] + dx * 24; n.y = b.e[1] + dy * 24; continue; }
      const off = n.len === 1 ? 0 : (n.k - (n.len - 1) / 2) * (n.len === 2 ? 52 : 44);
      n.x = x - dy * off;
      n.y = y + dx * off;
    }
    bb = { x0: -440, y0: -400, x1: 440, y1: 420 };
  }
  bounds.set(d.id, bb);
  return bb;
}

export class TreeView {
  hover: TreeNode | null = null;
  selected = 'c';
  onSelect?: (n: TreeNode) => void;
  private ctx: CanvasRenderingContext2D;
  private tree: Tree;
  private bb: BB;
  private cam = { s: 1, ox: 0, oy: 0 };
  private raf = 0;
  private pulses: { x: number; y: number; t: number; k: number }[] = [];
  private bg: { x: number; y: number; r: number; p: number }[];
  private col: string;
  private gold: string;
  private bone: string;
  private alive = true;

  constructor(private cv: HTMLCanvasElement, private d: DisciplineDef, private paths: Paths) {
    this.ctx = cv.getContext('2d')!;
    this.tree = treeOf(d)!;
    this.bb = layout(d, this.tree);
    const cs = getComputedStyle(cv);
    this.col = cs.getPropertyValue(d.color).trim() || '#d9b15a';
    this.gold = cs.getPropertyValue('--sk-gold').trim() || '#d9b15a';
    this.bone = cs.getPropertyValue('--sk-bone').trim() || '#ece5d3';
    this.bg = Array.from({ length: 260 }, (_, i) => ({ x: hash('x' + i), y: hash('y' + i), r: hash('r' + i) * 1.3 + 0.2, p: i }));
    cv.addEventListener('mousemove', (e) => {
      const n = this.pick(e);
      if (n !== this.hover) {
        this.hover = n;
        cv.style.cursor = n ? 'pointer' : 'default';
        if (reduce) this.draw(0);
      }
    });
    cv.addEventListener('mouseleave', () => (this.hover = null));
    cv.addEventListener('click', (e) => {
      const n = this.pick(e);
      if (!n) return;
      this.selected = n.id;
      this.onSelect?.(n);
      if (reduce) this.draw(0);
    });
    const loop = (ts: number) => {
      if (!this.alive) return;
      this.draw(ts);
      if (!reduce) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    document.fonts?.ready.then(() => this.alive && this.draw(performance.now()));
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
  }

  node(id: string) {
    return this.tree.map[id];
  }

  burst(n: TreeNode | undefined, k: number) {
    if (n?.x === undefined) return;
    this.pulses.push({ x: n.x, y: n.y!, t: 0, k });
    if (reduce) this.draw(0);
  }

  redraw() {
    if (reduce) this.draw(0);
  }

  private size() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (this.cv.width !== W || this.cv.height !== H) {
      this.cv.width = W;
      this.cv.height = H;
    }
    return { w: W, h: H };
  }

  private pick(e: MouseEvent) {
    const r = this.cv.getBoundingClientRect(), dpr = this.cv.width / (r.width || 1);
    const x = ((e.clientX - r.left) * dpr - this.cam.ox) / this.cam.s;
    const y = ((e.clientY - r.top) * dpr - this.cam.oy) / this.cam.s;
    let best: TreeNode | null = null, bd = 26 * 26;
    for (const n of this.tree.nodes) {
      const dd = (n.x! - x) ** 2 + (n.y! - y) ** 2;
      if (dd < bd) { bd = dd; best = n; }
    }
    return best;
  }

  private draw(ts: number) {
    const { w, h } = this.size();
    const { d, tree: t, paths: P } = this;
    const bw = this.bb.x1 - this.bb.x0, bh = this.bb.y1 - this.bb.y0, s = Math.min(w / bw, h / bh);
    this.cam = { s, ox: (w - bw * s) / 2 - this.bb.x0 * s, oy: (h - bh * s) / 2 - this.bb.y0 * s };
    const c = this.ctx, col = this.col, gold = this.gold;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    if (d.fam === 'combat') this.bgWheel(w, h);
    else if (d.fam === 'magic') this.bgStars(w, h, ts);
    else this.bgTree(w, h, ts);
    c.setTransform(s, 0, 0, s, this.cam.ox, this.cam.oy);
    if (d.fam === 'combat') this.wheelOverlay(ts);
    for (const n of t.nodes) {
      if (!n.parent) continue;
      const p = t.map[n.parent];
      this.link(p, n, P.has(d.id, n.id) && P.has(d.id, p.id), P.open(d.id, n), ts);
    }
    for (const n of t.nodes) this.nodeShape(n, ts);
    this.pulses = this.pulses.filter((p) => (p.t += 1 / 60) < 0.9);
    for (const p of this.pulses) {
      const k = p.t / 0.9;
      c.strokeStyle = col;
      c.globalAlpha = 1 - k;
      c.lineWidth = 3 * (1 - k) + 0.5;
      c.beginPath();
      c.arc(p.x, p.y, 10 + k * 70 * p.k, 0, 7);
      c.stroke();
      c.globalAlpha = 1;
    }
    const hv = this.hover;
    if (hv) {
      const v = P.node(d.id, hv.id);
      const nm = hv.type === 'choice' ? (v ? hv.name.split('|')[v.pick ?? 0] : hv.name.replace('|', ' / ')) : hv.name;
      c.font = '15px Cinzel, serif';
      const tw = c.measureText(nm).width, bx = hv.x! - tw / 2 - 10, by = hv.y! - 52;
      c.fillStyle = 'rgba(7,8,12,.92)';
      c.strokeStyle = gold;
      c.lineWidth = 1;
      c.beginPath();
      c.rect(bx, by, tw + 20, 26);
      c.fill();
      c.stroke();
      c.fillStyle = this.bone;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(nm, hv.x!, by + 13);
      c.textBaseline = 'alphabetic';
    }
  }

  private bgWheel(w: number, h: number) {
    const c = this.ctx;
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.6);
    g.addColorStop(0, hexA(this.col, 0.14));
    g.addColorStop(0.6, 'rgba(10,12,18,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  private wheelOverlay(ts: number) {
    const c = this.ctx, col = this.col, gold = this.gold, L = this.paths.level(this.d.id);
    for (let i = 0; i <= 5; i++) {
      const R = 82 + i * 60 + (i === 5 ? 8 : 0), open = L >= TIER_GATE[i + 1];
      c.strokeStyle = open ? hexA(col, 0.18) : 'rgba(255,255,255,0.05)';
      c.lineWidth = 1;
      c.setLineDash(open ? [] : [3, 7]);
      c.beginPath();
      c.arc(0, 0, R, 0, 7);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = open ? hexA(col, 0.55) : 'rgba(255,255,255,0.2)';
      c.font = '10px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillText('LV ' + TIER_GATE[i + 1], 0, R + 4);
    }
    c.save();
    c.rotate(reduce ? 0 : ts * 0.00003);
    c.strokeStyle = hexA(gold, 0.4);
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, 410, 0, 7);
    c.stroke();
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(0, 0, 392, 0, 7);
    c.stroke();
    c.fillStyle = hexA(gold, 0.55);
    c.font = '11px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < 60; i++) {
      c.save();
      c.rotate((i / 60) * Math.PI * 2);
      c.fillText(RUNES[i % RUNES.length], 0, -401);
      c.restore();
    }
    c.restore();
    c.textBaseline = 'alphabetic';
    c.save();
    c.rotate(reduce ? 0 : -ts * 0.00006);
    c.strokeStyle = hexA(col, 0.35);
    c.setLineDash([2, 10]);
    c.beginPath();
    c.arc(0, 0, 50, 0, 7);
    c.stroke();
    c.restore();
    c.setLineDash([]);
    this.d.branches!.forEach((b, bi) => {
      const a = BR_ANG[bi] + Math.PI / 3;
      c.strokeStyle = hexA(gold, 0.16);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.cos(a) * 56, Math.sin(a) * 56);
      c.lineTo(Math.cos(a) * 386, Math.sin(a) * 386);
      c.stroke();
      const la = BR_ANG[bi] + 0.62, R = 368;
      c.save();
      c.translate(Math.cos(la) * R, Math.sin(la) * R);
      let rot = la + Math.PI / 2;
      if (Math.sin(la) > 0.1) rot += Math.PI;
      c.rotate(rot);
      c.fillStyle = 'rgba(236,229,211,0.6)';
      c.font = '15px Cinzel, serif';
      c.textAlign = 'center';
      c.fillText(b.name.toUpperCase(), 0, 0);
      c.restore();
    });
  }

  private bgStars(w: number, h: number, ts: number) {
    const c = this.ctx, col = this.col, d = this.d;
    const g = c.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
    g.addColorStop(0, hexA(col, 0.22));
    g.addColorStop(0.45, 'rgba(20,14,22,0.6)');
    g.addColorStop(1, '#07080c');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const x = (0.2 + hash(d.id + i) * 0.6) * w, y = (0.2 + hash(i + d.id) * 0.5) * h, r = (0.18 + hash('n' + i) * 0.2) * w;
      const gg = c.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, hexA(col, 0.07));
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gg;
      c.fillRect(0, 0, w, h);
    }
    for (const b of this.bg) {
      const tw = reduce ? 0.6 : 0.45 + 0.4 * Math.sin(ts * 0.0018 + b.p);
      c.fillStyle = `rgba(255,240,225,${tw * 0.55})`;
      c.beginPath();
      c.arc(b.x * w, b.y * h, b.r * Math.max(1, w / 900), 0, 7);
      c.fill();
    }
    c.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.ox, this.cam.oy);
    c.fillStyle = hexA(col, 0.4);
    c.font = '12px ui-monospace, monospace';
    c.textAlign = 'center';
    d.branches!.forEach((b, bi) => {
      const cap = this.tree.map[`${bi}-cap`];
      c.fillText(b.name.toUpperCase(), cap.x!, cap.y! - 40);
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private bgTree(w: number, h: number, ts: number) {
    const c = this.ctx, col = this.col;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1210');
    g.addColorStop(0.75, '#0d130e');
    g.addColorStop(1, '#0a0906');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.6);
    glow.addColorStop(0, hexA(col, 0.1));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = (hash('f' + i) + (reduce ? 0 : Math.sin(ts * 0.0003 + i) * 0.02)) * w;
      const y = (hash('g' + i) * 0.8 + (reduce ? 0 : Math.cos(ts * 0.0004 + i) * 0.02)) * h;
      c.fillStyle = hexA(col, 0.25 + 0.25 * Math.sin(ts * 0.003 + i));
      c.beginPath();
      c.arc(x, y, 1.6 * Math.max(1, w / 900), 0, 7);
      c.fill();
    }
    c.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.ox, this.cam.oy);
    c.strokeStyle = '#3a3226';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-420, 360);
    c.quadraticCurveTo(0, 340, 420, 360);
    c.stroke();
    c.strokeStyle = '#5a4a33';
    c.lineCap = 'round';
    for (const [ex, ey, cw] of [[-220, 410, 7], [-90, 415, 5], [110, 412, 5], [230, 405, 7]]) {
      c.lineWidth = cw;
      c.beginPath();
      c.moveTo(0, 345);
      c.quadraticCurveTo(ex * 0.4, 370, ex, ey);
      c.stroke();
    }
    const tg = c.createLinearGradient(-26, 0, 26, 0);
    tg.addColorStop(0, '#2e2519');
    tg.addColorStop(0.5, '#5b4a33');
    tg.addColorStop(1, '#2a2217');
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-30, 350);
    c.bezierCurveTo(-18, 250, -26, 160, -14, 80);
    c.lineTo(14, 80);
    c.bezierCurveTo(26, 160, 18, 250, 30, 350);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 1.2;
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(i * 8, 340);
      c.bezierCurveTo(i * 6, 260, i * 7, 170, i * 4, 90);
      c.stroke();
    }
    const L = this.paths.level(this.d.id);
    for (let i = 0; i < 6; i++) {
      const y = 290 - i * 40, on = L >= TIER_GATE[i + 1];
      c.fillStyle = on ? hexA(col, 0.8) : 'rgba(255,255,255,0.18)';
      c.font = '10px ui-monospace, monospace';
      c.textAlign = 'right';
      c.fillText('LV ' + TIER_GATE[i + 1], -40, y + 3);
      c.fillRect(-32, y, 8, 1.5);
    }
    BOUGHS.forEach((b, bi) => {
      c.strokeStyle = '#4d3f2b';
      c.lineWidth = 12;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(...b.s);
      c.bezierCurveTo(...b.c1, ...b.c2, ...b.e);
      c.stroke();
      c.strokeStyle = '#6a5639';
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = 'rgba(236,229,211,0.7)';
      c.font = '18px Cinzel, serif';
      c.textAlign = 'center';
      c.fillText(this.d.branches![bi].name.toUpperCase(), b.e[0] + (bi === 1 ? 90 : 0), b.e[1] - (bi === 1 ? 6 : 52));
    });
  }

  private link(a: TreeNode, b: TreeNode, on: boolean, av: boolean, ts: number) {
    const c = this.ctx, col = this.col, fam = this.d.fam;
    if (fam === 'calling') {
      c.strokeStyle = on ? hexA(col, 0.8) : av ? hexA(col, 0.4) : 'rgba(120,100,70,0.35)';
      c.lineWidth = on ? 2 : 1.2;
      c.setLineDash(on ? [] : [2, 4]);
      c.beginPath();
      c.moveTo(a.x!, a.y!);
      c.quadraticCurveTo((a.x! + b.x!) / 2, Math.min(a.y!, b.y!) - 10, b.x!, b.y!);
      c.stroke();
      c.setLineDash([]);
      return;
    }
    if (fam === 'magic') {
      c.strokeStyle = on ? hexA(col, 0.85) : av ? hexA(col, 0.4) : 'rgba(255,225,200,0.1)';
      c.lineWidth = on ? 1.8 : 1;
      c.setLineDash(on ? [] : [3, 6]);
      if (on) { c.shadowColor = col; c.shadowBlur = 8; }
      c.beginPath();
      c.moveTo(a.x!, a.y!);
      c.lineTo(b.x!, b.y!);
      c.stroke();
      c.setLineDash([]);
      c.shadowBlur = 0;
      return;
    }
    c.strokeStyle = on ? col : av ? hexA(col, 0.45) : 'rgba(255,255,255,0.07)';
    c.lineWidth = on ? 2.6 : 1.2;
    c.beginPath();
    c.moveTo(a.x!, a.y!);
    c.lineTo(b.x!, b.y!);
    c.stroke();
    if (on && !reduce) {
      const p = (ts * 0.0006 + hash(b.id)) % 1;
      c.fillStyle = '#f2fffd';
      c.shadowColor = col;
      c.shadowBlur = 10;
      c.beginPath();
      c.arc(a.x! + (b.x! - a.x!) * p, a.y! + (b.y! - a.y!) * p, 2.2, 0, 7);
      c.fill();
      c.shadowBlur = 0;
    }
  }

  private nodeShape(n: TreeNode, ts: number) {
    const c = this.ctx, d = this.d, P = this.paths, col = this.col, gold = this.gold, dark = '#0c0f16';
    const on = P.has(d.id, n.id), av = P.canLearn(d.id, n);
    const gated = P.level(d.id) < TIER_GATE[n.tier];
    const k = n.type === 'keystone' || n.type === 'cap' ? gold : col;
    const fam = d.fam;
    c.save();
    c.translate(n.x!, n.y!);
    c.globalAlpha = on ? 1 : av ? (reduce ? 0.9 : 0.65 + 0.3 * Math.sin(ts * 0.005 + n.x!)) : gated ? 0.22 : 0.42;
    if (on) { c.shadowColor = k; c.shadowBlur = 18; }
    c.fillStyle = on ? k : dark;
    c.strokeStyle = k;
    c.lineWidth = 2;
    if (n.type === 'center') {
      if (fam === 'calling') {
        c.shadowBlur = 0;
        c.beginPath();
        c.ellipse(0, 0, 34, 22, 0, 0, 7);
        c.fillStyle = '#1a1510';
        c.fill();
        c.stroke();
      } else {
        c.beginPath();
        c.arc(0, 0, 32, 0, 7);
        c.fillStyle = dark;
        c.fill();
        c.stroke();
        c.lineWidth = 1;
        c.beginPath();
        c.arc(0, 0, 38, 0, 7);
        c.stroke();
      }
      c.shadowBlur = 0;
      c.save();
      c.scale(1.6, 1.6);
      c.translate(-12, -12);
      c.strokeStyle = k;
      c.lineWidth = 1.4;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke(new Path2D(ICONS[d.id] ?? ICONS.runecraft));
      c.restore();
    } else if (fam === 'magic') {
      const r = n.type === 'cap' ? 14 : n.type === 'active' || n.type === 'keystone' ? 10 : n.type === 'notable' || n.type === 'choice' ? 7 : 5;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.42 : r * 1.35;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = on ? '#fff4e8' : dark;
      c.fill();
      c.stroke();
      if (n.type === 'keystone' || n.type === 'cap') {
        c.shadowBlur = 0;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(0, 0, r + 8, 0, 7);
        c.stroke();
      }
    } else if (fam === 'calling') {
      c.rotate(reduce ? 0 : Math.sin(ts * 0.0012 + n.x! * 0.05) * 0.08);
      if (n.type === 'minor' || n.type === 'notable') {
        const s = n.type === 'notable' ? 1.3 : 1;
        c.rotate(Math.atan2(n.y! - 100, n.x!) + Math.PI / 2);
        c.beginPath();
        c.moveTo(0, 10 * s);
        c.quadraticCurveTo(11 * s, 0, 0, -12 * s);
        c.quadraticCurveTo(-11 * s, 0, 0, 10 * s);
        c.fill();
        c.stroke();
        c.shadowBlur = 0;
        c.lineWidth = 0.8;
        c.strokeStyle = on ? dark : k;
        c.beginPath();
        c.moveTo(0, 9 * s);
        c.lineTo(0, -10 * s);
        c.stroke();
      } else if (n.type === 'active' || n.type === 'choice') {
        for (let i = 0; i < 5; i++) {
          c.save();
          c.rotate((i / 5) * Math.PI * 2);
          c.beginPath();
          c.ellipse(0, -8, 5, 8, 0, 0, 7);
          c.fill();
          c.stroke();
          c.restore();
        }
        c.shadowBlur = 0;
        c.fillStyle = gold;
        c.beginPath();
        c.arc(0, 0, 3.5, 0, 7);
        c.fill();
      } else if (n.type === 'keystone') {
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, rr = i % 2 ? 7 : 14;
          c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
        c.stroke();
      } else {
        c.beginPath();
        c.arc(0, 4, 15, 0, 7);
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(0, -11);
        c.quadraticCurveTo(8, -22, 16, -18);
        c.strokeStyle = '#6a8a3a';
        c.stroke();
      }
    } else if (n.type === 'minor') {
      c.beginPath();
      c.arc(0, 0, 6.5, 0, 7);
      c.fill();
      c.stroke();
    } else if (n.type === 'notable') {
      c.rotate(Math.PI / 4);
      c.beginPath();
      c.rect(-7.5, -7.5, 15, 15);
      c.fill();
      c.stroke();
    } else if (n.type === 'active') {
      c.beginPath();
      c.arc(0, 0, 14, 0, 7);
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = on ? dark : k;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, 6, 0, 7);
      c.stroke();
    } else if (n.type === 'choice') {
      c.beginPath();
      c.arc(0, 0, 11, Math.PI / 2, Math.PI * 1.5);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 11, -Math.PI / 2, Math.PI / 2);
      c.closePath();
      c.fillStyle = dark;
      c.fill();
      c.stroke();
    } else if (n.type === 'keystone') {
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        c.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
      }
      c.closePath();
      c.fill();
      c.stroke();
    } else {
      c.beginPath();
      c.arc(0, 0, 19, 0, 7);
      c.fill();
      c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, 0, 26, 0, 7);
      c.stroke();
    }
    c.restore();
    // Rank arcs around owned skills.
    const v = P.node(d.id, n.id);
    if (v && n.type === 'active') {
      for (let i = 0; i < 5; i++) {
        const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / 5) + 0.12, a1 = a0 + (Math.PI * 2) / 5 - 0.24;
        c.strokeStyle = i < v.r ? gold : 'rgba(255,255,255,0.15)';
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(n.x!, n.y!, 21, a0, a1);
        c.stroke();
      }
    }
    const sel = this.selected === n.id, hov = this.hover === n;
    if (sel || hov) {
      c.strokeStyle = sel ? this.bone : hexA(this.bone, 0.6);
      c.lineWidth = 1.2;
      c.setLineDash(sel ? [4, 4] : []);
      c.save();
      c.translate(n.x!, n.y!);
      if (sel && !reduce) c.rotate(ts * 0.001);
      c.beginPath();
      c.arc(0, 0, n.type === 'center' ? 46 : n.type === 'cap' ? 32 : 27, 0, 7);
      c.stroke();
      c.restore();
      c.setLineDash([]);
    }
  }
}

/** Draw a sealed placeholder for disciplines whose tree isn't written yet. */
export function drawSealed(cv: HTMLCanvasElement, learned: boolean) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  const c = cv.getContext('2d')!, w = cv.width, h = cv.height;
  c.fillStyle = '#0f121a';
  c.fillRect(0, 0, w, h);
  c.translate(w / 2, h / 2);
  c.strokeStyle = '#363f55';
  c.setLineDash([4, 8]);
  for (const k of [0.1, 0.2, 0.3]) {
    c.beginPath();
    c.arc(0, 0, k * Math.min(w, h), 0, 7);
    c.stroke();
  }
  c.setLineDash([]);
  c.fillStyle = '#968f80';
  c.textAlign = 'center';
  c.font = `${Math.max(14, w / 44)}px Cinzel, serif`;
  c.fillText(learned ? 'This tree is still being written' : 'The tree is revealed when you learn it', 0, 0);
}

export { NODE_COST };
