import { add } from './kit';

// The festivals' goods (world/festivals.ts): the tokens every festival hands
// out, the keepsakes you trade them for, and the prizes of the contests.

add({
  id: 'festivalToken', name: 'Festival Token', kind: 'material', rarity: 'fine', stack: true, stats: {},
  desc: 'A stamped brass token with a sun on one side and a sheaf on the other. Every festival in Cresha takes them at its stalls.',
}, ['gift:festivals'], { k: 'trinket', s: { kind: 'badge', metal: 'brass', color: '#d8a840', accent: '#7a4a1a' } });

const T = (id: string, name: string, rarity: 'fine' | 'rare' | 'epic', lvl: number, desc: string, stats: Record<string, number>, fx: Record<string, number>, src: string, s: Parameters<typeof add>[2]) =>
  add({ id, name, kind: 'accessory', slot: 'trinket', rarity, lvl, desc, stats, fx }, [src], s);

T('harvestCrown', 'Harvest Crown', 'rare', 5, 'A crown of plaited wheat and red ribbon, the Harvest Fair\'s prize to its champions.', { maxHp: 20 }, { killHeal: 3 }, 'festival:harvestFair', { k: 'trinket', s: { kind: 'crown', metal: 'gold', color: '#e0b850', accent: '#b02a20' } });
T('lanternCharm', 'Lantern-Glass Charm', 'rare', 5, 'A chip of old lantern glass on a cord, warm to the touch. Lost Lanterns chime to whoever carries it from twice as far.', { maxMana: 20 }, { luck: 0.04 }, 'festival:lanterns', { k: 'trinket', s: { kind: 'lantern', metal: 'brass', color: '#ffc060', glow: '#ffb040' } });
T('derbyMedalGold', 'Gold Derby Medal', 'epic', 8, 'First prize in a Harbour Week derby. Old Nell says she has three and wears none of them.', { maxStamina: 20 }, { fishLuck: 0.15 }, 'festival:harbourWeek', { k: 'trinket', s: { kind: 'badge', metal: 'gold', color: '#2a6ab0', accent: '#e8dcc0' } });
T('derbyMedalSilver', 'Silver Derby Medal', 'rare', 6, 'Second prize in a Harbour Week derby.', { maxStamina: 12 }, { fishLuck: 0.08 }, 'festival:harbourWeek', { k: 'trinket', s: { kind: 'badge', metal: 'silver', color: '#2a6ab0', accent: '#e8dcc0' } });
T('derbyMedalBronze', 'Bronze Derby Medal', 'fine', 4, 'Third prize in a Harbour Week derby.', { maxStamina: 8 }, { fishLuck: 0.04 }, 'festival:harbourWeek', { k: 'trinket', s: { kind: 'badge', metal: 'bronze', color: '#2a6ab0', accent: '#e8dcc0' } });
T('tourneyFavour', 'Champion\'s Favour', 'epic', 12, 'A silk favour in the Crown\'s colours, given to the champion of the Crown Tourney.', { maxHp: 30 }, { crit: 0.04, parryStamina: 6 }, 'festival:tourney', { k: 'trinket', s: { kind: 'ribbon', metal: 'gold', color: '#2a3a8a', accent: '#d8b040' } });
T('vigilCandle', 'Vigil Candle', 'rare', 10, 'A stub of the candle that burned all night at the Dawn Vigil. The dead do not like its light.', { maxHp: 15 }, { bane_undead: 0.1, ward_undead: 0.06 }, 'festival:dawnVigil', { k: 'trinket', s: { kind: 'lantern', metal: 'silver', color: '#fff0c0', glow: '#ffe8a0' } });
T('moonMask', 'Moonlight Mask', 'rare', 8, 'A black half-mask with a silver crescent, sold only at the Black Market. Nobody remembers your face.', { maxStamina: 10 }, { hush: 1, luck: 0.03 }, 'festival:blackMarket', { k: 'trinket', s: { kind: 'charm', metal: 'silver', color: '#1a1a24', accent: '#c4ccd6', hang: 'disc' } });
