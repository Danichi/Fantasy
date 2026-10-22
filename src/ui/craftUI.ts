import { ITEMS, traitLines } from '../items/itemDefs';
import './craft.css';
import { iconFor } from './icons';
import { events } from '../core/events';
import { DISC } from '../paths/data';
import type { Player } from '../player/player';
import { Crafter } from '../crafting/crafter';
import { QUALITY_NAMES, qualityLine, RUNES } from '../crafting/quality';
import { GROUPS, STATION_NAMES, RUNE_ITEMS, type Recipe, type StationKind } from '../crafting/recipes';

// The craft page (docs/design/arms-and-crafting.md §5): a page of the same
// ledger the merchants use. Make (the station's recipes, what you have and
// lack, the quality you can expect), Salvage (break gear back into some of
// its materials), Inscribe (the runestone: cut a rune into a weapon or
// armour) and Experiment (try materials together to discover a recipe).
// Crafting runs a short timing step unless it's switched off: three hammer
// beats at the forge and bench, a stir at the alchemy table, taking a dish
// off the heat at the fire.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
type Tab = 'make' | 'salvage' | 'inscribe' | 'experiment';

/** The timing step's feel per kind: beats, sweeps a second, and the size of the sweet spot. */
const STEPS = {
  hammer: { beats: 3, speed: 1.05, zone: 0.17, verb: 'Strike', hint: 'Strike when the glow crosses the gold mark: three blows.' },
  stir: { beats: 1, speed: 0.7, zone: 0.12, verb: 'Pour', hint: 'Stir until the brew turns gold, then pour.' },
  heat: { beats: 1, speed: 0.8, zone: 0.13, verb: 'Take it off', hint: 'Take it off the heat while it is golden: not raw, not burnt.' },
} as const;

interface Timing {
  r: Recipe;
  kind: keyof typeof STEPS;
  t: number;
  hits: number;
  beats: number;
  marks: boolean[];
  raf: number;
  last: number;
}

export class CraftUI {
  open = false;
  onToggle?: (open: boolean) => void;
  readonly crafter: Crafter;
  private el: HTMLDivElement;
  private station: StationKind = 'forge';
  private where = '';
  private bonus = 0;
  private tab: Tab = 'make';
  private note = '';
  private noteBad = false;
  private pickedRune: string | null = null;
  private tried = new Set<string>();
  private timing: Timing | null = null;

  constructor(private player: Player, crafter?: Crafter) {
    this.crafter = crafter ?? new Crafter(player);
    this.el = document.createElement('div');
    this.el.className = 'shop2 craft interactive hidden';
    document.getElementById('ui')!.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act!;
      if (act === 'close') return this.close();
      if (act === 'tab') {
        this.tab = t.dataset.tab as Tab;
        this.note = '';
        return this.render(true);
      }
      if (act === 'craft') return this.begin(t.dataset.id!);
      if (act === 'strike') return this.strike();
      if (act === 'skip') return this.finish(true);
      if (act === 'quick') {
        this.crafter.quick = !this.crafter.quick;
        events.emit('progressChanged', {});
        return this.render(false);
      }
      if (act === 'salvage') return this.salvage(Number(t.dataset.uid));
      if (act === 'rune') {
        this.pickedRune = t.dataset.id!;
        return this.render(false);
      }
      if (act === 'inscribe') return this.inscribe(Number(t.dataset.uid));
      if (act === 'try-pick') {
        const id = t.dataset.id!;
        if (this.tried.has(id)) this.tried.delete(id);
        else if (this.tried.size < 3) this.tried.add(id);
        return this.render(false);
      }
      if (act === 'try') return this.experiment();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (this.timing && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.strike();
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.stopImmediatePropagation();
        if (this.timing) this.finish(true);
        else this.close();
      }
    }, true);
    events.on('equipmentChanged', () => this.refresh());
  }

  /** Open at a station. `bonus` is the station's quality bonus (a master's forge: +0.5). */
  show(station: StationKind, where: string, bonus = 0) {
    this.station = station;
    this.where = where;
    this.bonus = bonus;
    this.tab = 'make';
    this.note = '';
    this.pickedRune = null;
    this.tried.clear();
    this.open = true;
    this.el.classList.remove('hidden');
    this.render(true);
    this.onToggle?.(true);
  }

  close() {
    if (!this.open) return;
    this.stopTiming();
    this.open = false;
    this.el.classList.add('hidden');
    this.onToggle?.(false);
  }

  refresh() {
    if (this.open && !this.timing) this.render(false);
  }

  private say(text: string, bad = false) {
    this.note = text;
    this.noteBad = bad;
  }

  // ---- making --------------------------------------------------------------------------------------
  private begin(id: string) {
    const r = this.crafter.at(this.station).find((x) => x.id === id);
    if (!r) return;
    const s = this.crafter.status(r);
    if (s !== 'ok') {
      const why = this.crafter.craft(r, 0, this.bonus);
      this.say(typeof why === 'string' ? why : '', true);
      return this.render(false);
    }
    if (r.step === 'none' || this.crafter.quick) return this.make(r, 3);
    const kind = r.step as keyof typeof STEPS;
    this.timing = { r, kind, t: 0, hits: 0, beats: 0, marks: [], raf: 0, last: performance.now() };
    this.renderTiming();
    const loop = (now: number) => {
      const tm = this.timing;
      if (!tm) return;
      tm.t += Math.min(0.05, (now - tm.last) / 1000);
      tm.last = now;
      const mark = this.el.querySelector('.ct-mark') as HTMLElement | null;
      if (mark) mark.style.left = `${this.markAt(tm) * 100}%`;
      const brew = this.el.querySelector('.ct-brew') as HTMLElement | null;
      if (brew) brew.style.background = this.brewColour(this.markAt(tm));
      tm.raf = requestAnimationFrame(loop);
    };
    this.timing.raf = requestAnimationFrame(loop);
  }

  /** Where the sweep is (0..1): a ping-pong for the hammer, a slow climb for the pot and the pan. */
  private markAt(tm: Timing) {
    const s = STEPS[tm.kind];
    const u = (tm.t * s.speed) % 2;
    return tm.kind === 'hammer' ? (u < 1 ? u : 2 - u) : Math.min(1, tm.t * s.speed * 0.5);
  }
  private brewColour(u: number) {
    // raw green → gold (the moment) → burnt brown
    const stops = [[96, 150, 90], [222, 186, 72], [110, 62, 34]];
    const k = u < 0.5 ? u / 0.5 : (u - 0.5) / 0.5;
    const [a, b] = u < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  }

  private strike() {
    const tm = this.timing;
    if (!tm) return;
    const s = STEPS[tm.kind];
    const off = Math.abs(this.markAt(tm) - 0.5);
    const good = off <= s.zone / 2;
    tm.marks.push(good);
    tm.beats++;
    if (s.beats === 1) {
      // One press stands for all three beats: in the gold is perfect, near it is decent.
      tm.hits = good ? 3 : off <= s.zone ? 2 : 0;
      return this.finish(false);
    }
    if (good) tm.hits++;
    if (tm.beats >= s.beats) return this.finish(false);
    this.renderTiming();
  }

  private finish(skipped: boolean) {
    const tm = this.timing;
    if (!tm) return;
    this.stopTiming();
    // Skipping counts as good timing, a notch below perfect (as when the step is switched off).
    this.make(tm.r, skipped ? 2 : tm.hits);
  }

  private stopTiming() {
    if (this.timing) cancelAnimationFrame(this.timing.raf);
    this.timing = null;
  }

  private make(r: Recipe, notches: number) {
    const res = this.crafter.craft(r, notches, this.bonus);
    if (typeof res === 'string') this.say(res, true);
    else {
      const name = ITEMS[r.out].name;
      const q = res.q !== undefined ? `${QUALITY_NAMES[res.q]} ` : '';
      this.say(`Made: ${res.n > 1 ? `${res.n} × ` : ''}${q}${name}${r.quality ? ` · ${notches}/3 good ${r.step === 'hammer' ? 'blows' : 'timing'}` : ''}.`);
    }
    this.render(false);
  }

  // ---- salvage, runes, experiments ------------------------------------------------------------------
  private salvage(uid: number) {
    const it = this.player.equip.get(uid);
    const back = this.crafter.salvage(uid);
    if (!back || !it) return;
    this.say(`Salvaged the ${it.def.name}: ${back.map((b) => `${b.n} × ${ITEMS[b.id].name}`).join(', ')}.`);
    this.render(false);
  }

  private inscribe(uid: number) {
    const rune = this.pickedRune;
    if (!rune) return;
    const made = this.crafter.inscribe(uid, rune);
    if (!made) this.say('That rune won’t take on that.', true);
    else this.say(`Inscribed: ${made.def.name}.`);
    if (this.crafter.count(rune) < 1) this.pickedRune = null;
    this.render(false);
  }

  private experiment() {
    if (!this.tried.size) return;
    const res = this.crafter.discover(this.station, [...this.tried]);
    if (res.ok) {
      this.say(`Discovered: ${ITEMS[res.recipe.out].name}! It's in your recipes now.`);
      this.tried.clear();
      this.tab = 'make';
    } else this.say(res.why, true);
    this.render(true);
  }

  // ---- drawing -------------------------------------------------------------------------------------
  private ing(id: string, n: number) {
    const have = this.crafter.count(id);
    const name = GROUPS[id]?.name ?? ITEMS[id]?.name ?? id;
    const icon = GROUPS[id] ? iconFor(GROUPS[id].ids[0]) : iconFor(id);
    return `<span class="ci ${have >= n ? 'ok' : 'short'}" title="${esc(name)}">${icon ? `<img src="${icon}" alt="">` : ''}<b>${n}</b> ${esc(name)} <i>${have}/${n}</i></span>`;
  }

  private howToLearn(r: Recipe) {
    if (r.calling && !this.player.paths.learned(r.calling)) return `Learn ${DISC[r.calling].name} from ${DISC[r.calling].mentor}.`;
    if (r.learn === 'node') return `Learn “${r.node ?? ITEMS[r.out].name}” in the ${DISC[r.calling!].name} tree (Skills, K).`;
    if (r.learn.startsWith('book:')) return `Taught by a book: ${ITEMS[r.learn.slice(5)]?.name ?? 'a recipe book'}.`;
    return '';
  }

  private recipeCard(r: Recipe) {
    const def = ITEMS[r.out];
    const s = this.crafter.status(r);
    const icon = iconFor(r.out);
    const calling = r.calling ? DISC[r.calling] : null;
    const lvl = calling ? `${calling.name} ${r.level}` : 'anyone';
    let right = '';
    if (s === 'ok') right = `<button data-act="craft" data-id="${r.id}">${r.step === 'none' || this.crafter.quick ? 'Make' : 'Craft'}</button>`;
    else if (s === 'level') right = `<span class="cr-need">Needs ${esc(lvl)}</span>`;
    else right = `<button data-act="craft" data-id="${r.id}" class="poor">Craft</button>`;
    let q = '';
    if (r.quality && s !== 'unknown') {
      const lo = this.crafter.preview(r, 0, this.bonus)!, hi = this.crafter.preview(r, 3, this.bonus)!;
      q = `<div class="cr-q">${lo === hi ? esc(qualityLine(hi)) : `${esc(QUALITY_NAMES[lo])} to <b>${esc(QUALITY_NAMES[hi])}</b> with good timing`}</div>`;
    }
    return `<div class="sc cr r-${def.rarity} ${s === 'ok' ? '' : 'cr-' + s}">
      <div class="sc-ic">${icon ? `<img src="${icon}" alt="">` : ''}</div>
      <div class="sc-main">
        <div class="sc-head"><div class="sc-name">${r.n && r.n > 1 ? `${r.n} × ` : ''}${esc(def.name)}</div><span class="sc-tag">${esc(lvl)}</span></div>
        <div class="cr-ings">${r.inputs.map((i) => this.ing(i.id, i.n)).join('')}</div>
        ${q}
        ${traitLines(def.stats).slice(0, 2).map((t) => `<div class="sc-trait">✦ ${esc(t)}</div>`).join('')}
        <div class="sc-desc">${esc(def.desc)}</div>
      </div>
      <div class="sc-buy">${right}</div>
    </div>`;
  }

  private renderTiming() {
    const tm = this.timing!;
    const s = STEPS[tm.kind];
    const def = ITEMS[tm.r.out];
    const pips = Array.from({ length: s.beats }, (_, i) => `<i class="${i < tm.marks.length ? (tm.marks[i] ? 'hit' : 'miss') : ''}"></i>`).join('');
    this.el.querySelector('.sc-list')!.innerHTML = `
      <div class="ct ct-${tm.kind}">
        <div class="ct-title">${esc(def.name)}</div>
        <div class="ct-hint">${esc(s.hint)}</div>
        <div class="ct-bar" data-act="strike">${tm.kind === 'hammer' ? '' : '<div class="ct-brew"></div>'}<div class="ct-zone" style="width:${s.zone * 100}%"></div><div class="ct-mark"></div></div>
        ${s.beats > 1 ? `<div class="ct-pips">${pips}</div>` : ''}
        <div class="ct-btns"><button data-act="strike">${s.verb} <small>Space</small></button><button data-act="skip" class="alt">Skip <small>good timing, one notch lower</small></button></div>
      </div>`;
  }

  private render(top: boolean) {
    if (this.timing) return this.renderTiming();
    const scroll = top ? 0 : this.el.querySelector('.sc-list')?.scrollTop ?? 0;
    const c = this.crafter, eq = this.player.equip;
    const callingId = Crafter.callingOf(this.station);
    const calling = callingId ? DISC[callingId] : null;
    const lv = callingId ? this.player.paths.level(callingId) : 0;
    let body = '';
    if (this.tab === 'make') {
      const all = c.at(this.station);
      const known = all.filter((r) => c.knows(r));
      const order = (r: Recipe) => ({ ok: 0, missing: 1, level: 2, unknown: 3 })[c.status(r)];
      known.sort((a, b) => order(a) - order(b) || a.level - b.level);
      body = known.length ? known.map((r) => this.recipeCard(r)).join('') : '<p class="sc-empty">You don’t know anything you can make here yet.</p>';
      const later = all.filter((r) => !c.knows(r) && r.learn !== 'discover');
      if (later.length) {
        body += `<div class="sc-locked-h">Not learned yet</div>` + later.map((r) => `<div class="sc-locked r-${ITEMS[r.out].rarity}"><b>${esc(ITEMS[r.out].name)}</b><span>${esc(this.howToLearn(r))}</span></div>`).join('');
      }
    } else if (this.tab === 'salvage') {
      const list = eq.items.filter((it) => c.canSalvage(it));
      body = list.length
        ? list.map((it) => {
          const back = c.salvageYield(it)!;
          const icon = iconFor(it.def.id);
          return `<div class="sc r-${it.def.rarity}"><div class="sc-ic">${icon ? `<img src="${icon}" alt="">` : ''}</div><div class="sc-main"><div class="sc-head"><div class="sc-name">${esc(it.def.name)}</div>${it.qty > 1 ? `<span class="sc-tag">×${it.qty}</span>` : ''}</div><div class="cr-ings">${back.map((b) => `<span class="ci ok"><b>${b.n}</b> ${esc(ITEMS[b.id].name)}</span>`).join('')}</div><div class="sc-desc">Breaks it down into about half of what it took to make.</div></div><div class="sc-buy"><button data-act="salvage" data-uid="${it.uid}">Salvage</button></div></div>`;
        }).join('')
        : '<p class="sc-empty">Nothing to salvage. (Gear you wear, and things no one could make, stay whole.)</p>';
    } else if (this.tab === 'inscribe') {
      const runes = Object.keys(RUNE_ITEMS).filter((id) => c.count(id) > 0);
      const chips = runes.map((id) => `<button data-act="rune" data-id="${id}" class="${this.pickedRune === id ? 'on' : ''}">${esc(ITEMS[id].name)} ×${c.count(id)}</button>`).join('');
      body = runes.length ? `<div class="sc-chips">${chips}</div>` : '<p class="sc-empty">You carry no runes. Cut one on the Make page first.</p>';
      if (this.pickedRune) {
        const fit = eq.items.filter((it) => c.fits(this.pickedRune!, it));
        const rune = RUNES[RUNE_ITEMS[this.pickedRune]];
        body += `<p class="cr-rune">${esc(rune.line)}.${fit.length ? '' : ' Nothing you carry will take it.'}</p>` + fit.map((it) => {
          const icon = iconFor(it.def.id);
          const now = it.rune ? `Already carries ${RUNES[it.rune].name}; this replaces it.` : 'No rune yet.';
          return `<div class="sc r-${it.def.rarity}"><div class="sc-ic">${icon ? `<img src="${icon}" alt="">` : ''}</div><div class="sc-main"><div class="sc-head"><div class="sc-name">${esc(it.def.name)}</div>${eq.slotOf(it.uid) ? '<span class="sc-tag">equipped</span>' : ''}</div><div class="sc-desc">${esc(now)}</div></div><div class="sc-buy"><button data-act="inscribe" data-uid="${it.uid}">Inscribe</button></div></div>`;
        }).join('');
      }
    } else {
      const seen = new Set<string>();
      const mats = eq.items.filter((it) => (it.def.kind === 'material' || it.def.kind === 'consumable' || it.def.kind === 'ammo') && !seen.has(it.def.id) && seen.add(it.def.id));
      body = `<p class="cr-rune">Pick up to three things you carry and try them together. The right set teaches a recipe; the wrong one costs nothing.</p>
        <div class="sc-chips">${mats.map((it) => `<button data-act="try-pick" data-id="${it.def.id}" class="${this.tried.has(it.def.id) ? 'on' : ''}">${esc(it.def.name)}</button>`).join('')}</div>
        <div class="ct-btns"><button data-act="try" class="${this.tried.size ? '' : 'poor'}">Try them together</button></div>`;
    }
    const tab = (t: Tab, label: string) => `<button data-act="tab" data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${label}</button>`;
    const tabs = tab('make', 'Make') + tab('salvage', 'Salvage') + (this.station === 'runestone' ? tab('inscribe', 'Inscribe') : '') + tab('experiment', 'Experiment');
    const sub = calling ? (this.player.paths.learned(calling.id) ? `${calling.name} level ${lv}` : `${calling.name} not learned`) : '';
    this.el.innerHTML = `
      <header><div><b>${esc(STATION_NAMES[this.station])}</b><small>${esc(this.where)}${sub ? ` · ${esc(sub)}` : ''}${this.bonus ? ' · a master’s station: better quality' : ''}</small></div><button data-act="close" title="Leave (E or Esc)">✕</button></header>
      <nav>${tabs}<span class="sc-note ${this.noteBad ? 'bad' : ''}">${esc(this.note)}</span></nav>
      <div class="sc-list">${body}</div>
      <footer><span>E / Esc · step away</span><span><button data-act="quick" class="cr-quick">Timing step: <b>${this.crafter.quick ? 'off' : 'on'}</b></button></span></footer>`;
    const list = this.el.querySelector('.sc-list');
    if (list) list.scrollTop = scroll;
  }
}
