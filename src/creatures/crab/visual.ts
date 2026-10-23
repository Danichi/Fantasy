import * as THREE from 'three';
import { CRAB_LEGS, CRAB_RIG, crabGeometry } from './model';
import { eyeMaterial } from '../kit/materials';
import { Gait, type LegSpec } from '../kit/gait';

// Brine-Maw on screen. The shell is wet and glossy. It scuttles sideways on
// eight legs in two alternating sets; its eyes swivel on their stalks and its
// mouthparts never stop working. It holds the great crusher claw up in front
// like a shield. Poses for its moves: the cutter snaps; the crusher swings
// back and sweeps; it rears up on its hind legs with both claws high (the
// soft underside shows) and slams them down; flipped, it lies on its back
// with its legs clawing the air.

export type CrabPose = 'guard' | 'snap' | 'sweep' | 'rear' | 'slam' | 'flipped' | 'froth' | 'dead';

let shell: THREE.MeshPhysicalMaterial | null = null;
let eyeMat: THREE.MeshPhysicalMaterial | null = null;
function mats() {
  if (!shell) {
    shell = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.58, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.15, sheenColor: new THREE.Color(0xffd8b0) });
    shell.userData.styleRim = 0.35;
    eyeMat = eyeMaterial(0x0a0a0a);
  }
  return { shell, eye: eyeMat! };
}

/** The Dark showing through the cracks in its shell (0..1). */
export function crabDark(k: number) {
  const m = mats().shell;
  m.emissive.setRGB(0.18 * k, 0.03 * k, 0.32 * k);
  m.emissiveIntensity = k > 0 ? 0.6 : 0;
}

export class CrabVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private eyes: THREE.SkinnedMesh;
  pose: CrabPose = 'guard';
  poseT = 0;
  private t = Math.random() * 10;
  private rear = 0;
  private flip = 0;
  private claws = { lUp: 0, rUp: 0, lOut: 0, rOut: 0, lOpen: 0, rOpen: 0, rSweep: 0 };
  private deadT = 0;

  constructor(opts: { scale?: number } = {}) {
    const g = crabGeometry();
    const M = mats();
    const rig = CRAB_RIG.make();
    this.bones = rig.bones;
    this.skeleton = rig.skeleton;
    this.root.add(rig.root);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.body = mk(g.body, M.shell);
    this.body.castShadow = this.body.receiveShadow = true;
    this.far = mk(g.far, M.shell);
    this.far.castShadow = true;
    this.far.visible = false;
    this.eyes = mk(g.eyes, M.eye);
    const sc = opts.scale ?? 1;
    this.root.scale.setScalar(sc);
    // Two alternating sets of four (L0 R1 L2 R3 / R0 L1 R2 L3), a ripple front to back.
    const legs: LegSpec[] = CRAB_LEGS.map((l) => {
      const setA = (l.side > 0) === (l.index % 2 === 0);
      return { bones: [`${l.name}a`, `${l.name}b`, `${l.name}c`, `${l.name}d`], bend: [l.side * 0.5, 1, 0], walk: (setA ? 0 : 0.5) + l.index * 0.05, trot: setA ? 0 : 0.5, run: setA ? 0 : 0.5 };
    });
    this.gait = new Gait(this.bones, legs, { stride: 0.42 * sc, lift: 0.14 * sc, dutyWalk: 0.58, dutyRun: 0.45, trotAt: 1.6 * sc, runAt: 4 * sc, flick: 0.2 });
    this.gait.overrideRate = 8;
  }

  setPose(p: CrabPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  lod(camDist: number) {
    this.body.visible = camDist < 80;
    this.far.visible = !this.body.visible;
    this.eyes.visible = camDist < 40;
  }

  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const k = (r: number) => 1 - Math.exp(-dt * r);
    for (const n of ['body', 'eyeL', 'eyeR', 'mouth', 'clawLa', 'clawLb', 'clawLc', 'clawLd', 'clawRa', 'clawRb', 'clawRc', 'clawRd']) b[n].quaternion.identity();
    // Carried low, the legs sprawled (the rig stands it higher).
    b.body.position.set(0, 0.22, 0);
    if (this.pose === 'dead') {
      this.deadT += dt;
      // Legs curl in; it settles on its belly.
      for (let i = 0; i < 8; i++) {
        const v = (this.gait.override[i] as THREE.Vector3 | null) ?? new THREE.Vector3();
        const l = CRAB_LEGS[i];
        this.gait.override[i] = v.set(l.K[0] * 0.8, 0.25, l.K[2] * 0.8).applyMatrix4(this.root.matrixWorld);
      }
      b.body.position.y = 0.32 - 0.1 * THREE.MathUtils.smoothstep(this.deadT, 0, 0.8);
      this.root.updateMatrixWorld(true);
      this.gait.grounded = false;
      this.gait.update(dt, this.root, vel, groundAt);
      return;
    }
    // Rearing up: front high, weight on the back legs.
    const rear = this.pose === 'rear' ? THREE.MathUtils.smoothstep(pt, 0, 0.6) : this.pose === 'slam' ? Math.max(0, 1 - pt * 6) : 0;
    this.rear += (rear - this.rear) * k(this.pose === 'slam' ? 30 : 8);
    const flip = this.pose === 'flipped' ? 1 : 0;
    this.flip += (flip - this.flip) * k(7);
    const g = this.gait, ft = g.feet;
    let ground = 0;
    for (const f of ft) ground += f.planted.y;
    ground = ground / ft.length - this.root.position.y;
    const sc = this.root.scale.x;
    b.body.position.y += ground / sc + this.rear * 0.25 + Math.sin(t * 2) * 0.005;
    b.body.rotation.set(-this.rear * 0.75, 0, 0);
    // Flipped: rolled onto its back (the whole creature turns over).
    this.root.rotation.z = this.flip * Math.PI;
    if (this.flip > 0.01) this.root.position.y += this.flip * 0.6 * sc;
    // Eyes swivel; mouthparts churn.
    b.eyeL.rotation.set(Math.sin(t * 1.7) * 0.2, Math.sin(t * 0.9) * 0.4, 0);
    b.eyeR.rotation.set(Math.sin(t * 1.5 + 1) * 0.2, Math.sin(t * 1.1 + 2) * 0.4, 0);
    b.mouth.rotation.x = Math.sin(t * (this.pose === 'froth' ? 22 : 6)) * (this.pose === 'froth' ? 0.25 : 0.08);

    // Claws by pose. Up/out are shoulder lifts and spreads; open is the moving finger.
    const C = this.claws;
    let lUp = 0.15, rUp = 0.3, lOut = 0, rOut = -0.15, lOpen = 0.1 + Math.max(0, Math.sin(t * 0.8)) * 0.15, rOpen = 0.05, rSweep = 0;
    switch (this.pose) {
      case 'snap': {
        // The cutter: wide open (the tell), then thrust and snap shut.
        const wind = pt < 0.5;
        lUp = 0.35; lOut = wind ? 0.35 : -0.45;
        lOpen = wind ? 0.7 : 0;
        break;
      }
      case 'sweep': {
        // The crusher: drawn far back and out (the tell), then swept across.
        const s = THREE.MathUtils.smoothstep(pt, 0.65, 0.95);
        rUp = 0.2; rSweep = -0.9 + s * 2.0; rOpen = 0.4 - s * 0.4;
        break;
      }
      case 'rear':
        lUp = 1.0; rUp = 1.1; lOut = 0.4; rOut = -0.4; lOpen = 0.5; rOpen = 0.5;
        break;
      case 'slam':
        lUp = -0.6; rUp = -0.6; lOpen = 0; rOpen = 0;
        break;
      case 'froth':
        lUp = 0.5; rUp = 0.5;
        break;
      case 'flipped':
        // Claws flailing.
        lUp = Math.sin(t * 9) * 0.6; rUp = Math.sin(t * 8 + 1) * 0.6; lOpen = Math.abs(Math.sin(t * 6)) * 0.6; rOpen = Math.abs(Math.sin(t * 5)) * 0.6;
        break;
    }
    const fast = this.pose === 'slam' || this.pose === 'snap' ? 30 : 9;
    C.lUp += (lUp - C.lUp) * k(fast);
    C.rUp += (rUp - C.rUp) * k(fast);
    C.lOut += (lOut - C.lOut) * k(fast);
    C.rOut += (rOut - C.rOut) * k(fast);
    C.lOpen += (lOpen - C.lOpen) * k(20);
    C.rOpen += (rOpen - C.rOpen) * k(20);
    C.rSweep += (rSweep - C.rSweep) * k(this.pose === 'sweep' && pt > 0.65 ? 28 : 8);
    b.clawLa.rotation.set(-C.lUp * 0.6, C.lOut, 0);
    b.clawLb.rotation.set(-C.lUp * 0.4, 0, 0);
    b.clawLd.rotation.set(0, 0, C.lOpen * 0.8);
    b.clawRa.rotation.set(-C.rUp * 0.6, C.rOut + C.rSweep, 0);
    b.clawRb.rotation.set(-C.rUp * 0.4, C.rSweep * 0.3, 0);
    b.clawRd.rotation.set(0, 0, -C.rOpen * 0.8);

    // Legs: walk; reared, the front legs lift; flipped, they all claw the air.
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 8; i++) {
      const l = CRAB_LEGS[i];
      let o: THREE.Vector3 | null = null;
      if (this.flip > 0.5) {
        const w = Math.sin(t * 10 + i * 1.3) * 0.15;
        o = new THREE.Vector3(l.T[0] * 0.9, 0.7 + w, l.T[2] * 0.9 + w);
      } else if (this.rear > 0.3 && l.index < 2) {
        o = new THREE.Vector3(l.K[0] * 1.1, 0.6, l.K[2] + 0.15);
      }
      if (o) {
        const v = (g.override[i] as THREE.Vector3 | null) ?? new THREE.Vector3();
        g.override[i] = v.copy(o).applyMatrix4(this.root.matrixWorld);
      } else g.override[i] = null;
    }
    g.grounded = this.flip < 0.5;
    g.update(dt, this.root, vel, groundAt);
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
