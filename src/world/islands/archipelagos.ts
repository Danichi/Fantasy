import * as THREE from 'three';
import { ISLANDS, REGIONS, THEMES, SITES, HUB_LINKS, wardsOf, islandAt, islandLandingWater, type IslandDef, type IslandRegion, type IslandSite } from './layout';
import { ISLAND_QUESTS } from '../../quests/islandQuests';
import { heightAt } from '../terrainHeight';
import { SEA_LEVEL } from '../worldMap';
import { StaticBatch } from '../cityKit';
import { buildHouse, type WorldMats } from '../buildings';
import { physics } from '../../physics/physics';
import { Bandit, Bolts } from '../../enemies/bandit';
import { Undead } from '../../enemies/undead';
import { BrineMaw } from '../../bosses/brineMaw';
import { DeadLord, WRAITH } from '../../bosses/deadLords';
import { Rootwarden } from '../../enemies/wilds/rootwarden';
import { WildBeast } from '../../enemies/wilds/wildBeast';
import { WILD_SPECS } from '../../enemies/wilds/wildSpecs';
import { Telegraphs } from '../../enemies/wilds/telegraph';
import { Missiles } from '../../enemies/wilds/projectiles';
import { prepareCreature } from '../../creatures/geometryStore';
import { chartRoute } from '../sea/navigation';
import type { IslandPort } from '../sea/islandPorts';
import type { Sailing } from '../sea/sailing';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { QuestLog } from '../../quests/questLog';
import type { Target } from '../../combat/targets';
import { combat } from '../../combat/core';
import type { Interactable } from '../../dungeon/instance';
import type { NpcRecord, Settlement, Place } from '../../npc/npcManager';
import type { MapMarker } from '../../ui/worldMap';

export interface IslandHooks {
  scene: THREE.Scene;
  mats: WorldMats;
  fx: FX;
  player: Player;
  quests: QuestLog;
  sailing: Sailing;
  ports: IslandPort[];
  flags: Record<string, boolean | number | string>;
  day(): number;
  toast(s: string): void;
  card(name: string, text: string, region: string): void;
  give(id: string, n: number): void;
  save(): void;
  close(): void;
  talk(name: string, title: string, text: string, opts: Opt[]): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  gold(): number;
  addGold(n: number): void;
  rest(): void;
  craft(kind: 'forge' | 'kitchen' | 'workbench' | 'alchemy' | 'runestone', name: string): void;
}
type Opt = { label: string; run(): void };
type Actor = Bandit | Undead | BrineMaw | DeadLord | Rootwarden | WildBeast;
interface Live {
  root: THREE.Group;
  colliders: ReturnType<typeof physics.addBox>[];
  actors: Actor[];
  encounters: Map<string, { actors: Actor[]; pending: boolean; started: boolean }>;
  alive: boolean;
  lastNear: number;
  marks: Map<string, THREE.MeshStandardMaterial>;
  signs: THREE.Sprite[];
  beacons: THREE.PointLight[];
}
const OWNED_PREFIX = 'isle:';
const doneKey = (s: IslandSite) => OWNED_PREFIX + 'done:' + s.id;
const clearKey = (s: IslandSite) => OWNED_PREFIX + 'clear:' + s.id;
const pos = (s: { x: number; z: number }) => new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z);
const at = (p: number[]) => new THREE.Vector3(p[0], heightAt(p[0], p[1]), p[1]);
const OVERVIEW = {
  azureIsles: [
    'Reefkeeper Neri',
    'The Pearl Divers',
    'Spice balconies rise behind the white quay. The old reef bells answer across Crownspice, Longreef and Haven Isle. The raiders have mistaken a sanctuary for a pearl store.',
  ],
  emeraldIsles: [
    'Iona Rainfern',
    'The Grovekeepers',
    'The outer camps still cut timber; the inner groves are falling silent. Follow the trail posts, wake the rain sanctuaries, and listen before you draw your blade.',
  ],
  shatteredIsles: [
    'Mara Chainbreaker',
    'The Free Harbours',
    'Calloway commands the ships. Vane commands the shore, and the prisoners who carry his powder. Break the watchcode and his stronghold loses its warning bells.',
  ],
  sunkenIsles: [
    'Keeper Edris',
    'The Drowned Archive',
    "These stairs were dry when the first keepers cut the Dawn's wheel. The three sanctuaries preserve its order. Bring their light to the archive, and the dead may finally release their records.",
  ],
  demonContinent: [
    'Sarin of the Ash',
    "The Exiles' Exchange",
    "The harbour truce ends at the first gate. Trade here, hear what the exiles remember, and carry Vashka's writ before you ask to go farther.",
  ],
};

/** Streaming island content: metadata persists; geometry, colliders and AI
 * exist only around the player. All progression uses the world's save flags. */
export class Archipelagos {
  readonly interactables: Interactable[] = [];
  readonly records: NpcRecord[] = [];
  readonly settlements: Settlement[] = [];
  readonly clearings = SITES.filter((s) => s.kind !== 'dive').map((s) => [s.x, s.z, s.kind === 'village' ? 35 : 24] as [number, number, number]);
  readonly active = new Map<string, Live>();
  readonly bolts: Bolts;
  readonly tele: Telegraphs;
  readonly missiles: Missiles;
  private selected: IslandSite | null = null;
  private selectedLanding: IslandDef | null = null;
  private clock = 0;
  private scan = 0;
  private restored = false;
  private barOwner: string | null = null;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private passage: string | null = null;
  constructor(readonly d: IslandHooks) {
    this.bolts = new Bolts(d.scene);
    this.tele = new Telegraphs(d.scene);
    this.missiles = new Missiles(d.scene, d.fx);
    // Keep generated forest collision out of the walking corridors too.
    for (const isle of ISLANDS)
      for (const path of isle.paths)
        for (let j = 1; j < path.length; j++) {
          const a = path[j - 1],
            b = path[j],
            n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10);
          for (let k = 0; k <= n; k++) this.clearings.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, 6]);
        }
    d.quests.add(...ISLAND_QUESTS);
    this.buildRecords();
    const cursor: Interactable = {
      pos: new THREE.Vector3(0, -999, 0),
      radius: 4.2,
      enabled: () => !!this.selected && !d.player.dead && this.inReach(this.selected),
      label: () => (this.selected ? this.label(this.selected) : ''),
      action: () => {
        if (this.selected && this.inReach(this.selected)) this.interact(this.selected.id);
      },
    };
    this.interactables.push(cursor, {
      pos: new THREE.Vector3(0, -999, 0),
      radius: 3.5,
      label: () => (this.selectedLanding ? 'Climb onto ' + this.selectedLanding.name + ' landing' : ''),
      enabled: () => !!this.selectedLanding && this.canClimb(this.selectedLanding),
      action: () => {
        const isle = this.selectedLanding;
        if (!isle || !this.canClimb(isle)) return;
        d.player.diveDepth = 0;
        d.player.swimming = false;
        d.player.teleport(new THREE.Vector3(isle.sea[0], SEA_LEVEL + 1.6, isle.sea[1]));
        d.toast('You climb onto the island landing.');
        d.save();
      },
    });
  }
  private canClimb(isle: IslandDef) {
    const p = this.d.player,
      [x, z] = islandLandingWater(isle);
    return (
      !p.dead &&
      !this.d.sailing.aboard &&
      p.diveDepth < 2 &&
      (p.swimming || p.pos.y < SEA_LEVEL + 0.6) &&
      Math.abs(p.pos.y - SEA_LEVEL) < 3.8 &&
      Math.hypot(p.pos.x - x, p.pos.z - z) < 3.5
    );
  }
  private material(key: string, color: number, emissive = false) {
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: emissive ? 0.45 : 0.9, ...(emissive ? { emissive: color, emissiveIntensity: 0.7 } : {}) });
      this.materials.set(key, m);
    }
    return m;
  }
  private tinted(key: string, base: THREE.Material, color: number) {
    let material = this.materials.get(key);
    if (!material) {
      material = base.clone() as THREE.MeshStandardMaterial;
      material.color?.setHex(color);
      this.materials.set(key, material);
    }
    return material;
  }
  private theme(region: string) {
    return region === 'demonContinent'
      ? { color: 0xae4b34, stone: 0x574741, wood: 0x4d3027, level: 45, material: 'islandAshSilk', name: 'The Ash Coast', blurb: OVERVIEW.demonContinent[2] }
      : THEMES[region as IslandRegion];
  }
  private inReach(s: IslandSite) {
    const p = this.d.player;
    const y = s.kind === 'dive' ? s.h : heightAt(s.x, s.z);
    return Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 4 && Math.abs(p.pos.y - y) < (s.kind === 'dive' ? 2.3 : 4) && (!s.kind.includes('dive') || (p.swimming && p.diveDepth >= 1));
  }
  private available(s: IslandSite) {
    if (s.kind === 'resource') return this.d.flags['isle:harvest:' + s.id] !== this.d.day() + 1;
    return !this.d.flags[doneKey(s)] || ['boss', 'camp', 'village', 'vista'].includes(s.kind);
  }
  private label(s: IslandSite) {
    if ((s.kind === 'boss' || s.kind === 'camp') && !this.d.flags[clearKey(s)]) return s.kind === 'boss' ? 'Challenge ' + s.name : 'Enter ' + s.name;
    if (this.d.flags[doneKey(s)] && s.kind !== 'resource') return `Read ${s.name}`;
    return (
      (
        {
          village: 'Visit ',
          cache: 'Search ',
          resource: 'Gather at ',
          ward: 'Read the inscription at ',
          camp: 'Search ',
          boss: 'Claim ',
          dive: 'Recover ',
          vista: 'Survey ',
        } as const
      )[s.kind] + s.name
    );
  }
  private complete(s: IslandSite) {
    this.d.flags[doneKey(s)] = true;
    this.d.quests.signal(doneKey(s));
    this.d.save();
    this.active.get(s.island)?.marks.get(s.id)?.emissive.setHex(0x7ac195);
  }
  interact(id: string) {
    const s = SITES.find((s) => s.id === id);
    if (!s || !this.inReach(s)) return false;
    if (s.kind === 'camp' || s.kind === 'boss') {
      if (!this.d.flags[clearKey(s)]) {
        this.startEncounter(s);
        return true;
      }
    }
    if (s.kind === 'ward') {
      if (s.region === 'demonContinent') {
        this.d.talk(
          'The First Ember Gate',
          'The harbour truce',
          this.d.quests.isDone('isles-ashen-truce')
            ? 'The gate captain reads your writ. "The road beyond belongs to the inland houses. Return when the Portwarden has more than a harbour\'s promise to send you with."'
            : 'The guards point you back to Vashka. "A visitor needs the harbour writ before asking about the inland road."',
          [{ label: 'Return to the harbour.', run: () => this.d.close() }]
        );
        return true;
      }
      this.puzzle(s);
      return true;
    }
    if (s.kind === 'village') {
      this.complete(s);
      this.d.talk(s.name, 'An island shelter', s.hint, [
        {
          label: 'Rest at the shelter — 12g',
          run: () => {
            if (this.d.gold() < 12) return this.d.toast('A bed and a meal cost 12g.');
            this.d.addGold(-12);
            this.d.rest();
            this.d.close();
          },
        },
        {
          label: 'Use the camp workbench',
          run: () => {
            this.d.close();
            this.d.craft('workbench', s.name);
          },
        },
        { label: 'Read the field journal', run: () => this.journal(s.region) },
        { label: 'Leave.', run: () => this.d.close() },
      ]);
      return true;
    }
    if (this.d.flags[doneKey(s)] && s.kind !== 'resource') {
      this.d.talk(s.name, 'Your island field notes', s.hint + '\n\nThis find is already recorded in your journal.', [{ label: 'Leave.', run: () => this.d.close() }]);
      return true;
    }
    if (s.kind === 'resource') {
      if (!this.available(s)) return false;
      this.d.flags['isle:harvest:' + s.id] = this.d.day() + 1;
      this.d.give(s.item!, 3);
      this.complete(s);
      this.d.toast('Gathered three island materials. This patch renews tomorrow.');
      return true;
    }
    if (s.kind === 'vista') {
      this.d.player.prog.addXp(90);
      this.complete(s);
      this.d.card(s.name, 'The shore and its old paths are recorded in your field notes.', s.region);
      return true;
    }
    this.d.flags[doneKey(s)] = true;
    this.d.give(s.item ?? this.theme(s.region).material, s.kind === 'boss' ? 5 : 2);
    this.d.give('greaterHealthPotion', s.kind === 'boss' ? 2 : 1);
    this.d.player.prog.addGold(s.kind === 'boss' ? 240 : s.kind === 'dive' ? 85 : 50);
    this.d.player.prog.addXp(s.kind === 'boss' ? 650 : 140);
    this.complete(s);
    this.d.toast(s.name + ' recovered.');
    return true;
  }
  private puzzle(s: IslandSite) {
    if (this.d.flags[doneKey(s)]) {
      this.d.talk(s.name, 'An awakened sanctuary', 'Its light answers the other sanctuaries across the water.', [{ label: 'Leave.', run: () => this.d.close() }]);
      return;
    }
    const theme = THEMES[s.region as IslandRegion],
      n = Number(this.d.flags['isle:rune:' + s.id] ?? 0);
    this.d.talk(s.name, 'The old inscription', `${s.hint}\n\n${n} of three answers hold.`, [
      ...theme.ward.map((label, i) => ({
        label,
        run: () => {
          if (i !== theme.sequence[n]) {
            this.d.flags['isle:rune:' + s.id] = 0;
            this.d.toast('The light fades. Read the order and begin again.');
            this.d.save();
            this.puzzle(s);
            return;
          }
          this.d.flags['isle:rune:' + s.id] = n + 1;
          if (n === 2) {
            this.d.player.prog.addXp(180);
            this.complete(s);
            this.d.close();
            this.d.fx.dust(pos(s), 2);
            this.d.toast('The sanctuary answers across the sea.');
          } else {
            this.d.save();
            this.puzzle(s);
          }
        },
      })),
      { label: 'Leave.', run: () => this.d.close() },
    ]);
  }
  private liveFor(s: IslandSite) {
    return this.active.get(s.island);
  }
  startEncounter(s: IslandSite) {
    const live = this.liveFor(s);
    if (!live || this.d.flags[clearKey(s)]) return false;
    if (s.kind === 'boss' && s.region !== 'demonContinent' && wardsOf(s.region as IslandRegion).some((w) => !this.d.flags[doneKey(w)])) {
      this.d.toast('Three sanctuary lights must answer before this ward will open.');
      return false;
    }
    const previous = live.encounters.get(s.id);
    if (previous?.pending || previous?.actors.some((a) => a.alive)) return false;
    const encounter = { actors: [] as Actor[], pending: true, started: true };
    live.encounters.set(s.id, encounter);
    const put = (a: Actor) => {
      (a as Target).level = this.theme(s.region).level;
      encounter.actors.push(a);
      live.actors.push(a);
      return a;
    };
    const here = pos(s);
    if (s.kind === 'boss' && s.region === 'azureIsles') {
      void prepareCreature('crab').then(() => {
        if (!live.alive || live.encounters.get(s.id) !== encounter) return;
        const b = new BrineMaw(here, THEMES.azureIsles.level, this.d.scene, this.d.fx, here);
        const t: Target = b;
        t.label = THEMES.azureIsles.boss;
        b.rouse();
        put(b);
        encounter.pending = false;
      });
    } else if (s.kind === 'boss' && s.region === 'emeraldIsles') {
      const b = new Rootwarden(here, 0, this.d.scene, this.d.fx, this.tele, this.missiles);
      b.name = THEMES.emeraldIsles.boss;
      (b as Target).label = b.name;
      (b as Target).boss = true;
      b.wake();
      b.maxHp = b.hp = 9000;
      b.damageScale = 2.8;
      b.onSummon = () => {
        for (let i = 0; i < 2; i++) {
          const w = new WildBeast(
            WILD_SPECS.wispHound,
            here.clone().add(new THREE.Vector3((i ? 1 : -1) * 7, 0, 8)),
            this.d.scene,
            this.d.fx,
            { tele: this.tele, missiles: this.missiles },
            { danger: 0.65, alerted: true, leash: 65 }
          );
          w.maxHp = w.hp = 1400;
          w.damage = 65;
          put(w);
        }
      };
      put(b);
      encounter.pending = false;
    } else if (s.kind === 'boss' && s.region === 'sunkenIsles') {
      void prepareCreature('undeadWraith').then(() => {
        if (!live.alive || live.encounters.get(s.id) !== encounter) return;
        const b = new DeadLord(
          {
            ...WRAITH,
            base: { ...WRAITH.base, name: THEMES.sunkenIsles.boss },
            speech: 'The Archivist whispers: "Dawn opens the wheel. Tide carries the names. Night keeps them. You have remembered the order; now carry our record ashore."',
          },
          here,
          THEMES.sunkenIsles.level,
          this.d.scene,
          this.d.fx
        );
        const t: Target = b;
        t.label = THEMES.sunkenIsles.boss;
        b.rouse();
        put(b);
        encounter.pending = false;
      });
    } else {
      const count = s.kind === 'boss' ? 1 : s.region === 'sunkenIsles' ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const p = here.clone().add(new THREE.Vector3((i - (count - 1) / 2) * 3, 0, -3));
        p.y = heightAt(p.x, p.z);
        if (s.region === 'sunkenIsles') {
          const b = new Undead(i ? 'zombie' : 'skeleton', p, 0, this.d.scene, this.d.fx);
          b.maxHp = b.hp = 3500;
          b.damageScale = 5;
          put(b);
        } else {
          const b = new Bandit(s.kind === 'boss' ? 'chief' : i === 2 ? 'crossbow' : 'sword', p, this.d.scene, this.bolts);
          b.alerted = true;
          b.nonLethal = false;
          b.name = b.label =
            s.kind === 'boss' ? THEMES.shatteredIsles.boss : s.region === 'emeraldIsles' ? 'Rootpoacher' : s.region === 'demonContinent' ? 'Ember Road Enforcer' : 'Island Raider';
          b.maxHp = b.hp = s.kind === 'boss' ? 12000 : 1600 + Math.max(0, this.theme(s.region).level - 24) * 115;
          if (s.kind === 'boss') (b as Target).boss = true;
          b.hitDamage = s.kind === 'boss' ? 120 : 70 + Math.max(0, this.theme(s.region).level - 24) * 2;
          put(b);
        }
      }
      encounter.pending = false;
    }
    this.d.toast(s.kind === 'boss' ? s.name + ' answers your challenge.' : 'The camp defenders draw their weapons.');
    return true;
  }
  update(dt: number, overworld: boolean) {
    this.clock += dt;
    if (!this.restored) {
      this.restored = true;
      const destination = this.d.flags['isle:passage'];
      if (typeof destination === 'string') this.arrive(destination);
    }
    if (this.passage && (!this.d.sailing.autopilot || this.d.sailing.autopilot.ship.sunk) && !this.d.sailing.inCabin) this.arrive(this.passage);
    if (!overworld) {
      this.suspend();
      return;
    }
    const p = this.d.player;
    this.scan -= dt;
    const scanning = this.scan <= 0;
    if (scanning) {
      this.scan = 0.25;
      this.refresh();
    }
    let boss: { target: Actor; name: string } | null = null;
    for (const live of this.active.values()) {
      for (const a of live.actors)
        if (a instanceof Undead)
          a.update(
            dt,
            p,
            live.actors.filter((b): b is Undead => b instanceof Undead)
          );
        else a.update(dt, p);
      for (const [id, e] of live.encounters) {
        if (!e.pending && e.actors.length && e.actors.every((a) => !a.alive)) {
          const s = SITES.find((s) => s.id === id)!;
          if (!this.d.flags[clearKey(s)]) {
            this.d.flags[clearKey(s)] = true;
            this.d.quests.signal(clearKey(s));
            this.d.toast(s.name + ' is clear. Search the cache.');
            this.d.save();
          }
        }
        const s = SITES.find((s) => s.id === id)!;
        // Summoned helpers never inherit the defeated boss's name/bar.
        const actor = e.actors[0];
        if (s.kind === 'boss' && actor?.alive && actor.position.distanceTo(p.pos) < 65) boss = { target: actor, name: s.name };
      }
      for (const beacon of live.beacons) beacon.visible = false;
      for (const sign of live.signs) sign.visible = sign.position.distanceTo(p.pos) < 75;
    }
    const beacon = [...this.active.values()].flatMap((l) => l.beacons).sort((a, b) => a.position.distanceToSquared(p.pos) - b.position.distanceToSquared(p.pos))[0];
    if (beacon && beacon.position.distanceTo(p.pos) < 28) beacon.visible = true;
    if (boss) {
      this.d.bossBar(boss.target, boss.name);
      this.barOwner = boss.name;
    } else if (this.barOwner) {
      this.d.bossBar(null);
      this.barOwner = null;
    }
    this.bolts.update(dt, p);
    this.tele.update(dt);
    this.missiles.update(dt, p);
    if (p.dead) {
      this.resetFights();
      return;
    }
    const isle = !p.swimming && !this.d.sailing.aboard ? islandAt(p.pos.x, p.pos.z) : null;
    if (isle && !this.d.flags['isle:visited:' + isle.id]) {
      this.d.flags['isle:visited:' + isle.id] = true;
      this.d.flags['isle:region:' + isle.region] = true;
      this.d.card(isle.name, this.theme(isle.region).name, isle.region);
      this.d.save();
    }
    if (scanning)
      for (const s of SITES) {
        const distance = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
        if (distance < 100) this.d.flags['isle:seen:' + s.id] = true;
        if (!p.swimming && !this.d.sailing.aboard && distance < 12 && s.kind === 'village' && !this.d.flags[doneKey(s)]) this.complete(s);
        if (s.kind === 'camp' && distance < 23 && !this.d.flags[clearKey(s)]) this.startEncounter(s);
      }
    // Evidence can be found before accepting a quest. Replay unique facts,
    // rather than accumulating a generic signal every frame.
    if (scanning) for (const [key, value] of Object.entries(this.d.flags)) if (value && key.startsWith('isle:') && this.d.quests.wants(key)) this.d.quests.signal(key);
  }
  /** Build destination collision without moving the hero or selecting an encounter. */
  warm(at: THREE.Vector3) {
    this.refresh(at, false);
    this.scan = 0;
  }
  private refresh(at = this.d.player.pos, select = true) {
    const p = { pos: at };
    const on = islandAt(p.pos.x, p.pos.z);
    const proximity = (i: IslandDef) =>
      i === on ? -1e6 : Math.min(...[i.at, i.landing, i.sea, ...i.sites.map((s) => s.at), ...(i.dive ? [i.dive] : [])].map((at) => Math.hypot(at[0] - p.pos.x, at[1] - p.pos.z)));
    const nearby = ISLANDS.filter((i) => Math.hypot(i.at[0] - p.pos.x, i.at[1] - p.pos.z) < i.extent + 430)
      .sort((a, b) => proximity(a) - proximity(b))
      .slice(0, 3);
    const ashen = SITES.find((s) => s.id === 'ashen:0')!;
    const nearAshen = Math.hypot(ashen.x - p.pos.x, ashen.z - p.pos.z) < 650;
    const wanted = new Set([...nearby.map((i) => i.id), ...(nearAshen ? ['ashen-coast'] : [])]);
    for (const id of wanted) if (!this.active.has(id)) this.build(id);
    for (const [id, live] of this.active) {
      if (wanted.has(id)) {
        live.lastNear = this.clock;
        live.root.visible = true;
      } else if (this.clock - live.lastNear > 3 || !SITES.some((s) => s.island === id && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 800)) this.unload(id);
    }
    if (!select) return;
    this.selectedLanding = nearby.find((i) => this.canClimb(i)) ?? null;
    const water = this.selectedLanding ? islandLandingWater(this.selectedLanding) : null;
    this.interactables[1].pos.set(water?.[0] ?? 0, water ? SEA_LEVEL - 0.7 : -999, water?.[1] ?? 0);
    this.selected =
      SITES.filter((s) => wanted.has(s.island) && this.available(s) && this.inReach(s)).sort(
        (a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z)
      )[0] ?? null;
    this.interactables[0].pos.copy(
      this.selected
        ? new THREE.Vector3(this.selected.x, this.selected.kind === 'dive' ? this.selected.h : heightAt(this.selected.x, this.selected.z), this.selected.z)
        : new THREE.Vector3(0, -999, 0)
    );
  }
  reset() {
    this.suspend();
    this.passage = null;
    this.restored = true;
    delete this.d.flags['isle:passage'];
  }
  resetFights() {
    for (const live of this.active.values()) {
      for (const a of live.actors) {
        combat.cancel(a);
        a.dispose();
        a.alive = false;
      }
      live.actors.length = 0;
      live.encounters.clear();
    }
    this.bolts.clear();
    this.tele.clear();
    this.missiles.clear();
    if (this.barOwner) this.d.bossBar(null);
    this.barOwner = null;
  }
  suspend() {
    this.selected = null;
    this.selectedLanding = null;
    if (this.barOwner) this.d.bossBar(null);
    this.barOwner = null;
    for (const id of [...this.active.keys()]) this.unload(id);
    this.bolts.clear();
    this.tele.clear();
    this.missiles.clear();
  }
  private unload(id: string) {
    const live = this.active.get(id);
    if (!live) return;
    live.alive = false;
    for (const a of live.actors) {
      combat.cancel(a);
      a.dispose();
      a.alive = false;
    }
    for (const c of live.colliders) physics.removeStatic(c);
    live.root.removeFromParent();
    live.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      if ((o as THREE.Sprite).isSprite) {
        const m = (o as THREE.Sprite).material;
        m.map?.dispose();
        m.dispose();
      }
    });
    for (const m of live.marks.values()) m.dispose();
    this.active.delete(id);
  }
  dispose() {
    this.suspend();
    for (const m of this.materials.values()) m.dispose();
  }
  markers(): MapMarker[] {
    return SITES.filter((s) => this.d.flags['isle:seen:' + s.id] || this.d.flags['isle:chart:' + s.region]).map((s) => ({
      x: s.x,
      z: s.z,
      kind: this.d.flags[doneKey(s)] ? 'siteDone' : 'site',
      label: s.name,
    }));
  }
  journal(region: string) {
    const isles = ISLANDS.filter((i) => i.region === region);
    const sites = SITES.filter((s) => s.region === region);
    const visited = isles.filter((i) => this.d.flags['isle:visited:' + i.id]);
    const done = sites.filter((s) => this.d.flags[doneKey(s)]);
    this.d.talk(
      this.theme(region).name,
      'The island field journal',
      `${this.theme(region).blurb ?? OVERVIEW.demonContinent[2]}\n\n${isles.length ? visited.length + ' / ' + isles.length + ' islands visited. ' : ''}${done.length} / ${sites.length} sites completed.\n\n${isles.map((i) => (this.d.flags['isle:visited:' + i.id] ? '✓ ' : '○ ') + i.name).join('\n')}`,
      [
        {
          label: "Copy the harbour's local trail chart",
          run: () => {
            this.d.flags['isle:chart:' + region] = true;
            this.d.save();
            this.d.toast("The harbour's site bearings are copied to your world map.");
            this.d.close();
          },
        },
        { label: 'Leave.', run: () => this.d.close() },
      ]
    );
  }
  private build(id: string) {
    const live: Live = { root: new THREE.Group(), colliders: [], actors: [], encounters: new Map(), alive: true, lastNear: this.clock, marks: new Map(), signs: [], beacons: [] };
    this.active.set(id, live);
    this.d.scene.add(live.root);
    const isle = ISLANDS.find((i) => i.id === id);
    const region = isle?.region ?? 'demonContinent';
    const theme = this.theme(region);
    const batch = new StaticBatch();
    const stone = this.material(region + ':stone', theme.stone),
      wood = this.material(region + ':wood', theme.wood),
      cloth = this.material(region + ':cloth', theme.color),
      iron = this.material('iron', 0x383d42),
      leaves = this.material(region + ':leaves', region === 'azureIsles' ? 0x4f9974 : 0x417845);
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, yaw = 0, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, yaw, 0, 'YXZ');
      batch.addObject(m);
      geo.dispose();
    };
    const box = (w: number, h: number, l: number, x: number, y: number, z: number, mat: THREE.Material, yaw = 0, solid = false) => {
      mesh(new THREE.BoxGeometry(w, h, l), mat, x, y, z, yaw);
      if (solid)
        live.colliders.push(
          physics.addBox(new THREE.Vector3(x, y, z), new THREE.Vector3(w / 2, h / 2, l / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
        );
    };
    const sign = (text: string, x: number, y: number, z: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const c = canvas.getContext('2d')!;
      c.fillStyle = '#111f25e8';
      c.fillRect(0, 0, 512, 96);
      c.strokeStyle = '#d9bd83';
      c.strokeRect(3, 3, 506, 90);
      c.textAlign = 'center';
      c.fillStyle = '#f3e4be';
      c.font = '24px Alegreya';
      c.fillText(text, 256, 56, 490);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
      sprite.position.set(x, y, z);
      sprite.scale.set(5.4, 1, 1);
      live.signs.push(sprite);
      live.root.add(sprite);
    };
    const path = (knots: number[][], boardwalk = false) => {
      for (let n = 1; n < knots.length; n++) {
        const a = knots[n - 1],
          b = knots[n],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.01) continue;
        const steps = Math.ceil(length / 5),
          yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps,
            x = a[0] + (b[0] - a[0]) * t,
            z = a[1] + (b[1] - a[1]) * t;
          const y = boardwalk ? Math.max(SEA_LEVEL + 1.2, a[2] + (b[2] - a[2]) * t) : heightAt(x, z) + 0.06;
          const d = length / steps;
          const y0 = boardwalk ? Math.max(SEA_LEVEL + 1.2, a[2] + ((b[2] - a[2]) * k) / steps) : heightAt(x - (Math.sin(yaw) * d) / 2, z - (Math.cos(yaw) * d) / 2) + 0.06;
          const y1 = boardwalk ? Math.max(SEA_LEVEL + 1.2, a[2] + ((b[2] - a[2]) * (k + 1)) / steps) : heightAt(x + (Math.sin(yaw) * d) / 2, z + (Math.cos(yaw) * d) / 2) + 0.06;
          const pitch = -Math.atan2(y1 - y0, d),
            span = Math.hypot(d, y1 - y0) + 0.08;
          if (boardwalk) {
            mesh(new THREE.BoxGeometry(3.6, 0.24, span), wood, x, y - 0.12, z, yaw, pitch);
            live.colliders.push(
              physics.addBox(new THREE.Vector3(x, y - 0.12, z), new THREE.Vector3(1.8, 0.12, span / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')))
            );
            if (k % 3 === 0) mesh(new THREE.CylinderGeometry(0.14, 0.18, 3, 6), wood, x, y - 1.5, z);
          } else mesh(new THREE.PlaneGeometry(3.8, span), stone, x, y, z, yaw, -Math.PI / 2 + pitch);
        }
      }
    };
    if (isle) {
      isle.paths.forEach((p) => path(p));
      const land = at(isle.landing),
        sea = at(isle.sea);
      path(
        [
          [land.x, land.z, land.y],
          [sea.x, sea.z, SEA_LEVEL + 1.2],
        ],
        true
      );
      sign(isle.name, land.x, land.y + 2.6, land.z);
      const [wx, wz] = islandLandingWater(isle),
        dx = sea.x - land.x,
        dz = sea.z - land.z,
        len = Math.hypot(dx, dz) || 1;
      const lx = (wx - sea.x) * 0.74 + sea.x,
        lz = (wz - sea.z) * 0.74 + sea.z,
        yaw = Math.atan2(-dz, dx);
      for (const side of [-1, 1]) box(0.11, 3, 0.11, lx + ((side * dx) / len) * 0.48, SEA_LEVEL - 0.1, lz + ((side * dz) / len) * 0.48, wood);
      for (let y = SEA_LEVEL - 1.45; y < SEA_LEVEL + 1.4; y += 0.35) box(1, 0.075, 0.11, lx, y, lz, wood, yaw);
      // A silhouette you can recognise from the water; low-poly local vegetation.
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.399,
          x = isle.at[0] + Math.cos(angle) * (22 + i * 2),
          z = isle.at[1] + Math.sin(angle) * (22 + i * 2),
          h = heightAt(x, z);
        if (h < 0) continue;
        if (region === 'azureIsles') {
          mesh(new THREE.CylinderGeometry(0.15, 0.28, 7, 7), wood, x, h + 3.5, z);
          for (let f = 0; f < 5; f++) mesh(new THREE.ConeGeometry(1, 4.4, 4), leaves, x + Math.sin(f * 1.26) * 1.7, h + 6.7, z + Math.cos(f * 1.26) * 1.7, f * 1.26, 1);
        } else if (region !== 'emeraldIsles') {
          mesh(new THREE.DodecahedronGeometry(1 + i * 0.12, 0), stone, x, h + 0.5, z);
        }
      }
    }
    const link = HUB_LINKS.find((l) => l.island === id);
    if (link) path([link.from, [link.to[0], link.to[1], heightAt(link.to[0], link.to[1]) + 0.12]], true);
    for (const s of SITES.filter((s) => s.island === id)) {
      const h = s.kind === 'dive' ? s.h : heightAt(s.x, s.z);
      const x = s.x,
        z = s.z;
      sign(s.name, x, h + (s.kind === 'dive' ? 2.3 : 3.2), z);
      const lamp = new THREE.MeshStandardMaterial({ color: theme.color, emissive: this.d.flags[doneKey(s)] ? 0x7ac195 : theme.color, emissiveIntensity: 1.2, roughness: 0.4 });
      const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), lamp);
      jewel.position.set(x, h + 1.6, z);
      live.root.add(jewel);
      live.marks.set(s.id, lamp);
      if (s.kind === 'village') {
        for (const [dx, dz] of [
          [-13, -10],
          [13, -10],
          [-13, 10],
          [13, 10],
        ]) {
          const px = x + dx,
            pz = z + dz,
            gy = heightAt(px, pz);
          if (region === 'sunkenIsles' && dz > 0) {
            // The divers shelter among roofless keeper courts.
            box(7, 0.16, 6, px, gy + 0.08, pz, stone);
            box(7, 1.4, 0.5, px, gy + 0.7, pz + 2.75, stone, 0, true);
            for (const side of [-1, 1]) {
              box(0.55, 1.8, 6, px + side * 3.25, gy + 0.9, pz, stone, 0, true);
              box(0.65, 3.2, 0.65, px + side * 2.8, gy + 1.6, pz - 2.7, stone, 0, true);
            }
            box(6.3, 0.5, 0.65, px, gy + 3.3, pz - 2.7, stone);
            continue;
          }
          const house = buildHouse(
            { w: 7, d: 6, floors: 1, roof: region === 'emeraldIsles' ? 'thatch' : region === 'azureIsles' ? 'tile' : 'slate', seed: Math.round(px + pz) },
            {
              ...this.d.mats,
              plaster: this.tinted(
                region + ':plaster',
                this.d.mats.plaster,
                region === 'azureIsles' ? 0xfff3d9 : region === 'emeraldIsles' ? 0xa6ac89 : region === 'shatteredIsles' ? 0x8b7d73 : region === 'sunkenIsles' ? 0xb3c7c4 : 0x80625b
              ),
              timber: this.tinted(region + ':timber', this.d.mats.timber, theme.wood),
              slate: this.tinted(region + ':slate', this.d.mats.slate, region === 'shatteredIsles' ? 0x49444e : 0x93b3bf),
            }
          );
          house.group.position.set(px, gy, pz);
          house.group.rotation.y = dz > 0 ? Math.PI : 0;
          batch.addObject(house.group);
          house.group.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
          });
          live.colliders.push(physics.addBox(new THREE.Vector3(px, gy + house.half.y, pz), house.half, new THREE.Quaternion()));
        }
        mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.1, 12), stone, x - 6, h + 0.5, z + 5);
        mesh(new THREE.TorusGeometry(0.8, 0.15, 6, 16), stone, x, h + 0.2, z + 4, 0, -Math.PI / 2);
        mesh(new THREE.ConeGeometry(0.45, 1, 7), this.material('hearth', 0xefad52, true), x, h + 0.7, z + 4);
        box(4, 0.5, 0.7, x, h + 0.25, z + 7, wood, 0, true);
        box(4, 0.8, 1.6, x + 8, h + 0.4, z, wood);
        mesh(new THREE.PlaneGeometry(5, 3), cloth, x + 8, h + 2.5, z, 0, -Math.PI / 2);
      } else if (s.region === 'demonContinent' && s.kind === 'ward') {
        for (const side of [-1, 1]) {
          box(4, 9, 5, x + side * 7, h + 4.5, z + 2, stone, 0, true);
          box(4.6, 0.5, 5.6, x + side * 7, h + 9, z + 2, iron);
        }
        box(14, 1.3, 3, x, h + 8, z + 2, stone, 0, true);
        for (let i = -4; i <= 4; i++) box(0.14, 7, 0.22, x + i, h + 3.5, z + 2, iron);
        box(9, 6, 1, x, h + 3, z + 2, iron, 0, true);
      } else if (s.kind === 'ward' || s.kind === 'boss') {
        const r = s.kind === 'boss' ? 12 : 4;
        mesh(new THREE.RingGeometry(r - 0.3, r, 48), stone, x, h + 0.07, z, 0, -Math.PI / 2);
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3,
            px = x + Math.cos(a) * (r - 1),
            pz = z + Math.sin(a) * (r - 1);
          box(0.7, 2.8, 0.65, px, h + 1.4, pz, stone, a, true);
          mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 20), cloth, px, h + 2.2, pz, a);
        }
        if (s.kind === 'boss') {
          box(3, 0.8, 2, x, h + 0.4, z - 5, stone, 0, true);
          mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 40), cloth, x, h + 3, z - 6);
        }
      } else if (s.kind === 'camp') {
        for (const off of [-6, 6]) {
          mesh(new THREE.ConeGeometry(2.3, 3, 4), cloth, x + off, h + 1.5, z - 3, Math.PI / 4);
          box(1.2, 1, 1.1, x + off, h + 0.5, z + 3, wood, 0, true);
        }
        mesh(new THREE.TorusGeometry(1, 0.15, 6, 16), stone, x, h + 0.2, z + 6, 0, -Math.PI / 2);
      } else if (s.kind === 'resource') {
        for (let i = 0; i < 5; i++) {
          const a = i * 2.4;
          mesh(new THREE.OctahedronGeometry(0.35), region === 'emeraldIsles' ? leaves : cloth, x + Math.cos(a) * 1.2, h + 0.4, z + Math.sin(a) * 1.2);
        }
      } else if (s.kind === 'dive') {
        mesh(new THREE.TorusGeometry(3, 0.2, 8, 28), stone, x, h + 0.2, z, 0, -Math.PI / 2);
        for (const dx of [-3, 3]) box(0.6, 3, 0.6, x + dx, h + 1.5, z, stone, 0, true);
        box(1.6, 0.8, 0.9, x, h + 0.4, z, wood);
        const beacon = new THREE.PointLight(0x75d8ff, 4, 10);
        beacon.position.set(x, h + 2, z);
        beacon.visible = false;
        live.beacons.push(beacon);
        live.root.add(beacon);
      } else {
        box(1.6, 0.8, 1, x, h + 0.4, z, wood, 0, true);
        for (const dx of [-0.6, 0.6]) box(0.1, 0.85, 1.05, x + dx, h + 0.45, z, iron);
        mesh(new THREE.CylinderGeometry(0.09, 0.1, 4, 6), wood, x - 2, h + 2, z);
        mesh(new THREE.PlaneGeometry(1.8, 1.2), cloth, x - 1.2, h + 3.3, z);
      }
    }
    batch.build(live.root, 80);
  }
  private buildRecords() {
    for (const region of [...REGIONS, 'demonContinent'] as const) {
      const site = SITES.find((s) => s.region === region && s.kind === 'village')!;
      const info = OVERVIEW[region];
      const centre = pos(site);
      const places = new Map<string, Place>([
        ['post', { id: 'post', spots: [centre.clone().add(new THREE.Vector3(-6, 0, 0))] }],
        ['market', { id: 'market', spots: [centre.clone().add(new THREE.Vector3(8, 0, 2))] }],
        ['fire', { id: 'fire', spots: [centre.clone().add(new THREE.Vector3(0, 0, 6))], seated: true }],
      ]);
      const nodes = [...places.values()].map((p) => p.spots[0].clone());
      const settlement = 'isle-village:' + region;
      this.settlements.push({
        id: settlement,
        name: site.name,
        center: centre,
        radius: 230,
        places,
        nodes,
        edges: [
          [1, 2],
          [0, 2],
          [0, 1],
        ],
      });
      for (let i = 0; i < 3; i++)
        this.records.push({
          id: `isle-folk:${region}:${i}`,
          name:
            i === 0
              ? info[0]
              : i === 1
                ? { azureIsles: 'Pella Tidebasket', emeraldIsles: 'Moss Fenwick', shatteredIsles: 'Old Renn Salt', sunkenIsles: 'Diver Leth', demonContinent: 'Nesh Emberweft' }[
                    region
                  ]
                : `${site.name} Trailkeeper`,
          job: i === 0 ? 'guide' : i === 1 ? 'merchant' : 'innkeeper',
          title: i === 0 ? info[1] : i === 1 ? 'Island goods and field supplies' : 'Rest, food and a workbench',
          settlement,
          named: true,
          look: {
            body: i % 2 ? 'male' : 'female',
            outfit: region === 'azureIsles' ? 'peasant' : 'ranger',
            hair: i % 2 ? 'buzzed' : 'long',
            skin: region === 'demonContinent' ? 0xa75b49 : 0xc89973,
            cloth: this.theme(region).color,
            linen: 0xe6d5b3,
            height: 1.7 + i * 0.07,
          },
          schedule: [
            { from: 0, place: 'fire', activity: 'sit' },
            { from: 6, place: i === 0 ? 'post' : i === 1 ? 'market' : 'fire', activity: i === 1 ? 'shop' : 'idle' },
            { from: 21, place: 'fire', activity: 'sit' },
          ],
          lines: { any: [info[2], 'The trail posts lead inland. Ask the harbourmaster about the old sanctuaries.'] },
        });
    }
  }
  get voyaging() {
    return this.passage !== null;
  }
  private port(id: string) {
    const p = this.d.ports.find((p) => p.def.id === id);
    return p
      ? { id, name: p.def.name, zone: p.zone.clone(), landing: p.landing.clone() }
      : id === 'portAurelle'
        ? { id, name: 'Port Aurelle', zone: new THREE.Vector3(3000, 0, 150), landing: new THREE.Vector3(2930, heightAt(2930, 150) + 0.3, 150) }
        : null;
  }
  sail(from: string, to: string) {
    if (this.passage || this.d.sailing.aboard) return false;
    const a = this.port(from),
      b = this.port(to);
    if (!a || !b || from === to || this.d.player.pos.distanceTo(a.landing) > 180) return false;
    const fare = 40 + Math.round(a.zone.distanceTo(b.zone) / 70);
    if (this.d.gold() < fare) {
      this.d.toast(`Passage costs ${fare}g.`);
      return false;
    }
    const route = chartRoute(a.zone, b.zone, 2.4, b.name);
    if (!route) {
      this.d.toast('No safe charter route was found. Try a neighbouring harbour or a shallower boat.');
      return false;
    }
    this.d.addGold(-fare);
    this.passage = to;
    this.d.flags['isle:passage'] = to;
    this.d.sailing.charter('The Four Winds', 'brigantine', [a.zone.x, a.zone.z, Math.atan2(b.zone.x - a.zone.x, b.zone.z - a.zone.z)], route.points, 22, () => this.arrive(to));
    this.d.save();
    this.d.toast(`The Four Winds casts off for ${b.name}. Rest below to skip to landfall.`);
    return true;
  }
  skipPassage() {
    if (this.passage) this.d.sailing.charterSkip();
  }
  private arrive(id: string) {
    const p = this.port(id);
    if (!p) {
      delete this.d.flags['isle:passage'];
      return;
    }
    if (this.d.sailing.aboard) this.d.sailing.leaveShip(p.landing.clone());
    this.d.sailing.endCharter();
    this.passage = null;
    delete this.d.flags['isle:passage'];
    this.d.player.teleport(p.landing.clone().setY(heightAt(p.landing.x, p.landing.z) + 0.4));
    this.d.toast('The Four Winds makes landfall at ' + p.name + '.');
    this.d.save();
  }
  services() {
    const services = new Map<string, (show: (text: string, opts: Opt[]) => void, back: () => void) => Opt[]>();
    for (const p of this.d.ports) {
      const region =
        p.def.style === 'azure'
          ? 'azureIsles'
          : p.def.style === 'emerald'
            ? 'emeraldIsles'
            : p.def.style === 'pirate'
              ? 'shatteredIsles'
              : p.def.style === 'sunken'
                ? 'sunkenIsles'
                : 'demonContinent';
      services.set(p.harbourmaster, (_show, back) => [
        { label: 'Island trails and field journal', run: () => this.journal(region) },
        { label: 'Passage on the Four Winds', run: () => this.passages(p.def.id, back) },
      ]);
    }
    services.set('tallow', (_show, back) => [{ label: 'Passage to the islands on the Four Winds', run: () => this.passages('portAurelle', back) }]);
    for (const region of [...REGIONS, 'demonContinent'] as const) {
      const material = this.theme(region).material;
      services.set(`isle-folk:${region}:0`, () => [{ label: 'Tell me about these islands.', run: () => this.journal(region) }]);
      services.set(`isle-folk:${region}:1`, () => [
        {
          label: 'Buy a trail ration — 18g',
          run: () => {
            if (this.d.gold() < 18) return this.d.toast('A ration costs 18g.');
            this.d.addGold(-18);
            this.d.give('islandTrailRation', 1);
            this.d.save();
          },
        },
        {
          label: 'Sell three local materials — 75g',
          run: () => {
            const items = this.d.player.equip.items.filter((i) => i.def.id === material);
            if (items.reduce((n, i) => n + i.qty, 0) < 3) return this.d.toast('Bring three local materials.');
            let left = 3;
            for (const i of items) {
              const n = Math.min(left, i.qty);
              for (let k = 0; k < n; k++) this.d.player.equip.consume(i.uid);
              left -= n;
              if (!left) break;
            }
            this.d.addGold(75);
            this.d.save();
          },
        },
      ]);
      services.set(`isle-folk:${region}:2`, () => [
        {
          label: 'Rest by the shelter fire — 12g',
          run: () => {
            if (this.d.gold() < 12) return this.d.toast('A bed and a meal cost 12g.');
            this.d.addGold(-12);
            this.d.rest();
            this.d.close();
          },
        },
        {
          label: 'Use the island kitchen',
          run: () => {
            this.d.close();
            this.d.craft('kitchen', this.theme(region).name);
          },
        },
        {
          label: 'Use the island workbench',
          run: () => {
            this.d.close();
            this.d.craft('workbench', this.theme(region).name);
          },
        },
      ]);
    }
    return services;
  }
  private passages(from: string, back: () => void) {
    const a = this.port(from)!;
    this.d.talk('The Four Winds', 'Island passages', 'A charted passage aboard a working ship. You can walk the deck or rest below until landfall.', [
      ...['portAurelle', ...this.d.ports.map((p) => p.def.id)]
        .filter((id) => id !== from)
        .map((to) => {
          const b = this.port(to)!;
          const fare = 40 + Math.round(a.zone.distanceTo(b.zone) / 70);
          return {
            label: `${b.name} — ${fare}g`,
            run: () => {
              this.d.close();
              this.sail(from, to);
            },
          };
        }),
      { label: 'Back.', run: back },
    ]);
  }
}
