import { sfx } from '../../audio/sfx';

// The wilds' own synthesised sounds (Web Audio, no samples), in the style of
// audio/sfx.ts: a wolf's howl, an orc war-horn, the creak and groan of a
// waking tree, a charging beast's snort, and a spectral chime. They honour
// the shared sfx.enabled switch.

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.6;
    out.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { c: ctx, o: out! };
}

function noise(c: AudioContext, t0: number, dur: number) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.start(t0, Math.random());
  s.stop(t0 + dur);
  return s;
}

function env(g: GainNode, t0: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

/** Volume by distance to the listener (the player), so far-off howls are faint. */
const falloff = (dist: number) => Math.max(0, 1 - dist / 140) ** 1.4;

export const wildsSfx = {
  /** A long rising-then-falling howl; `pitch` > 1 for a smaller wolf, < 1 for a huge one. */
  howl(dist = 0, pitch = 1, volume = 0.5) {
    const v = volume * falloff(dist);
    if (!sfx.enabled || v < 0.01) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.02, dur = 2.6 / Math.sqrt(pitch);
    const g = c.createGain();
    env(g, t, v, 0.35, dur - 0.9, 0.55);
    const f0 = 330 * pitch;
    for (const det of [0, 7]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0 * 0.72, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.3, t + dur * 0.35);
      osc.frequency.setValueAtTime(f0 * 1.3, t + dur * 0.6);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.82, t + dur);
      osc.detune.value = det;
      // A little wobble in the throat.
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = c.createGain();
      lg.gain.value = 9;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
    // Breath.
    const n = noise(c, t, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f0 * 2.4;
    bp.Q.value = 3;
    const ng = c.createGain();
    env(ng, t, v * 0.12, 0.3, dur - 0.8, 0.5);
    n.connect(bp).connect(ng).connect(o);
    g.connect(o);
  },

  /** A deep orc war-horn: two blasts of buzzing brass. */
  warHorn(dist = 0, volume = 0.55) {
    const v = volume * falloff(dist * 0.6);
    if (!sfx.enabled || v < 0.01) return;
    const { c, o } = audio();
    for (const [start, len] of [[0, 0.9], [1.1, 1.8]]) {
      const t = c.currentTime + 0.02 + start;
      const g = c.createGain();
      env(g, t, v, 0.25, len - 0.45, 0.3);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.linearRampToValueAtTime(1100, t + 0.3);
      lp.Q.value = 4;
      for (const f of [98, 98.8, 147]) {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * 0.94, t);
        osc.frequency.linearRampToValueAtTime(f, t + 0.2);
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + len + 0.1);
      }
      lp.connect(g).connect(o);
    }
  },

  /** Old wood twisting: a creak, then a groan. */
  creak(dist = 0, volume = 0.5) {
    const v = volume * falloff(dist * 0.7);
    if (!sfx.enabled || v < 0.01) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.02, dur = 1.8;
    const n = noise(c, t, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 18;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = c.createGain();
    env(g, t, v * 1.6, 0.1, dur - 0.5, 0.4);
    // The grain: rapid ticks gate the noise.
    const tick = c.createOscillator();
    tick.type = 'square';
    tick.frequency.setValueAtTime(34, t);
    tick.frequency.linearRampToValueAtTime(14, t + dur);
    const tg = c.createGain();
    tg.gain.value = 0.5;
    tick.connect(tg).connect(g.gain);
    tick.start(t);
    tick.stop(t + dur);
    n.connect(bp).connect(g).connect(o);
    const sub = c.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(70, t + 0.4);
    sub.frequency.exponentialRampToValueAtTime(42, t + dur);
    const sg = c.createGain();
    env(sg, t + 0.4, v * 0.5, 0.3, 0.6, 0.5);
    sub.connect(sg).connect(o);
    sub.start(t + 0.4);
    sub.stop(t + dur + 0.2);
  },

  /** A charging beast: a snort and the thunder of hooves building. */
  charge(dist = 0, volume = 0.45) {
    const v = volume * falloff(dist);
    if (!sfx.enabled || v < 0.01) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.02;
    const n = noise(c, t, 0.35);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = c.createGain();
    env(g, t, v * 0.7, 0.02, 0.08, 0.2);
    n.connect(hp).connect(g).connect(o);
    for (let k = 0; k < 6; k++) {
      const tk = t + 0.3 + k * 0.16;
      const th = c.createOscillator();
      th.type = 'sine';
      th.frequency.setValueAtTime(90, tk);
      th.frequency.exponentialRampToValueAtTime(40, tk + 0.12);
      const tg = c.createGain();
      env(tg, tk, v * (0.4 + k * 0.1), 0.005, 0.02, 0.1);
      th.connect(tg).connect(o);
      th.start(tk);
      th.stop(tk + 0.16);
    }
  },

  /** A pained squeal or yelp as a beast staggers. */
  yelp(dist = 0, pitch = 1, volume = 0.35) {
    const v = volume * falloff(dist);
    if (!sfx.enabled || v < 0.01) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.01;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(380 * pitch, t + 0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200 * pitch;
    const g = c.createGain();
    env(g, t, v, 0.01, 0.08, 0.22);
    osc.connect(lp).connect(g).connect(o);
    osc.start(t);
    osc.stop(t + 0.4);
  },

  /** A cold spectral chime (ghost stags, wisps, a lair's ward breaking). */
  chime(dist = 0, volume = 0.4) {
    const v = volume * falloff(dist * 0.5);
    if (!sfx.enabled || v < 0.01) return;
    const { c, o } = audio();
    const t = c.currentTime + 0.02;
    [523.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = c.createGain();
      env(g, t + i * 0.09, v * (0.5 - i * 0.08), 0.01, 0.05, 1.6);
      osc.connect(g).connect(o);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 1.8);
    });
  },
};
