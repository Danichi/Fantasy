import type * as THREE from 'three';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { QuestLog } from '../../quests/questLog';
import type { NpcManager } from '../../npc/npcManager';
import type { WorldTime } from '../worldTime';
import type { DialogueOption } from '../../ui/dialogue';
import type { GoldenExpanse } from './goldenExpanse';

/** Everything Ghagrabba's stories and street life need from the game (main.ts builds this). */
export interface GhagrabbaDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  fx: FX;
  player: Player;
  quests: QuestLog;
  npcs: NpcManager;
  time: WorldTime;
  desert: GoldenExpanse;
  /** saved world flags (shared with the rest of the world) */
  flags: Record<string, boolean | number | string>;
  /** 'overworld' | 'interior' | 'dungeon' */
  mode(): string;
  toast(msg: string): void;
  card(title: string, subtitle: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  talk(who: string, title: string, text: string, options: DialogueOption[]): void;
  close(): void;
  give(item: string, n: number): void;
  take(item: string, n: number): void;
  count(item: string): number;
  save(): void;
}

/** A dialogue page shower and a way back (as the townsfolk talk menu passes to services). */
export type Show = (text: string, opts: DialogueOption[]) => void;
export type Service = (show: Show, back: () => void) => DialogueOption[];
