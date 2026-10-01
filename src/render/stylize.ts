import * as THREE from 'three';

// One lighting model for everything (docs/ART-DIRECTION.md, rule 2).
//
// three.js builds every MeshStandard/Physical material from shared shader
// chunks, so patching those chunks here restyles terrain, buildings, props,
// characters and creatures at once, including materials that add their own
// onBeforeCompile tweaks. Import this module before any material compiles.
//
//   - Wrapped, softly banded diffuse: a wide soft terminator instead of
//     Lambert's hard falloff, so forms read as painted shapes.
//   - Low, broad specular: only metal really shines.
//   - Painterly textures: fine texture detail is blended toward a blurred mip,
//     leaving broad colour variation instead of photographic grain.
//   - A thin sky-coloured rim on grazing angles to separate silhouettes.

export const STYLE = {
  /** 0 = off, 1 = full painterly texture flattening. */
  textureSoftness: { value: 0.55 },
  rimColor: { value: new THREE.Color(0.75, 0.88, 1.0) },
  rimStrength: { value: 0.22 },
};

const S = THREE.ShaderChunk;

function patch(chunk: keyof typeof THREE.ShaderChunk, from: string, to: string) {
  const src = S[chunk];
  if (!src.includes(from)) {
    console.warn('[stylize] shader chunk changed, skipped:', chunk);
    return;
  }
  (S as Record<string, string>)[chunk] = src.replace(from, to);
}

// Direct light: soft two-tone ramp with a wrapped terminator.
patch(
  'lights_physical_pars_fragment',
  `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;`,
  `float ndlRaw = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( ndlRaw );
	// Wrapped diffuse pushed through a soft band: lit faces sit on a broad
	// plateau, the terminator is wide and gentle, backs stay in the cool fill.
	float wrapped = saturate( ( ndlRaw + 0.35 ) / 1.35 );
	float ramp = smoothstep( 0.18, 0.62, wrapped ) * 0.82 + wrapped * 0.18;
	vec3 irradiance = ramp * directLight.color;`,
);
// Broad, quiet specular.
patch(
  'lights_physical_pars_fragment',
  `reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;`,
  `reflectedLight.directSpecular += irradiance * dotNL * specularBRDF * material.multiScatteringCompensation * mix( 0.35, 1.0, material.metalness );`,
);

// Painterly texture sampling: blend toward a blurred mip level.
patch(
  'map_pars_fragment',
  `#ifdef USE_MAP
	uniform sampler2D map;
#endif`,
  `#ifdef USE_MAP
	uniform sampler2D map;
#endif
uniform float uStyleSoftness;
uniform vec3 uStyleRim;
uniform float uStyleRimStrength;`,
);
patch(
  'map_fragment',
  `vec4 sampledDiffuseColor = texture2D( map, vMapUv );`,
  `vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	vec4 styleBroad = texture2D( map, vMapUv, 3.5 );
	// Keep broad colour, soften fine detail and its contrast.
	sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, mix( styleBroad.rgb, sampledDiffuseColor.rgb, 0.35 ), uStyleSoftness );`,
);

// Rim light on grazing angles, on the lit side of the sky.
patch(
  'lights_fragment_end',
  `#if defined( RE_IndirectSpecular )`,
  `#if defined( STANDARD ) && !defined( STYLE_NO_RIM )
	{
		float rimNdv = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
		float rim = smoothstep( 0.55, 0.95, rimNdv ) * saturate( geometryNormal.y * 0.5 + 0.6 );
		reflectedLight.directDiffuse += uStyleRim * rim * uStyleRimStrength * material.diffuseColor;
	}
#endif
#if defined( RE_IndirectSpecular )`,
);

// Weathered buildings (materials that define STYLE_WEATHER; roofs add
// STYLE_ROOF): no two walls quite the same colour, faint rain streaks down
// the plaster and stone, moss and lichen on what faces the sky. All from
// world position, so it is free of extra textures and survives batching.
(S as Record<string, string>).common += `
#ifdef STYLE_WEATHER
varying vec3 vStyleWorld;
varying float vStyleUp;
float styleHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float styleNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(styleHash(i), styleHash(i + vec2(1.0, 0.0)), f.x), mix(styleHash(i + vec2(0.0, 1.0)), styleHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
#endif
`;
patch(
  'project_vertex',
  `gl_Position = projectionMatrix * mvPosition;`,
  `gl_Position = projectionMatrix * mvPosition;
#ifdef STYLE_WEATHER
  vec4 styleW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    styleW = instanceMatrix * styleW;
  #endif
  vStyleWorld = ( modelMatrix * styleW ).xyz;
  vStyleUp = normalize( mat3( modelMatrix ) * objectNormal ).y;
#endif`,
);
patch(
  'color_fragment',
  `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )`,
  `#ifdef STYLE_WEATHER
	{
		vec3 w = vStyleWorld;
		// Broad drift: each house and wall a shade warmer, cooler, older.
		diffuseColor.rgb *= mix( 0.9, 1.07, styleNoise( w.xz * 0.06 + 3.1 ) );
		// Rain streaks running down walls.
		float wall = 1.0 - smoothstep( 0.35, 0.7, abs( vStyleUp ) );
		float streak = styleNoise( vec2( ( w.x + w.z ) * 2.3, w.y * 0.35 ) ) * styleNoise( vec2( ( w.x - w.z ) * 0.9, w.y * 0.12 + 5.0 ) );
		diffuseColor.rgb *= 1.0 - wall * smoothstep( 0.25, 0.6, streak ) * 0.16;
		#ifdef STYLE_ROOF
			// Moss and lichen on the sky-facing slopes.
			float up = smoothstep( 0.3, 0.7, vStyleUp );
			float moss = smoothstep( 0.55, 0.8, styleNoise( w.xz * 0.35 + 9.0 ) * 0.7 + styleNoise( w.xz * 1.7 ) * 0.3 );
			diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.72, 0.9, 0.55 ), up * moss * 0.55 );
		#endif
	}
#endif
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )`,
);

// The uniforms above are declared in every standard shader (map_pars_fragment
// is always included), so feed them to every standard/physical material.
// Materials that set their own onBeforeCompile (terrain, grass, water...) get
// it wrapped, and the program cache key stays the inner function's source so
// different custom shaders never share a compiled program.
type Hook = (s: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => void;
type Styled = { _styleInner?: Hook; _styleHook?: Hook; userData: Record<string, unknown> };
// A material can opt out of texture softening (already-painted textures) with
// userData.styleSoftness = 0, and take a stronger rim (characters: a bright
// silhouette against the world) with userData.styleRim.
const addStyleUniforms = (sh: THREE.WebGLProgramParametersWithUniforms, mat: Styled) => {
  const own = mat.userData.styleSoftness;
  sh.uniforms.uStyleSoftness = typeof own === 'number' ? { value: own } : STYLE.textureSoftness;
  sh.uniforms.uStyleRim = STYLE.rimColor;
  const rim = mat.userData.styleRim;
  sh.uniforms.uStyleRimStrength = typeof rim === 'number' ? { value: rim } : STYLE.rimStrength;
};
Object.defineProperty(THREE.MeshStandardMaterial.prototype, 'onBeforeCompile', {
  configurable: true,
  get(this: Styled) {
    return this._styleHook ?? ((sh: THREE.WebGLProgramParametersWithUniforms) => addStyleUniforms(sh, this));
  },
  set(this: Styled, fn: Hook) {
    this._styleInner = fn;
    this._styleHook = (sh, r) => {
      addStyleUniforms(sh, this);
      fn.call(this, sh, r);
    };
  },
});
// clone()/copy() keep a custom shader hook (three's Material.copy drops it).
const baseCopy = THREE.MeshStandardMaterial.prototype.copy;
THREE.MeshStandardMaterial.prototype.copy = function (this: THREE.MeshStandardMaterial & Styled, source: THREE.MeshStandardMaterial & Styled) {
  baseCopy.call(this, source);
  if (source._styleInner) this.onBeforeCompile = source._styleInner;
  return this;
} as typeof baseCopy;
THREE.MeshStandardMaterial.prototype.customProgramCacheKey = function (this: Styled) {
  return this._styleInner ? this._styleInner.toString() : 'style';
};
