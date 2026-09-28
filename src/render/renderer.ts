import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { Q } from '../core/settings';

// Sun in the south-west: lights the town facades and the player's usual view north.
export const SUN_DIR = new THREE.Vector3(-0.5, 0.6, 0.55).normalize();
export const FOG_COLOR = new THREE.Color(0xb9c6cf);

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private composer: EffectComposer | null = null;
  private bloom?: UnrealBloomPass;
  private smaa?: SMAAPass;
  private basePixelRatio = Q.pixelRatio;
  private dynScale = 1;
  private frameTimes: number[] = [];
  private lastDynAdjust = 0;

  constructor(container: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: Q.msaa, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(this.basePixelRatio);
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Shadows refresh every other frame (see render()); at 60fps that's invisible.
    r.shadowMap.autoUpdate = false;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 60, 420);

    // Sun: warm key light with a tight shadow box that follows the player.
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(Q.shadowMapSize, Q.shadowMapSize);
    const s = this.sun.shadow.camera;
    s.left = -26; s.right = 26; s.top = 26; s.bottom = -26; s.near = 1; s.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b5142, 0.55);
    this.scene.add(this.hemi);

    // Post-processing chain (High only). HalfFloat keeps HDR values for bloom.
    if (Q.bloom || Q.smaa) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (Q.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 2.2);
        this.composer.addPass(this.bloom);
      }
      this.composer.addPass(new OutputPass());
      if (Q.smaa) {
        this.smaa = new SMAAPass();
        this.composer.addPass(this.smaa);
      }
    }
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
    this.scene.environmentIntensity = 0.7;
    this.scene.background = tex;
    this.scene.backgroundIntensity = 0.85;
    this.scene.backgroundBlurriness = 0.02;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.basePixelRatio * this.dynScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
    // Bloom at half resolution is plenty and saves a lot on integrated GPUs.
    this.bloom?.setSize(Math.floor((w * pr) / 2), Math.floor((h * pr) / 2));
  }

  /** Keep the shadow frustum centred on the player so it stays sharp. */
  followShadow(focus: THREE.Vector3) {
    const texel = (26 * 2) / Q.shadowMapSize;
    // Snap to shadow texels to stop shimmering as the player moves.
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 70);
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

  private frameNo = 0;

  render() {
    this.renderer.shadowMap.needsUpdate = this.frameNo++ % 2 === 0;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
