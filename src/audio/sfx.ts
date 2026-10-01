// One-shot sound effects synthesised with Web Audio (no sample files): the
// Gravewood's gate slam, earth rumbles, graves bursting open, zombie groans,
// the abomination's roar and the light that breaks the curse.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    // Two seconds of white noise, shared by every noisy effect.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { c: ctx, out: master! };
}

function noise(c: AudioContext, t0: number, dur: number) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.start(t0, Math.random());
  s.stop(t0 + dur);
  return s;
}

/** Soft-clip curve for grit. */
function shaper(c: AudioContext, amount: number) {
  const ws = c.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  ws.curve = curve;
  return ws;
}

function env(g: GainNode, t0: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

export const sfx = {
  enabled: true,

  /** A huge bellow: detuned growling saws through a sweeping throat, over a sub. */
  roar(volume = 1) {
    if (!this.enabled) return;
    const { c, out } = audio();
    const t = c.currentTime + 0.02, dur = 2.8;
    const bus = c.createGain();
    env(bus, t, 0.9 * volume, 0.18, dur - 1.1, 0.9);
    const grit = shaper(c, 3.5);
    const throat = c.createBiquadFilter();
    throat.type = 'bandpass';
    throat.Q.value = 1.4;
    throat.frequency.setValueAtTime(380, t);
    throat.frequency.linearRampToValueAtTime(950, t + 0.5);
    throat.frequency.linearRampToValueAtTime(620, t + dur * 0.7);
    throat.frequency.linearRampToValueAtTime(300, t + dur);
    grit.connect(throat).connect(bus).connect(out);
    const lfo = c.createOscillator();
    lfo.frequency.value = 9;
    const lfoAmt = c.createGain();
    lfoAmt.gain.value = 7;
    lfo.connect(lfoAmt);
    for (const [base, type] of [[62, 'sawtooth'], [93, 'sawtooth'], [124, 'square']] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.linearRampToValueAtTime(base * 1.15, t + 0.45);
      o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
      lfoAmt.connect(o.frequency);
      const g = c.createGain();
      g.gain.value = type === 'square' ? 0.12 : 0.3;
      o.connect(g).connect(grit);
      o.start(t);
      o.stop(t + dur);
    }
    // Breath: noise through the same throat.
    const n = noise(c, t, dur);
    const ng = c.createGain();
    ng.gain.value = 0.5;
    n.connect(ng).connect(grit);
    // Sub rumble underneath.
    const sub = c.createOscillator();
    sub.frequency.setValueAtTime(48, t);
    sub.frequency.linearRampToValueAtTime(34, t + dur);
    const sg = c.createGain();
    env(sg, t, 0.5 * volume, 0.2, dur - 1, 0.8);
    sub.connect(sg).connect(out);
    sub.start(t);
    sub.stop(t + dur);
    lfo.start(t);
    lfo.stop(t + dur);
  },

  /** Low earth rumble (graves opening, the boss climbing out, stone rising). */
  rumble(seconds = 2, volume = 0.8) {
    if (!this.enabled) return;
    const { c, out } = audio();
    const t = c.currentTime + 0.02;
    const n = noise(c, t, seconds + 0.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110;
    lp.Q.value = 0.7;
    const g = c.createGain();
    env(g, t, 1.4 * volume, Math.min(0.5, seconds * 0.25), seconds * 0.5, seconds * 0.4);
    n.connect(lp).connect(g).connect(out);
  },

  /** A grave bursting open: a thump and a spray of soil. */
  graveBurst(volume = 0.7) {
    if (!this.enabled) return;
    const { c, out } = audio();
    const t = c.currentTime + 0.01;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const og = c.createGain();
    env(og, t, 0.9 * volume, 0.005, 0.05, 0.35);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.5);
    const n = noise(c, t, 0.9);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const ng = c.createGain();
    env(ng, t, 0.35 * volume, 0.01, 0.1, 0.7);
    n.connect(bp).connect(ng).connect(out);
  },

  /** Iron gates slamming: inharmonic ringing partials, a clank and a thud. */
  gateSlam(volume = 1) {
    if (!this.enabled) return;
    const { c, out } = audio();
    const t = c.currentTime + 0.01;
    for (const [f, a, d] of [[196, 0.4, 2.2], [431, 0.3, 1.6], [703, 0.22, 1.2], [1187, 0.14, 0.8], [1733, 0.08, 0.5]]) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      env(g, t, a * volume, 0.003, 0.02, d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.1);
    }
    const n = noise(c, t, 0.4);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = c.createGain();
    env(ng, t, 0.3 * volume, 0.002, 0.03, 0.25);
    n.connect(hp).connect(ng).connect(out);
    const thud = c.createOscillator();
    thud.frequency.setValueAtTime(90, t);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const tg = c.createGain();
    env(tg, t, 0.8 * volume, 0.004, 0.05, 0.3);
    thud.connect(tg).connect(out);
    thud.start(t);
    thud.stop(t + 0.5);
  },

  /** A dead thing's moan: a wavering low voice through a closing mouth. */
  groan(volume = 0.35) {
    if (!this.enabled) return;
    const { c, out } = audio();
    const t = c.currentTime + 0.01, dur = 1.1 + Math.random() * 0.8;
    const base = 85 + Math.random() * 40;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (0.75 + Math.random() * 0.2), t + dur);
    const mouth = c.createBiquadFilter();
    mouth.type = 'bandpass';
    mouth.Q.value = 3;
    mouth.frequency.setValueAtTime(700, t);
    mouth.frequency.linearRampToValueAtTime(380, t + dur);
    const g = c.createGain();
    env(g, t, volume, 0.25, dur - 0.6, 0.35);
    o.connect(mouth).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  },

  /** The curse breaking: a rising shimmer and a bright, held chord. */
  beam(volume = 0.8) {
    if (!this.enabled) return;
    const { c, out } = audio();
    const t = c.currentTime + 0.02, dur = 5;
    const bus = c.createGain();
    env(bus, t, 0.5 * volume, 1.2, dur - 2.6, 1.4);
    // A short feedback echo for air.
    const delay = c.createDelay();
    delay.delayTime.value = 0.23;
    const fb = c.createGain();
    fb.gain.value = 0.45;
    bus.connect(out);
    bus.connect(delay).connect(fb).connect(delay);
    fb.connect(out);
    for (const f of [261.6, 329.6, 392, 523.3, 659.3]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 0.5, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 1.4);
      const g = c.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dur);
    }
    const n = noise(c, t, dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(5000, t + 1.6);
    const ng = c.createGain();
    ng.gain.value = 0.18;
    n.connect(bp).connect(ng).connect(bus);
  },
};
