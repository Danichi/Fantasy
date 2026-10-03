import * as THREE from 'three';
import { macroTexture, SEA_LEVEL, WORLD_X0, WORLD_Z0, GW, GH } from '../worldMap';
import { SKY } from '../../render/sky';
import { BASE_WAVES, STORM_WAVES, SEA, waveHeight, type Wave } from './seaState';

// The Grand Ocean (docs/ART-DIRECTION.md §2, docs/design/boating.md §5–6): one
// radial grid that follows the camera, dense near and sparse to the horizon.
// Steep Gerstner waves (the same trains the ships float on: seaState.ts) grow
// with the wind, the sea's danger and storms; detail ripples run with the wind;
// light glows through the crests; whitecaps, wind streaks and shore foam;
// turquoise shallows to deep navy by the seabed depth; storm seas go dark and
// grey-green.

const RINGS = 84;
const SPOKES = 112;
const MAX_R = 32000;

/** (Kept for older imports: the everyday wave trains.) */
export const WAVES = BASE_WAVES;

function radialGeometry() {
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  // Radii grow geometrically: about 1.2 m spacing near the camera.
  const radius = (r: number) => (Math.pow(1.092, r) - 1) * 13;
  for (let r = 1; r <= RINGS; r++) {
    const rad = Math.min(MAX_R, radius(r));
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  const ring = (r: number, s: number) => 1 + (r - 1) * SPOKES + (s % SPOKES);
  for (let s = 0; s < SPOKES; s++) idx.push(0, ring(1, s + 1), ring(1, s));
  for (let r = 1; r < RINGS; r++) {
    for (let s = 0; s < SPOKES; s++) {
      const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s), d = ring(r + 1, s + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** GLSL for a set of wave trains, scaled by `scale` (must match waveAt() in seaState.ts). */
function trainsGlsl(waves: Wave[], scale: string, tag: string) {
  return waves.map(([dx, dz, len, amp, q], i) => {
    const l = Math.hypot(dx, dz);
    const k = (2 * Math.PI) / len;
    return `{
        vec2 d = vec2(${(dx / l).toFixed(4)}, ${(dz / l).toFixed(4)});
        float k = ${k.toFixed(5)};
        float f = k * (dot(d, wp.xz) - ${Math.sqrt(9.8 / k).toFixed(4)} * uTime);
        float a = ${amp.toFixed(4)} * ${scale} * calm;
        float cs = cos(f), sn = sin(f);
        disp.xz += d * a * ${q.toFixed(3)} * cs;
        disp.y += a * sn;
        nrm.xz -= d * k * a * cs;
        nrm.y -= ${q.toFixed(3)} * k * a * sn;
      } // ${tag}${i}`;
  }).join('\n');
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    tMacro: { value: null as THREE.Texture | null },
    uWorld: { value: new THREE.Vector4(WORLD_X0, WORLD_Z0, GW, GH) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSky: { value: SKY.zenith.clone() },
    uHorizon: { value: SKY.horizon.clone() },
    uAmp: { value: 1 },
    uStorm: { value: 0 },
    uHeight: { value: 1 },
    uWind: { value: new THREE.Vector3(1, 0, 0.4) },
    uDim: { value: 0 },
  };

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    this.uniforms.tMacro.value = macroTexture();
    this.uniforms.uSunDir.value = sunDir; // follows the world clock
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        uniform float uTime, uAmp, uStorm; uniform vec2 uCenter;
        varying vec3 vW; varying vec3 vN; varying float vCalm; varying float vCrest;
        void main() {
          vec3 wp = vec3(position.x + uCenter.x, ${SEA_LEVEL.toFixed(2)}, position.z + uCenter.y);
          float dist = length(position.xz);
          // Waves calm toward the horizon (the grid there is too coarse to carry them).
          float calm = 1.0 - smoothstep(260.0, 1500.0, dist);
          vec3 disp = vec3(0.0);
          vec3 nrm = vec3(0.0, 1.0, 0.0);
          ${trainsGlsl(BASE_WAVES, 'uAmp', 'base')}
          ${trainsGlsl(STORM_WAVES, 'uStorm', 'storm')}
          wp += disp;
          vW = wp; vCalm = calm;
          vN = normalize(nrm);
          // How far up its crest this point is (0 trough .. 1 peak), for foam and glow.
          vCrest = disp.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMacro; uniform vec4 uWorld; uniform vec3 uSunDir, uSky, uHorizon, uWind;
        uniform float uTime, uDim, uAmp, uStorm, uHeight;
        varying vec3 vW; varying vec3 vN; varying float vCalm; varying float vCrest;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.1 - 3.3) * 0.2; }
        /** Slope of a scrolling noise field (a cheap ripple normal). */
        vec2 ripple(vec2 p) {
          float e = 0.12;
          float c = fbm(p), x = fbm(p + vec2(e, 0.0)), z = fbm(p + vec2(0.0, e));
          return vec2(x - c, z - c) / e;
        }
        void main() {
          // Seabed depth from the macro map (bilinear over 60 m cells).
          vec2 gc = (vW.xz - uWorld.xy) / 60.0 - 0.5;
          vec2 i0 = floor(gc), f = fract(gc);
          float e00 = texture2D(tMacro, (i0 + 0.5) / uWorld.zw).b, e10 = texture2D(tMacro, (i0 + vec2(1.5, 0.5)) / uWorld.zw).b;
          float e01 = texture2D(tMacro, (i0 + vec2(0.5, 1.5)) / uWorld.zw).b, e11 = texture2D(tMacro, (i0 + 1.5) / uWorld.zw).b;
          float elev = -80.0 + mix(mix(e00, e10, f.x), mix(e01, e11, f.x), f.y) * 800.0;
          // Only where the map has sea: inland hollows and river beds stay dry.
          if (elev > ${(SEA_LEVEL + 1.4).toFixed(2)}) discard;
          float depth = max(0.0, ${SEA_LEVEL.toFixed(2)} - elev);
          float viewDist = length(cameraPosition - vW);
          vec2 wind = normalize(uWind.xz);
          float windS = uWind.y;

          // ---- normal: the waves plus detail ripples that run with the wind ----
          float near = 1.0 - smoothstep(60.0, 420.0, viewDist);
          vec2 r1 = ripple(vW.xz * 0.22 + wind * uTime * 0.55);
          vec2 r2 = ripple(vW.xz * 0.9 - vec2(-wind.y, wind.x) * uTime * 0.7 + wind * uTime * 0.9);
          vec2 slope = (r1 * 0.22 + r2 * 0.1) * (0.5 + windS * 0.9 + uStorm * 0.8) * (0.35 + 0.65 * near);
          vec3 N = normalize(vN + vec3(slope.x, 0.0, slope.y));
          vec3 V = normalize(cameraPosition - vW);
          float NdV = max(dot(N, V), 0.0);

          // ---- body colour: turquoise shallows, teal, deep navy; storms go grey-green ----
          vec3 shallow = vec3(0.06, 0.5, 0.52), mid = vec3(0.018, 0.26, 0.4), deep = vec3(0.007, 0.07, 0.18);
          vec3 water = mix(shallow, mid, smoothstep(0.6, 4.5, depth));
          water = mix(water, deep, smoothstep(4.5, 34.0, depth));
          water = mix(water, deep * 1.1, smoothstep(40.0, 600.0, viewDist) * 0.5);
          water = mix(water, vec3(0.06, 0.14, 0.15), uStorm * 0.55);
          // Light through the crests: thin water on a wave's face glows green-blue.
          float crestN = clamp(vCrest / max(0.15, uHeight * 0.5), 0.0, 1.0);
          float back = pow(clamp(dot(V, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);
          float sss = crestN * (0.35 + back * 0.65) * (1.0 - uDim * 0.8) * smoothstep(-0.05, 0.15, uSunDir.y);
          water += vec3(0.03, 0.36, 0.32) * sss * 0.35;
          // Shallow water shows a little of the bright sand beneath.
          water = mix(water, vec3(0.5, 0.62, 0.5), smoothstep(1.2, 0.2, depth) * 0.25);

          // ---- reflection: Fresnel to the sky, a horizon haze ----
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uHorizon * 0.92, uSky, smoothstep(-0.02, 0.4, R.y));
          sky = mix(sky, vec3(0.32, 0.36, 0.38), uStorm * 0.6);
          float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
          vec3 col = mix(water, sky, clamp(fres * 0.85, 0.0, 0.92));
          // Sun glitter: tighter on calm water, broad and broken in wind.
          vec3 H = normalize(uSunDir + V);
          float shine = mix(900.0, 160.0, clamp(windS + uStorm, 0.0, 1.0));
          float sunUp = smoothstep(-0.05, 0.12, uSunDir.y);
          col += vec3(1.0, 0.92, 0.78) * pow(max(dot(N, H), 0.0), shine) * (shine / 220.0) * 1.6 * sunUp * (1.0 - uDim) * (1.0 - uStorm * 0.8);
          // Sunset: a warm path across the water.
          col += vec3(1.0, 0.5, 0.2) * pow(max(dot(N, H), 0.0), 40.0) * 0.12 * smoothstep(0.25, 0.02, uSunDir.y) * sunUp;
          col *= 1.0 - uDim * 0.38;

          // ---- foam ----
          float fn = fbm(vW.xz * 0.45 + wind * uTime * 0.3);
          float fn2 = vnoise(vW.xz * 1.6 - uTime * 0.5);
          // Whitecaps on the crests: more as the waves grow and in storms.
          float capsAt = mix(0.78, 0.45, clamp((uHeight - 0.8) / 4.0 + uStorm * 0.5, 0.0, 1.0));
          float rough = clamp((uHeight - 0.9) / 3.5 + uStorm * 0.6, 0.0, 1.0);
          float caps = smoothstep(capsAt, capsAt + 0.14, crestN) * smoothstep(0.5, 0.75, fn * 0.7 + fn2 * 0.5) * (0.35 + 0.65 * rough);
          // Thin streaks blown along the wind, only in rough weather.
          vec2 along = vec2(dot(vW.xz, wind), dot(vW.xz, vec2(-wind.y, wind.x)));
          float streak = smoothstep(0.8, 0.92, vnoise(vec2(along.x * 0.025 - uTime * 0.6, along.y * 1.3))) * smoothstep(0.35, 1.0, rough) * 0.45 * near;
          // Shore foam: bands that roll in over the shallows and break.
          float bands = smoothstep(0.55, 0.95, sin(depth * 5.0 - uTime * 1.6 + fn * 3.0) * 0.5 + 0.5);
          float shore = smoothstep(1.4, 0.05, depth) * (0.45 + bands * 0.55) * smoothstep(0.2, 0.45, fn + 0.12);
          float foam = clamp(caps * 0.85 + streak + shore * 0.75, 0.0, 1.0) * mix(1.0, 0.5, smoothstep(300.0, 1500.0, viewDist));
          col = mix(col, vec3(0.94, 0.97, 1.0) * (1.0 - uDim * 0.4), foam);

          // Far water fades into the horizon haze.
          col = mix(col, uHorizon * (1.0 - uDim * 0.4), smoothstep(900.0, 9000.0, viewDist) * 0.55);
          // Shallow water is clear enough to see the sand beneath.
          float alpha = mix(0.6, 0.97, smoothstep(0.3, 3.5, depth));
          alpha = max(alpha, foam);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(radialGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'ocean';
    scene.add(this.mesh);
  }

  /** Weather and time: sky reflection colours, overcast dimming (wave height comes from seaState). */
  setConditions(wind: number, zenith: THREE.Color, horizon: THREE.Color, overcast: number, night: number) {
    this.uniforms.uSky.value.copy(zenith);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uDim.value = Math.min(1, overcast * 0.7 + night * 0.6);
    void wind;
  }

  update(dt: number, camera: THREE.Vector3) {
    void dt;
    // The sea's own clock (seaState.updateSea advances it) drives the waves.
    this.uniforms.uTime.value = SEA.t;
    this.uniforms.uAmp.value = SEA.amp;
    this.uniforms.uStorm.value = SEA.storm;
    this.uniforms.uHeight.value = waveHeight();
    this.uniforms.uWind.value.set(SEA.windDir.x, SEA.wind, SEA.windDir.y);
    // Follow the camera, snapped so the grid doesn't swim.
    this.uniforms.uCenter.value.set(Math.round(camera.x / 2) * 2, Math.round(camera.z / 2) * 2);
  }

  setVisible(v: boolean) {
    this.mesh.visible = v;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
