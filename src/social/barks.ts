import * as THREE from 'three';
import { pickLine, type LineCtx } from './lines';
import type { People } from './people';

// What people say out loud (NPC overhaul, phase 1): a word as you pass,
// coloured by how they feel about you; a flinch when you walk by with steel
// drawn; townsfolk gossiping with each other; and screams, threats and pleas
// when there's trouble. Shown as speech bubbles over their heads.

export interface Speaker {
  id: string;
  /** a point just above their head */
  head: THREE.Vector3;
  /** talking to the player, asleep, or otherwise not to be interrupted */
  busy?: boolean;
}

interface Bubble {
  el: HTMLDivElement;
  id: string;
  head: THREE.Vector3;
  t: number;
  life: number;
}

const PASS_R = 6.5;
const PERSON_CD = 45;
const GLOBAL_CD = 5;
const CHAT_CD = 18;

export class Barks {
  private bubbles: Bubble[] = [];
  private cd = new Map<string, number>();
  private t = 0;
  private nextAny = 3;
  private nextChat = 8;
  private tmp = new THREE.Vector3();
  private queue: { at: number; id: string; text: string; cls?: string }[] = [];
  /** off in tests that count on a quiet screen */
  enabled = true;
  /** other people who can speak (the Watch), beyond the townsfolk */
  more: () => Speaker[] = () => [];

  constructor(
    private people: People,
    private camera: THREE.Camera,
    private speakers: () => Speaker[],
    private ctx: (id: string) => LineCtx,
    private weaponOut: () => boolean,
  ) {}

  /** Say something right now (screams, threats, the Watch). */
  say(id: string, text: string, cls = '', life = 3.2) {
    const s = this.speakers().find((x) => x.id === id) ?? this.more().find((x) => x.id === id);
    if (!s || !text) return;
    const old = this.bubbles.find((b) => b.id === id);
    if (old) this.drop(old);
    const el = document.createElement('div');
    el.className = 'bark' + (cls ? ' ' + cls : '');
    el.textContent = text;
    document.getElementById('ui')!.appendChild(el);
    this.bubbles.push({ el, id, head: s.head, t: 0, life });
    this.cd.set(id, this.t);
    if (this.bubbles.length > 4) this.drop(this.bubbles[0]);
  }

  /** A line from a pool, in their voice. */
  sayLine(id: string, cat: string, cls = '', extra: Record<string, string> = {}) {
    const p = this.people.get(id);
    if (!p) return;
    this.say(id, pickLine(cat, p, this.ctx(id), this.people.rep.memOf(id), extra), cls);
  }

  private drop(b: Bubble) {
    b.el.remove();
    this.bubbles.splice(this.bubbles.indexOf(b), 1);
  }

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    for (const q of [...this.queue]) if (q.at <= this.t) {
      this.queue.splice(this.queue.indexOf(q), 1);
      this.say(q.id, q.text, q.cls);
    }
    if (this.enabled && this.t > this.nextAny) this.passBy(player);
    if (this.enabled && this.t > this.nextChat) this.chatter(player);
    // Bubbles follow their speaker's head and fade out.
    for (const b of [...this.bubbles]) {
      b.t += dt;
      if (b.t > b.life) {
        this.drop(b);
        continue;
      }
      this.tmp.copy(b.head).project(this.camera);
      const d = b.head.distanceTo(player);
      const on = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1 && d < 30;
      b.el.style.display = on ? 'block' : 'none';
      if (!on) continue;
      b.el.style.left = (this.tmp.x * 0.5 + 0.5) * window.innerWidth + 'px';
      b.el.style.top = (-this.tmp.y * 0.5 + 0.5) * window.innerHeight + 'px';
      b.el.style.opacity = String(Math.min(1, (b.life - b.t) / 0.4, b.t / 0.15));
    }
  }

  /** Someone you walk past says something (or flinches). */
  private passBy(player: THREE.Vector3) {
    this.nextAny = this.t + 1;
    let best: Speaker | null = null, bd = PASS_R;
    for (const s of this.speakers()) {
      if (s.busy || !this.people.present(s.id)) continue;
      if (this.t - (this.cd.get(s.id) ?? -999) < PERSON_CD) continue;
      const d = Math.hypot(s.head.x - player.x, s.head.z - player.z);
      if (d < bd) (bd = d), (best = s);
    }
    if (!best) return;
    const p = this.people.get(best.id);
    if (!p) return;
    const rep = this.people.rep;
    const mood = rep.moodOf(p.id);
    const c = this.ctx(p.id);
    const warm = mood === 'warm' || mood === 'friend' || mood === 'devoted';
    const cold = mood === 'hostile' || mood === 'cold';
    // Neutral strangers don't always speak; friends and enemies usually do.
    if (!warm && !cold && Math.random() < 0.5) {
      this.cd.set(p.id, this.t - PERSON_CD * 0.6);
      return;
    }
    let cat = `bark.${mood}`;
    if (rep.fears(p.id)) cat = 'bark.fear';
    else if (this.weaponOut() && !p.guard && (p.traits.courage < 0.2 || cold)) cat = 'bark.weapon';
    else if (p.child && Math.random() < 0.5) cat = 'bark.child';
    else if (p.guard && Math.random() < 0.5) cat = 'bark.guard';
    else if (c.rain && Math.random() < 0.4) cat = 'bark.rain';
    else if ((c.hour >= 21 || c.hour < 5) && Math.random() < 0.4) cat = 'bark.night';
    this.sayLine(p.id, cat, cold ? 'hostile' : warm ? 'friend' : '');
    this.nextAny = this.t + GLOBAL_CD;
  }

  /** Two townsfolk standing together, talking (something to overhear). */
  private chatter(player: THREE.Vector3) {
    this.nextChat = this.t + 4;
    const near = this.speakers().filter((s) => !s.busy && this.people.present(s.id) && Math.hypot(s.head.x - player.x, s.head.z - player.z) < 14);
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j];
        if (a.head.distanceTo(b.head) > 3.2) continue;
        if (this.t - (this.cd.get(a.id) ?? -999) < 20 || this.t - (this.cd.get(b.id) ?? -999) < 20) continue;
        const pa = this.people.get(a.id), pb = this.people.get(b.id);
        if (!pa || !pb) continue;
        // What they talk about: each other's people, the news, or you.
        const tie = pa.ties.find((t) => t.id !== pb.id && this.people.present(t.id));
        const other = tie ? this.people.get(tie.id)?.first : undefined;
        const ctx = this.ctx(a.id);
        const told = this.people.rep.told.find((t) => t.community === this.people.communityFor(a.id));
        // They talk about you in the third person (you're only overhearing).
        const deed = told ? told.text.replace(/\byou\b/g, 'that adventurer').replace(/\byour\b/g, 'their') : undefined;
        const lineA = deed && Math.random() < 0.5
          ? `Did you hear? ${cap(deed)}.`
          : pickLine('chat.a', pa, { ...ctx, deed: deed ?? 'the wolves were at the pens again' }, this.people.rep.memOf(a.id), other ? { other } : {});
        this.say(a.id, lineA, '', 3.4);
        this.queue.push({ at: this.t + 2.6, id: b.id, text: pickLine('chat.b', pb, this.ctx(b.id), this.people.rep.memOf(b.id)) });
        this.cd.set(b.id, this.t);
        this.nextChat = this.t + CHAT_CD;
        return;
      }
    }
  }

  clear() {
    for (const b of [...this.bubbles]) this.drop(b);
    this.queue.length = 0;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
