import type * as THREE from 'three';
import type { DefenceResult, IncomingAttack } from '../combat/targets';
import type { Player } from '../player/player';

// Who a creature can fight. Usually just the player; during a raid the town
// watch and the livestock in their pens join in (raid/raids.ts adds them).

export interface Foe {
  readonly kind: 'player' | 'watch' | 'stock';
  readonly pos: THREE.Vector3;
  readonly center: THREE.Vector3;
  readonly alive: boolean;
  strike(att: IncomingAttack): DefenceResult;
}

/** Watchmen and livestock in reach of raiders right now. */
export const extraFoes = new Set<Foe>();

const wrapped = new WeakMap<Player, Foe>();
export function playerFoe(p: Player): Foe {
  let f = wrapped.get(p);
  if (!f)
    wrapped.set(
      p,
      (f = {
        kind: 'player',
        get pos() {
          return p.pos;
        },
        get center() {
          return p.center;
        },
        get alive() {
          return !p.dead;
        },
        strike: (att) => p.receiveAttack(att),
      }),
    );
  return f;
}
