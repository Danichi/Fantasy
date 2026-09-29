import * as THREE from 'three';
import { events } from '../core/events';
import type { DialogueOption } from '../ui/dialogue';

// Side quests and story quests (World Expansion §46 and phase 3). A quest is
// data: stages of objectives, the NPC who offers it, what they say, rewards.
// World scripting hangs off stage hooks (spawn a heifer, jam the mill wheel,
// wake goblins at night) so the runtime stays small and testable. Quests
// never assume a region is loaded: objectives resolve through NPC ids,
// inventory counts, events and signals.

export type Objective =
  /** speak to an NPC (service id like 'froest' or a townsfolk record id) */
  | { type: 'talk'; npc: string; text: string; say: string; reply?: string; take?: [string, number][]; give?: [string, number][] }
  /** stand within `radius` of a point */
  | { type: 'reach'; at: [number, number]; radius: number; text: string }
  /** hold `count` of an item (not consumed) */
  | { type: 'collect'; item: string; count: number; text: string; at?: [number, number] }
  /** hand `count` of an item to an NPC (consumed) */
  | { type: 'deliver'; npc: string; item: string; count: number; text: string; say: string }
  /** defeat enemies of a kind ('any' for all), optionally near a point */
  | { type: 'kill'; kind: string; count: number; text: string; at?: [number, number]; radius?: number }
  /** world triggers: quests.signal(id) from gameplay code */
  | { type: 'signal'; id: string; count?: number; text: string; at?: [number, number] }
  /** wait until the clock is inside [from, to) (wraps past midnight) */
  | { type: 'hour'; from: number; to: number; text: string };

export interface QuestStage {
  /** journal line for this stage */
  note: string;
  objectives: Objective[];
  /** world script run when the stage begins (and again on load while it is current) */
  hook?: string;
}

export interface QuestDef {
  id: string;
  title: string;
  /** who offers it (NPC id) */
  giver: string;
  region: string;
  summary: string;
  /** what the giver says when offering */
  offer: string;
  /** player's accept line */
  acceptLabel?: string;
  stages: QuestStage[];
  /** final line, said on completion */
  done: string;
  rewards: { gold: number; xp: number; items?: [string, number][]; guildRep?: number };
  /** quests that must be finished first */
  requires?: string[];
  /** only offered between these hours */
  offerHours?: [number, number];
  /** main story quests sort first */
  main?: boolean;
}

export interface QuestState {
  status: 'active' | 'done';
  stage: number;
  progress: number[];
}

export type QuestSave = Record<string, QuestState>;

export interface QuestContext {
  /** inventory count */
  count(item: string): number;
  take(item: string, n: number): void;
  give(item: string, n: number): void;
  gold(n: number): void;
  xp(n: number): void;
  guildRep(n: number): void;
  toast(msg: string): void;
  /** world position of an NPC (for markers), null if unknown */
  npcPos(id: string): THREE.Vector3 | null;
  hour(): number;
}

const inHours = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

export class QuestLog {
  readonly defs = new Map<string, QuestDef>();
  state: QuestSave = {};
  /** stage hooks by name */
  readonly hooks = new Map<string, (q: QuestDef) => void>();
  /** the quest shown in the HUD tracker */
  tracked: string | null = null;
  onChange?: () => void;

  constructor(private ctx: QuestContext) {
    events.on('enemyDied', ({ at, kind }) => {
      this.forEachObjective((q, o, i, st) => {
        if (o.type !== 'kill') return;
        if (o.kind !== 'any' && o.kind !== kind) return;
        if (o.at && Math.hypot(at.x - o.at[0], at.z - o.at[1]) > (o.radius ?? 60)) return;
        if (st.progress[i] < o.count) this.bump(q, i, 1);
      });
    });
  }

  add(...defs: QuestDef[]) {
    for (const d of defs) this.defs.set(d.id, d);
  }

  status(id: string): 'active' | 'done' | 'available' | 'locked' {
    return this.state[id]?.status ?? (this.canOffer(this.defs.get(id)!) ? 'available' : 'locked');
  }

  isActive(id: string, stage?: number) {
    const s = this.state[id];
    return !!s && s.status === 'active' && (stage === undefined || s.stage === stage);
  }

  isDone(id: string) {
    return this.state[id]?.status === 'done';
  }

  private canOffer(q: QuestDef) {
    if (this.state[q.id]) return false;
    if (q.requires?.some((r) => !this.isDone(r))) return false;
    if (q.offerHours && !inHours(this.ctx.hour(), q.offerHours[0], q.offerHours[1])) return false;
    return true;
  }

  /** Quests this NPC can offer right now. */
  offers(npc: string) {
    return [...this.defs.values()].filter((q) => q.giver === npc && this.canOffer(q));
  }

  /** NPCs with something to say: '!' offers, '?' objectives waiting on them. */
  indicator(npc: string): '!' | '?' | null {
    let turnIn = false;
    this.forEachObjective((_q, o, i, st) => {
      if ((o.type === 'talk' || o.type === 'deliver') && o.npc === npc && this.objectiveReady(o, st.progress[i], i, st)) turnIn = true;
    });
    if (turnIn) return '?';
    return this.offers(npc).length ? '!' : null;
  }

  accept(id: string) {
    const q = this.defs.get(id);
    if (!q || this.state[id]) return;
    this.state[id] = { status: 'active', stage: 0, progress: q.stages[0].objectives.map(() => 0) };
    this.tracked = id;
    this.ctx.toast('Quest started: ' + q.title);
    events.emit('questChanged', { id, status: 'active' });
    this.enterStage(q);
    this.changed();
  }

  /** Can a talk/deliver objective be completed now? (earlier objectives in the stage come first) */
  private objectiveReady(o: Objective, progress: number, index: number, st: QuestState) {
    if (progress >= this.target(o)) return false;
    const q = [...this.defs.values()].find((d) => this.state[d.id] === st)!;
    const objs = q.stages[st.stage].objectives;
    for (let k = 0; k < index; k++) if (st.progress[k] < this.target(objs[k]) && objs[k].type !== 'collect') return false;
    if (o.type === 'deliver') return this.ctx.count(o.item) >= o.count;
    if (o.type === 'talk' && o.take) return o.take.every(([item, n]) => this.ctx.count(item) >= n);
    return true;
  }

  private target(o: Objective) {
    return o.type === 'collect' || o.type === 'deliver' || o.type === 'kill' ? o.count : o.type === 'signal' ? (o.count ?? 1) : 1;
  }

  /** Dialogue options this NPC adds: turn-ins first, then offers. */
  options(npc: string, show: (text: string, opts: DialogueOption[]) => void, back: () => void): DialogueOption[] {
    const out: DialogueOption[] = [];
    this.forEachObjective((q, o, i, st) => {
      if ((o.type !== 'talk' && o.type !== 'deliver') || o.npc !== npc) return;
      if (!this.objectiveReady(o, st.progress[i], i, st)) {
        if (o.type === 'deliver' && st.progress[i] < o.count) out.push({ label: `(${q.title}) ${o.text} — ${this.ctx.count(o.item)}/${o.count}`, run: () => show('Bring me ' + o.count + ' and we\'ll talk.', [{ label: 'Back.', run: back }]) });
        return;
      }
      out.push({
        label: o.type === 'deliver' ? `Hand over ${o.count} ${o.text.replace(/^(Bring|Deliver|Give) /, '')}` : (o.reply ?? `About "${q.title}"…`),
        run: () => {
          if (o.type === 'deliver') this.ctx.take(o.item, o.count);
          if (o.type === 'talk') {
            for (const [item, n] of o.take ?? []) this.ctx.take(item, n);
            for (const [item, n] of o.give ?? []) this.ctx.give(item, n);
          }
          const finishing = this.bump(q, i, this.target(o));
          show(finishing ? `${o.say}\n\n${q.done}` : o.say, [{ label: finishing ? 'Glad to help.' : 'On it.', run: back }]);
        },
      });
    });
    for (const q of this.offers(npc)) {
      out.push({
        label: `❗ ${q.title}`,
        run: () => show(q.offer, [
          { label: q.acceptLabel ?? 'I\'ll do it.', run: () => { this.accept(q.id); show(q.stages[0].note, [{ label: 'Farewell.', run: back }]); } },
          { label: 'Not right now.', run: back },
        ]),
      });
    }
    return out;
  }

  /** A world trigger fired (repairs, lures, glyph rubbings...). */
  signal(id: string, n = 1) {
    let hit = false;
    this.forEachObjective((q, o, i, st) => {
      if (o.type === 'signal' && o.id === id && st.progress[i] < (o.count ?? 1)) {
        this.bump(q, i, n);
        hit = true;
      }
    });
    return hit;
  }

  /** Is a signal objective currently wanted? (so world triggers only show when useful) */
  wants(id: string) {
    let yes = false;
    this.forEachObjective((_q, o, i, st) => {
      if (o.type === 'signal' && o.id === id && st.progress[i] < (o.count ?? 1)) yes = true;
    });
    return yes;
  }

  private t = 0;
  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    if (this.t < 0.25) return;
    this.t = 0;
    this.forEachObjective((q, o, i, st) => {
      if (st.progress[i] >= this.target(o)) {
        // Collected items can be lost again (sold, eaten) before the stage ends.
        if (o.type === 'collect' && this.ctx.count(o.item) < o.count) {
          st.progress[i] = this.ctx.count(o.item);
          this.changed();
        }
        return;
      }
      if (o.type === 'reach' && Math.hypot(player.x - o.at[0], player.z - o.at[1]) < o.radius) this.bump(q, i, 1);
      else if (o.type === 'collect') {
        const c = Math.min(o.count, this.ctx.count(o.item));
        if (c !== st.progress[i]) this.bump(q, i, c - st.progress[i]);
      } else if (o.type === 'hour' && inHours(this.ctx.hour(), o.from, o.to)) this.bump(q, i, 1);
    });
  }

  /** Advance an objective; returns true if the quest finished. */
  private bump(q: QuestDef, i: number, n: number) {
    const st = this.state[q.id];
    const o = q.stages[st.stage].objectives[i];
    st.progress[i] = Math.max(0, Math.min(this.target(o), st.progress[i] + n));
    let finished = false;
    if (q.stages[st.stage].objectives.every((ob, k) => st.progress[k] >= this.target(ob))) {
      if (st.stage + 1 < q.stages.length) {
        st.stage++;
        st.progress = q.stages[st.stage].objectives.map(() => 0);
        this.ctx.toast(q.title + ': ' + q.stages[st.stage].note);
        this.enterStage(q);
      } else {
        finished = true;
        this.complete(q);
      }
    }
    events.emit('questChanged', { id: q.id, status: st.status });
    this.changed();
    return finished;
  }

  private complete(q: QuestDef) {
    const st = this.state[q.id];
    st.status = 'done';
    const r = q.rewards;
    if (r.gold) this.ctx.gold(r.gold);
    if (r.xp) this.ctx.xp(r.xp);
    if (r.guildRep) this.ctx.guildRep(r.guildRep);
    for (const [item, n] of r.items ?? []) this.ctx.give(item, n);
    this.ctx.toast(`Quest complete: ${q.title}  (+${r.gold}g, +${r.xp} xp)`);
    if (this.tracked === q.id) this.tracked = this.active()[0]?.id ?? null;
    this.hooks.get(q.id + ':done')?.(q);
  }

  private enterStage(q: QuestDef) {
    const st = this.state[q.id];
    const hook = q.stages[st.stage].hook;
    if (hook) this.hooks.get(hook)?.(q);
  }

  /** Active quests, main story first. */
  active() {
    return [...this.defs.values()].filter((q) => this.state[q.id]?.status === 'active').sort((a, b) => Number(!!b.main) - Number(!!a.main));
  }

  completed() {
    return [...this.defs.values()].filter((q) => this.state[q.id]?.status === 'done');
  }

  /** Current objective lines for a quest: [text, progress, target]. */
  lines(id: string): [string, number, number][] {
    const q = this.defs.get(id);
    const st = this.state[id];
    if (!q || !st || st.status !== 'active') return [];
    return q.stages[st.stage].objectives.map((o, i) => [o.text, st.progress[i], this.target(o)]);
  }

  /** Where the current objectives are (for the map, minimap and compass). */
  markers(): { x: number; z: number; label: string; quest: string }[] {
    const out: { x: number; z: number; label: string; quest: string }[] = [];
    this.forEachObjective((q, o, i, st) => {
      if (st.progress[i] >= this.target(o)) return;
      let p: [number, number] | null = null;
      if ((o.type === 'talk' || o.type === 'deliver')) {
        const v = this.ctx.npcPos(o.npc);
        if (v) p = [v.x, v.z];
      } else if (o.type === 'reach') p = o.at;
      else if ('at' in o && o.at) p = o.at;
      if (p) out.push({ x: p[0], z: p[1], label: o.text, quest: q.id });
    });
    return out;
  }

  private forEachObjective(fn: (q: QuestDef, o: Objective, i: number, st: QuestState) => void) {
    for (const [id, st] of Object.entries(this.state)) {
      if (st.status !== 'active') continue;
      const q = this.defs.get(id);
      if (!q) continue;
      const objs = q.stages[st.stage]?.objectives ?? [];
      objs.forEach((o, i) => fn(q, o, i, st));
    }
  }

  private changed() {
    this.onChange?.();
  }

  toJSON(): QuestSave {
    return JSON.parse(JSON.stringify(this.state));
  }

  fromJSON(d: QuestSave | undefined) {
    if (!d) return;
    this.state = {};
    for (const [id, st] of Object.entries(d)) {
      const q = this.defs.get(id);
      if (!q) continue;
      const stage = Math.min(st.stage, q.stages.length - 1);
      const n = q.stages[stage].objectives.length;
      this.state[id] = { status: st.status, stage, progress: Array.from({ length: n }, (_, k) => st.progress?.[k] ?? 0) };
    }
    this.tracked = this.active()[0]?.id ?? null;
    // Re-run the current stage hooks so the world matches the saved quest state.
    for (const q of this.active()) this.enterStage(q);
    for (const q of this.completed()) this.hooks.get(q.id + ':done')?.(q);
  }
}
