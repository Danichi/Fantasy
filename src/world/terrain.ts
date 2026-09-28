import * as THREE from 'three';
import { fbm, smoothstep, clamp } from '../core/math';
import { physics } from '../physics/physics';

// ---------------------------------------------------------------------------
// Layout of the Training Grounds (metres, +z = south, spawn faces north)
//   plaza   : cobblestone disc at PLAZA_CENTER, radius PLAZA_R
//   field   : packed dirt ring around the plaza plus roads to the gate/houses
//   town    : timber houses along the north edge
//   palisade: ring at PALISADE_R with a gate to the south
// ---------------------------------------------------------------------------
export const PLAZA_CENTER = new THREE.Vector2(0, -4);
export const PLAZA_R = 12;
export const PALISADE_R = 58;
export const TERRAIN_SIZE = 320;

function roadDist(x: number, z: number) {
  // South road to the gate, gently wandering.
  const southX = Math.sin(z * 0.05) * 3;
  const dSouth = z > -4 ? Math.abs(x - southX) : 1e9;
  // North road to the houses.
  const dNorth = z < -4 && z > -40 ? Math.abs(x + Math.sin(z * 0.08) * 1.5) : 1e9;
  // Street in front of the houses.
  const dStreet = Math.abs(z + 30) + Math.max(0, Math.abs(x) - 34);
  return Math.min(dSouth, dNorth, dStreet);
}

export function heightAt(x: number, z: number) {
  const dx = x - PLAZA_CENTER.x, dz = z - PLAZA_CENTER.y;
  const r = Math.sqrt(dx * dx + dz * dz);
  const flatten = smoothstep(15, 38, r);
  let h = (fbm(x / 38 + 3.1, z / 38 - 7.7, 4) - 0.5) * 3.2 * flatten;
  // Keep roads and the house street level.
  const road = smoothstep(7, 2, roadDist(x, z));
  h *= 1 - road * 0.7;
  // Hills rise outside the palisade to frame the scene.
  const hill = smoothstep(PALISADE_R + 6, 150, r);
  h += Math.pow(hill, 1.4) * 34 * (0.55 + 0.9 * fbm(x / 55, z / 55, 3));
  return h;
}

/** Surface weights [stone, dirt, grass], summing to 1. */
export function splatAt(x: number, z: number): [number, number, number] {
  const dx = x - PLAZA_CENTER.x, dz = z - PLAZA_CENTER.y;
  const r = Math.sqrt(dx * dx + dz * dz);
  const n = fbm(x * 0.11, z * 0.11, 3);
  const stone = smoothstep(PLAZA_R + 0.6, PLAZA_R - 0.6, r + (n - 0.5) * 2.2);
  const rd = roadDist(x, z);
  const fieldEdge = 22 + (fbm(x * 0.05 + 9, z * 0.05, 3) - 0.5) * 12;
  let dirt = Math.max(
    smoothstep(fieldEdge + 3, fieldEdge - 3, r),
    smoothstep(3.4, 1.6, rd + (n - 0.5) * 2.5),
  );
  // Worn dirt patches scattered in the grass.
  dirt = Math.max(dirt, smoothstep(0.66, 0.74, fbm(x * 0.045 - 3, z * 0.045 + 5, 3)) * 0.85);
  dirt = clamp(dirt * (1 - stone), 0, 1);
  const grass = clamp(1 - stone - dirt, 0, 1);
  return [stone, dirt, grass];
}

export type Surface = 'stone' | 'dirt' | 'grass';
export function surfaceAt(x: number, z: number): Surface {
  const [s, d, g] = splatAt(x, z);
  return s >= d && s >= g ? 'stone' : d >= g ? 'dirt' : 'grass';
}

function loadTex(loader: THREE.TextureLoader, url: string, srgb: boolean, aniso: number) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSplatTexture() {
  const N = 512;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * TERRAIN_SIZE;
      const z = ((j + 0.5) / N - 0.5) * TERRAIN_SIZE;
      const [s, d, g] = splatAt(x, z);
      const k = (j * N + i) * 4;
      data[k] = s * 255;
      data[k + 1] = d * 255;
      data[k + 2] = g * 255;
      data[k + 3] = fbm(x * 0.02 + 40, z * 0.02 - 11, 3) * 255; // macro variation
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function buildTerrain(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const SEG = 170;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const L = new THREE.TextureLoader();
  const base = '/assets/textures/';
  const set = (id: string) => ({
    diff: loadTex(L, `${base}${id}_diff_1k.jpg`, true, aniso),
    nor: loadTex(L, `${base}${id}_nor_gl_1k.jpg`, false, aniso),
    arm: loadTex(L, `${base}${id}_arm_1k.jpg`, false, aniso),
  });
  const stone = set('cobblestone_floor_08');
  const dirt = set('brown_mud_leaves_01');
  const grass = set('aerial_grass_rock');

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uniforms = {
    tSplat: { value: buildSplatTexture() },
    uSize: { value: TERRAIN_SIZE },
    dS: { value: stone.diff }, nS: { value: stone.nor }, aS: { value: stone.arm },
    dD: { value: dirt.diff }, nD: { value: dirt.nor }, aD: { value: dirt.arm },
    dG: { value: grass.diff }, nG: { value: grass.nor }, aG: { value: grass.arm },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D tSplat, dS, nS, aS, dD, nD, aD, dG, nG, aG;
        uniform float uSize;
        vec3 tW; // blended surface weights, shared by later chunks
        float tFar;
        vec2 uvS, uvD, uvG;
        vec3 heightBlend(vec3 w, vec3 h) {
          vec3 x = w + h * 0.55;
          float m = max(max(x.r, x.g), x.b) - 0.28;
          vec3 b = max(x - m, 0.0);
          return b / max(b.r + b.g + b.b, 1e-4);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 sp = texture2D(tSplat, vWPos.xz / uSize + 0.5);
        uvS = vWPos.xz / 2.6; uvD = vWPos.xz / 3.4; uvG = vWPos.xz / 4.2;
        float far = smoothstep(18.0, 80.0, length(vWPos - cameraPosition));
        tFar = far;
        // Raw splat decides which layers are present; only those get sampled.
        // Far away, a much larger UV scale keeps the hills from tiling.
        // Big regions are a single layer, so most pixels take one path.
        vec3 cS = vec3(0.0), cD = vec3(0.0), cG = vec3(0.0);
        vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vWPos.xz;
        float mv = smoothstep(0.3, 0.7, sp.a);
        if (sp.r > 0.004) cS = texture2D(dS, uvS).rgb * 0.62;
        if (sp.g > 0.004) cD = texture2D(dD, far > 0.5 ? uv2 / 3.4 * 0.1 : uvD).rgb * vec3(0.95, 0.9, 0.85);
        if (sp.b > 0.004) cG = texture2D(dG, far > 0.5 ? uv2 / 4.2 * 0.09 : uvG).rgb * vec3(0.78, 0.98, 0.62);
        vec3 hts = vec3(dot(cS, vec3(0.5)), dot(cD, vec3(0.4)), dot(cG, vec3(0.5)));
        tW = heightBlend(sp.rgb, hts);
        vec3 col = cS * tW.r + cD * tW.g + cG * tW.b;
        // Large-scale tint variation so the field isn't uniform.
        col *= mix(vec3(0.9, 0.93, 0.86), vec3(1.07, 1.03, 0.98), mix(sp.a, mv, 0.5));
        diffuseColor.rgb *= col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        if (far < 0.99) {
          vec3 arm = vec3(0.0);
          if (tW.r > 0.01) arm += texture2D(aS, uvS).rgb * tW.r;
          if (tW.g > 0.01) arm += texture2D(aD, uvD).rgb * tW.g;
          if (tW.b > 0.01) arm += texture2D(aG, uvG).rgb * tW.b;
          arm = mix(arm, vec3(1.0, 0.9, 0.0), far);
          roughnessFactor *= mix(0.75, 1.0, arm.g);
          diffuseColor.rgb *= mix(1.0, arm.r, 0.8);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `if (tFar < 0.95) {
          vec3 nm = vec3(0.0);
          if (tW.r > 0.01) nm += (texture2D(nS, uvS).xyz * 2.0 - 1.0) * tW.r;
          if (tW.g > 0.01) nm += (texture2D(nD, uvD).xyz * 2.0 - 1.0) * tW.g;
          if (tW.b > 0.01) nm += (texture2D(nG, uvG).xyz * 2.0 - 1.0) * tW.b;
          nm.xy *= 1.1 * (1.0 - tFar);
          nm.z = max(nm.z, 0.2);
          vec3 Nv = normal;
          vec3 Tv = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
          Tv = normalize(Tv - Nv * dot(Nv, Tv));
          vec3 Bv = normalize(cross(Nv, Tv));
          normal = normalize(Tv * nm.x - Bv * nm.y + Nv * nm.z);
        }`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  // Collision: a 1m trimesh over the playable area (inside the hills).
  const C = 150, HALF = 75;
  const verts = new Float32Array((C + 1) * (C + 1) * 3);
  let k = 0;
  for (let j = 0; j <= C; j++) {
    for (let i = 0; i <= C; i++) {
      const x = -HALF + (i / C) * HALF * 2, z = -HALF + (j / C) * HALF * 2;
      verts[k++] = x; verts[k++] = heightAt(x, z); verts[k++] = z;
    }
  }
  const idx = new Uint32Array(C * C * 6);
  k = 0;
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < C; i++) {
      const a = j * (C + 1) + i, b = a + 1, c = a + C + 1, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  physics.addTrimesh(verts, idx);
  return mesh;
}
