import type { LocalSound } from '../world/glenCircuitData';

/** One bed per sound type, mixed from nearby physical sources, with camera-relative pan. */
export class LocalSoundscape {
  private beds = new Map<string, { audio: HTMLAudioElement; gain: GainNode; pan: StereoPannerNode }>();
  constructor(private sources: LocalSound[]) {}
  start(c: AudioContext | null) {
    if (!c || this.beds.size) return;
    for (const kind of new Set(this.sources.map((s) => s.kind))) {
      const audio = new Audio(`/assets/audio/amb/${kind}.mp3`);
      audio.loop = true;
      audio.preload = 'auto';
      const gain = c.createGain(),
        pan = c.createStereoPanner();
      gain.gain.value = 0;
      c.createMediaElementSource(audio).connect(gain).connect(pan).connect(c.destination);
      this.beds.set(kind, { audio, gain, pan });
    }
  }
  silence() {
    for (const bed of this.beds.values()) {
      bed.gain.gain.value = 0;
      bed.audio.pause();
    }
  }
  update(dt: number, x: number, z: number, rightX: number, rightZ: number, night: number, master: number, audible: boolean) {
    for (const [kind, bed] of this.beds) {
      let volume = 0,
        weightedPan = 0;
      if (audible)
        for (const s of this.sources) {
          if (s.kind !== kind) continue;
          const dx = s.x - x,
            dz = s.z - z,
            d = Math.hypot(dx, dz);
          const v = Math.pow(Math.max(0, 1 - d / s.radius), 2) * s.gain * (s.daytime ? 1 - night : 1);
          volume += v;
          weightedPan += v * Math.max(-0.85, Math.min(0.85, (dx * rightX + dz * rightZ) / Math.max(4, d)));
        }
      const a = 1 - Math.exp(-dt * 2.5),
        target = Math.min(0.6, volume) * master;
      bed.gain.gain.value += (target - bed.gain.gain.value) * a;
      bed.pan.pan.value += ((volume ? weightedPan / volume : 0) - bed.pan.pan.value) * a;
      if (target > 0.001 && bed.audio.paused) void bed.audio.play().catch(() => {});
      if (target < 0.001 && bed.gain.gain.value < 0.001 && !bed.audio.paused) bed.audio.pause();
    }
  }
}
