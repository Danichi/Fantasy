import * as THREE from 'three';
import { heightAt, splatAt, TERRAIN_SIZE } from './terrain';
import { Q } from '../core/settings';
import { mulberry32 } from '../core/math';

// Instanced grass on a tile that wraps around the player. Blade heights come
// from a heightmap texture and density from the grass splat weight, so the
// field follows the terrain without any CPU work per frame.

const TILE = 30; // metres covered around the player
const MAP = 512;

function dataTextures() {
  const h = new Uint16Array(MAP * MAP);
  const m = new Uint8Array(MAP * MAP * 4);
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      const x = ((i + 0.5) / MAP - 0.5) * TERRAIN_SIZE;
      const z = ((j + 0.5) / MAP - 0.5) * TERRAIN_SIZE;
      h[j * MAP + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
      const [, dirt, grass] = splatAt(x, z);
      m[(j * MAP + i) * 4] = Math.min(255, Math.max(0, grass - 0.15 * dirt) * 255);
      m[(j * MAP + i) * 4 + 3] = 255;
    }
  }
  const ht = new THREE.DataTexture(h, MAP, MAP, THREE.RedFormat, THREE.HalfFloatType);
  ht.magFilter = ht.minFilter = THREE.LinearFilter;
  ht.needsUpdate = true;
  const mt = new THREE.DataTexture(m, MAP, MAP, THREE.RGBAFormat);
  mt.magFilter = mt.minFilter = THREE.LinearFilter;
  mt.needsUpdate = true;
  return { ht, mt };
}

function bladeGeometry() {
  // A tuft: three curved, tapering blades fanned around the centre.
  const W = 0.024, H = 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const blades: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [0.06, 0.03, 2.1, 0.8],
    [-0.05, -0.04, 4.2, 0.9],
  ];
  for (const [ox, oz, rot, hs] of blades) {
    const base = pos.length / 3;
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [
      [-W, 0, 0], [W, 0, 0],
      [-W * 0.8, H * 0.35 * hs, 0.02], [W * 0.8, H * 0.35 * hs, 0.02],
      [-W * 0.5, H * 0.7 * hs, 0.06], [W * 0.5, H * 0.7 * hs, 0.06],
      [0, H * hs, 0.13],
    ];
    for (const [x, y, z] of pts) pos.push(ox + x * c + z * s, y, oz - x * s + z * c);
    idx.push(...[0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6].map((i) => base + i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  g.setIndex(idx);
  return g;
}

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene) {
    const count = Q.grassCount;
    const geo = bladeGeometry();
    const offs = new Float32Array(count * 4);
    const rnd = mulberry32(1234);
    for (let i = 0; i < count; i++) {
      offs[i * 4] = rnd() * TILE;
      offs[i * 4 + 1] = rnd() * TILE;
      offs[i * 4 + 2] = rnd() * Math.PI * 2; // rotation
      offs[i * 4 + 3] = rnd(); // variation seed
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 4));
    const { ht, mt } = dataTextures();
    this.uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uHeight: { value: ht },
      uMask: { value: mt },
      uSize: { value: TERRAIN_SIZE },
      uTile: { value: TILE },
      uPlayer: { value: new THREE.Vector3() },
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOff;
          uniform vec2 uCenter; uniform float uTime, uSize, uTile; uniform vec3 uPlayer;
          uniform sampler2D uHeight, uMask;
          varying float vTip; varying float vVar;`,
        )
        .replace(
          '#include <begin_vertex>',
          `// Wrap this blade's slot into the tile centred on the player.
          vec2 world = uCenter + mod(aOff.xy - uCenter + uTile * 0.5, uTile) - uTile * 0.5;
          vec2 uvT = world / uSize + 0.5;
          float h = texture2D(uHeight, uvT).r;
          float dens = texture2D(uMask, uvT).r;
          // Thin out toward the tile edge and where there's no grass.
          float edge = 1.0 - smoothstep(uTile * 0.36, uTile * 0.5, length(world - uCenter));
          float keep = step(aOff.w, dens * 1.1) * edge;
          float scale = (0.2 + aOff.w * 0.3) * keep * (0.55 + dens * 0.5);
          vec3 p = position;
          p.y *= scale;
          p.xz *= mix(0.8, 1.2, fract(aOff.w * 7.3));
          float c = cos(aOff.z), s = sin(aOff.z);
          p.xz = mat2(c, -s, s, c) * p.xz;
          float tip = clamp(position.y, 0.0, 1.0);
          // Wind: slow gusts plus flutter, stronger at the tip.
          float gust = sin(world.x * 0.12 + uTime * 1.3) * 0.5 + sin(world.y * 0.17 + uTime * 0.9) * 0.5;
          float flutter = sin(uTime * 4.0 + aOff.w * 20.0) * 0.25;
          vec2 bend = vec2(0.55, 0.35) * (gust * 0.6 + flutter) * 0.12;
          // Push away from the player.
          vec2 away = world - uPlayer.xz;
          float d = length(away);
          bend += normalize(away + 1e-4) * smoothstep(0.9, 0.2, d) * 0.35 * step(abs(uPlayer.y - h), 1.5);
          p.xz += bend * tip * tip * scale * 2.2;
          p.y -= dot(bend, bend) * tip * scale * 2.0;
          vTip = tip; vVar = aOff.w;
          vec3 transformed = vec3(world.x + p.x, h + p.y, world.y + p.z);`,
        )
        .replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;`)
        .replace('#include <worldpos_vertex>', `vec4 worldPosition = vec4(transformed, 1.0);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vTip; varying float vVar;`)
        .replace(
          '#include <color_fragment>',
          `vec3 base = vec3(0.09, 0.13, 0.035);
          vec3 tipCol = mix(vec3(0.3, 0.38, 0.11), vec3(0.42, 0.42, 0.17), vVar);
          diffuseColor.rgb = mix(base, tipCol, smoothstep(0.0, 1.0, vTip));`,
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    // Identity instance matrices; placement happens in the shader.
    const id = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, id);
    scene.add(this.mesh);
  }

  update(dt: number, center: THREE.Vector3, player: THREE.Vector3) {
    this.uniforms.uTime.value += dt;
    (this.uniforms.uCenter.value as THREE.Vector2).set(center.x, center.z);
    (this.uniforms.uPlayer.value as THREE.Vector3).copy(player);
  }
}
