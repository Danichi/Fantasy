import type { ItemDef, ItemStats, Rarity } from '../itemDefs';
import type { PotionArt } from '../../ui/art/potions';
import type { FoodSpec } from '../../ui/art/food';
import type { PaperSpec } from '../../ui/art/paper';
import type { PartSpec } from '../../ui/art/parts';
import type { TrinketSpec } from '../../ui/art/trinkets';
import { add, recipe, source, type CatArt } from './kit';
import { fxText } from './gearFx';

// One-use items (the item plan, §7): draughts, elixirs, blade oils, bombs,
// regional meals, drinks, spell scrolls, wards and runestones, and tools.
// A buff's keys are combat modifiers or gear effects (gearFx.ts); `use` says
// what else happens (gearRuntime.ts does it).

const potionArt = (s: PotionArt): CatArt => ({ k: 'potion', s });
type Buff = NonNullable<ItemDef['buff']>;
const mins = (sec: number) => (sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`);
const buffLine = (b: Buff) => `For ${mins(b.sec)}: ${fxText(b.m ?? {}).replace(/\.$/, '')}.`;

function one(id: string, name: string, rarity: Rarity, desc: string, stats: ItemStats, src: string[], art: CatArt, o: { buff?: Buff; use?: ItemDef['use']; lvl?: number } = {}) {
  const d: ItemDef = { id, name, kind: 'consumable', rarity, stack: true, desc: o.buff ? `${desc} ${buffLine(o.buff)}` : desc, stats, lvl: o.lvl ?? 1, ...(o.buff ? { buff: o.buff } : {}), ...(o.use ? { use: o.use } : {}) };
  return add(d, src, art);
}

// ---- draughts (15): health, mana and stamina in five strengths ----------------------------------
const STRENGTHS: [string, Rarity, number][] = [['Minor', 'common', 1], ['Standard', 'common', 2], ['Greater', 'fine', 3], ['Superior', 'rare', 4], ['Supreme', 'epic', 5]];
const DRAUGHT: [string, string, keyof ItemStats, number[], PotionArt, [string, number][]][] = [
  ['Healing', 'health', 'heal', [40, 80, 140, 220, 320], { vessel: 'round', liquid: ['#ff6464', '#900c1c'], glyph: 'heart' }, [['sungrass', 2], ['riverReed', 1]]],
  ['Mana', 'mana', 'restoreMana', [30, 60, 100, 150, 220], { vessel: 'round', liquid: ['#5ab0ff', '#141e8a'], glyph: 'star', fx: ['glow'] }, [['moongrass', 2], ['riverReed', 1]]],
  ['Stamina', 'stamina', 'restoreStamina', [40, 70, 110, 160, 220], { vessel: 'round', liquid: ['#7ee05a', '#16642a'], glyph: 'bolt' }, [['wildmint', 2], ['riverReed', 1]]],
];
for (const [word, what, key, amounts, art, base] of DRAUGHT) {
  STRENGTHS.forEach(([grade, rarity, t], i) => {
    const id = `draught${word}${t}`;
    one(id, `${grade} ${word} Draught`, rarity, `Restores ${amounts[i]} ${what}.`, { [key]: amounts[i] }, [`shop:alchemist:${Math.min(6, t)}`, 'shop:trader:' + Math.min(6, t), `chest:${t}`, `drop:any:${t}`], potionArt({ ...art, tier: t }), { lvl: t * 6 - 5 });
    recipe(id, 'alchemy', 'herbalism', [1, 4, 9, 15, 22][i], [...base.map(([b, n]) => [b, n + i] as [string, number]), ...(i >= 2 ? [['honeycomb', 1] as [string, number]] : []), ...(i >= 3 ? [['starmoss', 1] as [string, number]] : [])], 'basic', { step: 'stir' });
  });
}

// ---- elixirs (40) ------------------------------------------------------------------------------
type E = [string, string, Rarity, string, Buff, PotionArt, [string, number][], number, ItemDef['use']?];
const b = (id: string, label: string, sec: number, m: Record<string, number>): Buff => ({ id, label, sec, m });
const ELIXIRS: E[] = [
  // combat
  ['bearsBlood', 'Bear\'s Blood', 'fine', 'Thick and red and tastes of iron.', b('bearsBlood', 'Bear\'s Blood', 120, { hp: 40, poise: 0.15 }), { vessel: 'square', liquid: ['#c03a2a', '#5a0a0a'], glyph: 'paw' }, [['bearClaw', 1], ['ironleaf', 2]], 6],
  ['viperTonic', 'Viper Tonic', 'fine', 'A green-gold tonic with a snake\'s bite.', b('viperTonic', 'Viper Tonic', 120, { crit: 0.1 }), { vessel: 'vial', liquid: ['#c4ec5a', '#3e7a12'], glyph: 'fang' }, [['venomSac', 1], ['wildmint', 1]], 8],
  ['ironGut', 'Iron Gut', 'fine', 'Nothing you eat or drink can hurt you for a while.', b('ironGut', 'Iron Gut', 300, { ward_venom: 0.6 }), { vessel: 'jar', liquid: ['#a8a080', '#4a4430'], glyph: 'pot' }, [['ironleaf', 2], ['wildGarlic', 1]], 4],
  ['quicksilverDraught', 'Quicksilver Draught', 'rare', 'Your feet stop agreeing with the ground.', b('quicksilver', 'Quicksilver', 90, { dodgeCost: -0.3, moveSpeed: 0.05 }), { vessel: 'vial', liquid: ['#e0e4ec', '#7a7e88'], glyph: 'boot', fx: ['sparkle'] }, [['quicksilver', 1], ['wildmint', 1]], 12],
  ['stoneskinDraught', 'Stoneskin Draught', 'rare', 'Your skin goes grey and hard.', b('stoneskin', 'Stoneskin', 90, { dmgTaken: -0.15, moveSpeed: -0.05 }), { vessel: 'square', liquid: ['#a8a8a0', '#4a4a44'], glyph: 'mountain' }, [['ironleaf', 2], ['golemCore', 1]], 16],
  ['rageDraught', 'Rage Draught', 'fine', 'The world goes red at the edges.', b('rage', 'Rage', 60, { melee: 0.2, dmgTaken: 0.1 }), { vessel: 'square', liquid: ['#ff5a3a', '#7a0a0a'], glyph: 'fist', fx: ['steam'] }, [['warPaint', 1], ['emberroot', 1]], 8],
  ['steadyHand', 'Steady Hand', 'fine', 'For archers: the hand stops shaking.', b('steadyHand', 'Steady Hand', 180, { crit: 0.08, castSpeed: 0.05 }), { vessel: 'tall', liquid: ['#d8e8f0', '#4a6a8a'], glyph: 'eye' }, [['eaglefern', 1], ['wildmint', 1]], 6],
  ['secondWind', 'Second Wind', 'common', 'A sharp mint tonic that brings the breath back.', b('secondWind', 'Second Wind', 60, { staminaRegen: 0.5 }), { vessel: 'vial', liquid: ['#9af0c0', '#2a8a5a'], glyph: 'cloud' }, [['wildmint', 2]], 2],
  ['duelistsDraught', 'Duelist\'s Draught', 'rare', 'Time slows, a little, when steel meets steel.', b('duelist', 'Duelist\'s Draught', 120, { parryWindow: 0.3 }), { vessel: 'tall', liquid: ['#e8c060', '#7a5a10'], glyph: 'dagger' }, [['silverthistle', 1], ['honeycomb', 1]], 12],
  ['berserkersBane', 'Berserker\'s Bane', 'rare', 'The closer you are to death, the harder you hit.', b('berserkersBane', 'Berserker\'s Bane', 120, { lowHp: 0.3 }), { vessel: 'square', liquid: ['#a02a5a', '#3a0a1a'], glyph: 'skull' }, [['bloodcap', 2], ['warPaint', 1]], 14],
  // magic
  ['sageWater', 'Sage Water', 'common', 'Clear water steeped with sage. The head clears.', b('sageWater', 'Sage Water', 180, { manaRegen: 0.5 }), { vessel: 'bottle', liquid: ['#c8f0e0', '#4a8a7a'], glyph: 'leaf' }, [['sandSage', 1], ['springWater', 1]], 3],
  ['emberTincture', 'Ember Tincture', 'fine', 'A few drops warm the whole body.', b('emberTincture', 'Ember Tincture', 120, { fireDmg: 0.2 }), { vessel: 'vial', liquid: ['#ffb040', '#a02a0a'], glyph: 'flame', fx: ['embers'] }, [['emberroot', 2], ['coal', 1]], 6],
  ['galeTonic', 'Gale Tonic', 'fine', 'It fizzes like a storm.', b('galeTonic', 'Gale Tonic', 120, { windDmg: 0.2 }), { vessel: 'tall', liquid: ['#cfeeff', '#4a8ac8'], glyph: 'cloud', fx: ['bubbles'] }, [['falconFeather', 1], ['wildmint', 1]], 6],
  ['dawnwater', 'Dawnwater', 'fine', 'Water left out on a chapel step from midnight to dawn.', b('dawnwater', 'Dawnwater', 120, { holyDmg: 0.2 }), { vessel: 'bottle', liquid: ['#fff0a0', '#c8a040'], glyph: 'dawn', fx: ['glow'] }, [['springWater', 1], ['marigold', 1]], 6],
  ['frostbiteTonic', 'Frostbite Tonic', 'fine', 'So cold it burns.', b('frostbiteTonic', 'Frostbite Tonic', 120, { spell: 0.1, castSpeed: 0.05 }), { vessel: 'vial', liquid: ['#a8e4ff', '#2e60b0'], glyph: 'flake', fx: ['frost'] }, [['iceMoss', 1], ['silverthistle', 1]], 8],
  ['arcaneClarity', 'Arcane Clarity', 'rare', 'Spells come easier.', b('arcaneClarity', 'Arcane Clarity', 180, { manaCost: -0.2 }), { vessel: 'round', liquid: ['#b08aff', '#3a1a8a'], glyph: 'rune', fx: ['sparkle'] }, [['moongrass', 2], ['cutAmethyst', 1]], 12],
  ['spellwell', 'Spellwell', 'rare', 'A deeper well to draw from.', b('spellwell', 'Spellwell', 300, { mana: 40 }), { vessel: 'heart', liquid: ['#5ab0ff', '#141e8a'], glyph: 'circle' }, [['moongrass', 3], ['honeycomb', 1]], 10],
  ['moonshine', 'Moonshine', 'fine', 'Distilled under a full moon, by people who should not be distilling.', b('moonshine', 'Moonshine', 300, { manaRegen: 0.4, nightDmg: 0.05 }), { vessel: 'bottle', liquid: ['#dccaff', '#5a3ab8'], glyph: 'moon', glass: '#a8c49a' }, [['moonpetal', 1], ['wheat', 2]], 6],
  ['focusTea', 'Focus Tea', 'common', 'Bitter, and very awake.', b('focusTea', 'Focus Tea', 300, { castSpeed: 0.12 }), { vessel: 'cup', liquid: ['#c8a050', '#5a3a10'], glyph: 'eye' }, [['chamomile', 1], ['wildmint', 1]], 4],
  ['starlightDraught', 'Starlight Draught', 'epic', 'It glows in the bottle and, for a while, in you.', b('starlight', 'Starlight', 180, { spell: 0.15, castSpeed: 0.05 }), { vessel: 'heart', liquid: ['#cfe0ff', '#4a5ab8'], glyph: 'star', fx: ['glow', 'sparkle'], stopper: 'gold' }, [['starmoss', 2], ['essenceStar', 1]], 26],
  // travel
  ['nightEyes', 'Night Eyes', 'fine', 'Your eyes catch the light like a cat\'s.', b('nightEyes', 'Night Eyes', 600, { lightRoom: 1 }), { vessel: 'vial', liquid: ['#8af0c0', '#0a5a48'], glyph: 'eye', fx: ['glow'] }, [['echoGland', 1], ['glowmoss', 1]], 5],
  ['featherfoot', 'Featherfoot Draught', 'fine', 'Light on your feet.', b('featherfoot', 'Featherfoot', 180, { dodgeCost: -0.15, moveSpeed: 0.05 }), { vessel: 'tall', liquid: ['#e0f0ff', '#7aa0d8'], glyph: 'feather', fx: ['sparkle'] }, [['falconFeather', 1], ['honeycomb', 1]], 6],
  ['waterbreath', 'Waterbreath', 'fine', 'Tastes of the sea. For three minutes you can breathe underwater.', b('waterbreath', 'Waterbreath', 180, {}), { vessel: 'gourd', liquid: ['#4ae4d0', '#0a5a74'], glyph: 'fish', fx: ['bubbles'] }, [['sailorsKelp', 2], ['saltwort', 1]], 8, { kind: 'breath', sec: 180 }],
  ['coldward', 'Coldward', 'common', 'Keeps the cold out.', b('coldward', 'Coldward', 600, { stamina: 20, dmgTaken: -0.05 }), { vessel: 'square', liquid: ['#a8e4ff', '#2e60b0'], glyph: 'shield', fx: ['frost'] }, [['emberroot', 1], ['wildGarlic', 1]], 4],
  ['heatward', 'Heatward', 'fine', 'Keeps the sun off your skin from the inside.', b('heatward', 'Heatward', 600, { fireResist: 0.3, desertWard: 0.08 }), { vessel: 'square', liquid: ['#ffc24a', '#c0400e'], glyph: 'sun', fx: ['embers'] }, [['ghostCactus', 1], ['oasisWater', 1]], 10],
  ['swiftfoot', 'Swiftfoot', 'fine', 'You walk like you are late.', b('swiftfoot', 'Swiftfoot', 300, { moveSpeed: 0.15 }), { vessel: 'bottle', liquid: ['#e0a458', '#7a4210'], glyph: 'boot' }, [['wildmint', 1], ['eaglefern', 1]], 5],
  ['hush', 'Hush', 'rare', 'Your footsteps go quiet. Foes do not see you coming: blows from behind land harder.', b('hush', 'Hush', 180, { backstab: 0.3 }), { vessel: 'bottle', liquid: ['#5a4a7a', '#0c0818'], glyph: 'moon', glass: '#3a3450', fx: ['dark'] }, [['duskbloom', 1], ['moongrass', 1]], 10],
  ['fogCutter', 'Fog-Cutter', 'common', 'A sailor\'s pick-me-up. Clears the head on a grey morning.', b('fogCutter', 'Fog-Cutter', 300, { staminaRegen: 0.15, crit: 0.03 }), { vessel: 'bottle', liquid: ['#e8e0c8', '#8a7a5a'], glyph: 'anchor' }, [['saltwort', 1], ['wildmint', 1]], 3],
  ['mulesBack', 'Mule\'s Back', 'fine', 'For long hauls: you could carry a cart.', b('mulesBack', 'Mule\'s Back', 600, { stamina: 40 }), { vessel: 'jar', liquid: ['#c8a050', '#5a3a10'], glyph: 'hammer' }, [['wheat', 2], ['honeycomb', 1]], 5],
  ['longLungs', 'Long Lungs', 'common', 'You can hold your breath for a minute and a half.', b('longLungs', 'Long Lungs', 90, {}), { vessel: 'gourd', liquid: ['#7ad0e0', '#1a5a6a'], glyph: 'drop' }, [['sailorsKelp', 1]], 2, { kind: 'breath', sec: 90 }],
  // rare
  ['draughtOfRemembering', 'Draught of Remembering', 'epic', 'Everything you have ever learned comes back, sharper. You learn faster for a while.', b('remembering', 'Remembering', 600, { xpGain: 0.25, masteryGain: 0.25 }), { vessel: 'heart', liquid: ['#e8d8ff', '#6a4ab8'], glyph: 'book', fx: ['sparkle'], stopper: 'gold' }, [['moonpetal', 2], ['essenceStar', 1]], 22],
  ['phoenixTear', 'Phoenix Tear', 'epic', 'A single burning drop. For ten minutes, the first blow that would kill you leaves you standing with half your health instead.', b('phoenix', 'Phoenix Tear', 600, {}), { vessel: 'heart', liquid: ['#ffb040', '#c02a0a'], fx: ['embers', 'glow'], stopper: 'gold' }, [['phoenixFeather', 1], ['lifebloomTonic', 1]], 28, { kind: 'phoenix' }],
  ['liquidCourage', 'Liquid Courage', 'common', 'It is mostly brandy.', b('courage', 'Liquid Courage', 120, { melee: 0.1, dmgTaken: -0.05 }), { vessel: 'bottle', liquid: ['#d08a3a', '#5a2a0a'], glyph: 'fist' }, [['grainSpirit', 1], ['honeycomb', 1]], 3],
  ['tearsOfDawn', 'Tears of the Dawn', 'epic', 'Holy water wept by a statue in the Temple. Rarer than it should be.', b('tearsOfDawn', 'Tears of the Dawn', 300, { heal: 0.3, holyDmg: 0.1 }), { vessel: 'heart', liquid: ['#fff6c8', '#e0b040'], glyph: 'dawn', fx: ['glow', 'sparkle'], stopper: 'gold' }, [['essenceLight', 1], ['springWater', 2]], 20],
  ['giantsDraught', 'Giant\'s Draught', 'rare', 'You feel taller. You are not.', b('giants', 'Giant\'s Draught', 180, { hp: 80, poise: 0.2, moveSpeed: -0.05 }), { vessel: 'jar', liquid: ['#a07a4a', '#4a2a0a'], glyph: 'mountain' }, [['trollsBlood', 1], ['rawMeat', 2]], 16],
  ['sirensSong', 'Siren\'s Song', 'rare', 'You hear singing. So does the sea.', b('sirensSong', 'Siren\'s Song', 300, { bane_sea: 0.2, seaDmg: 0.1 }), { vessel: 'gourd', liquid: ['#e0d0ff', '#4a3a8a'], glyph: 'fish', fx: ['sparkle'] }, [['sirenFeather', 1], ['pearl', 1]], 22],
  ['golemOil', 'Golem Oil', 'rare', 'Drink it and your skin goes to stone. Slow stone.', b('golemOil', 'Golem Oil', 120, { dmgTaken: -0.2, attackSpeed: -0.1 }), { vessel: 'oil', liquid: ['#c8a050', '#5a4010'], glyph: 'mountain' }, [['golemCore', 1], ['pressedOil', 1]], 20],
  ['wyrmsBlood', 'Wyrm\'s Blood', 'epic', 'Hot as a forge, and it stays hot inside you.', b('wyrmsBlood', 'Wyrm\'s Blood', 300, { fireResist: 0.4, fireDmg: 0.15 }), { vessel: 'heart', liquid: ['#ff5a2a', '#6a0a0a'], fx: ['embers'], stopper: 'gold' }, [['drakeHeart', 1], ['dragonsBlood', 1]], 24],
  ['drownedMansBreath', 'Drowned Man\'s Breath', 'rare', 'You will not drown, for a long time. You may wish you could.', b('drownedBreath', 'Drowned Man\'s Breath', 300, { stamina: 30 }), { vessel: 'gourd', liquid: ['#3a6a6a', '#0a1a1a'], glyph: 'skull', fx: ['bubbles'] }, [['graveCloth', 1], ['sailorsKelp', 2]], 18, { kind: 'breath', sec: 300 }],
  ['duskElixir', 'Dusk Elixir', 'epic', 'The Dark\'s own medicine. It works. That is the worrying part.', b('duskElixir', 'Dusk Elixir', 300, { darkDmg: 0.25, killHeal: 10 }), { vessel: 'heart', liquid: ['#5a3a8a', '#0a0414'], glyph: 'moon', fx: ['dark'], glass: '#3a3450' }, [['gloamIchor', 1], ['duskbloom', 2]], 30],
];
for (const [id, name, rarity, desc, buff, art, inputs, lvl, use] of ELIXIRS) {
  const t = Math.max(1, Math.min(6, Math.ceil(lvl / 5)));
  one(id, name, rarity, desc, {}, [`shop:alchemist:${t}`, `chest:${t + 1}`], potionArt(art), { buff, use, lvl });
  recipe(id, 'alchemy', 'herbalism', lvl, inputs, 'basic', { step: 'stir' });
}

// ---- blade oils (15) -----------------------------------------------------------------------------
const OILS: [string, string, string, Record<string, number>, string, [string, number][], number][] = [
  ['oilBeastbane', 'Beastbane Oil', 'beast', { bane_beast: 0.25 }, '#8a6a3a', [['wolfsbane', 1], ['pressedOil', 1]], 4],
  ['oilHallowed', 'Hallowed Oil', 'undead', { bane_undead: 0.25 }, '#fff0a0', [['marigold', 1], ['pressedOil', 1]], 5],
  ['oilGloambane', 'Gloambane Oil', 'gloam', { bane_gloam: 0.25 }, '#9a7aff', [['essenceLight', 1], ['pressedOil', 1]], 18],
  ['oilOrcbane', 'Orcbane Oil', 'orc', { bane_orc: 0.25 }, '#6a8a3a', [['orcTusk', 1], ['pressedOil', 1]], 8],
  ['oilGoblinbane', 'Goblinbane Oil', 'goblin', { bane_goblin: 0.25 }, '#7a9a4a', [['goblinEar', 2], ['pressedOil', 1]], 3],
  ['oilSlimebane', 'Slimebane Oil', 'slime', { bane_slime: 0.25 }, '#8ae05a', [['pureSalt', 1], ['pressedOil', 1]], 3],
  ['oilWyrmbane', 'Wyrmbane Oil', 'wyrm', { bane_wyrm: 0.25 }, '#c03a2a', [['drakeScale', 1], ['pressedOil', 1]], 14],
  ['oilSeabane', 'Seabane Oil', 'sea', { bane_sea: 0.25 }, '#2aa8a0', [['pureSalt', 1], ['sailorsKelp', 1]], 12],
  ['oilConstructbane', 'Rustbane Oil', 'construct', { bane_construct: 0.25 }, '#c8643a', [['quicksilver', 1], ['pressedOil', 1]], 12],
  ['oilInsectbane', 'Crawlerbane Oil', 'insect', { bane_insect: 0.25 }, '#5a5a3a', [['wildGarlic', 2], ['pressedOil', 1]], 3],
  ['oilFire', 'Fire Oil', '', { fireDmg: 0.15, melee: 0.05 }, '#ff7a2a', [['emberroot', 2], ['sulphur', 1]], 6],
  ['oilFrost', 'Frost Oil', '', { melee: 0.08, poiseDmg: 0.1 }, '#7fd4ff', [['iceMoss', 1], ['silverthistle', 1]], 8],
  ['oilVenom', 'Venom Oil', '', { melee: 0.1 }, '#8ad04a', [['venomSac', 1], ['raySting', 1]], 10],
  ['oilSilver', 'Silver Oil', '', { bane_undead: 0.15, bane_gloam: 0.15 }, '#dfe8ff', [['silverIngot', 1], ['pressedOil', 1]], 12],
  ['oilHoly', 'Holy Oil', '', { holyDmg: 0.2, bane_undead: 0.1 }, '#ffe08a', [['essenceLight', 1], ['marigold', 1]], 16],
];
for (const [id, name, , m, col, inputs, lvl] of OILS) {
  const t = Math.max(1, Math.min(6, Math.ceil(lvl / 5)));
  one(id, name, lvl >= 14 ? 'rare' : 'fine', 'Coat your weapon (one oil at a time).', {}, [`shop:alchemist:${t}`, 'fshop:hunter', `chest:${t}`], potionArt({ vessel: 'oil', liquid: [col, '#2a2a2a'], glyph: 'dagger' }), { buff: b('bladeOil', name, 180, m), lvl });
  recipe(id, 'alchemy', 'herbalism', lvl, inputs, 'basic', { step: 'stir' });
}

// ---- bombs and flasks (17 new, and the Ember Bomb) -----------------------------------------------
const BOMBS: [string, string, Rarity, string, NonNullable<ItemDef['use']>, PotionArt, [string, number][], number, string[]][] = [
  ['frostFlask', 'Frost Flask', 'fine', 'Bursts in a ring of frost 4 m ahead: 40 damage, and those caught freeze.', { kind: 'bomb', n: 40, r: 3, style: 'frost' }, { vessel: 'bomb', liquid: ['#a8e4ff', '#2e60b0'], glyph: 'flake', fx: ['frost'] }, [['iceMoss', 1], ['silverthistle', 1]], 6, []],
  ['smokeBomb', 'Smoke Bomb', 'fine', 'A cloud of smoke: foes lose sight of you for 4 s.', { kind: 'veil', sec: 4 }, { vessel: 'bomb', liquid: ['#a0a0a0', '#3a3a3a'], glyph: 'cloud', fx: ['smoke'] }, [['caveGuano', 1], ['coal', 1]], 5, ['fshop:twoCoins']],
  ['plagueFlask', 'Plague Flask', 'rare', 'Bursts 4 m ahead in a sickly cloud: whatever is caught rots, 8 damage a second for 6 s.', { kind: 'rot', n: 8, r: 3, sec: 6 }, { vessel: 'bomb', liquid: ['#a8d04a', '#3a5a0a'], glyph: 'skull', fx: ['toxic'] }, [['plagueTooth', 2], ['acidSac', 1]], 10, []],
  ['flashPowder', 'Flash Powder', 'fine', 'A blinding flash around you: foes within 5 m are stunned.', { kind: 'stun', r: 5 }, { vessel: 'jar', liquid: ['#ffffff', '#e8e0a0'], glyph: 'sun', fx: ['sparkle'] }, [['sulphur', 1], ['quicksilver', 1]], 8, []],
  ['caltrops', 'Caltrops', 'common', 'Scattered iron spikes: foes within 4 m bleed 4 a second.', { kind: 'caltrops', n: 4, r: 4 }, { vessel: 'jar', liquid: ['#8a8a90', '#3a3a3a'], glyph: 'claw' }, [['ironIngot', 1]], 2, ['shop:smith:1']],
  ['glueMug', 'Sticky Glue Pot', 'fine', 'Bursts 4 m ahead: those caught are stuck fast (stunned).', { kind: 'stunAhead', r: 3 }, { vessel: 'jar', liquid: ['#e8d080', '#8a6a1a'], glyph: 'drop' }, [['slimeJelly', 2], ['pressedOil', 1]], 6, []],
  ['thunderclap', 'Thunderclap', 'rare', 'A clap like a cannon around you: 50 damage and a great shove.', { kind: 'blast', n: 50, r: 4.5 }, { vessel: 'bomb', liquid: ['#cfe0ff', '#4a5ab8'], glyph: 'bolt', fx: ['sparkle'] }, [['sulphur', 2], ['caveGuano', 1]], 12, []],
  ['holyWaterFlask', 'Holy Water Flask', 'fine', 'Bursts in a holy flash 4 m ahead: 50 damage, three times that to the dead.', { kind: 'holy', n: 50, r: 3 }, { vessel: 'bomb', liquid: ['#fff6c8', '#e0b040'], glyph: 'dawn', fx: ['glow'] }, [['springWater', 1], ['marigold', 2]], 6, ['fshop:temple']],
  ['shrapnelBomb', 'Shrapnel Bomb', 'fine', 'A tin of nails and powder. 70 damage 4 m ahead, and everything caught bleeds.', { kind: 'bomb', n: 70, r: 3.5, style: 'steel' }, { vessel: 'bomb', liquid: ['#a0a0a8', '#3a3a3a'], glyph: 'claw' }, [['scrapMetal', 2], ['sulphur', 1]], 14, ['fshop:scrap']],
  ['sandBomb', 'Sand Bomb', 'fine', 'A bag of hot sand: foes 4 m ahead are blinded (stunned) and burned a little.', { kind: 'stunAhead', r: 3.5, n: 15 }, { vessel: 'jar', liquid: ['#e8c890', '#8a6a3a'], glyph: 'sun' }, [['pureSalt', 1], ['dates', 1]], 10, ['fshop:desert']],
  ['pitchPot', 'Pitch Pot', 'common', 'Burning pitch 4 m ahead: 35 fire damage.', { kind: 'bomb', n: 35, r: 3, style: 'fire' }, { vessel: 'jar', liquid: ['#3a2a1a', '#0a0a0a'], glyph: 'flame', fx: ['smoke'] }, [['coal', 2], ['pressedOil', 1]], 2, ['shop:trader:1']],
  ['netBomb', 'Net Bomb', 'fine', 'A weighted net, thrown: whatever is 4 m ahead is held still for a moment.', { kind: 'stunAhead', r: 2.5 }, { vessel: 'jar', liquid: ['#c8a87a', '#5a3a1a'], glyph: 'spider' }, [['spiderSilk', 1], ['flax', 2]], 6, []],
  ['decoyDoll', 'Decoy Doll', 'fine', 'A straw doll in your coat: foes lose sight of you for 6 s.', { kind: 'veil', sec: 6 }, { vessel: 'jar', liquid: ['#d8c080', '#8a6a3a'], glyph: 'circle' }, [['wheat', 3], ['woolCloth', 1]], 4, ['shop:trader:2']],
  ['beehivePot', 'Beehive Pot', 'fine', 'A pot with an angry hive in it: foes 4 m ahead are stung, 5 damage a second for 8 s.', { kind: 'rot', n: 5, r: 3.5, sec: 8 }, { vessel: 'jar', liquid: ['#f0c040', '#8a5a0a'], glyph: 'wing' }, [['honeycomb', 2]], 4, ['site:hives']],
  ['blackpowderKeg', 'Blackpowder Keg', 'rare', 'A small keg with a short fuse. 120 damage 4 m ahead.', { kind: 'bomb', n: 120, r: 4.5, style: 'fire' }, { vessel: 'jar', liquid: ['#3a3a3a', '#0a0a0a'], glyph: 'flame', fx: ['smoke'] }, [['sulphur', 2], ['coal', 2], ['caveGuano', 2]], 16, ['fshop:wrecker', 'drop:sea:5']],
  ['gloamGrenade', 'Gloam Grenade', 'epic', 'Shade-smoke in black glass. 90 damage 4 m ahead, and the light goes out of those it touches (stunned).', { kind: 'gloam', n: 90, r: 3.5 }, { vessel: 'bomb', liquid: ['#5a3a8a', '#0a0414'], glyph: 'moon', fx: ['dark'] }, [['shadeSmoke', 1], ['gloamIchor', 1]], 26, ['drop:gloam:6']],
  ['sirenBell', 'Siren Bell', 'rare', 'A little bell that calms the sea\'s creatures: sea foes within 10 m are stunned.', { kind: 'calm', r: 10, style: 'sea' }, { vessel: 'jar', liquid: ['#e0d0ff', '#4a3a8a'], glyph: 'anchor' }, [['choirPearl', 1], ['silverIngot', 1]], 22, ['fshop:wrecker']],
];
for (const [id, name, rarity, desc, use, art, inputs, lvl, extra] of BOMBS) {
  const t = Math.max(1, Math.min(6, Math.ceil(lvl / 5)));
  one(id, name, rarity, desc, {}, [`shop:alchemist:${t}`, `chest:${t}`, ...extra], potionArt(art), { use, lvl });
  recipe(id, 'alchemy', 'herbalism', lvl, inputs, lvl <= 4 ? 'basic' : 'discover', { step: 'stir' });
}
source('emberBomb', 'shop:alchemist:2', 'chest:2');

// ---- regional meals (44 new, and the Banquet) -----------------------------------------------------
const food = (s: FoodSpec): CatArt => ({ k: 'food', s });
type Meal = [string, string, string, Rarity, ItemStats, Record<string, number>, number, FoodSpec, [string, number][]];
const MEALS: [string, number, Meal[]][] = [
  ['Elder Glen', 1, [
    ['glenBarleyBread', 'Glen Barley Bread', 'A dense brown loaf from the Glen ovens.', 'common', { heal: 25 }, { stamina: 10 }, 300, { kind: 'loaf', color: '#a87a44' }, [['wheat', 2]]],
    ['halesCheesePie', 'Hale\'s Cheese Pie', 'Tom Hale\'s wife\'s pie, famous for three villages.', 'fine', { heal: 40 }, { hp: 15 }, 420, { kind: 'cake', color: '#e8c060' }, [['wheat', 1], ['milk', 1], ['egg', 1]]],
    ['wrensHarvestSoup', 'Wren\'s Harvest Soup', 'Everything that was ready in the field, in one pot.', 'fine', { heal: 35 }, { staminaRegen: 0.12 }, 420, { kind: 'stew', color: '#c88a3a' }, [['carrot', 1], ['cabbage', 1], ['pumpkin', 1]]],
  ]],
  ['Wayfarer\'s Rest', 1, [
    ['wayfarerStew', 'Wayfarer Stew', 'Mara Bell\'s stew. The pot has not been empty in nine years.', 'fine', { heal: 40 }, { stamina: 20 }, 420, { kind: 'stew', color: '#8a4a22' }, [['rawMeat', 1], ['carrot', 1]]],
    ['hestersPasty', 'Hester\'s Pasty', 'Meat and turnip in a pastry made to be carried.', 'common', { heal: 30 }, { staminaRegen: 0.08 }, 600, { kind: 'cake', color: '#c8a058' }, [['wheat', 1], ['rawMeat', 1]]],
    ['roadBiscuit', 'Road Biscuit', 'Hard enough to drive a nail. Keeps forever.', 'common', { heal: 15 }, { stamina: 10 }, 900, { kind: 'biscuit', color: '#d8b878' }, [['wheat', 1]]],
  ]],
  ['Kingsmile and Thornfield', 2, [
    ['thornfieldSausage', 'Thornfield Sausage', 'A coil of peppered sausage from the Thornfield smokehouse.', 'common', { heal: 35 }, { melee: 0.04 }, 420, { kind: 'meat', color: '#9a4a32' }, [['rawMeat', 1], ['wildGarlic', 1]]],
    ['mileAleBread', 'Mile Ale-Bread', 'Bread made with ale instead of water. Kingsmile swears by it.', 'common', { heal: 30 }, { stamina: 15 }, 420, { kind: 'loaf', color: '#8a5a2a' }, [['wheat', 2], ['grainSpirit', 1]]],
    ['droversPorridge', 'Drover\'s Porridge', 'Oats, milk and honey: a drover walks all day on it.', 'common', { heal: 25 }, { staminaRegen: 0.15 }, 600, { kind: 'stew', color: '#e8dcc0' }, [['wheat', 1], ['milk', 1], ['honeycomb', 1]]],
  ]],
  ['Port Aurelle', 2, [
    ['fishMarketChowder', 'Fish Market Chowder', 'Whatever did not sell by noon, in cream.', 'fine', { heal: 45 }, { hp: 20 }, 420, { kind: 'stew', color: '#e8dcc0' }, [['fish', 1], ['milk', 1]]],
    ['academyMessHash', 'Academy Mess Hash', 'The cadets complain about it, and eat it, every day.', 'common', { heal: 30 }, { stamina: 15, poise: 0.04 }, 420, { kind: 'stew', color: '#a87a44' }, [['rawMeat', 1], ['cabbage', 1]]],
    ['dockhandsPie', 'Dockhand\'s Pie', 'A fish pie with a thick crust, eaten standing up.', 'common', { heal: 35 }, { staminaRegen: 0.1 }, 420, { kind: 'cake', color: '#c8a058' }, [['fish', 1], ['wheat', 1]]],
  ]],
  ['the Royal Capital', 3, [
    ['gildedStagRoast', 'Gilded Stag Roast', 'The Gilded Stag\'s roast, carved at the table.', 'rare', { heal: 70 }, { hp: 30, melee: 0.06 }, 600, { kind: 'feast', color: '#8a4a22' }, [['rawMeat', 2], ['apple', 1], ['wildGarlic', 1]]],
    ['lowCityFriedDough', 'Low-City Fried Dough', 'Sugar and grease in a paper cone, from a cart in the Low City.', 'common', { heal: 25 }, { moveSpeed: 0.04 }, 300, { kind: 'cake', color: '#e8b860' }, [['wheat', 1], ['pressedOil', 1]]],
    ['palaceHoneyCakes', 'Palace Honey Cakes', 'Tiny cakes from the palace kitchens. Someone smuggled out a box.', 'rare', { heal: 40 }, { mana: 30, manaRegen: 0.2 }, 600, { kind: 'cake', color: '#f0c040' }, [['wheat', 1], ['honeycomb', 2], ['egg', 1]]],
  ]],
  ['the Crown Road', 3, [
    ['outpostRation', 'Outpost Ration', 'Salt pork and hardtack: the Crown Outpost\'s idea of food.', 'common', { heal: 30 }, { stamina: 25 }, 900, { kind: 'ration', color: '#a87a44' }, [['rawMeat', 1], ['wheat', 1]]],
    ['pilgrimsBread', 'Pilgrim\'s Bread', 'Flat bread baked at the Pilgrims\' Rest and blessed at the door.', 'fine', { heal: 35 }, { heal: 0.08 }, 600, { kind: 'loaf', color: '#d8b878' }, [['wheat', 2], ['honeycomb', 1]]],
    ['harrowFordTrout', 'Harrow Ford Trout', 'A trout from the ford, grilled with herbs.', 'fine', { heal: 45 }, { staminaRegen: 0.15 }, 420, { kind: 'grilledFish', color: '#c08a4a' }, [['fish', 1], ['wildmint', 1]]],
  ]],
  ['the dwarven holds', 4, [
    ['deepMushroomLoaf', 'Deep-Mushroom Loaf', 'Bread baked with cave mushrooms. It glows a little.', 'fine', { heal: 50 }, { hp: 25, dmgTaken: -0.04 }, 600, { kind: 'loaf', color: '#7a6a5a' }, [['wheat', 2], ['ghostcap', 1]]],
    ['stonebrewStew', 'Stonebrew Stew', 'Meat stewed in dwarven ale until it gives up.', 'rare', { heal: 60 }, { stamina: 30, poise: 0.08 }, 600, { kind: 'stew', color: '#5a3a1a' }, [['rawMeat', 2], ['grainSpirit', 1]]],
    ['forgeBakedRibs', 'Forge-Baked Ribs', 'Ribs cooked on the forge\'s banked coals.', 'rare', { heal: 65 }, { melee: 0.08 }, 600, { kind: 'meat', color: '#8a3a1a' }, [['rawMeat', 2], ['coal', 1]]],
  ]],
  ['Sunspire', 5, [
    ['dateCakesSun', 'Sunspire Date Cakes', 'Sticky date cakes with sesame.', 'fine', { heal: 45 }, { staminaRegen: 0.15, mana: 15 }, 600, { kind: 'dates', color: '#7a3a1a' }, [['dates', 2], ['wheat', 1]]],
    ['spicedLamb', 'Spiced Lamb', 'Lamb with cumin and dried lime.', 'rare', { heal: 70 }, { hp: 30, melee: 0.06 }, 600, { kind: 'meat', color: '#9a4a2a' }, [['rawMeat', 2], ['emberroot', 1]]],
    ['wellWaterFlatbread', 'Well-Water Flatbread', 'Flatbread made with water from the Great Well.', 'common', { heal: 30 }, { fireResist: 0.1 }, 900, { kind: 'loaf', color: '#e8d8a8' }, [['wheat', 1], ['oasisWater', 1]]],
  ]],
  ['the desert villages', 5, [
    ['scorpionSkewer', 'Scorpion Skewer', 'Crunchy. Do not think about it.', 'fine', { heal: 40 }, { crit: 0.04 }, 420, { kind: 'meat', color: '#8a5a2a' }, [['scarabCarapace', 1], ['emberroot', 1]]],
    ['cactusMash', 'Cactus Mash', 'Mashed ghost-cactus: water and food in one.', 'common', { heal: 30 }, { desertWard: 0.05 }, 900, { kind: 'stew', color: '#8ab06a' }, [['ghostCactus', 2]]],
    ['duneJerky', 'Dune Jerky', 'Dried meat, very salty, very chewy.', 'common', { heal: 25 }, { stamina: 20 }, 1200, { kind: 'meat', color: '#6a3a1a' }, [['rawMeat', 1], ['pureSalt', 1]]],
  ]],
  ['the scrap towns', 5, [
    ['tinCanStew', 'Tin-Can Stew', 'A stew that comes in the can it was cooked in.', 'common', { heal: 35 }, { stamina: 20 }, 600, { kind: 'stew', color: '#8a7a5a' }, [['rawMeat', 1], ['scrapMetal', 1]]],
    ['rustMarketMeat', 'Rust Market Mystery Meat', 'Nobody knows. Nobody asks.', 'common', { heal: 40 }, { hp: 15 }, 420, { kind: 'meat', color: '#7a4a3a' }, [['rawMeat', 2]]],
    ['greaseBun', 'Gearwater Grease Bun', 'A fried bun so oily it shines.', 'common', { heal: 30 }, { staminaRegen: 0.1 }, 420, { kind: 'cake', color: '#c8a058' }, [['wheat', 1], ['pressedOil', 1]]],
  ]],
  ['Azure Haven and Emerald Cove', 6, [
    ['coconutFish', 'Coconut Fish', 'Reef fish baked in coconut.', 'fine', { heal: 55 }, { hp: 25, staminaRegen: 0.12 }, 600, { kind: 'grilledFish', color: '#e8dcc0' }, [['fish', 1], ['milk', 1]]],
    ['reefSalad', 'Reef Salad', 'Seaweed, lime and raw fish.', 'common', { heal: 35 }, { mana: 25, manaRegen: 0.2 }, 600, { kind: 'stew', color: '#4a8a5a' }, [['fish', 1], ['sailorsKelp', 1]]],
    ['pearlOysterPlate', 'Pearl Oyster Plate', 'A dozen oysters. One may have a pearl in it.', 'rare', { heal: 50 }, { crit: 0.05, heal: 0.08 }, 600, { kind: 'feast', color: '#c8c0b0' }, [['fish', 2], ['saltwort', 1]]],
  ]],
  ['Wrecker\'s Rest and Ashen Port', 6, [
    ['smugglersRumCake', 'Smuggler\'s Rum Cake', 'More rum than cake.', 'fine', { heal: 45 }, { melee: 0.06, dmgTaken: 0.03 }, 600, { kind: 'cake', color: '#6a3a1a' }, [['wheat', 1], ['grainSpirit', 1], ['honeycomb', 1]]],
    ['ashRoastedEel', 'Ash-Roasted Eel', 'Eel roasted in the hot ash of Ashen Port\'s vents.', 'fine', { heal: 55 }, { fireResist: 0.15, hp: 20 }, 600, { kind: 'grilledFish', color: '#5a4a3a' }, [['fish', 1], ['emberAsh', 1]]],
    ['demonPepperCurry', 'Demon-Pepper Curry', 'It hurts. It keeps hurting. You feel tremendous.', 'rare', { heal: 50 }, { fireDmg: 0.15, melee: 0.06 }, 600, { kind: 'stew', color: '#c03a1a' }, [['rawMeat', 1], ['emberroot', 2]]],
  ]],
  ['the Sunken Spire', 6, [
    ['seaweedBread', 'Seaweed Bread', 'Green bread from the drowned town\'s last baker.', 'common', { heal: 35 }, { stamina: 20 }, 600, { kind: 'loaf', color: '#5a7a4a' }, [['wheat', 1], ['sailorsKelp', 1]]],
    ['kelpBroth', 'Kelp Broth', 'A clear, salty broth.', 'common', { heal: 30 }, { manaRegen: 0.25 }, 600, { kind: 'stew', color: '#4a7a5a' }, [['sailorsKelp', 2]]],
    ['drownedBellClams', 'Drowned Bell Clams', 'Clams from under the drowned bell. The locals say they ring.', 'rare', { heal: 50 }, { hp: 25, mana: 20 }, 600, { kind: 'feast', color: '#c8b8a0' }, [['fish', 2], ['pearl', 1]]],
  ]],
  ['the hunting camps', 2, [
    ['venisonHaunch', 'Venison Haunch', 'A haunch of deer roasted on a spit.', 'fine', { heal: 55 }, { hp: 25, stamina: 15 }, 600, { kind: 'meat', color: '#8a3a1a' }, [['rawMeat', 2]]],
    ['boarRoast', 'Boar Roast', 'Wild boar, slow-roasted.', 'fine', { heal: 55 }, { poise: 0.08, hp: 20 }, 600, { kind: 'meat', color: '#9a4a2a' }, [['rawMeat', 2], ['apple', 1]]],
    ['spitRoastedHare', 'Spit-Roasted Hare', 'A hare on a stick, crackling.', 'common', { heal: 35 }, { moveSpeed: 0.04 }, 420, { kind: 'meat', color: '#a8643a' }, [['rawMeat', 1]]],
  ]],
  ['feasts', 3, [
    ['nightOfBellsStew', 'Night of Bells Stew', 'The stew the whole Glen ate on the morning after the Night of Bells. Nobody spoke while they ate it.', 'epic', { heal: 90 }, { hp: 40, dmgTaken: -0.06, stamina: 20 }, 900, { kind: 'stew', color: '#7a3a1a' }, [['rawMeat', 2], ['carrot', 2], ['cabbage', 1]]],
    ['festivalPie', 'Festival Pie', 'The harvest festival\'s pie, the size of a cartwheel.', 'rare', { heal: 70 }, { hp: 30, staminaRegen: 0.15 }, 900, { kind: 'cake', color: '#e8a040' }, [['pumpkin', 2], ['wheat', 2], ['honeycomb', 1]]],
  ]],
];
const INN_SRC: Record<string, string[]> = {
  'Elder Glen': ['inn:elderGlen'], 'Wayfarer\'s Rest': ['inn:cresha'], 'Kingsmile and Thornfield': ['inn:southernMarches', 'inn:cresha'], 'Port Aurelle': ['inn:portAurelle'],
  'the Royal Capital': ['inn:royalCapital'], 'the Crown Road': ['inn:wildlands', 'inn:royalCapital'], 'the dwarven holds': ['inn:whiteMountains', 'inn:deepMountains', 'fshop:dwarven'],
  Sunspire: ['inn:goldenExpanse', 'fshop:desert'], 'the desert villages': ['inn:goldenExpanse', 'fshop:scrap'], 'the scrap towns': ['fshop:scrap'],
  'Azure Haven and Emerald Cove': ['inn:azureIsles', 'inn:emeraldIsles'], 'Wrecker\'s Rest and Ashen Port': ['inn:shatteredIsles', 'fshop:wrecker'], 'the Sunken Spire': ['inn:sunkenIsles'],
  'the hunting camps': ['site:hunter', 'fshop:hunter'], feasts: ['done:mq-bells', 'done:harvest-festival'],
};
for (const [place, t, list] of MEALS) {
  for (const [id, name, desc, rarity, stats, m, sec, art, inputs] of list) {
    one(id, name, rarity, `${desc} A dish of ${place}.`, stats, [...INN_SRC[place], `shop:inn:${t}`], food(art), { buff: b('meal', name, sec, m), lvl: t * 5 - 4 });
    recipe(id, 'kitchen', 'cooking', Math.max(1, t * 4 - 3 + (rarity === 'rare' ? 3 : rarity === 'epic' ? 6 : 0)), inputs, 'basic', { step: 'heat' });
  }
}
source('banquet', 'shop:inn:3');

// ---- drinks (13 new) -------------------------------------------------------------------------
const DRINKS: [string, string, string, Rarity, Record<string, number>, PotionArt, string[], [string, number][]][] = [
  ['glenAle', 'Glen Ale', 'Brown, flat and honest.', 'common', { stamina: 10, melee: 0.02 }, { vessel: 'cup', liquid: ['#c88a3a', '#6a3a0a'], glyph: 'wheel' }, ['inn:elderGlen', 'shop:inn:1'], [['wheat', 2]]],
  ['wayfarerStout', 'Wayfarer Stout', 'Black as a cellar and nearly as thick.', 'common', { hp: 15 }, { vessel: 'cup', liquid: ['#3a2a1a', '#0a0a0a'], glyph: 'pot' }, ['inn:cresha', 'shop:inn:1'], [['wheat', 2], ['honeycomb', 1]]],
  ['gildedStagWine', 'Gilded Stag Wine', 'A red from the Stag\'s cellar, older than you.', 'fine', { mana: 20, manaRegen: 0.15 }, { vessel: 'bottle', liquid: ['#9a1a3a', '#3a0a14'], glyph: 'crown', glass: '#3a6a3a' }, ['inn:royalCapital', 'shop:inn:3'], [['apple', 3]]],
  ['dwarvenStonebrew', 'Dwarven Stonebrew', 'Brewed in stone, aged in stone, drunk by people made of stone.', 'fine', { poise: 0.1, dmgTaken: -0.03 }, { vessel: 'cup', liquid: ['#a07a3a', '#3a2a0a'], glyph: 'hammer' }, ['inn:whiteMountains', 'fshop:dwarven', 'shop:inn:4'], [['wheat', 2], ['grainSpirit', 1]]],
  ['dateWine', 'Sunspire Date Wine', 'Sweet, golden and stronger than it tastes.', 'fine', { staminaRegen: 0.12 }, { vessel: 'bottle', liquid: ['#e0a040', '#7a3a0a'], glyph: 'sun', glass: '#c8a070' }, ['inn:goldenExpanse', 'shop:inn:5'], [['dates', 3]]],
  ['rum', 'Rum', 'Dark rum from the isles.', 'common', { melee: 0.04, dmgTaken: 0.02 }, { vessel: 'bottle', liquid: ['#8a4a1a', '#2a0a0a'], glyph: 'anchor', glass: '#5a3a2a' }, ['inn:azureIsles', 'fshop:wrecker', 'shop:inn:6'], [['honeycomb', 2]]],
  ['fireSpirit', 'Ashen Port Fire-Spirit', 'A spirit that burns on the way down and keeps burning.', 'rare', { fireResist: 0.15, fireDmg: 0.08 }, { vessel: 'vial', liquid: ['#ff8a3a', '#8a1a0a'], glyph: 'flame', fx: ['embers'] }, ['inn:shatteredIsles', 'shop:inn:6'], [['emberroot', 2], ['grainSpirit', 1]]],
  ['elvenDew', 'Elven Dew', 'Dew gathered at dawn from a hundred leaves.', 'rare', { heal: 0.08, manaRegen: 0.2 }, { vessel: 'vial', liquid: ['#d0ffe0', '#4a8a5a'], glyph: 'leaf', fx: ['sparkle'] }, ['fshop:elven'], [['springWater', 2], ['moonpetal', 1]]],
  ['chapelMead', 'Chapel Mead', 'Honey wine from the chapel\'s hives.', 'fine', { holyDmg: 0.06, heal: 0.05 }, { vessel: 'bottle', liquid: ['#f0c040', '#8a5a0a'], glyph: 'dawn' }, ['fshop:temple', 'shop:inn:2'], [['honeycomb', 2]]],
  ['mintTea', 'Mint Tea', 'Hot mint tea.', 'common', { staminaRegen: 0.08 }, { vessel: 'cup', liquid: ['#b8e8a0', '#4a7a2a'], glyph: 'leaf' }, ['shop:inn:1', 'shop:inn:5'], [['wildmint', 1]]],
  ['pineTea', 'Pine Tea', 'Pine needles steeped in snow-water. Mountain folk drink it against the cold.', 'common', { hp: 10, dmgTaken: -0.02 }, { vessel: 'cup', liquid: ['#c8d8a0', '#5a6a2a'], glyph: 'tree' }, ['shop:inn:4'], [['springWater', 1], ['eaglefern', 1]]],
  ['valorianRed', 'Valorian Red', 'A legion red, served in the Legation by the jug.', 'fine', { melee: 0.05, fireDmg: 0.05 }, { vessel: 'bottle', liquid: ['#8a0a1a', '#2a0004'], glyph: 'crown', glass: '#3a2a2a' }, ['fshop:valorian'], [['apple', 2], ['grainSpirit', 1]]],
  ['sirenGrog', 'Siren Grog', 'Rum, lime and something that hums.', 'rare', { seaDmg: 0.1, crit: 0.03 }, { vessel: 'cup', liquid: ['#7ad0e0', '#1a5a6a'], glyph: 'fish' }, ['inn:sunkenIsles', 'fshop:wrecker'], [['honeycomb', 1], ['sirenFeather', 1]]],
];
for (const [id, name, desc, rarity, m, art, src, inputs] of DRINKS) {
  one(id, name, rarity, desc, { restoreStamina: 15 }, src, potionArt(art), { buff: b('drink', name, 300, m) });
  recipe(id, 'kitchen', 'cooking', rarity === 'rare' ? 10 : rarity === 'fine' ? 5 : 2, inputs, 'basic', { step: 'heat' });
}
source('spicedCider', 'shop:inn:1');
source('milk', 'shop:inn:1');

// ---- spell scrolls (30) ---------------------------------------------------------------------
const paper = (s: PaperSpec): CatArt => ({ k: 'paper', s });
type Scroll = [string, string, Rarity, string, NonNullable<ItemDef['use']>, string, string, number];
const SCROLLS: Scroll[] = [
  ['scrollFirebolt', 'Scroll of Firebolt', 'common', 'A bolt of fire at your target: 45 fire damage.', { kind: 'bolt', n: 45, style: 'fire' }, '#c0401a', 'flame', 1],
  ['scrollFireball', 'Scroll of Fireball', 'fine', 'A ball of fire bursts at your target: 70 fire damage around it.', { kind: 'ball', n: 70, r: 3.5, style: 'fire' }, '#c0401a', 'flame', 6],
  ['scrollWallOfFire', 'Scroll of Wall of Fire', 'rare', 'A wall of flame in front of you: 60 fire damage along it.', { kind: 'wall', n: 60, style: 'fire' }, '#c0401a', 'flame', 12],
  ['scrollMeteor', 'Scroll of Meteor', 'epic', 'A star falls on your target: 200 damage in a great ring.', { kind: 'meteor', n: 200, r: 5, style: 'fire' }, '#8a1a0a', 'star', 24],
  ['scrollGust', 'Scroll of Gust', 'common', 'A blast of wind ahead: 25 damage and a great shove.', { kind: 'gust', n: 25, r: 6, style: 'wind' }, '#5ab4ff', 'cloud', 1],
  ['scrollBlink', 'Scroll of Blink', 'fine', 'Step eight metres forward in an instant.', { kind: 'blink', n: 8 }, '#5ab4ff', 'wing', 5],
  ['scrollHaste', 'Scroll of Haste', 'fine', 'For 20 s: +20% attack and movement speed.', { kind: 'buff', sec: 20, style: 'haste' }, '#5ab4ff', 'boot', 6],
  ['scrollWindWall', 'Scroll of Wind Wall', 'rare', 'A wall of wind around you: arrows and blows are turned (a ward that soaks 120 damage for 10 s).', { kind: 'ward', n: 120, sec: 10, style: 'wind' }, '#5ab4ff', 'shield', 10],
  ['scrollHealingLight', 'Scroll of Healing Light', 'common', 'Restores 120 health.', { kind: 'heal', n: 120 }, '#e8c060', 'heart', 1],
  ['scrollMote', 'Scroll of Mote of Light', 'common', 'A mote of light: restores 50 health and lights the dark for 5 minutes.', { kind: 'mote', n: 50, sec: 300 }, '#e8c060', 'sun', 1],
  ['scrollHaloWard', 'Scroll of Halo Ward', 'fine', 'A ward of light that soaks 150 damage for 12 s.', { kind: 'ward', n: 150, sec: 12, style: 'light' }, '#e8c060', 'shield', 6],
  ['scrollChainsOfDawn', 'Scroll of Chains of Dawn', 'rare', 'Holy chains around you: 60 holy damage to every foe within 6 m, and they are held (stunned).', { kind: 'chains', n: 60, r: 6, style: 'light' }, '#e8c060', 'dawn', 12],
  ['scrollSecondDawn', 'Scroll of Second Dawn', 'epic', 'For a minute, the first blow that would kill you leaves you standing with half your health.', { kind: 'phoenix', sec: 60 }, '#e8c060', 'dawn', 20],
  ['scrollFrostLance', 'Scroll of Frost Lance', 'common', 'A lance of ice at your target: 50 damage, and it may freeze.', { kind: 'bolt', n: 50, style: 'frost' }, '#2e70c0', 'flake', 2],
  ['scrollIceArmour', 'Scroll of Ice Armour', 'fine', 'For 30 s: take 30% less damage.', { kind: 'buff', sec: 30, style: 'ice' }, '#2e70c0', 'shield', 6],
  ['scrollFreeze', 'Scroll of Freeze', 'rare', 'Everything within 5 m freezes solid (stunned) and takes 40 damage.', { kind: 'freeze', n: 40, r: 5, style: 'frost' }, '#2e70c0', 'flake', 12],
  ['scrollShadowStep', 'Scroll of Shadow Step', 'rare', 'Step behind your target, unseen for 3 s.', { kind: 'shadowStep', sec: 3 }, '#3a2a5a', 'moon', 10],
  ['scrollCurse', 'Scroll of Curse', 'fine', 'Curse your target: it takes 25% more damage from you for 20 s (branded).', { kind: 'curse', sec: 20 }, '#3a2a5a', 'skull', 6],
  ['scrollSoulSiphon', 'Scroll of Soul Siphon', 'rare', 'Draw the life out of your target: 60 damage, and you heal as much.', { kind: 'siphon', n: 60 }, '#3a2a5a', 'heart', 12],
  ['scrollSpectralWolf', 'Scroll of the Spectral Wolf', 'rare', 'A ghostly wolf harries the foes nearest you: six bites of 18 damage over six seconds.', { kind: 'summon', n: 18, sec: 6, style: 'frost' }, '#8a8a90', 'paw', 10],
  ['scrollSummonWatchman', 'Scroll of the Watchman', 'epic', 'The ghost of a Glen watchman stands with you: eight blows of 30 damage on the foes nearest you.', { kind: 'summon', n: 30, sec: 8, style: 'steel' }, '#2a4a8a', 'shield', 18],
  ['scrollSunwheelRecall', 'Scroll of Sunwheel Recall', 'rare', 'Carries you to the last Sunwheel you touched.', { kind: 'recall' }, '#e8c060', 'wheel', 6],
  ['scrollDetectSecrets', 'Scroll of Detect Secrets', 'fine', 'Marks the nearest place you have not found on your map.', { kind: 'detect' }, '#6a4a2a', 'eye', 3],
  ['scrollRevealOre', 'Scroll of Reveal Ore', 'fine', 'Shows the ore veins within 150 m (they flash).', { kind: 'ore', r: 150 }, '#6a4a2a', 'mountain', 3],
  ['scrollCalmBeast', 'Scroll of Calm Beast', 'fine', 'Beasts within 10 m stop (stunned), and for a minute they hurt you 40% less.', { kind: 'calm', r: 10, style: 'beast' }, '#4a6a2a', 'paw', 4],
  ['scrollLightTorch', 'Scroll of Light', 'common', 'Lights the dark around you for 10 minutes.', { kind: 'light', sec: 600 }, '#e8c060', 'sun', 1],
  ['scrollFeatherStep', 'Scroll of Feather Step', 'fine', 'For a minute, dodging costs half as much.', { kind: 'buff', sec: 60, style: 'feather' }, '#5ab4ff', 'feather', 4],
  ['scrollWaterwalk', 'Scroll of Waterbreath', 'fine', 'Breathe underwater for 5 minutes.', { kind: 'breath', sec: 300 }, '#2aa8a0', 'fish', 6],
  ['scrollSilence', 'Scroll of Silence', 'rare', 'A ring of silence around you: foes within 6 m are stunned and lose sight of you for 3 s.', { kind: 'silence', r: 6, sec: 3 }, '#3a2a5a', 'circle', 12],
  ['scrollBanishUndead', 'Scroll of Banish Undead', 'rare', 'Holy light within 8 m: 60 damage, three times that to the dead.', { kind: 'holyArea', n: 60, r: 8 }, '#e8c060', 'cross', 10],
];
for (const [id, name, rarity, desc, use, col, glyph, lvl] of SCROLLS) {
  const t = Math.max(1, Math.min(6, Math.ceil(lvl / 4)));
  one(id, name, rarity, `${desc} One use: anyone can read it.`, {}, [`shop:arcane:${t}`, `chest:${t}`, `drop:caster:${t}`], paper({ kind: 'scroll', color: col, glyph, ...(rarity === 'epic' ? { glow: col } : {}) }), { use, lvl });
  recipe(id, 'runestone', 'runecraft', Math.max(1, lvl), [['linen', 1], ['copperIngot', 1], [lvl >= 10 ? 'essence' + (use.style === 'fire' ? 'Fire' : use.style === 'frost' ? 'Frost' : use.style === 'wind' ? 'Wind' : use.style === 'light' ? 'Light' : 'Shadow') : 'emberroot', 1]], lvl >= 10 ? 'node' : 'basic', { node: 'Scribe' });
}

// ---- wards and runestones (12) ---------------------------------------------------------------
const rune = (s: PartSpec): CatArt => ({ k: 'part', s });
const WARDS: [string, string, Rarity, string, NonNullable<ItemDef['use']> | null, Buff | null, string, number, [string, number][]][] = [
  ['wardStoneFire', 'Fire Ward Stone', 'fine', 'Break it and fire slides off you.', null, b('wardStone', 'Fire Ward', 180, { fireResist: 0.5 }), '#ff6a2a', 4, [['copperIngot', 1], ['emberroot', 1]]],
  ['wardStoneFrost', 'Frost Ward Stone', 'fine', 'Break it and the cold cannot reach you.', null, b('wardStone', 'Frost Ward', 180, { dmgTaken: -0.1 }), '#7fd4ff', 4, [['copperIngot', 1], ['silverthistle', 1]]],
  ['wardStoneVenom', 'Venom Ward Stone', 'fine', 'Break it and venom cannot take hold.', null, b('wardStone', 'Venom Ward', 180, { ward_venom: 0.6 }), '#8ad04a', 4, [['copperIngot', 1], ['venomSac', 1]]],
  ['wardStoneDark', 'Dusk Ward Stone', 'rare', 'Break it and the Dark\'s things find you harder to hurt.', null, b('wardStone', 'Dusk Ward', 180, { ward_gloam: 0.4 }), '#7a3aff', 12, [['silverIngot', 1], ['essenceLight', 1]]],
  ['wardStoneBeast', 'Beast Ward Stone', 'fine', 'Break it and beasts think twice.', null, b('wardStone', 'Beast Ward', 180, { ward_beast: 0.3 }), '#8a6a3a', 4, [['copperIngot', 1], ['wolfFang', 1]]],
  ['waystoneShard', 'Waystone Shard', 'rare', 'A chip of a Sunwheel stone. Break it to be carried to the last wheel you touched.', { kind: 'recall' }, null, '#ffd88a', 8, [['silverIngot', 1], ['starmoss', 1]]],
  ['runeOfMending', 'Rune of Mending', 'fine', 'Break it: half your health comes back.', { kind: 'mend' }, null, '#8ae05a', 6, [['copperIngot', 1], ['lifebloomTonic', 1]]],
  ['tripwireRune', 'Tripwire Rune', 'fine', 'Break it: everything within 4 m trips (stunned) and takes 30 damage.', { kind: 'freeze', n: 30, r: 4, style: 'steel' }, null, '#c8a040', 6, [['copperIngot', 1], ['flax', 1]]],
  ['runeOfLight', 'Rune of Light', 'common', 'Break it: light around you for 15 minutes.', { kind: 'light', sec: 900 }, null, '#fff0a0', 1, [['copperIngot', 1], ['glowmoss', 1]]],
  ['runeOfReturn', 'Rune of Return', 'rare', 'Break it to be carried back to where you last rested.', { kind: 'return' }, null, '#c0c8ff', 10, [['silverIngot', 1], ['moonpetal', 1]]],
  ['runeOfBinding', 'Rune of Binding', 'rare', 'Break it at your target: it is held fast for 5 s, even a great one.', { kind: 'bind', sec: 5 }, null, '#d080ff', 14, [['silverIngot', 1], ['spiderSilk', 1]]],
  ['sunfireRune', 'Sunfire Rune', 'epic', 'Break it: the sun comes down around you, 120 fire damage within 5 m.', { kind: 'nova', n: 120, r: 5, style: 'fire' }, null, '#ffb040', 20, [['goldIngot', 1], ['essenceFire', 1]]],
];
for (const [id, name, rarity, desc, use, buff, col, lvl, inputs] of WARDS) {
  const t = Math.max(1, Math.min(6, Math.ceil(lvl / 4)));
  one(id, name, rarity, desc, {}, [`shop:arcane:${t}`, `chest:${t}`, 'site:stone'], rune({ kind: 'rune', color: '#6a6a72', glow: col }), { ...(use ? { use } : {}), ...(buff ? { buff } : {}), lvl });
  recipe(id, 'runestone', 'runecraft', lvl, inputs, 'basic');
}

// ---- tools and kits (20) -----------------------------------------------------------------------
const trink = (s: TrinketSpec): CatArt => ({ k: 'trinket', s });
const WHET = ['Iron', 'Steel', 'Silversteel', 'Deepsteel', 'Sunbrass', 'Tideglass', 'Starmetal', 'Duskiron'];
const WHET_COL = ['#8a8682', '#d0d4da', '#dfe6f4', '#46526a', '#d8a84a', '#5ac8c0', '#34343f', '#1e1b24'];
WHET.forEach((w, i) => {
  const n = i + 1;
  const id = `whetstone${n}`;
  one(id, `${w} Whetstone`, n >= 7 ? 'epic' : n >= 4 ? 'rare' : n >= 2 ? 'fine' : 'common', `A whetstone for ${w.toLowerCase()} and finer edges: sharpen without a station.`, {}, n <= 6 ? [`shop:smith:${n}`, `shop:trader:${n}`] : [`chest:${n}`], rune({ kind: 'ingot', color: '#7a7a72', accent: WHET_COL[i] }), { buff: b('whetstone', `${w} Edge`, 300, { melee: 0.03 + 0.012 * n }), lvl: n * 5 - 4 });
  recipe(id, 'workbench', 'smithing', [1, 5, 10, 15, 20, 25, 30, 35][i], [[['ironIngot', 'steelIngot', 'silversteelIngot', 'deepsteelIngot', 'sunbrassIngot', 'tideglassIngot', 'starmetalIngot', 'duskironIngot'][i], 1]], i >= 6 ? `book:${i === 6 ? 'bookStarfall' : 'bookIronBelow'}` : 'basic', { quality: false });
});
one('repairKit', 'Repair Kit', 'fine', 'Rivets, thread and patches: mend your armour in the field.', {}, ['shop:smith:1', 'shop:tailor:1', 'shop:trader:2'], rune({ kind: 'satchel', color: '#8a5a32' }), { buff: b('patch', 'Patched Armour', 600, { dmgTaken: -0.06 }) });
recipe('repairKit', 'loom', 'tailoring', 3, [['leather', 1], ['ironIngot', 1]], 'basic');
one('torch', 'Torch', 'common', 'Pitch on a stick: light for 5 minutes.', {}, ['shop:trader:1', 'shop:inn:1'], trink({ kind: 'rod', color: '#ff9a3a' }), { use: { kind: 'light', sec: 300 } });
recipe('torch', 'workbench', undefined, 0, [['planks', 1], ['coal', 1]], 'basic', { quality: false });
one('lanternOil', 'Lantern Oil', 'common', 'A flask of lamp oil: your lantern burns for 20 minutes.', {}, ['shop:trader:1', 'shop:alchemist:1'], potionArt({ vessel: 'oil', liquid: ['#e8c040', '#8a6a1a'], glyph: 'sun' }), { use: { kind: 'light', sec: 1200 } });
one('spyglass', 'Spyglass', 'fine', 'A brass spyglass. Look through it to mark the nearest place you have not found on your map. It is not used up.', {}, ['shop:trader:3', 'fshop:wrecker'], trink({ kind: 'rod', color: '#c8a040' }), { use: { kind: 'detect', n: 0 } });
one('prospectorsLens', 'Prospector\'s Lens', 'fine', 'A lens on a chain. Look through it and the ore veins within 150 m flash. It is not used up.', {}, ['shop:smith:2', 'fshop:dwarven'], trink({ kind: 'orb', color: '#c8e0ff' }), { use: { kind: 'ore', r: 150, n: 0 } });
one('fieldBandage', 'Field Bandage', 'common', 'Linen and salve: restores 60 health over a few seconds, and 30 stamina.', { heal: 60, restoreStamina: 30 }, ['shop:trader:1', 'shop:alchemist:1', 'chest:1'], rune({ kind: 'cloth', color: '#e8e0c8' }));
recipe('fieldBandage', 'loom', undefined, 0, [['linen', 1], ['yarrow', 1]], 'basic', { quality: false });
one('smellingSalts', 'Smelling Salts', 'common', 'A sharp sniff: restores 120 stamina at once.', { restoreStamina: 120 }, ['shop:alchemist:1', 'shop:trader:2'], potionArt({ vessel: 'vial', liquid: ['#f0f0f0', '#a0a0a0'], glyph: 'bolt' }));
recipe('smellingSalts', 'alchemy', 'herbalism', 2, [['pureSalt', 1], ['wildmint', 1]], 'basic', { step: 'stir' });
const LURES: [string, string, number, TrinketSpec][] = [
  ['lureSpinner', 'Spinner Lure', 0.4, { kind: 'charm', metal: 'silver', color: '#c4ccd6', hang: 'disc' }],
  ['lureFeather', 'Feather Lure', 0.6, { kind: 'feather', metal: 'bronze', color: '#c03a2a' }],
  ['lureGlow', 'Glow Lure', 0.9, { kind: 'charm', metal: 'bronze', color: '#8af0c0', hang: 'stone', glow: '#8af0c0' }],
  ['lureDeep', 'Deep Lure', 1.2, { kind: 'charm', metal: 'iron', color: '#2a3a5a', hang: 'fang' }],
  ['lureSea', 'Sea Lure', 1.5, { kind: 'charm', metal: 'gold', color: '#2aa8a0', hang: 'fang' }],
];
for (const [id, name, v, art] of LURES) {
  one(id, name, v >= 1.2 ? 'rare' : 'fine', 'Tie it on before you cast: rare fish bite more often.', {}, [v >= 1.2 ? 'shop:trader:6' : 'shop:trader:2', 'fshop:wrecker'], trink(art), { buff: b('lure', name, 900, { fishLuck: v }) });
}
