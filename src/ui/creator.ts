import './creator.css';
import * as THREE from 'three';
import { buildCharacter, type Hair } from '../npc/charBuilder';
import { addOriginParts, fitHeight, shapeBones, type PartsHandle } from '../npc/charParts';
import { kitLook } from '../origins/hero';
import { ORIGINS, ORIGIN_IDS, cleanLook, defaultLook, randomName, type OriginLook } from '../origins/data';
import type { Origins } from '../origins/origins';
import type { Origin } from '../progression/progression';

// The character creator (docs/design/origins.md §7), opened from the title
// screen when a new game begins: origin, body, face and hair, the origin's
// own details (ears, horns, tail, markings), and a name. The hero stands on a
// turntable in its own small renderer (drag to turn it); "Begin" rebuilds the
// real player from the look and starts the game.

const HAIRS: [Hair, string][] = [['simpleparted', 'Parted'], ['long', 'Long'], ['buns', 'Buns'], ['buzzed', 'Cropped'], ['buzzedfemale', 'Short'], [null, 'None']];
const BUILD_NAMES = { slim: 'Slim', average: 'Average', broad: 'Broad' } as const;
const EAR_NAMES = { none: 'None', elf: 'Elven', wolf: 'Wolf', cat: 'Cat' } as const;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class CharacterCreator {
  readonly el: HTMLDivElement;
  open = false;
  look: OriginLook;
  private panel: HTMLElement;
  private stage: HTMLElement;
  private nameEl: HTMLElement;
  private busyEl: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  private hero: { root: THREE.Group; mixer: THREE.AnimationMixer; parts: PartsHandle; mats: THREE.Material[] } | null = null;
  private token = 0;
  private yaw = 0.5;
  private dragging = false;
  private spread = false;
  private raf = 0;
  private last = 0;
  private begin: (() => void) | null = null;
  /** the player typed a name (keep it across origins) */
  private typed = false;
  /** resolves when the preview has the current look (tests) */
  ready: Promise<void> = Promise.resolve();

  constructor(private origins: Origins) {
    this.look = { ...defaultLook('human'), name: randomName('human') };
    this.el = document.createElement('div');
    this.el.className = 'creator hidden';
    this.el.innerHTML = `<div class="cr-panel"></div><div class="cr-stage"><span class="cr-hint">DRAG TO TURN</span><div class="cr-busy">Shaping your hero…</div><div class="cr-name"></div></div>`;
    document.getElementById('ui')!.appendChild(this.el);
    this.panel = this.el.querySelector('.cr-panel')!;
    this.stage = this.el.querySelector('.cr-stage')!;
    this.nameEl = this.el.querySelector('.cr-name')!;
    this.busyEl = this.el.querySelector('.cr-busy')!;
    // Nothing in here may reach the title screen or the game.
    for (const ev of ['click', 'pointerdown', 'mousedown', 'keydown']) this.el.addEventListener(ev, (e) => e.stopPropagation());
    this.panel.addEventListener('click', (e) => this.onClick(e));
    this.panel.addEventListener('input', (e) => this.onInput(e));
    this.stage.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.stage.setPointerCapture(e.pointerId);
    });
    this.stage.addEventListener('pointerup', () => (this.dragging = false));
    this.stage.addEventListener('pointermove', (e) => this.dragging && (this.yaw += e.movementX * 0.012));
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x6a5a40, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.4);
    rim.position.set(-3, 2, -3);
    this.scene.add(sun, rim);
  }

  /** Show the creator; `begin` runs once the hero is made. */
  show(begin: () => void) {
    this.begin = begin;
    this.open = true;
    this.el.classList.remove('hidden');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.stage.prepend(this.renderer.domElement);
    }
    this.render();
    this.rebuild();
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.open) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    this.disposeHero();
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }

  /** Change the look (also what tests drive). */
  set(patch: Partial<OriginLook>) {
    const origin = (patch.origin ?? this.look.origin) as Origin;
    if (origin !== this.look.origin) {
      // A new people: their own palette and parts, keeping body, name if typed.
      this.look = { ...defaultLook(origin, this.look.body), name: this.typed ? this.look.name : randomName(origin) };
    }
    this.look = cleanLook({ ...this.look, ...patch, origin }, origin);
    this.render();
    this.rebuild();
  }

  /** Make the hero and start the game. */
  async confirm() {
    const btn = this.panel.querySelector<HTMLButtonElement>('.cr-begin');
    if (btn) btn.disabled = true;
    this.busyEl.classList.add('on');
    await this.origins.setLook(this.look);
    this.close();
    const b = this.begin;
    this.begin = null;
    b?.();
  }

  // ---- the panel -----------------------------------------------------------------------
  private render() {
    const l = this.look, def = ORIGINS[l.origin], L = def.look;
    const chips = (key: string, opts: [string | number | null | boolean, string][], cur: unknown) =>
      opts.map(([v, label]) => `<button type="button" class="cr-chip${v === cur ? ' on' : ''}" data-k="${key}" data-v="${String(v)}">${label}</button>`).join('');
    const swatches = (key: string, list: number[], cur: number) => list.map((c) => `<button type="button" class="cr-sw${c === cur ? ' on' : ''}" data-k="${key}" data-v="${c}" style="background:${hex(c)}" aria-label="${hex(c)}"></button>`).join('');
    const details: string[] = [];
    if (L.ears.length > 1 || L.ears[0] !== 'none') details.push(`<div class="cr-row"><label>EARS</label>${chips('ears', L.ears.map((e) => [e, EAR_NAMES[e]]), l.ears)}</div>`);
    if (L.horns.length) details.push(`<div class="cr-row"><label>HORNS</label>${chips('horns', [[-1, 'None'], ...L.horns.map((h, i): [number, string] => [i, h])], l.horns)}</div>`);
    if (L.tail === 'optional') details.push(`<div class="cr-row"><label>TAIL</label>${chips('tail', [[true, 'Yes'], [false, 'No']], l.tail)}</div>`);
    if (L.markings !== 'none') details.push(`<div class="cr-row"><label>${L.markings === 'fur' ? 'FUR' : 'SCALES'}</label>${chips('markings', [[true, 'Marked'], [false, 'Plain']], l.markings)}</div>`);
    if (L.wings) details.push(`<div class="cr-row"><label>WINGS</label>${chips('spread', [[false, 'Folded'], [true, 'Spread']], this.spread)}</div>`);
    if (!details.length) details.push('<p class="cr-about">Your people have no horns, tails or wings to choose: only the face you were born with.</p>');
    this.panel.innerHTML = `<h1>WHO WERE YOU?</h1><p class="cr-sub">The summoning took you whole: your people, your face, your name.</p>
      <section><h2 data-n="1">ORIGIN</h2><div class="cr-origins">${ORIGIN_IDS.map((o) => `<button type="button" class="cr-origin${o === l.origin ? ' on' : ''}" data-k="origin" data-v="${o}">${ORIGINS[o].name.toUpperCase()}</button>`).join('')}</div>
        <div class="cr-about">${esc(def.line)}<ul>${def.passives.map((p) => `<li><b>${esc(p.name.toUpperCase())}</b> ${esc(p.text)}</li>`).join('')}</ul><b>LEGEND</b> ${def.tree.map((t) => esc(t.name)).join(' · ')}</div></section>
      <section><h2 data-n="2">BODY</h2>
        <div class="cr-row"><label>FRAME</label>${chips('body', [['male', 'Masculine'], ['female', 'Feminine']], l.body)}</div>
        <div class="cr-row"><label>HEIGHT</label><input type="range" data-k="height" min="${L.heights[0]}" max="${L.heights[1]}" step="0.01" value="${l.height}"><span class="cr-val">${l.height.toFixed(2)} m</span></div>
        <div class="cr-row"><label>BUILD</label>${chips('build', L.builds.map((b) => [b, BUILD_NAMES[b]]), l.build)}</div></section>
      <section><h2 data-n="3">FACE AND HAIR</h2>
        <div class="cr-row"><label>HAIR</label>${chips('hair', HAIRS, l.hair)}</div>
        <div class="cr-row"><label>BEARD</label>${chips('beard', [[false, 'None'], [true, l.origin === 'dwarf' ? 'Braided' : 'Full']], l.beard)}</div>
        <div class="cr-row"><label>HAIR</label>${swatches('hairColor', L.hair, l.hairColor)}</div>
        <div class="cr-row"><label>SKIN</label>${swatches('skin', L.skins, l.skin)}</div>
        <div class="cr-row"><label>EYES</label>${swatches('eyes', L.eyes, l.eyes)}</div></section>
      <section><h2 data-n="4">${def.name.toUpperCase()} DETAILS</h2>${details.join('')}</section>
      <section><h2 data-n="5">NAME</h2><div class="cr-row"><input type="text" data-k="name" maxlength="24" value="${esc(l.name)}"><button type="button" class="cr-chip" data-k="random">Random</button></div></section>
      <button type="button" class="cr-begin">BEGIN YOUR STORY</button>`;
    this.nameEl.innerHTML = `${esc(l.name)}<small>${def.name} · ${l.height.toFixed(2)} m</small>`;
  }

  private onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-k], .cr-begin');
    if (!t) return;
    if (t.classList.contains('cr-begin')) return void this.confirm();
    const k = t.dataset.k!, v = t.dataset.v;
    if (k === 'random') return this.set({ name: randomName(this.look.origin) });
    if (k === 'spread') {
      this.spread = v === 'true';
      return this.render();
    }
    const val: unknown = v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : k === 'horns' || k === 'hairColor' || k === 'skin' || k === 'eyes' ? Number(v) : v;
    this.set({ [k]: val } as Partial<OriginLook>);
  }

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.dataset.k === 'height') {
      this.look = cleanLook({ ...this.look, height: Number(t.value) }, this.look.origin);
      (t.nextElementSibling as HTMLElement).textContent = `${this.look.height.toFixed(2)} m`;
      this.nameEl.innerHTML = `${esc(this.look.name)}<small>${ORIGINS[this.look.origin].name} · ${this.look.height.toFixed(2)} m</small>`;
      this.rebuild();
    } else if (t.dataset.k === 'name') {
      this.look = { ...this.look, name: t.value.slice(0, 24) };
      this.typed = true;
      this.nameEl.innerHTML = `${esc(this.look.name || '…')}<small>${ORIGINS[this.look.origin].name}</small>`;
    }
  }

  // ---- the turntable ---------------------------------------------------------------------
  private rebuild() {
    const token = ++this.token;
    const look = { ...this.look };
    this.busyEl.classList.add('on');
    this.ready = (async () => {
      await new Promise((r) => setTimeout(r, 90)); // let a slider settle
      if (token !== this.token) return;
      const built = await buildCharacter(kitLook(look), ['idle'], { merge: false });
      if (token !== this.token || !this.open) return;
      const bone = (n: string) => built.bones.get(n);
      shapeBones(bone, look);
      fitHeight(built.model, look.height);
      const parts = addOriginParts(built.root, built.model, bone, look);
      const mats: THREE.Material[] = [];
      built.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.push(x);
      });
      const acts = (built.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      acts[0]?.play();
      this.disposeHero();
      this.scene.add(built.root);
      this.hero = { root: built.root, mixer: built.mixer, parts, mats };
      this.busyEl.classList.remove('on');
    })();
  }

  private disposeHero() {
    if (!this.hero) return;
    this.hero.root.removeFromParent();
    this.hero.parts.dispose();
    for (const m of this.hero.mats) m.dispose();
    this.hero = null;
  }

  private tick(dt: number) {
    const R = this.renderer;
    if (!R) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (w < 10 || h < 10) return;
    const size = R.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) R.setSize(w, h, false);
    if (!this.dragging) this.yaw += dt * 0.25;
    const H = this.look.height;
    if (this.hero) {
      this.hero.mixer.update(dt);
      this.hero.root.rotation.y = this.yaw;
      this.hero.parts.update(dt, { spread: this.spread ? 1 : 0, flap: this.spread ? performance.now() / 300 : 0, speed: 0 });
    }
    this.cam.aspect = w / h;
    const dist = 2.2 + H * 1.55 + (this.spread ? 1.2 : 0);
    this.cam.position.set(0, H * 0.62, dist);
    this.cam.lookAt(0, H * 0.52, 0);
    this.cam.updateProjectionMatrix();
    R.render(this.scene, this.cam);
  }
}
