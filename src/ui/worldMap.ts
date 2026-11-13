import * as THREE from 'three';
import { GW, GH, CELL, MPP, MAP_PX, worldToPx, REGION_DEFS } from '../world/worldMap';
import { REGIONS } from '../world/regionDefinitions';
import { ROAD_LINES } from '../world/terrainHeight';
import type { Discovery, MapMark } from '../world/discovery';

// The world map (M in the overworld) and the local minimap (docs/design/mapping.md).
// Your sheet is drawn in three hands: a pencil SKETCH where you have walked,
// the painted INK where your maps reach, and your own MARKS (pins, circles,
// lines, notes, copied rumours). Beside it you can lay other people's papers
// (a guild's wall map, a hermit's scrawl) at the same scale and copy from
// them by hand. The minimap shows only what is on your sheet.

export interface MapMarker {
  x: number;
  z: number;
  /** quest: an objective; offer: someone with a quest for you; pin: your own */
  kind: 'quest' | 'offer' | 'pin' | 'boss' | 'bossRumour' | 'bossSlain' | 'site' | 'siteDone';
  /** its own glyph and colour (sites) */
  glyph?: string;
  color?: string;
  label?: string;
  /** the tracked quest's objective (drawn larger, with a ring) */
  tracked?: boolean;
}

/** A mark on somebody else's paper (a guild's wall map, a letter). */
export interface PaperMark {
  id: string;
  x: number;
  z: number;
  /** rumours and sightings: how sure the paper is (metres) */
  r?: number;
  kind: 'rumour' | 'sighting' | 'lair' | 'place' | 'note';
  label: string;
  /** a mark-kit glyph (skull, tower, question...) */
  glyph?: string;
  /** buy an exact copy from whoever keeps the paper: the price, or null if not for sale */
  price?: number | null;
  /** already on your sheet */
  copied?: boolean;
}

/** A paper you can lay beside your sheet. */
export interface Paper {
  id: string;
  title: string;
  sub: string;
  /** the paper's own ink: the whole world (a guild's map) or only around its marks */
  inkAll: boolean;
  marks: PaperMark[];
  /** buy an exact copy of one mark (returns a message; null = bought) */
  buy?: (markId: string) => string | null;
}

const MARK_STYLE: Record<MapMarker['kind'], { glyph: string; color: string }> = {
  quest: { glyph: '❗', color: '#ffd76a' },
  offer: { glyph: '!', color: '#ffe9a8' },
  pin: { glyph: '⚑', color: '#ff7ad9' },
  boss: { glyph: '✪', color: '#ff5a44' },
  bossRumour: { glyph: '?', color: '#ff8a6a' },
  bossSlain: { glyph: '✕', color: '#b8aa98' },
  site: { glyph: '•', color: '#e8dcc0' },
  siteDone: { glyph: '•', color: '#9a9284' },
};

const KIND_ICON: Record<string, { color: string; glyph: string }> = {
  town: { color: '#f2c14e', glyph: '◉' },
  city: { color: '#f2c14e', glyph: '✦' },
  capital: { color: '#ffd76a', glyph: '★' },
  castle: { color: '#e8d3a0', glyph: '♜' },
  port: { color: '#8fd3ff', glyph: '⚓' },
  landmark: { color: '#b9f0c8', glyph: '◆' },
  dungeon: { color: '#ff8a7a', glyph: '☠' },
  ruin: { color: '#d9c6ff', glyph: '◊' },
};

/** The mark kit's glyphs (public/assets/icons/mapglyph/<name>.webp). */
export const MARK_GLYPHS = ['skull', 'chest', 'herb', 'danger', 'cave', 'camp', 'rumour', 'star', 'tower', 'house', 'anchor', 'ore', 'fish', 'paw', 'secret', 'flag', 'key', 'shield', 'crown', 'tent', 'signpost', 'lookout', 'board', 'treasure', 'compass'] as const;
const INKS: Record<string, string> = { red: '#b3241c', black: '#2a1d14', blue: '#1f4e8c', green: '#2f6b2a', gold: '#b8860b' };
type Tool = 'pan' | 'pin' | 'circle' | 'line' | 'note' | 'strike' | 'erase';
const TOOL_LABEL: Record<Tool, string> = { pan: 'Move', pin: 'Pin', circle: 'Circle', line: 'Line', note: 'Note', strike: 'Strike', erase: 'Erase' };
const TOOL_HINT: Record<Tool, string> = {
  pan: 'Drag to pan · Wheel to zoom · Right-click to pin · M to close',
  pin: 'Click to place a pin with the chosen glyph',
  circle: 'Drag from the centre to draw a circle',
  line: 'Drag to draw a line or a route',
  note: 'Click to write a note on the map',
  strike: 'Click one of your marks to strike it through (or restore it)',
  erase: 'Click one of your marks to rub it out',
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}

/**
 * The pencil version of the painted map: the land's edges in soft graphite on
 * old paper, water washed pale blue-grey, woods and hills hatched. Made once
 * from the painted map so it always lines up.
 */
function makeSketch(img: HTMLImageElement) {
  const W = MAP_PX[0], H = MAP_PX[1];
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sg = src.getContext('2d', { willReadFrequently: true })!;
  sg.filter = 'blur(1.2px)';
  sg.drawImage(img, 0, 0, W, H);
  const px = sg.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  const water = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    L[i] = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    water[i] = b > r + 18 && b > g - 6 ? 1 : 0;
  }
  const out = sg.createImageData(W, H);
  const o = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
    const gx = -L[ym * W + xm] - 2 * L[y * W + xm] - L[yp * W + xm] + L[ym * W + xp] + 2 * L[y * W + xp] + L[yp * W + xp];
    const gy = -L[ym * W + xm] - 2 * L[ym * W + x] - L[ym * W + xp] + L[yp * W + xm] + 2 * L[yp * W + x] + L[yp * W + xp];
    let edge = Math.min(1, Math.hypot(gx, gy) * 2.6);
    // the coast is always drawn firmly
    if (water[i] !== water[ym * W + x] || water[i] !== water[y * W + xm]) edge = Math.max(edge, 0.85);
    // paper, slightly uneven
    const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    let r = 214 + grain * 6, g = 198 + grain * 6, b = 162 + grain * 5;
    if (water[i]) {
      r = 186; g = 196; b = 192;
      if ((y % 7) === 0 && ((x >> 3) + (y >> 2)) % 3 !== 0) { r -= 26; g -= 22; b -= 16; }
    } else {
      const dark = 1 - L[i];
      // hatching where the painting is dark (woods, mountains)
      if (dark > 0.55 && ((x + y) % 5 === 0)) { const k = (dark - 0.55) * 120; r -= k; g -= k; b -= k; }
      if (dark > 0.72 && ((x - y + 400) % 5 === 0)) { const k = (dark - 0.72) * 140; r -= k; g -= k; b -= k; }
    }
    const lead = edge * 150;
    o[i * 4] = Math.max(40, r - lead);
    o[i * 4 + 1] = Math.max(34, g - lead);
    o[i * 4 + 2] = Math.max(28, b - lead * 0.9);
    o[i * 4 + 3] = 255;
  }
  sg.filter = 'none';
  sg.putImageData(out, 0, 0);
  return src;
}

export class WorldMapUI {
  open = false;
  onToggle?: (open: boolean) => void;
  /** Quest markers (supplied by the quest system). */
  questMarkers: () => MapMarker[] = () => [];
  /** The sea: your ships, wrecks, lit lighthouses, storms, contract ports; routes and currents. */
  seaMarkers: () => { x: number; z: number; kind: string; label?: string }[] = () => [];
  seaLines: () => { pts: [number, number][]; kind: 'route' | 'current' }[] = () => [];
  /** Field bosses you have found yourself (rumours live on the guild's wall, not here). */
  bossMarkers: () => MapMarker[] = () => [];
  /** Sites you've seen (sites/). */
  siteMarkers: () => MapMarker[] = () => [];
  /** Papers you can lay beside your sheet (the guild's wall map while you're in a hall, letters, sketches). */
  papers: () => Paper[] = () => [];
  /** Region progress for the legend: pieces read / pieces in the region. */
  chartProgress: () => { id: string; name: string; have: number; of: number }[] = () => [];
  /** A copy was placed by hand (the guild hears of it; quests may care). */
  onCopy?: (paper: Paper, mark: PaperMark) => void;
  /** Your pins, as markers (the waypoint uses the newest). */
  get pins(): MapMarker[] {
    return this.discovery.marks.filter((m) => m.kind === 'pin' && !m.struck).map((m) => ({ x: m.x, z: m.z, kind: 'pin' as const, label: m.text }));
  }

  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private sketch: HTMLCanvasElement | null = null;
  /** sketch + ink over the cloud, rebuilt when the map changes */
  private comp: HTMLCanvasElement;
  /** the same, fully inked (other people's papers) */
  private paperComp: HTMLCanvasElement | null = null;
  private compDirty = true;
  /** regions with enough ink to carry their name (refreshed with the sheet) */
  private regionNamed = new Set<string>();
  private compAge = 0;
  private zoom = 1;
  private pan = new THREE.Vector2(); // map pixel at the view centre
  private drag: { x: number; y: number; px: number; py: number } | null = null;
  /** a circle or line being drawn */
  private drawing: { tool: 'circle' | 'line'; wx: number; wz: number; ex: number; ez: number; preset?: { paper: Paper; mark: PaperMark } } | null = null;
  private player = new THREE.Vector3();
  private playerYaw = 0;
  private info: HTMLDivElement;
  private help: HTMLDivElement;
  private tools: HTMLDivElement;
  private tray: HTMLDivElement;
  private legendCharts: HTMLDivElement;
  private noteBox: HTMLDivElement;
  private tool: Tool = 'pan';
  private glyph: (typeof MARK_GLYPHS)[number] = 'flag';
  private ink: keyof typeof INKS = 'red';
  private glyphImg = new Map<string, HTMLImageElement>();
  /** the paper laid beside your sheet, and the mark picked on it */
  private paper: Paper | null = null;
  private picked: PaperMark | null = null;
  /** a copy waiting to be placed by hand */
  private copying: { paper: Paper; mark: PaperMark } | null = null;
  private hover: { sx: number; sy: number; text: string } | null = null;
  /** the reveal: a patch inking in, with a brush wipe */
  private reveal: { x: number; z: number; t: number; label: string } | null = null;
  // Minimap
  private mini: HTMLDivElement;
  private miniCanvas: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private miniLabel: HTMLDivElement;
  miniVisible = true;
  /** 0..1: a cursed fog (the Gravewood) blots out both maps around the player */
  obscured = 0;
  /** what the mist hides, written across the big map */
  obscuredText = 'The fog hides everything beyond the graveyard walls';

  constructor(private discovery: Discovery) {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'wmap hidden';
    this.el.innerHTML = `
      <div class="wmap-frame interactive">
        <canvas></canvas>
        <div class="wmap-title">THE KNOWN WORLD</div>
        <div class="wmap-legend">
          <div class="lg-title">Map Key</div>
          <div><i style="color:#ff5d5d">▲</i> You</div>
          <div><i style="color:#ffd76a">❗</i> Quest</div>
          <div><i style="color:#f2c14e">◉</i> Town</div>
          <div><i style="color:#ffd76a">★</i> Capital</div>
          <div><i style="color:#ff8a7a">☠</i> Dungeon</div>
          <div><i style="color:#b9f0c8">◆</i> Point of Interest</div>
          <div><i style="color:#c9b48a">?</i> Seen, not on a map</div>
          <div><i style="color:#ff5a44">✪</i> Field Boss</div>
          <div><i style="color:#8fd3ff">⚓</i> Port</div>
          <div><i class="lg-road"></i> Road</div>
          <div><i class="lg-sketch"></i> Your sketch</div>
          <div class="lg-charts"></div>
        </div>
        <div class="wmap-tray"></div>
        <div class="wmap-tools"></div>
        <div class="wmap-note hidden"><input maxlength="80" placeholder="Write on the map…"><button data-ok>Write</button><button data-cancel>✕</button></div>
        <div class="wmap-info"></div>
        <div class="wmap-help"></div>
      </div>`;
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.info = this.el.querySelector('.wmap-info')!;
    this.help = this.el.querySelector('.wmap-help')!;
    this.tools = this.el.querySelector('.wmap-tools')!;
    this.tray = this.el.querySelector('.wmap-tray')!;
    this.legendCharts = this.el.querySelector('.lg-charts')!;
    this.noteBox = this.el.querySelector('.wmap-note')!;
    this.comp = document.createElement('canvas');
    this.comp.width = MAP_PX[0];
    this.comp.height = MAP_PX[1];

    this.mini = document.createElement('div');
    this.mini.className = 'wmini';
    this.mini.innerHTML = '<canvas width="200" height="200"></canvas><div class="wmini-ring"></div><div class="wmini-n">N</div><div class="wmini-lbl"></div>';
    root.appendChild(this.mini);
    this.miniCanvas = this.mini.querySelector('canvas')!;
    this.miniCtx = this.miniCanvas.getContext('2d')!;
    this.miniLabel = this.mini.querySelector('.wmini-lbl')!;

    loadImage('/assets/world/map.webp').then((i) => {
      this.img = i;
      this.sketch = makeSketch(i);
      this.compDirty = true;
    });
    for (const gname of MARK_GLYPHS) loadImage(`/assets/icons/mapglyph/${gname}.webp`).then((i) => this.glyphImg.set(gname, i)).catch(() => {});
    this.buildTools();
    this.bindInput();
  }

  // ---- tools, tray, note box --------------------------------------------------------
  private buildTools() {
    const tools = (Object.keys(TOOL_LABEL) as Tool[]).map((t) => `<button data-tool="${t}" class="${t === this.tool ? 'on' : ''}">${TOOL_LABEL[t]}</button>`).join('');
    const glyphs = MARK_GLYPHS.map((g) => `<button data-glyph="${g}" class="gl ${g === this.glyph ? 'on' : ''}" title="${g}"><img src="/assets/icons/mapglyph/${g}.webp" alt=""></button>`).join('');
    const inks = Object.entries(INKS).map(([k, c]) => `<button data-ink="${k}" class="ink ${k === this.ink ? 'on' : ''}" style="background:${c}" title="${k} ink"></button>`).join('');
    this.tools.innerHTML = `<div class="wt-row">${tools}<span class="wt-sep"></span>${inks}<span class="wt-sep"></span><button data-classic class="${this.discovery.classic ? 'on' : ''}" title="The old way: walking inks the map for you">Auto-ink</button></div><div class="wt-glyphs ${this.tool === 'pin' ? '' : 'hidden'}">${glyphs}</div>`;
    this.tools.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.addEventListener('click', () => { this.setTool(b.dataset.tool as Tool); }));
    this.tools.querySelectorAll<HTMLButtonElement>('[data-glyph]').forEach((b) => b.addEventListener('click', () => { this.glyph = b.dataset.glyph as typeof this.glyph; this.buildTools(); }));
    this.tools.querySelector<HTMLButtonElement>('[data-classic]')?.addEventListener('click', () => { this.discovery.classic = !this.discovery.classic; this.buildTools(); });
    this.tools.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach((b) => b.addEventListener('click', () => { this.ink = b.dataset.ink as keyof typeof INKS; this.buildTools(); }));
    this.help.textContent = this.copying ? `Copying “${this.copying.mark.label}”: drag on YOUR sheet (left) to draw it where you think it is` : TOOL_HINT[this.tool];
  }

  private setTool(t: Tool) {
    this.tool = t;
    this.copying = null;
    this.buildTools();
  }

  private buildTray() {
    const papers = this.papers();
    if (this.paper && !papers.some((p) => p.id === this.paper!.id)) { this.paper = null; this.picked = null; this.copying = null; }
    if (!papers.length) { this.tray.innerHTML = ''; this.tray.classList.add('hidden'); return; }
    this.tray.classList.remove('hidden');
    let html = '<div class="tr-title">Other papers</div>' + papers.map((p) => `<button data-paper="${p.id}" class="${this.paper?.id === p.id ? 'on' : ''}"><b>${p.title}</b><small>${p.sub}</small></button>`).join('');
    if (this.paper && this.picked) {
      const m = this.picked;
      html += `<div class="tr-pick"><b>${m.label}</b><small>${m.kind === 'rumour' ? 'A rumour: somewhere inside the circle.' : m.kind === 'sighting' ? 'A sighting: closer than a rumour.' : m.kind === 'lair' ? 'A confirmed lair.' : 'Marked on this paper.'}</small>` +
        (m.copied ? '<small class="ok">Already on your sheet.</small>' : `<button data-copy>Copy by hand (free)</button>`) +
        (!m.copied && m.price !== undefined && m.price !== null && this.paper.buy ? `<button data-buy>Have the clerk ink it (${m.price}g)</button>` : '') + '</div>';
    } else if (this.paper) html += '<div class="tr-pick"><small>Click a mark on the paper (right) to copy it.</small></div>';
    this.tray.innerHTML = html;
    this.tray.querySelectorAll<HTMLButtonElement>('[data-paper]').forEach((b) => b.addEventListener('click', () => {
      const p = papers.find((q) => q.id === b.dataset.paper) ?? null;
      this.paper = this.paper?.id === p?.id ? null : p;
      this.picked = null;
      this.copying = null;
      this.paperComp = null;
      this.buildTray();
      this.buildTools();
      this.draw();
    }));
    this.tray.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', () => {
      if (!this.paper || !this.picked) return;
      this.copying = { paper: this.paper, mark: this.picked };
      this.tool = 'pan';
      this.buildTools();
    });
    this.tray.querySelector<HTMLButtonElement>('[data-buy]')?.addEventListener('click', () => {
      if (!this.paper?.buy || !this.picked) return;
      const err = this.paper.buy(this.picked.id);
      if (err) { this.help.textContent = err; return; }
      this.picked.copied = true;
      this.buildTray();
      this.draw();
    });
  }

  private openNote(wx: number, wz: number, edit?: MapMark) {
    this.noteBox.classList.remove('hidden');
    const input = this.noteBox.querySelector('input')!;
    input.value = edit?.text ?? '';
    input.focus();
    const done = (ok: boolean) => {
      this.noteBox.classList.add('hidden');
      input.onkeydown = null;
      if (!ok) return;
      const t = input.value.trim();
      if (edit) { if (t) edit.text = t; else this.discovery.removeMark(edit.id); }
      else if (t) this.discovery.addMark({ kind: 'note', x: wx, z: wz, text: t, color: INKS[this.ink] });
      this.draw();
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      else if (e.key === 'Escape') done(false);
    };
    (this.noteBox.querySelector('[data-ok]') as HTMLButtonElement).onclick = () => done(true);
    (this.noteBox.querySelector('[data-cancel]') as HTMLButtonElement).onclick = () => done(false);
  }

  // ---- geometry ---------------------------------------------------------------------
  /** the split: your sheet on the left, the paper on the right */
  private get split() {
    return this.paper ? Math.round(this.canvas.width / 2) : this.canvas.width;
  }
  private scale() {
    const fit = Math.min(this.split / MAP_PX[0], this.canvas.height / MAP_PX[1]);
    return fit * this.zoom;
  }
  /** screen to map pixels; the right pane uses the same view, shifted */
  private screenToMap(sx: number, sy: number) {
    const s = this.scale();
    const pane = this.paper && sx > this.split ? this.split : 0;
    return new THREE.Vector2(this.pan.x + (sx - pane - this.split / 2) / s, this.pan.y + (sy - this.canvas.height / 2) / s);
  }
  private mapToScreen(px: number, py: number, pane = 0) {
    const s = this.scale();
    return new THREE.Vector2(pane + this.split / 2 + (px - this.pan.x) * s, this.canvas.height / 2 + (py - this.pan.y) * s);
  }
  private worldToScreen(x: number, z: number, pane = 0) {
    const p = worldToPx(x, z);
    return this.mapToScreen(p.x, p.y, pane);
  }
  private screenToWorld(sx: number, sy: number) {
    const m = this.screenToMap(sx, sy);
    return { x: (m.x - (worldToPx(0, 0).x)) * MPP, z: (m.y - worldToPx(0, 0).y) * MPP };
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const onPaper = !!this.paper && e.offsetX > this.split;
      const w = this.screenToWorld(e.offsetX, e.offsetY);
      if (onPaper) {
        // pick a mark on the paper
        const near = this.paperMarkAt(e.offsetX, e.offsetY);
        if (near) { this.picked = near; this.buildTray(); this.draw(); return; }
      } else if (this.copying) {
        this.drawing = { tool: 'circle', wx: w.x, wz: w.z, ex: w.x, ez: w.z, preset: this.copying };
        return;
      } else if (this.tool === 'circle' || this.tool === 'line') {
        this.drawing = { tool: this.tool, wx: w.x, wz: w.z, ex: w.x, ez: w.z };
        return;
      } else if (this.tool !== 'pan') {
        this.clickTool(w.x, w.z);
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
    });
    window.addEventListener('mouseup', () => {
      this.drag = null;
      if (this.drawing) this.finishDrawing();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.open) return;
      if (this.drawing) {
        const r = this.canvas.getBoundingClientRect();
        const w = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
        this.drawing.ex = w.x;
        this.drawing.ez = w.z;
        this.draw();
        return;
      }
      if (!this.drag) return;
      const s = this.scale();
      this.pan.set(this.drag.px - (e.clientX - this.drag.x) / s, this.drag.py - (e.clientY - this.drag.y) / s);
      this.draw();
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.screenToMap(e.offsetX, e.offsetY);
      this.zoom = Math.max(0.6, Math.min(8, this.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      const after = this.screenToMap(e.offsetX, e.offsetY);
      this.pan.x += before.x - after.x;
      this.pan.y += before.y - after.y;
      this.draw();
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.paper && e.offsetX > this.split) return;
      const w = this.screenToWorld(e.offsetX, e.offsetY);
      const near = this.discovery.markNear(w.x, w.z, (14 / this.scale()) * MPP);
      if (near) this.discovery.removeMark(near.id);
      else this.discovery.addMark({ kind: 'pin', x: w.x, z: w.z, glyph: this.glyph, color: INKS[this.ink] });
      this.draw();
    });
    c.addEventListener('mousemove', (e) => {
      if (this.drag || this.drawing) return;
      this.hover = null;
      const onPaper = !!this.paper && e.offsetX > this.split;
      if (onPaper) {
        const pm = this.paperMarkAt(e.offsetX, e.offsetY);
        if (pm) this.hover = { sx: e.offsetX, sy: e.offsetY, text: pm.label };
        this.info.textContent = this.paper!.title;
        return;
      }
      const w = this.screenToWorld(e.offsetX, e.offsetY);
      const mk = this.discovery.markNear(w.x, w.z, (12 / this.scale()) * MPP);
      if (mk?.text) this.hover = { sx: e.offsetX, sy: e.offsetY, text: mk.text + (mk.day !== undefined ? ` (copied day ${mk.day})` : '') };
      const gx = Math.floor((w.x - this.x0()) / CELL), gz = Math.floor((w.z - this.z0()) / CELL);
      const inked = gx >= 0 && gz >= 0 && gx < GW && gz < GH && this.discovery.isInked(gx, gz);
      const m = this.screenToMap(e.offsetX, e.offsetY);
      const rd = REGION_DEFS.find((r) => this.discovery.regions.has(r.id) && this.inRegion(r, m.x, m.y));
      this.info.textContent = inked && rd ? `${REGIONS[rd.id]?.name ?? rd.id} · ${REGIONS[rd.id]?.subtitle ?? ''}` : '';
    });
  }

  private x0() { return -worldToPx(0, 0).x * MPP; }
  private z0() { return -worldToPx(0, 0).y * MPP; }

  private clickTool(x: number, z: number) {
    const near = this.discovery.markNear(x, z, (14 / this.scale()) * MPP);
    if (this.tool === 'pin') this.discovery.addMark({ kind: 'pin', x, z, glyph: this.glyph, color: INKS[this.ink] });
    else if (this.tool === 'note') {
      if (near && near.kind === 'note') this.openNote(x, z, near);
      else this.openNote(x, z);
    } else if (this.tool === 'strike' && near) near.struck = !near.struck;
    else if (this.tool === 'erase' && near) this.discovery.removeMark(near.id);
    this.draw();
  }

  private finishDrawing() {
    const d = this.drawing!;
    this.drawing = null;
    const len = Math.hypot(d.ex - d.wx, d.ez - d.wz);
    if (d.preset) {
      // A copied rumour goes where YOU put it; too small a drag keeps the paper's own size.
      const r = len > 30 ? len : d.preset.mark.r ?? 250;
      this.discovery.addMark({ kind: 'rumour', x: d.wx, z: d.wz, r, rumour: d.preset.mark.id, text: d.preset.mark.label, color: INKS.red, glyph: d.preset.mark.glyph });
      d.preset.mark.copied = true;
      this.onCopy?.(d.preset.paper, d.preset.mark);
      this.copying = null;
      this.buildTools();
      this.buildTray();
    } else if (d.tool === 'circle' && len > 20) this.discovery.addMark({ kind: 'circle', x: d.wx, z: d.wz, r: len, color: INKS[this.ink] });
    else if (d.tool === 'line' && len > 20) this.discovery.addMark({ kind: 'line', x: d.wx, z: d.wz, x2: d.ex, z2: d.ez, color: INKS[this.ink] });
    this.draw();
  }

  private paperMarkAt(sx: number, sy: number) {
    if (!this.paper) return null;
    let best: PaperMark | null = null, bd = 18;
    for (const m of this.paper.marks) {
      const p = this.worldToScreen(m.x, m.z, this.split);
      let d = Math.hypot(p.x - sx, p.y - sy);
      if (m.r) d = Math.min(d, Math.max(0, d - m.r / MPP * this.scale()));
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  private inRegion(r: (typeof REGION_DEFS)[number], px: number, py: number) {
    if ('circle' in r && r.circle) return Math.hypot(px - r.circle[0], py - r.circle[1]) <= r.circle[2];
    const poly = (r as { poly?: number[][] }).poly;
    if (!poly) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Centre the map on a world point (the journal's "Show on map"). */
  focus(x: number, z: number) {
    const p = worldToPx(x, z);
    this.pan.set(p.x, p.y);
    this.zoom = 2.6;
    this.focused = true;
  }
  private focused = false;

  /** Open the map on a patch that just inked in, with the reveal. */
  showReveal(x: number, z: number, label: string) {
    this.focus(x, z);
    this.zoom = 2.2;
    this.reveal = { x, z, t: 0, label };
    this.compDirty = true;
    if (!this.open) this.toggle(true);
  }

  toggle(open = !this.open) {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open && this.focused) {
      this.focused = false;
      this.resize();
    } else if (open) {
      const p = worldToPx(this.player.x, this.player.z);
      this.pan.set(p.x, p.y);
      this.zoom = 2.2;
      this.resize();
    }
    if (open) {
      this.buildTray();
      this.buildTools();
      this.buildCharts();
    } else {
      this.paper = null;
      this.picked = null;
      this.copying = null;
      this.noteBox.classList.add('hidden');
    }
    this.onToggle?.(open);
  }

  private buildCharts() {
    const rows = this.chartProgress().filter((r) => r.have > 0);
    this.legendCharts.innerHTML = rows.length ? '<div class="lg-sub">Charts</div>' + rows.map((r) => `<div class="${r.have >= r.of ? 'done' : ''}">${r.name} <b>${r.have}/${r.of}</b></div>`).join('') : '';
  }

  markFogDirty() {
    this.compDirty = true;
    if (this.open) this.buildCharts();
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(200, Math.round(r.width));
    this.canvas.height = Math.max(200, Math.round(r.height));
    this.draw();
  }

  /** A GW x GH mask of one layer, as white-on-clear for compositing. */
  private mask(layer: 'sketch' | 'ink') {
    const m = document.createElement('canvas');
    m.width = GW; m.height = GH;
    const g = m.getContext('2d')!;
    const img = g.createImageData(GW, GH);
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
      const on = layer === 'ink' ? this.discovery.isInked(x, z) : this.discovery.isRevealed(x, z);
      img.data[(z * GW + x) * 4 + 3] = on ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    return m;
  }

  /** Cloud, then the sketch where you've walked, then the ink where your maps reach. */
  private rebuildComp() {
    if (!this.img || !this.sketch) return;
    const W = MAP_PX[0], H = MAP_PX[1];
    const g = this.comp.getContext('2d')!;
    // The unknown: drifting blue-grey cloud.
    g.fillStyle = '#1b2a40';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.35;
    g.filter = 'blur(6px) saturate(0.4) brightness(0.55)';
    g.drawImage(this.img, 0, 0, W, H);
    g.filter = 'none';
    g.globalAlpha = 1;
    const cellPx = CELL / MPP;
    const layer = (srcImg: CanvasImageSource, which: 'sketch' | 'ink', soft: number) => {
      const t = document.createElement('canvas');
      t.width = W; t.height = H;
      const tg = t.getContext('2d')!;
      tg.drawImage(srcImg, 0, 0, W, H);
      tg.globalCompositeOperation = 'destination-in';
      tg.filter = `blur(${soft}px)`;
      tg.imageSmoothingEnabled = true;
      tg.drawImage(this.mask(which), 0, 0, GW * cellPx, GH * cellPx);
      g.drawImage(t, 0, 0);
    };
    layer(this.sketch, 'sketch', 2.5);
    layer(this.img, 'ink', 1.6);
    this.compDirty = false;
    this.compAge = 0;
    this.regionNamed.clear();
    for (const r of REGION_DEFS) if (this.discovery.regions.has(r.id) && this.discovery.explored(r.id) >= 0.08) this.regionNamed.add(r.id);
  }

  private ensurePaperComp() {
    if (this.paperComp || !this.img) return;
    const c = document.createElement('canvas');
    c.width = MAP_PX[0]; c.height = MAP_PX[1];
    const g = c.getContext('2d')!;
    g.filter = 'sepia(0.55) saturate(0.8) brightness(0.92)';
    g.drawImage(this.img, 0, 0);
    g.filter = 'none';
    this.paperComp = c;
  }

  /** Sea routes (dashed gold), currents (dashed blue), and the sea's marks. */
  private drawSea(g: CanvasRenderingContext2D) {
    g.save();
    for (const l of this.seaLines()) {
      g.setLineDash(l.kind === 'route' ? [8, 6] : [3, 5]);
      g.strokeStyle = l.kind === 'route' ? 'rgba(242, 214, 138, 0.8)' : 'rgba(140, 220, 255, 0.85)';
      g.lineWidth = l.kind === 'route' ? 2 : 3;
      g.beginPath();
      l.pts.forEach(([x, z], i) => { const p = this.worldToScreen(x, z); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
      g.stroke();
    }
    g.setLineDash([]);
    const STYLE: Record<string, [string, string]> = { ship: ['⛵', '#9fdcff'], wreck: ['✕', '#d8c8b0'], light: ['✸', '#ffe08a'], storm: ['☁', '#b8c0d8'], dest: ['⚓', '#ffd76a'], treasure: ['✖', '#ff6a4a'] };
    g.textAlign = 'center';
    for (const m of this.seaMarkers()) {
      const p = this.worldToScreen(m.x, m.z);
      const [glyph, color] = STYLE[m.kind] ?? ['•', '#fff'];
      g.font = m.kind === 'storm' ? '22px serif' : '16px serif';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(glyph, p.x, p.y + 6);
      g.fillStyle = color;
      g.fillText(glyph, p.x, p.y + 6);
      if (m.label && this.zoom > 2.2) {
        g.font = '600 11px Inter, sans-serif';
        g.strokeText(m.label, p.x, p.y + 22);
        g.fillStyle = '#fff4d8';
        g.fillText(m.label, p.x, p.y + 22);
      }
    }
    g.restore();
  }

  private label(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string) {
    g.font = font;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }

  /** One of your marks, in your own hand. */
  private drawMark(g: CanvasRenderingContext2D, m: MapMark | { kind: MapMark['kind']; x: number; z: number; r?: number; x2?: number; z2?: number; color?: string; glyph?: string; text?: string; struck?: boolean }, ghost = false) {
    const p = this.worldToScreen(m.x, m.z);
    const s = this.scale() / MPP; // screen px per metre
    const col = m.color ?? INKS.red;
    g.save();
    g.globalAlpha = ghost ? 0.6 : m.struck ? 0.55 : 1;
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineCap = 'round';
    if (m.kind === 'circle' || m.kind === 'rumour') {
      const r = (m.r ?? 200) * s;
      g.lineWidth = 2.5;
      g.setLineDash(m.kind === 'rumour' ? [7, 5] : []);
      g.beginPath();
      // a hand-drawn ring: slightly uneven, overlapping at the end
      for (let a = 0; a <= Math.PI * 2.08; a += 0.12) {
        const rr = r * (1 + 0.03 * Math.sin(a * 3 + m.x));
        const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
      if (m.kind === 'rumour') {
        const gi = this.glyphImg.get(m.glyph ?? 'rumour');
        if (gi) g.drawImage(gi, p.x - 13, p.y - 13, 26, 26);
      }
    } else if (m.kind === 'line' && m.x2 !== undefined && m.z2 !== undefined) {
      const q = this.worldToScreen(m.x2, m.z2);
      g.lineWidth = 2.5;
      g.setLineDash([10, 6]);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
      g.setLineDash([]);
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.lineTo(q.x - Math.cos(a - 0.45) * 12, q.y - Math.sin(a - 0.45) * 12);
      g.moveTo(q.x, q.y);
      g.lineTo(q.x - Math.cos(a + 0.45) * 12, q.y - Math.sin(a + 0.45) * 12);
      g.stroke();
    } else if (m.kind === 'pin') {
      const gi = this.glyphImg.get(m.glyph ?? 'flag');
      if (gi) g.drawImage(gi, p.x - 14, p.y - 26, 28, 28);
      else { g.font = '18px serif'; g.textAlign = 'center'; g.fillText('⚑', p.x, p.y); }
    } else if (m.kind === 'note') {
      g.font = 'italic 600 13px "Segoe Script", "Bradley Hand", cursive';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(240,226,190,0.85)';
      g.strokeText(m.text ?? '', p.x, p.y);
      g.fillStyle = col;
      g.fillText(m.text ?? '', p.x, p.y);
    }
    if ((m.kind === 'pin' || m.kind === 'rumour' || m.kind === 'circle') && m.text && this.zoom > 1.8) {
      g.textAlign = 'center';
      g.font = 'italic 600 11px "Segoe Script", "Bradley Hand", cursive';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(240,226,190,0.85)';
      const y = m.kind === 'pin' ? p.y + 14 : p.y + (m.r ?? 0) * s + 14;
      g.strokeText(m.text, p.x, y);
      g.fillStyle = col;
      g.fillText(m.text, p.x, y);
    }
    if (m.struck) {
      g.strokeStyle = INKS.red;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(p.x - 14, p.y - 14); g.lineTo(p.x + 14, p.y + 14);
      g.moveTo(p.x + 14, p.y - 14); g.lineTo(p.x - 14, p.y + 14);
      g.stroke();
    }
    g.restore();
  }

  /** Your sheet: cloud, sketch, ink, roads, names, places, marks, the player and a compass. */
  draw() {
    if (!this.open) return;
    const g = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    g.fillStyle = '#0b1526';
    g.fillRect(0, 0, W, H);
    if (!this.img) return;
    if (this.compDirty && this.sketch) this.rebuildComp();
    g.save();
    g.beginPath();
    g.rect(0, 0, this.split, H);
    g.clip();
    const tl = this.mapToScreen(0, 0), br = this.mapToScreen(MAP_PX[0], MAP_PX[1]);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.sketch ? this.comp : this.img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    // The reveal: a gold brush stroke sweeping over the new ink.
    if (this.reveal) {
      this.reveal.t += 1 / 60;
      const p = this.worldToScreen(this.reveal.x, this.reveal.z);
      const k = Math.min(1, this.reveal.t / 1.6);
      const r = (180 + 700 * k) * (this.scale() / MPP);
      const grd = g.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r);
      grd.addColorStop(0, 'rgba(255,220,140,0)');
      grd.addColorStop(0.8, `rgba(255,220,140,${0.45 * (1 - k)})`);
      grd.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.split, H);
      g.textAlign = 'center';
      this.label(g, this.reveal.label, p.x, p.y - 40, '700 20px Cinzel, serif', `rgba(255,236,190,${1 - k * 0.6})`);
      if (this.reveal.t > 3.2) this.reveal = null;
    }
    // Your trail: a faint pencil line.
    const tr = this.discovery.trail;
    if (tr.length >= 4) {
      g.save();
      g.strokeStyle = 'rgba(60,40,24,0.55)';
      g.lineWidth = 1.5;
      g.setLineDash([2, 5]);
      g.beginPath();
      for (let i = 0; i < tr.length; i += 2) {
        const p = this.worldToScreen(tr[i], tr[i + 1]);
        if (i === 0 || Math.hypot(tr[i] - tr[i - 2], tr[i + 1] - tr[i - 1]) > 200) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
      g.stroke();
      g.restore();
    }
    // Roads on your map (in ink only).
    g.lineCap = 'round';
    for (const line of ROAD_LINES) {
      g.beginPath();
      let started = false;
      for (const [x, z] of line) {
        const p = this.worldToScreen(x, z);
        if (!this.discovery.isInkedAt(x, z)) { started = false; continue; }
        if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
      }
      g.strokeStyle = 'rgba(40,24,10,0.55)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = '#e7c98a';
      g.lineWidth = 2;
      g.stroke();
    }
    // Region names: only where your maps reach.
    g.textAlign = 'center';
    for (const r of REGION_DEFS) {
      if (!this.discovery.regions.has(r.id) || !this.regionNamed.has(r.id)) continue;
      const def = REGIONS[r.id];
      if (!def) continue;
      let cx: number, cy: number;
      if ('circle' in r && r.circle) [cx, cy] = [r.circle[0], r.circle[1] - r.circle[2] - 6];
      else {
        const poly = (r as { poly: number[][] }).poly;
        cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
        cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      }
      const p = this.mapToScreen(cx, cy);
      const size = Math.max(11, Math.min(26, 13 * this.zoom * ('circle' in r ? 0.55 : 1)));
      g.font = `700 ${size}px Cinzel, serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(6,12,24,0.8)';
      g.strokeText(def.name, p.x, p.y);
      g.fillStyle = '#f4e2b0';
      g.fillText(def.name, p.x, p.y);
      g.font = `italic 500 ${Math.max(9, size * 0.5)}px Inter, sans-serif`;
      g.fillStyle = 'rgba(244,226,176,0.8)';
      g.fillText(def.subtitle, p.x, p.y + size * 0.8);
    }
    // Places: named and iconned when on your map; a pencil question where you've only seen them.
    for (const l of this.discovery.landmarks) {
      const k = this.discovery.places.get(l.id);
      if (!k) continue;
      const p = this.worldToScreen(l.x, l.z);
      const named = this.discovery.named(l.id);
      if (!named) {
        this.label(g, '?', p.x, p.y + 6, '700 16px Cinzel, serif', '#c9b48a');
        continue;
      }
      const icon = KIND_ICON[l.kind] ?? KIND_ICON.landmark;
      const known = k === 'known';
      this.label(g, icon.glyph, p.x, p.y + 6, `${known ? 14 : 18}px serif`, known ? 'rgba(220,210,190,0.8)' : icon.color);
      const capital = l.kind === 'capital';
      if ((capital || this.zoom > 2.6) && !REGIONS[l.id]) {
        this.label(g, l.name, p.x, p.y + 22, capital ? '700 14px Cinzel, serif' : '600 12px Inter, sans-serif', '#fff4d8');
      }
    }
    // Your own marks (under the game's markers, so quests stay readable).
    for (const m of this.discovery.marks) this.drawMark(g, m);
    if (this.drawing) {
      const d = this.drawing;
      const r = Math.hypot(d.ex - d.wx, d.ez - d.wz);
      if (d.preset || d.tool === 'circle') this.drawMark(g, { kind: d.preset ? 'rumour' : 'circle', x: d.wx, z: d.wz, r: Math.max(30, r), color: d.preset ? INKS.red : INKS[this.ink], glyph: d.preset?.mark.glyph }, true);
      else this.drawMark(g, { kind: 'line', x: d.wx, z: d.wz, x2: d.ex, z2: d.ez, color: INKS[this.ink] }, true);
    }
    // Quest objectives, quest givers, found bosses and sites (the tracked objective on top, ringed).
    const marks = [...this.siteMarkers(), ...this.bossMarkers().filter((m) => m.kind !== 'bossRumour'), ...this.questMarkers()].sort((a, b) => Number(!!a.tracked) - Number(!!b.tracked));
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
    for (const m of marks) {
      const p = this.worldToScreen(m.x, m.z);
      const st = MARK_STYLE[m.kind];
      if (m.tracked) {
        g.beginPath();
        g.arc(p.x, p.y, 13 + pulse * 5, 0, Math.PI * 2);
        g.strokeStyle = `rgba(255, 215, 106, ${0.9 - pulse * 0.5})`;
        g.lineWidth = 2.5;
        g.stroke();
      } else if (m.kind === 'offer') {
        g.beginPath();
        g.arc(p.x, p.y, 8, 0, Math.PI * 2);
        g.fillStyle = 'rgba(40, 28, 6, 0.85)';
        g.fill();
      }
      const sitey = m.kind === 'site' || m.kind === 'siteDone';
      const glyph = m.glyph ?? st.glyph;
      this.label(g, glyph, p.x, p.y + (m.kind === 'offer' ? 5 : 6), m.tracked ? 'bold 22px serif' : m.kind === 'offer' ? 'bold 13px serif' : sitey ? '14px serif' : '17px serif', m.kind === 'siteDone' ? st.color : m.color ?? st.color);
      if (sitey && m.label && this.zoom > 3 && !m.tracked) this.label(g, m.label, p.x, p.y + 19, '600 10px Inter, sans-serif', m.kind === 'siteDone' ? '#b8b0a0' : '#f0e6cc');
      const bossy = m.kind === 'boss' || m.kind === 'bossSlain';
      if (bossy && m.label && this.zoom > 1.6 && !m.tracked) this.label(g, m.label, p.x, p.y + 22, 'italic 600 11px Inter, sans-serif', '#ffd8c8');
      if (m.tracked && m.label) this.label(g, m.label, p.x, p.y + 30, '600 12px Inter, sans-serif', '#fff4d8');
    }
    this.drawSea(g);
    if (this.obscured > 0.01) this.drawMist(g, this.split, H, this.obscuredText);
    // The player.
    const ps = this.worldToScreen(this.player.x, this.player.z);
    g.save();
    g.translate(ps.x, ps.y);
    g.rotate(-this.playerYaw + Math.PI);
    g.beginPath();
    g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
    g.fillStyle = '#ff5d5d';
    g.strokeStyle = '#1a0b0b';
    g.lineWidth = 2;
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
    this.drawCompass(g, this.split - 90, H - 100, 52);
    if (this.paper) this.drawPaper(g, W, H);
    if (this.hover) {
      g.font = '600 12px Inter, sans-serif';
      const w = g.measureText(this.hover.text).width + 16;
      g.fillStyle = 'rgba(8,14,28,0.9)';
      g.fillRect(this.hover.sx + 12, this.hover.sy - 26, w, 22);
      g.fillStyle = '#f4e2b0';
      g.textAlign = 'left';
      g.fillText(this.hover.text, this.hover.sx + 20, this.hover.sy - 11);
    }
  }

  /** The paper laid beside your sheet: its own map and marks, same view, sepia. */
  private drawPaper(g: CanvasRenderingContext2D, W: number, H: number) {
    const pane = this.split;
    const paper = this.paper!;
    this.ensurePaperComp();
    g.save();
    g.beginPath();
    g.rect(pane, 0, W - pane, H);
    g.clip();
    g.fillStyle = '#c9b48a';
    g.fillRect(pane, 0, W - pane, H);
    const tl = this.mapToScreen(0, 0, pane), br = this.mapToScreen(MAP_PX[0], MAP_PX[1], pane);
    if (paper.inkAll && this.paperComp) g.drawImage(this.paperComp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    else if (this.paperComp) {
      // a sketchy paper: its maker only drew around what they marked
      for (const m of paper.marks) {
        const p = this.worldToScreen(m.x, m.z, pane);
        const r = ((m.r ?? 300) + 500) * (this.scale() / MPP);
        g.save();
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.clip();
        g.drawImage(this.paperComp, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        g.restore();
      }
    }
    for (const m of paper.marks) {
      const p = this.worldToScreen(m.x, m.z, pane);
      const s = this.scale() / MPP;
      const picked = this.picked?.id === m.id;
      if (m.r) {
        g.strokeStyle = m.kind === 'sighting' ? '#d9531e' : '#a31c14';
        g.lineWidth = picked ? 4 : 2.5;
        g.setLineDash(m.kind === 'rumour' ? [8, 5] : []);
        g.beginPath();
        g.arc(p.x, p.y, m.r * s, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(163,28,20,0.08)';
        g.fill();
      }
      const gi = this.glyphImg.get(m.glyph ?? (m.kind === 'lair' ? 'skull' : m.kind === 'place' ? 'tower' : 'rumour'));
      if (gi) g.drawImage(gi, p.x - 14, p.y - 14, 28, 28);
      if (picked || this.zoom > 1.4) {
        g.textAlign = 'center';
        this.label(g, m.label + (m.copied ? ' ✓' : ''), p.x, p.y + 26 + (m.r ? 0 : 0), `600 ${picked ? 13 : 11}px Inter, sans-serif`, picked ? '#fff4d8' : '#f0e2c0');
      }
    }
    g.restore();
    // the fold between the two papers
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(pane - 2, 0, 4, H);
    g.textAlign = 'center';
    this.label(g, paper.title, pane + (W - pane) / 2, 54, '700 16px Cinzel, serif', '#f4e2b0');
    this.label(g, 'YOUR SHEET', pane / 2, 54, '700 14px Cinzel, serif', '#f4e2b0');
  }

  /** Rolling grey fog over a map canvas, drifting with time. */
  private drawMist(g: CanvasRenderingContext2D, W: number, H: number, label?: string) {
    const a = this.obscured;
    const t = performance.now() / 1000;
    g.save();
    g.fillStyle = `rgba(58,64,62,${0.94 * a})`;
    g.fillRect(0, 0, W, H);
    for (let k = 0; k < 14; k++) {
      const x = ((Math.sin(k * 12.9 + t * 0.05 * (1 + (k % 3))) * 0.5 + 0.5) * W) | 0;
      const y = ((Math.cos(k * 7.3 + t * 0.04 * (1 + (k % 2))) * 0.5 + 0.5) * H) | 0;
      const r = Math.max(W, H) * (0.18 + (k % 4) * 0.06);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(150,158,152,${0.22 * a})`);
      grd.addColorStop(1, 'rgba(150,158,152,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    if (label) {
      g.font = '600 18px Cinzel, serif';
      g.textAlign = 'center';
      g.fillStyle = `rgba(226,230,222,${0.85 * a})`;
      g.fillText(label, W / 2, H * 0.18);
    }
    g.restore();
  }

  private drawCompass(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(8,14,28,0.55)';
    g.beginPath(); g.arc(0, 0, r + 8, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 8; k++) {
      const long = k % 2 === 0;
      g.save();
      g.rotate((k * Math.PI) / 4);
      g.beginPath();
      g.moveTo(0, -(long ? r : r * 0.6));
      g.lineTo(long ? 7 : 4, 0);
      g.lineTo(0, long ? 7 : 4);
      g.lineTo(-(long ? 7 : 4), 0);
      g.closePath();
      g.fillStyle = long ? '#e7c98a' : '#9c8456';
      g.fill();
      g.restore();
    }
    g.font = '700 13px Cinzel, serif';
    g.fillStyle = '#f4e2b0';
    g.textAlign = 'center';
    g.fillText('N', 0, -r - 12);
    g.restore();
  }

  /** Per-frame: player position for both maps; redraws the minimap a few times a second. */
  private miniT = 0;
  update(dt: number, player: THREE.Vector3, yaw: number, inOverworld: boolean) {
    this.player.copy(player);
    this.playerYaw = yaw;
    this.mini.classList.toggle('hidden', !inOverworld || !this.miniVisible);
    this.compAge += dt;
    if (this.open) this.draw();
    this.miniT -= dt;
    if (this.miniT > 0 || !inOverworld || !this.img) return;
    this.miniT = 0.1;
    // walking changes the sketch every few steps: rebuild at most twice a second
    if (this.compDirty && this.sketch && this.compAge > 0.5) this.rebuildComp();
    this.drawMini();
  }

  private drawMini() {
    const g = this.miniCtx;
    const S = this.miniCanvas.width;
    const metres = 520; // span of the minimap
    const pxPerM = S / metres;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    // Your sheet around the player.
    const mp = worldToPx(this.player.x, this.player.z);
    const crop = metres / MPP;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.sketch ? this.comp : this.img!, mp.x - crop / 2, mp.y - crop / 2, crop, crop, 0, 0, S, S);
    // Trail.
    const tr = this.discovery.trail;
    g.strokeStyle = 'rgba(60,40,24,0.6)';
    g.lineWidth = 1.5;
    g.setLineDash([2, 4]);
    g.beginPath();
    const start = Math.max(0, tr.length - 120);
    for (let i = start - (start % 2); i < tr.length; i += 2) {
      const sx = S / 2 + (tr[i] - this.player.x) * pxPerM, sy = S / 2 + (tr[i + 1] - this.player.z) * pxPerM;
      if (i === start - (start % 2)) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    }
    g.stroke();
    g.setLineDash([]);
    // Roads you have on your map.
    g.lineCap = 'round';
    g.strokeStyle = '#f0d9a4';
    g.lineWidth = 3;
    for (const line of ROAD_LINES) {
      g.beginPath();
      let started = false;
      for (const [x, z] of line) {
        const sx = S / 2 + (x - this.player.x) * pxPerM, sy = S / 2 + (z - this.player.z) * pxPerM;
        if (!this.discovery.isInkedAt(x, z) || sx < -60 || sy < -60 || sx > S + 60 || sy > S + 60) { started = false; continue; }
        if (!started) { g.moveTo(sx, sy); started = true; } else g.lineTo(sx, sy);
      }
      g.stroke();
    }
    // Places and your marks.
    g.textAlign = 'center';
    for (const l of this.discovery.landmarks) {
      if (!this.discovery.places.get(l.id)) continue;
      const sx = S / 2 + (l.x - this.player.x) * pxPerM, sy = S / 2 + (l.z - this.player.z) * pxPerM;
      if (sx < -10 || sy < -10 || sx > S + 10 || sy > S + 10) continue;
      const named = this.discovery.named(l.id);
      const icon = KIND_ICON[l.kind] ?? KIND_ICON.landmark;
      g.font = named ? '15px serif' : '700 14px Cinzel, serif';
      g.fillStyle = named ? icon.color : '#c9b48a';
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 3;
      const glyph = named ? icon.glyph : '?';
      g.strokeText(glyph, sx, sy + 5);
      g.fillText(glyph, sx, sy + 5);
    }
    for (const m of this.discovery.marks) {
      if (m.struck) continue;
      const sx = S / 2 + (m.x - this.player.x) * pxPerM, sy = S / 2 + (m.z - this.player.z) * pxPerM;
      if (m.kind === 'rumour' || m.kind === 'circle') {
        const r = (m.r ?? 200) * pxPerM;
        if (Math.hypot(sx - S / 2, sy - S / 2) - r > S / 2) continue;
        g.strokeStyle = m.color ?? INKS.red;
        g.lineWidth = 2;
        g.setLineDash(m.kind === 'rumour' ? [5, 4] : []);
        g.beginPath();
        g.arc(sx, sy, r, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      } else if (m.kind === 'pin') {
        if (sx < -10 || sy < -10 || sx > S + 10 || sy > S + 10) continue;
        const gi = this.glyphImg.get(m.glyph ?? 'flag');
        if (gi) g.drawImage(gi, sx - 10, sy - 18, 20, 20);
      }
    }
    for (const m of this.questMarkers()) {
      let sx = S / 2 + (m.x - this.player.x) * pxPerM, sy = S / 2 + (m.z - this.player.z) * pxPerM;
      // Off-map objectives pin to the rim (quest givers only show when close).
      const d = Math.hypot(sx - S / 2, sy - S / 2);
      if (d > S / 2 - 10) {
        if (m.kind === 'offer') continue;
        sx = S / 2 + ((sx - S / 2) / d) * (S / 2 - 10);
        sy = S / 2 + ((sy - S / 2) / d) * (S / 2 - 10);
      }
      const st = MARK_STYLE[m.kind];
      g.font = m.tracked ? 'bold 18px serif' : m.kind === 'offer' ? 'bold 12px serif' : '14px serif';
      g.fillStyle = st.color;
      g.strokeText(st.glyph, sx, sy + 5);
      g.fillText(st.glyph, sx, sy + 5);
    }
    if (this.obscured > 0.01) this.drawMist(g, S, S);
    // Player arrow.
    g.translate(S / 2, S / 2);
    g.rotate(-this.playerYaw + Math.PI);
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath();
    g.fillStyle = '#ff5d5d';
    g.strokeStyle = '#1a0b0b';
    g.lineWidth = 2;
    g.fill();
    g.stroke();
    g.restore();
  }

  /** Region name under the minimap. */
  setRegionLabel(text: string) {
    this.miniLabel.textContent = text;
  }
}
