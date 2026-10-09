import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { events } from '../../core/events';
import { ITEMS } from '../../items/itemDefs';
import { ElvenForest, type ElfHooks, type Gather } from './elvenForest';
import { LostWoods } from './lostWoods';
import { SITES, type P2 } from './elvenForestData';
import { ELF_QUESTS } from '../../quests/elfQuests';
import type { WorldMats } from '../buildings';
import type { Door } from '../doors';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { QuestLog } from '../../quests/questLog';
import type { NpcManager } from '../../npc/npcManager';
import type { Interactable } from '../../dungeon/instance';
import type { ShopOpts } from '../../ui/shopUI';

// The Verdant Elves, wired into the game (docs/design/verdant-elves.md).
// main.ts builds this once with the scene (so the forest's clearings reach
// the vegetation), then `wire()` hands it the quest log, the townsfolk, the
// services and the HUD once they exist. From then on it runs in two calls a
// tick: step() in the simulation and frame() per drawn frame.

type Show = (t: string, opts: { label: string; run: () => void }[]) => void;
type Service = (show: Show, back: () => void) => { label: string; run: () => void }[];

export interface ElvesContext {
  quests: QuestLog;
  npcs: NpcManager;
  player: Player;
  folkServices: Map<string, Service>;
  interactables: Interactable[];
  flags: Record<string, boolean | number | string>;
  toast(msg: string): void;
  card(title: string, sub: string, first: boolean): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  fade(on: boolean): Promise<void>;
  give(id: string, n: number): void;
  count(id: string): number;
  take(id: string, n: number): void;
  hour(): number;
  hours(): number;
  /** sleep until morning at an inn */
  sleep(): void;
  save(): void;
  talk(who: string, title: string, text: string, opts: { label: string; run: () => void }[]): void;
  close(): void;
  shop(who: string, title: string, intro: string, stock: [string, number][], extra?: Partial<ShopOpts>): void;
  /** open a closed road (the Greenwood Road's marker stone) */
  openRoad(id: string): void;
  addDoors(doors: Door[]): void;
  dismount(): void;
}

export class Elves {
  readonly forest: ElvenForest;
  readonly lost: LostWoods;
  readonly hooks: ElfHooks;
  private ctx: ElvesContext | null = null;
  private pendingDoors: Door[] = [];
  /** flags before the game's own (saved) ones are wired in */
  private bootFlags: Record<string, boolean | number | string> = {};
  private leadFox: import('../../enemies/forest/forestCreature').ForestCreature | null = null;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, mats: WorldMats, fx: FX) {
    const self = this;
    // Late-bound: until wire() these only record (doors) or do nothing.
    this.hooks = {
      toast: (m) => self.ctx?.toast(m),
      card: (t, s, f) => self.ctx?.card(t, s, f),
      bossBar: (t, n) => self.ctx?.bossBar(t, n),
      get flags() {
        return self.ctx?.flags ?? self.bootFlags;
      },
      give: (id, n) => self.ctx?.give(id, n),
      count: (id) => self.ctx?.count(id) ?? 0,
      take: (id, n) => self.ctx?.take(id, n),
      addGold: (n) => self.ctx?.player.prog.addGold(n),
      hour: () => self.ctx?.hour() ?? 12,
      hours: () => self.ctx?.hours() ?? 12,
      save: () => self.ctx?.save(),
      signal: (id) => self.ctx?.quests.signal(id) ?? false,
      wants: (id) => self.ctx?.quests.wants(id) ?? false,
      isDone: (q) => self.ctx?.quests.isDone(q) ?? false,
      isActive: (q) => self.ctx?.quests.isActive(q) ?? false,
      talk: (w, t, x, o) => self.ctx?.talk(w, t, x, o),
      close: () => self.ctx?.close(),
      origin: () => String(self.ctx?.player.prog.origin ?? ''),
      addDoors: (d) => (self.ctx ? self.ctx.addDoors(d) : self.pendingDoors.push(...d)),
    };
    this.forest = new ElvenForest(scene, renderer, mats, fx, this.hooks);
    const hooks = this.hooks;
    this.lost = new LostWoods(scene, {
      get flags() {
        return hooks.flags;
      },
      hours: () => this.hooks.hours(),
      origin: () => this.hooks.origin(),
      count: (id) => this.hooks.count(id),
      dungeoneering: () => self.ctx?.player.paths.level('dungeoneering') ?? 0,
      toast: (m) => this.hooks.toast(m),
      fade: (on) => self.ctx?.fade(on) ?? Promise.resolve(),
      teleport: (p) => self.ctx?.player.teleport(p),
      destination: () => this.guideDestination(),
    });
  }

  get clearings() {
    return this.forest.clearings;
  }

  /** Where Nimri's lights lead: Silverbough until you've found it, the lost hunter, then the Sanctum. */
  private guideDestination(): P2 | null {
    const q = this.ctx?.quests;
    if (!q) return null;
    if (q.isActive('the-guides-token') && !q.isActive('the-guides-token', 4) && (q.state['the-guides-token']?.stage ?? 0) === 0) return SITES.silverbough;
    if (q.isActive('lost-hunter', 0)) return SITES.lostHunter;
    if (!this.hooks.flags['elves:seenSilverbough']) return SITES.silverbough;
    return SITES.worldTree;
  }

  /** Everything the forest needs from the rest of the game. Call once, before quests load. */
  wire(ctx: ElvesContext) {
    this.ctx = ctx;
    if (this.pendingDoors.length) ctx.addDoors(this.pendingDoors.splice(0));
    const { quests, npcs } = ctx;
    for (const s of this.forest.settlements) {
      npcs.addSettlement(s.settlement);
      for (const rec of s.records) npcs.add(rec);
    }
    quests.add(...ELF_QUESTS);
    this.wireQuests();
    this.wireServices();
    this.wireInteractables();
    events.on('placeDiscovered', ({ id }) => {
      if (id === 'silverbough') ctx.flags['elves:seenSilverbough'] = true;
      if ((id === 'elvenSanctum' || id === 'moonlightGlade') && !ctx.flags['deed:place:' + id]) {
        ctx.flags['deed:place:' + id] = true;
        events.emit('deed', { id: 'place:' + id, renown: 1, label: id === 'elvenSanctum' ? 'Walked under the World Tree, in the Elven Sanctum' : 'Stood in the ring of Moonlight Glade' });
      }
    });
  }

  private wireQuests() {
    const { quests, flags } = this.ctx!;
    quests.hooks.set('the-marker-stone:done', () => this.ctx!.openRoad('forest'));
    quests.hooks.set('the-guides-token:done', () => (flags['elves:token'] = true));
    quests.hooks.set('lost-hunter:done', () => (flags['elves:tobinHome'] = true));
    quests.hooks.set('what-the-stars-say:done', () => {
      if (flags['deed:chapter:what-the-stars-say']) return;
      flags['deed:chapter:what-the-stars-say'] = true;
      events.emit('deed', { id: 'chapter:what-the-stars-say', renown: 3, label: 'Read the wheel-cutters’ star-chart at Moonlight Glade (Act IV, part one)' });
    });
    quests.hooks.set('elves:foxLead', () => this.spawnLeadFox());
    // Gant the Burner's death proves you to the sentinel.
    events.on('enemyDied', ({ kind }) => {
      if (kind === 'charcoalChief' && quests.wants('marker-proven')) {
        quests.signal('marker-proven');
        this.ctx!.toast('With Gant fallen, the burners scatter. The sentinel will hear of it.');
      }
    });
  }

  /** The thieving fox waits at the spring and leads you to its glade. */
  private spawnLeadFox() {
    if (this.leadFox?.alive) return;
    const [x, z] = SITES.spring;
    const f = this.forest.threats.spawn('spiritFox', x + 6, z + 4);
    f.leadTo = new THREE.Vector3(SITES.foxGlade[0], 0, SITES.foxGlade[1]);
    f.lockable = false;
    this.leadFox = f;
  }

  private wireServices() {
    const c = this.ctx!;
    const { folkServices: fs, quests, flags } = c;
    const priceK = (who: 'thornwick' | 'silverbough') => (flags['elves:quarrel'] === 'loggers' ? (who === 'thornwick' ? 0.85 : 1.15) : flags['elves:quarrel'] === 'elves' ? (who === 'thornwick' ? 1.1 : 0.85) : 1);
    const stock = (who: 'thornwick' | 'silverbough', list: [string, number][]) => list.map(([id, p]) => [id, Math.round(p * priceK(who))] as [string, number]);
    fs.set('bram', (show, back) => [
      {
        label: 'A bed for the night — 14g',
        run: () => {
          if (c.player.prog.gold < 14) return show('Fourteen, friend. Logs don’t pay for themselves.', [{ label: 'Back.', run: back }]);
          c.player.prog.addGold(-14);
          c.sleep();
          show('You sleep under a roof of pine boughs and wake to the sound of the saw. It is seven in the morning.', [{ label: 'Good morning.', run: () => c.close() }]);
        },
      },
      { label: 'Browse the Rest’s larder', run: () => c.shop('Bram Oakes', 'Keeper of the Woodsman’s Rest', 'Waybread from the elves, when Nimri brings it. Stew from us.', stock('thornwick', [['elvenWaybread', 20], ['healthPotion', 22], ['apple', 5]])) },
    ]);
    fs.set('ashgrove', () => [{ label: 'Browse Thornwick Stores', run: () => c.shop('Mother Ashgrove', 'Thornwick Stores', 'Rope, oil, axes and salt.', stock('thornwick', [['woodsmansAxe', 40], ['healthPotion', 22], ['manaPotion', 26], ['elvenWaybread', 20]]), { wants: [['ironbark', 40], ['heartwood', 120], ['moonblossom', 22]] }) }]);
    fs.set('hesk', () => [{ label: 'Trade at the mill', run: () => c.shop('Old Hesk', 'Sawyer of Thornwick Mill', 'Planks for shipwrights, ironbark for anyone who can pay.', stock('thornwick', [['planks', 6], ['ironbark', 70]]), { wants: [['ironbark', 45], ['planks', 3]] }) }]);
    fs.set('nimri', (show, back) => {
      const out: { label: string; run: () => void }[] = [];
      if (this.lost.guided) out.push({ label: 'How long are you with me?', run: () => show(`Until ${Math.round(Number(flags['elves:guideUntil']) % 24)}:00 tomorrow, more or less. Keep walking, I’ll keep up.`, [{ label: 'Good.', run: back }]) });
      else out.push({
        label: 'Hire me as your guide for a day — 30g',
        run: () => {
          if (c.player.prog.gold < 30) return show('Thirty. I don’t walk the Lost Woods for love. Mostly.', [{ label: 'Back.', run: back }]);
          c.player.prog.addGold(-30);
          this.lost.hire(24);
          c.save();
          show('Then I’m yours till this time tomorrow. Keep close, follow the lights, and if the trees start looking familiar, tell me.', [{ label: 'Lead on.', run: () => c.close() }]);
        },
      });
      if (quests.wants('marker-proven') && flags['elves:grainGift']) out.push({
        label: 'Carry Thornwick’s peace-gift to the stone with me.',
        run: () => {
          quests.signal('marker-proven');
          show('Grain and an apology, carried by a human and a half-elf. Aelrin will hate how much he likes it. Go and tell him.', [{ label: 'Thank you.', run: back }]);
        },
      });
      return out;
    });
    fs.set('corwen', (show, back) => {
      const out: { label: string; run: () => void }[] = [];
      if (quests.wants('marker-proven') && !flags['elves:grainGift']) out.push({
        label: 'Send the elves Thornwick’s grain as a peace-gift (60g)',
        run: () => {
          if (c.player.prog.gold < 60) return show('Sixty gold buys the grain. I’m not paying the elves to keep my road shut.', [{ label: 'Back.', run: back }]);
          c.player.prog.addGold(-60);
          flags['elves:grainGift'] = true;
          show('Grain. To the elves. My father would spit. Fine: it’s loaded. Take Nimri with you, they listen to her.', [{ label: 'Thanks.', run: back }]);
        },
      });
      if (quests.wants('quarrel-settled')) out.push(
        {
          label: 'Ask the loggers to pull back from the Hollow Grove.',
          run: () => this.settleQuarrel('elves', () => show('Pull back. From the best oak in the north. … For the road, then, and the elves’ leave. The Hollow Grove stays standing. Don’t expect me to like it, and don’t expect our prices to.', [{ label: 'Thank you, Corwen.', run: back }])),
        },
        {
          label: 'Ask the elves to give up the Hollow Grove to the loggers.',
          run: () => this.settleQuarrel('loggers', () => show('They’ll give it up? Ha! Then Thornwick eats this winter. Tell Caelith we’ll cut only the marked trees. Mostly. And the Rest’s prices drop for you, friend.', [{ label: 'Good.', run: back }])),
        },
      );
      return out;
    });
    fs.set('caelith', () => [{ label: 'Trade with Silverbough', run: () => c.shop('Elder Caelith', 'Elder of Silverbough', 'We trade little and slowly. Herbs, bows, the moon’s flowers.', stock('silverbough', [['elvenShortbow', 160], ['moonblossomTonic', 40], ['elvenWaybread', 14], ['moonblossom', 30]]), { wants: [['ironOre', 16], ['wheat', 8], ['ironIngot', 30]] }) }]);
    fs.set('thessaly', (show, back) => [{
      label: c.player.paths.learned('windcaller') ? 'Teach me the wind’s older songs.' : 'Teach me Windcaller.',
      run: () => {
        const P = c.player.paths;
        if (!P.learned('windcaller')) {
          P.teach('windcaller');
          c.toast('Learned Windcaller · open Skills (K) to invest XP');
          return show('Close your eyes. Listen to the branches. The wind is not a servant; it is a neighbour. Ask it.', [{ label: 'I hear it.', run: back }]);
        }
        show('Your Windcaller is at level ' + P.level('windcaller') + '. The wind remembers who asks often. Come back when you have asked more.', [{ label: 'Back.', run: back }]);
      },
    }]);
    fs.set('sylwen', (show, back) => [{
      label: c.player.paths.learned('lightbinder') ? 'Teach me the light of the stars.' : 'Teach me Lightbinder.',
      run: () => {
        const P = c.player.paths;
        if (!P.learned('lightbinder')) {
          P.teach('lightbinder');
          c.toast('Learned Lightbinder · open Skills (K) to invest XP');
        }
        show('Starlight is the oldest light there is. It was old before your sun. Bind a little of it, and keep it.', [{ label: 'Back.', run: back }]);
      },
    }]);
    fs.set('tobin', (show, back) => (flags['elves:tobinHome'] ? [] : [{ label: 'Are you hurt?', run: () => show('Only my pride. And my feet.', [{ label: 'Back.', run: back }]) }]));
  }

  /** The loggers' quarrel ends one of two ways: the Hollow Grove stands (elves) or falls (loggers). */
  settleQuarrel(side: 'elves' | 'loggers', then?: () => void) {
    const c = this.ctx!;
    c.flags['elves:quarrel'] = side;
    c.quests.signal('quarrel-settled');
    this.forest.applyQuarrel();
    c.save();
    then?.();
  }

  private wireInteractables() {
    const c = this.ctx!;
    const { quests, flags } = c;
    const hasAxe = () => c.count('woodsmansAxe') > 0 || c.player.equip.items.some((i) => (i.def.kind as string) === 'axe');
    for (const g of this.forest.gathers) {
      c.interactables.push({
        pos: g.pos, radius: g.kind === 'heartwood' ? 4 : 2.6,
        label: () => this.gatherLabel(g, hasAxe()),
        enabled: () => this.forest.ready(g) && (g.kind !== 'moonblossom' || this.open()) && (!g.sleeper || this.forest.threats.treants.has(g.id)),
        action: () => this.gather(g, hasAxe()),
      });
    }
    // The fox's cache in its glade.
    const fg = SITES.foxGlade;
    c.interactables.push({
      pos: new THREE.Vector3(fg[0], heightAt(fg[0], fg[1]), fg[1]), radius: 3,
      label: () => 'Search the fox’s cache',
      enabled: () => quests.isActive('fox-who-stole', 1) && c.count('silverBell') === 0,
      action: () => {
        c.give('silverBell', 1);
        c.toast('Among a nest of bright things (a spoon, a button, a ring of brass) lies the silver bell.');
      },
    });
    void flags;
  }

  /** Moonblossoms are open (night). */
  private open() {
    const h = this.hooks.hour();
    return h >= 20 || h < 5;
  }

  private gatherLabel(g: Gather, axe: boolean) {
    if (g.kind === 'ironbark') return axe ? (g.sleeper ? 'Cut ironbark from the old tree (it groans)' : 'Cut ironbark') : 'An ironbark tree (you need an axe)';
    if (g.kind === 'heartwood') return axe ? 'Cut heartwood from the fallen giant' : 'A fallen giant (you need an axe to cut heartwood)';
    if (g.kind === 'moonblossom') return 'Pick moonblossoms';
    return 'Prise out the spirit amber';
  }

  /** Harvest a gathering spot. */
  gather(g: Gather, axe: boolean) {
    const c = this.ctx!;
    if ((g.kind === 'ironbark' || g.kind === 'heartwood') && !axe) return c.toast('You need an axe. Thornwick Stores sells them; Old Hesk lends them.');
    if (g.kind === 'heartwood' && !this.mayCutHeartwood()) return c.talk('Sentinel Aelrin', 'A voice from the trees', 'Not that one, human. Heartwood is the Council’s to give. Ask in the Sanctum, and the fallen giants are yours.', [{ label: 'Step back.', run: () => c.close() }]);
    this.forest.harvested(g);
    if (g.kind === 'ironbark') {
      c.give('ironbark', 1);
      // The wrong tree: a sleeping treant pulls up its roots.
      if (g.sleeper) {
        const t = this.forest.threats.treants.get(g.id);
        if (t) {
          t.lockable = true;
          t.wake();
          c.toast('The tree groans. Its branches lift, its roots tear free: it was never a tree at all.');
        }
      }
    } else if (g.kind === 'heartwood') {
      c.give('heartwood', 2);
      c.toast('Under the bark the wood is gold, and warm. You cut two lengths of heartwood.');
    } else if (g.kind === 'moonblossom') c.give('moonblossom', 2);
    else c.give('spiritAmber', 1);
    c.save();
  }

  /** The elves let you cut heartwood once the Council knows you (or you are one of them). */
  mayCutHeartwood() {
    const q = this.ctx!.quests;
    return q.isDone('the-council-of-leaves') || this.hooks.origin() === 'elf';
  }

  /** Simulation step (every mode: the forest's threats only run in the overworld). */
  step(dt: number, overworld: boolean) {
    const c = this.ctx;
    if (!c || !overworld) return;
    this.forest.step(dt, c.player);
    this.lost.update(dt, c.player);
    // The leading fox: reaching its glade with you close behind.
    const f = this.leadFox;
    if (f) {
      const g = new THREE.Vector3(SITES.foxGlade[0], f.position.y, SITES.foxGlade[1]);
      if (!f.alive) this.leadFox = null;
      else if (f.position.distanceTo(g) < 4 && c.player.pos.distanceTo(g.setY(c.player.pos.y)) < 18 && c.quests.wants('fox-followed')) {
        c.quests.signal('fox-followed');
        c.toast('The fox sits down beside a hollow stump, looks at you, and vanishes in a puff of light.');
        f.takeHit({ damage: 9999, poise: 0, dir: new THREE.Vector3(0, 0, 1), at: f.center.clone(), crit: false, source: 'spell' });
      }
    }
    // Tobin goes home once found.
    if (c.flags['elves:tobinHome']) {
      const t = c.npcs.find('tobin');
      if (t && t.rec.schedule[0].place !== 'home') t.rec.schedule = [{ from: 0, activity: 'sleep', place: 'home' }];
    }
  }

  /** Per drawn frame (overworld only). */
  frame(dt: number, camera: THREE.Vector3, night: number) {
    const c = this.ctx;
    if (!c) return;
    this.forest.frame(dt, camera, c.player.pos, night);
  }

  setVisible(v: boolean) {
    this.forest.setVisible(v);
    this.lost.setVisible(v);
  }

  /** Back to a fresh world (tests). */
  reset() {
    this.forest.reset();
    this.lost.reset();
    this.leadFox = null;
  }

  /** Item names for messages. */
  static itemName(id: string) {
    return ITEMS[id]?.name ?? id;
  }
}
