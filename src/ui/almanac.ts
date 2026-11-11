import './almanac.css';
import { FESTIVALS, SEASONS, SEASON_DAYS, dateText, dayOfYear, seasonOf, dayOfSeason, type FestivalDef } from '../world/calendar';
import { BEARER_TITLES, BLESS, TELL_STEP, LIT_WARD } from '../world/lostLanterns';

// The Almanac (Journal, Almanac): the calendar, with the season, the moon and
// every festival of the year; and the Lost Lanterns, region by region.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface AlmanacSource {
  day(): number;
  hour(): number;
  moon(): string;
  upcoming(): { f: FestivalDef; day: number; in: number; open: boolean }[];
  lanterns: {
    sets(): { id: string; name: string; lit: number; total: number }[];
    litCount(): number;
    readonly spots: { length: number };
    title(): string;
    told: number;
    untold: number;
    blessings(): { hp: number; mana: number; stamina: number };
  };
}

const SEASON_ICON = ['❀', '☀', '❦', '❄'];

export class Almanac {
  open = false;
  onToggle?: (open: boolean) => void;
  readonly el: HTMLDivElement;
  private tab: 'calendar' | 'lanterns' = 'calendar';

  constructor(private src: AlmanacSource) {
    this.el = document.createElement('div');
    this.el.className = 'journal almanac interactive hidden';
    document.getElementById('ui')!.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) return this.toggle(false);
      const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab === 'calendar' || tab === 'lanterns') {
        this.tab = tab;
        this.render();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) {
        e.stopImmediatePropagation();
        this.toggle(false);
      }
    }, true);
  }

  toggle(open = !this.open) {
    if (open === this.open) return;
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.render();
    this.onToggle?.(open);
  }
  openTab(tab: 'calendar' | 'lanterns') {
    this.tab = tab;
    if (this.open) this.render();
    else this.toggle(true);
  }

  private calendar() {
    const s = this.src, day = s.day(), doy = dayOfYear(day), si = SEASONS.indexOf(seasonOf(day));
    const up = s.upcoming();
    // The year as four rows of eight days, festivals marked.
    const rows = SEASONS.map((name, i) => {
      const cells = Array.from({ length: SEASON_DAYS }, (_, k) => {
        const d = i * SEASON_DAYS + k + 1;
        const fs = FESTIVALS.filter((f) => f.days.includes(d));
        const tip = fs.map((f) => f.name).join(', ');
        return `<span class="al-day ${d === doy ? 'today' : ''} ${fs.length ? 'fest' : ''} ${d % SEASON_DAYS === 0 ? 'moon' : ''}" title="${esc(`${name} ${k + 1}${tip ? ': ' + tip : ''}${d % SEASON_DAYS === 0 ? ' (full moon)' : ''}`)}">${k + 1}${fs.length ? `<i>${fs.length > 1 ? '✺✺' : '✺'}</i>` : ''}</span>`;
      }).join('');
      return `<div class="al-season ${i === si ? 'now' : ''}"><b>${SEASON_ICON[i]} ${name}</b><div class="al-days">${cells}</div></div>`;
    }).join('');
    const list = up.map((u) => {
      const when = u.open ? `<em class="open">On now, until ${u.f.close}:00</em>` : u.in === 0 ? `<em>Today from ${u.f.open}:00</em>` : u.in === 1 ? `<em>Tomorrow, ${u.f.open}:00</em>` : `<em>In ${u.in} days · ${dateText(u.day)}</em>`;
      return `<div class="al-fest ${u.open ? 'open' : ''}"><div class="al-fest-top"><b>${esc(u.f.name)}</b>${when}</div><small>⌖ ${esc(u.f.where)}</small><p>${esc(u.f.blurb)}</p><p class="al-what">${esc(u.f.what)}</p></div>`;
    }).join('');
    return `<div class="al-today"><div><small>TODAY</small><b>${dateText(day)}</b><span>Day ${dayOfSeason(day)} of ${SEASON_DAYS} · ${esc(s.moon())}</span></div><p>A season is one turn of the moon, ending at the full moon. Four make a year.</p></div>
      <div class="al-cols"><div class="al-year">${rows}<p class="al-key"><span class="al-day fest">✺</span> a festival · <span class="al-day moon">8</span> the full moon (the Black Market)</p></div><div class="al-list"><h3>Festivals</h3>${list}</div></div>`;
  }

  private lanterns() {
    const L = this.src.lanterns;
    const sets = L.sets().sort((a, b) => (a.id === 'elderGlen' ? -1 : b.id === 'elderGlen' ? 1 : a.id === 'dark' ? 1 : b.id === 'dark' ? -1 : b.lit / b.total - a.lit / a.total || a.name.localeCompare(b.name)));
    const lit = L.litCount(), total = L.spots.length, b = L.blessings();
    const next = BEARER_TITLES.find(([n]) => n > L.told);
    const rows = sets.map((s) => {
      const done = s.lit >= s.total;
      return `<div class="al-set ${done ? 'done' : ''} ${s.id === 'dark' ? 'dark' : ''}"><div class="al-set-top"><b>${esc(s.name)}</b><span>${s.lit} / ${s.total}${done ? ' · lit' : ''}</span></div><div class="al-bar"><i style="width:${(s.lit / s.total) * 100}%"></i></div></div>`;
    }).join('');
    return `<div class="al-today"><div><small>LANTERNBEARER</small><b>${esc(L.title())}</b><span>${lit} of ${total} relit · ${L.told} told at the Temple${L.untold ? ` · <em>${L.untold} not yet told</em>` : ''}</span></div>
      <p>Tell Brother Aldous (the Chapel of the Dawn) or the High Priestess (the capital) of the lanterns you relight. Every ${TELL_STEP}: +${BLESS.hp} health, +${BLESS.mana} mana, +${BLESS.stamina} stamina. So far: +${b.hp} / +${b.mana} / +${b.stamina}.${next ? ` Next title at ${next[0]}: ${esc(next[1])}.` : ''}</p></div>
      <div class="al-sets">${rows}</div>
      <p class="al-key">Light every lantern of a region and its foes hit you ${Math.round(LIT_WARD * 100)}% more softly there by night. An unlit lantern chimes and glimmers when you come near; some sit on stone stacks and pillars you must climb, jump or grapple to.</p>`;
  }

  private render() {
    const body = this.tab === 'calendar' ? this.calendar() : this.lanterns();
    this.el.innerHTML = `<header><span>ALMANAC</span><button data-close>✕</button></header>
      <div class="rep-tabs al-tabs"><button data-tab="calendar" class="${this.tab === 'calendar' ? 'on' : ''}">Calendar</button><button data-tab="lanterns" class="${this.tab === 'lanterns' ? 'on' : ''}">Lost Lanterns</button></div>
      <div class="al-body">${body}</div>`;
  }
}
