import * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { Interactable } from '../dungeon/instance';
import type { Fauna, Animal, Range } from '../world/fauna';
import type { Farmstead } from '../world/farmstead';
import type { NpcManager } from '../npc/npcManager';
import type { BeastSpawner } from '../enemies/beastSpawner';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { WorldTime } from '../world/worldTime';
import { Rat, CrowFlock } from '../enemies/vermin';
import { heightAt, PLAZA_CENTER } from '../world/terrainHeight';
import { QUARRY, STELE, STANDING_STONES } from '../world/glenLandmarks';

// Elder Glen's side quests (World Expansion phase 3, project notes): the
// farming town's troubles, each with a giver, dialogue, markers, world
// scripting and rewards, plus the first thread of the Sunwheel mystery.

const HEIFER_AT = new THREE.Vector3(-262, 0, 34);
const SCARECROW_AT = new THREE.Vector3(6, 0, 144);
const BUNTING_POLES: [number, number][] = [[-9, -11], [9, 4], [-10, 4]];
const WHEAT_FIELD = new THREE.Vector3(4, 0, 150);
const night = (h: number) => h >= 21 || h < 4;

export const ELDER_GLEN_QUESTS: QuestDef[] = [
  {
    id: 'missing-heifer', title: 'The Missing Heifer', giver: 'hale', region: 'cresha',
    summary: 'Tom Hale\'s heifer Clover broke through the west fence. Find her in the woods and lead her home.',
    offer: 'One of my heifers — Clover, white blaze on her nose — broke through the west fence in the night. She\'ll have wandered into the woods west of the pasture, and there are wolves out there. Bring her home and I\'ll see you right.',
    stages: [
      { note: 'Find Clover in the western woods.', hook: 'heifer:lost', objectives: [{ type: 'reach', at: [HEIFER_AT.x, HEIFER_AT.z], radius: 9, text: 'Find Clover in the western woods' }] },
      { note: 'Lead Clover back to Tom\'s pasture.', hook: 'heifer:follow', objectives: [{ type: 'signal', id: 'heifer-home', text: 'Lead Clover back into the cow pasture', at: [-150, 60] }] },
      { note: 'Tell Tom that Clover is home.', objectives: [{ type: 'talk', npc: 'hale', text: 'Tell Tom Hale that Clover is home', say: 'There she is! Not a scratch on her, the silly thing. You\'ve a way with animals, friend.' }] },
    ],
    done: 'Here — fresh milk from her mother, and coin besides. If you ever want to help on the farm, the cows could use milking every morning.',
    rewards: { gold: 60, xp: 80, items: [['milk', 2]], guildRep: 10 },
  },
  {
    id: 'crows-in-wheat', title: 'Crows in the Wheat', giver: 'wren', region: 'cresha',
    summary: 'Crows are stripping Old Wren\'s wheat field. Run them off, then raise a scarecrow.',
    offer: 'Crows! Dozens of the black thieves, stripping my wheat ear by ear. My knees won\'t let me chase them any more. Run at them, wave your arms — sprinting sends them flying. Then we\'ll put up a proper scarecrow.',
    stages: [
      { note: 'Scare the crows off Wren\'s wheat (sprint at them).', hook: 'crows:land', objectives: [{ type: 'signal', id: 'crow-scared', count: 12, text: 'Scare crows from the wheat', at: [WHEAT_FIELD.x, WHEAT_FIELD.z] }] },
      { note: 'Raise the scarecrow in the field.', objectives: [{ type: 'signal', id: 'scarecrow', text: 'Raise the scarecrow in the wheat', at: [SCARECROW_AT.x, SCARECROW_AT.z] }] },
      { note: 'Tell Wren the field is safe.', objectives: [{ type: 'talk', npc: 'wren', text: 'Tell Old Wren the field is safe', say: 'Ha! Look at that fellow standing guard. The crows won\'t come back while he\'s there.' }] },
    ],
    done: 'Take these seeds — carrot and wheat from my own stock. If you plant them in that plot by the granaries, you\'ll eat well this winter.',
    rewards: { gold: 50, xp: 70, items: [['wheatSeed', 4], ['carrotSeed', 4]] },
  },
  {
    id: 'mill-wheel-jam', title: 'Mill Wheel Jam', giver: 'oswin', region: 'cresha',
    summary: 'Driftwood has jammed the watermill\'s wheel. Get oak planks from Bram the carpenter and pry it loose.',
    offer: 'Hear that? Nothing. The wheel\'s stopped dead — the spring flood drove driftwood right through the paddles. I need oak planks to brace the housing while I pry it loose. Bram Oakhand the carpenter will have some. Would you fetch them?',
    stages: [
      { note: 'Get oak planks from Bram Oakhand, the carpenter.', objectives: [{ type: 'talk', npc: 'carpenter', text: 'Ask Bram Oakhand for oak planks', reply: 'Oswin needs planks for the mill wheel.', say: 'Oswin\'s wheel again? Here — four good seasoned planks. Tell him he owes me a sack of flour.', give: [['planks', 4]] }] },
      { note: 'Brace the housing and clear the driftwood from the waterwheel.', objectives: [{ type: 'signal', id: 'wheel-cleared', text: 'Clear the driftwood from the waterwheel', at: [0, 0] }] },
      { note: 'Tell Oswin the wheel is free.', objectives: [{ type: 'talk', npc: 'oswin', text: 'Tell Oswin the wheel is turning', say: 'Listen to that! Water on the paddles, stones grinding. You\'ve saved the week\'s bread.' }] },
    ],
    done: 'For your trouble. And there\'ll always be a loaf for you at the Sunlit Bakery — Tessa gets her flour from me.',
    rewards: { gold: 70, xp: 90, items: [['healthPotion', 2]] },
  },
  {
    id: 'granary-rats', title: 'Granary Rats', giver: 'dora', region: 'cresha',
    summary: 'Rats are eating the grain meant for Port Aurelle. Clear them from the granaries.',
    offer: 'Rats. In my granaries. Bold as brass and fat as cats, and they\'re eating the grain we owe Port Aurelle. Clear them out before the caravan comes, would you? They bite, mind.',
    stages: [
      { note: 'Kill the rats around the granaries.', hook: 'rats:spawn', objectives: [{ type: 'kill', kind: 'rat', count: 8, text: 'Kill the granary rats', at: [0, 118], radius: 90 }] },
      { note: 'Tell Dora the granaries are clear.', objectives: [{ type: 'talk', npc: 'dora', text: 'Tell Dora Sheaf the rats are gone', say: 'Not a squeak. Every sack counted and every sack whole.' }] },
    ],
    done: 'The Glen owes you. If you\'re ever headed to Port Aurelle, the caravan master will hear your name from me.',
    rewards: { gold: 45, xp: 70, guildRep: 10 },
  },
  {
    id: 'herbalist-list', title: 'The Herbalist\'s List', giver: 'apothecary', region: 'cresha',
    summary: 'Ilyra Moss needs herbs to restock the apothecary: Sungrass, Moongrass, Wild Mint and Ironleaf.',
    offer: 'My shelves are bare and the guild wants draughts by the dozen. I need three Sungrass, two Moongrass, three Wild Mint and two Ironleaf. They grow along the roadsides and down the King\'s Road east. Moongrass likes the river and shows best at night.',
    stages: [
      { note: 'Gather herbs for Ilyra.', objectives: [
        { type: 'collect', item: 'sungrass', count: 3, text: 'Gather Sungrass' },
        { type: 'collect', item: 'moongrass', count: 2, text: 'Gather Moongrass' },
        { type: 'collect', item: 'wildmint', count: 3, text: 'Gather Wild Mint' },
        { type: 'collect', item: 'ironleaf', count: 2, text: 'Gather Ironleaf' },
      ] },
      { note: 'Bring the herbs to Ilyra Moss.', objectives: [{ type: 'talk', npc: 'apothecary', text: 'Bring the herbs to Ilyra Moss', reply: 'I have your herbs.', say: 'Oh, these are good — look at the colour on that Sungrass. I\'ll have draughts brewing by nightfall.', take: [['sungrass', 3], ['moongrass', 2], ['wildmint', 3], ['ironleaf', 2]] }] },
    ],
    done: 'Take a few of the first batch. And if you\'ve a mind for plants, I could teach you a thing or two about herb-lore one day.',
    rewards: { gold: 60, xp: 90, items: [['healthPotion', 3], ['manaPotion', 2]] },
  },
  {
    id: 'smiths-ore-run', title: 'Smith\'s Ore Run', giver: 'froest', region: 'cresha',
    summary: 'Fröst needs iron ore from the old quarry in the northern hills. Goblins have been denning there.',
    offer: 'The ore wagons from the port are late again, and my forge eats iron like a dragon eats sheep. The old quarry in the northern hills still has iron in its bones. Bring me five lumps of ore. Mind yourself — goblins have been using the place as a den.',
    stages: [
      { note: 'Go to the old quarry in the northern hills.', objectives: [{ type: 'reach', at: [QUARRY.x, QUARRY.z], radius: 18, text: 'Find the old quarry in the northern hills' }] },
      { note: 'Mine five lumps of iron ore.', hook: 'quarry:goblins', objectives: [{ type: 'collect', item: 'ironOre', count: 5, text: 'Mine iron ore', at: [QUARRY.x, QUARRY.z] }] },
      { note: 'Bring the ore back to Master Fröst.', objectives: [{ type: 'deliver', npc: 'froest', item: 'ironOre', count: 5, text: 'Bring 5 iron ore to Master Fröst', say: 'Good red ore, heavy in the hand. This will make honest steel.' }] },
    ],
    done: 'Here\'s your pay. And when you want a proper blade, you know where the forge is.',
    rewards: { gold: 110, xp: 110, items: [['healthPotion', 2]] },
  },
  {
    id: 'harvest-festival', title: 'Harvest Festival Prep', giver: 'maud', region: 'cresha',
    summary: 'Help Elder Maud get the Harvest Festival ready: wheat for the bakery, apples for the inn, bunting for the plaza.',
    offer: 'The Harvest Festival is upon us and nothing is ready! Tessa needs wheat for the festival loaves, Mara at the Wayfarer needs apples for cider, and the plaza needs its bunting. Help an old woman out, and you\'ll dance with the whole valley tonight.',
    stages: [
      { note: 'Bring in wheat from the fields and pick apples in the orchard.', objectives: [
        { type: 'collect', item: 'wheat', count: 10, text: 'Help bring in wheat (south fields)', at: [WHEAT_FIELD.x, WHEAT_FIELD.z - 20] },
        { type: 'collect', item: 'apple', count: 6, text: 'Pick apples (north-east orchard)', at: [100, -96] },
      ] },
      { note: 'Deliver the wheat to Tessa and the apples to Mara.', objectives: [
        { type: 'deliver', npc: 'baker', item: 'wheat', count: 10, text: 'Bring 10 wheat to Tessa Rowan', say: 'Ten fat sheaves! The festival loaves will be the talk of the valley.' },
        { type: 'deliver', npc: 'innkeeper', item: 'apple', count: 6, text: 'Bring 6 apples to Mara Bell', say: 'Lovely. Cider by sundown, if the press behaves.' },
      ] },
      { note: 'Collect the bunting from Vela the tailor.', objectives: [{ type: 'talk', npc: 'tailor', text: 'Collect the bunting from Vela Thread', reply: 'Elder Maud sent me for the festival bunting.', say: 'All stitched and ready. Three strings — one for each lamp post round the plaza.', give: [['bunting', 3]] }] },
      { note: 'Hang the bunting around the plaza.', objectives: [{ type: 'signal', id: 'bunting', count: 3, text: 'Hang bunting on the plaza lamp posts', at: [PLAZA_CENTER.x, PLAZA_CENTER.y] }] },
      { note: 'Join the festival on the plaza at dusk.', hook: 'festival:on', objectives: [
        { type: 'hour', from: 19, to: 23.5, text: 'Wait for dusk (19:00)' },
        { type: 'reach', at: [PLAZA_CENTER.x, PLAZA_CENTER.y], radius: 14, text: 'Join the festival on the plaza' },
      ] },
      { note: 'Speak with Elder Maud.', objectives: [{ type: 'talk', npc: 'maud', text: 'Speak with Elder Maud', say: 'Look at them all — every farmer, every child, even Captain Brannoc tapping his foot. This is what Elder Glen is.' }] },
    ],
    done: 'You\'re one of us now, summoned hero or not. Whatever road takes you from here, the Glen will remember.',
    rewards: { gold: 120, xp: 160, items: [['pear', 4]], guildRep: 20 },
  },
  {
    id: 'childrens-dare', title: 'The Children\'s Dare', giver: 'pip', region: 'cresha',
    summary: 'Pip was dared to take a rubbing of the old carved stone by the crypt after dark. You could do it for him.',
    offer: 'Nell dared me to go up to the old stone by the crypt after dark and rub the scary circle with charcoal. I\'m NOT doing it. But if YOU did it and gave me the rubbing, Nell would have to give me her best conker. Please?',
    offerHours: [7, 20],
    stages: [
      { note: 'After dark, take a charcoal rubbing of the carved stone by the crypt.', objectives: [
        { type: 'hour', from: 21, to: 4, text: 'Wait until after dark (21:00)' },
        { type: 'signal', id: 'rubbing', text: 'Take a rubbing of the carved stone by the crypt', at: [STELE.x, STELE.z] },
      ] },
      { note: 'Show Pip the rubbing.', objectives: [{ type: 'talk', npc: 'pip', text: 'Show Pip the rubbing', reply: 'Here\'s your rubbing, Pip.', say: 'You DID it! It\'s like a sun with bent legs. Nell\'s going to be SO cross.' }] },
    ],
    done: 'Keep the rubbing, I only need to SEE it. Magus Orren knows about old things — maybe he\'d want to look at it.',
    rewards: { gold: 25, xp: 60 },
  },
  {
    id: 'night-watch', title: 'The Night Watch', giver: 'brannoc', region: 'cresha',
    summary: 'Goblins raid the south fields after dark. Stand watch with the town guard and drive them off.',
    offer: 'Goblins have been raiding the south fields after dark — trampling the wheat, stealing tools, spooking the livestock. My watch is stretched thin. Stand guard at the south fields tonight and drive them off when they come.',
    stages: [
      { note: 'Take position at the south fields after nightfall.', objectives: [
        { type: 'hour', from: 21, to: 3.5, text: 'Wait for nightfall (21:00)' },
        { type: 'reach', at: [WHEAT_FIELD.x, WHEAT_FIELD.z], radius: 32, text: 'Take position at the south fields' },
      ] },
      { note: 'Drive off the goblin raiders.', hook: 'goblins:raid', objectives: [{ type: 'kill', kind: 'cave', count: 6, text: 'Drive off the goblin raiders', at: [WHEAT_FIELD.x, WHEAT_FIELD.z], radius: 160 }] },
      { note: 'Report to Captain Brannoc.', objectives: [{ type: 'talk', npc: 'brannoc', text: 'Report to Captain Brannoc', say: 'Six of them? And not a stalk of wheat lost. You fight like one of the Academy knights.' }] },
    ],
    done: 'The Watch pays its debts. If you\'re bound for Port Aurelle, tell them at the Knight\'s Academy that Brannoc of Elder Glen vouches for you.',
    rewards: { gold: 110, xp: 150, guildRep: 40 },
  },
  {
    id: 'the-sunwheel', title: 'The Sunwheel', giver: 'magus', region: 'cresha', requires: ['childrens-dare'],
    summary: 'Magus Orren believes the crypt stone\'s carving is older than Cresha. A ring of standing stones in the north-western hills may hold the same mark.',
    offer: 'May I see that rubbing? … Extraordinary. This mark is older than Cresha, older than the crypt the orcs have taken. There is a ring of standing stones on the hills north-west of here, past the woods. Find it, and tell me whether the same wheel is carved there.',
    stages: [
      { note: 'Find the standing stones in the north-western hills.', objectives: [{ type: 'reach', at: [STANDING_STONES.x, STANDING_STONES.z], radius: 14, text: 'Find the standing stones in the north-western hills' }] },
      { note: 'Study the carving on the central stone.', objectives: [{ type: 'signal', id: 'stones-read', text: 'Study the carving on the central stone', at: [STANDING_STONES.x, STANDING_STONES.z] }] },
      { note: 'Tell Magus Orren what you found.', objectives: [{ type: 'talk', npc: 'magus', text: 'Tell Magus Orren what you found', reply: 'The same wheel is on the stones.', say: 'The same wheel… Then the stone by the crypt and the ring on the hill were raised by the same hands, long before any king. I have seen this mark once before, in a book in the Royal Library. The capital may hold the answer.' }] },
    ],
    done: 'Keep your eyes open for the Sunwheel wherever you travel. I suspect it has a great deal to do with why you were brought here.',
    rewards: { gold: 80, xp: 200 },
  },
];

export interface GlenQuestWorld {
  quests: QuestLog;
  scene: THREE.Scene;
  fx: FX;
  player: Player;
  time: WorldTime;
  fauna: Fauna;
  cowRange: Range;
  farm: Farmstead;
  npcs: NpcManager;
  beasts: BeastSpawner;
  count(id: string): number;
  take(id: string, n: number): void;
  give(id: string, n: number): void;
  toast(msg: string): void;
}

/** World scripting for the quests above: returns interactables and a per-frame update. */
export function setupElderGlenQuests(w: GlenQuestWorld) {
  const q = w.quests;
  q.add(...ELDER_GLEN_QUESTS);
  const interactables: Interactable[] = [];
  const vec = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

  // ---- The Missing Heifer ---------------------------------------------------------------
  let heifer: Animal | null = null;
  q.hooks.set('heifer:lost', () => {
    if (!heifer) heifer = w.fauna.addOne('cow', vec(HEIFER_AT.x, HEIFER_AT.z), { center: vec(HEIFER_AT.x, HEIFER_AT.z), radius: 6 }, 0.82);
    // Two wolves prowling nearby.
    if (!w.beasts.slimes.some((b) => b.alive && b.position.distanceTo(HEIFER_AT) < 40)) {
      w.beasts.spawn('green', HEIFER_AT.x + 22, HEIFER_AT.z - 10);
      w.beasts.spawn('green', HEIFER_AT.x + 18, HEIFER_AT.z + 14);
    }
  });
  q.hooks.set('heifer:follow', () => {
    if (!heifer) heifer = w.fauna.addOne('cow', vec(HEIFER_AT.x, HEIFER_AT.z), { center: vec(HEIFER_AT.x, HEIFER_AT.z), radius: 6 }, 0.82);
    heifer.follow = w.player.pos;
    w.toast('Clover lows and starts to follow you.');
  });
  q.hooks.set('missing-heifer:done', () => {
    if (heifer) {
      heifer.follow = null;
      heifer.range = w.cowRange;
    } else heifer = w.fauna.addOne('cow', vec(w.cowRange.center.x, w.cowRange.center.z), w.cowRange, 0.82);
  });

  // ---- Crows in the Wheat ---------------------------------------------------------------
  const flock = new CrowFlock(w.scene, vec(WHEAT_FIELD.x, WHEAT_FIELD.z), 30, 15);
  flock.onScare = () => q.signal('crow-scared');
  let crowsActive = false;
  q.hooks.set('crows:land', () => {
    crowsActive = true;
  });
  const scarecrow = buildScarecrow();
  scarecrow.position.copy(vec(SCARECROW_AT.x, SCARECROW_AT.z));
  scarecrow.visible = false;
  w.scene.add(scarecrow);
  interactables.push({
    pos: vec(SCARECROW_AT.x, SCARECROW_AT.z), radius: 2.6,
    label: () => (q.wants('scarecrow') ? 'Raise the scarecrow' : ''),
    enabled: () => q.wants('scarecrow'),
    action: () => {
      scarecrow.visible = true;
      w.fx.dust(scarecrow.position, 1);
      q.signal('scarecrow');
    },
  });
  q.hooks.set('crows-in-wheat:done', () => {
    scarecrow.visible = true;
    crowsActive = false;
    flock.clear();
  });

  // ---- Mill Wheel Jam ---------------------------------------------------------------------
  w.farm.setWheelJammed(true);
  const wheelSpot = w.farm.wheelPos.clone().add(new THREE.Vector3(-3.2, 0, 2.6));
  wheelSpot.y = heightAt(wheelSpot.x, wheelSpot.z);
  const jamObjective = ELDER_GLEN_QUESTS.find((d) => d.id === 'mill-wheel-jam')!.stages[1].objectives[0];
  if (jamObjective.type === 'signal') jamObjective.at = [wheelSpot.x, wheelSpot.z];
  interactables.push({
    pos: wheelSpot, radius: 3.2,
    label: () => (!q.wants('wheel-cleared') ? '' : w.count('planks') >= 4 ? 'Brace the housing and pry the driftwood loose' : 'The wheel is jammed with driftwood (you need planks)'),
    enabled: () => q.wants('wheel-cleared') && w.count('planks') >= 4,
    action: () => {
      w.take('planks', 4);
      w.farm.setWheelJammed(false);
      w.fx.add.spawn({ pos: w.farm.wheelPos.clone(), spread: 2.5, count: 60, life: [0.4, 0.9], size: [0.12, 0.02], color: 0xcfe8ff, color2: 0x7fb6e0, gravity: 9, upBias: 1.2 });
      q.signal('wheel-cleared');
    },
  });
  q.hooks.set('mill-wheel-jam:done', () => w.farm.setWheelJammed(false));

  // ---- Granary Rats ------------------------------------------------------------------------
  const rats: Rat[] = [];
  q.hooks.set('rats:spawn', () => {
    for (const r of rats) r.dispose();
    rats.length = 0;
    for (let k = 0; k < 8; k++) {
      const gx = k % 2 ? 42 : -42;
      const a = k * 1.7;
      const p = vec(gx + Math.cos(a) * 5, 120 + Math.sin(a) * 4);
      rats.push(new Rat(p, w.scene, w.fx, vec(gx, 120)));
    }
  });

  // ---- Smith's Ore Run -------------------------------------------------------------------
  q.hooks.set('quarry:goblins', () => {
    if (w.beasts.slimes.some((b) => b.alive && b.position.distanceTo(QUARRY) < 45)) return;
    w.beasts.spawn('cave', QUARRY.x - 6, QUARRY.z - 4);
    w.beasts.spawn('cave', QUARRY.x + 7, QUARRY.z - 6);
  });

  // ---- Harvest Festival --------------------------------------------------------------------
  const bunting: THREE.Group[] = [];
  const hung = new Set<number>();
  BUNTING_POLES.forEach(([x, z], i) => {
    const g = buildBunting(x, z, i);
    g.visible = false;
    w.scene.add(g);
    bunting.push(g);
    interactables.push({
      pos: vec(x, z), radius: 2.4,
      label: () => (q.wants('bunting') && !hung.has(i) ? (w.count('bunting') ? 'Hang the bunting' : 'Hang bunting here (get it from Vela)') : ''),
      enabled: () => q.wants('bunting') && !hung.has(i) && w.count('bunting') > 0,
      action: () => {
        hung.add(i);
        g.visible = true;
        w.take('bunting', 1);
        q.signal('bunting');
      },
    });
  });
  q.hooks.set('festival:on', () => {
    for (const b of bunting) b.visible = true;
    w.npcs.festivalDay = w.time.hour < 23.5 ? w.time.day : w.time.day + 1;
  });
  q.hooks.set('harvest-festival:done', () => {
    for (const b of bunting) b.visible = true;
  });

  // ---- The Children's Dare and the Sunwheel --------------------------------------------------
  interactables.push({
    pos: STELE, radius: 2.4,
    label: () => (!q.wants('rubbing') ? 'An old stone, carved with a worn wheel' : night(w.time.hour) ? 'Take a charcoal rubbing' : 'The carving only shows clearly after dark'),
    enabled: () => q.wants('rubbing') && night(w.time.hour),
    action: () => {
      w.give('glyphRubbing', 1);
      q.signal('rubbing');
    },
  });
  interactables.push({
    pos: STANDING_STONES, radius: 3,
    label: () => (q.wants('stones-read') ? 'Study the carving' : 'A wheel of eight bent rays, cut deep into the stone'),
    enabled: () => q.wants('stones-read'),
    action: () => {
      w.toast('The same Sunwheel as the crypt stone. The stone is warm to the touch.');
      q.signal('stones-read');
    },
  });

  // ---- The Night Watch ---------------------------------------------------------------------
  q.hooks.set('goblins:raid', () => {
    const near = w.beasts.slimes.filter((b) => b.alive && b.kind === 'cave' && b.position.distanceTo(WHEAT_FIELD) < 150).length;
    const spots: [number, number][] = [[-70, 196], [-60, 206], [-50, 190], [90, 206], [100, 214], [80, 196]];
    for (let k = near; k < 6; k++) w.beasts.spawn('cave', spots[k][0], spots[k][1]);
  });

  return {
    interactables,
    update(dt: number) {
      // Crows keep landing in small groups until twelve have been scared off.
      if (crowsActive && q.isActive('crows-in-wheat', 0)) {
        if (flock.perched < 4) flock.land(4 - flock.perched);
      } else if (crowsActive && !q.isActive('crows-in-wheat', 0)) crowsActive = false;
      flock.update(dt, w.player.pos, w.player.sprinting);
      for (const r of rats) r.update(dt, w.player);
      for (let i = rats.length - 1; i >= 0; i--) if (rats[i].dead) rats.splice(i, 1);
      // Keep rats coming until eight are down.
      if (q.isActive('granary-rats', 0) && rats.filter((r) => r.alive).length === 0) q.hooks.get('rats:spawn')!(q.defs.get('granary-rats')!);
      if (heifer?.follow && w.fauna.contains(w.cowRange, heifer.pos)) q.signal('heifer-home');
    },
  };
}

function buildScarecrow() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xd9b25e, roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5a6a8a, roughness: 1 });
  const sack = new THREE.MeshStandardMaterial({ color: 0xc9b68a, roughness: 1 });
  const hat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), wood);
  post.position.y = 1.3;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.85;
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.9, 8), cloth);
  coat.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), sack);
  head.position.y = 2.25;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 12), hat);
  brim.position.y = 2.42;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 10), hat);
  crown.position.y = 2.56;
  g.add(post, bar, coat, head, brim, crown);
  for (const s of [-1, 1]) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), straw);
    tuft.rotation.z = s * Math.PI / 2;
    tuft.position.set(s * 1.05, 1.85, 0);
    g.add(tuft);
  }
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}

function buildBunting(x: number, z: number, i: number) {
  const g = new THREE.Group();
  const cols = [0xb8402e, 0xf1e6cc, 0x2f5f9a, 0xe0b040, 0x3d7a45, 0x7a3f8a];
  const y = heightAt(x, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 }));
  pole.position.set(x, y + 2.1, z);
  g.add(pole);
  // Strings run from the pole to the plaza centre in a sagging arc of pennants.
  const cx = PLAZA_CENTER.x, cz = PLAZA_CENTER.y, cy = heightAt(cx, cz) + 4.6;
  for (let s = 0; s < 2; s++) {
    const off = (s - 0.5) * 1.4 + i * 0.3;
    const a = new THREE.Vector3(x, y + 4.1, z);
    const b = new THREE.Vector3(cx + Math.cos(i * 2 + off) * 1.5, cy, cz + Math.sin(i * 2 + off) * 1.5);
    const n = 16;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * 1.2;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), new THREE.MeshStandardMaterial({ color: cols[(k + i) % cols.length], roughness: 0.9, side: THREE.DoubleSide }));
      flag.rotation.x = Math.PI;
      flag.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      flag.position.copy(p).setY(p.y - 0.2);
      g.add(flag);
    }
  }
  return g;
}
