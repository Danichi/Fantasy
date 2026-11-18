import * as THREE from 'three';
import { WhiteMountains } from './whiteMountains';
import { IronKettle } from './ironKettle';
import { COLD_VEIN, CAIRNS } from './mountainLayout';
import { MOUNTAIN_QUESTS } from '../../quests/mountainQuests';
import { coldVeinDef } from '../../dungeon/dungeons/coldVein';
import { Bandit, Bolts } from '../../enemies/bandit';
import { heightAt } from '../terrainHeight';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { QuestLog } from '../../quests/questLog';
import type { Sailing } from '../sea/sailing';
import type { Realm } from '../../dungeon/realm';
import type { Story } from '../../story/story';

// Hooks the White Mountains into the game (main.ts calls this once): the
// world, the Iron Kettle's passage, the quests and their world scripts, the
// people's services, and the story beats they touch.

type Opt = { label: string; run: () => void };
type Show = (text: string, opts: Opt[]) => void;

export interface MountainWiring {
  scene: THREE.Scene;
  mats: WorldMats;
  fx: FX;
  player: Player;
  quests: QuestLog;
  sailing: Sailing;
  realm: Realm;
  flags: Record<string, boolean | number | string>;
  story: () => Story | null;
  toast(m: string): void;
  card(title: string, sub: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  talk(name: string, title: string, text: string, opts: Opt[]): void;
  close(): void;
  save(): void;
  give(id: string, n: number): void;
  shake(n: number): void;
  storm(on: boolean): void;
  gold(): number;
  addGold(n: number): void;
  hour(): number;
  shop(id: string, intro: string, stock: [string, number][]): void;
  craft(kind: 'forge' | 'kitchen' | 'runestone' | 'loom', where: string): void;
  rest(): void;
}

export function setupMountains(d: MountainWiring) {
  const mountains = new WhiteMountains(d.scene, d.mats, d.fx, d.player, {
    toast: d.toast, card: d.card, flags: d.flags, save: d.save, close: d.close, bossBar: d.bossBar, shake: d.shake, give: d.give,
    signal: (id) => d.quests.signal(id),
    talk: (t, s, text, opts) => d.talk(t, s, text, opts),
    attune: (id) => {
      const st = d.story();
      if (st?.wheel.attune(id)) d.toast('The Sunwheel knows you now. You can travel here from any other wheel.');
    },
  });
  const kettle = new IronKettle({
    sailing: d.sailing, player: d.player, flags: d.flags, toast: d.toast, card: d.card, storm: d.storm, save: d.save, shake: d.shake,
    signal: (id) => d.quests.signal(id),
    ground: (x, z) => heightAt(x, z),
  });
  // Resting in the Kettle's cabin sleeps the passage away: up on deck, landfall close.
  d.sailing.onCharterRest = () => {
    void (async () => {
      if (d.realm.interior) await d.realm.leaveInterior();
      if (d.sailing.inCabin) d.sailing.leaveCabin();
      kettle.rest();
    })();
  };
  // The Cold Vein: its mouth is in the bank east of Copperbrook.
  const [mx, mz] = COLD_VEIN.at;
  const door = new THREE.Vector3(mx - 1.5, heightAt(mx - 1.5, mz), mz);
  const out = new THREE.Vector3(mx - 7, 0, mz);
  d.realm.registerKit(coldVeinDef(), door, out, COLD_VEIN.yaw, 'Go down into the Cold Vein');

  d.quests.add(...MOUNTAIN_QUESTS);
  // The claim, settled the old way: Tomas Hollins, first to yield.
  const bolts = new Bolts(d.scene);
  let tomas: Bandit | null = null;
  d.quests.hooks.set('claim:brawl', () => {
    if (tomas || d.quests.wants('claim-won') === false) return;
    const at = new THREE.Vector3(mx - 14, 0, mz + 3);
    at.y = heightAt(at.x, at.z);
    tomas = new Bandit('sword', at, d.scene, bolts, at.clone(), { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x6a4a2a, skin: 0xe0b894, linen: 0xc8b898, cloth: 0x5a4a3a, height: 1.9 });
    tomas.name = tomas.label = 'Tomas Hollins';
    tomas.kind = 'claimBrawler';
    tomas.maxHp = tomas.hp = 260;
    tomas.hitDamage = 9;
    tomas.nonLethal = true;
    tomas.alerted = true;
    d.toast('Tomas Hollins rolls his shoulders and draws. "Nothing personal, sky-born."');
  });
  d.quests.hooks.set('claim:buy', () => {
    if (d.gold() >= 250) d.addGold(-250);
  });

  // ---- the people's services ----
  const services = new Map<string, (show: Show, back: () => void) => Opt[]>();
  services.set('hamm', (show, back) => [
    ...(kettle.voyaging ? [] : [{ label: 'Sail home to Port Aurelle on the Kettle', run: () => {
      d.close();
      if (!kettle.sail('south')) d.toast('Not while you\'re aboard another ship.');
    } }]),
    { label: 'About the mountains', run: () => show('Up the Winch is Copperbrook, miners and dwarves both. Up the road past that is Stonegate, which has trolls in it this month, and past that the High Shelf, which has weather in it every month. Frostpeak at the end of it: the King\'s citadel. Dress warm. Eat hot. Never sleep in the snow.', [{ label: 'Thanks, Captain.', run: back }]) },
  ]);
  services.set('sigrun', (show, back) => [
    { label: 'Browse mountain steel', run: () => d.shop('sigrun', 'Deepsteel and good iron. Nothing black. Never anything black.', [['tunnelShortblade', 340], ['anvilfistHammer', 360], ['runebreakerAxe', 380], ['lanternPick', 320], ['stonepiercer', 420], ['dwarvenDoorshield', 400], ['dwarvenExpedition_chest', 520], ['dwarvenExpedition_head', 300]]) },
    { label: 'Can I use your forge?', run: () => { d.close(); d.craft('forge', 'Sigrun\'s forge'); } },
    { label: 'Black iron?', run: () => show('Cold iron. You hold it, and it takes the warmth out of your hand instead of the other way round. Put it in a forge and the fire goes grey. My grandfather said it was what a seam turns into when something drinks it dry. I don\'t know what drinks a seam. I don\'t want to.', [{ label: 'Go on.', run: back }]) },
  ]);
  services.set('olga', (show, back) => [
    { label: 'A bowl of hold stew — 6g', run: () => {
      if (d.gold() < 6) return show('Six coppers, love. Even the cold costs something.', [{ label: 'Back.', run: back }]);
      d.addGold(-6);
      d.give('holdStew', 1);
      d.close();
      d.toast('Olga ladles you a bowl you could stand a spoon in. (Eat it before you go up the road: it keeps the cold off for ten minutes.)');
    } },
    { label: 'A bed by the chimney — 12g', run: () => {
      if (d.gold() < 12) return show('Twelve for the bed, love.', [{ label: 'Back.', run: back }]);
      d.addGold(-12);
      d.rest();
      d.close();
    } },
    { label: 'Could I use your kitchen?', run: () => { d.close(); d.craft('kitchen', 'the Tin Lantern\'s kitchen'); } },
  ]);
  services.set('annick', () => [
    { label: 'Browse furs and warm things', run: () => d.shop('annick', 'Fleece inside, fur outside, and a hood. That\'s the whole secret.', [['highlandFurs_head', 70], ['highlandFurs_shoulders', 80], ['highlandFurs_chest', 160], ['highlandFurs_hands', 60], ['highlandFurs_legs', 110], ['highlandFurs_feet', 75], ['warmstone', 140], ['coldward', 30]]) },
  ]);
  services.set('ulla', () => [
    { label: 'Browse runes and charms', run: () => d.shop('ulla', 'Cut in Frostpeak, under the King\'s own eye.', [['warmstone', 120], ['coldward', 26], ['ringSage', 210]]) },
    { label: 'Could I use your runestone?', run: () => { d.close(); d.craft('runestone', 'Ulla\'s runestone'); } },
  ]);
  services.set('bruni', () => [
    ...(d.quests.wants('expedition-vouched') ? [
      { label: 'Pay the berth bond — 100g', run: () => {
        if (d.gold() < 100) return d.toast('Bruni: "A hundred, and you get it back when we\'re home. Probably."');
        d.addGold(-100);
        d.quests.signal('expedition-vouched');
        d.close();
        d.toast('Bruni pockets the bond. "That\'ll do instead of the Guild\'s seal. Don\'t tell them I said so."');
      } },
    ] : []),
    ...(d.quests.wants('expedition-vouched') && /dwarf/i.test(String(d.player.prog.origin ?? '')) ? [
      { label: 'I\'m one of yours, Bruni.', run: () => {
        d.quests.signal('expedition-vouched');
        d.close();
        d.toast('Bruni looks at your hands, your beard and your boots, and laughs. "So you are. Get aboard, cousin."');
      } },
    ] : []),
    ...(d.quests.isActive('dwarf-expedition') ? [
      { label: 'Buy five ore samples from your quartermaster — 40g', run: () => {
        if (d.gold() < 40) return d.toast('Bruni: "Forty. Ore isn\'t free, even to me."');
        d.addGold(-40);
        d.give('ironOre', 5);
        d.close();
      } },
    ] : []),
  ]);

  const absent = (id: string): boolean | null => {
    if (id === 'bruni') return !!d.flags.kettleLanded ? true : null;
    if (id === 'bruni-wm') return !d.flags.kettleLanded;
    return null;
  };

  let cairnsSent = 0;
  let restored = false;
  return {
    mountains,
    kettle,
    services,
    absent,
    /** Board the Kettle at Port Aurelle (the expedition's sailing day, or passage after). */
    sailNorth() {
      return kettle.sail('north');
    },
    restore() {
      kettle.restore();
    },
    update(dt: number, overworld: boolean) {
      // A save made mid-voyage lands you at the far end.
      if (!restored) {
        restored = true;
        kettle.restore();
      }
      kettle.update();
      if (!overworld) return;
      mountains.update(dt);
      const q = d.quests;
      // Tomas, first to yield.
      if (tomas) {
        tomas.update(dt, d.player);
        bolts.update(dt, d.player);
        if (tomas.hp <= tomas.maxHp * 0.2 || !tomas.alive) {
          d.toast('Tomas drops his blade and holds up his hands. "Yield! I yield. Gods, you hit hard."');
          tomas.dispose();
          tomas = null;
          q.signal('claim-won');
        }
      }
      if (q.isActive('first-claim')) q.setFlag('first-claim', 'rich', d.gold() >= 250);
      // Signals the world already earned before the quest wanted them.
      if (d.flags.stonegateClear && q.wants('stonegate-clear')) q.signal('stonegate-clear');
      if (d.flags.frostpeakUnhooded && q.wants('frostpeak-unhooded')) q.signal('frostpeak-unhooded');
      if (q.wants('cairn-lit')) {
        const lit = CAIRNS.filter((_, i) => d.flags[`cairn:${i}`]).length;
        while (cairnsSent < lit) {
          cairnsSent++;
          q.signal('cairn-lit');
        }
      }
      if (d.flags.kettleLanded && q.status('kettle-landing') === 'available') q.accept('kettle-landing');
      // The story: what the Iron Below's chapters have taught you about Malric and the Lamplighter King.
      const st = d.story();
      if (st) {
        if (q.isDone('cold-iron') && !st.state.clues.has('malricVein')) st.state.clue('malricVein');
        if (q.isDone('kings-audience') && !st.flags.knowsLamplighter) {
          st.flags.knowsLamplighter = true;
          st.state.clue('malricWheels');
          st.note('ironBelow', 'The Lorekeeper of Frostpeak named him: the Lamplighter King, who cut the first Sunwheel and ruled Cresha for a hundred years without a night. Malric breaks the wheels because every one is one of his eyes.');
        }
      }
    },
    frame(alpha: number, dt: number) {
      mountains.frame(alpha, dt);
    },
  };
}

export type Mountains = ReturnType<typeof setupMountains>;
