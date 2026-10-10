import * as THREE from 'three';
import { events } from '../../core/events';
import { heightAt } from '../terrainHeight';
import { IronKettle } from '../sea/ironKettle';
import { buildKettleCove, type KettleCoveBuilt } from './kettleCove';
import { MOUNTAIN_QUESTS } from '../../quests/mountainQuests';
import { readMountainSave, writeMountainSave, freshMountainSave, type MountainSave } from './mountainState';
import { MTN_PLACES } from './mountainData';
import { PORT_SPOTS } from '../portAurelle';
import { buildWhiteMountains, ZoneSpawner, type WhiteBuilt } from './whiteMountains';
import { ColdMeter } from './cold';
import { Avalanches } from './avalanche';
import { CAIRNS } from './mountainData';
import { DeepRealm } from '../../deep/deepRealm';
import { CollapsedShaft } from '../../deep/collapsedShaft';
import { Bandit } from '../../enemies/bandit';
import { LOOKS } from './mountainFolk';
import type { Renderer } from '../../render/renderer';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Input } from '../../core/input';
import type { ThirdPersonCamera } from '../../player/camera';
import type { HUD } from '../../ui/hud';
import type { DialogueUI, DialogueOption } from '../../ui/dialogue';
import type { QuestLog } from '../../quests/questLog';
import type { Sailing } from '../sea/sailing';
import type { Realm } from '../../dungeon/realm';
import type { NpcManager, Settlement } from '../../npc/npcManager';
import type { WorldTime } from '../worldTime';
import type { Weather } from '../weather';
import type { Rewards } from '../../progression/progression';
import type { DungeonMapUI } from '../../ui/dungeonMap';
import type { Discovery } from '../discovery';
import type { IslandPort } from '../sea/islandPorts';
import type { Interactable } from '../../dungeon/instance';

// The White and Deep Mountains (docs/design/mountains.md, World Expansion
// phase 10): everything the update adds, behind one object that main.ts
// builds once and calls each step and frame. The Iron Kettle's voyage and
// Kettle Cove; the surface region (Copperbrook, the claim, Stonegate, the
// passes with their cold, blizzards and avalanches, Frostpeak Citadel and the
// glacier eyrie); the Great Lift down to the underground realm (the Deep
// Hold and its Forge, the Colossal Caverns, the Old Roads, the Engine
// Below); and the quests that tie them together.

type Show = (t: string, opts: DialogueOption[]) => void;
type FolkService = (show: Show, back: () => void) => DialogueOption[];

export interface MountainDeps {
  r: Renderer;
  mats: WorldMats;
  fx: FX;
  player: Player;
  input: Input;
  cam: ThirdPersonCamera;
  hud: HUD;
  dialogue: DialogueUI;
  quests: QuestLog;
  sailing: Sailing;
  realm: Realm;
  npcs: NpcManager;
  time: WorldTime;
  weather: Weather;
  flags: Record<string, boolean | number | string>;
  rewards: Rewards;
  mapUI: DungeonMapUI;
  discovery: Discovery;
  islands: { ports: IslandPort[]; settlements: Settlement[] };
  folkServices: Map<string, FolkService>;
  give(id: string, n: number): void;
  count(id: string): number;
  take(id: string, n: number): void;
  shop(name: string, title: string, intro: string, stock: [string, number][], wants?: [string, number][]): void;
  save(): void;
}

/** First visits that count as great deeds (Renown). */
const LANDMARKS: [string, string, [number, number], number][] = [
  ['kettleCove', 'Made landfall at Kettle Cove', MTN_PLACES.kettleCove, 90],
  ['frostpeakCitadel', 'Climbed to Frostpeak Citadel', MTN_PLACES.frostpeak, 110],
];

export class Mountains {
  state: MountainSave;
  readonly kettle: IronKettle;
  readonly cove: KettleCoveBuilt;
  /** everything the overworld can interact with (pushed into the realm's list once) */
  readonly interactables: Interactable[] = [];
  readonly white: WhiteBuilt;
  readonly zones: ZoneSpawner;
  readonly cold = new ColdMeter();
  readonly avalanches: Avalanches;
  readonly deep: DeepRealm;
  /** Marta's claim-jumpers, when it comes to a fight */
  jumpers: Bandit[] = [];
  private visible = true;
  private landmarkT = 0;
  private stewCount = 0;
  private persistT = 0;

  constructor(private d: MountainDeps) {
    this.state = readMountainSave(d.flags);
    this.cold.value = this.state.cold;
    const { quests, sailing, player } = d;
    quests.add(...MOUNTAIN_QUESTS);

    // ---- Kettle Cove and the Iron Kettle ----
    const port = d.islands.ports.find((p) => p.def.id === 'kettleCove')!;
    const home = d.islands.settlements.find((s) => s.id === 'kettleCove')!;
    this.cove = buildKettleCove(d.r.scene, d.mats, port, home, player, (up) => {
      if (up) quests.signal('winch-ridden');
    });
    for (const rec of this.cove.records) d.npcs.add(rec);
    this.interactables.push(...this.cove.interactables);
    this.kettle = new IronKettle(d.r.scene, d.fx, player, sailing, {
      toast: (m) => d.hud.toast(m),
      signal: (id) => { quests.signal(id); },
      slainMonster: () => sailing.stats.monsters > 0,
      reveal: (x, z, r) => d.discovery.revealAround(x, z, r),
      dock: (id) => {
        const s = sailing as unknown as { portAt(p: THREE.Vector3): { id: string } | null };
        const ship = this.kettle.ship;
        const p = ship ? s.portAt(ship.pos) : null;
        if (!p || p.id !== id) return false;
        sailing.dock(p as Parameters<Sailing['dock']>[0]);
        this.kettle.atCove(this.cove.berth);
        return true;
      },
      save: () => this.persist(),
    });
    this.kettle.atPort();
    this.kettle.cove.copy(port.landing);
    this.interactables.push(this.kettle.interactable);

    // Sailing day: boarding the Kettle (the expedition's last step) starts the voyage.
    quests.hooks.set('dwarf-expedition:done', () => {
      if (quests.status('mtn-iron-kettle') === 'available') quests.accept('mtn-iron-kettle');
    });
    quests.hooks.set('mtn:voyage', () => {
      if (!this.kettle.voyage) this.kettle.startVoyage(this.state.kettle?.at === 'sea' ? this.state.kettle : null);
      this.persist();
    });
    quests.hooks.set('mtn-iron-kettle:done', () => {
      if (!this.kettle.voyage) this.kettle.atCove(this.cove.berth);
      if (quests.status('mtn-landing') === 'available') quests.accept('mtn-landing');
      this.persist();
    });

    // Hamm's passage between the cove and Port Aurelle.
    const fare = 40;
    const passage = (to: 'cove' | 'port') => {
      if (player.prog.gold < fare) return d.hud.toast(`Passage on the Iron Kettle is ${fare} gold.`);
      player.prog.addGold(-fare);
      d.dialogue.close();
      d.time.skipTo((d.time.hour + 5) % 24);
      const at = to === 'cove' ? port.landing.clone() : PORT_SPOTS.berth.clone().add(new THREE.Vector3(-8, 0, 0));
      player.teleport(at.setY(heightAt(at.x, at.z) + 0.5));
      d.hud.toast(to === 'cove' ? 'Five hours of smoke and spray, and the cliffs of Kettle Cove close round the Iron Kettle.' : 'The Iron Kettle puffs into Port Aurelle on the evening tide.');
      d.save();
    };
    d.folkServices.set('hamm', () => (quests.isDone('mtn-iron-kettle') ? [{ label: `Passage to Port Aurelle on the Iron Kettle — ${fare}g`, run: () => passage('port') }] : []));
    this.interactables.push({
      pos: PORT_SPOTS.berth.clone().setY(1), radius: 5,
      label: () => (quests.isDone('mtn-iron-kettle') ? `Take passage on the Iron Kettle to Kettle Cove (${fare}g)` : ''),
      enabled: () => quests.isDone('mtn-iron-kettle'),
      action: () => passage('cove'),
    });

    // ---- The surface: the road, Copperbrook, the claim, Stonegate, the cairns ----
    this.white = buildWhiteMountains(d.r.scene, d.mats);
    for (const st of this.white.settlements) d.npcs.addSettlement(st);
    for (const rec of this.white.records) d.npcs.add(rec);
    this.zones = new ZoneSpawner(d.r.scene, d.fx);
    this.avalanches = new Avalanches(d.r.scene, d.fx);
    this.deep = new DeepRealm(d.realm, d.r, player, d.cam, d.hud, d.mapUI, () => d.count('minersLantern') > 0);
    this.deep.onSave = () => d.save();
    this.setupSurface();
    this.setupClaim();
    this.setupPasses();

    // Great deeds for the mountains' landmarks, bosses and chapters.
    events.on('questChanged', ({ id, status }) => {
      if (status !== 'done') return;
      if (id === 'mtn-kings-audience' || id === 'mtn-engine-below') this.deed('chapter:' + id, 3, MOUNTAIN_QUESTS.find((q) => q.id === id)!.title);
    });
  }

  // ---- the foothills and Copperbrook -----------------------------------------------------

  private setupSurface() {
    const d = this.d;
    const P = MTN_PLACES;
    d.folkServices.set('gorm', () => [{
      label: 'Browse Gorm\u2019s cloaks, crossbows and stew',
      run: () => d.shop('Gorm Hammerhand', 'Smith of Copperbrook', 'Fur for the passes, steel for the trolls, and stew for the both of us.', [['furCloak', 140], ['dwarfStew', 12], ['dwarvenCrossbow', 380], ['healthPotion', 24], ['minersLantern', 40]], [['ironOre', 9], ['gemRuby', 70], ['gemSapphire', 70], ['mithrilOre', 160]]),
    }]);
    // The foothills' and the passes' creatures.
    this.zones.add('foothillWolves', [4870, -4490], [['snowWolf', 0, 0], ['snowWolf', 5, 3], ['snowWolf', -4, 5]], 1, 200);
    this.zones.add('claimWolves', [4420, -4560], [['snowWolf', 0, 0], ['snowWolf', 4, -3], ['snowWolf', -3, -5], ['snowWolf', 6, 4]], 1.1, 180);
    this.zones.add('stonegateTrolls', [4205, -4830], [['rockTroll', -6, 0], ['rockTroll', 8, 10]], 1, 200, () => this.d.quests.isDone('mtn-kings-audience'));
    this.zones.add('highRoadWolves', [3640, -5150], [['snowWolf', 0, 0], ['snowWolf', 5, 3], ['snowWolf', -4, 6], ['snowWolf', 3, -5]], 1.4, 200);
    this.zones.add('yeti', [3420, -5240], [['yeti', 0, 0]], 1, 160, () => this.d.quests.isDone('mtn-yeti-cave'));
    // The shaft under the claim.
    const mouth = new THREE.Vector3(P.shaftMouth[0], heightAt(P.shaftMouth[0], P.shaftMouth[1]), P.shaftMouth[1]);
    this.interactables.push({
      pos: mouth, radius: 3.4,
      label: () => 'Climb down into the Collapsed Shaft',
      enabled: () => d.quests.isActive('mtn-collapsed-shaft') || d.quests.isDone('mtn-collapsed-shaft'),
      action: () => void this.enterShaft(),
    });
  }

  /** Down the ladder into the Collapsed Shaft. */
  enterShaft() {
    const d = this.d;
    const [x, z] = MTN_PLACES.shaftMouth;
    let shaft: CollapsedShaft | null = null;
    return this.deep.enter(() => (shaft = new CollapsedShaft(d.r.scene, d.fx, {
      toast: (m) => d.hud.toast(m),
      rescued: () => this.state.rescued,
      rescue: (i, name) => {
        if (!this.state.rescued.includes(i)) this.state.rescued.push(i);
        d.quests.signal('miner-rescued');
        d.hud.toast(`${name} crawls free of the rubble and makes for the ladder.`);
        this.persist();
      },
      climbOut: () => {
        const golemDown = !shaft?.golem?.alive;
        if (this.state.rescued.length >= 3 && golemDown) d.quests.signal('shaft-escaped');
        else if (d.quests.isActive('mtn-collapsed-shaft')) d.hud.toast(this.state.rescued.length < 3 ? 'There are still miners down here.' : 'The thing in the chamber is still moving down there.');
        void this.deep.leave({ pos: new THREE.Vector3(x + 3, 0, z + 4), yaw: 0 });
      },
    })), { from: { pos: new THREE.Vector3(x + 3, 0, z + 4), yaw: 0 }, toast: 'The Collapsed Shaft. Somewhere ahead, someone is tapping on stone.' });
  }

  // ---- the first claim: share, buy, or fight -----------------------------------------------

  private setupClaim() {
    const d = this.d;
    const settle = (how: 'shared' | 'bought' | 'fought', say: string) => {
      this.state.claim = how;
      d.quests.signal('claim-settled');
      this.persist();
      d.dialogue.show('Marta Hollins', 'Mine-boss of the Copperbrook Seam', say, [{ label: 'Farewell.', run: () => d.dialogue.close() }]);
    };
    d.folkServices.set('marta', (show) => {
      if (!d.quests.wants('claim-settled') || this.jumpers.length) return [];
      return [
        { label: 'Share the seam: half for Bruni\u2019s company, half for your miners', run: () => settle('shared', 'Half. With dwarves who know the deep veins, and a king who\u2019ll buy the ore... Done. Tell Stonevein she has partners.') },
        { label: 'Buy her out \u2014 500g', run: () => {
          if (d.player.prog.gold < 500) return show('Five hundred, and not a copper less. I\u2019ve twenty years in that hole.', [{ label: 'Back.', run: () => d.dialogue.close() }]);
          d.player.prog.addGold(-500);
          settle('bought', 'Five hundred. That\u2019s a new start somewhere warm. ...Take care of my people, if they stay on. They\u2019re good diggers.');
        } },
        { label: 'Then we settle it the old way.', run: () => this.claimFight() },
      ];
    });
  }

  /** Marta's miners come at you with picks. */
  claimFight() {
    const d = this.d;
    d.dialogue.close();
    d.hud.toast('Marta Hollins: "Lads! Run them off!"');
    const [cx, cz] = MTN_PLACES.claim;
    for (const [dx, dz] of [[4, 6], [-5, 5], [7, -2]]) {
      const at = new THREE.Vector3(cx + dx, heightAt(cx + dx, cz + dz) + 0.2, cz + dz);
      const b = new Bandit('sword', at, d.r.scene, d.sailing.bolts, at.clone(), dx > 0 ? LOOKS.minerM : LOOKS.minerF);
      b.name = 'Claim-jumper';
      b.kind = 'claimJumper';
      b.alerted = true;
      this.jumpers.push(b);
    }
  }

  // ---- the passes: the cold, blizzards, avalanches and the lantern cairns ----------------

  private setupPasses() {
    const d = this.d;
    for (const i of this.state.cairns) this.lightCairn(i, false);
    CAIRNS.forEach(([x, z], i) => {
      this.interactables.push({
        pos: new THREE.Vector3(x, heightAt(x, z), z), radius: 2.6,
        label: () => 'Relight the lantern cairn',
        enabled: () => !this.state.cairns.includes(i),
        action: () => this.lightCairn(i, true),
      });
    });
    this.avalanches.onOutrun = () => {
      d.quests.signal('avalanche-outrun');
      d.hud.toast('The avalanche thunders past behind you. Sideways. Always sideways.');
    };
    this.avalanches.onBuried = () => d.hud.toast('The snow takes you off your feet and buries you. You claw your way out, half frozen.');
    // A hot meal (Gorm's stew) warms you for a long while.
    this.stewCount = d.count('dwarfStew');
  }

  /** Relight a lantern cairn (saved; stays lit). */
  lightCairn(i: number, fresh: boolean) {
    const lamp = this.white.cairnLamps[i], glow = this.white.cairnGlows[i];
    if (lamp) lamp.emissiveIntensity = 2.4;
    if (glow) (glow.material as THREE.SpriteMaterial).opacity = 0.85;
    if (!fresh) return;
    if (!this.state.cairns.includes(i)) this.state.cairns.push(i);
    this.d.quests.signal('cairn-lit');
    this.d.hud.toast(`The cairn's lantern catches and burns: ${this.state.cairns.length} of ${CAIRNS.length} along the road.`);
    this.persist();
  }

  /** A great deed: Renown for the Legendary Hero (feat/origins listens). */
  deed(id: string, renown: number, label: string) {
    events.emit('deed', { id, renown, label });
  }

  /** Write the mountains' state into the save's flags. */
  persist() {
    this.state.kettle = this.kettle.toJSON();
    writeMountainSave(this.d.flags, this.state);
  }

  /** Every simulation step, before the player moves. */
  preStep(dt: number) {
    const d = this.d;
    if (this.deep.active) {
      this.deep.update(dt);
      return;
    }
    if (d.realm.mode !== 'overworld') return;
    this.kettle.preStep(dt);
    const p = d.player;
    // The cold, and what warms you.
    const n = d.count('dwarfStew');
    if (n < this.stewCount) this.cold.meal = 300;
    this.stewCount = n;
    this.cold.update(dt, p, { weather: d.weather.p, night: d.time.state.night, fires: [...this.white.fires, ...this.cove.fires], shelters: this.white.shelters, origin: String(p.prog.origin ?? '') });
    this.persistT -= dt;
    if (this.persistT <= 0 && this.cold.active) {
      this.persistT = 5;
      this.state.cold = this.cold.value;
      this.persist();
    }
    this.avalanches.update(dt, p);
    this.zones.blizzard = d.weather.p.snow > 0.8 && d.weather.p.wind > 0.8 ? 1 : 0;
    if (Math.hypot(p.pos.x - 3800, p.pos.z + 5000) < 2600) this.zones.update(dt, p);
    // The claim-jumpers.
    if (this.jumpers.length) {
      for (const b of this.jumpers) b.update(dt, p);
      if (this.jumpers.every((b) => !b.alive)) {
        for (const b of this.jumpers) b.dispose();
        this.jumpers = [];
        if (d.quests.wants('claim-settled')) {
          this.state.claim = 'fought';
          d.quests.signal('claim-settled');
          d.hud.toast('Marta Hollins throws down her pick. "Fine! Take it. Take the whole cursed valley."');
          this.persist();
        }
      }
    }
  }

  /** The blizzard closes in: twenty metres of white (the post haze), over the region's own weather. */
  private blizzardHaze() {
    const d = this.d, u = d.r.post?.finalMat.uniforms;
    const w = d.weather.p;
    const k = this.cold.active ? Math.max(0, Math.min(1, (w.snow - 0.7) / 0.3)) * Math.max(0, Math.min(1, (w.wind - 0.6) / 0.4)) : 0;
    if (k <= 0.001 || !u) return;
    const white = new THREE.Color(0.86, 0.9, 0.95);
    u.uHaze.value += k * 0.09;
    (u.uHazeColor.value as THREE.Color).lerp(white, k);
    (u.uSunColor.value as THREE.Color).lerp(white, k * 0.8);
    u.uMist.value = Math.max(u.uMist.value, k * 0.8);
    u.uClouds.value *= 1 - k;
  }

  /** Every frame. */
  frame(dt: number) {
    const overworld = this.d.realm.mode === 'overworld' && this.visible;
    if (overworld) {
      this.blizzardHaze();
      this.kettle.frame(dt);
      this.cove.update(dt);
      this.landmarkT -= dt;
      if (this.landmarkT <= 0) {
        this.landmarkT = 1;
        const p = this.d.player.pos;
        for (const [id, label, [x, z], r] of LANDMARKS) {
          if (this.state.visited.includes(id) || Math.hypot(p.x - x, p.z - z) > r) continue;
          this.state.visited.push(id);
          this.deed('place:' + id, 1, label);
          this.persist();
        }
      }
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.cove.setVisible(v);
    this.kettle.setVisible(v);
    this.white.group.visible = v;
    this.zones.setVisible(v);
    this.avalanches.setVisible(v);
    if (!v) this.cold.hide();
  }

  /** Back to a new game's mountains (tests). */
  async reset() {
    this.deep.forceLeave();
    this.kettle.reset();
    for (const b of this.jumpers) b.dispose();
    this.jumpers = [];
    this.zones.clear();
    this.avalanches.clear();
    this.cold.value = 1;
    this.cold.meal = 0;
    for (const i of this.state.cairns) {
      const lamp = this.white.cairnLamps[i], glow = this.white.cairnGlows[i];
      if (lamp) lamp.emissiveIntensity = 0;
      if (glow) (glow.material as THREE.SpriteMaterial).opacity = 0;
    }
    this.state = freshMountainSave();
    this.kettle.atPort();
  }
}
