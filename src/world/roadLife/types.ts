import type * as THREE from 'three';
import type { DialogueOption } from '../../ui/dialogue';
import type { QuestLog } from '../../quests/questLog';
import type { Look } from '../../npc/charBuilder';

// What road life needs from the rest of the game. Built early (before the
// HUD and the quest log exist) with stubs, then filled in by main.ts, the
// same way the Crown Road's hooks are.

export type Show = (text: string, opts: DialogueOption[]) => void;
export type Service = (show: Show, back: () => void) => DialogueOption[];

export interface SparSpec {
  name: string;
  look: Look;
  hp: number;
  damage?: number;
  pace?: number;
  ring: THREE.Vector3;
  radius: number;
}

export interface RoadLifeHooks {
  toast(msg: string): void;
  /** open the dialogue box */
  talk(who: string, title: string, text: string, opts: DialogueOption[]): void;
  close(): void;
  dialogueOpen(): boolean;
  /** a shop window (town.showShop) */
  shop(name: string, title: string, intro: string, stock: [string, number][]): void;
  give(item: string, n: number): void;
  take(item: string, n: number): void;
  count(item: string): number;
  /** add gold (negative spends) */
  gold(n: number): void;
  goldNow(): number;
  xp(n: number): void;
  hour(): number;
  day(): number;
  /** the saved world flags (road life keeps its state under 'rl:' keys) */
  flags: Record<string, boolean | number | string>;
  save(): void;
  quests: QuestLog | null;
  camera(): THREE.Camera | null;
  /** a sparring bout in a ring (the hedge knight's challenge) */
  spar(spec: SparSpec, onWin: () => void): void;
  /** the big region-name card (proclamations, the view from the Prospect) */
  card(title: string, sub: string): void;
  /** is the Crown checkpoint's barrier lifted? (travellers walk round it while it's down) */
  gateOpen(): boolean;
}

export const stubHooks = (): RoadLifeHooks => ({
  toast: () => {}, talk: () => {}, close: () => {}, dialogueOpen: () => false, shop: () => {},
  give: () => {}, take: () => {}, count: () => 0, gold: () => {}, goldNow: () => 0, xp: () => {},
  hour: () => 12, day: () => 1, flags: {}, save: () => {}, quests: null, camera: () => null,
  spar: () => {}, card: () => {}, gateOpen: () => true,
});

/** Road renown: what the road's people think of you, from deeds on the road and road quests. */
export const RENOWN_QUESTS: Record<string, number> = {
  'rl-drowned-strongbox': 3, 'rl-hedge-knight': 4, 'rl-wardlights': 4, 'rl-milestones': 2, 'rl-missing-boy': 5,
  'rl-ashby-letter': 3, 'rl-silk-steel': 5, 'rl-dispatch': 2, 'rl-ladys-locket': 3, 'rl-road-ballad': 4,
};
export const RENOWN_RANKS: [number, string][] = [[0, 'a stranger on the road'], [6, 'a known face'], [15, 'a Friend of the Road'], [32, 'a Champion of the Highway']];

export class Renown {
  constructor(private hooks: RoadLifeHooks) {}

  get value() {
    let v = Number(this.hooks.flags['rl:renown'] ?? 0);
    const q = this.hooks.quests;
    if (q) for (const [id, n] of Object.entries(RENOWN_QUESTS)) if (q.isDone(id)) v += n;
    return v;
  }

  get rank() {
    let r = RENOWN_RANKS[0][1];
    for (const [n, name] of RENOWN_RANKS) if (this.value >= n) r = name;
    return r;
  }

  /** 0 stranger, 1 known, 2 friend, 3 champion */
  get tier() {
    let t = 0;
    RENOWN_RANKS.forEach(([n], i) => this.value >= n && (t = i));
    return t;
  }

  add(n: number, why?: string) {
    const before = this.tier;
    this.hooks.flags['rl:renown'] = Number(this.hooks.flags['rl:renown'] ?? 0) + n;
    if (why) this.hooks.toast(`${why}  (road renown +${n})`);
    if (this.tier > before) this.hooks.toast(`On the roads you are now ${this.rank}.`);
  }

  /** Price after a friend's discount. */
  price(p: number) {
    return this.tier >= 2 ? Math.max(1, Math.round(p * 0.9)) : p;
  }
}
