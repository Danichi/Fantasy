import * as THREE from 'three';
import { worldNoise } from './noise';

// Painted sky (docs/ART-DIRECTION.md §8): a soft zenith-to-horizon gradient,
// a warm sun glow and stylised cumulus clouds with lit tops and cool bellies.
// It replaces the photographic HDRI, and a blurred capture of it lights the
// scene (image-based ambient), so the sky and the world always agree.

export const SKY = {
  zenith: new THREE.Color('#5fa6e3'),
  horizon: new THREE.Color('#dcecf0'),
  sunGlow: new THREE.Color('#fff0d0'),
  cloudLit: new THREE.Color('#ffffff'),
  cloudShade: new THREE.Color('#a9b9d2'),
};

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w * 0.99999; // always behind everything
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uSunGlow, uCloudLit, uCloudShade, uSunDir;
  uniform sampler2D tNoise;
  uniform float uTime, uClouds;
  varying vec3 vDir;

  float fbm(vec2 p) {
    float v = texture2D(tNoise, p).r * 0.55;
    v += texture2D(tNoise, p * 2.03 + 0.17).r * 0.28;
    v += texture2D(tNoise, p * 4.11 + 0.41).b * 0.17;
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    // Gradient: a broad pale band at the horizon easing into deep blue.
    vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.62, h), 0.72));
    // Below the horizon the haze colour continues (the far terrain covers it).
    if (d.y < 0.0) col = uHorizon;
    // Sun: a soft disc and a wide warm glow.
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunGlow * (pow(sd, 8.0) * 0.28 + pow(sd, 64.0) * 0.45);
    col = mix(col, vec3(1.0, 0.98, 0.9) * 1.6, smoothstep(0.9993, 0.9997, sd));

    // Clouds on a curved layer: project the ray onto a dome above the world.
    if (d.y > 0.02 && uClouds > 0.0) {
      vec2 uv = d.xz / (d.y + 0.22) * 0.075 + vec2(uTime * 0.0009, uTime * 0.0004);
      float n = fbm(uv);
      float body = smoothstep(0.58, 0.72, n) * 0.35 * smoothstep(0.25, 0.6, d.y);
      // Shade from a second sample offset toward the sun: thicker there = darker belly.
      float n2 = fbm(uv + uSunDir.xz * 0.02);
      float lit = clamp(0.5 + (n - n2) * 6.0, 0.0, 1.0);
      vec3 cloud = mix(uCloudShade, uCloudLit, lit * 0.7 + 0.3 * smoothstep(0.5, 0.8, n));
      // Silver lining toward the sun.
      cloud += uSunGlow * pow(sd, 6.0) * 0.35 * (1.0 - body);
      float fade = smoothstep(0.02, 0.2, d.y);
      col = mix(col, cloud, body * fade * uClouds);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** A painted cumulus: overlapping soft puffs, white tops, cool bellies. */
function cloudTexture(seed: number) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const base = H * 0.78;
  const puffs: [number, number, number][] = [];
  const n = 9 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = W * (0.12 + t * 0.76) + (rnd() - 0.5) * 30;
    // Taller in the middle, flat along the base.
    const r = (38 + rnd() * 34) * (0.65 + Math.sin(t * Math.PI) * 0.75);
    puffs.push([x, base - r * (0.55 + rnd() * 0.35), r]);
  }
  g.filter = 'blur(3px)';
  // Belly shade first, then lit puffs offset up toward the sun.
  for (const [x, y, r] of puffs) {
    g.fillStyle = 'rgb(176,190,214)';
    g.beginPath(); g.arc(x, y + r * 0.12, r, 0, Math.PI * 2); g.fill();
  }
  for (const [x, y, r] of puffs) {
    const grd = g.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.7, 'rgba(246,248,252,0.95)');
    grd.addColorStop(1, 'rgba(225,232,244,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y - r * 0.06, r * 0.93, 0, Math.PI * 2); g.fill();
  }
  // Flatten the base.
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, base - 6, 0, base + 14);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, base - 6, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly clouds = new THREE.Group();
  private cloudItems: { mesh: THREE.Mesh; az: number; el: number; speed: number }[] = [];
  private mat: THREE.ShaderMaterial;

  constructor(sunDir: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uZenith: { value: SKY.zenith }, uHorizon: { value: SKY.horizon }, uSunGlow: { value: SKY.sunGlow },
        uCloudLit: { value: SKY.cloudLit }, uCloudShade: { value: SKY.cloudShade },
        uSunDir: { value: sunDir.clone() }, tNoise: { value: worldNoise() }, uTime: { value: 0 }, uClouds: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    // Painted cumulus billboards around the horizon.
    const textures = [11, 23, 37, 51, 67].map(cloudTexture);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const tex = textures[i % textures.length];
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.96, toneMapped: false });
      const w = 260 + rnd() * 320;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), mat);
      mesh.renderOrder = -9;
      mesh.frustumCulled = false;
      this.clouds.add(mesh);
      this.cloudItems.push({ mesh, az: rnd() * Math.PI * 2, el: 0.04 + Math.pow(rnd(), 1.6) * 0.34, speed: 0.0008 + rnd() * 0.0012 });
    }
    this.mesh.add(this.clouds);
  }

  /** Blurred capture of the sky (no clouds) for image-based ambient light. */
  environment(renderer: THREE.WebGLRenderer) {
    const scene = new THREE.Scene();
    const m = new THREE.Mesh(this.mesh.geometry, this.mat.clone());
    (m.material as THREE.ShaderMaterial).uniforms.uClouds.value = 0.4;
    scene.add(m);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(scene, 0.06, 1, 2000).texture;
    pmrem.dispose();
    return env;
  }

  update(dt: number, camera: THREE.Camera) {
    this.mat.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);
    const R = 1350;
    for (const c of this.cloudItems) {
      c.az += c.speed * dt;
      const ce = Math.cos(c.el);
      c.mesh.position.set(Math.sin(c.az) * ce * R, Math.sin(c.el) * R, Math.cos(c.az) * ce * R);
      c.mesh.rotation.set(0, c.az + Math.PI, 0); // face the centre (camera), stay upright
    }
  }
}
