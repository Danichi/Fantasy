import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { sOnRoad } from './paths';
import { CHAINS, chainAt, chainProject, stopDef, crownChainS, type ChainId, type ChainPoint } from './paths';
import { Figure, Animal, Cart, Carriage, BarkLayer, type Prop, type AnimalKind, type Cargo } from './actors';
import type { WorldMats } from '../buildings';
import type { Look } from '../../npc/charBuilder';
import type { Interactable } from '../../dungeon/instance';
import type { DialogueOption } from '../../ui/dialogue';
import type { RoadLifeHooks, Renown } from './types';
import type { Wayside } from './wayside';

// Travellers on the roads into the capital. Each party keeps a timetable
// that loops every few days: when it sets out, the road it takes, the inn or
// camp it sleeps at. Where everyone is follows from the world clock alone
// (so sleeping or fast travel moves the world on correctly), and only the
// parties near the player are built and animated: couriers galloping with
// dispatches, Crown riders and Silver Lance knights on patrol, merchants with
// pack donkeys, farmers taking carts to market, pilgrims, a minstrel,
// refugees from the orc marches, a drover and his flock, a noble's carriage
// and its escort. They greet you as they pass, stop to talk, trade, and some
// have work for you.

type Mount = 'horse' | 'donkey';
interface MemberDef {
  name?: string;
  look: Look;
  mount?: Mount;
  coat?: string;
  saddle?: number;
  prop?: Prop;
  propColor?: number;
  /** a carriage's coachman (on the box) or its passenger (inside, unseen while it rolls) */
  seat?: 'box' | 'inside';
}
interface PlanStep {
  at: string;
  /** hour of departure */
  dep: number;
  /** extra whole days spent here */
  wait?: number;
  /** the leg from here is travelled out of sight (refugees "going back" for the next family) */
  hidden?: boolean;
}
export interface TravellerDef {
  id: string;
  name: string;
  title: string;
  chain: ChainId;
  /** m/s on the road */
  speed: number;
  members: MemberDef[];
  vehicle?: { type: 'cart' | 'handcart' | 'carriage'; animal?: AnimalKind; coat?: string; cargo?: Cargo; hood?: number; paint?: number; four?: boolean };
  /** pack donkeys led behind */
  packs?: number;
  /** a flock driven ahead */
  flock?: number;
  plan: PlanStep[];
  /** days added to the clock (so parties on one timetable don't travel together) */
  phase: number;
  lines: string[];
  greet: string[];
  trade?: { intro: string; stock: [string, number][] };
  /** rides hard: doesn't stop to chat in the saddle, shouts people out of the way */
  courier?: boolean;
}

// ---- looks ---------------------------------------------------------------------------------------
const P = (female: boolean, hair: number, skin: number, linen: number, cloth?: number, extra: Partial<Look> = {}): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'buns' : 'simpleparted', hairColor: hair, skin, linen, cloth, height: female ? 1.64 : 1.76, ...extra });
const R = (female: boolean, hair: number, skin: number, cloth: number, extra: Partial<Look> = {}): Look => ({ body: female ? 'female' : 'male', outfit: 'ranger', hair: female ? 'buns' : 'buzzed', hairColor: hair, skin, cloth, height: female ? 1.72 : 1.84, ...extra });
const crown = (female: boolean, hair: number, skin: number) => R(female, hair, skin, 0x24467e, { pauldron: true });
const lance = (female: boolean, hair: number, skin: number) => R(female, hair, skin, 0xc9d6e6, { pauldron: true, bracers: true });
const kid = (female: boolean, hair: number, skin: number, linen: number): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'long' : 'buzzed', hairColor: hair, skin, linen, height: 1.16 });

export const TRAVELLERS: TravellerDef[] = [
  {
    id: 'pell', name: 'Pell Swiftwater', title: 'Crown Courier', chain: 'crown', speed: 8, courier: true, phase: 0,
    members: [{ look: R(false, 0xd2b26a, 0xfff0e6, 0x24467e, { hood: true }), mount: 'horse', coat: 'chestnut', saddle: 0x24467e }],
    plan: [{ at: 'capital', dep: 7 }, { at: 'wayfork', dep: 12 }],
    lines: ['Dispatches for the Glen, the Wayfork and the checkpoint. I hand them to the Wayfork post and ride back before supper.', 'Fastest horse on the Crown Road, Bramble. Faster than the orcs, which is the point.', 'If you hear hooves behind you on this road, step aside. It’s probably me.'],
    greet: ['Make way! Crown dispatch!', 'Mind the hooves!', 'Morning! Can’t stop!'],
  },
  {
    id: 'rl-crownriders', name: 'Sergeant Wymer', title: 'Crown Rider', chain: 'crown', speed: 3.4, phase: 0,
    members: [
      { look: crown(false, 0x3a2618, 0xe0b894), mount: 'horse', coat: 'bay', saddle: 0x24467e, prop: 'lance', propColor: 0x24467e },
      { name: 'Crown Rider', look: crown(true, 0x1f1a17, 0xa8744e), mount: 'horse', coat: 'black', saddle: 0x24467e },
      { name: 'Crown Rider', look: crown(false, 0xd2b26a, 0xfff0e6), mount: 'horse', coat: 'grey', saddle: 0x24467e },
    ],
    plan: [{ at: 'outpost', dep: 8 }, { at: 'gateMarket', dep: 15 }],
    lines: ['Checkpoint to the capital and back, twice a day when we’re not short-handed. We’re always short-handed.', 'See anything odd on the road, tell Sergeant Brask at the checkpoint. Odd meaning orcs.', 'The Red Hand doesn’t touch a wagon while we’re in sight. Problem is, we’re in sight of about one mile at a time.'],
    greet: ['Crown riders! Keep to the side.', 'Safe road, traveller.', 'All quiet? Good.'],
  },
  {
    id: 'rl-lance', name: 'Ser Oriel Vance', title: 'Knight of the Silver Lance', chain: 'crown', speed: 3.6, phase: 1,
    members: [
      { look: lance(false, 0xd2b26a, 0xfff0e6, ), mount: 'horse', coat: 'white', saddle: 0xc9d6e6, prop: 'banner', propColor: 0xc9d6e6 },
      { name: 'Knight of the Silver Lance', look: lance(true, 0x3a2618, 0xa8744e), mount: 'horse', coat: 'grey', saddle: 0xc9d6e6, prop: 'lance', propColor: 0xc9d6e6 },
      { name: 'Knight of the Silver Lance', look: lance(false, 0x6a6a6a, 0xe0b894, ), mount: 'horse', coat: 'black', saddle: 0xc9d6e6 },
    ],
    plan: [{ at: 'capital', dep: 9 }, { at: 'kingsmile', dep: 13 }],
    lines: ['We ride the marches as far as the Kingsmile. The Marshal won’t spare us further, not with Gorrak’s camp still standing.', 'The barrow mounds wake after dark. We ride past them at a gallop, and we are not ashamed of it.', 'For Crown and Lance.'],
    greet: ['For Crown and Lance!', 'Good day to you.', 'The road east is no place to dawdle.'],
  },
  {
    id: 'odo', name: 'Odo Brannick', title: 'Wool Merchant', chain: 'crown', speed: 1.1, packs: 2, phase: 0,
    members: [{ look: P(false, 0x6a4428, 0xe0b894, 0xd8c29a, 0x8a6a3a, { beard: true }), prop: 'staff' }],
    plan: [{ at: 'thornfield', dep: 7 }, { at: 'kingsmile', dep: 7 }, { at: 'capital', dep: 8, wait: 1 }, { at: 'kingsmile', dep: 7 }],
    lines: ['Thornfield wool to the capital looms. Two donkeys, Pudding and Mustard. Don’t ask which is which; they don’t know either.', 'Wool’s up a penny since the orcs burnt the Ashby folds. Ill wind, as they say.', 'I stop at the Kingsmile both ways. Oswin waters the ale but not the beds.'],
    greet: ['Afternoon!', 'Mind the donkeys, they bite.', 'Good wool weather, this.'],
    trade: { intro: 'Wool, mostly. And a cloak or two for the cold road.', stock: [['wool', 7], ['wayfarerCloak', 104], ['travellersBread', 7]] },
  },
  {
    id: 'hob', name: 'Hob Furrow', title: 'Farmer of Thornfield', chain: 'crown', speed: 1.3, phase: 0,
    members: [{ look: P(false, 0x8a3f22, 0xe0b894, 0xd8c29a, 0x6a7f3a, { beard: true }) }],
    vehicle: { type: 'cart', animal: 'bull', cargo: 'cabbages' },
    plan: [{ at: 'thornfield', dep: 5 }, { at: 'wayfork', dep: 16 }],
    lines: ['Cabbages to the Wayfork, every day the Dawn sends. Old Bracken here pulls; I steer, mostly.', 'Mud on this road’s like glue after rain. I’ve lost a cart wheel to it twice.', 'Market day’s every third day. Better prices. Same cabbages.'],
    greet: ['Morning!', 'Whoa, Bracken. Whoa.', 'Fine cabbages today!'],
    trade: { intro: 'Straight off the cart. Cabbages, carrots, apples.', stock: [['cabbage', 6], ['carrot', 4], ['apple', 5]] },
  },
  {
    id: 'marta', name: 'Marta Greenhill', title: 'Egg-Wife of Elder Glen', chain: 'crown', speed: 1.2, phase: 0,
    members: [{ look: P(true, 0xb8b4ae, 0xfff0e6, 0xe8d8b8, 0xc9922a), prop: 'basket' }],
    vehicle: { type: 'handcart', cargo: 'eggs' },
    plan: [{ at: 'glen', dep: 5 }, { at: 'wayfork', dep: 15 }],
    lines: ['Eggs to the Wayfork. Four dozen, and every one of them still whole, thank you.', 'I’ve pushed this cart up the Logging Road for twenty years. My arms are made of rope.', 'If you see a fox near the Glen’s hen-houses, give it a kick from me.'],
    greet: ['Mind the eggs, love!', 'Good morning!', 'Careful, careful…'],
    trade: { intro: 'Eggs and milk, fresh as you’ll find.', stock: [['egg', 3], ['milk', 7], ['travellersBread', 6]] },
  },
  {
    id: 'rl-pilgrims-a', name: 'Brother Cuthbert', title: 'Pilgrim of the Dawn', chain: 'crown', speed: 1.0, phase: 0,
    members: [
      { look: P(false, 0xe6e2da, 0xe0b894, 0xfff4dc, 0xe0c060, { hair: 'buzzed' }), prop: 'staff' },
      { name: 'Pilgrim', look: P(true, 0x6a4428, 0xfff0e6, 0xfff4dc, 0xe0c060), prop: 'staff' },
      { name: 'Pilgrim', look: P(false, 0x3a2618, 0xa8744e, 0xfff4dc, 0xe0c060) },
    ],
    plan: [{ at: 'glen', dep: 7 }, { at: 'pilgrims', dep: 7 }, { at: 'kingsmile', dep: 7 }, { at: 'capital', dep: 8, wait: 1 }, { at: 'kingsmile', dep: 7 }, { at: 'pilgrims', dep: 7 }],
    lines: ['We walk to the Temple of the Dawn in the capital, as our grandparents did. Three days, if the knees allow.', 'Mother Agnes keeps a fire for pilgrims at the Rest. We’ll sleep there tonight, the Dawn willing.', 'The Dawn keeps the road. The Crown keeps it too, when it remembers.'],
    greet: ['Dawn’s blessing on you.', 'Peace on your road.', 'Go with the Dawn, friend.'],
  },
  {
    id: 'rl-pilgrims-b', name: 'Sister Hollis', title: 'Pilgrim of the Dawn', chain: 'crown', speed: 1.0, phase: 4,
    members: [
      { look: P(true, 0xe6e2da, 0xe0b894, 0xfff4dc, 0xe0c060), prop: 'staff' },
      { name: 'Pilgrim', look: P(false, 0xd2b26a, 0xfff0e6, 0xfff4dc, 0xe0c060) },
    ],
    plan: [{ at: 'glen', dep: 7 }, { at: 'pilgrims', dep: 7 }, { at: 'kingsmile', dep: 7 }, { at: 'capital', dep: 8, wait: 1 }, { at: 'kingsmile', dep: 7 }, { at: 'pilgrims', dep: 7 }],
    lines: ['My mother walked this road. I walk it for her, now her legs won’t.', 'At the Barrow we pray, and walk quickly.', 'There’s a hermit in the south wood who knows the old prayers. Older than the Temple’s.'],
    greet: ['Dawn keep you.', 'Bless you, traveller.'],
  },
  {
    id: 'wren', name: 'Wren Fiddlewick', title: 'Wandering Minstrel', chain: 'crown', speed: 1.2, phase: 1,
    members: [{ look: P(true, 0xb0562a, 0xfff0e6, 0xe8c8c0, 0x2f7f86, { hair: 'long' }), prop: 'lute' }],
    plan: [{ at: 'thornfield', dep: 9 }, { at: 'kingsmile', dep: 10 }, { at: 'capital', dep: 9 }, { at: 'kingsmile', dep: 10 }],
    lines: ['I play the Thornfield Arms, the Kingsmile and the Gilded Stag. In that order, for that money.', 'Lio at the Wayfork stole my best chorus. I stole it from him first, mind.', '♪ The barrow kings are sleeping, so tread softly, tread light… ♪'],
    greet: ['♪ Tra-la! ♪', 'A song for a penny?', 'Lovely day for a ballad!'],
  },
  {
    id: 'rl-hollins', name: 'Sela Hollin', title: 'Refugee from the Orc Marches', chain: 'crown', speed: 0.9, packs: 1, phase: 2,
    members: [
      { look: P(true, 0x3a2618, 0xe0b894, 0xb8a888, 0x6a5a4a) },
      { name: 'Old Fenn Hollin', look: P(false, 0xe6e2da, 0xfff0e6, 0xb8a888, undefined, { hair: 'buzzed', beard: true }), prop: 'staff' },
      { name: 'Hollin child', look: kid(true, 0x3a2618, 0xe0b894, 0xc9dbe8) },
      { name: 'Hollin child', look: kid(false, 0x3a2618, 0xe0b894, 0xd8c29a) },
    ],
    plan: [{ at: 'refugee', dep: 7 }, { at: 'thornfield', dep: 7 }, { at: 'wayfork', dep: 8 }, { at: 'glen', dep: 7, hidden: true }],
    lines: ['We’re from Ditchley, past the barrow. The orcs came at harvest. We’re going to the Glen; they say there’s work, and walls.', 'Edda Ashby fed us at her camp. Burnt out herself, and still she fed us.', 'If you’ve a coin for the children, the Dawn will remember it. If not, a kind word does.'],
    greet: ['Please, is it far to Elder Glen?', 'Good day…', 'Keep together, children.'],
  },
  {
    id: 'ysmay', name: 'Lady Ysmay Harrowgate', title: 'Of Harrowgate Hall', chain: 'crown', speed: 2.6, phase: 0,
    members: [
      { look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x1f1a17, skin: 0xfff0e6, linen: 0xd9cfe8, cloth: 0x7a3f8a, height: 1.7 }, seat: 'inside' },
      { name: 'Coachman Burle', look: P(false, 0x6a6a6a, 0xe0b894, 0xd8c29a, 0x24467e, { beard: true }), seat: 'box' },
      { name: 'Harrowgate Man-at-Arms', look: R(false, 0x3a2618, 0xe0b894, 0x7a3f8a, { pauldron: true }), mount: 'horse', coat: 'bay', saddle: 0x7a3f8a, prop: 'lance', propColor: 0x7a3f8a },
      { name: 'Harrowgate Man-at-Arms', look: R(true, 0x6a4428, 0xa8744e, 0x7a3f8a, { pauldron: true }), mount: 'horse', coat: 'chestnut', saddle: 0x7a3f8a },
    ],
    vehicle: { type: 'carriage', paint: 0x5a2a5a },
    plan: [{ at: 'capital', dep: 9 }, { at: 'thornfield', dep: 10, wait: 1 }],
    lines: ['Harrowgate Hall is past Thornfield, up the valley. I go to court twice a week; the Queen likes cards and nobody else will lose to her.', 'The road is so very dusty. And the orcs, of course. One mustn’t forget the orcs.', 'My escort is the finest money can buy. I pay them enough that they’re brave.'],
    greet: ['Good day to you.', 'Drive on, Burle.', 'Make room for the carriage, please.'],
  },
  {
    id: 'nim', name: 'Nim Tallow', title: 'Travelling Tinker', chain: 'crown', speed: 1.1, packs: 1, phase: 3,
    members: [{ look: { body: 'male', outfit: 'peasant', hood: true, hair: 'buzzed', beard: true, hairColor: 0x8a5a2a, skin: 0xa8744e, linen: 0xc8b896, cloth: 0x8a3a2a, height: 1.62 }, prop: 'lantern' }],
    plan: [{ at: 'glen', dep: 8 }, { at: 'pilgrims', dep: 8 }, { at: 'kingsmile', dep: 8 }, { at: 'gateMarket', dep: 8 }, { at: 'kingsmile', dep: 8 }, { at: 'drovers', dep: 8 }, { at: 'wayfork', dep: 8 }],
    lines: ['Pots, pans, potions, pins! Nim Tallow, at your service, all the way from wherever I was last.', 'I sleep by the fires: the Rest, the Drover’s, the Wayfork. Inns are for people with money.', 'The Red Hand never rob me. I’m too poor and I talk too much.'],
    greet: ['Pots! Pans! Potions!', 'Ho there, customer!', 'Need anything mended?'],
    trade: { intro: 'Everything a road needs, at a road’s price.', stock: [['healthPotion', 22], ['manaPotion', 27], ['minersLantern', 38], ['planks', 9], ['travellersBread', 6], ['spicedCider', 9]] },
  },
  {
    id: 'rl-drove', name: 'Ewan Shearling', title: 'Drover', chain: 'crown', speed: 1.1, flock: 7, phase: 0,
    members: [{ look: P(false, 0xd2b26a, 0xfff0e6, 0xd8c29a, 0x6a7f3a), prop: 'staff' }],
    plan: [{ at: 'thornfield', dep: 6 }, { at: 'wayfork', dep: 15 }],
    lines: ['Seven ewes to the Wayfork. If the price is wrong, seven ewes back to Thornfield. They don’t mind; it’s a walk.', 'My uncle Cobb keeps the Drover’s Well. Tell him Ewan says his cheese is too salty.', 'Don’t run at them. They scatter, and then I’m an hour gathering.'],
    greet: ['Mind the flock!', 'Hup! Hup!', 'Morning!'],
  },
  {
    id: 'rl-scholar', name: 'Magister Idris Vane', title: 'Scholar of the Arcane Collegium', chain: 'crown', speed: 1.3, phase: 0,
    members: [{ look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x3a3a3a, skin: 0xa8744e, linen: 0xd9cfe8, cloth: 0x3a2a7a, height: 1.78 }, mount: 'donkey' }],
    plan: [{ at: 'capital', dep: 8 }, { at: 'barrow', dep: 15 }],
    lines: ['I measure the barrow stones. Every day. They are not always the same distance apart, which the Collegium finds fascinating and I find alarming.', 'The Sunwheel on the old stone is older than Cresha. Older than the Old Kings, possibly. Don’t tell the Temple.', 'I leave before dusk. I am curious, not stupid.'],
    greet: ['Hm? Oh. Good day.', 'Fascinating. Sorry, not you.', 'Mind the donkey; she has opinions.'],
  },
  {
    id: 'amira', name: 'Amira al-Sahir', title: 'Spice Trader of the Expanse', chain: 'south', speed: 1.3, packs: 2, phase: 0,
    members: [
      { look: { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x1f1a17, skin: 0x7a4e32, cloth: 0xc9922a, height: 1.72 } },
      { name: 'Caravan Guard', look: R(false, 0x1f1a17, 0x7a4e32, 0xb8602a, { pauldron: true }), prop: 'staff' },
    ],
    plan: [{ at: 'southGate', dep: 7 }, { at: 'queensCamp', dep: 6 }, { at: 'kettle', dep: 6 }, { at: 'wayfork', dep: 9 }, { at: 'kettle', dep: 6 }, { at: 'queensCamp', dep: 7 }],
    lines: ['Pepper, saffron, sun-salt and a little of the red you put in stew when you hate your guests. From Sunspire, by way of the Copper Kettle.', 'Your Queen’s Road has a toll bridge. In the Expanse we would call that robbery, but a polite one.', 'The sand is moving east, the old caravaneers say. One day the Expanse will knock on your capital’s gate.'],
    greet: ['Peace and shade upon you.', 'Spices! The finest spices!', 'Good road to you.'],
    trade: { intro: 'From the Golden Expanse, for those with taste and coin.', stock: [['emberroot', 21], ['honeycomb', 13], ['sunSilk', 128], ['spicedCider', 8], ['duneGlass', 70]] },
  },
  {
    id: 'rl-queensriders', name: 'Corporal Aldis', title: 'Crown Rider of the Queen’s Road', chain: 'south', speed: 4.5, phase: 0,
    members: [
      { look: crown(true, 0x6a4428, 0xfff0e6), mount: 'horse', coat: 'grey', saddle: 0x24467e, prop: 'lance', propColor: 0x24467e },
      { name: 'Crown Rider', look: crown(false, 0x1f1a17, 0x7a4e32), mount: 'horse', coat: 'bay', saddle: 0x24467e },
    ],
    plan: [{ at: 'southGate', dep: 8 }, { at: 'aveline', dep: 11 }, { at: 'southGate', dep: 14 }, { at: 'aveline', dep: 17 }],
    lines: ['Queen’s Gate to Saint Aveline’s and back. The Red Hand have moved into old Fort Rennick, and we’re two riders. You do the sums.', 'Mags Turnpenny at the bridge sees everything that passes. Ask her.'],
    greet: ['Keep to the road!', 'Crown riders!', 'Good day.'],
  },
  {
    id: 'gil', name: 'Gil Stook', title: 'Hay Farmer', chain: 'south', speed: 1.3, phase: 0,
    members: [{ look: P(false, 0x6a4428, 0xa8744e, 0xd8c29a, 0x8a6a3a, { beard: true }) }],
    vehicle: { type: 'cart', animal: 'horse', coat: 'dun', cargo: 'hay' },
    plan: [{ at: 'toll', dep: 6 }, { at: 'southGate', dep: 14 }],
    lines: ['Hay for the Crown Stables. Them knights’ horses eat better than I do.', 'Mags lets me over the bridge for a penny. Old times’ sake. Don’t tell her I told you.'],
    greet: ['Morning!', 'Gee up, Clover.', 'Lovely day for hay.'],
  },
  {
    id: 'rl-avepilgrims', name: 'Goodwife Tansy', title: 'Pilgrim to Saint Aveline', chain: 'south', speed: 1.0, phase: 1,
    members: [
      { look: P(true, 0xd2b26a, 0xe0b894, 0xfff4dc, 0x5a7aa8), prop: 'staff' },
      { name: 'Pilgrim', look: P(false, 0x3a2618, 0xfff0e6, 0xfff4dc, 0x5a7aa8) },
    ],
    plan: [{ at: 'southGate', dep: 6 }, { at: 'queensCamp', dep: 7 }, { at: 'aveline', dep: 14 }, { at: 'queensCamp', dep: 7 }],
    lines: ['Saint Aveline keeps travellers. Five coins in her bowl and she keeps you a little better, they say.', 'Aveline was a queen once, before she was a saint. She built the fort on the hill, the one the robbers have now.'],
    greet: ['Aveline keep you!', 'Blessings on your road.'],
  },
  {
    id: 'rl-hunters', name: 'Rafe Ashwood', title: 'Hunter', chain: 'kingsbridge', speed: 1.3, phase: 0,
    members: [
      { look: R(false, 0x3a2618, 0xe0b894, 0x3d5a2a, { hood: true }), prop: 'staff' },
      { name: 'Lisbet Ashwood', look: R(true, 0xb0562a, 0xfff0e6, 0x3d5a2a, { hood: true }) },
    ],
    plan: [{ at: 'westGate', dep: 5 }, { at: 'wilds', dep: 18 }],
    lines: ['Over the Kingsbridge, into the Wildlands, back before the dark comes down. That’s the only rule.', 'Things out past the bridge don’t read the Crown’s notices.'],
    greet: ['Morning.', 'Good hunting to you.'],
  },
  {
    id: 'rl-charcoal', name: 'Old Dunstan', title: 'Charcoal-Burner', chain: 'kingsbridge', speed: 1.2, phase: 0,
    members: [{ look: P(false, 0x9a9a98, 0xa8744e, 0x6a6a6a, 0x3a3a3a, { beard: true, hair: 'buzzed' }) }],
    vehicle: { type: 'cart', animal: 'donkey', cargo: 'charcoal' },
    plan: [{ at: 'wilds', dep: 9 }, { at: 'westGate', dep: 15 }],
    lines: ['Charcoal for the city smiths. Burnt in the woods past the bridge, sold in the city for three times what it’s worth.', 'Black to the elbows, forty years. My wife says she married a chimney.'],
    greet: ['Mornin’.', 'Charcoal! Good charcoal!'],
  },
];

// ---- timetables -----------------------------------------------------------------------------------

/** One game hour in real seconds at the default 48-minute day. */
const SEC_PER_HOUR = 120;

interface Seg { t0: number; t1: number; move: boolean; s0: number; s1: number; stop: string; hidden: boolean }
interface Timetable { segs: Seg[]; start: number; len: number }

const stopS = new Map<string, number>();
const sAt = (chain: ChainId, stop: string) => {
  const key = chain + ':' + stop;
  let s = stopS.get(key);
  if (s === undefined) {
    s = chainProject(CHAINS[chain], stopDef(stop).at[0], stopDef(stop).at[1]).s;
    stopS.set(key, s);
  }
  return s;
};

function timetable(d: TravellerDef): Timetable {
  const S = d.plan.map((p) => sAt(d.chain, p.at));
  const mph = d.speed * SEC_PER_HOUR;
  const next = (t: number, h: number) => {
    let x = Math.floor(t / 24) * 24 + h;
    if (x < t - 1e-6) x += 24;
    return x;
  };
  const start = d.plan[0].dep;
  const segs: Seg[] = [];
  let T = start;
  for (let i = 0; i < d.plan.length; i++) {
    const p = d.plan[i];
    const dep = (i === 0 ? start : next(T, p.dep)) + (p.wait ?? 0) * 24;
    if (dep > T) segs.push({ t0: T, t1: dep, move: false, s0: S[i], s1: S[i], stop: p.at, hidden: false });
    const j = (i + 1) % d.plan.length;
    const dur = Math.abs(S[j] - S[i]) / mph;
    segs.push({ t0: dep, t1: dep + dur, move: true, s0: S[i], s1: S[j], stop: d.plan[j].at, hidden: !!p.hidden });
    T = dep + dur;
  }
  const end = next(T, d.plan[0].dep);
  if (end > T) segs.push({ t0: T, t1: end, move: false, s0: S[0], s1: S[0], stop: d.plan[0].at, hidden: false });
  return { segs, start, len: end - start };
}

export interface TravellerState {
  s: number;
  dir: 1 | -1;
  moving: boolean;
  stop: string;
  /** out of sight: indoors, in town, or on a hidden leg */
  hidden: boolean;
  /** sitting by a fire (night at a camp) */
  sitting: boolean;
  /** the next stop's name (where they're headed) */
  bound: string;
}

// ---- built parties ----------------------------------------------------------------------------------

interface Built {
  def: TravellerDef;
  figures: (Figure | null)[];
  mounts: (Animal | null)[];
  packs: Animal[];
  flock: Animal[];
  cart: Cart | null;
  carriage: Carriage | null;
  /** where each member is heading this frame */
  hiddenT: number;
  barkT: number;
}

export interface Travellers {
  interactable: Interactable & { update(p: THREE.Vector3): void };
  /** where a traveller (by id) is now (quest markers), or null */
  npcPos(id: string): THREE.Vector3 | null;
  /** head position for quest indicators (only while they're built and visible) */
  npcHead(id: string): THREE.Vector3 | null;
  ids: string[];
  state(id: string): TravellerState | null;
  /** the visible built parties' positions (road events keep clear of them) */
  near(x: number, z: number, r: number): boolean;
  update(dt: number, player: THREE.Vector3, playerMounted: boolean): void;
  setVisible(v: boolean): void;
  clear(): void;
  barks: BarkLayer;
}

const BUILD_R = 175, DROP_R = 230, MAX_BUILT = 6;
const GATE_S = crownChainS(sOnRoad('capital', -960, -10));

export function buildTravellers(scene: THREE.Scene, m: WorldMats, hooks: RoadLifeHooks, renown: Renown, wayside: Wayside): Travellers {
  const tables = new Map(TRAVELLERS.map((d) => [d.id, timetable(d)]));
  const built = new Map<string, Built>();
  const barks = new BarkLayer(() => hooks.camera());
  let engaged: Built | null = null;
  let visible = true;
  const cp: ChainPoint = { x: 0, z: 0, dx: 1, dz: 0 };
  const tmp = new THREE.Vector3();

  const clock = () => hooks.day() * 24 + hooks.hour();

  function stateOf(d: TravellerDef): TravellerState {
    const tt = tables.get(d.id)!;
    const A = clock() + d.phase * 24;
    const local = tt.start + ((((A - tt.start) % tt.len) + tt.len) % tt.len);
    const seg = tt.segs.find((s) => local >= s.t0 && local < s.t1) ?? tt.segs[tt.segs.length - 1];
    const k = seg.t1 > seg.t0 ? (local - seg.t0) / (seg.t1 - seg.t0) : 0;
    const s = seg.s0 + (seg.s1 - seg.s0) * k;
    const dir: 1 | -1 = seg.s1 >= seg.s0 ? 1 : -1;
    const idx = tt.segs.indexOf(seg);
    const nextMove = tt.segs.slice(idx + 1).concat(tt.segs).find((x) => x.move);
    const bound = stopDef(seg.move ? seg.stop : nextMove?.stop ?? seg.stop).name;
    const h = hooks.hour();
    const kind = stopDef(seg.stop).kind;
    let hidden = seg.hidden;
    let sitting = false;
    if (!seg.move) {
      if (kind === 'town') hidden = true;
      else if (kind === 'inn') hidden = h >= 20.5 || h < 6;
      else if (kind === 'camp') sitting = h >= 19 || h < 6.5;
    }
    // Leaving and arriving at a town: out of sight within the gates.
    const c = CHAINS[d.chain];
    if (seg.move && (s < 6 || s > c.len - 6) && (stopDef(seg.stop).kind === 'town' || stopDef(d.plan[0].at).kind === 'town')) hidden = hidden || s < 3 || s > c.len - 3;
    return { s, dir: seg.move ? dir : (nextMove && nextMove.s1 >= nextMove.s0 ? 1 : -1), moving: seg.move, stop: seg.stop, hidden, sitting, bound };
  }

  /** The party's anchor on the road (or at its resting place). */
  function anchor(d: TravellerDef, st: TravellerState, out = new THREE.Vector3()) {
    if (!st.moving) {
      const rest = wayside.rest[st.stop];
      if (rest) return out.copy(rest.look);
      const at = stopDef(st.stop).at;
      return out.set(at[0], heightAt(at[0], at[1]), at[1]);
    }
    chainAt(CHAINS[d.chain], st.s, 0, cp);
    return out.set(cp.x, heightAt(cp.x, cp.z), cp.z);
  }

  function make(d: TravellerDef): Built {
    const b: Built = { def: d, figures: [], mounts: [], packs: [], flock: [], cart: null, carriage: null, hiddenT: 0, barkT: 4 + Math.random() * 6 };
    for (const mem of d.members) {
      b.figures.push(new Figure(scene, mem.look, mem.prop, mem.propColor));
      b.mounts.push(mem.mount ? new Animal(scene, mem.mount, { coat: mem.coat, saddle: mem.saddle ?? 0x6a5a3a }) : null);
    }
    for (let i = 0; i < (d.packs ?? 0); i++) b.packs.push(new Animal(scene, 'donkey', { packs: true }));
    for (let i = 0; i < (d.flock ?? 0); i++) b.flock.push(new Animal(scene, 'sheep'));
    if (d.flock) b.flock.push(new Animal(scene, 'dog'));
    const vh = d.vehicle;
    if (vh?.type === 'carriage') b.carriage = new Carriage(scene, m, vh.paint);
    else if (vh) b.cart = new Cart(scene, m, { animal: vh.type === 'handcart' ? null : vh.animal ?? 'donkey', coat: vh.coat, cargo: vh.cargo, hood: vh.hood, four: vh.four });
    return b;
  }

  function dispose(b: Built) {
    for (const f of b.figures) f?.dispose();
    for (const a of b.mounts) a?.dispose();
    for (const a of [...b.packs, ...b.flock]) a.dispose();
    b.cart?.dispose();
    b.carriage?.dispose();
    if (engaged === b) engaged = null;
  }

  /** Move a thing toward its target at a walking/riding pace; snap if it's far off (time skipped). */
  const approach = (pos: THREE.Vector3, target: THREE.Vector3, maxSpeed: number, dt: number) => {
    const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
    if (d > 40) {
      pos.copy(target);
      return 0;
    }
    const step = Math.min(d, maxSpeed * dt);
    if (d > 1e-4) {
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
    }
    pos.y = heightAt(pos.x, pos.z);
    return step / Math.max(dt, 1e-4);
  };

  /** Where member/animal slot `k` stands: `back` metres behind the leader along the road, `lat` off its right side. */
  const roadSpot = (d: TravellerDef, st: TravellerState, back: number, lat: number, out: THREE.Vector3) => {
    let side = -st.dir * lat;
    // Round the checkpoint barrier while it's down.
    if (d.chain === 'crown' && !hooks.gateOpen()) {
      const g = Math.abs(st.s - back * st.dir - GATE_S);
      if (g < 10) side = Math.sign(side || -1) * (6.6 - g * 0.3);
    }
    chainAt(CHAINS[d.chain], st.s - st.dir * back, side, cp);
    return out.set(cp.x, heightAt(cp.x, cp.z), cp.z);
  };

  function place(b: Built, st: TravellerState, dt: number, player: THREE.Vector3) {
    const d = b.def;
    const held = engaged === b;
    const speedCap = Math.max(d.speed * 2, 3.2);
    const target = new THREE.Vector3();
    const rest = wayside.rest[st.stop];
    const restSeats = rest?.seats ?? [];
    const restLook = rest?.look ?? anchor(d, st, new THREE.Vector3());
    const seatBase = (d.id.length * 7 + d.id.charCodeAt(0)) % Math.max(1, restSeats.length);
    let restIdx = 0;
    const restSpot = (out: THREE.Vector3) => {
      if (restSeats.length) out.copy(restSeats[(seatBase + restIdx) % restSeats.length]);
      else {
        const a = stopDef(st.stop).at;
        const ang = (seatBase + restIdx) * 1.3;
        out.set(a[0] + Math.cos(ang) * (2 + restIdx * 0.6), 0, a[1] + Math.sin(ang) * (2 + restIdx * 0.6));
      }
      restIdx++;
      if (!st.sitting) out.lerp(restLook, 0.18);
      return out.setY(heightAt(out.x, out.z));
    };
    // Parked vehicles and animals stand a little off the road by the stop.
    const parkSpot = (k: number, out: THREE.Vector3) => {
      chainAt(CHAINS[d.chain], sAt(d.chain, st.stop) + (k - 1) * 4, (k % 2 ? 1 : -1) * 7.5, cp);
      return out.set(cp.x, heightAt(cp.x, cp.z), cp.z);
    };

    // Vehicle.
    const veh = b.cart ?? b.carriage;
    if (veh) {
      if (st.moving) roadSpot(d, st, 0, 1.7, target);
      else parkSpot(0, target);
      const sp = held ? 0 : approach(veh.pos, target, speedCap, dt);
      if (sp > 0.05) veh.yaw = dampYaw(veh.yaw, Math.atan2(target.x - veh.pos.x + cp.dx * st.dir * 0.01, target.z - veh.pos.z + cp.dz * st.dir * 0.01), dt);
      if (st.moving && sp > 0.05) veh.yaw = dampYaw(veh.yaw, Math.atan2(cp.dx * st.dir, cp.dz * st.dir), dt);
      veh.speed = sp;
      veh.update(dt);
    }
    // People (and their mounts).
    let walkerK = 0;
    d.members.forEach((mem, i) => {
      const f = b.figures[i];
      if (!f) return;
      const mount = b.mounts[i];
      if (mem.seat === 'box' && b.carriage) {
        // The coachman sits on the box while the coach rolls, and stands by the horses when it stops.
        if (st.moving) {
          const c = b.carriage;
          const local = new THREE.Vector3(0, 0, 1.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
          f.pos.set(c.pos.x + local.x, c.pos.y + 0.95, c.pos.z + local.z);
          f.yaw = c.yaw;
          f.lift = 0;
          f.play('sit');
          f.visible = true;
          f.update(dt);
          return;
        }
      }
      if (mem.seat === 'inside' && b.carriage && st.moving) {
        f.visible = false;
        f.pos.copy(b.carriage.pos);
        return;
      }
      f.visible = true;
      if (st.moving) {
        if (mount) roadSpot(d, st, (b.cart || b.carriage ? 6 : 0) + walkerK * 3.6, walkerK % 2 ? 0.6 : 1.9, target);
        else if (veh) roadSpot(d, st, i === 0 ? -2.6 : 3.4 + walkerK * 1.4, i === 0 ? 0.3 : 1.4, target);
        else roadSpot(d, st, walkerK * 1.5, 1.7 + (walkerK % 2) * 0.9, target);
        walkerK++;
      } else restSpot(target);
      // Step round the player rather than through them.
      const pd = Math.hypot(target.x - player.x, target.z - player.z);
      if (pd < 1.6 && !held) {
        target.x += ((target.x - player.x) / (pd || 1)) * (1.6 - pd);
        target.z += ((target.z - player.z) / (pd || 1)) * (1.6 - pd);
      }
      const body = mount ?? f;
      const sp = held ? 0 : approach(body.pos, target, mount ? Math.max(speedCap, 6) : speedCap, dt);
      if (sp > 0.05) body.yaw = dampYaw(body.yaw, Math.atan2(target.x - body.pos.x + (st.moving ? cp.dx * st.dir : 0), target.z - body.pos.z + (st.moving ? cp.dz * st.dir : 0)), dt);
      else if (!st.moving) body.yaw = dampYaw(body.yaw, Math.atan2(restLook.x - body.pos.x, restLook.z - body.pos.z), dt);
      if (held && i === 0) body.yaw = dampYaw(body.yaw, Math.atan2(player.x - body.pos.x, player.z - body.pos.z), dt);
      if (mount) {
        mount.speed = sp;
        if (!st.moving && sp < 0.1) {
          // Dismounted at rest: the horse waits nearby, the rider sits or stands.
          parkSpot(i + 1, tmp);
          mount.pos.copy(tmp);
          mount.gait(true);
          mount.update(dt);
          f.ride = 0;
          f.lift = 0;
          approach(f.pos, target, speedCap, dt);
          f.yaw = dampYaw(f.yaw, Math.atan2(restLook.x - f.pos.x, restLook.z - f.pos.z), dt);
          f.play(st.sitting && f.pos.distanceTo(target) < 0.5 ? 'sit' : held ? 'talk' : 'idle');
        } else {
          mount.gait();
          mount.update(dt);
          f.pos.copy(mount.pos);
          f.yaw = mount.yaw;
          f.ride = mount.kind === 'donkey' ? 0.6 : 1;
          f.lift = 0.5 * (mount.height / 1.72);
          f.play(held && i === 0 ? 'talk' : 'idle');
        }
      } else {
        const sitNow = !st.moving && st.sitting && f.pos.distanceTo(target) < 0.5;
        f.play(held ? 'talk' : sp > 2.8 ? 'jog' : sp > 0.25 ? 'walk' : sitNow ? 'sit' : st.moving ? 'idle' : (i + Math.floor(hooks.hour() * 2)) % 3 === 0 ? 'talk' : 'idle', sp > 0.25 && sp <= 2.8 ? Math.max(0.6, sp / 1.25) : 1);
      }
      f.update(dt, f.pos.distanceTo(player) < 60);
    });
    // Pack animals on a lead behind, the flock ahead (the dog at the back).
    b.packs.forEach((a, k) => {
      if (st.moving) roadSpot(d, st, 2.2 + k * 2.3 + (d.members.length - 1) * 1.5, 1.4, target);
      else parkSpot(k + 2, target);
      const sp = held ? 0 : approach(a.pos, target, speedCap, dt);
      a.speed = sp;
      if (sp > 0.05) a.yaw = dampYaw(a.yaw, Math.atan2(target.x - a.pos.x + cp.dx * st.dir * 0.2, target.z - a.pos.z + cp.dz * st.dir * 0.2), dt);
      a.gait(!st.moving);
      a.update(dt);
    });
    const t = performance.now() / 1000;
    b.flock.forEach((a, k) => {
      const dog = a.kind === 'dog';
      if (st.moving) roadSpot(d, st, dog ? 3 : -2.5 - (k % 4) * 1.3, dog ? 3.2 : 0.5 + (k % 3) * 1.1 + Math.sin(t * 0.7 + k) * 0.5, target);
      else {
        const c = parkSpot(4, tmp);
        target.set(c.x + Math.cos(k * 2.4) * 3, 0, c.z + Math.sin(k * 2.4) * 3);
      }
      const sp = held ? 0 : approach(a.pos, target, speedCap * 1.2, dt);
      a.speed = sp;
      if (sp > 0.05) a.yaw = dampYaw(a.yaw, Math.atan2(target.x - a.pos.x + cp.dx * st.dir * 0.3, target.z - a.pos.z + cp.dz * st.dir * 0.3), dt);
      a.gait(!st.moving);
      a.update(dt);
    });
  }

  const dampYaw = (a: number, b: number, dt: number) => {
    let d = b - a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return a + d * (1 - Math.exp(-6 * dt));
  };

  // ---- talking --------------------------------------------------------------------------------------
  const pos = new THREE.Vector3(0, -999, 0);
  let near: { b: Built; i: number } | null = null;

  const rumour = (d: TravellerDef) => {
    const q = hooks.quests;
    const pool: string[] = [];
    if (q && !q.isDone('red-hand')) pool.push('Red Morwen’s lot hold the old watchtower past Thornfield. There’s a Crown bounty on her, if you’re the bounty sort.');
    else pool.push('They say someone finally put Red Morwen in the ground. The road past Thornfield’s been easier since.');
    if (q && !q.isDone('bonebreaker')) pool.push('Gorrak’s warcamp is out in the marches past the Kingsmile. Burnt the Ashby farm; the family’s camped by the road now.');
    if (q && !q.isDone('rl-silk-steel')) pool.push('There’s a Red Hand crew holed up in old Fort Rennick on the Queen’s Road. Garrick Vell at the Wayfork lost his whole stock to them.');
    if (q && !q.isDone('rl-hedge-knight')) pool.push('A hedge knight’s camped past the checkpoint, Ser Tobin. Strikes up a bout with anyone who hits his shield. Pays if he loses, which is often.');
    if (q && !q.isDone('rl-wardlights')) pool.push('Old Wendel, the hermit in the south wood, keeps on about the old lights along the Crown Road. Says someone ought to light them.');
    const days = (3 - (hooks.day() % 3)) % 3;
    pool.push(days === 0 ? 'It’s market day at the Wayfork! Lio’s playing and Bessa’s doing honey cakes.' : `Market day at the Wayfork is in ${days} day${days > 1 ? 's' : ''}. Best prices on the road.`);
    if (q && !q.isDone('crown-tourney')) pool.push('The Grand Marshal holds a tourney at the Commandery. Anyone with a sword and nerve can ask for a bout.');
    pool.push('Mags Turnpenny at Halfpenny Bridge lost her strongbox in the flood. Turned the ford over twice looking.');
    pool.push('The barrow by the road walks after dark. The Collegium sends a scholar to measure the stones. By daylight.');
    if (renown.tier >= 2) pool.push(`Everyone on the road knows you, you know. ${renown.rank.replace(/^a /, 'A ')}, they call you at the Kingsmile.`);
    return pool[(hooks.day() * 5 + Math.floor(hooks.hour()) + d.id.length) % pool.length];
  };

  function talk(b: Built, i: number) {
    const d = b.def;
    const mem = d.members[i];
    const leader = i === 0 || mem.seat === 'inside';
    const name = leader ? d.name : mem.name ?? d.name;
    const title = leader ? d.title : d.title;
    engaged = b;
    const show = (t: string, o: DialogueOption[]) => hooks.talk(name, title, t, o);
    const back = () => talk(b, i);
    const st = stateOf(d);
    const greet = renown.tier >= 2 && leader ? `${d.lines[Math.floor(hooks.hour()) % d.lines.length]}\n\n(${name} knows your face: you’re ${renown.rank} on these roads.)` : leader ? d.lines[(Math.floor(hooks.hour() * 2) + hooks.day()) % d.lines.length] : d.greet[Math.floor(hooks.hour()) % d.greet.length];
    show(greet, [
      ...(leader ? hooks.quests?.options(d.id, show, back) ?? [] : []),
      { label: 'Any news from the road?', run: () => show(rumour(d), [{ label: 'Thanks.', run: back }]) },
      { label: 'Where are you headed?', run: () => show(st.moving ? `${stopDef(st.stop).name[0].toUpperCase() + stopDef(st.stop).name.slice(1)}, if the road’s kind.` : `We rest here a while, at ${stopDef(st.stop).name}. Then on to ${st.bound}.`, [{ label: 'Safe travels, then.', run: back }]) },
      ...(d.trade && leader ? [{ label: 'Let’s trade', run: () => hooks.shop(d.name, d.title, d.trade!.intro, d.trade!.stock.map(([id, p]) => [id, renown.price(p)] as [string, number])) }] : []),
      { label: 'Safe travels.', run: () => { hooks.close(); engaged = null; } },
    ]);
  }

  const interactable: Travellers['interactable'] = {
    pos, radius: 2.6,
    label: () => (near ? `Talk to ${near.b.def.members[near.i].seat === 'inside' ? near.b.def.name + ' (at the carriage window)' : near.i === 0 ? near.b.def.name : near.b.def.members[near.i].name ?? near.b.def.name}` : ''),
    enabled: () => !!near,
    action: () => near && talk(near.b, near.i),
    update(p: THREE.Vector3) {
      near = null;
      let best = 2.8;
      for (const b of built.values()) {
        if (b.hiddenT > 0) continue;
        b.def.members.forEach((mem, i) => {
          const f = b.figures[i];
          let at: THREE.Vector3 | null = f && f.visible && f.ready ? f.pos : null;
          if (mem.seat === 'inside' && b.carriage && f && !f.visible) at = b.carriage.pos;
          if (!at) return;
          const dd = Math.hypot(at.x - p.x, at.z - p.z);
          // Couriers at a gallop won't stop.
          if (b.def.courier && b.mounts[i] && b.mounts[i]!.speed > 3) return;
          if (dd < best) (best = dd), (near = { b, i });
        });
      }
      if (near) {
        const f = near.b.figures[near.i];
        pos.copy(f && f.visible ? f.pos : near.b.carriage?.pos ?? f!.pos);
      } else pos.set(0, -999, 0);
    },
  };

  return {
    interactable, barks,
    ids: TRAVELLERS.map((d) => d.id),
    state: (id) => {
      const d = TRAVELLERS.find((x) => x.id === id);
      return d ? stateOf(d) : null;
    },
    npcPos(id) {
      const d = TRAVELLERS.find((x) => x.id === id);
      if (!d) return null;
      const b = built.get(id);
      const f = b?.figures[0];
      if (f && f.visible) return f.pos.clone();
      if (b?.carriage) return b.carriage.pos.clone();
      return anchor(d, stateOf(d));
    },
    npcHead(id) {
      const b = built.get(id);
      if (!b || b.hiddenT > 0 || !visible) return null;
      const f = b.figures[0];
      if (f && f.visible && f.ready) return f.pos.clone().setY(f.pos.y + f.lift + (f.look.height ?? 1.75) + 0.1);
      if (b.carriage) return b.carriage.pos.clone().setY(b.carriage.pos.y + 3);
      return null;
    },
    near(x, z, r) {
      for (const b of built.values()) {
        const f = b.figures[0];
        if (f && Math.hypot(f.pos.x - x, f.pos.z - z) < r) return true;
      }
      return false;
    },
    update(dt, player, mounted) {
      void mounted;
      if (engaged && (!hooks.dialogueOpen() || (engaged.figures[0] && engaged.figures[0]!.pos.distanceTo(player) > 8))) engaged = null;
      // Which parties should exist: the nearest few in range and in sight.
      const want: { d: TravellerDef; st: TravellerState; dist: number }[] = [];
      for (const d of TRAVELLERS) {
        const st = stateOf(d);
        const a = anchor(d, st, tmp);
        const dist = Math.hypot(a.x - player.x, a.z - player.z);
        const has = built.has(d.id);
        if (!st.hidden && dist < (has ? DROP_R : BUILD_R)) want.push({ d, st, dist });
        else if (has) {
          const b = built.get(d.id)!;
          b.hiddenT += dt;
          // Give a party walking in at a gate a moment to reach it before it goes.
          if (dist > DROP_R || b.hiddenT > 2) {
            dispose(b);
            built.delete(d.id);
          }
        }
      }
      want.sort((a, b) => a.dist - b.dist);
      want.slice(MAX_BUILT).forEach(({ d }) => {
        const b = built.get(d.id);
        if (b) {
          dispose(b);
          built.delete(d.id);
        }
      });
      for (const { d, st } of want.slice(0, MAX_BUILT)) {
        let b = built.get(d.id);
        if (!b) {
          b = make(d);
          built.set(d.id, b);
          // Start them where they belong (no walking in from the origin).
          const a = anchor(d, st, new THREE.Vector3());
          for (const f of b.figures) f?.pos.copy(a);
          for (const x of [...b.mounts, ...b.packs, ...b.flock]) x?.pos.copy(a);
          if (b.cart) b.cart.pos.copy(a);
          if (b.carriage) b.carriage.pos.copy(a);
          if (st.moving) {
            chainAt(CHAINS[d.chain], st.s, 0, cp);
            const yaw = Math.atan2(cp.dx * st.dir, cp.dz * st.dir);
            for (const f of b.figures) if (f) f.yaw = yaw;
            for (const x of [...b.mounts, ...b.packs, ...b.flock]) if (x) x.yaw = yaw;
            if (b.cart) b.cart.yaw = yaw;
            if (b.carriage) b.carriage.yaw = yaw;
          }
        }
        b.hiddenT = 0;
        place(b, st, dt, player);
        for (const f of b.figures) if (f && !visible) f.visible = false;
        // The toll pole lifts for them.
        const lead = b.figures[0]?.pos ?? b.carriage?.pos;
        if (lead) wayside.tollTraffic(lead.x, lead.z);
        // A greeting as you pass (couriers shout you out of the way).
        b.barkT -= dt;
        const f0 = b.figures.find((f) => f && f.visible && f.ready) ?? null;
        if (f0 && b.barkT <= 0 && engaged !== b) {
          const dd = f0.pos.distanceTo(player);
          const range = d.courier ? 20 : 7;
          if (dd < range) {
            b.barkT = 70 + Math.random() * 40;
            const line = renown.tier >= 2 && !d.courier && Math.random() < 0.5
              ? ['It’s you! Safe road, friend!', 'There goes the one who helped Mags!', 'Hail, friend of the road!'][Math.floor(Math.random() * 3)]
              : d.greet[Math.floor(Math.random() * d.greet.length)];
            const who = f0;
            barks.say(line, () => (who.visible ? who.pos.clone().setY(who.pos.y + who.lift + (who.look.height ?? 1.75) + 0.35) : null));
          }
        }
      }
      barks.update(dt);
    },
    setVisible(v) {
      visible = v;
      for (const b of built.values()) {
        for (const f of b.figures) if (f) f.visible = v;
        for (const a of [...b.mounts, ...b.packs, ...b.flock]) if (a) a.root.visible = v;
        if (b.cart) b.cart.root.visible = v;
        if (b.carriage) b.carriage.root.visible = v;
      }
      if (!v) barks.clear();
    },
    clear() {
      for (const b of built.values()) dispose(b);
      built.clear();
      barks.clear();
    },
  };
}

