// Keyboard + mouse input with rebindable actions.
// Presses are latched until a fixed simulation step consumes them, so a tap
// that lands between two sim steps is never lost.

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'sprint' | 'dodge' | 'jump'
  | 'attack' | 'offhand' | 'parry' | 'lockOn' | 'cast'
  | 'inventory' | 'help' | 'toggleBar'
  | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft'],
  dodge: ['Space'],
  jump: ['KeyC'], // not Ctrl: Ctrl+W closes the tab and can't be blocked
  attack: ['Mouse0'],
  offhand: ['Mouse2'],
  parry: ['KeyF'],
  lockOn: ['Mouse1', 'KeyQ'],
  toggleBar: ['Tab'],
  cast: ['KeyR'],
  inventory: ['KeyI'],
  help: ['KeyH'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'],
  slot5: ['Digit5'], slot6: ['Digit6'], slot7: ['Digit7'], slot8: ['Digit8'],
};

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private pressTime = new Map<string, number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** true while the UI (inventory, menus) owns the mouse */
  uiMode = false;
  /** Tracks modifier state for UI shortcuts like shift-click. */
  shift = false;
  /** Mouse-look without pointer lock (used if the browser refuses to lock). */
  fallbackLook = false;
  onLockFailed?: () => void;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.ctrlKey || e.metaKey) return; // leave browser shortcuts alone
      this.shift = e.shiftKey;
      if (e.repeat) return;
      this.press(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      this.release(e.code);
    });
    window.addEventListener('blur', () => {
      for (const c of this.down) this.release(c);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.uiMode) return;
      // Try to (re)capture the mouse, but never swallow the click: if the
      // browser refuses the lock, the game still has to be playable.
      if (!this.locked) this.requestLock();
      e.preventDefault();
      this.press('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => this.release('Mouse' + e.button));
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !(this.fallbackLook && !this.uiMode)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  requestLock() {
    // requestPointerLock returns a promise in modern browsers; ignore rejection
    // (it rejects when the user exits lock and clicks again too quickly).
    try {
      const r = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => this.onLockFailed?.());
    } catch {
      this.onLockFailed?.();
    }
  }

  exitLock() {
    if (this.locked) document.exitPointerLock();
  }

  /** Programmatic input, used by the debug hook and tests. */
  press(code: string) {
    if (!this.down.has(code)) {
      this.down.add(code);
      this.pressed.add(code);
      this.pressTime.set(code, performance.now());
    }
  }

  release(code: string) {
    if (this.down.delete(code)) this.released.add(code);
  }

  held(a: Action) {
    return this.bindings[a].some((c) => this.down.has(c));
  }

  wasPressed(a: Action) {
    return this.bindings[a].some((c) => this.pressed.has(c));
  }

  wasReleased(a: Action) {
    return this.bindings[a].some((c) => this.released.has(c));
  }

  /** Seconds the action has been held (0 if not held). */
  heldFor(a: Action) {
    let best = 0;
    for (const c of this.bindings[a]) {
      if (this.down.has(c)) best = Math.max(best, (performance.now() - (this.pressTime.get(c) ?? 0)) / 1000);
    }
    return best;
  }

  /** Call after each fixed simulation step. */
  endStep() {
    this.pressed.clear();
    this.released.clear();
  }

  /** Call once per rendered frame after the camera has read the mouse. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
