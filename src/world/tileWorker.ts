// Height-tile worker: computes 256 m terrain tiles off the main thread so the
// world streams in without hitches (see terrainHeight.ts).
import { computeTile } from './terrainHeight';
import { setMacroCells } from './worldMap';

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: 'init'; cells: Uint8ClampedArray } | { type: 'tile'; i: number; j: number };
  if (m.type === 'init') {
    setMacroCells(m.cells);
    return;
  }
  const data = computeTile(m.i, m.j);
  (self as unknown as Worker).postMessage({ i: m.i, j: m.j, data }, [data.buffer]);
};
