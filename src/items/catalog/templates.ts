import type { ItemDef, ItemStats, Rarity } from '../itemDefs';
import { buildSword, buildOdachi, type SwordSpec } from '../weaponModels';
import { buildSpear, buildGreatsword, buildAxe, buildMace, buildDagger, buildStaff, buildPlayerBow, buildCrossbow, METAL, METAL_GLOW, type Metal, type Wood } from '../weapons/models';
import { TIERS } from './tiers';
import { buildShield, type ShieldLook } from './shieldModel';
import { add, rd, type Build } from './kit';

// Weapon shapes for the named items (faction weapons and uniques): each a
// kind, its moveset family, its base numbers at tier 1, and a model built
// from the existing kits in the item's metal and wood.

export interface Opts {
  metal?: Metal;
  wood?: Wood;
  /** sword colour override and glow */
  tint?: number;
  glow?: number;
  glowStrength?: number;
  /** bigger, longer, curvier */
  len?: number;
  curve?: number;
}

const arming: SwordSpec = { bladeLen: 0.72, bladeWidth: 0.024, thickness: 0.004, fullerLen: 0.72, gripLen: 0.1, guardSpan: 0.095, guardStyle: 'straight', pommel: 'wheel' };
const longsword: SwordSpec = { bladeLen: 0.86, bladeWidth: 0.025, thickness: 0.0042, fullerLen: 0.66, gripLen: 0.15, guardSpan: 0.115, guardStyle: 'curved', pommel: 'pear' };

const sw = (base: SwordSpec, x: Partial<SwordSpec>) => (o: Opts, m: Metal): Build => () => {
  const g = METAL_GLOW[m];
  return buildSword({
    ...base, ...x, tint: o.tint ?? METAL[m],
    ...(o.glow ? { glow: o.glow, glowStrength: o.glowStrength ?? 1.4 } : g && m !== 'deepsteel' && m !== 'sunbrass' ? { glow: g[0], glowStrength: 0.9 } : {}),
    ...(o.len ? { bladeLen: (x.bladeLen ?? base.bladeLen) * o.len } : {}),
    ...(o.curve !== undefined ? { curve: o.curve } : {}),
  });
};

export interface Tmpl {
  kind: ItemDef['kind'];
  hands?: 1 | 2;
  ammo?: 'arrow' | 'bolt';
  base: ItemStats;
  build: (o: Opts, m: Metal, w: Wood) => Build;
}

export const TMPL: Record<string, Tmpl> = {
  sword: { kind: 'sword', base: { damage: 19, speed: 1.15 }, build: sw(arming, {}) },
  shortsword: { kind: 'sword', base: { damage: 16, speed: 1.3 }, build: sw(arming, { bladeLen: 0.56, bladeWidth: 0.027, fullerLen: 0.5 }) },
  gladius: { kind: 'sword', base: { damage: 18, speed: 1.25, crit: 0.04 }, build: sw(arming, { bladeLen: 0.55, bladeWidth: 0.032, fullerLen: 0.3, guardSpan: 0.06, pommel: 'pear' }) },
  longsword: { kind: 'sword', base: { damage: 24, speed: 1 }, build: sw(longsword, {}) },
  sabre: { kind: 'sword', base: { damage: 21, speed: 1.15, crit: 0.05 }, build: sw(arming, { bladeLen: 0.82, bladeWidth: 0.021, curve: 0.09, pommel: 'pear' }) },
  cutlass: { kind: 'sword', base: { damage: 20, speed: 1.2 }, build: sw(arming, { bladeLen: 0.66, bladeWidth: 0.03, curve: 0.1, guardStyle: 'curved', guardSpan: 0.08 }) },
  falchion: { kind: 'sword', base: { damage: 25, speed: 0.98, crit: 0.06 }, build: sw(arming, { bladeLen: 0.74, bladeWidth: 0.036, curve: 0.05, pommel: 'pear' }) },
  scimitar: { kind: 'sword', base: { damage: 22, speed: 1.1, crit: 0.05 }, build: sw(arming, { bladeLen: 0.8, bladeWidth: 0.028, curve: 0.13, guardStyle: 'curved', pommel: 'pear' }) },
  khopesh: { kind: 'sword', base: { damage: 24, speed: 1.05, crit: 0.08 }, build: sw(arming, { bladeLen: 0.66, bladeWidth: 0.034, curve: 0.16, fullerLen: 0, pommel: 'pear', guardMat: 'brass' }) },
  rapier: { kind: 'sword', base: { damage: 19, speed: 1.2, crit: 0.16 }, build: sw(arming, { bladeLen: 0.98, bladeWidth: 0.011, thickness: 0.0055, fullerLen: 0, guardSpan: 0.11, guardStyle: 'curved', pommel: 'pear' }) },
  estoc: { kind: 'sword', base: { damage: 23, speed: 1.08, crit: 0.14, pierce: 0.2 }, build: sw(longsword, { bladeLen: 1.0, bladeWidth: 0.013, fullerLen: 0 }) },
  katana: { kind: 'sword', base: { damage: 23, speed: 1.1, crit: 0.08 }, build: sw(longsword, { bladeLen: 0.9, bladeWidth: 0.02, curve: 0.06, guardSpan: 0.04, gripLen: 0.22, fullerLen: 0 }) },
  odachi: { kind: 'greatsword', base: { damage: 33, speed: 0.88, crit: 0.06 }, build: () => () => buildOdachi() },
  greatsword: { kind: 'greatsword', base: { damage: 34, speed: 0.8, stagger: 1.3, poise: 6 }, build: (o, m) => () => buildGreatsword(m, { len: o.len ? 1.28 * o.len : undefined }) },
  flamberge: { kind: 'greatsword', base: { damage: 33, speed: 0.82, stagger: 1.25, bleed: 4 }, build: (o, m) => () => buildGreatsword(m, { len: 1.3, flamberge: true }) },
  dagger: { kind: 'dagger', base: { damage: 12, speed: 1.45, crit: 0.1 }, build: (o, m) => () => buildDagger({ metal: m, len: 0.28 * (o.len ?? 1), style: 'plain' }) },
  stiletto: { kind: 'dagger', base: { damage: 12, speed: 1.5, crit: 0.16 }, build: (o, m) => () => buildDagger({ metal: m, len: 0.32 * (o.len ?? 1), style: 'stiletto' }) },
  rondel: { kind: 'dagger', base: { damage: 13, speed: 1.4, crit: 0.1, pierce: 0.2 }, build: (o, m) => () => buildDagger({ metal: m, len: 0.3, style: 'rondel' }) },
  kris: { kind: 'dagger', base: { damage: 13, speed: 1.4, crit: 0.12, bleed: 2 }, build: sw(arming, { bladeLen: 0.34, bladeWidth: 0.024, fullerLen: 0, gripLen: 0.09, guardSpan: 0.05, curve: 0.04 }) },
  axe: { kind: 'axe', base: { damage: 19, speed: 1.08, bleed: 3 }, build: (o, m, w) => () => buildAxe({ metal: m, wood: w, two: false }) },
  beardedAxe: { kind: 'axe', base: { damage: 21, speed: 1.02, bleed: 4 }, build: (o, m, w) => () => buildAxe({ metal: m, wood: w, two: false, bearded: true }) },
  greataxe: { kind: 'axe', hands: 2, base: { damage: 34, speed: 0.82, bleed: 5, stagger: 1.2 }, build: (o, m, w) => () => buildAxe({ metal: m, wood: w, two: true, bearded: true }) },
  doubleAxe: { kind: 'axe', hands: 2, base: { damage: 36, speed: 0.78, bleed: 5, stagger: 1.3 }, build: (o, m, w) => () => buildAxe({ metal: m, wood: w, two: true, double: true }) },
  mace: { kind: 'mace', base: { damage: 20, speed: 0.95, stagger: 1.5 }, build: (o, m, w) => () => buildMace({ metal: m, wood: w, two: false, head: 'flanged' }) },
  star: { kind: 'mace', base: { damage: 21, speed: 0.93, stagger: 1.45, bleed: 2 }, build: (o, m, w) => () => buildMace({ metal: m, wood: w, two: false, head: 'star' }) },
  club: { kind: 'mace', base: { damage: 18, speed: 1.0, stagger: 1.6 }, build: (o, m, w) => () => buildMace({ metal: m, wood: w, two: false, head: 'hammer' }) },
  hammer: { kind: 'mace', hands: 2, base: { damage: 32, speed: 0.78, stagger: 2, poise: 6 }, build: (o, m, w) => () => buildMace({ metal: m, wood: w, two: true, head: 'hammer' }) },
  maul: { kind: 'mace', hands: 2, base: { damage: 35, speed: 0.74, stagger: 2.2, poise: 8 }, build: (o, m, w) => () => buildMace({ metal: m, wood: w, two: true, head: 'maul' }) },
  flail: { kind: 'mace', base: { damage: 22, speed: 0.92, stagger: 1.4, crit: 0.05 }, build: (o, m, w) => () => buildMace({ metal: m, wood: w, two: false, head: 'star' }) },
  spear: { kind: 'spear', base: { damage: 22, speed: 1 }, build: (o, m, w) => () => buildSpear({ metal: m, wood: w, back: 0.55, front: 1.55 * (o.len ?? 1), head: 'leaf' }) },
  partisan: { kind: 'spear', base: { damage: 24, speed: 0.97, stagger: 1.1 }, build: (o, m, w) => () => buildSpear({ metal: m, wood: w, back: 0.55, front: 1.6 * (o.len ?? 1), head: 'partisan' }) },
  glaive: { kind: 'spear', base: { damage: 26, speed: 0.94, crit: 0.04 }, build: (o, m, w) => () => buildSpear({ metal: m, wood: w, back: 0.55, front: 1.55 * (o.len ?? 1), head: 'glaive' }) },
  staff: { kind: 'staff', base: { damage: 17, speed: 1.1, focus: 0.12 }, build: (o, m, w) => () => buildStaff({ wood: w, shod: m, focus: o.glow ?? 0 }) },
  bow: { kind: 'bow', ammo: 'arrow', base: { damage: 16, speed: 1 }, build: (o, m, w) => () => buildPlayerBow({ wood: w, len: 1.4 * (o.len ?? 1), recurve: (o.curve ?? 0) > 0, tips: m }) },
  crossbow: { kind: 'crossbow', ammo: 'bolt', base: { damage: 30, speed: 1, pierce: 0.3 }, build: (o, m, w) => () => buildCrossbow({ metal: m, wood: w, heavy: (o.len ?? 1) > 1 }) },
};

const RAR_OF = (tier: number, unique: boolean): Rarity => (unique || tier >= 7 ? 'epic' : 'rare');

export interface Named {
  id: string;
  name: string;
  t: keyof typeof TMPL;
  tier: number;
  desc: string;
  /** extra stats (added to the scaled base) */
  s?: ItemStats;
  fx?: Record<string, number>;
  o?: Opts;
  rarity?: Rarity;
}

/** Make a named weapon: the template's numbers at its tier, a little better than the standard line. */
export function named(n: Named, src: string[], unique = false): ItemDef {
  const T = TMPL[n.t];
  const tier = TIERS[Math.max(0, Math.min(7, n.tier - 1))];
  const m = n.o?.metal ?? tier.metalKey, w = n.o?.wood ?? tier.woodKey;
  const k = tier.mult * (unique ? 1.16 : 1.08);
  const stats: ItemStats = { ...T.base };
  stats.damage = rd((T.base.damage ?? 10) * k);
  if (stats.poise) stats.poise = rd(stats.poise * (1 + (tier.n - 1) * 0.2));
  for (const [key, v] of Object.entries(n.s ?? {})) {
    const cur = (stats as Record<string, number>)[key] ?? 0;
    (stats as Record<string, number>)[key] = key === 'speed' || key === 'stagger' ? (v as number) : rd(cur + (v as number), key === 'damage' || key === 'burn' || key === 'bleed' || key === 'block' ? 1 : 0.01);
  }
  const d: ItemDef = {
    id: n.id, name: n.name, kind: T.kind, slot: 'main', rarity: n.rarity ?? RAR_OF(tier.n, unique), lvl: tier.lvl[0], desc: n.desc, stats,
    build: T.build(n.o ?? {}, m, w), ...(T.hands ? { hands: T.hands } : {}), ...(T.ammo ? { ammo: T.ammo } : {}), ...(n.fx ? { fx: n.fx } : {}),
  };
  return add(d, src);
}

export interface NamedShield {
  id: string;
  name: string;
  tier: number;
  desc: string;
  look: ShieldLook;
  s: ItemStats;
  fx?: Record<string, number>;
  rarity?: Rarity;
}
export function namedShield(n: NamedShield, src: string[]) {
  const tier = TIERS[n.tier - 1];
  return add({ id: n.id, name: n.name, kind: 'shield', slot: 'off', rarity: n.rarity ?? 'rare', lvl: tier.lvl[0], desc: n.desc, stats: n.s, build: () => buildShield(n.look), ...(n.fx ? { fx: n.fx } : {}) }, src);
}
