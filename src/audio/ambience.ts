import type { WeatherParams } from '../world/weather';

// Region ambience (prompt §54): a few looping beds per biome, crossfaded by
// region, time of day and weather. At most one bed per layer plays: base
// (biome by day or night), weather (rain / storm), and one local accent
// (river, harbour crowd, campfire) set by whatever is nearby. Sound files are
// CC0 from the Drawcall Market mirror (public/assets/audio/amb/LICENSE.txt).

const DIR = '/assets/audio/amb/';
export const AMB_FILES = {
  forest: 'forest.mp3',
  night: 'night.mp3',
  harbor: 'harbor.mp3',
  mountain: 'mountain-wind.mp3',
  desert: 'desert-wind.mp3',
  cave: 'cave.mp3',
  volcanic: 'volcanic.mp3',
  jungle: 'jungle.mp3',
  crowd: 'crowd.mp3',
  river: 'river.mp3',
  fire: 'fire.mp3',
  rain: 'rain.mp3',
  storm: 'storm.mp3',
  thunderLoop: 'thunder-distant.mp3',
} as const;
export type AmbKey = keyof typeof AMB_FILES;

/** Region ambience id -> [day bed, night bed]. */
const BIOME_BEDS: Record<string, [AmbKey, AmbKey]> = {
  meadow: ['forest', 'night'],
  forest: ['forest', 'night'],
  harbor: ['harbor', 'night'],
  city: ['crowd', 'night'],
  mountain: ['mountain', 'mountain'],
  cave: ['cave', 'cave'],
  desert: ['desert', 'desert'],
  jungle: ['jungle', 'jungle'],
  beach: ['harbor', 'night'],
  storm: ['storm', 'storm'],
  underwater: ['harbor', 'night'],
  volcanic: ['volcanic', 'volcanic'],
};

export class Ambience {
  private tracks = new Map<AmbKey, HTMLAudioElement>();
  private target = new Map<AmbKey, number>();
  private started = false;
  muted = false;
  master = 0.55;
  private thunder: HTMLAudioElement;

  constructor() {
    for (const [k, f] of Object.entries(AMB_FILES) as [AmbKey, string][]) {
      const a = new Audio(DIR + f);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      this.tracks.set(k, a);
    }
    this.thunder = new Audio(DIR + 'thunder-crack.mp3');
    this.thunder.preload = 'auto';
  }

  /** Browsers only allow audio after a gesture (the title screen click). */
  start() {
    this.started = true;
  }

  /** Lightning: a crack whose delay and volume follow the (random) distance. */
  thunderClap(strength: number) {
    if (!this.started || this.muted) return;
    const delay = (1 - strength) * 2500;
    setTimeout(() => {
      this.thunder.currentTime = 0;
      this.thunder.volume = Math.min(1, 0.35 + strength * 0.6) * this.master;
      void this.thunder.play().catch(() => {});
    }, delay);
  }

  /**
   * ambience: region ambience id; night 0..1; accents: nearby local sounds
   * (0..1 each, e.g. river proximity); indoors/underground set by the caller.
   */
  update(dt: number, ambience: string, night: number, w: WeatherParams, accents: Partial<Record<AmbKey, number>>, dungeon: boolean) {
    this.target.clear();
    if (dungeon) this.target.set('cave', 0.75);
    else {
      const [day, nightBed] = BIOME_BEDS[ambience] ?? BIOME_BEDS.meadow;
      const shelter = 1 - Math.max(w.rain, w.snow) * 0.5;
      this.target.set(day, ((this.target.get(day) ?? 0) + (1 - night) * 0.7) * shelter);
      this.target.set(nightBed, ((this.target.get(nightBed) ?? 0) + night * 0.6) * shelter);
      if (w.rain > 0.02) this.target.set('rain', w.rain * 0.85);
      if (w.storm > 0.05 || w.wind > 0.85) this.target.set('storm', Math.max(w.storm, (w.wind - 0.7) * 2) * 0.7);
      if (w.storm > 0.3) this.target.set('thunderLoop', w.storm * 0.4);
      if (w.snow > 0.3 || w.wind > 0.7) this.target.set('mountain', Math.max(this.target.get('mountain') ?? 0, w.wind * 0.5));
      for (const [k, v] of Object.entries(accents) as [AmbKey, number][]) this.target.set(k, Math.max(this.target.get(k) ?? 0, v));
    }
    const fade = Math.min(1, dt / 2.5);
    for (const [k, a] of this.tracks) {
      const want = this.started && !this.muted ? (this.target.get(k) ?? 0) * this.master : 0;
      const v = a.volume + (want - a.volume) * fade;
      a.volume = Math.max(0, Math.min(1, v < 0.002 ? 0 : v));
      if (a.volume > 0 && a.paused) void a.play().catch(() => {});
      else if (a.volume === 0 && !a.paused) a.pause();
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
  }
}
