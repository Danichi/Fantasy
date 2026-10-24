import { unpack, type PackedGeometry } from './kit/transfer';
import { provideBoarGeometry, boarGeometry, type BoarGeometry } from './boar/model';
import { provideSpiderGeometry, spiderGeometry, type SpiderGeometry } from './spider/model';
import { provideBatGeometry, batGeometry, type BatGeometry } from './bat/model';
import { provideWolfGeometry, wolfGeometry, type WolfGeometry } from './wolf/model';
import { provideGreyjawGeometry, greyjawGeometry, type GreyjawGeometry } from './wolf/greyjaw';
import { provideStagGeometry, stagGeometry, type StagGeometry } from './stag/model';
import { provideCrabGeometry, crabGeometry, type CrabGeometry } from './crab/model';
import { provideWightGeometry, wightGeometry, type WightGeometry } from './wight/model';
import { provideGoblinGeometry, goblinGeometry, type GoblinGeometry } from './goblin/model';
import { provideRatGeometry, ratGeometry, type RatGeometry } from './rat/model';
import { provideDelverGeometry, delverGeometry, type DelverGeometry } from './delver/model';
import { provideUndeadGeometry, undeadGeometry, type UndeadGeometry } from './undeadHumanoid/model';

// Creature meshes are sculpted in a worker so the game never stalls while a
// new kind is built. Until a kind is ready, the population doesn't spawn it.

const ready = new Set<string>();
const pending = new Map<string, Promise<void>>();
let worker: Worker | null = null;
const waiters = new Map<string, () => void>();

const PROVIDE: Record<string, (parts: Record<string, unknown>) => void> = {
  boar: (p) => provideBoarGeometry(p as unknown as BoarGeometry),
  spider: (p) => provideSpiderGeometry(p as unknown as SpiderGeometry),
  bat: (p) => provideBatGeometry(p as unknown as BatGeometry),
  wolf: (p) => provideWolfGeometry(p as unknown as WolfGeometry),
  greyjaw: (p) => provideGreyjawGeometry(p as unknown as GreyjawGeometry),
  stag: (p) => provideStagGeometry(p as unknown as StagGeometry),
  crab: (p) => provideCrabGeometry(p as unknown as CrabGeometry),
  wight: (p) => provideWightGeometry(p as unknown as WightGeometry),
  goblin: (p) => provideGoblinGeometry(p as unknown as GoblinGeometry),
  rat: (p) => provideRatGeometry(p as unknown as RatGeometry),
  delver: (p) => provideDelverGeometry(p as unknown as DelverGeometry),
  undeadDrowned: (p) => provideUndeadGeometry('drowned', p as unknown as UndeadGeometry),
  undeadRevenant: (p) => provideUndeadGeometry('revenant', p as unknown as UndeadGeometry),
  undeadWraith: (p) => provideUndeadGeometry('wraith', p as unknown as UndeadGeometry),
};
const LOCAL: Record<string, () => void> = {
  boar: () => void boarGeometry(),
  spider: () => void spiderGeometry(),
  bat: () => void batGeometry(),
  wolf: () => void wolfGeometry(),
  greyjaw: () => void greyjawGeometry(),
  stag: () => void stagGeometry(),
  crab: () => void crabGeometry(),
  wight: () => void wightGeometry(),
  goblin: () => void goblinGeometry(),
  rat: () => void ratGeometry(),
  delver: () => void delverGeometry(),
  undeadDrowned: () => void undeadGeometry('drowned'),
  undeadRevenant: () => void undeadGeometry('revenant'),
  undeadWraith: () => void undeadGeometry('wraith'),
};

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ kind: string; out: Record<string, PackedGeometry | number> }>) => {
    const parts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e.data.out)) parts[k] = typeof v === 'number' ? v : unpack(v);
    PROVIDE[e.data.kind]?.(parts);
    ready.add(e.data.kind);
    waiters.get(e.data.kind)?.();
  };
  return worker;
}

export function creatureReady(kind: string) {
  return ready.has(kind);
}

/** Start building a kind (in a worker); resolves when it can be spawned. */
export function prepareCreature(kind: string): Promise<void> {
  if (ready.has(kind)) return Promise.resolve();
  let p = pending.get(kind);
  if (p) return p;
  p = new Promise<void>((resolve) => {
    waiters.set(kind, resolve);
    try {
      getWorker().postMessage({ kind });
    } catch {
      // No workers: build here, once.
      LOCAL[kind]?.();
      ready.add(kind);
      resolve();
    }
  });
  pending.set(kind, p);
  return p;
}

/** Build right now on this thread (tests, the creature lab). */
export function prepareCreatureNow(kind: string) {
  if (ready.has(kind)) return;
  LOCAL[kind]?.();
  ready.add(kind);
}
