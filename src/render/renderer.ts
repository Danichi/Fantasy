import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Q } from '../core/settings';
import { Post } from './post';

// Sun in the south-west: lights the town facades and the player's usual view north.
export const SUN_DIR = new THREE.Vector3(-0.5, 0.6, 0.55).normalize();
export const FOG_COLOR = new THREE.Color(0xcfe7ef);

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly post: Post | null = null;
  private basePixelRatio = Q.pixelRatio;
  private dynScale = 1;
  private frameTimes: number[] = [];
  private lastDynAdjust = 0;
  private frameNo = 0;

  constructor(container: HTMLElement) {
    // With post-processing the scene renders into an MSAA target, so the
    // canvas itself doesn't need antialiasing.
    const r = new THREE.WebGLRenderer({ antialias: !Q.post && Q.msaa, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(this.basePixelRatio);
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // Shadows refresh every other frame (see render()); at 60fps that's invisible.
    r.shadowMap.autoUpdate = false;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.06;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.08, 1700);
    // The post pass draws atmospheric haze from depth; Low falls back to fog.
    if (!Q.post) this.scene.fog = new THREE.Fog(FOG_COLOR, 90, 720);

    // Sun: warm key light with a tight shadow box that follows the player.
    this.sun = new THREE.DirectionalLight(0xfff0d2, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(Q.shadowMapSize, Q.shadowMapSize);
    const s = this.sun.shadow.camera;
    s.left = -42; s.right = 42; s.top = 42; s.bottom = -42; s.near = 1; s.far = 220;
    this.sun.shadow.radius = 3.2;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x48683d, 0.78);
    this.scene.add(this.hemi);

    if (Q.post) this.post = new Post(r, Q.msaa ? 4 : 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  async loadSky(url: string) {
    const tex = await new HDRLoader().loadAsync(url);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.9;
    this.scene.background = tex;
    this.scene.backgroundIntensity = 1.03;
    this.scene.backgroundBlurriness = 0.012;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.basePixelRatio * this.dynScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.post?.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  /** Keep the shadow frustum centred on the player so it stays sharp. */
  followShadow(focus: THREE.Vector3) {
    const texel = (42 * 2) / Q.shadowMapSize;
    // Snap to shadow texels to stop shimmering as the player moves.
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 110);
  }

  /** Nudge render resolution to hold ~60fps. */
  trackFrame(dtMs: number, now: number) {
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    if (now - this.lastDynAdjust < 2000 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    let next = this.dynScale;
    if (avg > 19.5) next = Math.max(0.6, this.dynScale - 0.1);
    else if (avg < 14.5) next = Math.min(1, this.dynScale + 0.05);
    if (next !== this.dynScale) {
      this.dynScale = next;
      this.resize();
    }
    this.lastDynAdjust = now;
  }

  get resolutionScale() {
    return this.dynScale;
  }

  render(dt = 1 / 60) {
    this.renderer.shadowMap.needsUpdate = this.frameNo++ % 2 === 0;
    if (this.post) this.post.render(this.scene, this.camera, SUN_DIR, dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
