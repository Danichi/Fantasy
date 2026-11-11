import type { Player } from '../../player/player';
import { events } from '../../core/events';
import { ITEMS } from '../itemDefs';

// Locks (items/catalog): chests in dungeons, smugglers' caches, strongboxes.
// A lock is Simple, Sturdy, Fine or Masterwork. You pick it with Lockpicks
// (or Master Lockpicks) in a short minigame: lift each pin while the pick is in
// its sweet spot; a miss strains the pick and may snap it. Without picks, a
// heavy weapon can force the lock, loudly, and what is inside may not survive.

export const LOCK_NAMES = ['', 'Simple', 'Sturdy', 'Fine', 'Masterwork'];

/** The lock on a container, from its id and tier (0: none). The same container always has the same lock. */
export function lockLevel(id: string, tier: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  const chance = [0.25, 0.5, 0.75, 1, 1][Math.max(0, Math.min(4, tier))];
  if (r >= chance) return 0;
  return Math.max(1, Math.min(4, tier + (r < chance * 0.3 ? 1 : 0)));
}

export type PickResult = 'set' | 'opened' | 'strained' | 'snapped' | 'out';

/** One attempt at a lock. */
export interface Attempt {
  id: string;
  level: number;
  pins: number;
  set: number;
  /** the sweet spot: centre and half-width, 0..1 along the pick's travel */
  zone: [number, number];
  /** where the pick is now, 0..1 */
  at: number;
  dir: number;
  speed: number;
  master: boolean;
  onOpen: (forced: boolean) => void;
}

export class Locks {
  /** the attempt in the minigame, if any */
  cur: Attempt | null = null;
  open = false;
  onToggle?: (open: boolean) => void;
  readonly el: HTMLDivElement;
  private raf = 0;
  private last = 0;
  private note = '';
  /** numbers for tests */
  readonly stats = { picked: 0, forced: 0, snapped: 0 };

  constructor(private player: Player, private flags: Record<string, boolean | number | string>, private toast: (m: string) => void, private skill: () => number = () => 0) {
    this.el = document.createElement('div');
    this.el.className = 'lockpick interactive hidden';
    document.getElementById('ui')?.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const a = t.dataset.act;
      if (a === 'lift') this.lift();
      if (a === 'force') this.force();
      if (a === 'close') this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        this.lift();
      } else if (e.code === 'Escape') this.close();
    });
  }

  isOpen(id: string) {
    return !!this.flags['lock:' + id];
  }
  picks() {
    const eq = this.player.equip;
    const n = (id: string) => eq.items.filter((it) => it.def.id === id).reduce((a, it) => a + it.qty, 0);
    return { master: n('masterLockpicks'), plain: n('lockpicks') };
  }
  /** Can a heavy weapon in hand force it? */
  /** a class that breaks locks without a heavy weapon (Brawler, Earthshaper): set by main */
  forceAny?: () => boolean;
  canForce() {
    if (this.forceAny?.()) return true;
    const d = this.player.equip.mainWeapon?.def;
    return !!d && (d.hands === 2 || d.kind === 'greatsword' || d.kind === 'mace' || d.kind === 'axe');
  }
  /** What the prompt over a locked container adds: "locked: pick the sturdy lock". */
  label(level: number) {
    const p = this.picks();
    const what = `${LOCK_NAMES[level]} lock`.toLowerCase();
    if (p.master || p.plain) return `locked: pick the ${what}`;
    if (this.canForce()) return `locked: force the ${what}`;
    return `locked (${what}): you need lockpicks or a heavy weapon`;
  }

  /** Try a locked container: the minigame with picks, forcing without. */
  attempt(id: string, level: number, onOpen: (forced: boolean) => void) {
    if (level <= 0 || this.isOpen(id)) return onOpen(false);
    const p = this.picks();
    if (!p.master && !p.plain) {
      if (this.canForce()) return this.doForce(id, onOpen);
      this.toast('It is locked. Lockpicks would open it, or something heavy enough to break it.');
      return;
    }
    const master = p.master > 0;
    const pins = level + 1;
    this.cur = { id, level, pins, set: 0, zone: [0, 0], at: 0, dir: 1, speed: 0.6 + level * 0.18, master, onOpen };
    this.newZone();
    this.note = '';
    this.open = true;
    this.el.classList.remove('hidden');
    this.render();
    this.onToggle?.(true);
    this.last = performance.now();
    const tick = (t: number) => {
      if (!this.open) return;
      this.step(Math.min(0.05, (t - this.last) / 1000));
      this.last = t;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** The sweet spot for the next pin: narrower on finer locks, wider with master picks and a delver's hand. */
  private newZone() {
    const c = this.cur!;
    const w = [0, 0.16, 0.12, 0.09, 0.065][c.level] * (c.master ? 1.4 : 1) * (1 + 0.02 * this.skill());
    c.zone = [0.15 + Math.random() * 0.7, w];
  }

  /** The pick sweeps back and forth. */
  step(dt: number) {
    const c = this.cur;
    if (!c) return;
    c.at += c.dir * c.speed * dt;
    if (c.at > 1) (c.at = 1), (c.dir = -1);
    if (c.at < 0) (c.at = 0), (c.dir = 1);
    const m = this.el.querySelector<HTMLElement>('.lp-pick');
    if (m) m.style.left = `${(c.at * 100).toFixed(1)}%`;
  }

  /** Lift the pin now: in the sweet spot it sets; outside it strains the pick. `hit` forces the outcome (tests). */
  lift(hit?: boolean): PickResult {
    const c = this.cur;
    if (!c) return 'out';
    const inZone = hit ?? Math.abs(c.at - c.zone[0]) <= c.zone[1];
    if (inZone) {
      c.set++;
      if (c.set >= c.pins) {
        this.stats.picked++;
        this.flags['lock:' + c.id] = 1;
        this.toast(`The ${LOCK_NAMES[c.level].toLowerCase()} lock clicks open.`);
        events.emit('lockPicked', { id: c.id, level: c.level });
        const done = c.onOpen;
        this.close();
        done(false);
        return 'opened';
      }
      this.note = 'The pin sets.';
      this.newZone();
      this.render();
      return 'set';
    }
    // A miss: the pick strains, and may snap (master picks rarely do). The pins fall back one.
    c.set = Math.max(0, c.set - 1);
    const snap = Math.random() < (c.master ? 0.12 : 0.4) * (1 - Math.min(0.5, this.skill() * 0.015));
    if (!snap) {
      this.note = 'The pick slips. A pin falls back.';
      this.render();
      return 'strained';
    }
    this.stats.snapped++;
    this.take(c.master ? 'masterLockpicks' : 'lockpicks');
    const p = this.picks();
    if (!p.master && !p.plain) {
      this.toast('Your last pick snaps in the lock.');
      this.close();
      return 'out';
    }
    c.master = p.master > 0;
    this.note = `Snap. ${c.master ? 'A master pick' : 'A lockpick'} goes in its place.`;
    this.newZone();
    this.render();
    return 'snapped';
  }

  /** Give up on picking and break it open (needs a heavy weapon). */
  force() {
    const c = this.cur;
    if (!c || !this.canForce()) return;
    const done = c.onOpen, id = c.id;
    this.close();
    this.doForce(id, done);
  }
  private doForce(id: string, onOpen: (forced: boolean) => void) {
    this.stats.forced++;
    this.flags['lock:' + id] = 1;
    this.player.stamina = Math.max(0, this.player.stamina - 40);
    this.toast('You smash the lock off. It is loud.');
    events.emit('lockForced', { id });
    onOpen(true);
  }

  private take(id: string) {
    const eq = this.player.equip;
    const it = eq.items.find((x) => x.def.id === id);
    if (!it) return;
    if (it.qty > 1) it.qty--;
    else eq.items = eq.items.filter((x) => x !== it);
    events.emit('equipmentChanged', {});
  }

  close() {
    if (!this.open) return;
    cancelAnimationFrame(this.raf);
    this.open = false;
    this.cur = null;
    this.el.classList.add('hidden');
    this.onToggle?.(false);
  }

  private render() {
    const c = this.cur;
    if (!c) return;
    const p = this.picks();
    const pins = Array.from({ length: c.pins }, (_, i) => `<i class="${i < c.set ? 'set' : ''}"></i>`).join('');
    this.el.innerHTML = `
      <div class="lp-box">
        <div class="lp-title">${LOCK_NAMES[c.level]} lock</div>
        <div class="lp-pins">${pins}</div>
        <div class="lp-bar"><div class="lp-zone" style="left:${((c.zone[0] - c.zone[1]) * 100).toFixed(1)}%;width:${(c.zone[1] * 200).toFixed(1)}%"></div><div class="lp-pick" style="left:${(c.at * 100).toFixed(1)}%"></div></div>
        <div class="lp-note">${this.note || 'Lift each pin while the pick is in the bright notch (Space).'}</div>
        <div class="lp-picks">${p.master ? `${p.master} master pick${p.master > 1 ? 's' : ''}` : ''}${p.master && p.plain ? ' · ' : ''}${p.plain ? `${p.plain} lockpick${p.plain > 1 ? 's' : ''}` : ''}</div>
        <div class="lp-btns"><button data-act="lift">Lift the pin <small>Space</small></button>${this.canForce() ? '<button data-act="force" class="alt">Force it</button>' : ''}<button data-act="close" class="alt">Leave it</button></div>
      </div>`;
  }
}

/** Is this item a pick? (shops and tests) */
export const isPick = (id: string) => id === 'lockpicks' || id === 'masterLockpicks';
export const pickName = (id: string) => ITEMS[id]?.name ?? id;
