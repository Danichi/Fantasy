import * as THREE from 'three';
import type { GroundWindow } from './groundWindow';
import { Q } from '../core/settings';
import { mulberry32 } from '../core/math';
import { worldNoise } from '../render/noise';

// Meadow grass (docs/ART-DIRECTION.md §5): dense, knee-high single blades that
// fade from a dark root to sunlit tips, with gusts rolling across the field as
// bright bands. Blades live in a tile that wraps around the camera; heights,
// density and colour come from textures, so there's no CPU work per frame.
//
// Two layers share the shader: a dense near field of thin blades and a sparse
// far field of wider blades that carries the texture out to the haze.

const NEAR_TILE = 44;
const FAR_TILE = 150;

/** A single tapered, curved blade: 3 segments + tip, height 1, width 1. */
function bladeGeometry() {
  const rows = [0, 0.3, 0.6, 0.85];
  const pos: number[] = [];
  const t: number[] = [];
  for (const y of rows) {
    const w = 0.5 * (1 - y * 0.82);
    const lean = y * y * 0.35; // natural forward curve
    pos.push(-w, y, lean, w, y, lean);
    t.push(y, y);
  }
  pos.push(0, 1, 0.42);
  t.push(1);
  const idx: number[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (rows.length - 1) * 2;
  idx.push(last, last + 1, last + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  // Normals lean up so a field lights evenly, like one soft surface.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 0.9, 0.44]).flat(), 3));
  g.setIndex(idx);
  return g;
}

const shared = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
  uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
  uNoise: { value: null as THREE.Texture | null },
  uGround: { value: null as THREE.Texture | null },
  uGroundOrigin: { value: new THREE.Vector2() },
  uGroundSize: { value: 256 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
};
/** Shared with anything else that should sway in the same wind (flowers, trees). */
export const WIND = shared;

class GrassLayer {
  readonly mesh: THREE.InstancedMesh;
  private center = { value: new THREE.Vector2() };

  constructor(scene: THREE.Scene, count: number, tile: number, width: number, fadeIn: number, seed: number) {
    const geo = bladeGeometry();
    const offs = new Float32Array(count * 4);
    const rnd = mulberry32(seed);
    // Jittered grid keeps coverage even (no clumps of empty ground).
    const side = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const gx = i % side, gy = Math.floor(i / side);
      offs[i * 4] = ((gx + rnd()) / side) * tile;
      offs[i * 4 + 1] = ((gy + rnd()) / side) * tile;
      offs[i * 4 + 2] = rnd() * Math.PI * 2;
      offs[i * 4 + 3] = rnd();
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 4));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    const uniforms = { ...shared, uCenter: this.center, uTile: { value: tile }, uWidth: { value: width }, uFadeIn: { value: fadeIn } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOff; attribute float aT;
          uniform vec2 uCenter, uWindDir, uGroundOrigin; uniform float uTime, uGroundSize, uTile, uWidth, uFadeIn; uniform vec3 uPlayer;
          uniform sampler2D uGround, uNoise;
          varying float vT; varying vec3 vCol; varying float vGust;`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 world = uCenter + mod(aOff.xy - uCenter + uTile * 0.5, uTile) - uTile * 0.5;
          vec2 guv = (world - uGroundOrigin) / uGroundSize;
          vec4 gd = texture2D(uGround, guv);
          float inWin = step(0.002, guv.x) * step(guv.x, 0.998) * step(0.002, guv.y) * step(guv.y, 0.998);
          float h = gd.r;
          float dens = gd.g * inWin;
          float tintK = gd.a;
          float dist = length(world - uCenter);
          // Fade blades in/out at the layer's inner and outer radius.
          float outer = 1.0 - smoothstep(uTile * 0.38, uTile * 0.5, dist);
          float inner = uFadeIn > 0.0 ? smoothstep(uFadeIn, uFadeIn * 1.4, dist) : 1.0;
          vec4 patchN = texture2D(uNoise, world * 0.004);
          float keep = step(aOff.w, dens) * outer * inner;
          // Height: knee-high, taller in patches, shorter where it's thin.
          // Blades shorten toward path and plaza edges instead of stopping as a wall.
          float height = mix(1.0, 0.6, smoothstep(0.2, 0.4, tintK) * (1.0 - smoothstep(0.5, 0.6, tintK))) * mix(1.0, 1.35, smoothstep(0.55, 0.7, tintK) * (1.0 - smoothstep(0.8, 0.95, tintK))) * mix(0.34, 0.74, patchN.g) * mix(0.75, 1.15, fract(aOff.w * 13.7)) * mix(0.25, 1.0, smoothstep(0.1, 0.75, dens)) * keep;
          float width = uWidth * mix(0.8, 1.25, fract(aOff.w * 5.3)) * keep;
          // Gusts: a scrolling low-frequency field along the wind.
          vec2 gp = world * 0.018 - uWindDir * uTime * 0.09;
          float gust = texture2D(uNoise, gp).r;
          gust = smoothstep(0.42, 0.78, gust);
          float flutter = sin(uTime * 5.3 + aOff.w * 40.0 + world.x * 0.8) * 0.5 + 0.5;
          float t = aT;
          vec3 p = position;
          p.x *= width;
          p.z *= height * 0.55;
          p.y *= height;
          float c = cos(aOff.z), s = sin(aOff.z);
          p.xz = mat2(c, -s, s, c) * p.xz;
          vec2 bend = uWindDir * (0.12 + gust * 0.55 + flutter * 0.06);
          // Push aside around the player.
          vec2 away = world - uPlayer.xz;
          float pd = length(away);
          bend += normalize(away + 1e-4) * smoothstep(1.1, 0.25, pd) * 0.9 * step(abs(uPlayer.y - h), 1.5);
          p.xz += bend * t * t * height;
          p.y -= length(bend) * t * t * height * 0.35;
          vT = t; vGust = gust;
          // Colour: root to body to tip, with dry and lush patches across the field.
          vec3 root = vec3(0.105, 0.2, 0.075);
          vec3 body = mix(vec3(0.19, 0.35, 0.1), vec3(0.28, 0.41, 0.12), patchN.r);
          vec3 tipC = mix(vec3(0.5, 0.6, 0.2), vec3(0.66, 0.6, 0.28), smoothstep(0.55, 0.85, patchN.g));
          // Biome tint: alpine blue-green, jungle deep green, dry straw.
          float alp = smoothstep(0.2, 0.4, tintK) * (1.0 - smoothstep(0.5, 0.6, tintK));
          float jung = smoothstep(0.55, 0.7, tintK) * (1.0 - smoothstep(0.8, 0.95, tintK));
          float dry = smoothstep(0.85, 1.0, tintK);
          body = mix(body, vec3(0.16, 0.3, 0.16), alp); tipC = mix(tipC, vec3(0.42, 0.56, 0.36), alp);
          body = mix(body, vec3(0.06, 0.24, 0.08), jung); tipC = mix(tipC, vec3(0.2, 0.46, 0.12), jung);
          body = mix(body, vec3(0.42, 0.36, 0.14), dry); tipC = mix(tipC, vec3(0.78, 0.66, 0.34), dry);
          vCol = t < 0.5 ? mix(root, body, t * 2.0) : mix(body, tipC, (t - 0.5) * 2.0);
          vCol *= mix(0.9, 1.08, fract(aOff.w * 3.1));
          vec3 transformed = vec3(world.x + p.x, h + p.y - 0.02, world.y + p.z);`,
        )
        .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normal;\n{ float c0 = cos(aOff.z), s0 = sin(aOff.z); objectNormal.xz = mat2(c0, -s0, s0, c0) * objectNormal.xz; }`)
        .replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;`)
        .replace('#include <worldpos_vertex>', `vec4 worldPosition = vec4(transformed, 1.0);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vT; varying vec3 vCol; varying float vGust;\nuniform vec3 uSunDir;`)
        .replace(
          '#include <color_fragment>',
          `// Gusts flash the tips brighter, like wind combing a real field.
          diffuseColor.rgb = vCol * (1.0 + vGust * vT * 0.35);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // Sunlight through the blade tips when looking toward the sun.
          vec3 viewW = normalize(cameraPosition - vWorldPosGrass);
          float back = pow(saturate(dot(-viewW, uSunDir)), 3.0);
          totalEmissiveRadiance += vCol * back * vT * vT * 0.55;`,
        )
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPosGrass;`);
      sh.vertexShader = sh.vertexShader
        .replace('varying float vT; varying vec3 vCol; varying float vGust;', 'varying float vT; varying vec3 vCol; varying float vGust; varying vec3 vWorldPosGrass;')
        .replace('vec4 worldPosition = vec4(transformed, 1.0);', 'vec4 worldPosition = vec4(transformed, 1.0);\nvWorldPosGrass = transformed;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    const id = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, id);
    scene.add(this.mesh);
  }

  update(center: THREE.Vector3) {
    this.center.value.set(center.x, center.z);
  }
}

export class Grass {
  readonly mesh = new THREE.Group();
  private near: GrassLayer;
  private far: GrassLayer;

  /** `ground` supplies height, density and tint around the camera. */
  constructor(scene: THREE.Scene, ground: GroundWindow) {
    shared.uNoise.value = worldNoise();
    shared.uGround.value = ground.texture;
    shared.uGroundOrigin = ground.origin;
    shared.uGroundSize = ground.size;
    scene.add(this.mesh);
    this.near = new GrassLayer(this.mesh as unknown as THREE.Scene, Q.grassBlades, NEAR_TILE, 0.055, 0, 1234);
    this.far = new GrassLayer(this.mesh as unknown as THREE.Scene, Math.round(Q.grassBlades * 0.3), FAR_TILE, 0.16, NEAR_TILE * 0.36, 987);
  }

  setSunDir(dir: THREE.Vector3) {
    shared.uSunDir.value.copy(dir);
  }

  update(dt: number, center: THREE.Vector3, player: THREE.Vector3) {
    shared.uTime.value += dt;
    shared.uPlayer.value.copy(player);
    this.near.update(center);
    this.far.update(center);
  }
}
