import { DISC, DISCIPLINES } from '../paths/data';
import { treeOf } from '../paths/paths';
import { SkillRuntime, type SkillDef } from '../paths/skills';
import type { Player } from '../player/player';
import type { Input, Action } from '../core/input';
import { events } from '../core/events';
import { TECHNIQUE_SLOTS, type TechniqueSlot } from './techniqueLoadout';

export interface TechniqueEntry {
  ref: string;
  name: string;
  discipline: string;
  school: string;
  description: string;
  cost: string;
  def?: SkillDef;
  key?: string;
}
export const INPUT_NAMES: Record<TechniqueSlot, string> = { light: 'Light', heavy: 'Heavy', dodge: 'Dodge', guard: 'Guard' };
const SLOT_ACTION: Record<TechniqueSlot, Action> = { light: 'attack', heavy: 'heavy', dodge: 'dodge', guard: 'offhand' };
export function keyName(code: string) {
  return code
    .replace(/^Key|^Digit/, '')
    .replace('Mouse0', 'LMB')
    .replace('Mouse2', 'RMB')
    .replace('Space', 'Space');
}
function role(e: TechniqueEntry): TechniqueSlot {
  const s = e.def,
    name = e.name;
  if (/dash|step|blink|evade|retreat|escape/i.test(name) || s?.action === 'sk_dash') return 'dodge';
  if (/guard|ward|heal|parry|deflect|shield|vow|bless/i.test(name) || s?.action === 'sk_castSelf' || s?.action === 'sk_pray') return 'guard';
  if ((s && (s.cd >= 14 || s.action === 'sk_castBig')) || /quake|storm|cleave|meteor|slam/i.test(name)) return 'heavy';
  return 'light';
}
/** One route to the existing skill runtime: costs, targets, equipment and cooldowns remain authoritative. */
export class Techniques {
  private dirty = true;
  private catalog: TechniqueEntry[] = [];
  private pending: { ref: string; left: number } | null = null;
  lastInput = '';
  recent: { label: string; left: number }[] = [];
  constructor(
    readonly player: Player,
    readonly runtime: SkillRuntime,
    readonly input: Input,
    private notify: (message: string) => void
  ) {
    for (const event of ['pathsChanged', 'equipmentChanged'] as const)
      events.on(event, () => {
        this.dirty = true;
      });
  }
  invalidate() {
    this.dirty = true;
  }
  get entries(): TechniqueEntry[] {
    if (!this.dirty) return this.catalog;
    this.dirty = false;
    const entries: TechniqueEntry[] = [];
    for (const d of DISCIPLINES) {
      if (!this.player.paths.learned(d.id)) continue;
      for (const n of treeOf(d)?.nodes ?? []) {
        const def = SkillRuntime.skill(d.id, n.name);
        if (!def || !this.runtime.rankOf(d.id, n.id)) continue;
        const cost =
          [
            def.stamina ? `${Math.ceil(def.stamina * this.player.mods.staminaCost)} stamina` : '',
            def.mana ? `${this.runtime.manaCost(def)} mana` : '',
            def.flow ? `${def.flow} Flow` : '',
            def.tempo ? `${def.tempo} Tempo` : '',
            def.focus ? `${def.focus} Focus` : '',
            def.needHeat ? `${def.needHeat} Heat required` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'No resource cost';
        entries.push({
          ref: `skill:${d.id}:${n.id}`,
          name: n.name,
          discipline: d.id,
          school: d.name,
          description: def.text(this.runtime.rankOf(d.id, n.id), this.runtime),
          cost,
          def,
          key: `${d.id}:${n.name}`,
        });
      }
    }
    for (const it of this.player.equip.items)
      if (it.def.kind === 'spell' && !entries.some((e) => e.ref === `spell:${it.def.id}`))
        entries.push({
          ref: `spell:${it.def.id}`,
          name: it.def.name,
          discipline: 'spells',
          school: 'Attuned spells',
          description: it.def.desc ?? '',
          cost: `${it.def.stats.manaCost ?? 0} mana`,
        });
    this.catalog = entries;
    return entries;
  }
  entry(ref: string) {
    return this.entries.find((e) => e.ref === ref);
  }
  get schools() {
    return [...new Map(this.entries.map((e) => [e.discipline, e.school])).entries()];
  }
  get heldSchools() {
    return this.schools.filter(([id]) => DISC[id]?.fam !== 'combat' || id === this.player.paths.active || id === this.player.paths.secondary);
  }
  get discipline() {
    const s = this.player.equip.techniques,
      schools = this.heldSchools;
    if (!schools.some(([id]) => id === s.discipline)) s.discipline = schools.find(([id]) => id === this.player.paths.active)?.[0] ?? schools[0]?.[0] ?? '';
    return s.discipline;
  }
  selectSchool(id: string) {
    if (this.heldSchools.some(([d]) => d === id)) this.player.equip.techniques.discipline = id;
  }
  gesture(slot: TechniqueSlot) {
    return this.input.bindings[SLOT_ACTION[slot]].map(keyName).join(' / ');
  }
  bindings() {
    const id = this.discipline,
      saved = (this.player.equip.techniques.bindings[id] ??= {}),
      available = this.entries.filter((e) => e.discipline === id),
      out: Partial<Record<TechniqueSlot, TechniqueEntry>> = {};
    const used = new Set<string>();
    for (const slot of TECHNIQUE_SLOTS) {
      const e = this.entry(saved[slot] ?? '');
      if (e) {
        out[slot] = e;
        used.add(e.ref);
      }
    }
    for (const slot of TECHNIQUE_SLOTS)
      if (!out[slot]) {
        const e = available.find((e) => !used.has(e.ref) && role(e) === slot) ?? available.find((e) => !used.has(e.ref));
        if (e) {
          out[slot] = e;
          saved[slot] = e.ref;
          used.add(e.ref);
        }
      }
    return out;
  }
  assign(slot: TechniqueSlot, ref: string) {
    if (!this.entry(ref)) return;
    const id = this.discipline;
    const b = (this.player.equip.techniques.bindings[id] ??= {});
    b[slot] = ref;
  }
  cooldown(e: TechniqueEntry) {
    return e.key ? this.runtime.cooldown(e.key) : 0;
  }
  blocked(e: TechniqueEntry) {
    const p = this.player;
    if (p.dead) return 'You are dead';
    if (p.swimming || p.vehicle) return 'Leave the water or helm to use techniques';
    if (e.def) {
      if (e.def.action && e.def.action !== 'sk_dash' && !p.grounded) return 'Land to use this technique';
      return this.runtime.blocked(e.ref);
    }
    const it = p.equip.items.find((i) => `spell:${i.def.id}` === e.ref);
    if (!it) return 'Spell no longer carried';
    if (p.mana < (it.def.stats.manaCost ?? 0)) return 'Not enough mana';
    return p.canAct ? null : 'busy';
  }
  request(ref: string) {
    const e = this.entry(ref);
    if (!e) {
      this.notify('That technique is no longer learned');
      return false;
    }
    const why = this.blocked(e);
    if (why && why !== 'busy') {
      this.notify(why);
      return false;
    }
    this.player.equip.techniques.last = ref;
    this.pending = { ref, left: 0.22 };
    this.tryPending();
    return true;
  }
  private tryPending() {
    const pending = this.pending;
    if (!pending) return;
    const e = this.entry(pending.ref);
    if (!e) {
      this.pending = null;
      return;
    }
    const why = this.blocked(e);
    if (why === 'busy') return;
    if (why) {
      this.pending = null;
      this.notify(why);
      return;
    }
    if (e.def) {
      const result = this.runtime.use(e.ref);
      if (result === 'busy') return;
      if (result) this.notify(result);
    } else {
      const it = this.player.equip.items.find((i) => `spell:${i.def.id}` === e.ref);
      if (it) this.player.useMove(it.uid);
    }
    this.pending = null;
  }
  private swallow(action: Action) {
    for (const code of this.input.bindings[action]) this.input.consume(code);
  }
  record(label: string) {
    this.lastInput = label;
    this.recent.unshift({ label, left: 2.5 });
    this.recent.length = Math.min(5, this.recent.length);
  }
  update(dt: number, enabled = true) {
    this.recent = this.recent.filter((r) => (r.left -= dt) > 0);
    const allowed = enabled && !this.input.uiMode && !this.player.dead && !this.player.vehicle && !this.player.swimming;
    this.player.setTechniqueMode(allowed && this.input.held('technique'));
    if (!allowed) {
      this.pending = null;
      return;
    }
    if (this.player.techniqueMode) {
      const bindings = this.bindings();
      for (const slot of TECHNIQUE_SLOTS) {
        const action = SLOT_ACTION[slot];
        if (this.input.wasPressed(action) || (slot === 'guard' && this.input.wasPressed('parry'))) {
          this.swallow(action);
          if (slot === 'guard') this.swallow('parry');
          this.record(`Technique · ${INPUT_NAMES[slot]}`);
          const e = bindings[slot];
          if (e) this.request(e.ref);
          else this.notify('Learn a technique or choose a discipline in the library');
        }
      }
    } else
      for (const action of ['attack', 'heavy', 'dodge', 'offhand', 'parry', 'jump', 'kick'] as const)
        if (this.input.wasPressed(action)) this.record(action === 'attack' ? 'Light' : action[0].toUpperCase() + action.slice(1));
    for (const [code, ref] of Object.entries(this.player.equip.techniques.shortcuts))
      if (this.input.pressedKey(code) && !this.reserved(code)) {
        this.input.consume(code);
        this.record(keyName(code));
        this.request(ref);
      }
    if (this.pending) {
      this.pending.left -= dt;
      if (this.pending.left < 0) {
        this.pending = null;
        this.notify('Still recovering — try the technique at the next opening');
      } else this.tryPending();
    }
  }
  reserved(code: string) {
    return (
      Object.values(this.input.bindings).flat().includes(code) ||
      ['Escape', 'KeyJ', 'KeyN', 'KeyB', 'KeyL', 'KeyX'].includes(code) ||
      !/^(Key[A-Z]|Digit[0-9]|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Comma|Period|Slash|Minus|Equal)$/.test(code)
    );
  }
  bindKey(code: string, ref: string) {
    if (this.reserved(code) || !this.entry(ref)) return false;
    this.player.equip.techniques.shortcuts[code] = ref;
    return true;
  }
  reset() {
    this.pending = null;
    this.recent = [];
    this.player.setTechniqueMode(false);
    this.invalidate();
  }
}
