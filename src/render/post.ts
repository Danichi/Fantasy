import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Lean single-chain post-processing, replacing EffectComposer on Medium/High:
//   scene -> HDR target (MSAA, with depth)
//   bright pass + 3-level blur at 1/4 res -> bloom
//   final: aerial-perspective haze and drifting cloud shadows reconstructed
//          from depth, bloom, ACES tone mapping, warm painterly grade, vignette
// ---------------------------------------------------------------------------

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tColor; uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    // One NaN pixel would smear across the whole bloom; drop it here.
    if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
    float l = max(max(c.r, c.g), c.b);
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold * 1.8, l), 1.0);
  }`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tIn; uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tIn, vUv).rgb * 0.227;
    s += (texture2D(tIn, vUv + uDir * 1.385).rgb + texture2D(tIn, vUv - uDir * 1.385).rgb) * 0.316;
    s += (texture2D(tIn, vUv + uDir * 3.231).rgb + texture2D(tIn, vUv - uDir * 3.231).rgb) * 0.07;
    gl_FragColor = vec4(s, 1.0);
  }`;

const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tColor, tDepth, tBloom, tNoise;
  uniform mat4 uProjInv, uCamWorld;
  uniform vec3 uCamPos, uSunDir, uSunColor, uHazeColor;
  uniform float uNear, uFar, uTime, uExposure, uBloom, uHaze, uClouds, uMist;
  varying vec2 vUv;

  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec3 viewPos(vec2 uv, float depth) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 v = uProjInv * ndc;
    return v.xyz / v.w;
  }
  float noise2(vec2 p) { return texture2D(tNoise, p).r; }

  void main() {
    vec3 col = texture2D(tColor, vUv).rgb;
    if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
    float depth = texture2D(tDepth, vUv).r;
    vec3 vp = viewPos(vUv, depth);
    vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
    vec3 ray = normalize(wp - uCamPos);
    bool sky = depth >= 0.99999;
    float dist = sky ? 3000.0 : length(wp - uCamPos);

    // Drifting cloud shadows on anything lit (ground, buildings, characters).
    if (!sky && uClouds > 0.0) {
      vec2 cp = wp.xz * 0.0045 + vec2(uTime * 0.006, uTime * 0.0025);
      float c = noise2(cp) * 0.65 + noise2(cp * 2.3 + 0.37) * 0.35;
      float shade = smoothstep(0.48, 0.72, c);
      col *= mix(1.0, 0.78, shade * uClouds);
    }

    // Aerial perspective: exponential haze thinning with altitude, warmer
    // and brighter toward the sun.
    float sunAmt = pow(max(dot(ray, uSunDir), 0.0), 6.0);
    vec3 haze = mix(uHazeColor, uSunColor, sunAmt * 0.55);
    if (!sky) {
      // Analytic height fog integrated along the view ray: dense in the
      // valleys, thin up high, correct from any camera altitude.
      const float k = 0.018;
      float camH = max(uCamPos.y, -5.0);
      float dy = ray.y * dist;
      float amount = abs(dy) > 0.05
        ? uHaze * exp(-k * camH) * (1.0 - exp(-k * dy)) / (k * ray.y)
        : uHaze * exp(-k * camH) * dist;
      float f = 1.0 - exp(-max(amount, 0.0));
      // Distant land also loses saturation into the haze (aerial perspective).
      float farL = dot(col, vec3(0.3, 0.55, 0.15));
      col = mix(col, vec3(farL), smoothstep(80.0, 900.0, dist) * 0.35);
      // uMist (the Gravewood's cursed fog) lets the haze swallow everything.
      col = mix(col, haze, clamp(f, 0.0, mix(0.92, 0.995, uMist)));
    } else {
      // Soft horizon haze on the sky itself.
      float horizon = 1.0 - smoothstep(0.0, 0.22, ray.y);
      col = mix(col, haze * 1.05, horizon * 0.55);
      col = mix(col, haze, uMist);
    }

    col += texture2D(tBloom, vUv).rgb * uBloom;
    col = aces(col * uExposure);

    // Map-palette grade (docs/ART-DIRECTION.md §2): deep, saturated, luminous.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    // Luminous rather than loud: gentle saturation, warm light, cool shade.
    col = mix(vec3(luma), col, 1.12);
    col = mix(col, col * vec3(1.025, 1.01, 0.975), smoothstep(0.35, 1.0, luma));
    col = mix(col, col * vec3(0.93, 0.99, 1.07), 1.0 - smoothstep(0.0, 0.4, luma));
    col = col * col * (3.0 - 2.0 * col) * 0.3 + col * 0.7;
    // Vignette.
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.28;
    gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
  }`;

function noiseTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  // Tileable value noise from a few octaves of wrapped lattice noise.
  const rnd = (x: number, y: number) => {
    const s = Math.sin((x % N) * 127.1 + (y % N) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, y: number, f: number) => {
    const X = (x / N) * f, Y = (y / N) * f;
    const xi = Math.floor(X), yi = Math.floor(Y), xf = X - xi, yf = Y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const w = (a: number, b: number) => rnd(((a % f) + f) % f * 17, ((b % f) + f) % f * 17);
    return (w(xi, yi) * (1 - u) + w(xi + 1, yi) * u) * (1 - v) + (w(xi, yi + 1) * (1 - u) + w(xi + 1, yi + 1) * u) * v;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = vn(x, y, 4) * 0.5 + vn(x, y, 8) * 0.3 + vn(x, y, 16) * 0.2;
      const k = (y * N + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = n * 255;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class Post {
  private scene: THREE.RenderTarget;
  private bright: THREE.WebGLRenderTarget;
  private blurA: THREE.WebGLRenderTarget;
  private blurB: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsScene = new THREE.Scene();
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  readonly finalMat: THREE.ShaderMaterial;
  private time = 0;

  constructor(private renderer: THREE.WebGLRenderer, samples: number) {
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture });
    const lo = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.bright = lo();
    this.blurA = lo();
    this.blurB = lo();
    this.brightMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, uniforms: { tColor: { value: null }, uThreshold: { value: 1.6 } } });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, uniforms: { tIn: { value: null }, uDir: { value: new THREE.Vector2() } } });
    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: FINAL_FRAG,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tNoise: { value: noiseTexture() },
        uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1.0, 0.93, 0.78) }, uHazeColor: { value: new THREE.Color(0.72, 0.86, 0.96) },
        uNear: { value: 0.1 }, uFar: { value: 900 }, uTime: { value: 0 },
        uExposure: { value: 1.0 }, uBloom: { value: 0.28 }, uHaze: { value: 0.00072 }, uClouds: { value: 0.85 }, uMist: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.finalMat);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
  }

  setSize(w: number, h: number) {
    this.scene.setSize(w, h);
    const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4));
    this.bright.setSize(bw, bh);
    this.blurA.setSize(bw, bh);
    this.blurB.setSize(bw, bh);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.camera);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, sunDir: THREE.Vector3, dt: number) {
    const R = this.renderer;
    this.time += dt;
    const tone = R.toneMapping;
    R.toneMapping = THREE.NoToneMapping; // tone mapping happens in the final pass
    R.setRenderTarget(this.scene as THREE.WebGLRenderTarget);
    R.clear();
    R.render(scene, camera);

    // Bloom: bright pass, then separable blur twice at 1/4 resolution.
    this.brightMat.uniforms.tColor.value = this.scene.texture;
    this.pass(this.brightMat, this.bright);
    const bw = this.bright.width, bh = this.bright.height;
    let src = this.bright;
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tIn.value = src.texture;
      (this.blurMat.uniforms.uDir.value as THREE.Vector2).set((1 + i) / bw, 0);
      this.pass(this.blurMat, this.blurA);
      this.blurMat.uniforms.tIn.value = this.blurA.texture;
      (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, (1 + i) / bh);
      this.pass(this.blurMat, this.blurB);
      src = this.blurB;
    }

    const u = this.finalMat.uniforms;
    u.tColor.value = this.scene.texture;
    u.tDepth.value = this.scene.depthTexture;
    u.tBloom.value = this.blurB.texture;
    (u.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (u.uCamPos.value as THREE.Vector3).copy(camera.position);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    u.uTime.value = this.time;
    this.pass(this.finalMat, null);
    R.toneMapping = tone;
  }
}
