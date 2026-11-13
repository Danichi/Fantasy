/** Shared fixed-step sea clock and reproducible randomness, including across saves. */
export const seaRuntime = {
  time: 0,
  seed: 0x51ea2026,
  random() {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  reset(seed = 0x51ea2026) {
    this.time = 0;
    this.seed = seed >>> 0;
  },
};
export const seaRandom = () => seaRuntime.random();
export type TravelMode = 'ashore' | 'rowing' | 'helm' | 'deck' | 'boarding' | 'swimming' | 'diving' | 'cabin';
export interface SeaSettings {
  advanced: boolean;
  units: 'kmh' | 'knots';
  cameraMotion: number;
}
export const defaultSeaSettings = (): SeaSettings => ({
  advanced: false,
  units: 'kmh',
  cameraMotion: 0.35,
});
export const headingDegrees = (yaw: number) => (((180 - (yaw * 180) / Math.PI) % 360) + 360) % 360;
export const compassPoint = (yaw: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(headingDegrees(yaw) / 45) % 8];
export const sailName = (amount: number) => (amount < 0.05 ? 'Stopped' : amount < 0.38 ? 'Slow' : amount < 0.8 ? 'Half' : 'Full');
export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export function segmentDistanceSq(
  p: { x: number; y: number; z: number },
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  const x = b.x - a.x,
    y = b.y - a.y,
    z = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / (x * x + y * y + z * z || 1)));
  return (p.x - a.x - x * t) ** 2 + (p.y - a.y - y * t) ** 2 + (p.z - a.z - z * t) ** 2;
}
