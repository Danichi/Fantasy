import * as THREE from 'three';
import { Q } from '../core/settings';
import { Post } from './post';
import { Sky, SKY } from './sky';

// Direction toward the light that casts shadows. Mutable: the world clock moves
// the sun (and the moon at night); everything reading it follows.
export const SUN_DIR = new THREE.Vector3(-0.5, 0.6, 0.55).normalize();
export const FOG_COLOR = new THREE.Color(0xcfe7ef);

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly post: Post | null = null;
  sky: Sky | null = null;
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
    // Checking every shader compile blocks on the GPU driver (seconds at boot and
    // a hitch whenever a new material appears); only do it when debugging.
    r.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug');
    r.shadowMap.enabled = Q.shadows !== false;
    r.shadowMap.type = THREE.PCFShadowMap;
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
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(Q.shadowMapSize, Q.shadowMapSize);
    const s = this.sun.shadow.camera;
    s.left = -42; s.right = 42; s.top = 42; s.bottom = -42; s.near = 1; s.far = 220;
    this.sun.shadow.radius = 3.2;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    // Cool sky fill so shadows read blue, never black (docs/ART-DIRECTION.md §2).
    this.hemi = new THREE.HemisphereLight(0xa9c7ee, 0x6d6a4a, 1.05);
    this.scene.add(this.hemi);

    if (Q.post) this.post = new Post(r, Q.msaa ? 4 : 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Painted sky dome + matching image-based ambient and haze (replaces the photo HDRI). */
  useStylizedSky() {
    this.sky = new Sky(SUN_DIR);
    this.scene.add(this.sky.mesh);
    this.scene.background = null;
    this.scene.environment = this.sky.environment(this.renderer);
    this.scene.environmentIntensity = 0.42;
    if (this.post) {
      const u = this.post.finalMat.uniforms;
      (u.uHazeColor.value as THREE.Color).copy(SKY.horizon);
      u.uHaze.value = 0.0008; // hills a few hundred metres out read as layers; the sea stays crisp
    }
  }

  private envT = 0;
  private flash = 0;
  /** Lightning: a brief flash of sky and light. */
  lightning(strength: number) {
    this.flash = Math.max(this.flash, strength);
  }

  /**
   * Time of day and weather: sun/moon, ambient, sky, haze, exposure.
   * `s` comes from WorldTime.state, `w` from Weather.p.
   */
  applyTime(dt: number, s: import('../world/worldTime').SkyState, w: import('../world/weather').WeatherParams) {
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const flash = this.flash > 0.02 ? this.flash * (0.6 + 0.4 * Math.sin(this.flash * 40)) : 0;
    SUN_DIR.copy(s.lightDir);
    const cloudDim = 1 - w.cloud * 0.62 - w.fog * 0.15;
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity * Math.max(0.15, cloudDim) + flash * 2.5;
    this.hemi.color.copy(s.hemiSky).lerp(new THREE.Color(0.62, 0.66, 0.72), w.cloud * 0.45 * (1 - s.night));
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity * (1 + w.cloud * 0.12) + flash * 1.2;
    this.scene.environmentIntensity = s.envIntensity * (1 - w.cloud * 0.3);
    // Overcast skies soften shadows.
    this.sun.shadow.radius = 3.2 + w.cloud * 6;
    this.sky?.setState(s.zenith, s.horizon, s.sunColor, s.sunDir, s.moonDir, s.night, w.cloud, flash);
    if (this.post) {
      const u = this.post.finalMat.uniforms;
      const haze = (u.uHazeColor.value as THREE.Color).copy(s.haze);
      const stormy = THREE.MathUtils.smoothstep(w.cloud, 0.72, 1);
      haze.lerp(new THREE.Color(0.6, 0.64, 0.7).lerp(new THREE.Color(0.3, 0.34, 0.42), stormy).multiplyScalar(1 - s.night * 0.8), Math.min(1, w.cloud * 0.55 + w.fog * 0.6));
      (u.uSunColor.value as THREE.Color).copy(s.sunColor);
      u.uHaze.value = 0.0008 + w.fog * 0.0045 + w.rain * 0.0015 + w.snow * 0.003;
      u.uExposure.value = s.exposure * (1 - stormy * 0.26) * (1 + flash * 0.8);
      u.uClouds.value = 0.85 * (1 - w.cloud * 0.8) * (1 - s.night);
    } else if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(s.haze);
      this.scene.fog.far = 720 * (1 - w.fog * 0.7);
    }
    this.renderer.toneMappingExposure = 1.06 * s.exposure;
    // Refresh the image-based ambient light now and then as the sky changes.
    this.envT -= dt;
    if (this.envT <= 0 && this.sky) {
      this.envT = 20;
      const old = this.scene.environment;
      this.scene.environment = this.sky.environment(this.renderer);
      old?.dispose();
    }
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
    this.sky?.update(dt, this.camera);
    this.renderer.shadowMap.needsUpdate = this.frameNo++ % 2 === 0;
    if (this.post) this.post.render(this.scene, this.camera, SUN_DIR, dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
