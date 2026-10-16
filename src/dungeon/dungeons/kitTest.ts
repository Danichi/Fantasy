import * as THREE from 'three';
import type { KitDungeonDef } from '../kit/build';
import { baseTable } from '../kit/loot';
import { TEST_PLANS } from './plans';

// The kit's test dungeon (docs/design/dungeons.md phase D1): every room
// template and every trap, no boss. Only reachable from the console and the
// tests: __game.dungeons.kitTest with realm.enterKit().
export function kitTestDef(): KitDungeonDef {
  return {
    id: 'kitTest',
    name: 'The Kit Test',
    theme: 'crypt',
    origin: new THREE.Vector3(49000, 0, 0),
    plans: TEST_PLANS,
    traps: ['darts', 'portcullis', 'blade', 'collapse', 'gas', 'boulder'],
    mobs: () => [],
    loot: baseTable(),
    exitLabel: (floor) => (floor === 1 ? 'Leave the test dungeon' : 'Climb the stairs up'),
    arrive: () => 'The kit test dungeon.',
  };
}
