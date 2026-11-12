import * as THREE from 'three';
import type { Style } from '../magic/circles';

// Painted VFX layer: cinematic effect textures generated with Higgsfield and
// baked into public/assets/fx/ (see tools/fx/README.md). Each texture is an
// effect on pure black, so the shader treats brightness as coverage: it adds
// the light (it glows) and darkens what's behind it a little (it reads in
// bright daylight, where pure additive washes out).
//
// Everything here is optional. Textures load lazily on first use; until one
// has loaded, or if its file is missing, callers get `null` and keep drawing
// the procedural effect they always drew.

const DIR = '/assets/fx/';

/** Animated 4x4 flipbooks (16 frames, played once). */
export type BurstKey = 'fire' | 'frost' | 'storm' | 'spark' | 'holy' | 'void' | 'earth' | 'nature' | 'blood' | 'water' | 'wind';
/** Sword-arc ribbons, drawn as an arch bulging toward the top of the image. */
export type SlashKey = 'blue' | 'crimson' | 'gold' | 'emerald' | 'ember' | 'violet';
/** Top-down magic circles. */
export type SigilKey = 'arcane' | 'holy' | 'fire' | 'frost' | 'void' | 'nature' | 'blood' | 'earth';
/** Looping 4x4 flipbooks. */
export type LoopKey = 'fireball';
/** Single images. */
export type StillKey = 'dome' | 'pillar' | 'trail' | `decal_${'scorch' | 'frost' | 'cracks' | 'void' | 'holy' | 'storm' | 'bloom'}`;

/** Which painted set each school uses (colours follow the combat reference boards). */
export const STYLE_FX: Record<Style, { burst: BurstKey; slash: SlashKey; sigil: SigilKey }> = {
  fire: { burst: 'fire', slash: 'ember', sigil: 'fire' },
  light: { burst: 'holy', slash: 'gold', sigil: 'holy' },
  gale: { burst: 'wind', slash: 'blue', sigil: 'arcane' },
  wind: { burst: 'nature', slash: 'emerald', sigil: 'nature' },
  frost: { burst: 'frost', slash: 'blue', sigil: 'frost' },
  steel: { burst: 'spark', slash: 'crimson', sigil: 'blood' },
  shadow: { burst: 'void', slash: 'violet', sigil: 'void' },
  blood: { burst: 'blood', slash: 'crimson', sigil: 'blood' },
  void: { burst: 'void', slash: 'violet', sigil: 'void' },
  nature: { burst: 'nature', slash: 'emerald', sigil: 'nature' },
  earth: { burst: 'earth', slash: 'crimson', sigil: 'earth' },
  water: { burst: 'water', slash: 'blue', sigil: 'arcane' },
  storm: { burst: 'storm', slash: 'violet', sigil: 'arcane' },
};

const cache = new Map<string, THREE.Texture | null>();
const pending = new Set<string>();
const loader = new THREE.TextureLoader();

/** The texture at `file` if it has loaded; starts loading it otherwise. */
function tex(file: string): THREE.Texture | null {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  if (!pending.has(file) && typeof document !== 'undefined') {
    pending.add(file);
    loader.load(
      DIR + file,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        cache.set(file, t);
      },
      undefined,
      () => cache.set(file, null), // missing file: stay procedural
    );
  }
  return null;
}

/** Start loading everything up front (call once at boot, off the critical path). */
export function preloadVfx() {
  for (const k of ['fire', 'frost', 'storm', 'spark', 'holy', 'void', 'earth', 'nature', 'blood', 'water', 'wind']) tex(`burst_${k}.webp`);
  for (const k of ['blue', 'crimson', 'gold', 'emerald', 'ember', 'violet']) tex(`slash_${k}.webp`);
  for (const k of ['arcane', 'holy', 'fire', 'frost', 'void', 'nature', 'blood', 'earth']) tex(`sigil_${k}.webp`);
  tex('loop_fireball.webp');
  for (const k of ['dome', 'pillar', 'trail']) tex(`${k}.webp`);
  for (const k of ['scorch', 'frost', 'cracks', 'void', 'holy', 'storm', 'bloom']) tex(`decal_${k}.webp`);
}

/** Forget missing files and load again (dev: new art dropped into public/assets/fx). */
export function reloadVfx() {
  for (const [k, v] of cache) if (v === null) cache.delete(k);
  pending.clear();
  preloadVfx();
}
if (typeof window !== 'undefined') (window as unknown as { __vfx?: object }).__vfx = { reload: reloadVfx };

export const burstTex = (k: BurstKey) => tex(`burst_${k}.webp`);
export const slashTex = (k: SlashKey) => tex(`slash_${k}.webp`);
export const sigilTex = (k: SigilKey) => tex(`sigil_${k}.webp`);
export const loopTex = (k: LoopKey) => tex(`loop_${k}.webp`);
export const stillTex = (k: StillKey) => tex(`${k}.webp`);

// ---- material ------------------------------------------------------------------------

const VERT = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

// Brightness is coverage. rgb is added (premultiplied); alpha darkens the
// background under the bright parts so the effect holds up against sunlit grass.
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uFrame;
  uniform float uGrid;
  uniform float uOpacity;
  uniform float uGain;
  uniform float uOcclude;
  uniform vec3 uTint;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    vec2 uv = vUv;
    if (uGrid > 1.0) {
      float f = floor(uFrame);
      vec2 cell = vec2(mod(f, uGrid), uGrid - 1.0 - floor(f / uGrid));
      uv = (cell + uv) / uGrid;
    }
    vec3 c = texture2D(uMap, uv).rgb;
    float lum = max(c.r, max(c.g, c.b));
    // Cut the faint compression noise in the black so the quad's edge never shows.
    float cover = smoothstep(0.03, 0.6, lum);
    // Fade the quad's own border, so a render that touches its frame never shows a hard edge.
    vec2 e = smoothstep(vec2(0.0), vec2(0.07), vUv) * smoothstep(vec2(0.0), vec2(0.07), 1.0 - vUv);
    float edge = e.x * e.y;
    cover *= edge;
    vec3 col = c * uTint * uGain * uOpacity * edge;
    gl_FragColor = vec4(col, cover * uOcclude * uOpacity);
    #include <fog_fragment>
  }`;

export interface VfxMatOpts {
  map: THREE.Texture;
  /** 4 for a 4x4 flipbook, 1 for a still */
  grid?: number;
  /** HDR multiplier: above ~1.2 the bloom pass makes it glow */
  gain?: number;
  /** how much the effect darkens what's behind it (0 = pure additive) */
  occlude?: number;
  tint?: THREE.ColorRepresentation;
}

export function vfxMaterial(o: VfxMatOpts) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMap: { value: o.map },
      uFrame: { value: 0 },
      uGrid: { value: o.grid ?? 1 },
      uOpacity: { value: 1 },
      uGain: { value: o.gain ?? 1.8 },
      uOcclude: { value: o.occlude ?? 0.35 },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
      ...THREE.UniformsLib.fog,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: false,
    // premultiplied "over" plus glow: dst * (1 - a) + src
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
  });
}

export const setOpacity = (m: THREE.Material, v: number) => ((m as THREE.ShaderMaterial).uniforms.uOpacity.value = v);
export const setFrame = (m: THREE.Material, v: number) => ((m as THREE.ShaderMaterial).uniforms.uFrame.value = v);

const QUAD = new THREE.PlaneGeometry(1, 1);
const _cp = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

/** A camera-facing quad (THREE.Sprite only takes SpriteMaterial, so this billboards by hand). */
export class Billboard extends THREE.Mesh {
  /** keep upright: turn about Y only (pillars, domes) */
  upright = false;
  /** spin in the view plane, radians */
  roll = 0;
  constructor(mat: THREE.ShaderMaterial) {
    super(QUAD, mat);
    this.renderOrder = 12;
    this.frustumCulled = false;
  }
  override onBeforeRender(_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera) {
    if (this.upright) {
      camera.getWorldPosition(_cp);
      this.getWorldPosition(_wp);
      this.rotation.set(0, Math.atan2(_cp.x - _wp.x, _cp.z - _wp.z), 0);
    } else {
      camera.getWorldQuaternion(this.quaternion);
      this.quaternion.multiply(_q.setFromAxisAngle(_z, this.roll));
    }
    this.updateMatrixWorld(true);
  }
}

/**
 * Flat slash ribbon geometry: the painted arch (an upside-down U whose centre
 * of curvature is the image centre, radius about 0.42 of the frame), laid flat
 * with its bulge toward +X so it wraps around the swordsman at radius 1.
 */
export function slashGeometry() {
  return new THREE.PlaneGeometry(2.4, 2.4).rotateZ(-Math.PI / 2).rotateX(-Math.PI / 2);
}
