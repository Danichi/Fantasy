import * as THREE from 'three';

// The world clock (prompt §29): a 48-minute day by default. Everything that
// changes with the time of day reads from here: sun and moon, sky gradients,
// ambient light, haze, lit windows and lanterns, fireflies, NPC schedules,
// shop hours, encounter and fishing tables.

export type DayPhase = 'night' | 'dawn' | 'morning' | 'day' | 'evening' | 'dusk';

/** Key-framed lighting (hour -> values), interpolated smoothly. */
interface LightKey {
  h: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  env: number;
  haze: string;
  exposure: number;
  night: number; // 0 day .. 1 full night (stars, fireflies, lit windows)
}

// Board palette: "Day / Sunset / Night" in Environments & Atmosphere.
const KEYS: LightKey[] = [
  { h: 0, zenith: '#07102a', horizon: '#22355f', sun: '#a9bcff', sunI: 0.62, hemiSky: '#3d5596', hemiGround: '#1a2230', hemiI: 0.95, env: 0.2, haze: '#1f3060', exposure: 1.32, night: 1 },
  { h: 4.5, zenith: '#0b1636', horizon: '#2a3d68', sun: '#a9bcff', sunI: 0.55, hemiSky: '#3f5796', hemiGround: '#1b2230', hemiI: 0.92, env: 0.2, haze: '#27386a', exposure: 1.3, night: 1 },
  { h: 5.6, zenith: '#2a3f78', horizon: '#f0a07a', sun: '#ffb37a', sunI: 0.9, hemiSky: '#8a8fc0', hemiGround: '#3a3530', hemiI: 0.75, env: 0.22, haze: '#e6a38a', exposure: 1.05, night: 0.45 },
  { h: 7, zenith: '#3d86d8', horizon: '#ffd9b0', sun: '#ffd6a0', sunI: 1.8, hemiSky: '#9cbce6', hemiGround: '#5a5a40', hemiI: 0.95, env: 0.34, haze: '#f0d6bc', exposure: 1.0, night: 0 },
  { h: 10, zenith: '#2f7fd6', horizon: '#a9d3ec', sun: '#fff1d6', sunI: 2.3, hemiSky: '#a9c7ee', hemiGround: '#6d6a4a', hemiI: 1.05, env: 0.42, haze: '#a9d3ec', exposure: 1.0, night: 0 },
  { h: 15, zenith: '#2f7fd6', horizon: '#a9d3ec', sun: '#fff1d6', sunI: 2.3, hemiSky: '#a9c7ee', hemiGround: '#6d6a4a', hemiI: 1.05, env: 0.42, haze: '#a9d3ec', exposure: 1.0, night: 0 },
  { h: 18, zenith: '#3a74c8', horizon: '#ffcf96', sun: '#ffc27a', sunI: 1.9, hemiSky: '#a6b6de', hemiGround: '#6a5a40', hemiI: 0.95, env: 0.34, haze: '#f2c9a0', exposure: 1.0, night: 0 },
  { h: 19.6, zenith: '#34427e', horizon: '#ff8a5c', sun: '#ff8a4c', sunI: 1.1, hemiSky: '#8c7fb0', hemiGround: '#3e3028', hemiI: 0.75, env: 0.22, haze: '#e88a6a', exposure: 1.05, night: 0.35 },
  { h: 20.8, zenith: '#101c40', horizon: '#3c4274', sun: '#a9bcff', sunI: 0.6, hemiSky: '#3f4f8a', hemiGround: '#1c2230', hemiI: 0.9, env: 0.2, haze: '#2c3866', exposure: 1.26, night: 0.9 },
  { h: 24, zenith: '#07102a', horizon: '#22355f', sun: '#a9bcff', sunI: 0.62, hemiSky: '#3d5596', hemiGround: '#1a2230', hemiI: 0.95, env: 0.2, haze: '#1f3060', exposure: 1.32, night: 1 },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
const lerpHex = (a: string, b: string, t: number, out: THREE.Color) => out.copy(tmpA.set(a)).lerp(tmpB.set(b), t);

export interface SkyState {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  envIntensity: number;
  haze: THREE.Color;
  exposure: number;
  /** 0 day .. 1 night */
  night: number;
  /** direction toward the light that casts shadows (sun by day, moon by night) */
  lightDir: THREE.Vector3;
  /** direction toward the sun (may be below the horizon) */
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** how much of the moon is lit tonight, 0 (new) .. 1 (full) */
  moonLight: number;
  /** where it is in its cycle, 0..1 (0 full, 0.5 new); waning after full, waxing before */
  moonPhase: number;
}

/** The moon's cycle: full every eighth night (day 8, 16, 24...). */
export const MOON_DAYS = 8;
const MOON_GLYPHS = ['●', '◐', '◐', '☾', '○', '☽', '◑', '◑'];
const MOON_NAMES = ['full moon', 'waning gibbous', 'last quarter', 'waning crescent', 'new moon', 'waxing crescent', 'first quarter', 'waxing gibbous'];

export class WorldTime {
  /** Hours since midnight, 0..24. */
  hour = 9;
  day = 1;
  /** Real minutes per game day. */
  dayLengthMin = 48;
  paused = false;
  readonly state: SkyState = {
    zenith: new THREE.Color(), horizon: new THREE.Color(), sunColor: new THREE.Color(), sunIntensity: 1,
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 1, envIntensity: 0.4,
    haze: new THREE.Color(), exposure: 1, night: 0,
    lightDir: new THREE.Vector3(0, 1, 0), sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, 1, 0),
    moonLight: 1, moonPhase: 0,
  };

  constructor() {
    const q = new URLSearchParams(location.search).get('hour');
    if (q !== null && !isNaN(+q)) this.hour = +q;
    this.evaluate();
  }

  get phase(): DayPhase {
    const h = this.hour;
    if (h < 5) return 'night';
    if (h < 7) return 'dawn';
    if (h < 11) return 'morning';
    if (h < 17) return 'day';
    if (h < 19.5) return 'evening';
    if (h < 21) return 'dusk';
    return 'night';
  }

  /** The day tonight's night belongs to (after midnight it's still the evening's). */
  get nightOf() {
    return this.hour < 12 ? this.day - 1 : this.day;
  }
  /** Nights since the last full moon (0 = full tonight). */
  get moonAge() {
    return ((this.nightOf % MOON_DAYS) + MOON_DAYS) % MOON_DAYS;
  }
  /** The moon is full tonight. */
  get fullMoon() {
    return this.moonAge === 0;
  }
  /** Nights until the next full moon (0 = tonight). */
  get nightsToFull() {
    return (MOON_DAYS - this.moonAge) % MOON_DAYS;
  }
  get moonGlyph() {
    return MOON_GLYPHS[this.moonAge];
  }
  get moonName() {
    return MOON_NAMES[this.moonAge];
  }

  /** "Day 3, 14:05" */
  get label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `Day ${this.day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt: number) {
    if (!this.paused) {
      this.hour += (dt * 24) / (this.dayLengthMin * 60);
      if (this.hour >= 24) {
        this.hour -= 24;
        this.day++;
      }
    }
    this.evaluate();
  }

  /** Jump to an hour (sleeping at an inn, tests); advances the day if needed. */
  skipTo(hour: number) {
    if (hour <= this.hour) this.day++;
    this.hour = hour;
    this.evaluate();
  }

  private evaluate() {
    const h = this.hour;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
    const s = this.state;
    lerpHex(a.zenith, b.zenith, t, s.zenith);
    lerpHex(a.horizon, b.horizon, t, s.horizon);
    lerpHex(a.sun, b.sun, t, s.sunColor);
    lerpHex(a.hemiSky, b.hemiSky, t, s.hemiSky);
    lerpHex(a.hemiGround, b.hemiGround, t, s.hemiGround);
    lerpHex(a.haze, b.haze, t, s.haze);
    s.sunIntensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    s.hemiIntensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
    s.envIntensity = THREE.MathUtils.lerp(a.env, b.env, t);
    s.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
    s.night = THREE.MathUtils.lerp(a.night, b.night, t);
    // Sun path: rises in the east (+X) around 6:00, high in the south (+Z) at
    // noon, sets in the west around 20:00. The moon runs opposite.
    const day = ((h - 6) / 14) * Math.PI; // 0 at sunrise, PI at sunset
    const elev = Math.sin(day) * THREE.MathUtils.degToRad(62);
    const az = day; // east -> south -> west
    s.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) * 0.8 + 0.35).normalize();
    const mday = day + Math.PI;
    const melev = Math.sin(mday) * THREE.MathUtils.degToRad(48);
    s.moonDir.set(Math.cos(mday) * Math.cos(melev), Math.sin(melev), Math.sin(mday) * Math.cos(melev) * 0.8 + 0.3).normalize();
    // The moon's face: the darker the moon, the darker the night (a little).
    s.moonPhase = this.moonAge / MOON_DAYS;
    s.moonLight = (1 + Math.cos(s.moonPhase * Math.PI * 2)) / 2;
    s.sunIntensity *= 1 - s.night * (1 - s.moonLight) * 0.3;
    // Shadows come from whichever is up; never quite from the horizon.
    const src = s.sunDir.y > -0.02 ? s.sunDir : s.moonDir;
    s.lightDir.copy(src);
    if (s.lightDir.y < 0.18) s.lightDir.y = 0.18;
    s.lightDir.normalize();
  }

  toJSON() {
    return { hour: this.hour, day: this.day };
  }

  fromJSON(d: { hour?: number; day?: number } | number | undefined) {
    if (d === undefined) return;
    if (typeof d === 'number') this.hour = d;
    else {
      if (typeof d.hour === 'number') this.hour = d.hour;
      if (typeof d.day === 'number') this.day = d.day;
    }
    this.evaluate();
  }
}
