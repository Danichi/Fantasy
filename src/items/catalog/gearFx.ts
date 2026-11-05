// Gear effects (items/catalog): what a piece does while worn, beyond its
// stats. Each key has its words for the item card; gearRuntime.ts makes each
// one happen. Keys that name a combat modifier (combat/mods.ts) are added to
// it directly; the rest are hooked to the event that drives them.

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

export const FAMILY_NAMES: Record<string, string> = {
  beast: 'beasts', undead: 'the dead', gloam: 'things of the Dark', orc: 'orcs', goblin: 'goblins', slime: 'oozes', bandit: 'bandits and raiders',
  wyrm: 'drakes and wyrms', sea: 'sea creatures', construct: 'golems and living armour', insect: 'spiders, bats and crawlers', wolf: 'wolves', venom: 'venomous things', fire: 'burning things',
};

/** combat modifiers a key adds to (as fractions) */
export const MOD_KEYS: Record<string, string> = {
  melee: 'melee', spell: 'spell', heal: 'heal', dmgTaken: 'dmgTaken', moveSpeed: 'moveSpeed', attackSpeed: 'attackSpeed', castSpeed: 'castSpeed',
  dodgeCost: 'dodgeCost', staminaCost: 'staminaCost', parryWindow: 'parryWindow', blockCost: 'blockCost', crit: 'crit', duration: 'duration', manaCost: 'manaCost', poiseDmg: 'poise',
};

export const FX_TEXT: Record<string, (v: number) => string> = {
  melee: (v) => `+${pct(v)} melee damage.`,
  spell: (v) => `+${pct(v)} spell damage.`,
  heal: (v) => `+${pct(v)} healing received.`,
  dmgTaken: (v) => `Take ${pct(v)} less damage.`,
  moveSpeed: (v) => `+${pct(v)} movement speed.`,
  attackSpeed: (v) => `+${pct(v)} attack speed.`,
  castSpeed: (v) => `+${pct(v)} cast speed.`,
  dodgeCost: (v) => (v > 0 ? `Dodging costs ${pct(v)} more stamina.` : `Dodging costs ${pct(v)} less stamina.`),
  staminaCost: (v) => `Attacks cost ${pct(v)} less stamina.`,
  parryWindow: (v) => `Parry window ${pct(v)} wider.`,
  blockCost: (v) => `Blocking costs ${pct(v)} less stamina.`,
  crit: (v) => `+${pct(v)} critical chance.`,
  duration: (v) => `Your buffs and skills last ${pct(v)} longer.`,
  manaCost: (v) => `Spells cost ${pct(v)} less mana.`,
  poiseDmg: (v) => `Your blows stagger ${pct(v)} harder.`,
  fireDmg: (v) => `+${pct(v)} fire damage.`,
  windDmg: (v) => `+${pct(v)} wind damage.`,
  holyDmg: (v) => `+${pct(v)} holy damage and brand marks.`,
  parryStamina: (v) => `Parries restore ${v} stamina.`,
  critGold: (v) => `Critical hits steal ${v} gold.`,
  killVeil: (v) => `A kill hides you from your foes for ${v} s.`,
  oocRegen: (v) => `Out of combat you heal ${v} health a second.`,
  rage: (v) => `Each blow you take adds 3% damage for 8 s (up to ${pct(v)}).`,
  beastLoot: (v) => `Beasts you skin give ${pct(v)} more hide and meat.`,
  masteryGain: (v) => `+${pct(v)} mastery from everything you do.`,
  fireResist: (v) => `Fire and burning harm you ${pct(v)} less.`,
  goldFind: (v) => `Foes you kill drop ${pct(v)} more gold.`,
  scrapFind: (v) => `Kills turn up scrap metal (${pct(v)} chance).`,
  oreYield: (v) => `+${pct(v)} ore, timber and herbs from gathering.`,
  rainDmg: (v) => `+${pct(v)} damage in rain and storm.`,
  backstab: (v) => `+${pct(v)} damage from behind.`,
  sprintHit: (v) => `Sprinting attacks deal +${pct(v)} damage.`,
  wheelHeal: () => `Travelling by Sunwheel heals you fully.`,
  styleSurge: () => `Perfect parries and dodges feed your style: +1 Flow, +10 Focus.`,
  seaDmg: (v) => `In the isles and at sea: +${pct(v)} damage and ${pct(v / 2)} less damage taken.`,
  crowdDmg: (v) => `+${pct(v)} damage while two or more foes are close.`,
  sandSpeed: (v) => `+${pct(v)} speed in the Golden Expanse.`,
  desertWard: (v) => `Take ${pct(v)} less damage in the Golden Expanse.`,
  lowHp: (v) => `+${pct(v)} damage below a third of your health.`,
  killHeal: (v) => `Kills heal you ${v} health.`,
  hitMana: (v) => `Melee hits restore ${v} mana.`,
  blockHeal: (v) => `Blocking a blow heals you ${v} health.`,
  thorns: (v) => `Foes that strike you take ${v} damage.`,
  nightDmg: (v) => `+${pct(v)} damage at night.`,
  darkDmg: (v) => `+${pct(v)} damage in the Dark's scars and the Gravewood.`,
  luck: (v) => `+${pct(v)} chance of finding gear on foes.`,
  shopDiscount: (v) => `Shops charge you ${pct(v)} less.`,
  potionPower: (v) => `Draughts and tonics heal ${pct(v)} more.`,
  wildsSpell: (v) => `Spells cost ${pct(v)} less mana outside towns and roads.`,
  lightRoom: () => `Lights the dark around you.`,
  allyCall: () => `Once a day, when you fall below a third of your health, the bell rings: +15% damage and 10% less damage taken for a minute.`,
  wheelSurge: (v) => `You arrive from Sunwheel travel hitting hard: +${pct(v)} damage for a minute.`,
  fishLuck: (v) => `Rare fish bite ${pct(v)} more often.`,
  xpGain: (v) => `+${pct(v)} experience from foes.`,
  // plain combat numbers (meals and drinks use them)
  hp: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} max health.`,
  stamina: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} max stamina.`,
  mana: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} max mana.`,
  staminaRegen: (v) => `${v > 0 ? '+' : '-'}${pct(v)} stamina regeneration.`,
  manaRegen: (v) => `${v > 0 ? '+' : '-'}${pct(v)} mana regeneration.`,
  poise: (v) => `Your blows stagger ${pct(v)} harder.`,
  // the catalog's own mechanics
  allyDmg: (v) => `+${pct(v)} damage with an ally beside you (a guard, the Watch, your crew, a summoned spirit).`,
  cannonReload: (v) => `Your ship's guns reload ${pct(v)} faster.`,
  heatImmune: () => `The desert sun can't touch you: no heat.`,
  sandImmune: () => `Sandstorms don't slow you.`,
  thirstImmune: () => `You never go thirsty in the Expanse.`,
  sprintKnock: () => `A sprinting blow knocks a foe off its feet.`,
  brandDmg: (v) => `+${pct(v)} damage to branded foes.`,
  deepYield: () => `Ore veins in the mountains yield double.`,
  salvage: (v) => `Salvage gives back ${pct(v)} more.`,
  wheelRedirect: () => `The Sunwheel takes you where it likes.`,
  secretSense: () => `Dungeon secrets shimmer within ten paces.`,
  arrowWall: () => `Blocking stops arrows and bolts completely.`,
  bashBleed: (v) => `Shield bashes open a wound (${v} damage a second).`,
  plant: () => `Hold the shield up and still for a moment to plant it: blocking costs half the stamina.`,
  blindOnHit: (v) => `Hits blind a foe for ${v} s: half its blows miss.`,
  critFlurry: (v) => `Critical hits throw off a flurry of three ${v}-damage cuts.`,
  charmOnHit: (v) => `${pct(v)} chance a foe that strikes you is charmed and stands still.`,
  blockShock: (v) => `Blocked blows send ${v} lightning damage back up the attacker's arm.`,
  hush: () => `Foes more than six paces off don't notice you.`,
  ammoSave: (v) => `${pct(v)} chance a shot doesn't use up its arrow or bolt.`,
};
for (const f of Object.keys(FAMILY_NAMES)) {
  FX_TEXT['bane_' + f] = (v) => `+${pct(v)} damage to ${FAMILY_NAMES[f]}.`;
  FX_TEXT['ward_' + f] = (v) => `Take ${pct(v)} less damage from ${FAMILY_NAMES[f]}.`;
}

/** An item's (or a set bonus's) effects in words. */
export function fxText(fx: Record<string, number>) {
  return Object.entries(fx).map(([k, v]) => FX_TEXT[k]?.(v) ?? '').filter(Boolean).join(' ');
}

/**
 * Which family of foe an enemy kind is (banes, wards, trophies and drops).
 * Kinds come from the enemies, creatures and bosses (progression.ts names them).
 */
export function familyOf(kind: string): string {
  const k = kind.toLowerCase();
  if (/goblin/.test(k)) return 'goblin';
  if (/orc|ulgra|grukk/.test(k)) return 'orc';
  if (/^(green|blue|magma|cave)$|ooze|jelly|slime/.test(k)) return 'slime';
  if (/zombie|skeleton|hollow|wraith|hanged|drowned|thane|abomination|wight|edrichollowed|captainvess/.test(k)) return 'undead';
  if (/gloam|wisp|shade|rift|circle/.test(k)) return 'gloam';
  if (/golem|armour|rustknight|scrapshell|construct/.test(k)) return 'construct';
  if (/spider|bat|scarab|urchin|rat/.test(k)) return 'insect';
  if (/eel|crab|ray|shark|sawtooth|angler|brine|tidewarden|kraken|serpent/.test(k)) return 'sea';
  if (/drake|wyrm|delver/.test(k)) return 'wyrm';
  if (/bandit|scavenger|sunguard|suncaptain|ishara|raider|smuggler|watch/.test(k)) return 'bandit';
  if (/wolf|fox|boar|aurochs|stag|bear|dire|greyjaw|varga|greymane|thornhorn|bristleback|snaggletooth|briar|gnarlbark/.test(k)) return 'beast';
  return 'beast';
}
