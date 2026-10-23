import * as THREE from 'three';
import { WIGHT_RIG, wightGeometry } from './model';
import { skinMaterial } from '../kit/materials';
import { tuftMaterial } from '../kit/tufts';

// The Hollow Thane on screen. It floats, bobbing slowly, its rags and cape
// stirring with no wind. Poses for its moves: the raising (both arms high,
// head back, the eyes flaring); the cold breath (leaning in, jaw wide); the
// sword (drawn back high, then a long cut down); fading into mist and out of
// it somewhere else. A pale ward shimmers round it while it is warded; when
// the ward is down, it isn't there.

export type WightPose = 'idle' | 'glide' | 'raise' | 'breathe' | 'windup' | 'cut' | 'reel' | 'dead';

let mats: { skin: THREE.MeshPhysicalMaterial; hair: ReturnType<typeof tuftMaterial>; bronze: THREE.MeshPhysicalMaterial; eye: THREE.MeshBasicMaterial; ward: THREE.ShaderMaterial } | null = null;
function getMats() {
  if (mats) return mats;
  const skin = skinMaterial({ relief: 1.2, strand: 60, drift: 0.2, rough: 0.9, wetRough: 0.6, sheen: 0.15, sheenColor: 0x9ab0c0 });
  const hair = tuftMaterial({ sheen: 0.5, sheenColor: 0xe0e8f0, rough: 0.8 });
  hair.mat.color.set(0xd8d8d0);
  const bronze = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.55 });
  const eye = new THREE.MeshBasicMaterial({ color: 0x6ac8ff });
  const ward = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uTime: { value: 0 }, uOn: { value: 1 }, uTint: { value: new THREE.Color(0x9ad8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform float uOn; uniform vec3 uTint; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float ripple = 0.6 + 0.4 * sin(vP.y * 18.0 - uTime * 3.0 + sin(vP.x * 9.0 + uTime));
      gl_FragColor = vec4(uTint * f * ripple * 0.6, f * 0.3 * uOn); }`,
  });
  mats = { skin, hair, bronze, eye, ward };
  return mats;
}
export function tickWightHair(dt: number) {
  if (mats) {
    mats.hair.time.value += dt;
    mats.ward.uniforms.uTime.value += dt;
  }
}
/** The Dark in it: violet eyes, a violet ward (0..1). */
export function wightDark(k: number) {
  const m = getMats();
  m.eye.color.setRGB(0.42 * (1 - k) + 0.7 * k, 0.78 * (1 - k) + 0.3 * k, 1.0);
  (m.ward.uniforms.uTint.value as THREE.Color).setRGB(0.6 + 0.2 * k, 0.85 - 0.5 * k, 1.0);
}

const RESET = ['pelvis', 'spine', 'chest', 'neck', 'head', 'jaw', 'robe', 'cape', 'shL', 'elL', 'wrL', 'hdL', 'shR', 'elR', 'wrR', 'hdR'];

export class WightVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  private meshes: THREE.Mesh[] = [];
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private hair: THREE.SkinnedMesh;
  private wardMesh: THREE.Mesh;
  pose: WightPose = 'idle';
  poseT = 0;
  /** 0..1 how visible it is (fading through mist) */
  opacity = 1;
  /** the ward is up */
  warded = true;
  private ward = 1;
  private t = Math.random() * 10;
  private sway = new THREE.Vector2();
  private a: Record<string, number> = { lsh: 0, rsh: 0, lel: 0, rel: 0, lout: 0, rout: 0, lean: 0, head: 0, jaw: 0, twist: 0 };
  private deadT = 0;

  constructor(opts: { scale?: number } = {}) {
    const g = wightGeometry();
    const M = getMats();
    const rig = WIGHT_RIG.make();
    this.bones = rig.bones;
    this.skeleton = rig.skeleton;
    this.root.add(rig.root);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      this.root.add(m);
      this.meshes.push(m);
      return m;
    };
    this.body = mk(g.body, M.skin);
    this.body.castShadow = this.body.receiveShadow = true;
    this.far = mk(g.far, M.skin);
    this.far.visible = false;
    this.hair = mk(g.hair, M.hair.mat);
    this.hair.castShadow = true;
    mk(g.crown, M.bronze).castShadow = true;
    mk(g.sword, M.bronze).castShadow = true;
    mk(g.eyes, M.eye);
    this.wardMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.5, 6, 16), M.ward);
    this.wardMesh.position.y = 1.25;
    this.wardMesh.renderOrder = 5;
    this.root.add(this.wardMesh);
    this.root.scale.setScalar(opts.scale ?? 1);
  }

  setPose(p: WightPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  lod(camDist: number) {
    this.body.visible = camDist < 70;
    this.far.visible = !this.body.visible;
    this.hair.visible = camDist < 45;
  }

  update(dt: number, vel: THREE.Vector3) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const k = (r: number) => 1 - Math.exp(-dt * r);
    for (const n of RESET) b[n].quaternion.identity();
    if (this.pose === 'dead') {
      // It folds down into its robes; the crown rolls off.
      this.deadT += dt;
      const d = THREE.MathUtils.smoothstep(this.deadT, 0, 1.4);
      b.pelvis.position.set(0, 1.15 - d * 0.95, 0);
      b.spine.rotation.x = d * 0.7;
      b.chest.rotation.x = d * 0.5;
      b.head.rotation.set(d * 0.6, 0, d * 0.4);
      b.robe.scale.set(1 + d * 0.4, 1 - d * 0.7, 1 + d * 0.4);
      b.shL.rotation.z = d * 0.6;
      b.shR.rotation.z = -d * 0.6;
      this.ward += (0 - this.ward) * k(6);
      this.applyFade();
      return;
    }
    this.deadT = 0;
    b.robe.scale.set(1, 1, 1);
    // Floating: a slow bob; it leans into its glide.
    const speed = Math.hypot(vel.x, vel.z);
    const bob = Math.sin(t * 1.6) * 0.05;
    b.pelvis.position.set(0, 1.15 + 0.12 + bob, 0);
    // Rags and cape trail behind its movement, and stir anyway.
    const local = vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y);
    this.sway.x += (THREE.MathUtils.clamp(-local.z * 0.08, -0.4, 0.4) + Math.sin(t * 1.1) * 0.05 - this.sway.x) * k(3);
    this.sway.y += (THREE.MathUtils.clamp(local.x * 0.08, -0.4, 0.4) + Math.sin(t * 0.9 + 1) * 0.04 - this.sway.y) * k(3);
    b.robe.rotation.set(this.sway.x, 0, this.sway.y);
    b.cape.rotation.set(this.sway.x * 1.4 - 0.05 - speed * 0.04, 0, this.sway.y);

    const A = { lsh: 0.15, rsh: 0.2, lel: -0.25, rel: -0.45, lout: 0.12, rout: -0.1, lean: speed * 0.03, head: 0, jaw: 0.05, twist: 0 };
    switch (this.pose) {
      case 'raise': {
        // Both arms high, head back, calling them up.
        const up = THREE.MathUtils.smoothstep(pt, 0, 0.6);
        A.lsh = -2.4 * up; A.rsh = -2.4 * up; A.lel = -0.3; A.rel = -0.3; A.lout = 0.35 * up; A.rout = -0.35 * up;
        A.head = -0.45 * up; A.jaw = 0.25 * up + Math.sin(t * 9) * 0.04 * up; A.lean = -0.15 * up;
        break;
      }
      case 'breathe':
        // Leaning in, jaw wide: the cold breath.
        A.lean = 0.35; A.head = 0.15; A.jaw = 0.5 * THREE.MathUtils.smoothstep(pt, 0.2, 0.7);
        A.lsh = -0.3; A.lout = 0.5;
        break;
      case 'windup':
        // The sword drawn back high over the right shoulder (the tell).
        A.rsh = -2.6; A.rel = -0.9; A.rout = -0.3; A.twist = -0.4; A.lean = -0.08;
        break;
      case 'cut': {
        // A long cut down and across.
        const c = THREE.MathUtils.smoothstep(pt, 0, 0.18);
        A.rsh = -2.6 + c * 3.1; A.rel = -0.9 + c * 0.7; A.rout = -0.3 + c * 0.5; A.twist = -0.4 + c * 0.8; A.lean = 0.2 * c;
        break;
      }
      case 'reel': {
        const e = Math.exp(-pt * 3);
        A.lean = -0.4 * e; A.head = -0.3 * e; A.lsh = -0.6 * e; A.rsh = -0.6 * e;
        break;
      }
    }
    const a = this.a, fast = this.pose === 'cut' ? 30 : this.pose === 'reel' ? 20 : 7;
    for (const key of Object.keys(A) as (keyof typeof A)[]) a[key] += (A[key] - a[key]) * k(fast);
    b.spine.rotation.set(a.lean * 0.5, a.twist * 0.5, 0);
    b.chest.rotation.set(a.lean * 0.5, a.twist * 0.5, 0);
    b.neck.rotation.set(a.head * 0.5, 0, 0);
    b.head.rotation.set(a.head * 0.5 + Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.4) * 0.15, 0);
    b.jaw.rotation.x = a.jaw;
    b.shL.rotation.set(a.lsh, 0, a.lout);
    b.elL.rotation.set(a.lel, 0, 0);
    b.shR.rotation.set(a.rsh, 0, a.rout);
    b.elR.rotation.set(a.rel, 0, 0);
    b.wrR.rotation.set(this.pose === 'cut' || this.pose === 'windup' ? -0.6 : 0, 0, 0);
    // Long fingers curl and uncurl.
    b.hdL.rotation.x = 0.3 + Math.sin(t * 1.3) * 0.15;
    this.ward += ((this.warded ? 1 : 0) - this.ward) * k(5);
    this.applyFade();
  }

  private applyFade() {
    const M = getMats();
    M.ward.uniforms.uOn.value = this.ward * this.opacity;
    this.wardMesh.visible = this.ward * this.opacity > 0.02;
    for (const m of this.meshes) {
      const mat = m.material as THREE.Material;
      mat.transparent = this.opacity < 0.99;
      mat.opacity = this.opacity;
    }
    this.root.visible = this.opacity > 0.01;
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}
