import * as THREE from 'three';
import './ghagrabba.css';

// Lines spoken aloud in the street: a parchment bubble over the speaker's
// head, projected to the screen each frame, fading with distance. Only a few
// at once, and only within earshot.

export type VoiceStyle = 'plain' | 'royal' | 'chant' | 'night';

interface Bubble {
  el: HTMLDivElement;
  at: () => THREE.Vector3;
  until: number;
}

const HEAR = 34;

export class Voices {
  private root: HTMLDivElement;
  private live: Bubble[] = [];
  private t = 0;
  private tmp = new THREE.Vector3();
  hidden = false;

  constructor(private camera: THREE.Camera, private listener: () => THREE.Vector3) {
    this.root = document.createElement('div');
    this.root.className = 'gh-voices';
    document.getElementById('ui')?.appendChild(this.root);
  }

  /** Say a line over a (moving) speaker for a few seconds. Out of earshot, nothing happens. */
  say(at: THREE.Vector3 | (() => THREE.Vector3), who: string, text: string, style: VoiceStyle = 'plain', seconds = 4.5) {
    const get = typeof at === 'function' ? at : () => at;
    if (get().distanceTo(this.listener()) > HEAR) return false;
    // One bubble per speaker: a new line replaces the old.
    for (const b of this.live.filter((b) => b.at() === get() || b.at().distanceToSquared(get()) < 0.5)) this.drop(b);
    if (this.live.length >= 5) this.drop(this.live[0]);
    const el = document.createElement('div');
    el.className = 'gh-voice' + (style === 'plain' ? '' : ' ' + style);
    const w = document.createElement('span');
    w.className = 'who';
    w.textContent = who;
    el.append(w, document.createTextNode(text));
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    this.live.push({ el, at: get, until: this.t + seconds });
    return true;
  }

  private drop(b: Bubble) {
    b.el.remove();
    this.live = this.live.filter((x) => x !== b);
  }

  clear() {
    for (const b of [...this.live]) this.drop(b);
  }

  update(dt: number) {
    this.t += dt;
    const me = this.listener();
    for (const b of [...this.live]) {
      if (this.t > b.until) {
        this.drop(b);
        continue;
      }
      const p = b.at();
      const d = p.distanceTo(me);
      this.tmp.copy(p).setY(p.y + 2.25).project(this.camera);
      const on = !this.hidden && this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.05 && Math.abs(this.tmp.y) < 1.05 && d < HEAR;
      b.el.style.display = on ? 'block' : 'none';
      if (!on) continue;
      b.el.style.left = `${(this.tmp.x * 0.5 + 0.5) * window.innerWidth}px`;
      b.el.style.top = `${(-this.tmp.y * 0.5 + 0.5) * window.innerHeight}px`;
      const fade = Math.min(1, (b.until - this.t) / 0.5) * THREE.MathUtils.clamp(1.4 - d / HEAR, 0.25, 1);
      b.el.style.opacity = fade.toFixed(2);
      b.el.style.zIndex = String(Math.round(100 - d));
    }
  }
}
