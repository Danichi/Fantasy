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
  private xpFill!: HTMLElement;
  private lvEl!: HTMLElement;
  private goldEl!: HTMLElement;
  private xpVal!: HTMLElement;
  private xpBar!: HTMLElement;
  private promptEl: HTMLDivElement;
  private bossEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private levelEl: HTMLDivElement;
  private boss: { hp: number; maxHp: number; alive: boolean } | null = null;
  private bossTrail = 1;
  private questEl: HTMLDivElement;
  /** side quests shown under the main quest (set by the quest UI) */
  sideQuestHtml = '';
  onSlotDrop?: (mode: 'items' | 'moves', slot: number, ref: number | string) => void;
  /** class skills on the moves bar: how to draw one, and its live cooldown (0..1) */
  skillSlot?: (ref: string) => { svg: string; name: string; cost: string; cd: number; ready: boolean } | null;
  /** the active class's resource (Flow pips, Resolve bar) */
  resource?: () => { name: string; value: number; max: number; kind: 'pips' | 'bar'; color: string } | null;
  private resEl!: HTMLElement;

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
    const xpRow = el('div', 'xprow', vit);
    xpRow.innerHTML = '<span class="lv">LV 1</span><div class="xpbar" title="Unspent XP towards your active class\'s next level"><i></i></div><span class="xpv">0</span><span class="gold">0</span>';
    this.xpFill = xpRow.querySelector('.xpbar i')!;
    this.lvEl = xpRow.querySelector('.lv')!;
    this.goldEl = xpRow.querySelector('.gold')!;
    this.xpVal = xpRow.querySelector('.xpv')!;
    this.xpBar = xpRow.querySelector('.xpbar')!;
    this.resEl = el('div', 'resrow', vit);

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
        const move = e.dataTransfer?.getData('text/move');
        if (move) this.onSlotDrop?.(this.mode, i, move);
        else {
          const uid = Number(e.dataTransfer?.getData('text/uid'));
          if (uid) this.onSlotDrop?.(this.mode, i, uid);
        }
      });
      this.slots.push(s);
    }

    this.reticle = el('div', 'reticle', this.root);
    this.toastEl = el('div', 'toast', this.root);
    this.banner = el('div', 'banner', this.root);
    this.death = el('div', 'death', this.root, '<h1>YOU DIED</h1>');
    this.promptEl = el('div', 'prompt', this.root);
    this.bossEl = el('div', 'bossbar', this.root, '<span class="nm"></span><div class="bb"><b></b><i></i></div>');
    this.fadeEl = el('div', 'fade', this.root);
    this.levelEl = el('div', 'levelup', this.root);
    events.on('levelUp', ({ level }) => {
      this.levelEl.innerHTML = `LEVEL UP<small>You are now level ${level}. You have a new attribute point to spend (K).</small>`;
      this.levelEl.classList.remove('show');
      void this.levelEl.offsetWidth;
      this.levelEl.classList.add('show');
    });
    el('div', 'hint', this.root, '<b>I</b> inventory &nbsp;·&nbsp; <b>K</b> skills &nbsp;·&nbsp; <b>N</b> seamanship &nbsp;·&nbsp; <b>H</b> controls');
    this.questEl = el('div', 'quest-tracker', this.root);

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
    events.on('originAbility', ({ ability }) => this.showBanner(ability.toUpperCase()));
    events.on('playerRespawned', () => this.death.classList.remove('show'));
  }

  /** Interaction prompt ("E  Open chest"); null hides it. */
  prompt(label: string | null) {
    if (!label) {
      this.promptEl.classList.remove('show');
      return;
    }
    const html = `<kbd>E</kbd>${label}`;
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
    this.promptEl.classList.add('show');
  }

  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name = 'Grukk, the Orc Warlord') {
    if (t && !this.boss) this.bossTrail = t.hp / t.maxHp;
    this.boss = t;
    this.bossEl.classList.toggle('show', !!t);
    if (t) this.bossEl.querySelector('.nm')!.textContent = name;
  }

  /** Fade to black (true) or back (false); resolves when done. */
  fade(on: boolean, ms = 450) {
    this.fadeEl.style.transitionDuration = `${ms}ms`;
    this.fadeEl.classList.toggle('on', on);
    return new Promise<void>((r) => setTimeout(r, ms));
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

  private regionCardEl: HTMLDivElement | null = null;
  /** Big painted region title when the player enters a region (smaller on re-entry). */
  regionCard(name: string, subtitle: string, first: boolean) {
    if (!this.regionCardEl) {
      this.regionCardEl = document.createElement('div');
      this.regionCardEl.className = 'region-card';
      this.root.appendChild(this.regionCardEl);
    }
    const el = this.regionCardEl;
    el.innerHTML = `<div class="rc-name"></div><div class="rc-rule"></div><div class="rc-sub"></div>`;
    el.querySelector('.rc-name')!.textContent = name;
    el.querySelector('.rc-sub')!.textContent = subtitle;
    el.classList.toggle('quiet', !first);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
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
      const ref = list[i];
      s.className = 'slot interactive' + (moves ? ' move' : '') + (i >= list.length ? ' hidden' : '');
      s.innerHTML = `<span class="key">${i + 1}</span><i class="cd"></i>`;
      s.title = '';
      if (ref == null) return;
      if (typeof ref === 'string') {
        const sk = this.skillSlot?.(ref);
        if (!sk) return;
        s.classList.add('skill');
        s.innerHTML += `${sk.svg}<span class="cost">${sk.cost}</span>`;
        s.title = sk.name;
        return;
      }
      const it = eq.get(ref);
      if (!it) return;
      s.innerHTML += `<img src="${iconFor(it.def.id)}" alt="">`;
      if (it.def.stack) s.innerHTML += `<span class="qty">${it.qty}</span>`;
      if (it.def.stats.manaCost) s.innerHTML += `<span class="cost">${it.def.stats.manaCost}</span>`;
      s.title = it.def.name;
      if (moves && ref === eq.activeSpell) s.classList.add('spell');
    });
  }


  private updateBar(b: BarEls, v: number, max: number, dt: number, widthPx: number) {
    const f = Math.max(0, v / max);
    // Bars grow toward the middle of the screen but stop short of the compass
    // (in a dungeon they sit beside the map, so they have less room).
    const right = document.body.classList.contains('in-dungeon') ? 262 : 26;
    const room = Math.max(200, window.innerWidth / 2 - 285 - right);
    b.root.style.width = `${Math.min(widthPx, room)}px`;
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
    // Skill cooldowns sweep round their slots.
    if (this.mode === 'moves') {
      p.equip.moves.forEach((ref, i) => {
        if (typeof ref !== 'string') return;
        const sk = this.skillSlot?.(ref);
        const s = this.slots[i];
        const cd = s?.querySelector<HTMLElement>('.cd');
        if (!sk || !cd) return;
        cd.style.background = sk.cd > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${sk.cd * 360}deg, transparent 0)` : '';
        s.classList.toggle('dim', !sk.ready);
      });
    }
    const res = this.resource?.();
    if (!res) this.resEl.style.display = 'none';
    else {
      this.resEl.style.display = '';
      const key = `${res.name}|${res.kind}|${res.max}`;
      if (this.resEl.dataset.k !== key) {
        this.resEl.dataset.k = key;
        this.resEl.innerHTML = `<span class="rn">${res.name}</span>` + (res.kind === 'pips' ? Array.from({ length: res.max }, () => '<i class="pip"></i>').join('') : '<span class="rbar"><i></i></span>');
        this.resEl.style.setProperty('--rc', res.color);
      }
      if (res.kind === 'pips') this.resEl.querySelectorAll('.pip').forEach((e, i) => e.classList.toggle('on', i < Math.floor(res.value + 1e-6)));
      else (this.resEl.querySelector('.rbar i') as HTMLElement).style.transform = `scaleX(${res.value / res.max})`;
    }
    const pr = p.prog;
    // The tracked quest (the old "study the three schools" starter quest is gone:
    // classes are learned from mentors and levelled on the Skills screen).
    this.questEl.innerHTML = this.sideQuestHtml;
    // XP is spent, not auto-levelled: the bar fills towards the active class's next level.
    const need = p.paths.nextCost(p.paths.active);
    const ready = pr.xp >= need;
    this.xpFill.style.transform = `scaleX(${Math.min(1, pr.xp / need)})`;
    this.xpBar.classList.toggle('ready', ready);
    this.xpVal.textContent = `${pr.xp.toLocaleString()} XP`;
    this.lvEl.textContent = `LV ${pr.level}`;
    this.goldEl.textContent = `${pr.gold}`;
    if (this.boss) {
      const f = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.bossTrail = Math.max(f, this.bossTrail - dt * 0.35);
      (this.bossEl.querySelector('.bb i') as HTMLElement).style.transform = `scaleX(${f})`;
      (this.bossEl.querySelector('.bb b') as HTMLElement).style.transform = `scaleX(${this.bossTrail})`;
      if (!this.boss.alive) this.bossBar(null);
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
