// Conversation box: speaker, text that types itself out, and numbered replies.
// While the text is still typing, a click or key only finishes the sentence:
// the replies appear (and become clickable) once the NPC has had their say.

/** The tone of a reply (shown as a little chip before it). */
export type Tone = 'kind' | 'neutral' | 'rude' | 'threat' | 'persuade' | 'bribe' | 'gift';
const TONE_NAME: Record<Tone, string> = { kind: 'Kind', neutral: 'Neutral', rude: 'Rude', threat: 'Threaten', persuade: 'Persuade', bribe: 'Bribe', gift: 'Gift' };

export interface DialogueOption {
  label: string;
  run: () => void; // usually says something else, or closes
  tone?: Tone;
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
  /** how the speaker feels about you (shown beside their name while it's them talking) */
  mood: { speaker: string; label: string; cls: string } | null = null;

  show(name: string, title: string, text: string, options: DialogueOption[]) {
    this.speaker = name;
    const m = this.mood?.speaker === name ? this.mood : null;
    this.nameEl.innerHTML = `${name}<small>${title}</small>${m ? `<span class="mood mood-${m.cls}">${m.label}</span>` : ''}`;
    this.full = text;
    this.shown = 0;
    this.options = options;
    this.textEl.textContent = '';
    this.optsEl.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${i + 1}</kbd>${o.tone ? `<span class="tone tone-${o.tone}">${TONE_NAME[o.tone]}</span>` : ''}${o.label}`;
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
