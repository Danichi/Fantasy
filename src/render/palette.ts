// Shared painterly palette helpers (docs/ART-DIRECTION.md §2).
//
// Broad colour fields across the meadows, hundreds of metres wide: lush deep
// greens in the hollows, sunny yellow-greens, and golden-olive dry grass. The
// grass blades and the ground under them use the same field (the same noise
// texture at the same scale), so blades and terrain always agree in colour.

/** GLSL: `vec3 meadowTint(vec2 worldXZ, sampler2D noise)` returns a colour multiplier. */
export const MEADOW_FIELD_GLSL = /* glsl */ `
  vec3 meadowTint(vec2 w, sampler2D noiseTex) {
    float a = texture2D(noiseTex, w * 0.0011 + vec2(0.31, 0.77)).r;
    float b = texture2D(noiseTex, w * 0.0029 + vec2(0.53, 0.11)).g;
    float field = a * 0.68 + b * 0.32;
    float golden = smoothstep(0.54, 0.76, field);
    float lush = smoothstep(0.46, 0.28, field);
    vec3 t = mix(vec3(1.0), vec3(1.34, 1.12, 0.62), golden * 0.85);
    return t * mix(vec3(1.0), vec3(0.8, 0.97, 0.82), lush * 0.75);
  }
`;
