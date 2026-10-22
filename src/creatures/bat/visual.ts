import * as THREE from 'three';
import { BAT_RIG, batGeometry, membraneMaterial } from './model';
import { eyeMaterial, hardMaterial, skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';

// A bat on the wing: a full flap is a deep downstroke with the wings spread
// wide, then an upstroke with the arms and fingers folding in to cut the air.
// It glides on outstretched wings, sweeps them back to dive, hangs folded
// from a roost, flops on the ground when knocked down and falls limp in death.

export type BatPose = 'fly' | 'glide' | 'dive' | 'hang' | 'grounded' | 'dead';

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const g = batGeometry();
  const skin = skinMaterial({ relief: 1.2, strand: 260, drift: 0.12, rough: 0.82, wetRough: 0.3, sheen: 0.45, sheenColor: 0xb89a74 });
  const fur = tuftMaterial({ sheen: 0.55, sheenColor: 0xc8a878, rough: 0.8 });
  const wing = membraneMaterial();
  const bone = hardMaterial(0xffffff, { vertexColors: true, rough: 0.6, clearcoat: 0.1 });
  const eye = eyeMaterial(0x060303);
  eye.emissive = new THREE.Color(0x2a1204);
  eye.emissiveIntensity = 0.8;
  const fang = hardMaterial(0xffffff, { vertexColors: true, rough: 0.35, clearcoat: 0.5 });
  return { g, skin, fur, wing, bone, eye, fang };
}
export function batShared() {
  return (shared ??= makeShared());
}
export function tickBatFur(dt: number) {
  if (shared) shared.fur.time.value += dt;
}

const SIDES = [['L', 1], ['R', -1]] as const;

export class BatVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  private fur: THREE.SkinnedMesh;
  private detail: THREE.SkinnedMesh[] = [];
  pose: BatPose = 'fly';
  poseT = 0;
  /** flap cycles per second */
  flapRate = 5.5;
  private phase = Math.random();
  private t = Math.random() * 10;
  private spread = 1;
  private sweep = 0;
  private hang = 0;
  private bank = 0;
  private pitch = 0;
  jaw = 0;

  constructor(opts: { scale?: number } = {}) {
    const S = batShared();
    const rig = BAT_RIG.make();
    this.bones = rig.bones;
    this.skeleton = rig.skeleton;
    this.root.add(rig.root);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.castShadow = shadow;
      this.root.add(m);
      return m;
    };
    mk(S.g.body, S.skin);
    this.fur = mk(S.g.fur, S.fur.mat);
    mk(S.g.wings, S.wing);
    this.detail.push(mk(S.g.bones, S.bone, false), mk(S.g.eyes, S.eye, false), mk(S.g.fangs, S.fang, false));
    this.root.scale.setScalar(opts.scale ?? 1);
  }

  setPose(p: BatPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  lod(camDist: number, furOn = true) {
    this.fur.visible = furOn && camDist < 22;
    for (const d of this.detail) d.visible = camDist < 26;
  }

  /** Heading change rate (rad/s) for banking into turns, and climb rate for pitch. */
  update(dt: number, turn: number, climb: number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones;
    for (const k of Object.keys(b)) b[k].quaternion.identity();
    const k = (r: number) => 1 - Math.exp(-dt * r);
    const p = this.pose;
    // How spread / swept back / folded the wings are in this pose.
    const spread = p === 'fly' || p === 'glide' ? 1 : p === 'dive' ? 0.75 : p === 'grounded' ? 0.6 : p === 'dead' ? 0.5 : 0;
    const sweep = p === 'dive' ? 1 : 0;
    const hang = p === 'hang' ? 1 : 0;
    this.spread += (spread - this.spread) * k(8);
    this.sweep += (sweep - this.sweep) * k(10);
    this.hang += (hang - this.hang) * k(4);
    const rate = p === 'fly' ? this.flapRate : p === 'grounded' ? 7 : p === 'dive' ? 2 : p === 'glide' ? 0.8 : 0;
    this.phase = (this.phase + rate * dt) % 1;
    const ph = this.phase * Math.PI * 2;
    // Amplitude: deep in flight, a flutter in a glide, frantic on the ground.
    const amp = p === 'fly' ? 0.85 : p === 'glide' ? 0.08 : p === 'grounded' ? 0.6 : p === 'dive' ? 0.12 : 0;
    const stroke = Math.cos(ph) * amp; // +1 top of the stroke, -1 bottom
    const fold = p === 'fly' || p === 'grounded' ? Math.max(0, -Math.sin(ph)) * 0.7 : 0; // folding on the upstroke
    const limp = p === 'dead' ? 1 : 0;

    for (const [side, s] of SIDES) {
      const sh = b['sh' + side], el = b['el' + side], wr = b['wr' + side];
      // Shoulder: the flap itself, plus dive sweep and folding for the roost.
      const lift = stroke + (p === 'glide' ? 0.12 : 0) - limp * 0.9 - this.hang * 1.3;
      sh.rotation.set(-this.sweep * 0.2, s * (this.sweep * 0.55 + this.hang * 0.5), s * lift);
      // Elbow and wrist: fold toward the body on the upstroke, fully when folded.
      const f = Math.min(1, fold + (1 - this.spread) * 0.8 + this.hang);
      el.rotation.set(0, s * f * 1.6, 0);
      wr.rotation.set(0, s * f * 1.2, s * -0.1 * f);
      for (const d of ['2', '3', '4', '5']) {
        const fan = (d === '2' ? -0.1 : d === '3' ? 0 : d === '4' ? 0.1 : 0.2) * f;
        b[`d${d}${side}`].rotation.set(0, s * (f * 1.1 + fan), s * -0.08 * Math.sin(ph) * amp);
        b[`d${d}${side}t`].rotation.set(0, s * f * 0.5, s * -0.15 * Math.sin(ph) * amp);
      }
      // Legs trail behind in flight, grip up in the roost.
      b['leg' + side].rotation.set(0.2 * Math.sin(ph) * amp - this.hang * 1.2, 0, s * 0.1);
      // Ears: flick now and then.
      b['ear' + side].rotation.set(Math.sin(this.t * 3.1 + s) * 0.06, 0, s * Math.max(0, Math.sin(this.t * 0.9 + s * 2)) * 0.15);
    }
    // Body: rises on the downstroke, banks into turns, noses down in a dive.
    this.bank += (THREE.MathUtils.clamp(-turn * 0.35, -0.7, 0.7) - this.bank) * k(6);
    this.pitch += (THREE.MathUtils.clamp(-climb * 0.12, -0.5, 0.5) + this.sweep * 0.55 - this.pitch) * k(6);
    b.body.position.set(0, -Math.sin(ph) * 0.035 * (p === 'fly' ? 1 : 0.3), 0);
    b.body.rotation.set(this.pitch + limp * 0.3, 0, this.bank + (p === 'grounded' ? Math.sin(ph) * 0.25 : 0));
    // Hanging: upside down from the feet.
    if (this.hang > 0.01) {
      b.body.rotation.x += this.hang * (Math.PI / 2);
      b.body.rotation.z += Math.sin(this.t * 0.8) * 0.05 * this.hang;
    }
    b.head.rotation.set(-this.pitch * 0.5 + Math.sin(this.t * 1.7) * 0.05, Math.sin(this.t * 0.6) * 0.15, 0);
    b.jaw.rotation.set(this.jaw * 0.6, 0, 0);
    b.tail.rotation.set(Math.sin(ph) * 0.15 * amp, 0, 0);
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
