import type { People } from '../social/people';
import { COMMUNITIES, MOOD_NAME, TIERS } from '../social/reputation';

// The People page of the book (P): where you stand with each town and
// faction, any bounty on your head, what people are saying, and everyone
// you've met with how they feel about you.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const BAR_MIN = -1000, BAR_MAX = 1000;

export class RepPanel {
  open = false;
  onToggle?: (open: boolean) => void;
  private el: HTMLDivElement;
  private tab: 'places' | 'people' | 'codex' = 'places';
  /** the main story's Powers & Champions page, and naming a champion's patron */
  codex?: () => string;
  onName?: (champion: string, power: string) => void;

  constructor(private people: People, private townName: (sid: string) => string) {
    this.el = document.createElement('div');
    this.el.className = 'journal reputation interactive hidden';
    document.getElementById('ui')!.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) this.toggle(false);
      const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab === 'places' || tab === 'people' || tab === 'codex') {
        this.tab = tab;
        this.render();
      }
      const nm = t.closest<HTMLElement>('[data-name]');
      if (nm) {
        this.onName?.(nm.dataset.name!, nm.dataset.power!);
        this.render();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && !e.repeat) {
        if ((document.activeElement as HTMLElement | null)?.tagName === 'INPUT') return;
        this.toggle(!this.open);
      } else if (e.code === 'Escape' && this.open) {
        e.stopImmediatePropagation();
        this.toggle(false);
      }
    }, true);
  }

  /** Open on a tab (the story opens the Powers & Champions page). */
  openTab(tab: 'places' | 'people' | 'codex') {
    this.tab = tab;
    if (this.open) this.render();
    else this.toggle(true);
  }

  toggle(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.render();
    this.onToggle?.(open);
  }

  private render() {
    const rep = this.people.rep;
    let body = '';
    if (this.tab === 'codex' && this.codex) {
      body = this.codex();
    } else if (this.tab === 'places') {
      const rows = Object.keys(COMMUNITIES).map((c) => {
        const s = rep.standingOf(c);
        const pct = ((s - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;
        const bounty = rep.bountyOf(c);
        const tier = rep.tierOf(c);
        return `<div class="rep-row"><div class="rep-name">${esc(COMMUNITIES[c].replace(/^the /, '').replace(/^./, (x) => x.toUpperCase()))}<span class="rep-tier tier-${tier}">${TIERS.find((t) => t.id === tier)!.name}</span>${bounty > 0 ? `<span class="rep-bounty">Bounty ${bounty}g</span>` : ''}</div><div class="rep-bar"><i style="width:${pct.toFixed(1)}%"></i><b style="left:50%"></b></div></div>`;
      }).join('');
      const said = rep.told.slice(0, 6).map((t) => `<li class="${t.good ? 'good' : 'bad'}">${esc(t.text.replace(/^./, (x) => x.toUpperCase()))}. <small>${esc(this.townName(t.community))}</small></li>`).join('');
      body = `<section class="rep-places">${rows}<h3>What people are saying</h3>${said ? `<ul class="rep-said">${said}</ul>` : '<p class="j-empty">Nothing yet. Give them something to talk about.</p>'}<p class="rep-help">Kind words, gifts, favours and finished quests raise your standing. Threats, insults and violence lower it. People who think well of you charge less, pay more and ask you for help; people who don't refuse to deal with you, and some will leave town.</p></section>`;
    } else {
      const met = Object.entries(rep.mem).filter(([, m]) => m.met > 0).map(([id]) => id);
      const list = met.map((id) => this.people.get(id)).filter((p) => !!p).sort((a, b) => rep.dispOf(b!.id) - rep.dispOf(a!.id));
      body = `<section class="rep-people">${list.length ? list.map((p) => {
        const mood = rep.moodOf(p!.id);
        const where = rep.dead.has(p!.id) ? 'Dead' : rep.gone.has(p!.id) ? 'Left town' : this.townName(p!.settlement);
        const m = rep.mem[p!.id];
        const notes = [m.confided ? 'told you a secret' : '', m.favours ? `${m.favours} favour${m.favours > 1 ? 's' : ''}` : '', m.gifts ? `${m.gifts} gift${m.gifts > 1 ? 's' : ''}` : '', m.insults ? `${m.insults} insult${m.insults > 1 ? 's' : ''}` : '', m.threats ? `${m.threats} threat${m.threats > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
        const likes = m.met >= 3 || m.gifts > 0 ? `Likes ${p!.likes.join(', ')}` : '';
        return `<div class="rep-person"><div><b>${esc(p!.name)}</b><small>${esc(this.people.titleOf(p!.id) || p!.job)} · ${esc(where)}</small></div><span class="mood mood-${rep.fears(p!.id) ? 'afraid' : mood}">${rep.fears(p!.id) ? 'Afraid' : MOOD_NAME[mood]}</span>${notes || likes ? `<p>${esc([notes, likes].filter(Boolean).join(' · '))}</p>` : ''}</div>`;
      }).join('') : '<p class="j-empty">You haven\'t really talked to anyone yet.</p>'}</section>`;
    }
    this.el.innerHTML = `<header><span>PEOPLE</span><button data-close>✕</button></header><div class="rep-tabs"><button data-tab="places" class="${this.tab === 'places' ? 'on' : ''}">Towns &amp; factions</button><button data-tab="people" class="${this.tab === 'people' ? 'on' : ''}">People you know</button>${this.codex ? `<button data-tab="codex" class="${this.tab === 'codex' ? 'on' : ''}">Powers &amp; Champions</button>` : ''}</div><div class="rep-body">${body}</div><footer>P · close</footer>`;
  }
}
