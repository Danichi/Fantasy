// Authored progression, never a live response to the player's equipment or level.
// Road danger rises eastward; wildlife around the Glen keeps its introductory tier.
export function roadTier(x: number, z: number) {
  // Instanced interiors/dungeons live in the void and author their own tiers.
  if (Math.abs(x) > 20000 || Math.abs(z) > 20000)
    return { level: 1, hp: 1, damage: 1 };
  if (Math.hypot(x, z) < 620) return { level: 2, hp: 1, damage: 1 };
  if (x < 900) return { level: 6, hp: 2.2, damage: 1.45 };
  if (x < 1800) return { level: 10, hp: 4.2, damage: 1.9 };
  if (x < 2600) return { level: 14, hp: 7.2, damage: 2.5 };
  return { level: 18, hp: 10, damage: 3.1 };
}
export const ACADEMY_TRIAL = {
  hp: 2800,
  damage: 78,
  pace: 0.95,
  level: 16,
  style: 'boundary' as const,
};
export const ACADEMY_RIVAL = {
  hp: 2400,
  damage: 72,
  pace: 0.82,
  level: 15,
  style: 'gale' as const,
};
export type DuelStyle = 'gale' | 'boundary' | 'cross';
export function wildlifeScale(level: number) {
  const l = Math.max(0, level - 1);
  return {
    hp: 1 + l * 0.24 + l * l * 0.009,
    dmg: 1 + l * 0.115,
    xp: 1 + l * 0.16,
  };
}
