import * as THREE from 'three';
import { STAG_RIG, stagGeometry } from './model';
import { eyeMaterial, skinMaterial } from '../kit/materials';
import { Gait } from '../kit/gait';
import { tuftMaterial } from '../kit/tufts';

// The White Stag on screen: grazes with its head to the grass, lifts it at a
// sound with ears turning, walks, trots and bounds away on long legs. Brought
// to bay it lowers its crown of antlers and paws the ground; it charges head
// down. When it yields it bows its head low and stands still. A faint cold
// light lives in its coat and antlers.

export type StagPose = 'idle' | 'graze' | 'alert' | 'atBay' | 'paw' | 'charge' | 'yield' | 'stumble';

let mats: { skin: THREE.MeshPhysicalMaterial; coat: ReturnType<typeof tuftMaterial>; antler: THREE.MeshPhysicalMaterial; eye: THREE.MeshPhysicalMaterial } | null = null;
function getMats() {
  if (mats) return mats;
  const skin = skinMaterial({ relief: 0.7, strand: 160, drift: 0.08, rough: 0.8, wetRough: 0.3, sheen: 0.6, sheenColor: 0xe8eef8 });
  skin.emissive.set(0x0c1016);
  const coat = tuftMaterial({ sheen: 0.7, sheenColor: 0xeef2ff, tipGlow: 0x0e1420 });
  const antler = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, emissive: new THREE.Color(0x141c2a) });
  antler.userData.styleRim = 0.4;
  const eye = eyeMaterial(0x0b0908);
  mats = { skin, coat, antler, eye };
  return mats;
}
export function tickStagFur(dt: number) {
  if (mats) mats.coat.time.value += dt;
}

const RESET = ['pelvis', 'spine', 'chest', 'neck', 'neck2', 'head', 'jaw', 'earL', 'earR', 'tail'];

export class StagVisual {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly gait: Gait;
  private body: THREE.SkinnedMesh;
  private far: THREE.SkinnedMesh;
  private coat: THREE.SkinnedMesh;
  private details: THREE.SkinnedMesh[] = [];
  private halo: THREE.Sprite;
  pose: StagPose = 'idle';
  poseT = 0;
  lookAt: THREE.Vector3 | null = null;
  /** 0..1: how brightly its light shows (it fades out when it leaves) */
  light = 1;
  private t = Math.random() * 100;
  private headPitch = 0;
  private headYaw = 0;
  private jaw = 0;
  private crouch = 0;
  private ears = [0, 0];

  constructor(opts: { scale?: number } = {}) {
    const g = stagGeometry();
    const M = getMats();
    const rig = STAG_RIG.make();
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
    this.body = mk(g.body, M.skin);
    this.body.castShadow = this.body.receiveShadow = true;
    this.far = mk(g.far, M.skin);
    this.far.visible = false;
    this.far.castShadow = true;
    this.coat = mk(g.coat, M.coat.mat);
    this.coat.castShadow = true;
    const ant = mk(g.antlers, M.antler);
    ant.castShadow = true;
    this.details.push(mk(g.eyes, M.eye));
    // A soft light around it, as if moonlight found it wherever it stands.
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xc8dcff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.set(3.6, 3.2, 1);
    this.halo.position.set(0, 1.4, 0);
    this.root.add(this.halo);
    this.root.scale.setScalar(opts.scale ?? 1);
    const sc = opts.scale ?? 1;
    this.gait = new Gait(this.bones, [
      { bones: ['fLs', 'fLe', 'fLw', 'fLt'], bend: [0, 0, -1], walk: 0.25, trot: 0, run: 0.1 },
      { bones: ['fRs', 'fRe', 'fRw', 'fRt'], bend: [0, 0, -1], walk: 0.75, trot: 0.5, run: 0.18 },
      { bones: ['hLh', 'hLk', 'hLa', 'hLt'], bend: [0, 0, 1], walk: 0.0, trot: 0.5, run: 0.6 },
      { bones: ['hRh', 'hRk', 'hRa', 'hRt'], bend: [0, 0, 1], walk: 0.5, trot: 0.0, run: 0.68 },
    ], { stride: 0.8 * sc, lift: 0.13 * sc, dutyWalk: 0.64, dutyRun: 0.3, trotAt: 2.2 * sc, runAt: 5.5 * sc, flick: 0.9 });
  }

  setPose(p: StagPose) {
    if (p === this.pose) return;
    this.pose = p;
    this.poseT = 0;
  }

  lod(camDist: number, furOn = true) {
    this.body.visible = camDist < 70;
    this.far.visible = !this.body.visible;
    this.coat.visible = furOn && camDist < 45;
    for (const d of this.details) d.visible = camDist < 30;
  }

  update(dt: number, vel: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    this.t += dt;
    this.poseT += dt;
    const b = this.bones, t = this.t, pt = this.poseT;
    const speed = Math.hypot(vel.x, vel.z);
    const sc = this.root.scale.x;
    for (const n of RESET) b[n].quaternion.identity();
    b.pelvis.position.set(0, 1.16, -0.66);
    const k = (r: number) => 1 - Math.exp(-dt * r);
    const g = this.gait, ft = g.feet;
    const front = (ft[0].planted.y + ft[1].planted.y) / 2, hind = (ft[2].planted.y + ft[3].planted.y) / 2;
    const groundMid = (front + hind) / 2 - this.root.position.y;
    const pitch = Math.atan2(front - hind, 0.95 * sc);
    const phase = g.phase * Math.PI * 2;
    const run = THREE.MathUtils.smoothstep(speed, 4, 8);
    // At bay: weight back on the haunches, head and crown low.
    const crouch = this.pose === 'atBay' || this.pose === 'paw' ? 0.6 : this.pose === 'charge' ? 0.3 : 0;
    this.crouch += (crouch - this.crouch) * k(5);
    const bob = speed > 0.1 ? Math.abs(Math.sin(phase * (run > 0.5 ? 1 : 2))) * (0.012 + run * 0.05) : 0;
    b.pelvis.position.y += groundMid / sc + bob - this.crouch * 0.06;
    // The bound: the body rocks nose-up, nose-down.
    b.pelvis.rotation.x = -pitch + (run > 0 ? Math.sin(phase) * 0.12 * run : 0) + this.crouch * 0.06;
    b.spine.rotation.x = run > 0 ? Math.sin(phase + 1.1) * 0.06 * run : 0;
    b.chest.rotation.x = (run > 0 ? -Math.sin(phase + 0.4) * 0.08 * run : Math.sin(t * 1.8) * 0.008) + this.crouch * 0.1;

    let hp = 0, hy = 0, jaw = 0, ears = 0, tail = 0;
    switch (this.pose) {
      case 'graze': {
        // Head down to the grass, cropping; now and then a glance up.
        const glance = Math.sin(t * 0.45) > 0.92 ? 1 : 0;
        hp = 1.25 - glance * 0.9;
        jaw = (Math.sin(t * 9) * 0.5 + 0.5) * 0.12 * (1 - glance);
        hy = Math.sin(t * 0.3) * 0.25;
        break;
      }
      case 'alert':
        // Head high and still, ears turned to the sound, tail up.
        hp = -0.25; ears = 1; tail = 1;
        break;
      case 'atBay':
        hp = 0.55; ears = -1; tail = 0.6;
        break;
      case 'paw':
        // The tell: a forehoof scraping the ground, a snort.
        hp = 0.6; ears = -1; tail = 0.8;
        jaw = 0.1;
        break;
      case 'charge':
        hp = 0.75; ears = -1; tail = 0.8;
        break;
      case 'stumble': {
        const e = Math.exp(-pt * 4);
        hp = -0.4 * e; hy = 0.5 * e; ears = -1;
        b.spine.rotation.z = 0.15 * e;
        break;
      }
      case 'yield':
        // Head bowed low and still: it will let you near.
        hp = 0.9 * THREE.MathUtils.smoothstep(pt, 0, 1.5); ears = 0.3;
        break;
      default:
        hp = speed > 4 ? -0.15 : 0.1 + Math.sin(t * 0.25) * 0.08;
        hy = Math.sin(t * 0.19) * 0.3 * (speed > 0.2 ? 0.2 : 1);
        tail = speed > 4 ? 1 : 0;
    }
    if (this.lookAt && (this.pose === 'alert' || this.pose === 'idle')) {
      const local = this.root.worldToLocal(this.lookAt.clone());
      hy = THREE.MathUtils.clamp(Math.atan2(local.x, local.z - 0.7), -1.1, 1.1);
    }
    const fast = this.pose === 'charge' || this.pose === 'stumble' ? 12 : 5;
    this.headPitch += (hp - this.headPitch) * k(fast);
    this.headYaw += (hy - this.headYaw) * k(fast);
    this.jaw += (jaw - this.jaw) * k(14);
    b.neck.rotation.set(this.headPitch * 0.45, this.headYaw * 0.35, 0);
    b.neck2.rotation.set(this.headPitch * 0.35, this.headYaw * 0.35, 0);
    b.head.rotation.set(this.headPitch * 0.2, this.headYaw * 0.3, -this.headYaw * 0.1);
    b.jaw.rotation.set(this.jaw, 0, 0);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const tw = Math.sin(t * 1.3 + i * 2) > 0.95 ? 0.4 : 0;
      this.ears[i] += ((ears > 0 ? -0.5 : ears < 0 ? 0.7 : tw) - this.ears[i]) * k(8);
      b[i === 0 ? 'earL' : 'earR'].rotation.set(0, s * this.ears[i] * 0.6, s * this.ears[i] * 0.4);
    }
    // The tail flicks up when it's alarmed, showing the white rump.
    b.tail.rotation.set(-tail * 1.0 + Math.sin(t * 7) * 0.05 * tail, 0, Math.sin(t * 2.3) * 0.08);
    // A forehoof paws the ground.
    if (this.pose === 'paw') {
      const scrape = Math.max(0, Math.sin(pt * 7));
      const v = (g.override[0] as THREE.Vector3 | null) ?? new THREE.Vector3();
      g.override[0] = v.set(0.11, 0.08 + scrape * 0.18, 0.5 - scrape * 0.18).applyMatrix4(this.root.matrixWorld);
    } else g.override[0] = null;
    this.halo.material.opacity = 0.16 * this.light;
    this.root.updateMatrixWorld(true);
    g.grounded = true;
    g.update(dt, this.root, vel, groundAt);
  }

  /** Fade it out (it leaves into the mist) or in. */
  setOpacity(a: number) {
    for (const m of [this.body, this.far, this.coat, ...this.details]) {
      const mat = m.material as THREE.Material;
      mat.transparent = a < 1;
      mat.opacity = a;
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material && !(m as unknown as THREE.Sprite).isSprite) {
        (m.material as THREE.Material).transparent = a < 1;
        (m.material as THREE.Material).opacity = a;
      }
    });
    this.light = a;
  }

  dispose() {
    this.root.removeFromParent();
    this.skeleton.dispose();
  }
}

let haloT: THREE.Texture | null = null;
function haloTex() {
  if (haloT) return haloT;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  haloT = new THREE.CanvasTexture(c);
  return haloT;
}
