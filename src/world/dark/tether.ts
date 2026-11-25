export type DarkFlags = Record<string, boolean | number | string>;
export interface DarkRun {
  entry: string;
  x: number;
  z: number;
  y?: number;
  hp?: number;
  left: number;
}

/** Progress is permanent; a run is resumable and never refills on reload. */
export class Tether {
  run: DarkRun | null = null;
  constructor(readonly flags: DarkFlags) {}
  get capacity() {
    const keys = Object.keys(this.flags).filter((k) => !!this.flags[k]);
    const wheels = keys.filter((k) => k.startsWith('way:')).length;
    const echoes = keys.filter((k) => k.startsWith('dark:wheel:')).length;
    const memories = keys.filter((k) => k.startsWith('dark:memory:')).length;
    return Math.min(900, 90 + Math.min(30, wheels) * 8 + echoes * 35 + memories * 18);
  }
  begin(entry: string, x: number, z: number) {
    this.run = { entry, x, z, left: this.capacity };
  }
  tick(dt: number, sheltered: boolean) {
    if (this.run && Number.isFinite(dt) && dt > 0 && !sheltered) this.run.left = Math.max(0, this.run.left - dt);
  }
  damage(amount: number) {
    // Proportional loss keeps poison/burn ticks independent of frame rate.
    if (this.run && Number.isFinite(amount) && amount > 0) this.run.left = Math.max(0, this.run.left - Math.min(15, amount * 0.25));
  }
  discover(kind: 'wheel' | 'memory', id: string) {
    const key = `dark:${kind}:${id}`;
    if (this.flags[key]) return false;
    const before = this.capacity;
    this.flags[key] = true;
    if (this.run) this.run.left = Math.min(this.capacity, this.run.left + this.capacity - before);
    return true;
  }
  sync() {
    this.flags.darkRun = this.run ? JSON.stringify(this.run) : '';
  }
  restore() {
    this.run = null;
    try {
      const r = JSON.parse(String(this.flags.darkRun || 'null'));
      if (r && typeof r.entry === 'string' && r.entry.length < 120 && [r.x, r.z, r.left].every(Number.isFinite) && r.left > 0) {
        this.run = { entry: r.entry, x: r.x, z: r.z, left: Math.min(this.capacity, r.left) };
        if (Number.isFinite(r.y) && r.y > -30 && r.y < 4000) this.run.y = r.y;
        if (Number.isFinite(r.hp) && r.hp >= 0) this.run.hp = r.hp;
      }
    } catch {
      /* Corrupt or old saves return to their safe living-world position. */
    }
    this.sync();
  }
  end() {
    this.run = null;
    this.sync();
  }
}
