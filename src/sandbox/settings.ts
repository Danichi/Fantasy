import { SANDBOX_SETTINGS_KEY } from './mode';
export type Scenario = 'dummy' | 'melee' | 'ranged' | 'group';
export interface SandboxSettings {
  combat: string;
  magic: string;
  immortal: boolean;
  unlimited: boolean;
  instantCooldowns: boolean;
  enemyAI: boolean;
  autoReset: boolean;
  scenario: Scenario;
  targetHp: number;
  enemyDamage: number;
}
export function readSandboxSettings(): SandboxSettings {
  const defaults: SandboxSettings = {
    combat: 'gale',
    magic: '',
    immortal: true,
    unlimited: true,
    instantCooldowns: false,
    enemyAI: true,
    autoReset: true,
    scenario: 'dummy',
    targetHp: 10000,
    enemyDamage: 100,
  };
  try {
    const s = JSON.parse(localStorage.getItem(SANDBOX_SETTINGS_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return defaults;
    for (const key of ['immortal', 'unlimited', 'instantCooldowns', 'enemyAI', 'autoReset'] as const)
      if (typeof s[key] === 'boolean') defaults[key] = s[key];
    if (typeof s.combat === 'string') defaults.combat = s.combat;
    if (typeof s.magic === 'string') defaults.magic = s.magic;
    if (['dummy', 'melee', 'ranged', 'group'].includes(s.scenario)) defaults.scenario = s.scenario;
    if (Number.isFinite(s.targetHp)) defaults.targetHp = Math.max(100, Math.min(10000000, Math.round(s.targetHp)));
    if (Number.isFinite(s.enemyDamage)) defaults.enemyDamage = Math.max(1, Math.min(10000, Math.round(s.enemyDamage)));
  } catch {}
  return defaults;
}
export function saveSandboxSettings(settings: SandboxSettings) {
  try {
    localStorage.setItem(SANDBOX_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
