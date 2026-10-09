import * as THREE from 'three';
import type { Player } from '../player/player';
import type { Input } from '../core/input';
import type { ThirdPersonCamera } from '../player/camera';
import type { SkillRuntime } from '../paths/skills';
import type { FX } from '../fx/particles';
import type { HUD } from '../ui/hud';
import type { DialogueUI } from '../ui/dialogue';
import type { ShopUI } from '../ui/shopUI';
import type { QuestLog } from '../quests/questLog';
import type { Realm } from '../dungeon/realm';
import { targets } from '../combat/targets';
import { regionAt } from '../world/worldMap';
import { REGIONS } from '../world/regionDefinitions';
import { skillIcon } from '../ui/skillTree';
import { Origins } from './origins';

// How the origins plug into the rest of the game, kept here so main.ts only
// needs one line per wiring site: the deps the runtime reads, V, origin
// abilities on the moves bar ("origin:<id>"), NPCs' first words and prices.

export interface OriginsWiring {
  player: Player;
  skillRt: SkillRuntime;
  fx: FX;
  scene: THREE.Scene;
  input: Input;
  cam: ThirdPersonCamera;
  hud: HUD;
  dialogue: DialogueUI;
  shopUI: ShopUI;
  quests: QuestLog;
  realm: Realm;
  time: { state: { night: number } };
  weather: { p: { storm: number } };
  gravewood: { curse: number };
  foraging: unknown;
}

export function wireOrigins(w: OriginsWiring) {
  const { player, skillRt, hud, realm, quests } = w;
  const here = () => (realm.mode !== 'overworld' && realm.interior ? regionAt(realm.interior.door.pos.x, realm.interior.door.pos.z) : regionAt(player.pos.x, player.pos.z));
  const origins = new Origins({
    player, rt: skillRt, fx: w.fx, scene: w.scene, input: w.input, cam: w.cam,
    toast: (m) => hud.toast(m),
    mode: () => realm.mode,
    night: () => w.time.state.night,
    region: here,
    curse: () => w.gravewood.curse,
    storm: () => w.weather.p.storm,
    mainQuestTitle: (id) => {
      const q = quests.defs.get(id);
      return q?.main ? q.title : null;
    },
    questXp: (id) => quests.defs.get(id)?.rewards.xp ?? 0,
    senses: () => {
      const herbs: THREE.Vector3[] = [], ore: THREE.Vector3[] = [], secrets: THREE.Vector3[] = [];
      const nodes = (w.foraging as { nodes?: Map<string, { pos: THREE.Vector3 }> }).nodes;
      if (nodes instanceof Map) for (const n of nodes.values()) if (n.pos.distanceTo(player.pos) < 30) herbs.push(n.pos);
      for (const it of realm.interactables) {
        if (it.pos.distanceTo(player.pos) > 32 || !it.enabled()) continue;
        const l = it.label();
        if (/\b(ore|vein|gem|crystal|mithril|star-iron)\b/i.test(l) && !/mined out/i.test(l)) ore.push(it.pos);
        else if (/secret|hidden|loose stone/i.test(l)) secrets.push(it.pos);
      }
      return { herbs, ore, secrets };
    },
    foes: () => [...targets],
  });
  origins.setFaction(() => REGIONS[here()]?.faction ?? 'cresha');
  player.originAbility = () => origins.abilities.pressV();

  // Origin abilities on the moves bar.
  const useSkill = skillRt.use.bind(skillRt);
  skillRt.use = (ref: string) => (ref.startsWith('origin:') ? origins.abilities.use(ref.slice(7)) : useSkill(ref));
  const slot = hud.skillSlot;
  hud.skillSlot = (ref) => {
    if (!ref.startsWith('origin:')) return slot?.(ref) ?? null;
    const id = ref.slice(7), x = origins.abilities.tier(id);
    if (!x) return null;
    const c = x.t.cost ?? {};
    const why = origins.abilities.blocked(id);
    return {
      svg: skillIcon('legendaryHero', '--c-gold', x.t.name, Math.max(0, x.i + 1)),
      name: `${x.t.name} (${origins.def.name})`,
      cost: c.stamina ? `${c.stamina}` : c.mana ? `${c.mana}` : c.hpPct ? `${c.hpPct}%HP` : c.energy ? `${c.energy}E` : '',
      cd: x.t.cd ? origins.abilities.cooldown(id) / x.t.cd : 0,
      ready: !why || why === 'busy',
    };
  };

  // People react to what you are: a first line, and a little on the price.
  const show = w.dialogue.show.bind(w.dialogue);
  w.dialogue.show = (name, title, text, opts) => show(name, title, w.dialogue.open ? text : origins.greet(name, text), opts);
  const shop = w.shopUI.show.bind(w.shopUI);
  w.shopUI.show = (o) => {
    const k = origins.priceFactor();
    shop(k === 1 ? o : { ...o, stock: o.stock.map(([id, price]) => [id, Math.max(1, Math.round(price * k))] as [string, number]) });
  };
  return origins;
}
