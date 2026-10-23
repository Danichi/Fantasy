import * as THREE from 'three';
import './roadLife.css';
import { heightAt } from '../terrainHeight';
import { buildWayside, LOOKS } from './wayside';
import { buildTravellers, TRAVELLERS } from './travellers';
import { buildRoadEvents, type EventKind } from './events';
import { Figure, Animal } from './actors';
import { RL_SITES } from './paths';
import { Renown, type RoadLifeHooks, type Service } from './types';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import type { NpcRecord, Settlement } from '../../npc/npcManager';
import type { Range, Species } from '../fauna';

// Road life on the roads into and out of the Royal Capital (the Crown Road,
// the Caravan Way, the Queen's Road, the Kingsbridge Road and the Logging
// Road out of Elder Glen):
//
//   wayside.ts     places and their people (NpcManager settlements), services
//   travellers.ts  parties travelling to timetables, built only near the player
//   events.ts      things that happen on the road as you travel
//   ../../quests/roadLifeQuests.ts  the road's quests
//
// Built early (its clearings and settlements feed the nature and NPC
// systems); `hooks` is filled in by main.ts once the HUD and quests exist.

export { ROAD_LIFE_ITEMS } from './roadItems';
export { stubHooks, type RoadLifeHooks } from './types';

export interface RoadLife {
  settlements: { settlement: Settlement; records: NpcRecord[] }[];
  clearings: [number, number, number][];
  interactables: Interactable[];
  herds: { species: Species; count: number; range: Range }[];
  /** dialogue services for road folk (shops, the toll, blessings), keyed by NPC id */
  services: Map<string, Service>;
  renown: Renown;
  /** travelling quest givers (for quest markers and indicators) */
  travellerIds: string[];
  npcPos(id: string): THREE.Vector3 | null;
  npcHead(id: string): THREE.Vector3 | null;
  /** for roadLifeQuests.ts */
  spawnGarrison(): void;
  tam(state: 'waiting' | 'following' | 'home'): void;
  give(item: string, n: number): void;
  count(item: string): number;
  /** start a road event ahead of the player (tests) */
  forceEvent(kind: EventKind): boolean;
  /** fixed-step: combat (the Red Hand) */
  step(dt: number, player: Player): void;
  /** per frame: travellers, events, fires, the toll pole */
  update(dt: number, player: Player, night: number): void;
  setVisible(v: boolean): void;
  clear(): void;
}

export function buildRoadLife(scene: THREE.Scene, m: WorldMats, fx: FX, hooks: RoadLifeHooks): RoadLife {
  const renown = new Renown(hooks);
  const wayside = buildWayside(scene, m, fx, hooks, renown);
  const travellers = buildTravellers(scene, m, hooks, renown, wayside);
  const events = buildRoadEvents(scene, m, fx, hooks, renown, travellers, wayside);

  // ---- Tam Ashby and Scrap the dog (The Boy Who Went Back) ----------------------------------------------
  let tamState: 'none' | 'waiting' | 'following' | 'home' = 'none';
  let tam: Figure | null = null;
  let dog: Animal | null = null;
  let visible = true;
  const cottage = new THREE.Vector3(RL_SITES.ashbyCottage[0], 0, RL_SITES.ashbyCottage[1]);
  const camp = new THREE.Vector3(RL_SITES.refugee[0], 0, RL_SITES.refugee[1]);
  const tamHome = () => camp.clone().add(new THREE.Vector3(3.5, 0, 4));
  const tamSpot = (player: THREE.Vector3) => (tamState === 'waiting' ? cottage.clone().add(new THREE.Vector3(5, 0, 5)) : tamState === 'home' ? tamHome() : player.clone().add(new THREE.Vector3(-2, 0, -2)));
  const follow = (pos: THREE.Vector3, target: THREE.Vector3, keep: number, dt: number) => {
    const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
    if (d > 60) {
      pos.set(target.x - keep, 0, target.z - keep);
      pos.y = heightAt(pos.x, pos.z);
      return 0;
    }
    if (d <= keep) return 0;
    const sp = d > 9 ? 4.8 : 1.7;
    const step = Math.min(d - keep, sp * dt);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    pos.y = heightAt(pos.x, pos.z);
    return sp;
  };

  function updateTam(dt: number, player: Player) {
    if (tamState === 'none') return;
    const spot = tamSpot(player.pos);
    const near = tamState === 'following' || Math.hypot(player.pos.x - spot.x, player.pos.z - spot.z) < 150;
    if (near && !tam) {
      tam = new Figure(scene, LOOKS.tam);
      tam.pos.set(spot.x, heightAt(spot.x, spot.z), spot.z);
      dog = new Animal(scene, 'dog');
      dog.pos.copy(tam.pos).add(new THREE.Vector3(1.2, 0, 0.6));
    } else if (!near && tam) {
      tam.dispose();
      dog?.dispose();
      tam = null;
      dog = null;
    }
    if (!tam || !dog) return;
    const t = performance.now() / 1000;
    if (tamState === 'waiting') {
      tam.play('idle_tired');
      tam.yaw = Math.atan2(cottage.x - tam.pos.x, cottage.z - tam.pos.z);
      dog.speed = 0;
      dog.gait(true);
    } else if (tamState === 'following') {
      const sp = follow(tam.pos, player.pos, 2.4, dt);
      if (sp > 0) tam.yaw = Math.atan2(player.pos.x - tam.pos.x, player.pos.z - tam.pos.z);
      tam.play(sp > 3 ? 'jog' : sp > 0 ? 'walk' : 'idle');
      if (Math.hypot(tam.pos.x - camp.x, tam.pos.z - camp.z) < 12) {
        hooks.quests?.signal('rl-tam-home');
        tamState = 'home';
        travellers.barks.say('Mum! I found Scrap!', () => (tam ? tam.pos.clone().setY(tam.pos.y + 1.6) : null));
      }
    } else {
      const sp = follow(tam.pos, spot, 0.3, dt);
      tam.play(sp > 0 ? 'walk' : Math.floor(t / 5) % 2 ? 'cheer' : 'idle');
    }
    // Scrap runs rings round the boy.
    if (tamState !== 'waiting') {
      const tgt = tam.pos.clone().add(new THREE.Vector3(Math.cos(t * 0.8) * 2.2, 0, Math.sin(t * 0.8) * 2.2));
      const before = dog.pos.clone();
      follow(dog.pos, tgt, 0.2, dt * 1.6);
      const moved = before.distanceTo(dog.pos) / Math.max(dt, 1e-4);
      if (moved > 0.05) dog.yaw = Math.atan2(dog.pos.x - before.x, dog.pos.z - before.z);
      dog.speed = moved;
      dog.gait();
    }
    tam.visible = visible;
    dog.root.visible = visible;
    tam.update(dt);
    dog.update(dt);
  }

  const interactables: Interactable[] = [...wayside.interactables, travellers.interactable, events.interactable];
  const named = new Set(TRAVELLERS.map((t) => t.id));

  return {
    settlements: wayside.settlements,
    clearings: wayside.clearings,
    interactables,
    herds: wayside.herds,
    services: wayside.services,
    renown,
    travellerIds: TRAVELLERS.map((t) => t.id),
    npcPos: (id) => (named.has(id) ? travellers.npcPos(id) : null),
    npcHead: (id) => (named.has(id) && visible ? travellers.npcHead(id) : null),
    spawnGarrison: () => wayside.spawnGarrison(),
    tam(state) {
      if (state === 'following' && tamState === 'home') return;
      tamState = state;
    },
    give: (item, n) => hooks.give(item, n),
    count: (item) => hooks.count(item),
    forceEvent: (kind) => events.force(kind),
    step(dt, player) {
      wayside.step(dt, player);
      events.step(dt, player);
    },
    update(dt, player, night) {
      wayside.frame(dt, player, night);
      travellers.update(dt, player.pos, player.mounted);
      events.frame(dt, player);
      updateTam(dt, player);
      travellers.interactable.update(player.pos);
      events.interactable.update(player.pos);
    },
    setVisible(v) {
      visible = v;
      wayside.setVisible(v);
      travellers.setVisible(v);
      events.setVisible(v);
      if (tam) tam.visible = v;
      if (dog) dog.root.visible = v;
    },
    clear() {
      // (Fort Rennick's garrison holds its ground, like the Crown Road's camps; only the road event goes.)
      events.clear();
    },
  };
}
