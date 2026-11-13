import * as THREE from 'three';
/** First contact along a segment; supports shots travelling several metres per tick. */
export function segmentSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const d = b.clone().sub(a),
    m = a.clone().sub(c),
    A = d.lengthSq(),
    C = m.lengthSq() - r * r;
  if (C <= 0) return 0;
  if (A < 1e-12) return null;
  const B = m.dot(d),
    disc = B * B - A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / A;
  return t >= 0 && t <= 1 ? t : null;
}
export function segmentBox(a: THREE.Vector3, b: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): number | null {
  let lo = 0,
    hi = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] < min[k] || a[k] > max[k]) return null;
      continue;
    }
    let l = (min[k] - a[k]) / d,
      h = (max[k] - a[k]) / d;
    if (l > h) [l, h] = [h, l];
    lo = Math.max(lo, l);
    hi = Math.min(hi, h);
    if (lo > hi) return null;
  }
  return lo;
}
