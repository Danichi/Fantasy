import './skills.css';
import type { Player } from '../player/player';
import { events } from '../core/events';
import { DISC, DISCIPLINES, FAMILIES, NODE_TEXT, type DisciplineDef, type Family } from '../paths/data';
import {
  ATTRS, MASTERY_DISCOUNT, MASTERY_NAMES, MASTERY_XP, MAX_LEVEL, MAX_RANK, NODE_COST, levelCost, masteryRank, treeOf,
  type TreeNode,
} from '../paths/paths';
import { ICONS, TreeView, drawSealed } from './skillTree';
import { SkillRuntime } from '../paths/skills';

// The Skills screen (K). Tabs: Disciplines (the atlas of classes and
// callings; click one to open its tree), Attributes, Mastery.
// XP and attribute points can be spent anywhere. Learning a class, switching
// the active combat class and respeccing happen at mentors (npc/town.ts).

type Tab = 'disc' | 'attr' | 'mast';
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const TYPE_LABEL: Record<TreeNode['type'], string> = { center: 'Foundation', minor: 'Minor', notable: 'Notable', active: 'Skill', keystone: 'Keystone', choice: 'Choice', cap: 'Capstone' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number) => n.toLocaleString();

const CORNER = '<path d="M2 36V8a6 6 0 0 1 6-6h28" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 30V12a6 6 0 0 1 6-6h18" fill="none" stroke="currentColor" stroke-width=".8" opacity=".6"/><rect x="-1" y="-1" width="6" height="6" transform="rotate(45 2 2)" fill="currentColor"/>';

export class SkillsUI {
  readonly el: HTMLDivElement;
  private backdrop: HTMLDivElement;
  private body: HTMLDivElement;
  private titleEl: HTMLElement;
  private crumbEl: HTMLElement;
  private tabsEl: HTMLElement;
  private tab: Tab = 'disc';
  private openId: string | null = null;
  private view: TreeView | null = null;
  private selected = 'c';
  open = false;
  onToggle?: (open: boolean) => void;
  /** the skill runtime, for live skill descriptions (costs, learned modifiers) */
  runtime?: SkillRuntime;

  constructor(private player: Player) {
    const root = document.getElementById('ui')!;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sk-backdrop hidden';
    this.backdrop.addEventListener('click', () => this.toggle(false));
    this.el = document.createElement('div');
    this.el.className = 'sk hidden';
    this.el.innerHTML = `
      ${['tl', 'tr', 'bl', 'br'].map((c) => `<svg class="sk-corner ${c}" viewBox="0 0 38 38" aria-hidden="true">${CORNER}</svg>`).join('')}
      <div class="sk-top">
        <div class="sk-title"><div class="sk-crumb">SKILLS</div><h2>Disciplines</h2></div>
        <div class="sk-purse">
          <div class="sk-coin xp"><span class="v" data-k="xp">0</span><span class="l">Unspent XP</span></div>
          <div class="sk-coin"><span class="v" data-k="lv">1</span><span class="l">Character level</span></div>
          <div class="sk-coin"><span class="v" data-k="ap">0</span><span class="l">Attribute pts</span></div>
          <button class="sk-close" type="button" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="sk-tabs" role="tablist"></div>
      <div class="sk-body"></div>`;
    root.append(this.backdrop, this.el);
    this.body = this.el.querySelector('.sk-body')!;
    this.titleEl = this.el.querySelector('.sk-title h2')!;
    this.crumbEl = this.el.querySelector('.sk-crumb')!;
    this.tabsEl = this.el.querySelector('.sk-tabs')!;
    this.el.querySelector('.sk-close')!.addEventListener('click', () => this.toggle(false));
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if ((e.key === 'Enter' || e.key === ' ') && t.dataset.open) {
        e.preventDefault();
        this.openTree(t.dataset.open);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.code !== 'Escape') return;
      e.stopImmediatePropagation(); // closing the screen shouldn't also pause
      if (this.openId) this.closeTree();
      else this.toggle(false);
    });
    // Keep the numbers live while open (XP pickups, mentor actions).
    const live = () => this.open && this.refresh();
    events.on('progressChanged', live);
    events.on('pathsChanged', live);
  }

  get paths() {
    return this.player.paths;
  }

  toggle(force?: boolean) {
    const next = force ?? !this.open;
    if (next === this.open) return;
    this.open = next;
    this.el.classList.toggle('hidden', !next);
    this.backdrop.classList.toggle('hidden', !next);
    if (next) this.render();
    else this.disposeTree();
    this.onToggle?.(next);
  }

  /** Open straight to one discipline's tree (used by mentors). */
  show(id?: string) {
    this.tab = 'disc';
    if (!this.open) this.toggle(true);
    if (id) this.openTree(id);
  }

  private toast(msg: string) {
    this.el.querySelector('.sk-toast')?.remove();
    const t = document.createElement('div');
    t.className = 'sk-toast';
    t.textContent = msg;
    this.el.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  private purse() {
    const P = this.paths, pr = this.player.prog;
    const set = (k: string, v: string) => (this.el.querySelector(`[data-k="${k}"]`)!.textContent = v);
    set('xp', fmt(pr.xp));
    set('lv', String(P.charLevel));
    set('ap', String(P.attrFree));
    const ap = P.attrFree;
    this.tabsEl.innerHTML = ([['disc', 'Disciplines'], ['attr', 'Attributes'], ['mast', 'Mastery']] as [Tab, string][])
      .map(([id, l]) => `<button class="sk-tab${this.tab === id && !this.openId ? ' on' : ''}" type="button" data-tab="${id}">${l}${id === 'attr' && ap > 0 ? `<span class="n">${ap}</span>` : ''}</button>`)
      .join('');
    this.tabsEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.closeTree();
      }),
    );
  }

  /** Re-render whatever is showing, keeping the tree canvas alive. */
  private refresh() {
    this.purse();
    if (this.openId) this.renderPanel();
    else this.render();
  }

  private render() {
    this.purse();
    if (this.openId) return this.renderTree();
    this.crumbEl.textContent = 'SKILLS';
    this.titleEl.textContent = { disc: 'Disciplines', attr: 'Attributes', mast: 'Mastery' }[this.tab];
    if (this.tab === 'disc') this.renderAtlas();
    else if (this.tab === 'attr') this.renderAttrs();
    else this.renderMastery();
  }

  private medal(d: DisciplineDef) {
    const L = this.paths.level(d.id), C = 2 * Math.PI * 24, p = L / MAX_LEVEL;
    const dots = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${(28 + Math.cos((i * Math.PI) / 4) * 24).toFixed(2)}" cy="${(28 + Math.sin((i * Math.PI) / 4) * 24).toFixed(2)}" r="1" fill="var(${d.color})" opacity=".5"/>`).join('');
    return `<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <defs><radialGradient id="skg-${d.id}" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="var(${d.color})" stop-opacity=".28"/><stop offset="1" stop-color="var(${d.color})" stop-opacity="0"/></radialGradient></defs>
      <circle cx="28" cy="28" r="27" fill="#07080c" stroke="#363f55"/><circle cx="28" cy="28" r="20" fill="url(#skg-${d.id})"/>
      <g class="ring"><circle cx="28" cy="28" r="24" fill="none" stroke="var(${d.color})" stroke-opacity=".18" stroke-width="2"/>${dots}</g>
      <circle cx="28" cy="28" r="24" fill="none" stroke="var(${d.color})" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 28 28)" style="filter:drop-shadow(0 0 3px var(${d.color}))"/>
      <g transform="translate(16 16)"><path d="${ICONS[d.id] ?? ICONS.runecraft}" fill="none" stroke="var(${d.color})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>
    </svg>`;
  }

  // ---- disciplines -----------------------------------------------------------------
  private renderAtlas() {
    const P = this.paths;
    const cols = (Object.keys(FAMILIES) as Family[]).map((fk) => {
      const f = FAMILIES[fk];
      const items = DISCIPLINES.filter((d) => d.fam === fk && P.visible(d)).map((d) => {
        const L = P.level(d.id), locked = L === 0;
        const isCombat = d.fam === 'combat', isActive = isCombat && P.active === d.id, isInactive = isCombat && !isActive && !locked;
        const nc = P.nextCost(d.id), base = levelCost(L), mr = P.masteryRank(d.id);
        const badges = (d.secret ? '<span class="sk-badge secret">Secret</span>' : '') +
          (locked ? '<span class="sk-badge locked">Unlearned</span>' : isActive ? '<span class="sk-badge active">Active</span>' : isInactive ? '<span class="sk-badge inactive">Inactive</span>' : '');
        const pts = !locked && d.branches ? P.points(d.id) : 0;
        const info = locked
          ? `Learn from ${esc(d.mentor)}`
          : `<span class="sk-mchip">${MASTERY_NAMES[mr]}${mr > 0 ? ` · -${Math.round(P.discount(d.id) * 100)}% cost` : ''}</span>${pts > 0 ? ` · <span class="sk-pts">${pts} tree pt${pts > 1 ? 's' : ''}</span>` : ''}`;
        const btn = locked ? '' : L >= MAX_LEVEL ? '<span class="sk-mchip">MAX</span>' :
          `<button class="sk-invest" type="button" data-invest="${d.id}" ${P.canInvest(d.id) ? '' : 'disabled'}>${nc < base ? `<s>${fmt(base)}</s>` : ''}+1 · ${fmt(nc)} XP</button>`;
        return `<div class="sk-disc${locked ? ' is-locked' : ''}${isInactive ? ' is-inactive' : ''}" role="button" tabindex="0" data-open="${d.id}" style="--c:var(${d.color})">
          <div class="sk-medal">${this.medal(d)}</div>
          <div class="nm"><b>${esc(d.name)}</b>${badges}</div>
          <div class="lv">${locked ? '-' : L}<small>${locked ? '' : 'LEVEL'}</small></div>
          <div class="sub"><span>${info}</span>${btn}</div>
        </div>`;
      }).join('');
      return `<div class="sk-family"><div class="sk-fam-head"><h3>${f.name}</h3><span>${f.note}</span></div><p class="sk-fam-note">${f.flavour}</p>${items}</div>`;
    }).join('');
    this.body.innerHTML = `<div class="sk-view"><div class="sk-families">${cols}</div><p class="sk-foot">Some paths are not written in any book.</p></div>`;
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const inv = t.closest<HTMLElement>('[data-invest]');
    if (inv) {
      e.stopPropagation();
      this.invest(inv.dataset.invest!);
      return;
    }
    const attr = t.closest<HTMLElement>('[data-attr]');
    if (attr) {
      if (this.paths.raise(attr.dataset.attr as (typeof ATTRS)[number]['id'])) this.render();
      return;
    }
    const op = t.closest<HTMLElement>('[data-open]');
    if (op) this.openTree(op.dataset.open!);
  }

  private invest(id: string) {
    const d = DISC[id];
    if (!this.paths.invest(id)) return;
    const L = this.paths.level(id);
    this.toast(`${d.name} reached level ${L}${L % 5 === 0 ? ' · bonus tree point' : ''}`);
    if (this.openId) this.view?.burst(this.view.node('c'), 1.6);
  }

  // ---- attributes ------------------------------------------------------------------
  private renderAttrs() {
    const P = this.paths, p = this.player, free = P.attrFree;
    const derived: [string, string][] = [
      ['Max health', `${p.maxHp}`],
      ['Max stamina', `${p.maxStamina}`],
      ['Max mana', `${p.maxMana}`],
      ['Heavy weapon damage', `+${Math.round((P.meleePower(0.8) - 1) * 100)}%`],
      ['Light weapon damage', `+${Math.round((P.meleePower(1.2) - 1) * 100)}%`],
      ['Poise damage', `+${Math.round((P.poisePower - 1) * 100)}%`],
      ['Spell damage', `+${Math.round((P.spellPower - 1) * 100)}%`],
      ['Healing', `+${Math.round((P.healPower - 1) * 100)}%`],
      ['Stamina regen', `+${Math.round(P.staminaRegen * 100)}%`],
      ['Mana regen', `+${Math.round(P.manaRegen * 100)}%`],
    ];
    this.body.innerHTML = `<div class="sk-view">
      <p class="sk-help">You get one <b>attribute point</b> per character level and can spend it anywhere. Character level is 1 plus half the total levels of all your disciplines, so it rises whichever classes and callings you invest in.</p>
      <div class="sk-attrs">${ATTRS.map((a) => `<div class="sk-attr"><div class="ic">${a.glyph}</div><b>${a.name}</b><div class="pr"><span class="v">${P.attrs[a.id]}</span><button class="sk-plus" type="button" data-attr="${a.id}" ${free > 0 ? '' : 'disabled'} aria-label="Raise ${a.name}">+</button></div><p>${a.desc}</p></div>`).join('')}</div>
      <div class="sk-derived">${derived.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    </div>`;
  }

  // ---- mastery ---------------------------------------------------------------------
  private renderMastery() {
    const P = this.paths, top = MASTERY_XP[MASTERY_XP.length - 1];
    const rows = DISCIPLINES.filter((d) => P.learned(d.id)).map((d) => {
      const x = P.mx[d.id] ?? 0, r = masteryRank(x), nx = MASTERY_XP[Math.min(10, r + 1)];
      return `<div class="sk-mrow" style="--c:var(${d.color})"><b>${esc(d.name)}</b>
        <div class="sk-mbar"><i style="width:${Math.min(1, x / top) * 100}%"></i>${MASTERY_XP.slice(1, 10).map((t) => `<em style="left:${(t / top) * 100}%"></em>`).join('')}</div>
        <span class="rk">${r} · ${MASTERY_NAMES[r]}${r < 10 ? ` <span>(${fmt(x)}/${fmt(nx)})</span>` : ''}</span>
        <span class="dc">-${Math.round(r * MASTERY_DISCOUNT * 100)}% XP</span>
        <span class="how">${esc(d.how)}</span></div>`;
    }).join('');
    this.body.innerHTML = `<div class="sk-view">
      <p class="sk-help"><b>Mastery</b> is separate from level. It grows only by doing the thing: fighting with a class, casting its spells, brewing, exploring. Every rank makes that discipline's future levels <b>${Math.round(MASTERY_DISCOUNT * 1000) / 10}% cheaper</b>, up to <b>${Math.round(MASTERY_DISCOUNT * 1000)}%</b> at Grandmaster. Respeccing keeps your mastery.</p>
      <div class="sk-ladder">${MASTERY_NAMES.map((n, i) => `<span><b>${i}</b> ${n}</span>`).join('')}</div>
      <div>${rows}</div></div>`;
  }

  // ---- tree ------------------------------------------------------------------------
  private openTree(id: string) {
    if (!DISC[id] || !this.paths.visible(DISC[id])) return;
    this.openId = id;
    this.selected = 'c';
    this.render();
  }

  private closeTree() {
    this.disposeTree();
    this.openId = null;
    this.render();
  }

  private disposeTree() {
    this.view?.dispose();
    this.view = null;
  }

  private renderTree() {
    const d = DISC[this.openId!], f = FAMILIES[d.fam], t = treeOf(d);
    this.disposeTree();
    this.crumbEl.innerHTML = `<button type="button" data-back>SKILLS</button> / ${f.name.toUpperCase()}`;
    this.crumbEl.querySelector('[data-back]')!.addEventListener('click', () => this.closeTree());
    this.titleEl.textContent = d.name;
    this.body.innerHTML = `<div class="sk-view sk-tree" style="--c:var(${d.color})">
      <div class="sk-stage"><canvas aria-label="${esc(d.name)} skill tree"></canvas><span class="look">${f.look}</span><span class="hint">${t ? 'HOVER TO READ · CLICK TO SELECT · ESC TO GO BACK' : 'ESC TO GO BACK'}</span></div>
      <div class="sk-panel"></div></div>`;
    const cv = this.body.querySelector('canvas')!;
    if (t) {
      this.view = new TreeView(cv, d, this.paths);
      this.view.selected = this.selected;
      this.view.onSelect = (n) => {
        this.selected = n.id;
        this.renderPanel();
      };
    } else requestAnimationFrame(() => drawSealed(cv, this.paths.learned(d.id)));
    this.renderPanel();
  }

  private renderPanel() {
    const panel = this.body.querySelector<HTMLElement>('.sk-panel');
    if (!panel || !this.openId) return;
    const P = this.paths, d = DISC[this.openId], t = treeOf(d), L = P.level(d.id), locked = L === 0;
    const mr = P.masteryRank(d.id), mx = P.mx[d.id] ?? 0, lo = MASTERY_XP[mr], hi = MASTERY_XP[Math.min(10, mr + 1)];
    const mpct = mr >= 10 ? 100 : ((mx - lo) / (hi - lo)) * 100;
    const nc = P.nextCost(d.id), base = levelCost(L);
    let h = `<div class="sk-phead"><div class="sk-medal">${this.medal(d)}</div><div><h3>${esc(d.name)}</h3><div class="fl">${esc(d.flavour)}</div></div></div>`;
    if (locked) {
      h += `<div class="sk-note">Not learned yet. Find <b>${esc(d.mentor)}</b> to learn it. You can look at the tree, but nothing can be bought until then.</div>`;
    } else {
      h += `<div class="sk-kv">
        <span>Level</span><span class="hi">${L} / ${MAX_LEVEL}</span>
        ${t ? `<span>Tree points</span><span class="hi">${P.points(d.id)} free · ${P.earned(d.id)} earned</span>` : ''}
        ${d.res ? `<span>Resource</span><span>${esc(d.res)}</span>` : ''}
        <span>Next level</span><span>${L >= MAX_LEVEL ? 'Max' : `${nc < base ? `<s style="opacity:.5">${fmt(base)}</s> ` : ''}${fmt(nc)} XP`}</span></div>
      <div class="sk-meter"><div class="top"><span>MASTERY ${mr} · ${MASTERY_NAMES[mr].toUpperCase()}</span><span>-${Math.round(mr * MASTERY_DISCOUNT * 100)}% cost</span></div><div class="bar"><i style="width:${mpct}%"></i></div></div>
      <div class="sk-actions"><button class="sk-btn primary" type="button" data-invest="${d.id}" ${P.canInvest(d.id) ? '' : 'disabled'}>${L >= MAX_LEVEL ? 'Max level' : `Invest ${fmt(nc)} XP`}</button></div>`;
      if (d.fam === 'combat' && P.active !== d.id) h += `<div class="sk-note">This class is <b>inactive</b>. None of its nodes or skills do anything until you switch to it at ${esc(d.mentor.split(',')[0])}.</div>`;
      h += `<div class="sk-note">Respec at ${esc(d.mentor.split(',')[0])}: back to level 1, tree cleared, ${fmt(P.respecRefund(d.id))} XP returned (75%).</div>`;
    }
    if (t) {
      h += '<div class="sk-sep"></div>';
      const n = t.map[this.selected] ?? t.map.c;
      h += this.nodeCard(d, n);
      h += `<div class="sk-branches">${d.branches!.map((b, bi) => {
        const got = Object.keys(P.nodes[d.id]).filter((k) => t.map[k]?.branch === bi).length;
        const tot = t.nodes.filter((x) => x.branch === bi).length;
        return `<div><span>${esc(b.name)}</span><span>${got} / ${tot}</span><small>${esc(b.sub)}</small></div>`;
      }).join('')}</div>`;
      h += `<div class="sk-legend">${this.legend(d)}</div>`;
    }
    panel.innerHTML = h;
    panel.querySelector<HTMLElement>('[data-learn]')?.addEventListener('click', (e) => this.learn(Number((e.currentTarget as HTMLElement).dataset.learn)));
    panel.querySelector<HTMLElement>('[data-learn-b]')?.addEventListener('click', () => this.learn(1));
    panel.querySelector<HTMLElement>('[data-rank]')?.addEventListener('click', () => this.rankUp());
    panel.querySelectorAll<HTMLElement>('[data-bar]').forEach((b) => b.addEventListener('click', () => this.toBar(Number(b.dataset.bar))));
    this.view?.redraw();
  }

  private legend(d: DisciplineDef) {
    const shapes: [string, string][] = [
      ['Minor', `<circle r="3.5" fill="var(${d.color})"/>`],
      ['Notable', `<rect x="-4" y="-4" width="8" height="8" transform="rotate(45)" fill="var(${d.color})"/>`],
      ['Skill', `<circle r="6" fill="none" stroke="var(${d.color})" stroke-width="2"/>`],
      ['Keystone', '<polygon points="0,-7 7,0 0,7 -7,0" fill="none" stroke="var(--sk-gold)" stroke-width="2"/>'],
      ['Capstone', '<circle r="6.5" fill="var(--sk-gold)"/>'],
    ];
    return shapes.map(([l, s]) => `<span><svg width="14" height="14" viewBox="-8 -8 16 16">${s}</svg>${l}</span>`).join('');
  }

  /** Plain text of what a node does (skills: at its current or first rank). */
  private nodeDesc(d: DisciplineDef, n: TreeNode) {
    if (n.type === 'center') return `Foundation of ${d.name}.${d.res ? ` Grants the ${d.res} resource.` : ''} Tiers open at level 1, 5, 10, 15 and 20. Capstones at 25; you may own only one.`;
    const skill = SkillRuntime.skill(d.id, n.name);
    const rank = this.paths.node(d.id, n.id)?.r ?? 1;
    if (skill) return skill.text(rank, this.runtime!) + '.';
    if (n.type === 'active') return `${NODE_TEXT[n.name] ?? 'A technique for your bar.'} (Not in the game yet.)`;
    if (n.type === 'choice') {
      const v = this.paths.node(d.id, n.id);
      if (v) return SkillRuntime.effect(d.id, n, v.pick).text + '.';
      const [a, b] = n.name.split('|');
      return `Pick one. ${a}: ${SkillRuntime.effect(d.id, n, 0).text}. ${b}: ${SkillRuntime.effect(d.id, n, 1).text}. The other stays locked until you respec.`;
    }
    const e = SkillRuntime.effect(d.id, n);
    return e.text + '.' + (e.craft ? ' (A crafting bonus: it takes effect when crafting arrives.)' : '');
  }

  private nodeCard(d: DisciplineDef, n: TreeNode) {
    const P = this.paths, v = P.node(d.id, n.id), has = P.has(d.id, n.id);
    const name = n.type === 'choice' ? (v ? n.name.split('|')[v.pick ?? 0] : n.name.replace('|', ' or ')) : n.name;
    const cost = NODE_COST[n.type];
    const where = `${n.branch >= 0 ? esc(d.branches![n.branch].name) + ' · ' : ''}${n.tier === 0 ? 'Center' : n.tier === 6 ? 'Crown' : 'Tier ' + n.tier} · ${TYPE_LABEL[n.type]}${cost ? ` · ${cost} pt${cost > 1 ? 's' : ''}` : ''}`;
    let h = `<div class="sk-node"><span class="t">${where}</span><h4>${esc(name)}</h4><p>${esc(this.nodeDesc(d, n))}</p>`;
    if (v && n.type === 'active') h += `<div class="sk-ranks">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v.r ? 'on' : ''}"></i>`).join('')}<span>RANK ${ROMAN[v.r - 1]}</span></div>`;
    const inactive = d.fam === 'combat' && P.active !== d.id;
    if (n.type === 'center') h += `<span class="status${has ? '' : ' no'}">${has ? 'Learned' : 'Not learned'}</span>`;
    else if (has) {
      h += `<span class="status">Learned${inactive ? ' · no effect while inactive' : ''}</span>`;
      if (n.type === 'active' && v!.r < MAX_RANK) h += `<div class="sk-actions"><button class="sk-btn primary" type="button" data-rank ${P.canRankUp(d.id, n) ? '' : 'disabled'}>Rank up to ${ROMAN[v!.r]} · 1 pt</button></div>`;
      const skill = SkillRuntime.skill(d.id, n.name);
      if (skill) {
        const ref = `skill:${d.id}:${n.id}`;
        const at = this.player.equip.moves.indexOf(ref);
        h += `<div class="sk-kv">${skill.mana !== undefined ? `<span>Mana</span><span>${this.runtime?.manaCost(skill) ?? skill.mana}</span>` : ''}${skill.stamina ? `<span>Stamina</span><span>${skill.stamina}</span>` : ''}${skill.flow ? `<span>Flow</span><span>${skill.flow}</span>` : ''}${skill.cd ? `<span>Cooldown</span><span>${skill.cd}s</span>` : ''}</div>`;
        h += `<div class="sk-bar"><span>On your moves bar (Tab, keys 1-6):</span><div>${[0, 1, 2, 3, 4, 5].map((i) => `<button class="sk-slot${at === i ? ' on' : ''}" type="button" data-bar="${i}">${i + 1}</button>`).join('')}</div></div>`;
      }
    } else {
      const why = P.whyNot(d.id, n), ok = P.canLearn(d.id, n);
      if (why) h += `<span class="status no">${esc(why)}</span>`;
      if (n.type === 'choice') {
        const [a, b] = n.name.split('|');
        h += `<div class="sk-actions"><button class="sk-btn primary" type="button" data-learn="0" ${ok ? '' : 'disabled'}>Learn ${esc(a)}</button><button class="sk-btn primary" type="button" data-learn-b ${ok ? '' : 'disabled'}>Learn ${esc(b)}</button></div>`;
      } else h += `<div class="sk-actions"><button class="sk-btn primary" type="button" data-learn="0" ${ok ? '' : 'disabled'}>Learn · ${cost} pt${cost > 1 ? 's' : ''}</button></div>`;
    }
    return h + '</div>';
  }

  /** Put the selected skill on the moves bar (moving it if it's already there). */
  private toBar(slot: number) {
    const d = DISC[this.openId!], n = treeOf(d)?.map[this.selected];
    if (!n) return;
    const ref = `skill:${d.id}:${n.id}`;
    const eq = this.player.equip;
    const was = eq.moves[slot] === ref;
    eq.moves = eq.moves.map((m) => (m === ref ? null : m));
    if (!was) eq.moves[slot] = ref;
    events.emit('equipmentChanged', {});
    this.toast(was ? `${n.name} removed from the bar` : `${n.name} is on key ${slot + 1} of the moves bar (Tab)`);
    this.renderPanel();
  }

  private learn(pick: number) {
    const d = DISC[this.openId!], n = treeOf(d)?.map[this.selected];
    if (!n || !this.paths.learn(d.id, n, pick)) return;
    this.view?.burst(n, n.type === 'cap' ? 2.4 : 1.2);
    this.toast(`Learned ${n.type === 'choice' ? n.name.split('|')[pick] : n.name}`);
  }

  private rankUp() {
    const d = DISC[this.openId!], n = treeOf(d)?.map[this.selected];
    if (!n || !this.paths.rankUp(d.id, n)) return;
    const r = this.paths.node(d.id, n.id)!.r;
    this.view?.burst(n, 1);
    this.toast(`${n.name} is now rank ${ROMAN[r - 1]}${r === 3 ? ' · Form unlocked' : ''}`);
  }
}
