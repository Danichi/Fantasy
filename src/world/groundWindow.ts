import * as THREE from 'three';
import { heightAt, WORLD_SIZE } from './terrainHeight';
import { reliefAt, RELIEF, WORLD_X0, WORLD_Z0, CELL, SEA_LEVEL } from './worldMap';

// Ground data around the camera for GPU-placed grass and flowers: a 256 m
// square at 1 m per texel, re-centred as the camera travels. Channels:
//   R  ground height (m)
//   G  grass density 0..1 (meadows full, forest floor sparse, none on sand,
//      snow, lava or water)
//   B  flower suitability 0..1 (open grass away from paths)
//   A  grass tint: 0 temperate, 0.33 alpine, 0.66 jungle/wetland, 1 dry
// Rebuilds are spread over several frames into a back buffer, then swapped.

const SIZE = 256;
const ROWS_PER_FRAME = 24;
const RECENTER = 40; // metres the camera may drift before a rebuild starts

// Per-relief [grass density, flower suitability, tint]
const RELIEF_GROUND: Record<number, [number, number, number]> = {
  [RELIEF.deep]: [0, 0, 0], [RELIEF.shelf]: [0, 0, 0], [RELIEF.beach]: [0.03, 0, 1],
  [RELIEF.open]: [1, 1, 0], [RELIEF.forest]: [0.55, 0.25, 0.66], [RELIEF.mountain]: [0.22, 0.2, 0.33],
  [RELIEF.snow]: [0, 0, 0.33], [RELIEF.sand]: [0.04, 0, 1], [RELIEF.mesa]: [0.12, 0.05, 1],
  [RELIEF.marsh]: [0.65, 0.3, 0.66], [RELIEF.lava]: [0, 0, 1], [RELIEF.volcanic]: [0.05, 0, 1],
};

/** Places grass is cut back: garden beds, yards, quarry floors (circle r or box hx/hz). */
export const GRASS_MASKS: { x: number; z: number; r?: number; hx?: number; hz?: number; amount: number }[] = [];

export class GroundWindow {
  readonly texture: THREE.DataTexture;
  /** World position of texel (0, 0) as used by the shaders. */
  readonly origin = { value: new THREE.Vector2(-1e6, -1e6) };
  readonly size = { value: SIZE };
  private front: Uint16Array;
  private back: Uint16Array;
  private building: { x0: number; z0: number; row: number } | null = null;
  private localSplat: Uint8Array | null;

  /** `splat` is Elder Glen's 1 m splat (RGBA: stone, dirt, grass). */
  constructor(splat: THREE.DataTexture | null) {
    this.front = new Uint16Array(SIZE * SIZE * 4);
    this.back = new Uint16Array(SIZE * SIZE * 4);
    this.texture = new THREE.DataTexture(this.front, SIZE, SIZE, THREE.RGBAFormat, THREE.HalfFloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.localSplat = (splat?.image.data as Uint8Array | undefined) ?? null;
  }

  /** Fill synchronously around a point (boot, teleports). */
  prime(center: THREE.Vector3) {
    this.building = { x0: Math.round(center.x - SIZE / 2), z0: Math.round(center.z - SIZE / 2), row: 0 };
    while (this.building) this.step(SIZE);
  }

  update(camera: THREE.Vector3) {
    if (!this.building) {
      const cx = this.origin.value.x + SIZE / 2, cz = this.origin.value.y + SIZE / 2;
      if (Math.abs(camera.x - cx) > RECENTER || Math.abs(camera.z - cz) > RECENTER) {
        if (Math.abs(camera.x - cx) > SIZE || Math.abs(camera.z - cz) > SIZE) return this.prime(camera); // teleported
        this.building = { x0: Math.round(camera.x - SIZE / 2), z0: Math.round(camera.z - SIZE / 2), row: 0 };
      }
    }
    if (this.building) this.step(ROWS_PER_FRAME);
  }

  private step(rows: number) {
    const b = this.building!;
    const H = WORLD_SIZE / 2;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let r = 0; r < rows && b.row < SIZE; r++, b.row++) {
      const z = b.z0 + b.row + 0.5;
      for (let c = 0; c < SIZE; c++) {
        const x = b.x0 + c + 0.5;
        const k = (b.row * SIZE + c) * 4;
        let grass: number, flower: number, tint: number;
        if (this.localSplat && Math.abs(x) < H - 1 && Math.abs(z) < H - 1) {
          // Elder Glen: from the authored splat (paths, plaza, fields).
          const li = ((Math.floor(z + H) * WORLD_SIZE) + Math.floor(x + H)) * 4;
          const s = this.localSplat[li] / 255, d = this.localSplat[li + 1] / 255, g = this.localSplat[li + 2] / 255;
          grass = Math.min(1, Math.max(0, g * 1.25 - d * 0.6 - s * 0.8));
          flower = Math.min(1, Math.max(0, g - 0.3 * d - s));
          tint = 0;
        } else {
          [grass, flower, tint] = blendedGround(x, z);
        }
        for (const m of GRASS_MASKS) {
          const inside = m.r !== undefined ? Math.hypot(x - m.x, z - m.z) < m.r : Math.abs(x - m.x) < m.hx! && Math.abs(z - m.z) < m.hz!;
          if (inside) {
            grass *= 1 - m.amount;
            flower *= 1 - m.amount;
          }
        }
        const h = heightAt(x, z);
        if (h < SEA_LEVEL + 0.5) {
          // Nothing grows under the sea; the tideline thins out.
          const wet = Math.max(0, Math.min(1, (h - SEA_LEVEL) / 0.5));
          grass *= wet * 0.3;
          flower = 0;
        }
        this.back[k] = toHalf(h);
        this.back[k + 1] = toHalf(grass);
        this.back[k + 2] = toHalf(flower);
        this.back[k + 3] = toHalf(tint);
      }
    }
    if (b.row >= SIZE) {
      [this.front, this.back] = [this.back, this.front];
      this.texture.image.data = this.front;
      this.texture.needsUpdate = true;
      this.origin.value.set(b.x0, b.z0);
      this.building = null;
    }
  }
}

/** Bilinear blend of the ground table over the four surrounding macro cells. */
function blendedGround(x: number, z: number): [number, number, number] {
  const gx = (x - WORLD_X0) / CELL - 0.5, gz = (z - WORLD_Z0) / CELL - 0.5;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  let g = 0, f = 0, t = 0;
  for (let k = 0; k < 4; k++) {
    const dx = k & 1, dz = k >> 1;
    const w = (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
    const v = RELIEF_GROUND[reliefAt(WORLD_X0 + (ix + dx + 0.5) * CELL, WORLD_Z0 + (iz + dz + 0.5) * CELL)] ?? RELIEF_GROUND[RELIEF.open];
    g += v[0] * w;
    f += v[1] * w;
    t += v[2] * w;
  }
  return [g, f, t];
}
