export interface CodexNote {
  title: string;
  body?: string;
  eyebrow?: string;
  footer?: string;
}

/** One folio for canvas hints, native title hints, mouse and keyboard users. */
export class CodexTooltip {
  readonly el: HTMLElement;
  private owner: HTMLElement | null = null;
  private anchor: DOMRect | null = null;
  private native = false;
  private previousDescription: string | null = null;
  private frame = 0;
  private delay = 0;
  private observer: MutationObserver;
  private generatedNames = new WeakMap<HTMLElement, string>();
  constructor() {
    this.el = document.createElement('aside');
    this.el.id = 'codex-tooltip';
    this.el.className = 'codex-tooltip';
    this.el.setAttribute('role', 'tooltip');
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('pointerenter', () => window.clearTimeout(this.delay));
    this.el.addEventListener('pointerleave', () => this.hide());
    // Migrate new titles too: inventories and skill pages rebuild their DOM.
    this.migrate(document.body);
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') this.migrate(r.target as Element);
        else for (const n of r.addedNodes) if (n instanceof Element && !this.el.contains(n)) this.migrate(n);
      }
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title']
    });
    document.addEventListener('pointerover', this.over);
    document.addEventListener('pointerout', this.out);
    document.addEventListener('focusin', this.focus);
    document.addEventListener('focusout', this.blur);
    document.addEventListener('pointerdown', this.dismiss, true);
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('scroll', this.scroll, true);
    document.addEventListener('pointerlockchange', this.dismiss);
    window.addEventListener('resize', this.dismiss);
  }
  private eligible(el: Element): el is HTMLElement {
    return (
      el instanceof HTMLElement &&
      !this.el.contains(el) &&
      !!el.closest('#ui, .sbx, .technique-library, .combat-input-guide, .technique-launcher, .sea-hud, .cold-meter, .lesson-panel')
    );
  }
  private migrate(root: Element) {
    const elements = root.hasAttribute('title') ? [root, ...root.querySelectorAll('[title]')] : [...root.querySelectorAll('[title]')];
    for (const el of elements) {
      if (!this.eligible(el)) continue;
      const title = el.getAttribute('title');
      if (title === null) continue;
      el.removeAttribute('title');
      if (title.trim()) {
        el.dataset.codexTip = title;
        const name = el.getAttribute('aria-label');
        if ((!name || this.generatedNames.get(el) === name) && !/\p{L}/u.test(el.textContent ?? '')) {
          el.setAttribute('aria-label', title);
          this.generatedNames.set(el, title);
        }
        if (this.owner === el && this.native) this.showNative(el);
      } else {
        delete el.dataset.codexTip;
        if (this.generatedNames.get(el) === el.getAttribute('aria-label')) el.removeAttribute('aria-label');
        this.generatedNames.delete(el);
        this.hide(el);
      }
    }
  }
  private target(t: EventTarget | null) {
    if (!(t instanceof Element)) return null;
    const el = t.closest<HTMLElement>('[data-codex-tip], [title]');
    if (!el || !this.eligible(el)) return null;
    if (el.hasAttribute('title')) this.migrate(el);
    return el.dataset.codexTip ? el : null;
  }
  private showNative(owner: HTMLElement) {
    const [title, ...rest] = owner.dataset.codexTip!.split('\n');
    const label =
      owner.getAttribute('aria-label') ||
      [...owner.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(' ')
        .trim();
    const note =
      title.length > 85
        ? {
            title: label && label.length < 55 ? label : 'Field Notes',
            body: [title, ...rest].join('\n')
          }
        : { title, body: rest.join('\n') };
    this.show(owner, note, undefined, true);
  }
  private over = (e: PointerEvent) => {
    if (document.pointerLockElement) return;
    const owner = this.target(e.target);
    if (!owner) return;
    window.clearTimeout(this.delay);
    if (this.owner !== owner) this.showNative(owner);
  };
  private out = (e: PointerEvent) => {
    if (!this.owner || !this.native) return;
    const to = e.relatedTarget;
    if (to instanceof Node && (this.owner.contains(to) || this.el.contains(to))) return;
    this.delay = window.setTimeout(() => this.hide(), 140);
  };
  private focus = (e: FocusEvent) => {
    const owner = this.target(e.target);
    if (owner) this.showNative(owner);
  };
  private blur = (e: FocusEvent) => {
    if (this.owner?.contains(e.target as Node) && !this.owner?.contains(e.relatedTarget as Node | null)) this.hide();
  };
  private dismiss = (e?: Event) => {
    if (!(e?.target instanceof Node) || !this.el.contains(e.target)) this.hide();
  };
  private key = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.hide();
  };
  private scroll = (e: Event) => {
    if (!(e.target instanceof Node) || !this.el.contains(e.target)) this.hide();
  };

  show(owner: HTMLElement, note: CodexNote, anchor?: DOMRect, native = false) {
    window.clearTimeout(this.delay);
    this.hide();
    this.owner = owner;
    this.anchor = anchor ?? null;
    this.native = native;
    this.previousDescription = owner.getAttribute('aria-describedby');
    owner.setAttribute('aria-describedby', [this.previousDescription, this.el.id].filter(Boolean).join(' '));
    const header = document.createElement('header'),
      text = document.createElement('div');
    if (note.eyebrow) {
      const small = document.createElement('small');
      small.className = 'codex-eyebrow';
      small.textContent = note.eyebrow;
      text.appendChild(small);
    }
    const title = document.createElement('h3');
    title.textContent = note.title;
    text.appendChild(title);
    header.appendChild(text);
    this.el.replaceChildren(header);
    if (note.body) {
      const p = document.createElement('p');
      p.textContent = note.body;
      this.el.appendChild(p);
    }
    if (note.footer) {
      const footer = document.createElement('footer');
      footer.textContent = note.footer;
      this.el.appendChild(footer);
    }
    this.el.hidden = false;
    this.position();
    const check = () => {
      if (!this.owner) return;
      if (
        !this.owner.isConnected ||
        this.owner.closest('.hidden, [hidden]') ||
        !this.owner.getClientRects().length ||
        getComputedStyle(this.owner).visibility === 'hidden'
      ) {
        this.hide();
        return;
      }
      this.frame = requestAnimationFrame(check);
    };
    this.frame = requestAnimationFrame(check);
  }
  private position() {
    const r = this.anchor ?? this.owner!.getBoundingClientRect(),
      gap = 12,
      margin = 12;
    const w = this.el.offsetWidth,
      h = this.el.offsetHeight;
    let x = r.right + gap,
      y = r.top;
    if (x + w > window.innerWidth - margin) x = r.left - w - gap;
    if (x < margin) {
      x = r.left;
      y = r.bottom + gap;
      if (y + h > window.innerHeight - margin) y = r.top - h - gap;
    }
    this.el.style.left = `${Math.max(margin, Math.min(window.innerWidth - w - margin, x))}px`;
    this.el.style.top = `${Math.max(margin, Math.min(window.innerHeight - h - margin, y))}px`;
  }
  hide(owner?: HTMLElement) {
    if (owner && owner !== this.owner) return;
    window.clearTimeout(this.delay);
    cancelAnimationFrame(this.frame);
    if (this.owner) {
      const ids = (this.owner.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== this.el.id);
      if (ids.length) this.owner.setAttribute('aria-describedby', ids.join(' '));
      else this.owner.removeAttribute('aria-describedby');
    }
    this.owner = null;
    this.anchor = null;
    this.previousDescription = null;
    this.el.hidden = true;
  }
  release(owner: HTMLElement) {
    window.clearTimeout(this.delay);
    this.delay = window.setTimeout(() => this.hide(owner), 140);
  }
  dispose() {
    this.hide();
    this.observer.disconnect();
    this.el.remove();
    document.removeEventListener('pointerover', this.over);
    document.removeEventListener('pointerout', this.out);
    document.removeEventListener('focusin', this.focus);
    document.removeEventListener('focusout', this.blur);
    document.removeEventListener('pointerdown', this.dismiss, true);
    document.removeEventListener('keydown', this.key, true);
    document.removeEventListener('scroll', this.scroll, true);
    document.removeEventListener('pointerlockchange', this.dismiss);
    window.removeEventListener('resize', this.dismiss);
  }
}
let help: CodexTooltip | undefined;
export const codexHelp = () => (help ??= new CodexTooltip());
