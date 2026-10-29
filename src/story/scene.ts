import * as THREE from 'three';
import { buildCharacter, type BuiltCharacter, type Look } from '../npc/charBuilder';
import { heightAt } from '../world/terrainHeight';
import type { DialogueOption, DialogueUI } from '../ui/dialogue';
import type { StoryUI } from './ui';

// The scene director (main story): short scripted scenes written as async
// functions. A scene can take the camera, put up the letterbox, show
// subtitles, move and animate story actors, fade, darken the world, and ask
// the player to choose. Esc skips the whole scene (every wait ends at once and
// actors jump to where they were going); tests run scenes in "fast" mode.

export interface SceneHost {
  camera: THREE.PerspectiveCamera;
  /** take or give back the player camera */
  freezeCam(on: boolean): void;
  /** take or give back player control */
  lockInput(on: boolean): void;
  scene: THREE.Scene;
  dialogue: DialogueUI;
  ui: StoryUI;
  /** tests: no waiting */
  fast(): boolean;
  /** the Dark mirror's strength (0..1) */
  setDark(v: number): void;
  shake(n: number): void;
  playerPos(): THREE.Vector3;
}

interface Wait {
  done: () => boolean;
  resolve: () => void;
}

export class StoryActor {
  readonly root = new THREE.Group();
  built: BuiltCharacter | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  private walk: { to: THREE.Vector3; speed: number; done: () => void } | null = null;
  yaw = 0;
  constructor(readonly pos: THREE.Vector3, yaw: number) {
    this.yaw = yaw;
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
  }
  attach(b: BuiltCharacter) {
    this.built = b;
    const acts = (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
    for (const a of acts) this.actions[a.getClip().name] = a;
    b.root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    this.root.add(b.root);
    this.play('idle');
  }
  play(name: string, once = false) {
    if (this.clip === name) return;
    const next = this.actions[name] ?? this.actions.idle;
    if (!next) return;
    const prev = this.actions[this.clip];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.25, false);
    this.clip = name;
  }
  face(p: THREE.Vector3) {
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }
  walkTo(to: THREE.Vector3, speed = 1.4) {
    return new Promise<void>((done) => {
      this.walk = { to: to.clone(), speed, done };
      this.play(speed > 3 ? 'jog' : 'walk');
    });
  }
  /** Skip: arrive at once. */
  arrive() {
    if (!this.walk) return;
    this.pos.copy(this.walk.to);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    const d = this.walk.done;
    this.walk = null;
    this.play('idle');
    d();
  }
  update(dt: number) {
    if (this.walk) {
      const d = this.walk.to.clone().sub(this.pos).setY(0);
      const len = d.length();
      const step = this.walk.speed * dt;
      if (len <= step) this.arrive();
      else {
        this.pos.addScaledVector(d.normalize(), step);
        this.pos.y = heightAt(this.pos.x, this.pos.z);
        const want = Math.atan2(d.x, d.z);
        this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 8);
      }
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.built?.mixer.update(dt);
  }
}

export type SceneScript = (s: SceneApi) => Promise<void>;

export class Director {
  active: string | null = null;
  private waits: Wait[] = [];
  private skipping = false;
  private clock = 0;
  private actors: StoryActor[] = [];
  private camAnim: { from: THREE.Vector3; fromQ: THREE.Quaternion; to: THREE.Vector3; toQ: THREE.Quaternion; t: number; dur: number } | null = null;
  private camTaken = false;
  private advance = false;
  /** stop the world while the scene plays (the default) */
  holdWorld = false;
  private queue: { name: string; script: SceneScript; resolve: () => void }[] = [];

  constructor(private h: SceneHost) {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.skip();
      } else if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && !h.dialogue.open) {
        e.stopImmediatePropagation();
        this.advance = true;
      }
    }, true);
    window.addEventListener('mousedown', () => {
      if (this.active && !h.dialogue.open) this.advance = true;
    });
  }

  /** Play a scene (queued behind any scene already playing). */
  play(name: string, script: SceneScript, opts: { holdWorld?: boolean } = {}) {
    return new Promise<void>((resolve) => {
      this.queue.push({ name, script: async (s) => {
        this.holdWorld = opts.holdWorld ?? true;
        await script(s);
      }, resolve });
      if (!this.active) void this.next();
    });
  }

  private async next() {
    const q = this.queue.shift();
    if (!q) return;
    this.active = q.name;
    this.skipping = false;
    this.h.lockInput(true);
    try {
      await q.script(this.api());
    } catch (err) {
      console.error('story scene failed', q.name, err);
    }
    this.end();
    q.resolve();
    if (this.queue.length) void this.next();
  }

  private end() {
    for (const w of this.waits) w.resolve();
    this.waits = [];
    for (const a of this.actors) if (!a.root.userData.keep) a.root.removeFromParent();
    this.actors = this.actors.filter((a) => a.root.userData.keep);
    this.h.ui.clear();
    if (this.camTaken) this.h.freezeCam(false);
    this.camTaken = false;
    this.camAnim = null;
    this.h.lockInput(false);
    this.holdWorld = false;
    this.active = null;
  }

  skip() {
    if (!this.active) return;
    this.skipping = true;
    for (const a of this.actors) a.arrive();
    if (this.camAnim) this.camAnim.t = this.camAnim.dur;
  }

  get fast() {
    return this.skipping || this.h.fast();
  }

  private waitFor(done: () => boolean) {
    if (this.fast || done()) return Promise.resolve();
    return new Promise<void>((resolve) => this.waits.push({ done: () => this.fast || done(), resolve }));
  }

  update(dt: number) {
    this.clock += dt;
    for (const a of this.actors) a.update(dt);
    const c = this.camAnim;
    if (c) {
      c.t = Math.min(c.dur, c.t + dt);
      const k = c.dur > 0 ? c.t / c.dur : 1;
      const e = k * k * (3 - 2 * k);
      this.h.camera.position.lerpVectors(c.from, c.to, e);
      this.h.camera.quaternion.slerpQuaternions(c.fromQ, c.toQ, e);
    }
    const ready = this.waits.filter((w) => w.done());
    this.waits = this.waits.filter((w) => !ready.includes(w));
    for (const w of ready) w.resolve();
    this.advance = false;
  }

  /** Keep an actor after the scene ends (it stays in the world until removed). */
  keep(a: StoryActor) {
    a.root.userData.keep = true;
  }

  private api(): SceneApi {
    const h = this.h;
    const until = (sec: number) => {
      const end = this.clock + sec;
      return this.waitFor(() => this.clock >= end);
    };
    const api: SceneApi = {
      fast: () => this.fast,
      wait: (sec) => until(sec),
      bars: (on) => h.ui.letterbox(on),
      fade: async (a, sec = 0.6) => {
        h.ui.fade(a, this.fast ? 0 : sec);
        await until(sec);
      },
      say: async (who, text, sec) => {
        h.ui.subtitle(who, text);
        const dur = sec ?? Math.max(2.4, 1.2 + text.length / 17);
        const end = this.clock + dur;
        let armed = false;
        await this.waitFor(() => {
          // A press moves the line on (but not the press that started it).
          if (this.clock > end - dur + 0.35) armed = true;
          return this.clock >= end || (armed && this.advance);
        });
        h.ui.subtitle(null, null);
      },
      voice: async (text, sec) => {
        h.ui.whisper(text, sec);
        await until(sec ?? Math.max(3.2, 1.6 + text.length / 22));
      },
      card: async (small, title, sub = '', sec = 3.4) => {
        h.ui.card(small, title, sub);
        await until(sec);
        h.ui.hideCard();
        await until(0.6);
      },
      champion: async (age, name, epithet, power, sec = 3.2) => {
        h.ui.champion(age, name, epithet, power);
        if (age <= 2) h.shake(age === 1 ? 0.9 : 0.5);
        await until(sec + (age === 1 ? 1.2 : 0));
        h.ui.hideChampion();
      },
      cam: async (pos, look, sec = 0) => {
        if (!this.camTaken) {
          this.camTaken = true;
          h.freezeCam(true);
        }
        const toQ = new THREE.Quaternion();
        const m = new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0));
        toQ.setFromRotationMatrix(m);
        this.camAnim = { from: h.camera.position.clone(), fromQ: h.camera.quaternion.clone(), to: pos.clone(), toQ, t: 0, dur: this.fast ? 0 : sec };
        if (sec <= 0 || this.fast) {
          h.camera.position.copy(pos);
          h.camera.quaternion.copy(toQ);
          this.camAnim = null;
          return;
        }
        await until(sec);
      },
      release: () => {
        if (this.camTaken) h.freezeCam(false);
        this.camTaken = false;
        this.camAnim = null;
      },
      actor: async (look, at, yaw = 0, clips = ['idle', 'walk', 'talk', 'jog', 'sword_idle', 'sword_attack', 'hit', 'crouch', 'cheer']) => {
        const p = at.clone();
        p.y = heightAt(p.x, p.z);
        const a = new StoryActor(p, yaw);
        h.scene.add(a.root);
        this.actors.push(a);
        try {
          a.attach(await buildCharacter(look, clips));
        } catch {
          /* (tests without assets: an empty actor still walks) */
        }
        return a;
      },
      remove: (a) => {
        a.root.removeFromParent();
        this.actors = this.actors.filter((x) => x !== a);
      },
      dark: async (v, sec = 1) => {
        const from = this.darkLevel;
        const start = this.clock;
        this.darkLevel = v;
        if (this.fast || sec <= 0) return void h.setDark(v);
        await this.waitFor(() => {
          const k = Math.min(1, (this.clock - start) / sec);
          h.setDark(from + (v - from) * k);
          return k >= 1;
        });
      },
      shake: (n) => h.shake(n),
      choose: (who, title, text, options) => new Promise<number>((resolve) => {
        if (h.fast() && this.autoChoice !== undefined) return resolve(this.autoChoice);
        h.ui.subtitle(null, null);
        h.dialogue.show(who, title, text, options.map((o, i): DialogueOption => ({ label: o.label, tone: o.tone, run: () => { h.dialogue.close(); resolve(i); } })));
      }),
    };
    return api;
  }
  private darkLevel = 0;
  /** tests: the answer every choice gets in fast mode (unset: the dialogue waits for a pick) */
  autoChoice: number | undefined;
}

export interface SceneApi {
  fast(): boolean;
  wait(sec: number): Promise<void>;
  bars(on: boolean): void;
  fade(alpha: number, sec?: number): Promise<void>;
  say(who: string | null, text: string, sec?: number): Promise<void>;
  voice(text: string, sec?: number): Promise<void>;
  card(small: string, title: string, sub?: string, sec?: number): Promise<void>;
  champion(age: number, name: string, epithet: string, power: string, sec?: number): Promise<void>;
  cam(pos: THREE.Vector3, look: THREE.Vector3, sec?: number): Promise<void>;
  /** give the camera back mid-scene */
  release(): void;
  actor(look: Look, at: THREE.Vector3, yaw?: number, clips?: string[]): Promise<StoryActor>;
  remove(a: StoryActor): void;
  dark(v: number, sec?: number): Promise<void>;
  shake(n: number): void;
  choose(who: string, title: string, text: string, options: { label: string; tone?: DialogueOption['tone'] }[]): Promise<number>;
}
