import * as THREE from 'three';
import { Character, shortBoneName } from './character';
import { smoothstep } from '../core/math';

// ---------------------------------------------------------------------------
// Animation layers driven explicitly every rendered frame. The mixer is only
// an evaluator: every action has timeScale 0 and we set its time and weight
// ourselves, so poses always match gameplay time exactly (charge holds,
// hit-stop slow motion, render interpolation between sim steps).
//
//   locomotion  idle + directional walk/run clips, blended by the character's
//               local velocity and sharing one foot phase; split into lower
//               and upper halves so an upper-body layer can override the arms
//   upper       upper-body override (holding block) or one-shot (block impact)
//   full        full-body one-shots (attacks, casts, reactions) cross-fading
// ---------------------------------------------------------------------------

const LOWER_BONES = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;

interface Split {
  lower: THREE.AnimationAction;
  upper: THREE.AnimationAction;
  dur: number;
}

interface LocoClip extends Split {
  key: string;
  speed: number; // m/s at 1x
  dir: [number, number]; // travel direction in the character frame (+X left, +Z forward)
  tier: 'walk' | 'run';
}

interface OneShot {
  key: string;
  action: THREE.AnimationAction;
  w: number;
  target: number;
  time: number;
  fadeIn: number;
  fadeOut: number;
}

export interface LocoInput {
  /** horizontal velocity in the character frame, m/s (+X left, +Z forward) */
  local: { x: number; z: number };
  grounded: boolean;
}

function filterClip(clip: THREE.AnimationClip, lower: boolean) {
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => LOWER_BONES.test(shortBoneName(t.name.split('.')[0])) === lower);
  c.name = `${clip.name}:${lower ? 'lower' : 'upper'}`;
  return c;
}

export class Animator {
  private mixer: THREE.AnimationMixer;
  private idle: Split | null = null;
  private loco: LocoClip[] = [];
  private phase = 0;
  private idleTime = 0;
  private full = new Map<string, OneShot>();
  private upper = new Map<string, OneShot>();
  private actions = new Map<string, THREE.AnimationAction>();
  /** true when real clips drive locomotion (otherwise the procedural rig does most of the work) */
  readonly hasLocomotion: boolean;

  constructor(private char: Character) {
    this.mixer = char.mixer;
    const split = (key: string): Split | null => {
      const clip = char.clips.get(key);
      if (!clip) return null;
      const mk = (c: THREE.AnimationClip) => {
        const a = this.mixer.clipAction(c);
        a.play();
        a.timeScale = 0;
        a.setEffectiveWeight(0);
        return a;
      };
      return { lower: mk(filterClip(clip, true)), upper: mk(filterClip(clip, false)), dur: clip.duration };
    };
    this.idle = split('idle');
    const specs: [string, 'walk' | 'run', [number, number], number][] = [
      ['walk', 'walk', [0, 1], 1.5], ['run', 'run', [0, 1], 4.2],
      ['walk_back', 'walk', [0, -1], 1.1], ['run_back', 'run', [0, -1], 4.2],
      ['strafe_l', 'walk', [1, 0], 1.1], ['strafe_r', 'walk', [-1, 0], 1.2],
      ['strafe_run_l', 'run', [1, 0], 3.4], ['strafe_run_r', 'run', [-1, 0], 3.4],
    ];
    const hipsH = char.bone('Hips')?.getWorldPosition(new THREE.Vector3()).y ?? 1;
    for (const [key, tier, dir, fallbackSpeed] of specs) {
      const s = split(key);
      if (!s) continue;
      const info = char.clipInfo.get(key);
      const speed = info?.speedRatio ? info.speedRatio * hipsH : fallbackSpeed;
      this.loco.push({ ...s, key, tier, dir: (info?.dir as [number, number]) ?? dir, speed });
    }
    this.hasLocomotion = this.loco.some((l) => l.tier === 'run') && !!this.idle;
  }

  private action(key: string, upperOnly = false) {
    const id = upperOnly ? key + ':upperOnly' : key;
    let a = this.actions.get(id);
    if (!a) {
      const clip = this.char.clips.get(key);
      if (!clip) return null;
      a = this.mixer.clipAction(upperOnly ? filterClip(clip, false) : clip);
      a.play();
      a.timeScale = 0;
      a.setEffectiveWeight(0);
      this.actions.set(id, a);
    }
    return a;
  }

  has(key: string) {
    return this.char.clips.has(key);
  }

  duration(key: string) {
    return this.char.clips.get(key)?.duration ?? 0;
  }

  /**
   * Set the full-body clip for this frame (null = none). Changing the key
   * cross-fades from the previous clip.
   */
  setFull(key: string | null, time: number, fadeIn = 0.12, fadeOut = 0.18) {
    for (const s of this.full.values()) if (s.key !== key) s.target = 0;
    if (!key) return;
    let s = this.full.get(key);
    const action = s?.action ?? this.action(key);
    if (!action) return;
    if (!s) {
      s = { key, action, w: 0, target: 1, time, fadeIn, fadeOut };
      this.full.set(key, s);
    }
    s.target = 1;
    s.time = time;
    s.fadeIn = fadeIn;
    s.fadeOut = fadeOut;
  }

  /** Upper-body layer (looping or one-shot); weight fades toward `on`. */
  setUpper(key: string, on: boolean, time: number, fade = 0.12) {
    let s = this.upper.get(key);
    if (!s) {
      if (!on) return;
      const action = this.action(key, true);
      if (!action) return;
      s = { key, action, w: 0, target: 1, time, fadeIn: fade, fadeOut: fade };
      this.upper.set(key, s);
    }
    s.target = on ? 1 : 0;
    s.time = time;
  }

  get fullWeight() {
    let w = 0;
    for (const s of this.full.values()) w += s.w;
    return Math.min(1, w);
  }

  /** Advance fades and locomotion, then pose the skeleton. */
  update(dt: number, loco: LocoInput) {
    // Fades.
    const fade = (m: Map<string, OneShot>) => {
      for (const [k, s] of m) {
        const rate = s.target > s.w ? 1 / Math.max(0.01, s.fadeIn) : 1 / Math.max(0.01, s.fadeOut);
        s.w = s.target > s.w ? Math.min(s.target, s.w + rate * dt) : Math.max(s.target, s.w - rate * dt);
        if (s.w <= 0 && s.target <= 0) {
          s.action.setEffectiveWeight(0);
          m.delete(k);
        }
      }
    };
    fade(this.full);
    fade(this.upper);
    const fullW = this.fullWeight;
    let upperW = 0;
    for (const s of this.upper.values()) upperW += s.w;
    upperW = Math.min(1, upperW);

    // Full-body one-shots: split the available weight in proportion.
    let sumFull = 0;
    for (const s of this.full.values()) sumFull += s.w;
    for (const s of this.full.values()) {
      s.action.time = Math.min(s.time, s.action.getClip().duration - 1e-4);
      s.action.setEffectiveWeight(sumFull > 0 ? (s.w / Math.max(1, sumFull)) : 0);
    }
    for (const s of this.upper.values()) {
      const d = s.action.getClip().duration;
      const loops = this.char.clipInfo.get(s.key)?.loop;
      s.action.time = loops ? s.time % d : Math.min(s.time, d - 1e-4);
      s.action.setEffectiveWeight(s.w * (1 - fullW) / Math.max(1, upperW));
    }

    // Locomotion.
    const speed = Math.hypot(loco.local.x, loco.local.z);
    const baseW = 1 - fullW;
    const moveW = loco.grounded ? smoothstep(0.05, 0.9, speed) : 0.3;
    const idleW = 1 - moveW;
    if (this.idle) {
      this.idleTime = (this.idleTime + dt) % this.idle.dur;
      this.idle.lower.time = this.idle.upper.time = this.idleTime;
      this.idle.lower.setEffectiveWeight(idleW * baseW);
      this.idle.upper.setEffectiveWeight(idleW * baseW * (1 - upperW));
    }
    if (this.loco.length) {
      const nx = speed > 1e-3 ? loco.local.x / speed : 0, nz = speed > 1e-3 ? loco.local.z / speed : 1;
      // Cardinal direction weights; fall back to forward when a direction is missing.
      const dirW = (d: [number, number]) => Math.max(0, d[0] * nx + d[1] * nz);
      const weights: number[] = [];
      let sum = 0;
      for (const l of this.loco) {
        const dw = dirW(l.dir);
        // Walk <-> run tier by speed, using this direction's walk/run speeds.
        const walk = this.loco.find((o) => o.tier === 'walk' && o.dir[0] === l.dir[0] && o.dir[1] === l.dir[1]);
        const run = this.loco.find((o) => o.tier === 'run' && o.dir[0] === l.dir[0] && o.dir[1] === l.dir[1]);
        const t = walk && run ? smoothstep(walk.speed, run.speed, speed) : l.tier === 'run' ? 1 : 0;
        const tw = l.tier === 'run' ? t : 1 - t;
        const w = dw * dw * tw; // squared: favour the dominant direction
        weights.push(w);
        sum += w;
      }
      // Shared phase so feet stay in step when clips blend.
      let rate = 0;
      this.loco.forEach((l, i) => {
        const w = sum > 0 ? weights[i] / sum : 0;
        rate += (w * Math.min(1.7, speed / l.speed)) / l.dur;
      });
      if (sum <= 0) rate = 0;
      this.phase = (this.phase + rate * dt) % 1;
      this.loco.forEach((l, i) => {
        const w = sum > 0 ? (weights[i] / sum) * moveW * baseW : 0;
        l.lower.time = l.upper.time = this.phase * l.dur;
        l.lower.setEffectiveWeight(w);
        l.upper.setEffectiveWeight(w * (1 - upperW));
      });
    }
    this.char.animate(0);
  }

  /** Current locomotion phase (0..1), used for footsteps. */
  get locoPhase() {
    return this.phase;
  }

  stopAll() {
    for (const s of this.full.values()) s.action.setEffectiveWeight(0);
    for (const s of this.upper.values()) s.action.setEffectiveWeight(0);
    this.full.clear();
    this.upper.clear();
  }
}
