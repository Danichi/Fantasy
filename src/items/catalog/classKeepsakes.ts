import type { Rarity } from '../itemDefs';
import { add } from './kit';
import { DISCIPLINES } from '../../paths/data';
import { HEX } from '../../ui/skillTree';

// Mentors' keepsakes (docs/design/classes.md): master a class (its mastery
// quest, at level 20) and its mentor gives you something of theirs to carry.
// One per class with a mentor in the world; the quest's completion hands it over.

const COMBAT_FX: [string, number][] = [['attackSpeed', 0.04], ['crit', 0.04], ['poiseDmg', 0.08], ['parryStamina', 6], ['moveSpeed', 0.04], ['backstab', 0.1], ['killHeal', 5], ['crowdDmg', 0.06]];
const MAGIC_FX: [string, number][] = [['castSpeed', 0.05], ['spell', 0.06], ['manaCost', 0.06], ['duration', 0.1], ['heal', 0.08], ['wildsSpell', 0.1]];
const KINDS = ['badge', 'ribbon', 'charm', 'knot', 'amulet', 'ring'] as const;

/** The keepsake a class's mentor gives (item id). */
export const keepsakeOf = (classId: string) => `keepsake_${classId}`;

DISCIPLINES.forEach((d, i) => {
  if ((d.fam !== 'combat' && d.fam !== 'magic') || !d.mentorNpc) return;
  const who = d.mentor.split(',')[0];
  const first = /^The /.test(who) ? who : who.replace(/^(Ser|Sister|Brother|Mother|Old|Lady|Slick|Magus|Archmage|Envoy|Instructor|Weaponsmaster|Archivist|Harbourmaster|High Priestess|Captain|Sergeant|Inquisitor|Abbot|Keeper of the)\s+/i, '').split(' ')[0].replace(/[^\w'-]/g, '');
  const pool = d.fam === 'combat' ? COMBAT_FX : MAGIC_FX;
  const [k, v] = pool[i % pool.length];
  const color = HEX[d.color] ?? '#d9b15a';
  const name = `${first}'s ${d.fam === 'combat' ? 'Token' : 'Sigil'} of the ${d.name}`;
  add({
    id: keepsakeOf(d.id), name, kind: 'accessory', slot: 'trinket', rarity: 'rare' as Rarity, lvl: 20,
    desc: `${who} gave you this when you mastered ${d.name}.`,
    stats: d.fam === 'combat' ? { maxHp: 15 } : { maxMana: 20 }, fx: { [k]: v },
  }, [`done:mastery-${d.id}`], { k: 'trinket', s: { kind: KINDS[i % KINDS.length], metal: d.fam === 'combat' ? 'iron' : 'silver', color, accent: '#e8dcc0', glow: color } });
});
