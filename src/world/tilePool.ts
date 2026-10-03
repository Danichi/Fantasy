import { TILE, WORLD_SIZE, hasTile, putTile } from './terrainHeight';
import { macroCells } from './worldMap';
import { ROAD_POLYS, roadPoint, ROAD_SPECS } from './roadData';
import { CITY_BOUNDS, CAUSEWAY } from './portCity';
import { CAP_CENTER, CAP_RX, CAP_RZ } from './capitalCity';

// Boot-time tile prefetch: placing props along the roads and across Port
// Aurelle asks for heights in far tiles, and each uncached tile used to be
// computed on the main thread (seconds of boot). Compute them first, in
// parallel workers, so every later heightAt() is a cheap lookup.

/** Tiles the world builders will touch (roads, the port), outside Elder Glen's own grid. */
export function buildTiles(): [number, number][] {
  const H = WORLD_SIZE / 2;
  const set = new Set<string>();
  const add = (x: number, z: number) => {
    if (Math.abs(x) < H - 4 && Math.abs(z) < H - 4) return; // Elder Glen's grid covers these
    set.add(Math.floor(x / TILE) + ',' + Math.floor(z / TILE));
  };
  for (const line of ROAD_POLYS) {
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += 24) {
        const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
        // Only what the builders dress: around Elder Glen (hedges, gates) and the King's Road corridor.
        if (Math.hypot(x, z) > 1300 && !(x > 0 && z > -80 && z < 280)) continue;
        for (const o of [-22, 0, 22]) for (const p of [-22, 0, 22]) add(x + o, z + p);
      }
    }
  }
  for (let x = CITY_BOUNDS.x0 - 40; x <= CITY_BOUNDS.x1 + 80; x += 32) for (let z = CITY_BOUNDS.z0 - 60; z <= CITY_BOUNDS.z1 + 30; z += 32) add(x, z);
  for (let x = CAUSEWAY.x0 - 30; x <= CAUSEWAY.x1; x += 32) add(x, CAUSEWAY.z);
  // The Crown Road and what stands beside it (its hamlet, inn, camps and barrow are built at boot).
  {
    const cr = ROAD_SPECS.find((r) => r.id === 'capital')!;
    let len = 0;
    for (let i = 1; i < cr.pts.length; i++) len += Math.hypot(cr.pts[i][0] - cr.pts[i - 1][0], cr.pts[i][1] - cr.pts[i - 1][1]);
    for (let s = 0; s <= len; s += 60) for (const lat of [-150, -75, 0, 75, 150]) add(...roadPoint('capital', s, lat));
  }
  // The Royal Capital (its residents' places are placed at boot) and the Kingsbridge.
  for (let x = CAP_CENTER[0] - CAP_RX - 40; x <= CAP_CENTER[0] + CAP_RX + 40; x += 64) for (let z = CAP_CENTER[1] - CAP_RZ - 40; z <= CAP_CENTER[1] + CAP_RZ + 40; z += 64) add(x, z);
  for (let x = -4100; x <= -3700; x += 64) add(x, -1066);
  return [...set].map((k) => k.split(',').map(Number) as [number, number]).filter(([i, j]) => !hasTile(i, j));
}

/** Compute tiles in a pool of workers and store them; resolves when all are in. */
export function prefetchTiles(list: [number, number][]): Promise<void> {
  if (!list.length || typeof Worker === 'undefined') return Promise.resolve();
  const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1, list.length));
  const queue = [...list];
  let pending = list.length;
  return new Promise((resolve) => {
    const workers: Worker[] = [];
    let settled = false;
    // Whatever happens (a worker fails to load or dies), boot goes on: tiles
    // that never arrived are computed on demand by heightAt().
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      for (const x of workers) x.terminate();
      resolve();
    };
    const guard = setTimeout(finish, 45_000);
    const next = (w: Worker) => {
      const t = queue.shift();
      if (t) w.postMessage({ type: 'tile', i: t[0], j: t[1] });
    };
    for (let k = 0; k < n; k++) {
      let w: Worker;
      try {
        w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      } catch {
        break;
      }
      w.postMessage({ type: 'init', cells: macroCells() });
      w.onmessage = (e: MessageEvent) => {
        const { i, j, data } = e.data as { i: number; j: number; data: Float32Array };
        putTile(i, j, data);
        if (--pending <= 0) finish();
        else next(w);
      };
      w.onerror = () => {
        w.terminate();
        workers.splice(workers.indexOf(w), 1);
        if (!workers.length) finish();
      };
      workers.push(w);
      next(w);
    }
    // No workers at all: the builders fall back to computing on demand.
    if (!workers.length) finish();
  });
}
