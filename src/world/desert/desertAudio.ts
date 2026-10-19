import { sfx } from '../../audio/sfx';

// Ghagrabba's street sounds, synthesised (no sample files): an oud plucking
// the Hijaz mode, frame drums, finger cymbals, the priests' chant drone, the
// temple gong, criers' handbells, the fire-breather's whoosh, rattling
// knucklebones and the murmur of the bazaar. Each call takes a volume the
// caller has already scaled by distance; silence is cheap (nothing is built
// below an audible level).

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { c: ctx, o: out! };
}

const audible = (v: number) => sfx.enabled && v > 0.01;

function env(g: GainNode, t0: number, peak: number, attack: number, release: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
}

function noise(c: AudioContext, t0: number, dur: number) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.start(t0, Math.random());
  s.stop(t0 + dur);
  return s;
}

/** The Hijaz mode on D: the sound every street musician in the city plays. */
const HIJAZ = [0, 1, 4, 5, 7, 8, 10, 12];
const freq = (step: number, base = 146.83) => base * Math.pow(2, (HIJAZ[((step % 8) + 8) % 8] + 12 * Math.floor(step / 8)) / 12);

export const desertAudio = {
  /** One plucked oud string (Karplus-ish: a bright decaying saw through a closing filter). */
  oud(step: number, vol: number, when = 0) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01 + when;
    const f = freq(step);
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    const osc2 = c.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = f * 2.003;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.6);
    lp.Q.value = 3;
    const g = c.createGain();
    env(g, t, 0.18 * vol, 0.004, 0.9);
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(g).connect(o);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1);
    osc2.stop(t + 1);
  },

  /** A frame-drum stroke: 'doum' (deep, centre) or 'tek' (bright, rim). */
  drum(kind: 'doum' | 'tek', vol: number, when = 0) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01 + when;
    if (kind === 'doum') {
      const osc = c.createOscillator();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(52, t + 0.25);
      const g = c.createGain();
      env(g, t, 0.5 * vol, 0.004, 0.35);
      osc.connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 0.45);
    } else {
      const n = noise(c, t, 0.12);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 1.4;
      const g = c.createGain();
      env(g, t, 0.35 * vol, 0.002, 0.09);
      n.connect(bp).connect(g).connect(o);
    }
  },

  /** Finger cymbals: two inharmonic partials ringing. */
  zill(vol: number, when = 0) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01 + when;
    for (const f of [2637, 3951, 5274]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      const g = c.createGain();
      env(g, t, 0.06 * vol, 0.002, 0.7);
      osc.connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 0.8);
    }
  },

  /** A handbell (criers, the night watch calling the hours). */
  bell(vol: number, when = 0) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01 + when;
    for (const [f, a] of [[880, 1], [2210, 0.4], [3520, 0.2]] as const) {
      const osc = c.createOscillator();
      osc.frequency.value = f;
      const g = c.createGain();
      env(g, t, 0.12 * vol * a, 0.003, 1.1);
      osc.connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 1.2);
    }
  },

  /** The great temple gong: a slow bloom of beating partials. */
  gong(vol: number) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.02;
    for (const [f, a] of [[62, 1], [96.5, 0.6], [141, 0.45], [233, 0.25], [317, 0.15]] as const) {
      const osc = c.createOscillator();
      osc.frequency.setValueAtTime(f * 1.01, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 2);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4 * vol * a, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      osc.connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 6.2);
    }
  },

  /** A held chant note: voices on a drone and its fifth, with a slow vowel sweep. */
  chant(step: number, seconds: number, vol: number) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.02;
    const f = freq(step, 73.42);
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.8);
    bus.gain.setValueAtTime(0.16 * vol, t + seconds - 0.8);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const formant = c.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 4;
    formant.frequency.setValueAtTime(520, t);
    formant.frequency.linearRampToValueAtTime(780, t + seconds * 0.5);
    formant.frequency.linearRampToValueAtTime(420, t + seconds);
    formant.connect(bus).connect(o);
    for (const [m, d] of [[1, 0], [1, 4], [1.5, -3], [2, 2]] as const) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f * m;
      osc.detune.value = d;
      osc.connect(formant);
      osc.start(t);
      osc.stop(t + seconds + 0.1);
    }
  },

  /** The fire-breather's plume. */
  whoosh(vol: number) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01;
    const n = noise(c, t, 1.3);
    const bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    bp.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    const g = c.createGain();
    env(g, t, 0.55 * vol, 0.08, 1.1);
    n.connect(bp).connect(g).connect(o);
  },

  /** Knucklebones rattling in a cup and tumbling across the board. */
  dice(vol: number) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t0 = c.currentTime + 0.01;
    for (let k = 0; k < 9; k++) {
      const t = t0 + k * 0.045 + (k > 5 ? 0.25 + (k - 6) * 0.09 : 0) + Math.random() * 0.02;
      const n = noise(c, t, 0.03);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 1800;
      bp.Q.value = 6;
      const g = c.createGain();
      env(g, t, 0.4 * vol, 0.001, 0.03);
      n.connect(bp).connect(g).connect(o);
    }
  },

  /** Coins chinking (winnings, tossed into the well). */
  coins(vol: number) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t0 = c.currentTime + 0.01;
    for (let k = 0; k < 5; k++) {
      const t = t0 + k * 0.07 + Math.random() * 0.03;
      const osc = c.createOscillator();
      osc.frequency.value = 3200 + Math.random() * 1600;
      const g = c.createGain();
      env(g, t, 0.07 * vol, 0.001, 0.18);
      osc.connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  },

  /** A splash (a bucket, a coin in the Great Well). */
  splash(vol: number) {
    if (!audible(vol)) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01;
    const n = noise(c, t, 0.5);
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const g = c.createGain();
    env(g, t, 0.3 * vol, 0.01, 0.4);
    n.connect(lp).connect(g).connect(o);
  },
};

/** A crowd murmur bed: a filtered-noise loop whose level follows how close the bazaar is. */
export class Murmur {
  private gain: GainNode | null = null;
  private level = 0;
  set(target: number, dt: number) {
    this.level += (target - this.level) * Math.min(1, dt * 1.5);
    if (!sfx.enabled || this.level < 0.005) {
      if (this.gain) this.gain.gain.value = 0;
      return;
    }
    if (!this.gain) {
      const { c, o } = audio();
      const n = c.createBufferSource();
      n.buffer = noiseBuf;
      n.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 0.8;
      // A slow wobble in the filter: voices rising and falling.
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.37;
      const depth = c.createGain();
      depth.gain.value = 140;
      lfo.connect(depth).connect(bp.frequency);
      this.gain = c.createGain();
      this.gain.gain.value = 0;
      n.connect(bp).connect(this.gain).connect(o);
      n.start();
      lfo.start();
    }
    this.gain.gain.value = this.level * 0.09;
  }
}

/** A little Hijaz tune for the street oud: [step, beats] pairs. */
export const OUD_TUNE: [number, number][] = [
  [0, 1], [1, 0.5], [2, 0.5], [3, 1], [4, 1], [3, 0.5], [2, 0.5], [1, 1], [0, 2],
  [4, 0.5], [5, 0.5], [6, 1], [7, 1], [6, 0.5], [5, 0.5], [4, 1], [3, 1], [2, 0.5], [1, 0.5], [0, 2],
  [7, 0.5], [6, 0.5], [5, 0.5], [4, 0.5], [3, 1], [4, 0.5], [3, 0.5], [2, 1], [1, 1], [0, 3],
];
/** The maqsum rhythm: doum tek - tek doum - tek - (eight beats of a half beat each). */
export const MAQSUM: ('doum' | 'tek' | null)[] = ['doum', 'tek', null, 'tek', 'doum', null, 'tek', null];
