// ---------------------------------------------------------------------------
// Hand-drawn dungeon maps (Etrian Odyssey style). The game never draws the
// dungeon for you: it only tells you where you stand and which way you face.
// You draw walls on cell edges, shade floor, drop icons and write notes.
//   minimap  : parchment in the top-right corner, centred on you
//   editor   : M opens the whole floor for drawing (the game pauses)
// ---------------------------------------------------------------------------

export const ICONS = ['door', 'chest', 'stairs', 'trap', 'enemy', 'key', 'gate'] as const;
export type Icon = (typeof ICONS)[number];
const ICON_LABEL: Record<Icon, string> = { door: 'Door', chest: 'Chest', stairs: 'Stairs', trap: 'Trap', enemy: 'Danger', key: 'Key', gate: 'Gate' };

export interface MapData {
  w: number;
  h: number;
  hw: number[]; // north edges, (h+1) rows of w
  vw: number[]; // west edges, h rows of (w+1)
  fill: number[]; // w*h
  icons: Record<string, Icon>; // "i,j" -> icon
  notes: { i: number; j: number; t: string }[];
}

export function emptyMap(w: number, h: number): MapData {
  return { w, h, hw: new Array(w * (h + 1)).fill(0), vw: new Array((w + 1) * h).fill(0), fill: new Array(w * h).fill(0), icons: {}, notes: [] };
}

type Tool = 'wall' | 'floor' | 'erase' | 'note' | Icon;

const INK = '#3b2a1a';
const PAPER = '#dcc9a0';

function drawIcon(g: CanvasRenderingContext2D, icon: Icon, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = g.fillStyle = INK;
  g.lineWidth = Math.max(1.2, s * 0.09);
  const r = s * 0.3;
  g.beginPath();
  switch (icon) {
    case 'door':
      g.rect(-r * 0.6, -r, r * 1.2, r * 2);
      g.stroke();
      g.beginPath();
      g.arc(r * 0.25, 0, s * 0.05, 0, Math.PI * 2);
      g.fill();
      break;
    case 'chest':
      g.rect(-r, -r * 0.5, r * 2, r * 1.2);
      g.moveTo(-r, -r * 0.05);
      g.lineTo(r, -r * 0.05);
      g.stroke();
      break;
    case 'stairs':
      for (let k = 0; k < 3; k++) {
        g.moveTo(-r + k * r * 0.66, r - k * r * 0.66);
        g.lineTo(-r + (k + 1) * r * 0.66, r - k * r * 0.66);
        g.lineTo(-r + (k + 1) * r * 0.66, r - (k + 1) * r * 0.66);
      }
      g.stroke();
      break;
    case 'trap':
      g.moveTo(-r, r);
      g.lineTo(-r * 0.5, -r);
      g.lineTo(0, r);
      g.lineTo(r * 0.5, -r);
      g.lineTo(r, r);
      g.stroke();
      break;
    case 'enemy':
      g.fillStyle = '#8a1c14';
      g.moveTo(0, -r);
      g.lineTo(r, r);
      g.lineTo(-r, r);
      g.closePath();
      g.fill();
      g.fillStyle = PAPER;
      g.fillRect(-s * 0.03, -r * 0.3, s * 0.06, r * 0.7);
      break;
    case 'key':
      g.arc(-r * 0.4, 0, r * 0.4, 0, Math.PI * 2);
      g.moveTo(0, 0);
      g.lineTo(r, 0);
      g.lineTo(r, r * 0.5);
      g.stroke();
      break;
    case 'gate':
      for (let k = -1; k <= 1; k++) {
        g.moveTo(k * r * 0.6, -r);
        g.lineTo(k * r * 0.6, r);
      }
      g.moveTo(-r, -r * 0.3);
      g.lineTo(r, -r * 0.3);
      g.stroke();
      break;
  }
  g.restore();
}

/** Paint a region of a map onto a canvas. `view` = cells visible; `ox, oy` = top-left cell (fractional ok). */
function paint(g: CanvasRenderingContext2D, d: MapData, cs: number, ox: number, oy: number, cols: number, rows: number, player?: { x: number; y: number; yaw: number }) {
  const W = cols * cs, H = rows * cs;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  // Aged paper: blotches and fibres.
  g.fillStyle = 'rgba(120, 90, 50, 0.05)';
  for (let k = 0; k < 18; k++) {
    const x = ((k * 97) % 100) / 100 * W, y = ((k * 57) % 100) / 100 * H;
    g.beginPath();
    g.arc(x, y, cs * (1 + (k % 3)), 0, Math.PI * 2);
    g.fill();
  }
  const X = (i: number) => (i - ox) * cs, Y = (j: number) => (j - oy) * cs;
  // Faint grid inside the floor bounds.
  g.strokeStyle = 'rgba(90, 64, 34, 0.18)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= d.w; i++) {
    g.moveTo(X(i), Y(0));
    g.lineTo(X(i), Y(d.h));
  }
  for (let j = 0; j <= d.h; j++) {
    g.moveTo(X(0), Y(j));
    g.lineTo(X(d.w), Y(j));
  }
  g.stroke();
  // Floor shading.
  g.fillStyle = 'rgba(120, 88, 48, 0.22)';
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (d.fill[j * d.w + i]) g.fillRect(X(i) + 1, Y(j) + 1, cs - 2, cs - 2);
  // Walls in ink.
  g.strokeStyle = INK;
  g.lineWidth = Math.max(2, cs * 0.12);
  g.lineCap = 'round';
  g.beginPath();
  for (let j = 0; j <= d.h; j++) for (let i = 0; i < d.w; i++) if (d.hw[j * d.w + i]) {
    g.moveTo(X(i), Y(j));
    g.lineTo(X(i + 1), Y(j));
  }
  for (let j = 0; j < d.h; j++) for (let i = 0; i <= d.w; i++) if (d.vw[j * (d.w + 1) + i]) {
    g.moveTo(X(i), Y(j));
    g.lineTo(X(i), Y(j + 1));
  }
  g.stroke();
  for (const [k, icon] of Object.entries(d.icons)) {
    const [i, j] = k.split(',').map(Number);
    drawIcon(g, icon, X(i + 0.5), Y(j + 0.5), cs);
  }
  g.font = `italic ${Math.max(9, cs * 0.34)}px Georgia, serif`;
  g.fillStyle = INK;
  for (const n of d.notes) {
    g.beginPath();
    g.arc(X(n.i + 0.5), Y(n.j + 0.5), Math.max(2, cs * 0.08), 0, Math.PI * 2);
    g.fill();
    g.fillText(n.t, X(n.i + 0.5) + cs * 0.15, Y(n.j + 0.5) - cs * 0.12);
  }
  if (player) {
    g.save();
    g.translate(X(player.x), Y(player.y));
    g.rotate(player.yaw);
    g.fillStyle = '#b3261e';
    g.strokeStyle = '#fff4dc';
    g.lineWidth = 1.5;
    const a = cs * 0.34;
    g.beginPath();
    g.moveTo(0, -a);
    g.lineTo(a * 0.7, a * 0.7);
    g.lineTo(0, a * 0.35);
    g.lineTo(-a * 0.7, a * 0.7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

export class DungeonMapUI {
  private mini: HTMLDivElement;
  private miniCanvas: HTMLCanvasElement;
  private miniLabel: HTMLDivElement;
  private editor: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private tool: Tool = 'wall';
  private data: MapData | null = null;
  private floorName = '';
  private player = { x: 0, y: 0, yaw: 0 };
  private dragging = false;
  private dragValue = 1;
  open = false;
  onToggle?: (open: boolean) => void;
  onChange?: () => void;

  constructor() {
    const root = document.getElementById('ui')!;
    this.mini = document.createElement('div');
    this.mini.className = 'dmap-mini hidden';
    this.mini.innerHTML = `<canvas width="216" height="216"></canvas><div class="lbl"></div><div class="hint"><b>M</b> draw map</div>`;
    root.appendChild(this.mini);
    this.miniCanvas = this.mini.querySelector('canvas')!;
    this.miniLabel = this.mini.querySelector('.lbl')!;

    this.editor = document.createElement('div');
    this.editor.className = 'dmap-editor hidden';
    const tools: [Tool, string][] = [['wall', 'Wall'], ['floor', 'Floor'], ['erase', 'Erase'], ['note', 'Note'], ...ICONS.map((i) => [i, ICON_LABEL[i]] as [Tool, string])];
    this.editor.innerHTML = `
      <div class="dmap-head"><h2>MAP</h2><span class="floor"></span><span class="tip">Draw what you find. The game only shows where you are.</span></div>
      <div class="dmap-body">
        <div class="tools">${tools.map(([t, l]) => `<button data-t="${t}">${l}</button>`).join('')}</div>
        <div class="sheet"><canvas></canvas></div>
      </div>
      <div class="dmap-foot">Wall: click near a cell edge (drag to draw lines) · Floor: paint cells · Icons: click a cell · Note: click a cell to write · <b>M</b> / <b>Esc</b> close</div>`;
    root.appendChild(this.editor);
    this.canvas = this.editor.querySelector('canvas')!;
    this.editor.querySelectorAll<HTMLButtonElement>('.tools button').forEach((b) =>
      b.addEventListener('click', () => {
        this.tool = b.dataset.t as Tool;
        this.syncTools();
      }),
    );
    this.syncTools();
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.apply(e, true);
    });
    this.canvas.addEventListener('pointermove', (e) => this.dragging && this.apply(e, false));
    this.canvas.addEventListener('pointerup', () => {
      this.dragging = false;
      this.onChange?.();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.toggle(false);
      }
    }, true);
  }

  private syncTools() {
    this.editor.querySelectorAll<HTMLButtonElement>('.tools button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tool));
  }

  /** Show the map for a floor (null hides it, e.g. back on the surface). */
  setFloor(data: MapData | null, name = '') {
    this.data = data;
    this.floorName = name;
    this.mini.classList.toggle('hidden', !data);
    document.body.classList.toggle('in-dungeon', !!data);
    if (!data && this.open) this.toggle(false);
  }

  get current() {
    return this.data;
  }

  toggle(force?: boolean) {
    if (!this.data) return;
    this.open = force ?? !this.open;
    this.editor.classList.toggle('hidden', !this.open);
    this.mini.classList.toggle('map-open', this.open);
    if (this.open) this.drawEditor();
    else this.onChange?.();
    this.onToggle?.(this.open);
  }

  /** Player position in cells (fractional) and facing (radians, 0 = north, clockwise). */
  setPlayer(x: number, y: number, yaw: number) {
    this.player = { x, y, yaw };
  }

  private cellSize() {
    const d = this.data!;
    const max = Math.min(window.innerWidth - 260, window.innerHeight - 190);
    return Math.max(16, Math.floor(max / Math.max(d.w, d.h)));
  }

  private drawEditor() {
    const d = this.data!;
    const cs = this.cellSize();
    this.canvas.width = (d.w + 1) * cs;
    this.canvas.height = (d.h + 1) * cs;
    paint(this.canvas.getContext('2d')!, d, cs, -0.5, -0.5, d.w + 1, d.h + 1, this.player);
    this.editor.querySelector('.floor')!.textContent = this.floorName;
  }

  private apply(e: PointerEvent, first: boolean) {
    const d = this.data!;
    const cs = this.cellSize();
    const r = this.canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) * (this.canvas.width / r.width) / cs - 0.5;
    const fy = (e.clientY - r.top) * (this.canvas.height / r.height) / cs - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy);
    const inCell = i >= 0 && j >= 0 && i < d.w && j < d.h;
    const t = this.tool;
    if (t === 'wall' || t === 'erase') {
      // Nearest edge to the pointer.
      const ex = fx - Math.round(fx), ey = fy - Math.round(fy);
      let edge: { arr: 'hw' | 'vw'; idx: number } | null = null;
      if (Math.abs(ey) < Math.abs(ex) && Math.abs(ey) < 0.28) {
        const jj = Math.round(fy), ii = Math.floor(fx);
        if (ii >= 0 && ii < d.w && jj >= 0 && jj <= d.h) edge = { arr: 'hw', idx: jj * d.w + ii };
      } else if (Math.abs(ex) < 0.28) {
        const ii = Math.round(fx), jj = Math.floor(fy);
        if (jj >= 0 && jj < d.h && ii >= 0 && ii <= d.w) edge = { arr: 'vw', idx: jj * (d.w + 1) + ii };
      }
      if (edge) {
        if (t === 'erase') d[edge.arr][edge.idx] = 0;
        else {
          if (first) this.dragValue = d[edge.arr][edge.idx] ? 0 : 1;
          d[edge.arr][edge.idx] = this.dragValue;
        }
      } else if (t === 'erase' && inCell) {
        d.fill[j * d.w + i] = 0;
        delete d.icons[`${i},${j}`];
        d.notes = d.notes.filter((n) => n.i !== i || n.j !== j);
      }
    } else if (t === 'floor' && inCell) {
      if (first) this.dragValue = d.fill[j * d.w + i] ? 0 : 1;
      d.fill[j * d.w + i] = this.dragValue;
    } else if (t === 'note' && inCell && first) {
      const existing = d.notes.find((n) => n.i === i && n.j === j);
      const text = window.prompt('Note for this spot:', existing?.t ?? '');
      d.notes = d.notes.filter((n) => n.i !== i || n.j !== j);
      if (text && text.trim()) d.notes.push({ i, j, t: text.trim().slice(0, 40) });
      this.dragging = false;
    } else if (inCell && first) {
      const k = `${i},${j}`;
      if (d.icons[k] === t) delete d.icons[k];
      else d.icons[k] = t as Icon;
    }
    this.drawEditor();
  }

  update() {
    if (!this.data) return;
    const d = this.data;
    const cs = 24, cols = 9;
    const ox = this.player.x - cols / 2, oy = this.player.y - cols / 2;
    const g = this.miniCanvas.getContext('2d')!;
    paint(g, d, cs, ox, oy, cols, cols, this.player);
    this.miniLabel.textContent = this.floorName;
    if (this.open) this.drawEditor();
  }
}

