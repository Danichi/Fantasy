// Conversation box: speaker, text that types itself out, and numbered replies.

export interface DialogueOption {
  label: string;
  run: () => void; // usually says something else, or closes
}

export class DialogueUI {
  private el: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private optsEl: HTMLDivElement;
  private full = '';
  private shown = 0;
  private options: DialogueOption[] = [];
  open = false;
  onToggle?: (open: boolean) => void;

  constructor() {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'dialogue hidden';
    this.el.innerHTML = '<div class="who"></div><div class="say"></div><div class="opts"></div>';
    root.appendChild(this.el);
    this.nameEl = this.el.querySelector('.who')!;
    this.textEl = this.el.querySelector('.say')!;
    this.optsEl = this.el.querySelector('.opts')!;
    this.el.addEventListener('click', () => this.skip());
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        this.close();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const o = this.options[Number(e.code.slice(5)) - 1];
        if (o) {
          e.stopImmediatePropagation();
          o.run();
        }
      } else if (e.code === 'KeyE' || e.code === 'Space') {
        if (this.shown < this.full.length) this.skip();
      }
    }, true);
  }

  show(name: string, title: string, text: string, options: DialogueOption[]) {
    this.nameEl.innerHTML = `${name}<small>${title}</small>`;
    this.full = text;
    this.shown = 0;
    this.options = options;
    this.textEl.textContent = '';
    this.optsEl.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${i + 1}</kbd>${o.label}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        o.run();
      });
      this.optsEl.appendChild(b);
    });
    this.optsEl.style.visibility = 'hidden';
    if (!this.open) {
      this.open = true;
      this.el.classList.remove('hidden');
      this.onToggle?.(true);
    }
  }

  private skip() {
    this.shown = this.full.length;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.onToggle?.(false);
  }

  update(dt: number) {
    if (!this.open) return;
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + dt * 60);
      this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
    }
    this.optsEl.style.visibility = this.shown >= this.full.length ? 'visible' : 'hidden';
  }
}
