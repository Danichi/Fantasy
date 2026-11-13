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
  lower?: THREE.AnimationAction;
  w: number;
  target: number;
  time: number;
  fadeIn: number;
  fadeOut: number;
  /** clip seconds per real second, measured while it's driven; a clip fading out keeps this pace */
  rate?: number;
  prevTime?: number;
  fresh?: boolean;
}

/** Fade weights ease in and out (a linear ramp starts and stops the blend with a jolt). */
const ease = (w: number) => w * w * (3 - 2 * w);

export interface LocoInput {
  /** horizontal velocity in the character frame, m/s (+X left, +Z forward) */
  local: { x: number; z: number };
  grounded: boolean;
  /**
   * strafing (locked on, shield up, aiming; the default): blend the directional
   * clips by the way you're moving. false: the body leads, only forward clips play.
   */
  strafe?: boolean;
}

/** Bones whose swing the sprint stride lengthens, and by how much of the stretch. */
const STRIDE_BONES: [string, number][] = [
  ['LeftUpLeg', 1], ['RightUpLeg', 1], ['LeftLeg', 0.6], ['RightLeg', 0.6],
  ['LeftArm', 0.7], ['RightArm', 0.7], ['LeftForeArm', 0.5], ['RightForeArm', 0.5],
];

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
/** q raised to the power k (its rotation angle scaled by k, same axis). */
function powQuat(q: THREE.Quaternion, k: number) {
  const w = Math.max(-1, Math.min(1, q.w));
  const half = Math.acos(w);
  const s = Math.sin(half);
  if (s < 1e-5) return q;
  const f = Math.sin(half * k) / s;
  return q.set(q.x * f, q.y * f, q.z * f, Math.cos(half * k));
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
  private moveW = 0;
  /** smoothed travel direction for the clip blend (character frame) */
  private dirX = 0;
  private dirZ = 1;
  /** standing pose of the stride bones (the idle clip), the zero the sprint stride scales from */
  private strideRef: { b: THREE.Bone; q: THREE.Quaternion; k: number }[] | null = null;
  /** how much longer than the clip's own stride the legs are reaching (1 = as authored) */
  stride = 1;
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

  private action(key: string, upperOnly = false, lowerOnly = false) {
    const id = upperOnly ? key + ':upperOnly' : lowerOnly ? key + ':lowerOnly' : key;
    let a = this.actions.get(id);
    if (!a) {
      const clip = this.char.clips.get(key);
      if (!clip) return null;
      a = this.mixer.clipAction(upperOnly || lowerOnly ? filterClip(clip, lowerOnly) : clip);
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
    // A clip handing over to another fades out in step with the newcomer.
    for (const s of this.full.values()) if (s.key !== key) {
      s.target = 0;
      if (key) s.fadeOut = Math.max(s.fadeOut, fadeIn);
    }
    if (!key) return;
    let s = this.full.get(key);
    const action = s?.action ?? this.action(key, true);
    if (!action) return;
    if (!s) {
      s = { key, action, lower: this.action(key, false, true) ?? undefined, w: 0, target: 1, time, fadeIn, fadeOut };
      this.full.set(key, s);
    }
    s.target = 1;
    s.prevTime = s.time;
    s.fresh = true;
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
    for (const s of this.full.values()) w += ease(s.w);
    return Math.min(1, w);
  }

  /** How much locomotion may pass through the lower half of a full-body action. */
  mobility = 0;

  /** Advance fades and locomotion, then pose the skeleton. */
  update(dt: number, loco: LocoInput) {
    // Fades.
    const fade = (m: Map<string, OneShot>) => {
      for (const [k, s] of m) {
        const rate = s.target > s.w ? 1 / Math.max(0.01, s.fadeIn) : 1 / Math.max(0.01, s.fadeOut);
        s.w = s.target > s.w ? Math.min(s.target, s.w + rate * dt) : Math.max(s.target, s.w - rate * dt);
        if (s.w <= 0 && s.target <= 0) {
          s.action.setEffectiveWeight(0);
          s.lower?.setEffectiveWeight(0);
          m.delete(k);
        }
      }
    };
    fade(this.full);
    fade(this.upper);
    // A clip that's fading out plays on at its own pace rather than freezing
    // mid-swing (so a combo's follow-through flows into the next cut).
    for (const s of this.full.values()) {
      if (s.fresh) {
        if (dt > 0 && s.prevTime !== undefined && s.time >= s.prevTime) s.rate = Math.min(3, (s.time - s.prevTime) / dt);
        s.fresh = false;
      } else if (s.target <= 0 && s.rate) s.time += s.rate * dt;
    }
    const fullW = this.fullWeight;
    let upperW = 0;
    for (const s of this.upper.values()) upperW += ease(s.w);
    upperW = Math.min(1, upperW);

    // Full-body one-shots: split the available weight in proportion.
    let sumFull = 0;
    for (const s of this.full.values()) sumFull += ease(s.w);
    for (const s of this.full.values()) {
      s.action.time = Math.min(s.time, s.action.getClip().duration - 1e-4);
      const weight = sumFull > 0 ? ease(s.w) / Math.max(1, sumFull) : 0;
      s.action.setEffectiveWeight(weight);
      if (s.lower) { s.lower.time = s.action.time; s.lower.setEffectiveWeight(weight * (1 - this.mobility)); }
    }
    for (const s of this.upper.values()) {
      const d = s.action.getClip().duration;
      const loops = this.char.clipInfo.get(s.key)?.loop;
      s.action.time = loops ? s.time % d : Math.min(s.time, d - 1e-4);
      s.action.setEffectiveWeight(ease(s.w) * (1 - fullW) / Math.max(1, upperW));
    }

    // Locomotion.
    const speed = Math.hypot(loco.local.x, loco.local.z);
    const baseW = 1 - fullW;
    const legW = 1 - fullW * (1 - this.mobility);
    // (eased, so a quick stop lets the legs settle rather than snapping to idle)
    const moveWant = loco.grounded ? smoothstep(0.05, 0.9, speed) : 0.3;
    this.moveW += (moveWant - this.moveW) * (1 - Math.exp(-(moveWant > this.moveW ? 18 : 9) * dt));
    const moveW = dt > 0 ? this.moveW : (this.moveW = moveWant);
    const idleW = 1 - moveW;
    if (this.idle) {
      this.idleTime = (this.idleTime + dt) % this.idle.dur;
      this.idle.lower.time = this.idle.upper.time = this.idleTime;
      this.idle.lower.setEffectiveWeight(idleW * legW);
      this.idle.upper.setEffectiveWeight(idleW * baseW * (1 - upperW));
    }
    if (this.loco.length) {
      // Free movement plays the forward clips; strafing blends by direction.
      // Either way the direction eases round, so the blend never pops.
      let tx = 0, tz = 1;
      if ((loco.strafe ?? true) && speed > 0.15) {
        tx = loco.local.x / speed;
        tz = loco.local.z / speed;
      }
      const kd = 1 - Math.exp(-12 * dt);
      this.dirX += (tx - this.dirX) * kd;
      this.dirZ += (tz - this.dirZ) * kd;
      const dl = Math.hypot(this.dirX, this.dirZ) || 1;
      const nx = this.dirX / dl, nz = this.dirZ / dl;
      // Cardinal direction weights; fall back to forward when a direction is missing.
      const dirW = (d: [number, number]) => Math.max(0, d[0] * nx + d[1] * nz);
      const weights: number[] = [];
      let sum = 0;
      for (const l of this.loco) {
        const dw = dirW(l.dir);
        // Walk <-> run tier by speed, using this direction's walk/run speeds.
        // (directions are measured from the clips, so pair by "the same way", not exact equality)
        const same = (o: LocoClip) => o.dir[0] * l.dir[0] + o.dir[1] * l.dir[1] > 0.9;
        const walk = this.loco.find((o) => o.tier === 'walk' && same(o));
        const run = this.loco.find((o) => o.tier === 'run' && same(o));
        const t = walk && run ? smoothstep(walk.speed, run.speed, speed) : l.tier === 'run' ? 1 : 0;
        const tw = l.tier === 'run' ? t : 1 - t;
        const w = dw * dw * tw; // squared: favour the dominant direction
        weights.push(w);
        sum += w;
      }
      // Shared phase so feet stay in step when clips blend. Past a clip's own
      // pace the legs quicken only partly; the rest is a longer stride (a sprint
      // reaches out rather than pedalling the jog twice as fast).
      let rate = 0;
      let over = 0;
      this.loco.forEach((l, i) => {
        const w = sum > 0 ? weights[i] / sum : 0;
        const r = speed / l.speed;
        const play = r <= 1 ? r : Math.min(1.6, 1 + (r - 1) * 0.55);
        rate += (w * play) / l.dur;
        over += w * (r / Math.max(1e-3, play));
      });
      if (sum <= 0) rate = 0;
      const strideWant = sum > 0 && loco.grounded ? Math.min(1.35, Math.max(1, over)) : 1;
      this.stride += (strideWant - this.stride) * (1 - Math.exp(-8 * dt));
      this.phase = (this.phase + rate * dt) % 1;
      this.loco.forEach((l, i) => {
        const w = sum > 0 ? (weights[i] / sum) * moveW * baseW : 0;
        l.lower.time = l.upper.time = this.phase * l.dur;
        l.lower.setEffectiveWeight(sum > 0 ? weights[i] / sum * moveW * legW : 0);
        l.upper.setEffectiveWeight(w * (1 - upperW));
      });
    }
    this.char.animate(0);
    // The standing pose, taken once from a frame of pure idle.
    if (!this.strideRef && this.idle && moveW < 0.01 && fullW < 0.01 && upperW < 0.01) {
      this.strideRef = STRIDE_BONES.map(([n, k]) => ({ b: this.char.bone(n)!, k })).filter((r) => r.b).map((r) => ({ ...r, q: r.b.quaternion.clone() }));
    }
    // Longer stride: scale each limb's swing away from standing.
    const reach = (this.stride - 1) * moveW * baseW;
    if (this.strideRef && reach > 0.002) {
      for (const r of this.strideRef) {
        if (r.k < 0.6 && upperW > 0.01) continue; // (forearms hold a raised shield)
        const kk = 1 + reach * r.k;
        _qa.copy(r.q).invert().multiply(r.b.quaternion); // swing from standing
        if (_qa.w < 0) _qa.set(-_qa.x, -_qa.y, -_qa.z, -_qa.w);
        r.b.quaternion.copy(_qb.copy(r.q).multiply(powQuat(_qa, kk)));
      }
    }
  }

  /** Current locomotion phase (0..1), used for footsteps. */
  get locoPhase() {
    return this.phase;
  }

  stopAll() {
    for (const s of this.full.values()) { s.action.setEffectiveWeight(0); s.lower?.setEffectiveWeight(0); }
    for (const s of this.upper.values()) s.action.setEffectiveWeight(0);
    this.full.clear();
    this.upper.clear();
  }
}
