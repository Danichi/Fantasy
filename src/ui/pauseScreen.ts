// ---------------------------------------------------------------------------
// The pause screen: the title screen's sister, laid over the frozen world.
//
// The world shows through, blurred and darkened toward the menu on the left,
// with the crest, where you are and how you stand, and a painted-icon menu:
// Resume, Save, Load, Settings, Controls, the Sandbox, Return to Title, Quit.
// Esc resumes (or closes an open panel). Shares its look with titleScreen.ts.
// ---------------------------------------------------------------------------

import './titleScreen.css';
import { buildSavePicker } from './savePicker';
import { ART, buildMenu, settingsInto, startMotes, type MenuItem, type TitleToggle } from './titleScreen';

export interface PauseStat {
  label: string;
  value: string;
}

export interface PauseOptions {
  resume(): void;
  save(): void;
  settings: TitleToggle[];
  controls(): void;
  /** extra lines (the Sandbox's) */
  extra(): { label: string; sub?: string; icon: string; run(): void }[];
  toTitle(): void;
  quit?: () => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createPauseScreen(o: PauseOptions) {
  let el: HTMLDivElement | null = null;
  let stop: (() => void) | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;

  const hide = () => {
    if (!el) return;
    const gone = el;
    el = null;
    stop?.();
    if (onKey) removeEventListener('keydown', onKey, true);
    gone.classList.add('ts-out');
    setTimeout(() => gone.remove(), 220);
  };

  const show = (title: string, stats: PauseStat[]) => {
    if (el) hide();
    el = document.createElement('div');
    const root = el;
    root.className = 'ts-root ts-pause';
    root.innerHTML = `
      <canvas class="ts-motes"></canvas>
      <div class="ts-shade"></div>
      <aside class="ts-side">
        <header class="ts-brand">
          <img class="ts-crest" src="${ART}/crest.webp" alt="" draggable="false">
          <h1>PAUSED</h1>
          <img class="ts-rule" src="${ART}/divider.webp" alt="" draggable="false">
          <p>${esc(title)}</p>
        </header>
        <div class="ts-stats">${stats.map((s) => `<span><small>${esc(s.label)}</small><b>${esc(s.value)}</b></span>`).join('')}</div>
        <nav class="ts-menu" role="menu"></nav>
      </aside>
      <section class="ts-panel" hidden><button class="ts-close" aria-label="Close">✕</button><div class="ts-panel-body"></div></section>
      <footer class="ts-foot"><span>Esc to resume</span></footer>`;
    document.getElementById('ui')!.appendChild(root);
    stop = startMotes(root.querySelector('.ts-motes') as HTMLCanvasElement);

    const panel = root.querySelector('.ts-panel') as HTMLElement;
    const body = root.querySelector('.ts-panel-body') as HTMLElement;
    const closePanel = () => (panel.hidden = true);
    root.querySelector('.ts-close')!.addEventListener('click', closePanel);
    const open = (fill: () => void) => {
      fill();
      panel.hidden = false;
    };

    const items: MenuItem[] = [
      { id: 'resume', label: 'Resume', icon: 'resume', run: () => (hide(), o.resume()) },
      {
        id: 'save',
        label: 'Save Game',
        icon: 'save',
        run: () => {
          o.save();
          // A short "Saved" under the line, then it goes.
          const lbl = root.querySelector('.ts-item[data-i="1"] .ts-label')!;
          lbl.classList.add('ts-saved');
          setTimeout(() => lbl.classList.remove('ts-saved'), 1800);
        },
      },
      {
        id: 'load',
        label: 'Load Game',
        icon: 'load',
        run: () =>
          open(() => {
            body.innerHTML = '<h2>Load Game</h2><p class="ts-note">Loading another save keeps this one where it is: it saves itself first.</p>';
            buildSavePicker(body);
          }),
      },
      { id: 'settings', label: 'Settings', icon: 'settings', run: () => open(() => settingsInto(body, o.settings)) },
      { id: 'controls', label: 'Controls', icon: 'controls', run: o.controls },
      ...o.extra().map((x, i) => ({ id: 'x' + i, ...x })),
      { id: 'title', label: 'Return to Title', icon: 'title', run: () => (o.save(), o.toTitle()) },
    ];
    if (o.quit) items.push({ id: 'quit', label: 'Quit Game', icon: 'quit', run: () => (o.save(), o.quit!()) });
    const menu = buildMenu(root.querySelector('.ts-menu') as HTMLElement, items);

    onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, form')) return;
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') menu.select(menu.sel + 1);
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') menu.select(menu.sel - 1);
      else if (e.key === 'Enter' || e.key === ' ') items[menu.sel].run();
      else if (e.key === 'Escape') {
        if (!panel.hidden) closePanel();
        else {
          hide();
          o.resume();
        }
      } else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey, true);
    for (const ev of ['click', 'pointerdown', 'mousedown'] as const) root.addEventListener(ev, (e) => e.stopPropagation());
  };

  return {
    show,
    hide,
    get open() {
      return !!el;
    },
  };
}
