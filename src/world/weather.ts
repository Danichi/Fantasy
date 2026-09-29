import * as THREE from 'three';
import { REGIONS, type WeatherKind } from './regionDefinitions';
import { mulberry32 } from '../core/math';

// Lightweight world weather (prompt §28): a Markov chain per region's
// profile, blended smoothly. It produces a handful of parameters that the
// sky, lighting, haze, grass, particles, audio, encounters and NPCs read.
// Deterministic from a seed and the game clock, so a reload keeps the sky.

export interface WeatherParams {
  cloud: number; // 0..1 overcast
  rain: number; // 0..1 rain intensity
  snow: number; // 0..1 snowfall
  fog: number; // 0..1 extra haze
  wind: number; // 0..1 (grass, trees, cloth, sails)
  storm: number; // 0..1 lightning chance
  heat: number; // 0..1 desert heat shimmer
  wet: number; // 0..1 wet ground (lags rain)
}

const PRESET: Record<WeatherKind, Omit<WeatherParams, 'wet'>> = {
  clear: { cloud: 0.05, rain: 0, snow: 0, fog: 0, wind: 0.25, storm: 0, heat: 0 },
  cloudy: { cloud: 0.6, rain: 0, snow: 0, fog: 0.15, wind: 0.4, storm: 0, heat: 0 },
  rain: { cloud: 0.85, rain: 0.55, snow: 0, fog: 0.35, wind: 0.5, storm: 0, heat: 0 },
  heavyRain: { cloud: 1, rain: 1, snow: 0, fog: 0.55, wind: 0.75, storm: 0.15, heat: 0 },
  fog: { cloud: 0.5, rain: 0, snow: 0, fog: 1, wind: 0.1, storm: 0, heat: 0 },
  storm: { cloud: 1, rain: 0.9, snow: 0, fog: 0.5, wind: 1, storm: 1, heat: 0 },
  snow: { cloud: 0.8, rain: 0, snow: 0.6, fog: 0.4, wind: 0.35, storm: 0, heat: 0 },
  blizzard: { cloud: 1, rain: 0, snow: 1, fog: 0.9, wind: 1, storm: 0, heat: 0 },
  heatHaze: { cloud: 0, rain: 0, snow: 0, fog: 0.2, wind: 0.3, storm: 0, heat: 1 },
};

export class Weather {
  kind: WeatherKind = 'clear';
  private next: WeatherKind = 'clear';
  private blend = 1; // 0..1 from kind to next
  private timer = 0; // seconds until the next change
  readonly p: WeatherParams = { cloud: 0.05, rain: 0, snow: 0, fog: 0, wind: 0.25, storm: 0, heat: 0, wet: 0 };
  private rnd: () => number;
  /** fired for lightning (the sky flash and thunder) */
  onLightning?: (strength: number) => void;
  private boltT = 4;
  /** debug/test override (?weather=storm) */
  forced: WeatherKind | null = null;

  constructor(seed = 12345) {
    this.rnd = mulberry32(seed);
    const q = new URLSearchParams(location.search).get('weather') as WeatherKind | null;
    if (q && q in PRESET) {
      this.forced = q;
      this.kind = this.next = q;
      Object.assign(this.p, PRESET[q], { wet: PRESET[q].rain > 0 ? 1 : 0 });
    }
    this.timer = 120 + this.rnd() * 240;
  }

  /** Pick the next weather from the region's profile (sticky: similar weather is likelier). */
  private roll(regionId: string) {
    const profile = REGIONS[regionId]?.weather ?? REGIONS.cresha.weather;
    const entries = Object.entries(profile) as [WeatherKind, number][];
    let total = 0;
    const weights = entries.map(([k, w]) => {
      const stay = k === this.kind ? 1.6 : 1;
      total += w * stay;
      return [k, w * stay] as const;
    });
    let r = this.rnd() * total;
    for (const [k, w] of weights) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[0][0];
  }

  update(dt: number, regionId: string) {
    if (this.forced) {
      this.kind = this.next = this.forced;
      this.blend = 1;
    } else {
      this.timer -= dt;
      if (this.timer <= 0 && this.blend >= 1) {
        this.next = this.roll(regionId);
        this.blend = this.next === this.kind ? 1 : 0;
        this.timer = 150 + this.rnd() * 330; // weather holds 2.5 to 8 minutes
      }
      if (this.blend < 1) {
        this.blend = Math.min(1, this.blend + dt / 25); // 25 s transitions
        if (this.blend >= 1) this.kind = this.next;
      }
    }
    // Regions override what makes no sense there (no snow in the desert, no rain on glaciers).
    const a = PRESET[this.kind], b = PRESET[this.next];
    const t = THREE.MathUtils.smoothstep(this.blend, 0, 1);
    const target: Omit<WeatherParams, 'wet'> = {
      cloud: THREE.MathUtils.lerp(a.cloud, b.cloud, t),
      rain: THREE.MathUtils.lerp(a.rain, b.rain, t),
      snow: THREE.MathUtils.lerp(a.snow, b.snow, t),
      fog: THREE.MathUtils.lerp(a.fog, b.fog, t),
      wind: THREE.MathUtils.lerp(a.wind, b.wind, t),
      storm: THREE.MathUtils.lerp(a.storm, b.storm, t),
      heat: THREE.MathUtils.lerp(a.heat, b.heat, t),
    };
    // Smooth approach so region borders never pop.
    const k = 1 - Math.exp(-dt / 6);
    for (const key of Object.keys(target) as (keyof typeof target)[]) this.p[key] += (target[key] - this.p[key]) * k;
    // Ground wetness: soaks fast, dries slowly.
    this.p.wet = THREE.MathUtils.clamp(this.p.wet + (this.p.rain > 0.1 ? dt / 40 : -dt / 180), 0, 1);
    // Lightning.
    if (this.p.storm > 0.2) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 4 + this.rnd() * 14 / this.p.storm;
        this.onLightning?.(0.5 + this.rnd() * 0.5);
      }
    }
  }

  toJSON() {
    return { kind: this.kind, timer: this.timer };
  }

  fromJSON(d: { kind?: WeatherKind; timer?: number } | undefined) {
    if (!d || !d.kind || !(d.kind in PRESET)) return;
    this.kind = this.next = d.kind;
    this.blend = 1;
    this.timer = d.timer ?? this.timer;
    Object.assign(this.p, PRESET[d.kind]);
  }
}
