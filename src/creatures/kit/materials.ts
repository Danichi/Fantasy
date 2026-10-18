import * as THREE from 'three';

// Creature surfaces, all built on the shared stylised lighting (stylize.ts):
//   skin   - the base coat: colour drift, fine strand or pore relief that
//            follows the fur direction, wet/glossy spots from the mask channel
//   shell  - one layer of shell fur: the body pushed out along its normals,
//            cut into tapering strands, combed and drooping
//   hard   - tusks, claws, hooves, chitin: clearcoated, softly banded
//   eye    - wet, dark, sharp highlight
//
// Every material reads the bind-pose position, so patterns stick to the body
// as it moves. Numbers live in uniforms or defines so materials with
// different settings never share a compiled program by mistake.

export const NOISE_GLSL = /* glsl */ `
float crH31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 crH33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float crNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(crH31(i), crH31(i + vec3(1, 0, 0)), f.x), mix(crH31(i + vec3(0, 1, 0)), crH31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(crH31(i + vec3(0, 0, 1)), crH31(i + vec3(1, 0, 1)), f.x), mix(crH31(i + vec3(0, 1, 1)), crH31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float crFbm(vec3 p) { return crNoise(p) * 0.55 + crNoise(p * 2.03 + 7.1) * 0.28 + crNoise(p * 4.1 + 3.7) * 0.17; }
// Worley-ish: distance to the nearest jittered point (3x3x3), for scales and pores.
float crCells(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + crH33(i + o) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
// Bump: tilt the normal by the screen-space slope of a height value (three's perturbNormalArb).
vec3 crBump(vec3 surfPos, vec3 surfNorm, float h, float amount, float faceDir) {
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * amount;
  vec3 vSigmaX = normalize(dFdx(surfPos));
  vec3 vSigmaY = normalize(dFdy(surfPos));
  vec3 vN = surfNorm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}
`;

const VERT_PARS = /* glsl */ `
attribute float fur;
attribute vec3 flow;
attribute float mask;
varying vec3 vRest;
varying vec3 vFlowV;
varying float vFur;
varying float vMask;
`;

export interface SkinOpts {
  /** Strand relief strength (fur) or pore relief (bare skin). */
  relief?: number;
  /** Strand frequency across the fur (per metre). */
  strand?: number;
  /** Colour drift strength. */
  drift?: number;
  /** Roughness of the coat / of masked (wet) spots. */
  rough?: number;
  wetRough?: number;
  /** Velvet sheen for fur. */
  sheen?: number;
  sheenColor?: THREE.ColorRepresentation;
  /** Scales (reptile/chitin cells) instead of strands. */
  scales?: number;
}

export function skinMaterial(o: SkinOpts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: o.rough ?? 0.86,
    metalness: 0,
    sheen: o.sheen ?? 0,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(o.sheenColor ?? 0xffffff),
  });
  const U = {
    uRelief: { value: o.relief ?? 0.6 },
    uStrand: { value: o.strand ?? 110 },
    uDrift: { value: o.drift ?? 0.12 },
    uWetRough: { value: o.wetRough ?? 0.35 },
    uScales: { value: o.scales ?? 0 },
  };
  m.userData.styleRim = 0.32;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position; vFur = fur; vMask = mask;
        vFlowV = flow;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest; varying vec3 vFlowV; varying float vFur; varying float vMask;
        uniform float uRelief, uStrand, uDrift, uWetRough, uScales;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float crBroad = crFbm(vRest * 5.0);
        diffuseColor.rgb *= 1.0 + (crBroad - 0.5) * 2.0 * uDrift;
        diffuseColor.rgb *= 1.0 + (crNoise(vRest * 38.0) - 0.5) * uDrift * 0.9;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uWetRough, clamp(vMask, 0.0, 1.0));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float hgt;
          if (uScales > 0.0) {
            float c = crCells(vRest * uScales);
            hgt = smoothstep(0.0, 0.9, c);
            hgt = 1.0 - hgt * hgt;
          } else {
            // Strands: noise stretched along the direction the fur lies.
            vec3 fo = normalize(vFlowV);
            vec3 q = vRest * uStrand;
            float a = dot(q, fo);
            vec3 qs = q - fo * a * 0.82;
            hgt = crNoise(qs) * 0.6 + crNoise(qs * 2.3 + 4.0) * 0.4;
            // Bare skin: fine pores and creases instead.
            hgt = mix(hgt, crNoise(vRest * 160.0) * 0.5 + crNoise(vRest * 40.0) * 0.5, step(vFur, 0.001));
          }
          normal = crBump(-vViewPosition, normal, hgt, uRelief * 0.0025 * (1.0 - vMask * 0.6), faceDirection);
        }`);
  };
  return m;
}

export interface ShellOpts {
  layers: number;
  /** Strands per metre. */
  density: number;
  /** Strand thickness at the root (fraction of a cell, 0..0.5). */
  thick?: number;
  /** How much strands lie down along the flow. */
  comb?: number;
  droop?: number;
  /** Root darkening and tip lightening. */
  rootDark?: number;
  tipLight?: number;
  /** Multiplies the per-vertex fur length. */
  scale?: number;
  /** How strongly strands gather into pointed tufts at their tips (0..0.8). */
  clump?: number;
  /** Clump size in strands. */
  clumpSize?: number;
  /** Smooth strand edges through MSAA (alpha to coverage). */
  soft?: boolean;
}

/** One material per shell layer. All share a program (same hook, different uniforms). */
export function shellMaterials(o: ShellOpts) {
  const mats: THREE.MeshStandardMaterial[] = [];
  const time = { value: 0 };
  for (let i = 1; i <= o.layers; i++) {
    const h = i / o.layers;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    m.userData.styleRim = 0.4;
    m.alphaToCoverage = !!o.soft;
    if (!o.soft) m.defines = { FUR_HARD: '' };
    const U = {
      uH: { value: h },
      uDensity: { value: o.density },
      uThick: { value: o.thick ?? 0.32 },
      uComb: { value: o.comb ?? 0.9 },
      uDroop: { value: o.droop ?? 0.25 },
      uRootDark: { value: o.rootDark ?? 0.45 },
      uTipLight: { value: o.tipLight ?? 0.25 },
      uFurScale: { value: o.scale ?? 1 },
      uFurTime: time,
      uClump: { value: o.clump ?? 0.5 },
      uClumpK: { value: 1 / (o.clumpSize ?? 4.5) },
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          ${VERT_PARS}
          uniform float uH, uComb, uDroop, uFurScale, uFurTime;`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
          {
            vRest = position; vFur = fur; vMask = mask;
            #ifdef USE_SKINNING
              vec3 fl = normalize((skinMatrix * vec4(flow, 0.0)).xyz);
            #else
              vec3 fl = flow;
            #endif
            float L = fur * uFurScale;
            vec3 nn = normalize(objectNormal);
            float sway = sin(uFurTime * 2.3 + dot(position, vec3(7.0, 5.0, 3.0))) * 0.08;
            transformed += nn * L * uH + (fl * uComb + vec3(0.0, -uDroop, 0.0) + nn.zxy * sway) * L * uH * uH;
            vFlowV = fl;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRest; varying vec3 vFlowV; varying float vFur; varying float vMask;
          uniform float uH, uDensity, uThick, uRootDark, uTipLight, uFurScale, uClump, uClumpK;
          float crA;
          ${NOISE_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vFur * uFurScale < 0.003) discard;
          vec3 sp = vRest * uDensity;
          // Tufts: strands lean in toward the middle of their clump, more toward the tips.
          vec3 cp = sp * uClumpK;
          vec3 cc = (floor(cp) + 0.5 + (crH33(floor(cp) + 5.0) - 0.5) * 0.5) / uClumpK;
          float a = uClump * uH * (0.6 + 0.4 * crH31(floor(cp) + 9.0));
          vec3 sr = (sp - cc * a) / (1.0 - a);
          vec3 ci = floor(sr);
          vec3 rnd = crH33(ci);
          vec3 c = 0.5 + (rnd - 0.5) * 0.45;
          float d = length(fract(sr) - c) * (1.0 - a);
          // Each strand has its own length; thinner toward the tip.
          float len = 0.5 + 0.5 * crH31(ci + 17.0);
          if (uH > len) discard;
          float r = uThick * (1.0 - pow(uH / len, 1.4) * 0.9);
          float fw = max(fwidth(d), 1e-4);
          crA = 1.0 - smoothstep(r - fw, r + fw, d);
          #ifdef FUR_HARD
            if (crA < 0.5) discard;
            crA = 1.0;
          #else
            if (crA < 0.02) discard;
          #endif`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float t = uH;
            float shade = mix(1.0 - uRootDark, 1.0, smoothstep(0.0, 0.8, t));
            diffuseColor.rgb *= shade * (1.0 + uTipLight * t * t) * (0.86 + 0.28 * rnd.x);
            diffuseColor.a = crA;
          }`);
    };
    m.customProgramCacheKey = () => 'creature-shell';
    mats.push(m);
  }
  return { mats, time };
}

export function hardMaterial(color: THREE.ColorRepresentation, o: { rough?: number; clearcoat?: number; vertexColors?: boolean } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: o.vertexColors ?? false,
    roughness: o.rough ?? 0.45,
    clearcoat: o.clearcoat ?? 0.4,
    clearcoatRoughness: 0.35,
  });
  m.userData.styleRim = 0.3;
  return m;
}

export function eyeMaterial(color: THREE.ColorRepresentation = 0x140c08) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.05, metalness: 0, envMapIntensity: 0.35 });
  m.userData.styleRim = 0;
  return m;
}
