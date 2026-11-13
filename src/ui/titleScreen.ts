// ---------------------------------------------------------------------------
// The title screen: the first thing anyone sees.
//
// A painted valley at dusk that moves (a Higgsfield video loop over its still,
// with drifting mist, fireflies and a little parallax under the mouse), the
// crest and name, and a menu down the left with painted icons. Load Game and
// Settings open in a panel on the right. Arrow keys and Enter work too.
//
// This is only the first screen. Pausing uses the old card (inventory.ts).
// Art: public/assets/art/title/ (tools/art/README.md).
// ---------------------------------------------------------------------------

import './titleScreen.css';
import { listSlots, createSlot } from '../save';
import { ORIGINS } from '../origins/data';
import { buildSavePicker } from './savePicker';

export const GAME_NAME = 'ELDERGLEN';
export const GAME_TAGLINE = 'A tale of the Five Realms';

const ART = '/assets/art/title';
/** sessionStorage: "New Game" made a fresh slot and reloaded; open the creator straight away */
const NEW_GAME_KEY = 'ts:newGame';

export interface TitleToggle {
  label: string;
  /** the current value, as shown */
  value(): string;
  /** change it; return the new value */
  next(): string;
}

export interface TitleOptions {
  /** start or continue: what clicking the old start card did */
  begin(): void;
  sandbox(): void;
  controls(): void;
  settings: TitleToggle[];
  quit?: () => void;
  version?: string;
}

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  run(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createTitleScreen(o: TitleOptions) {
  const slots = listSlots();
  const cur = slots.find((s) => s.current);
  const hero = cur?.hero ?? null;

  const el = document.createElement('div');
  el.className = 'ts-root ts-intro';
  el.innerHTML = `
    <div class="ts-bg">
      <img class="ts-still" src="${ART}/bg.webp" alt="" draggable="false">
      <video class="ts-video" muted loop playsinline preload="auto" poster="${ART}/bg.webp"></video>
    </div>
    <div class="ts-mist m1"></div><div class="ts-mist m2"></div>
    <canvas class="ts-motes"></canvas>
    <div class="ts-shade"></div>
    <aside class="ts-side">
      <header class="ts-brand">
        <img class="ts-crest" src="${ART}/crest.webp" alt="" draggable="false">
        <h1>${GAME_NAME}</h1>
        <img class="ts-rule" src="${ART}/divider.webp" alt="" draggable="false">
        <p>${GAME_TAGLINE}</p>
      </header>
      <nav class="ts-menu" role="menu"></nav>
    </aside>
    <section class="ts-panel" hidden><button class="ts-close" aria-label="Close">✕</button><div class="ts-panel-body"></div></section>
    <footer class="ts-foot"><span>Best with keyboard and mouse</span><span>${esc(o.version ?? '')}</span></footer>
    <div class="ts-fade"></div>`;
  document.getElementById('ui')!.appendChild(el);

  // ---- the moving background --------------------------------------------
  const video = el.querySelector('.ts-video') as HTMLVideoElement;
  // The still shows at once; the loop fades in over it when it can play through.
  video.addEventListener('canplaythrough', () => el.classList.add('ts-moving'), { once: true });
  const lowPower = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!lowPower) {
    video.src = `${ART}/loop.mp4`;
    void video.play().catch(() => {});
  }

  // Parallax: the painting leans a little away from the mouse.
  const bg = el.querySelector('.ts-bg') as HTMLElement;
  let tx = 0, ty = 0, px = 0, py = 0;
  el.addEventListener('pointermove', (e) => {
    tx = (e.clientX / innerWidth - 0.5) * -18;
    ty = (e.clientY / innerHeight - 0.5) * -10;
  });

  // Fireflies and embers.
  const cv = el.querySelector('.ts-motes') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  type Mote = { x: number; y: number; vx: number; vy: number; r: number; ph: number; hue: number };
  const motes: Mote[] = [];
  const seed = () => {
    cv.width = innerWidth * devicePixelRatio;
    cv.height = innerHeight * devicePixelRatio;
    motes.length = 0;
    const n = lowPower ? 0 : Math.round(Math.min(90, innerWidth / 18));
    for (let i = 0; i < n; i++)
      motes.push({ x: Math.random(), y: 0.35 + Math.random() * 0.65, vx: (Math.random() - 0.5) * 0.012, vy: -0.004 - Math.random() * 0.012, r: 0.6 + Math.random() * 1.8, ph: Math.random() * 6.28, hue: Math.random() < 0.7 ? 42 : 22 });
  };
  seed();
  addEventListener('resize', seed);
  let raf = 0, last = performance.now();
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    px += (tx - px) * 0.04;
    py += (ty - py) * 0.04;
    bg.style.transform = `translate3d(${px}px, ${py}px, 0) scale(1.06)`;
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.ph += dt * (1.2 + m.r * 0.3);
      m.x += (m.vx + Math.sin(m.ph * 0.7) * 0.004) * dt;
      m.y += m.vy * dt;
      if (m.y < 0.2 || m.x < -0.02 || m.x > 1.02) {
        m.y = 1.02;
        m.x = Math.random();
      }
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(m.ph));
      const x = (m.x + px / innerWidth * 0.6) * W, y = (m.y + py / innerHeight * 0.6) * H, r = m.r * devicePixelRatio;
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 6);
      grd.addColorStop(0, `hsla(${m.hue}, 100%, 75%, ${a})`);
      grd.addColorStop(0.25, `hsla(${m.hue}, 100%, 55%, ${a * 0.35})`);
      grd.addColorStop(1, `hsla(${m.hue}, 100%, 50%, 0)`);
      g.fillStyle = grd;
      g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    }
    g.globalCompositeOperation = 'source-over';
  };
  raf = requestAnimationFrame(frame);

  // ---- the menu -----------------------------------------------------------
  const panel = el.querySelector('.ts-panel') as HTMLElement;
  const body = el.querySelector('.ts-panel-body') as HTMLElement;
  const closePanel = () => {
    panel.hidden = true;
    panel.dataset.kind = '';
  };
  el.querySelector('.ts-close')!.addEventListener('click', closePanel);

  const openSaves = () => {
    body.innerHTML = '<h2>Load Game</h2><p class="ts-note">Pick a save to load it. Each keeps its own hero and world.</p>';
    buildSavePicker(body);
    panel.dataset.kind = 'saves';
    panel.hidden = false;
  };
  const openSettings = () => {
    body.innerHTML = '<h2>Settings</h2><div class="ts-settings"></div>';
    const box = body.querySelector('.ts-settings')!;
    for (const s of o.settings) {
      const b = document.createElement('button');
      b.className = 'ts-toggle';
      b.innerHTML = `<span>${esc(s.label)}</span><b>${esc(s.value())}</b>`;
      b.addEventListener('click', () => (b.querySelector('b')!.textContent = s.next()));
      box.append(b);
    }
    panel.dataset.kind = 'settings';
    panel.hidden = false;
  };
  const originName = (id: string) => (ORIGINS as Record<string, { name: string }>)[id]?.name ?? id;

  const items: Item[] = [];
  if (hero)
    items.push({
      id: 'continue',
      label: 'Continue',
      sub: `${esc(hero.name)} · ${esc(originName(hero.origin))} · Level ${hero.level}${hero.day ? ` · Day ${hero.day}` : ''}`,
      icon: 'continue',
      run: () => leave(o.begin),
    });
  items.push({
    id: 'new',
    label: 'New Game',
    sub: hero ? 'A new hero, in a save of their own' : 'Make your hero and begin',
    icon: 'newgame',
    run: () => {
      if (!hero) return leave(o.begin);
      // Your game stays where it is; the new one gets a fresh save.
      createSlot('');
      try {
        sessionStorage.setItem(NEW_GAME_KEY, '1');
      } catch {}
      el.classList.add('ts-leaving');
      setTimeout(() => location.reload(), 450);
    },
  });
  if (slots.length > 1 || hero) items.push({ id: 'load', label: 'Load Game', sub: `${slots.length} save${slots.length === 1 ? '' : 's'}`, icon: 'load', run: openSaves });
  items.push({ id: 'sandbox', label: 'Combat Sandbox', sub: 'Every build at full power, to practise', icon: 'sandbox', run: () => leave(o.sandbox) });
  items.push({ id: 'settings', label: 'Settings', icon: 'settings', run: openSettings });
  items.push({ id: 'controls', label: 'Controls', icon: 'controls', run: o.controls });
  if (o.quit) items.push({ id: 'quit', label: 'Quit', icon: 'quit', run: o.quit });

  const nav = el.querySelector('.ts-menu') as HTMLElement;
  nav.innerHTML = items
    .map(
      (it, i) => `<button class="ts-item" role="menuitem" data-i="${i}" style="--d:${0.55 + i * 0.07}s">
        <span class="ts-icon"><img src="${ART}/icon-${it.icon}.webp" alt="" draggable="false"></span>
        <span class="ts-label">${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</span>
      </button>`,
    )
    .join('');
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>('.ts-item')];
  let sel = 0;
  const select = (i: number) => {
    sel = (i + buttons.length) % buttons.length;
    buttons.forEach((b, k) => b.classList.toggle('sel', k === sel));
  };
  select(0);
  buttons.forEach((b, i) => {
    b.addEventListener('pointerenter', () => select(i));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      select(i);
      items[i].run();
    });
  });

  // Keys: up and down, Enter, Escape closes a panel. Nothing reaches the game underneath.
  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, form')) return;
    e.stopPropagation();
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') select(sel + 1);
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') select(sel - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      items[sel].run();
    } else if (e.key === 'Escape') closePanel();
    else return;
    e.preventDefault();
  };
  addEventListener('keydown', onKey, true);
  // Clicks on the title never fall through to the game.
  for (const ev of ['click', 'pointerdown', 'mousedown'] as const) el.addEventListener(ev, (e) => e.stopPropagation());

  let active = true;
  const leave = (then: () => void) => {
    if (!active) return;
    el.classList.add('ts-leaving');
    setTimeout(() => {
      then();
      hide();
    }, 520);
  };
  const hide = () => {
    active = false;
    el.remove();
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', seed);
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
  requestAnimationFrame(() => el.classList.remove('ts-intro'));

  // "New Game" reloaded into a fresh save: go straight to the character creator.
  let autostart = false;
  try {
    autostart = sessionStorage.getItem(NEW_GAME_KEY) === '1' && !hero;
    sessionStorage.removeItem(NEW_GAME_KEY);
  } catch {}
  if (autostart) setTimeout(() => leave(o.begin), 300);

  return {
    el,
    hide,
    get active() {
      return active;
    },
  };
}
