import * as THREE from 'three';
import { events } from '../../core/events';
import { heightAt } from '../terrainHeight';
import { IronKettle } from '../sea/ironKettle';
import { buildKettleCove, type KettleCoveBuilt } from './kettleCove';
import { MOUNTAIN_QUESTS } from '../../quests/mountainQuests';
import { readMountainSave, writeMountainSave, freshMountainSave, type MountainSave } from './mountainState';
import { MTN_PLACES } from './mountainData';
import { PORT_SPOTS } from '../portAurelle';
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
  private visible = true;
  private landmarkT = 0;

  constructor(private d: MountainDeps) {
    this.state = readMountainSave(d.flags);
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

    // Great deeds for the mountains' landmarks, bosses and chapters.
    events.on('questChanged', ({ id, status }) => {
      if (status !== 'done') return;
      if (id === 'mtn-kings-audience' || id === 'mtn-engine-below') this.deed('chapter:' + id, 3, MOUNTAIN_QUESTS.find((q) => q.id === id)!.title);
    });
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
    if (this.d.realm.mode === 'overworld') this.kettle.preStep(dt);
  }

  /** Every frame. */
  frame(dt: number) {
    const overworld = this.d.realm.mode === 'overworld' && this.visible;
    if (overworld) {
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
  }

  /** Back to a new game's mountains (tests). */
  async reset() {
    this.kettle.reset();
    this.state = freshMountainSave();
    this.kettle.atPort();
  }
}
