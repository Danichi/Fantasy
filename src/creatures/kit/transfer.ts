import * as THREE from 'three';

// Geometry across a worker boundary: plain typed arrays, transferred not copied.

export interface PackedGeometry {
  attrs: Record<string, { array: Float32Array | Uint16Array; itemSize: number }>;
  index: Uint32Array | Uint16Array | null;
  userData: Record<string, unknown>;
}

export function pack(g: THREE.BufferGeometry, transfer: Transferable[]): PackedGeometry {
  const attrs: PackedGeometry['attrs'] = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = (a as THREE.BufferAttribute).array as Float32Array | Uint16Array;
    attrs[name] = { array: arr, itemSize: a.itemSize };
    transfer.push(arr.buffer);
  }
  const index = g.index ? (g.index.array as Uint32Array | Uint16Array) : null;
  if (index) transfer.push(index.buffer);
  return { attrs, index, userData: { ...g.userData } };
}

export function unpack(p: PackedGeometry) {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(p.attrs)) {
    g.setAttribute(name, a.array instanceof Uint16Array ? new THREE.Uint16BufferAttribute(a.array, a.itemSize) : new THREE.BufferAttribute(a.array, a.itemSize));
  }
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.userData = p.userData;
  g.computeBoundingSphere();
  return g;
}
