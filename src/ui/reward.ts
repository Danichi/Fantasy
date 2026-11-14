import './reward.css';
import type { Rarity } from '../items/itemDefs';
import { sfx } from '../audio/sfx';

// The "you got it" moment: when you gain a new weapon, a piece of good armour, a
// key item or a new discipline, the world holds still, a painted burst of the
// Dawn's light opens behind it, the thing rises into the middle of the screen,
// and its name goes up on a banner. Click, E, Space or Enter moves on (after a
// beat, so a held key doesn't skip it); it also moves on by itself. Several
// rewards at once queue up and play one after another.

export interface Reward {
  /** the small line above the name ("New weapon", "Key item", ...) */
  caption: string;
  name: string;
  /** one line under the name */
  sub?: string;
  /** an icon url (or a function that returns one, '' while it is still being painted) */
  icon?: string | (() => string);
  rarity?: Rarity | 'key' | 'class';
}

const ART = `${import.meta.env.BASE_URL}assets/art/reward/`;
const HOLD = 4.2; // seconds before it moves on by itself
const MIN = 0.9; // seconds before a key press can move it on

let active = 0;
/** a reward is up (the world holds still under it) */
export const rewardPlaying = () => active > 0;

export class RewardUI {
  private queue: Reward[] = [];
  private busy = false;
  /** called as a reward opens and after the last one closes (main takes and gives back input) */
  onOpen?: () => void;
  onClose?: () => void;
  /** while true (a film or a story scene is up, you are dead), rewards wait their turn */
  blocked?: () => boolean;

  show(r: Reward) {
    this.queue.push(r);
    if (!this.busy) this.next();
  }

  private next() {
    if (this.queue.length && this.blocked?.()) {
      // Hold off (without the world held) until the way is clear.
      if (this.busy) {
        this.busy = false;
        active = 0;
        this.onClose?.();
      }
      this.busy = true;
      setTimeout(() => {
        this.busy = false;
        this.next();
      }, 300);
      return;
    }
    const r = this.queue.shift();
    if (!r) {
      const was = active;
      this.busy = false;
      active = 0;
      if (was) this.onClose?.();
      return;
    }
    if (!this.busy || !active) this.onOpen?.();
    this.busy = true;
    active = 1;
    const rar = r.rarity ?? 'rare';
    const root = document.createElement('div');
    root.className = `reward r-${rar}`;
    root.innerHTML = `
      <div class="rw-dim"></div>
      <div class="rw-stage">
        <img class="rw-burst rw-b1" src="${ART}burst.webp" alt="">
        <img class="rw-burst rw-b2" src="${ART}burst.webp" alt="">
        <div class="rw-glow"></div>
        <div class="rw-item"><img alt=""></div>
        <div class="rw-sparks"></div>
      </div>
      <div class="rw-text">
        <small></small>
        <div class="rw-ribbon"><span></span></div>
        <p></p>
      </div>
      <div class="rw-next">Continue</div>`;
    root.querySelector('.rw-text small')!.textContent = r.caption;
    root.querySelector('.rw-ribbon span')!.textContent = r.name;
    if (r.name.length > 26) root.querySelector('.rw-ribbon')!.classList.add('longer');
    else if (r.name.length > 17) root.querySelector('.rw-ribbon')!.classList.add('long');
    const sub = root.querySelector('.rw-text p') as HTMLElement;
    sub.textContent = r.sub ?? '';
    sub.style.display = r.sub ? '' : 'none';
    const img = root.querySelector('.rw-item img') as HTMLImageElement;
    const iconUrl = () => (typeof r.icon === 'function' ? r.icon() : r.icon ?? '');
    let tries = 0;
    const setIcon = () => {
      const u = iconUrl();
      if (u) img.src = u;
      else if (tries++ < 20) setTimeout(setIcon, 150);
      else root.querySelector('.rw-item')!.classList.add('no-icon');
    };
    setIcon();
    // A ring of sparks that drift out from the middle.
    const sparks = root.querySelector('.rw-sparks')!;
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('i');
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d - 40}px`);
      s.style.setProperty('--dl', `${0.35 + Math.random() * 0.9}s`);
      s.style.setProperty('--sz', `${2 + Math.random() * 4}px`);
      sparks.appendChild(s);
    }
    (document.getElementById('ui') ?? document.body).appendChild(root);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('on')));
    sfx.itemGet(rar === 'legendary' || rar === 'epic' || rar === 'key' || rar === 'class');

    const t0 = performance.now();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('mousedown', onClick);
      clearTimeout(auto);
      root.classList.add('out');
      setTimeout(() => {
        root.remove();
        this.next();
      }, 450);
    };
    const ready = () => performance.now() - t0 > MIN * 1000;
    const onKey = (e: KeyboardEvent) => {
      if (!['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (ready()) close();
    };
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      if (ready()) close();
    };
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('mousedown', onClick);
    setTimeout(() => root.classList.add('ready'), MIN * 1000);
    const auto = setTimeout(close, HOLD * 1000);
  }
}

const GEAR = new Set(['sword', 'shield', 'armor', 'accessory', 'spear', 'greatsword', 'axe', 'mace', 'dagger', 'bow', 'crossbow', 'staff']);
const WEAPON = new Set(['sword', 'spear', 'greatsword', 'axe', 'mace', 'dagger', 'bow', 'crossbow', 'staff']);
const RANK: Record<Rarity, number> = { common: 0, fine: 1, rare: 2, epic: 3, legendary: 4 };

/** Whether gaining this item (for the first time) earns the full reward moment, and its caption. */
export function rewardCaption(def: { kind: string; rarity: Rarity; slot?: string }): string | null {
  if (def.kind === 'key') return 'Key item';
  if (def.kind === 'spell') return 'New spell';
  if (!GEAR.has(def.kind)) return null;
  // Weapons from fine up; armour and trinkets from rare up.
  if (RANK[def.rarity] < (WEAPON.has(def.kind) ? 1 : 2)) return null;
  const tier = def.rarity === 'legendary' ? 'Legendary ' : def.rarity === 'epic' ? 'Epic ' : '';
  if (WEAPON.has(def.kind)) return `${tier}weapon`.replace(/^./, (c) => c.toUpperCase());
  if (def.kind === 'shield') return `${tier}shield`.replace(/^./, (c) => c.toUpperCase());
  if (def.kind === 'armor') return `${tier}armour`.replace(/^./, (c) => c.toUpperCase());
  return `${tier}treasure`.replace(/^./, (c) => c.toUpperCase());
}
