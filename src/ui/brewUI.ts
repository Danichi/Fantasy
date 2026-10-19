import './brewUI.css';
import { iconFor } from './icons';
import { events } from '../core/events';
import { REAGENTS, type Prop } from '../items/reagents';
import { BOOKS, RECIPES, CAT_NAME, BASE_NAME, BASE_ITEM, QUALITY_NAMES, TIER_LEVEL, describeFx, type BaseId, type BrewCat, type RecipeDef } from '../herbalism/recipes';
import { quality, practiceNeed, type Stir } from '../herbalism/alchemy';
import type { Herbalism, BrewMode, BrewOutcome } from '../herbalism/herbalism';
import { ITEMS } from '../items/itemDefs';

// The herbal: a parchment book with three pages.
//  Brew     the bench (at an alchemy table or from the satchel): pick a known
//           recipe and the bench fills the pot from your pouch, or put in any
//           two to four reagents and experiment; choose the base; then stir
//           until the colour turns and pour (a short, skippable timing step).
//  Recipes  every brew, known ones in full; unknown ones say where to learn them.
//  Herbs    every reagent: tier, where it grows, what you've identified, and a
//           taste to learn a hidden property.

type Tab = 'brew' | 'recipes' | 'herbs';
type Mode = BrewMode | 'codex';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const CATS: BrewCat[] = ['tonic', 'draught', 'elixir', 'oil', 'bomb'];
const PROP_COLOR: Record<Prop, string> = {
  heal: '#c8463a', mana: '#3f6fd0', stamina: '#4f9a4a', strength: '#9a3a1a', ward: '#7a6a4a', speed: '#2a9a8a', fire: '#d8641a', frost: '#3a9ad0',
  poison: '#6a8a1a', cure: '#b8a03a', stealth: '#5a4a7a', vision: '#8aa02a', lifesteal: '#8a1a3a', arcane: '#7a4ab0', binder: '#7a6a5a', potency: '#c08a1a',
};
const Q_COLOR = ['', '#7a6a5a', '#4a4a3a', '#2a6a3a', '#2a4a8a', '#8a4a10'];

/** Mix two colours (0..1). */
function lerpColor(a: number, b: number, t: number) {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

interface StirState { p: number; t: number; held: boolean; color: number; fail: boolean; bubbles: number }

export class BrewUI {
  isOpen = false;
  onToggle?: (open: boolean) => void;
  private el: HTMLDivElement;
  private mode: Mode = 'codex';
  private title = '';
  private tab: Tab = 'brew';
  private slots: (string | null)[] = [null, null, null, null];
  private base: BaseId = 'water';
  private picking: number | null = null;
  private stir: StirState | null = null;
  private result: BrewOutcome | null = null;
  private note = '';
  private catOpen: BrewCat | 'all' = 'all';

  constructor(private herb: Herbalism) {
    this.el = document.createElement('div');
    this.el.className = 'bw interactive hidden';
    document.getElementById('ui')!.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('[data-stir]')) this.setHeld(true);
    });
    window.addEventListener('pointerup', () => this.setHeld(false));
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        if (this.picking !== null) {
          this.picking = null;
          this.render();
        } else this.close();
      } else if (e.code === 'Space' && this.stir) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.setHeld(true);
      } else if (e.code === 'Enter' && this.stir) {
        e.preventDefault();
        this.pour();
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (this.isOpen && e.code === 'Space') this.setHeld(false);
    }, true);
    events.on('equipmentChanged', () => {
      if (this.isOpen && !this.stir && this.picking === null) this.render();
    });
  }

  open(mode: Mode, title: string) {
    this.mode = mode;
    this.title = title;
    this.tab = mode === 'codex' ? 'recipes' : 'brew';
    this.stir = null;
    this.result = null;
    this.picking = null;
    this.note = '';
    if (!this.isOpen) {
      this.isOpen = true;
      this.el.classList.remove('hidden');
      this.onToggle?.(true);
    }
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stir = null;
    this.el.classList.add('hidden');
    this.onToggle?.(false);
  }

  private get brewMode(): BrewMode {
    return this.mode === 'field' ? 'field' : 'station';
  }
  private get ings() {
    return this.slots.filter((s): s is string => !!s);
  }

  // ---- input ---------------------------------------------------------------------------------
  private onClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!t) return;
    const a = t.dataset.a!, v = t.dataset.v ?? '';
    const H = this.herb;
    switch (a) {
      case 'close': return this.close();
      case 'tab':
        this.tab = v as Tab;
        this.picking = null;
        return this.render();
      case 'cat':
        this.catOpen = v as BrewCat | 'all';
        return this.render();
      case 'recipe': {
        const r = RECIPES.find((x) => x.id === v)!;
        const fill = H.autofill(r);
        this.base = r.base;
        this.result = null;
        if (fill) {
          this.slots = [...fill, null, null, null, null].slice(0, 4);
          this.note = `The bench lays out ${fill.map((id) => H.nameOf(id)).join(', ')} for ${r.name}.`;
        } else {
          this.slots = [null, null, null, null];
          this.note = `You don't carry reagents that make ${r.name} (${this.needText(r)}${r.key ? `, with ${r.key.map((k) => H.nameOf(k)).join(' or ')}` : ''}).`;
        }
        return this.render();
      }
      case 'clear':
        this.slots = [null, null, null, null];
        this.result = null;
        this.note = 'An empty pot. Put in any two to four reagents and see what they make.';
        return this.render();
      case 'slot':
        this.picking = Number(v);
        return this.render();
      case 'unslot':
        this.slots[Number(v)] = null;
        return this.render();
      case 'pick':
        if (this.picking !== null) this.slots[this.picking] = v;
        this.picking = null;
        this.result = null;
        return this.render();
      case 'nopick':
        this.picking = null;
        return this.render();
      case 'base':
        this.base = v as BaseId;
        return this.render();
      case 'brew': return this.startStir();
      case 'pour': return this.pour();
      case 'skip': return this.finish('skip');
      case 'again':
        this.result = null;
        return this.render();
      case 'taste':
        this.note = H.taste(v);
        return this.render();
    }
  }

  private setHeld(on: boolean) {
    if (this.stir) this.stir.held = on;
  }

  // ---- the stir ---------------------------------------------------------------------------------
  private startStir() {
    const H = this.herb;
    const why = H.check(this.ings, this.base, this.brewMode);
    if (why) {
      this.note = why;
      return this.render();
    }
    const pv = H.preview(this.ings, this.base, this.brewMode);
    this.stir = { p: 0, t: 0, held: false, color: pv.mix.recipe?.color ?? 0x4a4a32, fail: !pv.mix.recipe, bubbles: 0 };
    this.render();
  }

  private window() {
    const w = 1 + this.herb.perk('stirWindow');
    return { perfect: 0.03 * w, good: 0.08 * w };
  }

  /** Animate the stir (called every render frame). */
  frame(dt: number) {
    const s = this.stir;
    if (!s || !this.isOpen) return;
    s.t += dt;
    const speed = s.held ? 0.26 + 0.12 * Math.sin(s.t * 3.1) + 0.06 * Math.sin(s.t * 7.7) : 0.025;
    s.p += speed * dt;
    if (s.p > 1.2) return this.pour();
    const liquid = this.el.querySelector<SVGElement>('.bw-liquid');
    const bar = this.el.querySelector<HTMLElement>('.bw-heat i');
    if (!liquid) return;
    const start = 0x6a5a3a, burnt = 0x2a1a0a;
    let c: number;
    if (s.p < 0.72) c = lerpColor(start, lerpColor(start, s.color, 0.25), s.p / 0.72);
    else if (s.p < 0.85) c = lerpColor(lerpColor(start, s.color, 0.25), s.color, (s.p - 0.72) / 0.13);
    else if (s.p < 0.93) c = s.color;
    else c = lerpColor(s.color, burnt, Math.min(1, (s.p - 0.93) / 0.2));
    liquid.setAttribute('fill', hex(c));
    const turned = Math.abs(s.p - 0.85) < this.window().good;
    this.el.querySelector('.bw-pot')?.classList.toggle('turned', turned);
    this.el.querySelector('.bw-pot')?.classList.toggle('held', s.held);
    if (bar) bar.style.width = `${Math.min(100, (s.p / 1.2) * 100)}%`;
    // Spoon swirl.
    const spoon = this.el.querySelector<SVGElement>('.bw-spoon');
    if (spoon) spoon.setAttribute('transform', `rotate(${Math.sin(s.t * (s.held ? 9 : 1.5)) * 18} 100 70)`);
  }

  private pour() {
    const s = this.stir;
    if (!s) return;
    const d = Math.abs(s.p - 0.85), w = this.window();
    this.finish(d <= w.perfect ? 'perfect' : d <= w.good ? 'good' : 'poor');
  }

  private finish(stir: Stir) {
    this.stir = null;
    this.result = this.herb.brew(this.ings, this.base, stir, this.brewMode);
    if (this.result.ok) {
      const left = this.herb.check(this.ings, this.base, this.brewMode);
      this.note = left ? '' : 'You have enough for another batch.';
    }
    this.render();
  }

  // ---- render --------------------------------------------------------------------------------
  private render() {
    if (!this.isOpen) return;
    const H = this.herb, L = H.level;
    const need = practiceNeed(L), frac = H.learned && L < 30 ? Math.min(1, H.xp / need) : 1;
    const head = `<header>
        <div class="bw-t"><b>${esc(this.title)}</b><small>${H.learned ? `HERBALISM ${L} · TIER ${H.tierCap} REAGENTS` : 'HERBALISM NOT LEARNED'}</small></div>
        ${H.learned ? `<div class="bw-xp" title="Practice toward the next level: gathering and brewing raise Herbalism"><i style="width:${frac * 100}%"></i><span>${L >= 30 ? 'MASTERED' : `${Math.round(H.xp)} / ${need} practice`}</span></div>` : ''}
        <button data-a="close" title="Close (Esc)">✕</button></header>
      <nav>${(['brew', 'recipes', 'herbs'] as Tab[]).map((t) => `<button data-a="tab" data-v="${t}" class="${this.tab === t ? 'on' : ''}">${t === 'brew' ? 'Brew' : t === 'recipes' ? 'Recipes' : 'Herbs'}</button>`).join('')}
        <span class="bw-stats">${H.stats.brewed} brewed · ${H.stats.discovered} discovered · ${H.knownRecipes().length}/${RECIPES.length} recipes</span></nav>`;
    let body = '';
    if (this.tab === 'brew') body = this.brewPage();
    else if (this.tab === 'recipes') body = this.recipesPage();
    else body = this.herbsPage();
    const foot = this.stir ? 'Hold SPACE (or the Stir button) to stir · watch the colour turn · ENTER or Pour' : this.mode === 'field' ? 'Field brewing: one flask at a time, carried bases, Fine at best' : this.mode === 'station' ? 'Alchemy table: spring water is free here · Esc to leave' : 'Brew at an alchemy table, or from a Herbalist\'s Satchel';
    this.el.innerHTML = `<div class="bw-book">${head}<div class="bw-body">${body}</div><footer>${foot}</footer></div>`;
  }

  private chips(id: string) {
    const H = this.herb;
    return (REAGENTS[id]?.props ?? []).map((p) => (H.propKnown(id, p) ? `<i class="bw-chip" style="--pc:${PROP_COLOR[p]}">${p}</i>` : '<i class="bw-chip unk">?</i>')).join('');
  }
  private needText(r: RecipeDef) {
    return (Object.entries(r.needs) as [Prop, number][]).map(([p, n]) => `${n > 1 ? n + '× ' : ''}${p}`).join(' + ');
  }
  private needChips(r: RecipeDef) {
    return (Object.entries(r.needs) as [Prop, number][]).map(([p, n]) => `<i class="bw-chip" style="--pc:${PROP_COLOR[p]}">${n > 1 ? n + '× ' : ''}${p}</i>`).join('');
  }

  private brewPage() {
    const H = this.herb;
    if (!H.learned) return `<div class="bw-empty"><p>The bench is a mystery of glass and copper to you.</p><p><b>Wenna Thistledown</b>, the wandering herbalist camped beside the Crown Road, teaches Herbalism. Ask her about <b>The Green Craft</b>.</p></div>`;
    if (this.mode === 'codex') return `<div class="bw-empty"><p>Brewing needs an <b>alchemy table</b> (Ilyra Moss in Elder Glen, Quill Mereweather in Port Aurelle, Fenwick Ashgrove in the Royal Capital, the House of Balms in Ghagrabba, Wenna's cauldron) or a <b>Herbalist's Satchel</b> from your pack.</p><p>The Recipes and Herbs pages are your notebook.</p></div>`;
    if (this.stir) return this.stirPage();
    // Left: recipes you know.
    const known = H.knownRecipes();
    const list = CATS.map((c) => {
      const rs = known.filter((r) => r.cat === c);
      if (!rs.length) return '';
      return `<h5>${CAT_NAME[c]}</h5>` + rs.map((r) => {
        const can = !!H.autofill(r);
        return `<button class="bw-rec${can ? ' can' : ''}" data-a="recipe" data-v="${r.id}" style="--rc:${hex(r.color)}"><span class="dot"></span>${esc(r.name)}<em>${can ? 'ready' : ''}</em></button>`;
      }).join('');
    }).join('');
    const left = `<div class="bw-left"><button class="bw-exp" data-a="clear">✦ Experiment: an empty pot</button>${list}</div>`;
    return `<div class="bw-brew">${left}<div class="bw-bench">${this.picking !== null ? this.picker() : this.result ? this.resultCard() : this.bench()}</div></div>`;
  }

  private bench() {
    const H = this.herb, mode = this.brewMode;
    const slots = this.slots.map((id, i) => id
      ? `<div class="bw-slot full"><button class="x" data-a="unslot" data-v="${i}" title="Take it out">✕</button><button class="in" data-a="slot" data-v="${i}"><img src="${iconFor(id)}" alt=""><b>${esc(H.nameOf(id))}</b><span>${this.chips(id)}</span><small>${H.count(id)} carried</small></button></div>`
      : `<div class="bw-slot"><button class="in" data-a="slot" data-v="${i}"><span class="plus">+</span><small>reagent</small></button></div>`).join('');
    const bases = (['water', 'spirit', 'oil'] as BaseId[]).map((b) => {
      const free = H.baseFree(b, mode), n = H.count(BASE_ITEM[b]);
      return `<button class="bw-base${this.base === b ? ' on' : ''}${!free && !n ? ' none' : ''}" data-a="base" data-v="${b}"><b>${BASE_NAME[b]}</b><small>${free ? 'free here' : `${n} carried`}</small><em>${b === 'water' ? 'tonics, draughts' : b === 'spirit' ? 'elixirs, flasks' : 'blade oils'}</em></button>`;
    }).join('');
    const ings = this.ings;
    let preview = '';
    if (ings.length >= 2) {
      const pv = H.preview(ings, this.base, mode);
      const r = pv.mix.recipe;
      const see = pv.allKnown || (r && !pv.mix.discovered);
      if (r && see) {
        const perfect = quality({ stir: 'perfect', station: mode === 'station', level: H.level, recipe: r, ings, perks: (k) => H.perk(k) }).q;
        preview = `<div class="bw-pv" style="--rc:${hex(r.color)}"><img src="${iconFor(`brew_${r.id}_${pv.q!.q}`)}" alt=""><div><b>${pv.mix.discovered ? 'Something new: ' : 'Will make: '}${esc(r.name)}${pv.batch > 1 ? ` ×${pv.batch}` : ''}</b>
          <small>A good pour: <em style="color:${Q_COLOR[pv.q!.q]}">${QUALITY_NAMES[pv.q!.q]}</em> · a perfect one: <em style="color:${Q_COLOR[perfect]}">${QUALITY_NAMES[perfect]}</em></small>
          <small class="why">${pv.q!.why.filter((w) => !/pour/i.test(w)).join(' · ')}</small></div></div>`;
      } else if (r) preview = '<div class="bw-pv unk"><b>Something is stirring in these reagents…</b><small>You don\'t know all their properties. Brew and find out.</small></div>';
      else if (pv.mix.lockedBy && H.perk('eye') > 0) preview = `<div class="bw-pv unk"><b>${esc(pv.mix.lockedBy.recipe.name)}, but you don't know how</b><small>The Herbalism tree's "${esc(pv.mix.lockedBy.node)}" teaches it.</small></div>`;
      else preview = `<div class="bw-pv unk"><b>${pv.allKnown ? 'These virtues make nothing you can name' : 'Unknown mixture'}</b><small>${pv.allKnown ? 'It would curdle into sludge (though you would learn something).' : 'Experiment: you may discover a recipe, or make sludge.'}</small></div>`;
    }
    const why = ings.length ? H.check(ings, this.base, mode) : null;
    return `<div class="bw-slots">${slots}</div>
      <div class="bw-bases">${bases}</div>
      ${preview}
      ${this.note ? `<p class="bw-note">${esc(this.note)}</p>` : ''}
      <div class="bw-go">${why ? `<span class="bad">${esc(why)}</span>` : ''}<button class="bw-btn" data-a="brew" ${why || ings.length < 2 ? 'disabled' : ''}>Light the burner and brew</button></div>`;
  }

  private picker() {
    const H = this.herb, cap = H.tierCap;
    const rows = H.pouch().map(({ id, n }) => {
      const t = REAGENTS[id].tier, ok = t <= cap;
      const used = this.slots.filter((s, i) => s === id && i !== this.picking).length;
      const left = n - used;
      return `<button class="bw-pick${ok && left > 0 ? '' : ' off'}" ${ok && left > 0 ? `data-a="pick" data-v="${id}"` : ''}><img src="${iconFor(id)}" alt=""><b>${esc(H.nameOf(id))}</b><span>${this.chips(id)}</span><small>T${t} · ${left} left${ok ? '' : ` · needs Herbalism ${TIER_LEVEL[Math.max(1, t - H.perk('tierBonus'))]}`}</small></button>`;
    }).join('');
    return `<div class="bw-picker"><h4>Choose a reagent <button data-a="nopick">Back</button></h4>${rows || '<p class="bw-note">Your pouch is empty. Gather herbs in the wild, or buy them from an apothecary.</p>'}</div>`;
  }

  private stirPage() {
    const s = this.stir!;
    const left = `<div class="bw-left"><h5>The pour</h5><p class="bw-help">Hold <b>Space</b> (or the Stir button) to stir. The brew warms through muddy brown; when it <b>turns</b> to its true colour, <b>pour</b>. Too soon and it's weak; too late and it scorches. Perfect timing makes a finer brew.</p><p class="bw-help">Skip, and you stir without care: it brews, a step worse than a good pour.</p></div>`;
    return `<div class="bw-brew">${left}<div class="bw-bench bw-stir">
      <svg class="bw-pot${s.fail ? ' fail' : ''}" viewBox="0 0 200 170" aria-label="cauldron">
        <path d="M30 70 Q30 150 100 150 Q170 150 170 70 Z" fill="#2a2018" stroke="#c9a25a" stroke-width="3"/>
        <ellipse class="bw-liquid" cx="100" cy="72" rx="66" ry="14" fill="#6a5a3a"/>
        <ellipse cx="100" cy="70" rx="72" ry="10" fill="none" stroke="#c9a25a" stroke-width="4"/>
        <g class="bw-bub"><circle cx="78" cy="70" r="4"/><circle cx="118" cy="74" r="3"/><circle cx="96" cy="68" r="2.5"/></g>
        <g class="bw-spoon"><rect x="104" y="10" width="7" height="70" rx="3" fill="#8a5a34" transform="rotate(18 107 45)"/></g>
        <path d="M60 152 L50 166 M140 152 L150 166" stroke="#3a2a1a" stroke-width="6"/>
        <g class="bw-fire"><path d="M80 166 Q90 150 100 166 Q110 148 120 166 Z" fill="#ff8a2a"/></g>
      </svg>
      <div class="bw-heat"><i></i></div>
      <div class="bw-stirbtns"><button class="bw-btn" data-stir>Stir (hold)</button><button class="bw-btn gold" data-a="pour">Pour</button><button class="bw-btn ghost" data-a="skip">Skip</button></div>
    </div></div>`;
  }

  private resultCard() {
    const R = this.result!, H = this.herb;
    if (!R.ok) return `<div class="bw-res"><p class="bad">${esc(R.msg)}</p><button class="bw-btn" data-a="again">Back to the bench</button></div>`;
    const r = R.recipe;
    const again = !H.check(this.ings, this.base, this.brewMode);
    const head = r
      ? `<div class="bw-res-h" style="--rc:${hex(r.color)}"><img src="${iconFor(`brew_${r.id}_${R.q}`)}" alt=""><div>${R.discovered ? '<span class="disc">✦ RECIPE DISCOVERED ✦</span>' : ''}<b style="color:${Q_COLOR[R.q!]}">${QUALITY_NAMES[R.q!]} ${esc(r.name)}${R.qty! > 1 ? ` ×${R.qty}` : ''}</b><small>${esc(CAT_NAME[r.cat].replace(/s$/, ''))}</small></div></div>
        <ul class="bw-fx">${describeFx(r, R.q!).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <p class="bw-why">${(R.why ?? []).map(esc).join(' · ')}</p>`
      : `<div class="bw-res-h fail"><img src="${iconFor('murkySludge')}" alt=""><div><b>Murky Sludge</b><small>${esc(R.msg)}</small></div></div>`;
    return `<div class="bw-res">${head}
      ${R.revealed?.length ? `<p class="bw-rev">Learned: ${R.revealed.map(esc).join(' · ')}</p>` : ''}
      <p class="bw-xpg">+${R.xp ?? 0} Herbalism practice</p>
      <div class="bw-go"><button class="bw-btn" data-a="again">Back to the bench</button>${again ? '<button class="bw-btn gold" data-a="brew">Brew another</button>' : ''}</div></div>`;
  }

  private recipesPage() {
    const H = this.herb;
    const tabs = `<div class="bw-cats"><button data-a="cat" data-v="all" class="${this.catOpen === 'all' ? 'on' : ''}">All</button>${CATS.map((c) => `<button data-a="cat" data-v="${c}" class="${this.catOpen === c ? 'on' : ''}">${CAT_NAME[c]}</button>`).join('')}</div>`;
    const cards = RECIPES.filter((r) => this.catOpen === 'all' || r.cat === this.catOpen).map((r) => {
      if (!H.knows(r.id)) {
        const where: string[] = [];
        if (r.src.node) where.push(`Herbalism tree: ${r.src.node}`);
        for (const b of r.src.books ?? []) where.push(`Book: ${BOOKS.find((x) => x.id === b)?.name}`);
        if (r.src.discover) where.push('Can be discovered by experimenting');
        return `<div class="bw-card unk"><div class="bw-card-h"><span class="dot" style="--rc:#7a6a5a"></span><b>${r.src.discover ? '??? (an undiscovered ' + CAT_NAME[r.cat].replace(/s$/, '').toLowerCase() + ')' : esc(r.name)}</b><em>T${r.tier}</em></div><small>${where.map(esc).join(' · ')}</small></div>`;
      }
      const fine = describeFx(r, 3, r.cat === 'tonic' ? 1 : Math.max(0.3, 1 + H.perk('buffTime')));
      const best = describeFx(r, 5).slice(0, 2);
      return `<div class="bw-card"><div class="bw-card-h"><img src="${iconFor(`brew_${r.id}_3`)}" alt=""><b>${esc(r.name)}</b><em>T${r.tier}</em></div>
        <div class="bw-card-n">${this.needChips(r)}${r.key ? `<i class="bw-chip key">+ ${r.key.map((k) => esc(H.nameOf(k))).join(' / ')}</i>` : ''}<i class="bw-chip base">${BASE_NAME[r.base]}</i></div>
        <p>${esc(r.blurb)}</p>
        <ul class="bw-fx">${fine.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <small>Fine quality.${r.tox ? ` Toxicity ${r.tox}.` : ''}${r.family && r.cat !== 'tonic' ? ' One of its family at a time.' : ''} Masterwork: ${best.map(esc).join('; ')}.</small></div>`;
    }).join('');
    const tox = H.effects;
    return `${tabs}<p class="bw-help">Toxicity limit <b>${Math.round(tox.toxCap)}</b>${H.perk('noOverdose') > 0 ? ' (you can no longer overdose)' : ''}. Healing tonic cooldown <b>${H.perk('apothecary') > 0 ? 'none' : `${H.perk('quickSip') > 0 ? 4 : 8} s`}</b>. Oil slots <b>${1 + H.perk('oilSlots')}</b>.</p><div class="bw-cards">${cards}</div>`;
  }

  private herbsPage() {
    const H = this.herb;
    const ids = Object.keys(REAGENTS).sort((a, b) => REAGENTS[a].tier - REAGENTS[b].tier || H.nameOf(a).localeCompare(H.nameOf(b)));
    const rows = ids.map((id) => {
      const R = REAGENTS[id], n = H.count(id);
      const hidden = R.props.some((p) => !H.propKnown(id, p));
      const gate = TIER_LEVEL[R.tier];
      return `<div class="bw-herb${R.tier > H.tierCap ? ' locked' : ''}">${ITEMS[id] ? `<img src="${iconFor(id)}" alt="">` : '<span class="noimg"></span>'}<div><b>${esc(H.nameOf(id))}</b><small>Tier ${R.tier} · ${esc(R.where)}${R.tier > H.tierCap ? ` · brew from Herbalism ${gate}` : ''}</small></div><span class="bw-props">${this.chips(id)}</span><span class="cnt">${n ? `×${n}` : ''}</span>${hidden && n && H.learned ? `<button class="bw-btn ghost small" data-a="taste" data-v="${id}" title="Use one up to learn a hidden property">Taste</button>` : ''}</div>`;
    }).join('');
    return `<p class="bw-help">Every reagent's properties (its virtues) decide what it brews. You identify them by gathering (the first one, or all of them with Wenna's Almanac), by brewing, by tasting, or at a glance with <b>Brewer's Eye</b>.</p>${this.note ? `<p class="bw-note">${esc(this.note)}</p>` : ''}<div class="bw-herbs">${rows}</div>`;
  }
}
