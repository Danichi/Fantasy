import * as THREE from 'three';
import { GW, GH, CELL, WORLD_X0, WORLD_Z0, MAP_PX, worldToPx, REGION_DEFS } from '../world/worldMap';
import { REGIONS } from '../world/regionDefinitions';
import { ROAD_LINES } from '../world/terrainHeight';
import type { Discovery } from '../world/discovery';

// The world map (M in the overworld) and the local minimap (docs/ART-DIRECTION.md
// §2, the design board's "UI / Map Style"): the painted continent under a fog
// of war that lifts as the player explores, region names once entered, place
// markers by knowledge level, roads, quest markers, custom pins, a legend and
// a compass rose. The minimap is local only (prompt §50).

export interface MapMarker {
  x: number;
  z: number;
  kind: 'quest' | 'pin';
  label?: string;
}

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

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}

export class WorldMapUI {
  open = false;
  onToggle?: (open: boolean) => void;
  /** Quest markers (supplied by the quest system). */
  questMarkers: () => MapMarker[] = () => [];
  pins: MapMarker[] = [];
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private fog: HTMLCanvasElement;
  private fogDirty = true;
  private zoom = 1;
  private pan = new THREE.Vector2(); // map pixel at the view centre
  private drag: { x: number; y: number; px: number; py: number } | null = null;
  private player = new THREE.Vector3();
  private playerYaw = 0;
  private info: HTMLDivElement;
  // Minimap
  private mini: HTMLDivElement;
  private miniCanvas: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private miniLabel: HTMLDivElement;
  miniVisible = true;

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
          <div><i style="color:#8fd3ff">⚓</i> Port</div>
          <div><i class="lg-road"></i> Road</div>
          <div><i class="lg-sea"></i> Sea Route</div>
        </div>
        <div class="wmap-info"></div>
        <div class="wmap-help">Drag to pan · Wheel to zoom · Right-click to pin · M to close</div>
      </div>`;
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.info = this.el.querySelector('.wmap-info')!;
    this.fog = document.createElement('canvas');
    this.fog.width = GW;
    this.fog.height = GH;

    this.mini = document.createElement('div');
    this.mini.className = 'wmini';
    this.mini.innerHTML = '<canvas width="200" height="200"></canvas><div class="wmini-ring"></div><div class="wmini-n">N</div><div class="wmini-lbl"></div>';
    root.appendChild(this.mini);
    this.miniCanvas = this.mini.querySelector('canvas')!;
    this.miniCtx = this.miniCanvas.getContext('2d')!;
    this.miniLabel = this.mini.querySelector('.wmini-lbl')!;

    loadImage('/assets/world/map.webp').then((i) => (this.img = i));
    this.bindInput();
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
    });
    window.addEventListener('mouseup', () => (this.drag = null));
    window.addEventListener('mousemove', (e) => {
      if (!this.drag || !this.open) return;
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
      const m = this.screenToMap(e.offsetX, e.offsetY);
      const w = { x: (m.x - 620) * 14.8, z: (m.y - 445) * 14.8 };
      const near = this.pins.findIndex((p) => Math.hypot(p.x - w.x, p.z - w.z) < 60 / this.zoom * 14.8);
      if (near >= 0) this.pins.splice(near, 1);
      else this.pins.push({ x: w.x, z: w.z, kind: 'pin' });
      this.draw();
    });
    c.addEventListener('mousemove', (e) => {
      if (this.drag) return;
      const m = this.screenToMap(e.offsetX, e.offsetY);
      const x = (m.x - 620) * 14.8, z = (m.y - 445) * 14.8;
      const gx = Math.floor((x - WORLD_X0) / CELL), gz = Math.floor((z - WORLD_Z0) / CELL);
      const seen = gx >= 0 && gz >= 0 && gx < GW && gz < GH && this.discovery.isRevealed(gx, gz);
      const rd = REGION_DEFS.find((r) => this.discovery.regions.has(r.id) && this.inRegion(r, m.x, m.y));
      this.info.textContent = seen && rd ? `${REGIONS[rd.id]?.name ?? rd.id} · ${REGIONS[rd.id]?.subtitle ?? ''}` : '';
    });
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

  toggle(open = !this.open) {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) {
      const p = worldToPx(this.player.x, this.player.z);
      this.pan.set(p.x, p.y);
      this.zoom = 2.2;
      this.resize();
    }
    this.onToggle?.(open);
  }

  markFogDirty() {
    this.fogDirty = true;
  }

  private scale() {
    const fit = Math.min(this.canvas.width / MAP_PX[0], this.canvas.height / MAP_PX[1]);
    return fit * this.zoom;
  }
  private screenToMap(sx: number, sy: number) {
    const s = this.scale();
    return new THREE.Vector2(this.pan.x + (sx - this.canvas.width / 2) / s, this.pan.y + (sy - this.canvas.height / 2) / s);
  }
  private mapToScreen(px: number, py: number) {
    const s = this.scale();
    return new THREE.Vector2(this.canvas.width / 2 + (px - this.pan.x) * s, this.canvas.height / 2 + (py - this.pan.y) * s);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(200, Math.round(r.width));
    this.canvas.height = Math.max(200, Math.round(r.height));
    this.draw();
  }

  private rebuildFog() {
    const g = this.fog.getContext('2d')!;
    const img = g.createImageData(GW, GH);
    // Unexplored land lies under drifting cloud: soft blue-grey with a little
    // variation, so the map reads as fogged rather than blacked out.
    const n = (x: number, z: number) => {
      const t = Math.sin(x * 0.37 + z * 0.61) * 0.5 + Math.sin(x * 0.13 - z * 0.21 + 1.7) * 0.5;
      return t * 0.5 + 0.5;
    };
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
      const k = (z * GW + x) * 4;
      const seen = this.discovery.isRevealed(x, z);
      const v = n(x, z);
      img.data[k] = 24 + v * 18; img.data[k + 1] = 36 + v * 20; img.data[k + 2] = 60 + v * 22;
      img.data[k + 3] = seen ? 0 : 214 + v * 30;
    }
    g.putImageData(img, 0, 0);
    this.fogDirty = false;
  }

  /** Painted map, fog, roads, places, quests, pins, the player and a compass. */
  draw() {
    if (!this.open) return;
    const g = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    g.fillStyle = '#0b1526';
    g.fillRect(0, 0, W, H);
    if (!this.img) return;
    if (this.fogDirty) this.rebuildFog();
    const tl = this.mapToScreen(0, 0), br = this.mapToScreen(MAP_PX[0], MAP_PX[1]);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    // Fog of war: soft-edged (the 60 m cells are upscaled with smoothing).
    const fx0 = this.mapToScreen((WORLD_X0 / 14.8) + 620, (WORLD_Z0 / 14.8) + 445);
    const fx1 = this.mapToScreen(((WORLD_X0 + GW * CELL) / 14.8) + 620, ((WORLD_Z0 + GH * CELL) / 14.8) + 445);
    g.save();
    g.filter = 'blur(3px)';
    g.drawImage(this.fog, fx0.x, fx0.y, fx1.x - fx0.x, fx1.y - fx0.y);
    g.restore();
    // Roads that have been seen.
    g.lineCap = 'round';
    for (const line of ROAD_LINES) {
      g.beginPath();
      let started = false;
      for (const [x, z] of line) {
        const gx = Math.floor((x - WORLD_X0) / CELL), gz = Math.floor((z - WORLD_Z0) / CELL);
        const p = this.mapToScreen(x / 14.8 + 620, z / 14.8 + 445);
        if (!this.discovery.isRevealed(gx, gz)) { started = false; continue; }
        if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
      }
      g.strokeStyle = 'rgba(40,24,10,0.55)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = '#e7c98a';
      g.lineWidth = 2;
      g.stroke();
    }
    // Region names for regions the player has entered.
    g.textAlign = 'center';
    for (const r of REGION_DEFS) {
      if (!this.discovery.regions.has(r.id)) continue;
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
    // Places.
    for (const l of this.discovery.landmarks) {
      const k = this.discovery.places.get(l.id);
      if (!k) continue;
      const p = this.mapToScreen(l.x / 14.8 + 620, l.z / 14.8 + 445);
      const icon = KIND_ICON[l.kind] ?? KIND_ICON.landmark;
      g.font = `${k === 'known' ? 14 : 18}px serif`;
      g.fillStyle = k === 'known' ? 'rgba(220,210,190,0.7)' : icon.color;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 3;
      g.strokeText(icon.glyph, p.x, p.y + 6);
      g.fillText(icon.glyph, p.x, p.y + 6);
      // Towns that name a region already carry the region label.
      if (this.zoom > 2.6 && k !== 'known' && !REGIONS[l.id]) {
        g.font = '600 12px Inter, sans-serif';
        g.strokeText(l.name, p.x, p.y + 22);
        g.fillStyle = '#fff4d8';
        g.fillText(l.name, p.x, p.y + 22);
      }
    }
    // Quest markers and pins.
    for (const m of [...this.questMarkers(), ...this.pins]) {
      const p = this.mapToScreen(m.x / 14.8 + 620, m.z / 14.8 + 445);
      g.font = '18px serif';
      g.fillStyle = m.kind === 'quest' ? '#ffd76a' : '#ff7ad9';
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.lineWidth = 3;
      const glyph = m.kind === 'quest' ? '❗' : '⚑';
      g.strokeText(glyph, p.x, p.y + 6);
      g.fillText(glyph, p.x, p.y + 6);
    }
    // The player.
    const pp = worldToPx(this.player.x, this.player.z);
    const ps = this.mapToScreen(pp.x, pp.y);
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
    this.drawCompass(g, W - 90, H - 100, 52);
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
    if (this.open) this.draw();
    this.miniT -= dt;
    if (this.miniT > 0 || !inOverworld || !this.img) return;
    this.miniT = 0.1;
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
    // Painted map crop around the player.
    const mp = worldToPx(this.player.x, this.player.z);
    const crop = metres / 14.8;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.img!, mp.x - crop / 2, mp.y - crop / 2, crop, crop, 0, 0, S, S);
    g.fillStyle = 'rgba(10,20,40,0.12)';
    g.fillRect(0, 0, S, S);
    // Roads.
    g.lineCap = 'round';
    g.strokeStyle = '#f0d9a4';
    g.lineWidth = 3;
    for (const line of ROAD_LINES) {
      g.beginPath();
      line.forEach(([x, z], i) => {
        const sx = S / 2 + (x - this.player.x) * pxPerM, sy = S / 2 + (z - this.player.z) * pxPerM;
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      });
      g.stroke();
    }
    // Places.
    g.textAlign = 'center';
    for (const l of this.discovery.landmarks) {
      if (!this.discovery.places.get(l.id)) continue;
      const sx = S / 2 + (l.x - this.player.x) * pxPerM, sy = S / 2 + (l.z - this.player.z) * pxPerM;
      if (sx < -10 || sy < -10 || sx > S + 10 || sy > S + 10) continue;
      const icon = KIND_ICON[l.kind] ?? KIND_ICON.landmark;
      g.font = '15px serif';
      g.fillStyle = icon.color;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 3;
      g.strokeText(icon.glyph, sx, sy + 5);
      g.fillText(icon.glyph, sx, sy + 5);
    }
    for (const m of this.questMarkers()) {
      let sx = S / 2 + (m.x - this.player.x) * pxPerM, sy = S / 2 + (m.z - this.player.z) * pxPerM;
      // Off-map quests pin to the rim.
      const d = Math.hypot(sx - S / 2, sy - S / 2);
      if (d > S / 2 - 10) {
        sx = S / 2 + ((sx - S / 2) / d) * (S / 2 - 10);
        sy = S / 2 + ((sy - S / 2) / d) * (S / 2 - 10);
      }
      g.font = '15px serif';
      g.fillStyle = '#ffd76a';
      g.strokeText('❗', sx, sy + 5);
      g.fillText('❗', sx, sy + 5);
    }
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
