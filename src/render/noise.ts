import * as THREE from 'three';

// Shared world noise (r: gusts / lushness, g: patches / dryness, b: fine grain).
// Grass, terrain and flowers sample the same texture at the same world scale,
// so blade colour and the ground under it always agree.

function build() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const hash = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, y: number, f: number, seed: number) => {
    const X = (x / N) * f, Y = (y / N) * f;
    const xi = Math.floor(X), yi = Math.floor(Y), xf = X - xi, yf = Y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const w = (a: number, b: number) => hash((((a % f) + f) % f) + seed, (((b % f) + f) % f) + seed * 3.1);
    return (w(xi, yi) * (1 - u) + w(xi + 1, yi) * u) * (1 - v) + (w(xi, yi + 1) * (1 - u) + w(xi + 1, yi + 1) * u) * v;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      data[k] = (vn(x, y, 4, 1) * 0.6 + vn(x, y, 8, 2) * 0.3 + vn(x, y, 16, 3) * 0.1) * 255;
      data[k + 1] = (vn(x, y, 6, 7) * 0.7 + vn(x, y, 12, 8) * 0.3) * 255;
      data[k + 2] = vn(x, y, 32, 11) * 255;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter; // no shimmer on distant hills
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

let cached: THREE.DataTexture | null = null;
export function worldNoise() {
  return (cached ??= build());
}
