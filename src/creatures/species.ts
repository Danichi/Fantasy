import type * as THREE from 'three';
import { RELIEF } from '../world/worldMap';
import { Boar } from './boar/boar';
import { boarWallow } from './dens';
import type { Population, Habitat } from './population';
import { creatureReady, prepareCreature } from './geometryStore';

// Who lives where. Each species says how much it likes a spot (region,
// ground, time of day); the population mixes them by those weights.

/** Temperate country: the glen, the kingdom's farmland and woods, the wild frontier. */
const TEMPERATE = new Set(['elderGlen', 'cresha', 'wildlands', 'southernMarches', 'verdantElves', 'royalCapital', 'portAurelle']);

export function registerSpecies(pop: Population, scene: THREE.Scene) {
  void prepareCreature('boar');
  pop.add({
    id: 'boar',
    group: [1, 3],
    spread: 5,
    minRoad: 18,
    ready: () => creatureReady('boar'),
    habitat: (h: Habitat) => {
      if (!TEMPERATE.has(h.region)) return 0;
      const ground = h.relief === RELIEF.forest ? 3 : h.relief === RELIEF.open || h.relief === RELIEF.shore ? 1.1 : h.relief === RELIEF.marsh ? 0.8 : 0.2;
      return ground * (h.night ? 1.3 : 1);
    },
    make: (at, level, o) => new Boar(at, level, scene, pop.fx, o.leader && o.den ? { size: 1.38 } : {}),
    den: { name: 'Boar wallow', build: boarWallow },
  });
}
