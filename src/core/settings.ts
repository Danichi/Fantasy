// Quality presets. Medium targets ~60fps on Intel Iris Xe at 1080p.
export type Quality = 'low' | 'medium' | 'high';

export interface QualitySettings {
  pixelRatio: number;
  shadowMapSize: number;
  bloom: boolean;
  smaa: boolean;
  msaa: boolean;
  grassCount: number;
  maxDynamicLights: number;
  particleScale: number;
}

export const PRESETS: Record<Quality, QualitySettings> = {
  // Medium skips the composer entirely: MSAA on the canvas and tone mapping in
  // the material shaders. Bloom + SMAA cost ~40ms/frame at 1080p on Iris Xe.
  low: { pixelRatio: 0.75, shadowMapSize: 1024, bloom: false, smaa: false, msaa: false, grassCount: 6000, maxDynamicLights: 1, particleScale: 0.5 },
  medium: { pixelRatio: 1, shadowMapSize: 2048, bloom: false, smaa: false, msaa: true, grassCount: 14000, maxDynamicLights: 2, particleScale: 1 },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadowMapSize: 4096, bloom: true, smaa: true, msaa: false, grassCount: 40000, maxDynamicLights: 4, particleScale: 1.5 },
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
  return 'medium';
}

export const quality: Quality = readQuality();
export const Q: QualitySettings = PRESETS[quality];
