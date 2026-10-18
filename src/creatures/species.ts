import type * as THREE from 'three';
import { RELIEF } from '../world/worldMap';
import { Boar } from './boar/boar';
import { boarWallow } from './dens';
import { Spider } from './spider/spider';
import { spiderHollow } from './spider/webs';
import { Bat } from './bat/bat';
import { batRoost } from './bat/roost';
import * as T3 from 'three';
import type { Population, Habitat } from './population';
import { creatureReady, prepareCreature } from './geometryStore';

// Who lives where. Each species says how much it likes a spot (region,
// ground, time of day); the population mixes them by those weights.

/** Temperate country: the glen, the kingdom's farmland and woods, the wild frontier. */
const TEMPERATE = new Set(['elderGlen', 'cresha', 'wildlands', 'southernMarches', 'verdantElves', 'royalCapital', 'portAurelle']);

export function registerSpecies(pop: Population, scene: THREE.Scene) {
  void prepareCreature('boar').then(() => prepareCreature('spider')).then(() => prepareCreature('bat'));
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
  pop.add({
    id: 'spider',
    group: [1, 2],
    spread: 6,
    minRoad: 25,
    ready: () => creatureReady('spider'),
    habitat: (h: Habitat) => {
      if (!TEMPERATE.has(h.region)) return 0;
      // Woods and their dark edges; far bolder at night.
      const ground = h.relief === RELIEF.forest ? 2.4 : h.relief === RELIEF.marsh ? 0.6 : h.relief === RELIEF.open ? 0.15 : 0;
      return ground * (h.night ? 1.8 : 1) * (h.road > 60 ? 1.3 : 1);
    },
    make: (at, level, o) => new Spider(at, level, scene, pop.fx, o.leader && o.den ? { size: 1.45 } : {}),
    den: { name: 'Spider hollow', build: spiderHollow },
  });
  pop.add({
    id: 'bat',
    group: [3, 5],
    spread: 4,
    minRoad: 15,
    ready: () => creatureReady('bat'),
    habitat: (h: Habitat) => {
      if (!TEMPERATE.has(h.region) && h.region !== 'whiteMountains') return 0;
      // Only abroad at night; they roost among rocks in the hills and woods.
      if (!h.night) return 0;
      return h.relief === RELIEF.forest ? 1.2 : h.relief === RELIEF.mountain ? 1.6 : h.relief === RELIEF.open ? 0.7 : 0.4;
    },
    make: (at, level, o) => new Bat(at, level, scene, pop.fx, o.den ? { perch: at.clone().add(new T3.Vector3((Math.random() - 0.5) * 2.4, 3.1 + Math.random() * 0.4, (Math.random() - 0.5) * 2.4)) } : {}),
    den: { name: 'Bat roost', build: batRoost },
  });
}
