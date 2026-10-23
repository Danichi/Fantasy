import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { road, pointAlong, distanceAlong } from '../roadNetwork';
import { GRASS_MASKS } from '../groundWindow';
import { events } from '../../core/events';
import { sfx } from '../../audio/sfx';
import { LairKit } from './lairKit';
import { BeastBoss, type BeastBossDef } from '../../enemies/wilds/beastBoss';
import { Rootwarden } from '../../enemies/wilds/rootwarden';
import { WildBeast, type WildCtx } from '../../enemies/wilds/wildBeast';
import { WILD_SPECS, ELITES, type WildSpec } from '../../enemies/wilds/wildSpecs';
import { wildsSfx } from '../../enemies/wilds/wildsSfx';
import { OrcWarlord, type BossSpec } from '../../enemies/orc';
import { OrcMob } from '../../enemies/orcMob';
import { Boar } from '../../creatures/boar/boar';
import { creatureReady, prepareCreature } from '../../creatures/geometryStore';
import type { Target } from '../../combat/targets';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';

// The hidden bosses of the deep woods. Go far enough off the Crown Road or
// the King's Road, into the thickest of the woods, and you can find a lair:
// a clearing ringed with old trees, dressed with what lives there (bones, a
// cave mouth, totems, standing stones). In each, something sleeps. Wake it and
// it fights in phases behind a boss bar; die or run and it goes back to its
// lair healed; kill it and it stays dead (a world flag), drops its unique
// loot, and leaves the lair to be searched.
//
//   Old Bristleback       the Wallow, south of the King's Road past Millbrook
//   Old Gnarlbark         the Elder Glade, in the woods north of the King's Road
//   Greymane              the Wolf-Mother's Den, north of the Crown Road
//   Thornhorn             the Antlered King's Glade, deep north of the Crown Road
//   Ulgra Skullsplitter   the Skull Grove, south of the orc marches

export interface WildsHooks {
  toast(msg: string): void;
  /** a big title card (hud.regionCard) */
  card(title: string, subtitle: string): void;
  /** the boss bar: phases are health fractions to mark on it */
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string, phases?: number[]): void;
  flags: Record<string, boolean | number | string>;
  give(item: string, n: number): void;
  gold(n: number): void;
  save(): void;
  hour(): number;
  /** extra XP and gold orbs at a spot (danger bonus for the wilds' kills) */
  reward?(at: THREE.Vector3, xp: number, gold: number): void;
}

/** What a lair's boss looks like to the lair (BeastBoss, the Rootwarden and an OrcWarlord all fit). */
export interface BossHandle {
  target(): (Target & { name: string }) | null;
  awake(): boolean;
  alive(): boolean;
  update(dt: number, player: Player): void;
  present(alpha: number, dt: number, player: Player): void;
  reset(): void;
  dispose(): void;
  phases: number[];
}

interface Add {
  t: Target;
  update(dt: number, player: Player): void;
  done(): boolean;
  dispose(): void;
}

export interface LairDef {
  id: string;
  /** the place */
  place: string;
  /** the boss's name and card subtitle */
  boss: string;
  title: string;
  at: [number, number];
  /** the road it hides from (its way in faces that way) */
  road: string;
  arena: number;
  /** how far from the lair you can lead the fight before it gives up */
  leash: number;
  /** world flag set once it's dead */
  flag: string;
  /** said when you first come near */
  intro: string;
  flee: string;
  victory: [string, string];
  loot: [string, number][];
  gold: number;
  renown: number;
  search: { label: string; text: string; items: [string, number][]; gold: number };
  dress(k: LairKit, openYaw: number): void;
  make(c: LairController): BossHandle;
}

// ---- the beasts ---------------------------------------------------------------------------

const BRISTLEBACK: BeastBossDef = {
  spec: { ...WILD_SPECS.boar, id: 'bristleback', name: 'Old Bristleback', height: 2.5, hp: 850, damage: 30, speed: 4.4, aggro: 40, reach: 3.2, cooldown: 1.5, radius: 0.95, poise: 260, tint: 0x4a3424, pitch: 0.5, drops: [] },
  title: 'The Tusked Terror of the Wallow', glow: 0xff7a2a, wake: 16, phases: [0.6, 0.3],
  moves: [{ gore: 3, charge: 3, quake: 1.5 }, { gore: 2, charge: 3, quake: 2, mudfling: 2, summon: 1 }, { gore: 2, charge: 3, quake: 2.5, mudfling: 2.5, summon: 1 }],
  charges: [0, 1, 2],
};
const GREYMANE: BeastBossDef = {
  spec: { ...WILD_SPECS.wolf, id: 'greymane', name: 'Greymane, the Wolf-Mother', height: 2.5, hp: 1250, damage: 34, speed: 5.2, aggro: 40, reach: 3.3, cooldown: 1.3, radius: 0.95, poise: 240, colors: { Main: 0x8e8e8a, Main_Light: 0xe8e6e0 }, pitch: 0.55, drops: [] },
  title: 'Every wolf on the Crown Road is of her blood', glow: 0xbfe8ff, wake: 17, phases: [0.66, 0.33],
  moves: [{ bite: 3, pounce: 3, smash: 1 }, { bite: 3, pounce: 3, smash: 1.5, quake: 1, summon: 1 }, { bite: 2, pounce: 4, quake: 1.5, smash: 1, summon: 1 }],
  chain: [0, 1, 2],
};
const THORNHORN: BeastBossDef = {
  spec: { ...WILD_SPECS.stag, id: 'thornhorn', name: 'Thornhorn, the Antlered King', height: 3.4, hp: 1700, damage: 38, speed: 4.6, aggro: 40, reach: 3.6, cooldown: 1.4, radius: 1.05, poise: 300, pitch: 0.5, drops: [] },
  title: 'Lord of the deep wood, older than the Crown', glow: 0x9fe0ff, wake: 18, phases: [0.6, 0.3],
  moves: [{ gore: 3, kick: 2, charge: 2.5, pounce: 1 }, { gore: 2, kick: 2, charge: 2.5, spirits: 2.5, pounce: 1, summon: 1 }, { gore: 2, kick: 1.5, charge: 2, spirits: 2.5, nova: 2.5, summon: 1 }],
  charges: [0, 1, 2],
};
const ULGRA: BossSpec = { name: 'Ulgra Skullsplitter, the Exile', model: '/assets/npc/orcWarrior.glb', height: 1.75, hp: 1800, scale: 1.55, kind: 'ulgra', bow: true, damage: 1.1, wake: 18 };
const BRIARLING: WildSpec = { ...WILD_SPECS.goblin, id: 'briarling', name: 'Briarling', tint: 0x6a8a3a, hp: 70, damage: 15, moves: ['bite', 'pounce'], drops: [['heartwoodSplinter', 0.25, 1]] };

const beastHandle = (b: BeastBoss): BossHandle => ({
  target: () => b,
  awake: () => b.awake,
  alive: () => b.alive,
  update: (dt, p) => b.update(dt, p),
  present: () => {},
  reset: () => b.reset(),
  dispose: () => b.dispose(),
  phases: b.phaseMarks,
});

function beastLair(c: LairController, def: BeastBossDef, summon: (c: LairController, b: BeastBoss) => void) {
  const at = c.home();
  const b = new BeastBoss(def, at, c.openYaw + Math.PI, c.scene, c.fx, c.ctx);
  b.onWake = () => c.woke();
  b.onPhase = (_b, ph) => c.phase(ph);
  b.onSummon = () => summon(c, b);
  return beastHandle(b);
}

// ---- the lairs ----------------------------------------------------------------------------

export const LAIRS: LairDef[] = [
  {
    id: 'bristleback', place: 'The Wallow', boss: 'Old Bristleback', title: BRISTLEBACK.title,
    at: [877, 746], road: 'kings', arena: 24, leash: 75, flag: 'wildsDead:bristleback',
    intro: 'The ground here is churned to black mud, and the saplings are snapped off at waist height. Something heavy wallows nearby.',
    flee: 'Old Bristleback snorts and lumbers back to its wallow.',
    victory: ['Old Bristleback Falls', 'The wallow is still at last'],
    loot: [['bristlebackTusk', 1], ['tuskCleaver', 1], ['boarHide', 3]], gold: 160, renown: 20,
    search: { label: 'Search the wallow', text: 'In the mud of the wallow: a traveller’s purse, a healing draught, and tusks shed over many years.', items: [['boarTusk', 3], ['healthPotion', 2]], gold: 70 },
    dress(k, open) {
      const { x, z } = k;
      k.disc(x, z, 15, new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6, metalness: 0.05 }));
      for (let i = 0; i < 6; i++) {
        const a = k.rnd() * Math.PI * 2, r = 3 + k.rnd() * 9;
        k.disc(x + Math.cos(a) * r, z + Math.sin(a) * r, 1.2 + k.rnd() * 1.6, new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.08, metalness: 0.3 }), 0.08);
      }
      GRASS_MASKS.push({ x, z, r: 17, amount: 0.95 });
      for (let i = 0; i < 4; i++) {
        const a = k.rnd() * Math.PI * 2;
        k.log(x + Math.sin(a) * (14 + k.rnd() * 6), z + Math.cos(a) * (14 + k.rnd() * 6), k.rnd() * 3, 6 + k.rnd() * 3, 0.4, true);
      }
      // Saplings snapped off at waist height.
      for (let i = 0; i < 18; i++) {
        const a = k.rnd() * Math.PI * 2, r = 9 + k.rnd() * 12;
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        k.add(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 5), k.m.bark, px, 0.55, pz);
        k.add(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 5).rotateZ(1.3), k.m.bark, px + 0.6, 0.15, pz, k.rnd() * 6);
      }
      k.bones(x + 5, z - 4, 9, 5);
      k.ribcage(x - 7, z + 6, k.rnd() * 6, 0.7);
      for (let i = 0; i < 6; i++) k.rock(x + (k.rnd() - 0.5) * 40, z + (k.rnd() - 0.5) * 40, 0.6 + k.rnd() * 0.9);
      k.treeRing(26, 50, 34, 'tree', open, 0.5);
      k.ferns(x, z, 30, 26);
    },
    make: (c) => {
      void prepareCreature('boar');
      return beastLair(c, BRISTLEBACK, (cc, b) => cc.summonSounder(1 + b.phase));
    },
  },
  {
    id: 'gnarlbark', place: 'The Elder Glade', boss: 'Old Gnarlbark, the Rootwarden', title: 'The wood remembers, and the wood is angry',
    at: [1098, -407], road: 'kings', arena: 22, leash: 70, flag: 'wildsDead:gnarlbark',
    intro: 'The birdsong stops. Mushrooms glow in a ring around the standing stones, and the old oak in the middle of the glade has a face in its bark.',
    flee: 'Old Gnarlbark creaks back to its place among the stones and goes still.',
    victory: ['The Rootwarden Sleeps', 'The Elder Glade is quiet again'],
    loot: [['heartwoodShield', 1], ['rootwardenHeart', 1], ['heartwoodSplinter', 4]], gold: 220, renown: 30,
    search: { label: 'Search the hollow roots', text: 'Among the old roots: offerings left by travellers long ago. Coins green with age, a mana draught, and amber.', items: [['greaterManaPotion', 2], ['heartwoodSplinter', 2]], gold: 110 },
    dress(k, open) {
      const { x, z } = k;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        k.standingStone(x + Math.sin(a) * 17, z + Math.cos(a) * 17, 3 + k.rnd() * 1.8, -a);
      }
      k.mushroomRing(x, z, 12, 26, 0x6aff9a);
      k.mushroomRing(x + 9, z - 13, 2.5, 8, 0x9a8aff);
      k.disc(x - 11, z + 9, 4.5, new THREE.MeshStandardMaterial({ color: 0x1a3038, roughness: 0.05, metalness: 0.4 }), 0.06);
      for (const [dx, dz, r] of [[13, 8, 1.6], [-14, -6, 1.9], [4, -16, 1.4]] as [number, number, number][]) k.stump(x + dx, z + dz, r);
      for (let i = 0; i < 8; i++) k.mossyRock(x + (k.rnd() - 0.5) * 44, z + (k.rnd() - 0.5) * 44, 0.6 + k.rnd() * 0.8);
      k.ferns(x, z, 26, 40);
      k.treeRing(24, 48, 40, 'tree', open, 0.45);
      GRASS_MASKS.push({ x, z, r: 14, amount: 0.35 });
    },
    make: (c) => {
      const w = new Rootwarden(c.home(), c.openYaw, c.scene, c.fx, c.ctx.tele, c.ctx.missiles, c.mats.bark);
      w.onWake = () => c.woke();
      w.onPhase = (ph) => c.phase(ph);
      w.onSummon = () => c.summonBeasts(BRIARLING, 3 + w.phase, 0.45, [], 'Briarlings tear themselves free of the moss!');
      return {
        target: () => w, awake: () => w.awake, alive: () => w.alive, update: (dt, p) => w.update(dt, p), present: () => {},
        reset: () => w.reset(), dispose: () => w.dispose(), phases: w.phaseMarks,
      };
    },
  },
  {
    id: 'greymane', place: 'The Wolf-Mother’s Den', boss: 'Greymane, the Wolf-Mother', title: GREYMANE.title,
    at: [-1521, -656], road: 'capital', arena: 24, leash: 80, flag: 'wildsDead:greymane',
    intro: 'Bones everywhere, gnawed white. The trees close in round a cave mouth, and the air smells of wet fur and old blood.',
    flee: 'Greymane pads back into the dark of her den, licking her wounds.',
    victory: ['The Wolf-Mother Is Dead', 'The packs of the Crown Road have lost their queen'],
    loot: [['greymanePelt', 1], ['wolfMotherFang', 1], ['direFang', 2]], gold: 260, renown: 35,
    search: { label: 'Search the den', text: 'Deep in the den, among the bones of a hundred meals: a dead adventurer’s pack. Gold, potions, and a ring still on a finger.', items: [['greaterHealthPotion', 2], ['ringVigor', 1]], gold: 140 },
    dress(k, open) {
      const { x, z } = k;
      const back = open + Math.PI;
      k.caveMouth(x + Math.sin(back) * 9, z + Math.cos(back) * 9, open, 1.15);
      k.bones(x, z, 30, 18);
      for (let i = 0; i < 6; i++) k.skull(x + (k.rnd() - 0.5) * 16, z + (k.rnd() - 0.5) * 16, 0.08, 0.8 + k.rnd() * 0.6);
      k.ribcage(x + 6, z + 5, k.rnd() * 6, 1.1);
      k.ribcage(x - 8, z - 3, k.rnd() * 6, 0.7);
      for (let i = 0; i < 10; i++) {
        const a = k.rnd() * Math.PI * 2, r = 12 + k.rnd() * 12;
        k.rock(x + Math.sin(a) * r, z + Math.cos(a) * r, 0.8 + k.rnd() * 1.4);
      }
      k.treeRing(24, 52, 42, 'mix', open, 0.45);
      k.ferns(x, z, 28, 18);
      GRASS_MASKS.push({ x, z, r: 16, amount: 0.7 });
    },
    make: (c) => beastLair(c, GREYMANE, (cc, b) => {
      const alpha = b.phase >= 2 ? [ELITES[0]] : [];
      cc.summonBeasts(WILD_SPECS.wolf, 3, 0.55, [], 'Greymane howls — her pack answers from the trees!');
      if (alpha.length) cc.summonBeasts(WILD_SPECS.wolf, 1, 0.6, alpha);
    }),
  },
  {
    id: 'thornhorn', place: 'The Antlered King’s Glade', boss: 'Thornhorn, the Antlered King', title: THORNHORN.title,
    at: [-2021, -1175], road: 'capital', arena: 26, leash: 85, flag: 'wildsDead:thornhorn',
    intro: 'Pale birches, and a silence like a held breath. On an old altar of stone, someone has laid a crown of antlers.',
    flee: 'Thornhorn lowers his crown and walks back into the pale trees.',
    victory: ['The Antlered King Falls', 'The deep wood bows its head'],
    loot: [['antlerCrown', 1], ['moonantlerBlade', 1], ['stagAntler', 3]], gold: 320, renown: 45,
    search: { label: 'Kneel at the antler altar', text: 'Under the altar stone, wrapped in mouldering silk: an offering from some forgotten king. Gold, and a moonstone ring.', items: [['ringSage', 1], ['wispEssence', 2]], gold: 180 },
    dress(k, open) {
      const { x, z } = k;
      const back = open + Math.PI;
      const ax = x + Math.sin(back) * 10, az = z + Math.cos(back) * 10;
      k.add(new THREE.BoxGeometry(3.2, 1.1, 1.8), k.m.stone, ax, 0.4, az, open);
      k.add(new THREE.BoxGeometry(3.6, 0.2, 2.1), k.m.stone, ax, 1.0, az, open);
      const antler = k.col(0xe8dcc0, 0.6);
      k.antlers(ax, 1.1, az, open, 1.6, antler);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const px = x + Math.sin(a) * 20, pz = z + Math.cos(a) * 20;
        k.add(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 6), k.m.bark, px, 1.3, pz);
        k.antlers(px, 2.5, pz, -a, 0.8, antler);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.standingStone(x + Math.sin(a) * 13, z + Math.cos(a) * 13, 2 + k.rnd(), -a, false);
      }
      k.mushroomRing(ax, az, 3.5, 10, 0x9fe0ff);
      k.birches(22, 46, 46, open);
      k.ferns(x, z, 24, 22);
      GRASS_MASKS.push({ x, z, r: 12, amount: 0.3 });
    },
    make: (c) => beastLair(c, THORNHORN, (cc, b) => {
      if (b.phase >= 2) cc.summonBeasts(WILD_SPECS.wispHound, 3, 0.7, [], 'Spectral hounds pour out of the birches!');
      else cc.summonBeasts(WILD_SPECS.stag, 2, 0.6, [], 'Thornhorn bellows — his stags answer!');
    }),
  },
  {
    id: 'ulgra', place: 'The Skull Grove', boss: 'Ulgra Skullsplitter, the Exile', title: 'Cast out by Gorrak; hunts what Gorrak fears',
    at: [-2789, -285], road: 'capital', arena: 26, leash: 85, flag: 'wildsDead:ulgra',
    intro: 'Skulls on stakes, dozens of them: wolves, men, orcs. A cold fire pit, and a great bow leaning against a totem. Someone lives here.',
    flee: 'Ulgra spits, and stalks back to her fire. “Run, little meat. Run.”',
    victory: ['Ulgra Skullsplitter Is Slain', 'The Skull Grove has lost its hunter'],
    loot: [['skullsplitter', 1], ['ulgraWarHorn', 1], ['orcTusk', 3]], gold: 380, renown: 50,
    search: { label: 'Search Ulgra’s trophies', text: 'Among her trophies: a Crown courier’s satchel, still sealed, heavy with coin, and a flask of something strong.', items: [['greaterHealthPotion', 3]], gold: 240 },
    dress(k, open) {
      const { x, z } = k;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        if (Math.abs(Math.atan2(Math.sin(a - open), Math.cos(a - open))) < 0.35) continue;
        k.stake(x + Math.sin(a) * 22, z + Math.cos(a) * 22, 2.2 + k.rnd() * 0.9, i % 2 === 0);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        k.totem(x + Math.sin(a) * 11, z + Math.cos(a) * 11, 4 + k.rnd() * 1.5);
      }
      k.campfire(x + 2, z - 1, true);
      k.leanTo(x - 8, z + 5, open + 2.4);
      k.leanTo(x + 7, z + 8, open - 2.2);
      k.cage(x - 4, z - 9);
      k.bones(x, z, 24, 16);
      for (let i = 0; i < 8; i++) k.skull(x + (k.rnd() - 0.5) * 12, z + (k.rnd() - 0.5) * 12, 0.08, 0.9 + k.rnd() * 0.5);
      k.ribcage(x + 9, z - 6, k.rnd() * 6, 1);
      k.treeRing(28, 54, 40, 'pine', open, 0.4);
      GRASS_MASKS.push({ x, z, r: 18, amount: 0.8 });
    },
    make: (c) => {
      let o: OrcWarlord | null = null;
      let pending = true;
      let gone = false;
      let bodyKept = 0;
      let horn = 0;
      const at = c.home();
      void OrcWarlord.create(at, c.openYaw, c.scene, c.fx, ULGRA).then((b) => {
        pending = false;
        if (gone || c.disposed) return b.dispose();
        o = b;
        b.onRoar = () => {
          sfx.roar(0.8);
          c.woke();
        };
      });
      return {
        target: () => o,
        awake: () => !!o && o.awake && o.alive,
        alive: () => pending || (!!o && o.alive),
        update: (dt, p) => {
          if (!o) return;
          o.update(dt, p);
          // War-horn phases: her blood-sworn come running.
          const f = o.hp / o.maxHp;
          if (o.alive && o.awake && ((horn === 0 && f < 0.6) || (horn === 1 && f < 0.25))) {
            horn++;
            c.phase(horn);
            wildsSfx.warHorn(0);
            c.summonOrcs(2 + horn - 1);
          }
          if (!o.alive && (bodyKept += dt) > 3 && bodyKept - dt <= 3) o.releaseBody();
        },
        present: (alpha, dt, p) => o?.present(alpha, dt, p),
        reset: () => {
          horn = 0;
          o?.reset(at, c.openYaw);
        },
        dispose: () => {
          gone = true;
          o?.dispose();
          o = null;
        },
        phases: [0.6, 0.5, 0.25],
      };
    },
  },
];

/** Stylized-nature clearings for every lair (so the scatter leaves the arenas open). */
export const LAIR_CLEARINGS: [number, number, number][] = LAIRS.map((l) => [l.at[0], l.at[1], l.arena + 2]);

// ---- one lair's controller ------------------------------------------------------------------

export class LairController {
  readonly kit: LairKit;
  readonly openYaw: number;
  handle: BossHandle | null = null;
  adds: Add[] = [];
  disposed = false;
  private fighting = false;
  private won = false;
  private pendingReset = false;
  private barShown = false;
  private wonT = 0;
  private time = 0;
  readonly interactable: Interactable;

  constructor(readonly def: LairDef, readonly scene: THREE.Scene, readonly fx: FX, readonly mats: WorldMats, readonly ctx: WildCtx, private hooks: WildsHooks) {
    const [x, z] = def.at;
    // The way in faces the road it hides from.
    const r = road(def.road);
    const q = pointAlong(r, distanceAlong(r, x, z));
    this.openYaw = Math.atan2(q.x - x, q.z - z);
    this.kit = new LairKit(x, z, def.id.length * 7919 + Math.round(x), mats);
    def.dress(this.kit, this.openYaw);
    void this.kit.finish(scene);
    const self = this;
    const spot = new THREE.Vector3(x + Math.sin(this.openYaw + Math.PI) * 5, heightAt(x, z), z + Math.cos(this.openYaw + Math.PI) * 5);
    spot.y = heightAt(spot.x, spot.z);
    this.interactable = {
      pos: spot, radius: 3,
      label: () => (self.dead && !self.searched ? def.search.label : ''),
      enabled: () => self.dead && !self.searched,
      action: () => {
        hooks.flags[def.flag + ':searched'] = true;
        for (const [id, n] of def.search.items) hooks.give(id, n);
        hooks.gold(def.search.gold);
        hooks.toast(`${def.search.text} (+${def.search.gold} gold)`);
        hooks.save();
      },
    };
  }

  get dead() {
    return !!this.hooks.flags[this.def.flag];
  }
  get searched() {
    return !!this.hooks.flags[this.def.flag + ':searched'];
  }
  /** Fighting it right now (no rest, no fast travel). */
  get engaged() {
    return this.fighting && !!this.handle?.awake();
  }
  home() {
    const [x, z] = this.def.at;
    return new THREE.Vector3(x, heightAt(x, z), z);
  }
  private dist(p: THREE.Vector3) {
    return Math.hypot(p.x - this.def.at[0], p.z - this.def.at[1]);
  }

  /** It woke: the card, and the fight is on. */
  woke() {
    this.fighting = true;
    this.hooks.card(this.def.boss, this.def.title);
  }

  /** A new phase: say so. */
  phase(ph: number) {
    const last = ph >= this.handle!.phases.length;
    this.hooks.toast(last ? `${this.def.boss.split(',')[0]} is enraged!` : `${this.def.boss.split(',')[0]} grows desperate…`);
    events.emit('bossSlam', { at: this.home() });
  }

  /** Kin come out of the trees at the arena's edge, already hunting you. */
  summonBeasts(spec: WildSpec, n: number, danger: number, elites: typeof ELITES, msg?: string) {
    const [x, z] = this.def.at;
    const pack: WildBeast[] = [];
    for (let k = 0; k < n; k++) {
      const a = this.openYaw + Math.PI + (k - (n - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.3;
      const px = x + Math.sin(a) * (this.def.arena - 3), pz = z + Math.cos(a) * (this.def.arena - 3);
      const b = new WildBeast(spec, new THREE.Vector3(px, heightAt(px, pz), pz), this.scene, this.fx, this.ctx, { danger, elites, pack, alerted: true, leash: this.def.leash });
      pack.push(b);
      this.adds.push({ t: b, update: (dt, p) => b.update(dt, p), done: () => b.dead || !b.alive && !b.group.parent, dispose: () => b.dispose() });
      this.fx.add.spawn({ pos: new THREE.Vector3(px, heightAt(px, pz) + 1, pz), spread: 2, count: 14, life: [0.4, 0.9], size: [0.3, 0.05], color: 0x5a4a3a, color2: 0x1a140c, gravity: 4 });
    }
    if (msg) this.hooks.toast(msg);
  }

  /** Bristleback's sounder: wild boars burst out of the undergrowth. */
  summonSounder(n: number) {
    if (!creatureReady('boar')) return this.summonBeasts(WILD_SPECS.boar, n, 0.35, [], 'Bristleback squeals — its sounder comes crashing through the brush!');
    const [x, z] = this.def.at;
    for (let k = 0; k < n; k++) {
      const a = this.openYaw + Math.PI + (k - (n - 1) / 2) * 0.8;
      const px = x + Math.sin(a) * (this.def.arena - 3), pz = z + Math.cos(a) * (this.def.arena - 3);
      const c = new Boar(new THREE.Vector3(px, heightAt(px, pz), pz), 12, this.scene, this.fx);
      this.adds.push({ t: c, update: (dt, p) => c.update(dt, p), done: () => c.dead, dispose: () => c.dispose() });
    }
    this.hooks.toast('Bristleback squeals — its sounder comes crashing through the brush!');
  }

  /** Ulgra's blood-sworn: orc warriors from the treeline. */
  summonOrcs(n: number) {
    const [x, z] = this.def.at;
    for (let k = 0; k < n; k++) {
      const a = this.openYaw + Math.PI + (k - (n - 1) / 2) * 0.8;
      const px = x + Math.sin(a) * (this.def.arena - 4), pz = z + Math.cos(a) * (this.def.arena - 4);
      const o = new OrcMob(new THREE.Vector3(px, heightAt(px, pz) + 0.3, pz), this.scene, this.fx);
      o.kind = 'exileOrc';
      o.hp = o.maxHp = 240;
      o.group.scale.setScalar(1.12);
      this.adds.push({ t: o, update: (dt, p) => o.update(dt, p), done: () => o.dead, dispose: () => o.dispose() });
    }
    this.hooks.toast('Ulgra sounds her war-horn — her blood-sworn come running!');
  }

  private clearAdds() {
    for (const a of this.adds) {
      if (a.t.alive) this.fx.add.spawn({ pos: a.t.center.clone(), spread: 1.5, count: 12, life: [0.4, 0.9], size: [0.3, 0.05], color: 0x3a3a3a, color2: 0x101010, upBias: 0.5 });
      a.dispose();
    }
    this.adds = [];
  }

  private reset(msg: string) {
    this.fighting = false;
    this.pendingReset = false;
    this.handle?.reset();
    this.clearAdds();
    this.ctx.tele.clear();
    this.ctx.missiles.clear();
    if (this.barShown) this.hooks.bossBar(null);
    this.barShown = false;
    this.hooks.toast(msg);
  }

  private victory() {
    this.won = true;
    this.fighting = false;
    this.wonT = 0;
    this.hooks.flags[this.def.flag] = true;
    if (this.barShown) this.hooks.bossBar(null);
    this.barShown = false;
    this.clearAdds();
    this.hooks.card(...this.def.victory);
    sfx.beam(0.5);
    for (const [id, n] of this.def.loot) this.hooks.give(id, n);
    this.hooks.gold(this.def.gold);
    events.emit('deed', { id: 'wilds:' + this.def.id, renown: this.def.renown, label: `Slew ${this.def.boss.split(',')[0]}` });
    this.hooks.save();
  }

  update(dt: number, player: Player) {
    this.time += dt;
    const d = this.dist(player.pos);
    // Glowing mushrooms breathe; fires flicker; fireflies at night.
    if (d < 260) {
      for (const g of this.kit.glows) g.emissiveIntensity = 0.6 + Math.sin(this.time * 1.7) * 0.25;
      for (const f of this.kit.fires) {
        f.flame.scale.y = 0.85 + Math.sin(this.time * 13 + f.at.x) * 0.15;
        if (Math.random() < dt * 14) this.fx.add.spawn({ pos: f.at, vel: new THREE.Vector3(0, 1.6, 0), spread: 0.4, count: 1, life: [0.4, 0.8], size: [0.45, 0.06], color: 0xffc060, color2: 0xff3a00, jitter: 0.3 });
      }
      const h = this.hooks.hour();
      if ((h > 20 || h < 5) && Math.random() < dt * 6) {
        const [x, z] = this.def.at;
        const p = new THREE.Vector3(x + (Math.random() - 0.5) * 40, 0, z + (Math.random() - 0.5) * 40);
        p.y = heightAt(p.x, p.z) + 0.5 + Math.random() * 2;
        this.fx.add.spawn({ pos: p, vel: new THREE.Vector3(0, 0.2, 0), spread: 0.3, count: 1, life: [1.5, 3], size: [0.07, 0.03], color: 0xd8ff6a, color2: 0x6a8a1a, drag: 1 });
      }
    }
    // The first time you come near: the place speaks for itself.
    if (d < 75 && !this.hooks.flags['wildsSeen:' + this.def.id]) {
      this.hooks.flags['wildsSeen:' + this.def.id] = true;
      this.hooks.toast(this.def.intro);
    }
    if (this.dead && !this.won) {
      // Already slain (a saved game): nothing lives here now.
      if (this.handle) {
        this.handle.dispose();
        this.handle = null;
      }
      return;
    }
    if (!this.handle && !this.won && d < 230) this.handle = this.def.make(this);
    const h = this.handle;
    if (!h) return;
    if (!this.won && !h.awake() && d > 330) {
      h.dispose();
      this.handle = null;
      this.clearAdds();
      return;
    }
    h.update(dt, player);
    for (const a of this.adds) a.update(dt, player);
    for (const a of this.adds.filter((a) => a.done())) a.dispose();
    this.adds = this.adds.filter((a) => !a.done());

    if (this.won) {
      this.wonT += dt;
      // The body lies where it fell until you leave.
      if (d > 320) {
        h.dispose();
        this.handle = null;
      }
      return;
    }
    if (!h.alive()) {
      this.victory();
      return;
    }
    if (h.awake()) {
      this.fighting = true;
      const t = h.target();
      if (t) {
        this.hooks.bossBar(t, t.name, h.phases);
        this.barShown = true;
      }
      if (player.dead) this.pendingReset = true;
      else if (this.pendingReset) this.reset(`You come to. ${this.def.boss.split(',')[0]} has gone back to its lair, its wounds closing.`);
      else if (d > this.def.leash) this.reset(this.def.flee);
    } else if (this.barShown) {
      this.hooks.bossBar(null);
      this.barShown = false;
    }
  }

  present(alpha: number, dt: number, player: Player) {
    this.handle?.present(alpha, dt, player);
  }

  setVisible(v: boolean) {
    this.kit.group.visible = v;
    if (!v && this.handle) {
      if (this.fighting) this.reset(this.def.flee);
      this.handle.dispose();
      this.handle = null;
      this.clearAdds();
    }
  }

  clear() {
    this.handle?.dispose();
    this.handle = null;
    this.clearAdds();
    this.fighting = false;
    if (this.barShown) this.hooks.bossBar(null);
    this.barShown = false;
  }

  /** Lair state for tests and the map. */
  status() {
    return { id: this.def.id, dead: this.dead, seen: !!this.hooks.flags['wildsSeen:' + this.def.id], spawned: !!this.handle, awake: !!this.handle?.awake(), adds: this.adds.length };
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }
}
