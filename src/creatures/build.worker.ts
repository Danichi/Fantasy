// Builds creature geometry off the main thread (sculpting, meshing, fur).
import { boarGeometry } from './boar/model';
import { spiderGeometry } from './spider/model';
import { batGeometry } from './bat/model';
import { wolfGeometry } from './wolf/model';
import { greyjawGeometry } from './wolf/greyjaw';
import { stagGeometry } from './stag/model';
import { crabGeometry } from './crab/model';
import { pack } from './kit/transfer';
import type * as THREE from 'three';

const BUILDERS: Record<string, () => Record<string, THREE.BufferGeometry | number>> = {
  boar: () => boarGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
  spider: () => spiderGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
  bat: () => batGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
  wolf: () => wolfGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
  greyjaw: () => greyjawGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
  stag: () => stagGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
  crab: () => crabGeometry() as unknown as Record<string, THREE.BufferGeometry | number>,
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
