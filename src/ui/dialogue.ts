// Conversation box: speaker, text that types itself out, and numbered replies.
// Long speeches are broken into pages, a few sentences at a time: between
// pages you answer with a short line ("Go on.", "I see.") and the real
// replies only appear once the speaker has had their whole say. While the
// text is still typing, a click or key only finishes the sentence.

/** The tone of a reply (shown as a little chip before it). */
export type Tone = 'kind' | 'neutral' | 'rude' | 'threat' | 'persuade' | 'bribe' | 'gift';
const TONE_NAME: Record<Tone, string> = { kind: 'Kind', neutral: 'Neutral', rude: 'Rude', threat: 'Threaten', persuade: 'Persuade', bribe: 'Bribe', gift: 'Gift' };

export interface DialogueOption {
  label: string;
  run: () => void; // usually says something else, or closes
  tone?: Tone;
  /** a quest step this person is waiting on: talking to them goes straight into it */
  auto?: boolean;
}

/** About how much one page holds (a page never breaks a sentence). */
const PAGE_CHARS = 210;

/**
 * Split a speech into pages: paragraphs stay apart, and a long paragraph
 * is cut between sentences once a page has about PAGE_CHARS in it.
 */
export function paginate(text: string, max = PAGE_CHARS): string[] {
  const pages: string[] = [];
  for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= max * 1.25) {
      pages.push(para);
      continue;
    }
    // Sentences, keeping their closing quotes/brackets; a stage direction "(...)" stays whole.
    const parts = para.match(/\([^)]*\)\s*|[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [para];
    let cur = '';
    for (const s of parts) {
      if (cur && cur.length + s.length > max) {
        pages.push(cur.trim());
        cur = '';
      }
      cur += s;
    }
    if (cur.trim()) pages.push(cur.trim());
  }
  return pages.length ? pages : [text];
}

/** What you say to let them keep talking (picked by the page, so it varies). */
const NUDGE = ['Go on.', 'I see.', 'And?', 'Mm.', 'Right.', 'Go on…', 'Continue.', 'Understood.'];
const nudgeFor = (page: string, k: number) => {
  if (/\?["'”’)]*$/.test(page)) return ['Hm…', 'Let me hear the rest.', 'Go on.'][k % 3];
  if (/!["'”’)]*$/.test(page)) return ['Easy. Go on.', 'All right, all right.', 'I\'m listening.'][k % 3];
  let h = k * 7;
  for (let i = 0; i < page.length; i += 9) h = (h * 31 + page.charCodeAt(i)) >>> 0;
  return NUDGE[h % NUDGE.length];
};

export class DialogueUI {
  private el: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private optsEl: HTMLDivElement;
  private pageEl: HTMLDivElement;
  private full = '';
  private shown = 0;
  private pages: string[] = [];
  private page = 0;
  private replies: DialogueOption[] = [];
  /** the buttons on screen now: the replies on the last page, a nudge before it */
  private options: DialogueOption[] = [];
  open = false;
  /** break long speeches into pages (tests turn it off to reach the replies at once) */
  paging = true;
  onToggle?: (open: boolean) => void;

  constructor() {
    const root = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'dialogue hidden';
    this.el.innerHTML = '<div class="who"></div><div class="say"></div><div class="more">click to continue</div><div class="page"></div><div class="opts"></div>';
    root.appendChild(this.el);
    this.nameEl = this.el.querySelector('.who')!;
    this.textEl = this.el.querySelector('.say')!;
    this.optsEl = this.el.querySelector('.opts')!;
    this.pageEl = this.el.querySelector('.page')!;
    this.el.addEventListener('click', () => {
      if (this.typing) this.skip();
      else if (this.midSpeech) this.next();
    });
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
        else if (this.midSpeech) this.next();
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
    this.pages = this.paging ? paginate(text) : [text];
    this.page = 0;
    this.replies = options;
    this.showPage();
    if (!this.open) {
      this.open = true;
      this.el.classList.remove('hidden');
      this.onToggle?.(true);
    }
  }

  /** more pages to come before the replies */
  get midSpeech() {
    return this.page < this.pages.length - 1;
  }

  /** the whole speech on screen (all pages), for tests and the talk timer */
  get text() {
    return this.pages.join('\n\n');
  }

  private next() {
    if (!this.midSpeech) return;
    this.page++;
    this.showPage();
  }

  private showPage() {
    this.full = this.pages[this.page];
    this.shown = 0;
    this.textEl.textContent = '';
    const n = this.pages.length;
    this.pageEl.innerHTML = n > 1 ? this.pages.map((_, i) => `<i class="${i === this.page ? 'on' : i < this.page ? 'seen' : ''}"></i>`).join('') : '';
    this.options = this.midSpeech ? [{ label: nudgeFor(this.full, this.page), run: () => this.next() }] : this.replies;
    this.optsEl.innerHTML = '';
    this.optsEl.classList.toggle('nudge', this.midSpeech);
    this.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${this.midSpeech ? '▸' : i + 1}</kbd>${o.tone ? `<span class="tone tone-${o.tone}">${TONE_NAME[o.tone]}</span>` : ''}${o.label}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.typing) this.skip();
        else o.run();
      });
      this.optsEl.appendChild(b);
    });
    this.el.classList.add('typing');
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
