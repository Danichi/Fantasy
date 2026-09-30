// The adventurer's book: one button in the bottom-right corner that opens the
// menus, and a tab strip across the top while any of them is open, so the
// inventory, skills, journal and map read as pages of one book. Each page is
// still its own screen with its own key (I, K, J, M).

export interface BookPage {
  id: string;
  label: string;
  key: string;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

const BOOK_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 6.5c3.8-1.4 7.4-1 11 1.2 3.6-2.2 7.2-2.6 11-1.2v19c-3.8-1.4-7.4-1-11 1.2-3.6-2.2-7.2-2.6-11-1.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 7.7v19" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 11.5c2-.5 3.9-.3 5.6.5M8.5 15.5c2-.5 3.9-.3 5.6.5M18 12c1.7-.8 3.6-1 5.6-.5M18 16c1.7-.8 3.6-1 5.6-.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

export class MenuBook {
  private button: HTMLButtonElement;
  private strip: HTMLDivElement;
  private last: string;
  private shown = '';

  constructor(private pages: BookPage[]) {
    const root = document.getElementById('ui')!;
    this.last = pages[0].id;
    this.button = document.createElement('button');
    this.button.className = 'book-button interactive';
    this.button.title = 'Open your book (I · K · J · M)';
    this.button.innerHTML = `${BOOK_ICON}<span>BOOK</span>`;
    this.button.addEventListener('click', () => this.show(this.last));
    root.appendChild(this.button);

    this.strip = document.createElement('div');
    this.strip.className = 'book-tabs interactive hidden';
    this.strip.innerHTML =
      pages.map((p) => `<button data-page="${p.id}"><span>${p.label}</span><kbd>${p.key}</kbd></button>`).join('') +
      '<button class="book-close" data-close title="Close (Esc)">✕</button>';
    this.strip.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) this.closeAll();
      else if (b.dataset.page) this.show(b.dataset.page);
    });
    root.appendChild(this.strip);
  }

  /** Open one page (closing whichever other page is open). */
  show(id: string) {
    for (const p of this.pages) if (p.id !== id && p.isOpen()) p.close();
    const page = this.pages.find((p) => p.id === id);
    if (page && !page.isOpen()) page.open();
    this.last = id;
    this.update();
  }

  closeAll() {
    for (const p of this.pages) if (p.isOpen()) p.close();
    this.update();
  }

  /** Per frame: show the tab strip while a page is open, and mark it. */
  update() {
    const open = this.pages.find((p) => p.isOpen())?.id ?? '';
    if (open === this.shown) return;
    this.shown = open;
    if (open) this.last = open;
    this.strip.classList.toggle('hidden', !open);
    this.button.classList.toggle('hidden', !!open);
    document.body.classList.toggle('book-open', !!open);
    this.strip.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((b) => b.classList.toggle('on', b.dataset.page === open));
  }

  /** Hide the corner button (title screen, dungeon map editor...). */
  setVisible(v: boolean) {
    this.button.style.display = v ? '' : 'none';
  }
}
