// What roams the wilds: species (model, base stats, moves, loot) and the
// elite affixes that turn an ordinary beast into a named horror. Base stats are
// for the Glen's edge; WildBeast scales them by the danger where it spawns.

export type MoveId =
  /** a parryable lunge and bite (or a goblin's knife, an orc's punch) */
  | 'bite'
  /** lowered head or tusks: parryable, heavy poise */
  | 'gore'
  /** a hind kick at whoever stands behind: not parryable */
  | 'kick'
  /** crouch, then leap onto the spot you stood (a circle on the ground) */
  | 'pounce'
  /** paw the ground, then run a straight lane (a line on the ground) */
  | 'charge'
  /** throw a head back and howl: the pack hits harder and more come */
  | 'howl'
  /** a thrown stone (goblin slingers) */
  | 'sling'
  /** a volley of quills or thorns */
  | 'quills'
  /** a two-handed overhead smash with a circle in front */
  | 'smash'
  /** step through shadow and come out behind you */
  | 'blink'
  // ---- bosses only ----
  /** a hop and a shockwave ring all round it */
  | 'quake'
  /** clods of mud lobbed onto marked circles */
  | 'mudfling'
  /** spectral beasts run marked lanes across the arena */
  | 'spirits'
  /** thorns burst out in every direction */
  | 'nova'
  /** throw back its head and call its kin (the lair brings them) */
  | 'summon';

export interface WildSpec {
  /** kind for XP_FOR_KIND and kill objectives */
  id: string;
  name: string;
  file: string;
  /** the model's yaw offset (the creature pack faces -Z, the farm-animal pack +Z) */
  facing: number;
  height: number;
  hp: number;
  damage: number;
  speed: number;
  aggro: number;
  reach: number;
  cooldown: number;
  radius: number;
  /** poise damage that makes it flinch */
  poise: number;
  moves: MoveId[];
  /** explicit clip names where the defaults don't fit */
  clips?: Partial<Record<'idle' | 'walk' | 'run' | 'attack' | 'gore' | 'kick' | 'leap' | 'howl' | 'hurt' | 'death', string>>;
  /** material name -> colour (flat-colour packs) */
  colors?: Record<string, number>;
  /** multiply every material by this (textured atlases) */
  tint?: number;
  /** material names that glow on elites and bosses (eyes, antlers) */
  glowMats?: string[];
  /** pack size at the Glen's edge (danger adds to it) */
  pack: [number, number];
  /** loot: item id, chance, max count */
  drops: [string, number, number][];
  /** pitch of its howl / yelp */
  pitch?: number;
  /** a biped (goblins, orcs): no kicks, swings instead of bites */
  biped?: boolean;
}

const CREATURES = '/assets/vendor/creatures/';
const ANIMALS = '/assets/animals/';

export const WILD_SPECS = {
  wolf: {
    id: 'wildWolf', name: 'Grey Wolf', file: CREATURES + 'wolf.glb', facing: Math.PI,
    height: 1.05, hp: 62, damage: 13, speed: 3.5, aggro: 17, reach: 1.7, cooldown: 1.3, radius: 0.36, poise: 22,
    moves: ['bite', 'pounce'], glowMats: ['Eyes_Black'], pack: [2, 3], pitch: 1,
    drops: [['wolfPelt', 0.45, 1], ['healthPotion', 0.06, 1]],
  },
  direWolf: {
    id: 'wildDireWolf', name: 'Dire Wolf', file: CREATURES + 'wolf.glb', facing: Math.PI,
    height: 1.7, hp: 260, damage: 26, speed: 3.9, aggro: 22, reach: 2.3, cooldown: 1.4, radius: 0.55, poise: 70,
    moves: ['bite', 'pounce', 'howl'], colors: { Main: 0x1c1a1a, Main_Light: 0x3a3634 }, glowMats: ['Eyes_Black'], pack: [1, 1], pitch: 0.72,
    drops: [['direFang', 0.6, 1], ['wolfPelt', 0.7, 2]],
  },
  fox: {
    id: 'wildFox', name: 'Mangy Fox', file: ANIMALS + 'fox.glb', facing: 0,
    height: 0.62, hp: 34, damage: 8, speed: 4.4, aggro: 12, reach: 1.3, cooldown: 1.0, radius: 0.28, poise: 12,
    moves: ['bite'], colors: { Main: 0x7a3a16 }, pack: [1, 2], pitch: 1.5,
    drops: [['wolfPelt', 0.15, 1]],
  },
  boar: {
    id: 'wildBoar', name: 'Wild Boar', file: ANIMALS + 'pig.glb', facing: 0,
    height: 0.95, hp: 95, damage: 15, speed: 3.6, aggro: 14, reach: 1.6, cooldown: 1.4, radius: 0.42, poise: 40,
    moves: ['gore', 'charge'], clips: { attack: 'Headbutt', gore: 'Headbutt', leap: 'Jump_Start' }, tint: 0x6b4a36, pack: [1, 3], pitch: 1.2,
    drops: [['boarTusk', 0.5, 2], ['boarHide', 0.35, 1]],
  },
  aurochs: {
    id: 'wildAurochs', name: 'Thornback Aurochs', file: ANIMALS + 'bull.glb', facing: 0,
    height: 1.9, hp: 280, damage: 26, speed: 3.4, aggro: 15, reach: 2.4, cooldown: 1.7, radius: 0.62, poise: 90,
    moves: ['gore', 'kick', 'charge'], colors: { Main: 0x2a1c14, Main_Light: 0x4a3a2a, Horns: 0xd8ccb0 }, glowMats: ['Eye_Black'], pack: [1, 2], pitch: 0.6,
    drops: [['aurochsHorn', 0.6, 1], ['boarHide', 0.4, 2]],
  },
  stag: {
    id: 'wildStag', name: 'Rutting Stag', file: CREATURES + 'stag.glb', facing: Math.PI,
    height: 1.6, hp: 140, damage: 20, speed: 3.3, aggro: 13, reach: 2.1, cooldown: 1.6, radius: 0.45, poise: 50,
    moves: ['gore', 'kick', 'charge'], glowMats: ['Material.003'], pack: [1, 2], pitch: 0.9,
    drops: [['stagAntler', 0.55, 1]],
  },
  goblin: {
    id: 'wildGoblin', name: 'Goblin Cutter', file: CREATURES + 'goblin.glb', facing: Math.PI,
    height: 1.25, hp: 72, damage: 14, speed: 3.2, aggro: 16, reach: 1.6, cooldown: 1.2, radius: 0.34, poise: 26,
    moves: ['bite', 'pounce'], clips: { leap: 'Jump' }, biped: true, pack: [2, 4], pitch: 1.7,
    drops: [['goblinFetish', 0.3, 1], ['healthPotion', 0.08, 1]],
  },
  goblinSlinger: {
    id: 'wildGoblin', name: 'Goblin Slinger', file: CREATURES + 'goblin.glb', facing: Math.PI,
    height: 1.15, hp: 52, damage: 12, speed: 3.0, aggro: 22, reach: 1.5, cooldown: 1.6, radius: 0.32, poise: 20,
    moves: ['bite', 'sling'], tint: 0xc8b89a, biped: true, pack: [1, 2], pitch: 1.9,
    drops: [['goblinFetish', 0.3, 1]],
  },
  orc: {
    id: 'wildOrc', name: 'Orc Marauder', file: CREATURES + 'orc.glb', facing: Math.PI,
    height: 1.95, hp: 190, damage: 25, speed: 2.9, aggro: 18, reach: 2.0, cooldown: 1.6, radius: 0.45, poise: 70,
    moves: ['bite', 'smash'], clips: { attack: 'Weapon', gore: 'Punch' }, biped: true, pack: [2, 3], pitch: 0.7,
    drops: [['orcTusk', 0.5, 1], ['greaterHealthPotion', 0.05, 1]],
  },
  wispHound: {
    id: 'wildWisp', name: 'Wisp Hound', file: ANIMALS + 'husky.glb', facing: 0,
    height: 0.95, hp: 120, damage: 19, speed: 4.2, aggro: 20, reach: 1.8, cooldown: 1.1, radius: 0.4, poise: 30,
    moves: ['bite', 'pounce', 'blink'], colors: { Material: 0x9fc8d8, 'Material.001': 0xdff4ff, 'Material.003': 0xeaf8ff }, glowMats: ['Material.006', 'Material.002'], pack: [2, 3], pitch: 1.25,
    drops: [['wispEssence', 0.35, 1]],
  },
} satisfies Record<string, WildSpec>;

export type WildSpecId = keyof typeof WILD_SPECS;

export interface EliteAffix {
  id: string;
  prefix: string;
  scale: number;
  hp: number;
  damage: number;
  speed?: number;
  /** the glow on its eyes and body */
  glow: number;
  /** body colour pushed toward this */
  tint?: number;
  /** moves it gains */
  moves?: MoveId[];
  /** its hits set you burning (fire per second) */
  burn?: number;
  /** below a third of its health it goes berserk */
  frenzy?: boolean;
  /** only after dark */
  night?: boolean;
  /** first appears at this danger */
  min: number;
}

export const ELITES: EliteAffix[] = [
  { id: 'alpha', prefix: 'Alpha', scale: 1.22, hp: 1.8, damage: 1.25, glow: 0xffc040, moves: ['howl'], min: 0.15 },
  { id: 'blooded', prefix: 'Blooded', scale: 1.1, hp: 1.6, damage: 1.45, speed: 1.12, glow: 0xff2a1a, tint: 0x5a1410, frenzy: true, min: 0.3 },
  { id: 'thornhide', prefix: 'Thornhide', scale: 1.15, hp: 2.0, damage: 1.2, glow: 0x9aff4a, tint: 0x2e4a1e, moves: ['quills'], min: 0.35 },
  { id: 'ashen', prefix: 'Ashen', scale: 1.12, hp: 1.7, damage: 1.35, glow: 0xff7a1a, tint: 0x3a3634, burn: 6, min: 0.45 },
  { id: 'gloom', prefix: 'Gloom', scale: 1.15, hp: 1.8, damage: 1.4, speed: 1.1, glow: 0x9a5cff, tint: 0x241c38, moves: ['blink'], night: true, min: 0.4 },
  { id: 'elder', prefix: 'Elder', scale: 1.45, hp: 2.6, damage: 1.55, speed: 0.92, glow: 0xfff0c0, moves: ['pounce', 'smash'], min: 0.65 },
];
