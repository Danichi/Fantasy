// Shared between the 3D wildflowers and the terrain's distant flower speckles.

/** Shared GLSL: where flowers bloom, and which kind (0..3). Also used by the terrain. */
export const FLOWER_GLSL = /* glsl */ `
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y);
  }
  // 0..1 bloom density: drifts of flowers across the meadows.
  float flowerDensity(vec2 w) {
    float n = fn(w * 0.035) * 0.65 + fn(w * 0.11 + 3.7) * 0.35;
    return smoothstep(0.44, 0.66, n);
  }
  // Each drift favours one flower.
  float flowerKind(vec2 w) { return floor(fn(w * 0.02 + 11.3) * 3.999); }
`;

