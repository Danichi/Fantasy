import * as THREE from 'three';
import { heightTexture, TERRAIN_SIZE } from './terrain';
import { Q } from '../core/settings';
import { mulberry32 } from '../core/math';
import { FLOWER_GLSL } from './flowerNoise';

// Wildflowers: small sprigs (stem + two crossed flower cards) on a tile that
// wraps around the player like the grass. They grow in drifts: a noise field
// decides where meadows bloom, and each drift favours one kind of flower.
// The terrain shader paints matching colour speckles further out, so meadows
// read as flowering all the way to the horizon.

const TILE = 36;

/** Four flowers side by side: daisy, buttercup, cornflower, poppy. */
function flowerAtlas() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S;
  const g = c.getContext('2d')!;
  const petals = (cx: number, n: number, len: number, wid: number, col: string, centre: string, cr: number) => {
    g.save();
    g.translate(cx, S / 2);
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      g.rotate((Math.PI * 2) / n);
      g.beginPath();
      g.ellipse(0, -len / 2, wid, len / 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = centre;
    g.beginPath();
    g.arc(0, 0, cr, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  petals(S * 0.5, 14, 50, 7, '#f7f4ea', '#e8b52a', 12); // daisy
  petals(S * 1.5, 5, 40, 17, '#f2c72b', '#c98a12', 10); // buttercup
  // Cornflower: ragged blue petals.
  g.save();
  g.translate(S * 2.5, S / 2);
  for (let i = 0; i < 18; i++) {
    g.rotate((Math.PI * 2) / 18);
    g.fillStyle = i % 2 ? '#3f6fd6' : '#5a86e8';
    g.beginPath();
    g.moveTo(-6, -6);
    g.lineTo(0, -50);
    g.lineTo(6, -6);
    g.fill();
  }
  g.fillStyle = '#2b3f8a';
  g.beginPath();
  g.arc(0, 0, 10, 0, Math.PI * 2);
  g.fill();
  g.restore();
  petals(S * 3.5, 4, 48, 26, '#d8261c', '#1c1410', 9); // poppy
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function sprigGeometry() {
  // Stem (thin vertical quad, uv x < 0 marks "stem") and two crossed heads.
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const quad = (p: number[][], u: number[][]) => {
    const b = pos.length / 3;
    p.forEach((v) => pos.push(...v));
    u.forEach((v) => uv.push(...v));
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad([[-0.006, 0, 0], [0.006, 0, 0], [0.006, 0.34, 0], [-0.006, 0.34, 0]], [[-1, 0], [-1, 0], [-1, 1], [-1, 1]]);
  const r = 0.06, y = 0.34;
  quad([[-r, y - r * 0.2, -r * 0.3], [r, y - r * 0.2, -r * 0.3], [r, y + r * 0.3, r * 0.6], [-r, y + r * 0.3, r * 0.6]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  quad([[-r * 0.3, y - r * 0.2, -r], [r * 0.6, y + r * 0.3, -r], [r * 0.6, y + r * 0.3, r], [-r * 0.3, y - r * 0.2, r]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  g.setIndex(idx);
  return g;
}

export class Flowers {
  readonly mesh: THREE.InstancedMesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene, splat: THREE.Texture) {
    const count = Math.round(Q.grassCount * 0.35);
    const geo = sprigGeometry();
    const offs = new Float32Array(count * 4);
    const rnd = mulberry32(777);
    for (let i = 0; i < count; i++) {
      offs[i * 4] = rnd() * TILE;
      offs[i * 4 + 1] = rnd() * TILE;
      offs[i * 4 + 2] = rnd() * Math.PI * 2;
      offs[i * 4 + 3] = rnd();
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 4));
    this.uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uHeight: { value: heightTexture() },
      uMask: { value: splat },
      uSize: { value: TERRAIN_SIZE },
      uTile: { value: TILE },
      uAtlas: { value: flowerAtlas() },
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, alphaTest: 0.5 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOff;
          uniform vec2 uCenter; uniform float uTime, uSize, uTile;
          uniform sampler2D uHeight, uMask;
          varying vec2 vFUv; varying float vKind; varying float vStem;
          ${FLOWER_GLSL}`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 world = uCenter + mod(aOff.xy - uCenter + uTile * 0.5, uTile) - uTile * 0.5;
          vec2 uvT = world / uSize + 0.5;
          float h = texture2D(uHeight, uvT).r;
          vec4 spl = texture2D(uMask, uvT);
          float grassy = clamp(spl.b - 0.3 * spl.g - spl.r, 0.0, 1.0);
          float dens = flowerDensity(world) * grassy;
          float edge = 1.0 - smoothstep(uTile * 0.34, uTile * 0.5, length(world - uCenter));
          float keep = step(aOff.w, dens) * edge;
          vec3 p = position * (0.75 + aOff.w * 0.6) * keep;
          float c = cos(aOff.z), s = sin(aOff.z);
          p.xz = mat2(c, -s, s, c) * p.xz;
          float sway = sin(uTime * 1.7 + world.x * 0.3 + world.y * 0.2) * 0.04 * p.y / 0.34;
          p.x += sway;
          vKind = flowerKind(world);
          vStem = uv.x < 0.0 ? 1.0 : 0.0;
          vFUv = uv;
          vec3 transformed = vec3(world.x + p.x, h + p.y, world.y + p.z);`,
        )
        .replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;`)
        .replace('#include <worldpos_vertex>', `vec4 worldPosition = vec4(transformed, 1.0);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform sampler2D uAtlas;\nvarying vec2 vFUv; varying float vKind; varying float vStem;`)
        .replace(
          '#include <map_fragment>',
          `if (vStem > 0.5) {
            diffuseColor.rgb = vec3(0.16, 0.3, 0.08);
          } else {
            vec4 f = texture2D(uAtlas, vec2((vKind + vFUv.x) / 4.0, vFUv.y));
            diffuseColor *= f;
          }`,
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    const id = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, id);
    scene.add(this.mesh);
  }

  update(dt: number, center: THREE.Vector3) {
    this.uniforms.uTime.value += dt;
    (this.uniforms.uCenter.value as THREE.Vector2).set(center.x, center.z);
  }
}
