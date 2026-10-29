import * as THREE from 'three';

/** How far into the Dark mirror the world looks (0..1; story/darkMirror.ts drives it). */
export const DARK = { value: 0 };

// ---------------------------------------------------------------------------
// Lean single-chain post-processing, replacing EffectComposer on Medium/High:
//   scene -> HDR target (MSAA, with depth)
//   bright pass + 3-level blur at 1/4 res -> bloom
//   final: aerial-perspective haze and drifting cloud shadows reconstructed
//          from depth, bloom, ACES tone mapping, the "wild" grade, vignette
// The wild look (after Breath of the Wild): strong blue distance haze, so
// hills stack in pale layers; bright, slightly washed-out colour; cool lifted
// shade; soft bloom. No outlines, no brush filters: textures and models stay
// clean and detailed.
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

// Contact shading: scalable ambient obscurance (McGuire et al.) from the
// depth buffer alone, at half resolution. Normals come from depth
// derivatives; a jittered spiral of taps within AO_R metres darkens creases,
// eaves, wall feet and the ground under things. A depth-aware blur smooths
// the jitter before the final pass applies it.
const AO_FRAG = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  uniform vec2 uTexel; uniform float uProjScale;
  varying vec2 vUv;
  const float AO_R = 0.9;
  vec3 viewPos(vec2 uv, float depth) {
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }
  void main() {
    float depth = texture2D(tDepth, vUv).r;
    if (depth >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 p = viewPos(vUv, depth);
    // Normal from the nearer neighbour on each axis (not dFdx, which straddles
    // 2x2 quads): flat ground seen at a low angle stays flat, with no stripes.
    vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0), texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).r);
    vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0), texture2D(tDepth, vUv - vec2(uTexel.x, 0.0)).r);
    vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y), texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).r);
    vec3 pd = viewPos(vUv - vec2(0.0, uTexel.y), texture2D(tDepth, vUv - vec2(0.0, uTexel.y)).r);
    vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
    vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
    vec3 n = normalize(cross(dx, dy));
    float ssR = min(AO_R * uProjScale / max(-p.z, 0.1), 60.0);
    if (ssR < 1.5 || -p.z > 140.0) { gl_FragColor = vec4(1.0); return; }
    float ang0 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2832;
    float sum = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = (float(i) + 0.5) / 8.0;
      float ang = ang0 + a * 13.0;
      vec2 suv = vUv + vec2(cos(ang), sin(ang)) * a * ssR * uTexel;
      vec3 q = viewPos(suv, texture2D(tDepth, suv).r);
      vec3 v = q - p;
      float vv = dot(v, v);
      float vn = dot(v, n) + p.z * 0.003 - 0.03; // a small bias that grows with distance (depth precision)
      float f = max(AO_R * AO_R - vv, 0.0);
      sum += f * f * f * max(vn / (vv + 0.02), 0.0);
    }
    float ao = max(0.0, 1.0 - sum * (6.0 / pow(AO_R, 6.0)) / 8.0);
    gl_FragColor = vec4(ao, -p.z, 0.0, 1.0);
  }`;

/** 3x3 blur that ignores taps across depth edges (keeps silhouettes crisp). */
const AO_BLUR_FRAG = /* glsl */ `
  uniform sampler2D tAO; uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 c = texture2D(tAO, vUv).rg;
    float sum = 0.0, wsum = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 s = texture2D(tAO, vUv + vec2(float(x), float(y)) * uTexel).rg;
      float w = 1.0 / (1.0 + abs(s.g - c.g) * 4.0);
      sum += s.r * w; wsum += w;
    }
    gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
  }`;

const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tColor, tDepth, tBloom, tNoise;
  uniform mat4 uProjInv, uCamWorld;
  uniform vec3 uCamPos, uSunDir, uSunColor, uHazeColor;
  uniform float uNear, uFar, uTime, uExposure, uBloom, uHaze, uClouds, uMist;
  uniform sampler2D tAO; uniform float uAO;
  uniform vec2 uTexel;
  uniform float uDark;
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

    if (!sky && uAO > 0.0 && dist < 140.0) {
      float ao = texture2D(tAO, vUv).r;
      // Soft and cool, never black: occlusion tints toward a shaded blue-green.
      float k = uAO * (1.0 - smoothstep(70.0, 140.0, dist));
      col *= mix(vec3(1.0), mix(vec3(0.42, 0.46, 0.55), vec3(1.0), ao), k);
    }

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
      // Distant land loses saturation and turns blue long before the haze
      // swallows it: hills stack in pale layers (aerial perspective).
      float farL = dot(col, vec3(0.3, 0.55, 0.15));
      float far = smoothstep(35.0, 600.0, dist);
      col = mix(col, vec3(farL) * mix(vec3(1.0), uHazeColor * 1.2, 0.6), far * 0.62);
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

    // The wild grade: bright and a little washed out, warm light, cool lifted shade.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, 1.14);
    col = mix(col, col * vec3(1.03, 1.01, 0.96), smoothstep(0.35, 1.0, luma));
    // Shade never sinks to black: it lifts toward a soft sky blue.
    col += vec3(0.022, 0.034, 0.055) * (1.0 - smoothstep(0.0, 0.45, luma));
    col = mix(col, col * vec3(0.94, 0.99, 1.06), 1.0 - smoothstep(0.0, 0.4, luma));
    // A gentle S-curve that keeps the highlights soft.
    col = col * col * (3.0 - 2.0 * col) * 0.22 + col * 0.78;
    // The Dark mirror (story): the same world, drained and bruised, a red-black sky, ash on the air.
    if (uDark > 0.001) {
      float ld = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 dk = mix(vec3(ld) * vec3(0.62, 0.52, 0.78), col * vec3(0.55, 0.42, 0.7), 0.25);
      if (sky) dk = mix(vec3(0.16, 0.03, 0.05), vec3(0.42, 0.08, 0.1), smoothstep(0.2, 0.9, vUv.y)) + ld * 0.08;
      vec2 pxd = vUv / uTexel;
      float ash = step(0.996, noise2(pxd / 3.0 + vec2(0.0, uTime * 40.0)));
      dk += ash * vec3(0.5, 0.4, 0.45);
      dk *= 0.92 + 0.08 * sin(uTime * 2.3 + noise2(pxd / 120.0) * 6.0);
      col = mix(col, dk, uDark);
    }
    // Vignette.
    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * (0.2 + uDark * 1.1);
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
  private aoMat: THREE.ShaderMaterial;
  private aoBlurMat: THREE.ShaderMaterial;
  private aoA: THREE.WebGLRenderTarget;
  private aoB: THREE.WebGLRenderTarget;
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
    this.aoA = lo();
    this.aoB = lo();
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: AO_FRAG,
      uniforms: { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2(1, 1) }, uProjScale: { value: 300 } },
    });
    this.aoBlurMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: AO_BLUR_FRAG, uniforms: { tAO: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } } });
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
        uExposure: { value: 1.0 }, uBloom: { value: 0.3 }, uHaze: { value: 0.00072 }, uClouds: { value: 0.85 }, uMist: { value: 0 },
        tAO: { value: null }, uAO: { value: 0.75 },
        uTexel: { value: new THREE.Vector2(1, 1) }, uDark: DARK,
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
    (this.finalMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    const aw = Math.max(1, Math.floor(w / 2)), ah = Math.max(1, Math.floor(h / 2));
    this.aoA.setSize(aw, ah);
    this.aoB.setSize(aw, ah);
    (this.aoMat.uniforms.uTexel.value as THREE.Vector2).set(1 / aw, 1 / ah);
    (this.aoBlurMat.uniforms.uTexel.value as THREE.Vector2).set(1 / aw, 1 / ah);
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

    // Contact shading at half resolution, then a depth-aware blur.
    if (this.finalMat.uniforms.uAO.value > 0) {
      const a = this.aoMat.uniforms;
      a.tDepth.value = this.scene.depthTexture;
      (a.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      a.uProjScale.value = this.aoA.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      this.pass(this.aoMat, this.aoA);
      this.aoBlurMat.uniforms.tAO.value = this.aoA.texture;
      this.pass(this.aoBlurMat, this.aoB);
    }

    const u = this.finalMat.uniforms;
    u.tAO.value = this.aoB.texture;
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
