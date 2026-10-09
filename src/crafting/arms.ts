import * as THREE from 'three';
import type { Player } from '../player/player';
import type { ThirdPersonCamera } from '../player/camera';
import type { Input } from '../core/input';
import type { SkillRuntime } from '../paths/skills';
import { ArmsRuntime } from '../combat/armsRuntime';
import { Ranged } from '../combat/ranged';
import { loadExtraClips } from '../anim/extraClips';
import type { ArmsSave } from './crafting';
import './arms.css';

// Arms and Crafting, wired up in one place (main.ts calls setupArms once and
// then update/frame each step and frame). Everything the update adds hangs
// off the object this returns: the weapon-family runtime, bows and
// crossbows, and (from phase A3) crafting, stations and gathering.

export interface ArmsContext {
  scene: THREE.Scene;
  player: Player;
  cam: ThirdPersonCamera;
  skillRt: SkillRuntime;
  toast(msg: string): void;
}

export function setupArms(ctx: ArmsContext) {
  const { player } = ctx;
  const runtime = new ArmsRuntime(player, ctx.skillRt, ctx.toast);
  const ranged = new Ranged(ctx.scene, player, ctx.cam, {
    toast: ctx.toast,
    bleed: (t, dps) => ctx.skillRt.bleed(t, dps),
    drawTime: (base) => runtime.drawTime(base),
    takeOpening: () => runtime.takeOpening()?.mult ?? 1,
  });
  runtime.ranged = ranged;
  player.onConsume = (def) => runtime.consume(def);
  // Bow and crossbow events ride the player's skill-event channel.
  const prevEvent = player.onSkillEvent;
  player.onSkillEvent = (name) => {
    if (name.startsWith('arms:')) ranged.onEvent(name);
    else prevEvent?.(name);
  };
  const clips = loadExtraClips(player.char);

  return {
    runtime,
    ranged,
    /** resolves once the library clips are on the hero */
    clips,
    /** per simulation step, after the skill runtime */
    update(dt: number, input: Input) {
      ranged.update(dt, input);
      runtime.update(dt);
    },
    /** per rendered frame */
    frame(dt: number) {
      ranged.frame(dt);
    },
    setVisible(v: boolean) {
      ranged.setVisible(v);
    },
    toJSON(): ArmsSave {
      return { buffs: runtime.toJSON(), loaded: ranged.loaded };
    },
    fromJSON(d?: ArmsSave) {
      runtime.fromJSON(d?.buffs);
      if (d?.loaded !== undefined) ranged.loaded = d.loaded;
    },
    reset() {
      runtime.reset();
      ranged.clear();
    },
  };
}
export type Arms = ReturnType<typeof setupArms>;
