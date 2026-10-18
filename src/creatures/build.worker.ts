// Builds creature geometry off the main thread (sculpting, meshing, fur).
import { boarGeometry } from './boar/model';
import { pack } from './kit/transfer';
import type * as THREE from 'three';

const BUILDERS: Record<string, () => Record<string, THREE.BufferGeometry | number>> = {
  boar: () => boarGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
};

self.onmessage = (e: MessageEvent<{ kind: string }>) => {
  const kind = e.data.kind;
  const built = BUILDERS[kind]?.();
  if (!built) return;
  const transfer: Transferable[] = [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(built)) out[k] = typeof v === 'number' ? v : pack(v, transfer);
  (self as unknown as Worker).postMessage({ kind, out }, transfer);
};
