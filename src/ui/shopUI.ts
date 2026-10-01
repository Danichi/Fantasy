import { ITEMS, itemValue, traitLines, STAT_LABEL, type ItemDef, type ItemStats } from '../items/itemDefs';
import { iconFor } from './icons';
import { events } from '../core/events';
import type { Player } from '../player/player';

// A merchant's stall: a Buy tab of cards (icon, rarity, stats against what
// you have equipped, special traits, price) and a Sell tab that takes
// anything you carry except quest keys and what you're wearing.

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

export class ShopUI {
  open = false;
  onToggle?: (open: boolean) => void;
  private el: HTMLDivElement;
  private opts: ShopOpts | null = null;
  private tab: 'buy' | 'sell' = 'buy';
  private note = '';

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
        this.tab = t.dataset.tab as 'buy' | 'sell';
        this.note = '';
        return this.render();
      }
      if (act === 'buy') return this.buy(t.dataset.id!, Number(t.dataset.price));
      if (act === 'sell') return this.sell(Number(t.dataset.uid));
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
    this.note = '';
    this.open = true;
    this.el.classList.remove('hidden');
    this.render();
    this.onToggle?.(true);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.onToggle?.(false);
  }

  /** Redraw (new icons finished rendering). Keeps the scroll position. */
  refresh() {
    if (!this.open) return;
    const list = this.el.querySelector('.sc-list');
    const top = list?.scrollTop ?? 0;
    this.render();
    const again = this.el.querySelector('.sc-list');
    if (again) again.scrollTop = top;
  }

  /** Gold a merchant pays for one of this item. */
  private offer(def: ItemDef) {
    const o = this.opts!;
    const want = o.wants?.find(([id]) => id === def.id);
    if (want) return want[1];
    const rate = o.buyRate?.[def.kind] ?? o.buyRate?.default ?? 0.35;
    return Math.max(def.kind === 'key' ? 0 : 1, Math.floor(itemValue(def) * rate));
  }

  private buy(id: string, price: number) {
    const p = this.player;
    if (p.prog.gold < price) {
      this.note = `You need ${price - p.prog.gold} more gold for the ${ITEMS[id].name}.`;
      return this.refresh();
    }
    p.prog.addGold(-price);
    p.equip.add(id, 1);
    this.note = `Bought: ${ITEMS[id].name}.`;
    events.emit('equipmentChanged', {});
    events.emit('progressChanged', {});
    this.refresh();
  }

  private sell(uid: number) {
    const p = this.player;
    const it = p.equip.get(uid);
    if (!it || p.equip.slotOf(uid)) return;
    const gold = this.offer(it.def);
    if (it.qty > 1) it.qty--;
    else p.equip.items.splice(p.equip.items.indexOf(it), 1);
    p.prog.addGold(gold);
    this.note = `Sold: ${it.def.name} for ${gold} gold.`;
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

  private statRows(def: ItemDef) {
    const worn = this.worn(def);
    const rows: string[] = [];
    for (const k of SHOWN) {
      const v = def.stats[k];
      if (v === undefined) continue;
      let delta = '';
      const w = worn?.stats[k];
      if (worn && worn !== def && w !== undefined && Math.abs(v - w) > 1e-6) {
        const better = k === 'manaCost' ? v < w : v > w;
        delta = ` <em class="${better ? 'up' : 'down'}">${better ? '▲' : '▼'}</em>`;
      }
      rows.push(`<span>${NAMES[k] ?? k}</span><b>${fmt(k, v)}${delta}</b>`);
    }
    return rows.join('');
  }

  private card(def: ItemDef, right: string, extra = '') {
    const icon = iconFor(def.id);
    return `<div class="sc r-${def.rarity}">
      <div class="sc-ic">${icon ? `<img src="${icon}" alt="">` : ''}</div>
      <div class="sc-main">
        <div class="sc-name">${esc(def.name)}</div>
        <div class="sc-kind">${def.rarity.toUpperCase()} · ${KIND_LABEL[def.kind] ?? def.kind}${extra}</div>
        <div class="sc-stats">${this.statRows(def)}</div>
        ${traitLines(def.stats).map((t) => `<div class="sc-trait">✦ ${esc(t)}</div>`).join('')}
        <div class="sc-desc">${esc(def.desc)}</div>
      </div>
      <div class="sc-buy">${right}</div>
    </div>`;
  }

  private render() {
    const o = this.opts;
    if (!o) return;
    const p = this.player;
    let body = '';
    if (this.tab === 'buy') {
      body = o.stock.map(([id, price]) => {
        const def = ITEMS[id];
        if (!def) return '';
        const owned = p.equip.items.filter((i) => i.def.id === id).reduce((n, i) => n + i.qty, 0);
        const can = p.prog.gold >= price;
        return this.card(def, `<div class="sc-price">${price}<i>g</i></div><button data-act="buy" data-id="${id}" data-price="${price}" ${can ? '' : 'class="poor"'}>Buy</button>`, owned ? ` · owned ${owned}` : '');
      }).join('');
      if (o.locked?.length) body += `<div class="sc-locked-h">COMING SOON</div>` + o.locked.map(([id, why]) => `<div class="sc-locked r-${ITEMS[id]?.rarity}"><b>${esc(ITEMS[id]?.name ?? id)}</b><span>${esc(why)}</span></div>`).join('');
    } else {
      const eq = p.equip;
      const items = eq.items.filter((it) => it.def.kind !== 'key' && !eq.slotOf(it.uid));
      body = items.length
        ? items.map((it) => {
          const gold = this.offer(it.def);
          return this.card(it.def, `<div class="sc-price">${gold}<i>g</i></div><button data-act="sell" data-uid="${it.uid}">Sell${it.qty > 1 ? ' 1' : ''}</button>`, it.qty > 1 ? ` · ×${it.qty}` : '');
        }).join('')
        : '<p class="sc-empty">Nothing to sell. (Equipped gear and quest items stay with you.)</p>';
    }
    this.el.innerHTML = `
      <header><div><b>${esc(o.speaker)}</b><small>${esc(o.title)}</small></div><div class="sc-gold">${p.prog.gold.toLocaleString()}<i>g</i></div><button data-act="close">✕</button></header>
      <p class="sc-intro">“${esc(o.intro)}”</p>
      <nav><button data-act="tab" data-tab="buy" class="${this.tab === 'buy' ? 'on' : ''}">Buy</button><button data-act="tab" data-tab="sell" class="${this.tab === 'sell' ? 'on' : ''}">Sell</button><span class="sc-note">${esc(this.note)}</span></nav>
      <div class="sc-list">${body}</div>
      <footer>E / Esc · leave the stall</footer>`;
  }
}
