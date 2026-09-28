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
  maxDynamicLights: number;
  particleScale: number;
}

export const PRESETS: Record<Quality, QualitySettings> = {
  // Medium skips the composer entirely: MSAA on the canvas and tone mapping in
  // the material shaders. Bloom + SMAA cost ~40ms/frame at 1080p on Iris Xe.
  low: { pixelRatio: 0.8, shadowMapSize: 1536, bloom: false, smaa: false, post: false, msaa: false, grassCount: 10000, maxDynamicLights: 1, particleScale: 0.65 },
  medium: { pixelRatio: 1, shadowMapSize: 3072, bloom: true, smaa: false, post: true, msaa: true, grassCount: 28000, maxDynamicLights: 2, particleScale: 1 },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadowMapSize: 4096, bloom: true, smaa: false, post: true, msaa: true, grassCount: 60000, maxDynamicLights: 4, particleScale: 1.5 },
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

export const quality: Quality = readQuality();
export const Q: QualitySettings = PRESETS[quality];
