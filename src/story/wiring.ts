import * as THREE from 'three';
import type { QuestLog } from '../quests/questLog';
import type { Reputation } from '../social/reputation';
import { WAYSTONES } from '../world/kingsRoad';
import { STANDING_STONES } from '../world/glenLandmarks';
import { crownAt } from '../world/crownRoad';
import { CROWN_SITES } from '../world/roadData';
import { CAPITAL_SPOTS } from '../world/royalCapital';
import { heightAt } from '../world/terrainHeight';
import type { Interactable } from '../dungeon/instance';
import { Story, type StoryHooks } from './story';
import { setupAct1 } from './act1';
import { setupAct2 } from './act2';
import { setupAct3, HARROW_FORD } from './act3';
import type { WheelNode } from './sunwheel';
import type { StorySave } from './state';

// Hooks the main story into the game (main.ts calls this once the world, the
// quests and the people exist, and before the journal loads).

export interface MainStoryDeps extends Omit<StoryHooks, 'wheels'> {
  time: { hour: number; day: number; skipTo(h: number): void };
  raids: { start(kind: 'wolves' | 'gloam', front?: string): void; state: string };
  rep: Reputation;
  /** the twelve Sunwheel stones in the wilds (sites) */
  stoneSites(): { id: string; x: number; z: number; n: number; read: boolean }[];
  gravewoodCleared(): boolean;
  gravewoodPedestal(): THREE.Vector3;
  elinRead(): boolean;
  hollowCleared(): boolean;
  rustKnightDown(): boolean;
  ready(): boolean;
  saved?: StorySave;
}

export function setupMainStory(d: MainStoryDeps) {
  const ground = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const shrine = crownAt(CROWN_SITES.shrine.s, CROWN_SITES.shrine.lat);
  const barrow = crownAt(CROWN_SITES.barrow.s, CROWN_SITES.barrow.lat - 26);
  /** Every wheel there is. */
  const wheels = (): WheelNode[] => {
    const out: WheelNode[] = WAYSTONES.map((w) => ({ id: w.id, name: w.name, pos: w.pos.clone().setY(heightAt(w.pos.x, w.pos.z)), kind: 'waystone' as const }));
    out.push({ id: 'ring', name: 'The Standing Stones (above Elder Glen)', pos: ground(STANDING_STONES.x + 3, STANDING_STONES.z + 3), kind: 'ring' });
    out.push({ id: 'crownShrine', name: 'The Shrine of the Dawn (Crown Road)', pos: ground(shrine.x, shrine.z), kind: 'ruin' });
    out.push({ id: 'barrow', name: 'The Barrow of the Old Kings', pos: ground(barrow.x, barrow.z), kind: 'ruin' });
    out.push({ id: 'harrow', name: 'Harrow Ford (Crown Road)', pos: HARROW_FORD.clone(), kind: 'ruin' });
    out.push({ id: 'temple', name: 'The Temple of the Dawn (the Capital)', pos: ground(CAPITAL_SPOTS.temple.x, CAPITAL_SPOTS.temple.z + 6), kind: 'ruin' });
    if (d.gravewoodCleared()) out.push({ id: 'gravewood', name: 'The Gravewood Pedestal', pos: d.gravewoodPedestal(), kind: 'pedestal' });
    for (const s of d.stoneSites()) if (s.read) out.push({ id: 'stone:' + s.id, name: `Sunwheel Stone ${s.n + 1}`, pos: ground(s.x, s.z), kind: 'stone' });
    return out;
  };
  const story = new Story({ ...d, wheels }, d.saved);
  const ctx = {
    story, quests: d.quests as QuestLog, player: d.player, rep: d.rep, time: d.time, raids: d.raids,
    toast: d.toast, give: d.give, count: d.count, save: d.save, ready: d.ready,
  };
  const act1 = setupAct1(ctx);
  const act2 = setupAct2({ ...ctx, lookOf: () => null });
  const act3 = setupAct3(ctx, { scene: d.scene, elinRead: d.elinRead, hollowCleared: d.hollowCleared, rustKnightDown: d.rustKnightDown });

  /** Hands on the wheels the world doesn't already have an action for. */
  const interactables: Interactable[] = [];
  const touchable = (id: string) => () => {
    const n = wheels().find((w) => w.id === id);
    if (n) story.wheel.touch(n);
  };
  for (const w of wheels()) {
    if (w.kind === 'stone' || w.kind === 'pedestal') continue;
    interactables.push({ pos: w.pos, radius: w.kind === 'waystone' ? 2.4 : 2.8, label: () => (story.wheelAwake ? 'Touch the Sunwheel' : story.wheel.attuned(w.id) ? 'The Sunwheel hums under your hand' : 'Touch the Sunwheel'), enabled: () => true, action: touchable(w.id) });
  }
  // The Gravewood pedestal joins once the curse is broken.
  interactables.push({
    get pos() {
      return d.gravewoodPedestal().clone().add(new THREE.Vector3(0, 0, 2.2));
    },
    radius: 2.6, label: () => 'Touch the Sunwheel on the pedestal', enabled: () => d.gravewoodCleared(), action: touchable('gravewood'),
  } as Interactable);

  return {
    story,
    interactables,
    wheels,
    /** a Sunwheel stone (sites) touched after it's been read */
    touchStone: (id: string, quiet = false) => {
      if (quiet) {
        if (story.wheel.attune(id)) d.toast('The Sunwheel on the stone knows you now.');
      } else touchable(id)();
    },
    step(dt: number) {
      story.step(dt);
      act1.step(dt);
      act2.step();
      act3.step(dt);
    },
    frame(dt: number) {
      story.frame(dt);
    },
  };
}

export type MainStory = ReturnType<typeof setupMainStory>;

/**
 * Saves from before the Fifth Summon: the chapters that kept their ids gained
 * stages, so a chapter in progress picks up at the nearest new stage; and the
 * new chapters an old story has already passed count as done.
 */
export function migrateMainQuest(q: Record<string, { status: 'active' | 'done'; stage: number; progress: number[] }> | undefined, hadStory: boolean) {
  if (!q || hadStory) return;
  const started = ['mq-stranger', 'mq-crypt', 'mq-gravewood', 'road-to-port'].some((id) => q[id]);
  if (!started) return;
  const done = (id: string) => (q[id] ??= { status: 'done', stage: 0, progress: [] });
  done('mq-fall');
  if (q['road-to-port']) done('mq-bells');
  const remap = (id: string, map: number[]) => {
    const st = q[id];
    if (!st || st.status !== 'active') return;
    st.stage = map[Math.min(st.stage, map.length - 1)];
    st.progress = [];
  };
  remap('mq-stranger', [0, 0, 1]);
  remap('mq-crypt', [1, 2, 4]);
  remap('mq-gravewood', [0, 0, 1, 1, 3]);
}
