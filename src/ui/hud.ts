import * as THREE from 'three';
import type { Player } from '../player/player';
import { targets } from '../combat/targets';
import { events } from '../core/events';
import { iconFor, wideIconFor } from './icons';

// Heads-up display: vitals (top right); bottom left, the two big hand frames
// (main / off hand) beside a bar that Tab flips between quick items (keys 1-4)
// and the moveset (keys 1-6); lock-on reticle, enemy health bars, floating
// damage numbers, toasts and the death screen.

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

interface BarEls {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  trail: HTMLDivElement;
  num: HTMLSpanElement;
  trailV: number;
  trailHold: number;
  last: number;
}

export class HUD {
  readonly root: HTMLElement;
  private bars: Record<'hp' | 'st' | 'mp', BarEls>;
  private slots: HTMLDivElement[] = [];
  private hands: Record<'main' | 'off', HTMLDivElement>;
  private barTitle: HTMLDivElement;
  /** which set the number keys use */
  mode: 'items' | 'moves' = 'items';
  private reticle: HTMLDivElement;
  private ehp = new Map<number, { e: HTMLDivElement; i: HTMLElement; b: HTMLElement; shown: number; trail: number }>();
  private toastEl: HTMLDivElement;
  private toastT = 0;
  private banner: HTMLDivElement;
  private vignette: HTMLDivElement;
  private death: HTMLDivElement;
  private tmp = new THREE.Vector3();
  private hotbarDirty = true;
  onSlotDrop?: (mode: 'items' | 'moves', slot: number, uid: number) => void;

  constructor(private player: Player, private camera: THREE.Camera) {
    this.root = document.getElementById('ui')!;
    this.vignette = el('div', 'vignette', this.root);

    const vit = el('div', 'vitals', this.root);
    const mk = (k: 'hp' | 'st' | 'mp', label: string): BarEls => {
      const root = el('div', `bar ${k}`, vit);
      el('span', 'label', root, label);
      const trail = el('div', 'trail', root);
      const fill = el('div', 'fill', root);
      const num = el('span', 'num', root);
      return { root, fill, trail, num, trailV: 1, trailHold: 0, last: 1 };
    };
    this.bars = { hp: mk('hp', 'HEALTH'), st: mk('st', 'STAMINA'), mp: mk('mp', 'MANA') };

    const wrap = el('div', 'loadout-wrap', this.root);
    const handRow = el('div', 'hands', wrap);
    const mkHand = (k: 'main' | 'off', label: string, key: string) => {
      const h = el('div', `hand ${k}`, handRow);
      h.innerHTML = `<span class="cap">${label}</span><span class="keyhint">${key}</span><div class="art"></div><span class="nm"></span>`;
      return h;
    };
    this.hands = { main: mkHand('main', 'MAIN HAND', 'LMB'), off: mkHand('off', 'OFF HAND', 'RMB') };
    const side = el('div', 'quickside', wrap);
    this.barTitle = el('div', 'bar-title', side);
    const hb = el('div', 'hotbar', side);
    for (let i = 0; i < 6; i++) {
      const s = el('div', 'slot interactive', hb);
      s.dataset.i = String(i);
      s.addEventListener('dragover', (e) => {
        e.preventDefault();
        s.classList.add('dragover');
      });
      s.addEventListener('dragleave', () => s.classList.remove('dragover'));
      s.addEventListener('drop', (e) => {
        e.preventDefault();
        s.classList.remove('dragover');
        const uid = Number(e.dataTransfer?.getData('text/uid'));
        if (uid) this.onSlotDrop?.(this.mode, i, uid);
      });
      this.slots.push(s);
    }

    this.reticle = el('div', 'reticle', this.root);
    this.toastEl = el('div', 'toast', this.root);
    this.banner = el('div', 'banner', this.root);
    this.death = el('div', 'death', this.root, '<h1>YOU DIED</h1>');
    el('div', 'hint', this.root, '<b>I</b> inventory &nbsp;·&nbsp; <b>H</b> controls');

    events.on('equipmentChanged', () => (this.hotbarDirty = true));
    events.on('notEnough', ({ stat }) => {
      this.toast(stat === 'mana' ? 'Not enough mana' : 'Not enough stamina');
      this.bars[stat === 'mana' ? 'mp' : 'st'].root.classList.remove('flash');
      void this.bars[stat === 'mana' ? 'mp' : 'st'].root.offsetWidth;
      this.bars[stat === 'mana' ? 'mp' : 'st'].root.classList.add('flash');
    });
    events.on('needTarget', () => this.toast('Lock on to a target to cast this (middle mouse)'));
    events.on('enemyHit', ({ at, amount, crit }) => this.damageNumber(at, amount, crit));
    events.on('parrySuccess', () => this.showBanner('PARRIED'));
    events.on('blockImpact', ({ guardBroken }) => guardBroken && this.showBanner('GUARD BROKEN'));
    events.on('playerDamaged', () => {
      this.vignette.classList.add('hurt');
      requestAnimationFrame(() => requestAnimationFrame(() => this.vignette.classList.remove('hurt')));
    });
    events.on('playerDied', () => this.death.classList.add('show'));
    events.on('playerRespawned', () => this.death.classList.remove('show'));
  }

  markHotbarDirty() {
    this.hotbarDirty = true;
  }

  pulseSlot(i: number) {
    const s = this.slots[i];
    s.classList.remove('pulse');
    void s.offsetWidth;
    s.classList.add('pulse');
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = 1.4;
  }

  showBanner(text: string) {
    this.banner.textContent = text;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  private project(p: THREE.Vector3) {
    this.tmp.copy(p).project(this.camera);
    const onScreen = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
    return { x: (this.tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-this.tmp.y * 0.5 + 0.5) * window.innerHeight, on: onScreen };
  }

  private damageNumber(at: THREE.Vector3, amount: number, crit: boolean) {
    const p = this.project(at.clone().add(new THREE.Vector3(0, 0.4, 0)));
    if (!p.on) return;
    const d = el('div', 'dmg' + (crit ? ' crit' : ''), this.root, String(amount));
    d.style.left = `${p.x + (Math.random() - 0.5) * 30}px`;
    d.style.top = `${p.y}px`;
    setTimeout(() => d.remove(), 950);
  }

  setMode(m: 'items' | 'moves') {
    this.mode = m;
    this.hotbarDirty = true;
  }

  private renderHotbar() {
    const eq = this.player.equip;
    // Hand frames.
    for (const k of ['main', 'off'] as const) {
      const it = eq.inSlot(k);
      const h = this.hands[k];
      h.classList.toggle('empty', !it);
      h.querySelector('.art')!.innerHTML = it ? `<img src="${wideIconFor(it.def.id)}" alt="">` : '';
      h.querySelector('.nm')!.textContent = it ? it.def.name : k === 'off' ? (eq.mainWeapon ? 'Empty' : '') : 'Unarmed';
      h.querySelector('.keyhint')!.textContent = k === 'main' ? 'LMB' : it?.def.kind === 'shield' ? 'RMB block · F parry' : it ? 'RMB' : '';
    }
    // Quick items or moveset.
    const moves = this.mode === 'moves';
    this.barTitle.innerHTML = `<span class="${moves ? '' : 'on'}">ITEMS</span><span class="${moves ? 'on' : ''}">MOVES</span><kbd>Tab</kbd>`;
    const list = moves ? eq.moves : eq.quick;
    this.slots.forEach((s, i) => {
      const uid = list[i];
      s.className = 'slot interactive' + (moves ? ' move' : '') + (i >= list.length ? ' hidden' : '');
      s.innerHTML = `<span class="key">${i + 1}</span><i class="cd"></i>`;
      s.title = '';
      const it = eq.get(uid);
      if (!it) return;
      s.innerHTML += `<img src="${iconFor(it.def.id)}" alt="">`;
      if (it.def.stack) s.innerHTML += `<span class="qty">${it.qty}</span>`;
      if (it.def.stats.manaCost) s.innerHTML += `<span class="cost">${it.def.stats.manaCost}</span>`;
      s.title = it.def.name;
      if (moves && uid === eq.activeSpell) s.classList.add('spell');
    });
  }


  private updateBar(b: BarEls, v: number, max: number, dt: number, widthPx: number) {
    const f = Math.max(0, v / max);
    b.root.style.width = `${Math.min(widthPx, window.innerWidth - 110)}px`;
    b.fill.style.transform = `scaleX(${f})`;
    // The pale trail lingers, then drains to show how much was just lost.
    if (f < b.last - 0.002) b.trailHold = 0.5;
    if (f > b.trailV) b.trailV = f;
    b.trailHold -= dt;
    if (b.trailHold <= 0) b.trailV = Math.max(f, b.trailV - dt * 0.6);
    b.trail.style.transform = `scaleX(${b.trailV})`;
    b.last = f;
    b.num.textContent = `${Math.ceil(v)} / ${max}`;
  }

  update(dt: number, lockTargetId: number | null) {
    const p = this.player;
    // Bar length grows with the stat's maximum, Souls-style.
    this.updateBar(this.bars.hp, p.hp, p.maxHp, dt, 120 + p.maxHp * 1.6);
    this.updateBar(this.bars.st, p.stamina, p.maxStamina, dt, 110 + p.maxStamina * 1.5);
    this.updateBar(this.bars.mp, p.mana, p.maxMana, dt, 100 + p.maxMana * 1.5);
    if (this.hotbarDirty) {
      this.hotbarDirty = false;
      this.renderHotbar();
    }

    // Lock-on reticle.
    const lock = p.lock;
    if (lock?.alive) {
      const s = this.project(lock.center);
      this.reticle.style.display = s.on ? 'block' : 'none';
      this.reticle.style.left = `${s.x}px`;
      this.reticle.style.top = `${s.y}px`;
    } else this.reticle.style.display = 'none';

    // Enemy health bars: shown for a while after damage, or while locked.
    const seen = new Set<number>();
    for (const t of targets) {
      seen.add(t.id);
      let h = this.ehp.get(t.id);
      if (!h) {
        const e = el('div', 'ehp', this.root);
        const b = el('b', '', e);
        const i = el('i', '', e);
        h = { e, i, b, shown: 0, trail: 1 };
        this.ehp.set(t.id, h);
      }
      const frac = Math.max(0, t.hp / t.maxHp);
      if (frac < h.trail - 0.001 && frac < 0.999) h.shown = 5;
      h.shown -= dt;
      h.trail = Math.max(frac, h.trail - dt * 0.5);
      const visible = t.alive && (h.shown > 0 || t.id === lockTargetId) && frac < 1.001;
      const s = this.project(t.center.clone().add(new THREE.Vector3(0, t.radius + 0.45, 0)));
      h.e.style.display = visible && s.on ? 'block' : 'none';
      if (visible && s.on) {
        h.e.style.left = `${s.x}px`;
        h.e.style.top = `${s.y}px`;
        h.i.style.width = `${frac * 100}%`;
        h.b.style.width = `${h.trail * 100}%`;
      }
    }
    for (const [id, h] of this.ehp) {
      if (!seen.has(id)) {
        h.e.remove();
        this.ehp.delete(id);
      }
    }

    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
  }
}
