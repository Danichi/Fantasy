import * as THREE from 'three';
import { macroTexture, SEA_LEVEL, WORLD_X0, WORLD_Z0, GW, GH } from '../worldMap';
import { SKY } from '../../render/sky';

// The Grand Ocean (docs/ART-DIRECTION.md §2, prompt §24): one radial grid that
// follows the camera, dense near and sparse to the horizon, so there is no seam
// between near and far water. Gerstner waves near the camera calm with
// distance; colour runs from turquoise shallows through teal to deep navy using
// the seabed depth from the macro map; foam gathers where it's shallow.

const RINGS = 72;
const SPOKES = 96;
const MAX_R = 32000;

/** Gerstner wave set shared by the shader and CPU sampling (ship bobbing later). */
export const WAVES: [number, number, number, number][] = [
  // dirX, dirZ, wavelength (m), amplitude (m)
  [1, 0.35, 38, 0.32],
  [0.6, -0.8, 21, 0.18],
  [-0.4, 1, 13, 0.1],
  [0.9, 0.9, 7.5, 0.05],
];

function radialGeometry() {
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  // Radii grow geometrically: about 1.5 m spacing near the camera.
  const radius = (r: number) => (Math.pow(1.105, r) - 1) * 14;
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
    uWave: { value: 1 },
    uDim: { value: 0 },
  };

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    this.uniforms.tMacro.value = macroTexture();
    this.uniforms.uSunDir.value = sunDir; // follows the world clock
    const waveGlsl = WAVES.map(
      ([dx, dz, len, amp], i) => `{
        vec2 d${i} = normalize(vec2(${dx.toFixed(3)}, ${dz.toFixed(3)}));
        float k${i} = ${((2 * Math.PI) / len).toFixed(5)};
        float c${i} = sqrt(9.8 / k${i});
        float f${i} = k${i} * (dot(d${i}, wp.xz) - c${i} * uTime);
        float a${i} = ${amp.toFixed(3)} * calm * uWave;
        disp.x += d${i}.x * a${i} * 0.6 * cos(f${i});
        disp.z += d${i}.y * a${i} * 0.6 * cos(f${i});
        disp.y += a${i} * sin(f${i});
        // GPU Gems Gerstner normal terms.
        nrm.x -= d${i}.x * k${i} * a${i} * cos(f${i});
        nrm.z -= d${i}.y * k${i} * a${i} * cos(f${i});
        nrm.y -= 0.6 * k${i} * a${i} * sin(f${i});
      }`,
    ).join('\n');
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        uniform float uTime, uWave; uniform vec2 uCenter;
        varying vec3 vW; varying vec3 vN; varying float vCalm;
        void main() {
          vec3 wp = vec3(position.x + uCenter.x, ${SEA_LEVEL.toFixed(2)}, position.z + uCenter.y);
          float dist = length(position.xz);
          float calm = 1.0 - smoothstep(120.0, 900.0, dist);
          vec3 disp = vec3(0.0);
          vec3 nrm = vec3(0.0, 1.0, 0.0);
          ${waveGlsl}
          wp += disp;
          vW = wp; vCalm = calm;
          vN = normalize(nrm);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMacro; uniform vec4 uWorld; uniform vec3 uSunDir, uSky, uHorizon; uniform float uTime, uDim;
        varying vec3 vW; varying vec3 vN; varying float vCalm;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
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
          // Clear turquoise shallows, teal, then deep blue; open water deepens with distance too.
          vec3 shallow = vec3(0.09, 0.56, 0.56), mid = vec3(0.025, 0.3, 0.44), deep = vec3(0.012, 0.1, 0.25);
          vec3 water = mix(shallow, mid, smoothstep(0.6, 4.0, depth));
          water = mix(water, deep, smoothstep(4.0, 28.0, depth));
          float viewDist = length(cameraPosition - vW);
          water = mix(water, deep * 1.15, smoothstep(40.0, 520.0, viewDist) * 0.55);
          vec3 N = normalize(vN + vec3(vnoise(vW.xz * 0.35 + uTime * 0.4) - 0.5, 0.0, vnoise(vW.zx * 0.3 - uTime * 0.35) - 0.5) * 0.18 * vCalm);
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 sky = mix(uHorizon * 0.85, uSky, smoothstep(0.0, 0.35, reflect(-V, N).y));
          vec3 col = mix(water, sky, fres * 0.45);
          // Sun glitter.
          vec3 H = normalize(uSunDir + V);
          col += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, H), 0.0), 220.0) * 3.0 * smoothstep(-0.05, 0.1, uSunDir.y) * (1.0 - uDim);
          col *= 1.0 - uDim * 0.35;
          // Foam: shallow water and wave crests, broken up by noise.
          float fn = vnoise(vW.xz * 0.6 + uTime * 0.25) * vnoise(vW.xz * 1.7 - uTime * 0.4);
          float shore = smoothstep(0.8, 0.1, depth) * smoothstep(0.18, 0.4, fn + 0.1);
          float crest = smoothstep(0.35, 0.5, vW.y - ${SEA_LEVEL.toFixed(2)}) * smoothstep(0.2, 0.45, fn);
          col = mix(col, vec3(0.95, 0.98, 1.0), clamp(shore * 0.65 + crest * 0.45, 0.0, 1.0));
          // Shallow water is clear enough to see the sand beneath.
          float alpha = mix(0.62, 0.97, smoothstep(0.3, 3.5, depth));
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

  /** Weather and time: wave height from wind, sky reflection colours, overcast dimming. */
  setConditions(wind: number, zenith: THREE.Color, horizon: THREE.Color, overcast: number, night: number) {
    this.uniforms.uWave.value = 0.55 + wind * 1.6;
    this.uniforms.uSky.value.copy(zenith);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uDim.value = Math.min(1, overcast * 0.7 + night * 0.6);
  }

  update(dt: number, camera: THREE.Vector3) {
    this.uniforms.uTime.value += dt;
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
