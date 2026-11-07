// The adventurer's book: one window for every menu. Four tabs across the top
// (Character, Skills, Journal, Map), each with a few sub-tabs beneath, all in
// the same frame, at the same size and in the same place, so the menus read
// as pages of one book instead of separate screens stacked on the game.
//
// Each page is still built by its own screen (inventory, skills, journal...)
// and keeps its own key (I, K, J, P, O, N, M). While open, the book places
// that screen in its content area and hides the screen's own title, close
// button and inner tabs (the book's header carries those).

export interface BookSub {
  id: string;
  label: string;
  /** the page's own key, shown on the sub-tab */
  key?: string;
  /** the screen's root element, placed in the book's content area (null: the page lays itself out, like the map) */
  el: () => HTMLElement | null;
  /** the game shows through (no dimming veil): the inventory's character preview is drawn on the game canvas */
  see?: boolean;
  isOpen(): boolean;
  open(): void;
  close(): void;
  /** a page you haven't been given yet (the Bestiary before Rook hands it over): its tab stays hidden */
  hidden?(): boolean;
}

export interface BookTab {
  id: string;
  label: string;
  key: string;
  subs: BookSub[];
}

const BOOK_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 6.5c3.8-1.4 7.4-1 11 1.2 3.6-2.2 7.2-2.6 11-1.2v19c-3.8-1.4-7.4-1-11 1.2-3.6-2.2-7.2-2.6-11-1.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 7.7v19" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 11.5c2-.5 3.9-.3 5.6.5M8.5 15.5c2-.5 3.9-.3 5.6.5M18 12c1.7-.8 3.6-1 5.6-.5M18 16c1.7-.8 3.6-1 5.6-.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

export class MenuBook {
  private button: HTMLButtonElement;
  private veil: HTMLDivElement;
  private frame: HTMLDivElement;
  private tabsEl: HTMLDivElement;
  private subsEl: HTMLDivElement;
  /** the last sub-page open on each tab (a tab reopens where you left it) */
  private lastSub = new Map<string, string>();
  private lastTab: string;
  private shown = '';
  private placed: HTMLElement | null = null;

  constructor(private tabs: BookTab[]) {
    const root = document.getElementById('ui')!;
    this.lastTab = tabs[0].id;
    this.button = document.createElement('button');
    this.button.className = 'book-button interactive';
    this.button.title = 'Open your book (I · K · J · M)';
    this.button.innerHTML = `${BOOK_ICON}<span>BOOK</span>`;
    this.button.addEventListener('click', () => this.show(this.lastTab));
    root.appendChild(this.button);

    this.veil = document.createElement('div');
    this.veil.className = 'book-veil hidden';
    root.appendChild(this.veil);

    this.frame = document.createElement('div');
    this.frame.className = 'book-frame interactive hidden';
    this.frame.innerHTML = `
      <div class="bk-head">
        <div class="bk-tabs">${tabs.map((t) => `<button data-tab="${t.id}"><span>${t.label}</span><kbd>${t.key}</kbd></button>`).join('')}</div>
        <button class="bk-close" data-close title="Close (Esc)" aria-label="Close">✕</button>
      </div>
      <div class="bk-subs"></div>
      <div class="bk-body"></div>`;
    this.tabsEl = this.frame.querySelector('.bk-tabs')!;
    this.subsEl = this.frame.querySelector('.bk-subs')!;
    this.frame.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) this.closeAll();
      else if (b.dataset.tab) this.show(b.dataset.tab);
      else if (b.dataset.sub) this.show(this.shownTab()!.id, b.dataset.sub);
    });
    root.appendChild(this.frame);
  }

  private allSubs() {
    return this.tabs.flatMap((t) => t.subs.map((s) => ({ tab: t, sub: s })));
  }

  /** The tab and sub-page open now, if any. */
  private current() {
    return this.allSubs().find((x) => x.sub.isOpen()) ?? null;
  }
  private shownTab() {
    return this.current()?.tab ?? null;
  }

  /**
   * Open a tab (on the sub-page it was last left on, or `sub`), closing
   * whatever other page is open. A page id from the old flat book (`inventory`,
   * `skills`, `people`, `herbal`...) still works: it opens the tab holding it.
   */
  show(id: string, sub?: string) {
    let tab = this.tabs.find((t) => t.id === id);
    if (!tab) {
      const hit = this.allSubs().find((x) => x.sub.id === id);
      if (!hit) return;
      tab = hit.tab;
      sub = hit.sub.id;
    }
    const target = tab.subs.find((s) => s.id === (sub ?? this.lastSub.get(tab!.id)) && !s.hidden?.()) ?? tab.subs[0];
    for (const x of this.allSubs()) if (x.sub !== target && x.sub.isOpen() && x.sub.el() !== target.el()) x.sub.close();
    target.open();
    this.lastTab = tab.id;
    this.lastSub.set(tab.id, target.id);
    this.shown = ''; // re-render the header
    this.update();
  }

  closeAll() {
    for (const x of this.allSubs()) if (x.sub.isOpen()) x.sub.close();
    this.update();
  }

  /** Per frame: show the frame while a page is open, mark its tab and sub-tab, and seat the page in it. */
  update() {
    // A page opened by its own key (K while the inventory is open...) replaces the one showing.
    const open = this.allSubs().filter((x) => x.sub.isOpen());
    if (open.length > 1) {
      const fresh = open.find((x) => `${x.tab.id}/${x.sub.id}` !== this.shown) ?? open[0];
      for (const x of open) if (x !== fresh && x.sub.el() !== fresh.sub.el()) x.sub.close();
    }
    const cur = this.current();
    const hid = cur ? cur.tab.subs.map((s) => (s.hidden?.() ? 1 : 0)).join('') : '';
    const key = cur ? `${cur.tab.id}/${cur.sub.id}/${hid}` : '';
    if (key === this.shown) return;
    this.shown = key;
    const showing = !!cur;
    this.frame.classList.toggle('hidden', !showing);
    this.veil.classList.toggle('hidden', !showing || !!cur?.sub.see);
    this.button.classList.toggle('hidden', showing);
    document.body.classList.toggle('book-open', showing);
    if (!showing) document.body.classList.remove('book-one');
    if (this.placed) this.placed.classList.remove('bk-page');
    this.placed = null;
    if (!cur) return;
    this.lastTab = cur.tab.id;
    this.lastSub.set(cur.tab.id, cur.sub.id);
    this.tabsEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur.tab.id));
    const subs = cur.tab.subs.filter((s) => s === cur.sub || !s.hidden?.());
    this.subsEl.innerHTML = subs.length > 1
      ? subs.map((s) => `<button data-sub="${s.id}" class="${s === cur.sub ? 'on' : ''}">${s.label}${s.key ? `<kbd>${s.key}</kbd>` : ''}</button>`).join('')
      : '';
    this.frame.classList.toggle('one', subs.length <= 1);
    document.body.classList.toggle('book-one', subs.length <= 1);
    const el = cur.sub.el();
    this.frame.classList.toggle('free', !el);
    if (el) {
      el.classList.add('bk-page');
      this.placed = el;
    }
  }

  /** Hide the corner button (title screen, dungeon map editor...). */
  setVisible(v: boolean) {
    this.button.style.display = v ? '' : 'none';
  }
}
