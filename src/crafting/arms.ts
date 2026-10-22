import * as THREE from 'three';
import type { Player } from '../player/player';
import type { ThirdPersonCamera } from '../player/camera';
import type { Input } from '../core/input';
import type { SkillRuntime } from '../paths/skills';
import type { FX } from '../fx/particles';
import type { Interactable } from '../dungeon/instance';
import { ArmsRuntime } from '../combat/armsRuntime';
import { Ranged } from '../combat/ranged';
import { loadExtraClips } from '../anim/extraClips';
import { events } from '../core/events';
import { ITEMS } from '../items/itemDefs';
import { stationHook } from '../world/interior';
import { forgeAt } from '../world/portAurelle';
import { GatheringNodes } from '../world/gatheringNodes';
import { CraftUI } from '../ui/craftUI';
import { Crafter } from './crafter';
import { STATION_NAMES, type StationKind } from './recipes';
import type { ArmsSave } from './crafting';
import './arms.css';

// Arms and Crafting, wired up in one place (main.ts calls setupArms once and
// then update/frame each step and frame). Everything the update adds hangs
// off the object this returns: the weapon-family runtime, bows and
// crossbows, crafting (the craft page and the stations in the world's rooms
// and camps), gathering nodes, and hides and meat from the hunt.

export interface ArmsContext {
  scene: THREE.Scene;
  player: Player;
  cam: ThirdPersonCamera;
  skillRt: SkillRuntime;
  fx: FX;
  toast(msg: string): void;
  /** game hours since the world began (nodes come back by world time) */
  hours(): number;
  /** gathering only happens out in the world */
  overworld(): boolean;
}

const VERB: Record<StationKind, string> = {
  forge: 'Work the forge',
  workbench: 'Work at the bench',
  alchemy: 'Brew at the table',
  kitchen: 'Cook a meal',
  runestone: 'Cut runes',
  loom: 'Tan, weave and sew',
};

/** Beasts that give hide and meat when they fall near you. */
const GAME: Record<string, { hide: number; meat: number }> = { boar: { hide: 1, meat: 2 }, wolf: { hide: 1, meat: 1 } };

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
  const give = (id: string, n: number) => {
    player.equip.add(id, n);
    events.emit('equipmentChanged', {});
  };

  // ---- crafting ----------------------------------------------------------------------------------
  const crafter = new Crafter(player);
  const craft = new CraftUI(player, crafter);
  crafter.onLearn = (rs, how) => ctx.toast(`${how === 'book' ? 'Learned to make' : 'Discovered'}: ${rs.map((r) => ITEMS[r.out].name).join(', ')}`);
  stationHook.label = (kind) => `${VERB[kind as StationKind]} · ${STATION_NAMES[kind as StationKind]}`;
  stationHook.use = (kind, where, bonus) => craft.show(kind as StationKind, where, bonus);
  // Port Aurelle's open forge in the Dwarven Quarter: a master's forge (better quality).
  const portForge: Interactable = {
    pos: forgeAt, radius: 2.6,
    label: () => `${VERB.forge} · the Dwarven Quarter (a master’s forge)`,
    enabled: () => forgeAt.lengthSq() > 1,
    action: () => craft.show('forge', 'the Dwarven Quarter forge', 0.5),
  };
  // Eating, drinking and reading: buffs, and the recipe books.
  player.onConsume = (def) => {
    runtime.consume(def);
    if (def.id.startsWith('book')) {
      const got = crafter.readBook(def.id);
      if (!got.length) ctx.toast('You know everything this book teaches.');
    }
  };

  // ---- gathering and the hunt ------------------------------------------------------------------
  const hasTool = (tool: 'pick' | 'axe') =>
    player.equip.items.some((it) => (tool === 'pick' ? it.def.tool === 'pick' : it.def.tool === 'hatchet' || it.def.kind === 'axe'));
  const gathering = new GatheringNodes(ctx.scene, {
    give, hours: ctx.hours, hasTool, toast: ctx.toast,
    bonus: (k) => crafter.x('smithing', k),
  });
  gathering.onGather = (_kind, item, n, rare) => ctx.toast(`+${n} ${ITEMS[item].name}${rare ? ` · and ${ITEMS[rare].name}!` : ''}`);
  gathering.onStrike = (at, tool) =>
    ctx.fx.add.spawn({ pos: at.clone().setY(at.y + 0.6), spread: 0.5, count: tool === 'pick' ? 10 : 7, life: [0.25, 0.6], size: [0.07, 0.02], color: tool === 'pick' ? 0xfff0c0 : 0xd8b07a, color2: tool === 'pick' ? 0xff9a3a : 0x8a5a2a, gravity: 9, upBias: 1.2, jitter: 0.4 });
  events.on('enemyDied', (e) => {
    const g = GAME[e.kind];
    if (!g || e.at.distanceTo(player.pos) > 30) return;
    give('rawHide', g.hide);
    give('rawMeat', g.meat);
    ctx.toast(`Skinned: ${g.hide} ${ITEMS.rawHide.name}, ${g.meat} ${ITEMS.rawMeat.name}`);
  });

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
    crafter,
    craft,
    gathering,
    /** interactables out in the world (the port's forge, the gathering prompt) */
    interactables: [portForge, gathering.interactable] as Interactable[],
    /** resolves once the library clips are on the hero */
    clips,
    /** per simulation step, after the skill runtime */
    update(dt: number, input: Input) {
      ranged.update(dt, input);
      runtime.update(dt);
      if (ctx.overworld()) gathering.update(dt, player.pos);
    },
    /** per rendered frame */
    frame(dt: number) {
      ranged.frame(dt);
    },
    setVisible(v: boolean) {
      ranged.setVisible(v);
      gathering.setVisible(v);
    },
    toJSON(): ArmsSave {
      return { buffs: runtime.toJSON(), loaded: ranged.loaded, ...crafter.toJSON(), nodes: gathering.toJSON() };
    },
    fromJSON(d?: ArmsSave) {
      runtime.fromJSON(d?.buffs);
      if (d?.loaded !== undefined) ranged.loaded = d.loaded;
      crafter.fromJSON(d);
      gathering.fromJSON(d?.nodes);
    },
    reset() {
      runtime.reset();
      ranged.clear();
      crafter.fromJSON();
      gathering.fromJSON();
      craft.close();
    },
  };
}
export type Arms = ReturnType<typeof setupArms>;
