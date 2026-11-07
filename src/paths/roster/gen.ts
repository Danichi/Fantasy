import type { BranchDef, DisciplineDef } from '../data';
import type { NodeEffect, NumMod } from '../effects';
import type { AscensionDef, AscensionNode } from '../ascensions';
import type { ClassSpec, FullSpec, MarkSpec, Mods, Trigger } from './types';

// Turns a ClassSpec into what the rest of the game reads: the discipline,
// its tree, the written passive of every node, the Ascensions, and the core
// passive that explains the class's mechanic in numbers. Every passive's text
// is made from the very effect it applies, so they can't drift apart.

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const ALLY: Record<string, [string, string]> = { skeleton: ['risen dead', 'risen dead'], beast: ['spirit beast', 'spirit beasts'], drowned: ['drowned sailor', 'drowned sailors'], wolf: ['spectral wolf', 'spectral wolves'], watchman: ['watchman', 'watchmen'] };

const MOD_WORD: Partial<Record<NumMod, string>> = {
  melee: 'damage', spell: 'spell damage', attackSpeed: 'attack speed', moveSpeed: 'movement speed', castSpeed: 'cast speed', poise: 'poise damage',
  crit: 'critical chance', heal: 'healing', parryWindow: 'parry window', staminaRegen: 'stamina regen', manaRegen: 'mana regen', area: 'area',
  duration: 'effect duration', lightAttack: 'light-attack damage', hpMult: 'max health',
};

/** "+10% attack speed, take 8% less damage" */
export function modsText(m: Mods = {}) {
  const out: string[] = [];
  for (const [k, v] of Object.entries(m) as [NumMod, number][]) {
    if (!v) continue;
    if (k === 'dmgTaken') out.push(`take ${pct(v)} ${v < 0 ? 'less' : 'more'} damage`);
    else if (k === 'manaCost') out.push(`spells cost ${pct(v)} ${v < 0 ? 'less' : 'more'} mana`);
    else if (k === 'dodgeCost') out.push(`dodging costs ${pct(v)} ${v < 0 ? 'less' : 'more'} stamina`);
    else if (k === 'blockCost') out.push(`blocking costs ${pct(v)} ${v < 0 ? 'less' : 'more'} stamina`);
    else if (k === 'staminaCost') out.push(`attacks cost ${pct(v)} ${v < 0 ? 'less' : 'more'} stamina`);
    else if (k === 'hp') out.push(`${v > 0 ? '+' : ''}${v} max health`);
    else if (k === 'stamina') out.push(`${v > 0 ? '+' : ''}${v} max stamina`);
    else if (k === 'mana') out.push(`${v > 0 ? '+' : ''}${v} max mana`);
    else if (MOD_WORD[k]) out.push(`${v > 0 ? '+' : '-'}${pct(v)} ${MOD_WORD[k]}`);
  }
  return out.join(', ');
}

function triggerText(t: Trigger, s: ClassSpec) {
  const w = s.mech.weapon?.length ? `${s.mech.weapon.map((x) => ({ '': 'bare-handed', bow: 'bow', crossbow: 'crossbow', spear: 'spear', axe: 'axe', dagger: 'dagger', mace: 'mace', sword: 'sword', greatsword: 'greatsword', staff: 'staff' } as Record<string, string>)[x] ?? x).join(' or ')} ` : '';
  switch (t) {
    case 'hit': return `each ${w}blow`;
    case 'heavy': return `each heavy ${w}blow`;
    case 'crit': return `each critical ${w}blow`;
    case 'air': return `each ${w}blow struck in mid-air`;
    case 'back': return `each ${w}blow from behind`;
    case 'shot': return 'each arrow or bolt that lands';
    case 'spell': return `each ${s.name} technique that lands`;
    case 'cast': return `each ${s.name} technique you use`;
    case 'kill': return 'each kill';
    case 'dodge': return 'each perfect dodge';
    case 'parry': return 'each parry';
    case 'hurt': return 'each blow you take';
    case 'block': return 'each blow you block';
  }
}

function dmgWord(s: ClassSpec, d: number) {
  return s.fam === 'combat' ? `${d}% weapon damage` : `${d} damage`;
}

export function fullText(s: ClassSpec, f: FullSpec) {
  const lead = f.when === 'next' ? `your next ${s.mech.gain.shot ? 'shot or blow' : s.fam === 'magic' ? `${s.name} technique` : 'blow'} to land releases` : 'it releases';
  let what = '';
  switch (f.kind) {
    case 'blast': what = `a ${f.r ?? 3.5} m blast for ${dmgWord(s, f.d ?? 120)}`; break;
    case 'buff': what = `for ${f.t ?? 8} s, ${modsText(f.m)}`; break;
    case 'heal': what = `you heal ${f.d ?? 20}% of your health`; break;
    case 'volley': what = `${f.n ?? 5} shots at the nearest enemies, each for ${dmgWord(s, f.d ?? 60)}`; break;
    case 'chain': what = `lightning that leaps between ${f.n ?? 5} enemies for ${dmgWord(s, f.d ?? 80)}`; break;
    case 'summon': { const [one, many] = ALLY[f.ally ?? 'beast']; what = `${f.n ?? 2} ${(f.n ?? 2) > 1 ? many : one} who fight beside you for ${f.t ?? 15} s`; break; }
    case 'execute': what = `a blow for ${dmgWord(s, f.d ?? 200)}; anything below a quarter of its health (but a boss) dies outright`; break;
  }
  const rider = f.fx ? ({ burn: ' It sets them burning.', bleed: ' It opens bleeding wounds.', stun: ' It stuns.', pull: ' It drags them in.', brand: ' It brands them.', leech: ' It heals you for a quarter of the damage.', mark: '', root: ' It roots them.', chill: ' It chills them.', curse: ' It curses them.', venom: ' It poisons them.' } as Record<string, string>)[f.fx] : '';
  return `At full, ${lead} ${f.name}: ${what}.${rider}`;
}

export function markText(s: ClassSpec, m: MarkSpec) {
  const burst = { blast: `bursts for ${s.fam === 'combat' ? '120% weapon damage' : '30 damage'} across 3 m`, stun: 'is stunned for 1.5 s', execute: 'dies outright if below a quarter of its health (a boss takes a heavy blow instead)', bleed: 'bleeds heavily for 4 s', root: 'is rooted for 2 s' }[m.burst];
  return `${triggerText(m.on, s).replace(/^each/, 'Each')} lays ${m.name} (${m.time ?? 8} s): each stack makes the enemy take ${pct(m.per)} more damage from you, and at ${m.at} stacks it ${burst} and the stacks clear.`;
}

/** The core passive: what the class is, then its mechanic in numbers. */
export function coreText(s: ClassSpec) {
  const m = s.mech, max = m.max ?? 100;
  const gains = (Object.entries(m.gain) as [Trigger, number][]).filter(([, v]) => v).map(([t, v]) => `${v} for ${triggerText(t, s)}`);
  const parts = [s.lead];
  if (gains.length) parts.push(`${m.res} (up to ${max}) builds: ${gains.join(', ')}.`);
  if (m.regen) parts.push(`It also gathers ${m.regen} a second on its own.`);
  if (m.castHp) parts.push(`Every ${s.name} technique costs ${pct(m.castHp)} of your health as well.`);
  if (m.per) parts.push(`A full ${m.res} gives ${modsText(m.per)} (less, the emptier it is).`);
  if (m.full) parts.push(fullText(s, m.full) + ' It spends all of it.');
  if (m.mark) parts.push(markText(s, m.mark));
  if (m.low) parts.push(`Below ${pct(m.low.below)} health: ${modsText(m.low.m)}.`);
  if (m.raise) parts.push(`Each kill has a ${pct(m.raise.chance)} chance to raise a ${ALLY[m.raise.ally][0]} for 12 s.`);
  if (m.decay !== 0 && !m.regen) parts.push(`It drains once you stop fighting.`);
  // (the Skills screen adds its own full stop)
  return parts.join(' ').replace(/\.$/, '');
}

// ---- passives made from the mechanic -----------------------------------------------------

type Eff = NodeEffect;
const COMBAT_STATS: [NumMod, number][] = [['melee', 0.05], ['attackSpeed', 0.04], ['crit', 0.04], ['stamina', 10], ['poise', 0.08], ['moveSpeed', 0.04], ['hp', 15], ['staminaRegen', 0.1]];
const MAGIC_STATS: [NumMod, number][] = [['spell', 0.06], ['mana', 12], ['castSpeed', 0.06], ['manaCost', -0.06], ['duration', 0.08], ['area', 0.06], ['manaRegen', 0.12], ['hp', 12]];

function stat(s: ClassSpec, i: number, k = 1): Eff {
  const pool = s.fam === 'combat' ? COMBAT_STATS : MAGIC_STATS;
  const [key, v] = pool[((i % pool.length) + pool.length) % pool.length];
  const val = Math.round(v * k * 100) / 100;
  return { text: modsText({ [key]: val }).replace(/^./, (c) => c.toUpperCase()), m: { [key]: val } };
}

/** One mechanic effect. */
function mech(s: ClassSpec, key: string, v: number): Eff | null {
  const m = s.mech, res = m.res, x = (k: string) => ({ [`${s.id}.${k}`]: v });
  switch (key) {
    case 'gain': return { text: `${res} builds ${pct(v)} faster`, x: x('gain') };
    case 'max': return m.pips ? { text: `+${v} max ${res}`, x: x('max') } : { text: `+${v} max ${res}`, x: x('max') };
    case 'per': return m.per ? { text: `What a full ${res} gives you is ${pct(v)} stronger`, x: x('per') } : null;
    case 'full': return m.full ? { text: `${m.full.name} is ${pct(v)} stronger`, x: x('full') } : null;
    case 'fullR': return m.full?.kind === 'blast' ? { text: `${m.full.name} reaches ${v} m farther`, x: x('fullR') } : null;
    case 'fullHeal': return m.full ? { text: `${m.full.name} also heals you for ${pct(v)} of your health`, x: x('fullHeal') } : null;
    case 'mark': return m.mark ? { text: `Each ${m.mark.name} stack makes enemies take ${pct(v)} more damage from you`, x: x('mark') } : null;
    case 'markAt': return m.mark && m.mark.at > 2 ? { text: `${m.mark.name} triggers one stack sooner`, x: x('markAt') } : null;
    case 'markTime': return m.mark ? { text: `${m.mark.name} lasts ${v} s longer`, x: x('markTime') } : null;
    case 'decay': return m.decay !== 0 && !m.regen ? { text: `${res} drains ${pct(v)} slower`, x: x('decay') } : null;
    case 'kill': return { text: `Each kill gives ${v} ${res}`, x: x('kill') };
    case 'low': return m.low ? { text: `What low health gives you is ${pct(v)} stronger`, x: x('low') } : null;
    case 'raise': return m.raise ? { text: `Kills raise an ally ${pct(v)} more often`, x: x('raise') } : null;
  }
  return null;
}

function first(s: ClassSpec, keys: [string, number][]): Eff {
  for (const [k, v] of keys) {
    const e = mech(s, k, v);
    if (e) return e;
  }
  return stat(s, keys.length);
}

function merge(a: Eff, b: Eff): Eff {
  const m: Mods = { ...a.m };
  for (const [k, v] of Object.entries(b.m ?? {})) m[k as NumMod] = (m[k as NumMod] ?? 0) + v;
  return { text: `${a.text}, and ${b.text.charAt(0).toLowerCase()}${b.text.slice(1)}`, m, x: { ...a.x, ...b.x } };
}

/**
 * Every non-technique node's effect, by its place in the tree. Each branch
 * leans a different way (branch 0 the release and damage, 1 the mark and
 * control, 2 staying alive), so the three read differently.
 */
export function branchPassives(s: ClassSpec, b: number): Record<string, Eff> {
  const [, , tiers] = s.tree[b];
  const out: Record<string, Eff> = {};
  const lean = [
    { a: [['full', 0.25], ['per', 0.25], ['gain', 0.2]], n: [['gain', 0.2], ['fullR', 1], ['full', 0.2]], c: [[['full', 0.4]], [['fullR', 1.5], ['gain', 0.35]]], t5: [['full', 0.3], ['kill', 10]] },
    { a: [['mark', 0.03], ['gain', 0.2], ['per', 0.2]], n: [['markAt', 1], ['markTime', 3], ['decay', 0.4]], c: [[['mark', 0.05], ['per', 0.3]], [['markAt', 1], ['gain', 0.3]]], t5: [['mark', 0.03], ['max', 20]] },
    { a: [['fullHeal', 0.04], ['decay', 0.4], ['low', 0.3]], n: [['decay', 0.5], ['kill', 8], ['raise', 0.5]], c: [[['fullHeal', 0.05], ['gain', 0.25]], [['low', 0.5], ['decay', 0.6]]], t5: [['fullHeal', 0.04], ['max', 15]] },
  ][b] as { a: [string, number][]; n: [string, number][]; c: [[string, number][], [string, number][]]; t5: [string, number][] };
  const statBase = b * 3 + s.id.length;
  tiers.forEach((row, ti) => {
    let notableN = 0;
    row.forEach((raw, ri) => {
      if (raw.startsWith('*')) return;
      const last = ri === row.length - 1;
      if (raw.startsWith('?')) {
        const [x, y] = raw.slice(1).split('|');
        out[x] = merge(first(s, lean.c[0]), stat(s, statBase + 1, 0.5));
        out[y] = merge(first(s, lean.c[1]), stat(s, statBase + 4, 0.5));
        return;
      }
      if (raw.startsWith('!')) {
        // A keystone: a big push one way, a real price the other.
        const up = first(s, [['per', 0.6], ['full', 0.6], ['mark', 0.08]]);
        const big = stat(s, statBase + 2, 3);
        const price: Mods = s.fam === 'combat' ? (b === 2 ? { melee: -0.1 } : { dmgTaken: 0.12 }) : b === 2 ? { spell: -0.1 } : { dmgTaken: 0.12 };
        out[raw.slice(1)] = { text: `${up.text}, and ${big.text.charAt(0).toLowerCase()}${big.text.slice(1)}, but ${modsText(price)}`, m: { ...big.m, ...Object.fromEntries(Object.entries(price).map(([k, v]) => [k, (big.m?.[k as NumMod] ?? 0) + v])) }, x: up.x };
        return;
      }
      if (ti === 0) out[raw] = stat(s, statBase + ri);
      else if (ti === 4) out[raw] = first(s, [lean.t5[ri % 2]]);
      else if (last && ti >= 2) out[raw] = stat(s, statBase + ti + ri, 1.5);
      else {
        const pool = notableN++ % 2 === 0 ? lean.a : lean.n;
        out[raw] = merge(first(s, [pool[(ti + ri) % pool.length], ...pool]), stat(s, statBase + ti, 0.6));
      }
    });
  });
  return out;
}

// ---- Ascensions ---------------------------------------------------------------------------

export function ascensions(s: ClassSpec): [AscensionDef, AscensionDef] {
  const node = (name: string, e: Eff): AscensionNode => ({ name, text: e.text, m: e.m, x: e.x });
  return s.asc.map((a) => {
    const [n1, n2, n3, n4] = a.nodes;
    const dmg: NumMod = s.fam === 'combat' ? 'melee' : 'spell';
    if (a.lean === 'edge') {
      return {
        name: a.name, flavour: a.flavour, nodes: [
          node(n1, merge({ text: modsText({ [dmg]: 0.1 }).replace(/^./, (c) => c.toUpperCase()), m: { [dmg]: 0.1 } }, first(s, [['per', 0.25], ['gain', 0.25]]))),
          node(n2, first(s, [['full', 0.35], ['mark', 0.05], ['gain', 0.3]])),
          node(n3, { text: `Your techniques recharge 15% faster, and ${s.fam === 'combat' ? '+6% critical chance' : '+10% cast speed'}`, m: s.fam === 'combat' ? { crit: 0.06 } : { castSpeed: 0.1 }, x: { cdr: 0.15 } }),
          node(n4, merge(first(s, [['full', 0.5], ['per', 0.5], ['mark', 0.06]]), { text: `${modsText({ [dmg]: 0.15 })}, but take 10% more damage`, m: { [dmg]: 0.15, dmgTaken: 0.1 } })),
        ],
      } as AscensionDef;
    }
    return {
      name: a.name, flavour: a.flavour, nodes: [
        node(n1, { text: '+10% max health, and take 5% less damage', m: { hpMult: 0.1, dmgTaken: -0.05 } }),
        node(n2, first(s, [['fullHeal', 0.05], ['mark', 0.04], ['decay', 0.5]])),
        node(n3, { text: '+25% damage while you are below 35% health, and take 10% less damage', m: { dmgTaken: -0.1 }, x: { lowHpDmg: 0.25 } }),
        node(n4, merge({ text: 'Kills heal you for 5% of your health', x: { killHealPct: 0.05 } }, first(s, [['max', 25], ['markAt', 1], ['gain', 0.3]]))),
      ],
    } as AscensionDef;
  }) as [AscensionDef, AscensionDef];
}

// ---- the discipline ----------------------------------------------------------------------

export function discipline(s: ClassSpec): DisciplineDef {
  const branches: BranchDef[] = s.tree.map(([name, sub, tiers, cap]) => ({ name, sub, tiers, cap }));
  return {
    id: s.id, fam: s.fam, name: s.name, color: s.color, mentor: s.mentor, mentorNpc: s.mentorNpc, res: s.mech.res, flavour: s.flavour, how: s.how,
    secret: s.tier === 'hidden' || s.tier === 'origin' ? true : undefined, requires: s.requires, also: s.also, origin: s.origin, gateFrom: s.gateFrom,
    core: s.core, tier: s.tier, trial: s.trial ? `trial-${s.id}` : undefined, branches,
  };
}

/** Every passive of a class: its core and each non-technique node. */
export function passives(s: ClassSpec): Record<string, NodeEffect> {
  const out: Record<string, NodeEffect> = { [`${s.id}:${s.core}`]: { text: coreText(s) } };
  s.tree.forEach((_, b) => {
    for (const [name, e] of Object.entries(branchPassives(s, b))) out[`${s.id}:${name}`] = e;
  });
  return out;
}
