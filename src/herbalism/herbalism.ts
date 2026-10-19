import * as THREE from 'three';
import { events } from '../core/events';
import { ITEMS } from '../items/itemDefs';
import { REAGENTS, type Prop } from '../items/reagents';
import { HERBALIST_KIT, brewPrices } from '../items/brews';
import { setGatherModifiers } from '../world/herbs/gatherMods';
import { REAGENT_WANTS } from '../world/herbs/herbFolk';
import { DISC } from '../paths/data';
import { PASSIVES } from '../paths/effects';
import { treeOf, MAX_LEVEL } from '../paths/paths';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { DialogueOption } from '../ui/dialogue';
import type { Interior } from '../world/interior';
import type { Interactable } from '../dungeon/instance';
import { BrewUI } from '../ui/brewUI';
import { RECIPES, RECIPE, BOOKS, BASE_ITEM, BASE_NAME, QUALITY_NAMES, TIER_LEVEL, brewId, parseBrewId, type BaseId, type RecipeDef } from './recipes';
import { resolveMix, quality, tierCap, binderFlasks, mixProps, practiceNeed, type Stir, type MixResult } from './alchemy';
export { practiceNeed };
import { BrewEffects, type EffectsSave } from './brewEffects';
import { Flasks } from './flasks';
import { BuffHud } from './buffHud';
import { buildOutdoorStations, buildInteriorStation, type StationProp } from './stations';

// The Herbalism calling made real (see docs/design/arms-and-crafting.md §5):
//  - progression: gathering (herbGathered) and brewing (brewMade) raise
//    Herbalism by practice, alongside investing XP in the Skills book;
//    level gates which reagent tiers you can work;
//  - knowledge: recipes (from the first lesson, the tree, books, and by
//    experimenting) and each reagent's properties (identified as you go);
//  - brewing at alchemy tables and in the field (the satchel), with a short
//    stir-and-pour step that sets quality;
//  - using what you brew: drink, coat a blade, throw (BrewEffects, Flasks);
//  - the apothecaries' services and the tree's perks.

export type BrewMode = 'station' | 'field';

export interface HerbalismHooks {
  toast(msg: string): void;
  /** quest signal (quests.signal) */
  signal(id: string, n?: number): void;
  /** is a quest signal wanted right now (quests.wants) */
  wants(id: string): boolean;
  /** open a merchant window */
  shop(who: string, title: string, intro: string, stock: [string, number][], wants: [string, number][]): void;
  /** the mentor's teach / respec replies for Wenna (mentorOptions from paths/mentors) */
  mentor?(say: (text: string) => void): DialogueOption[];
  /** the skill runtime's lightning bolt (skillRt.vfx.lightning), optional */
  lightning?(a: THREE.Vector3, b: THREE.Vector3): void;
  save(): void;
}

export interface HerbalismSave {
  known: string[];
  props: Record<string, Prop[]>;
  xp: number;
  stats: { brewed: number; discovered: number; gathered: number; failed: number };
  fx?: EffectsSave;
}

export interface BrewOutcome {
  ok: boolean;
  msg: string;
  recipe?: RecipeDef;
  q?: number;
  qty?: number;
  discovered?: boolean;
  why?: string[];
  xp?: number;
  revealed?: string[];
  lockedBy?: MixResult['lockedBy'];
}


interface Apothecary { name: string; title: string; table: string; intro: string; stock: [string, number][] }
const BASES: [string, number][] = [['springWater', 2], ['grainSpirit', 8], ['pressedOil', 6]];
export const APOTHECARIES: Record<string, Apothecary> = {
  apothecary: {
    name: 'Ilyra Moss', title: 'Apothecary', table: "Ilyra Moss's alchemy table",
    intro: 'Bases, reagents, and the two books every brewer in the Glen started from. Mind the bottom shelf, it bites.',
    stock: [...BASES, [HERBALIST_KIT, 60], ['bookHedgeWitch', 45], ['bookSoldier', 120], ['marigold', 7], ['yarrow', 7], ['chamomile', 8], ['nettle', 7], ['oakmoss', 9], ['riverReed', 4], ['honeycomb', 14], ['slimeGel', 6]],
  },
  quill: {
    name: 'Quill Mereweather', title: 'Alchemist · Fine Draughts', table: "Quill Mereweather's alchemy table",
    intro: 'Sea-remedies and hunters\' tricks. Port prices, port quality, and both are better than the Glen\'s.',
    stock: [...BASES, [HERBALIST_KIT, 70], ['bookMariner', 90], ['bookHuntsman', 110], ['sailorsKelp', 6], ['saltwort', 18], ['venomSac', 20], ['glowmoss', 22], ['bogbean', 22]],
  },
  capAlchemist: {
    name: 'Fenwick Ashgrove', title: 'Alchemist to the Court', table: "Fenwick Ashgrove's alchemy table",
    intro: 'The Collegium\'s own books, and reagents from four corners of the kingdom. Do not lick anything.',
    stock: [...BASES, [HERBALIST_KIT, 80], ['bookSoldier', 120], ['bookNight', 160], ['bookGrey', 220], ['bookCollegium', 300], ['moongrass', 14], ['stoneroot', 22], ['eaglefern', 42], ['frostbloom', 48], ['boneDust', 18]],
  },
  'gh-apoth': {
    name: 'Healer Meritites', title: 'The House of Balms', table: "The House of Balms' alchemy table",
    intro: 'Balms for the sun, salves for the sting, and the flowers that only bloom in the deep sand.',
    stock: [...BASES, [HERBALIST_KIT, 80], ['bookDesert', 140], ['sandSage', 18], ['desertRose', 44], ['emberroot', 20], ['ghostCactus', 95], ['venomSac', 22]],
  },
  wenna: {
    name: 'Wenna Thistledown', title: 'Wandering Herbalist', table: "Wenna's cauldron",
    intro: 'Bases and books. The sickles and gloves are in the other basket.',
    stock: [...BASES, [HERBALIST_KIT, 55], ['bookHedgeWitch', 40]],
  },
};

export class Herbalism {
  readonly effects: BrewEffects;
  readonly flasks: Flasks;
  readonly ui: BrewUI;
  private hud: BuffHud;
  /** recipes learned from books and experiments (basic and tree recipes are derived) */
  readonly known = new Set<string>();
  /** identified reagent properties */
  readonly props: Record<string, Set<Prop>> = {};
  /** practice toward the next Herbalism level */
  xp = 0;
  stats = { brewed: 0, discovered: 0, gathered: 0, failed: 0 };
  private perks: Record<string, number> = {};
  private nodeNames = new Set<string>();
  private hinted = false;
  private props3d: StationProp[] = [];
  private interiorProp: StationProp | null = null;
  /** world interactables (push into realm.overworldInteractables) */
  readonly interactables: Interactable[];
  onToggle?: (open: boolean) => void;

  constructor(scene: THREE.Scene, readonly player: Player, fx: FX, readonly hooks: HerbalismHooks) {
    const owner = { perk: (k: string) => this.perk(k), toast: (m: string) => hooks.toast(m), signal: (id: string) => hooks.signal(id), lightning: hooks.lightning };
    this.effects = new BrewEffects(player, fx, owner);
    this.effects.attach();
    this.flasks = new Flasks(scene, player, fx, this.effects, owner);
    this.hud = new BuffHud(this.effects);
    this.ui = new BrewUI(this);
    this.ui.onToggle = (open) => this.onToggle?.(open);
    // Drinking, coating, throwing and reading go through the player's own "use".
    const use = player.useConsumable.bind(player);
    player.useConsumable = (uid: number) => {
      const it = player.equip.get(uid);
      if (it && this.handles(it.def.id)) this.useItem(uid);
      else use(uid);
    };
    const st = buildOutdoorStations(scene, (s) => this.openStation(s.name));
    this.props3d = st.props;
    this.interactables = st.interactables;
    events.on('pathsChanged', () => this.recompute());
    events.on('herbGathered', ({ id, qty }) => this.onGathered(id, qty));
    events.on('enemyDied', ({ kind }) => {
      if (this.effects.elixirActive) hooks.signal('herb-buffed-kill');
      if (/zombie|skeleton|abomination|wraith|ghost|ghoul|lich|undead/i.test(kind) && this.effects.oils.some((o) => o.fx.baneUndead)) hooks.signal('herb-hallowed-kill');
    });
    this.recompute();
  }

  // ---- the calling ---------------------------------------------------------------------------
  get paths() {
    return this.player.paths;
  }
  get learned() {
    return this.paths.learned('herbalism');
  }
  get level() {
    return this.paths.level('herbalism');
  }
  perk(k: string) {
    return this.perks[k] ?? 0;
  }
  hasNode(name: string) {
    return this.nodeNames.has(name);
  }
  /** Highest reagent tier you can brew with. */
  get tierCap() {
    return tierCap(this.level, this.perk('tierBonus'));
  }
  /** Teach the calling (Wenna's lesson) if it isn't known yet. */
  teach() {
    if (this.learned) return false;
    return this.paths.teach('herbalism');
  }

  /** Sum the learned Herbalism nodes' effects and pass the gathering ones to foraging. */
  private recompute() {
    const perks: Record<string, number> = {};
    const names = new Set<string>();
    const t = treeOf(DISC.herbalism);
    if (t && this.learned) {
      for (const [nid, v] of Object.entries(this.paths.nodes.herbalism ?? {})) {
        const n = t.map[nid];
        if (!n) continue;
        const name = n.type === 'choice' ? n.name.split('|')[v.pick ?? 0] : n.name;
        names.add(name);
        for (const [k, val] of Object.entries(PASSIVES[`herbalism:${name}`]?.x ?? {})) perks[k] = (perks[k] ?? 0) + val;
      }
    }
    this.perks = perks;
    this.nodeNames = names;
    this.syncGathering();
  }

  /** Foraging reads these: more stems, rarer finds, plant properties in the prompt. */
  private syncGathering() {
    const L = this.learned ? this.level : 0;
    setGatherModifiers({
      yieldBonus: this.perk('doubleFind') + (this.effects.buffs.get('forage')?.fx.forage ?? 0),
      rareChance: this.perk('rareFind') + L * 0.004,
      showProps: (id: string) => this.perk('eye') > 0 || (REAGENTS[id]?.props ?? []).every((p) => this.props[id]?.has(p)),
      regrowMul: 1 - Math.min(0.3, L * 0.01),
    });
  }

  // ---- practice ------------------------------------------------------------------------------
  /** Herbalism practice: raises the calling by doing (and its mastery). */
  addPractice(n: number) {
    const P = this.paths;
    if (!this.learned || n <= 0) return;
    n = Math.round(n);
    P.mx.herbalism = (P.mx.herbalism ?? 0) + n;
    this.xp += n;
    let rose = false;
    while (P.lv.herbalism < MAX_LEVEL && this.xp >= practiceNeed(P.lv.herbalism)) {
      this.xp -= practiceNeed(P.lv.herbalism);
      P.lv.herbalism++;
      rose = true;
      const L = P.lv.herbalism;
      events.emit('disciplineLevel', { id: 'herbalism', level: L });
      const tier = TIER_LEVEL.indexOf(L);
      this.hooks.toast(`Herbalism rose to level ${L} through practice${tier > 0 ? ` · you can now work tier ${tier} reagents` : ''}${L % 5 === 0 ? ' · bonus tree point' : ''}`);
    }
    if (P.lv.herbalism >= MAX_LEVEL) this.xp = 0;
    if (rose) {
      // What Paths.syncLevel does: the character level follows the disciplines.
      const cl = P.charLevel;
      if (cl > this.player.prog.level) {
        this.player.prog.level = cl;
        events.emit('levelUp', { level: cl });
      }
      events.emit('pathsChanged', {});
      events.emit('progressChanged', {});
    }
  }

  private onGathered(id: string, qty: number) {
    const info = REAGENTS[id];
    if (!info) return;
    this.stats.gathered += qty;
    if (!this.learned) {
      if (!this.hinted) {
        this.hinted = true;
        this.hooks.toast('Wenna Thistledown, camped on the Crown Road, could teach you to brew with that (Herbalism).');
      }
      return;
    }
    this.addPractice(4 * info.tier * qty);
    // Identify as you gather: the plant's first property, or all of them with Wenna's almanac.
    const all = this.count('herbAlmanac') > 0;
    const before = this.knownProps(id).length;
    this.identify(id, all ? info.props : info.props.slice(0, 1));
    if (this.knownProps(id).length > before && before === 0) this.hooks.toast(`Identified ${this.nameOf(id)}: ${this.knownProps(id).join(', ')}`);
    this.hooks.signal('herb-gather');
  }

  // ---- knowledge -----------------------------------------------------------------------------
  knows(id: string) {
    const r = RECIPE[id];
    if (!r || !this.learned) return false;
    return this.known.has(id) || (!!r.src.basic) || (!!r.src.node && this.nodeNames.has(r.src.node));
  }
  knownRecipes() {
    return RECIPES.filter((r) => this.knows(r.id));
  }
  learnRecipe(id: string) {
    if (this.knows(id)) return false;
    this.known.add(id);
    return true;
  }
  identify(id: string, props: readonly Prop[]) {
    const s = (this.props[id] ??= new Set());
    let added = false;
    for (const p of props) if (!s.has(p)) (s.add(p), (added = true));
    if (added) this.syncGathering();
    return added;
  }
  propKnown(id: string, p: Prop) {
    return this.perk('eye') > 0 || !!this.props[id]?.has(p);
  }
  knownProps(id: string): Prop[] {
    return (REAGENTS[id]?.props ?? []).filter((p) => this.propKnown(id, p));
  }
  /** Taste a reagent: use one up to learn one property you didn't know. */
  taste(id: string): string {
    const hidden = (REAGENTS[id]?.props ?? []).filter((p) => !this.propKnown(id, p));
    if (!hidden.length) return `You already know everything ${this.nameOf(id)} has to teach.`;
    if (this.count(id) < 1) return `You have no ${this.nameOf(id)} to taste.`;
    this.take(id, 1);
    this.identify(id, [hidden[0]]);
    this.addPractice(2);
    return `You chew a little ${this.nameOf(id)}. Unmistakably: ${hidden[0]}.`;
  }
  nameOf(id: string) {
    return ITEMS[id]?.name ?? id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  }
  /** Reagents the player carries (any tier), most first. */
  pouch(): { id: string; n: number }[] {
    const m = new Map<string, number>();
    for (const it of this.player.equip.items) if (REAGENTS[it.def.id]) m.set(it.def.id, (m.get(it.def.id) ?? 0) + it.qty);
    return [...m].map(([id, n]) => ({ id, n })).sort((a, b) => (REAGENTS[a.id].tier - REAGENTS[b.id].tier) || a.id.localeCompare(b.id));
  }

  // ---- inventory -----------------------------------------------------------------------------
  count(id: string) {
    return this.player.equip.items.filter((i) => i.def.id === id).reduce((n, i) => n + i.qty, 0);
  }
  take(id: string, n: number) {
    const eq = this.player.equip;
    for (const it of [...eq.items]) {
      if (n <= 0) break;
      if (it.def.id !== id) continue;
      const k = Math.min(n, it.qty);
      it.qty -= k;
      n -= k;
      if (it.qty <= 0) {
        eq.items.splice(eq.items.indexOf(it), 1);
        eq.quick = eq.quick.map((u) => (u === it.uid ? null : u));
      }
    }
    events.emit('equipmentChanged', {});
  }
  give(id: string, n: number) {
    if (!ITEMS[id] || n <= 0) return;
    this.player.equip.add(id, n);
    events.emit('equipmentChanged', {});
  }

  // ---- brewing -------------------------------------------------------------------------------
  /** Does this base come free here? */
  baseFree(base: BaseId, mode: BrewMode) {
    return mode === 'station' && (base === 'water' || this.perk('distiller') > 0);
  }
  /** Why this pot can't be brewed (null: it can). */
  check(ings: string[], base: BaseId, mode: BrewMode): string | null {
    if (!this.learned) return 'You know nothing of brewing yet. Wenna Thistledown on the Crown Road teaches Herbalism.';
    if (mode === 'field' && this.perk('noField') > 0) return 'A Master Brewer works only at a proper alchemy table.';
    if (mode === 'field' && this.count(HERBALIST_KIT) < 1) return "You need a Herbalist's Satchel to brew in the field.";
    if (ings.length < 2) return 'Put at least two reagents in the pot.';
    if (ings.length > 4) return 'Four reagents at most.';
    const need = new Map<string, number>();
    for (const id of ings) need.set(id, (need.get(id) ?? 0) + 1);
    for (const [id, n] of need) {
      if (this.count(id) < n) return `You don't have ${n > 1 ? n + ' ' : ''}${this.nameOf(id)}.`;
      const t = REAGENTS[id]?.tier ?? 1;
      if (t > this.tierCap) return `${this.nameOf(id)} is a tier ${t} reagent: it needs Herbalism ${TIER_LEVEL[Math.max(1, t - this.perk('tierBonus'))]}.`;
    }
    if (!this.baseFree(base, mode) && this.count(BASE_ITEM[base]) < 1) return `You need ${BASE_NAME[base]} as the base.`;
    return null;
  }

  /** What the pot will make (for the bench preview). */
  preview(ings: string[], base: BaseId, mode: BrewMode) {
    const mix = resolveMix(ings, base, (id) => this.knows(id));
    const allKnown = this.perk('eye') > 0 || ings.every((id) => (REAGENTS[id]?.props ?? []).every((p) => this.propKnown(id, p)));
    const q = mix.recipe ? quality({ stir: 'good', station: mode === 'station', level: this.level, recipe: mix.recipe, ings, perks: (k) => this.perk(k) }) : null;
    return { mix, allKnown, q, batch: mix.recipe ? this.batchSize(mix.recipe, ings, mode) : 0 };
  }

  batchSize(r: RecipeDef, ings: string[], mode: BrewMode) {
    if (mode === 'field') return 1;
    let n = r.cat === 'bomb' ? 2 : 1;
    if (this.perk('batch') > 0) n += r.cat === 'tonic' ? 2 : 1;
    if (r.cat === 'elixir' && this.perk('elixirBatch') > 0) n *= 2;
    return n + binderFlasks(r, ings);
  }

  /** Brew: uses up the reagents and the base, and gives the flasks. */
  brew(ings: string[], base: BaseId, stir: Stir, mode: BrewMode): BrewOutcome {
    const why = this.check(ings, base, mode);
    if (why) return { ok: false, msg: why };
    const mix = resolveMix(ings, base, (id) => this.knows(id));
    for (const id of ings) this.take(id, 1);
    if (!this.baseFree(base, mode)) this.take(BASE_ITEM[base], 1);
    const revealed: string[] = [];
    const reveal = (id: string, p: Prop) => {
      if (this.identify(id, [p])) revealed.push(`${this.nameOf(id)}: ${p}`);
    };
    if (!mix.recipe) {
      // Sludge. Something is learned anyway.
      this.stats.failed++;
      this.give('murkySludge', 1);
      const hiddenOf = (id: string) => (REAGENTS[id]?.props ?? []).filter((p) => !this.propKnown(id, p));
      if (this.perk('mixologist') > 0) {
        for (const id of new Set(ings)) {
          const h = hiddenOf(id);
          if (h.length) reveal(id, h[0]);
        }
        for (const id of ings.slice(0, Math.floor(ings.length / 2))) this.give(id, 1);
      } else {
        const pick = [...new Set(ings)].find((id) => hiddenOf(id).length);
        if (pick) reveal(pick, hiddenOf(pick)[0]);
      }
      this.addPractice(4);
      this.hooks.signal('herb-experiment');
      return { ok: true, msg: mix.lockedBy ? `The mixture curdles. You sense a deeper brew in these reagents: ${mix.lockedBy.recipe.name}. The Herbalism tree's "${mix.lockedBy.node}" would teach it.` : 'The mixture curdles into murky sludge. The properties fought, and nobody won.', revealed, lockedBy: mix.lockedBy, xp: 4 };
    }
    const r = mix.recipe;
    const { q, why: reasons } = quality({ stir, station: mode === 'station', level: this.level, recipe: r, ings, perks: (k) => this.perk(k) });
    const qty = this.batchSize(r, ings, mode);
    this.give(brewId(r.id, q), qty);
    // The properties that made it are now known.
    for (const id of ings) for (const p of REAGENTS[id]?.props ?? []) if (p in r.needs) reveal(id, p);
    if (this.perk('mixologist') > 0) for (const id of new Set(ings)) {
      const h = (REAGENTS[id]?.props ?? []).find((p) => !this.propKnown(id, p));
      if (h) reveal(id, h);
    }
    let xp = Math.round(10 * r.tier * (0.8 + 0.2 * q));
    if (mix.discovered) {
      this.known.add(r.id);
      this.stats.discovered++;
      xp += 40 * r.tier;
      this.hooks.signal('herb-discover');
    }
    this.stats.brewed++;
    this.addPractice(xp);
    events.emit('brewMade', { id: r.id, quality: q, qty });
    this.hooks.signal('herb-brew');
    this.hooks.signal(`herb-brew-${r.id}`);
    this.hooks.save();
    const name = `${QUALITY_NAMES[q]} ${r.name}`;
    return { ok: true, msg: `${mix.discovered ? 'Discovered! ' : ''}${name}${qty > 1 ? ` ×${qty}` : ''}`, recipe: r, q, qty, discovered: mix.discovered, why: reasons, xp, revealed, lockedBy: mix.lockedBy };
  }

  /** The reagents in your pouch that best make a recipe (null if you lack them). */
  autofill(r: RecipeDef): string[] | null {
    const cap = this.tierCap;
    const have = new Map(this.pouch().filter((x) => (REAGENTS[x.id]?.tier ?? 9) <= cap).map((x) => [x.id, x.n]));
    const pot: string[] = [];
    const use = (id: string) => {
      pot.push(id);
      have.set(id, (have.get(id) ?? 0) - 1);
    };
    if (r.key) {
      const k = r.key.find((id) => (have.get(id) ?? 0) > 0);
      if (!k) return null;
      use(k);
    }
    const missing = () => {
      const m = mixProps(pot);
      return (Object.entries(r.needs) as [Prop, number][]).filter(([p, n]) => (m[p] ?? 0) < n).map(([p]) => p);
    };
    while (pot.length < 4) {
      const miss = missing();
      if (!miss.length) break;
      // Best next reagent: covers the most missing properties, fewest strays, then the commonest.
      let best: string | null = null, score = -1e9;
      for (const [id, n] of have) {
        if (n <= 0) continue;
        const props = REAGENTS[id].props;
        const cover = props.filter((p) => miss.includes(p)).length;
        if (!cover) continue;
        const stray = props.filter((p) => !(p in r.needs) && p !== 'binder' && p !== 'potency').length;
        const s = cover * 10 - stray * 3 + (props.includes('potency') ? 2 : 0) + Math.min(5, n) * 0.1;
        if (s > score) (score = s), (best = id);
      }
      if (!best) return null;
      use(best);
    }
    if (missing().length) return null;
    if (pot.length < 2) {
      // Recipes one reagent satisfies still take two: double it, or add a potency or binder.
      const extra = [...have].find(([id, n]) => n > 0 && id === pot[0]) ?? [...have].find(([id, n]) => n > 0 && (REAGENTS[id].props.includes('potency') || REAGENTS[id].props.every((p) => p in r.needs)));
      if (!extra) return null;
      use(extra[0]);
    }
    return pot;
  }

  // ---- using what you brewed ------------------------------------------------------------------
  handles(defId: string) {
    return !!parseBrewId(defId) || defId === HERBALIST_KIT || BOOKS.some((b) => b.id === defId);
  }
  useItem(uid: number) {
    const p = this.player;
    const it = p.equip.get(uid);
    if (!it || p.dead) return;
    const id = it.def.id;
    if (id === HERBALIST_KIT) return this.openField();
    const book = BOOKS.find((b) => b.id === id);
    if (book) {
      if (!this.learned) return this.hooks.toast('The recipes are gibberish to you. Learn Herbalism first (Wenna Thistledown, the Crown Road).');
      const fresh = book.recipes.filter((r) => this.learnRecipe(r));
      p.equip.consume(uid);
      events.emit('equipmentChanged', {});
      this.addPractice(25 * fresh.length);
      this.hooks.toast(fresh.length ? `${book.name}: learned ${fresh.map((r) => RECIPE[r].name).join(', ')}` : `${book.name}: you knew every recipe in it already.`);
      this.hooks.save();
      return;
    }
    const b = parseBrewId(id);
    if (!b) return;
    const why = b.recipe.cat === 'oil' ? this.effects.coat(b.recipe, b.q) : b.recipe.cat === 'bomb' ? this.flasks.throw(b.recipe, b.q) : this.effects.drink(b.recipe, b.q);
    if (why) {
      if (why !== 'busy') this.hooks.toast(why);
      return;
    }
    p.equip.consume(uid);
    events.emit('equipmentChanged', {});
    if (b.recipe.family === 'forage') this.syncGathering();
  }

  // ---- stations and services ------------------------------------------------------------------
  openStation(name: string) {
    this.ui.open('station', name);
  }
  openField() {
    if (this.perk('noField') > 0) return this.ui.open('codex', "Herbalist's Satchel");
    this.ui.open('field', "Herbalist's Satchel");
  }
  openCodex() {
    this.ui.open('codex', 'Herbal');
  }
  get isOpen() {
    return this.ui.isOpen;
  }

  /** Build the alchemy table into a shop room (call from realm.onInterior); null when there's none. */
  interiorStation(it: Interior): Interactable | null {
    const s = buildInteriorStation(it, (name) => this.openStation(name));
    this.interiorProp = s?.prop ?? null;
    return s?.interactable ?? null;
  }
  leaveInterior() {
    this.interiorProp = null;
  }

  /** Extra dialogue replies for the apothecaries and Wenna. */
  serviceOptions(npcId: string, show: (text: string, opts: DialogueOption[]) => void, back: () => void): DialogueOption[] {
    const a = APOTHECARIES[npcId];
    if (!a) return [];
    const out: DialogueOption[] = [];
    const H = this.hooks;
    if (npcId === 'wenna') {
      out.push(...(H.mentor?.((t) => show(t, [{ label: 'Back.', run: back }])) ?? []));
      out.push({ label: 'Tell me about brewing.', run: () => show(WENNA_LORE, [{ label: 'And toxicity?', run: () => show(WENNA_TOX, [{ label: 'Back.', run: back }]) }, { label: 'Back.', run: back }]) });
    }
    if (this.learned || npcId !== 'wenna') out.push({ label: npcId === 'wenna' ? 'Brew at your cauldron' : 'Work at the alchemy table', run: () => this.openStation(a.table) });
    out.push({
      label: 'Browse herbal supplies (bases, books, reagents)',
      run: () => H.shop(a.name, a.title, a.intro, a.stock, [...brewPrices(), ...REAGENT_WANTS]),
    });
    // Quest hand-ins.
    const tonics = () => [3, 4, 5].reduce((n, q) => n + this.count(brewId('healingTonic', q)), 0);
    const takeBest = (recipe: string, n: number, minQ: number) => {
      for (let q = minQ; q <= 5 && n > 0; q++) {
        const k = Math.min(n, this.count(brewId(recipe, q)));
        if (k) this.take(brewId(recipe, q), k);
        n -= k;
      }
    };
    if (npcId === 'apothecary' && H.wants('herb-ilyra-tonics')) {
      out.push({
        label: `Hand over three Fine Healing Tonics (${Math.min(3, tonics())}/3)`,
        run: () => {
          if (tonics() < 3) return show('Three, of Fine quality or better. A Crude tonic is just a warm drink with ambitions.', [{ label: 'Back.', run: back }]);
          takeBest('healingTonic', 3, 3);
          H.signal('herb-ilyra-tonics');
          show('Clear colour, clean smell. These will go to the Watch tonight. You have good hands for this.', [{ label: 'Back.', run: back }]);
        },
      });
    }
    if (npcId === 'quill' && H.wants('herb-quill-elixir')) {
      const best = this.player.equip.items.find((i) => {
        const b = parseBrewId(i.def.id);
        return b && b.recipe.cat === 'elixir' && b.q >= 4;
      });
      out.push({
        label: best ? `Show Quill your ${best.def.name}` : 'Show Quill an elixir (Superior or better)',
        run: () => {
          if (!best) return show('Superior or better, I said. I can see a Common elixir from across the market.', [{ label: 'Back.', run: back }]);
          this.take(best.def.id, 1);
          H.signal('herb-quill-elixir');
          show(`He holds the ${best.def.name} to the light, sniffs it, and goes quiet for a long moment. "...Fine. Fine! It's good. Better than mine. Don't tell anyone."`, [{ label: 'Back.', run: back }]);
        },
      });
    }
    if (npcId === 'gh-apoth' && H.wants('herb-meritites-fireward')) {
      const n = [1, 2, 3, 4, 5].reduce((s, q) => s + this.count(brewId('fireward', q)), 0);
      out.push({
        label: `Hand over two Fireward Draughts (${Math.min(2, n)}/2)`,
        run: () => {
          if (n < 2) return show('Two draughts of fireward, friend. The sun does not wait.', [{ label: 'Back.', run: back }]);
          takeBest('fireward', 2, 1);
          H.signal('herb-meritites-fireward');
          show('Cool as well water. The quarry gangs will live through the noon shift now. The House of Balms is in your debt.', [{ label: 'Back.', run: back }]);
        },
      });
    }
    return out;
  }

  // ---- per step / frame -----------------------------------------------------------------------
  /** Simulation step: AFTER skillRt.update (it rewrites player.mods; the brews add on top). */
  update(dt: number) {
    const hadForage = this.effects.buffs.has('forage');
    this.effects.update(dt);
    this.effects.applyMods(this.player.mods);
    this.flasks.update(dt);
    if (hadForage !== this.effects.buffs.has('forage')) this.syncGathering();
  }
  /** Render frame: HUD and the stations' flames. */
  frame(dt: number) {
    this.hud.update(dt);
    this.ui.frame(dt);
    for (const p of this.props3d) p.update(dt);
    this.interiorProp?.update(dt);
  }
  setVisible(v: boolean) {
    for (const p of this.props3d) p.group.visible = v;
    this.flasks.setVisible(v);
  }

  // ---- save -----------------------------------------------------------------------------------
  toJSON(): HerbalismSave {
    const props: Record<string, Prop[]> = {};
    for (const [id, s] of Object.entries(this.props)) if (s.size) props[id] = [...s];
    return { known: [...this.known], props, xp: this.xp, stats: { ...this.stats }, fx: this.effects.toJSON() };
  }
  fromJSON(s: HerbalismSave | undefined) {
    this.known.clear();
    for (const k of Object.keys(this.props)) delete this.props[k];
    this.xp = 0;
    this.stats = { brewed: 0, discovered: 0, gathered: 0, failed: 0 };
    if (s) {
      for (const id of s.known ?? []) if (RECIPE[id]) this.known.add(id);
      for (const [id, ps] of Object.entries(s.props ?? {})) if (REAGENTS[id]) this.props[id] = new Set(ps.filter((p) => REAGENTS[id].props.includes(p)));
      this.xp = Math.max(0, s.xp ?? 0);
      this.stats = { ...this.stats, ...s.stats };
    }
    this.effects.fromJSON(s?.fx);
    this.recompute();
  }
}

const WENNA_LORE = "Every plant has its virtues: heal, mana, stamina, strength, ward, speed, fire, frost, poison, cure, and the rarer ones. A brew is virtues added up, two to four plants in a base. Water for tonics and draughts, grain spirit for elixirs and flasks, pressed oil for blade oils.\n\nPick a recipe you know and the bench will find the plants. Or experiment: throw in what you have, and if the virtues add up to something you've never made, you'll have found it. Watch the pot as you stir. When the colour turns, pour. Pour too soon or too late and you'll get a Crude brew.";
const WENNA_TOX = "Toxicity. Every elixir you drink sits in your blood while it works, and tonics leave a little behind that drains away. Too much and you overdose: weak limbs, short breath, a slow sickness. A Purging Draught clears the lingering part. You'll learn to carry more as you go, and the old masters say a Philosopher never overdoses at all.";
