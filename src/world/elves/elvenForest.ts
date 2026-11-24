import * as THREE from 'three';
import {
  FOREST_NODES as N,
  FOREST_ROUTES,
  FOREST_SITES,
  inElvenForest,
  forestLayer,
  forestRefugeAt,
  forestGuided,
  lostWoodsDestination,
  nightInForest,
  type ForestSite,
  type Point,
} from './layout';
import { ForestPalette, ForestGeometry, buildWorldTree, buildForestSite, buildForestCell, canopyArchiveAt } from './forestGeometry';
import { ForestSpider } from './forestSpider';
import { makeBlightedElder } from './blightedElder';
import { heightAt } from '../terrainHeight';
import { ELF_QUESTS } from '../../quests/elfQuests';
import { starfallDef } from '../../dungeon/dungeons/starfall';
import { Rootwarden } from '../../enemies/wilds/rootwarden';
import { WildBeast } from '../../enemies/wilds/wildBeast';
import { WILD_SPECS } from '../../enemies/wilds/wildSpecs';
import { Telegraphs } from '../../enemies/wilds/telegraph';
import { Missiles } from '../../enemies/wilds/projectiles';
import type { WorldMats } from '../buildings';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { QuestLog } from '../../quests/questLog';
import type { Realm } from '../../dungeon/realm';
import type { Interactable } from '../../dungeon/instance';
import type { NpcRecord, Settlement } from '../../npc/npcManager';
import type { MapMarker } from '../../ui/worldMap';
import type { Target } from '../../combat/targets';
import { targets } from '../../combat/targets';
interface Option {
  label: string;
  run(): void;
}
export interface ForestHooks {
  scene: THREE.Scene;
  mats: WorldMats;
  fx: FX;
  player: Player;
  quests: QuestLog;
  realm: Realm;
  flags: Record<string, boolean | number | string>;
  day(): number;
  hour(): number;
  toast(s: string): void;
  card(name: string, text: string): void;
  give(id: string, n: number): void;
  save(): void;
  talk(name: string, title: string, text: string, options: Option[]): void;
  close(): void;
  bossBar(t: Target | null, name?: string): void;
  openRoad(): void;
  rest(hour: number): void;
  craft(kind: 'workbench' | 'alchemy' | 'kitchen', name: string): void;
  trade(name: string): void;
}
type Actor = Rootwarden | WildBeast | ForestSpider;
interface Live {
  geometry: ForestGeometry;
  actors: Actor[];
  started: boolean;
  generation: number;
  dying: boolean;
}
const V = (at: Point, y = 0) => new THREE.Vector3(at[0], heightAt(at[0], at[1]) + y, at[1]);
const archiveNames = ['The First Turning', 'The Fifth Summon', 'The Roots’ Warning'];
const archiveTexts = [
  'Before kings named the Dawn, the wheel-cutters kept four lights and one empty place. The Turning was a covenant, not a crown. The drowned archive preserves the same four bearings.',
  'The fifth summon was not counted among the four lights. A witness was called from outside their circle. The Sunwheel blade can break the false covenant; it cannot heal a wound by itself.',
  'The roots remember two deep fractures: one under the White Mountains, one beneath the desert sands. Starfall charted both before the mountains bore their present names.',
];
/** Permanent save-backed metadata, bounded geometry/AI residency, and native quest/dungeon integration. */
export class ElvenForest {
  readonly interactables: Interactable[] = [];
  readonly records: NpcRecord[] = [];
  readonly settlements: Settlement[] = [];
  readonly clearings: [number, number, number][] = [];
  readonly live = new Map<string, Live>();
  readonly cells = new Map<string, ForestGeometry>();
  readonly tele: Telegraphs;
  readonly missiles: Missiles;
  readonly dungeon = starfallDef();
  readonly palette: ForestPalette;
  readonly worldTree: ForestGeometry;
  private ambient: THREE.Points | null = null;
  private clock = 0;
  private scan = 0;
  private enabled = true;
  private loop = 0;
  private lostTime = 0;
  private warning = false;
  private currentLayer: string | null = null;
  private ready = false;
  private ownsBar = false;
  private epoch = 0;
  private veil: HTMLDivElement | null = null;
  constructor(readonly d: ForestHooks) {
    this.palette = new ForestPalette(d.mats);
    this.tele = new Telegraphs(d.scene);
    this.missiles = new Missiles(d.scene, d.fx);
    this.worldTree = buildWorldTree(this.palette, d.scene);
    d.quests.add(...ELF_QUESTS.map((q) => (q.id === 'elf-name' ? { ...q, offerIf: () => d.player.prog.origin === 'elf' } : q)));
    d.quests.hooks.set('elf:sync', () => this.sync());
    for (const id of ['marker', 'token', 'loggers', 'stars'])
      d.quests.hooks.set('elf-' + id + ':done', () => {
        this.sync();
        if (this.ready) d.save();
      });
    this.buildPeople();
    this.buildInteractions();
    for (const s of FOREST_SITES) this.clearings.push([s.at[0], s.at[1], s.kind === 'town' ? 90 : 45]);
    for (const route of FOREST_ROUTES)
      for (let i = 1; i < route.length; i++) {
        const a = N[route[i - 1]],
          b = N[route[i]],
          n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8);
        for (let j = 0; j <= n; j++) this.clearings.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n, 9]);
      }
    const door = V(N.temple),
      out = door.clone().add(new THREE.Vector3(0, 0, 8));
    out.y = heightAt(out.x, out.z) + 0.2;
    d.realm.registerKit(this.dungeon, door, out, 0, 'Enter the Temple of Starfall');
    const entrance = d.realm.overworldInteractables.at(-1)!;
    entrance.enabled = () => this.enabled && !d.player.dead;
    entrance.label = () => (d.flags['elf:clear:elder'] ? 'Enter the Temple of Starfall' : 'Examine Starfall’s root-bound seal');
    entrance.action = () => {
      if (!d.flags['elf:clear:elder']) {
        d.toast('The Blighted Elder holds the root seal. Free it in the Ancient Forest first.');
        return;
      }
      d.close();
      void d.realm.enterKit(this.dungeon, 1, 'entrance');
    };
  }
  get guided() {
    return forestGuided(this.d.flags, this.d.day(), this.d.hour(), this.d.player.prog.origin === 'elf', this.d.player.paths.level('dungeoneering'));
  }
  private emit(id: string) {
    this.d.flags['elf:' + id] = true;
    this.d.quests.signal('elf:' + id);
  }
  sync() {
    const d = this.d,
      f = d.flags,
      q = d.quests;
    if (q.isDone('elf-marker')) {
      f['elf:passage'] = true;
      f['elf:visited:marker'] = true;
      d.openRoad();
    }
    if (q.isDone('elf-token')) f['elf:token'] = true;
    if (q.isDone('elf-loggers')) {
      f['elf:dispute'] = true;
      f['elf:logging'] = String(q.flag('elf-loggers', 'agreement') ?? 'withdraw');
    }
    if (q.isDone('elf-stars')) {
      f['elf:starsRead'] = true;
      f['elf:mountainBearing'] = true;
      f['elf:desertBearing'] = true;
    }
    // Kit progress is native save data. Killing the guardian before taking the quest still counts.
    if (d.realm.progress.kit?.starfall?.boss) f['elf:temple'] = true;
    for (const key of Object.keys(f)) if (key.startsWith('elf:') && f[key] === true) q.signal(key);
  }
  private talk(title: string, text: string, options: Option[] = []) {
    this.d.talk(title, 'The Verdant Woods', text, [...options, { label: 'Leave.', run: () => this.d.close() }]);
  }
  private interact(at: THREE.Vector3, label: () => string, run: () => void, enabled = () => true, radius = 3.5): Interactable {
    const i: Interactable = {
      pos: at,
      radius,
      level: 4,
      label,
      enabled: () => this.enabled && !this.d.player.dead && enabled(),
      action: () => {
        if (i.enabled() && this.d.player.pos.distanceTo(at) < radius + 1) run();
      },
    };
    this.interactables.push(i);
    return i;
  }
  private buildInteractions() {
    for (const s of FOREST_SITES) {
      if (s.kind === 'temple') continue;
      this.interact(
        V(s.id === 'sanctum' ? [s.at[0], s.at[1] + 26] : s.at),
        () =>
          s.kind === 'camp' || s.kind === 'boss'
            ? this.d.flags['elf:clear:' + s.id]
              ? 'Remember ' + s.name
              : 'Challenge ' + s.name
            : s.kind === 'resource'
              ? 'Gather ' + s.name
              : 'Explore ' + s.name,
        () => this.useSite(s),
        () => this.live.has(s.id) && !(s.id === 'silverbough' && !this.guided)
      );
    }
    for (let i = 0; i < 3; i++)
      this.interact(
        canopyArchiveAt(i),
        () => 'Read ' + archiveNames[i],
        () => {
          this.emit('archive:' + ['turning', 'summon', 'roots'][i]);
          this.talk(archiveNames[i], archiveTexts[i]);
          this.d.save();
        },
        () => this.live.has('sanctum')
      );
    for (const id of ['marker', 'thornwick', 'silverbough', 'sanctum', 'eastwatch', 'starlake', 'glade', 'hollow'] as const) {
      const at = V(forestRefugeAt(N[id]));
      this.interact(
        at,
        () => (id === 'marker' ? 'Greenwood Waystone' : 'Rest and travel · ' + (FOREST_SITES.find((s) => s.id === id)?.name ?? id)),
        () => this.shelter(id),
        () => id === 'marker' || this.live.has(id)
      );
    }
    // The fox trail and root harps are real ordered world interactions, not dialogue completion buttons.
    for (let i = 0; i < 3; i++) {
      const at = V([N.fox[0] + (i - 1) * 13, N.fox[1] - i * 10]);
      this.interact(
        at,
        () => `Follow silver pawprints ${i + 1}/3`,
        () => {
          const next = Number(this.d.flags['elf:foxStep'] ?? 0);
          if (this.d.flags['elf:fox']) {
            this.d.toast('The spirit fox has returned Faelan’s moonstone.');
            return;
          }
          if (i !== next) {
            this.d.flags['elf:foxStep'] = 0;
            this.unload('fox');
            this.stream();
            this.d.save();
            this.d.toast('The fox doubles back. Begin at the southern pawprint stone.');
            return;
          }
          this.d.flags['elf:foxStep'] = i + 1;
          this.unload('fox');
          this.stream();
          if (i === 2) {
            this.emit('fox');
            this.d.toast('The fox drops the moonstone and bows. Return to Faelan.');
          } else this.d.toast('A silver tail flashes towards the next pawprint stone.');
          this.d.save();
        },
        () => this.live.has('fox')
      );
    }
    const notes = ['Leaf', 'Rain', 'Starlight'];
    for (let i = 0; i < 3; i++)
      this.interact(
        V([N.song[0] + (i - 1) * 7, N.song[1]]),
        () => 'Play the ' + notes[i] + ' root harp',
        () => {
          if (this.d.flags['elf:song']) {
            this.d.toast('The roots answer your song.');
            return;
          }
          const next = Number(this.d.flags['elf:songStep'] ?? 0);
          this.d.flags['elf:songStep'] = next === i ? i + 1 : i === 0 ? 1 : 0;
          if (this.d.flags['elf:songStep'] === 3) {
            this.emit('song');
            this.d.toast('Leaf, rain, starlight. The World Tree answers.');
          } else this.d.toast(next === i ? notes[i] + ' answers.' : 'The discord fades. Listen: leaf, rain, starlight.');
          this.d.save();
        },
        () => this.live.has('song')
      );
  }
  private shelter(id: keyof typeof N) {
    const d = this.d;
    this.emit('visited:' + id);
    this.talk(
      'The Lantern Refuges',
      'The marked road is safe from the Lost Woods. Once discovered, the waystones remember your route. Rest restores your health, mana and armour.',
      [
        {
          label: 'Rest until morning.',
          run: () => {
            d.close();
            d.rest(7);
          },
        },
        {
          label: 'Wait until moonrise (20:00).',
          run: () => {
            d.close();
            d.rest(20);
          },
        },
        ...(['marker', 'thornwick', 'silverbough', 'sanctum', 'eastwatch', 'starlake', 'glade', 'hollow'] as const)
          .filter((other) => other !== id && d.flags['elf:visited:' + other])
          .map((other) => ({
            label: 'Travel to ' + (FOREST_SITES.find((s) => s.id === other)?.name ?? 'Greenwood marker'),
            run: () => {
              if (this.combatNearby()) {
                d.toast('Lose your pursuers before using the waystone.');
                return;
              }
              if (!this.guided && other === 'silverbough') {
                d.toast('Silverbough’s waystone needs a guide or token.');
                return;
              }
              d.close();
              d.player.teleport(V(forestRefugeAt(N[other]), 0.2));
              this.loop = 12;
              d.save();
            },
          })),
      ]
    );
  }
  useSite(s: ForestSite) {
    const d = this.d;
    if (s.kind === 'camp' || s.kind === 'boss') {
      if (d.flags['elf:clear:' + s.id]) {
        this.talk(
          s.name,
          s.id === 'elder'
            ? 'The old guardian’s roots carry clean light again. The Temple of Starfall is open.'
            : 'The rescued trail is quiet. Your deed will still count if its quest is accepted later.'
        );
        return;
      }
      this.startEncounter(s.id);
      return;
    }
    if (s.kind === 'resource') {
      if (s.night && !nightInForest(d.hour())) {
        d.toast('Moonblossoms open between 20:00 and 05:00. Wait at the glade shelter.');
        return;
      }
      if (!d.flags['elf:token'] && s.item === 'elfHeartwood') {
        d.toast('Earn the Guide’s Token before gathering the grove’s sacred heartwood. The elves permit only deadfall.');
        return;
      }
      if (d.flags['elf:harvest:' + s.id] === d.day() + 1) {
        d.toast('Leave this patch to recover until tomorrow.');
        return;
      }
      d.flags['elf:harvest:' + s.id] = d.day() + 1;
      d.give(s.item!, s.id === 'bloom' ? 3 : 2);
      d.toast('Gathered ' + s.name + '.');
      d.save();
      return;
    }
    this.emit('visited:' + s.id);
    if (s.id === 'fox')
      this.talk(
        s.name,
        'The first pawprint lies south-west of the wall. Follow the stones in order: southern, middle, northern. The spirit fox wants its game played, not its hide taken.'
      );
    else if (s.id === 'song') this.talk(s.name, 'The root harps sound in the old order: leaf, rain, starlight. Walk to each harp and play it.');
    else this.talk(s.name, s.text);
    d.save();
  }
  startEncounter(id: string) {
    const s = FOREST_SITES.find((s) => s.id === id),
      live = this.live.get(id);
    if (!s || !live || live.started || this.d.flags['elf:clear:' + id]) return false;
    live.started = true;
    const d = this.d,
      here = V(s.at);
    if (id === 'elder') {
      const b = makeBlightedElder(
        here,
        d.scene,
        d.fx,
        { tele: this.tele, missiles: this.missiles },
        (w) => live.actors.push(w),
        (p) => d.toast(p === 1 ? 'The blight spreads. Watch the root lanes and the new spirits.' : 'The Elder’s core is exposed. Its roots strike faster.')
      );
      live.actors.push(b);
      b.wake();
    } else if (id === 'spring') for (let i = 0; i < 3; i++) live.actors.push(new ForestSpider(here.clone().add(new THREE.Vector3((i - 1) * 5, 0, -5)), d.scene, this.tele));
    else for (let i = 0; i < 3; i++) this.addWolf(live, here.clone().add(new THREE.Vector3((i - 1) * 6, 0, -6)), s.level);
    d.card(s.name, 'Recommended level ' + s.level + ' · ' + s.text);
    return true;
  }
  private addWolf(live: Live, at: THREE.Vector3, level: number) {
    const b = new WildBeast(
      { ...WILD_SPECS.direWolf, id: 'elfBlightWolf', name: 'Blighted Wolf', tint: 0x7ea99d },
      at,
      this.d.scene,
      this.d.fx,
      { tele: this.tele, missiles: this.missiles },
      { danger: 0.4, alerted: true, leash: 58 }
    );
    b.hp = b.maxHp = level * 35;
    b.damage = level * 1.4;
    b.level = level;
    live.actors.push(b);
  }
  private buildPeople() {
    const groups: [string, keyof typeof N, [string, string, string, number, number][]][] = [
      [
        'greenwood',
        'marker',
        [
          ['elf-nimri', 'Nimri', 'Trail Guide', 4, 0],
          ['elf-sentinel', 'Aelion', 'Greenwood Sentinel', -5, -5],
        ],
      ],
      [
        'thornwick',
        'thornwick',
        [
          ['elf-corwen', 'Corwen Ashford', 'Thornwick Foreman', 7, 2],
          ['elf-innkeeper', 'Mara Hazelwood', 'Woodsman’s Rest', -6, 3],
        ],
      ],
      [
        'silverbough',
        'silverbough',
        [
          ['elf-faelan', 'Faelan', 'Bowyer and Ranger', -7, 2],
          ['elf-thessaly', 'Thessaly of the Wind', 'Windcaller', 7, 2],
          ['elf-carver', 'Ilyra Heartwood', 'Heartwood Carver', 0, -8],
        ],
      ],
      [
        'sanctum',
        'sanctum',
        [
          ['elf-lirael', 'Elder Lirael Moonwhisper', 'Council of Leaves', 26, 18],
          ['elf-archivist', 'Elarin', 'Keeper of the Living Archive', -26, 18],
        ],
      ],
      ['hunter', 'hunter', [['elf-eryndis', 'Eryndis', 'The Rescued Hunter', 0, 3]]],
      ['glade', 'glade', [['elf-sylwen', 'Sylwen Starwatcher', 'Lightbinder', 0, 4]]],
      ['hollow', 'hollow', [['elf-hermit', 'Hermit of the Hollow', 'The Wildwarden', 0, 3]]],
    ];
    for (const [id, node, people] of groups) {
      const center = V(N[node]),
        places = new Map(),
        nodes: THREE.Vector3[] = [];
      for (const [pid, name, job, dx, dz] of people) {
        const at = V([center.x + dx, center.z + dz]);
        places.set('post:' + pid, { id: 'post:' + pid, spots: [at] });
        nodes.push(at);
        const elf = pid !== 'elf-corwen' && pid !== 'elf-innkeeper';
        this.records.push({
          id: pid,
          name,
          job,
          title: job,
          settlement: 'elf:' + id,
          named: true,
          ...(id === 'sanctum' ? { elevation: 28 } : {}),
          look: {
            body: pid === 'elf-corwen' || pid === 'elf-faelan' || pid === 'elf-hermit' ? 'male' : 'female',
            outfit: elf ? 'ranger' : 'peasant',
            elven: elf,
            hood: pid === 'elf-hermit',
            hair: 'long',
            skin: elf ? 0xe1d4bd : 0xd0a98d,
            hairColor: elf ? 0xdad8bc : 0x654832,
            cloth: elf ? 0x3e6f5a : 0x795b41,
            linen: 0xc5c8a0,
            height: elf ? 1.88 : 1.76,
          },
          schedule:
            pid === 'elf-sylwen'
              ? [
                  { from: 0, activity: 'work', place: 'post:' + pid },
                  { from: 5, activity: 'sleep', place: 'post:' + pid },
                  { from: 20, activity: 'work', place: 'post:' + pid },
                ]
              : [
                  { from: 0, activity: 'idle', place: 'post:' + pid },
                  { from: 7, activity: 'work', place: 'post:' + pid },
                  { from: 20, activity: 'idle', place: 'post:' + pid },
                ],
          lines: {
            any: [
              pid === 'elf-nimri'
                ? 'Stay between the lanterns. I can guide you for a day; your own token will last a lifetime.'
                : pid === 'elf-lirael'
                  ? 'The living stair circles the southern root. The archives above still remember the first Turning.'
                  : pid === 'elf-hermit'
                    ? 'A borrowed shape should teach you how another creature lives, not how to stop being yourself.'
                    : 'Take only fallen wood. Follow the lights, and the forest will let you find your way.',
            ],
          },
        });
      }
      this.settlements.push({
        id: 'elf:' + id,
        name: id === 'greenwood' ? 'Greenwood Marker' : FOREST_SITES.find((s) => s.id === node)?.name,
        center,
        radius: 180,
        places,
        nodes,
        edges: nodes.map((_, i) => nodes.map((_, j) => j).filter((j) => j !== i)),
      });
    }
  }
  services() {
    const map = new Map<string, (show: (text: string) => void, back: () => void) => Option[]>(),
      d = this.d;
    map.set('elf-nimri', (show) => [
      {
        label: 'Hire a guide for one day (80 gold).',
        run: () => {
          if (this.guided) {
            show('You can already read the hidden paths. Keep your coin.');
            return;
          }
          if (d.player.prog.gold < 80) {
            show('Eighty gold buys a full day. The lantern road is always safe, even without me.');
            return;
          }
          d.player.prog.addGold(-80);
          d.flags['elf:guideUntil'] = d.day() * 24 + d.hour() + 24;
          d.flags['elf:visited:marker'] = true;
          d.save();
          show('I will mark your way until this hour tomorrow. Silverbough will reveal itself; the glowlights on the trails will answer you.');
        },
      },
      {
        label: 'How do I navigate the Lost Woods?',
        run: () =>
          show(
            'Stay within sight of the route lanterns. The outer woods never loop. In the inner wood, stray paths return you to a refuge after a warning. Elves, trained trail readers (Dungeoneering 15), hired guides and holders of the permanent Guide’s Token read the true paths. Clear Silver Spring and settle Corwen’s quarrel to earn your token.'
          ),
      },
    ]);
    map.set('elf-innkeeper', () => [
      {
        label: 'Rest until morning.',
        run: () => {
          d.close();
          d.rest(7);
        },
      },
      {
        label: 'Cook at the hearth.',
        run: () => {
          d.close();
          d.craft('kitchen', 'Woodsman’s Rest');
        },
      },
      {
        label: 'Buy provisions.',
        run: () => {
          d.close();
          d.trade('Woodsman’s Rest');
        },
      },
    ]);
    map.set('elf-carver', () => [
      {
        label: 'Work fallen heartwood and spirit amber.',
        run: () => {
          d.close();
          d.craft('workbench', 'Silverbough Heartwood Carvers');
        },
      },
      {
        label: 'Trade with the carvers.',
        run: () => {
          d.close();
          d.trade('Silverbough Carvers');
        },
      },
    ]);
    map.set('elf-sylwen', () => [
      {
        label: 'Brew moonblossom draughts.',
        run: () => {
          d.close();
          d.craft('alchemy', 'Moonlight Glade');
        },
      },
    ]);
    map.set('elf-sentinel', (show) => [
      {
        label: 'Where does the northern road lead?',
        run: () => show('Thornwick first; then Silverbough and the World Tree. Ask Nimri for passage at this marker. The Moonlight Glade lies far east along the lantern refuges.'),
      },
    ]);
    map.set('elf-corwen', (show) => [
      {
        label: 'How is the mill faring?',
        run: () =>
          show(
            d.flags['elf:logging'] === 'withdraw'
              ? 'The old grove is closed. We are retooling the mill, and the woods are coming back.'
              : d.flags['elf:logging'] === 'concession'
                ? 'Only marked fallen timber, as agreed. The grovekeepers now share the mill’s ledger.'
                : 'The quarrel has left our sawyers without work. Speak to Thessaly before you choose a settlement.'
          ),
      },
    ]);
    map.set('elf-eryndis', (show) => [
      {
        label: 'Are you ready to return home?',
        run: () => show('The pack turned on its own trail. I thought the forest had forgotten me. Take my journal to Faelan; I will follow the lantern road once I can walk.'),
      },
    ]);
    map.set('elf-archivist', (show) => [
      {
        label: 'Where are the archives?',
        run: () =>
          show(
            'Take the southern spiral ramp around the World Tree. Three archive boughs surround the canopy ring: the Turning, the fifth summon, and the roots’ warning. The handrails guard a continuous walking route.'
          ),
      },
    ]);
    return map;
  }
  absent(id: string) {
    if (id === 'elf-eryndis') return !this.d.flags['elf:clear:hunter'];
    return id.startsWith('elf-') && ['elf-faelan', 'elf-thessaly', 'elf-carver'].includes(id) ? !this.guided : undefined;
  }
  private combatNearby() {
    return [...targets].some((t) => t.alive && t.position.distanceTo(this.d.player.pos) < 45);
  }
  update(dt: number, overworld: boolean) {
    this.ready = true;
    this.clock += dt;
    this.loop = Math.max(0, this.loop - dt);
    this.worldTree.root.visible = overworld && this.enabled;
    if (!overworld || !this.enabled) {
      if (this.live.size || this.cells.size) this.suspend();
      return;
    }
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.65;
      this.stream();
      this.sync();
    }
    const d = this.d,
      p = d.player;
    let boss: Rootwarden | null = null;
    for (const [id, live] of this.live) {
      for (const a of live.actors) a.update(dt, p);
      if (live.started && live.actors.length && !live.actors.some((a) => a.alive) && !d.flags['elf:clear:' + id]) {
        this.emit('clear:' + id);
        if (id === 'hunter') d.give('elfTrailJournal', 1);
        d.player.prog.addXp(id === 'elder' ? 1800 : 500);
        d.player.prog.addGold(id === 'elder' ? 450 : 120);
        d.toast(id === 'elder' ? 'The Blighted Elder is freed. Starfall’s root seal opens.' : 'The trail is clear. Return to the people who sent you.');
        d.save();
      }
      const b = live.actors.find((a) => a instanceof Rootwarden && a.alive) as Rootwarden | undefined;
      if (b && p.pos.distanceTo(b.position) < 90) boss = b;
    }
    this.tele.update(dt);
    this.missiles.update(dt, p);
    if (boss) {
      this.ownsBar = true;
      d.bossBar(boss, boss.name);
    } else if (this.ownsBar) {
      d.bossBar(null);
      this.ownsBar = false;
    }
    const layer = forestLayer(p.pos.x, p.pos.z);
    if (layer !== this.currentLayer) {
      this.currentLayer = layer;
      if (layer) d.card(layer, this.guided ? 'The true paths answer your guide.' : 'Follow the lanterns. Unmarked paths may return you to a refuge.');
    }
    if (inElvenForest(p.pos.x, p.pos.z))
      for (const id of ['thornwick', 'silverbough', 'sanctum', 'eastwatch', 'starlake', 'glade', 'hollow'] as const)
        if (p.pos.distanceTo(V(N[id])) < 55 && (id !== 'silverbough' || this.guided)) d.flags['elf:visited:' + id] = true;
    this.updateAmbience();
    this.updateLostWoods(dt);
  }
  private updateAmbience() {
    const p = this.d.player.pos,
      visible = this.enabled && inElvenForest(p.x, p.z);
    if (!visible) {
      if (this.ambient) this.ambient.visible = false;
      return;
    }
    if (!this.ambient) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(96 * 3), 3));
      this.ambient = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: 0xbde8ba, size: 0.1, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      this.ambient.frustumCulled = false;
      this.d.scene.add(this.ambient);
    }
    this.ambient.visible = true;
    const positions = this.ambient.geometry.attributes.position,
      night = nightInForest(this.d.hour());
    const material = this.ambient.material as THREE.PointsMaterial;
    material.size = night ? 0.13 : 0.045;
    material.opacity = night ? 0.75 : 0.25;
    material.color.setHex(night ? 0xb9ebbe : 0xeee4c8);
    for (let i = 0; i < 96; i++) {
      const x = p.x + Math.sin(i * 7.31 + this.clock * 0.035) * 36,
        z = p.z + Math.cos(i * 2.53 + this.clock * 0.027) * 36;
      positions.setXYZ(i, x, heightAt(x, z) + 1.4 + (i % 7) * 0.7 + Math.sin(this.clock * 0.7 + i) * 0.6, z);
    }
    positions.needsUpdate = true;
  }
  private updateLostWoods(dt: number) {
    const p = this.d.player;
    const dest = !this.guided && !p.dead && !p.vehicle && !p.mounted && !p.swimming && this.loop <= 0 && !this.combatNearby() ? lostWoodsDestination(p.pos.x, p.pos.z) : null;
    if (!dest) {
      this.lostTime = 0;
      this.warning = false;
      this.veil?.remove();
      this.veil = null;
      return;
    }
    this.lostTime += dt;
    if (!this.warning) {
      this.warning = true;
      this.d.toast('The lanterns vanish in the mist. Return to the marked trail, or the wood will turn you back.');
    }
    if (this.lostTime > 4 && !this.veil) {
      this.veil = document.createElement('div');
      this.veil.style.cssText = 'position:fixed;inset:0;background:#101d1b;opacity:0;transition:opacity 1s;pointer-events:none;z-index:90';
      document.body.append(this.veil);
      requestAnimationFrame(() => {
        if (this.veil) this.veil.style.opacity = '0.95';
      });
    }
    if (this.lostTime > 5.3) {
      p.teleport(V(forestRefugeAt(dest), 0.3));
      this.loop = 15;
      this.lostTime = 0;
      this.veil?.remove();
      this.veil = null;
      this.d.toast('The path has folded back to a lantern refuge. Follow the lights, or ask Nimri for guidance.');
    }
  }
  private stream() {
    const p = this.d.player.pos;
    for (const s of FOREST_SITES) {
      const d = Math.hypot(p.x - s.at[0], p.z - s.at[1]),
        show = d < 360 && !(s.id === 'silverbough' && !this.guided);
      if (show && !this.live.has(s.id)) {
        const g = buildForestSite(s, this.palette, this.d.mats, this.d.scene, Number(this.d.flags['elf:foxStep'] ?? 0)),
          live = { geometry: g, actors: [], started: false, generation: this.epoch, dying: false };
        this.live.set(s.id, live);
        if (s.id === 'fox') this.buildTrailProps(g, 'fox');
        if (s.id === 'song') this.buildTrailProps(g, 'song');
      } else if ((d > 480 || (!show && s.id === 'silverbough')) && this.live.has(s.id)) this.unload(s.id);
    }
    const wanted = new Set<string>();
    if (inElvenForest(p.x, p.z))
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const x = Math.floor(p.x / 128) + dx,
            z = Math.floor(p.z / 128) + dz;
          if (!inElvenForest(x * 128 + 64, z * 128 + 64)) continue;
          const key = x + ':' + z;
          wanted.add(key);
          if (!this.cells.has(key)) this.cells.set(key, buildForestCell(x, z, this.palette, this.d.scene));
        }
    for (const [key, g] of this.cells)
      if (!wanted.has(key)) {
        g.dispose();
        this.cells.delete(key);
      }
  }
  private buildTrailProps(g: ForestGeometry, kind: 'fox' | 'song') {
    // A second small batch keeps puzzle props in the same owned streaming root.
    const props = new ForestGeometry(this.palette);
    for (let i = 0; i < 3; i++) {
      const at = kind === 'fox' ? V([N.fox[0] + (i - 1) * 13, N.fox[1] - i * 10]) : V([N.song[0] + (i - 1) * 7, N.song[1]]);
      props.box(at.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.4, 0.8, 1.4, this.palette.stone);
      if (kind === 'song') {
        props.beam(at.clone(), at.clone().add(new THREE.Vector3(0, 3, 0)), 0.16);
        props.beam(at.clone().add(new THREE.Vector3(1, 0, 0)), at.clone().add(new THREE.Vector3(1, 3, 0)), 0.16);
        props.beam(at.clone().add(new THREE.Vector3(0, 3, 0)), at.clone().add(new THREE.Vector3(1, 3, 0)), 0.16);
      }
      props.sign(at, kind === 'fox' ? `Silver Pawprints · ${i + 1}` : ['Leaf', 'Rain', 'Starlight'][i], kind === 'fox' ? 'Follow the fox · do not hunt it' : 'The First Song');
    }
    props.finish(this.d.scene);
    g.root.add(props.root);
    // The parent's traversal releases geometry, while sign textures have their own owner.
    const dispose = g.dispose.bind(g);
    g.dispose = () => {
      props.dispose();
      dispose();
    };
  }
  private unload(id: string) {
    const live = this.live.get(id);
    if (!live) return;
    for (const a of live.actors) a.dispose();
    live.geometry.dispose();
    this.live.delete(id);
  }
  suspend() {
    if (this.ambient) this.ambient.visible = false;
    this.epoch++;
    for (const id of [...this.live.keys()]) this.unload(id);
    for (const g of this.cells.values()) g.dispose();
    this.cells.clear();
    this.tele.clear();
    this.missiles.clear();
    this.veil?.remove();
    this.veil = null;
    this.lostTime = 0;
    if (this.ownsBar) {
      this.d.bossBar(null);
      this.ownsBar = false;
    }
  }
  setVisible(v: boolean) {
    this.enabled = v;
    this.worldTree.root.visible = v;
    if (!v) this.suspend();
  }
  reset() {
    this.suspend();
    this.loop = 0;
    this.scan = 0;
    this.currentLayer = null;
    this.warning = false;
  }
  warm() {
    this.stream();
    this.scan = 0.65;
  }
  markers(): MapMarker[] {
    return FOREST_SITES.filter((s) => s.id !== 'silverbough' || this.guided).map((s) => ({
      x: s.at[0],
      z: s.at[1],
      kind: this.d.flags['elf:clear:' + s.id] ? 'siteDone' : s.kind === 'boss' ? 'boss' : 'site',
      label: s.name,
      glyph: s.kind === 'town' ? '⌂' : s.kind === 'temple' ? '✦' : '❧',
      color: '#8bc4a0',
    }));
  }
}
