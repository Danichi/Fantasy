import * as THREE from 'three';
import { buildSword } from '../../items/weaponModels';

// An ooze: a heap of translucent green jelly that never holds still. Its
// surface wobbles and ripples; it squashes before it jumps, stretches in the
// air and splats when it lands; blows send shivers through it. Bubbles rise
// inside it. Mother Ooze carries what she has eaten: a ribcage, a skull, a
// knight's rusted helm and his sword, turning slowly in the murk.

export type OozeLook = 'mother' | 'spawn';

const VERT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform vec4 uBulge;
uniform float uShiver;
uniform float uSeed;
`;
const VERT_BODY = /* glsl */ `
{
  vec3 p = position;
  float t = uTime + uSeed;
  float n = sin(p.x * 3.1 + t * 1.7) * sin(p.y * 2.7 + t * 1.3) * sin(p.z * 3.3 + t * 1.1);
  float w = uWobble * (n * 0.6 + 0.4 * sin(dot(p, vec3(5.0, 3.0, 4.0)) + t * 2.3));
  // Lumps and sags: it's never a clean dome.
  w += 0.09 * sin(p.x * 2.1 + uSeed) * sin(p.z * 1.7 - uSeed * 0.7) + 0.05 * sin(p.x * 4.3 - p.z * 3.1 + uSeed * 2.0);
  // A shiver after a blow: quick ripples running over it.
  w += uShiver * 0.08 * sin(dot(p, vec3(9.0, 7.0, 8.0)) - t * 24.0);
  float b = max(0.0, dot(normalize(p), uBulge.xyz));
  w += b * b * b * uBulge.w;
  p += normal * w;
  // It sags into a puddle where it meets the ground.
  if (p.y < -0.4) { float under = -0.4 - p.y; p.y = -0.4 - under * 0.15; p.xz *= 1.0 + under * 0.9; }
  transformed = p;
}
`;

interface OozeMats {
  jelly: THREE.MeshPhysicalMaterial;
  u: { uTime: { value: number }; uWobble: { value: number }; uBulge: { value: THREE.Vector4 }; uShiver: { value: number }; uSeed: { value: number } };
}

function jellyMaterial(look: OozeLook): OozeMats {
  const u = { uTime: { value: 0 }, uWobble: { value: 0.05 }, uBulge: { value: new THREE.Vector4(0, 0, 1, 0) }, uShiver: { value: 0 }, uSeed: { value: Math.random() * 100 } };
  const jelly = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: new THREE.Color(0x121e04),
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xd8f0a0),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  jelly.userData.styleRim = 0.5;
  jelly.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
  };
  jelly.customProgramCacheKey = () => 'ooze-jelly';
  return { jelly, u };
}

const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb2, roughness: 0.7 });
const rustMat = new THREE.MeshStandardMaterial({ color: 0x6a3e22, roughness: 0.85, metalness: 0.3 });

/** What Mother Ooze has swallowed. */
function insides() {
  const g = new THREE.Group();
  // A ribcage, tumbled.
  const ribs = new THREE.Group();
  const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.8, 3, 6), boneMat);
  spine.rotation.x = Math.PI / 2;
  ribs.add(spine);
  for (let i = 0; i < 5; i++) {
    for (const s of [1, -1]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - Math.abs(i - 2) * 0.02, 0.015, 4, 10, Math.PI * 0.8), boneMat);
      rib.rotation.set(0, Math.PI / 2, s > 0 ? 0.1 : Math.PI - 0.1);
      rib.position.set(0, 0, -0.3 + i * 0.15);
      ribs.add(rib);
    }
  }
  ribs.position.set(-0.25, -0.1, 0.05);
  ribs.rotation.set(0.6, 0.4, 0.9);
  g.add(ribs);
  // A skull.
  const skull = new THREE.Group();
  const cran = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), boneMat);
  cran.scale.set(0.9, 1, 1.1);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.1), boneMat);
  jaw.position.set(0, -0.1, 0.05);
  skull.add(cran, jaw);
  skull.position.set(0.3, 0.25, -0.15);
  skull.rotation.set(0.4, -0.8, 0.3);
  g.add(skull);
  // A knight's helm, rusted through.
  const helm = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), rustMat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14, 1, true), rustMat);
  brim.position.y = -0.06;
  const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.02), rustMat);
  nasal.position.set(0, -0.08, 0.17);
  helm.add(dome, brim, nasal);
  helm.position.set(0.1, -0.25, 0.3);
  helm.rotation.set(-0.6, 0.5, 0.4);
  g.add(helm);
  // His sword, point down through the jelly.
  const sword = buildSword({ bladeLen: 0.8, bladeWidth: 0.03, thickness: 0.005, fullerLen: 0.5, gripLen: 0.14, guardSpan: 0.14, guardStyle: 'straight', pommel: 'wheel', tint: 0x8a7a60 });
  sword.position.set(-0.05, 0.05, -0.05);
  sword.rotation.set(0.3, 0.2, 2.6);
  g.add(sword);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = false)));
  return g;
}

export class OozeVisual {
  readonly root = new THREE.Group();
  readonly look: OozeLook;
  private body: THREE.Mesh;
  private inner: THREE.Group | null = null;
  private bubbles: THREE.InstancedMesh;
  private bubbleY: Float32Array;
  private m: OozeMats;
  /** radius (m) */
  size: number;
  /** squash (<1) and stretch (>1) along y */
  squash = 1;
  private squashV = 0;
  private squashTarget = 1;
  private shiver = 0;
  private bulge = 0;
  private bulgeTarget = 0;
  /** 0..1 the Dark in it (violet glow in the core) */
  dark = 0;
  /** dying: 0..1 melt into a puddle */
  melt = 0;
  private t = 0;
  private core: THREE.Mesh;
  private murk: THREE.Mesh;
  private flecks: THREE.InstancedMesh;
  private _m = new THREE.Matrix4();

  constructor(opts: { look?: OozeLook; size?: number } = {}) {
    this.look = opts.look ?? 'mother';
    this.size = opts.size ?? (this.look === 'mother' ? 2.4 : 0.55);
    this.m = jellyMaterial(this.look);
    const geo = new THREE.IcosahedronGeometry(1, this.look === 'mother' ? 5 : 3);
    // Mottled green, murkier toward the bottom, paler where it catches the light.
    const pos = geo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(this.look === 'mother' ? 0x8aa63a : 0x9ab848), low = new THREE.Color(0x3e5414), blot = new THREE.Color(0x5a6a1e), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const m = Math.sin(x * 4.1 + z * 2.3) * Math.sin(y * 3.7 - x * 1.9) * Math.sin(z * 5.3 + y * 2.1);
      c.copy(low).lerp(top, THREE.MathUtils.smoothstep(y, -0.6, 0.7)).lerp(blot, Math.max(0, m) * 0.7);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.body = new THREE.Mesh(geo, this.m.jelly);
    this.body.castShadow = true;
    this.body.renderOrder = 3;
    this.root.add(this.body);
    // The murk: the jelly's far side seen through it, darker, so it has depth.
    const murkMat = new THREE.MeshStandardMaterial({ color: 0x1c2c08, roughness: 0.4, transparent: true, opacity: 0.62, side: THREE.BackSide, depthWrite: false });
    murkMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.m.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    };
    murkMat.customProgramCacheKey = () => 'ooze-murk';
    this.murk = new THREE.Mesh(this.body.geometry, murkMat);
    this.murk.renderOrder = 1;
    this.root.add(this.murk);
    // A darker heart deep inside: it glows when the Dark is in it.
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 2), new THREE.MeshStandardMaterial({ color: 0x2a3a10, emissive: new THREE.Color(0x000000), roughness: 0.6, transparent: true, opacity: 0.85 }));
    this.root.add(this.core);
    if (this.look === 'mother') {
      this.inner = insides();
      this.root.add(this.inner);
    }
    const n = this.look === 'mother' ? 28 : 6;
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeaf8d0, transparent: true, opacity: 0.6 }), n);
    this.bubbleY = new Float32Array(n).map(() => Math.random() * 2 - 1);
    this.root.add(this.bubbles);
    // Flecks of rot and weed hanging in it.
    const fn = this.look === 'mother' ? 60 : 10;
    this.flecks = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.03), new THREE.MeshStandardMaterial({ color: 0x2a2410, roughness: 1 }), fn);
    const fm = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < fn; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.75, y = (Math.random() - 0.4) * 0.9;
      q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      fm.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(1, 0.4 + Math.random(), 1).multiplyScalar(0.6 + Math.random()));
      this.flecks.setMatrixAt(i, fm);
    }
    this.root.add(this.flecks);
  }

  /** A blow lands: it shivers. */
  hit(k = 1) {
    this.shiver = Math.min(1.5, this.shiver + k);
    this.squashV -= 1.5 * k;
  }
  /** Squash down (gathering to jump), stretch (in the air), or rest. */
  setSquash(s: number) {
    this.squashTarget = s;
  }
  /** Bulge toward its front (about to surge forward). */
  setBulge(k: number) {
    this.bulgeTarget = k;
  }

  update(dt: number) {
    this.t += dt;
    // Squash and stretch on a spring, so it overshoots and jiggles.
    this.squashV += (this.squashTarget - this.squash) * 90 * dt;
    this.squashV *= Math.exp(-7 * dt);
    this.squash += this.squashV * dt;
    this.shiver = Math.max(0, this.shiver - dt * 1.6);
    this.bulge += (this.bulgeTarget - this.bulge) * (1 - Math.exp(-dt * 6));
    const u = this.m.u;
    u.uTime.value = this.t;
    u.uWobble.value = (this.look === 'mother' ? 0.045 : 0.06) + this.shiver * 0.02;
    u.uShiver.value = this.shiver;
    u.uBulge.value.set(0, 0.15, 1, this.bulge * 0.45);
    const R = this.size;
    const sq = THREE.MathUtils.clamp(this.squash, 0.45, 1.8);
    const melt = this.melt;
    // A heap, not a ball: wider than it is tall.
    const sy = R * 0.74 * sq * (1 - melt * 0.85), sxz = (R / Math.sqrt(sq)) * (1 + melt * 0.6);
    this.body.scale.set(sxz, sy, sxz);
    this.body.position.y = 0.42 * sy;
    this.murk.scale.copy(this.body.scale).multiplyScalar(0.97);
    this.murk.position.y = this.body.position.y;
    this.flecks.scale.copy(this.body.scale);
    this.flecks.position.y = this.body.position.y;
    this.flecks.rotation.y = this.t * 0.05;
    this.core.position.y = 0.5 * sy;
    this.core.scale.setScalar(R * (0.15 + 0.25 * this.dark) * (1 - melt * 0.7));
    this.core.visible = this.dark > 0.01;
    const cm = this.core.material as THREE.MeshStandardMaterial;
    cm.emissive.setRGB(0.25 * this.dark, 0.05 * this.dark, 0.45 * this.dark);
    cm.color.setRGB(0.16 + 0.1 * this.dark, 0.23 - 0.1 * this.dark, 0.06 + 0.2 * this.dark);
    if (this.inner) {
      // What it has eaten turns slowly in the murk; when it melts, it settles to the ground.
      this.inner.position.y = 0.48 * sy * (1 - melt) + 0.12 * melt;
      this.inner.scale.setScalar(R / 1.7);
      this.inner.rotation.y += dt * 0.12 * (1 - melt);
      this.inner.rotation.x = Math.sin(this.t * 0.3) * 0.15 * (1 - melt);
    }
    // Bubbles rise through it and start again at the bottom.
    for (let i = 0; i < this.bubbleY.length; i++) {
      this.bubbleY[i] += dt * (0.15 + (i % 5) * 0.04);
      if (this.bubbleY[i] > 0.85) this.bubbleY[i] = -0.8;
      const a = i * 2.39996, r = 0.25 + (i % 7) * 0.08;
      this._m.makeTranslation(Math.cos(a + this.t * 0.2) * r * sxz, (0.42 + this.bubbleY[i] * 0.85) * sy, Math.sin(a + this.t * 0.2) * r * sxz);
      this.bubbles.setMatrixAt(i, this._m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    this.m.jelly.opacity = 0.72 * (1 - melt * 0.4);
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    this.root.removeFromParent();
    this.body.geometry.dispose();
    this.m.jelly.dispose();
  }
}
