// Background music: one looping track per area, crossfaded when you move
// between the overworld and the crypt. Muting is remembered between sessions.

export type MusicZone = 'village' | 'crypt';

const TRACKS: Record<MusicZone, string> = {
  village: '/assets/music/village.mp3', // "Global Equator"
  crypt: '/assets/music/crypt.mp3', // "Sonic Ladder"
};
const VOLUME = 0.45;
const FADE = 1.5; // seconds
const MUTE_KEY = 'fantasy-rpg-music-muted';

export class Music {
  private tracks = {} as Record<MusicZone, HTMLAudioElement>;
  private zone: MusicZone | null = null;
  private started = false;
  muted = false;

  constructor() {
    for (const z of Object.keys(TRACKS) as MusicZone[]) {
      const a = new Audio(TRACKS[z]);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      this.tracks[z] = a;
    }
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {}
  }

  /** Browsers only allow audio after a user gesture, so call this from the start click. */
  start() {
    this.started = true;
    if (this.zone) this.play(this.tracks[this.zone]);
  }

  setZone(zone: MusicZone) {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.started) this.play(this.tracks[zone]);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {}
  }

  /** Called every frame: fade the current zone's track in and the others out. */
  update(dt: number) {
    for (const z of Object.keys(this.tracks) as MusicZone[]) {
      const a = this.tracks[z];
      const target = this.started && !this.muted && z === this.zone ? VOLUME : 0;
      const step = (VOLUME / FADE) * dt;
      const v = a.volume < target ? Math.min(target, a.volume + step) : Math.max(target, a.volume - step);
      if (v !== a.volume) a.volume = v;
      if (v === 0 && !a.paused && z !== this.zone) a.pause();
    }
  }

  private play(a: HTMLAudioElement) {
    if (a.paused) void a.play().catch(() => {});
  }
}
