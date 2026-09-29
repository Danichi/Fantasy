import * as THREE from 'three';
import type { WeatherParams } from './weather';

// Rain streaks and snowflakes in a box that follows the camera. Everything is
// animated in the vertex shader (drops wrap vertically), so intensity just
// changes how many instances draw. Two draw calls at most.

const RAIN_MAX = 6000;
const SNOW_MAX = 5000;
const BOX = 44; // metres across
const HEIGHT = 26;

export class Precipitation {
  private rain: THREE.InstancedMesh;
  private snow: THREE.Points;
  private uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector2(0.6, 0.3) },
    uBox: { value: BOX },
    uHeight: { value: HEIGHT },
    uAlpha: { value: 0 },
  };
  private snowUniforms = { ...this.uniforms, uAlpha: { value: 0 } };

  constructor(scene: THREE.Scene) {
    // Rain: thin vertical quads, stretched along the fall direction.
    const quad = new THREE.PlaneGeometry(0.024, 1.0);
    const seeds = new Float32Array(RAIN_MAX * 3);
    for (let i = 0; i < RAIN_MAX; i++) {
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    const rainMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uBox, uHeight; uniform vec3 uCam; uniform vec2 uWind;
        varying float vA;
        void main() {
          float speed = 16.0 + aSeed.z * 6.0;
          float y = mod(aSeed.y * uHeight - uTime * speed, uHeight) - uHeight * 0.35;
          vec2 drift = uWind * (uHeight * 0.35 - y) * 0.25;
          vec3 base = vec3(
            uCam.x + mod(aSeed.x * uBox - uCam.x + drift.x, uBox) - uBox * 0.5,
            uCam.y + y,
            uCam.z + mod(aSeed.z * uBox * 7.13 - uCam.z + drift.y, uBox) - uBox * 0.5);
          // Face the camera around the fall axis; lean with the wind.
          vec3 toCam = normalize(vec3(uCam.x - base.x, 0.0, uCam.z - base.z) + 1e-4);
          vec3 side = vec3(toCam.z, 0.0, -toCam.x);
          vec3 up = normalize(vec3(uWind.x * 0.25, 1.0, uWind.y * 0.25));
          vec3 p = base + side * position.x + up * position.y;
          float d = length(base - uCam);
          vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d)) * smoothstep(0.8, 3.0, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vA;
        void main() { gl_FragColor = vec4(0.8, 0.86, 0.94, 0.42 * vA * uAlpha); }`,
    });
    this.rain = new THREE.InstancedMesh(quad, rainMat, RAIN_MAX);
    this.rain.frustumCulled = false;
    this.rain.count = 0;
    this.rain.renderOrder = 5;
    scene.add(this.rain);

    // Snow: soft round flakes that drift and swirl.
    const pos = new Float32Array(SNOW_MAX * 3);
    for (let i = 0; i < SNOW_MAX; i++) {
      pos[i * 3] = Math.random();
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const snowMat = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime, uBox, uHeight; uniform vec3 uCam; uniform vec2 uWind;
        varying float vA;
        void main() {
          vec3 s = position;
          float speed = 1.2 + s.z * 1.1;
          float y = mod(s.y * uHeight - uTime * speed, uHeight) - uHeight * 0.35;
          float swirl = uTime * (0.6 + s.x) + s.z * 20.0;
          vec3 base = vec3(
            uCam.x + mod(s.x * uBox + uWind.x * uTime * 3.0 + sin(swirl) * 0.8 - uCam.x, uBox) - uBox * 0.5,
            uCam.y + y,
            uCam.z + mod(s.z * uBox * 3.7 + uWind.y * uTime * 3.0 + cos(swirl) * 0.8 - uCam.z, uBox) - uBox * 0.5);
          vec4 mv = viewMatrix * vec4(base, 1.0);
          float d = length(base - uCam);
          vA = 1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d);
          gl_PointSize = (3.0 + s.x * 3.0) * (30.0 / max(-mv.z, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.15, r) * 0.9 * vA * uAlpha);
        }`,
    });
    this.snow = new THREE.Points(g, snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 5;
    scene.add(this.snow);
  }

  update(dt: number, camera: THREE.Vector3, w: WeatherParams) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCam.value.copy(camera);
    this.uniforms.uWind.value.set(0.6, 0.3).multiplyScalar(0.3 + w.wind * 1.4);
    this.uniforms.uAlpha.value = Math.min(1, w.rain * 1.4);
    this.snowUniforms.uAlpha.value = Math.min(1, w.snow * 1.4);
    this.rain.count = Math.round(RAIN_MAX * w.rain);
    this.rain.visible = this.rain.count > 0;
    this.snow.geometry.setDrawRange(0, Math.round(SNOW_MAX * w.snow));
    this.snow.visible = w.snow > 0.01;
  }

  setVisible(v: boolean) {
    this.rain.visible = v && this.rain.count > 0;
    this.snow.visible = v;
  }

  dispose() {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as THREE.Material).dispose();
  }
}
