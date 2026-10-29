import * as THREE from 'three';
import type { Bolts } from '../enemies/bandit';
import { Undead } from '../enemies/undead';
import { Watchman } from '../raid/watchman';
import { extraFoes } from '../creatures/foes';
import type { Target } from '../combat/targets';
import type { Look } from '../npc/charBuilder';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { QuestLog } from '../quests/questLog';
import type { DialogueOption, DialogueUI } from '../ui/dialogue';
import type { ThirdPersonCamera } from '../player/camera';
import type { Input } from '../core/input';
import { heightAt } from '../world/terrainHeight';
import { DARK } from '../render/post';
import { CHAMPIONS, Champion } from './champions';
import { Director, type SceneScript } from './scene';
import { StoryState, type StorySave } from './state';
import { SunwheelNetwork, type WheelNode } from './sunwheel';
import { StoryUI } from './ui';

// The main story's hub: the scene director, the story's memory, the
// Sunwheel network, the Dark mirror, and the fights the story stages
// (champions, the Dark's shades, and the friends who stand with you).

export interface StoryHooks {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cam: ThirdPersonCamera;
  input: Input;
  dialogue: DialogueUI;
  player: Player;
  fx: FX;
  bolts: Bolts;
  quests: QuestLog;
  flags: Record<string, boolean | number | string>;
  toast(m: string): void;
  card(title: string, sub: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  save(): void;
  give(id: string, n: number): void;
  count(id: string): number;
  take(id: string, n: number): void;
  /** give control back the way the rest of the UI expects it */
  restoreInput(): void;
  /** every Sunwheel the world has (waystones, stones, the ring...) */
  wheels(): WheelNode[];
  teleport(to: THREE.Vector3): void;
  /** the overworld (scenes and fights only run there) */
  outdoors(): boolean;
  test: boolean;
  shake(n: number): void;
}

export class Story {
  readonly ui = new StoryUI();
  readonly state = new StoryState();
  readonly director: Director;
  readonly wheel: SunwheelNetwork;
  champions: Champion[] = [];
  foes: Undead[] = [];
  allies: Watchman[] = [];
  /** the Dark mirror: how far in (0..1), and where it's going */
  private dark = 0;
  private darkTarget = 0;
  /** the boss on the bar */
  private barred: Champion | null = null;
  /** what each chapter does if you fall in its fight (reset the beat so it can be tried again) */
  fallen = new Map<string, () => void>();
  private fell = false;
  private free: (() => void)[] = [];
  /** rites waiting at particular wheels (chapters register them) */
  rites = new Map<string, (node: WheelNode) => DialogueOption | null>();
  /** things the story lets you say to particular people (keyed by a name for each, so it can be replaced) */
  private says = new Map<string, { npc: string; option: () => DialogueOption | null }>();
  private wake = false;

  constructor(readonly h: StoryHooks, save?: StorySave) {
    this.state.load(save);
    this.state.notify = h.toast;
    this.director = new Director({
      camera: h.camera,
      freezeCam: (on) => {
        h.cam.frozen = on;
      },
      lockInput: (on) => {
        if (on) {
          h.input.uiMode = true;
          h.player.invulnerable = true;
        } else {
          h.player.invulnerable = false;
          h.restoreInput();
        }
      },
      scene: h.scene,
      dialogue: h.dialogue,
      ui: this.ui,
      fast: () => h.test,
      setDark: (v) => this.setDarkNow(v),
      shake: h.shake,
      playerPos: () => h.player.pos,
    });
    this.wheel = new SunwheelNetwork({
      flags: h.flags,
      awake: () => this.wheelAwake,
      nodes: () => h.wheels(),
      show: (who, title, text, opts) => h.dialogue.show(who, title, text, opts),
      close: () => h.dialogue.close(),
      travel: (to, name) => {
        h.fx.add.spawn({ pos: h.player.center, spread: 1.2, count: 60, life: [0.4, 0.9], size: [0.1, 0.02], color: 0xffe0a0, color2: 0xffa040, upBias: 1.4 });
        const p = to.clone().add(new THREE.Vector3(2.2, 0, 0));
        h.teleport(p.setY(heightAt(p.x, p.z) + 0.5));
        h.toast(`The wheel at ${name} lets you go.`);
      },
      rest: () => {
        const p = h.player;
        p.hp = p.maxHp;
        p.mana = p.maxMana;
        p.stamina = p.maxStamina;
      },
      toast: h.toast,
      save: h.save,
      rite: (node) => {
        for (const r of this.rites.values()) {
          const o = r(node);
          if (o) return o;
        }
        return null;
      },
    });
  }

  /** The Sunwheel has woken in you (the story, or Magus Orren's old quest). */
  get wheelAwake() {
    return this.wake || !!this.state.flags.wheelAwake || this.h.quests.isDone('the-sunwheel') || this.h.quests.isDone('mq-stranger');
  }
  awakenWheel() {
    this.state.flags.wheelAwake = true;
    this.wake = true;
  }

  // ---- telling it ----------------------------------------------------------------
  play(name: string, script: SceneScript, opts: { holdWorld?: boolean } = {}) {
    return this.director.play(name, script, opts);
  }
  /** The patron speaks (outside scenes too). */
  voice(text: string) {
    this.ui.whisper(text);
  }
  note(ch: string, text: string) {
    this.state.note(ch, text);
  }
  get flags() {
    return this.state.flags;
  }

  /** Something to say to someone, while the story wants it said. */
  saying(key: string, npc: string, option: () => DialogueOption | null) {
    this.says.set(key, { npc, option });
  }
  /** The story's options in a conversation with this person. */
  optionsFor(npc: string): DialogueOption[] {
    const out: DialogueOption[] = [];
    for (const s of this.says.values()) {
      if (s.npc !== npc) continue;
      const o = s.option();
      if (o) out.push(o);
    }
    return out;
  }

  // ---- the Dark mirror -------------------------------------------------------------
  private setDarkNow(v: number) {
    this.dark = this.darkTarget = v;
    DARK.value = v;
  }
  /** Ease into (or out of) the Dark mirror. */
  darkTo(v: number) {
    this.darkTarget = v;
  }
  get darkness() {
    return this.dark;
  }

  // ---- fights ----------------------------------------------------------------------
  /** Everything the story's allies should fight. */
  enemies(): Target[] {
    return [...this.champions.filter((c) => c.alive), ...this.foes.filter((f) => f.alive), ...this.champions.flatMap((c) => c.shades.filter((s) => s.alive))];
  }

  /** Bring a champion into the world (their card the first time you see them). */
  champion(id: string, at: THREE.Vector3, opts: { scale?: number; floor?: number; intro?: boolean; passive?: boolean } = {}) {
    const def = CHAMPIONS[id];
    const p = at.clone();
    p.y = heightAt(p.x, p.z);
    const c = new Champion(def, p, this.h.scene, this.h.bolts, {
      fx: this.h.fx, scene: this.h.scene, shake: this.h.shake,
      say: (name, line) => {
        if (!line) return;
        this.ui.subtitle(name, line);
        setTimeout(() => this.ui.subtitle(null, null), 2800);
      },
      enemies: this.foes as unknown as Target[],
    }, opts.scale ?? 1);
    c.floor = opts.floor ?? 0;
    if (opts.passive) {
      c.lockable = false;
      c.alerted = false;
    }
    this.champions.push(c);
    const first = !this.state.met.has(id);
    this.state.meet(id);
    if (first && opts.intro !== false) void this.play('champion:' + id, async (s) => {
      await s.champion(def.age, def.name, def.epithet, def.hidden ? 'Patron unknown' : `Champion of ${def.power === 'hollow' ? '???' : CHAMPION_POWER_NAME[def.power]}`);
    }, { holdWorld: true });
    return c;
  }
  /** Shades of the Dark, risen around a point. */
  shades(n: number, around: THREE.Vector3, r = 6) {
    const out: Undead[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const p = new THREE.Vector3(around.x + Math.cos(a) * r, 0, around.z + Math.sin(a) * r);
      p.y = heightAt(p.x, p.z);
      const u = new Undead(i % 3 === 2 ? 'zombie' : 'skeleton', p, a + Math.PI, this.h.scene, this.h.fx);
      this.foes.push(u);
      out.push(u);
      this.h.fx.add.spawn({ pos: p.clone().setY(p.y + 0.5), spread: 1.2, count: 24, life: [0.4, 0.9], size: [0.22, 0.05], color: 0x4a1a6a, color2: 0x000000, upBias: 1.4 });
    }
    return out;
  }
  /** A friend who fights at your side (follows you, picks on what attacks you). */
  ally(name: string, look: Look, at: THREE.Vector3, captain = false) {
    const p = at.clone();
    p.y = heightAt(p.x, p.z);
    const w = new Watchman(name, p, this.h.player.pos.clone(), this.h.scene, look, () => this.enemies(), captain);
    this.allies.push(w);
    extraFoes.add(w);
    return w;
  }
  /** The fight is over: everyone the story brought goes away. */
  clearFight(keepAllies = false) {
    for (const c of this.champions) c.dispose();
    this.champions = [];
    for (const f of this.foes) f.dispose();
    this.foes = [];
    if (!keepAllies) this.dismissAllies();
    this.h.bossBar(null);
    this.barred = null;
  }
  dismissAllies() {
    for (const a of this.allies) {
      extraFoes.delete(a);
      a.dispose();
    }
    this.allies = [];
  }
  /** Do this once no scene is playing (the next fixed step that's free). */
  whenFree(fn: () => void) {
    this.free.push(fn);
  }
  /** A fight you can't win, only lose: while it lasts you can't be killed (it ends in a scene). */
  lesson(on: boolean) {
    this.h.player.damageFloor = on ? 1 : 0;
  }
  /**
   * You fell. The chapters reset whatever beat you fell in (so it plays again
   * when you come back), and the story's fighters go away. Friends stay.
   */
  playerFell() {
    // (Death lands in the middle of a fighter's update: clear up at the next step.)
    this.fell = true;
  }
  private clearFallen() {
    this.fell = false;
    for (const f of this.fallen.values()) f();
    for (const c of this.champions) c.dispose();
    this.champions = [];
    for (const f of this.foes) f.dispose();
    this.foes = [];
    this.h.bossBar(null);
    this.barred = null;
    this.darkTo(0);
  }
  /** The story's shades still on their feet. */
  get aliveFoes() {
    return this.foes.filter((f) => f.alive).length;
  }
  /** Living foes the story set loose (champions count while they stand). */
  get fighting() {
    return this.enemies().length;
  }

  /** Fixed step: the story's fighters. */
  step(dt: number) {
    if (this.fell) this.clearFallen();
    if (this.free.length && !this.director.active) {
      const due = this.free;
      this.free = [];
      for (const f of due) f();
    }
    const p = this.h.player;
    for (const c of this.champions) c.update(dt, p);
    for (const f of this.foes) f.update(dt, p, this.foes);
    for (const f of this.foes.filter((x) => x.dead)) f.dispose();
    this.foes = this.foes.filter((f) => !f.dead);
    this.champions = this.champions.filter((c) => !c.dead);
    // Friends keep near you and pick fights with what's fighting you.
    let k = 0;
    for (const a of this.allies) {
      const side = new THREE.Vector3(Math.cos(k * 2.1 + 1), 0, Math.sin(k * 2.1 + 1)).multiplyScalar(3);
      a.post.copy(p.pos).add(side);
      a.update(dt);
      k++;
    }
    // The boss bar: the nearest champion who's fighting you.
    const boss = this.champions.find((c) => c.alive && c.lockable && c.position.distanceTo(p.pos) < 40) ?? null;
    if (boss !== this.barred || boss) this.h.bossBar(boss, boss ? `${boss.def.name}, ${boss.def.epithet}` : undefined);
    this.barred = boss;
  }

  /** Per frame: scenes, the whisper, the Dark, and the dread of the old ones. */
  frame(dt: number) {
    this.director.update(dt);
    this.ui.update(dt);
    // A First (or Second) Age champion near you: the edges of the world bleed.
    let dread = 0, pulse = false;
    for (const c of this.champions) {
      if (!c.alive || c.def.age > 2) continue;
      const d = c.position.distanceTo(this.h.player.pos);
      const k = Math.max(0, 1 - d / (c.def.age === 1 ? 45 : 25));
      if (c.def.age === 1) pulse = pulse || k > 0;
      dread = Math.max(dread, k * (c.def.age === 1 ? 0.95 : 0.45));
    }
    this.ui.dread(dread, pulse);
    if (!this.director.active) {
      const want = Math.max(this.darkTarget, dread > 0.5 ? dread * 0.3 : 0);
      this.dark += (want - this.dark) * Math.min(1, dt * 1.5);
      if (Math.abs(this.dark - want) < 0.002) this.dark = want;
      DARK.value = this.dark;
    }
  }

  save(): StorySave {
    return this.state.save();
  }
  reset() {
    this.free = [];
    this.fell = false;
    this.clearFight();
    this.lesson(false);
    this.state.load(undefined);
    this.wake = false;
    this.setDarkNow(0);
    this.ui.clear();
  }
}

const CHAMPION_POWER_NAME: Record<string, string> = {
  dawn: 'the Dawn', dragonGod: 'the Dragon God', dragonKing: 'the Dragon King', verdant: 'the Verdant Mother', ironBelow: 'the Iron Below',
};
