import * as THREE from 'three';
import { GOBLIN_RIG, goblinGeometry } from './model';
import { skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';

// Snaggletooth on screen: the sculpted goblin chief on his own skeleton, and
// procedural poses for everything he does. Astride his war-boar (cleaver up,
// cutting down from the saddle); on foot, a scuttling run; quick cuts
// forehand and backhand; a crouch before the leap, tucked in the air; the
// horn at his lips; the vial; reeling from a parry; thrown head over heels;
// dead on his back.

export type GoblinPose = 'idle' | 'ride' | 'rideCut' | 'cut' | 'crouch' | 'leap' | 'horn' | 'quaff' | 'reel' | 'thrown' | 'groggy' | 'dead';

let mats: { skin: THREE.MeshPhysicalMaterial; fur: ReturnType<typeof tuftMaterial>; gear: THREE.MeshPhysicalMaterial; vial: THREE.MeshStandardMaterial } | null = null;
function getMats() {
  if (mats) return mats;
  const skin = skinMaterial({ relief: 1.4, strand: 90, drift: 0.2, rough: 0.78, wetRough: 0.45, sheen: 0.2, sheenColor: 0xb8c890 });
  const fur = tuftMaterial({ sheen: 0.35, sheenColor: 0xb0a088, rough: 0.9 });
  const gear = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.7 });
  const vial = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x7a3aff, emissiveIntensity: 1.3, roughness: 0.2, transparent: true, opacity: 0.85 });
  mats = { skin, fur, gear, vial };
  return mats;
}
export function tickGoblinFur(dt: number) {
  if (mats) mats.fur.time.value += dt;
}

const RESET = GOBLIN_RIG.bones.map((b) => b.name);

export class GoblinVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private fur: THREE.SkinnedMesh;
  private hornBelt: THREE.SkinnedMesh;
  private hornHand: THREE.SkinnedMesh;
  private vial: THREE.SkinnedMesh;
  private eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  pose: GoblinPose = 'idle';
  poseT = 0;
  /** which way the next cut goes */
  cutSide = 1;
  private t = Math.random() * 10;
  private phase = 0;
  private a: Record<string, number> = {};
  private deadT = 0;

  constructor(opts: { scale?: number } = {}) {
    const g = goblinGeometry();
    const M = getMats();
    const rig = GOBLIN_RIG.make();
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
    this.body = mk(g.body, M.skin);
    this.body.receiveShadow = true;
    this.far = mk(g.far, M.skin);
    this.far.visible = false;
    this.fur = mk(g.fur, M.fur.mat);
    mk(g.crown, M.gear);
    mk(g.cleaver, M.gear);
    this.hornBelt = mk(g.horn, M.gear);
    this.hornHand = mk(g.hornHand, M.gear);
    this.hornHand.visible = false;
    this.vial = mk(g.vial, M.vial, false);
    this.vial.visible = false;
    mk(g.eyes, this.eyeMat, false);
    this.root.scale.setScalar(opts.scale ?? 1);
  }

  setPose(p: GoblinPose) {
    if (p === this.pose) return;
    if (p === 'cut' || p === 'rideCut') this.cutSide = -this.cutSide;
    this.pose = p;
    this.poseT = 0;
  }
  /** Start the same pose over (another cut). */
  restart() {
    this.cutSide = -this.cutSide;
    this.poseT = 0;
  }

  /** Dark-touched: violet eyes (0..1). */
  dark(k: number) {
    this.eyeMat.color.setRGB(1 - 0.3 * k, 0.82 - 0.55 * k, 0.23 + 0.77 * k);
  }

  lod(camDist: number) {
    this.body.visible = camDist < 60;
    this.far.visible = !this.body.visible;
    this.fur.visible = camDist < 30;
  }

  update(dt: number, speed: number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const k = (r: number) => 1 - Math.exp(-dt * r);
    const ss = THREE.MathUtils.smoothstep;
    for (const n of RESET) b[n].quaternion.identity();
    b.pelvis.position.set(0, 0.5, 0);
    this.hornHand.visible = this.pose === 'horn';
    this.hornBelt.visible = !this.hornHand.visible;
    this.vial.visible = this.pose === 'quaff' && pt < 1.0;
    // Targets for every joint (radians), eased toward.
    const A: Record<string, number> = {
      lean: 0.18, twist: 0, head: 0.05, headY: Math.sin(t * 0.7) * 0.25, jaw: 0.05, drop: 0,
      shLx: 0.1, shLz: 0.15, elL: -0.35, shRx: 0.1, shRz: -0.15, elR: -0.35, wrR: 0,
      hipLx: 0, hipLz: 0.06, knL: 0.15, anL: -0.1, hipRx: 0, hipRz: -0.06, knR: 0.15, anR: -0.1, earL: 0, earR: 0, spin: 0,
    };
    // A scuttling run: knees high, arms pumping, bobbing.
    const run = Math.min(1, speed / 4);
    if (speed > 0.2 && (this.pose === 'idle' || this.pose === 'groggy')) {
      this.phase += dt * (5 + speed * 2.2);
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const amp = 0.4 + 0.5 * run;
      A.hipLx = -s * amp; A.hipRx = s * amp;
      A.knL = 0.25 + Math.max(0, c) * 1.1 * amp; A.knR = 0.25 + Math.max(0, -c) * 1.1 * amp;
      A.shLx = s * 0.7 * amp; A.shRx = -s * 0.7 * amp;
      A.elL = -0.6 - run * 0.5; A.elR = -0.6 - run * 0.5;
      A.lean = 0.25 + run * 0.25;
      A.drop = -Math.abs(Math.sin(this.phase)) * 0.03 * (1 + run);
      A.earL = A.earR = -run * 0.3;
    } else {
      // Breathing, shifting from foot to foot, ears twitching.
      A.drop = Math.sin(t * 2.2) * 0.006;
      A.earL = Math.max(0, Math.sin(t * 1.3) - 0.9) * 2;
      A.earR = Math.max(0, Math.sin(t * 1.7 + 2) - 0.9) * 2;
    }
    switch (this.pose) {
      case 'ride':
      case 'rideCut': {
        // Astride: thighs forward and apart, shins hanging; cleaver up.
        A.hipLx = -1.35; A.hipRx = -1.35; A.hipLz = 0.55; A.hipRz = -0.55; A.knL = 1.45; A.knR = 1.45; A.anL = -0.3; A.anR = -0.3;
        A.lean = 0.25 + Math.sin(t * 9) * 0.03 * Math.min(1, speed / 3);
        A.shLx = -0.7; A.shLz = 0.3; A.elL = -0.9;
        A.shRx = -1.6; A.shRz = -0.4; A.elR = -1.2;
        if (this.pose === 'rideCut') {
          // Up, and down across the boar's shoulder.
          const up = ss(pt, 0, 0.18), down = ss(pt, 0.2, 0.34);
          A.shRx = -1.6 - 1.1 * up + 3.0 * down; A.shRz = -0.4 - 0.5 * down * this.cutSide; A.elR = -1.2 + 0.9 * down;
          A.twist = -0.35 * this.cutSide * down; A.lean = 0.25 + 0.3 * down; A.jaw = 0.3 * up;
        }
        break;
      }
      case 'cut': {
        // Forehand or backhand: drawn back, then a fast cut across.
        const up = ss(pt, 0, 0.14), down = ss(pt, 0.16, 0.28);
        const s = this.cutSide;
        A.shRx = -2.0 * up + 2.4 * down; A.shRz = -0.4 - 0.9 * s * up + 1.2 * s * down; A.elR = -1.4 * up + 1.1 * down;
        A.twist = 0.5 * s * up - 0.9 * s * down; A.lean = 0.3 + 0.2 * down;
        A.hipLx = -0.5; A.knL = 0.6; A.hipRx = 0.3; A.knR = 0.4; A.jaw = 0.35 * up;
        A.shLx = -0.5; A.shLz = 0.6; A.elL = -0.8;
        break;
      }
      case 'crouch': {
        // Low on his haunches, cleaver back: the leap is coming.
        const c = ss(pt, 0, 0.25);
        A.hipLx = -1.0 * c; A.hipRx = -1.0 * c; A.knL = 1.9 * c; A.knR = 1.9 * c; A.anL = -0.9 * c; A.anR = -0.9 * c;
        A.drop = -0.17 * c; A.lean = 0.6 * c; A.head = -0.4 * c;
        A.shRx = 0.9 * c; A.shRz = -0.5; A.elR = -0.6; A.shLx = -0.6; A.shLz = 0.5;
        A.jaw = 0.25 + Math.sin(t * 20) * 0.05;
        break;
      }
      case 'leap': {
        // Tucked, cleaver over his head, then the chop.
        const chop = ss(pt, 0.3, 0.45);
        A.hipLx = -1.2; A.hipRx = -1.2; A.knL = 1.7; A.knR = 1.7; A.lean = 0.3 + 0.3 * chop;
        A.shRx = -2.9 + 3.2 * chop; A.shRz = -0.2; A.elR = -0.6 + 0.6 * chop; A.jaw = 0.5;
        A.shLx = -1.2; A.shLz = 0.9;
        break;
      }
      case 'horn': {
        // The horn to his lips, head back, cheeks out.
        const r = ss(pt, 0, 0.35);
        A.shLx = -1.25 * r; A.shLz = 0.05; A.elL = -2.15 * r; A.head = -0.35 * r; A.lean = -0.1 * r;
        A.shRx = -0.3; A.shRz = -0.5; A.elR = -0.7;
        A.earL = A.earR = -0.4 * r;
        break;
      }
      case 'quaff': {
        // Cracks the vial on his tooth and tips it back.
        const r = ss(pt, 0, 0.3), back = ss(pt, 0.5, 0.9);
        A.shLx = -1.3 * r; A.shLz = 0.1; A.elL = -2.0 * r; A.head = -0.2 * r - 0.5 * back; A.jaw = 0.4 * r;
        A.lean = -0.15 * back;
        if (pt > 1.1) {
          // ...and shudders as it takes him.
          const shiver = Math.sin(t * 40) * 0.06 * ss(pt, 1.1, 1.3) * (1 - ss(pt, 1.5, 1.8));
          A.lean = 0.4 + shiver; A.head = 0.3; A.shLx = 0.2; A.shRx = 0.2; A.shLz = 0.8; A.shRz = -0.8; A.elL = -0.4; A.elR = -0.4; A.jaw = 0.6;
        }
        break;
      }
      case 'reel': {
        const e = Math.exp(-pt * 2.5);
        A.lean = -0.5 * e; A.head = -0.5 * e; A.shLz = 1.0 * e + 0.15; A.shRz = -1.0 * e - 0.15; A.shRx = -0.5 * e; A.jaw = 0.4 * e;
        A.hipLx = -0.4 * e; A.knL = 0.6 * e;
        break;
      }
      case 'thrown': {
        // Flailing head over heels.
        A.shLx = -2.5 + Math.sin(t * 17) * 0.5; A.shRx = -2.2 + Math.cos(t * 15) * 0.5; A.shLz = 1.0; A.shRz = -1.0;
        A.hipLx = -1.2 + Math.sin(t * 13) * 0.4; A.hipRx = -0.4; A.knL = 1.2; A.knR = 0.7; A.jaw = 0.6;
        break;
      }
      case 'groggy': {
        A.head = 0.3 + Math.sin(pt * 6) * 0.15; A.headY = Math.sin(pt * 4) * 0.4; A.lean = 0.35; A.jaw = 0.3;
        A.shLz = 0.4; A.shRz = -0.4;
        break;
      }
      case 'dead': {
        this.deadT += dt;
        const d = ss(this.deadT, 0, 0.8);
        b.pelvis.position.set(0, 0.5 - 0.38 * d, -0.1 * d);
        b.pelvis.rotation.x = -1.35 * d;
        A.hipLx = -0.6 * d; A.hipRx = -0.9 * d; A.knL = 0.9 * d; A.knR = 0.5 * d; A.hipLz = 0.3; A.hipRz = -0.3;
        A.shLz = 1.2 * d; A.shRz = -1.0 * d; A.shRx = -0.5; A.head = -0.3 * d; A.headY = 0.5 * d; A.jaw = 0.5 * d; A.lean = 0;
        break;
      }
    }
    if (this.pose !== 'dead') this.deadT = 0;
    const fast = this.pose === 'cut' || this.pose === 'rideCut' || this.pose === 'leap' ? 35 : this.pose === 'reel' || this.pose === 'thrown' ? 20 : 10;
    const a = this.a;
    for (const key of Object.keys(A)) a[key] = (a[key] ?? A[key]) + (A[key] - (a[key] ?? A[key])) * k(fast);
    b.pelvis.position.y += a.drop;
    b.spine.rotation.set(a.lean * 0.5, a.twist * 0.5, 0);
    b.chest.rotation.set(a.lean * 0.5, a.twist * 0.5, 0);
    b.neck.rotation.set(a.head * 0.4 - a.lean * 0.4, a.headY * 0.4, 0);
    b.head.rotation.set(a.head * 0.6 - a.lean * 0.3, a.headY * 0.6, 0);
    b.jaw.rotation.x = a.jaw;
    b.earL.rotation.set(0, 0, a.earL);
    b.earR.rotation.set(0, 0, -a.earR);
    b.shL.rotation.set(a.shLx, 0, a.shLz);
    b.elL.rotation.set(a.elL, 0, 0);
    b.shR.rotation.set(a.shRx, 0, a.shRz);
    b.elR.rotation.set(a.elR, 0, 0);
    b.hipL.rotation.set(a.hipLx, 0, a.hipLz);
    b.knL.rotation.set(a.knL, 0, 0);
    b.anL.rotation.set(a.anL - (a.hipLx + a.knL) * 0.3, 0, 0);
    b.hipR.rotation.set(a.hipRx, 0, a.hipRz);
    b.knR.rotation.set(a.knR, 0, 0);
    b.anR.rotation.set(a.anR - (a.hipRx + a.knR) * 0.3, 0, 0);
    // Knuckly fingers flex now and then.
    b.hdL.rotation.x = 0.3 + Math.sin(t * 1.1) * 0.2;
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
