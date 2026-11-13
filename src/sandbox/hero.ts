import type { Player } from '../player/player';
import { DISCIPLINES, DISC } from '../paths/data';
import { ATTRS, capOf, treeOf, PATHS_VERSION, MAX_RANK } from '../paths/paths';
import { SkillRuntime } from '../paths/skills';
import { ITEMS } from '../items/itemDefs';
import { events } from '../core/events';

export const COMBAT_STYLES = DISCIPLINES.filter((d) => d.fam === 'combat');
export const MAGIC_SCHOOLS = DISCIPLINES.filter((d) => d.fam === 'magic');
/** Max the chosen build; inactive magic schools stay dormant so their mechanics don't stack. */
export function sandboxBuild(p: Player, combat = 'gale', magic = '', keepBar = false) {
  combat = DISC[combat]?.fam === 'combat' ? combat : 'gale';
  magic = DISC[magic]?.fam === 'magic' ? magic : '';
  const P = p.paths,
    lv: Record<string, number> = {},
    nodes: typeof P.nodes = {};
  for (const d of DISCIPLINES) {
    lv[d.id] = d.fam === 'combat' || d.id === magic ? capOf(d.id) : 0;
    nodes[d.id] = {};
    if (d.id === combat || d.id === magic)
      for (const n of treeOf(d)?.nodes ?? [])
        nodes[d.id][n.id] = { r: n.type === 'active' ? MAX_RANK : 1, ...(n.type === 'choice' ? { pick: 0 } : {}) };
  }
  P.load({
    v: PATHS_VERSION,
    lv,
    nodes,
    mx: {},
    attrs: Object.fromEntries(ATTRS.map((a) => [a.id, 0])) as typeof P.attrs,
    active: combat,
    secondary: '',
    asc: {},
  });
  p.prog.xp = 1_000_000_000;
  p.prog.gold = 1_000_000;
  if (!keepBar) {
    const eq = p.equip;
    if (combat === 'cross') {
      const first = eq.items.find((i) => i.def.kind === 'sword');
      if (first) {
        eq.equip(first.uid, 'main');
        const second = eq.items.find((i) => i.def.kind === 'sword' && i.uid !== first.uid) ?? eq.add(first.def.id);
        eq.equip(second.uid, 'off');
      }
    }
    if (combat === 'boundary') {
      const shield = eq.items.find((i) => i.def.kind === 'shield');
      if (shield) eq.equip(shield.uid, 'off');
    }
  }
  if (!keepBar)
    p.equip.moves = buildMoves(p)
      .slice(0, 6)
      .map((m) => m.ref);
  events.emit('pathsChanged', {});
  events.emit('equipmentChanged', {});
  refill(p);
}
export function buildMoves(p: Player) {
  return DISCIPLINES.filter((d) => p.paths.level(d.id) > 0 && (d.id === p.paths.active || d.fam === 'magic')).flatMap((d) =>
    (treeOf(d)?.nodes ?? [])
      .filter((n) => SkillRuntime.skill(d.id, n.name))
      .map((n) => ({ ref: `skill:${d.id}:${n.id}`, name: `${d.name} · ${n.name}` })),
  );
}
export function refill(p: Player) {
  p.hp = p.maxHp;
  p.mana = p.maxMana;
  p.stamina = p.maxStamina;
  p.restoreArmour();
}
export function starterSandboxGear(p: Player) {
  const eq = p.equip;
  for (const kind of ['sword', 'spear', 'greatsword', 'axe', 'mace', 'dagger', 'bow', 'crossbow', 'staff', 'shield'] as const) {
    const d = Object.values(ITEMS).find((d) => d.kind === kind);
    if (d && !eq.items.some((i) => i.def.id === d.id)) eq.add(d.id);
  }
  for (const id of ['healthPotion', 'manaPotion', 'arrowIron', 'boltIron'])
    if (ITEMS[id] && !eq.items.some((i) => i.def.id === id)) eq.add(id, 99);
  if (!eq.mainWeapon) {
    const sword = eq.items.find((i) => i.def.id === 'longsword') ?? eq.items.find((i) => i.def.kind === 'sword');
    if (sword) eq.equip(sword.uid, 'main');
  }
  if (!eq.offItem) {
    const shield = eq.items.find((i) => i.def.kind === 'shield');
    if (shield) eq.equip(shield.uid, 'off');
  }
}
