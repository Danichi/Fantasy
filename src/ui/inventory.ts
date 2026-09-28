import type { Player } from '../player/player';
import { ARMOR_SLOTS, ACCESSORY_SLOTS, STAT_LABEL, type ItemKind, type ItemStats, type Slot } from '../items/itemDefs';
import type { ItemInstance } from '../items/equipment';
import { events } from '../core/events';
import { iconFor, wideIconFor } from './icons';
import type { CharPreview } from './charPreview';
import { COMBAT_STYLES, styleIds, type CombatStyleId } from '../progression/styles';

// Inventory & equipment screen (I).
//   left:   armour slots          centre: live 3D character + weapons + summary
//   right:  accessories, quick items
//   far:    tabs (Items / Skills / Stats) with the item grid and details
// Click an item to equip it (Shift-click a sword for the off hand), click an
// equipped slot to take it off, or drag items onto slots and the HUD bar.

const SLOT_LABEL: Record<Slot, string> = {
  main: 'Main hand', off: 'Off hand', head: 'Head', shoulders: 'Shoulders', chest: 'Chest', cloak: 'Cloak',
  hands: 'Hands', legs: 'Legs', feet: 'Feet', amulet: 'Amulet', ring1: 'Ring', ring2: 'Ring', belt: 'Belt', trinket: 'Trinket',
};

type Tab = 'items' | 'skills' | 'stats';
type Filter = 'all' | 'weapons' | 'armour' | 'accessories' | 'magic' | 'consumables';
const FILTERS: [Filter, string, ItemKind[]][] = [
  ['all', 'All', []],
  ['weapons', 'Weapons', ['sword', 'shield']],
  ['armour', 'Armour', ['armor']],
  ['accessories', 'Accessories', ['accessory']],
  ['magic', 'Magic', ['spell']],
  ['consumables', 'Usables', ['consumable']],
];



function fmtStat(k: keyof ItemStats, v: number) {
  if (k === 'staminaRegen' || k === 'manaRegen' || k === 'damagePct') return `+${Math.round(v * 100)}%`;
  if (k === 'speed') return `${Math.round(v * 100)}%`;
  if (k === 'block') return `${v}%`;
  if (k === 'stability') return `${Math.round(v * 100)}`;
  return `${v > 0 && k.startsWith('max') ? '+' : ''}${v}`;
}

export class InventoryUI {
  readonly el: HTMLDivElement;
  private armorCol: HTMLDivElement;
  private accCol: HTMLDivElement;
  private weaponRow: HTMLDivElement;
  private summary: HTMLDivElement;
  private body: HTMLDivElement;
  private tabs: HTMLDivElement;
  private tab: Tab = 'items';
  private filter: Filter = 'all';
  private hovered: ItemInstance | undefined;
  private skillStyle: CombatStyleId = 'swordsman';
  open = false;
  onToggle?: (open: boolean) => void;
  onQuickDrop?: (slot: number, uid: number) => void;

  constructor(private player: Player, preview: CharPreview) {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'inventory hidden';
    this.el.innerHTML = `
      <section class="inv-col armor"><h2>ARMOUR</h2><div class="slots"></div></section>
      <section class="inv-center">
        <div class="preview-frame"><div class="preview"></div><span class="rot-hint">Drag to rotate</span></div>
        <div class="weapons"></div>
        <div class="summary"></div>
      </section>
      <section class="inv-col acc"><h2>ACCESSORIES</h2><div class="slots"></div></section>
      <section class="inv-main"><div class="tabs"></div><div class="body"></div></section>
      <div class="inv-help">Click to equip · <b>Shift-click</b> a sword for the off hand · Click an equipped slot to remove it · Drag items onto slots or the HUD bar · <b>I</b> / <b>Esc</b> to close</div>`;
    root.appendChild(this.el);
    this.armorCol = this.el.querySelector('.armor .slots')!;
    this.accCol = this.el.querySelector('.acc .slots')!;
    this.weaponRow = this.el.querySelector('.weapons')!;
    this.summary = this.el.querySelector('.summary')!;
    this.body = this.el.querySelector('.inv-main .body')!;
    this.tabs = this.el.querySelector('.inv-main .tabs')!;
    preview.bind(this.el.querySelector('.preview')!);
    events.on('equipmentChanged', () => this.open && this.render());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) {
        e.stopImmediatePropagation(); // closing the inventory shouldn't also pause
        this.toggle(false);
      }
    });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
    this.onToggle?.(this.open);
  }

  /** The transparent window the 3D preview is drawn into (null when closed). */
  get previewVisible() {
    return this.open;
  }

  // ---- slots ----------------------------------------------------------------
  private slotEl(slot: Slot, wide = false) {
    const eq = this.player.equip;
    const it = eq.inSlot(slot);
    const d = document.createElement('div');
    d.className = `eqslot${it ? '' : ' empty'}${wide ? ' wide' : ''}`;
    const img = it ? `<img src="${wide ? wideIconFor(it.def.id) : iconFor(it.def.id)}" alt="">` : '';
    d.innerHTML = `<div class="ic">${img}</div><div class="tx"><div class="sl">${SLOT_LABEL[slot]}</div><div class="nm">${it?.def.name ?? 'Empty'}</div></div>`;
    d.addEventListener('click', () => eq.unequip(slot));
    d.addEventListener('mouseenter', () => this.showDetail(it));
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

  render() {
    const eq = this.player.equip;
    const p = this.player;
    this.armorCol.replaceChildren(...ARMOR_SLOTS.map((s) => this.slotEl(s)));
    this.accCol.replaceChildren(...ACCESSORY_SLOTS.map((s) => this.slotEl(s)));
    // Quick items under the accessories.
    const qh = document.createElement('h2');
    qh.textContent = 'QUICK ITEMS';
    const quick = document.createElement('div');
    quick.className = 'quickrow';
    eq.quick.forEach((uid, i) => {
      const it = eq.get(uid);
      const q = document.createElement('div');
      q.className = 'qslot';
      q.innerHTML = `<span class="key">${i + 1}</span>${it ? `<img src="${iconFor(it.def.id)}" alt=""><span class="qty">${it.qty}</span>` : ''}`;
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
      quick.appendChild(q);
    });
    this.accCol.append(qh, quick);

    this.weaponRow.replaceChildren(this.slotEl('main', true), this.slotEl('off', true));
    const block = eq.hasShield ? `${eq.offItem!.def.stats.block ?? 0}%` : '—';
    this.summary.innerHTML = `
      <span><b>${eq.mainWeapon?.def.stats.damage ?? 0}${eq.dualWield ? ' + ' + (eq.offItem?.def.stats.damage ?? 0) : ''}</b>Attack</span>
      <span><b>${eq.armorValue}</b>Armour</span>
      <span><b>${eq.poise}</b>Poise</span>
      <span><b>${block}</b>Block</span>
      <span><b>${Math.ceil(p.hp)}/${p.maxHp}</b>Health</span>
      <span><b>${p.prog.activeStyle ? COMBAT_STYLES[p.prog.activeStyle].name : 'Untrained'}</b>Style</span>`;

    this.tabs.innerHTML = '';
    for (const [id, label] of [['items', 'ITEMS'], ['skills', 'SKILLS'], ['stats', 'STATS']] as [Tab, string][]) {
      const b = document.createElement('button');
      b.className = 'tab' + (this.tab === id ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.tabs.appendChild(b);
    }
    if (this.tab === 'items') this.renderItems();
    else if (this.tab === 'skills') this.renderSkills();
    else this.renderStats();
  }

  private kindGlyph(kind: ItemKind) {
    return kind === 'sword' ? '⚔' : kind === 'shield' ? '◈' : kind === 'armor' ? '⬟' : kind === 'accessory' ? '◇' : kind === 'spell' ? '✦' : kind === 'consumable' ? '●' : '⌘';
  }

  private renderItems() {
    const eq = this.player.equip;
    const filters = FILTERS.map(([id, label]) => `<button class="chip${this.filter === id ? ' on' : ''}" data-f="${id}">${label}</button>`).join('');
    this.body.innerHTML = `<div class="chips">${filters}</div><div class="grid"></div><div class="detail"></div>`;
    this.body.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) =>
      b.addEventListener('click', () => {
        this.filter = b.dataset.f as Filter;
        this.renderItems();
      }),
    );
    const grid = this.body.querySelector('.grid')!;
    const kinds = FILTERS.find((f) => f[0] === this.filter)![2];
    for (const it of eq.items) {
      if (kinds.length && !kinds.includes(it.def.kind)) continue;
      const d = document.createElement('div');
      const slot = eq.slotOf(it.uid);
      const onBar = eq.moves.includes(it.uid) || eq.quick.includes(it.uid);
      const tag = slot ? (slot === 'main' ? 'MAIN' : slot === 'off' ? 'OFF' : 'WORN') : onBar ? 'ON BAR' : '';
      d.className = `item r-${it.def.rarity}`;
      d.dataset.kind = it.def.kind;
      d.dataset.id = it.def.id;
      d.draggable = true;
      d.innerHTML = `<span class="kind-glyph">${this.kindGlyph(it.def.kind)}</span><img src="${iconFor(it.def.id)}" alt="" draggable="false">${tag ? `<span class="eq">${tag}</span>` : ''}${it.def.stack ? `<span class="qty">${it.qty}</span>` : ''}<span class="item-name">${it.def.name}</span>`;
      d.title = it.def.name;
      d.addEventListener('click', (e) => {
        if (it.def.kind === 'consumable') {
          this.player.useConsumable(it.uid);
          this.render();
          return;
        }
        if (it.def.kind === 'spell') {
          eq.equip(it.uid);
          this.render();
          return;
        }
        if (slot) {
          eq.unequip(slot);
          return;
        }
        eq.equip(it.uid, it.def.kind === 'sword' && e.shiftKey ? 'off' : undefined);
      });
      d.addEventListener('mouseenter', () => this.showDetail(it));
      d.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/uid', String(it.uid)));
      grid.appendChild(d);
    }
    this.showDetail(this.hovered);
  }

  private renderSkills() {
    const prog = this.player.prog;
    const selected = COMBAT_STYLES[this.skillStyle];
    const learned = prog.learnedStyles.includes(this.skillStyle);
    const styleCards = styleIds.map((id) => {
      const s = COMBAT_STYLES[id];
      const on = prog.activeStyle === id;
      const known = prog.knowsStyle(id);
      return `<button class="style-card ${known ? 'known' : 'locked'} ${on ? 'active' : ''}" data-style="${id}">
        <span class="style-orb" style="--style:${s.color}"></span>
        <b>${s.name}</b><small>${known ? (on ? 'ACTIVE STYLE' : 'LEARNED') : `TRAIN WITH ${s.trainer.toUpperCase()}`}</small>
      </button>`;
    }).join('');

    const nodes = selected.nodes.map((node, i) => {
      const owned = prog.hasSkill(selected.id, node.id);
      const prereq = node.requires?.every((r) => prog.hasSkill(selected.id, r)) ?? true;
      const canBuy = learned && !owned && prereq && prog.skillPoints >= node.cost;
      const lockedReason = !learned ? `Train with ${selected.trainer}` : !prereq ? 'Prerequisite required' : prog.skillPoints < node.cost ? 'Need more skill points' : 'Unlock';
      return `<button class="skill-node ${owned ? 'owned' : ''} ${canBuy ? 'available' : ''}" data-skill="${node.id}" title="${node.desc}">
        <span class="node-num">${String(i + 1).padStart(2, '0')}</span>
        <b>${node.name}</b>
        <small>${owned ? 'MASTERED' : lockedReason}</small>
        <p>${node.desc}</p>
        <em>${node.cost} SP</em>
      </button>`;
    }).join('');

    const switcher = prog.knowsStyle(selected.id)
      ? `<button class="style-switch ${prog.activeStyle === selected.id ? 'active' : ''}" data-switch="${selected.id}" ${!prog.canSwapStyles() || prog.activeStyle === selected.id ? 'disabled' : ''}>
          ${prog.activeStyle === selected.id ? 'ACTIVE' : prog.canSwapStyles() ? 'SET ACTIVE' : `SWITCH UNLOCKS AT LEVEL ${12}`}
        </button>`
      : `<div class="style-lock">Train with ${selected.trainer} to learn this combat style.</div>`;

    this.body.innerHTML = `
      <div class="style-head">
        <div><span class="eyebrow">COMBAT STYLES</span><h3>${selected.name}</h3><p>${selected.short}</p></div>
        <div class="sp-badge"><small>SKILL POINTS</small><b>${prog.skillPoints}</b></div>
      </div>
      <div class="style-cards">${styleCards}</div>
      <div class="tree-shell">
        <div class="tree-line"></div>
        <div class="skill-tree">${nodes}</div>
      </div>
      <div class="style-footer">${switcher}<span>${prog.styleSwapUnlocked ? 'Style switching is unlocked.' : 'Combat style swapping is restricted until level 12.'}</span></div>`;

    this.body.querySelectorAll<HTMLButtonElement>('.style-card').forEach((b) => {
      b.addEventListener('click', () => {
        this.skillStyle = b.dataset.style as CombatStyleId;
        this.renderSkills();
      });
    });

    this.body.querySelectorAll<HTMLButtonElement>('.skill-node').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.skill!;
        if (prog.unlockSkill(selected.id, id)) {
          this.renderSkills();
        } else {
          const node = selected.nodes.find((n) => n.id === id)!;
          const reason = !learned ? `Train with ${selected.trainer} first.` : !(node.requires?.every((r) => prog.hasSkill(selected.id, r)) ?? true) ? 'Unlock the prerequisite nodes first.' : 'You need more skill points.';
          const toast = document.querySelector('.toast') as HTMLElement | null;
          if (toast) {
            toast.textContent = reason;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1800);
          }
        }
      });
    });

    const switchButton = this.body.querySelector<HTMLButtonElement>('[data-switch]');
    switchButton?.addEventListener('click', () => {
      if (prog.setActiveStyle(switchButton.dataset.switch as CombatStyleId)) this.renderSkills();
    });
  }

  private renderStats() {
    const p = this.player, eq = p.equip;
    const rows: [string, string][] = [
      ['Level', `${p.prog.level}`],
      ['Experience', `${p.prog.xp} / ${p.prog.next}`],
      ['Gold', `${p.prog.gold}`],
      ['Skill points', `${p.prog.skillPoints}`],
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
    this.body.innerHTML = `<div class="statgrid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
  }

  private showDetail(it: ItemInstance | undefined) {
    this.hovered = it;
    const box = this.body.querySelector('.detail');
    if (!box) return;
    if (!it) {
      box.innerHTML = '<p class="dim">Hover an item to inspect it.</p>';
      return;
    }
    const d = it.def;
    const rows: string[] = [];
    const labels: Partial<Record<keyof ItemStats, string>> = {
      damage: 'Damage', speed: 'Speed', block: 'Block', stability: 'Stability', armor: 'Armour', poise: 'Poise',
      manaCost: 'Mana cost', heal: 'Restores HP', restoreMana: 'Restores MP', ...STAT_LABEL,
    };
    for (const [k, v] of Object.entries(d.stats) as [keyof ItemStats, number][]) {
      if (v === undefined || !labels[k]) continue;
      rows.push(`<span>${labels[k]}</span><b>${fmtStat(k, v)}</b>`);
    }
    const how =
      d.kind === 'sword' ? 'Click: main hand · Shift-click: off hand (dual wield)' :
      d.kind === 'shield' ? 'Click: off hand · RMB block · F parry' :
      d.kind === 'spell' ? 'Drag onto the moveset bar (Tab) · offensive spells need a lock-on' :
      d.kind === 'consumable' ? 'Drag onto a quick slot (keys 1-4)' : 'Click to wear';
    box.innerHTML = `
      <img class="big" src="${iconFor(d.id)}" alt="">
      <div class="dtext"><div class="name">${d.name}</div><div class="rar r-${d.rarity}">${d.rarity} ${d.kind === 'armor' ? 'armour' : d.kind}</div>
      <p>${d.desc}</p><div class="stats">${rows.join('')}</div><div class="how">${how}</div></div>`;
  }
}

export function buildOverlays(onStart: () => void) {
  const root = document.getElementById('ui')!;
  const controls = `
    <div class="controls">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Mouse</kbd> Look</span>
      <span><kbd>Shift</kbd> Sprint · attack while sprinting to lunge</span><span><kbd>Space</kbd> Dodge roll</span>
      <span><kbd>LMB</kbd> Attack · hold for heavy</span><span><kbd>RMB</kbd> Block / off-hand attack</span>
      <span><kbd>F</kbd> Parry</span><span><kbd>MMB</kbd> / <kbd>Q</kbd> Lock on</span>
      <span><kbd>C</kbd> Jump · attack in the air to plunge</span><span><kbd>R</kbd> Cast attuned spell (needs lock-on)</span>
      <span><kbd>1</kbd>–<kbd>4</kbd> Quick items · <kbd>Tab</kbd> switches to moves 1–6</span><span><kbd>I</kbd> Inventory</span>
      <span><kbd>E</kbd> Interact (doors, chests, gates)</span><span><kbd>M</kbd> Draw the dungeon map</span>
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
  // Desktop build: Quit and fullscreen buttons on the title/pause screen.
  const desktop = (window as any).desktop as { quit(): void; toggleFullscreen(): void } | undefined;
  if (desktop) {
    const row = document.createElement('div');
    row.className = 'desk-row';
    row.innerHTML = '<button data-a="fs">Toggle fullscreen (F11)</button><button data-a="quit">Quit game</button>';
    row.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (!a) return;
      e.stopPropagation();
      if (a === 'quit') desktop.quit();
      else desktop.toggleFullscreen();
    });
    start.querySelector('.title-card')!.appendChild(row);
  }
  help.addEventListener('click', () => help.classList.add('hidden'));
  return {
    start,
    help,
    showPaused(show: boolean) {
      const title = start.querySelector('h1')!;
      const sub = start.querySelector('.sub')!;
      const cta = start.querySelector('.cta')!;
      const controlsEl = start.querySelector('.controls') as HTMLElement | null;
      if (show) {
        title.textContent = 'PAUSED';
        sub.textContent = 'The world is frozen. Resume when you are ready.';
        cta.textContent = 'RESUME';
        controlsEl?.classList.add('pause-hide');
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
  };
}
