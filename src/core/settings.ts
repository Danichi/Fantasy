// Quality presets. Medium targets ~60fps on Intel Iris Xe at 1080p.
export type Quality = 'low' | 'medium' | 'high';

export interface QualitySettings {
  pixelRatio: number;
  shadowMapSize: number;
  bloom: boolean;
  smaa: boolean;
  /** custom post pass: haze, cloud shadows, bloom, grading */
  post: boolean;
  msaa: boolean;
  grassCount: number;
  /** meadow grass blades near the camera (a sparse far layer adds 30%) */
  grassBlades: number;
  maxDynamicLights: number;
  particleScale: number;
  /** sun shadows (off only for software-rendered test runs) */
  shadows?: boolean;
}

export const PRESETS: Record<Quality, QualitySettings> = {
  // Medium skips the composer entirely: MSAA on the canvas and tone mapping in
  // the material shaders. Bloom + SMAA cost ~40ms/frame at 1080p on Iris Xe.
  low: { pixelRatio: 0.8, shadowMapSize: 1536, bloom: false, smaa: false, post: false, msaa: false, grassCount: 10000, grassBlades: 45000, maxDynamicLights: 1, particleScale: 0.65 },
  medium: { pixelRatio: 1, shadowMapSize: 3072, bloom: true, smaa: false, post: true, msaa: true, grassCount: 28000, grassBlades: 110000, maxDynamicLights: 2, particleScale: 1 },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadowMapSize: 4096, bloom: true, smaa: false, post: true, msaa: true, grassCount: 60000, grassBlades: 200000, maxDynamicLights: 4, particleScale: 1.5 },
};

const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug');
export const TEST_MODE = params.has('test');

function readQuality(): Quality {
  const q = params.get('quality');
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  try {
    const s = localStorage.getItem('quality');
    if (s === 'low' || s === 'medium' || s === 'high') return s;
  } catch {}
  return 'high';
}

/**
 * A software rasteriser (SwiftShader: headless CI, or a machine without GPU
 * acceleration) draws every pixel on the CPU. Seconds per frame at the
 * default preset, so it gets a lean one unless a quality is chosen explicitly.
 */
function detectSoftwareGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    return false;
  }
}

const explicitQuality = params.has('quality') || (() => {
  try {
    return !!localStorage.getItem('quality');
  } catch {
    return false;
  }
})();
export const SOFTWARE_GL = !explicitQuality && detectSoftwareGL();
export const quality: Quality = SOFTWARE_GL ? 'low' : readQuality();
const LEAN: QualitySettings = { ...PRESETS.low, pixelRatio: 0.5, shadowMapSize: 1024, grassCount: 3000, grassBlades: 12000, particleScale: 0.4 };
// Automated tests on a software rasteriser check the world, not the picture:
// draw it as cheaply as possible so the simulation keeps real time.
const TEST_LEAN: QualitySettings = { ...LEAN, pixelRatio: 0.25, shadows: false, grassCount: 600, grassBlades: 2000, particleScale: 0.2 };
export const Q: QualitySettings = SOFTWARE_GL ? (TEST_MODE ? TEST_LEAN : LEAN) : PRESETS[quality];
/** an automated test run on a software rasteriser (headless CI) */
export const LEAN_TEST = SOFTWARE_GL && TEST_MODE;
