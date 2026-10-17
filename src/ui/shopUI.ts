import { ITEMS, itemValue, traitLines, STAT_LABEL, type ItemDef, type ItemStats } from '../items/itemDefs';
import { iconFor } from './icons';
import { events } from '../core/events';
import type { Player } from '../player/player';

// A merchant's stall, drawn as a page of the merchant's ledger: a Buy tab of
// cards (icon, rarity, stats against what you have equipped, special traits,
// price), a Sell tab that takes anything you carry except quest keys and what
// you're wearing, and a Buy Back tab for whatever you sold this visit. A row
// of chips filters by kind; potions can be bought five at a time, gear can be
// bought and put on in one go, and stacks can be sold all at once.

export interface ShopOpts {
  speaker: string;
  title: string;
  intro: string;
  /** [item id, price] */
  stock: [string, number][];
  /** what this merchant pays, as a fraction of an item's value, by kind (default 0.35) */
  buyRate?: Partial<Record<ItemDef['kind'] | 'default', number>>;
  /** special prices for goods this merchant particularly wants (produce, ore...) */
  wants?: [string, number][];
  /** stock that isn't for sale yet, with why */
  locked?: [string, string][];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const KIND_LABEL: Record<string, string> = { sword: 'Sword', shield: 'Shield', armor: 'Armour', accessory: 'Accessory', spell: 'Spell', consumable: 'Consumable', material: 'Material', key: 'Key' };
const SHOWN: (keyof ItemStats)[] = ['damage', 'speed', 'block', 'stability', 'armor', 'poise', 'heal', 'restoreMana', 'restoreStamina', 'manaCost', 'maxHp', 'maxStamina', 'maxMana', 'damagePct', 'staminaRegen', 'manaRegen'];
const NAMES: Partial<Record<keyof ItemStats, string>> = { damage: 'Damage', speed: 'Speed', block: 'Block', stability: 'Stability', armor: 'Armour', poise: 'Poise', heal: 'Heals', restoreMana: 'Mana', restoreStamina: 'Stamina', manaCost: 'Mana cost', ...STAT_LABEL };
const fmt = (k: keyof ItemStats, v: number) =>
  k === 'speed' ? `×${v.toFixed(2)}` : k === 'stability' ? `${Math.round(v * 100)}%` : k === 'damagePct' || k === 'staminaRegen' || k === 'manaRegen' ? `+${Math.round(v * 100)}%` : `${Math.round(v)}`;

type Tab = 'buy' | 'sell' | 'back';
type Filter = 'all' | 'arms' | 'armour' | 'magic' | 'supplies' | 'goods';
const FILTERS: [Filter, string][] = [['all', 'All'], ['arms', 'Weapons & shields'], ['armour', 'Armour & trinkets'], ['magic', 'Spells'], ['supplies', 'Supplies'], ['goods', 'Goods']];
const groupOf = (d: ItemDef): Filter =>
  d.kind === 'sword' || d.kind === 'shield' ? 'arms' : d.kind === 'armor' || d.kind === 'accessory' ? 'armour' : d.kind === 'spell' ? 'magic' : d.kind === 'consumable' ? 'supplies' : 'goods';

export class ShopUI {
  open = false;
  onToggle?: (open: boolean) => void;
  private el: HTMLDivElement;
  private opts: ShopOpts | null = null;
  private tab: Tab = 'buy';
  private filter: Filter = 'all';
  private note = '';
  private noteBad = false;
  /** what you sold this visit, so you can change your mind (at the price you were paid) */
  private sold: { id: string; qty: number; price: number }[] = [];

  constructor(private player: Player) {
    this.el = document.createElement('div');
    this.el.className = 'shop2 interactive hidden';
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
      if (act === 'filter') {
        this.filter = t.dataset.f as Filter;
        return this.render(true);
      }
      if (act === 'buy') return this.buy(t.dataset.id!, Number(t.dataset.price), Number(t.dataset.n ?? 1), t.dataset.equip === '1');
      if (act === 'sell') return this.sell(Number(t.dataset.uid), t.dataset.all === '1');
      if (act === 'buyback') return this.buyBack(Number(t.dataset.i));
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && (e.code === 'Escape' || e.code === 'KeyE')) {
        e.stopImmediatePropagation();
        this.close();
      }
    }, true);
    events.on('equipmentChanged', () => this.refresh());
  }

  show(opts: ShopOpts) {
    this.opts = opts;
    this.tab = 'buy';
    this.filter = 'all';
    this.note = '';
    this.sold = [];
    this.open = true;
    this.el.classList.remove('hidden');
    this.render(true);
    this.onToggle?.(true);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.onToggle?.(false);
  }

  /** Redraw (new icons finished rendering, a purchase). Keeps the scroll position. */
  refresh() {
    if (!this.open) return;
    this.render(false);
  }

  /** Gold a merchant pays for one of this item. */
  private offer(def: ItemDef) {
    const o = this.opts!;
    const want = o.wants?.find(([id]) => id === def.id);
    if (want) return want[1];
    const rate = o.buyRate?.[def.kind] ?? o.buyRate?.default ?? 0.35;
    return Math.max(def.kind === 'key' ? 0 : 1, Math.floor(itemValue(def) * rate));
  }

  private say(text: string, bad = false) {
    this.note = text;
    this.noteBad = bad;
  }

  private buy(id: string, price: number, n = 1, equip = false) {
    const p = this.player, def = ITEMS[id];
    const total = price * n;
    if (p.prog.gold < total) {
      this.say(`You need ${total - p.prog.gold} more gold for ${n > 1 ? `${n} ${def.name}` : `the ${def.name}`}.`, true);
      return this.refresh();
    }
    p.prog.addGold(-total);
    const inst = p.equip.add(id, n);
    if (equip && p.equip.equip(inst.uid)) this.say(`Bought and equipped: ${def.name}.`);
    else this.say(`Bought: ${n > 1 ? `${n} × ` : ''}${def.name}.`);
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
    this.refresh();
  }

  private sell(uid: number, all = false) {
    const p = this.player;
    const it = p.equip.get(uid);
    if (!it || p.equip.slotOf(uid)) return;
    const each = this.offer(it.def);
    const n = all ? it.qty : 1;
    if (it.qty > n) it.qty -= n;
    else p.equip.items.splice(p.equip.items.indexOf(it), 1);
    p.prog.addGold(each * n);
    const back = this.sold.find((x) => x.id === it.def.id && x.price === each);
    if (back) back.qty += n;
    else this.sold.unshift({ id: it.def.id, qty: n, price: each });
    this.say(`Sold: ${n > 1 ? `${n} × ` : ''}${it.def.name} for ${each * n} gold.`);
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
    this.refresh();
  }

  private buyBack(i: number) {
    const p = this.player, x = this.sold[i];
    if (!x) return;
    if (p.prog.gold < x.price) {
      this.say(`You need ${x.price - p.prog.gold} more gold to buy it back.`, true);
      return this.refresh();
    }
    p.prog.addGold(-x.price);
    p.equip.add(x.id, 1);
    if (--x.qty <= 0) this.sold.splice(i, 1);
    this.say(`Bought back: ${ITEMS[x.id].name}.`);
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
    this.refresh();
  }

  /** What you'd be replacing: the item in the slot this one would go in. */
  private worn(def: ItemDef) {
    const eq = this.player.equip;
    if (def.kind === 'sword') return eq.mainWeapon?.def;
    if (def.kind === 'shield') return eq.offItem?.def.kind === 'shield' ? eq.offItem.def : undefined;
    if (def.slot) return eq.inSlot(def.slot)?.def;
    return undefined;
  }

  private wearing(def: ItemDef) {
    const eq = this.player.equip;
    return eq.items.some((i) => i.def.id === def.id && eq.slotOf(i.uid));
  }

  /** Stats, each with the change against what you're wearing in that slot. */
  private statRows(def: ItemDef) {
    const worn = this.worn(def);
    const rows: string[] = [];
    for (const k of SHOWN) {
      const v = def.stats[k];
      const w = worn && worn !== def ? worn.stats[k] : undefined;
      if (v === undefined) continue;
      let delta = '';
      if (worn && worn !== def) {
        const d = v - (w ?? 0);
        if (Math.abs(d) > 1e-6) {
          const better = k === 'manaCost' ? d < 0 : d > 0;
          const shown = k === 'speed' ? d.toFixed(2) : k === 'stability' || k === 'damagePct' || k === 'staminaRegen' || k === 'manaRegen' ? `${Math.round(d * 100)}%` : `${Math.round(d)}`;
          delta = ` <em class="${better ? 'up' : 'down'}">${d > 0 ? '+' : ''}${shown}</em>`;
        }
      }
      rows.push(`<span><i>${NAMES[k] ?? k}</i><b>${fmt(k, v)}</b>${delta}</span>`);
    }
    return rows.join('');
  }

  private card(def: ItemDef, right: string, tags: string[] = []) {
    const icon = iconFor(def.id);
    const worn = this.worn(def);
    const vs = worn && worn !== def && (def.kind === 'sword' || def.kind === 'shield' || def.kind === 'armor' || def.kind === 'accessory') ? `<div class="sc-vs">compared with your ${esc(worn.name)}</div>` : '';
    return `<div class="sc r-${def.rarity}">
      <div class="sc-ic">${icon ? `<img src="${icon}" alt="">` : ''}</div>
      <div class="sc-main">
        <div class="sc-head"><div class="sc-name">${esc(def.name)}</div>${tags.map((t) => `<span class="sc-tag">${esc(t)}</span>`).join('')}</div>
        <div class="sc-kind">${def.rarity} ${KIND_LABEL[def.kind] ?? def.kind}</div>
        <div class="sc-stats">${this.statRows(def)}</div>${vs}
        ${traitLines(def.stats).map((t) => `<div class="sc-trait">✦ ${esc(t)}</div>`).join('')}
        <div class="sc-desc">${esc(def.desc)}</div>
      </div>
      <div class="sc-buy">${right}</div>
    </div>`;
  }

  private chips(defs: ItemDef[]) {
    const have = new Set(defs.map(groupOf));
    if (have.size < 2) return '';
    return `<div class="sc-chips">${FILTERS.filter(([f]) => f === 'all' || have.has(f)).map(([f, label]) => `<button data-act="filter" data-f="${f}" class="${this.filter === f ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  private render(top: boolean) {
    const o = this.opts;
    if (!o) return;
    const scroll = top ? 0 : this.el.querySelector('.sc-list')?.scrollTop ?? 0;
    const p = this.player, eq = p.equip;
    const gold = p.prog.gold;
    const show = (d: ItemDef) => this.filter === 'all' || groupOf(d) === this.filter;
    let body = '', chips = '';
    if (this.tab === 'buy') {
      const stock = o.stock.filter(([id]) => ITEMS[id]);
      chips = this.chips(stock.map(([id]) => ITEMS[id]));
      body = stock.filter(([id]) => show(ITEMS[id])).map(([id, price]) => {
        const def = ITEMS[id];
        const owned = eq.items.filter((i) => i.def.id === id).reduce((n, i) => n + i.qty, 0);
        const gear = def.kind === 'sword' || def.kind === 'shield' || def.kind === 'armor' || def.kind === 'accessory';
        const tags = [...(this.wearing(def) ? ['equipped'] : owned ? [`you have ${owned}`] : [])];
        let btns = `<button data-act="buy" data-id="${id}" data-price="${price}" class="${gold >= price ? '' : 'poor'}">Buy</button>`;
        if (def.stack && def.kind === 'consumable') btns += `<button data-act="buy" data-id="${id}" data-price="${price}" data-n="5" class="alt ${gold >= price * 5 ? '' : 'poor'}">Buy ×5 · ${price * 5}g</button>`;
        else if (gear && !this.wearing(def)) btns += `<button data-act="buy" data-id="${id}" data-price="${price}" data-equip="1" class="alt ${gold >= price ? '' : 'poor'}">Buy &amp; equip</button>`;
        return this.card(def, `<div class="sc-price">${price}<i>g</i></div>${btns}`, tags);
      }).join('');
      if (!body) body = '<p class="sc-empty">Nothing of that kind on the counter today.</p>';
      if (o.locked?.length && this.filter === 'all') body += `<div class="sc-locked-h">Promised, not yet in stock</div>` + o.locked.map(([id, why]) => `<div class="sc-locked r-${ITEMS[id]?.rarity}"><b>${esc(ITEMS[id]?.name ?? id)}</b><span>${esc(why)}</span></div>`).join('');
    } else if (this.tab === 'sell') {
      const items = eq.items.filter((it) => it.def.kind !== 'key' && !eq.slotOf(it.uid));
      chips = this.chips(items.map((i) => i.def));
      const wanted = new Set((o.wants ?? []).map(([id]) => id));
      const list = items.filter((it) => show(it.def)).sort((a, b) => Number(wanted.has(b.def.id)) - Number(wanted.has(a.def.id)));
      body = list.length
        ? list.map((it) => {
          const each = this.offer(it.def);
          const btns = `<button data-act="sell" data-uid="${it.uid}">Sell${it.qty > 1 ? ' 1' : ''}</button>` + (it.qty > 1 ? `<button data-act="sell" data-uid="${it.uid}" data-all="1" class="alt">Sell all ${it.qty} · ${each * it.qty}g</button>` : '');
          const tags = [...(it.qty > 1 ? [`×${it.qty}`] : []), ...(wanted.has(it.def.id) ? ['wanted here'] : [])];
          return this.card(it.def, `<div class="sc-price">${each}<i>g</i></div>${btns}`, tags);
        }).join('')
        : `<p class="sc-empty">${items.length ? 'Nothing of that kind in your pack.' : 'Nothing to sell. (What you wear and quest items stay with you.)'}</p>`;
    } else {
      body = this.sold.length
        ? this.sold.map((x, i) => this.card(ITEMS[x.id], `<div class="sc-price">${x.price}<i>g</i></div><button data-act="buyback" data-i="${i}" class="${gold >= x.price ? '' : 'poor'}">Buy back</button>`, x.qty > 1 ? [`×${x.qty}`] : [])).join('')
        : '<p class="sc-empty">Anything you sell here today can be bought back, at the price you were paid.</p>';
    }
    const tab = (t: Tab, label: string) => `<button data-act="tab" data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${label}</button>`;
    this.el.innerHTML = `
      <header><div><b>${esc(o.speaker)}</b><small>${esc(o.title)}</small></div><div class="sc-gold" title="Your purse"><span class="coin"></span>${gold.toLocaleString()}<i>gold</i></div><button data-act="close" title="Leave (E or Esc)">✕</button></header>
      <p class="sc-intro">“${esc(o.intro)}”</p>
      <nav>${tab('buy', 'Buy')}${tab('sell', 'Sell')}${tab('back', `Buy back${this.sold.length ? ` · ${this.sold.reduce((n, x) => n + x.qty, 0)}` : ''}`)}<span class="sc-note ${this.noteBad ? 'bad' : ''}">${esc(this.note)}</span></nav>
      ${chips}
      <div class="sc-list">${body}</div>
      <footer><span>E / Esc · leave the stall</span><span>${this.tab === 'sell' ? 'Merchants pay about a third of what they charge. Some pay more for goods they want.' : this.tab === 'buy' ? 'Green and red numbers compare with what you wear now.' : ''}</span></footer>`;
    const list = this.el.querySelector('.sc-list');
    if (list) list.scrollTop = scroll;
  }
}
