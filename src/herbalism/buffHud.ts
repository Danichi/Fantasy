import './herbalism.css';
import { RECIPE, QUALITY_NAMES, fmtTime } from './recipes';
import type { BrewEffects } from './brewEffects';

// The brews on you, under the vitals (top right): one round badge per active
// brew family with a draining ring and the time left, the oils on your blade
// with their hits left, the tonic cooldown, and the toxicity gauge (green,
// amber past two thirds, pulsing red when you overdose).

const GLYPH: Record<string, string> = {
  tonic: 'M12 3c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11z',
  draught: 'M9 3h6M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3',
  elixir: 'M8 3h8M9 3v6L6 20h12L15 9V3M7.5 15h9',
  oil: 'M4 20l11-11M14 4l6 6M12 6l6 6M5 19l2-6 4 4z',
  bomb: 'M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM14 7l3-3M17 4l2 1',
};

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class BuffHud {
  private el: HTMLDivElement;
  private row: HTMLDivElement;
  private tox: HTMLDivElement;
  private t = 0;
  private last = '';

  constructor(private fx: BrewEffects) {
    this.el = document.createElement('div');
    this.el.className = 'hb-buffs';
    this.el.innerHTML = '<div class="hb-row"></div><div class="hb-tox" title="Toxicity: elixirs add it while they last, tonics leave a little that drains away. Past your limit you overdose."><i></i><b></b><span></span></div>';
    this.row = this.el.querySelector('.hb-row')!;
    this.tox = this.el.querySelector('.hb-tox')!;
    document.getElementById('ui')!.appendChild(this.el);
  }

  setVisible(v: boolean) {
    this.el.style.display = v ? '' : 'none';
  }

  /** Redraw a few times a second. */
  update(dt: number) {
    this.t += dt;
    if (this.t < 0.2) return;
    this.t = 0;
    const fx = this.fx;
    const badges: string[] = [];
    for (const [fam, b] of fx.buffs) {
      const r = RECIPE[b.recipe];
      if (!r) continue;
      const frac = Math.max(0, b.left / b.total);
      badges.push(this.badge(r.cat, r.color, frac, fmtTime(b.left), `${QUALITY_NAMES[b.q]} ${r.name}${fam === 'life' ? ' (death refused once)' : ''}`, fam === 'life'));
    }
    for (const o of fx.oils) {
      const r = RECIPE[o.recipe];
      if (r) badges.push(this.badge('oil', r.color, o.charges / o.max, `${o.charges}`, `${QUALITY_NAMES[o.q]} ${r.name} on your blade: ${o.charges} hits left`, false));
    }
    if (fx.tonicCd > 0 && fx.tonicCdMax > 0) badges.push(this.badge('tonic', 0x8a8a8a, fx.tonicCd / fx.tonicCdMax, `${Math.ceil(fx.tonicCd)}s`, 'Healing tonic cooldown', false, true));
    const tox = fx.toxicity, cap = fx.toxCap;
    const html = badges.join('');
    if (html !== this.last) {
      this.row.innerHTML = html;
      this.last = html;
    }
    const show = tox > 0.5;
    this.tox.style.display = show ? '' : 'none';
    if (show) {
      const f = Math.min(1.25, tox / cap);
      (this.tox.querySelector('i') as HTMLElement).style.width = `${Math.min(100, f * 80)}%`;
      (this.tox.querySelector('b') as HTMLElement).style.left = '80%';
      this.tox.querySelector('span')!.textContent = `TOXICITY ${Math.round(tox)}/${Math.round(cap)}${fx.overdosed ? ' · OVERDOSE' : ''}`;
      this.tox.classList.toggle('warn', f > 0.66);
      this.tox.classList.toggle('od', fx.overdosed);
    }
  }

  private badge(cat: string, color: number, frac: number, label: string, title: string, gold: boolean, dim = false) {
    const deg = Math.round(frac * 360);
    return `<div class="hb-b${gold ? ' gold' : ''}${dim ? ' dim' : ''}" title="${title.replace(/"/g, '&quot;')}" style="--c:${hex(color)};--a:${deg}deg"><svg viewBox="0 0 24 24"><path d="${GLYPH[cat] ?? GLYPH.draught}"/></svg><em>${label}</em></div>`;
  }
}
