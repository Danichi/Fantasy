import type * as THREE from 'three';
import type { WheelNode } from '../../story/sunwheel';
import type { DarkFlags, DarkRun } from './tether';
import { ancientHeight, DARK_X, DARK_Z, SCARS } from './land';

const time = (s: number) => {
  const t = Math.ceil(Math.max(0, s));
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text = '') => {
  const e = document.createElement(tag);
  e.textContent = text;
  parent.appendChild(e);
  return e;
};

export class DarkView {
  readonly hud: HTMLDivElement;
  readonly map: HTMLDivElement;
  private fill: HTMLDivElement;
  private readout: HTMLDivElement;
  private bearing: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private recall: HTMLButtonElement;
  private mapRecall: HTMLButtonElement;
  private last: { run: DarkRun; capacity: number; nodes: WheelNode[]; flags: DarkFlags; x: number; z: number } | null = null;
  private span = 3200;
  private redraw = true;
  open = false;
  constructor(
    recall: () => void,
    private onToggle: (open: boolean) => void
  ) {
    const css = document.createElement('style');
    css.textContent = `
      #ui.dark-exploring .quest-tracker,#ui.dark-exploring .wmini{display:none}
      #dark-tether{position:absolute;top:82px;left:50%;transform:translateX(-50%);width:min(410px,80vw);padding:12px 18px;color:#eee5d8;background:linear-gradient(100deg,#151522e8,#282335eb);border:1px solid #b6a07d77;border-radius:4px;text-align:center;pointer-events:auto;font:12px Inter,sans-serif;box-shadow:0 6px 30px #0006}
      #dark-tether[hidden],#dark-atlas[hidden]{display:none}#dark-tether strong{letter-spacing:.2em;font:14px Cinzel,serif}#dark-tether .dark-readout{margin:5px 0;color:#dcd0be}#dark-tether .dark-track{height:5px;background:#514653;margin:8px 0}.dark-fill{height:100%;background:linear-gradient(90deg,#a58ab7,#ffe2a7);transition:width .15s}#dark-tether.fraying{border-color:#dd7872}#dark-tether.fraying .dark-fill{background:#e38379}
      #dark-tether button,#dark-atlas button{background:#34303f;border:1px solid #b5a27c77;border-radius:3px;color:#f2e5cc;font:12px Inter,sans-serif;padding:7px 12px;cursor:pointer;margin:7px 3px 0}#dark-tether button:hover,#dark-atlas button:hover{background:#575063}#dark-tether button:disabled,#dark-atlas button:disabled{opacity:.4;cursor:default}
      #dark-atlas{position:absolute;inset:4vh 5vw;background:#171723f7;color:#eae0cf;border:1px solid #b9a27d88;z-index:170;pointer-events:auto;padding:22px;overflow:auto;font:13px Inter,sans-serif}#dark-atlas h2{font:24px Cinzel,serif;letter-spacing:.16em;margin:0 0 8px}#dark-atlas p{margin:7px 0;color:#c0b8c6;max-width:850px}#dark-atlas canvas{display:block;width:100%;height:min(53vh,490px);background:#222330;border:1px solid #635b6c;margin:15px 0}#dark-atlas .dark-map-actions{display:flex;flex-wrap:wrap;gap:5px;align-items:center}#dark-atlas .dark-legend{color:#ddc594}
    `;
    document.head.appendChild(css);
    const ui = document.getElementById('ui')!;
    this.hud = el('div', ui);
    this.hud.id = 'dark-tether';
    this.hud.hidden = true;
    el('strong', this.hud, 'THE DARK · DAWN TETHER');
    this.readout = el('div', this.hud);
    this.readout.className = 'dark-readout';
    const track = el('div', this.hud);
    track.className = 'dark-track';
    this.fill = el('div', track);
    this.fill.className = 'dark-fill';
    this.bearing = el('div', this.hud);
    this.recall = el('button', this.hud, 'Recall to entry');
    this.recall.onclick = recall;
    const mapButton = el('button', this.hud, 'M · Dark chart');
    mapButton.onclick = () => this.toggleMap();
    this.map = el('div', ui);
    this.map.id = 'dark-atlas';
    this.map.hidden = true;
    el('h2', this.map, 'THE WORLD BEFORE');
    el('p', this.map, 'The same continent, thousands of years before its living kingdoms. Ancient wounds open routes that modern roads and walls cannot follow.');
    el(
      'p',
      this.map,
      'Tether is separate from health. It drains as you explore and frays when you take damage. Sunwheels shelter it unless an enemy is close. On exhaustion, you return to the entry wheel.'
    );
    this.canvas = el('canvas', this.map);
    this.canvas.width = 1000;
    this.canvas.height = 520;
    const legend = el('p', this.map, '✦ You   ·   Gold: attuned ancient wheel   ·   Grey: known living wheel   ·   Blue: remembered battle scar');
    legend.className = 'dark-legend';
    el(
      'p',
      this.map,
      'Every ancient wheel can return you to its living location. Enemy nations remain hostile; the Dark provides an approach, not diplomatic immunity. Finding a new wheel or memory increases your permanent tether. Repeated visits do not refill it.'
    );
    const actions = el('div', this.map);
    actions.className = 'dark-map-actions';
    for (const [label, span] of [
      ['Local', 1600],
      ['Region', 4800],
      ['Continent', 24000],
    ] as const) {
      const b = el('button', actions, label);
      b.onclick = () => {
        this.span = span;
        this.redraw = true;
        this.draw();
      };
    }
    this.mapRecall = el('button', actions, 'Recall to entry Sunwheel');
    this.mapRecall.onclick = recall;
    const close = el('button', actions, 'M / Esc · Close chart');
    close.onclick = () => this.toggleMap(false);
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || (e.code !== 'Escape' && e.code !== 'KeyM')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.toggleMap(false);
      },
      true
    );
  }
  toggleMap(open = !this.open) {
    if (open && !this.last) return;
    if (open === this.open) return;
    this.open = open;
    this.map.hidden = !open;
    this.onToggle(open);
    this.redraw = true;
    if (open) this.draw();
  }
  update(run: DarkRun | null, capacity: number, nodes: WheelNode[], flags: DarkFlags, pos: THREE.Vector3, dead: boolean, paused = false) {
    document.getElementById('ui')!.classList.toggle('dark-exploring', !!run);
    this.hud.hidden = !run;
    if (!run) {
      this.last = null;
      this.toggleMap(false);
      return;
    }
    const x = pos.x - DARK_X,
      z = pos.z - DARK_Z;
    this.last = { run, capacity, nodes, flags, x, z };
    this.fill.style.width = `${Math.max(0, Math.min(100, (run.left / capacity) * 100))}%`;
    this.hud.classList.toggle('fraying', run.left <= 30);
    let nearest: WheelNode | null = null,
      distance = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < distance) {
        distance = d;
        nearest = n;
      }
    }
    const sheltered = distance < 5.3 && Math.abs(pos.y - ancientHeight(nearest?.pos.x ?? 0, nearest?.pos.z ?? 0)) < 5;
    this.readout.textContent = `${time(run.left)} / ${time(capacity)} · ${dead ? 'Connection lost' : paused ? 'Connection held · menu open' : sheltered ? 'At a Sunwheel · beware nearby enemies' : 'Exploring · tether draining'}`;
    if (nearest) {
      const angle = Math.atan2(nearest.pos.x - x, -(nearest.pos.z - z));
      const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][(Math.round(angle / (Math.PI / 4)) + 8) % 8];
      this.bearing.textContent =
        distance < 5.3 ? 'E · cross back or continue exploring' : `${flags['way:' + nearest.id] ? nearest.name : 'An unanswered Sunwheel'} · ${Math.round(distance)}m ${dir}`;
    }
    this.recall.disabled = this.mapRecall.disabled = dead;
    if (this.open) this.draw();
  }
  private draw() {
    if (!this.last || !this.redraw) return;
    this.redraw = false;
    const { x, z, nodes, flags } = this.last,
      c = this.canvas.getContext('2d')!,
      w = this.canvas.width,
      h = this.canvas.height,
      scale = w / this.span;
    const px = (v: number) => w / 2 + (v - x) * scale,
      pz = (v: number) => h / 2 + (v - z) * scale;
    c.fillStyle = '#232430';
    c.fillRect(0, 0, w, h);
    for (let j = 0; j < h; j += 8)
      for (let i = 0; i < w; i += 8) {
        const elevation = ancientHeight(x + (i - w / 2) / scale, z + (j - h / 2) / scale);
        const light = Math.max(13, Math.min(48, 22 + elevation / 25));
        c.fillStyle = `hsl(250 9% ${light}%)`;
        c.fillRect(i, j, 8, 8);
      }
    c.strokeStyle = '#9b8b7733';
    c.lineWidth = 1;
    for (let k = -6; k <= 6; k++) {
      c.beginPath();
      c.moveTo(w / 2 + k * 100, 0);
      c.lineTo(w / 2 + k * 100, h);
      c.stroke();
    }
    c.font = '12px sans-serif';
    for (const s of SCARS)
      if (flags['dark:memory:' + s.id]) {
        c.strokeStyle = '#8bc7d5';
        c.beginPath();
        c.arc(px(s.x), pz(s.z), Math.max(4, s.r * scale), 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = '#a9d6df';
        c.fillText(s.name, px(s.x) + 9, pz(s.z) - 9);
      }
    for (const n of nodes)
      if (flags['way:' + n.id] || flags['dark:wheel:' + n.id]) {
        const sx = px(n.pos.x),
          sz = pz(n.pos.z);
        if (sx < 0 || sx > w || sz < 0 || sz > h) continue;
        c.fillStyle = flags['dark:wheel:' + n.id] ? '#ffda96' : '#aaa7b5';
        c.fillText('✸', sx - 5, sz + 5);
        c.fillText(n.name, Math.min(w - 190, sx + 11), sz - 8);
      }
    c.fillStyle = '#fff4dc';
    c.font = '22px serif';
    c.fillText('✦', w / 2 - 9, h / 2 + 8);
    c.font = '13px sans-serif';
    c.fillText(`N ↑   ·   ${Math.round((this.span / 1000) * 10) / 10} km across   ·   ${Math.round(x)}, ${Math.round(z)}`, 14, 23);
  }
}
