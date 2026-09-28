import type { Player } from '../player/player';
import type { Slot } from '../items/itemDefs';
import type { ItemInstance } from '../items/equipment';
import { events } from '../core/events';
import { iconFor } from './icons';

// Inventory & equipment screen (I). Click an item to equip it in its natural
// slot, Shift-click a sword to put it in the off hand, click an equipped slot
// to take it off, drag any item onto the hotbar to bind it to a number key.

const SLOT_LABEL: Record<Slot, string> = {
  main: 'Main hand', off: 'Off hand', head: 'Head', shoulders: 'Shoulders',
  chest: 'Chest', hands: 'Hands', legs: 'Legs', feet: 'Feet',
};
const DOLL: Slot[] = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'main', 'off'];

export class InventoryUI {
  readonly el: HTMLDivElement;
  private doll: HTMLDivElement;
  private grid: HTMLDivElement;
  private detail: HTMLDivElement;
  private stats: HTMLDivElement;
  open = false;
  onToggle?: (open: boolean) => void;

  constructor(private player: Player) {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'inventory hidden';
    this.el.innerHTML = `
      <section><h2>EQUIPMENT</h2><div class="paperdoll"></div><div class="stats"></div></section>
      <section><h2>INVENTORY</h2><div class="grid"></div></section>
      <section class="detail"></section>
      <div class="inv-help">Click to equip · <b>Shift-click</b> a sword to wield it in the off hand · Click an equipped slot to remove it · Drag items onto the hotbar · <b>I</b> or <b>Esc</b> to close</div>`;
    root.appendChild(this.el);
    this.doll = this.el.querySelector('.paperdoll')!;
    this.grid = this.el.querySelector('.grid')!;
    this.detail = this.el.querySelector('.detail')!;
    this.stats = this.el.querySelector('.stats')!;
    events.on('equipmentChanged', () => this.open && this.render());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.toggle(false);
    });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
    this.onToggle?.(this.open);
  }

  private showDetail(it: ItemInstance | undefined) {
    if (!it) {
      this.detail.innerHTML = '<h2>DETAILS</h2><p style="color:var(--ink-dim)">Hover an item to inspect it.</p>';
      return;
    }
    const d = it.def;
    const st = d.stats;
    const rows: string[] = [];
    if (st.damage) rows.push(`<span>Damage</span><b>${st.damage}</b>`);
    if (st.speed) rows.push(`<span>Speed</span><b>${Math.round(st.speed * 100)}%</b>`);
    if (st.block) rows.push(`<span>Block</span><b>${st.block}%</b>`);
    if (st.stability) rows.push(`<span>Stability</span><b>${Math.round(st.stability * 100)}</b>`);
    if (st.armor) rows.push(`<span>Armour</span><b>${st.armor}</b>`);
    if (st.poise) rows.push(`<span>Poise</span><b>${st.poise}</b>`);
    if (st.manaCost) rows.push(`<span>Mana cost</span><b>${st.manaCost}</b>`);
    if (st.heal) rows.push(`<span>Restores</span><b>${st.heal} HP</b>`);
    if (st.restoreMana) rows.push(`<span>Restores</span><b>${st.restoreMana} MP</b>`);
    const how =
      d.kind === 'sword' ? 'Click: main hand. Shift-click: off hand (dual wield).' :
      d.kind === 'shield' ? 'Click: off hand. Hold right mouse to block, F to parry.' :
      d.kind === 'spell' ? 'Click to attune. Press R to cast.' :
      d.kind === 'consumable' ? 'Bind to the hotbar and press its number to drink.' : 'Click to wear.';
    this.detail.innerHTML = `
      <div class="name">${d.name}</div><div class="rar">${d.rarity} ${d.kind}</div>
      <img class="big" src="${iconFor(d.id)}" alt="">
      <p>${d.desc}</p>
      <div class="stats" style="margin:0 0 12px">${rows.join('')}</div>
      <div class="how">${how}</div>`;
  }

  render() {
    const eq = this.player.equip;
    this.doll.innerHTML = '';
    for (const slot of DOLL) {
      const it = eq.inSlot(slot);
      const d = document.createElement('div');
      d.className = 'eqslot' + (it ? '' : ' empty');
      d.innerHTML = `<div class="ic">${it ? `<img src="${iconFor(it.def.id)}" alt="">` : ''}</div><div><div class="sl">${SLOT_LABEL[slot]}</div><div class="nm">${it?.def.name ?? 'Empty'}</div></div>`;
      d.addEventListener('click', () => eq.unequip(slot));
      d.addEventListener('mouseenter', () => this.showDetail(it));
      this.doll.appendChild(d);
    }
    const sp = eq.get(eq.activeSpell);
    this.stats.innerHTML = `
      <span>Attack</span><b>${eq.mainWeapon?.def.stats.damage ?? 0}${eq.dualWield ? ' + ' + (eq.offItem?.def.stats.damage ?? 0) : ''}</b>
      <span>Armour</span><b>${eq.armorValue}</b>
      <span>Poise</span><b>${eq.poise}</b>
      <span>Block</span><b>${eq.hasShield ? (eq.offItem!.def.stats.block ?? 0) + '%' : '—'}</b>
      <span>Attuned spell</span><b>${sp?.def.name ?? '—'}</b>`;

    this.grid.innerHTML = '';
    for (const it of eq.items) {
      const d = document.createElement('div');
      const slot = eq.slotOf(it.uid);
      const tag = slot ? (slot === 'main' ? 'MAIN' : slot === 'off' ? 'OFF' : 'WORN') : it.uid === eq.activeSpell ? 'ATTUNED' : '';
      d.className = `item r-${it.def.rarity}`;
      d.draggable = true;
      d.innerHTML = `<img src="${iconFor(it.def.id)}" alt="" draggable="false">${tag ? `<span class="eq">${tag}</span>` : ''}${it.def.stack ? `<span class="qty">${it.qty}</span>` : ''}`;
      d.title = it.def.name;
      d.addEventListener('click', (e) => {
        if (it.def.kind === 'consumable') {
          this.player.useConsumable(it.uid);
          this.render();
          return;
        }
        if (slot) {
          eq.unequip(slot);
          return;
        }
        const target: Slot | undefined = it.def.kind === 'sword' && e.shiftKey ? 'off' : undefined;
        eq.equip(it.uid, target);
      });
      d.addEventListener('mouseenter', () => this.showDetail(it));
      d.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/uid', String(it.uid)));
      this.grid.appendChild(d);
    }
    this.showDetail(undefined);
  }
}

export function buildOverlays(onStart: () => void) {
  const root = document.getElementById('ui')!;
  const controls = `
    <div class="controls">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Mouse</kbd> Look</span>
      <span><kbd>Shift</kbd> Sprint</span><span><kbd>Space</kbd> Dodge roll</span>
      <span><kbd>LMB</kbd> Attack · hold for heavy</span><span><kbd>RMB</kbd> Block / off-hand attack</span>
      <span><kbd>F</kbd> Parry</span><span><kbd>MMB</kbd> / <kbd>Tab</kbd> Lock on</span>
      <span><kbd>R</kbd> Cast spell</span><span><kbd>C</kbd> Jump</span>
      <span><kbd>1</kbd>–<kbd>8</kbd> Hotbar · <kbd>Shift</kbd>+num = off hand</span><span><kbd>I</kbd> Inventory</span>
    </div>`;
  const start = document.createElement('div');
  start.className = 'overlay';
  start.innerHTML = `<div class="title-card"><h1>THE TRAINING GROUNDS</h1><p class="sub">Slimes have overrun the field outside town. Take up your sword.</p><span class="cta">CLICK TO BEGIN</span><p class="mobile-note">Best played with a keyboard and mouse on a larger screen.</p>${controls}</div>`;
  root.appendChild(start);
  const help = document.createElement('div');
  help.className = 'overlay hidden';
  help.innerHTML = `<div class="title-card"><h1>CONTROLS</h1><p class="sub">Parry a slime's leap with good timing to stagger it, then strike for a critical riposte.</p>${controls}<p class="sub" style="margin-top:22px">Press H or click to close</p></div>`;
  root.appendChild(help);
  start.addEventListener('click', () => {
    start.classList.add('hidden');
    onStart();
  });
  help.addEventListener('click', () => help.classList.add('hidden'));
  return {
    start,
    help,
    showPaused(show: boolean) {
      start.querySelector('.cta')!.textContent = 'CLICK TO RESUME';
      start.classList.toggle('hidden', !show);
    },
    toggleHelp() {
      help.classList.toggle('hidden');
    },
  };
}
