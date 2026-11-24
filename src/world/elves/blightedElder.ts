import * as THREE from 'three';
import { Rootwarden } from '../../enemies/wilds/rootwarden';
import { WildBeast } from '../../enemies/wilds/wildBeast';
import { WILD_SPECS } from '../../enemies/wilds/wildSpecs';
import type { FX } from '../../fx/particles';
import type { WildCtx } from '../../enemies/wilds/wildBeast';
import type { Target } from '../../combat/targets';
/** Shared encounter tuning for the real forest and combat sandbox. */
export function makeBlightedElder(at: THREE.Vector3, scene: THREE.Scene, fx: FX, ctx: WildCtx, add: (b: WildBeast) => void, phase: (n: number) => void) {
  const b = new Rootwarden(at, 0, scene, fx, ctx.tele, ctx.missiles);
  b.name = 'The Blighted Elder';
  b.kind = 'elfBlightedElder';
  b.hp = b.maxHp = 7600;
  b.damageScale = 2.25;
  const target: Target = b;
  target.level = 35;
  target.label = b.name;
  target.boss = true;
  b.onPhase = phase;
  b.onSummon = () => {
    if (!b.alive) return;
    for (const dx of [-8, 8]) {
      const w = new WildBeast({ ...WILD_SPECS.direWolf, id: 'elfBlightWolf', name: 'Blighted Wolf', tint: 0x7ea99d }, at.clone().add(new THREE.Vector3(dx, 0, 7)), scene, fx, ctx, {
        danger: 0.4,
        alerted: true,
        leash: 58,
      });
      w.hp = w.maxHp = 1050;
      w.damage = 42;
      w.level = 30;
      add(w);
    }
  };
  return b;
}
