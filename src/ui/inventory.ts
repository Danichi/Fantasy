import type { Player } from '../player/player';
import type { Origin } from '../progression/progression';
import { ARMOR_SLOTS, ACCESSORY_SLOTS, STAT_LABEL, traitLines, type ItemKind, type ItemStats, type Slot } from '../items/itemDefs';
import type { ItemInstance } from '../items/equipment';
import { events } from '../core/events';
import { iconFor, wideIconFor } from './icons';
import type { CharPreview } from './charPreview';
import { DISC } from '../paths/data';

const SLOT_LABEL: Record<Slot, string> = {
  main: 'Main hand', off: 'Off hand', head: 'Head', shoulders: 'Shoulders', chest: 'Chest', cloak: 'Cloak',
  hands: 'Hands', legs: 'Legs', feet: 'Feet', amulet: 'Amulet', ring1: 'Ring', ring2: 'Ring', belt: 'Belt', trinket: 'Trinket',
};

type View = 'items' | 'stats';
type Category = 'all' | 'weapons' | 'shields' | 'armour' | 'accessories' | 'spells' | 'usables' | 'materials' | 'quest';
type Sort = 'recent' | 'name' | 'rarity' | 'type';
const CATEGORIES: [Category, string, string, ItemKind[]][] = [
  ['all', 'All items', '✧', []],
  ['weapons', 'Weapons', '⚔', ['sword']],
  ['shields', 'Shields', '◈', ['shield']],
  ['armour', 'Armour', '⬟', ['armor']],
  ['accessories', 'Accessories', '◇', ['accessory']],
  ['spells', 'Spells', '✦', ['spell']],
  ['usables', 'Usables', '●', ['consumable']],
  ['materials', 'Materials', '❖', ['material']],
  ['quest', 'Quest items', '⌘', ['key']],
];
const RARITY_RANK: Record<string, number> = { epic: 0, rare: 1, fine: 2, common: 3 };
const KIND_RANK: Record<ItemKind, number> = { sword: 0, shield: 1, armor: 2, accessory: 3, spell: 4, consumable: 5, material: 6, key: 7 };
const STAT_NAMES: Partial<Record<keyof ItemStats, string>> = {
  damage: 'Damage', speed: 'Speed', block: 'Block', stability: 'Stability', armor: 'Armour', poise: 'Poise',
  manaCost: 'Mana cost', heal: 'Restores HP', restoreMana: 'Restores MP', restoreStamina: 'Restores stamina', waterBreathing: 'Breathe underwater (s)',
};

function fmtStat(k: keyof ItemStats, v: number) {
  if (k === 'staminaRegen' || k === 'manaRegen' || k === 'damagePct') return `+${Math.round(v * 100)}%`;
  if (k === 'speed') return `${Math.round(v * 100)}%`;
  if (k === 'block') return `${v}%`;
  if (k === 'stability') return `${Math.round(v * 100)}`;
  return `${v > 0 && k.startsWith('max') ? '+' : ''}${v}`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Inventory (I): a full-screen page of the book.
 *   left:  your character: armour down one side, accessories down the other,
 *          weapons under the live 3D figure, stats and quick items below
 *   right: the bag: search, sort, categories with counts, item cards, and a
 *          detail panel that compares an item with what you are wearing.
 * Click a card to equip or use it (Shift-click a sword for the off hand),
 * click a worn slot to take it off, or drag items onto slots and the HUD bar.
 */
export class InventoryUI {
  readonly el: HTMLDivElement;
  private armorCol: HTMLDivElement;
  private accCol: HTMLDivElement;
  private weaponRow: HTMLDivElement;
  private summary: HTMLDivElement;
  private quickRow: HTMLDivElement;
  private cats: HTMLElement;
  private grid: HTMLDivElement;
  private detail: HTMLElement;
  private bagBody: HTMLDivElement;
  private stats: HTMLDivElement;
  private countEl: HTMLElement;
  private goldEl: HTMLElement;
  private search: HTMLInputElement;
  private sortSel: HTMLSelectElement;
  private view: View = 'items';
  private cat: Category = 'all';
  private sort: Sort = 'recent';
  private query = '';
  private selected: number | null = null;
  open = false;
  onToggle?: (open: boolean) => void;
  onQuickDrop?: (slot: number, uid: number) => void;

  constructor(private player: Player, preview: CharPreview) {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'inventory inv2 hidden';
    this.el.innerHTML = `
      <section class="inv-char">
        <header><h2>CHARACTER</h2><span class="inv-gold"></span></header>
        <div class="inv-char-body">
          <div class="slots armor"></div>
          <div class="inv-figure"><div class="preview-frame"><div class="preview"></div><span class="rot-hint">Drag to rotate</span></div><div class="weapons"></div></div>
          <div class="slots acc"></div>
        </div>
        <div class="summary"></div>
        <div class="inv-quick"><h3>QUICK ITEMS <small>keys 1-4 · drop a usable here</small></h3><div class="quickrow"></div></div>
      </section>
      <section class="inv-bag">
        <header>
          <h2>BAG <small class="inv-count"></small></h2>
          <input class="inv-search" type="search" placeholder="Search items..." spellcheck="false">
          <select class="inv-sort" title="Sort">
            <option value="recent">Newest first</option><option value="name">Name</option><option value="rarity">Rarity</option><option value="type">Type</option>
          </select>
          <div class="inv-view"><button data-view="items" class="on">Items</button><button data-view="stats">Stats</button></div>
        </header>
        <div class="inv-bag-body">
          <nav class="inv-cats"></nav>
          <div class="grid"></div>
          <aside class="detail"></aside>
        </div>
        <div class="inv-stats hidden"></div>
      </section>
      <div class="inv-help">Click a card to equip or use it · <b>Shift-click</b> a sword for the off hand · Click a worn slot to take it off · Drag items onto slots or the HUD bar · <b>I</b> / <b>Esc</b> to close</div>`;
    root.appendChild(this.el);
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.armorCol = q('.slots.armor');
    this.accCol = q('.slots.acc');
    this.weaponRow = q('.weapons');
    this.summary = q('.summary');
    this.quickRow = q('.quickrow');
    this.cats = q('.inv-cats');
    this.grid = q('.grid');
    this.detail = q('.detail');
    this.bagBody = q('.inv-bag-body');
    this.stats = q('.inv-stats');
    this.countEl = q('.inv-count');
    this.goldEl = q('.inv-gold');
    this.search = q('.inv-search');
    this.sortSel = q('.inv-sort');
    preview.bind(q('.preview'));
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.renderBag();
    });
    this.sortSel.addEventListener('change', () => {
      this.sort = this.sortSel.value as Sort;
      this.renderBag();
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => {
        this.view = b.dataset.view as View;
        this.render();
      }),
    );
    events.on('equipmentChanged', () => this.open && this.render());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) {
        e.stopImmediatePropagation(); // closing the inventory shouldn't also pause
        this.search.blur();
        this.toggle(false);
      }
    });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
    else this.search.blur();
    this.onToggle?.(this.open);
  }

  /** The transparent window the 3D preview is drawn into (null when closed). */
  get previewVisible() {
    return this.open;
  }

  // ---- character side ------------------------------------------------------
  private slotEl(slot: Slot, wide = false) {
    const eq = this.player.equip;
    const it = eq.inSlot(slot);
    const d = document.createElement('div');
    d.className = `eqslot${it ? ' r-' + it.def.rarity : ' empty'}${wide ? ' wide' : ''}`;
    const img = it ? `<img src="${wide ? wideIconFor(it.def.id) : iconFor(it.def.id)}" alt="">` : '';
    d.innerHTML = `<div class="ic">${img}</div><div class="tx"><div class="sl">${SLOT_LABEL[slot]}</div><div class="nm">${it ? esc(it.def.name) : 'Empty'}</div></div>`;
    d.title = it ? `${it.def.name}: click to take off` : SLOT_LABEL[slot];
    d.addEventListener('click', () => eq.unequip(slot));
    d.addEventListener('mouseenter', () => it && this.showDetail(it));
    d.addEventListener('dragover', (e) => {
      e.preventDefault();
      d.classList.add('dragover');
    });
    d.addEventListener('dragleave', () => d.classList.remove('dragover'));
    d.addEventListener('drop', (e) => {
      e.preventDefault();
      d.classList.remove('dragover');
      const uid = Number(e.dataTransfer?.getData('text/uid'));
      const item = eq.get(uid);
      if (item && eq.canEquip(item, slot)) eq.equip(uid, slot);
    });
    return d;
  }

  private renderCharacter() {
    const eq = this.player.equip, p = this.player;
    this.armorCol.replaceChildren(...ARMOR_SLOTS.map((s) => this.slotEl(s)));
    this.accCol.replaceChildren(...ACCESSORY_SLOTS.map((s) => this.slotEl(s)));
    this.weaponRow.replaceChildren(this.slotEl('main', true), this.slotEl('off', true));
    const block = eq.hasShield ? `${eq.offItem!.def.stats.block ?? 0}%` : '—';
    this.summary.innerHTML = `
      <span><b>${eq.mainWeapon?.def.stats.damage ?? 0}${eq.dualWield ? ' + ' + (eq.offItem?.def.stats.damage ?? 0) : ''}</b>Attack</span>
      <span><b>${eq.armorValue}</b>Armour</span>
      <span><b>${eq.poise}</b>Poise</span>
      <span><b>${block}</b>Block</span>
      <span><b>${Math.ceil(p.hp)}/${p.maxHp}</b>Health</span>
      <span><b>${DISC[p.paths.active]?.name ?? 'Untrained'}</b>Class</span>`;
    this.goldEl.innerHTML = `<b>${p.prog.gold.toLocaleString()}</b> gold`;
    this.quickRow.replaceChildren(
      ...eq.quick.map((uid, i) => {
        const it = eq.get(uid);
        const q = document.createElement('div');
        q.className = 'qslot';
        q.innerHTML = `<span class="key">${i + 1}</span>${it ? `<img src="${iconFor(it.def.id)}" alt=""><span class="qty">${it.qty}</span>` : ''}`;
        q.title = it ? `${it.def.name}: click to clear` : 'Empty quick slot';
        q.addEventListener('dragover', (e) => e.preventDefault());
        q.addEventListener('drop', (e) => {
          e.preventDefault();
          const u = Number(e.dataTransfer?.getData('text/uid'));
          if (u) this.onQuickDrop?.(i, u);
          this.render();
        });
        q.addEventListener('click', () => {
          eq.quick[i] = null;
          events.emit('equipmentChanged', {});
        });
        return q;
      }),
    );
  }

  // ---- the bag -----------------------------------------------------------------
  render() {
    this.renderCharacter();
    this.el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === this.view));
    this.bagBody.classList.toggle('hidden', this.view !== 'items');
    this.stats.classList.toggle('hidden', this.view !== 'stats');
    this.search.style.visibility = this.sortSel.style.visibility = this.view === 'items' ? '' : 'hidden';
    if (this.view === 'items') this.renderBag();
    else this.renderStats();
  }

  private visibleItems() {
    const eq = this.player.equip;
    const kinds = CATEGORIES.find((c) => c[0] === this.cat)![3];
    const order = new Map(eq.items.map((it, i) => [it.uid, i]));
    const list = eq.items.filter((it) => (!kinds.length || kinds.includes(it.def.kind)) && (!this.query || it.def.name.toLowerCase().includes(this.query) || it.def.desc.toLowerCase().includes(this.query)));
    const by: Record<Sort, (a: ItemInstance, b: ItemInstance) => number> = {
      recent: (a, b) => order.get(b.uid)! - order.get(a.uid)!,
      name: (a, b) => a.def.name.localeCompare(b.def.name),
      rarity: (a, b) => RARITY_RANK[a.def.rarity] - RARITY_RANK[b.def.rarity] || a.def.name.localeCompare(b.def.name),
      type: (a, b) => KIND_RANK[a.def.kind] - KIND_RANK[b.def.kind] || a.def.name.localeCompare(b.def.name),
    };
    return list.sort(by[this.sort]);
  }

  private renderBag() {
    const eq = this.player.equip;
    this.countEl.textContent = `${eq.items.length} ${eq.items.length === 1 ? 'item' : 'items'}`;
    // Categories with counts (empty ones stay listed but dimmed).
    this.cats.innerHTML = CATEGORIES.map(([id, label, glyph, kinds]) => {
      const n = kinds.length ? eq.items.filter((it) => kinds.includes(it.def.kind)).length : eq.items.length;
      return `<button class="cat${this.cat === id ? ' on' : ''}${n ? '' : ' empty'}" data-cat="${id}"><i>${glyph}</i><span>${label}</span><b>${n}</b></button>`;
    }).join('');
    this.cats.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        this.cat = b.dataset.cat as Category;
        this.renderBag();
      }),
    );
    const items = this.visibleItems();
    this.grid.replaceChildren();
    if (!items.length) {
      this.grid.innerHTML = `<p class="inv-empty">${this.query ? 'Nothing in your bag matches that.' : 'Nothing here yet.'}</p>`;
    }
    for (const it of items) {
      const slot = eq.slotOf(it.uid);
      const onBar = eq.moves.includes(it.uid) || eq.quick.includes(it.uid) || eq.activeSpell === it.uid;
      const tag = slot ? (slot === 'main' ? 'MAIN' : slot === 'off' ? 'OFF HAND' : 'WORN') : onBar ? 'ON BAR' : '';
      const d = document.createElement('div');
      d.className = `item r-${it.def.rarity}${this.selected === it.uid ? ' sel' : ''}${slot ? ' worn' : ''}`;
      d.dataset.kind = it.def.kind;
      d.dataset.id = it.def.id;
      d.draggable = true;
      d.innerHTML = `<img src="${iconFor(it.def.id)}" alt="" draggable="false">${tag ? `<span class="eq">${tag}</span>` : ''}${it.def.stack ? `<span class="qty">${it.qty}</span>` : ''}<span class="item-name">${esc(it.def.name)}</span>`;
      d.addEventListener('click', (e) => {
        this.selected = it.uid;
        this.primaryAction(it, e.shiftKey);
      });
      d.addEventListener('mouseenter', () => this.showDetail(it));
      d.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/uid', String(it.uid)));
      this.grid.appendChild(d);
    }
    const sel = this.selected !== null ? eq.get(this.selected) : undefined;
    this.showDetail(sel ?? items[0]);
  }

  /** What clicking a card does: equip, take off, use or ready it. */
  private primaryAction(it: ItemInstance, alt = false) {
    const eq = this.player.equip;
    const slot = eq.slotOf(it.uid);
    if (it.def.kind === 'consumable') this.player.useConsumable(it.uid);
    else if (it.def.kind === 'spell') eq.equip(it.uid);
    else if (slot) eq.unequip(slot);
    else if (it.def.kind !== 'material' && it.def.kind !== 'key') eq.equip(it.uid, it.def.kind === 'sword' && alt ? 'off' : undefined);
    events.emit('equipmentChanged', {});
    this.render();
  }

  /** The worn item this one would replace (for the comparison). */
  private wornFor(it: ItemInstance): ItemInstance | undefined {
    const eq = this.player.equip;
    if (eq.slotOf(it.uid)) return undefined;
    const slot: Slot | undefined = it.def.kind === 'sword' ? 'main' : it.def.kind === 'shield' ? 'off' : it.def.slot;
    return slot ? eq.inSlot(slot) : undefined;
  }

  private showDetail(it: ItemInstance | undefined) {
    const box = this.detail;
    if (!it) {
      box.innerHTML = '<p class="dim">Select an item to inspect it.</p>';
      return;
    }
    const d = it.def;
    const eq = this.player.equip;
    const worn = this.wornFor(it);
    const labels: Partial<Record<keyof ItemStats, string>> = { ...STAT_NAMES, ...STAT_LABEL };
    const keys = new Set([...Object.keys(d.stats), ...Object.keys(worn?.def.stats ?? {})] as (keyof ItemStats)[]);
    const rows: string[] = [];
    for (const k of keys) {
      if (!labels[k]) continue;
      const v = d.stats[k], w = worn?.def.stats[k];
      if (v === undefined && w === undefined) continue;
      let delta = '';
      if (worn) {
        const diff = (v ?? 0) - (w ?? 0);
        const better = k === 'manaCost' ? diff < 0 : diff > 0;
        if (Math.abs(diff) > 1e-6) delta = `<em class="${better ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${fmtStat(k, Math.abs(diff)).replace('+', '')}</em>`;
      }
      rows.push(`<span>${labels[k]}</span><b>${v === undefined ? '—' : fmtStat(k, v)}${delta}</b>`);
    }
    const slot = eq.slotOf(it.uid);
    const actions: string[] = [];
    if (d.kind === 'consumable') {
      actions.push('<button data-act="use">Use</button>');
      for (let i = 0; i < eq.quick.length; i++) actions.push(`<button data-act="quick" data-slot="${i}" class="small">Quick ${i + 1}</button>`);
    } else if (d.kind === 'spell') actions.push(`<button data-act="use">${eq.activeSpell === it.uid ? 'Attuned (R to cast)' : 'Attune (R to cast)'}</button>`);
    else if (d.kind === 'material' || d.kind === 'key') actions.push(`<span class="dim">${d.kind === 'key' ? 'Kept for a quest.' : 'Used in crafting, cooking and trade.'}</span>`);
    else if (slot) actions.push('<button data-act="use">Take off</button>');
    else {
      actions.push('<button data-act="use">Equip</button>');
      if (d.kind === 'sword') actions.push('<button data-act="off">Equip in off hand</button>');
    }
    box.innerHTML = `
      <div class="dhead"><img class="big" src="${iconFor(d.id)}" alt=""><div><div class="name">${esc(d.name)}</div><div class="rar r-${d.rarity}">${d.rarity} ${d.kind === 'armor' ? 'armour' : d.kind === 'key' ? 'quest item' : d.kind}${d.stack ? ` · ×${it.qty}` : ''}</div></div></div>
      <p>${esc(d.desc)}</p>
      ${rows.length ? `<div class="stats">${rows.join('')}</div>` : ''}
      ${traitLines(d.stats).map((t) => `<div class="trait">✦ ${t}</div>`).join('')}
      ${worn ? `<div class="cmp">Compared with your <b>${esc(worn.def.name)}</b></div>` : slot ? `<div class="cmp">Worn: ${SLOT_LABEL[slot]}</div>` : ''}
      <div class="dact">${actions.join('')}</div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        this.selected = it.uid;
        if (act === 'quick') {
          this.onQuickDrop?.(Number(b.dataset.slot), it.uid);
          this.render();
        } else this.primaryAction(it, act === 'off');
      }),
    );
  }

  private renderStats() {
    const p = this.player, eq = p.equip;
    const rows: [string, string][] = [
      ['Character level', `${p.prog.level}`],
      ['Unspent XP', `${p.prog.xp.toLocaleString()}`],
      ['Attribute points', `${p.paths.attrFree}`],
      ['Gold', `${p.prog.gold}`],
      ['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`],
      ['Stamina', `${Math.ceil(p.stamina)} / ${p.maxStamina}`],
      ['Mana', `${Math.ceil(p.mana)} / ${p.maxMana}`],
      ['Attack', `${eq.mainWeapon?.def.stats.damage ?? 0}`],
      ['Armour', `${eq.armorValue}`],
      ['Poise', `${eq.poise}`],
      ['Stamina regen', `+${Math.round(eq.bonus('staminaRegen') * 100)}%`],
      ['Mana regen', `+${Math.round(eq.bonus('manaRegen') * 100)}%`],
      ['Damage bonus', `+${Math.round(eq.bonus('damagePct') * 100)}%`],
    ];
    this.stats.innerHTML = `<div class="statgrid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
      <p class="lead">Spend XP on classes and callings, and attribute points on Vigor, Might and the rest, on the Skills page (<b>K</b>).</p>`;
  }
}

export function buildOverlays(onStart: (origin: Origin | null) => void, initialOrigin: Origin = 'human', music?: { muted: boolean; setMuted(m: boolean): void }) {
  const root = document.getElementById('ui')!;
  const controls = `
    <div class="controls">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Mouse</kbd> Look</span>
      <span><kbd>Shift</kbd> Sprint · attack while sprinting to lunge</span><span><kbd>Space</kbd> Dodge roll</span>
      <span><kbd>LMB</kbd> Attack · hold for heavy</span><span><kbd>RMB</kbd> Block / off-hand attack</span>
      <span><kbd>F</kbd> Parry</span><span><kbd>MMB</kbd> / <kbd>Q</kbd> Lock on</span>
      <span><kbd>C</kbd> Jump · attack in the air to plunge</span><span><kbd>R</kbd> Cast attuned spell (needs lock-on)</span><span><kbd>V</kbd> Origin ability</span>
      <span><kbd>1</kbd>–<kbd>4</kbd> Quick items · <kbd>Tab</kbd> switches to moves 1–6</span><span><kbd>I</kbd> Inventory · <kbd>K</kbd> Skills</span>
      <span><kbd>E</kbd> Interact (doors, chests, gates)</span><span><kbd>M</kbd> World map · draw the map in dungeons</span>
      <span><kbd>N</kbd> Seamanship · <kbd>B</kbd> hold for the spyglass</span><span>At a ship's helm: <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>W</kbd>/<kbd>S</kbd> sail · <kbd>L</kbd> lash the wheel</span>
    </div>`;
  const start = document.createElement('div');
  start.className = 'overlay';
  start.innerHTML = `<div class="title-card"><div class="pause-banner">THE WORLD WAITS</div><h1>ELDERGLEN TOWN</h1><div class="pause-status"></div><p class="sub">A thriving frontier town. Choose your origin, shape your Heroic Legacy, take Guild contracts, and explore beyond the walls.</p>
  <div class="origin-picker creator-launch"><span>Six peoples · your face, build and colours · a name: the character creator opens when you begin.</span></div>
  <span class="cta">CLICK TO BEGIN</span><p class="mobile-note">Best played with a keyboard and mouse on a larger screen.</p>${controls}</div>`;
  root.appendChild(start);
  const selectedOrigin = initialOrigin;
  const help = document.createElement('div');
  help.className = 'overlay hidden';
  help.innerHTML = `<div class="title-card"><h1>CONTROLS</h1><p class="sub">Parry a slime's leap with good timing to stagger it, then strike for a critical riposte.</p>${controls}<p class="sub" style="margin-top:22px">Press H or click to close</p></div>`;
  root.appendChild(help);
  // The origin is chosen once, when a new game begins: never on the pause
  // screen, and not when continuing a saved character.
  const picker = start.querySelector('.origin-picker') as HTMLElement;
  let originLocked = false;
  const lockOrigin = () => {
    originLocked = true;
    picker.style.display = 'none';
  };
  start.addEventListener('click', () => {
    // A new game opens the character creator (ui/creator.ts) first.
    if (!originLocked && api.creator) {
      api.creator(() => {
        start.classList.add('hidden');
        onStart(null);
        lockOrigin();
      });
      return;
    }
    start.classList.add('hidden');
    onStart(originLocked ? null : selectedOrigin);
    lockOrigin();
  });
  // Title/pause screen buttons: music on/off everywhere, plus Quit and fullscreen in the desktop build.
  const desktop = (window as any).desktop as { quit(): void; toggleFullscreen(): void } | undefined;
  const row = document.createElement('div');
  row.className = 'desk-row';
  const musicLabel = () => (music?.muted ? 'Music: Off' : 'Music: On');
  if (music) row.innerHTML = `<button data-a="music">${musicLabel()}</button>`;
  if (desktop) row.innerHTML += '<button data-a="fs">Toggle fullscreen (F11)</button><button data-a="quit">Quit game</button>';
  row.addEventListener('click', (e) => {
    const btn = e.target as HTMLElement;
    const a = btn.dataset.a;
    if (!a) return;
    e.stopPropagation();
    if (a === 'music' && music) {
      music.setMuted(!music.muted);
      btn.textContent = musicLabel();
    } else if (a === 'quit') desktop?.quit();
    else if (a === 'fs') desktop?.toggleFullscreen();
  });
  if (row.childElementCount) start.querySelector('.title-card')!.appendChild(row);
  help.addEventListener('click', () => help.classList.add('hidden'));
  const api = {
    /** opens the character creator; it calls `begin` when the hero is made */
    creator: undefined as ((begin: () => void) => void) | undefined,
    start,
    help,
    showPaused(show: boolean, status = '') {
      start.classList.toggle('paused', show);
      start.querySelector('.pause-status')!.innerHTML = status;
      const title = start.querySelector('h1')!;
      const sub = start.querySelector('.sub')!;
      const cta = start.querySelector('.cta')!;
      const controlsEl = start.querySelector('.controls') as HTMLElement | null;
      if (show) {
        title.textContent = 'PAUSED';
        sub.textContent = 'The world is frozen. Resume when you are ready.';
        cta.textContent = 'RESUME';
        controlsEl?.classList.remove('pause-hide');
      } else {
        title.textContent = 'THE TRAINING GROUNDS';
        sub.textContent = 'A living fantasy world. Learn from its people before you master its power.';
        cta.textContent = 'CLICK TO BEGIN';
        controlsEl?.classList.remove('pause-hide');
      }
      start.classList.toggle('hidden', !show);
    },
    toggleHelp() {
      help.classList.toggle('hidden');
    },
    lockOrigin,
  };
  return api;
}
