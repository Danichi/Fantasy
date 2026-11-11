import './bestiary.css';
import { ITEMS } from '../items/itemDefs';
import { iconFor } from './icons';
import { dropTable } from '../items/catalog/sources';
import { Bestiary, ALL_ENTRIES, entry, stageOf, luckFor, REVEAL, STAGE_NAMES, MARKS, MARK_NAMES, MARK_DMG, markOf, nextMark, FAMILY_TIERS, WARDEN_RANKS, RANK_HP, RANK_STAMINA, RANK_GIFTS, familyCharm, type BeastEntry } from '../progression/bestiary';

// The Wardens' Bestiary page (L): a card for every foe you've killed (and a
// "?" card for the ones the Wardens know of that you haven't), and a page per
// foe that opens up as the kills mount: lore, then its common drops, then its
// rare ones and its own pool, then mastery. The hunter's edge (drop luck) is
// shown on every page.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A sigil for each family of foe (48×48, drawn in currentColor). */
const SIGIL: Record<string, string> = {
  beast: '<path d="M9 11l7 9h16l7-9 1 15-5 8-4 7h-14l-4-7-5-8z" /><circle cx="19" cy="27" r="2.3" class="eye"/><circle cx="29" cy="27" r="2.3" class="eye"/><path d="M21 35h6l-3 3z" class="eye"/>',
  orc: '<path d="M12 14q12-8 24 0l2 14q-2 12-14 14q-12-2-14-14z"/><path d="M16 33l2-7 2 7zM28 33l2-7 2 7z" class="eye"/><path d="M17 23h5M26 23h5" class="eye-s"/>',
  goblin: '<path d="M4 16l12 6q8-8 16 0l12-6-8 12q-2 13-12 14q-10-1-12-14z"/><circle cx="19" cy="27" r="2.6" class="eye"/><circle cx="29" cy="27" r="2.6" class="eye"/>',
  slime: '<path d="M8 38q-2-12 8-20q4-10 8-10t8 10q10 8 8 20z"/><circle cx="19" cy="27" r="3" class="eye"/><circle cx="29" cy="27" r="3" class="eye"/><path d="M20 34q4 3 8 0" class="eye-s"/>',
  undead: '<path d="M10 22q0-14 14-14t14 14q0 8-5 11v7h-18v-7q-5-3-5-11z"/><circle cx="18" cy="23" r="4" class="eye"/><circle cx="30" cy="23" r="4" class="eye"/><path d="M24 28l-2 4h4zM19 36v4M24 36v4M29 36v4" class="eye-s"/>',
  gloam: '<path d="M24 4q8 10 6 16q8-4 8 8q0 14-14 16q-14-2-14-16q0-9 7-12q-1 6 3 8q-2-12 4-20z"/><ellipse cx="24" cy="30" rx="7" ry="4" class="eye"/><circle cx="24" cy="30" r="2" class="pupil"/>',
  construct: '<path d="M10 14l14-8 14 8v16l-6 12h-16l-6-12z"/><path d="M14 22h20v5h-20z" class="eye"/><path d="M24 6v8M16 34h16" class="eye-s"/>',
  insect: '<ellipse cx="24" cy="28" rx="7" ry="9"/><circle cx="24" cy="16" r="5"/><path d="M17 24l-11-6M17 28l-12 2M17 32l-10 8M31 24l11-6M31 28l12 2M31 32l10 8" class="leg"/><circle cx="22" cy="15" r="1.4" class="eye"/><circle cx="26" cy="15" r="1.4" class="eye"/>',
  sea: '<path d="M6 24q8-12 22-10l10-6-2 9q6 3 6 7t-6 7l2 9-10-6q-14 2-22-10z"/><circle cx="16" cy="22" r="2.2" class="eye"/><path d="M24 18q3 6 0 12" class="eye-s"/>',
  wyrm: '<path d="M24 8l5 9 13-5-6 13 8 5-14 2-6 10-6-10-14-2 8-5-6-13 13 5z"/><circle cx="24" cy="22" r="3" class="eye"/>',
  bandit: '<path d="M10 40q0-16 6-24q8-10 16 0q6 8 6 24z"/><path d="M15 25q9-4 18 0v5q-9 3-18 0z" class="eye"/><circle cx="20" cy="27" r="1.6" class="pupil"/><circle cx="28" cy="27" r="1.6" class="pupil"/>',
};
const sigil = (fam: string, cls = '') => `<svg class="bx-sigil ${cls}" viewBox="0 0 48 48" aria-hidden="true">${SIGIL[fam] ?? SIGIL.beast}</svg>`;

const FAMILY_LABEL: Record<string, string> = {
  beast: 'Beasts', slime: 'Oozes', insect: 'Crawlers', orc: 'Orcs', goblin: 'Goblins', bandit: 'Outlaws & Soldiers',
  undead: 'The Dead', gloam: 'Things of the Dark', construct: 'Constructs', sea: 'Sea & Sand', wyrm: 'Wyrms',
};
const FAMILY_ORDER = ['beast', 'insect', 'slime', 'goblin', 'orc', 'bandit', 'undead', 'gloam', 'construct', 'sea', 'wyrm'];

export interface BestiaryUIHooks {
  /** do you own (or have you been given) this item */
  has(id: string): boolean;
}

export class BestiaryUI {
  open = false;
  onToggle?: (open: boolean) => void;
  readonly el: HTMLDivElement;
  private tab: 'creatures' | 'bosses' = 'creatures';
  private selected: string | null = null;
  private missingIcons = false;
  private iconTimer = 0;

  constructor(private book: Bestiary, private hooks: BestiaryUIHooks) {
    this.el = document.createElement('div');
    this.el.className = 'journal bestiary interactive hidden';
    document.getElementById('ui')!.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) return this.toggle(false);
      const tab = t.closest('[data-tab]') as HTMLElement | null;
      if (tab) {
        this.tab = tab.dataset.tab as BestiaryUI['tab'];
        this.selected = null;
        return this.render();
      }
      const pick = t.closest('[data-entry]') as HTMLElement | null;
      if (pick) {
        this.selected = pick.dataset.entry!;
        this.render();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) {
        e.stopImmediatePropagation();
        this.toggle(false);
      }
    }, true);
    book.onChange = () => {
      if (this.open) this.render();
    };
  }

  toggle(open = !this.open) {
    if (open === this.open) return;
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.render();
    this.onToggle?.(open);
  }

  /** Per frame while open: redraw once the item icons have been painted. */
  update(dt: number) {
    if (!this.open || !this.missingIcons) return;
    this.iconTimer += dt;
    if (this.iconTimer > 0.6) {
      this.iconTimer = 0;
      this.render();
    }
  }

  private list() {
    const seen = new Map(this.book.seen().map((s) => [s.e.id, s.kills] as const));
    const ids = new Set([...ALL_ENTRIES, ...seen.keys()]);
    const all = [...ids].map((id) => ({ e: entry(id), kills: seen.get(id) ?? 0 }));
    return all;
  }

  private render() {
    this.missingIcons = false;
    if (!this.book.unlocked) {
      this.el.innerHTML = `<header><span>BESTIARY</span><button data-close>✕</button></header>
        <div class="bx-locked">${sigil('beast', 'big')}<h2>The Wardens' Bestiary</h2>
        <p>The Glen Wardens keep a book of every beast they've put down: what it carried, and where to cut. Rook, their captain, might lend it to someone going up to the crypt with them.</p>
        <p class="bx-hint">Main quest: <b>Lights on the Hill</b> · find Rook and the Glen Wardens</p></div>`;
      return;
    }
    const all = this.list();
    const bosses = all.filter((x) => x.e.boss);
    const creatures = all.filter((x) => !x.e.boss);
    const pool = this.tab === 'bosses' ? bosses : creatures;
    const recorded = all.filter((x) => x.kills > 0).length;
    const kills = all.reduce((n, x) => n + x.kills, 0);
    if (!this.selected || !pool.some((x) => x.e.id === this.selected)) {
      this.selected = pool.filter((x) => x.kills > 0).sort((a, b) => b.kills - a.kills)[0]?.e.id ?? null;
    }

    const card = (x: { e: BeastEntry; kills: number }) => {
      const s = stageOf(x.kills, x.e.boss);
      if (!x.kills) return `<button class="bx-card unknown" disabled title="Not yet recorded">${sigil(x.e.family, 'dim')}<b>? ? ?</b><small>Unrecorded</small></button>`;
      const pips = [1, 2, 3, 4].map((i) => `<i class="${s >= i ? 'on' : ''}"></i>`).join('');
      const m = markOf(x.kills, x.e.boss);
      return `<button class="bx-card fam-${x.e.family} ${s >= 4 ? 'mastered' : ''} ${this.selected === x.e.id ? 'sel' : ''}" data-entry="${x.e.id}">
        ${sigil(x.e.family)}<b>${esc(x.e.name)}</b><small>${x.kills} slain</small><span class="bx-pips">${pips}</span>${m ? `<span class="bx-mark m${m}" title="${MARK_NAMES[m]}">${'★'.repeat(m)}</span>` : ''}</button>`;
    };
    let nav = '';
    if (this.tab === 'bosses') nav = `<div class="bx-grid">${pool.sort((a, b) => Number(!a.kills) - Number(!b.kills) || a.e.tier - b.e.tier).map(card).join('')}</div>`;
    else {
      for (const fam of FAMILY_ORDER) {
        const group = pool.filter((x) => x.e.family === fam).sort((a, b) => Number(!a.kills) - Number(!b.kills) || a.e.tier - b.e.tier);
        if (!group.length) continue;
        const got = group.filter((x) => x.kills).length;
        const fm = this.book.familyMark(fam), fd = this.book.familyDmg(fam);
        const famTip = FAMILY_TIERS.map((t) => `${t.name}: every one at ${MARK_NAMES[t.mark]} (+${Math.round(t.dmg * 100)}%)`).join(' · ');
        nav += `<div class="bx-fam"><span>${FAMILY_LABEL[fam] ?? fam}</span><em class="bx-fam-mark ${fd ? 'on' : ''}" title="${esc(famTip)}">${fd ? `${fm >= FAMILY_TIERS[1].mark ? 'Bane' : 'Known'} +${Math.round(fd * 100)}%` : `page: every one to ${MARK_NAMES[1]}`}</em><em>${got}/${group.length}</em></div><div class="bx-grid">${group.map(card).join('')}</div>`;
      }
    }
    const sel = this.selected ? all.find((x) => x.e.id === this.selected) : null;
    const detail = sel ? this.page(sel.e, sel.kills) : `<div class="bx-empty">${sigil(this.tab === 'bosses' ? 'wyrm' : 'beast', 'big dim')}<p>${this.tab === 'bosses' ? 'No great foe has fallen to you yet. Their pages fill in when they do.' : 'Nothing recorded yet. Every kind of foe you kill gets a page.'}</p></div>`;
    const bossKills = bosses.filter((x) => x.kills).length;
    const rank = this.book.rank(), pts = this.book.points();
    const nextR = WARDEN_RANKS[rank + 1];
    const gift = Object.entries(RANK_GIFTS).find(([r]) => Number(r) > rank);
    const rankTip = `Each rank: +${RANK_HP} health, +${RANK_STAMINA} stamina (now +${rank * RANK_HP} / +${rank * RANK_STAMINA}).${gift ? ` Rook sends a gift at ${WARDEN_RANKS[Number(gift[0])][1]}: ${ITEMS[gift[1]]?.name ?? ''}.` : ''}`;
    this.el.innerHTML = `<header><span>BESTIARY</span><div class="bx-count"><b>${recorded}</b> of ${all.length} recorded · <b>${kills}</b> slain</div>
      <div class="bx-rank" title="${esc(rankTip)}"><small>WARDEN'S RANK</small><b>${WARDEN_RANKS[rank][1]}</b><span>${pts} mark${pts === 1 ? '' : 's'}${nextR ? ` · ${nextR[0]} for ${nextR[1]}` : ' · the highest'}</span></div><button data-close>✕</button></header>
      <div class="bx-tabs"><button data-tab="creatures" class="${this.tab === 'creatures' ? 'on' : ''}">Creatures <em>${recorded - bossKills}/${creatures.length}</em></button><button data-tab="bosses" class="${this.tab === 'bosses' ? 'on' : ''}">Bosses <em>${bossKills}/${bosses.length}</em></button></div>
      <div class="bx-body"><nav>${nav}</nav><section>${detail}</section></div>
      <footer><span>Kill more of a kind to reveal its drops, sharpen your luck and earn hunt marks against it.</span><span>L · close</span></footer>`;
  }

  private chip(id: string, show: boolean, owned?: boolean) {
    const d = ITEMS[id];
    if (!d || !show) return `<span class="bx-item locked"><i class="bx-ic">?</i><span>Unknown</span></span>`;
    const icon = iconFor(id);
    if (!icon) this.missingIcons = true;
    return `<span class="bx-item r-${d.rarity} ${owned ? 'owned' : ''}" title="${esc(d.name)} · ${d.rarity}"><i class="bx-ic">${icon ? `<img src="${icon}" alt="">` : ''}</i><span>${esc(d.name)}</span>${owned ? '<b class="bx-tick">✔</b>' : ''}</span>`;
  }

  /** The hunt marks row: five stars, kills to the next, the damage they give. */
  private marks(e: BeastEntry, kills: number) {
    const r = e.boss ? MARKS.boss : MARKS.common;
    const m = markOf(kills, e.boss), nx = nextMark(kills, e.boss);
    const fam = e.boss ? '' : (() => {
      const fd = this.book.familyDmg(e.family);
      const charm = ITEMS[familyCharm(e.family)];
      return fd ? ` · family +${Math.round(fd * 100)}%` : charm ? ` · bring every ${FAMILY_LABEL[e.family]?.toLowerCase() ?? e.family} to ${MARK_NAMES[1]} for ${esc(charm.name)}` : '';
    })();
    return `<div class="bx-marks"><div class="bx-marks-top"><small>HUNT MARKS</small><b>${MARK_NAMES[m]}</b><span>+${Math.round((m * MARK_DMG + (e.boss ? 0 : this.book.familyDmg(e.family))) * 100)}% damage to it${fam}</span></div>
      <div class="bx-steps marks">${MARK_NAMES.slice(1).map((n, i) => `<span class="${m > i ? 'on' : ''}">${n}<em>${r[i]}</em></span>`).join('')}</div>
      <div class="bx-marks-next">${nx ? `${nx - kills} more for ${MARK_NAMES[m + 1]} (+${Math.round(MARK_DMG * 100)}% damage, +1 Warden mark)` : 'Every mark taken. Nothing left of this kind can surprise you.'}</div></div>`;
  }

  private page(e: BeastEntry, kills: number) {
    const s = stageOf(kills, e.boss);
    const r = e.boss ? REVEAL.boss : REVEAL.common;
    const next = r.find((n) => kills < n);
    const prev = [0, ...r].filter((n) => n <= kills).pop() ?? 0;
    const frac = next ? (kills - prev) / (next - prev) : 1;
    const luck = luckFor(kills, e.boss);
    const cap = luckFor(r[3], e.boss);
    const t = dropTable(e.id, e.tier);
    const cut = (l: string[], n: number) => [...new Set(l)].slice(0, n);
    const section = (title: string, need: number, ids: string[], note = '') => {
      if (!ids.length) return '';
      const open = s >= need;
      return `<div class="bx-drops ${open ? '' : 'sealed'}"><h4>${title}${open ? '' : `<em>reveals at ${r[need - 1]} kill${r[need - 1] > 1 ? 's' : ''}</em>`}</h4>${note ? `<p class="bx-note">${note}</p>` : ''}
        <div class="bx-items">${ids.map((id) => this.chip(id, open)).join('')}</div></div>`;
    };
    // The foe's own pool: what you've already taken shows from the first kill; the rest at "Known".
    const uniq = t.uniques;
    const owned = uniq.filter((id) => this.hooks.has(id));
    const uniqHtml = uniq.length
      ? `<div class="bx-drops signature ${s >= 3 ? '' : 'part'}"><h4>${e.boss ? 'Its hoard' : 'Rare finds'}<em>${owned.length}/${uniq.length} taken${e.boss ? ' · one piece drops per kill' : ''}</em></h4>
        <div class="bx-collect"><i style="width:${(owned.length / uniq.length) * 100}%"></i></div>
        <div class="bx-items">${uniq.map((id) => this.chip(id, s >= 3 || this.hooks.has(id), this.hooks.has(id))).join('')}</div></div>`
      : '';
    return `<div class="bx-page fam-${e.family}">
      <div class="bx-hero">
        <div class="bx-medal ${s >= 4 ? 'gold' : ''}">${sigil(e.family, 'big')}</div>
        <div class="bx-title">
          <div class="bx-kicker">${e.boss ? 'GREAT FOE' : (FAMILY_LABEL[e.family] ?? e.family).toUpperCase()} · TIER ${e.tier}</div>
          <h2>${esc(e.name)}</h2>
          <div class="bx-where">⌖ ${esc(e.region)}</div>
        </div>
        <div class="bx-tally"><b>${kills}</b><small>slain</small></div>
      </div>
      <div class="bx-stats">
        <div class="bx-stage"><div class="bx-stage-top"><b>${STAGE_NAMES[s]}</b><span>${next ? `${kills} / ${next} to ${STAGE_NAMES[s + 1]}` : 'Fully mastered'}</span></div>
          <div class="bx-bar"><i style="width:${Math.round(frac * 100)}%"></i></div>
          <div class="bx-steps">${STAGE_NAMES.slice(1).map((n, i) => `<span class="${s > i ? 'on' : ''}">${n}<em>${r[i]}</em></span>`).join('')}</div></div>
        <div class="bx-luck" title="Better odds on this foe's good drops"><small>HUNTER'S EDGE</small><b>+${Math.round(luck * 100)}%</b><span>drop luck · max +${Math.round(cap * 100)}%</span></div>
      </div>
      ${this.marks(e, kills)}
      <p class="bx-lore">${esc(e.lore)}</p>
      ${e.boss ? uniqHtml : ''}
      ${section('Common drops', 2, cut([...t.parts, ...t.supplies], 10), 'Parts and supplies it often leaves behind.')}
      ${section('Rare drops', 3, cut([...t.gear, ...t.trophies], 12), 'Gear it was carrying, and trophies of the hunt.')}
      ${e.boss ? '' : uniqHtml}
      ${s >= 4 ? `<div class="bx-mastery">✦ Mastered. The Wardens would ask <i>you</i> about this one now. Your edge against it is at its height.</div>` : ''}
    </div>`;
  }
}
