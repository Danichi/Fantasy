import type * as THREE from 'three';

// ?perf: frame time, renderer counters and world-streaming state (World
// Expansion prompt §61 "performance instrumentation"). Stats that matter for
// the budgets in docs/ART-DIRECTION.md §9.

export interface PerfSources {
  renderer: THREE.WebGLRenderer;
  terrainTiles: () => number;
  vegetationTiles: () => number;
  physicsBodies: () => number;
  actors: () => number;
  region: () => string;
  position: () => THREE.Vector3;
}

export class PerfOverlay {
  private el: HTMLDivElement;
  private frames: number[] = [];
  private t = 0;
  private info = { calls: 0, triangles: 0 };

  constructor(private src: PerfSources) {
    this.el = document.createElement('div');
    this.el.className = 'perf';
    document.getElementById('ui')!.appendChild(this.el);
    // Count every render in a frame (the post chain renders several passes).
    src.renderer.info.autoReset = false;
  }

  /** Call once per frame after rendering. */
  update(dtMs: number) {
    const r = this.src.renderer;
    this.frames.push(dtMs);
    if (this.frames.length > 120) this.frames.shift();
    this.info.calls = r.info.render.calls;
    this.info.triangles = r.info.render.triangles;
    r.info.reset();
    this.t -= dtMs;
    if (this.t > 0) return;
    this.t = 250;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const avg = this.frames.reduce((a, b) => a + b, 0) / Math.max(1, this.frames.length);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const p = this.src.position();
    this.el.innerHTML = [
      `<b>${(1000 / avg).toFixed(0)} fps</b> · ${avg.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms`,
      `draws ${this.info.calls} · tris ${(this.info.triangles / 1000).toFixed(0)}k`,
      `geo ${r.info.memory.geometries} · tex ${r.info.memory.textures}`,
      `tiles ${this.src.terrainTiles()} · veg ${this.src.vegetationTiles()} · bodies ${this.src.physicsBodies()} · actors ${this.src.actors()}`,
      `${this.src.region()} · ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`,
    ].join('<br>');
  }
}
