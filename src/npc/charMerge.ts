import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'meshoptimizer';

// One draw per character.
//
// A built character is 6-9 skinned parts (outfit pieces, body, eyes, brows,
// hair), each its own draw call in the main pass and again in the shadow pass:
// a street of townsfolk cost hundreds of draws. The parts all share one
// skeleton and bind pose, and their materials differ only by base-colour
// texture and tint, so they merge into a single skinned mesh:
//   - every character texture lives in one shared texture array; each vertex
//     carries its layer (arrays keep repeat-wrapping UVs and clean mips, which
//     a packed atlas would not);
//   - tints (skin tone, hair colour) are baked into vertex colours;
//   - a per-vertex dye flag keeps the cloth recolour off skin, hair and eyes.
// Beyond LOD_NEAR the character draws a simplified index (meshoptimizer) over
// the same vertices, so skinning is untouched and only the triangle count drops.

const SIZE = 1024;
/** metres from the camera where the simplified mesh takes over */
const LOD_NEAR = 11;
const LOD_RATIO = 0.3;

/** The cloth dye (see recolor in charBuilder): HSV helpers, then the per-fragment block. */
export const DYE_FNS = /* glsl */ `
uniform vec3 uHueTarget; uniform vec3 uLinen; uniform float uLinenAmt;
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`;

/** `DYE` scales the effect (1 for a whole dyed material, the vertex flag when merged). */
export const dyeBlock = (DYE: string) => /* glsl */ `
{
  vec3 hsv = rgb2hsv(diffuseColor.rgb);
  // Saturated, non-brown cloth takes the signature hue.
  float isCloth = smoothstep(0.22, 0.4, hsv.y) * (1.0 - smoothstep(0.02, 0.12, abs(hsv.x - 0.08)) * step(hsv.x, 0.16)) * ${DYE};
  if (uHueTarget.z > 0.5) {
    vec3 dyed = hsv2rgb(vec3(uHueTarget.x, mix(hsv.y, uHueTarget.y, 0.45) * 0.9, hsv.z * 0.95));
    diffuseColor.rgb = mix(diffuseColor.rgb, dyed, isCloth);
  }
  // Pale linen (bright, low saturation) is dyed.
  float isLinen = smoothstep(0.55, 0.75, hsv.z) * (1.0 - smoothstep(0.12, 0.3, hsv.y)) * ${DYE};
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uLinen * 1.15, isLinen * uLinenAmt);
}`;

export function dyeUniforms(hue: THREE.Color | null, linen: THREE.Color | null) {
  const hueTarget = new THREE.Vector3();
  if (hue) {
    const hsl = { h: 0, s: 0, l: 0 };
    hue.getHSL(hsl);
    hueTarget.set(hsl.h, hsl.s, 1);
  }
  return {
    uHueTarget: { value: hueTarget },
    uLinen: { value: linen ?? new THREE.Color(1, 1, 1) },
    uLinenAmt: { value: linen ? 0.65 : 0 },
  };
}

// ---- the shared texture array ------------------------------------------------------

interface Atlas {
  tex: THREE.DataArrayTexture;
  layer: Map<string, number>;
}
let atlas: Promise<Atlas> | null = null;

const texKey = (t: THREE.Texture) => t.name || t.uuid;

/** Every base-colour texture in the character files, one layer each (layer 0 is white). */
export function characterAtlas(files: string[], load: (f: string) => Promise<GLTF>) {
  atlas ??= (async () => {
    const [gltfs] = await Promise.all([Promise.all(files.map(load)), MeshoptSimplifier.ready]);
    const found = new Map<string, THREE.Texture>();
    for (const g of gltfs) {
      g.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (mat.map?.image) found.set(texKey(mat.map), mat.map);
      });
    }
    const list = [...found.values()];
    const depth = list.length + 1;
    const data = new Uint8Array(SIZE * SIZE * 4 * depth);
    data.fill(255, 0, SIZE * SIZE * 4);
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const layer = new Map<string, number>();
    list.forEach((t, i) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(t.image as CanvasImageSource, 0, 0, SIZE, SIZE);
      data.set(ctx.getImageData(0, 0, SIZE, SIZE).data, SIZE * SIZE * 4 * (i + 1));
      layer.set(texKey(t), i + 1);
    });
    const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, depth);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return { tex, layer };
  })();
  return atlas;
}

// ---- merging -----------------------------------------------------------------------

/** Build counters (perf probes). */
export const mergeStats = { merges: 0, geometries: 0, simplifyMs: 0 };

const geoCache = new Map<string, { hi: THREE.BufferGeometry; lo: THREE.BufferGeometry | null }>();

/**
 * Replace the skinned parts under `model` with one mesh. Parts must share
 * `anchor`'s bones and bind pose (charBuilder rebinds hair and heads onto it);
 * if anything doesn't match, the parts are left as they are.
 * `key` caches the merged geometry (everything that shapes or tints it).
 */
export function mergeParts(model: THREE.Object3D, anchor: THREE.SkinnedMesh, at: Atlas, key: string, hue: THREE.Color | null, linen: THREE.Color | null) {
  const parts: THREE.SkinnedMesh[] = [];
  model.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && parts.push(o as THREE.SkinnedMesh));
  if (parts.length < 2) return null;
  const bones = anchor.skeleton.bones;
  for (const p of parts) {
    if (Array.isArray(p.material)) return null;
    if (p.skeleton.bones.length !== bones.length || p.skeleton.bones.some((b, i) => b !== bones[i])) return null;
    if (!p.bindMatrix.equals(anchor.bindMatrix)) return null;
    const mat = p.material as THREE.MeshStandardMaterial;
    if (mat.map && !at.layer.has(texKey(mat.map))) return null;
  }
  let geo = geoCache.get(key);
  if (!geo) {
    const pieces: THREE.BufferGeometry[] = [];
    for (const p of parts) {
      const src = p.geometry;
      const mat = p.material as THREE.MeshStandardMaterial;
      const n = src.attributes.position.count;
      const g = new THREE.BufferGeometry();
      // Parts store these in different array types (8- or 16-bit bone indices,
      // normalised or float weights); mergeGeometries needs them to match.
      for (const a of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
        const at2 = src.getAttribute(a);
        if (!at2) return null;
        const size = at2.itemSize;
        const out = a === 'skinIndex' ? new Uint16Array(n * size) : new Float32Array(n * size);
        for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[i * size + c] = at2.getComponent(i, c);
        g.setAttribute(a, new THREE.BufferAttribute(out, size));
      }
      // Tint and (where the part uses them) vertex colours, baked together.
      const col = new Float32Array(n * 3);
      const vc = mat.vertexColors ? src.getAttribute('color') : null;
      for (let i = 0; i < n; i++) {
        const r = vc ? vc.getX(i) : 1, gg = vc ? vc.getY(i) : 1, b = vc ? vc.getZ(i) : 1;
        col[i * 3] = r * mat.color.r;
        col[i * 3 + 1] = gg * mat.color.g;
        col[i * 3 + 2] = b * mat.color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(n).fill(mat.map ? at.layer.get(texKey(mat.map))! : 0), 1));
      g.setAttribute('aDye', new THREE.BufferAttribute(new Float32Array(n).fill(mat.userData.dye ? 1 : 0), 1));
      g.setIndex(src.index ? src.index.clone() : [...Array(n).keys()]);
      pieces.push(g);
    }
    const merged = mergeGeometries(pieces, false);
    for (const p of pieces) p.dispose();
    if (!merged) return null;
    const t0 = performance.now();
    geo = { hi: merged, lo: simplified(merged) };
    mergeStats.simplifyMs += performance.now() - t0;
    mergeStats.geometries++;
    geoCache.set(key, geo);
  }
  mergeStats.merges++;
  const mat = characterMaterial(at, hue, linen);
  const skinned = (g: THREE.BufferGeometry, name: string) => {
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.name = name;
    mesh.bind(anchor.skeleton, anchor.bindMatrix);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  };
  const hi = skinned(geo.hi, 'character');
  if (geo.lo) {
    const lod = new THREE.LOD();
    lod.name = 'character-lod';
    lod.addLevel(hi, 0);
    lod.addLevel(skinned(geo.lo, 'character-lo'), LOD_NEAR);
    anchor.parent!.add(lod);
  } else anchor.parent!.add(hi);
  for (const p of parts) p.removeFromParent();
  return hi;
}

/** The same vertices with about LOD_RATIO of the triangles (null if that fails). */
function simplified(geo: THREE.BufferGeometry) {
  if (!MeshoptSimplifier.supported || !geo.index) return null;
  const idx = new Uint32Array(geo.index.array);
  const pos = geo.attributes.position.array as Float32Array;
  // UVs weigh in so texture seams (face, hands) hold their shape.
  const uv = geo.attributes.uv.array as Float32Array;
  const target = Math.floor((idx.length * LOD_RATIO) / 3) * 3;
  const [out] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, uv, 2, [0.5, 0.5], null, target, 0.02);
  if (out.length < 3 || out.length > idx.length * 0.8) return null;
  const lo = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) lo.setAttribute(name, a);
  lo.setIndex(new THREE.BufferAttribute(out, 1));
  return lo;
}

function characterMaterial(at: Atlas, hue: THREE.Color | null, linen: THREE.Color | null) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
  const u = { ...dyeUniforms(hue, linen), uAtlas: { value: at.tex } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer; attribute float aDye; varying vec3 vAtlas; varying float vDye;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAtlas = vec3(uv, aLayer); vDye = aDye;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uAtlas; varying vec3 vAtlas; varying float vDye;\n' + DYE_FNS)
      .replace('#include <map_fragment>', 'diffuseColor *= texture(uAtlas, vec3(vAtlas.xy, floor(vAtlas.z + 0.5)));\n' + dyeBlock('vDye'));
  };
  mat.customProgramCacheKey = () => 'character-array';
  return mat;
}
