import './techniqueLibrary.css';
import { Techniques, keyName, type TechniqueEntry } from '../combat/techniques';
import { TECHNIQUE_SLOTS, type TechniqueSlot } from '../combat/techniqueLoadout';
import { SANDBOX_MODE } from '../sandbox/mode';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const POS = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [3, 2],
  [3, 1],
  [2, 1],
];
/** Paged technique wheel: no slot limit; the four held gestures and six favorites are optional bindings. */
export class TechniqueLibrary {
  readonly root = document.createElement('section');
  readonly guide = document.createElement('aside');
  readonly launcher = document.createElement('button');
  open = false;
  get timeScale() {
    return this.open ? 0.15 : 1;
  }
  private selected = '';
  private page = 0;
  private timer = 0;
  private capturing = false;
  private search: HTMLInputElement;
  private school: HTMLSelectElement;
  private restoreFocus: HTMLElement | null = null;
  private showGuide = SANDBOX_MODE;
  constructor(
    readonly model: Techniques,
    private allowed: () => boolean,
    private onToggle: (open: boolean) => void,
    private save: () => void,
    private pin: (index: number, ref: string) => void
  ) {
    this.root.className = 'technique-library';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'technique-title');
    this.root.innerHTML = `<div class="tl-panel"><header><div><small>COMBAT TECHNIQUES</small><h2 id="technique-title">Everything you have learned</h2></div><button data-close aria-label="Close technique library">Close · Esc</button></header>
      <p class="tl-intro">Choose a technique, then press Enter or Use. The world slows while you browse. Favorites are optional.</p>
      <div class="tl-filters"><input type="search" aria-label="Search learned techniques" placeholder="Search moves or disciplines…"><select aria-label="Filter discipline"></select></div>
      <div class="tl-layout"><div><div class="tl-wheel"></div><nav><button data-prev>← Previous</button><span class="tl-count"></span><button data-next>Next →</button></nav></div>
      <aside class="tl-detail"><h3></h3><p class="tl-description"></p><p class="tl-cost"></p><p class="tl-reason" role="status" aria-live="polite"></p><button class="tl-use" data-use>Use · Enter</button>
      <h4>Held technique layer</h4><label>Discipline <select class="tl-active" aria-label="Held technique discipline"></select></label><p>Hold T with one of these inputs. Assign any learned technique.</p><div class="tl-assign"></div>
      <h4>Optional shortcuts</h4><div class="tl-shortcuts"></div><button data-bind>Bind a direct key…</button><p class="tl-binding" role="status"></p><label>Favorite <select class="tl-pin" aria-label="Favorite slot"><option value="">Choose slot…</option>${[1, 2, 3, 4, 5, 6].map((i) => `<option value="${i - 1}">${i}</option>`).join('')}</select></label>
      <label class="tl-guide-toggle"><input type="checkbox" ${this.showGuide ? 'checked' : ''}>Show live combat guide</label></aside></div><footer>Light: LMB · Heavy: R (hold to charge) · Technique: hold T · Library: U · Attuned spell: Y</footer></div>`;
    this.search = this.root.querySelector('input[type=search]')!;
    this.school = this.root.querySelector('.tl-filters select')!;
    this.guide.className = 'combat-input-guide';
    this.guide.setAttribute('aria-label', 'Combat input guide');
    this.launcher.className = 'technique-launcher';
    this.launcher.textContent = 'U · Techniques';
    this.launcher.onclick = () => this.toggle(true);
    document.body.append(this.root, this.guide, this.launcher);
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.hasAttribute('data-close')) this.toggle(false);
      else if (b.hasAttribute('data-use')) this.use();
      else if (b.dataset.ref) {
        this.selected = b.dataset.ref;
        this.render();
      } else if (b.hasAttribute('data-prev') || b.hasAttribute('data-next')) {
        this.page += b.hasAttribute('data-prev') ? -1 : 1;
        this.selected = this.filtered()[Math.max(0, this.page) * 8]?.ref ?? '';
        this.render();
      } else if (b.dataset.assign) {
        this.model.assign(b.dataset.assign as TechniqueSlot, this.selected);
        this.save();
        this.render();
      } else if (b.hasAttribute('data-bind')) {
        this.capturing = true;
        this.bindingMessage('Press an unused key. Escape cancels.');
      } else if (b.dataset.unbind) {
        delete this.model.player.equip.techniques.shortcuts[b.dataset.unbind];
        this.save();
        this.render();
      }
    });
    this.search.addEventListener('input', () => {
      this.page = 0;
      this.render();
    });
    this.school.addEventListener('change', () => {
      this.page = 0;
      this.render();
    });
    this.root.querySelector('.tl-active')!.addEventListener('change', (e) => {
      this.model.selectSchool((e.target as HTMLSelectElement).value);
      this.save();
      this.render();
    });
    this.root.querySelector('.tl-pin')!.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      if (el.value !== '' && this.selected) this.pin(Number(el.value), this.selected);
      el.value = '';
    });
    this.root.querySelector('.tl-guide-toggle input')!.addEventListener('change', (e) => {
      this.showGuide = (e.target as HTMLInputElement).checked;
    });
    window.addEventListener('keydown', (e) => this.keydown(e), true);
  }
  private bindingMessage(s: string) {
    this.root.querySelector('.tl-binding')!.textContent = s;
  }
  private keydown(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.matches('input,textarea,select');
    if (!this.open) {
      if (!typing && !e.repeat && !e.ctrlKey && !e.metaKey && this.model.input.bindings.techniqueLibrary.includes(e.code) && this.allowed()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.toggle(true);
      }
      return;
    }
    e.stopPropagation();
    if (this.capturing) {
      e.preventDefault();
      this.capturing = false;
      if (e.code === 'Escape') {
        this.bindingMessage('Binding cancelled');
        return;
      }
      const ok = !e.ctrlKey && !e.metaKey && !e.altKey && this.model.bindKey(e.code, this.selected);
      this.bindingMessage(ok ? `Bound ${keyName(e.code)}` : 'That key is reserved. Choose an unused key, such as 9, 0 or punctuation.');
      if (ok) {
        this.save();
        this.render();
      }
      return;
    }
    if (e.code === 'Escape' || (!typing && this.model.input.bindings.techniqueLibrary.includes(e.code))) {
      e.preventDefault();
      this.toggle(false);
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      const focus = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled),input,select')],
        i = focus.indexOf(document.activeElement as HTMLElement);
      focus[(i + (e.shiftKey ? -1 : 1) + focus.length) % focus.length]?.focus();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      this.use();
      return;
    }
    if (typing) return;
    e.preventDefault();
    if (e.code.startsWith('Arrow')) {
      const list = this.filtered(),
        i = Math.max(
          0,
          list.findIndex((x) => x.ref === this.selected)
        ),
        step = ['ArrowLeft', 'ArrowUp'].includes(e.code) ? -1 : 1,
        next = (i + step + list.length) % list.length;
      if (list[next]) {
        this.selected = list[next].ref;
        this.page = Math.floor(next / 8);
        this.render();
      }
    }
  }
  toggle(on = !this.open) {
    if (on === this.open || (on && !this.allowed())) return;
    this.open = on;
    this.root.hidden = !on;
    this.capturing = false;
    this.model.input.releaseAll();
    this.model.player.clearCombatInput();
    this.model.reset();
    if (on) {
      this.restoreFocus = document.activeElement as HTMLElement;
      this.model.invalidate();
      this.search.value = '';
      this.page = 0;
      this.selected = this.model.player.equip.techniques.last ?? '';
      this.school.innerHTML = '<option value="">All disciplines</option>' + this.model.schools.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
      this.school.value = this.model.entry(this.selected)?.discipline ?? this.model.discipline;
      this.root.querySelector<HTMLSelectElement>('.tl-active')!.innerHTML = this.model.heldSchools.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
      this.render();
    }
    this.onToggle(on);
    if (on) this.root.querySelector<HTMLButtonElement>('[data-close]')!.focus();
    else {
      this.save();
      this.restoreFocus?.focus();
    }
  }
  private filtered() {
    const q = this.search.value.toLocaleLowerCase().trim();
    return this.model.entries.filter((e) => (!this.school.value || e.discipline === this.school.value) && (!q || `${e.name} ${e.school}`.toLocaleLowerCase().includes(q)));
  }
  private use() {
    const e = this.model.entry(this.selected);
    if (!e) return;
    const why = this.model.blocked(e);
    if (why && why !== 'busy') {
      this.refreshStatus();
      return;
    }
    const ref = e.ref;
    this.toggle(false);
    this.model.request(ref);
    this.save();
  }
  private status(e: TechniqueEntry) {
    const cd = this.model.cooldown(e);
    return cd > 0 ? `Recharging · ${cd.toFixed(1)}s` : (this.model.blocked(e) ?? 'Ready');
  }
  private render() {
    const all = this.filtered(),
      pages = Math.max(1, Math.ceil(all.length / 8));
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    if (!all.some((e) => e.ref === this.selected)) this.selected = all[this.page * 8]?.ref ?? '';
    const entries = all.slice(this.page * 8, this.page * 8 + 8);
    this.root.querySelector('.tl-wheel')!.innerHTML =
      `<div class="tl-center"><b>${all.length}</b><span>learned techniques</span><small>Arrows to select<br>Enter to use</small></div>` +
      entries
        .map(
          (e, i) =>
            `<button data-ref="${esc(e.ref)}" aria-pressed="${e.ref === this.selected}" style="grid-row:${POS[i][0]};grid-column:${POS[i][1]}"><small>${esc(e.school)}</small><b>${esc(e.name)}</b><span>${esc(e.cost)}</span><em class="tl-status"></em></button>`
        )
        .join('') +
      (!all.length ? '<p class="tl-empty">No matching learned techniques. Learn a class or carry a spell to add it here.</p>' : '');
    this.root.querySelector('.tl-count')!.textContent = `${this.page + 1} / ${pages}`;
    this.root.querySelector<HTMLButtonElement>('[data-prev]')!.disabled = this.page === 0;
    this.root.querySelector<HTMLButtonElement>('[data-next]')!.disabled = this.page === pages - 1;
    const selected = this.model.entry(this.selected);
    this.root.querySelector('h3')!.textContent = selected?.name ?? 'Your technique library';
    this.root.querySelector('.tl-description')!.textContent = selected?.description ?? 'Every implemented technique you learn appears here automatically.';
    this.root.querySelector('.tl-cost')!.textContent = selected?.cost ?? '';
    this.root.querySelector<HTMLSelectElement>('.tl-active')!.value = this.model.discipline;
    const bindings = this.model.bindings();
    this.root.querySelector('.tl-assign')!.innerHTML = TECHNIQUE_SLOTS.map(
      (slot) =>
        `<button data-assign="${slot}" ${selected ? '' : 'disabled'}><b>T + ${this.model.gesture(slot)}</b><span>${esc(bindings[slot]?.name ?? 'Unassigned')}</span><small>Assign selected</small></button>`
    ).join('');
    this.root.querySelector('.tl-shortcuts')!.innerHTML = Object.entries(this.model.player.equip.techniques.shortcuts)
      .filter(([, ref]) => ref === this.selected)
      .map(([key]) => `<button data-unbind="${esc(key)}">${esc(keyName(key))} · Remove</button>`)
      .join('');
    this.root.querySelector<HTMLButtonElement>('[data-bind]')!.disabled = !selected;
    this.refreshStatus();
  }
  private refreshStatus() {
    for (const card of this.root.querySelectorAll<HTMLElement>('[data-ref]')) {
      const e = this.model.entry(card.dataset.ref!);
      if (!e) continue;
      const reason = this.status(e);
      card.querySelector('.tl-status')!.textContent = reason === 'busy' ? 'Finishing current move' : reason;
      card.dataset.ready = String(reason === 'Ready');
    }
    const e = this.model.entry(this.selected),
      reason = e ? this.status(e) : 'Choose a technique';
    this.root.querySelector('.tl-reason')!.textContent = reason === 'busy' ? 'Queued inputs wait briefly for your recovery window.' : reason;
    this.root.querySelector<HTMLButtonElement>('[data-use]')!.disabled = !e || (reason !== 'Ready' && reason !== 'busy');
  }
  update(dt: number) {
    if (this.open && (this.model.player.dead || this.model.player.vehicle || this.model.player.swimming)) this.toggle(false);
    this.launcher.hidden = this.open || this.model.input.uiMode || this.model.player.dead || this.model.player.adventure.busy || this.model.player.adventure.gliding || !!this.model.player.vehicle || this.model.player.swimming;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    this.launcher.textContent = `U · Techniques · ${this.model.entries.length} learned`;
    if (this.open) this.refreshStatus();
    const m = this.model,
      p = m.player;
    this.guide.hidden = (!p.techniqueMode && !this.showGuide) || this.open || p.dead || p.adventure.busy || p.adventure.gliding || !!p.vehicle || p.swimming;
    document.body.classList.toggle('has-combat-input-guide', !this.guide.hidden);
    if (this.guide.hidden) return;
    if (p.techniqueMode) {
      const bindings = m.bindings();
      this.guide.innerHTML = `<small>HELD TECHNIQUES · ${esc(m.schools.find(([id]) => id === m.discipline)?.[1] ?? 'Choose a discipline')}</small><div class="cig-techniques">${TECHNIQUE_SLOTS.map(
        (slot) => {
          const e = bindings[slot];
          return `<div><kbd>${this.model.gesture(slot)}</kbd><b>${esc(e?.name ?? 'Unassigned')}</b><span>${esc(e ? `${e.cost} · ${this.status(e)}` : 'Open U to assign')}</span></div>`;
        }
      ).join('')}</div><footer>U · Full library and bindings</footer>`;
    } else {
      const g = p.combatGuide;
      const current = p.act?.def.id.startsWith('sk_') ? (m.entry(p.equip.techniques.last ?? '')?.name ?? 'Technique') : g.current;
      const phase = { idle: 'Ready', windup: 'Preparing', commit: 'Committed', active: 'Strike', recovery: 'Recovering' }[g.phase];
      this.guide.innerHTML = `<small>COMBAT GUIDE · ${esc(p.equip.mainWeapon?.def.name ?? 'Unarmed')}</small><b>${esc(current)} · ${g.charging ? `Charging · tier ${g.tier}` : esc(phase ?? 'Ready')}</b><div class="cig-branches" data-ready="${g.ready}"><span><kbd>LMB</kbd> ${esc(g.light)}</span><span><kbd>R</kbd> ${esc(g.heavy)}</span><em>${g.ready ? 'Follow-up ready' : 'Waiting for follow-up window'}</em></div><div class="cig-history">${m.recent.map((r) => `<kbd>${esc(r.label)}</kbd>`).join('')}</div><footer>Hold T · Class techniques &nbsp; U · Full library<br>C + LMB · Air strike &nbsp; C + R · Plunge</footer>`;
    }
    document.body.style.setProperty('--combat-guide-height', `${this.guide.offsetHeight}px`);
  }
}
