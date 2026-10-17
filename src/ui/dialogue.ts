// Conversation box: speaker, text that types itself out, and numbered replies.
// While the text is still typing, a click or key only finishes the sentence:
// the replies appear (and become clickable) once the NPC has had their say.

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
    this.el.innerHTML = '<div class="who"></div><div class="say"></div><div class="more">click to continue</div><div class="opts"></div>';
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
        if (!o) return;
        e.stopImmediatePropagation();
        if (this.typing) this.skip();
        else o.run();
      } else if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        e.stopImmediatePropagation();
        if (this.typing) this.skip();
        else if (this.options.length === 1) this.options[0].run(); // a lone "Farewell." / "Back."
      }
    }, true);
  }

  /** who is speaking right now (NPCs keep talking while their words type out) */
  speaker = '';

  show(name: string, title: string, text: string, options: DialogueOption[]) {
    this.speaker = name;
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
        if (this.typing) this.skip();
        else o.run();
      });
      this.optsEl.appendChild(b);
    });
    this.el.classList.add('typing');
    if (!this.open) {
      this.open = true;
      this.el.classList.remove('hidden');
      this.onToggle?.(true);
    }
  }

  get typing() {
    return this.shown < this.full.length;
  }

  private skip() {
    this.shown = this.full.length;
    this.textEl.textContent = this.full;
    this.el.classList.remove('typing');
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
    this.el.classList.toggle('typing', this.typing);
  }
}
