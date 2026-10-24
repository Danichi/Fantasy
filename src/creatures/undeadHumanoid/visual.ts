import * as THREE from 'three';
import { UNDEAD_RIG, undeadGeometry, type UndeadVariant } from './model';
import { skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';

// The drowned captain and the hanged bandit lord on screen: one skeleton,
// procedural poses. A stiff, dragging walk; the cut (forehand, backhand);
// an overhead chop; the lantern raised (the revenant's call), the arms thrown
// wide (the captain's call to the deep); reeling; and falling to pieces.

export type UndeadPose = 'idle' | 'cut' | 'chop' | 'raise' | 'call' | 'reel' | 'dead';

let mats: {
  body: THREE.MeshPhysicalMaterial;
  ghost: THREE.MeshPhysicalMaterial;
  hair: ReturnType<typeof tuftMaterial>;
  gear: THREE.MeshPhysicalMaterial;
} | null = null;
function getMats() {
  if (mats) return mats;
  const body = skinMaterial({ relief: 1.3, strand: 60, drift: 0.1, rough: 0.75, wetRough: 0.3, sheen: 0.15, sheenColor: 0x9aa890 });
  // The wraith is half there: see-through, and lit a little from within.
  const ghost = skinMaterial({ relief: 1.0, strand: 60, drift: 0.1, rough: 0.85, wetRough: 0.6, sheen: 0.12, sheenColor: 0x6a80a0 });
  ghost.transparent = true;
  ghost.opacity = 0.94;
  ghost.depthWrite = true;
  ghost.emissive = new THREE.Color(0x080c14);
  const hair = tuftMaterial({ sheen: 0.3, sheenColor: 0x8a9a80, rough: 0.8 });
  const gear = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.6 });
  mats = { body, ghost, hair, gear };
  return mats;
}
export function tickUndeadHair(dt: number) {
  if (mats) mats.hair.time.value += dt;
}

const LIGHT: Record<UndeadVariant, number> = { drowned: 0x50ff9a, revenant: 0xffc070, wraith: 0x80b0ff };
const LIGHT_I: Record<UndeadVariant, number> = { drowned: 0.7, revenant: 2.2, wraith: 1.2 };

const RESET = UNDEAD_RIG.bones.map((b) => b.name);

export class UndeadVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private hair: THREE.SkinnedMesh;
  private eyeMat: THREE.MeshBasicMaterial;
  private lampMat: THREE.MeshBasicMaterial | null = null;
  readonly light: THREE.PointLight;
  pose: UndeadPose = 'idle';
  poseT = 0;
  cutSide = 1;
  private t = Math.random() * 10;
  private phase = 0;
  private a: Record<string, number> = {};
  private deadT = 0;
  private base: THREE.Color;

  constructor(readonly variant: UndeadVariant, opts: { scale?: number } = {}) {
    const g = undeadGeometry(variant);
    const M = getMats();
    const rig = UNDEAD_RIG.make();
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
    const skin = variant === 'wraith' ? M.ghost : M.body;
    this.body = mk(g.body, skin);
    this.body.receiveShadow = true;
    this.far = mk(g.far, skin);
    this.far.visible = false;
    this.hair = mk(g.hair, M.hair.mat, false);
    mk(g.gear, M.gear);
    mk(g.weapon, M.gear);
    // Sickly green in the drowned man's sockets; a pale corpse-light in the revenant's.
    this.base = variant === 'drowned' ? new THREE.Color(0.4, 2.2, 1.2) : variant === 'wraith' ? new THREE.Color(0.3, 0.8, 2.2) : new THREE.Color(1.6, 1.4, 0.7);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: this.base.clone() });
    mk(g.eyes, this.eyeMat, false);
    this.light = new THREE.PointLight(LIGHT[variant], LIGHT_I[variant], 6, 1.8);
    if (variant === 'revenant') {
      mk(g.lamp, M.gear);
      // The lantern's flame, carried in the left hand.
      this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.35) });
      const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.15, 6), this.lampMat);
      const hd = UNDEAD_RIG.bones[UNDEAD_RIG.bone('hdL')].at;
      const bone = this.bones.hdL;
      bone.updateMatrixWorld(true);
      flame.position.set(0, -0.18, 0.02);
      void hd;
      bone.add(flame);
      this.light.position.copy(flame.position);
      bone.add(this.light);
    } else {
      this.light.position.set(0, 0.0, 0.35);
      this.bones.head.add(this.light);
    }
    this.root.scale.setScalar(opts.scale ?? 1);
  }

  setPose(p: UndeadPose) {
    if (p === this.pose) return;
    if (p === 'cut') this.cutSide = -this.cutSide;
    this.pose = p;
    this.poseT = 0;
  }
  restart() {
    this.cutSide = -this.cutSide;
    this.poseT = 0;
  }

  /** The Dark taking hold: the eyes (and the lantern) burn violet (0..1). */
  dark(k: number) {
    const v = new THREE.Color(1.4, 0.4, 2.6);
    this.eyeMat.color.copy(this.base).lerp(v, k);
    this.lampMat?.color.setRGB(1.6 - 0.6 * k, 1.0 - 0.7 * k, 0.35 + 1.6 * k);
    this.light.color.setHex(LIGHT[this.variant]).lerp(new THREE.Color(0xa050ff), k);
  }

  lod(camDist: number) {
    const s = this.root.scale.x;
    this.body.visible = camDist < 50 * s;
    this.far.visible = !this.body.visible;
    this.hair.visible = camDist < 25 * s;
  }

  update(dt: number, speed: number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const k = (r: number) => 1 - Math.exp(-dt * r);
    const ss = THREE.MathUtils.smoothstep;
    for (const n of RESET) b[n].quaternion.identity();
    b.pelvis.position.set(0, 1.0, 0);
    const lamp = this.variant === 'revenant';
    // Targets for every joint (radians), eased toward.
    const A: Record<string, number> = {
      lean: 0.12, twist: 0, head: 0.15, headY: Math.sin(t * 0.4) * 0.2, headZ: 0.12, jaw: 0.08, drop: 0,
      shLx: lamp ? -0.9 : 0.05, shLz: 0.12, elL: lamp ? -0.5 : -0.2, shRx: -0.25, shRz: -0.12, elR: -0.5,
      hipLx: 0, hipLz: 0.04, knL: 0.08, hipRx: 0, hipRz: -0.04, knR: 0.08, coat: 0,
    };
    // A stiff, dragging walk: the head lolls, one foot scrapes.
    const walk = Math.min(1, speed / 3);
    if (speed > 0.15 && this.pose === 'idle') {
      this.phase += dt * (3.2 + speed * 1.4);
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const amp = 0.35 + 0.35 * walk;
      A.hipLx = -s * amp; A.hipRx = s * amp * 0.8;
      A.knL = 0.1 + Math.max(0, c) * 0.9 * amp; A.knR = 0.1 + Math.max(0, -c) * 0.5 * amp;
      if (!lamp) A.shLx = s * 0.35 * amp;
      A.shRx = -0.25 - s * 0.25 * amp;
      A.lean = 0.18 + walk * 0.15;
      A.twist = s * 0.12;
      A.headZ = 0.12 + s * 0.08;
      A.drop = -Math.abs(c) * 0.03;
      A.coat = -walk * 0.3;
    } else {
      // Swaying where it stands; the jaw works now and then.
      A.drop = Math.sin(t * 1.3) * 0.006;
      A.twist = Math.sin(t * 0.6) * 0.05;
      A.jaw = 0.08 + Math.max(0, Math.sin(t * 0.9) - 0.7) * 0.8;
    }
    if (this.variant === 'wraith' && this.pose !== 'dead') {
      // It doesn't walk: it drifts a hand's breadth off the ground, the legs
      // trailing under the robe, the arms hanging long.
      A.hipLx = 0.15 + Math.sin(t * 1.1) * 0.05; A.hipRx = 0.1 + Math.sin(t * 1.1 + 1) * 0.05;
      A.knL = 0.35; A.knR = 0.3;
      A.drop = 0.12 + Math.sin(t * 1.6) * 0.04;
      A.lean = 0.15 + walk * 0.25;
      A.coat = -walk * 0.5 + Math.sin(t * 1.3) * 0.05;
      if (this.pose === 'idle') { A.shLx = -0.3 - walk * 0.4 + Math.sin(t * 0.9) * 0.08; A.shRx = -0.3 - walk * 0.4 + Math.sin(t * 0.9 + 1) * 0.08; A.elL = -0.3; A.elR = -0.3; A.shLz = 0.2; A.shRz = -0.2; }
    }
    switch (this.pose) {
      case 'cut': {
        const up = ss(pt, 0, 0.22), down = ss(pt, 0.26, 0.4);
        const s = this.cutSide;
        A.shRx = -1.6 * up + 1.9 * down; A.shRz = -0.4 - 0.9 * s * up + 1.3 * s * down; A.elR = -1.3 * up + 1.0 * down;
        A.twist = 0.5 * s * up - 0.8 * s * down; A.lean = 0.2 + 0.25 * down;
        A.hipLx = -0.45; A.knL = 0.45; A.hipRx = 0.3; A.knR = 0.2; A.jaw = 0.3 * up;
        A.coat = 0.2 * down;
        break;
      }
      case 'chop': {
        // Both arms (or the sword arm) high, then down hard.
        const up = ss(pt, 0, 0.45), down = ss(pt, 0.55, 0.72);
        A.shRx = -2.9 * up + 3.3 * down; A.shRz = -0.15; A.elR = -0.5 * up + 0.4 * down;
        if (!lamp && this.variant !== 'drowned') { A.shLx = -2.6 * up + 3.0 * down; A.shLz = 0.2; A.elL = -0.6 * up; }
        A.lean = -0.15 * up + 0.6 * down; A.head = -0.3 * up + 0.3 * down; A.jaw = 0.5 * up;
        A.hipLx = -0.5 * down; A.knL = 0.6 * down; A.drop = -0.12 * down;
        A.coat = 0.3 * down;
        break;
      }
      case 'raise': {
        // The lantern held high: the dead under the tree get up.
        const r = ss(pt, 0, 0.6) * (1 - ss(pt, 2.2, 2.7));
        A.shLx = -0.9 - 2.0 * r; A.shLz = 0.1; A.elL = -0.5 + 0.4 * r;
        A.head = 0.15 - 0.5 * r; A.lean = 0.12 - 0.25 * r; A.jaw = 0.2 + 0.5 * r;
        A.shRx = -0.2; A.shRz = -0.6 * r;
        break;
      }
      case 'call': {
        // Arms thrown wide, head back: the deep answers.
        const r = ss(pt, 0, 0.6) * (1 - ss(pt, 2.2, 2.7));
        A.shLx = -0.6 * r; A.shLz = 1.4 * r + 0.1; A.elL = -0.2;
        A.shRx = -0.6 * r; A.shRz = -1.4 * r - 0.1; A.elR = -0.2;
        A.head = 0.15 - 0.7 * r; A.lean = 0.12 - 0.3 * r; A.jaw = 0.1 + 0.6 * r * (0.8 + Math.sin(t * 25) * 0.2);
        break;
      }
      case 'reel': {
        const e = Math.exp(-pt * 2.5);
        A.lean = -0.5 * e; A.head = -0.5 * e; A.shLz = 0.9 * e + 0.15; A.shRz = -0.9 * e - 0.15; A.shRx = -0.5 * e; A.jaw = 0.4 * e;
        A.hipLx = -0.35 * e; A.knL = 0.5 * e; A.headZ = 0.4 * e;
        break;
      }
      case 'dead': {
        // To the knees, then down on its face.
        this.deadT += dt;
        const kn = ss(this.deadT, 0, 0.5), fall = ss(this.deadT, 0.6, 1.2);
        b.pelvis.position.set(0, 1.0 - 0.45 * kn - 0.35 * fall, 0.15 * fall);
        b.pelvis.rotation.x = 1.2 * fall;
        A.hipLx = -0.3 * kn + 0.3 * fall; A.hipRx = -0.2 * kn + 0.3 * fall; A.knL = 1.9 * kn - 1.2 * fall; A.knR = 1.9 * kn - 1.2 * fall;
        A.shLx = -0.6 * fall; A.shLz = 0.3 + 0.6 * fall; A.shRx = -0.4 * fall; A.shRz = -0.3 - 0.6 * fall;
        A.lean = 0.3 * kn; A.head = 0.6 * kn - 0.5 * fall; A.headY = 0.4 * fall; A.jaw = 0.5; A.drop = 0;
        break;
      }
    }
    if (this.pose !== 'dead') this.deadT = 0;
    const fast = this.pose === 'cut' || this.pose === 'chop' ? 30 : this.pose === 'reel' ? 20 : 8;
    const a = this.a;
    for (const key of Object.keys(A)) a[key] = (a[key] ?? A[key]) + (A[key] - (a[key] ?? A[key])) * k(fast);
    b.pelvis.position.y += a.drop;
    b.spine.rotation.set(a.lean * 0.5, a.twist * 0.5, 0);
    b.chest.rotation.set(a.lean * 0.5, a.twist * 0.5, 0);
    b.neck.rotation.set(a.head * 0.4 - a.lean * 0.4, a.headY * 0.4, a.headZ * 0.4);
    b.head.rotation.set(a.head * 0.6 - a.lean * 0.3, a.headY * 0.6, a.headZ * 0.6);
    b.jaw.rotation.x = a.jaw;
    b.coat.rotation.x = a.coat - (a.hipLx + a.hipRx) * 0.25;
    b.shL.rotation.set(a.shLx, 0, a.shLz);
    b.elL.rotation.set(a.elL, 0, 0);
    b.shR.rotation.set(a.shRx, 0, a.shRz);
    b.elR.rotation.set(a.elR, 0, 0);
    b.hipL.rotation.set(a.hipLx, 0, a.hipLz);
    b.knL.rotation.set(a.knL, 0, 0);
    b.anL.rotation.set(-(a.hipLx + a.knL) * 0.3, 0, 0);
    b.hipR.rotation.set(a.hipRx, 0, a.hipRz);
    b.knR.rotation.set(a.knR, 0, 0);
    b.anR.rotation.set(-(a.hipRx + a.knR) * 0.3, 0, 0);
    // The lamp hangs plumb from the hand; the light flickers.
    this.light.intensity = LIGHT_I[this.variant] * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 31) * 0.05);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
