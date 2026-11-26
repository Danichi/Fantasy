/** Contact sounds for hard surfaces; grass and snow retain their recorded beds. */
export type FootMaterial = 'grass' | 'snow' | 'stone' | 'dirt' | 'sand' | 'wood' | 'water';
export function footMaterial(surface: string, snow = false): FootMaterial {
  if (snow) return 'snow';
  return ['stone', 'dirt', 'sand', 'wood', 'water'].includes(surface) ? (surface as FootMaterial) : 'grass';
}

export class SurfaceFoley {
  context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  start() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      if (!this.noise) {
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
    } catch {
      /* The recorded ambience still works without Web Audio. */
    }
  }
  step(material: FootMaterial, volume: number, wet = false) {
    const c = this.context;
    if (!c || !this.noise || this.muted || c.state !== 'running' || volume <= 0) return;
    const t = c.currentTime,
      splash = material === 'water',
      wood = material === 'wood';
    const length = splash ? 0.23 : material === 'sand' ? 0.16 : 0.095;
    const n = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    n.buffer = this.noise;
    filter.type = splash || wet ? 'bandpass' : 'lowpass';
    filter.frequency.value = splash ? 1250 : material === 'stone' ? 2800 : wood ? 900 : material === 'sand' ? 3600 : 1650;
    filter.Q.value = splash ? 0.7 : 0.35;
    gain.gain.setValueAtTime(Math.max(0.001, volume * (splash ? 0.9 : 0.42)), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    n.connect(filter).connect(gain).connect(c.destination);
    n.start(t, Math.random() * 0.6);
    n.stop(t + length);
    n.onended = () => {
      n.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    if (splash || material === 'sand') return;
    const o = c.createOscillator(),
      thud = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(wood ? 170 : material === 'stone' ? 115 : 75, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.065);
    thud.gain.setValueAtTime(volume * (wood ? 0.55 : 0.36), t);
    thud.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(thud).connect(c.destination);
    o.start(t);
    o.stop(t + 0.11);
    o.onended = () => {
      o.disconnect();
      thud.disconnect();
    };
  }
}
