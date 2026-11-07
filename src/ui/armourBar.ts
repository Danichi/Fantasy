import './armourBar.css';
import type { Player } from '../player/player';
import { sfx } from '../audio/sfx';

// The armour layer on the health bar: a grey plate laid over the red. It
// covers as much of the red as your armour pool is full, from the left, so
// each blow that wears it peels the plate back and shows more red beneath;
// once it is gone the red itself starts to drain. A white chip shows what the
// last blow took, a shield badge on the right counts what is left, and when
// it breaks the plate shatters with a crack.

const SHIELD = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3 2.7 3.2v4c0 3.3 2.2 5.8 5.3 7.4 3.1-1.6 5.3-4.1 5.3-7.4v-4z" fill="currentColor" stroke="rgba(0,0,0,.6)" stroke-width=".9"/><path d="M8 3v10.6" stroke="rgba(0,0,0,.35)" stroke-width=".8"/></svg>';
const CRACKED = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3 2.7 3.2v4c0 3.3 2.2 5.8 5.3 7.4 3.1-1.6 5.3-4.1 5.3-7.4v-4z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8.6 2.4 6.9 6.2l2.2 1.6-1.7 4.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';

const div = (cls: string, parent: HTMLElement) => {
  const e = document.createElement('div');
  e.className = cls;
  parent.appendChild(e);
  return e;
};

export class ArmourBar {
  private plate: HTMLDivElement;
  private chip: HTMLDivElement;
  private badge: HTMLDivElement;
  private icon: HTMLSpanElement;
  private val: HTMLSpanElement;
  /** what is drawn now (fractions of the bar), so the DOM is only written on change */
  private drawn = { plate: -1, chip: -1, text: '', broken: false, none: true };
  private last = -1;
  private chipV = 0;
  private chipHold = 0;

  constructor(private bar: HTMLElement, private player: Player) {
    bar.classList.add('has-armour');
    this.chip = div('arm-chip', bar);
    this.plate = div('arm-plate', bar);
    this.badge = div('arm-badge', bar);
    this.icon = document.createElement('span');
    this.icon.className = 'arm-ico';
    this.val = document.createElement('span');
    this.val.className = 'arm-val';
    this.badge.append(this.icon, this.val);
  }

  update(dt: number) {
    const p = this.player;
    const max = p.maxArmour;
    const a = Math.max(0, Math.min(max, p.armour));
    const hpF = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
    const w = max > 0 ? hpF * (a / max) : 0;
    if (this.last < 0) this.last = a;
    // A blow wore it: flash, and hold the chip of what it took a moment.
    if (a < this.last - 0.05) {
      this.chipHold = 0.45;
      this.plate.animate?.([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 240, easing: 'ease-out' });
      if (a <= 0 && this.last > 0 && max > 0) this.shatter();
    }
    if (w > this.chipV) this.chipV = w;
    this.chipHold -= dt;
    if (this.chipHold <= 0) this.chipV = Math.max(w, this.chipV - dt * 0.7);
    this.last = a;

    if (Math.abs(w - this.drawn.plate) > 0.0005) {
      this.drawn.plate = w;
      this.plate.style.clipPath = `inset(0 ${((1 - w) * 100).toFixed(2)}% 0 0)`;
    }
    if (Math.abs(this.chipV - this.drawn.chip) > 0.0005) {
      this.drawn.chip = this.chipV;
      this.chip.style.clipPath = `inset(0 ${((1 - this.chipV) * 100).toFixed(2)}% 0 0)`;
    }
    const none = max <= 0;
    if (none !== this.drawn.none) {
      this.drawn.none = none;
      this.badge.style.display = none ? 'none' : '';
    }
    const broken = !none && a <= 0;
    if (broken !== this.drawn.broken) {
      this.drawn.broken = broken;
      this.badge.classList.toggle('broken', broken);
      this.icon.innerHTML = broken ? CRACKED : SHIELD;
    }
    const text = none ? '' : `${Math.ceil(a)}`;
    if (text !== this.drawn.text) {
      this.drawn.text = text;
      this.val.textContent = text;
      if (!this.icon.innerHTML) this.icon.innerHTML = SHIELD;
    }
  }

  /** The plate gives way: shards fly off where it was, and it cracks. */
  private shatter() {
    const x = Math.max(0.04, this.chipV) * this.bar.clientWidth;
    for (let i = 0; i < 9; i++) {
      const s = div('arm-shard', this.bar);
      s.style.left = `${x - 6 - Math.random() * 18}px`;
      const dx = 10 + Math.random() * 46, dy = (Math.random() - 0.35) * 38, rot = (Math.random() - 0.5) * 540;
      s.animate(
        [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 }],
        { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.4,1)' },
      ).onfinish = () => s.remove();
    }
    this.bar.animate?.([{ boxShadow: '0 0 0 2px rgba(220,230,240,.95), 0 0 16px rgba(200,215,235,.8)' }, { boxShadow: '0 1px 6px rgba(0,0,0,.6)' }], { duration: 420, easing: 'ease-out' });
    try {
      sfx.clang('break', 0.4);
      sfx.breakCrash(0.28);
    } catch {
      /* no audio yet */
    }
  }
}
